const circuitSelectElement=document.getElementById('circuitSelect');
function endurancePitBadge(driver){
 const key=String(driver.apex_row??driver.driver??driver.pos);
 const current=driver.status||'unknown';
 const previous=endurancePitStatuses.get(key);
 const now=Date.now();
 if(current==='pit'){
  enduranceOutUntil.delete(key);
  endurancePitStatuses.set(key,current);
  return '<span class="pit-status-badge pit-in">IN</span>';
 }
 if(current==='track'&&previous==='pit')enduranceOutUntil.set(key,now+3000);
 endurancePitStatuses.set(key,current);
 const until=enduranceOutUntil.get(key)||0;
 if(current==='track'&&until>now)return '<span class="pit-status-badge pit-out">OUT</span>';
 if(until&&until<=now)enduranceOutUntil.delete(key);
 return '';
}
function rows(target,cols){
 const el=document.getElementById(target);const previousRects=new Map([...el.querySelectorAll('tr[data-driver]')].map(tr=>[tr.dataset.driver,tr.getBoundingClientRect()]));
 const fragment=document.createDocumentFragment();
 state.drivers.forEach(d=>{const tr=document.createElement('tr');const key=d.driver||String(d.pos);const signature=String(d.laps)+'|'+String(d.last);const signatureKey=target+'|'+key;const previousSignature=rowLapSignatures.get(signatureKey);tr.dataset.driver=key;tr.className='clickable'+(d.driver===state.followed_driver?' followed':'')+((target==='qualifTable'||target==='enduranceTable')&&previousSignature&&previousSignature!==signature?' lap-flash':'');tr.onclick=()=>followDriver(d.driver);tr.innerHTML=cols(d);fragment.appendChild(tr);rowLapSignatures.set(signatureKey,signature)});
 el.replaceChildren(fragment);
 requestAnimationFrame(()=>{[...el.querySelectorAll('tr[data-driver]')].forEach(tr=>{const oldRect=previousRects.get(tr.dataset.driver);if(!oldRect)return;const newRect=tr.getBoundingClientRect();const dy=oldRect.top-newRect.top;if(Math.abs(dy)>1){tr.style.transition='none';tr.style.transform=`translateY(${dy}px)`;requestAnimationFrame(()=>{tr.style.transition='transform .48s cubic-bezier(.22,.8,.2,1)';tr.style.transform='translateY(0)'})}})});
}
function absoluteSessionBestSeconds(){
 const valid=(state.drivers||[]).map(d=>parseLapTime(d.best)).filter(Number.isFinite);
 return valid.length?Math.min(...valid):Number.POSITIVE_INFINITY;
}
function lapTimeClass(driver, value, kind='last'){
 const valueSeconds=parseLapTime(value);
 // Le meilleur absolu est recalculé directement depuis les lignes affichées.
 // Cela évite les différences de format Apex entre RKO, Dunois et les autres pistes.
 const sessionSeconds=absoluteSessionBestSeconds();
 if(kind==='best'&&Number.isFinite(valueSeconds)&&Number.isFinite(sessionSeconds)&&Math.abs(valueSeconds-sessionSeconds)<0.0005)return 'purple';
 if(kind==='best')return 'green';
 const driverBestSeconds=parseLapTime(driver?.best);
 if(Number.isFinite(valueSeconds)&&Number.isFinite(driverBestSeconds)&&Math.abs(valueSeconds-driverBestSeconds)<0.0005)return 'green';
 return 'yellow';
}
function formatDriverName(fullName){
 const raw=(fullName||'—').trim();
 if(raw==='—')return '—';
 const parts=raw.split(/\s+/);
 if(parts.length===1)return `<span class="driver-last">${parts[0]}</span>`;
 const first=parts.shift();
 const last=parts.join(' ');
 return `<span class="driver-name"><span class="driver-first">${first}</span><span class="driver-last">${last}</span></span>`;
}
function validKartNumber(driver){
 const kart=String(driver?.apex??'').trim();
 return kart&&kart!=='—'&&kart!=='-'?kart:'';
}
function rankingHasKartColumn(){
 return (state.drivers||[]).some(d=>Boolean(validKartNumber(d)));
}
function formatRankingDriver(driver){
 return `<span class="ranking-driver-cell">${formatDriverName(driver?.driver)}</span>`;
}
function setDriverName(el,fullName){el.innerHTML=formatDriverName(fullName)}
function formatDriverSurname(fullName){const raw=(fullName||'—').trim();if(raw==='—')return '—';const parts=raw.split(/\s+/);return `<span class="driver-last">${parts.length>1?parts.slice(1).join(' '):parts[0]}</span>`;}
function positionClass(pos,extra=''){return `pos${extra?' '+extra:''}`}
function parseLapTime(value){const m=String(value||'').match(/^(?:(\d+):)?(\d+)(?:[.,](\d+))?$/);if(!m)return Number.POSITIVE_INFINITY;return (Number(m[1]||0)*60)+Number(m[2]||0)+Number('0.'+(m[3]||0))}
function gapWithMarkup(label,driver){return `<span class="gap-label">${label}</span> ${formatDriverName(driver||'—')}`}
function qualificationRanking(){return [...(state.drivers||[])].filter(d=>Number.isFinite(parseLapTime(d.best))).sort((a,b)=>parseLapTime(a.best)-parseLapTime(b.best))}
function qualificationLeader(){return qualificationRanking()[0]}
function qualificationReferenceFor(driver){
 const ranking=qualificationRanking();
 if(!driver||!ranking.length)return null;
 const selectedIndex=ranking.findIndex(d=>d.driver===driver.driver);
 // Pour le leader, la référence devient le P2 afin d'afficher son avance réelle.
 if(selectedIndex===0)return ranking[1]||null;
 return ranking[0]||null;
}
function qualificationDeltaFor(driver){
 const reference=qualificationReferenceFor(driver);
 const followedBest=parseLapTime(driver?.best);
 const referenceBest=parseLapTime(reference?.best);
 if(!Number.isFinite(followedBest)||!Number.isFinite(referenceBest))return '--';
 const delta=followedBest-referenceBest;
 if(Math.abs(delta)<0.0005)return '0.000';
 return `${delta<0?'-':'+'}${Math.abs(delta).toFixed(3)}`;
}
function qualificationDeltaIsLeader(driver){
 const leader=qualificationLeader();
 return Boolean(driver?.driver&&leader?.driver&&driver.driver===leader.driver);
}
function normalizeBriceDriverName(value){
 return String(value||'')
  .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .replace(/[’'`´.]/g,' ')
  .replace(/[^a-zA-Z0-9]+/g,' ')
  .trim().toUpperCase();
}
function isBriceDriverName(value){
 const normalized=normalizeBriceDriverName(value);
 if(!normalized)return false;
 return normalized==='BRICE NGUESSAN'||normalized==='NGUESSAN'||normalized==='B NGUESSAN'||normalized==='GUESSAN'||normalized.split(' ').includes('NGUESSAN')||normalized.split(' ').includes('GUESSAN');
}
async function maybeAutoFollowBrice(){
 if(!['qualification','sprint','endurance'].includes(currentMode)||manualFollowOverride||autoBriceFollowApplied||autoBriceFollowInFlight)return;
 const selected=(state.drivers||[]).find(d=>isBriceDriverName(d.driver));
 if(!selected)return;
 autoBriceFollowApplied=true;
 autoBriceFollowInFlight=true;
 state.followed_driver=selected.driver;
 state.followed=selected;
 state.qualif_delta=qualificationDeltaFor(selected);
 render();
 try{await fetch('/api/follow',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({driver:selected.driver})})}
 finally{autoBriceFollowInFlight=false}
}
async function followDriver(driverName,{automatic=false}={}){
 const selected=(state.drivers||[]).find(d=>d.driver===driverName);if(!selected)return;
 if(!automatic)manualFollowOverride=true;
 state.followed_driver=driverName;state.followed=selected;state.qualif_delta=qualificationDeltaFor(selected);render();await api('/api/follow',{driver:driverName})
}
function driverAhead(followed){if(!followed||!followed.pos||Number(followed.pos)<=1)return null;return (state.drivers||[]).find(d=>Number(d.pos)===Number(followed.pos)-1)||null}
function sprintReferenceFor(driver){
 if(!driver||!driver.pos)return null;
 if(Number(driver.pos)===1)return (state.drivers||[]).find(d=>Number(d.pos)===2)||null;
 return driverAhead(driver);
}
function raceGapSeconds(value){
 const raw=String(value??'').trim().replace(',', '.');
 if(!raw||raw==='—'||raw==='--')return 0;
 if(/lap|tour/i.test(raw))return null;
 const cleaned=raw.replace(/[+\s]|s(ec)?\.?$/gi,'');
 const parts=cleaned.split(':').map(Number);
 if(parts.some(v=>!Number.isFinite(v)))return null;
 if(parts.length===1)return parts[0];
 if(parts.length===2)return parts[0]*60+parts[1];
 if(parts.length===3)return parts[0]*3600+parts[1]*60+parts[2];
 return null;
}
function formatRaceGap(seconds){
 if(!Number.isFinite(seconds))return '--';
 return Math.max(0,seconds).toFixed(3);
}
function directRaceGap(behind,ahead){
 if(!behind||!ahead)return null;
 const behindGap=raceGapSeconds(behind.gap);
 const aheadGap=Number(ahead.pos)===1?0:raceGapSeconds(ahead.gap);
 if(Number.isFinite(behindGap)&&Number.isFinite(aheadGap)&&behindGap>=aheadGap){
  return behindGap-aheadGap;
 }
 const interval=raceGapSeconds(behind.interval);
 return Number.isFinite(interval)?interval:null;
}
function raceLapInterval(value){
 const raw=String(value??'').trim();
 const match=raw.match(/(\d+(?:[.,]\d+)?)\s*(?:lap|laps|tour|tours)/i);
 if(!match)return null;
 const laps=Number(match[1].replace(',', '.'));
 return Number.isFinite(laps)&&laps>0?laps:null;
}
function formatRaceInterval(behind,ahead,sign){
 if(!behind||!ahead)return '--';
 const lapCount=raceLapInterval(behind.interval);
 if(Number.isFinite(lapCount)){
  const normalized=Number.isInteger(lapCount)?String(lapCount):String(lapCount).replace('.', ',');
  return `${sign}${normalized} ${lapCount===1?'tour':'tours'}`;
 }
 const gap=directRaceGap(behind,ahead);
 return Number.isFinite(gap)?`${sign}${formatRaceGap(gap)}`:'--';
}
function sprintDeltaFor(driver){
 if(!driver||!driver.pos)return '--';
 if(Number(driver.pos)===1){
  const p2=sprintReferenceFor(driver);
  return formatRaceInterval(p2,driver,'+');
 }
 const ahead=driverAhead(driver);
 return formatRaceInterval(driver,ahead,'-');
}
async function updateDeveloperSettings(){
 const developer_mode=!!document.getElementById('developerModeToggle')?.checked;
 const traffic_recording=developer_mode&&!!document.getElementById('trafficRecordingToggle')?.checked;
 await api('/api/developer/settings',{developer_mode,traffic_recording});
}
function exportApexLogs(){window.location.href='/api/developer/export-logs'}
function renderDeveloperRecorder(){
 const dev=document.getElementById('developerModeToggle'),rec=document.getElementById('trafficRecordingToggle'),label=document.getElementById('trafficRecordingLabel');
 if(!dev||!rec)return;
 dev.checked=!!state.developer_mode;rec.checked=!!state.traffic_recording;rec.disabled=!dev.checked;
 if(label){label.classList.toggle('recording-on',!!state.traffic_recording);label.classList.toggle('recording-off',!state.traffic_recording)}
}
function render(){
 renderDeveloperRecorder();
 const circuit=state.circuits.find(c=>c.id===state.circuit_id);circuitName.textContent=circuit?.name||'Aucun circuit';connection.textContent=state.connection;const live=state.live||{};liveDiagStatus.textContent=(live.status||'idle').toUpperCase();liveDiagMessages.textContent=live.messages||0;liveDiagParsed.textContent=live.parsed_updates||0;liveDiagLast.textContent=live.last_message_at?live.last_message_at.slice(11,19):'—';liveDiagPreview.textContent=live.last_frame_preview||'En attente…';liveStatusDot.classList.toggle('connected',['connected','receiving'].includes(live.status));
 const newCircuitSignature=state.circuits.map(c=>c.id+'|'+c.name).join('§');if(newCircuitSignature!==circuitSignature){circuitSignature=newCircuitSignature;circuitSelectElement.innerHTML='<option value="" selected disabled>Sélectionnez votre circuit</option>'+state.circuits.map(c=>`<option value="${c.id}">${c.name}</option>`).join('')}circuitSelectElement.value=state.circuit_id||'';
 const circuitReady=Boolean(state.circuit_id);document.querySelectorAll('[data-home-mode]').forEach(card=>{card.classList.toggle('mode-locked',!circuitReady);card.setAttribute('aria-disabled',String(!circuitReady))});
 const showRankingKart=rankingHasKartColumn();
 document.querySelector('#qualification .qual-table-wrap table')?.classList.toggle('has-kart-column',showRankingKart);
 document.querySelector('#sprint .sprint-table-wrap table')?.classList.toggle('has-kart-column',showRankingKart);
 document.querySelector('#endurance .qual-table-wrap table')?.classList.toggle('has-kart-column',showRankingKart);
 rows('qualifTable',d=>`<td class="${positionClass(d.pos)} ranking-pos">${d.pos}</td>${showRankingKart?`<td class="ranking-kart-column">${validKartNumber(d)||'—'}</td>`:''}<td class="name ranking-driver-column">${formatRankingDriver(d)}</td><td class="ranking-last ${lapTimeClass(d,d.last,'last')}">${d.last}</td><td class="ranking-best ${lapTimeClass(d,d.best,'best')}">${d.best}</td><td class="ranking-gap">${d.gap}</td>`);
 rows('sprintTable',d=>`<td class="${positionClass(d.pos)} ranking-pos">${d.pos}</td>${showRankingKart?`<td class="ranking-kart-column">${validKartNumber(d)||'—'}</td>`:''}<td class="name ranking-driver-column">${formatRankingDriver(d)}</td><td class="ranking-last ${lapTimeClass(d,d.last,'last')}">${d.last}</td><td class="mobile-hide ranking-best ${lapTimeClass(d,d.best,'best')}">${d.best}</td><td class="mobile-hide ranking-gap">${d.gap}</td><td class="ranking-interval">${d.interval}</td>`);
 rows('enduranceQualifTable',d=>`<td class="${positionClass(d.pos)} ranking-pos">${d.pos}</td>${showRankingKart?`<td class="ranking-kart-column">${validKartNumber(d)||'—'}</td>`:''}<td class="name ranking-driver-column">${formatRankingDriver(d)}</td><td class="ranking-last ${lapTimeClass(d,d.last,'last')}">${d.last}</td><td class="ranking-best ${lapTimeClass(d,d.best,'best')}">${d.best}</td><td class="ranking-gap">${d.gap}</td><td class="endurance-stand-time-column">${String(d.pit_timer||'—').trim()||'—'}</td>`);
 rows('enduranceLandscapeTable',d=>`<td class="pos endurance-position-cell"><span class="endurance-position-wrap"><span class="endurance-position-number${Number(d.pos)===1?' leader-pos':''}">${d.pos}</span>${endurancePitBadge(d)}</span></td><td>${validKartNumber(d)||d.apex||'—'}</td><td class="name">${formatDriverName(d.driver)}</td><td>${d.laps}</td><td>${d.pit_stops ?? '—'}</td><td class="${lapTimeClass(d,d.last,'last')}">${d.last}</td><td class="${lapTimeClass(d,d.best,'best')}">${d.best}</td><td>${d.gap}</td><td class="red">${d.penalty||'—'}</td>`);
 rows('enduranceTable',d=>`<td class="pos endurance-position-cell"><span class="endurance-position-wrap"><span class="endurance-position-number${Number(d.pos)===1?' leader-pos':''}">${d.pos}</span>${endurancePitBadge(d)}</span></td><td class="name">${formatDriverName(d.driver)}</td><td>${d.apex}</td><td>${d.laps}</td><td>${d.pit_stops ?? '—'}</td><td class="${lapTimeClass(d,d.last,'last')}">${d.last}</td><td class="${lapTimeClass(d,d.best,'best')}">${d.best}</td><td>${d.gap}</td><td class="red">${d.penalty||'—'}</td>`);
 const f=state.followed||{};qPos.textContent=f.pos?'P'+f.pos:'—';setDriverName(qName,f.driver||'—');qDelta.textContent=qualificationDeltaFor(f);qDelta.classList.toggle('delta-good',qualificationDeltaIsLeader(f));updateRemainingDisplay();qLapsRemaining.textContent=state.apex_laps_remaining||'—';const qReference=qualificationReferenceFor(f);qGapWith.innerHTML=gapWithMarkup('vs',qReference?.driver||'—');
 const eQPos=document.getElementById('eQPos'),eQName=document.getElementById('eQName'),eQDelta=document.getElementById('eQDelta'),eQRemaining=document.getElementById('eQRemaining'),eQLapsRemaining=document.getElementById('eQLapsRemaining'),eQGapWith=document.getElementById('eQGapWith');if(eQPos)eQPos.textContent=f.pos?'P'+f.pos:'—';if(eQName)setDriverName(eQName,f.driver||'—');if(eQDelta){const enduranceDelta=sprintDeltaFor(f);eQDelta.textContent=enduranceDelta;eQDelta.classList.toggle('sprint-leader-delta',Number(f.pos)===1&&enduranceDelta!=='--');eQDelta.classList.toggle('sprint-followed-delta',Number(f.pos)>1&&enduranceDelta!=='--')}const enduranceRemainingMs=liveRemainingMilliseconds();if(eQRemaining){eQRemaining.textContent=formatMainRemainingDisplay(enduranceRemainingMs,state.time_remaining||'—');eQRemaining.classList.toggle('time-critical',Number.isFinite(enduranceRemainingMs)&&enduranceRemainingMs<120000)}if(eQLapsRemaining)eQLapsRemaining.textContent=state.apex_laps_remaining||'—';if(eQGapWith)eQGapWith.innerHTML=gapWithMarkup('vs',qReference?.driver||'—');
 setDriverName(sName,f.driver||'—');sPos.textContent=f.pos?'P'+f.pos:'—';const sprintDelta=sprintDeltaFor(f);const sprintReference=sprintReferenceFor(f);sDeltaValue.textContent=sprintDelta;sDeltaValue.classList.toggle('sprint-leader-delta',Number(f.pos)===1&&sprintDelta!=='--');sDeltaValue.classList.toggle('sprint-followed-delta',Number(f.pos)>1&&sprintDelta!=='--');const sprintRemainingMs=liveRemainingMilliseconds();sRemaining.textContent=formatMainRemainingDisplay(sprintRemainingMs,state.time_remaining||'—');sRemaining.classList.toggle('time-critical',Number.isFinite(sprintRemainingMs)&&sprintRemainingMs<120000);sLapsRemaining.textContent=state.apex_laps_remaining||'—';sGapWith.innerHTML=gapWithMarkup('vs',sprintReference?.driver||'—');const fastest=sprintFastestLastLapForFollowed(f)||{};const fastestDriver=fastest.driver||'—';const fastestLap=fastest.last||'—';sFastestName.textContent='🔥 '+fastestDriver;sFastestTime.textContent=fastestLap;const fastestLapSeconds=parseLapTime(fastestLap);const sessionBestSeconds=absoluteSessionBestSeconds();const isAbsoluteSessionBest=Number.isFinite(fastestLapSeconds)&&Number.isFinite(sessionBestSeconds)&&Math.abs(fastestLapSeconds-sessionBestSeconds)<0.0005;const improvedPersonalBest=Boolean(fastest.last_improved_personal_best);sFastestTime.classList.toggle('fastest-session-best',isAbsoluteSessionBest);sFastestTime.classList.toggle('fastest-lap-green',!isAbsoluteSessionBest&&improvedPersonalBest);sFastestTime.classList.toggle('fastest-lap-orange',!isAbsoluteSessionBest&&!improvedPersonalBest);
 const sortedPenalties=[...(state.comment_penalties||[])].sort((a,b)=>String(b.time||b.at||'').localeCompare(String(a.time||a.at||''))); const penaltyMarkup=sortedPenalties.length?sortedPenalties.map(p=>`<div class="penalty-row sprint-comment-penalty" title="${escapePenaltyHtml(fullPenaltyText(p))}"><span class="penalty-standard-two-line"><span class="penalty-standard-header">${escapePenaltyHtml(penaltyHeaderText(p))}</span><span class="penalty-standard-detail">${escapePenaltyHtml(penaltyDetailText(p))}</span></span><span class="penalty-landscape-compact"><span class="penalty-landscape-name">${escapePenaltyHtml(p?.driver||'—')}</span><span class="penalty-landscape-duration">${escapePenaltyHtml(penaltyDurationLabel(p))}</span></span></div>`).join(''):'<div class="empty">Aucune pénalité</div>';
 penalties.innerHTML=penaltyMarkup;
 if(document.getElementById('endurancePenalties'))endurancePenalties.innerHTML=penaltyMarkup;
 paceTop8.innerHTML=state.pace_top8.map(d=>`<div class="pace-row"><span class="pace-rank">${d.pace_rank}<small class="pace-general-pos">P${d.pos}</small></span><span><b>${formatDriverName(d.driver)}</b><br><span class="label">Kart ${d.apex}</span></span><b title="Moyenne calculée sur ${d.pace5_laps||0} tour(s)">${d.pace5}</b></div>`).join('');
 quickTable.innerHTML=state.quick_change.map(q=>{const cls=q.kart_delta.startsWith('-')?'delta-good':q.kart_delta.startsWith('+')?'delta-bad':'';return `<tr><td class="pos">${q.queue}</td><td>${q.pit_time}</td><td><b>${q.pace_rank}</b></td><td>${q.previous_team}</td><td>${q.kart}</td><td>${q.avg5}</td><td class="${cls}">${q.kart_delta}</td></tr>`}).join('');
 driverSelect.innerHTML=state.drivers.map(d=>`<option ${d.driver===state.followed_driver?'selected':''}>${d.driver}</option>`).join('');
 if(state.qualif_crossing&&state.qualif_crossing.event_id!==lastCrossEvent){lastCrossEvent=state.qualif_crossing.event_id;const isBest=Boolean(state.qualif_crossing.is_session_best);crossPos.textContent='P'+state.qualif_crossing.position;crossBest.classList.toggle('show',isBest);crossDelta.textContent=state.qualif_crossing.delta;crossDelta.classList.toggle('delta-first',isBest);crossDelta.classList.toggle('delta-behind',!isBest);crossReference.textContent=state.qualif_crossing.reference_driver||'—';crossingOverlay.classList.add('show');clearTimeout(crossTimer);crossTimer=setTimeout(async()=>{crossingOverlay.classList.remove('show');await api('/api/clear-crossing')},6000)}
 if(currentMode!=='analyzer')top8PitOverlay.classList.remove('show');if(state.generic_alert&&state.generic_alert.event_id!==lastGenericEvent){lastGenericEvent=state.generic_alert.event_id;if(state.generic_alert.kind==='top8_pit_entry'&&currentMode==='analyzer'){top8AlertTeam.textContent=state.generic_alert.team||'—';top8AlertPosition.textContent='P'+(state.generic_alert.position||'—')+' / Top 8';top8PitOverlay.classList.add('show')}else if(state.generic_alert.kind!=='top8_pit_entry'){alertTitle.textContent=state.generic_alert.title;alertLine1.textContent=state.generic_alert.line1;alertLine2.textContent=state.generic_alert.line2;genericOverlay.classList.add('show')}}
 renderQualificationFocus();
 if(typeof renderAnalyzer==='function')renderAnalyzer();
}
function reconnectLive(){connectApexBrowser(true)}
async function changeCircuit(){
 if(!circuitSelectElement?.value)return;
 const nextCircuitId=circuitSelectElement.value;
 document.getElementById('homeCircuit')?.classList.remove('needs-selection');
 // Coupe d'abord l'ancienne piste afin qu'aucune trame tardive ne puisse être envoyée.
 closeApexBrowserSocket();
 apexBrowserCircuitId=null;
 rowLapSignatures.clear();
 endurancePitStatuses.clear();enduranceOutUntil.clear();
 lastCrossEvent=null;lastGenericEvent=null;
 crossingOverlay.classList.remove('show');genericOverlay.classList.remove('show');top8PitOverlay.classList.remove('show');
 remainingCountdownMs=null;remainingCountdownPerfAt=0;remainingCountdownDirectSyncAt=0;
 state={...(state||{}),circuit_id:nextCircuitId,drivers:[],followed_driver:'',followed:null,penalties:[],quick_change:[],qualif_crossing:null,generic_alert:null,time_remaining:'—',apex_laps_remaining:'—',session_best:{driver:'—',lap:'—'},fastest_last_lap:{driver:'—',lap:'—'}};
 render();
 await api('/api/circuit',{circuit_id:nextCircuitId});
}function followSelected(){api('/api/follow',{driver:driverSelect.value})}function testCrossing(){api('/api/test-crossing',{lap:lapValue.value})}function addPenalty(){api('/api/add-penalty',{driver:driverSelect.value,penalty:penaltyValue.value})}function moveDriver(){api('/api/move',{driver:driverSelect.value,pos:movePos.value})}function addQuickChange(){api('/api/add-quick-change',{previous_team:qcTeam.value,pace_rank:qcRank.value,kart:qcKart.value,avg5:qcAvg.value,kart_delta:'--'})}function popQuickChange(){api('/api/pop-quick-change')}function testTop8PitEntry(){api('/api/test-top8-pit-entry')}function clearAlert(){genericOverlay.classList.remove('show');api('/api/clear-alert')}function clearTop8Alert(){top8PitOverlay.classList.remove('show');api('/api/clear-alert')}
document.getElementById('iphoneFrame').addEventListener('load',resetPreviewViewport);
document.getElementById('iphonePreview').addEventListener('click',e=>{if(e.target.id==='iphonePreview')toggleIphonePreview(false)});document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(document.getElementById('sprintFocus')?.classList.contains('show'))closeSprintFocus();else if(document.getElementById('qualificationFocus')?.classList.contains('show'))closeQualificationFocus();else toggleIphonePreview(false)}});




window.changeCircuit=changeCircuit;
circuitSelectElement?.addEventListener('change',changeCircuit);
