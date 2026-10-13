/* V7.2.1810 - node tests/test_registry_live_v1810.js */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const src=fs.readFileSync('static/js/spotter/spotter.js','utf8');
const begin=src.indexOf('function spotterRegistryShortTeam(');
const end=src.indexOf('\nfunction spotterExportKartRegistry(',begin);
assert(begin>0&&end>begin);
const escapeHtml=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const state={kartTrackingEnabled:true,
 assignments:{b:{kv:'KV02',status:'track',teamLabel:'ÉQUIPE BLEUE'},n:{kv:'KV09',status:'track',teamLabel:'ÉQUIPE OR'},r:{kv:'KV10',status:'track',teamLabel:'ÉQUIPE ROUGE'}},
 kartRegistry:{
 KV10:{kv:'KV10',trace:'active',speed:{epoch:'race',potential:103.578,recent:104.1,confirmed:false},history:[{team:'apex:22000',teamLabel:'ANCIENNE ÉQUIPE',score:68}]},
 KV02:{kv:'KV02',trace:'active',speed:{epoch:'race',potential:62.373,recent:63.002,confirmed:true},history:[{team:'apex:21987',score:77}]},
 KV09:{kv:'KV09',trace:'active',speed:{epoch:'race',potential:99.999,recent:100.9,confirmed:true},history:[]}
 }};
const drivers={b:{apex:12,track_timer:'0:09',last:'62.373',team:'ÉQUIPE BLEUE',status:'track'},n:{apex:32,track_timer:'0:47',last:'1:40.456',team:'ÉQUIPE OR',status:'track'},r:{apex:42,track_timer:'1:02:33',last:'103.578',team:'ÉQUIPE ROUGE',status:'track'}};
const ctx=vm.createContext({spotterRegistrySortMode:'default',spotterState:state,
 spotterKvNumber:kv=>Number(String(kv).replace(/[^\d]/g,'')),spotterKartPotential:kv=>({KV02:80.3,KV09:99,KV10:95})[kv]??null,
 spotterDisplayPotential:kv=>String(({KV02:80.3,KV09:99,KV10:95})[kv]??'—'),spotterFindDriver:key=>drivers[key]||null,
 spotterDriverByKey:key=>key==='apex:21987'?{team:'HISTORIQUE BLEU'}:null,
 spotterStableTeamLabel:(d,previous)=>d?.team||previous,spotterLiveState:()=>({kart_scoring_epoch:'race'}),
 spotterDisplayName:v=>String(v??'—'),spotterRegistryCounts:()=>({active:3,total:3}),spotterEscape:escapeHtml,spotterScoreTone:score=>score>=82?'high':score>=65?'mid':'low',
 document:null});
vm.runInContext(src.slice(begin,end),ctx);
const evaluate=code=>vm.runInContext(code,ctx);
assert.equal(evaluate('spotterRegistryFormatChrono(62.373)'),'1:02.373');
assert.equal(evaluate('spotterRegistryFormatChrono(103.578)'),'1:43.578');
assert.equal(evaluate('spotterRegistryFormatChrono("1:40.456")'),'1:40.456');
assert.equal(evaluate('spotterRegistryTrackSeconds({track_timer:"0:47",status:"track"})'),2820);
assert.equal(evaluate('spotterRegistryTrackSeconds({track_timer:"1:02:33",status:"track"})'),3753);
assert.equal(evaluate('spotterRegistryTrackSeconds({track_timer:"0:47",status:"pit"})'),null);
assert.equal(evaluate('spotterRegistryTrackLabel(2820)'),'0:47:00');
const ids=html=>[...html.matchAll(/<td class="spotter-registry-kv">(KV\d+)/g)].map(m=>m[1]).join(',');
let html=evaluate('spotterRegistryRowsHtml()');
assert.equal(ids(html),'KV02,KV09,KV10');
for(const label of ['NOTE','KART','ÉQUIPE ACTUELLE','CHRONO POT.','CHRONO RÉC.','DERNIER','FIABILITÉ'])assert(html.includes('>'+label+'</th>'));
assert.match(html,/1:02\.373/);assert.match(html,/1:43\.578/);assert.match(html,/0:47:00/);
assert.match(html,/1:02:33/);assert.match(html,/HISTORIQUE BLEU/);assert.match(html,/ANCIENNE ÉQUIPE/);
assert.match(html,/spotter-registry-rating gold">99/);assert.match(html,/spotter-registry-rating green">95/);assert.match(html,/spotter-registry-rating orange">80\.3/);
assert.equal((html.match(/<tr class="spotter-registry-grid-row">/g)||[]).length,3);
const table={scrollLeft:321,scrollTop:104,dataset:{},innerHTML:'old'};
const count={textContent:''};const overlay={querySelector:query=>query==='.spotter-registry-table'?table:query==='[data-spotter-registry-count]'?count:null};
ctx.document={getElementById:id=>id==='spotterRegistryOverlay'?overlay:null};
evaluate('spotterRefreshKartRegistry({force:true})');
assert.equal(table.scrollLeft,321);assert.equal(table.scrollTop,104);assert.equal(ids(table.innerHTML),'KV02,KV09,KV10');
evaluate('spotterSetKartRegistrySort("note")');
assert.equal(ids(table.innerHTML),'KV09,KV10,KV02');
evaluate('spotterSetKartRegistrySort("relay")');
assert.equal(ids(table.innerHTML),'KV10,KV09,KV02');
evaluate('spotterSetKartRegistrySort("default")');
assert.equal(ids(table.innerHTML),'KV02,KV09,KV10');
assert.equal(table.scrollLeft,321);
assert.match(fs.readFileSync('static/css/62-velocity-lab.css','utf8'),/kart-speed-rating\.orange\{color:#ff7300/);
const analyzer=fs.readFileSync('static/js/endurance/analyzer.js','utf8');
assert.match(analyzer,/velocityKartColorTone\(entry\.potential\)/);assert.match(analyzer,/velocityKartColorTone\(entry\.recentScore\)/);
console.log('V1810 registry tests: ordering, potential colors, M:SS.mmm, Apex track duration, historical labels, global scroll preservation OK');
