const scene=document.querySelector("#scene");
const detail=document.querySelector("#detail");
const search=document.querySelector("#search");
const results=document.querySelector("#searchResults");
const atlasBtn=document.querySelector("#atlasBtn");
const backBtn=document.querySelector("#backBtn");
const crumb=document.querySelector("#crumb");
const mapCaption=document.querySelector("#mapCaption");
const focusOverlay=document.querySelector("#focusOverlay");
const focusScene=document.querySelector("#focusScene");
const focusClose=document.querySelector("#focusClose");
const focusPrev=document.querySelector("#focusPrev");
const focusTitle=document.querySelector("#focusTitle");
const focusSubtitle=document.querySelector("#focusSubtitle");
const focusEyebrow=document.querySelector("#focusEyebrow");
const focusStats=document.querySelector("#focusStats");
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

const FOUNDATION={
  id:"roots",title:"FOUNDATIONS OF KNOWING",short:"Foundations",color:"#ffbd57",icon:"✦",
  tagline:"Observation · memory · causality · language · measurement · experiment",
  major:["Self / other","Cause / effect","More / less / number","Oral tradition","Writing & records","Experimental scientific method"]
};

const GREAT_FIELDS=[
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

const ALL_FAMILIES=[FOUNDATION,...GREAT_FIELDS];
const familyById=new Map(ALL_FAMILIES.map(f=>[f.id,f]));

let model;
let nodeById=new Map();
let nodesByDomain=new Map();
let incomingById=new Map();
let outgoingById=new Map();
let reviewsByTarget=new Map();
let searchRows=[];
let expandedFamily=null;
let focusedNode=null;
let focusHistory=[];
const positionByFamily=new Map();

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
const curve=(a,b,bend=.5)=>`M ${a.x} ${a.y} Q ${a.x+(b.x-a.x)*bend} ${a.y+(b.y-a.y)*bend} ${b.x} ${b.y}`;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));

async function boot(){
  model=await (await fetch("./data/knowledge.json",{cache:"no-store"})).json();
  await addOlogies();
  nodeById=new Map(model.nodes.map(n=>[n.id,n]));
  buildIndexes();
  deriveStatuses();
  document.querySelector("#nodeCount").textContent=model.nodes.length.toLocaleString();
  document.querySelector("#frontierCount").textContent=model.nodes.filter(n=>n.frontier).length.toLocaleString();
  bind();
  renderAtlas();
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
  incomingById=new Map();
  outgoingById=new Map();
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
    text:[n.label,n.kind,n.domain,n.summary,...(n.tags||[]),...(n.aliases||[])].join(" ").toLowerCase()
  }));
}

function deriveStatuses(){
  model.nodes.forEach(n=>n._status=n.status);
  const hardChildren=new Map(),softChildren=new Map();

  for(const e of model.edges){
    if(!["depends_on","enabled","derived_from"].includes(e.type))continue;
    const m=e.dependency==="hard"?hardChildren:softChildren;
    if(!m.has(e.source))m.set(e.source,[]);
    m.get(e.source).push(e.target);
  }

  const invalid=model.nodes.filter(n=>n.status==="invalidated").map(n=>n.id);
  const broken=new Set(),q=[...invalid];

  while(q.length){
    const id=q.shift();
    for(const child of hardChildren.get(id)||[]){
      if(!broken.has(child)&&!invalid.includes(child)){
        broken.add(child);
        q.push(child);
      }
    }
  }

  for(const id of broken){
    const n=nodeById.get(id);
    if(n&&n.status!=="invalidated")n._status="dependency-broken";
  }

  const review=new Set(),q2=[...invalid,...broken];
  while(q2.length){
    const id=q2.shift();
    for(const child of softChildren.get(id)||[]){
      if(!review.has(child)){review.add(child);q2.push(child)}
    }
  }

  for(const id of review){
    const n=nodeById.get(id);
    if(n&&!["invalidated","dependency-broken"].includes(n._status))n._status="review-required";
  }
}

function familyNodes(id){return nodesByDomain.get(id)||[]}
function familyFrontiers(id){return familyNodes(id).filter(n=>n.frontier)}
function majorNodes(f){
  const all=familyNodes(f.id),out=[];
  for(const label of f.major){
    const n=all.find(x=>x.label.toLowerCase()===label.toLowerCase());
    if(n&&!out.includes(n))out.push(n);
  }
  return out.slice(0,8);
}
function foundationNodes(){return majorNodes(FOUNDATION)}

function annularSector(cx,cy,r1,r2,a0,a1){
  const p0=polar(cx,cy,r2,a0),p1=polar(cx,cy,r2,a1),q1=polar(cx,cy,r1,a1),q0=polar(cx,cy,r1,a0);
  const large=(a1-a0)>Math.PI?1:0;
  return `M ${p0.x} ${p0.y} A ${r2} ${r2} 0 ${large} 1 ${p1.x} ${p1.y} L ${q1.x} ${q1.y} A ${r1} ${r1} 0 ${large} 0 ${q0.x} ${q0.y} Z`;
}

function renderAtlas(nextExpanded=expandedFamily){
  expandedFamily=nextExpanded;
  focusedNode=null;
  focusOverlay.hidden=true;
  focusHistory=[];
  focusPrev.disabled=true;

  const frag=document.createDocumentFragment();
  const cx=800,cy=500,fieldRadius=392;
  const sectorStep=Math.PI*2/GREAT_FIELDS.length;

  frag.append(mk("circle",{cx,cy,r:468,class:"fogRing"}));
  frag.append(textNode(cx,38,"THE FOG · THE EDGE OF WHAT IS CURRENTLY MAPPED","fogText"));

  GREAT_FIELDS.forEach((f,i)=>{
    const a=-Math.PI/2+i*sectorStep;
    const sector=mk("path",{
      d:annularSector(cx,cy,240,472,a-sectorStep*.43,a+sectorStep*.43),
      fill:f.color,
      "fill-opacity":".055",
      class:"realmSector"+(expandedFamily&&expandedFamily!==f.id?" dim":"")
    });
    frag.append(sector);
    frag.append(mk("path",{
      d:`M ${polar(cx,cy,455,a-sectorStep*.38).x} ${polar(cx,cy,455,a-sectorStep*.38).y} A 455 455 0 0 1 ${polar(cx,cy,455,a+sectorStep*.38).x} ${polar(cx,cy,455,a+sectorStep*.38).y}`,
      stroke:f.color,class:"realmArc"
    }));
  });

  frag.append(mk("circle",{cx,cy,r:392,class:"atlasOrbit"}));
  frag.append(mk("circle",{cx,cy,r:236,class:"atlasOrbit dashed"}));
  frag.append(mk("circle",{cx,cy,r:171,class:"foundationOrbit"}));
  frag.append(textNode(cx,cy-180,"FOUNDATIONS OF KNOWING","foundationLabel"));

  GREAT_FIELDS.forEach((f,i)=>{
    const a=-Math.PI/2+i*sectorStep;
    const p=polar(cx,cy,fieldRadius,a);
    positionByFamily.set(f.id,{...p,a});
    const start=polar(cx,cy,222,a),end=polar(cx,cy,324,a);
    const branch=mk("g",{class:"atlasBranch"+(expandedFamily&&expandedFamily!==f.id?" dim":"")});
    const d=curve(start,end,.5);
    branch.append(mk("path",{d,class:"atlasTrunk",stroke:f.color}));
    branch.append(mk("path",{d,class:"atlasTrunkCore",stroke:f.color}));
    for(const t of [.25,.52,.78]){
      const sp={x:start.x+(end.x-start.x)*t,y:start.y+(end.y-start.y)*t};
      branch.append(mk("circle",{cx:sp.x,cy:sp.y,r:t>.7?2.2:1.4,fill:f.color,class:"trunkSpark"}));
    }
    frag.append(branch);
  });

  const core=mk("g",{class:"knowledgeCore"});
  core.append(mk("circle",{cx,cy,r:142,class:"halo"}));
  core.append(mk("circle",{cx,cy,r:92,class:"ring"}));
  core.append(mk("circle",{cx,cy,r:112,class:"ring2"}));
  core.append(textNode(cx,cy-17,"HUMAN","coreTitle"));
  core.append(textNode(cx,cy+10,"KNOWLEDGE","coreTitle"));
  core.append(textNode(cx,cy+37,"OBSERVE · REMEMBER · TEST · SHARE","coreSub"));
  core.append(textNode(cx,cy+57,model.nodes.length.toLocaleString()+" MAPPED NODES","coreCount"));
  frag.append(core);

  const foundations=foundationNodes();
  foundations.forEach((n,i)=>{
    const a=-Math.PI/2+i*(Math.PI*2/Math.max(foundations.length,1));
    const p=polar(cx,cy,166,a);
    const g=mk("g",{class:"foundationNode",transform:`translate(${p.x} ${p.y})`});
    g.append(mk("circle",{r:24}));
    const words=n.label.split(" "),cut=words.length>2?Math.ceil(words.length/2):words.length;
    g.append(textNode(0,-1,words.slice(0,cut).join(" "),"title"));
    if(words.slice(cut).length)g.append(textNode(0,9,words.slice(cut).join(" "),"title"));
    g.addEventListener("click",ev=>{ev.stopPropagation();openFieldChart(n.id)});
    frag.append(g);
  });

  GREAT_FIELDS.forEach((f,i)=>{
    const p=positionByFamily.get(f.id);
    const count=familyNodes(f.id).length,front=familyFrontiers(f.id).length;
    const g=mk("g",{
      class:"domainGroup"+(expandedFamily===f.id?" selected":"")+(expandedFamily&&expandedFamily!==f.id?" dim":""),
      transform:`translate(${p.x} ${p.y})`
    });
    g.append(mk("circle",{r:91,fill:f.color,class:"halo"}));
    g.append(mk("circle",{r:66,class:"disc",stroke:f.color}));
    g.append(mk("circle",{r:76,class:"ring",stroke:f.color}));
    for(let j=0;j<8;j++){
      const a=j*Math.PI*2/8,p1=polar(0,0,80,a),p2=polar(0,0,85,a);
      g.append(mk("line",{x1:p1.x,y1:p1.y,x2:p2.x,y2:p2.y,stroke:f.color,class:"orbitTick"}));
    }
    g.append(textNode(0,-18,f.icon,"domainIcon"));
    const words=f.title.split(" "),split=words.length>2?Math.ceil(words.length/2):words.length;
    const l1=words.slice(0,split).join(" "),l2=words.slice(split).join(" ");
    g.append(textNode(0,13,l1,"domainTitle"));
    if(l2)g.append(textNode(0,27,l2,"domainTitle"));
    g.append(textNode(0,l2?45:33,count.toLocaleString()+" mapped"+(front?" · "+front+" frontier":""),"domainCount"));
    g.append(textNode(0,l2?58:47,expandedFamily===f.id?"BRANCH OPEN":"EXPAND →","domainHint"));
    g.addEventListener("click",()=>expandFamily(f.id));
    g.addEventListener("mouseenter",()=>showFamilyPreview(f.id));
    frag.append(g);
  });

  if(expandedFamily)drawExpansion(expandedFamily,frag);
  scene.replaceChildren(frag);

  atlasBtn.classList.add("active");
  backBtn.hidden=!expandedFamily;
  backBtn.textContent="← COLLAPSE";
  crumb.textContent=expandedFamily?"Human Knowledge / "+familyById.get(expandedFamily).short:"Human Knowledge";
  mapCaption.innerHTML=expandedFamily
    ?"<b>BRANCH OPEN</b><span>The atlas stays intact. Pick a revealed category to open its field lens, or choose another great field to move the branch.</span>"
    :"<b>THE ATLAS</b><span>Human foundations sit closest to the center. Great fields emerge outside them. Click a field to grow its next branches in place.</span>";

  if(expandedFamily)showFamilyPreview(expandedFamily,true);
  else showAtlasIntro();
}

function expandFamily(id){
  if(expandedFamily===id){showFamilyPreview(id,true);return}
  renderAtlas(id);
}

function drawExpansion(id,parent){
  const f=familyById.get(id),anchor=positionByFamily.get(id),nodes=majorNodes(f);
  if(!anchor||!nodes.length)return;

  const span=clamp(.38+nodes.length*.105,.72,1.18);
  const startAngle=anchor.a-span/2;
  const radius=148;
  const labelP=polar(anchor.x,anchor.y,104,anchor.a);
  parent.append(textNode(labelP.x,labelP.y-3,"NEXT BRANCHES","branchLabel"));

  nodes.forEach((n,i)=>{
    const a=nodes.length===1?anchor.a:startAngle+i*(span/(nodes.length-1));
    const p=polar(anchor.x,anchor.y,radius,a);
    const d=curve({x:anchor.x,y:anchor.y},p,.56);
    parent.append(mk("path",{d,class:"expansionGlow",stroke:f.color}));
    parent.append(mk("path",{d,class:"expansionPath",stroke:f.color}));

    const [,statusColor]=STATUS[n._status]||STATUS.active;
    const g=mk("g",{class:"expansionNode",transform:`translate(${p.x} ${p.y})`});
    g.append(mk("circle",{r:43,fill:f.color,class:"halo"}));
    g.append(mk("circle",{r:30,class:"disc",stroke:f.color}));
    g.append(mk("circle",{cx:0,cy:-27,r:4.3,fill:statusColor,class:"status"}));

    const words=n.label.split(" "),cut=words.length>2?Math.ceil(words.length/2):words.length;
    g.append(textNode(0,-1,words.slice(0,cut).join(" "),"title"));
    if(words.slice(cut).length)g.append(textNode(0,10,words.slice(cut).join(" "),"title"));
    g.append(textNode(0,23,n.kind.toUpperCase(),"meta"));
    const title=mk("title");title.textContent="Open "+n.label+" field lens";g.append(title);
    g.addEventListener("click",ev=>{ev.stopPropagation();openFieldChart(n.id)});
    parent.append(g);
  });
}

function showAtlasIntro(){
  detail.innerHTML='<div class="detailHero"><div class="eyebrow">HUMAN KNOWLEDGE</div><h2>Knowledge now has depth.</h2><p>The center contains the human foundations of knowing. The outer ring contains nine great knowledge families. One branch opens at a time so the whole remains readable.</p></div><section class="detailSection"><h3>READ OUTWARD</h3><p><b>Center:</b> the human knowledge project.</p><p><b>Inner ring:</b> foundational distinctions and methods.</p><p><b>Outer ring:</b> great disciplines.</p><p><b>Bloom:</b> next-level categories.</p><p><b>Field lens:</b> evidence, prerequisites, consequences, nearby specialties, and frontier.</p></section><section class="detailSection"><h3>PERFORMANCE</h3><p>The browser only draws the visible layer and one local field lens at a time. The database can keep growing without turning the atlas into a million-node hairball.</p></section>';
}

function showFamilyPreview(id,open=false){
  const f=familyById.get(id),nodes=familyNodes(id);
  const front=nodes.filter(n=>n.frontier).length;
  const challenged=nodes.filter(n=>["invalidated","dependency-broken","review-required","disputed"].includes(n._status)).length;
  const maj=majorNodes(f);

  detail.innerHTML='<div class="detailHero"><div class="eyebrow">'+(open?"BRANCH OPEN":"GREAT FIELD")+'</div><h2>'+esc(f.short)+'</h2><p>'+esc(f.tagline)+'.</p><div class="numberGrid"><div class="numberBox"><b>'+nodes.length.toLocaleString()+'</b><span>mapped items</span></div><div class="numberBox"><b>'+front+'</b><span>frontiers</span></div><div class="numberBox"><b>'+maj.length+'</b><span>next branches</span></div><div class="numberBox"><b>'+challenged+'</b><span>challenged</span></div></div></div><section class="detailSection"><h3>NEXT CATEGORIES</h3>'+maj.map(n=>'<button class="nodeLink" data-open="'+esc(n.id)+'"><span>'+esc(n.label)+'</span><small>open lens ↗</small></button>').join("")+'</section><section class="detailSection"><h3>WHY THIS LAYER EXISTS</h3><p>The great-field ring is navigation. Evidence-driven dependency begins inside the field lens, where support, contradiction, and supersession can be shown without pretending taxonomy is causality.</p></section>';

  detail.querySelectorAll("[data-open]").forEach(b=>b.addEventListener("click",()=>openFieldChart(b.dataset.open)));
}

function openFieldChart(id,{push=true}={}){
  const n=nodeById.get(id);if(!n)return;

  if(push&&focusedNode&&focusedNode!==id)focusHistory.push(focusedNode);
  focusedNode=id;

  const f=familyById.get(n.domain)||FOUNDATION;
  focusOverlay.hidden=false;
  focusPrev.disabled=!focusHistory.length;
  focusEyebrow.textContent=(f.short||n.domain).toUpperCase()+" · FIELD LENS";
  focusTitle.textContent=n.label;

  const incoming=getIncoming(id),outgoing=getOutgoing(id),front=familyFrontiers(n.domain).filter(x=>x.id!==id);
  const sources=n.sources||[],reviews=reviewsByTarget.get(id)||[];

  focusSubtitle.textContent="A bounded local view: what feeds this, what follows from it, where the frontier sits, and what nearby knowledge exists.";
  focusStats.innerHTML=[
    ["IN",incoming.length],["OUT",outgoing.length],["FRONTIER",front.length],["SOURCES",sources.length],["REVIEWS",reviews.length]
  ].map(([k,v])=>'<span class="focusStat"><b>'+v+'</b> '+k+'</span>').join("");

  crumb.textContent="Human Knowledge / "+(f.short||n.domain)+" / "+n.label;
  drawFocusChart(n,f);
  showNodeDetail(n.id);
}

function previousFocus(){
  if(!focusHistory.length)return;
  const id=focusHistory.pop();
  openFieldChart(id,{push:false});
}

function closeFieldChart(){
  focusOverlay.hidden=true;
  focusedNode=null;
  focusHistory=[];
  focusPrev.disabled=true;
  crumb.textContent=expandedFamily?"Human Knowledge / "+familyById.get(expandedFamily).short:"Human Knowledge";
  if(expandedFamily)showFamilyPreview(expandedFamily,true);
  else showAtlasIntro();
}

function getIncoming(id){
  return (incomingById.get(id)||[]).map(e=>({edge:e,node:nodeById.get(e.source)})).filter(x=>x.node);
}
function getOutgoing(id){
  return (outgoingById.get(id)||[]).map(e=>({edge:e,node:nodeById.get(e.target)})).filter(x=>x.node);
}

function relationClass(type){
  if(type==="contradicts")return"contradicts";
  if(type==="supersedes")return"supersedes";
  return"";
}

function drawFocusChart(n,f){
  const frag=document.createDocumentFragment();
  const cx=800,cy=448;
  const incoming=getIncoming(n.id).slice(0,8);
  const outgoing=getOutgoing(n.id).slice(0,8);
  const frontiers=familyFrontiers(n.domain).filter(x=>x.id!==n.id).slice(0,6);
  const linked=new Set([n.id,...incoming.map(x=>x.node.id),...outgoing.map(x=>x.node.id),...frontiers.map(x=>x.id)]);
  const neighbors=familyNodes(n.domain).filter(x=>!linked.has(x.id)&&x.kind==="field").slice(0,12);

  frag.append(mk("path",{d:"M 405 0 H 1195 L 1125 190 Q 800 255 475 190 Z",class:"focusFog"}));
  frag.append(mk("path",{d:"M 480 187 Q 800 252 1120 187",class:"focusFogEdge"}));
  frag.append(mk("circle",{cx,cy,r:290,class:"focusOrbit"}));
  frag.append(mk("circle",{cx,cy,r:398,class:"focusOrbit"}));

  frag.append(textNode(325,118,"PREREQUISITES / SUPPORT","zoneTitle"));
  frag.append(textNode(1275,118,"DESCENDANTS / EFFECTS","zoneTitle"));
  frag.append(textNode(800,95,"CURRENT FRONTIER","zoneTitle"));
  frag.append(textNode(800,817,"NEARBY SPECIALTIES","zoneTitle"));

  const inPos=verticalPositions(300,285,235,incoming.length);
  const outPos=verticalPositions(1300,285,235,outgoing.length);
  const frontPos=horizontalPositions(560,1040,208,frontiers.length);
  const neighPos=horizontalPositions(360,1240,710,neighbors.length);

  incoming.forEach((x,i)=>{
    const p=inPos[i],to={x:cx-87,y:cy};
    const cls="focusLink in "+relationClass(x.edge.type);
    frag.append(mk("path",{d:curve(p,to,.58),class:cls}));
    drawRelationBadge(frag,x.edge.type,{x:(p.x+to.x)/2,y:(p.y+to.y)/2});
    drawFocusNode(frag,x.node,p,f,"in");
  });

  outgoing.forEach((x,i)=>{
    const p=outPos[i],from={x:cx+87,y:cy};
    const cls="focusLink out "+relationClass(x.edge.type);
    frag.append(mk("path",{d:curve(from,p,.58),class:cls}));
    drawRelationBadge(frag,x.edge.type,{x:(p.x+from.x)/2,y:(p.y+from.y)/2});
    drawFocusNode(frag,x.node,p,f,"out");
  });

  frontiers.forEach((node,i)=>{
    const p=frontPos[i],from={x:cx,y:cy-86};
    frag.append(mk("path",{d:curve(from,p,.52),class:"focusLink related"}));
    drawFocusNode(frag,node,p,f,"frontier");
  });

  neighbors.forEach((node,i)=>{
    const p=neighPos[i],from={x:cx,y:cy+86};
    frag.append(mk("path",{d:curve(from,p,.5),class:"focusLink related"}));
    drawFocusNode(frag,node,p,f,"neighbor");
  });

  const [statusLabel,statusColor]=STATUS[n._status]||STATUS.active;
  const center=mk("g",{class:"focusCenter"});
  center.append(mk("circle",{cx,cy,r:138,fill:f.color,class:"halo"}));
  center.append(mk("circle",{cx,cy,r:82,class:"disc",stroke:f.color}));
  center.append(mk("circle",{cx,cy:cy-68,r:5,fill:statusColor}));

  const words=n.label.split(" "),cut=words.length>3?Math.ceil(words.length/2):words.length;
  center.append(textNode(cx,cy-7,words.slice(0,cut).join(" "),"title"));
  if(words.slice(cut).length)center.append(textNode(cx,cy+17,words.slice(cut).join(" "),"title"));
  center.append(textNode(cx,cy+43,statusLabel.toUpperCase(),"meta"));
  frag.append(center);

  if(!incoming.length)frag.append(textNode(300,448,"No mapped prerequisites yet","zoneTitle"));
  if(!outgoing.length)frag.append(textNode(1300,448,"No mapped descendants yet","zoneTitle"));
  if(!frontiers.length)frag.append(textNode(800,188,"No mapped frontier here yet","zoneTitle"));

  focusScene.replaceChildren(frag);
}

function verticalPositions(x,startY,span,count){
  if(!count)return[];
  if(count===1)return[{x,y:startY+span/2}];
  return Array.from({length:count},(_,i)=>({x,y:startY+i*(span/(count-1))}));
}

function horizontalPositions(startX,endX,y,count){
  if(!count)return[];
  if(count===1)return[{x:(startX+endX)/2,y}];
  return Array.from({length:count},(_,i)=>({x:startX+i*((endX-startX)/(count-1)),y}));
}

function drawRelationBadge(parent,label,p){
  const clean=String(label||"related").replaceAll("_"," ");
  const width=clamp(clean.length*4.5+12,34,76);
  parent.append(mk("rect",{x:p.x-width/2,y:p.y-7,width,height:13,rx:6,class:"relationBadge"}));
  parent.append(textNode(p.x,p.y+1.5,clean,"relationText"));
}

function drawFocusNode(parent,n,p,f,zone){
  const [,statusColor]=STATUS[n._status]||STATUS.active;
  const challenged=["invalidated","dependency-broken"].includes(n._status);
  const review=n._status==="review-required"||n._status==="disputed";
  const classes="focusNode "+(zone==="frontier"?"frontierNode ":"")+(zone==="neighbor"?"neighborNode ":"")+(challenged?"invalidated ":"")+(review?"review ":"");
  const g=mk("g",{class:classes,transform:`translate(${p.x} ${p.y})`});

  g.append(mk("circle",{r:33,class:"disc",stroke:zone==="frontier"?"#c497ff":f.color}));
  g.append(mk("circle",{cx:0,cy:-29,r:4,fill:statusColor}));

  if(challenged)g.append(mk("line",{x1:-24,y1:23,x2:24,y2:-23,class:"strike"}));

  const words=n.label.split(" "),cut=words.length>2?Math.ceil(words.length/2):words.length;
  g.append(textNode(0,-1,words.slice(0,cut).join(" "),"title"));
  if(words.slice(cut).length)g.append(textNode(0,10,words.slice(cut).join(" "),"title"));
  g.append(textNode(0,23,(zone==="neighbor"?"SPECIALTY":n.kind).toUpperCase(),"meta"));

  const title=mk("title");title.textContent=n.label;g.append(title);
  g.addEventListener("click",()=>openFieldChart(n.id));
  parent.append(g);
}

function showNodeDetail(id){
  const n=nodeById.get(id);if(!n)return;
  const f=familyById.get(n.domain)||FOUNDATION;
  const [statusLabel,statusColor]=STATUS[n._status]||STATUS.active;
  const incoming=getIncoming(id),outgoing=getOutgoing(id);
  const reviews=reviewsByTarget.get(id)||[],sources=n.sources||[];
  const sourceWarning=!sources.length?'<p class="warningBox">No provenance source is attached to this node yet. Treat it as structurally mapped, not source-complete.</p>':"";

  detail.innerHTML='<div class="detailHero"><div class="eyebrow">'+esc(f.short||n.domain)+' · '+esc(n.kind)+'</div><h2>'+esc(n.label)+'</h2><span class="pill"><i style="background:'+statusColor+'"></i>'+esc(statusLabel)+'</span>'+(n.frontier?'<span class="pill">frontier</span>':'')+'<p>'+esc(n.summary||"No summary attached yet.")+'</p><div class="numberGrid"><div class="numberBox"><b>'+incoming.length+'</b><span>incoming</span></div><div class="numberBox"><b>'+outgoing.length+'</b><span>outgoing</span></div><div class="numberBox"><b>'+sources.length+'</b><span>sources</span></div><div class="numberBox"><b>'+reviews.length+'</b><span>reviews</span></div></div></div>'+sourceWarning+'<section class="detailSection"><h3>PROVENANCE</h3>'+(sources.length?sources.map(s=>'<p><a href="'+esc(s.url)+'" target="_blank" rel="noreferrer">'+esc(s.title||s.id)+'</a></p>').join(""):'<p>No source attached yet.</p>')+'</section><section class="detailSection"><h3>INHERITED / SUPPORTED BY</h3>'+(incoming.length?incoming.slice(0,16).map(x=>'<button class="nodeLink" data-open="'+esc(x.node.id)+'"><span>'+esc(x.node.label)+'</span><small>'+esc(x.edge.type)+'</small></button>').join(""):'<p>No mapped incoming relations yet.</p>')+'</section><section class="detailSection"><h3>LEADS TO / AFFECTS</h3>'+(outgoing.length?outgoing.slice(0,16).map(x=>'<button class="nodeLink" data-open="'+esc(x.node.id)+'"><span>'+esc(x.node.label)+'</span><small>'+esc(x.edge.type)+'</small></button>').join(""):'<p>No mapped outgoing relations yet.</p>')+'</section><section class="detailSection"><h3>PEER REVIEW RECORD</h3>'+(reviews.length?reviews.map(r=>'<p class="'+(r.result==="failed"?"dangerText":"")+'"><b>'+esc(r.kind)+' · '+esc(r.result)+'</b><br>'+esc(r.summary)+'</p>').join(""):'<p>No graph-native reviews yet.</p>')+'</section>';

  detail.querySelectorAll("[data-open]").forEach(b=>b.addEventListener("click",()=>openFieldChart(b.dataset.open)));
}

function searchScore(row,q){
  if(row.label===q)return 1000;
  if(row.label.startsWith(q))return 500;
  if(row.label.includes(q))return 250;
  if(row.text.includes(q))return 50;
  return 0;
}

function showSearch(){
  const q=search.value.trim().toLowerCase();
  if(!q){results.hidden=true;results.innerHTML="";return}

  const hits=[];
  for(const row of searchRows){
    const score=searchScore(row,q);
    if(score)hits.push({score,node:nodeById.get(row.id)});
  }
  hits.sort((a,b)=>b.score-a.score||a.node.label.localeCompare(b.node.label));
  const top=hits.slice(0,18);

  results.innerHTML=top.length
    ?top.map(({node:n})=>'<button class="searchHit" data-node="'+esc(n.id)+'"><b>'+esc(n.label)+'</b><span>'+esc((familyById.get(n.domain)||FOUNDATION).short||n.domain)+' · '+esc(n.kind)+'</span></button>').join("")
    :'<div class="searchHit"><b>No mapped match</b><span>This can become a Nemesis coverage target.</span></div>';

  results.hidden=false;
  results.querySelectorAll("[data-node]").forEach(b=>b.addEventListener("click",()=>{
    const n=nodeById.get(b.dataset.node);
    results.hidden=true;
    search.value="";
    if(!n)return;
    if(n.domain!=="roots"){
      renderAtlas(n.domain);
    }else{
      expandedFamily=null;
      renderAtlas(null);
    }
    openFieldChart(n.id);
  }));
}

function bind(){
  atlasBtn.addEventListener("click",()=>{
    closeFieldChart();
    expandedFamily=null;
    renderAtlas(null);
  });

  backBtn.addEventListener("click",()=>{
    if(!focusOverlay.hidden)closeFieldChart();
    else renderAtlas(null);
  });

  focusClose.addEventListener("click",closeFieldChart);
  focusPrev.addEventListener("click",previousFocus);
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
      if(!results.hidden){results.hidden=true;return}
      if(!focusOverlay.hidden){closeFieldChart();return}
      if(expandedFamily)renderAtlas(null);
    }
  });
}

boot().catch(err=>{
  console.error(err);
  detail.innerHTML='<div class="detailHero"><div class="eyebrow">ERROR</div><h2>Map failed to load</h2><p>'+esc(err.message)+'</p></div>';
});
