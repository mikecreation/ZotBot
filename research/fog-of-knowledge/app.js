const svg=document.querySelector("#graph");
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

let model,nodeById=new Map(),familyById=new Map(FAMILIES.map(f=>[f.id,f])),currentMode="atlas",currentFamily=null;

const mk=(name,attrs={})=>{const el=document.createElementNS(NS,name);for(const [k,v] of Object.entries(attrs))el.setAttribute(k,v);return el};
const textNode=(x,y,txt,cls)=>{const t=mk("text",{x,y,class:cls});t.textContent=txt;return t};
const polar=(cx,cy,rx,ry,a)=>({x:cx+Math.cos(a)*rx,y:cy+Math.sin(a)*ry});
const esc=(s="")=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));

async function boot(){
  model=await (await fetch("./data/knowledge.json")).json();
  await addOlogies();
  nodeById=new Map(model.nodes.map(n=>[n.id,n]));
  deriveStatuses();
  document.querySelector("#nodeCount").textContent=model.nodes.length.toLocaleString();
  document.querySelector("#frontierCount").textContent=model.nodes.filter(n=>n.frontier).length.toLocaleString();
  bind();
  renderAtlas();
}

async function addOlogies(){
  const t=await (await fetch("./data/ologies.tsv")).text();
  const existing=new Map(model.nodes.map(n=>[n.label.toLowerCase(),n]));
  for(const line of t.split(/\r?\n/).slice(1)){
    if(!line.trim()) continue;
    const [label,domain,era]=line.split("\t");
    const old=existing.get(label.toLowerCase());
    if(old){if(label.toLowerCase().endsWith("ology")&&!old.tags?.includes("ology"))(old.tags??=[]).push("ology");continue}
    const slug=label.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
    const n={id:"ology."+slug,label,kind:"field",domain,era,status:"active",summary:"Curated seed entry in the expandable -ology registry: "+label+".",tags:["ology","registry-seed"],sources:[],frontier:false,aliases:[]};
    model.nodes.push(n); existing.set(label.toLowerCase(),n);
  }
}

function deriveStatuses(){
  model.nodes.forEach(n=>n._status=n.status);
  const hard=new Map(),soft=new Map();
  for(const e of model.edges){
    if(!["depends_on","enabled","derived_from"].includes(e.type)) continue;
    const m=e.dependency==="hard"?hard:soft;
    if(!m.has(e.source))m.set(e.source,[]);
    m.get(e.source).push(e.target);
  }
  const invalid=model.nodes.filter(n=>n.status==="invalidated").map(n=>n.id);
  const broken=new Set(),q=[...invalid];
  while(q.length){const id=q.shift();for(const c of hard.get(id)||[]){if(!broken.has(c)&&!invalid.includes(c)){broken.add(c);q.push(c)}}}
  broken.forEach(id=>{const n=nodeById.get(id)||model.nodes.find(x=>x.id===id);if(n&&n.status!=="invalidated")n._status="dependency-broken"});
  const review=new Set(),q2=[...invalid,...broken];
  while(q2.length){const id=q2.shift();for(const c of soft.get(id)||[]){if(!review.has(c)){review.add(c);q2.push(c)}}}
  review.forEach(id=>{const n=model.nodes.find(x=>x.id===id);if(n&& !["invalidated","dependency-broken"].includes(n._status))n._status="review-required"});
}

function familyNodes(id){return model.nodes.filter(n=>n.domain===id)}
function familyFrontiers(id){return familyNodes(id).filter(n=>n.frontier)}
function clearScene(){scene.replaceChildren()}

function renderAtlas(){
  currentMode="atlas";currentFamily=null;clearScene();
  backBtn.hidden=true;atlasBtn.classList.add("active");crumb.textContent="Human Knowledge";
  mapCaption.innerHTML="<b>THE ATLAS</b><span>Ten great knowledge families. Click one to open its internal branches. Dependency is shown deeper, where it can remain evidence-driven.</span>";
  detail.innerHTML='<div class="detailHero"><div class="eyebrow">HUMAN KNOWLEDGE</div><h2>The first ring</h2><p>The map now begins with orientation. Every mapped item belongs to a great knowledge family before the interface asks you to understand its details.</p></div><section class="detailSection"><h3>THE TEN FAMILIES</h3><p>These are navigational super-fields, chosen to cover the current graph without pretending they are mutually exclusive. Cross-field research can belong to several deeper branches later.</p></section><section class="detailSection"><h3>MOVE THROUGH IT</h3><p>Choose a glowing field. The next view exposes its major branches first and pushes the long tail of specialties to the perimeter.</p></section>';

  const cx=800,cy=490;
  scene.append(mk("circle",{cx,cy,r:405,class:"atlasOrbit"}));
  scene.append(mk("circle",{cx,cy,r:300,class:"atlasOrbit dashed"}));
  scene.append(mk("circle",{cx,cy,r:468,class:"fogRing"}));
  scene.append(textNode(cx,45,"THE UNMAPPED FOG BEYOND THE CURRENT ATLAS","fogText"));

  FAMILIES.forEach((f,i)=>{
    const a=-Math.PI/2+i*(Math.PI*2/FAMILIES.length);
    const p=polar(cx,cy,415,330,a);
    const start=polar(cx,cy,112,90,a),end=polar(cx,cy,338,270,a);
    const trunk=mk("path",{d:`M ${start.x} ${start.y} Q ${(start.x+end.x)/2} ${(start.y+end.y)/2} ${end.x} ${end.y}`,class:"atlasTrunk",stroke:f.color});
    const core=mk("path",{d:trunk.getAttribute("d"),class:"atlasTrunkCore",stroke:f.color});
    scene.append(trunk,core);
  });

  const core=mk("g",{class:"knowledgeCore"});
  core.append(mk("circle",{cx,cy,r:154,class:"halo"}));
  core.append(mk("circle",{cx,cy,r:104,class:"ring"}));
  core.append(mk("circle",{cx,cy,r:124,class:"ring2"}));
  core.append(textNode(cx,cy-18,"HUMAN","coreTitle"));
  core.append(textNode(cx,cy+9,"KNOWLEDGE","coreTitle"));
  core.append(textNode(cx,cy+37,"THE SHARED PROJECT OF KNOWING","coreSub"));
  core.append(textNode(cx,cy+58,model.nodes.length.toLocaleString()+" MAPPED NODES","coreCount"));
  scene.append(core);

  FAMILIES.forEach((f,i)=>{
    const a=-Math.PI/2+i*(Math.PI*2/FAMILIES.length);
    const p=polar(cx,cy,415,330,a),count=familyNodes(f.id).length,front=familyFrontiers(f.id).length;
    const g=mk("g",{class:"domainGroup",transform:`translate(${p.x} ${p.y})`,"data-domain":f.id});
    g.append(mk("circle",{r:94,fill:f.color,class:"halo"}));
    g.append(mk("circle",{r:69,class:"disc",stroke:f.color}));
    g.append(mk("circle",{r:79,class:"ring",stroke:f.color}));
    g.append(textNode(0,-18,f.icon,"domainIcon"));
    const words=f.title.split(" ");
    const split=words.length>2?Math.ceil(words.length/2):words.length;
    const l1=words.slice(0,split).join(" "),l2=words.slice(split).join(" ");
    g.append(textNode(0,13,l1,"domainTitle"));
    if(l2)g.append(textNode(0,28,l2,"domainTitle"));
    g.append(textNode(0,l2?47:34,count.toLocaleString()+" mapped"+(front?" · "+front+" frontier":"") ,"domainCount"));
    g.append(textNode(0,l2?61:49,"OPEN FIELD →","domainHint"));
    g.addEventListener("click",()=>renderFamily(f.id));
    g.addEventListener("mouseenter",()=>showFamilyPreview(f.id));
    scene.append(g);
  });
}

function renderFamily(id){
  const f=familyById.get(id);if(!f)return;
  currentMode="family";currentFamily=id;clearScene();
  backBtn.hidden=false;atlasBtn.classList.remove("active");crumb.textContent="Human Knowledge / "+f.short;
  mapCaption.innerHTML="<b>"+esc(f.title)+"</b><span>Major branches are named. The outer constellation contains the rest of the mapped specialties. Click any node for evidence and dependency detail.</span>";

  const all=familyNodes(id),major=[];
  for(const label of f.major){const n=all.find(x=>x.label.toLowerCase()===label.toLowerCase());if(n&&!major.includes(n))major.push(n)}
  const majorIds=new Set(major.map(n=>n.id)),minor=all.filter(n=>!majorIds.has(n.id));
  const cx=800,cy=495;

  scene.append(mk("circle",{cx,cy,r:425,class:"atlasOrbit"}));
  scene.append(mk("circle",{cx,cy,r:305,class:"atlasOrbit dashed"}));
  scene.append(mk("circle",{cx,cy,r:470,class:"fogRing"}));
  scene.append(textNode(cx,44,"SPECIALTIES → CLAIMS → EVIDENCE → FRONTIER","fogText"));

  major.forEach((n,i)=>{
    const a=-Math.PI/2+i*(Math.PI*2/Math.max(major.length,1)),p=polar(cx,cy,310,235,a);
    scene.append(mk("path",{d:`M ${cx} ${cy} Q ${(cx+p.x)/2} ${(cy+p.y)/2} ${p.x} ${p.y}`,class:"branchLine",stroke:f.color}));
  });

  const fc=mk("g",{class:"fieldCore"});
  fc.append(mk("circle",{cx,cy,r:145,fill:f.color,opacity:.12,filter:"url(#bigGlow)"}));
  fc.append(mk("circle",{cx,cy,r:96,class:"disc",stroke:f.color}));
  fc.append(textNode(cx,cy-19,f.icon,"domainIcon"));
  fc.append(textNode(cx,cy+14,f.short.toUpperCase(),"title"));
  fc.append(textNode(cx,cy+38,all.length.toLocaleString()+" MAPPED ITEMS · "+familyFrontiers(id).length+" FRONTIERS","sub"));
  scene.append(fc);

  major.forEach((n,i)=>{
    const a=-Math.PI/2+i*(Math.PI*2/Math.max(major.length,1)),p=polar(cx,cy,310,235,a);
    const [_,statusColor]=STATUS[n._status]||STATUS.active;
    const g=mk("g",{class:"majorNode",transform:`translate(${p.x} ${p.y})`});
    g.append(mk("circle",{r:74,fill:f.color,class:"halo"}));
    g.append(mk("circle",{r:52,class:"disc",stroke:f.color}));
    g.append(mk("circle",{r:5,cy:-20,fill:statusColor}));
    const words=n.label.split(" ");const split=words.length>2?Math.ceil(words.length/2):words.length;
    g.append(textNode(0,3,words.slice(0,split).join(" "),"title"));
    if(words.slice(split).length)g.append(textNode(0,17,words.slice(split).join(" "),"title"));
    g.append(textNode(0,35,n.kind.toUpperCase(),"meta"));
    g.addEventListener("click",ev=>{ev.stopPropagation();showNode(n.id)});
    scene.append(g);
  });

  const rings=[{rx:505,ry:355},{rx:555,ry:400}];
  minor.forEach((n,i)=>{
    const ring=rings[i%rings.length],idx=Math.floor(i/rings.length),slots=Math.ceil(minor.length/rings.length),a=-Math.PI/2+idx*(Math.PI*2/Math.max(slots,1))+(i%2)*0.025;
    const p=polar(cx,cy,ring.rx,ring.ry,a),[_,c]=STATUS[n._status]||STATUS.active;
    const g=mk("g",{class:"minorDot",transform:`translate(${p.x} ${p.y})`});
    g.append(mk("circle",{r:n.frontier?5.5:3.2,fill:n.frontier?"#c497ff":f.color}));
    g.append(textNode(7,2,n.label,"minorLabel"));
    g.addEventListener("click",ev=>{ev.stopPropagation();showNode(n.id)});
    scene.append(g);
  });

  showFamilyPreview(id,true);
}

function showFamilyPreview(id,inFamily=false){
  const f=familyById.get(id),nodes=familyNodes(id),front=nodes.filter(n=>n.frontier).length,challenged=nodes.filter(n=>["invalidated","dependency-broken","review-required","disputed"].includes(n._status)).length;
  const actual=f.major.map(label=>nodes.find(n=>n.label.toLowerCase()===label.toLowerCase())).filter(Boolean);
  detail.innerHTML='<div class="detailHero"><div class="eyebrow">'+(inFamily?"OPEN FIELD":"KNOWLEDGE FAMILY")+'</div><h2>'+esc(f.short)+'</h2><p>'+esc(f.tagline)+'.</p><div class="numberGrid"><div class="numberBox"><b>'+nodes.length.toLocaleString()+'</b><span>mapped items</span></div><div class="numberBox"><b>'+front.toLocaleString()+'</b><span>frontier nodes</span></div><div class="numberBox"><b>'+actual.length+'</b><span>major branches shown</span></div><div class="numberBox"><b>'+challenged+'</b><span>challenged</span></div></div></div><section class="detailSection"><h3>MAJOR BRANCHES</h3>'+(actual.length?actual.map(n=>'<button class="nodeLink" data-node="'+esc(n.id)+'"><span>'+esc(n.label)+'</span><small>'+esc(n.kind)+'</small></button>').join(""):'<p>Major branches are not yet classified in this family.</p>')+'</section><section class="detailSection"><h3>ROLE IN THE ATLAS</h3><p>This is a top-level navigational family. Deeper views carry the actual support, contradiction, supersession, and dependency relationships.</p></section>';
  detail.querySelectorAll("[data-node]").forEach(b=>b.addEventListener("click",()=>showNode(b.dataset.node)));
}

function showNode(id){
  const n=nodeById.get(id);if(!n)return;
  const f=familyById.get(n.domain),[statusLabel,statusColor]=STATUS[n._status]||STATUS.active;
  const incoming=model.edges.filter(e=>e.target===id).map(e=>({e,n:nodeById.get(e.source)})).filter(x=>x.n);
  const outgoing=model.edges.filter(e=>e.source===id).map(e=>({e,n:nodeById.get(e.target)})).filter(x=>x.n);
  const reviews=(model.reviews||[]).filter(r=>r.target===id),sources=n.sources||[];
  detail.innerHTML='<div class="detailHero"><div class="eyebrow">'+esc(f?.short||n.domain)+' · '+esc(n.kind)+'</div><h2>'+esc(n.label)+'</h2><span class="pill"><i style="background:'+statusColor+'"></i>'+esc(statusLabel)+'</span>'+(n.frontier?'<span class="pill">frontier</span>':'')+'<p>'+esc(n.summary||"No summary attached yet.")+'</p></div><section class="detailSection"><h3>PROVENANCE</h3>'+(sources.length?sources.map(s=>'<p><a href="'+esc(s.url)+'" target="_blank" rel="noreferrer">'+esc(s.title||s.id)+'</a></p>').join(""):'<p>No source attached yet.</p>')+'</section><section class="detailSection"><h3>INHERITED / SUPPORTED BY</h3>'+(incoming.length?incoming.slice(0,20).map(x=>'<button class="nodeLink" data-node="'+esc(x.n.id)+'"><span>'+esc(x.n.label)+'</span><small>'+esc(x.e.type)+'</small></button>').join(""):'<p>No mapped incoming relations yet.</p>')+'</section><section class="detailSection"><h3>LEADS TO / AFFECTS</h3>'+(outgoing.length?outgoing.slice(0,20).map(x=>'<button class="nodeLink" data-node="'+esc(x.n.id)+'"><span>'+esc(x.n.label)+'</span><small>'+esc(x.e.type)+'</small></button>').join(""):'<p>No mapped outgoing relations yet.</p>')+'</section><section class="detailSection"><h3>PEER REVIEW RECORD</h3>'+(reviews.length?reviews.map(r=>'<p class="'+(r.result==="failed"?"dangerText":"")+'"><b>'+esc(r.kind)+' · '+esc(r.result)+'</b><br>'+esc(r.summary)+'</p>').join(""):'<p>No graph-native reviews yet.</p>')+'</section>';
  detail.querySelectorAll("[data-node]").forEach(b=>b.addEventListener("click",()=>showNode(b.dataset.node)));
}

function showSearch(){
  const q=search.value.trim().toLowerCase();
  if(!q){results.hidden=true;results.innerHTML="";return}
  const hits=model.nodes.filter(n=>[n.label,n.summary,n.kind,...(n.tags||[]),...(n.aliases||[])].join(" ").toLowerCase().includes(q)).slice(0,18);
  results.innerHTML=hits.length?hits.map(n=>'<button class="searchHit" data-node="'+esc(n.id)+'"><b>'+esc(n.label)+'</b><span>'+esc(familyById.get(n.domain)?.short||n.domain)+' · '+esc(n.kind)+'</span></button>').join(""):'<div class="searchHit"><b>No mapped match</b><span>This can become a Nemesis coverage target.</span></div>';
  results.hidden=false;
  results.querySelectorAll("[data-node]").forEach(b=>b.addEventListener("click",()=>{const n=nodeById.get(b.dataset.node);results.hidden=true;search.value="";if(n&&currentFamily!==n.domain)renderFamily(n.domain);showNode(b.dataset.node)}));
}

function bind(){
  atlasBtn.addEventListener("click",renderAtlas);
  backBtn.addEventListener("click",renderAtlas);
  search.addEventListener("input",showSearch);
  document.addEventListener("click",e=>{if(!results.contains(e.target)&&e.target!==search)results.hidden=true});
}

boot().catch(err=>{console.error(err);detail.innerHTML='<div class="detailHero"><div class="eyebrow">ERROR</div><h2>Map failed to load</h2><p>'+esc(err.message)+'</p></div>'});
