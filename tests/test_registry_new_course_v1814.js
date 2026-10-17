/* V1814 regression: a committed New KV Race remains empty until a real kart event.
   This covers the bug: immediate 15 blank KVs after clicking New Course. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('static/js/spotter/spotter.js','utf8');
const clone=x=>JSON.parse(JSON.stringify(x));
const memory=new Map();
const state={kartTrackingEnabled:true,kartRegistry:{KV01:{kv:'KV01',history:[{team:'PREVIOUS COURSE',at:1}]}}};
let createCalls=0,renderCalls=0,messages=[],button={disabled:false,textContent:'NOUVELLE COURSE KV'};
const header={insertAdjacentElement(_where,node){messages.push(node)}};
const overlay={querySelector(selector){if(selector.includes('data-spotter-course-message'))return messages.at(-1)||null;if(selector.includes('spotter-registry-head'))return header;}};
const context={
 spotterState:state,SPOTTER_STORAGE_KEY:'spotter_state',SPOTTER_APP_RELEASE:'7.2.1814',
 localStorage:{getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)},
 velocityWorkspaceStorageKey:k=>k,spotterClone:clone,
 spotterRefreshKartRegistry:()=>{renderCalls++},
 document:{querySelector:()=>button,getElementById:id=>id==='spotterRegistryOverlay'?overlay:null,createElement:()=>({style:{},setAttribute(){}})},
 confirm:()=>true,alert:()=>{throw Error('unexpected alert')},
 window:{},console,JSON,Date,Math,Object,String,Array,Number,Boolean,
 setTimeout:()=>100,clearTimeout:()=>{},
 fetch:async (url,opts)=>{
  if(opts?.method==='POST'){
   createCalls++;
   assert.equal(JSON.parse(opts.body).run_id,'old-run');
   return {ok:true,status:200,json:async()=>({ok:true,run_id:'fresh-run',registry:{}})};
  }
  if(url==='/api/spotter-registry')return {ok:true,status:200,json:async()=>({ok:true,run_id:'old-run',registry:{KV01:state.kartRegistry.KV01||{}}})};
  throw Error('Unexpected URL '+url);
 }
};
vm.createContext(context);
const begin=source.indexOf('let spotterAddKartDraft=null;');
const end=source.indexOf('// V7.2.1795 — Mode de course dans Spotter',begin);
assert(begin>0&&end>begin);
// Functions from this section are declarations; they may reference helpers only when called.
vm.runInContext(source.slice(begin,end),context);
vm.runInContext("spotterRefreshKartRegistry=()=>{renderCalls++}",Object.assign(context,{renderCalls:0}));
(async()=>{
 vm.runInContext("spotterRegistryRunId='old-run';spotterRegistryReady=true",context);
 await vm.runInContext('spotterStartNewKartCourse()',context);
 assert.equal(createCalls,1);assert.equal(vm.runInContext('spotterRegistryRunId',context),'fresh-run');
 assert.equal(Object.keys(state.kartRegistry).length,0,'new race must start EMPTY');
 assert.equal(memory.get('velocity_spotter_registry_run_v1811'),'fresh-run');
 assert(context.renderCalls>0,'registry view should update immediately');
 assert.match(messages.at(-1).textContent,/reg istre|registre vidé/i);
 assert.equal(button.disabled,false);
 const past=await vm.runInContext('spotterPullRegistry()',context);
 assert.equal(past,false,'an in-flight GET from previous race must be ignored');
 assert.equal(vm.runInContext('spotterRegistryRunId',context),'fresh-run');
 assert.equal(Object.keys(state.kartRegistry).length,0);

 // A new Analyzer ranking is not a new assignment: cannot create a ghost KV.
 const start=source.indexOf('function spotterSaveAnalyzerPotentials()');
 const stop=source.indexOf('function spotterDisplayPotential(',start);
 assert(start>0&&stop>start);
 const analyzerCtx={spotterState:state,window:{velocityKartScoreRankings:()=>[{kv:'KV01',potential:98.8},{kv:'KV02',potential:77.2}]},
 spotterLiveState:()=>({kart_scoring_epoch:'abc'}),spotterValidScore:x=>Number.isFinite(Number(x)),
 spotterRegistryEnsure:()=>{throw Error('Analyzer must not create a KV')},spotterScheduleRegistryPush:()=>{},Math,String,Number};
 vm.createContext(analyzerCtx);vm.runInContext(source.slice(start,stop),analyzerCtx);
 vm.runInContext('spotterSaveAnalyzerPotentials()',analyzerCtx);
 assert.equal(Object.keys(state.kartRegistry).length,0,'ranking must not repopulate fresh registry');
 state.kartRegistry.KV01={kv:'KV01',history:[{team:'NEW',at:2}]};
 vm.runInContext('spotterSaveAnalyzerPotentials()',analyzerCtx);
 assert.equal(state.kartRegistry.KV01.analyzerPotential,98.8,'tracked kart must receive its score');
 assert.equal(Object.keys(state.kartRegistry).length,1,'untracked KV02 must remain absent');
 console.log('V1814 OK: new race explicit empty, stale GET ignored, no ghost KV, tracked score preserved');
})().catch(err=>{console.error(err);process.exitCode=1});
