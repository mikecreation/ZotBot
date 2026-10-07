const assert=require('assert'),fs=require('fs'),path=require('path');
const connections=require('../node-connections.js');
// Synthetic links exercise cross-field applications without adding research claims.
const data={families:[{id:'materials'},{id:'fusion'},{id:'medicine'}],nodes:[{id:'tape',domain:'materials',tags:['MRI']},{id:'magnet',domain:'fusion'},{id:'imaging',domain:'medicine'},{id:'unlinked',domain:'materials'}],edges:[{source:'tape',target:'magnet',type:'enabled'},{source:'imaging',target:'tape',type:'depends_on'},{source:'tape',target:'magnet',type:'tests'}],navigation:{links:[{source:'family:materials',target:'tape',type:'placement_pending'}],taxonomy:[{parent:'family:fusion',child:'tape'}],identities:[{left:'tape',right:'magnet',type:'related_concept'}]}};
const before=JSON.stringify(data),records=connections.records(data),index=connections.index(records),peers=connections.peers(index,'tape');
assert.equal(records.length,6);assert.equal(peers.size,4);assert.equal(peers.get('node:magnet').length,3,'parallel scientific and concept links are retained');
assert(!peers.has('node:unlinked'),'shared domain and tags must not invent relevance');
assert.equal(peers.get('node:imaging')[0].from,'node:imaging','incoming direction is preserved');
const positions=new Map(['node:tape',...peers.keys()].map((key,i)=>[key,{key,x:i*100,y:i*100,radius:30}]));
const scope=connections.scope(positions,index,'tape');assert.equal(scope.scopeKeys.size,5);assert.equal(scope.connectionLinks.length,6);assert.equal(scope.scopeBounds.right,430);
assert.equal(JSON.stringify(data),before,'the inspector is a projection, never a canonical mutation');
const prefixed=connections.records({nodes:[{id:'node:raw'},{id:'plain'}],families:[],edges:[{source:'node:raw',target:'plain',type:'related'}],navigation:{links:[]}});
assert.equal(prefixed[0].from,'node:node:raw','canonical IDs must not be confused with renderer keys');
const count=50000,giant=Array.from({length:count},(_,i)=>({from:'node:hub',to:'node:'+i,type:'related',kind:'scientific'}));
assert.equal(connections.peers(connections.index(giant),'hub').size,count,'all connection points survive a giant degree');
const root=path.resolve(__dirname,'..'),graph=JSON.parse(fs.readFileSync(root+'/data/knowledge.json')),navigation=JSON.parse(fs.readFileSync(root+'/data/atlas-navigation.json')),families=JSON.parse(fs.readFileSync(root+'/data/atlas-families.json'));
const actual=connections.records({nodes:graph.nodes.concat(navigation.registry_nodes),edges:graph.edges,navigation,families});
assert.equal(actual.filter(e=>e.kind==='scientific').length,graph.edges.length,'every canonical scientific relationship is indexed');
console.log(JSON.stringify({ok:true,scientific:graph.edges.length,connections:actual.length,giant:count}));
