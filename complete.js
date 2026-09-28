/* Complete edition: local checkpoints and spoiler-safe room journal. */
(() => {
  'use strict';
  const KEY='nightcrown.classic.save.v1', BACKUP=KEY+'.backup';
  const phases=new Set(['entry_event','travel_select','action_1_select','action_2_select','action_3_select','action_1_result','action_2_result','action_3_result','round_summary','stage_growth']);
  let queued=false,restoring=false,pendingExit=false,lastPayload='',lastGood=null,focusBefore=null;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const encode=v=>JSON.stringify(v,(_,x)=>x instanceof Set?{__set:[...x]}:x instanceof Map?{__map:[...x]}:x);
  const decode=t=>JSON.parse(t,(k,v)=>{if(['__proto__','constructor','prototype'].includes(k))throw Error('存档字段不受支持');return v&&Array.isArray(v.__set)?new Set(v.__set):v&&Array.isArray(v.__map)?new Map(v.__map):v;});
  function checksum(t){let h=2166136261;for(let i=0;i<t.length;i++)h=Math.imul(h^t.charCodeAt(i),16777619);return(h>>>0).toString(16);}
  function notice(t,bad=false){const n=$('#saveStatus');n.textContent=t;n.classList.toggle('bad',bad);}
  function rememberRooms(){for(const p of state.players){p.visitedRooms||=[];if(ROOM_BY_ID[p.room]&&!p.visitedRooms.includes(p.room))p.visitedRooms.push(p.room);}}
  function stable(){return !state.resolving&&phases.has(state.phase)&&!window.NightRoam?.active;}
  function pack(){
    if(!stable())throw Error('当前步骤还在结算');rememberRooms();
    const data=decode(encode({state,rng:{seedValue:rng.seedValue,state:rng.state,queue:rng.queue},itemSerial}));
    data.state.headless=false;data.state.resolving=false;
    for(const p of data.state.players)p.lastCommitAt=0;
    const payload=encode(data);return{game:'nightcrown-classic',version:1,savedAt:new Date().toISOString(),checksum:checksum(payload),payload};
  }
  function unpack(raw){
    if(typeof raw!=='string'||raw.length>5000000)throw Error('存档大小不正确');
    const box=JSON.parse(raw);
    if(box.game!=='nightcrown-classic'||box.version!==1)throw Error('不是受支持的夜冠存档');
    if(typeof box.payload!=='string'||checksum(box.payload)!==box.checksum)throw Error('存档校验失败');
    if(/[<>]/.test(box.payload))throw Error('存档含有不支持的标记');
    const data=decode(box.payload),s=data.state;
    if(!s||!phases.has(s.phase)||!STAGES.some(v=>v.id===s.stageId)||!Number.isInteger(s.round)||s.round<1||s.round>99||!Number.isInteger(s.maxRounds)||s.maxRounds<s.round||s.maxRounds>99)throw Error('对局阶段不完整');
    if(!Array.isArray(s.players)||s.players.length<1||s.players.length>7||!s.players.some(p=>p.control==='human'))throw Error('玩家信息不完整');
    const ids=new Set();
    for(const p of s.players){
      if(!p||typeof p.id!=='string'||ids.has(p.id)||!Number.isInteger(p.index)||p.index<0||p.index>6||!HEROES[p.hero]||!ROOM_BY_ID[p.room]||!['human','ai'].includes(p.control)||!p.stats||!Object.values(p.stats).every(Number.isFinite)||!Array.isArray(p.inventory)||!p.turn?.travel||![1,2,3].every(i=>p.turn.slots?.[i]))throw Error('角色状态损坏');
      if(p.inventory.some(i=>!ITEMS[i.id]||typeof i.uid!=='string'))throw Error('行囊数据损坏');
      if(p.index!==s.players.indexOf(p)||!ROOM_BY_ID[p.homeRoom]||!['statuses','marks','curses','flags','history','routes','blocked','options','injuries','buffs','growthChoices'].every(k=>Array.isArray(p[k])))throw Error('角色记录不完整');
      ids.add(p.id);if(p.claimedEvents&&!(p.claimedEvents instanceof Set))throw Error('奖励记录损坏');
    }
    if(s.phase==='entry_event'){
      const e=s.pendingEntryEvent;
      if(!e||e.status!=='choice'||!Number.isInteger(e.id)||!Array.isArray(e.entrants)||!e.entrants.length||!e.entrants.every(id=>ids.has(id))||!Array.isArray(e.holders)||!e.holders.every(id=>e.entrants.includes(id))||!e.responses||!Object.entries(e.responses).every(([id,v])=>e.holders.includes(id)&&typeof v==='boolean')||!['select','result'].includes(e.resume?.phase)||!Number.isInteger(e.resume.slot)||e.resume.slot<1||e.resume.slot>3)throw Error('入场事件不完整');
    }
    if(!Number.isInteger(data.rng?.state)||typeof data.rng.seedValue!=='string'||!Array.isArray(data.rng.queue)||!data.rng.queue.every(Number.isFinite)||!Number.isInteger(data.itemSerial)||data.itemSerial<0)throw Error('随机状态不完整');
    return{box,data};
  }
  function read(){let error=false;for(const key of[KEY,BACKUP])try{const raw=localStorage.getItem(key);if(raw)return{...unpack(raw),raw,recovered:key===BACKUP};}catch(e){error=true;}return{error};}
  function refreshContinue(){const v=read(),b=$('#titleContinue');b.hidden=!v.data;b.textContent=v.data?'继续游戏 · '+stageById(v.data.state.stageId).label:'继续游戏';b.title=v.box?'保存于 '+new Date(v.box.savedAt).toLocaleString()+(v.recovered?'（备用存档）':''):'';if(v.error)notice('本地存档无法读取，可在存档管理中导入备份。',true);}
  function save(manual=false){
    if(restoring||!stable()){if(manual)notice('当前步骤完成后会自动保存');return false;}
    try{const box=pack(),raw=JSON.stringify(box);if(box.payload!==lastPayload||manual){const prior=read();if(prior.data&&!prior.recovered)localStorage.setItem(BACKUP,prior.raw);localStorage.setItem(KEY,raw);lastPayload=box.payload;lastGood=raw;}notice('已保存 · '+stageById(state.stageId).label+' · 第 '+state.round+' 回合');refreshContinue();return true;}
    catch(e){try{lastGood=JSON.stringify(pack());}catch(_){}notice('自动保存不可用，请导出存档备份。',true);return false;}
  }
  function finish(){if(state.headless)return;try{localStorage.removeItem(KEY);localStorage.removeItem(BACKUP);}catch(_){}lastGood=null;lastPayload='';refreshContinue();notice('本局已结束 · 可以开始新的旅程');}
  function onRender(){
    if(state.headless||restoring||state.phase==='setup'||window.NightRoam?.active)return;rememberRooms();
    if(state.phase==='end'){finish();return;}if(queued)return;queued=true;
    queueMicrotask(()=>{queued=false;if(state.headless||restoring)return;if(stable()){save();if(pendingExit){pendingExit=false;quit();}}});
  }
  function closeModal(){const m=$('#completeModal');m.classList.remove('open');m.setAttribute('aria-hidden','true');focusBefore?.focus();}
  function openModal(title,html){focusBefore=document.activeElement;$('#completeTitle').textContent=title;$('#completeBody').innerHTML=html;$('#completeModal').classList.add('open');$('#completeModal').setAttribute('aria-hidden','false');$('#completeClose').focus();}
  function mapData(index){
    const p=state.players[index];if(!p||p.control!=='human')return null;
    const visited=new Set(p.visitedRooms||[]);visited.add(p.room);
    const routes=state.phase===TRAVEL_SELECT&&!playerCannotAct(p)?p.routes||[]:[];
    const accessible=new Set(routes.filter(r=>!r.conceal&&roomIsAlive(r.dest)).map(r=>r.dest));
    const rows=ROOMS.map(room=>{const known=visited.has(room.id)||accessible.has(room.id),destroyed=!roomIsAlive(room.id);return{name:known?room.name:'未知房间',floor:known?room.floor:'尚未抵达',group:room.stage||'explore',status:destroyed?'destroyed':room.id===p.room?'current':accessible.has(room.id)?'accessible':visited.has(room.id)?'visited':'unknown',visited:visited.has(room.id),accessible:accessible.has(room.id),id:known?room.id:null};});
    return{label:p.label,rows,randomDoors:routes.filter(r=>r.conceal).length};
  }
  function openMap(index=state.players.findIndex(p=>p.control==='human')){
    if(state.phase==='setup'){notice('进入城堡后可查看各自的探索地图');return;}rememberRooms();const map=mapData(index);if(!map)return;
    const labels={current:'当前位置',accessible:'当前可进入',visited:'已访问',unknown:'未知',destroyed:'已摧毁'};
    openModal('城堡地图 · '+map.label,`<div class="complete-tabs">${state.players.filter(p=>p.control==='human').map(p=>`<button data-map-player="${p.index}" class="${p.index===index?'active':''}">${esc(p.label)}的视野</button>`).join('')}</div><p>城堡的门每回合改变。这里记录你知道的房间，不揭晓未知门的落点，也不显示其他人的位置。</p><div class="map-legend">${Object.entries(labels).map(([k,v])=>`<span class="map-${k}">${v}</span>`).join('')}</div>${map.randomDoors?`<p class="random-gate">◈ 当前有 ${map.randomDoors} 扇未知随机门 · 穿过后才揭晓落点</p>`:''}${['explore','summit','finale','shard'].map(group=>`<section class="map-section"><h3>${group==='explore'?'城堡 · 初探与重返':stageById(group).label}</h3><div class="castle-map-grid">${map.rows.filter(r=>r.group===group).map(r=>`<article class="map-room map-${r.status}"><small>${esc(r.floor)}</small><b>${esc(r.name)}</b><span>${labels[r.status]}${r.visited&&r.status==='accessible'?' · 曾经到访':''}${r.accessible&&r.status==='current'?' · 可停留':''}</span></article>`).join('')}</div></section>`).join('')}`);
  }
  async function restore(raw=null){
    let v;try{v=raw?unpack(raw):read();if(!v.data)throw Error('没有可继续的有效存档');}catch(e){notice(e.message,true);return false;}
    if(state.resolving){notice('请等当前步骤完成再读档');return false;}restoring=true;
    try{
      if(window.NightRoam?.active)window.NightRoam.stop();const token=state.token+1;resetToSetup();
      state=v.data.state;state.token=token;state.resolving=false;state.headless=false;
      rng.seedValue=v.data.rng.seedValue;rng.state=v.data.rng.state;rng.queue=[...v.data.rng.queue];itemSerial=v.data.itemSerial;
      state.lastInputAt=Date.now();state.lastRoundAdvanceAt=0;setupMode=state.mode;setupBotCount=state.botCount;
      if(window.NightRoam)window.NightRoam.selected=false;$('#gameShell').style.display='';
      for(const id of['titleScreen','setup'])$('#'+id).classList.add('closed');
      document.querySelectorAll('.modal').forEach(n=>{n.classList.remove('open');n.setAttribute('aria-hidden','true');});
      renderPlayerShells();renderAll();state.players.filter(p=>p.control==='human').forEach(p=>setNarrative(p.index,ROOM_BY_ID[p.room].desc,ROOM_BY_ID[p.room].icon));
      if(state.phase==='stage_growth'){renderGrowthModal();$('#growthModal').classList.add('open');$('#growthModal').setAttribute('aria-hidden','false');}
      try{if(!audio.ctx)await audio.start();else await audio.ctx.resume();StageMusic.unlock?.();musicEvent('stage');audio.setRooms?.(state.players.filter(p=>p.control==='human').map(p=>p.room));}catch(e){notice('存档已恢复；声音可在设置中重试',true);}
      lastPayload='';restoring=false;save();scheduleAIChoice();maybeAdvance();return true;
    }catch(e){restoring=false;notice('恢复失败：'+e.message,true);return false;}
  }
  function quit(){
    if(state.phase==='setup'||state.phase==='end'){closeModal();showTitle();return;}
    if(!stable()){pendingExit=true;notice('正在完成当前步骤，完成后保存并返回标题');return;}
    if(!save(true)){openSaves();return;}closeModal();state.token++;state.phase='setup';state.resolving=false;finishStageTransition();document.querySelectorAll('.modal').forEach(n=>{n.classList.remove('open');n.setAttribute('aria-hidden','true');});showTitle();refreshContinue();
  }
  function exportSave(){if(stable())save(true);const raw=lastGood||read().raw;if(!raw){notice('没有可导出的存档',true);return;}const url=URL.createObjectURL(new Blob([raw],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='夜冠-双影存档-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  function openSaves(){const v=read();openModal('存档管理',`<p>每个行动步骤完成后自动保存。关掉浏览器后，可从标题页继续；导出文件可迁移到另一台电脑或浏览器。</p><p>${v.data?`${esc(stageById(v.data.state.stageId).label)} · 第 ${v.data.state.round} 回合 · ${esc(new Date(v.box.savedAt).toLocaleString())}${v.recovered?' · 已恢复备用存档':''}`:'暂无有效的经典双影存档'}</p><div class="complete-tabs"><button id="saveNow">立即保存</button><button id="exportSave">导出存档</button><button id="importSave">导入存档</button><button id="saveQuit">保存并返回标题</button></div><p>结算进行中保留上一个完整节点，当前步骤结束后自动更新。存储不可用时请导出文件。夜行进度独立保存，可从标题页“继续夜行”恢复。</p>`);$('#saveNow').onclick=()=>save(true);$('#exportSave').onclick=exportSave;$('#saveQuit').onclick=quit;$('#importSave').onclick=()=>$('#saveFile').click();}
  const nav=$('.title-menu'),cont=document.createElement('button');cont.id='titleContinue';cont.hidden=true;cont.onclick=()=>restore();nav.insertBefore(cont,nav.firstChild);
  const manage=document.createElement('button');manage.id='titleSaves';manage.textContent='存档管理';manage.onclick=openSaves;nav.append(manage);
  document.body.insertAdjacentHTML('beforeend','<div class="save-status" id="saveStatus" role="status"></div><div class="modal complete-modal" id="completeModal" aria-hidden="true"><section class="complete-card" role="dialog" aria-modal="true" aria-labelledby="completeTitle"><button class="close" id="completeClose" aria-label="关闭">×</button><small>夜冠 · 旅途记录</small><h2 id="completeTitle"></h2><div id="completeBody"></div></section></div><input id="saveFile" type="file" accept=".json,application/json" hidden>');
  $('#completeClose').onclick=closeModal;$('#completeModal').onclick=e=>{if(e.target.id==='completeModal')closeModal();const b=e.target.closest('[data-map-player]');if(b)openMap(Number(b.dataset.mapPlayer));};
  $('#saveFile').onchange=async e=>{const f=e.target.files[0];e.target.value='';if(!f)return;try{if(f.size>5000000)throw Error('存档文件过大');const raw=await f.text(),v=unpack(raw);if(/[<>]/.test(v.box.payload))throw Error('存档含有不支持的标记');if(state.resolving)throw Error('请等待当前步骤完成后再导入');if(await restore(raw))notice('存档已导入并恢复');}catch(error){notice(error.message,true);}};
  $('.top-actions').insertAdjacentHTML('afterbegin','<button id="classicMapBtn">地图</button><button id="saveMenuBtn">存档 / 返回</button>');$('#classicMapBtn').onclick=()=>openMap();$('#saveMenuBtn').onclick=openSaves;
  document.addEventListener('keydown',e=>{if(window.NightRoam?.active)return;const m=$('#completeModal');if(m.classList.contains('open')){if(e.code==='Escape')closeModal();if(e.code==='Tab'){const bs=[...m.querySelectorAll('button')],i=bs.indexOf(document.activeElement);bs[(i+(e.shiftKey?-1:1)+bs.length)%bs.length]?.focus();e.preventDefault();}e.stopImmediatePropagation();return;}if(e.code==='Tab'&&!e.ctrlKey&&!e.altKey&&$('#titleScreen').classList.contains('closed')&&$('#setup').classList.contains('closed')&&!document.querySelector('.modal.open')){e.preventDefault();e.stopImmediatePropagation();openMap();}},true);
  window.addEventListener('pagehide',()=>{if(!state.headless&&stable())save();});document.addEventListener('visibilitychange',()=>{if(document.hidden&&!state.headless&&stable())save();});
  window.NightCrownProgress={onRender,save,restore,pack,unpack,read,refreshContinue,finish,openMap,mapData,quit,exportSave,keys:{primary:KEY,backup:BACKUP}};refreshContinue();
})();
