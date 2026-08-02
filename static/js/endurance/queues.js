/* KartIQ V6.2.0 — files de karts Endurance persistantes */
const KART_QUEUE_STORAGE='kartiq-endurance-kart-queues-v1';
let kartQueueState={count:1,queues:[[]],selected:null};
function normalizeKartQueueState(value){
 const count=Math.max(1,Math.min(3,Number(value?.count)||1));
 const queues=Array.from({length:count},(_,i)=>Array.isArray(value?.queues?.[i])?value.queues[i].map(v=>String(v).trim()).filter(Boolean):[]);
 return {count,queues,selected:null};
}
function loadKartQueues(){try{kartQueueState=normalizeKartQueueState(JSON.parse(localStorage.getItem(KART_QUEUE_STORAGE)||'null'))}catch(_){kartQueueState=normalizeKartQueueState(null)}renderKartQueues()}
function saveKartQueues(){localStorage.setItem(KART_QUEUE_STORAGE,JSON.stringify({count:kartQueueState.count,queues:kartQueueState.queues}));if(typeof analyzerSaveSession==='function'&&!analyzerSessionRestoreLock)analyzerSaveSession('queues-update')}
function queueLetter(i){return String.fromCharCode(65+i)}
function setKartQueueCount(count){
 count=Math.max(1,Math.min(3,Number(count)||1));
 while(kartQueueState.queues.length<count)kartQueueState.queues.push([]);
 kartQueueState.queues=kartQueueState.queues.slice(0,count);kartQueueState.count=count;kartQueueState.selected=null;saveKartQueues();renderKartQueues();
}
function addKartToQueue(queueIndex){
 const raw=window.prompt('Numéro du kart à ajouter à la file '+queueLetter(queueIndex)+' :','');
 if(raw===null)return;const number=String(raw).trim();if(!number)return;
 kartQueueState.queues[queueIndex].push(number);kartQueueState.selected={queue:queueIndex,index:kartQueueState.queues[queueIndex].length-1};saveKartQueues();renderKartQueues();
}
function selectQueueKart(queue,index){kartQueueState.selected={queue,index};renderKartQueues()}
function moveSelectedQueueKart(direction){
 const s=kartQueueState.selected;if(!s)return;const q=kartQueueState.queues[s.queue];const next=s.index+direction;if(next<0||next>=q.length)return;
 [q[s.index],q[next]]=[q[next],q[s.index]];s.index=next;saveKartQueues();renderKartQueues();
}
function removeSelectedQueueKart(){const s=kartQueueState.selected;if(!s)return;kartQueueState.queues[s.queue].splice(s.index,1);kartQueueState.selected=null;saveKartQueues();renderKartQueues()}
function resetKartQueues(){if(!window.confirm('Réinitialiser toutes les files de karts ?'))return;kartQueueState={count:kartQueueState.count,queues:Array.from({length:kartQueueState.count},()=>[]),selected:null};saveKartQueues();renderKartQueues()}
function renderKartQueues(){
 const host=document.getElementById('kartQueues');if(!host)return;host.style.setProperty('--queue-count',kartQueueState.count);
 document.querySelectorAll('[data-queue-count]').forEach(btn=>btn.classList.toggle('active',Number(btn.dataset.queueCount)===kartQueueState.count));
 host.innerHTML=kartQueueState.queues.map((queue,qi)=>`<section class="kart-queue"><div class="kart-queue-head"><div><span class="kart-queue-name">FILE ${queueLetter(qi)}</span>${queue.length?'<span class="kart-queue-first-label">1er DISPONIBLE</span>':''}</div><button class="queue-add-btn" type="button" onclick="addKartToQueue(${qi})">＋ AJOUTER UN KART</button></div><div class="queue-track">${queue.length?queue.map((kart,ki)=>`${ki?'<span class="queue-arrow">›</span>':''}<article class="queue-kart-card ${ki===0?'first ':''}${kartQueueState.selected?.queue===qi&&kartQueueState.selected?.index===ki?'selected':''}" onclick="selectQueueKart(${qi},${ki})" role="button" tabindex="0" aria-label="Kart ${kart}, position ${ki+1}"><img class="queue-kart-image" src="/static/assets/RT10_main.png" alt=""><div class="queue-kart-number">${kart}</div><div class="queue-kart-position">${ki+1}${ki===0?'er':'e'}</div></article>`).join(''):'<div class="queue-empty">Aucun kart dans cette file</div>'}</div></section>`).join('');
 const s=kartQueueState.selected,selected=s?kartQueueState.queues[s.queue]?.[s.index]:null;
 const label=document.getElementById('queueSelectionLabel');if(label)label.textContent=selected?`Kart ${selected} sélectionné — File ${queueLetter(s.queue)}, position ${s.index+1}`:'Cliquez sur un kart pour le déplacer ou le retirer.';
 const advance=document.getElementById('queueAdvanceBtn'),back=document.getElementById('queueBackBtn'),remove=document.getElementById('queueRemoveBtn');
 if(advance)advance.disabled=!s||s.index<=0;if(back)back.disabled=!s||s.index>=kartQueueState.queues[s.queue].length-1;if(remove)remove.disabled=!s;
 if(typeof renderAnalyzerQueueAdvice==='function')renderAnalyzerQueueAdvice();
}

