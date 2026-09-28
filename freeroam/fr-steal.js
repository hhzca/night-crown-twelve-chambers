(function(){
const FR=window.FR;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const pick=l=>l[Math.floor(Math.random()*l.length)];

// 「暗处」的唯一定义：读玩家所在 tile 的光照值，light < 0.35 即暗处。
// 全模块只此一处判断，禁止别处再写一套。
function isDark(s){
  const x=Math.floor(s.player.x),y=Math.floor(s.player.y);
  return FR.Map.light(s,s.floor,x+.5,y+.5)<FR.C.DARK_LIGHT;
}

function statusMod(s,who){
  const st=who==='player'?s.player.stats:null;
  const statuses=who==='player'?(s.player.statuses||[]):[];
  let m=0;
  if(statuses.includes('专注'))m+=.04;
  if(statuses.includes('隐身'))m+=.05;
  if(statuses.includes('暴露'))m-=.05;
  return m;
}

FR.Steal={
  isDark,
  // 成功率：基础 30% + 属性差 + 原型专精 + 状态 + 暗处 + 情报命中，硬夹 20%–40%
  chance(s,target,enemy=false){
    const p=s.player.stats;
    const attr=(p.agility+p.stealth+p.luck-(target.perception||5)-(target.luck||4))*.012;
    const hero=(s.hero===2)?.06:0;
    const dark=(FR.roomById[s.room]?.dark||isDark(s))?.04:0;
    const intel=(s.player.stats.clues>0)?.03:0;
    const status=statusMod(s,'player');
    const foe=enemy?-.03:0;
    const raw=.30+attr+hero+dark+intel+status+foe;
    return clamp(raw,FR.C.STEAL_MIN,FR.C.STEAL_MAX);
  },
  // 起意：第 11 刻起禁止蹲守，改为「直接动手」（成功率 −8pp，风险档 +1）
  begin(s,target){
    if(s.tick>=FR.C.TICKS-1){
      s.pendingSteal={targetId:target.id,due:s.tick,rush:true};
      target.state='camp';
      return {rush:true,chance:clamp(this.chance(s,target)-FR.C.STEAL_RUSH_PENALTY,FR.C.STEAL_MIN,FR.C.STEAL_MAX)};
    }
    s.pendingSteal={targetId:target.id,due:s.tick+FR.C.STEAL_DELAY_TICKS,rush:false};
    target.state='camp';
    return {rush:false,chance:this.chance(s,target)};
  },
  // 三种失败结局：时机未至 / 意图暴露 / 落空但有收获
  // 判据（按顺序）：跨过天亮 → 时机未至；蹲守期间被对方发现 → 意图暴露；正常结算失败 → 落空但有收获
  failKind(s,target,reason){
    if(reason==='dawn'||s.tick>=FR.C.TICKS)return 'dawn';
    if(reason==='exposed'||target.state==='chase')return 'exposed';
    return 'missed';
  },
  failCard(s,target,kind){
    if(kind==='dawn')return{
      kind:'时机未至',
      story:`天光从窗缝里斜进来，${target.name}的影子被拉长、变淡。你等的那个瞬间从来没有出现过。`,
      changes:[['sanity',-1]]
    };
    if(kind==='exposed')return{
      kind:'意图暴露',
      story:`${target.name}忽然停下，回头。他什么都没说，但你们都清楚刚才发生了什么——下一次不会这么近了。`,
      changes:[['stealth',-1],['sanity',-1]]
    };
    return{
      kind:'落空但有收获',
      story:`你贴得太久，指尖擦过${target.name}的衣料却什么也没抓住。不过他转身时，你看见了他藏东西的位置。`,
      changes:[['clues',1],['stamina',-1]]
    };
  },
  // 结算：成功走五档（大成功抢两件，成功抢一件），失败走三种失败结局 + 反噬
  resolve(s,target){
    const rush=!!s.pendingSteal?.rush;
    const p=clamp(this.chance(s,target)-(rush?FR.C.STEAL_RUSH_PENALTY:0),FR.C.STEAL_MIN,FR.C.STEAL_MAX);
    const ok=Math.random()<p;
    if(ok){
      const great=Math.random()<.22;
      const n=great?2:1;
      const got=[];
      const bag=Array.isArray(target.inventory)?target.inventory:[];
      for(let i=0;i<n;i++){
        if(bag.length)got.push(bag.pop());
      }
      target.inventory=bag;
      s.player.stats.clues+=great?2:1;
      s.danger+=6;
      return{
        outcome:great?'大成功':'成功',
        story:great
          ?`你从${target.name}的影子里连抽两件东西，他直到风停才敢回头。`
          :`你从${target.name}的影子里抽走一件秘密，他直到风停才敢回头。`,
        changes:[['clues',great?2:1],['danger',6]],
        got
      };
    }
    const kind=this.failKind(s,target);
    const card=this.failCard(s,target,kind);
    // 失败也走反噬：小失败只掉状态，大失败（按风险档）额外吃一条反噬表
    if(Math.random()<FR.C.CRIT_RATE[rush?2:1]){
      const esc=pick(FR.ESCALATION);
      esc.c.forEach(([k,v])=>{card.changes.push([k,v]);});
      card.story+=' '+esc.t;
      card.outcome='大失败';
    }else{
      card.outcome='失败';
    }
    return card;
  },
  // 对手夺取你：同层按各自概率起意，流程相同但延迟以「刻」为单位
  enemyBegin(s,e){
    s.pendingEnemySteal={targetId:e.id,due:s.tick+FR.C.STEAL_DELAY_TICKS};
  },
  enemyCheck(s){
    const p=s.pendingEnemySteal;
    if(!p||s.tick<p.due)return null;
    s.pendingEnemySteal=null;
    const e=s.enemies.find(v=>v.id===p.targetId);
    if(!e)return null;
    const ok=Math.random()<this.chance(s,e,true);
    if(ok){
      s.player.stats.keys=Math.max(0,s.player.stats.keys-1);
      s.player.stats.health-=1;
      return{outcome:'被夺取 · 得手',story:`${e.name}从暗处贴近。你听见衣袋里的金属声少了一拍。`,changes:[['keys',-1],['health',-1]]};
    }
    return{outcome:'被夺取 · 落空',story:`${e.name}的手从披风边缘滑开。你们都装作那只是风。`,changes:[['sanity',-1]]};
  }
};
})();
