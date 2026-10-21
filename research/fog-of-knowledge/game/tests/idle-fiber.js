import * as GFX from '../gfx.js?v=3.14.0';
import * as T from '../vendor/three.module.min.js';
export async function runIdleFiberTests(W){
 await GFX.loadHuman();await Promise.resolve();
 const results=[],test=(name,fn)=>{try{const v=fn();results.push({name,pass:v===true,detail:v===true?'':v})}catch(e){results.push({name,pass:false,detail:e.stack})}};
 const h=W.player.model,u=h.userData;
 const step=(speed,n=60)=>{for(let i=0;i<n;i++)GFX.animateHuman(h,speed,1/60,false,false,false)};
 const idle=()=>u.cur==='Idle_Loop'&&['Walk_Loop','Jog_Fwd_Loop','Sprint_Loop'].every(k=>!u.actions[k].isRunning()||u.actions[k].getEffectiveWeight()<.001);
 test('pickup while walking fades walk out completely',()=>{step(2.2);GFX.playOnce(h,'PickUp_Table',.6);step(0,120);return idle()});
 test('repeated tool interactions leave no ghost locomotion',()=>{for(let i=0;i<8;i++){step(5.2,12);GFX.playOnce(h,'Punch_Cross',.4);step(0,4);GFX.playOnce(h,'Punch_Cross',.4);step(0,90)}return idle()});
 test('idle stays idle long after pickup',()=>{step(2.2);GFX.playOnce(h,'PickUp_Table',.6);step(0,600);return idle()});
 test('walking resumes normally then settles',()=>{step(2.2);const walking=u.cur==='Walk_Loop';step(0);return walking&&idle()});
 test('no input means idle even with residual velocity',()=>{W.keysClear();W.keyEvent('Escape');W.player.vel.x=.25;W.sim(1);return W.player.moveSpeed===0&&idle()});
 test('fiber is common across distant vegetated land on low quality',()=>{let checked=0,missing=[];const base=W.player.pos.clone();for(let x=-320;x<=320;x+=80)for(let z=-320;z<=320;z+=80){const xx=base.x+x,zz=base.z+z,y=W.height(xx,zz),b=W.biome(xx,zz,y);if(y<1||!['grass','forest'].includes(b)||W.slope(xx,zz)>.4)continue;W.teleport(xx,zz);const f=W.scan('res','fiber',15);checked++;if(!f)missing.push([xx,zz]);}W.teleport(base.x,base.z);return checked>=8&&!missing.length||{checked,missing}});
 test('visible stem hover and E yields fiber; cannot gather twice',()=>{W.keysClear();W.stow(true);const f=W.scan('res','fiber',120);if(!f?.flower)return {error:'Expected wildflower',f};W.teleport(f.x+1.2,f.z);W.look(Math.PI/2,.7,4);W.sim(.5);const pt=new T.Vector3(f.x,W.height(f.x,f.z)+.4,f.z).project(GFX.camera),c=GFX.renderer.domElement,r=c.getBoundingClientRect();c.dispatchEvent(new PointerEvent('pointermove',{clientX:r.left+(pt.x+1)*r.width/2,clientY:r.top+(1-pt.y)*r.height/2}));const t=W.hover();if(!t?.obj?.r?.flower)return {error:'Flower hover failed',kind:t?.kind};const n=W.state.inv.fiber||0;W.keyEvent('KeyE');W.keyUp('KeyE');const gained=(W.state.inv.fiber||0)===n+1,removed=W.state.removed.has(t.obj.ch.key+'|r'+t.obj.r.i);W.interact(t);return gained&&removed&&(W.state.inv.fiber||0)===n+1});
 return results;
}
