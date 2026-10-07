(function(root,factory){const api=factory();if(typeof module!=="undefined"&&module.exports)module.exports=api;else root.FogCircuitSpatial=api})(globalThis,function(){
  function boundsTree(values,bounds,depth=0){
    if(!values.length)return null;
    const box={left:Infinity,top:Infinity,right:-Infinity,bottom:-Infinity};
    for(const value of values){const b=bounds(value);box.left=Math.min(box.left,b.left);box.top=Math.min(box.top,b.top);box.right=Math.max(box.right,b.right);box.bottom=Math.max(box.bottom,b.bottom)}
    if(values.length<=32)return {...box,values};
    const axis=box.right-box.left>box.bottom-box.top?'x':'y';
    values.sort((a,b)=>{const aa=bounds(a),bb=bounds(b);return axis==='x'?aa.left+aa.right-bb.left-bb.right:aa.top+aa.bottom-bb.top-bb.bottom});
    const middle=values.length>>1;
    return {...box,a:boundsTree(values.slice(0,middle),bounds,depth+1),b:boundsTree(values.slice(middle),bounds,depth+1)};
  }
  function query(tree,box,output){
    if(!tree||tree.right<box.left||tree.left>box.right||tree.bottom<box.top||tree.top>box.bottom)return;
    if(tree.values)output.push(...tree.values);else{query(tree.a,box,output);query(tree.b,box,output)}
  }

function scope(items,edges,key){
  if(!key)return {scopeKeys:null,scopeBounds:null};
  const children=new Map();for(const e of edges){if(!children.has(e.from))children.set(e.from,[]);children.get(e.from).push(e.to)}
  const keys=new Set([key]),queue=[key];for(let i=0;i<queue.length;i++)for(const id of children.get(queue[i])||[]){if(!keys.has(id)){keys.add(id);queue.push(id)}}
  const b={left:Infinity,top:Infinity,right:-Infinity,bottom:-Infinity};for(const e of items){if(!keys.has(e.key))continue;b.left=Math.min(b.left,e.x-e.radius);b.right=Math.max(b.right,e.x+e.radius);b.top=Math.min(b.top,e.y-e.radius);b.bottom=Math.max(b.bottom,e.y+e.radius)}
  return {scopeKeys:keys,scopeBounds:Number.isFinite(b.left)?b:null};
}
return {boundsTree,query,scope};
});
