from kit import *
import os
# Demo do motor launch (LA): página clara com névoa e print do site em moldura, pílulas de checklist, cursor; página escura com manchete
# de acento, vidro, leque de fotos, calendário, carimbo; cartão final com a marca brilhando.
IMGS = [f for f in sorted(os.listdir('assets/img')) if f.lower().endswith(('.webp', '.png', '.jpg', '.jpeg'))]
IMG0 = IMGS[0] if IMGS else ''
FAN = ', '.join(f"LA.image('assets/img/{f}')" for f in IMGS[1:4]) or f"LA.image('assets/img/{IMG0}')"
S1 = f"""
LA.haze(ctx,w,h,{{page:'#FDFDFB',fog:'#B7CFEB',floor:'#DBEEFD'}});
LA.chapter(ctx,t,0.0,1,'Uma ideia.',90,330,{{accent:'{RED}'}});
LA.headline(ctx,t,0.2,[['Pare','de',['adiar.',{{accent:true}}]],['Comece',['hoje.',{{light:true}}]]],90,560,'700 96px Aspekta',{{accent:'{RED}',lineH:106}});
LA.browser(ctx,t,0.8,LA.image('assets/img/{IMG0}'),90,760,900,620,{{url:'reservatoriodedopamina.com.br'}});
const cu=seg(t,1.4,2.0),cl=seg(t,2.0,2.15);LA.cursor(ctx,lerp(880,640,eo(cu)),lerp(1500,1120,eo(cu)),{{click:cl<1?Math.sin(cl*Math.PI):0}});
LA.pill(ctx,t,2.2,'Plano de 10 anos',90,1460,{{accent:'{RED}'}});
LA.pill(ctx,t,2.45,'Até 60% OFF',90,1560,{{accent:'{RED}'}});
"""
S2 = f"""
LA.dark(ctx,w,h,{{c0:'#2A1A08',c1:'#0A0705'}});
LA.headline(ctx,t,0.0,[['Pare','de',['esperar',{{strike:true}}]],['a',['motivação.',{{accent:true}}]]],90,420,'700 88px Aspekta',{{color:'#FFF8EA',accent:'{AMB}',lineH:100}});
LA.glass(ctx,90,640,900,150,{{tint:'rgba(255,255,255,.08)',rim:'rgba(255,255,255,.25)'}});
ctx.font='500 34px Aspekta';ctx.fillStyle='#FFF8EA';ctx.textBaseline='middle';ctx.fillText('6 respostas. Cada uma diz o que fazer.',130,715);
LA.fan(ctx,t,0.6,[{FAN}],540,1080,300,390,{{spread:200,tilt:8}});
LA.calendar(ctx,t,1.6,90,1340,900,300,{{pins:[[0,0,'{AMB}'],[2,1,'{RED}'],[4,0,'{AMB}'],[5,2,'{RED}']],color:'#FFF8EA',line:'rgba(255,255,255,.12)'}});
LA.stamp(ctx,t,2.6,'RESERVADO',760,1240,'{AMB}',{{rot:-10}});
"""
S3 = f"""
LA.wordmark(ctx,t,0.0,'Reservatório',540,960,w,h,{{font:'600 112px Aspekta'}});
"""
scene(1, 0.0, 3.2, 'cream', None, back=lambda p, d: canvas(p, S1, d, engine='launch'), world=dict(scale=1.05), signature=True)
scene(2, 3.2, 6.6, 'black', None, back=lambda p, d: canvas(p, S2, d, engine='launch'), world=dict(scale=1.0, x=-30, ry=2), tr='cut')
scene(3, 6.6, 8.2, 'black', None, back=lambda p, d: canvas(p, S3, d, engine='launch'), world=dict(x=0, ry=0, scale=1.08), tr='cut')
scene(4, 8.2, DUR, 'cream', None, back=lambda p, d: (giant(p, ['FIM'], 24, 14, BLK), g_in(p, 1)), world=dict(scale=1), tr='wipe')
render()
