/* Velocity V7.2.1764 — Velocity Lab / Data Recorder : STOP durable + lease Render. */
(function(){
'use strict';

const ACTIVE_STATUSES=new Set(['starting','waiting','recording','reconnecting']);
let recorderPollTimer=null;
let recorderBusy=false;
let recorderKnownCircuits=false;

function esc(value){return String(value??'').replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]))}
function fmtInt(value){const n=Number(value)||0;try{return new Intl.NumberFormat('fr-FR').format(n)}catch(_){return String(n)}}
function fmtElapsed(startMs,endMs){
 const start=Number(startMs)||0,end=Number(endMs)||Date.now();if(!start)return '00:00:00';
 let sec=Math.max(0,Math.floor((end-start)/1000));const h=Math.floor(sec/3600);sec%=3600;const m=Math.floor(sec/60),s=sec%60;
 return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}
function fmtAge(ms){
 const value=Number(ms)||0;if(!value)return '—';const seconds=Math.max(0,Math.round((Date.now()-value)/1000));
 if(seconds<2)return 'à l’instant';if(seconds<60)return `il y a ${seconds} s`;const minutes=Math.floor(seconds/60);if(minutes<60)return `il y a ${minutes} min`;return `il y a ${Math.floor(minutes/60)} h ${minutes%60} min`;
}
function fmtDate(ms){
 const value=Number(ms)||0;if(!value)return '—';try{return new Date(value).toLocaleString('fr-FR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})}catch(_){return '—'}
}
function statusMeta(status){
 const s=String(status||'').toLowerCase();
 if(s==='recording')return {label:'● REC',cls:'recording'};
 if(s==='reconnecting')return {label:'◌ RECONNEXION APEX',cls:'reconnecting'};
 if(s==='starting'||s==='waiting')return {label:'○ EN ATTENTE DU LIVE',cls:'waiting'};
 if(s==='error')return {label:'⚠ ERREUR',cls:'error'};
 return {label:'■ TERMINÉ',cls:'stopped'};
}
function panelVisible(){const panel=document.getElementById('velocityLabRecorderPanel');const overlay=document.getElementById('velocityLabOverlay');return Boolean(panel&&!panel.hidden&&overlay?.classList.contains('active'))}
function feedback(message='',isError=false){const el=document.getElementById('velocityRecorderFeedback');if(!el)return;el.textContent=message;el.classList.toggle('error',Boolean(isError))}
function setStartBusy(busy){recorderBusy=Boolean(busy);const button=document.getElementById('velocityRecorderStart');if(button){button.disabled=recorderBusy;button.textContent=recorderBusy?'DÉMARRAGE…':'● DÉMARRER L’ENREGISTREMENT'}}

function populateCircuits(circuits){
 const select=document.getElementById('velocityRecorderCircuit');if(!select)return;
 const current=select.value;select.innerHTML='<option value="">Sélectionnez un circuit</option>';
 (circuits||[]).filter(c=>c.websocket_ready).sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'fr')).forEach(c=>{
  const option=document.createElement('option');option.value=String(c.id||'');option.textContent=`${c.name||c.id}${c.country?` — ${c.country}`:''}`;select.appendChild(option);
 });
 if(current&&[...select.options].some(o=>o.value===current))select.value=current;recorderKnownCircuits=true;
}
function renderStorage(storage){
 const badge=document.getElementById('velocityRecorderStorage'),warning=document.getElementById('velocityRecorderWarning');if(!badge||!warning)return;
 const persistent=Boolean(storage?.persistent);badge.textContent=`STOCKAGE : ${String(storage?.label||'indisponible').toUpperCase()}`;badge.classList.toggle('persistent',persistent);badge.classList.toggle('temporary',!persistent);
 warning.hidden=persistent;
 warning.textContent=persistent?'':"ATTENTION — stockage local non persistant. Sur Render, configure DATABASE_URL vers Render Postgres avant une course de 24 heures : un redéploiement peut effacer les données locales.";
}
function backfillHtml(rec){
 const info=rec?.metadata||{},status=String(info.backfill_status||''),laps=Number(info.backfill_laps)||0,pits=Number(info.backfill_pits)||0;
 if(!status&&!laps&&!pits)return '';
 let label='HISTORIQUE APEX';let detail='';let cls='ready';
 if(status==='syncing'){detail='Synchronisation des tours précédents en cours…';cls='syncing'}
 else if(status==='waiting-live'){detail='En attente de la grille Apex pour récupérer les tours précédents…';cls='waiting'}
 else if(status==='partial'){detail=`Rattrapage partiel · ${fmtInt(laps)} tour(s) récupéré(s)`;cls='partial'}
 else if(laps||pits){detail=`${fmtInt(laps)} ancien(s) tour(s) · ${fmtInt(pits)} événement(s) stands récupéré(s)`}
 else detail='Historique vérifié · aucun tour antérieur à récupérer';
 return `<div class="velocity-recorder-backfill ${cls}"><span>${label}</span><b>${detail}</b></div>`;
}
function cardHtml(rec,active){
 const meta=statusMeta(rec.status),end=active?Date.now():(Number(rec.stopped_at_ms)||Date.now()),err=String(rec.last_error||'').trim();
 const buttons=active
  ? `<button class="velocity-recorder-btn danger" type="button" onclick="stopVelocityRecorder('${esc(rec.id)}')">■ ARRÊTER</button>`
  : `<a class="velocity-recorder-btn primary" href="/api/lab/recorders/${encodeURIComponent(rec.id)}/export">⇩ EXPORT COMPLET ZIP</a><button class="velocity-recorder-btn danger ghost" type="button" onclick="deleteVelocityRecorder('${esc(rec.id)}')">SUPPRIMER</button>`;
 return `<article class="velocity-recorder-card ${meta.cls}" data-recorder-id="${esc(rec.id)}">
   <div class="velocity-recorder-card-head"><div><span class="velocity-recorder-status ${meta.cls}">${meta.label}</span><h4>${esc(rec.name||'Course')}</h4><small>${esc(rec.circuit_name||rec.circuit_id||'Circuit Apex')}</small></div><strong class="velocity-recorder-duration">${fmtElapsed(rec.started_at_ms,end)}</strong></div>
   <div class="velocity-recorder-metrics">
    <div><span>ÉQUIPES</span><b>${fmtInt(rec.teams_count)}</b></div><div><span>TOURS</span><b>${fmtInt(rec.laps_count)}</b></div><div><span>SECTEURS</span><b>${fmtInt(rec.sectors_count)}</b></div><div><span>SCORES</span><b>${fmtInt(rec.scores_count)}</b></div><div><span>TRAMES APEX</span><b>${fmtInt(rec.frames_count)}</b></div><div><span>DERNIÈRE DATA</span><b>${fmtAge(rec.last_message_at_ms)}</b></div>
   </div>
   ${backfillHtml(rec)}
   ${err?`<div class="velocity-recorder-error">${esc(err)}</div>`:''}
   <div class="velocity-recorder-card-foot"><small>${active?'Recorder autonome Render':'Terminé le '+fmtDate(rec.stopped_at_ms)}</small><div>${buttons}</div></div>
 </article>`;
}
function renderRecordings(recordings){
 const activeEl=document.getElementById('velocityRecorderActive'),archiveEl=document.getElementById('velocityRecorderArchive');if(!activeEl||!archiveEl)return;
 const all=Array.isArray(recordings)?recordings:[],active=all.filter(r=>ACTIVE_STATUSES.has(String(r.status||'').toLowerCase())),archive=all.filter(r=>!ACTIVE_STATUSES.has(String(r.status||'').toLowerCase()));
 activeEl.innerHTML=active.length?active.map(r=>cardHtml(r,true)).join(''):'<div class="analyzer-empty">Aucun enregistrement actif.</div>';
 archiveEl.innerHTML=archive.length?archive.map(r=>cardHtml(r,false)).join(''):'<div class="analyzer-empty">Aucune course enregistrée.</div>';
 const ac=document.getElementById('velocityRecorderActiveCount'),ar=document.getElementById('velocityRecorderArchiveCount');if(ac)ac.textContent=String(active.length);if(ar)ar.textContent=String(archive.length);
}

async function loadVelocityRecorder(force=false){
 if(!force&&!panelVisible())return;
 try{
  const response=await fetch('/api/lab/recorders',{cache:'no-store'}),data=await response.json();if(!response.ok||!data.ok)throw new Error(data.error||'Data Recorder indisponible');
  renderStorage(data.storage||{});if(!recorderKnownCircuits||force)populateCircuits(data.circuits||[]);renderRecordings(data.recordings||[]);
 }catch(error){
  const warning=document.getElementById('velocityRecorderWarning');if(warning){warning.hidden=false;warning.textContent=error.message||String(error)}
 }
 if(panelVisible())startVelocityRecorderPolling();
}
function startVelocityRecorderPolling(){if(recorderPollTimer)return;recorderPollTimer=setInterval(()=>{if(panelVisible())void loadVelocityRecorder(false);else stopVelocityRecorderPolling()},4000)}
function stopVelocityRecorderPolling(){if(recorderPollTimer){clearInterval(recorderPollTimer);recorderPollTimer=null}}
async function startVelocityRecorder(){
 if(recorderBusy)return;const name=String(document.getElementById('velocityRecorderName')?.value||'').trim(),circuitId=String(document.getElementById('velocityRecorderCircuit')?.value||'').trim();
 if(!circuitId)return feedback('Sélectionnez un circuit Apex.',true);
 setStartBusy(true);feedback('Création du Recorder sur Render…');
 try{
  const response=await fetch('/api/lab/recorders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,circuit_id:circuitId})}),data=await response.json();if(!response.ok||!data.ok)throw new Error(data.error||'Impossible de démarrer le Recorder');
  const input=document.getElementById('velocityRecorderName');if(input)input.value='';feedback('Recorder démarré. Render reste connecté même si Velocity est fermé.');await loadVelocityRecorder(true);
 }catch(error){feedback(error.message||String(error),true)}finally{setStartBusy(false)}
}
async function stopVelocityRecorder(id){
 if(!id||!confirm('Arrêter cet enregistrement ? Les données déjà collectées seront conservées et pourront être exportées.'))return;
 feedback('Arrêt du Recorder…');
 try{
  const response=await fetch(`/api/lab/recorders/${encodeURIComponent(id)}/stop`,{method:'POST'}),data=await response.json();if(!response.ok||!data.ok)throw new Error(data.error||'Impossible d’arrêter le Recorder');feedback('Enregistrement terminé. L’export complet est disponible dans les courses enregistrées.');await loadVelocityRecorder(true);
 }catch(error){feedback(error.message||String(error),true)}
}
async function deleteVelocityRecorder(id){
 if(!id||!confirm('Supprimer définitivement cette course enregistrée et toutes ses données ? Cette action est irréversible.'))return;
 feedback('Suppression des données…');
 try{
  const response=await fetch(`/api/lab/recorders/${encodeURIComponent(id)}`,{method:'DELETE'}),data=await response.json();if(!response.ok||!data.ok)throw new Error(data.error||'Impossible de supprimer cet enregistrement');feedback('Course enregistrée supprimée.');await loadVelocityRecorder(true);
 }catch(error){feedback(error.message||String(error),true)}
}

window.loadVelocityRecorder=loadVelocityRecorder;
window.startVelocityRecorder=startVelocityRecorder;
window.stopVelocityRecorder=stopVelocityRecorder;
window.deleteVelocityRecorder=deleteVelocityRecorder;
window.startVelocityRecorderPolling=startVelocityRecorderPolling;
window.stopVelocityRecorderPolling=stopVelocityRecorderPolling;
})();
