/* V1812 regression: a Spotter Quick Change reset cannot blank the KV register. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('static/js/spotter/spotter.js','utf8');
const start=source.indexOf('function spotterApplyRemoteSnapshot(');
const stop=source.indexOf('async function spotterPullSharedState(',start);
assert(start>0&&stop>start);
const history={};
for(let i=1;i<=14;i++)history[`KV${String(i).padStart(2,'0')}`]={kv:`KV${String(i).padStart(2,'0')}`,history:[{team:`TEAM-${i}`,at:i}]};
const state={kartRegistry:JSON.parse(JSON.stringify(history)),kartTrackingEnabled:true,configured:true,mode:3,
 queue:[{cardId:'kart-01',kv:'KV01'}],incoming:[],maintenance:[],assignments:{},lastDriverStatus:{},setupKarts:['X','Y','Z'],setupQueueFiles:[1,2,3],nextKvNumber:15};
const mem=new Map();
const ctx={spotterState:state,spotterDrag:{active:false},spotterSetupDraft:null,spotterApplyingRemote:false,
 spotterUiStep:'live',spotterServerRevision:1,spotterPushInFlight:false,spotterPushQueued:false,
 spotterLastRemoteUpdate:0,spotterLocalMutationAt:0,spotterDeferredRemote:null,spotterSetupRequested:false,
 spotterAcknowledgedIncoming:new Map(),spotterPersistAcknowledged:()=>{},spotterUpdateSyncBadge:()=>{},
 spotterPublishSharedState:()=>{},spotterRenderCurrent:()=>{},renderSpotterFoundation:()=>{},
 spotterMaxSharedKvNumber:()=>14,spotterLiveState:()=>({circuit_id:'dunois'}),
 spotterRemoteMutationAt:()=>1,spotterClone:v=>JSON.parse(JSON.stringify(v)),
 spotterSyncTimer:null,SPOTTER_STORAGE_KEY:'state',SPOTTER_APP_RELEASE:'7.2.1812',
 localStorage:{setItem:(k,v)=>mem.set(k,v)},document:{body:{classList:{contains:()=>false}}},
 spotterLastSyncError:'',spotterConfirmedSnapshot:null,clearTimeout:()=>{},Date,Math,Number,Boolean,JSON,String,Array,Object,console};
vm.createContext(ctx);
vm.runInContext(source.slice(start,stop),ctx);
const snapshot={revision:2,updated_at_ms:123456,configured:false,queue:[],incoming:[],maintenance:[],
 circuit_id:'dunois',assignments:{},setup_karts:['X'],setup_queue_files:[1],queue_mode:1};
vm.runInContext('spotterApplyRemoteSnapshot(snapshot)',Object.assign(ctx,{snapshot}));
assert.equal(Object.keys(state.kartRegistry).length,14,'shared Spotter reset must preserve race KV history');
assert.equal(state.kartRegistry.KV01.history[0].team,'TEAM-1');
assert.equal(state.queue.length,0,'Quick Change queue still resets');
const resetStart=source.indexOf('function resetSpotterFoundation(){');
const resetEnd=source.indexOf('function spotterAllocateKv()',resetStart);
assert(resetStart>0&&resetEnd>resetStart);
Object.assign(ctx,{confirm:()=>true,spotterSetupOrigin:'spotter',saveSpotterFoundation:()=>{},
 spotterAcknowledgedIncoming:new Map(),spotterPersistAcknowledged:()=>{},
 renderSpotterFoundation:()=>{},spotterDeferredRemote:null,spotterSetupDraft:null,spotterSetupRequested:false});
vm.runInContext(source.slice(resetStart,resetEnd),ctx);
vm.runInContext('resetSpotterFoundation()',ctx);
assert.equal(Object.keys(state.kartRegistry).length,14,'local Quick Change reset must preserve history too');
console.log('V1812 no flicker tests: 14 KV retained after remote and local queue resets OK');
