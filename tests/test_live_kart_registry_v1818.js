'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const spot=fs.readFileSync('static/js/spotter/spotter.js','utf8');
const core=fs.readFileSync('static/js/core/core.js','utf8');
const analyzer=fs.readFileSync('static/js/endurance/analyzer.js','utf8');
const htmlEscape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const driver=(id,name,num,timer,last)=>({apex_row:id,driver:name,team:name,apex:num,track_timer:timer,last,laps:4,status:'track'});
const drivers=[driver(7,'BLEU',14,'0:08','1:02.373'),driver(9,'ROUGE',20,'0:12','1:01.777')];
const state={kartTrackingEnabled:true,configured:true,queue:[],maintenance:[],incoming:[],assignments:{'apex:7':{kv:'KV02',status:'track',teamLabel:'BLEU'}},kartRegistry:{KV02:{kv:'KV02',trace:'active',speed:{epoch:'e',potential:null,recent:62.373,provisional:true,validLaps:1},history:[{team:'BLEU',score:88}]}}};
const snapshot={drivers,kart_scoring_epoch:'e'};
const ctx={spotterRegistrySortMode:'default',spotterState:state,window:{velocityKartIdentityForDriver:d=>d.apex_row===7?{kv:'KV02',verified:true}:null,velocityKartScoreRankings:()=>[{kv:'KV02',potential:null,recentScore:88.7,confirmed:false}]},spotterDriverKey:d=>'apex:'+d.apex_row,
 spotterKvNumber:kv=>Number(String(kv).replace(/\D/g,'')),spotterFindDriver:key=>drivers.find(d=>'apex:'+d.apex_row===key),spotterDriverByKey:()=>null,
 spotterStableTeamLabel:d=>d?.team||'—',spotterLiveState:()=>snapshot,spotterKartPotential:()=>null,spotterDisplayName:v=>String(v||'—'),spotterEscape:htmlEscape,
 spotterValidScore:v=>v!==null&&v!==undefined&&Number.isFinite(Number(v))&&Number(v)>=0&&Number(v)<=100,spotterScoreTone:v=>v>=82?'high':'low'};
vm.createContext(ctx);
const start=spot.indexOf('function spotterRegistryShortTeam('),end=spot.indexOf('\nfunction spotterSetKartRegistrySort(',start);
assert(start>=0&&end>start);vm.runInContext(spot.slice(start,end),ctx);
let html=vm.runInContext('spotterRegistryRowsHtml()',ctx);
assert.match(html,/ÉQUIPE ACTUELLE/);assert.match(html,/EN PISTE/);assert.match(html,/TOURS/);
assert.match(html,/BLEU/);assert.match(html,/ROUGE/);assert.match(html,/0:08:00/);assert.match(html,/0:12:00/);
assert.match(html,/1:02\.373/);assert.match(html,/1:01\.777/);
assert.match(html,/88\.7\*/,'provisional from first observed lap');
assert.match(html,/data-kv="LIVE:apex:9"/);
assert.ok(html.indexOf('data-kv="LIVE:apex:9"')>html.indexOf('data-kv="KV02"'),'live rows follow live position');
assert.match(html,/spotter-registry-kv">—<\/td>/,'never invent a physical KV');
assert.equal(Object.keys(state.kartRegistry).length,1,'LIVE display must not insert database registry rows');
ctx.spotterState.kartRegistry={};ctx.spotterState.assignments={};
html=vm.runInContext('spotterRegistryRowsHtml()',ctx);
assert.match(html,/BLEU/);assert.match(html,/ROUGE/);
assert.equal((html.match(/spotter-registry-grid-row/g)||[]).length,2,'blank SQL registry still displays both Apex drivers');
assert.equal(Object.keys(state.kartRegistry).length,0);
// An unverified kart can display a clear LIVE* observation, but never acquire a KV.
ctx.window.velocityKartScoreRankings=()=>[
 {id:'LIVE:apex:7',recentScore:92.1,potential:null},
 {id:'LIVE:apex:9',recentScore:81.2,potential:null}];
html=vm.runInContext('spotterRegistryRowsHtml()',ctx);
assert.match(html,/81\.2\*/);
assert.match(html,/spotter-registry-kv">—<\/td>/);
assert.equal(Object.keys(state.kartRegistry).length,0);
// First lap yields provisional REC, but NOT full eight-lap POT window.
{
 const start=core.indexOf('function velocityKartScoreMedian('),end=core.indexOf('function velocityKartScoreProfile(',start);
 const c={Number,Math,Date};vm.createContext(c);vm.runInContext(core.slice(start,end),c);
 const p={recentRaw:[{serial:1,seconds:62.373}],recent:null,best:null,windows:[],recentProvisional:true,relay:1,team:'BLUE',confirmed:false};
 c.velocityKartScoreEvaluate(p);assert.equal(p.recent,62.373);assert.equal(p.best,null);assert.equal(p.recentProvisional,true);
 p.recentRaw=Array.from({length:8},(_,i)=>({serial:i+1,seconds:62.373+(i%3)*.03}));
 c.velocityKartScoreEvaluate(p);assert.notEqual(p.best,null);assert.equal(p.recentProvisional,false);
}
// Analyzer: live Velocity Score may be 42, but NOTE KART is the physical POT/REC.
{
 const start=analyzer.indexOf('function analyzerPhysicalKartForDriverLabel(');
 const end=analyzer.indexOf('function analyzerRows(',start);
 const c={window:{velocityKartIdentityForDriver:d=>d.apex_row===7?{kv:'KV02',verified:true}:null,
   velocityKartScoreRankings:()=>[{id:'KV:KV02',kv:'KV02',potential:91.2,recentScore:88.7}]},
  velocityKartScoreIdentity:d=>d.apex_row===7?{id:'KV:KV02',kv:'KV02',unverified:false}:{id:'LIVE:apex:9',unverified:true},
  Number,Math};
 vm.createContext(c);vm.runInContext(analyzer.slice(start,end),c);
 assert.equal(c.analyzerPhysicalKartRating(drivers[0]).value,91.2);
 assert.equal(c.analyzerPhysicalKartRating(drivers[0]).kv,'KV02');
 assert.equal(c.analyzerPhysicalKartRating(drivers[1]).kv,null);
 assert.equal(c.analyzerPhysicalKartRating(drivers[1]).value,null);
 c.window.velocityKartScoreRankings=()=>[
  {id:'LIVE:apex:9',recentScore:81.2,potential:null},
  {id:'LIVE:apex:7',recentScore:92.1,potential:null}];
 assert.equal(c.analyzerPhysicalKartRating(drivers[1]).value,81.2);
 assert.equal(c.analyzerPhysicalKartRating(drivers[1]).kv,null);
 assert.equal(c.analyzerPhysicalKartRating(drivers[1]).liveOnly,true);
 c.window.velocityKartScoreRankings=()=>[{id:'KV:KV02',kv:'KV02',potential:null,recentScore:88.7}];
 assert.equal(c.analyzerPhysicalKartRating(drivers[0]).value,88.7);
 assert.equal(c.analyzerPhysicalKartRating(drivers[0]).provisional,true);
}
// General ranking is a physical KV identifier & physical NOTE, never a relay Velocity Score.
assert.match(analyzer,/<th>KV<\/th><th>NOTE KART<\/th>/);
assert.match(analyzer,/kartRating:analyzerPhysicalKartRating\(d,rankings\)/);
assert.match(analyzer,/x\.kartRating\?\.kv\|\|'—'/);
assert.doesNotMatch(analyzer,/<th>KART V\.<\/th>/);
console.log('V1818: Apex registry instant, no fake KV, live on-track+last, provisional first lap, confirmed threshold untouched, Analyzer physical NOTE OK');

// Regression V1819: old registry rows must not hide the current Apex drivers.
ctx.spotterState.kartRegistry={KV99:{kv:'KV99',history:[{team:'ANCIENNE EQUIPE',score:90}]}};
ctx.window.velocityKartIdentityForDriver=()=>null;
html=vm.runInContext('spotterRegistryRowsHtml()',ctx);
assert.ok(html.indexOf('data-kv="LIVE:apex:7"')<html.indexOf('data-kv="KV99"'));
assert.ok(html.indexOf('data-kv="LIVE:apex:9"')<html.indexOf('data-kv="KV99"'));
