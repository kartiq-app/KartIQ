let state={},currentMode='home',lastCrossEvent=null,lastGenericEvent=null,crossTimer=null,circuitSignature='';
let stateLoadInFlight=false;
let autoBriceFollowApplied=false,manualFollowOverride=false,autoBriceFollowInFlight=false;
let remainingCountdownMs=null,remainingCountdownPerfAt=0,remainingCountdownUsesHours=false,remainingCountdownDirectSyncAt=0;
const isEmbeddedPreview=new URLSearchParams(location.search).get('preview')==='1';

// Journal local du décodeur Apex. Les trames sont conservées uniquement dans
// ce navigateur et ne sont incluses dans un fichier que sur action explicite
// de l'utilisateur via le bouton DIAGNOSTIC DÉCODEUR.
const apexDecoderDiagnostics={
 version:1,
 startedAt:new Date().toISOString(),
 receivedCount:0,
 decodedCount:0,
 decodeErrorCount:0,
 lastGoodFrame:null,
 lastGoodAt:null,
 failedFrame:null,
 failedAt:null,
 lastError:null,
 recentFrames:[]
};
function apexDiagnosticFramePreview(frame,limit=20000){
 const text=String(frame??'');
 return text.length>limit?text.slice(0,limit)+`\n… [trame tronquée, ${text.length-limit} caractères supplémentaires]`:text;
}
function recordApexFrameReceived(frame,circuitId){
 apexDecoderDiagnostics.receivedCount+=1;
 apexDecoderDiagnostics.recentFrames.push({
  receivedAt:new Date().toISOString(),
  circuitId:circuitId||null,
  length:String(frame??'').length,
  frame:apexDiagnosticFramePreview(frame,4000),
  status:'received'
 });
 if(apexDecoderDiagnostics.recentFrames.length>25)apexDecoderDiagnostics.recentFrames.splice(0,apexDecoderDiagnostics.recentFrames.length-25);
}
function recordApexDecodeSuccess(frame,circuitId,result){
 const now=new Date().toISOString();
 apexDecoderDiagnostics.decodedCount+=1;
 apexDecoderDiagnostics.lastGoodAt=now;
 apexDecoderDiagnostics.lastGoodFrame={
  circuitId:circuitId||null,
  length:String(frame??'').length,
  frame:apexDiagnosticFramePreview(frame),
  response:result||null
 };
 const recent=apexDecoderDiagnostics.recentFrames[apexDecoderDiagnostics.recentFrames.length-1];
 if(recent){recent.status='decoded';recent.decodedAt=now;recent.response=result||null}
}
function recordApexDecodeFailure(frame,circuitId,error,details={}){
 const now=new Date().toISOString();
 apexDecoderDiagnostics.decodeErrorCount+=1;
 apexDecoderDiagnostics.failedAt=now;
 apexDecoderDiagnostics.failedFrame={
  circuitId:circuitId||null,
  length:String(frame??'').length,
  frame:apexDiagnosticFramePreview(frame)
 };
 apexDecoderDiagnostics.lastError={
  message:String(error?.message||error||'Erreur inconnue'),
  name:String(error?.name||'Error'),
  stack:error?.stack?String(error.stack):null,
  ...details
 };
 const recent=apexDecoderDiagnostics.recentFrames[apexDecoderDiagnostics.recentFrames.length-1];
 if(recent){recent.status='decode-error';recent.failedAt=now;recent.error=apexDecoderDiagnostics.lastError}
}
function exportDecoderDiagnostics(){
 const now=new Date();
 const circuit=(state?.circuits||[]).find(item=>item.id===state?.circuit_id);
 const payload={
  type:'apex-decoder-diagnostic',
  exportedAt:now.toISOString(),
  appVersion:String(state?.version||'7.2.13'),
  pageUrl:location.href,
  userAgent:navigator.userAgent,
  circuit:{id:state?.circuit_id||null,name:circuit?.name||null,websocketUrl:circuit?.websocket_url||null,sessionRequest:circuit?.session_request||null},
  live:{connection:state?.connection||null,status:state?.live?.status||null,lastError:state?.live?.last_error||state?.live?.error||null,lastMessageAt:state?.live?.last_message_at||null,messages:state?.live?.messages||0,parsedUpdates:state?.live?.parsed_updates||0},
  diagnostics:JSON.parse(JSON.stringify(apexDecoderDiagnostics))
 };
 const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');
 const safeCircuit=String(circuit?.name||state?.circuit_id||'circuit').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').toLowerCase()||'circuit';
 a.href=url;
 a.download=`Diagnostic_Decodeur_Apex_${safeCircuit}_${now.toISOString().replace(/[:.]/g,'-')}.json`;
 document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
window.exportDecoderDiagnostics=exportDecoderDiagnostics;

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
function ingestApexLapProgress(frame){
 const matches=[...String(frame||'').matchAll(/(?:^|[\r\n])dyn1\|text\|[^\r\n]*?(?:giro|giri|tour|tours|lap|laps)\s*(\d+)\s*\/\s*(\d+)/gi)];
 if(!matches.length)return false;
 const match=matches[matches.length-1];
 const current=Math.max(0,Number(match[1])||0),total=Math.max(0,Number(match[2])||0);
 if(!total)return false;
 state={...(state||{}),current_lap:current,total_laps:total,apex_laps_remaining:`${Math.min(current,total)}/${total} TOURS`,time_remaining:'—',time_remaining_ms:null,time_remaining_updated_at_ms:null,time_remaining_end_at_ms:null};
 remainingCountdownMs=null;remainingCountdownPerfAt=0;remainingCountdownUsesHours=false;remainingCountdownDirectSyncAt=0;
 updateRemainingDisplay();
 return true;
}
function syncRemainingFromState(nextState){
 if(Number(nextState?.total_laps)>0){remainingCountdownMs=null;remainingCountdownPerfAt=0;remainingCountdownUsesHours=false;remainingCountdownDirectSyncAt=0;updateRemainingDisplay();return}
 const endAt=Number(nextState?.time_remaining_end_at_ms);
 let candidate=null;
 if(Number.isFinite(endAt)){
   candidate=Math.max(0,endAt-Date.now());
 }else{
   const ms=Number(nextState?.time_remaining_ms);
   const serverAt=Number(nextState?.time_remaining_updated_at_ms);
   if(Number.isFinite(ms)&&ms>=0&&Number.isFinite(serverAt))candidate=Math.max(0,ms-Math.max(0,Date.now()-serverAt));
 }
 if(candidate===null){
   const directIsFresh=remainingCountdownDirectSyncAt>0&&(Date.now()-remainingCountdownDirectSyncAt)<45000;
   if(!directIsFresh){remainingCountdownMs=null;remainingCountdownPerfAt=0;remainingCountdownUsesHours=false;updateRemainingDisplay()}
   return;
 }
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
function isSmartphoneLandscape(){
 return window.matchMedia('(orientation: landscape) and (max-width: 950px)').matches;
}
function formatLandscapeRemainingMilliseconds(ms){
 if(!Number.isFinite(ms))return '—';
 const total=Math.max(0,Math.floor(ms/1000));
 const hours=Math.floor(total/3600),minutes=Math.floor((total%3600)/60),seconds=total%60;
 // Au-dessus d'une heure : heures:minutes. Sous une heure : minutes:secondes.
 if(hours>0)return `${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}`;
 return `${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}`;
}
function parseRemainingTextMilliseconds(value){
 const parts=String(value||'').trim().split(':').map(Number);
 if(parts.some(v=>!Number.isFinite(v)))return null;
 if(parts.length===3)return ((parts[0]*3600)+(parts[1]*60)+parts[2])*1000;
 if(parts.length===2)return ((parts[0]*60)+parts[1])*1000;
 return null;
}
function formatMainRemainingDisplay(ms,fallback='—'){
 if(!isSmartphoneLandscape())return Number.isFinite(ms)?formatRemainingMilliseconds(ms):(fallback||'—');
 const sourceMs=Number.isFinite(ms)?ms:parseRemainingTextMilliseconds(fallback);
 return Number.isFinite(sourceMs)?formatLandscapeRemainingMilliseconds(sourceMs):(fallback||'—');
}
function raceCurrentLap(){
 const direct=Number(state?.current_lap);
 if(Number.isFinite(direct)&&direct>=0)return Math.floor(direct);
 return raceLeaderLaps();
}
function raceLeaderLaps(){
 const values=(state?.drivers||[]).map(driver=>Number(driver?.laps)).filter(Number.isFinite);
 return values.length?Math.max(0,...values):0;
}
function raceTotalLaps(){
 const total=Number(state?.total_laps);
 return Number.isFinite(total)&&total>0?Math.floor(total):0;
}
function raceUsesLapTarget(){return raceTotalLaps()>0}
function formatRaceLapProgress(){
 const total=raceTotalLaps();
 if(!total)return '';
 const completed=Math.min(total,raceCurrentLap());
 return `${completed}/${total} tours`;
}
function mainSessionProgressDisplay(){
 if(raceUsesLapTarget())return formatRaceLapProgress();
 return formatMainRemainingDisplay(liveRemainingMilliseconds(),state?.time_remaining||'—');
}
function updateRemainingDisplay(){
 const lapMode=raceUsesLapTarget();
 const ms=lapMode?null:liveRemainingMilliseconds();
 const display=lapMode?formatRaceLapProgress():formatMainRemainingDisplay(ms,state.time_remaining||'—');
 const seconds=ms===null?null:ms/1000;
 const q=document.getElementById('qRemaining');if(q){q.textContent=display;q.classList.toggle('time-critical',!lapMode&&Number.isFinite(seconds)&&seconds<120)}
 const sp=document.getElementById('sRemaining');if(sp){sp.textContent=display;sp.classList.toggle('time-critical',!lapMode&&Number.isFinite(seconds)&&seconds<120)}
 const en=document.getElementById('eRemaining');if(en){en.textContent=display;en.classList.toggle('time-critical',!lapMode&&Number.isFinite(seconds)&&seconds<120)}
 renderQualificationFocus();
 renderSprintFocus();
 renderEnduranceFocus();
}
window.addEventListener('orientationchange',()=>setTimeout(updateRemainingDisplay,80));
window.addEventListener('resize',()=>updateRemainingDisplay());
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
let apexBrowserConnectionToken=0;

// MAP Velocity — événements de position réellement émis par Apex Timing.
// Chaque ligne de classement est animée uniquement à la réception de *, *i1,
// *i2, *in ou *out. Aucune rotation autonome n'est créée côté Velocity.
window.velocityApexMap={rows:new Map(),lastEventAt:0,noLive:true,circuitId:null};
function velocityApexMapEntryPhase(entry,at=Date.now()){
 if(!entry||!entry.startedAt||!entry.durationMs)return Number(entry?.lastPhase)||0;
 const progress=Math.max(0,Math.min(1,(at-entry.startedAt)/Math.max(1,entry.durationMs)));
 const s1=Number(entry.sectors?.s1)||0,s2=Number(entry.sectors?.s2)||0,s3=Number(entry.sectors?.s3)||0;
 const total=(s1+s2+s3)>0?s1+s2+s3:(Number(entry.lapDurationMs)||entry.durationMs);
 if(entry.segment==='track')return progress;
 if(entry.segment==='s1')return total>0?progress*s1/total:progress;
 if(entry.segment==='s2')return total>0?(s1+progress*s2)/total:Number(entry.lastPhase)||0;
 if(entry.segment==='s3')return total>0?(s1+s2+progress*s3)/total:Number(entry.lastPhase)||0;
 if(entry.segment==='out')return 0;
 return Number(entry.lastPhase)||0;
}
function resetVelocityApexMap(circuitId=null){
 window.velocityApexMap.rows.clear();window.velocityApexMap.lastEventAt=0;window.velocityApexMap.noLive=true;window.velocityApexMap.circuitId=circuitId;
}
function ingestApexMapEvents(frame,circuitId){
 const registry=window.velocityApexMap;
 if(registry.circuitId!==circuitId)resetVelocityApexMap(circuitId);
 const raw=String(frame||'').replace(/\r\n?/g,'\n');
 // Les trames Apex peuvent être séparées par des retours ligne, des espaces,
 // ou être concaténées. La détection du statut ne dépend donc plus du début
 // exact d'une ligne.
 if(/(?:^|[\s@])init\|n(?:\||$)/i.test(raw)){resetVelocityApexMap(circuitId);return}
 if(/(?:^|[\s@])init\|[rb](?:\||$)/i.test(raw))registry.noLive=false;

 // Recherche directe des impulsions de tracking, indépendamment du séparateur
 // utilisé entre deux enregistrements Apex.
 const eventStart=/r(\d+)(?:c\d+)?\|(\*i1|\*i2|\*in|\*out|\*)\|/g;
 const starts=[...raw.matchAll(eventStart)];
 for(let index=0;index<starts.length;index++){
  const match=starts[index],row=Number(match[1]),code=String(match[2]||'').trim();
  const payloadStart=(match.index||0)+match[0].length;
  const payloadEnd=index+1<starts.length?(starts[index+1].index||raw.length):raw.length;
  // On coupe également au prochain enregistrement Apex générique afin de ne
  // pas absorber les mises à jour de grille accolées à l'impulsion MAP.
  let payload=raw.slice(payloadStart,payloadEnd);
  const nextRecord=payload.search(/(?:[\s@]|^)(?:r\d+(?:c\d+)?|init|grid|dyn\d+|track|gmt)\|/i);
  if(nextRecord>=0)payload=payload.slice(0,nextRecord);
  const fields=payload.split('|').map(v=>String(v||'').trim());
  const value=Number(fields[0]);
  const extra=Number(fields[1]);
  const now=Date.now();
  const previous=registry.rows.get(row)||{row,sectors:{s1:null,s2:null,s3:null},lastPhase:0,sectorMode:false};
  previous.lastPhase=velocityApexMapEntryPhase(previous,now);

  if(code==='*'){
   if(Number.isFinite(value)&&value>0)previous.lapDurationMs=value;
   if(Number.isFinite(extra)&&extra>0){previous.sectors.s1=extra;previous.sectorMode=true}
   // Sans durée S1 explicite, Apex anime le tour complet : aucun secteur
   // intermédiaire n'est requis pour faire apparaître le kart.
   previous.segment=previous.sectorMode&&Number.isFinite(extra)&&extra>0?'s1':'track';
   previous.durationMs=previous.segment==='s1'?extra:value;
   previous.inPit=false;
  }else if(code==='*i1'){
   if(Number.isFinite(value)&&value>0)previous.sectors.s2=value;
   previous.sectorMode=true;previous.segment='s2';previous.durationMs=value;previous.inPit=false;
  }else if(code==='*i2'){
   if(Number.isFinite(value)&&value>0)previous.sectors.s3=value;
   previous.sectorMode=true;previous.segment='s3';previous.durationMs=value;previous.inPit=false;
  }else if(code==='*in'){
   previous.segment='in';previous.durationMs=8000;previous.inPit=true;previous.pitEnteredAt=previous.pitEnteredAt||now;
  }else if(code==='*out'){
   previous.segment='out';previous.durationMs=Number.isFinite(value)&&value>0?value:5000;previous.inPit=false;previous.pitEnteredAt=null;
  }
  if(!Number.isFinite(previous.durationMs)||previous.durationMs<=0)continue;
  previous.startedAt=now;previous.lastEventAt=now;previous.code=code;
  registry.rows.set(row,previous);registry.lastEventAt=now;registry.noLive=false;
 }
}
async function sendApexStatus(status,connection,error=null){try{await fetch('/api/apex/status',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({status,connection,error})})}catch(e){}}
function closeApexBrowserSocket(){
 apexBrowserConnectionToken+=1;
 const socket=apexBrowserSocket;
 apexBrowserSocket=null;
 apexBrowserConnecting=false;
 if(socket){
  socket.onopen=null;socket.onmessage=null;socket.onerror=null;socket.onclose=null;
  try{socket.close()}catch(e){}
 }
}
function ensureApexBrowserConnection(){if(!state?.circuit_id)return;if(apexBrowserCircuitId!==state.circuit_id||(!apexBrowserSocket&&!apexBrowserConnecting))connectApexBrowser(false)}
function connectApexBrowser(force=false){
 const circuit=(state?.circuits||[]).find(c=>c.id===state.circuit_id);
 if(!circuit?.websocket_url)return;
 if(!force&&apexBrowserSocket&&apexBrowserCircuitId===circuit.id&&[0,1].includes(apexBrowserSocket.readyState))return;
 closeApexBrowserSocket();
 apexBrowserCircuitId=circuit.id;
 apexBrowserConnecting=true;
 const connectionToken=++apexBrowserConnectionToken;
 sendApexStatus('connecting','CONNEXION APEX…');
 let socket;
 try{socket=new WebSocket(circuit.websocket_url);apexBrowserSocket=socket}catch(err){if(connectionToken!==apexBrowserConnectionToken)return;apexBrowserConnecting=false;sendApexStatus('error','ERREUR LIVE',err.message);return}
 const isCurrentConnection=()=>connectionToken===apexBrowserConnectionToken&&socket===apexBrowserSocket&&circuit.id===state?.circuit_id;
 socket.addEventListener('open',()=>{
  if(!isCurrentConnection())return;
  apexBrowserConnecting=false;
  sendApexStatus('connected','LIVE • CONNECTÉ');
  if(circuit.session_request){socket.send(circuit.session_request);fetch('/api/developer/outbound',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:circuit.session_request})}).catch(()=>{})}
 });
 socket.addEventListener('message',async e=>{
  if(!isCurrentConnection())return;
  const frame=typeof e.data==='string'?e.data:e.data instanceof Blob?await e.data.text():String(e.data);
  if(!isCurrentConnection())return;
  recordApexFrameReceived(frame,circuit.id);
  const lapProgressFrame=ingestApexLapProgress(frame);
  if(!lapProgressFrame)ingestApexCountdown(frame);
  ingestApexMapEvents(frame,circuit.id);
  try{
   const r=await fetch('/api/apex/frame',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({frame,circuit_id:circuit.id})});
   let d=null;
   try{d=await r.json()}catch(parseError){d={responseParseError:parseError.message,responseText:'Réponse serveur non JSON'}}
   if(!isCurrentConnection())return;
   // Une réponse « ignored » signifie qu'une ancienne connexion a terminé
   // sa requête après un changement de piste. Ce n'est pas une erreur de
   // décodage et elle ne doit jamais modifier l'état LIVE ni la HEAT MAP.
   if(d?.ignored===true){
    const recent=apexDecoderDiagnostics.recentFrames[apexDecoderDiagnostics.recentFrames.length-1];
    if(recent){recent.status='ignored-obsolete';recent.ignoredAt=new Date().toISOString();recent.reason=d?.error||'Connexion obsolète'}
    return;
   }
   if(!r.ok){const err=new Error(d?.error||`Décodage Apex impossible (HTTP ${r.status})`);err.httpStatus=r.status;err.serverResponse=d;throw err}
   recordApexDecodeSuccess(frame,circuit.id,d);
  }catch(err){
   if(!isCurrentConnection())return;
   recordApexDecodeFailure(frame,circuit.id,err,{httpStatus:err?.httpStatus||null,serverResponse:err?.serverResponse||null});
   sendApexStatus('error','ERREUR DÉCODAGE',err.message);
  }
 });
 socket.addEventListener('error',()=>{if(isCurrentConnection())sendApexStatus('error','ERREUR LIVE','Connexion WebSocket Apex impossible')});
 socket.addEventListener('close',e=>{
  if(!isCurrentConnection())return;
  apexBrowserSocket=null;apexBrowserConnecting=false;
  sendApexStatus('closed','LIVE DÉCONNECTÉ',`Code ${e.code}`);
  setTimeout(()=>{if(connectionToken===apexBrowserConnectionToken&&state?.circuit_id===circuit.id)connectApexBrowser(false)},5000);
 });
}
function setModeClass(mode){document.body.classList.remove('current-home','current-qualification','current-sprint','current-endurance','current-analyzer','current-spotter');const visualMode=mode==='endurance'?'qualification':mode==='analyzer'?'endurance':mode;document.body.classList.add('current-'+visualMode);document.body.dataset.appMode=mode}
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
 // Chaque mode ouvre désormais son propre écran. La page Endurance reste
 // un clone de Qualification pour le dashboard, mais son bouton Focus ouvre
 // le Focus Sprint dédié à Endurance.
 const screen=document.getElementById(mode);
 screen.classList.add('active','screen-enter');setTimeout(()=>screen.classList.remove('screen-enter'),220);document.querySelectorAll('.mode-btn').forEach(x=>x.classList.toggle('active',x.dataset.mode===mode));if(mode!=='home'&&mode!=='spotter')api('/api/mode',{mode:mode==='analyzer'?'endurance':mode})
}

let sprintFocusWakeLock=null;
