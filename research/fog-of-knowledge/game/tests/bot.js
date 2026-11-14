// Fog of Knowledge: The Game: scripted bot player for the automated playtests.
// Uses ONLY what a player can do: hold movement keys, turn the camera, E (interact), Q (use held), F (eat),
// crouch, the hotbar, and crafting from the inventory panel. Perception is scan(): the nearest thing of a kind
// in the loaded world, i.e. what is on screen. It never grants items, teleports, or changes time/weather.
export function runBot(W,opts={}){
  const seed=opts.seed||1,maxSim=opts.maxSim||3600,TICK=.25;
  const S=()=>W.state,P=()=>W.player,inv=k=>S().inv[k]||0,has=id=>S().disc.includes(id);
  // reproducible runs: the game's dice (Math.random) are seeded from the world seed for the bot's session
  const realRandom=Math.random;let rs=(seed*2654435761)>>>0;Math.random=()=>{rs=(rs+0x6D2B79F5)>>>0;let t=rs;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296};
  try{return play()}finally{Math.random=realRandom}
  function play(){
  W.newGame(seed);W.help.close();W.closePopup();W.keysClear();
  let simT=0,goal=null,lastProg={t:0,d:1e9},stuckT=0,detour=0,swimT=0,deaths=0,actions=0;
  const black=new Set(),bk=(x,z)=>Math.round(x)+","+Math.round(z),deathSpots={};
  const dropAhead=yaw=>{const p=P().pos,h0=W.height(p.x,p.z);for(const r of [1,2,3]){if(h0-W.height(p.x-Math.sin(yaw)*r,p.z-Math.cos(yaw)*r)>1.8)return true}return false};
  const ms={},trace=[],events=[],minTb={v:37},seen=new Set();let lastDisc=0,nightsSurvived=0,lastDay=0,exploreA=Math.random()*6.28,exploreN=0;
  const mark=k=>{if(!(k in ms))ms[k]={t:Math.round(simT),day:+(dayF()).toFixed(2)}};
  const dayF=()=>(S().gameTime-S().dayStart)/86400;
  const ev=s=>{events.push(`[${Math.round(simT)}s d${dayF().toFixed(2)}] ${s}`);if(events.length>3000)events.shift()};
  const dist=(x,z)=>Math.hypot(x-P().pos.x,z-P().pos.z);
  const face=(x,z,pitch=.3)=>W.look(Math.atan2(-(x-P().pos.x),-(z-P().pos.z)),pitch);
  const aimPitch=(v,d,h)=>{let best=0,be=1e9;for(let p=-.4;p<.8;p+=.005){const vy=v*Math.sin(p),vx=v*Math.cos(p),t=(vy+Math.sqrt(vy*vy+2*9.81*Math.max(-1,h)))/9.81,e=Math.abs(vx*t-d);if(e<be){be=e;best=p}}return .32-best};
  // a straight walk there stays on land (≤ 8 m of wading); the bot plans like a cautious player
  function dryPath(x,z){const P0=P().pos,L=Math.hypot(x-P0.x,z-P0.z);let wet=0;for(let k=0;k<=L;k+=2){const h=W.height(P0.x+(x-P0.x)*k/L,P0.z+(z-P0.z)*k/L);if(h<-.45){wet+=2;if(wet>2)return false}else wet=0}return W.height(x,z)>-.3}
  const okf=(x,z)=>!black.has(bk(x,z))&&dryPath(x,z);
  const scan=(kind,type,r)=>W.scan(kind,type,r,kind==="water"?undefined:okf);
  const act=fn=>{actions++;return fn()};
  const hold=k=>inv(k)?act(()=>W.hold(k)):false;
  const camp=()=>S().camp;
  const structs=type=>S().structures.filter(s=>s.type===type);
  const campFire=()=>structs("fire").filter(s=>Math.hypot(s.x-camp()[0],s.z-camp()[1])<12).sort((a,b)=>dist(a.x,a.z)-dist(b.x,b.z))[0];
  const kiln=()=>structs("kiln")[0];
  const shelter=()=>S().structures.filter(s=>s.type==="leanto"||s.type==="hut"||s.type==="house").sort((a,b)=>({house:3,hut:2,leanto:1}[b.type]-{house:3,hut:2,leanto:1}[a.type]))[0];
  function goTo(x,z,tol,why){if(goal&&goal.x===x&&goal.z===z)return;goal={x,z,tol,why,t0:simT};lastProg={t:simT,d:dist(x,z)}}
  function near(x,z,tol=1.4){return dist(x,z)<tol}
  // walk up to a thing and face it; returns true when we are in reach and it is the current target
  function reach(x,z,kind,type,tol=1.15){if(dist(x,z)>tol){goTo(x,z,tol*.85,kind+":"+(type||""));return false}goal=null;W.keysClear();face(x,z);const t=W.target();return !!t&&(!kind||t.kind===kind)&&(!type||t.type===type)}
  function gather(type,r=170){const o=scan("res",type,r);if(!o||black.has(bk(o.x,o.z)))return explore("looking for "+type);
    if(reach(o.x,o.z,null,null,1.0)){const t=W.target();if(t&&(t.kind==="res"||t.kind==="drop"))act(()=>W.interact());else{black.add(bk(o.x,o.z))}}return true}
  function explore(why){if(!goal||goal.why!=="explore"){exploreN++;const c=camp(),R=60+45*(exploreN%5);for(let k=0;k<12;k++){exploreA+=2.1;const x=c[0]+Math.cos(exploreA)*R,z=c[1]+Math.sin(exploreA)*R;if(dryPath(x,z)&&W.height(x,z)>.5){goTo(x,z,4,"explore");ev("explore: "+why);return true}}goTo(c[0],c[1],2,"camp")}return true}
  function craft(k){if(W.craft(k)){actions++;ev("crafted "+k);return true}return false}
  function placeHeld(k,yawOff=0){hold(k);W.look(P().camYaw+yawOff,.3);const n=S().structures.length;act(()=>W.useHeld());if(S().structures.length>n){ev("placed "+k);return true}return false}
  function lightAt(s){if(!reach(s.x,s.z,"struct",s.type,1.6))return true;if(!(inv("flint")&&inv("pyrite")))return false;hold("flint");act(()=>W.useHeld());if(s.lit)ev("lit "+s.type);return true}
  function fuel(s,wantKg){if(s.fuel>=wantKg)return false;if(!(inv("log")||inv("stick")))return false;if(!reach(s.x,s.z,"struct",s.type,1.6))return true;act(()=>W.interact());return true}
  function chop(){if(!(inv("axe_stone")||inv("axe_copper")||inv("axe_bronze")||inv("axe_iron")))return false;const t=scan("tree",null,120);if(!t||black.has(bk(t.x,t.z)))return explore("trees");
    if(reach(t.x,t.z,"tree",null,1.5))act(()=>W.interact());return true}
  function sticks(){const t=scan("tree",null,60),r=scan("res","stick",60);if(r&&(!t||r.d<t.d+10)&&!black.has(bk(r.x,r.z)))return gather("stick");
    if(t&&(t.sticks||0)<3&&!black.has(bk(t.x,t.z))){if(reach(t.x,t.z,"tree",null,1.5)){act(()=>W.interact());const tt=scan("tree",null,3);if(tt&&(tt.sticks||0)>=3)black.add(bk(tt.x,tt.z))}return true}return gather("stick")}
  function hunt(){const a=["deer","rabbit","boar"].map(k=>scan("animal",k,90)).filter(Boolean).sort((a,b)=>a.d-b.d)[0];if(!a||!inv("spear"))return false;
    if(a.d>8.5){W.crouch(a.d<25);goTo(a.x,a.z,8,"stalk "+a.type);return true}
    goal=null;W.keysClear();const v=12.2,pp=P().pos;face(a.x,a.z,aimPitch(v,a.d-.3,1.1+pp.y-(a.y+.7*a.size)));hold("spear");act(()=>W.useHeld());W.crouch(false);ev("threw spear at "+a.type+" "+a.d.toFixed(1)+" m");return true}
  function pickupDrops(r=40,filter){const d=scan("drop",filter,r);if(!d||black.has(bk(d.x,d.z)))return false;if(reach(d.x,d.z,null,null,1.0)){const t=W.target();if(t&&t.kind==="drop")act(()=>W.interact());else black.add(bk(d.x,d.z))}return true}
  function eatBest(){for(const k of ["meat_dried","meat_cooked","grain","berry_dark"])if(inv(k)){hold(k);act(()=>W.eat());return true}
    const f=campFire();if(inv("meat_raw")&&f&&f.lit){if(reach(f.x,f.z,"struct","fire",1.6)){hold("meat_raw");act(()=>W.useHeld())}return true}return false}
  function drink(){if(inv("pot_clean")){hold("pot_clean");act(()=>W.eat());return true}
    const t0=W.target();if(t0&&t0.kind==="water"&&!P().swimming){goal=null;W.keysClear();act(()=>W.interact());return true}
    const w=scan("water",null,160);if(!w)return explore("water");
    // stand on the last bit of dry land before the water, facing it
    const p=P().pos,L=Math.hypot(w.x-p.x,w.z-p.z);let sx=w.x,sz=w.z;for(let k=0;k<L;k+=.5){const x=w.x+(p.x-w.x)*k/L,z=w.z+(p.z-w.z)*k/L;if(W.height(x,z)>-.3){sx=x;sz=z;break}}
    if(dist(sx,sz)>.8){goTo(sx,sz,.5,"water");return true}
    goal=null;W.keysClear();face(w.x,w.z,.5);const t=W.target();if(t&&t.kind==="water"){if(inv("pot")&&S().st.thirst>60){hold("pot");act(()=>W.useHeld())}else act(()=>W.interact())}else black.add(bk(w.x,w.z));return true}
  // ---- the plan ----
  function night(){
    const h=W.hourOf(),f=campFire(),hrsLeft=h>=12?24-h+6.5:6.5-h;
    if(!f){if(inv("campfire")){if(dist(camp()[0],camp()[1])>2.5){goTo(camp()[0],camp()[1],2,"camp");return}placeHeld("campfire");return}
      if(inv("stick")>=3){craft("campfire");return}return sticks()}
    if(f.fuel<Math.min(hrsLeft+1,12)&&(inv("log")||inv("stick"))){fuel(f,99);return}
    if(!f.lit&&f.fuel>0){if(!(inv("flint")&&inv("pyrite")))return gather(inv("flint")?"pyrite":"flint",60);lightAt(f);return}
    if(f.fuel<hrsLeft*.6+.5){if(h>=19.5||h<6){const s=scan("res","stick",25);if(s)return gather("stick",25)}return chop()||sticks()}
    // wolves: strike any that get close
    const wv=scan("animal","wolf",6);if(wv&&inv("spear")&&!(wv.calm)){if(reach(wv.x,wv.z,"animal","wolf",1.8)){hold("spear");act(()=>W.useHeld());ev("struck wolf")}return}
    const sh=shelter();
    if(sh&&(h>=19.2||h<5)&&Math.hypot(sh.x-f.x,sh.z-f.z)<6){if(reach(sh.x,sh.z,"struct",sh.type,1.8+({leanto:.2,hut:1.6,house:2}[sh.type]||0))){const g=S().gameTime;act(()=>W.interact());if(S().gameTime>g+3600){ev("slept in "+sh.type+" — woke "+W.hourOf().toFixed(1)+"h, tb "+S().st.tb.toFixed(1));mark("first sleep")}}return}
    if(inv("meat_raw")&&f.lit&&f.temp>80){if(reach(f.x,f.z,"struct","fire",1.6)){hold("meat_raw");act(()=>W.useHeld())}return}
    if(dist(f.x,f.z)>2){goTo(f.x,f.z,1.6,"fire");return}goal=null;W.keysClear();
  }
  const NEED=(k,n)=>inv(k)<n;
  let catStart=0;
  function befriendCat(){ // gentle: walk close, crouch, wait quietly, then pet (F) — the way a player would
    if(!W.pets||S().pets.length||(catStart&&simT-catStart>200)||!campFire())return false;const c=W.pets.list.find(e=>e.wild&&e.kind==="cat");if(!c||dist(c.pos.x,c.pos.z)>45)return false;
    if(dist(c.pos.x,c.pos.z)>2.2){W.crouch(false);goTo(c.pos.x,c.pos.z,2,"cat");return true}
    goal=null;W.keysClear();W.crouch(true);if(!catStart)catStart=simT;if(c.trust>=.75){face(c.pos.x,c.pos.z);act(()=>W.interact());if(!c.wild){ev("befriended the cat");mark("cat");W.crouch(false)}}return true}
  function progress(){
    const h=W.hourOf();
    if(pickupDrops(14))return;
    if(befriendCat())return;
    if(NEED("flint",2)&&!has("bronze"))return gather("flint");
    if(NEED("pyrite",1))return gather("pyrite");
    if(NEED("stone",1))return gather("stone");
    if(!has("knapping")||(NEED("flake",2)&&inv("flint")>=2&&!has("iron"))){hold("flint");act(()=>W.useHeld());return}
    if(NEED("stick",4))return sticks();
    if(NEED("fiber",3))return gather("fiber");
    if(!inv("axe_stone")&&!inv("axe_copper")&&!inv("axe_bronze")&&!inv("axe_iron")){if(craft("axe_stone"))return}
    if(!campFire()){if(!inv("campfire")&&!craft("campfire"))return sticks();if(dist(camp()[0],camp()[1])>2.5)return goTo(camp()[0],camp()[1],2,"camp");return placeHeld("campfire")}
    if(!shelter()){if(inv("leanto")){const f=campFire();if(dist(f.x,f.z)>3.3||dist(f.x,f.z)<2.2)return goTo(f.x+2.8,f.z,.4,"shelter spot");face(f.x,f.z);return placeHeld("leanto",Math.PI)}
      if(inv("stick")>=6&&inv("fiber")>=3)return craft("leanto");if(NEED("stick",6))return sticks();return gather("fiber")}
    if(!inv("spear")&&inv("flake")&&inv("stick")>=2)return craft("spear");
    if(NEED("log",4))return chop()||sticks();
    if(!has("counting")){if(!inv("tally")&&!craft("tally"))return;hold("tally");for(let i=0;i<10&&!has("counting");i++)act(()=>W.useHeld());return}
    const st=S().st;
    if(!has("edible")&&st.health>80&&h<15){if(!S().counters.berries.includes("berry_dark")&&!inv("berry_dark"))return gather("berry_dark");if(!S().counters.berries.includes("berry_red")&&!inv("berry_red"))return gather("berry_red");
      for(const k of ["berry_dark","berry_red"])if(inv(k)&&!S().counters.berries.includes(k)){hold(k);act(()=>W.eat());return}}
    if(!has("ceramics")){if(NEED("clay",1))return gather("clay");const f=campFire();if(!f.lit)return lightAt(f);if(f.fuel<3)return fuel(f,3)||chop();if(f.temp<560){if(dist(f.x,f.z)>2)goTo(f.x,f.z,1.6,"fire");return}if(reach(f.x,f.z,"struct","fire",1.6)){hold("clay");act(()=>W.useHeld())}return}
    if(!inv("spear")&&inv("stick")>=2){if(NEED("flake",1))return;return craft("spear")}
    if(NEED("hide",2)&&!S().worn){if(hunt())return}
    if(inv("hide")>=2&&inv("fiber")>=2&&!S().worn)return craft("clothing");
    if(!kiln()){if(NEED("clay",4))return gather("clay");if(NEED("stone",4))return gather("stone");if(inv("kiln")){const f=campFire();if(dist(f.x-2.5,f.z+2.5)>.6)return goTo(f.x-2.5,f.z+2.5,.4,"kiln spot");W.look(Math.PI,.3);return placeHeld("kiln")}return craft("kiln")}
    // metals: collect ore first, then fire the kiln
    if(!has("smelting")||(!has("bronze")&&!inv("copper")))if(NEED("copper_ore",1)&&NEED("copper",1))return gather("copper_ore",300);
    if(!has("bronze")&&NEED("tin_ore",1)&&NEED("tin",1))return gather("tin_ore",300);
    if(has("bronze")&&!has("iron")&&NEED("iron_ore",1))return gather("iron_ore",300);
    if(has("bronze")&&!kiln().bellows&&!inv("bellows")){if(inv("hide")>=2&&inv("log")>=1)return craft("bellows");if(NEED("hide",2))return hunt()||explore("game");return chop()}
    const k=kiln();
    if(!has("iron")){if(k.fuel<6)return fuel(k,6)||chop();if(!k.lit)return lightAt(k);if(inv("bellows")&&!k.bellows){if(reach(k.x,k.z,"struct","kiln",1.6)){hold("bellows");act(()=>W.useHeld())}return}
      const want=has("bronze")?1210:1090;if(k.temp<want){if(dist(k.x,k.z)>2)goTo(k.x,k.z,1.6,"kiln");return}
      if(!reach(k.x,k.z,"struct","kiln",1.6))return;
      for(const it of ["copper_ore","tin_ore","copper","iron_ore"])if(inv(it)&&!(it==="copper"&&!inv("tin"))&&!(it==="iron_ore"&&!has("bronze"))){hold(it);act(()=>W.useHeld());return}
      return}
    // beyond iron: a stone house and a well
    if(!has("masonry")){if(NEED("stone",10))return gather("stone");if(NEED("clay",4))return gather("clay");if(NEED("log",2))return chop();if(inv("house")){const f=campFire();if(dist(f.x+7,f.z)>.8)return goTo(f.x+7,f.z,.5,"house spot");return placeHeld("house",-Math.PI/2)}return craft("house")}
    return explore("done");
  }
  function think(){
    if(P().dead){deaths++;const st=S().st,pp=P().pos;const dk=Math.round(pp.x/12)+","+Math.round(pp.z/12);deathSpots[dk]=(deathSpots[dk]||0)+1;
      if(deathSpots[dk]>=2){for(const pk of structs("pack"))if(Math.hypot(pk.x-pp.x,pk.z-pp.z)<25)black.add(bk(pk.x,pk.z));if(goal)black.add(bk(goal.x,goal.z));goal=null}ev(`DIED: ${JSON.stringify(S().counters.deathsBy)} — air ${(P().Ta??0).toFixed(1)} °C tb ${st.tb.toFixed(1)} wet ${st.wet.toFixed(2)} hunger ${st.hunger.toFixed(0)} thirst ${st.thirst.toFixed(0)} fireW ${Math.round(P().fireW||0)} shelter ${P().shelter} biome ${W.biome(pp.x,pp.z)} at ${pp.x.toFixed(1)},${pp.z.toFixed(1)} alt ${pp.y.toFixed(1)} slope ${W.slope(pp.x,pp.z).toFixed(2)} hour ${W.hourOf().toFixed(1)} weather ${S().weather.kind} goal ${goal?goal.why:"-"}`);W.respawn();goal=null;return}
    const st=S().st,h=W.hourOf(),nightTime=h>=18.6||h<6.2;
    if(P().swimming){swimT+=TICK;if(swimT>4){swimT=0;if(goal&&goal.why!=="to land")black.add(bk(goal.x,goal.z));const p=P().pos;let land=null;for(let r=3;r<200&&!land;r+=3)for(let a=0;a<24;a++){const x=p.x+Math.cos(a/24*6.283)*r,z=p.z+Math.sin(a/24*6.283)*r;if(W.height(x,z)>.6){land=[x,z];break}}
      ev(`swimming at ${P().pos.x.toFixed(0)},${P().pos.z.toFixed(0)} ground ${W.height(P().pos.x,P().pos.z).toFixed(1)} stamina ${S().st.stamina.toFixed(0)} — land ${land?land.map(v=>v.toFixed(0)):"none"}`);if(land){goal=null;goTo(land[0],land[1],1,"to land")}}if(goal&&goal.why==="to land")return}else swimT=0;
    if(goal&&goal.why!=="explore"&&simT-goal.t0>45){black.add(bk(goal.x,goal.z));ev("gave up on "+goal.why);goal=null}
    const pk=structs("pack")[0];if(pk&&(!nightTime||dist(pk.x,pk.z)<40)&&!black.has(bk(pk.x,pk.z))){if(reach(pk.x,pk.z,"struct","pack",1.2)){act(()=>W.interact());ev("recovered belongings")}return}
    if(nightTime&&st.thirst<18&&scan("water",null,50))return drink();
    if(nightTime||st.tb<35.9)return night();
    if(h>=16.5&&(!campFire()||(campFire().fuel<14&&!(inv("log")>=2)))){if(campFire()&&(inv("axe_stone")||inv("axe_copper")||inv("axe_bronze")||inv("axe_iron")))return chop();return night()}
    if(h>=16.5&&st.thirst<75&&scan("water",null,90))return drink();
    if(h>=17.8)return night();
    if(st.thirst<45)return drink();
    if(st.hunger<45&&eatBest())return;
    if(st.hunger<35){if(hunt())return;return gather("berry_dark")}
    if(st.health<35){const f=campFire();if(f){if(!f.lit&&f.fuel>0)return lightAt(f);if(dist(f.x,f.z)>2)return goTo(f.x,f.z,1.6,"rest")}}
    return progress();
  }
  let wasSw=false;
  function steer(){if(P().swimming&&!wasSw)ev(`entered water heading for ${goal?goal.why+" @"+goal.x.toFixed(0)+","+goal.z.toFixed(0):"(no goal)"} from ${P().pos.x.toFixed(0)},${P().pos.z.toFixed(0)}`);wasSw=P().swimming;
    if(!goal){W.keyUp("KeyW");W.keyUp("ShiftLeft");return}
    const d=dist(goal.x,goal.z);if(d<goal.tol){goal.why==="explore"&&ev("explored");goal=null;W.keysClear();return}
    let yaw=Math.atan2(-(goal.x-P().pos.x),-(goal.z-P().pos.z));if(detour>0){detour-=1/30;yaw+=detourDir*1.1}
    W.look(yaw,.3);W.keyDown("KeyW");if(d>18&&S().st.stamina>35&&!S().st.sprain)W.keyDown("ShiftLeft");else W.keyUp("ShiftLeft");
    if(simT-lastProg.t>2){if(lastProg.d-d<.6){stuckT++;if(!dropAhead(yaw))W.keyDown("Space");else{W.keyUp("Space");stuckT++}setTimeout0=1;detour=1.2;detourDir=Math.random()<.5?-1:1}else{stuckT=0;W.keyUp("Space")}lastProg={t:simT,d}}
    if(stuckT>6){black.add(bk(goal.x,goal.z));ev("stuck — gave up on "+goal.why);goal=null;stuckT=0;W.keysClear()}}
  let detourDir=1,setTimeout0=0;
  const t0=performance.now();
  while(simT<maxSim){
    think();
    const ran=W.sim(TICK,(dt,i)=>{steer()});simT+=TICK;
    if(W.player.dead&&ran<TICK-1e-6){/* died mid-tick */}
    // record
    const st=S().st;minTb.v=Math.min(minTb.v,st.tb);
    if(S().disc.length>lastDisc){for(const id of S().disc.slice(lastDisc)){mark(id);ev("DISCOVERED "+id)}lastDisc=S().disc.length}
    const d=Math.floor(dayF()+8/24-6.5/24);if(d>lastDay&&!P().dead){nightsSurvived++;lastDay=d;mark("night "+d+" survived");ev(`dawn ${d}: health ${st.health.toFixed(0)} tb ${st.tb.toFixed(1)} hunger ${st.hunger.toFixed(0)} thirst ${st.thirst.toFixed(0)}`)}
    if(Math.round(simT/TICK)%240===0)trace.push({x:Math.round(P().pos.x),z:Math.round(P().pos.z),sw:P().swimming?1:0,t:Math.round(simT),day:+dayF().toFixed(2),hour:+W.hourOf().toFixed(1),hp:+st.health.toFixed(0),hu:+st.hunger.toFixed(0),th:+st.thirst.toFixed(0),tb:+st.tb.toFixed(1),disc:S().disc.length,goal:goal?.why||"-"});
    if(has("masonry")&&has("iron"))break;
    if(opts.stopAt&&has(opts.stopAt))break;
  }
  W.keysClear();W.crouch(false);
  return {seed,simSeconds:Math.round(simT),gameDays:+dayF().toFixed(2),computeMs:Math.round(performance.now()-t0),milestones:ms,discoveries:S().disc.slice(),deaths,deathsBy:S().counters.deathsBy,
    nightsSurvived,setbacks:S().counters.setbacks||0,setbacksBy:S().counters.setbacksBy||{},rescues:S().counters.rescues||0,packs:S().counters.packs,wolvesKilled:S().counters.wolvesKilled,warnings:S().counters.warnings||0,sick:S().counters.sick,minBodyTemp:+minTb.v.toFixed(2),actions,inv:{...S().inv},trace,events};
}
}
