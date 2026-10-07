// Exercise the actual worker without a browser, including giant/deep projections.
const fs=require('fs'),assert=require('assert'),crypto=require('crypto');
const root=require('path').resolve(__dirname,'..');
function run(data){
  let layout,complete;
  globalThis.postMessage=message=>{if(message.type==='error')throw Error(message.message);if(message.type==='layout')layout=message;if(message.type==='complete')complete=message};
  globalThis.OffscreenCanvas=undefined;
  globalThis.importScripts=(...paths)=>paths.forEach(path=>new Function('module',fs.readFileSync(root+'/'+path.split('?')[0],'utf8'))(undefined));
  new Function(fs.readFileSync(root+'/circuit-worker.js','utf8'))();
  globalThis.onmessage({data:{...data,size:{width:0,height:0,dpr:1},pending:[],edges:[]}});
  const context={FogCircuitSpatial:globalThis.FogCircuitSpatial};
  assert(layout&&complete,'worker must finish a complete projection');assert.equal(new Set(layout.items.map(e=>e.key)).size,layout.items.length,'no duplicate visual identities');
  assert.equal(layout.items.filter(e=>e.kind==='node').length,data.nodes.length,'every record must survive layout');
  return {layout,complete,context};
}
const graph=JSON.parse(fs.readFileSync(root+'/data/knowledge.json','utf8')),nav=JSON.parse(fs.readFileSync(root+'/data/atlas-navigation.json','utf8')),families=JSON.parse(fs.readFileSync(root+'/data/atlas-families.json','utf8'));
const actual=run({families,nodes:graph.nodes.concat(nav.registry_nodes),links:nav.links});
const signature=actual.layout.items.map(e=>[e.key,e.depth,e.x,e.y]).sort((a,b)=>a[0].localeCompare(b[0]));
const actualGeometry=crypto.createHash('sha256').update(JSON.stringify(signature)).digest('hex').slice(0,16);
const count=50000,nodes=Array.from({length:count},(_,i)=>({id:'perf.'+i,domain:families[i%families.length].id}));
const giant=run({families,nodes,links:nodes.map(n=>({source:'family:'+n.domain,target:n.id,type:'placement_pending'}))});
assert.equal(giant.complete.routing,'circuit-bus','large graphs must avoid per-edge grid flood-fills');
const spatial=giant.context.FogCircuitSpatial,scope=spatial.scope(giant.layout.items,giant.layout.edges,'family:physical');assert.equal(scope.scopeKeys.size,5001,'complete family projection preserves every descendant');
const deepNodes=Array.from({length:12000},(_,i)=>({id:'depth.'+i,domain:'physical'}));
const deep=run({families,nodes:deepNodes,links:deepNodes.map((n,i)=>({source:i?deepNodes[i-1].id:'family:physical',target:n.id,type:'recorded_lineage'}))});
assert.equal(Math.max(...deep.layout.items.map(e=>e.depth)),12000,'deep frontiers must not hit a stack or depth cap');
console.log(JSON.stringify({ok:true,current:graph.nodes.length+nav.registry_nodes.length,giant:count,deepChain:12000,geometry:actualGeometry}));
