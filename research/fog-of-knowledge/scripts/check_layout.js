#!/usr/bin/env node
'use strict';
// Run production geometry/routing; validate its output with independent oracles.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{performance}=require('node:perf_hooks');
const root=path.resolve(__dirname,'..');
const graph=JSON.parse(fs.readFileSync(path.join(root,'data/knowledge.json'),'utf8'));
const navigation=JSON.parse(fs.readFileSync(path.join(root,'data/atlas-navigation.json'),'utf8'));
const families=JSON.parse(fs.readFileSync(path.join(root,'data/atlas-families.json'),'utf8'));
const records=graph.nodes.concat(navigation.registry_nodes),recordIds=new Set(records.map(n=>n.id));
assert.equal(recordIds.size,records.length,'canonical and registry IDs must be unique');
const STRUCTURAL=new Set(['category','reviewed_taxonomy','recorded_lineage','registry_membership','placement_pending']);
const CORE={key:'core',x:800,y:500,radius:95};
// Visible borders use +7 wire clearance. Circle spacing pads each disk by7,
// then requires another8 between disks (22 total); the visible core radius is95.
const EPS=1e-6,WIRE_PAD=7,CIRCLE_PAD=7,CIRCLE_GAP=8;

async function productionBuild(){
  let layout,complete,batches=0,lastDone=0;
  // Match test_circuit_worker.js: reload every production module and the worker
  // closure for each awaited build, without a second VM's proxy overhead.
  globalThis.OffscreenCanvas=undefined;
  globalThis.importScripts=(...files)=>{for(const file of files){const name=file.split('?')[0];assert(!name.includes('..'),'worker import must remain local');new Function('module',fs.readFileSync(path.join(root,name),'utf8'))(undefined)}};
  globalThis.postMessage=message=>{
    if(message.type==='error')throw Error('production worker: '+message.message);
    if(message.type==='layout'){assert(!layout,'worker must emit one initial layout');layout=structuredClone(message)}
    if(message.type==='routes'){
      assert(layout,'routes must follow initial geometry');assert(message.done>=lastDone,'route progress must not go backwards');lastDone=message.done;batches++;
      for(const route of message.routes){assert(layout.edges[route.index],'route index must exist');Object.assign(layout.edges[route.index],structuredClone(route))}
    }
    if(message.type==='complete'){assert(!complete,'worker must complete once');complete=structuredClone(message)}
  };
  new Function(fs.readFileSync(path.join(root,'circuit-worker.js'),'utf8'))();
  const started=performance.now();
  await globalThis.onmessage({data:{families:structuredClone(families),nodes:structuredClone(records),links:structuredClone(navigation.links),pending:structuredClone(navigation.placement_pending_ids),edges:structuredClone(graph.edges),connectionRecords:[],size:{width:0,height:0,dpr:1}}});
  assert(layout&&complete,'production worker must produce and finish geometry');
  assert.equal(complete.unrouted,0,'every discovery connector must receive a clear production route');
  assert.equal(complete.total,layout.edges.length,'completion must cover every discovery connector');
  return {items:layout.items,edges:layout.edges,gap:layout.gap,complete,batches,elapsedMs:performance.now()-started};
}

// Bucket every padded disk over its entire bounding box. Segment checks query
// their bounding boxes, then use an independent closest-point distance oracle.
function bucketIndex(disks,padding){
  const bins=new Map(),cell=240;
  for(let i=0;i<disks.length;i++){
    const d=disks[i],r=d.radius+padding;
    for(let x=Math.floor((d.x-r)/cell);x<=Math.floor((d.x+r)/cell);x++)for(let y=Math.floor((d.y-r)/cell);y<=Math.floor((d.y+r)/cell);y++){
      const key=x+','+y;if(!bins.has(key))bins.set(key,[]);bins.get(key).push(i);
    }
  }
  return box=>{
    const found=new Set();
    for(let x=Math.floor(box.left/cell);x<=Math.floor(box.right/cell);x++)for(let y=Math.floor(box.top/cell);y<=Math.floor(box.bottom/cell);y++)for(const i of bins.get(x+','+y)||[])found.add(i);
    return found;
  };
}
function distanceSquared(p,a,b){
  const vx=b.x-a.x,vy=b.y-a.y,length2=vx*vx+vy*vy;
  const t=length2?Math.max(0,Math.min(1,((p.x-a.x)*vx+(p.y-a.y)*vy)/length2)):0;
  return (p.x-a.x-t*vx)**2+(p.y-a.y-t*vy)**2;
}
function verify(build){
  const {items,edges}=build,byKey=new Map(items.map(e=>[e.key,e]));
  assert.equal(byKey.size,items.length,'every visual identity must occur exactly once');
  const actualIds=items.filter(e=>e.kind==='node').map(e=>e.id);
  assert.equal(actualIds.length,records.length,'all real records must survive');
  assert.deepEqual([...new Set(actualIds)].sort(),[...recordIds].sort(),'every real record must occur exactly once, with no synthetic replacement');
  assert.deepEqual(items.filter(e=>e.kind==='family').map(e=>e.id).sort(),families.map(f=>f.id).sort(),'all family roots must survive exactly once');
  const recordById=new Map(records.map(n=>[n.id,n])),outgoing=new Map(),incoming=new Map();
  for(const link of navigation.links){
    assert(STRUCTURAL.has(link.type),'unexpected discovery-link type '+link.type);
    assert(recordIds.has(link.target),'navigation target must be a real record');
    if(!outgoing.has(link.source))outgoing.set(link.source,[]);outgoing.get(link.source).push(link.target);
    if(!incoming.has(link.target))incoming.set(link.target,new Set());incoming.get(link.target).add(link.source);
  }
  // Compare independent graph reachability and actual rendered ancestry. Hubs
  // are display-only: collapsing them must recover a real navigation parent.
  for(const family of families){
    const seen=new Set(),queue=['family:'+family.id];
    for(let i=0;i<queue.length;i++)for(const id of outgoing.get(queue[i])||[]){if(!seen.has(id)){seen.add(id);queue.push(id)}}
    const expected=records.filter(n=>n.domain===family.id).map(n=>n.id).sort();
    assert.deepEqual([...seen].sort(),expected,family.id+' navigation must recursively cover all domain records');
    assert.deepEqual(items.filter(e=>e.kind==='node'&&e.familyId===family.id).map(e=>e.id).sort(),expected,family.id+' rendered recursive coverage');
  }
  let maxDepth=0,deepRecords=0;
  for(const item of items){
    assert(['node','cluster','family'].includes(item.kind),'unknown visual item kind');
    assert([item.x,item.y,item.radius,item.depth].every(Number.isFinite)&&item.radius>0&&Number.isInteger(item.depth)&&item.depth>=0,'invalid circle geometry '+item.key);
    maxDepth=Math.max(maxDepth,item.depth);
    if(item.kind==='family'){assert.equal(item.depth,0);assert(!item.parent);continue}
    const parent=byKey.get(item.parent);assert(parent,'missing rendered parent '+item.key);assert.equal(item.depth,parent.depth+1,'rendered depth must follow parent');
    if(item.kind==='node'){
      assert.equal(item.key,'node:'+item.id);assert.equal(item.familyId,recordById.get(item.id).domain,'record must remain in its own family');
      let ancestor=parent,steps=0;
      while(ancestor.kind==='cluster'){assert(++steps<=items.length,'cluster ancestry cycle');ancestor=byKey.get(ancestor.parent);assert(ancestor,'cluster ancestor missing')}
      const source=ancestor.kind==='family'?ancestor.key:ancestor.id;
      assert(incoming.get(item.id)?.has(source),'rendered hubs must preserve actual navigation ancestry: '+source+' -> '+item.id);
      if(ancestor.kind==='node')deepRecords++;
    }
  }
  assert(maxDepth>=2&&deepRecords>0,'actual graph recursion must extend beyond depth one');
  const all=[...items,CORE],disks=all.map(d=>({...d,radius:d.radius+CIRCLE_PAD}));
  const overlapCandidates=bucketIndex(disks,CIRCLE_GAP);
  for(let i=0;i<disks.length;i++){
    const a=disks[i],r=a.radius+CIRCLE_GAP;
    for(const j of overlapCandidates({left:a.x-r,top:a.y-r,right:a.x+r,bottom:a.y+r})){
      if(j<=i)continue;const b=disks[j],required=a.radius+b.radius+CIRCLE_GAP;
      assert(Math.hypot(a.x-b.x,a.y-b.y)+EPS>=required,'padded circle overlap: '+a.key+' / '+b.key);
    }
  }
  const endpointByKey=new Map(all.map(d=>[d.key,d])),wireDisks=all.map(d=>({...d}));
  const wireCandidates=bucketIndex(wireDisks,WIRE_PAD),seenEdges=new Set(),edgeParents=new Map();let segments=0;
  for(const edge of edges){
    const key=JSON.stringify([edge.from,edge.to]);assert(!seenEdges.has(key),'duplicate connector '+key);seenEdges.add(key);
    const from=endpointByKey.get(edge.from),to=endpointByKey.get(edge.to);assert(from&&to,'connector endpoints must exist');
    assert.equal(edge.from,to.kind==='family'?'core':to.parent,'every connector must match actual rendered parent');
    edgeParents.set(edge.to,(edgeParents.get(edge.to)||0)+1);
    assert(Array.isArray(edge.points)&&edge.points.length>=2,'connector must contain a real route');
    for(const p of edge.points)assert(Number.isFinite(p.x)&&Number.isFinite(p.y),'nonfinite route point');
    const start=edge.points[0],end=edge.points.at(-1);
    assert(Math.abs(Math.hypot(start.x-from.x,start.y-from.y)-(from.radius+4))<EPS,'source attachment must be on the padded source boundary: '+key);
    assert(Math.abs(Math.hypot(end.x-to.x,end.y-to.y)-(to.radius+4))<EPS,'target attachment must be on the padded target boundary: '+key);
    for(let k=1;k<edge.points.length;k++){
      segments++;const a=edge.points[k-1],b=edge.points[k];
      for(const i of wireCandidates({left:Math.min(a.x,b.x),top:Math.min(a.y,b.y),right:Math.max(a.x,b.x),bottom:Math.max(a.y,b.y)})){
        const disk=wireDisks[i];if(disk.key===edge.from||disk.key===edge.to)continue;
        const required=disk.radius+WIRE_PAD;
        assert(distanceSquared(disk,a,b)+EPS>=required*required,'connector clearance failed: '+key+' segment '+k+' / '+disk.key+' (required '+required+')');
      }
    }
  }
  assert.equal(edges.length,items.length,'one connector is required for every item, including core-to-family links');
  for(const item of items)assert.equal(edgeParents.get(item.key),1,'every visual item must have exactly one incoming connector');
  return {maxDepth,deepRecords,segments,clusters:items.filter(e=>e.kind==='cluster').length};
}
function signature(build){return JSON.stringify({items:build.items.map(e=>[e.key,e.id,e.kind,e.familyId,e.relation,e.parent,e.depth,e.x,e.y,e.radius,e.angle,e.r]).sort((a,b)=>a[0].localeCompare(b[0])),edges:build.edges.map(e=>[e.from,e.to,e.familyId,e.relation,e.points.map(p=>[p.x,p.y])]).sort((a,b)=>JSON.stringify(a.slice(0,2)).localeCompare(JSON.stringify(b.slice(0,2))))})}
async function main(){
  const a=await productionBuild(),checked=verify(a),b=await productionBuild();verify(b);
  const hashOf=build=>crypto.createHash('sha256').update(signature(build)).digest('hex');
  const hash=hashOf(a);assert.equal(hash,hashOf(b),'production geometry AND routing must be deterministic across fresh awaited builds');
  console.log(JSON.stringify({ok:true,nodes:a.items.length,records:records.length,edges:a.edges.length,maxDepth:checked.maxDepth,deepRecords:checked.deepRecords,clusters:checked.clusters,segments:checked.segments,layout:'production-circuit-worker',deterministicHash:hash.slice(0,16),circleOverlaps:0,unroutableEdges:0,connectorCircleIntersections:0,workerBuildMs:[a.elapsedMs,b.elapsedMs].map(Math.round),routeBatches:[a.batches,b.batches],wireClearance:WIRE_PAD,paddedCircleSeparation:CIRCLE_PAD*2+CIRCLE_GAP},null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1});
