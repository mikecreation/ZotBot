// offline grip solver (viewer only): returns grip angles that wrap a handle of radius r
window.solveGrip=(r=.017,s=.012,acs={f_index:.006,f_middle:0,f_ring:-.004,f_pinky:-.01},half=.009)=>{
 const h=u.handRig.R,T=THREE,out={},centres={};
 for(const k in h.bones)h.bones[k].quaternion.copy(h.rest[k]);h.hand.updateWorldMatrix(true,true);
 const inv=h.hand.matrixWorld.clone().invert(),P=b=>b.getWorldPosition(new T.Vector3()).applyMatrix4(inv);
 const palm=new T.Vector3(-1,0,0);
 for(const f of ["f_index","f_middle","f_ring","f_pinky"]){
  const M=P(h.bones[f+"0"]),A=P(h.bones[f+"1"]).sub(M),L1=A.length(),L2=h.bones[f+"2"].position.length(),L3=L2*.78;
  const a=A.clone().normalize(),b=palm.clone().projectOnPlane(a).normalize();
  const ac=acs[f],C=[ac,s+r],R=r+half;
  const pts=[[0,0]];let ok=true;
  for(const L of [L1,L2,L3]){const p=pts[pts.length-1];
   // circle(p,L) ∩ circle(C,R): pick the one with larger angle around C (continuing the wrap)
   const dx=C[0]-p[0],dy=C[1]-p[1],d=Math.hypot(dx,dy);if(d>L+R||d<Math.abs(L-R)){ok=false;break}
   const x=(L*L-R*R+d*d)/(2*d),y=Math.sqrt(Math.max(0,L*L-x*x)),ex=dx/d,ey=dy/d;
   const c1=[p[0]+ex*x-ey*y,p[1]+ey*x+ex*y],c2=[p[0]+ex*x+ey*y,p[1]+ey*x-ex*y];
   const ang=q=>Math.atan2(q[1]-C[1],q[0]-C[0]);const base=ang(p);
   const adv=q=>{let t=ang(q)-base;while(t<=0)t+=2*Math.PI;return t}; // wrap direction: from +a toward +b means angle increasing? choose the smaller positive advance
   pts.push(adv(c1)<adv(c2)?c1:c2)}
  if(!ok){out[f]=null;continue}
  const dirs=pts.slice(1).map((q,i)=>Math.atan2(q[1]-pts[i][1],q[0]-pts[i][0]));
  const nz=t=>{while(t>Math.PI)t-=2*Math.PI;while(t<=-Math.PI)t+=2*Math.PI;return t};out[f]=[dirs[0],dirs[1]-dirs[0],dirs[2]-dirs[1]].map(t=>+(nz(t)*180/Math.PI).toFixed(1));out[f+'_pts']=pts.map(q=>M.clone().addScaledVector(a,q[0]).addScaledVector(b,q[1]).toArray().map(v=>+v.toFixed(4)));
  centres[f]=M.clone().addScaledVector(a,C[0]).addScaledVector(b,C[1]).toArray().map(v=>+v.toFixed(4));
 }
 return {angles:out,centres}};
window.solveThumb=(target,handle)=>{ // target/handle in R-hand local; handle={c,axis,r}
 const h=u.handRig.R,T=THREE,b=[0,1,2].map(i=>h.bones["thumb"+i]),q=new T.Quaternion(),e=new T.Euler();
 h.hand.updateWorldMatrix(true,true);const inv=h.hand.matrixWorld.clone().invert(),tg=new T.Vector3(...target),C=new T.Vector3(...handle.c),ax=new T.Vector3(...handle.axis).normalize();
 const dAxis=p=>{const v=p.clone().sub(C);return v.sub(ax.clone().multiplyScalar(v.dot(ax))).length()};
 let best=null;const D=Math.PI/180;
 for(let x1=-20;x1<=60;x1+=5)for(let z1=-70;z1<=30;z1+=5)for(let x2=0;x2<=60;x2+=6)for(let x3=0;x3<=70;x3+=7){
  b[0].quaternion.copy(h.rest.thumb0).multiply(q.setFromEuler(e.set(x1*D,0,z1*D)));
  b[1].quaternion.copy(h.rest.thumb1).multiply(q.setFromEuler(e.set(x2*D,0,0)));
  b[2].quaternion.copy(h.rest.thumb2).multiply(q.setFromEuler(e.set(x3*D,0,0)));
  b[0].updateWorldMatrix(false,true);
  const p1=b[1].getWorldPosition(new T.Vector3()).applyMatrix4(inv),p2=b[2].getWorldPosition(new T.Vector3()).applyMatrix4(inv),tip=b[2].localToWorld(new T.Vector3(0,.024,0)).applyMatrix4(inv);
  let cost=tip.distanceTo(tg);const lim=handle.r+.008;
  for(const p of [p1,p2,tip,p1.clone().lerp(p2,.5),p2.clone().lerp(tip,.5)]){const d=dAxis(p);if(d<lim)cost+=(lim-d)*4}
  cost+=(Math.abs(x1)+Math.abs(z1)+x2+x3)*D*.0006;
  if(!best||cost<best.cost)best={cost,ang:[[x1,z1],[x2,0],[x3,0]],tip:tip.toArray()}}
 for(const k in h.bones)h.bones[k].quaternion.copy(h.rest[k]);return best};
