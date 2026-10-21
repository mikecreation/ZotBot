import * as T from './vendor/three.module.min.js';
import * as GFX from './gfx.js?v=3.25.0';
import {primitiveItem} from './primitive-models.js?v=3.25.0';
if(!new URLSearchParams(location.search).has('sandbox'))throw Error('Showcase requires a sandbox save');
while(!window.__fogWorld)await new Promise(r=>setTimeout(r,100));
const W=window.__fogWorld,exhibits=[];let finishTimer=null;
W.start();W.help.close();W.closePopup();
const report=(scene,text)=>parent.postMessage({type:'crafting-showcase-status',scene,text},location.origin);
function reset(){
 clearInterval(finishTimer);for(const m of exhibits)GFX.disposeGroup(m);exhibits.length=0;W.keysClear();W.obs.close();W.help.close();W.closePopup();W.reseed(20261019);W.help.close();W.clearStructs();W.clearAnimals();W.clearDrops();W.state.inv={};W.state.order=[];W.state.held=W.state.left=null;W.state.st.stamina=100;W.setHour(10);W.setWeather('clear',0);
 for(const id of ['wInv','wJournal','wCtx','wChest'])document.getElementById(id).hidden=true;
 const home=W.state.camp;for(let i=1;i<60;i++){const a=i*2.4,x=home[0]+Math.cos(a)*(10+i*2),z=home[1]+Math.sin(a)*(10+i*2);if(W.height(x,z)<2||W.slope(x,z)>.18)continue;W.teleport(x,z);const b=W.scan('boulder'),t=W.scan('tree');if((!b||b.d>5)&&(!t||t.d>5))break}W.look(0,.35,6);W.player.actCd=0;
}
function plaque(text,x,y,z){const c=document.createElement('canvas');c.width=512;c.height=80;const ctx=c.getContext('2d');ctx.fillStyle='#07131de8';ctx.fillRect(0,0,512,80);ctx.fillStyle='#ffe3a0';ctx.font='600 28px system-ui';ctx.textAlign='center';ctx.fillText(text,256,49);const tex=new T.CanvasTexture(c),s=new T.Sprite(new T.SpriteMaterial({map:tex,depthTest:true}));s.scale.set(1.75,.28,1);s.position.set(x,y,z);GFX.scene.add(s);exhibits.push(s)}
function benches(){reset();const x=W.player.pos.x,z=W.player.pos.z;
 W.give('workbench');W.hold('workbench');W.useHeld();W.teleport(x+2.8,z);W.player.actCd=0;W.give('workbench_bundle');W.hold('workbench_bundle');W.useHeld();
 plaque('4 single legs',x,W.height(x,z-1.8)+1.45,z-1.8);plaque('4 bundled supports',x+2.8,W.height(x+2.8,z-1.8)+1.45,z-1.8);
 const kinds=['knife_stone','axe_stone','pickaxe_stone','hand_drill','bench_joint'];
 for(let i=0;i<kinds.length;i++){const k=kinds[i],xx=x-1.5+i*1.4,zz=z-4.5,m=primitiveItem(k);m.position.set(xx,W.height(xx,zz)+.8,zz);m.scale.setScalar(1.4);GFX.scene.add(m);exhibits.push(m);plaque(W.items[k].name,xx,W.height(xx,zz)+1.6,zz)}
 W.teleport(x+1.4,z+1.7);W.stow(true);W.give('knife_stone');W.give('pickaxe_stone');W.inventory.setHand('R','knife_stone');W.inventory.setHand('L','pickaxe_stone');W.player.firstPersonView=true;W.look(0,.15,4.5);W.hud();document.querySelector('#wToast').textContent='';report('benches','Two completed benches in the world, plus all five detailed tools/joints. Drag to look around. Select a tool above for an inspectable close-up.');
}
function pile(){reset();W.give('campfire');W.hold('campfire');W.useHeld();W.sim(.4);const f=W.state.structures.find(s=>s.type==='fire');W.give('fiber',3);W.give('hand_drill');W.inventory.setHand('R','hand_drill');W.inventory.setHand('L',null);W.inventory.selectHand('R');return f}
function show(scene){try{
 if(scene==='benches')return benches();
 if(['knife_stone','axe_stone','pickaxe_stone','bench_joint'].includes(scene)){reset();W.give(scene);W.hold(scene);W.observeHeld(scene);report(scene,'Live 3D close-up: drag to rotate, scroll to zoom. F closes inspection. The notch and matching tongue are separate pieces.');return}
 if(scene==='pickup'){reset();W.stow(true);const p=W.player.pos;for(const [k,dx] of [['flake',-2],['pyrite',0],['stick',2]])W.drop(k,p.x+dx,p.z-10);W.give('pickaxe_stone');W.stow(true);W.look(0,.55,7);report(scene,'Hover the actual cursor over a distant item. Its name and action appear. Press E to walk over and collect it; WASD cancels the walk.');return}
 const f=pile();if(!f)throw Error('No dry site for the pile');
 if(scene==='drill'){W.keyDown('KeyQ');W.sim(5);W.closePopup();W.look(.45,.4,4);report(scene,'Live friction fire: the character rotates a wooden spindle on a hearth. Watch the progress, smoke, ember and ignition. The reusable kit stays in hand.');finishTimer=setInterval(()=>{if(f.lit){clearInterval(finishTimer);W.keysClear();W.closePopup();report('drill','The friction ember lit the tinder and wood. The kit was kept; the fire is now burning.')}else{W.keyDown('KeyQ');W.sim(.4);W.closePopup()}},400);return}
 for(let i=0;i<8;i++)W.addFireFuel(f,5,'log');f.lit=true;f.heat=1;W.stow(true);W.sim(5);W.closePopup();W.setHour(21);W.look(.2,.32,6);
 if(scene==='rain'){W.setWeather('rain',.8);report(scene,'Rain wets and cools the actual burning fuel gradually. Unburned logs remain; charcoal and ash are collectible after cooling.')}else report(scene,'Eight added logs join the burning pile. Watch the wood, glowing cracks, flames and coals. Switch to Rain & fire to see gradual wetting.');
 }catch(e){report(scene,'Could not prepare this scene: '+e.message);console.error(e)}}
window.addEventListener('message',e=>{if(e.origin===location.origin&&e.source===parent&&e.data?.type==='crafting-showcase')show(e.data.scene)});
show('benches');
