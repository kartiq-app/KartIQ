let state={},currentMode='home',lastCrossEvent=null,lastGenericEvent=null,crossTimer=null,circuitSignature='';
let stateLoadInFlight=false;
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
 remainingCountdownPerfAt=Date.now();
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
 return Math.max(0,remainingCountdownMs-(Date.now()-remainingCountdownPerfAt));
}
function formatRemainingMilliseconds(ms){
 if(!Number.isFinite(ms))return '—';
 // Apex conserve la seconde en cours jusqu'à son terme : on arrondit donc
 // vers le haut plutôt que d'afficher la seconde suivante trop tôt.
 const total=Math.max(0,Math.floor(ms/1000));
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
 // Le rafraîchissement tourne à 250 ms. Ne jamais lancer une nouvelle
 // requête tant que la précédente n'est pas terminée, afin d'éviter une
 // file d'attente et un retard progressif de l'affichage.
 if(stateLoadInFlight)return;
 stateLoadInFlight=true;
 try{
  const response=await fetch('/api/state',{cache:'no-store'});
  if(!response.ok)throw new Error(`État KartIQ indisponible (${response.status})`);
  const nextState=await response.json();
  syncRemainingFromState(nextState);
  state=nextState;
  if(!(state.drivers||[]).length){autoBriceFollowApplied=false;manualFollowOverride=false}
  render();
  maybeAutoFollowBrice();
  ensureApexBrowserConnection();
 }catch(error){
  console.warn('[KartIQ] Rafraîchissement de l’état impossible :',error);
 }finally{
  stateLoadInFlight=false;
 }
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
function setModeClass(mode){document.body.classList.remove('current-home','current-qualification','current-sprint','current-endurance','current-analyzer');const visualMode=mode==='endurance'?'qualification':mode==='analyzer'?'endurance':mode;document.body.classList.add('current-'+visualMode);document.body.dataset.appMode=mode}
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
 currentMode=mode;setModeClass(mode);maybeAutoFollowBrice();document.querySelectorAll('.screen').forEach(x=>x.classList.remove('active'));
 // Le mode Endurance utilise volontairement la page Qualification validée.
 // Cela garantit une interface et des informations strictement identiques
 // en portrait, paysage, desktop et Focus, sans maintenir deux copies CSS.
 const screen=document.getElementById(mode==='endurance'?'qualification':mode);
 screen.classList.add('active','screen-enter');setTimeout(()=>screen.classList.remove('screen-enter'),220);document.querySelectorAll('.mode-btn').forEach(x=>x.classList.toggle('active',x.dataset.mode===mode));if(mode!=='home')api('/api/mode',{mode:mode==='analyzer'?'endurance':mode})
}

let sprintFocusWakeLock=null;
