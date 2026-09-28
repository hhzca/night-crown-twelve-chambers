(function(){
const FR=window.FR;
const WALL='#',FURN='o';
const walkable=c=>c&&c!==WALL&&c!==FURN;
const isStair=c=>c==='='||c==='/';
const isWindow=c=>c==='~';

function parse(id){
  const src=FR.floors[id],h=src.grid.length,w=Math.max(...src.grid.map(r=>r.length)),cells=[];
  for(let y=0;y<h;y++){
    cells[y]=[];
    for(let x=0;x<w;x++){
      const ch=src.grid[y][x]||WALL;
      cells[y][x]={x,y,ch,walk:walkable(ch),room:FR.letterRooms[ch]||null,door:ch==='+',secret:ch==='▒',travel:isStair(ch)||isWindow(ch)};
    }
  }
  // 热点锚点 * 继承最近的房间字母
  let last=null;
  for(const row of cells)for(const c of row){
    if(c.room)last=c.room;
    else if(c.ch==='*'&&last)c.room=last;
  }
  return {id,name:src.name,w,h,cells};
}
FR.maps=Object.fromEntries(FR.floorOrder.map(id=>[id,parse(id)]));

function eachCell(f,fn){const m=FR.maps[f];for(const row of m.cells)for(const c of row)fn(c);}
function keyOf(x,y){return x+','+y;}

FR.Map={
  cell(f,x,y){return FR.maps[f]?.cells[Math.floor(y)]?.[Math.floor(x)];},
  walk(f,x,y,s){
    const c=this.cell(f,x,y);
    if(!c||!c.walk)return false;
    if(c.door&&s?.locks?.has(`${f}:${c.x}:${c.y}`))return false;
    if(c.secret&&!(s?.revealed?.has(`${f}:${c.x}:${c.y}`)))return false;
    return true;
  },
  // 换层点：楼梯 / 木梯 / 破窗 / 暗门，以及通往另一层门厅的普通门
  // 真正能换层的位置（楼梯 / 木梯 / 破窗 / 暗门）。
  // 注意：普通门 '+' 不换层——它是「推进到同层相邻区域」的动作门，
  // 若把它也算作换层点，BFS 只要摸到任何一扇门就满足条件，锁门兜底会永远放行。
  travelHere(f,x,y){
    const c=this.cell(f,x,y);
    return !!c&&(c.travel||c.secret);
  },
  travelKind(f,x,y){
    const c=this.cell(f,x,y);
    if(!c)return null;
    if(c.ch==='=')return 'up';
    if(c.ch==='/')return 'ladder';
    if(c.ch==='~')return 'window';
    if(c.secret)return 'push';
    if(c.door)return 'open';
    return null;
  },
  roomAt(f,x,y){
    const c=this.cell(f,x,y);
    if(c?.room)return c.room;
    let best=null,bd=5;
    eachCell(f,q=>{
      if(!q.room)return;
      const d=Math.abs(q.x-x)+Math.abs(q.y-y);
      if(d<bd){bd=d;best=q.room;}
    });
    return best;
  },
  neighbors(f,n,s){
    return [[1,0],[-1,0],[0,1],[0,-1]]
      .map(([dx,dy])=>({x:n.x+dx,y:n.y+dy}))
      .filter(q=>this.walk(f,q.x,q.y,s));
  },
  path(f,a,b,s){
    const open=[{x:Math.floor(a.x),y:Math.floor(a.y)}];
    const came=new Map(),seen=new Set([keyOf(open[0].x,open[0].y)]);
    const gx=Math.floor(b.x),gy=Math.floor(b.y);
    while(open.length){
      open.sort((u,v)=>(Math.abs(u.x-gx)+Math.abs(u.y-gy))-(Math.abs(v.x-gx)+Math.abs(v.y-gy)));
      const n=open.shift();
      if(n.x===gx&&n.y===gy){
        const out=[n];let k=keyOf(n.x,n.y);
        while(came.has(k)){const p=came.get(k);out.unshift(p);k=keyOf(p.x,p.y);}
        return out.slice(0,61);
      }
      for(const q of this.neighbors(f,n,s)){
        const k=keyOf(q.x,q.y);
        if(!seen.has(k)){seen.add(k);came.set(k,n);open.push(q);}
      }
    }
    return [];
  },
  reach(f,start,s){
    const seen=new Set([keyOf(start.x,start.y)]);
    const queue=[{x:Math.floor(start.x),y:Math.floor(start.y)}];
    while(queue.length){
      const n=queue.shift();
      for(const q of this.neighbors(f,n,s)){
        const k=keyOf(q.x,q.y);
        if(!seen.has(k)){seen.add(k);queue.push(q);}
      }
    }
    return seen;
  },
  spawn(f,room){
    const all=[];
    eachCell(f,c=>{if(c.walk&&(room?c.room===room:c.ch==='.'))all.push(c);});
    if(room&&!all.length)eachCell(f,c=>{if(c.walk)all.push(c);});
    if(!all.length)eachCell(f,c=>{if(c.walk)all.push(c);});
    return all[Math.floor(Math.random()*all.length)]||{x:2,y:2};
  },
  // 每刻重掷：30% 上锁，且每把锁都有可见理由；
  // BFS 兜底保证「可达出路 ≥ 2」+「可达换层点 ≥ 1」+「可达房间 ≥ 2」。
  // 注意：换层点（楼梯/梯/窗/暗门）在 neighbors() 里也算可行走格，
  // 所以直接统计 reach 集合内的格子即可，不要再用 walk() 二次过滤，
  // 否则被锁的暗门会被算漏，兜底永远不触发。
  rerollLocks(s){
    s.locks=new Set();
    if(!s.revealed)s.revealed=new Set();
    eachCell(s.floor,c=>{
      if(c.door&&Math.random()<FR.C.LOCK)s.locks.add(`${s.floor}:${c.x}:${c.y}`);
    });
    const here={x:Math.floor(s.player.x),y:Math.floor(s.player.y)};
    for(let guard=0;guard<80;guard++){
      const reach=this.reach(s.floor,here,s);
      let exits=0,travel=0;
      const rooms=new Set();
      reach.forEach(k=>{
        const [x,y]=k.split(',').map(Number);
        const c=this.cell(s.floor,x,y);
        if(!c)return;
        if(c.door||c.travel||c.secret)exits++;
        if(c.travel||c.secret)travel++;
        if(c.room)rooms.add(c.room);
      });
      if(exits>=2&&travel>=1&&rooms.size>=2)break;
      const locked=[...s.locks].filter(k=>k.startsWith(s.floor+':'));
      if(!locked.length)break;
      s.locks.delete(locked[Math.floor(Math.random()*locked.length)]);
    }
  },
  revealSecret(s,f,x,y){if(!s.revealed)s.revealed=new Set();s.revealed.add(`${f}:${x}:${y}`);},
  // 9 种门动作按全楼层全局序号分配，保证 9 种全部被用上
  doorAction(f,x,y){
    const list=FR.doorActions;
    if(!FR._doorSeq){
      FR._doorSeq=new Map();
      let n=0;
      FR.floorOrder.forEach(fid=>{
        const m=FR.maps[fid];
        if(!m)return;
        m.cells.forEach(row=>row.forEach(c=>{
          if(c.door){FR._doorSeq.set(`${fid}:${c.x}:${c.y}`,list[n%list.length]);n++;}
        }));
      });
    }
    return FR._doorSeq.get(`${f}:${x}:${y}`)||list[0];
  },
  transition(s,c){
    const fi=FR.floorOrder.indexOf(s.floor);
    let ni=fi;
    if(c==='='||c==='/')ni=Math.min(3,fi+1);
    else if(c==='~')ni=fi>0?fi-1:0;
    else if(c==='▒')ni=Math.min(3,fi+1);
    else if(c==='+'){ni=fi===1?2:fi===2?1:fi+1;}
    if(ni===fi&&c!=='='&&c!=='/'&&c!=='▒'&&c!=='~')return null;
    if(ni===fi)return null;
    const from=s.floor;
    s.floor=FR.floorOrder[ni];
    const p=this.spawn(s.floor,null);
    s.player.x=p.x+.5;s.player.y=p.y+.5;
    return {from,to:s.floor,action:this.travelKind(from,Math.floor(s.player.x),Math.floor(s.player.y))||'up'};
  },
  light(s,f,x,y){
    const d=Math.hypot(x-s.player.x,y-s.player.y);
    let r=FR.C.LIGHT;
    if(s.player.inventory.includes('lantern'))r+=FR.C.LANTERN_BONUS;
    const room=FR.roomById[this.roomAt(f,x,y)];
    if(room?.dark)r*=.6;
    return Math.max(0,1-d/Math.max(r,.001));
  },
  material(s,f,x,y){
    const rid=this.roomAt(f,x,y);
    if(!rid)return 'stone';
    if(['kitchen','bedroom','storage'].includes(rid))return 'wood';
    if(['hall','chapel','corridor','library'].includes(rid))return 'carpet';
    return 'stone';
  },
  validate(){
    const report={floors:[],travel:[],doors:0,secrets:0,furniture:0,actions:{},ok:true};
    FR.doorActions.forEach(a=>{report.actions[a]=0;});
    for(const f of FR.floorOrder){
      const m=FR.maps[f];
      const walk=[];eachCell(f,c=>{if(c.walk)walk.push(c);});
      report.furniture+=m.cells.flat().filter(c=>c.ch===FURN).length;
      const secrets=m.cells.flat().filter(c=>c.secret);
      report.secrets+=secrets.length;
      report.doors+=m.cells.flat().filter(c=>c.door).length;
      const start=walk[0];
      const open={locks:new Set(),revealed:new Set(secrets.map(c=>`${f}:${c.x}:${c.y}`))};
      const reach=this.reach(f,start,open);
      const ok=reach.size===walk.length;
      report.floors.push({floor:f,w:m.w,h:m.h,walk:walk.length,reachable:reach.size,ok});
      if(!ok)report.ok=false;
      const t=m.cells.flat().filter(c=>c.travel||c.secret||c.door);
      report.travel.push({floor:f,count:t.length,ok:t.length>0});
      if(!t.length)report.ok=false;
    }
    // 9 种门动作分配检查
    if(FR._doorSeq){FR._doorSeq=null;}
    FR.floorOrder.forEach(f=>{
      eachCell(f,c=>{
        if(c.door){const a=this.doorAction(f,c.x,c.y);report.actions[a]=(report.actions[a]||0)+1;}
      });
    });
    FR.doorActions.forEach(a=>{if(!report.actions[a])report.ok=false;});
    return report;
  }
};
})();
