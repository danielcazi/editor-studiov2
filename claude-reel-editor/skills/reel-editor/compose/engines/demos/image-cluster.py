from kit import *
# Demo do estilo image-cluster (só guia, sem motor): cluster de 3 a 5 imagens com leve rotação e sombra acima da cabeça do locutor, legenda pequena; o cluster inteiro troca a cada ideia.
PRE = r"""
const g=ctx.createLinearGradient(0,0,0,h);g.addColorStop(0,'#1b1b1f');g.addColorStop(1,'#0c0c0e');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
// o lugar do locutor (silhueta neutra, não é ilustração do estilo)
ctx.fillStyle='#2c2c33';ctx.beginPath();ctx.arc(540,1130,150,0,7);ctx.fill();ctx.beginPath();ctx.moveTo(180,1920);ctx.bezierCurveTo(200,1420,380,1330,540,1330);ctx.bezierCurveTo(700,1330,880,1420,900,1920);ctx.fill();
const foto=(x,y,W,H,rot,t0,cor,des)=>{const u=bk(seg(t,t0,t0+.35),1.6),o=seg(t,t0,t0+.15)*(1-seg(t,OUT,OUT+.2));if(o<=0)return;ctx.save();ctx.globalAlpha=o;ctx.translate(x,y+40*(1-u));ctx.rotate(rot*Math.PI/180);ctx.scale(.8+.2*u,.8+.2*u);
 ctx.shadowColor='rgba(0,0,0,.55)';ctx.shadowBlur=40;ctx.shadowOffsetY=18;ctx.fillStyle='$C';ctx.beginPath();ctx.roundRect(-W/2,-H/2,W,H,18);ctx.fill();ctx.shadowColor='transparent';
 ctx.beginPath();ctx.roundRect(-W/2+10,-H/2+10,W-20,H-20,10);ctx.clip();ctx.fillStyle=cor;ctx.fillRect(-W/2,-H/2,W,H);des(W,H);ctx.restore()};
const leg=(s,k,t0)=>{const o=seg(t,t0,t0+.2)*(1-seg(t,OUT,OUT+.2));if(o<=0)return;ctx.globalAlpha=o;ctx.font='500 40px Aspekta';ctx.textAlign='center';ctx.fillStyle='$C';ctx.fillText(s,540,1620);const m=ctx.measureText(s).width,mk=ctx.measureText(k).width,i=s.indexOf(k),pre=ctx.measureText(s.slice(0,i)).width;ctx.fillStyle='$A';ctx.textAlign='left';ctx.fillText(k,540-m/2+pre,1620);ctx.globalAlpha=1};
"""
S1 = "const OUT=9;" + PRE + r"""
foto(300,520,360,300,-6,.1,'$A',(W,H)=>{ctx.fillStyle='$K';for(let i=0;i<5;i++)ctx.fillRect(-W/2+40+i*60,H/2-40-(40+i*38),40,40+i*38)});
foto(700,440,380,280,5,.3,'#e9e4d4',(W,H)=>{ctx.strokeStyle='$K';ctx.lineWidth=10;ctx.beginPath();ctx.arc(0,10,86,0,7);ctx.stroke();ctx.beginPath();ctx.moveTo(0,10);ctx.lineTo(0,-50);ctx.moveTo(0,10);ctx.lineTo(46,30);ctx.stroke()});
foto(520,800,420,300,-2,.5,'$R',(W,H)=>{ctx.fillStyle='$C';ctx.font='700 150px Aspekta';ctx.textAlign='center';ctx.fillText('60%',0,54)});
foto(840,760,260,240,8,.7,'$K',(W,H)=>{ctx.fillStyle='$A';ctx.beginPath();ctx.moveTo(10,-90);ctx.lineTo(-50,10);ctx.lineTo(-6,10);ctx.lineTo(-20,90);ctx.lineTo(50,-20);ctx.lineTo(4,-20);ctx.fill()});
foto(200,830,250,230,-9,.9,'#e9e4d4',(W,H)=>{ctx.fillStyle='$K';for(let r=0;r<3;r++)for(let c=0;c<4;c++){ctx.globalAlpha=(r*4+c)<7?1:.2;ctx.fillRect(-90+c*48,-60+r*48,34,34)}});
leg('o hábito cresce em degraus','degraus',1.1);
"""
S2 = "const OUT=9;" + PRE + r"""
foto(540,470,460,320,3,.1,'#e9e4d4',(W,H)=>{ctx.fillStyle='$K';ctx.fillRect(-W/2,-H/2,W,54);ctx.fillStyle='$R';ctx.beginPath();ctx.arc(-W/2+34,-H/2+27,10,0,7);ctx.fill();ctx.fillStyle='$K';ctx.globalAlpha=.25;for(let i=0;i<4;i++)ctx.fillRect(-W/2+40,-60+i*46,(W-80)*(1-i*.18),22)});
foto(270,790,340,300,-7,.35,'$K',(W,H)=>{ctx.strokeStyle='$C';ctx.lineWidth=12;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(-70,10);ctx.lineTo(-20,60);ctx.lineTo(80,-60);ctx.stroke()});
foto(790,800,360,300,6,.6,'$A',(W,H)=>{ctx.fillStyle='$K';ctx.font='700 120px Aspekta';ctx.textAlign='center';ctx.fillText('30',0,20);ctx.font='600 40px Aspekta';ctx.fillText('DIAS',0,76)});
leg('um print vale mais que a promessa','print',.9);
"""

js = lambda s: s.replace("$R2", RED2).replace("$R", RED).replace("$A", AMB).replace("$K", BLK).replace("$C", CRM)
scene(1, 0.0, 3.2, "cream", None, back=lambda p, d: canvas(p, js(S1), d), world=dict(scale=1.04), signature=True)
scene(2, 3.2, 6.8, "cream", None, back=lambda p, d: canvas(p, js(S2), d), world=dict(x=-30), tr="cut")
scene(3, 6.8, DUR, "cream", None, back=lambda p, d: (giant(p, ["FIM"], 24, 14, BLK), g_in(p, 1)), world=dict(x=0, scale=1), tr="wipe")
render()

