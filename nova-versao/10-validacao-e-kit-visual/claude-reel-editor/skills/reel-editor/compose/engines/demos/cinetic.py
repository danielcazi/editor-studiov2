from kit import *
# Demo do motor cinetic (CN): digitação em caixa de tempo, palavras do desfoque, contagem que desacelera, gráfico com cabeça;
# rolo de palavras, odômetro, revelação por subtração, casca → conteúdo → ação.
INK, PAGE, SIG = BLK, CRM, RED
S1 = f"""
ctx.fillStyle='{PAGE}';ctx.fillRect(0,0,w,h);
CN.typeOn(ctx,t,0.0,'Seu cérebro adia o que dói.',90,440,'700 68px Aspekta','{INK}',{{box:1.1}});
CN.blurRise(ctx,t,1.0,'A dopamina decide por você.',90,560,'500 52px Aspekta',{{color:'{INK}',stagger:.3,dur:.8}});
CN.countUp(ctx,t,1.9,240000,90,860,'800 150px Aspekta',{{color:'{SIG}',suffix:'',dur:.95}});
ctx.font='500 34px Aspekta';ctx.fillStyle='{INK}';ctx.textBaseline='alphabetic';if(t>2.0)ctx.fillText('pessoas já passaram pelo RD',90,920);
CN.lineChart(ctx,t,2.1,[[0,.1],[.15,.22],[.3,.18],[.45,.4],[.6,.38],[.75,.7],[.9,.66],[1,.95]],90,1020,900,420,'{SIG}',{{dur:1.2,bg:'{PAGE}'}});
"""
S2 = f"""
ctx.fillStyle='{PAGE}';ctx.fillRect(0,0,w,h);
CN.wordRoll(ctx,t,0.2,'Você não é preguiçoso.','Você está sem dopamina.',90,460,'700 60px Aspekta','{INK}',{{stagger:.22}});
CN.digitReel(ctx,t,0.4,2027,90,760,'800 170px Aspekta',{{color:'{INK}',dur:1.6}});
const hero=c=>{{c.font='800 220px Aspekta';c.fillStyle='{SIG}';c.textAlign='center';c.textBaseline='middle';c.fillText('60%',540,1160);}};
const items=[[260,1020],[820,1040],[300,1320],[800,1300],[540,980],[560,1330]].map(([x,y],i)=>({{x,y,draw:c=>{{c.fillStyle='#fff';c.strokeStyle='rgba(0,0,0,.15)';c.lineWidth=1;c.beginPath();c.roundRect(x-130,y-50,260,100,18);c.fill();c.stroke();c.font='500 26px Aspekta';c.fillStyle='{INK}';c.textAlign='left';c.textBaseline='middle';c.fillText(['notificação','boleto','reunião','tarefa','e-mail','prazo'][i],x-100,y);}}}}));
CN.subtract(ctx,t,1.5,hero,items,{{cx:540,cy:1160,dur:.9}});
CN.shell(ctx,t,2.5,[{{draw:c=>{{c.fillStyle='#fff';c.beginPath();c.roundRect(90,1480,900,300,28);c.fill();}}}},{{draw:c=>{{c.font='700 40px Aspekta';c.fillStyle='{INK}';c.textAlign='left';c.textBaseline='alphabetic';c.fillText('Plano de 10 anos',130,1550);}}}},{{draw:c=>{{c.font='400 30px Aspekta';c.fillStyle='#666';c.textAlign='left';c.fillText('200+ aulas · planner 2027 · 50 livros',130,1600);}}}},{{draw:(c,u)=>{{c.fillStyle=`rgba(232,0,45,${{u.toFixed(2)}})`;c.beginPath();c.roundRect(130,1650,300,80,40);c.fill();c.font='700 30px Aspekta';c.fillStyle=u>.9?'#fff':'{SIG}';c.textAlign='left';c.textBaseline='middle';c.fillText('Garantir 60% OFF',160,1690);}}}}],{{stagger:.2}});
"""
scene(1, 0.0, 3.6, 'cream', None, back=lambda p, d: canvas(p, S1, d, engine='cinetic'), world=dict(scale=1.03), signature=True)
scene(2, 3.6, 7.2, 'cream', None, back=lambda p, d: canvas(p, S2, d, engine='cinetic'), world=dict(scale=1.0, y=-30), tr='cut')
scene(3, 7.2, DUR, 'cream', None, back=lambda p, d: (giant(p, ['FIM'], 24, 14, BLK), g_in(p, 1)), world=dict(y=0, scale=1), tr='wipe')
render()
