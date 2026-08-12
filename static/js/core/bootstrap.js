function isStandaloneVelocity(){return window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone===true}
function closeInstallHelp(){document.getElementById('installHelp')?.classList.remove('show')}
function syncFullscreenControls(active){
 document.body.classList.toggle('kartiq-fullscreen',!!active);
 document.getElementById('fullscreenBtn')?.classList.toggle('active',!!active);
 document.getElementById('fullscreenFloatControls')?.setAttribute('aria-hidden',active?'false':'true');
}
async function exitVelocityFullscreen(){
 try{
  if(document.fullscreenElement&&document.exitFullscreen)await document.exitFullscreen();
  else if(document.webkitFullscreenElement&&document.webkitExitFullscreen)document.webkitExitFullscreen();
 }catch(e){console.warn('Sortie plein écran indisponible',e)}
 syncFullscreenControls(false);
}
async function toggleVelocityFullscreen(){
 const btn=document.getElementById('fullscreenBtn');
 try{
  if(document.fullscreenElement||document.webkitFullscreenElement){await exitVelocityFullscreen();return}
  const el=document.documentElement;
  const request=el.requestFullscreen||el.webkitRequestFullscreen;
  if(request){await request.call(el);syncFullscreenControls(true);return}
 }catch(e){console.warn('Plein écran indisponible',e)}
 if(isStandaloneVelocity()){syncFullscreenControls(!document.body.classList.contains('kartiq-fullscreen'));return}
 document.getElementById('installHelp')?.classList.add('show');
}
document.addEventListener('fullscreenchange',()=>syncFullscreenControls(!!document.fullscreenElement));document.addEventListener('webkitfullscreenchange',()=>syncFullscreenControls(!!document.webkitFullscreenElement));
document.getElementById('installHelp')?.addEventListener('click',e=>{if(e.target.id==='installHelp')closeInstallHelp()});
if('serviceWorker' in navigator){window.addEventListener('load',()=>{
 const standalone=isStandaloneVelocity();
 if(!standalone){
  // Desktop : Velocity est une application live. Pas de Service Worker ni de purge
  // de caches pendant un déploiement, afin d'éviter les transitions de renderer.
  setTimeout(async()=>{try{const regs=await navigator.serviceWorker.getRegistrations();await Promise.all(regs.map(reg=>reg.unregister()))}catch(err){console.warn('Retrait service worker desktop',err)}},8000);
  return;
 }
 (async()=>{try{await navigator.serviceWorker.register('/static/sw.js?v=7.2.181',{updateViaCache:'none'});const reg=await navigator.serviceWorker.getRegistration('/static/sw.js');reg?.update().catch(()=>{})}catch(err){console.warn('Service worker',err)}})();
})}

setModeClass(currentMode);
loadKartQueues();
setInterval(()=>clock.textContent=new Date().toLocaleTimeString('fr-FR'),1000);
// V7.2.180 — Desktop deploy-safe polling.
// Un seul cycle /api/state est planifié à la fois. En cas de redéploiement ou
// d'indisponibilité momentanée du serveur, on ralentit progressivement au lieu
// de marteler la nouvelle instance Render pendant sa bascule.
let velocityStatePollTimer=null;
let velocityStatePollDelay=250;
window.velocityPageLeaving=false;
async function velocityStatePoll(){
 if(window.velocityPageLeaving)return;
 const ok=await load();
 velocityStatePollDelay=ok===false?Math.min(Math.max(velocityStatePollDelay*2,500),5000):250;
 clearTimeout(velocityStatePollTimer);
 velocityStatePollTimer=setTimeout(velocityStatePoll,document.hidden?1000:velocityStatePollDelay);
}
function velocityStopLiveForPageExit(){
 window.velocityPageLeaving=true;
 clearTimeout(velocityStatePollTimer);
 try{closeApexBrowserSocket()}catch(_){}
}
window.addEventListener('pagehide',velocityStopLiveForPageExit,{once:true});
window.addEventListener('beforeunload',velocityStopLiveForPageExit,{once:true});
document.addEventListener('visibilitychange',()=>{
 if(!document.hidden&&!window.velocityPageLeaving){clearTimeout(velocityStatePollTimer);velocityStatePollTimer=setTimeout(velocityStatePoll,50)}
});
setInterval(updateRemainingDisplay,250);
velocityStatePoll();
