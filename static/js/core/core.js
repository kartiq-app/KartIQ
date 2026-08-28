
const isAndroidDevice=/Android/i.test(navigator.userAgent||'');
const isIPhoneDevice=/iPhone|iPod/i.test(navigator.userAgent||'');
function setFocusLandscapeLock(active){
  // iPhone : l'OS reste volontairement en portrait. Le Focus est simplement
  // dessiné à 90° dans le viewport portrait ; le pilote tourne physiquement
  // le téléphone sans provoquer de changement d'orientation iOS.
  const iphoneVirtual=!!active&&isIPhoneDevice;
  document.documentElement.classList.toggle('iphone-focus-virtual-landscape',iphoneVirtual);
  document.body.classList.toggle('iphone-focus-virtual-landscape',iphoneVirtual);
  // Android conserve son comportement historique via Screen Orientation API.
  document.documentElement.classList.remove('focus-landscape-locked');
  document.body.classList.remove('focus-landscape-locked');
}
async function lockFocusOrientationForAndroid(){
  if(!isAndroidDevice)return false;
  try{
    if(screen.orientation?.lock){
      await screen.orientation.lock('landscape');
      return true;
    }
  }catch(error){console.warn('Verrouillage paysage Android indisponible',error)}
  return false;
}
function unlockFocusOrientationForAndroid(){
  if(!isAndroidDevice)return;
  try{if(screen.orientation?.unlock)screen.orientation.unlock()}catch(error){console.warn('Déverrouillage orientation Android',error)}
}
let state={},currentMode='home',lastCrossEvent=null,lastGenericEvent=null,crossTimer=null,circuitSignature='';
// V7.2.1758 — toutes les sauvegardes de course du navigateur sont isolées
// par Session Velocity. Un changement de session ne doit jamais réinjecter
// le Spotter / Analyzer / files d'une autre course.
function velocityWorkspaceStorageScope(){
 const raw=String(window.VELOCITY_WORKSPACE_ID||state?.workspace?.id||'LEGACY').trim()||'LEGACY';
 return raw.replace(/[^A-Za-z0-9_-]+/g,'-');
}
function velocityWorkspaceStorageKey(base){return `${String(base||'velocity')}:${velocityWorkspaceStorageScope()}`}
window.velocityWorkspaceStorageKey=velocityWorkspaceStorageKey;
// Pont explicite pour les modules isolés : `state` est un binding global `let`
// et n'est donc pas automatiquement disponible sous `window.state`.
try{Object.defineProperty(window,'velocityState',{configurable:true,get:()=>state})}catch(_){window.velocityState=state}
let circuitChangeInProgress=false,pendingCircuitId='';
let stateLoadInFlight=false;
let velocityWorkspaceSwitching=false;
let autoBriceFollowApplied=false,manualFollowOverride=false,autoBriceFollowInFlight=false;
let remainingCountdownMs=null,remainingCountdownPerfAt=0,remainingCountdownUsesHours=false,remainingCountdownDirectSyncAt=0;
let elapsedCountMs=null,elapsedCountPerfAt=0,elapsedCountDirectSyncAt=0;
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
  appVersion:String(state?.version||'7.2.106'),
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
function apexDynamicTimeToMilliseconds(raw){
 const value=String(raw??'').trim().split('_',1)[0];
 const parsed=Number(value);
 if(!Number.isFinite(parsed))return null;
 return Math.max(0,Math.round(value.includes('.')?parsed*1000:parsed));
}
function ingestApexCountdown(frame){
 const matches=[...String(frame||'').matchAll(/(?:^|[\r\n])dyn1\|(?:countdown|countdown_text)\|([0-9]+(?:\.[0-9]+)?(?:_[^\r\n|]*)?)/g)];
 if(!matches.length)return false;
 const ms=apexDynamicTimeToMilliseconds(matches[matches.length-1][1]);
 return ms===null?false:syncRemainingFromApex(ms,{direct:true});
}
function syncElapsedFromApex(milliseconds,{direct=false}={}){
 const ms=Number(milliseconds);
 if(!Number.isFinite(ms)||ms<0)return false;
 elapsedCountMs=Math.max(0,ms);
 elapsedCountPerfAt=Date.now();
 if(direct)elapsedCountDirectSyncAt=Date.now();
 state={...(state||{}),time_elapsed_ms:elapsedCountMs,time_elapsed_updated_at_ms:Date.now()};
 updateRemainingDisplay();
 return true;
}
function ingestApexElapsed(frame){
 const matches=[...String(frame||'').matchAll(/(?:^|[\r\n])dyn1\|count\|([0-9]+(?:\.[0-9]+)?)/g)];
 if(!matches.length)return false;
 const ms=apexDynamicTimeToMilliseconds(matches[matches.length-1][1]);
 return ms===null?false:syncElapsedFromApex(ms,{direct:true});
}
function ingestApexSessionType(frame){
 const matches=[...String(frame||'').matchAll(/(?:^|[\r\n])init\|([^|\r\n]+)/g)];
 if(!matches.length)return false;
 const code=String(matches[matches.length-1][1]||'').trim().toLowerCase();
 const type=code==='n'?'no_live':(code==='r'?'race':'best_time');
 state={...(state||{}),apex_session_type:type};
 return true;
}
function liveElapsedMilliseconds(){
 if(Number.isFinite(elapsedCountMs)&&elapsedCountPerfAt)return Math.max(0,elapsedCountMs+(Date.now()-elapsedCountPerfAt));
 const base=Number(state?.time_elapsed_ms),serverAt=Number(state?.time_elapsed_updated_at_ms);
 if(Number.isFinite(base)&&base>=0&&Number.isFinite(serverAt))return Math.max(0,base+(Date.now()-serverAt));
 return null;
}
function ingestApexLapProgress(frame){
 const matches=[...String(frame||'').matchAll(/(?:^|[\r\n])dyn1\|text\|[^\r\n]*?(?:giro|giri|tour|tours|lap|laps|vuelta|vueltas|runde|runden|volta|voltas|ronde|rondes|okrazenie|okrazenia|okrążenie|okrążenia)\s*(\d+)\s*\/\s*(\d+)/gi)];
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
 const elapsedBase=Number(nextState?.time_elapsed_ms),elapsedAt=Number(nextState?.time_elapsed_updated_at_ms);
 if(Number.isFinite(elapsedBase)&&elapsedBase>=0){
  const directElapsedFresh=elapsedCountDirectSyncAt>0&&(Date.now()-elapsedCountDirectSyncAt)<45000;
  if(!directElapsedFresh){
   elapsedCountMs=elapsedBase;
   elapsedCountPerfAt=Number.isFinite(elapsedAt)?elapsedAt:Date.now();
  }
 }
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
 const remaining=lapMode?null:liveRemainingMilliseconds();
 const elapsed=!lapMode&&!Number.isFinite(remaining)?liveElapsedMilliseconds():null;
 const display=lapMode
  ?formatRaceLapProgress()
  :Number.isFinite(remaining)
   ?formatMainRemainingDisplay(remaining,state.time_remaining||'—')
   :Number.isFinite(elapsed)
    ?formatRemainingMilliseconds(elapsed)
    :(state.time_remaining||'—');
 const seconds=Number.isFinite(remaining)?remaining/1000:null;
 const q=document.getElementById('qRemaining');if(q){q.textContent=display;q.classList.toggle('time-critical',!lapMode&&Number.isFinite(seconds)&&seconds<120)}
 const sp=document.getElementById('sRemaining');if(sp){sp.textContent=display;sp.classList.toggle('time-critical',!lapMode&&Number.isFinite(seconds)&&seconds<120)}
 const en=document.getElementById('eRemaining');if(en){en.textContent=display;en.classList.toggle('time-critical',!lapMode&&Number.isFinite(seconds)&&seconds<120)}
 if(typeof renderDriverMessageOverlay==='function')renderDriverMessageOverlay();
 renderQualificationFocus();
 renderSprintFocus();
 renderEnduranceFocus();
}
window.addEventListener('orientationchange',()=>setTimeout(updateRemainingDisplay,80));
window.addEventListener('resize',()=>updateRemainingDisplay());
async function load(){
 if(window.velocityEnduranceTest?.active||velocityWorkspaceSwitching)return;
 // Le rafraîchissement tourne à 250 ms. Ne jamais lancer une nouvelle
 // requête tant que la précédente n'est pas terminée, afin d'éviter une
 // file d'attente et un retard progressif de l'affichage.
 if(stateLoadInFlight)return;
 stateLoadInFlight=true;
 try{
  const response=await fetch('/api/state',{cache:'no-store'});
  if(!response.ok)throw new Error(`État Velocity indisponible (${response.status})`);
  const nextState=await response.json();
  // Pendant un changement de circuit, ignorer les anciens états encore en transit.
  if(circuitChangeInProgress&&pendingCircuitId&&String(nextState?.circuit_id||'')!==String(pendingCircuitId))return;
  syncRemainingFromState(nextState);
  state=nextState;
  if(!(state.drivers||[]).length){autoBriceFollowApplied=false;manualFollowOverride=false}
  render();
  maybeAutoFollowBrice();
  ensureApexBrowserConnection();
 }catch(error){
  console.warn('[Velocity] Rafraîchissement de l’état impossible :',error);
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
window.velocityApexMap={rows:new Map(),lastEventAt:0,noLive:true,circuitId:null,schema:new Map(),labels:new Map()};
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
 window.velocityApexMap.schema=new Map();window.velocityApexMap.labels=new Map();
}
function velocityApexSectorCellToMs(raw){
 const text=String(raw??'').trim().replace(',','.');if(!text)return null;
 if(/^\d+(?::\d{1,2})?\.\d{1,3}$/.test(text)&&text.includes(':')){
  const parts=text.split(':').map(Number);const seconds=parts.length===2?parts[0]*60+parts[1]:NaN;return Number.isFinite(seconds)?Math.round(seconds*1000):null;
 }
 const value=Number(text);if(!Number.isFinite(value)||value<=0)return null;
 // Les cellules S1/S2/S3 Apex sont généralement en secondes décimales
 // (ex. 22.071), alors que les impulsions * transportent des millisecondes.
 return value<1000?Math.round(value*1000):Math.round(value);
}
function ingestApexGridSchema(frame,circuitId){
 const registry=window.velocityApexMap;if(registry.circuitId!==circuitId)resetVelocityApexMap(circuitId);
 const raw=String(frame||'');const marker=raw.indexOf('grid||');if(marker<0)return false;
 const html=raw.slice(marker+6);
 try{
  const doc=new DOMParser().parseFromString(html,'text/html');
  const schema=new Map(),labels=new Map();
  doc.querySelectorAll('[data-id]').forEach(el=>{
   const id=String(el.getAttribute('data-id')||'');const match=id.match(/^c(\d+)$/);if(!match)return;
   const col=Number(match[1]),type=String(el.getAttribute('data-type')||'').trim().toLowerCase();
   if(type)schema.set(col,type);labels.set(col,String(el.textContent||'').trim());
  });
  if(schema.size){
   registry.schema=schema;registry.labels=labels;
   // V7.2.1780 — les chronos secteurs viennent des cellules S1/S2/S3 Apex.
   // On initialise également l'état timing avec le snapshot GRID courant,
   // sans toucher aux données de tracking (* / *i1 / *i2) utilisées par la carte.
   doc.querySelectorAll('[data-id^="r"][data-id*="c"]').forEach(el=>{
    const id=String(el.getAttribute('data-id')||''),m=id.match(/^r(\d+)c(\d+)$/);if(!m)return;
    const row=Number(m[1]),col=Number(m[2]),type=String(schema.get(col)||'').toLowerCase();
    if(!['s1','s2','s3'].includes(type))return;
    const ms=velocityApexSectorCellToMs(String(el.textContent||'').trim());if(!Number.isFinite(ms)||ms<=0)return;
    const previous=registry.rows.get(row)||{row,sectors:{s1:null,s2:null,s3:null},currentSectors:{s1:null,s2:null,s3:null},lastPhase:0,sectorMode:false};
    previous.timingCurrentSectors=previous.timingCurrentSectors||{s1:null,s2:null,s3:null};
    previous.timingCurrentSectors[type]=ms;previous.timingSectorUpdatedAt=Date.now();
    if(type==='s3')previous.timingConfirmedSectorCount=3;
    registry.rows.set(row,previous);
   });
  }
  return schema.size>0;
 }catch(_e){return false}
}
function ingestApexSectorCellUpdates(frame,circuitId){
 const registry=window.velocityApexMap;if(registry.circuitId!==circuitId)resetVelocityApexMap(circuitId);
 if(!(registry.schema instanceof Map)||!registry.schema.size)return;
 const raw=String(frame||'').replace(/\r\n?/g,'\n');
 // V7.2.1780 — SOURCE CHRONO : cellules S1/S2/S3 du GRID Apex.
 // Les impulsions * / *i1 / *i2 restent exclusivement réservées au tracking
 // de la carte et ne doivent jamais alimenter les chronos affichés dans Analyzer.
 const updateRe=/r(\d+)c(\d+)\|([^|\s@]*)\|([^|\s@<]+)/g;
 for(const match of raw.matchAll(updateRe)){
  const row=Number(match[1]),col=Number(match[2]),code=String(match[3]||'').trim(),type=String(registry.schema.get(col)||'').toLowerCase();
  if(!['s1','s2','s3'].includes(type))continue;
  const ms=velocityApexSectorCellToMs(match[4]);if(!Number.isFinite(ms)||ms<=0)continue;
  const now=Date.now(),previous=registry.rows.get(row)||{row,sectors:{s1:null,s2:null,s3:null},currentSectors:{s1:null,s2:null,s3:null},lastPhase:0,sectorMode:false};
  previous.timingCurrentSectors=previous.timingCurrentSectors||{s1:null,s2:null,s3:null};
  // Une nouvelle valeur S1 marque le nouveau tour chrono : S2/S3 visibles
  // appartenaient au tour précédent et sont remis à blanc côté Velocity.
  if(type==='s1'){
   previous.timingCurrentSectors={s1:ms,s2:null,s3:null};
   previous.timingSectorSequence=(Number(previous.timingSectorSequence)||0)+1;
  }else previous.timingCurrentSectors[type]=ms;
  previous.timingSectorUpdatedAt=now;previous.timingLastCode=code;
  if(type==='s3')previous.timingConfirmedSectorCount=3;
  registry.rows.set(row,previous);registry.lastEventAt=now;registry.noLive=false;
  try{window.dispatchEvent(new CustomEvent('velocity:apex-timing-sector',{detail:{row,sector:type,value:ms,code,currentSectors:{...previous.timingCurrentSectors},confirmedSectorCount:Number(previous.timingConfirmedSectorCount)||0,at:now}}))}catch(_e){}
 }
}
function velocityDriverHasParticipated(driver){
 const laps=Number(driver?.laps);
 if(Number.isFinite(laps)&&laps>0)return true;
 const values=[driver?.last,driver?.best,driver?.last_lap,driver?.best_lap];
 return values.some(value=>{const text=String(value??'').trim().toLowerCase();return Boolean(text&&text!=='—'&&!text.includes('non partant'));});
}
// Source de vérité unique pour STANDS / Spotter et Heat Map.
// - impulsion MAP *in : toujours prioritaire ;
// - statut backend pit : accepté ;
// - sta/si : accepté seulement pour un concurrent ayant réellement participé,
//   afin de ne pas envoyer les « Non partant » dans la pit lane.
function velocityKartIsInPit(driver){
 if(!driver)return false;
 const row=Number(driver?.apex_row);
 const mapEntry=Number.isFinite(row)?window.velocityApexMap?.rows?.get(row):null;
 if(mapEntry?.inPit)return true;
 if(String(driver?.status||'').toLowerCase()!=='pit')return false;
 if(String(driver?.status_source||'').toLowerCase()==='sta'&&!velocityDriverHasParticipated(driver))return false;
 return true;
}
window.velocityDriverHasParticipated=velocityDriverHasParticipated;
window.velocityKartIsInPit=velocityKartIsInPit;
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
  const previous=registry.rows.get(row)||{row,sectors:{s1:null,s2:null,s3:null},currentSectors:{s1:null,s2:null,s3:null},lastPhase:0,sectorMode:false};
  previous.sectors=previous.sectors||{s1:null,s2:null,s3:null};
  previous.currentSectors=previous.currentSectors||{s1:null,s2:null,s3:null};
  previous.lastPhase=velocityApexMapEntryPhase(previous,now);

  if(code==='*'){
   // Protocole Apex officiel : * porte S1 dans le 4e champ (t[3]).
   // C'est également notre marqueur de nouveau tour secteur : S2/S3 du tour
   // précédent sont effacés pour que « TOUR EN COURS » soit réellement live.
   // V7.2.1777 : le nouveau * confirme aussi la découpe du tour précédent,
   // sans retarder l'affichage live. Une piste déjà confirmée à 3 secteurs
   // ne peut jamais être rétrogradée à 2 sur une impulsion manquée.
   if(Number(previous.currentSectorSequence)>0){
    const completed=previous.currentSectors||{};
    const completedCount=Number.isFinite(Number(completed.s3))&&Number(completed.s3)>0?3:Number.isFinite(Number(completed.s2))&&Number(completed.s2)>0&&Number.isFinite(Number(completed.s1))&&Number(completed.s1)>0?2:Number.isFinite(Number(completed.s1))&&Number(completed.s1)>0?1:0;
    if(completedCount>0)previous.confirmedSectorCount=Math.max(Number(previous.confirmedSectorCount)||0,completedCount);
   }
   const s1=Number.isFinite(extra)&&extra>0?extra:null;
   previous.currentSectors={s1,s2:null,s3:null};
   previous.currentSectorSequence=(Number(previous.currentSectorSequence)||0)+1;
   previous.currentSectorStartedAt=now;
   previous.currentSectorUpdatedAt=now;
   if(Number.isFinite(value)&&value>0)previous.lapDurationMs=value;
   if(Number.isFinite(s1)&&s1>0){previous.sectors.s1=s1;previous.sectorMode=true}
   // `sectors` reste volontairement un modèle roulant pour TRAFIC/Heat Map :
   // on ne supprime donc pas ici les anciens S2/S3 nécessaires à l'interpolation.
   previous.segment=previous.sectorMode&&Number.isFinite(s1)&&s1>0?'s1':'track';
   previous.durationMs=previous.segment==='s1'?s1:value;
   previous.inPit=false;
  }else if(code==='*i1'){
   // Protocole Apex officiel : *i1 porte S2 dans t[2].
   if(Number.isFinite(value)&&value>0){previous.sectors.s2=value;previous.currentSectors.s2=value}
   previous.currentSectorUpdatedAt=now;
   previous.sectorMode=true;previous.segment='s2';previous.durationMs=value;previous.inPit=false;
  }else if(code==='*i2'){
   // Protocole Apex officiel : *i2 porte S3 dans t[2].
   if(Number.isFinite(value)&&value>0){previous.sectors.s3=value;previous.currentSectors.s3=value;previous.confirmedSectorCount=3}
   previous.currentSectorUpdatedAt=now;
   previous.sectorMode=true;previous.segment='s3';previous.durationMs=value;previous.inPit=false;
  }else if(code==='*in'){
   previous.currentSectors={s1:null,s2:null,s3:null};previous.currentSectorUpdatedAt=now;
   previous.segment='in';previous.durationMs=8000;previous.inPit=true;previous.pitEnteredAt=previous.pitEnteredAt||now;
  }else if(code==='*out'){
   previous.currentSectors={s1:null,s2:null,s3:null};previous.currentSectorUpdatedAt=now;
   previous.segment='out';previous.durationMs=Number.isFinite(value)&&value>0?value:5000;previous.inPit=false;previous.pitEnteredAt=null;
  }
  if(!Number.isFinite(previous.durationMs)||previous.durationMs<=0)continue;
  previous.startedAt=now;previous.lastEventAt=now;previous.code=code;
  registry.rows.set(row,previous);registry.lastEventAt=now;registry.noLive=false;
  // Événement de tracking conservé pour TRAFIC / Heat Map et reset de relais aux pits.
  // Les chronos secteurs Analyzer n'utilisent plus ces durées de tracking.
  try{window.dispatchEvent(new CustomEvent('velocity:apex-map-sector',{detail:{row,code,at:now}}))}catch(_e){}
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
  ingestApexElapsed(frame);
  ingestApexSessionType(frame);
  // V7.2.1779 : le numéro de colonne Apex n'est jamais stable d'une session
  // à l'autre. Le GRID courant reconstruit donc le mapping data-type -> cX
  // avant toute lecture des cellules S1/S2/S3.
  ingestApexGridSchema(frame,circuit.id);
  ingestApexSectorCellUpdates(frame,circuit.id);
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
const VELOCITY_FOCUS_SESSION_KEY=velocityWorkspaceStorageKey('velocity_active_focus_v1');
let velocityFocusRestoreInFlight=false;
function rememberVelocityFocus(mode){try{sessionStorage.setItem(VELOCITY_FOCUS_SESSION_KEY,String(mode||''))}catch(_){}}
function clearVelocityFocusMemory(mode=''){try{const active=sessionStorage.getItem(VELOCITY_FOCUS_SESSION_KEY)||'';if(!mode||active===mode)sessionStorage.removeItem(VELOCITY_FOCUS_SESSION_KEY)}catch(_){}}
function velocityStoredFocus(){try{return String(sessionStorage.getItem(VELOCITY_FOCUS_SESSION_KEY)||'')}catch(_){return ''}}
async function velocityRestoreFocusIfNeeded(){
 if(velocityFocusRestoreInFlight)return;
 const focus=velocityStoredFocus();if(!focus)return;
 if(document.body.classList.contains('velocity-device-waiting-mode')||!document.getElementById('raceRoleEnded')?.hidden)return;
 const map={sprint:['sprint','sprintFocus','openSprintFocus'],qualification:['qualification','qualificationFocus','openQualificationFocus'],endurance:['endurance','enduranceFocus','openEnduranceFocus']};
 const target=map[focus];if(!target)return clearVelocityFocusMemory();
 const [mode,overlayId,opener]=target,overlay=document.getElementById(overlayId);
 if(overlay?.classList.contains('show'))return;
 velocityFocusRestoreInFlight=true;
 try{if(currentMode!==mode)showMode(mode);const fn=window[opener];if(typeof fn==='function')await fn()}catch(e){console.warn('[Velocity] Restauration Focus',e)}finally{velocityFocusRestoreInFlight=false}
}
function velocityFocusWatchdogStart(){
 if(window.__velocityFocusWatchdog)return;
 window.__velocityFocusWatchdog=setInterval(()=>velocityRestoreFocusIfNeeded(),1500);
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')setTimeout(()=>velocityRestoreFocusIfNeeded(),80)});
 window.addEventListener('pageshow',()=>setTimeout(()=>velocityRestoreFocusIfNeeded(),80));
}
velocityFocusWatchdogStart();
function renderVelocityWorkspaceSummary(){
 const ws=state?.workspace||{};
 const strip=document.getElementById('velocityWorkspaceStrip');
 if(!strip)return;
 const visible=Boolean(ws.can_manage);
 strip.hidden=!visible;
 if(!visible)return;
 const name=document.getElementById('velocityWorkspaceName'),code=document.getElementById('velocityWorkspaceCode');
 if(name)name.textContent=ws.name||'Session Velocity';
 if(code)code.textContent=ws.code||'—';
}
function velocityWorkspaceFeedback(message='',error=false){
 const el=document.getElementById('velocityWorkspaceFeedback');if(!el)return;
 el.textContent=message||'';el.classList.toggle('error',Boolean(error));
}
function velocityWorkspaceRow(item,activeId){
 const row=document.createElement('div');row.className='velocity-workspace-row'+(String(item.id)===String(activeId)?' active':'');
 const main=document.createElement('div');main.className='velocity-workspace-row-main';
 const title=document.createElement('strong');title.textContent=item.name||'Session Velocity';
 const meta=document.createElement('small');meta.textContent=`${item.code||'—'} · ${Number(item.members_count)||1} membre${Number(item.members_count)===1?'':'s'}${item.owner?' · propriétaire':''}`;
 main.append(title,meta);row.appendChild(main);
 const actions=document.createElement('div');actions.className='velocity-workspace-row-actions';
 const open=document.createElement('button');open.type='button';
 if(String(item.id)===String(activeId)){open.textContent='ACTIVE';open.disabled=true}else{open.textContent='OUVRIR';open.onclick=()=>selectVelocityWorkspace(item.id)}
 actions.appendChild(open);
 const remove=document.createElement('button');remove.type='button';remove.className='velocity-workspace-remove';remove.textContent=item.owner?'SUPPRIMER':'QUITTER';
 remove.onclick=()=>item.owner?deleteVelocityWorkspace(item.id,item.name):leaveVelocityWorkspace(item.id,item.name);
 actions.appendChild(remove);row.appendChild(actions);return row;
}
async function refreshVelocityWorkspaceManager(){
 const list=document.getElementById('velocityWorkspaceList');if(!list)return;
 list.replaceChildren();velocityWorkspaceFeedback('Chargement…');
 try{
  const r=await fetch('/api/workspaces',{cache:'no-store'}),data=await r.json();
  if(!r.ok||!data.ok)throw new Error(data.error||'Sessions indisponibles');
  const items=Array.isArray(data.workspaces)?data.workspaces:[];
  if(!items.length){const empty=document.createElement('div');empty.className='empty';empty.textContent='Aucune session.';list.appendChild(empty)}
  else items.forEach(item=>list.appendChild(velocityWorkspaceRow(item,data.active_workspace_id)));
  velocityWorkspaceFeedback('');
 }catch(error){velocityWorkspaceFeedback(error.message||String(error),true)}
}
function openVelocityWorkspaceManager(){
 if(!state?.workspace?.can_manage)return;
 const modal=document.getElementById('velocityWorkspaceModal');if(!modal)return;
 modal.hidden=false;document.body.classList.add('velocity-workspace-open');void refreshVelocityWorkspaceManager();
}
function closeVelocityWorkspaceManager(){
 const modal=document.getElementById('velocityWorkspaceModal');if(modal)modal.hidden=true;
 document.body.classList.remove('velocity-workspace-open');velocityWorkspaceFeedback('');
}
async function velocityWorkspaceActivate(url,body){
 if(velocityWorkspaceSwitching)return;
 velocityWorkspaceSwitching=true;velocityWorkspaceFeedback('Ouverture de la session…');
 try{
  closeApexBrowserSocket();
  const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body||{})});
  const data=await r.json();if(!r.ok||!data.ok)throw new Error(data.error||'Opération impossible');
  location.reload();
 }catch(error){velocityWorkspaceSwitching=false;velocityWorkspaceFeedback(error.message||String(error),true);ensureApexBrowserConnection()}
}
function selectVelocityWorkspace(workspaceId){return velocityWorkspaceActivate('/api/workspaces/select',{workspace_id:workspaceId})}
async function velocityWorkspaceRemove(url,message){
 if(velocityWorkspaceSwitching)return;
 if(!confirm(message))return;
 velocityWorkspaceSwitching=true;velocityWorkspaceFeedback('Mise à jour des sessions…');
 try{
  closeApexBrowserSocket();
  const r=await fetch(url,{method:url.endsWith('/leave')?'POST':'DELETE'}),data=await r.json();
  if(!r.ok||!data.ok)throw new Error(data.error||'Opération impossible');
  location.reload();
 }catch(error){velocityWorkspaceSwitching=false;velocityWorkspaceFeedback(error.message||String(error),true);ensureApexBrowserConnection()}
}
function deleteVelocityWorkspace(workspaceId,name=''){
 const label=String(name||'cette Session Velocity');
 return velocityWorkspaceRemove(`/api/workspaces/${encodeURIComponent(workspaceId)}`,`Supprimer définitivement « ${label} » ? Les données de cette Session Velocity seront supprimées. Cette action est irréversible.`);
}
function leaveVelocityWorkspace(workspaceId,name=''){
 const label=String(name||'cette Session Velocity');
 return velocityWorkspaceRemove(`/api/workspaces/${encodeURIComponent(workspaceId)}/leave`,`Quitter « ${label} » ? Vous n’y aurez plus accès sauf si vous rejoignez à nouveau son code.`);
}
function createVelocityWorkspace(){
 const input=document.getElementById('velocityWorkspaceCreateName');
 return velocityWorkspaceActivate('/api/workspaces/create',{name:String(input?.value||'').trim()});
}
function joinVelocityWorkspace(){
 const input=document.getElementById('velocityWorkspaceJoinCode');
 const code=String(input?.value||'').trim().toUpperCase();
 if(!code)return velocityWorkspaceFeedback('Saisissez le code de la session.',true);
 return velocityWorkspaceActivate('/api/workspaces/join',{code});
}
window.renderVelocityWorkspaceSummary=renderVelocityWorkspaceSummary;
window.openVelocityWorkspaceManager=openVelocityWorkspaceManager;
window.closeVelocityWorkspaceManager=closeVelocityWorkspaceManager;
window.selectVelocityWorkspace=selectVelocityWorkspace;
window.deleteVelocityWorkspace=deleteVelocityWorkspace;
window.leaveVelocityWorkspace=leaveVelocityWorkspace;
window.createVelocityWorkspace=createVelocityWorkspace;
window.joinVelocityWorkspace=joinVelocityWorkspace;

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
 screen.classList.add('active','screen-enter');setTimeout(()=>screen.classList.remove('screen-enter'),220);document.querySelectorAll('.mode-btn').forEach(x=>x.classList.toggle('active',x.dataset.mode===mode));if(mode==='spotter'&&typeof spotterEnterMode==='function')spotterEnterMode();if(mode!=='home'&&mode!=='spotter')api('/api/mode',{mode:mode==='analyzer'?'endurance':mode})
}

let sprintFocusWakeLock=null;

if(!window.__velocitySessionClockTimer){window.__velocitySessionClockTimer=setInterval(updateRemainingDisplay,1000)}
