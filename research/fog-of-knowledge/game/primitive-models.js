import * as T from './vendor/three.module.min.js';
let grain;
const wood=()=>{
  if(!grain){const data=new Uint8Array(64*64*4);for(let y=0;y<64;y++)for(let x=0;x<64;x++){const i=(x+y*64)*4,v=185+Math.sin(x*.8+Math.sin(y*.12)*1.8)*25+Math.sin(x*2.3+y*.04)*12;data[i]=v;data[i+1]=v*.92;data[i+2]=v*.78;data[i+3]=255}grain=new T.DataTexture(data,64,64);grain.wrapS=grain.wrapT=T.RepeatWrapping;grain.magFilter=T.LinearFilter;grain.needsUpdate=true}
  return new T.MeshStandardMaterial({color:0xb58250,map:grain,roughness:.95});
};
const cord=()=>new T.MeshStandardMaterial({color:0xb5a06b,roughness:1});
function block(g,x,y,z,w,h,d,mat){const m=new T.Mesh(new T.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);m.castShadow=m.receiveShadow=true;g.add(m);return m}
function wrap(g,x,y,z,axis='x',radius=.085){
  for(let i=-1;i<=1;i++){const m=new T.Mesh(new T.TorusGeometry(radius,.009,5,14),cord());m.position.set(x+(axis==='x'?i*.025:0),y+(axis==='y'?i*.025:0),z);m.rotation.y=axis==='x'?Math.PI/2:0;m.rotation.x=axis==='y'?Math.PI/2:0;g.add(m)}
}
export function primitiveItem(k){
  if(['needle_iron','iron_spike','hammer_stone','tongs','leather_gloves','climbing_gloves','leather','thread','bark'].includes(k)){
    const g=new T.Group(),metal=new T.MeshStandardMaterial({color:0x9a9fa5,metalness:.8,roughness:.4}),hide=new T.MeshStandardMaterial({color:0x885b39,roughness:.95});
    if(k.endsWith('gloves'))for(const side of [-1,1]){const x=side*.1;block(g,x,0,0,.14,.18,.045,hide);for(let i=0;i<4;i++)block(g,x+(i-1.5)*.03,.13,0,.024,.1,.035,hide);block(g,x+side*.08,.02,0,.05,.09,.04,hide);if(k==='climbing_gloves')for(let i=0;i<3;i++){const m=new T.Mesh(new T.ConeGeometry(.012,.07,6),metal);m.rotation.x=Math.PI/2;m.position.set(x+(i-1)*.04,0,.05);g.add(m)}}
    else if(k==='needle_iron'){const m=new T.Mesh(new T.ConeGeometry(.008,.3,8),metal);g.add(m);const eye=new T.Mesh(new T.TorusGeometry(.012,.004,5,12),metal);eye.position.y=-.15;g.add(eye)}
    else if(k==='iron_spike'){const m=new T.Mesh(new T.ConeGeometry(.035,.19,6),metal);g.add(m);block(g,0,-.1,0,.1,.025,.08,metal)}
    else if(k==='hammer_stone'){block(g,0,-.08,0,.04,.4,.04,wood());block(g,0,.13,0,.23,.13,.1,new T.MeshStandardMaterial({color:0x777777}));wrap(g,0,.13,0,'y',.04)}
    else if(k==='tongs'){for(const side of [-1,1]){const rod=block(g,side*.025,0,0,.025,.4,.025,metal);rod.rotation.z=side*.17}block(g,0,.04,.018,.035,.035,.025,metal)}
    else if(k==='thread'){const coil=new T.Mesh(new T.TorusGeometry(.08,.02,8,24),cord());g.add(coil)}
    else block(g,0,0,0,k==='bark'?.12:.3,k==='bark'?.25:.02,.18,k==='bark'?wood():hide);
    return g;
  }
  if(k==='workbench'||k==='workbench_bundle')return workbenchMesh(k==='workbench_bundle');
  if(!['knife_stone','knife_copper','knife_bronze','knife_iron','axe_copper','axe_bronze','axe_iron','pickaxe_stone','axe_stone','hand_drill','bench_joint'].includes(k))return null;
  const g=new T.Group(),w=wood(),s=new T.MeshStandardMaterial({color:k.endsWith("copper")?0xd98a4a:k.endsWith("bronze")?0xc5913c:0x777a81,metalness:k.endsWith("stone")?0:.7,roughness:.6,flatShading:true});
  if(k==='hand_drill'){
    block(g,0,-.12,0,.38,.055,.16,w);
    const spindle=new T.Mesh(new T.CylinderGeometry(.016,.01,.52,10),w);spindle.position.y=.16;g.add(spindle);
    block(g,0,-.087,.045,.035,.009,.06,new T.MeshStandardMaterial({color:0x30251c}));
  }else if(k==='bench_joint'){
    // Two separated shoulders leave an actual open lap notch, plus a matching tongue.
    block(g,-.17,0,0,.24,.16,.16,w);block(g,.17,0,0,.24,.16,.16,w);block(g,0,-.055,0,.1,.05,.16,w);
    block(g,0,.18,0,.09,.16,.15,w);
  }else if(k.startsWith('knife_')){
    const blade=new T.Mesh(new T.ConeGeometry(.085,.32,4),s);blade.scale.z=.25;blade.position.y=.13;g.add(blade);block(g,0,-.08,0,.065,.12,.045,s);
  }else{
    block(g,0,-.14,0,.065,.67,.065,w);
    const head=new T.Mesh(k==='pickaxe_stone'?new T.ConeGeometry(.09,.55,5):new T.BoxGeometry(.29,.17,.065),s);head.rotation.z=k==='pickaxe_stone'?Math.PI/2:-.15;head.position.set(.02,.16,0);g.add(head);wrap(g,0,.16,0,'y',.055);
  }
  return g;
}
export function workbenchMesh(bundled=false){
  const g=new T.Group(),w=wood();g.userData.joinery='housed shoulders, wooden wedges and plant-fiber lashings';
  // Four corner supports. The alternate recipe bundles three poles at each corner.
  for(const x of [-.72,.72])for(const z of [-.35,.35]){
    for(let i=0;i<(bundled?3:1);i++){
      const dx=bundled?Math.cos(i*2.094)*.065:0,dz=bundled?Math.sin(i*2.094)*.065:0;
      block(g,x+dx,.42,z+dz,.11,.84,.11,w);
    }
    block(g,x,.91,z,.07,.17,.07,w); // exposed tenon through the frame
    block(g,x,.997,z,.12,.025,.035,wood()).rotation.y=.3; // locking wooden wedge
    wrap(g,x,.72,z,'y',bundled?.135:.085);if(bundled)wrap(g,x,.23,z,'y',.135);
  }
  for(const z of [-.35,.35]){
    // Segmented upper rail has real housings around the four leg tongues.
    block(g,0,.87,z,1.3,.16,.13,w);
    for(const x of [-.86,.86])block(g,x,.87,z,.16,.16,.13,w);
    block(g,0,.27,z,1.5,.07,.07,w);
  }
  for(const x of [-.72,.72])block(g,x,.79,0,.12,.1,.87,w);
  // Rectangular top made from six split wooden boards; gaps expose joinery below.
  for(let i=0;i<6;i++)block(g,0,.99,-.275+i*.11,1.8,.065,.1,w);
  g.userData.legs=4;g.userData.bundled=bundled;g.userData.boards=6;
  return g;
}
