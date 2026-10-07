const graph=document.querySelector("#graph");
const mapShell=document.querySelector("#mapShell");
const scene=document.querySelector("#scene");
const detail=document.querySelector("#detail");
const search=document.querySelector("#search");
const results=document.querySelector("#searchResults");
const hubBtn=document.querySelector("#hubBtn")||document.querySelector("#atlasBtn");
const expandFieldBtn=document.querySelector("#expandFieldBtn");
const expandAllBtn=document.querySelector("#expandAllBtn");
const frontierLensBtn=document.querySelector("#frontierLensBtn");
const backBtn=document.querySelector("#backBtn");
const crumb=document.querySelector("#crumb");
const mapCaption=document.querySelector("#mapCaption");
const compactList=document.querySelector("#compactList");
const NS="http://www.w3.org/2000/svg";
const FALSE_EDGE_TYPES=new Set(["contradicts","supersedes","failed_replication"]);
const FALSE_STATUSES=new Set(["invalidated","historical","dependency-broken"]);

const STATUS={
  foundational:["Foundational","#ffbf57"],
  established:["Strongly established","#65f5b0"],
  active:["Active","#66bfff"],
  disputed:["Disputed","#ffc857"],
  frontier:["Frontier / unresolved","#c497ff"],
  invalidated:["Invalidated / falsified","#ff4d67"],
  historical:["Historical / superseded","#8e96a8"],
  "dependency-broken":["Broken dependency","#ff4d67"],
  "review-required":["Review required","#ffc857"]
};

let FAMILIES=[];
let familyById=new Map();
let navigation;
let evidenceIndex;
let evidenceLens=false;
let allLabels=false;
let viewportOverride=null;
let fittedViewport=null;
let cameraGesture=false;
let navigationByParent=new Map();
let navigationByChild=new Map();

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
let restoredAtlasState=false;
let expandAll=false;
let expandFieldDeep=false;
let frontierLens=false;
let layoutCompact=false;
let selectedFalseEdge=null;
let lastDeepLayout=null;
let massiveAtlas=null;
let lastObstacleCircles=[];
const STRUCTURAL_RELATIONS=new Set(["enabled","derived_from","depends_on","refines","tests","supports","replicates","related"]);
const TREE_EXCLUDED_RELATIONS=new Set(["cites","contradicts","supersedes","failed_replication"]);
const EDGE_WIDTH=2.25;
const DEPTH_GAP=190;
const NODE_CLEARANCE=22;
const ATLAS_STATE_KEY="fog-of-knowledge:atlas-state:v3";
const ATLAS_SNAPSHOT_KEY="fog-of-knowledge:atlas-snapshot:v4";

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

function drawFamilyMotif(g,f){
  const motif=mk("g",{class:"familyMotif familyMotif-"+f.id});
  const stroke=f.color;

  if(f.id==="formal"){
    motif.append(mk("polygon",{points:"0,-46 40,23 -40,23",fill:"none",stroke}));
    motif.append(mk("circle",{r:32,fill:"none",stroke}));
    motif.append(mk("line",{x1:-45,y1:0,x2:45,y2:0,stroke}));
  }else if(f.id==="physical"){
    motif.append(mk("ellipse",{rx:45,ry:18,fill:"none",stroke,transform:"rotate(-22)"}));
    motif.append(mk("ellipse",{rx:45,ry:18,fill:"none",stroke,transform:"rotate(38)"}));
    motif.append(mk("circle",{r:5,fill:stroke}));
  }else if(f.id==="earth"){
    motif.append(mk("path",{d:"M -44 14 Q 0 -34 44 14",fill:"none",stroke}));
    motif.append(mk("path",{d:"M -37 28 Q 0 -10 37 28",fill:"none",stroke}));
    motif.append(mk("path",{d:"M -28 -12 Q 0 -34 28 -12",fill:"none",stroke}));
  }else if(f.id==="life"){
    for(const [x,y,r] of [[-18,-12,14],[14,-4,18],[-4,20,12],[24,23,8]]){
      motif.append(mk("circle",{cx:x,cy:y,r,fill:"none",stroke}));
    }
  }else if(f.id==="health"){
    motif.append(mk("line",{x1:-32,y1:0,x2:32,y2:0,stroke}));
    motif.append(mk("line",{x1:0,y1:-32,x2:0,y2:32,stroke}));
    motif.append(mk("circle",{r:39,fill:"none",stroke}));
  }else if(f.id==="engineering"){
    motif.append(mk("circle",{r:28,fill:"none",stroke}));
    for(let i=0;i<8;i++){
      const a=i*Math.PI/4,p1=polar(0,0,34,a),p2=polar(0,0,44,a);
      motif.append(mk("line",{x1:p1.x,y1:p1.y,x2:p2.x,y2:p2.y,stroke}));
    }
    motif.append(mk("circle",{r:9,fill:"none",stroke}));
  }else if(f.id==="information"){
    const pts=[[-34,-22],[-9,-34],[22,-20],[34,8],[8,31],[-25,20]];
    for(let i=0;i<pts.length;i++){
      const [x,y]=pts[i], [nx,ny]=pts[(i+1)%pts.length];
      motif.append(mk("line",{x1:x,y1:y,x2:nx,y2:ny,stroke}));
      motif.append(mk("circle",{cx:x,cy:y,r:4,fill:stroke}));
    }
    motif.append(mk("circle",{r:5,fill:stroke}));
  }else if(f.id==="social"){
    motif.append(mk("circle",{cx:0,cy:-15,r:10,fill:"none",stroke}));
    motif.append(mk("circle",{cx:-24,cy:18,r:9,fill:"none",stroke}));
    motif.append(mk("circle",{cx:24,cy:18,r:9,fill:"none",stroke}));
    motif.append(mk("path",{d:"M 0 -5 L -18 10 M 0 -5 L 18 10 M -15 18 L 15 18",stroke,fill:"none"}));
  }else if(f.id==="humanities"){
    motif.append(mk("path",{d:"M -34 -30 L -4 -22 L -4 32 L -34 24 Z",fill:"none",stroke}));
    motif.append(mk("path",{d:"M 34 -30 L 4 -22 L 4 32 L 34 24 Z",fill:"none",stroke}));
    motif.append(mk("line",{x1:0,y1:-23,x2:0,y2:32,stroke}));
  }else{
    for(let i=0;i<8;i++){
      const a=i*Math.PI/4,p1=polar(0,0,24,a),p2=polar(0,0,43,a);
      motif.append(mk("line",{x1:p1.x,y1:p1.y,x2:p2.x,y2:p2.y,stroke}));
    }
    motif.append(mk("circle",{r:17,fill:"none",stroke}));
  }

  g.append(motif);
}

function drawCoreMonument(g,center){
  for(let i=0;i<24;i++){
    const a=i*Math.PI*2/24;
    const p1=polar(center.x,center.y,123,a);
    const p2=polar(center.x,center.y,i%3===0?138:132,a);
    g.append(mk("line",{x1:p1.x,y1:p1.y,x2:p2.x,y2:p2.y,class:"coreRay"}));
  }
  g.append(mk("circle",{cx:center.x,cy:center.y,r:132,class:"coreCrown"}));
  g.append(mk("circle",{cx:center.x,cy:center.y,r:106,class:"coreInner"}));
}

function drawScar(g,radius){
  const pts=[
    [-radius*.72,-radius*.22],
    [-radius*.34,-radius*.08],
    [-radius*.17,-radius*.28],
    [radius*.02,radius*.04],
    [radius*.24,-radius*.08],
    [radius*.44,radius*.26],
    [radius*.72,radius*.15]
  ].map(([x,y])=>x+","+y).join(" ");
  g.append(mk("polyline",{points:pts,class:"scarMain"}));
  g.append(mk("line",{x1:-radius*.03,y1:radius*.02,x2:-radius*.22,y2:radius*.35,class:"scarBranch"}));
  g.append(mk("line",{x1:radius*.25,y1:-radius*.06,x2:radius*.39,y2:-radius*.36,class:"scarBranch"}));
}

function drawJunction(parent,a,b,color){
  const x=(a.x+b.x)/2,y=(a.y+b.y)/2;
  parent.append(mk("circle",{cx:x,cy:y,r:5,fill:color,class:"arteryJunction"}));
  parent.append(mk("circle",{cx:x,cy:y,r:11,fill:"none",stroke:color,class:"arteryJunctionRing"}));
}

async function boot(){
  [model,FAMILIES,navigation,evidenceIndex]=await Promise.all(["knowledge","atlas-families","atlas-navigation","evidence-index"].map(name=>fetch(`./data/${name}.json`,{cache:"no-store"}).then(response=>{if(!response.ok)throw Error("Atlas data unavailable: "+name);return response.json()})));
  familyById=new Map(FAMILIES.map(f=>[f.id,f]));
  model.nodes.push(...navigation.registry_nodes);
  for(const id of navigation.registry_ids){
    const n=model.nodes.find(n=>n.id===id);
    if(n&&!(n.tags||[]).includes("ology"))(n.tags??=[]).push("ology");
  }
  for(const link of navigation.links){
    if(!navigationByParent.has(link.source))navigationByParent.set(link.source,[]);
    navigationByParent.get(link.source).push(link);
    navigationByChild.set(link.target,link);
  }
  nodeById=new Map(model.nodes.map(n=>[n.id,n]));
  buildIndexes();
  deriveStatuses();
  restoredAtlasState=restoreAtlasState();
  if(restoredAtlasState)document.body.classList.add("atlasStateRestored");
  document.querySelector("#nodeCount").textContent=model.nodes.length.toLocaleString();
  document.querySelector("#frontierCount").textContent=model.nodes.filter(n=>n.frontier).length.toLocaleString();
  const falseEl=document.querySelector("#falseCount");
  if(falseEl){
    const falseN=model.nodes.filter(n=>FALSE_STATUSES.has(n.status)||n.status==="disputed").length
      + model.edges.filter(e=>FALSE_EDGE_TYPES.has(e.type)).length;
    falseEl.textContent=falseN.toLocaleString();
  }
  bind();
  bindAtlasCamera();
  bindPublicFrontier();
  massiveAtlas=new FogMassiveAtlas(document.querySelector("#circuitCanvas"),graph,{families:FAMILIES,navigation,nodes:model.nodes,edges:model.edges,onSelect:node=>activateSearchResult(node),onHover:node=>{const h=document.querySelector("#nodeHover");h.hidden=!node;if(node)h.textContent=node.label}});
  observeLayout();
  render();
  requestAnimationFrame(()=>document.body.classList.remove("atlasStateRestored","atlasPrehydrated"));
}


function persistAtlasState(){
  try{
    const payload={
      version:2,
      path:activePath.map(t=>({
        kind:t.kind,
        id:t.id,
        angle:Number.isFinite(t.angle)?t.angle:null,
        r:Number.isFinite(t.r)?t.r:null,
        relation:t.relation||null
      })),
      expanded:expandAll,expandedField:expandFieldDeep,evidenceLens,frontierLens,allLabels,
      pages:Object.fromEntries(childPageByKey)
    };
    localStorage.setItem(ATLAS_STATE_KEY,JSON.stringify(payload));
  }catch(err){
    console.warn("Fog atlas state could not be saved",err);
  }
}

function restoreAtlasState(){
  try{
    const raw=localStorage.getItem(ATLAS_STATE_KEY);
    if(!raw)return false;
    const saved=JSON.parse(raw);
    if(saved?.version!==2||!Array.isArray(saved.path))return false;

    const restored=[];
    for(const token of saved.path){
      if(token?.kind==="family"){
        if(!familyById.has(token.id))break;
        restored.push({
          kind:"family",
          id:token.id,
          angle:Number.isFinite(token.angle)?token.angle:0,
          r:Number.isFinite(token.r)?token.r:330
        });
        continue;
      }

      if(token?.kind==="node"){
        if(!nodeById.has(token.id))break;
        const previous=restored[restored.length-1];
        const expectedParent=previous?.kind==="family"?"family:"+previous.id:previous?.id;
        if(navigationByChild.get(token.id)?.source!==expectedParent)break;
        restored.push({
          kind:"node",
          id:token.id,
          angle:Number.isFinite(token.angle)?token.angle:0,
          r:Number.isFinite(token.r)?token.r:505,
          relation:token.relation||"category"
        });
        continue;
      }

      break;
    }

    if(restored.length&&restored[0].kind!=="family")return false;
    activePath=restored;
    expandAll=saved.expanded===true;expandFieldDeep=!expandAll&&saved.expandedField===true&&activePath.length>0;
    evidenceLens=saved.evidenceLens===true;frontierLens=saved.frontierLens===true;allLabels=saved.allLabels===true;
    childPageByKey=new Map(Object.entries(saved.pages||{}).map(([k,v])=>[k,Number(v)||0]));
    return activePath.length>0||expandAll;
  }catch(err){
    console.warn("Fog atlas state could not be restored",err);
    return false;
  }
}

function persistVisualSnapshot(){
  try{
    const snapshot={
      version:2,
      scene:scene.innerHTML,
      detail:detail.innerHTML,
      crumb:crumb.innerHTML,
      caption:mapCaption.innerHTML,
      viewBox:graph.getAttribute("viewBox")||"0 0 1600 1000",
      nodeCount:document.querySelector("#nodeCount")?.textContent||"",
      frontierCount:document.querySelector("#frontierCount")?.textContent||"",
      backHidden:backBtn.hidden,
      backText:backBtn.textContent||""
    };
    localStorage.setItem(ATLAS_SNAPSHOT_KEY,JSON.stringify(snapshot));
  }catch(err){
    console.warn("Fog visual snapshot could not be saved",err);
  }
}

function clearAtlasState(){
  activePath=[];
  childPageByKey.clear();
  selectedFalseEdge=null;
  try{localStorage.removeItem(ATLAS_STATE_KEY)}catch{}
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
  const parent=token.kind==="family"?"family:"+token.id:token.id;
  const used=pathNodeIds();
  return (navigationByParent.get(parent)||[])
    .map(link=>({node:nodeById.get(link.target),relation:link.type,link}))
    .filter(item=>item.node&&!used.has(item.node.id));
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


function hierarchyChildren(nodeId,familyId,assigned,ancestors,reservedRoots=new Set()){
  return (navigationByParent.get(nodeId)||[])
    .map(edge=>({edge,node:nodeById.get(edge.target),direction:"out"}))
    .filter(({node})=>node&&node.domain===familyId&&!ancestors.has(node.id)&&!assigned.has(node.id)&&!reservedRoots.has(node.id));
}

function buildNodeTree(node,familyId,assigned,ancestors,relation="category",pathIds=[],reservedRoots=new Set()){
  if(!node||assigned.has(node.id)||ancestors.has(node.id))return null;
  assigned.add(node.id);
  const nextAnc=new Set(ancestors);
  nextAnc.add(node.id);
  const tree={
    key:"node:"+node.id,
    kind:"node",
    id:node.id,
    node,
    familyId,
    relation,
    children:[],
    weight:1,
    pathIds:[...pathIds,node.id]
  };
  for(const item of hierarchyChildren(node.id,familyId,assigned,nextAnc,reservedRoots)){
    const child=buildNodeTree(item.node,familyId,assigned,nextAnc,item.edge.type,tree.pathIds,reservedRoots);
    if(child)tree.children.push(child);
  }
  tree.weight=tree.children.length?tree.children.reduce((s,x)=>s+x.weight,0):1;
  return tree;
}
function buildFamilyTree(f,assigned=new Set()){
  const majors=childrenFor({kind:"family",id:f.id}).map(item=>item.node);
  const reservedRoots=new Set(majors.map(n=>n.id));
  const tree={
    key:"family:"+f.id,
    kind:"family",
    id:f.id,
    family:f,
    familyId:f.id,
    relation:"category",
    children:[],
    weight:1,
    pathIds:[]
  };
  for(const node of majors){
    reservedRoots.delete(node.id);
    const child=buildNodeTree(node,f.id,assigned,new Set(),navigationByChild.get(node.id)?.type||"category",[],reservedRoots);
    reservedRoots.add(node.id);
    if(child)tree.children.push(child);
  }
  tree.weight=tree.children.length?tree.children.reduce((s,x)=>s+x.weight,0):1;
  return tree;
}
function buildSelectedTree(){
  const root=currentToken();
  if(!root)return null;
  const f=familyById.get(activePath[0]?.id||root.id);
  if(!f)return null;

  if(root.kind==="family")return buildFamilyTree(f,new Set());

  const node=nodeById.get(root.id);
  if(!node)return null;
  const assigned=new Set();
  const knownAncestors=new Set(
    activePath
      .filter(t=>t.kind==="node"&&t.id!==root.id)
      .map(t=>t.id)
  );
  const reservedRoots=new Set(childrenFor({kind:"family",id:f.id}).map(item=>item.node.id).filter(id=>id!==root.id));
  return buildNodeTree(node,f.id,assigned,knownAncestors,root.relation||"category",[],reservedRoots);
}
function assignTreeAngles(tree,start,end){
  tree.angle=(start+end)/2;
  if(!tree.children.length)return;
  const total=tree.children.reduce((s,x)=>s+x.weight,0)||1;
  let cursor=start;
  for(const child of tree.children){
    const width=(end-start)*(child.weight/total);
    assignTreeAngles(child,cursor,cursor+width);
    cursor+=width;
  }
}

function flattenTree(tree,depth=0,parent=null,out=[]){
  out.push({tree,depth,parent});
  for(const child of tree.children)flattenTree(child,depth+1,tree,out);
  return out;
}

function visualRadiusFor(entry,mode){
  if(entry.tree.kind==="family")return 74;
  if(mode==="all")return entry.depth<=1?34:30;
  return entry.depth<=1?48:44;
}

function labelFootprintFor(entry,mode){
  const radius=visualRadiusFor(entry,mode);
  // Canonical labels are positioned separately. Circle collision geometry therefore
  // follows the visible orb plus a fixed breathing margin, not title length.
  return radius+(mode==="all"?12:16);
}
function angleDistance(a,b){
  let d=Math.abs(a-b)%(Math.PI*2);
  return d>Math.PI?Math.PI*2-d:d;
}

function requiredRadiusForRing(entries,mode,wrap=false){
  if(entries.length<2)return 0;
  const sorted=[...entries].sort((a,b)=>a.tree.angle-b.tree.angle);
  let required=0;
  const pairs=[];
  for(let i=1;i<sorted.length;i++)pairs.push([sorted[i-1],sorted[i]]);
  if(wrap&&sorted.length>2)pairs.push([sorted[sorted.length-1],sorted[0]]);
  for(const [a,b] of pairs){
    const d=angleDistance(a.tree.angle,b.tree.angle);
    if(d<1e-5)return 1e9;
    const minDist=labelFootprintFor(a,mode)+labelFootprintFor(b,mode)+NODE_CLEARANCE;
    const denom=2*Math.sin(d/2);
    if(denom>1e-6)required=Math.max(required,minDist/denom);
  }
  return required;
}

function computeUniformGap(flat,baseRadius,mode,wrap=false){
  const byDepth=new Map();
  for(const entry of flat){
    if(!byDepth.has(entry.depth))byDepth.set(entry.depth,[]);
    byDepth.get(entry.depth).push(entry);
  }
  let gap=mode==="all"?170:DEPTH_GAP;
  for(const [depth,entries] of byDepth){
    if(depth===0)continue;
    const need=requiredRadiusForRing(entries,mode,wrap);
    if(Number.isFinite(need)&&need<1e8){
      gap=Math.max(gap,(need-baseRadius)/depth);
    }
  }
  return Math.ceil(Math.max(gap,mode==="all"?170:DEPTH_GAP)/10)*10;
}


function packEntriesIntoRows(entries,start,end,baseRadius,rowGap,startRow,mode){
  const sorted=[...entries].sort((a,b)=>a.tree.angle-b.tree.angle||a.tree.key.localeCompare(b.tree.key));
  const n=sorted.length;
  if(!n)return startRow;
  const sweep=Math.max(.08,end-start);
  const maxR=Math.max(...sorted.map(e=>visualRadiusFor(e,mode)));
  const minCenter=maxR*2+NODE_CLEARANCE;

  // Pick the smallest number of physical rows that gives nodes sharing a row
  // enough angular separation. Entries are then interleaved across those rows,
  // so no later node sits directly behind an earlier node on the same ray.
  let rows=1;
  for(;rows<=n;rows++){
    let ok=true;
    for(let row=0;row<rows;row++){
      const count=Math.ceil((n-row)/rows);
      if(count<=1)continue;
      const r=baseRadius+(startRow+row)*rowGap;
      const slotGap=rows*sweep/n;
      const chord=2*r*Math.sin(slotGap/2);
      if(chord<minCenter){ok=false;break}
    }
    if(ok)break;
  }
  rows=Math.min(rows,n);

  sorted.forEach((entry,i)=>{
    const row=i%rows;
    entry.rowIndex=startRow+row;
    entry.r=baseRadius+entry.rowIndex*rowGap;
    entry.tree.angle=start+(i+.5)*(sweep/n);
  });

  return startRow+rows;
}
function familySectorBounds(index){
  const sector=Math.PI*2/FAMILIES.length;
  const mid=-Math.PI/2+index*sector;
  const margin=.14;
  return {start:mid-sector/2+margin,end:mid+sector/2-margin,mid};
}

function computeTreeLayout(mode){
  const center={x:800,y:500};
  const items=[];
  const edges=[];
  const rowGap=mode==="all"?150:175;

  if(mode==="all"){
    const assigned=new Set();
    const trees=FAMILIES.map(f=>flattenTree(buildFamilyTree(f,assigned)));
    const packed=FogBranches.layout(FAMILIES,trees);
    items.push(...packed.entries);
  }else{
    const tree=buildSelectedTree();
    if(!tree)return {mode,center,items:[],edges:[],positions:new Map(),circles:[],bounds:null,gap:rowGap};
    const root=currentToken();
    const rootAngle=root.angle;
    const sweep=root.kind==="family"?2.25:2.45;
    const start=rootAngle-sweep/2,end=rootAngle+sweep/2;
    assignTreeAngles(tree,start,end);
    const flat=flattenTree(tree);
    flat[0].rowIndex=0;
    flat[0].r=root.r;
    flat[0].tree.angle=rootAngle;

    let row=1;
    const maxDepth=Math.max(...flat.map(x=>x.depth));
    for(let depth=1;depth<=maxDepth;depth++){
      const level=flat.filter(x=>x.depth===depth);
      if(!level.length)continue;
      row=packEntriesIntoRows(level,start,end,root.r,rowGap,row,"field");
    }
    items.push(...flat);
  }

  for(const entry of items){
    entry.radius=entry.depth===0
      ? (entry.tree.kind==="family"?74:(currentToken()?.visualRadius||58))
      : visualRadiusFor(entry,mode);
    entry.footprint=entry.depth===0?entry.radius+16:labelFootprintFor(entry,mode);
    if(mode!=="all"){const p=polar(center.x,center.y,entry.r,entry.tree.angle);entry.x=p.x;entry.y=p.y;}
  }

  const keyMap=new Map(items.map(x=>[x.tree.key,x]));
  for(const entry of items){
    if(!entry.parent)continue;
    const from=keyMap.get(entry.parent.key);
    if(from)edges.push({from,to:entry,relation:entry.tree.relation,familyId:entry.tree.familyId});
  }

  const positions=new Map();
  const circles=[];
  for(const entry of items){
    if(entry.tree.kind==="node")positions.set(entry.tree.id,{x:entry.x,y:entry.y,entry});
    circles.push({x:entry.x,y:entry.y,r:entry.radius+7,key:entry.tree.key});
  }
  circles.push({x:center.x,y:center.y,r:104,key:"core"});

  const layout={mode,center,items,edges,positions,circles,gap:rowGap};
  if(mode!=="all")relaxLayout(layout);
  layout.bounds=layoutBounds(layout);
  return layout;
}
function circlesOverlap(a,b,pad=NODE_CLEARANCE){
  const dx=a.x-b.x,dy=a.y-b.y;
  const min=a.r+b.r+pad;
  return dx*dx+dy*dy<min*min;
}

function layoutOverlapCount(layout){
  let count=0;
  const cs=layout.circles;
  for(let i=0;i<cs.length;i++){
    for(let j=i+1;j<cs.length;j++){
      if(cs[i].key==="core"||cs[j].key==="core"){
        // Family/core geometry intentionally has its own generous ring.
      }
      if(circlesOverlap(cs[i],cs[j],8))count++;
    }
  }
  return count;
}

function rebuildLayoutGeometry(layout,multiplier){
  const baseR=layout.mode==="all"?330:(currentToken()?.r||330);
  layout.gap=Math.ceil(layout.gap*multiplier/5)*5;
  for(const entry of layout.items){
    entry.r=baseR+(entry.rowIndex||0)*layout.gap;
    const p=polar(layout.center.x,layout.center.y,entry.r,entry.tree.angle);
    entry.x=p.x;entry.y=p.y;
  }
  const positions=new Map();
  const circles=[];
  for(const entry of layout.items){
    if(entry.tree.kind==="node")positions.set(entry.tree.id,{x:entry.x,y:entry.y,entry});
    circles.push({x:entry.x,y:entry.y,r:entry.radius+7,key:entry.tree.key});
  }
  circles.push({x:layout.center.x,y:layout.center.y,r:104,key:"core"});
  layout.positions=positions;
  layout.circles=circles;
}
function relaxLayout(layout){
  // Hard invariant: no circle overlap. Increase ONE uniform ring gap for the
  // whole view, preserving equal depth spacing and deterministic positions.
  for(let i=0;i<28;i++){
    if(layoutOverlapCount(layout)===0)return;
    rebuildLayoutGeometry(layout,1.12);
  }
  const remaining=layoutOverlapCount(layout);
  if(remaining)console.error("Fog layout invariant failed: "+remaining+" circle overlaps remain");
}
function layoutBounds(layout){
  if(!layout.items.length)return null;
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for(const e of layout.items){
    const pad=e.footprint+22;
    minX=Math.min(minX,e.x-pad);
    maxX=Math.max(maxX,e.x+pad);
    minY=Math.min(minY,e.y-pad);
    maxY=Math.max(maxY,e.y+pad);
  }
  if(layout.mode==="all"){
    minX=Math.min(minX,layout.center.x-125);
    maxX=Math.max(maxX,layout.center.x+125);
    minY=Math.min(minY,layout.center.y-125);
    maxY=Math.max(maxY,layout.center.y+125);
  }
  return {minX,minY,maxX,maxY,width:maxX-minX,height:maxY-minY};
}

function fitDeepLayout(layout){
  if(!layout?.bounds)return;
  const b=layout.bounds;
  const shellW=Math.max(1,mapShell.clientWidth||1200);
  const shellH=Math.max(1,mapShell.clientHeight||760);
  const aspect=shellW/shellH;
  const pad=Math.max(90,b.width/shellW*110,b.height/shellH*70);
  let width=b.width+pad*2;
  let height=b.height+pad*2;
  if(width/height<aspect)width=height*aspect;
  else height=width/aspect;
  const cx=(b.minX+b.maxX)/2;
  const cy=(b.minY+b.maxY)/2;
  graph.setAttribute("viewBox",[
    (cx-width/2).toFixed(2),
    (cy-height/2).toFixed(2),
    width.toFixed(2),
    height.toFixed(2)
  ].join(" "));
}

const {routeEdge,segmentClear}=FogCircuitRoutes;
function drawUniformEdge(parent,from,to,color,obstacles,relation="category",laneSeed=0,extraClass=""){
  const route=routeEdge(from,to,obstacles,laneSeed);
  if(!route)return false;
  const isFalse=FALSE_EDGE_TYPES.has(relation);
  const cls=(isFalse?"knowledgeEdge falseTrail":"knowledgeEdge navigationBranch")+" "+(relation==="placement_pending"?"inventoryBranch ":"")+extraClass;
  parent.append(mk("path",{d:route.d,class:cls.trim(),stroke:isFalse?"#ff4d67":color,
    "data-from":from.tree?.key||from.key,"data-to":to.tree?.key||to.key}));
  return true;
}

function deepPathTokens(entry,layout){
  const chain=[];
  let cur=entry;
  while(cur){
    chain.push(cur);
    cur=cur.parent?layout.items.find(x=>x.tree===cur.parent):null;
  }
  chain.reverse();
  const tokens=[];
  for(const e of chain){
    if(e.tree.kind==="family"){
      tokens.push({kind:"family",id:e.tree.id,angle:e.tree.angle,r:e.r});
    }else{
      tokens.push({
        kind:"node",
        id:e.tree.id,
        angle:e.tree.angle,
        r:e.r,
        relation:e.tree.relation||"category",
        visualRadius:e.radius
      });
    }
  }
  return tokens;
}

function drawDeepLayout(parent,layout){
  if(!layout)return;
  lastDeepLayout=layout;
  lastObstacleCircles=layout.circles;

  layout.edges.forEach((edge,i)=>{
    const f=familyById.get(edge.familyId)||FAMILIES[0];
    drawUniformEdge(parent,edge.from,edge.to,f.color,layout.circles,edge.relation,i);
  });

  for(const entry of layout.items){
    if(entry.depth===0)continue; // root is already the great-field/current node
    const n=entry.tree.node;
    if(!n)continue;
    const token={
      kind:"node",
      id:n.id,
      angle:entry.tree.angle,
      r:entry.r,
      relation:entry.tree.relation||"category",
      visualRadius:entry.radius
    };
    const role=layout.mode==="all"?"deepAll":"deepField";
    drawKnowledgeNode(parent,n,{x:entry.x,y:entry.y},token,false,role,()=>{
      expandAll=false;
      expandFieldDeep=false;
      activePath=deepPathTokens(entry,layout);
      selectedFalseEdge=null;
      render();
    },entry.tree.relation||"category");
  }
}

function layoutChildren(token,items){
  if(!items.length)return[];
  const output=[];
  const span=1.85;
  let cursor=0;
  let row=0;

  while(cursor<items.length){
    const r=token.r+DEPTH_GAP*(row+1);
    const nodeRadius=48;
    const minCenter=nodeRadius*2+NODE_CLEARANCE;
    const minAngle=2*Math.asin(Math.min(.98,minCenter/(2*r)));
    const capacity=Math.max(1,Math.floor(span/Math.max(minAngle,.08))+1);
    const rowItems=items.slice(cursor,cursor+capacity);
    const count=rowItems.length;
    const usedSpan=count<=1?0:Math.min(span,(count-1)*Math.max(minAngle,.08));

    rowItems.forEach((item,i)=>{
      const offset=count===1?0:-usedSpan/2+i*(usedSpan/(count-1));
      output.push({...item,angle:token.angle+offset,r,visualRadius:nodeRadius});
    });

    cursor+=rowItems.length;
    row++;
  }
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
  if(!cameraGesture)viewportOverride=null;
  const frag=document.createDocumentFragment();
  const camera=cameraCenter();
  const center={x:camera.x,y:camera.y};
  const ringR=330;
  const step=Math.PI*2/FAMILIES.length;

  lastDeepLayout=null;
  lastObstacleCircles=[];
  evidenceContextPoints=[];

  familyAngles=new Map();
  FAMILIES.forEach((f,i)=>familyAngles.set(f.id,-Math.PI/2+i*step));

  if(activePath[0]?.kind==="family"){
    activePath[0].angle=familyAngles.get(activePath[0].id);
    activePath[0].r=ringR;
  }

  const globalLayout=null;
  massiveAtlas?.setActive(expandAll||expandFieldDeep);
  massiveAtlas?.configure({evidenceLens:evidenceLens||expandFieldDeep,frontierLens,allLabels,scopeKey:expandFieldDeep&&currentToken()?tokenKey(currentToken()):null});
  drawFogAndOrbits(frag,center);
  drawBaseBranches(frag,center,globalLayout?globalLayout.items.find(e=>e.tree.kind==="family").r:ringR);
  drawActiveRealm(frag,center);
  drawCore(frag,center);
  drawFamilies(frag,center,globalLayout?globalLayout.items.find(e=>e.tree.kind==="family").r:ringR);
  drawActivePath(frag,center);

  if(expandAll){
    massiveAtlas.configure({evidenceLens,frontierLens,allLabels});
  }else if(expandFieldDeep&&activePath.length){
    // The worker-backed circuit renderer handles complete branch expansion.
  }else{
    drawCurrentChildren(frag,center);
  }

  if(!massiveAtlas.active&&(evidenceLens||currentToken()))drawEvidenceTopology(frag,center);

  scene.replaceChildren(frag);

  if(massiveAtlas.active&&massiveAtlas.ready)massiveAtlas.fit();
  else if(lastDeepLayout)fitDeepLayout(lastDeepLayout);
  else fitViewToActiveBranch(center);
  fitEvidenceContext();

  fittedViewport=readViewport();
  if(viewportOverride)writeViewport(viewportOverride);
  updateLabelVisibility();
  renderBreadcrumb();
  renderDetail();
  augmentEvidenceDetails();
  renderCaption();
  renderCompactList();
  syncExpandButtons();

  backBtn.hidden=!activePath.length;
  backBtn.textContent=activePath.length>1?"← ONE LEVEL":"← ALL KNOWLEDGE";
  persistAtlasState();
  if(!massiveAtlas.active)persistVisualSnapshot();
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
  const obstacles=[
    {x:center.x,y:center.y,r:96,key:"core"},
    ...FAMILIES.map(f=>{
      const a=familyAngles.get(f.id);
      const p=polar(center.x,center.y,ringR,a);
      return {x:p.x,y:p.y,r:74,key:"family:"+f.id};
    })
  ];

  FAMILIES.forEach((f,i)=>{
    const a=familyAngles.get(f.id);
    const end=polar(center.x,center.y,ringR,a);
    const from={x:center.x,y:center.y,radius:96,key:"core"};
    const to={x:end.x,y:end.y,radius:74,key:"family:"+f.id};
    const g=mk("g",{class:"atlasBranch"+(selected&&selected!==f.id&&!expandAll?" dim":"")});
    drawUniformEdge(g,from,to,f.color,obstacles,"category",i,"hubEdge");
    parent.append(g);
  });
}
function drawActiveRealm(parent,center){
  const token=activePath[0];
  if(!token)return;
  const f=familyById.get(token.id);
  if(!f)return;

  const a=familyAngles.get(f.id);
  const left=polar(center.x,center.y,455,a-.28);
  const right=polar(center.x,center.y,455,a+.28);
  const tip=polar(center.x,center.y,175,a);
  const d=`M ${tip.x} ${tip.y} L ${left.x} ${left.y} A 455 455 0 0 1 ${right.x} ${right.y} Z`;
  parent.append(mk("path",{d,fill:f.color,class:"activeRealm"}));
}

function drawCore(parent,center){
  const g=mk("g",{class:"knowledgeCore"});
  g.append(mk("circle",{cx:center.x,cy:center.y,r:164,class:"halo"}));
  drawCoreMonument(g,center);
  g.append(mk("circle",{cx:center.x,cy:center.y,r:96,class:"ring"}));
  g.append(mk("circle",{cx:center.x,cy:center.y,r:116,class:"ring2"}));
  g.append(textNode(center.x,center.y-20,"HUMAN","coreTitle"));
  g.append(textNode(center.x,center.y+12,"KNOWLEDGE","coreTitle"));
  g.append(textNode(center.x,center.y+43,"THE SHARED PROJECT OF KNOWING","coreSub"));
  g.append(textNode(center.x,center.y+65,model.nodes.length.toLocaleString()+" MAPPED NODES","coreCount"));
  g.addEventListener("click",()=>{goHub()});
  parent.append(g);
}

function drawFamilies(parent,center,ringR){
  const selected=activePath[0]?.id||null;

  FAMILIES.forEach(f=>{
    const angle=familyAngles.get(f.id);
    const p=polar(center.x,center.y,ringR,angle);
    const nodes=familyNodes(f.id);
    const front=nodes.filter(n=>n.frontier).length;
    const falseN=nodes.filter(n=>FALSE_STATUSES.has(n._status||n.status)).length;
    const active=selected===f.id;
    const frontierish=front>0||falseN>0;

    const g=mk("g",{
      class:"domainGroup"+(active?" selected":"")+(selected&&!active&&!expandAll?" dim":"")+(frontierish?" frontierish":""),
      transform:`translate(${p.x} ${p.y})`
    });

    const discR=74;
    g.append(mk("circle",{r:98,fill:f.color,class:"halo"}));
    g.append(mk("circle",{r:discR,class:"disc",stroke:f.color}));
    g.append(mk("circle",{r:84,class:"ring",stroke:f.color}));

    for(let j=0;j<10;j++){
      const a=j*Math.PI*2/10;
      const p1=polar(0,0,88,a),p2=polar(0,0,94,a);
      g.append(mk("line",{x1:p1.x,y1:p1.y,x2:p2.x,y2:p2.y,stroke:f.color,class:"orbitTick"}));
    }

    // Clip motif + in-orb text so nothing bleeds onto the border.
    const clipped=mk("g",{});
    const cp=mk("clipPath",{id:"clip-"+f.id});
    cp.append(mk("circle",{r:discR-8}));
    g.append(cp);
    clipped.setAttribute("clip-path","url(#clip-"+f.id+")");
    drawFamilyMotif(clipped,f);
    clipped.append(textNode(0,-50,f.icon,"domainIcon"));
    const familyLabel=mk("g",{class:"insideFamilyLabel"});
    familyLabel.dataset.label=f.title;
    setInsideCircleLabel(familyLabel,f.title,discR*.74);
    clipped.append(familyLabel);
    clipped.append(textNode(0,56,nodes.length.toLocaleString()+" · "+front+"F","domainCount"));
    g.append(clipped);

    g.append(textNode(0,discR+36,active?(expandFieldDeep?"FIELD OPEN":"OPEN"):"EXPAND →","domainHint"));

    g.addEventListener("click",()=>{
      expandAll=false;
      expandFieldDeep=false;
      selectedFalseEdge=null;
      activePath=[familyToken(f.id)];
      syncExpandButtons();
      render();
    });

    parent.append(g);
});
}

function drawExpandedFieldRing(){
  // Legacy v0.8 helper intentionally retired. Recursive expansion is handled
  // by computeTreeLayout()/drawDeepLayout().
}
function drawActivePath(parent,center){
  if(activePath.length<2)return;

  const obstacles=[
    {x:center.x,y:center.y,r:96,key:"core"},
    ...FAMILIES.map(f=>{
      const a=familyAngles.get(f.id);
      const p=polar(center.x,center.y,330,a);
      return {x:p.x,y:p.y,r:74,key:"family:"+f.id};
    }),
    ...activePath.filter(t=>t.kind==="node").map(t=>{
      const p=tokenPosition(t,center);
      return {x:p.x,y:p.y,r:t.visualRadius||58,key:"node:"+t.id};
    })
  ];

  for(let i=1;i<activePath.length;i++){
    const prev=activePath[i-1],cur=activePath[i];
    const a=tokenPosition(prev,center),b=tokenPosition(cur,center);
    const f=familyById.get(activePath[0].id);
    const from={x:a.x,y:a.y,radius:prev.kind==="family"?74:(prev.visualRadius||58),key:prev.kind+":"+prev.id};
    const to={x:b.x,y:b.y,radius:cur.visualRadius||58,key:"node:"+cur.id};
    drawUniformEdge(parent,from,to,f.color,obstacles,cur.relation||"category",i,"activeEdge");
  }

  for(let i=1;i<activePath.length;i++){
    const token=activePath[i];
    const node=nodeById.get(token.id);
    if(!node)continue;
    const p=tokenPosition(token,center);
    const age=Math.max(0,activePath.length-1-i);
    drawKnowledgeNode(parent,node,p,token,token===currentToken(),"path ancestorAge"+Math.min(age,3),()=>truncateTo(i));
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
  const parentRadius=token.kind==="family"?74:(token.visualRadius||58);

  const obstacles=[
    {x:center.x,y:center.y,r:104,key:"core"},
    ...FAMILIES.map(fam=>{
      const a=familyAngles.get(fam.id);
      const p=polar(center.x,center.y,330,a);
      return {x:p.x,y:p.y,r:74,key:"family:"+fam.id};
    }),
    {x:parentPos.x,y:parentPos.y,r:parentRadius,key:token.kind+":"+token.id},
    ...activePath.filter(t=>t.kind==="node"&&t.id!==token.id).map(t=>{
      const p=tokenPosition(t,center);
      return {x:p.x,y:p.y,r:t.visualRadius||58,key:"node:"+t.id};
    }),
    ...layouts.map(x=>{
      const p=polar(center.x,center.y,x.r,x.angle);
      return {x:p.x,y:p.y,r:x.visualRadius||48,key:"node:"+x.node.id};
    })
  ];

  layouts.forEach((layout,i)=>{
    const childPos=polar(center.x,center.y,layout.r,layout.angle);
    const childToken=nodeToken(layout.node,layout);
    childToken.visualRadius=layout.visualRadius||48;
    drawUniformEdge(
      parent,
      {x:parentPos.x,y:parentPos.y,radius:parentRadius,key:token.kind+":"+token.id},
      {x:childPos.x,y:childPos.y,radius:childToken.visualRadius,key:"node:"+layout.node.id},
      f.color,
      obstacles,
      layout.relation,
      i
    );

    drawKnowledgeNode(parent,layout.node,childPos,childToken,false,"child",()=>{
      activePath.push(childToken);
      render();
    },layout.relation);
  });

  if(pages>1){
    const navR=token.r+DEPTH_GAP*(Math.ceil(items.length/5)+1);
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
    const p=polar(center.x,center.y,token.r+DEPTH_GAP,token.angle);
    drawFrontierMarker(parent,p,node?.frontier?"RECORDED OPEN QUESTION":"UNMAPPED NEXT LAYER");
  }
}
function drawKnowledgeNode(parent,node,p,token,isCurrent,role,onClick,relation=""){
  const f=familyById.get(node.domain)||FAMILIES[0];
  const [,statusColor]=STATUS[node._status]||STATUS.active;
  const challenged=["invalidated","dependency-broken"].includes(node._status);
  const historical=node._status==="historical";
  const review=["review-required","disputed"].includes(node._status);
  const cls=[
    "knowledgeNode",role,"reveal",
    isCurrent?"current":"",
    node.frontier?"frontier":"",
    challenged?"invalidated":"",
    historical?"historical":"",
    review?"review":"",
    navigation.placement_pending_ids.includes(node.id)?"placementPending":"",
    (challenged||historical)?"falsePath":""
  ].filter(Boolean).join(" ");

  const g=mk("g",{class:cls,transform:`translate(${p.x} ${p.y})`});
  const radius=token.visualRadius|| (isCurrent?58:48);

  g.append(mk("circle",{r:radius+14,fill:challenged||historical?"#ff4d67":f.color,class:"halo"}));
  g.append(mk("circle",{r:radius,class:"disc",stroke:node.frontier?"#c497ff":(challenged||historical?"#ff4d67":f.color)}));
  g.append(mk("circle",{cx:0,cy:-radius+4,r:5,fill:statusColor,class:"status"}));

  // Full names stay centered inside the orb; metadata has its own lower slot.
  const labelG=mk("g",{class:"fullNodeLabel"});
  setInsideCircleLabel(labelG,node.label,radius*.78);
  g.append(labelG);
  g.setAttribute("aria-label",node.label);
  g.setAttribute("tabindex","0");
  g.setAttribute("role","button");
  g.dataset.visualRadius=radius;
  g.dataset.nodeId=node.id;
  g.dataset.fullLabel=node.label;
  g.dataset.shortLabel=node.short_label||node.label;
  g.dataset.important=(!node.tags?.includes("registry-seed")&&(node.kind==="field"||FAMILIES.some(f=>f.major.includes(node.label))))?"true":"false";
  g.addEventListener("pointerenter",()=>showNodeHover(node,p));
  g.addEventListener("pointerleave",()=>{document.querySelector("#nodeHover").hidden=true;});
  g.addEventListener("keydown",ev=>{if(ev.key==="Enter"||ev.key===" "){ev.preventDefault();onClick();}});

  const childCount=childrenFor(token).length;
  const meta=challenged?"FALSIFIED":historical?"SUPERSEDED":node.frontier?"FRONTIER":childCount?childCount+" NEXT":node.kind.toUpperCase();
  g.append(textNode(0,radius*.76,meta,"nodeMeta"));


  if(challenged)drawScar(g,radius);

  const title=mk("title");
  title.textContent=node.label+(challenged||historical?" — open for false-path story":"");
  g.append(title);
  g.addEventListener("click",ev=>{
    ev.stopPropagation();
    if(cameraGesture)return;
    if(challenged||historical)selectedFalseEdge=null;
    onClick();
  });
  parent.append(g);
}

function drawFrontierMarker(parent,p,label){
  const g=mk("g",{class:"frontierMarker reveal",transform:`translate(${p.x} ${p.y})`});
  g.append(mk("ellipse",{rx:94,ry:54,class:"fogBloom"}));
  g.append(mk("ellipse",{rx:74,ry:41,class:"fogBloomInner"}));

  for(let i=0;i<18;i++){
    const a=i*Math.PI*2/18;
    const r=48+(i%4)*9;
    const q=polar(0,0,r,a);
    g.append(mk("circle",{cx:q.x,cy:q.y,r:i%3===0?2.2:1.2,class:"fogParticle"}));
  }

  g.append(mk("circle",{r:49,class:"fogDisc"}));
  g.append(mk("circle",{r:37,class:"fogRingSmall"}));
  g.append(mk("path",{d:"M -70 8 Q -36 -18 0 3 Q 34 25 72 -7",class:"fogWisp"}));
  g.append(mk("path",{d:"M -62 26 Q -25 4 12 24 Q 42 38 68 19",class:"fogWisp secondary"}));
  g.append(textNode(0,-4,label,"frontierTitle"));
  g.append(textNode(0,14,label==="RECORDED OPEN QUESTION"?"Recorded open question":"Nemesis can map what comes next","frontierSub"));
  parent.append(g);
}

function labelLines(label,maxChars){
  const lines=[];
  let line="";
  for(const word of String(label).split(/\s+/)){
    if(line&&(line+" "+word).length>maxChars){lines.push(line);line=word;}
    else line=(line+" "+word).trim();
  }
  if(line)lines.push(line);
  return lines;
}

function updateLabelVisibility(){
  const matrix=graph.getScreenCTM();
  if(!matrix)return;
  const scale=Math.hypot(matrix.a,matrix.b);
  for(const g of scene.querySelectorAll(".knowledgeNode")){
    setInsideCircleLabel(g.querySelector(".fullNodeLabel"),g.dataset.fullLabel,Number(g.dataset.visualRadius)*.78,scale);
  }
  for(const label of scene.querySelectorAll(".insideFamilyLabel"))setInsideCircleLabel(label,label.dataset.label,74*.74,scale);
}

function navigationRelationLabel(relation){
  return ({research_context:"research connection",reviewed_taxonomy:"reviewed specialty",recorded_lineage:"recorded lineage",registry_membership:"registry entry",placement_pending:"placement pending",category:"category"})[relation]||String(relation).replaceAll("_"," ");
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
  if(expandAll){
    const count=navigation.counts.discoverable;
    mapCaption.innerHTML="<b>EXPAND ALL</b><span>"+count+" / "+navigation.counts.discoverable+" records discoverable · "+navigation.counts.placement_pending+" placement pending. Paths show navigation context, not scientific ancestry. Click a node for its full name and evidence.</span>";
    return;
  }
  if(expandFieldDeep&&activePath.length){
    const token=currentToken();
    const name=token.kind==="family"?familyById.get(token.id)?.short:nodeById.get(token.id)?.label;
    const count=massiveAtlas?.scopeKeys?massiveAtlas.scopeKeys.size-1:0;
    mapCaption.innerHTML="<b>"+esc(String(name||"FIELD").toUpperCase())+"</b><span>"+count+" descendants opened recursively from this point to the mapped edge.</span>";
    return;
  }
  if(!activePath.length){
    mapCaption.innerHTML="<b>THE ATLAS</b><span>Choose a great field, drill one branch at a time, or use Expand All for the complete mapped inventory.</span>";
    return;
  }
  const token=currentToken();
  const {all,page,pages}=pageChildren(token);
  const name=token.kind==="family"?familyById.get(token.id)?.short:nodeById.get(token.id)?.label;
  mapCaption.innerHTML="<b>"+esc(String(name||"BRANCH").toUpperCase())+"</b><span>"+
    (all.length
      ?all.length+" mapped next branch"+(all.length===1?"":"es")+" · click to continue"+(pages>1?" · sibling page "+(page+1)+" of "+pages:"")
      :"No deeper mapped child yet. This is a current coverage edge.")+
    "</span>";
}
function renderDetail(){
  const token=currentToken();

  if(!token){
    detail.innerHTML='<div class="detailHero"><div class="eyebrow">HUMAN KNOWLEDGE</div><h2>'+(expandAll?'Frontier overview':'Choose a great field')+'</h2><p>'+(expandAll?'The entire mapped circuit expands to its recorded edge. Every retained record stays in the atlas. Dashed circles mark placement pending; navigation paths alone do not establish scientific ancestry. Purple marks recorded open questions; red marks falsified or superseded records.':'Pick a field, or use Expand All to recursively open the current map at once.')+'</p><div class="detailActionRow"><button type="button" id="detailExpandAll">EXPAND ALL TO EDGE</button><button type="button" id="detailLens">'+(frontierLens?'LENS ON':'FRONTIER LENS')+'</button></div></div><section class="detailSection"><h3>HOW TO READ THE EDGE</h3><p><b>Solid</b> = recorded navigation context. <b>Dashed purple glow</b> = frontier. <b>Muted red / scarred</b> = falsified or historical. Click a false node for the story of why that path was tried.</p></section>';
    detail.querySelector("#detailExpandAll")?.addEventListener("click",doExpandAll);
    detail.querySelector("#detailLens")?.addEventListener("click",()=>{frontierLens=!frontierLens;syncExpandButtons();render();});
    return;
  }

  if(token.kind==="family"){
    const f=familyById.get(token.id);
    const nodes=familyNodes(f.id);
    const children=childrenFor(token);
    const falseNodes=nodes.filter(n=>FALSE_STATUSES.has(n._status||n.status));
    detail.innerHTML='<div class="detailHero"><div class="eyebrow">GREAT FIELD</div><h2>'+esc(f.short)+'</h2><p>'+esc(f.tagline)+'.</p><div class="numberGrid"><div class="numberBox"><b>'+nodes.length+'</b><span>mapped items</span></div><div class="numberBox"><b>'+nodes.filter(n=>n.frontier).length+'</b><span>frontiers</span></div><div class="numberBox"><b>'+children.length+'</b><span>next categories</span></div><div class="numberBox"><b>'+falseNodes.length+'</b><span>false paths</span></div></div><div class="detailActionRow"><button type="button" id="detailExpandField">EXPAND THIS FIELD</button><button type="button" id="detailHub">HUB</button></div></div><section class="detailSection"><h3>NEXT CATEGORIES</h3>'+children.map(({node})=>'<button class="nodeLink" data-child="'+esc(node.id)+'"><span>'+esc(node.label)+'</span><small>expand →</small></button>').join("")+'</section>'+(falseNodes.length?'<section class="detailSection"><h3>FALSE / SUPERSEDED IN THIS FIELD</h3>'+falseNodes.map(n=>'<button class="nodeLink" data-jump="'+esc(n.id)+'"><span>'+esc(n.label)+'</span><small>'+esc(n._status||n.status)+'</small></button>').join("")+'</section>':'');
    bindDetailChildren();
    detail.querySelector("#detailExpandField")?.addEventListener("click",doExpandField);
    detail.querySelector("#detailHub")?.addEventListener("click",goHub);
    detail.querySelectorAll("[data-jump]").forEach(btn=>btn.addEventListener("click",()=>{
      const n=nodeById.get(btn.dataset.jump);
      if(n)activateSearchResult(n);
    }));
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

  detail.innerHTML='<div class="detailHero"><div class="eyebrow">'+esc(f?.short||n.domain)+' · DEPTH '+Math.max(1,activePath.length-1)+'</div><h2>'+esc(n.label)+'</h2><span class="pill"><i style="background:'+statusColor+'"></i>'+esc(statusLabel)+'</span>'+'<span class="pill evidenceState">'+esc(evidenceIndex.states[n.id]||'registry seed')+'</span>'+(n.frontier?'<span class="pill">frontier</span>':'')+(navigation.placement_pending_ids.includes(n.id)?'<span class="pill">placement pending</span>':'')+'<p>'+esc(n.summary||"No summary attached yet.")+'</p><div class="numberGrid"><div class="numberBox"><b>'+children.length+'</b><span>next branches</span></div><div class="numberBox"><b>'+incoming.length+'</b><span>incoming</span></div><div class="numberBox"><b>'+sources.length+'</b><span>sources</span></div><div class="numberBox"><b>'+reviews.length+'</b><span>reviews</span></div></div><div class="detailActionRow"><button type="button" id="detailExpandBranch">EXPAND THIS BRANCH TO EDGE</button></div>'+falsePathStory(n)+'</div><section class="detailSection"><h3>NEXT MAPPED LAYER</h3>'+(children.length?children.map(({node,relation})=>'<button class="nodeLink" data-child="'+esc(node.id)+'"><span>'+esc(node.label)+'</span><small>'+esc(navigationRelationLabel(relation))+' →</small></button>').join(""):'<p class="coverageGap">'+(n.frontier?"This record is marked as an open question. It does not certify that all evidence has been mapped.":"No next navigation layer is recorded. This is a coverage gap, not evidence that human knowledge ends here.")+'</p>')+'</section><section class="detailSection"><h3>PROVENANCE</h3>'+(sources.length?sources.map(s=>'<p><a href="'+esc(s.url)+'" target="_blank" rel="noreferrer">'+esc(s.title||s.id)+'</a></p>').join(""):'<p>No source attached yet.</p>')+'</section>';

  bindDetailChildren();
  detail.querySelector("#detailExpandBranch")?.addEventListener("click",doExpandField);
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
  const ids=[];
  const seen=new Set();
  let id=targetId;
  while(!id.startsWith("family:")){
    if(seen.has(id))return null;
    seen.add(id);
    ids.push(id);
    const parent=navigationByChild.get(id);
    if(!parent)return null;
    id=parent.source;
  }
  return id==="family:"+domain?ids.reverse():null;
}

function activateSearchResult(node){
  expandAll=false;
  expandFieldDeep=false;
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

function syncExpandButtons(){
  if(hubBtn){
    hubBtn.classList.toggle("active",!activePath.length&&!expandAll);
    hubBtn.classList.toggle("on",!activePath.length&&!expandAll);
  }
  if(expandAllBtn){
    expandAllBtn.classList.toggle("on",expandAll);
    expandAllBtn.setAttribute("aria-pressed",expandAll?"true":"false");
  }
  if(expandFieldBtn){
    const can=activePath.length>0;
    expandFieldBtn.disabled=!can;
    expandFieldBtn.classList.toggle("on",expandFieldDeep);
    expandFieldBtn.setAttribute("aria-pressed",expandFieldDeep?"true":"false");
  }
  if(frontierLensBtn){
    frontierLensBtn.classList.toggle("on",frontierLens);
    frontierLensBtn.setAttribute("aria-pressed",frontierLens?"true":"false");
  }
  document.querySelector("#evidenceLensBtn")?.setAttribute("aria-pressed",String(evidenceLens));
  document.querySelector("#labelsBtn")?.setAttribute("aria-pressed",String(allLabels));
  document.body.classList.toggle("frontier-lens",frontierLens);
  massiveAtlas?.configure({frontierLens});
}
function observeLayout(){
  const apply=()=>{
    const w=mapShell?.clientWidth||window.innerWidth;
    const h=mapShell?.clientHeight||window.innerHeight;
    const next=w<820||h<560||window.innerWidth<900;
    if(next===layoutCompact)return;
    layoutCompact=next;
    document.body.classList.toggle("layout-compact",layoutCompact);
    if(compactList)compactList.hidden=!layoutCompact;
    renderCompactList();
  };
  apply();
  if(window.ResizeObserver&&mapShell){
    const ro=new ResizeObserver(()=>apply());
    ro.observe(mapShell);
  }else{
    window.addEventListener("resize",apply);
  }
}

function renderCompactList(){
  if(!compactList)return;
  if(!layoutCompact){
    compactList.hidden=true;
    compactList.innerHTML="";
    return;
  }
  compactList.hidden=false;
  const selected=activePath[0]?.id||null;
  let html=FAMILIES.map(f=>{
    const nodes=familyNodes(f.id);
    const front=nodes.filter(n=>n.frontier).length;
    const falseN=nodes.filter(n=>FALSE_STATUSES.has(n._status||n.status)).length;
    const majors=majorNodes(f);
    let next="";
    if(expandAll||(expandFieldDeep&&selected===f.id)||selected===f.id){
      const show=expandFieldDeep&&selected===f.id
        ? majors.flatMap(m=>{
            const kids=childrenFor(nodeToken(m,{angle:0,r:0})).slice(0,3);
            return [{node:m,relation:"category"},...kids];
          }).slice(0,12)
        : majors.map(node=>({node,relation:"category"}));
      if(show.length){
        next='<div class="compactNext">'+show.map(({node,relation})=>{
          const st=node._status||node.status;
          const tag=node.frontier?"frontier":(FALSE_STATUSES.has(st)?st:relation);
          return '<button type="button" class="compactNode'+(FALSE_STATUSES.has(st)?" false":"")+(node.frontier?" frontier":"")+'" data-node="'+esc(node.id)+'"><b>'+esc(node.label)+'</b><small>'+esc(String(tag).replaceAll("_"," "))+'</small></button>';
        }).join("")+'</div>';
      }
    }
    return '<div class="fieldBlock">'
      +'<button class="fieldCard'+(selected===f.id?' active':'')+'" data-family="'+esc(f.id)+'" style="--fc:'+esc(f.color)+'">'
      +'<span class="swatch" aria-hidden="true">'+esc(f.icon)+'</span>'
      +'<span class="meta"><b>'+esc(f.short)+'</b><span>'+esc(f.tagline)+(falseN?' · '+falseN+' falsified/historical':'')+'</span></span>'
      +'<span class="counts"><b>'+nodes.length+'</b>'+front+' frontier</span></button>'
      +next+'</div>';
  }).join("");
  compactList.innerHTML=html;
  compactList.querySelectorAll("[data-family]").forEach(btn=>btn.addEventListener("click",()=>{
    expandAll=false;
    expandFieldDeep=true;
    activePath=[familyToken(btn.dataset.family)];
    syncExpandButtons();
    render();
  }));
  compactList.querySelectorAll("[data-node]").forEach(btn=>btn.addEventListener("click",ev=>{
    ev.stopPropagation();
    const n=nodeById.get(btn.dataset.node);
    if(n)activateSearchResult(n);
  }));
}

function drawDeepFieldExpansion(parent,center){
  const layout=computeTreeLayout("field");
  drawDeepLayout(parent,layout);
}
function visibleNodeIds(){
  const ids=new Set();
  for(const t of activePath)if(t.kind==="node")ids.add(t.id);
  if(lastDeepLayout){
    for(const id of lastDeepLayout.positions.keys())ids.add(id);
  }else{
    const token=currentToken();
    if(token&&!expandAll&&!expandFieldDeep){
      for(const item of pageChildren(token).items)ids.add(item.node.id);
    }
  }
  const fam=activePath[0]?.id;
  if(fam){
    for(const n of familyNodes(fam)){
      if(FALSE_STATUSES.has(n._status||n.status))ids.add(n.id);
    }
  }
  return ids;
}
function nodePosOnMap(id,center){
  if(lastDeepLayout?.positions.has(id)){
    const p=lastDeepLayout.positions.get(id);
    return {x:p.x,y:p.y};
  }
  for(const t of activePath){
    if(t.kind==="node"&&t.id===id)return tokenPosition(t,center);
  }
  const token=currentToken();
  if(token&&!expandAll&&!expandFieldDeep){
    const layouts=layoutChildren(token,pageChildren(token).items);
    for(const layout of layouts){
      if(layout.node.id===id)return polar(center.x,center.y,layout.r,layout.angle);
    }
  }
  return null;
}
function drawFalsePathOverlays(parent,center){
  const visible=visibleNodeIds();
  const trails=[];

  for(const e of model.edges){
    if(!FALSE_EDGE_TYPES.has(e.type))continue;
    const s=nodeById.get(e.source),t=nodeById.get(e.target);
    if(!s||!t)continue;
    const relevant=visible.has(e.source)||visible.has(e.target);
    if(!relevant)continue;
    if(activePath[0]?.kind==="family"&&!expandAll){
      const fam=activePath[0].id;
      if(s.domain!==fam&&t.domain!==fam)continue;
    }
    trails.push(e);
  }

  const obstacles=lastObstacleCircles.length?lastObstacleCircles:[
    {x:center.x,y:center.y,r:104,key:"core"},
    ...activePath.filter(t=>t.kind==="node").map(t=>{
      const p=tokenPosition(t,center);
      return {x:p.x,y:p.y,r:t.visualRadius||58,key:"node:"+t.id};
    })
  ];

  const seen=new Set();
  trails.forEach((e,i)=>{
    const key=e.source+"|"+e.target+"|"+e.type;
    if(seen.has(key))return;
    seen.add(key);
    const a=nodePosOnMap(e.source,center),b=nodePosOnMap(e.target,center);
    if(!a||!b)return;

    const sa=lastDeepLayout?.positions.get(e.source)?.entry;
    const sb=lastDeepLayout?.positions.get(e.target)?.entry;
    const from={x:a.x,y:a.y,radius:sa?.radius||48,key:"node:"+e.source};
    const to={x:b.x,y:b.y,radius:sb?.radius||48,key:"node:"+e.target};
    const route=routeEdge(from,to,obstacles,i+1000);
    if(!route)return;

    const path=mk("path",{d:route.d,class:"falseTrail",stroke:"#ff4d67"});
    parent.append(path);
    const hit=mk("path",{d:route.d,class:"falseTrailHit"});
    hit.addEventListener("click",ev=>{
      ev.stopPropagation();
      selectedFalseEdge=e;
      const focus=nodeById.get(e.target)||nodeById.get(e.source);
      if(focus)activateSearchResult(focus);
    });
    parent.append(hit);
  });
}
function falsePathStory(node){
  if(!node)return"";
  const status=node._status||node.status;
  if(!FALSE_STATUSES.has(status)&&status!=="disputed"&&!selectedFalseEdge)return"";

  const why=node.summary||"No premise summary is attached yet.";
  const dependents=[];
  for(const e of outgoingById.get(node.id)||[]){
    if(["depends_on","enabled","derived_from","supports"].includes(e.type)){
      const d=nodeById.get(e.target);
      if(d)dependents.push({node:d,relation:e.type});
    }
  }
  // Also nodes that depend on this one (incoming depends_on where this is target)
  for(const e of incomingById.get(node.id)||[]){
    if(e.type==="depends_on"){
      const d=nodeById.get(e.source);
      if(d)dependents.push({node:d,relation:"built_on"});
    }
  }

  const supersededBy=[];
  for(const e of incomingById.get(node.id)||[]){
    if(e.type==="supersedes"||e.type==="contradicts"){
      const d=nodeById.get(e.source);
      if(d)supersededBy.push({node:d,relation:e.type});
    }
  }
  for(const e of outgoingById.get(node.id)||[]){
    if(e.type==="supersedes"||e.type==="contradicts"){
      const d=nodeById.get(e.target);
      if(d)supersededBy.push({node:d,relation:e.type+" →"});
    }
  }

  let html='<div class="storyCard"><h4>FALSE PATH STORY</h4>';
  html+='<p class="storyWhy"><b>Why this route was tried:</b> '+esc(why)+'</p>';
  if(dependents.length){
    html+='<p><b>What was built on it:</b></p><ul>'+dependents.slice(0,8).map(d=>'<li>'+esc(d.node.label)+' <small>('+esc(d.relation.replaceAll("_"," "))+')</small></li>').join("")+'</ul>';
  }else{
    html+='<p><b>What was built on it:</b> No dependent nodes are linked yet in this map.</p>';
  }
  if(supersededBy.length){
    html+='<p><b>What replaced or contradicted it:</b></p><ul>'+supersededBy.slice(0,8).map(d=>'<li>'+esc(d.node.label)+' <small>('+esc(d.relation.replaceAll("_"," "))+')</small></li>').join("")+'</ul>';
  }else if(status==="invalidated"||status==="historical"){
    html+='<p><b>What replaced or contradicted it:</b> Marked '+esc(status)+' in the atlas; no supersedes/contradicts edge is attached yet.</p>';
  }
  if(selectedFalseEdge){
    html+='<p><small>Trail: '+esc(selectedFalseEdge.type.replaceAll("_"," "))+' · '+esc(selectedFalseEdge.source)+' → '+esc(selectedFalseEdge.target)+'</small></p>';
  }
  html+='</div>';
  return html;
}

function goHub(){
  expandAll=false;
  expandFieldDeep=false;
  frontierLens=false;
  selectedFalseEdge=null;
  clearAtlasState();
  syncExpandButtons();
  render();
}

function doExpandAll(){
  expandAll=true;
  expandFieldDeep=false;
  selectedFalseEdge=null;
  activePath=[];
  syncExpandButtons();
  render();
}
function doExpandField(){
  if(!activePath.length){
    mapCaption.innerHTML="<b>EXPAND FIELD</b><span>Select a great field or branch first. Expand Field will recurse from that point all the way to its mapped edge.</span>";
    return;
  }
  expandAll=false;
  expandFieldDeep=true;
  selectedFalseEdge=null;
  syncExpandButtons();
  render();
}
function bind(){
  if(hubBtn)hubBtn.addEventListener("click",goHub);
  if(expandAllBtn)expandAllBtn.addEventListener("click",doExpandAll);
  if(expandFieldBtn)expandFieldBtn.addEventListener("click",doExpandField);
  if(frontierLensBtn)frontierLensBtn.addEventListener("click",()=>{
    frontierLens=!frontierLens;
    syncExpandButtons();
  });

  backBtn.addEventListener("click",()=>{
    if(expandAll){expandAll=false;syncExpandButtons();render();return;}
    if(expandFieldDeep){expandFieldDeep=false;syncExpandButtons();render();return;}
    stepBack();
  });
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
      if(frontierLens){frontierLens=false;syncExpandButtons();return;}
      if(expandAll){expandAll=false;syncExpandButtons();render();return;}
      if(activePath.length)stepBack();
    }
  });
}

boot().catch(err=>{
  console.error(err);
  detail.innerHTML='<div class="detailHero"><div class="eyebrow">ERROR</div><h2>Map failed to load</h2><p>'+esc(err.message)+'</p></div>';
});
