/* V1811 - test stale browser KV histories can never be replayed into new runs */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('static/js/spotter/spotter.js','utf8');
const begin=source.indexOf('let spotterAddKartDraft=null;');
const end=source.indexOf('function spotterValidScore(score)',begin);
assert(begin>0&&end>begin);
const storage=new Map();
const store={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)};
const context={spotterState:{kartRegistry:{KV03:{history:[{team:'OLD RACE',at:1}]}},kartTrackingEnabled:true},
 localStorage:store,velocityWorkspaceStorageKey:k=>k,spotterClone:v=>JSON.parse(JSON.stringify(v)),
 spotterRefreshKartRegistry:()=>{},spotterLiveState:()=>({drivers:[]}),spotterRegistrySeedVerifiedLive:()=>{},
 SPOTTER_STORAGE_KEY:'spotter-state',SPOTTER_APP_RELEASE:'7.2.1811',document:{},window:{},console,setTimeout:()=>123,clearTimeout:()=>{},Date,JSON,
 fetch:()=>{},};
vm.createContext(context);vm.runInContext(source.slice(begin,end),context);
const execute=code=>vm.runInContext(code,context);
let active='A',posted=[];
context.fetch=async(url,opts)=>{
 if(!opts||opts.method!=="POST"){return {ok:true,json:async()=>({ok:true,run_id:active,registry:active==='A'?{}:{KV01:{history:[{team:'BETA',at:2}]}}})}}
 posted.push(JSON.parse(opts.body));
 return {ok:posted.at(-1).run_id===active,status:posted.at(-1).run_id===active?200:409};
};
(async()=>{
 assert.equal(await execute('spotterPullRegistry()'),true);
 assert.equal(execute('spotterRegistryRunId'),'A');
 assert.equal(Object.keys(context.spotterState.kartRegistry).length,0);
 assert([...storage.keys()].some(key=>key.includes('unsorted_backup')));
 context.spotterState.kartRegistry={KV04:{history:[{team:'FIRST',at:11}]}};
 await execute('spotterPushRegistry()');
 assert.equal(posted.length,1);assert.equal(posted[0].run_id,'A');
 active='B';assert.equal(await execute('spotterPullRegistry()'),true);
 assert.equal(execute('spotterRegistryRunId'),'B');
 assert.equal(context.spotterState.kartRegistry.KV04,undefined);
 assert.equal(context.spotterState.kartRegistry.KV01.history[0].team,'BETA');
 await execute('spotterPushRegistry()');
 assert.equal(posted.at(-1).run_id,'B');
 console.log('V1811 client tests: archive old local, block cross-race data, adopt new run, correct POST scope OK');
})().catch(error=>{console.error(error);process.exitCode=1});
