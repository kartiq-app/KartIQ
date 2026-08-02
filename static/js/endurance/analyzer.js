/* KartIQ V6.3.3 — Compteurs de relais et temps moyen Analyzer */
const ANALYZER_RULES_KEY='kartiq-analyzer-rules-v1';
const ANALYZER_LEARNING_KEY='kartiq-analyzer-learning-v1';
const ANALYZER_DEFAULT_RULES={raceHours:24,requiredStops:28,minStintMinutes:10,maxStintMinutes:60,minPitSeconds:150,pitCloseMinutes:30,safetyMarginMinutes:2,driversCount:6,driverMinimumMinutes:210};

const ANALYZER_SESSIONS_INDEX_KEY='kartiq-analyzer-sessions-index-v1';
const ANALYZER_ACTIVE_SESSION_KEY='kartiq-analyzer-active-session-v1';
const ANALYZER_SESSION_PREFIX='kartiq-analyzer-session-v1:';
const ANALYZER_AUTOSAVE_MS=5000;
let analyzerActiveSessionId=null;
let analyzerSessionCircuitId=null;
let analyzerLastSessionSaveAt=0;
let analyzerSessionAutosaveTimer=null;
let analyzerSessionRestoreLock=false;

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
  appVersion:'6.3.3',
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
 const session={version:2,appVersion:'6.3.3',id,name:name||analyzerSessionDefaultName(cid),circuitId:cid,circuitName:analyzerSessionCircuitName(cid),createdAt:now,updatedAt:now,status:'active',rules:reset?{...ANALYZER_DEFAULT_RULES}:{...analyzerRules},learning:reset?{teams:{},startedAt:now}:JSON.parse(JSON.stringify(analyzerLearning)),queues:reset?{count:1,queues:[[]]}:{count:kartQueueState.count,queues:kartQueueState.queues.map(q=>[...q])},followedDriver:'',analyzerSort:'position'};
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
let analyzerLearning={teams:{},startedAt:Date.now()};

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
function analyzerLearnFromState(){
 const now=Date.now();
 (state.drivers||[]).forEach(driver=>{
  const key=analyzerTeamKey(driver);
  const item=analyzerLearning.teams[key]||{name:driver.driver,stints:[],lastStatus:null,lastTrackSeconds:null,lastStops:null,lastLapCount:null,currentStintLapSum:0,currentStintLapCount:0,virtualKart:`V-${String(driver.apex||driver.pos||key).replace(/\D/g,'').padStart(2,'0')}`,updatedAt:now};
  const track=analyzerParseDuration(driver.track_timer);
  const stops=analyzerNumeric(driver.pit_stops,null);
  const status=driver.status||'unknown';
  const lapCount=analyzerNumeric(driver.laps,null);
  const lastLapSeconds=parseLapTime(driver.last);
  // Une sortie des stands ouvre un nouveau relais : la moyenne repart de zéro.
  if(item.lastStatus==='pit'&&status==='track'){
   item.currentStintLapSum=0;item.currentStintLapCount=0;item.lastLapCount=lapCount;
  }
  // Fallback lorsque le flux n'expose pas clairement la transition OUT mais incrémente les arrêts.
  if(Number.isFinite(stops)&&Number.isFinite(item.lastStops)&&stops>item.lastStops&&status==='track'){
   item.currentStintLapSum=0;item.currentStintLapCount=0;item.lastLapCount=lapCount;
  }
  // Ajoute chaque nouveau tour terminé une seule fois au calcul du relais courant.
  if(status==='track'&&Number.isFinite(lapCount)&&Number.isFinite(item.lastLapCount)&&lapCount>item.lastLapCount&&Number.isFinite(lastLapSeconds)){
   const added=Math.max(1,lapCount-item.lastLapCount);
   // Le live ne fournit qu'un dernier chrono : en cas de saut de plusieurs tours, on ne compte que le dernier reçu.
   if(added>=1){item.currentStintLapSum=(Number(item.currentStintLapSum)||0)+lastLapSeconds;item.currentStintLapCount=(Number(item.currentStintLapCount)||0)+1}
  }
  if(item.lastStatus==='track'&&status==='pit'&&Number.isFinite(item.lastTrackSeconds)&&item.lastTrackSeconds>=30){
   if(!item.stints.length||Math.abs(item.stints[item.stints.length-1]-item.lastTrackSeconds)>2)item.stints.push(item.lastTrackSeconds);
   item.stints=item.stints.slice(-12);
  }
  // Some Apex feeds only update the stand counter. Use it as a fallback relay boundary.
  if(Number.isFinite(stops)&&Number.isFinite(item.lastStops)&&stops>item.lastStops&&Number.isFinite(item.lastTrackSeconds)&&item.lastTrackSeconds>=30){
   if(!item.stints.length||Math.abs(item.stints[item.stints.length-1]-item.lastTrackSeconds)>2)item.stints.push(item.lastTrackSeconds);
   item.stints=item.stints.slice(-12);
  }
  item.name=driver.driver;item.lastStatus=status;item.lastTrackSeconds=track;item.lastStops=stops;item.lastLapCount=lapCount;item.updatedAt=now;
  analyzerLearning.teams[key]=item;
 });
 analyzerSaveLearning();
}
function analyzerTeamHistory(driver){return analyzerLearning.teams[analyzerTeamKey(driver)]||{stints:[],virtualKart:`V-${String(driver?.apex||driver?.pos||'--')}`}}
function analyzerCurrentStintAverage(driver){
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
function analyzerKartScore(driver){
 const values=analyzerGridPace();const pace=analyzerPaceSeconds(driver);
 if(!Number.isFinite(pace)||!values.length)return 50;
 const best=values[0],worst=values[values.length-1];
 if(worst-best<.001)return 75;
 const percentile=1-(pace-best)/(worst-best);
 const stability=Math.min(1,(driver.pace5_laps||0)/5);
 return Math.round(Math.max(0,Math.min(100,45+percentile*45+stability*10)));
}
function analyzerConfidence(driver){
 const history=analyzerTeamHistory(driver);
 const sample=(driver.pace5_laps||0)+history.stints.length*5;
 return Math.max(15,Math.min(96,Math.round(20+sample*6)));
}
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
function analyzerSortedRows(){
 const list=analyzerRows();
 const sorters={
  position:(a,b)=>analyzerNumeric(a.driver.pos,999)-analyzerNumeric(b.driver.pos,999),
  track_desc:(a,b)=>(b.forecast.track??-1)-(a.forecast.track??-1),
  forecast:(a,b)=>(a.forecast.seconds??999999)-(b.forecast.seconds??999999),
  score:(a,b)=>b.score-a.score,
  stops:(a,b)=>analyzerNumeric(b.driver.pit_stops,-1)-analyzerNumeric(a.driver.pit_stops,-1)
 };
 return list.sort(sorters[analyzerSort]||sorters.position);
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
function renderAnalyzer(){
 if(!document.getElementById('analyzerTable'))return;
 analyzerEnsureSession();
 analyzerLearnFromState();
 const all=analyzerRows();const sorted=analyzerSortedRows();
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
 const market=all.slice().sort((a,b)=>b.score-a.score).slice(0,8);
 document.getElementById('analyzerKartMarket').innerHTML=market.length?market.map((x,i)=>`<div class="analyzer-market-row"><b>${i+1}</b><span><span class="analyzer-market-team">${analyzerEscape(x.history.virtualKart)} — ${analyzerEscape(x.driver.driver)}</span><span class="analyzer-market-meta">${x.history.stints.length} relais observé(s)</span></span><span class="analyzer-score-pill ${analyzerScoreClass(x.score)}">${x.score}</span><span class="analyzer-confidence">${x.confidence}%</span></div>`).join(''):'<div class="analyzer-empty">Apprentissage en cours.</div>';
 const wave=all.filter(x=>Number.isFinite(x.forecast.seconds)&&x.forecast.seconds<=600&&x.driver.status!=='pit');
 document.getElementById('analyzerWaveCount').textContent=wave.length;document.getElementById('analyzerWaveStatus').textContent=wave.length>=6?'GROSSE VAGUE IMMINENTE':wave.length>=3?'VAGUE EN FORMATION':wave.length?'MOUVEMENTS ISOLÉS':'AUCUNE VAGUE DÉTECTÉE';document.getElementById('analyzerWaveMeter').style.width=`${Math.min(100,wave.length/Math.max(1,(state.drivers||[]).length)*250)}%`;
 document.getElementById('analyzerTable').innerHTML=sorted.map(x=>{
  const d=x.driver;const isFollowed=d.driver===state.followed_driver;const trackSec=x.forecast.track;const penalty=d.penalty||'—';
  const relayTimer=analyzerRelayTimer(d),stintAverage=analyzerCurrentStintAverage(d);
  return `<tr class="${isFollowed?'followed':''}" onclick="followDriver(${JSON.stringify(d.driver).replace(/"/g,'&quot;')})"><td class="a-pos">${analyzerEscape(d.pos)}</td><td class="a-pit-indicator">${analyzerPitIndicator(d)}</td><td>${analyzerEscape(validKartNumber(d)||d.apex||'—')}</td><td class="a-team" title="${analyzerEscape(d.driver)}">${analyzerEscape(d.driver)}</td><td><button type="button" class="analyzer-laps-btn" onclick="event.stopPropagation();openApexTeamLaps(${Number(d.apex_row)||0})">STATS</button></td><td>${analyzerEscape(d.laps)}</td><td class="a-track${relayTimer.inPit?' pit-time-blue':''}">${analyzerEscape(relayTimer.value)}</td><td>${analyzerEscape(d.pit_stops??'—')}</td><td class="${lapTimeClass(d,d.last,'last')}">${analyzerEscape(d.last)}</td><td class="${lapTimeClass(d,d.best,'best')}">${analyzerEscape(d.best)}</td><td class="a-average">${stintAverage?analyzerEscape(formatApexMilliseconds(stintAverage*1000)):'—'}</td><td>${analyzerEscape(d.gap)}</td><td class="red">${analyzerEscape(penalty)}</td><td class="a-forecast">${d.status==='pit'?'IN':analyzerEscape(x.forecast.label)}</td><td>${analyzerEscape(x.history.virtualKart)}</td><td class="a-note ${analyzerScoreClass(x.score)}">${x.score}</td></tr>`;
 }).join('');
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
