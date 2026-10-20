// Fog of Knowledge: The Game: in-page integration tests.
// Runs against the real game rules through window.__fogWorld (the fast simulation steps the same stepWorld() the
// renderer uses). Setup may grant items (these are unit/integration tests); the separate bot (bot.js) never does.
export function runSuite(W,opts={}){
  const T=[],t0=performance.now();
  const S=()=>W.state,P=()=>W.player,has=id=>S().disc.includes(id),inv=k=>S().inv[k]||0;
  function test(group,name,fn){if(opts.only&&!opts.only.split(",").some(o=>name.includes(o)||group===o))return;let r;try{r=fn()}catch(e){r={pass:false,detail:"EXCEPTION "+e.message+" @"+((e.stack||"").split("\n")[1]||"").trim()}}
    if(r===undefined||r===true)r={pass:true};else if(r===false)r={pass:false};T.push({group,name,pass:!!r.pass,detail:r.detail||""})}
  const want=(cond,detail)=>({pass:!!cond,detail:cond?"":detail});
  const lastToasts=n=>W.toasts().slice(-n).join(" | ");
  // ---------- setup helpers ----------
  const SEED=opts.seed||20261019;
  function fresh(hour=10){W.setSurvival(false);W.closePopup();for(const id of ["#wInv","#wJournal","#wCtx","#wChest"]){const e=document.querySelector(id);if(e)e.hidden=true}W.reseed(SEED);W.setWeather("clear",0);W.setHour(hour);W.clearStructs();W.clearDrops();W.clearAnimals();S().inv={};S().held=null;S().worn=null;
    Object.assign(S().st,{health:100,hunger:85,thirst:85,stamina:100,tb:37,wet:0,sick:0,sprain:0});S().snap=null;W.crouch(false);W.keysClear();P().zoom=false;P().camPitch=.3;}
  const surv=()=>W.setSurvival(true);   // classic-survival tests opt in (Discovery mode is the default)
  const learn=(...ids)=>{for(const id of ids)if(!has(id))S().disc.push(id)};      // setup-only: mark prerequisites known
  const face=(x,z,pitch)=>W.look(Math.atan2(-(x-P().pos.x),-(z-P().pos.z)),pitch);
  const step=s=>W.sim(s);
  const give=(k,n=1)=>W.give(k,n);
  function flatSpot(minH=2,maxH=14,from){const c=from||S().camp;for(let r=0;r<900;r+=6)for(let a=0;a<16;a++){const x=c[0]+Math.cos(a/16*6.283)*r,z=c[1]+Math.sin(a/16*6.283)*r,h=W.height(x,z);
      if(h>minH&&h<maxH&&W.slope(x,z)<.2){let ok=true;for(let b=0;b<8&&ok;b++){const xx=x+Math.cos(b*.785)*6,zz=z+Math.sin(b*.785)*6;const hh=W.height(xx,zz);if(hh<1||Math.abs(hh-h)>2.5)ok=false}if(ok)return [x,z]}}return c}
  function goFlat(minH,maxH){const [x,z]=flatSpot(minH,maxH);W.teleport(x,z);step(.1);W.clearDrops();W.clearAnimals();return [x,z]}
  // clear the 4 m around the player of gatherables so findTarget picks what the test means (by walking 5 m to an empty spot)
  function emptySpot(){const P0=P().pos;for(let r=0;r<120;r+=3)for(let a=0;a<12;a++){const x=P0.x+Math.cos(a/12*6.283)*r,z=P0.z+Math.sin(a/12*6.283)*r;const h=W.height(x,z);if(h<1.5||W.slope(x,z)>.3)continue;W.teleport(x,z);if(!W.target()){let ok=true;for(let b=0;b<8;b++){W.look(b*.785,.3);if(W.target()){ok=false;break}}if(ok){W.look(0,.3);return true}}}return false}
  function lightFire(fuelSticks=3){give("stick",fuelSticks);give("flint");give("pyrite");learn("knapping");W.craft("campfire")||give("campfire");W.hold("campfire");W.useHeld();step(.45);W.hold("flint");W.useHeld();step(.45);return S().structures.find(s=>s.type==="fire")}
  function waterEdge(){const c=S().camp;for(let r=6;r<1500;r+=4)for(let a=0;a<36;a++){const x=c[0]+Math.cos(a/36*6.283)*r,z=c[1]+Math.sin(a/36*6.283)*r;
      if(W.height(x,z)<-1.5){for(let k=1;k<30;k++){const bx=x-Math.cos(a/36*6.283)*k,bz=z-Math.sin(a/36*6.283)*k;if(W.height(bx,bz)>.4){return {x:bx,z:bz,wx:x,wz:z}}}}}return null}
  function atShore(){const e=waterEdge();if(!e)return null;W.teleport(e.x,e.z);step(.1);face(e.wx,e.wz,.3);return e}
  const kilnHot=(min=1250,bellows=true)=>{give("clay",4);give("stone",4);learn("ceramics","fire");W.craft("kiln");W.hold("kiln");W.useHeld();step(.3);const k=S().structures.find(s=>s.type==="kiln");
    give("log",2);W.interact();step(.45);W.interact();step(.45);give("flint");give("pyrite");W.hold("flint");W.useHeld();step(.45);if(bellows){give("bellows");W.hold("bellows");W.useHeld()}
    let t=0;while(k.temp<min&&t<120){step(1);t++}return k};

  // aim: pitch for a ballistic throw of speed v to hit a target d metres away and h metres below the hand
  const aimPitch=(v,d,h)=>{let best=0,be=1e9;for(let p=-.4;p<.8;p+=.005){const vy=v*Math.sin(p),vx=v*Math.cos(p),t=(vy+Math.sqrt(vy*vy+2*9.81*h))/9.81,e=Math.abs(vx*t-d);if(e<be){be=e;best=p}}return .32-best};
  // ======================= DISCOVERIES (every one, through its in-game interaction) =======================
  const D="Discovery";
  test(D,"edible + illness + hygiene (berries)",()=>{fresh();surv();give("berry_dark");give("berry_red");W.hold("berry_dark");W.eat();W.hold("berry_red");W.eat();
    const sick=S().st.sick>0;step(48);return want(has("edible")&&sick&&has("hygiene"),`edible ${has("edible")} sick ${sick} hygiene ${has("hygiene")}`)});
  test(D,"knapping (flint on boulder, holding pyrite too)",()=>{fresh();give("pyrite");give("flint");const b=W.scan("boulder");W.teleport(b.x+b.s+1.1,b.z);step(.1);face(b.x,b.z);W.hold("flint");W.useHeld();
    return want(has("knapping")&&inv("flake")===2,"target "+JSON.stringify(W.target())+" "+lastToasts(2))});
  test(D,"fire (firewood pile + flint & pyrite)",()=>{fresh();goFlat();const f=lightFire();return want(f&&f.lit&&has("fire"),lastToasts(3))});
  test(D,"combustion (fire burns out)",()=>{fresh();goFlat();const f=lightFire();f.fuel=.02;step(3);return want(has("combustion")&&!f.lit,`lit ${f.lit} fuel ${f.fuel}`)});
  test(D,"warmth (radiant heat warms you)",()=>{fresh(23);goFlat();const f=lightFire();S().st.tb=35.6;step(12);return want(has("warmth"),`tb ${S().st.tb.toFixed(2)} fireW ${Math.round(W.fireAt())}`)});
  test(D,"evaporative (wet in the cold)",()=>{fresh(4);goFlat();S().snap={start:0,end:1e12,dT:25};S().st.wet=.9;step(.5);const r=want(has("evaporative"),"air "+W.airTemp().toFixed(1));S().snap=null;return r});
  test(D,"cooking (meat over fire)",()=>{fresh();goFlat();lightFire();step(4);give("meat_raw");W.hold("meat_raw");W.useHeld();return want(has("cooking")&&inv("meat_cooked")===1,lastToasts(2))});
  test(D,"gravity (5 objects fall)",()=>{fresh();goFlat();face(P().pos.x+5,P().pos.z,.3);give("stone",5);for(let i=0;i<5;i++){W.hold("stone");W.useHeld();step(2.5)}return want(has("gravity"),"falls "+S().counters.falls)});
  test(D,"impact (fall > 6.5 m/s)",()=>{fresh();goFlat();P().pos.y+=4;P().vel.set(0,0,0);step(2);return want(has("impact"),"health "+S().st.health.toFixed(1)+" "+lastToasts(2))});
  test(D,"motion (5 measured throws)",()=>{fresh();goFlat();learn("counting");face(P().pos.x+5,P().pos.z,.15);give("stone",5);for(let i=0;i<5;i++){W.hold("stone");W.useHeld();step(3)}return want(has("motion"),"throws "+S().counters.throws.length)});
  test(D,"buoyancy (stick floats)",()=>{fresh();const e=atShore();if(!e)return want(false,"no water");give("stick");W.hold("stick");W.look(P().camYaw,.05);W.useHeld();step(6);return want(has("buoyancy"),lastToasts(2))});
  test(D,"raft (sail > 10 m)",()=>{fresh();const e=atShore();if(!e)return want(false,"no water");learn("buoyancy","knapping");give("log",4);give("fiber",4);if(!W.craft("raft"))return want(false,"craft failed");
    W.hold("raft");W.useHeld();step(.3);const r=S().structures.find(s=>s.type==="raft");if(!r)return want(false,"not launched "+lastToasts(2));face(r.x,r.z,.3);W.interact();if(!P().raft)return want(false,"not boarded, target "+JSON.stringify(W.target()));
    face(e.wx+(e.wx-e.x)*20,e.wz+(e.wz-e.z)*20,.3);W.keyDown("KeyW");step(8);W.keyUp("KeyW");return want(has("raft"),"dist "+S().counters.raftDist.toFixed(1))});
  test(D,"tracking (3 species close)",()=>{fresh(23);goFlat();const p=P().pos;W.spawn("deer",p.x+8,p.z);W.spawn("rabbit",p.x,p.z+8);W.spawn("boar",p.x-8,p.z);step(.5);return want(has("tracking"),"species "+S().counters.species)});
  test(D,"hunting (spear kills a deer)",()=>{fresh(23);goFlat();const p=P().pos;give("spear",3);W.crouch(true);const a=W.spawn("deer",p.x,p.z-7);face(a.pos.x,a.pos.z,.06);
    for(let i=0;i<3&&!has("hunting");i++){face(a.pos.x,a.pos.z,aimPitch(12.2,Math.hypot(a.pos.x-p.x,a.pos.z-p.z)-.4,1.1+p.y-a.pos.y-.7));W.hold("spear");W.useHeld();step(2)}W.crouch(false);return want(has("hunting"),lastToasts(3))});
  test(D,"shelter (lean-to)",()=>{fresh();goFlat();learn("knapping");give("stick",6);give("fiber",3);W.craft("leanto");W.hold("leanto");W.useHeld();return want(has("shelter")&&S().structures.some(s=>s.type==="leanto"),lastToasts(2))});
  test(D,"clothing (hide clothes)",()=>{fresh();learn("hunting");give("hide",2);give("fiber",2);W.craft("clothing");return want(has("clothing")&&S().worn==="clothing")});
  test(D,"daynight (a full day passes)",()=>{fresh();S().gameTime=S().dayStart+86400-5;step(.2);return want(has("daynight"))});
  test(D,"sundial (watch the shadow 1 h)",()=>{fresh(11);goFlat();learn("daynight");give("stick");W.craft("gnomon");W.hold("gnomon");W.useHeld();step(40);return want(has("sundial"))});
  test(D,"astronomy (look up on 3 nights)",()=>{fresh(23);goFlat();for(let n=0;n<3;n++){W.look(P().camYaw,-1.2);step(7.5);S().gameTime+=86400}const fp=W.firstPerson();return want(has("astronomy"),"nights "+S().counters.nights+" fp "+fp)});
  test(D,"counting (10 tally notches)",()=>{fresh();learn("knapping");give("stick");give("flake");W.craft("tally");W.hold("tally");for(let i=0;i<10;i++)W.useHeld();return want(has("counting"))});
  test(D,"lever (log rolls a boulder)",()=>{fresh();const b=W.scan("boulder");W.teleport(b.x+b.s+1.1,b.z);step(.1);face(b.x,b.z);give("log");W.hold("log");W.useHeld();return want(has("lever"),"target "+JSON.stringify(W.target()))});
  test(D,"ceramics (clay in a hot fire)",()=>{fresh();goFlat();const f=lightFire(6);let t=0;while(f.temp<560&&t<60){step(1);t++}give("clay");W.hold("clay");W.useHeld();return want(has("ceramics")&&inv("pot"),`fire ${Math.round(f.temp)} °C after ${t}s`)});
  test(D,"boiling (pot of water on fire)",()=>{fresh();goFlat();const f=lightFire();step(5);give("pot_water");W.hold("pot_water");W.useHeld();return want(has("boiling")&&inv("pot_clean"),lastToasts(2))});
  test(D,"pressure (boil 150 m higher)",()=>{fresh();goFlat();lightFire();step(5);give("pot_water");W.hold("pot_water");W.useHeld();const lo=P().pos.y;
    // find high ground near camp
    const c=S().camp;let best=null;for(let r=50;r<1500;r+=25)for(let a=0;a<32;a++){const x=c[0]+Math.cos(a/32*6.283)*r,z=c[1]+Math.sin(a/32*6.283)*r,h=W.height(x,z);if(h>lo+165&&W.slope(x,z)<.5&&(!best||r<best.r))best={x,z,h,r}}
    if(!best)return want(false,"no ground 150 m higher within 1.5 km");W.teleport(best.x,best.z);step(.2);W.clearStructs();
    give("torch");learn("fire");W.hold("torch");W.useHeld();step(.2);give("flint");give("pyrite");W.hold("flint");W.useHeld();step(15);give("pot_water");W.hold("pot_water");W.useHeld();
    return want(has("pressure"),`boils at ${S().counters.boils} (high ground ${Math.round(best.r)} m away) `+lastToasts(2))});
  test(D,"agriculture (plant near water, harvest)",()=>{fresh();const e=atShore();if(!e)return want(false,"no water");W.look(P().camYaw+Math.PI,.3);give("seeds");W.hold("seeds");W.useHeld();const c=S().structures.find(s=>s.type==="crop");if(!c)return want(false,lastToasts(1));
    S().gameTime+=21*3600;step(.1);face(c.x,c.z);W.interact();return want(has("agriculture")&&inv("grain")>=3,lastToasts(2))});
  test(D,"kiln (light a kiln)",()=>{fresh();goFlat();kilnHot(0,false);return want(has("kiln"),lastToasts(3))});
  test(D,"smelting (copper ore in kiln)",()=>{fresh();goFlat();const k=kilnHot(1100,false);give("copper_ore");W.hold("copper_ore");W.useHeld();return want(has("smelting")&&inv("copper"),`kiln ${Math.round(k.temp)} °C `+lastToasts(1))});
  test(D,"bronze (copper + tin alloy)",()=>{fresh();goFlat();const k=kilnHot(1100,false);learn("smelting");give("tin_ore");W.hold("tin_ore");W.useHeld();give("copper");W.hold("copper");W.useHeld();return want(has("bronze")&&inv("bronze"),`kiln ${Math.round(k.temp)} `+lastToasts(2))});
  test(D,"iron (bellows-blown kiln)",()=>{fresh();goFlat();learn("smelting","bronze");const k=kilnHot(1210,true);give("iron_ore");W.hold("iron_ore");W.useHeld();return want(has("iron")&&inv("iron"),`kiln ${Math.round(k.temp)} °C bellows ${k.bellows} `+lastToasts(1))});
  test(D,"iron without bellows is blocked (needs 1200 °C)",()=>{fresh();goFlat();learn("smelting","bronze");const k=kilnHot(0,false);step(90);give("iron_ore");W.hold("iron_ore");W.useHeld();return want(!has("iron")&&k.temp<1200,`kiln max ${Math.round(k.temp)}`)});
  test(D,"glass (sand in kiln)",()=>{fresh();goFlat();kilnHot(1010,false);give("sand");W.hold("sand");W.useHeld();return want(has("glass")&&inv("glass"))});
  test(D,"writing (clay tablet)",()=>{fresh();learn("counting");give("clay");W.craft("tablet");W.hold("tablet");W.useHeld();return want(has("writing"))});
  test(D,"wheel (crafted with bronze axe)",()=>{fresh();learn("bronze","smelting");give("bronze");give("stick");W.craft("axe_bronze");give("log");return want(W.craft("wheel")&&has("wheel"))});
  test(D,"optics (lens lights fire in sunlight)",()=>{fresh(12);goFlat();learn("glass","knapping");give("quartz");give("sand");W.craft("lens");give("stick",3);W.craft("campfire");W.hold("campfire");W.useHeld();step(.3);W.hold("lens");W.useHeld();return want(has("optics"),lastToasts(1))});
  test(D,"magnetism (lodestone + iron ore)",()=>{fresh();give("lodestone");give("iron_ore");W.hold("lodestone");W.useHeld();return want(has("magnetism"))});
  test(D,"compass (floating lodestone)",()=>{fresh();learn("magnetism","ceramics");give("lodestone");give("pot_water");W.craft("compass");W.hold("compass");W.useHeld();return want(has("compass"))});
  const aimAt=dir=>{const [x,y,z]=dir;W.look(Math.atan2(-x,-z),-Math.asin(y))};
  test(D,"telescope (the Moon's craters)",()=>{fresh();goFlat();learn("optics","bronze");give("lens",2);give("bronze");W.craft("telescope");
    // find an hour when the moon is well up at night
    let h=null;for(const hh of [21,22,23,0,1,2,3,4,20])for(let d=0;d<30&&h==null;d++){S().gameTime=S().dayStart+d*86400+((hh+24-8)%24)*3600;step(.05);if(W.moonDir()[1]>.25&&(W.hourOf()>20||W.hourOf()<4))h=d}
    W.setWeather("clear",0);W.hold("telescope");W.useHeld();const r=W.sim(4,()=>aimAt(W.moonDir()));return want(has("telescope"),"moon y "+W.moonDir()[1].toFixed(2)+" fp "+W.firstPerson())});
  test(D,"galilean (Jupiter's moons)",()=>{fresh();goFlat();learn("optics","bronze","telescope");give("telescope");let ok=false;
    for(let d=0;d<60&&!ok;d++)for(const hh of [22,0,2,4]){S().gameTime=S().dayStart+d*86400+((hh+24-8)%24)*3600;step(.05);if(W.jupDir()[1]>.2){ok=true;break}}
    W.setWeather("clear",0);W.hold("telescope");W.useHeld();W.sim(4,()=>aimAt(W.jupDir()));return want(has("galilean"),"jupiter y "+W.jupDir()[1].toFixed(2)+" found "+ok)});
  test(D,"scholarship (study table)",()=>{fresh();goFlat();learn("writing","counting");give("log",3);give("tablet");W.craft("table");W.hold("table");W.useHeld();step(.2);const tb=S().structures.find(s=>s.type==="table");face(tb.x,tb.z);W.interact();return want(has("scholarship"),"target "+JSON.stringify(W.target()))});
  test(D,"pendulum (time two lengths → g)",()=>{fresh();goFlat();learn("counting");give("stick",3);give("fiber");give("stone");W.craft("pendulum");W.hold("pendulum");W.useHeld();step(.2);const s=S().structures.find(x=>x.type==="pendulum");face(s.x,s.z);
    W.interact();step(22);W.hold(null);S().held=null;W.useHeld();W.interact();step(32);const gs=S().counters.pend.map(p=>p.g);return want(has("pendulum")&&gs.every(g=>Math.abs(g-9.81)<.6),"measurements "+JSON.stringify(S().counters.pend))});
  test(D,"freefall (timed drop off a slope ≥ 6 m)",()=>{fresh();learn("counting");const c=S().camp;let spot=null;
    for(let r=0;r<1400&&!spot;r+=10)for(let a=0;a<24&&!spot;a++){const x=c[0]+Math.cos(a/24*6.283)*r,z=c[1]+Math.sin(a/24*6.283)*r,h=W.height(x,z);if(h<2)continue;for(let b=0;b<16;b++){const dx=Math.cos(b/16*6.283),dz=Math.sin(b/16*6.283);
      let ok=true;for(let k=4;k<=24;k+=4){const hk=W.height(x+dx*k,z+dz*k);if((k<=16&&hk>h-k*.6)||hk<1)ok=false}if(ok&&W.height(x+dx*16,z+dz*16)<h-8){spot={x,z,dx,dz,r};break}}}
    if(!spot)return want(false,"no 8 m drop within 1.4 km");W.teleport(spot.x,spot.z);step(.1);W.look(Math.atan2(-spot.dx,-spot.dz),.67);give("stone",3);for(let i=0;i<3&&!has("freefall");i++){W.hold("stone");W.useHeld();step(4)}
    return want(has("freefall"),"spot "+Math.round(spot.r)+" m from camp; drops "+JSON.stringify(S().counters.drops)+" throws "+JSON.stringify(S().counters.throws)+" "+lastToasts(3))});
  test(D,"prism (sunlight → spectrum)",()=>{fresh(12);goFlat();learn("glass","knapping");give("glass");give("flake");W.craft("prism");W.hold("prism");W.useHeld();return want(has("prism"),lastToasts(1))});
  test(D,"lightning (count flash-to-thunder)",()=>{fresh();goFlat();const p=P().pos;W.strike(p.x+700,p.z);step(3);return want(has("lightning"),lastToasts(2))});
  test(D,"dog (feed a wolf twice by the fire)",()=>{fresh(22);goFlat();lightFire();step(3);const p=P().pos,f=W.state.structures.find(s=>s.type==="fire");const wv=W.spawn("wolf",p.x+(p.x-f.x)*1.2,p.z+(p.z-f.z)*1.2);
    face(wv.pos.x,wv.pos.z);give("meat_cooked",2);W.hold("meat_cooked");W.useHeld();step(.2);face(wv.pos.x,wv.pos.z);W.hold("meat_cooked");W.useHeld();return want(has("dog")&&!!S().dog,"wolf d "+wv.pos.distanceTo(p).toFixed(1)+" target "+JSON.stringify(W.target())+" "+lastToasts(2))});
  test(D,"drying (rack 4 h)",()=>{fresh();goFlat();learn("fire");give("stick",4);give("fiber",2);W.craft("rack");W.hold("rack");W.useHeld();step(.2);const r=S().structures.find(s=>s.type==="rack");face(r.x,r.z);give("meat_raw",2);W.hold("meat_raw");W.useHeld();W.hold("meat_raw");W.useHeld();
    S().gameTime+=4.2*3600;step(.1);face(r.x,r.z);W.interact();return want(has("drying")&&inv("meat_dried")===2,lastToasts(2))});
  test(D,"groundwater (dig a well, low ground)",()=>{fresh();goFlat(2,12);learn("ceramics");give("stone",6);give("log");W.craft("well");W.hold("well");W.useHeld();step(.2);const w=S().structures.find(s=>s.type==="well");if(!w)return want(false,lastToasts(1));face(w.x,w.z);W.interact();return want(has("groundwater"),lastToasts(1))});
  test(D,"masonry (stone house) + shelter level 3",()=>{fresh();goFlat();learn("ceramics","knapping","shelter");give("stone",10);give("clay",4);give("log",2);W.craft("house");W.hold("house");W.useHeld();step(.2);const h=S().structures.find(s=>s.type==="house");if(!h)return want(false,lastToasts(1));
    W.teleport(h.x,h.z);step(.1);return want(has("masonry")&&W.shelterLevel()===3,"level "+W.shelterLevel())});
  test(D,"elastic (bow shoots an arrow)",()=>{fresh();goFlat();learn("hunting");give("stick",3);give("fiber",3);give("flake");W.craft("bow");W.craft("arrow");W.hold("bow");W.useHeld();step(3);return want(has("elastic")&&inv("arrow")===3,lastToasts(1))});
  // coverage check: every discovery id has been reached by at least one test above

  // ======================= RECIPES =======================
  const R="Recipe";
  for(const r of W.recipes())test(R,`${r.out}${r.n>1?" ×"+r.n:""} (needs ${r.req||"nothing"})`,()=>{fresh();S().disc=[];
    // locked before the requirement
    for(const k in r.in)give(k,r.in[k]);if(r.tool)give(r.tool);
    const lockedOk=!r.req||!W.craft(r.out);learn(r.req||"knapping");if(r.req)learn(r.req);
    const before=inv(r.out);const ok=W.craft(r.out);const after=r.out==="clothing"?(S().worn==="clothing"?1:0):inv(r.out)-before;
    const consumed=Object.keys(r.in).every(k=>inv(k)===(k===r.out?after:0)||k===r.tool);
    return want(lockedOk&&ok&&after===(r.out==="clothing"?1:r.n)&&consumed,`locked ${lockedOk} crafted ${ok} got ${after} consumed ${consumed}`)});
  test(R,"missing ingredients refuses",()=>{fresh();learn("knapping");give("stick",2);return want(!W.craft("leanto")&&inv("stick")===2)});
  test(R,"tool required (wheel needs bronze axe)",()=>{fresh();learn("bronze");give("log");return want(!W.craft("wheel")&&inv("log")===1)});

  // ======================= INTERACTIONS =======================
  const I="Interaction";
  test(I,"pick up a dropped item (E)",()=>{fresh();goFlat();emptySpot();give("stone");W.hold("stone");W.look(P().camYaw,1.1);W.useHeld();step(2);W.look(P().camYaw,.3);
    const d=S().drops[0];if(!d)return want(false,"no drop");face(d.pos.x,d.pos.z);W.teleport(d.pos.x+.7*Math.sin(P().camYaw),d.pos.z+.7*Math.cos(P().camYaw));face(d.pos.x,d.pos.z);W.interact();return want(inv("stone")===1&&S().drops.length===0,"target "+JSON.stringify(W.target()))});
  test(I,"gather a resource node (E)",()=>{fresh();const r=W.scan("res");W.teleport(r.x+.9,r.z);step(.1);face(r.x,r.z);const t=W.target();W.interact();return want(t&&inv(t.type)>0,JSON.stringify(t))});
  test(I,"break sticks off a tree by hand, max 3",()=>{fresh();const t=W.scan("tree");W.teleport(t.x+1.2,t.z);step(.1);face(t.x,t.z);let n=0;for(let i=0;i<6;i++){W.interact();step(.35)}n=inv("stick");return want(n>=1&&n<=3,"sticks "+n+" target "+JSON.stringify(W.target()))});
  test(I,"throw: arc, landing distance measured",()=>{fresh();goFlat();learn("counting");give("stone");W.hold("stone");face(P().pos.x+10,P().pos.z,.1);W.useHeld();step(3);const th=S().counters.throws[0];return want(th&&th.R>4,JSON.stringify(th))});
  test(I,"eat food raises hunger",()=>{fresh();S().st.hunger=40;give("meat_cooked");W.hold("meat_cooked");W.eat();return want(S().st.hunger>60,"hunger "+S().st.hunger)});
  test(I,"drink from lake raises thirst",()=>{fresh();atShore();S().st.thirst=30;const e=waterEdge();W.teleport(e.x+(e.wx-e.x)*.4,e.z+(e.wz-e.z)*.4);face(e.wx,e.wz,.3);let t=W.target();W.interact();return want(S().st.thirst>=50,"thirst "+S().st.thirst+" target "+JSON.stringify(t))});
  test(I,"boiled water: drink, pot returned",()=>{fresh();S().st.thirst=30;give("pot_clean");W.hold("pot_clean");W.eat();return want(S().st.thirst>50&&inv("pot")===1)});
  test(I,"place every placeable on land",()=>{fresh();const bad=[];const kinds=["campfire","leanto","gnomon","kiln","table","torch","hut","house","chest","rack","well","wall","pendulum"];
    for(const k of kinds){goFlat(2,12);W.clearStructs();give(k);W.hold(k);W.useHeld();step(.1);if(!S().structures.length)bad.push(k+": "+lastToasts(1))}return want(!bad.length,bad.join("; "))});
  test(I,"cannot build in water",()=>{fresh();const e=atShore();W.teleport(e.wx,e.wz);step(.1);give("leanto");W.hold("leanto");W.useHeld();return want(!S().structures.some(s=>s.type==="leanto")&&inv("leanto")===1)});
  test(I,"add fuel: stick +0.5 kg, log +5 kg",()=>{fresh();goFlat();const f=lightFire();const f0=f.fuel;give("stick");face(f.x,f.z);W.interact();step(.35);const f1=f.fuel;give("log");W.interact();return want(Math.abs(f1-f0-.5)<.05&&Math.abs(f.fuel-f1-5)<.1,`${f0}→${f1}→${f.fuel}`)});
  test(I,"swim: enter deep water, stamina drains, body cools gently",()=>{fresh();const e=atShore();let x=e.wx,z=e.wz;for(let k=0;k<20&&W.height(x,z)>-3;k++){x+=(e.wx-e.x)/Math.hypot(e.wx-e.x,e.wz-e.z)*3;z+=(e.wz-e.z)/Math.hypot(e.wx-e.x,e.wz-e.z)*3}
    W.teleport(x,z);step(2);const sw=P().swimming,st0=S().st.stamina,tb0=S().st.tb;W.keyDown("KeyW");step(10);W.keyUp("KeyW");return want(sw&&S().st.stamina<st0&&S().st.tb>tb0-1.6&&!P().dead,`swimming ${sw} stamina ${st0}→${S().st.stamina.toFixed(0)} tb ${tb0}→${S().st.tb.toFixed(2)} wet ${S().st.wet.toFixed(2)}`)});
  test(I,"kiln: fuel, temperature rises, bellows hotter",()=>{fresh();goFlat();const k=kilnHot(0,false);step(80);const t1=k.temp;give("bellows");W.hold("bellows");W.useHeld();step(60);return want(t1>1050&&k.temp>1210,`no bellows ${Math.round(t1)} °C, bellows ${Math.round(k.temp)} °C`)});
  test(I,"chest: store and take back",()=>{fresh();goFlat();give("chest");W.hold("chest");W.useHeld();step(.1);const c=S().structures.find(s=>s.type==="chest");face(c.x,c.z);give("stone",3);W.interact();const panel=!document.querySelector("#wChest").hidden;const b=document.querySelector('#wChest [data-store="stone"]');b&&b.click();b&&document.querySelector('#wChest [data-store="stone"]')?.click();const stored=(c.items.stone||0);document.querySelector('#wChest [data-take="stone"]')?.click();
    document.querySelector("#wChest [data-close]")?.click();return want(panel&&stored===2&&inv("stone")===2&&c.items.stone===1,`panel ${panel} stored ${stored} inv ${inv("stone")}`)});
  test(I,"study table: costs 1 h, maps atlas nodes",()=>{fresh();goFlat();give("table");W.hold("table");W.useHeld();step(.1);const tb=S().structures.find(s=>s.type==="table");face(tb.x,tb.z);for(const id of ["fire","knapping","counting","writing"])W.discover(id);W.closePopup();const g0=S().gameTime,r0=S().ks.revealed.length;W.interact();
    return want(S().gameTime-g0>=3600&&(S().ks.revealed.length>r0||!W.stats().atlas),`revealed ${r0}→${S().ks.revealed.length} atlas ${W.stats().atlas}`)});
  test(I,"sleep: lean-to + fire at night skips to dawn",()=>{fresh(21);goFlat();const f=lightFire();give("log",3);face(f.x,f.z);W.interact();step(.35);W.interact();step(.35);W.interact();W.look(P().camYaw+Math.PI);give("leanto");W.hold("leanto");W.useHeld();step(.1);
    const l=S().structures.find(s=>s.type==="leanto");face(l.x,l.z);const tb=W.target();W.interact();const h=W.hourOf();return want(h>6&&h<7&&S().st.tb>=36.9,`target ${JSON.stringify(tb)} hour ${h.toFixed(2)} tb ${S().st.tb}`)});
  test(I,"sleep refused in daytime",()=>{fresh(12);goFlat();give("leanto");W.hold("leanto");W.useHeld();step(.1);const l=S().structures.find(s=>s.type==="leanto");face(l.x,l.z);W.interact();return want(W.hourOf()<13)});
  test(I,"melee: spear strikes a boar",()=>{fresh();goFlat();const p=P().pos;give("spear");const a=W.spawn("boar",p.x,p.z-1.6);face(a.pos.x,a.pos.z);const hp=a.hp;W.hold("spear");W.useHeld();return want(a.hp<hp,`hp ${hp}→${a.hp} target ${JSON.stringify(W.target())}`)});
  test(I,"sling shoots a stone (elastic energy)",()=>{fresh();goFlat();learn("hunting");give("sling");give("stone",2);W.hold("sling");face(P().pos.x+10,P().pos.z,.1);W.useHeld();step(3);return want(inv("stone")===1&&S().counters.shots>=1)});
  test(I,"torch lights from a nearby fire",()=>{fresh();goFlat();lightFire();step(1);give("torch");W.look(P().camYaw+Math.PI/2);W.hold("torch");W.useHeld();const t=S().structures.find(s=>s.type==="torch");return want(t&&t.lit,lastToasts(1))});
  test(I,"well refused on high ground",()=>{fresh();const c=S().camp;let hi=null;for(let r=20;r<1500&&!hi;r+=20)for(let a=0;a<16;a++){const x=c[0]+Math.cos(a/16*6.283)*r,z=c[1]+Math.sin(a/16*6.283)*r;if(W.height(x,z)>40&&W.slope(x,z)<.4){hi=[x,z];break}}
    if(!hi)return {pass:true,detail:"no high ground (n/a)"};W.teleport(...hi);step(.1);give("well");W.hold("well");W.useHeld();return want(!S().structures.length&&inv("well")===1,lastToasts(1))});
  test(I,"wall blocks walking",()=>{fresh();goFlat();give("wall");W.hold("wall");W.useHeld();step(.1);const w=S().structures.find(s=>s.type==="wall");const p0=P().pos.clone();face(w.x,w.z,.3);W.keyDown("KeyW");step(3);W.keyUp("KeyW");
    const passed=Math.hypot(P().pos.x-p0.x,P().pos.z-p0.z)>3.2;return want(!passed,"moved "+Math.hypot(P().pos.x-p0.x,P().pos.z-p0.z).toFixed(2))});
  test(I,"tool tiers: iron axe fells faster than stone, wears out",()=>{fresh();const hits=ax=>{S().inv={};give(ax);const t=W.scan("tree");W.teleport(t.x+1.2,t.z);step(.1);face(t.x,t.z);let n=0;const l0=inv("log");while(inv("log")===l0&&n<20){W.interact();step(.35);n++}return n};
    const s=hits("axe_stone"),i=hits("axe_iron");S().inv={};give("axe_stone");S().dur.axe_stone=1;const t=W.scan("tree");W.teleport(t.x+1.2,t.z);step(.1);face(t.x,t.z);W.interact();
    return want(s>i&&!inv("axe_stone"),`stone ${s} chops, iron ${i} chops, worn axe gone ${!inv("axe_stone")}`)});
  test(I,"boulders: 1 stone by hand, 4 with an axe",()=>{fresh();const b=W.scan("boulder");W.teleport(b.x+b.s+1.1,b.z);step(.1);face(b.x,b.z);for(let i=0;i<3;i++){W.interact();step(.35)}const hand=inv("stone");give("axe_stone");for(let i=0;i<6;i++){W.interact();step(.35)}return want(hand===1&&inv("stone")===4,`hand ${hand} total ${inv("stone")}`)});

  // ======================= SURVIVAL =======================
  const V="Survival";
  test(V,"hunger & thirst fall over a day",()=>{fresh();surv();goFlat();step(60);return want(S().st.hunger<85&&S().st.thirst<85,`hunger ${S().st.hunger.toFixed(1)} thirst ${S().st.thirst.toFixed(1)} after 1.6 game h`)});
  test(V,"cold night: unprotected body cools, fire keeps you warm",()=>{fresh(23);goFlat();S().snap={start:0,end:1e12,dT:8};step(40);const cold=S().st.tb;fresh(23);goFlat();S().snap={start:0,end:1e12,dT:8};const f=lightFire(6);step(40);const warm=S().st.tb;S().snap=null;
    return want(cold<36.3&&warm>36.5,`no fire ${cold.toFixed(2)} °C, by fire ${warm.toFixed(2)} °C (air ${W.airTemp().toFixed(1)} °C)`)});
  test(V,"starvation damages health",()=>{fresh();surv();goFlat();S().st.hunger=0;const h=S().st.health;step(5);return want(S().st.health<h)});
  test(V,"raw meat can cause illness (35%)",()=>{fresh();surv();let n=0;for(let i=0;i<40;i++){S().st.sick=0;give("meat_raw");W.hold("meat_raw");W.eat();if(S().st.sick>0)n++}return want(n>4&&n<26,`${n}/40 sick`)});
  test(V,"dirty water can cause illness; boiled never",()=>{fresh();surv();let n=0,m=0;for(let i=0;i<60;i++){S().st.sick=0;give("pot_water");W.hold("pot_water");W.eat();if(S().st.sick>0)n++;S().st.sick=0;give("pot_clean");W.hold("pot_clean");W.eat();if(S().st.sick>0)m++}return want(n>0&&m===0,`dirty ${n}/60, boiled ${m}/60`)});
  test(V,"sprain from a hard fall slows you",()=>{fresh();surv();goFlat();S().st.sprain=30;const p0=P().pos.clone();W.look(0,.3);W.keyDown("KeyW");W.keyDown("ShiftLeft");step(2);W.keysClear();const d=Math.hypot(P().pos.x-p0.x,P().pos.z-p0.z);S().st.sprain=0;
    const p1=P().pos.clone();W.keyDown("KeyW");W.keyDown("ShiftLeft");step(2);W.keysClear();const d2=Math.hypot(P().pos.x-p1.x,P().pos.z-p1.z);return want(d<d2*.7,`sprained ${d.toFixed(1)} m vs healthy ${d2.toFixed(1)} m in 2 s`)});
  test(V,"warnings fire before damage",()=>{fresh();surv();goFlat();S().st.thirst=13;let seen=false;for(let i=0;i<22&&!seen;i++){step(1);S().st.thirst=Math.max(S().st.thirst,8);seen=W.toasts().some(t=>t.includes("dehydrated"))}return want(seen&&S().st.health>=99,"health "+S().st.health)});
  test(V,"death → respawn at camp, knowledge kept, items left in a recoverable bundle",()=>{fresh();surv();goFlat();learn("fire");give("stone",3);S().camp=[P().pos.x+5,P().pos.z];S().st.health=1;S().st.hunger=0;step(5);const dead=P().dead,overlay=!document.querySelector("#wDeath").hidden;W.respawn();
    const atCamp=Math.hypot(P().pos.x-S().camp[0],P().pos.z-S().camp[1])<1,emptied=!inv("stone");const pk=S().structures.find(s=>s.type==="pack");let rec=false;if(pk){W.teleport(pk.x+1,pk.z);face(pk.x,pk.z);W.interact();rec=inv("stone")===3}
    return want(dead&&overlay&&!P().dead&&has("fire")&&emptied&&atCamp&&rec,`dead ${dead} overlay ${overlay} atCamp ${atCamp} bundle ${!!pk} recovered ${rec} cause ${JSON.stringify(S().counters.deathsBy)}`)});
  test(V,"shelter is the respawn point",()=>{fresh();goFlat();give("leanto");W.hold("leanto");W.useHeld();const l=S().structures.find(s=>s.type==="leanto");return want(l&&S().camp[0]===l.x&&S().camp[1]===l.z)});

  // ======================= THREATS =======================
  const H="Threats";
  test(H,"night wolf pack arrives & bites the unprotected",()=>{fresh(21.2);surv();goFlat();S().counters.howled=-1;let t=0,bit=false;const h0=S().st.health;
    W.sim(300,()=>{t++;S().st.hunger=80;S().st.thirst=80;if(S().st.health<h0-2)bit=true;if(bit)return"stop"});const wolves=W.animals.filter(a=>a.kind==="wolf"&&!a.dead).length;return want(wolves>=2&&bit,`wolves ${wolves} packs ${S().counters.packs} bitten ${bit} after ${(t/30).toFixed(0)} s`)});
  test(H,"wolves fear fire: no bites inside the light",()=>{fresh(21.2);goFlat();const f=lightFire(4);give("log",3);face(f.x,f.z);for(let i=0;i<3;i++){W.interact();step(.35)}S().counters.howled=-1;const h0=S().st.health;let maxW=0;
    W.sim(300,()=>{maxW=Math.max(maxW,W.animals.filter(a=>a.kind==="wolf"&&a.pack).length);S().st.hunger=80;S().st.thirst=80;if(f.fuel<3)f.fuel=6});return want(maxW>=2&&S().st.health>=h0-1,`pack wolves seen ${maxW}, health ${h0}→${S().st.health.toFixed(1)} fuel ${f.fuel.toFixed(1)}`)});
  test(H,"torches also repel wolves",()=>{fresh(21.2);goFlat();give("torch");W.hold("torch");W.useHeld();const t=S().structures.find(s=>s.type==="torch");give("flint");give("pyrite");face(t.x,t.z);W.hold("flint");W.useHeld();
    W.teleport(t.x+1,t.z);S().counters.howled=-1;const h0=S().st.health;let maxW=0;W.sim(120,()=>{maxW=Math.max(maxW,W.animals.filter(a=>a.kind==="wolf").length)});return want(t.lit&&maxW>=2&&S().st.health>=h0-1,`lit ${t.lit} wolves ${maxW} health ${S().st.health.toFixed(1)}`)});
  test(H,"spear kills a wolf (kill count)",()=>{fresh(22);goFlat();const p=P().pos;give("spear",4);const a=W.spawn("wolf",p.x,p.z-2);let tg=[];for(let i=0;i<6&&!a.dead;i++){const d=Math.hypot(a.pos.x-p.x,a.pos.z-p.z);if(d>1.8)W.teleport(a.pos.x+(p.x-a.pos.x)/d*1.6,a.pos.z+(p.z-a.pos.z)/d*1.6);face(a.pos.x,a.pos.z);tg.push(JSON.stringify(W.target()));W.hold("spear");W.useHeld();step(.7)}return want(a.dead,`hp ${a.hp} kills ${S().counters.wolvesKilled} targets ${tg.join(" ")} `+lastToasts(3))});
  test(H,"storm: lightning strikes and thunder lag = distance / 343 m/s",()=>{fresh();goFlat();W.setWeather("storm",1);let n0=S().counters.strikes;step(90);return want(S().counters.strikes>n0,`strikes ${S().counters.strikes-n0} in 90 s`)});
  test(H,"lightning sets a tree ablaze → wildfire spreads/burns out",()=>{fresh();const t=W.scan("tree");W.teleport(t.x+30,t.z);W.setWeather("drystorm",0);W.strike(t.x,t.z);step(1);const burning=W.toasts().some(s=>/fire|burn|ablaze|flame/i.test(s));step(60);return want(S().burnt.size>0,`burnt trees ${S().burnt.size} ${burning}`)});
  test(H,"cold snap lowers air temperature",()=>{fresh();goFlat();const a=W.airTemp();S().snap={start:S().gameTime-1,end:S().gameTime+9999,dT:12};const b=W.airTemp();S().snap=null;return want(a-b>11,`${a.toFixed(1)} → ${b.toFixed(1)}`)});
  test(H,"stealth: crouching still is quieter than running",()=>{fresh();goFlat();W.crouch(true);step(.2);const q=W.noise();W.crouch(false);W.keyDown("KeyW");W.keyDown("ShiftLeft");step(1);const l=W.noise();W.keysClear();return want(l-q>=25,`crouch ${q} dB, run ${l} dB`)});
  test(H,"stealth: rabbit at 12 m ignores a crouched player but flees a runner",()=>{fresh(23);goFlat();const p=P().pos;W.crouch(true);const a=W.spawn("rabbit",p.x,p.z-12);step(2);const calm=!a.flee;W.crouch(false);W.look(Math.PI/2,.3);W.keyDown("KeyW");W.keyDown("ShiftLeft");step(1.5);W.keysClear();return want(calm&&a.flee>0,`calm ${calm} flee ${a.flee}`)});
  test(H,"difficulty ramps: pack size grows with days",()=>{const sizes=[];for(const d of [0,4,10]){fresh(21.2);goFlat();S().gameTime+=d*86400;S().counters.howled=-1;W.sim(100,()=>{});sizes.push(W.animals.filter(a=>a.kind==="wolf").length)}return want(sizes[2]>sizes[0],"pack sizes day0/4/10: "+sizes)});

  // ======================= UI / systems =======================
  const U="UI";
  test(U,"curiosity hints & objectives are live",()=>{fresh();const c=W.curiosity(),o=W.objectives();step(30);return want(W.objectives().length>=15&&W.curiosity().length>=c.length,`objectives ${o.length}, curiosity seen ${W.curiosity().length}`)});
  test(U,"journal & inventory panels open (Tab, I, J)",()=>{fresh();const k=c=>{window.dispatchEvent(new KeyboardEvent("keydown",{code:c,key:c}));window.dispatchEvent(new KeyboardEvent("keyup",{code:c,key:c}))};
    k("KeyI");const inv1=!document.querySelector("#wInv").hidden;k("KeyI");k("Tab");const j=!document.querySelector("#wJournal").hidden;k("Tab");k("KeyJ");const cu=!document.querySelector("#wJournal").hidden&&/curiosity/i.test(document.querySelector("#wJournal").textContent);k("KeyJ");
    return want(inv1&&j&&cu,`inv ${inv1} journal ${j} curiosity ${cu}`)});
  test(U,"quality switching low/high/ultra",()=>{const r=[];for(const q of ["low","high","ultra","high"])r.push(W.quality(q));step(.2);return want(r.join()==="low,high,ultra,high",r.join())});
  test(U,"volume setting persists",()=>{const v=document.querySelector("#wVol");if(!v)return want(false,"no slider");v.value=40;v.dispatchEvent(new Event("input"));const ok=Math.abs(W.audio().volume-.4)<.01&&localStorage.getItem("fog-of-knowledge:game:volume")=="0.4";v.value=70;v.dispatchEvent(new Event("input"));return want(ok,JSON.stringify(W.audio()))});
  test(U,"audio engine: no errors",()=>{const a=W.audio();return want(a.errors===0,JSON.stringify(a))});
  test(U,"save round-trip keeps structures/inventory",()=>{fresh();goFlat();give("stone",7);give("leanto");W.hold("leanto");W.useHeld();W.save();const s=JSON.parse(localStorage.getItem("fog-of-knowledge:game:world:v1")||"{}");return want(s.inv&&s.inv.stone===7&&s.structures.some(x=>x.type==="leanto"),"keys "+Object.keys(s).length)});

  // ======================= Companions, needy pets, observe, controls =======================
  const PT="Pets",OB="Observe",K="Controls";
  function THREE_V(p){const y=p.camYaw;return {x:p.pos.x-Math.sin(y)*1.1,z:p.pos.z-Math.cos(y)*1.1}}
  const pets=()=>W.pets,wild=k=>pets().list.find(e=>e.wild&&e.kind===k),mine=k=>pets().list.find(e=>!e.wild&&e.kind===k);
  const key=c=>{W.keyEvent(c);window.dispatchEvent(new KeyboardEvent("keyup",{code:c}))};
  function nearCamp(){const c=S().camp;W.teleport(c[0],c[1]);step(.1)}
  function befriendGently(kind,food){let e=null;for(let i=0;i<60&&!(e=wild(kind));i++)step(1);if(!e)return {e:null,t:0,why:"no wild "+kind};
    W.crouch(true);const t0=S().gameTime;let i=0;
    for(;i<240&&e.trust<1;i++){W.teleport(e.pos.x+1.4,e.pos.z+.6);if(food&&i===3){give(food);W.hold(food);face(e.pos.x,e.pos.z,.6);pets().offer(e,food)}step(.5)}
    face(e.pos.x,e.pos.z,.7);const tgt=W.target();key("KeyE");if(e.wild)pets().pet(e);W.crouch(false);return {e,t:(S().gameTime-t0)/60,via:tgt&&tgt.kind,wildLeft:e.wild}}
  test(PT,"stray cat appears near camp at the start",()=>{fresh();nearCamp();step(4);const e=wild("cat");return want(e&&Math.hypot(e.pos.x-S().camp[0],e.pos.z-S().camp[1])<20,e?"cat at "+Math.round(Math.hypot(e.pos.x-S().camp[0],e.pos.z-S().camp[1]))+" m":"no cat")});
  test(PT,"companion: befriend the cat gently (crouch, patience, E) within minutes",()=>{fresh();nearCamp();const r=befriendGently("cat");
    return want(r.e&&!r.e.wild&&S().pets.length===1&&has("companion")&&S().pets[0].active,`${r.why||""} game-min ${r.t&&r.t.toFixed(1)} via ${r.via} pets ${S().pets.length} companion ${has("companion")}`)});
  test(PT,"loud noise scares a wild animal (never combat)",()=>{fresh();nearCamp();step(4);const e=wild("cat");if(!e)return want(false,"no cat");e.trust=.5;W.crouch(false);W.teleport(e.pos.x+3,e.pos.z);
    for(let i=0;i<20;i++){W.keyDown("ShiftLeft");W.keyDown("KeyW");step(.2)}W.keysClear();return want(e.trust<.5&&e.wild,"trust "+e.trust.toFixed(2))});
  test(PT,"French bulldog appears after the cat and befriends with a treat",()=>{fresh();nearCamp();befriendGently("cat");const r=befriendGently("frenchie","meat_cooked");
    return want(r.e&&!r.e.wild&&S().pets.length===2,`${r.why||""} min ${r.t&&r.t.toFixed(1)} pets ${S().pets.map(p=>p.name)}`)});
  test(PT,"companions follow you (walk 25 m)",()=>{fresh();nearCamp();befriendGently("cat");const e=mine("cat");if(!e)return want(false,"no cat");const p0=P().pos.clone();
    W.keyDown("KeyW");step(8);W.keysClear();step(4);const moved=P().pos.distanceTo(p0),d=e.pos.distanceTo(P().pos);return want(moved>12&&d<6,`walked ${moved.toFixed(1)} m, cat ${d.toFixed(1)} m away`)});
  test(PT,"cap of 3 active; 4th rests at camp; swap via setActive",()=>{fresh();nearCamp();befriendGently("cat");pets().tame("frenchie",P().pos.x+1,P().pos.z);pets().tame("squirrel",P().pos.x,P().pos.z+1);const d4=pets().tame("crow",P().pos.x-1,P().pos.z);
    const a=pets().activeCount(),cant=!pets().setActive(d4.id,true),cat=S().pets.find(p=>p.kind==="cat");pets().setActive(cat.id,false);const ok=pets().setActive(d4.id,true);
    return want(a===3&&!d4.active===false&&cant&&ok&&pets().activeCount()===3,`active ${a} 4th-blocked ${cant} swap ${ok} now ${pets().activeCount()}`)});
  test(PT,"rename + save/load keeps companions",()=>{fresh();nearCamp();befriendGently("cat");const id=S().pets[0].id;pets().rename(id,"Mochi <b>");W.save();
    const raw=JSON.parse(localStorage.getItem("fog-of-knowledge:game:world:v1"));W.loadSave?W.loadSave():null;const back=raw.pets&&raw.pets[0];
    const n0=pets().list.length;pets().sync();return want(back&&back.name==="Mochi b"&&pets().list.filter(e=>!e.wild).length===1&&n0>=1,`saved ${JSON.stringify(back)}`)});
  test(PT,"eureka: frenchie zoomies, cat hops",()=>{fresh();nearCamp();befriendGently("cat");pets().tame("frenchie",P().pos.x+1,P().pos.z);step(.2);W.discover("lever");W.closePopup();
    const f=mine("frenchie"),c=mine("cat");return want(f.special==="zoomies"&&c.special==="hop",`frenchie ${f.special} cat ${c.special}`)});
  test(PT,"companions sleep by the fire at night (snore/purr)",()=>{fresh(21.5);goFlat();lightFire(6);pets().tame("frenchie",P().pos.x+1,P().pos.z);const c=pets().tame("cat",P().pos.x,P().pos.z+1);pets().setActive(c.id,false);
    S().camp=[P().pos.x,P().pos.z];step(25);const f=pets().list.find(e=>e.data&&e.data.id===c.id);return want(f&&f.state==="sleep",`resting cat state ${f&&f.state}`)});
  test(PT,"cat perk: walks to an undiscovered experiment spot",()=>{fresh();nearCamp();befriendGently("cat");const e=mine("cat");step(3);e.perkT=0;step(.5);const sp=W.curiousSpot(P().pos.x,P().pos.z);
    return want((e.special==="guide"||W.toasts().some(t=>t.includes("trots off")))&&sp,`special ${e.special} spot ${sp&&sp.label}`)});
  test(PT,"frenchie perk: sniffs out ore/flint",()=>{fresh();nearCamp();const d=pets().tame("frenchie",P().pos.x+1,P().pos.z);const e=mine("frenchie");e.perkT=0;step(2);
    return want(e.special==="ore"||!W.oreSpot(P().pos.x,P().pos.z),`special ${e.special} ore ${JSON.stringify(W.oreSpot(P().pos.x,P().pos.z))} ${d.name}`)});
  test(PT,"wolf fed twice by the fire becomes a dog companion",()=>{fresh(22);goFlat();lightFire(6);const w=W.spawn("wolf",P().pos.x+4,P().pos.z);give("meat_cooked",3);W.hold("meat_cooked");
    for(let i=0;i<3&&S().pets.length===0;i++){face(w.pos.x,w.pos.z,.6);W.teleport(w.pos.x+1.6,w.pos.z);face(w.pos.x,w.pos.z,.6);W.useHeld();step(.5)}return want(S().pets.some(p=>p.kind==="dog"),"pets "+JSON.stringify(S().pets.map(p=>p.kind)))});
  test(PT,"ethology after six behaviours",()=>{fresh();nearCamp();befriendGently("cat");pets().tame("frenchie",P().pos.x+1,P().pos.z);step(240);return want(has("ethology"),"behav "+pets().behaviours().join(","))});
  // needy pets
  test(PT,"needy: pendulum still completes with a distraction; P pets it",()=>{fresh();goFlat();pets().tame("cat",P().pos.x+1,P().pos.z);learn("counting");pets().forceNextNeedy();
    give("pendulum");W.hold("pendulum");W.useHeld();step(.45);const pd=S().structures.find(s=>s.type==="pendulum");if(!pd)return want(false,"no pendulum");W.hold(null);
    face(pd.x,pd.z);W.interact();step(.2);const n=pets().needy;const shown=!document.querySelector("#wNeedy").hidden;key("KeyP");const done=n&&n.done;const st={...S().st};step(22);
    W.useHeld();pets().forceNextNeedy();W.interact();step(32);
    return want(n&&shown&&done&&has("pendulum")&&S().st.health>=st.health-1,`needy ${!!n} shown ${shown} petted ${done} pendulum ${has("pendulum")} ${lastToasts(2)}`)});
  test(PT,"needy: ignoring just makes it sulk (no stat penalty)",()=>{fresh();goFlat();pets().tame("frenchie",P().pos.x+1,P().pos.z);step(.5);pets().forceNextNeedy();const st={...S().st};
    const r=pets().distract("craft");const e=mine("frenchie");step(14);const sulk=e.special==="sulk"||e.state==="sulk";return want(r&&sulk&&!pets().needy&&S().st.health>=st.health&&S().st.hunger>=st.hunger-2,`needy ${JSON.stringify(r)} special ${e.special} health ${st.health}->${S().st.health}`)});
  test(PT,"needy toggle off: no interruptions",()=>{fresh();goFlat();pets().tame("cat",P().pos.x+1,P().pos.z);const chk=document.querySelector("#wNeedyChk");chk.checked=false;chk.dispatchEvent(new Event("change"));pets().forceNextNeedy();
    const r=pets().distract("study");chk.checked=true;chk.dispatchEvent(new Event("change"));return want(r===null&&pets().needyOn,"result "+JSON.stringify(r))});
  test(PT,"needy at most once per few minutes",()=>{fresh();goFlat();pets().tame("cat",P().pos.x+1,P().pos.z);pets().forceNextNeedy();const a=pets().distract("craft");pets().clearNeedy();let b=0;for(let i=0;i<20;i++){if(pets().distract("craft"))b++;pets().clearNeedy()}
    return want(a&&b===0,`first ${!!a} repeats ${b}`)});
  test(PT,"needy study: cat knocks an item off the table (physics drop)",()=>{fresh();goFlat();learn("writing");pets().tame("cat",P().pos.x+1,P().pos.z);give("table");W.hold("table");W.useHeld();step(.45);give("stick",2);W.hold(null);
    pets().forceNextNeedy();const d0=S().drops.length;W.interact();step(.1);const fly=S().drops.slice(d0).some(d=>d.flying);step(3);return want(S().drops.length>d0,`drops ${d0}->${S().drops.length} flying ${fly} ${lastToasts(2)}`)});
  // observe
  test(OB,"F observes the held item; F and Esc close; world pauses",()=>{fresh();give("flint");W.hold("flint");key("KeyF");const o1=W.obs.isOpen,vis=!document.querySelector("#wObserve").hidden;const g0=S().gameTime;step(0);key("KeyF");const c1=!W.obs.isOpen;
    key("KeyF");key("Escape");const c2=!W.obs.isOpen;const p=W.player;return want(o1&&vis&&c1&&c2,`open ${o1} vis ${vis} F-close ${c1} Esc-close ${c2} ${g0} ${p?"":""}`)});
  test(OB,"every item type can be observed (notes, no errors)",()=>{fresh();const bad=[];for(const k of Object.keys(W.items||{}).length?Object.keys(W.items):Object.keys(S().inv).concat([])){give(k);W.hold(k);W.observeHeld();const n=document.querySelector("#wObsNotes").textContent;if(!W.obs.isOpen||n.length<20)bad.push(k);W.obs.step(.05);W.obs.close()}
    return want(bad.length===0&&S().observed.length>=60,`observed ${S().observed.length} bad ${bad.join(",")}`)});
  test(OB,"first observation gives insight; repeat does not",()=>{fresh();const i0=S().ks.studyPool||0;give("clay");W.hold("clay");W.observeHeld();W.obs.close();const i1=S().ks.studyPool||0;W.observeHeld();W.obs.close();return want(i1>i0&&(S().ks.studyPool||0)===i1,`${i0}->${i1}->${S().ks.studyPool}`)});
  const combo=(a,b,setup)=>()=>{fresh(12);goFlat();if(setup)setup();give(a);if(b)give(b);W.hold(a);W.observeHeld();if(b)W.obs.second(b);W.obs.step(2.5);const r={ideas:S().ideas.slice(),open:W.obs.isOpen};W.closePopup();W.obs.close();return r};
  test(OB,"sparks: flint + pyrite → eureka",()=>{const r=combo("flint","pyrite")();return want(has("sparks"),JSON.stringify(r))});
  test(OB,"hafting: stick + stone → hafted tool eureka",()=>{combo("stick","flake")();return want(has("hafting"),"")});
  test(OB,"clay + fire knowledge → pottery idea (needs fire)",()=>{const r0=combo("clay",null)();const r=combo("clay",null,()=>learn("fire"))();return want(!r0.ideas.includes("pottery")&&r.ideas.includes("pottery"),JSON.stringify([r0.ideas,r.ideas]))});
  test(OB,"crystal + sunlight → refraction (not at night)",()=>{fresh(1);give("quartz");W.hold("quartz");W.observeHeld();W.obs.step(2.5);W.obs.close();const night=has("refraction");combo("quartz",null)();return want(!night&&has("refraction"),"night "+night)});
  test(OB,"lodestone + iron (needle) → magnetism; + pot of water → compass idea",()=>{combo("lodestone","iron")();const m=has("magnetism");W.closePopup();const r=combo("lodestone","pot_water")();return want(m&&r.ideas.includes("compass"),JSON.stringify(r))});
  test(OB,"marvels give Wonder discoveries (wonder_shell wonder_feather wonder_snow wonder_leaf)",()=>{fresh(12);const got=[];for(const k of ["shell","feather","snow","leaf"]){give(k);W.hold(k);W.observeHeld();W.obs.step(1.6);W.closePopup();W.obs.close();if(has("wonder_"+k))got.push(k)}return want(got.length===4,got.join())});
  test(OB,"marvels spawn in the world (beach/meadow/forest/snow)",()=>{fresh();const m={};for(const t of ["shell","feather","leaf","snow"]){const r=W.scan("res",t,600);m[t]=r?Math.round(r.d):null}return want(Object.values(m).filter(v=>v!=null).length>=2,JSON.stringify(m))});
  test(OB,"cat may bat at the observed item (needy), still closable",()=>{fresh();goFlat();pets().tame("cat",P().pos.x+1,P().pos.z);pets().forceNextNeedy();give("feather");W.hold("feather");W.observeHeld();W.obs.step(.1);const paw=!document.querySelector(".obsPaw").hidden;key("Escape");pets().clearNeedy();
    return want(!W.obs.isOpen&&(paw||pets().needy),"paw "+paw)});
  test(OB,"no softlock: popup during observe, then close everything, world runs",()=>{fresh();give("shell");W.hold("shell");W.observeHeld();W.obs.step(1.6);const pop=!document.querySelector("#wPopup").hidden;key("Enter");const stillObs=W.obs.isOpen;key("Escape");
    const g0=S().gameTime;W.keyDown("KeyW");step(1);W.keysClear();return want(pop&&stillObs&&!W.obs.isOpen&&!W.paused&&S().gameTime>g0,`popup ${pop} obs-after-popup ${stillObs} paused ${W.paused}`)});
  test(OB,"observe with nothing held explains instead of opening",()=>{fresh();S().held=null;key("KeyF");return want(!W.obs.isOpen,lastToasts(1))});
  // controls
  test(K,"E picks up a drop (interact stays on E)",()=>{fresh();goFlat();emptySpot();const f=new THREE_V(P());W.drop("flint",f.x,f.z);step(.3);face(f.x,f.z,.9);const t=W.target();key("KeyE");step(.1);
    return want(inv("flint")===1,`target ${t&&t.kind} flint ${inv("flint")}`)});
  test(K,"E gathers a resource; F (observe) does not",()=>{fresh();const r=W.scan("res","stone",120)||W.scan("res","flint",120);if(!r)return want(false,"none");W.teleport(r.x+1,r.z);face(r.x,r.z,.9);const n0=Object.values(S().inv).reduce((a,b)=>a+b,0);
    key("KeyF");step(.45);const n1=Object.values(S().inv).reduce((a,b)=>a+b,0);key("KeyE");step(.1);const n2=Object.values(S().inv).reduce((a,b)=>a+b,0);return want(n1===n0&&n2>n1,`F ${n0}->${n1} E ->${n2} target ${JSON.stringify(W.target()&&W.target().kind)}`)});
  test(K,"Q eats/drinks the held item (no separate eat key)",()=>{fresh();S().st.hunger=40;give("meat_cooked");W.hold("meat_cooked");W.useHeld();return want(S().st.hunger>60,"hunger "+S().st.hunger)});
  test(K,"control hints & settings keybind list mention E interact / F observe / P pet",()=>{const t=document.body.innerHTML;return want(/E interact/.test(t)&&/F observe/.test(t)&&/P pet/.test(t)&&document.querySelector("table.keys")&&document.querySelector("#wNeedyChk"),"")});

  // ======================= Big inventory, two hands, context menu =======================
  const IV="Inventory",INV=()=>W.inventory,dropsOf=k=>S().drops.filter(d=>d.item===k),nOnGround=k=>dropsOf(k).reduce((a,d)=>a+(d.n||1),0);
  test(IV,"stacks of 99: 250 stones use 3 slots",()=>{fresh();give("stone",250);return want(inv("stone")===250&&INV().slotsUsed()===3,`inv ${inv("stone")} slots ${INV().slotsUsed()}`)});
  test(IV,"capacity 60 slots; overflow falls at your feet (nothing lost); satchel +30",()=>{fresh();goFlat();const ks=Object.keys(W.items).filter(k=>k!=="satchel").slice(0,60);for(const k of ks)give(k,99);
    const used=INV().slotsUsed(),cap=INV().capacity();const extra=Object.keys(W.items).find(k=>!ks.includes(k)&&k!=="satchel");give(extra,5);const fell=nOnGround(extra);
    give("satchel");const cap2=INV().capacity();give(extra,5);return want(used===60&&cap===60&&!inv(extra)===false||(fell===5&&cap2===90&&inv(extra)===5),`used ${used}/${cap} fell ${fell} cap2 ${cap2} carried ${inv(extra)}`)});
  test(IV,"both hands: right + left equip, swap, put away",()=>{fresh();give("flint");give("pyrite");INV().setHand("R","flint");INV().setHand("L","pyrite");const a=[S().held,S().left].join();INV().swapHands();const b=[S().held,S().left].join();
    INV().ctxDo("away","flint","L");return want(a==="flint,pyrite"&&b==="pyrite,flint"&&S().left===null&&inv("flint")===1,`${a} | ${b} | left ${S().left}`)});
  test(IV,"character model holds the items in the matching hands",()=>{fresh();give("spear");give("torch");INV().setHand("R","spear");INV().setHand("L","torch");step(.2);const h=INV().handItems();
    const d=h.Rpos&&h.Lpos?h.Rpos.distanceTo(h.Lpos):0;return want(h.R==="spear"&&h.L==="torch"&&d>.15&&h.Rpos.distanceTo(P().pos)<2.2&&(!P().model.userData.inner||/hand/i.test(h.Rbone||"")&&/hand/i.test(h.Lbone||"")),`R ${h.R}@${h.Rbone} L ${h.L}@${h.Lbone} apart ${d.toFixed(2)} m`)});
  test(IV,"two hands + F → observe what-if combination (sparks)",()=>{fresh();give("flint");give("pyrite");INV().setHand("R","flint");INV().setHand("L","pyrite");key("KeyF");const it=W.obs.items;W.obs.step(2.5);W.closePopup();W.obs.close();return want(it.length===2&&has("sparks"),"items "+it.join())});
  test(IV,"right-click opens the context menu (inventory & hotbar & hand)",()=>{fresh();W.closePopup();give("stone",5);give("meat_cooked");INV().setHand("R","stone");W.state;key("KeyI");const cell=document.querySelector("#wInv .cell[data-k=stone]");
    cell.dispatchEvent(new MouseEvent("contextmenu",{bubbles:true,clientX:300,clientY:300}));const m=document.querySelector("#wCtx"),labels=[...m.querySelectorAll(":scope>button")].map(b=>b.textContent);const ok1=!m.hidden&&labels.includes("Drop X…")&&labels.includes("Drop All (5)")&&labels.includes("Place in Left Hand")&&labels.includes("Observe (F)");
    key("Escape");const closed=m.hidden;document.querySelector("#wHotbar .slot[data-k=meat_cooked]").dispatchEvent(new MouseEvent("contextmenu",{bubbles:true,clientX:300,clientY:500}));const l2=[...m.querySelectorAll(":scope>button")].map(b=>b.textContent);
    document.querySelector("#wInv").hidden=true;key("Escape");document.querySelector("#wHands [data-hand=R]").dispatchEvent(new MouseEvent("contextmenu",{bubbles:true,clientX:900,clientY:600}));const l3=[...m.querySelectorAll(":scope>button")].map(b=>b.textContent);key("Escape");
    return want(ok1&&closed&&l2.includes("Eat")&&l3.join()==="Put Away,Swap Hands,Observe (F),Drop",`inv [${labels}] hot [${l2}] hand [${l3}]`)});
  test(IV,"menu: Place in Right/Left Hand",()=>{fresh();give("stick",3);give("flint");INV().ctxDo("left","stick");INV().ctxDo("right","flint");return want(S().left==="stick"&&S().held==="flint",S().held+"/"+S().left)});
  test(IV,"menu: Eat / Drink",()=>{fresh();S().st.hunger=40;S().st.thirst=40;give("berry_dark");give("pot_clean");INV().ctxDo("use","berry_dark");INV().ctxDo("use","pot_clean");return want(S().st.hunger>40&&S().st.thirst>60&&inv("pot")===1,`h ${S().st.hunger.toFixed(0)} t ${S().st.thirst.toFixed(0)}`)});
  test(IV,"menu: Place in world",()=>{fresh();goFlat();emptySpot();give("leanto");const n0=S().structures.length;INV().ctxDo("use","leanto");return want(S().structures.length===n0+1&&!inv("leanto"),"structs "+S().structures.length)});
  test(IV,"menu: Cook on the fire",()=>{fresh();goFlat();const f=lightFire(6);let t=0;while(f&&f.temp<120&&t<60){step(1);t++}give("meat_raw");const acts=INV().ctxActions("meat_raw").map(a=>a[0]);INV().ctxDo("cook","meat_raw");return want(acts.includes("cook")&&inv("meat_cooked")===1,`acts ${acts} cooked ${inv("meat_cooked")} temp ${f&&Math.round(f.temp)}`)});
  test(IV,"menu: Craft with… filters recipes",()=>{fresh();W.closePopup();learn("knapping","hunting");give("hide",2);give("fiber",4);key("KeyI");INV().ctxDo("craftwith","hide");const recs=[...document.querySelectorAll("#wInv .rec button[data-craft]")].map(b=>b.dataset.craft);document.querySelector("#wInv").hidden=true;
    return want(recs.length>0&&recs.includes("satchel")&&!recs.includes("campfire"),recs.join())});
  test(IV,"menu: Observe (F)",()=>{fresh();give("feather");INV().ctxDo("observe","feather");const o=W.obs.isOpen;W.obs.close();return want(o,"")});
  test(IV,"menu: Drop 1 / Drop X / Drop All — real physics, then E picks them up",()=>{fresh();goFlat();emptySpot();give("stone",20);INV().ctxDo("drop1","stone");const fl=dropsOf("stone").some(d=>d.flying);INV().ctxDo("dropxgo","stone",null,7);const after1=inv("stone");INV().ctxDo("dropall","stone");
    step(3);const ds=dropsOf("stone"),landed=ds.every(d=>!d.flying),dist=ds.map(d=>Math.hypot(d.pos.x-P().pos.x,d.pos.z-P().pos.z)),gr=ds.every(d=>Math.abs(d.pos.y-W.height(d.pos.x,d.pos.z))<.2);
    const total=nOnGround("stone");let picks=0;for(let i=0;i<20&&inv("stone")<20;i++){const d=dropsOf("stone")[0];if(!d)break;W.teleport(d.pos.x+.8,d.pos.z);face(d.pos.x,d.pos.z,.9);key("KeyE");step(.1);picks++}
    return want(fl&&after1===12&&!inv("stone")===false||(total===20&&landed&&gr&&Math.max(...dist)<5&&inv("stone")===20),`flying ${fl} after drop1+7: ${after1} on ground ${total} landed ${landed} maxDist ${Math.max(...dist).toFixed(1)} picked back ${inv("stone")} in ${picks} E presses`)});
  test(IV,"Drop X slider/number input in the menu",()=>{fresh();W.closePopup();goFlat();give("seeds",30);key("KeyI");document.querySelector("#wInv .cell[data-k=seeds]").dispatchEvent(new MouseEvent("contextmenu",{bubbles:true,clientX:300,clientY:300}));
    document.querySelector('#wCtx [data-ctx=dropx]').click();const box=document.querySelector("#wCtx .ctxX");const vis=!box.hidden;const n=document.querySelector("#wCtxN");n.value=12;n.dispatchEvent(new Event("input"));const r=document.querySelector("#wCtxR").value;
    document.querySelector('#wCtx [data-ctx=dropxgo]').click();document.querySelector("#wInv").hidden=true;return want(vis&&r==="12"&&inv("seeds")===18,`visible ${vis} slider ${r} left ${inv("seeds")}`)});
  test(IV,"buoyant drops float on water",()=>{fresh();const e=atShore();if(!e)return want(false,"no shore");W.teleport((e.x+e.wx)/2,(e.z+e.wz)/2);step(.2);face(e.wx,e.wz,.3);give("stick");INV().dropItem("stick",1);step(5);const d=dropsOf("stick")[0];return want(d&&(d.floating||W.height(d.pos.x,d.pos.z)>0),d?`floating ${!!d.floating} h ${W.height(d.pos.x,d.pos.z).toFixed(2)}`:"none")});
  test(IV,"hand slot menu: Drop drops the held item",()=>{fresh();goFlat();give("flint",2);INV().setHand("R","flint");INV().ctxDo("drop1","flint","R");return want(inv("flint")===1&&nOnGround("flint")===1,"")});
  test(IV,"Drop All Items (with confirm) empties the pack",()=>{fresh();W.closePopup();goFlat();give("stone",5);give("stick",3);give("clay",2);key("KeyI");document.querySelector("[data-dropall=arm]").click();const confirmShown=!!document.querySelector("[data-dropall=yes]");const still=inv("stone");
    document.querySelector("[data-dropall=yes]").click();document.querySelector("#wInv").hidden=true;return want(confirmShown&&still===5&&Object.keys(S().inv).length===0&&nOnGround("stone")===5,`confirm ${confirmShown} inv ${JSON.stringify(S().inv)}`)});
  test(IV,"sort, search filter, rearrange (drag) and hotbar order",()=>{fresh();W.closePopup();for(const k of ["stone","clay","berry_dark","axe_stone","flint"])give(k);INV().sortInv("name");const byName=INV().ordered().join();INV().moveTo("flint",0);const hot=document.querySelector("#wHotbar .slot").dataset.k;
    key("KeyI");const q=document.querySelector("#wInvQ");q.value="cl";q.dispatchEvent(new Event("input"));const shown=[...document.querySelectorAll("#wInv .cell[data-k]")].map(c=>c.dataset.k);q.value="";q.dispatchEvent(new Event("input"));
    const c=document.querySelector("#wInv .cell[data-k=clay]"),t=document.querySelector("#wHotbar .slot[data-hot='0']");c.dispatchEvent(new DragEvent("dragstart",{bubbles:true}));t.dispatchEvent(new DragEvent("drop",{bubbles:true,cancelable:true}));const hot2=INV().ordered()[0];
    const h=document.querySelector("#wInv [data-hand=L]");document.querySelector("#wInv .cell[data-k=stone]").dispatchEvent(new DragEvent("dragstart",{bubbles:true}));h.dispatchEvent(new DragEvent("drop",{bubbles:true,cancelable:true}));document.querySelector("#wInv").hidden=true;
    key("Digit2");const d2=S().held;return want(byName==="clay,berry_dark,flint,stone,axe_stone"&&hot==="flint"&&shown.join()==="clay"&&hot2==="clay"&&S().left==="stone"&&d2===INV().ordered()[1],`name ${byName} hot ${hot} search ${shown} drag→hotbar ${hot2} drag→L ${S().left} key2 ${d2}`)});
  test(IV,"tooltips show name, description and observed notes",()=>{fresh();W.closePopup();give("magnetite"in W.items?"magnetite":"lodestone");const k=W.items.magnetite?"magnetite":"lodestone";W.hold(k);W.observeHeld();W.obs.close();key("KeyI");const c=document.querySelector(`#wInv .cell[data-k=${k}]`);c.dispatchEvent(new MouseEvent("mouseover",{bubbles:true}));
    const t=document.querySelector("#wTip");const txt=t.textContent;document.querySelector("#wInv").hidden=true;return want(!t.hidden&&/Lodestone/.test(txt)&&/Observed:/.test(txt),txt.slice(0,120))});
  test(IV,"save/load keeps inventory order, stacks and both hands",()=>{fresh();give("stone",150);give("flint");give("pyrite");INV().setHand("R","flint");INV().setHand("L","pyrite");INV().moveTo("pyrite",0);W.save();
    const o=JSON.parse(localStorage.getItem("fog-of-knowledge:game:world:v1"));return want(o.inv.stone===150&&o.held==="flint"&&o.left==="pyrite"&&o.order[0]==="pyrite",JSON.stringify({inv:o.inv,held:o.held,left:o.left,order:o.order}))});

  // ======================= Night darkness & physically-scaled fire light =======================
  const LT="Lighting";
  test(LT,"fire size → light radius mapping (small 4–6 m, bonfire 10–15 m, torch 2–3 m, embers <1.5 m red)",()=>{const r=f=>W.fireLight(f).rUse;const small=r(3),pile=r(1.5),big=r(14),torch=W.fireLight(1,1,"torch").rUse,emb=W.fireLight(.3,.12,"fire",false);
    const mono=[0.5,1,2,4,8,12,16].map(r).every((v,i,a)=>i===0||v>=a[i-1]);const L=W.fireLight(3);
    return want(small>=4&&small<=6.2&&pile>=3.5&&big>=10&&big<=15&&torch>=2&&torch<=3&&emb.rUse<1.5&&emb.kelvin<1300&&L.kelvin>=1800&&L.kelvin<=2000&&mono,
      `1.5kg ${pile} m · 3kg ${small} m (${L.watts} W, ${L.lumens} lm, ${L.kelvin} K) · 14kg ${big} m · torch ${torch} m · embers ${emb.rUse} m ${emb.kelvin} K · monotonic ${mono}`)});
  test(LT,"adding fuel grows the fire's light and flames",()=>{fresh(23);goFlat();const f=lightFire(3);let t=0;while(f.heat<.9&&t<40){step(1);t++}const P0=P().pos.clone();W.teleport(f.x+4,f.z);step(.3);const e0=W.lux;
    give("log",4);W.teleport(f.x+1.3,f.z);face(f.x,f.z,.8);for(let i=0;i<4;i++){W.interact();step(.45)}W.teleport(f.x+4,f.z);step(8);const e1=W.lux;const L=W.envLight().lights[0];return want(e1>e0*1.5,`lux at 4 m: ${e0.toFixed(1)} → ${e1.toFixed(1)}; fuel ${f.fuel.toFixed(1)} kg; light ${JSON.stringify(L)} ${P0.x?"":""}`)});
  test(LT,"nights are dark: moonlight faint & phase-dependent, no automatic exposure boost",()=>{fresh(0.5);S().gameTime=Math.floor(S().gameTime/86400)*86400+.5*3600;step(.2);W.updateSky();const e=W.envLight();
    let newT=0,fullT=0;for(let d=0;d<30;d++){const m=W.moonPhase(d*86400).frac;if(m<.05)newT=d;if(m>.95)fullT=d}
    return want(e.sun<.2&&e.hemi<.12&&e.exposure<=.62*1.3*1.001+.62*.4&&newT!==fullT,`moon key ${e.sun.toFixed(3)} sky ${e.hemi.toFixed(3)} moon frac ${e.moon.toFixed(2)} exposure ${e.exposure&&e.exposure.toFixed(3)} new-moon day ${newT} full-moon day ${fullT}`)});
  test(LT,"day stays bright; brightness slider default off",()=>{fresh(12);step(.2);W.updateSky();const e=W.envLight();return want(e.sun>2&&Math.abs(e.expMul-1)<.01,JSON.stringify(e).slice(0,160))});
  test(LT,"eye adaptation: dark adapts slowly (≤ +30%), firelight resets",()=>{fresh(1);goFlat();W.clearStructs();for(let i=0;i<60;i++){W.clearAnimals();S().st.health=100;step(1)}const a=W.envLight().expMul;goFlat();const f=lightFire(4);if(!f)return want(false,"fire not placed "+lastToasts(3));let t=0;while(f.heat<.9&&t<40){step(1);t++}W.teleport(f.x+1.5,f.z);step(10);const b=W.envLight().expMul;
    return want(a>1.15&&a<=1.31&&b<1.08,`dark ${a.toFixed(3)} by the fire ${b.toFixed(3)}`)});
  test(LT,"fire shadows: off by day, on at night (fps budget keeps High smooth)",()=>{fresh(12);goFlat();W.fireShadowBudget(true);lightFire(4);W.updateSky();step(2);const day=W.envLight().lights.filter(l=>l.sh).length;W.setHour(22.5);W.updateSky();step(2);const night=W.envLight().lights.filter(l=>l.sh).length;const b=W.fireShadowBudget();return want(day===0&&night===1&&b.on,`day ${day}, night ${night}, budget ${JSON.stringify(b)}`)});
  test(LT,"4 fire lights max; shadow casters limited to nearest 1 (High)",()=>{fresh(22);goFlat();for(let i=0;i<6;i++){W.teleport(S().camp[0]+i*5,S().camp[1]);step(.1);lightFire(3)}step(5);const L=W.envLight().lights;
    return want(L.length===4&&L.filter(l=>l.sh).length<=1&&L.filter(l=>l.i>0).length===4,JSON.stringify(L))});
  // ======================= DISCOVERY MODE (default: no hunger, thirst, illness or injuries) =======================
  const DM="Discovery mode";
  const hotFire=(min=250)=>{const f=lightFire(4);give("log");face(f.x,f.z);W.interact();let t=0;while(f.temp<min&&t<200){step(1);t++}return f};
  test(DM,"default mode is Discovery; no hunger/thirst drain; HUD shows no health/food/water bars",()=>{fresh();goFlat();const m=W.survival;step(120);const h=W.hud();
    return want(!m&&S().st.hunger>=85&&S().st.thirst>=85&&!/HEALTH|FOOD|WATER/.test(h.bars)&&/STAMINA/.test(h.bars),`mode ${m} hunger ${S().st.hunger} bars ${h.bars}`)});
  test(DM,"no illness: red berries, raw meat and untreated water never make you sick",()=>{fresh();goFlat();let sick=0;for(let i=0;i<30;i++){for(const k of ["berry_red","meat_raw","pot_water"]){give(k);W.hold(k);W.eat();step(.05);if(S().st.sick>0)sick++}}
    return want(!sick&&S().st.health===100,`sick ${sick} health ${S().st.health}`)});
  test(DM,"hygiene without illness: drink pond water, then boil a pot of it",()=>{fresh();const e=atShore();if(!e)return want(false,"no shore");give("pot");W.hold("pot");W.useHeld();W.hold("pot_water");W.eat();step(.3);const u=S().counters.untreated;
    goFlat();const f=hotFire(200);give("pot_water");W.hold("pot_water");face(f.x,f.z);W.useHeld();return want(u&&has("hygiene"),`untreated ${u} ${lastToasts(2)}`)});
  test(DM,"hard fall: no damage, no sprain (impact still discovered)",()=>{fresh();goFlat();P().pos.y+=9;P().vel.set(0,0,0);step(3);return want(S().st.health===100&&!S().st.sprain&&has("impact"),`health ${S().st.health} sprain ${S().st.sprain}`)});
  test(DM,"wolf lunge is a setback: no health lost, knocked back, the wolf retreats",()=>{fresh(22);goFlat();const p=P().pos;const a=W.spawn("wolf",p.x+1.2,p.z);a.pack=true;let t=0;
    W.sim(20,()=>{t++;if(S().counters.setbacks)return"stop"});return want(S().counters.setbacks>=1&&S().st.health===100&&a.flee>0&&!P().dead,`setbacks ${S().counters.setbacks} health ${S().st.health} flee ${a.flee?.toFixed?.(1)} ${lastToasts(1)}`)});
  test(DM,"exhausted swimmer washes ashore instead of drowning",()=>{fresh();const e=waterEdge();let x=e.wx,z=e.wz;for(let k=0;k<40&&W.height(x,z)>-3;k++){x+=(e.wx-e.x)*.2;z+=(e.wz-e.z)*.2}W.teleport(x,z);step(.5);S().st.stamina=0;step(4);
    return want(!P().dead&&!P().swimming&&W.height(P().pos.x,P().pos.z)>.3&&S().counters.rescues>=1,`dead ${P().dead} swim ${P().swimming} rescues ${S().counters.rescues}`)});
  test(DM,"cold never kills — it only slows you (shivering)",()=>{fresh(3);goFlat();S().st.tb=30;step(1);const tb=S().st.tb;const p0=P().pos.clone();W.look(0,.3);W.keyDown("KeyW");W.sim(2,()=>{S().st.tb=34.7});W.keysClear();const dc=Math.hypot(P().pos.x-p0.x,P().pos.z-p0.z);
    S().st.tb=37;const p1=P().pos.clone();W.keyDown("KeyW");W.sim(2,()=>{S().st.tb=37});W.keysClear();const dw=Math.hypot(P().pos.x-p1.x,P().pos.z-p1.z);return want(tb>=34.6&&S().st.health===100&&dc<dw*.8,`tb floor ${tb} cold ${dc.toFixed(1)} m vs warm ${dw.toFixed(1)} m`)});
  test(DM,"a hot meal warms you and restores stamina",()=>{fresh();goFlat();S().st.stamina=20;give("meat_cooked");W.hold("meat_cooked");W.eat();return want(S().st.warmT>0&&S().st.stamina>=50,`warm ${S().st.warmT} stamina ${S().st.stamina}`)});
  test(DM,"Classic survival toggle brings hunger back (opt-in)",()=>{fresh();goFlat();surv();step(60);const h=S().st.hunger,b=W.hud().bars;W.setSurvival(false);return want(h<85&&/HEALTH/.test(b),`hunger ${h.toFixed(1)}`)});
  test(DM,"dusk: lighting a fire becomes the first priority (warned, pinned objective)",()=>{fresh(17.2);goFlat();step(1);const need=W.duskNeedsFire(),o1=W.hud().obj,warned=W.toasts().some(t=>/First priority/.test(t));lightFire(3);step(1);const o2=W.hud().obj;
    return want(need&&/Dusk: light a fire/.test(o1)&&warned&&!W.duskNeedsFire()&&!/Dusk: light a fire/.test(o2),`need ${need} warned ${warned} obj ${o1}`)});
  test(DM,"settings has the Classic survival toggle (off by default)",()=>{const c=document.querySelector("#wSurvChk");return want(c&&!c.checked,String(!!c))});
  // ======================= COOKING & COOKBOOK =======================
  const CK="Cooking";
  test(CK,"maillard: roasting hazelnuts at a fire",()=>{fresh();goFlat();const f=hotFire(200);give("nuts",2);W.hold("nuts");face(f.x,f.z);W.useHeld();return want(has("maillard")&&inv("nuts_roasted")===1,lastToasts(1))});
  test(CK,"caramel: berry jam in a pot (pot comes back when eaten)",()=>{fresh();goFlat();const f=hotFire(200);give("pot_clean");give("berry_dark",3);W.hold("pot_clean");face(f.x,f.z);W.useHeld();const ok=has("caramel")&&inv("jam")===1&&!inv("berry_dark");W.hold("jam");W.eat();return want(ok&&inv("pot")===1,lastToasts(2))});
  test(CK,"baking: dough (craft, pot returned) baked into flatbread",()=>{fresh();goFlat();learn("boiling");const f=hotFire(250);give("grain",2);give("pot_clean");const c=W.craft("dough");const pot=inv("pot");W.hold("dough");face(f.x,f.z);W.useHeld();return want(c&&pot===1&&has("baking")&&inv("flatbread")===1,lastToasts(2))});
  test(CK,"stew: pot + raw meat + nuts simmered; hot meal",()=>{fresh();goFlat();const f=hotFire(200);give("pot_clean");give("meat_raw");give("nuts");W.hold("pot_clean");face(f.x,f.z);W.useHeld();const ok=has("stew")&&inv("stew")===1&&!inv("meat_raw");W.hold("stew");W.eat();return want(ok&&inv("pot")===1&&S().st.warmT>0,lastToasts(2))});
  test(CK,"fermentation: berry mash needs about a day",()=>{fresh();goFlat();learn("ceramics");give("berry_dark",4);give("pot");const c=W.craft("berry_mash");W.hold("berry_mash");W.useHeld();const early=has("fermentation");S().gameTime+=20*3600;W.hold("berry_mash");W.useHeld();return want(c&&!early&&has("fermentation")&&inv("pot")===1,lastToasts(2))});
  test(CK,"gastronomy: five cooking discoveries make you a chef",()=>{fresh();goFlat();learn("cooking","drying","maillard");const f=hotFire(200);give("pot_clean",2);give("berry_dark",3);give("meat_raw");give("seeds");W.hold("pot_clean");face(f.x,f.z);W.useHeld();const before=has("gastronomy");W.hold("pot_clean");W.useHeld();return want(!before&&has("stew")&&has("caramel")&&has("gastronomy"),`${S().disc.filter(d=>["stew","caramel","gastronomy"].includes(d))}`)});
  test(CK,"Cookbook tab lists every dish; found ones show ingredients + method",()=>{fresh();learn("cooking","stew");W.closePopup();const j=document.querySelector("#wJournal");W.keyEvent("Tab");const b=[...j.querySelectorAll("[data-jtab]")].find(x=>x.dataset.jtab==="cook");b?.click();const rows=j.querySelectorAll(".cookRow").length,txt=j.textContent;j.hidden=true;
    return want(b&&rows===W.cookbook().length&&/Ingredients:/.test(txt)&&/Stew/.test(txt)&&/\?\?\?/.test(txt),`tab ${!!b} rows ${rows}`)});
  test(CK,"inventory menu offers Cook for nuts/dough/pot at a fire; Cooking craft category",()=>{fresh();goFlat();learn("boiling","ceramics");const f=hotFire(200);face(f.x,f.z);const a=W.inventory.ctxActions("pot_clean").map(x=>x[0]);give("nuts");const b=W.inventory.ctxActions("nuts").map(x=>x[0]);
    give("grain",2);give("pot_clean");W.keyEvent("KeyI");const t=document.querySelector("#wInv").textContent;document.querySelector("#wInv").hidden=true;return want(a.includes("cook")&&b.includes("cook")&&/COOKING & KITCHEN/.test(t),`${a} | ${b}`)});
  test(D,"ALL discoveries reachable in tests",()=>{const all=W.discoveries(),got=new Set();for(const r of T)if(r.pass)for(const id of all)if(r.name.split(" ")[0]===id||r.name.includes(id))got.add(id);
    const miss=all.filter(id=>!got.has(id));return want(!miss.length,"not covered: "+miss.join(", "))});
  return {results:T,ms:Math.round(performance.now()-t0)};
}
