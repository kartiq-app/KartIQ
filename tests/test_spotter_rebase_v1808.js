/* Offline conflict and reset regression tests: node tests/test_spotter_rebase_v1808.js */
'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const js=fs.readFileSync(require('node:path').join(__dirname,'../static/js/spotter/spotter.js'),'utf8');
const start=js.indexOf('function spotterSame('),end=js.indexOf('function spotterApplyRebasedSnapshot(',start);
assert(start>0&&end>start);
const ctx=vm.createContext({SPOTTER_APP_RELEASE:'7.2.1808',SPOTTER_CLIENT_ID:'client-A',
 spotterClone:v=>JSON.parse(JSON.stringify(v??null)),spotterKvNumber:v=>{const x=String(v||'').match(/(\d+)/);return x?Number(x[1]):0},Date});
vm.runInContext(js.slice(start,end),ctx);
const rebase=(base,edited,remote)=>JSON.parse(JSON.stringify(ctx.spotterRebaseFields(base,edited,remote)));
const initial={configured:true,app_release:'7.2.1807',queue:[{cardId:'k1',kv:'KV01',status:'available'}],
 incoming:[{id:'i1',team:'RED',returnedKv:'KV40',returnedCardId:'ret40'}],maintenance:[],
 assignments:{RED:{kv:'KV40',status:'track'}},movement_log:[],next_kv_number:41,
 incoming_queue_selections:{},monitor_primed:true,last_driver_status:{RED:'pit'}};
const local=JSON.parse(JSON.stringify(initial));
local.incoming=[];local.queue.push({cardId:'ret40',kv:'KV40',status:'available'});
local.queue[0].status='reserved';local.assignments.RED.status='pit';
local.movement_log=[{action:'validate',team:'RED'}];
const remote=JSON.parse(JSON.stringify(initial));
remote.queue.push({cardId:'k2',kv:'KV42',status:'available'});remote.next_kv_number=43;
const merged=rebase(initial,local,remote);
assert.equal(merged.incoming.length,0,'validated incoming must not reappear');
assert.deepEqual(merged.queue.map(x=>x.cardId),['k1','k2','ret40']);
assert.equal(merged.queue[0].status,'reserved');
assert.equal(merged.next_kv_number,43);
assert.equal(merged.movement_log.length,1);
const remoteReset={...remote,configured:false,queue:[],incoming:[],maintenance:[],assignments:{}};
assert.equal(rebase(initial,local,remoteReset),null,'a remote reset must win');
const localReset={...local,configured:false,queue:[],incoming:[],maintenance:[],assignments:{}};
assert.equal(rebase(initial,localReset,remote).configured,false,'a local reset should be retried');
const unchanged={...initial};
const remoteEdit=JSON.parse(JSON.stringify(initial));remoteEdit.queue[0].status='reserved';
assert.equal(rebase(initial,unchanged,remoteEdit).queue[0].status,'reserved');
assert(!js.includes("String(remote.app_release||'')!==SPOTTER_APP_RELEASE"),'old release should not be rejected');
assert(js.includes('spotterMonitorLeaseOwner'),'Apex lease must gate observer');
console.log('OK: 7 checks on concurrent actions, reset precedence, older releases, Apex lease');
