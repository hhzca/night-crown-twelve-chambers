/* Stage cinema reuses the actual room paintings and each participating hero sprite. */
(() => {
  const original=playStageTransition, finish=finishStageTransition;
  function remove(){document.querySelectorAll('.stage-cinema').forEach(n=>n.remove());}
  finishStageTransition=function(){remove();finish();};
  playStageTransition=function(from,to){
    remove();
    if(state.headless)return Promise.resolve();
    const node=document.createElement('div');node.className=`stage-cinema cinema-${to}${reducedMotion?' cinema-reduced':''}`;node.setAttribute('aria-hidden','true');
    const bg=document.querySelector('[id^="roomCurrent-"]');
    const paint=bg?getComputedStyle(bg).backgroundImage:'none';
    node.innerHTML=`<div class="cinema-old" style='background-image:${paint}'></div><div class="cinema-new"></div><div class="cinema-depth"><div class="cinema-well"></div>${[0,1,2,3,4].map(i=>`<div class="cinema-ring ring-${i}" style="--ring:${i}"><i></i><b>Ⅻ</b><em>Ⅵ</em></div>`).join('')}</div><div class="cinema-wind"></div><div class="cinema-door door-left"></div><div class="cinema-door door-right"></div><div class="cinema-cast"></div><div class="cinema-shards">${Array.from({length:24},(_,i)=>`<i style="--n:${i};--x:${(i*37)%100}%;--y:${(i*29)%100}%;--r:${i*47}deg"></i>`).join('')}</div>`;
    const landing=state.players.find(p=>p.control==='human'&&!p.collapsed)||state.players[0];
    if(landing)applyRoomBg(node.querySelector('.cinema-new'),landing.room);
    const cast=node.querySelector('.cinema-cast'),players=state.players.filter(p=>!p.collapsed);
    players.forEach((p,i)=>{
      const wrap=document.createElement('div');wrap.className='cinema-person';wrap.style.setProperty('--from-x',`${12+(i+.5)*76/players.length}vw`);wrap.style.setProperty('--cast-delay',`${i*65}ms`);
      let actor=document.querySelector(`[data-subject-id="${p.id}"]`)?.cloneNode(true);
      if(!actor){actor=document.createElement('div');actor.className=`actor hero-${p.hero}`;actor.innerHTML='<div class="sprite"></div>';actor.style.cssText=heroArtStyle(p.hero);}
      actor.removeAttribute('id');actor.className=`actor hero-${p.hero}`;applyHeroArt(actor,p.hero);actor.querySelectorAll('[id]').forEach(n=>n.removeAttribute('id'));actor.querySelectorAll('.emotion-face,label').forEach(n=>n.remove());
      wrap.append(actor);cast.append(wrap);
    });
    document.body.append(node);
    const promise=original(from,to);clearTimeout(stageTransitionTimer);stageTransitionTimer=setTimeout(finishStageTransition,reducedMotion?400:3200);
    return promise.finally(remove);
  };
  // The old button listener also resolves the same promise; its finally removes the cinema.
  Object.assign(window.__nightCrownTest,{playStageTransition,finishStageTransition});
  window.playCollapseCinema=function(count){
    if(state.headless)return;
    const node=document.createElement('div');node.className='collapse-cinema';
    node.innerHTML=`<div class="collapse-ripple"></div><p>${count} 间房从钟盘上消失</p>`;document.body.append(node);
    setTimeout(()=>node.remove(),reducedMotion?400:1500);
  };
})();
