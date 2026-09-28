(function(){
const FR=window.FR;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

function norm(a){while(a>Math.PI)a-=Math.PI*2;while(a<-Math.PI)a+=Math.PI*2;return a;}
function dirAngle(d){return {down:Math.PI/2,left:Math.PI,right:0,up:-Math.PI/2}[d]??Math.PI/2;}

// 视野锥：前方 90°、7 tile。背身是夺取窗口，正面是危险窗口。
// 暗房内被发现的距离 ×0.7（暗房既是夺取的好地方，也是被埋伏的地方）。
function canSee(s,e){
  const d=Math.hypot(e.x-s.player.x,e.y-s.player.y);
  const room=FR.roomById[FR.Map.roomAt(s.floor,s.player.x,s.player.y)];
  const range=FR.C.SIGHT_DIST*(room?.dark?.7:1);
  if(d>range)return false;
  const toPlayer=Math.atan2(s.player.y-e.y,s.player.x-e.x);
  const facing=dirAngle(e.dir);
  const diff=Math.abs(norm(toPlayer-facing));
  return diff<=FR.C.SIGHT_ANGLE*Math.PI/360;
}

FR.AI={
  spawn(){
    return FR.enemyDefs.map((d,i)=>{
      const floor=FR.floorOrder[(i+1)%4];
      const p=FR.Map.spawn(floor,null);
      return{...d,floor,x:p.x+.5,y:p.y+.5,dir:'down',hero:i,state:'patrol',path:[],repath:0,
             hp:6,perception:d.perception,luck:d.luck,inventory:[['旧钥匙','旧钱袋'][i%2]],
             stuck:0,lastRoom:null};
    });
  },
  // 目标房间：偏好权重 + 未探索加成 + 仇恨，避开规避房间
  pickTarget(s,e){
    const cands=FR.rooms.filter(r=>r.floor===e.floor&&!e.avoid.includes(r.id)&&r.id!=='dungeon');
    const pool=cands.length?cands:FR.rooms.filter(r=>r.floor===e.floor);
    const weighted=[];
    pool.forEach(r=>{
      let w=1;
      if(e.prefer.includes(r.id))w+=2.5;
      if(!s.visited.has(r.id))w+=1.5;
      if(s.player.room===r.id)w+=1.2;
      const h=s.hatred?.[e.id]||0;
      if(h>0&&s.player.room===r.id)w+=h*.6;
      for(let i=0;i<Math.ceil(w*2);i++)weighted.push(r.id);
    });
    return weighted[Math.floor(Math.random()*weighted.length)]||pool[0]?.id||'hall';
  },
  update(s,dt){
    for(const e of s.enemies){
      // 无视野锥 / 跨层：只做逻辑位置更新，且给玩家声音提示但不给坐标
      if(e.floor!==s.floor){
        e.repath-=dt;
        if(e.repath<=0){
          e.repath=.25;
          if(Math.random()<.06){
            const i=FR.floorOrder.indexOf(e.floor)+(Math.random()<.5?-1:1);
            e.floor=FR.floorOrder[clamp(i,0,3)];
            const p=FR.Map.spawn(e.floor,null);
            e.x=p.x+.5;e.y=p.y+.5;
            s.sounds=s.sounds||[];
            s.sounds.push(e.floor);
          }
        }
        continue;
      }

      const d=Math.hypot(e.x-s.player.x,e.y-s.player.y);
      const noise=s.moveMode==='run'?FR.C.NOISE.run:s.moveMode==='sneak'?FR.C.NOISE.sneak:FR.C.NOISE.walk;
      const seen=canSee(s,e);
      const heard=d<noise;

      // 状态机：camp 是受保护状态，被蹲守期间不被 chase/investigate 覆盖
      if(e.state!=='camp'){
        if(seen&&(s.danger>38||e.tail>.3))e.state='chase';
        else if(seen||heard)e.state='investigate';
        else if(e.hp<3)e.state='flee';
        else e.state='patrol';
      }
      if(s.pendingSteal?.targetId===e.id)e.state='camp';

      e.repath-=dt;
      if(e.repath<=0||!e.path||!e.path.length){
        e.repath=.25;
        let target=null;
        if(e.state==='chase'||e.state==='investigate')target=s.player;
        else if(e.state==='flee'){
          const rooms=FR.rooms.filter(r=>r.floor===e.floor&&!e.prefer.includes(r.id));
          const r=rooms[Math.floor(Math.random()*rooms.length)];
          if(r)target=FR.Map.spawn(e.floor,r.id);
        }else if(e.state==='camp'){
          target={x:e.x,y:e.y};
        }else{
          const rid=this.pickTarget(s,e);
          e.lastRoom=rid;
          target=FR.Map.spawn(e.floor,rid);
        }
        if(target)e.path=FR.Map.path(e.floor,e,target,s);
      }

      const next=e.path?.[1];
      if(next){
        const dx=next.x+.5-e.x,dy=next.y+.5-e.y,len=Math.hypot(dx,dy)||1;
        const spd=e.state==='chase'?2.5:e.state==='flee'?2.2:1.35;
        e.x+=dx/len*spd*dt;e.y+=dy/len*spd*dt;
        e.dir=Math.abs(dx)>Math.abs(dy)?(dx<0?'left':'right'):(dy<0?'up':'down');
        if(len<.15)e.path.shift();
        e.stuck=0;
      }else{
        // 反锁死：3 次重规划失败则传送到最近可达节点（不可见地处理）
        e.stuck=(e.stuck||0)+1;
        if(e.stuck>3){
          const p=FR.Map.spawn(e.floor,null);
          e.x=p.x+.5;e.y=p.y+.5;
          e.path=[];e.stuck=0;
        }
      }

      // 夺取起意：按刻结算，不受帧率影响。
      // 每次推进刻数时由 AI.advance 统一掷骰，这里只做贴近触发的即时起意（每刻上限 1 次）
      if(d<FR.C.STEAL_DIST&&!s.pendingEnemySteal&&!s.pendingSteal&&!s.panel){
        e.nearTicks=(e.nearTicks||0)+dt;
        if(e.nearTicks>1.0){
          e.nearTicks=0;
          e.stealRolls=(e.stealRolls||0)+1;
          if(e.stealRolls>3)return;
          FR.Steal.enemyBegin(s,e);
        }
      }else if(d>=FR.C.STEAL_DIST){
        e.nearTicks=0;
      }
    }
    if(Math.random()<dt*.03){
      FR.Steal.enemyCheck(s);
    }
  },
  // 每刻：起意概率按「三人合计每夜 1.5–2.5 次」校准 → 单刻每人 ≈ 0.055
  advance(s){
    for(const e of s.enemies){
      if(e.state!=='camp')e.state=s.pendingSteal?.targetId===e.id?'camp':'patrol';
      e.nearTicks=0;
      e.stealRolls=0;
    }
    if(s.pendingEnemySteal)return;
    const d=s.enemies.filter(e=>e.floor===s.floor&&Math.hypot(e.x-s.player.x,e.y-s.player.y)<FR.C.STEAL_DIST*3);
    for(const e of d){
      if(Math.random()<.055*e.steal/.30)FR.Steal.enemyBegin(s,e);
    }
  }
};
})();
