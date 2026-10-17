/* Velocity V7.2.1787 — Option Pas de Quick Change */
const SPOTTER_STORAGE_KEY=velocityWorkspaceStorageKey('velocity_spotter_v7_foundation');
function spotterResolveAppRelease(){
 const explicit=String(window.VELOCITY_APP_VERSION||'').trim();
 if(explicit)return explicit;
 // Secours : le template versionne aussi spotter.js avec ?v=<release>.
 // Cela évite tout numéro de version Spotter codé en dur dans ce fichier.
 try{
  const script=[...document.scripts].find(node=>String(node.src||'').includes('/static/js/spotter/spotter.js'));
  const version=script?new URL(script.src,window.location.href).searchParams.get('v'):'';
  if(version)return String(version).trim();
 }catch(_){ }
 return '';
}
const SPOTTER_APP_RELEASE=spotterResolveAppRelease();
if(!SPOTTER_APP_RELEASE)console.warn('[Spotter] Version Velocity introuvable : synchronisation serveur suspendue jusqu’au prochain chargement complet.');
const spotterState={
 version:6,mode:1,setupKarts:['X'],setupQueueFiles:[1],queue:[],maintenance:[],incoming:[],configured:false,
 assignments:{},movementLog:[],nextKvNumber:1,lastDriverStatus:{},monitorPrimed:false,
 freeMode:false,freeStartedAt:null,freePitIns:0,freePitOuts:0,freeNeedsRecalibration:false,recalibrating:false,autoNextFile:1,incomingQueueSelections:{},undoSnapshot:null,
 replacementRequest:null,
 kartTrackingEnabled:false,kartRegistry:{}
};
function spotterPadKv(index){return `KV${String(index+1).padStart(2,'0')}`}
function spotterKvFromNumber(number){return `KV${String(Math.max(1,Number(number)||1)).padStart(2,'0')}`}
function spotterKvNumber(kv){const match=String(kv||'').match(/(\d+)/);return match?Number(match[1]):0}
function spotterCardId(prefix='card'){return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`}
function spotterDefaultKartName(index){
 const sequence=['X','Y','Z'];
 if(index<sequence.length)return sequence[index];
 let n=index-sequence.length,label='';
 do{label=String.fromCharCode(65+(n%26))+label;n=Math.floor(n/26)-1}while(n>=0);
 return label;
}
function spotterEnsureSetupDefaults(){
 if(!Array.isArray(spotterState.setupKarts)||!spotterState.setupKarts.length)spotterState.setupKarts=['X'];
 spotterState.setupKarts=spotterState.setupKarts.map((value,index)=>String(value||spotterDefaultKartName(index)));
 if(!Array.isArray(spotterState.setupQueueFiles)||spotterState.setupQueueFiles.length!==spotterState.setupKarts.length){
  spotterState.setupQueueFiles=spotterState.setupKarts.map((_,index)=>(index%Math.max(1,Number(spotterState.mode)||1))+1);
 }
 if(!spotterState.assignments||typeof spotterState.assignments!=='object')spotterState.assignments={};
 if(!Array.isArray(spotterState.movementLog))spotterState.movementLog=[];
 if(!spotterState.lastDriverStatus||typeof spotterState.lastDriverStatus!=='object')spotterState.lastDriverStatus={};
 // Nettoie les cartes de test héritées de la Foundation V7.0.x. Elles n'avaient
 // ni équipe ni KV retourné exploitables par le moteur FIFO V7.1.
 if(!Array.isArray(spotterState.incoming))spotterState.incoming=[];
 spotterState.incoming=spotterState.incoming.filter(item=>item&&item.id&&item.team&&item.returnedKv&&item.source!=='dev');
 if(typeof spotterState.freeMode!=='boolean')spotterState.freeMode=false;
 if(!Number.isFinite(Number(spotterState.autoNextFile)))spotterState.autoNextFile=1;
 if(!Number.isFinite(Number(spotterState.freePitIns)))spotterState.freePitIns=0;
 if(!Number.isFinite(Number(spotterState.freePitOuts)))spotterState.freePitOuts=0;
 if(typeof spotterState.freeNeedsRecalibration!=='boolean')spotterState.freeNeedsRecalibration=false;
 if(typeof spotterState.recalibrating!=='boolean')spotterState.recalibrating=false;
 if(!spotterState.incomingQueueSelections||typeof spotterState.incomingQueueSelections!=='object')spotterState.incomingQueueSelections={};
 if(!('undoSnapshot' in spotterState))spotterState.undoSnapshot=null;
 if(!('replacementRequest' in spotterState))spotterState.replacementRequest=null;
 if(typeof spotterState.kartTrackingEnabled!=='boolean')spotterState.kartTrackingEnabled=false;
 if(!spotterState.kartRegistry||typeof spotterState.kartRegistry!=='object'||Array.isArray(spotterState.kartRegistry))spotterState.kartRegistry={};
 spotterState.mode=Math.max(1,Math.min(3,Number(spotterState.mode)||1));
 [...(spotterState.queue||[]),...(spotterState.maintenance||[])].forEach((item,index)=>{if(!item)return;if(!item.cardId)item.cardId=spotterCardId('queue');if(!Number.isFinite(Number(item.queueFile)))item.queueFile=(index%spotterState.mode)+1;item.queueFile=Math.max(1,Math.min(spotterState.mode,Number(item.queueFile)||1));});
 Object.values(spotterState.assignments||{}).forEach(item=>{if(item&&!item.cardId)item.cardId=spotterCardId('track')});
 spotterState.version=6;
 const all=[...(spotterState.queue||[]),...(spotterState.maintenance||[]),...Object.values(spotterState.assignments||{})];
 const max=all.reduce((value,item)=>Math.max(value,spotterKvNumber(item?.kv)),0);
 spotterState.nextKvNumber=Math.max(Number(spotterState.nextKvNumber)||1,max+1);
}

const SPOTTER_CLIENT_STORAGE_KEY=velocityWorkspaceStorageKey('velocity_spotter_client_id');
const SPOTTER_CLIENT_ID=sessionStorage.getItem(SPOTTER_CLIENT_STORAGE_KEY)||`spotter-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
sessionStorage.setItem(SPOTTER_CLIENT_STORAGE_KEY,SPOTTER_CLIENT_ID);
let spotterApplyingRemote=false;
let spotterLastRemoteUpdate=0;
let spotterServerRevision=0;
let spotterUiStep=null;
let spotterSessionOpened=false;
let spotterPushInFlight=false;
let spotterPushQueued=false;
let spotterLocalMutationAt=0;
let spotterDeferredRemote=null;
let spotterWorkspaceStatus="Connexion en cours";
let spotterLastSyncError="";
let spotterConfirmedSnapshot=null;
let spotterMonitorLeaseOwner=false;
let spotterMonitorLeaseUntil=0;
let spotterLastMonitorLeaseWorkspace='';
let spotterSyncLastReadAt=0;
let spotterSyncLastWriteAt=0;
let spotterRetryDelayMs=0;
let spotterSetupDraft=null;
let spotterSetupOrigin='spotter';
let spotterSetupRequested=false;

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
  recalibrating:Boolean(spotterState.recalibrating),
  autoNextFile:Number(spotterState.autoNextFile)||1,
  nextKvNumber:Number(spotterState.nextKvNumber)||1,
  kartTrackingEnabled:Boolean(spotterState.kartTrackingEnabled),
  kartRegistry:spotterClone(spotterState.kartRegistry||{})
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
 spotterScheduleRegistryPush();
 spotterRenderCurrent();
}

function spotterUiIsInteractive(){
 return Boolean(
  spotterDrag?.active||
  spotterDrag?.timer||
  spotterState.replacementRequest||
  spotterSetupDraft||
  ['mode','queue','addkart'].includes(String(spotterUiStep||''))
 );
}
function spotterRemoteMutationAt(remote){
 return Number(remote?.mutation_at_ms)||Number(remote?.updated_at_ms)||0;
}
function spotterMergeProtectedMaintenance(remoteMaintenance){
 const remote=Array.isArray(remoteMaintenance)?spotterClone(remoteMaintenance):[];
 const recentReinserted=new Map(
  (spotterState.queue||[])
   .filter(item=>item?.cardId&&Number(item?.reinsertedAt)>0&&Date.now()-Number(item.reinsertedAt)<10000)
   .map(item=>[String(item.cardId),item])
 );
 return remote.filter(item=>!recentReinserted.has(String(item?.cardId||'')));
}
// Les validations locales restent protégées contre les snapshots Render retardés.
const SPOTTER_ACK_KEY=velocityWorkspaceStorageKey('velocity_spotter_acknowledged_v1803');
const spotterAcknowledgedIncoming=new Map();
try{for(const entry of JSON.parse(localStorage.getItem(SPOTTER_ACK_KEY)||'[]')){
 if(entry?.id&&entry?.record&&Date.now()-Number(entry.record.at)<43200000)spotterAcknowledgedIncoming.set(entry.id,entry.record)
}}catch(_){}
function spotterPersistAcknowledged(){localStorage.setItem(SPOTTER_ACK_KEY,JSON.stringify([...spotterAcknowledgedIncoming].slice(-300)))}
function spotterRememberAcknowledged(item){
 if(!item?.id)return;
 spotterAcknowledgedIncoming.set(String(item.id),{team:String(item.team||''),at:Date.now()});
 for(const [id,record] of spotterAcknowledgedIncoming)if(Date.now()-record.at>43200000)spotterAcknowledgedIncoming.delete(id);
 spotterPersistAcknowledged();
}
function spotterMergeProtectedIncoming(remoteIncoming,remoteSnapshot=null){
 const acknowledgements=[...spotterAcknowledgedIncoming.values()];
 const acknowledged=item=>spotterAcknowledgedIncoming.has(String(item?.id||''))||acknowledgements.some(record=>record.team===String(item?.team||''));
 const remote=(Array.isArray(remoteIncoming)?spotterClone(remoteIncoming):[]).filter(item=>!acknowledged(item));
 const ids=new Set(remote.map(item=>String(item?.id||'')));
 // A validation on another device moves the returned kart into the queue or
 // maintenance. Such an incoming kart must never be resurrected locally.
 const validatedReturns=new Set([...(remoteSnapshot?.queue||[]),...(remoteSnapshot?.maintenance||[])].map(item=>String(item?.cardId||'')));
 const recentValidations=new Set((remoteSnapshot?.movement_log||[])
  .filter(entry=>['validate','validate_maintenance'].includes(String(entry?.action||entry?.type||'')))
  .map(entry=>String(entry?.returnedKv||'')));
 const protectedLocal=(spotterState.incoming||[]).filter(item=>{
  if(!item||ids.has(String(item.id||''))||acknowledged(item))return false;
  // Developer entries must obey the authoritative snapshot too. Previously
  // they were retained indefinitely, causing the mobile/desktop double card.
  if(item.source==='dev')return false;
  if(validatedReturns.has(String(item.returnedCardId||'')))return false;
  if(recentValidations.has(String(item.returnedKv||'')))return false;
  const age=Date.now()-Number(item.pitInAt||0);
  return age>=0&&age<5000;
 });
 return [...remote,...spotterClone(protectedLocal)];
}
function spotterApplyRemoteSnapshot(remote,{force=false}={}){
 if(!remote||typeof remote!=='object'||!Object.keys(remote).length)return;
 const wasConfigured=Boolean(spotterState.configured);
 // A release number is NOT a data schema version. Old V1804-V1807 snapshots
 // have compatible fields and must migrate without a destructive reset.
 if(!Array.isArray(remote.queue)||!Array.isArray(remote.incoming)||!Array.isArray(remote.maintenance)){
  spotterLastSyncError='État serveur incompatible (schéma)';spotterUpdateSyncBadge();return;
 }
 const currentCircuit=String(spotterLiveState()?.circuit_id||spotterLiveState()?.selected_circuit||'');
 if(remote.circuit_id&&currentCircuit&&String(remote.circuit_id)!==currentCircuit){
  spotterLastSyncError=`Circuit distant différent : ${remote.circuit_id}`;
  spotterUpdateSyncBadge();return;
 }
 const updated=Number(remote.updated_at_ms)||0;
 // Server revision is authoritative; timestamps from different devices are not.
 const remoteRevision=Number(remote.revision)||0;
 if(!force&&remoteRevision<=spotterServerRevision)return;
 const remoteMutation=spotterRemoteMutationAt(remote);
 // A reset is an authoritative state transition, not a regular queue merge.
 const remoteReset=remote.configured===false && Array.isArray(remote.queue) && remote.queue.length===0 && Array.isArray(remote.incoming) && remote.incoming.length===0;
 // Once the pending local write is finished, a newer server revision wins.
 // Comparing timestamps from two different devices can permanently block sync.
 // A local unsent action must finish its compare-and-swap before applying a
 // competing server revision. Conflict handling then restores the winner.
 if(!force&&(spotterPushInFlight||spotterPushQueued))return;
 spotterLastRemoteUpdate=updated;
 spotterServerRevision=Number(remote.revision)||0;
 spotterApplyingRemote=true;
 try{
  if(Number.isFinite(Number(remote.queue_mode)))spotterState.mode=Math.max(1,Math.min(3,Number(remote.queue_mode)));
  if(Array.isArray(remote.setup_karts)&&remote.setup_karts.length)spotterState.setupKarts=remote.setup_karts.map(value=>String(value||''));
  if(Array.isArray(remote.setup_queue_files)&&remote.setup_queue_files.length)spotterState.setupQueueFiles=remote.setup_queue_files.map(value=>Math.max(1,Math.min(3,Number(value)||1)));
  if(remoteReset){
   // Emptying a queue must not keep locally protected cards or incoming events.
   spotterState.queue=[];spotterState.maintenance=[];spotterState.incoming=[];
   spotterState.incomingQueueSelections={};spotterState.lastDriverStatus={};
   spotterState.monitorPrimed=false;spotterState.replacementRequest=null;
   spotterState.undoSnapshot=null;spotterState.kartRegistry={};
   spotterDeferredRemote=null;spotterSetupDraft=null;spotterSetupRequested=false;
   spotterAcknowledgedIncoming.clear();spotterPersistAcknowledged();
   clearTimeout(spotterSyncTimer);spotterPushQueued=false;
   spotterLocalMutationAt=0;
  }
  if(Array.isArray(remote.queue)&&!remoteReset){
   spotterState.queue=spotterClone(remote.queue);
  }
  if(Array.isArray(remote.maintenance)&&!remoteReset)spotterState.maintenance=spotterClone(remote.maintenance);
  if(Array.isArray(remote.incoming)&&!remoteReset)spotterState.incoming=spotterClone(remote.incoming);
  if(remote.assignments&&typeof remote.assignments==='object')spotterState.assignments=spotterClone(remote.assignments);
  if(Array.isArray(remote.movement_log))spotterState.movementLog=spotterClone(remote.movement_log);
  // Apex monitoring and KV allocator are operational shared state, never client-only.
  if(remote.last_driver_status&&typeof remote.last_driver_status==='object')spotterState.lastDriverStatus=spotterClone(remote.last_driver_status);
  if(typeof remote.monitor_primed==='boolean')spotterState.monitorPrimed=remote.monitor_primed;
  if(Number.isFinite(Number(remote.next_kv_number))&&Number(remote.next_kv_number)>0)
   spotterState.nextKvNumber=Math.max(Number(remote.next_kv_number),spotterMaxSharedKvNumber(remote)+1);
  if(remote.incoming_queue_selections&&typeof remote.incoming_queue_selections==='object')spotterState.incomingQueueSelections=spotterClone(remote.incoming_queue_selections);
  if(typeof remote.kart_tracking_enabled==='boolean')spotterState.kartTrackingEnabled=remote.kart_tracking_enabled;
  spotterState.configured=Boolean(remote.configured);
  spotterState.freeMode=remote.mode==='auto';
  spotterState.recalibrating=Boolean(remote.recalibrating);
  spotterState.freeStartedAt=remote.free_started_at||null;
  spotterState.freePitIns=Number(remote.pit_ins)||0;
  spotterState.freePitOuts=Number(remote.pit_outs)||0;
  spotterState.autoNextFile=Math.max(1,Math.min(spotterState.mode,Number(remote.auto_next_file)||1));
  spotterConfirmedSnapshot=spotterClone(remote);
  spotterPublishSharedState(remote);
  spotterLastSyncError='';spotterUpdateSyncBadge();
  localStorage.setItem(SPOTTER_STORAGE_KEY,JSON.stringify({version:6,appRelease:SPOTTER_APP_RELEASE,savedAt:new Date().toISOString(),state:spotterState}));
  if(document.body.classList.contains('current-spotter')&&(remoteReset||!(spotterDrag?.active||spotterSetupDraft))){
   // Un snapshot distant peut rafraîchir le LIVE, mais ne remplace jamais
   // un menu de configuration / ajout / Quick Change en cours.
   if(remoteReset){spotterUiStep='mode';renderSpotterFoundation('mode')}
   else if(!wasConfigured&&spotterState.configured)spotterRenderCurrent();
   else if(spotterUiStep==='live'||spotterUiStep==='recalibrate')spotterRenderCurrent();
  }
 }finally{spotterApplyingRemote=false}
}
async function spotterPullSharedState({force=false}={}){
 try{
  const response=await fetch('/api/spotter-state',{cache:'no-store',headers:{...((typeof velocityDeviceHeaders==='function')?velocityDeviceHeaders():{})}});
  if(!response.ok){spotterLastSyncError=`Lecture serveur HTTP ${response.status}`;spotterUpdateSyncBadge();return false;}
  const payload=await response.json();
  const previousWorkspace=spotterWorkspaceStatus;
  spotterWorkspaceStatus=String(payload?.workspace_id||'INCONNU');
  if(previousWorkspace!==spotterWorkspaceStatus){
   spotterMonitorLeaseOwner=false;spotterMonitorLeaseUntil=0;
   if(previousWorkspace!=='Connexion en cours'&&previousWorkspace!=='INCONNU'){
    // Never carry queues and revision numbers into a different workspace.
    spotterServerRevision=0;spotterConfirmedSnapshot=null;
    spotterState.queue=[];spotterState.maintenance=[];spotterState.incoming=[];
    spotterState.assignments={};spotterState.configured=false;
    spotterState.nextKvNumber=1;spotterState.lastDriverStatus={};spotterState.monitorPrimed=false;
    spotterPushQueued=false;clearTimeout(spotterSyncTimer);
   }
  }
  spotterLastSyncError='';
  spotterApplyRemoteSnapshot(payload?.spotter,{force});
  if(payload?.storage_backend&&payload.storage_backend!=='postgres')spotterLastSyncError='Stockage local : '+payload.storage_backend;
  spotterSyncLastReadAt=Date.now();
  spotterUpdateSyncBadge();
  return true;
 }catch(error){spotterLastSyncError='Serveur indisponible';spotterUpdateSyncBadge();console.warn('[Spotter] Lecture de l’état partagé impossible',error);return false}
}

function loadSpotterFoundation(){
 try{
  const saved=JSON.parse(localStorage.getItem(SPOTTER_STORAGE_KEY)||'null');
  // Migration V7.1.2 : les sauvegardes V7.1.1 et antérieures peuvent contenir
  // des cartes rouges et événements de test. On repart une seule fois du menu
  // de configuration, puis les sessions V7.1.2 sont conservées normalement.
  if(saved?.version>=6&&saved?.state){
   // V7.2.1784 : une mise à jour Velocity ne doit jamais effacer une course
   // Spotter en cours. On migre l'état local vers la release courante puis on
   // laisse les protections circuit/session décider d'une éventuelle remise à zéro.
   Object.assign(spotterState,saved.state);
  }else if(saved){
   // Seules les très anciennes sauvegardes au format incompatible sont purgées.
   localStorage.removeItem(SPOTTER_STORAGE_KEY);
  }
 }catch(_){localStorage.removeItem(SPOTTER_STORAGE_KEY)}
 spotterEnsureSetupDefaults();
 spotterPublishSharedState();
 localStorage.setItem(SPOTTER_STORAGE_KEY,JSON.stringify({version:6,appRelease:SPOTTER_APP_RELEASE,savedAt:new Date().toISOString(),state:spotterState}));
 renderSpotterFoundation();
}
let spotterSyncTimer=null;
function spotterSharedSnapshot(){
 const clone=value=>JSON.parse(JSON.stringify(value??null));
 return {
  configured:Boolean(spotterState.configured),app_release:SPOTTER_APP_RELEASE,
  client_id:SPOTTER_CLIENT_ID,mutation_at_ms:Number(spotterLocalMutationAt)||0,queue_mode:Number(spotterState.mode)||1,setup_karts:clone(spotterState.setupKarts||[]),setup_queue_files:clone(spotterState.setupQueueFiles||[]),
  mode:spotterState.recalibrating?'recalibrating':(spotterState.freeMode?'auto':'live'),
  queue:clone(spotterState.queue||[]),maintenance:clone(spotterState.maintenance||[]),incoming:clone(spotterState.incoming||[]),
  assignments:clone(spotterState.assignments||{}),movement_log:clone((spotterState.movementLog||[]).slice(0,40)),incoming_queue_selections:clone(spotterState.incomingQueueSelections||{}),
  kart_tracking_enabled:Boolean(spotterState.kartTrackingEnabled),
  free_started_at:spotterState.freeStartedAt||null,pit_ins:Number(spotterState.freePitIns)||0,pit_outs:Number(spotterState.freePitOuts)||0,recalibrating:Boolean(spotterState.recalibrating),auto_next_file:Number(spotterState.autoNextFile)||1,
  next_kv_number:Number(spotterState.nextKvNumber)||1,last_driver_status:clone(spotterState.lastDriverStatus||{}),monitor_primed:Boolean(spotterState.monitorPrimed),
  circuit_id:String(spotterLiveState()?.circuit_id||spotterLiveState()?.selected_circuit||'')
 };
}
function spotterUpdateSyncBadge(){
 const id=String(spotterWorkspaceStatus||'INCONNU');
 const badge=document.getElementById('spotter-sync-diagnostic');
 const line=`ESPACE ${id.slice(0,14)} · R${spotterServerRevision}${spotterLastSyncError?' · '+spotterLastSyncError:''}`;
 if(badge){badge.textContent=line;badge.style.color=spotterLastSyncError?'#ff7777':'#8cdbb4';badge.title=`Espace serveur : ${id}`}
 // Mobile: a fixed-height concise diagnostic, visible even when desktop header
 // is hidden by portrait CSS, without covering any Kart/Quick Change buttons.
 let mobile=document.getElementById('spotter-sync-mobile');
 if(!mobile){const root=document.getElementById('spotterApp');if(root){mobile=document.createElement('div');mobile.id='spotter-sync-mobile';mobile.style.cssText='padding:3px 8px;font:600 10px sans-serif;color:#8cdbb4;text-align:center;white-space:normal;overflow-wrap:anywhere';root.prepend(mobile)}}
 if(mobile){mobile.textContent=line;mobile.style.color=spotterLastSyncError?'#ff7777':'#8cdbb4'}
}
function spotterPublishSharedState(snapshot=null){
 const published=spotterClone(snapshot||spotterSharedSnapshot());
 if(!published||typeof published!=='object')return;
 if(!published.app_release)published.app_release=SPOTTER_APP_RELEASE;
 if(!published.client_id)published.client_id=SPOTTER_CLIENT_ID;
 if(!published.updated_at_ms)published.updated_at_ms=spotterLastRemoteUpdate||Date.now();
 if(!published.circuit_id)published.circuit_id=String(spotterLiveState()?.circuit_id||spotterLiveState()?.selected_circuit||'');
 window.velocitySharedSpotterState=published;
 try{window.dispatchEvent(new CustomEvent('velocity:spotter-state',{detail:spotterClone(published)}))}catch(_){}
}
function spotterSame(a,b){return JSON.stringify(a??null)===JSON.stringify(b??null)}
function spotterMaxSharedKvNumber(snapshot){
 const objects=[...(snapshot?.queue||[]),...(snapshot?.maintenance||[]),...(snapshot?.incoming||[]),...Object.values(snapshot?.assignments||{})];
 return objects.reduce((max,item)=>Math.max(max,spotterKvNumber(item?.kv),spotterKvNumber(item?.returnedKv)),0);
}
function spotterRebaseCards(baseList,localList,remoteList,key){
 const b=Array.isArray(baseList)?baseList:[],l=Array.isArray(localList)?localList:[],r=Array.isArray(remoteList)?remoteList:[];
 const id=item=>String(item?.[key]||'');
 const baseMap=new Map(b.map(item=>[id(item),item]));
 const localMap=new Map(l.map(item=>[id(item),item]));
 const next=r.map(item=>spotterClone(item));
 const indexOf=(value)=>next.findIndex(item=>id(item)===value);
 for(const [keyId,oldItem] of baseMap){
  if(!keyId||localMap.has(keyId))continue;
  const position=indexOf(keyId);
  if(position>=0)next.splice(position,1); // local validation explicitly removed it
 }
 for(const item of l){
  const keyId=id(item);if(!keyId)continue;
  const old=baseMap.get(keyId);
  if(old&&spotterSame(old,item))continue;
  const position=indexOf(keyId);
  if(position<0){if(!old)next.push(spotterClone(item));continue}
  if(!old||spotterSame(next[position],old))next[position]=spotterClone(item);
 }
 return next;
}
function spotterRebaseFields(base,local,remote){
 // Reset is authoritative and must not resurrect old cards or assignments.
 if(remote?.configured===false&&Array.isArray(remote?.queue)&&!remote.queue.length&&
    Array.isArray(remote?.incoming)&&!remote.incoming.length&&base?.configured){
  return null;
 }
 if(local?.configured===false&&base?.configured){
  // Local explicit reset wins when safely retried on top of the latest revision.
  return {...spotterClone(local),app_release:SPOTTER_APP_RELEASE};
 }
 const out=spotterClone(remote||{});
 for(const [field,key] of [['queue','cardId'],['maintenance','cardId'],['incoming','id']]){
  if(!spotterSame(base?.[field],local?.[field]))
   out[field]=spotterRebaseCards(base?.[field],local?.[field],remote?.[field],key);
 }
 for(const field of ['assignments','incoming_queue_selections','last_driver_status']){
  const old=base?.[field]||{}, edited=local?.[field]||{}, server=remote?.[field]||{};
  if(spotterSame(old,edited))continue;
  const next=spotterClone(server);
  for(const key of new Set([...Object.keys(old),...Object.keys(edited)])){
   if(spotterSame(old[key],edited[key]))continue;
   if(spotterSame(old[key],server[key])){
    if(Object.prototype.hasOwnProperty.call(edited,key))next[key]=spotterClone(edited[key]);
    else delete next[key];
   }
  }
  out[field]=next;
 }
 const ignore=new Set(['queue','incoming','maintenance','assignments','incoming_queue_selections','last_driver_status','movement_log','revision','updated_at_ms','client_id','app_release','circuit_id','mutation_at_ms','next_kv_number']);
 for(const key of Object.keys(local||{})){
  if(ignore.has(key))continue;
  if(!spotterSame(base?.[key],local?.[key])&&spotterSame(base?.[key],remote?.[key]))out[key]=spotterClone(local[key]);
 }
 if(!spotterSame(base?.movement_log,local?.movement_log)){
  const previous=new Set((base?.movement_log||[]).map(x=>JSON.stringify(x)));
  const exists=new Set((out.movement_log||[]).map(x=>JSON.stringify(x)));
  const records=spotterClone(out.movement_log||[]);
  for(const item of (local?.movement_log||[])){
   const encoded=JSON.stringify(item);
   if(!previous.has(encoded)&&!exists.has(encoded)){records.unshift(spotterClone(item));exists.add(encoded)}
  }
  out.movement_log=records.slice(0,40);
 }
 out.next_kv_number=Math.max(Number(remote?.next_kv_number)||1,Number(local?.next_kv_number)||1,spotterMaxSharedKvNumber(out)+1);
 out.client_id=SPOTTER_CLIENT_ID;out.app_release=SPOTTER_APP_RELEASE;out.mutation_at_ms=Date.now();
 return out;
}
function spotterApplyRebasedSnapshot(value){
 spotterApplyingRemote=true;
 try{
  spotterState.queue=spotterClone(value.queue||[]);
  spotterState.maintenance=spotterClone(value.maintenance||[]);
  spotterState.incoming=spotterClone(value.incoming||[]);
  spotterState.assignments=spotterClone(value.assignments||{});
  spotterState.movementLog=spotterClone(value.movement_log||[]);
  spotterState.incomingQueueSelections=spotterClone(value.incoming_queue_selections||{});
  spotterState.nextKvNumber=Number(value.next_kv_number)||spotterState.nextKvNumber;
  spotterState.lastDriverStatus=spotterClone(value.last_driver_status||{});
  spotterState.monitorPrimed=Boolean(value.monitor_primed);
  spotterState.configured=Boolean(value.configured);
  spotterState.mode=Math.max(1,Math.min(3,Number(value.queue_mode)||1));
  if(Array.isArray(value.setup_karts))spotterState.setupKarts=spotterClone(value.setup_karts);
  if(Array.isArray(value.setup_queue_files))spotterState.setupQueueFiles=spotterClone(value.setup_queue_files);
  if(typeof value.kart_tracking_enabled==='boolean')spotterState.kartTrackingEnabled=value.kart_tracking_enabled;
  spotterState.freeMode=value.mode==='auto';
  spotterState.recalibrating=Boolean(value.recalibrating);
  spotterState.freeStartedAt=value.free_started_at||null;
  spotterState.freePitIns=Number(value.pit_ins)||0;
  spotterState.freePitOuts=Number(value.pit_outs)||0;
  spotterState.autoNextFile=Math.max(1,Math.min(spotterState.mode,Number(value.auto_next_file)||1));
  spotterPublishSharedState(value);
  if(document.body.classList.contains('current-spotter')){
   if(!spotterState.configured){spotterUiStep='mode';renderSpotterFoundation('mode')}
   else if(spotterUiStep==='live'||spotterUiStep==='recalibrate')spotterRenderCurrent();
  }
 }finally{spotterApplyingRemote=false}
}
async function spotterPushSharedState(){
 if(spotterPushInFlight){spotterPushQueued=true;return}
 spotterPushInFlight=true;spotterPushQueued=false;
 try{
  let edited=spotterSharedSnapshot();
  let confirmed=spotterConfirmedSnapshot?spotterClone(spotterConfirmedSnapshot):null;
  let revision=spotterServerRevision;
  for(let attempt=0;attempt<4;attempt++){
   const response=await fetch('/api/spotter-state',{method:'POST',headers:{'Content-Type':'application/json',...((typeof velocityDeviceHeaders==='function')?velocityDeviceHeaders():{})},body:JSON.stringify({spotter:edited,base_revision:revision}),cache:'no-store'});
   const payload=await response.json().catch(()=>({}));
   if(response.ok){
    spotterLastRemoteUpdate=Number(payload?.updated_at_ms)||Date.now();
    spotterServerRevision=Number(payload?.revision)||revision+1;
    spotterWorkspaceStatus=String(payload?.workspace_id||spotterWorkspaceStatus);
    spotterSyncLastWriteAt=Date.now();spotterLastSyncError='';
    spotterConfirmedSnapshot=spotterClone({...edited,revision:spotterServerRevision,updated_at_ms:spotterLastRemoteUpdate});
    spotterPublishSharedState(spotterConfirmedSnapshot);spotterUpdateSyncBadge();
    return;
   }
   if(response.status!==409||!payload?.spotter||!Array.isArray(payload.spotter.queue)){
    spotterLastSyncError=payload?.expected?'Version obsolète : recharger l’application':`Écriture HTTP ${response.status}`;
    spotterUpdateSyncBadge();console.warn('[Spotter] écriture refusée',payload);
    if(response.status>=500){spotterPushQueued=true;spotterRetryDelayMs=2500}
    return;
   }
   const remote=payload.spotter;
   if(!confirmed&&Number(remote.revision)>0){
    spotterApplyRemoteSnapshot(remote,{force:true});
    spotterLastSyncError='Premier chargement effectué après conflit : recommencer l’action';
    spotterUpdateSyncBadge();return;
   }
   const merged=spotterRebaseFields(confirmed||{},edited,remote);
   if(!merged){
    spotterApplyRemoteSnapshot(remote,{force:true});
    spotterLastSyncError='Réinitialisation distante prioritaire';spotterUpdateSyncBadge();return;
   }
   revision=Number(remote.revision)||0;
   spotterServerRevision=revision;
   spotterConfirmedSnapshot=spotterClone(remote);
   confirmed=spotterClone(remote);
   edited=merged;
   spotterApplyRebasedSnapshot(merged);
   spotterLastSyncError='Conflit détecté : nouvelle tentative';spotterUpdateSyncBadge();
  }
  spotterLastSyncError='Conflit répété : nouvel essai dans 3s';spotterPushQueued=true;spotterRetryDelayMs=3000;spotterUpdateSyncBadge();
 }catch(error){
  spotterLastSyncError='Écriture impossible : reprise automatique';
  spotterPushQueued=true;spotterRetryDelayMs=2500;spotterUpdateSyncBadge();
  console.warn('[Spotter] Synchronisation impossible',error);
 }
 finally{
  spotterPushInFlight=false;
  if(spotterPushQueued)spotterScheduleSharedSync(spotterRetryDelayMs||120);
  spotterRetryDelayMs=0;
 }
}
function spotterScheduleSharedSync(delay=120){
 if(spotterApplyingRemote)return;
 spotterPushQueued=true;clearTimeout(spotterSyncTimer);
 spotterSyncTimer=setTimeout(()=>{spotterPushQueued=false;spotterPushSharedState()},Math.max(120,delay));
}

function saveSpotterFoundation(){
 spotterLocalMutationAt=Date.now();
 spotterPublishSharedState();
 localStorage.setItem(SPOTTER_STORAGE_KEY,JSON.stringify({version:6,appRelease:SPOTTER_APP_RELEASE,savedAt:new Date().toISOString(),state:spotterState}));
 spotterScheduleSharedSync();
}

let spotterAddKartDraft=null;
let spotterRegistryPushTimer=null;
// V1811: a KV belongs to a specific race. Never upload a legacy/local registry
// until the server has resolved the current race id.
const SPOTTER_RUN_STORAGE_KEY=velocityWorkspaceStorageKey('velocity_spotter_registry_run_v1811');
let spotterRegistryRunId=localStorage.getItem(SPOTTER_RUN_STORAGE_KEY)||'';
let spotterRegistryReady=false;
let spotterRegistryLoading=null;
let spotterRegistrySortMode='default';
function spotterRegistryBackupLocal(previousId){
 const content=spotterState.kartRegistry||{};
 if(!Object.keys(content).length)return;
 try{
  const key=velocityWorkspaceStorageKey('velocity_kv_unsorted_backup_'+Date.now());
  localStorage.setItem(key,JSON.stringify({previousRunId:previousId||'ancien registre non identifié',savedAt:new Date().toISOString(),registry:content}));
 }catch(error){console.warn('[Spotter] Sauvegarde locale KV impossible',error)}
}
async function spotterPullRegistry(){
 if(spotterRegistryLoading)return spotterRegistryLoading;
 spotterRegistryLoading=(async()=>{
  try{
   const response=await fetch('/api/spotter-registry',{cache:'no-store'});
   if(!response.ok)throw new Error('HTTP '+response.status);
   const payload=await response.json();
   if(!payload?.ok||!payload.run_id||!payload.registry||typeof payload.registry!=='object'||Array.isArray(payload.registry))throw new Error('Contexte course KV invalide');
   const remoteRun=String(payload.run_id);
   const newRun=spotterRegistryRunId!==remoteRun;
   if(newRun){
    // First migration from V1810 or a new race. Old data is NOT part of this run.
    spotterRegistryBackupLocal(spotterRegistryRunId);
    spotterState.kartRegistry={};
    spotterRegistryRunId=remoteRun;
    localStorage.setItem(SPOTTER_RUN_STORAGE_KEY,remoteRun);
    clearTimeout(spotterRegistryPushTimer);spotterRegistryPushTimer=null;
   }
   spotterRegistryReady=true;
   if(!spotterRegistryPushTimer){
    spotterState.kartRegistry=spotterClone(payload.registry);
    if(typeof window.velocityKartScoreHydrateRegistry==='function'){
     Object.entries(spotterState.kartRegistry).forEach(([kv,row])=>{if(row?.speed)window.velocityKartScoreHydrateRegistry(kv,row.speed)});
    }
    localStorage.setItem(SPOTTER_STORAGE_KEY,JSON.stringify({version:6,appRelease:SPOTTER_APP_RELEASE,savedAt:new Date().toISOString(),state:spotterState}));
    // Never seed a new race from yesterday's KV assignments: the same team
    // and Apex slot can use a different physical kart in another event.
    // A race may change while the table remains open.
    spotterRefreshKartRegistry(true);
   }
   return true;
  }catch(error){
   spotterRegistryReady=false;
   console.warn('[Spotter] Lecture du registre par course impossible',error);
   return false;
  }finally{spotterRegistryLoading=null}
 })();
 return spotterRegistryLoading;
}
async function spotterPushRegistry(){
 clearTimeout(spotterRegistryPushTimer);spotterRegistryPushTimer=null;
 if(!spotterRegistryReady||!spotterRegistryRunId)return;
 try{
  const response=await fetch('/api/spotter-registry',{
   method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({run_id:spotterRegistryRunId,registry:spotterState.kartRegistry||{}})
  });
  if(response.status===409){
   // An older browser must not repopulate the following race.
   spotterRegistryReady=false;
   await spotterPullRegistry();
   console.warn('[Spotter] Registre ancien refusé : contexte de course actualisé');
  }else if(!response.ok)console.warn('[Spotter] Registre KV refusé',response.status);
 }catch(error){console.warn('[Spotter] Synchronisation registre KV impossible',error)}
}
function spotterScheduleRegistryPush(){
 if(!spotterRegistryReady||!spotterRegistryRunId)return;
 clearTimeout(spotterRegistryPushTimer);
 spotterRegistryPushTimer=setTimeout(spotterPushRegistry,180);
}
function spotterValidScore(score){return score!==null&&score!==undefined&&String(score).trim()!==''&&Number.isFinite(Number(score))&&Number(score)>=0&&Number(score)<=100}
function spotterScoreTone(score){const value=spotterValidScore(score)?Number(score):NaN;return !Number.isFinite(value)?'unknown':value>=82?'high':value>=65?'mid':'low'}
function spotterRegistryEnsure(kv){if(!spotterRegistryReady)return null;const key=String(kv||'').trim();if(!key)return null;if(!spotterState.kartRegistry[key])spotterState.kartRegistry[key]={kv:key,history:[],trace:'active',createdAt:Date.now()};return spotterState.kartRegistry[key]}
function spotterRegistryHistoricalStoredLabel(team){
 const raw=String(team||'').trim();
 const driver=spotterDriverByKey(raw);
 const candidate=String((driver?spotterStableTeamLabel(driver,''):'')||spotterState.assignments?.[raw]?.teamLabel||'').trim();
 return candidate&&!/^apex:\d+$/.test(candidate)&&candidate!=='—'?candidate:null;
}
function spotterRegistryAppend(kv,team,score=null,{source='spotter'}={}){
 if(!spotterState.kartTrackingEnabled||!spotterRegistryReady)return;
 const row=spotterRegistryEnsure(kv);if(!row)return;
 row.trace='active';delete row.interruptedAt;
 const raw=String(team||'').trim();if(!raw||raw==='Initialisation')return;
 const teamLabel=spotterRegistryHistoricalStoredLabel(raw);
 const last=row.history[row.history.length-1];
 if(last&&last.team===raw){
  if(spotterValidScore(score))last.score=Math.round(Number(score));
  if(teamLabel)last.teamLabel=teamLabel;
  last.updatedAt=Date.now();spotterScheduleRegistryPush();return;
 }
 row.history.push({team:raw,teamLabel,score:spotterValidScore(score)?Math.round(Number(score)):null,at:Date.now(),source});
 row.history=row.history.slice(-80);spotterScheduleRegistryPush();
}
function spotterRegistryUpdateScore(kv,team,score){
 if(!spotterState.kartTrackingEnabled||!spotterRegistryReady||!spotterValidScore(score))return;
 const row=spotterRegistryEnsure(kv);if(!row)return;
 const raw=String(team||'');
 const last=[...(row.history||[])].reverse().find(entry=>entry.team===raw);
 if(last){
  last.score=Math.round(Number(score));
  const label=spotterRegistryHistoricalStoredLabel(raw);if(label)last.teamLabel=label;
  last.updatedAt=Date.now();spotterScheduleRegistryPush();
 }
}
// V7.2.1794 — pont Spotter / notes par machine physique.
// Jamais de déduction d'un KV à partir du numéro affiché par Apex.
function velocityKartIdentityForDriver(driver){
 const teamKey=spotterDriverKey(driver);
 // Radar / Analyzer can read the last confirmed shared Spotter snapshot when
 // the local card has not yet hydrated, without guessing from Apex kart number.
 const shared=window.velocitySharedSpotterState||{};
 const local=spotterState.kartTrackingEnabled&&spotterState.configured;
 const remote=Boolean(shared.kart_tracking_enabled&&shared.configured);
 const assignment=(local&&spotterState.assignments?.[teamKey])||(remote&&shared.assignments?.[teamKey]);
 if(!assignment?.kv||(!local&&!remote))return null;
 const registry=spotterState.kartRegistry?.[assignment.kv];
 const verified=assignment.status==='track'&&!assignment.pendingReplacementKv&&!assignment.estimated&&registry?.trace!=='interrupted';
 return {kv:String(assignment.kv),teamKey,verified};
}
window.velocityKartIdentityForDriver=velocityKartIdentityForDriver;
function velocityKartDisplayAssignment(kv){
 const team=Object.entries(spotterState.assignments||{}).find(([,item])=>item?.kv===kv&&item.status==='track');
 if(team)return {team:spotterStableTeamLabel(spotterFindDriver(team[0]),team[1].teamLabel||team[0]),status:'EN PISTE'};
 const queued=[...(spotterState.queue||[]),...(spotterState.maintenance||[])].find(item=>item?.kv===kv);
 return {team:queued?.lastTeam||'',status:queued?.status==='maintenance'?'MÉCANIQUE':'EN FILE'};
}
window.velocityKartDisplayAssignment=velocityKartDisplayAssignment;
function spotterRegistryUpdateSpeed(kv,speed){
 if(!spotterState.kartTrackingEnabled||!spotterRegistryReady||!kv)return;
 const row=spotterState.kartRegistry?.[String(kv)];
 if(!row||row.trace==='interrupted')return; // never derive a physical KV from an older course
 const previous=row.speed||{};
 row.speed={...speed};
 // Historique borné des évaluations par machine, persisté dans le registre Render.
 // Ne conserver un point que si une note/état change réellement, pour limiter les écritures.
 const fields=['potential','recent','confirmed','epoch'];
 if(fields.some(field=>String(previous[field]??'')!==String(speed[field]??''))){
  if(!Array.isArray(row.scoreHistory))row.scoreHistory=[];
  row.scoreHistory.push({at:Date.now(),potential:(speed.potential!==null&&speed.potential!==undefined&&Number.isFinite(Number(speed.potential)))?Number(speed.potential):null,recent:(speed.recent!==null&&speed.recent!==undefined&&Number.isFinite(Number(speed.recent)))?Number(speed.recent):null,confirmed:Boolean(speed.confirmed),epoch:String(speed.epoch||'')});
  row.scoreHistory=row.scoreHistory.slice(-1500);
 }
 spotterScheduleRegistryPush();
}
window.spotterRegistryUpdateSpeed=spotterRegistryUpdateSpeed;
function spotterRegistryClearSpeeds(){
 Object.values(spotterState.kartRegistry||{}).forEach(row=>{if(row)delete row.speed});
 // Le serveur efface aussi les scores de l'ancien epoch ; conserver le suivi des KV.
}
window.spotterRegistryClearSpeeds=spotterRegistryClearSpeeds;
function spotterRegistrySeedCurrent(){
 if(!spotterState.kartTrackingEnabled||!spotterRegistryReady)return;
 Object.entries(spotterState.assignments||{}).forEach(([team,item])=>{if(item?.kv)spotterRegistryAppend(item.kv,team,item.score,{source:'activation'})});
 [...(spotterState.queue||[]),...(spotterState.maintenance||[])].forEach(item=>{if(item?.kv)spotterRegistryEnsure(item.kv)});
 spotterScheduleRegistryPush();
}
async function spotterSetKartTracking(enabled){
 const next=Boolean(enabled);if(next===Boolean(spotterState.kartTrackingEnabled))return;
 if(next){if(!await spotterPullRegistry()){alert('Registre KV serveur indisponible : suivi non démarré pour éviter de mélanger les courses.');return;}spotterState.kartTrackingEnabled=true;spotterRegistrySeedCurrent();spotterLogMovement('kart_tracking_started')}
 else{spotterState.kartTrackingEnabled=false;Object.values(spotterState.kartRegistry||{}).forEach(row=>{if(row?.trace==='active'){row.trace='interrupted';row.interruptedAt=Date.now()}});spotterScheduleRegistryPush();spotterLogMovement('kart_tracking_stopped')}
 saveSpotterFoundation();await spotterOpenKartRegistry();
}
function spotterRegistryCounts(){const rows=Object.values(spotterState.kartRegistry||{});return {active:rows.filter(row=>row?.trace==='active').length,total:rows.length}}
// V7.2.1810 — Table compacte, tri et rafraîchissement sans perte du défilement global.
// La NOTE est une évaluation de vitesse ; CHRONO POT./RÉC. restent des durées, sans nouveau calcul.
function spotterRegistryShortTeam(value){
 const full=spotterDisplayName(value),letters=Array.from(full);
 return letters.length>30?letters.slice(0,29).join('')+'…':full;
}
function spotterRegistryFormatChrono(value){
 if(value===null||value===undefined||String(value).trim()===''||String(value).trim()==='—')return '—';
 const raw=String(value).trim().replace(/s$/i,'');
 if(/^\d+:\d{2}\.\d{3}$/.test(raw))return raw;
 if(!/^\d+(?:\.\d+)?$/.test(raw))return String(value);
 const numeric=Number(raw);
 if(!Number.isFinite(numeric)||numeric<=0)return '—';
 const millis=Math.round(numeric*1000);
 const min=Math.floor(millis/60000),sec=Math.floor(millis%60000/1000),ms=millis%1000;
 return `${min}:${String(sec).padStart(2,'0')}.${String(ms).padStart(3,'0')}`;
}
function spotterRegistryTrackSeconds(driver){
 // En piste = temps du RELAIS COURANT, jamais temps écoulé depuis le début de course.
 if(!driver||driver.status==='pit')return null;
 const raw=driver.track_timer??driver.on_track_timer??driver.on_track??null;
 if(raw===null||raw===undefined||String(raw).trim()==='')return null;
 if(typeof raw==='number')return Number.isFinite(raw)&&raw>=0?raw:null;
 const value=String(raw).trim();
 const sections=value.split(':');
 if(sections.some(part=>!/^\d+$/.test(part)))return null;
 if(sections.length===3)return Number(sections[0])*3600+Number(sections[1])*60+Number(sections[2]);
 // Apex affiche H:MM dans EN PISTE (0:47 = 47 minutes), pas MM:SS.
 if(sections.length===2)return Number(sections[0])*3600+Number(sections[1])*60;
 return sections.length===1?Number(sections[0]):null;
}
function spotterRegistryTrackLabel(seconds){
 if(!Number.isFinite(seconds)||seconds<0)return '—';
 const total=Math.floor(seconds),h=Math.floor(total/3600),m=Math.floor(total%3600/60),s=total%60;
 return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}
function spotterRegistryCurrent(kv){
 const assignment=Object.entries(spotterState.assignments||{}).find(([,a])=>a?.kv===kv&&a.status==='track'&&!a.pendingReplacementKv&&!a.estimated);
 if(!assignment)return {driver:null,team:'—',kart:'—',last:'—',seconds:null};
 const driver=spotterFindDriver(assignment[0]);
 return {driver,team:spotterStableTeamLabel(driver,assignment[1].teamLabel||assignment[0]),
  kart:String(driver?.apex||driver?.kart||assignment[1]?.apexKart||'—'),
  last:String(driver?.last||driver?.last_lap||'—'),seconds:spotterRegistryTrackSeconds(driver)};
}
function spotterRegistryHistoricalName(entry){
 const raw=String(entry?.team||'').trim();
 const saved=String(entry?.teamLabel||'').trim();
 if(saved&&!/^apex:\d+$/.test(saved))return saved;
 const driver=spotterDriverByKey(raw);
 const resolved=driver?spotterStableTeamLabel(driver,''):'';
 if(resolved&&resolved!=='—'&&!/^apex:\d+$/.test(resolved))return resolved;
 const assigned=spotterState.assignments?.[raw];
 const assignedName=String(assigned?.teamLabel||'').trim();
 if(assignedName&&!/^apex:\d+$/.test(assignedName))return assignedName;
 // Les anciens enregistrements sans correspondance restent identifiables, sans inventer de nom.
 return raw||'—';
}
function spotterRegistryRowsHtml(){
 const entries=Object.values(spotterState.kartRegistry||{});
 const rows=entries.map(row=>({row,current:spotterRegistryCurrent(row?.kv),note:spotterKartPotential(row?.kv)}));
 const byKv=(a,b)=>spotterKvNumber(a.row?.kv)-spotterKvNumber(b.row?.kv);
 if(spotterRegistrySortMode==='note')rows.sort((a,b)=>(b.note??-1)-(a.note??-1)||byKv(a,b));
 else if(spotterRegistrySortMode==='relay')rows.sort((a,b)=>(b.current.seconds??-1)-(a.current.seconds??-1)||byKv(a,b));
 else rows.sort(byKv);
 if(!rows.length)return '<div class="spotter-registry-empty-block">Aucun kart enregistré.</div>';
 const countHistory=Math.max(1,...rows.map(item=>Array.isArray(item.row.history)?item.row.history.length:0));
 const head=['KV','NOTE','KART','ÉQUIPE ACTUELLE','CHRONO POT.','CHRONO RÉC.','DERNIER','FIABILITÉ'];
 const heading=head.map((label,i)=>`<th scope="col" class="${i===3?'spotter-registry-current-column':''}">${label}</th>`).join('')+
  Array.from({length:countHistory},(_,i)=>`<th scope="col" class="spotter-registry-team-column">RELAIS ${i+1}</th>`).join('');
 const safe=value=>spotterEscape(String(value));
 const name=value=>`<span class="spotter-registry-name" title="${safe(spotterDisplayName(value))}">${safe(spotterRegistryShortTeam(value))}</span>`;
 const body=rows.map(({row,current,note:potential})=>{
  const {team,kart,last,seconds}=current;
  const speed=row.speed,valid=speed&&String(speed.epoch||'')===String(spotterLiveState()?.kart_scoring_epoch||'')&&Number.isFinite(speed.potential);
  const displayedPotential=spotterDisplayPotential(row.kv);
  const tone=potential===null?'unknown':potential>=98?'gold':potential>=90?'green':potential>=80?'orange':'red';
  const status=valid?(speed.confirmed?'CONFIRMÉ':'PROVISOIRE'):'—';
  const interrupted=row.trace==='interrupted';
  const currentTeam=`<td class="spotter-registry-current-column"><div class="spotter-registry-current-team">${name(team)}<span class="spotter-registry-track-time" title="Durée du relais en cours (Apex)">${safe(spotterRegistryTrackLabel(seconds))}</span></div></td>`;
  const note=`<td class="spotter-registry-note-cell"><span class="spotter-registry-rating ${tone}">${safe(displayedPotential)}</span></td>`;
  const base=`<td class="spotter-registry-kv">${safe(row.kv)}</td>${note}<td class="spotter-registry-kart">${safe(kart)}</td>${currentTeam}`+
   `<td>${safe(valid?spotterRegistryFormatChrono(speed.potential):'—')}</td>`+
   `<td>${safe(valid&&Number.isFinite(speed.recent)?spotterRegistryFormatChrono(speed.recent):'—')}</td>`+
   `<td>${safe(spotterRegistryFormatChrono(last))}</td><td class="spotter-registry-state">${safe(status)}${interrupted?'<span class="spotter-registry-trace">TRACE INTERROMPUE</span>':''}</td>`;
  const historyEntries=Array.isArray(row.history)?row.history:[];
  const history=historyEntries.map(entry=>{
   const score=entry?.score==null?'—':safe(entry.score);
   return `<td class="spotter-registry-team-column"><div class="spotter-registry-entry">${name(spotterRegistryHistoricalName(entry))}<em class="${spotterScoreTone(entry?.score)}">${score}</em></div></td>`;
  }).join('');
  const remaining=countHistory-historyEntries.length;
  const blank=remaining>0?`<td colspan="${remaining}" class="spotter-registry-blank">${!historyEntries.length?'Aucune affectation':''}</td>`:'';
  return `<tr class="spotter-registry-grid-row">${base}${history}${blank}</tr>`;
 }).join('');
 return `<table class="spotter-registry-grid"><thead><tr>${heading}</tr></thead><tbody>${body}</tbody></table>`;
}
function spotterSetKartRegistrySort(value){
 spotterRegistrySortMode=['default','note','relay'].includes(value)?value:'default';
 spotterRefreshKartRegistry({force:true});
}
function spotterRefreshKartRegistry({force=false}={}){
 const overlay=document.getElementById('spotterRegistryOverlay');
 const target=overlay?.querySelector('.spotter-registry-table');
 if(!target||!spotterState.kartTrackingEnabled)return;
 const next=spotterRegistryRowsHtml();
 if(!force&&target.dataset.lastHtml===next)return;
 const left=target.scrollLeft,top=target.scrollTop;
 target.innerHTML=next;target.dataset.lastHtml=next;
 target.scrollLeft=left;target.scrollTop=top;
 const count=spotterRegistryCounts();
 const label=overlay.querySelector('[data-spotter-registry-count]');
 if(label)label.textContent=`● SUIVI ACTIF · ${count.active}/${count.total} KV`;
}
function spotterRegistrySortControl(){
 const choices=[['default','Par défaut'],['note','Note'],['relay','Durée de relais']];
 return `<label class="spotter-registry-sort">Trier par <select aria-label="Trier le registre" onchange="spotterSetKartRegistrySort(this.value)">${choices.map(([id,label])=>`<option value="${id}" ${spotterRegistrySortMode===id?'selected':''}>${label}</option>`).join('')}</select></label>`;
}
async function spotterOpenKartRegistry(){
 document.getElementById('spotterRegistryOverlay')?.remove();await spotterPullRegistry();
 const active=Boolean(spotterState.kartTrackingEnabled),counts=spotterRegistryCounts();
 const heading=`<div class="spotter-registry-head"><div><div class="spotter-registry-title">REGISTRE DES KARTS</div><small data-spotter-registry-count>● SUIVI ACTIF · ${counts.active}/${counts.total} KV</small></div><div class="spotter-registry-head-tools">${spotterRegistrySortControl()}<button class="spotter-registry-close" type="button" onclick="spotterCloseKartRegistry()" aria-label="Fermer le registre">×</button></div></div>`;
 const content=active
  ? `${heading}<div class="spotter-registry-table">${spotterRegistryRowsHtml()}</div><div class="spotter-registry-actions"><button class="spotter-secondary" type="button" onclick="spotterExportKartRegistry()">EXPORTER HISTORIQUE KV</button><button class="spotter-secondary" type="button" onclick="spotterExportKartArchives()">ARCHIVES KV</button><button class="spotter-secondary" type="button" onclick="spotterStartNewKartCourse()" title="Archiver ce registre et en commencer un nouveau pour une nouvelle course">NOUVELLE COURSE KV</button><button class="spotter-secondary danger" type="button" onclick="spotterSetKartTracking(false)">ARRÊTER LE SUIVI</button><button class="spotter-primary" type="button" onclick="spotterCloseKartRegistry()">FERMER</button></div>`
  : `<div class="spotter-registry-title">SUIVI KARTS</div><p class="spotter-registry-warning">Le suivi n’est fiable que si chaque échange est compté. Une interruption conserve l’historique connu mais Velocity ne reconstitue jamais une filiation incertaine.</p>${counts.total?`<div class="spotter-registry-table">${spotterRegistryRowsHtml()}</div>`:''}<div class="spotter-registry-actions"><button class="spotter-secondary" type="button" onclick="spotterExportKartRegistry()">EXPORTER HISTORIQUE KV</button><button class="spotter-secondary" type="button" onclick="spotterExportKartArchives()">ARCHIVES KV</button><button class="spotter-secondary" type="button" onclick="spotterStartNewKartCourse()" title="Archiver ce registre et en commencer un nouveau pour une nouvelle course">NOUVELLE COURSE KV</button><button class="spotter-secondary" type="button" onclick="spotterCloseKartRegistry()">ANNULER</button><button class="spotter-primary" type="button" onclick="spotterSetKartTracking(true)">ACTIVER LE SUIVI</button></div>`;
 document.body.insertAdjacentHTML('beforeend',`<div class="spotter-registry-overlay" id="spotterRegistryOverlay"><div class="spotter-registry-panel ${active?'wide':''}">${content}</div></div>`);
}

function spotterExportKartRegistry(){
 const payload={format:'velocity-kart-registry-v1',exportedAt:new Date().toISOString(),version:SPOTTER_APP_RELEASE,run_id:spotterRegistryRunId,registry:spotterClone(spotterState.kartRegistry||{})};
 const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
 const url=URL.createObjectURL(blob);
 const a=document.createElement('a');a.href=url;a.download='Velocity_Historique_KV_'+new Date().toISOString().slice(0,10)+'.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
async function spotterStartNewKartCourse(){
 if(!spotterRegistryReady||!spotterRegistryRunId){alert('Le registre serveur doit être chargé avant de changer de course.');return}
 if(!confirm('Nouvelle course KV ? Le registre actuel sera archivé et un nouveau registre vide sera créé. Les files Spotter ne sont pas réinitialisées par cette action.'))return;
 try{
  const response=await fetch('/api/spotter-registry/new-course',{
   method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({run_id:spotterRegistryRunId})
  });
  const data=await response.json();if(!response.ok||!data.ok){
   if(response.status===409){await spotterPullRegistry();return}
   throw Error(data.error||'Nouvelle course KV impossible');
  }
  await spotterPullRegistry();
  await spotterOpenKartRegistry();
 }catch(error){alert(error.message||String(error))}
}
function spotterExportKartArchives(){
 // The ZIP contains one isolated JSON per old run; its contents are never merged.
 window.location.assign('/api/spotter-registry/archives/export');
}
function spotterCloseKartRegistry(){document.getElementById('spotterRegistryOverlay')?.remove()}

// V7.2.1795 — Mode de course dans Spotter, jamais sur la Home générale.
// Le choix utilise l'API et le moteur de la V1794 ; pas d'état local concurrent.
function spotterKartModeLabel(){
 const mode=typeof velocityKartScoreMode==='function'?velocityKartScoreMode():null;
 return mode==='fixed'?'KART FIXE':mode==='quick'?'QUICK CHANGE':'À DÉFINIR';
}
function spotterOpenKartModeDialog(){
 document.getElementById('spotterKartModeOverlay')?.remove();
 document.body.insertAdjacentHTML('beforeend',`<div class="spotter-kart-mode-overlay" id="spotterKartModeOverlay" role="presentation" onclick="if(event.target===this)spotterCloseKartModeDialog()">
 <section class="spotter-kart-mode-panel" role="dialog" aria-modal="true" aria-labelledby="spotterKartModeTitle">
  <div class="spotter-kart-mode-head"><h2 id="spotterKartModeTitle">MODE DE COURSE</h2><button type="button" class="spotter-kart-mode-close" onclick="spotterCloseKartModeDialog()" aria-label="Fermer">×</button></div>
  <p class="spotter-kart-mode-hint">Gestion des machines en endurance. Cette option ne concerne pas les courses Sprint ou Qualification.</p>
  <div class="spotter-kart-mode-options">
   <button type="button" class="spotter-kart-mode-choice" data-velocity-kart-mode-option="fixed" aria-pressed="false" onclick="velocitySetKartMode('fixed')"><strong>KART FIXE</strong><span>Même machine pour chaque équipe pendant la course</span></button>
   <button type="button" class="spotter-kart-mode-choice" data-velocity-kart-mode-option="quick" aria-pressed="false" onclick="velocitySetKartMode('quick')"><strong>QUICK CHANGE</strong><span>Machines suivies par identifiant KV dans le registre Spotter</span></button>
  </div>
  <p id="velocityKartModeNotice" class="spotter-kart-mode-notice" aria-live="polite"></p>
  <div class="spotter-kart-mode-actions"><button type="button" class="spotter-kart-mode-reset" onclick="velocityKartNewRace()">NOUVELLE COURSE · RÉINITIALISER LES NOTES</button><button type="button" class="spotter-kart-mode-done" onclick="spotterCloseKartModeDialog()">FERMER</button></div>
 </section></div>`);
 if(typeof velocityRenderKartModeChoice==='function')velocityRenderKartModeChoice();
 document.querySelector('#spotterKartModeOverlay .spotter-kart-mode-close')?.focus();
}
function spotterCloseKartModeDialog(){document.getElementById('spotterKartModeOverlay')?.remove()}
document.addEventListener('keydown',event=>{
 if(event.key==='Escape'&&document.getElementById('spotterKartModeOverlay'))spotterCloseKartModeDialog();
});

function spotterNormalizePhysicalKart(value){return String(value??'').trim().replace(/^kart\s*/i,'').replace(/\s+/g,' ').toUpperCase()}
function spotterFindPhysicalKartDuplicate(kart){
 const target=spotterNormalizePhysicalKart(kart);if(!target)return null;
 const pool=[...(spotterState.queue||[]),...(spotterState.maintenance||[]),...Object.values(spotterState.assignments||{}),...(spotterState.incoming||[]).map(item=>({kv:item.returnedKv,apexKart:item.returnedKart,lastTeam:item.team}))];
 return pool.find(item=>spotterNormalizePhysicalKart(item?.apexKart)===target)||null;
}
function spotterOpenAddKart(origin){
 if(!spotterState.configured){openSpotterSetup(origin);return}
 const count=Math.max(1,Math.min(3,Number(spotterState.mode)||1));
 spotterAddKartDraft=Array.from({length:count},(_,index)=>({kart:'',file:index+1}));
 spotterSetupOrigin=origin||((typeof currentMode==='string'&&currentMode==='analyzer')?'analyzer':'spotter');
 if(spotterSetupOrigin==='analyzer'&&typeof currentMode==='string'&&currentMode==='analyzer')showMode('spotter');
 spotterUiStep='addkart';renderSpotterFoundation('addkart');
}
function spotterAddKartDraftRow(file){
 const target=Math.max(1,Math.min(spotterState.mode,Number(file)||1));
 spotterAddKartDraft.push({kart:'',file:target});renderSpotterFoundation('addkart');
 setTimeout(()=>document.querySelector(`.spotter-add-kart-file[data-add-file="${target}"] .spotter-setup-row:last-of-type input`)?.focus(),0);
}
function spotterRemoveAddKartDraft(index){
 if(!spotterAddKartDraft?.[index])return;
 const file=Number(spotterAddKartDraft[index].file)||1;
 const same=spotterAddKartDraft.filter(row=>Number(row.file)===file).length;
 if(same<=1)spotterAddKartDraft[index].kart='';else spotterAddKartDraft.splice(index,1);
 renderSpotterFoundation('addkart');
}
function spotterUpdateAddKartDraft(index,value){if(spotterAddKartDraft?.[index])spotterAddKartDraft[index].kart=String(value||'').trim().slice(0,18)}
function spotterRenderAddKartFiles(){
 const count=Math.max(1,Math.min(3,Number(spotterState.mode)||1)),columns=[];
 if(!Array.isArray(spotterAddKartDraft)||!spotterAddKartDraft.length)spotterAddKartDraft=Array.from({length:count},(_,index)=>({kart:'',file:index+1}));
 for(let file=1;file<=count;file+=1){
  const indexes=spotterAddKartDraft.map((row,index)=>Number(row.file)===file?index:-1).filter(index=>index>=0);
  const rows=indexes.map(index=>`<div class="spotter-setup-row"><div class="spotter-kv">NOUVEAU</div><input autocomplete="off" value="${spotterEscape(spotterAddKartDraft[index]?.kart||'')}" placeholder="Nom / numéro du kart" oninput="spotterUpdateAddKartDraft(${index},this.value)"><button class="spotter-remove" type="button" onclick="spotterRemoveAddKartDraft(${index})">×</button></div>`).join('');
  columns.push(`<div class="spotter-setup-file spotter-add-kart-file" data-add-file="${file}"><div class="spotter-setup-file-title">FILE ${file}</div>${rows}<button class="spotter-add-row spotter-add-file-row" type="button" onclick="spotterAddKartDraftRow(${file})">＋ AJOUTER UN KART</button></div>`);
 }
 return `<div class="spotter-setup-files setup-files-${count}">${columns.join('')}</div>`;
}
function spotterConfirmAddKarts(){
 const additions=(spotterAddKartDraft||[]).map(row=>({kart:String(row?.kart||'').trim(),file:Math.max(1,Math.min(spotterState.mode,Number(row?.file)||1))})).filter(row=>row.kart);
 if(!additions.length){alert('Ajoutez au moins un kart.');return}
 const seen=new Set();
 for(const row of additions){
  const normalized=spotterNormalizePhysicalKart(row.kart);
  if(seen.has(normalized)){alert(`Le kart ${row.kart} est présent plusieurs fois dans cet ajout.`);return}
  seen.add(normalized);
  const duplicate=spotterFindPhysicalKartDuplicate(row.kart);
  if(duplicate){alert(`Kart ${row.kart} est déjà suivi par Velocity${duplicate.kv?` sous ${duplicate.kv}`:''}.`);return}
 }
 spotterRememberUndo();
 additions.forEach(row=>{
  const item={cardId:spotterCardId('queue'),kv:spotterAllocateKv(),apexKart:row.kart,lastTeam:'Initialisation',currentTeam:null,score:null,confidence:null,status:'available',queueFile:row.file,addedAt:Date.now()};
  spotterState.queue.push(item);
  if(spotterState.kartTrackingEnabled){spotterRegistryEnsure(item.kv);spotterScheduleRegistryPush()}
  spotterLogMovement('manual_kart_added',{kv:item.kv,kart:row.kart,queueFile:row.file});
 });
 const origin=spotterSetupOrigin;spotterAddKartDraft=null;spotterSetupOrigin='spotter';
 saveSpotterFoundation();spotterRenderCurrent();
 if(origin==='analyzer')setTimeout(()=>showMode('analyzer'),0);
}
function spotterCancelAddKart(){
 const origin=spotterSetupOrigin;spotterAddKartDraft=null;spotterSetupOrigin='spotter';
 if(origin==='analyzer'){showMode('analyzer');return}
 spotterRenderCurrent();
}

function spotterBeginSetup(origin){
 if(!spotterSetupDraft)spotterSetupDraft=spotterClone(spotterState);
 spotterSetupOrigin=origin||((typeof currentMode==='string'&&currentMode==='analyzer')?'analyzer':'spotter');
}
function openSpotterSetup(origin){
 spotterBeginSetup(origin);
 if(spotterSetupOrigin==='analyzer'&&typeof currentMode==='string'&&currentMode==='analyzer'){
  spotterSetupRequested=true;
  showMode('spotter');
  return;
 }
 spotterUiStep='mode';renderSpotterFoundation('mode');
}
function spotterCancelSetup(){
 const previous=spotterSetupDraft?spotterClone(spotterSetupDraft):null;
 if(previous)Object.assign(spotterState,previous);
 const origin=spotterSetupOrigin;
 spotterSetupDraft=null;spotterSetupOrigin='spotter';spotterSetupRequested=false;
 // Annuler ne doit ni pousser un état temporaire au serveur ni réinitialiser les files.
 localStorage.setItem(SPOTTER_STORAGE_KEY,JSON.stringify({version:6,appRelease:SPOTTER_APP_RELEASE,savedAt:new Date().toISOString(),state:spotterState}));
 if(origin==='analyzer'){showMode('analyzer');return}
 if(spotterState.configured){spotterRenderCurrent();return}
 showHome();
}
function spotterEditQueueSetup(){spotterBeginSetup();spotterUiStep='queue';renderSpotterFoundation('queue')}
async function spotterEnterMode(){
 spotterSessionOpened=true;
 // À l'entrée dans Spotter, le serveur est la source de vérité inter-appareils.
 // Le rendu local "mode" ne doit pas empêcher la récupération du Quick Change
 // préparé depuis Desktop / Analyzer.
 await spotterPullSharedState({force:true});
 if(spotterSetupRequested){spotterSetupRequested=false;spotterUiStep='mode';renderSpotterFoundation('mode');return}
 renderSpotterFoundation(spotterState.configured?(spotterState.recalibrating?'recalibrate':'live'):'mode');
}
function spotterSetupIndexesForFile(file){
 const target=Math.max(1,Math.min(3,Number(file)||1));
 return (spotterState.setupQueueFiles||[]).map((value,index)=>Number(value)===target?index:-1).filter(index=>index>=0);
}
function spotterEnsureSetupPerFile(){
 const count=Math.max(1,Math.min(3,Number(spotterState.mode)||1));
 const karts=[],files=[];
 (spotterState.setupKarts||[]).forEach((kart,index)=>{
  const file=Math.max(1,Math.min(count,Number(spotterState.setupQueueFiles?.[index])||1));
  if(file<=count){karts.push(String(kart||spotterDefaultKartName(index)));files.push(file)}
 });
 spotterState.setupKarts=karts;spotterState.setupQueueFiles=files;
 for(let file=1;file<=count;file+=1){
  if(!spotterSetupIndexesForFile(file).length){
   spotterState.setupKarts.push(spotterDefaultKartName(spotterState.setupKarts.length));
   spotterState.setupQueueFiles.push(file);
  }
 }
}
function setSpotterMode(mode){
 const count=Math.max(1,Math.min(3,Number(mode)||1));
 spotterState.mode=count;spotterEnsureSetupPerFile();spotterUiStep='queue';renderSpotterFoundation('queue');
}
function addSpotterSetupKart(file){
 const target=Math.max(1,Math.min(spotterState.mode,Number(file)||1));
 spotterState.setupKarts.push(spotterDefaultKartName(spotterState.setupKarts.length));
 spotterState.setupQueueFiles.push(target);
 renderSpotterFoundation('queue');
 setTimeout(()=>document.querySelector(`.spotter-setup-file[data-setup-file="${target}"] .spotter-setup-row:last-of-type input`)?.focus(),0);
}
function removeSpotterSetupKart(index){
 const file=Number(spotterState.setupQueueFiles?.[index])||1;
 if(spotterSetupIndexesForFile(file).length<=1)return;
 spotterState.setupKarts.splice(index,1);spotterState.setupQueueFiles.splice(index,1);renderSpotterFoundation('queue');
}
function updateSpotterSetupKart(index,value){
 spotterState.setupKarts[index]=String(value||'').trim().slice(0,18);
 const btn=document.getElementById('spotterLaunchButton');
 if(btn)btn.disabled=!Array.from({length:spotterState.mode},(_,i)=>spotterSetupIndexesForFile(i+1).some(index=>String(spotterState.setupKarts[index]||'').trim())).every(Boolean);
}
function spotterRenderSetupFiles(){
 spotterEnsureSetupPerFile();
 const count=Math.max(1,Math.min(3,Number(spotterState.mode)||1));
 const columns=[];
 for(let file=1;file<=count;file+=1){
  const indexes=spotterSetupIndexesForFile(file);
  const rows=indexes.map(index=>`<div class="spotter-setup-row"><div class="spotter-kv">${spotterPadKv(index)}</div><input autocomplete="off" value="${spotterEscape(spotterState.setupKarts[index])}" placeholder="Nom du kart" oninput="updateSpotterSetupKart(${index},this.value)"><button class="spotter-remove" type="button" onclick="removeSpotterSetupKart(${index})" aria-label="Supprimer" ${indexes.length<=1?'disabled':''}>×</button></div>`).join('');
  columns.push(`<div class="spotter-setup-file" data-setup-file="${file}"><div class="spotter-setup-file-title">FILE ${file}</div>${rows}<button class="spotter-add-row spotter-add-file-row" type="button" onclick="addSpotterSetupKart(${file})">＋ AJOUTER UN KART</button></div>`);
 }
 return `<div class="spotter-setup-files setup-files-${count}">${columns.join('')}</div>`;
}
function spotterLiveState(){
 try{if(typeof state==='object'&&state)return state}catch(_){ }
 return window.velocityState||window.state||{};
}
function spotterDriverLabel(driver){return String(driver?.team||driver?.driver||driver?.name||'').trim()}
// V7.2.1788 — libellé équipe stable : le pilote courant ne doit jamais remplacer
// le nom de l'équipe sur les cartes Spotter / Analyzer.
function spotterStableTeamLabel(driver,previous=''){
 const pilot=String(driver?.pilot||'').trim();
 const candidates=[driver?.team,driver?.driver,driver?.name].map(value=>String(value||'').trim()).filter(Boolean);
 const team=candidates.find(value=>!pilot||value.toLocaleLowerCase()!==pilot.toLocaleLowerCase());
 return team||String(previous||'').trim()||'—';
}
function spotterStableTeamNumber(driver,previous=''){
 const explicit=driver?.teamNumber??driver?.team_number??driver?.number??driver?.num??driver?.bib;
 if(explicit!==undefined&&explicit!==null&&String(explicit).trim())return String(explicit).trim();
 // Sur Apex Quick Change, le kart présent lors de la création de l'identité équipe
 // sert de numéro stable si aucun numéro d'équipe dédié n'est fourni.
 return String(previous||driver?.apex||driver?.kart||'').trim()||'—';
}
function spotterDriverKey(driver){
 const row=Number(driver?.apex_row);
 if(Number.isFinite(row)&&row>0)return `apex:${row}`;
 return String(driver?.driver||driver?.name||'').trim();
}
function spotterDriverByKey(key){
 const raw=String(key||'').trim();
 const match=raw.match(/^apex:(\d+)$/);
 if(match)return (spotterLiveState()?.drivers||[]).find(driver=>Number(driver?.apex_row)===Number(match[1]))||null;
 return (spotterLiveState()?.drivers||[]).find(driver=>String(driver?.driver||driver?.name||'').trim()===raw)||null;
}
function spotterAssignmentLabel(key){
 const item=spotterState.assignments?.[String(key||'')];
 return String(item?.teamLabel||item?.currentTeamLabel||item?.lastTeamLabel||spotterDriverLabel(spotterDriverByKey(key))||key||'').trim();
}
function spotterLegacyKeyForDriver(driver,assignments){
 const canonical=spotterDriverKey(driver),labels=[driver?.team,driver?.driver,driver?.name].map(value=>String(value||'').trim()).filter(Boolean);
 if(assignments[canonical])return canonical;
 for(const label of labels)if(assignments[label])return label;
 const kart=String(driver?.apex||driver?.kart||'').trim();
 if(kart){
  const matches=Object.entries(assignments).filter(([,item])=>String(item?.apexKart||'').trim()===kart);
  if(matches.length===1)return matches[0][0];
 }
 return null;
}
function spotterCanonicalizeState(drivers){
 if(!Array.isArray(drivers)||!drivers.length)return false;
 let changed=false;
 const assignments=spotterState.assignments||{},remap=new Map();
 for(const driver of drivers){
  const canonical=spotterDriverKey(driver);if(!canonical)continue;
  const legacy=spotterLegacyKeyForDriver(driver,assignments);
  if(legacy&&legacy!==canonical)remap.set(legacy,canonical);
  const labels=[driver?.team,driver?.driver,driver?.name].map(value=>String(value||'').trim()).filter(Boolean);
  labels.forEach(label=>{if(label!==canonical)remap.set(label,canonical)});
 }
 if(!remap.size)return false;
 const next={};
 Object.entries(assignments).forEach(([oldKey,item])=>{
  const key=remap.get(oldKey)||oldKey,driver=spotterDriverByKey(key),label=spotterStableTeamLabel(driver,item?.teamLabel||oldKey);
  const candidate={...item,teamLabel:label,teamNumber:spotterStableTeamNumber(driver,item?.teamNumber),currentTeam:key,lastTeam:item?.lastTeam===oldKey?key:item?.lastTeam};
  if(!next[key])next[key]=candidate;
  else{
   const current=next[key],driverKart=String(driver?.apex||driver?.kart||'').trim();
   const currentMatch=driverKart&&String(current?.apexKart||'').trim()===driverKart,candidateMatch=driverKart&&String(candidate?.apexKart||'').trim()===driverKart;
   if(candidateMatch&&!currentMatch)next[key]=candidate;
  }
  if(key!==oldKey)changed=true;
 });
 spotterState.assignments=next;
 const canonical=value=>remap.get(String(value||''))||String(value||'');
 (spotterState.incoming||[]).forEach(item=>{const old=item.team,itemKey=canonical(old);if(itemKey!==old){item.team=itemKey;changed=true}if(!item.name||item.name===old)item.name=spotterAssignmentLabel(itemKey)});
 const seenIncoming=new Set();
 spotterState.incoming=(spotterState.incoming||[]).filter(item=>{const key=String(item.team||'');if(seenIncoming.has(key)){changed=true;return false}seenIncoming.add(key);return true});
 const reservedByTeam=new Set();
 (spotterState.queue||[]).forEach(item=>{
  if(item?.reservedTeam){const old=item.reservedTeam,key=canonical(old);if(key!==old){item.reservedTeam=key;changed=true}if(reservedByTeam.has(key)){item.status='available';delete item.reservedTeam;delete item.pitInAt;delete item.reservedAt;delete item.sourceLastTeam;changed=true}else reservedByTeam.add(key)}
  if(item?.lastTeam){const key=canonical(item.lastTeam);if(key!==item.lastTeam){item.lastTeam=key;changed=true}}
 });
 (spotterState.maintenance||[]).forEach(item=>{if(item?.lastTeam){const key=canonical(item.lastTeam);if(key!==item.lastTeam){item.lastTeam=key;changed=true}}});
 const nextStatus={};Object.entries(spotterState.lastDriverStatus||{}).forEach(([key,value])=>{nextStatus[canonical(key)]=value;if(canonical(key)!==key)changed=true});spotterState.lastDriverStatus=nextStatus;
 return changed;
}
// Même source de vérité que la Heat Map Analyzer : le statut de grille ET
// l'impulsion Apex brute *in/*out conservée dans velocityApexMap.
function spotterApexMapEntry(driver){
 const row=Number(driver?.apex_row);
 return Number.isFinite(row)?(window.velocityApexMap?.rows?.get(row)||null):null;
}
function spotterDriverPitState(driver){
 const inPit=typeof velocityKartIsInPit==='function'
  ? velocityKartIsInPit(driver)
  : (String(driver?.status||'unknown').toLowerCase()==='pit'||Boolean(spotterApexMapEntry(driver)?.inPit));
 return inPit?'pit':'track';
}
// Spotter ne doit pas confondre « kart actuellement IN » avec « nouvelle entrée
// opérationnelle à traiter ». Une session terminée depuis longtemps peut laisser
// toute la grille Apex en IN : la Heat Map doit continuer à le montrer, mais cela
// ne doit pas remplir artificiellement Karts entrants.
function spotterSessionIsActive(){
 const live=spotterLiveState()||{};
 const drivers=(live.drivers||[]).filter(driver=>spotterDriverKey(driver));
 const totalLaps=Number(live.total_laps),currentLap=Number(live.current_lap);
 if(Number.isFinite(totalLaps)&&totalLaps>0&&Number.isFinite(currentLap))return currentLap<totalLaps;
 const remainingMs=Number(live.time_remaining_ms);
 if(Number.isFinite(remainingMs))return remainingMs>0;
 const raw=String(live.time_remaining||'').trim();
 const parts=raw.match(/^(\d{1,3}):(\d{2})(?::(\d{2}))?$/);
 if(parts){
  const seconds=parts[3]===undefined?(Number(parts[1])*60+Number(parts[2])):(Number(parts[1])*3600+Number(parts[2])*60+Number(parts[3]));
  if(Number.isFinite(seconds))return seconds>0;
 }
 // Pour les sessions sans cible temps/tours exploitable, la présence d'au moins
 // un kart réellement en piste est le meilleur indicateur disponible d'activité.
 if(drivers.some(driver=>spotterDriverPitState(driver)!=='pit'))return true;
 // Toute la grille est IN et aucun compteur actif n'est disponible : on traite
 // la session comme inactive pour Spotter uniquement.
 return false;
}
function spotterMetricsForDriver(driver){
 let score=null,confidence=null;
 try{if(driver&&typeof analyzerKartScore==='function'){const details=typeof analyzerVelocityUnifiedMetrics==='function'?analyzerVelocityUnifiedMetrics(driver):null;score=(details&&details.status==='learning')?null:analyzerKartScore(driver)}}catch(_){ }
 try{if(typeof analyzerConfidence==='function')confidence=analyzerConfidence(driver)}catch(_){ }
 return {score:spotterValidScore(score)?Math.round(Number(score)):null,confidence:Number.isFinite(Number(confidence))?Math.round(Number(confidence)):null};
}
function spotterSeedGridAssignments(startNumber){
 const assignments={};let next=Math.max(1,Number(startNumber)||1);
 const drivers=[...(spotterLiveState()?.drivers||[])].filter(driver=>spotterDriverKey(driver)).sort((a,b)=>(Number(a.pos)||999)-(Number(b.pos)||999));
 drivers.forEach(driver=>{
  const team=spotterDriverKey(driver);const metrics=spotterMetricsForDriver(driver);
  assignments[team]={cardId:spotterCardId('track'),kv:spotterKvFromNumber(next++),apexKart:String(driver.apex||driver.kart||'—'),lastTeam:team,currentTeam:team,teamLabel:spotterStableTeamLabel(driver,team),teamNumber:spotterStableTeamNumber(driver),score:metrics.score,confidence:metrics.confidence,status:'track'};
 });
 return {assignments,next};
}
function launchSpotterFoundation(){
 spotterEnsureSetupPerFile();
 const karts=spotterState.setupKarts.map((kart,index)=>({kart:String(kart||'').trim(),file:Math.max(1,Math.min(spotterState.mode,Number(spotterState.setupQueueFiles?.[index])||1))}))
  .filter(item=>item.kart)
  .map((item,index)=>({cardId:spotterCardId('queue'),kv:spotterPadKv(index),apexKart:item.kart,lastTeam:'Initialisation',score:null,confidence:null,status:'available',queueFile:item.file}));
 const everyFileReady=Array.from({length:spotterState.mode},(_,i)=>karts.some(item=>Number(item.queueFile)===i+1));
 if(!karts.length||!everyFileReady.every(Boolean)){alert('Ajoutez au moins un kart dans chaque file.');return}
 const seeded=spotterSeedGridAssignments(karts.length+1);
 spotterState.queue=karts;spotterState.incoming=[];spotterState.maintenance=[];spotterState.assignments=seeded.assignments;spotterState.nextKvNumber=seeded.next;spotterState.movementLog=[];spotterState.lastDriverStatus={};spotterState.monitorPrimed=false;spotterState.freeMode=false;spotterState.freeStartedAt=null;spotterState.freePitIns=0;spotterState.freePitOuts=0;spotterState.freeNeedsRecalibration=false;spotterState.recalibrating=false;spotterState.autoNextFile=1;spotterState.configured=true;
 const setupOrigin=spotterSetupOrigin;spotterSetupDraft=null;spotterSetupOrigin='spotter';spotterSetupRequested=false;
 saveSpotterFoundation();spotterUiStep='live';renderSpotterFoundation('live');
 if(setupOrigin==='analyzer')setTimeout(()=>showMode('analyzer'),0);
 // Dès que la configuration est validée, synchroniser immédiatement les karts
 // déjà signalés IN par Apex, sans attendre le prochain tick de 750 ms.
 setTimeout(spotterMonitorApex,0);
}
function resetSpotterFoundation(){
 if(!confirm('Réinitialiser la configuration Spotter ?'))return;
 spotterAcknowledgedIncoming.clear();spotterPersistAcknowledged();
 spotterDeferredRemote=null;spotterSetupDraft=null;spotterSetupRequested=false;
 Object.assign(spotterState,{mode:1,setupKarts:['X'],setupQueueFiles:[1],queue:[],maintenance:[],incoming:[],assignments:{},movementLog:[],nextKvNumber:1,lastDriverStatus:{},monitorPrimed:false,freeMode:false,freeStartedAt:null,freePitIns:0,freePitOuts:0,freeNeedsRecalibration:false,recalibrating:false,autoNextFile:1,configured:false,kartTrackingEnabled:false,kartRegistry:{}});
 saveSpotterFoundation();spotterUiStep='mode';renderSpotterFoundation('mode');
}
function spotterAllocateKv(){const kv=spotterKvFromNumber(spotterState.nextKvNumber);spotterState.nextKvNumber+=1;return kv}
function spotterFindDriver(team){return spotterDriverByKey(team)}
function spotterCurrentAssignment(team){return spotterState.assignments[String(team||'')]||null}
function spotterEnsureAssignment(team,driver=null){
 const key=String(team||'').trim();if(!key)return null;
 if(spotterState.assignments[key])return spotterState.assignments[key];
 const metrics=spotterMetricsForDriver(driver||spotterFindDriver(key));
 const assignment={cardId:spotterCardId('track'),kv:spotterAllocateKv(),apexKart:String(driver?.apex||driver?.kart||'—'),lastTeam:key,currentTeam:key,teamLabel:spotterStableTeamLabel(driver,key),teamNumber:spotterStableTeamNumber(driver),score:metrics.score,confidence:metrics.confidence,status:'track'};
 spotterState.assignments[key]=assignment;return assignment;
}
function spotterAutoQueueFile(){
 const count=Math.max(1,Math.min(3,Number(spotterState.mode)||1));
 const start=Math.max(1,Math.min(count,Number(spotterState.autoNextFile)||1));
 for(let offset=0;offset<count;offset++){
  const file=((start-1+offset)%count)+1;
  if(spotterAvailableIndexInFile(file)>=0){spotterState.autoNextFile=(file%count)+1;return file}
 }
 return 0;
}
function spotterAutoProcessPending(){
 if(!spotterState.freeMode||!Array.isArray(spotterState.incoming)||!spotterState.incoming.length)return false;
 let changed=false;
 for(const incoming of [...spotterState.incoming]){
  const autoFile=spotterAutoQueueFile();
  if(!autoFile)break;
  spotterState.incomingQueueSelections[incoming.id]=autoFile;
  if(spotterValidateIncoming(incoming.id,false,{silent:true,estimated:true,targetFile:autoFile}))changed=true;
 }
 return changed;
}
function spotterAddIncoming(team,driver=null,{source='apex'}={}){
 const key=String(team||'').trim();if(!key)return false;
 if(spotterState.incoming.some(item=>item.team===key)||spotterState.queue.some(item=>item.status==='reserved'&&item.reservedTeam===key))return false;
 // Après validation, attendre une véritable sortie de stands avant un nouveau pit-in.
 if(source==='apex'&&[...spotterAcknowledgedIncoming.values()].some(record=>record.team===key))return false;
 const assignment=spotterEnsureAssignment(key,driver);
 // Une ancienne sauvegarde ne doit jamais pouvoir réutiliser le KV d'un kart
 // déjà présent dans la file ou en maintenance.
 const occupied=new Set([...(spotterState.queue||[]),...(spotterState.maintenance||[])].map(item=>item?.kv).filter(Boolean));
 if(occupied.has(assignment.kv))assignment.kv=spotterAllocateKv();
 const metrics=spotterMetricsForDriver(driver||spotterFindDriver(key));
 assignment.score=metrics.score??assignment.score;assignment.confidence=metrics.confidence??assignment.confidence;
 spotterRegistryUpdateScore(assignment.kv,key,assignment.score);
 const incoming={id:`${source}-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,team:key,name:spotterStableTeamLabel(driver||spotterFindDriver(key),assignment.teamLabel||key),teamNumber:assignment.teamNumber||spotterStableTeamNumber(driver),returnedCardId:assignment.cardId||spotterCardId('track'),returnedKv:assignment.kv,returnedKart:assignment.apexKart,score:assignment.score,confidence:assignment.confidence,pitInAt:Date.now(),status:'incoming',source,estimated:Boolean(spotterState.freeMode)};
 spotterState.incoming.push(incoming);
 if(spotterState.freeMode){spotterState.freePitIns+=1;spotterState.freeNeedsRecalibration=true;}
 spotterLogMovement('pit_in',{team:key,kv:assignment.kv,source,estimated:Boolean(spotterState.freeMode)});
 // En mode AUTO, Velocity gère le Quick Change sans validation humaine :
 // choix d'une file par rotation, réservation du premier kart disponible de
 // cette file et ajout du kart rendu au fond de la même file.
 if(spotterState.freeMode){
  const autoFile=spotterAutoQueueFile();
  if(autoFile){
   spotterState.incomingQueueSelections[incoming.id]=autoFile;
   const ok=spotterValidateIncoming(incoming.id,false,{silent:true,estimated:true,targetFile:autoFile});
   if(ok){renderSpotterFoundation('live');return true}
  }
  // Si aucune file n'a de kart disponible, on conserve exceptionnellement le
  // kart dans Entrants afin de ne jamais perdre l'événement Apex.
 }
 saveSpotterFoundation();renderSpotterFoundation('live');return true;
}
function simulateSpotterPitIn(){
 spotterRememberUndo();
 const index=spotterState.movementLog.filter(item=>item.type==='dev_pit_in').length;
 const team=spotterDefaultKartName(index);const score=78+((index*7)%21);const confidence=64+((index*11)%32);
 if(!spotterState.assignments[team])spotterState.assignments[team]={cardId:spotterCardId('track'),kv:spotterAllocateKv(),apexKart:spotterDefaultKartName(index),lastTeam:team,currentTeam:team,score,confidence,status:'track'};
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
// Velocity V7.2.107 — sélection du premier kart disponible dans la file choisie
function spotterAvailableIndexInFile(file){
 const target=Math.max(1,Math.min(spotterState.mode,Number(file)||1));
 return spotterState.queue.findIndex(item=>item.status==='available'&&(Number(item.queueFile)||1)===target);
}
function spotterRemoveCardEverywhere(cardId){
 if(!cardId)return;
 spotterState.queue=spotterState.queue.filter(item=>item.cardId!==cardId);
 spotterState.maintenance=spotterState.maintenance.filter(item=>item.cardId!==cardId);
}
function spotterValidateIncoming(id,toMaintenance=false,{silent=false,estimated=false,targetFile=null}={}){
 const index=spotterState.incoming.findIndex(item=>item.id===id);if(index<0)return;
 const incoming=spotterState.incoming[index];
 // En multi-files, la file choisie doit être connue AVANT de sélectionner le kart
 // à attribuer. Chaque file est une file indienne autonome : le premier kart
 // disponible de la file choisie part, et le kart rendu est ajouté au fond de
 // cette même file. Les autres files ne doivent jamais être modifiées.
 let selectedFile=0;
 let availableIndex=-1;
 if(toMaintenance){
  availableIndex=spotterAvailableIndex();
  if(availableIndex>=0)selectedFile=Number(spotterState.queue[availableIndex]?.queueFile)||1;
 }else{
  const requestedFile=Number(targetFile||spotterState.incomingQueueSelections[id]||0);
  if(!requestedFile){if(!silent)alert('Sélectionnez une file avant de valider.');return false}
  selectedFile=Math.max(1,Math.min(spotterState.mode,requestedFile));
  availableIndex=spotterAvailableIndexInFile(selectedFile);
 }
 if(availableIndex<0){
  if(!silent)alert(toMaintenance?'Aucun kart disponible dans les files.':`Aucun kart disponible dans la file ${selectedFile}.`);
  return false;
 }
 const assigned=spotterState.queue[availableIndex];
 spotterRememberUndo();
 const current=spotterEnsureAssignment(incoming.team,spotterFindDriver(incoming.team));
 const returned={...current,cardId:incoming.returnedCardId||current.cardId||spotterCardId('return'),kv:incoming.returnedKv||current.kv,apexKart:incoming.returnedKart||current.apexKart,lastTeam:incoming.team,currentTeam:null,score:incoming.score??current.score,confidence:incoming.confidence??current.confidence,status:toMaintenance?'maintenance':'available',enteredAt:Date.now(),queueFile:selectedFile};
 // Ne retire que l'instance exacte du kart retourné. Deux cartes peuvent afficher
 // le même KV sans qu'une validation dans une file supprime l'autre file.
 spotterRemoveCardEverywhere(returned.cardId);
 assigned.status='reserved';assigned.reservedTeam=incoming.team;assigned.pitInAt=incoming.pitInAt||Date.now();assigned.reservedAt=Date.now();assigned.sourceLastTeam=assigned.lastTeam;assigned.estimated=Boolean(estimated||incoming.estimated||spotterState.freeMode);
 spotterState.incoming.splice(index,1);
 spotterRememberAcknowledged(incoming);
 spotterDeferredRemote=null;
 delete spotterState.incomingQueueSelections[id];
 if(toMaintenance)spotterState.maintenance.push(returned);else spotterState.queue.push(returned);
 current.status='pit';current.pendingReplacementKv=assigned.kv;
 spotterLogMovement(toMaintenance?'validate_maintenance':'validate',{team:incoming.team,receivedKv:assigned.kv,returnedKv:returned.kv,queueFile:selectedFile,estimated:Boolean(assigned.estimated)});
 saveSpotterFoundation();if(!silent)renderSpotterFoundation('live');return true;
}
function spotterReinsertMaintenance(cardId,targetFile=null){
 const key=spotterMaintenanceSelectionKey(cardId);
 const selectedFile=Math.max(1,Math.min(spotterState.mode,Number(targetFile||spotterState.incomingQueueSelections[key])||0));
 if(!selectedFile){alert('Sélectionnez une file avant de valider.');return false}
 if(!confirm(`Voulez-vous vraiment remettre le kart dans la file ${selectedFile} ?`))return false;
 const index=spotterState.maintenance.findIndex(item=>item.cardId===cardId);if(index<0)return false;
 spotterRememberUndo();
 const [item]=spotterState.maintenance.splice(index,1);
 item.status='available';item.reinsertedAt=Date.now();item.enteredAt=null;item.queueFile=selectedFile;
 spotterState.queue.push(item);delete spotterState.incomingQueueSelections[key];
 // Une réinsertion est une mutation structurelle prioritaire : aucun ancien
 // snapshot différé ne doit pouvoir remettre ce kart dans ZONE MECA.
 spotterDeferredRemote=null;
 spotterLogMovement('maintenance_reinsert',{cardId,kv:item?.kv,queueFile:selectedFile});
 saveSpotterFoundation();
 spotterPushSharedState();
 spotterRenderCurrent();
 return true;
}
function spotterProcessPitOut(team,{source='apex'}={}){
 const key=String(team||'').trim();if(!key)return false;
 const driver=spotterFindDriver(key);const metrics=spotterMetricsForDriver(driver);
 for(const [id,record] of spotterAcknowledgedIncoming)if(record.team===key)spotterAcknowledgedIncoming.delete(id);
 spotterPersistAcknowledged();
 const index=spotterState.queue.findIndex(item=>item.status==='reserved'&&item.reservedTeam===key);
 if(index>=0){
  const [assigned]=spotterState.queue.splice(index,1);
  spotterState.assignments[key]={...assigned,currentTeam:key,lastTeam:assigned.sourceLastTeam||assigned.lastTeam,teamLabel:spotterStableTeamLabel(driver,spotterAssignmentLabel(key)),teamNumber:assigned.teamNumber||spotterStableTeamNumber(driver),status:'track',reservedTeam:null,pitInAt:null,reservedAt:null,score:assigned.score??metrics.score,confidence:assigned.confidence??metrics.confidence,apexKart:String(driver?.apex||driver?.kart||assigned.apexKart||'—')};
  spotterRegistryAppend(assigned.kv,key,spotterState.assignments[key].score,{source:'pit_out'});
  if(spotterState.freeMode){spotterState.freePitOuts+=1;spotterState.freeNeedsRecalibration=true;}
  spotterLogMovement('pit_out',{team:key,kv:assigned.kv,source,estimated:Boolean(spotterState.freeMode||assigned.estimated)});
  saveSpotterFoundation();renderSpotterFoundation('live');return true;
 }
 // V7.2.1785 : Apex est autoritaire sur la sortie des stands. Si l'équipe
 // ressort avant d'avoir été validée dans une file, elle doit disparaître de
 // « Karts entrants » sans provoquer de mouvement de file artificiel.
 const incomingIndex=spotterState.incoming.findIndex(item=>item.team===key);
 if(incomingIndex<0)return false;
 const [incoming]=spotterState.incoming.splice(incomingIndex,1);
 delete spotterState.incomingQueueSelections[incoming.id];
 const current=spotterEnsureAssignment(key,driver);
 current.status='track';current.currentTeam=key;current.lastTeam=key;current.pitInAt=null;current.pendingReplacementKv=null;
 if(metrics.score!==null)current.score=metrics.score;
 if(metrics.confidence!==null)current.confidence=metrics.confidence;
 current.apexKart=String(driver?.apex||driver?.kart||current.apexKart||incoming.returnedKart||'—');
 spotterRegistryUpdateScore(current.kv,key,current.score);
 if(spotterState.freeMode){spotterState.freePitOuts+=1;spotterState.freeNeedsRecalibration=true;}
 spotterLogMovement('pit_out_unvalidated',{team:key,kv:current.kv,source});
 saveSpotterFoundation();renderSpotterFoundation('live');return true;
}
function spotterRefreshVelocityMetrics(){
 let changed=false;
 Object.entries(spotterState.assignments||{}).forEach(([team,item])=>{
  if(!item||item.status!=='track')return;
  const driver=spotterFindDriver(team);if(!driver)return;
  const metrics=spotterMetricsForDriver(driver);
  if(metrics.score!==null&&metrics.score!==item.score){item.score=metrics.score;changed=true}
  spotterRegistryUpdateScore(item.kv,team,item.score);
  if(metrics.confidence!==null&&metrics.confidence!==item.confidence){item.confidence=metrics.confidence;changed=true}
  item.apexKart=String(driver.apex||driver.kart||item.apexKart||'—');item.currentTeam=team;item.lastTeam=team;item.teamLabel=spotterStableTeamLabel(driver,item.teamLabel);item.teamNumber=spotterStableTeamNumber(driver,item.teamNumber);
 });
 return changed;
}
// Stable pit-state confirmation: two consecutive consistent reads before
// changing operational queue state. Only applied to automatic Apex transitions.
const spotterPitTransitionCandidates=new Map();
function spotterConfirmedPitChange(team,previous,next){
 const old=spotterPitTransitionCandidates.get(team);
 const now=Date.now();
 if(!old||old.from!==previous||old.to!==next){spotterPitTransitionCandidates.set(team,{from:previous,to:next,first:now,count:1});return false}
 old.count+=1;
 if(old.count>=2&&now-old.first>=500){spotterPitTransitionCandidates.delete(team);return true}
 return false;
}
function spotterMonitorApex(){
 if(!spotterState.configured||spotterState.recalibrating||!spotterMonitorLeaseOwner||Date.now()>=spotterMonitorLeaseUntil)return;
 const drivers=(spotterLiveState()?.drivers||[]).filter(driver=>spotterDriverKey(driver));
 if(!drivers.length)return;
 const identityChanged=spotterCanonicalizeState(drivers);
 if(!spotterState.monitorPrimed){
  let primedChange=false;
  const sessionActive=spotterSessionIsActive();
  drivers.forEach(driver=>{
   const team=spotterDriverKey(driver),status=spotterDriverPitState(driver);
   spotterState.lastDriverStatus[team]=status;
   // Si Spotter démarre pendant une session ACTIVE alors que le kart est déjà
   // dans la pit lane, il devient entrant immédiatement. En revanche, une session
   // terminée avec toute la grille laissée IN par Apex ne remplit pas Spotter.
   if(sessionActive&&status==='pit')primedChange=spotterAddIncoming(team,driver,{source:'apex'})||primedChange;
  });
  spotterState.monitorPrimed=true;
  saveSpotterFoundation();
  if(primedChange)renderSpotterFoundation('live');
  return;
 }
 let changed=identityChanged||spotterRefreshVelocityMetrics();
 const sessionActive=spotterSessionIsActive();
 drivers.forEach(driver=>{
  const team=spotterDriverKey(driver),status=spotterDriverPitState(driver),previous=spotterState.lastDriverStatus[team];
  // V7.2.1784 : une vraie transition live piste -> stands est autoritaire.
  // Le garde-fou sessionActive reste réservé à l'initialisation pour éviter
  // de réimporter une ancienne grille entièrement laissée IN par Apex.
  if(previous&&previous!=='pit'&&status==='pit'){
   if(spotterConfirmedPitChange(team,previous,status)){
    changed=spotterAddIncoming(team,driver,{source:'apex'})||changed;
    spotterState.lastDriverStatus[team]=status;
   }
  }else if(previous==='pit'&&status==='track'){
   if(spotterConfirmedPitChange(team,previous,status)){
    changed=spotterProcessPitOut(team,{source:'apex'})||changed;
    spotterState.lastDriverStatus[team]=status;
   }
  }else{
   spotterPitTransitionCandidates.delete(team);
   spotterState.lastDriverStatus[team]=status;
  }
 });
 if(changed)saveSpotterFoundation();
}

function spotterActivateFree(){
 if(!spotterState.configured||spotterState.freeMode)return;
 spotterState.freeMode=true;spotterState.freeStartedAt=Date.now();spotterState.freePitIns=0;spotterState.freePitOuts=0;spotterState.freeNeedsRecalibration=false;spotterState.recalibrating=false;spotterState.autoNextFile=1;
 spotterLogMovement('auto_start',{at:spotterState.freeStartedAt});
 // Si des karts étaient déjà dans « Entrants » au moment d'activer AUTO, ils
 // sont immédiatement intégrés aux files sans attendre une nouvelle transition Apex.
 spotterAutoProcessPending();
 saveSpotterFoundation();renderSpotterFoundation('live');
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
  <button class="spotter-desktop-command spotter-kart-mode-command" type="button" onclick="spotterOpenKartModeDialog()">MODE KARTS · <span data-spotter-kart-mode-label>${spotterKartModeLabel()}</span></button>
  <button class="spotter-desktop-command spotter-quick-change-command" type="button" onclick="openSpotterSetup()">PRÉPARER LA ZONE QUICK CHANGE</button>
  <button class="spotter-desktop-command spotter-auto-command ${spotterState.freeMode?'active resume':''}" type="button" onclick="spotterToggleAuto()">${spotterState.freeMode?'▶ REPRENDRE':'AUTO'}</button>
  <button class="spotter-desktop-command spotter-add-kart-command" type="button" onclick="spotterOpenAddKart()">AJOUTER UN KART</button>
  <button class="spotter-desktop-command spotter-tracking-command ${spotterState.kartTrackingEnabled?'active':''}" type="button" onclick="spotterOpenKartRegistry()">${spotterState.kartTrackingEnabled?'● ':''}SUIVI KARTS</button>
  <button class="spotter-desktop-command spotter-reset-command" type="button" onclick="resetSpotterFoundation()">RÉINITIALISER</button>
 </div>`;
 return mobile+desktop;
}

function spotterRenderCurrent(){spotterUiStep=spotterState.recalibrating?'recalibrate':'live';renderSpotterFoundation(spotterUiStep)}

const spotterDrag={
 kv:null,from:null,pointerId:null,ghost:null,placeholder:null,timer:null,
 startX:0,startY:0,lastX:0,lastY:0,active:false,card:null,
 originalParent:null,originalNext:null,target:null,lockedScrollY:0,scrollLocked:false
};
function spotterQueueMovable(item){return item&&['available','reserved'].includes(item.status)}
function spotterDragSource(cardId,from){
 return (from==='queue'?spotterState.queue:spotterState.maintenance).find(item=>item.cardId===cardId);
}
function spotterCancelPendingDrag(){
 if(spotterDrag.timer){clearTimeout(spotterDrag.timer);spotterDrag.timer=null}
 spotterDrag.card?.classList.remove('spotter-pressing','spotter-holding');
}
function spotterMoveGhost(x,y){
 if(!spotterDrag.ghost)return;
 const mobile=window.matchMedia('(max-width:899px)').matches;
 const width=Number(spotterDrag.ghost.dataset.lockedWidth)||0;
 const height=Number(spotterDrag.ghost.dataset.lockedHeight)||0;
 const offsetY=mobile?height*.82:height/2;
 const scale=mobile?1.02:1.05;
 spotterDrag.ghost.style.setProperty('left',`${x-width/2}px`,'important');
 spotterDrag.ghost.style.setProperty('top',`${y-offsetY}px`,'important');
 spotterDrag.ghost.style.setProperty('transform',`scale(${scale})`,'important');
}
function spotterClearDropHighlights(){
 document.querySelectorAll('.spotter-file-column.spotter-file-active,.spotter-maintenance.spotter-drop-target')
  .forEach(node=>node.classList.remove('spotter-file-active','spotter-drop-target'));
}
function spotterCreatePlaceholder(rect){
 const placeholder=document.createElement('div');
 placeholder.className='spotter-card-placeholder';
 placeholder.style.width=`${rect.width}px`;
 placeholder.style.height=`${rect.height}px`;
 return placeholder;
}
function spotterCreateGhost(card,rect){
 const width=Math.round(rect.width*100)/100;
 const height=Math.round(rect.height*100)/100;
 const ghost=document.createElement('div');
 ghost.className='spotter-drag-preview';
 ghost.dataset.lockedWidth=String(width);
 ghost.dataset.lockedHeight=String(height);
 ghost.innerHTML=card.innerHTML;
 ghost.querySelectorAll('button,[onpointerdown]').forEach(node=>node.remove());
 const computed=getComputedStyle(card);
 ghost.style.setProperty('position','fixed','important');
 ghost.style.setProperty('left','0px','important');
 ghost.style.setProperty('top','0px','important');
 ghost.style.setProperty('width',`${width}px`,'important');
 ghost.style.setProperty('min-width',`${width}px`,'important');
 ghost.style.setProperty('max-width',`${width}px`,'important');
 ghost.style.setProperty('height',`${height}px`,'important');
 ghost.style.setProperty('min-height',`${height}px`,'important');
 ghost.style.setProperty('max-height',`${height}px`,'important');
 ghost.style.setProperty('box-sizing','border-box','important');
 ghost.style.setProperty('margin','0','important');
 ghost.style.setProperty('padding',computed.padding,'important');
 ghost.style.setProperty('border',computed.border,'important');
 ghost.style.setProperty('border-radius',computed.borderRadius,'important');
 ghost.style.setProperty('background',computed.background,'important');
 ghost.style.setProperty('color',computed.color,'important');
 ghost.style.setProperty('display',computed.display==='none'?'flex':computed.display,'important');
 ghost.style.setProperty('flex-direction',computed.flexDirection,'important');
 ghost.style.setProperty('align-items',computed.alignItems,'important');
 ghost.style.setProperty('justify-content',computed.justifyContent,'important');
 ghost.style.setProperty('gap',computed.gap,'important');
 ghost.style.setProperty('overflow','hidden','important');
 ghost.style.setProperty('pointer-events','none','important');
 ghost.style.setProperty('z-index','100000','important');
 ghost.style.setProperty('transform-origin','center center','important');
 document.body.appendChild(ghost);
 return ghost;
}
function spotterLockMobileScroll(){
 if(!window.matchMedia('(max-width:899px)').matches||spotterDrag.scrollLocked)return;
 const scrollY=window.scrollY||document.documentElement.scrollTop||0;
 spotterDrag.lockedScrollY=scrollY;
 spotterDrag.scrollLocked=true;
 document.documentElement.classList.add('spotter-scroll-locked');
 document.body.classList.add('spotter-scroll-locked');
 document.body.style.setProperty('--spotter-lock-scroll-y',`-${scrollY}px`);
}
function spotterUnlockMobileScroll(){
 if(!spotterDrag.scrollLocked)return;
 const scrollY=Number(spotterDrag.lockedScrollY)||0;
 document.documentElement.classList.remove('spotter-scroll-locked');
 document.body.classList.remove('spotter-scroll-locked');
 document.body.style.removeProperty('--spotter-lock-scroll-y');
 spotterDrag.scrollLocked=false;
 requestAnimationFrame(()=>window.scrollTo(0,scrollY));
}
function spotterPreventTouchScroll(event){
 if(spotterDrag.active)event.preventDefault();
}
function spotterActivateDrag(){
 const card=spotterDrag.card;if(!card)return;
 spotterDrag.active=true;
 spotterDrag.timer=null;
 card.classList.remove('spotter-pressing');
 card.classList.add('spotter-holding');
 spotterLockMobileScroll();
 document.addEventListener('touchmove',spotterPreventTouchScroll,{passive:false});
 const rect=card.getBoundingClientRect();
 spotterDrag.originalParent=card.parentElement;
 spotterDrag.originalNext=card.nextSibling;
 spotterDrag.placeholder=spotterCreatePlaceholder(rect);
 card.parentElement.insertBefore(spotterDrag.placeholder,card);
 card.classList.add('dragging','drag-ready','spotter-held');
 spotterDrag.ghost=spotterCreateGhost(card,rect);
 spotterMoveGhost(spotterDrag.lastX,spotterDrag.lastY);
 document.body.classList.add('spotter-drag-active');
 if(navigator.vibrate)navigator.vibrate(30);
}
function spotterStartDrag(event,cardId,from){
 if(event.button!==undefined&&event.button!==0)return;
 const source=spotterDragSource(cardId,from);
 if(!source||!spotterQueueMovable(source))return;
 const card=event.currentTarget.closest('.spotter-queue-card');if(!card)return;
 spotterCancelPendingDrag();
 Object.assign(spotterDrag,{
  kv:cardId,from,pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,
  lastX:event.clientX,lastY:event.clientY,active:false,card,target:null,
  ghost:null,placeholder:null,originalParent:null,originalNext:null
 });
 card.classList.add('spotter-pressing');
 try{card.setPointerCapture(event.pointerId)}catch(_){}
 spotterDrag.timer=setTimeout(spotterActivateDrag,450);
 document.addEventListener('pointermove',spotterOnDragMove,{passive:false});
 document.addEventListener('pointerup',spotterEndDrag,{once:true});
 document.addEventListener('pointercancel',spotterEndDrag,{once:true});
}
function spotterFindInsertion(list,y){
 const cards=[...list.querySelectorAll('.spotter-queue-card[data-spotter-queue-kv]')]
  .filter(node=>node!==spotterDrag.card);
 if(!cards.length)return null;
 for(const card of cards){
  const rect=card.getBoundingClientRect();
  const threshold=rect.top+rect.height*.48;
  if(y<threshold)return card;
 }
 return null;
}
function spotterPlacePlaceholder(list,before){
 const placeholder=spotterDrag.placeholder;if(!placeholder)return;
 if(before)list.insertBefore(placeholder,before);
 else list.appendChild(placeholder);
}
function spotterFindTargetColumn(x,y){
 const columns=[...document.querySelectorAll('[data-spotter-file]')];
 if(!columns.length)return null;
 const mobile=window.matchMedia('(max-width:899px)').matches;
 const horizontalTolerance=mobile?22:12;
 const verticalTolerance=mobile?180:100;
 let best=null,bestDistance=Infinity;
 for(const column of columns){
  const rect=column.getBoundingClientRect();
  const insideX=x>=rect.left-horizontalTolerance&&x<=rect.right+horizontalTolerance;
  const insideY=y>=rect.top-verticalTolerance&&y<=rect.bottom+verticalTolerance;
  if(!insideX||!insideY)continue;
  const centerX=(rect.left+rect.right)/2;
  const distance=Math.abs(x-centerX);
  if(distance<bestDistance){best=column;bestDistance=distance}
 }
 return best;
}

function spotterMobileMaintenanceDropTarget(clientX,clientY){
 const zone=document.querySelector('[data-spotter-drop-zone="maintenance"]');
 if(!zone)return null;
 const coarse=window.matchMedia?.('(pointer: coarse)')?.matches
  ||/iPhone|iPad|iPod|Android|Mobile/i.test(String(navigator?.userAgent||''));
 if(!coarse)return null;
 const rect=zone.getBoundingClientRect();
 const padX=34;
 const padTop=110;
 const padBottom=170;
 return clientX>=rect.left-padX&&clientX<=rect.right+padX
  &&clientY>=rect.top-padTop&&clientY<=rect.bottom+padBottom
  ?zone:null;
}

function spotterOnDragMove(event){
 if(spotterDrag.pointerId!==null&&event.pointerId!==spotterDrag.pointerId)return;
 spotterDrag.lastX=event.clientX;spotterDrag.lastY=event.clientY;
 if(!spotterDrag.active){
  const distance=Math.hypot(event.clientX-spotterDrag.startX,event.clientY-spotterDrag.startY);
  if(distance>10)spotterCancelPendingDrag();
  return;
 }
 event.preventDefault();
 if(spotterDrag.scrollLocked&&window.scrollY!==spotterDrag.lockedScrollY)window.scrollTo(0,spotterDrag.lockedScrollY);
 spotterMoveGhost(event.clientX,event.clientY);
 spotterClearDropHighlights();

 const element=document.elementFromPoint(event.clientX,event.clientY);
 const maintenance=spotterMobileMaintenanceDropTarget(event.clientX,event.clientY)
  ||element?.closest('[data-spotter-drop-zone="maintenance"]');
 if(maintenance){
  maintenance.classList.add('spotter-drop-target');
  spotterDrag.target={type:'maintenance'};
  return;
 }

 const column=spotterFindTargetColumn(event.clientX,event.clientY);
 const list=column?.querySelector('.spotter-file-list');
 if(!column||!list){spotterDrag.target=null;return}

 column.classList.add('spotter-file-active');

 const cards=[...list.querySelectorAll('.spotter-queue-card[data-spotter-queue-kv]')]
  .filter(node=>node!==spotterDrag.card);
 let before=null;

 if(cards.length===1){
  const rect=cards[0].getBoundingClientRect();
  before=event.clientY<rect.top+rect.height*.48?cards[0]:null;
 }else{
  before=spotterFindInsertion(list,event.clientY);
 }

 spotterPlacePlaceholder(list,before);
 spotterDrag.target={
  type:'queue',
  file:column.dataset.spotterFile,
  beforeKv:before?.dataset.spotterQueueCardId||null
 };
}
function spotterRestoreOriginalCard(){
 const {card,originalParent,originalNext}=spotterDrag;
 if(!card||!originalParent)return;
 if(originalNext&&originalNext.parentNode===originalParent)originalParent.insertBefore(card,originalNext);
 else originalParent.appendChild(card);
}
function spotterEndDrag(){
 document.removeEventListener('pointermove',spotterOnDragMove);
 document.removeEventListener('touchmove',spotterPreventTouchScroll);
 spotterCancelPendingDrag();
 const target=spotterDrag.active?spotterDrag.target:null;
 if(spotterDrag.active){
  if(target?.type==='maintenance')spotterMoveKartToMaintenance(spotterDrag.kv,spotterDrag.from);
  else if(target?.type==='queue')spotterMoveKartInQueue(spotterDrag.kv,spotterDrag.from,target.beforeKv,target.file);
  else spotterRestoreOriginalCard();
 }
 spotterClearDropHighlights();
 spotterDrag.card?.classList.remove('dragging','drag-ready','spotter-holding','spotter-held','spotter-pressing');
 spotterDrag.ghost?.remove();
 spotterDrag.placeholder?.remove();
 document.body.classList.remove('spotter-drag-active');
 spotterUnlockMobileScroll();
 Object.assign(spotterDrag,{
  kv:null,from:null,pointerId:null,ghost:null,placeholder:null,timer:null,
  startX:0,startY:0,lastX:0,lastY:0,active:false,card:null,
  originalParent:null,originalNext:null,target:null,lockedScrollY:0,scrollLocked:false
 });
}
function spotterMoveKartInQueue(cardId,from,beforeCardId=null,targetFile=null){
 spotterRememberUndo();
 let item=null;
 if(from==='queue'){
  const index=spotterState.queue.findIndex(entry=>entry.cardId===cardId&&['available','reserved'].includes(entry.status));if(index<0)return;
  [item]=spotterState.queue.splice(index,1);
 }else{
  const index=spotterState.maintenance.findIndex(entry=>entry.cardId===cardId);if(index<0)return;
  [item]=spotterState.maintenance.splice(index,1);item.status='available';item.reinsertedAt=Date.now();
 }
 if(targetFile)item.queueFile=Math.max(1,Math.min(spotterState.mode,Number(targetFile)||1));
 let target=beforeCardId?spotterState.queue.findIndex(entry=>entry.cardId===beforeCardId):-1;
 if(target<0)target=spotterState.queue.length;
 // Une carte verte ne peut pas passer devant une carte rouge déjà attribuée.
 // Une carte rouge peut être déplacée librement.
 if(item.status==='available'){
  const firstAvailable=spotterState.queue.findIndex(entry=>entry.status==='available'&&(Number(entry.queueFile)||1)===(Number(item.queueFile)||1));
  if(firstAvailable>=0)target=Math.max(target,firstAvailable);
 }
 spotterState.queue.splice(target,0,item);
 spotterLogMovement('manual_reorder',{cardId,kv:item?.kv,from,to:'queue',beforeCardId});saveSpotterFoundation();spotterRenderCurrent();
}
function spotterCancelReplacement(){
 spotterState.replacementRequest=null;spotterRenderCurrent();
}
function spotterRequestReservedReplacement(cardId){
 const reserved=spotterState.queue.find(entry=>entry.cardId===cardId&&entry.status==='reserved');
 if(!reserved)return false;
 const candidates=spotterState.queue.filter(entry=>entry.cardId!==cardId&&entry.status==='available');
 if(!candidates.length){
  alert(`Aucun autre kart disponible pour ${spotterDisplayName(reserved.reservedTeam)}. Le kart rouge ne peut pas être envoyé en maintenance tant qu’un remplaçant n’est pas disponible.`);
  return false;
 }
 spotterState.replacementRequest={cardId:reserved.cardId,team:reserved.reservedTeam,requestedAt:Date.now()};
 spotterRenderCurrent();return true;
}
function spotterConfirmReservedReplacement(oldCardId,newCardId){
 const oldIndex=spotterState.queue.findIndex(entry=>entry.cardId===oldCardId&&entry.status==='reserved');
 const newIndex=spotterState.queue.findIndex(entry=>entry.cardId===newCardId&&entry.status==='available');
 if(oldIndex<0||newIndex<0){spotterState.replacementRequest=null;spotterRenderCurrent();return false}
 const oldKart=spotterState.queue[oldIndex],newKart=spotterState.queue[newIndex];
 const team=String(oldKart.reservedTeam||'').trim();if(!team)return false;
 spotterRememberUndo();

 // Toutes les informations d'équipe restent sur le nouveau kart.
 newKart.status='reserved';
 newKart.reservedTeam=team;
 newKart.pitInAt=oldKart.pitInAt||Date.now();
 newKart.reservedAt=oldKart.reservedAt||Date.now();
 newKart.sourceLastTeam=newKart.lastTeam;
 newKart.estimated=Boolean(oldKart.estimated);

 const assignment=spotterState.assignments?.[team];
 if(assignment){assignment.status='pit';assignment.pendingReplacementKv=newKart.kv}

 // L'ancien kart part physiquement en maintenance.
 spotterState.queue.splice(oldIndex,1);
 oldKart.status='maintenance';oldKart.enteredAt=Date.now();oldKart.currentTeam=null;
 oldKart.lastTeam=oldKart.sourceLastTeam||oldKart.lastTeam;
 delete oldKart.reservedTeam;delete oldKart.pitInAt;delete oldKart.reservedAt;delete oldKart.sourceLastTeam;delete oldKart.estimated;
 spotterState.maintenance.push(oldKart);

 spotterState.replacementRequest=null;
 spotterLogMovement('reserved_replacement_maintenance',{team,oldKv:oldKart.kv,newKv:newKart.kv,newQueueFile:Number(newKart.queueFile)||1});
 saveSpotterFoundation();spotterRenderCurrent();return true;
}
function spotterReplacementOverlay(){
 const request=spotterState.replacementRequest;if(!request)return '';
 const reserved=spotterState.queue.find(entry=>entry.cardId===request.cardId&&entry.status==='reserved');
 if(!reserved){spotterState.replacementRequest=null;return ''}
 const queueOrder=new Map(spotterState.queue.map((entry,index)=>[entry.cardId,index]));
 const candidates=spotterState.queue
  .filter(entry=>entry.cardId!==reserved.cardId&&entry.status==='available')
  .slice()
  .sort((a,b)=>{
   const fileDiff=(Number(a.queueFile)||1)-(Number(b.queueFile)||1);
   if(fileDiff)return fileDiff;
   return (queueOrder.get(a.cardId)??0)-(queueOrder.get(b.cardId)??0);
  });
 const cards=candidates.map(item=>`<button type="button" class="spotter-replacement-card" onclick="spotterConfirmReservedReplacement('${spotterEscapeJs(reserved.cardId)}','${spotterEscapeJs(item.cardId)}')"><strong>${spotterEscape(spotterOriginLabel(item))}</strong><span>${spotterEscape(item.kv)} · File ${Number(item.queueFile)||1}</span><small>Score ${item.score??'—'}</small></button>`).join('');
 return `<div class="spotter-replacement-overlay" role="dialog" aria-modal="true"><div class="spotter-replacement-panel"><div class="spotter-replacement-title">CHANGEMENT DE KART</div><p>Cliquez sur le nouveau kart de <strong>${spotterEscape(spotterDisplayName(reserved.reservedTeam))}</strong>.</p><p class="spotter-replacement-note">Le temps d’arrêt aux stands continue sur le nouveau kart.</p><div class="spotter-replacement-grid">${cards||'<div class="spotter-empty">Aucun kart disponible.</div>'}</div><button type="button" class="spotter-secondary" onclick="spotterCancelReplacement()">ANNULER</button></div></div>`;
}
function spotterMoveKartToMaintenance(cardId,from){
 if(from!=='queue')return;
 const item=spotterState.queue.find(entry=>entry.cardId===cardId&&['available','reserved'].includes(entry.status));if(!item)return;
 if(item.status==='reserved'){spotterRequestReservedReplacement(cardId);return}
 spotterRememberUndo();
 const index=spotterState.queue.findIndex(entry=>entry.cardId===cardId);if(index<0)return;
 const [available]=spotterState.queue.splice(index,1);available.status='maintenance';available.enteredAt=Date.now();spotterState.maintenance.push(available);
 spotterLogMovement('manual_maintenance',{cardId,kv:available?.kv});saveSpotterFoundation();spotterRenderCurrent();
}
function spotterQueueVisualState(items,index){
 const item=items[index];
 if(!item)return 'waiting';
 if(item.status==='reserved')return 'reserved';
 const firstAvailableIndex=items.findIndex(entry=>entry?.status==='available');
 return index===firstAvailableIndex?'next':'waiting';
}
const SPOTTER_FILE_COLORS_KEY=velocityWorkspaceStorageKey('velocity_spotter_file_title_colors_v1');
function spotterFileColors(){try{const v=JSON.parse(localStorage.getItem(SPOTTER_FILE_COLORS_KEY)||'[]');return Array.isArray(v)?v:[]}catch(_){return []}}
function spotterFileColor(file){const color=spotterFileColors()[file-1];return /^#[0-9a-fA-F]{6}$/.test(color||'')?color:'#aeb6c5'}
function spotterSetFileTitleColor(file,color){if(!/^#[0-9a-fA-F]{6}$/.test(color||''))return;const list=spotterFileColors();list[file-1]=color;localStorage.setItem(SPOTTER_FILE_COLORS_KEY,JSON.stringify(list));document.querySelectorAll(`[data-spotter-file-title="${file}"]`).forEach(node=>node.style.color=color)}
function spotterRenderQueueColumns(){
 const count=Math.max(1,Math.min(3,Number(spotterState.mode)||1));
 const columns=[];
 for(let file=1;file<=count;file+=1){
  const items=(spotterState.queue||[]).filter(item=>(Number(item.queueFile)||1)===file);
  const cards=items.length?items.map((item,index)=>spotterQueueCard(item,spotterQueueVisualState(items,index))).join(''):'<div class="spotter-empty spotter-file-empty">File vide</div>';
  columns.push(`<div class="spotter-file-column" data-spotter-file="${file}"><div class="spotter-file-title" data-spotter-file-title="${file}" style="color:${spotterFileColor(file)}">FILE ${file}<input class="spotter-file-title-color" type="color" aria-label="Couleur du titre FILE ${file}" title="Changer la couleur de FILE ${file}" value="${spotterFileColor(file)}" oninput="spotterSetFileTitleColor(${file},this.value)" onclick="event.stopPropagation()"></div><div class="spotter-file-list" data-spotter-drop-zone="queue">${cards}</div></div>`);
 }
 return `<div class="spotter-queues-layout queues-${count}">${columns.join('')}</div>`;
}
function renderSpotterFoundation(forceStep){
 const root=document.getElementById('spotterApp');if(!root)return;
 const step=forceStep||(spotterState.configured?(spotterState.recalibrating?'recalibrate':'live'):'mode');
 spotterUiStep=step;
 root.innerHTML=`<div class="spotter-shell">
  <div class="spotter-top-accent" aria-hidden="true"></div>
  <div class="spotter-desktop-heading"><span>SPOTTER</span><small id="spotter-sync-diagnostic" style="margin-left:14px;color:#8cdbb4;font:600 10px sans-serif;letter-spacing:.04em"></small></div>
  ${spotterCommandBar(step)}
  <div class="spotter-step ${step==='mode'?'active':''}" id="spotterModeStep">
   <section class="spotter-card"><div class="spotter-card-head"><h2>Mode Quick Change</h2></div><div class="spotter-card-body"><button class="spotter-secondary spotter-mobile-kart-mode-link" type="button" onclick="spotterOpenKartModeDialog()">MODE KARTS · <span data-spotter-kart-mode-label>${spotterKartModeLabel()}</span></button><p class="spotter-intro">Choisissez le nombre de files utilisé par le circuit avant de lancer le Spotter.</p><div class="spotter-mode-grid"><button class="spotter-mode-option ${spotterState.mode===1?'active':''}" type="button" onclick="setSpotterMode(1)"><strong>1</strong><span>File</span><small>Verticale</small></button><button class="spotter-mode-option ${spotterState.mode===2?'active':''}" type="button" onclick="setSpotterMode(2)"><strong>2</strong><span>Files</span><small>Côte à côte</small></button><button class="spotter-mode-option ${spotterState.mode===3?'active':''}" type="button" onclick="setSpotterMode(3)"><strong>3</strong><span>Files</span><small>Côte à côte</small></button></div><button class="spotter-secondary spotter-cancel-setup" type="button" onclick="spotterCancelSetup()">ANNULER</button></div></section>
  </div>
  <div class="spotter-step ${step==='queue'?'active':''}" id="spotterQueueStep">
   <section class="spotter-card"><div class="spotter-card-head"><h2>Initialiser ${spotterState.mode>1?'les files':'la file'}</h2><span>${spotterState.setupKarts.length} kart(s)</span></div><div class="spotter-card-body"><p class="spotter-intro">Chaque file possède son propre stock de karts. Un kart est déjà prévu dans chaque file ; utilisez le bouton « Ajouter un kart » situé sous la file concernée pour compléter uniquement cette file.</p><div id="spotterSetupRows">${spotterRenderSetupFiles()}</div><button id="spotterLaunchButton" class="spotter-primary" type="button" onclick="launchSpotterFoundation()">LANCER LE SPOTTER</button><button class="spotter-secondary spotter-cancel-setup" type="button" onclick="spotterCancelSetup()">ANNULER</button></div></section>
  </div>
  <div class="spotter-step ${step==='addkart'?'active':''}" id="spotterAddKartStep">
   <section class="spotter-card"><div class="spotter-card-head"><h2>Ajouter un kart</h2></div><div class="spotter-card-body"><p class="spotter-intro">Ajoutez un ou plusieurs karts remis en service. Chaque colonne correspond à une file, comme dans la préparation Quick Change. Les nouveaux karts sont ajoutés en dernière position.</p>${spotterRenderAddKartFiles()}<button class="spotter-primary" type="button" onclick="spotterConfirmAddKarts()">AJOUTER</button><button class="spotter-secondary spotter-cancel-setup" type="button" onclick="spotterCancelAddKart()">ANNULER</button></div></section>
  </div>
  <div class="spotter-step ${step==='live'?'active':''}" id="spotterLiveStep">
   ${spotterState.freeMode?`<div class="spotter-free-status"><strong>MODE AUTO — SUIVI ESTIMÉ</strong><span>Depuis ${new Date(Number(spotterState.freeStartedAt||Date.now())).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})} · ${spotterState.freePitIns} entrée(s) · ${spotterState.freePitOuts} sortie(s)</span></div>`:''}
   <div class="spotter-live-desktop-layout">
    <div class="spotter-desktop-queues">
     <section class="spotter-card spotter-queue-panel"><div class="spotter-card-body">${spotterRenderQueueColumns()}</div></section>
    </div>
    <aside class="spotter-desktop-sidebar">
     <section class="spotter-card spotter-incoming-panel"><div class="spotter-card-body"><div class="spotter-section-title"><span>Karts entrants</span><span class="spotter-badge">${spotterState.incoming.length}</span></div>${spotterState.incoming.length?`<div class="spotter-incoming-grid">${spotterState.incoming.map(spotterIncomingCard).join('')}</div>`:'<div class="spotter-empty">Aucun kart entrant à valider.</div>'}</div></section>
     <section class="spotter-card spotter-maintenance" data-spotter-drop-zone="maintenance"><div class="spotter-card-body"><div class="spotter-section-title"><span>🔧 ZONE MECA</span><span>${spotterState.maintenance.length}</span></div>${spotterState.maintenance.length?`<div class="spotter-maintenance-grid">${spotterState.maintenance.map(spotterMaintenanceCard).join('')}</div>`:'<div class="spotter-empty">Aucun kart en zone méca.</div>'}</div></section>
    </aside>
   </div>
   <div class="spotter-footer-actions"><button class="spotter-secondary spotter-mobile-kart-mode-link" type="button" onclick="spotterOpenKartModeDialog()">MODE KARTS · <span data-spotter-kart-mode-label>${spotterKartModeLabel()}</span></button><button class="spotter-secondary" type="button" onclick="spotterOpenAddKart()">AJOUTER UN KART</button><button class="spotter-secondary ${spotterState.kartTrackingEnabled?'tracking-active':''}" type="button" onclick="spotterOpenKartRegistry()">${spotterState.kartTrackingEnabled?'● ':''}SUIVI KARTS</button><button class="spotter-secondary" type="button" onclick="resetSpotterFoundation()">RÉINITIALISER</button></div>
  </div>
  <div class="spotter-step ${step==='recalibrate'?'active':''}" id="spotterRecalibrateStep">
   <div class="spotter-recalibrate-desktop-layout">
    <div class="spotter-recalibrate-main">
     <section class="spotter-card spotter-recalibrate-card"><div class="spotter-card-body"><h2>RECALER LA FILE</h2><p>Le mode Auto a continué à suivre la file, mais les attributions restent estimées.</p><div class="spotter-recalibrate-summary"><span>${spotterState.freePitIns} PIT IN</span><span>${spotterState.freePitOuts} PIT OUT</span><span>${spotterFreeDuration()}</span></div></div></section>
     <section class="spotter-card spotter-queue-panel"><div class="spotter-card-body">${spotterRenderQueueColumns()}</div></section>
     <button class="spotter-primary spotter-confirm-recalibration" type="button" onclick="spotterConfirmRecalibration()">✓ VALIDER LE RECALAGE</button>
    </div>
    <aside class="spotter-recalibrate-sidebar">
     <section class="spotter-card"><div class="spotter-card-body"><div class="spotter-section-title"><span>Karts entrants</span><span class="spotter-badge">${spotterState.incoming.length}</span></div>${spotterState.incoming.length?`<div class="spotter-incoming-grid">${spotterState.incoming.map(spotterIncomingCard).join('')}</div>`:'<div class="spotter-empty">Aucun kart entrant à valider.</div>'}</div></section>
     <section class="spotter-card spotter-maintenance" data-spotter-drop-zone="maintenance"><div class="spotter-card-body"><div class="spotter-section-title"><span>🔧 ZONE MECA</span><span>${spotterState.maintenance.length}</span></div>${spotterState.maintenance.length?`<div class="spotter-maintenance-grid">${spotterState.maintenance.map(spotterMaintenanceCard).join('')}</div>`:'<div class="spotter-empty">Aucun kart en zone méca.</div>'}</div></section>
    </aside>
   </div>
  </div>
  ${spotterReplacementOverlay()}
 </div>`;
 spotterUpdateSyncBadge();
}
function spotterDisplayName(value){
 const raw=String(value??'—').trim();
 const resolved=/^apex:\d+$/.test(raw)?spotterAssignmentLabel(raw):raw;
 return String(resolved||'—').replace(/^\s*Kart\s+/i,'').trim()||'—';
}
function spotterOriginLabel(item){return item?.lastTeam&&item.lastTeam!=='Initialisation'?spotterDisplayName(item.lastTeam):spotterDisplayName(item?.apexKart||'—')}
function spotterSelectIncomingQueue(id,file){
 const count=Math.max(1,Math.min(3,Number(spotterState.mode)||1));
 spotterState.incomingQueueSelections[id]=Math.max(1,Math.min(count,Number(file)||1));
 saveSpotterFoundation();spotterRenderCurrent();
}
function spotterSelectIncomingNoQuickChange(id){
 spotterState.incomingQueueSelections[id]='none';
 saveSpotterFoundation();spotterRenderCurrent();
}
function spotterValidateIncomingNoQuickChange(id){
 const index=spotterState.incoming.findIndex(item=>item.id===id);if(index<0)return false;
 const incoming=spotterState.incoming[index];
 spotterRememberUndo();
 spotterState.incoming.splice(index,1);
 delete spotterState.incomingQueueSelections[id];
 const driver=spotterFindDriver(incoming.team);
 const current=spotterEnsureAssignment(incoming.team,driver);
 // L'équipe reste physiquement aux stands : aucun kart n'est réservé, aucune
 // file n'est modifiée. La future transition Apex pit -> track terminera l'arrêt.
 current.status='pit';current.currentTeam=incoming.team;current.pitInAt=incoming.pitInAt||Date.now();current.pendingReplacementKv=null;
 if(incoming.returnedKv)current.kv=incoming.returnedKv;
 if(incoming.returnedKart)current.apexKart=incoming.returnedKart;
 spotterLogMovement('no_quick_change',{team:incoming.team,kv:current.kv});
 saveSpotterFoundation();renderSpotterFoundation('live');return true;
}
function spotterMaintenanceSelectionKey(cardId){return `maintenance:${String(cardId||'')}`}
// Le potentiel Analyzer appartient au KV physique, pas au dernier relais.
// L'absence de potentiel conserve la couleur neutre (jamais 0 par défaut).
function spotterKartPotential(kv){
 const key=String(kv||'').trim();
 if(!key)return null;
 const item=typeof window.velocityKartScoreRankings==='function'
  ?(window.velocityKartScoreRankings()||[]).find(row=>String(row.kv||'')===key):null;
 const live=item?.potential;
 if(spotterValidScore(live))return Number(live);
 const stored=spotterState.kartRegistry?.[key]?.analyzerPotential;
 const epoch=spotterState.kartRegistry?.[key]?.analyzerPotentialEpoch;
 if(String(epoch||'')===String(spotterLiveState()?.kart_scoring_epoch||'')&&spotterValidScore(stored))return Number(stored);
 return null;
}
function spotterSaveAnalyzerPotentials(){
 if(!spotterState.kartTrackingEnabled||typeof window.velocityKartScoreRankings!=='function')return;
 let changed=false;
 const epoch=String(spotterLiveState()?.kart_scoring_epoch||'');
 if(!epoch)return;
 (window.velocityKartScoreRankings()||[]).forEach(item=>{
  if(!item?.kv||!spotterValidScore(item.potential))return;
  const row=spotterRegistryEnsure(item.kv);
  const score=Math.round(Number(item.potential)*10)/10;
  if(row.analyzerPotentialEpoch!==epoch||row.analyzerPotential!==score){
   row.analyzerPotential=score;row.analyzerPotentialEpoch=epoch;changed=true;
  }
 });
 if(changed)spotterScheduleRegistryPush();
}
function spotterDisplayPotential(kv){const value=spotterKartPotential(kv);return value===null?'—':String(Math.round(value*10)/10)}
function spotterQueueColorClass(item){const n=spotterKartPotential(item?.kv);return n===null?'score-unknown':n>=98?'score-gold':n>=90?'score-green':n>=80?'score-orange':'score-red'}
function spotterQueueCard(item,visualState='next'){
 const score=spotterDisplayPotential(item.kv);
 if(item.status==='reserved')return `<div class="spotter-queue-card reserved spotter-draggable ${item.estimated?'estimated':''}" data-spotter-queue-kv="${spotterEscape(item.kv)}" data-spotter-queue-card-id="${spotterEscape(item.cardId||'')}" role="button" aria-label="Maintenir pour déplacer le kart attribué" onpointerdown="spotterStartDrag(event,'${spotterEscapeJs(item.cardId||'')}','queue')"><span class="spotter-team-number">${spotterEscape(spotterTeamNumber({team:item.reservedTeam}))}</span><strong>${spotterEscape(spotterDisplayName(item.reservedTeam))}</strong><small>${spotterEscape(spotterOriginLabel(item))}</small><div class="spotter-card-stats"><span class="spotter-score">${score}</span><span class="spotter-kv-value">${spotterEscape(item.kv)}</span></div><div class="spotter-pit-time" data-spotter-pit-start="${Number(item.pitInAt||Date.now())}">${spotterFormatDuration(Date.now()-Number(item.pitInAt||Date.now()))}</div></div>`;
 const waiting=visualState==='waiting';
 return `<div class="spotter-queue-card available ${waiting?'waiting ':''}${spotterQueueColorClass(item)} spotter-draggable" data-spotter-queue-kv="${spotterEscape(item.kv)}" data-spotter-queue-card-id="${spotterEscape(item.cardId||'')}" role="button" aria-label="Maintenir pour déplacer le kart" onpointerdown="spotterStartDrag(event,'${spotterEscapeJs(item.cardId||'')}','queue')"><span class="spotter-team-number">${spotterEscape(spotterTeamNumber({team:item.lastTeam}))}</span><strong>${spotterEscape(spotterOriginLabel(item))}</strong><div class="spotter-card-stats"><span class="spotter-score">${score}</span><span class="spotter-kv-value">${spotterEscape(item.kv)}</span></div></div>`;
}
function spotterFormatDuration(ms){const total=Math.max(0,Math.floor(Number(ms||0)/1000));const minutes=Math.floor(total/60);const seconds=total%60;return `${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}`}
function spotterTeamNumber(item){
 const driver=spotterFindDriver(item?.team||item?.name);
 const assignment=spotterState.assignments?.[String(item?.team||'')];
 const raw=item?.teamNumber??item?.team_number??item?.number??item?.num??assignment?.teamNumber??driver?.teamNumber??driver?.team_number??driver?.number??driver?.num??driver?.bib;
 if(raw!==undefined&&raw!==null&&String(raw).trim())return String(raw).trim();
 const match=String(item?.team||item?.name||'').trim().match(/^(?:TEAM|ÉQUIPE)?\s*#?([0-9]{1,4})\b/i);
 return match?match[1]:'—';
}
function updateSpotterLiveTimers(){document.querySelectorAll('[data-spotter-pit-start]').forEach(node=>{node.textContent=spotterFormatDuration(Date.now()-Number(node.dataset.spotterPitStart||Date.now()))})}
function spotterIncomingCard(item){
 const selection=spotterState.incomingQueueSelections[item.id];
 const selected=Number(selection)||0;
 const noQuickChange=selection==='none';
 const count=Math.max(1,Math.min(3,Number(spotterState.mode)||1));
 const queueButtons=Array.from({length:count},(_,index)=>{
  const file=index+1;
  return `<button type="button" class="spotter-file-choice ${selected===file?'active':''}" onclick="spotterSelectIncomingQueue('${spotterEscapeJs(item.id)}',${file})" aria-pressed="${selected===file?'true':'false'}">${file}</button>`;
 }).join('')+`<button type="button" class="spotter-file-choice spotter-no-qc-choice ${noQuickChange?'active':''}" onclick="spotterSelectIncomingNoQuickChange('${spotterEscapeJs(item.id)}')" aria-pressed="${noQuickChange?'true':'false'}" title="Pas de Quick Change">✕</button>`;
 const canValidate=Boolean(selected||noQuickChange);
 const validateAction=noQuickChange?`spotterValidateIncomingNoQuickChange('${spotterEscapeJs(item.id)}')`:`spotterValidateIncoming('${spotterEscapeJs(item.id)}',false,{targetFile:${selected||'null'}})`;
 return `<div class="spotter-incoming-card">
  <div class="spotter-incoming-info">
   <span class="spotter-team-number">${spotterEscape(spotterTeamNumber(item))}</span>
   <strong>${spotterEscape(spotterDisplayName(item.name||item.team))}</strong>
   <span class="spotter-score">${spotterDisplayPotential(item.returnedKv)}</span>
   
   <span class="spotter-kv-value">${spotterEscape(item.returnedKv||'—')}</span>
   <div class="spotter-pit-time" data-spotter-pit-start="${Number(item.pitInAt||Date.now())}">${spotterFormatDuration(Date.now()-Number(item.pitInAt||Date.now()))}</div>
  </div>
  <div class="spotter-incoming-control">
   <div class="spotter-file-choices">${queueButtons}</div>
   <div class="spotter-incoming-buttons">
    <button type="button" class="spotter-validate ${canValidate?'ready':''}" onclick="${validateAction}" ${canValidate?'':'disabled'}>VALIDER</button>
    <button type="button" class="spotter-maintenance-btn" onclick="spotterValidateIncoming('${spotterEscapeJs(item.id)}',true)" aria-label="Envoyer en maintenance" title="Maintenance">⚠</button>
   </div>
  </div>
 </div>`;
}
function spotterMaintenanceCard(item){
 const key=spotterMaintenanceSelectionKey(item.cardId||item.kv);
 const selected=Number(spotterState.incomingQueueSelections[key])||0;
 const count=Math.max(1,Math.min(3,Number(spotterState.mode)||1));
 const queueButtons=Array.from({length:count},(_,index)=>{
  const file=index+1;
  return `<button type="button" class="spotter-file-choice ${selected===file?'active':''}" onclick="spotterSelectIncomingQueue('${spotterEscapeJs(key)}',${file})" aria-pressed="${selected===file?'true':'false'}">${file}</button>`;
 }).join('');
 return `<div class="spotter-incoming-card spotter-maintenance-action-card">
  <div class="spotter-incoming-info">
   <span class="spotter-team-number">${spotterEscape(spotterTeamNumber({team:item.lastTeam}))}</span>
   <strong>${spotterEscape(spotterOriginLabel(item))}</strong>
   <span class="spotter-score">${spotterDisplayPotential(item.kv)}</span>
   
   <span class="spotter-kv-value">${spotterEscape(item.kv||'—')}</span>
   <div class="spotter-pit-time" data-spotter-pit-start="${Number(item.enteredAt||Date.now())}">${spotterFormatDuration(Date.now()-Number(item.enteredAt||Date.now()))}</div>
  </div>
  <div class="spotter-incoming-control">
   <div class="spotter-file-choices">${queueButtons}</div>
   <div class="spotter-incoming-buttons maintenance-return-buttons">
    <button type="button" class="spotter-validate ${selected?'ready':''}" onclick="spotterReinsertMaintenance('${spotterEscapeJs(item.cardId||item.kv)}',${selected||'null'})" ${selected?'':'disabled'}>VALIDER</button>
   </div>
  </div>
 </div>`;
}
function spotterEscapeJs(value){return String(value??'').replace(/\\/g,'\\\\').replace(/'/g,"\\'")}
function spotterEscape(value){return String(value??'').replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]))}
async function spotterRenewMonitorLease(){
 if(!spotterState.configured){spotterMonitorLeaseOwner=false;spotterMonitorLeaseUntil=0;return}
 try{
  const response=await fetch('/api/spotter-monitor-lease',{method:'POST',headers:{'Content-Type':'application/json',...((typeof velocityDeviceHeaders==='function')?velocityDeviceHeaders():{})},body:JSON.stringify({client_id:SPOTTER_CLIENT_ID}),cache:'no-store'});
  const data=await response.json();
  spotterMonitorLeaseOwner=Boolean(response.ok&&data.owner);
  spotterMonitorLeaseUntil=spotterMonitorLeaseOwner?Math.min(Number(data.lease_until_ms)||0,Date.now()+4600):0;
  spotterLastMonitorLeaseWorkspace=data.workspace_id||'';
 }catch(_){spotterMonitorLeaseOwner=false;spotterMonitorLeaseUntil=0}
}
document.addEventListener('DOMContentLoaded',()=>{loadSpotterFoundation();spotterPullSharedState({force:true});setInterval(spotterRenewMonitorLease,2000);spotterPullRegistry();setInterval(()=>{if(spotterState.kartTrackingEnabled)spotterPullRegistry()},15000);setInterval(spotterPullSharedState,750);setInterval(updateSpotterLiveTimers,1000);setInterval(spotterRefreshKartRegistry,2000);setInterval(spotterMonitorApex,750);setInterval(()=>{if(spotterState.configured){spotterSaveAnalyzerPotentials();if(spotterRefreshVelocityMetrics()){spotterPublishSharedState();localStorage.setItem(SPOTTER_STORAGE_KEY,JSON.stringify({version:6,appRelease:SPOTTER_APP_RELEASE,savedAt:new Date().toISOString(),state:spotterState}));if(document.body.classList.contains('current-spotter')&&spotterUiStep==='live'&&!spotterUiIsInteractive())spotterRenderCurrent()} }},2000)});
