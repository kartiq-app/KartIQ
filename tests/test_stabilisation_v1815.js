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
