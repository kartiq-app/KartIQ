async function openSprintFocus(){
 const overlay=document.getElementById('sprintFocus');if(!overlay)return;
 overlay.classList.add('show');document.body.classList.add('sprint-focus-active');renderSprintFocus();
 try{if(document.documentElement.requestFullscreen&&!document.fullscreenElement)await document.documentElement.requestFullscreen()}catch(e){}
 try{if(screen.orientation?.lock)await screen.orientation.lock('landscape')}catch(e){}
 try{if('wakeLock' in navigator)sprintFocusWakeLock=await navigator.wakeLock.request('screen')}catch(e){}
}
async function closeSprintFocus(){
 document.getElementById('sprintFocus')?.classList.remove('show');document.body.classList.remove('sprint-focus-active');
 try{if(sprintFocusWakeLock){await sprintFocusWakeLock.release();sprintFocusWakeLock=null}}catch(e){}
 try{if(screen.orientation?.unlock)screen.orientation.unlock()}catch(e){}
 try{if(document.fullscreenElement&&document.exitFullscreen)await document.exitFullscreen()}catch(e){}
}
async function openEnduranceFocus(){
 const overlay=document.getElementById('enduranceFocus');if(!overlay)return;
 overlay.classList.add('show');document.body.classList.add('endurance-focus-active');endurancePenaltyInitialized=false;endurancePenaltySeen.clear();endurancePenaltyAlert=null;endurancePenaltyAlertUntil=0;renderEnduranceFocus();
 try{if(document.documentElement.requestFullscreen&&!document.fullscreenElement)await document.documentElement.requestFullscreen()}catch(e){}
 try{if(screen.orientation?.lock)await screen.orientation.lock('landscape')}catch(e){}
 try{if('wakeLock' in navigator)enduranceFocusWakeLock=await navigator.wakeLock.request('screen')}catch(e){}
}
async function closeEnduranceFocus(){
 document.getElementById('enduranceFocus')?.classList.remove('show');document.body.classList.remove('endurance-focus-active');
 setEndurancePitOverlay(null);
 try{if(enduranceFocusWakeLock){await enduranceFocusWakeLock.release();enduranceFocusWakeLock=null}}catch(e){}
 try{if(screen.orientation?.unlock)screen.orientation.unlock()}catch(e){}
 try{if(document.fullscreenElement&&document.exitFullscreen)await document.exitFullscreen()}catch(e){}
}

function sprintDriverAhead(driver){if(!driver?.pos||Number(driver.pos)<=1)return null;return (state.drivers||[]).find(d=>Number(d.pos)===Number(driver.pos)-1)||null}
function sprintDriverBehind(driver){if(!driver?.pos)return null;return (state.drivers||[]).find(d=>Number(d.pos)===Number(driver.pos)+1)||null}
function sprintGapAhead(driver){
 const ahead=sprintDriverAhead(driver);if(!ahead)return '--';
 return formatRaceInterval(driver,ahead,'-');
}
function sprintGapBehind(driver){
 const behind=sprintDriverBehind(driver);if(!behind)return '--';
 return formatRaceInterval(behind,driver,'+');
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
 const valid=(state.drivers||[]).map(d=>({...d,_lastSec:lapSeconds(d.last)})).filter(d=>Number.isFinite(d._lastSec)).sort((a,b)=>a._lastSec-b._lastSec);
 const target=valid.find(d=>d.driver===driver?.driver);if(!target)return null;
 const rank=1+valid.filter(d=>d._lastSec<target._lastSec-0.0005).length;
 return {rank,label:`${frenchOrdinal(rank).number}${frenchOrdinal(rank).suffix} temps`,driver:target.driver,lap:target.last};
}
let sprintFocusPenaltyInitialized=false;
let sprintFocusPenaltySeen=new Set();
let sprintFocusPenaltyAlertUntil=0;
let sprintFocusPenaltyAlert=null;

function sprintFocusPenaltyKey(p){return String(p?.id||`${p?.time||''}|${p?.driver||''}|${p?.penalty||p?.comment||''}`)}
function sprintFocusPenaltyListMarkup(list){
 return list.length?list.map(p=>`<div class="sprint-focus-penalty-row sprint-focus-penalty-row-compact" title="${escapePenaltyHtml(fullPenaltyText(p))}"><span class="sprint-focus-penalty-one-line">${escapePenaltyHtml(compactPenaltyText(p))}</span></div>`).join(''):'<div class="sprint-focus-empty">Aucune pénalité</div>';
}
function renderSprintFocusPenalties(list){
 const cell=document.querySelector('#sprintFocus .sprint-focus-penalty-cell');
 const now=Date.now();
 if(!sprintFocusPenaltyInitialized){list.forEach(p=>sprintFocusPenaltySeen.add(sprintFocusPenaltyKey(p)));sprintFocusPenaltyInitialized=true}
 const newest=list.find(p=>!sprintFocusPenaltySeen.has(sprintFocusPenaltyKey(p)));
 if(newest){
  list.forEach(p=>sprintFocusPenaltySeen.add(sprintFocusPenaltyKey(p)));
  sprintFocusPenaltyAlert=newest;sprintFocusPenaltyAlertUntil=now+7000;
 }
 const alertActive=sprintFocusPenaltyAlert&&now<sprintFocusPenaltyAlertUntil;
 cell?.classList.toggle('penalty-alert-active',Boolean(alertActive));
 if(alertActive){
  sprintFocusPenalties.innerHTML=`<div class="sprint-focus-penalty-alert"><span class="sprint-focus-penalty-alert-one-line">${escapePenaltyHtml(compactPenaltyText(sprintFocusPenaltyAlert))}</span></div>`;
 }else{
  sprintFocusPenaltyAlert=null;
  sprintFocusPenalties.innerHTML=sprintFocusPenaltyListMarkup(list);
 }
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
 const f=state.followed||{};sprintFocusPosition.textContent=f.pos?'P'+f.pos:'—';sprintFocusName.textContent=f.driver||state.followed_driver||'—';
 const lastRank=sprintLastLapRanking(f);sprintFocusLastRank.innerHTML=lastRank?sprintFocusRankMarkup(lastRank.rank):'—';
 const fastest=sprintFastestLastLapForFollowed(f)||{};const fastestDriver=fastest.driver||'—';const fastestLap=fastest.last||'—';const fastestLapSeconds=lapSeconds(fastestLap);const sessionBestSeconds=absoluteSessionBestSeconds();const isAbsoluteSessionBest=Number.isFinite(fastestLapSeconds)&&Number.isFinite(sessionBestSeconds)&&Math.abs(fastestLapSeconds-sessionBestSeconds)<0.0005;const fastestColorClass=isAbsoluteSessionBest?'fastest-session-best':(fastest.last_improved_personal_best?'fastest-lap-green':'fastest-lap-orange');sprintFocusFastestLast.innerHTML=`<span class="sprint-focus-fastest-last-icon">🔥</span><span class="sprint-focus-fastest-last-name" title="${fastestDriver}">${fastestDriver}</span><span class="sprint-focus-fastest-last-time ${fastestColorClass}">${fastestLap}</span>`;
 const focusAhead=sprintGapAhead(f);const focusBehind=sprintGapBehind(f);const isLeader=Number(f.pos)===1;const hasDriverBehind=Boolean(sprintDriverBehind(f));
 sprintFocusAhead.textContent=focusAhead;sprintFocusBehind.textContent=focusBehind;applyAnalyzerDeltaColors(f,sprintFocusAhead,sprintFocusBehind);
 const sprintFocusDeltas=overlay.querySelector('.sprint-focus-deltas');
 if(sprintFocusDeltas)sprintFocusDeltas.classList.toggle('leader-only',isLeader);
 // P1 : uniquement l'écart vert avec P2, centré. Dernier : uniquement l'écart orange avec le pilote devant.
 sprintFocusAhead.style.display=isLeader?'none':'';
 sprintFocusBehind.style.display=(!isLeader&&!hasDriverBehind)?'none':'';
 const sprintFocusDivider=overlay.querySelector('.sprint-focus-divider');if(sprintFocusDivider)sprintFocusDivider.style.display=(isLeader||!hasDriverBehind)?'none':'';
 const lapMode=raceUsesLapTarget();const ms=lapMode?null:liveRemainingMilliseconds();sprintFocusTime.textContent=lapMode?formatRaceLapProgress():(ms===null?(state.time_remaining||'—'):formatRemainingMilliseconds(ms));sprintFocusTime.classList.toggle('time-critical',!lapMode&&Number.isFinite(ms)&&ms<=120000);
 const laps=String(state.apex_laps_remaining||'—');sprintFocusLaps.textContent=lapMode?'':((laps&&laps!=='—')?(laps.toLowerCase().includes('tour')?laps:`${laps} tours`):'—');
 const list=[...(state.comment_penalties||[])].sort((a,b)=>String(b.time||b.at||'').localeCompare(String(a.time||a.at||'')));
 renderSprintFocusPenalties(list);
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

function formatEndurancePitElapsed(ms){
 const total=Math.max(0,Math.floor(Number(ms||0)/1000));
 const hours=Math.floor(total/3600);
 const minutes=Math.floor((total%3600)/60);
 const seconds=total%60;
 const pad=n=>String(n).padStart(2,'0');
 return hours?`${pad(hours)}:${pad(minutes)}:${pad(seconds)}`:`${pad(minutes)}:${pad(seconds)}`;
}
function formatEndurancePitClock(value){
 const raw=String(value??'').trim();
 if(!raw||raw==='—')return '00:00';
 const clean=raw.replace(/\.$/,'');
 if(/^\d+$/.test(clean)){
  const total=Math.max(0,Number(clean));
  return `${String(Math.floor(total/60)).padStart(2,'0')}:${String(total%60).padStart(2,'0')}`;
 }
 const parts=clean.split(':').map(v=>Number(v));
 if(parts.length===2&&parts.every(Number.isFinite))return `${String(parts[0]).padStart(2,'0')}:${String(Math.floor(parts[1])).padStart(2,'0')}`;
 if(parts.length===3&&parts.every(Number.isFinite))return `${String(parts[0]*60+parts[1]).padStart(2,'0')}:${String(Math.floor(parts[2])).padStart(2,'0')}`;
 return clean;
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
 if(inTime)inTime.textContent=timeValue||'—';
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
 if(endurancePitSimulation?.mode==='in')duration=formatEndurancePitElapsed(now-endurancePitSimulation.startedAt);
 endurancePitLastTime=duration||'—';
 endurancePitPassageCount=Math.max(1,endurancePitPassageCount+1);
 endurancePitSimulation={mode:'out',startedAt:now,duration:endurancePitLastTime,passageCount:endurancePitPassageCount};
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
  const value=formatEndurancePitElapsed(now-endurancePitSimulation.startedAt);
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
  else if(endurancePitEnteredAt)endurancePitLastTime=formatEndurancePitElapsed(now-endurancePitEnteredAt);
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
  else if(endurancePitEnteredAt)endurancePitLastTime=formatEndurancePitElapsed(now-endurancePitEnteredAt);
  endurancePitOutUntil=now+5000;
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
 const absoluteBest=absoluteSessionBestSeconds();
 if(Number.isFinite(lastSec)&&Number.isFinite(absoluteBest)&&Math.abs(lastSec-absoluteBest)<0.0005)return 'endurance-last-purple';
 if(f?.last_improved_personal_best)return 'endurance-last-green';
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
 const banner=document.getElementById('endurancePenaltyBanner');
 const nameEl=document.getElementById('endurancePenaltyBannerName');
 const textEl=document.getElementById('endurancePenaltyBannerText');
 if(!banner)return;
 const relevant=list.filter(p=>samePenaltyTarget(p,f));
 if(!endurancePenaltyInitialized){relevant.forEach(p=>endurancePenaltySeen.add(sprintFocusPenaltyKey(p)));endurancePenaltyInitialized=true}
 const newest=relevant.find(p=>!endurancePenaltySeen.has(sprintFocusPenaltyKey(p)));
 if(newest){
  relevant.forEach(p=>endurancePenaltySeen.add(sprintFocusPenaltyKey(p)));
  endurancePenaltyAlert=newest;endurancePenaltyAlertUntil=Date.now()+15000;
 }
 const active=endurancePenaltyAlert&&Date.now()<endurancePenaltyAlertUntil;
 banner.classList.toggle('show',Boolean(active));
 if(active){
  if(nameEl)nameEl.textContent=endurancePenaltyAlert.driver||f?.driver||state.followed_driver||'—';
  if(textEl)textEl.textContent=penaltyRawText(endurancePenaltyAlert)||'Pénalité';
 }else endurancePenaltyAlert=null;
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
 const active=Boolean(focusActive&&message?.message&&Number.isFinite(delivered)&&elapsed>=0&&elapsed<duration);
 host.classList.toggle('show',active);
 host.setAttribute('aria-hidden',active?'false':'true');
 if(active){
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


function renderEnduranceFocus(){
 const overlay=document.getElementById('enduranceFocus');if(!overlay?.classList.contains('show'))return;
 const f=state.followed||{};
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
 }
}

let enduranceFocusWakeLock=null;

let qualificationFocusWakeLock=null;
