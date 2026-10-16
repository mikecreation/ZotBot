importScripts('branch-layout.js?v=0.16.0','circuit-routing.js?v=0.16.0','circuit-spatial.js?v=0.16.0','circuit-painter.js?v=0.16.0','node-connections.js?v=0.16.0');
// One immutable geometry build per loaded graph. Camera movement never visits this worker.
let paintContext=null;
const CLUSTER_AT=40,CLUSTER_SIZE=24;
function makeOverview(size,options={}){
  if(!paintContext||typeof OffscreenCanvas==='undefined'||!size.width||!size.height)return null;
  Object.assign(paintContext,options.connectionKey?FogNodeConnections.scope(paintContext.byKey,paintContext.connectionIndex,options.connectionKey):{...FogCircuitSpatial.scope(paintContext.items,paintContext.edges,options.scopeKey),connectionLinks:null});
  const {width,height,dpr}=size,b=paintContext.scopeBounds||paintContext.itemTree,aspect=width/height;let w=b.right-b.left+180,h=b.bottom-b.top+180;
  if(w/h<aspect)w=h*aspect;else h=w/aspect;
  const v=[(b.left+b.right-w)/2,(b.top+b.bottom-h)/2,w,h],scale=Math.min(width/dpr/w,height/dpr/h),ox=(width/dpr-w*scale)/2,oy=(height/dpr-h*scale)/2;
  const canvas=new OffscreenCanvas(width,height),c=canvas.getContext('2d');c.scale(dpr,dpr);paintContext.options=options;
  FogCircuitPainter.draw.call(paintContext,c,v,scale,ox,oy);
  return {bitmap:canvas.transferToImageBitmap(),width,height,dpr,scale,viewport:v,ox,oy,options};
}
onmessage=async({data})=>{
  if(data.type==='overview'){
    try{const overview=makeOverview(data.size,data.options);postMessage({type:'overview',requestId:data.requestId,overview},overview?[overview.bitmap]:[])}
    catch(error){postMessage({type:'overview',requestId:data.requestId,overview:null,error:error.message})}return;
  }
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
      // Unplaced inventory components all hang straight off the field root. At
      // thousands of records that is one flat fan of hundreds of siblings, which the
      // ring packer spreads over the whole sector as a rigid grid with sector-wide
      // wires. Group them into small alphabetical inventory hubs instead; this is a
      // display aid only and never claims ancestry (hubs are not records).
      // Generalised (follow-up to #115): any parent, not only the field root, whose
      // unplaced or leaf children exceed CLUSTER_AT gets alphabetical display hubs.
      // E.g. a reviewed parent with 200 leaf specialties otherwise fans into a grid.
      // Hubs are display aids only and never claim ancestry (hubs are not records).
      let grouped=false;
      for(const entry of flat){const t=entry.tree;if(t.kind==='cluster')continue;
        const pick=c=>c.kind!=='cluster'&&(t===root?c.relation==='placement_pending':!c.children.length);
        const direct=t.children.filter(pick);if(direct.length<=CLUSTER_AT)continue;grouped=true;
        const label=c=>String(nodes.get(c.id)?.label||c.id),sorted=direct.sort((a,b)=>label(a).localeCompare(label(b))||a.id.localeCompare(b.id));
        const groups=Math.ceil(sorted.length/CLUSTER_SIZE),per=Math.ceil(sorted.length/groups),hubs=[],prefix=t===root?'Unplaced ':'Group ',tag=t===root?f.id:t.key;
        for(let g=0;g<groups;g++){const chunk=sorted.slice(g*per,(g+1)*per);if(!chunk.length)continue;
          const first=label(chunk[0]).charAt(0).toUpperCase(),last=label(chunk[chunk.length-1]).charAt(0).toUpperCase();
          hubs.push({key:'cluster:'+tag+':'+g,id:'cluster:'+tag+':'+g,kind:'cluster',familyId:f.id,relation:t===root?'placement_pending':chunk[0].relation,label:prefix+(first===last?first:first+'\u2013'+last),children:chunk,weight:1})}
        t.children=t.children.filter(c=>!pick(c)).concat(hubs);
      }
      if(grouped){flat.length=0;flat.push({tree:root,depth:0,parent:null});
        for(let i=0;i<flat.length;i++)for(const child of flat[i].tree.children)flat.push({tree:child,parent:flat[i].tree,depth:flat[i].depth+1});
      }
      for(let i=flat.length-1;i>=0;i--){const t=flat[i].tree;t.weight=t.children.reduce((s,c)=>s+c.weight,0)||1}
      return flat;
    });
    const packed=FogBranches.layout(data.families,trees,{anchored:data.nodes.length>2000}),entries=packed.entries;
    const items=entries.map(e=>({key:e.tree.key,id:e.tree.id,kind:e.tree.kind,familyId:e.tree.familyId,relation:e.tree.relation,label:e.tree.label,
      x:e.x,y:e.y,radius:e.radius,angle:e.tree.angle,r:e.r,depth:e.depth,parent:e.parent?.key}));
    const byKey=new Map(entries.map(e=>[e.tree.key,e]));
    const edges=entries.filter(e=>e.parent).map((e,i)=>{
      const a=byKey.get(e.parent.key),dx=e.x-a.x,dy=e.y-a.y,len=Math.hypot(dx,dy)||1;
      const start={x:a.x+dx/len*(a.radius+4),y:a.y+dy/len*(a.radius+4)},end={x:e.x-dx/len*(e.radius+4),y:e.y-dy/len*(e.radius+4)};
      // A cheap, deterministic circuit bus is available immediately; refined
      // obstacle routes arrive progressively without changing node positions.
      const horizontal=Math.abs(dx)>Math.abs(dy),lane=horizontal?(start.x+end.x)/2:(start.y+end.y)/2;
      // Giant atlases use direct parent-to-child spokes: with anchored placement they
      // stay local, whereas Manhattan buses become sector-wide parallel grids.
      const points=entries.length>2000?[start,end]:horizontal?[start,{x:lane,y:start.y},{x:lane,y:end.y},end]:[start,{x:start.x,y:lane},{x:end.x,y:lane},end];
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
    paintContext.byKey=new Map(items.map(e=>[e.key,e]));paintContext.connectionIndex=FogNodeConnections.index(data.connectionRecords||[]);
    const layoutMs=performance.now()-started,overview=makeOverview(data.size);
    postMessage({type:'layout',items,edges,itemTree,edgeTree,evidence,evidenceTree:paintContext.evidenceTree,gap:packed.gap,layoutMs,overview},overview?[overview.bitmap]:[]);
    // Indexed local visibility tests and goal-directed routing work at every
    // scale. Keep a responsive first overview while exact paths arrive in batches.
    const circles=entries.map(e=>({x:e.x,y:e.y,r:e.radius,key:e.tree.key})).concat([{x:800,y:500,r:95,key:'core'}]);
    const obstacles=FogCircuitRoutes.obstacleIndex(circles);
    byKey.set('core',{x:800,y:500,radius:95,tree:{key:'core'}});
    let update=[],unrouted=0;const trunks=new Map(),routeBatch=Math.max(128,Math.ceil(edges.length/24));
    for(let i=0;i<edges.length;i++){
      const edge=edges[i],a=byKey.get(edge.from),b=byKey.get(edge.to);if(!a||!b)continue;
      const previous=trunks.get(edge.from)||[];
      const route=FogCircuitRoutes.routeEdge(a,b,obstacles,i,previous);
      if(route){edge.points=route.points;edge.box=edgeBounds(edge);update.push({index:i,points:route.points,box:edge.box});previous.push(route.points);if(previous.length>16)previous.shift();trunks.set(edge.from,previous)}
      else unrouted++;
      if((i+1)%routeBatch===0){paintContext.edgeTree=edgeIndex();postMessage({type:'routes',routes:update,edgeTree:paintContext.edgeTree,done:i+1,total:edges.length});update=[]}
      if((i+1)%128===0)await new Promise(resolve=>setTimeout(resolve,0));
    }
    paintContext.edgeTree=edgeIndex();if(update.length)postMessage({type:'routes',routes:update,edgeTree:paintContext.edgeTree,done:edges.length,total:edges.length});
    const finalOverview=makeOverview(data.size);postMessage({type:'complete',routing:'indexed-obstacle-routed',unrouted,total:edges.length,workMs:performance.now()-started,overview:finalOverview},finalOverview?[finalOverview.bitmap]:[]);
  }catch(error){postMessage({type:'error',message:error.message})}
};
