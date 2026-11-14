from kit import *
# Demo do estilo woodcut (só receita, sem motor): chapa preta talhada, raios de goiva, uma chapa de cor em multiply, rótulo de prelo.
PRE = r"""
ctx.drawImage(cache('papel',w,h,(c,w,h)=>{c.fillStyle='$C';c.fillRect(0,0,w,h);c.fillStyle='$K';c.globalAlpha=.035;for(let y=0;y<h;y+=6)c.fillRect(0,y,w,1);c.globalAlpha=.05;for(let x=0;x<w;x+=120)c.fillRect(x,0,1,h);c.globalAlpha=1;grain(c,w,h,4000,.06,3)}),0,0);
const chapa=(k,cor)=>ctx.drawImage(cache(k,w,h,(c,w,h)=>{c.fillStyle=cor;c.beginPath();const P=[];for(let x=70;x<=1010;x+=24)P.push([x,200+12*(vnoise(x*.05)-.5)]);for(let y=200;y<=1380;y+=24)P.push([1010+12*(vnoise(y*.05+9)-.5),y]);for(let x=1010;x>=70;x-=24)P.push([x,1380+12*(vnoise(x*.05+5)-.5)]);for(let y=1380;y>=200;y-=24)P.push([70+12*(vnoise(y*.05+2)-.5),y]);P.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.fill()}),0,0);
const cut=(x0,y0,x1,y1,w0,t0,dur,cor)=>{const u=eo(seg(t,t0,t0+dur));if(u<=0)return;const dx=x1-x0,dy=y1-y0,L=Math.hypot(dx,dy)||1,nx=-dy/L*w0/2,ny=dx/L*w0/2;ctx.fillStyle=cor||'$C';ctx.beginPath();ctx.moveTo(x0+nx,y0+ny);ctx.lineTo(x0-nx,y0-ny);ctx.lineTo(x0+dx*u,y0+dy*u);ctx.fill()};
const rot=(s,t0)=>{const u=seg(t,t0,t0+.12);if(u<=0)return;ctx.save();ctx.globalAlpha=.92*u;ctx.fillStyle='$K';ctx.font='700 64px Aspekta';ctx.textAlign='center';ctx.letterSpacing='0.14em';ctx.fillText(s,540,1490);ctx.globalAlpha=.3*u;ctx.fillText(s,541,1491);ctx.restore()};
ctx.save();ctx.beginPath();ctx.rect(60,190,960,1200);ctx.clip();
"""
S1 = PRE + r"""
chapa('ch1','$K');const cx=540,cy=760,r=mulberry(11);
for(let i=0;i<44;i++){const a=i/44*6.2832+r()*.08,r0=190+r()*50,r1=r0+220+r()*460,w0=12+r()*16;cut(cx+Math.cos(a)*r1,cy+Math.sin(a)*r1,cx+Math.cos(a)*r0,cy+Math.sin(a)*r0,w0,.1+r0/260*.3+r()*.5,.3)}
for(let i=0;i<30;i++){const a=i/30*6.2832,c=Math.cos(a),s=Math.sin(a);cut(cx+c*172+s*20,cy+s*172-c*20,cx+c*172-s*24,cy+s*172+c*24,2.2,1.2+i*.02,.1)}
for(let i=0;i<7;i++){const a=-2.5+i*.14;cut(cx+Math.cos(a)*150,cy+Math.sin(a)*150,cx+Math.cos(a)*84,cy+Math.sin(a)*84,7,1.5+i*.06,.15)}
for(let i=0;i<120;i++){const x=90+r()*900,y=220+r()*1140,t0=1.6+r()*.8;if(t>t0&&Math.hypot(x-cx,y-cy)>190){ctx.fillStyle='$C';ctx.beginPath();ctx.arc(x,y,3+r()*4,0,7);ctx.fill()}}
{const u=eo(seg(t,2.0,2.5));if(u>0){ctx.save();ctx.globalCompositeOperation='multiply';ctx.globalAlpha=.85;ctx.fillStyle='$R';ctx.translate(3,-2);ctx.beginPath();ctx.arc(cx,cy,420*u,0,7);ctx.fill();ctx.restore()}}
ctx.restore();rot('UMA SÓ COISA',2.2);
"""
S2 = PRE + r"""
chapa('ch2','$K');const r=mulberry(5);
for(let i=0;i<70;i++){const y=230+i*11.5,x0=80+r()*60,t0=i*.012;let x=x0;while(x<1000){const L=80+r()*240;cut(x,y,Math.min(1000,x+L),y+r()*4-2,6+r()*5,t0+r()*.3,.3);x+=L+10+r()*40}}
ctx.fillStyle='$K';ctx.beginPath();ctx.moveTo(70,1380);ctx.lineTo(300,900);ctx.lineTo(420,1010);ctx.lineTo(640,520);ctx.lineTo(820,930);ctx.lineTo(900,860);ctx.lineTo(1010,1100);ctx.lineTo(1010,1380);ctx.fill();
for(let i=0;i<16;i++){const k=i/16,x=640-k*200,y=520+k*455;cut(x-4,y+6,x-70-r()*70,y+120+r()*60,8,1.0+i*.05,.2)}
for(let i=0;i<8;i++){const k=i/8,x=300-k*200,y=900+k*420;cut(x-4,y+6,x-50,y+100,6,1.5+i*.05,.2)}
{const u=eo(seg(t,1.3,1.6));if(u>0){ctx.fillStyle='$K';ctx.fillRect(636,520-150*u,6,150*u);ctx.beginPath();ctx.moveTo(642,520-150*u);ctx.lineTo(642+90*u,520-150*u+26);ctx.lineTo(642,520-150*u+52);ctx.fill()}}
{const u=eo(seg(t,1.9,2.4));if(u>0){ctx.save();ctx.globalCompositeOperation='multiply';ctx.globalAlpha=.85;ctx.fillStyle='$R';ctx.translate(3,-2);ctx.beginPath();ctx.arc(860,400,110*u,0,7);ctx.fill();ctx.restore()}}
ctx.restore();rot('O ESFORÇO',2.0);
"""

js = lambda s: s.replace("$R2", RED2).replace("$R", RED).replace("$A", AMB).replace("$K", BLK).replace("$C", CRM)
scene(1, 0.0, 3.2, "cream", None, back=lambda p, d: canvas(p, js(S1), d), world=dict(scale=1.04), signature=True)
scene(2, 3.2, 6.8, "cream", None, back=lambda p, d: canvas(p, js(S2), d), world=dict(x=-30), tr="cut")
scene(3, 6.8, DUR, "cream", None, back=lambda p, d: (giant(p, ["FIM"], 24, 14, BLK), g_in(p, 1)), world=dict(x=0, scale=1), tr="wipe")
render()

