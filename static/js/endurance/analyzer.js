/* KartIQ V6.9.5 — Prévisions météo horaires locales */
const ANALYZER_RULES_KEY='kartiq-analyzer-rules-v1';
const ANALYZER_LEARNING_KEY='kartiq-analyzer-learning-v1';
const ANALYZER_DEFAULT_RULES={raceHours:24,requiredStops:28,minStintMinutes:10,maxStintMinutes:60,minPitSeconds:150,pitCloseMinutes:30,safetyMarginMinutes:2,driversCount:6,driverMinimumMinutes:210};

const ANALYZER_SESSIONS_INDEX_KEY='kartiq-analyzer-sessions-index-v1';
const ANALYZER_ACTIVE_SESSION_KEY='kartiq-analyzer-active-session-v1';
const ANALYZER_SESSION_PREFIX='kartiq-analyzer-session-v1:';
const ANALYZER_AUTOSAVE_MS=5000;
let analyzerKartSort='none';
let analyzerActiveSessionId=null;
let analyzerSessionCircuitId=null;
let analyzerLastSessionSaveAt=0;
let analyzerSessionAutosaveTimer=null;
let analyzerSessionRestoreLock=false;


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
 container.innerHTML=timeline.slice(0,6).map(slot=>{
  const temperature=Number(slot.temperature),probability=Number(slot.probability),precipitation=Number(slot.precipitation||slot.rain||0);
  const time=analyzerWeatherFormatHour(slot.time);
  const icon=slot.icon||'cloudy';
  const risk=analyzerWeatherRiskClass(probability,precipitation);
  return `<div class="weather-slot ${risk}" title="${escapeHtml(slot.label||'Conditions météo')}">
   <div class="weather-slot-time">${escapeHtml(time)}</div>
   <img class="weather-slot-icon" src="/static/assets/weather/${escapeHtml(icon)}.svg" alt="${escapeHtml(slot.label||'Météo')}">
   <div class="weather-slot-rain">💧 ${Number.isFinite(probability)?Math.round(probability):0}%</div>
   <div class="weather-slot-temp">${Number.isFinite(temperature)?Math.round(temperature)+'°':'—'}</div>
  </div>`;
 }).join('');
}
function renderAnalyzerWeather(){
 const card=document.getElementById('analyzerWeatherCard');if(!card)return;
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
 try{const response=await fetch(`/api/weather?circuit_id=${encodeURIComponent(circuitId)}`,{cache:'no-store'});const payload=await response.json();if(!response.ok||!payload.ok)throw new Error(payload.error||'Météo indisponible');if(analyzerWeatherCircuitId!==circuitId)return;analyzerWeatherData=payload.weather;analyzerWeatherLastFetch=Date.now();}
 catch(error){console.warn('[KartIQ météo]',error);if(analyzerWeatherCircuitId===circuitId)analyzerWeatherData=null;}
 finally{if(analyzerWeatherCircuitId===circuitId){analyzerWeatherLoading=false;renderAnalyzerWeather();}}
}
function ensureAnalyzerWeather(){
 const circuitId=analyzerSessionCircuit();
 if(circuitId!==analyzerWeatherCircuitId){analyzerWeatherData=null;analyzerWeatherLastFetch=0;loadAnalyzerWeather(true);}
 else if(circuitId&&Date.now()-analyzerWeatherLastFetch>=ANALYZER_WEATHER_REFRESH_MS)loadAnalyzerWeather();
 if(!analyzerWeatherTimer)analyzerWeatherTimer=setInterval(()=>loadAnalyzerWeather(),ANALYZER_WEATHER_REFRESH_MS);
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
function analyzerSessionWriteIndex(index){try{localStorage.setItem(ANALYZER_SESSIONS_INDEX_KEY,JSON.stringify(index))}catch(_){}}
function analyzerSessionRead(id){if(!id)return null;try{return JSON.parse(localStorage.getItem(ANALYZER_SESSION_PREFIX+id)||'null')}catch(_){return null}}
function analyzerSessionMetadata(session){return {id:session.id,name:session.name,circuitId:session.circuitId,circuitName:session.circuitName,createdAt:session.createdAt,updatedAt:session.updatedAt,status:session.status||'active',version:session.version||1}}
function analyzerSessionUpdateIndex(session){
 const index=analyzerSessionReadIndex().filter(item=>item.id!==session.id);
 index.unshift(analyzerSessionMetadata(session));
 analyzerSessionWriteIndex(index.slice(0,30));
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
  version:2,
  appVersion:'6.9.5',
  id:analyzerActiveSessionId,
  name:previous.name||analyzerSessionDefaultName(circuitId),
  circuitId,
  circuitName:analyzerSessionCircuitName(circuitId),
  createdAt:previous.createdAt||Date.now(),
  updatedAt:Date.now(),
  status:previous.status||'active',
  saveReason:reason,
  rules:{...analyzerRules},
  learning:JSON.parse(JSON.stringify(analyzerLearning||{teams:{},startedAt:Date.now()})),
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
  localStorage.setItem(ANALYZER_SESSION_PREFIX+snapshot.id,JSON.stringify(snapshot));
  localStorage.setItem(ANALYZER_ACTIVE_SESSION_KEY,snapshot.id);
  analyzerSessionUpdateIndex(snapshot);
  analyzerLastSessionSaveAt=snapshot.updatedAt;
  const time=new Date(snapshot.updatedAt).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
  analyzerUpdateSessionBadge(`SAUVEGARDÉ ${time}`,'saved');
  return true;
 }catch(error){console.warn('[KartIQ Analyzer] Sauvegarde impossible',error);analyzerUpdateSessionBadge('SAUVEGARDE IMPOSSIBLE','error');return false}
}
function analyzerApplySession(session,{notify=true}={}){
 if(!session)return false;
 analyzerSessionRestoreLock=true;
 analyzerActiveSessionId=session.id;
 analyzerSessionCircuitId=session.circuitId;
 analyzerRules={...ANALYZER_DEFAULT_RULES,...(session.rules||{})};
 analyzerLearning={teams:{},startedAt:Date.now(),...(session.learning||{})};
 analyzerSort=session.analyzerSort||'position';
 if(session.queues&&typeof normalizeKartQueueState==='function'){
  kartQueueState=normalizeKartQueueState(session.queues);
  saveKartQueues();renderKartQueues();
 }
 try{localStorage.setItem(ANALYZER_RULES_KEY,JSON.stringify(analyzerRules));localStorage.setItem(ANALYZER_LEARNING_KEY,JSON.stringify(analyzerLearning));localStorage.setItem(ANALYZER_ACTIVE_SESSION_KEY,session.id)}catch(_){}
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
 const session={version:2,appVersion:'6.9.5',id,name:name||analyzerSessionDefaultName(cid),circuitId:cid,circuitName:analyzerSessionCircuitName(cid),createdAt:now,updatedAt:now,status:'active',rules:reset?{...ANALYZER_DEFAULT_RULES}:{...analyzerRules},learning:reset?{teams:{},startedAt:now}:JSON.parse(JSON.stringify(analyzerLearning)),queues:reset?{count:1,queues:[[]]}:{count:kartQueueState.count,queues:kartQueueState.queues.map(q=>[...q])},followedDriver:'',analyzerSort:'position'};
 localStorage.setItem(ANALYZER_SESSION_PREFIX+id,JSON.stringify(session));analyzerSessionUpdateIndex(session);analyzerApplySession(session,{notify:false});analyzerSaveSession('new-session');return session;
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
function archiveAnalyzerSession(id){const session=analyzerSessionRead(id);if(!session)return;session.status=session.status==='archived'?'active':'archived';session.updatedAt=Date.now();localStorage.setItem(ANALYZER_SESSION_PREFIX+id,JSON.stringify(session));analyzerSessionUpdateIndex(session);renderAnalyzerSessions()}
function deleteAnalyzerSession(id){if(!window.confirm('Supprimer définitivement cette session Analyzer ?'))return;localStorage.removeItem(ANALYZER_SESSION_PREFIX+id);analyzerSessionWriteIndex(analyzerSessionReadIndex().filter(meta=>meta.id!==id));if(id===analyzerActiveSessionId){analyzerActiveSessionId=null;analyzerSessionCircuitId=null;localStorage.removeItem(ANALYZER_ACTIVE_SESSION_KEY);analyzerCreateSession({reset:true})}renderAnalyzerSessions()}
function exportAnalyzerSession(){analyzerSaveSession('export');const session=analyzerSessionRead(analyzerActiveSessionId);if(!session)return;const blob=new Blob([JSON.stringify(session,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`KartIQ_Session_${analyzerSessionSafeId(session.name)}_${new Date().toISOString().slice(0,10)}.json`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)}
function triggerAnalyzerSessionImport(){document.getElementById('analyzerSessionImport')?.click()}
async function importAnalyzerSession(event){
 const file=event?.target?.files?.[0];if(!file)return;
 try{const session=JSON.parse(await file.text());if(!session?.id||!session?.circuitId||!session?.learning)throw new Error('Format de session invalide');session.id=`${analyzerSessionSafeId(session.circuitId)}-${Date.now().toString(36)}`;session.name=(session.name||'Session importée')+' — import';session.createdAt=Date.now();session.updatedAt=Date.now();session.status='active';localStorage.setItem(ANALYZER_SESSION_PREFIX+session.id,JSON.stringify(session));analyzerSessionUpdateIndex(session);if(session.circuitId===analyzerSessionCircuit())analyzerApplySession(session);renderAnalyzerSessions();window.alert('Session importée avec succès.')}catch(error){window.alert('Import impossible : '+error.message)}finally{event.target.value=''}
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
function analyzerDriverPhase(driver){
 const pace=analyzerDriverPace(driver);if(!Number.isFinite(pace)||pace<=0)return 0;
 const track=analyzerParseDuration(driver?.track_timer);
 if(Number.isFinite(track)&&track>=0)return ((track%pace)+pace)%pace/pace;
 const laps=analyzerNumeric(driver?.laps,0);return ((laps%1)+1)%1;
}
function analyzerTrackPoint(phase,radius=86,cx=110,cy=110){
 const angle=(Number(phase)||0)*Math.PI*2-Math.PI/2;
 return {x:cx+Math.cos(angle)*radius,y:cy+Math.sin(angle)*radius};
}
function analyzerSimulationKartLabel(driver){return String(validKartNumber(driver)||driver?.apex||driver?.pos||'—').slice(0,3)}
function analyzerRenderPitSimulator(){
 const host=document.getElementById('pitSimulatorTrack');if(!host)return;
 const drivers=(state.drivers||[]).filter(d=>d&&d.driver);
 if(!drivers.length){host.innerHTML='<div class="analyzer-empty">En attente des données Apex…</div>';return}
 const followed=drivers.find(d=>d.driver===state.followed_driver)||null;
 const simulation=analyzerPitSimulation;
 const horizon=simulation?.horizonSeconds||0;
 const dots=drivers.map(driver=>{
  const pace=analyzerDriverPace(driver);
  let phase=analyzerDriverPhase(driver);
  if(simulation&&driver.driver!==simulation.followedName&&driver.status!=='pit')phase=(phase+horizon/Math.max(1,pace))%1;
  if(simulation&&driver.driver===simulation.followedName)phase=0;
  const p=analyzerTrackPoint(phase);
  const classes=['pit-simulator-dot'];if(driver.driver===state.followed_driver)classes.push('followed');if(driver.status==='pit')classes.push('pit');
  return `<g class="${classes.join(' ')}" transform="translate(${p.x.toFixed(2)} ${p.y.toFixed(2)})"><circle r="9"></circle><text y=".5">${analyzerEscape(analyzerSimulationKartLabel(driver))}</text></g>`;
 }).join('');
 const projected=simulation?'<circle class="pit-simulator-projected" cx="110" cy="24" r="12"></circle>':'';
 const centerTitle=simulation?'RESSORTIE DANS':'ÉQUIPE SUIVIE';
 const centerValue=simulation?analyzerFormatDuration(simulation.horizonSeconds):(followed?analyzerEscape(analyzerSimulationKartLabel(followed)):'—');
 host.innerHTML=`<svg viewBox="0 0 220 220" role="img" aria-label="Progression estimée des karts sur un tour"><circle class="pit-simulator-ring" cx="110" cy="110" r="86"></circle><line class="pit-simulator-line" x1="110" y1="12" x2="110" y2="38"></line>${dots}${projected}<text class="pit-simulator-center-title" x="110" y="103">${centerTitle}</text><text class="pit-simulator-center-value" x="110" y="124">${centerValue}</text></svg>`;
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
 }catch(error){if(status)status.textContent=`Simulation impossible : ${error.message}`;console.warn('[KartIQ] Simulation arrêt',error)}
 finally{analyzerPitSimulationBusy=false;if(button){button.disabled=false;button.textContent='SIMULER UN ARRÊT'}}
}
if(!window.__kartiqPitTrackTimer){window.__kartiqPitTrackTimer=setInterval(analyzerRenderPitSimulator,750)}

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
 try{analyzerRules={...ANALYZER_DEFAULT_RULES,...JSON.parse(localStorage.getItem(ANALYZER_RULES_KEY)||'{}')}}catch(_){analyzerRules={...ANALYZER_DEFAULT_RULES}}
 try{analyzerLearning={teams:{},startedAt:Date.now(),...JSON.parse(localStorage.getItem(ANALYZER_LEARNING_KEY)||'{}')}}catch(_){analyzerLearning={teams:{},startedAt:Date.now()}}
}
function analyzerSaveLearning(){try{localStorage.setItem(ANALYZER_LEARNING_KEY,JSON.stringify(analyzerLearning))}catch(_){}}
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
 if(rankingSubtitle)rankingSubtitle.textContent=analyzerRankingMode==='virtual'?(analyzerVirtualLoading?'Calcul des temps d’arrêts virtuels en cours…':'Même nombre d’arrêts pour toutes les équipes — moyenne des 3 meilleurs arrêts propres à chaque équipe'):'Colonnes Apex Timing enrichies par KartIQ';
 const followed=(state.drivers||[]).find(d=>d.driver===state.followed_driver)||state.followed||(state.drivers||[])[0]||null;
 const ownForecast=followed?analyzerForecastFor(followed):{};const stops=analyzerStopsInfo(followed);
 document.getElementById('analyzerFollowedName').textContent=followed?.driver||'—';
 document.getElementById('analyzerFollowedPosition').textContent=followed?.pos?`P${followed.pos}`:'P—';
 document.getElementById('analyzerFollowedTrack').textContent=followed?.track_timer||'—';
 document.getElementById('analyzerFollowedLimit').textContent=Number.isFinite(ownForecast.maxRemaining)?analyzerFormatDuration(ownForecast.maxRemaining):'—';
 document.getElementById('analyzerFollowedStops').textContent=`${stops.done} / ${analyzerRules.requiredStops}`;
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
 document.getElementById('analyzerForecast').innerHTML=forecastRows.length?forecastRows.map(x=>`<div class="analyzer-forecast-row"><span class="analyzer-forecast-time">${x.driver.status==='pit'?'IN':analyzerEscape(x.forecast.label)}</span><span><span class="analyzer-forecast-team">${analyzerEscape(x.driver.driver)}</span><span class="analyzer-forecast-meta">Kart virtuel ${analyzerEscape(x.history.virtualKart)}</span></span><span class="analyzer-score-pill ${analyzerScoreClass(x.score)}">${x.score}/100</span><span class="analyzer-confidence">${x.forecast.confidence}%</span></div>`).join(''):'<div class="analyzer-empty">Aucun arrêt attendu dans les 15 prochaines minutes.</div>';
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
 document.getElementById('analyzerWaveCount').textContent=wave.length;document.getElementById('analyzerWaveStatus').textContent=wave.length>=6?'GROSSE VAGUE IMMINENTE':wave.length>=3?'VAGUE EN FORMATION':wave.length?'MOUVEMENTS ISOLÉS':'AUCUNE VAGUE DÉTECTÉE';document.getElementById('analyzerWaveMeter').style.width=`${Math.min(100,wave.length/Math.max(1,(state.drivers||[]).length)*250)}%`;
 document.getElementById('analyzerTable').innerHTML=sorted.map(x=>{
  const d=x.driver;const isFollowed=d.driver===state.followed_driver;const penalty=d.penalty||'—';const isVirtual=analyzerRankingMode==='virtual';
  const relayTimer=analyzerRelayTimer(d),stintAverage=analyzerCurrentStintAverage(d),virtual=x.virtual;
  const displayPos=isVirtual?virtual.position:d.pos;
  const stopsValue=isVirtual?`${analyzerEscape(d.pit_stops??0)}${virtual.missing?`<small class="virtual-stop-add">+${virtual.missing} virtuel${virtual.missing>1?'s':''}</small>`:''}`:analyzerEscape(d.pit_stops??'—');
  const gapValue=isVirtual?(virtual.position===1?'—':`+${analyzerFormatDuration(virtual.gap)}`):analyzerEscape(d.gap);
  const virtualInfo=isVirtual&&virtual.missing?`<small class="virtual-time-add" title="Moyenne ${virtual.pitAverage.samples||0} arrêt(s)">+${analyzerFormatDuration(virtual.extra)}${virtual.pitAverage.estimated?' estimé':''}</small>`:'';
  return `<tr class="${isFollowed?'followed':''}${isVirtual?' virtual-ranking-row':''}" onclick="followDriver(${JSON.stringify(d.driver).replace(/"/g,'&quot;')})"><td class="a-pos">${analyzerEscape(displayPos)}${isVirtual&&Number(d.pos)!==displayPos?`<small class="virtual-real-pos">réel P${analyzerEscape(d.pos)}</small>`:''}</td><td class="a-pit-indicator">${analyzerPitIndicator(d)}</td><td>${analyzerEscape(validKartNumber(d)||d.apex||'—')}</td><td class="a-team" title="${analyzerEscape(d.driver)}">${analyzerEscape(d.driver)}${virtualInfo}</td><td><button type="button" class="analyzer-laps-btn" onclick="event.stopPropagation();openApexTeamLaps(${Number(d.apex_row)||0})">STATS</button></td><td>${analyzerEscape(d.laps)}</td><td class="a-track${relayTimer.inPit?' pit-time-blue':''}">${analyzerEscape(relayTimer.value)}</td><td>${stopsValue}</td><td class="${lapTimeClass(d,d.last,'last')}">${analyzerEscape(d.last)}</td><td class="${lapTimeClass(d,d.best,'best')}">${analyzerEscape(d.best)}</td><td class="a-average">${stintAverage?analyzerEscape(formatApexMilliseconds(stintAverage*1000)):'—'}</td><td class="${isVirtual?'virtual-gap':''}">${gapValue}</td><td class="red">${analyzerEscape(penalty)}</td><td class="a-forecast">${d.status==='pit'?'IN':analyzerEscape(x.forecast.label)}</td><td>${analyzerEscape(x.history.virtualKart)}</td><td class="a-note ${analyzerScoreClass(x.score)}">${x.score}</td></tr>`;
 }).join('');
 analyzerRenderPitSimulator();
 renderAnalyzerQueueAdvice();
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
 localStorage.setItem(ANALYZER_RULES_KEY,JSON.stringify(analyzerRules));analyzerSaveSession('rules-update');closeAnalyzerRules();renderAnalyzer();
}
function resetAnalyzerRules(){analyzerRules={...ANALYZER_DEFAULT_RULES};localStorage.setItem(ANALYZER_RULES_KEY,JSON.stringify(analyzerRules));analyzerSaveSession('rules-reset');openAnalyzerRules();renderAnalyzer()}
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
