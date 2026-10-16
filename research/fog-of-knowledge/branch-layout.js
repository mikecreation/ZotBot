(function(root,factory){const api=factory();if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.FogBranches=api})(typeof globalThis!=='undefined'?globalThis:this,function(){
  function assign(tree,start,end){
    const stack=[{tree,start,end}];
    while(stack.length){const next=stack.pop(),t=next.tree;t.angle=(next.start+next.end)/2;let cursor=next.start;
      const weight=t.children.reduce((sum,child)=>sum+child.weight,0)||1;
      for(const child of t.children){const span=(next.end-next.start)*child.weight/weight;stack.push({tree:child,start:cursor,end:cursor+span});cursor+=span}
    }
  }
  // Pack a subtree before its next sibling reserves the outer rings. A breadth-
  // first pass lets thousands of unrelated nodes consume every nearby child slot.
  // Descendants inherit their parent's angular displacement, so moving a branch
  // never leaves its children anchored to the branch's abandoned angle.
  function anchoredRows(tree,start,end,sweep){
    const entries=new Map(tree.map(e=>[e.tree,e])),rows=new Map();
    const originalAngles=new Map(tree.map(e=>[e.tree,e.tree.angle]));
    const root=tree[0].tree,stack=[root],offset=new Map([[root,0]]),placed=new Set([root]);let firstOpen=1;
    // Sparse successor/predecessor sets locate the closest vacant slot without
    // scanning all the circles already in a ring. Iterative path compression is
    // also safe for a very wide star or a twelve-thousand-level chain.
    function vacant(links,slot){
      let next=slot;while(links.has(next))next=links.get(next);
      while(links.has(slot)){const old=links.get(slot);links.set(slot,next);slot=old}
      return next;
    }
    function ring(row){
      if(!rows.has(row)){
        const radius=380+row*100,minAngle=2*Math.asin(Math.min(.98,90/(2*radius)));
        const count=Math.max(1,Math.floor(sweep/minAngle));
        rows.set(row,{count,step:sweep/count,next:new Map(),prev:new Map(),used:0});
      }
      return rows.get(row);
    }
    // Probe a bounded child tile before committing a hub. Pending inventory
    // components can themselves have descendants, so reserve their root slots
    // together rather than assuming every member is a leaf.
    function childPlan(t,row,angle){
      if(t.children.length<4&&t.kind!=='cluster')return [];
      const reserved=new Map(),plan=[],shift=angle-originalAngles.get(t);
      for(const child of t.children){
        const target=Math.max(start,Math.min(end,originalAngles.get(child)+shift));let found=false;
        for(let next=row+1;next<=row+10&&!found;next++){
          const r=ring(next),wanted=Math.max(0,Math.min(r.count-1,Math.floor((target-start)/r.step)));
          const local=reserved.get(next)||new Set();let best=-1,distance=Infinity;
          for(let slot=Math.max(0,wanted-6);slot<=Math.min(r.count-1,wanted+6);slot++){
            if(r.next.has(slot)||local.has(slot))continue;
            const d=Math.abs(start+(slot+.5)*r.step-target);
            if(d<distance){best=slot;distance=d}
          }
          if(best>=0){local.add(best);reserved.set(next,local);plan.push({tree:child,row:next,slot:best});found=true}
        }
        if(!found)return null;
      }
      return plan;
    }
    function reserve(t,row,slot){
      const r=ring(row),e=entries.get(t);
      t.angle=start+(slot+.5)*r.step;e.rowIndex=row;offset.set(t,t.angle-originalAngles.get(t));
      r.next.set(slot,vacant(r.next,slot+1));r.prev.set(slot,vacant(r.prev,slot-1));r.used++;
      placed.add(t);
    }
    function place(t){
      if(placed.has(t))return;
      const e=entries.get(t),original=originalAngles.get(t);
      if(e.parent){
        const target=Math.max(start,Math.min(end,original+offset.get(e.parent)));
        let row=Math.max(entries.get(e.parent).rowIndex+1,firstOpen);
        for(;;row++){
          const r=ring(row),wanted=Math.max(0,Math.min(r.count-1,Math.floor((target-start)/r.step)));
          const left=vacant(r.prev,wanted),right=vacant(r.next,wanted);
          const valid=slot=>slot>=0&&slot<r.count&&Math.abs(slot-wanted)<=6;
          const distance=slot=>Math.abs(start+(slot+.5)*r.step-target);
          let slot=valid(left)?left:-1;
          if(valid(right)&&(slot<0||distance(right)<distance(slot)))slot=right;
          if(slot<0)continue;
          // A hub belongs beside its inventory, not in a small inner hole whose
          // surrounding rings have already been claimed by another subtree.
          const plan=childPlan(t,row,start+(slot+.5)*r.step);if(!plan)continue;
          reserve(t,row,slot);
          if(t.kind==='cluster')for(const child of plan)reserve(child.tree,child.row,child.slot);
          while(rows.has(firstOpen)&&rows.get(firstOpen).used===rows.get(firstOpen).count)firstOpen++;
          break;
        }
      }
    }
    while(stack.length){
      const t=stack.pop();place(t);
      // Reverse push preserves the assigned angular order without recursion or
      // per-depth scans. The input tree already has that deterministic order.
      for(let i=t.children.length-1;i>=0;i--)stack.push(t.children[i]);
    }
  }
  function layout(families,trees,options={}){
    const entries=trees.flat(),center={x:800,y:500};let gap=options.anchored?100:150;
    trees.forEach((tree,index)=>{
      const sector=Math.PI*2/families.length,mid=-Math.PI/2+index*sector;
      const start=mid-sector/2+.14,end=mid+sector/2-.14,sweep=end-start;
      assign(tree[0].tree,start,end);tree[0].rowIndex=0;
      if(options.anchored){anchoredRows(tree,start,end,sweep);return}
      let row=1;
      const levels=new Map();for(const entry of tree){if(entry.depth){if(!levels.has(entry.depth))levels.set(entry.depth,[]);levels.get(entry.depth).push(entry)}}
      for(const depth of [...levels.keys()].sort((a,b)=>a-b)){
        const level=levels.get(depth).sort((a,b)=>a.tree.angle-b.tree.angle||a.tree.key.localeCompare(b.tree.key));
        if(!level.length)continue;
        const minCenter=depth<=1?90:82;let cursor=0;
        while(cursor<level.length){
          const radius=330+row*gap,minAngle=2*Math.asin(Math.min(.98,minCenter/(2*radius)));
          const capacity=Math.max(1,Math.floor(sweep/minAngle));
          const count=Math.min(capacity,level.length-cursor);
          for(let slot=0;slot<count;slot++){const e=level[cursor+slot];e.rowIndex=row;e.tree.angle=start+(slot+.5)*sweep/count}
          cursor+=count;row++;
        }
      }
    });
    function place(){for(const entry of entries){entry.r=330+entry.rowIndex*gap+(options.anchored&&entry.rowIndex?50:0);entry.radius=entry.tree.kind==='family'?74:(entry.depth<=1?34:30);entry.x=center.x+Math.cos(entry.tree.angle)*entry.r;entry.y=center.y+Math.sin(entry.tree.angle)*entry.r}}
    function overlaps(){
      const circles=entries.map(e=>({x:e.x,y:e.y,r:e.radius+7})).concat([{...center,r:104}]);
      const buckets=new Map(),cell=240;
      for(const circle of circles){const cx=Math.floor(circle.x/cell),cy=Math.floor(circle.y/cell);
        for(let x=cx-1;x<=cx+1;x++)for(let y=cy-1;y<=cy+1;y++)for(const other of buckets.get(x+':'+y)||[]){if(Math.hypot(circle.x-other.x,circle.y-other.y)<circle.r+other.r+8)return true}
        const key=cx+':'+cy;if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(circle);
      }
      return false;
    }
    place();for(let i=0;i<28&&overlaps();i++){gap=Math.ceil(gap*1.12/5)*5;place()}
    if(overlaps())throw Error('Branch circle-overlap invariant failed');
    return {entries,gap,center};
  }
  return {layout};
});
