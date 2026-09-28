/* Classic castle rules. All relocation and room mechanisms share this stateful boundary.
   Presentation never commits rewards, destroys rooms, or advances the random generator. */
(() => {
  'use strict';
  const timeRooms = ['traceGate','goldVault','ruinConvergence','mirrorSanctum','collapseClock'];
  const previousMakeState=makeState;
  makeState=function(...args){const s=previousMakeState(...args);s.rulesVersion=2;s.bellRingerIds=[];for(const p of s.players){p.gold=0;p.charms=Number(p.charms)||0;}return s;};
  const active = p => !p.collapsed && p.stats.health > 0 && p.stats.sanity > 0;
  const esc = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const originalNpcRooms=Object.fromEntries(Object.values(NPCS).map(n=>[n.id,n.room]));
  function migrate(){
    if(!state.rulesVersion){
      for(const p of state.players)if(p.scoreSnapshot!=null && p.rangBell){const count=state.players.filter(o=>o.rangBell).length;p.scoreSnapshot/=(count%2?1.25:.8);}
      state.rulesVersion=2;
      if(['finale','shard'].includes(state.stageId)&&/^action_3_/.test(state.phase)){state.phase=ROUND_SUMMARY;state.resolving=false;}
      const slot=slotOfPhase(state.phase,'select');
      if(slot)for(const p of state.players)if(!p.collapsed&&!p.turn.slots[slot].confirmed)generateOptions(p,slot);
      const clocks=state.players.filter(p=>!p.collapsed&&p.room==='collapseClock').map(p=>p.id);
      if(clocks.length&&!state.pendingEntryEvent){state.clockEntrants=clocks;const token=state.token;queueMicrotask(()=>{if(state.token===token)checkEntries({phase:slot?'select':'result',slot:slot||slotOfPhase(state.phase,'result')||1});});}
    }
    for(const p of state.players){p.gold=Number(p.gold)||0;p.charms=Number(p.charms)||0;}
    for(const key of Object.keys(NPC_BY_ROOM))delete NPC_BY_ROOM[key];
    for(const [id,original]of Object.entries(originalNpcRooms)){const room=state.npcRooms?.[id]||original;if(roomIsAlive(room)&&!NPC_BY_ROOM[room])NPC_BY_ROOM[room]=id;}
  }
  function rooms(stage = state.stageId) {
    return ROOMS.filter(r => roomIsAlive(r.id) && (stage === 'shard' ||
      (['explore','return'].includes(stage) ? !r.stage : r.stage === stage)) &&
      !(stage === 'finale' && state.round === 1 && ['bellTower','bloodThrone'].includes(r.id))).map(r=>r.id);
  }
  function exits(exclude = [], stage = state.stageId) {
    return rooms(stage).filter(id=>!exclude.includes(id));
  }
  function relocate(p, dest, cause='forced') {
    if (!p || !active(p)) return false;
    const legal = rooms();
    if (!legal.includes(dest)) dest = pick(legal.filter(id=>id!=='collapseClock' && id!==p.room));
    if (!dest || !ROOM_BY_ID[dest]) return false;
    const from = p.room;
    if (from === dest && cause !== 'gate') return true;
    p.room = dest;
    p.roomVisit = (p.roomVisit || 0) + 1;
    p.roomMechanismUsed = false;
    p.traceTargets = null;
    p.visitedRooms = [...new Set([...(p.visitedRooms || []),dest])];
    if (from === 'dungeon' && dest !== 'dungeon') clearJailState(p);
    if (from === 'lastHaven' && dest !== 'lastHaven') p.havenWait = 0;
    if (dest === 'lastHaven') p.havenWait = 1;
    if (cause === 'gate' && state.stageId === 'shard') p.nonTimeGates = timeRooms.includes(dest) ? 0 : (p.nonTimeGates || 0) + 1;
    state.relocationSerial = (state.relocationSerial || 0) + 1;
    p.lastRelocation = {id:state.relocationSerial,from,to:dest,cause};
    if (dest === 'collapseClock') {
      state.clockEntrants ||= [];
      if (!state.clockEntrants.includes(p.id)) state.clockEntrants.push(p.id);
    }
    return true;
  }
  stageExitPool = (stage, exclude) => exits([exclude,'collapseClock',...(stage==='shard'?[]:['dungeon','reward','lastHaven','hellOfSin'])],stage);
  normalizeRoomsForStage = function() {
    for (const p of state.players) if (active(p) && !rooms().includes(p.room)) relocate(p,pick(exits(['collapseClock','lastHaven','hellOfSin','dungeon','reward'])),'stage');
  };
  const oldRoutes = buildRoutes;
  buildRoutes = function(p) {
    if (p.havenWait > 0) { p.routes=[makeRoute(p,p.room,'stay',{}, {conceal:true})]; p.blocked=[]; return; }
    if (state.stageId !== 'shard') return oldRoutes(p);
    p.routes=[];p.blocked=[];state.stageGates ||= {};
    const key=`${p.id}:shard:${state.round}`;
    if (!rooms().includes(state.stageGates[key])) {
      const all=exits([p.room]),special=all.filter(id=>timeRooms.includes(id)),ordinary=all.filter(id=>!timeRooms.includes(id));
      let pool=(special.length && ((p.nonTimeGates||0)>=2 || !ordinary.length || rng.next()<.4)) ? special : ordinary;
      if(!pool.length) pool=all.length?all:rooms();
      const fresh=pool.filter(id=>!(p.visitedRooms||[]).includes(id));
      state.stageGates[key]=pick(fresh.length && rng.next()<.35 ? fresh : pool);
    }
    if(state.stageGates[key]) p.routes=[makeRoute(p,state.stageGates[key],'open',{}, {conceal:true})];
    p.routePlan=p.routes.map(r=>r.dest);
  };
  function mechanism(p, charm=false) {
    const id=p.room;
    if(p.havenWait>0) return {id:'haven-wait',kind:'roomMechanism',mechanism:'haven',text:'锁链禁锢 · 等待一次行动',flavor:'锁链松开后立即离开避难所',stat:'sanity',risk:0,tags:[]};
    if(id==='bloodThrone' && !state.crownHolder && !state.crownLost) return {id:'crown-equip',kind:'roomMechanism',mechanism:'crown',text:'戴上血染王冠',flavor:'夺取成功率 +20 个百分点；成功夺取将淘汰对手',stat:'intimidation',risk:0,tags:[]};
    if(id==='bellTower' && !p.rangBell) return {id:'bell-ring',kind:'roomMechanism',mechanism:'bell',text:'敲响钟楼',flavor:'每人一局一次；最终敲钟人数奇数 ×1.25，偶数 ×0.8',stat:'luck',risk:1,tags:[]};
    if(state.stageId!=='shard' || !timeRooms.slice(0,4).includes(id) || p.roomMechanismUsed) return null;
    if(charm && !(p.charms>0)) return null;
    const labels={traceGate:['循迹 · 选择追踪的人','选择两条光轨之一，前往该角色当前的房间'],goldVault:['收取流金 · 30 金币','获得金币后立即离开密室'],ruinConvergence:['唤起毁灭汇点','本次行动全部结算后，把所有在场角色召到这里'],mirrorSanctum:['映照自身 · 选择属性','选择一项永久基础属性，补至当前最高值']};
    const bonuses={traceGate:'传送后生命、理智各恢复 2',goldVault:'改为获得 60 金币，然后离开',ruinConvergence:'召集所有在场角色，并获得一次蜡像防护',mirrorSanctum:'所选属性补齐后再永久 +2'};
    return {id:`room-${id}-${charm?'charm':'normal'}-${p.roomVisit||0}`,kind:'roomMechanism',mechanism:id,charm,text:charm?'使用时间护符 · '+labels[id][0]:labels[id][0],flavor:charm?'消耗 1 枚护符、1 次行动；'+bonuses[id]:labels[id][1],stat:'perception',risk:0,tags:[],needsChoice:['traceGate','mirrorSanctum'].includes(id)};
  }
  function details(p, entry) {
    if(entry.mechanism==='mirrorSanctum') {
      const max=Math.max(...CORE_STAT_KEYS.map(k=>p.stats[k]));
      return CORE_STAT_KEYS.filter(k=>entry.charm || p.stats[k]<max).map(stat=>({...entry,needsChoice:false,selectedStat:stat,text:`${STAT_LABEL[stat]}：${p.stats[stat]} → ${max+(entry.charm?2:0)}`}));
    }
    if(entry.mechanism==='traceGate') {
      p.traceTargets ||= shuffle(state.players.filter(o=>o.id!==p.id && active(o) && rooms().includes(o.room) && o.room!=='collapseClock')).slice(0,2).map(o=>o.id);
      return p.traceTargets.map(id=>state.players.find(o=>o.id===id)).filter(o=>o && active(o) && roomIsAlive(o.room) && o.room!=='collapseClock').map(o=>({...entry,needsChoice:false,targetPlayerId:o.id,text:`循迹 · ${o.label} · ${HEROES[o.hero].name}`}));
    }
    return [entry];
  }
  const oldOptions=generateOptions;
  generateOptions=function(p,slot=1){
    let normal=oldOptions(p,slot);
    if(timeRooms.includes(p.room)||['bellTower','bloodThrone'].includes(p.room))normal=normal.filter(e=>!(ROOM_ACTIONS[p.room]||[]).some(old=>old.text===e.text));
    const main=mechanism(p), charm=mechanism(p,true);
    if(main?.mechanism==='haven') normal=[];
    // Keep one native room action in old rooms; forced equipment never erases their identity.
    if(!main && ROOM_ACTIONS[p.room]?.length && !timeRooms.includes(p.room) && !['lastHaven','bloodThrone','bellTower'].includes(p.room)) {
      const native=ROOM_ACTIONS[p.room].find(e=>!normal.some(n=>n.text===e.text)&&!roundSlots().some(i=>i!==slot&&p.turn.slots[i].entry?.text===e.text));
      if(native) normal=[cloneAction(native,`native-${p.room}-${slot}`),...normal];
    }
    const specials=main?[main,...(charm && charm.charm?[charm]:[])]:[];
    for(const e of specials) if(e.needsChoice && !details(p,e).length) {e.disabled=true;e.flavor=e.mechanism==='traceGate'?'当前没有可追踪的光轨':'所有基础属性已齐平';}
    p.options=[...specials,...normal].slice(0,Math.max(OPTION_MAX,specials.length+3));
    p.turn.slots[slot].options=p.options;
    return p.options;
  };
  function closeChoice(){document.getElementById('worldChoice')?.remove();}
  function showChoice(p,entry,index,source) {
    closeChoice();
    p.turn.roomChoice={index,entryId:entry.id};
    const node=document.createElement('div');node.id='worldChoice';node.className='modal open world-choice';
    node.innerHTML=`<section class="complete-card" role="dialog" aria-modal="true"><small>房间机制 · 确认后消耗一次行动</small><h2>${esc(entry.text)}</h2><p>${esc(entry.flavor)}</p><div class="world-options"></div><button class="world-cancel">返回 · 不消耗行动</button></section>`;
    for(const option of details(p,entry)) {const b=document.createElement('button');b.textContent=option.text;if(option.targetPlayerId){const target=state.players.find(o=>o.id===option.targetPlayerId),img=document.createElement('img');img.src=heroArtUrl(target.hero);img.alt='';img.style.cssText='width:42px;height:42px;object-fit:contain;vertical-align:middle;margin-right:12px';b.prepend(img);}b.onclick=()=>{const slot=slotOfPhase(state.phase,'select');if(!slot)return closeChoice();p.turn.slots[slot].options[index]=option;p.turn.roomChoice=null;closeChoice();commitChoice(p.index,index,source);};node.querySelector('.world-options').append(b);}
    node.querySelector('.world-cancel').onclick=()=>{p.turn.roomChoice=null;closeChoice();window.NightCrownProgress?.onRender();};document.body.append(node);node.querySelector('button')?.focus();window.NightCrownProgress?.onRender();
  }
  const oldCommit=commitChoice;
  commitChoice=function(index,choice,source='human'){
    const p=state.players[index],entry=p&&legalEntries(p)[choice];
    if(entry?.disabled)return false;
    if(entry?.kind==='roomMechanism' && entry.needsChoice){
      if(source==='human' && !state.headless){showChoice(p,entry,choice,source);return false;}
      const opts=details(p,entry);if(!opts.length)return false;
      p.turn.slots[slotOfPhase(state.phase,'select')].options[choice]=opts[0];
    }
    return oldCommit(index,choice,source);
  };
  const oldActionScore=actionScore;
  actionScore=function(p,e){return e.disabled?-Infinity:e.kind==='roomMechanism' ? 28+(e.charm?2:0) : oldActionScore(p,e);};
  async function resolve(p,e,result){
    result.title=e.text;result.outcome='success';
    if(e.mechanism!=='haven' && (p.collapsed || (e.charm && !(p.charms>0)))) return;
    await animateActor(p.index,e.mechanism==='bell'?'using':'searching',state.headless||reducedMotion?0:760);
    if(e.charm)p.charms--;
    const note=t=>{result.story=t;result.consequences.push(t);};
    switch(e.mechanism){
      case 'haven': {p.havenWait=0;relocate(p,pick(exits(['lastHaven','collapseClock'])),'haven-release');note('锁链吃掉了这次行动，随后把你送出避难所。');break;}
      case 'crown': if(!state.crownHolder && !state.crownLost){giveCrownTo(p);note('血染王冠落在你的额上。');}else note('王冠已经被别人取走。');break;
      case 'bell': if(!p.rangBell){p.rangBell=true;state.bellRingerIds=[...new Set([...(state.bellRingerIds||[]),p.id])];note(`本局已有 ${state.bellRingerIds.length} 位敲钟者。`);}break;
      case 'goldVault': {const amount=e.charm?60:30;p.gold=(p.gold||0)+amount;p.roomMechanismUsed=true;relocate(p,pick(exits(['goldVault','collapseClock'])),'gold');note(`获得 ${amount} 金币；流金把你送到${ROOM_BY_ID[p.room].name}。`);break;}
      case 'mirrorSanctum': {if(!CORE_STAT_KEYS.includes(e.selectedStat))break;const max=Math.max(...CORE_STAT_KEYS.map(k=>p.stats[k]));raiseStatTo(p,e.selectedStat,max+(e.charm?2:0),result);p.roomMechanismUsed=true;note(`${STAT_LABEL[e.selectedStat]}永久提升至 ${p.stats[e.selectedStat]}。`);break;}
      case 'traceGate': {const target=state.players.find(o=>o.id===e.targetPlayerId && active(o) && roomIsAlive(o.room) && o.room!=='collapseClock');if(!target){if(e.charm)p.charms++;p.refundRoomAction=true;p.traceTargets=null;note('光轨中断：本次行动返还，请重新选择。');break;}relocate(p,target.room,'trace');if(e.charm)for(const k of ['health','sanity'])raiseStatTo(p,k,Math.min(10,p.stats[k]+2),result);note(`你沿着${target.label}的光轨抵达${ROOM_BY_ID[p.room].name}。`);break;}
      case 'ruinConvergence': state.pendingSummon=true;p.roomMechanismUsed=true;if(e.charm)p.wardCharges=(p.wardCharges||0)+1;note('所有已锁定的行动结算后，毁灭汇点将召集仍在场的人。');break;
    }
  }
  function afterBatch(){
    if(state.pendingSummon){state.pendingSummon=false;for(const p of state.players)if(active(p)){clearJailState(p);p.havenWait=0;relocate(p,'ruinConvergence','summon');}}
    if(state.crownHolder){const p=state.players.find(p=>p.id===state.crownHolder);if(!p || !active(p)){state.crownHolder=null;if(!roomIsAlive('bloodThrone'))state.crownLost=true;}}
  }
  function checkEntries(resume){
    const entrants=(state.clockEntrants||[]).filter(id=>state.players.some(p=>p.id===id && active(p) && p.room==='collapseClock'));
    state.clockEntrants=[];
    if(!entrants.length || state.mendedBy)return false;
    const holders=state.players.filter(p=>entrants.includes(p.id) && p.charms>0).map(p=>p.id);
    state.eventSerial=(state.eventSerial||0)+1;
    state.pendingEntryEvent={id:state.eventSerial,entrants,holders,responses:{},resume,status:'choice'};
    state.phase='entry_event';state.resolving=false;state.token++;
    for(const id of holders){const p=state.players.find(p=>p.id===id);if(p.control==='ai'||state.headless)state.pendingEntryEvent.responses[id]=true;}
    if(!holders.length || holders.every(id=>id in state.pendingEntryEvent.responses)) completeEvent();else renderAll();
    return true;
  }
  function answer(id,use){const e=state.pendingEntryEvent;if(state.phase!=='entry_event'||!e||!e.holders.includes(id)||id in e.responses)return;e.responses[id]=Boolean(use);if(e.holders.every(id=>id in e.responses))completeEvent();else renderAll();}
  function completeEvent(){
    const e=state.pendingEntryEvent;if(!e||e.status!=='choice')return;e.status='committed';
    const winner=state.players.find(p=>e.holders.includes(p.id)&&e.responses[p.id]&&p.charms>0&&active(p));
    if(winner){winner.charms--;state.mendedBy=winner.id;state.pendingEntryEvent=null;closeChoice();endGame('mended');return;}
    const candidates=exits(['collapseClock']);const doomed=shuffle(candidates).slice(0,Math.min(8,Math.max(0,candidates.length-1)));
    state.destroyedRooms=[...new Set([...(state.destroyedRooms||[]),...doomed])];
    const safe=exits(['collapseClock']);
    for(const p of state.players)if(active(p)&&(!roomIsAlive(p.room)||p.room==='collapseClock'))relocate(p,pick(safe),'collapse');
    state.stageGates={};state.npcRooms ||= {};
    const occupiedNpc=new Set(Object.values(NPCS).map(n=>state.npcRooms[n.id]||n.room).filter(room=>roomIsAlive(room)));
    for(const npc of Object.values(NPCS))if(doomed.includes(state.npcRooms[npc.id]||npc.room)){const vacant=safe.filter(room=>!occupiedNpc.has(room));const room=pick(vacant.length?vacant:safe);state.npcRooms[npc.id]=room;occupiedNpc.add(room);}
    for(const k of Object.keys(NPC_BY_ROOM))if(doomed.includes(k))delete NPC_BY_ROOM[k];
    for(const [id,room]of Object.entries(state.npcRooms))if(!NPC_BY_ROOM[room])NPC_BY_ROOM[room]=id;
    state.lastCollapse={id:e.id,destroyed:doomed};state.pendingEntryEvent=null;closeChoice();window.playCollapseCinema?.(doomed.length);
    if(e.resume.phase==='select')enterActionSelect(e.resume.slot);else {state.phase=PHASES.actionResult(e.resume.slot);state.resolving=false;renderAll();maybeAdvance();}
  }
  const oldSelect=enterActionSelect;
  enterActionSelect=function(slot){if(state.phase==='end')return;if(checkEntries({phase:'select',slot}))return;oldSelect(slot);for(const p of state.players)if(p.havenWait>0 && !p.collapsed){const ss=p.turn.slots[slot];ss.entry=mechanism(p);ss.confirmed=true;ss.cancelled=false;}maybeAdvance();};
  const oldSummary=enterRoundSummary;
  enterRoundSummary=function(){oldSummary();if(!state.players.some(p=>p.control==='human'&&!p.collapsed)){const token=state.token;setTimeout(()=>{if(state.token===token&&state.phase===ROUND_SUMMARY)finishRound();},state.headless?0:900);}};
  const oldAfter=enterAfterResult;
  enterAfterResult=function(slot){
    const refund=state.players.filter(p=>p.refundRoomAction&&active(p));
    if(!refund.length)return oldAfter(slot);
    const saved=new Map(state.players.filter(p=>!refund.includes(p)).map(p=>[p.id,p.turn.slots[slot]]));
    for(const p of refund)p.refundRoomAction=false;
    enterActionSelect(slot);
    for(const p of state.players)if(saved.has(p.id)){p.turn.slots[slot]=saved.get(p.id);p.turn.slots[slot].confirmed=true;p.turn.slots[slot].resolved=true;}
    renderAll();scheduleAIChoice();
  };
  const oldPenalty=sendToDungeon;
  sendToDungeon=async function(p,result,reason){
    if(p.eliminatedByCrown)return;
    if(!['summit','finale','shard'].includes(state.stageId))return oldPenalty(p,result,reason);
    if(p.wardCharges>0){p.wardCharges--;result.consequences.push('蜡像承受了这次惩罚。');return;}
    const dest=state.stageId==='summit'?'hellOfSin':'lastHaven';
    await animateActor(p.index,'dungeoning',state.headless||reducedMotion?0:900);
    relocate(p,dest,'penalty');if(dest==='lastHaven')p.havenWait=1;
    result.consequences.push(dest==='lastHaven'?'你被送入最后避难所，下一次行动被禁锢，随后强制离开。':'焚罪地狱的考验等着你。');
  };
  bellMultiplierFor=function(p){state.bellRingerIds=[...new Set([...(state.bellRingerIds||[]),...state.players.filter(p=>p.rangBell).map(p=>p.id)])];return state.bellRingerIds.includes(p.id)?(state.bellRingerIds.length%2?1.25:.8):1;};
  const oldBreakdown=scoreBreakdown;
  scoreBreakdown=function(p){return {...oldBreakdown(p),gold:Math.min(12,Math.max(0,p.gold||0)*.2)};};
  const rawScore=p=>Object.values(scoreBreakdown(p)).reduce((a,b)=>a+b,0);
  scorePlayer=function(p){if(p.scoreSnapshot!=null)return Math.round(p.scoreSnapshot*bellMultiplierFor(p)*(p.eliminatedByCrown?.85:1)*10)/10;if(!active(p))return -1;return Math.round(rawScore(p)*bellMultiplierFor(p)*10)/10;};
  eliminateByCrown=function(p){if(p.eliminatedByCrown)return;p.scoreSnapshot=rawScore(p);p.eliminatedByCrown=true;p.collapsed=true;p.eliminatedReason='被血染王冠淘汰';state.eliminatedIds=[...new Set([...(state.eliminatedIds||[]),p.id])];};
  const originalCollapses=processCollapses;
  processCollapses=function(){const result=originalCollapses();state.eliminatedIds=state.players.filter(p=>p.collapsed).map(p=>p.id);afterBatch();return result;};
  const oldSeize=seizeResource;
  seizeResource=function(a,b,ar,br){const holder=state.crownHolder;const v=oldSeize(a,b,ar,br);if(holder===b.id && holder!==a.id){giveCrownTo(a);ar.consequences.push('你夺走了血染王冠。');}return v;};
  const oldRender=renderAll;
  renderAll=function(){migrate();oldRender();if(state.headless)return;
    for(const p of state.players.filter(p=>p.control==='human')){const host=$(`#decision-${p.index}`);if(!host)continue;let hud=host.querySelector('.world-hud');if(!hud){hud=document.createElement('div');hud.className='world-hud';host.prepend(hud);}hud.textContent=`金币 ${p.gold||0} · 时间护符 ${p.charms||0}${state.crownHolder===p.id?' · 血染王冠':''}${p.collapsed?' · 已退场，正在观战':''}`;}
    if(state.phase==='entry_event'&&state.pendingEntryEvent){const e=state.pendingEntryEvent;closeChoice();const p=state.players.find(p=>e.holders.includes(p.id)&&!(p.id in e.responses));if(!p)return;const node=document.createElement('div');node.id='worldChoice';node.className='modal open world-choice';node.innerHTML=`<section class="complete-card" role="dialog" aria-modal="true"><small>崩溃时钟 · ${esc(p.label)}</small><h2>钟盘正在坍塌</h2><p>使用时间护符修补钟楼，立即获得特殊胜利；放任崩溃将摧毁最多八间房。</p><button data-answer="yes">使用护符修补 · 立即胜利</button><button data-answer="no">放任崩溃 · 保留护符</button></section>`;node.querySelectorAll('button').forEach(b=>b.onclick=()=>answer(p.id,b.dataset.answer==='yes'));document.body.append(node);}
    else if(!slotOfPhase(state.phase,'select'))closeChoice();
    else if(!document.getElementById('worldChoice')){const p=state.players.find(p=>p.control==='human'&&!p.collapsed&&p.turn.roomChoice&&!isPlayerReady(p));if(p){const selection=p.turn.roomChoice,e=legalEntries(p)[selection.index];if(e?.id===selection.entryId)showChoice(p,e,selection.index,'human');else p.turn.roomChoice=null;}}
  };
  document.addEventListener('keydown',e=>{const modal=document.getElementById('worldChoice');if(!modal)return;if(e.code==='Escape' && state.phase!=='entry_event'){for(const p of state.players)p.turn.roomChoice=null;closeChoice();window.NightCrownProgress?.onRender();}if(e.code==='Tab'){const buttons=[...modal.querySelectorAll('button:not(:disabled)')],i=buttons.indexOf(document.activeElement);buttons[(i+(e.shiftKey?-1:1)+buttons.length)%buttons.length]?.focus();e.preventDefault();}e.stopImmediatePropagation();},true);
  window.NightCrownWorld={rooms,exits,relocate,resolve,afterBatch,checkEntries,answer,details,mechanism,rawScore,migrate};
  Object.assign(window.__nightCrownTest,{enterActionSelect,commitChoice,scoreBreakdown:i=>scoreBreakdown(state.players[i]),scorePlayer:i=>scorePlayer(state.players[i]),world:window.NightCrownWorld});
})();
