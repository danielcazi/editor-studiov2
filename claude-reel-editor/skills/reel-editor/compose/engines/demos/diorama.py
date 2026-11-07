from kit import *
# Demo do motor diorama (DI): mercado e posto num pedestal isométrico, placas flutuantes, entrada em mola e explosão na saída.
LAV, LAV2, ACC = '#DCD5F6', '#ECE8FA', '#6D5BFF'
B1 = f"""
DI.soft(T,sc,{{ambient:1.2}});
DI.pedestal(T,sc,{{r:5.2,a:'#F6F1E8',b:'{LAV}',rim:'#CBC2EE',wall:'{LAV2}'}});
const g=new T.Group();sc.add(g);
DI.shelf(T,g,-2.3,-1.3,{{ry:.25,y:.5}});DI.shelf(T,g,1.9,-2.3,{{ry:-.55,y:.5}});
DI.crate(T,g,-3.3,1.6,{{y:.5}});DI.counter(T,g,1.5,1.3,{{ry:-.3,y:.5}});DI.plant(T,g,3.5,2.6,{{y:.5}});
const price=DI.sign(T,g,'R$ 486,30',1.5,3.2,1.3,{{w:2.6,h:.7,bg:'{ACC}'}});
DI.sign(T,sc,'MERCADO',0,6.2,0,{{w:3.2,h:.8,bg:'{ACC}'}});
DI.isoCam(cam,{{dist:22,yaw:.78,pitch:.6,target:[0,1.6,0]}});
return t=>{{ if(t<2.7){{DI.rise(g,t,.1,{{stagger:.07}});DI.bob(price,t,.1,2);}} else DI.explode(g,t,2.7,{{dur:.6}}); }};
"""
B2 = f"""
DI.soft(T,sc,{{ambient:1.2}});
DI.pedestal(T,sc,{{r:5.2,a:'#F6F1E8',b:'#F4E3B8',rim:'#E4D7B0',wall:'{LAV2}'}});
const g=new T.Group();sc.add(g);
DI.pump(T,g,0,-1.2,{{y:.5,accent:'{ACC}'}});DI.car(T,g,.4,1.6,{{ry:.35,y:.5,color:'{AMB}'}});
[[-3.4,1.2],[-3.0,1.9]].forEach(([x,z])=>{{const w=DI.cyl(T,g,x,.5,z,.42,.3,'#2B2B33');w.rotation.z=Math.PI/2;w.position.y=.92;}});
DI.plant(T,g,3.2,-2.4,{{y:.5}});
const price=DI.sign(T,g,'R$ 187,42',.4,3.4,1.6,{{w:2.6,h:.7,bg:'{ACC}'}});
DI.sign(T,sc,'POSTO',0,6.2,0,{{w:2.6,h:.8,bg:'{ACC}'}});
DI.isoCam(cam,{{dist:22,yaw:-.7,pitch:.6,target:[0,1.6,0]}});
return t=>{{ if(t<3.0){{DI.rise(g,t,.1,{{stagger:.09}});DI.bob(price,t,.1,2);}} else DI.explode(g,t,3.0,{{dur:.6}}); }};
"""
scene(1, 0.0, 3.4, 'cream', None, back=lambda p, d: scene3d(p, B1, d, ortho=11, engine='diorama'), world=dict(scale=1.04), signature=True)
scene(2, 3.4, 7.0, 'cream', None, back=lambda p, d: scene3d(p, B2, d, ortho=11, engine='diorama'), world=dict(scale=1.0, ry=3), tr='cut')
scene(3, 7.0, DUR, 'cream', None, back=lambda p, d: (giant(p, ['FIM'], 24, 14, BLK), g_in(p, 1)), world=dict(ry=0, scale=1), tr='wipe')
render()
