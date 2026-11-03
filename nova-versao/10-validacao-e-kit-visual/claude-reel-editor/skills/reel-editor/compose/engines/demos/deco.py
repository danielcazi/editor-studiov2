from kit import *
# Demo do motor deco (AD): laca, sunburst, arco escalonado, barra de título, letreiro de lâmpadas por batida, mostrador, portas.
GOLD, INK, ACC = AMB, CRM, RED
S1 = f"""
AD.lacquer(ctx,w,h);
AD.sunburst(ctx,t,0.0,540,760,{{n:28,r1:1500,color:'{GOLD}',alpha:.11,dur:.9}});
AD.arch(ctx,t,0.3,540,420,760,520,{{steps:5,width:4,base:'{GOLD}',dur:.8}});
AD.titleBar(ctx,t,1.0,'BLACK FRIDAY',540,900,820,150,{{base:'{GOLD}',ink:'{INK}'}});
const bb=[340,1120,400,260]; const p=new Path2D(); p.moveTo(340,1380); p.lineTo(540,1120); p.lineTo(740,1380); p.closePath();
if(t>1.9){{AD.airbrush(ctx,p,bb,{{light:'{ACC}',shade:'#4a0a16',base:'{GOLD}'}});}}
AD.gline(ctx,t,1.6,[[140,1460],[940,1460]],{{width:3,dur:.5,base:'{GOLD}',double:true}});
AD.sparkle(ctx,t,2.4,900,1440,30,'{INK}',.6);
"""
S2 = f"""
AD.lacquer(ctx,w,h);
AD.gline(ctx,t,0.0,[[160,330],[920,330]],{{width:3,dur:.4,base:'{GOLD}'}});
AD.marquee(ctx,t,0.3,'10 ANOS',540,640,{{size:170,step:22,on:'{GOLD}',beat:.22,chase:true}});
AD.dial(ctx,t,1.2,540,1120,240,0,60,{{dur:1.1,label:'%',base:'{GOLD}',ink:'{INK}'}});
AD.gline(ctx,t,1.0,[[160,1460],[920,1460]],{{width:3,dur:.4,base:'{GOLD}',double:true}});
AD.doors(ctx,t,3.0,w,h,{{close:true,dur:.5,base:'{GOLD}'}});
"""
scene(1, 0.0, 3.0, 'black', None, back=lambda p, d: canvas(p, S1, d, engine='deco'), world=dict(scale=1.05), signature=True)
scene(2, 3.0, 6.6, 'black', None, back=lambda p, d: canvas(p, S2, d, engine='deco'), world=dict(scale=1.0, rx=-3), tr='cut')
scene(3, 6.6, DUR, 'cream', None, back=lambda p, d: (giant(p, ['FIM'], 24, 14, BLK), g_in(p, 1)), world=dict(rx=0, scale=1), tr='wipe')
render()
