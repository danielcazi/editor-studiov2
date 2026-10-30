from kit import *
# Demo do motor sketchnote (SB): parágrafo com marca-texto, ícones de linha que se desenham dentro de um player, lápis de cor, legenda.
INK, BLUE, GREEN, PINK = BLK, '#2B6CB0', '#B9F0A8', '#F7B9D9'
S1 = f"""
SB.paper(ctx,w,h,'#FFFFFF',2);
SB.para(ctx,t,0.1,['Todo dia a dopamina sobe','quando você adia a tarefa','chata, e cai quando a','tarefa volta. O cérebro','só quer o alívio agora.'],90,520,{{font:'400 58px Aspekta',lineH:84,cps:46,marks:{{dopamina:'{GREEN}',adia:'{PINK}',alívio:'#BFD8FF',agora:'#BFD8FF'}}}});
SB.circle(ctx,t,2.3,760,702,120,'{RED}',{{width:5,wobble:2}});
SB.arrow(ctx,t,2.7,[[640,1000],[560,1180],[400,1300]],'{INK}',{{width:5}});
SB.caption(ctx,t,2.9,'alívio agora, conta depois',540,1420,{{font:'700 54px Aspekta',mark:{{word:'conta',color:'{PINK}'}}}});
"""
S2 = f"""
SB.paper(ctx,w,h,'#FFFFFF',2);
SB.player(ctx,70,420,940,1000,{{progress:seg(t,0,3.4),accent:'{BLUE}'}});
SB.sun(ctx,t,0.1,300,620,58,'{INK}',{{width:4}});
SB.cloud(ctx,t,0.7,760,600,250,'{INK}',{{width:4}});
SB.waves(ctx,t,1.1,160,1160,760,'{BLUE}',{{width:4,rows:3}});
SB.drop(ctx,t,1.6,540,900,44,'{BLUE}',{{width:4}});
const dp=new Path2D();dp.moveTo(540,830);dp.arc(540,900,40,-Math.PI/2+.6,Math.PI*1.5-.6);dp.closePath();SB.fill(ctx,t,1.9,dp,'{BLUE}',{{spacing:7,alpha:.5}});
SB.arrow(ctx,t,2.1,[[330,700],[420,860],[520,1120]],'{INK}',{{width:4}});
SB.arrow(ctx,t,2.4,[[740,1120],[760,900],[740,720]],'{INK}',{{width:4}});
SB.caption(ctx,t,2.8,'o sal fica no mar',540,1340,{{font:'700 50px Aspekta',mark:{{word:'sal',color:'{GREEN}'}}}});
"""
scene(1, 0.0, 3.4, 'cream', None, back=lambda p, d: canvas(p, S1, d, engine='sketch'), world=dict(scale=1.04), signature=True)
scene(2, 3.4, 7.0, 'cream', None, back=lambda p, d: canvas(p, S2, d, engine='sketch'), world=dict(scale=1.0, x=-20), tr='cut')
scene(3, 7.0, DUR, 'cream', None, back=lambda p, d: (giant(p, ['FIM'], 24, 14, BLK), g_in(p, 1)), world=dict(x=0, scale=1), tr='wipe')
render()
