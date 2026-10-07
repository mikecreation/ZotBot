(function(root,factory){const api=factory();if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.FogBranches=api})(typeof globalThis!=='undefined'?globalThis:this,function(){
  function assign(tree,start,end){
    const stack=[{tree,start,end}];
    while(stack.length){const next=stack.pop(),t=next.tree;t.angle=(next.start+next.end)/2;let cursor=next.start;
      const weight=t.children.reduce((sum,child)=>sum+child.weight,0)||1;
      for(const child of t.children){const span=(next.end-next.start)*child.weight/weight;stack.push({tree:child,start:cursor,end:cursor+span});cursor+=span}
    }
  }
  function layout(families,trees){
    const entries=trees.flat(),center={x:800,y:500};let gap=150;
    trees.forEach((tree,index)=>{
      const sector=Math.PI*2/families.length,mid=-Math.PI/2+index*sector;
      const start=mid-sector/2+.14,end=mid+sector/2-.14,sweep=end-start;
      assign(tree[0].tree,start,end);tree[0].rowIndex=0;
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
    function place(){for(const entry of entries){entry.r=330+entry.rowIndex*gap;entry.radius=entry.tree.kind==='family'?74:(entry.depth<=1?34:30);entry.x=center.x+Math.cos(entry.tree.angle)*entry.r;entry.y=center.y+Math.sin(entry.tree.angle)*entry.r}}
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
