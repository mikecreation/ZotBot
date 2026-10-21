import * as T from '../vendor/three.module.min.js';
import * as GFX from '../gfx.js?v=3.12.2';
import {showScene} from './upgrades.js?v=3.12.2';
export function runMovementSafetyTests(W){
  const results=[],test=(name,fn)=>{try{const ok=fn();results.push({group:'Movement safety',name,pass:ok===true,detail:ok===true?'':String(ok)})}catch(e){results.push({group:'Movement safety',name,pass:false,detail:e.stack})}};
  function queued(){
    showScene(W);W.clearStructs();W.clearDrops();W.clearAnimals();W.keysClear();W.stow(true);
    for(const id of ['wInv','wJournal','wChest','wCtx','wSettings'])document.getElementById(id).hidden=true;
    const p=W.player.pos;let x=p.x+9,z=p.z;
    for(let i=0;i<12;i++){const a=i*Math.PI/6,xx=p.x+Math.cos(a)*9,zz=p.z+Math.sin(a)*9;if(W.height(xx,zz)>.2&&W.slope(xx,zz)<.4){x=xx;z=zz;break}}
    W.drop('flake',x,z);W.look(Math.atan2(p.x-x,p.z-z),.55,6);W.sim(.7);W.keysClear();
    const d=W.state.drops.find(d=>d.item==='flake');d.mesh.updateMatrixWorld(true);const q=d.mesh.getWorldPosition(new T.Vector3()).project(GFX.camera),c=GFX.renderer.domElement,r=c.getBoundingClientRect();
    c.dispatchEvent(new PointerEvent('pointermove',{clientX:r.left+(q.x+1)*r.width/2,clientY:r.top+(1-q.y)*r.height/2}));W.keyEvent('KeyE');W.keyUp('KeyE');
    if(!W.autoPickup())throw Error('Pickup route was not queued');
  }
  function stopped(){W.keysClear();const x=W.player.pos.x,z=W.player.pos.z;W.sim(.4);return !W.autoPickup()&&Math.hypot(W.player.vel.x,W.player.vel.z)<.01&&Math.hypot(W.player.pos.x-x,W.player.pos.z-z)<.02}
  for(const [name,act] of [
    ['second E cancels rather than restarting the route',()=>W.keyEvent('KeyE')],
    ['Escape cancels before a discovery popup handles the key',()=>{document.querySelector('#wPopup').hidden=false;W.keyEvent('Escape')}],
    ['STOP button cancels',()=>document.querySelector('#wStopWalk').click()],
    ['window blur cancels route and inertia',()=>window.dispatchEvent(new Event('blur'))],
    ['tab visibility change cancels',()=>document.dispatchEvent(new Event('visibilitychange'))],
    ['unlocking the pointer cancels',()=>document.dispatchEvent(new Event('pointerlockchange'))],
    ['backpack opening cancels',()=>W.keyEvent('KeyI')],
    ['help opening cancels',()=>{W.help.open();W.help.close()}],
  ])test(name,()=>{queued();act();return stopped()});
  test('opposite movement keys still cancel the route',()=>{queued();W.keyDown('KeyW');W.keyDown('KeyS');W.sim(.1);return stopped()});
  test('lost manual keyup is cleared on focus loss',()=>{queued();W.keyEvent('KeyE');W.keyDown('KeyW');W.sim(.1);window.dispatchEvent(new Event('blur'));window.dispatchEvent(new Event('focus'));const x=W.player.pos.x,z=W.player.pos.z;W.sim(.5);return Math.hypot(W.player.pos.x-x,W.player.pos.z-z)<.02});
  W.keysClear();return results;
}
