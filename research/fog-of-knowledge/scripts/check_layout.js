#!/usr/bin/env node
"use strict";

const fs=require("fs");
const crypto=require("crypto");
const branches=require("../branch-layout.js");

const graph=JSON.parse(fs.readFileSync("data/knowledge.json","utf8"));

const navigation=JSON.parse(fs.readFileSync("data/atlas-navigation.json","utf8"));
graph.nodes.push(...navigation.registry_nodes);
const FAMILIES=JSON.parse(fs.readFileSync("data/atlas-families.json","utf8")).map(f=>[f.id,f.major]);
const STRUCTURAL=new Set(["category","reviewed_taxonomy","recorded_lineage","registry_membership","placement_pending"]);
const EXCLUDED=new Set();

const CLEAR=22;
const TAU=Math.PI*2;

const nodes=new Map(graph.nodes.map(n=>[n.id,n]));
const byDomain=new Map();
for(const n of graph.nodes){
  if(!byDomain.has(n.domain))byDomain.set(n.domain,[]);
  byDomain.get(n.domain).push(n);
}
const out=new Map(),inc=new Map();
for(const e of navigation.links){
  if(!out.has(e.source))out.set(e.source,[]);
  if(!inc.has(e.target))inc.set(e.target,[]);
  out.get(e.source).push(e);
  inc.get(e.target).push(e);
}

function majors(domain,labels){
  const all=byDomain.get(domain)||[];
  return labels.map(label=>all.find(n=>n.label.toLowerCase()===label.toLowerCase())).filter(Boolean);
}

function children(nodeId,domain,assigned,ancestors,reserved){
  const cand=[];
  for(const e of out.get(nodeId)||[]){
    if(EXCLUDED.has(e.type)||!STRUCTURAL.has(e.type))continue;
    const n=nodes.get(e.target);
    if(n&&n.domain===domain&&!assigned.has(n.id)&&!ancestors.has(n.id)&&!reserved.has(n.id))
      cand.push({edge:e,node:n,dir:0});
  }

  const uniq=new Map();
  for(const x of cand){
    if(!uniq.has(x.node.id))uniq.set(x.node.id,x);
  }
  return [...uniq.values()];
}

function buildNode(n,domain,assigned,ancestors,relation,reserved){
  if(!n||assigned.has(n.id)||ancestors.has(n.id))return null;
  assigned.add(n.id);
  const next=new Set(ancestors); next.add(n.id);
  const t={key:"node:"+n.id,kind:"node",id:n.id,node:n,domain,relation,children:[],weight:1,angle:0};
  for(const x of children(n.id,domain,assigned,next,reserved)){
    const c=buildNode(x.node,domain,assigned,next,x.edge.type,reserved);
    if(c)t.children.push(c);
  }
  t.weight=t.children.length?t.children.reduce((s,x)=>s+x.weight,0):1;
  return t;
}

function buildFamily(domain,labels){
  const roots=(out.get("family:"+domain)||[]).map(e=>nodes.get(e.target));
  const reserved=new Set(roots.map(n=>n.id));
  const assigned=new Set();
  const t={key:"family:"+domain,kind:"family",id:domain,domain,children:[],weight:1,angle:0};
  for(const n of roots){
    reserved.delete(n.id);
    const relation=(inc.get(n.id)||[])[0]?.type||"category";
    const c=buildNode(n,domain,assigned,new Set(),relation,reserved);
    reserved.add(n.id);
    if(c)t.children.push(c);
  }
  t.weight=t.children.length?t.children.reduce((s,x)=>s+x.weight,0):1;
  return {tree:t,assigned};
}

function assignAngles(t,start,end){
  t.angle=(start+end)/2;
  if(!t.children.length)return;
  const total=t.children.reduce((s,x)=>s+x.weight,0)||1;
  let cur=start;
  for(const c of t.children){
    const w=(end-start)*(c.weight/total);
    assignAngles(c,cur,cur+w);
    cur+=w;
  }
}
function flatten(t,depth=0,parent=null,out=[]){
  out.push({tree:t,depth,parent});
  for(const c of t.children)flatten(c,depth+1,t,out);
  return out;
}
function vr(e){return e.tree.kind==="family"?74:(e.depth<=1?34:30)}
function footprint(e){return vr(e)+12}
function ad(a,b){let d=Math.abs(a-b)%TAU;return d>Math.PI?TAU-d:d}
function reqRadius(entries,wrap){
  if(entries.length<2)return 0;
  const s=[...entries].sort((a,b)=>a.tree.angle-b.tree.angle);
  const pairs=[];
  for(let i=1;i<s.length;i++)pairs.push([s[i-1],s[i]]);
  if(wrap&&s.length>2)pairs.push([s[s.length-1],s[0]]);
  let req=0;
  for(const [a,b] of pairs){
    const d=ad(a.tree.angle,b.tree.angle);
    if(d<1e-6)return 1e9;
    const min=footprint(a)+footprint(b)+CLEAR;
    req=Math.max(req,min/(2*Math.sin(d/2)));
  }
  return req;
}
function gapFor(items){
  const by=new Map();
  for(const e of items){if(!by.has(e.depth))by.set(e.depth,[]);by.get(e.depth).push(e)}
  let gap=170;
  for(const [d,es] of by){
    if(!d)continue;
    const need=reqRadius(es,true);
    if(Number.isFinite(need)&&need<1e8)gap=Math.max(gap,(need-330)/d);
  }
  return Math.ceil(gap/10)*10;
}
function polar(r,a){return{x:800+Math.cos(a)*r,y:500+Math.sin(a)*r}}
function overlap(a,b,pad=8){const dx=a.x-b.x,dy=a.y-b.y,m=a.r+b.r+pad;return dx*dx+dy*dy<m*m}

function expectedReachable(domain,rootNodes){
  const seen=new Set(rootNodes.map(n=>n.id));
  const q=[...seen];
  while(q.length){
    const id=q.shift();
    const es=[...(out.get(id)||[]),...(inc.get(id)||[])];
    for(const e of es){
      if(EXCLUDED.has(e.type)||!STRUCTURAL.has(e.type))continue;
      const other=e.source===id?nodes.get(e.target):nodes.get(e.source);
      if(!other||other.domain!==domain||seen.has(other.id))continue;
      seen.add(other.id);q.push(other.id);
    }
  }
  return seen;
}

function familySectorBounds(index){
  const sector=TAU/FAMILIES.length,mid=-Math.PI/2+index*sector,margin=.14;
  return {start:mid-sector/2+margin,end:mid+sector/2-margin,mid};
}
function pack(entries,start,end,startRow,gap){
  const sorted=[...entries].sort((a,b)=>a.tree.angle-b.tree.angle||a.tree.key.localeCompare(b.tree.key));
  const n=sorted.length;
  if(!n)return startRow;
  const sweep=Math.max(.08,end-start);
  const maxR=Math.max(...sorted.map(vr));
  const minCenter=maxR*2+CLEAR;

  let rows=1;
  for(;rows<=n;rows++){
    let ok=true;
    for(let row=0;row<rows;row++){
      const count=Math.ceil((n-row)/rows);
      if(count<=1)continue;
      const r=330+(startRow+row)*gap;
      const slotGap=rows*sweep/n;
      const chord=2*r*Math.sin(slotGap/2);
      if(chord<minCenter){ok=false;break}
    }
    if(ok)break;
  }
  rows=Math.min(rows,n);

  sorted.forEach((e,i)=>{
    const row=i%rows;
    e.rowIndex=startRow+row;
    e.r=330+e.rowIndex*gap;
    e.tree.angle=start+(i+.5)*(sweep/n);
  });
  return startRow+rows;
}

function build(){
  const items=[];
  const familyTrees=[];
  let gap=150;

  FAMILIES.forEach(([domain,labels],i)=>{
    const built=buildFamily(domain,labels);
    const sector=familySectorBounds(i);
    assignAngles(built.tree,sector.start,sector.end);
    const flat=flatten(built.tree);
    flat[0].rowIndex=0;flat[0].r=330;flat[0].tree.angle=sector.mid;
    let row=1;
    const maxDepth=Math.max(...flat.map(x=>x.depth));
    for(let depth=1;depth<=maxDepth;depth++){
      const level=flat.filter(x=>x.depth===depth);
      if(level.length)row=pack(level,sector.start,sector.end,row,gap);
    }
    items.push(...flat);
    familyTrees.push({domain,labels,tree:built.tree,flat});
  });

  branches.layout(FAMILIES,familyTrees.map(f=>f.flat));

  function place(){
    for(const e of items){
      e.radius=vr(e);e.fp=footprint(e);
    }
  }
  place();

  function overlapCount(){
    const cs=items.map(e=>({x:e.x,y:e.y,r:e.radius+7,key:e.tree.key})).concat([{x:800,y:500,r:104,key:"core"}]);
    let n=0;
    for(let i=0;i<cs.length;i++)for(let j=i+1;j<cs.length;j++)if(overlap(cs[i],cs[j]))n++;
    return n;
  }
  if(overlapCount())throw new Error("circle-overlap invariant failed");

  const circles=items.map(e=>({x:e.x,y:e.y,r:e.radius+7,key:e.tree.key})).concat([{x:800,y:500,r:104,key:"core"}]);
  const map=new Map(items.map(e=>[e.tree,e]));

  function pointSeg(p,a,b){
    const vx=b.x-a.x,vy=b.y-a.y,wx=p.x-a.x,wy=p.y-a.y;
    const len=vx*vx+vy*vy;let t=len?((wx*vx+wy*vy)/len):0;t=Math.max(0,Math.min(1,t));
    const x=a.x+t*vx,y=a.y+t*vy,dx=p.x-x,dy=p.y-y;return dx*dx+dy*dy;
  }
  function clear(a,b,ignore){
    for(const o of circles){if(ignore.has(o.key))continue;const rr=o.r+7;if(pointSeg({x:o.x,y:o.y},a,b)<rr*rr)return false}return true
  }
  function route(from,to,seed){
    const dx=to.x-from.x,dy=to.y-from.y,len=Math.hypot(dx,dy)||1,ux=dx/len,uy=dy/len;
    const start={x:from.x+ux*(from.radius+4),y:from.y+uy*(from.radius+4)};
    const end={x:to.x-ux*(to.radius+4),y:to.y-uy*(to.radius+4)};
    const ignore=new Set([from.tree.key,to.tree.key]);
    if(clear(start,end,ignore))return true;

    const px=-dy/len,py=dx/len;
    const signs=seed%2?[1,-1]:[-1,1];
    for(const off0 of [70,110,160,220,300,420,560,760]){
      for(const sign of signs){
        const off=off0*sign,p1={x:start.x+px*off,y:start.y+py*off},p2={x:end.x+px*off,y:end.y+py*off};
        if(clear(start,p1,ignore)&&clear(p1,p2,ignore)&&clear(p2,end,ignore))return true;
      }
    }

    // Same deterministic obstacle-grid fallback used by the browser renderer.
    const obs=circles.filter(o=>!ignore.has(o.key));
    let minX=Math.min(start.x,end.x),maxX=Math.max(start.x,end.x),minY=Math.min(start.y,end.y),maxY=Math.max(start.y,end.y);

    const margin=1200;minX-=margin;minY-=margin;maxX+=margin;maxY+=margin;
    const spanX=maxX-minX,spanY=maxY-minY;
    const cell=Math.max(4,Math.ceil(Math.sqrt(spanX*spanY/800000)));
    const cols=Math.max(3,Math.ceil(spanX/cell)+1),rows=Math.max(3,Math.ceil(spanY/cell)+1);
    if(cols*rows>1000000)return false;

    const lead=0;
    const rs={x:start.x+ux*lead,y:start.y+uy*lead},re={x:end.x-ux*lead,y:end.y-uy*lead};
    if(!clear(start,rs,ignore)||!clear(re,end,ignore))return false;

    const idx=(x,y)=>y*cols+x;
    const point=(x,y)=>({x:minX+x*cell,y:minY+y*cell});
    const cellOf=p=>({x:Math.max(0,Math.min(cols-1,Math.round((p.x-minX)/cell))),y:Math.max(0,Math.min(rows-1,Math.round((p.y-minY)/cell)))});
    const blocked=new Uint8Array(cols*rows);
    for(const o of obs){
      const rr=o.r+7+cell*.78;
      const x0=Math.max(0,Math.floor((o.x-rr-minX)/cell)),x1=Math.min(cols-1,Math.ceil((o.x+rr-minX)/cell));
      const y0=Math.max(0,Math.floor((o.y-rr-minY)/cell)),y1=Math.min(rows-1,Math.ceil((o.y+rr-minY)/cell));
      for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
        const p=point(x,y),ddx=p.x-o.x,ddy=p.y-o.y;
        if(ddx*ddx+ddy*ddy<rr*rr)blocked[idx(x,y)]=1;
      }
    }
    function reachableCell(p){
      const base=cellOf(p),choices=[];
      for(let oy=-6;oy<=6;oy++)for(let ox=-6;ox<=6;ox++){
        const x=base.x+ox,y=base.y+oy;
        if(x<0||y<0||x>=cols||y>=rows||blocked[idx(x,y)])continue;
        const pt=point(x,y);
        if(clear(p,pt,ignore))choices.push({x,y,d:(pt.x-p.x)**2+(pt.y-p.y)**2});
      }
      choices.sort((a,b)=>a.d-b.d||a.y-b.y||a.x-b.x);
      return choices[0];
    }
    const s=reachableCell(rs),g=reachableCell(re);
    if(!s||!g)return false;
    const si=idx(s.x,s.y),gi=idx(g.x,g.y);

    const prev=new Int32Array(cols*rows);prev.fill(-1);
    const q=new Int32Array(cols*rows);let h=0,t=0;q[t++]=si;prev[si]=si;
    const dirs=[[1,0],[-1,0],[0,1],[0,-1]];
    while(h<t&&prev[gi]===-1){
      const cur=q[h++],cx=cur%cols,cy=Math.floor(cur/cols);
      for(const [sx,sy] of dirs){
        const nx=cx+sx,ny=cy+sy;if(nx<0||ny<0||nx>=cols||ny>=rows)continue;
        const ni=idx(nx,ny);if(blocked[ni]||prev[ni]!==-1)continue;
        prev[ni]=cur;q[t++]=ni;if(ni===gi)break;
      }
    }
    if(prev[gi]===-1)return false;

    const pts=[];let cur=gi;
    while(cur!==si){pts.push(point(cur%cols,Math.floor(cur/cols)));cur=prev[cur]}
    pts.push(point(s.x,s.y));pts.reverse();
    const path=[start,rs,...pts,re,end];
    for(let i=1;i<path.length;i++)if(!clear(path[i-1],path[i],ignore))return false;
    return true;
  }

  let edgeCount=0;
  for(const e of items){
    if(!e.parent)continue;
    const p=map.get(e.parent); if(!p)continue;
    edgeCount++;
    if(!route({x:p.x,y:p.y,radius:p.radius,tree:p.tree},{x:e.x,y:e.y,radius:e.radius,tree:e.tree},edgeCount))
      throw new Error("edge-routing invariant failed: "+p.tree.key+" -> "+e.tree.key);
  }

  for(const ft of familyTrees){
    const expected=new Set((byDomain.get(ft.domain)||[]).map(n=>n.id));
    const actual=new Set(ft.flat.filter(e=>e.tree.kind==="node").map(e=>e.tree.id));
    const missing=[...expected].filter(id=>!actual.has(id));
    if(missing.length)throw new Error(ft.domain+" recursive coverage missing "+missing.slice(0,8).join(", "));
  }

  const signature=items.map(e=>[e.tree.key,e.depth,e.x,e.y]).sort((a,b)=>a[0].localeCompare(b[0]));
  return {gap,items,edgeCount,signature,maxDepth:Math.max(...items.map(e=>e.depth))};
}

const a=build(),b=build();
const ha=crypto.createHash("sha256").update(JSON.stringify(a.signature)).digest("hex");
const hb=crypto.createHash("sha256").update(JSON.stringify(b.signature)).digest("hex");
if(ha!==hb)throw new Error("determinism invariant failed");
if(a.maxDepth<2)throw new Error("recursive layout did not reach beyond first ring");

console.log(JSON.stringify({
  ok:true,
  nodes:a.items.length,
  edges:a.edgeCount,
  maxDepth:a.maxDepth,
  layout:"radial-circuit/1",
  deterministicHash:ha.slice(0,16),
  circleOverlaps:0,
  unroutableEdges:0
},null,2));
