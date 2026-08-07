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
if('serviceWorker' in navigator){window.addEventListener('load',async()=>{try{const key='velocity-sw-v7-2-86';if(localStorage.getItem(key)!=='1'){const regs=await navigator.serviceWorker.getRegistrations();await Promise.all(regs.map(reg=>reg.unregister()));if('caches' in window){const names=await caches.keys();await Promise.all(names.map(name=>caches.delete(name)))}localStorage.setItem(key,'1')}await navigator.serviceWorker.register('/static/sw.js?v=7.2.86',{updateViaCache:'none'});navigator.serviceWorker.getRegistration('/static/sw.js').then(reg=>reg&&reg.update()).catch(()=>{})}catch(err){console.warn('Service worker',err)}})}

setModeClass(currentMode);
loadKartQueues();
setInterval(()=>clock.textContent=new Date().toLocaleTimeString('fr-FR'),1000);setInterval(updateRemainingDisplay,100);setInterval(load,250);load();
