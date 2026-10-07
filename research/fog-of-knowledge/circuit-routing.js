(function(root,factory){const api=factory();if(typeof module!=="undefined"&&module.exports)module.exports=api;else root.FogCircuitRoutes=api})(globalThis,function(){
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
function pointSegmentDistanceSquared(p,a,b){
  const vx=b.x-a.x,vy=b.y-a.y;
  const wx=p.x-a.x,wy=p.y-a.y;
  const len=vx*vx+vy*vy;
  let t=len?((wx*vx+wy*vy)/len):0;
  t=Math.max(0,Math.min(1,t));
  const x=a.x+t*vx,y=a.y+t*vy;
  const dx=p.x-x,dy=p.y-y;
  return dx*dx+dy*dy;
}

function segmentClear(a,b,obstacles,ignoreKeys=new Set()){
  for(const o of obstacles){
    if(ignoreKeys.has(o.key))continue;
    const rr=o.r+7;
    if(pointSegmentDistanceSquared({x:o.x,y:o.y},a,b)<rr*rr)return false;
  }
  return true;
}

function simplifyPolyline(points){
  if(points.length<=2)return points;
  const out=[points[0]];
  for(let i=1;i<points.length-1;i++){
    const a=out[out.length-1],b=points[i],d=points[i+1];
    const abx=b.x-a.x,aby=b.y-a.y,bdx=d.x-b.x,bdy=d.y-b.y;
    if(Math.abs(abx*bdy-aby*bdx)<1e-6)continue;
    out.push(b);
  }
  out.push(points[points.length-1]);
  return out;
}

function gridRoute(start,end,from,to,obstacles,ignoreKeys){
  const dx=end.x-start.x,dy=end.y-start.y;
  const len=Math.hypot(dx,dy)||1;
  const ux=dx/len,uy=dy/len;

  const all=obstacles.filter(o=>!ignoreKeys.has(o.key));
  let minX=Math.min(start.x,end.x),maxX=Math.max(start.x,end.x);
  let minY=Math.min(start.y,end.y),maxY=Math.max(start.y,end.y);

  const margin=1200;
  minX-=margin;minY-=margin;maxX+=margin;maxY+=margin;
  const spanX=maxX-minX,spanY=maxY-minY;
  const cell=Math.max(4,Math.ceil(Math.sqrt(spanX*spanY/800000)));
  const cols=Math.max(3,Math.ceil(spanX/cell)+1);
  const rows=Math.max(3,Math.ceil(spanY/cell)+1);
  if(cols*rows>1000000)return null;

  const lead=0;
  const routeStart={x:start.x+ux*lead,y:start.y+uy*lead};
  const routeEnd={x:end.x-ux*lead,y:end.y-uy*lead};

  // The lead-in / lead-out must already be clean.
  if(!segmentClear(start,routeStart,obstacles,ignoreKeys)
    ||!segmentClear(routeEnd,end,obstacles,ignoreKeys))return null;

  const idxOf=(ix,iy)=>iy*cols+ix;
  const pointOf=(ix,iy)=>({x:minX+ix*cell,y:minY+iy*cell});
  const cellOf=p=>({
    ix:clamp(Math.round((p.x-minX)/cell),0,cols-1),
    iy:clamp(Math.round((p.y-minY)/cell),0,rows-1)
  });

  const blocked=new Uint8Array(cols*rows);
  for(const o of all){
    const rr=o.r+7+cell*.78;
    const ix0=clamp(Math.floor((o.x-rr-minX)/cell),0,cols-1);
    const ix1=clamp(Math.ceil((o.x+rr-minX)/cell),0,cols-1);
    const iy0=clamp(Math.floor((o.y-rr-minY)/cell),0,rows-1);
    const iy1=clamp(Math.ceil((o.y+rr-minY)/cell),0,rows-1);
    for(let iy=iy0;iy<=iy1;iy++)for(let ix=ix0;ix<=ix1;ix++){
      const p=pointOf(ix,iy),ddx=p.x-o.x,ddy=p.y-o.y;
      if(ddx*ddx+ddy*ddy<rr*rr)blocked[idxOf(ix,iy)]=1;
    }
  }

  function reachableCell(p){
    const base=cellOf(p);
    const choices=[];
    for(let oy=-6;oy<=6;oy++)for(let ox=-6;ox<=6;ox++){
      const ix=base.ix+ox,iy=base.iy+oy;
      if(ix<0||iy<0||ix>=cols||iy>=rows||blocked[idxOf(ix,iy)])continue;
      const point=pointOf(ix,iy);
      if(segmentClear(p,point,obstacles,ignoreKeys))choices.push({ix,iy,d:(point.x-p.x)**2+(point.y-p.y)**2});
    }
    choices.sort((a,b)=>a.d-b.d||a.iy-b.iy||a.ix-b.ix);
    return choices[0];
  }
  const s=reachableCell(routeStart),g=reachableCell(routeEnd);
  if(!s||!g)return null;
  const si=idxOf(s.ix,s.iy),gi=idxOf(g.ix,g.iy);

  const prev=new Int32Array(cols*rows);
  prev.fill(-1);
  const queue=new Int32Array(cols*rows);
  let qh=0,qt=0;
  queue[qt++]=si;
  prev[si]=si;
  const dirs=[[1,0],[-1,0],[0,1],[0,-1]];

  while(qh<qt&&prev[gi]===-1){
    const cur=queue[qh++],cx=cur%cols,cy=Math.floor(cur/cols);
    for(const [sx,sy] of dirs){
      const nx=cx+sx,ny=cy+sy;
      if(nx<0||ny<0||nx>=cols||ny>=rows)continue;
      const ni=idxOf(nx,ny);
      if(blocked[ni]||prev[ni]!==-1)continue;
      prev[ni]=cur;
      queue[qt++]=ni;
      if(ni===gi)break;
    }
  }
  if(prev[gi]===-1)return null;

  const cells=[];
  let cur=gi;
  while(cur!==si){
    const ix=cur%cols,iy=Math.floor(cur/cols);
    cells.push(pointOf(ix,iy));
    cur=prev[cur];
  }
  cells.push(pointOf(s.ix,s.iy));
  cells.reverse();

  let points=[start,routeStart,...cells,routeEnd,end];
  points=simplifyPolyline(points);

  for(let i=1;i<points.length;i++){
    if(!segmentClear(points[i-1],points[i],obstacles,ignoreKeys))return null;
  }

  return {
    d:"M "+points.map((p,i)=>(i?"L ":"")+p.x+" "+p.y).join(" "),
    points
  };
}

function clippedEndpoints(from,to){
  const dx=to.x-from.x,dy=to.y-from.y;
  const len=Math.hypot(dx,dy)||1;
  const ux=dx/len,uy=dy/len;
  return {
    start:{x:from.x+ux*(from.radius+4),y:from.y+uy*(from.radius+4)},
    end:{x:to.x-ux*(to.radius+4),y:to.y-uy*(to.radius+4)}
  };
}

function routeEdge(from,to,obstacles,laneSeed=0){
  const {start,end}=clippedEndpoints(from,to);
  const ignore=new Set([from.tree?.key||from.key,to.tree?.key||to.key]);
  if(segmentClear(start,end,obstacles,ignore)){
    return {d:`M ${start.x} ${start.y} L ${end.x} ${end.y}`,points:[start,end]};
  }

  const dx=end.x-start.x,dy=end.y-start.y;
  const len=Math.hypot(dx,dy)||1;
  const px=-dy/len,py=dx/len;
  const signs=laneSeed%2?[1,-1]:[-1,1];

  for(const offset of [70,110,160,220,300,420,560,760]){
    for(const sign of signs){
      const off=offset*sign;
      const p1={x:start.x+px*off,y:start.y+py*off};
      const p2={x:end.x+px*off,y:end.y+py*off};
      if(segmentClear(start,p1,obstacles,ignore)
        &&segmentClear(p1,p2,obstacles,ignore)
        &&segmentClear(p2,end,obstacles,ignore)){
        return {
          d:`M ${start.x} ${start.y} L ${p1.x} ${p1.y} L ${p2.x} ${p2.y} L ${end.x} ${end.y}`,
          points:[start,p1,p2,end]
        };
      }
    }
  }

  return gridRoute(start,end,from,to,obstacles,ignore);
}

return {routeEdge,segmentClear};
});
