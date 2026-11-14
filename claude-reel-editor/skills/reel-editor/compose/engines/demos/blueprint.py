from kit import *
# Demo do estilo blueprint (só receita, sem motor): folha de cianotipia, linha clara desenhada na ordem do desenhista, cota viva, balões, carimbo.
PRE = r"""
ctx.drawImage(cache('folha',w,h,(c,w,h)=>{c.fillStyle='$K';c.fillRect(0,0,w,h);c.fillStyle='rgba(28,78,160,.62)';c.fillRect(0,0,w,h);
 const r=mulberry(7);c.strokeStyle='$C';c.lineWidth=1;c.globalAlpha=.07;for(let x=60;x<w;x+=60){c.beginPath();c.moveTo(x,0);c.lineTo(x,h);c.stroke()}
 for(let y=60;y<h;y+=60){c.beginPath();c.moveTo(0,y);c.lineTo(w,y);c.stroke()}
 c.globalAlpha=.05;for(let i=0;i<1200;i++){const x=r()*w,y=r()*h;c.beginPath();c.moveTo(x,y);c.lineTo(x+10+r()*20,y+r()*4-2);c.stroke()}
 c.globalAlpha=.18;c.beginPath();c.moveTo(700,0);c.lineTo(700,h);c.moveTo(0,1180);c.lineTo(w,1180);c.stroke();c.globalAlpha=1}),0,0);
ctx.strokeStyle='$C';ctx.fillStyle='$C';ctx.lineCap='round';ctx.shadowColor='$C';ctx.shadowBlur=1.5;ctx.textBaseline='alphabetic';
const ln=(a,b,c,d,t0,t1,lw,dash)=>{const u=eo(seg(t,t0,t1));if(u<=0)return;ctx.lineWidth=lw||2.2;ctx.setLineDash(dash||[]);ctx.beginPath();ctx.moveTo(a,b);ctx.lineTo(lerp(a,c,u),lerp(b,d,u));ctx.stroke();ctx.setLineDash([])};
const tx=(s,x,y,t0,f,al)=>{const u=seg(t,t0,t0+.2);if(u<=0)return;ctx.save();ctx.globalAlpha=u;ctx.font=f||'600 26px Aspekta';ctx.textAlign=al||'left';ctx.fillText(s,x,y);ctx.restore()};
const bal=(n,x,y,px,py,t0)=>{ln(px,py,x,y,t0,t0+.25,1);const u=seg(t,t0+.2,t0+.35);if(u<=0)return;ctx.lineWidth=1.4;ctx.beginPath();ctx.arc(x,y,24*u,0,7);ctx.save();ctx.fillStyle='rgb(22,52,110)';ctx.fill();ctx.restore();ctx.stroke();tx(n,x,y+9,t0+.25,'600 24px Aspekta','center')};
const cota=(x0,x1,y,t0,s)=>{ln(x0,y-30,x0,y+30,t0,t0+.2,1.4);ln(x1,y-30,x1,y+30,t0,t0+.2,1.4);ln((x0+x1)/2-90,y,x0,y,t0+.1,t0+.5,1.4);ln((x0+x1)/2+90,y,x1,y,t0+.1,t0+.5,1.4);tx(s,(x0+x1)/2,y+10,t0+.2,'600 30px Aspekta','center')};
const stamp=(s,x,y,t0)=>{const u=seg(t,t0,t0+.25);if(u<=0)return;ctx.save();ctx.shadowBlur=0;ctx.translate(x,y);ctx.rotate(-.1);const k=lerp(1.6,1,bk(u,2.5));ctx.scale(k,k);ctx.globalAlpha=.92;ctx.strokeStyle='$R';ctx.fillStyle='$R';ctx.lineWidth=5;ctx.font='700 58px Aspekta';ctx.textAlign='center';const m=ctx.measureText(s).width;ctx.strokeRect(-m/2-24,-58,m+48,84);ctx.fillText(s,0,4);ctx.restore()};
// carimbo de título e notas
ctx.lineWidth=1.4;ctx.strokeRect(700,220,310,110);ctx.beginPath();ctx.moveTo(700,262);ctx.lineTo(1010,262);ctx.stroke();
"""
S1 = PRE + r"""
tx('PROJETO Nº 07',716,251,0,'600 22px Aspekta');tx('O MÉTODO',716,310,.1,'700 38px Aspekta');
tx('FIG. 1',70,300,0,'700 64px Aspekta');tx('ENGRENAGEM DO HÁBITO · ESC 1:1',70,344,.2,'500 24px Aspekta');
const cx=540,cy=860,arc=(r,t0,t1,lw,dash)=>{const u=eo(seg(t,t0,t1));if(u<=0)return;ctx.lineWidth=lw;ctx.setLineDash(dash||[]);ctx.beginPath();ctx.arc(cx,cy,r,-1.5708,-1.5708+6.2832*u);ctx.stroke();ctx.setLineDash([])};
ln(cx-400,cy,cx+400,cy,0,.4,1.4,[36,8,6,8]);ln(cx,cy-400,cx,cy+400,.1,.5,1.4,[36,8,6,8]);
arc(290,.3,1.0,3.5);arc(220,.5,1.1,1.4,[8,6]);arc(96,.7,1.2,3.5);arc(42,.8,1.2,2.2);
for(let i=0;i<16;i++){const u=eo(seg(t,.9+i*.03,1.1+i*.03));if(u<=0)continue;const a=i*Math.PI/8,c=Math.cos(a),s=Math.sin(a),R=290,E=R+46*u;ctx.lineWidth=3.5;ctx.beginPath();ctx.moveTo(cx+c*R-s*28,cy+s*R+c*28);ctx.lineTo(cx+c*E-s*18,cy+s*E+c*18);ctx.lineTo(cx+c*E+s*18,cy+s*E-c*18);ctx.lineTo(cx+c*R+s*28,cy+s*R-c*28);ctx.stroke()}
for(let i=0;i<6;i++){const a=i*Math.PI/3+.5;ln(cx+Math.cos(a)*96,cy+Math.sin(a)*96,cx+Math.cos(a)*220,cy+Math.sin(a)*220,1.2+i*.05,1.5+i*.05,2.2)}
{const u=seg(t,1.4,1.9);if(u>0){ctx.save();ctx.beginPath();ctx.arc(cx,cy,96,0,7);ctx.arc(cx,cy,42,0,7,true);ctx.clip('evenodd');ctx.lineWidth=1;for(let i=0;i<Math.floor(34*u);i++){const o=-200+i*12;ctx.beginPath();ctx.moveTo(cx+o-110,cy+110);ctx.lineTo(cx+o+110,cy-110);ctx.stroke()}ctx.restore()}}
cota(cx-290,cx+290,1290,1.7,'Ø '+Math.round(lerp(0,580,eo(seg(t,1.8,2.4))))+' mm');
bal('1',860,560,cx+210,cy-200,1.9);bal('2',200,620,cx-60,cy-70,2.1);bal('3',880,1130,cx+300,cy+130,2.3);
tx('1  GATILHO    2  EIXO    3  DENTE = 1 DIA',70,1400,2.4,'500 26px Aspekta');
"""
S2 = PRE + r"""
tx('PROJETO Nº 07',716,251,0,'600 22px Aspekta');tx('O PROCESSO',716,310,0,'700 38px Aspekta');
tx('FIG. 2',70,300,0,'700 64px Aspekta');tx('VISTA EXPLODIDA · 3 ETAPAS',70,344,.1,'500 24px Aspekta');
[['ENTRADA','ideia solta'],['FOCO','25 min sem tela'],['ENTREGA','feito > perfeito']].forEach(([a,b],i)=>{const y=470+i*290,t0=.2+i*.45,x=200,W=560,H=170;
 for(let k=5;k>=0;k--){ln(x+k*6,y-k*6,x+W+k*6,y-k*6,t0,t0+.3,k?1:3.5);ln(x+W+k*6,y-k*6,x+W+k*6,y+H-k*6,t0+.1,t0+.4,k?1:3.5)}
 ln(x+W,y+H,x,y+H,t0+.2,t0+.5,3.5);ln(x,y+H,x,y,t0+.3,t0+.6,3.5);
 tx(a,x+36,y+84,t0+.4,'700 56px Aspekta');tx(b,x+38,y+130,t0+.5,'500 28px Aspekta');bal(String(i+1),x-80,y+H/2,x,y+H/2,t0+.5);
 if(i<2){ln(x+W/2,y+H+16,x+W/2,y+H+100,t0+.6,t0+.8,2.2);ln(x+W/2-14,y+H+82,x+W/2,y+H+100,t0+.75,t0+.85,2.2);ln(x+W/2+14,y+H+82,x+W/2,y+H+100,t0+.75,t0+.85,2.2)}});
ln(900,470,900,1220,1.6,2.0,1.4);ln(870,470,930,470,1.6,1.7,1.4);ln(870,1220,930,1220,1.9,2.0,1.4);
tx(Math.round(lerp(0,30,eo(seg(t,1.7,2.4))))+' DIAS',940,860,1.7,'600 30px Aspekta');
stamp('APROVADO',560,1400,2.2);
"""

js = lambda s: s.replace("$R2", RED2).replace("$R", RED).replace("$A", AMB).replace("$K", BLK).replace("$C", CRM)
scene(1, 0.0, 3.2, "cream", None, back=lambda p, d: canvas(p, js(S1), d), world=dict(scale=1.04), signature=True)
scene(2, 3.2, 6.8, "cream", None, back=lambda p, d: canvas(p, js(S2), d), world=dict(x=-30), tr="cut")
scene(3, 6.8, DUR, "cream", None, back=lambda p, d: (giant(p, ["FIM"], 24, 14, BLK), g_in(p, 1)), world=dict(x=0, scale=1), tr="wipe")
render()

