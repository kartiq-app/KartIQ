/* Velocity V7.0 — Spotter Foundation */
const SPOTTER_STORAGE_KEY='velocity_spotter_v7_foundation';
const spotterState={mode:1,setupKarts:['','',''],queue:[],maintenance:[],incoming:[],configured:false};
function spotterPadKv(index){return `KV${String(index+1).padStart(2,'0')}`}
function loadSpotterFoundation(){
 try{const saved=JSON.parse(localStorage.getItem(SPOTTER_STORAGE_KEY)||'null');if(saved&&saved.version===1){Object.assign(spotterState,saved.state||{})}}catch(_){ }
 renderSpotterFoundation();
}
function saveSpotterFoundation(){localStorage.setItem(SPOTTER_STORAGE_KEY,JSON.stringify({version:1,savedAt:new Date().toISOString(),state:spotterState}))}
function openSpotterSetup(){spotterState.configured=false;renderSpotterFoundation('mode')}
function setSpotterMode(mode){if(Number(mode)!==1)return;spotterState.mode=1;saveSpotterFoundation();renderSpotterFoundation('queue')}
function addSpotterSetupKart(){spotterState.setupKarts.push('');renderSpotterFoundation('queue');setTimeout(()=>document.querySelector('.spotter-setup-row:last-of-type input')?.focus(),0)}
function removeSpotterSetupKart(index){if(spotterState.setupKarts.length<=1)return;spotterState.setupKarts.splice(index,1);renderSpotterFoundation('queue')}
function updateSpotterSetupKart(index,value){spotterState.setupKarts[index]=String(value||'').trim().slice(0,12);saveSpotterFoundation();const btn=document.getElementById('spotterLaunchButton');if(btn)btn.disabled=!spotterState.setupKarts.some(Boolean)}
function launchSpotterFoundation(){
 const karts=spotterState.setupKarts.filter(kart=>String(kart||'').trim()).map((kart,index)=>({kv:spotterPadKv(index),apexKart:String(kart).trim(),lastTeam:'Initialisation',score:null,confidence:null,status:'available'}));
 if(!karts.length)return;
 spotterState.queue=karts;spotterState.incoming=[];spotterState.maintenance=[];spotterState.configured=true;saveSpotterFoundation();renderSpotterFoundation('live');
}
function resetSpotterFoundation(){if(!confirm('Réinitialiser la configuration Spotter ?'))return;spotterState.mode=1;spotterState.setupKarts=['','',''];spotterState.queue=[];spotterState.maintenance=[];spotterState.incoming=[];spotterState.configured=false;saveSpotterFoundation();renderSpotterFoundation('mode')}
function renderSpotterFoundation(forceStep){
 const root=document.getElementById('spotterApp');if(!root)return;
 const step=forceStep||(spotterState.configured?'live':'mode');
 root.innerHTML=`<div class="spotter-shell">
  <div class="spotter-topbar"><button class="spotter-back" type="button" onclick="showHome()" aria-label="Retour accueil">☰</button><div class="spotter-title">Spotter<span class="spotter-version">QUICK CHANGE • V7.0</span></div><button class="spotter-icon-btn" type="button" onclick="openSpotterSetup()" aria-label="Configurer">⚙</button></div>
  <div class="spotter-step ${step==='mode'?'active':''}" id="spotterModeStep">
   <section class="spotter-card"><div class="spotter-card-head"><h2>Mode Quick Change</h2></div><div class="spotter-card-body"><p class="spotter-intro">Choisissez le nombre de files utilisé par le circuit avant de lancer le Spotter.</p><div class="spotter-mode-grid"><button class="spotter-mode-option active" type="button" onclick="setSpotterMode(1)"><strong>1</strong><span>File</span><small>Disponible</small></button><button class="spotter-mode-option" type="button" disabled><strong>2</strong><span>Files</span><small>Bientôt</small></button><button class="spotter-mode-option" type="button" disabled><strong>3</strong><span>Files</span><small>Bientôt</small></button></div></div></section>
  </div>
  <div class="spotter-step ${step==='queue'?'active':''}" id="spotterQueueStep">
   <section class="spotter-card"><div class="spotter-card-head"><h2>Initialiser la file</h2><span>${spotterState.setupKarts.length} kart(s)</span></div><div class="spotter-card-body"><p class="spotter-intro">Saisissez les karts présents dans la file au départ. Velocity attribue automatiquement les identifiants KV dans cet ordre.</p><div id="spotterSetupRows">${spotterState.setupKarts.map((kart,index)=>`<div class="spotter-setup-row"><div class="spotter-kv">${spotterPadKv(index)}</div><input inputmode="numeric" autocomplete="off" value="${spotterEscape(kart)}" placeholder="N° kart physique" oninput="updateSpotterSetupKart(${index},this.value)"><button class="spotter-remove" type="button" onclick="removeSpotterSetupKart(${index})" aria-label="Supprimer">×</button></div>`).join('')}</div><button class="spotter-add-row" type="button" onclick="addSpotterSetupKart()">＋ AJOUTER UN KART</button><button id="spotterLaunchButton" class="spotter-primary" type="button" onclick="launchSpotterFoundation()" ${spotterState.setupKarts.some(Boolean)?'':'disabled'}>LANCER LE SPOTTER</button></div></section>
  </div>
  <div class="spotter-step ${step==='live'?'active':''}" id="spotterLiveStep">
   <div class="spotter-flow-label">SORTIE</div><div class="spotter-flow-arrow">▲</div>
   <section class="spotter-card"><div class="spotter-card-head"><h2>File unique</h2><span>${spotterState.queue.length} kart(s)</span></div><div class="spotter-card-body"><div class="spotter-queue">${spotterState.queue.length?spotterState.queue.map(spotterQueueCard).join(''):'<div class="spotter-empty">Aucun kart dans la file.</div>'}</div></div></section>
   <section class="spotter-card"><div class="spotter-card-body"><div class="spotter-section-title"><span>Karts entrants</span><span class="spotter-badge">${spotterState.incoming.length}</span></div>${spotterState.incoming.length?'<div class="spotter-empty">Événements PIT IN en attente de la V7.1.</div>':'<div class="spotter-empty">Aucun kart entrant à valider.</div>'}</div></section>
   <section class="spotter-card spotter-maintenance"><div class="spotter-card-body"><div class="spotter-section-title"><span>🔧 Maintenance</span><span>${spotterState.maintenance.length}</span></div>${spotterState.maintenance.length?'<div class="spotter-empty">Gestion de maintenance disponible en V7.1.</div>':'<div class="spotter-empty">Aucun kart en maintenance.</div>'}</div></section>
   <div class="spotter-footer-actions"><button class="spotter-secondary" type="button" onclick="renderSpotterFoundation('queue')">MODIFIER LA FILE</button><button class="spotter-secondary" type="button" onclick="resetSpotterFoundation()">RÉINITIALISER</button></div><p class="spotter-note">V7.0 Foundation : interface et initialisation uniquement. Les événements PIT IN/PIT OUT et les validations seront connectés au moteur FIFO en V7.1.</p>
  </div>
 </div>`;
}
function spotterQueueCard(item,index){const label=item.lastTeam&&item.lastTeam!=='Initialisation'?`Kart de ${item.lastTeam}`:`Kart ${item.apexKart}`;return `<div class="spotter-queue-card available"><div class="spotter-queue-main"><strong>${spotterEscape(label)}</strong><small>${spotterEscape(item.kv)} • Position ${index+1}</small></div><div class="spotter-queue-meta"><b>DISPONIBLE</b><small>${item.score==null?'Score Velocity —':`Score ${item.score}`}</small></div></div>`}
function spotterEscape(value){return String(value??'').replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]))}
document.addEventListener('DOMContentLoaded',loadSpotterFoundation);
