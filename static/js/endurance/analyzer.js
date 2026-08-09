
function analyzerFormatLocalClock(){
 const el=document.getElementById('analyzerWeatherLocalTime');if(!el)return;
 const tz=analyzerWeatherData?.timezone||analyzerWeatherData?.location?.timezone||'Europe/Paris';
 try{el.textContent=new Intl.DateTimeFormat('fr-FR',{timeZone:tz,hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date()).replace(' h ',':')}catch(_){el.textContent=new Date().toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}
}
function analyzerUpdateRaceRemaining(){
 const el=document.getElementById('analyzerRaceRemaining');if(!el)return;
 if(typeof raceUsesLapTarget==='function'&&raceUsesLapTarget()){
  el.textContent=formatRaceLapProgress();el.classList.remove('warning','critical');return;
 }
 const ms=typeof liveRemainingMilliseconds==='function'?liveRemainingMilliseconds():null;
 if(Number.isFinite(ms)){const total=Math.max(0,Math.floor(ms/1000)),h=Math.floor(total/3600),m=Math.floor((total%3600)/60),sec=total%60;el.textContent=`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;el.classList.toggle('warning',total<=3600&&total>600);el.classList.toggle('critical',total<=600);return}
 el.textContent=state?.time_remaining||'—';
}
/* Velocity V6.10.5 — titres alignés, MAP inactive visible et réglages météo */
const ANALYZER_RULES_KEY='kartiq-analyzer-rules-v1';
const ANALYZER_LEARNING_KEY='kartiq-analyzer-learning-v1';
const ANALYZER_DEFAULT_RULES={raceHours:24,requiredStops:28,minStintMinutes:10,maxStintMinutes:60,minPitSeconds:150,pitCloseMinutes:30,safetyMarginMinutes:2,driversCount:6,driverMinimumMinutes:210};

const ANALYZER_SESSIONS_INDEX_KEY='kartiq-analyzer-sessions-index-v1';
const ANALYZER_ACTIVE_SESSION_KEY='kartiq-analyzer-active-session-v1';
const ANALYZER_SESSION_PREFIX='kartiq-analyzer-session-v1:';
const ANALYZER_AUTOSAVE_MS=15000;
const ANALYZER_STORAGE_CLEANUP_KEY='velocity-analyzer-storage-cleanup-v3';
const ANALYZER_MAX_SESSION_INDEX=10;
let analyzerKartSort='none';
let analyzerVelocityView='velocity';
let analyzerRelayScoreData=null;
let analyzerRelayScoreLoading=false;
let analyzerRelayScoreLoadToken=0;
let analyzerRelayScoreScrollLeft=0;
let analyzerRelayScoreScrollBound=false;
let analyzerActiveSessionId=null;
let analyzerSessionCircuitId=null;
let analyzerLastSessionSaveAt=0;
let analyzerSessionAutosaveTimer=null;
let analyzerSessionRestoreLock=false;
let analyzerEventNoticeCircuitId='';
let analyzerEventNoticeInitialized=false;
let analyzerEventNoticeKnownIds=new Set();
let analyzerEventNoticeUnread=new Map();
let analyzerEventNoticePreviousCount=0;

function analyzerEventNoticeNormalizeText(value){return String(value||'').replace(/\s+/g,' ').trim().toLocaleLowerCase('fr-FR')}
function analyzerEventNoticeId(event){
 const explicit=String(event?.id||'').trim();
 if(explicit)return explicit;
 return `${String(event?.time||event?.at||'')}|${String(event?.flag||'')}|${String(event?.kart||'')}|${analyzerEventNoticeNormalizeText(event?.comment||event?.penalty||'')}`;
}
function analyzerEventNoticeClockMinutes(event){
 const value=analyzerPenaltyTimeLabel(event),match=value.match(/^(\d{1,2}):(\d{2})$/);return match?Number(match[1])*60+Number(match[2]):NaN;
}
function analyzerEventNoticeReset(items=[]){
 analyzerEventNoticeKnownIds=new Set(items.map(analyzerEventNoticeId));
 analyzerEventNoticeUnread.clear();
 analyzerEventNoticePreviousCount=items.length;
 analyzerEventNoticeInitialized=true;
 analyzerRenderEventNotice();
}
function analyzerEventNoticeSameInstantMessage(a,b){
 if(String(a?.source||'')!=='msgt')return false;
 if(analyzerEventNoticeNormalizeText(a?.comment||a?.penalty)!==analyzerEventNoticeNormalizeText(b?.comment||b?.penalty))return false;
 const am=analyzerEventNoticeClockMinutes(a),bm=analyzerEventNoticeClockMinutes(b);
 return !Number.isFinite(am)||!Number.isFinite(bm)||Math.abs(am-bm)<=2;
}
function analyzerUpdateEventNotice(items){
 items=Array.isArray(items)?items:[];
 const circuit=String(state?.circuit_id||'');
 if(circuit!==analyzerEventNoticeCircuitId){analyzerEventNoticeCircuitId=circuit;analyzerEventNoticeInitialized=false;analyzerEventNoticeKnownIds=new Set();analyzerEventNoticeUnread.clear();analyzerEventNoticePreviousCount=0;}
 if(!analyzerEventNoticeInitialized){analyzerEventNoticeReset(items);return;}
 // Si le journal disparaît après une session active, considérer le prochain état comme une nouvelle base.
 if(analyzerEventNoticePreviousCount>0&&!items.length){analyzerEventNoticeReset([]);return;}
 for(const event of items){
  const id=analyzerEventNoticeId(event);if(analyzerEventNoticeKnownIds.has(id))continue;
  analyzerEventNoticeKnownIds.add(id);
  // msg|msgt peut précéder com|| de quelques secondes. Quand com|| arrive,
  // remplacer la notification instantanée au lieu de compter deux événements.
  if(String(event?.source||'')==='com'){
   let replacementKey=null;
   for(const [key,pending] of analyzerEventNoticeUnread){if(analyzerEventNoticeSameInstantMessage(pending,event)){replacementKey=key;break}}
   if(replacementKey!==null)analyzerEventNoticeUnread.delete(replacementKey);
  }
  analyzerEventNoticeUnread.set(id,event);
 }
 analyzerEventNoticePreviousCount=items.length;
 analyzerRenderEventNotice();
}
function analyzerRenderEventNotice(){
 const notice=document.getElementById('analyzerEventNotice'),text=document.getElementById('analyzerEventNoticeText'),badge=document.getElementById('analyzerEventNoticeBadge');if(!notice||!text||!badge)return;
 const unread=[...analyzerEventNoticeUnread.values()];
 if(!unread.length){notice.hidden=true;badge.hidden=true;return}
 const penalties=unread.filter(event=>String(event?.kind||'')==='penalty'||String(event?.flag||'')==='penalty');
 const informations=unread.filter(event=>!penalties.includes(event));
 let label='Informations';
 if(penalties.length&&informations.length)label='Pénalité & Informations';
 else if(penalties.length){
  const teams=[...new Set(penalties.map(event=>String(event?.driver||'').trim()).filter(Boolean))];
  if(teams.length===1)label=`Pénalité ${teams[0]}`;
  else if(penalties.length===1&&teams.length===0)label='Pénalité';
  else label='Pénalités';
 }
 text.textContent=label;
 notice.title=`${unread.length} notification${unread.length>1?'s':''} non lue${unread.length>1?'s':''} — ouvrir Pénalités et Informations`;
 notice.hidden=false;
 if(unread.length>1){badge.textContent=String(unread.length);badge.hidden=false}else badge.hidden=true;
}
function openAnalyzerEventNotifications(){
 const target=document.getElementById('analyzerPenaltiesPanel');if(target)target.scrollIntoView({behavior:'smooth',block:'start'});
 analyzerEventNoticeUnread.clear();analyzerRenderEventNotice();
}

// Trafic devant : suivi persistant des passages de ligne et des cercles DOM.
const analyzerTrafficMotion=new Map();
const analyzerTrafficNodes=new Map();
const ANALYZER_TRAFFIC_HYSTERESIS_SECONDS=10.5;

function analyzerResetTrafficState(){
 analyzerTrafficMotion.clear();
 analyzerTrafficNodes.forEach(node=>{try{node?.remove?.()}catch(_){}});
 analyzerTrafficNodes.clear();
 const host=document.getElementById('analyzerTrafficDots');
 if(host)host.replaceChildren();
}



const ANALYZER_WEATHER_REFRESH_MS=300000;
let analyzerWeatherCircuitId='';
let analyzerWeatherData=null;
let analyzerWeatherLoading=false;
let analyzerWeatherLastFetch=0;
let analyzerWeatherTimer=null;

function analyzerWeatherFormatHour(value){
 if(!value)return '—';
 const date=new Date(value);
 if(Number.isNaN(date.getTime()))return String(value).slice(11,16)||'—';
 return date.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
}
function analyzerWeatherMinutesUntil(value){
 const date=new Date(value);if(Number.isNaN(date.getTime()))return null;return Math.max(0,Math.round((date.getTime()-Date.now())/60000));
}
function analyzerWeatherRiskClass(probability, precipitation){
 const p=Number(probability),mm=Number(precipitation);
 if((Number.isFinite(p)&&p>=70)||(Number.isFinite(mm)&&mm>=1))return 'risk-high';
 if((Number.isFinite(p)&&p>=50)||(Number.isFinite(mm)&&mm>=.4))return 'risk-medium';
 if((Number.isFinite(p)&&p>=20)||(Number.isFinite(mm)&&mm>0))return 'risk-low';
 return 'risk-none';
}
function renderAnalyzerWeatherTimeline(timeline){
 const container=document.getElementById('analyzerWeatherTimeline');if(!container)return;
 if(!Array.isArray(timeline)||!timeline.length){container.innerHTML='<div class="weather-timeline-empty">Prévisions horaires indisponibles.</div>';return}
 container.innerHTML=timeline.slice(0,12).map(slot=>{
  const temperature=Number(slot.temperature),probability=Number(slot.probability),precipitation=Number(slot.precipitation||slot.rain||0);
  const time=slot.display_time||analyzerWeatherFormatHour(slot.time);
  const icon=slot.icon||'cloudy';
  const hasProbability=slot.probability!==null&&slot.probability!==undefined&&Number.isFinite(probability);
  const risk=analyzerWeatherRiskClass(hasProbability?probability:NaN,precipitation);
  const rainText=hasProbability?`💧 ${Math.round(probability)}%`:`💧 ${Number.isFinite(precipitation)?precipitation.toFixed(1):'—'} mm`;
  return `<div class="weather-slot ${risk}" title="${analyzerEscape(slot.label||'Conditions météo')}">
   <div class="weather-slot-time">${analyzerEscape(time)}</div>
   <img class="weather-slot-icon" src="/static/assets/weather/${analyzerEscape(icon)}.svg" alt="${analyzerEscape(slot.label||'Météo')}">
   <div class="weather-slot-rain">${rainText}</div>
   <div class="weather-slot-temp">${Number.isFinite(temperature)?Math.round(temperature)+'°':'—'}</div>
  </div>`;
 }).join('');
}
function renderAnalyzerWeather(){analyzerFormatLocalClock();
 const card=document.getElementById('analyzerWeatherCard');if(!card)return;
 const circuitNameEl=document.getElementById('analyzerWeatherCircuitName');if(circuitNameEl)circuitNameEl.textContent=analyzerWeatherData?.circuit_name||analyzerWeatherData?.location?.name||analyzerSessionCircuitName()||'—';
 const icon=document.getElementById('analyzerWeatherIcon');
 const temp=document.getElementById('analyzerWeatherTemperature');
 const condition=document.getElementById('analyzerWeatherCondition');
 const wind=document.getElementById('analyzerWeatherWind');
 const rain=document.getElementById('analyzerWeatherRain');
 card.classList.remove('weather-alert','weather-wet','weather-loading');
 if(analyzerWeatherLoading&&!analyzerWeatherData){card.classList.add('weather-loading');temp.textContent='…';condition.textContent='Chargement météo';wind.textContent='—';rain.textContent='—';renderAnalyzerWeatherTimeline([]);return}
 if(!analyzerWeatherData){temp.textContent='—';condition.textContent='Météo indisponible';wind.textContent='—';rain.textContent='—';const timeline=document.getElementById('analyzerWeatherTimeline');if(timeline)timeline.innerHTML=`<div class="weather-timeline-empty">${analyzerSessionCircuit()?'Nouvelle tentative automatique dans quelques minutes.':'Sélectionnez un circuit pour charger la météo.'}</div>`;return}
 const current=analyzerWeatherData.current||{};
 const temperature=Number(current.temperature);temp.textContent=Number.isFinite(temperature)?`${Math.round(temperature)}°C`:'—';
 condition.textContent=current.label||'Conditions variables';
 icon.src=`/static/assets/weather/${current.icon||'cloudy'}.svg`;icon.alt=current.label||'Conditions météo';
 const windSpeed=Number(current.wind_speed),gust=Number(current.wind_gusts);
 wind.textContent=Number.isFinite(windSpeed)?`${Math.round(windSpeed)} km/h${Number.isFinite(gust)&&gust>windSpeed+8?` · raf. ${Math.round(gust)}`:''}`:'—';
 const precipitation=Number(current.precipitation||current.rain||0);rain.textContent=precipitation>0?`${precipitation.toFixed(1)} mm`:'0 mm';
 if(precipitation>0)card.classList.add('weather-wet');
 const timeline=analyzerWeatherData.timeline||[];
 if(timeline.some(slot=>Number(slot.probability)>=70||Number(slot.precipitation||slot.rain||0)>=1))card.classList.add('weather-alert');
 renderAnalyzerWeatherTimeline(timeline);
}
async function loadAnalyzerWeather(force=false){
 const circuitId=analyzerSessionCircuit();
 if(!circuitId){analyzerWeatherCircuitId='';analyzerWeatherData=null;renderAnalyzerWeather();return}
 const now=Date.now();
 if(!force&&analyzerWeatherLoading)return;
 if(!force&&analyzerWeatherCircuitId===circuitId&&analyzerWeatherData&&now-analyzerWeatherLastFetch<ANALYZER_WEATHER_REFRESH_MS)return;
 analyzerWeatherLoading=true;analyzerWeatherCircuitId=circuitId;renderAnalyzerWeather();
 try{
  const response=await fetch(`/api/weather?circuit_id=${encodeURIComponent(circuitId)}&_=${Date.now()}`,{cache:'no-store',headers:{'Cache-Control':'no-cache'}});
  const payload=await response.json();
  if(!response.ok||payload?.ok===false)throw new Error(payload?.error||'Météo indisponible');
  if(analyzerWeatherCircuitId!==circuitId)return;
  const weather=payload?.weather&&typeof payload.weather==='object'?payload.weather:payload;
  const timelineCandidates=[weather?.timeline,weather?.hourly,weather?.forecast,payload?.timeline,payload?.hourly,payload?.forecast];
  const timeline=timelineCandidates.find(value=>Array.isArray(value)&&value.length)||[];
  analyzerWeatherData={...(weather||{}),timeline};
  console.info('[Velocity météo]',{source:analyzerWeatherData.source,timeline:timeline.length,debug:analyzerWeatherData.hourly_debug});
  analyzerWeatherLastFetch=Date.now();
 }
 catch(error){console.warn('[Velocity météo]',error);if(analyzerWeatherCircuitId===circuitId)analyzerWeatherData=null;}
 finally{if(analyzerWeatherCircuitId===circuitId){analyzerWeatherLoading=false;renderAnalyzerWeather();}}
}
function ensureAnalyzerWeather(){
 const circuitId=analyzerSessionCircuit();
 if(circuitId!==analyzerWeatherCircuitId){analyzerWeatherData=null;analyzerWeatherLastFetch=0;loadAnalyzerWeather(true);}
 else if(circuitId&&Date.now()-analyzerWeatherLastFetch>=ANALYZER_WEATHER_REFRESH_MS)loadAnalyzerWeather();
 if(!analyzerWeatherTimer)analyzerWeatherTimer=setInterval(()=>loadAnalyzerWeather(),ANALYZER_WEATHER_REFRESH_MS);
}


function analyzerStorageCompactLearning(source=analyzerLearning){
 const teams={};
 Object.entries(source?.teams||{}).forEach(([key,item])=>{
  if(!item||typeof item!=='object')return;
  const current=item.currentRelay?{...item.currentRelay,laps:(item.currentRelay.laps||[]).slice(-20),lapNumbers:(item.currentRelay.lapNumbers||[]).slice(-20),bestLaps:(item.currentRelay.bestLaps||[]).slice(0,3)}:null;
  teams[key]={...item,stints:(item.stints||[]).slice(-8),relays:(item.relays||[]).slice(-8).map(relay=>({...relay,laps:(relay.laps||[]).slice(-20),lapNumbers:(relay.lapNumbers||[]).slice(-20),bestLaps:(relay.bestLaps||[]).slice(0,3)})),currentRelay:current};
 });
 return {teams,startedAt:Number(source?.startedAt)||Date.now()};
}
function analyzerStoragePurgeLegacySessions(){
 try{
  const keys=[];for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(key&&key.startsWith(ANALYZER_SESSION_PREFIX))keys.push(key)}
  keys.forEach(key=>localStorage.removeItem(key));
  localStorage.removeItem(ANALYZER_SESSIONS_INDEX_KEY);localStorage.removeItem(ANALYZER_ACTIVE_SESSION_KEY);
 }catch(error){console.warn('[Velocity Analyzer] Nettoyage stockage impossible',error)}
}
function analyzerStorageSafeSet(key,value,{retryCleanup=true}={}){
 try{localStorage.setItem(key,value);return true}catch(error){
  const quota=error?.name==='QuotaExceededError'||error?.name==='NS_ERROR_DOM_QUOTA_REACHED'||error?.code===22;
  if(quota&&retryCleanup){analyzerStoragePurgeLegacySessions();try{localStorage.setItem(key,value);return true}catch(second){console.warn('[Velocity Analyzer] Quota localStorage dépassé après nettoyage',second)}}
  else console.warn('[Velocity Analyzer] Écriture localStorage impossible',error);
  return false;
 }
}
function analyzerStorageCleanupOnce(){
 try{
  if(localStorage.getItem(ANALYZER_STORAGE_CLEANUP_KEY)==='1')return;
  const learning=analyzerStorageCompactLearning(JSON.parse(localStorage.getItem(ANALYZER_LEARNING_KEY)||'{"teams":{}}'));
  analyzerStoragePurgeLegacySessions();
  analyzerStorageSafeSet(ANALYZER_LEARNING_KEY,JSON.stringify(learning),{retryCleanup:false});
  analyzerStorageSafeSet(ANALYZER_STORAGE_CLEANUP_KEY,'1',{retryCleanup:false});
  console.info('[Velocity Analyzer] Anciennes sessions lourdes supprimées et apprentissage compacté.');
 }catch(error){analyzerStoragePurgeLegacySessions();try{localStorage.removeItem(ANALYZER_LEARNING_KEY);localStorage.setItem(ANALYZER_STORAGE_CLEANUP_KEY,'1')}catch(_){}console.warn('[Velocity Analyzer] Réinitialisation du stockage',error)}
}

function analyzerSessionSafeId(value){return String(value||'circuit').replace(/[^a-z0-9_-]+/gi,'-').replace(/^-+|-+$/g,'').toLowerCase()||'circuit'}
function analyzerSessionCircuit(){return String(state?.circuit_id||'').trim()}
function analyzerSessionCircuitName(circuitId=analyzerSessionCircuit()){
 const circuit=(state?.circuits||[]).find(item=>String(item.id)===String(circuitId));
 return circuit?.name||circuitId||'Circuit inconnu';
}
function analyzerSessionReadIndex(){
 try{const value=JSON.parse(localStorage.getItem(ANALYZER_SESSIONS_INDEX_KEY)||'[]');return Array.isArray(value)?value:[]}catch(_){return []}
}
function analyzerSessionWriteIndex(index){analyzerStorageSafeSet(ANALYZER_SESSIONS_INDEX_KEY,JSON.stringify((index||[]).slice(0,ANALYZER_MAX_SESSION_INDEX)))}
function analyzerSessionRead(id){if(!id)return null;try{return JSON.parse(localStorage.getItem(ANALYZER_SESSION_PREFIX+id)||'null')}catch(_){return null}}
function analyzerSessionMetadata(session){return {id:session.id,name:session.name,circuitId:session.circuitId,circuitName:session.circuitName,createdAt:session.createdAt,updatedAt:session.updatedAt,status:session.status||'active',version:session.version||1}}
function analyzerSessionUpdateIndex(session){
 const index=analyzerSessionReadIndex().filter(item=>item.id!==session.id);
 index.unshift(analyzerSessionMetadata(session));
 analyzerSessionWriteIndex(index.slice(0,ANALYZER_MAX_SESSION_INDEX));
}
function analyzerSessionDefaultName(circuitId){
 const date=new Date();
 return `${analyzerSessionCircuitName(circuitId)} — ${date.toLocaleDateString('fr-FR')} ${date.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}`;
}
function analyzerSessionSnapshot(reason='autosave'){
 const circuitId=analyzerSessionCircuit()||analyzerSessionCircuitId;
 if(!circuitId||!analyzerActiveSessionId)return null;
 const previous=analyzerSessionRead(analyzerActiveSessionId)||{};
 return {
  ...previous,
  version:3,
  appVersion:'7.2.106',
  learning:undefined,
  id:analyzerActiveSessionId,
  name:previous.name||analyzerSessionDefaultName(circuitId),
  circuitId,
  circuitName:analyzerSessionCircuitName(circuitId),
  createdAt:previous.createdAt||Date.now(),
  updatedAt:Date.now(),
  status:previous.status||'active',
  saveReason:reason,
  rules:{...analyzerRules},
  queues:{count:kartQueueState?.count||1,queues:(kartQueueState?.queues||[[]]).map(queue=>[...queue])},
  followedDriver:state?.followed_driver||'',
  analyzerSort,
  raceSummary:{timeRemaining:state?.time_remaining||'—',lapsRemaining:state?.apex_laps_remaining||'—',driverCount:(state?.drivers||[]).length}
 };
}
function analyzerUpdateSessionBadge(text,className=''){
 const badge=document.getElementById('analyzerSessionStatus');if(!badge)return;
 badge.textContent=text;badge.className='analyzer-session-status'+(className?' '+className:'');
}
function analyzerSaveSession(reason='autosave'){
 const snapshot=analyzerSessionSnapshot(reason);if(!snapshot)return false;
 try{
  if(!analyzerStorageSafeSet(ANALYZER_SESSION_PREFIX+snapshot.id,JSON.stringify(snapshot)))return false;
  analyzerStorageSafeSet(ANALYZER_ACTIVE_SESSION_KEY,snapshot.id);
  analyzerSessionUpdateIndex(snapshot);
  analyzerLastSessionSaveAt=snapshot.updatedAt;
  const time=new Date(snapshot.updatedAt).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
  analyzerUpdateSessionBadge(`SAUVEGARDÉ ${time}`,'saved');
  return true;
 }catch(error){console.warn('[Velocity Analyzer] Sauvegarde impossible',error);analyzerUpdateSessionBadge('SAUVEGARDE IMPOSSIBLE','error');return false}
}
function analyzerApplySession(session,{notify=true}={}){
 if(!session)return false;
 analyzerSessionRestoreLock=true;
 analyzerActiveSessionId=session.id;
 analyzerSessionCircuitId=session.circuitId;
 analyzerRules={...ANALYZER_DEFAULT_RULES,...(session.rules||{})};
 analyzerSort=session.analyzerSort||'position';
 if(session.queues&&typeof normalizeKartQueueState==='function'){
  kartQueueState=normalizeKartQueueState(session.queues);
  saveKartQueues();renderKartQueues();
 }
 analyzerStorageSafeSet(ANALYZER_RULES_KEY,JSON.stringify(analyzerRules));analyzerSaveLearning();analyzerStorageSafeSet(ANALYZER_ACTIVE_SESSION_KEY,session.id);
 analyzerSessionRestoreLock=false;
 if(notify)analyzerUpdateSessionBadge('SESSION RESTAURÉE','restored');
 const sort=document.getElementById('analyzerSort');if(sort)sort.value=analyzerSort;
 renderAnalyzer();
 return true;
}
function analyzerCreateSession({name=null,circuitId=null,reset=true}={}){
 const cid=String(circuitId||analyzerSessionCircuit()).trim();if(!cid)return null;
 if(analyzerActiveSessionId)analyzerSaveSession('before-new-session');
 const id=`${analyzerSessionSafeId(cid)}-${Date.now().toString(36)}`;
 const now=Date.now();
 const session={version:3,appVersion:'7.2.106',id,name:name||analyzerSessionDefaultName(cid),circuitId:cid,circuitName:analyzerSessionCircuitName(cid),createdAt:now,updatedAt:now,status:'active',rules:reset?{...ANALYZER_DEFAULT_RULES}:{...analyzerRules},queues:reset?{count:1,queues:[[]]}:{count:kartQueueState.count,queues:kartQueueState.queues.map(q=>[...q])},followedDriver:'',analyzerSort:'position'};
 if(!analyzerStorageSafeSet(ANALYZER_SESSION_PREFIX+id,JSON.stringify(session)))return null;analyzerSessionUpdateIndex(session);analyzerApplySession(session,{notify:false});analyzerSaveSession('new-session');return session;
}
function analyzerEnsureSession(){
 if(analyzerSessionRestoreLock)return;
 const cid=analyzerSessionCircuit();if(!cid)return;
 if(analyzerActiveSessionId&&analyzerSessionCircuitId===cid)return;
 if(analyzerActiveSessionId)analyzerSaveSession('circuit-switch');
 const activeId=localStorage.getItem(ANALYZER_ACTIVE_SESSION_KEY);
 const active=analyzerSessionRead(activeId);
 let candidate=active&&active.circuitId===cid&&active.status!=='archived'?active:null;
 if(!candidate){const item=analyzerSessionReadIndex().find(meta=>meta.circuitId===cid&&meta.status!=='archived');candidate=analyzerSessionRead(item?.id)}
 if(candidate)analyzerApplySession(candidate);
 else analyzerCreateSession({circuitId:cid,reset:false});
}
function analyzerBeforeCircuitChange(){analyzerSaveSession('before-circuit-change')}
function analyzerAfterCircuitChange(){analyzerResetTrafficState();analyzerActiveSessionId=null;analyzerSessionCircuitId=null;setTimeout(analyzerEnsureSession,100)}
function analyzerSessionAutosaveStart(){
 clearInterval(analyzerSessionAutosaveTimer);
 analyzerSessionAutosaveTimer=setInterval(()=>{if(analyzerActiveSessionId)analyzerSaveSession('autosave')},ANALYZER_AUTOSAVE_MS);
}
function openAnalyzerSessions(){renderAnalyzerSessions();document.getElementById('analyzerSessionsModal')?.classList.add('show')}
function closeAnalyzerSessions(){document.getElementById('analyzerSessionsModal')?.classList.remove('show')}
function renderAnalyzerSessions(){
 const host=document.getElementById('analyzerSessionsList');if(!host)return;
 const sessions=analyzerSessionReadIndex();
 host.innerHTML=sessions.length?sessions.map(meta=>`<article class="analyzer-session-row ${meta.id===analyzerActiveSessionId?'active':''} ${meta.status==='archived'?'archived':''}"><div><strong>${analyzerEscape(meta.name||'Session sans nom')}</strong><span>${analyzerEscape(meta.circuitName||meta.circuitId)} · ${new Date(meta.updatedAt||meta.createdAt).toLocaleString('fr-FR')}</span></div><div class="analyzer-session-row-actions"><button type="button" onclick="resumeAnalyzerSession('${analyzerEscape(meta.id)}')">REPRENDRE</button><button type="button" onclick="archiveAnalyzerSession('${analyzerEscape(meta.id)}')">${meta.status==='archived'?'RÉACTIVER':'ARCHIVER'}</button><button type="button" class="danger" onclick="deleteAnalyzerSession('${analyzerEscape(meta.id)}')">SUPPRIMER</button></div></article>`).join(''):'<div class="analyzer-empty">Aucune session sauvegardée.</div>';
}
function newAnalyzerSession(){const name=window.prompt('Nom de la nouvelle session :',analyzerSessionDefaultName(analyzerSessionCircuit()));if(name===null)return;analyzerCreateSession({name:String(name).trim()||null,reset:true});renderAnalyzerSessions();closeAnalyzerSessions()}
function resumeAnalyzerSession(id){const session=analyzerSessionRead(id);if(!session)return;if(session.circuitId!==analyzerSessionCircuit()){window.alert(`Cette session appartient au circuit « ${session.circuitName} ». Sélectionnez d’abord ce circuit sur la page d’accueil.`);return}if(analyzerActiveSessionId)analyzerSaveSession('before-resume');session.status='active';analyzerApplySession(session);analyzerSaveSession('resume');renderAnalyzerSessions();closeAnalyzerSessions()}
function archiveAnalyzerSession(id){const session=analyzerSessionRead(id);if(!session)return;session.status=session.status==='archived'?'active':'archived';session.updatedAt=Date.now();analyzerStorageSafeSet(ANALYZER_SESSION_PREFIX+id,JSON.stringify(session));analyzerSessionUpdateIndex(session);renderAnalyzerSessions()}
function deleteAnalyzerSession(id){if(!window.confirm('Supprimer définitivement cette session Analyzer ?'))return;localStorage.removeItem(ANALYZER_SESSION_PREFIX+id);analyzerSessionWriteIndex(analyzerSessionReadIndex().filter(meta=>meta.id!==id));if(id===analyzerActiveSessionId){analyzerActiveSessionId=null;analyzerSessionCircuitId=null;localStorage.removeItem(ANALYZER_ACTIVE_SESSION_KEY);analyzerCreateSession({reset:true})}renderAnalyzerSessions()}
function exportAnalyzerSession(){analyzerSaveSession('export');const session=analyzerSessionRead(analyzerActiveSessionId);if(!session)return;const blob=new Blob([JSON.stringify(session,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`Velocity_Session_${analyzerSessionSafeId(session.name)}_${new Date().toISOString().slice(0,10)}.json`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)}
function triggerAnalyzerSessionImport(){document.getElementById('analyzerSessionImport')?.click()}
async function importAnalyzerSession(event){
 const file=event?.target?.files?.[0];if(!file)return;
 try{const session=JSON.parse(await file.text());if(!session?.id||!session?.circuitId)throw new Error('Format de session invalide');session.id=`${analyzerSessionSafeId(session.circuitId)}-${Date.now().toString(36)}`;session.name=(session.name||'Session importée')+' — import';session.createdAt=Date.now();session.updatedAt=Date.now();session.status='active';delete session.learning;session.version=3;session.appVersion='7.2.106';if(!analyzerStorageSafeSet(ANALYZER_SESSION_PREFIX+session.id,JSON.stringify(session)))throw new Error('Stockage local insuffisant');analyzerSessionUpdateIndex(session);if(session.circuitId===analyzerSessionCircuit())analyzerApplySession(session);renderAnalyzerSessions();window.alert('Session importée avec succès.')}catch(error){window.alert('Import impossible : '+error.message)}finally{event.target.value=''}
}
let analyzerRules={...ANALYZER_DEFAULT_RULES};
let analyzerSort='position';
let analyzerRankingMode='general';
const analyzerVirtualPitCache=new Map();
let analyzerVirtualLoading=false;
let analyzerVirtualLoadToken=0;
const analyzerRelayHydrationCache=new Map();
let analyzerRelayHydrationLoading=false;
let analyzerRelayHydrationToken=0;
let analyzerRelayHydrationScheduled=null;
let analyzerLearning={teams:{},startedAt:Date.now()};
const analyzerKartEvolutionHistory=new Map();
let analyzerPitSimulation=null;
let analyzerPitSimulationBusy=false;

function analyzerMean(values){
 const clean=(values||[]).filter(Number.isFinite);return clean.length?clean.reduce((a,b)=>a+b,0)/clean.length:null;
}
function analyzerDriverPace(driver){
 const metrics=analyzerRelayMetrics(driver);
 if(Number.isFinite(metrics.average)&&metrics.average>0)return metrics.average;
 const best=analyzerParseDuration(driver?.best),last=analyzerParseDuration(driver?.last);
 if(Number.isFinite(last)&&last>20)return last;
 if(Number.isFinite(best)&&best>20)return best;
 return analyzerLiveGridReference()||60;
}
const analyzerTrackAnimationAnchors=new Map();
function analyzerApexMapRegistry(){return window.velocityApexMap||{rows:new Map(),lastEventAt:0,noLive:true}}
function analyzerApexMapEntry(driver){
 const row=Number(driver?.apex_row);return Number.isFinite(row)?analyzerApexMapRegistry().rows.get(row)||null:null;
}
function analyzerApexSectorModel(){
 const entries=[...analyzerApexMapRegistry().rows.values()];
 const med=key=>analyzerMedian(entries.map(e=>Number(e?.sectors?.[key])).filter(v=>Number.isFinite(v)&&v>0));
 const s1=med('s1'),s2=med('s2'),s3=med('s3');
 if([s1,s2,s3].every(v=>Number.isFinite(v)&&v>0))return {s1,s2,s3,total:s1+s2+s3,source:'apex'};
 return null;
}
function analyzerApexRaceIsActive(){
 const drivers=(state?.drivers||[]).filter(d=>d&&d.driver);
 if(!drivers.length)return false;
 const liveStatus=String(state?.live?.status||'').toLowerCase(),connection=String(state?.connection||'').toLowerCase();
 const connected=['connected','receiving','test'].includes(liveStatus)||connection.includes('connect')||connection.includes('test');
 if(!connected)return false;

 // V7.2.107 — une grille Apex encore affichée ne signifie pas qu'une course roule.
 // Si Apex fournit une cible tours, elle est prioritaire.
 const totalLaps=Number(state?.total_laps),currentLap=Number(state?.current_lap);
 if(Number.isFinite(totalLaps)&&totalLaps>0&&Number.isFinite(currentLap))return currentLap<totalLaps;

 // Même règle pour les sessions au temps : 00:00 / 00:00:00 = session inactive.
 const remainingMs=typeof liveRemainingMilliseconds==='function'?liveRemainingMilliseconds():Number(state?.time_remaining_ms);
 if(Number.isFinite(remainingMs))return remainingMs>0;
 const raw=String(state?.time_remaining??'').trim();
 const parts=raw.match(/^(\d{1,3}):(\d{2})(?::(\d{2}))?$/);
 if(parts){
  const seconds=parts[3]===undefined
   ?Number(parts[1])*60+Number(parts[2])
   :Number(parts[1])*3600+Number(parts[2])*60+Number(parts[3]);
  if(Number.isFinite(seconds))return seconds>0;
 }

 // Seulement si Apex ne donne aucun compteur exploitable : présence réelle
 // d'au moins un kart hors pit. Cela évite les cercles fantômes d'une session finie.
 return drivers.some(driver=>{
  try{return typeof velocityKartIsInPit==='function'?!velocityKartIsInPit(driver):String(driver?.status||'').toLowerCase()!=='pit'}catch(_){return false}
 });
}
function analyzerAnimatedTrackSeconds(driver){
 const key=String(driver?.driver||driver?.apex||driver?.pos||'unknown');
 const raw=analyzerParseDuration(driver?.track_timer),now=performance.now(),status=driver?.status==='pit'?'pit':'track';
 let anchor=analyzerTrackAnimationAnchors.get(key);
 if(!Number.isFinite(raw)||raw<0){analyzerTrackAnimationAnchors.delete(key);return null}
 const rawChanged=!anchor||Math.abs(raw-anchor.raw)>.25||anchor.status!==status;
 if(rawChanged){anchor={raw,at:now,status};analyzerTrackAnimationAnchors.set(key,anchor)}
 if(status==='pit')return raw;
 return anchor.raw+Math.max(0,(now-anchor.at)/1000);
}
// V7.2.118 — phase Apex unique pour TRAFIC + Heat Map.
// Même règle que le Live Tracking Apex : interpolation pendant la durée du segment,
// puis invalidation 5 s après sa fin pour éviter les positions fantômes/stales.
function analyzerApexEntryPhase(entry,at=Date.now()){
 if(!entry||!entry.startedAt||!entry.durationMs)return null;
 const age=at-Number(entry.startedAt),duration=Number(entry.durationMs);
 if(!Number.isFinite(age)||!Number.isFinite(duration)||duration<=0||age<0)return null;
 if(age>duration+5000)return null;
 const p=Math.max(0,Math.min(1,age/duration));
 const s1=Number(entry.sectors?.s1)||0,s2=Number(entry.sectors?.s2)||0,s3=Number(entry.sectors?.s3)||0;
 const total=(s1+s2+s3)>0?s1+s2+s3:(Number(entry.lapDurationMs)||duration);
 if(entry.segment==='track')return p;
 if(entry.segment==='s1')return total>0?p*s1/total:p;
 if(entry.segment==='s2')return total>0?(s1+p*s2)/total:Number(entry.lastPhase)||0;
 if(entry.segment==='s3')return total>0?(s1+s2+p*s3)/total:Number(entry.lastPhase)||0;
 // Les chemins pit IN/OUT Apex sont distincts du tracé principal. Ils ne doivent
 // pas être projetés artificiellement autour du radar principal.
 if(entry.segment==='in'||entry.segment==='out')return null;
 return null;
}
function analyzerApexStablePhase(driver,at=Date.now()){
 const entry=analyzerApexMapEntry(driver);
 if(!entry||entry.inPit)return null;
 const phase=analyzerApexEntryPhase(entry,at);
 return Number.isFinite(phase)?((phase%1)+1)%1:null;
}
function analyzerDriverPhase(driver){
 const eventPhase=analyzerApexStablePhase(driver);if(Number.isFinite(eventPhase))return eventPhase;
 const pace=analyzerDriverPace(driver);if(!Number.isFinite(pace)||pace<=0)return 0;
 const track=analyzerAnimatedTrackSeconds(driver);if(Number.isFinite(track)&&track>=0)return ((track%pace)+pace)%pace/pace;
 return 0;
}
const analyzerMapPaceFilters=new Set(['fastest','excellent','good','medium','average','slow']);
let analyzerMapHighlight='none';
const analyzerMapGeometry={cx:135,cy:146,viewWidth:270,viewHeight:292};
const analyzerMapRings={slow:52.25,average:66,medium:79.75,good:93.5,excellent:107.25,fastest:121};
function setAnalyzerMapPaceFilter(category,checked){if(checked)analyzerMapPaceFilters.add(category);else analyzerMapPaceFilters.delete(category);const none=document.querySelector('#mapPaceFilters .map-filter-none input');if(none)none.checked=analyzerMapPaceFilters.size===0;analyzerRenderPitSimulator()}
function setAnalyzerMapNoPaces(checked){if(checked)analyzerMapPaceFilters.clear();else ['fastest','excellent','good','medium','average','slow'].forEach(x=>analyzerMapPaceFilters.add(x));document.querySelectorAll('#mapPaceFilters input[value]').forEach(input=>input.checked=analyzerMapPaceFilters.has(input.value));analyzerRenderPitSimulator()}
function setAnalyzerMapHighlight(value){analyzerMapHighlight=value||'none';analyzerRenderPitSimulator()}
function analyzerMapLastLap(driver){const value=analyzerParseDuration(driver?.last);return Number.isFinite(value)&&value>20&&value<600?value:null}
function analyzerMapPaceCategory(delta){if(delta<=.10)return 'fastest';if(delta<=.29)return 'excellent';if(delta<=.49)return 'good';if(delta<=.79)return 'medium';if(delta<=.99)return 'average';return 'slow'}
function analyzerMapPaceData(drivers){const valid=(drivers||[]).filter(d=>!(typeof velocityKartIsInPit==='function'?velocityKartIsInPit(d):d?.status==='pit')).map(d=>({driver:d,lap:analyzerMapLastLap(d)})).filter(x=>Number.isFinite(x.lap));const best=valid.length?Math.min(...valid.map(x=>x.lap)):null;const map=new Map();for(const d of drivers||[]){const lap=analyzerMapLastLap(d),delta=Number.isFinite(best)&&Number.isFinite(lap)?Math.max(0,lap-best):null;map.set(d,{lap,delta,category:Number.isFinite(delta)?analyzerMapPaceCategory(delta):'slow'})}return {best,map}}
function analyzerTrackPoint(phase,radius=121,cx=analyzerMapGeometry.cx,cy=analyzerMapGeometry.cy){const angle=(Number(phase)||0)*Math.PI*2-Math.PI/2;return {x:cx+Math.cos(angle)*radius,y:cy+Math.sin(angle)*radius}}
function analyzerMapPoint(driver,radius=121){const entry=analyzerApexMapEntry(driver),phase=analyzerApexStablePhase(driver);if(!entry||!Number.isFinite(phase))return null;return {...analyzerTrackPoint(phase,radius),phase,inPit:Boolean(entry.inPit),entry}}
function analyzerMapRadarMarkup(){const {cx,cy}=analyzerMapGeometry;const rings=Object.entries(analyzerMapRings).map(([category,r])=>`<circle class="map-radar-ring ${category}" cx="${cx}" cy="${cy}" r="${r}"></circle>`).join('');const rays=Array.from({length:8},(_,i)=>{const a=i*Math.PI/4-Math.PI/2,x1=cx+Math.cos(a)*41.25,y1=cy+Math.sin(a)*41.25,x2=cx+Math.cos(a)*124.85,y2=cy+Math.sin(a)*124.85;return `<line class="map-radar-ray" x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}"></line>`}).join('');const checker=Array.from({length:12},(_,i)=>{const y=cy-10*(i+1),alt=i%2;return `<rect class="map-finish-square ${alt?'alt':''}" x="${cx-5}" y="${y}" width="5" height="10"></rect><rect class="map-finish-square ${alt?'':'alt'}" x="${cx}" y="${y}" width="5" height="10"></rect>`}).join('');return `${rays}${rings}<g class="map-finish-line">${checker}</g>`}
function analyzerSimulationKartLabel(driver){return String(validKartNumber(driver)||driver?.apex||driver?.pos||'—').slice(0,3)}
function analyzerMapTop5Set(drivers){return new Set((drivers||[]).slice().sort((a,b)=>(Number(a.velocity_score??a.kart_score??0)||0)-(Number(b.velocity_score??b.kart_score??0)||0)).slice(-5).map(d=>d.driver))}
function analyzerMapIsHighlighted(driver,category,top5){if(analyzerMapHighlight==='followed')return driver.driver===state.followed_driver;if(analyzerMapHighlight==='top5')return top5.has(driver.driver);if(analyzerMapHighlight==='pit')return typeof velocityKartIsInPit==='function'?velocityKartIsInPit(driver):(driver.status==='pit'||Boolean(analyzerApexMapEntry(driver)?.inPit));if(analyzerMapHighlight==='fastest')return category==='fastest';return false}
function analyzerMapPitQueue(drivers){return (drivers||[]).map(driver=>({driver,entry:analyzerApexMapEntry(driver)})).filter(x=>typeof velocityKartIsInPit==='function'?velocityKartIsInPit(x.driver):(x.driver.status==='pit'||x.entry?.inPit)).sort((a,b)=>Number(a.entry?.pitEnteredAt||0)-Number(b.entry?.pitEnteredAt||0))}
function analyzerPitLaneDots(pitQueue,top5){return pitQueue.map(({driver},index)=>{const perRow=12,row=Math.floor(index/perRow),col=index%perRow,x=8+col*23,y=184+row*29,classes=['pit-simulator-dot','pit','pit-queued'];if(driver.driver===state.followed_driver)classes.push('followed');if(analyzerMapIsHighlighted(driver,'pit',top5))classes.push('highlighted');if(analyzerMapHighlight!=='none'&&!analyzerMapIsHighlighted(driver,'pit',top5)&&driver.driver!==state.followed_driver)classes.push('dimmed');return `<g class="${classes.join(' ')}" transform="translate(${x} ${y})"><title>${analyzerEscape(driver.driver)}</title><circle r="9.35"></circle><text y=".5">${analyzerEscape(analyzerSimulationKartLabel(driver))}</text></g>`}).join('')}
function analyzerRenderPitSimulator(){
 const host=document.getElementById('pitSimulatorTrack');if(!host)return;
 const drivers=(state.drivers||[]).filter(d=>d&&d.driver),radar=analyzerMapRadarMarkup();
 const pitBase=`<g class="map-pitlane-centered"><text class="map-pitlane-label" x="135" y="132">PIT LANE</text><path class="map-pitlane-line" d="M0 158 H270"></path></g>`;
 if(!analyzerApexRaceIsActive()){analyzerTrackAnimationAnchors.clear();host.innerHTML=`<div class="map-stage"><div class="map-radar-pane"><svg viewBox="0 0 270 292" role="img" aria-label="Circuit inactif">${radar}<text class="pit-simulator-center-title" x="135" y="145">MAP</text><text class="pit-simulator-center-value pit-simulator-center-value-idle" x="135" y="163">Pas de course en cours</text></svg></div><div class="map-pitlane-pane"><svg viewBox="0 0 270 292" role="img" aria-label="Pit lane inactive">${pitBase}</svg></div></div>`;return}
 const paceData=analyzerMapPaceData(drivers),counts={fastest:0,excellent:0,good:0,medium:0,average:0,slow:0};for(const d of drivers){const c=paceData.map.get(d)?.category||'slow';counts[c]++}Object.entries(counts).forEach(([key,value])=>{const el=document.querySelector(`[data-map-count="${key}"]`);if(el)el.textContent=value});
 const top5=analyzerMapTop5Set(drivers),pitQueue=analyzerMapPitQueue(drivers),pitNames=new Set(pitQueue.map(x=>x.driver.driver));
 const visible=drivers.map(driver=>{const info=paceData.map.get(driver)||{category:'slow',delta:null};const point=analyzerMapPoint(driver,analyzerMapRings[info.category]);return {driver,info,point}}).filter(item=>item.point&&!pitNames.has(item.driver.driver)&&(analyzerMapPaceFilters.has(item.info.category)||item.driver.driver===state.followed_driver));
 const simulation=analyzerPitSimulation,horizon=Number(simulation?.horizon??simulation?.horizonSeconds)||0;
 const dots=visible.map(({driver,info,point})=>{let p=point;if(simulation&&driver.driver!==simulation.followedName&&!(typeof velocityKartIsInPit==='function'?velocityKartIsInPit(driver):driver.status==='pit'))p=analyzerTrackPoint((point.phase+horizon/Math.max(1,analyzerDriverPace(driver)))%1,analyzerMapRings[info.category]);if(simulation&&driver.driver===simulation.followedName)p=analyzerTrackPoint(0,analyzerMapRings[info.category]);const classes=['pit-simulator-dot','pace-'+info.category];if(driver.driver===state.followed_driver)classes.push('followed');if(analyzerMapIsHighlighted(driver,info.category,top5))classes.push('highlighted');if(analyzerMapHighlight!=='none'&&!analyzerMapIsHighlighted(driver,info.category,top5)&&driver.driver!==state.followed_driver)classes.push('dimmed');const title=Number.isFinite(info.delta)?`${driver.driver} · +${info.delta.toFixed(3)} s`:driver.driver;return `<g class="${classes.join(' ')}" transform="translate(${p.x.toFixed(2)} ${p.y.toFixed(2)})"><title>${analyzerEscape(title)}</title><circle r="${info.category==='fastest'?10.45:9.35}"></circle><text y=".5">${analyzerEscape(analyzerSimulationKartLabel(driver))}</text></g>`}).join('');
 const pitDots=analyzerPitLaneDots(pitQueue,top5),projected=simulation?'<circle class="pit-simulator-projected" cx="135" cy="25" r="12.1"></circle>':'',followed=drivers.find(d=>d.driver===state.followed_driver)||null,centerTitle=simulation?'RESSORTIE DANS':'ÉQUIPE SUIVIE',centerValue=simulation?analyzerFormatDuration(horizon):(followed?analyzerEscape(analyzerSimulationKartLabel(followed)):'—');
 const waiting=!visible.length?'<text class="pit-simulator-center-value pit-simulator-center-value-idle" x="135" y="184">En attente d’un passage Apex</text>':'';
 host.innerHTML=`<div class="map-stage"><div class="map-radar-pane"><svg viewBox="0 0 270 292" role="img" aria-label="Radar de rythme synchronisé avec Apex Timing">${radar}${dots}${projected}<text class="pit-simulator-center-title" x="135" y="145">${centerTitle}</text><text class="pit-simulator-center-value" x="135" y="163">${centerValue}</text>${waiting}</svg></div><div class="map-pitlane-pane"><svg viewBox="0 0 270 292" role="img" aria-label="Karts dans la pit lane">${pitBase}${pitDots}</svg></div></div>`;
 if(document.getElementById('analyzerMapFocus')?.classList.contains('show'))analyzerRenderMapFocus();
}
function analyzerPitReferenceLap(laps,pits){
 const pitLaps=new Set((pits||[]).map(p=>Number(p.lap)).filter(Number.isFinite));
 const clean=(laps||[]).filter(l=>Number(l.lapTime)>0&&!pitLaps.has(Number(l.lap))).map(l=>Number(l.lapTime)/1000);
 return analyzerMedian(clean)||analyzerMean(clean)||null;
}
function analyzerPitLaneDifferential(laps,pits,pitAverage){
 const reference=analyzerPitReferenceLap(laps,pits);if(!Number.isFinite(reference))return 0;
 const lapByNumber=new Map((laps||[]).map(l=>[Number(l.lap),Number(l.lapTime)/1000]));
 const values=(pits||[]).filter(p=>Number(p.pitOutMs)>Number(p.pitInMs)).map(p=>{
  const inLap=lapByNumber.get(Number(p.lap));const stop=(p.pitOutMs-p.pitInMs)/1000;
  return Number.isFinite(inLap)?Math.max(0,inLap-reference-stop):null;
 }).filter(Number.isFinite);
 return analyzerMedian(values)??0;
}
function analyzerProjectedTraffic(followed,horizon){
 const others=(state.drivers||[]).filter(d=>d.driver&&d.driver!==followed.driver&&d.status!=='pit').map(driver=>{
  const pace=analyzerDriverPace(driver);const phase=(analyzerDriverPhase(driver)+horizon/Math.max(1,pace))%1;
  return {driver,pace,phase};
 });
 if(!others.length)return {ahead:null,behind:null};
 const ahead=others.slice().sort((a,b)=>a.phase-b.phase)[0];
 const behind=others.slice().sort((a,b)=>b.phase-a.phase)[0];
 return {
  ahead:{...ahead,gap:Math.max(0,ahead.phase*ahead.pace)},
  behind:{...behind,gap:Math.max(0,(1-behind.phase)*behind.pace)}
 };
}
async function simulateAnalyzerPitStop(){
 if(!analyzerApexRaceIsActive()){window.alert('Aucune course active détectée dans les données Apex.');return}
 const followed=(state.drivers||[]).find(d=>d.driver===state.followed_driver);
 const button=document.getElementById('pitSimulatorButton'),status=document.getElementById('pitSimulatorStatus');
 if(!followed){window.alert('Sélectionnez d’abord une équipe dans le classement.');return}
 if(!Number(followed.apex_row)){window.alert('Identifiant Apex de cette équipe indisponible.');return}
 if(analyzerPitSimulationBusy)return;
 analyzerPitSimulationBusy=true;if(button){button.disabled=true;button.textContent='CALCUL…'}if(status)status.textContent='Chargement des tours et des arrêts précédents depuis Apex…';
 try{
  const [laps,pits]=await Promise.all([fetchAllApexTeamLaps(Number(followed.apex_row),'',null),fetchAllApexTeamPits(Number(followed.apex_row),'',null)]);
  const completed=(pits||[]).filter(p=>Number(p.pitOutMs)>Number(p.pitInMs));
  const pitDurations=completed.map(p=>(p.pitOutMs-p.pitInMs)/1000).filter(v=>Number.isFinite(v)&&v>0);
  const pitAverage=analyzerMean(pitDurations)??analyzerRules.minPitSeconds;
  const pace=analyzerDriverPace(followed),phase=analyzerDriverPhase(followed);
  const timeToPit=Math.max(0,(1-phase)*pace);
  const laneDifferential=analyzerPitLaneDifferential(laps,completed,pitAverage);
  const horizon=timeToPit+laneDifferential+pitAverage;
  const traffic=analyzerProjectedTraffic(followed,horizon);
  analyzerPitSimulation={followedName:followed.driver,createdAt:Date.now(),timeToPit,laneDifferential,pitAverage,horizon,traffic,samples:pitDurations.length};
  const breakdown=document.getElementById('pitSimulatorBreakdown'),result=document.getElementById('pitSimulatorResult');
  if(status)status.textContent=`Projection figée au clic pour ${followed.driver}. Relancez la simulation pour actualiser.`;
  if(breakdown)breakdown.innerHTML=`<div><span>Temps moyen pour rallier les stands</span><b>${analyzerFormatDuration(timeToPit)}</b></div><div><span>Différentiel estimé de la voie des stands</span><b>${analyzerFormatDuration(laneDifferential)}</b></div><div><span>Arrêt moyen de l’équipe (${pitDurations.length||0})</span><b>${analyzerFormatDuration(pitAverage)}</b></div><div><span>Ressortie estimée dans</span><b>${analyzerFormatDuration(horizon)}</b></div>`;
  if(result){
   const ahead=traffic.ahead,behind=traffic.behind;
   const front=ahead?`Vous ressortirez <strong>derrière ${analyzerEscape(ahead.driver.driver)}</strong> avec <strong>${ahead.gap.toFixed(1)} s</strong> de retard.`:'Aucune équipe détectée immédiatement devant.';
   const rear=behind?`Vous ressortirez <strong>devant ${analyzerEscape(behind.driver.driver)}</strong> avec <strong>${behind.gap.toFixed(1)} s</strong> d’avance.`:'Aucune équipe détectée immédiatement derrière.';
   const nearest=Math.min(ahead?.gap??999,behind?.gap??999);result.className='pit-simulator-result '+(nearest<3?'dense':nearest>5?'good':'');result.innerHTML=`${front}<br>${rear}`;const ok=document.getElementById('pitSimulatorOkButton');if(ok)ok.hidden=false;
  }
  analyzerRenderPitSimulator();
 }catch(error){if(status)status.textContent=`Simulation impossible : ${error.message}`;console.warn('[Velocity] Simulation arrêt',error)}
 finally{analyzerPitSimulationBusy=false;if(button){button.disabled=false;button.textContent='SIMULER UN ARRÊT'}}
}
function closeAnalyzerPitSimulationResult(){
 analyzerPitSimulation=null;
 const status=document.getElementById('pitSimulatorStatus'),breakdown=document.getElementById('pitSimulatorBreakdown'),result=document.getElementById('pitSimulatorResult'),ok=document.getElementById('pitSimulatorOkButton');
 if(status)status.textContent='Projection disponible à partir des tours et arrêts Apex.';
 if(breakdown)breakdown.innerHTML='';
 if(result){result.className='pit-simulator-result';result.innerHTML=''}
 if(ok)ok.hidden=true;
 analyzerRenderPitSimulator();
}
if(!window.__kartiqPitTrackTimer){window.__kartiqPitTrackTimer=setInterval(analyzerRenderPitSimulator,100)}

function analyzerKartEvolution(driver,metrics){
 const key=`${analyzerActiveSessionId||analyzerSessionCircuit()}:${analyzerTeamKey(driver)}:${metrics.relayIndex}`;
 let history=analyzerKartEvolutionHistory.get(key)||[];
 const laps=Number(metrics.laps)||0,score=Number(metrics.score);
 if(Number.isFinite(score)&&laps>0&&(!history.length||history[history.length-1].laps!==laps)){
  history.push({laps,score});
  history=history.slice(-16);
  analyzerKartEvolutionHistory.set(key,history);
 }
 const reference=[...history].reverse().find(point=>point.laps<=laps-3);
 if(!reference)return {delta:0,label:'●',className:'stable',title:'Évolution disponible après 3 nouveaux tours'};
 const delta=Math.round(score-reference.score);
 if(delta>=2)return {delta,label:`▲ +${delta}`,className:'up',title:`+${delta} points sur les 3 derniers tours`};
 if(delta<=-2)return {delta,label:`▼ ${delta}`,className:'down',title:`${delta} points sur les 3 derniers tours`};
 return {delta,label:'●',className:'stable',title:'Score stable sur les 3 derniers tours'};
}
function analyzerKartDeltaLabel(value){
 if(!Number.isFinite(value))return '—';
 if(Math.abs(value)<0.05)return '0,0';
 const sign=value<0?'-':'+';
 return `${sign}${Math.abs(value).toFixed(1).replace('.',',')}`;
}

function analyzerEscape(value){return String(value??'—').replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]))}
function analyzerParseDuration(value){
 const raw=String(value??'').trim().replace(',','.');
 if(!raw||raw==='—'||raw==='--')return null;
 const parts=raw.split(':').map(Number);
 if(parts.some(v=>!Number.isFinite(v)))return null;
 if(parts.length===3)return parts[0]*3600+parts[1]*60+parts[2];
 if(parts.length===2)return parts[0]*60+parts[1];
 if(parts.length===1)return parts[0];
 return null;
}
function analyzerFormatDuration(seconds,{signed=false,compact=false}={}){
 if(!Number.isFinite(seconds))return '—';
 const negative=seconds<0;let total=Math.max(0,Math.round(Math.abs(seconds)));
 const h=Math.floor(total/3600),m=Math.floor((total%3600)/60),s=total%60;
 const value=h?`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`:`${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
 if(compact&&h)return `${h}h${String(m).padStart(2,'0')}`;
 return signed?(negative?'-':'+')+value:value;
}
function analyzerNumeric(value,fallback=0){const n=Number(String(value??'').replace(',','.'));return Number.isFinite(n)?n:fallback}
function analyzerTeamKey(driver){
 const base=String(driver?.apex_row??driver?.driver??driver?.pos??'unknown');
 const test=window.velocityEnduranceTest;
 if(test?.active&&test?.startedAt)return `test-${test.startedAt}:${base}`;
 const circuit=analyzerSessionCircuit()||analyzerSessionCircuitId||'unknown-circuit';
 return `${circuit}:${base}`;
}
function analyzerDriverPilot(driver){
 const value=String(driver?.pilot??'').trim();
 return value&&value!=='—'&&value!=='--'?value:null;
}
function analyzerNormalizePilot(value){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/gi,' ').trim().toLowerCase()}
function analyzerSessionHasPilotData(){return (state.drivers||[]).some(driver=>Boolean(analyzerDriverPilot(driver)))}
function analyzerRelayKart(driver){return String(validKartNumber(driver)||driver?.apex||'').trim()||null}
function analyzerPilotContinuity(metrics){
 const current=metrics?.currentPilot||null,previous=metrics?.previousPilot||null;
 if(!current||!previous)return {known:false,same:null,label:'—',title:'Comparaison pilote indisponible'};
 const same=analyzerNormalizePilot(current)===analyzerNormalizePilot(previous);
 return same?{known:true,same:true,label:'👤',title:'Pilote identique'}:{known:true,same:false,label:'👥',title:'Changement pilote'};
}
function analyzerLoad(){
 analyzerStorageCleanupOnce();
 try{analyzerRules={...ANALYZER_DEFAULT_RULES,...JSON.parse(localStorage.getItem(ANALYZER_RULES_KEY)||'{}')}}catch(_){analyzerRules={...ANALYZER_DEFAULT_RULES}}
 try{analyzerLearning={teams:{},startedAt:Date.now(),...JSON.parse(localStorage.getItem(ANALYZER_LEARNING_KEY)||'{}')}}catch(_){analyzerLearning={teams:{},startedAt:Date.now()}}
}
function analyzerSaveLearning(){
 if(window.velocityEnduranceTest?.active)return;
 analyzerLearning=analyzerStorageCompactLearning(analyzerLearning);
 analyzerStorageSafeSet(ANALYZER_LEARNING_KEY,JSON.stringify(analyzerLearning));
}
function analyzerMedian(values){
 const sorted=(values||[]).filter(Number.isFinite).slice().sort((a,b)=>a-b);
 if(!sorted.length)return null;
 const middle=Math.floor(sorted.length/2);
 return sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2;
}
function analyzerStdDev(values){
 const clean=(values||[]).filter(Number.isFinite);if(clean.length<2)return null;
 const mean=clean.reduce((a,b)=>a+b,0)/clean.length;
 return Math.sqrt(clean.reduce((sum,value)=>sum+(value-mean)**2,0)/clean.length);
}
function analyzerLiveGridReference(){
 const relayValues=Object.values(analyzerLearning.teams||{}).map(item=>{
  const relay=item.currentRelay;
  return relay&&relay.lapCount>0?relay.lapSum/relay.lapCount:null;
 }).filter(Number.isFinite);
 if(relayValues.length>=3)return analyzerMedian(relayValues);
 return analyzerMedian(analyzerGridPace());
}
function analyzerNewRelay(item,driver,now,gridReference){
 const completed=Array.isArray(item.relays)?item.relays.length:0;
 return {index:completed+1,startAt:now,lapSum:0,lapCount:0,laps:[],bestLaps:[],warmupSkipped:false,gridStartPace:gridReference,gridEndPace:gridReference,pilot:analyzerDriverPilot(driver),kart:analyzerRelayKart(driver),status:'active'};
}
function analyzerFinalizeRelay(item,now,gridReference){
 const relay=item.currentRelay;if(!relay||relay.status==='complete')return;
 relay.status='complete';relay.endAt=now;relay.gridEndPace=Number.isFinite(gridReference)?gridReference:relay.gridEndPace;
 relay.average=relay.lapCount>0?relay.lapSum/relay.lapCount:null;
 const best=(relay.laps||[]).filter(Number.isFinite).slice().sort((a,b)=>a-b).slice(0,3);
 relay.best3Average=best.length?best.reduce((a,b)=>a+b,0)/best.length:null;
 relay.consistency=analyzerStdDev(relay.laps||[]);
 if(Number.isFinite(relay.average)&&relay.lapCount>0){
  item.relays=Array.isArray(item.relays)?item.relays:[];
  const duplicate=item.relays[item.relays.length-1];
  if(!duplicate||duplicate.index!==relay.index)item.relays.push({...relay});
  item.relays=item.relays.slice(-20);
 }
}
function analyzerLearnFromState(){
 const now=Date.now();
 const gridReference=analyzerLiveGridReference();
 (state.drivers||[]).forEach(driver=>{
  const key=analyzerTeamKey(driver);
  const item=analyzerLearning.teams[key]||{name:driver.driver,stints:[],relays:[],lastStatus:null,lastTrackSeconds:null,lastStops:null,lastLapCount:null,currentStintLapSum:0,currentStintLapCount:0,virtualKart:`V-${String(driver.apex||driver.pos||key).replace(/\D/g,'').padStart(2,'0')}`,updatedAt:now};
  item.relays=Array.isArray(item.relays)?item.relays:[];
  const track=analyzerParseDuration(driver.track_timer);
  const stops=analyzerNumeric(driver.pit_stops,null);
  const status=driver.status||'unknown';
  const lapCount=analyzerNumeric(driver.laps,null);
  const lastLapSeconds=parseLapTime(driver.last);
  const exitedPit=item.lastStatus==='pit'&&status==='track';
  const stopIncrement=Number.isFinite(stops)&&Number.isFinite(item.lastStops)&&stops>item.lastStops;
  const enteredPit=item.lastStatus==='track'&&status==='pit';

  if(!item.currentRelay&&status==='track')item.currentRelay=analyzerNewRelay(item,driver,now,gridReference);
  if(enteredPit||stopIncrement){
   analyzerFinalizeRelay(item,now,gridReference);
   if(Number.isFinite(item.lastTrackSeconds)&&item.lastTrackSeconds>=30){
    if(!item.stints.length||Math.abs(item.stints[item.stints.length-1]-item.lastTrackSeconds)>2)item.stints.push(item.lastTrackSeconds);
    item.stints=item.stints.slice(-12);
   }
  }
  if((exitedPit||stopIncrement)&&status==='track'){
   item.currentRelay=analyzerNewRelay(item,driver,now,gridReference);
   item.currentStintLapSum=0;item.currentStintLapCount=0;item.lastLapCount=lapCount;
  }
  if(status==='track'&&!item.currentRelay)item.currentRelay=analyzerNewRelay(item,driver,now,gridReference);
  if(status==='track'&&item.currentRelay){
   const livePilot=analyzerDriverPilot(driver),liveKart=analyzerRelayKart(driver);
   if(livePilot)item.currentRelay.pilot=livePilot;
   if(liveKart)item.currentRelay.kart=liveKart;
  }

  if(status==='track'&&Number.isFinite(lapCount)&&Number.isFinite(item.lastLapCount)&&lapCount>item.lastLapCount&&Number.isFinite(lastLapSeconds)){
   const relay=item.currentRelay;
   if(relay){
    // Le premier tour observé de chaque relais est ignoré : départ ou tour de sortie des stands.
    if(!relay.warmupSkipped)relay.warmupSkipped=true;
    else{
     const seen=new Set((relay.lapNumbers||[]).map(Number));
     if(!seen.has(Number(lapCount))){
      relay.lapSum=(Number(relay.lapSum)||0)+lastLapSeconds;
      relay.lapCount=(Number(relay.lapCount)||0)+1;
      relay.laps=[...(relay.laps||[]),lastLapSeconds].slice(-60);
      relay.lapNumbers=[...(relay.lapNumbers||[]),Number(lapCount)].slice(-60);
      relay.bestLaps=(relay.laps||[]).slice().sort((a,b)=>a-b).slice(0,3);
      relay.gridEndPace=gridReference;
      item.currentStintLapSum=relay.lapSum;item.currentStintLapCount=relay.lapCount;
     }
    }
   }
  }
  item.name=driver.driver;item.lastStatus=status;item.lastTrackSeconds=track;item.lastStops=stops;item.lastLapCount=lapCount;item.updatedAt=now;
  analyzerLearning.teams[key]=item;
 });
 analyzerSaveLearning();
}
function analyzerTeamHistory(driver){return analyzerLearning.teams[analyzerTeamKey(driver)]||{stints:[],relays:[],virtualKart:`V-${String(driver?.apex||driver?.pos||'--')}`}}
function analyzerCurrentRelay(driver){
 const history=analyzerTeamHistory(driver);
 return history.currentRelay||null;
}
function analyzerCurrentStintAverage(driver){
 const relay=analyzerCurrentRelay(driver);
 if(relay&&Number(relay.lapCount)>0)return Number(relay.lapSum)/Number(relay.lapCount);
 const history=analyzerTeamHistory(driver),sum=Number(history.currentStintLapSum),count=Number(history.currentStintLapCount);
 return Number.isFinite(sum)&&Number.isFinite(count)&&count>0?sum/count:null;
}
function analyzerRelayTimer(driver){
 const inPit=driver?.status==='pit';
 const value=inPit?(String(driver?.pit_timer||driver?.timer||'').trim()||'00:00'):(String(driver?.track_timer||driver?.timer||'').trim()||'—');
 return {inPit,value};
}
function analyzerPitIndicator(driver){return driver?.status==='pit'?'<span class="pit-status-badge pit-in analyzer-pit-in">IN</span>':''}
function analyzerPaceSeconds(driver){return parseLapTime(driver?.pace5||driver?.best)}
function analyzerGridPace(){return (state.drivers||[]).map(analyzerPaceSeconds).filter(Number.isFinite).sort((a,b)=>a-b)}
function analyzerPitSeconds(pit){
 const direct=Number(pit?.pitOutMs)-Number(pit?.pitInMs);
 if(Number.isFinite(direct)&&direct>0)return direct/1000;
 return analyzerParseDuration(pit?.pitTime);
}
function analyzerVirtualPitAverage(driver){
 const key=`${analyzerSessionCircuit()}:${Number(driver?.apex_row)||0}`,entry=analyzerVirtualPitCache.get(key);
 if(entry?.status==='loaded'){
  const values=(entry.pits||[]).map(analyzerPitSeconds).filter(v=>Number.isFinite(v)&&v>0).sort((a,b)=>a-b).slice(0,3);
  if(values.length)return {seconds:values.reduce((a,b)=>a+b,0)/values.length,samples:values.length,estimated:false};
 }
 return {seconds:analyzerRules.minPitSeconds,samples:0,estimated:true};
}
function analyzerVirtualMetrics(rows){
 const maxStops=Math.max(0,...rows.map(x=>analyzerNumeric(x.driver?.pit_stops,0)));
 const maxLaps=Math.max(0,...rows.map(x=>analyzerNumeric(x.driver?.laps,0)));
 const gridPace=analyzerGridPace(),fallbackPace=gridPace.length?gridPace[Math.floor(gridPace.length/2)]:60;
 const output=rows.map(x=>{
  const d=x.driver,stops=analyzerNumeric(d.pit_stops,0),missing=Math.max(0,maxStops-stops),pitAverage=analyzerVirtualPitAverage(d);
  const extra=missing*pitAverage.seconds,laps=analyzerNumeric(d.laps,0),lapDeficit=Math.max(0,maxLaps-laps),pace=analyzerPaceSeconds(d)||fallbackPace;
  const parsedGap=analyzerParseDuration(String(d.gap||'').replace(/^\+/,'').replace(/\s*(tour|tours|lap|laps).*$/i,''));
  const baseDeficit=lapDeficit>0?lapDeficit*pace:(Number.isFinite(parsedGap)?parsedGap:0);
  return {...x,virtual:{maxStops,missing,pitAverage,extra,baseDeficit,totalDeficit:baseDeficit+extra}};
 }).sort((a,b)=>a.virtual.totalDeficit-b.virtual.totalDeficit||analyzerNumeric(a.driver.pos,999)-analyzerNumeric(b.driver.pos,999));
 const leader=output[0]?.virtual.totalDeficit||0;
 output.forEach((x,index)=>{x.virtual.position=index+1;x.virtual.gap=Math.max(0,x.virtual.totalDeficit-leader)});
 return output;
}
async function analyzerLoadVirtualPitData(){
 if(analyzerVirtualLoading)return;
 const drivers=(state.drivers||[]).filter(d=>Number(d.apex_row)>0),missing=drivers.filter(d=>analyzerVirtualPitCache.get(`${analyzerSessionCircuit()}:${Number(d.apex_row)}`)?.status!=='loaded');
 if(!missing.length){renderAnalyzer();return}
 analyzerVirtualLoading=true;const token=++analyzerVirtualLoadToken;renderAnalyzer();
 for(const driver of missing){
  if(token!==analyzerVirtualLoadToken)break;
  const rowId=Number(driver.apex_row),cacheKey=`${analyzerSessionCircuit()}:${rowId}`;analyzerVirtualPitCache.set(cacheKey,{status:'loading',pits:[]});renderAnalyzer();
  try{const pits=await fetchAllApexTeamPits(rowId,'',null);analyzerVirtualPitCache.set(cacheKey,{status:'loaded',pits,updatedAt:Date.now()})}
  catch(error){analyzerVirtualPitCache.set(cacheKey,{status:'error',pits:[],error:String(error?.message||error)})}
  renderAnalyzer();
 }
 analyzerVirtualLoading=false;renderAnalyzer();
}
function setAnalyzerRankingMode(mode){
 analyzerRankingMode=mode==='virtual'?'virtual':'general';
 document.getElementById('analyzerGeneralRankingBtn')?.classList.toggle('active',analyzerRankingMode==='general');
 document.getElementById('analyzerVirtualRankingBtn')?.classList.toggle('active',analyzerRankingMode==='virtual');
 renderAnalyzer();
 if(analyzerRankingMode==='virtual')analyzerLoadVirtualPitData();
}
function analyzerRelayRawMetrics(driver,gridNow=null){
 const history=analyzerTeamHistory(driver),relay=history.currentRelay,average=analyzerCurrentStintAverage(driver);
 const bestLaps=(relay?.bestLaps||[]).filter(Number.isFinite);
 const best3=bestLaps.length?bestLaps.reduce((a,b)=>a+b,0)/bestLaps.length:null;
 const consistency=analyzerStdDev(relay?.laps||[]);
 const previous=(history.relays||[]).slice().reverse().find(item=>Number.isFinite(item.average)&&Number(item.lapCount)>=3);
 const currentGrid=Number.isFinite(gridNow)?gridNow:(analyzerMedian(analyzerGridPace())||null);
 const previousGrid=Number(previous?.gridEndPace)||Number(previous?.gridStartPace);
 // Convention sport automobile : un temps qui baisse est un delta négatif (gain),
 // un temps qui monte est un delta positif (perte).
 const rawDelta=Number.isFinite(previous?.average)&&Number.isFinite(average)?average-previous.average:null;
 const gridDelta=Number.isFinite(previousGrid)&&Number.isFinite(currentGrid)?currentGrid-previousGrid:0;
 const correctedDelta=Number.isFinite(rawDelta)?rawDelta-gridDelta:null;
 // Alias historiques conservés pour compatibilité interne : leur signe suit désormais la convention Δ.
 const rawGain=rawDelta,gridGain=gridDelta,correctedGain=correctedDelta;
 const laps=Number(relay?.lapCount)||0;
 const currentPilot=analyzerOfficialCurrentPilot(driver)||relay?.pilot||analyzerDriverPilot(driver)||null,previousPilot=previous?.pilot||null;
 const currentKart=analyzerOfficialCurrentKart(driver)||analyzerRelayKart(driver)||relay?.kart||null,previousKart=previous?.kart||null;
 return {driver,history,relay,average,best3,consistency,rawDelta,gridDelta,correctedDelta,rawGain,gridGain,correctedGain,gridNow:currentGrid,previousGrid:Number.isFinite(previousGrid)?previousGrid:null,previousAverage:previous?.average??null,currentPilot,previousPilot,currentKart,previousKart,laps,relayIndex:Number(relay?.index)||((history.relays||[]).length+1)};
}
function analyzerRelayPopulation(){
 const provisional=(state.drivers||[]).map(driver=>analyzerRelayRawMetrics(driver)).filter(item=>Number.isFinite(item.average)&&item.laps>=3);
 const gridNow=analyzerMedian(provisional.map(item=>item.average))||analyzerMedian(analyzerGridPace());
 return provisional.map(item=>analyzerRelayRawMetrics(item.driver,gridNow));
}
function analyzerPercentileScore(value,values,{lowerIsBetter=true}={}){
 const clean=(values||[]).filter(Number.isFinite).slice().sort((a,b)=>a-b);if(!Number.isFinite(value)||!clean.length)return 50;
 if(clean.length===1)return 100;
 const lower=clean.filter(v=>v<value).length;
 const equal=clean.filter(v=>v===value).length;
 const midRank=lower+(equal-1)/2;
 const percentile=midRank/Math.max(1,clean.length-1);
 return Math.round((lowerIsBetter?1-percentile:percentile)*100);
}
// Velocity V2 — force statistique relative au plateau (robuste aux valeurs extrêmes).
function analyzerRobustDistribution(values){
 const clean=(values||[]).filter(Number.isFinite);
 if(!clean.length)return {median:null,mad:null,sigma:null};
 const median=analyzerMedian(clean),deviations=clean.map(v=>Math.abs(v-median)),mad=analyzerMedian(deviations);
 let sigma=Number.isFinite(mad)&&mad>1e-9?1.4826*mad:analyzerStdDev(clean);
 if(!Number.isFinite(sigma)||sigma<=1e-9)sigma=null;
 return {median,mad,sigma};
}
function analyzerTransitionSignal(delta,values){
 if(!Number.isFinite(delta))return {z:null,median:null,sigma:null};
 const dist=analyzerRobustDistribution(values);
 const z=Number.isFinite(dist.sigma)?(delta-dist.median)/dist.sigma:0;
 return {z,median:dist.median,sigma:dist.sigma};
}
function analyzerTransitionAdaptiveWeights(z,hasTransition=true){
 if(!hasTransition||!Number.isFinite(z))return {pace:.60,transition:0,potential:.20,consistency:.133333,sample:.066667};
 // Signal normal jusqu'à 0,5σ ; montée progressive ; poids max à partir de 2σ.
 const strength=Math.max(0,Math.min(1,(Math.abs(z)-.5)/1.5));
 const transition=.25+.20*strength,pace=.45-.20*strength;
 return {pace,transition,potential:.15,consistency:.10,sample:.05};
}
function analyzerKartAttributionConfidence(raw,baseConfidence){
 let confidence=Number(baseConfidence)||0;
 const current=analyzerNormalizePilot(raw?.currentPilot||''),previous=analyzerNormalizePilot(raw?.previousPilot||'');
 if(current&&previous){confidence+=current===previous?5:-20}else if(Number.isFinite(raw?.correctedDelta)){confidence-=10}
 return Math.max(20,Math.min(95,confidence));
}
function analyzerRelayMetrics(driver){
 const population=analyzerRelayPopulation();
 const sharedGrid=population[0]?.gridNow??analyzerMedian(analyzerGridPace());
 const raw=analyzerRelayRawMetrics(driver,sharedGrid);
 const eligible=population.length?population:[raw].filter(item=>Number.isFinite(item.average)&&item.laps>=3);
 const paceScore=analyzerPercentileScore(raw.average,eligible.map(item=>item.average));
 const transitionValues=eligible.map(item=>item.correctedDelta).filter(Number.isFinite);
 const hasTransition=Number.isFinite(raw.correctedDelta)&&transitionValues.length>=3;
 const transitionScore=hasTransition?analyzerPercentileScore(raw.correctedDelta,transitionValues,{lowerIsBetter:true}):null;
 const signal=hasTransition?analyzerTransitionSignal(raw.correctedDelta,transitionValues):{z:null,median:null,sigma:null};
 const weights=analyzerTransitionAdaptiveWeights(signal.z,hasTransition);
 const potentialValues=eligible.map(item=>item.best3).filter(Number.isFinite);
 const potentialScore=Number.isFinite(raw.best3)&&potentialValues.length?analyzerPercentileScore(raw.best3,potentialValues):paceScore;
 const consistencyValues=eligible.map(item=>item.consistency).filter(Number.isFinite);
 const consistencyScore=Number.isFinite(raw.consistency)&&consistencyValues.length?analyzerPercentileScore(raw.consistency,consistencyValues):50;
 const lapValues=eligible.map(item=>item.laps).filter(Number.isFinite);
 const sampleScore=lapValues.length?analyzerPercentileScore(raw.laps,lapValues,{lowerIsBetter:false}):50;
 const score=Math.round(paceScore*weights.pace+(transitionScore??0)*weights.transition+potentialScore*weights.potential+consistencyScore*weights.consistency+sampleScore*weights.sample);
 let confidence=raw.laps<3?20:raw.laps<5?40:raw.laps<8?65:85;
 if(Number.isFinite(raw.correctedDelta)&&Number.isFinite(raw.gridNow))confidence+=5;
 if(population.length>=6)confidence+=5;
 confidence=analyzerKartAttributionConfidence(raw,confidence);
 return {...raw,score:Math.max(0,Math.min(100,score)),confidence,transitionZ:signal.z,transitionMedian:signal.median,transitionSigma:signal.sigma,weights,criteria:{pace:paceScore,transition:transitionScore,potential:potentialScore,consistency:consistencyScore,sample:sampleScore},criteriaPopulation:{pace:eligible.map(item=>item.average).filter(Number.isFinite).length,transition:transitionValues.length,potential:potentialValues.length,consistency:consistencyValues.length,sample:lapValues.length},populationSize:eligible.length,status:raw.laps<3?'learning':'rated'};
}



/* Velocity V7.2.107 — Score Relais reconstruit depuis les STATS Apex */
function analyzerQualificationSessionName(name){
 const normalized=String(name||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 return /(^|\b)(qualification|qualif|qualifying|tijdrijden|chrono|chronos|time trial|time attack)(\b|$)/i.test(normalized);
}
function analyzerSessionKind(session){
 const explicit=String(session?.kind||'').trim().toLowerCase();
 if(explicit)return explicit;
 return analyzerQualificationSessionName(session?.name)?'qualification':'other';
}
function analyzerRelayScorePilotLabel(driver){
 const team=String(driver?.driver||'—').trim()||'—';
 const pilot=String(analyzerOfficialCurrentPilot(driver)||analyzerDriverPilot(driver)||'').trim();
 return pilot&&analyzerNormalizePilot(pilot)!==analyzerNormalizePilot(team)?`${team} / ${pilot}`:team;
}
function analyzerRelayScoreSlices(laps,pits,driver=null){
 const clean=analyzerDebriefCleanLaps(laps,pits);
 const chronologicalPits=(pits||[]).slice().sort((a,b)=>Number(a?.stop)-Number(b?.stop));
 const pitLaps=chronologicalPits.map(p=>Number(p?.lap)).filter(Number.isFinite).sort((a,b)=>a-b);
 const bounds=[0,...pitLaps,Infinity],relays=[];
 for(let i=0;i<bounds.length-1;i++){
  let segment=clean.filter(l=>Number(l.lap)>bounds[i]&&Number(l.lap)<bounds[i+1]);
  if(segment.length>1)segment=segment.slice(1); // départ / tour de sortie
  const values=segment.map(l=>Number(l.seconds)).filter(Number.isFinite);
  if(!values.length)continue;
  const sorted=values.slice().sort((a,b)=>a-b),top3=sorted.slice(0,3);
  // Le .P Apex rattache chaque arrêt au pilote du relais qui vient de se terminer.
  // Le dernier relais sans arrêt terminé utilise le pilote courant officiel de .INF.
  const completedPilot=String(chronologicalPits[i]?.driverName||'').trim();
  const currentPilot=i===bounds.length-2?String(analyzerOfficialCurrentPilot(driver)||'').trim():'';
  relays.push({index:i+1,from:segment[0]?.lap||null,to:segment[segment.length-1]?.lap||null,laps:values.length,average:analyzerMean(values),best3:analyzerMean(top3),consistency:analyzerStdDev(values),values,lapPoints:segment.map(l=>({lap:Number(l.lap),seconds:Number(l.seconds)})).filter(l=>Number.isFinite(l.lap)&&Number.isFinite(l.seconds)),pilot:completedPilot||currentPilot||null});
 }
 return relays;
}
function analyzerRelayScoreQualificationAverage(laps,pits){
 let clean=analyzerDebriefCleanLaps(laps,pits);
 if(clean.length>1)clean=clean.slice(1);
 const values=clean.map(l=>Number(l.seconds)).filter(Number.isFinite);
 return values.length>=2?analyzerMean(values):null;
}
async function analyzerRelayScoreEnsureSessions(){
 if(apexPreviousSessions.length)return apexPreviousSessions;
 try{apexPreviousSessions=await apexSessionsRequest()}catch(_){apexPreviousSessions=parseApexPreviousSessions(await apexHistoryRequest('S#'))}
 return apexPreviousSessions;
}
async function analyzerRelayScoreQualificationContext(drivers){
 let sessions=[];try{sessions=await analyzerRelayScoreEnsureSessions()}catch(_){return {session:null,grid:null,byRow:new Map()}}
 const session=sessions.find(item=>analyzerSessionKind(item)==='qualification');
 if(!session)return {session:null,grid:null,byRow:new Map()};
 let historical=[];try{historical=parseApexSnapshotTeams(await apexHistoryRequest(`S#${session.id}`))}catch(_){historical=[]}
 const byRow=new Map(),averages=[];
 for(const driver of drivers){
  const liveName=normalizeApexTeamName(driver.driver),livePilot=normalizeApexTeamName(analyzerOfficialCurrentPilot(driver)||analyzerDriverPilot(driver)||''),liveKart=String(analyzerOfficialCurrentKart(driver)||validKartNumber(driver)||driver.apex||'').trim();
  const match=historical.find(team=>normalizeApexTeamName(team.name)===liveName)||historical.find(team=>livePilot&&normalizeApexTeamName(team.name)===livePilot)||historical.find(team=>liveKart&&String(team.kart||'').trim()===liveKart);
  if(!match)continue;
  try{
   const [laps,pits]=await Promise.all([fetchAllApexTeamLaps(match.rowId,session.id,null),fetchAllApexTeamPits(match.rowId,session.id,null).catch(()=>[])]);
   const average=analyzerRelayScoreQualificationAverage(laps,pits);
   if(Number.isFinite(average)){byRow.set(Number(driver.apex_row),average);averages.push(average)}
  }catch(_){ }
 }
 return {session,grid:analyzerMedian(averages),byRow};
}
function analyzerRelayWindowValues(team,from,to){
 const values=[];
 for(const relay of (team?.relays||[]))for(const point of (relay?.lapPoints||[]))if(Number(point.lap)>=Number(from)&&Number(point.lap)<=Number(to)&&Number.isFinite(Number(point.seconds)))values.push(Number(point.seconds));
 return values;
}
function analyzerRelayWindowPeerMetrics(teams,relay){
 const from=Number(relay?.from),to=Number(relay?.to);if(!Number.isFinite(from)||!Number.isFinite(to))return [];
 return (teams||[]).map(team=>{const values=analyzerRelayWindowValues(team,from,to);if(values.length<3)return null;const sorted=values.slice().sort((a,b)=>a-b);return {team,average:analyzerMean(values),best3:analyzerMean(sorted.slice(0,3)),consistency:analyzerStdDev(values),laps:values.length}}).filter(Boolean);
}
function analyzerRelayWindowGrid(teams,relay){return analyzerMedian(analyzerRelayWindowPeerMetrics(teams,relay).map(x=>x.average).filter(Number.isFinite))}
function analyzerRelayScoreCompute(teams,qualification){
 const maxRelay=Math.max(0,...teams.map(team=>team.relays.length)),matrix=new Map(),gridByRelay=new Map(),allTransitions=[];
 // Pré-calcul des transitions avec une référence plateau sur la même fenêtre de tours.
 for(const team of teams){
  for(const relay of team.relays){
   if(relay.laps<3||!Number.isFinite(relay.average))continue;
   const previous=team.relays.find(r=>r.index===relay.index-1)||null;
   const gridNow=analyzerRelayWindowGrid(teams,relay);
   const previousGrid=previous?analyzerRelayWindowGrid(teams,previous):qualification.grid;
   const previousAverage=previous?.average??qualification.byRow.get(Number(team.driver.apex_row));
   const rawDelta=Number.isFinite(previousAverage)?relay.average-previousAverage:null;
   const gridDelta=Number.isFinite(gridNow)&&Number.isFinite(previousGrid)?gridNow-previousGrid:0;
   const correctedDelta=Number.isFinite(rawDelta)?rawDelta-gridDelta:null;
   const midpoint=(Number(relay.from)+Number(relay.to))/2;
   allTransitions.push({team,relay,previous,previousAverage,gridNow,previousGrid,rawDelta,gridDelta,correctedDelta,midpoint});
  }
 }
 for(let index=1;index<=maxRelay;index++){
  const indexRows=allTransitions.filter(x=>x.relay.index===index);gridByRelay.set(index,analyzerMedian(indexRows.map(x=>x.gridNow).filter(Number.isFinite)));
 }
 for(const raw of allTransitions){
  const peers=analyzerRelayWindowPeerMetrics(teams,raw.relay);
  const paceValues=peers.map(x=>x.average).filter(Number.isFinite),potentialValues=peers.map(x=>x.best3).filter(Number.isFinite),consistencyValues=peers.map(x=>x.consistency).filter(Number.isFinite),lapValues=peers.map(x=>x.laps).filter(Number.isFinite);
  let transitionPeers=allTransitions.filter(x=>Number.isFinite(x.correctedDelta)&&Number.isFinite(x.midpoint)&&Math.abs(x.midpoint-raw.midpoint)<=30).map(x=>x.correctedDelta);
  if(transitionPeers.length<6)transitionPeers=allTransitions.map(x=>x.correctedDelta).filter(Number.isFinite);
  const hasTransition=Number.isFinite(raw.correctedDelta)&&transitionPeers.length>=3;
  const pace=analyzerPercentileScore(raw.relay.average,paceValues),transition=hasTransition?analyzerPercentileScore(raw.correctedDelta,transitionPeers):null,potential=Number.isFinite(raw.relay.best3)?analyzerPercentileScore(raw.relay.best3,potentialValues):50,consistency=Number.isFinite(raw.relay.consistency)?analyzerPercentileScore(raw.relay.consistency,consistencyValues):50,sample=analyzerPercentileScore(raw.relay.laps,lapValues,{lowerIsBetter:false});
  const signal=hasTransition?analyzerTransitionSignal(raw.correctedDelta,transitionPeers):{z:null,median:null,sigma:null},weights=analyzerTransitionAdaptiveWeights(signal.z,hasTransition);
  const score=Math.max(0,Math.min(100,Math.round(pace*weights.pace+(transition??0)*weights.transition+potential*weights.potential+consistency*weights.consistency+sample*weights.sample)));
  if(!matrix.has(Number(raw.team.driver.apex_row)))matrix.set(Number(raw.team.driver.apex_row),new Map());
  matrix.get(Number(raw.team.driver.apex_row)).set(raw.relay.index,{...raw,score,criteria:{pace,transition,potential,consistency,sample},weights,transitionZ:signal.z,transitionMedian:signal.median,transitionSigma:signal.sigma,transitionPopulation:transitionPeers.length});
 }
 return {maxRelay,matrix,gridByRelay};
}

async function analyzerLoadRelayScores({force=false}={}){
 if(analyzerRelayScoreLoading)return;
 if(!force&&analyzerRelayScoreData&&Date.now()-analyzerRelayScoreData.updatedAt<60000){
  if(analyzerVelocityView==='relays')analyzerRenderRelayScoreTable();
  else analyzerRefreshVelocityDeltaCells();
  return;
 }
 const drivers=(state.drivers||[]).filter(d=>Number(d.apex_row)>0);if(!drivers.length)return;
 analyzerRelayScoreLoading=true;const token=++analyzerRelayScoreLoadToken;
 // V7.2.107 : la reconstruction STATS est un travail de données en arrière-plan.
 // Ne jamais relancer renderAnalyzer() ici : cela reconstruisait Velocity + Heat Map
 // et provoquait un flash visible à chaque rafraîchissement de SCORE RELAIS.
 if(analyzerVelocityView==='relays'&&!analyzerRelayScoreData){
  const host=document.getElementById('analyzerKartMarket');
  if(host)host.innerHTML='<div class="analyzer-empty">Reconstruction des relais depuis STATS…</div>';
 }
 const teams=[];
 for(let i=0;i<drivers.length;i++){
  if(token!==analyzerRelayScoreLoadToken)break;
  const driver=drivers[i];
  try{const [laps,pits]=await Promise.all([fetchAllApexTeamLaps(Number(driver.apex_row),'',null),fetchAllApexTeamPits(Number(driver.apex_row),'',null).catch(()=>[])]);teams.push({driver,relays:analyzerRelayScoreSlices(laps,pits,driver)})}catch(_){teams.push({driver,relays:[]})}
 }
 if(token===analyzerRelayScoreLoadToken){
  const qualification=await analyzerRelayScoreQualificationContext(drivers);
  const computed=analyzerRelayScoreCompute(teams,qualification);
  analyzerRelayScoreData={teams,qualification,...computed,updatedAt:Date.now()};
 }
 analyzerRelayScoreLoading=false;
 if(token!==analyzerRelayScoreLoadToken)return;
 if(analyzerVelocityView==='relays')analyzerRenderRelayScoreTable();
 else analyzerRefreshVelocityDeltaCells();
}
function analyzerRelayScoreLatestCell(driver){
 const rowId=Number(driver?.apex_row);
 const rowScores=analyzerRelayScoreData?.matrix?.get(rowId);
 if(!rowScores||!rowScores.size)return null;
 let latestIndex=-Infinity,latest=null;
 for(const [index,cell] of rowScores.entries()){
  const relayIndex=Number(index);
  if(Number.isFinite(relayIndex)&&relayIndex>latestIndex){latestIndex=relayIndex;latest=cell}
 }
 return latest;
}

function analyzerVelocityUnifiedMetrics(driver){
 const fallback=analyzerRelayMetrics(driver);
 const cell=analyzerRelayScoreLatestCell(driver);
 if(!cell||!cell.relay)return fallback;
 const relay=cell.relay;
 const index=Number(relay.index)||Number(fallback.relayIndex)||1;
 let populationSize=0;
 if(analyzerRelayScoreData?.matrix){
  for(const row of analyzerRelayScoreData.matrix.values())if(row?.get?.(index))populationSize++;
 }
 const laps=Number(relay.laps)||0;
 let confidence=laps<3?20:laps<5?40:laps<8?65:85;
 if(Number.isFinite(cell.correctedDelta)&&Number.isFinite(cell.gridNow))confidence+=5;
 if(populationSize>=6)confidence+=5;
 confidence=analyzerKartAttributionConfidence({currentPilot:relay.pilot||analyzerOfficialCurrentPilot(driver)||fallback.currentPilot||null,previousPilot:cell.previous?.pilot||fallback.previousPilot||null,correctedDelta:cell.correctedDelta},confidence);
 const bestLaps=(relay.values||[]).filter(Number.isFinite).slice().sort((a,b)=>a-b).slice(0,3);
 return {
  ...fallback,
  relay:{...(fallback.relay||{}),index,lapCount:laps,laps:[...(relay.values||[])],bestLaps,pilot:relay.pilot||fallback.relay?.pilot||null},
  currentPilot:relay.pilot||analyzerOfficialCurrentPilot(driver)||fallback.currentPilot||null,
  currentKart:analyzerOfficialCurrentKart(driver)||fallback.currentKart||null,
  average:relay.average,
  best3:relay.best3,
  consistency:relay.consistency,
  previousAverage:cell.previousAverage,
  previousGrid:cell.previousGrid,
  gridNow:cell.gridNow,
  rawDelta:cell.rawDelta,
  gridDelta:cell.gridDelta,
  correctedDelta:cell.correctedDelta,
  rawGain:cell.rawDelta,
  gridGain:cell.gridDelta,
  correctedGain:cell.correctedDelta,
  laps,
  relayIndex:index,
  score:cell.score,
  confidence,
  transitionZ:cell.transitionZ,
  transitionMedian:cell.transitionMedian,
  transitionSigma:cell.transitionSigma,
  weights:{...(cell.weights||{})},
  criteria:{...cell.criteria},
  criteriaPopulation:{pace:populationSize,transition:populationSize,potential:populationSize,consistency:populationSize,sample:populationSize},
  populationSize,
  status:laps<3?'learning':'rated',
  velocitySource:'stats-relay'
 };
}

function analyzerVelocityDeltaValue(driver,fallback=null){
 // SCORE RELAIS est la source de vérité du Δ dès que les STATS ont été reconstruits.
 const cell=analyzerRelayScoreLatestCell(driver);
 return Number.isFinite(cell?.correctedDelta)?cell.correctedDelta:fallback;
}
function analyzerRefreshVelocityDeltaCells(){
 if(analyzerVelocityView!=='velocity')return;
 document.querySelectorAll('#analyzerKartMarket [data-velocity-delta-row]').forEach(cell=>{
  const rowId=Number(cell.getAttribute('data-velocity-delta-row'));
  const driver=(state.drivers||[]).find(d=>Number(d.apex_row)===rowId);
  if(!driver)return;
  const fallback=analyzerRelayMetrics(driver).correctedDelta;
  const value=analyzerVelocityDeltaValue(driver,fallback);
  cell.textContent=analyzerKartDeltaLabel(value);
  cell.classList.remove('negative','positive','neutral');
  cell.classList.add(Number.isFinite(value)?(value<0?'negative':value>0?'positive':'neutral'):'neutral');
 });
}

function setAnalyzerVelocityView(view){
 const nextView=view==='relays'?'relays':'velocity';
 const enteringRelays=nextView==='relays'&&analyzerVelocityView!=='relays';
 analyzerVelocityView=nextView;
 if(enteringRelays)analyzerRelayScoreScrollLeft=0;
 document.getElementById('analyzerVelocityViewBtn')?.classList.toggle('active',analyzerVelocityView==='velocity');
 document.getElementById('analyzerRelayScoreViewBtn')?.classList.toggle('active',analyzerVelocityView==='relays');
 const sort=document.querySelector('.analyzer-kartiq-sort');if(sort)sort.hidden=analyzerVelocityView==='relays';
 renderAnalyzer();
 if(analyzerVelocityView==='relays'){
  requestAnimationFrame(()=>{
   const xscroll=document.getElementById('analyzerRelayScoreXScroll');
   if(xscroll)xscroll.scrollLeft=enteringRelays?0:Math.min(analyzerRelayScoreScrollLeft,Math.max(0,xscroll.scrollWidth-xscroll.clientWidth));
  });
  analyzerLoadRelayScores();
 }
}
function analyzerRenderRelayScoreTable(marketByScore){
 const host=document.getElementById('analyzerKartMarket');if(!host)return;
 const ordered=(state.drivers||[]).map(driver=>({driver,relayMetrics:analyzerVelocityUnifiedMetrics(driver)})).sort((a,b)=>b.relayMetrics.score-a.relayMetrics.score||analyzerNumeric(a.driver.pos,999)-analyzerNumeric(b.driver.pos,999)).map((item,index)=>({...item,kartiqTop:index+1}));
 if(analyzerRelayScoreLoading&&!analyzerRelayScoreData){host.innerHTML='<div class="analyzer-empty">Reconstruction des relais depuis STATS…</div>';return}
 const data=analyzerRelayScoreData;if(!data){host.innerHTML='<div class="analyzer-empty">Cliquez sur SCORE RELAIS pour reconstruire les relais depuis STATS.</div>';return}
 if(Date.now()-data.updatedAt>60000&&!analyzerRelayScoreLoading)setTimeout(()=>analyzerLoadRelayScores({force:true}),0);
 const maxRelay=Math.max(1,data.maxRelay||0),relayColWidth=56,relayTableWidth=maxRelay*relayColWidth,relayColgroup=`<colgroup>${Array.from({length:maxRelay},()=>`<col class="relay-score-width-col" style="width:${relayColWidth}px;min-width:${relayColWidth}px;max-width:${relayColWidth}px">`).join('')}</colgroup>`,relayHeaders=Array.from({length:maxRelay},(_,i)=>`<th class="relay-score-col">R${i+1}</th>`).join('');
 const byRow=new Map(data.teams.map(team=>[Number(team.driver.apex_row),team]));
 const fixedRows=[],relayRows=[];
 ordered.forEach(item=>{
  const d=item.driver,rowId=Number(d.apex_row),team=byRow.get(rowId),scores=data.matrix.get(rowId)||new Map(),kart=validKartNumber(d)||d.apex||'—';
  const follow=`followDriver(${JSON.stringify(d.driver).replace(/"/g,'&quot;')})`;
  fixedRows.push(`<tr onclick="${follow}"><td class="kartiq-top relay-fixed-top">${item.kartiqTop}</td><td class="kartiq-pos relay-fixed-pos">${analyzerEscape(d.pos||'—')}</td><td class="kartiq-kart relay-fixed-kart">${analyzerEscape(kart)}</td><td class="kartiq-team relay-fixed-team" title="${analyzerEscape(analyzerRelayScorePilotLabel(d))}">${analyzerEscape(analyzerRelayScorePilotLabel(d))}</td></tr>`);
  const relays=Array.from({length:maxRelay},(_,i)=>{const cell=scores.get(i+1),relay=team?.relays?.find(r=>r.index===i+1);if(!cell)return `<td class="relay-score-col empty" title="${relay&&relay.laps<3?'Moins de 3 tours exploitables':'Relais non disponible'}">—</td>`;const delta=Number.isFinite(cell.correctedDelta)?` · Δ ${analyzerKartDeltaLabel(cell.correctedDelta)}`:'';return `<td class="relay-score-col ${analyzerScoreClass(cell.score)} kartiq-tooltip" data-tooltip="R${i+1} · ${relay.laps} tours · T.MOYEN ${formatApexMilliseconds(relay.average*1000)}${delta}">${cell.score}</td>`}).join('');
  relayRows.push(`<tr onclick="${follow}">${relays}</tr>`);
 });
 const qualLabel=data.qualification?.session?.name?`R1 référencé sur ${analyzerEscape(data.qualification.session.name)}`:'R1 sans qualification reconnue : transition neutralisée';
 host.innerHTML=`<div class="relay-score-meta">${qualLabel} · Scores alimentés par les tours, arrêts et pilotes natifs STATS Apex.</div><div class="relay-score-grid"><div class="relay-score-fixed"><table class="analyzer-kartiq-table relay-score-fixed-table"><thead><tr><th class="relay-fixed-top">TOP</th><th class="relay-fixed-pos">POS</th><th class="relay-fixed-kart">KART</th><th class="relay-fixed-team">ÉQUIPE / PILOTE</th></tr></thead><tbody>${fixedRows.join('')}</tbody></table></div><div class="relay-score-xscroll" id="analyzerRelayScoreXScroll"><table class="analyzer-kartiq-table relay-score-table" style="width:${relayTableWidth}px;min-width:${relayTableWidth}px;max-width:${relayTableWidth}px">${relayColgroup}<thead><tr>${relayHeaders}</tr></thead><tbody>${relayRows.join('')}</tbody></table></div></div>`;
 host.classList.add('relay-score-scroll-host');
 const xscroll=document.getElementById('analyzerRelayScoreXScroll');
 if(xscroll){
  xscroll.addEventListener('scroll',()=>{if(analyzerVelocityView==='relays')analyzerRelayScoreScrollLeft=xscroll.scrollLeft},{passive:true});
  requestAnimationFrame(()=>{const maxScroll=Math.max(0,xscroll.scrollWidth-xscroll.clientWidth);xscroll.scrollLeft=Math.min(Math.max(0,analyzerRelayScoreScrollLeft),maxScroll)});
 }
}

const VELOCITY_ENGINE_VERSION='1.0';
const VELOCITY_LAB_CRITERIA=[
 {key:'pace',label:'RYTHME',weight:.50},
 {key:'transition',label:'TRANSITION',weight:.20},
 {key:'potential',label:'POTENTIEL',weight:.15},
 {key:'consistency',label:'RÉGULARITÉ',weight:.10},
 {key:'sample',label:'ÉCHANTILLON',weight:.05}
];
let analyzerVelocityLabSelected=new Set(),analyzerVelocityLabComparing=false,analyzerVelocityLabLastRender=0;
function analyzerVelocityLabMarket(){
 return (state.drivers||[]).map(driver=>({driver,metrics:analyzerVelocityUnifiedMetrics(driver)})).filter(item=>item.metrics.laps>=3).sort((a,b)=>b.metrics.score-a.metrics.score).map((item,index)=>({...item,top:index+1}));
}
function analyzerVelocityLabFormatTime(value){return Number.isFinite(value)?formatApexMilliseconds(value*1000):'—'}
function analyzerVelocityLabFormatSeconds(value,{signed=false}={}){
 if(!Number.isFinite(value))return '—';const sign=signed?(value>0?'+':value<0?'−':''):'';return `${sign}${Math.abs(value).toFixed(3)} s`;
}
function analyzerVelocityLabCriterionContribution(metrics,key){const def=VELOCITY_LAB_CRITERIA.find(item=>item.key===key);return def?Number(metrics?.criteria?.[key]||0)*def.weight:0}
function analyzerVelocityLabConfidenceBase(laps){return laps<3?20:laps<5?40:laps<8?65:85}
function analyzerVelocityLabBest3(metrics){const values=(metrics?.relay?.bestLaps||[]).filter(Number.isFinite).slice(0,3);return values.length?values.map(analyzerVelocityLabFormatTime).join(' · '):'—'}
function analyzerVelocityLabRawRows(metrics,key){
 const pop=metrics?.criteriaPopulation?.[key]??metrics?.populationSize??0;
 if(key==='pace')return [
  ['T.MOYEN',analyzerVelocityLabFormatTime(metrics.average)],
  ['RÉF. PLATEAU',analyzerVelocityLabFormatTime(metrics.gridNow)],
  ['AVANTAGE VS RÉF.',Number.isFinite(metrics.average)&&Number.isFinite(metrics.gridNow)?analyzerVelocityLabFormatSeconds(metrics.gridNow-metrics.average,{signed:true}):'—'],
  ['POPULATION',String(pop)]
 ];
 if(key==='transition'){
  const continuity=analyzerPilotContinuity(metrics);
  const pilotRows=analyzerSessionHasPilotData()?[
   ['PILOTE PRÉCÉDENT',metrics.previousPilot||'—'],
   ['PILOTE ACTUEL',metrics.currentPilot||'—'],
   ['COMPARABILITÉ',continuity.known?(continuity.same?'👤 Pilote identique — forte':'👥 Changement pilote — à nuancer'):'—']
  ]:[];
  return [
   ['KART PRÉCÉDENT',metrics.previousKart||'—'],
   ['KART ACTUEL',metrics.currentKart||'—'],
   ...pilotRows,
   ['RELAIS PRÉCÉDENT',analyzerVelocityLabFormatTime(metrics.previousAverage)],
   ['RELAIS ACTUEL',analyzerVelocityLabFormatTime(metrics.average)],
   ['RÉF. PLATEAU AVANT',analyzerVelocityLabFormatTime(metrics.previousGrid)],
   ['RÉF. PLATEAU ACTUELLE',analyzerVelocityLabFormatTime(metrics.gridNow)],
   ['DELTA BRUT',analyzerVelocityLabFormatSeconds(metrics.rawDelta,{signed:true})],
   ['DELTA PLATEAU',Number.isFinite(metrics.previousGrid)?analyzerVelocityLabFormatSeconds(metrics.gridDelta,{signed:true}):'—'],
   ['DELTA CORRIGÉ',analyzerVelocityLabFormatSeconds(metrics.correctedDelta,{signed:true})],
   ['POPULATION',String(pop)]
  ];
 }
 if(key==='potential')return [
  ['3 MEILLEURS TOURS',analyzerVelocityLabBest3(metrics)],
  ['MOYENNE TOP 3',analyzerVelocityLabFormatTime(metrics.best3)],
  ['POPULATION',String(pop)]
 ];
 if(key==='consistency')return [
  ['ÉCART-TYPE',analyzerVelocityLabFormatSeconds(metrics.consistency)],
  ['TOURS MESURÉS',String(metrics.laps||0)],
  ['POPULATION',String(pop)]
 ];
 return [
  ['TOURS EXPLOITABLES',String(metrics.laps||0)],
  ['POPULATION',String(pop)]
 ];
}

/* Velocity V7.2.136 — Velocity Lab / mode Relais ou suivi des numéros de kart + export PDF.
   Strictement isolé du classement Velocity et de SCORE RELAIS dans Analyzer. */
let velocityLabMode='official';
let velocityLabSprintSessions=[];
let velocityLabSprintSelected=new Set();
let velocityLabSprintLoading=false;
let velocityLabSprintAnalysis=null;

function setVelocityLabMode(mode){
 velocityLabMode=mode==='sprint'?'sprint':'official';
 document.getElementById('velocityLabOfficialTab')?.classList.toggle('active',velocityLabMode==='official');
 document.getElementById('velocityLabSprintTab')?.classList.toggle('active',velocityLabMode==='sprint');
 const official=document.getElementById('velocityLabOfficialPanel'),sprint=document.getElementById('velocityLabSprintPanel');
 if(official)official.hidden=velocityLabMode!=='official';if(sprint)sprint.hidden=velocityLabMode!=='sprint';
 if(velocityLabMode==='official')analyzerRenderVelocityLab(true);
 else if(!velocityLabSprintSessions.length)loadVelocityLabSprintSessions();
 else renderVelocityLabSprintSessions();
}
function velocityLabSprintRelevantSession(session){return ['qualification','race'].includes(analyzerSessionKind(session))}
function velocityLabSprintAutoIds(sessions){
 const newest=(sessions||[]).filter(velocityLabSprintRelevantSession),ids=new Set();if(!newest.length)return ids;
 let foundQual=false;
 for(let i=0;i<Math.min(newest.length,16);i++){
  const item=newest[i];ids.add(String(item.id));
  if(analyzerSessionKind(item)==='qualification'){
   foundQual=true;
   // Deux groupes de qualification sont généralement contigus dans la liste Apex.
   let j=i+1;while(j<newest.length&&analyzerSessionKind(newest[j])==='qualification'){ids.add(String(newest[j].id));j++}
   break;
  }
 }
 if(!foundQual){[...newest].slice(0,10).forEach(item=>ids.add(String(item.id)))}
 return ids;
}
async function loadVelocityLabSprintSessions(){
 const status=document.getElementById('velocityLabSprintSessionStatus'),button=document.getElementById('velocityLabSprintLoadButton');
 if(status)status.textContent='Interrogation des anciennes sessions Apex…';if(button)button.disabled=true;
 try{
  let sessions=[];try{sessions=await apexSessionsRequest()}catch(_){sessions=parseApexPreviousSessions(await apexHistoryRequest('S#'))}
  const relevant=sessions.filter(velocityLabSprintRelevantSession);
  const auto=velocityLabSprintAutoIds(relevant);
  // Apex expose habituellement les sessions les plus récentes en premier : le Lab les présente en ordre chronologique.
  velocityLabSprintSessions=relevant.slice().reverse().map((session,index)=>({...session,labOrder:index}));
  velocityLabSprintSelected=new Set([...auto]);velocityLabSprintAnalysis=null;
  if(status)status.textContent=relevant.length?`${relevant.length} session(s) Sprint/Qualification détectée(s) · sélection automatique à valider.`:'Aucune qualification/course détectée.';
  renderVelocityLabSprintSessions();
 }catch(error){if(status)status.textContent=`Historique Apex indisponible : ${error.message}`}
 finally{if(button)button.disabled=false}
}
function toggleVelocityLabSprintSession(id,checked){if(checked)velocityLabSprintSelected.add(String(id));else velocityLabSprintSelected.delete(String(id));velocityLabSprintAnalysis=null;renderVelocityLabSprintSessions()}
function toggleVelocityLabSprintTrackKarts(checked){velocityLabSprintAnalysis=null;const results=document.getElementById('velocityLabSprintResults');if(results)results.innerHTML=`<div class="velocity-lab-placeholder">Mode ${checked?'SUIVI KARTS':'RELAIS'} sélectionné. Relancez le calcul.</div>`;}
function moveVelocityLabSprintSession(id,direction){
 const index=velocityLabSprintSessions.findIndex(s=>String(s.id)===String(id)),next=index+Number(direction);if(index<0||next<0||next>=velocityLabSprintSessions.length)return;
 const copy=velocityLabSprintSessions.slice(),tmp=copy[index];copy[index]=copy[next];copy[next]=tmp;velocityLabSprintSessions=copy;velocityLabSprintAnalysis=null;renderVelocityLabSprintSessions();
}
function renderVelocityLabSprintSessions(){
 const host=document.getElementById('velocityLabSprintSessions'),analyze=document.getElementById('velocityLabSprintAnalyzeButton'),includeLive=Boolean(document.getElementById('velocityLabSprintIncludeLive')?.checked);if(!host)return;
 if(!velocityLabSprintSessions.length){host.innerHTML='<div class="analyzer-empty">Aucune session chargée.</div>';if(analyze)analyze.disabled=true;return}
 host.innerHTML=velocityLabSprintSessions.map((s,index)=>{const checked=velocityLabSprintSelected.has(String(s.id)),kind=analyzerSessionKind(s)==='qualification'?'QUALIF':'COURSE';return `<div class="velocity-lab-sprint-session ${checked?'selected':''}"><label><input type="checkbox" ${checked?'checked':''} onchange="toggleVelocityLabSprintSession('${analyzerEscape(String(s.id))}',this.checked)"><b>${kind}</b><span>${analyzerEscape(s.name)}</span><small>ID ${analyzerEscape(String(s.id))}</small></label><div><button type="button" onclick="moveVelocityLabSprintSession('${analyzerEscape(String(s.id))}',-1)" ${index===0?'disabled':''}>↑</button><button type="button" onclick="moveVelocityLabSprintSession('${analyzerEscape(String(s.id))}',1)" ${index===velocityLabSprintSessions.length-1?'disabled':''}>↓</button></div></div>`}).join('')+(includeLive?'<div class="velocity-lab-sprint-session live selected"><label><input type="checkbox" checked disabled><b>LIVE</b><span>SESSION EN COURS</span><small>Dernière étape</small></label></div>':'');
 if(analyze)analyze.disabled=velocityLabSprintLoading||(!velocityLabSprintSelected.size&&!includeLive);
}
function velocityLabSprintPilotKey(value){return normalizeApexTeamName(value)}
function velocityLabSprintMetricsFromLaps(laps){
 let clean=analyzerDebriefCleanLaps(laps||[],[]);if(clean.length>1)clean=clean.slice(1);
 const values=clean.map(l=>Number(l.seconds)).filter(v=>Number.isFinite(v)&&v>0);if(values.length<3)return null;
 const sorted=values.slice().sort((a,b)=>a-b),top3=sorted.slice(0,3);
 return {laps:values.length,average:analyzerMean(values),best3:analyzerMean(top3),consistency:analyzerStdDev(values),values};
}
async function velocityLabSprintPool(items,worker,limit=4){
 const results=new Array(items.length);let cursor=0;
 async function runner(){while(true){const i=cursor++;if(i>=items.length)return;try{results[i]=await worker(items[i],i)}catch(_){results[i]=null}}}
 await Promise.all(Array.from({length:Math.min(limit,Math.max(1,items.length))},runner));return results;
}
async function velocityLabSprintHistoricalData(session,progress){
 const snapshot=parseApexSnapshotTeams(await apexHistoryRequest(`S#${session.id}`));
 const rows=await velocityLabSprintPool(snapshot,async(team,index)=>{
  if(progress)progress(`Chargement ${session.name} · ${index+1}/${snapshot.length}`);
  const laps=await fetchAllApexTeamLaps(team.rowId,session.id,null),metrics=velocityLabSprintMetricsFromLaps(laps);if(!metrics)return null;
  return {pilot:team.name,pilotKey:velocityLabSprintPilotKey(team.name),kart:team.kart||'—',rowId:team.rowId,...metrics};
 },4);
 const entries=rows.filter(Boolean),grid=analyzerMedian(entries.map(x=>x.average).filter(Number.isFinite));
 return {id:String(session.id),name:session.name,kind:analyzerSessionKind(session),live:false,entries,grid};
}
async function velocityLabSprintLiveData(progress){
 const drivers=(state.drivers||[]).filter(d=>Number(d.apex_row)>0);
 const rows=await velocityLabSprintPool(drivers,async(driver,index)=>{
  if(progress)progress(`Chargement LIVE · ${index+1}/${drivers.length}`);
  const laps=await fetchAllApexTeamLaps(Number(driver.apex_row),'',null),metrics=velocityLabSprintMetricsFromLaps(laps);if(!metrics)return null;
  const pilot=String(driver.driver||analyzerOfficialCurrentPilot(driver)||'').trim();
  return {pilot,pilotKey:velocityLabSprintPilotKey(pilot),kart:String(analyzerOfficialCurrentKart(driver)||validKartNumber(driver)||driver.apex||'—'),rowId:Number(driver.apex_row),...metrics};
 },4);
 const entries=rows.filter(Boolean),grid=analyzerMedian(entries.map(x=>x.average).filter(Number.isFinite));
 return {id:'live',name:'SESSION LIVE',kind:'race',live:true,entries,grid};
}
function velocityLabSprintAdaptiveWeights(z,hasTransition=true){return analyzerTransitionAdaptiveWeights(z,hasTransition)}
function velocityLabSprintBuildAnalysis(sessions,trackKartNumbers=false){
 const previousByPilot=new Map(),allRows=[];
 sessions.forEach((session,sessionIndex)=>{
  const eligible=session.entries.filter(e=>e.laps>=3&&Number.isFinite(e.average));
  const paceVals=eligible.map(e=>e.average),potentialVals=eligible.map(e=>e.best3).filter(Number.isFinite),consistencyVals=eligible.map(e=>e.consistency).filter(Number.isFinite),sampleVals=eligible.map(e=>e.laps);
  const stage=[];
  eligible.forEach(entry=>{
   const previous=previousByPilot.get(entry.pilotKey)||null;
   const rawDelta=previous?entry.average-previous.average:null;
   const gridDelta=previous&&Number.isFinite(session.grid)&&Number.isFinite(previous.sessionGrid)?session.grid-previous.sessionGrid:null;
   const correctedDelta=Number.isFinite(rawDelta)&&Number.isFinite(gridDelta)?rawDelta-gridDelta:null;
   stage.push({session,sessionIndex,entry,previous,rawDelta,gridDelta,correctedDelta});
  });
  const transitionVals=stage.map(r=>r.correctedDelta).filter(Number.isFinite);
  stage.forEach(row=>{
   const {entry,correctedDelta}=row,hasTransition=Number.isFinite(correctedDelta)&&transitionVals.length>=3;
   const pace=analyzerPercentileScore(entry.average,paceVals),potential=analyzerPercentileScore(entry.best3,potentialVals),consistency=analyzerPercentileScore(entry.consistency,consistencyVals),sample=analyzerPercentileScore(entry.laps,sampleVals,{lowerIsBetter:false});
   const transition=hasTransition?analyzerPercentileScore(correctedDelta,transitionVals):null,signal=hasTransition?analyzerTransitionSignal(correctedDelta,transitionVals):{z:null,median:null,sigma:null},weights=velocityLabSprintAdaptiveWeights(signal.z,hasTransition);
   const score=Math.max(0,Math.min(100,Math.round(pace*weights.pace+(transition??0)*weights.transition+potential*weights.potential+consistency*weights.consistency+sample*weights.sample)));
   Object.assign(row,{criteria:{pace,transition,potential,consistency,sample},weights,transitionZ:signal.z,transitionMedian:signal.median,transitionSigma:signal.sigma,score});allRows.push(row);
  });
  eligible.forEach(entry=>previousByPilot.set(entry.pilotKey,{...entry,sessionId:session.id,sessionName:session.name,sessionGrid:session.grid}));
 });
 const latestIndex=Math.max(-1,...allRows.map(r=>r.sessionIndex)),latest=allRows.filter(r=>r.sessionIndex===latestIndex).sort((a,b)=>b.score-a.score);
 return {sessions,rows:allRows,latest,trackKartNumbers:Boolean(trackKartNumbers)};
}
function velocityLabSprintDeltaClass(delta){return !Number.isFinite(delta)?'neutral':delta<-.0005?'good':delta>.0005?'bad':'neutral'}
function velocityLabSprintStageLabels(analysis){
 const counts={qualification:0,race:0};
 return (analysis?.sessions||[]).map((session,index)=>{const kind=analyzerSessionKind(session)==='qualification'?'qualification':'race';counts[kind]++;return {index,session,label:kind==='qualification'?(counts[kind]===1?'QUALIF':`QUALIF ${counts[kind]}`):`COURSE ${counts[kind]}`}})
}
function velocityLabSprintMatrices(analysis){
 const stages=velocityLabSprintStageLabels(analysis),pilotMap=new Map(),kartMap=new Map();
 (analysis?.rows||[]).forEach(row=>{
  const pilotKey=row.entry.pilotKey||velocityLabSprintPilotKey(row.entry.pilot),kart=String(row.entry.kart||'—');
  if(!pilotMap.has(pilotKey))pilotMap.set(pilotKey,{name:row.entry.pilot,cells:new Map()});pilotMap.get(pilotKey).cells.set(row.sessionIndex,row);
  if(!kartMap.has(kart))kartMap.set(kart,{name:kart,cells:new Map()});kartMap.get(kart).cells.set(row.sessionIndex,row);
 });
 const pilots=[...pilotMap.values()].sort((a,b)=>String(a.name).localeCompare(String(b.name),'fr',{sensitivity:'base'}));
 const karts=[...kartMap.values()].sort((a,b)=>{const na=Number(a.name),nb=Number(b.name);return Number.isFinite(na)&&Number.isFinite(nb)?na-nb:String(a.name).localeCompare(String(b.name),'fr',{numeric:true})});
 return {stages,pilots,karts}
}
function velocityLabSprintMatrixHtml(title,firstHeader,rows,stages,subValue){
 const head=stages.map(s=>`<th>${analyzerEscape(s.label)}</th>`).join('');
 const body=rows.map(item=>`<tr><th>${analyzerEscape(String(item.name))}</th>${stages.map(stage=>{const row=item.cells.get(stage.index);if(!row)return '<td class="velocity-lab-matrix-empty">—</td>';return `<td><b class="velocity-lab-matrix-score ${analyzerScoreClass(row.score)}">${row.score}</b><small>${analyzerEscape(subValue(row))}</small></td>`}).join('')}</tr>`).join('');
 return `<section class="velocity-lab-matrix-card"><div class="velocity-lab-matrix-title"><strong>${title}</strong><span>${rows.length} ${firstHeader==='PILOTE'?'pilote(s)':'kart(s)'}</span></div><div class="velocity-lab-sprint-table-wrap"><table class="velocity-lab-table velocity-lab-matrix"><thead><tr><th>${firstHeader}</th>${head}</tr></thead><tbody>${body}</tbody></table></div></section>`
}
function renderVelocityLabSprintResults(){
 const host=document.getElementById('velocityLabSprintResults'),analysis=velocityLabSprintAnalysis;if(!host)return;
 if(!analysis){host.innerHTML='<div class="velocity-lab-placeholder">Validez les sessions puis lancez le calcul.</div>';return}
 const current=analysis.latest,trackKarts=Boolean(analysis.trackKartNumbers);
 if(!current.length){host.innerHTML='<div class="analyzer-empty">Aucun pilote avec au moins 3 tours exploitables dans la dernière session.</div>';return}
 const summary=current.map((r,index)=>{const kartCells=`<td class="velocity-lab-kart">${analyzerEscape(r.entry.kart)}</td>`;const prevKart=`<td>${r.previous?analyzerEscape(r.previous.kart):'—'}</td>`;return `<tr><td>${index+1}</td>${kartCells}<td class="velocity-lab-team">${analyzerEscape(r.entry.pilot)}</td><td><b class="velocity-lab-score ${analyzerScoreClass(r.score)}">${r.score}</b></td><td>${analyzerVelocityLabFormatTime(r.entry.average)}</td><td class="sprint-delta ${velocityLabSprintDeltaClass(r.correctedDelta)}">${analyzerVelocityLabFormatSeconds(r.correctedDelta,{signed:true})}</td><td>${Number.isFinite(r.transitionZ)?r.transitionZ.toFixed(2)+'σ':'—'}</td><td>${Math.round(r.weights.pace*100)}%</td><td>${Math.round(r.weights.transition*100)}%</td><td>${r.previous?analyzerEscape(r.previous.sessionName):'—'}</td>${prevKart}</tr>`}).join('');
 const history=analysis.rows.map(r=>{const kartCell=`<td>${analyzerEscape(r.entry.kart)}</td>`;return `<tr><td>${analyzerEscape(r.session.name)}</td><td>${analyzerEscape(r.entry.pilot)}</td>${kartCell}<td>${analyzerVelocityLabFormatTime(r.entry.average)}</td><td>${r.previous?analyzerVelocityLabFormatTime(r.previous.average):'—'}</td><td>${analyzerVelocityLabFormatSeconds(r.rawDelta,{signed:true})}</td><td>${analyzerVelocityLabFormatSeconds(r.gridDelta,{signed:true})}</td><td class="sprint-delta ${velocityLabSprintDeltaClass(r.correctedDelta)}">${analyzerVelocityLabFormatSeconds(r.correctedDelta,{signed:true})}</td><td>${r.criteria.transition??'—'}</td><td>${Number.isFinite(r.transitionZ)?r.transitionZ.toFixed(2)+'σ':'—'}</td><td>${Math.round(r.weights.transition*100)}%</td><td><b>${r.score}</b></td></tr>`}).join('');
 const matrices=velocityLabSprintMatrices(analysis);
 const pilotSub=trackKarts?(row=>`KART ${row.entry.kart}`):(row=>`KART ${row.entry.kart} · non pris en compte`);
 const pilotMatrix=velocityLabSprintMatrixHtml('ÉVOLUTION PAR PILOTE','PILOTE',matrices.pilots,matrices.stages,pilotSub);
 const kartMatrix=trackKarts?velocityLabSprintMatrixHtml('STABILITÉ PAR KART','KART',matrices.karts,matrices.stages,row=>row.entry.pilot):'';
 const modeLabel=trackKarts?'MODE SUIVI KARTS — numéros utilisés pour le suivi et les matrices':'MODE RELAIS — numéros affichés mais non pris en compte';
 const rankingHead=`<th>TOP</th><th>KART</th><th>PILOTE</th><th>SCORE</th><th>T.MOYEN</th><th>Δ CORRIGÉ</th><th>SIGNAL</th><th>PACE</th><th>TRANSITION</th><th>RÉF. PRÉC.</th><th>KART PRÉC.</th>`;
 const historyHead=`<th>SESSION</th><th>PILOTE</th><th>KART</th><th>T.MOYEN</th><th>AVANT</th><th>Δ PILOTE</th><th>Δ PLATEAU</th><th>Δ CORRIGÉ</th><th>NOTE TRANS.</th><th>SIGNAL</th><th>POIDS TRANS.</th><th>SCORE</th>`;
 host.innerHTML=`<div class="velocity-lab-sprint-result-head"><div><span>SCORE SPRINT EXPÉRIMENTAL</span><h3>${analyzerEscape(current[0].session.name)}</h3></div><div class="velocity-lab-sprint-result-tools"><small>${analysis.sessions.length} étape(s) · ${modeLabel} · pondération adaptative</small><button id="velocityLabSprintPdfButton" type="button" onclick="exportVelocityLabSprintPdf()">EXPORTER EN PDF</button></div></div><div class="velocity-lab-sprint-table-wrap"><table class="velocity-lab-table velocity-lab-sprint-ranking"><thead><tr>${rankingHead}</tr></thead><tbody>${summary}</tbody></table></div><div class="velocity-lab-matrices">${pilotMatrix}${kartMatrix}</div><details class="velocity-lab-sprint-details"><summary>DÉTAIL DE TOUTES LES TRANSITIONS (${analysis.rows.length})</summary><div class="velocity-lab-sprint-table-wrap"><table class="velocity-lab-table"><thead><tr>${historyHead}</tr></thead><tbody>${history}</tbody></table></div></details><div class="velocity-lab-note"><b>${trackKarts?'Mode Suivi Karts':'Mode Relais'} :</b> ${trackKarts?'les numéros de kart sont conservés pour suivre un même kart entre plusieurs pilotes et construire la matrice Karts. Le score V2 reste fondé sur les chronos et les transitions relatives au plateau.':'les numéros de kart restent affichés à titre informatif, mais ils ne participent pas au calcul. Chaque session est évaluée comme un nouveau relais du pilote, comme lorsque Velocity ne connaît pas le kart physique en endurance.'} Plus le Δ corrigé est statistiquement anormal par rapport au plateau (|σ|), plus TRANSITION prend du poids (25 → 45 %) et PACE en perd (45 → 25 %).</div>`;
}
function velocityLabSprintPdfPage(title,subtitle){
 const page=analyzerDebriefPdfCreatePage(),ctx=page.ctx;ctx.fillStyle='#111';ctx.fillRect(0,0,page.canvas.width,28);ctx.fillStyle='#bb1018';ctx.fillRect(0,28,page.canvas.width,12);ctx.fillStyle='#111';ctx.font='700 40px Arial';ctx.fillText(title,80,108);ctx.fillStyle='#bb1018';ctx.font='700 21px Arial';ctx.fillText('VELOCITY LAB — SCORE SPRINT',80,148);ctx.fillStyle='#555';ctx.font='18px Arial';ctx.fillText(subtitle,80,184);page.y=230;return page
}
function velocityLabSprintPdfFooter(page,index,total){const {ctx,canvas}=page;ctx.strokeStyle='#c9c9c5';ctx.beginPath();ctx.moveTo(80,1668);ctx.lineTo(canvas.width-80,1668);ctx.stroke();ctx.font='16px Arial';ctx.fillStyle='#666';ctx.fillText(`Velocity Lab · V7.2.136`,80,1702);ctx.fillText(`Page ${index} / ${total}`,canvas.width-165,1702)}
function velocityLabSprintPdfMatrixPage(title,rows,stages,subValue){
 const page=velocityLabSprintPdfPage(title,`${stages.length} session(s) · score principal, référence secondaire sous le score`),ctx=page.ctx,left=70,top=page.y,tableW=1100,firstW=260,colW=(tableW-firstW)/Math.max(1,stages.length),headerH=58,rowH=72;
 ctx.fillStyle='#171717';ctx.fillRect(left,top,tableW,headerH);ctx.fillStyle='#fff';ctx.font='700 14px Arial';ctx.fillText(title.includes('PILOTE')?'PILOTE':'KART',left+12,top+35);stages.forEach((stage,i)=>ctx.fillText(stage.label,left+firstW+i*colW+10,top+35));page.y=top+headerH;
 rows.forEach((item,ri)=>{const y=page.y;ctx.fillStyle=ri%2?'#f0f0ed':'#fff';ctx.fillRect(left,y,tableW,rowH);ctx.strokeStyle='#d8d8d3';ctx.strokeRect(left,y,tableW,rowH);ctx.fillStyle='#222';ctx.font='700 16px Arial';ctx.fillText(String(item.name).slice(0,28),left+12,y+42);stages.forEach((stage,i)=>{const row=item.cells.get(stage.index),x=left+firstW+i*colW;if(!row){ctx.fillStyle='#999';ctx.font='18px Arial';ctx.fillText('—',x+12,y+42);return}ctx.fillStyle='#111';ctx.font='700 23px Arial';ctx.fillText(String(row.score),x+12,y+29);ctx.fillStyle='#666';ctx.font='13px Arial';ctx.fillText(String(subValue(row)).slice(0,20),x+12,y+53)});page.y+=rowH});return page
}
async function exportVelocityLabSprintPdf(){
 const analysis=velocityLabSprintAnalysis,button=document.getElementById('velocityLabSprintPdfButton');if(!analysis?.rows?.length)return;if(button){button.disabled=true;button.textContent='GÉNÉRATION…'}
 try{
  const pages=[],matrices=velocityLabSprintMatrices(analysis),generated=new Date(),latest=analysis.latest||[],trackKarts=Boolean(analysis.trackKartNumbers),modeLabel=trackKarts?'MODE SUIVI KARTS — numéros de kart suivis':'MODE RELAIS — numéros affichés, non pris en compte';
  let page=velocityLabSprintPdfPage('RÉSULTATS SCORE SPRINT',`${modeLabel} · ${generated.toLocaleString('fr-FR')} · ${analysis.sessions.length} session(s) · ${analysis.rows.length} performance(s)`);
  const rankingRows=latest.map((r,i)=>[i+1,r.entry.pilot,`K${r.entry.kart}`,r.score,analyzerVelocityLabFormatTime(r.entry.average),analyzerVelocityLabFormatSeconds(r.correctedDelta,{signed:true}),Number.isFinite(r.transitionZ)?`${r.transitionZ.toFixed(2)}σ`:'—',`${Math.round(r.weights.transition*100)}%`]);
  analyzerDebriefPdfTable(page,['TOP','PILOTE','KART','SCORE','T.MOYEN','Δ CORR.','SIGNAL','TRANS.'],rankingRows.slice(0,24),[60,250,75,85,145,145,110,110],48);
  pages.push(page);
  const pChunk=18,pilotSub=trackKarts?(row=>`KART ${row.entry.kart}`):(row=>`KART ${row.entry.kart} · non pris en compte`);for(let i=0;i<matrices.pilots.length;i+=pChunk)pages.push(velocityLabSprintPdfMatrixPage('ÉVOLUTION PAR PILOTE',matrices.pilots.slice(i,i+pChunk),matrices.stages,pilotSub));
  if(trackKarts){const kChunk=18;for(let i=0;i<matrices.karts.length;i+=kChunk)pages.push(velocityLabSprintPdfMatrixPage('STABILITÉ PAR KART',matrices.karts.slice(i,i+kChunk),matrices.stages,row=>row.entry.pilot))}
  const transitionRows=analysis.rows.map(r=>trackKarts?[r.session.name,r.entry.pilot,`K${r.entry.kart}`,r.score,analyzerVelocityLabFormatSeconds(r.rawDelta,{signed:true}),analyzerVelocityLabFormatSeconds(r.gridDelta,{signed:true}),analyzerVelocityLabFormatSeconds(r.correctedDelta,{signed:true}),Number.isFinite(r.transitionZ)?`${r.transitionZ.toFixed(2)}σ`:'—',`${Math.round(r.weights.transition*100)}%`]:[r.session.name,r.entry.pilot,r.score,analyzerVelocityLabFormatSeconds(r.rawDelta,{signed:true}),analyzerVelocityLabFormatSeconds(r.gridDelta,{signed:true}),analyzerVelocityLabFormatSeconds(r.correctedDelta,{signed:true}),Number.isFinite(r.transitionZ)?`${r.transitionZ.toFixed(2)}σ`:'—',`${Math.round(r.weights.transition*100)}%`]);
  for(let i=0;i<transitionRows.length;i+=22){page=velocityLabSprintPdfPage('DÉTAIL DES TRANSITIONS',`${modeLabel} · performances ${i+1} à ${Math.min(transitionRows.length,i+22)} sur ${transitionRows.length}`);if(trackKarts)analyzerDebriefPdfTable(page,['SESSION','PILOTE','KART','SCORE','Δ PIL.','Δ PLAT.','Δ CORR.','SIGNAL','TRANS.'],transitionRows.slice(i,i+22),[170,210,65,75,100,100,100,90,90],45);else analyzerDebriefPdfTable(page,['SESSION','PILOTE','SCORE','Δ PIL.','Δ PLAT.','Δ CORR.','SIGNAL','TRANS.'],transitionRows.slice(i,i+22),[190,235,80,115,115,115,100,100],45);pages.push(page)}
  pages.forEach((p,i)=>velocityLabSprintPdfFooter(p,i+1,pages.length));
  const jpegs=pages.map(({canvas})=>{const url=canvas.toDataURL('image/jpeg',.92);return {width:canvas.width,height:canvas.height,bytes:analyzerDebriefPdfDataUrlBytes(url)}}),pdf=analyzerDebriefPdfBuild(jpegs),blob=new Blob([pdf],{type:'application/pdf'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`VelocityLab_ScoreSprint_${trackKarts?'SuiviKarts':'Relais'}_${generated.toISOString().slice(0,10)}.pdf`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
 }catch(error){console.error('[Velocity Lab PDF]',error);window.alert(`Impossible de générer le PDF Velocity Lab : ${error.message}`)}finally{if(button){button.disabled=false;button.textContent='EXPORTER EN PDF'}}
}

async function runVelocityLabSprintAnalysis(){
 if(velocityLabSprintLoading)return;const results=document.getElementById('velocityLabSprintResults'),button=document.getElementById('velocityLabSprintAnalyzeButton'),status=document.getElementById('velocityLabSprintSessionStatus');
 const selected=velocityLabSprintSessions.filter(s=>velocityLabSprintSelected.has(String(s.id))),includeLive=Boolean(document.getElementById('velocityLabSprintIncludeLive')?.checked),trackKarts=Boolean(document.getElementById('velocityLabSprintTrackKarts')?.checked);if(!selected.length&&!includeLive)return;
 velocityLabSprintLoading=true;if(button)button.disabled=true;if(results)results.innerHTML='<div class="velocity-lab-placeholder">Chargement des tours Apex…</div>';
 const progress=text=>{if(status)status.textContent=text};
 try{
  const datasets=[];for(const session of selected){datasets.push(await velocityLabSprintHistoricalData(session,progress))}
  if(includeLive)datasets.push(await velocityLabSprintLiveData(progress));
  velocityLabSprintAnalysis=velocityLabSprintBuildAnalysis(datasets,trackKarts);progress(`${datasets.length} étape(s) analysée(s) · ${velocityLabSprintAnalysis.rows.length} performance(s) exploitable(s).`);renderVelocityLabSprintResults();
 }catch(error){if(results)results.innerHTML=`<div class="analyzer-empty">Score Sprint indisponible : ${analyzerEscape(error.message)}</div>`;if(status)status.textContent='Erreur pendant le calcul.'}
 finally{velocityLabSprintLoading=false;renderVelocityLabSprintSessions()}
}

function openVelocityLab(){
 setVelocityLabMode('official');
 analyzerVelocityLabSelected.clear();analyzerVelocityLabComparing=false;analyzerVelocityLabComparisonNeedsRender=false;analyzerVelocityLabLastRender=0;
 document.getElementById('velocityLabOverlay')?.classList.add('active');document.body.classList.add('velocity-lab-open');analyzerRenderVelocityLab(true);
}
function closeVelocityLab(){document.getElementById('velocityLabOverlay')?.classList.remove('active');document.body.classList.remove('velocity-lab-open');analyzerVelocityLabSelected.clear();analyzerVelocityLabComparing=false;analyzerVelocityLabComparisonNeedsRender=false}
function toggleVelocityLabKart(name,checked,input){
 const key=String(name||'');
 if(checked&&analyzerVelocityLabSelected.size>=5&&!analyzerVelocityLabSelected.has(key)){
  if(input)input.checked=false;const status=document.getElementById('velocityLabSelectionStatus');if(status){status.textContent='Maximum 5 karts';status.classList.add('warning');setTimeout(()=>status.classList.remove('warning'),900)}return;
 }
 if(checked)analyzerVelocityLabSelected.add(key);else analyzerVelocityLabSelected.delete(key);
 analyzerVelocityLabComparing=false;analyzerVelocityLabComparisonNeedsRender=false;analyzerRenderVelocityLab(true);
}
function analyzerRenderVelocityLab(force=false){
 const overlay=document.getElementById('velocityLabOverlay');if(!overlay?.classList.contains('active'))return;
 const now=Date.now();if(!force&&now-analyzerVelocityLabLastRender<800)return;analyzerVelocityLabLastRender=now;
 const market=analyzerVelocityLabMarket(),wrap=document.getElementById('velocityLabRanking'),status=document.getElementById('velocityLabSelectionStatus'),button=document.getElementById('velocityLabCompareButton');
 if(wrap)wrap.innerHTML=market.length?`<table class="velocity-lab-table"><thead><tr><th></th><th>TOP</th><th>KART</th><th>ÉQUIPE / PILOTE</th><th>SCORE</th><th>T.MOYEN</th><th>TOURS</th><th>CONFIANCE</th></tr></thead><tbody>${market.map(item=>{const d=item.driver,m=item.metrics,kart=validKartNumber(d)||d.apex||'—',checked=analyzerVelocityLabSelected.has(String(d.driver));return `<tr class="${checked?'selected':''}"><td><input class="velocity-lab-check" type="checkbox" ${checked?'checked':''} aria-label="Comparer ${analyzerEscape(d.driver)}" onchange="toggleVelocityLabKart(${JSON.stringify(String(d.driver)).replace(/"/g,'&quot;')},this.checked,this)"></td><td>${item.top}</td><td class="velocity-lab-kart">${analyzerEscape(kart)}</td><td class="velocity-lab-team">${analyzerEscape(d.driver)}</td><td><b class="velocity-lab-score ${analyzerScoreClass(m.score)}">${m.score}</b></td><td>${analyzerVelocityLabFormatTime(m.average)}</td><td>${m.laps}</td><td>${m.confidence}%</td></tr>`}).join('')}</tbody></table>`:'<div class="analyzer-empty">Au moins 3 tours propres sont nécessaires pour évaluer un relais.</div>';
 const count=analyzerVelocityLabSelected.size;if(status)status.textContent=count?`${count} / 5 kart${count>1?'s':''} sélectionné${count>1?'s':''}`:'Sélectionnez de 2 à 5 karts';if(button)button.disabled=count<2;
 // Le classement du Lab peut rester live, mais une comparaison ouverte est un snapshot de lecture.
 // Ne jamais reconstruire le tableau comparatif pendant le rafraîchissement périodique :
 // cela réinitialise le contexte de scroll/focus du navigateur sur la première ligne.
 if(analyzerVelocityLabComparing){
  if(force&&analyzerVelocityLabComparisonNeedsRender)analyzerRenderVelocityLabComparison();
 }else{const results=document.getElementById('velocityLabResults');if(results)results.innerHTML='<div class="velocity-lab-placeholder">Sélectionnez au moins deux karts puis cliquez sur <b>COMPARER</b>.</div>'}
}
function compareVelocityLab(){if(analyzerVelocityLabSelected.size<2)return;analyzerVelocityLabComparing=true;analyzerVelocityLabComparisonNeedsRender=true;analyzerRenderVelocityLabComparison();analyzerVelocityLabComparisonNeedsRender=false;document.getElementById('velocityLabResults')?.scrollIntoView({behavior:'smooth',block:'start'})}
function analyzerVelocityLabSelectedItems(){
 const drivers=new Map((state.drivers||[]).map(d=>[String(d.driver),d]));
 return [...analyzerVelocityLabSelected].map(name=>drivers.get(name)).filter(Boolean).map(driver=>({driver,metrics:analyzerVelocityUnifiedMetrics(driver)})).filter(item=>item.metrics.laps>=3).sort((a,b)=>b.metrics.score-a.metrics.score);
}
function analyzerVelocityLabMatrixRow(label,items,valueFn,{best='max',className=''}={}){
 const values=items.map(valueFn);const numeric=values.map(v=>Number(v?.numeric)).filter(Number.isFinite);const bestValue=numeric.length?(best==='min'?Math.min(...numeric):Math.max(...numeric)):null;
 return `<tr class="${className}"><th>${analyzerEscape(label)}</th>${values.map(v=>{const isBest=Number.isFinite(bestValue)&&Number.isFinite(Number(v?.numeric))&&Number(v.numeric)===bestValue;return `<td class="${isBest?'velocity-lab-best':''}">${v?.html??'—'}</td>`}).join('')}</tr>`;
}
function analyzerRenderVelocityLabComparison(){
 const items=analyzerVelocityLabSelectedItems(),results=document.getElementById('velocityLabResults');if(!results)return;if(items.length<2){analyzerVelocityLabComparing=false;results.innerHTML='<div class="velocity-lab-placeholder">Les karts sélectionnés ne sont plus tous évaluables.</div>';return}
 // Conserver la position de lecture du tableau pendant les rafraîchissements live.
 // Le Velocity Lab est réactualisé régulièrement par l'Analyzer : sans cette sauvegarde,
 // le remplacement du DOM recréait le conteneur avec scrollTop=0.
 const previousMatrix=results.querySelector('.velocity-lab-matrix-wrap');
 const previousScrollTop=previousMatrix?.scrollTop||0;
 const previousScrollLeft=previousMatrix?.scrollLeft||0;
 const headers=items.map(({driver,metrics})=>`<th><strong>KART ${analyzerEscape(validKartNumber(driver)||driver.apex||'—')}</strong><small>${analyzerEscape(driver.driver)}</small><b>${metrics.score}/100</b></th>`).join('');
 let rows='';
 rows+=analyzerVelocityLabMatrixRow('SCORE OFFICIEL',items,x=>({numeric:x.metrics.score,html:`<b>${x.metrics.score}/100</b>`}));
 rows+=analyzerVelocityLabMatrixRow('CONFIANCE',items,x=>({numeric:x.metrics.confidence,html:`<b>${x.metrics.confidence}%</b>`}));
 for(const def of VELOCITY_LAB_CRITERIA){
  rows+=`<tr class="velocity-lab-section-row"><th colspan="${items.length+1}">${def.label} <span>${Math.round(def.weight*100)} % DU SCORE</span></th></tr>`;
  rows+=analyzerVelocityLabMatrixRow('NOTE /100',items,x=>({numeric:x.metrics.criteria[def.key],html:`<b>${x.metrics.criteria[def.key]}/100</b>`}));
  rows+=analyzerVelocityLabMatrixRow('CONTRIBUTION',items,x=>{const c=analyzerVelocityLabCriterionContribution(x.metrics,def.key);return {numeric:c,html:`+${c.toFixed(2)} pts`}});
  const rawLabels=[...new Set(items.flatMap(x=>analyzerVelocityLabRawRows(x.metrics,def.key).map(row=>row[0])))];
  for(const rawLabel of rawLabels){rows+=analyzerVelocityLabMatrixRow(rawLabel,items,x=>{const found=analyzerVelocityLabRawRows(x.metrics,def.key).find(row=>row[0]===rawLabel);return {html:analyzerEscape(found?.[1]??'—')}} ,{best:'max',className:'velocity-lab-raw-row'})}
 }
 rows+=`<tr class="velocity-lab-section-row"><th colspan="${items.length+1}">CONFIANCE — DÉCOMPOSITION</th></tr>`;
 rows+=analyzerVelocityLabMatrixRow('BASE TOURS',items,x=>{const v=analyzerVelocityLabConfidenceBase(x.metrics.laps);return {numeric:v,html:`${v}%`}});
 rows+=analyzerVelocityLabMatrixRow('BONUS Δ CORRIGÉ',items,x=>{const v=Number.isFinite(x.metrics.correctedDelta)&&Number.isFinite(x.metrics.gridNow)?5:0;return {numeric:v,html:`+${v}%`}});
 rows+=analyzerVelocityLabMatrixRow('BONUS POPULATION ≥ 6',items,x=>{const v=x.metrics.populationSize>=6?5:0;return {numeric:v,html:`+${v}%`}});
 rows+=analyzerVelocityLabMatrixRow('CONFIANCE FINALE',items,x=>({numeric:x.metrics.confidence,html:`<b>${x.metrics.confidence}%</b>`}));
 const contributionTotals=items.map(x=>VELOCITY_LAB_CRITERIA.reduce((sum,d)=>sum+analyzerVelocityLabCriterionContribution(x.metrics,d.key),0));
 const summary=items.map((x,i)=>`<article><span>KART ${analyzerEscape(validKartNumber(x.driver)||x.driver.apex||'—')}</span><strong>${x.metrics.score}</strong><small>Score brut ${contributionTotals[i].toFixed(2)} → arrondi ${x.metrics.score}</small></article>`).join('');
 results.innerHTML=`<div class="velocity-lab-result-head"><div><span>COMPARAISON OFFICIELLE</span><h3>${items.length} KARTS — ENGINE V${VELOCITY_ENGINE_VERSION}</h3></div><small>Snapshot au clic · lecture seule · pondérations officielles 50 / 20 / 15 / 10 / 5</small></div><div class="velocity-lab-score-summary">${summary}</div><div class="velocity-lab-matrix-wrap"><table class="velocity-lab-matrix"><thead><tr><th>FACTEUR</th>${headers}</tr></thead><tbody>${rows}</tbody></table></div><div class="velocity-lab-note">Les valeurs affichées proviennent directement du moteur Velocity utilisé par l’Analyzer. Velocity Lab n’applique aucune pondération alternative et ne modifie jamais le score de course.</div>`;
 const nextMatrix=results.querySelector('.velocity-lab-matrix-wrap');
 if(nextMatrix){nextMatrix.scrollTop=previousScrollTop;nextMatrix.scrollLeft=previousScrollLeft}
}

function analyzerKartScore(driver){return analyzerVelocityUnifiedMetrics(driver).score}
function analyzerConfidence(driver){return analyzerVelocityUnifiedMetrics(driver).confidence}
function analyzerExpectedStint(driver){
 const h=analyzerTeamHistory(driver);const max=analyzerRules.maxStintMinutes*60;
 const valid=(h.stints||[]).filter(v=>v>=analyzerRules.minStintMinutes*60&&v<=max+180);
 if(!valid.length)return Math.max(analyzerRules.minStintMinutes*60,max-analyzerRules.safetyMarginMinutes*60);
 const recent=valid.slice(-5).sort((a,b)=>a-b);
 const median=recent[Math.floor(recent.length/2)];
 return Math.min(max,Math.max(analyzerRules.minStintMinutes*60,median));
}
function analyzerForecastFor(driver){
 const track=analyzerParseDuration(driver.track_timer);
 const max=analyzerRules.maxStintMinutes*60;
 if(driver.status==='pit')return {seconds:0,label:'IN',maxRemaining:0,track,confidence:100};
 if(!Number.isFinite(track))return {seconds:null,label:'—',maxRemaining:null,track:null,confidence:15};
 const expected=analyzerExpectedStint(driver);
 const predicted=Math.max(0,expected-track);
 const maxRemaining=Math.max(0,max-track);
 const seconds=Math.min(predicted,maxRemaining);
 const history=analyzerTeamHistory(driver);
 const confidence=Math.min(98,history.stints.length?55+history.stints.length*8:35);
 return {seconds,label:analyzerFormatDuration(seconds),maxRemaining,track,confidence};
}
function analyzerTrackClass(seconds){
 if(!Number.isFinite(seconds))return '';
 const max=analyzerRules.maxStintMinutes*60;
 if(seconds>=max-analyzerRules.safetyMarginMinutes*60)return 'red';
 if(seconds>=max-15*60)return 'orange';
 return 'green';
}
function analyzerScoreClass(score){return score>=82?'high':score>=65?'mid':'low'}
function analyzerRows(){
 return (state.drivers||[]).map(d=>{const f=analyzerForecastFor(d);return {driver:d,forecast:f,score:analyzerKartScore(d),confidence:analyzerConfidence(d),history:analyzerTeamHistory(d)}});
}
function analyzerAverageSortValue(row){
 const value=analyzerCurrentStintAverage(row?.driver);
 return Number.isFinite(value)&&value>0?value:Number.POSITIVE_INFINITY;
}
function analyzerSortComparator(sort=analyzerSort){
 const position=(a,b)=>analyzerNumeric(a.driver.pos,999)-analyzerNumeric(b.driver.pos,999);
 const sorters={
  position,
  average:(a,b)=>analyzerAverageSortValue(a)-analyzerAverageSortValue(b)||position(a,b),
  track_desc:(a,b)=>(b.forecast.track??-1)-(a.forecast.track??-1)||position(a,b),
  forecast:(a,b)=>(a.forecast.seconds??999999)-(b.forecast.seconds??999999)||position(a,b),
  score:(a,b)=>b.score-a.score||position(a,b),
  stops:(a,b)=>analyzerNumeric(b.driver.pit_stops,-1)-analyzerNumeric(a.driver.pit_stops,-1)||position(a,b)
 };
 return sorters[sort]||position;
}
function analyzerSortedRows(){
 return analyzerRows().sort(analyzerSortComparator());
}
function analyzerRemainingSeconds(){const ms=typeof liveRemainingMilliseconds==='function'?liveRemainingMilliseconds():null;return Number.isFinite(ms)?ms/1000:analyzerParseDuration(state.time_remaining)}
function analyzerStopsInfo(followed){
 const done=analyzerNumeric(followed?.pit_stops,0);const remaining=Math.max(0,analyzerRules.requiredStops-done);const raceRemaining=analyzerRemainingSeconds();
 const usable=Number.isFinite(raceRemaining)?Math.max(0,raceRemaining-analyzerRules.pitCloseMinutes*60):null;
 const cadence=remaining>0&&Number.isFinite(usable)?usable/remaining:null;
 return {done,remaining,cadence};
}
function analyzerQueueCandidates(){
 const spotter=analyzerSpotterState();
 if(spotter?.configured&&Array.isArray(spotter.queue)){
  return spotter.queue.map((item,index)=>{
   const file=Math.max(1,Number(item.queueFile)||1);
   const fileItems=spotter.queue.filter(entry=>(Math.max(1,Number(entry.queueFile)||1)===file));
   const fileIndex=fileItems.findIndex(entry=>entry.kv===item.kv);
   const driver=(state.drivers||[]).find(d=>String(d.apex)===String(item.apexKart));
   const score=Number.isFinite(Number(item.score))?Number(item.score):(driver?analyzerKartScore(driver):null);
   const confidence=Number.isFinite(Number(item.confidence))?Number(item.confidence):(driver?analyzerConfidence(driver):15);
   return {queue:file-1,index:Math.max(0,fileIndex),kart:item.apexKart||item.kv,driver,score,confidence,item};
  });
 }
 const output=[];
 (kartQueueState?.queues||[]).forEach((queue,qi)=>queue.forEach((kart,index)=>{
  const driver=(state.drivers||[]).find(d=>String(d.apex)===String(kart));
  output.push({queue:qi,index,kart,driver,score:driver?analyzerKartScore(driver):null,confidence:driver?analyzerConfidence(driver):15});
 }));
 return output;
}
function analyzerOpportunity(followed,forecasts){
 if(!followed)return {score:0,advice:'SÉLECTIONNEZ UNE ÉQUIPE',detail:'Appuyez sur une ligne du classement.',className:'wait'};
 const own=analyzerForecastFor(followed),track=own.track,max=analyzerRules.maxStintMinutes*60,min=analyzerRules.minStintMinutes*60;
 const available=analyzerQueueCandidates().filter(q=>q.index===0);
 const bestAvailable=available.filter(q=>Number.isFinite(q.score)).sort((a,b)=>b.score-a.score)[0];
 const incoming=forecasts.filter(x=>x.driver.driver!==followed.driver&&Number.isFinite(x.forecast.seconds)&&x.forecast.seconds<=600);
 const bestIncoming=incoming.slice().sort((a,b)=>b.score-a.score)[0];
 let score=25;
 if(Number.isFinite(track))score+=Math.min(35,Math.max(0,(track-min)/(Math.max(1,max-min))*35));
 score+=Math.min(20,available.length*7);
 if(bestAvailable)score+=Math.max(0,(bestAvailable.score-65)*.35);
 score+=Math.min(12,incoming.length*2);
 score=Math.max(0,Math.min(100,Math.round(score)));
 if(Number.isFinite(track)&&track>=max-analyzerRules.safetyMarginMinutes*60)return {score:100,advice:'RENTRER MAINTENANT',detail:`Limite réglementaire dans ${analyzerFormatDuration(Math.max(0,max-track))}.`,className:'urgent'};
 if(Number.isFinite(track)&&track<min)return {score:15,advice:'ATTENDRE',detail:`Relais minimum atteint dans ${analyzerFormatDuration(min-track)}.`,className:'wait'};
 if(bestAvailable&&bestAvailable.score>=82)return {score:Math.max(score,85),advice:'RENTRER — BON KART DISPONIBLE',detail:`File ${queueLetter(bestAvailable.queue)} : kart ${bestAvailable.kart}, note ${bestAvailable.score}/100.`,className:'good'};
 if(bestIncoming&&bestIncoming.score>=85&&Number.isFinite(own.maxRemaining)&&bestIncoming.forecast.seconds<own.maxRemaining-30)return {score,advice:`ATTENDRE ENVIRON ${analyzerFormatDuration(bestIncoming.forecast.seconds)}`,detail:`${bestIncoming.driver.driver} devrait libérer un kart noté ${bestIncoming.score}/100.`,className:'wait'};
 if(score>=75)return {score,advice:'FENÊTRE FAVORABLE',detail:`${incoming.length} équipe(s) attendue(s) dans les 10 prochaines minutes.`,className:'good'};
 return {score,advice:'CONSERVER LE RELAIS',detail:incoming.length?`${incoming.length} kart(s) pourraient être libérés prochainement.`:'Pas de vague imminente détectée.',className:'wait'};
}
function analyzerKartRelayRemaining(driver){
 if(!driver||driver.status==='pit')return null;
 const track=analyzerParseDuration(driver.track_timer);
 if(!Number.isFinite(track))return null;
 return Math.max(0,analyzerRules.maxStintMinutes*60-track);
}
function analyzerKartRelayRemainingLabel(seconds){
 if(!Number.isFinite(seconds))return '—';
 const total=Math.max(0,Math.floor(seconds));
 const hours=Math.floor(total/3600);
 const minutes=Math.floor((total%3600)/60);
 const secs=total%60;
 if(hours>0)return `${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}`;
 return `${String(minutes).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;
}
function analyzerKartRelayRemainingClass(seconds){
 if(!Number.isFinite(seconds))return '';
 if(seconds<=300)return 'danger';
 if(seconds<=600)return 'warning';
 return '';
}
function setAnalyzerKartSort(value){
 analyzerKartSort=['relay-end','delta'].includes(value)?value:'none';
 renderAnalyzer();
}
function analyzerRefreshKartRelayCountdowns(){
 document.querySelectorAll('[data-kartiq-relay-end]').forEach(cell=>{
  const deadline=Number(cell.dataset.kartiqRelayEnd);
  if(!Number.isFinite(deadline))return;
  const seconds=Math.max(0,(deadline-Date.now())/1000);
  cell.textContent=analyzerKartRelayRemainingLabel(seconds);
  cell.classList.remove('warning','danger');
  const className=analyzerKartRelayRemainingClass(seconds);if(className)cell.classList.add(className);
 });
}
if(!window.__kartiqRelayCountdownTimer){window.__kartiqRelayCountdownTimer=setInterval(analyzerRefreshKartRelayCountdowns,1000)}

const analyzerFollowedDeltaHistory={driver:'',position:null,aheadSignature:null,behindSignature:null,ahead:null,behind:null,aheadUnit:'',behindUnit:'',aheadKey:'',behindKey:'',aheadTrend:'neutral',behindTrend:'neutral'};
function analyzerGapMetric(value){
 const raw=String(value??'').trim();
 if(!raw||raw==='—'||raw==='--')return {value:null,unit:''};
 const lapValue=typeof raceLapInterval==='function'?raceLapInterval(raw):null;
 if(Number.isFinite(lapValue))return {value:lapValue,unit:'laps'};
 const normalized=raw.replace(',','.');
 const match=normalized.match(/-?\d+(?:\.\d+)?/);if(!match)return {value:null,unit:''};
 const n=Math.abs(Number(match[0]));return Number.isFinite(n)?{value:n,unit:'seconds'}:{value:null,unit:''};
}
function analyzerGapSeconds(value){
 const metric=analyzerGapMetric(value);return metric.unit==='seconds'?metric.value:null;
}
function analyzerSignedDelta(value,sign){
 const raw=String(value??'').trim();
 if(!raw||raw==='—'||raw==='--')return '—';
 if(typeof raceLapInterval==='function'&&Number.isFinite(raceLapInterval(raw)))return `${sign}${raw.replace(/^[+-]\s*/,'')}`;
 const seconds=analyzerGapSeconds(raw);return Number.isFinite(seconds)?`${sign}${seconds.toFixed(2)}`:'—';
}
function analyzerDeltaSignature(followed){
 if(!followed)return '';
 const lap=Number(followed.laps);
 const lapPart=Number.isFinite(lap)?String(lap):'';
 const lastPart=String(followed.last||followed.last_lap||'').trim();
 return `${lapPart}|${lastPart}`;
}
function analyzerDeltaCompetitorKey(driver){
 if(!driver)return '';
 const apexRow=Number(driver.apex_row);
 if(Number.isFinite(apexRow)&&apexRow>0)return `r${apexRow}`;
 return String(driver.driver||driver.team||driver.pos||'');
}
function analyzerFollowedNeighbors(followed){
 if(!followed)return {ahead:null,behind:null,aheadValue:null,behindValue:null,aheadText:'—',behindText:'—',aheadKey:'',behindKey:''};
 const ahead=typeof sprintDriverAhead==='function'?sprintDriverAhead(followed):null;
 const behind=typeof sprintDriverBehind==='function'?sprintDriverBehind(followed):null;
 // Même source que Focus Sprint / Endurance : formatRaceInterval privilégie
 // data-type="int" Apex, puis gap leader, puis renvoie -- si rien n'est exploitable.
 const aheadText=ahead&&typeof formatRaceInterval==='function'?formatRaceInterval(followed,ahead,'+'):'—';
 const behindText=behind&&typeof formatRaceInterval==='function'?formatRaceInterval(behind,followed,'-'):'—';
 const aheadMetric=analyzerGapMetric(aheadText),behindMetric=analyzerGapMetric(behindText);
 return {
  ahead,behind,
  aheadValue:ahead?aheadMetric.value:null,
  behindValue:behind?behindMetric.value:null,
  aheadUnit:ahead?aheadMetric.unit:'',
  behindUnit:behind?behindMetric.unit:'',
  aheadText:aheadText&&aheadText!=='--'?aheadText:'—',
  behindText:behindText&&behindText!=='--'?behindText:'—',
  aheadKey:analyzerDeltaCompetitorKey(ahead),
  behindKey:analyzerDeltaCompetitorKey(behind)
 };
}
function analyzerUpdateFollowedDeltas(followed){
 const data=analyzerFollowedNeighbors(followed);
 if(!followed){Object.assign(analyzerFollowedDeltaHistory,{driver:'',position:null,aheadSignature:null,behindSignature:null,ahead:null,behind:null,aheadUnit:'',behindUnit:'',aheadKey:'',behindKey:'',aheadTrend:'neutral',behindTrend:'neutral'});return {...data,aheadTrend:'neutral',behindTrend:'neutral'}}
 const driverKey=analyzerDeltaCompetitorKey(followed)||String(state?.followed_driver||followed.pos||'');
 // Les deux deltas sont volontairement indépendants :
 // - DEVANT vient de followed.interval et est échantillonné au passage de l'équipe suivie.
 // - DERRIÈRE vient de behind.interval et est échantillonné au passage du poursuivant.
 // Cela évite de réutiliser une couleur calculée sur une donnée qui n'a pas encore été rafraîchie par Apex.
 const aheadSignature=analyzerDeltaSignature(followed);
 const behindSignature=data.behind?analyzerDeltaSignature(data.behind):'';
 if(analyzerFollowedDeltaHistory.driver!==driverKey){
  Object.assign(analyzerFollowedDeltaHistory,{driver:driverKey,position:Number.isFinite(Number(followed.pos))?Number(followed.pos):null,aheadSignature,behindSignature,ahead:data.aheadValue,behind:data.behindValue,aheadUnit:data.aheadUnit,behindUnit:data.behindUnit,aheadKey:data.aheadKey,behindKey:data.behindKey,aheadTrend:'neutral',behindTrend:'neutral'});
  return {...data,aheadTrend:'neutral',behindTrend:'neutral'};
 }
 // V7.2.131 — faits de course prioritaires au franchissement de la ligne :
 // gain de position = Delta DEVANT VERT ; perte de position = Delta DEVANT ORANGE,
 // même si P-1 change et que l'historique d'intervalle doit être réinitialisé.
 const currentPosition=Number(followed.pos);
 const previousPosition=Number(analyzerFollowedDeltaHistory.position);
 const followedCrossedLine=Boolean(aheadSignature&&aheadSignature!==analyzerFollowedDeltaHistory.aheadSignature);
 const lostPositionAtLine=followedCrossedLine&&Number.isFinite(currentPosition)&&Number.isFinite(previousPosition)&&currentPosition>previousPosition;
 const gainedPositionAtLine=followedCrossedLine&&Number.isFinite(currentPosition)&&Number.isFinite(previousPosition)&&currentPosition<previousPosition;
 const positionEventTrend=gainedPositionAtLine?'good':lostPositionAtLine?'bad':'neutral';
 if(followedCrossedLine&&Number.isFinite(currentPosition))analyzerFollowedDeltaHistory.position=currentPosition;
 // Un dépassement, un pit ou un changement de position peut remplacer P-1/P+1.
 // Chaque côté repart de zéro indépendamment afin de ne jamais comparer deux adversaires différents.
 if(analyzerFollowedDeltaHistory.aheadKey!==data.aheadKey){
  analyzerFollowedDeltaHistory.aheadKey=data.aheadKey;
  analyzerFollowedDeltaHistory.ahead=data.aheadValue;
  analyzerFollowedDeltaHistory.aheadUnit=data.aheadUnit;
  analyzerFollowedDeltaHistory.aheadSignature=aheadSignature;
  analyzerFollowedDeltaHistory.aheadTrend=positionEventTrend;
 }
 if(analyzerFollowedDeltaHistory.behindKey!==data.behindKey){
  analyzerFollowedDeltaHistory.behindKey=data.behindKey;
  analyzerFollowedDeltaHistory.behind=data.behindValue;
  analyzerFollowedDeltaHistory.behindUnit=data.behindUnit;
  analyzerFollowedDeltaHistory.behindSignature=behindSignature;
  analyzerFollowedDeltaHistory.behindTrend='neutral';
 }
 const tolerance=.001;
 // Règle Velocity DEVANT : si le retard diminue, on se rapproche => VERT.
 if(aheadSignature&&aheadSignature!==analyzerFollowedDeltaHistory.aheadSignature){
  if(data.aheadUnit&&data.aheadUnit===analyzerFollowedDeltaHistory.aheadUnit&&Number.isFinite(data.aheadValue)&&Number.isFinite(analyzerFollowedDeltaHistory.ahead)){
   analyzerFollowedDeltaHistory.aheadTrend=data.aheadValue<analyzerFollowedDeltaHistory.ahead-tolerance?'good':data.aheadValue>analyzerFollowedDeltaHistory.ahead+tolerance?'bad':'neutral';
  }else analyzerFollowedDeltaHistory.aheadTrend='neutral';
  analyzerFollowedDeltaHistory.aheadSignature=aheadSignature;
  analyzerFollowedDeltaHistory.ahead=Number.isFinite(data.aheadValue)?data.aheadValue:null;
  analyzerFollowedDeltaHistory.aheadUnit=data.aheadUnit||'';
 }
 // Un changement de position connu est prioritaire sur la tendance d'intervalle :
 // gain de place = fait de course positif Velocity (VERT) ;
 // perte de place = fait de course négatif Velocity (ORANGE).
 if(positionEventTrend!=='neutral')analyzerFollowedDeltaHistory.aheadTrend=positionEventTrend;
 // Règle Velocity DERRIÈRE : si notre avance augmente, on s'éloigne => VERT.
 // Si elle diminue, le poursuivant revient => ORANGE.
 if(behindSignature&&behindSignature!==analyzerFollowedDeltaHistory.behindSignature){
  if(data.behindUnit&&data.behindUnit===analyzerFollowedDeltaHistory.behindUnit&&Number.isFinite(data.behindValue)&&Number.isFinite(analyzerFollowedDeltaHistory.behind)){
   analyzerFollowedDeltaHistory.behindTrend=data.behindValue>analyzerFollowedDeltaHistory.behind+tolerance?'good':data.behindValue<analyzerFollowedDeltaHistory.behind-tolerance?'bad':'neutral';
  }else analyzerFollowedDeltaHistory.behindTrend='neutral';
  analyzerFollowedDeltaHistory.behindSignature=behindSignature;
  analyzerFollowedDeltaHistory.behind=Number.isFinite(data.behindValue)?data.behindValue:null;
  analyzerFollowedDeltaHistory.behindUnit=data.behindUnit||'';
 }
 return {...data,aheadTrend:analyzerFollowedDeltaHistory.aheadTrend,behindTrend:analyzerFollowedDeltaHistory.behindTrend};
}
function analyzerRenderFollowedDeltas(followed){
 const data=analyzerUpdateFollowedDeltas(followed),aheadName=document.getElementById('analyzerAheadName'),behindName=document.getElementById('analyzerBehindName'),aheadDelta=document.getElementById('analyzerAheadDelta'),behindDelta=document.getElementById('analyzerBehindDelta');
 if(aheadName)aheadName.textContent=data.ahead?.driver||'—';if(behindName)behindName.textContent=data.behind?.driver||'—';
 if(aheadDelta){aheadDelta.textContent=data.aheadText;aheadDelta.className=data.aheadTrend}
 if(behindDelta){behindDelta.textContent=data.behindText;behindDelta.className=data.behindTrend}
}

function analyzerRenderFollowedPerformance(followed){
 const chronoEl=document.getElementById('analyzerFollowedLastChrono');
 if(!chronoEl)return;
 const rank=followed&&typeof sprintLastLapRanking==='function'?sprintLastLapRanking(followed):null;
 const rankText=rank&&Number.isFinite(rank.rank)?`P${rank.rank}`:'P—';
 const lapText=followed?.last||'—';
 chronoEl.textContent=`${rankText} | ${lapText}`;
}

function analyzerTrafficLapSeconds(driver){
 const candidates=[driver?.last,driver?.best,driver?.avg5,driver?.average];
 for(const value of candidates){
  const seconds=typeof parseLap==='function'?parseLap(value):null;
  if(Number.isFinite(seconds)&&seconds>20&&seconds<300)return seconds;
 }
 return 60;
}
// V7.2.117 — identité TRAFIC alignée sur l'identifiant concurrent Apex rXXXXX.
// Le numéro de kart peut changer pendant une endurance : il ne doit donc jamais
// servir de clé temporelle pour la position physique du concurrent.
function analyzerTrafficKey(driver){
 const row=Number(driver?.apex_row);
 if(Number.isFinite(row)&&row>0)return `apex:r${row}`;
 return `driver:${String(driver?.driver||driver?.team||driver?.pos||'unknown')}`;
}
function analyzerTrafficUpdateMotion(drivers){
 // Fallback historique, utilisé uniquement lorsqu'aucune impulsion de tracking
 // Apex n'est disponible sur le circuit. Il n'est jamais mélangé au tracking Apex.
 const now=performance.now();
 const liveKeys=new Set();
 (drivers||[]).forEach(driver=>{
  if(!driver||driver.status==='pit')return;
  const key=analyzerTrafficKey(driver),laps=Number(driver.laps),lapSeconds=analyzerTrafficLapSeconds(driver);
  liveKeys.add(key);
  const previous=analyzerTrafficMotion.get(key);
  if(!previous){
   analyzerTrafficMotion.set(key,{key,laps:Number.isFinite(laps)?laps:0,crossedAt:now,lapSeconds,ready:false,lastSeen:now});
   return;
  }
  previous.lastSeen=now;
  previous.lapSeconds=Number.isFinite(lapSeconds)?previous.lapSeconds*.7+lapSeconds*.3:previous.lapSeconds;
  if(Number.isFinite(laps)&&laps!==previous.laps){
   if(laps>previous.laps){previous.crossedAt=now;previous.ready=true}
   previous.laps=laps;
  }
 });
 // Une ancienne position ne survit plus 15 s : Apex masque lui-même son cercle
 // 5 s après la fin de l'animation. On adopte la même tolérance.
 analyzerTrafficMotion.forEach((value,key)=>{if(!liveKeys.has(key)&&now-value.lastSeen>5000)analyzerTrafficMotion.delete(key)});
}
function analyzerTrafficFallbackPhase(driver,now){
 const motion=analyzerTrafficMotion.get(analyzerTrafficKey(driver));
 if(!motion||!motion.ready||!Number.isFinite(motion.lapSeconds)||motion.lapSeconds<=0)return null;
 const elapsed=Math.max(0,(now-motion.crossedAt)/1000);
 return (elapsed%motion.lapSeconds)/motion.lapSeconds;
}
function analyzerTrafficTrackingIsLive(now=Date.now()){
 const registry=analyzerApexMapRegistry();
 if(registry?.noLive||!registry?.rows?.size||!Number(registry.lastEventAt))return false;
 // Le tour est de l'ordre de quelques dizaines de secondes. 90 s permet de
 // conserver le tracking entre deux impulsions sans réutiliser une vieille course.
 return now-Number(registry.lastEventAt)<=90000;
}
function analyzerTrafficApexPhase(driver,now=Date.now()){
 return analyzerApexStablePhase(driver,now);
}
function analyzerTrafficSignedGapFromPhases(followedPhase,driverPhase,followed){
 if(!Number.isFinite(followedPhase)||!Number.isFinite(driverPhase))return null;
 let fraction=driverPhase-followedPhase;
 if(fraction>.5)fraction-=1;
 else if(fraction<=-.5)fraction+=1;
 if(Math.abs(fraction)<=1e-6)return 0;
 return fraction*analyzerTrafficLapSeconds(followed);
}
function analyzerTrafficSignedGap(followed,driver,now,source='fallback'){
 if(source==='apex'){
  return analyzerTrafficSignedGapFromPhases(analyzerTrafficApexPhase(followed,now),analyzerTrafficApexPhase(driver,now),followed);
 }
 const followedPhase=analyzerTrafficFallbackPhase(followed,now),driverPhase=analyzerTrafficFallbackPhase(driver,now);
 const phaseGap=analyzerTrafficSignedGapFromPhases(followedPhase,driverPhase,followed);
 if(Number.isFinite(phaseGap))return phaseGap;
 if(typeof directRaceGap==='function'){
  const ahead=directRaceGap(followed,driver);
  if(Number.isFinite(ahead)&&ahead>=0)return ahead;
  const behind=directRaceGap(driver,followed);
  if(Number.isFinite(behind)&&behind>=0)return -behind;
 }
 return null;
}
function analyzerTrafficAround(followed){
 if(!followed)return [];
 const drivers=state.drivers||[],nowDate=Date.now(),pace=analyzerMapPaceData(drivers);
 const useApexTracking=analyzerTrafficTrackingIsLive(nowDate)&&Number.isFinite(analyzerTrafficApexPhase(followed,nowDate));
 if(!useApexTracking)analyzerTrafficUpdateMotion(drivers);
 else analyzerTrafficMotion.clear();
 return drivers
  .filter(driver=>driver&&driver.driver!==followed.driver&&driver.status!=='pit')
  .map(driver=>({driver,gap:analyzerTrafficSignedGap(followed,driver,useApexTracking?nowDate:performance.now(),useApexTracking?'apex':'fallback'),category:pace.map.get(driver)?.category||'slow',key:analyzerTrafficKey(driver)}))
  .filter(item=>Number.isFinite(item.gap)&&Math.abs(item.gap)<=ANALYZER_TRAFFIC_HYSTERESIS_SECONDS)
  .sort((a,b)=>a.gap-b.gap);
}
function analyzerTrafficGeometry(host){
 const track=host?.closest('.analyzer-traffic-track');
 const followed=track?.querySelector('.analyzer-traffic-followed');
 const trackWidth=Math.max(1,track?.getBoundingClientRect?.().width||host?.getBoundingClientRect?.().width||1);
 const followedWidth=Math.max(0,followed?.getBoundingClientRect?.().width||58);
 const sampleDot=host?.querySelector('.analyzer-traffic-dot');
 const dotWidth=Math.max(0,sampleDot?.getBoundingClientRect?.().width||parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--velocity-traffic-dot-size'))||28);
 const dotRadius=dotWidth/2;
 const safety=1;
 const deadHalf=Math.min(trackWidth*.32,followedWidth/2+safety);
 // À 0,00 s, le BORD du cercle touche le bord du rectangle du kart suivi.
 const rearZero=Math.max(0,trackWidth/2-deadHalf-dotRadius);
 const frontZero=Math.min(trackWidth,trackWidth/2+deadHalf+dotRadius);
 return {track,trackWidth,rearZero,frontZero};
}
function analyzerTrafficPercentForGap(gap,geometry){
 const g=Math.max(-10,Math.min(10,Number(gap)||0));
 if(g<0){
  const ratio=Math.min(1,Math.abs(g)/10);
  return ((geometry.rearZero*(1-ratio))/geometry.trackWidth)*100;
 }
 const ratio=Math.min(1,g/10);
 return ((geometry.frontZero+(geometry.trackWidth-geometry.frontZero)*ratio)/geometry.trackWidth)*100;
}
function analyzerTrafficUpdateTicks(geometry){
 const track=geometry?.track;if(!track)return;
 track.querySelectorAll('.analyzer-traffic-tick').forEach(tick=>{
  const match=String(tick.className||'').match(/\bt([mp])(\d+)\b/);
  if(!match)return;
  const seconds=Number(match[2])*(match[1]==='m'?-1:1);
  const left=analyzerTrafficPercentForGap(seconds,geometry);
  tick.style.left=`${left.toFixed(2)}%`;
  tick.style.right='auto';
  tick.style.transform='translateX(-50%)';
  const marker=tick;
  if(Math.abs(seconds)===10){
   // Les extrêmes restent lisibles tout en étant alignés sur l'axe.
   marker.style.transform=seconds<0?'translateX(0)':'translateX(-100%)';
  }
 });
}
function analyzerRenderTrafficAhead(followed){
 const host=document.getElementById('analyzerTrafficDots');
 if(!host)return;
 // Velocity V7.2.107 — aucun trafic adverse ne doit survivre hors course.
 // On s'aligne sur la même détection d'activité que la Heat Map afin qu'un
 // classement Apex ancien ou des phases mémorisées ne puissent pas réafficher
 // un cercle fantôme au chargement d'Analyzer.
 if(!analyzerApexRaceIsActive()){
  analyzerResetTrafficState();
  return;
 }
 const traffic=analyzerTrafficAround(followed),activeKeys=new Set();
 // Crée d'abord les nœuds afin que leur largeur réelle participe au calcul de la dead zone.
 traffic.forEach(item=>{
  activeKeys.add(item.key);
  let node=analyzerTrafficNodes.get(item.key);
  if(!node){
   node=document.createElement('span');
   node.className='analyzer-traffic-dot';
   node.dataset.trafficKey=item.key;
   node.style.opacity='0';
   host.appendChild(node);
   analyzerTrafficNodes.set(item.key,node);
   requestAnimationFrame(()=>{node.style.opacity='1'});
  }
 });
 const geometry=analyzerTrafficGeometry(host);
 analyzerTrafficUpdateTicks(geometry);
 traffic.forEach(item=>{
  const node=analyzerTrafficNodes.get(item.key);if(!node)return;
  const left=analyzerTrafficPercentForGap(item.gap,geometry);
  node.className=`analyzer-traffic-dot pace-${item.category}`;
  node.textContent=analyzerSimulationKartLabel(item.driver);
  const sign=item.gap>=0?'+':'−';
  const delta=`${sign}${Math.abs(item.gap).toFixed(3)} s`;
  const team=String(item.driver.driver||item.driver.team||item.driver.name||'Équipe inconnue');
  node.removeAttribute('title');
  node.dataset.trafficTooltip=`${delta} · ${team}`;
  node.setAttribute('aria-label',`${analyzerSimulationKartLabel(item.driver)} — ${delta} — ${team}`);
  node.style.left=`${left.toFixed(2)}%`;
  const overflow=Math.abs(item.gap)-10;
  node.style.opacity=overflow<=0?'1':String(Math.max(0,1-overflow/.5));
 });
 analyzerTrafficNodes.forEach((node,key)=>{
  if(activeKeys.has(key))return;
  node.style.opacity='0';
  setTimeout(()=>{if(!activeKeys.has(key)){node.remove();analyzerTrafficNodes.delete(key)}},220);
 });
}

function openAnalyzerMapFocus(){const o=document.getElementById('analyzerMapFocus');if(!o)return;o.classList.add('show');o.setAttribute('aria-hidden','false');document.body.classList.add('analyzer-map-focus-open');analyzerRenderMapFocus()}
function closeAnalyzerMapFocus(){const o=document.getElementById('analyzerMapFocus');if(!o)return;o.classList.remove('show');o.setAttribute('aria-hidden','true');document.body.classList.remove('analyzer-map-focus-open')}
function analyzerMapFocusControls(){
 const source=document.getElementById('mapPaceFilters'),target=document.getElementById('mapFocusPaceFilters');if(source&&target){target.innerHTML=source.innerHTML;target.querySelectorAll('input[value]').forEach(i=>i.checked=analyzerMapPaceFilters.has(i.value));const none=target.querySelector('.map-filter-none input');if(none)none.checked=analyzerMapPaceFilters.size===0}
 const hs=document.querySelector('.map-highlight-menu'),ht=document.getElementById('mapFocusHighlight');if(hs&&ht){ht.innerHTML=hs.innerHTML;ht.querySelectorAll('input[name="mapHighlight"]').forEach(i=>{i.name='mapHighlightFocus';i.checked=i.value===analyzerMapHighlight})}
}
function analyzerRelayEndLabel(driver){try{const f=analyzerForecastFor(driver);return Number.isFinite(f?.maxRemaining)?analyzerFormatDuration(f.maxRemaining):(driver?.status==='pit'?'IN':'—')}catch(_e){return '—'}}
function analyzerRenderMapFocus(){
 const overlay=document.getElementById('analyzerMapFocus');if(!overlay?.classList.contains('show'))return;analyzerMapFocusControls();
 const radarHost=document.getElementById('analyzerMapFocusRadar'),ranking=document.getElementById('analyzerMapFocusRanking');const source=document.querySelector('#pitSimulatorTrack .map-radar-pane');if(radarHost)radarHost.innerHTML=source?source.innerHTML:'<div class="analyzer-empty">Radar indisponible</div>';
 const drivers=(state.drivers||[]).filter(d=>d&&d.driver),pace=analyzerMapPaceData(drivers),order=['fastest','excellent','good','medium','average','slow'],labels={fastest:'🔥 LES PLUS RAPIDES',excellent:'🟢 EXCELLENT RYTHME',good:'🟡 BON RYTHME',medium:'🟠 MOYEN',average:'🔴 TRÈS MOYEN',slow:'⚫ LENT'};
 if(ranking)ranking.innerHTML=order.map(cat=>{const rows=drivers.filter(d=>(pace.map.get(d)?.category||'slow')===cat).sort((a,b)=>(pace.map.get(a)?.lap??9999)-(pace.map.get(b)?.lap??9999));return `<section class="map-focus-group"><h3>${labels[cat]}</h3><div class="map-focus-head"><span>ÉQUIPE</span><span>DERNIER TEMPS</span><span>FIN RELAIS</span></div>${rows.map(d=>`<div class="map-focus-row${d.driver===state.followed_driver?' followed':''}"><span>${analyzerEscape(d.driver)}</span><b>${analyzerEscape(d.last||'—')}</b><b>${analyzerEscape(analyzerRelayEndLabel(d))}</b></div>`).join('')||'<div class="map-focus-empty">—</div>'}</section>`}).join('');
}
function analyzerPenaltyTimeLabel(p){
 const direct=String(p?.time||'').trim();if(direct)return direct.slice(0,5);
 const at=String(p?.at||'').trim();return at.length>=16?at.slice(11,16):'--:--';
}
function analyzerPenaltyClockMinutes(p){
 const value=analyzerPenaltyTimeLabel(p),m=value.match(/^(\d{1,2}):(\d{2})$/);return m?Number(m[1])*60+Number(m[2]):NaN;
}
function analyzerPenaltyItems(){
 const events=Array.isArray(state?.comment_events)?state.comment_events:[];
 if(events.length)return [...events].sort((a,b)=>{
  const aa=String(a?.at||''),bb=String(b?.at||'');if(aa&&bb&&aa!==bb)return bb.localeCompare(aa);
  return analyzerPenaltyTimeLabel(b).localeCompare(analyzerPenaltyTimeLabel(a));
 });
 // Fallback rétrocompatible si le serveur n'a pas encore publié comment_events.
 const comments=Array.isArray(state?.comment_penalties)?state.comment_penalties:[];
 const history=Array.isArray(state?.penalty_history)?state.penalty_history:[];
 const active=Array.isArray(state?.penalties)?state.penalties:[];
 const merged=comments.map(p=>({...p,source:'comments'}));
 const candidates=history.length?history:active;
 candidates.forEach(p=>{
  const driver=String(p?.driver||'').trim().toLowerCase(),text=String(p?.penalty||p?.comment||'').trim().toLowerCase(),mins=analyzerPenaltyClockMinutes(p);
  const duplicate=merged.some(x=>{
   if(String(x?.driver||'').trim().toLowerCase()!==driver||String(x?.penalty||x?.comment||'').trim().toLowerCase()!==text)return false;
   const xm=analyzerPenaltyClockMinutes(x);return !Number.isFinite(mins)||!Number.isFinite(xm)||Math.abs(xm-mins)<=5;
  });
  if(!duplicate)merged.push({...p,source:'grid'});
 });
 return merged.sort((a,b)=>{
  const aa=String(a?.at||''),bb=String(b?.at||'');if(aa&&bb&&aa!==bb)return bb.localeCompare(aa);
  return analyzerPenaltyTimeLabel(b).localeCompare(analyzerPenaltyTimeLabel(a));
 });
}

function analyzerSyncPenaltyColumns(){
 const ranking=document.querySelector('.analyzer-ranking-table');
 const head=document.querySelector('.analyzer-penalties-head');
 const list=document.getElementById('analyzerPenaltiesList');
 if(!ranking||!head||!list)return;
 const th=ranking.querySelectorAll('thead th');
 if(th.length<4)return;
 const targets=[head,list];
 const values={
  '--pen-pos-w':`${Math.round(th[0].getBoundingClientRect().width)}px`,
  '--pen-in-w':`${Math.round(th[1].getBoundingClientRect().width)}px`,
  '--pen-kart-w':`${Math.round(th[2].getBoundingClientRect().width)}px`,
  '--pen-team-w':`${Math.round(th[3].getBoundingClientRect().width)}px`
 };
 targets.forEach(node=>Object.entries(values).forEach(([key,value])=>node.style.setProperty(key,value)));
}
function renderAnalyzerPenalties(){
 const host=document.getElementById('analyzerPenaltiesList'),count=document.getElementById('analyzerPenaltiesCount');if(!host)return;
 const items=analyzerPenaltyItems();analyzerUpdateEventNotice(items);if(count)count.textContent=`${items.length} information${items.length>1?'s':''}`;
 if(!items.length){host.innerHTML='<div class="analyzer-empty">Aucune pénalité ou information Apex.</div>';analyzerSyncPenaltyColumns();return;}
 host.innerHTML=items.map(p=>{
  const team=String(p?.driver||'').trim(),kart=String(p?.kart||'').trim(),text=String(p?.comment||p?.penalty||'').trim();
  const combined=team?`<strong class="analyzer-penalty-team">${analyzerEscape(team)}</strong><span class="analyzer-penalty-separator"> : </span><span class="analyzer-penalty-text">${analyzerEscape(text)}</span>`:`<span class="analyzer-penalty-text">${analyzerEscape(text)}</span>`;
  const flag=String(p?.flag||'msg').trim(),source=String(p?.source||'com').trim(),kind=String(p?.kind||'information').trim();
  return `<div class="analyzer-penalty-row" role="row" data-apex-flag="${analyzerEscape(flag)}" data-apex-kind="${analyzerEscape(kind)}" data-apex-source="${analyzerEscape(source)}"><span class="analyzer-penalty-time" role="cell">${analyzerEscape(analyzerPenaltyTimeLabel(p))}</span><span class="analyzer-penalty-kart" role="cell">${kart?analyzerEscape(kart):''}</span><span class="analyzer-penalty-combined" role="cell">${combined}</span></div>`;
 }).join('');
 analyzerSyncPenaltyColumns();
}

function renderAnalyzer(){
 ensureAnalyzerWeather();
 if(!document.getElementById('analyzerTable'))return;
 if(typeof syncRankingLapAnimations==='function')syncRankingLapAnimations();
 analyzerEnsureSession();
 analyzerLearnFromState();
 analyzerScheduleRelayHydration();
 const all=analyzerRows();const generalSorted=all.slice().sort(analyzerSortComparator());const virtualSorted=analyzerVirtualMetrics(all);const sorted=analyzerRankingMode==='virtual'?(analyzerSort==='position'?virtualSorted:virtualSorted.slice().sort(analyzerSortComparator())):generalSorted;
 const generalBtn=document.getElementById('analyzerGeneralRankingBtn'),virtualBtn=document.getElementById('analyzerVirtualRankingBtn'),rankingSubtitle=document.getElementById('analyzerRankingSubtitle');
 if(generalBtn)generalBtn.classList.toggle('active',analyzerRankingMode==='general');if(virtualBtn)virtualBtn.classList.toggle('active',analyzerRankingMode==='virtual');
 const rankingTable=document.querySelector('.analyzer-ranking-table');if(rankingTable){rankingTable.classList.toggle('general-ranking-mode',analyzerRankingMode==='general');rankingTable.classList.toggle('virtual-ranking-mode',analyzerRankingMode==='virtual');}
 if(rankingSubtitle)rankingSubtitle.textContent=analyzerRankingMode==='virtual'?(analyzerVirtualLoading?'Calcul des temps d’arrêts virtuels en cours…':'Même nombre d’arrêts pour toutes les équipes — moyenne des 3 meilleurs arrêts propres à chaque équipe'):'Colonnes Apex Timing enrichies par Velocity';
 const followed=(state.drivers||[]).find(d=>d.driver===state.followed_driver)||state.followed||(state.drivers||[])[0]||null;
 const ownForecast=followed?analyzerForecastFor(followed):{};const stops=analyzerStopsInfo(followed);
 document.getElementById('analyzerFollowedName').textContent=followed?.driver||'—';
 document.getElementById('analyzerFollowedPosition').textContent=followed?.pos?`P${followed.pos}`:'P—';
 document.getElementById('analyzerFollowedTrack').textContent=followed?.track_timer||'—';
 document.getElementById('analyzerFollowedLimit').textContent=Number.isFinite(ownForecast.maxRemaining)?analyzerFormatDuration(ownForecast.maxRemaining):'—';
 document.getElementById('analyzerFollowedStops').textContent=`${stops.done} / ${analyzerRules.requiredStops}`;
 analyzerRenderFollowedPerformance(followed);
 analyzerRenderFollowedDeltas(followed);
 analyzerRenderTrafficAhead(followed);
 document.getElementById('analyzerRuleRelay').textContent=`${analyzerFormatDuration(analyzerRules.minStintMinutes*60)} → ${analyzerFormatDuration(analyzerRules.maxStintMinutes*60)}`;
 document.getElementById('analyzerRulePit').textContent=analyzerFormatDuration(analyzerRules.minPitSeconds);
 document.getElementById('analyzerStopsRemaining').textContent=String(stops.remaining);
 document.getElementById('analyzerStopCadence').textContent=Number.isFinite(analyzerRules.driverMinimumMinutes)?analyzerFormatDuration(analyzerRules.driverMinimumMinutes*60,{compact:true}):'—';
 renderAnalyzerRulesPilots(followed);
 const max=analyzerRules.maxStintMinutes*60,min=analyzerRules.minStintMinutes*60;
 const rulesStatus=document.getElementById('analyzerRulesStatus');rulesStatus.className='rules-status';
 if(!followed)rulesStatus.textContent='Équipe non sélectionnée';
 else if(Number.isFinite(ownForecast.track)&&ownForecast.track>max){rulesStatus.textContent='LIMITE DÉPASSÉE';rulesStatus.classList.add('danger')}
 else if(Number.isFinite(ownForecast.track)&&ownForecast.track>=max-analyzerRules.safetyMarginMinutes*60){rulesStatus.textContent='RELAIS À TERMINER';rulesStatus.classList.add('danger')}
 else if(Number.isFinite(ownForecast.track)&&ownForecast.track<min){rulesStatus.textContent='RELAIS MINIMUM NON ATTEINT';rulesStatus.classList.add('warning')}
 else rulesStatus.textContent='CONFORME';
 const opportunity=analyzerOpportunity(followed,all);const card=document.getElementById('analyzerOpportunityCard');card.classList.remove('good','wait','urgent');card.classList.add(opportunity.className);
 document.getElementById('analyzerOpportunityScore').textContent=opportunity.score;document.getElementById('analyzerAdvice').textContent=opportunity.advice;document.getElementById('analyzerAdviceDetail').textContent=opportunity.detail;
 const forecastRows=all.filter(x=>x.driver.status==='pit'||(Number.isFinite(x.forecast.seconds)&&x.forecast.seconds<=900)).sort((a,b)=>(a.forecast.seconds??999999)-(b.forecast.seconds??999999)).slice(0,10);
 const analyzerForecastEl=document.getElementById('analyzerForecast');if(analyzerForecastEl)analyzerForecastEl.innerHTML=forecastRows.length?forecastRows.map(x=>`<div class="analyzer-forecast-row"><span class="analyzer-forecast-time">${x.driver.status==='pit'?'IN':analyzerEscape(x.forecast.label)}</span><span><span class="analyzer-forecast-team">${analyzerEscape(x.driver.driver)}</span><span class="analyzer-forecast-meta">Kart virtuel ${analyzerEscape(x.history.virtualKart)}</span></span><span class="analyzer-score-pill ${analyzerScoreClass(x.score)}">${x.score}/100</span><span class="analyzer-confidence">${x.forecast.confidence}%</span></div>`).join(''):'<div class="analyzer-empty">Aucun arrêt attendu dans les 15 prochaines minutes.</div>';
 if(!analyzerRelayScoreData&&!analyzerRelayScoreLoading)setTimeout(()=>analyzerLoadRelayScores(),0);
 const marketByScore=all.map(x=>({...x,relayMetrics:analyzerVelocityUnifiedMetrics(x.driver)})).filter(x=>x.relayMetrics.laps>=3).sort((a,b)=>b.relayMetrics.score-a.relayMetrics.score).map((x,index)=>({...x,kartiqTop:index+1,relayRemaining:analyzerKartRelayRemaining(x.driver)}));
 let market=marketByScore;
 if(analyzerKartSort==='relay-end')market=marketByScore.slice().sort((a,b)=>{
  const av=Number.isFinite(a.relayRemaining)?a.relayRemaining:Number.POSITIVE_INFINITY;
  const bv=Number.isFinite(b.relayRemaining)?b.relayRemaining:Number.POSITIVE_INFINITY;
  return av-bv||a.kartiqTop-b.kartiqTop;
 });
 else if(analyzerKartSort==='delta')market=marketByScore.slice().sort((a,b)=>{
  const aDelta=analyzerVelocityDeltaValue(a.driver,a.relayMetrics.correctedDelta);
  const bDelta=analyzerVelocityDeltaValue(b.driver,b.relayMetrics.correctedDelta);
  const av=Number.isFinite(aDelta)?aDelta:Number.POSITIVE_INFINITY;
  const bv=Number.isFinite(bDelta)?bDelta:Number.POSITIVE_INFINITY;
  return av-bv||a.kartiqTop-b.kartiqTop;
 });
 document.getElementById('analyzerVelocityViewBtn')?.classList.toggle('active',analyzerVelocityView==='velocity');
 document.getElementById('analyzerRelayScoreViewBtn')?.classList.toggle('active',analyzerVelocityView==='relays');
 const velocitySortLabel=document.querySelector('.analyzer-kartiq-sort');if(velocitySortLabel)velocitySortLabel.hidden=analyzerVelocityView==='relays';
 if(analyzerVelocityView==='relays'){
  analyzerRenderRelayScoreTable(marketByScore);
 }else{
   const kartSortSelect=document.getElementById('analyzerKartSort');if(kartSortSelect)kartSortSelect.value=analyzerKartSort;
   const showPilotContinuity=analyzerSessionHasPilotData();
   document.getElementById('analyzerKartMarket').innerHTML=market.length?`<table class="analyzer-kartiq-table${showPilotContinuity?' has-pilot-column':''}"><thead><tr><th>TOP</th><th>POS</th><th>KART</th><th>ÉQUIPE / PILOTE</th>${showPilotContinuity?'<th class="kartiq-pilot-head kartiq-tooltip" data-tooltip="Continuité du pilote entre les deux relais">PIL.</th>':''}<th>SCORE</th><th>ÉVOL.</th><th>T.MOYEN</th><th>Δ</th><th>R</th><th>FIN RELAIS</th><th>TOURS</th><th>ANALYSE</th></tr></thead><tbody>${market.map(x=>{const d=x.driver,m=x.relayMetrics,evolution=analyzerKartEvolution(d,m),kart=validKartNumber(d)||d.apex||'—',continuity=analyzerPilotContinuity(m),deltaValue=analyzerVelocityDeltaValue(d,m.correctedDelta),deltaClass=Number.isFinite(deltaValue)?(deltaValue<0?'negative':deltaValue>0?'positive':'neutral'):'neutral',remainingClass=analyzerKartRelayRemainingClass(x.relayRemaining),deadline=Number.isFinite(x.relayRemaining)?Date.now()+x.relayRemaining*1000:null,pilotCell=showPilotContinuity?`<td class="kartiq-pilot-continuity kartiq-tooltip" data-tooltip="${analyzerEscape(continuity.title)}" aria-label="${analyzerEscape(continuity.title)}">${analyzerEscape(continuity.label)}</td>`:'';return `<tr onclick="followDriver(${JSON.stringify(d.driver).replace(/"/g,'&quot;')})"><td class="kartiq-top">${x.kartiqTop}</td><td class="kartiq-pos">${analyzerEscape(d.pos||'—')}</td><td class="kartiq-kart">${analyzerEscape(kart)}</td><td class="kartiq-team kartiq-tooltip" data-tooltip="${analyzerEscape(d.driver)}">${analyzerEscape(d.driver)}</td>${pilotCell}<td class="kartiq-score ${analyzerScoreClass(m.score)}">${m.score}</td><td class="kartiq-evolution kartiq-tooltip ${evolution.className}" data-tooltip="${analyzerEscape(evolution.title)}">${analyzerEscape(evolution.label)}</td><td class="kartiq-average">${Number.isFinite(m.average)?analyzerEscape(formatApexMilliseconds(m.average*1000)):'—'}</td><td class="kartiq-delta kartiq-tooltip ${deltaClass}" data-velocity-delta-row="${Number(d.apex_row)||0}" data-tooltip="Δ Score Relais corrigé de l'évolution du plateau : négatif = plus rapide, positif = plus lent">${analyzerEscape(analyzerKartDeltaLabel(deltaValue))}</td><td>${m.relayIndex}</td><td class="kartiq-relay-end ${remainingClass}"${deadline?` data-kartiq-relay-end="${deadline}"`:''}>${analyzerEscape(analyzerKartRelayRemainingLabel(x.relayRemaining))}</td><td>${m.laps}</td><td class="kartiq-analysis">${m.confidence}%</td></tr>`}).join('')}</tbody></table>`:`<div class="analyzer-empty">${analyzerRelayHydrationLoading?'Reconstitution des relais en cours depuis STATS…':'Au moins 3 tours propres sont nécessaires pour évaluer un relais.'}</div>`;
   analyzerRefreshKartRelayCountdowns();
 }

 const wave=all.filter(x=>Number.isFinite(x.forecast.seconds)&&x.forecast.seconds<=600&&x.driver.status!=='pit');
 const analyzerRankingBody=document.getElementById('analyzerTable');
 const analyzerPreviousRows=typeof rankingCaptureRows==='function'?rankingCaptureRows(analyzerRankingBody):new Map();
 analyzerRankingBody.innerHTML=sorted.map(x=>{
  const d=x.driver;const isFollowed=d.driver===state.followed_driver;const penalty=d.penalty||'—';const isVirtual=analyzerRankingMode==='virtual';
  const relayTimer=analyzerRelayTimer(d),stintAverage=analyzerCurrentStintAverage(d),virtual=x.virtual;
  const displayPos=isVirtual?virtual.position:d.pos;
  const stopsValue=isVirtual?`${analyzerEscape(d.pit_stops??0)}${virtual.missing?`<small class="virtual-stop-add">+${virtual.missing} virtuel${virtual.missing>1?'s':''}</small>`:''}`:analyzerEscape(d.pit_stops??'—');
  const gapValue=isVirtual?(virtual.position===1?'—':`+${analyzerFormatDuration(virtual.gap)}`):analyzerEscape(d.gap);
  const virtualInfo=isVirtual&&virtual.missing?`<small class="virtual-time-add" title="Moyenne ${virtual.pitAverage.samples||0} arrêt(s)">+${analyzerFormatDuration(virtual.extra)}${virtual.pitAverage.estimated?' estimé':''}</small>`:'';
  const rankingFlash=typeof rankingFlashMeta==='function'?rankingFlashMeta(d):{className:'',style:''};
  return `<tr data-driver="${analyzerEscape(typeof rankingDriverKey==='function'?rankingDriverKey(d):(d.driver||d.pos))}" data-position="${analyzerEscape(d.pos)}" class="${isFollowed?'followed':''}${isVirtual?' virtual-ranking-row':''}${rankingFlash.className||''}"${rankingFlash.style?` style="${rankingFlash.style}"`:''} onclick="followDriver(${JSON.stringify(d.driver).replace(/"/g,'&quot;')})"><td class="a-pos">${analyzerEscape(displayPos)}${isVirtual&&Number(d.pos)!==displayPos?`<small class="virtual-real-pos">réel P${analyzerEscape(d.pos)}</small>`:''}</td><td class="a-pit-indicator">${analyzerPitIndicator(d)}</td><td>${analyzerEscape(validKartNumber(d)||d.apex||'—')}</td><td class="a-team" title="${analyzerEscape(d.driver)}">${analyzerEscape(d.driver)}${virtualInfo}</td><td><button type="button" class="analyzer-laps-btn" onclick="event.stopPropagation();openApexTeamLaps(${Number(d.apex_row)||0})">STATS</button></td><td>${analyzerEscape(d.laps)}</td><td class="a-track${relayTimer.inPit?' pit-time-blue':''}">${analyzerEscape(relayTimer.value)}</td><td>${stopsValue}</td><td class="${lapTimeClass(d,d.last,'last')}">${analyzerEscape(d.last)}</td><td class="${lapTimeClass(d,d.best,'best')}">${analyzerEscape(d.best)}</td><td class="a-average">${stintAverage?analyzerEscape(formatApexMilliseconds(stintAverage*1000)):'—'}</td><td class="${isVirtual?'virtual-gap':''}">${gapValue}</td><td class="red">${analyzerEscape(penalty)}</td><td class="a-forecast">${d.status==='pit'?'IN':analyzerEscape(x.forecast.label)}</td><td title="${analyzerEscape(analyzerSpotterStatusLabel(analyzerSpotterAssignmentForTeam(d.driver)))}">${analyzerEscape(analyzerSpotterKvLabel(d.driver,x.history.virtualKart))}</td><td class="a-note ${analyzerScoreClass(x.score)}">${x.score}</td></tr>`;
 }).join('');
 if(typeof rankingAnimateRows==='function'&&analyzerRankingMode==='general')rankingAnimateRows(analyzerRankingBody,analyzerPreviousRows);
 renderAnalyzerPenalties();
 analyzerRenderPitSimulator();
 renderAnalyzerQueueAdvice();
 analyzerRenderSpotterSync();
 analyzerRenderSpotterCards();
 analyzerRenderVelocityLab();
}

// V7.2 — état partagé par le module Spotter. Velocity reste l'unique source
// des scores et de la confiance ; Spotter partage uniquement le KV et son état FIFO.
function analyzerSpotterState(){
 const shared=window.velocitySharedSpotterState;
 const currentCircuit=String(state?.circuit_id||state?.selected_circuit||'');
 if(shared&&typeof shared==='object'){
  const sameRelease=!shared.app_release||String(shared.app_release)===String(state?.version||'').replace(/\s+TEST.*$/,'')||String(shared.app_release)==='7.2.106';
  const sameCircuit=!shared.circuit_id||!currentCircuit||String(shared.circuit_id)===currentCircuit;
  if(sameRelease&&sameCircuit)return shared;
 }
 return state?.spotter&&typeof state.spotter==='object'?state.spotter:null;
}
let analyzerSpotterRenderFrame=0;
window.addEventListener('velocity:spotter-state',()=>{
 if(analyzerSpotterRenderFrame)return;
 analyzerSpotterRenderFrame=requestAnimationFrame(()=>{
  analyzerSpotterRenderFrame=0;
  if(!document.body.classList.contains('current-analyzer'))return;
  analyzerRenderSpotterSync();
  analyzerRenderSpotterCards();
 });
});
function analyzerSpotterAssignmentForTeam(team){
 const spotter=analyzerSpotterState();if(!spotter?.configured)return null;
 const key=String(team||'');
 const direct=spotter.assignments?.[key];if(direct)return {...direct,spotterStatus:direct.status||'track'};
 const reserved=(spotter.queue||[]).find(item=>item?.status==='reserved'&&item?.reservedTeam===key);
 return reserved?{...reserved,spotterStatus:'reserved'}:null;
}
function analyzerSpotterKvLabel(team,fallback='—'){
 const item=analyzerSpotterAssignmentForTeam(team);return item?.kv||fallback;
}
function analyzerSpotterStatusLabel(item){
 const status=item?.spotterStatus||item?.status;
 return status==='reserved'?'ATTRIBUÉ':status==='maintenance'?'MAINTENANCE':status==='available'?'DISPONIBLE':status==='track'?'EN PISTE':'—';
}
function analyzerRenderSpotterSync(){
 const spotter=analyzerSpotterState();const root=document.getElementById('kartQueues');if(!root)return;
 if(!spotter?.configured)return;
 const title=document.getElementById('kartQueuesTitle');if(title)title.textContent='SPOTTER — FILE FIFO';
 const subtitle=document.querySelector('.analyzer-queue-subtitle');if(subtitle)subtitle.textContent=`Synchronisé en temps réel · ${spotter.mode==='auto'?'suivi estimé':spotter.mode==='recalibrating'?'recalage en cours':'suivi confirmé'}`;
 const control=document.querySelector('.queue-count-control');if(control)control.style.display='none';
 const actions=document.querySelector('.queue-actions');if(actions)actions.style.display='none';
 const cards=(spotter.queue||[]).map((item,index)=>{
  const reserved=item.status==='reserved';const origin=item.lastTeam&&item.lastTeam!=='Initialisation'?item.lastTeam:`Kart ${item.apexKart||'—'}`;
  const name=reserved?item.reservedTeam:origin;const status=reserved?'ATTRIBUÉ':'DISPONIBLE';
  return `<div class="analyzer-spotter-kart ${reserved?'reserved':'available'}"><span class="analyzer-spotter-position">${index+1}</span><strong>${analyzerEscape(name||'—')}</strong><small>${analyzerEscape(item.kv||'—')} · ${status}</small><b>Score ${item.score??'—'} · Conf. ${item.confidence==null?'—':item.confidence+'%'}</b></div>`;
 }).join('');
 const maintenance=(spotter.maintenance||[]).map(item=>`<div class="analyzer-spotter-kart maintenance"><strong>${analyzerEscape(item.lastTeam||item.apexKart||'—')}</strong><small>${analyzerEscape(item.kv||'—')} · MAINTENANCE</small><b>Score ${item.score??'—'} · Conf. ${item.confidence==null?'—':item.confidence+'%'}</b></div>`).join('');
 root.innerHTML=`<div class="analyzer-spotter-sync">${cards||'<div class="analyzer-empty">File Spotter vide.</div>'}${maintenance?`<div class="analyzer-spotter-maintenance-title">MAINTENANCE</div>${maintenance}`:''}</div>`;
 const advice=document.getElementById('analyzerQueueAdvice');if(advice){const first=(spotter.queue||[]).find(item=>item.status==='available');advice.textContent=first?`${first.lastTeam&&first.lastTeam!=='Initialisation'?first.lastTeam:'Kart '+(first.apexKart||'—')} · ${first.kv} · Score ${first.score??'—'}`:'Aucun kart disponible';}
}


function analyzerRenderSpotterCards(){
 if((typeof spotterDrag!=='undefined'&&(spotterDrag.active||spotterDrag.timer))||document.body.classList.contains('spotter-drag-active'))return;
 const spotter=analyzerSpotterState();
 const filesHost=document.getElementById('analyzerSpotterFiles');
 const incomingHost=document.getElementById('analyzerSpotterIncoming');
 const maintenanceHost=document.getElementById('analyzerSpotterMaintenance');
 const incomingCount=document.getElementById('analyzerSpotterIncomingCount');
 const maintenanceCount=document.getElementById('analyzerSpotterMaintenanceCount');
 const autoButton=document.getElementById('analyzerSpotterAutoButton');
 if(!filesHost&&!incomingHost&&!maintenanceHost)return;
 if(autoButton){
  const isAuto=spotter?.mode==='auto'||Boolean(spotter?.free_started_at);
  autoButton.classList.toggle('active',isAuto);
  autoButton.classList.toggle('resume',isAuto);
  autoButton.textContent=isAuto?'▶ REPRENDRE':'AUTO';
 }
 if(!spotter?.configured){
  if(filesHost)filesHost.innerHTML='<div class="spotter-empty">Configuration Spotter en attente.</div>';
  if(incomingHost)incomingHost.innerHTML='<div class="spotter-empty">Aucun kart entrant à valider.</div>';
  if(maintenanceHost)maintenanceHost.innerHTML='<div class="spotter-empty">Aucun kart en maintenance.</div>';
  if(incomingCount)incomingCount.textContent='0';
  if(maintenanceCount)maintenanceCount.textContent='0';
  return;
 }
 const inferredQueueCount=(Array.isArray(spotter.queue)?spotter.queue:[]).reduce((max,item)=>Math.max(max,Number(item?.queueFile)||1),1);
 const count=Math.max(1,Math.min(3,Number(spotter.queue_mode)||inferredQueueCount||1));
 const queue=Array.isArray(spotter.queue)?spotter.queue:[];
 if(filesHost){
  const recalibrationNotice=spotter?.recalibrating
   ? `<div class="analyzer-spotter-recalibration"><strong>VALIDER LE RECALAGE</strong><span>Vérifiez l’ordre réel des karts dans les stands, puis validez le recalage.</span><button type="button" onclick="spotterConfirmRecalibration()">VALIDER LE RECALAGE</button></div>`
   : '';
  const columns=[];
  for(let file=1;file<=count;file+=1){
   const items=queue.filter(item=>(Number(item.queueFile)||1)===file);
   const cards=items.length
    ?items.map((item,index)=>typeof spotterQueueCard==='function'?spotterQueueCard(item,typeof spotterQueueVisualState==='function'?spotterQueueVisualState(items,index):'next'):'').join('')
    :'<div class="spotter-empty spotter-file-empty">File vide</div>';
   columns.push(`<div class="spotter-file-column" data-spotter-file="${file}"><div class="spotter-file-title">FILE ${file}</div><div class="spotter-file-list" data-spotter-drop-zone="queue">${cards}</div></div>`);
  }
  filesHost.innerHTML=`${recalibrationNotice}<div class="spotter-queues-layout queues-${count}">${columns.join('')}</div>`;
 }
 const incoming=Array.isArray(spotter.incoming)?spotter.incoming:[];
 if(incomingCount)incomingCount.textContent=String(incoming.length);
 if(incomingHost)incomingHost.innerHTML=incoming.length
  ?`<div class="spotter-incoming-grid">${incoming.map(item=>typeof spotterIncomingCard==='function'?spotterIncomingCard(item):'').join('')}</div>`
  :'<div class="spotter-empty">Aucun kart entrant à valider.</div>';
 const maintenance=Array.isArray(spotter.maintenance)?spotter.maintenance:[];
 if(maintenanceCount)maintenanceCount.textContent=String(maintenance.length);
 if(maintenanceHost)maintenanceHost.innerHTML=maintenance.length
  ?`<div class="spotter-maintenance-grid">${maintenance.map(item=>typeof spotterMaintenanceCard==='function'?spotterMaintenanceCard(item):'').join('')}</div>`
  :'<div class="spotter-empty">Aucun kart en maintenance.</div>';
}



function renderAnalyzerQueueAdvice(){
 const el=document.getElementById('analyzerQueueAdvice');if(!el)return;
 const first=analyzerQueueCandidates().filter(x=>x.index===0);
 if(!first.length){el.textContent='Ajoutez les karts présents dans les files';return}
 const scored=first.filter(x=>Number.isFinite(x.score)).sort((a,b)=>b.score-a.score);
 if(!scored.length){el.textContent='Files renseignées — apprentissage des notes en cours';return}
 const best=scored[0];el.textContent=`FILE ${queueLetter(best.queue)} — kart ${best.kart} (${best.score}/100)`;
}
const analyzerApexPilotTotalsCache=new Map();
const analyzerApexPilotTotalsLoading=new Map();
function analyzerPilotHoursLabel(seconds){const total=Math.max(0,Math.floor(Number(seconds)||0)),hours=Math.floor(total/3600),minutes=Math.floor((total%3600)/60);return `${String(hours).padStart(2,'0')}H${String(minutes).padStart(2,'0')}`}
function analyzerOfficialPilotTotals(driver){
 const rowId=Number(driver?.apex_row)||0;if(!rowId)return [];
 const entry=analyzerApexPilotTotalsCache.get(rowId);if(!entry)return [];
 return (entry.pilots||[]).filter(p=>p.name&&Number(p.totalMs)>0).map(p=>({name:p.name,seconds:Number(p.totalMs)/1000,driverId:p.driverId,current:Boolean(p.current)})).sort((a,b)=>b.seconds-a.seconds||a.name.localeCompare(b.name));
}
function analyzerOfficialCurrentPilot(driver){
 const rowId=Number(driver?.apex_row)||0,entry=analyzerApexPilotTotalsCache.get(rowId);
 const current=(entry?.pilots||[]).find(p=>p.current&&p.name);
 return current?.name||null;
}
function analyzerOfficialCurrentKart(driver){
 const rowId=Number(driver?.apex_row)||0,entry=analyzerApexPilotTotalsCache.get(rowId);
 return String(entry?.teamInfo?.kartNumber||'').trim()||null;
}
async function analyzerEnsureOfficialPilotTotals(driver){
 const rowId=Number(driver?.apex_row)||0;if(!rowId||analyzerApexPilotTotalsLoading.has(rowId))return;
 if(analyzerApexPilotTotalsCache.get(rowId)?.loadedAt&&Date.now()-analyzerApexPilotTotalsCache.get(rowId).loadedAt<15000)return;
 const promise=fetchAllApexTeamPits(rowId,'',null).catch(()=>[]).finally(()=>analyzerApexPilotTotalsLoading.delete(rowId));
 analyzerApexPilotTotalsLoading.set(rowId,promise);await promise;
}
function renderAnalyzerRulesPilots(driver){
 const host=document.getElementById('analyzerRulesPilots');if(!host)return;
 const pilots=driver?analyzerOfficialPilotTotals(driver):[];
 if(driver&&!pilots.length)analyzerEnsureOfficialPilotTotals(driver).then(()=>{const followed=(state.drivers||[]).find(d=>analyzerFollowed(d));if(followed&&Number(followed.apex_row)===Number(driver.apex_row))renderAnalyzerRulesPilots(followed)}).catch(()=>{});
 host.hidden=!pilots.length;
 host.innerHTML=pilots.map(p=>{const parts=String(p.name).trim().split(/\s+/),first=parts.shift()||'',last=parts.join(' ');return `<div class="rules-pilot-card"><span class="rules-pilot-name">${analyzerEscape(first)}${last?`<br>${analyzerEscape(last)}`:''}</span><strong>${analyzerEscape(analyzerPilotHoursLabel(p.seconds))}</strong></div>`}).join('');
}
function setAnalyzerSort(value){analyzerSort=value||'position';renderAnalyzer()}
function openAnalyzerRules(){
 const modal=document.getElementById('analyzerRulesModal');if(!modal)return;
 const map={ruleRaceHours:'raceHours',ruleRequiredStops:'requiredStops',ruleMinStint:'minStintMinutes',ruleMaxStint:'maxStintMinutes',ruleMinPit:'minPitSeconds',rulePitClose:'pitCloseMinutes',ruleSafetyMargin:'safetyMarginMinutes',ruleDriversCount:'driversCount',ruleDriverMinimum:'driverMinimumMinutes'};
 Object.entries(map).forEach(([id,key])=>{const el=document.getElementById(id);if(el)el.value=analyzerRules[key]});modal.classList.add('show');
}
function closeAnalyzerRules(){document.getElementById('analyzerRulesModal')?.classList.remove('show')}
function saveAnalyzerRules(event){
 event?.preventDefault();
 analyzerRules={raceHours:analyzerNumeric(document.getElementById('ruleRaceHours')?.value,24),requiredStops:analyzerNumeric(document.getElementById('ruleRequiredStops')?.value,28),minStintMinutes:analyzerNumeric(document.getElementById('ruleMinStint')?.value,10),maxStintMinutes:analyzerNumeric(document.getElementById('ruleMaxStint')?.value,60),minPitSeconds:analyzerNumeric(document.getElementById('ruleMinPit')?.value,150),pitCloseMinutes:analyzerNumeric(document.getElementById('rulePitClose')?.value,30),safetyMarginMinutes:analyzerNumeric(document.getElementById('ruleSafetyMargin')?.value,2),driversCount:analyzerNumeric(document.getElementById('ruleDriversCount')?.value,6),driverMinimumMinutes:analyzerNumeric(document.getElementById('ruleDriverMinimum')?.value,210)};
 analyzerStorageSafeSet(ANALYZER_RULES_KEY,JSON.stringify(analyzerRules));analyzerSaveSession('rules-update');closeAnalyzerRules();renderAnalyzer();
}
function resetAnalyzerRules(){analyzerRules={...ANALYZER_DEFAULT_RULES};analyzerStorageSafeSet(ANALYZER_RULES_KEY,JSON.stringify(analyzerRules));analyzerSaveSession('rules-reset');openAnalyzerRules();renderAnalyzer()}
function renderApexTeamPilots(){
 const host=document.getElementById('apexHistoryPilotsList'),status=document.getElementById('apexHistoryPilotsStatus');if(!host)return;
 const driver=(state.drivers||[]).find(d=>Number(d.apex_row)===Number(apexHistorySelectedRowId));
 if(!driver){host.innerHTML='<div class="analyzer-empty">Pilotes indisponibles pour cette équipe.</div>';if(status)status.textContent='Aucune donnée pilote.';return}
 const history=analyzerTeamHistory(driver),relays=[...(history.relays||[])];if(history.currentRelay)relays.push({...history.currentRelay,status:'active'});
 const usable=relays.filter(r=>String(r?.pilot||'').trim());
 if(!usable.length){host.innerHTML='<div class="analyzer-empty">Aucun pilote identifié pour le moment. Velocity alimentera cette vue dès qu’Apex communiquera le pilote courant.</div>';if(status)status.textContent='En attente des données pilotes Apex…';return}
 const groups=new Map();usable.forEach(r=>{const name=String(r.pilot).trim();if(!groups.has(name))groups.set(name,[]);groups.get(name).push(r)});
 if(status)status.textContent=`${groups.size} pilote(s) · ${usable.length} relais détecté(s)`;
 host.innerHTML=[...groups.entries()].map(([pilot,items])=>`<section class="apex-pilot-group"><h3>${analyzerEscape(pilot)}</h3><div class="apex-history-laps-wrap"><table class="apex-history-laps-table"><thead><tr><th>RELAIS</th><th>STATUT</th><th>DURÉE</th><th>TOURS</th><th>MEILLEUR</th><th>MOYENNE</th></tr></thead><tbody>${items.map(r=>{const duration=r.status==='active'?(analyzerParseDuration(driver.track_timer)||((Date.now()-Number(r.startAt||Date.now()))/1000)):((Number(r.endAt)-Number(r.startAt))/1000);const best=(r.laps||[]).filter(Number.isFinite).length?Math.min(...r.laps.filter(Number.isFinite)):null;const avg=Number.isFinite(r.average)?r.average:(Number(r.lapCount)>0?Number(r.lapSum)/Number(r.lapCount):null);return `<tr><td>${Number(r.index)||'—'}</td><td>${r.status==='active'?'EN COURS':'TERMINÉ'}</td><td>${analyzerEscape(analyzerFormatDuration(Number(duration)||0))}</td><td>${Number(r.lapCount)||0}</td><td>${Number.isFinite(best)?analyzerEscape(formatApexMilliseconds(best*1000)):'—'}</td><td>${Number.isFinite(avg)?analyzerEscape(formatApexMilliseconds(avg*1000)):'—'}</td></tr>`}).join('')}</tbody></table></div></section>`).join('');
}
function resetAnalyzerLearning(){if(!window.confirm('Effacer l’historique des relais et les karts virtuels appris par Analyzer ?'))return;analyzerLearning={teams:{},startedAt:Date.now()};analyzerSaveLearning();analyzerSaveSession('learning-reset');renderAnalyzer()}



/* V6.3.1 — Consultation des tours et anciennes sessions Apex */
let apexPreviousSessions=[];
let apexHistorySelectedRowId=null;
let apexHistorySelectedSession='';
let apexHistoricalTeams=[];
function updateApexHistoricalDebriefButton(){
 const button=document.getElementById('apexHistoryDebriefButton');if(!button)return;
 const enabled=Boolean(apexHistorySelectedSession&&apexHistorySelectedRowId&&apexHistoricalTeams.length);
 button.hidden=!apexHistorySelectedSession;button.disabled=!enabled;
 button.textContent=enabled?'GÉNÉRER LE DÉBRIEF':'SÉLECTIONNEZ UNE ÉQUIPE';
}

function apexHistoryCircuitId(){return String(state?.circuit_id||'')}
async function apexHistoryRequest(command){
 const response=await fetch('/api/apex/history',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({circuit_id:apexHistoryCircuitId(),request:command})});
 const data=await response.json().catch(()=>({ok:false,error:'Réponse Apex illisible'}));
 if(!response.ok||!data.ok)throw new Error(data.error||`Erreur Apex ${response.status}`);
 return String(data.raw||'');
}
async function apexSessionsRequest(){
 const query=new URLSearchParams({circuit_id:apexHistoryCircuitId()});
 const response=await fetch(`/api/apex/sessions?${query.toString()}`,{cache:'no-store'});
 const data=await response.json().catch(()=>({ok:false,error:'Réponse Apex illisible'}));
 if(!response.ok||!data.ok)throw new Error(data.error||`Erreur Apex ${response.status}`);
 return Array.isArray(data.sessions)?data.sessions:[];
}
function openApexHistory(){
 document.getElementById('apexHistoryModal')?.classList.add('show');
 showApexHistoryPanel('sessions');
 if(!apexPreviousSessions.length)loadApexPreviousSessions();
}
function closeApexHistory(){document.getElementById('apexHistoryModal')?.classList.remove('show')}
function showApexHistoryPanel(panel){
 const sessions=panel==='sessions',laps=panel==='laps',pits=panel==='pits',pilots=panel==='pilots';
 document.getElementById('apexHistorySessionsPanel')?.classList.toggle('active',sessions);
 document.getElementById('apexHistoryLapsPanel')?.classList.toggle('active',laps);
 document.getElementById('apexHistoryPitsPanel')?.classList.toggle('active',pits);
 document.getElementById('apexHistoryPilotsPanel')?.classList.toggle('active',pilots);
 document.getElementById('apexHistorySessionsTab')?.classList.toggle('active',sessions);
 document.getElementById('apexHistoryLapsTab')?.classList.toggle('active',laps);
 document.getElementById('apexHistoryPitsTab')?.classList.toggle('active',pits);
 document.getElementById('apexHistoryPilotsTab')?.classList.toggle('active',pilots);
 if(pits&&apexHistorySelectedRowId)reloadApexTeamPits();
 if(pilots&&apexHistorySelectedRowId)renderApexTeamPilots();
}
function parseApexPreviousSessions(raw){
 return String(raw||'').split(/\r?\n/).map(line=>line.trim()).filter(Boolean).map(line=>{
  const parts=line.split('#'),item={id:String(parts.shift()||'').trim(),name:parts.join('#').trim()};item.kind=analyzerQualificationSessionName(item.name)?'qualification':'other';return item;
 }).filter(item=>item.id&&item.name&&!/^error$/i.test(item.id));
}
async function loadApexPreviousSessions(){
 const status=document.getElementById('apexHistorySessionsStatus'),host=document.getElementById('apexHistorySessionsList');
 if(status)status.textContent='Interrogation d’Apex…';if(host)host.innerHTML='<div class="analyzer-empty">Chargement…</div>';
 try{
  try{apexPreviousSessions=await apexSessionsRequest()}catch(_){apexPreviousSessions=parseApexPreviousSessions(await apexHistoryRequest('S#'))}
  if(status)status.textContent=apexPreviousSessions.length?`${apexPreviousSessions.length} session(s) disponible(s).`:'Aucune ancienne session disponible.';
  if(host)host.innerHTML=apexPreviousSessions.length?apexPreviousSessions.map(session=>`<button type="button" class="apex-history-session-row" onclick="selectApexPreviousSession('${analyzerEscape(session.id)}')"><span>${analyzerEscape(session.name)}</span><small>ID ${analyzerEscape(session.id)}</small><b>CONSULTER</b></button>`).join(''):'<div class="analyzer-empty">Aucun historique Apex pour le moment.</div>';
  refreshApexHistorySessionSelect();updateApexHistoricalDebriefButton();
 }catch(error){if(status)status.textContent='Historique indisponible';if(host)host.innerHTML=`<div class="analyzer-empty">${analyzerEscape(error.message)}</div>`}
}
function refreshApexHistorySessionSelect(){
 const selects=[document.getElementById('apexHistorySessionSelect'),document.getElementById('apexHistoryPitsSessionSelect')].filter(Boolean);if(!selects.length)return;
 for(const select of selects){const current=select.value;select.innerHTML='<option value="">Course en direct</option>'+apexPreviousSessions.map(s=>`<option value="${analyzerEscape(s.id)}">${analyzerEscape(s.name)}</option>`).join('');select.value=apexPreviousSessions.some(s=>s.id===current)?current:'';}
}
async function selectApexPreviousSession(id){
 apexHistorySelectedSession=String(id||'');
 showApexHistoryPanel('laps');
 refreshApexHistorySessionSelect();
 const select=document.getElementById('apexHistorySessionSelect');if(select)select.value=apexHistorySelectedSession;
 await loadApexHistoricalTeams(apexHistorySelectedSession);
 const currentName=document.getElementById('apexHistoryTeamName')?.textContent||'';
 const matched=apexHistoricalTeams.find(team=>normalizeApexTeamName(team.name)===normalizeApexTeamName(currentName));
 if(matched){apexHistorySelectedRowId=matched.rowId;setApexHistoryTeamHeader(matched);reloadApexTeamLaps()}
 else{apexHistorySelectedRowId=null;document.getElementById('apexHistoryLapsStatus').textContent='Sélectionnez une équipe de cette session ci-dessus.'}
 updateApexHistoricalDebriefButton();
}
function openApexTeamLaps(rowId){
 if(!rowId){window.alert('Identifiant Apex de cette équipe indisponible.');return}
 apexHistorySelectedRowId=Number(rowId);
 const driver=(state.drivers||[]).find(d=>Number(d.apex_row)===apexHistorySelectedRowId);
 document.getElementById('apexHistoryModal')?.classList.add('show');showApexHistoryPanel('laps');refreshApexHistorySessionSelect();
 const teamName=driver?.driver||`Équipe ${rowId}`,teamKart=`KART ${validKartNumber(driver)||driver?.apex||'—'}`;
 document.getElementById('apexHistoryTeamName').textContent=teamName;document.getElementById('apexHistoryTeamKart').textContent=teamKart;
 document.getElementById('apexHistoryPitsTeamName').textContent=teamName;document.getElementById('apexHistoryPitsTeamKart').textContent=teamKart;document.getElementById('apexHistoryPilotsTeamName').textContent=teamName;document.getElementById('apexHistoryPilotsTeamKart').textContent=teamKart;
 reloadApexTeamLaps();
}
async function reloadApexTeamLaps(){
 const select=document.getElementById('apexHistorySessionSelect'),nextSession=String(select?.value||'');
 if(nextSession!==apexHistorySelectedSession){apexHistorySelectedSession=nextSession;if(nextSession)await loadApexHistoricalTeams(nextSession);else{apexHistoricalTeams=[];renderApexHistoricalTeams()}updateApexHistoricalDebriefButton()}
 if(apexHistorySelectedRowId)loadApexTeamLaps(apexHistorySelectedRowId,apexHistorySelectedSession);
}

function normalizeApexTeamName(value){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/gi,'').toLowerCase()}
function parseApexSnapshotTeams(raw){
 const line=String(raw||'').split(/\r?\n/).find(item=>item.startsWith('grid||'));if(!line)return [];
 const html=line.slice(6),doc=new DOMParser().parseFromString(`<table>${html}</table>`,'text/html'),teams=[];
 doc.querySelectorAll('tr[data-id]').forEach(row=>{
  const rawId=row.getAttribute('data-id')||'';if(!/^r\d+$/.test(rawId))return;
  const name=(row.querySelector('[data-type="dr"],td.dr')?.textContent||'').trim();if(!name)return;
  const kart=(row.querySelector('[data-type="no"],td.no')?.textContent||'').trim();
  teams.push({rowId:Number(rawId.replace('r','')),name,kart});
 });
 return teams;
}
async function loadApexHistoricalTeams(sessionId){
 const host=document.getElementById('apexHistoryTeamsList');if(host)host.innerHTML='<div class="analyzer-empty">Chargement du classement de la session…</div>';
 try{apexHistoricalTeams=parseApexSnapshotTeams(await apexHistoryRequest(`S#${sessionId}`));renderApexHistoricalTeams()}
 catch(error){apexHistoricalTeams=[];if(host)host.innerHTML=`<div class="analyzer-empty">${analyzerEscape(error.message)}</div>`}
}
function renderApexHistoricalTeams(){
 const host=document.getElementById('apexHistoryTeamsList');if(!host)return;
 if(!apexHistorySelectedSession){host.innerHTML='';return}
 host.innerHTML=apexHistoricalTeams.length?`<div class="apex-history-teams-title">ÉQUIPES DE LA SESSION</div><div class="apex-history-team-buttons">${apexHistoricalTeams.map(team=>`<button type="button" onclick="openApexHistoricalTeam(${team.rowId},'${encodeURIComponent(team.name)}','${encodeURIComponent(team.kart)}')"><b>${analyzerEscape(team.kart||'—')}</b><span>${analyzerEscape(team.name)}</span></button>`).join('')}</div>`:'<div class="analyzer-empty">Classement historique indisponible.</div>';
}
function setApexHistoryTeamHeader(team){const name=team?.name||'Équipe',kart=`KART ${team?.kart||'—'}`;document.getElementById('apexHistoryTeamName').textContent=name;document.getElementById('apexHistoryTeamKart').textContent=kart;document.getElementById('apexHistoryPitsTeamName').textContent=name;document.getElementById('apexHistoryPitsTeamKart').textContent=kart;document.getElementById('apexHistoryPilotsTeamName').textContent=name;document.getElementById('apexHistoryPilotsTeamKart').textContent=kart}
function openApexHistoricalTeam(rowId,name,kart){apexHistorySelectedRowId=Number(rowId);setApexHistoryTeamHeader({name:decodeURIComponent(name),kart:decodeURIComponent(kart)});updateApexHistoricalDebriefButton();reloadApexTeamLaps()}

function apexProtocolNumber(value){
 const n=parseInt(String(value??'').replace(/[a-zA-Z]/g,''),10);
 return Number.isFinite(n)?n:0;
}
function parseApexLapLine(line,rowId){
 // Format Apex officiel : D<id>.L<numéro>#<S1>|<S2>|<S3>|<tour>
 const value=String(line||'').trim();
 const marker=`D${rowId}.L`;
 if(!value.startsWith(marker))return null;
 const dot=value.indexOf('.');
 const hash=value.indexOf('#',dot+1);
 if(dot<0||hash<0)return null;
 const lapToken=value.slice(dot+1,hash); // ex. L203
 const fields=value.slice(hash+1).split('|');
 if(fields.length<4)return null;
 return {
  lap:apexProtocolNumber(lapToken.replace(/^L/i,'')),
  sector1:apexProtocolNumber(fields[0]),
  sector2:apexProtocolNumber(fields[1]),
  sector3:apexProtocolNumber(fields[2]),
  lapTime:apexProtocolNumber(fields[3])
 };
}
function parseApexTeamData(raw,rowId){
 const byLap=new Map();
 for(const line of String(raw||'').split(/\r?\n/)){
  const lap=parseApexLapLine(line,rowId);
  if(lap&&lap.lap)byLap.set(lap.lap,lap);
 }
 const laps=[...byLap.values()].sort((a,b)=>b.lap-a.lap);
 return {laps};
}
function formatApexMilliseconds(ms){
 const value=Number(ms);if(!Number.isFinite(value)||value<=0)return '—';
 const minutes=Math.floor(value/60000),seconds=Math.floor((value%60000)/1000),millis=Math.floor(value%1000);
 return minutes?`${minutes}:${String(seconds).padStart(2,'0')}.${String(millis).padStart(3,'0')}`:`${seconds}.${String(millis).padStart(3,'0')}`;
}
async function fetchAllApexTeamLaps(rowId,sessionId,status){
 const prefix=sessionId?`S#${sessionId}#`:'';
 // Apex charge d'abord 30 tours, puis élargit la fenêtre. On reproduit ce mécanisme
 // plutôt que d'envoyer une valeur hors protocole comme -9999.
 const windows=[30,100,300,750,1500,3000];
 let latest=[];
 for(const count of windows){
  if(status)status.textContent=`Chargement des tours Apex… fenêtre ${count}`;
  const command=`${prefix}D#-${count}#D${rowId}.L#-999#D${rowId}.P#2#D${rowId}.B#1#D${rowId}.INF`;
  const parsed=parseApexTeamData(await apexHistoryRequest(command),rowId).laps;
  if(parsed.length)latest=parsed;
  // Moins de lignes que la fenêtre demandée, ou présence du tour 1 : historique complet.
  if(parsed.some(l=>l.lap===1)||parsed.length<count)return parsed;
 }
 return latest;
}
function classifyApexLapTimes(laps,pits){
 const pitInLaps=new Set((pits||[]).map(p=>Number(p.lap)).filter(Number.isFinite));
 let previousBest=0;
 const classes=new Map();
 // Le meilleur progressif doit être calculé dans l'ordre réel de la course.
 [...laps].sort((a,b)=>a.lap-b.lap).forEach(lap=>{
  const isPitIn=pitInLaps.has(Number(lap.lap));
  const isImprovement=!isPitIn&&previousBest>0&&lap.lapTime>0&&lap.lapTime<previousBest;
  classes.set(Number(lap.lap),isPitIn?'lap-pit-in':(isImprovement?'lap-progressive-best':''));
  if(!isPitIn&&lap.lapTime>0&&(!previousBest||lap.lapTime<previousBest))previousBest=lap.lapTime;
 });
 return classes;
}
async function loadApexTeamLaps(rowId,sessionId=''){
 const status=document.getElementById('apexHistoryLapsStatus'),tbody=document.getElementById('apexHistoryLapsTable'),summary=document.getElementById('apexHistorySummary');
 if(status)status.textContent='Chargement de tous les tours depuis Apex…';if(tbody)tbody.innerHTML='';if(summary)summary.innerHTML='';
 try{
  const laps=await fetchAllApexTeamLaps(rowId,sessionId,status),valid=laps.filter(l=>l.lapTime>0),best=valid.length?Math.min(...valid.map(l=>l.lapTime)):0;
  let pits=[];try{pits=await fetchAllApexTeamPits(rowId,sessionId,null)}catch(_error){pits=[]}
  const lapClasses=classifyApexLapTimes(valid,pits);
  const sessionName=sessionId?(apexPreviousSessions.find(s=>s.id===sessionId)?.name||`Session ${sessionId}`):'Course en direct';
  if(status)status.textContent=`${valid.length} tour(s) chargé(s) — ${sessionName}`;
  if(summary)summary.innerHTML=`<div><span>SESSION</span><b>${analyzerEscape(sessionName)}</b></div><div><span>MEILLEUR TOUR</span><b>${formatApexMilliseconds(best)}</b></div><div><span>TOURS CHARGÉS</span><b>${valid.length}</b></div>`;
  if(tbody)tbody.innerHTML=valid.length?valid.map(l=>{const colorClass=lapClasses.get(Number(l.lap))||'';return `<tr><td>${l.lap}</td><td>${formatApexMilliseconds(l.sector1)}</td><td>${formatApexMilliseconds(l.sector2)}</td><td>${formatApexMilliseconds(l.sector3)}</td><td class="lap-main ${colorClass}">${formatApexMilliseconds(l.lapTime)}</td><td class="lap-delta">${best&&l.lapTime?`+${formatApexMilliseconds(l.lapTime-best)}`:'—'}</td></tr>`}).join(''):'<tr><td colspan="6">Aucun tour disponible pour cette équipe dans cette session.</td></tr>';
 }catch(error){if(status)status.textContent=`Erreur : ${error.message}`;if(tbody)tbody.innerHTML='<tr><td colspan="6">Impossible de charger les tours.</td></tr>'}
}


function apexPitProtocolMilliseconds(value){
 // Alignement strict sur le parseur officiel Apex tzfji() :
 // suppression des marqueurs alphabétiques puis parseInt => valeur en millisecondes.
 // Ne jamais multiplier une valeur décimale par 1000 : Apex tronque lui-même la partie décimale.
 return apexProtocolNumber(value);
}
function apexPitProtocolLap(value){
 // Alignement strict sur tzfji() : le numéro de tour est parsé comme un entier Apex.
 return apexProtocolNumber(value);
}
function formatApexPitClock(ms){
 const value=Math.max(0,Math.floor(Number(ms)||0));if(!value)return '—';
 const totalSeconds=Math.floor(value/1000),hours=Math.floor(totalSeconds/3600),minutes=Math.floor((totalSeconds%3600)/60),seconds=totalSeconds%60;
 return `${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}`;
}
function formatApexPitDuration(ms){
 const value=Math.max(0,Math.floor(Number(ms)||0));if(!value)return '—';
 const minutes=Math.floor(value/60000),seconds=Math.floor((value%60000)/1000),millis=value%1000;
 return `${minutes}:${String(seconds).padStart(2,'0')}.${String(millis).padStart(3,'0')}`;
}
function parseApexPitLine(line,rowId){
 const value=String(line||'').trim(),marker=`D${rowId}.P`;
 if(!value.startsWith(marker))return null;
 const hash=value.indexOf('#',marker.length);if(hash<0)return null;
 const markerStop=apexProtocolNumber(value.slice(marker.length,hash));
 const fields=value.slice(hash+1).split('|').map(item=>String(item||'').trim());
 if(!markerStop||fields.length<4)return null;
 // Format Apex complet : arrêt | tour | entrée | sortie | pit_time | track_time | tours relais | driver_id | driver_total_time
 const stop=apexProtocolNumber(fields[0])||markerStop;
 return {
  stop,
  lap:apexPitProtocolLap(fields[1]),
  pitInMs:apexPitProtocolMilliseconds(fields[2]),
  pitOutMs:apexPitProtocolMilliseconds(fields[3]),
  pitTimeMs:apexPitProtocolMilliseconds(fields[4]),
  trackTimeMs:apexPitProtocolMilliseconds(fields[5]),
  relayLapsNumber:apexProtocolNumber(fields[6]),
  driverId:apexProtocolNumber(fields[7]),
  driverTotalTimeMs:apexPitProtocolMilliseconds(fields[8])
 };
}
function parseApexDriverInfo(raw,rowId){
 const marker=`D${rowId}.INF`,line=String(raw||'').split(/\r?\n/).find(item=>String(item||'').trim().startsWith(marker));
 if(!line)return {rowId:Number(rowId)||0,kartNumber:'',driverName:'',drivers:[]};
 const start=line.indexOf('<');if(start<0)return {rowId:Number(rowId)||0,kartNumber:'',driverName:'',drivers:[]};
 try{
  const box=document.createElement('div');box.innerHTML=line.slice(start);
  const root=box.firstElementChild;
  const drivers=[...box.querySelectorAll('driver')].map(node=>({
   driverId:apexProtocolNumber(node.getAttribute('id')),
   memberId:String(node.getAttribute('member')||''),
   number:String(node.getAttribute('num')||''),
   color:String(node.getAttribute('color')||''),
   flag:String(node.getAttribute('nat')||''),
   name:String(node.getAttribute('name')||'').trim(),
   photoId:String(node.getAttribute('picture')||''),
   current:String(node.getAttribute('current')||'')==='1'
  })).filter(item=>item.driverId&&item.name);
  return {
   rowId:Number(rowId)||0,
   apexId:String(root?.getAttribute('id')||''),
   memberId:String(root?.getAttribute('member')||''),
   centerId:String(root?.getAttribute('center')||''),
   kartNumber:String(root?.getAttribute('num')||'').trim(),
   kartColor:String(root?.getAttribute('color')||''),
   driverName:String(root?.getAttribute('name')||'').trim(),
   drivers
  };
 }catch(_){return {rowId:Number(rowId)||0,kartNumber:'',driverName:'',drivers:[]}}
}
function parseApexDriverInfos(raw,rowId){return parseApexDriverInfo(raw,rowId).drivers}
function analyzerCacheOfficialPilotTotals(rowId,pits,drivers,teamInfo=null){
 const byId=new Map();
 (drivers||[]).forEach(d=>byId.set(Number(d.driverId),{driverId:Number(d.driverId),name:d.name,current:Boolean(d.current),totalMs:0}));
 (pits||[]).forEach(p=>{const id=Number(p.driverId)||0;if(!id)return;const current=byId.get(id)||{driverId:id,name:String(p.driverName||'').trim(),current:false,totalMs:0};current.totalMs=Math.max(Number(current.totalMs)||0,Number(p.driverTotalTimeMs)||0);if(p.driverName)current.name=p.driverName;byId.set(id,current)});
 analyzerApexPilotTotalsCache.set(Number(rowId),{pilots:[...byId.values()],teamInfo:teamInfo||null,loadedAt:Date.now()});
}
function parseApexPitData(raw,rowId){
 const teamInfo=parseApexDriverInfo(raw,rowId),drivers=teamInfo.drivers,driverNames=new Map(drivers.map(d=>[Number(d.driverId),d.name]));
 const byStop=new Map();
 for(const line of String(raw||'').split(/\r?\n/)){const pit=parseApexPitLine(line,rowId);if(pit){pit.driverName=driverNames.get(Number(pit.driverId))||'';byStop.set(pit.stop,pit)}}
 const chronological=[...byStop.values()].sort((a,b)=>a.stop-b.stop);
 chronological.forEach((pit,index)=>{
  const previous=chronological[index-1];
  pit.hour=formatApexPitClock(pit.pitInMs);
  pit.onTrack=formatApexPitClock(pit.trackTimeMs||Math.max(0,pit.pitInMs-(previous?.pitOutMs||0)));
  pit.pitTime=pit.pitTimeMs?formatApexPitDuration(pit.pitTimeMs):(pit.pitOutMs>pit.pitInMs?formatApexPitDuration(pit.pitOutMs-pit.pitInMs):'—');
 });
 analyzerCacheOfficialPilotTotals(rowId,chronological,drivers,teamInfo);
 return chronological.sort((a,b)=>b.stop-a.stop);
}
async function fetchAllApexTeamPits(rowId,sessionId,status){
 const prefix=sessionId?`S#${sessionId}#`:'';
 const windows=[30,100,300,750];let latest=[];
 for(const count of windows){
  if(status)status.textContent=`Chargement des arrêts Apex… fenêtre ${count}`;
  const command=`${prefix}D#-${count}#D${rowId}.P#-${count}#D${rowId}.INF`;
  const parsed=parseApexPitData(await apexHistoryRequest(command),rowId);if(parsed.length)latest=parsed;
  if(parsed.some(p=>p.stop===1)||parsed.length<count)return parsed;
 }
 return latest;
}

function analyzerRelayHydrationKey(driver){
 return `${analyzerSessionCircuit()}:${Number(driver?.apex_row)||0}`;
}
function analyzerBuildHydratedRelay(driver,laps,pits){
 const chronological=(laps||[]).filter(l=>Number(l?.lap)>0&&Number(l?.lapTime)>0).slice().sort((a,b)=>a.lap-b.lap);
 const completedPits=(pits||[]).filter(p=>Number(p?.pitOutMs)>Number(p?.pitInMs)&&Number(p?.lap)>0).slice().sort((a,b)=>a.stop-b.stop);
 const latestPit=completedPits[completedPits.length-1]||null;
 const pitInLaps=new Set((pits||[]).map(p=>Number(p?.lap)).filter(Number.isFinite));
 const startLap=latestPit?Number(latestPit.lap):0;
 let current=chronological.filter(l=>Number(l.lap)>startLap&&!pitInLaps.has(Number(l.lap)));
 // Le premier passage après le départ ou après la sortie des stands ne représente pas un tour lancé complet.
 if(current.length)current=current.slice(1);
 const values=current.map(l=>Number(l.lapTime)/1000).filter(v=>Number.isFinite(v)&&v>0);
 const lapNumbers=current.map(l=>Number(l.lap)).filter(Number.isFinite);
 const gridReference=analyzerLiveGridReference();
 return {
  index:Math.max(1,completedPits.length+1),
  startAt:Date.now(),
  lapSum:values.reduce((a,b)=>a+b,0),
  lapCount:values.length,
  laps:values.slice(-60),
  lapNumbers:lapNumbers.slice(-60),
  bestLaps:values.slice().sort((a,b)=>a-b).slice(0,3),
  warmupSkipped:true,
  gridStartPace:gridReference,
  gridEndPace:gridReference,
  status:'active',
  source:'apex-history',
  hydratedAt:Date.now(),
  startLap,
  latestLap:lapNumbers.length?Math.max(...lapNumbers):startLap,
  pilot:analyzerOfficialCurrentPilot(driver)||analyzerDriverPilot(driver)||null,
  kart:analyzerOfficialCurrentKart(driver)||analyzerRelayKart(driver)||null
 };
}
function analyzerApplyHydratedRelay(driver,laps,pits){
 const key=analyzerTeamKey(driver),now=Date.now();
 const item=analyzerLearning.teams[key]||{name:driver.driver,stints:[],relays:[],lastStatus:null,lastTrackSeconds:null,lastStops:null,lastLapCount:null,currentStintLapSum:0,currentStintLapCount:0,virtualKart:`V-${String(driver.apex||driver.pos||key).replace(/\D/g,'').padStart(2,'0')}`,updatedAt:now};
 item.relays=Array.isArray(item.relays)?item.relays:[];
 if(driver.status==='pit'){
  item.currentRelay=null;item.currentStintLapSum=0;item.currentStintLapCount=0;
 }else{
  const hydrated=analyzerBuildHydratedRelay(driver,laps,pits);
  const existing=item.currentRelay;
  const existingLatest=Math.max(0,...((existing?.lapNumbers||[]).map(Number).filter(Number.isFinite)));
  if(!existing||hydrated.latestLap>=existingLatest){
   item.currentRelay=hydrated;
   item.currentStintLapSum=hydrated.lapSum;
   item.currentStintLapCount=hydrated.lapCount;
  }
 }
 const maxHistoricalLap=Math.max(0,...(laps||[]).map(l=>Number(l?.lap)).filter(Number.isFinite));
 const liveLap=analyzerNumeric(driver.laps,null);
 item.lastLapCount=Number.isFinite(liveLap)?Math.max(liveLap,maxHistoricalLap):maxHistoricalLap;
 item.lastStops=analyzerNumeric(driver.pit_stops,item.lastStops);
 item.lastStatus=driver.status||item.lastStatus;
 item.lastTrackSeconds=analyzerParseDuration(driver.track_timer);
 item.name=driver.driver;item.updatedAt=now;item.hydratedAt=now;
 analyzerLearning.teams[key]=item;
}
async function analyzerHydrateActiveRelays({force=false}={}){
 if(analyzerRelayHydrationLoading)return;
 const drivers=(state.drivers||[]).filter(d=>Number(d.apex_row)>0);
 if(!drivers.length)return;
 const circuit=analyzerSessionCircuit(),now=Date.now();
 const pending=drivers.filter(driver=>{
  const cache=analyzerRelayHydrationCache.get(analyzerRelayHydrationKey(driver));
  const currentLap=analyzerNumeric(driver.laps,0),currentStops=analyzerNumeric(driver.pit_stops,0);
  return force||!cache||cache.laps!==currentLap||cache.stops!==currentStops||now-cache.updatedAt>60000;
 });
 if(!pending.length)return;
 analyzerRelayHydrationLoading=true;const token=++analyzerRelayHydrationToken;renderAnalyzer();
 for(const driver of pending){
  if(token!==analyzerRelayHydrationToken||circuit!==analyzerSessionCircuit())break;
  const rowId=Number(driver.apex_row),cacheKey=analyzerRelayHydrationKey(driver);
  try{
   const [laps,pits]=await Promise.all([fetchAllApexTeamLaps(rowId,'',null),fetchAllApexTeamPits(rowId,'',null)]);
   analyzerApplyHydratedRelay(driver,laps,pits);
   analyzerRelayHydrationCache.set(cacheKey,{laps:analyzerNumeric(driver.laps,0),stops:analyzerNumeric(driver.pit_stops,0),updatedAt:Date.now()});
  }catch(error){
   analyzerRelayHydrationCache.set(cacheKey,{laps:analyzerNumeric(driver.laps,0),stops:analyzerNumeric(driver.pit_stops,0),updatedAt:Date.now(),error:String(error?.message||error)});
  }
  analyzerSaveLearning();renderAnalyzer();
 }
 analyzerRelayHydrationLoading=false;analyzerSaveSession('relay-hydration');renderAnalyzer();
}
function analyzerScheduleRelayHydration(){
 if(analyzerRelayHydrationScheduled||analyzerRelayHydrationLoading)return;
 analyzerRelayHydrationScheduled=setTimeout(()=>{analyzerRelayHydrationScheduled=null;analyzerHydrateActiveRelays()},250);
}

async function reloadApexTeamPits(){
 const select=document.getElementById('apexHistoryPitsSessionSelect'),nextSession=String(select?.value||apexHistorySelectedSession||'');
 apexHistorySelectedSession=nextSession;
 const lapsSelect=document.getElementById('apexHistorySessionSelect');if(lapsSelect)lapsSelect.value=nextSession;
 if(apexHistorySelectedRowId)loadApexTeamPits(apexHistorySelectedRowId,nextSession);
}
async function loadApexTeamPits(rowId,sessionId=''){
 const status=document.getElementById('apexHistoryPitsStatus'),tbody=document.getElementById('apexHistoryPitsTable');
 if(status)status.textContent='Chargement de tous les arrêts depuis Apex…';if(tbody)tbody.innerHTML='';
 try{
  const pits=await fetchAllApexTeamPits(rowId,sessionId,status),sessionName=sessionId?(apexPreviousSessions.find(s=>s.id===sessionId)?.name||`Session ${sessionId}`):'Course en direct';
  if(status)status.textContent=`${pits.length} arrêt(s) chargé(s) — ${sessionName}`;
  if(tbody)tbody.innerHTML=pits.length?pits.map(p=>`<tr><td>${p.stop}</td><td>${p.lap||'—'}</td><td>${analyzerEscape(p.hour||'—')}</td><td>${analyzerEscape(p.onTrack||'—')}</td><td class="pit-main">${analyzerEscape(p.pitTime||'—')}</td></tr>`).join(''):'<tr><td colspan="5">Aucun arrêt aux stands disponible pour cette équipe dans cette session.</td></tr>';
 }catch(error){if(status)status.textContent=`Erreur : ${error.message}`;if(tbody)tbody.innerHTML='<tr><td colspan="5">Impossible de charger les arrêts aux stands.</td></tr>'}
}

document.addEventListener('DOMContentLoaded',()=>{analyzerLoad();analyzerSessionAutosaveStart();document.getElementById('analyzerRulesModal')?.addEventListener('click',event=>{if(event.target.id==='analyzerRulesModal')closeAnalyzerRules()});document.getElementById('analyzerSessionsModal')?.addEventListener('click',event=>{if(event.target.id==='analyzerSessionsModal')closeAnalyzerSessions()});document.getElementById('apexHistoryModal')?.addEventListener('click',event=>{if(event.target.id==='apexHistoryModal')closeApexHistory()})});window.addEventListener('beforeunload',()=>analyzerSaveSession('beforeunload'));document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')analyzerSaveSession('hidden')});

setInterval(()=>{analyzerFormatLocalClock();analyzerUpdateRaceRemaining()},1000);


/* Velocity V6.14.0 — Dernier chrono simplifié et ouverture plein écran */
let analyzerDebriefBusy=false;
let analyzerDebriefReport=null;
function analyzerDebriefMedian(values){const a=values.filter(Number.isFinite).slice().sort((x,y)=>x-y);if(!a.length)return NaN;const m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2}
function analyzerDebriefAverage(values){const a=values.filter(Number.isFinite);return a.length?a.reduce((x,y)=>x+y,0)/a.length:NaN}
function analyzerDebriefStd(values){const a=values.filter(Number.isFinite),avg=analyzerDebriefAverage(a);return a.length&&Number.isFinite(avg)?Math.sqrt(a.reduce((sum,value)=>sum+(value-avg)**2,0)/a.length):NaN}
function analyzerDebriefRank(items,key,value){const valid=items.map(x=>x[key]).filter(Number.isFinite).sort((a,b)=>a-b);return Number.isFinite(value)?valid.findIndex(v=>v>=value)+1:0}
function analyzerDebriefCleanLaps(laps,pits){
 const pitLaps=new Set((pits||[]).map(p=>Number(p.lap)).filter(Number.isFinite));
 const raw=(laps||[]).filter(l=>Number(l.lap)>0&&Number(l.lapTime)>0&&!pitLaps.has(Number(l.lap))).map(l=>({...l,seconds:Number(l.lapTime)/1000})).sort((a,b)=>a.lap-b.lap);
 const med=analyzerDebriefMedian(raw.map(l=>l.seconds));
 return raw.filter(l=>!Number.isFinite(med)||l.seconds<=med+5);
}
function analyzerDebriefRelays(laps,pits){
 const pitLaps=(pits||[]).map(p=>Number(p.lap)).filter(Number.isFinite).sort((a,b)=>a-b),boundaries=[0,...pitLaps,Infinity],relays=[];
 for(let i=0;i<boundaries.length-1;i++){
  const segment=laps.filter(l=>l.lap>boundaries[i]&&l.lap<boundaries[i+1]);
  if(!segment.length)continue;
  let values=segment.slice();
  if(values.length>1)values=values.slice(1); // tour de sortie non représentatif
  const insufficient=values.length<2;
  const sec=values.map(l=>l.seconds).filter(Number.isFinite);
  relays.push({index:i+1,from:segment[0].lap,to:segment[segment.length-1].lap,laps:values.length,best:sec.length?Math.min(...sec):NaN,average:insufficient?NaN:analyzerDebriefAverage(sec),median:insufficient?NaN:analyzerDebriefMedian(sec),std:insufficient?NaN:analyzerDebriefStd(sec),insufficient});
 }
 return relays;
}
function analyzerDebriefPilotByRelay(driver,pits){
 const map=new Map();
 const chronological=(pits||[]).slice().sort((a,b)=>Number(a.stop)-Number(b.stop));
 chronological.forEach((pit,index)=>{const name=String(pit?.driverName||'').trim();if(name)map.set(index+1,name)});
 const rowId=Number(driver?.apex_row)||0,cache=analyzerApexPilotTotalsCache.get(rowId),current=(cache?.pilots||[]).find(p=>p.current&&p.name);
 if(current)map.set(chronological.length+1,current.name);
 if(!map.size){const history=analyzerTeamHistory(driver),relays=[...(history?.relays||[])];if(history?.currentRelay)relays.push({...history.currentRelay,status:'active'});relays.forEach(r=>{const name=String(r?.pilot||'').trim();if(name)map.set(Number(r.index),name)})}
 return map;
}
function analyzerDebriefOfficialPilotTotals(driver,pits){
 const rowId=Number(driver?.apex_row)||0,cache=analyzerApexPilotTotalsCache.get(rowId);
 if(cache?.pilots?.length)return cache.pilots.filter(p=>p.name&&Number(p.totalMs)>0).map(p=>({name:p.name,totalMs:Number(p.totalMs),current:Boolean(p.current)})).sort((a,b)=>b.totalMs-a.totalMs||a.name.localeCompare(b.name));
 const byId=new Map();(pits||[]).forEach(p=>{const id=Number(p.driverId)||0,name=String(p.driverName||'').trim(),totalMs=Number(p.driverTotalTimeMs)||0;if(!id||!name||!totalMs)return;const prev=byId.get(id);if(!prev||totalMs>prev.totalMs)byId.set(id,{name,totalMs,current:false})});return [...byId.values()].sort((a,b)=>b.totalMs-a.totalMs||a.name.localeCompare(b.name));
}
async function analyzerDebriefLoadTeam(driver,sessionId=''){
 const rowId=Number(driver?.apex_row)||0;if(!rowId)throw new Error(`Identifiant STATS indisponible pour ${driver?.driver||'une équipe'}`);
 const [laps,pits]=await Promise.all([fetchAllApexTeamLaps(rowId,sessionId,null),fetchAllApexTeamPits(rowId,sessionId,null).catch(()=>[])]);
 const clean=analyzerDebriefCleanLaps(laps,pits),seconds=clean.map(l=>l.seconds),pitDurations=(pits||[]).map(p=>Math.max(0,(p.pitOutMs||0)-(p.pitInMs||0))/1000).filter(v=>v>0);
 const pilotByRelay=analyzerDebriefPilotByRelay(driver,pits),relays=analyzerDebriefRelays(clean,pits).map(r=>({...r,pilot:pilotByRelay.get(Number(r.index))||''})),pilotTotals=analyzerDebriefOfficialPilotTotals(driver,pits);
 return {driver,name:driver.driver||`Équipe ${rowId}`,position:Number(driver.pos)||999,laps,pits,clean,relays,pilotTotals,best:seconds.length?Math.min(...seconds):NaN,average:analyzerDebriefAverage(seconds),median:analyzerDebriefMedian(seconds),std:analyzerDebriefStd(seconds),pitAverage:analyzerDebriefAverage(pitDurations),pitStd:analyzerDebriefStd(pitDurations),pitCount:pits.length};
}
function analyzerDebriefFmtSeconds(value){return Number.isFinite(value)?formatApexMilliseconds(value*1000):'—'}
function analyzerDebriefFmtPit(value){return Number.isFinite(value)?formatApexPitDuration(value*1000):'—'}
function analyzerDebriefOrdinal(rank,total){return rank?`${rank}${rank===1?'er':'e'} / ${total}`:'—'}
function analyzerDebriefRelayPosition(rank,total){return rank&&total?`P${rank}/${total}`:'—'}
function analyzerDebriefRelayComparison(relay,team,all){
 const entries=(all||[]).map(candidate=>{
  const values=(candidate.clean||[]).filter(l=>Number(l.lap)>=relay.from&&Number(l.lap)<=relay.to).map(l=>l.seconds).filter(Number.isFinite);
  if(values.length<2)return null;
  const best=Math.min(...values),average=analyzerDebriefAverage(values);
  return {candidate,laps:values.length,best,average,constance:average-best};
 }).filter(Boolean).sort((a,b)=>a.average-b.average);
 const current=entries.find(entry=>entry.candidate===team)||entries.find(entry=>normalizeApexTeamName(entry.candidate?.name)===normalizeApexTeamName(team?.name));
 return {rank:current?entries.indexOf(current)+1:0,total:entries.length,constance:current?current.constance:(Number.isFinite(relay.average)&&Number.isFinite(relay.best)?relay.average-relay.best:NaN)};
}
function analyzerDebriefConstanceClass(value){if(!Number.isFinite(value))return '';if(value<=.25)return 'debrief-positive';if(value<=.45)return 'debrief-constance-good';if(value<=.70)return 'debrief-warning';return 'debrief-negative'}
function analyzerDebriefFmtConstance(value){return Number.isFinite(value)?`+${value.toFixed(3)} s`:'—'}
function analyzerDebriefRegularityLabel(value){return Number.isFinite(value)?`${value.toFixed(3)} s`:'—'}
function analyzerDebriefVerdictText(team,all){
 const paceRank=analyzerDebriefRank(all,'average',team.average),consistencyRank=analyzerDebriefRank(all,'std',team.std),pitRank=analyzerDebriefRank(all,'pitAverage',team.pitAverage),n=all.length;
 const strengths=[],work=[];
 if(paceRank&&paceRank<=Math.max(3,Math.ceil(n*.25)))strengths.push(`un rythme moyen situé dans le premier quart du plateau (${analyzerDebriefOrdinal(paceRank,n)})`);else work.push(`le rythme moyen, classé ${analyzerDebriefOrdinal(paceRank,n)}`);
 if(consistencyRank&&consistencyRank<=Math.max(3,Math.ceil(n*.25)))strengths.push(`une excellente régularité (${analyzerDebriefOrdinal(consistencyRank,n)})`);else work.push(`la régularité des tours (${analyzerDebriefOrdinal(consistencyRank,n)})`);
 if(team.pitCount&&pitRank&&pitRank<=Math.max(3,Math.ceil(n*.25)))strengths.push(`des arrêts compétitifs (${analyzerDebriefOrdinal(pitRank,n)})`);else if(team.pitCount)work.push(`le temps moyen aux stands (${analyzerDebriefOrdinal(pitRank,n)})`);
 return `${team.name} présente ${strengths.length?strengths.join(' et '):'une performance équilibrée'}. ${work.length?`Le principal levier de progression concerne ${work.join(' puis ')}.`:'Aucun point faible majeur ne ressort des données disponibles.'}`;
}
function analyzerDebriefVerdict(team,all){return analyzerEscape(analyzerDebriefVerdictText(team,all))}
function analyzerDebriefSetProgress(done,total){
 const percent=total?Math.max(0,Math.min(100,Math.round(done/total*100))):0;
 const fill=document.getElementById('analyzerDebriefProgressFill'),label=document.getElementById('analyzerDebriefProgressPercent'),status=document.getElementById('analyzerDebriefStatus');
 if(status){status.classList.remove('ready','error');status.style.display='flex'}
 if(fill)fill.style.width=`${percent}%`;
 if(label)label.textContent=`${percent} %`;
}
function analyzerDebriefIsIntermediate(){
 const liveMs=typeof liveRemainingMilliseconds==='function'?liveRemainingMilliseconds():null;
 if(Number.isFinite(liveMs))return liveMs>0;
 const raw=String(state?.time_remaining??'').trim();
 const parsed=typeof analyzerParseDuration==='function'?analyzerParseDuration(raw):NaN;
 if(Number.isFinite(parsed))return parsed>0;
 return true;
}
function renderAnalyzerDebrief(team,all,context={}){
 const host=document.getElementById('analyzerDebriefContent'),status=document.getElementById('analyzerDebriefStatus'),pdfButton=document.getElementById('analyzerDebriefPdfButton');if(!host)return;
 const n=all.length,paceRank=analyzerDebriefRank(all,'average',team.average),bestRank=analyzerDebriefRank(all,'best',team.best),consistencyRank=analyzerDebriefRank(all,'std',team.std),pitRank=analyzerDebriefRank(all,'pitAverage',team.pitAverage);
 const ranking=all.slice().sort((a,b)=>(a.average||999)-(b.average||999));
 analyzerDebriefReport={team,all,ranking,generatedAt:new Date(),isIntermediate:context.historical?false:analyzerDebriefIsIntermediate(),historical:Boolean(context.historical),sessionId:String(context.sessionId||''),sessionName:String(context.sessionName||''),circuit:analyzerWeatherData?.circuit_name||analyzerWeatherData?.location?.name||analyzerSessionCircuitName()||''};
 if(status){status.classList.add('ready');status.style.display='none'}
 if(pdfButton)pdfButton.disabled=false;
 host.innerHTML=`
  <section class="debrief-hero">
   <div class="debrief-card debrief-team"><span>${analyzerDebriefReport.historical?'Équipe analysée':'Équipe suivie'}</span><strong>${analyzerEscape(team.name)}</strong><small class="debrief-pill">${analyzerDebriefReport.historical?'Débrief session historique':`Débrief ${analyzerDebriefReport.isIntermediate?'intermédiaire':'final'}`}</small>${analyzerDebriefReport.sessionName?`<small class="debrief-track">Session : ${analyzerEscape(analyzerDebriefReport.sessionName)}</small>`:''}${analyzerDebriefReport.circuit?`<small class="debrief-track">Piste : ${analyzerEscape(analyzerDebriefReport.circuit)}</small>`:''}</div>
   <div class="debrief-card"><span>Rythme moyen</span><strong>${analyzerDebriefFmtSeconds(team.average)}</strong></div>
   <div class="debrief-card"><span>Meilleur tour</span><strong>${analyzerDebriefFmtSeconds(team.best)}</strong></div>
   <div class="debrief-card"><span>Régularité</span><strong>${analyzerDebriefRegularityLabel(team.std)}</strong></div>
   <div class="debrief-card"><span>Arrêts</span><strong>${team.pitCount}</strong></div>
  </section>
  <section class="debrief-section"><h3>POSITIONNEMENT FACE AU PLATEAU</h3><div class="debrief-grid">
   <div class="debrief-metric"><span>Vitesse pure</span><b>${analyzerDebriefOrdinal(bestRank,n)}</b></div>
   <div class="debrief-metric"><span>Rythme moyen</span><b>${analyzerDebriefOrdinal(paceRank,n)}</b></div>
   <div class="debrief-metric"><span>Régularité</span><b>${analyzerDebriefOrdinal(consistencyRank,n)}</b></div>
   <div class="debrief-metric"><span>Temps moyen stands</span><b>${team.pitCount?analyzerDebriefOrdinal(pitRank,n):'—'}</b></div>
  </div></section>
  <section class="debrief-section"><h3>ANALYSE DES RELAIS TERMINÉS / EN COURS</h3><div class="debrief-table-wrap"><table class="debrief-table"><thead><tr><th>RELAIS</th><th>PILOTE</th><th>TOURS</th><th>POS. RELAIS</th><th>FENÊTRE</th><th>MEILLEUR</th><th>MOYENNE</th><th>CONSTANCE</th></tr></thead><tbody>${team.relays.map(r=>{const comparison=r.insufficient?{rank:0,total:0,constance:NaN}:analyzerDebriefRelayComparison(r,team,all);return `<tr><td>R${r.index}</td><td>${r.pilot?analyzerEscape(r.pilot):'—'}</td><td>${r.laps}</td><td>${r.insufficient?'<span class="debrief-insufficient">ÉCHANTILLON INSUFFISANT</span>':`<strong class="debrief-relay-position">${analyzerDebriefRelayPosition(comparison.rank,comparison.total)}</strong>`}</td><td>${r.from} → ${r.to}</td><td>${analyzerDebriefFmtSeconds(r.best)}</td><td>${analyzerDebriefFmtSeconds(r.average)}</td><td class="${analyzerDebriefConstanceClass(comparison.constance)}" title="Écart entre la moyenne et le meilleur tour du relais">${analyzerDebriefFmtConstance(comparison.constance)}</td></tr>`}).join('')||'<tr><td colspan="8">Aucun relais détecté pour le moment.</td></tr>'}</tbody></table></div><p class="debrief-table-note"><strong>POS. RELAIS</strong> classe le rythme moyen de l’équipe face aux équipes disposant d’au moins deux tours exploitables sur la même fenêtre de course. Les relais trop courts restent affichés avec la mention <strong>Échantillon insuffisant</strong>, sans classement. <strong>Constance</strong> correspond à l’écart entre la moyenne et le meilleur tour : plus l’écart est faible, plus le relais est régulier.</p></section>
  <section class="debrief-section"><h3>TEMPS DE ROULAGE TOTAL</h3><div class="debrief-grid debrief-pilot-totals">${(team.pilotTotals||[]).length?(team.pilotTotals||[]).map(p=>`<div class="debrief-metric debrief-pilot-total"><span>${analyzerEscape(p.name)}</span><b>${analyzerEscape(analyzerPilotHoursLabel(Number(p.totalMs)/1000))}</b></div>`).join(''):'<div class="analyzer-empty">Temps pilotes Apex indisponibles pour le moment.</div>'}</div><p class="debrief-table-note">Temps cumulés officiels transmis par Apex via <strong>driver_total_time</strong>. Velocity ne recalcule pas ces totaux.</p></section>
  <section class="debrief-section"><h3>ARRÊTS AUX STANDS</h3><div class="debrief-grid"><div class="debrief-metric"><span>Nombre</span><b>${team.pitCount}</b></div><div class="debrief-metric"><span>Temps moyen</span><b>${analyzerDebriefFmtPit(team.pitAverage)}</b></div><div class="debrief-metric"><span>Dispersion</span><b>${Number.isFinite(team.pitStd)?team.pitStd.toFixed(3)+' s':'—'}</b></div><div class="debrief-metric"><span>Rang plateau</span><b>${team.pitCount?analyzerDebriefOrdinal(pitRank,n):'—'}</b></div></div></section>
  <section class="debrief-section"><h3>CLASSEMENT DU RYTHME MOYEN</h3><div class="debrief-table-wrap"><table class="debrief-table"><thead><tr><th>RANG</th><th>ÉQUIPE</th><th>MOYENNE</th><th>MEILLEUR</th><th>RÉGULARITÉ</th><th>PITS</th><th>MOY. PIT</th></tr></thead><tbody>${ranking.map((x,i)=>`<tr class="${x===team?'debrief-followed-row':''}"><td>${i+1}</td><td>${analyzerEscape(x.name)}</td><td>${analyzerDebriefFmtSeconds(x.average)}</td><td>${analyzerDebriefFmtSeconds(x.best)}</td><td>${analyzerDebriefRegularityLabel(x.std)}</td><td>${x.pitCount}</td><td>${analyzerDebriefFmtPit(x.pitAverage)}</td></tr>`).join('')}</tbody></table></div></section>
  <section class="debrief-section"><h3>CONCLUSION</h3><div class="debrief-verdict">${analyzerDebriefVerdict(team,all)}</div></section>`;
}
async function openAnalyzerHistoricalDebrief(){
 if(analyzerDebriefBusy)return;
 const sessionId=String(apexHistorySelectedSession||'');
 if(!sessionId){window.alert('Sélectionnez d’abord une ancienne session Apex.');return}
 if(!apexHistoricalTeams.length)await loadApexHistoricalTeams(sessionId);
 const selected=apexHistoricalTeams.find(team=>Number(team.rowId)===Number(apexHistorySelectedRowId));
 if(!selected){window.alert('Sélectionnez une équipe de la session avant de générer le débrief.');return}
 const modal=document.getElementById('analyzerDebriefModal'),status=document.getElementById('analyzerDebriefStatus'),host=document.getElementById('analyzerDebriefContent'),pdfButton=document.getElementById('analyzerDebriefPdfButton'),historyButton=document.getElementById('apexHistoryDebriefButton');
 if(!modal)return;modal.classList.add('show');document.body.classList.add('analyzer-debrief-open');if(host)host.innerHTML='';if(pdfButton)pdfButton.disabled=true;analyzerDebriefReport=null;analyzerDebriefSetProgress(0,1);
 analyzerDebriefBusy=true;if(historyButton)historyButton.disabled=true;
 try{
  const drivers=apexHistoricalTeams.map((team,index)=>({apex_row:Number(team.rowId),driver:team.name||`Équipe ${team.rowId}`,pos:index+1,apex:team.kart||''})).filter(driver=>driver.apex_row>0);
  const results=[];
  for(let i=0;i<drivers.length;i++){
   try{results.push(await analyzerDebriefLoadTeam(drivers[i],sessionId))}catch(error){console.warn('[Débrief historique]',drivers[i]?.driver,error)}
   analyzerDebriefSetProgress(i+1,drivers.length);
  }
  const team=results.find(x=>Number(x.driver?.apex_row)===Number(selected.rowId))||results.find(x=>normalizeApexTeamName(x.name)===normalizeApexTeamName(selected.name));
  if(!team)throw new Error('Impossible de charger les données de l’équipe sélectionnée dans cette session.');
  const sessionName=apexPreviousSessions.find(s=>String(s.id)===sessionId)?.name||`Session ${sessionId}`;
  await new Promise(resolve=>setTimeout(resolve,180));
  renderAnalyzerDebrief(team,results.filter(x=>Number.isFinite(x.average)),{historical:true,sessionId,sessionName});
 }catch(error){if(status){status.textContent=`Débrief historique indisponible : ${error.message}`;status.classList.add('error');status.style.display='block'}}finally{analyzerDebriefBusy=false;updateApexHistoricalDebriefButton()}
}
async function openAnalyzerDebrief(){
 if(analyzerDebriefBusy)return;
 const modal=document.getElementById('analyzerDebriefModal'),status=document.getElementById('analyzerDebriefStatus'),host=document.getElementById('analyzerDebriefContent'),button=document.getElementById('analyzerDebriefButton'),pdfButton=document.getElementById('analyzerDebriefPdfButton');
 if(!modal){console.error('[Debrief] Fenêtre introuvable');return;}modal.classList.add('show');document.body.classList.add('analyzer-debrief-open');if(host)host.innerHTML='';if(pdfButton)pdfButton.disabled=true;analyzerDebriefReport=null;analyzerDebriefSetProgress(0,1);
 const drivers=(state?.drivers||[]).filter(d=>Number(d.apex_row)>0),followed=drivers.find(d=>d.driver===state?.followed_driver)||drivers[0];
 if(!followed){if(status){status.textContent='Aucune équipe disponible dans le classement.';status.classList.add('error');status.style.display='block'}return}
 analyzerDebriefBusy=true;if(button)button.disabled=true;
 try{
  const results=[];
  for(let i=0;i<drivers.length;i++){
   try{results.push(await analyzerDebriefLoadTeam(drivers[i]))}catch(error){console.warn('[Debrief]',drivers[i]?.driver,error)}
   analyzerDebriefSetProgress(i+1,drivers.length);
  }
  const team=results.find(x=>x.driver===followed)||results.find(x=>normalizeApexTeamName(x.name)===normalizeApexTeamName(followed.driver));
  if(!team)throw new Error('Impossible de charger les données STATS de l’équipe suivie.');
  await new Promise(resolve=>setTimeout(resolve,220));
  renderAnalyzerDebrief(team,results.filter(x=>Number.isFinite(x.average)));
 }catch(error){if(status){status.textContent=`Débrief indisponible : ${error.message}`;status.classList.add('error');status.style.display='block'}}finally{analyzerDebriefBusy=false;if(button)button.disabled=false}
}
function closeAnalyzerDebrief(){document.getElementById('analyzerDebriefModal')?.classList.remove('show');document.body.classList.remove('analyzer-debrief-open')}
function analyzerDebriefPdfSafeName(value){return String(value||'Equipe').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9_-]+/g,'_').replace(/^_+|_+$/g,'').slice(0,60)||'Equipe'}
function analyzerDebriefPdfWrap(ctx,text,maxWidth){const words=String(text||'').split(/\s+/),lines=[];let line='';for(const word of words){const test=line?`${line} ${word}`:word;if(ctx.measureText(test).width>maxWidth&&line){lines.push(line);line=word}else line=test}if(line)lines.push(line);return lines}
function analyzerDebriefPdfBuild(jpegs){
 const enc=new TextEncoder(),chunks=[],offsets=[0],pushText=text=>chunks.push(enc.encode(text)),pushBytes=bytes=>chunks.push(bytes),length=()=>chunks.reduce((sum,c)=>sum+c.length,0);
 pushText('%PDF-1.4\n%âãÏÓ\n');
 const objectCount=2+jpegs.length*3;
 const addObject=(id,body,bytes)=>{offsets[id]=length();pushText(`${id} 0 obj\n${body}`);if(bytes){pushText(`\nstream\n`);pushBytes(bytes);pushText('\nendstream')}pushText('\nendobj\n')};
 addObject(1,'<< /Type /Catalog /Pages 2 0 R >>');
 const kids=[];for(let i=0;i<jpegs.length;i++)kids.push(`${3+i*3} 0 R`);
 addObject(2,`<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${jpegs.length} >>`);
 jpegs.forEach((jpeg,i)=>{const pageId=3+i*3,imageId=pageId+1,contentId=pageId+2,content=enc.encode('q\n595.28 0 0 841.89 0 0 cm\n/Im0 Do\nQ\n');addObject(pageId,`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`);addObject(imageId,`<< /Type /XObject /Subtype /Image /Width ${jpeg.width} /Height ${jpeg.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.bytes.length} >>`,jpeg.bytes);addObject(contentId,`<< /Length ${content.length} >>`,content)});
 const xref=length();pushText(`xref\n0 ${objectCount+1}\n0000000000 65535 f \n`);for(let i=1;i<=objectCount;i++)pushText(`${String(offsets[i]||0).padStart(10,'0')} 00000 n \n`);pushText(`trailer\n<< /Size ${objectCount+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
 const out=new Uint8Array(length());let cursor=0;for(const chunk of chunks){out.set(chunk,cursor);cursor+=chunk.length}return out;
}
function analyzerDebriefPdfDataUrlBytes(dataUrl){const binary=atob(dataUrl.split(',')[1]),bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);return bytes}
function analyzerDebriefPdfCreatePage(){const canvas=document.createElement('canvas');canvas.width=1240;canvas.height=1754;const ctx=canvas.getContext('2d');ctx.fillStyle='#f5f5f3';ctx.fillRect(0,0,canvas.width,canvas.height);return {canvas,ctx,y:92}}
function analyzerDebriefPdfHeader(page,report,title,subtitle){const {ctx,canvas}=page;ctx.fillStyle='#111';ctx.fillRect(0,0,canvas.width,26);ctx.fillStyle='#bb1018';ctx.fillRect(0,26,canvas.width,12);ctx.fillStyle='#111';ctx.font='700 42px Arial';ctx.fillText(title,80,104);ctx.font='700 25px Arial';ctx.fillStyle='#bb1018';ctx.fillText(report.team.name,80,145);ctx.font='20px Arial';ctx.fillStyle='#555';ctx.fillText(subtitle,80,178);if(report.circuit)ctx.fillText(`Piste : ${report.circuit}`,80,207);page.y=250}
function analyzerDebriefPdfFooter(page,index,total){const {ctx,canvas}=page;ctx.strokeStyle='#c9c9c5';ctx.beginPath();ctx.moveTo(80,1668);ctx.lineTo(canvas.width-80,1668);ctx.stroke();ctx.font='16px Arial';ctx.fillStyle='#666';ctx.fillText(`Page ${index} / ${total}`,canvas.width-165,1702)}
function analyzerDebriefPdfSection(page,title){const {ctx}=page;page.y+=18;ctx.fillStyle='#111';ctx.font='700 25px Arial';ctx.fillText(title,80,page.y);ctx.fillStyle='#bb1018';ctx.fillRect(80,page.y+12,1080,4);page.y+=48}
function analyzerDebriefPdfParagraph(page,text){const {ctx}=page;ctx.fillStyle='#222';ctx.font='19px Arial';const lines=analyzerDebriefPdfWrap(ctx,text,1080);for(const line of lines){ctx.fillText(line,80,page.y);page.y+=29}page.y+=10}
function analyzerDebriefPdfMetricGrid(page,items){const {ctx}=page,w=255,h=110,gap=20;items.forEach((item,i)=>{const x=80+(i%4)*(w+gap),y=page.y+Math.floor(i/4)*(h+gap);ctx.fillStyle='#fff';ctx.fillRect(x,y,w,h);ctx.strokeStyle='#d7d7d2';ctx.strokeRect(x,y,w,h);ctx.font='700 15px Arial';ctx.fillStyle='#777';ctx.fillText(item.label.toUpperCase(),x+18,y+31);ctx.font='700 27px Arial';ctx.fillStyle='#111';ctx.fillText(String(item.value),x+18,y+76)});page.y+=Math.ceil(items.length/4)*(h+gap)+8}
function analyzerDebriefPdfTable(page,headers,rows,widths,rowHeight=48){const {ctx}=page,x=80;ctx.font='700 14px Arial';ctx.fillStyle='#171717';ctx.fillRect(x,page.y,widths.reduce((a,b)=>a+b,0),42);ctx.fillStyle='#fff';let cx=x;headers.forEach((h,i)=>{ctx.fillText(h,cx+8,page.y+27);cx+=widths[i]});page.y+=42;ctx.font='16px Arial';rows.forEach((row,ri)=>{ctx.fillStyle=ri%2?'#f0f0ed':'#fff';ctx.fillRect(x,page.y,widths.reduce((a,b)=>a+b,0),rowHeight);ctx.strokeStyle='#d8d8d3';ctx.beginPath();ctx.moveTo(x,page.y+rowHeight);ctx.lineTo(x+widths.reduce((a,b)=>a+b,0),page.y+rowHeight);ctx.stroke();ctx.fillStyle='#222';cx=x;row.forEach((cell,i)=>{ctx.save();ctx.beginPath();ctx.rect(cx+4,page.y+2,widths[i]-8,rowHeight-4);ctx.clip();ctx.fillText(String(cell),cx+8,page.y+30);ctx.restore();cx+=widths[i]});page.y+=rowHeight})}
async function exportAnalyzerDebriefPdf(){
 const report=analyzerDebriefReport,button=document.getElementById('analyzerDebriefPdfButton');if(!report||!report.team||!report.all?.length)return;
 if(button){button.disabled=true;button.textContent='GÉNÉRATION…'}
 try{
  const pages=[],team=report.team,all=report.all,n=all.length,paceRank=analyzerDebriefRank(all,'average',team.average),bestRank=analyzerDebriefRank(all,'best',team.best),consistencyRank=analyzerDebriefRank(all,'std',team.std),pitRank=analyzerDebriefRank(all,'pitAverage',team.pitAverage);
  let page=analyzerDebriefPdfCreatePage();analyzerDebriefPdfHeader(page,report,report.historical?'DÉBRIEF SESSION':(report.isIntermediate?'DÉBRIEF INTERMÉDIAIRE':'DÉBRIEF FINAL'),`${report.sessionName?report.sessionName+' — ':''}Rapport généré par votre Master Chef 🧑🏾‍🍳 le ${report.generatedAt.toLocaleString('fr-FR')}`);analyzerDebriefPdfMetricGrid(page,[{label:'Rythme moyen',value:analyzerDebriefFmtSeconds(team.average)},{label:'Meilleur tour',value:analyzerDebriefFmtSeconds(team.best)},{label:'Régularité',value:analyzerDebriefRegularityLabel(team.std)},{label:'Arrêts',value:team.pitCount},{label:'Vitesse pure',value:analyzerDebriefOrdinal(bestRank,n)},{label:'Rythme moyen',value:analyzerDebriefOrdinal(paceRank,n)},{label:'Régularité',value:analyzerDebriefOrdinal(consistencyRank,n)},{label:'Stands',value:team.pitCount?analyzerDebriefOrdinal(pitRank,n):'—'}]);analyzerDebriefPdfSection(page,'SYNTHÈSE');analyzerDebriefPdfParagraph(page,analyzerDebriefVerdictText(team,all));pages.push(page);
  const relayRows=team.relays.map(r=>{const c=analyzerDebriefRelayComparison(r,team,all);return [`R${r.index}`,r.laps,analyzerDebriefRelayPosition(c.rank,c.total),`${r.from}-${r.to}`,analyzerDebriefFmtSeconds(r.best),analyzerDebriefFmtSeconds(r.average),analyzerDebriefFmtConstance(c.constance)]});
  for(let i=0;i<Math.max(1,Math.ceil(relayRows.length/18));i++){page=analyzerDebriefPdfCreatePage();analyzerDebriefPdfHeader(page,report,'ANALYSE DES RELAIS',relayRows.length?`Relais ${i*18+1} à ${Math.min(relayRows.length,(i+1)*18)}`:'Aucun relais exploitable');analyzerDebriefPdfTable(page,['RELAIS','TOURS','POS.','FENÊTRE','MEILLEUR','MOYENNE','CONSTANCE'],relayRows.slice(i*18,(i+1)*18),[105,100,120,140,180,180,190]);pages.push(page)}
  const rankRows=report.ranking.map((x,i)=>[i+1,x.name,analyzerDebriefFmtSeconds(x.average),analyzerDebriefFmtSeconds(x.best),analyzerDebriefRegularityLabel(x.std),x.pitCount,analyzerDebriefFmtPit(x.pitAverage)]);
  for(let i=0;i<Math.max(1,Math.ceil(rankRows.length/20));i++){page=analyzerDebriefPdfCreatePage();analyzerDebriefPdfHeader(page,report,'COMPARAISON DU PLATEAU',`Classement du rythme moyen — ${n} équipes analysées`);if(i===0){analyzerDebriefPdfSection(page,'ARRÊTS AUX STANDS');analyzerDebriefPdfMetricGrid(page,[{label:'Nombre',value:team.pitCount},{label:'Temps moyen',value:analyzerDebriefFmtPit(team.pitAverage)},{label:'Dispersion',value:Number.isFinite(team.pitStd)?team.pitStd.toFixed(3)+' s':'—'},{label:'Rang plateau',value:team.pitCount?analyzerDebriefOrdinal(pitRank,n):'—'}]);analyzerDebriefPdfSection(page,'RYTHME MOYEN')}analyzerDebriefPdfTable(page,['RANG','ÉQUIPE','MOYENNE','MEILLEUR','RÉGULARITÉ','PITS','MOY. PIT'],rankRows.slice(i*20,(i+1)*20),[80,310,150,150,190,80,140],44);pages.push(page)}
  pages.forEach((p,i)=>analyzerDebriefPdfFooter(p,i+1,pages.length));
  const jpegs=pages.map(({canvas})=>{const url=canvas.toDataURL('image/jpeg',.92);return {width:canvas.width,height:canvas.height,bytes:analyzerDebriefPdfDataUrlBytes(url)}}),pdf=analyzerDebriefPdfBuild(jpegs),blob=new Blob([pdf],{type:'application/pdf'}),url=URL.createObjectURL(blob),anchor=document.createElement('a');anchor.href=url;anchor.download=`Debrief_${report.historical?'Session_'+analyzerDebriefPdfSafeName(report.sessionName)+'_':''}${analyzerDebriefPdfSafeName(team.name)}_${new Date().toISOString().slice(0,10)}.pdf`;document.body.appendChild(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
 }catch(error){console.error('[PDF Debrief]',error);window.alert(`Impossible de générer le PDF : ${error.message}`)}finally{if(button){button.disabled=false;button.textContent='EXPORTER EN PDF'}}
}
document.addEventListener('DOMContentLoaded',()=>document.getElementById('analyzerDebriefModal')?.addEventListener('click',event=>{if(event.target.id==='analyzerDebriefModal')closeAnalyzerDebrief()}));

// V6.14.0 — Messagerie Team Manager vers le pilote en Focus Endurance.
function updateAnalyzerDriverMessageCounter(){
 const input=document.getElementById('analyzerDriverMessageInput');
 const counter=document.getElementById('analyzerDriverMessageCounter');
 const button=document.getElementById('analyzerDriverMessageSend');
 const length=String(input?.value||'').length;
 if(counter)counter.textContent=`${length}/25`;
 if(button)button.disabled=!String(input?.value||'').trim();
}
async function sendAnalyzerDriverMessage(){
 const input=document.getElementById('analyzerDriverMessageInput');
 const urgent=document.getElementById('analyzerDriverMessageUrgent');
 const button=document.getElementById('analyzerDriverMessageSend');
 const status=document.getElementById('analyzerDriverMessageStatus');
 const message=String(input?.value||'').trim();
 if(!message)return;
 if(button)button.disabled=true;
 if(status){status.textContent='ENVOI…';status.className='analyzer-driver-message-status sending'}
 try{
  const response=await fetch('/api/driver-message',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message,urgent:Boolean(urgent?.checked)})});
  const payload=await response.json().catch(()=>({}));
  if(!response.ok||!payload.ok)throw new Error(payload.error||'Envoi impossible');
  if(input)input.value='';if(urgent)urgent.checked=false;updateAnalyzerDriverMessageCounter();
  if(status){status.textContent=payload.message?.urgent?'MESSAGE AFFICHÉ IMMÉDIATEMENT':'MESSAGE EN ATTENTE DU PROCHAIN PASSAGE';status.className='analyzer-driver-message-status success'}
 }catch(error){
  if(status){status.textContent=error.message||'ENVOI IMPOSSIBLE';status.className='analyzer-driver-message-status error'}
 }finally{if(button)button.disabled=!String(input?.value||'').trim();setTimeout(()=>{if(status)status.textContent=''},5000)}
}
document.addEventListener('DOMContentLoaded',updateAnalyzerDriverMessageCounter);



/* Velocity V7.2.57 — Mode Test Endurance longue durée + validation réseau */
window.velocityEnduranceTest={active:false,timer:null,backup:null,learningBackup:null,startedAt:0,simulatedMs:0,durationMs:0,speed:60,teams:40,laps:0,updates:0,stops:0,reconnectAttempts:0,reconnectSuccess:0,reconnectFailures:0,networkCuts:0,networkConnected:true,networkCutStartedAt:0,networkRestoreTimer:null,nextCutAtMs:Infinity,incidentFrequency:'30',incidentDurationSec:15,totalDowntimeMs:0,maxDowntimeMs:0,lastDowntimeMs:0,errors:[],log:[],drivers:[]};
function analyzerTestFormatDuration(ms){const total=Math.max(0,Math.floor(ms/1000)),h=Math.floor(total/3600),m=Math.floor(total%3600/60),s=total%60;return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`}
function analyzerTestLog(message,type='info'){const t=window.velocityEnduranceTest,entry={at:new Date().toISOString(),simulatedMs:t.simulatedMs,message:String(message),type};t.log.unshift(entry);if(t.log.length>500)t.log.length=500;const host=document.getElementById('analyzerTestLog');if(host)host.innerHTML=t.log.slice(0,120).map(x=>`<div class="${x.type}"><time>${new Date(x.at).toLocaleTimeString('fr-FR')}</time>${analyzerEscape(x.message)}</div>`).join('')}
function openAnalyzerEnduranceTest(){document.getElementById('analyzerEnduranceTestModal')?.classList.add('show');analyzerTestRefreshDashboard()}
function closeAnalyzerEnduranceTest(){document.getElementById('analyzerEnduranceTestModal')?.classList.remove('show')}
function analyzerTestDriver(index){
 const lap=54+(index%11)*.17;
 const teamNo=String(index+1).padStart(2,'0');
 const pilotRoster=Array.from({length:4},(_,j)=>`PILOTE ${teamNo}-${String.fromCharCode(65+j)}`);
 const pilotOffsets=[-.18,.04,.21,-.07].map((v,j)=>v+(((index+j)%5)-2)*.012);
 return {testIndex:index,pos:index+1,apex:index+1,apex_row:index+1,kart:String(10+index),driver:`ÉQUIPE TEST ${teamNo}`,pilot:pilotRoster[0],pilotRoster,pilotOffsets,pilotIndex:0,laps:0,last:formatApexMilliseconds(lap*1000),best:formatApexMilliseconds((lap-.25)*1000),gap:index?`+${(index*.42).toFixed(3)}`:'—',interval:index?`+${(.25+(index%5)*.08).toFixed(3)}`:'—',pit_stops:0,status:'track',penalty:'—',track_time:'00:00',on_track:'00:00',average_lap:lap,lap_times:[],current_stint_laps:[],stints:[],pit_history:[]}
}
function analyzerTestBuildState(){const t=window.velocityEnduranceTest;const currentFollowed=String(state?.followed_driver||'');const followed=t.drivers.some(d=>d.driver===currentFollowed)?currentFollowed:(t.drivers[0]?.driver||'');return {...(t.backup||{}),version:'7.2.106 TEST',connection:t.networkConnected?'TEST CONNECTÉ':'TEST COUPÉ',connected:t.networkConnected,circuit_id:'velocity-test-endurance',followed_driver:followed,followed:t.drivers.find(d=>d.driver===followed)||null,drivers:t.drivers,time_remaining:analyzerTestFormatDuration(Math.max(0,t.durationMs-t.simulatedMs)),time_remaining_ms:Math.max(0,t.durationMs-t.simulatedMs),live:{status:t.networkConnected?'test':'reconnecting',messages:t.updates,parsed_updates:t.updates,last_message_at:new Date().toISOString()},spotter:{configured:false,queue:[],maintenance:[],incoming:[]}}}
function analyzerTestNextCutDelayMs(){const t=window.velocityEnduranceTest;if(t.incidentFrequency==='random')return (20+Math.random()*70)*60000;return Math.max(1,Number(t.incidentFrequency)||30)*60000}
function analyzerTestScheduleNextCut(){const t=window.velocityEnduranceTest;t.nextCutAtMs=t.simulatedMs+analyzerTestNextCutDelayMs();analyzerTestLog(`Prochaine coupure prévue vers ${analyzerTestFormatDuration(t.nextCutAtMs)} simulées.`)}
function analyzerTestStartNetworkCut(source='automatique'){const t=window.velocityEnduranceTest;if(!t.active||!t.networkConnected)return false;t.networkConnected=false;t.networkCuts++;t.reconnectAttempts++;t.networkCutStartedAt=Date.now();analyzerTestLog(`Coupure réseau ${source} déclenchée (${t.incidentDurationSec} s).`,'warning');state=analyzerTestBuildState();render();analyzerTestRefreshDashboard();clearTimeout(t.networkRestoreTimer);t.networkRestoreTimer=setTimeout(()=>analyzerTestRestoreNetwork(),Math.max(1000,t.incidentDurationSec*1000));return true}
function analyzerTestRestoreNetwork(){const t=window.velocityEnduranceTest;if(!t.active||t.networkConnected)return;const downtime=Date.now()-t.networkCutStartedAt;t.lastDowntimeMs=downtime;t.totalDowntimeMs+=downtime;t.maxDowntimeMs=Math.max(t.maxDowntimeMs,downtime);t.networkConnected=true;t.reconnectSuccess++;analyzerTestLog(`Reconnexion simulée réussie après ${(downtime/1000).toFixed(1)} s.`,'success');analyzerTestScheduleNextCut();state=analyzerTestBuildState();render();analyzerTestRefreshDashboard()}
function forceAnalyzerTestNetworkCut(){const t=window.velocityEnduranceTest;if(!t.active){analyzerTestLog('Impossible : démarrez d’abord le test.','warning');return}if(!document.getElementById('analyzerTestIncidents')?.checked){analyzerTestLog('Activez « Coupures et reprises simulées » pour tester le réseau.','warning');return}if(!analyzerTestStartNetworkCut('forcée'))analyzerTestLog('Une coupure est déjà en cours.','warning')}
function startAnalyzerEnduranceTest(){const t=window.velocityEnduranceTest;if(t.active)return;t.backup=JSON.parse(JSON.stringify(state||{}));t.speed=Math.max(1,Number(document.getElementById('analyzerTestSpeed')?.value)||60);t.teams=Math.max(10,Number(document.getElementById('analyzerTestTeams')?.value)||40);const hours=Number(document.getElementById('analyzerTestDuration')?.value);t.durationMs=hours>0?hours*3600000:0;t.startedAt=Date.now();t.simulatedMs=0;t.laps=0;t.updates=0;t.stops=0;t.reconnectAttempts=0;t.reconnectSuccess=0;t.reconnectFailures=0;t.networkCuts=0;t.networkConnected=true;t.networkCutStartedAt=0;t.totalDowntimeMs=0;t.maxDowntimeMs=0;t.lastDowntimeMs=0;t.incidentFrequency=String(document.getElementById('analyzerTestIncidentFrequency')?.value||'30');t.incidentDurationSec=Math.max(1,Number(document.getElementById('analyzerTestIncidentDuration')?.value)||15);t.errors=[];t.log=[];t.drivers=Array.from({length:t.teams},(_,i)=>analyzerTestDriver(i));t.learningBackup=JSON.parse(JSON.stringify(analyzerLearning||{teams:{},startedAt:Date.now()}));analyzerLearning={teams:{},startedAt:Date.now(),testRunId:t.startedAt};t.active=true;document.getElementById('analyzerTestConfiguration').hidden=true;document.getElementById('analyzerTestDashboard').hidden=false;analyzerTestLog(`Test démarré : ${t.teams} équipes, vitesse ×${t.speed}, durée ${hours||'illimitée'} h.`);if(document.getElementById('analyzerTestIncidents')?.checked)analyzerTestScheduleNextCut();else t.nextCutAtMs=Infinity;state=analyzerTestBuildState();render();t.timer=setInterval(analyzerTestTick,1000);analyzerTestRefreshDashboard()}
function analyzerTestTick(){
 const t=window.velocityEnduranceTest;
 if(!t.active)return;
 const step=1000*t.speed;
 t.simulatedMs+=step;
 t.updates+=1;
 const pits=Boolean(document.getElementById('analyzerTestPits')?.checked),
       penalties=Boolean(document.getElementById('analyzerTestPenalties')?.checked),
       incidents=Boolean(document.getElementById('analyzerTestIncidents')?.checked);
 if(incidents&&t.networkConnected&&t.simulatedMs>=t.nextCutAtMs)analyzerTestStartNetworkCut('automatique');
 if(t.networkConnected){
  t.drivers.forEach((d,i)=>{
   const teamIndex=Number.isFinite(d.testIndex)?d.testIndex:i;
   const pilotOffset=Number(d.pilotOffsets?.[d.pilotIndex]||0);
   const lapSeconds=54+(teamIndex%11)*.17+pilotOffset+Math.sin((t.simulatedMs/60000)+teamIndex)*.12;
   const previousLaps=d.laps||0,newLaps=Math.floor(t.simulatedMs/(lapSeconds*1000));
   if(newLaps>previousLaps){
    for(let n=previousLaps;n<newLaps;n++){
     const value=lapSeconds+(Math.random()-.5)*.35;
     d.lap_times.push(value);d.current_stint_laps.push(value);
     if(d.lap_times.length>2200)d.lap_times.splice(0,d.lap_times.length-2200);
     if(d.current_stint_laps.length>80)d.current_stint_laps.shift();
     t.laps++;
    }
    d.laps=newLaps;
    d.last=formatApexMilliseconds(d.lap_times.at(-1)*1000);
    const best=Math.min(...d.lap_times);
    d.best=formatApexMilliseconds(best*1000);
    d.average_lap=d.current_stint_laps.reduce((a,b)=>a+b,0)/d.current_stint_laps.length;
   }
   d.track_time=analyzerTestFormatDuration(t.simulatedMs);d.on_track=d.track_time;
   if(pits&&t.simulatedMs>0&&Math.floor(t.simulatedMs/1800000)>d.pit_stops+(teamIndex%3)){
    d.pit_stops++;d.status='pit';
    d.pit_history.push({lap:d.laps,duration:150+(teamIndex%20)});
    d.current_stint_laps=[];
    d.kart=String(10+((teamIndex+d.pit_stops*7)%t.teams));
    if(Array.isArray(d.pilotRoster)&&d.pilotRoster.length>1&&Math.random()<.70){
     const choices=d.pilotRoster.map((_,idx)=>idx).filter(idx=>idx!==d.pilotIndex);
     d.pilotIndex=choices[Math.floor(Math.random()*choices.length)]??d.pilotIndex;
     d.pilot=d.pilotRoster[d.pilotIndex];
    }
    t.stops++;
    setTimeout(()=>{if(t.active)d.status='track'},Math.max(80,250/t.speed));
   }
   if(penalties&&t.updates%900===0&&teamIndex===t.updates/900%t.teams)d.penalty='5 s';
  });
  t.drivers.sort((a,b)=>(b.laps-a.laps)||((a.average_lap||999)-(b.average_lap||999))).forEach((d,i)=>{
   d.pos=i+1;d.gap=i?`+${((i*.37)+(t.simulatedMs/3600000)*(i*.02)).toFixed(3)}`:'—';
  });
 }
 state=analyzerTestBuildState();render();analyzerTestRefreshDashboard();
 if(t.durationMs&&t.simulatedMs>=t.durationMs){analyzerTestLog('Durée cible atteinte. Test terminé.');stopAnalyzerEnduranceTest(false)}
}
function analyzerTestRefreshDashboard(){const t=window.velocityEnduranceTest;const set=(id,value)=>{const el=document.getElementById(id);if(el)el.textContent=value};set('analyzerTestElapsed',analyzerTestFormatDuration(t.simulatedMs));set('analyzerTestRealElapsed',t.startedAt?analyzerTestFormatDuration(Date.now()-t.startedAt):'00:00:00');set('analyzerTestLaps',t.laps.toLocaleString('fr-FR'));set('analyzerTestUpdates',t.updates.toLocaleString('fr-FR'));set('analyzerTestStops',t.stops.toLocaleString('fr-FR'));set('analyzerTestCuts',String(t.networkCuts));set('analyzerTestReconnects',`${t.reconnectSuccess}/${t.reconnectAttempts}`);set('analyzerTestNetworkState',t.networkConnected?'CONNECTÉ':'COUPURE EN COURS');set('analyzerTestErrors',String(t.errors.length));const mem=performance?.memory?.usedJSHeapSize;set('analyzerTestMemory',Number.isFinite(mem)?`${Math.round(mem/1048576)} Mo`:'Indisponible');const progress=t.durationMs?Math.min(100,t.simulatedMs/t.durationMs*100):0;set('analyzerTestProgress',t.durationMs?`${progress.toFixed(1)} %`:'ILLIMITÉ');const row=document.querySelector('.analyzer-test-status-row'),stateEl=document.getElementById('analyzerTestState');if(row){row.classList.toggle('error',t.errors.length>0);row.classList.toggle('warning',!t.networkConnected)}if(stateEl)stateEl.textContent=t.errors.length?'● ERREURS DÉTECTÉES':(!t.networkConnected?'● RECONNEXION EN COURS':'● STABLE')}
function stopAnalyzerEnduranceTest(manual=true){const t=window.velocityEnduranceTest;if(!t.active)return;clearInterval(t.timer);clearTimeout(t.networkRestoreTimer);t.timer=null;t.networkRestoreTimer=null;if(!t.networkConnected){const downtime=Date.now()-t.networkCutStartedAt;t.lastDowntimeMs=downtime;t.totalDowntimeMs+=downtime;t.maxDowntimeMs=Math.max(t.maxDowntimeMs,downtime);t.reconnectFailures++;analyzerTestLog('Test arrêté pendant une coupure : reconnexion non validée.','error')}t.active=false;if(manual)analyzerTestLog('Test arrêté manuellement.');state=t.backup||{};t.backup=null;if(t.learningBackup){analyzerLearning=t.learningBackup;t.learningBackup=null;}document.getElementById('analyzerTestConfiguration').hidden=false;document.getElementById('analyzerTestDashboard').hidden=false;render();load();analyzerTestRefreshDashboard()}
function exportAnalyzerEnduranceTestReport(){const t=window.velocityEnduranceTest,payload={type:'velocity-endurance-stability-test',version:'7.2.106',exportedAt:new Date().toISOString(),active:t.active,configuration:{teams:t.teams,speed:t.speed,durationMs:t.durationMs,networkSimulation:Boolean(document.getElementById('analyzerTestIncidents')?.checked),incidentFrequency:t.incidentFrequency,incidentDurationSec:t.incidentDurationSec},results:{realElapsedMs:t.startedAt?Date.now()-t.startedAt:0,simulatedMs:t.simulatedMs,laps:t.laps,updates:t.updates,stops:t.stops,networkCuts:t.networkCuts,reconnectAttempts:t.reconnectAttempts,reconnectSuccess:t.reconnectSuccess,reconnectFailures:t.reconnectFailures,totalDowntimeMs:t.totalDowntimeMs,maxDowntimeMs:t.maxDowntimeMs,lastDowntimeMs:t.lastDowntimeMs,averageDowntimeMs:t.reconnectSuccess?t.totalDowntimeMs/t.reconnectSuccess:0,errors:t.errors},log:t.log};const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`Velocity_Test_Endurance_${new Date().toISOString().replace(/[:.]/g,'-')}.json`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)}
window.addEventListener('error',event=>{const t=window.velocityEnduranceTest;if(!t.active)return;t.errors.push({at:new Date().toISOString(),message:event.message,source:event.filename,line:event.lineno});analyzerTestLog(`Erreur JS : ${event.message}`,'error');analyzerTestRefreshDashboard()});window.addEventListener('unhandledrejection',event=>{const t=window.velocityEnduranceTest;if(!t.active)return;const message=String(event.reason?.message||event.reason||'Promesse rejetée');t.errors.push({at:new Date().toISOString(),message});analyzerTestLog(`Promesse rejetée : ${message}`,'error');analyzerTestRefreshDashboard()});document.addEventListener('DOMContentLoaded',()=>document.getElementById('analyzerEnduranceTestModal')?.addEventListener('click',event=>{if(event.target.id==='analyzerEnduranceTestModal')closeAnalyzerEnduranceTest()}));

/* Velocity V7.2.75 — équipes complètes Velocity/Lab + tri Delta + sélection équipe Mode Test. */

/* Velocity V7.2.75 — Débrief complet des anciennes sessions Apex depuis STATS. */

// Velocity V7.2.107 — masquage du mode développeur pour les membres Team
let velocityRaceSession=null,velocityRaceTeams=[],velocityRaceTeamId='',velocityRaceAccessPoll=null,velocityDevicePoll=null,velocityDeviceRole='',velocityDeviceAccessSignature='';
const VELOCITY_DEVICE_KEY='velocity_device_id';
let velocityInviteShare={link:'',memberName:'',token:''};
function velocityDeviceId(){let id='';try{id=localStorage.getItem(VELOCITY_DEVICE_KEY)||''}catch(_){}return id}
function velocityEnsureDeviceId(){let id=velocityDeviceId();if(!id){id=(crypto?.randomUUID?.()||(`DEV-${Date.now()}-${Math.random().toString(36).slice(2)}`));try{localStorage.setItem(VELOCITY_DEVICE_KEY,id)}catch(_){}}return id}
function velocityDeviceHeaders(){const id=velocityDeviceId();return id?{'X-Velocity-Device':id}:{}}
function velocitySetDeveloperToolsHidden(hidden=true){document.documentElement.classList.toggle('velocity-member-shared-mode',Boolean(hidden));document.querySelectorAll('.testbar').forEach(el=>{if(hidden){el.dataset.velocityMemberHidden='1';el.style.setProperty('display','none','important')}else if(el.dataset.velocityMemberHidden==='1'){delete el.dataset.velocityMemberHidden;el.style.removeProperty('display')}})}
function raceSessionCircuitName(){return (state?.circuits||[]).find(c=>String(c.id)===String(state?.circuit_id))?.name||state?.circuit_id||'—'}
function raceSessionFeedback(message,error=false){const el=document.getElementById('raceSessionFeedback');if(!el)return;el.textContent=message||'';el.classList.toggle('error',Boolean(error))}
function raceRoleLabel(r){return r==='team_manager'?'Team Manager':r==='spotter'?'Spotter':'Pilote'}
function raceRoleIcon(r){return r==='team_manager'?'🎧':r==='spotter'?'👀':'🏎️'}
function raceSessionTab(tab){const teams=tab==='teams';document.getElementById('raceTeamsPane').hidden=!teams;document.getElementById('raceCoursePane').hidden=teams;document.getElementById('raceTeamsTabBtn').classList.toggle('active',teams);document.getElementById('raceCourseTabBtn').classList.toggle('active',!teams);if(!teams)renderRaceAssignmentSelectors()}
function currentRaceTeam(){return velocityRaceTeams.find(t=>String(t.id)===String(velocityRaceTeamId))||null}
function raceTeamOptions(){const sel=document.getElementById('raceTeamSelect');if(!sel)return;sel.innerHTML='<option value="">Aucune Team</option>'+velocityRaceTeams.map(t=>`<option value="${analyzerEscape(t.id)}"${String(t.id)===String(velocityRaceTeamId)?' selected':''}>${analyzerEscape(t.name)}</option>`).join('')}
function selectRaceTeam(id){velocityRaceTeamId=String(id||'');raceTeamOptions();renderRaceTeamEditor();renderRaceAssignmentSelectors()}
async function refreshRaceSessionManager(){try{const r=await fetch('/api/race-session',{cache:'no-store',headers:velocityDeviceHeaders()});const data=await r.json();if(!data.ok)throw new Error(data.error||'Chargement impossible');velocityRaceTeams=data.teams||[];velocityRaceSession=data.session||null;if(!velocityRaceTeamId&&velocityRaceSession?.team_id)velocityRaceTeamId=velocityRaceSession.team_id;if(!velocityRaceTeamId&&velocityRaceTeams[0])velocityRaceTeamId=velocityRaceTeams[0].id;raceTeamOptions();renderRaceTeamEditor();raceSessionRender(velocityRaceSession)}catch(error){raceSessionFeedback('Impossible de charger Team Management.',true)}}
function openRaceSessionManager(){document.getElementById('raceSessionModal')?.classList.add('show');raceSessionFeedback('');refreshRaceSessionManager()}
function closeRaceSessionManager(){document.getElementById('raceSessionModal')?.classList.remove('show')}
let velocityTeamAction={type:'',id:'',name:''};
function openRaceTeamActionModal({type,title,text='',id='',name='',input=false,confirmLabel='VALIDER',danger=false}={}){
  velocityTeamAction={type:String(type||''),id:String(id||''),name:String(name||'')};
  const modal=document.getElementById('raceTeamActionModal'),titleEl=document.getElementById('raceTeamActionTitle'),textEl=document.getElementById('raceTeamActionText'),wrap=document.getElementById('raceTeamActionInputWrap'),inputEl=document.getElementById('raceTeamActionInput'),confirm=document.getElementById('raceTeamActionConfirm'),error=document.getElementById('raceTeamActionError');
  if(titleEl)titleEl.textContent=title||'TEAM';if(textEl)textEl.textContent=text||'';if(error)error.textContent='';
  if(wrap)wrap.hidden=!input;if(inputEl){inputEl.value=input?String(name||''):'';}
  if(confirm){confirm.textContent=confirmLabel;confirm.classList.toggle('danger',Boolean(danger));confirm.classList.toggle('primary',!danger)}
  if(modal)modal.hidden=false;
  if(input&&inputEl)setTimeout(()=>inputEl.focus(),60);
}
function closeRaceTeamActionModal(){const modal=document.getElementById('raceTeamActionModal');if(modal)modal.hidden=true;velocityTeamAction={type:'',id:'',name:''}}
function openRaceTeamCreateModal(){openRaceTeamActionModal({type:'create-team',title:'CRÉER UNE TEAM',text:'Donnez un nom à votre nouvelle Team.',input:true,confirmLabel:'CRÉER'})}
function openRaceTeamDeleteModal(teamId,teamName){openRaceTeamActionModal({type:'delete-team',id:teamId,name:teamName,title:'SUPPRIMER LA TEAM',text:`Supprimer ${teamName} ? Les membres, appareils associés et invitations seront également supprimés.`,confirmLabel:'SUPPRIMER',danger:true})}
function openRaceMemberDeleteModal(memberId,memberName){openRaceTeamActionModal({type:'delete-member',id:memberId,name:memberName,title:'SUPPRIMER LE MEMBRE',text:`Supprimer ${memberName} de la Team ? Son appareil et ses invitations seront également dissociés.`,confirmLabel:'SUPPRIMER',danger:true})}
function openRaceSessionEndModal(){openRaceTeamActionModal({type:'end-session',title:'TERMINER LA SESSION',text:'Terminer la Session Course ? Tous les rôles actifs seront immédiatement révoqués sur les appareils des membres.',confirmLabel:'TERMINER LA SESSION',danger:true})}
async function confirmRaceTeamAction(){
  const action={...velocityTeamAction},confirm=document.getElementById('raceTeamActionConfirm'),input=document.getElementById('raceTeamActionInput'),error=document.getElementById('raceTeamActionError');
  if(confirm)confirm.disabled=true;if(error)error.textContent='';
  try{
    if(action.type==='create-team'){
      const name=String(input?.value||'').trim();if(!name)throw new Error('Saisissez le nom de la Team.');
      const r=await fetch('/api/teams',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})}),data=await r.json();if(!r.ok||!data.ok)throw new Error(data.error||'Création impossible');velocityRaceTeamId=data.team.id;closeRaceTeamActionModal();await refreshRaceSessionManager();raceSessionFeedback(`Team ${data.team.name} créée.`);return;
    }
    if(action.type==='delete-team'){await performDeleteRaceTeam(action.id,action.name);closeRaceTeamActionModal();return}
    if(action.type==='delete-member'){await performDeleteRaceMember(action.id,action.name);closeRaceTeamActionModal();return}
    if(action.type==='end-session'){await performEndRaceSession();closeRaceTeamActionModal();return}
  }catch(e){if(error)error.textContent=e.message||String(e)}finally{if(confirm)confirm.disabled=false}
}
async function createRaceTeamPrompt(){openRaceTeamCreateModal()}
async function addRaceMember(){const team=currentRaceTeam();if(!team)return raceSessionFeedback('Sélectionnez une Team.',true);const input=document.getElementById('raceNewMemberName'),name=input?.value?.trim();if(!name)return raceSessionFeedback('Saisissez le nom du membre.',true);const roles=[...document.querySelectorAll('.race-new-role:checked')].map(x=>x.value);try{const r=await fetch(`/api/teams/${encodeURIComponent(team.id)}/members`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,roles})});const data=await r.json();if(!r.ok||!data.ok)throw new Error(data.error||'Ajout impossible');if(input)input.value='';await refreshRaceSessionManager();raceSessionFeedback(`${name} ajouté à ${team.name}.`)}catch(e){raceSessionFeedback(e.message||String(e),true)}}
async function updateRaceMemberRoles(memberId){const roles=[...document.querySelectorAll(`[data-member-role="${CSS.escape(String(memberId))}"]:checked`)].map(x=>x.value);try{await fetch(`/api/members/${encodeURIComponent(memberId)}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({roles})});await refreshRaceSessionManager();raceSessionFeedback('Rôles autorisés mis à jour.')}catch(e){raceSessionFeedback('Mise à jour impossible.',true)}}
function renderRaceTeamEditor(){const box=document.getElementById('raceTeamEditor'),team=currentRaceTeam();if(!box)return;if(!team){box.innerHTML='<div class="analyzer-empty">Créez ou sélectionnez une Team.</div>';return}box.innerHTML=`<div class="race-team-title"><div><span>TEAM</span><h3>${analyzerEscape(team.name)}</h3></div><div class="race-team-title-actions"><b>${team.members?.length||0} membre(s)</b><button class="race-ui-btn danger" type="button" onclick="openRaceTeamDeleteModal('${analyzerEscape(team.id)}','${analyzerEscape(team.name).replace(/'/g,'&#39;')}')">SUPPRIMER LA TEAM</button></div></div><div class="race-member-list">${(team.members||[]).map(m=>{const paired=(m.device_ids||[]).length>0;return `<article class="race-member-card"><div class="race-member-head"><div><strong>${analyzerEscape(m.name)}</strong><span class="${paired?'paired':'unpaired'}">${paired?'● APPAREIL ASSOCIÉ':'○ APPAREIL NON ASSOCIÉ'}</span></div><div class="race-member-head-actions"><button class="race-ui-btn" onclick="inviteRaceMember('${analyzerEscape(m.id)}','${analyzerEscape(m.name).replace(/'/g,'&#39;')}')">${paired?'RÉASSOCIER':'ASSOCIER UN APPAREIL'}</button><button class="race-ui-btn danger" onclick="openRaceMemberDeleteModal('${analyzerEscape(m.id)}','${analyzerEscape(m.name).replace(/'/g,'&#39;')}')">SUPPRIMER</button></div></div><div class="race-member-roles"><label><input data-member-role="${analyzerEscape(m.id)}" type="checkbox" value="pilot" ${m.roles?.includes('pilot')?'checked':''} onchange="updateRaceMemberRoles('${analyzerEscape(m.id)}')"> PILOTE</label><label><input data-member-role="${analyzerEscape(m.id)}" type="checkbox" value="spotter" ${m.roles?.includes('spotter')?'checked':''} onchange="updateRaceMemberRoles('${analyzerEscape(m.id)}')"> SPOTTER</label><label><input data-member-role="${analyzerEscape(m.id)}" type="checkbox" value="team_manager" ${m.roles?.includes('team_manager')?'checked':''} onchange="updateRaceMemberRoles('${analyzerEscape(m.id)}')"> TEAM MANAGER</label></div></article>`}).join('')||'<div class="analyzer-empty">Aucun membre.</div>'}</div><div class="race-add-member"><input id="raceNewMemberName" placeholder="Nom du nouveau membre"><div><label><input class="race-new-role" type="checkbox" value="pilot" checked> Pilote</label><label><input class="race-new-role" type="checkbox" value="spotter"> Spotter</label><label><input class="race-new-role" type="checkbox" value="team_manager"> Team Manager</label></div><button class="race-ui-btn" onclick="addRaceMember()">+ AJOUTER LE MEMBRE</button></div>`}
async function performDeleteRaceTeam(teamId,teamName){const r=await fetch(`/api/teams/${encodeURIComponent(teamId)}`,{method:'DELETE'}),data=await r.json();if(!r.ok||!data.ok)throw new Error(data.error||'Suppression impossible');if(String(velocityRaceTeamId)===String(teamId))velocityRaceTeamId='';await refreshRaceSessionManager();raceSessionFeedback(`Team ${teamName} supprimée.`)}
async function performDeleteRaceMember(memberId,memberName){const r=await fetch(`/api/members/${encodeURIComponent(memberId)}`,{method:'DELETE'}),data=await r.json();if(!r.ok||!data.ok)throw new Error(data.error||'Suppression impossible');await refreshRaceSessionManager();raceSessionFeedback(`${memberName} supprimé de la Team.`)}
function deleteRaceTeam(teamId,teamName){openRaceTeamDeleteModal(teamId,teamName)}
function deleteRaceMember(memberId,memberName){openRaceMemberDeleteModal(memberId,memberName)}
let velocityInviteQrObjectUrl='';
function openRaceInviteShare(memberName,link){velocityInviteShare={link:String(link||''),memberName:String(memberName||''),token:String(link||'').split('/').pop()||''};const modal=document.getElementById('raceInviteShareModal');document.getElementById('raceInviteShareTitle').textContent=`Associer ${memberName}`;document.getElementById('raceInviteShareText').textContent=`Envoyez cette invitation à ${memberName}. Elle permet d’associer son appareil à Velocity.`;const wrap=document.getElementById('raceInviteQrWrap'),img=document.getElementById('raceInviteQrImage'),loading=document.getElementById('raceInviteQrLoading'),error=document.getElementById('raceInviteQrError'),copyStatus=document.getElementById('raceInviteCopyStatus');if(wrap)wrap.hidden=true;if(img){img.hidden=true;img.removeAttribute('src')}if(loading){loading.hidden=false;loading.textContent='Génération du QR Code…'}if(error)error.hidden=true;if(copyStatus)copyStatus.textContent='';if(velocityInviteQrObjectUrl){URL.revokeObjectURL(velocityInviteQrObjectUrl);velocityInviteQrObjectUrl=''}if(modal)modal.hidden=false}
function closeRaceInviteShare(){const modal=document.getElementById('raceInviteShareModal');if(modal)modal.hidden=true;if(velocityInviteQrObjectUrl){URL.revokeObjectURL(velocityInviteQrObjectUrl);velocityInviteQrObjectUrl=''}}
async function copyRaceInviteLink(){const link=velocityInviteShare.link;if(!link)return;const status=document.getElementById('raceInviteCopyStatus');try{await navigator.clipboard.writeText(link)}catch(_){const area=document.createElement('textarea');area.value=link;area.setAttribute('readonly','');area.style.position='fixed';area.style.opacity='0';document.body.appendChild(area);area.select();document.execCommand?.('copy');area.remove()}if(status){status.textContent='✓ Lien copié';setTimeout(()=>{if(status.textContent==='✓ Lien copié')status.textContent=''},1800)}raceSessionFeedback(`Lien d’invitation ${velocityInviteShare.memberName} copié.`)}
async function shareRaceInviteLink(){const link=velocityInviteShare.link;if(!link)return;const title=`Velocity — invitation de ${velocityInviteShare.memberName}`;if(navigator.share){try{await navigator.share({title,text:'Associez votre appareil à Velocity.',url:link});return}catch(e){if(e?.name==='AbortError')return}}await copyRaceInviteLink()}
async function toggleRaceInviteQr(){const wrap=document.getElementById('raceInviteQrWrap'),img=document.getElementById('raceInviteQrImage'),loading=document.getElementById('raceInviteQrLoading'),error=document.getElementById('raceInviteQrError');if(!wrap||!img||!velocityInviteShare.token)return;if(!wrap.hidden){wrap.hidden=true;return}wrap.hidden=false;img.hidden=true;if(error)error.hidden=true;if(loading){loading.hidden=false;loading.textContent='Génération du QR Code…'}try{const r=await fetch(`/api/invite/${encodeURIComponent(velocityInviteShare.token)}/qr?t=${Date.now()}`,{cache:'no-store'});if(!r.ok)throw new Error('QR indisponible');const blob=await r.blob();if(!String(blob.type||'').startsWith('image/'))throw new Error('Réponse QR invalide');if(velocityInviteQrObjectUrl)URL.revokeObjectURL(velocityInviteQrObjectUrl);velocityInviteQrObjectUrl=URL.createObjectURL(blob);img.src=velocityInviteQrObjectUrl;img.hidden=false;if(loading)loading.hidden=true}catch(_){if(loading)loading.hidden=true;if(error)error.hidden=false}}
async function inviteRaceMember(memberId,memberName){try{const r=await fetch(`/api/members/${encodeURIComponent(memberId)}/invite`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});const data=await r.json();if(!r.ok||!data.ok)throw new Error(data.error||'Invitation impossible');openRaceInviteShare(memberName,data.link)}catch(e){raceSessionFeedback(e.message||String(e),true)}}
function renderRaceRolePicker(containerId,role,currentValues=[],active=false){const box=document.getElementById(containerId),team=currentRaceTeam();if(!box)return;const current=new Set((Array.isArray(currentValues)?currentValues:(currentValues?[currentValues]:[])).map(String));const members=(team?.members||[]).filter(m=>(m.roles||[]).includes(role));const attr=active?'data-active-role-member':'data-race-role-member';box.innerHTML=members.length?members.map(m=>`<label><input type="checkbox" ${attr}="${role}" value="${analyzerEscape(m.id)}" ${current.has(String(m.id))?'checked':''}> <span>${analyzerEscape(m.name)}</span></label>`).join(''):'<em>Aucun membre autorisé</em>'}
function renderRaceAssignmentSelectors(){const team=currentRaceTeam();renderRaceRolePicker('raceAssignTM','team_manager',velocityRaceSession?.assignments?.team_manager||[]);renderRaceRolePicker('raceAssignSpotter','spotter',velocityRaceSession?.assignments?.spotter||[]);renderRaceRolePicker('raceAssignPilot','pilot',velocityRaceSession?.assignments?.pilot||[]);const teamLabel=document.getElementById('raceSessionTeam');if(teamLabel)teamLabel.textContent=team?.name||'—';const circuit=document.getElementById('raceSessionCircuit');if(circuit)circuit.textContent=raceSessionCircuitName()}
function currentAssignmentPayload(){const out={team_manager:[],spotter:[],pilot:[]};document.querySelectorAll('[data-race-role-member]:checked').forEach(el=>{const role=el.dataset.raceRoleMember;if(out[role])out[role].push(el.value)});return out}
function raceSessionRender(session){velocityRaceSession=session||null;const empty=document.getElementById('raceSessionEmpty'),active=document.getElementById('raceSessionActive');const isActive=Boolean(session&&session.status==='active');if(empty)empty.hidden=isActive;if(active)active.hidden=!isActive;renderRaceAssignmentSelectors();if(!isActive)return;document.getElementById('raceSessionActiveName').textContent=session.name||'SESSION DE COURSE';document.getElementById('raceSessionActiveCircuit').textContent=session.circuit_name||session.circuit_id||'—';document.getElementById('raceSessionActiveTeam').textContent=session.team_name||'—';renderActiveRaceAssignments()}
function renderActiveRaceAssignments(){const box=document.getElementById('raceActiveAssignments');if(!box||!velocityRaceSession)return;const roles=[['team_manager','TEAM MANAGER'],['spotter','SPOTTER'],['pilot','PILOTE']];box.innerHTML=roles.map(([role,label])=>`<div class="race-role-picker active"><span>${label}</span><div id="raceActive-${role}" class="race-role-members"></div></div>`).join('');roles.forEach(([role])=>renderRaceRolePicker(`raceActive-${role}`,role,velocityRaceSession.assignments?.[role]||[],true))}
async function createRaceSession(){const team=currentRaceTeam();if(!team)return raceSessionFeedback('Sélectionnez une Team.',true);const button=document.querySelector('.race-session-create');if(button)button.disabled=true;try{const body={name:document.getElementById('raceSessionName')?.value?.trim()||'',team_id:team.id,assignments:currentAssignmentPayload()};const r=await fetch('/api/race-session/create',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await r.json();if(!r.ok||!data.ok)throw new Error(data.error||'Création impossible');velocityRaceSession=data.session;raceSessionRender(data.session);raceSessionFeedback('Session active. Tous les membres cochés accèdent au rôle qui leur est affecté.')}catch(e){raceSessionFeedback(e.message||String(e),true)}finally{if(button)button.disabled=false}}
async function saveRaceAssignments(){const assignments={team_manager:[],spotter:[],pilot:[]};document.querySelectorAll('[data-active-role-member]:checked').forEach(el=>{const role=el.dataset.activeRoleMember;if(assignments[role])assignments[role].push(el.value)});try{const r=await fetch('/api/race-session/assignments',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({assignments})});const data=await r.json();if(!r.ok||!data.ok)throw new Error(data.error||'Mise à jour impossible');velocityRaceSession=data.session;raceSessionRender(data.session);raceSessionFeedback('Rôles actifs appliqués. Les appareils se mettent à jour automatiquement.')}catch(e){raceSessionFeedback(e.message||String(e),true)}}
async function performEndRaceSession(){const r=await fetch('/api/race-session/end',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}),data=await r.json();if(!r.ok||!data.ok)throw new Error(data.error||'Arrêt impossible');velocityRaceSession=null;raceSessionRender(null);raceSessionFeedback('Session terminée. La Team reste enregistrée pour les prochaines courses.')}
function endRaceSession(){openRaceSessionEndModal()}
function velocityShowInviteInstallStep(memberName='',teamName=''){
  const pair=document.getElementById('velocityInvitePairStep'),install=document.getElementById('velocityInviteInstallStep');
  if(pair)pair.hidden=true;if(install)install.hidden=false;
  const identity=document.getElementById('velocityInviteInstallIdentity');
  if(identity)identity.innerHTML=memberName
    ? `Votre appareil est maintenant associé à <b>${analyzerEscape(memberName)}</b>${teamName?` dans <b>${analyzerEscape(teamName)}</b>`:''}.`
    : 'Votre appareil est maintenant associé à votre profil.';
}
async function claimVelocityInvite(){
  const token=String(window.VELOCITY_INVITE_TOKEN||'');if(!token||token==='expired')return;
  const button=document.getElementById('velocityInviteClaim'),status=document.getElementById('velocityInviteStatus');
  if(button){button.disabled=true;button.textContent='ASSOCIATION EN COURS…'}if(status)status.textContent='';
  const id=velocityEnsureDeviceId();
  try{
    const r=await fetch(`/api/invite/${encodeURIComponent(token)}/claim`,{method:'POST',headers:{'Content-Type':'application/json','X-Velocity-Device':id},body:JSON.stringify({device_id:id,device_name:navigator.userAgent.includes('iPhone')?'iPhone':navigator.userAgent.includes('Android')?'Android':'Appareil Velocity'})});
    const data=await r.json();if(!r.ok||!data.ok)throw new Error(data.error||'Association impossible');
    try{localStorage.setItem(VELOCITY_DEVICE_KEY,data.device_id)}catch(_){}
    if(status)status.textContent='✓ Appareil associé';
    setTimeout(()=>velocityShowInviteInstallStep(data.member?.name||'',data.member?.team_name||''),550);
  }catch(e){
    if(status)status.textContent=e.message||String(e);
    if(button){button.disabled=false;button.textContent='ASSOCIER CET APPAREIL'}
  }
}
async function velocityInviteBootstrap(){
  const token=String(window.VELOCITY_INVITE_TOKEN||'');if(!token)return;
  velocitySetDeveloperToolsHidden(true);
  document.body.classList.add('velocity-invite-mode');
  const o=document.getElementById('velocityInviteOverlay');if(o)o.hidden=false;
  const pair=document.getElementById('velocityInvitePairStep'),install=document.getElementById('velocityInviteInstallStep');
  if(pair)pair.hidden=false;if(install)install.hidden=true;
  if(token==='expired'){
    document.getElementById('velocityInviteTitle').textContent='Invitation expirée';
    document.getElementById('velocityInviteText').textContent='Demandez au Team Manager de générer une nouvelle invitation.';
    document.getElementById('velocityInviteRoles').innerHTML='';
    document.getElementById('velocityInviteClaim').hidden=true;return
  }
  try{
    const r=await fetch(`/api/invite/${encodeURIComponent(token)}`,{cache:'no-store'}),data=await r.json();if(!data.ok)throw new Error();
    const i=data.invite;
    document.getElementById('velocityInviteTitle').textContent=`Bienvenue ${i.member_name}`;
    document.getElementById('velocityInviteText').innerHTML=`Vous rejoignez <b>${analyzerEscape(i.team_name)}</b> en tant que :`;
    document.getElementById('velocityInviteRoles').innerHTML=(i.roles||[]).map(r=>`<span>${raceRoleIcon(r)} ${raceRoleLabel(r)}</span>`).join('');
    const stored=velocityDeviceId();
    if(i.claimed_device_id&&stored&&String(i.claimed_device_id)===String(stored)){
      velocityShowInviteInstallStep(i.member_name||'',i.team_name||'');
    }
  }catch(_){
    document.getElementById('velocityInviteTitle').textContent='Invitation indisponible';
    document.getElementById('velocityInviteText').textContent='Cette invitation ne peut pas être chargée. Demandez au Team Manager d’en générer une nouvelle.';
    document.getElementById('velocityInviteRoles').innerHTML='';
    document.getElementById('velocityInviteClaim').hidden=true;
  }
}
function velocityDeviceHasStoredIdentity(){let local=false,cookie=false;try{local=Boolean(localStorage.getItem(VELOCITY_DEVICE_KEY))}catch(_){}try{cookie=document.cookie.split(';').some(v=>v.trim().startsWith('velocity_device_id='))}catch(_){}return local||cookie}
function velocityShowDeviceGate(title='Vérification de votre accès…',message='Connexion à votre Team en cours.',waiting='Veuillez patienter…'){document.body.classList.add('velocity-device-waiting-mode');const w=document.getElementById('velocityDeviceWaiting');if(w)w.hidden=false;const n=document.getElementById('velocityDeviceWaitingName'),t=document.getElementById('velocityDeviceWaitingTeam'),b=w?.querySelector('b');if(n)n.textContent=title;if(t)t.textContent=message;if(b)b.textContent=waiting}
function velocityResetRoleUI(){document.body.classList.remove('race-role-access','race-role-spotter','race-role-pilot','velocity-device-waiting-mode','velocity-device-pending-mode');document.getElementById('velocityDeviceWaiting').hidden=true;try{document.getElementById('enduranceFocus')?.classList.remove('show')}catch(_){}}
function velocityDeviceAccessKey(data){const roles=[...(data?.authorized_roles||[])].map(String).sort().join(',');return [data?.paired?'1':'0',String(data?.role||''),String(data?.session_id||data?.session?.id||''),String(data?.device?.id||''),roles].join('|')}
function velocityApplyDeviceRole(data){const signature=velocityDeviceAccessKey(data);if(signature===velocityDeviceAccessSignature)return;velocityDeviceAccessSignature=signature;const role=String(data?.role||'');velocityDeviceRole=role;velocityResetRoleUI();if(data?.paired)velocitySetDeveloperToolsHidden(true);if(!data?.paired){if(velocityDeviceHasStoredIdentity()){velocitySetDeveloperToolsHidden(true);velocityShowDeviceGate('Appareil non reconnu','Cet appareil était associé à Velocity mais son accès n’est plus valide.','Demandez au Team Manager de réassocier cet appareil.');return}velocitySetDeveloperToolsHidden(false);return}const authorized=new Set(data.authorized_roles||[]);if(!role){velocityShowDeviceGate(data.device?.member_name||'Membre associé',data.device?.team_name?`${data.device.team_name} — aucune session active pour vous.`:'Aucune session active.','En attente d’affectation…');return}if(!authorized.has(role)){velocityShowDeviceGate('Accès refusé','Le rôle demandé n’est pas autorisé pour ce membre.','Contactez le Team Manager.');return}if(role==='team_manager'){showMode('analyzer');return}document.body.classList.add('race-role-access',`race-role-${role}`);if(role==='spotter')showMode('spotter');else if(role==='pilot'){showMode('endurance');setTimeout(()=>openEnduranceFocus(),150)}}
async function velocityDeviceSessionCheck(){if(window.VELOCITY_INVITE_TOKEN)return;const id=velocityDeviceId();try{const r=await fetch('/api/device/session',{cache:'no-store',headers:id?{'X-Velocity-Device':id}:{}}),data=await r.json();if(!r.ok||!data.ok)throw new Error(data.error||'Vérification impossible');if(data.paired&&data.device?.id&&!id)try{localStorage.setItem(VELOCITY_DEVICE_KEY,data.device.id)}catch(_){}velocityApplyDeviceRole(data)}catch(_){if(velocityDeviceHasStoredIdentity()&&!velocityDeviceAccessSignature)velocityShowDeviceGate('Connexion indisponible','Velocity ne peut pas vérifier vos droits pour le moment.','Accès verrouillé jusqu’au retour du serveur.')}}
function velocityDeviceBootstrap(){if(window.VELOCITY_INVITE_TOKEN)return;if(velocityDeviceHasStoredIdentity()){velocitySetDeveloperToolsHidden(true);velocityShowDeviceGate()}setTimeout(velocityDeviceSessionCheck,250);velocityDevicePoll=setInterval(velocityDeviceSessionCheck,3000)}
async function velocityRaceAccessCheck(){const access=window.VELOCITY_RACE_ACCESS||{};if(!access.token)return;try{const r=await fetch(`/api/race-access/${encodeURIComponent(access.token)}`,{cache:'no-store'});if(!r.ok){velocityRaceAccessEnded();return}const data=await r.json();if(!data.ok)velocityRaceAccessEnded()}catch(_){}}
function velocityRaceAccessEnded(){if(velocityRaceAccessPoll){clearInterval(velocityRaceAccessPoll);velocityRaceAccessPoll=null}const ended=document.getElementById('raceRoleEnded');if(ended)ended.hidden=false;try{document.getElementById('enduranceFocus')?.classList.remove('show')}catch(_){}}
function velocityRaceAccessBootstrap(){const access=window.VELOCITY_RACE_ACCESS||{},role=String(access.role||'');if(role==='expired'){velocitySetDeveloperToolsHidden(true);document.body.classList.add('race-role-access');velocityRaceAccessEnded();return}if(!['spotter','pilot'].includes(role))return;velocitySetDeveloperToolsHidden(true);document.body.classList.add('race-role-access',`race-role-${role}`);const launch=()=>{if(!state?.circuit_id){setTimeout(launch,250);return}if(role==='spotter')showMode('spotter');else{showMode('endurance');setTimeout(()=>openEnduranceFocus(),180)}};launch();velocityRaceAccessCheck();velocityRaceAccessPoll=setInterval(velocityRaceAccessCheck,3000)}
document.addEventListener('DOMContentLoaded',()=>{velocityInviteBootstrap();velocityRaceAccessBootstrap();velocityDeviceBootstrap()});
window.openRaceSessionManager=openRaceSessionManager;window.closeRaceSessionManager=closeRaceSessionManager;window.raceSessionTab=raceSessionTab;window.selectRaceTeam=selectRaceTeam;window.createRaceTeamPrompt=createRaceTeamPrompt;window.openRaceTeamCreateModal=openRaceTeamCreateModal;window.closeRaceTeamActionModal=closeRaceTeamActionModal;window.confirmRaceTeamAction=confirmRaceTeamAction;window.openRaceTeamDeleteModal=openRaceTeamDeleteModal;window.openRaceMemberDeleteModal=openRaceMemberDeleteModal;window.openRaceSessionEndModal=openRaceSessionEndModal;window.addRaceMember=addRaceMember;window.updateRaceMemberRoles=updateRaceMemberRoles;window.inviteRaceMember=inviteRaceMember;window.deleteRaceTeam=deleteRaceTeam;window.deleteRaceMember=deleteRaceMember;window.copyRaceInviteLink=copyRaceInviteLink;window.shareRaceInviteLink=shareRaceInviteLink;window.toggleRaceInviteQr=toggleRaceInviteQr;window.closeRaceInviteShare=closeRaceInviteShare;window.createRaceSession=createRaceSession;window.saveRaceAssignments=saveRaceAssignments;window.endRaceSession=endRaceSession;window.claimVelocityInvite=claimVelocityInvite;

