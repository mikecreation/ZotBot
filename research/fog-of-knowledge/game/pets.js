/* Fog of Knowledge: The Game: companions.
 * Befriend animals gently (no combat): move quietly (noise falls off as −20·log₁₀ r), offer food they like,
 * be patient, then pet them. Up to 3 follow you; the rest wait at camp. Each has a small helpful perk, reacts to
 * your discoveries, sleeps by the fire and, now and then, demands attention at the worst possible moment.
 * Lightweight procedural models (a dozen meshes each, shared materials). All sounds are synthesised (audio.js). */
import * as THREE from "./vendor/three.module.min.js";
export const MAX_ACTIVE=3;
export const PET_INFO={
  cat:{name:"Miso",label:"Cat",emoji:"🐈",likes:["meat_cooked","meat_dried","meat_raw"],rate:.16,thr:16,speed:3.4,perk:"Curious cat: wanders to undiscovered experiment spots nearby and sits there, tail twitching."},
  frenchie:{name:"Biscuit",label:"French bulldog",emoji:"🐶",likes:["meat_cooked","meat_dried","grain","nuts"],rate:.2,thr:24,speed:3.6,perk:"Snorts out ores, flint and pyrite buried nearby."},
  squirrel:{name:"Hazel",label:"Red squirrel",emoji:"🐿️",likes:["seeds","grain","nuts","berry_dark"],rate:.07,thr:12,speed:4,perk:"Brings you seeds and hazelnuts now and then."},
  crow:{name:"Corvus",label:"Crow",emoji:"🐦‍⬛",likes:["berry_dark","berry_red","meat_cooked","meat_raw","seeds"],rate:.05,thr:14,speed:5,perk:"Flies above the fog: spots landmarks and maps a little of the atlas each day."},
  dog:{name:"Ash",label:"Dog (tamed wolf)",emoji:"🐕",likes:[],rate:0,thr:99,speed:5,perk:"Growls a warning when wolves are near and drives them off."}
};
const COATS={cat:[[0xd98a3d,0xf3e3cc],[0x7d838d,0xe9e9ea],[0x2a2a2e,0xf2f2f2],[0xe8dcc8,0x9a6a40]],frenchie:[[0xd8ae78,0x2c241e],[0x4b3a2b,0x1d1712],[0xeee0c6,0x3a302a]],squirrel:[[0xb5532a,0xf1e0c8]],crow:[[0x17171d,0x2a2a33]],dog:[[0xb08a5a,0xe0c9a0]]};
const MATS=new Map();const mat=(c,r=.85,e)=>{const k=c+"|"+r+"|"+(e||0);if(!MATS.has(k))MATS.set(k,new THREE.MeshStandardMaterial({color:c,roughness:r,emissive:e||0}));return MATS.get(k)};
const SPH=new THREE.SphereGeometry(1,14,10),CYL=new THREE.CylinderGeometry(1,1,1,8),CONE=new THREE.ConeGeometry(1,1,8);
function m(geo,c,sx,sy,sz,x,y,z,r){const o=new THREE.Mesh(geo,mat(c,r));o.scale.set(sx,sy,sz);o.position.set(x,y,z);o.castShadow=true;return o}
function leg(c,x,y,z,len,rad){const p=new THREE.Group();p.position.set(x,y,z);const l=m(CYL,c,rad,len,rad,0,-len/2,0);p.add(l);return p}
// ---------- models ----------
function catModel(coat){const [c,w]=coat,g=new THREE.Group(),body=new THREE.Group();body.position.set(0,.16,-.1);g.add(body);
  body.add(m(SPH,c,.1,.09,.2,0,0,.1));body.add(m(SPH,w,.07,.06,.09,0,-.035,.2));
  const head=new THREE.Group();head.position.set(0,.1,.3);body.add(head);
  head.add(m(SPH,c,.085,.075,.08,0,0,0));head.add(m(SPH,w,.04,.03,.03,0,-.022,.065));head.add(m(SPH,0xd88a8a,.012,.009,.01,0,-.005,.088,.4));
  for(const s of [-1,1]){const e=m(CONE,c,.03,.065,.022,s*.045,.07,-.005);e.rotation.z=-s*.25;head.add(e);const ei=m(CONE,0xe8a0a0,.017,.04,.01,s*.045,.066,.004);ei.rotation.z=-s*.25;head.add(ei);
    head.add(m(SPH,0x7cc860,.016,.016,.01,s*.033,.016,.068,.2));head.add(m(SPH,0x111111,.005,.013,.006,s*.033,.016,.077,.2))}
  const legs=[leg(c,-.045,.12,.13,.13,.018),leg(c,.045,.12,.13,.13,.018),leg(c,-.05,.12,-.07,.13,.02),leg(c,.05,.12,-.07,.13,.02)];legs.forEach(l=>g.add(l));
  const tail=[];let parent=body;for(let i=0;i<5;i++){const s=new THREE.Group();s.position.set(0,i?0:.03,i?-.07:-.08);s.add(m(CYL,i===4?w:c,.017,.075,.017,0,0,-.035).rotateX(Math.PI/2));parent.add(s);tail.push(s);parent=s}
  return {g,body,head,legs,tail,h:.32}}
function frenchieModel(coat){const [c,k]=coat,g=new THREE.Group(),body=new THREE.Group();body.position.set(0,.2,-.04);g.add(body);
  body.add(m(SPH,c,.14,.13,.19,0,0,.02));body.add(m(SPH,0xf2e6d2,.09,.08,.07,0,-.03,.15));
  const head=new THREE.Group();head.position.set(0,.13,.22);body.add(head);
  head.add(m(SPH,c,.12,.105,.105,0,0,0));head.add(m(SPH,k,.075,.055,.04,0,-.03,.085));head.add(m(SPH,0x111111,.028,.018,.015,0,-.005,.122,.3));
  head.add(m(SPH,k,.06,.03,.02,0,-.06,.08));
  for(const s of [-1,1]){const e=m(SPH,c,.042,.075,.018,s*.072,.105,-.01);e.rotation.z=-s*.32;head.add(e);const ei=m(SPH,0xd9958a,.026,.05,.008,s*.07,.1,.004);ei.rotation.z=-s*.32;head.add(ei);
    head.add(m(SPH,0x1a1410,.022,.024,.012,s*.045,.025,.088,.15));head.add(m(SPH,0xffffff,.006,.006,.004,s*.04,.034,.1,.1))}
  const legs=[leg(c,-.075,.12,.11,.11,.03),leg(c,.075,.12,.11,.11,.03),leg(c,-.08,.12,-.1,.11,.032),leg(c,.08,.12,-.1,.11,.032)];legs.forEach(l=>g.add(l));
  const tail=[new THREE.Group()];tail[0].position.set(0,.04,-.18);tail[0].add(m(SPH,c,.03,.03,.03,0,0,0));body.add(tail[0]);
  return {g,body,head,legs,tail,h:.4}}
function squirrelModel(coat){const [c,w]=coat,g=new THREE.Group(),body=new THREE.Group();body.position.set(0,.08,0);g.add(body);
  body.add(m(SPH,c,.05,.055,.08,0,0,0));body.add(m(SPH,w,.035,.04,.04,0,-.01,.05));
  const head=new THREE.Group();head.position.set(0,.06,.08);body.add(head);head.add(m(SPH,c,.04,.038,.042,0,0,0));
  for(const s of [-1,1]){head.add(m(CONE,c,.012,.03,.008,s*.022,.04,-.01));head.add(m(SPH,0x111111,.008,.008,.006,s*.022,.01,.035,.2))}
  const legs=[leg(c,-.03,.05,.05,.05,.01),leg(c,.03,.05,.05,.05,.01),leg(c,-.03,.05,-.04,.05,.012),leg(c,.03,.05,-.04,.05,.012)];legs.forEach(l=>g.add(l));
  const tail=[];let parent=body;for(let i=0;i<3;i++){const s=new THREE.Group();s.position.set(0,i?.06:.02,i?-.01:-.08);s.add(m(SPH,c,.045+i*.01,.05+i*.012,.045,0,.03,0));parent.add(s);tail.push(s);parent=s}
  return {g,body,head,legs,tail,h:.18}}
function crowModel(coat){const [c,k]=coat,g=new THREE.Group(),body=new THREE.Group();body.position.set(0,.16,0);g.add(body);
  body.add(m(SPH,c,.07,.07,.13,0,0,0,.4));const head=new THREE.Group();head.position.set(0,.06,.11);body.add(head);head.add(m(SPH,c,.045,.045,.05,0,0,0,.4));
  const beak=m(CONE,0x222228,.016,.06,.016,0,-.005,.07,.3);beak.rotation.x=Math.PI/2;head.add(beak);for(const s of [-1,1])head.add(m(SPH,0x000000,.008,.008,.006,s*.026,.012,.03,.1));
  const wings=[];for(const s of [-1,1]){const w=new THREE.Group();w.position.set(s*.06,.02,0);w.add(m(SPH,k,.09,.012,.08,s*.08,0,-.01,.4));body.add(w);wings.push(w)}
  const tail=[new THREE.Group()];tail[0].position.set(0,0,-.12);tail[0].add(m(SPH,c,.04,.01,.07,0,0,-.04,.4));body.add(tail[0]);
  const legs=[leg(0x222228,-.025,.1,0,.1,.006),leg(0x222228,.025,.1,0,.1,.006)];legs.forEach(l=>g.add(l));
  return {g,body,head,legs,tail,wings,h:.25}}
const MODELS={cat:catModel,frenchie:frenchieModel,squirrel:squirrelModel,crow:crowModel};
function heartSprite(){const c=document.createElement("canvas");c.width=c.height=64;const x=c.getContext("2d");x.font="48px serif";x.textAlign="center";x.textBaseline="middle";x.fillText("❤",32,36);
  const s=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(c),transparent:true,depthWrite:false}));s.scale.set(.25,.25,.25);s.visible=false;return s}
function qSprite(){const c=document.createElement("canvas");c.width=c.height=64;const x=c.getContext("2d");x.fillStyle="#fff8";x.beginPath();x.arc(32,32,26,0,7);x.fill();x.fillStyle="#3a2a10";x.font="bold 40px sans-serif";x.textAlign="center";x.textBaseline="middle";x.fillText("?",32,34);
  const s=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(c),transparent:true,depthWrite:false}));s.scale.set(.28,.28,.28);s.visible=false;return s}

export function createPets(C){
  const list=[];        // runtime: befriended (world.pets entries) + wild candidates
  let lastNeedy=-1e9,needyOn=true,needy=null,forceNeedy=false;
  try{needyOn=localStorage.getItem("fog-of-knowledge:game:needy")!=="0"}catch(_){}
  const W=()=>C.world,P=()=>C.player;
  const now=()=>C.clock();
  function makeEntity(kind,coatIdx,data,wild){
    let mdl;if(kind==="dog"){const a=C.dogModel();mdl={g:a.g,body:a.g,head:a.g.userData.head||null,legs:a.legs,tail:a.g.userData.tail?[a.g.userData.tail]:[],h:.6,legacy:true}}
    else mdl=MODELS[kind](COATS[kind][coatIdx%COATS[kind].length]);
    const e={kind,data,wild,trust:0,mdl,pos:new THREE.Vector3(),target:null,yaw:0,speed:0,state:"idle",t:2+Math.random()*3,phase:Math.random()*6,perkT:25+Math.random()*25,hop:0,heart:heartSprite(),q:qSprite(),happy:0,sulk:0,waryT:0,shown:true};
    e.heart.position.y=mdl.h+.25;e.q.position.y=mdl.h+.28;mdl.g.add(e.heart);mdl.g.add(e.q);C.scene.add(mdl.g);list.push(e);return e}
  function place(e,x,z){e.pos.set(x,C.heightAt(x,z),z);e.mdl.g.position.copy(e.pos)}
  function remove(e){C.scene.remove(e.mdl.g);list.splice(list.indexOf(e),1)}
  const pets=()=>W().pets||(W().pets=[]);
  const activeCount=()=>pets().filter(p=>p.active).length;
  const nameOf=e=>e.data?e.data.name:PET_INFO[e.kind].label.toLowerCase();
  const observe=(e,b)=>{const c=W().counters,k=e.kind+":"+b;c.behav=c.behav||[];if(!c.behav.includes(k)&&e.pos.distanceTo(P().pos)<14){c.behav.push(k);if(new Set(c.behav).size>=6)C.discover("ethology")}};
  function sync(){ // build entities for every befriended pet (after load / new game)
    for(const e of list.slice())remove(e);needy=null;C.needyUI(null);
    if(W().dog&&!pets().some(p=>p.kind==="dog"))pets().push({id:"dog1",kind:"dog",name:PET_INFO.dog.name,coat:0,active:activeCount()<MAX_ACTIVE,since:W().dog.since||0});
    for(const p of pets()){const e=makeEntity(p.kind,p.coat||0,p,false);const P0=p.active?P().pos:{x:W().camp[0],z:W().camp[1]};place(e,P0.x+(Math.random()-.5)*4,P0.z+(Math.random()-.5)*4)}}
  function befriend(e){
    const kind=e.kind,coat=e.coat||0,d={id:kind+Date.now().toString(36)+Math.floor(Math.random()*1e3),kind,name:uniqueName(PET_INFO[kind].name),coat,active:activeCount()<MAX_ACTIVE,since:W().gameTime};
    pets().push(d);e.wild=false;e.data=d;e.state="hop";e.t=1.6;e.hop=1;e.heart.visible=true;e.heartT=2;sound(e,"happy");
    C.toast(`${PET_INFO[kind].emoji} ${d.name} the ${PET_INFO[kind].label.toLowerCase()} has befriended you! ${d.active?"It will follow you.":`You already have ${MAX_ACTIVE} companions following — ${d.name} will wait at your camp. Swap who follows in the journal (Companions tab).`} Rename it there too.`);
    C.discover("companion");W().counters.befriended=(W().counters.befriended||0)+1;return d}
  function uniqueName(n){let k=n,i=2;while(pets().some(p=>p.name===k))k=n+" "+(i++);return k}
  function sound(e,what){const k=e.kind,A=C.AU;if(e.pos.distanceTo(P().pos)>30)return;
    if(k==="cat")(what==="happy"||what==="pet"?A.purr:what==="sleep"?A.purr:A.meow)();
    else if(k==="frenchie")(what==="sleep"?A.snore:what==="sad"?A.whine:what==="happy"?A.boof:A.snort)();
    else if(k==="squirrel")A.chirp();else if(k==="crow")A.caw();else if(k==="dog")(what==="sad"?A.whine:A.boof)()}
  // ---------- wild candidates ----------
  let spawnT=0;
  function landNear(x,z,r0,r1){for(let i=0;i<30;i++){const a=Math.random()*6.283,r=r0+Math.random()*(r1-r0),xx=x+Math.cos(a)*r,zz=z+Math.sin(a)*r;if(C.heightAt(xx,zz)>.8&&C.slope(xx,zz)<.5)return [xx,zz]}return null}
  function spawnWild(dt){spawnT-=dt;if(spawnT>0)return;spawnT=3;
    const w=W(),have=k=>pets().some(p=>p.kind===k),wildOf=k=>list.find(e=>e.wild&&e.kind===k),age=w.gameTime-w.dayStart,Pp=P().pos;
    for(const e of list.slice())if(e.wild&&e.pos.distanceTo(Pp)>130)remove(e);
    const want=[];
    if(!have("cat"))want.push(["cat",w.camp[0],w.camp[1],7,13]);                         // the stray cat lives around your camp from the start
    if(!have("frenchie")&&(have("cat")||age>1.5*3600))want.push(["frenchie",w.camp[0],w.camp[1],10,18]);
    if(!have("squirrel")&&age>5*3600){const t=C.nearTree(Pp.x,Pp.z,40);if(t)want.push(["squirrel",t.x,t.z,1,3])}
    if(!have("crow")&&age>14*3600)want.push(["crow",Pp.x,Pp.z,14,22]);
    for(const [k,x,z,r0,r1] of want)if(!wildOf(k)&&Math.hypot(x-Pp.x,z-Pp.z)<90){const p=landNear(x,z,r0,r1);if(p){const coat=Math.floor(Math.random()*COATS[k].length),e=makeEntity(k,coat,null,true);e.coat=coat;e.home=p;place(e,p[0],p[1])}}}
  function stepWild(e,dt,d){
    const Pp=P().pos,info=PET_INFO[e.kind];
    const lvl=C.noiseDb()-20*Math.log10(Math.max(1,d));
    e.waryT-=dt;
    if(d<12&&lvl>info.thr&&e.trust<1){ // too loud: it backs off and loses a little trust
      e.trust=Math.max(0,e.trust-dt*.12);const away=e.pos.clone().sub(Pp).setY(0).normalize();e.target=e.pos.clone().addScaledVector(away,3);e.speed=info.speed*.8;e.state="walk";
      if(e.waryT<=0&&d<8){e.waryT=25;C.toast(`The ${info.label.toLowerCase()} startles at your noise (${Math.round(lvl)} dB here). Move slowly — crouch (C) — and let it come to you.`)}return}
    if(d<4.5&&e.trust<1){e.trust=Math.min(1,e.trust+info.rate*dt*(C.crouching()?1.4:1));if(e.trust>.45){e.target=Pp.clone();e.speed=d>1.1?1:0;e.state=d>1.1?"walk":"sit"}
      if(e.trust>=1&&!e.readyToast){e.readyToast=1;C.toast(`The ${info.label.toLowerCase()} ${e.kind==="cat"?"rubs against your legs and purrs":e.kind==="frenchie"?"snorts happily and sits on your foot":"comes right up to you"}. Press E to pet it gently.`);sound(e,"happy")}return}
    if(e.trust>=1){e.target=d>1.2?Pp.clone():e.pos.clone();e.speed=d>1.2?1.2:0;e.state=d>1.2?"walk":e.kind==="cat"?"rub":"sit";return}
    // idle near home
    e.t-=dt;if(e.t<=0){e.t=3+Math.random()*5;const h=e.home||[e.pos.x,e.pos.z];const r=Math.random();
      if(r<.45){e.target=new THREE.Vector3(h[0]+(Math.random()-.5)*8,0,h[1]+(Math.random()-.5)*8);e.state="walk";e.speed=.8}else{e.target=null;e.state=e.kind==="cat"?(r<.75?"groom":"sit"):e.kind==="frenchie"?"sniff":"sit";e.speed=0}}}
  // ---------- companions ----------
  function slot(e){const act=list.filter(x=>!x.wild&&x.data.active);const i=act.indexOf(e),f=C.forward(),r={x:-f.z,z:f.x},off=[-1.1,1.1,0][i%3],back=[1.6,1.6,2.6][i%3];
    return new THREE.Vector3(P().pos.x-f.x*back+r.x*off,0,P().pos.z-f.z*back+r.z*off)}
  function stepPet(e,dt,d){
    const Pp=P().pos,info=PET_INFO[e.kind],w=W(),night=C.isNight();
    e.happy=Math.max(0,e.happy-dt);if(e.heartT>0){e.heartT-=dt;if(e.heartT<=0)e.heart.visible=false}
    if(!e.data.active){ // resting at camp
      const c=w.camp;e.mdl.g.visible=Math.hypot(c[0]-Pp.x,c[1]-Pp.z)<90;if(!e.mdl.g.visible)return;
      const f=C.litFireNear(c[0],c[1],12);e.t-=dt;
      if(night&&f){const a=(list.indexOf(e)*1.7)%6.28;e.target=new THREE.Vector3(f.x+Math.cos(a)*1.7,0,f.z+Math.sin(a)*1.7);e.speed=1;if(e.pos.distanceTo(e.target.setY(e.pos.y))<.4){e.state="sleep";e.speed=0}else e.state="walk";return}
      if(e.t<=0){e.t=4+Math.random()*6;if(Math.random()<.5){e.target=new THREE.Vector3(c[0]+(Math.random()-.5)*7,0,c[1]+(Math.random()-.5)*7);e.state="walk";e.speed=.8}else{e.target=null;e.state=e.kind==="cat"?"groom":"sit";e.speed=0}}return}
    e.mdl.g.visible=true;
    if(e.kind==="dog"&&C.dogGuard(e,dt,d))return;
    if(d>60){const s=slot(e);place(e,s.x,s.z);e.state="walk"}
    // timed special states
    if(e.special){e.t-=dt;const s=e.special;
      if(s==="zoomies"){e.ang=(e.ang||0)+dt*4.2;e.target=new THREE.Vector3(Pp.x+Math.cos(e.ang)*2.6,0,Pp.z+Math.sin(e.ang)*2.6);e.speed=5.2;e.state="walk";if(Math.random()<dt*2)sound(e,"happy")}
      else if(s==="hop"){e.state="hop";e.speed=0}
      else if(s==="guide"||s==="ore"){const g=e.goal;const dd=Math.hypot(g.x-e.pos.x,g.z-e.pos.z);if(dd>.7){e.target=new THREE.Vector3(g.x,0,g.z);e.speed=Math.min(info.speed,2.6);e.state="walk"}else{e.speed=0;e.state=s==="ore"?"sniff":"sit";e.q.visible=s==="guide";if(!g.told){g.told=1;C.toast(g.msg);sound(e,"call");observe(e,s)}}
        if(g.told&&Math.hypot(g.x-Pp.x,g.z-Pp.z)<3){if(g.hint)C.toast(g.hint);e.t=0}}
      else if(s==="stare"||s==="flop"||s==="sitOn"||s==="paw"||s==="tug"){e.speed=0;e.state=s==="flop"?"flop":s==="paw"?"paw":"sit";e.target=null;if(d>1.6){e.target=Pp.clone();e.speed=2;e.state="walk"}}
      else if(s==="steal"){e.state="fly";e.target=new THREE.Vector3(Pp.x+Math.cos(now()*.8)*5,0,Pp.z+Math.sin(now()*.8)*5);e.speed=4;e.fly=3}
      else if(s==="sulk"){e.speed=0;e.state="sulk"}
      if(e.t<=0)endSpecial(e);return}
    const f=night?C.litFireNear(Pp.x,Pp.z,14):null;
    if(f&&d<16){const a=(list.indexOf(e)*2.1)%6.28,t=new THREE.Vector3(f.x+Math.cos(a)*1.6,0,f.z+Math.sin(a)*1.6);if(Math.hypot(t.x-e.pos.x,t.z-e.pos.z)>.4){e.target=t;e.speed=1.4;e.state="walk"}else{e.speed=0;if(e.state!=="sleep"){e.state="sleep";observe(e,"sleep")}if(Math.random()<dt*.12)sound(e,"sleep")}e.fly=0;return}
    const moving=Math.hypot(P().vel.x,P().vel.z)>.4,s=slot(e),ds=Math.hypot(s.x-e.pos.x,s.z-e.pos.z);
    if(e.kind==="crow"&&d>9){e.fly=4;e.target=s;e.speed=Math.min(9,d*1.4);e.state="fly";return}
    if(ds>1.2&&(moving||ds>3.5)){e.target=s;e.speed=Math.min(info.speed*(ds>8?1.6:1),.4+ds*1.1);e.state="walk";e.fly=Math.max(0,(e.fly||0)-dt*2);e.t=1.5+Math.random()*2;return}
    e.fly=Math.max(0,(e.fly||0)-dt*2);
    // perks (daytime, while idle)
    e.perkT-=dt;if(e.perkT<=0&&!night){e.perkT=40+Math.random()*30;if(perk(e))return}
    e.t-=dt;if(e.t<=0)chooseIdle(e,d)}
  function chooseIdle(e,d){e.t=3+Math.random()*4;e.target=null;e.speed=0;const r=Math.random(),k=e.kind,friend=list.find(o=>o!==e&&!o.wild&&o.data.active&&(o.kind==="cat"||o.kind==="frenchie")&&o.pos.distanceTo(e.pos)<8);
    let b;
    if(k==="cat")b=r<.3?"groom":r<.5?"sit":r<.7?"rub":r<.85&&friend?"play":"loaf";
    else if(k==="frenchie")b=r<.35?"sniff":r<.55?"sit":r<.7?"flop":r<.85&&friend?"play":"sniff";
    else if(k==="squirrel")b=r<.5?"nibble":"dart";else if(k==="crow")b=r<.5?"peck":"hopabout";else b=r<.5?"sniff":"sit";
    if(b==="rub"){e.target=P().pos.clone();e.speed=1.2}
    if(b==="sniff"||b==="dart"||b==="hopabout"){e.target=e.pos.clone().add(new THREE.Vector3((Math.random()-.5)*5,0,(Math.random()-.5)*5));e.speed=b==="dart"?3:.9}
    if(b==="play"){e.playWith=friend;e.t=4}
    e.state=b;observe(e,b)}
  function endSpecial(e){const s=e.special;e.special=null;e.q.visible=false;e.fly=0;
    if(s==="steal"&&e.stolen){C.give(e.stolen,1);C.toast(`${nameOf(e)} drops your ${C.itemName(e.stolen)} back at your feet, very pleased with itself.`);e.stolen=null}
    if(needy&&needy.e===e){if(!needy.done){C.toast(`${nameOf(e)} sulks adorably and turns its back on you. (No harm done.)`);e.special="sulk";e.t=6;sound(e,"sad")}needy=null;C.needyUI(null)}}
  function perk(e){const Pp=P().pos;
    if(e.kind==="cat"){const s=C.curiousSpot(Pp.x,Pp.z,e.lastSpot);if(!s)return false;e.lastSpot=s.key;e.goal={x:s.x,z:s.z,msg:`${nameOf(e)} trots off and sits by ${s.label}, tail twitching. Something curious there?`,hint:s.hint};e.special="guide";e.t=45;return true}
    if(e.kind==="frenchie"){const o=C.oreSpot(Pp.x,Pp.z,e.seen||(e.seen=[]));if(!o)return false;e.seen.push(o.key);e.goal={x:o.x,z:o.z,msg:`${nameOf(e)} snorts and paws at the ground — ${o.label} here!`};e.special="ore";e.t=40;return true}
    if(e.kind==="squirrel"){const w=W();if(w.gameTime-(e.data.lastGift||0)<3*3600)return false;e.data.lastGift=w.gameTime;const k=Math.random()<.6?"nuts":"seeds";C.give(k,Math.random()<.5?2:1);sound(e,"call");C.toast(`${nameOf(e)} scampers up with ${k==="nuts"?"hazelnuts":"a cheek-full of seeds"} for you.`);observe(e,"gift");return true}
    if(e.kind==="crow"){const w=W(),day=Math.floor(w.gameTime/86400);if(e.data.lastSpot===day)return false;e.data.lastSpot=day;const l=C.landmark(Pp.x,Pp.z);const n=C.revealAtlas(3);e.special="steal";e.t=4;sound(e,"call");
      C.toast(`${nameOf(e)} circles high above the fog and caws${l?` toward the ${l.dir} — ${l.label} about ${l.d} m away`:""}.${n?` (${n} atlas nodes mapped from the sky)`:""}`);observe(e,"scout");return true}
    return false}
  // ---------- eureka, petting, needy ----------
  function eureka(){for(const e of list)if(!e.wild&&e.data.active&&e.pos.distanceTo(P().pos)<40){if(e.special&&e.special!=="zoomies")endSpecial(e);
    e.special=e.kind==="frenchie"||e.kind==="dog"?"zoomies":"hop";e.t=e.special==="zoomies"?4:2.4;sound(e,"happy");observe(e,"excited")}}
  function nearestPet(r=3.5){let b=null,bd=r;for(const e of list){if(e.wild&&!(e.trust>=.75))continue;if(!e.wild&&!e.data.active)continue;const d=e.pos.distanceTo(P().pos);if(d<bd){bd=d;b=e}}return b}
  function pet(e){e=e||nearestPet();if(!e)return false;
    if(e.wild){if(e.trust>=.75){befriend(e);return true}e.trust=Math.min(1,e.trust+.15);C.toast(`The ${PET_INFO[e.kind].label.toLowerCase()} sniffs your hand, then backs off. Be patient and quiet.`);return true}
    e.heart.visible=true;e.heartT=1.8;e.happy=240;sound(e,"pet");observe(e,"petted");W().counters.pets=(W().counters.pets||0)+1;
    if(needy&&needy.e===e){needy.done=true;C.toast(`You give ${nameOf(e)} a good scratch. ${e.kind==="cat"?"Purrrr.":e.kind==="frenchie"?"Snort! Happy wiggle.":"Satisfied."}`);endSpecial(e)}
    else if(e.special==="sulk")endSpecial(e);
    else C.toast(`You pet ${nameOf(e)}. ${e.kind==="cat"?"It purrs and kneads the air.":e.kind==="frenchie"?"Snorts, wiggles, flops over for belly rubs.":"It leans into your hand."}`);
    return true}
  function offer(e,item){const info=PET_INFO[e.kind];if(!info.likes.includes(item)){C.toast(`The ${info.label.toLowerCase()} sniffs the ${C.itemName(item).toLowerCase()} and isn't interested.`);return false}
    if(e.wild&&C.noiseDb()-20*Math.log10(Math.max(1,e.pos.distanceTo(P().pos)))>info.thr+6){C.toast("Too much commotion — it won't take food. Move slowly.");return false}
    C.take(item,1);C.AU.eat();sound(e,"happy");if(e.wild){e.trust=Math.min(1,e.trust+.45);C.toast(e.trust>=1?`It eats from your hand. Press E to pet it.`:`It eats the ${C.itemName(item).toLowerCase()}, watching you closely.`)}else{e.happy=300;e.heart.visible=true;e.heartT=1.5;C.toast(`${nameOf(e)} gobbles it up.`)}observe(e,"eats");return true}
  /* Needy pets: called when you start focused work. Comedic, never blocking. */
  const LINES={
    cat:{study:["plops down right on your notes","walks slowly across your journal, tail in your face"],craft:["sits on exactly the piece you need"],pendulum:["bats at the swinging pendulum"],observe:["bats the item right out of your hand… almost"],cook:["stares at the sizzling meat, then at you"],telescope:["winds around your ankles, demanding attention"],default:["knocks something off, maintaining eye contact"]},
    frenchie:{default:["drops a slobbery stick at your feet and stares with puppy eyes","does zoomies right through your experiment","flops belly-up and refuses to move until petted"]},
    crow:{default:["snatches something shiny and flaps off with it"]},squirrel:{default:["tugs at your sleeve, chittering"]},dog:{default:["drops a stick at your feet and whines"]}};
  function distract(kind,opts={}){
    if(!needyOn||needy)return null;const t=now();if(!forceNeedy&&(t-lastNeedy<150||Math.random()>.55))return null;
    const cands=list.filter(e=>!e.wild&&e.data.active&&!e.special&&e.happy<=0&&e.state!=="sleep"&&e.pos.distanceTo(P().pos)<16);if(!cands.length)return null;
    const e=cands.find(x=>x.kind==="cat")||cands[0];forceNeedy=false;lastNeedy=t;
    const L=(LINES[e.kind][kind]||LINES[e.kind].default||LINES.cat.default);const line=L[Math.floor(Math.random()*L.length)];
    e.special=e.kind==="frenchie"?(line.includes("zoom")?"zoomies":line.includes("belly")?"flop":"stare"):e.kind==="crow"?"steal":e.kind==="cat"?(kind==="pendulum"?"paw":"sitOn"):e.kind==="squirrel"?"tug":"stare";e.t=12;
    if(e.kind==="frenchie"&&line.includes("stick")||e.kind==="dog")C.dropAtFeet("stick");
    if(e.kind==="crow"){const shiny=["flake","glass","lens","copper","bronze","quartz","pyrite"].find(k=>C.inv(k));if(shiny){C.take(shiny,1);e.stolen=shiny}}
    if(e.kind==="cat"&&kind!=="pendulum"&&kind!=="observe"&&opts.table)C.knockOff(opts.table);
    needy={e,kind,done:false};sound(e,"sad");C.needyUI({emoji:PET_INFO[e.kind].emoji,text:`${nameOf(e)} ${line}… Pet? [P]`});observe(e,"needy");
    return {pet:e.data.name,kind:e.kind,jiggle:kind==="pendulum"?.08:0}}
  // ---------- animation ----------
  function animate(e,dt){const M=e.mdl,g=M.g;e.phase+=dt*(1+e.speed*3.2);const st=e.state,sp=e.speed;
    if(M.legacy){M.legs.forEach((l,i)=>l.rotation.x=Math.sin(e.phase+(i%2?Math.PI:0))*Math.min(.7,sp*.3));if(M.tail[0])M.tail[0].rotation.y=Math.sin(e.phase*2)*.5;g.position.y=e.pos.y+(st==="hop"?Math.abs(Math.sin(e.phase*2))*.25:0);return}
    const walk=sp>.05,sw=Math.min(.8,sp*.35),k=e.kind;let bodyX=0,bodyY=0,bodyZ=0,headX=0,headY=0,lift=0,legFold=0,curl=0;
    M.legs.forEach((l,i)=>{l.rotation.x=walk?Math.sin(e.phase*(k==="frenchie"?1.4:1)+(i%2?Math.PI:0)+(i>1?Math.PI/2:0))*sw:0;l.scale.y=1});
    if(k==="frenchie"&&walk)bodyZ=Math.sin(e.phase*1.4)*.12;                        // the waddle
    if(st==="sit"||st==="paw"||st==="stare"||st==="nibble"){bodyX=k==="squirrel"?-.9:-.5;bodyY=-.03;headX=.4;legFold=1}
    if(st==="groom"){bodyX=-.45;legFold=1;headX=.7;headY=Math.sin(e.phase*1.5)*.5;M.legs[0].rotation.x=-1.2+Math.sin(e.phase*6)*.2}
    if(st==="paw"){M.legs[1].rotation.x=-1.4+Math.sin(e.phase*5)*.6}
    if(st==="loaf"||st==="sleep"||st==="sulk"){curl=1;bodyY=-.08}
    if(st==="flop"){bodyZ=Math.PI*.9;bodyY=-.02;M.legs.forEach((l,i)=>l.rotation.x=Math.sin(e.phase*3+i)*.5)}
    if(st==="sniff"&&!walk){headX=.55;headY=Math.sin(e.phase*2)*.3}
    if(st==="peck"){headX=.6+Math.max(0,Math.sin(e.phase*4))*.6}
    if(st==="hop"||st==="hopabout"&&walk)lift=Math.abs(Math.sin(e.phase*(st==="hop"?3:2)))*(k==="frenchie"?.18:.22);
    if(st==="rub"&&!walk){bodyZ=Math.sin(e.phase*.8)*.2;headY=.3}
    if(st==="play"&&e.playWith){const o=e.playWith;const a=now()*2+(k==="cat"?0:Math.PI);e.target=new THREE.Vector3(o.pos.x+Math.cos(a)*1.2,0,o.pos.z+Math.sin(a)*1.2);e.speed=2.4;lift=Math.abs(Math.sin(e.phase*2))*.08}
    // crow flight
    const fly=e.fly||0;if(M.wings){const flap=fly>0||st==="fly";M.wings.forEach((w,i)=>w.rotation.z=(i?-1:1)*(flap?Math.sin(now()*18)*.9:.15));lift+=Math.min(3.5,fly)*1}
    M.body.rotation.set(bodyX,0,bodyZ);M.body.position.y=(M.baseY??=M.body.position.y)+bodyY*(1-curl)+(curl?-M.h*.25:0);
    if(curl){M.body.rotation.y=.6;M.legs.forEach(l=>l.scale.y=.15)}
    if(legFold&&k!=="crow"){M.legs[2].scale.y=M.legs[3].scale.y=.35;M.legs[0].scale.y=M.legs[1].scale.y=1.05}
    if(M.head){M.head.rotation.set(headX-(bodyX*.6),headY,0)}
    if(M.tail.length>1)M.tail.forEach((s,i)=>{s.rotation.x=k==="squirrel"?-.9+Math.sin(now()*3+i)*.08:curl?.05:-.25+Math.sin(now()*(st==="stare"||st==="sulk"?5:2)+i*.7)*.18;s.rotation.y=curl?.55:Math.sin(now()*1.6+i*.6)*(walk?.12:.3)});
    else if(M.tail[0])M.tail[0].rotation.y=Math.sin(now()*(e.happy>0?14:6))*.4;     // frenchie nub wiggle
    g.position.y=e.pos.y+lift}
  // ---------- main update ----------
  function update(dt){if(!W())return;spawnWild(dt);const Pp=P().pos;
    for(const e of list.slice()){const d=e.pos.distanceTo(Pp);
      if(e.wild)stepWild(e,dt,d);else stepPet(e,dt,d);
      if(e.target&&e.speed>0){const dir=e.target.clone().sub(e.pos).setY(0),len=dir.length();if(len>.15){dir.multiplyScalar(1/len);const st=Math.min(len,e.speed*dt),nx=e.pos.x+dir.x*st,nz=e.pos.z+dir.z*st;
        if(C.heightAt(nx,nz)>.05||e.fly){e.pos.x=nx;e.pos.z=nz}else e.target=null;const ty=Math.atan2(dir.x,dir.z);let dy=ty-e.yaw;dy=Math.atan2(Math.sin(dy),Math.cos(dy));e.yaw+=dy*Math.min(1,dt*8)}else if(e.state==="walk")e.state="sit"}
      else if(e.state==="rub"&&d<1.5){e.yaw+=dt*1.2}
      if(e.state==="sulk"||e.special==="sulk"){const ty=Math.atan2(e.pos.x-Pp.x,e.pos.z-Pp.z);e.yaw+=(Math.atan2(Math.sin(ty-e.yaw),Math.cos(ty-e.yaw)))*Math.min(1,dt*3)}
      else if(!e.target&&d<6&&(e.state==="sit"||e.state==="stare")){const ty=Math.atan2(Pp.x-e.pos.x,Pp.z-e.pos.z);e.yaw+=(Math.atan2(Math.sin(ty-e.yaw),Math.cos(ty-e.yaw)))*Math.min(1,dt*3)}
      e.pos.y=C.heightAt(e.pos.x,e.pos.z);e.mdl.g.position.set(e.pos.x,e.pos.y,e.pos.z);e.mdl.g.rotation.y=e.yaw;
      if(d<70)animate(e,dt);e.q.visible=e.special==="guide"&&e.state==="sit"}
    if(needy&&needy.e&&!list.includes(needy.e)){needy=null;C.needyUI(null)}}
  function setActive(id,on){const p=pets().find(x=>x.id===id);if(!p)return false;if(on&&!p.active&&activeCount()>=MAX_ACTIVE){C.toast(`Only ${MAX_ACTIVE} companions can follow at once — send one to rest at camp first.`);return false}p.active=!!on;
    const e=list.find(x=>x.data===p);if(e&&on){const s=P().pos;place(e,s.x+1,s.z+1)}return true}
  function rename(id,name){const p=pets().find(x=>x.id===id);if(!p)return false;p.name=String(name||"").replace(/[<>]/g,"").trim().slice(0,18)||p.name;return true}
  function tame(kind,x,z){ // a wolf that took food twice by the fire becomes a dog companion
    const d={id:kind+Date.now().toString(36)+Math.floor(Math.random()*1e4),kind,name:uniqueName(PET_INFO[kind].name),coat:0,active:activeCount()<MAX_ACTIVE,since:W().gameTime};pets().push(d);const e=makeEntity(kind,0,d,false);place(e,x,z);return d}
  return {update,sync,eureka,pet,offer,distract,nearestPet,setActive,rename,tame,befriend,list,activeCount,
    target(x,z,r=2.4){let b=null,bd=r;for(const e of list){if(!e.mdl.g.visible)continue;const d=Math.hypot(e.pos.x-x,e.pos.z-z)-.2;if(d<bd){bd=d;b=e}}return b?{e:b,d:bd}:null},
    label(e,held){const info=PET_INFO[e.kind];if(e.wild){const lk=held&&info.likes.includes(held);return `${info.label} (wild · trust ${Math.round(e.trust*100)}%) · ${e.trust>=.75?"E pet":lk?"Q offer "+C.itemName(held).toLowerCase():"approach quietly (C)"}`}
      return `${e.data.name} the ${info.label.toLowerCase()} · E / P pet${held&&info.likes.includes(held)?" · Q treat":""}`},
    get needy(){return needy},set needyOn(v){needyOn=!!v;try{localStorage.setItem("fog-of-knowledge:game:needy",v?"1":"0")}catch(_){}},get needyOn(){return needyOn},
    forceNextNeedy(){forceNeedy=true;lastNeedy=-1e9},clearNeedy(){if(needy){needy.done=true;const e=needy.e;needy=null;endSpecial(e);C.needyUI(null)}},
    behaviours:()=>W().counters.behav||[]}
}
