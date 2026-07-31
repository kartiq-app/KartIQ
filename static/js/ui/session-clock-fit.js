(function(){
  const mobileLandscapeQuery=window.matchMedia('(hover:none) and (pointer:coarse) and (orientation:landscape) and (max-height:500px)');
  let frame=0;

  function clockContainers(){
    return document.querySelectorAll('#qualification .landscape-session-clock, #sprint .landscape-session-clock');
  }

  function fits(container, values, size){
    container.style.setProperty('--landscape-clock-font-size', `${size}px`);
    const style=getComputedStyle(container);
    const horizontalPadding=parseFloat(style.paddingLeft)+parseFloat(style.paddingRight);
    const verticalPadding=parseFloat(style.paddingTop)+parseFloat(style.paddingBottom);
    const gap=parseFloat(style.rowGap||style.gap)||0;
    const availableWidth=Math.max(0,container.clientWidth-horizontalPadding);
    const availableHeight=Math.max(0,container.clientHeight-verticalPadding);
    const requiredWidth=Math.max(...values.map(value=>value.scrollWidth));
    const requiredHeight=values.reduce((total,value)=>total+value.scrollHeight,0)+gap*(values.length-1);
    return requiredWidth<=availableWidth+.5&&requiredHeight<=availableHeight+.5;
  }

  function fitContainer(container){
    const values=[...container.querySelectorAll(':scope > .landscape-clock-value')];
    if(values.length!==2||container.clientWidth<=0||container.clientHeight<=0)return;
    let low=12;
    let high=64;
    for(let i=0;i<8;i+=1){
      const middle=(low+high)/2;
      if(fits(container,values,middle))low=middle;else high=middle;
    }
    container.style.setProperty('--landscape-clock-font-size', `${Math.floor(low*10)/10}px`);
  }

  function fitAll(){
    cancelAnimationFrame(frame);
    frame=requestAnimationFrame(()=>{
      clockContainers().forEach(container=>{
        if(mobileLandscapeQuery.matches)fitContainer(container);
        else container.style.removeProperty('--landscape-clock-font-size');
      });
    });
  }

  const observer=new MutationObserver(fitAll);
  clockContainers().forEach(container=>observer.observe(container,{subtree:true,characterData:true,childList:true}));
  if('ResizeObserver' in window){
    const resizeObserver=new ResizeObserver(fitAll);
    clockContainers().forEach(container=>resizeObserver.observe(container));
  }
  mobileLandscapeQuery.addEventListener?.('change',fitAll);
  window.addEventListener('resize',fitAll,{passive:true});
  window.addEventListener('orientationchange',()=>setTimeout(fitAll,120),{passive:true});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)fitAll()});
  window.fitLandscapeSessionClocks=fitAll;
  fitAll();
})();
