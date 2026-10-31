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
 throw new Error(`fin introuvable: ${name}`);
}
const funcs=[
 'formatEndurancePitClock','formatEndurancePitDuration','velocityTrackHoursMinutes',
 'enduranceElapsedTrackHoursMinutes','enduranceFocusTeamIdentity','enduranceFetchOfficialFinishedPit',
 'renderEndurancePitState'
].map(pick).join('\n');
const ctx={
 console,Date,setTimeout,Promise,Number,Math,String,
 state:{circuit_id:'misanino',session_name:'Race1'},
 endurancePitPreviousStatus:'unknown',endurancePitLastTime:'—',endurancePitOutUntil:0,
 endurancePitSimulation:null,enduranceTrackStartedAt:0,endurancePitPassageCount:0,
 endurancePitTeamKey:'',endurancePitOfficialLookupToken:0,
 overlay:null,sets:[],
 setEndurancePitOverlay:(...args)=>ctx.sets.push(args),
 resetEnduranceRelayLapColor:()=>{},
 apexHistoryRequest:async()=>'',
 parseApexPitLine:()=>null,
};
vm.createContext(ctx);
vm.runInContext('let endurancePitPreviousStatus="unknown",endurancePitLastTime="—",endurancePitOutUntil=0,endurancePitSimulation=null,enduranceTrackStartedAt=0,endurancePitPassageCount=0,endurancePitTeamKey="",endurancePitOfficialLookupToken=0;\n'+funcs,ctx);
const evalIn=s=>vm.runInContext(s,ctx);
// Les millièmes exacts reçus sont conservés ; pas d'invention de .000.
assert.equal(evalIn('formatEndurancePitClock("01:23.847")'),'01:23.847');
assert.equal(evalIn('formatEndurancePitClock("1:23,847")'),'01:23.847');
assert.equal(evalIn('formatEndurancePitClock("83.847")'),'01:23.847');
assert.equal(evalIn('formatEndurancePitClock("1:23")'),'01:23');
assert.equal(evalIn('formatEndurancePitClock("83")'),'01:23');
assert.equal(evalIn('formatEndurancePitClock("41.")'),'00:41');
assert.equal(evalIn('formatEndurancePitClock("—")'),'—');
assert.equal(evalIn('formatEndurancePitClock("not a time")'),'—');
assert.equal(evalIn('formatEndurancePitDuration(83847)'),'01:23.847');
// H:MM est un compteur heure-minute, pas minute-seconde.
assert.equal(evalIn('velocityTrackHoursMinutes("00:08:00")'),'00:08');
assert.equal(evalIn('velocityTrackHoursMinutes("00:08")'),'00:08');
assert.equal(evalIn('velocityTrackHoursMinutes("01:13:00")'),'01:13');
assert.equal(evalIn('enduranceElapsedTrackHoursMinutes(8*60000)'),'00:08');
assert.equal(evalIn('enduranceElapsedTrackHoursMinutes(3600000+8*60000)'),'01:08');
assert(analyzer.includes('velocityTrackHoursMinutes(followed?.track_timer)'));
// Validation de la transition live PIT IN / PIT OUT et isolation d'equipe.
vm.runInContext('enduranceFetchOfficialFinishedPit=async ()=>{}',ctx);
const team={apex_row:17,driver:'RED RACING SPIRIT',status:'pit',pit_stops:1,pit_timer:'01:23.847'};
ctx.liveTeam=team;
evalIn('renderEndurancePitState(liveTeam)');
assert.equal(evalIn('endurancePitLastTime'),'01:23.847');
assert.equal(ctx.sets.at(-1)[0],'in');
ctx.liveTeam={...team,status:'track'};
evalIn('renderEndurancePitState(liveTeam)');
assert.equal(ctx.sets.at(-1)[0],'out');
assert.equal(ctx.sets.at(-1)[1],'01:23.847');
ctx.liveTeam={...team,apex_row:18,driver:'OTHER TEAM',status:'pit',pit_timer:'12'};
evalIn('renderEndurancePitState(liveTeam)');
assert.equal(evalIn('endurancePitLastTime'),'12');
assert.equal(ctx.sets.at(-1)[1],'12');
// Aucun chrono local ne remplace le PIT live Apex dans la fonction de rendu.
const live=pick('renderEndurancePitState');
assert(!live.includes('now-endurancePitEnteredAt'));
assert(!live.includes('formatEndurancePitDuration(now-endurancePitEnteredAt)'));
// Une requete historique secondaire peut remplacer la seconde entiere
// par la duree finale Apex precise, sans calcul Date.now().
vm.runInContext(pick('enduranceFetchOfficialFinishedPit'),ctx);
ctx.apexHistoryRequest=async()=>`D17.P#1|48|10000|93847|83847|0|0|0|0`;
ctx.parseApexPitLine=line=>line.startsWith('D17.P')?{
 stop:1,pitTimeMs:83847,pitInMs:10000,pitOutMs:93847
}:null;
vm.runInContext(`endurancePitTeamKey='misanino|Race1|17';
 endurancePitPreviousStatus='track';endurancePitLastTime='01:23';
 endurancePitOutUntil=Date.now()+3000;`,ctx);
const query=evalIn('enduranceFetchOfficialFinishedPit({apex_row:17},endurancePitTeamKey,1,endurancePitOfficialLookupToken)');
query.then(()=>{
 assert.equal(evalIn('endurancePitLastTime'),'01:23.847');
 assert.equal(ctx.sets.at(-1)[0],'out');
 assert.equal(ctx.sets.at(-1)[1],'01:23.847');
 console.log('Tests V1840 : PIT officiel, duree finale Apex au millieme, piste HH:MM OK');
}).catch(error=>{console.error(error);process.exitCode=1});
