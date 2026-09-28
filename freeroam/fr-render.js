(function(){
const FR=window.FR;
const TILE=32;

function drawFloor(ctx,cam,s,f,c,material){
  const T=FR.C.TILE,px=c.x*T-cam.x,py=c.y*T-cam.y;
  if(px<-T||py<-T||px>ctx.canvas.width||py>ctx.canvas.height)return;
  const seen=s.seen.has(`${f}:${c.x}:${c.y}`);
  const light=FR.Map.light(s,f,c.x+.5,c.y+.5);
  if(!seen&&light<=0)return;
  const dim=seen?1:.55;
  ctx.globalAlpha=dim;

  if(c.ch==='#'){
    ctx.fillStyle='#38283e';ctx.fillRect(px,py,T,T);
    ctx.fillStyle='#58405e';ctx.fillRect(px,py,T,5);
    ctx.fillStyle='#261c30';ctx.fillRect(px+4,py+8,T-8,T-8);
    ctx.globalAlpha=1;return;
  }
  // 地板材质：石材 / 木纹 / 地毯
  const base=material==='wood'?'#33261f':material==='carpet'?'#33222f':'#2a2231';
  const line=material==='wood'?'#4a3830':material==='carpet'?'#4c3650':'#392d42';
  ctx.fillStyle=c.room?'#302439':base;
  ctx.fillRect(px,py,T,T);
  ctx.strokeStyle=line;ctx.lineWidth=1;
  ctx.strokeRect(px+.5,py+.5,T-1,T-1);

  if(c.ch==='*'){
    ctx.fillStyle='#e8c583';
    ctx.globalAlpha=dim*(.45+.25*Math.sin(performance.now()/240+c.x));
    ctx.beginPath();ctx.arc(px+16,py+16,5,0,7);ctx.fill();
    ctx.globalAlpha=dim;
  }
  if(c.ch==='o'){                          // 家具：碰撞体，带投影
    ctx.fillStyle='#00000055';
    ctx.beginPath();ctx.ellipse(px+17,py+27,11,4,0,0,7);ctx.fill();
    ctx.fillStyle='#4b3a2c';ctx.fillRect(px+4,py+8,24,16);
    ctx.fillStyle='#65503c';ctx.fillRect(px+4,py+8,24,5);
    ctx.strokeStyle='#24182f';ctx.lineWidth=2;ctx.strokeRect(px+4,py+8,24,16);
  }
  if(c.door){
    const locked=s.locks.has(`${f}:${c.x}:${c.y}`);
    ctx.fillStyle=locked?'#7e3f58':'#a9784c';
    ctx.fillRect(px+7,py+2,18,28);
    ctx.fillStyle='#e8c583';ctx.fillRect(px+20,py+15,2,2);
    ctx.fillStyle=locked?'#e0577a':'#8fd8c4';
    ctx.font='bold 10px sans-serif';ctx.textAlign='center';
    ctx.fillText(locked?'锁':'→',px+16,py+12);
  }
  if(c.secret){                            // 暗门：未显形时只是一道裂缝
    const rev=s.revealed.has(`${f}:${c.x}:${c.y}`);
    ctx.fillStyle=rev?'#8fd8c4':'#3a2b40';
    ctx.fillRect(px+14,py+2,4,28);
    if(rev){ctx.fillStyle='#8fd8c4';ctx.font='11px sans-serif';ctx.textAlign='center';ctx.fillText('▒',px+16,py+14);}
  }
  if(c.travel){
    ctx.fillStyle='#8fd8c4';ctx.font='18px serif';ctx.textAlign='center';
    ctx.fillText(c.ch==='~'?'◫':c.ch==='/'?'≣':'↟',px+16,py+22);
  }
  ctx.globalAlpha=1;
}

class Renderer{
  constructor(canvas){
    this.c=canvas;this.x=canvas.getContext('2d');this.x.imageSmoothingEnabled=false;this.p=[];
  }
  particle(x,y,color){this.p.push({x,y,vx:(Math.random()-.5)*10,vy:-8-Math.random()*10,t:1,color});}
  draw(s,dt){
    const x=this.x,c=this.c,T=FR.C.TILE,m=FR.maps[s.floor];
    const cam={
      x:clamp(s.player.x*T-c.width/2,0,Math.max(0,m.w*T-c.width)),
      y:clamp(s.player.y*T-c.height/2,0,Math.max(0,m.h*T-c.height))
    };
    x.setTransform(1,0,0,1,0,0);
    x.fillStyle='#1a1424';x.fillRect(0,0,c.width,c.height);

    for(const row of m.cells)for(const q of row)drawFloor(x,cam,s,s.floor,q,FR.Map.material(s,s.floor,q.x,q.y));

    // 热点光环
    for(const h of s.activeHotspots||[]){
      const px=(h.x+.5)*T-cam.x,py=(h.y+.5)*T-cam.y;
      x.strokeStyle='#e8c583';x.lineWidth=2;
      x.globalAlpha=.5+.4*Math.sin(performance.now()/300+h.x);
      x.beginPath();x.arc(px,py,8,0,7);x.stroke();
      x.globalAlpha=1;
    }

    // 对手（同层且光照范围内才渲染；视野锥以半透明扇形标示，仅高对比模式下可见）
    for(const e of s.enemies){
      if(e.floor!==s.floor)continue;
      if(Math.hypot(e.x-s.player.x,e.y-s.player.y)>FR.C.LIGHT+3)continue;
      const px=e.x*T-cam.x,py=e.y*T-cam.y;
      if(document.querySelector('#freeroamShell')?.classList.contains('high-contrast')){
        const a=Math.atan2(e.y-s.player.y-(0),0);
        const facing={down:Math.PI/2,left:Math.PI,right:0,up:-Math.PI/2}[e.dir]??Math.PI/2;
        x.fillStyle='#e0577a22';
        x.beginPath();
        x.moveTo(px,py-24);
        x.arc(px,py-24,FR.C.SIGHT_DIST*T,facing-FR.C.SIGHT_ANGLE*Math.PI/360,facing+FR.C.SIGHT_ANGLE*Math.PI/360);
        x.closePath();x.fill();
      }
      FR.Sprite.draw(x,e,px,py);
      x.fillStyle='#f3d9df';x.font='11px sans-serif';x.textAlign='center';
      x.fillText(e.name,px,py-48);
      if(s.pendingSteal?.targetId===e.id){
        x.fillStyle='#e0577a';x.font='bold 12px sans-serif';
        x.fillText('盯上了',px,py-62);
        x.strokeStyle='#e0577a';x.lineWidth=3;
        x.beginPath();x.moveTo(px-12,py-70);x.lineTo(px+12,py-70);x.stroke();
      }
      if(s.pendingEnemySteal?.targetId===e.id){
        x.fillStyle='#e0577a';x.font='bold 12px sans-serif';
        x.fillText('他盯上你了',px,py-62);
      }
    }

    // 玩家 + 接触阴影
    const ppx=s.player.x*T-cam.x,ppy=s.player.y*T-cam.y;
    x.fillStyle='#00000066';
    x.beginPath();x.ellipse(ppx,ppy-3,11,4,0,0,7);x.fill();
    FR.Sprite.draw(x,s.player,ppx,ppy);

    for(const q of this.p){
      q.t-=dt;q.x+=q.vx*dt;q.y+=q.vy*dt;
      x.globalAlpha=Math.max(0,q.t);x.fillStyle=q.color;
      x.fillRect(q.x*T-cam.x,q.y*T-cam.y,2,2);
    }
    x.globalAlpha=1;
    this.p=this.p.filter(q=>q.t>0);

    // 光照层：径向渐变 + 边缘抖动，暖色叠加；暗处是深紫而非纯黑
    const room=FR.roomById[s.room];
    let r=(FR.C.LIGHT+(s.player.inventory.includes('lantern')?FR.C.LANTERN_BONUS:0))*(room?.dark?.6:1);
    r*=1+.04*Math.sin(performance.now()/180);
    const g=x.createRadialGradient(ppx,ppy,30,ppx,ppy,r*T);
    g.addColorStop(0,'rgba(255,225,170,0)');
    g.addColorStop(.65,'rgba(20,13,31,.18)');
    g.addColorStop(1,'rgba(12,7,19,.94)');
    x.fillStyle=g;x.fillRect(0,0,c.width,c.height);

    if(s.danger>=FR.C.HEARTBEAT){
      const k=Math.min(1,(s.danger-FR.C.HEARTBEAT)/30);
      x.fillStyle=`rgba(12,7,19,${.25*k})`;
      x.fillRect(0,0,c.width,c.height);
    }

    if(s.paused){
      x.fillStyle='#0f0b16bb';x.fillRect(0,0,c.width,c.height);
      x.fillStyle='#e8c583';x.font='bold 24px serif';x.textAlign='center';
      x.fillText('城堡屏住了呼吸',c.width/2,c.height/2);
    }
  }
}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
FR.Renderer=Renderer;
})();
