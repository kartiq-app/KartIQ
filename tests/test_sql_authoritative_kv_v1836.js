'use strict';
// No browser calculation or localStorage authority can change a physical score.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const core=fs.readFileSync('static/js/core/core.js','utf8');
const spotter=fs.readFileSync('static/js/spotter/spotter.js','utf8');
const begin=core.indexOf('function velocityKartScoreRankings(){');
const end=core.indexOf('window.velocityKartScoreRankings=velocityKartScoreRankings;',begin);
assert(begin>0&&end>begin);
const data={
 KV01:{kv:'KV01',autoProvisional:false,history:[{team:'apex:17',at:10}],
       speed:{source:'server-recorder',potential:60,recent:60.2,epoch:'run-1',updatedAt:200}},
 KV02:{kv:'KV02',autoProvisional:true,history:[{team:'apex:28',at:10}],
       speed:{source:'server-recorder',potential:null,recent:58.1,epoch:'run-1',updatedAt:200}},
 KV03:{kv:'KV03',history:[{team:'apex:30',at:10}],
       speed:{source:'browser',potential:30,recent:30,epoch:'run-1',updatedAt:200}}
};
const c={velocityKartScoreEnsureScope:()=>true,state:{kart_scoring_epoch:'run-1'},
 window:{velocityKartScoreSharedSnapshot:{runId:'run-1',epoch:'run-1',registry:data}},
 Number,Math,String,Object};
vm.createContext(c);vm.runInContext(core.slice(begin,end),c);
const rank=()=>JSON.parse(JSON.stringify(c.velocityKartScoreRankings()));
let result=rank();
assert.equal(result.length,2,'browser generated records must never rank');
assert.equal(result.find(x=>x.kv==='KV01').potential,100,'confirmed best defines fleet reference');
assert.equal(result.find(x=>x.kv==='KV02').recentScore,100,
 'unconfirmed faster provisional kart must not redefine verified baseline');
assert.equal(result.find(x=>x.kv==='KV02').potential,null,
 '1-7 observed laps are only a provisional relay note');
data.KV01.history.push({team:'apex:31',at:300,source:'pit_out'});
result=rank();
assert.equal(result.find(x=>x.kv==='KV01').recentScore,null,
 'old relay REC must not appear under a new team before a new lap');
c.state.kart_scoring_epoch='run-2';
assert.equal(rank().length,0,'old scores cannot cross race boundary');
c.window.velocityKartScoreSharedSnapshot={runId:'run-2',epoch:'run-2',registry:{}};
assert.equal(rank().length,0,'a new empty race has no inherited notes');
assert(!spotter.includes('spotterRegistrySyncLiveRelayScores('));
assert(!spotter.includes('spotterSaveAnalyzerPotentials('));
assert(!core.includes('velocityKartScoreOnLap('));
assert.match(core,/window\.velocityKartServerScope/);
assert.match(spotter,/speed\.relayLaps/);
console.log('V1836 OK: SQL epoch, provisional baseline, relay resets, no ghost KV or browser score writers');
