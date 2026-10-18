'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const root=require('node:path').join(__dirname,'..');
const spotter=fs.readFileSync(root+'/static/js/spotter/spotter.js','utf8');
const core=fs.readFileSync(root+'/static/js/core/core.js','utf8');
const clone=x=>JSON.parse(JSON.stringify(x));
// Two devices validate the same pit entrant into DIFFERENT queues.
{
 const start=spotter.indexOf('function spotterSame('),end=spotter.indexOf('function spotterApplyRebasedSnapshot(',start);
 const c={SPOTTER_APP_RELEASE:'7.2.1815',SPOTTER_CLIENT_ID:'test',spotterClone:clone,
  spotterKvNumber:kv=>Number(String(kv||'').replace(/\D/g,''))||0,Date};
 vm.createContext(c);vm.runInContext(spotter.slice(start,end),c);
 const initial={configured:true,queue:[{cardId:'a',kv:'KV01',status:'available'},
  {cardId:'b',kv:'KV02',status:'available'}],incoming:[{id:'i1',team:'RED',returnedKv:'KV03'}],
  maintenance:[],assignments:{RED:{kv:'KV03',status:'track'}}};
 const remote=clone(initial);remote.incoming=[];remote.queue[0].status='reserved';
 remote.queue[0].reservedTeam='RED';remote.assignments.RED={kv:'KV03',status:'pit',pendingReplacementKv:'KV01'};
 const local=clone(initial);local.incoming=[];local.queue[1].status='reserved';
 local.queue[1].reservedTeam='RED';local.assignments.RED={kv:'KV03',status:'pit',pendingReplacementKv:'KV02'};
 assert.equal(c.spotterRebaseFields(initial,local,remote),null,'the second validation must abort');
}
// Full no-quick-change flow: pit-in validated, then pit-out restores track.
{
 const begin=spotter.indexOf('function spotterValidateIncomingNoQuickChange(');
 const end=spotter.indexOf('function spotterMaintenanceSelectionKey(',begin);
 const outBegin=spotter.indexOf('function spotterProcessPitOut(');
 const outEnd=spotter.indexOf('function spotterRefreshVelocityMetrics(',outBegin);
 assert(begin>0&&end>begin&&outBegin>0&&outEnd>outBegin);
 const state={incoming:[{id:'i1',team:'RED',returnedKv:'KV03',returnedKart:'12',pitInAt:100}],
  incomingQueueSelections:{i1:'none'},queue:[],assignments:{RED:{kv:'KV03',status:'track'}},
  freeMode:false,freePitOuts:0};
 const events=[];
 const c={spotterState:state,spotterRememberUndo:()=>{},spotterFindDriver:()=>({kart:12}),
  spotterEnsureAssignment:k=>state.assignments[k],spotterLogMovement:(type,payload)=>events.push({type,payload}),
  saveSpotterFoundation:()=>{},renderSpotterFoundation:()=>{},spotterMetricsForDriver:()=>({score:87,confidence:90}),
  spotterAcknowledgedIncoming:new Map(),spotterPersistAcknowledged:()=>{},
  spotterRegistryAppend:()=>{},spotterRegistryUpdateScore:()=>{},spotterCardId:()=>'',String,Math,Date,Number,Boolean};
 vm.createContext(c);vm.runInContext(spotter.slice(begin,end)+'\n'+spotter.slice(outBegin,outEnd),c);
 assert.equal(c.spotterValidateIncomingNoQuickChange('i1'),true);
 assert.equal(state.assignments.RED.status,'pit');assert.equal(state.incoming.length,0);
 assert.equal(c.spotterProcessPitOut('RED'),true);
 assert.equal(state.assignments.RED.status,'track');
 assert.equal(state.assignments.RED.noQuickChangePending,undefined);
 assert.equal(state.queue.length,0);
 assert.equal(c.spotterProcessPitOut('RED'),false,'duplicate pit-out must not emit second transition');
 assert(events.some(e=>e.type==='pit_out_no_quick_change'));
}
// Same SQL-backed physical profiles must produce same rank on browsers with different local LIVE profiles.
{
 const start=core.indexOf('function velocityKartLocalUnverifiedRankings(');
 const end=core.indexOf('// Récupération facultative des meilleurs chronos KV',start);
 assert(start>0&&end>start);
 const registry={KV01:{speed:{potential:60,recent:60.1,epoch:'epoch-1',confirmed:true}},
                 KV02:{speed:{potential:58,recent:58.2,epoch:'epoch-1',confirmed:true}}};
 const makeCtx=extra=>{
  const c={velocityKartScoreEnsureScope:()=>true,velocityKartScoreMode:()=> 'quick',
   velocityKartScoreStore:{karts:extra},window:{velocityKartScoreSharedSnapshot:{runId:'course-1',epoch:'epoch-1',registry}},
   state:{kart_scoring_epoch:'epoch-1'},Object,Number,Math,String,Array};
  vm.createContext(c);vm.runInContext(core.slice(start,end),c);return c;
 };
 const a=makeCtx({'LIVE:RED':{id:'LIVE:RED',kv:null,best:{seconds:64},recent:64}});
 const b=makeCtx({'LIVE:RED':{id:'LIVE:RED',kv:null,best:{seconds:64},recent:64},'LIVE:BLUE':{id:'LIVE:BLUE',kv:null,best:{seconds:55},recent:55}});
 const get=c=>c.velocityKartScoreRankings().filter(x=>x.kv).map(x=>[x.kv,x.potential,x.recentScore]);
 assert.deepEqual(clone(get(a)),clone(get(b)));
 assert.equal(get(a).find(x=>x[0]==='KV01')[1],65.5);
 assert.equal(get(a).find(x=>x[0]==='KV02')[1],100);
}
console.log('V1815 OK: double validation rejected, no-quick pit-out restored, shared KV scoring deterministic');

// V1817: a valid physical profile remains visible as a labelled provisional
// estimate until the shared reference arrives; it MUST NOT be published as
// an authoritative POT by Spotter.
{
 const start=core.indexOf('function velocityKartLocalUnverifiedRankings(');
 const end=core.indexOf('// Récupération facultative des meilleurs chronos KV',start);
 const c={velocityKartScoreEnsureScope:()=>true,velocityKartScoreMode:()=> 'quick',
  velocityKartScoreStore:{karts:{'KV:KV01':{id:'KV:KV01',kv:'KV01',best:{seconds:60},recent:60.2,confirmed:true}}},
  window:{},state:{kart_scoring_epoch:'epoch-1'},Object,Number,Math,String,Array};
 vm.createContext(c);vm.runInContext(core.slice(start,end),c);
 const fallback=c.velocityKartScoreRankings();
 assert.equal(fallback.length,1);
 assert.equal(fallback[0].potential,100);
 assert.equal(fallback[0].referenceLoading,true);
 assert.equal(fallback[0].localReference,true);
 c.window.velocityKartScoreSharedSnapshot={runId:'run1',epoch:'epoch-1',registry:{
  KV01:{speed:{potential:60,recent:60.2,epoch:'epoch-1'}},
  KV02:{speed:{potential:58,recent:58.2,epoch:'epoch-1'}}}};
 const shared=c.velocityKartScoreRankings();
 assert.equal(shared.find(x=>x.kv==='KV01').potential,65.5);
 assert.equal(shared.find(x=>x.kv==='KV01').referenceLoading,undefined);
}
// Server accepts only new immutable passage events during a CAS conflict.
// The browser must adopt the resulting canonical row (including current
// speed) and also keep events created locally WHILE the POST was in flight.
{
 const start=spotter.indexOf('async function spotterPushRegistry(');
 const end=spotter.indexOf('function spotterPublishKartScoreReference(',start);
 assert(start>0&&end>start);
 const sent={KV01:{speed:{potential:60},history:[{team:'OLD',at:10,score:88}]}};
 const local=clone(sent);
 let releaseFetch;
 const fetchGate=new Promise(resolve=>releaseFetch=resolve);
 const canonical={KV01:{speed:{potential:58},history:[{team:'OLD',at:10,score:88}]},
  KV02:{history:[{team:'BLUE',at:20,score:77}]}};
 let requeued=0,refreshed=0;
 const c={spotterRegistryPushTimer:null,spotterRegistryReady:true,
  spotterRegistryRunId:'race1',spotterRegistryUpdatedAt:1,spotterRegistryWriteInFlight:false,
  spotterState:{kartRegistry:local},spotterClone:clone,spotterSame:(a,b)=>JSON.stringify(a)===JSON.stringify(b),
  clearTimeout:()=>{},spotterScheduleRegistryPush:()=>requeued++,spotterPublishKartScoreReference:()=>{},
  spotterRefreshKartRegistry:()=>refreshed++,spotterPullRegistry:async()=>true,
  spotterRegistryLoading:null,spotterRegistryBackupLocal:()=>{},spotterLastSyncError:'',
  spotterMonitorLeaseOwner:true,localStorage:{setItem:()=>{}},SPOTTER_STORAGE_KEY:'test',SPOTTER_APP_RELEASE:'7.2.1817',
  spotterMonitorLeaseOwner:true,localStorage:{setItem:()=>{}},SPOTTER_STORAGE_KEY:'test',SPOTTER_APP_RELEASE:'7.2.1817',
  spotterUpdateSyncBadge:()=>{},console,Number,Object,String,Set,Date,
  fetch:async()=>{await fetchGate;return {ok:true,status:200,json:async()=>({ok:true,
   registry_updated_at_ms:2,history_merge_only:true,history_events_added:1,registry:canonical})}}};
 vm.createContext(c);vm.runInContext(spotter.slice(start,end),c);
 const pending=c.spotterPushRegistry();
 // This event did not exist when the request was sent.
 local.KV01.history.push({team:'LATE',at:30,score:81});
 local.KV01.speed={potential:57,updatedAt:500};
 releaseFetch();
 pending.then(()=>{
  assert.equal(c.spotterState.kartRegistry.KV01.speed.potential,57);
  assert.deepEqual(clone(c.spotterState.kartRegistry.KV01.history.map(e=>e.team)),['OLD','LATE']);
  assert.equal(c.spotterState.kartRegistry.KV02.history[0].team,'BLUE');
  assert.equal(requeued,1);
  assert.equal(refreshed,1);
  console.log('V1817 OK: concurrent histories, retained pending event, provisional shared reference');
 }).catch(e=>{console.error(e);process.exitCode=1});
}
