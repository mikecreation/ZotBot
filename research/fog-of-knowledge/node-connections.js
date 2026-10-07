(function(root,factory){const api=factory();if(typeof module!=="undefined"&&module.exports)module.exports=api;else root.FogNodeConnections=api})(globalThis,function(){
  const key=id=>'node:'+id;
  function records(data){
    const links=[],seen=new Set(),valid=new Set(data.nodes.map(n=>'node:'+n.id).concat(data.families.map(f=>'family:'+f.id)));
    const nodeIds=new Set(data.nodes.map(n=>n.id));
    const reference=id=>nodeIds.has(id)?key(id):String(id).startsWith('family:')?String(id):key(id);
    function add(from,to,type,kind){
      const signature=JSON.stringify([from,to,type,kind]);
      if(!valid.has(from)||!valid.has(to)||seen.has(signature))return;
      seen.add(signature);links.push({from,to,type,kind});
    }
    for(const e of data.edges||[])add(key(e.source),key(e.target),e.type,'scientific');
    for(const e of data.navigation.links||[])add(reference(e.source),key(e.target),e.type,e.type==='reviewed_taxonomy'?'taxonomy':'navigation');
    for(const p of data.navigation.taxonomy||[])add(reference(p.parent),key(p.child),'reviewed_taxonomy','taxonomy');
    for(const p of data.navigation.identities||[])add(reference(p.left),reference(p.right),p.type,'identity');
    return links;
  }
  function index(links){
    const byNode=new Map();
    for(const link of links)for(const id of new Set([link.from,link.to])){
      if(!byNode.has(id))byNode.set(id,[]);byNode.get(id).push(link);
    }
    return byNode;
  }
  function scope(byKey,byNode,focus){
    focus=key(focus);const connectionLinks=byNode.get(focus)||[],scopeKeys=new Set([focus]);
    for(const e of connectionLinks){scopeKeys.add(e.from);scopeKeys.add(e.to)}
    const b={left:Infinity,top:Infinity,right:-Infinity,bottom:-Infinity};
    for(const id of scopeKeys){const e=byKey.get(id);if(!e)continue;b.left=Math.min(b.left,e.x-e.radius);b.right=Math.max(b.right,e.x+e.radius);b.top=Math.min(b.top,e.y-e.radius);b.bottom=Math.max(b.bottom,e.y+e.radius)}
    return {scopeKeys,scopeBounds:Number.isFinite(b.left)?b:null,connectionLinks};
  }
  function peers(byNode,focus){
    focus=key(focus);const peers=new Map();
    for(const link of byNode.get(focus)||[]){
      const id=link.from===focus?link.to:link.from;
      if(id===focus)continue;
      if(!peers.has(id))peers.set(id,[]);peers.get(id).push(link);
    }
    return peers;
  }
  function draw(c,context,scale,box){
    const links=context.connectionLinks||[];let count=0;
    for(const link of links){
      const a=context.byKey.get(link.from),b=context.byKey.get(link.to);if(!a||!b)continue;
      if(box&&(Math.max(a.x+a.radius,b.x+b.radius)<box.left||Math.min(a.x-a.radius,b.x-b.radius)>box.right||Math.max(a.y+a.radius,b.y+b.radius)<box.top||Math.min(a.y-a.radius,b.y-b.radius)>box.bottom))continue;
      const dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy),ux=dx/(length||1),uy=dy/(length||1);
      const start={x:a.x+ux*(a.radius+3/scale),y:a.y+uy*(a.radius+3/scale)},end={x:b.x-ux*(b.radius+3/scale),y:b.y-uy*(b.radius+3/scale)};
      c.strokeStyle=link.kind==='navigation'?'#61d6e5':link.kind==='taxonomy'?'#64efb0':link.kind==='identity'?'#ffa85f':['contradicts','supersedes','failed_replication'].includes(link.type)?'#ff637d':link.type==='tests'?'#ffd35f':'#c3adff';
      c.globalAlpha=.85;c.lineWidth=.9/scale;c.setLineDash(link.kind==='navigation'?[3/scale,4/scale]:[]);
      c.beginPath();
      if(length){c.moveTo(start.x,start.y);c.lineTo(end.x,end.y)}else c.arc(a.x,a.y-a.radius,a.radius*.8,0,Math.PI*2);
      c.stroke();c.setLineDash([]);
      if(link.kind!=='identity'&&length>6/scale){const size=5/scale;c.beginPath();c.moveTo(end.x,end.y);c.lineTo(end.x-ux*size-uy*size*.5,end.y-uy*size+ux*size*.5);c.moveTo(end.x,end.y);c.lineTo(end.x-ux*size+uy*size*.5,end.y-uy*size-ux*size*.5);c.stroke()}
      if(links.length<=80&&length*scale>100){
        const label=link.type.replaceAll('_',' '),x=(start.x+end.x)/2,y=(start.y+end.y)/2;
        c.font=`500 ${10/scale}px system-ui`;c.textAlign='center';c.textBaseline='middle';c.fillStyle='#04101be8';
        const width=c.measureText(label).width;c.fillRect(x-width/2-3/scale,y-7/scale,width+6/scale,14/scale);c.fillStyle=c.strokeStyle;c.fillText(label,x,y);
      }
      count++;
    }
    c.setLineDash([]);c.globalAlpha=1;return count;
  }
  return {key,records,index,scope,peers,draw};
});
