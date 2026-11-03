from kit import *
# Demo do motor swiss (SW): grade de 6 colunas, numeral gigante em degraus, texto que sobe por clip, barras, filete, playhead, corte de faca.
PAGE, INK, SIG = CRM, BLK, RED
S1 = f"""
const g=SW.grid(); SW.page(ctx,w,h,'{PAGE}');
ctx.save();ctx.globalAlpha=1-seg(t,1.6,2.2);SW.gridLines(ctx,g,h,'{INK}',.08);ctx.restore();
SW.caption(ctx,t,0.0,['BLACK FRIDAY','RESERVATÓRIO DE DOPAMINA'],g.x(0),g.row(10),{{width:g.span(3)}});
SW.rule(ctx,t,0.2,g.x(0),g.row(14),g.x(5)+g.col,g.row(14),'{INK}',{{width:2,dur:.4}});
SW.numeral(ctx,t,0.4,'60%',g.x(0),g.row(40),430,'{SIG}',{{steps:4,module:g.base*2,dur:.6}});
SW.riseText(ctx,t,1.0,'de desconto',g.x(0),g.row(46),'600 96px Aspekta','{INK}');
SW.riseText(ctx,t,1.2,'no plano de 10 anos',g.x(0),g.row(51),'500 56px Aspekta','{INK}');
SW.bar(ctx,t,1.5,g.x(0),g.row(56),g.span(4),g.base*3,'{INK}');
SW.bar(ctx,t,1.65,g.x(4),g.row(56),g.span(2),g.base*3,'{SIG}');
SW.caption(ctx,t,1.9,['01  200+ aulas','02  planner 2027','03  50 livros'],g.x(3),g.row(62),{{width:g.span(3)}});
"""
S2 = f"""
const g=SW.grid(); SW.page(ctx,w,h,'{PAGE}');
SW.riseText(ctx,t,0.0,'3 planos',g.x(0),g.row(14),'700 120px Aspekta','{INK}');
const cs=SW.cells(g.x(0),g.row(18),g.span(6),g.row(28),3,1);
[['1 ANO','35%'],['2 ANOS','50%'],['10 ANOS','60%']].forEach(([l,v],i)=>{{const [x,y,cw,ch]=cs[i];
 if(i===0&&t>=1.6)return;
 SW.wipe(ctx,t,.3+i*.2,x,y,cw,ch,c=>{{c.fillStyle=i===2?'{SIG}':'{INK}';c.fillRect(x,y,cw,ch);c.fillStyle='{PAGE}';c.font='700 72px Aspekta';c.textBaseline='alphabetic';c.fillText(v,x+20,y+ch-40);c.font='500 24px Aspekta';c.letterSpacing='0.1em';c.fillText(l,x+20,y+44)}});}});
SW.knife(ctx,t,1.6,cs[0][0],cs[0][1],cs[0][2],cs[0][3],c=>{{c.fillStyle='{INK}';c.fillRect(cs[0][0],cs[0][1],cs[0][2],cs[0][3])}},{{color:'{SIG}'}});
SW.rule(ctx,t,1.9,g.x(0),g.row(50),g.x(5)+g.col,g.row(50),'{INK}',{{width:2,dur:.3}});
SW.playhead(ctx,t,2.0,3.4,g.x(0),g.x(5)+g.col,g.row(50),'{SIG}');
const ex=SW.linear(t,2.2,3.4);ctx.fillStyle='{SIG}';ctx.beginPath();ctx.arc(lerp(g.x(0),g.x(5)+g.col,ex),g.row(58)-20*Math.sin(ex*Math.PI),18,0,7);ctx.fill();
SW.caption(ctx,t,2.3,['até 02/11','a exceção anda fora da grade'],g.x(3),g.row(60),{{width:g.span(3)}});
"""
scene(1, 0.0, 3.0, 'cream', None, back=lambda p, d: canvas(p, S1, d, engine='swiss'), world=dict(scale=1.0), signature=True)
scene(2, 3.0, 6.6, 'cream', None, back=lambda p, d: canvas(p, S2, d, engine='swiss'), world=dict(x=-40), tr='cut')
scene(3, 6.6, DUR, 'cream', None, back=lambda p, d: (giant(p, ['FIM'], 24, 14, BLK), g_in(p, 1)), world=dict(x=0, scale=1), tr='wipe')
render()
