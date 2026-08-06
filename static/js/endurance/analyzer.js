
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
let analyzerActiveSessionId=null;
let analyzerSessionCircuitId=null;
let analyzerLastSessionSaveAt=0;
let analyzerSessionAutosaveTimer=null;
let analyzerSessionRestoreLock=false;

// Trafic devant : suivi persistant des passages de ligne et des cercles DOM.
const analyzerTrafficMotion=new Map();
const analyzerTrafficNodes=new Map();
const ANALYZER_TRAFFIC_HYSTERESIS_SECONDS=10.5;



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
  appVersion:'7.2.65',
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
 const session={version:3,appVersion:'7.2.65',id,name:name||analyzerSessionDefaultName(cid),circuitId:cid,circuitName:analyzerSessionCircuitName(cid),createdAt:now,updatedAt:now,status:'active',rules:reset?{...ANALYZER_DEFAULT_RULES}:{...analyzerRules},queues:reset?{count:1,queues:[[]]}:{count:kartQueueState.count,queues:kartQueueState.queues.map(q=>[...q])},followedDriver:'',analyzerSort:'position'};
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
function analyzerAfterCircuitChange(){analyzerActiveSessionId=null;analyzerSessionCircuitId=null;setTimeout(analyzerEnsureSession,100)}
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
 try{const session=JSON.parse(await file.text());if(!session?.id||!session?.circuitId)throw new Error('Format de session invalide');session.id=`${analyzerSessionSafeId(session.circuitId)}-${Date.now().toString(36)}`;session.name=(session.name||'Session importée')+' — import';session.createdAt=Date.now();session.updatedAt=Date.now();session.status='active';delete session.learning;session.version=3;session.appVersion='7.2.65';if(!analyzerStorageSafeSet(ANALYZER_SESSION_PREFIX+session.id,JSON.stringify(session)))throw new Error('Stockage local insuffisant');analyzerSessionUpdateIndex(session);if(session.circuitId===analyzerSessionCircuit())analyzerApplySession(session);renderAnalyzerSessions();window.alert('Session importée avec succès.')}catch(error){window.alert('Import impossible : '+error.message)}finally{event.target.value=''}
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
 const drivers=(state?.drivers||[]).filter(d=>d&&d.driver);if(!drivers.length)return false;
 const registry=analyzerApexMapRegistry();
 const liveStatus=String(state?.live?.status||'').toLowerCase(),connection=String(state?.connection||'').toLowerCase();
 const connected=['connected','receiving'].includes(liveStatus)||connection.includes('connect');
 // La session est active dès que le live est connecté et qu'une grille existe.
 // Les impulsions *i1/*i2 sont optionnelles : certaines pistes ne publient
 // aucun secteur et n'envoient qu'un événement * par tour.
 if(!connected)return false;
 if(registry.noLive&&registry.lastEventAt===0){
  const explicitNoLive=liveStatus==='idle'||liveStatus==='closed'||liveStatus==='error';
  return !explicitNoLive;
 }
 return true;
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
function analyzerApexEntryPhase(entry,at=Date.now()){
 if(!entry)return null;
 // V6.11.2 : un marqueur reste visible à la fin du segment jusqu'au prochain événement Apex.
 const age=at-Number(entry.startedAt||0),duration=Number(entry.durationMs)||0;
 if(!duration)return Number(entry.lastPhase)||0;
 const p=Math.max(0,Math.min(1,age/duration));
 const s1=Number(entry.sectors?.s1)||0,s2=Number(entry.sectors?.s2)||0,s3=Number(entry.sectors?.s3)||0;
 const total=(s1+s2+s3)>0?s1+s2+s3:(Number(entry.lapDurationMs)||duration);
 if(entry.segment==='track')return p;
 if(entry.segment==='s1')return total>0?p*s1/total:p;
 if(entry.segment==='s2')return total>0?(s1+p*s2)/total:Number(entry.lastPhase)||0;
 if(entry.segment==='s3')return total>0?(s1+s2+p*s3)/total:Number(entry.lastPhase)||0;
 if(entry.segment==='in'||entry.segment==='out')return Number(entry.lastPhase)||0;
 return Number(entry.lastPhase)||0;
}
function analyzerDriverPhase(driver){
 const eventPhase=analyzerApexEntryPhase(analyzerApexMapEntry(driver));if(Number.isFinite(eventPhase))return ((eventPhase%1)+1)%1;
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
function analyzerMapPaceData(drivers){const valid=(drivers||[]).filter(d=>d?.status!=='pit').map(d=>({driver:d,lap:analyzerMapLastLap(d)})).filter(x=>Number.isFinite(x.lap));const best=valid.length?Math.min(...valid.map(x=>x.lap)):null;const map=new Map();for(const d of drivers||[]){const lap=analyzerMapLastLap(d),delta=Number.isFinite(best)&&Number.isFinite(lap)?Math.max(0,lap-best):null;map.set(d,{lap,delta,category:Number.isFinite(delta)?analyzerMapPaceCategory(delta):'slow'})}return {best,map}}
function analyzerTrackPoint(phase,radius=121,cx=analyzerMapGeometry.cx,cy=analyzerMapGeometry.cy){const angle=(Number(phase)||0)*Math.PI*2-Math.PI/2;return {x:cx+Math.cos(angle)*radius,y:cy+Math.sin(angle)*radius}}
function analyzerMapPoint(driver,radius=121){const entry=analyzerApexMapEntry(driver),phase=analyzerApexEntryPhase(entry);if(!entry||!Number.isFinite(phase))return null;return {...analyzerTrackPoint(phase,radius),phase,inPit:Boolean(entry.inPit),entry}}
function analyzerMapRadarMarkup(){const {cx,cy}=analyzerMapGeometry;const rings=Object.entries(analyzerMapRings).map(([category,r])=>`<circle class="map-radar-ring ${category}" cx="${cx}" cy="${cy}" r="${r}"></circle>`).join('');const rays=Array.from({length:8},(_,i)=>{const a=i*Math.PI/4-Math.PI/2,x1=cx+Math.cos(a)*41.25,y1=cy+Math.sin(a)*41.25,x2=cx+Math.cos(a)*124.85,y2=cy+Math.sin(a)*124.85;return `<line class="map-radar-ray" x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}"></line>`}).join('');const checker=Array.from({length:12},(_,i)=>{const y=cy-10*(i+1),alt=i%2;return `<rect class="map-finish-square ${alt?'alt':''}" x="${cx-5}" y="${y}" width="5" height="10"></rect><rect class="map-finish-square ${alt?'':'alt'}" x="${cx}" y="${y}" width="5" height="10"></rect>`}).join('');return `${rays}${rings}<g class="map-finish-line">${checker}</g>`}
function analyzerSimulationKartLabel(driver){return String(validKartNumber(driver)||driver?.apex||driver?.pos||'—').slice(0,3)}
function analyzerMapTop5Set(drivers){return new Set((drivers||[]).slice().sort((a,b)=>(Number(a.velocity_score??a.kart_score??0)||0)-(Number(b.velocity_score??b.kart_score??0)||0)).slice(-5).map(d=>d.driver))}
function analyzerMapIsHighlighted(driver,category,top5){if(analyzerMapHighlight==='followed')return driver.driver===state.followed_driver;if(analyzerMapHighlight==='top5')return top5.has(driver.driver);if(analyzerMapHighlight==='pit')return driver.status==='pit'||Boolean(analyzerApexMapEntry(driver)?.inPit);if(analyzerMapHighlight==='fastest')return category==='fastest';return false}
function analyzerMapPitQueue(drivers){return (drivers||[]).map(driver=>({driver,entry:analyzerApexMapEntry(driver)})).filter(x=>x.driver.status==='pit'||x.entry?.inPit).sort((a,b)=>Number(a.entry?.pitEnteredAt||0)-Number(b.entry?.pitEnteredAt||0))}
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
 const dots=visible.map(({driver,info,point})=>{let p=point;if(simulation&&driver.driver!==simulation.followedName&&driver.status!=='pit')p=analyzerTrackPoint((point.phase+horizon/Math.max(1,analyzerDriverPace(driver)))%1,analyzerMapRings[info.category]);if(simulation&&driver.driver===simulation.followedName)p=analyzerTrackPoint(0,analyzerMapRings[info.category]);const classes=['pit-simulator-dot','pace-'+info.category];if(driver.driver===state.followed_driver)classes.push('followed');if(analyzerMapIsHighlighted(driver,info.category,top5))classes.push('highlighted');if(analyzerMapHighlight!=='none'&&!analyzerMapIsHighlighted(driver,info.category,top5)&&driver.driver!==state.followed_driver)classes.push('dimmed');const title=Number.isFinite(info.delta)?`${driver.driver} · +${info.delta.toFixed(3)} s`:driver.driver;return `<g class="${classes.join(' ')}" transform="translate(${p.x.toFixed(2)} ${p.y.toFixed(2)})"><title>${analyzerEscape(title)}</title><circle r="${info.category==='fastest'?10.45:9.35}"></circle><text y=".5">${analyzerEscape(analyzerSimulationKartLabel(driver))}</text></g>`}).join('');
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
   const nearest=Math.min(ahead?.gap??999,behind?.gap??999);result.className='pit-simulator-result '+(nearest<3?'dense':nearest>5?'good':'');result.innerHTML=`${front}<br>${rear}`;
  }
  analyzerRenderPitSimulator();
 }catch(error){if(status)status.textContent=`Simulation impossible : ${error.message}`;console.warn('[Velocity] Simulation arrêt',error)}
 finally{analyzerPitSimulationBusy=false;if(button){button.disabled=false;button.textContent='SIMULER UN ARRÊT'}}
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
 return `${value>=0?'+':''}${value.toFixed(3)}`;
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
function analyzerTeamKey(driver){return String(driver?.apex_row??driver?.driver??driver?.pos??'unknown')}
function analyzerLoad(){
 analyzerStorageCleanupOnce();
 try{analyzerRules={...ANALYZER_DEFAULT_RULES,...JSON.parse(localStorage.getItem(ANALYZER_RULES_KEY)||'{}')}}catch(_){analyzerRules={...ANALYZER_DEFAULT_RULES}}
 try{analyzerLearning={teams:{},startedAt:Date.now(),...JSON.parse(localStorage.getItem(ANALYZER_LEARNING_KEY)||'{}')}}catch(_){analyzerLearning={teams:{},startedAt:Date.now()}}
}
function analyzerSaveLearning(){analyzerLearning=analyzerStorageCompactLearning(analyzerLearning);analyzerStorageSafeSet(ANALYZER_LEARNING_KEY,JSON.stringify(analyzerLearning))}
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
 return {index:completed+1,startAt:now,lapSum:0,lapCount:0,laps:[],bestLaps:[],warmupSkipped:false,gridStartPace:gridReference,gridEndPace:gridReference,status:'active'};
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
 const previous=(history.relays||[]).slice().reverse().find(item=>Number.isFinite(item.average));
 const currentGrid=Number.isFinite(gridNow)?gridNow:(analyzerMedian(analyzerGridPace())||null);
 const previousGrid=Number(previous?.gridEndPace)||Number(previous?.gridStartPace);
 const rawGain=Number.isFinite(previous?.average)&&Number.isFinite(average)?previous.average-average:null;
 const gridGain=Number.isFinite(previousGrid)&&Number.isFinite(currentGrid)?previousGrid-currentGrid:0;
 const correctedGain=Number.isFinite(rawGain)?rawGain-gridGain:null;
 const laps=Number(relay?.lapCount)||0;
 return {driver,history,relay,average,best3,consistency,correctedGain,gridNow:currentGrid,previousAverage:previous?.average??null,laps,relayIndex:Number(relay?.index)||((history.relays||[]).length+1)};
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
function analyzerRelayMetrics(driver){
 const population=analyzerRelayPopulation();
 const sharedGrid=population[0]?.gridNow??analyzerMedian(analyzerGridPace());
 const raw=analyzerRelayRawMetrics(driver,sharedGrid);
 const eligible=population.length?population:[raw].filter(item=>Number.isFinite(item.average)&&item.laps>=3);
 const paceScore=analyzerPercentileScore(raw.average,eligible.map(item=>item.average));
 const transitionValues=eligible.map(item=>item.correctedGain).filter(Number.isFinite);
 const transitionScore=Number.isFinite(raw.correctedGain)&&transitionValues.length?analyzerPercentileScore(raw.correctedGain,transitionValues,{lowerIsBetter:false}):50;
 const potentialValues=eligible.map(item=>item.best3).filter(Number.isFinite);
 const potentialScore=Number.isFinite(raw.best3)&&potentialValues.length?analyzerPercentileScore(raw.best3,potentialValues):paceScore;
 const consistencyValues=eligible.map(item=>item.consistency).filter(Number.isFinite);
 const consistencyScore=Number.isFinite(raw.consistency)&&consistencyValues.length?analyzerPercentileScore(raw.consistency,consistencyValues):50;
 const lapValues=eligible.map(item=>item.laps).filter(Number.isFinite);
 const confidenceScore=lapValues.length?analyzerPercentileScore(raw.laps,lapValues,{lowerIsBetter:false}):50;
 const score=Math.round(paceScore*.50+transitionScore*.20+potentialScore*.15+consistencyScore*.10+confidenceScore*.05);
 let confidence=raw.laps<3?20:raw.laps<5?40:raw.laps<8?65:85;
 if(Number.isFinite(raw.correctedGain)&&Number.isFinite(raw.gridNow))confidence+=5;
 if(population.length>=6)confidence+=5;
 confidence=Math.min(95,confidence);
 return {...raw,score:Math.max(0,Math.min(100,score)),confidence,criteria:{pace:paceScore,transition:transitionScore,potential:potentialScore,consistency:consistencyScore,sample:confidenceScore},populationSize:eligible.length,status:raw.laps<3?'learning':'rated'};
}
function analyzerKartScore(driver){return analyzerRelayMetrics(driver).score}
function analyzerConfidence(driver){return analyzerRelayMetrics(driver).confidence}
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
 analyzerKartSort=value==='relay-end'?'relay-end':'none';
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

const analyzerFollowedDeltaHistory={driver:'',signature:null,ahead:null,behind:null,aheadTrend:'neutral',behindTrend:'neutral'};
function analyzerGapSeconds(value){
 const raw=String(value??'').trim().replace(',','.');
 if(!raw||raw==='—'||raw==='--'||/lap|tour/i.test(raw))return null;
 const match=raw.match(/-?\d+(?:\.\d+)?/);if(!match)return null;
 const n=Math.abs(Number(match[0]));return Number.isFinite(n)?n:null;
}
function analyzerSignedDelta(value,sign){
 const raw=String(value??'').trim();
 if(!raw||raw==='—'||raw==='--')return '—';
 if(/lap|tour/i.test(raw))return `${sign}${raw.replace(/^[+-]\s*/,'')}`;
 const seconds=analyzerGapSeconds(raw);return Number.isFinite(seconds)?`${sign}${seconds.toFixed(2)}`:'—';
}
function analyzerDeltaSignature(followed){
 if(!followed)return '';
 const lap=Number(followed.laps);
 const lapPart=Number.isFinite(lap)?String(lap):'';
 const lastPart=String(followed.last||followed.last_lap||'').trim();
 return `${lapPart}|${lastPart}`;
}
function analyzerFollowedNeighbors(followed){
 if(!followed)return {ahead:null,behind:null,aheadValue:null,behindValue:null,aheadText:'—',behindText:'—'};
 // Source unique avec les modes Focus Sprint / Endurance.
 const ahead=typeof sprintDriverAhead==='function'?sprintDriverAhead(followed):null;
 const behind=typeof sprintDriverBehind==='function'?sprintDriverBehind(followed):null;
 const lapDiffAhead=ahead?Math.max(0,(Number(ahead.laps)||0)-(Number(followed?.laps)||0)):0;
 const lapDiffBehind=behind?Math.max(0,(Number(followed?.laps)||0)-(Number(behind.laps)||0)):0;
 const aheadText=lapDiffAhead>=1?`-${lapDiffAhead} ${lapDiffAhead===1?'tour':'tours'}`:(ahead&&typeof sprintGapAhead==='function'?sprintGapAhead(followed):'—');
 const behindText=lapDiffBehind>=1?`+${lapDiffBehind} ${lapDiffBehind===1?'tour':'tours'}`:(behind&&typeof sprintGapBehind==='function'?sprintGapBehind(followed):'—');
 return {
  ahead,behind,
  aheadValue:ahead?analyzerGapSeconds(aheadText):null,
  behindValue:behind?analyzerGapSeconds(behindText):null,
  aheadText:aheadText&&aheadText!=='--'?aheadText:'—',
  behindText:behindText&&behindText!=='--'?behindText:'—'
 };
}
function analyzerUpdateFollowedDeltas(followed){
 const data=analyzerFollowedNeighbors(followed);
 if(!followed){Object.assign(analyzerFollowedDeltaHistory,{driver:'',signature:null,ahead:null,behind:null,aheadTrend:'neutral',behindTrend:'neutral'});return {...data,aheadTrend:'neutral',behindTrend:'neutral'}}
 const driverKey=String(followed.driver||state?.followed_driver||followed.pos||'');
 const signature=analyzerDeltaSignature(followed);
 if(analyzerFollowedDeltaHistory.driver!==driverKey){
  Object.assign(analyzerFollowedDeltaHistory,{driver:driverKey,signature,ahead:data.aheadValue,behind:data.behindValue,aheadTrend:'neutral',behindTrend:'neutral'});
 }else if(signature&&signature!==analyzerFollowedDeltaHistory.signature){
  const tolerance=.03;
  if(Number.isFinite(data.aheadValue)&&Number.isFinite(analyzerFollowedDeltaHistory.ahead)){
   analyzerFollowedDeltaHistory.aheadTrend=data.aheadValue<analyzerFollowedDeltaHistory.ahead-tolerance?'good':data.aheadValue>analyzerFollowedDeltaHistory.ahead+tolerance?'bad':'neutral';
  }
  if(Number.isFinite(data.behindValue)&&Number.isFinite(analyzerFollowedDeltaHistory.behind)){
   analyzerFollowedDeltaHistory.behindTrend=data.behindValue>analyzerFollowedDeltaHistory.behind+tolerance?'good':data.behindValue<analyzerFollowedDeltaHistory.behind-tolerance?'bad':'neutral';
  }
  analyzerFollowedDeltaHistory.signature=signature;
  if(Number.isFinite(data.aheadValue))analyzerFollowedDeltaHistory.ahead=data.aheadValue;
  if(Number.isFinite(data.behindValue))analyzerFollowedDeltaHistory.behind=data.behindValue;
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
function analyzerTrafficKey(driver){
 const kart=String(driver?.kart||driver?.kart_number||'').trim();
 return kart?`kart:${kart}`:`driver:${String(driver?.driver||driver?.team||driver?.pos||'unknown')}`;
}
function analyzerTrafficUpdateMotion(drivers){
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
 analyzerTrafficMotion.forEach((value,key)=>{if(!liveKeys.has(key)&&now-value.lastSeen>15000)analyzerTrafficMotion.delete(key)});
}
function analyzerTrafficPhase(driver,now){
 const motion=analyzerTrafficMotion.get(analyzerTrafficKey(driver));
 if(!motion||!motion.ready||!Number.isFinite(motion.lapSeconds)||motion.lapSeconds<=0)return null;
 const elapsed=Math.max(0,(now-motion.crossedAt)/1000);
 return (elapsed%motion.lapSeconds)/motion.lapSeconds;
}
function analyzerTrafficSignedGap(followed,driver,now){
 // Écart physique signé : négatif derrière, positif devant.
 // Ni le classement ni le nombre de tours ne servent de filtre.
 const followedPhase=analyzerTrafficPhase(followed,now),driverPhase=analyzerTrafficPhase(driver,now);
 if(Number.isFinite(followedPhase)&&Number.isFinite(driverPhase)){
  let fraction=driverPhase-followedPhase;
  if(fraction>.5)fraction-=1;
  else if(fraction<=-.5)fraction+=1;
  if(Math.abs(fraction)>.0005)return fraction*analyzerTrafficLapSeconds(followed);
 }
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
 const drivers=state.drivers||[],now=performance.now(),pace=analyzerMapPaceData(drivers);
 analyzerTrafficUpdateMotion(drivers);
 return drivers
  .filter(driver=>driver&&driver.driver!==followed.driver&&driver.status!=='pit')
  .map(driver=>({driver,gap:analyzerTrafficSignedGap(followed,driver,now),category:pace.map.get(driver)?.category||'slow',key:analyzerTrafficKey(driver)}))
  .filter(item=>Number.isFinite(item.gap)&&Math.abs(item.gap)>.02&&Math.abs(item.gap)<=ANALYZER_TRAFFIC_HYSTERESIS_SECONDS)
  .sort((a,b)=>a.gap-b.gap);
}
function analyzerRenderTrafficAhead(followed){
 const host=document.getElementById('analyzerTrafficDots');
 if(!host)return;
 const traffic=analyzerTrafficAround(followed),activeKeys=new Set();
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
  const left=Math.max(0,Math.min(100,50+item.gap*5));
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
function renderAnalyzer(){
 ensureAnalyzerWeather();
 if(!document.getElementById('analyzerTable'))return;
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
 document.getElementById('analyzerStopCadence').textContent=Number.isFinite(stops.cadence)?`1 / ${analyzerFormatDuration(stops.cadence)}`:'—';
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
 const marketByScore=all.map(x=>({...x,relayMetrics:analyzerRelayMetrics(x.driver)})).filter(x=>x.relayMetrics.laps>=3).sort((a,b)=>b.relayMetrics.score-a.relayMetrics.score).slice(0,10).map((x,index)=>({...x,kartiqTop:index+1,relayRemaining:analyzerKartRelayRemaining(x.driver)}));
 const market=analyzerKartSort==='relay-end'?marketByScore.slice().sort((a,b)=>{
  const av=Number.isFinite(a.relayRemaining)?a.relayRemaining:Number.POSITIVE_INFINITY;
  const bv=Number.isFinite(b.relayRemaining)?b.relayRemaining:Number.POSITIVE_INFINITY;
  return av-bv||a.kartiqTop-b.kartiqTop;
 }):marketByScore;
 const kartSortSelect=document.getElementById('analyzerKartSort');if(kartSortSelect)kartSortSelect.value=analyzerKartSort;
 document.getElementById('analyzerKartMarket').innerHTML=market.length?`<table class="analyzer-kartiq-table"><thead><tr><th>TOP</th><th>POS</th><th>KART</th><th>ÉQUIPE / PILOTE</th><th>SCORE</th><th>ÉVOL.</th><th>T.MOYEN</th><th>Δ</th><th>R</th><th>FIN RELAIS</th><th>TOURS</th><th>ANALYSE</th></tr></thead><tbody>${market.map(x=>{const d=x.driver,m=x.relayMetrics,evolution=analyzerKartEvolution(d,m),kart=validKartNumber(d)||d.apex||'—',deltaClass=Number.isFinite(m.correctedGain)?(m.correctedGain>0?'positive':m.correctedGain<0?'negative':'neutral'):'neutral',remainingClass=analyzerKartRelayRemainingClass(x.relayRemaining),deadline=Number.isFinite(x.relayRemaining)?Date.now()+x.relayRemaining*1000:null;return `<tr onclick="followDriver(${JSON.stringify(d.driver).replace(/"/g,'&quot;')})"><td class="kartiq-top">${x.kartiqTop}</td><td class="kartiq-pos">${analyzerEscape(d.pos||'—')}</td><td class="kartiq-kart">${analyzerEscape(kart)}</td><td class="kartiq-team" title="${analyzerEscape(d.driver)}">${analyzerEscape(d.driver)}</td><td class="kartiq-score ${analyzerScoreClass(m.score)}">${m.score}</td><td class="kartiq-evolution ${evolution.className}" title="${analyzerEscape(evolution.title)}">${analyzerEscape(evolution.label)}</td><td class="kartiq-average">${Number.isFinite(m.average)?analyzerEscape(formatApexMilliseconds(m.average*1000)):'—'}</td><td class="kartiq-delta ${deltaClass}" title="Gain corrigé par l'évolution du plateau">${analyzerEscape(analyzerKartDeltaLabel(m.correctedGain))}</td><td>${m.relayIndex}</td><td class="kartiq-relay-end ${remainingClass}"${deadline?` data-kartiq-relay-end="${deadline}"`:''}>${analyzerEscape(analyzerKartRelayRemainingLabel(x.relayRemaining))}</td><td>${m.laps}</td><td class="kartiq-analysis">${m.confidence}%</td></tr>`}).join('')}</tbody></table>`:`<div class="analyzer-empty">${analyzerRelayHydrationLoading?'Reconstitution des relais en cours depuis STATS…':'Au moins 3 tours propres sont nécessaires pour évaluer un relais.'}</div>`;
 analyzerRefreshKartRelayCountdowns();
 const wave=all.filter(x=>Number.isFinite(x.forecast.seconds)&&x.forecast.seconds<=600&&x.driver.status!=='pit');
 document.getElementById('analyzerTable').innerHTML=sorted.map(x=>{
  const d=x.driver;const isFollowed=d.driver===state.followed_driver;const penalty=d.penalty||'—';const isVirtual=analyzerRankingMode==='virtual';
  const relayTimer=analyzerRelayTimer(d),stintAverage=analyzerCurrentStintAverage(d),virtual=x.virtual;
  const displayPos=isVirtual?virtual.position:d.pos;
  const stopsValue=isVirtual?`${analyzerEscape(d.pit_stops??0)}${virtual.missing?`<small class="virtual-stop-add">+${virtual.missing} virtuel${virtual.missing>1?'s':''}</small>`:''}`:analyzerEscape(d.pit_stops??'—');
  const gapValue=isVirtual?(virtual.position===1?'—':`+${analyzerFormatDuration(virtual.gap)}`):analyzerEscape(d.gap);
  const virtualInfo=isVirtual&&virtual.missing?`<small class="virtual-time-add" title="Moyenne ${virtual.pitAverage.samples||0} arrêt(s)">+${analyzerFormatDuration(virtual.extra)}${virtual.pitAverage.estimated?' estimé':''}</small>`:'';
  return `<tr class="${isFollowed?'followed':''}${isVirtual?' virtual-ranking-row':''}" onclick="followDriver(${JSON.stringify(d.driver).replace(/"/g,'&quot;')})"><td class="a-pos">${analyzerEscape(displayPos)}${isVirtual&&Number(d.pos)!==displayPos?`<small class="virtual-real-pos">réel P${analyzerEscape(d.pos)}</small>`:''}</td><td class="a-pit-indicator">${analyzerPitIndicator(d)}</td><td>${analyzerEscape(validKartNumber(d)||d.apex||'—')}</td><td class="a-team" title="${analyzerEscape(d.driver)}">${analyzerEscape(d.driver)}${virtualInfo}</td><td><button type="button" class="analyzer-laps-btn" onclick="event.stopPropagation();openApexTeamLaps(${Number(d.apex_row)||0})">STATS</button></td><td>${analyzerEscape(d.laps)}</td><td class="a-track${relayTimer.inPit?' pit-time-blue':''}">${analyzerEscape(relayTimer.value)}</td><td>${stopsValue}</td><td class="${lapTimeClass(d,d.last,'last')}">${analyzerEscape(d.last)}</td><td class="${lapTimeClass(d,d.best,'best')}">${analyzerEscape(d.best)}</td><td class="a-average">${stintAverage?analyzerEscape(formatApexMilliseconds(stintAverage*1000)):'—'}</td><td class="${isVirtual?'virtual-gap':''}">${gapValue}</td><td class="red">${analyzerEscape(penalty)}</td><td class="a-forecast">${d.status==='pit'?'IN':analyzerEscape(x.forecast.label)}</td><td title="${analyzerEscape(analyzerSpotterStatusLabel(analyzerSpotterAssignmentForTeam(d.driver)))}">${analyzerEscape(analyzerSpotterKvLabel(d.driver,x.history.virtualKart))}</td><td class="a-note ${analyzerScoreClass(x.score)}">${x.score}</td></tr>`;
 }).join('');
 analyzerRenderPitSimulator();
 renderAnalyzerQueueAdvice();
 analyzerRenderSpotterSync();
 analyzerRenderSpotterCards();
}

// V7.2 — état partagé par le module Spotter. Velocity reste l'unique source
// des scores et de la confiance ; Spotter partage uniquement le KV et son état FIFO.
function analyzerSpotterState(){return state?.spotter&&typeof state.spotter==='object'?state.spotter:null}
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
    ?items.map(item=>typeof spotterQueueCard==='function'?spotterQueueCard(item):'').join('')
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
function resetAnalyzerLearning(){if(!window.confirm('Effacer l’historique des relais et les karts virtuels appris par Analyzer ?'))return;analyzerLearning={teams:{},startedAt:Date.now()};analyzerSaveLearning();analyzerSaveSession('learning-reset');renderAnalyzer()}



/* V6.3.1 — Consultation des tours et anciennes sessions Apex */
let apexPreviousSessions=[];
let apexHistorySelectedRowId=null;
let apexHistorySelectedSession='';
let apexHistoricalTeams=[];

function apexHistoryCircuitId(){return String(state?.circuit_id||'')}
async function apexHistoryRequest(command){
 const response=await fetch('/api/apex/history',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({circuit_id:apexHistoryCircuitId(),request:command})});
 const data=await response.json().catch(()=>({ok:false,error:'Réponse Apex illisible'}));
 if(!response.ok||!data.ok)throw new Error(data.error||`Erreur Apex ${response.status}`);
 return String(data.raw||'');
}
function openApexHistory(){
 document.getElementById('apexHistoryModal')?.classList.add('show');
 showApexHistoryPanel('sessions');
 if(!apexPreviousSessions.length)loadApexPreviousSessions();
}
function closeApexHistory(){document.getElementById('apexHistoryModal')?.classList.remove('show')}
function showApexHistoryPanel(panel){
 const sessions=panel==='sessions',laps=panel==='laps',pits=panel==='pits';
 document.getElementById('apexHistorySessionsPanel')?.classList.toggle('active',sessions);
 document.getElementById('apexHistoryLapsPanel')?.classList.toggle('active',laps);
 document.getElementById('apexHistoryPitsPanel')?.classList.toggle('active',pits);
 document.getElementById('apexHistorySessionsTab')?.classList.toggle('active',sessions);
 document.getElementById('apexHistoryLapsTab')?.classList.toggle('active',laps);
 document.getElementById('apexHistoryPitsTab')?.classList.toggle('active',pits);
 if(pits&&apexHistorySelectedRowId)reloadApexTeamPits();
}
function parseApexPreviousSessions(raw){
 return String(raw||'').split(/\r?\n/).map(line=>line.trim()).filter(Boolean).map(line=>{
  const parts=line.split('#');return {id:String(parts.shift()||'').trim(),name:parts.join('#').trim()};
 }).filter(item=>item.id&&item.name&&!/^error$/i.test(item.id));
}
async function loadApexPreviousSessions(){
 const status=document.getElementById('apexHistorySessionsStatus'),host=document.getElementById('apexHistorySessionsList');
 if(status)status.textContent='Interrogation d’Apex…';if(host)host.innerHTML='<div class="analyzer-empty">Chargement…</div>';
 try{
  apexPreviousSessions=parseApexPreviousSessions(await apexHistoryRequest('S#'));
  if(status)status.textContent=apexPreviousSessions.length?`${apexPreviousSessions.length} session(s) disponible(s).`:'Aucune ancienne session disponible.';
  if(host)host.innerHTML=apexPreviousSessions.length?apexPreviousSessions.map(session=>`<button type="button" class="apex-history-session-row" onclick="selectApexPreviousSession('${analyzerEscape(session.id)}')"><span>${analyzerEscape(session.name)}</span><small>ID ${analyzerEscape(session.id)}</small><b>CONSULTER</b></button>`).join(''):'<div class="analyzer-empty">Aucun historique Apex pour le moment.</div>';
  refreshApexHistorySessionSelect();
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
 else document.getElementById('apexHistoryLapsStatus').textContent='Sélectionnez une équipe de cette session ci-dessus.';
}
function openApexTeamLaps(rowId){
 if(!rowId){window.alert('Identifiant Apex de cette équipe indisponible.');return}
 apexHistorySelectedRowId=Number(rowId);
 const driver=(state.drivers||[]).find(d=>Number(d.apex_row)===apexHistorySelectedRowId);
 document.getElementById('apexHistoryModal')?.classList.add('show');showApexHistoryPanel('laps');refreshApexHistorySessionSelect();
 const teamName=driver?.driver||`Équipe ${rowId}`,teamKart=`KART ${validKartNumber(driver)||driver?.apex||'—'}`;
 document.getElementById('apexHistoryTeamName').textContent=teamName;document.getElementById('apexHistoryTeamKart').textContent=teamKart;
 document.getElementById('apexHistoryPitsTeamName').textContent=teamName;document.getElementById('apexHistoryPitsTeamKart').textContent=teamKart;
 reloadApexTeamLaps();
}
async function reloadApexTeamLaps(){
 const select=document.getElementById('apexHistorySessionSelect'),nextSession=String(select?.value||'');
 if(nextSession!==apexHistorySelectedSession){apexHistorySelectedSession=nextSession;if(nextSession)await loadApexHistoricalTeams(nextSession);else{apexHistoricalTeams=[];renderApexHistoricalTeams()}}
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
function setApexHistoryTeamHeader(team){const name=team?.name||'Équipe',kart=`KART ${team?.kart||'—'}`;document.getElementById('apexHistoryTeamName').textContent=name;document.getElementById('apexHistoryTeamKart').textContent=kart;document.getElementById('apexHistoryPitsTeamName').textContent=name;document.getElementById('apexHistoryPitsTeamKart').textContent=kart}
function openApexHistoricalTeam(rowId,name,kart){apexHistorySelectedRowId=Number(rowId);setApexHistoryTeamHeader({name:decodeURIComponent(name),kart:decodeURIComponent(kart)});reloadApexTeamLaps()}

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
 const text=String(value??'').trim();
 if(!text||text==='—')return 0;
 // Les durées Apex sont transmises sous forme de secondes décimales
 // (ex. 12693.327) ou parfois déjà en millisecondes entières.
 if(/^[-+]?\d+\.\d+$/.test(text)){
  const seconds=Number(text);return Number.isFinite(seconds)&&seconds>0?Math.round(seconds*1000):0;
 }
 const numeric=Number(text.replace(/[^0-9-]/g,''));
 return Number.isFinite(numeric)&&numeric>0?numeric:0;
}
function apexPitProtocolLap(value){
 const text=String(value??'').trim();if(!text)return 0;
 // Apex encode le tour comme une petite valeur décimale : 0.174 = tour 174.
 if(/^[-+]?0?\.\d+$/.test(text)){
  const lap=Math.round(Number(text)*1000);return Number.isFinite(lap)&&lap>0?lap:0;
 }
 return apexProtocolNumber(text);
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
 // Format réellement livré par Apex :
 // D<équipe>.P<index>#<arrêt>|<tour encodé>|<entrée stands absolue>|<sortie stands absolue>
 const stop=apexProtocolNumber(fields[0])||markerStop;
 return {
  stop,
  lap:apexPitProtocolLap(fields[1]),
  pitInMs:apexPitProtocolMilliseconds(fields[2]),
  pitOutMs:apexPitProtocolMilliseconds(fields[3])
 };
}
function parseApexPitData(raw,rowId){
 const byStop=new Map();
 for(const line of String(raw||'').split(/\r?\n/)){const pit=parseApexPitLine(line,rowId);if(pit)byStop.set(pit.stop,pit)}
 const chronological=[...byStop.values()].sort((a,b)=>a.stop-b.stop);
 chronological.forEach((pit,index)=>{
  const previous=chronological[index-1];
  pit.hour=formatApexPitClock(pit.pitInMs);
  pit.onTrack=formatApexPitClock(Math.max(0,pit.pitInMs-(previous?.pitOutMs||0)));
  pit.pitTime=pit.pitOutMs>pit.pitInMs?formatApexPitDuration(pit.pitOutMs-pit.pitInMs):'—';
 });
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
  latestLap:lapNumbers.length?Math.max(...lapNumbers):startLap
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
  let values=laps.filter(l=>l.lap>boundaries[i]&&l.lap<boundaries[i+1]);
  if(values.length>1)values=values.slice(1);
  if(!values.length)continue;
  const sec=values.map(l=>l.seconds);
  relays.push({index:i+1,from:values[0].lap,to:values[values.length-1].lap,laps:values.length,best:Math.min(...sec),average:analyzerDebriefAverage(sec),median:analyzerDebriefMedian(sec),std:analyzerDebriefStd(sec)});
 }
 return relays;
}
async function analyzerDebriefLoadTeam(driver){
 const rowId=Number(driver?.apex_row)||0;if(!rowId)throw new Error(`Identifiant STATS indisponible pour ${driver?.driver||'une équipe'}`);
 const [laps,pits]=await Promise.all([fetchAllApexTeamLaps(rowId,'',null),fetchAllApexTeamPits(rowId,'',null).catch(()=>[])]);
 const clean=analyzerDebriefCleanLaps(laps,pits),seconds=clean.map(l=>l.seconds),pitDurations=(pits||[]).map(p=>Math.max(0,(p.pitOutMs||0)-(p.pitInMs||0))/1000).filter(v=>v>0);
 return {driver,name:driver.driver||`Équipe ${rowId}`,position:Number(driver.pos)||999,laps,pits,clean,relays:analyzerDebriefRelays(clean,pits),best:seconds.length?Math.min(...seconds):NaN,average:analyzerDebriefAverage(seconds),median:analyzerDebriefMedian(seconds),std:analyzerDebriefStd(seconds),pitAverage:analyzerDebriefAverage(pitDurations),pitStd:analyzerDebriefStd(pitDurations),pitCount:pits.length};
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
function renderAnalyzerDebrief(team,all){
 const host=document.getElementById('analyzerDebriefContent'),status=document.getElementById('analyzerDebriefStatus'),pdfButton=document.getElementById('analyzerDebriefPdfButton');if(!host)return;
 const n=all.length,paceRank=analyzerDebriefRank(all,'average',team.average),bestRank=analyzerDebriefRank(all,'best',team.best),consistencyRank=analyzerDebriefRank(all,'std',team.std),pitRank=analyzerDebriefRank(all,'pitAverage',team.pitAverage);
 const ranking=all.slice().sort((a,b)=>(a.average||999)-(b.average||999));
 analyzerDebriefReport={team,all,ranking,generatedAt:new Date(),isIntermediate:analyzerDebriefIsIntermediate(),circuit:analyzerWeatherData?.circuit_name||analyzerWeatherData?.location?.name||analyzerSessionCircuitName()||''};
 if(status){status.classList.add('ready');status.style.display='none'}
 if(pdfButton)pdfButton.disabled=false;
 host.innerHTML=`
  <section class="debrief-hero">
   <div class="debrief-card debrief-team"><span>Équipe suivie</span><strong>${analyzerEscape(team.name)}</strong><small class="debrief-pill">Débrief ${analyzerDebriefReport.isIntermediate?'intermédiaire':'final'}</small>${analyzerDebriefReport.circuit?`<small class="debrief-track">Piste : ${analyzerEscape(analyzerDebriefReport.circuit)}</small>`:''}</div>
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
  <section class="debrief-section"><h3>ANALYSE DES RELAIS TERMINÉS / EN COURS</h3><div class="debrief-table-wrap"><table class="debrief-table"><thead><tr><th>RELAIS</th><th>TOURS</th><th>POS. RELAIS</th><th>FENÊTRE</th><th>MEILLEUR</th><th>MOYENNE</th><th>CONSTANCE</th></tr></thead><tbody>${team.relays.map(r=>{const comparison=analyzerDebriefRelayComparison(r,team,all);return `<tr><td>R${r.index}</td><td>${r.laps}</td><td><strong class="debrief-relay-position">${analyzerDebriefRelayPosition(comparison.rank,comparison.total)}</strong></td><td>${r.from} → ${r.to}</td><td>${analyzerDebriefFmtSeconds(r.best)}</td><td>${analyzerDebriefFmtSeconds(r.average)}</td><td class="${analyzerDebriefConstanceClass(comparison.constance)}" title="Écart entre la moyenne et le meilleur tour du relais">${analyzerDebriefFmtConstance(comparison.constance)}</td></tr>`}).join('')||'<tr><td colspan="7">Aucun relais exploitable pour le moment.</td></tr>'}</tbody></table></div><p class="debrief-table-note"><strong>POS. RELAIS</strong> classe le rythme moyen de l’équipe face aux équipes disposant d’au moins deux tours exploitables sur la même fenêtre de course. <strong>Constance</strong> correspond à l’écart entre la moyenne et le meilleur tour : plus l’écart est faible, plus le relais est régulier.</p></section>
  <section class="debrief-section"><h3>ARRÊTS AUX STANDS</h3><div class="debrief-grid"><div class="debrief-metric"><span>Nombre</span><b>${team.pitCount}</b></div><div class="debrief-metric"><span>Temps moyen</span><b>${analyzerDebriefFmtPit(team.pitAverage)}</b></div><div class="debrief-metric"><span>Dispersion</span><b>${Number.isFinite(team.pitStd)?team.pitStd.toFixed(3)+' s':'—'}</b></div><div class="debrief-metric"><span>Rang plateau</span><b>${team.pitCount?analyzerDebriefOrdinal(pitRank,n):'—'}</b></div></div></section>
  <section class="debrief-section"><h3>CLASSEMENT DU RYTHME MOYEN</h3><div class="debrief-table-wrap"><table class="debrief-table"><thead><tr><th>RANG</th><th>ÉQUIPE</th><th>MOYENNE</th><th>MEILLEUR</th><th>RÉGULARITÉ</th><th>PITS</th><th>MOY. PIT</th></tr></thead><tbody>${ranking.map((x,i)=>`<tr class="${x===team?'debrief-followed-row':''}"><td>${i+1}</td><td>${analyzerEscape(x.name)}</td><td>${analyzerDebriefFmtSeconds(x.average)}</td><td>${analyzerDebriefFmtSeconds(x.best)}</td><td>${analyzerDebriefRegularityLabel(x.std)}</td><td>${x.pitCount}</td><td>${analyzerDebriefFmtPit(x.pitAverage)}</td></tr>`).join('')}</tbody></table></div></section>
  <section class="debrief-section"><h3>CONCLUSION</h3><div class="debrief-verdict">${analyzerDebriefVerdict(team,all)}</div></section>`;
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
  let page=analyzerDebriefPdfCreatePage();analyzerDebriefPdfHeader(page,report,report.isIntermediate?'DÉBRIEF INTERMÉDIAIRE':'DÉBRIEF FINAL',`Rapport généré par votre Master Chef 🧑🏾‍🍳 le ${report.generatedAt.toLocaleString('fr-FR')}`);analyzerDebriefPdfMetricGrid(page,[{label:'Rythme moyen',value:analyzerDebriefFmtSeconds(team.average)},{label:'Meilleur tour',value:analyzerDebriefFmtSeconds(team.best)},{label:'Régularité',value:analyzerDebriefRegularityLabel(team.std)},{label:'Arrêts',value:team.pitCount},{label:'Vitesse pure',value:analyzerDebriefOrdinal(bestRank,n)},{label:'Rythme moyen',value:analyzerDebriefOrdinal(paceRank,n)},{label:'Régularité',value:analyzerDebriefOrdinal(consistencyRank,n)},{label:'Stands',value:team.pitCount?analyzerDebriefOrdinal(pitRank,n):'—'}]);analyzerDebriefPdfSection(page,'SYNTHÈSE');analyzerDebriefPdfParagraph(page,analyzerDebriefVerdictText(team,all));pages.push(page);
  const relayRows=team.relays.map(r=>{const c=analyzerDebriefRelayComparison(r,team,all);return [`R${r.index}`,r.laps,analyzerDebriefRelayPosition(c.rank,c.total),`${r.from}-${r.to}`,analyzerDebriefFmtSeconds(r.best),analyzerDebriefFmtSeconds(r.average),analyzerDebriefFmtConstance(c.constance)]});
  for(let i=0;i<Math.max(1,Math.ceil(relayRows.length/18));i++){page=analyzerDebriefPdfCreatePage();analyzerDebriefPdfHeader(page,report,'ANALYSE DES RELAIS',relayRows.length?`Relais ${i*18+1} à ${Math.min(relayRows.length,(i+1)*18)}`:'Aucun relais exploitable');analyzerDebriefPdfTable(page,['RELAIS','TOURS','POS.','FENÊTRE','MEILLEUR','MOYENNE','CONSTANCE'],relayRows.slice(i*18,(i+1)*18),[105,100,120,140,180,180,190]);pages.push(page)}
  const rankRows=report.ranking.map((x,i)=>[i+1,x.name,analyzerDebriefFmtSeconds(x.average),analyzerDebriefFmtSeconds(x.best),analyzerDebriefRegularityLabel(x.std),x.pitCount,analyzerDebriefFmtPit(x.pitAverage)]);
  for(let i=0;i<Math.max(1,Math.ceil(rankRows.length/20));i++){page=analyzerDebriefPdfCreatePage();analyzerDebriefPdfHeader(page,report,'COMPARAISON DU PLATEAU',`Classement du rythme moyen — ${n} équipes analysées`);if(i===0){analyzerDebriefPdfSection(page,'ARRÊTS AUX STANDS');analyzerDebriefPdfMetricGrid(page,[{label:'Nombre',value:team.pitCount},{label:'Temps moyen',value:analyzerDebriefFmtPit(team.pitAverage)},{label:'Dispersion',value:Number.isFinite(team.pitStd)?team.pitStd.toFixed(3)+' s':'—'},{label:'Rang plateau',value:team.pitCount?analyzerDebriefOrdinal(pitRank,n):'—'}]);analyzerDebriefPdfSection(page,'RYTHME MOYEN')}analyzerDebriefPdfTable(page,['RANG','ÉQUIPE','MOYENNE','MEILLEUR','RÉGULARITÉ','PITS','MOY. PIT'],rankRows.slice(i*20,(i+1)*20),[80,310,150,150,190,80,140],44);pages.push(page)}
  pages.forEach((p,i)=>analyzerDebriefPdfFooter(p,i+1,pages.length));
  const jpegs=pages.map(({canvas})=>{const url=canvas.toDataURL('image/jpeg',.92);return {width:canvas.width,height:canvas.height,bytes:analyzerDebriefPdfDataUrlBytes(url)}}),pdf=analyzerDebriefPdfBuild(jpegs),blob=new Blob([pdf],{type:'application/pdf'}),url=URL.createObjectURL(blob),anchor=document.createElement('a');anchor.href=url;anchor.download=`Debrief_${analyzerDebriefPdfSafeName(team.name)}_${new Date().toISOString().slice(0,10)}.pdf`;document.body.appendChild(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
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
window.velocityEnduranceTest={active:false,timer:null,backup:null,startedAt:0,simulatedMs:0,durationMs:0,speed:60,teams:40,laps:0,updates:0,stops:0,reconnectAttempts:0,reconnectSuccess:0,reconnectFailures:0,networkCuts:0,networkConnected:true,networkCutStartedAt:0,networkRestoreTimer:null,nextCutAtMs:Infinity,incidentFrequency:'30',incidentDurationSec:15,totalDowntimeMs:0,maxDowntimeMs:0,lastDowntimeMs:0,errors:[],log:[],drivers:[]};
function analyzerTestFormatDuration(ms){const total=Math.max(0,Math.floor(ms/1000)),h=Math.floor(total/3600),m=Math.floor(total%3600/60),s=total%60;return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`}
function analyzerTestLog(message,type='info'){const t=window.velocityEnduranceTest,entry={at:new Date().toISOString(),simulatedMs:t.simulatedMs,message:String(message),type};t.log.unshift(entry);if(t.log.length>500)t.log.length=500;const host=document.getElementById('analyzerTestLog');if(host)host.innerHTML=t.log.slice(0,120).map(x=>`<div class="${x.type}"><time>${new Date(x.at).toLocaleTimeString('fr-FR')}</time>${analyzerEscape(x.message)}</div>`).join('')}
function openAnalyzerEnduranceTest(){document.getElementById('analyzerEnduranceTestModal')?.classList.add('show');analyzerTestRefreshDashboard()}
function closeAnalyzerEnduranceTest(){document.getElementById('analyzerEnduranceTestModal')?.classList.remove('show')}
function analyzerTestDriver(index){const lap=54+(index%11)*.17;return {pos:index+1,apex:index+1,apex_row:index+1,kart:String(10+index),driver:`ÉQUIPE TEST ${String(index+1).padStart(2,'0')}`,pilot:`PILOTE ${index+1}`,laps:0,last:formatApexMilliseconds(lap*1000),best:formatApexMilliseconds((lap-.25)*1000),gap:index?`+${(index*.42).toFixed(3)}`:'—',interval:index?`+${(.25+(index%5)*.08).toFixed(3)}`:'—',pit_stops:0,status:'track',penalty:'—',track_time:'00:00',on_track:'00:00',average_lap:lap,lap_times:[],current_stint_laps:[],stints:[],pit_history:[]}}
function analyzerTestBuildState(){const t=window.velocityEnduranceTest;return {...(t.backup||{}),version:'7.2.65 TEST',connection:t.networkConnected?'TEST CONNECTÉ':'TEST COUPÉ',connected:t.networkConnected,circuit_id:'velocity-test-endurance',followed_driver:t.drivers[0]?.driver||'',drivers:t.drivers,time_remaining:analyzerTestFormatDuration(Math.max(0,t.durationMs-t.simulatedMs)),time_remaining_ms:Math.max(0,t.durationMs-t.simulatedMs),live:{status:t.networkConnected?'test':'reconnecting',messages:t.updates,parsed_updates:t.updates,last_message_at:new Date().toISOString()},spotter:{configured:false,queue:[],maintenance:[],incoming:[]}}}
function analyzerTestNextCutDelayMs(){const t=window.velocityEnduranceTest;if(t.incidentFrequency==='random')return (20+Math.random()*70)*60000;return Math.max(1,Number(t.incidentFrequency)||30)*60000}
function analyzerTestScheduleNextCut(){const t=window.velocityEnduranceTest;t.nextCutAtMs=t.simulatedMs+analyzerTestNextCutDelayMs();analyzerTestLog(`Prochaine coupure prévue vers ${analyzerTestFormatDuration(t.nextCutAtMs)} simulées.`)}
function analyzerTestStartNetworkCut(source='automatique'){const t=window.velocityEnduranceTest;if(!t.active||!t.networkConnected)return false;t.networkConnected=false;t.networkCuts++;t.reconnectAttempts++;t.networkCutStartedAt=Date.now();analyzerTestLog(`Coupure réseau ${source} déclenchée (${t.incidentDurationSec} s).`,'warning');state=analyzerTestBuildState();render();analyzerTestRefreshDashboard();clearTimeout(t.networkRestoreTimer);t.networkRestoreTimer=setTimeout(()=>analyzerTestRestoreNetwork(),Math.max(1000,t.incidentDurationSec*1000));return true}
function analyzerTestRestoreNetwork(){const t=window.velocityEnduranceTest;if(!t.active||t.networkConnected)return;const downtime=Date.now()-t.networkCutStartedAt;t.lastDowntimeMs=downtime;t.totalDowntimeMs+=downtime;t.maxDowntimeMs=Math.max(t.maxDowntimeMs,downtime);t.networkConnected=true;t.reconnectSuccess++;analyzerTestLog(`Reconnexion simulée réussie après ${(downtime/1000).toFixed(1)} s.`,'success');analyzerTestScheduleNextCut();state=analyzerTestBuildState();render();analyzerTestRefreshDashboard()}
function forceAnalyzerTestNetworkCut(){const t=window.velocityEnduranceTest;if(!t.active){analyzerTestLog('Impossible : démarrez d’abord le test.','warning');return}if(!document.getElementById('analyzerTestIncidents')?.checked){analyzerTestLog('Activez « Coupures et reprises simulées » pour tester le réseau.','warning');return}if(!analyzerTestStartNetworkCut('forcée'))analyzerTestLog('Une coupure est déjà en cours.','warning')}
function startAnalyzerEnduranceTest(){const t=window.velocityEnduranceTest;if(t.active)return;t.backup=JSON.parse(JSON.stringify(state||{}));t.speed=Math.max(1,Number(document.getElementById('analyzerTestSpeed')?.value)||60);t.teams=Math.max(10,Number(document.getElementById('analyzerTestTeams')?.value)||40);const hours=Number(document.getElementById('analyzerTestDuration')?.value);t.durationMs=hours>0?hours*3600000:0;t.startedAt=Date.now();t.simulatedMs=0;t.laps=0;t.updates=0;t.stops=0;t.reconnectAttempts=0;t.reconnectSuccess=0;t.reconnectFailures=0;t.networkCuts=0;t.networkConnected=true;t.networkCutStartedAt=0;t.totalDowntimeMs=0;t.maxDowntimeMs=0;t.lastDowntimeMs=0;t.incidentFrequency=String(document.getElementById('analyzerTestIncidentFrequency')?.value||'30');t.incidentDurationSec=Math.max(1,Number(document.getElementById('analyzerTestIncidentDuration')?.value)||15);t.errors=[];t.log=[];t.drivers=Array.from({length:t.teams},(_,i)=>analyzerTestDriver(i));t.active=true;document.getElementById('analyzerTestConfiguration').hidden=true;document.getElementById('analyzerTestDashboard').hidden=false;analyzerTestLog(`Test démarré : ${t.teams} équipes, vitesse ×${t.speed}, durée ${hours||'illimitée'} h.`);if(document.getElementById('analyzerTestIncidents')?.checked)analyzerTestScheduleNextCut();else t.nextCutAtMs=Infinity;state=analyzerTestBuildState();render();t.timer=setInterval(analyzerTestTick,1000);analyzerTestRefreshDashboard()}
function analyzerTestTick(){const t=window.velocityEnduranceTest;if(!t.active)return;const step=1000*t.speed;t.simulatedMs+=step;t.updates+=1;const pits=Boolean(document.getElementById('analyzerTestPits')?.checked),penalties=Boolean(document.getElementById('analyzerTestPenalties')?.checked),incidents=Boolean(document.getElementById('analyzerTestIncidents')?.checked);if(incidents&&t.networkConnected&&t.simulatedMs>=t.nextCutAtMs)analyzerTestStartNetworkCut('automatique');if(t.networkConnected){t.drivers.forEach((d,i)=>{const lapSeconds=54+(i%11)*.17+Math.sin((t.simulatedMs/60000)+i)*.12;const previousLaps=d.laps||0,newLaps=Math.floor(t.simulatedMs/(lapSeconds*1000));if(newLaps>previousLaps){for(let n=previousLaps;n<newLaps;n++){const value=lapSeconds+(Math.random()-.5)*.35;d.lap_times.push(value);d.current_stint_laps.push(value);if(d.lap_times.length>2200)d.lap_times.splice(0,d.lap_times.length-2200);if(d.current_stint_laps.length>80)d.current_stint_laps.shift();t.laps++}d.laps=newLaps;d.last=formatApexMilliseconds(d.lap_times.at(-1)*1000);const best=Math.min(...d.lap_times);d.best=formatApexMilliseconds(best*1000);d.average_lap=d.current_stint_laps.reduce((a,b)=>a+b,0)/d.current_stint_laps.length}d.track_time=analyzerTestFormatDuration(t.simulatedMs);d.on_track=d.track_time;if(pits&&t.simulatedMs>0&&Math.floor(t.simulatedMs/1800000)>d.pit_stops+(i%3)){d.pit_stops++;d.status='pit';d.pit_history.push({lap:d.laps,duration:150+(i%20)});d.current_stint_laps=[];t.stops++;setTimeout(()=>{if(t.active)d.status='track'},Math.max(80,250/t.speed))}if(penalties&&t.updates%900===0&&i===t.updates/900%t.teams)d.penalty='5 s'});t.drivers.sort((a,b)=>(b.laps-a.laps)||((a.average_lap||999)-(b.average_lap||999))).forEach((d,i)=>{d.pos=i+1;d.gap=i?`+${((i*.37)+(t.simulatedMs/3600000)*(i*.02)).toFixed(3)}`:'—'})}state=analyzerTestBuildState();render();analyzerTestRefreshDashboard();if(t.durationMs&&t.simulatedMs>=t.durationMs){analyzerTestLog('Durée cible atteinte. Test terminé.');stopAnalyzerEnduranceTest(false)}}
function analyzerTestRefreshDashboard(){const t=window.velocityEnduranceTest;const set=(id,value)=>{const el=document.getElementById(id);if(el)el.textContent=value};set('analyzerTestElapsed',analyzerTestFormatDuration(t.simulatedMs));set('analyzerTestRealElapsed',t.startedAt?analyzerTestFormatDuration(Date.now()-t.startedAt):'00:00:00');set('analyzerTestLaps',t.laps.toLocaleString('fr-FR'));set('analyzerTestUpdates',t.updates.toLocaleString('fr-FR'));set('analyzerTestStops',t.stops.toLocaleString('fr-FR'));set('analyzerTestCuts',String(t.networkCuts));set('analyzerTestReconnects',`${t.reconnectSuccess}/${t.reconnectAttempts}`);set('analyzerTestNetworkState',t.networkConnected?'CONNECTÉ':'COUPURE EN COURS');set('analyzerTestErrors',String(t.errors.length));const mem=performance?.memory?.usedJSHeapSize;set('analyzerTestMemory',Number.isFinite(mem)?`${Math.round(mem/1048576)} Mo`:'Indisponible');const progress=t.durationMs?Math.min(100,t.simulatedMs/t.durationMs*100):0;set('analyzerTestProgress',t.durationMs?`${progress.toFixed(1)} %`:'ILLIMITÉ');const row=document.querySelector('.analyzer-test-status-row'),stateEl=document.getElementById('analyzerTestState');if(row){row.classList.toggle('error',t.errors.length>0);row.classList.toggle('warning',!t.networkConnected)}if(stateEl)stateEl.textContent=t.errors.length?'● ERREURS DÉTECTÉES':(!t.networkConnected?'● RECONNEXION EN COURS':'● STABLE')}
function stopAnalyzerEnduranceTest(manual=true){const t=window.velocityEnduranceTest;if(!t.active)return;clearInterval(t.timer);clearTimeout(t.networkRestoreTimer);t.timer=null;t.networkRestoreTimer=null;if(!t.networkConnected){const downtime=Date.now()-t.networkCutStartedAt;t.lastDowntimeMs=downtime;t.totalDowntimeMs+=downtime;t.maxDowntimeMs=Math.max(t.maxDowntimeMs,downtime);t.reconnectFailures++;analyzerTestLog('Test arrêté pendant une coupure : reconnexion non validée.','error')}t.active=false;if(manual)analyzerTestLog('Test arrêté manuellement.');state=t.backup||{};t.backup=null;document.getElementById('analyzerTestConfiguration').hidden=false;document.getElementById('analyzerTestDashboard').hidden=false;render();load();analyzerTestRefreshDashboard()}
function exportAnalyzerEnduranceTestReport(){const t=window.velocityEnduranceTest,payload={type:'velocity-endurance-stability-test',version:'7.2.65',exportedAt:new Date().toISOString(),active:t.active,configuration:{teams:t.teams,speed:t.speed,durationMs:t.durationMs,networkSimulation:Boolean(document.getElementById('analyzerTestIncidents')?.checked),incidentFrequency:t.incidentFrequency,incidentDurationSec:t.incidentDurationSec},results:{realElapsedMs:t.startedAt?Date.now()-t.startedAt:0,simulatedMs:t.simulatedMs,laps:t.laps,updates:t.updates,stops:t.stops,networkCuts:t.networkCuts,reconnectAttempts:t.reconnectAttempts,reconnectSuccess:t.reconnectSuccess,reconnectFailures:t.reconnectFailures,totalDowntimeMs:t.totalDowntimeMs,maxDowntimeMs:t.maxDowntimeMs,lastDowntimeMs:t.lastDowntimeMs,averageDowntimeMs:t.reconnectSuccess?t.totalDowntimeMs/t.reconnectSuccess:0,errors:t.errors},log:t.log};const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`Velocity_Test_Endurance_${new Date().toISOString().replace(/[:.]/g,'-')}.json`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)}
window.addEventListener('error',event=>{const t=window.velocityEnduranceTest;if(!t.active)return;t.errors.push({at:new Date().toISOString(),message:event.message,source:event.filename,line:event.lineno});analyzerTestLog(`Erreur JS : ${event.message}`,'error');analyzerTestRefreshDashboard()});window.addEventListener('unhandledrejection',event=>{const t=window.velocityEnduranceTest;if(!t.active)return;const message=String(event.reason?.message||event.reason||'Promesse rejetée');t.errors.push({at:new Date().toISOString(),message});analyzerTestLog(`Promesse rejetée : ${message}`,'error');analyzerTestRefreshDashboard()});document.addEventListener('DOMContentLoaded',()=>document.getElementById('analyzerEnduranceTestModal')?.addEventListener('click',event=>{if(event.target.id==='analyzerEnduranceTestModal')closeAnalyzerEnduranceTest()}));
