from kit import *
# Demo do estilo visual-investigation (só receita, sem motor): mesa escura de painéis, leitura grande, gráfico com playhead, transcrição grifada, matriz de pontos, círculo e seta.
PRE = r"""
ctx.fillStyle='$K';ctx.fillRect(0,0,w,h);ctx.textBaseline='alphabetic';
const F='rgba(236,234,228,';
const painel=(x,y,W,H,t0,tag)=>{const u=seg(t,t0,t0+.12);if(u<=0)return 0;ctx.fillStyle=F+'.06)';ctx.fillRect(x,y,W,H);ctx.strokeStyle=F+'.18)';ctx.lineWidth=1;ctx.strokeRect(x+.5,y+.5,W,H);ctx.fillStyle='rgba(255,255,255,'+(1-seg(t,t0,t0+.13))*.85+')';ctx.fillRect(x,y,W,H);
 ctx.fillStyle='$R';ctx.fillRect(x,y-30,6,14);ctx.fillStyle=F+'.75)';ctx.font='600 24px Aspekta';ctx.letterSpacing='0.12em';ctx.fillText(tag,x+18,y-16);ctx.letterSpacing='0px';return u};
const leitura=(s,t0)=>{const u=seg(t,t0,t0+.1);if(u<=0)return;ctx.fillStyle='$C';ctx.globalAlpha=u;ctx.font='700 210px Aspekta';ctx.letterSpacing='-0.02em';ctx.fillText(s,66,420);ctx.letterSpacing='0px';ctx.globalAlpha=1};
"""
S1 = PRE + r"""
leitura('T+'+(12.4*seg(t,.2,2.6)).toFixed(1).replace('.',',')+' s',0);
if(painel(70,560,940,440,.2,'DADO · SITE')){const pts=[];for(let i=0;i<=60;i++)pts.push([100+i*14.6,900-40*vnoise(i*.3)-(i>38?(i-38)*9:0)]);
 ctx.fillStyle=F+'.08)';ctx.fillRect(100+38*14.6,580,22*14.6,400);ctx.fillStyle=F+'.55)';ctx.font='500 24px Aspekta';ctx.fillText('virada',112+38*14.6,612);
 const u=seg(t,.4,2.6),n=Math.floor(u*60);ctx.strokeStyle=F+'.7)';ctx.lineWidth=2;ctx.beginPath();pts.slice(0,n+1).forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.stroke();
 ctx.fillStyle='$R';ctx.fillRect(100+u*876,580,2,400);for(let i=0;i<=12;i++){ctx.fillStyle=F+'.3)';ctx.fillRect(100+i*73,972,1,8)}}
if(painel(70,1090,940,330,.7,'FALA · 0:42')){ctx.fillStyle='$C';ctx.fillRect(70,1090,940,330);ctx.font='500 34px ui-monospace,Menlo,monospace';ctx.fillStyle='$K';
 const L=['"não é falta de tempo,','é falta de começo:','o gráfico vira no dia 12."'];L.forEach((s,i)=>{const n=Math.floor(clamp((t-.9-i*.5)*40,0,s.length));ctx.fillText(s.slice(0,n),100,1170+i*70)});
 const hu=seg(t,2.0,2.4);if(hu>0){ctx.save();ctx.globalCompositeOperation='multiply';ctx.globalAlpha=.6;ctx.fillStyle='$R';ctx.fillRect(96,1276,540*hu,50);ctx.restore()}
 ctx.fillStyle='rgba(0,0,0,.5)';ctx.font='500 22px Aspekta';ctx.fillText('transcrição',860,1400)}
{const u=seg(t,2.2,2.5);if(u>0){ctx.strokeStyle='$R';ctx.lineWidth=2;ctx.setLineDash([6,6]);ctx.beginPath();ctx.moveTo(100+38*14.6,1000);ctx.lineTo(100+38*14.6,1000+90*u);ctx.stroke();ctx.setLineDash([])}}
"""
S2 = PRE + r"""
leitura('1 em 7',0);
if(painel(70,560,620,560,.15,'CONTAGEM · 140')){for(let i=0;i<140;i++){const x=110+(i%14)*42,y=610+Math.floor(i/14)*50,red=i%7===3,on=red&&t>.5+i*.012;if(on){ctx.strokeStyle='$R';ctx.lineWidth=3;ctx.beginPath();ctx.arc(x,y,10,0,7);ctx.stroke()}else{ctx.fillStyle=F+(red?'.25)':'.55)');ctx.beginPath();ctx.arc(x,y,7,0,7);ctx.fill()}}}
if(painel(730,560,280,260,.5,'SABEMOS')){ctx.fillStyle='$C';ctx.font='600 40px Aspekta';['20 começam','3 terminam'].forEach((s,i)=>ctx.fillText(s,750,640+i*70));ctx.fillStyle='$R';ctx.fillRect(750,760,44,44);ctx.strokeStyle='$C';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(760,782);ctx.lineTo(770,793);ctx.lineTo(785,770);ctx.stroke()}
{const u=seg(t,.9,1.0);if(u>0){ctx.strokeStyle='$R';ctx.lineWidth=2;ctx.setLineDash([8,6]);ctx.strokeRect(730.5,880.5,280,240);ctx.setLineDash([]);ctx.fillStyle='$R';ctx.fillRect(730,850,6,14);ctx.fillStyle=F+'.75)';ctx.font='600 24px Aspekta';ctx.letterSpacing='0.12em';ctx.fillText('EM ABERTO',748,864);ctx.letterSpacing='0px';ctx.fillStyle=F+'.55)';ctx.font='500 34px Aspekta';['≈ por quê?','inferido'].forEach((s,i)=>ctx.fillText(s,750,960+i*60))}}
{const cx=110+3*42,cy=610+2*50,u=eo(seg(t,1.4,1.9));if(u>0){ctx.strokeStyle='$R';ctx.lineWidth=3;ctx.beginPath();ctx.arc(cx,cy,64,-1.57,-1.57+6.2832*u);ctx.stroke();const a=eo(seg(t,1.7,2.0));if(a>0){ctx.beginPath();ctx.moveTo(cx+45,cy+45);ctx.lineTo(cx+45+330*a,cy+45+520*a);ctx.stroke()}}
 const l=seg(t,2.0,2.2);if(l>0){ctx.globalAlpha=l;ctx.fillStyle='$C';ctx.font='600 64px Aspekta';ctx.fillText('quem começa hoje',70,1320);ctx.fillStyle=F+'.55)';ctx.font='500 36px Aspekta';ctx.fillText('é o ponto vermelho da contagem',70,1380);ctx.globalAlpha=1}}
"""

js = lambda s: s.replace("$R2", RED2).replace("$R", RED).replace("$A", AMB).replace("$K", BLK).replace("$C", CRM)
scene(1, 0.0, 3.2, "cream", None, back=lambda p, d: canvas(p, js(S1), d), world=dict(scale=1.04), signature=True)
scene(2, 3.2, 6.8, "cream", None, back=lambda p, d: canvas(p, js(S2), d), world=dict(x=-30), tr="cut")
scene(3, 6.8, DUR, "cream", None, back=lambda p, d: (giant(p, ["FIM"], 24, 14, BLK), g_in(p, 1)), world=dict(x=0, scale=1), tr="wipe")
render()

