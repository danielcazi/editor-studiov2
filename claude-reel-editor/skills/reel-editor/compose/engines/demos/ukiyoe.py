from kit import *
# Demo do estilo ukiyoe (só receita, sem motor): folha com borda dupla, blocos de cor fora de registro, bokashi, névoa em faixas, cartucho e selo; rolo que desliza.
PRE = r"""
ctx.fillStyle='$C';ctx.fillRect(0,0,w,h);
const fibras=()=>ctx.drawImage(cache('fib',w,h,(c,w,h)=>{const r=mulberry(4);c.strokeStyle='$K';c.lineWidth=1;c.globalAlpha=.09;for(let i=0;i<700;i++){const x=r()*w,y=r()*h,L=40+r()*100,a=(r()-.5)*.2;c.beginPath();c.moveTo(x,y);c.lineTo(x+Math.cos(a)*L,y+Math.sin(a)*L);c.stroke()}}),0,0);
const on=(t0,f)=>{const u=seg(t,t0,t0+.18);if(u<=0)return;ctx.save();ctx.globalAlpha=u;f(u);ctx.restore()};
const serra=(base,amp,f,s,x0)=>{ctx.beginPath();ctx.moveTo(-200,1560);for(let x=-200;x<=1500;x+=12)ctx.lineTo(x,base-amp*vnoise((x+x0)*f+s)-amp*.6*Math.max(0,1-Math.abs(x+x0-s*90)/260));ctx.lineTo(1500,1560);ctx.closePath()};
const nevoa=(x,y,W)=>{const g=ctx.createLinearGradient(x,0,x+W,0);g.addColorStop(0,'rgba(255,249,230,0)');g.addColorStop(.15,'$C');g.addColorStop(.85,'$C');g.addColorStop(1,'rgba(255,249,230,0)');ctx.fillStyle=g;ctx.globalAlpha*=.92;ctx.beginPath();ctx.roundRect(x,y,W,44,22);ctx.fill()};
const cart=(s,t0)=>on(t0,()=>{ctx.fillStyle='$C';ctx.strokeStyle='$K';ctx.lineWidth=3;ctx.fillRect(850,250,110,74+s.length*62);ctx.strokeRect(850,250,110,74+s.length*62);ctx.fillStyle='$K';ctx.font='700 54px Aspekta';ctx.textAlign='center';[...s].forEach((ch,i)=>ctx.fillText(ch,905,330+i*62))});
const selo=(x,y,t0)=>{const u=seg(t,t0,t0+.15);if(u<=0)return;ctx.save();ctx.translate(x+45,y+45);const k=lerp(1.5,1,u);ctx.scale(k,k);ctx.globalAlpha=u;ctx.fillStyle='$R';ctx.beginPath();for(let i=0;i<12;i++){const s=[[-45,-45],[-15,-45],[15,-45],[45,-45],[45,-15],[45,15],[45,45],[15,45],[-15,45],[-45,45],[-45,15],[-45,-15]][i];ctx.lineTo(s[0]+8*(hash(i)-.5),s[1]+8*(hash(i+20)-.5))}ctx.fill();ctx.fillStyle='$C';ctx.fillRect(-26,-28,52,9);ctx.fillRect(-5,-28,10,56);ctx.fillRect(-26,6,52,9);ctx.fillRect(-26,22,52,8);ctx.restore()};
const borda=()=>{ctx.strokeStyle='$K';ctx.lineWidth=6;ctx.strokeRect(70,200,940,1340);ctx.lineWidth=2;ctx.strokeRect(84,214,912,1312)};
ctx.save();ctx.beginPath();ctx.rect(84,214,912,1312);ctx.clip();
"""
S1 = PRE + r"""
const px=-t*26;
on(.1,()=>{const g=ctx.createLinearGradient(0,214,0,520);g.addColorStop(0,'rgba(0,0,0,.5)');g.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=g;ctx.fillRect(84,214,912,320);const g2=ctx.createLinearGradient(0,760,0,1100);g2.addColorStop(0,'rgba(244,123,32,0)');g2.addColorStop(1,'$A');ctx.globalAlpha*=.55;ctx.fillStyle=g2;ctx.fillRect(84,760,912,340)});
on(.35,()=>{ctx.translate(1,-2);ctx.fillStyle='$R';ctx.beginPath();ctx.arc(330,lerp(760,560,eo(seg(t,.35,2.6))),120,0,7);ctx.fill()});
on(.6,()=>{ctx.globalAlpha*=.3;ctx.fillStyle='$K';ctx.translate(px*.3,0);serra(1010,330,.004,6.2,0);ctx.fill()});
on(.75,()=>{ctx.translate(lerp(-200,40,seg(t,.75,3.2)),0);nevoa(120,900,760)});
on(.9,()=>{ctx.translate(px*.6-1.5,2);ctx.fillStyle='$A';serra(1200,200,.006,2,0);ctx.fill()});
on(1.15,()=>{ctx.translate(px+2,1);ctx.fillStyle='$K';ctx.globalAlpha*=.9;serra(1400,190,.008,9,0);ctx.fill()});
on(1.4,()=>{ctx.translate(px*.6,0);ctx.strokeStyle='$K';ctx.lineWidth=2.8;serra(1200,200,.006,2,0);ctx.stroke()});
on(1.5,()=>{ctx.translate(lerp(300,-60,seg(t,1.5,3.2)),0);nevoa(300,1130,820)});
on(1.7,()=>{ctx.translate(px,0);ctx.strokeStyle='$C';ctx.lineWidth=3;for(let j=0;j<4;j++)for(let i=0;i<9;i++){ctx.beginPath();ctx.arc(110+i*130+(j%2)*65,1470+j*26-60,46,3.5,6);ctx.stroke()}});
ctx.restore();on(1.9,borda);cart('VISTA1',2.0);selo(110,250,2.3);fibras();
"""
S2 = PRE + r"""
const px=-t*40;
on(0,()=>{const g=ctx.createLinearGradient(0,214,0,700);g.addColorStop(0,'$A');g.addColorStop(1,'rgba(244,123,32,0)');ctx.globalAlpha*=.8;ctx.fillStyle=g;ctx.fillRect(84,214,912,500)});
on(.2,()=>{ctx.globalAlpha*=.3;ctx.fillStyle='$K';ctx.translate(px*.3,0);serra(930,260,.005,3.1,400);ctx.fill()});
on(.4,()=>{ctx.translate(px+2,1);ctx.fillStyle='$K';ctx.globalAlpha*=.88;serra(1330,150,.004,7.7,300);ctx.fill()});
// a estrada das etapas: 4 marcos com bandeira, figuras pequenas subindo
on(.6,()=>{ctx.translate(px,0);ctx.strokeStyle='$C';ctx.lineWidth=10;ctx.setLineDash([26,18]);ctx.beginPath();ctx.moveTo(60,1500);ctx.bezierCurveTo(400,1380,500,1300,760,1290);ctx.bezierCurveTo(980,1280,1050,1200,1240,1180);ctx.stroke();ctx.setLineDash([])});
[[250,1420],[520,1320],[800,1285],[1080,1215]].forEach(([x,y],i)=>on(.9+i*.35,u=>{ctx.translate(px,0);ctx.fillStyle='$K';ctx.fillRect(x-3,y-150*u,6,150*u);ctx.translate(1,-2);ctx.fillStyle=i===3?'$R':'$A';ctx.beginPath();ctx.moveTo(x+3,y-150);ctx.lineTo(x+86,y-128);ctx.lineTo(x+3,y-104);ctx.fill();ctx.fillStyle='$K';ctx.font='700 30px Aspekta';ctx.fillText(String(i+1),x+18,y-116)}));
on(.8,()=>{ctx.translate(lerp(200,-120,seg(t,.8,3.6)),0);nevoa(200,1010,820)});
on(1.4,()=>{ctx.translate(px*.2+1,-2);ctx.fillStyle='$R';ctx.beginPath();ctx.arc(760,480,96,0,7);ctx.fill()});
ctx.restore();borda();cart('ETAPAS',.3);selo(110,250,.5);fibras();
"""

js = lambda s: s.replace("$R2", RED2).replace("$R", RED).replace("$A", AMB).replace("$K", BLK).replace("$C", CRM)
scene(1, 0.0, 3.2, "cream", None, back=lambda p, d: canvas(p, js(S1), d), world=dict(scale=1.04), signature=True)
scene(2, 3.2, 6.8, "cream", None, back=lambda p, d: canvas(p, js(S2), d), world=dict(x=-30), tr="cut")
scene(3, 6.8, DUR, "cream", None, back=lambda p, d: (giant(p, ["FIM"], 24, 14, BLK), g_in(p, 1)), world=dict(x=0, scale=1), tr="wipe")
render()

