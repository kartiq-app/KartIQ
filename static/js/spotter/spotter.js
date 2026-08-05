/* Velocity V7.0.2 — Spotter Foundation */
const SPOTTER_STORAGE_KEY='velocity_spotter_v7_foundation';
const spotterState={mode:1,setupKarts:['X','Y','Z'],queue:[],maintenance:[],incoming:[],configured:false};
function spotterPadKv(index){return `KV${String(index+1).padStart(2,'0')}`}
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
}
function loadSpotterFoundation(){
 try{const saved=JSON.parse(localStorage.getItem(SPOTTER_STORAGE_KEY)||'null');if(saved&&saved.version===1){Object.assign(spotterState,saved.state||{})}}catch(_){ }
 spotterEnsureSetupDefaults();renderSpotterFoundation();
}
function saveSpotterFoundation(){localStorage.setItem(SPOTTER_STORAGE_KEY,JSON.stringify({version:1,savedAt:new Date().toISOString(),state:spotterState}))}
function openSpotterSetup(){spotterState.configured=false;renderSpotterFoundation('mode')}
function setSpotterMode(mode){if(Number(mode)!==1)return;spotterState.mode=1;saveSpotterFoundation();renderSpotterFoundation('queue')}
function addSpotterSetupKart(){spotterState.setupKarts.push(spotterDefaultKartName(spotterState.setupKarts.length));renderSpotterFoundation('queue');setTimeout(()=>document.querySelector('.spotter-setup-row:last-of-type input')?.focus(),0)}
function removeSpotterSetupKart(index){if(spotterState.setupKarts.length<=1)return;spotterState.setupKarts.splice(index,1);renderSpotterFoundation('queue')}
function updateSpotterSetupKart(index,value){spotterState.setupKarts[index]=String(value||'').trim().slice(0,12);saveSpotterFoundation();const btn=document.getElementById('spotterLaunchButton');if(btn)btn.disabled=!spotterState.setupKarts.some(Boolean)}
function launchSpotterFoundation(){
 const karts=spotterState.setupKarts.filter(kart=>String(kart||'').trim()).map((kart,index)=>({kv:spotterPadKv(index),apexKart:String(kart).trim(),lastTeam:'Initialisation',score:null,confidence:null,status:'available'}));
 if(!karts.length)return;
 spotterState.queue=karts;spotterState.incoming=[];spotterState.maintenance=[];spotterState.configured=true;saveSpotterFoundation();renderSpotterFoundation('live');
}
function resetSpotterFoundation(){if(!confirm('Réinitialiser la configuration Spotter ?'))return;spotterState.mode=1;spotterState.setupKarts=['X','Y','Z'];spotterState.queue=[];spotterState.maintenance=[];spotterState.incoming=[];spotterState.configured=false;saveSpotterFoundation();renderSpotterFoundation('mode')}
function simulateSpotterPitIn(){
 const index=spotterState.incoming.length;
 const name=`Kart ${spotterDefaultKartName(index)}`;
 const score=78+((index*7)%21);
 const confidence=64+((index*11)%32);
 const kv=spotterPadKv(spotterState.queue.length+spotterState.maintenance.length+index);
 spotterState.incoming.push({id:`dev-${Date.now()}-${index}`,name,kv,score,confidence,pitInAt:Date.now(),status:'incoming'});
 spotterState.configured=true;saveSpotterFoundation();renderSpotterFoundation('live');
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
   <section class="spotter-card spotter-maintenance"><div class="spotter-card-body"><div class="spotter-section-title"><span>🔧 Maintenance</span><span>${spotterState.maintenance.length}</span></div>${spotterState.maintenance.length?'<div class="spotter-empty">Gestion de maintenance disponible en V7.1.</div>':'<div class="spotter-empty">Aucun kart en maintenance.</div>'}</div></section>
   <div class="spotter-footer-actions"><button class="spotter-secondary" type="button" onclick="renderSpotterFoundation('queue')">MODIFIER LA FILE</button><button class="spotter-secondary" type="button" onclick="resetSpotterFoundation()">RÉINITIALISER</button></div>
  </div>
 </div>`;
}
function spotterQueueCard(item){
 const label=item.lastTeam&&item.lastTeam!=='Initialisation'?`Kart de ${item.lastTeam}`:`Kart ${item.apexKart}`;
 const score=item.score==null?'—':item.score;
 return `<div class="spotter-queue-card available"><strong>${spotterEscape(label)}</strong><div class="spotter-card-stats"><span>${spotterEscape(item.kv)}</span><span>Score : ${score}</span></div></div>`;
}
function spotterFormatDuration(ms){const total=Math.max(0,Math.floor(Number(ms||0)/1000));const minutes=Math.floor(total/60);const seconds=total%60;return `${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}`}
function updateSpotterLiveTimers(){document.querySelectorAll('[data-spotter-pit-start]').forEach(node=>{node.textContent=spotterFormatDuration(Date.now()-Number(node.dataset.spotterPitStart||Date.now()))})}
function spotterIncomingCard(item){
 return `<div class="spotter-queue-card incoming"><strong>${spotterEscape(item.name)}</strong><div class="spotter-card-stats"><span>${spotterEscape(item.kv)}</span><span>Score : ${item.score}</span></div><div class="spotter-pit-time" data-spotter-pit-start="${Number(item.pitInAt||Date.now())}">${spotterFormatDuration(Date.now()-Number(item.pitInAt||Date.now()))}</div></div>`;
}
function spotterEscape(value){return String(value??'').replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]))}
document.addEventListener('DOMContentLoaded',()=>{loadSpotterFoundation();setInterval(updateSpotterLiveTimers,1000)});
