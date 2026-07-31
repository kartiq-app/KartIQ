let state={},currentMode='home',lastCrossEvent=null,lastGenericEvent=null,crossTimer=null,circuitSignature='';
let autoBriceFollowApplied=false,manualFollowOverride=false,autoBriceFollowInFlight=false;
let remainingCountdownMs=null,remainingCountdownPerfAt=0,remainingCountdownUsesHours=false,remainingCountdownDirectSyncAt=0;
const isEmbeddedPreview=new URLSearchParams(location.search).get('preview')==='1';
let iphoneOrientation='portrait';
function resetPreviewViewport(){const frame=document.getElementById('iphoneFrame');try{const w=frame.contentWindow;const d=frame.contentDocument;if(w){w.scrollTo(0,0);requestAnimationFrame(()=>w.scrollTo(0,0))}if(d){d.documentElement.scrollLeft=0;d.documentElement.scrollTop=0;d.body.scrollLeft=0;d.body.scrollTop=0;const active=d.querySelector('.screen.active');if(active)active.scrollTo(0,0)}}catch(e){}}
function setIphoneOrientation(orientation){iphoneOrientation=orientation==='landscape'?'landscape':'portrait';const stage=document.getElementById('iphoneStage');const landscape=iphoneOrientation==='landscape';stage.classList.toggle('landscape',landscape);document.getElementById('iphonePreviewTitle').textContent=landscape?'iPhone SE — 667 × 375 px':'iPhone SE — 375 × 667 px';document.getElementById('portraitBtn').classList.toggle('active',!landscape);document.getElementById('landscapeBtn').classList.toggle('active',landscape);setTimeout(resetPreviewViewport,60);setTimeout(resetPreviewViewport,250)}
function toggleIphonePreview(force){const panel=document.getElementById('iphonePreview');const open=typeof force==='boolean'?force:!panel.classList.contains('show');if(open){const frame=document.getElementById('iphoneFrame');if(!frame.src)frame.src=location.pathname+'?preview=1';setIphoneOrientation(iphoneOrientation);panel.classList.add('show');document.body.style.overflow='hidden'}else{panel.classList.remove('show');document.body.style.overflow=''}}
if(isEmbeddedPreview){document.documentElement.classList.add('preview-embedded');document.addEventListener('DOMContentLoaded',()=>{document.body.classList.add('preview-embedded');const b=document.getElementById('previewBtn');if(b)b.style.display='none'})}

async function api(url,body={}){await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});await load()}
function syncRemainingFromApex(milliseconds,{direct=false}={}){
 const ms=Number(milliseconds);
 if(!Number.isFinite(ms)||ms<0)return false;
 remainingCountdownMs=Math.max(0,ms);
 remainingCountdownPerfAt=performance.now();
 remainingCountdownUsesHours=ms>=3600000;
 if(direct)remainingCountdownDirectSyncAt=Date.now();
 updateRemainingDisplay();
 return true;
}
function ingestApexCountdown(frame){
 const matches=[...String(frame||'').matchAll(/(?:^|[\r\n])dyn1\|countdown\|(\d+)/g)];
 if(!matches.length)return false;
 return syncRemainingFromApex(Number(matches[matches.length-1][1]),{direct:true});
}
function syncRemainingFromState(nextState){
 const endAt=Number(nextState?.time_remaining_end_at_ms);
 let candidate=null;
 if(Number.isFinite(endAt)){
   candidate=Math.max(0,endAt-Date.now());
 }else{
   const ms=Number(nextState?.time_remaining_ms);
   const serverAt=Number(nextState?.time_remaining_updated_at_ms);
   if(Number.isFinite(ms)&&ms>=0&&Number.isFinite(serverAt))candidate=Math.max(0,ms-Math.max(0,Date.now()-serverAt));
 }
 if(candidate===null)return;
 const current=liveRemainingMilliseconds();
 // La trame WebSocket reçue directement dans ce navigateur est la source
 // prioritaire. L'état serveur sert au chargement initial ou en secours.
 const directIsFresh=remainingCountdownDirectSyncAt>0&&(Date.now()-remainingCountdownDirectSyncAt)<35000;
 if(current===null||(!directIsFresh&&Math.abs(current-candidate)>500))syncRemainingFromApex(candidate);
}
function liveRemainingMilliseconds(){
 if(!Number.isFinite(remainingCountdownMs)||!remainingCountdownPerfAt)return null;
 return Math.max(0,remainingCountdownMs-(performance.now()-remainingCountdownPerfAt));
}
function formatRemainingMilliseconds(ms){
 if(!Number.isFinite(ms))return '—';
 // Apex conserve la seconde en cours jusqu'à son terme : on arrondit donc
 // vers le haut plutôt que d'afficher la seconde suivante trop tôt.
 const total=Math.max(0,Math.ceil(ms/1000));
 const hours=Math.floor(total/3600),minutes=Math.floor((total%3600)/60),seconds=total%60;
 if(remainingCountdownUsesHours||hours>0)return `${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}`;
 return `${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}`;
}
function updateRemainingDisplay(){
 const ms=liveRemainingMilliseconds();
 const display=ms===null?(state.time_remaining||'—'):formatRemainingMilliseconds(ms);
 const seconds=ms===null?null:ms/1000;
 const q=document.getElementById('qRemaining');if(q){q.textContent=display;q.classList.toggle('time-critical',Number.isFinite(seconds)&&seconds<120)}
 const sp=document.getElementById('sRemaining');if(sp){sp.textContent=display;sp.classList.toggle('time-critical',Number.isFinite(seconds)&&seconds<120)}
 const en=document.getElementById('eRemaining');if(en){en.textContent=display;en.classList.toggle('time-critical',Number.isFinite(seconds)&&seconds<120)}
 renderQualificationFocus();
 renderSprintFocus();
}
async function load(){
 const nextState=await fetch('/api/state').then(r=>r.json());
 syncRemainingFromState(nextState);
 state=nextState;
 if(!(state.drivers||[]).length){autoBriceFollowApplied=false;manualFollowOverride=false}
 render();
 maybeAutoFollowBrice();
 ensureApexBrowserConnection();
}
let apexBrowserSocket=null;
let apexBrowserCircuitId=null;
let apexBrowserConnecting=false;
async function sendApexStatus(status,connection,error=null){try{await fetch('/api/apex/status',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({status,connection,error})})}catch(e){}}
function closeApexBrowserSocket(){if(apexBrowserSocket){apexBrowserSocket.onclose=null;try{apexBrowserSocket.close()}catch(e){}apexBrowserSocket=null}apexBrowserConnecting=false}
function ensureApexBrowserConnection(){if(!state?.circuit_id)return;if(apexBrowserCircuitId!==state.circuit_id||(!apexBrowserSocket&&!apexBrowserConnecting))connectApexBrowser(false)}
function connectApexBrowser(force=false){
 const circuit=(state?.circuits||[]).find(c=>c.id===state.circuit_id);
 if(!circuit?.websocket_url)return;
 if(!force&&apexBrowserSocket&&apexBrowserCircuitId===circuit.id&&[0,1].includes(apexBrowserSocket.readyState))return;
 closeApexBrowserSocket();apexBrowserCircuitId=circuit.id;apexBrowserConnecting=true;sendApexStatus('connecting','CONNEXION APEX…');
 try{apexBrowserSocket=new WebSocket(circuit.websocket_url)}catch(err){apexBrowserConnecting=false;sendApexStatus('error','ERREUR LIVE',err.message);return}
 apexBrowserSocket.addEventListener('open',()=>{apexBrowserConnecting=false;sendApexStatus('connected','LIVE • CONNECTÉ');if(circuit.session_request){apexBrowserSocket.send(circuit.session_request);fetch('/api/developer/outbound',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:circuit.session_request})}).catch(()=>{})}});
 apexBrowserSocket.addEventListener('message',async e=>{const frame=typeof e.data==='string'?e.data:e.data instanceof Blob?await e.data.text():String(e.data);ingestApexCountdown(frame);try{const r=await fetch('/api/apex/frame',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({frame,circuit_id:circuit.id})});if(!r.ok){const d=await r.json();throw new Error(d.error||'Décodage Apex impossible')}}catch(err){sendApexStatus('error','ERREUR DÉCODAGE',err.message)}});
 apexBrowserSocket.addEventListener('error',()=>sendApexStatus('error','ERREUR LIVE','Connexion WebSocket Apex impossible'));
 apexBrowserSocket.addEventListener('close',e=>{apexBrowserSocket=null;apexBrowserConnecting=false;sendApexStatus('closed','LIVE DÉCONNECTÉ',`Code ${e.code}`);setTimeout(()=>{if(state?.circuit_id===apexBrowserCircuitId)connectApexBrowser(false)},5000)});
}
function setModeClass(mode){document.body.classList.remove('current-home','current-qualification','current-sprint','current-endurance');document.body.classList.add('current-'+mode)}
function showHome(){currentMode='home';setModeClass('home');document.querySelectorAll('.screen').forEach(x=>x.classList.remove('active'));document.getElementById('home').classList.add('active');document.querySelectorAll('.mode-btn').forEach(x=>x.classList.remove('active'))}
function showMode(mode){
 if(mode!=='home'&&!state?.circuit_id){
  const picker=document.getElementById('homeCircuit');
  picker?.classList.remove('needs-selection');
  void picker?.offsetWidth;
  picker?.classList.add('needs-selection');
  document.getElementById('circuitSelect')?.focus();
  return;
 }
 currentMode=mode;setModeClass(mode);maybeAutoFollowBrice();document.querySelectorAll('.screen').forEach(x=>x.classList.remove('active'));const screen=document.getElementById(mode);screen.classList.add('active','screen-enter');setTimeout(()=>screen.classList.remove('screen-enter'),220);document.querySelectorAll('.mode-btn').forEach(x=>x.classList.toggle('active',x.dataset.mode===mode));if(mode!=='home')api('/api/mode',{mode})
}

let sprintFocusWakeLock=null;
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
 const fastest=state.fastest_last_lap||{};sprintFocusFastestLast.innerHTML=`🔥 ${fastest.driver||'—'} <span class="sprint-focus-fastest-last-time">${fastest.lap||'—'}</span>`;
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

let qualificationFocusWakeLock=null;
async function openQualificationFocus(){
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
 const purpleCell=document.querySelector('#qualifTable tr td.purple');
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
function endurancePitBadge(driver){
 const key=String(driver.apex_row??driver.driver??driver.pos);
 const current=driver.status||'unknown';
 const previous=endurancePitStatuses.get(key);
 const now=Date.now();
 if(current==='pit'){
  enduranceOutUntil.delete(key);
  endurancePitStatuses.set(key,current);
  return '<span class="pit-status-badge pit-in">IN</span>';
 }
 if(current==='track'&&previous==='pit')enduranceOutUntil.set(key,now+3000);
 endurancePitStatuses.set(key,current);
 const until=enduranceOutUntil.get(key)||0;
 if(current==='track'&&until>now)return '<span class="pit-status-badge pit-out">OUT</span>';
 if(until&&until<=now)enduranceOutUntil.delete(key);
 return '';
}
function rows(target,cols){
 const el=document.getElementById(target);const previousRects=new Map([...el.querySelectorAll('tr[data-driver]')].map(tr=>[tr.dataset.driver,tr.getBoundingClientRect()]));
 const fragment=document.createDocumentFragment();
 state.drivers.forEach(d=>{const tr=document.createElement('tr');const key=d.driver||String(d.pos);const signature=String(d.laps)+'|'+String(d.last);const signatureKey=target+'|'+key;const previousSignature=rowLapSignatures.get(signatureKey);tr.dataset.driver=key;tr.className='clickable'+(d.driver===state.followed_driver?' followed':'')+((target==='qualifTable'||target==='enduranceTable')&&previousSignature&&previousSignature!==signature?' lap-flash':'');tr.onclick=()=>followDriver(d.driver);tr.innerHTML=cols(d);fragment.appendChild(tr);rowLapSignatures.set(signatureKey,signature)});
 el.replaceChildren(fragment);
 requestAnimationFrame(()=>{[...el.querySelectorAll('tr[data-driver]')].forEach(tr=>{const oldRect=previousRects.get(tr.dataset.driver);if(!oldRect)return;const newRect=tr.getBoundingClientRect();const dy=oldRect.top-newRect.top;if(Math.abs(dy)>1){tr.style.transition='none';tr.style.transform=`translateY(${dy}px)`;requestAnimationFrame(()=>{tr.style.transition='transform .48s cubic-bezier(.22,.8,.2,1)';tr.style.transform='translateY(0)'})}})});
}
function absoluteSessionBestSeconds(){
 const valid=(state.drivers||[]).map(d=>parseLapTime(d.best)).filter(Number.isFinite);
 return valid.length?Math.min(...valid):Number.POSITIVE_INFINITY;
}
function lapTimeClass(driver, value, kind='last'){
 const valueSeconds=parseLapTime(value);
 // Le meilleur absolu est recalculé directement depuis les lignes affichées.
 // Cela évite les différences de format Apex entre RKO, Dunois et les autres pistes.
 const sessionSeconds=absoluteSessionBestSeconds();
 if(kind==='best'&&Number.isFinite(valueSeconds)&&Number.isFinite(sessionSeconds)&&Math.abs(valueSeconds-sessionSeconds)<0.0005)return 'purple';
 if(kind==='best')return 'green';
 const driverBestSeconds=parseLapTime(driver?.best);
 if(Number.isFinite(valueSeconds)&&Number.isFinite(driverBestSeconds)&&Math.abs(valueSeconds-driverBestSeconds)<0.0005)return 'green';
 return 'yellow';
}
function formatDriverName(fullName){
 const raw=(fullName||'—').trim();
 if(raw==='—')return '—';
 const parts=raw.split(/\s+/);
 if(parts.length===1)return `<span class="driver-last">${parts[0]}</span>`;
 const first=parts.shift();
 const last=parts.join(' ');
 return `<span class="driver-name"><span class="driver-first">${first}</span><span class="driver-last">${last}</span></span>`;
}
function validKartNumber(driver){
 const kart=String(driver?.apex??'').trim();
 return kart&&kart!=='—'&&kart!=='-'?kart:'';
}
function rankingHasKartColumn(){
 return (state.drivers||[]).some(d=>Boolean(validKartNumber(d)));
}
function formatRankingDriver(driver){
 return `<span class="ranking-driver-cell">${formatDriverName(driver?.driver)}</span>`;
}
function setDriverName(el,fullName){el.innerHTML=formatDriverName(fullName)}
function formatDriverSurname(fullName){const raw=(fullName||'—').trim();if(raw==='—')return '—';const parts=raw.split(/\s+/);return `<span class="driver-last">${parts.length>1?parts.slice(1).join(' '):parts[0]}</span>`;}
function positionClass(pos,extra=''){return `pos${extra?' '+extra:''}`}
function parseLapTime(value){const m=String(value||'').match(/^(?:(\d+):)?(\d+)(?:[.,](\d+))?$/);if(!m)return Number.POSITIVE_INFINITY;return (Number(m[1]||0)*60)+Number(m[2]||0)+Number('0.'+(m[3]||0))}
function gapWithMarkup(label,driver){return `<span class="gap-label">${label}</span> ${formatDriverName(driver||'—')}`}
function qualificationRanking(){return [...(state.drivers||[])].filter(d=>Number.isFinite(parseLapTime(d.best))).sort((a,b)=>parseLapTime(a.best)-parseLapTime(b.best))}
function qualificationLeader(){return qualificationRanking()[0]}
function qualificationReferenceFor(driver){
 const ranking=qualificationRanking();
 if(!driver||!ranking.length)return null;
 const selectedIndex=ranking.findIndex(d=>d.driver===driver.driver);
 // Pour le leader, la référence devient le P2 afin d'afficher son avance réelle.
 if(selectedIndex===0)return ranking[1]||null;
 return ranking[0]||null;
}
function qualificationDeltaFor(driver){
 const reference=qualificationReferenceFor(driver);
 const followedBest=parseLapTime(driver?.best);
 const referenceBest=parseLapTime(reference?.best);
 if(!Number.isFinite(followedBest)||!Number.isFinite(referenceBest))return '--';
 const delta=followedBest-referenceBest;
 if(Math.abs(delta)<0.0005)return '0.000';
 return `${delta<0?'-':'+'}${Math.abs(delta).toFixed(3)}`;
}
function qualificationDeltaIsLeader(driver){
 const leader=qualificationLeader();
 return Boolean(driver?.driver&&leader?.driver&&driver.driver===leader.driver);
}
function normalizeBriceDriverName(value){
 return String(value||'')
  .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .replace(/[’'`´.]/g,' ')
  .replace(/[^a-zA-Z0-9]+/g,' ')
  .trim().toUpperCase();
}
function isBriceDriverName(value){
 const normalized=normalizeBriceDriverName(value);
 if(!normalized)return false;
 return normalized==='BRICE NGUESSAN'||normalized==='NGUESSAN'||normalized==='B NGUESSAN'||normalized==='GUESSAN'||normalized.split(' ').includes('NGUESSAN')||normalized.split(' ').includes('GUESSAN');
}
async function maybeAutoFollowBrice(){
 if(!['qualification','sprint'].includes(currentMode)||manualFollowOverride||autoBriceFollowApplied||autoBriceFollowInFlight)return;
 const selected=(state.drivers||[]).find(d=>isBriceDriverName(d.driver));
 if(!selected)return;
 autoBriceFollowApplied=true;
 autoBriceFollowInFlight=true;
 state.followed_driver=selected.driver;
 state.followed=selected;
 state.qualif_delta=qualificationDeltaFor(selected);
 render();
 try{await fetch('/api/follow',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({driver:selected.driver})})}
 finally{autoBriceFollowInFlight=false}
}
async function followDriver(driverName,{automatic=false}={}){
 const selected=(state.drivers||[]).find(d=>d.driver===driverName);if(!selected)return;
 if(!automatic)manualFollowOverride=true;
 state.followed_driver=driverName;state.followed=selected;state.qualif_delta=qualificationDeltaFor(selected);render();await api('/api/follow',{driver:driverName})
}
function driverAhead(followed){if(!followed||!followed.pos||Number(followed.pos)<=1)return null;return (state.drivers||[]).find(d=>Number(d.pos)===Number(followed.pos)-1)||null}
function sprintReferenceFor(driver){
 if(!driver||!driver.pos)return null;
 if(Number(driver.pos)===1)return (state.drivers||[]).find(d=>Number(d.pos)===2)||null;
 return driverAhead(driver);
}
function sprintDeltaFor(driver){
 if(!driver||!driver.pos)return '--';
 if(Number(driver.pos)===1){
  const p2=sprintReferenceFor(driver);
  if(!p2)return '--';
  const raw=String(p2.gap||p2.interval||'--').trim();
  if(!raw||raw==='—'||raw==='--')return '--';
  return raw.startsWith('+')?raw:`+${raw}`;
 }
 const raw=String(driver.interval||'--').trim();
 return (!raw||raw==='—')?'--':raw;
}
async function updateDeveloperSettings(){
 const developer_mode=!!document.getElementById('developerModeToggle')?.checked;
 const traffic_recording=developer_mode&&!!document.getElementById('trafficRecordingToggle')?.checked;
 await api('/api/developer/settings',{developer_mode,traffic_recording});
}
function exportApexLogs(){window.location.href='/api/developer/export-logs'}
function renderDeveloperRecorder(){
 const dev=document.getElementById('developerModeToggle'),rec=document.getElementById('trafficRecordingToggle'),label=document.getElementById('trafficRecordingLabel');
 if(!dev||!rec)return;
 dev.checked=!!state.developer_mode;rec.checked=!!state.traffic_recording;rec.disabled=!dev.checked;
 if(label){label.classList.toggle('recording-on',!!state.traffic_recording);label.classList.toggle('recording-off',!state.traffic_recording)}
}
function render(){
 renderDeveloperRecorder();
 const circuit=state.circuits.find(c=>c.id===state.circuit_id);circuitName.textContent=circuit?.name||'Aucun circuit';connection.textContent=state.connection;const live=state.live||{};liveDiagStatus.textContent=(live.status||'idle').toUpperCase();liveDiagMessages.textContent=live.messages||0;liveDiagParsed.textContent=live.parsed_updates||0;liveDiagLast.textContent=live.last_message_at?live.last_message_at.slice(11,19):'—';liveDiagPreview.textContent=live.last_frame_preview||'En attente…';liveStatusDot.classList.toggle('connected',['connected','receiving'].includes(live.status));
 const newCircuitSignature=state.circuits.map(c=>c.id+'|'+c.name).join('§');if(newCircuitSignature!==circuitSignature){circuitSignature=newCircuitSignature;circuitSelect.innerHTML='<option value="" selected disabled>Sélectionnez votre circuit</option>'+state.circuits.map(c=>`<option value="${c.id}">${c.name}</option>`).join('')}circuitSelect.value=state.circuit_id||'';
 const circuitReady=Boolean(state.circuit_id);document.querySelectorAll('[data-home-mode]').forEach(card=>{card.classList.toggle('mode-locked',!circuitReady);card.setAttribute('aria-disabled',String(!circuitReady))});
 const showRankingKart=rankingHasKartColumn();
 document.querySelector('#qualification .qual-table-wrap table')?.classList.toggle('has-kart-column',showRankingKart);
 document.querySelector('#sprint .sprint-table-wrap table')?.classList.toggle('has-kart-column',showRankingKart);
 rows('qualifTable',d=>`<td class="${positionClass(d.pos)} ranking-pos">${d.pos}</td>${showRankingKart?`<td class="ranking-kart-column">${validKartNumber(d)||'—'}</td>`:''}<td class="name ranking-driver-column">${formatRankingDriver(d)}</td><td class="ranking-last ${lapTimeClass(d,d.last,'last')}">${d.last}</td><td class="ranking-best ${lapTimeClass(d,d.best,'best')}">${d.best}</td><td class="ranking-gap">${d.gap}</td>`);
 rows('sprintTable',d=>`<td class="${positionClass(d.pos)} ranking-pos">${d.pos}</td>${showRankingKart?`<td class="ranking-kart-column">${validKartNumber(d)||'—'}</td>`:''}<td class="name ranking-driver-column">${formatRankingDriver(d)}</td><td class="ranking-last ${lapTimeClass(d,d.last,'last')}">${d.last}</td><td class="mobile-hide ranking-best ${lapTimeClass(d,d.best,'best')}">${d.best}</td><td class="mobile-hide ranking-gap">${d.gap}</td><td class="ranking-interval">${d.interval}</td>`);
 rows('enduranceTable',d=>`<td class="pos endurance-position-cell"><span class="endurance-position-wrap"><span class="endurance-position-number${Number(d.pos)===1?' leader-pos':''}">${d.pos}</span>${endurancePitBadge(d)}</span></td><td class="name">${formatDriverName(d.driver)}</td><td>${d.apex}</td><td>${d.laps}</td><td>${d.pit_stops ?? '—'}</td><td class="${lapTimeClass(d,d.last,'last')}">${d.last}</td><td class="${lapTimeClass(d,d.best,'best')}">${d.best}</td><td>${d.gap}</td><td class="red">${d.penalty||'—'}</td>`);
 const f=state.followed||{};qPos.textContent=f.pos?'P'+f.pos:'—';setDriverName(qName,f.driver||'—');qDelta.textContent=qualificationDeltaFor(f);qDelta.classList.toggle('delta-good',qualificationDeltaIsLeader(f));updateRemainingDisplay();qLapsRemaining.textContent=state.apex_laps_remaining||'—';const qReference=qualificationReferenceFor(f);qGapWith.innerHTML=gapWithMarkup('vs',qReference?.driver||'—');
 setDriverName(sName,f.driver||'—');sPos.textContent=f.pos?'P'+f.pos:'—';const sprintDelta=sprintDeltaFor(f);const sprintReference=sprintReferenceFor(f);sDeltaValue.textContent=sprintDelta;sDeltaValue.classList.toggle('sprint-leader-delta',Number(f.pos)===1&&sprintDelta!=='--');sDeltaValue.classList.toggle('sprint-followed-delta',Number(f.pos)>1&&sprintDelta!=='--');const sprintRemainingMs=liveRemainingMilliseconds();sRemaining.textContent=sprintRemainingMs===null?(state.time_remaining||'—'):formatRemainingMilliseconds(sprintRemainingMs);sRemaining.classList.toggle('time-critical',Number.isFinite(sprintRemainingMs)&&sprintRemainingMs<120000);sLapsRemaining.textContent=state.apex_laps_remaining||'—';sGapWith.innerHTML=gapWithMarkup('vs',sprintReference?.driver||'—');const fastest=state.fastest_last_lap||{};sFastestName.textContent='🔥 '+(fastest.driver||'—');sFastestTime.textContent=fastest.lap||'—';
 const sortedPenalties=[...(state.penalties||[])].sort((a,b)=>String(b.at||'').localeCompare(String(a.at||''))); const penaltyMarkup=sortedPenalties.length?sortedPenalties.map(p=>`<div class="penalty-row"><small class="penalty-time">${penaltyTime(p)}</small><b>${formatDriverSurname(p.driver)}</b><span class="red"><b>${p.penalty}</b></span></div>`).join(''):'<div class="empty">Aucune pénalité</div>';
 penalties.innerHTML=penaltyMarkup;
 if(document.getElementById('endurancePenalties'))endurancePenalties.innerHTML=penaltyMarkup;
 paceTop8.innerHTML=state.pace_top8.map(d=>`<div class="pace-row"><span class="pace-rank">${d.pace_rank}<small class="pace-general-pos">P${d.pos}</small></span><span><b>${formatDriverName(d.driver)}</b><br><span class="label">Kart ${d.apex}</span></span><b title="Moyenne calculée sur ${d.pace5_laps||0} tour(s)">${d.pace5}</b></div>`).join('');
 quickTable.innerHTML=state.quick_change.map(q=>{const cls=q.kart_delta.startsWith('-')?'delta-good':q.kart_delta.startsWith('+')?'delta-bad':'';return `<tr><td class="pos">${q.queue}</td><td>${q.pit_time}</td><td><b>${q.pace_rank}</b></td><td>${q.previous_team}</td><td>${q.kart}</td><td>${q.avg5}</td><td class="${cls}">${q.kart_delta}</td></tr>`}).join('');
 driverSelect.innerHTML=state.drivers.map(d=>`<option ${d.driver===state.followed_driver?'selected':''}>${d.driver}</option>`).join('');
 if(state.qualif_crossing&&state.qualif_crossing.event_id!==lastCrossEvent){lastCrossEvent=state.qualif_crossing.event_id;const isBest=Boolean(state.qualif_crossing.is_session_best);crossPos.textContent='P'+state.qualif_crossing.position;crossBest.classList.toggle('show',isBest);crossDelta.textContent=state.qualif_crossing.delta;crossDelta.classList.toggle('delta-first',isBest);crossDelta.classList.toggle('delta-behind',!isBest);crossReference.textContent=state.qualif_crossing.reference_driver||'—';crossingOverlay.classList.add('show');clearTimeout(crossTimer);crossTimer=setTimeout(async()=>{crossingOverlay.classList.remove('show');await api('/api/clear-crossing')},6000)}
 if(currentMode!=='endurance')top8PitOverlay.classList.remove('show');if(state.generic_alert&&state.generic_alert.event_id!==lastGenericEvent){lastGenericEvent=state.generic_alert.event_id;if(state.generic_alert.kind==='top8_pit_entry'&&currentMode==='endurance'){top8AlertTeam.textContent=state.generic_alert.team||'—';top8AlertPosition.textContent='P'+(state.generic_alert.position||'—')+' / Top 8';top8PitOverlay.classList.add('show')}else if(state.generic_alert.kind!=='top8_pit_entry'){alertTitle.textContent=state.generic_alert.title;alertLine1.textContent=state.generic_alert.line1;alertLine2.textContent=state.generic_alert.line2;genericOverlay.classList.add('show')}}
 renderQualificationFocus();
}
function reconnectLive(){connectApexBrowser(true)}
async function changeCircuit(){
 if(!circuitSelect.value)return;
 const nextCircuitId=circuitSelect.value;
 document.getElementById('homeCircuit')?.classList.remove('needs-selection');
 // Coupe d'abord l'ancienne piste afin qu'aucune trame tardive ne puisse être envoyée.
 closeApexBrowserSocket();
 apexBrowserCircuitId=null;
 rowLapSignatures.clear();
 endurancePitStatuses.clear();enduranceOutUntil.clear();
 lastCrossEvent=null;lastGenericEvent=null;
 crossingOverlay.classList.remove('show');genericOverlay.classList.remove('show');top8PitOverlay.classList.remove('show');
 remainingCountdownMs=null;remainingCountdownPerfAt=0;remainingCountdownDirectSyncAt=0;
 state={...(state||{}),circuit_id:nextCircuitId,drivers:[],followed_driver:'',followed:null,penalties:[],quick_change:[],qualif_crossing:null,generic_alert:null,time_remaining:'—',apex_laps_remaining:'—',session_best:{driver:'—',lap:'—'},fastest_last_lap:{driver:'—',lap:'—'}};
 render();
 await api('/api/circuit',{circuit_id:nextCircuitId});
}function followSelected(){api('/api/follow',{driver:driverSelect.value})}function testCrossing(){api('/api/test-crossing',{lap:lapValue.value})}function addPenalty(){api('/api/add-penalty',{driver:driverSelect.value,penalty:penaltyValue.value})}function moveDriver(){api('/api/move',{driver:driverSelect.value,pos:movePos.value})}function addQuickChange(){api('/api/add-quick-change',{previous_team:qcTeam.value,pace_rank:qcRank.value,kart:qcKart.value,avg5:qcAvg.value,kart_delta:'--'})}function popQuickChange(){api('/api/pop-quick-change')}function testTop8PitEntry(){api('/api/test-top8-pit-entry')}function clearAlert(){genericOverlay.classList.remove('show');api('/api/clear-alert')}function clearTop8Alert(){top8PitOverlay.classList.remove('show');api('/api/clear-alert')}
document.getElementById('iphoneFrame').addEventListener('load',resetPreviewViewport);
document.getElementById('iphonePreview').addEventListener('click',e=>{if(e.target.id==='iphonePreview')toggleIphonePreview(false)});document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(document.getElementById('sprintFocus')?.classList.contains('show'))closeSprintFocus();else if(document.getElementById('qualificationFocus')?.classList.contains('show'))closeQualificationFocus();else toggleIphonePreview(false)}});



/* KartIQ V4.9.0 — files de karts Endurance */
const KART_QUEUE_STORAGE='kartiq-endurance-kart-queues-v1';
let kartQueueState={count:1,queues:[[]],selected:null};
function normalizeKartQueueState(value){
 const count=Math.max(1,Math.min(3,Number(value?.count)||1));
 const queues=Array.from({length:count},(_,i)=>Array.isArray(value?.queues?.[i])?value.queues[i].map(v=>String(v).trim()).filter(Boolean):[]);
 return {count,queues,selected:null};
}
function loadKartQueues(){try{kartQueueState=normalizeKartQueueState(JSON.parse(localStorage.getItem(KART_QUEUE_STORAGE)||'null'))}catch(_){kartQueueState=normalizeKartQueueState(null)}renderKartQueues()}
function saveKartQueues(){localStorage.setItem(KART_QUEUE_STORAGE,JSON.stringify({count:kartQueueState.count,queues:kartQueueState.queues}))}
function queueLetter(i){return String.fromCharCode(65+i)}
function setKartQueueCount(count){
 count=Math.max(1,Math.min(3,Number(count)||1));
 while(kartQueueState.queues.length<count)kartQueueState.queues.push([]);
 kartQueueState.queues=kartQueueState.queues.slice(0,count);kartQueueState.count=count;kartQueueState.selected=null;saveKartQueues();renderKartQueues();
}
function addKartToQueue(queueIndex){
 const raw=window.prompt('Numéro du kart à ajouter à la file '+queueLetter(queueIndex)+' :','');
 if(raw===null)return;const number=String(raw).trim();if(!number)return;
 kartQueueState.queues[queueIndex].push(number);kartQueueState.selected={queue:queueIndex,index:kartQueueState.queues[queueIndex].length-1};saveKartQueues();renderKartQueues();
}
function selectQueueKart(queue,index){kartQueueState.selected={queue,index};renderKartQueues()}
function moveSelectedQueueKart(direction){
 const s=kartQueueState.selected;if(!s)return;const q=kartQueueState.queues[s.queue];const next=s.index+direction;if(next<0||next>=q.length)return;
 [q[s.index],q[next]]=[q[next],q[s.index]];s.index=next;saveKartQueues();renderKartQueues();
}
function removeSelectedQueueKart(){const s=kartQueueState.selected;if(!s)return;kartQueueState.queues[s.queue].splice(s.index,1);kartQueueState.selected=null;saveKartQueues();renderKartQueues()}
function resetKartQueues(){if(!window.confirm('Réinitialiser toutes les files de karts ?'))return;kartQueueState={count:kartQueueState.count,queues:Array.from({length:kartQueueState.count},()=>[]),selected:null};saveKartQueues();renderKartQueues()}
function renderKartQueues(){
 const host=document.getElementById('kartQueues');if(!host)return;host.style.setProperty('--queue-count',kartQueueState.count);
 document.querySelectorAll('[data-queue-count]').forEach(btn=>btn.classList.toggle('active',Number(btn.dataset.queueCount)===kartQueueState.count));
 host.innerHTML=kartQueueState.queues.map((queue,qi)=>`<section class="kart-queue"><div class="kart-queue-head"><div><span class="kart-queue-name">FILE ${queueLetter(qi)}</span>${queue.length?'<span class="kart-queue-first-label">1er DISPONIBLE</span>':''}</div><button class="queue-add-btn" type="button" onclick="addKartToQueue(${qi})">＋ AJOUTER UN KART</button></div><div class="queue-track">${queue.length?queue.map((kart,ki)=>`${ki?'<span class="queue-arrow">›</span>':''}<article class="queue-kart-card ${ki===0?'first ':''}${kartQueueState.selected?.queue===qi&&kartQueueState.selected?.index===ki?'selected':''}" onclick="selectQueueKart(${qi},${ki})" role="button" tabindex="0" aria-label="Kart ${kart}, position ${ki+1}"><img class="queue-kart-image" src="/static/assets/RT10_main.png" alt=""><div class="queue-kart-number">${kart}</div><div class="queue-kart-position">${ki+1}${ki===0?'er':'e'}</div></article>`).join(''):'<div class="queue-empty">Aucun kart dans cette file</div>'}</div></section>`).join('');
 const s=kartQueueState.selected,selected=s?kartQueueState.queues[s.queue]?.[s.index]:null;
 const label=document.getElementById('queueSelectionLabel');if(label)label.textContent=selected?`Kart ${selected} sélectionné — File ${queueLetter(s.queue)}, position ${s.index+1}`:'Cliquez sur un kart pour le déplacer ou le retirer.';
 const advance=document.getElementById('queueAdvanceBtn'),back=document.getElementById('queueBackBtn'),remove=document.getElementById('queueRemoveBtn');
 if(advance)advance.disabled=!s||s.index<=0;if(back)back.disabled=!s||s.index>=kartQueueState.queues[s.queue].length-1;if(remove)remove.disabled=!s;
}

function isStandaloneKartIQ(){return window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone===true}
function closeInstallHelp(){document.getElementById('installHelp')?.classList.remove('show')}
function syncFullscreenControls(active){
 document.body.classList.toggle('kartiq-fullscreen',!!active);
 document.getElementById('fullscreenBtn')?.classList.toggle('active',!!active);
 document.getElementById('fullscreenFloatControls')?.setAttribute('aria-hidden',active?'false':'true');
}
async function exitKartIQFullscreen(){
 try{
  if(document.fullscreenElement&&document.exitFullscreen)await document.exitFullscreen();
  else if(document.webkitFullscreenElement&&document.webkitExitFullscreen)document.webkitExitFullscreen();
 }catch(e){console.warn('Sortie plein écran indisponible',e)}
 syncFullscreenControls(false);
}
async function toggleKartIQFullscreen(){
 const btn=document.getElementById('fullscreenBtn');
 try{
  if(document.fullscreenElement||document.webkitFullscreenElement){await exitKartIQFullscreen();return}
  const el=document.documentElement;
  const request=el.requestFullscreen||el.webkitRequestFullscreen;
  if(request){await request.call(el);syncFullscreenControls(true);return}
 }catch(e){console.warn('Plein écran indisponible',e)}
 if(isStandaloneKartIQ()){syncFullscreenControls(!document.body.classList.contains('kartiq-fullscreen'));return}
 document.getElementById('installHelp')?.classList.add('show');
}
document.addEventListener('fullscreenchange',()=>syncFullscreenControls(!!document.fullscreenElement));document.addEventListener('webkitfullscreenchange',()=>syncFullscreenControls(!!document.webkitFullscreenElement));
document.getElementById('installHelp')?.addEventListener('click',e=>{if(e.target.id==='installHelp')closeInstallHelp()});
if('serviceWorker' in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('/static/sw.js').catch(err=>console.warn('Service worker',err)))}

setModeClass(currentMode);
loadKartQueues();
setInterval(()=>clock.textContent=new Date().toLocaleTimeString('fr-FR'),1000);setInterval(updateRemainingDisplay,100);setInterval(load,1000);load();
