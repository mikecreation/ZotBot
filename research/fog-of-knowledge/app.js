const svg=document.querySelector("#graph");
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
const focusTitle=document.querySelector("#focusTitle");
const focusSubtitle=document.querySelector("#focusSubtitle");
const focusEyebrow=document.querySelector("#focusEyebrow");
const NS="http://www.w3.org/2000/svg";

const STATUS={
 foundational:["Foundational","#ffbf57"],established:["Strongly established","#65f5b0"],active:["Active field","#66bfff"],
 disputed:["Disputed","#ffc857"],frontier:["Frontier / unresolved","#c497ff"],invalidated:["Invalidated / falsified","#ff4d67"],
 historical:["Historical / superseded","#8e96a8"],"dependency-broken":["Broken dependency","#ff4d67"],"review-required":["Review required","#ffc857"]
};

const FAMILIES=[
 {id:"roots",title:"FOUNDATIONS OF KNOWING",short:"Foundations",color:"#ffbd57",icon:"✦",tagline:"Observation · memory · causality · measurement",major:["Self / other","Cause / effect","More / less / number","Oral tradition","Writing & records","Experimental scientific method"]},
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

let model;
let nodeById=new Map();
const familyById=new Map(FAMILIES.map(f=>[f.id,f]));
let expandedFamily=null;
let focusedNode=null;
const positionByFamily=new Map();

const mk=(name,attrs={})=>{const el=document.createElementNS(NS,name);for(const [k,v] of Object.entries(attrs))el.setAttribute(k,v);return el};
const textNode=(x,y,txt,cls)=>{const t=mk("text",{x,y,class:cls});t.textContent=txt;return t};
const polar=(cx,cy,rx,ry,a)=>({x:cx+Math.cos(a)*rx,y:cy+Math.sin(a)*ry});
const esc=(s="")=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const curve=(a,b,bend=.5)=>`M ${a.x} ${a.y} Q ${a.x+(b.x-a.x)*bend} ${a.y+(b.y-a.y)*bend} ${b.x} ${b.y}`;

async function boot(){
  model=await (await fetch("./data/knowledge.json",{cache:"no-store"})).json();
  await addOlogies();
  nodeById=new Map(model.nodes.map(n=>[n.id,n]));
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
    if(old){if(label.toLowerCase().endsWith("ology")&&!old.tags?.includes("ology"))(old.tags??=[]).push("ology");continue}
    const slug=label.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
    const n={id:"ology."+slug,label,kind:"field",domain,era,status:"active",summary:"Curated seed entry in the expandable -ology registry: "+label+".",tags:["ology","registry-seed"],sources:[],frontier:false,aliases:[]};
    model.nodes.push(n);existing.set(label.toLowerCase(),n);
  }
}

function deriveStatuses(){
  model.nodes.forEach(n=>n._status=n.status);
  const hard=new Map(),soft=new Map();
  for(const e of model.edges){
    if(!["depends_on","enabled","derived_from"].includes(e.type))continue;
    const m=e.dependency==="hard"?hard:soft;
    if(!m.has(e.source))m.set(e.source,[]);
    m.get(e.source).push(e.target);
  }
  const invalid=model.nodes.filter(n=>n.status==="invalidated").map(n=>n.id);
  const broken=new Set(),q=[...invalid];
  while(q.length){
    const id=q.shift();
    for(const c of hard.get(id)||[]){
      if(!broken.has(c)&&!invalid.includes(c)){broken.add(c);q.push(c)}
    }
  }
  broken.forEach(id=>{const n=nodeById.get(id)||model.nodes.find(x=>x.id===id);if(n&&n.status!=="invalidated")n._status="dependency-broken"});
  const review=new Set(),q2=[...invalid,...broken];
  while(q2.length){
    const id=q2.shift();
    for(const c of soft.get(id)||[]){
      if(!review.has(c)){review.add(c);q2.push(c)}
    }
  }
  review.forEach(id=>{const n=model.nodes.find(x=>x.id===id);if(n&& !["invalidated","dependency-broken"].includes(n._status))n._status="review-required"});
}

function familyNodes(id){return model.nodes.filter(n=>n.domain===id)}
function familyFrontiers(id){return familyNodes(id).filter(n=>n.frontier)}
function majorNodes(f){
  const all=familyNodes(f.id),out=[];
  for(const label of f.major){
    const n=all.find(x=>x.label.toLowerCase()===label.toLowerCase());
    if(n&&!out.includes(n))out.push(n);
  }
  return out.slice(0,8);
}

function renderAtlas(nextExpanded=expandedFamily){
  expandedFamily=nextExpanded;
  focusedNode=null;
  focusOverlay.hidden=true;
  scene.replaceChildren();
  atlasBtn.classList.add("active");
  backBtn.hidden=!expandedFamily;
  backBtn.textContent="← COLLAPSE";
  crumb.textContent=expandedFamily?"Human Knowledge / "+familyById.get(expandedFamily).short:"Human Knowledge";
  mapCaption.innerHTML=expandedFamily
    ?"<b>BRANCH OPEN</b><span>Click any revealed category to open its dedicated field chart. Click another great field to move the expansion there.</span>"
    :"<b>THE ATLAS</b><span>Click a great field. Its next categories grow directly out of the atlas without replacing the whole map.</span>";

  const cx=800,cy=500,rx=405,ry=320;
  scene.append(mk("circle",{cx,cy,r:398,class:"atlasOrbit"}));
  scene.append(mk("circle",{cx,cy,r:294,class:"atlasOrbit dashed"}));
  scene.append(mk("circle",{cx,cy,r:474,class:"fogRing"}));
  scene.append(textNode(cx,42,"THE FOG · WHAT HUMANITY HAS NOT YET MAPPED","fogText"));

  FAMILIES.forEach((f,i)=>{
    const a=-Math.PI/2+i*(Math.PI*2/FAMILIES.length);
    const p=polar(cx,cy,rx,ry,a);
    positionByFamily.set(f.id,{...p,a});
    const start=polar(cx,cy,110,87,a),end=polar(cx,cy,332,263,a);
    const branch=mk("g",{class:"atlasBranch"+(expandedFamily&&expandedFamily!==f.id?" dim":"")});
    const d=curve(start,end,.5);
    branch.append(mk("path",{d,class:"atlasTrunk",stroke:f.color}));
    branch.append(mk("path",{d,class:"atlasTrunkCore",stroke:f.color}));
    for(const t of [.28,.55,.8]){
      const sp={x:start.x+(end.x-start.x)*t,y:start.y+(end.y-start.y)*t};
      branch.append(mk("circle",{cx:sp.x,cy:sp.y,r:t>.7?2.3:1.5,fill:f.color,class:"trunkSpark"}));
    }
    scene.append(branch);
  });

  const core=mk("g",{class:"knowledgeCore"});
  core.append(mk("circle",{cx,cy,r:150,class:"halo"}));
  core.append(mk("circle",{cx,cy,r:102,class:"ring"}));
  core.append(mk("circle",{cx,cy,r:122,class:"ring2"}));
  core.append(textNode(cx,cy-18,"HUMAN","coreTitle"));
  core.append(textNode(cx,cy+9,"KNOWLEDGE","coreTitle"));
  core.append(textNode(cx,cy+37,"THE SHARED PROJECT OF KNOWING","coreSub"));
  core.append(textNode(cx,cy+58,model.nodes.length.toLocaleString()+" MAPPED NODES","coreCount"));
  scene.append(core);

  FAMILIES.forEach((f,i)=>{
    const p=positionByFamily.get(f.id),count=familyNodes(f.id).length,front=familyFrontiers(f.id).length;
    const g=mk("g",{class:"domainGroup"+(expandedFamily===f.id?" selected":"")+(expandedFamily&&expandedFamily!==f.id?" dim":""),transform:`translate(${p.x} ${p.y})`});
    g.append(mk("circle",{r:93,fill:f.color,class:"halo"}));
    g.append(mk("circle",{r:69,class:"disc",stroke:f.color}));
    g.append(mk("circle",{r:80,class:"ring",stroke:f.color}));
    for(let j=0;j<12;j++){
      const a=j*Math.PI*2/12,p1=polar(0,0,84,84,a),p2=polar(0,0,89,89,a);
      g.append(mk("line",{x1:p1.x,y1:p1.y,x2:p2.x,y2:p2.y,stroke:f.color,class:"orbitTick"}));
    }
    g.append(textNode(0,-18,f.icon,"domainIcon"));
    const words=f.title.split(" "),split=words.length>2?Math.ceil(words.length/2):words.length;
    const l1=words.slice(0,split).join(" "),l2=words.slice(split).join(" ");
    g.append(textNode(0,13,l1,"domainTitle"));
    if(l2)g.append(textNode(0,28,l2,"domainTitle"));
    g.append(textNode(0,l2?47:34,count.toLocaleString()+" mapped"+(front?" · "+front+" frontier":""),"domainCount"));
    g.append(textNode(0,l2?61:49,expandedFamily===f.id?"BRANCH OPEN":"EXPAND →","domainHint"));
    g.addEventListener("click",()=>expandFamily(f.id));
    g.addEventListener("mouseenter",()=>showFamilyPreview(f.id));
    scene.append(g);
  });

  if(expandedFamily)drawExpansion(expandedFamily);
  else showAtlasIntro();
}

function expandFamily(id){
  if(expandedFamily===id){showFamilyPreview(id);return}
  expandedFamily=id;
  renderAtlas(id);
  showFamilyPreview(id,true);
}

function drawExpansion(id){
  const f=familyById.get(id),anchor=positionByFamily.get(id),nodes=majorNodes(f);
  if(!anchor||!nodes.length)return;
  const span=Math.min(1.15,.28+nodes.length*.12);
  const startAngle=anchor.a-span/2;
  const radius=150;
  const labelP=polar(anchor.x,anchor.y,106,106,anchor.a);
  scene.append(textNode(labelP.x,labelP.y-4,"NEXT BRANCHES","branchLabel"));

  nodes.forEach((n,i)=>{
    const a=nodes.length===1?anchor.a:startAngle+i*(span/(nodes.length-1));
    const p=polar(anchor.x,anchor.y,radius,radius,a);
    const d=curve({x:anchor.x,y:anchor.y},p,.55);
    scene.append(mk("path",{d,class:"expansionGlow",stroke:f.color}));
    scene.append(mk("path",{d,class:"expansionPath",stroke:f.color}));
    const [statusLabel,statusColor]=STATUS[n._status]||STATUS.active;
    const g=mk("g",{class:"expansionNode",transform:`translate(${p.x} ${p.y})`});
    g.append(mk("circle",{r:44,fill:f.color,class:"halo"}));
    g.append(mk("circle",{r:31,class:"disc",stroke:f.color}));
    g.append(mk("circle",{cx:0,cy:-28,r:4.5,fill:statusColor,class:"status"}));
    const words=n.label.split(" "),cut=words.length>2?Math.ceil(words.length/2):words.length;
    g.append(textNode(0,-1,words.slice(0,cut).join(" "),"title"));
    if(words.slice(cut).length)g.append(textNode(0,11,words.slice(cut).join(" "),"title"));
    g.append(textNode(0,24,n.kind.toUpperCase(),"meta"));
    g.addEventListener("click",ev=>{ev.stopPropagation();openFieldChart(n.id)});
    scene.append(g);
  });
}

function showAtlasIntro(){
  detail.innerHTML='<div class="detailHero"><div class="eyebrow">HUMAN KNOWLEDGE</div><h2>One atlas. Infinite depth.</h2><p>Pick a great field. Its next categories unfold directly from the same circle, so your orientation never disappears.</p></div><section class="detailSection"><h3>INTERACTION</h3><p><b>Great field:</b> expands its pathway in place.</p><p><b>Revealed category:</b> opens a dedicated chart for that field inside this same workspace.</p><p><b>Back:</b> returns instantly to the exact branch you had open.</p></section>';
}

function showFamilyPreview(id,open=false){
  const f=familyById.get(id),nodes=familyNodes(id),front=nodes.filter(n=>n.frontier).length,challenged=nodes.filter(n=>["invalidated","dependency-broken","review-required","disputed"].includes(n._status)).length,maj=majorNodes(f);
  detail.innerHTML='<div class="detailHero"><div class="eyebrow">'+(open?"BRANCH OPEN":"KNOWLEDGE FAMILY")+'</div><h2>'+esc(f.short)+'</h2><p>'+esc(f.tagline)+'.</p><div class="numberGrid"><div class="numberBox"><b>'+nodes.length.toLocaleString()+'</b><span>mapped items</span></div><div class="numberBox"><b>'+front+'</b><span>frontiers</span></div><div class="numberBox"><b>'+maj.length+'</b><span>next branches</span></div><div class="numberBox"><b>'+challenged+'</b><span>challenged</span></div></div></div><section class="detailSection"><h3>NEXT CATEGORIES</h3>'+maj.map(n=>'<button class="nodeLink" data-open="'+esc(n.id)+'"><span>'+esc(n.label)+'</span><small>open chart ↗</small></button>').join("")+'</section><section class="detailSection"><h3>MAP RULE</h3><p>The radial path is navigation. Scientific dependency remains attached to evidence inside the field chart.</p></section>';
  detail.querySelectorAll("[data-open]").forEach(b=>b.addEventListener("click",()=>openFieldChart(b.dataset.open)));
}

function openFieldChart(id){
  const n=nodeById.get(id);if(!n)return;
  focusedNode=id;
  const f=familyById.get(n.domain)||FAMILIES[0];
  focusOverlay.hidden=false;
  focusEyebrow.textContent=(f?.short||n.domain).toUpperCase()+" · FIELD CHART";
  focusTitle.textContent=n.label;
  focusSubtitle.textContent="Mapped prerequisites, consequences, frontiers, and nearby specialties. Click any node to refocus instantly.";
  crumb.textContent="Human Knowledge / "+(f?.short||n.domain)+" / "+n.label;
  drawFocusChart(n,f);
  showNodeDetail(n.id);
}

function closeFieldChart(){
  focusOverlay.hidden=true;
  focusedNode=null;
  crumb.textContent=expandedFamily?"Human Knowledge / "+familyById.get(expandedFamily).short:"Human Knowledge";
  if(expandedFamily)showFamilyPreview(expandedFamily,true);else showAtlasIntro();
}

function drawFocusChart(n,f){
  focusScene.replaceChildren();
  const cx=800,cy=435;
  const incoming=model.edges.filter(e=>e.target===n.id).map(e=>({edge:e,node:nodeById.get(e.source)})).filter(x=>x.node).slice(0,8);
  const outgoing=model.edges.filter(e=>e.source===n.id).map(e=>({edge:e,node:nodeById.get(e.target)})).filter(x=>x.node).slice(0,8);
  const frontiers=familyFrontiers(n.domain).filter(x=>x.id!==n.id).slice(0,6);
  const linked=new Set([n.id,...incoming.map(x=>x.node.id),...outgoing.map(x=>x.node.id),...frontiers.map(x=>x.id)]);
  const neighbors=familyNodes(n.domain).filter(x=>!linked.has(x.id)&&x.kind==="field").slice(0,12);

  focusScene.append(mk("circle",{cx,cy,r:305,class:"focusOrbit"}));
  focusScene.append(mk("circle",{cx,cy,r:410,class:"focusOrbit"}));
  focusScene.append(textNode(340,105,"INHERITED / SUPPORTING","zoneTitle"));
  focusScene.append(textNode(1260,105,"LEADS TO / AFFECTS","zoneTitle"));
  focusScene.append(textNode(800,92,"FRONTIER","zoneTitle"));
  focusScene.append(textNode(800,817,"NEARBY SPECIALTIES","zoneTitle"));

  const inPos=fanPositions(325,440,195,250,incoming.length,-Math.PI/2);
  const outPos=fanPositions(1275,440,195,250,outgoing.length,Math.PI/2);
  const frontPos=arcPositions(800,210,310,95,frontiers.length,Math.PI,Math.PI*2);
  const neighPos=arcPositions(800,690,440,120,neighbors.length,0,Math.PI);

  incoming.forEach((x,i)=>{
    const p=inPos[i];focusScene.append(mk("path",{d:curve(p,{x:cx-86,y:cy},.55),class:"focusLink in"}));drawFocusNode(x.node,p,f,"in");
  });
  outgoing.forEach((x,i)=>{
    const p=outPos[i];focusScene.append(mk("path",{d:curve({x:cx+86,y:cy},p,.55),class:"focusLink out"}));drawFocusNode(x.node,p,f,"out");
  });
  frontiers.forEach((x,i)=>{
    const p=frontPos[i];focusScene.append(mk("path",{d:curve({x:cx,y:cy-84},p,.5),class:"focusLink related"}));drawFocusNode(x,p,f,"frontier");
  });
  neighbors.forEach((x,i)=>{
    const p=neighPos[i];focusScene.append(mk("path",{d:curve({x:cx,y:cy+84},p,.5),class:"focusLink related"}));drawFocusNode(x,p,f,"neighbor");
  });

  const [statusLabel,statusColor]=STATUS[n._status]||STATUS.active;
  const center=mk("g",{class:"focusCenter"});
  center.append(mk("circle",{cx,cy,r:142,fill:f.color,class:"halo"}));
  center.append(mk("circle",{cx,cy,r:82,class:"disc",stroke:f.color}));
  center.append(mk("circle",{cx,cy:cy-68,r:5,fill:statusColor}));
  const words=n.label.split(" "),cut=words.length>3?Math.ceil(words.length/2):words.length;
  center.append(textNode(cx,cy-6,words.slice(0,cut).join(" "),"title"));
  if(words.slice(cut).length)center.append(textNode(cx,cy+17,words.slice(cut).join(" "),"title"));
  center.append(textNode(cx,cy+42,statusLabel.toUpperCase(),"meta"));
  focusScene.append(center);

  if(!incoming.length)focusScene.append(textNode(325,440,"No mapped prerequisites yet","zoneTitle"));
  if(!outgoing.length)focusScene.append(textNode(1275,440,"No mapped descendants yet","zoneTitle"));
  if(!frontiers.length)focusScene.append(textNode(800,190,"No mapped frontier in this family yet","zoneTitle"));
}

function fanPositions(cx,cy,rx,ry,count,direction){
  if(!count)return[];
  const out=[];
  for(let i=0;i<count;i++){
    const frac=count===1?.5:i/(count-1);
    const y=cy-ry/2+frac*ry;
    const x=cx+Math.cos((frac-.5)*1.1+direction)*rx*.18;
    out.push({x,y});
  }
  return out;
}

function arcPositions(cx,cy,rx,ry,count,start,end){
  if(!count)return[];
  const out=[];
  for(let i=0;i<count;i++){
    const t=count===1?.5:i/(count-1),a=start+(end-start)*t;
    out.push({x:cx+Math.cos(a)*rx,y:cy+Math.sin(a)*ry});
  }
  return out;
}

function drawFocusNode(n,p,f,zone){
  const [statusLabel,statusColor]=STATUS[n._status]||STATUS.active;
  const classes="focusNode "+(zone==="frontier"?"frontierNode ":"")+(zone==="neighbor"?"neighborNode":"");
  const g=mk("g",{class:classes,transform:`translate(${p.x} ${p.y})`});
  g.append(mk("circle",{r:34,class:"disc",stroke:zone==="frontier"?"#c497ff":f.color}));
  g.append(mk("circle",{cx:0,cy:-30,r:4,fill:statusColor}));
  const words=n.label.split(" "),cut=words.length>2?Math.ceil(words.length/2):words.length;
  g.append(textNode(0,-1,words.slice(0,cut).join(" "),"title"));
  if(words.slice(cut).length)g.append(textNode(0,11,words.slice(cut).join(" "),"title"));
  g.append(textNode(0,24,(zone==="neighbor"?"SPECIALTY":n.kind).toUpperCase(),"meta"));
  g.addEventListener("click",()=>{focusedNode=n.id;openFieldChart(n.id)});
  focusScene.append(g);
}

function showNodeDetail(id){
  const n=nodeById.get(id);if(!n)return;
  const f=familyById.get(n.domain),[statusLabel,statusColor]=STATUS[n._status]||STATUS.active;
  const incoming=model.edges.filter(e=>e.target===id).map(e=>({e,n:nodeById.get(e.source)})).filter(x=>x.n);
  const outgoing=model.edges.filter(e=>e.source===id).map(e=>({e,n:nodeById.get(e.target)})).filter(x=>x.n);
  const reviews=(model.reviews||[]).filter(r=>r.target===id),sources=n.sources||[];
  detail.innerHTML='<div class="detailHero"><div class="eyebrow">'+esc(f?.short||n.domain)+' · '+esc(n.kind)+'</div><h2>'+esc(n.label)+'</h2><span class="pill"><i style="background:'+statusColor+'"></i>'+esc(statusLabel)+'</span>'+(n.frontier?'<span class="pill">frontier</span>':'')+'<p>'+esc(n.summary||"No summary attached yet.")+'</p></div><section class="detailSection"><h3>PROVENANCE</h3>'+(sources.length?sources.map(s=>'<p><a href="'+esc(s.url)+'" target="_blank" rel="noreferrer">'+esc(s.title||s.id)+'</a></p>').join(""):'<p>No source attached yet.</p>')+'</section><section class="detailSection"><h3>INHERITED / SUPPORTED BY</h3>'+(incoming.length?incoming.slice(0,16).map(x=>'<button class="nodeLink" data-open="'+esc(x.n.id)+'"><span>'+esc(x.n.label)+'</span><small>'+esc(x.e.type)+'</small></button>').join(""):'<p>No mapped incoming relations yet.</p>')+'</section><section class="detailSection"><h3>LEADS TO / AFFECTS</h3>'+(outgoing.length?outgoing.slice(0,16).map(x=>'<button class="nodeLink" data-open="'+esc(x.n.id)+'"><span>'+esc(x.n.label)+'</span><small>'+esc(x.e.type)+'</small></button>').join(""):'<p>No mapped outgoing relations yet.</p>')+'</section><section class="detailSection"><h3>PEER REVIEW RECORD</h3>'+(reviews.length?reviews.map(r=>'<p class="'+(r.result==="failed"?"dangerText":"")+'"><b>'+esc(r.kind)+' · '+esc(r.result)+'</b><br>'+esc(r.summary)+'</p>').join(""):'<p>No graph-native reviews yet.</p>')+'</section>';
  detail.querySelectorAll("[data-open]").forEach(b=>b.addEventListener("click",()=>openFieldChart(b.dataset.open)));
}

function showSearch(){
  const q=search.value.trim().toLowerCase();
  if(!q){results.hidden=true;results.innerHTML="";return}
  const hits=model.nodes.filter(n=>[n.label,n.summary,n.kind,...(n.tags||[]),...(n.aliases||[])].join(" ").toLowerCase().includes(q)).slice(0,18);
  results.innerHTML=hits.length?hits.map(n=>'<button class="searchHit" data-node="'+esc(n.id)+'"><b>'+esc(n.label)+'</b><span>'+esc(familyById.get(n.domain)?.short||n.domain)+' · '+esc(n.kind)+'</span></button>').join(""):'<div class="searchHit"><b>No mapped match</b><span>This can become a Nemesis coverage target.</span></div>';
  results.hidden=false;
  results.querySelectorAll("[data-node]").forEach(b=>b.addEventListener("click",()=>{
    const n=nodeById.get(b.dataset.node);results.hidden=true;search.value="";
    if(n){expandedFamily=n.domain;renderAtlas(n.domain);openFieldChart(n.id)}
  }));
}

function bind(){
  atlasBtn.addEventListener("click",()=>{closeFieldChart();expandedFamily=null;renderAtlas(null)});
  backBtn.addEventListener("click",()=>{if(!focusOverlay.hidden){closeFieldChart()}else{expandedFamily=null;renderAtlas(null)}});
  focusClose.addEventListener("click",closeFieldChart);
  search.addEventListener("input",showSearch);
  document.addEventListener("click",e=>{if(!results.contains(e.target)&&e.target!==search)results.hidden=true});
}

boot().catch(err=>{
  console.error(err);
  detail.innerHTML='<div class="detailHero"><div class="eyebrow">ERROR</div><h2>Map failed to load</h2><p>'+esc(err.message)+'</p></div>';
});
