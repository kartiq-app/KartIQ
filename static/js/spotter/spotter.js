/* Velocity V7.1.1 — Correctif initialisation FIFO Spotter */
const SPOTTER_STORAGE_KEY='velocity_spotter_v7_foundation';
const spotterState={
 version:3,mode:1,setupKarts:['X','Y','Z'],queue:[],maintenance:[],incoming:[],configured:false,
 assignments:{},movementLog:[],nextKvNumber:1,lastDriverStatus:{},monitorPrimed:false
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
 spotterState.version=3;
 const all=[...(spotterState.queue||[]),...(spotterState.maintenance||[]),...Object.values(spotterState.assignments||{})];
 const max=all.reduce((value,item)=>Math.max(value,spotterKvNumber(item?.kv)),0);
 spotterState.nextKvNumber=Math.max(Number(spotterState.nextKvNumber)||1,max+1);
}
function loadSpotterFoundation(){
 try{
  const saved=JSON.parse(localStorage.getItem(SPOTTER_STORAGE_KEY)||'null');
  if(saved?.state)Object.assign(spotterState,saved.state);
 }catch(_){ }
 spotterEnsureSetupDefaults();renderSpotterFoundation();
}
function saveSpotterFoundation(){
 localStorage.setItem(SPOTTER_STORAGE_KEY,JSON.stringify({version:3,savedAt:new Date().toISOString(),state:spotterState}));
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
 spotterState.queue=karts;spotterState.incoming=[];spotterState.maintenance=[];spotterState.assignments=seeded.assignments;spotterState.nextKvNumber=seeded.next;spotterState.movementLog=[];spotterState.lastDriverStatus={};spotterState.monitorPrimed=false;spotterState.configured=true;
 saveSpotterFoundation();renderSpotterFoundation('live');
}
function resetSpotterFoundation(){
 if(!confirm('Réinitialiser la configuration Spotter ?'))return;
 Object.assign(spotterState,{mode:1,setupKarts:['X','Y','Z'],queue:[],maintenance:[],incoming:[],assignments:{},movementLog:[],nextKvNumber:1,lastDriverStatus:{},monitorPrimed:false,configured:false});
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
 spotterState.incoming.push({id:`${source}-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,team:key,name:key,returnedKv:assignment.kv,returnedKart:assignment.apexKart,score:assignment.score,confidence:assignment.confidence,pitInAt:Date.now(),status:'incoming',source});
 spotterLogMovement('pit_in',{team:key,kv:assignment.kv,source});
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
function spotterValidateIncoming(id,toMaintenance=false){
 const index=spotterState.incoming.findIndex(item=>item.id===id);if(index<0)return;
 const availableIndex=spotterAvailableIndex();
 if(availableIndex<0){alert('Aucun kart disponible dans la file.');return}
 const incoming=spotterState.incoming[index];const assigned=spotterState.queue[availableIndex];const current=spotterEnsureAssignment(incoming.team,spotterFindDriver(incoming.team));
 const returned={...current,kv:incoming.returnedKv||current.kv,apexKart:incoming.returnedKart||current.apexKart,lastTeam:incoming.team,currentTeam:null,score:incoming.score??current.score,confidence:incoming.confidence??current.confidence,status:toMaintenance?'maintenance':'available',enteredAt:Date.now()};
 spotterRemoveKvEverywhere(returned.kv);
 assigned.status='reserved';assigned.reservedTeam=incoming.team;assigned.pitInAt=incoming.pitInAt||Date.now();assigned.reservedAt=Date.now();assigned.sourceLastTeam=assigned.lastTeam;
 spotterState.incoming.splice(index,1);
 if(toMaintenance)spotterState.maintenance.push(returned);else spotterState.queue.push(returned);
 current.status='pit';current.pendingReplacementKv=assigned.kv;
 spotterLogMovement(toMaintenance?'validate_maintenance':'validate',{team:incoming.team,receivedKv:assigned.kv,returnedKv:returned.kv});
 saveSpotterFoundation();renderSpotterFoundation('live');
}
function spotterReinsertMaintenance(kv){
 const index=spotterState.maintenance.findIndex(item=>item.kv===kv);if(index<0)return;
 const [item]=spotterState.maintenance.splice(index,1);item.status='available';item.reinsertedAt=Date.now();spotterState.queue.push(item);
 spotterLogMovement('maintenance_reinsert',{kv});saveSpotterFoundation();renderSpotterFoundation('live');
}
function spotterProcessPitOut(team,{source='apex'}={}){
 const key=String(team||'').trim();const index=spotterState.queue.findIndex(item=>item.status==='reserved'&&item.reservedTeam===key);if(index<0)return false;
 const [assigned]=spotterState.queue.splice(index,1);const driver=spotterFindDriver(key);const metrics=spotterMetricsForDriver(driver);
 spotterState.assignments[key]={...assigned,currentTeam:key,lastTeam:assigned.sourceLastTeam||assigned.lastTeam,status:'track',reservedTeam:null,pitInAt:null,reservedAt:null,score:assigned.score??metrics.score,confidence:assigned.confidence??metrics.confidence,apexKart:String(driver?.apex||driver?.kart||assigned.apexKart||'—')};
 spotterLogMovement('pit_out',{team:key,kv:assigned.kv,source});saveSpotterFoundation();renderSpotterFoundation('live');return true;
}
function spotterMonitorApex(){
 if(!spotterState.configured)return;
 const drivers=(window.state?.drivers||[]).filter(driver=>spotterDriverKey(driver));
 if(!drivers.length)return;
 if(!spotterState.monitorPrimed){
  drivers.forEach(driver=>{spotterState.lastDriverStatus[spotterDriverKey(driver)]=String(driver.status||'unknown').toLowerCase()});
  spotterState.monitorPrimed=true;saveSpotterFoundation();return;
 }
 let changed=false;
 drivers.forEach(driver=>{
  const team=spotterDriverKey(driver),status=String(driver.status||'unknown').toLowerCase(),previous=spotterState.lastDriverStatus[team];
  if(previous&&previous!=='pit'&&status==='pit')changed=spotterAddIncoming(team,driver,{source:'apex'})||changed;
  if(previous==='pit'&&status==='track')changed=spotterProcessPitOut(team,{source:'apex'})||changed;
  spotterState.lastDriverStatus[team]=status;
 });
 if(changed)saveSpotterFoundation();
}
function renderSpotterFoundation(forceStep){
 const root=document.getElementById('spotterApp');if(!root)return;
 const step=forceStep||(spotterState.configured?'live':'mode');
 root.innerHTML=`<div class="spotter-shell">
  <div class="spotter-topbar"><button class="spotter-back" type="button" onclick="showHome()" aria-label="Retour accueil">☰</button><div class="spotter-title">Spotter</div><button class="spotter-icon-btn" type="button" onclick="openSpotterSetup()" aria-label="Configurer">⚙</button></div>
  <div class="spotter-step ${step==='mode'?'active':''}" id="spotterModeStep">
   <section class="spotter-card"><div class="spotter-card-head"><h2>Mode Quick Change</h2></div><div class="spotter-card-body"><p class="spotter-intro">Choisissez le nombre de files utilisé par le circuit avant de lancer le Spotter.</p><div class="spotter-mode-grid"><button class="spotter-mode-option active" type="button" onclick="setSpotterMode(1)"><strong>1</strong><span>File</span><small>Disponible</small></button><button class="spotter-mode-option" type="button" disabled><strong>2</strong><span>Files</span><small>Bientôt</small></button><button class="spotter-mode-option" type="button" disabled><strong>3</strong><span>Files</span><small>Bientôt</small></button></div></div></section>
  </div>
  <div class="spotter-step ${step==='queue'?'active':''}" id="spotterQueueStep">
   <section class="spotter-card"><div class="spotter-card-head"><h2>Initialiser la file</h2><span>${spotterState.setupKarts.length} kart(s)</span></div><div class="spotter-card-body"><p class="spotter-intro">Saisissez les karts présents dans la file au départ. Velocity attribue automatiquement les identifiants KV dans cet ordre.</p><div id="spotterSetupRows">${spotterState.setupKarts.map((kart,index)=>`<div class="spotter-setup-row"><div class="spotter-kv">${spotterPadKv(index)}</div><input autocomplete="off" value="${spotterEscape(kart)}" placeholder="Nom du kart" oninput="updateSpotterSetupKart(${index},this.value)"><button class="spotter-remove" type="button" onclick="removeSpotterSetupKart(${index})" aria-label="Supprimer">×</button></div>`).join('')}</div><button class="spotter-add-row" type="button" onclick="addSpotterSetupKart()">＋ AJOUTER UN KART</button><button id="spotterLaunchButton" class="spotter-primary" type="button" onclick="launchSpotterFoundation()" ${spotterState.setupKarts.some(Boolean)?'':'disabled'}>LANCER LE SPOTTER</button></div></section>
  </div>
  <div class="spotter-step ${step==='live'?'active':''}" id="spotterLiveStep">
   <div class="spotter-flow-label">SORTIE</div><div class="spotter-flow-arrow">▲</div>
   <section class="spotter-card spotter-queue-panel"><div class="spotter-card-body"><div class="spotter-queue">${spotterState.queue.length?spotterState.queue.map(spotterQueueCard).join(''):'<div class="spotter-empty">Aucun kart dans la file.</div>'}</div></div></section>
   <section class="spotter-card"><div class="spotter-card-body"><div class="spotter-section-title"><span>Karts entrants</span><span class="spotter-badge">${spotterState.incoming.length}</span></div>${spotterState.incoming.length?`<div class="spotter-incoming-grid">${spotterState.incoming.map(spotterIncomingCard).join('')}</div>`:'<div class="spotter-empty">Aucun kart entrant à valider.</div>'}</div></section>
   <section class="spotter-card spotter-maintenance"><div class="spotter-card-body"><div class="spotter-section-title"><span>🔧 Maintenance</span><span>${spotterState.maintenance.length}</span></div>${spotterState.maintenance.length?`<div class="spotter-maintenance-grid">${spotterState.maintenance.map(spotterMaintenanceCard).join('')}</div>`:'<div class="spotter-empty">Aucun kart en maintenance.</div>'}</div></section>
   <div class="spotter-footer-actions"><button class="spotter-secondary" type="button" onclick="renderSpotterFoundation('queue')">MODIFIER LA FILE</button><button class="spotter-secondary" type="button" onclick="resetSpotterFoundation()">RÉINITIALISER</button></div>
  </div>
 </div>`;
}
function spotterOriginLabel(item){return item?.lastTeam&&item.lastTeam!=='Initialisation'?`Kart de ${item.lastTeam}`:`Kart ${item?.apexKart||'—'}`}
function spotterQueueCard(item){
 const score=item.score==null?'—':item.score,confidence=item.confidence==null?'—':`${item.confidence}%`;
 if(item.status==='reserved')return `<div class="spotter-queue-card reserved"><strong>${spotterEscape(item.reservedTeam)}</strong><small>${spotterEscape(spotterOriginLabel(item))}</small><div class="spotter-card-stats"><span>${spotterEscape(item.kv)}</span><span>Score : ${score}</span><span>Conf. : ${confidence}</span></div><div class="spotter-pit-time" data-spotter-pit-start="${Number(item.pitInAt||Date.now())}">${spotterFormatDuration(Date.now()-Number(item.pitInAt||Date.now()))}</div></div>`;
 return `<div class="spotter-queue-card available"><strong>${spotterEscape(spotterOriginLabel(item))}</strong><div class="spotter-card-stats"><span>${spotterEscape(item.kv)}</span><span>Score : ${score}</span><span>Conf. : ${confidence}</span></div></div>`;
}
function spotterFormatDuration(ms){const total=Math.max(0,Math.floor(Number(ms||0)/1000));const minutes=Math.floor(total/60);const seconds=total%60;return `${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}`}
function updateSpotterLiveTimers(){document.querySelectorAll('[data-spotter-pit-start]').forEach(node=>{node.textContent=spotterFormatDuration(Date.now()-Number(node.dataset.spotterPitStart||Date.now()))})}
function spotterIncomingCard(item){
 return `<div class="spotter-queue-card incoming"><strong>${spotterEscape(item.name||item.team)}</strong><div class="spotter-card-stats"><span>${spotterEscape(item.returnedKv||'—')}</span><span>Score : ${item.score??'—'}</span></div><div class="spotter-pit-time" data-spotter-pit-start="${Number(item.pitInAt||Date.now())}">${spotterFormatDuration(Date.now()-Number(item.pitInAt||Date.now()))}</div><div class="spotter-incoming-actions"><button type="button" class="spotter-validate" onclick="spotterValidateIncoming('${spotterEscapeJs(item.id)}',false)" aria-label="Valider">✓</button><button type="button" class="spotter-maintenance-btn" onclick="spotterValidateIncoming('${spotterEscapeJs(item.id)}',true)" aria-label="Maintenance">⚠</button></div></div>`;
}
function spotterMaintenanceCard(item){
 return `<div class="spotter-queue-card maintenance"><strong>${spotterEscape(spotterOriginLabel(item))}</strong><div class="spotter-card-stats"><span>${spotterEscape(item.kv)}</span><span>Score : ${item.score??'—'}</span></div><button type="button" class="spotter-reinsert" onclick="spotterReinsertMaintenance('${spotterEscapeJs(item.kv)}')">↩ FIN DE FILE</button></div>`;
}
function spotterEscapeJs(value){return String(value??'').replace(/\\/g,'\\\\').replace(/'/g,"\\'")}
function spotterEscape(value){return String(value??'').replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]))}
document.addEventListener('DOMContentLoaded',()=>{loadSpotterFoundation();setInterval(updateSpotterLiveTimers,1000);setInterval(spotterMonitorApex,750)});
