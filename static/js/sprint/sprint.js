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
 overlay.classList.add('show');document.body.classList.add('endurance-focus-active');renderEnduranceFocus();
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
 const raw=String(sprintDeltaFor(driver)||'--').trim();
 if(!raw||raw==='—'||raw==='--')return '--';
 return `-${raw.replace(/^[+-]/,'')}`;
}
function sprintGapBehind(driver){
 const behind=sprintDriverBehind(driver);if(!behind)return '--';
 const raw=String(behind.interval||behind.gap||'--').trim();
 if(!raw||raw==='—'||raw==='--')return '--';
 return `+${raw.replace(/^[+-]/,'')}`;
}
function penaltyTime(p){if(p?.time)return p.time;const at=String(p?.at||'');return at.length>=16?at.slice(11,16):'--:--'}
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
function sprintLastLapRanking(driver){
 const valid=(state.drivers||[]).map(d=>({...d,_lastSec:lapSeconds(d.last)})).filter(d=>Number.isFinite(d._lastSec)).sort((a,b)=>a._lastSec-b._lastSec);
 const target=valid.find(d=>d.driver===driver?.driver);if(!target)return null;
 const rank=1+valid.filter(d=>d._lastSec<target._lastSec-0.0005).length;
 return {rank,label:`${frenchOrdinal(rank).number}${frenchOrdinal(rank).suffix} temps`,driver:target.driver,lap:target.last};
}
function renderSprintFocus(){
 const overlay=document.getElementById('sprintFocus');if(!overlay?.classList.contains('show'))return;
 const f=state.followed||{};sprintFocusPosition.textContent=f.pos?'P'+f.pos:'—';sprintFocusName.textContent=f.driver||state.followed_driver||'—';
 const lastRank=sprintLastLapRanking(f);sprintFocusLastRank.innerHTML=lastRank?frenchOrdinalMarkup(lastRank.rank):'—';
 const fastest=sprintFastestLastLapForFollowed(f)||{};const fastestDriver=fastest.driver||'—';const fastestLap=fastest.last||'—';const fastestLapSeconds=lapSeconds(fastestLap);const sessionBestSeconds=absoluteSessionBestSeconds();const isAbsoluteSessionBest=Number.isFinite(fastestLapSeconds)&&Number.isFinite(sessionBestSeconds)&&Math.abs(fastestLapSeconds-sessionBestSeconds)<0.0005;const fastestColorClass=isAbsoluteSessionBest?'fastest-session-best':(fastest.last_improved_personal_best?'fastest-lap-green':'fastest-lap-orange');sprintFocusFastestLast.innerHTML=`🔥 ${fastestDriver} <span class="sprint-focus-fastest-last-time ${fastestColorClass}">${fastestLap}</span>`;
 const focusAhead=sprintGapAhead(f);const focusBehind=sprintGapBehind(f);const isLeader=Number(f.pos)===1;const hasDriverBehind=Boolean(sprintDriverBehind(f));
 sprintFocusAhead.textContent=focusAhead;sprintFocusBehind.textContent=focusBehind;
 // P1 : uniquement l'écart vert avec P2. Dernier : uniquement l'écart orange avec le pilote devant.
 sprintFocusAhead.style.display=isLeader?'none':'';
 sprintFocusBehind.style.display=(!isLeader&&!hasDriverBehind)?'none':'';
 const sprintFocusDivider=overlay.querySelector('.sprint-focus-divider');if(sprintFocusDivider)sprintFocusDivider.style.display=(isLeader||!hasDriverBehind)?'none':'';
 const ms=liveRemainingMilliseconds();sprintFocusTime.textContent=ms===null?(state.time_remaining||'—'):formatRemainingMilliseconds(ms);sprintFocusTime.classList.toggle('time-critical',Number.isFinite(ms)&&ms<=120000);
 const laps=String(state.apex_laps_remaining||'—');sprintFocusLaps.textContent=(laps&&laps!=='—')?(laps.toLowerCase().includes('tour')?laps:`${laps} tours`):'—';
 const list=[...(state.penalties||[])].sort((a,b)=>String(b.at||'').localeCompare(String(a.at||'')));
 sprintFocusPenalties.innerHTML=list.length?list.map(p=>`<div class="sprint-focus-penalty-row"><small class="sprint-focus-penalty-time">${penaltyTime(p)}</small><b class="sprint-focus-penalty-name">${p.driver||'—'}</b><b class="sprint-focus-penalty-value">${p.penalty||'—'}</b></div>`).join(''):'<div class="sprint-focus-empty">Aucune pénalité</div>';
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

function formatEndurancePitElapsed(ms){
 const total=Math.max(0,Math.floor(Number(ms||0)/1000));
 const hours=Math.floor(total/3600);
 const minutes=Math.floor((total%3600)/60);
 const seconds=total%60;
 const pad=n=>String(n).padStart(2,'0');
 return hours?`${pad(hours)}:${pad(minutes)}:${pad(seconds)}`:`${pad(minutes)}:${pad(seconds)}`;
}
function setEndurancePitOverlay(mode,timeValue='—'){
 const overlay=document.getElementById('endurancePitOverlay');
 const inTime=document.getElementById('endurancePitInTime');
 const outMessage=document.getElementById('endurancePitOutMessage');
 const outTime=document.getElementById('endurancePitOutTime');
 if(!overlay)return;
 overlay.classList.toggle('show',Boolean(mode));
 overlay.classList.toggle('pit-in-active',mode==='in');
 overlay.classList.toggle('pit-out-active',mode==='out');
 if(inTime)inTime.textContent=timeValue||'—';
 if(outTime)outTime.textContent=timeValue||'—';
 if(outMessage)outMessage.setAttribute('aria-hidden',mode==='out'?'false':'true');
}
function simulateEndurancePitIn(){
 endurancePitSimulation={mode:'in',startedAt:Date.now(),duration:'—'};
 endurancePitOutUntil=0;
 renderEnduranceFocus();
}
function simulateEndurancePitOut(){
 const now=Date.now();
 let duration=endurancePitLastTime;
 if(endurancePitSimulation?.mode==='in')duration=formatEndurancePitElapsed(now-endurancePitSimulation.startedAt);
 endurancePitLastTime=duration||'—';
 endurancePitSimulation={mode:'out',startedAt:now,duration:endurancePitLastTime};
 endurancePitOutUntil=now+5000;
 renderEnduranceFocus();
}
function resetEndurancePitSimulation(){
 endurancePitSimulation=null;
 endurancePitOutUntil=0;
 endurancePitPreviousStatus='unknown';
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
   setEndurancePitOverlay('out',endurancePitSimulation.duration||endurancePitLastTime);
   return true;
  }
  endurancePitSimulation=null;
  endurancePitOutUntil=0;
 }
 const status=String(f?.status||'unknown').toLowerCase();
 const apexPitTime=String(f?.pit_timer||'').trim();
 if(status==='pit'){
  if(endurancePitPreviousStatus!=='pit')endurancePitEnteredAt=now;
  if(apexPitTime&&apexPitTime!=='—')endurancePitLastTime=apexPitTime;
  else if(endurancePitEnteredAt)endurancePitLastTime=formatEndurancePitElapsed(now-endurancePitEnteredAt);
  endurancePitPreviousStatus='pit';
  endurancePitOutUntil=0;
  setEndurancePitOverlay('in',endurancePitLastTime);
  return true;
 }
 if(status==='track'&&endurancePitPreviousStatus==='pit'){
  if(apexPitTime&&apexPitTime!=='—')endurancePitLastTime=apexPitTime;
  else if(endurancePitEnteredAt)endurancePitLastTime=formatEndurancePitElapsed(now-endurancePitEnteredAt);
  endurancePitOutUntil=now+5000;
 }
 endurancePitPreviousStatus=status;
 if(endurancePitOutUntil>now){
  setEndurancePitOverlay('out',endurancePitLastTime);
  return true;
 }
 if(endurancePitOutUntil&&endurancePitOutUntil<=now)endurancePitOutUntil=0;
 setEndurancePitOverlay(null);
 return false;
}

function renderEnduranceFocus(){
 const overlay=document.getElementById('enduranceFocus');if(!overlay?.classList.contains('show'))return;
 const f=state.followed||{};
 renderEndurancePitState(f);
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
 const divider=overlay.querySelector('.sprint-focus-divider');if(divider)divider.style.display=(isLeader||!hasDriverBehind)?'none':'';
 const ms=liveRemainingMilliseconds();if(timeEl){timeEl.textContent=ms===null?(state.time_remaining||'—'):formatRemainingMilliseconds(ms);timeEl.classList.toggle('time-critical',Number.isFinite(ms)&&ms<=120000)}
 if(lastLapEl)lastLapEl.textContent=f.last||'—';
}

let enduranceFocusWakeLock=null;

let qualificationFocusWakeLock=null;
