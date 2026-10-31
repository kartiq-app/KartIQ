const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('static/js/sprint/sprint.js','utf8');
const analyzer=fs.readFileSync('static/js/endurance/analyzer.js','utf8');
function pick(name){
 let start=source.indexOf(`function ${name}(`);
 assert(start>=0,`Fonction absente: ${name}`);
 if(start>=6&&source.slice(start-6,start)==='async ')start-=6;
 let depth=0,opened=false;
 for(let i=source.indexOf('{',start);i<source.length;i++){
  if(source[i]==='{'){depth++;opened=true}
  else if(source[i]==='}'&&opened&&--depth===0)return source.slice(start,i+1);
 }
 throw Error(`Fin introuvable : ${name}`);
}
const extracted=[
 'formatEndurancePitClock','formatEndurancePitDuration','endurancePitOfficialLiveSeconds',
 'endurancePitPassageLabel','setEndurancePitOverlay','velocityTrackHoursMinutes',
 'enduranceElapsedTrackHoursMinutes','enduranceFocusTeamIdentity',
 'enduranceFetchOfficialFinishedPit','renderEndurancePitState',
 'simulateEndurancePitIn','simulateEndurancePitOut','resetEndurancePitSimulation'
].map(pick).join('\n');
function fixture(){
 const nodes=Object.fromEntries(['endurancePitOverlay','endurancePitInTime','endurancePitOutMessage','endurancePitOutPassage','endurancePitOutTime'].map(id=>[id,{
  textContent:'',attr:{},classes:new Set(),
  classList:{toggle(name,enabled){const n=nodes[id]; if(enabled)n.classes.add(name);else n.classes.delete(name)},contains(name){return nodes[id].classes.has(name)}},
  setAttribute(name,value){this.attr[name]=value}
 }]));
 const ctx={
  console,Promise,String,Number,Math,Date:{now:()=>ctx.now},now:1_000_000,
  setTimeout:fn=>setTimeout(fn,0),
  document:{getElementById:id=>nodes[id]||null},
  state:{circuit_id:'misanino',session_name:'Race1'},
  resetEnduranceRelayLapColor:()=>{},enduranceFocusSelectedDriver:()=>({}),renderEnduranceFocus:()=>{},
  apexHistoryRequest:async()=>'',parseApexPitLine:()=>null,
 };
 vm.createContext(ctx);
 vm.runInContext(`const ENDURANCE_PIT_OUT_DISPLAY_MS=8000;const ENDURANCE_PIT_OFFICIAL_WAIT_MS=20000;
 let endurancePitPreviousStatus='unknown',endurancePitLastTime='—',endurancePitOutUntil=0,
 endurancePitSimulation=null,enduranceTrackStartedAt=0,endurancePitPassageCount=0,
 endurancePitTeamKey='',endurancePitOfficialLookupToken=0,
 endurancePitOutPhase='idle',endurancePitOfficialDeadline=0;\n${extracted}`,ctx);
 return {ctx,nodes,run:str=>vm.runInContext(str,ctx)};
}
function assertWaiting(nodes){
 assert(nodes.endurancePitOverlay.classes.has('show'));
 assert(nodes.endurancePitOverlay.classes.has('pit-out-waiting'));
 assert(!nodes.endurancePitOverlay.classes.has('pit-out-active'));
 assert.equal(nodes.endurancePitOutTime.textContent,'');
 assert.equal(nodes.endurancePitOutMessage.attr['aria-hidden'],'true');
}
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
(async()=>{
 const {ctx,nodes,run}=fixture();
 assert.equal(run('formatEndurancePitClock("01:23.847")'),'01:23.847');
 assert.equal(run('endurancePitOfficialLiveSeconds("00:35.853")'),'00:35');
 assert.equal(run('endurancePitOfficialLiveSeconds("00:35")'),'00:35');
 assert.equal(run('endurancePitOfficialLiveSeconds("—")'),'—');
 assert.equal(run('formatEndurancePitDuration(181019)'),'03:01.019');
 assert.equal(run('velocityTrackHoursMinutes("00:08:00")'),'00:08');
 assert.equal(run('enduranceElapsedTrackHoursMinutes(3600000+8*60000)'),'01:08');
 assert(analyzer.includes('velocityTrackHoursMinutes(followed?.track_timer)'));
 assert(!source.includes('endurancePitClockAnimated'));
 assert(!source.includes('endurancePitDisplayTicker'));
 const team={apex_row:17,driver:'RED RACING SPIRIT',status:'pit',pit_stops:1,pit_timer:'03:01'};
 ctx.liveTeam=team;
 run('renderEndurancePitState(liveTeam)');
 assert(nodes.endurancePitOverlay.classes.has('pit-in-active'));
 assert.equal(nodes.endurancePitInTime.textContent,'03:01');
 // L'historique Apex ne donne pas encore sa reponse : ecran noir, pas 03:01.
 let resolveHistory;
 ctx.apexHistoryRequest=()=>new Promise(resolve=>{resolveHistory=resolve});
 ctx.parseApexPitLine=line=>line==='official-pit'?{stop:1,pitTimeMs:181019,pitInMs:0,pitOutMs:181019}:null;
 ctx.liveTeam={...team,status:'track'};
 run('renderEndurancePitState(liveTeam)');
 assertWaiting(nodes);
 assert.equal(run('endurancePitOutUntil'),0);
 await tick(); // delai de 600 ms simule immediatement dans le test
 assert.equal(typeof resolveHistory,'function');
 assertWaiting(nodes);
 resolveHistory('official-pit');
 await tick(); await tick();
 assert(nodes.endurancePitOverlay.classes.has('pit-out-active'));
 assert.equal(nodes.endurancePitOutTime.textContent,'03:01.019');
 assert.equal(nodes.endurancePitOutMessage.attr['aria-hidden'],'false');
 assert.equal(run('endurancePitOutPhase'),'official');
 assert.equal(run('endurancePitOutUntil'),ctx.now+8000);
 ctx.now+=7999;
 run('renderEndurancePitState(liveTeam)');
 assert(nodes.endurancePitOverlay.classes.has('pit-out-active'));
 ctx.now+=2;
 run('renderEndurancePitState(liveTeam)');
 assert(!nodes.endurancePitOverlay.classes.has('show'));

 // En cas de panne d'historique, on ne substitue jamais 03:01.
 const f2=fixture();
 f2.ctx.liveTeam={apex_row:19,driver:'TEAM B',status:'pit',pit_stops:2,pit_timer:'03:01'};
 f2.run('renderEndurancePitState(liveTeam)');
 f2.ctx.apexHistoryRequest=()=>new Promise(()=>{});
 f2.ctx.liveTeam={...f2.ctx.liveTeam,status:'track'};
 f2.run('renderEndurancePitState(liveTeam)');
 assertWaiting(f2.nodes);
 f2.ctx.now+=20001;
 f2.run('renderEndurancePitState(liveTeam)');
 assert(!f2.nodes.endurancePitOverlay.classes.has('show'));
 assert.equal(f2.run('endurancePitOutPhase'),'idle');
 assert.equal(f2.nodes.endurancePitOutTime.textContent,'');

 // Un retour officiel tardif ne peut pas apparaitre pour une autre equipe.
 const f3=fixture();
 f3.ctx.liveTeam={apex_row:17,driver:'RED RACING SPIRIT',status:'pit',pit_stops:1,pit_timer:'03:01'};
 f3.run('renderEndurancePitState(liveTeam)');
 let resolveLate;
 f3.ctx.apexHistoryRequest=()=>new Promise(resolve=>{resolveLate=resolve});
 f3.ctx.parseApexPitLine=()=>({stop:1,pitTimeMs:181019});
 f3.ctx.liveTeam={...f3.ctx.liveTeam,status:'track'};
 f3.run('renderEndurancePitState(liveTeam)');
 await tick();
 f3.ctx.liveTeam={apex_row:18,driver:'AUTRE',status:'track',pit_stops:1};
 f3.run('renderEndurancePitState(liveTeam)');
 resolveLate('official-pit');
 await tick(); await tick();
 assert(!f3.nodes.endurancePitOverlay.classes.has('show'));
 assert.equal(f3.run('endurancePitLastTime'),'—');

 // Le mode de simulation reste actif pendant 8 secondes comme auparavant.
 const f4=fixture();
 f4.run('simulateEndurancePitIn()');
 f4.ctx.now+=12500;
 f4.run('simulateEndurancePitOut()');
 assert.equal(f4.run('endurancePitOutUntil'),f4.ctx.now+8000);
 console.log('OK V1842 — PIT IN Apex sans millisecondes, PIT OUT noir, duree officielle seule 8s, timeout, equipe isolee');
})().catch(err=>{console.error(err);process.exitCode=1});
