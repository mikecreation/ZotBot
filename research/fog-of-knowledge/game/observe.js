import {GEAR_STEPS} from "./gear-progression.js?v=3.24.0";
/* Fog of Knowledge: The Game: OBSERVE (F).
 * A close-up look at what you hold: the world blurs and pauses, the item sits large in your hands; drag to turn it,
 * wheel to zoom, the light follows your cursor so texture, sheen and weight show. Notes describe what a careful
 * person would notice. Holding a second item (press its hotbar number / click it) prompts "what if…?" — some pairs
 * spark a combination EUREKA. A few things are simply marvellous. Never required, never a grind. */
import * as THREE from "./vendor/three.module.min.js";
// what a real person would notice; the last note is the "question" that points somewhere
export const NOTES={
 knife_stone:["A sharp flaked-stone edge with an unsharpened heel for the grip.","Suitable fine-grained stone fractures sharply; not every rock can be knapped.","Use it to shape handles, a fire spindle and housed wooden joints. Hold it and B to notch a log."],
 axe_stone:["A stone cutting head sits in a shaped wooden handle.","Twisted plant-fiber bindings grip the head and reinforce the handle.","Chop trees with E. An axe cuts wood; a pickaxe breaks mineral deposits."],
 pickaxe_stone:["A pointed stone head is lashed across a shaped wooden handle.","Concentrated impacts break brittle rock; this primitive head wears with use.","E mines boulders and mineral deposits. It is not a tree-cutting axe."],
 hand_drill:["A thin wooden spindle fits the shallow socket of a notched hearth board.","Both palms rotate the spindle: wood friction makes hot dust and then an ember, not flint sparks.","Stow the other hand, gather plant fiber and hold Q beside a dry firewood pile. The ember lights the tinder."],
 bench_joint:["The open notch has two shoulders and a flat bearing surface; the mating tongue seats inside.","The shoulders carry load. A wooden wedge and plant-fiber bindings resist separation.","F: rotate this cutaway joint. Four joints make the corner frame of a nail-free workbench."],
 workbench:["Four corner legs support a rectangular top made from split boards.","Housed joints, wooden wedges and twisted plant-fiber lashings connect the frame without nails.","Q places it. E opens crafting at the bench."],
 workbench_bundle:["Four corner supports each bundle three wooden poles for thicker legs.","Cross rails, visible notches, wedges and lashings tie the rectangular board top to the supports.","Q places it. E opens crafting at the bench."],
  stick:["Light for its size; grain lines run its whole length.","Bends a little, then snaps along the grain.","Would it float?"],
  log:["Heavy, but you can lift it. Bark peels in strips; rings show inside.","Long and stiff — it could pry something heavy.","Would something this big float, too?"],
  stone:["Dense and cold; it fits the palm — a natural hammer.","Rounded by water, perhaps.","What happens if you strike flint with it?"],
  flint:["Glassy, dark, waxy sheen. Broken edges curve like ripples in a pond (conchoidal).","Those edges are sharp enough to cut skin.","Does it spark when struck against something hard?"],
  pyrite:["Brassy and very heavy for its size — far denser than stone.","Perfect little cubes in places, as if someone carved them.","Struck with flint… sparks?"],
  clay:["Soft and cool; holds a fingerprint perfectly. Shape stays when you press it.","Dries pale and crumbly in the sun.","What would a fire do to it?"],
  fiber:["Long, stringy strands; twisted together they get much stronger.","Could tie things together.","Rope? Bindings? A sling?"],
  berry_red:["Bright, glossy, bitter smell. Birds seem to leave these alone.","Bright colours can be a warning.","Safe to eat? Careful."],
  berry_dark:["Dark, dusty skins, sweet smell; birds peck at these.","Juice stains your fingers purple.","Probably food."],
  seeds:["Tiny, hard, dry — each a whole plant waiting.","They come from the grass heads.","What do they need to grow? Water? Warmth?"],
  grain:["Plump seeds, more than the wild grass ever gives.","You grew this.","Ground and heated, would it keep?"],
  meat_raw:["Raw and slippery; it will spoil in a day or two.","Raw meat can make you sick.","Fire? Drying in the wind?"],
  meat_dried:["Light, leathery, keeps for ages — the water is gone.","Microbes need water to grow.",""],
  meat_cooked:["Browned and fragrant; heat changed it through and through.","Safer than raw.",""],
  hide:["Supple on one side, furred on the other; it holds warmth.","Wind doesn't pass through it.","Clothes? A bag of air to blow on a fire?"],
  flake:["Razor edge where it split from the core.","Small but sharp — needs a handle to be useful.","Bind it to a stick?"],
  axe_stone:["The handle multiplies your swing; the edge focuses it onto a line.","Leverage + a hard edge = work.",""],
  spear:["Stone-tipped hunting spear. Q throws it; click nearby wildlife to thrust. E recovers a thrown spear.","Kinetic energy ½mv² does the work when it lands.",""],
  tally:["Reusable counting record: equip it and Q to carve one notch. Tab → Experiments shows your saved total.","Ten notches unlock Counting and measured throw records. Each notch represents one quantity you choose to count.",""],
  pot:["Rings when tapped. The fire turned soft clay into something like stone.","Holds water without softening.","Could it hold water over a fire?"],
  pot_water:["Water sloshes heavily — a litre weighs a kilogram.","Clear-ish, but who knows what lives in it?","Boil it?"],
  pot_clean:["Boiled — the bubbles carried off the air, and the heat killed what was living in it.","",""],
  copper_ore:["Green bands and swirls (malachite) — copper in the rock.","Heavy for its size.","How hot would you need to get it?"],
  tin_ore:["Dark, heavy, glossy crystals (cassiterite).","Much denser than ordinary stone.","Melt it with copper?"],
  iron_ore:["Rusty red streak when scraped (hematite) — iron oxide.","Very heavy.","Is there something that pulls on this?"],
  copper:["Soft enough to dent with a stone; it bends instead of breaking.","Shiny salmon colour where you rub it.","Harder if mixed with something?"],
  tin:["Soft, silvery; it 'cries' (crackles) when you bend it.","",""],
  bronze:["Harder than copper or tin alone — the mixture beats both parents.","Holds an edge.",""],
  iron:["Spongy and grey; hammering squeezes out the slag.","Pulled by lodestone.",""],
  quartz:["Six-sided, clear as water. Light bends through it — things behind it shift.","Scratches glass.","What does it do to sunlight?"],
  sand:["Countless tiny grains of quartz.","Glitters in the sun.","Melt it?"],
  glass:["Smooth and clear; light passes but bends at the surface.","Thicker in the middle and it would focus light.",""],
  lens:["Thicker at the middle: things look bigger through it; in sun it makes a hot bright point.","",""],
  lodestone:["Black, heavy — and small iron bits cling to it! It pulls on things without touching them.","One end seems to like the north…","Float it on water?"],
  tablet:["Marks pressed into clay stay forever once dry.","",""],
  compass:["The floating stone swings until it settles north–south, every time.","",""],
  telescope:["Two lenses in a tube: distant things leap close.","Point it at the night sky.",""],
  prism:["Sunlight in, a fan of colours out.","",""],
  bellows:["Squeeze, and air rushes out — air is something.","More air, hotter fire.",""],
  sling:["A pouch and two cords: a longer arm for throwing.","",""],bow:["Bent wood stores energy and gives it back all at once.","",""],arrow:["Light shaft, sharp tip, fletched tail keeps it straight.","",""],
  shell:["A spiral that widens as it grows, the same shape at every size (a logarithmic spiral).","Pearly sheen inside: thin layers splitting light into colours.",""],
  feather:["Each vane is hooked together by thousands of tiny barbs — pull them apart and stroke them back: they zip shut.","Almost weightless, yet stiff along the shaft.",""],
  snow:["Look closely: every flake has six arms, and no two are quite alike.","Water molecules lock together at 120° angles as they freeze.",""],
  leaf:["Veins branch and branch again, carrying water out and sugar back.","Held to the light, it glows green.",""],
  nuts:["Hard shell, rich oily kernel — a squirrel's winter store.","",""],
  wheel:["Round, with a hole at the centre: rolling beats dragging.","",""]
};
export const COMBOS=[
  {a:["flint"],b:["pyrite"],disc:"sparks",title:"Sparks from stone!",text:"Striking flint against pyrite shaves off tiny hot fragments that glow — sparks. A way to make fire on purpose?"},
  {a:["stick"],b:["flake","stone"],disc:"hafting",title:"A handle!",text:"Bind the sharp stone to the stick and your whole arm becomes the tool: a lever with a hard edge at the end."},
  {a:["lodestone"],b:["iron_ore","iron"],disc:"magnetism",title:"It pulls!",text:"The lodestone tugs at the iron through the air. An invisible force."},
  {a:["lodestone"],b:["stick","pot_water"],idea:"compass",title:"What if it floated?",text:"If the lodestone could turn freely — floating on water, say — would it point the same way every time?"},
  {a:["clay"],b:[null,"stick","pot"],need:"fire",idea:"pottery",title:"Fire and clay?",text:"Fire changes things it touches. Could a hot fire turn soft clay hard, like stone?"},
  {a:["seeds"],b:["pot_water","pot_clean"],idea:"sprout",title:"Seeds and water",text:"Seeds are dry and waiting. With water nearby, would they sprout and grow?"},
  {a:["log"],b:["stone"],idea:"lever",title:"A long arm",text:"A long log over a stone… could you move a boulder far heavier than you?"},
  {a:["stick"],b:["fiber"],idea:"bind",title:"Tie it together",text:"Fibres twisted into cord can bind sticks: a frame, a shelter, a spear."},
  {a:["meat_raw"],b:[null,"stone","stick"],need:"fire",idea:"cook",title:"Heat the meat?",text:"Fire hardens clay and dries wood. What would it do to raw meat — and the things that make you sick?"},
  {a:["quartz","glass","lens"],b:[null],sun:true,disc:"refraction",title:"Light bends!",text:"Through the clear crystal the world shifts and the sunlight gathers into a bright point. Light changes direction as it passes into the crystal."}
];
export const WONDERS={shell:"wonder_shell",feather:"wonder_feather",snow:"wonder_snow",leaf:"wonder_leaf"};
const LOOK={pyrite:{metal:.9,rough:.28},copper:{metal:.85,rough:.35},bronze:{metal:.85,rough:.32},tin:{metal:.8,rough:.3},iron:{metal:.6,rough:.7},flint:{rough:.32},quartz:{glass:1},glass:{glass:1},lens:{glass:1},prism:{glass:1},clay:{rough:1},pot:{rough:.7},lodestone:{metal:.4,rough:.5},shell:{rough:.25}};
export function comboFor(a,b){for(const c of COMBOS){const hit=(x,y)=>c.a.includes(x)&&c.b.includes(y??null);if(hit(a,b)||(b&&hit(b,a)))return c}return null}

for(const [k,steps] of Object.entries(GEAR_STEPS))NOTES[k]=steps;
export function createObserve(C){
  let el=null,rnd=null,scene,cam,key,group,items=[],open=false,rotX=.35,rotY=.6,zoom=1,drag=null,timer=0,comboDone=false,lastT=0,raf=0,needyPaw=0;
  function build(){
    el=document.createElement("div");el.id="wObserve";el.className="wObserve";el.hidden=true;
    el.innerHTML=`<div class="obsStage"><canvas id="wObsCanvas"></canvas><div class="obsPaw" hidden>🐾</div><div class="obsHint">drag to turn · wheel to zoom · press another hotbar number to hold a second item · <b>F</b> / <b>Esc</b> put away</div></div><div class="obsNotes" id="wObsNotes"></div>`;
    document.querySelector("#wPopup")?.parentElement?.appendChild(el)||document.body.appendChild(el);
    const cv=el.querySelector("canvas");rnd=new THREE.WebGLRenderer({canvas:cv,alpha:true,antialias:true});rnd.setPixelRatio(Math.min(2,window.devicePixelRatio||1));
    rnd.outputColorSpace=THREE.SRGBColorSpace;rnd.toneMapping=THREE.ACESFilmicToneMapping;
    scene=new THREE.Scene();cam=new THREE.PerspectiveCamera(32,1,.01,20);cam.position.set(0,0,3.2);
    scene.add(new THREE.HemisphereLight(0xfff4e0,0x30251c,.9));key=new THREE.DirectionalLight(0xffffff,2.2);scene.add(key);const rim=new THREE.DirectionalLight(0x9fc8ff,.8);rim.position.set(-2,1,-2);scene.add(rim);
    group=new THREE.Group();scene.add(group);
    cv.addEventListener("pointerdown",e=>{drag={x:e.clientX,y:e.clientY};cv.setPointerCapture(e.pointerId)});
    cv.addEventListener("pointermove",e=>{const r=cv.getBoundingClientRect();const lx=(e.clientX-r.left)/r.width*2-1,ly=(e.clientY-r.top)/r.height*2-1;key.position.set(lx*3,-ly*3+1,2.5);
      if(drag){rotY+=(e.clientX-drag.x)*.012;rotX+=(e.clientY-drag.y)*.012;drag={x:e.clientX,y:e.clientY}}});
    cv.addEventListener("pointerup",()=>drag=null);
    cv.addEventListener("wheel",e=>{e.preventDefault();zoom=Math.min(2.6,Math.max(.6,zoom*(e.deltaY>0?.9:1.1)))},{passive:false});
    key.position.set(1.5,2,2.5)}
  function hand(side){const g=new THREE.Group(),skin=new THREE.MeshStandardMaterial({color:0xd9a27c,roughness:.7});
    const palm=new THREE.Mesh(new THREE.SphereGeometry(.32,18,12),skin);palm.scale.set(1.05,.32,1.25);g.add(palm);
    for(let i=0;i<4;i++){const f=new THREE.Mesh(new THREE.CapsuleGeometry(.055,.24,4,8),skin);f.position.set((i-1.5)*.13,.05,-.42);f.rotation.x=-1.2;g.add(f)}
    const th=new THREE.Mesh(new THREE.CapsuleGeometry(.06,.2,4,8),skin);th.position.set(side*-.33,.05,-.1);th.rotation.z=side*.9;g.add(th);g.position.set(0,-.42,0);return g}
  function special(k){
    if(k==="snow"){const g=new THREE.Group(),m=new THREE.MeshStandardMaterial({color:0xeaf6ff,roughness:.1,metalness:.1,emissive:0x223344,transparent:true,opacity:.92});
      for(let a=0;a<6;a++){const arm=new THREE.Group();arm.rotation.z=a*Math.PI/3;const b=new THREE.Mesh(new THREE.BoxGeometry(.03,.8,.02),m);b.position.y=.4;arm.add(b);
        for(const t of [.3,.5,.65])for(const s of [-1,1]){const br=new THREE.Mesh(new THREE.BoxGeometry(.02,.22-t*.15,.02),m);br.position.set(s*.06,t+.03,0);br.rotation.z=-s*1;arm.add(br)}g.add(arm)}return g}
    if(k==="leaf"){const sh=new THREE.Shape();sh.moveTo(0,-.6);sh.bezierCurveTo(.45,-.3,.4,.4,0,.7);sh.bezierCurveTo(-.4,.4,-.45,-.3,0,-.6);
      const g=new THREE.Group();g.add(new THREE.Mesh(new THREE.ShapeGeometry(sh,24),new THREE.MeshStandardMaterial({color:0x4f9a3a,roughness:.6,side:THREE.DoubleSide})));
      const vm=new THREE.MeshBasicMaterial({color:0xb8e08a});const mid=new THREE.Mesh(new THREE.BoxGeometry(.015,1.25,.01),vm);mid.position.z=.005;g.add(mid);
      for(let i=0;i<6;i++)for(const s of [-1,1]){const v=new THREE.Mesh(new THREE.BoxGeometry(.008,.32-i*.03,.01),vm);v.position.set(s*.1,-.35+i*.17,.006);v.rotation.z=-s*.9;g.add(v)}return g}
    if(k==="feather"){const g=new THREE.Group(),sh=new THREE.Shape();sh.moveTo(0,-.7);sh.quadraticCurveTo(.22,0,0,.75);sh.quadraticCurveTo(-.16,0,0,-.7);
      g.add(new THREE.Mesh(new THREE.ShapeGeometry(sh,20),new THREE.MeshStandardMaterial({color:0x2c2f3a,roughness:.35,metalness:.3,side:THREE.DoubleSide})));
      const r=new THREE.Mesh(new THREE.CylinderGeometry(.012,.02,1.6,6),new THREE.MeshStandardMaterial({color:0xddd6c8}));r.position.y=-.05;g.add(r);return g}
    if(k==="shell"){const g=new THREE.Group(),m=new THREE.MeshStandardMaterial({color:0xf1d9c0,roughness:.3,metalness:.05});
      for(let i=0;i<26;i++){const t=i/25,a=t*Math.PI*3.2,r=.08+t*.42;const s=new THREE.Mesh(new THREE.SphereGeometry(.05+t*.17,12,8),m);s.position.set(Math.cos(a)*r*.6,Math.sin(a)*r*.6,-t*.15);g.add(s)}return g}
    return null}
  function itemObj(k){let o=special(k);if(!o){const it=C.ITEMS[k],lk=LOOK[k]||{};let mesh=C.itemMesh(k);
      const mat=lk.glass?new THREE.MeshPhysicalMaterial({color:it.color,roughness:.05,transmission:.9,thickness:.5,ior:1.5,transparent:true,opacity:.75}):new THREE.MeshStandardMaterial({color:it.color,roughness:lk.rough??.75,metalness:lk.metal||0});
      mesh.material=mat;o=new THREE.Group();o.add(mesh);
      const box=new THREE.Box3().setFromObject(mesh),sz=box.getSize(new THREE.Vector3()),s=.9/Math.max(.001,sz.x,sz.y,sz.z);mesh.scale.multiplyScalar(s);
      const c=new THREE.Box3().setFromObject(mesh).getCenter(new THREE.Vector3());mesh.position.sub(c);
      if(["flint","stone","pyrite","quartz","lodestone","copper_ore","tin_ore","iron_ore","flake"].includes(k)){const g=mesh.geometry.clone().toNonIndexed?mesh.geometry.clone():mesh.geometry;const p=g.attributes.position;
        for(let i=0;i<p.count;i++){const n=Math.sin(p.getX(i)*13+k.length)*Math.cos(p.getY(i)*11)*.09;p.setXYZ(i,p.getX(i)*(1+n),p.getY(i)*(k==="flake"?.35:1+n),p.getZ(i)*(1-n))}g.computeVertexNormals();mesh.geometry=g}}
    return o}
  function layout(){group.clear();const n=items.length;items.forEach((k,i)=>{const side=n===1?0:i?1:-1,g=new THREE.Group();g.position.x=side*.75;const h=hand(side||1);g.add(h);const o=itemObj(k);o.position.y=.05;o.userData.spin=1;g.add(o);g.userData.item=o;group.add(g)})}
  function notesHTML(){const w=C.world,[a,b]=items,cmb=comboFor(a,b);
    const card=k=>{const it=C.ITEMS[k],n=NOTES[k]||["You turn it over in your hands.","",""],first=!w.observed.includes(k);const dens=it.density,heavy=dens>3500?"surprisingly heavy for its size":dens>1500?"solid and dense":dens<1000?"light — lighter than water":"about as heavy as you'd expect";
      return `<div class="obsCard"><h4>${C.esc(it.name)}${first?' <span class="new">first look</span>':""}</h4><ul>${n.filter(Boolean).map((x,i)=>`<li class="${i===2?"q":""}">${C.esc(x)}</li>`).join("")}<li class="w">${it.mass} kg · ${heavy} (≈${dens} kg/m³)</li></ul></div>`};
    let h=items.map(card).join("");
    if(cmb&&b){const known=cmb.disc?C.hasD(cmb.disc):w.ideas.includes(cmb.idea);h+=`<div class="obsWhatIf ${known?"done":""}"><b>${known?"✓ ":""}What if…?</b> ${C.esc(known?cmb.title:"Turn them over together and think…")}</div>`}
    else if(b)h+=`<div class="obsWhatIf">What if…? These two don't seem to have much to do with each other.</div>`;
    else h+=`<div class="obsWhatIf small">Hold a second item (press its hotbar number) to look at both together.</div>`;
    return `<div class="obsPaper"><h3>Field notes</h3>${h}</div>`}
  function refresh(){layout();el.querySelector("#wObsNotes").innerHTML=notesHTML()}
  function openWith(k){if(!el)build();const w=C.world;w.observed=w.observed||[];w.ideas=w.ideas||[];items=[k];rotX=.35;rotY=.6;zoom=1;timer=0;comboDone=false;open=true;el.hidden=false;C.onOpen();
    resize();refresh();firstLook(k);lastT=performance.now();loop();const r=C.distract&&C.distract("observe");if(r)needyPaw=3}
  function firstLook(k){const w=C.world;if(!w.observed.includes(k)){w.observed.push(k);C.insight(3);C.toast(`You study the ${C.ITEMS[k].name.toLowerCase()} closely. (+insight)`)}
  }
  function second(k){if(!open||!k||!C.inv(k))return;if(items[0]===k&&items.length===1)return;if(items[1]===k){items=[items[0]]}else items=[items[0],k];timer=0;comboDone=false;firstLook(k);refresh()}
  function close(){if(!open)return;open=false;el.hidden=true;cancelAnimationFrame(raf);C.onClose()}
  function resize(){const cv=el.querySelector("canvas"),r=cv.getBoundingClientRect(),w=Math.max(200,r.width|0),h=Math.max(200,r.height|0);rnd.setSize(w,h,false);cam.aspect=w/h;cam.updateProjectionMatrix()}
  function check(dt){timer+=dt;if(timer>=1.4)for(const k of items)if(WONDERS[k]&&!C.hasD(WONDERS[k]))C.discover(WONDERS[k]); // a marvel, looked at for a moment
    if(comboDone||timer<2.2)return;const [a,b]=items,c=comboFor(a,b);comboDone=true;if(!c)return;
    if(c.need&&!C.hasD(c.need))return;if(c.sun&&!C.sunny())return;const w=C.world;
    if(c.disc){if(!C.hasD(c.disc)){C.discover(c.disc);C.toast(`💡 ${c.title} ${c.text}`)}}
    else if(!w.ideas.includes(c.idea)){w.ideas.push(c.idea);C.idea(c)}
    refresh()}
  function frame(dt){if(!open)return;check(dt);const t=performance.now()/1000;
    group.rotation.set(rotX*.5,0,0);group.children.forEach((g,i)=>{const o=g.userData.item;o.rotation.set(rotX,rotY+(i?.4:0),0);o.position.y=.05+Math.sin(t*1.3+i)*.02;
      if(needyPaw>0){o.rotation.z=Math.sin(t*25)*.25*needyPaw/3;o.position.x=Math.sin(t*9)*.05*needyPaw}});
    if(needyPaw>0){needyPaw-=dt;const p=el.querySelector(".obsPaw");p.hidden=needyPaw<=0;p.style.left=(20+Math.sin(t*5)*30+40)+"%"}
    cam.position.set(0,.15,3.2/zoom);cam.lookAt(0,0,0);rnd.render(scene,cam)}
  function loop(){raf=requestAnimationFrame(loop);const n=performance.now();const dt=Math.min(.1,(n-lastT)/1000);lastT=n;frame(dt)}
  return {open:openWith,close,second,get isOpen(){return open},get items(){return items.slice()},step:frame,refresh}
}
