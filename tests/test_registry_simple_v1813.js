/* No 14 KV/0 KV blink even on bad GET; a REAL new run still clears safely. */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('static/js/spotter/spotter.js','utf8');
const begin=source.indexOf('let spotterAddKartDraft=null;');
const end=source.indexOf('function spotterValidScore(score)',begin);
assert(begin>0&&end>begin);
const stored=new Map();const clone=x=>JSON.parse(JSON.stringify(x));
const first={};for(let i=1;i<=14;i++)first[`KV${String(i).padStart(2,'0')}`]={kv:`KV${String(i).padStart(2,'0')}`,history:[{team:'DUNOIS',at:i}]};
const state={kartRegistry:clone(first),kartTrackingEnabled:true};
let responses=[],refreshes=0;
const context={spotterState:state,localStorage:{getItem:k=>stored.get(k)||null,setItem:(k,v)=>stored.set(k,v)},
 velocityWorkspaceStorageKey:k=>k,spotterClone:clone,spotterRefreshKartRegistry:()=>{refreshes++},
 SPOTTER_STORAGE_KEY:'state',SPOTTER_APP_RELEASE:'7.2.1813',
 window:{velocityKartScoreHydrateRegistry:()=>{}},console,Date,JSON,Object,Array,Number,String,
 setTimeout:()=>0,clearTimeout:()=>{},fetch:async()=>{
  const next=responses.shift();if(!next)throw Error('Unexpected GET');
  return {ok:true,json:async()=>next};
 }};
vm.createContext(context);vm.runInContext(source.slice(begin,end),context);
const read=()=>vm.runInContext('spotterPullRegistry()',context);
const run=()=>vm.runInContext('spotterRegistryRunId',context);
(async()=>{
 responses=[{ok:true,run_id:'A',registry:first}];assert.equal(await read(),true);
 assert.equal(run(),'A');assert.equal(Object.keys(state.kartRegistry).length,14);
 responses=[{ok:true,run_id:'A',registry:{}}];assert.equal(await read(),true);
 assert.equal(Object.keys(state.kartRegistry).length,14,'same-run empty must not blink');
 responses=[{ok:true,run_id:'A',registry:{KV01:first.KV01}}];await read();
 assert.equal(Object.keys(state.kartRegistry).length,14,'truncated same-run response must not blink');
 responses=[{ok:true,run_id:'B',registry:{}},{ok:true,run_id:'A',registry:first}];
 assert.equal(await read(),false,'inconsistent run ids must be ignored');
 assert.equal(run(),'A');assert.equal(Object.keys(state.kartRegistry).length,14);
 responses=[{ok:true,run_id:'B',registry:{}},{ok:true,run_id:'B',registry:{}}];
 assert.equal(await read(),true);
 assert.equal(run(),'B');assert.equal(Object.keys(state.kartRegistry).length,0,'a verified new course must clear');
 assert([...stored.keys()].some(k=>k.includes('unsorted_backup')),'old run backed up');
 console.log('V1813 frontend: stable 14 KV, no transient blink, verified new run isolated');
})().catch(err=>{console.error(err);process.exitCode=1});
