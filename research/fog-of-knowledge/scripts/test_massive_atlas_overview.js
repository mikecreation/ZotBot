// Exercise actual renderer lifecycle with deterministic worker/canvas surfaces.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../massive-atlas.js'),'utf8');
function setup(){
  const rect={width:800,height:600},sent=[],progress={},attrs={viewBox:'0 0 800 600'};
  let resize,paintCalls=0,lastPaintScope;
  const c={setTransform(){},clearRect(){},drawImage(){}};
  const canvas={parentElement:{getBoundingClientRect:()=>rect},getBoundingClientRect:()=>rect,getContext:()=>c};
  const graph={getAttribute:k=>attrs[k],setAttribute:(k,v)=>attrs[k]=v,addEventListener(){},classList:{toggle(){}}};
  class Worker{postMessage(message){sent.push(message)}}
  class ResizeObserver{constructor(cb){resize=cb}observe(){}}
  const context=vm.createContext({Worker,ResizeObserver,devicePixelRatio:1,performance:{now:()=>0},requestAnimationFrame:()=>1,setTimeout:()=>1,clearTimeout(){},fittedViewport:null,
    document:{querySelector:()=>progress,createElement:()=>({getContext:()=>c})},
    FogCircuitSpatial:{boundsTree(){},query(){},scope:()=>({scopeKeys:null,scopeBounds:null})},
    FogNodeConnections:{records:()=>[],index:()=>new Map(),scope:()=>({scopeKeys:new Set(),scopeBounds:null})},
    FogCircuitPainter:{draw(){paintCalls++;lastPaintScope=this.scopeKeys;return {visibleNodes:this.items.length,visibleEdges:this.edges.length}}}});
  vm.runInContext(source,context);
  const engine=new context.FogMassiveAtlas(canvas,graph,{nodes:[],families:[],navigation:{placement_pending_ids:[],links:[]},edges:[]});
  engine.ready=true;engine.active=true;engine.items=[];engine.edges=[];engine.itemTree={left:0,top:0,right:800,bottom:600};engine.byKey=new Map();engine.stats.workMs=1;
  sent.length=0;
  return {engine,rect,sent,resize:()=>resize(),attrs,progress,paintCalls:()=>paintCalls,lastPaintScope:()=>lastPaintScope};
}
function bitmap(){return {closed:0,close(){this.closed++}}}
function reply(request,extra={}){return {width:request.size.width,height:request.size.height,options:{...request.options},bitmap:bitmap(),scale:1,viewport:[0,0,800,600],ox:0,oy:0,...extra}}

// One outstanding request; a burst replaces the queued request with the latest.
{
  const t=setup(),e=t.engine;e.requestOverview();const first=t.sent[0];
  t.rect.width=900;t.resize();t.rect.width=1000;t.resize();
  assert.equal(t.sent.length,1);assert(e.pendingOverview);
  const stale=reply(first);e.worker.onmessage({data:{type:'overview',requestId:first.requestId,overview:stale}});
  assert.equal(stale.bitmap.closed,1);assert.equal(t.sent.length,2);assert.equal(t.sent[1].size.width,1000);
  const latest=t.sent[1],good=reply(latest);e.worker.onmessage({data:{type:'overview',requestId:latest.requestId,overview:good}});
  assert.equal(e.overviewCache.canvas,good.bitmap);assert.equal(e.pendingOverview,false);
  const duplicate=reply(first);e.worker.onmessage({data:{type:'overview',requestId:first.requestId,overview:duplicate}});
  assert.equal(duplicate.bitmap.closed,1);assert.equal(e.overviewCache.canvas,good.bitmap);
}
// Late wrong-size/options results must close, even when their request ID matches.
for(const wrong of ['size','options','dpr']){
  const t=setup(),e=t.engine;e.requestOverview();const req=t.sent[0],bad=reply(req);
  if(wrong==='size')bad.width++;else if(wrong==='dpr')bad.dpr=2;else bad.options.frontierLens=true;
  e.worker.onmessage({data:{type:'overview',requestId:req.requestId,overview:bad}});
  assert.equal(bad.bitmap.closed,1);assert.equal(e.overviewCache,undefined);assert.equal(e.pendingOverview,false);assert.equal(e.stats.overviewFallback,true);
}
// Final geometry must replace even an otherwise identical in-flight bitmap.
{
  const t=setup(),e=t.engine;e.requestOverview();const first=t.sent[0];
  e.worker.onmessage({data:{type:'complete',workMs:5,routing:'obstacle-routed'}});
  assert.equal(t.sent.length,1);assert(e.overviewQueued.requestId>first.requestId);
  const old=reply(first);e.receiveOverview({requestId:first.requestId,overview:old});
  assert.equal(old.bitmap.closed,1);assert.equal(t.sent.length,2);
  const final=t.sent[1],good=reply(final);e.receiveOverview({requestId:final.requestId,overview:good});assert.equal(e.overviewCache.canvas,good.bitmap);
}
// An unsolicited initial/final bitmap cannot replace a newer requested view.
{
  const t=setup(),e=t.engine;e.requestOverview();const req=t.sent[0],old=reply(req);
  assert.equal(e.installOverview(old),false);assert.equal(old.bitmap.closed,1);assert(e.pendingOverview);
}
// Null/error responses never strand a >2k connection scope on a blank canvas.
for(const error of [undefined,'overview unavailable']){
  const t=setup(),e=t.engine;e.options={connectionKey:'hub'};e.items=Array.from({length:4303},(_,i)=>({key:String(i)}));e.edges=Array(4303).fill({});e.scopeKeys=new Set(e.items.map(n=>n.key));
  e.requestOverview();e.draw();assert.equal(t.paintCalls(),1,'paint while bitmap is pending');assert.equal(t.lastPaintScope(),e.scopeKeys);
  const req=t.sent[0];e.worker.onmessage({data:{type:'overview',requestId:req.requestId,overview:null,error}});
  assert.equal(e.pendingOverview,false);e.clearOverview();e.draw();assert.equal(t.paintCalls(),2);assert.equal(e.stats.visibleNodes,4303);assert.equal(e.stats.visibleEdges,4303);
}
// Scope changes coalesce too, and the outgoing options snapshot stays immutable.
{
  const t=setup(),e=t.engine;e.configure({scopeKey:'family:life'});const first=t.sent[0];e.configure({scopeKey:'family:health'});e.configure({scopeKey:'family:engineering'});
  assert.equal(first.options.scopeKey,'family:life');assert.equal(t.sent.length,1);
  e.receiveOverview({requestId:first.requestId,overview:null});assert.equal(t.sent[1].options.scopeKey,'family:engineering');
}
// Resize refits an untouched FIT, while preserving manual pan/zoom coordinates.
{
  const t=setup(),e=t.engine;e.fit();const initial=t.attrs.viewBox;t.rect.width=1200;t.resize();assert.notEqual(t.attrs.viewBox,initial);
  t.attrs.viewBox='100 120 300 200';e.cameraChanged();t.rect.width=1400;t.resize();assert.equal(t.attrs.viewBox,'100 120 300 200');
  assert.equal(t.sent.length,1,'resize work is coalesced');
}
// Bitmap resources close on resize and worker errors release pending state.
{
  const t=setup(),e=t.engine,b=bitmap();e.overviewCache={canvas:b};t.resize();assert.equal(b.closed,1);e.worker.onerror();assert.equal(e.pendingOverview,false);assert.equal(e.overviewInFlight,null);assert.equal(e.overviewQueued,null);
}
console.log('PASS overview coalescing, stale bitmap disposal, resize camera preservation, unavailable/error fallback and full 4303-node scope');
