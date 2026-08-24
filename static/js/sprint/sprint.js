async function openSprintFocus(){
 const overlay=document.getElementById('sprintFocus');if(!overlay)return;
 overlay.classList.add('show');document.body.classList.add('sprint-focus-active');rememberVelocityFocus('sprint');setFocusLandscapeLock(true);sprintFocusPenaltyInitialized=false;sprintFocusPenaltySeen.clear();sprintFocusPenaltyAlert=null;sprintFocusPenaltyAlertUntil=0;renderSprintFocus();
 try{if(document.documentElement.requestFullscreen&&!document.fullscreenElement)await document.documentElement.requestFullscreen()}catch(e){}
 await lockFocusOrientationForAndroid();
 try{if('wakeLock' in navigator)sprintFocusWakeLock=await navigator.wakeLock.request('screen')}catch(e){}
}
async function closeSprintFocus(){
 document.getElementById('sprintFocus')?.classList.remove('show');document.body.classList.remove('sprint-focus-active');clearVelocityFocusMemory('sprint');setFocusLandscapeLock(false);
 try{if(sprintFocusWakeLock){await sprintFocusWakeLock.release();sprintFocusWakeLock=null}}catch(e){}
 unlockFocusOrientationForAndroid();
 try{if(document.fullscreenElement&&document.exitFullscreen)await document.exitFullscreen()}catch(e){}
}
async function openEnduranceFocus(){
 const overlay=document.getElementById('enduranceFocus');if(!overlay)return;
 overlay.classList.add('show');document.body.classList.add('endurance-focus-active');rememberVelocityFocus('endurance');setFocusLandscapeLock(true);endurancePenaltyInitialized=false;endurancePenaltySeen.clear();endurancePenaltyAlert=null;endurancePenaltyAlertUntil=0;renderEnduranceFocus();
 try{if(document.documentElement.requestFullscreen&&!document.fullscreenElement)await document.documentElement.requestFullscreen()}catch(e){}
 await lockFocusOrientationForAndroid();
 try{if('wakeLock' in navigator)enduranceFocusWakeLock=await navigator.wakeLock.request('screen')}catch(e){}
}
async function closeEnduranceFocus(){
 document.getElementById('enduranceFocus')?.classList.remove('show');document.body.classList.remove('endurance-focus-active');clearVelocityFocusMemory('endurance');setFocusLandscapeLock(false);
 setEndurancePitOverlay(null);
 try{if(enduranceFocusWakeLock){await enduranceFocusWakeLock.release();enduranceFocusWakeLock=null}}catch(e){}
 unlockFocusOrientationForAndroid();
 try{if(document.fullscreenElement&&document.exitFullscreen)await document.exitFullscreen()}catch(e){}
}

function sprintDriverAhead(driver){if(!driver?.pos||Number(driver.pos)<=1)return null;return (state.drivers||[]).find(d=>Number(d.pos)===Number(driver.pos)-1)||null}
function sprintDriverBehind(driver){if(!driver?.pos)return null;return (state.drivers||[]).find(d=>Number(d.pos)===Number(driver.pos)+1)||null}
function sprintGapAhead(driver){
 const ahead=sprintDriverAhead(driver);if(!ahead)return '--';
 return formatRaceInterval(driver,ahead,'+');
}
function sprintGapBehind(driver){
 const behind=sprintDriverBehind(driver);if(!behind)return '--';
 return formatRaceInterval(behind,driver,'-');
}
function penaltyTime(p){if(p?.time)return p.time;const at=String(p?.at||'');return at.length>=16?at.slice(11,16):'--:--'}
function escapePenaltyHtml(value){return String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))}
function penaltyRawText(p){return String(p?.penalty||p?.comment||'').trim()}
function penaltyDurationLabel(p){
 const raw=penaltyRawText(p).replace(',', '.');
 const matches=[...raw.matchAll(/(?:^|[^\d])([+-]?\d+(?:\.\d+)?)\s*(?:s|sec|secondes?|秒)?(?=$|[^\d])/gi)];
 if(!matches.length)return '—';
 const preferred=[...matches].reverse().find(m=>m[0].match(/\.|\b(?:s|sec|secondes?|秒)\b/i))||matches[matches.length-1];
 const numeric=Number(preferred[1]);
 const duration=Number.isFinite(numeric)?String(Number(numeric.toFixed(3))):preferred[1].replace(/^\+/, '');
 return `${duration} s`;
}
function penaltyHeaderText(p){return `${penaltyTime(p)} | ${p?.driver||'—'} | ${penaltyDurationLabel(p)}`}
function penaltyDetailText(p){return penaltyRawText(p)||'Pénalité'}
function compactPenaltyText(p){return `${p?.driver||'—'} • ${penaltyDurationLabel(p)}`}
function fullPenaltyText(p){return `${penaltyHeaderText(p)} | ${penaltyDetailText(p)}`}
function lapSeconds(value){
 const raw=String(value||'').trim().replace(',', '.');if(!raw||raw==='—'||raw==='--')return null;
 const parts=raw.split(':').map(Number);if(parts.some(v=>!Number.isFinite(v)))return null;
 return parts.length===2?parts[0]*60+parts[1]:parts.length===3?parts[0]*3600+parts[1]*60+parts[2]:Number(raw);
}
function frenchOrdinal(rank){return rank===1?`${rank}ᵉʳ`:`${rank}ᵉ`}
function frenchOrdinalMarkup(rank){return `<span class="rank-number">${frenchOrdinal(rank)}</span><span class="rank-label">TEMPS</span>`}

function sprintFastestLastLapForFollowed(followed=state.followed){
 const followedLaps=Number(followed?.laps);
 if(!Number.isFinite(followedLaps))return null;
 const candidates=(state.drivers||[])
  .filter(d=>Number(d?.laps)===followedLaps)
  .map(d=>({...d,_lastSec:lapSeconds(d.last)}))
  .filter(d=>Number.isFinite(d._lastSec))
  .sort((a,b)=>a._lastSec-b._lastSec);
 return candidates[0]||null;
}
function sprintFocusRankMarkup(rank){
 if(!Number.isFinite(Number(rank)))return '—';
 const value=Number(rank);
 return `<span class="sprint-focus-stopwatch" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="M9 2h6v2H9zM11 5h2v2h-2zM17.03 6.97l1.42-1.42 1.41 1.41-1.42 1.42A8 8 0 1 1 17.03 6.97ZM12 8a6 6 0 1 0 6 6 6 6 0 0 0-6-6Zm1 2v3.59l2.54 2.53-1.42 1.42L11 14.41V10Z"/></svg></span><span class="sprint-focus-rank-number">${value}</span>`;
}

function sprintLastLapRanking(driver){
 const followedLaps=Number(driver?.laps);if(!Number.isFinite(followedLaps))return null;
 const valid=(state.drivers||[]).filter(d=>Number(d?.laps)===followedLaps).map(d=>({...d,_lastSec:lapSeconds(d.last)})).filter(d=>Number.isFinite(d._lastSec)).sort((a,b)=>a._lastSec-b._lastSec);
 const target=valid.find(d=>d.driver===driver?.driver);if(!target)return null;
 const rank=1+valid.filter(d=>d._lastSec<target._lastSec-0.0005).length;
 return {rank,label:`${frenchOrdinal(rank).number}${frenchOrdinal(rank).suffix} temps`,driver:target.driver,lap:target.last};
}
let sprintFocusPenaltyInitialized=false;
let sprintFocusPenaltySeen=new Set();
let sprintFocusPenaltyAlertUntil=0;
let sprintFocusPenaltyAlert=null;
let sprintFocusPenaltyHideTimer=null;

function sprintFocusPenaltyKey(p){return String(p?.id||`${p?.time||''}|${p?.flag||p?.kind||''}|${p?.kart||''}|${p?.driver||''}|${p?.penalty||p?.comment||''}`)}
function sprintFocusPenaltyItems(){
 // Même source que la carte « PÉNALITÉS ET INFORMATIONS » d'Analyzer.
 if(typeof analyzerPenaltyItems==='function')return analyzerPenaltyItems();
 const events=Array.isArray(state?.comment_events)?state.comment_events:[];
 if(events.length)return events;
 return Array.isArray(state?.comment_penalties)?state.comment_penalties:[];
}
function sprintFocusIsPenalty(p){return String(p?.kind||'').toLowerCase()==='penalty'||String(p?.flag||'').toLowerCase()==='penalty'||Boolean(String(p?.penalty||'').trim())}
function sprintFocusPenaltyTargetsFollowed(p,f){
 if(typeof samePenaltyTarget==='function'&&samePenaltyTarget(p,f))return true;
 const pd=String(p?.driver||'').trim().toLowerCase(),fd=String(f?.driver||state.followed_driver||'').trim().toLowerCase();
 if(pd&&fd&&pd===fd)return true;
 const pk=String(p?.kart||'').replace(/\D/g,''),fk=String(f?.apex||f?.kart||'').replace(/\D/g,'');
 return Boolean(pk&&fk&&pk===fk);
}
function hideSprintPenaltyBanner(){
 const banner=document.getElementById('sprintPenaltyBanner');
 if(banner)banner.classList.remove('show');
 sprintFocusPenaltyAlert=null;sprintFocusPenaltyAlertUntil=0;
}
function renderSprintFocusPenaltyAlert(f){
 const banner=document.getElementById('sprintPenaltyBanner');
 const name=document.getElementById('sprintPenaltyBannerName');
 const text=document.getElementById('sprintPenaltyBannerText');
 if(!banner)return;
 const list=sprintFocusPenaltyItems().filter(sprintFocusIsPenalty);
 if(!sprintFocusPenaltyInitialized){list.forEach(p=>sprintFocusPenaltySeen.add(sprintFocusPenaltyKey(p)));sprintFocusPenaltyInitialized=true;banner.classList.remove('show');return}
 const newest=list.find(p=>!sprintFocusPenaltySeen.has(sprintFocusPenaltyKey(p))&&sprintFocusPenaltyTargetsFollowed(p,f));
 list.forEach(p=>sprintFocusPenaltySeen.add(sprintFocusPenaltyKey(p)));
 if(newest){
  sprintFocusPenaltyAlert=newest;sprintFocusPenaltyAlertUntil=Date.now()+4000;
  if(name)name.textContent=String(newest?.driver||f?.driver||state.followed_driver||'—').trim()||'—';
  if(text)text.textContent=String(newest?.penalty||newest?.comment||'PÉNALITÉ').trim()||'PÉNALITÉ';
  banner.classList.add('show');
  if(sprintFocusPenaltyHideTimer)clearTimeout(sprintFocusPenaltyHideTimer);
  sprintFocusPenaltyHideTimer=setTimeout(hideSprintPenaltyBanner,4000);
  return;
 }
 if(!sprintFocusPenaltyAlert||Date.now()>=sprintFocusPenaltyAlertUntil)banner.classList.remove('show');
}

function sprintFocusLastLapClass(f){
 const seconds=lapSeconds(f?.last),absoluteBest=absoluteSessionBestSeconds();
 if(Number.isFinite(seconds)&&Number.isFinite(absoluteBest)&&Math.abs(seconds-absoluteBest)<0.0005)return 'fastest-session-best';
 return f?.last_improved_personal_best?'fastest-lap-green':'fastest-lap-orange';
}

function applyAnalyzerDeltaColors(f,aheadEl,behindEl){
 try{
  if(typeof analyzerUpdateFollowedDeltas!=='function')return;
  const data=analyzerUpdateFollowedDeltas(f);
  if(aheadEl){aheadEl.classList.remove('good','bad','neutral');aheadEl.classList.add(data.aheadTrend||'neutral')}
  if(behindEl){behindEl.classList.remove('good','bad','neutral');behindEl.classList.add(data.behindTrend||'neutral')}
 }catch(_error){}
}

function renderSprintFocus(){
 const overlay=document.getElementById('sprintFocus');if(!overlay?.classList.contains('show'))return;
 const f=state.followed||{};
 const position=document.getElementById('sprintFocusPosition'),name=document.getElementById('sprintFocusName'),lastRankEl=document.getElementById('sprintFocusLastRank');
 const aheadEl=document.getElementById('sprintFocusAhead'),behindEl=document.getElementById('sprintFocusBehind');
 const aheadNameEl=document.getElementById('sprintFocusAheadName'),behindNameEl=document.getElementById('sprintFocusBehindName');
 const timeEl=document.getElementById('sprintFocusTime'),lapsEl=document.getElementById('sprintFocusLaps'),lastLapEl=document.getElementById('sprintFocusLastLap');
 if(position)position.textContent=f.pos?'P'+f.pos:'—';if(name)name.textContent=f.driver||state.followed_driver||'—';
 const lastRank=sprintLastLapRanking(f);if(lastRankEl)lastRankEl.innerHTML=lastRank?sprintFocusRankMarkup(lastRank.rank):'—';
 const aheadDriver=sprintDriverAhead(f),behindDriver=sprintDriverBehind(f);
 const focusAhead=sprintGapAhead(f),focusBehind=sprintGapBehind(f),isLeader=Number(f.pos)===1,hasDriverBehind=Boolean(behindDriver);
 if(aheadNameEl){aheadNameEl.textContent=aheadDriver?.driver||'—';aheadNameEl.style.display=isLeader?'none':''}
 if(aheadEl){aheadEl.textContent=focusAhead;aheadEl.style.display=isLeader?'none':''}
 if(behindEl){behindEl.textContent=focusBehind;behindEl.style.display=(!isLeader&&!hasDriverBehind)?'none':''}
 if(behindNameEl){behindNameEl.textContent=behindDriver?.driver||'—';behindNameEl.style.display=(!isLeader&&!hasDriverBehind)?'none':''}
 applyAnalyzerDeltaColors(f,aheadEl,behindEl);
 const deltas=overlay.querySelector('.sprint-focus-deltas');if(deltas)deltas.classList.toggle('leader-only',isLeader);
 const divider=overlay.querySelector('.sprint-focus-divider');if(divider)divider.style.display=(isLeader||!hasDriverBehind)?'none':'';
 // Focus Sprint : le bloc bas-gauche affiche le temps restant de la session.
 const lapMode=raceUsesLapTarget(),ms=lapMode?null:liveRemainingMilliseconds();
 if(timeEl){timeEl.textContent=lapMode?formatRaceLapProgress():(ms===null?(state.time_remaining||'—'):formatRemainingMilliseconds(ms));timeEl.classList.toggle('time-critical',!lapMode&&Number.isFinite(ms)&&ms<=120000)}
 const laps=String(state.apex_laps_remaining||'').trim();if(lapsEl){lapsEl.textContent=lapMode?'':((laps&&laps!=='—')?(laps.toLowerCase().includes('tour')?laps:`${laps} tours`):'');lapsEl.style.display=lapsEl.textContent?'':'none'}
 if(lastLapEl){lastLapEl.textContent=f.last||'—';lastLapEl.classList.remove('fastest-session-best','fastest-lap-green','fastest-lap-orange');if(f.last&&f.last!=='—')lastLapEl.classList.add(sprintFocusLastLapClass(f))}
 renderSprintFocusPenaltyAlert(f);
}


function enduranceOrdinalMarkup(rank){
 if(!Number.isFinite(Number(rank)))return '—';
 const value=Number(rank);
 return `<span class="endurance-focus-stopwatch" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="M9 2h6v2H9zM11 5h2v2h-2zM17.03 6.97l1.42-1.42 1.41 1.41-1.42 1.42A8 8 0 1 1 17.03 6.97ZM12 8a6 6 0 1 0 6 6 6 6 0 0 0-6-6Zm1 2v3.59l2.54 2.53-1.42 1.42L11 14.41V10Z"/></svg></span><span class="endurance-focus-rank-number">${value}</span>`;
}

let endurancePitPreviousStatus='unknown';
let endurancePitEnteredAt=0;
let endurancePitLastTime='—';
let endurancePitOutUntil=0;
let endurancePitSimulation=null;
let enduranceTrackStartedAt=0;
let endurancePitPassageCount=0;

// V7.2.1751 — Focus Endurance : la couleur vert/orange est propre au pilote
// du relais en cours. Elle est réinitialisée à chaque sortie des stands.
let enduranceRelayLapColorState={teamKey:'',pilotKey:'',lastMarker:'',bestSeconds:null,lastImproved:false};
function enduranceRelayTeamKey(f){return String(f?.apex_row??f?.driver??'').trim()}
function enduranceRelayPilotKey(f){return String(f?.pilot||f?.driver||'').trim().toLowerCase()}
function enduranceRelayLapMarker(f){return `${String(f?.laps??'')}|${String(f?.last??'')}`}
function resetEnduranceRelayLapColor(f){
 enduranceRelayLapColorState={
  teamKey:enduranceRelayTeamKey(f),
  pilotKey:enduranceRelayPilotKey(f),
  // On mémorise le tour encore affiché au PIT OUT pour ne pas le prendre comme
  // premier tour du nouveau relais. Le prochain nouveau marker sera la référence.
  lastMarker:enduranceRelayLapMarker(f),
  bestSeconds:null,
  lastImproved:false
 };
}
function enduranceRelayLapImproved(f){
 const teamKey=enduranceRelayTeamKey(f),pilotKey=enduranceRelayPilotKey(f),marker=enduranceRelayLapMarker(f);
 const ctx=enduranceRelayLapColorState;
 if(ctx.teamKey!==teamKey||ctx.pilotKey!==pilotKey){
  resetEnduranceRelayLapColor(f);
  return false;
 }
 if(!marker||marker==='|')return false;
 if(marker===ctx.lastMarker)return Boolean(ctx.lastImproved);
 const seconds=lapSeconds(f?.last);
 ctx.lastMarker=marker;
 if(!Number.isFinite(seconds)){ctx.lastImproved=false;return false}
 const previousBest=ctx.bestSeconds;
 const improved=!Number.isFinite(previousBest)||seconds<previousBest-0.0005;
 ctx.lastImproved=improved;
 if(!Number.isFinite(previousBest)||seconds<previousBest)ctx.bestSeconds=seconds;
 return improved;
}

function formatEndurancePitElapsed(ms){
 const total=Math.max(0,Math.floor(Number(ms||0)/1000));
 const hours=Math.floor(total/3600);
 const minutes=Math.floor((total%3600)/60);
 const seconds=total%60;
 const pad=n=>String(n).padStart(2,'0');
 return hours?`${pad(hours)}:${pad(minutes)}:${pad(seconds)}`:`${pad(minutes)}:${pad(seconds)}`;
}
function formatEndurancePitDuration(ms){
 const totalMs=Math.max(0,Math.floor(Number(ms||0)));
 const minutes=Math.floor(totalMs/60000);
 const seconds=Math.floor((totalMs%60000)/1000);
 const millis=totalMs%1000;
 return `${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}.${String(millis).padStart(3,'0')}`;
}
function formatEndurancePitClock(value){
 const raw=String(value??'').trim();
 if(!raw||raw==='—')return '00:00.000';
 const clean=raw.replace(/,$/,'.').replace(/\.$/,'');
 let totalMs=NaN;
 if(/^\d+(?:[.,]\d+)?$/.test(clean)){
  totalMs=Math.round(Number(clean.replace(',','.'))*1000);
 }else{
  const parts=clean.split(':');
  if(parts.length===2){
   const minutes=Number(parts[0]);
   const seconds=Number(parts[1].replace(',','.'));
   if(Number.isFinite(minutes)&&Number.isFinite(seconds))totalMs=Math.round((minutes*60+seconds)*1000);
  }else if(parts.length===3){
   const hours=Number(parts[0]);
   const minutes=Number(parts[1]);
   const seconds=Number(parts[2].replace(',','.'));
   if(Number.isFinite(hours)&&Number.isFinite(minutes)&&Number.isFinite(seconds))totalMs=Math.round((hours*3600+minutes*60+seconds)*1000);
  }
 }
 return Number.isFinite(totalMs)?formatEndurancePitDuration(totalMs):clean;
}
function endurancePitPassageLabel(count){
 const value=Math.max(1,Number(count)||1);
 return `${value}${value===1?'er':'e'} passage aux stands`;
}
function setEndurancePitOverlay(mode,timeValue='—',passageCount=endurancePitPassageCount){
 const overlay=document.getElementById('endurancePitOverlay');
 const inTime=document.getElementById('endurancePitInTime');
 const outMessage=document.getElementById('endurancePitOutMessage');
 const outPassage=document.getElementById('endurancePitOutPassage');
 const outTime=document.getElementById('endurancePitOutTime');
 if(!overlay)return;
 overlay.classList.toggle('show',Boolean(mode));
 overlay.classList.toggle('pit-in-active',mode==='in');
 overlay.classList.toggle('pit-out-active',mode==='out');
 if(inTime)inTime.textContent=formatEndurancePitClock(timeValue);
 if(outPassage)outPassage.textContent=endurancePitPassageLabel(passageCount);
 if(outTime)outTime.textContent=formatEndurancePitClock(timeValue);
 if(outMessage)outMessage.setAttribute('aria-hidden',mode==='out'?'false':'true');
}
function simulateEndurancePitIn(){
 endurancePitSimulation={mode:'in',startedAt:Date.now(),duration:'—'};
 enduranceTrackStartedAt=0;
 endurancePitOutUntil=0;
 renderEnduranceFocus();
}
function simulateEndurancePitOut(){
 const now=Date.now();
 let duration=endurancePitLastTime;
 if(endurancePitSimulation?.mode==='in')duration=formatEndurancePitDuration(now-endurancePitSimulation.startedAt);
 endurancePitLastTime=duration||'—';
 endurancePitPassageCount=Math.max(1,endurancePitPassageCount+1);
 endurancePitSimulation={mode:'out',startedAt:now,duration:endurancePitLastTime,passageCount:endurancePitPassageCount};
 resetEnduranceRelayLapColor(enduranceFocusSelectedDriver());
 enduranceTrackStartedAt=now;
 endurancePitOutUntil=now+5000;
 renderEnduranceFocus();
}
function resetEndurancePitSimulation(){
 endurancePitSimulation=null;
 endurancePitOutUntil=0;
 endurancePitPreviousStatus='unknown';
 enduranceTrackStartedAt=0;
 setEndurancePitOverlay(null);
}
function renderEndurancePitState(f){
 const now=Date.now();
 if(endurancePitSimulation?.mode==='in'){
  const value=formatEndurancePitDuration(now-endurancePitSimulation.startedAt);
  endurancePitLastTime=value;
  setEndurancePitOverlay('in',value);
  return true;
 }
 if(endurancePitSimulation?.mode==='out'){
  if(now<endurancePitOutUntil){
   setEndurancePitOverlay('out',endurancePitSimulation.duration||endurancePitLastTime,endurancePitSimulation.passageCount||endurancePitPassageCount);
   return true;
  }
  endurancePitSimulation=null;
  endurancePitOutUntil=0;
 }
 const status=String(f?.status||'unknown').toLowerCase();
 const apexPitTime=String(f?.pit_timer||'').trim();
 if(status==='pit'){
  const apexPassages=Number(f?.pit_stops);
  if(Number.isFinite(apexPassages)&&apexPassages>0)endurancePitPassageCount=apexPassages;
  if(endurancePitPreviousStatus!=='pit')endurancePitEnteredAt=now;
  enduranceTrackStartedAt=0;
  if(apexPitTime&&apexPitTime!=='—')endurancePitLastTime=apexPitTime;
  else if(endurancePitEnteredAt)endurancePitLastTime=formatEndurancePitDuration(now-endurancePitEnteredAt);
  endurancePitPreviousStatus='pit';
  endurancePitOutUntil=0;
  setEndurancePitOverlay('in',endurancePitLastTime);
  return true;
 }
 if(status==='track'&&endurancePitPreviousStatus==='pit'){
  // Le numéro affiché doit provenir exclusivement de la colonne STANDS Apex.
  // On ne l'incrémente plus localement : la valeur peut arriver dans la trame
  // suivant immédiatement la transition TO -> IN.
  const apexPassages=Number(f?.pit_stops);
  if(Number.isFinite(apexPassages)&&apexPassages>0)endurancePitPassageCount=apexPassages;
  if(apexPitTime&&apexPitTime!=='—')endurancePitLastTime=apexPitTime;
  else if(endurancePitEnteredAt)endurancePitLastTime=formatEndurancePitDuration(now-endurancePitEnteredAt);
  endurancePitOutUntil=now+5000;
  resetEnduranceRelayLapColor(f);
  enduranceTrackStartedAt=now;
 }
 endurancePitPreviousStatus=status;
 if(endurancePitOutUntil>now){
  // Pendant les 5 secondes d'affichage, on continue à lire la colonne STANDS.
  // Apex met parfois son compteur à jour juste après le premier message IN de
  // sortie : le libellé se recale alors immédiatement sur la valeur officielle.
  const apexPassages=Number(f?.pit_stops);
  if(Number.isFinite(apexPassages)&&apexPassages>0)endurancePitPassageCount=apexPassages;
  setEndurancePitOverlay('out',endurancePitLastTime,endurancePitPassageCount);
  return true;
 }
 if(endurancePitOutUntil&&endurancePitOutUntil<=now)endurancePitOutUntil=0;
 setEndurancePitOverlay(null);
 return false;
}


function enduranceTrackTimeValue(f){
 const status=String(f?.status||'unknown').toLowerCase();
 if(status!=='track')return '—';
 const apexValue=String(f?.track_timer||'').trim();
 // Apex expose directement le temps en piste dans les trames `|to|`.
 if(apexValue&&apexValue!=='—')return apexValue;
 // Repli local, ancré exclusivement sur la transition OUT reçue d'Apex.
 if(enduranceTrackStartedAt>0)return formatEndurancePitElapsed(Date.now()-enduranceTrackStartedAt);
 return '—';
}

function enduranceLastLapColorClass(f){
 const lastSec=lapSeconds(f?.last);
 // On met toujours à jour la référence du relais, même lorsque le tour sera
 // affiché en violet : le tour suivant doit bien être comparé à ce chrono.
 const relayImproved=enduranceRelayLapImproved(f);
 // Violet : meilleur temps absolu de toute la grille, conformément à la
 // convention automobile. La référence vert/orange reste, elle, propre au
 // pilote et au relais courant.
 const sessionBest=absoluteSessionBestSeconds();
 if(Number.isFinite(lastSec)&&Number.isFinite(sessionBest)&&Math.abs(lastSec-sessionBest)<0.0005)return 'endurance-last-purple';
 // Vert / orange : comparaison uniquement avec le meilleur du pilote sur le
 // relais courant, remis à zéro lors de chaque PIT OUT.
 if(relayImproved)return 'endurance-last-green';
 return 'endurance-last-orange';
}

let endurancePenaltyInitialized=false;
let endurancePenaltySeen=new Set();
let endurancePenaltyAlertUntil=0;
let endurancePenaltyAlert=null;
function samePenaltyTarget(p,f){
 const pd=String(p?.driver||'').trim().toLowerCase();
 const fd=String(f?.driver||state.followed_driver||'').trim().toLowerCase();
 if(pd&&fd&&pd===fd)return true;
 const pk=String(p?.kart||'').replace(/\D/g,'');
 const fk=String(f?.apex||f?.kart||'').replace(/\D/g,'');
 return Boolean(pk&&fk&&pk===fk);
}
function renderEndurancePenaltyAlert(list,f){
 // V7.2.1750 — messages automatiques de pénalité désactivés en Focus Endurance.
 // Les données de pénalité restent disponibles dans les autres écrans de Velocity.
 const banner=document.getElementById('endurancePenaltyBanner');
 if(banner)banner.classList.remove('show');
 endurancePenaltyAlert=null;
 endurancePenaltyAlertUntil=0;
}


function splitDriverMessageLines(value){
 const words=String(value||'').trim().toUpperCase().split(/\s+/).filter(Boolean);
 if(words.length<=1)return words.length?words:['—'];
 const lineCount=words.length>=7||words.join(' ').length>34?3:2;
 const lines=[];
 let start=0;
 for(let lineIndex=0;lineIndex<lineCount;lineIndex++){
  const remainingLines=lineCount-lineIndex;
  const remainingWords=words.length-start;
  if(remainingLines===1){lines.push(words.slice(start).join(' '));break}
  let bestEnd=start+1;
  let bestScore=Infinity;
  const totalRemainingLength=words.slice(start).join(' ').length;
  const target=totalRemainingLength/remainingLines;
  const maxEnd=words.length-(remainingLines-1);
  for(let end=start+1;end<=maxEnd;end++){
   const candidate=words.slice(start,end).join(' ');
   const score=Math.abs(candidate.length-target);
   if(score<bestScore){bestScore=score;bestEnd=end}
  }
  lines.push(words.slice(start,bestEnd).join(' '));
  start=bestEnd;
 }
 return lines.filter(Boolean);
}


function fitDriverMessageText(text,lineCount){
 if(!text)return;
 const host=text.parentElement;
 if(!host)return;
 const maxWidth=Math.max(1,host.clientWidth-4);
 const maxHeight=Math.max(1,host.clientHeight-4);
 let size=Math.min(
  lineCount>=3?Math.min(maxHeight/3.05,maxWidth/7):
  lineCount===2?Math.min(maxHeight/2.05,maxWidth/5.2):
  Math.min(maxHeight*.82,maxWidth/3.2),
  220
 );
 size=Math.max(18,Math.floor(size));
 text.style.fontSize=size+'px';
 for(let i=0;i<80;i++){
  const tooWide=[...text.children].some(line=>line.scrollWidth>maxWidth);
  const tooTall=text.scrollHeight>maxHeight;
  if(!tooWide&&!tooTall)break;
  size-=2;
  if(size<=18){size=18;break}
  text.style.fontSize=size+'px';
 }
 text.style.fontSize=size+'px';
}

function renderDriverMessageOverlay(){
 const host=document.getElementById('driverMessageOverlay');
 const text=document.getElementById('driverMessageText');
 if(!host||!text)return;
 const message=state?.driver_message;
 const delivered=Number(message?.delivered_at_ms);
 const duration=Number(message?.duration_ms)||15000;
 const elapsed=Date.now()-delivered;
 const focusActive=Boolean(
  document.getElementById('sprintFocus')?.classList.contains('show')||
  document.getElementById('qualificationFocus')?.classList.contains('show')||
  document.getElementById('enduranceFocus')?.classList.contains('show')
 );
 const exitDuration=320;
 const active=Boolean(focusActive&&message?.message&&Number.isFinite(delivered)&&elapsed>=0&&elapsed<duration);
 const leaving=Boolean(focusActive&&message?.message&&Number.isFinite(delivered)&&elapsed>=duration&&elapsed<duration+exitDuration);
 host.classList.toggle('show',active);
 host.classList.toggle('leaving',leaving);
 host.setAttribute('aria-hidden',(active||leaving)?'false':'true');
 if(active||leaving){
  const value=String(message.message||'').trim();
  const lines=splitDriverMessageLines(value);
  text.replaceChildren(...lines.map(line=>{
   const span=document.createElement('span');
   span.className='driver-message-line';
   span.textContent=line;
   return span;
  }));
  text.classList.toggle('message-three-lines',lines.length>=3);
  text.classList.toggle('message-two-lines',lines.length===2);
  text.classList.toggle('message-one-line',lines.length===1);
  fitDriverMessageText(text,lines.length);
 }else{
  text.textContent='—';
  text.style.removeProperty('font-size');
  text.classList.remove('message-one-line','message-two-lines','message-three-lines');
 }
}


function enduranceFocusSelectedDriver(){
 const sessionTeam=String(window.velocityRaceSession?.team_name||'').trim();
 if(sessionTeam){const exact=(state.drivers||[]).find(d=>String(d?.driver||'').trim().toLowerCase()===sessionTeam.toLowerCase());if(exact)return exact}
 return state.followed||{};
}
function fitEnduranceLastLap(){
 const el=document.getElementById('enduranceFocusLastLap');if(!el)return;
 const cell=el.closest('.endurance-focus-last-lap-cell');if(!cell)return;
 // Taille maximale avec un blanc tournant permanent, sans jamais sortir de la case.
 const style=getComputedStyle(cell),padX=(parseFloat(style.paddingLeft)||0)+(parseFloat(style.paddingRight)||0),padY=(parseFloat(style.paddingTop)||0)+(parseFloat(style.paddingBottom)||0);
 const maxW=Math.max(1,cell.clientWidth-padX-8),maxH=Math.max(1,cell.clientHeight-padY-8);
 // V7.2.173 : viser +50 % par rapport à l'ancien rendu, tout en gardant
 // l'auto-fit comme garde-fou absolu sur la largeur et la hauteur disponibles.
 let lo=36,hi=Math.max(36,Math.min(360,maxH*1.68)),best=lo;
 el.style.fontSize=hi+'px';
 for(let i=0;i<10;i++){
  const mid=(lo+hi)/2;el.style.fontSize=mid+'px';
  if(el.scrollWidth<=maxW&&el.scrollHeight<=maxH){best=mid;lo=mid}else hi=mid;
 }
 el.style.fontSize=Math.floor(best)+'px';
}
function renderEnduranceFocus(){
 const overlay=document.getElementById('enduranceFocus');if(!overlay?.classList.contains('show'))return;
 const f=enduranceFocusSelectedDriver();
 renderEndurancePitState(f);
 const endurancePenaltyList=[...(state.comment_penalties||[])].sort((a,b)=>String(b.time||b.at||'').localeCompare(String(a.time||a.at||'')));
 renderEndurancePenaltyAlert(endurancePenaltyList,f);
 const position=document.getElementById('enduranceFocusPosition');
 const name=document.getElementById('enduranceFocusName');
 const lastRankEl=document.getElementById('enduranceFocusLastRank');
 const aheadEl=document.getElementById('enduranceFocusAhead');
 const behindEl=document.getElementById('enduranceFocusBehind');
 const aheadNameEl=document.getElementById('enduranceFocusAheadName');
 const behindNameEl=document.getElementById('enduranceFocusBehindName');
 const timeEl=document.getElementById('enduranceFocusTime');
 const lastLapEl=document.getElementById('enduranceFocusLastLap');
 if(position)position.textContent=f.pos?'P'+f.pos:'—';
 if(name)name.textContent=f.driver||state.followed_driver||'—';
 const lastRank=sprintLastLapRanking(f);if(lastRankEl)lastRankEl.innerHTML=lastRank?enduranceOrdinalMarkup(lastRank.rank):'—';
 const aheadDriver=sprintDriverAhead(f);const behindDriver=sprintDriverBehind(f);
 const focusAhead=sprintGapAhead(f);const focusBehind=sprintGapBehind(f);const isLeader=Number(f.pos)===1;const hasDriverBehind=Boolean(behindDriver);
 if(aheadNameEl){aheadNameEl.textContent=aheadDriver?.driver||'—';aheadNameEl.style.display=isLeader?'none':''}
 if(aheadEl){aheadEl.textContent=focusAhead;aheadEl.style.display=isLeader?'none':''}
 if(behindEl){behindEl.textContent=focusBehind;behindEl.style.display=(!isLeader&&!hasDriverBehind)?'none':''}
 if(behindNameEl){behindNameEl.textContent=behindDriver?.driver||'—';behindNameEl.style.display=(!isLeader&&!hasDriverBehind)?'none':''}
 applyAnalyzerDeltaColors(f,aheadEl,behindEl);
 const deltasBox=overlay.querySelector('.sprint-focus-deltas');if(deltasBox)deltasBox.classList.toggle('leader-only',isLeader);
 const divider=overlay.querySelector('.sprint-focus-divider');if(divider)divider.style.display=(isLeader||!hasDriverBehind)?'none':'';
 if(timeEl){timeEl.textContent=enduranceTrackTimeValue(f);timeEl.classList.remove('time-critical')}
 if(lastLapEl){
  lastLapEl.textContent=f.last||'—';
  lastLapEl.classList.remove('endurance-last-orange','endurance-last-green','endurance-last-purple');
  lastLapEl.classList.add(enduranceLastLapColorClass(f));
  requestAnimationFrame(fitEnduranceLastLap);
 }
}

let enduranceFocusWakeLock=null;

let qualificationFocusWakeLock=null;
