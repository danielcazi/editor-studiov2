from kit import *
# Demo do motor silkscreen (SK): copie para uma pasta compose/ com assets e rode `python3 -B silkscreen.py`; snapshots em 1.2, 2.6, 4.4, 5.6 s.
S1 = f"""
SK.paper(ctx,w,h,'{CRM}',3);
SK.bands(ctx,t,0.0,[[-40,620,'{AMB}'],[620,900,'{RED2}'],[900,1180,'{AMB}']],{{seed:2}});
const far=SK.ridge([[160,980],[380,760],[600,1000],[820,720],[1000,940]],1400), near=SK.ridge([[120,1300],[360,1120],[620,1320],[880,1180]],1560);
SK.pull(ctx,t,.5,far,'{RED}',{{dx:-2,dy:2,seed:3}}); SK.pull(ctx,t,.75,near,'{RED2}',{{dx:3,dy:-1,seed:4}});
const trees=SK.P(p=>{{[[150,1420,170],[260,1460,120],[930,1400,190],[820,1440,130]].forEach(([x,y,hh])=>p.addPath(SK.pine(x,y,hh)))}});
SK.pull(ctx,t,1.0,trees,'{BLK}',{{dx:1,dy:1,seed:5}});
SK.pull(ctx,t,1.25,SK.rect(-40,1540,w+80,420),'{BLK}',{{dx:1,dy:-2,seed:6,dir:'y'}});
const sun=SK.P(p=>{{p.arc(760,560,120,0,7);p.arc(760,560,80,0,7)}}); SK.pull(ctx,t,1.55,sun,'{CRM}',{{rule:'evenodd',ghost:false,seed:7,dur:.2,blade:false}});
SK.pull(ctx,t,1.65,SK.circle(760,560,80),'{AMB}',{{ghost:false,seed:8,dur:.2,blade:false}});
SK.infoBand(ctx,t,1.7,['BLACK FRIDAY',['ATÉ 60% OFF','{AMB}'],'PLANO DE 10 ANOS'],{{y:1640,lineH:84,color:'{CRM}'}});
SK.pinholes(ctx,w,h,'{CRM}',11,60,1540); grain(ctx,w,h,3000,.05,5);
"""
# re-tinta: a mesma geometria em outra paleta (dia → noite), e as camadas soltas encaixando no registro
S2 = f"""
const geo=(c,sky,bandc,farc,nearc,ink)=>{{SK.paper(c,w,h,'{CRM}',3);
 const k=SK.loose(t,1.9,.45);
 c.save();c.translate(0,0);SK.pull(c,9,0,SK.rect(-40,-40,w+80,1200),sky,{{sheen:false,blade:false}});c.restore();
 c.save();c.translate(-18*k,0);SK.pull(c,9,0,SK.ridge([[160,980],[380,760],[600,1000],[820,720],[1000,940]],1400),farc,{{dx:-2,dy:2,sheen:false,blade:false}});c.restore();
 c.save();c.translate(26*k,8*k);SK.pull(c,9,0,SK.ridge([[120,1300],[360,1120],[620,1320],[880,1180]],1560),nearc,{{dx:3,dy:-1,sheen:false,blade:false}});c.restore();
 c.save();c.translate(0,-14*k);SK.pull(c,9,0,SK.rect(-40,1540,w+80,420),ink,{{sheen:false,blade:false}});c.restore();}};
SK.reink(ctx,t,.8,c=>geo(c,'{AMB}','{RED2}','{RED}','{RED2}','{BLK}'),c=>geo(c,'{RED2}','{BLK}','{BLK}','{RED}','{BLK}'),{{color:'{BLK}'}});
SK.infoBand(ctx,t,2.4,[['1 ANO · 35% OFF','{CRM}'],['2 ANOS · 50% OFF','{CRM}'],['10 ANOS · 60% OFF','{AMB}']],{{y:1640,lineH:84}});
SK.pinholes(ctx,w,h,'{CRM}',12,60,1540); grain(ctx,w,h,3000,.05,5);
"""
scene(1, 0.0, 3.0, 'black', None, back=lambda p, d: canvas(p, S1, d, engine='silkscreen'), world=dict(scale=1.04), signature=True)
scene(2, 3.0, 6.0, 'cream', None, back=lambda p, d: canvas(p, S2, d, engine='silkscreen', over=80, bg=CRM), world=dict(x=-20, ry=2, scale=1.0), tr='cut')
scene(3, 6.0, DUR, 'cream', None, back=lambda p, d: (giant(p, ['FIM'], 24, 14, BLK), g_in(p, 1)), world=dict(x=0, ry=0, scale=1), tr='wipe')
render()
