from kit import *
import os
# Demo do motor briefing (BB): quadro, letras de caneta, foto do site presa com ímã, seta, cota, etiqueta, carimbo, fantasma.
IMG = next((f for f in sorted(os.listdir('assets/img')) if f.lower().endswith(('.webp', '.png', '.jpg', '.jpeg'))), '')
GRAF, MED, DEC = BLK, RED2, RED
S1 = f"""
BB.board(ctx,w,h,5);
BB.ghost(ctx,'plano-velho',w,h,(c,W,H)=>{{c.font='600 110px Aspekta';c.fillStyle='#000';c.fillText('PLANO A',120,760);c.lineWidth=8;c.strokeStyle='#000';c.beginPath();c.moveTo(100,700);c.lineTo(700,800);c.stroke()}},.07);
BB.letter(ctx,t,0.1,'PROCRASTINAR',90,420,118,'{GRAF}',{{cps:22,seed:3}});
BB.ink(ctx,t,0.8,[[90,470],[640,478]],'{MED}',{{width:7,speed:1600}});
const im=BB.image('assets/img/{IMG}'); BB.pin(ctx,t,1.1,im,120,560,520,420,{{tilt:-4,magnet:'{DEC}'}});
BB.arrow(ctx,t,1.6,[[700,640],[820,760],[760,980]],'{GRAF}',{{width:6}});
BB.tag(ctx,t,1.9,'AULA 1 · 42 MIN',700,1010,{{size:34}});
BB.letter(ctx,t,2.2,'adiar = pagar juros',90,1180,78,'{GRAF}',{{cps:26,seed:9,tilt:2}});
BB.stamp(ctx,t,2.7,'CARO',760,1180,'{DEC}',{{size:80,rot:-10}});
"""
# comparação com cota em unidade real, projeção entre vistas, veredito
S2 = f"""
BB.board(ctx,w,h,5);
BB.letter(ctx,t,0.0,'30 DIAS',90,380,96,'{GRAF}',{{cps:24,seed:5}});
BB.ink(ctx,t,0.3,[[90,440],[90,980]],'{GRAF}',{{width:6,speed:2200}});
BB.ink(ctx,t,0.5,[[90,980],[980,980]],'{GRAF}',{{width:6,speed:2600}});
const barras=[[200,'HOJE',560],[520,'7 DIAS',430],[840,'30 DIAS',140]];
barras.forEach(([x,l,y],i)=>{{const u=eio(seg(t,.8+i*.25,1.2+i*.25));if(u<=0)return;ctx.save();ctx.globalCompositeOperation='multiply';ctx.globalAlpha=.9;ctx.fillStyle=i===2?'{DEC}':'{MED}';ctx.fillRect(x-60,980-(980-y)*u,120,(980-y)*u);ctx.restore();BB.letter(ctx,t,1.15+i*.25,l,x,1040,34,'{GRAF}',{{align:'center',cps:40}})}});
BB.dimension(ctx,t,1.9,260,560,840,560,'−75% de esforço','{MED}',{{size:38}});
BB.projection(ctx,t,2.3,840,140,840,1180,'{GRAF}');
BB.letter(ctx,t,2.5,'começa hoje',560,1300,88,'{GRAF}',{{align:'center',cps:30,seed:2}});
BB.magnet(ctx,t,2.75,330,1290,'{DEC}'); BB.magnet(ctx,t,2.85,800,1290,'{DEC}');
BB.stamp(ctx,t,3.1,'APROVADO',540,1480,'{DEC}',{{size:70,rot:-6}});
"""
scene(1, 0.0, 3.4, 'cream', None, back=lambda p, d: canvas(p, S1, d, engine='briefing'), world=dict(scale=1.06, x=-20), signature=True)
scene(2, 3.4, 7.0, 'cream', None, back=lambda p, d: canvas(p, S2, d, engine='briefing'), world=dict(scale=1.0, x=30, ry=-3), tr='cut')
scene(3, 7.0, DUR, 'cream', None, back=lambda p, d: (giant(p, ['FIM'], 24, 14, BLK), g_in(p, 1)), world=dict(x=0, ry=0, scale=1), tr='wipe')
render()
