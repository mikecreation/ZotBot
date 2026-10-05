const graph=document.querySelector("#graph");
const mapShell=document.querySelector("#mapShell");
const scene=document.querySelector("#scene");
const detail=document.querySelector("#detail");
const search=document.querySelector("#search");
const results=document.querySelector("#searchResults");
const atlasBtn=document.querySelector("#atlasBtn");
const backBtn=document.querySelector("#backBtn");
const crumb=document.querySelector("#crumb");
const mapCaption=document.querySelector("#mapCaption");
const NS="http://www.w3.org/2000/svg";

const STATUS={
  foundational:["Foundational","#ffbf57"],
  established:["Strongly established","#65f5b0"],
  active:["Active field","#66bfff"],
  disputed:["Disputed","#ffc857"],
  frontier:["Frontier / unresolved","#c497ff"],
  invalidated:["Invalidated / falsified","#ff4d67"],
  historical:["Historical / superseded","#8e96a8"],
  "dependency-broken":["Broken dependency","#ff4d67"],
  "review-required":["Review required","#ffc857"]
};

const FAMILIES=[
  {id:"roots",title:"FOUNDATIONS OF KNOWING",short:"Foundations",color:"#ffbd57",icon:"✦",tagline:"Observation · memory · causality · language · measurement · experiment",major:["Self / other","Cause / effect","More / less / number","Oral tradition","Writing & records","Experimental scientific method"]},
  {id:"formal",title:"MATHEMATICS & LOGIC",short:"Mathematics & Logic",color:"#b67cff",icon:"∑",tagline:"Proof · quantity · structure · abstraction",major:["Logic","Algebra","Geometry","Statistics","Topology","Number theory"]},
  {id:"physical",title:"PHYSICAL SCIENCES",short:"Physical Sciences",color:"#55a8ff",icon:"⚛",tagline:"Matter · energy · space · time",major:["Physics","Chemistry","Astronomy","Thermodynamics","Electromagnetism","Cosmology"]},
  {id:"earth",title:"EARTH & ENVIRONMENT",short:"Earth & Environment",color:"#40d5c6",icon:"◉",tagline:"Planet · climate · oceans · deep time",major:["Geology","Climatology","Meteorology","Hydrology","Oceanology","Paleoclimatology"]},
  {id:"life",title:"LIFE SCIENCES",short:"Life Sciences",color:"#64e886",icon:"⌬",tagline:"Life · heredity · evolution · ecosystems",major:["Biology","Genetics","Evolution by natural selection","Ecology","Microbiology","Molecular biology","Systems biology"]},
  {id:"health",title:"MEDICINE & HEALTH",short:"Medicine & Health",color:"#ff637d",icon:"✚",tagline:"Health · disease · intervention · population",major:["Early medicine","Anatomy","Epidemiology","Pathology","Pharmacology","Immunology","Oncology","Neurology"]},
  {id:"engineering",title:"ENGINEERING & TECHNOLOGY",short:"Engineering & Technology",color:"#45e5ff",icon:"⌁",tagline:"Design · machines · infrastructure · invention",major:["Engineering science","Biotechnology","Nanotechnology","Mechatronics","Geotechnology","Metrology"]},
  {id:"information",title:"INFORMATION & COGNITION",short:"Information & Cognition",color:"#8278ff",icon:"◇",tagline:"Computation · intelligence · mind · language",major:["Computer science","Artificial intelligence","Information theory","Cognitive science","Neuroscience","Psycholinguistics"]},
  {id:"social",title:"SOCIAL SCIENCES",short:"Social Sciences",color:"#ff8a58",icon:"◎",tagline:"People · institutions · incentives · societies",major:["Sociology","Psychology","Anthropology","Economics","Criminology","Demography","Social psychology"]},
  {id:"humanities",title:"HUMANITIES & PHILOSOPHY",short:"Humanities & Philosophy",color:"#ffd35f",icon:"◈",tagline:"Meaning · history · language · value · culture",major:["Philosophy","Archaeology","Epistemology","Philology","Theology","Musicology","Etymology"]}
];

const familyById=new Map(FAMILIES.map(f=>[f.id,f]));
const RELATION_PRIORITY={
  derived_from:1,enabled:2,refines:3,supports:4,depends_on:5,tests:6,
  replicates:7,failed_replication:8,related:9,supersedes:10,contradicts:11,cites:12
};
const PAGE_SIZE=12;

let model;
let nodeById=new Map();
let nodesByDomain=new Map();
let outgoingById=new Map();
let incomingById=new Map();
let reviewsByTarget=new Map();
let searchRows=[];
let activePath=[];
let familyAngles=new Map();
let childPageByKey=new Map();

const mk=(name,attrs={})=>{
  const el=document.createElementNS(NS,name);
  for(const [k,v] of Object.entries(attrs))el.setAttribute(k,v);
  return el;
};
const textNode=(x,y,txt,cls)=>{
  const t=mk("text",{x,y,class:cls});
  t.textContent=txt;
  return t;
};
const polar=(cx,cy,r,a)=>({x:cx+Math.cos(a)*r,y:cy+Math.sin(a)*r});
const esc=(s="")=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const curve=(a,b)=>`M ${a.x} ${a.y} Q ${(a.x+b.x)/2} ${(a.y+b.y)/2} ${b.x} ${b.y}`;

async function boot(){
  model=await (await fetch("./data/knowledge.json",{cache:"no-store"})).json();
  await addOlogies();
  nodeById=new Map(model.nodes.map(n=>[n.id,n]));
  buildIndexes();
  deriveStatuses();
  document.querySelector("#nodeCount").textContent=model.nodes.length.toLocaleString();
  document.querySelector("#frontierCount").textContent=model.nodes.filter(n=>n.frontier).length.toLocaleString();
  bind();
  render();
}

async function addOlogies(){
  const t=await (await fetch("./data/ologies.tsv",{cache:"no-store"})).text();
  const existing=new Map(model.nodes.map(n=>[n.label.toLowerCase(),n]));
  for(const line of t.split(/\r?\n/).slice(1)){
    if(!line.trim())continue;
    const [label,domain,era]=line.split("\t");
    const old=existing.get(label.toLowerCase());
    if(old){
      if(label.toLowerCase().endsWith("ology")&&!old.tags?.includes("ology"))(old.tags??=[]).push("ology");
      continue;
    }
    const slug=label.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
    const n={
      id:"ology."+slug,label,kind:"field",domain,era,status:"active",
      summary:"Curated seed entry in the expandable -ology registry: "+label+".",
      tags:["ology","registry-seed"],sources:[],frontier:false,aliases:[]
    };
    model.nodes.push(n);
    existing.set(label.toLowerCase(),n);
  }
}

function buildIndexes(){
  nodesByDomain=new Map();
  outgoingById=new Map();
  incomingById=new Map();
  reviewsByTarget=new Map();

  for(const n of model.nodes){
    if(!nodesByDomain.has(n.domain))nodesByDomain.set(n.domain,[]);
    nodesByDomain.get(n.domain).push(n);
  }

  for(const e of model.edges){
    if(!outgoingById.has(e.source))outgoingById.set(e.source,[]);
    if(!incomingById.has(e.target))incomingById.set(e.target,[]);
    outgoingById.get(e.source).push(e);
    incomingById.get(e.target).push(e);
  }

  for(const r of model.reviews||[]){
    if(!reviewsByTarget.has(r.target))reviewsByTarget.set(r.target,[]);
    reviewsByTarget.get(r.target).push(r);
  }

  searchRows=model.nodes.map(n=>({
    id:n.id,
    label:n.label.toLowerCase(),
    text:[n.label,n.summary,n.kind,n.domain,...(n.tags||[]),...(n.aliases||[])].join(" ").toLowerCase()
  }));
}

function deriveStatuses(){
  model.nodes.forEach(n=>n._status=n.status);
  const hard=new Map(),soft=new Map();

  for(const e of model.edges){
    if(!["depends_on","enabled","derived_from"].includes(e.type))continue;
    const target=e.dependency==="hard"?hard:soft;
    if(!target.has(e.source))target.set(e.source,[]);
    target.get(e.source).push(e.target);
  }

  const invalid=new Set(model.nodes.filter(n=>n.status==="invalidated").map(n=>n.id));
  const broken=new Set();
  const q=[...invalid];

  while(q.length){
    const id=q.shift();
    for(const child of hard.get(id)||[]){
      if(!invalid.has(child)&&!broken.has(child)){
        broken.add(child);
        q.push(child);
      }
    }
  }

  for(const id of broken){
    const n=nodeById.get(id);
    if(n)n._status="dependency-broken";
  }

  const review=new Set();
  const q2=[...invalid,...broken];

  while(q2.length){
    const id=q2.shift();
    for(const child of soft.get(id)||[]){
      if(!review.has(child)){
        review.add(child);
        q2.push(child);
      }
    }
  }

  for(const id of review){
    const n=nodeById.get(id);
    if(n&&!["invalidated","dependency-broken"].includes(n._status))n._status="review-required";
  }
}

function familyNodes(id){return nodesByDomain.get(id)||[]}

function majorNodes(f){
  const all=familyNodes(f.id);
  const out=[];
  for(const label of f.major){
    const n=all.find(x=>x.label.toLowerCase()===label.toLowerCase());
    if(n&&!out.includes(n))out.push(n);
  }
  return out;
}

function tokenKey(token){
  return token.kind==="family"?"family:"+token.id:"node:"+token.id;
}

function familyToken(id){
  return {kind:"family",id,angle:familyAngles.get(id),r:330};
}

function nodeToken(node,layout){
  return {kind:"node",id:node.id,angle:layout.angle,r:layout.r,relation:layout.relation||"category"};
}

function currentToken(){
  return activePath[activePath.length-1]||null;
}

function pathNodeIds(){
  return new Set(activePath.filter(t=>t.kind==="node").map(t=>t.id));
}

function childrenFor(token){
  if(!token)return[];

  if(token.kind==="family"){
    return majorNodes(familyById.get(token.id)).map(node=>({node,relation:"category"}));
  }

  const used=pathNodeIds();
  const unique=new Map();

  for(const edge of outgoingById.get(token.id)||[]){
    const node=nodeById.get(edge.target);
    if(!node||used.has(node.id))continue;
    const old=unique.get(node.id);
    if(!old||(RELATION_PRIORITY[edge.type]||99)<(RELATION_PRIORITY[old.relation]||99)){
      unique.set(node.id,{node,relation:edge.type});
    }
  }

  return [...unique.values()].sort((a,b)=>{
    const af=a.node.frontier?1:0,bf=b.node.frontier?1:0;
    if(af!==bf)return af-bf;
    const ar=RELATION_PRIORITY[a.relation]||99,br=RELATION_PRIORITY[b.relation]||99;
    if(ar!==br)return ar-br;
    return a.node.label.localeCompare(b.node.label);
  });
}

function pageChildren(token){
  const all=childrenFor(token);
  const key=tokenKey(token);
  const pages=Math.max(1,Math.ceil(all.length/PAGE_SIZE));
  const rawPage=childPageByKey.get(key)||0;
  const page=rawPage%pages;
  const start=page*PAGE_SIZE;
  return {all,page,pages,items:all.slice(start,start+PAGE_SIZE)};
}

function layoutChildren(token,items){
  if(!items.length)return[];

  const rows=[];
  for(let i=0;i<items.length;i+=4)rows.push(items.slice(i,i+4));

  const output=[];
  rows.forEach((row,rowIndex)=>{
    const r=token.r+175+rowIndex*118;
    const count=row.length;
    const span=count===1?0:clamp(.34+(count-1)*.18,.34,.9);
    row.forEach((item,i)=>{
      const offset=count===1?0:-span/2+i*(span/(count-1));
      output.push({
        ...item,
        angle:token.angle+offset,
        r
      });
    });
  });

  return output;
}

function cameraCenter(){
  return{x:800,y:500};
}

function visibleFocusPoints(center){
  if(!activePath.length)return[];

  const token=currentToken();
  const points=[];

  // At shallow depth keep Human Knowledge in frame. Deeper down, follow the
  // living end of the branch so labels never become microscope-sized.
  if(activePath.length<=2){
    points.push({x:center.x,y:center.y,pad:135});
  }

  const start=Math.max(0,activePath.length-4);
  for(let i=start;i<activePath.length;i++){
    const t=activePath[i];
    points.push({...tokenPosition(t,center),pad:t.kind==="family"?115:82});
  }

  const {items}=pageChildren(token);
  for(const layout of layoutChildren(token,items)){
    points.push({...polar(center.x,center.y,layout.r,layout.angle),pad:80});
  }

  if(!items.length&&token.kind==="node"){
    points.push({...polar(center.x,center.y,token.r+170,token.angle),pad:72});
  }

  return points;
}

function fitViewToActiveBranch(center){
  if(!activePath.length){
    graph.setAttribute("viewBox","0 0 1600 1000");
    return;
  }

  const points=visibleFocusPoints(center);
  if(!points.length)return;

  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for(const p of points){
    const pad=p.pad||70;
    minX=Math.min(minX,p.x-pad);
    maxX=Math.max(maxX,p.x+pad);
    minY=Math.min(minY,p.y-pad);
    maxY=Math.max(maxY,p.y+pad);
  }

  const shellW=Math.max(1,mapShell.clientWidth||1200);
  const shellH=Math.max(1,mapShell.clientHeight||760);
  const aspect=shellW/shellH;

  let width=Math.max(760,maxX-minX+110);
  let height=Math.max(540,maxY-minY+110);

  // Do not zoom farther out forever as the path gets deeper.
  width=Math.min(width,1320);
  height=Math.min(height,860);

  if(width/height<aspect)width=height*aspect;
  else height=width/aspect;

  width=Math.min(width,1400);
  height=Math.min(height,900);

  const token=currentToken();
  const {items}=pageChildren(token);
  const layouts=layoutChildren(token,items);
  const currentPos=tokenPosition(token,center);

  // Bias the viewport toward the newly opened children so the click visibly
  // opens forward instead of pinning the expansion against an edge.
  let targetX=currentPos.x,targetY=currentPos.y;
  if(layouts.length){
    const childPoints=layouts.map(x=>polar(center.x,center.y,x.r,x.angle));
    const avgX=childPoints.reduce((s,p)=>s+p.x,0)/childPoints.length;
    const avgY=childPoints.reduce((s,p)=>s+p.y,0)/childPoints.length;
    targetX=currentPos.x*.42+avgX*.58;
    targetY=currentPos.y*.42+avgY*.58;
  }

  const bboxCX=(minX+maxX)/2,bboxCY=(minY+maxY)/2;
  const cx=bboxCX*.35+targetX*.65;
  const cy=bboxCY*.35+targetY*.65;

  graph.setAttribute("viewBox",[
    (cx-width/2).toFixed(2),
    (cy-height/2).toFixed(2),
    width.toFixed(2),
    height.toFixed(2)
  ].join(" "));
}

function tokenPosition(token,camera){
  return polar(camera.x,camera.y,token.r,token.angle);
}

function render(){
  const frag=document.createDocumentFragment();
  const camera=cameraCenter();
  const center={x:camera.x,y:camera.y};
  const ringR=330;
  const step=Math.PI*2/FAMILIES.length;

  familyAngles=new Map();
  FAMILIES.forEach((f,i)=>familyAngles.set(f.id,-Math.PI/2+i*step));

  if(activePath[0]?.kind==="family"){
    activePath[0].angle=familyAngles.get(activePath[0].id);
    activePath[0].r=ringR;
  }

  drawFogAndOrbits(frag,center);
  drawBaseBranches(frag,center,ringR);
  drawCore(frag,center);
  drawFamilies(frag,center,ringR);
  drawActivePath(frag,center);
  drawCurrentChildren(frag,center);

  scene.replaceChildren(frag);
  fitViewToActiveBranch(center);
  renderBreadcrumb();
  renderDetail();
  renderCaption();

  backBtn.hidden=!activePath.length;
  backBtn.textContent=activePath.length>1?"← ONE LEVEL":"← ALL KNOWLEDGE";
}

function drawFogAndOrbits(parent,center){
  parent.append(mk("circle",{cx:center.x,cy:center.y,r:443,class:"fogRing"}));
  parent.append(mk("circle",{cx:center.x,cy:center.y,r:330,class:"atlasOrbit"}));
  parent.append(mk("circle",{cx:center.x,cy:center.y,r:217,class:"atlasOrbit dashed"}));

  const fogLabel=polar(center.x,center.y,455,-Math.PI/2);
  parent.append(textNode(fogLabel.x,fogLabel.y-10,"THE MAPPED EDGE CONTINUES OUTWARD","fogText"));
}

function drawBaseBranches(parent,center,ringR){
  const selected=activePath[0]?.id||null;

  FAMILIES.forEach(f=>{
    const a=familyAngles.get(f.id);
    const start=polar(center.x,center.y,112,a);
    const end=polar(center.x,center.y,ringR-82,a);
    const g=mk("g",{class:"atlasBranch"+(selected&&selected!==f.id?" dim":"")});
    g.append(mk("path",{d:curve(start,end),class:"atlasTrunk",stroke:f.color}));
    g.append(mk("path",{d:curve(start,end),class:"atlasTrunkCore",stroke:f.color}));
    parent.append(g);
  });
}

function drawCore(parent,center){
  const g=mk("g",{class:"knowledgeCore"});
  g.append(mk("circle",{cx:center.x,cy:center.y,r:148,class:"halo"}));
  g.append(mk("circle",{cx:center.x,cy:center.y,r:96,class:"ring"}));
  g.append(mk("circle",{cx:center.x,cy:center.y,r:116,class:"ring2"}));
  g.append(textNode(center.x,center.y-20,"HUMAN","coreTitle"));
  g.append(textNode(center.x,center.y+12,"KNOWLEDGE","coreTitle"));
  g.append(textNode(center.x,center.y+43,"THE SHARED PROJECT OF KNOWING","coreSub"));
  g.append(textNode(center.x,center.y+65,model.nodes.length.toLocaleString()+" MAPPED NODES","coreCount"));
  g.addEventListener("click",()=>{activePath=[];render()});
  parent.append(g);
}

function drawFamilies(parent,center,ringR){
  const selected=activePath[0]?.id||null;

  FAMILIES.forEach(f=>{
    const angle=familyAngles.get(f.id);
    const p=polar(center.x,center.y,ringR,angle);
    const nodes=familyNodes(f.id);
    const front=nodes.filter(n=>n.frontier).length;
    const active=selected===f.id;

    const g=mk("g",{
      class:"domainGroup"+(active?" selected":"")+(selected&&!active?" dim":""),
      transform:`translate(${p.x} ${p.y})`
    });

    g.append(mk("circle",{r:104,fill:f.color,class:"halo"}));
    g.append(mk("circle",{r:78,class:"disc",stroke:f.color}));
    g.append(mk("circle",{r:89,class:"ring",stroke:f.color}));

    for(let j=0;j<10;j++){
      const a=j*Math.PI*2/10;
      const p1=polar(0,0,94,a),p2=polar(0,0,101,a);
      g.append(mk("line",{x1:p1.x,y1:p1.y,x2:p2.x,y2:p2.y,stroke:f.color,class:"orbitTick"}));
    }

    g.append(textNode(0,-24,f.icon,"domainIcon"));
    const lines=labelLines(f.title,18);
    lines.slice(0,2).forEach((line,i)=>g.append(textNode(0,10+i*17,line,"domainTitle")));
    g.append(textNode(0,lines.length>1?49:34,nodes.length.toLocaleString()+" mapped"+(front?" · "+front+" frontier":""),"domainCount"));
    g.append(textNode(0,lines.length>1?64:50,active?"OPEN":"EXPAND →","domainHint"));

    g.addEventListener("click",()=>{
      if(activePath[0]?.id===f.id){
        activePath=[familyToken(f.id)];
      }else{
        activePath=[familyToken(f.id)];
      }
      render();
    });

    parent.append(g);
  });
}

function drawActivePath(parent,center){
  if(activePath.length<2)return;

  for(let i=1;i<activePath.length;i++){
    const prev=activePath[i-1];
    const current=activePath[i];
    const a=tokenPosition(prev,center);
    const b=tokenPosition(current,center);
    const f=familyById.get(activePath[0].id);
    parent.append(mk("path",{d:curve(a,b),class:"pathGlow",stroke:f.color}));
    parent.append(mk("path",{d:curve(a,b),class:"pathCore",stroke:f.color}));
  }

  for(let i=1;i<activePath.length;i++){
    const token=activePath[i];
    const node=nodeById.get(token.id);
    if(!node)continue;
    const p=tokenPosition(token,center);
    drawKnowledgeNode(parent,node,p,token,token===currentToken(),"path",()=>truncateTo(i));
  }
}

function drawCurrentChildren(parent,center){
  const token=currentToken();
  if(!token)return;

  const {all,page,pages,items}=pageChildren(token);
  const layouts=layoutChildren(token,items);
  const f=familyById.get(activePath[0]?.id||token.id)||FAMILIES[0];
  const parentPos=token.kind==="family"
    ?polar(center.x,center.y,token.r,token.angle)
    :tokenPosition(token,center);

  layouts.forEach(layout=>{
    const childPos=polar(center.x,center.y,layout.r,layout.angle);
    parent.append(mk("path",{d:curve(parentPos,childPos),class:"childGlow",stroke:f.color}));
    parent.append(mk("path",{d:curve(parentPos,childPos),class:"childCore",stroke:f.color}));

    const childToken=nodeToken(layout.node,layout);
    drawKnowledgeNode(parent,layout.node,childPos,childToken,false,"child",()=>{
      activePath.push(childToken);
      render();
    },layout.relation);
  });

  if(pages>1){
    const navR=token.r+175+(Math.ceil(items.length/4))*118;
    const navPos=polar(center.x,center.y,navR,token.angle);
    const remaining=Math.max(0,all.length-(page+1)*PAGE_SIZE);
    const nextCount=remaining||Math.min(PAGE_SIZE,all.length);
    const g=mk("g",{class:"moreNode",transform:`translate(${navPos.x} ${navPos.y})`});
    g.append(mk("circle",{r:38}));
    g.append(textNode(0,-4,"MORE","moreTitle"));
    g.append(textNode(0,12,"+"+nextCount+" branches","moreMeta"));
    g.addEventListener("click",()=>{
      childPageByKey.set(tokenKey(token),(page+1)%pages);
      render();
    });
    parent.append(g);
  }

  if(!all.length&&token.kind==="node"){
    const node=nodeById.get(token.id);
    if(node?.frontier){
      const p=polar(center.x,center.y,token.r+170,token.angle);
      drawFrontierMarker(parent,p,"KNOWN FRONTIER");
    }else{
      const p=polar(center.x,center.y,token.r+155,token.angle);
      drawFrontierMarker(parent,p,"UNMAPPED NEXT LAYER");
    }
  }
}

function drawKnowledgeNode(parent,node,p,token,isCurrent,role,onClick,relation=""){
  const f=familyById.get(activePath[0]?.id||node.domain)||FAMILIES[0];
  const [,statusColor]=STATUS[node._status]||STATUS.active;
  const challenged=["invalidated","dependency-broken"].includes(node._status);
  const review=["review-required","disputed"].includes(node._status);
  const cls=[
    "knowledgeNode",role,
    isCurrent?"current":"",
    node.frontier?"frontier":"",
    challenged?"invalidated":"",
    review?"review":""
  ].filter(Boolean).join(" ");

  const g=mk("g",{class:cls,transform:`translate(${p.x} ${p.y})`});
  const radius=isCurrent?62:54;

  g.append(mk("circle",{r:radius+16,fill:f.color,class:"halo"}));
  g.append(mk("circle",{r:radius,class:"disc",stroke:node.frontier?"#c497ff":f.color}));
  g.append(mk("circle",{cx:0,cy:-radius+4,r:5,fill:statusColor,class:"status"}));

  const lines=labelLines(node.label,19);
  const start=lines.length>1?-8:1;
  lines.slice(0,2).forEach((line,i)=>g.append(textNode(0,start+i*15,line,"nodeTitle")));

  const childCount=childrenFor(token).length;
  const meta=node.frontier?"FRONTIER":childCount?childCount+" NEXT":node.kind.toUpperCase();
  g.append(textNode(0,lines.length>1?28:22,meta,"nodeMeta"));

  if(relation&&relation!=="category"){
    const badge=mk("g",{class:"nodeRelation",transform:`translate(0 ${radius+18})`});
    badge.append(mk("rect",{x:-37,y:-8,width:74,height:16,rx:8}));
    badge.append(textNode(0,3,String(relation).replaceAll("_"," "),"nodeRelationText"));
    g.append(badge);
  }

  if(challenged)g.append(mk("line",{x1:-radius*.7,y1:radius*.65,x2:radius*.7,y2:-radius*.65,class:"strike"}));

  const title=mk("title");
  title.textContent=node.label;
  g.append(title);
  g.addEventListener("click",ev=>{ev.stopPropagation();onClick()});
  parent.append(g);
}

function drawFrontierMarker(parent,p,label){
  const g=mk("g",{class:"frontierMarker",transform:`translate(${p.x} ${p.y})`});
  g.append(mk("circle",{r:52,class:"fogDisc"}));
  g.append(mk("circle",{r:38,class:"fogRingSmall"}));
  g.append(textNode(0,-2,label,"frontierTitle"));
  g.append(textNode(0,13,"Nemesis can extend here","frontierSub"));
  parent.append(g);
}

function labelLines(label,maxChars){
  const words=String(label).split(/\s+/);
  if(label.length<=maxChars)return[label];

  const lines=[""];
  for(const word of words){
    const current=lines[lines.length-1];
    if((current+" "+word).trim().length<=maxChars||!current){
      lines[lines.length-1]=(current+" "+word).trim();
    }else if(lines.length<2){
      lines.push(word);
    }else{
      lines[1]=(lines[1]+" "+word).trim();
    }
  }

  if(lines[1]?.length>maxChars+5)lines[1]=lines[1].slice(0,maxChars+2).trim()+"…";
  return lines;
}

function truncateTo(index){
  activePath=activePath.slice(0,index+1);
  render();
}

function stepBack(){
  if(!activePath.length)return;
  activePath.pop();
  render();
}

function renderBreadcrumb(){
  const parts=[{label:"Human Knowledge",depth:-1},...activePath.map((t,i)=>({
    label:t.kind==="family"?familyById.get(t.id)?.short||t.id:nodeById.get(t.id)?.label||t.id,
    depth:i
  }))];

  crumb.innerHTML=parts.map((p,i)=>{
    const last=i===parts.length-1;
    return '<button class="crumbBtn'+(last?' current':'')+'" data-depth="'+p.depth+'">'+esc(p.label)+'</button>'+(last?'':'<span class="crumbSep">/</span>');
  }).join("");

  crumb.querySelectorAll("[data-depth]").forEach(btn=>btn.addEventListener("click",()=>{
    const depth=Number(btn.dataset.depth);
    if(depth<0)activePath=[];
    else activePath=activePath.slice(0,depth+1);
    render();
  }));
}

function renderCaption(){
  if(!activePath.length){
    mapCaption.innerHTML="<b>THE ATLAS</b><span>Ten great fields surround Human Knowledge. Pick one. The selected branch keeps unfolding outward for as many mapped layers as exist.</span>";
    return;
  }

  const token=currentToken();
  const {all,page,pages}=pageChildren(token);
  const name=token.kind==="family"?familyById.get(token.id)?.short:nodeById.get(token.id)?.label;

  mapCaption.innerHTML="<b>"+esc(String(name||"BRANCH").toUpperCase())+"</b><span>"+
    (all.length
      ?all.length+" mapped next branch"+(all.length===1?"":"es")+" · click one to continue outward"+(pages>1?" · sibling page "+(page+1)+" of "+pages:"")
      :"No deeper mapped child yet. This point is now visible as a Nemesis coverage target.")+
    "</span>";
}

function renderDetail(){
  const token=currentToken();

  if(!token){
    detail.innerHTML='<div class="detailHero"><div class="eyebrow">HUMAN KNOWLEDGE</div><h2>Choose a great field</h2><p>The first screen is deliberately spacious. Pick a field and its immediate categories expand outward. Pick one of those and the next layer expands again.</p></div><section class="detailSection"><h3>THE RULE</h3><p>The atlas never switches to a second chart anymore. The branch itself is the chart.</p></section>';
    return;
  }

  if(token.kind==="family"){
    const f=familyById.get(token.id);
    const nodes=familyNodes(f.id);
    const children=childrenFor(token);
    detail.innerHTML='<div class="detailHero"><div class="eyebrow">GREAT FIELD</div><h2>'+esc(f.short)+'</h2><p>'+esc(f.tagline)+'.</p><div class="numberGrid"><div class="numberBox"><b>'+nodes.length+'</b><span>mapped items</span></div><div class="numberBox"><b>'+nodes.filter(n=>n.frontier).length+'</b><span>frontiers</span></div><div class="numberBox"><b>'+children.length+'</b><span>next categories</span></div><div class="numberBox"><b>'+activePath.length+'</b><span>path depth</span></div></div></div><section class="detailSection"><h3>NEXT CATEGORIES</h3>'+children.map(({node})=>'<button class="nodeLink" data-child="'+esc(node.id)+'"><span>'+esc(node.label)+'</span><small>expand →</small></button>').join("")+'</section>';
    bindDetailChildren();
    return;
  }

  const n=nodeById.get(token.id);
  const f=familyById.get(activePath[0]?.id)||familyById.get(n.domain);
  const [statusLabel,statusColor]=STATUS[n._status]||STATUS.active;
  const children=childrenFor(token);
  const incoming=(incomingById.get(n.id)||[]);
  const outgoing=(outgoingById.get(n.id)||[]);
  const sources=n.sources||[];
  const reviews=reviewsByTarget.get(n.id)||[];

  detail.innerHTML='<div class="detailHero"><div class="eyebrow">'+esc(f?.short||n.domain)+' · DEPTH '+Math.max(1,activePath.length-1)+'</div><h2>'+esc(n.label)+'</h2><span class="pill"><i style="background:'+statusColor+'"></i>'+esc(statusLabel)+'</span>'+(n.frontier?'<span class="pill">frontier</span>':'')+'<p>'+esc(n.summary||"No summary attached yet.")+'</p><div class="numberGrid"><div class="numberBox"><b>'+children.length+'</b><span>next branches</span></div><div class="numberBox"><b>'+incoming.length+'</b><span>incoming</span></div><div class="numberBox"><b>'+sources.length+'</b><span>sources</span></div><div class="numberBox"><b>'+reviews.length+'</b><span>reviews</span></div></div></div><section class="detailSection"><h3>NEXT MAPPED LAYER</h3>'+(children.length?children.map(({node,relation})=>'<button class="nodeLink" data-child="'+esc(node.id)+'"><span>'+esc(node.label)+'</span><small>'+esc(relation)+' →</small></button>').join(""):'<p class="coverageGap">'+(n.frontier?"This node is already a mapped frontier.":"The hierarchy currently ends here. Nemesis can fill the next layer without changing this renderer.")+'</p>')+'</section><section class="detailSection"><h3>PROVENANCE</h3>'+(sources.length?sources.slice(0,6).map(s=>'<p><a href="'+esc(s.url)+'" target="_blank" rel="noreferrer">'+esc(s.title||s.id)+'</a></p>').join(""):'<p>No source attached yet.</p>')+'</section>';

  bindDetailChildren();
}

function bindDetailChildren(){
  const token=currentToken();
  const {all}=pageChildren(token);
  detail.querySelectorAll("[data-child]").forEach(btn=>btn.addEventListener("click",()=>{
    const id=btn.dataset.child;
    const allChildren=childrenFor(token);
    const index=allChildren.findIndex(x=>x.node.id===id);
    if(index<0)return;

    childPageByKey.set(tokenKey(token),Math.floor(index/PAGE_SIZE));
    const page=pageChildren(token);
    const layouts=layoutChildren(token,page.items);
    const layout=layouts.find(x=>x.node.id===id);
    if(!layout)return;

    activePath.push(nodeToken(layout.node,layout));
    render();
  }));
}

function searchScore(row,q){
  if(row.label===q)return 1000;
  if(row.label.startsWith(q))return 500;
  if(row.label.includes(q))return 250;
  if(row.text.includes(q))return 50;
  return 0;
}

function findPathTo(domain,targetId){
  const f=familyById.get(domain);
  if(!f)return null;
  const roots=majorNodes(f);

  for(const root of roots){
    if(root.id===targetId)return[root.id];
  }

  const queue=roots.map(root=>[root.id]);
  const seen=new Set(roots.map(r=>r.id));

  while(queue.length){
    const path=queue.shift();
    if(path.length>7)continue;
    const last=path[path.length-1];

    for(const edge of outgoingById.get(last)||[]){
      if(seen.has(edge.target))continue;
      const node=nodeById.get(edge.target);
      if(!node)continue;
      const next=[...path,node.id];
      if(node.id===targetId)return next;
      seen.add(node.id);
      queue.push(next);
    }
  }
  return null;
}

function activateSearchResult(node){
  const family=familyById.get(node.domain);
  if(!family)return;

  activePath=[familyToken(node.domain)];
  const ids=findPathTo(node.domain,node.id);

  if(ids){
    for(const id of ids){
      const parent=currentToken();
      const children=childrenFor(parent);
      const index=children.findIndex(x=>x.node.id===id);
      if(index<0)break;
      childPageByKey.set(tokenKey(parent),Math.floor(index/PAGE_SIZE));
      const page=pageChildren(parent);
      const layout=layoutChildren(parent,page.items).find(x=>x.node.id===id);
      if(!layout)break;
      activePath.push(nodeToken(layout.node,layout));
    }
  }

  render();
}

function showSearch(){
  const q=search.value.trim().toLowerCase();
  if(!q){
    results.hidden=true;
    results.innerHTML="";
    return;
  }

  const hits=[];
  for(const row of searchRows){
    const score=searchScore(row,q);
    if(score)hits.push({score,node:nodeById.get(row.id)});
  }
  hits.sort((a,b)=>b.score-a.score||a.node.label.localeCompare(b.node.label));
  const top=hits.slice(0,18);

  results.innerHTML=top.length
    ?top.map(({node:n})=>'<button class="searchHit" data-node="'+esc(n.id)+'"><b>'+esc(n.label)+'</b><span>'+esc(familyById.get(n.domain)?.short||n.domain)+' · '+esc(n.kind)+'</span></button>').join("")
    :'<div class="searchHit"><b>No mapped match</b><span>This can become a Nemesis coverage target.</span></div>';

  results.hidden=false;
  results.querySelectorAll("[data-node]").forEach(btn=>btn.addEventListener("click",()=>{
    const n=nodeById.get(btn.dataset.node);
    results.hidden=true;
    search.value="";
    if(n)activateSearchResult(n);
  }));
}

function bind(){
  atlasBtn.addEventListener("click",()=>{
    activePath=[];
    render();
  });

  backBtn.addEventListener("click",stepBack);
  search.addEventListener("input",showSearch);

  document.addEventListener("click",e=>{
    if(!results.contains(e.target)&&e.target!==search)results.hidden=true;
  });

  document.addEventListener("keydown",e=>{
    if(e.key==="/"&&!["INPUT","TEXTAREA"].includes(document.activeElement?.tagName)){
      e.preventDefault();
      search.focus();
      search.select();
    }

    if(e.key==="Escape"){
      if(!results.hidden){
        results.hidden=true;
        return;
      }
      if(activePath.length)stepBack();
    }
  });
}

boot().catch(err=>{
  console.error(err);
  detail.innerHTML='<div class="detailHero"><div class="eyebrow">ERROR</div><h2>Map failed to load</h2><p>'+esc(err.message)+'</p></div>';
});
