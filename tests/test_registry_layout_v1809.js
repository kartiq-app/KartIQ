/* V7.2.1809: node tests/test_registry_layout_v1809.js */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const src = fs.readFileSync('static/js/spotter/spotter.js','utf8');
const begin = src.indexOf('function spotterRegistryShortTeam(');
const end = src.indexOf('\nasync function spotterOpenKartRegistry(', begin);
assert(begin >= 0 && end > begin, 'Registry function must be present');
const state = {
  assignments:{u:{kv:'KV01',status:'track',teamLabel:'AN-VERY-LONG-TEAM-NAME-ABCDEFGHIJKLMNO'},v:{kv:'KV02',status:'track',teamLabel:'AMARI'}},
  kartRegistry:{
    KV01:{kv:'KV01',trace:'active',speed:{epoch:'demo',potential:34.01,recent:34.10,confirmed:true},history:[{team:'TEAM LONG NAME ABCDEFGHIJKLMNOPQRSTUVWXYZ',score:97},{team:'Short Team',score:66}]},
    KV02:{kv:'KV02',trace:'active',speed:{epoch:'demo',potential:34.18,recent:34.22,confirmed:false},history:[{team:'TWO',score:32}]},
    KV03:{kv:'KV03',trace:'interrupted',history:[]}
  }
};
const escapes = x=>String(x??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const ctx = vm.createContext({
  spotterRegistrySortMode:'default', spotterState:state, spotterKvNumber:x=>Number(String(x).replace(/[^\d]/g,'')),
  spotterDriverByKey:key=>null, spotterFindDriver:id=>({apex:id==='u'?4:7,last:'35.347'}),
  spotterStableTeamLabel:(_,label)=>label, spotterLiveState:()=>({kart_scoring_epoch:'demo'}),
  spotterKartPotential:kv=>({KV01:99.2,KV02:85})[kv]??null,
  spotterDisplayPotential:kv=>({KV01:'99.2',KV02:'85'})[kv]??'—',
  spotterDisplayName:v=>String(v||'—'), spotterEscape:escapes,
  spotterValidScore:v=>v!==null&&v!==undefined&&Number.isFinite(Number(v))&&Number(v)>=0&&Number(v)<=100,spotterScoreTone:v=>v>=82?'high':v>=65?'mid':'low'
});
vm.runInContext(src.slice(begin,end),ctx);
const html = vm.runInContext('spotterRegistryRowsHtml()',ctx);
assert(html.startsWith('<table class="spotter-registry-grid">'));
assert.equal((html.match(/<tr class="spotter-registry-grid-row"/g)||[]).length,3);
assert.match(html,/>NOTE KART<\/th>/);
assert.doesNotMatch(html,/POT\. ANALYZER/);
assert.match(html,/spotter-registry-rating gold"[^>]*>99\.2/);
assert.match(html,/spotter-registry-rating orange"[^>]*>85/);
assert.match(html,/spotter-registry-rating unknown"[^>]*>—/);
assert.equal((html.match(/<th scope="col" class="spotter-registry-team-column">RELAIS /g)||[]).length,2);
assert.match(html,/colspan="2" class="spotter-registry-blank">Aucune affectation/);
assert.match(html,/TRACE INTERROMPUE/);
assert.match(html,/score|97/); // preserves historical performance
assert(!html.includes('TEAM LONG NAME ABCDEFGHIJKLMNOPQRSTUVWXYZ</span>'), 'Long labels should not render untruncated');
assert.match(html,/title="TEAM LONG NAME ABCDEFGHIJKLMNOPQRSTUVWXYZ"/, 'Full team name remains available in title');
assert.equal(vm.runInContext('Array.from(spotterRegistryShortTeam("ABCDEFGHIJKLMNOPQRSTUVWXYZ123456789")).length',ctx),30);
const css=fs.readFileSync('static/css/70-spotter.css','utf8');
const v1809=css.slice(css.indexOf('/* V7.2.1809'));
assert.match(v1809,/\.spotter-registry-table\{[\s\S]*?overflow-x:auto!important/);
assert.match(v1809,/\.spotter-registry-grid[\s\S]*?width:max-content/);
assert.match(v1809,/\.spotter-registry-name\{[\s\S]*?width:30ch/);
console.log('V1809 registry: global scroll, one row per KV, colored NOTE, 30-char names and preserved relay history OK');
