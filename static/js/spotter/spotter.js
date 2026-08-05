/* Velocity V7.2.3 — Connexion Velocity ↔ Spotter */
const SPOTTER_STORAGE_KEY='velocity_spotter_v7_foundation';
const SPOTTER_APP_RELEASE='7.2.3';
const spotterState={
 version:5,mode:1,setupKarts:['X','Y','Z'],queue:[],maintenance:[],incoming:[],configured:false,
 assignments:{},movementLog:[],nextKvNumber:1,lastDriverStatus:{},monitorPrimed:false,
 freeMode:false,freeStartedAt:null,freePitIns:0,freePitOuts:0,freeNeedsRecalibration:false,recalibrating:false
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
 spotterState.version=5;
 const all=[...(spotterState.queue||[]),...(spotterState.maintenance||[]),...Object.values(spotterState.assignments||{})];
 const max=all.reduce((value,item)=>Math.max(value,spotterKvNumber(item?.kv)),0);
 spotterState.nextKvNumber=Math.max(Number(spotterState.nextKvNumber)||1,max+1);
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
  mode:spotterState.recalibrating?'recalibrating':(spotterState.freeMode?'auto':'live'),
  queue:clone(spotterState.queue||[]),maintenance:clone(spotterState.maintenance||[]),incoming:clone(spotterState.incoming||[]),
  assignments:clone(spotterState.assignments||{}),movement_log:clone((spotterState.movementLog||[]).slice(0,40)),
  free_started_at:spotterState.freeStartedAt||null,pit_ins:Number(spotterState.freePitIns)||0,pit_outs:Number(spotterState.freePitOuts)||0,recalibrating:Boolean(spotterState.recalibrating)
 };
}
async function spotterPushSharedState(){
 try{await fetch('/api/spotter-state',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({spotter:spotterSharedSnapshot()})})}catch(error){console.warn('[Spotter] Synchronisation serveur impossible',error)}
}
function spotterScheduleSharedSync(){clearTimeout(spotterSyncTimer);spotterSyncTimer=setTimeout(spotterPushSharedState,80)}
function saveSpotterFoundation(){
 localStorage.setItem(SPOTTER_STORAGE_KEY,JSON.stringify({version:5,appRelease:SPOTTER_APP_RELEASE,savedAt:new Date().toISOString(),state:spotterState}));
 spotterScheduleSharedSync();
}
function openSpotterSetup(){spotterState.configured=false;saveSpotterFoundation();renderSpotterFoundation('mode')}
function setSpotterMode(mode){if(Number(mode)!==1)return;spotterState.mode=1;saveSpotterFoundation();renderSpotterFoundation('queue')}
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
 const karts=spotterState.setupKarts.filter(kart=>String(kart||'').trim()).map((kart,index)=>({kv:spotterPadKv(index),apexKart:String(kart).trim(),lastTeam:'Initialisation',score:null,confidence:null,status:'available'}));
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
 const index=spotterState.movementLog.filter(item=>item.type==='dev_pit_in').length;
 const team=`Kart ${spotterDefaultKartName(index)}`;const score=78+((index*7)%21);const confidence=64+((index*11)%32);
 if(!spotterState.assignments[team])spotterState.assignments[team]={kv:spotterAllocateKv(),apexKart:spotterDefaultKartName(index),lastTeam:team,currentTeam:team,score,confidence,status:'track'};
 spotterLogMovement('dev_pit_in',{team});spotterAddIncoming(team,null,{source:'dev'});
}
function simulateSpotterPitOut(){
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
function spotterValidateIncoming(id,toMaintenance=false,{silent=false,estimated=false}={}){
 const index=spotterState.incoming.findIndex(item=>item.id===id);if(index<0)return;
 const availableIndex=spotterAvailableIndex();
 if(availableIndex<0){if(!silent)alert('Aucun kart disponible dans la file.');return false}
 const incoming=spotterState.incoming[index];const assigned=spotterState.queue[availableIndex];const current=spotterEnsureAssignment(incoming.team,spotterFindDriver(incoming.team));
 const returned={...current,kv:incoming.returnedKv||current.kv,apexKart:incoming.returnedKart||current.apexKart,lastTeam:incoming.team,currentTeam:null,score:incoming.score??current.score,confidence:incoming.confidence??current.confidence,status:toMaintenance?'maintenance':'available',enteredAt:Date.now()};
 spotterRemoveKvEverywhere(returned.kv);
 assigned.status='reserved';assigned.reservedTeam=incoming.team;assigned.pitInAt=incoming.pitInAt||Date.now();assigned.reservedAt=Date.now();assigned.sourceLastTeam=assigned.lastTeam;assigned.estimated=Boolean(estimated||incoming.estimated||spotterState.freeMode);
 spotterState.incoming.splice(index,1);
 if(toMaintenance)spotterState.maintenance.push(returned);else spotterState.queue.push(returned);
 current.status='pit';current.pendingReplacementKv=assigned.kv;
 spotterLogMovement(toMaintenance?'validate_maintenance':'validate',{team:incoming.team,receivedKv:assigned.kv,returnedKv:returned.kv,estimated:Boolean(assigned.estimated)});
 saveSpotterFoundation();if(!silent)renderSpotterFoundation('live');return true;
}
function spotterReinsertMaintenance(kv){
 const index=spotterState.maintenance.findIndex(item=>item.kv===kv);if(index<0)return;
 const [item]=spotterState.maintenance.splice(index,1);item.status='available';item.reinsertedAt=Date.now();spotterState.queue.push(item);
 spotterLogMovement('maintenance_reinsert',{kv});saveSpotterFoundation();spotterRenderCurrent();
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
function spotterCommandBar(step){
 if(step==='live'&&spotterState.freeMode&&!spotterState.recalibrating)return `<div class="spotter-command-bar free-active"><button class="spotter-back" type="button" onclick="showHome()" aria-label="Retour accueil">☰</button><button class="spotter-resume-main" type="button" onclick="spotterRequestResume()">▶ REPRENDRE LE SUIVI</button><button class="spotter-icon-btn" type="button" onclick="openSpotterSetup()" aria-label="Configurer">⚙</button></div>`;
 if(step==='live')return `<div class="spotter-command-bar live-mode"><button class="spotter-back" type="button" onclick="showHome()" aria-label="Retour accueil">☰</button><span class="spotter-live-state">LIVE</span><div class="spotter-command-title">SORTIE</div><button class="spotter-free-button" type="button" onclick="spotterActivateFree()">AUTO</button><button class="spotter-icon-btn" type="button" onclick="openSpotterSetup()" aria-label="Configurer">⚙</button></div>`;
 return `<div class="spotter-command-bar"><button class="spotter-back" type="button" onclick="showHome()" aria-label="Retour accueil">☰</button><div class="spotter-command-title">SORTIE</div><button class="spotter-icon-btn" type="button" onclick="openSpotterSetup()" aria-label="Configurer">⚙</button></div>`;
}

function spotterRenderCurrent(){renderSpotterFoundation(spotterState.recalibrating?'recalibrate':'live')}

const spotterDrag={kv:null,from:null,pointerId:null,ghost:null};
function spotterQueueMovable(item){return item&&item.status==='available'}
function spotterStartDrag(event,kv,from){
 if(event.button!==undefined&&event.button!==0)return;
 const source=(from==='queue'?spotterState.queue:spotterState.maintenance).find(item=>item.kv===kv);
 if(!source||!spotterQueueMovable(source))return;
 event.preventDefault();
 spotterDrag.kv=kv;spotterDrag.from=from;spotterDrag.pointerId=event.pointerId;
 const card=event.currentTarget;card.classList.add('dragging');
 try{card.setPointerCapture(event.pointerId)}catch(_){ }
 const ghost=card.cloneNode(true);ghost.classList.add('spotter-drag-ghost');ghost.style.width=`${card.getBoundingClientRect().width}px`;
 document.body.appendChild(ghost);spotterDrag.ghost=ghost;spotterMoveGhost(event.clientX,event.clientY);
 document.addEventListener('pointermove',spotterOnDragMove,{passive:false});
 document.addEventListener('pointerup',spotterEndDrag,{once:true});
 document.addEventListener('pointercancel',spotterEndDrag,{once:true});
}
function spotterMoveGhost(x,y){if(spotterDrag.ghost){spotterDrag.ghost.style.left=`${x}px`;spotterDrag.ghost.style.top=`${y}px`}}
function spotterOnDragMove(event){
 if(spotterDrag.pointerId!==null&&event.pointerId!==spotterDrag.pointerId)return;
 event.preventDefault();spotterMoveGhost(event.clientX,event.clientY);
 document.querySelectorAll('.spotter-drop-target,.spotter-drop-before').forEach(node=>node.classList.remove('spotter-drop-target','spotter-drop-before'));
 const element=document.elementFromPoint(event.clientX,event.clientY);
 const maintenance=element?.closest('[data-spotter-drop-zone="maintenance"]');
 if(maintenance){maintenance.classList.add('spotter-drop-target');return}
 const queue=element?.closest('[data-spotter-drop-zone="queue"]');
 const endZone=element?.closest('[data-spotter-drop-end="queue"]');
 const card=element?.closest('[data-spotter-queue-kv]');
 if(endZone){endZone.classList.add('spotter-drop-target');return}
 if(card&&card.dataset.spotterQueueKv!==spotterDrag.kv)card.classList.add('spotter-drop-before');
 else if(queue)queue.classList.add('spotter-drop-target');
}
function spotterEndDrag(event){
 document.removeEventListener('pointermove',spotterOnDragMove);
 const element=document.elementFromPoint(event.clientX,event.clientY);
 const maintenance=element?.closest('[data-spotter-drop-zone="maintenance"]');
 const queueCard=element?.closest('[data-spotter-queue-kv]');
 const queueEnd=element?.closest('[data-spotter-drop-end="queue"]');
 const queue=element?.closest('[data-spotter-drop-zone="queue"]');
 if(maintenance)spotterMoveKartToMaintenance(spotterDrag.kv,spotterDrag.from);
 else if(queueEnd)spotterMoveKartInQueue(spotterDrag.kv,spotterDrag.from,null);
 else if(queueCard||queue)spotterMoveKartInQueue(spotterDrag.kv,spotterDrag.from,queueCard?.dataset.spotterQueueKv||null);
 document.querySelectorAll('.dragging,.spotter-drop-target,.spotter-drop-before').forEach(node=>node.classList.remove('dragging','spotter-drop-target','spotter-drop-before'));
 spotterDrag.ghost?.remove();Object.assign(spotterDrag,{kv:null,from:null,pointerId:null,ghost:null});
}
function spotterMoveKartInQueue(kv,from,beforeKv=null){
 let item=null;
 if(from==='queue'){
  const index=spotterState.queue.findIndex(entry=>entry.kv===kv&&entry.status==='available');if(index<0)return;
  [item]=spotterState.queue.splice(index,1);
 }else{
  const index=spotterState.maintenance.findIndex(entry=>entry.kv===kv);if(index<0)return;
  [item]=spotterState.maintenance.splice(index,1);item.status='available';item.reinsertedAt=Date.now();
 }
 let target=beforeKv?spotterState.queue.findIndex(entry=>entry.kv===beforeKv):-1;
 if(target<0)target=spotterState.queue.length;
 // Une carte verte ne peut pas passer devant une carte rouge déjà attribuée.
 const firstAvailable=spotterState.queue.findIndex(entry=>entry.status==='available');
 if(firstAvailable>=0)target=Math.max(target,firstAvailable);
 spotterState.queue.splice(target,0,item);
 spotterLogMovement('manual_reorder',{kv,from,to:'queue',beforeKv});saveSpotterFoundation();spotterRenderCurrent();
}
function spotterMoveKartToMaintenance(kv,from){
 if(from!=='queue')return;
 const index=spotterState.queue.findIndex(entry=>entry.kv===kv&&entry.status==='available');if(index<0)return;
 const [item]=spotterState.queue.splice(index,1);item.status='maintenance';item.enteredAt=Date.now();spotterState.maintenance.push(item);
 spotterLogMovement('manual_maintenance',{kv});saveSpotterFoundation();spotterRenderCurrent();
}
function renderSpotterFoundation(forceStep){
 const root=document.getElementById('spotterApp');if(!root)return;
 const step=forceStep||(spotterState.configured?(spotterState.recalibrating?'recalibrate':'live'):'mode');
 root.innerHTML=`<div class="spotter-shell">
  <div class="spotter-top-accent" aria-hidden="true"></div>${spotterCommandBar(step)}
  <div class="spotter-step ${step==='mode'?'active':''}" id="spotterModeStep">
   <section class="spotter-card"><div class="spotter-card-head"><h2>Mode Quick Change</h2></div><div class="spotter-card-body"><p class="spotter-intro">Choisissez le nombre de files utilisé par le circuit avant de lancer le Spotter.</p><div class="spotter-mode-grid"><button class="spotter-mode-option active" type="button" onclick="setSpotterMode(1)"><strong>1</strong><span>File</span><small>Disponible</small></button><button class="spotter-mode-option" type="button" disabled><strong>2</strong><span>Files</span><small>Bientôt</small></button><button class="spotter-mode-option" type="button" disabled><strong>3</strong><span>Files</span><small>Bientôt</small></button></div></div></section>
  </div>
  <div class="spotter-step ${step==='queue'?'active':''}" id="spotterQueueStep">
   <section class="spotter-card"><div class="spotter-card-head"><h2>Initialiser la file</h2><span>${spotterState.setupKarts.length} kart(s)</span></div><div class="spotter-card-body"><p class="spotter-intro">Saisissez les karts présents dans la file au départ. Velocity attribue automatiquement les identifiants KV dans cet ordre.</p><div id="spotterSetupRows">${spotterState.setupKarts.map((kart,index)=>`<div class="spotter-setup-row"><div class="spotter-kv">${spotterPadKv(index)}</div><input autocomplete="off" value="${spotterEscape(kart)}" placeholder="Nom du kart" oninput="updateSpotterSetupKart(${index},this.value)"><button class="spotter-remove" type="button" onclick="removeSpotterSetupKart(${index})" aria-label="Supprimer">×</button></div>`).join('')}</div><button class="spotter-add-row" type="button" onclick="addSpotterSetupKart()">＋ AJOUTER UN KART</button><button id="spotterLaunchButton" class="spotter-primary" type="button" onclick="launchSpotterFoundation()" ${spotterState.setupKarts.some(Boolean)?'':'disabled'}>LANCER LE SPOTTER</button></div></section>
  </div>
  <div class="spotter-step ${step==='live'?'active':''}" id="spotterLiveStep">
   ${spotterState.freeMode?`<div class="spotter-free-status"><strong>MODE AUTO — SUIVI ESTIMÉ</strong><span>Depuis ${new Date(Number(spotterState.freeStartedAt||Date.now())).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})} · ${spotterState.freePitIns} entrée(s) · ${spotterState.freePitOuts} sortie(s)</span></div>`:''}
   <section class="spotter-card spotter-queue-panel"><div class="spotter-card-body"><div class="spotter-queue" data-spotter-drop-zone="queue">${spotterState.queue.length?spotterState.queue.map(spotterQueueCard).join(''):'<div class="spotter-empty">Aucun kart dans la file.</div>'}<div class="spotter-queue-end-drop" data-spotter-drop-end="queue" aria-label="Déposer en fin de file"><span>FIN DE FILE</span></div></div></div></section>
   <section class="spotter-card"><div class="spotter-card-body"><div class="spotter-section-title"><span>Karts entrants</span><span class="spotter-badge">${spotterState.incoming.length}</span></div>${spotterState.incoming.length?`<div class="spotter-incoming-grid">${spotterState.incoming.map(spotterIncomingCard).join('')}</div>`:'<div class="spotter-empty">Aucun kart entrant à valider.</div>'}</div></section>
   <section class="spotter-card spotter-maintenance" data-spotter-drop-zone="maintenance"><div class="spotter-card-body"><div class="spotter-section-title"><span>🔧 Maintenance</span><span>${spotterState.maintenance.length}</span></div>${spotterState.maintenance.length?`<div class="spotter-maintenance-grid">${spotterState.maintenance.map(spotterMaintenanceCard).join('')}</div>`:'<div class="spotter-empty">Aucun kart en maintenance.</div>'}</div></section>
   <div class="spotter-footer-actions"><button class="spotter-secondary" type="button" onclick="renderSpotterFoundation('queue')">MODIFIER LA FILE</button><button class="spotter-secondary" type="button" onclick="resetSpotterFoundation()">RÉINITIALISER</button></div>
  </div>
  <div class="spotter-step ${step==='recalibrate'?'active':''}" id="spotterRecalibrateStep">
   <section class="spotter-card spotter-recalibrate-card"><div class="spotter-card-body"><h2>RECALER LA FILE</h2><p>Le mode Auto a continué à suivre la file, mais les attributions restent estimées.</p><div class="spotter-recalibrate-summary"><span>${spotterState.freePitIns} PIT IN</span><span>${spotterState.freePitOuts} PIT OUT</span><span>${spotterFreeDuration()}</span></div></div></section>
   <section class="spotter-card spotter-queue-panel"><div class="spotter-card-body"><div class="spotter-queue" data-spotter-drop-zone="queue">${spotterState.queue.length?spotterState.queue.map(spotterQueueCard).join(''):'<div class="spotter-empty">Aucun kart dans la file.</div>'}<div class="spotter-queue-end-drop" data-spotter-drop-end="queue"><span>FIN DE FILE</span></div></div></div></section>
   <button class="spotter-primary spotter-confirm-recalibration" type="button" onclick="spotterConfirmRecalibration()">✓ VALIDER LE RECALAGE</button>
   <section class="spotter-card"><div class="spotter-card-body"><div class="spotter-section-title"><span>Karts entrants</span><span class="spotter-badge">${spotterState.incoming.length}</span></div>${spotterState.incoming.length?`<div class="spotter-incoming-grid">${spotterState.incoming.map(spotterIncomingCard).join('')}</div>`:'<div class="spotter-empty">Aucun kart entrant à valider.</div>'}</div></section>
   <section class="spotter-card spotter-maintenance" data-spotter-drop-zone="maintenance"><div class="spotter-card-body"><div class="spotter-section-title"><span>🔧 Maintenance</span><span>${spotterState.maintenance.length}</span></div>${spotterState.maintenance.length?`<div class="spotter-maintenance-grid">${spotterState.maintenance.map(spotterMaintenanceCard).join('')}</div>`:'<div class="spotter-empty">Aucun kart en maintenance.</div>'}</div></section>
  </div>
 </div>`;
}
function spotterOriginLabel(item){return item?.lastTeam&&item.lastTeam!=='Initialisation'?String(item.lastTeam):`Kart ${item?.apexKart||'—'}`}
function spotterQueueCard(item){
 const score=item.score==null?'—':item.score,confidence=item.confidence==null?'—':`${item.confidence}%`;
 if(item.status==='reserved')return `<div class="spotter-queue-card reserved ${item.estimated?'estimated':''}"><strong>${spotterEscape(item.reservedTeam)}</strong><small>${spotterEscape(spotterOriginLabel(item))}</small><div class="spotter-card-stats"><span>${spotterEscape(item.kv)}</span><span>Score : ${score}</span><span>Conf. : ${confidence}</span></div><div class="spotter-pit-time" data-spotter-pit-start="${Number(item.pitInAt||Date.now())}">${spotterFormatDuration(Date.now()-Number(item.pitInAt||Date.now()))}</div></div>`;
 return `<div class="spotter-queue-card available spotter-draggable" data-spotter-queue-kv="${spotterEscape(item.kv)}" onpointerdown="spotterStartDrag(event,'${spotterEscapeJs(item.kv)}','queue')"><strong>${spotterEscape(spotterOriginLabel(item))}</strong><div class="spotter-card-stats"><span>${spotterEscape(item.kv)}</span><span>Score : ${score}</span><span>Conf. : ${confidence}</span></div></div>`;
}
function spotterFormatDuration(ms){const total=Math.max(0,Math.floor(Number(ms||0)/1000));const minutes=Math.floor(total/60);const seconds=total%60;return `${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}`}
function updateSpotterLiveTimers(){document.querySelectorAll('[data-spotter-pit-start]').forEach(node=>{node.textContent=spotterFormatDuration(Date.now()-Number(node.dataset.spotterPitStart||Date.now()))})}
function spotterIncomingCard(item){
 return `<div class="spotter-queue-card incoming"><strong>${spotterEscape(item.name||item.team)}</strong><div class="spotter-card-stats"><span>${spotterEscape(item.returnedKv||'—')}</span><span>Score : ${item.score??'—'}</span></div><div class="spotter-pit-time" data-spotter-pit-start="${Number(item.pitInAt||Date.now())}">${spotterFormatDuration(Date.now()-Number(item.pitInAt||Date.now()))}</div><div class="spotter-incoming-actions"><button type="button" class="spotter-validate" onclick="spotterValidateIncoming('${spotterEscapeJs(item.id)}',false)" aria-label="Valider">✓</button><button type="button" class="spotter-maintenance-btn" onclick="spotterValidateIncoming('${spotterEscapeJs(item.id)}',true)" aria-label="Maintenance">⚠</button></div></div>`;
}
function spotterMaintenanceCard(item){
 return `<div class="spotter-queue-card maintenance spotter-draggable" onpointerdown="spotterStartDrag(event,'${spotterEscapeJs(item.kv)}','maintenance')"><strong>${spotterEscape(spotterOriginLabel(item))}</strong><div class="spotter-card-stats"><span>${spotterEscape(item.kv)}</span><span>Score : ${item.score??'—'}</span></div><button type="button" class="spotter-reinsert" onclick="event.stopPropagation();spotterReinsertMaintenance('${spotterEscapeJs(item.kv)}')">↩ FIN DE FILE</button></div>`;
}
function spotterEscapeJs(value){return String(value??'').replace(/\\/g,'\\\\').replace(/'/g,"\\'")}
function spotterEscape(value){return String(value??'').replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]))}
document.addEventListener('DOMContentLoaded',()=>{loadSpotterFoundation();setInterval(updateSpotterLiveTimers,1000);setInterval(spotterMonitorApex,750);setInterval(()=>{if(spotterState.configured){spotterRefreshVelocityMetrics();spotterPushSharedState()}},2000)});
