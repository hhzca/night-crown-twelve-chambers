(function(){
const FR=window.FR,$=sel=>document.querySelector(sel),keys=new Set();
const roman=['零','Ⅰ','Ⅱ','Ⅲ','Ⅳ','Ⅴ','Ⅵ','Ⅶ','Ⅷ','Ⅸ','Ⅹ','Ⅺ','Ⅻ'];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const pick=l=>l[Math.floor(Math.random()*l.length)];
const rand=(a,b)=>Math.floor(Math.random()*(b-a+1))+a;
let s=null,renderer=null,raf=0,last=0,hold=0,holdTarget=null,toastTimer=0,fpsAcc=0,fpsN=0,fpsVal=0;

const api=window.NightRoam={selected:false,active:false};
const SAVE_KEY='nightcrown.freeroam.save.v1';
let lastSave=0;
function readSave(){try{
  const box=JSON.parse(localStorage.getItem(SAVE_KEY)||'null',(_,v)=>v&&Array.isArray(v.__set)?new Set(v.__set):v);
  const v=box?.state;
  if(box?.version!==1||!v||!FR.maps[v.floor]||!FR.roomById[v.room]||!FR.heroDefs[v.hero]||!Number.isInteger(v.tick)||v.tick<1||v.tick>=FR.C.TICKS||!v.player||!Number.isFinite(v.player.x)||!Number.isFinite(v.player.y)||!Array.isArray(v.enemies)||!Array.isArray(v.player.inventory)||!['locks','seen','visited','revealed'].every(k=>v[k] instanceof Set))return null;
  return v;
}catch(_){return null;}}
function saveProgress(){
  if(!s||!api.active||s.ended||s.pendingSteal||s.pendingEnemySteal||s.panel)return false;
  try{const copy={...s,audio:null,paused:false,panel:false,lastAction:0,lastStep:0};localStorage.setItem(SAVE_KEY,JSON.stringify({version:1,savedAt:new Date().toISOString(),state:copy},(_,v)=>v instanceof Set?{__set:[...v]}:v));lastSave=performance.now();api.refreshContinue();return true;}catch(_){toast('无法写入本地存档，请检查浏览器存储设置');return false;}
}
api.refreshContinue=()=>{const b=$('#titleContinueRoam');if(b)b.hidden=!readSave();};
api.save=saveProgress;
const resumeButton=document.createElement('button');resumeButton.id='titleContinueRoam';resumeButton.textContent='继续夜行';resumeButton.hidden=true;
resumeButton.onclick=async()=>{const saved=readSave();if(!saved)return;try{if(!audio.ctx)await audio.start();else await audio.ctx.resume();}catch(_){}api.selected=true;api.start(saved.hero,audio,saved);$('#titleScreen').classList.add('closed');};
$('.title-menu').append(resumeButton);api.refreshContinue();
function pauseMenu(){
  if(s.ended)return;
  keys.clear();hold=0;holdTarget=null;
  if(s.panel)return;
  const saved=saveProgress();s.paused=true;
  panel(`<small>夜色暂歇</small><h2>旅途已暂停</h2><p>${saved?'当前位置与进度已保存。可关闭窗口，之后从标题页继续夜行。':'当前事件尚未结束，暂时保留上一个存档。'}</p><button id="frResume">继续夜行</button><button id="frSaveTitle">保存并返回标题</button>`);
  $('#frResume').onclick=()=>{closePanel();s.paused=false;s.lastAction=performance.now();};
  $('#frSaveTitle').onclick=()=>{closePanel();if(!saveProgress()){pauseMenu();return;}api.stop();showTitle();};
}
window.addEventListener('pagehide',saveProgress);
document.addEventListener('visibilitychange',()=>{if(document.hidden&&api.active){keys.clear();saveProgress();if(!s.panel)pauseMenu();}});

document.querySelectorAll('[data-experience]').forEach(b=>b.addEventListener('click',()=>{
  api.selected=b.dataset.experience==='freeroam';
  document.querySelectorAll('[data-experience]').forEach(x=>x.classList.toggle('active',x===b));
  $('#setup').classList.toggle('freeroam-choice',api.selected);
  $('.setup-copy h2').textContent=api.selected?'夜行 · 自由移动':'双影同屏版';
  $('#experienceNote').textContent=api.selected?'亲手走进四层城堡，在另外三道影子之前活到天亮。':'两道视野，同步选择，在八回合里争夺夜冠。';
  $('#enterBtn').innerHTML=api.selected?'点亮提灯，独自入夜 <span>→</span>':'开始游戏 <span>→</span>';
  // 自由移动仅有原版三人的地图精灵；切换玩法时让可选角色与实际入场角色一致。
  if(api.selected){
    document.querySelector('.hero-catalog-tabs [data-player="0"][data-hero-page="0"]')?.click();
    if(!document.querySelector('.hero-cards[data-player="0"] .hero-card.active'))
      document.querySelector('.hero-cards[data-player="0"] .hero-card[data-hero="0"]')?.click();
  }
}));

function stats(){return{health:8,stamina:8,sanity:8,strength:5,agility:5,perception:5,luck:4,intimidation:4,stealth:5,keys:1,clues:0};}

function newState(hero){
  const p=FR.Map.spawn('f1','hall');
  const st={
    hero,floor:'f1',room:'hall',tick:1,danger:FR.C.DANGER_START,
    player:{x:p.x+.5,y:p.y+.5,dir:'down',hero,palette:FR.heroDefs[hero],stats:stats(),
            inventory:['lantern',FR.items[1+Math.floor(Math.random()*5)].id],statuses:[]},
    enemies:FR.AI.spawn(),
    locks:new Set(),seen:new Set(),visited:new Set(['hall']),revealed:new Set(),
    activeHotspots:[],recent:[],logs:[],sounds:[],moveMode:'walk',
    paused:false,panel:false,pendingSteal:null,pendingEnemySteal:null,
    lastAction:performance.now(),lastStep:0,audio:null,fps:0
  };
  FR.Map.rerollLocks(st);
  refreshHotspots(st);
  return st;
}

// 热点：进房时随机抽 3–5 个点亮，并过滤最近 8 次交互过的条目
function refreshHotspots(st){
  const cells=[];
  FR.maps[st.floor].cells.forEach(row=>row.forEach(c=>{if(c.ch==='*'&&c.room===st.room)cells.push(c);}));
  if(!cells.length){
    FR.maps[st.floor].cells.forEach(row=>row.forEach(c=>{if(c.ch==='*')cells.push(c);}));
  }
  const pool=FR.hotspots[st.room]||FR.hotspots.hall;
  const recentTexts=new Set((st.recent||[]).slice(-8));
  const avail=pool.map((a,i)=>({a,i})).filter(x=>!recentTexts.has(x.a.text));
  const source=avail.length>=3?avail:pool.map((a,i)=>({a,i}));
  const count=Math.min(cells.length,3+Math.floor(Math.random()*3),source.length);
  const chosen=[];
  const shuffled=source.sort(()=>Math.random()-.5).slice(0,count);
  shuffled.forEach((x,k)=>{
    const c=cells[k%cells.length];
    chosen.push({...c,action:x.a,idx:x.i});
  });
  st.activeHotspots=chosen;
}

function hud(){
  if(!s)return;
  const room=FR.roomById[s.room];
  $('#frRoom').textContent=`${FR.floors[s.floor].name} · ${room?.name||'无名走廊'}`;
  $('#frTick').textContent=`${roman[s.tick]} · 十二`;
  // 危险值 HUD 按结局阈值 50 归一，不再写死 60
  const bar=$('#frDanger');
  if(bar)bar.style.transform=`scaleX(${clamp(s.danger/FR.C.DANGER_END,0,1)})`;
  const fp=$('#frFps');
  if(fp)fp.textContent=`${fpsVal} fps · 危险 ${Math.round(s.danger)}`;
  $('#freeroamShell').classList.toggle('danger',s.danger>=FR.C.HEARTBEAT);
  s.audio?.setDanger?.(s.danger);
  const v=$('#frVitals');
  if(v)v.innerHTML=[['health','生命','#e0577a'],['stamina','体力','#e8c583'],['sanity','理智','#8fd8c4']]
    .map(([k,n,c])=>`<div class="fr-vital"><span>${n}<b>${s.player.stats[k]}</b></span><i style="background:${c};width:${clamp(s.player.stats[k]/8*100,0,100)}%"></i></div>`).join('');
}

// 判定：power = 主属性 + 运气×0.35 − 风险×1.7，映射为正向倍率 f
// f 越高，大失败概率越低（按风险档在 CRIT_RATE 与该档基准之间插值）
function outcome(action){
  const p=s.player.stats;
  const power=p[action.stat]+p.luck*.35-action.risk*1.7;
  const f=clamp(.58+(power/6)*.97,.58,1.55);
  const table=[.22,.38,.30,.05,.05];
  const critBase=FR.C.CRIT_RATE[action.risk];
  const special=table[4];
  let crit=clamp(critBase*(1.9-f),.01,critBase);
  let great=table[0]*(f*.72+.42);
  let success=table[1]*(f*.35+.78);
  let fail=table[2]*(1.6-f*.5);
  const sum=great+success+fail+crit+special;
  great/=sum;success/=sum;fail/=sum;crit/=sum;
  const r=Math.random();
  let i=4;
  if(r<great)i=0;else if(r<great+success)i=1;else if(r<great+success+fail)i=2;else if(r<great+success+fail+crit)i=3;
  const names=['大成功','成功','失败','大失败','特殊事件'];

  const goodKey=action.stat in p?action.stat:'luck';
  const pool=['health','stamina','sanity'];
  const badKey=pick(pool);
  const changes=[];

  if(i===0){                       // 大成功：主属性 +2~3，附带一项小收益
    changes.push([goodKey,rand(2,3)]);
    const second=pick(['strength','agility','perception','luck','stealth']);
    changes.push([second,rand(1,2)]);
    if(Math.random()<.32)changes.push([pick(pool),-1]);
  }else if(i===1){                 // 成功：主属性 +1~2，必带一项减损
    changes.push([goodKey,rand(1,2)]);
    changes.push(Math.random()<.5?[badKey,-1]:[pick(pool),-1]);
  }else if(i===2){                 // 失败：主属性 −1~2，可能给一条线索
    changes.push([goodKey,-rand(1,2)]);
    if(Math.random()<.28)changes.push(['clues',1]);
  }else if(i===3){                 // 大失败：走 24 条反噬表（有增有减，运气最好仍为净亏）
    const esc=pick(FR.ESCALATION);
    esc.c.forEach(([k,v])=>changes.push([k,v]));
  }else{                           // 特殊事件：一项大浮动 + 一项反向
    changes.push([goodKey,pick([-3,-2,2,3])]);
    changes.push([pick(pool),pick([-2,2])]);
  }

  const merged=new Map();
  changes.forEach(([k,v])=>{if(k in p)merged.set(k,(merged.get(k)||0)+v);});
  const out=[...merged.entries()];
  // 注意：这里不落账，统一交给 resultCard 处理，避免同一次判定被应用两遍。

  if(i===0||i===4){
    const item=FR.items[1+Math.floor(Math.random()*(FR.items.length-1))];
    if(!s.player.inventory.includes(item.id)){s.player.inventory.push(item.id);s.logs.push(`在${FR.roomById[s.room]?.name||'走廊'}找到${item.name}`);}
  }
  if(i===4)out.push(['clues',1]);

  const storyPick=action.story||'房间留下了回答。';
  return{outcome:names[i],story:storyPick,changes:out,title:action.text,tier:i};
}

function resultCard(r,onclose=closePanel){
  // danger 不是玩家属性，是王冠的食欲；在卡片渲染时统一落账，避免它散落在各分支里
  if(r.changes){
    r.changes.forEach(([k,v])=>{
      if(k==='danger')s.danger=Math.max(0,s.danger+v);
      else if(k in s.player.stats)s.player.stats[k]=Math.max(0,s.player.stats[k]+v);
    });
    hud();
  }
  panel(`<small>${r.outcome}</small><h2>${r.title||'房间留下了回答'}</h2><p>${r.story}</p><div class="fr-changes" id="frChanges"></div><button id="frContinue">继续 <kbd>Space</kbd></button>`);
  const box=$('#frChanges');
  if(box)setTimeout(()=>{
    box.innerHTML=r.changes.map(([k,v])=>`<span class="fr-change ${v>0?'good':'bad'}">${FR.statLabels[k]||k} ${v>0?'上升':'下降'}</span>`).join('');
  },600);
  $('#frContinue').onclick=onclose;
}

function advance(n=1){
  s.tick+=n;
  s.danger+=FR.C.DANGER_TICK*n+(Math.random()<.5?1:0);
  s.lastAction=performance.now();
  FR.AI.advance(s);
  FR.Map.rerollLocks(s);
  // 蹲守结算：到点后若目标已不在，按三种失败结局处理
  if(s.pendingSteal&&s.tick>=s.pendingSteal.due){
    const e=s.enemies.find(v=>v.id===s.pendingSteal.targetId);
    const wasRush=!!s.pendingSteal.rush;
    s.pendingSteal=null;
    if(e&&e.floor===s.floor)resultCard(FR.Steal.resolve(s,e),()=>{closePanel();checkEnd();});
    else{
      const card=FR.Steal.failCard(s,{name:'那道影子'},s.tick>=FR.C.TICKS?'dawn':'missed');
      resultCard(card,()=>{closePanel();checkEnd();});
    }
  }
  if(s.pendingEnemySteal&&s.tick>=s.pendingEnemySteal.due){
    const card=FR.Steal.enemyCheck(s);
    if(card)resultCard(card,()=>{closePanel();checkEnd();});
  }
  refreshHotspots(s);
  hud();
  if([3,6,9,12].includes(s.tick))s.audio?.bell?.(s.tick===12?4:1);
  checkEnd();
}

// 地牢：拖入锁链地牢，损失 2 刻 + 随机降低 1–2 点属性；离开时只能回到随机普通房间
function sendToDungeon(reason){
  s.floor='b1';
  const p=FR.Map.spawn('b1','dungeon');
  s.player.x=p.x+.5;s.player.y=p.y+.5;
  s.room='dungeon';
  s.visited.add('dungeon');
  const dropped=[];
  const n=rand(1,2);
  for(let i=0;i<n;i++){
    const k=pick(['strength','agility','perception','luck','stealth','intimidation']);
    s.player.stats[k]=Math.max(0,s.player.stats[k]-1);
    dropped.push(FR.statLabels[k]);
  }
  s.logs.push(`被拖进锁链地牢（${reason}），${dropped.join('、')}各降一点`);
  s.tick+=FR.C.DUNGEON_TICK_LOSS;
  refreshHotspots(s);
  hud();
  toast(`锁链拖着你往下走 · 少了两刻`);
  if(s.tick>=FR.C.TICKS)checkEnd();
}

function interact(){
  if(s.panel||s.paused)return;
  const e=s.enemies.find(v=>v.floor===s.floor&&Math.hypot(v.x-s.player.x,v.y-s.player.y)<=FR.C.STEAL_DIST);
  if(e)return;
  const h=s.activeHotspots.find(v=>Math.hypot(v.x+.5-s.player.x,v.y+.5-s.player.y)<1.3);
  if(h){
    s.activeHotspots=s.activeHotspots.filter(v=>v!==h);
    s.recent.push(h.action);
    s.visited.add(s.room);
    const r=outcome(h.action);
    resultCard(r,()=>{closePanel();advance(1);});
    s.audio?.tone?.(520,.14,'triangle',.08);
    return;
  }
  const c=FR.Map.cell(s.floor,s.player.x,s.player.y);
  if(c&&(c.travel||c.secret)){
    const act=FR.Map.travelKind(s.floor,c.x,c.y);
    const tr=FR.Map.transition(s,c.ch);
    if(tr){
      s.audio?.transition?.(act,0);
      const r=FR.Map.roomAt(s.floor,s.player.x,s.player.y);
      if(r)s.room=r;
      s.visited.add(s.room);
      refreshHotspots(s);
      toast(`${FR.floors[s.floor].name} · ${FR.roomById[s.room]?.name||'走廊'}`);
      hud();
    }else{
      s.audio?.blocked?.();
      toast('这段路今晚不通');
    }
    return;
  }
  if(c&&c.door){
    const action=FR.Map.doorAction(s.floor,c.x,c.y);
    const label=FR.doorLabels[action]||'推门';
    if(s.locks.has(`${s.floor}:${c.x}:${c.y}`)){
      s.audio?.blocked?.();
      toast(pick(FR.blockedWhy));
    }else{
      s.audio?.transition?.(action,0);
      const dest=FR.Map.spawn(s.floor,null);
      s.player.x=dest.x+.5;s.player.y=dest.y+.5;
      s.visited.add(s.room);
      refreshHotspots(s);
      toast(`${label} · 到了另一侧`);
      hud();
    }
  }
}

function prompt(){
  const p=$('#frPrompt');
  if(!p)return;
  const e=s.enemies.find(v=>v.floor===s.floor&&Math.hypot(v.x-s.player.x,v.y-s.player.y)<=FR.C.STEAL_DIST);
  const h=s.activeHotspots.find(v=>Math.hypot(v.x+.5-s.player.x,v.y+.5-s.player.y)<1.3);
  const c=FR.Map.cell(s.floor,s.player.x,s.player.y);
  let html='';
  if(e)html=`<b>长按 E 盯住${e.name}</b><small>${s.tick>=FR.C.TICKS-1?'直接动手 · 凶险':'等待背身 · 蹲守'}</small>`;
  else if(h)html=`<b>E · ${h.action.text}</b><small>${h.action.flavor}</small>`;
  else if(c&&(c.travel||c.secret))html=`<b>E · 穿过这里</b><small>${FR.doorLabels[FR.Map.travelKind(s.floor,c.x,c.y)]||'换层'}</small>`;
  else if(c&&c.door){
    const locked=s.locks.has(`${s.floor}:${c.x}:${c.y}`);
    const act=FR.Map.doorAction(s.floor,c.x,c.y);
    html=`<b>E · ${FR.doorLabels[act]||'推门'}</b><small>${locked?'过不去':'一扇门'}</small>`;
  }
  p.innerHTML=html;
  p.classList.toggle('show',!!html);
}

function useItem(){
  const id=s.player.inventory.find(v=>v!=='lantern');
  if(!id)return toast('手边没有能立刻派上用场的东西');
  const item=FR.itemById[id];
  s.player.stats.stamina=Math.min(8,s.player.stats.stamina+1);
  s.player.stats.sanity=Math.min(8,s.player.stats.sanity+1);
  toast(`${item.icon} ${item.name}回应了你`);
  s.audio?.action?.('item',0);
  if(!item.relic&&Math.random()<FR.C.ITEM_BREAK){
    s.player.inventory=s.player.inventory.filter(v=>v!==id);
    setTimeout(()=>toast(`${item.name}悄无声息地坏了`),700);
  }
  hud();
}

function checkEnd(){
  if(!s)return;
  if(s.player.stats.health<=0||s.player.stats.sanity<=0){
    return end('你的名字被留在了城堡里。','D · 第四十二号');
  }
  if(s.tick<FR.C.TICKS)return;
  const score=s.player.stats.clues+s.player.stats.keys*2+s.visited.size;
  const enemyScore=Math.max(...s.enemies.map(e=>e.inventory.length*3+Math.floor(Math.random()*8)));
  const win=score>=enemyScore,low=s.danger<FR.C.DANGER_END;
  end(
    win?(low?'你把王冠留在桌上，带着自己的影子走出大门。':'王冠很轻。直到它开始从里面咬你。')
       :(low?'城堡把你扔进晨光，而晨光没有拒绝你。':'黎明数了数影子，发现多出一个。'),
    win?(low?'B · 拒绝加冕':'A · 戴上王冠'):(low?'C · 被扔出去':'D · 第四十二号')
  );
}

function end(story,title){
  s.ended=true;
  try{localStorage.removeItem(SAVE_KEY);}catch(_){}api.refreshContinue();
  s.paused=true;
  const key='nightCrownFreeroamEndings';let old=[];try{old=JSON.parse(localStorage.getItem(key)||'[]');if(!Array.isArray(old))old=[];}catch(_){}
  if(!old.includes(title))old.push(title);
  try{localStorage.setItem(key,JSON.stringify(old));}catch(_){}
  panel(`<small>钟声停止 · 结局收集 ${old.length} / 四</small><h2>${title}</h2><p>${story}</p><button id="frRestart">再走一夜</button><button id="frClassic">返回模式选择</button>`);
  $('#frRestart').onclick=()=>{const hero=s.hero,a=s.audio;s=newState(hero);s.audio=a;closePanel();hud();};
  $('#frClassic').onclick=()=>api.stop();
}

function mapPanel(){
  const shell=$('#freamoamShell')||$('#freeroamShell');
  panel(`<small>城堡记忆</small><h2>你走过的房间</h2><div class="fr-map-grid">${FR.rooms.map(r=>`<span class="${s.visited.has(r.id)?'seen':''}">${FR.floors[r.floor].name}<br><b>${r.name}</b></span>`).join('')}</div><p><b>随身物件：</b>${s.player.inventory.map(id=>`${FR.itemById[id]?.icon||'·'} ${FR.itemById[id]?.name||id}`).join('　')}</p><p>${s.logs.slice(-4).join('<br>')||'墙还没有告诉你更多。'}</p><div class="fr-settings"><button id="frContrast" class="${shell.classList.contains('high-contrast')?'active':''}">高对比轮廓</button><button id="frMotion" class="${shell.classList.contains('reduce-motion')?'active':''}">降低闪烁</button><button id="frShake" class="active">关闭屏幕震动</button><button id="frRemap">切换方向键</button></div><button id="frClose">收起地图</button>`);
  $('#frClose').onclick=closePanel;
  $('#frContrast').onclick=e=>{shell.classList.toggle('high-contrast');e.currentTarget.classList.toggle('active');};
  $('#frMotion').onclick=e=>{shell.classList.toggle('reduce-motion');e.currentTarget.classList.toggle('active');};
  $('#frShake').onclick=e=>e.currentTarget.classList.toggle('active');
  $('#frRemap').onclick=e=>{
    const on=shell.classList.toggle('remap-arrows');
    e.currentTarget.classList.toggle('active',on);
    e.currentTarget.textContent=on?'切换回 WASD':'切换方向键';
  };
}

function panel(html){const p=$('#frPanel');if(!p)return;p.innerHTML=html;p.setAttribute('aria-hidden','false');p.classList.add('open');if(s)s.panel=true;$('#frPrompt')?.classList.remove('show');}
function closePanel(){const p=$('#frPanel');if(!p)return;p.classList.remove('open');p.setAttribute('aria-hidden','true');if(s)s.panel=false;}
function toast(t){
  const el=$('#frToast');if(!el)return;
  el.textContent=t;el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>el.classList.remove('show'),1800);
}

function update(dt){
  if(s.paused||s.panel)return;
  const K=code=>keys.has(code);
  let dx=(K('ArrowRight')||K('KeyD')?1:0)-(K('ArrowLeft')||K('KeyA')?1:0);
  let dy=(K('ArrowDown')||K('KeyS')?1:0)-(K('ArrowUp')||K('KeyW')?1:0);
  s.moveMode=K('ShiftLeft')||K('ShiftRight')?'run':(K('ControlLeft')||K('ControlRight')?'sneak':'walk');
  if(dx||dy){
    s.audio?.footstep?.(FR.Map.material(s,s.floor,s.player.x,s.player.y),s.moveMode);
    const spd=s.moveMode==='run'?FR.C.RUN:s.moveMode==='sneak'?FR.C.SNEAK:FR.C.MOVE;
    const len=Math.hypot(dx,dy)||1;
    const nx=s.player.x+dx/len*spd*dt,ny=s.player.y+dy/len*spd*dt;
    if(FR.Map.walk(s.floor,nx,s.player.y,s))s.player.x=nx;
    if(FR.Map.walk(s.floor,s.player.x,ny,s))s.player.y=ny;
    s.player.dir=Math.abs(dx)>Math.abs(dy)?(dx<0?'left':'right'):(dy<0?'up':'down');
    const cellKey=`${s.floor}:${Math.floor(s.player.x)}:${Math.floor(s.player.y)}`;
    if(s.seen.has(cellKey)!==true)s.seen.add(cellKey);
    const r=FR.Map.roomAt(s.floor,s.player.x,s.player.y);
    if(r&&r!==s.room){
      s.room=r;s.visited.add(r);refreshHotspots(s);
      toast(`${FR.floors[s.floor].name} · ${FR.roomById[r]?.name||'走廊'}`);
      s.audio?.setRoom?.(r);
    }
  }
  // 保底推进：连续 90 秒无交互自动推进 1 刻
  if(performance.now()-s.lastAction>FR.C.IDLE){
    s.lastAction=performance.now();
    toast('你在原地待得太久了');
    advance(1);
  }
  FR.AI.update(s,dt);
  for(const e of s.enemies){
    if(e.floor===s.floor)s.seen.add(`${e.floor}:${Math.floor(e.x)}:${Math.floor(e.y)}`);
  }
  prompt();
}

function loop(now){
  if(!api.active)return;
  const dt=Math.min(.05,(now-last)/1000||0);last=now;
  fpsAcc+=dt;fpsN++;
  if(fpsAcc>=.5){fpsVal=Math.round(fpsN/fpsAcc);s.fps=fpsVal;fpsAcc=0;fpsN=0;hud();}
  update(dt);
  if(now-lastSave>5000&&!s.panel&&!s.paused){lastSave=now;saveProgress();}
  if(renderer)renderer.draw(s,dt);
  // 蹲守长按蓄条
  if(holdTarget&&keys.has('KeyE')){
    hold+=dt;
    if(hold>=FR.C.STEAL_HOLD/1000){
      const r=FR.Steal.begin(s,holdTarget);
      hold=0;holdTarget=null;
      s.audio?.setDanger?.(FR.C.HEARTBEAT);
      toast(r.rush?'今晚只剩一次机会':'盯上了 · 等他背身');
      hud();
    }
  }else if(!keys.has('KeyE')){hold=0;}
  raf=requestAnimationFrame(loop);
}

api.start=(hero,audio,saved=null)=>{
  cancelAnimationFrame(raf);keys.clear();hold=0;holdTarget=null;
  api.active=true;
  s=saved||newState(hero);s.audio=audio;s.lastAction=performance.now();s.lastStep=0;s.paused=false;s.panel=false;
  if(typeof StageMusic!=='undefined'){StageMusic.unlock?.();StageMusic.play('explore');}
  s.audio?.setRoom?.(s.room);
  closePanel();
  renderer=new FR.Renderer($('#freeroamCanvas'));
  $('#setup').classList.add('closed');
  $('#gameShell').style.display='none';
  $('#freeroamShell').classList.add('active');
  $('#freeroamShell').setAttribute('aria-hidden','false');
  hud();toast('主楼 · 黑冠大厅');
  last=performance.now();
  saveProgress();
  raf=requestAnimationFrame(loop);
};
api.stop=()=>{
  saveProgress();keys.clear();hold=0;holdTarget=null;
  api.active=false;cancelAnimationFrame(raf);closePanel();
  $('#freeroamShell').classList.remove('active','danger');
  $('#freeroamShell').setAttribute('aria-hidden','true');
  $('#gameShell').style.display='';
  $('#setup').classList.remove('closed');
};

document.addEventListener('keydown',e=>{
  if(!api.active)return;
  if(s.ended)return;
  if(s.paused){if(e.code==='Escape'){e.preventDefault();closePanel();s.paused=false;s.lastAction=performance.now();}return;}
  if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','Tab'].includes(e.code))e.preventDefault();
  keys.add(e.code);
  if(e.code==='KeyE'&&!e.repeat){
    const who=s.enemies.find(v=>v.floor===s.floor&&Math.hypot(v.x-s.player.x,v.y-s.player.y)<=FR.C.STEAL_DIST);
    if(who){holdTarget=who;hold=0;}
    else interact();
  }
  if(e.code==='KeyQ'&&!e.repeat)useItem();
  if(e.code==='Tab'&&!e.repeat)(s.panel?closePanel():mapPanel());
  if(e.code==='Escape'&&!e.repeat){
    if(s.panel)closePanel();
    else pauseMenu();
  }
  if(e.code==='Space'&&s.panel)$('#frContinue')?.click();
});
document.addEventListener('keyup',e=>{
  keys.delete(e.code);
  if(e.code==='KeyE'){hold=0;holdTarget=null;}
});
const mapBtn=$('#frMapBtn');if(mapBtn)mapBtn.onclick=()=>{if(s.ended||s.paused)return;s.panel?closePanel():mapPanel();};
const pauseBtn=$('#frPauseBtn');if(pauseBtn)pauseBtn.onclick=()=>{if(s.paused&&!s.ended){closePanel();s.paused=false;s.lastAction=performance.now();}else pauseMenu();};

window.__freeroamTest={
  newState,
  validate:()=>FR.Map.validate(),
  chance:(hero=0)=>{const st=newState(hero);return st.enemies.map(e=>FR.Steal.chance(st,e));},
  advance:(st,n)=>{s=st;advance(n);return st;},
  getState:()=>s,
  interact:(st,h)=>{s=st;if(h){s.recent.push(h.action);s.visited.add(s.room);return outcome(h.action);}return null;},
  setState:(st)=>{s=st;},
  dungeon:(reason)=>sendToDungeon(reason||'测试'),
  stealBegin:(st,t)=>{s=st;return FR.Steal.begin(st,t);},
  stealResolve:(st,t)=>{s=st;return FR.Steal.resolve(st,t);},
  tick:()=>s?s.tick:0,
  danger:()=>s?s.danger:0,
  fps:()=>fpsVal
};
})();
