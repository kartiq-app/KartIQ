/* Velocity V7.2.8 — Cartes carrées à demi-kart latéral */
const SPOTTER_STORAGE_KEY='velocity_spotter_v7_foundation';
const SPOTTER_APP_RELEASE='7.2.20';
const spotterState={
 version:5,mode:1,setupKarts:['X','Y','Z'],queue:[],maintenance:[],incoming:[],configured:false,
 assignments:{},movementLog:[],nextKvNumber:1,lastDriverStatus:{},monitorPrimed:false,
 freeMode:false,freeStartedAt:null,freePitIns:0,freePitOuts:0,freeNeedsRecalibration:false,recalibrating:false,incomingQueueSelections:{},undoSnapshot:null
};
function spotterPadKv(index){return `KV${String(index+1).padStart(2,'0')}`}
function spotterKvFromNumber(number){return `KV${String(Math.max(1,Number(number)||1)).padStart(2,'0')}`}
function spotterKvNumber(kv){const match=String(kv||'').match(/(\d+)/);return match?Number(match[1]):0}
function spotterDefaultKartName(index){
 const sequence=['X','Y','Z'];
 if(index<sequence.length)return sequence[index];
 let n=index-sequence.length,label='';
 do{label=String.fromCharCode(65+(n%26))+label;n=Math.floor(n/26)-1}while(n>=0);
 return label;
}
function spotterEnsureSetupDefaults(){
 if(!Array.isArray(spotterState.setupKarts)||!spotterState.setupKarts.length)spotterState.setupKarts=['X','Y','Z'];
 spotterState.setupKarts=spotterState.setupKarts.map((value,index)=>String(value||spotterDefaultKartName(index)));
 if(!spotterState.assignments||typeof spotterState.assignments!=='object')spotterState.assignments={};
 if(!Array.isArray(spotterState.movementLog))spotterState.movementLog=[];
 if(!spotterState.lastDriverStatus||typeof spotterState.lastDriverStatus!=='object')spotterState.lastDriverStatus={};
 // Nettoie les cartes de test héritées de la Foundation V7.0.x. Elles n'avaient
 // ni équipe ni KV retourné exploitables par le moteur FIFO V7.1.
 if(!Array.isArray(spotterState.incoming))spotterState.incoming=[];
 spotterState.incoming=spotterState.incoming.filter(item=>item&&item.id&&item.team&&item.returnedKv&&item.source!=='dev');
 if(typeof spotterState.freeMode!=='boolean')spotterState.freeMode=false;
 if(!Number.isFinite(Number(spotterState.freePitIns)))spotterState.freePitIns=0;
 if(!Number.isFinite(Number(spotterState.freePitOuts)))spotterState.freePitOuts=0;
 if(typeof spotterState.freeNeedsRecalibration!=='boolean')spotterState.freeNeedsRecalibration=false;
 if(typeof spotterState.recalibrating!=='boolean')spotterState.recalibrating=false;
 if(!spotterState.incomingQueueSelections||typeof spotterState.incomingQueueSelections!=='object')spotterState.incomingQueueSelections={};
 if(!('undoSnapshot' in spotterState))spotterState.undoSnapshot=null;
 spotterState.mode=Math.max(1,Math.min(3,Number(spotterState.mode)||1));
 [...(spotterState.queue||[]),...(spotterState.maintenance||[])].forEach((item,index)=>{if(item&&!Number.isFinite(Number(item.queueFile)))item.queueFile=(index%spotterState.mode)+1;item.queueFile=Math.max(1,Math.min(spotterState.mode,Number(item.queueFile)||1));});
 spotterState.version=5;
 const all=[...(spotterState.queue||[]),...(spotterState.maintenance||[]),...Object.values(spotterState.assignments||{})];
 const max=all.reduce((value,item)=>Math.max(value,spotterKvNumber(item?.kv)),0);
 spotterState.nextKvNumber=Math.max(Number(spotterState.nextKvNumber)||1,max+1);
}

const SPOTTER_CLIENT_ID=sessionStorage.getItem('velocity_spotter_client_id')||`spotter-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
sessionStorage.setItem('velocity_spotter_client_id',SPOTTER_CLIENT_ID);
let spotterApplyingRemote=false;
let spotterLastRemoteUpdate=0;

function spotterClone(value){return JSON.parse(JSON.stringify(value??null))}
function spotterUndoState(){
 return {
  mode:spotterState.mode,
  queue:spotterClone(spotterState.queue||[]),
  maintenance:spotterClone(spotterState.maintenance||[]),
  incoming:spotterClone(spotterState.incoming||[]),
  assignments:spotterClone(spotterState.assignments||{}),
  incomingQueueSelections:spotterClone(spotterState.incomingQueueSelections||{}),
  movementLog:spotterClone(spotterState.movementLog||[]),
  freeMode:Boolean(spotterState.freeMode),
  freeStartedAt:spotterState.freeStartedAt||null,
  freePitIns:Number(spotterState.freePitIns)||0,
  freePitOuts:Number(spotterState.freePitOuts)||0,
  freeNeedsRecalibration:Boolean(spotterState.freeNeedsRecalibration),
  recalibrating:Boolean(spotterState.recalibrating)
 };
}
function spotterRememberUndo(){spotterState.undoSnapshot=spotterUndoState()}
function spotterCanUndo(){return Boolean(spotterState.undoSnapshot)}
function spotterUndoLastAction(){
 if(!spotterCanUndo())return;
 if(!confirm('Annuler l’action précédente ?'))return;
 const previous=spotterClone(spotterState.undoSnapshot);
 spotterState.undoSnapshot=null;
 Object.assign(spotterState,previous);
 spotterLogMovement('undo_last_action');
 saveSpotterFoundation();
 spotterRenderCurrent();
}
function spotterApplyRemoteSnapshot(remote){
 if(!remote||typeof remote!=='object'||remote.client_id===SPOTTER_CLIENT_ID)return;
 const updated=Number(remote.updated_at_ms)||0;
 if(updated<=spotterLastRemoteUpdate)return;
 spotterLastRemoteUpdate=updated;
 spotterApplyingRemote=true;
 try{
  if(Number.isFinite(Number(remote.queue_mode)))spotterState.mode=Math.max(1,Math.min(3,Number(remote.queue_mode)));
  if(Array.isArray(remote.queue))spotterState.queue=spotterClone(remote.queue);
  if(Array.isArray(remote.maintenance))spotterState.maintenance=spotterClone(remote.maintenance);
  if(Array.isArray(remote.incoming))spotterState.incoming=spotterClone(remote.incoming);
  if(remote.assignments&&typeof remote.assignments==='object')spotterState.assignments=spotterClone(remote.assignments);
  if(Array.isArray(remote.movement_log))spotterState.movementLog=spotterClone(remote.movement_log);
  if(remote.incoming_queue_selections&&typeof remote.incoming_queue_selections==='object')spotterState.incomingQueueSelections=spotterClone(remote.incoming_queue_selections);
  spotterState.configured=Boolean(remote.configured);
  spotterState.freeMode=remote.mode==='auto';
  spotterState.recalibrating=Boolean(remote.recalibrating);
  spotterState.freeStartedAt=remote.free_started_at||null;
  spotterState.freePitIns=Number(remote.pit_ins)||0;
  spotterState.freePitOuts=Number(remote.pit_outs)||0;
  localStorage.setItem(SPOTTER_STORAGE_KEY,JSON.stringify({version:5,appRelease:SPOTTER_APP_RELEASE,savedAt:new Date().toISOString(),state:spotterState}));
  if(document.body.classList.contains('current-spotter'))spotterRenderCurrent();
 }finally{spotterApplyingRemote=false}
}
async function spotterPullSharedState(){
 try{
  const response=await fetch('/api/spotter-state',{cache:'no-store'});
  if(!response.ok)return;
  const payload=await response.json();
  spotterApplyRemoteSnapshot(payload?.spotter);
 }catch(error){console.warn('[Spotter] Lecture de l’état partagé impossible',error)}
}

function loadSpotterFoundation(){
 try{
  const saved=JSON.parse(localStorage.getItem(SPOTTER_STORAGE_KEY)||'null');
  // Migration V7.1.2 : les sauvegardes V7.1.1 et antérieures peuvent contenir
  // des cartes rouges et événements de test. On repart une seule fois du menu
  // de configuration, puis les sessions V7.1.2 sont conservées normalement.
  if(saved?.version>=4&&saved?.state){
   Object.assign(spotterState,saved.state);
   // À la première ouverture du Spotter après chaque mise à jour, on repasse
   // par la configuration. L'état précédent reste chargé jusqu'au lancement
   // explicite d'une nouvelle session.
   if(saved.appRelease!==SPOTTER_APP_RELEASE){
    spotterState.configured=false;
    spotterState.freeMode=false;
    spotterState.recalibrating=false;
    spotterState.freeNeedsRecalibration=false;
   }
  }else if(saved){
   localStorage.removeItem(SPOTTER_STORAGE_KEY);
  }
 }catch(_){localStorage.removeItem(SPOTTER_STORAGE_KEY)}
 spotterEnsureSetupDefaults();
 saveSpotterFoundation();
 renderSpotterFoundation();
}
let spotterSyncTimer=null;
function spotterSharedSnapshot(){
 const clone=value=>JSON.parse(JSON.stringify(value??null));
 return {
  configured:Boolean(spotterState.configured),
  client_id:SPOTTER_CLIENT_ID,queue_mode:Number(spotterState.mode)||1,
  mode:spotterState.recalibrating?'recalibrating':(spotterState.freeMode?'auto':'live'),
  queue:clone(spotterState.queue||[]),maintenance:clone(spotterState.maintenance||[]),incoming:clone(spotterState.incoming||[]),
  assignments:clone(spotterState.assignments||{}),movement_log:clone((spotterState.movementLog||[]).slice(0,40)),incoming_queue_selections:clone(spotterState.incomingQueueSelections||{}),
  free_started_at:spotterState.freeStartedAt||null,pit_ins:Number(spotterState.freePitIns)||0,pit_outs:Number(spotterState.freePitOuts)||0,recalibrating:Boolean(spotterState.recalibrating)
 };
}
async function spotterPushSharedState(){
 try{await fetch('/api/spotter-state',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({spotter:spotterSharedSnapshot()})})}catch(error){console.warn('[Spotter] Synchronisation serveur impossible',error)}
}
function spotterScheduleSharedSync(){if(spotterApplyingRemote)return;clearTimeout(spotterSyncTimer);spotterSyncTimer=setTimeout(spotterPushSharedState,80)}
function saveSpotterFoundation(){
 localStorage.setItem(SPOTTER_STORAGE_KEY,JSON.stringify({version:5,appRelease:SPOTTER_APP_RELEASE,savedAt:new Date().toISOString(),state:spotterState}));
 spotterScheduleSharedSync();
}
function openSpotterSetup(){spotterState.configured=false;saveSpotterFoundation();renderSpotterFoundation('mode')}
function setSpotterMode(mode){const count=Math.max(1,Math.min(3,Number(mode)||1));spotterState.mode=count;saveSpotterFoundation();renderSpotterFoundation('queue')}
function addSpotterSetupKart(){spotterState.setupKarts.push(spotterDefaultKartName(spotterState.setupKarts.length));renderSpotterFoundation('queue');setTimeout(()=>document.querySelector('.spotter-setup-row:last-of-type input')?.focus(),0)}
function removeSpotterSetupKart(index){if(spotterState.setupKarts.length<=1)return;spotterState.setupKarts.splice(index,1);renderSpotterFoundation('queue')}
function updateSpotterSetupKart(index,value){spotterState.setupKarts[index]=String(value||'').trim().slice(0,18);saveSpotterFoundation();const btn=document.getElementById('spotterLaunchButton');if(btn)btn.disabled=!spotterState.setupKarts.some(Boolean)}
function spotterDriverKey(driver){return String(driver?.driver||driver?.name||'').trim()}
function spotterMetricsForDriver(driver){
 let score=null,confidence=null;
 try{if(typeof analyzerKartScore==='function')score=analyzerKartScore(driver)}catch(_){ }
 try{if(typeof analyzerConfidence==='function')confidence=analyzerConfidence(driver)}catch(_){ }
 return {score:Number.isFinite(Number(score))?Math.round(Number(score)):null,confidence:Number.isFinite(Number(confidence))?Math.round(Number(confidence)):null};
}
function spotterSeedGridAssignments(startNumber){
 const assignments={};let next=Math.max(1,Number(startNumber)||1);
 const drivers=[...(window.state?.drivers||[])].filter(driver=>spotterDriverKey(driver)).sort((a,b)=>(Number(a.pos)||999)-(Number(b.pos)||999));
 drivers.forEach(driver=>{
  const team=spotterDriverKey(driver);const metrics=spotterMetricsForDriver(driver);
  assignments[team]={kv:spotterKvFromNumber(next++),apexKart:String(driver.apex||driver.kart||'—'),lastTeam:team,currentTeam:team,score:metrics.score,confidence:metrics.confidence,status:'track'};
 });
 return {assignments,next};
}
function launchSpotterFoundation(){
 const karts=spotterState.setupKarts.filter(kart=>String(kart||'').trim()).map((kart,index)=>({kv:spotterPadKv(index),apexKart:String(kart).trim(),lastTeam:'Initialisation',score:null,confidence:null,status:'available',queueFile:(index%spotterState.mode)+1}));
 if(!karts.length)return;
 const seeded=spotterSeedGridAssignments(karts.length+1);
 spotterState.queue=karts;spotterState.incoming=[];spotterState.maintenance=[];spotterState.assignments=seeded.assignments;spotterState.nextKvNumber=seeded.next;spotterState.movementLog=[];spotterState.lastDriverStatus={};spotterState.monitorPrimed=false;spotterState.freeMode=false;spotterState.freeStartedAt=null;spotterState.freePitIns=0;spotterState.freePitOuts=0;spotterState.freeNeedsRecalibration=false;spotterState.recalibrating=false;spotterState.configured=true;
 saveSpotterFoundation();renderSpotterFoundation('live');
}
function resetSpotterFoundation(){
 if(!confirm('Réinitialiser la configuration Spotter ?'))return;
 Object.assign(spotterState,{mode:1,setupKarts:['X','Y','Z'],queue:[],maintenance:[],incoming:[],assignments:{},movementLog:[],nextKvNumber:1,lastDriverStatus:{},monitorPrimed:false,freeMode:false,freeStartedAt:null,freePitIns:0,freePitOuts:0,freeNeedsRecalibration:false,recalibrating:false,configured:false});
 saveSpotterFoundation();renderSpotterFoundation('mode');
}
function spotterAllocateKv(){const kv=spotterKvFromNumber(spotterState.nextKvNumber);spotterState.nextKvNumber+=1;return kv}
function spotterFindDriver(team){return (window.state?.drivers||[]).find(driver=>spotterDriverKey(driver)===String(team||''))||null}
function spotterCurrentAssignment(team){return spotterState.assignments[String(team||'')]||null}
function spotterEnsureAssignment(team,driver=null){
 const key=String(team||'').trim();if(!key)return null;
 if(spotterState.assignments[key])return spotterState.assignments[key];
 const metrics=spotterMetricsForDriver(driver||spotterFindDriver(key));
 const assignment={kv:spotterAllocateKv(),apexKart:String(driver?.apex||driver?.kart||'—'),lastTeam:key,currentTeam:key,score:metrics.score,confidence:metrics.confidence,status:'track'};
 spotterState.assignments[key]=assignment;return assignment;
}
function spotterAddIncoming(team,driver=null,{source='apex'}={}){
 const key=String(team||'').trim();if(!key)return false;
 if(spotterState.incoming.some(item=>item.team===key)||spotterState.queue.some(item=>item.status==='reserved'&&item.reservedTeam===key))return false;
 const assignment=spotterEnsureAssignment(key,driver);
 // Une ancienne sauvegarde ne doit jamais pouvoir réutiliser le KV d'un kart
 // déjà présent dans la file ou en maintenance.
 const occupied=new Set([...(spotterState.queue||[]),...(spotterState.maintenance||[])].map(item=>item?.kv).filter(Boolean));
 if(occupied.has(assignment.kv))assignment.kv=spotterAllocateKv();
 const metrics=spotterMetricsForDriver(driver||spotterFindDriver(key));
 assignment.score=metrics.score??assignment.score;assignment.confidence=metrics.confidence??assignment.confidence;
 const incoming={id:`${source}-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,team:key,name:key,returnedKv:assignment.kv,returnedKart:assignment.apexKart,score:assignment.score,confidence:assignment.confidence,pitInAt:Date.now(),status:'incoming',source,estimated:Boolean(spotterState.freeMode)};
 spotterState.incoming.push(incoming);
 if(spotterState.freeMode){spotterState.freePitIns+=1;spotterState.freeNeedsRecalibration=true;}
 spotterLogMovement('pit_in',{team:key,kv:assignment.kv,source,estimated:Boolean(spotterState.freeMode)});
 if(spotterState.freeMode){
  const validated=spotterValidateIncoming(incoming.id,false,{silent:true,estimated:true});
  if(validated)return true;
 }
 saveSpotterFoundation();renderSpotterFoundation('live');return true;
}
function simulateSpotterPitIn(){
 spotterRememberUndo();
 const index=spotterState.movementLog.filter(item=>item.type==='dev_pit_in').length;
 const team=spotterDefaultKartName(index);const score=78+((index*7)%21);const confidence=64+((index*11)%32);
 if(!spotterState.assignments[team])spotterState.assignments[team]={kv:spotterAllocateKv(),apexKart:spotterDefaultKartName(index),lastTeam:team,currentTeam:team,score,confidence,status:'track'};
 spotterLogMovement('dev_pit_in',{team});spotterAddIncoming(team,null,{source:'dev'});
}
function simulateSpotterPitOut(){
 spotterRememberUndo();
 const reserved=spotterState.queue.find(item=>item.status==='reserved');
 if(!reserved){alert('Aucun kart attribué n’attend une sortie.');return}
 spotterProcessPitOut(reserved.reservedTeam,{source:'dev'});
}
function spotterLogMovement(type,data={}){spotterState.movementLog.unshift({type,at:Date.now(),...data});spotterState.movementLog=spotterState.movementLog.slice(0,80)}
function spotterAvailableIndex(){return spotterState.queue.findIndex(item=>item.status==='available')}
function spotterRemoveKvEverywhere(kv){
 spotterState.queue=spotterState.queue.filter(item=>item.kv!==kv);
 spotterState.maintenance=spotterState.maintenance.filter(item=>item.kv!==kv);
}
function spotterValidateIncoming(id,toMaintenance=false,{silent=false,estimated=false,targetFile=null}={}){
 const index=spotterState.incoming.findIndex(item=>item.id===id);if(index<0)return;
 const incoming=spotterState.incoming[index];
 const availableIndex=spotterAvailableIndex();
 if(availableIndex<0){if(!silent)alert('Aucun kart disponible dans la file.');return false}
 const assigned=spotterState.queue[availableIndex];
 const selectedFile=toMaintenance
  ? (Number(assigned.queueFile)||1)
  : Math.max(1,Math.min(spotterState.mode,Number(targetFile||spotterState.incomingQueueSelections[id]||(silent?assigned.queueFile:0))||0));
 if(!toMaintenance&&!selectedFile){if(!silent)alert('Sélectionnez une file avant de valider.');return false}
 spotterRememberUndo();
 const current=spotterEnsureAssignment(incoming.team,spotterFindDriver(incoming.team));
 const returned={...current,kv:incoming.returnedKv||current.kv,apexKart:incoming.returnedKart||current.apexKart,lastTeam:incoming.team,currentTeam:null,score:incoming.score??current.score,confidence:incoming.confidence??current.confidence,status:toMaintenance?'maintenance':'available',enteredAt:Date.now(),queueFile:selectedFile};
 spotterRemoveKvEverywhere(returned.kv);
 assigned.status='reserved';assigned.reservedTeam=incoming.team;assigned.pitInAt=incoming.pitInAt||Date.now();assigned.reservedAt=Date.now();assigned.sourceLastTeam=assigned.lastTeam;assigned.estimated=Boolean(estimated||incoming.estimated||spotterState.freeMode);
 spotterState.incoming.splice(index,1);
 delete spotterState.incomingQueueSelections[id];
 if(toMaintenance)spotterState.maintenance.push(returned);else spotterState.queue.push(returned);
 current.status='pit';current.pendingReplacementKv=assigned.kv;
 spotterLogMovement(toMaintenance?'validate_maintenance':'validate',{team:incoming.team,receivedKv:assigned.kv,returnedKv:returned.kv,queueFile:selectedFile,estimated:Boolean(assigned.estimated)});
 saveSpotterFoundation();if(!silent)renderSpotterFoundation('live');return true;
}
function spotterReinsertMaintenance(kv,targetFile=null){
 const key=spotterMaintenanceSelectionKey(kv);
 const selectedFile=Math.max(1,Math.min(spotterState.mode,Number(targetFile||spotterState.incomingQueueSelections[key])||0));
 if(!selectedFile){alert('Sélectionnez une file avant de valider.');return false}
 if(!confirm(`Voulez-vous vraiment remettre le kart dans la file ${selectedFile} ?`))return false;
 const index=spotterState.maintenance.findIndex(item=>item.kv===kv);if(index<0)return false;
 spotterRememberUndo();
 const [item]=spotterState.maintenance.splice(index,1);
 item.status='available';item.reinsertedAt=Date.now();item.enteredAt=Date.now();item.queueFile=selectedFile;
 spotterState.queue.push(item);delete spotterState.incomingQueueSelections[key];
 spotterLogMovement('maintenance_reinsert',{kv,queueFile:selectedFile});saveSpotterFoundation();spotterRenderCurrent();return true;
}
function spotterProcessPitOut(team,{source='apex'}={}){
 const key=String(team||'').trim();const index=spotterState.queue.findIndex(item=>item.status==='reserved'&&item.reservedTeam===key);if(index<0)return false;
 const [assigned]=spotterState.queue.splice(index,1);const driver=spotterFindDriver(key);const metrics=spotterMetricsForDriver(driver);
 spotterState.assignments[key]={...assigned,currentTeam:key,lastTeam:assigned.sourceLastTeam||assigned.lastTeam,status:'track',reservedTeam:null,pitInAt:null,reservedAt:null,score:assigned.score??metrics.score,confidence:assigned.confidence??metrics.confidence,apexKart:String(driver?.apex||driver?.kart||assigned.apexKart||'—')};
 if(spotterState.freeMode){spotterState.freePitOuts+=1;spotterState.freeNeedsRecalibration=true;}
 spotterLogMovement('pit_out',{team:key,kv:assigned.kv,source,estimated:Boolean(spotterState.freeMode||assigned.estimated)});saveSpotterFoundation();renderSpotterFoundation('live');return true;
}
function spotterRefreshVelocityMetrics(){
 let changed=false;
 Object.entries(spotterState.assignments||{}).forEach(([team,item])=>{
  if(!item||item.status!=='track')return;
  const driver=spotterFindDriver(team);if(!driver)return;
  const metrics=spotterMetricsForDriver(driver);
  if(metrics.score!==null&&metrics.score!==item.score){item.score=metrics.score;changed=true}
  if(metrics.confidence!==null&&metrics.confidence!==item.confidence){item.confidence=metrics.confidence;changed=true}
  item.apexKart=String(driver.apex||driver.kart||item.apexKart||'—');item.currentTeam=team;item.lastTeam=team;
 });
 return changed;
}
function spotterMonitorApex(){
 if(!spotterState.configured||spotterState.recalibrating)return;
 const drivers=(window.state?.drivers||[]).filter(driver=>spotterDriverKey(driver));
 if(!drivers.length)return;
 if(!spotterState.monitorPrimed){
  drivers.forEach(driver=>{spotterState.lastDriverStatus[spotterDriverKey(driver)]=String(driver.status||'unknown').toLowerCase()});
  spotterState.monitorPrimed=true;saveSpotterFoundation();return;
 }
 let changed=spotterRefreshVelocityMetrics();
 drivers.forEach(driver=>{
  const team=spotterDriverKey(driver),status=String(driver.status||'unknown').toLowerCase(),previous=spotterState.lastDriverStatus[team];
  if(previous&&previous!=='pit'&&status==='pit')changed=spotterAddIncoming(team,driver,{source:'apex'})||changed;
  if(previous==='pit'&&status==='track')changed=spotterProcessPitOut(team,{source:'apex'})||changed;
  spotterState.lastDriverStatus[team]=status;
 });
 if(changed)saveSpotterFoundation();
}

function spotterActivateFree(){
 if(!spotterState.configured||spotterState.freeMode)return;
 spotterState.freeMode=true;spotterState.freeStartedAt=Date.now();spotterState.freePitIns=0;spotterState.freePitOuts=0;spotterState.freeNeedsRecalibration=false;spotterState.recalibrating=false;
 spotterLogMovement('auto_start',{at:spotterState.freeStartedAt});saveSpotterFoundation();renderSpotterFoundation('live');
}
function spotterRequestResume(){
 if(!spotterState.freeMode)return;
 spotterState.recalibrating=true;spotterState.freeNeedsRecalibration=true;saveSpotterFoundation();renderSpotterFoundation('recalibrate');
}
function spotterConfirmRecalibration(){
 spotterState.queue.forEach(item=>{if(item)delete item.estimated});
 Object.values(spotterState.assignments||{}).forEach(item=>{if(item)delete item.estimated});
 spotterLogMovement('auto_recalibrated',{startedAt:spotterState.freeStartedAt,pitIns:spotterState.freePitIns,pitOuts:spotterState.freePitOuts});
 spotterState.freeMode=false;spotterState.freeStartedAt=null;spotterState.freePitIns=0;spotterState.freePitOuts=0;spotterState.freeNeedsRecalibration=false;spotterState.recalibrating=false;
 saveSpotterFoundation();renderSpotterFoundation('live');
}
function spotterFreeDuration(){return spotterState.freeStartedAt?spotterFormatDuration(Date.now()-Number(spotterState.freeStartedAt)): '00:00'}
function spotterToggleAuto(){
 if(spotterState.freeMode)spotterRequestResume();
 else spotterActivateFree();
}
function spotterModifyQueueMode(){
 const current=Math.max(1,Math.min(3,Number(spotterState.mode)||1));
 const answer=prompt('Nombre de files : 1, 2 ou 3',String(current));
 if(answer===null)return;
 const next=Number(answer);
 if(![1,2,3].includes(next)){alert('Choisissez 1, 2 ou 3 files.');return}
 if(next===current)return;
 if(!confirm(`Passer de ${current} à ${next} file${next>1?'s':''} ?`))return;
 spotterRememberUndo();
 spotterState.mode=next;
 (spotterState.queue||[]).forEach((item,index)=>{
  const previous=Math.max(1,Number(item.queueFile)||1);
  item.queueFile=previous<=next?previous:((index%next)+1);
 });
 (spotterState.maintenance||[]).forEach(item=>{
  item.queueFile=Math.max(1,Math.min(next,Number(item.queueFile)||1));
 });
 Object.keys(spotterState.incomingQueueSelections||{}).forEach(id=>{
  spotterState.incomingQueueSelections[id]=Math.max(1,Math.min(next,Number(spotterState.incomingQueueSelections[id])||1));
 });
 spotterLogMovement('change_queue_mode',{from:current,to:next});
 saveSpotterFoundation();spotterRenderCurrent();
}
function spotterCommandBar(step){
 const undoDisabled=spotterCanUndo()?'':'disabled';
 const menu=`<button class="spotter-back spotter-menu-command" type="button" onclick="showHome()" aria-label="Menu">☰<span>MENU</span></button>`;
 const undo=`<button class="spotter-undo-button" type="button" onclick="spotterUndoLastAction()" aria-label="Annuler la dernière action" title="Annuler la dernière action" ${undoDisabled}>↩</button>`;
 const mobileSettings=`<button class="spotter-icon-btn" type="button" onclick="openSpotterSetup()" aria-label="Préparer la zone Quick Change">⚙<span>QUICK CHANGE</span></button>`;
 const mobileAuto=spotterState.freeMode&&!spotterState.recalibrating
  ? `<button class="spotter-resume-main" type="button" onclick="spotterRequestResume()">▶ REPRENDRE</button>`
  : `<button class="spotter-free-button" type="button" onclick="spotterActivateFree()">AUTO</button>`;
 const mobile=`<div class="spotter-command-bar spotter-command-mobile ${spotterState.freeMode?'free-active':'live-mode'}">${menu}<span class="spotter-live-state">LIVE</span>${undo}${mobileAuto}${mobileSettings}</div>`;
 const desktop=`<div class="spotter-command-bar spotter-command-desktop">
  <span class="spotter-live-state">LIVE</span>
  ${undo}
  <button class="spotter-desktop-command spotter-quick-change-command" type="button" onclick="openSpotterSetup()">PRÉPARER LA ZONE QUICK CHANGE</button>
  <button class="spotter-desktop-command spotter-auto-command ${spotterState.freeMode?'active':''}" type="button" onclick="spotterToggleAuto()">AUTO</button>
  <button class="spotter-desktop-command spotter-modify-command" type="button" onclick="spotterModifyQueueMode()">MODIFIER LA FILE</button>
  <button class="spotter-desktop-command spotter-reset-command" type="button" onclick="resetSpotterFoundation()">RÉINITIALISER</button>
 </div>`;
 return mobile+desktop;
}

function spotterRenderCurrent(){renderSpotterFoundation(spotterState.recalibrating?'recalibrate':'live')}

const spotterDrag={kv:null,from:null,pointerId:null,ghost:null,offsetX:0,offsetY:0,target:null,marker:null,timer:null,startX:0,startY:0,active:false,card:null,handle:null};
function spotterQueueMovable(item){return item&&item.status==='available'}
function spotterEnsureInsertionMarker(){
 if(spotterDrag.marker?.isConnected)return spotterDrag.marker;
 const marker=document.createElement('div');marker.className='spotter-insertion-marker';document.body.appendChild(marker);spotterDrag.marker=marker;return marker;
}
function spotterHideInsertionMarker(){if(spotterDrag.marker)spotterDrag.marker.classList.remove('visible')}
function spotterShowInsertionMarker(rect){
 const marker=spotterEnsureInsertionMarker();
 marker.style.left=`${rect.left}px`;marker.style.top=`${rect.top}px`;marker.style.width=`${rect.width}px`;marker.classList.add('visible');
}
function spotterActivateDrag(clientX,clientY){
 const {card,handle}=spotterDrag;if(!card||!handle)return;
 spotterDrag.active=true;card.classList.add('dragging','drag-ready');
 const rect=card.getBoundingClientRect();
 spotterDrag.offsetX=clientX-rect.left;spotterDrag.offsetY=clientY-rect.top;
 const ghost=card.cloneNode(true);ghost.classList.add('spotter-drag-ghost','drag-ready');ghost.querySelector('.spotter-drag-handle')?.remove();ghost.style.width=`${rect.width}px`;ghost.style.height=`${rect.height}px`;
 document.body.appendChild(ghost);spotterDrag.ghost=ghost;spotterMoveGhost(clientX,clientY);
 document.body.classList.add('spotter-drag-active');
 if(navigator.vibrate)navigator.vibrate(25);
}
function spotterStartDrag(event,kv,from){
 if(event.button!==undefined&&event.button!==0)return;
 const source=(from==='queue'?spotterState.queue:spotterState.maintenance).find(item=>item.kv===kv);
 if(!source||!spotterQueueMovable(source))return;
 event.stopPropagation();
 const handle=event.currentTarget;
 const card=handle.closest('.spotter-queue-card');if(!card)return;
 spotterCancelPendingDrag();
 Object.assign(spotterDrag,{kv,from,pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,active:false,card,handle,target:null});
 try{handle.setPointerCapture(event.pointerId)}catch(_){}
 handle.classList.add('holding');
 spotterDrag.timer=setTimeout(()=>spotterActivateDrag(spotterDrag.startX,spotterDrag.startY),500);
 document.addEventListener('pointermove',spotterOnDragMove,{passive:false});
 document.addEventListener('pointerup',spotterEndDrag,{once:true});
 document.addEventListener('pointercancel',spotterEndDrag,{once:true});
}
function spotterCancelPendingDrag(){
 if(spotterDrag.timer){clearTimeout(spotterDrag.timer);spotterDrag.timer=null}
 spotterDrag.handle?.classList.remove('holding');
}
function spotterMoveGhost(x,y){if(spotterDrag.ghost){spotterDrag.ghost.style.left=`${x-spotterDrag.offsetX}px`;spotterDrag.ghost.style.top=`${y-spotterDrag.offsetY}px`}}
function spotterSetQueueTarget(column,beforeKv,markerRect){
 const file=column?.dataset.spotterFile||null;if(!file)return;
 spotterDrag.target={type:'queue',file,beforeKv:beforeKv||null};spotterShowInsertionMarker(markerRect);
}
function spotterOnDragMove(event){
 if(spotterDrag.pointerId!==null&&event.pointerId!==spotterDrag.pointerId)return;
 if(!spotterDrag.active){
  const distance=Math.hypot(event.clientX-spotterDrag.startX,event.clientY-spotterDrag.startY);
  if(distance>10)spotterCancelPendingDrag();
  return;
 }
 event.preventDefault();spotterMoveGhost(event.clientX,event.clientY);spotterHideInsertionMarker();spotterDrag.target=null;
 document.querySelectorAll('.spotter-drop-target').forEach(node=>node.classList.remove('spotter-drop-target'));
 const element=document.elementFromPoint(event.clientX,event.clientY);
 const maintenance=element?.closest('[data-spotter-drop-zone="maintenance"]');
 if(maintenance){maintenance.classList.add('spotter-drop-target');spotterDrag.target={type:'maintenance'};return}
 const column=element?.closest('[data-spotter-file]');if(!column)return;
 const list=column.querySelector('.spotter-file-list');if(!list)return;
 const card=element?.closest('[data-spotter-queue-kv]');
 const cards=[...list.querySelectorAll('[data-spotter-queue-kv]')].filter(node=>node.dataset.spotterQueueKv!==spotterDrag.kv);
 if(card&&card.dataset.spotterQueueKv!==spotterDrag.kv){
  const rect=card.getBoundingClientRect();const after=event.clientY>rect.top+rect.height/2;
  if(after){
   const index=cards.indexOf(card);const next=cards[index+1]||null;
   if(next){const nr=next.getBoundingClientRect();spotterSetQueueTarget(column,next.dataset.spotterQueueKv,{left:nr.left,top:nr.top-5,width:nr.width});}
   else spotterSetQueueTarget(column,null,{left:rect.left,top:rect.bottom+3,width:rect.width});
  }else spotterSetQueueTarget(column,card.dataset.spotterQueueKv,{left:rect.left,top:rect.top-5,width:rect.width});
  return;
 }
 if(!cards.length){const rect=list.getBoundingClientRect();spotterSetQueueTarget(column,null,{left:rect.left,top:rect.top+28,width:rect.width});return}
 const lastRect=cards[cards.length-1].getBoundingClientRect();spotterSetQueueTarget(column,null,{left:lastRect.left,top:lastRect.bottom+3,width:lastRect.width});
}
function spotterEndDrag(){
 document.removeEventListener('pointermove',spotterOnDragMove);
 spotterCancelPendingDrag();
 const target=spotterDrag.active?spotterDrag.target:null;
 if(target?.type==='maintenance')spotterMoveKartToMaintenance(spotterDrag.kv,spotterDrag.from);
 else if(target?.type==='queue')spotterMoveKartInQueue(spotterDrag.kv,spotterDrag.from,target.beforeKv,target.file);
 document.querySelectorAll('.dragging,.drag-ready,.spotter-drop-target').forEach(node=>node.classList.remove('dragging','drag-ready','spotter-drop-target'));
 spotterDrag.ghost?.remove();spotterDrag.marker?.remove();document.body.classList.remove('spotter-drag-active');
 Object.assign(spotterDrag,{kv:null,from:null,pointerId:null,ghost:null,offsetX:0,offsetY:0,target:null,marker:null,timer:null,startX:0,startY:0,active:false,card:null,handle:null});
}
function spotterMoveKartInQueue(kv,from,beforeKv=null,targetFile=null){
 spotterRememberUndo();
 let item=null;
 if(from==='queue'){
  const index=spotterState.queue.findIndex(entry=>entry.kv===kv&&entry.status==='available');if(index<0)return;
  [item]=spotterState.queue.splice(index,1);
 }else{
  const index=spotterState.maintenance.findIndex(entry=>entry.kv===kv);if(index<0)return;
  [item]=spotterState.maintenance.splice(index,1);item.status='available';item.reinsertedAt=Date.now();
 }
 if(targetFile)item.queueFile=Math.max(1,Math.min(spotterState.mode,Number(targetFile)||1));
 let target=beforeKv?spotterState.queue.findIndex(entry=>entry.kv===beforeKv):-1;
 if(target<0)target=spotterState.queue.length;
 // Une carte verte ne peut pas passer devant une carte rouge déjà attribuée.
 const firstAvailable=spotterState.queue.findIndex(entry=>entry.status==='available');
 if(firstAvailable>=0)target=Math.max(target,firstAvailable);
 spotterState.queue.splice(target,0,item);
 spotterLogMovement('manual_reorder',{kv,from,to:'queue',beforeKv});saveSpotterFoundation();spotterRenderCurrent();
}
function spotterMoveKartToMaintenance(kv,from){
 spotterRememberUndo();
 if(from!=='queue')return;
 const index=spotterState.queue.findIndex(entry=>entry.kv===kv&&entry.status==='available');if(index<0)return;
 const [item]=spotterState.queue.splice(index,1);item.status='maintenance';item.enteredAt=Date.now();spotterState.maintenance.push(item);
 spotterLogMovement('manual_maintenance',{kv});saveSpotterFoundation();spotterRenderCurrent();
}
function spotterRenderQueueColumns(){
 const count=Math.max(1,Math.min(3,Number(spotterState.mode)||1));
 const columns=[];
 for(let file=1;file<=count;file+=1){
  const items=(spotterState.queue||[]).filter(item=>(Number(item.queueFile)||1)===file);
  columns.push(`<div class="spotter-file-column" data-spotter-file="${file}"><div class="spotter-file-title">FILE ${file}</div><div class="spotter-file-list" data-spotter-drop-zone="queue">${items.length?items.map(spotterQueueCard).join(''):'<div class="spotter-empty spotter-file-empty">File vide</div>'}</div></div>`);
 }
 return `<div class="spotter-queues-layout queues-${count}">${columns.join('')}</div>`;
}
function renderSpotterFoundation(forceStep){
 const root=document.getElementById('spotterApp');if(!root)return;
 const step=forceStep||(spotterState.configured?(spotterState.recalibrating?'recalibrate':'live'):'mode');
 root.innerHTML=`<div class="spotter-shell">
  <div class="spotter-top-accent" aria-hidden="true"></div>
  <div class="spotter-desktop-heading"><span>SPOTTER</span></div>
  ${spotterCommandBar(step)}
  <div class="spotter-step ${step==='mode'?'active':''}" id="spotterModeStep">
   <section class="spotter-card"><div class="spotter-card-head"><h2>Mode Quick Change</h2></div><div class="spotter-card-body"><p class="spotter-intro">Choisissez le nombre de files utilisé par le circuit avant de lancer le Spotter.</p><div class="spotter-mode-grid"><button class="spotter-mode-option ${spotterState.mode===1?'active':''}" type="button" onclick="setSpotterMode(1)"><strong>1</strong><span>File</span><small>Verticale</small></button><button class="spotter-mode-option ${spotterState.mode===2?'active':''}" type="button" onclick="setSpotterMode(2)"><strong>2</strong><span>Files</span><small>Côte à côte</small></button><button class="spotter-mode-option ${spotterState.mode===3?'active':''}" type="button" onclick="setSpotterMode(3)"><strong>3</strong><span>Files</span><small>Côte à côte</small></button></div></div></section>
  </div>
  <div class="spotter-step ${step==='queue'?'active':''}" id="spotterQueueStep">
   <section class="spotter-card"><div class="spotter-card-head"><h2>Initialiser ${spotterState.mode>1?'les files':'la file'}</h2><span>${spotterState.setupKarts.length} kart(s)</span></div><div class="spotter-card-body"><p class="spotter-intro">Saisissez les karts présents au départ. Velocity les répartit automatiquement dans ${spotterState.mode} file${spotterState.mode>1?'s':''} verticale${spotterState.mode>1?'s':''} et attribue les identifiants KV dans cet ordre.</p><div id="spotterSetupRows">${spotterState.setupKarts.map((kart,index)=>`<div class="spotter-setup-row"><div class="spotter-kv">${spotterPadKv(index)}</div><input autocomplete="off" value="${spotterEscape(kart)}" placeholder="Nom du kart" oninput="updateSpotterSetupKart(${index},this.value)"><button class="spotter-remove" type="button" onclick="removeSpotterSetupKart(${index})" aria-label="Supprimer">×</button></div>`).join('')}</div><button class="spotter-add-row" type="button" onclick="addSpotterSetupKart()">＋ AJOUTER UN KART</button><button id="spotterLaunchButton" class="spotter-primary" type="button" onclick="launchSpotterFoundation()" ${spotterState.setupKarts.some(Boolean)?'':'disabled'}>LANCER LE SPOTTER</button></div></section>
  </div>
  <div class="spotter-step ${step==='live'?'active':''}" id="spotterLiveStep">
   ${spotterState.freeMode?`<div class="spotter-free-status"><strong>MODE AUTO — SUIVI ESTIMÉ</strong><span>Depuis ${new Date(Number(spotterState.freeStartedAt||Date.now())).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})} · ${spotterState.freePitIns} entrée(s) · ${spotterState.freePitOuts} sortie(s)</span></div>`:''}
   <div class="spotter-live-desktop-layout">
    <div class="spotter-desktop-queues">
     <section class="spotter-card spotter-queue-panel"><div class="spotter-card-body">${spotterRenderQueueColumns()}</div></section>
    </div>
    <aside class="spotter-desktop-sidebar">
     <section class="spotter-card spotter-incoming-panel"><div class="spotter-card-body"><div class="spotter-section-title"><span>Karts entrants</span><span class="spotter-badge">${spotterState.incoming.length}</span></div>${spotterState.incoming.length?`<div class="spotter-incoming-grid">${spotterState.incoming.map(spotterIncomingCard).join('')}</div>`:'<div class="spotter-empty">Aucun kart entrant à valider.</div>'}</div></section>
     <section class="spotter-card spotter-maintenance" data-spotter-drop-zone="maintenance"><div class="spotter-card-body"><div class="spotter-section-title"><span>🔧 Maintenance</span><span>${spotterState.maintenance.length}</span></div>${spotterState.maintenance.length?`<div class="spotter-maintenance-grid">${spotterState.maintenance.map(spotterMaintenanceCard).join('')}</div>`:'<div class="spotter-empty">Aucun kart en maintenance.</div>'}</div></section>
    </aside>
   </div>
   <div class="spotter-footer-actions"><button class="spotter-secondary" type="button" onclick="renderSpotterFoundation('queue')">MODIFIER LA FILE</button><button class="spotter-secondary" type="button" onclick="resetSpotterFoundation()">RÉINITIALISER</button></div>
  </div>
  <div class="spotter-step ${step==='recalibrate'?'active':''}" id="spotterRecalibrateStep">
   <section class="spotter-card spotter-recalibrate-card"><div class="spotter-card-body"><h2>RECALER LA FILE</h2><p>Le mode Auto a continué à suivre la file, mais les attributions restent estimées.</p><div class="spotter-recalibrate-summary"><span>${spotterState.freePitIns} PIT IN</span><span>${spotterState.freePitOuts} PIT OUT</span><span>${spotterFreeDuration()}</span></div></div></section>
   <section class="spotter-card spotter-queue-panel"><div class="spotter-card-body">${spotterRenderQueueColumns()}</div></section>
   <button class="spotter-primary spotter-confirm-recalibration" type="button" onclick="spotterConfirmRecalibration()">✓ VALIDER LE RECALAGE</button>
   <section class="spotter-card"><div class="spotter-card-body"><div class="spotter-section-title"><span>Karts entrants</span><span class="spotter-badge">${spotterState.incoming.length}</span></div>${spotterState.incoming.length?`<div class="spotter-incoming-grid">${spotterState.incoming.map(spotterIncomingCard).join('')}</div>`:'<div class="spotter-empty">Aucun kart entrant à valider.</div>'}</div></section>
   <section class="spotter-card spotter-maintenance" data-spotter-drop-zone="maintenance"><div class="spotter-card-body"><div class="spotter-section-title"><span>🔧 Maintenance</span><span>${spotterState.maintenance.length}</span></div>${spotterState.maintenance.length?`<div class="spotter-maintenance-grid">${spotterState.maintenance.map(spotterMaintenanceCard).join('')}</div>`:'<div class="spotter-empty">Aucun kart en maintenance.</div>'}</div></section>
  </div>
 </div>`;
}
function spotterDisplayName(value){return String(value??'—').replace(/^\s*Kart\s+/i,'').trim()||'—'}
function spotterOriginLabel(item){return item?.lastTeam&&item.lastTeam!=='Initialisation'?spotterDisplayName(item.lastTeam):spotterDisplayName(item?.apexKart||'—')}
function spotterSelectIncomingQueue(id,file){
 const count=Math.max(1,Math.min(3,Number(spotterState.mode)||1));
 spotterState.incomingQueueSelections[id]=Math.max(1,Math.min(count,Number(file)||1));
 saveSpotterFoundation();spotterRenderCurrent();
}
function spotterMaintenanceSelectionKey(kv){return `maintenance:${String(kv||'')}`}
function spotterQueueCard(item){
 const score=item.score==null?'—':item.score,confidence=item.confidence==null?'—':`${item.confidence}%`;
 if(item.status==='reserved')return `<div class="spotter-queue-card reserved ${item.estimated?'estimated':''}"><strong>${spotterEscape(spotterDisplayName(item.reservedTeam))}</strong><small>${spotterEscape(spotterOriginLabel(item))}</small><div class="spotter-card-stats"><span class="spotter-kv-value">${spotterEscape(item.kv)}</span><span class="spotter-score">Score : ${score}</span><span class="spotter-confidence">Conf. : ${confidence}</span></div><div class="spotter-pit-time" data-spotter-pit-start="${Number(item.pitInAt||Date.now())}">${spotterFormatDuration(Date.now()-Number(item.pitInAt||Date.now()))}</div></div>`;
 return `<div class="spotter-queue-card available spotter-draggable" data-spotter-queue-kv="${spotterEscape(item.kv)}"><button class="spotter-drag-handle" type="button" aria-label="Déplacer le kart" onpointerdown="spotterStartDrag(event,'${spotterEscapeJs(item.kv)}','queue')">⋮⋮</button><strong>${spotterEscape(spotterOriginLabel(item))}</strong><div class="spotter-card-stats"><span class="spotter-kv-value">${spotterEscape(item.kv)}</span><span class="spotter-score">Score : ${score}</span><span class="spotter-confidence">Conf. : ${confidence}</span></div></div>`;
}
function spotterFormatDuration(ms){const total=Math.max(0,Math.floor(Number(ms||0)/1000));const minutes=Math.floor(total/60);const seconds=total%60;return `${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}`}
function spotterTeamNumber(item){
 const driver=spotterFindDriver(item?.team||item?.name);
 const raw=item?.teamNumber??item?.team_number??item?.number??item?.num??driver?.teamNumber??driver?.team_number??driver?.number??driver?.num??driver?.bib;
 if(raw!==undefined&&raw!==null&&String(raw).trim())return String(raw).trim();
 const match=String(item?.team||item?.name||'').trim().match(/^(?:TEAM|ÉQUIPE)?\s*#?([0-9]{1,4})\b/i);
 return match?match[1]:'—';
}
function updateSpotterLiveTimers(){document.querySelectorAll('[data-spotter-pit-start]').forEach(node=>{node.textContent=spotterFormatDuration(Date.now()-Number(node.dataset.spotterPitStart||Date.now()))})}
function spotterIncomingCard(item){
 const selected=Number(spotterState.incomingQueueSelections[item.id])||0;
 const count=Math.max(1,Math.min(3,Number(spotterState.mode)||1));
 const queueButtons=Array.from({length:count},(_,index)=>{
  const file=index+1;
  return `<button type="button" class="spotter-file-choice ${selected===file?'active':''}" onclick="spotterSelectIncomingQueue('${spotterEscapeJs(item.id)}',${file})" aria-pressed="${selected===file?'true':'false'}">${file}</button>`;
 }).join('');
 return `<div class="spotter-incoming-card">
  <div class="spotter-incoming-info">
   <span class="spotter-team-number">${spotterEscape(spotterTeamNumber(item))}</span>
   <strong>${spotterEscape(spotterDisplayName(item.name||item.team))}</strong>
   <span class="spotter-kv-value">${spotterEscape(item.returnedKv||'—')}</span>
   <span class="spotter-score">Score : ${item.score??'—'}</span>
   <div class="spotter-pit-time" data-spotter-pit-start="${Number(item.pitInAt||Date.now())}">${spotterFormatDuration(Date.now()-Number(item.pitInAt||Date.now()))}</div>
  </div>
  <div class="spotter-incoming-control">
   <div class="spotter-file-choices">${queueButtons}</div>
   <div class="spotter-incoming-buttons">
    <button type="button" class="spotter-validate ${selected?'ready':''}" onclick="spotterValidateIncoming('${spotterEscapeJs(item.id)}',false,{targetFile:${selected||'null'}})" ${selected?'':'disabled'}>VALIDER</button>
    <button type="button" class="spotter-maintenance-btn" onclick="spotterValidateIncoming('${spotterEscapeJs(item.id)}',true)" aria-label="Envoyer en maintenance" title="Maintenance">⚠</button>
   </div>
  </div>
 </div>`;
}
function spotterMaintenanceCard(item){
 const key=spotterMaintenanceSelectionKey(item.kv);
 const selected=Number(spotterState.incomingQueueSelections[key])||0;
 const count=Math.max(1,Math.min(3,Number(spotterState.mode)||1));
 const queueButtons=Array.from({length:count},(_,index)=>{
  const file=index+1;
  return `<button type="button" class="spotter-file-choice ${selected===file?'active':''}" onclick="spotterSelectIncomingQueue('${spotterEscapeJs(key)}',${file})" aria-pressed="${selected===file?'true':'false'}">${file}</button>`;
 }).join('');
 return `<div class="spotter-incoming-card spotter-maintenance-action-card">
  <div class="spotter-incoming-info">
   <strong>${spotterEscape(spotterOriginLabel(item))}</strong>
   <span class="spotter-kv-value">${spotterEscape(item.kv||'—')}</span>
   <span class="spotter-score">Score : ${item.score??'—'}</span>
   <div class="spotter-pit-time" data-spotter-pit-start="${Number(item.enteredAt||Date.now())}">${spotterFormatDuration(Date.now()-Number(item.enteredAt||Date.now()))}</div>
  </div>
  <div class="spotter-incoming-control">
   <div class="spotter-file-choices">${queueButtons}</div>
   <div class="spotter-incoming-buttons maintenance-return-buttons">
    <button type="button" class="spotter-validate ${selected?'ready':''}" onclick="spotterReinsertMaintenance('${spotterEscapeJs(item.kv)}',${selected||'null'})" ${selected?'':'disabled'}>VALIDER</button>
   </div>
  </div>
 </div>`;
}
function spotterEscapeJs(value){return String(value??'').replace(/\\/g,'\\\\').replace(/'/g,"\\'")}
function spotterEscape(value){return String(value??'').replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]))}
document.addEventListener('DOMContentLoaded',()=>{loadSpotterFoundation();spotterPullSharedState();setInterval(spotterPullSharedState,750);setInterval(updateSpotterLiveTimers,1000);setInterval(spotterMonitorApex,750);setInterval(()=>{if(spotterState.configured){spotterRefreshVelocityMetrics();spotterPushSharedState()}},2000)});
