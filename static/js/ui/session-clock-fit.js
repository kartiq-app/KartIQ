(function(){
  const mobileLandscapeQuery=window.matchMedia('(hover:none) and (pointer:coarse) and (orientation:landscape) and (max-height:500px)');
  let frame=0;

  function clockContainers(){
    return document.querySelectorAll('#qualification .landscape-session-clock, #sprint .landscape-session-clock, #endurance .landscape-session-clock');
  }

  function fits(container, values, baseSize){
    container.style.setProperty('--landscape-clock-font-size', `${baseSize}px`);
    const style=getComputedStyle(container);
    const horizontalPadding=(parseFloat(style.paddingLeft)||0)+(parseFloat(style.paddingRight)||0);
    const verticalPadding=(parseFloat(style.paddingTop)||0)+(parseFloat(style.paddingBottom)||0);
    const gap=parseFloat(style.rowGap||style.gap)||0;
    const availableWidth=Math.max(0,container.clientWidth-horizontalPadding);
    const availableHeight=Math.max(0,container.clientHeight-verticalPadding);
    const requiredWidth=Math.max(...values.map(value=>value.getBoundingClientRect().width));
    const requiredHeight=values.reduce((total,value)=>total+value.getBoundingClientRect().height,0)+gap*(values.length-1);
    return requiredWidth<=availableWidth-2&&requiredHeight<=availableHeight-2;
  }

  function fitContainer(container){
    const values=[...container.querySelectorAll(':scope > .landscape-clock-value')];
    if(values.length!==2||container.clientWidth<=0||container.clientHeight<=0)return;
    let low=12;
    let high=56;
    for(let i=0;i<10;i+=1){
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
  window.addEventListener('orientationchange',()=>setTimeout(fitAll,150),{passive:true});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)fitAll()});
  window.fitLandscapeSessionClocks=fitAll;
  fitAll();
})();
