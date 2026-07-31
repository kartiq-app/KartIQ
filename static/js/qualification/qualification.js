let qualificationFocusSourceMode='qualification';
async function openQualificationFocus(){
 qualificationFocusSourceMode=currentMode==='endurance'?'endurance':'qualification';
 const title=document.querySelector('#qualificationFocus .qual-focus-header span');if(title)title.textContent=qualificationFocusSourceMode==='endurance'?'Endurance':'Qualifications';
 const overlay=document.getElementById('qualificationFocus');
 if(!overlay)return;
 overlay.classList.add('show');
 document.body.classList.add('qualification-focus-active');
 renderQualificationFocus();
 try{if(document.documentElement.requestFullscreen&&!document.fullscreenElement)await document.documentElement.requestFullscreen()}catch(e){}
 try{if(screen.orientation?.lock)await screen.orientation.lock('landscape')}catch(e){}
 try{if('wakeLock' in navigator)qualificationFocusWakeLock=await navigator.wakeLock.request('screen')}catch(e){}
}
async function closeQualificationFocus(){
 document.getElementById('qualificationFocus')?.classList.remove('show');
 document.body.classList.remove('qualification-focus-active');
 try{if(qualificationFocusWakeLock){await qualificationFocusWakeLock.release();qualificationFocusWakeLock=null}}catch(e){}
 try{if(screen.orientation?.unlock)screen.orientation.unlock()}catch(e){}
 try{if(document.fullscreenElement&&document.exitFullscreen)await document.exitFullscreen()}catch(e){}
}
function qualificationPurpleBest(){
 // La cellule violette du tableau Qualification est la source de vérité visuelle :
 // elle correspond au meilleur temps absolu affiché par KartIQ/Apex pour la séance.
 const tableId=qualificationFocusSourceMode==='endurance'?'enduranceQualifTable':'qualifTable';
 const purpleCell=document.querySelector('#'+tableId+' tr td.purple');
 if(purpleCell){
  const row=purpleCell.closest('tr');
  const driverKey=row?.dataset?.driver||'';
  const driver=(state.drivers||[]).find(d=>(d.driver||String(d.pos))===driverKey);
  return {driver:driver?.driver||driverKey||'—',lap:purpleCell.textContent.trim()||driver?.best||'—'};
 }
 // Repli de sécurité si le tableau n'est pas encore peint au premier rendu.
 const ranking=qualificationRanking();
 const leader=ranking[0];
 return {driver:leader?.driver||'—',lap:leader?.best||'—'};
}
function qualificationFocusSessionStatus(){
 const laps=String(state.apex_laps_remaining||'').trim();
 const ms=liveRemainingMilliseconds();
 const time=ms===null?String(state.time_remaining||'—'):formatRemainingMilliseconds(ms);
 return {
  time:time&&time!=='—'?time:'—',
  laps:laps&&laps!=='—'?laps:'',
  critical:Number.isFinite(ms)&&ms<=120000
 };
}
function renderQualificationFocus(){
 const overlay=document.getElementById('qualificationFocus');
 if(!overlay?.classList.contains('show'))return;
 const f=state.followed||{};
 const position=document.getElementById('focusPosition');
 const followedName=document.getElementById('focusFollowedName');
 const delta=document.getElementById('focusDelta');
 const remaining=document.getElementById('focusRemaining');
 const laps=document.getElementById('focusLaps');
 const fastestName=document.getElementById('focusFastestName');
 const bestTime=document.getElementById('focusBestTime');
 if(position)position.textContent=f.pos?'P'+f.pos:'—';
 if(followedName)followedName.textContent=f.driver||state.followed_driver||'—';
 if(delta){const value=qualificationDeltaFor(f);delta.textContent=value;const leader=qualificationDeltaIsLeader(f);delta.classList.toggle('delta-good',leader);delta.classList.toggle('delta-orange',!leader&&value!=='--'&&value!=='—')}
 const sessionStatus=qualificationFocusSessionStatus();
 if(remaining){remaining.textContent=sessionStatus.time;remaining.classList.toggle('time-critical',sessionStatus.critical)}
 if(laps){laps.textContent=sessionStatus.laps||'—';laps.classList.toggle('is-empty',!sessionStatus.laps)}
 const purpleBest=qualificationPurpleBest();
 if(fastestName)fastestName.textContent=purpleBest.driver;
 if(bestTime)bestTime.textContent=purpleBest.lap;
}

const rowLapSignatures=new Map();
const endurancePitStatuses=new Map();
const enduranceOutUntil=new Map();
