importScripts('branch-layout.js?v=0.11.1','circuit-routing.js?v=0.11.1','circuit-spatial.js?v=0.11.1','circuit-painter.js?v=0.11.1');
// One immutable geometry build per loaded graph. Camera movement never visits this worker.
let paintContext=null;
function makeOverview(size,options={}){
  if(!paintContext||typeof OffscreenCanvas==='undefined'||!size.width||!size.height)return null;
  Object.assign(paintContext,FogCircuitSpatial.scope(paintContext.items,paintContext.edges,options.scopeKey));
  const {width,height,dpr}=size,b=paintContext.scopeBounds||paintContext.itemTree,aspect=width/height;let w=b.right-b.left+180,h=b.bottom-b.top+180;
  if(w/h<aspect)w=h*aspect;else h=w/aspect;
  const v=[(b.left+b.right-w)/2,(b.top+b.bottom-h)/2,w,h],scale=Math.min(width/dpr/w,height/dpr/h),ox=(width/dpr-w*scale)/2,oy=(height/dpr-h*scale)/2;
  const canvas=new OffscreenCanvas(width,height),c=canvas.getContext('2d');c.scale(dpr,dpr);paintContext.options=options;
  FogCircuitPainter.draw.call(paintContext,c,v,scale,ox,oy);
  return {bitmap:canvas.transferToImageBitmap(),width,height,scale,viewport:v,ox,oy,options};
}
onmessage=({data})=>{
  if(data.type==='overview'){const overview=makeOverview(data.size,data.options);if(overview)postMessage({type:'overview',overview},[overview.bitmap]);return}
  try{
    const started=performance.now(),nodes=new Map(data.nodes.map(n=>[n.id,n]));
    const outgoing=new Map();
    for(const link of data.links){if(!outgoing.has(link.source))outgoing.set(link.source,[]);outgoing.get(link.source).push(link)}
    const trees=data.families.map(f=>{
      const root={key:'family:'+f.id,id:f.id,kind:'family',familyId:f.id,children:[],weight:1};
      const flat=[{tree:root,depth:0,parent:null}],seen=new Set([root.key]);
      for(let i=0;i<flat.length;i++){
        const entry=flat[i];
        for(const link of outgoing.get(entry.tree.key.replace(/^node:/,''))||[]){
          const node=nodes.get(link.target);if(!node||seen.has('node:'+node.id))continue;
          seen.add('node:'+node.id);
          const tree={key:'node:'+node.id,id:node.id,kind:'node',familyId:f.id,relation:link.type,children:[],weight:1};
          entry.tree.children.push(tree);flat.push({tree,parent:entry.tree,depth:entry.depth+1});
        }
      }
      for(let i=flat.length-1;i>=0;i--){const t=flat[i].tree;t.weight=t.children.reduce((s,c)=>s+c.weight,0)||1}
      return flat;
    });
    const packed=FogBranches.layout(data.families,trees),entries=packed.entries;
    const items=entries.map(e=>({key:e.tree.key,id:e.tree.id,kind:e.tree.kind,familyId:e.tree.familyId,relation:e.tree.relation,
      x:e.x,y:e.y,radius:e.radius,angle:e.tree.angle,r:e.r,depth:e.depth,parent:e.parent?.key}));
    const byKey=new Map(entries.map(e=>[e.tree.key,e]));
    const edges=entries.filter(e=>e.parent).map((e,i)=>{
      const a=byKey.get(e.parent.key),dx=e.x-a.x,dy=e.y-a.y,len=Math.hypot(dx,dy)||1;
      const start={x:a.x+dx/len*(a.radius+4),y:a.y+dy/len*(a.radius+4)},end={x:e.x-dx/len*(e.radius+4),y:e.y-dy/len*(e.radius+4)};
      // A cheap, deterministic circuit bus is available immediately; refined
      // obstacle routes arrive progressively without changing node positions.
      const horizontal=Math.abs(dx)>Math.abs(dy),lane=horizontal?(start.x+end.x)/2:(start.y+end.y)/2;
      const points=horizontal?[start,{x:lane,y:start.y},{x:lane,y:end.y},end]:[start,{x:start.x,y:lane},{x:end.x,y:lane},end];
      return {from:a.tree.key,to:e.tree.key,familyId:e.tree.familyId,relation:e.tree.relation,points,index:i};
    });
    for(const f of data.families){const to=byKey.get('family:'+f.id);edges.push({from:'core',to:to.tree.key,familyId:f.id,relation:'category',points:[{x:800,y:500},{x:to.x,y:to.y}]})}
    const edgeBounds=edge=>{const box={left:Infinity,top:Infinity,right:-Infinity,bottom:-Infinity};for(const p of edge.points){box.left=Math.min(box.left,p.x);box.top=Math.min(box.top,p.y);box.right=Math.max(box.right,p.x);box.bottom=Math.max(box.bottom,p.y)}return box};
    for(const edge of edges)edge.box=edgeBounds(edge);
    const itemTree=FogCircuitSpatial.boundsTree(items.map((_,i)=>i),i=>({left:items[i].x-items[i].radius,top:items[i].y-items[i].radius,right:items[i].x+items[i].radius,bottom:items[i].y+items[i].radius}));
    const edgeIndex=()=>FogCircuitSpatial.boundsTree(edges.map((_,i)=>i),i=>edges[i].box);
    const edgeTree=edgeIndex(),byId=new Map(items.map(e=>[e.id,e]));
    const evidence=(data.edges||[]).map(e=>{const a=byId.get(e.source),b=byId.get(e.target);if(!a||!b)return null;return {points:[a,b],from:'node:'+e.source,to:'node:'+e.target,color:['contradicts','supersedes','failed_replication'].includes(e.type)?'#ff637d':'#aebeff',box:edgeBounds({points:[a,b]})}}).filter(Boolean);
    paintContext={data:{families:data.families},nodes,items,edges,itemTree,edgeTree,families:new Map(data.families.map(f=>[f.id,f])),pending:new Set(data.pending||[]),evidence,evidenceTree:FogCircuitSpatial.boundsTree(evidence.map((_,i)=>i),i=>evidence[i].box)};
    const layoutMs=performance.now()-started,overview=makeOverview(data.size);
    postMessage({type:'layout',items,edges,itemTree,edgeTree,evidence,evidenceTree:paintContext.evidenceTree,gap:packed.gap,layoutMs,overview},overview?[overview.bitmap]:[]);
    // Exact obstacle routing is useful at ordinary atlas sizes. At giant sizes
    // bounded bus geometry prevents a per-wire flood-fill from dominating load.
    if(entries.length>2000){postMessage({type:'complete',routing:'circuit-bus',total:edges.length,workMs:performance.now()-started});return}
    const circles=entries.map(e=>({x:e.x,y:e.y,r:e.radius+7,key:e.tree.key})).concat([{x:800,y:500,r:104,key:'core'}]);
    let update=[];
    for(let i=0;i<edges.length;i++){
      const edge=edges[i],a=byKey.get(edge.from),b=byKey.get(edge.to);if(!a||!b)continue;
      const route=FogCircuitRoutes.routeEdge(a,b,circles,i);
      if(route){edge.points=route.points;edge.box=edgeBounds(edge);update.push({index:i,points:route.points,box:edge.box})}
      if(update.length>=24){postMessage({type:'routes',routes:update,edgeTree:edgeIndex(),done:i+1,total:edges.length});update=[]}
    }
    if(update.length)postMessage({type:'routes',routes:update,edgeTree:edgeIndex(),done:edges.length,total:edges.length});
    paintContext.edgeTree=edgeIndex();const finalOverview=makeOverview(data.size);postMessage({type:'complete',routing:'obstacle-routed',total:edges.length,workMs:performance.now()-started,overview:finalOverview},finalOverview?[finalOverview.bitmap]:[]);
  }catch(error){postMessage({type:'error',message:error.message})}
};
