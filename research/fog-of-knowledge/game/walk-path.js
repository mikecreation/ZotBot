// Bounded land routing for an explicitly requested pickup. Never teleports items.
export function walkPath(start,goal,height,slope,obstacles=[]){
  const cell=1.25,limit=12000;
  if(Math.hypot(goal.x-start.x,goal.z-start.z)>180)return null;
  const key=(x,z)=>x+','+z,grid=new Map(),bin=4;
  for(const o of obstacles)for(let x=Math.floor((o.x-o.r-.4)/bin);x<=Math.floor((o.x+o.r+.4)/bin);x++)for(let z=Math.floor((o.z-o.r-.4)/bin);z<=Math.floor((o.z+o.r+.4)/bin);z++){const k=key(x,z);if(!grid.has(k))grid.set(k,[]);grid.get(k).push(o)}
  const pos=(x,z)=>({x:start.x+x*cell,z:start.z+z*cell}),cache=new Map();
  function safe(x,z){const k=key(x,z);if(cache.has(k))return cache.get(k);const p=pos(x,z),h=height(p.x,p.z),ok=h>.1&&slope(p.x,p.z)<.7&&!(grid.get(key(Math.floor(p.x/bin),Math.floor(p.z/bin)))||[]).some(o=>Math.hypot(o.x-p.x,o.z-p.z)<o.r+.4);cache.set(k,ok);return ok}
  const heuristic=(x,z)=>{const p=pos(x,z);return Math.hypot(p.x-goal.x,p.z-goal.z)/cell};
  const open=[],cost=new Map([[key(0,0),0]]),parents=new Map();
  function push(n){open.push(n);let i=open.length-1;while(i){const p=(i-1)>>1;if(open[p].f<=n.f)break;open[i]=open[p];i=p}open[i]=n}
  function pop(){const n=open[0],end=open.pop();if(open.length){let i=0;while(i*2+1<open.length){let c=i*2+1;if(c+1<open.length&&open[c+1].f<open[c].f)c++;if(open[c].f>=end.f)break;open[i]=open[c];i=c}open[i]=end}return n}
  push({x:0,z:0,g:0,f:heuristic(0,0)});
  for(let count=0;open.length&&count<limit;count++){
    const n=pop(),k=key(n.x,n.z);if(n.g!==cost.get(k))continue;
    if(heuristic(n.x,n.z)*cell<1.35){const path=[];let at=k;while(parents.has(at)){const [x,z]=at.split(',').map(Number);path.push(pos(x,z));at=parents.get(at)}return path.reverse()}
    for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){
      const x=n.x+dx,z=n.z+dz;if(!safe(x,z)||dx&&dz&&(!safe(n.x+dx,n.z)||!safe(n.x,n.z+dz)))continue;
      const p=pos(x,z),q=pos(n.x,n.z);if(Math.abs(height(p.x,p.z)-height(q.x,q.z))>cell*.8)continue;
      const g=n.g+Math.hypot(dx,dz),kk=key(x,z);if(g>=(cost.get(kk)??Infinity))continue;cost.set(kk,g);parents.set(kk,k);push({x,z,g,f:g+heuristic(x,z)})
    }
  }
  return null;
}
