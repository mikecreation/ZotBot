// Exercise the worker's real tree construction and packing, before routing.
// Routing has its own tests; stopping here keeps the 50k/deep packing regressions
// independent of obstacle-search cost and browser/OffscreenCanvas support.
const fs=require('fs'),path=require('path'),assert=require('assert'),crypto=require('crypto');
const root=path.resolve(__dirname,'..'),stop='packing-test-complete';
function pack(data){
  let packed,packingMs;
  globalThis.OffscreenCanvas=undefined;
  globalThis.postMessage=message=>{if(message.type==='error'&&message.message!==stop)throw Error(message.message)};
  globalThis.importScripts=(...paths)=>paths.forEach(file=>{
    new Function('module',fs.readFileSync(path.join(root,file.split('?')[0]),'utf8'))(undefined);
    if(file.startsWith('branch-layout')){
      const layout=globalThis.FogBranches.layout;
      globalThis.FogBranches.layout=(...args)=>{
        const started=performance.now();packed=layout(...args);packingMs=performance.now()-started;
        throw Error(stop);
      };
    }
  });
  new Function(fs.readFileSync(path.join(root,'circuit-worker.js'),'utf8'))();
  globalThis.onmessage({data:{...data,size:{width:0,height:0,dpr:1},pending:[],edges:[]}});
  assert(packed,'the complete worker projection must reach packing');
  const entries=packed.entries,byTree=new Map(entries.map(e=>[e.tree,e]));
  assert.equal(new Set(entries.map(e=>e.tree.key)).size,entries.length,'every visual identity is unique');
  assert.equal(entries.filter(e=>e.tree.kind==='node').length,data.nodes.length,'every record survives');
  const buckets=new Map(),cell=180;
  for(const e of entries){
    assert([e.x,e.y,e.r,e.tree.angle].every(Number.isFinite),'finite coordinates at every depth');
    if(e.parent)assert(e.rowIndex>byTree.get(e.parent).rowIndex,'descendants progress radially outward');
    const x=Math.floor(e.x/cell),y=Math.floor(e.y/cell);
    for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(const other of buckets.get((x+dx)+':'+(y+dy))||[]){
      assert(Math.hypot(e.x-other.x,e.y-other.y)>=e.radius+other.radius+22-1e-7,'padded circles never overlap');
    }
    const key=x+':'+y;if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(e);
  }
  const lengths=entries.filter(e=>e.parent).map(e=>({parent:e.parent.kind,length:Math.hypot(e.x-byTree.get(e.parent).x,e.y-byTree.get(e.parent).y)}));
  const sorted=lengths.map(e=>e.length).sort((a,b)=>a-b);
  const geometry=crypto.createHash('sha256').update(JSON.stringify(entries.map(e=>[e.tree.key,e.rowIndex,e.x,e.y]))).digest('hex').slice(0,16);
  return {packed,geometry,metrics:{entries:entries.length,packingMs,maxRadius:entries.reduce((m,e)=>Math.max(m,e.r),0),
    long2000:lengths.filter(e=>e.length>2000).length,longNonFamily:lengths.filter(e=>e.parent!=='family'&&e.length>2000).length,
    mean:lengths.reduce((s,e)=>s+e.length,0)/lengths.length,p95:sorted[Math.floor(sorted.length*.95)]}};
}
const read=file=>JSON.parse(fs.readFileSync(path.join(root,'data',file),'utf8'));
const graph=read('knowledge.json'),nav=read('atlas-navigation.json'),families=read('atlas-families.json');
const data={families,nodes:graph.nodes.concat(nav.registry_nodes),links:nav.links};
const actual=pack(data),again=pack(data);
assert.equal(actual.geometry,again.geometry,'identical inputs reproduce identical geometry');
assert.equal(actual.metrics.longNonFamily,0,'dense actual branches must keep record/hub descendants local');
const count=50000,nodes=Array.from({length:count},(_,i)=>({id:'packing.star.'+i,domain:families[i%families.length].id}));
const star=pack({families,nodes,links:nodes.map(n=>({source:'family:'+n.domain,target:n.id,type:'placement_pending'}))});
assert.equal(star.metrics.longNonFamily,0,'inventory-hub children remain beside their hub in the giant star');
const deepNodes=Array.from({length:12000},(_,i)=>({id:'packing.deep.'+i,domain:'physical'}));
const deep=pack({families,nodes:deepNodes,links:deepNodes.map((n,i)=>({source:i?deepNodes[i-1].id:'family:physical',target:n.id,type:'recorded_lineage'}))});
assert.equal(deep.packed.entries.reduce((m,e)=>Math.max(m,e.depth),0),12000,'no recursion/depth cap');
assert.equal(deep.metrics.longNonFamily,0,'a deep chain stays locally connected');
console.log(JSON.stringify({ok:true,current:data.nodes.length,geometry:actual.geometry,actual:actual.metrics,star:{records:count,...star.metrics},deep:{records:deepNodes.length,...deep.metrics}}));
