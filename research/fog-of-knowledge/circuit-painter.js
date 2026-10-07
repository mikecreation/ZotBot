(function(root){
const {query}=FogCircuitSpatial;
// Fit complete words into an inscribed square. The layout is independent of
// camera zoom, so both worker and viewport painters can reuse the measurements.
const labelCache=new Map();
root.FogCircleLabel={layout(c,label,radius){
  const key=radius+'|'+label;
  if(labelCache.has(key))return labelCache.get(key);
  c.font='600 100px system-ui';
  const words=String(label).trim().split(/\s+/),space=c.measureText(' ').width/100;
  const widths=words.map(word=>c.measureText(word).width/100),side=radius*1.28;
  const wrap=size=>{
    const lines=[];let line='',width=0;
    words.forEach((word,i)=>{
      const next=width+(line?space:0)+widths[i];
      if(line&&next*size>side){lines.push(line);line=word;width=widths[i]}
      else {line+=(line?' ':'')+word;width=next}
    });
    if(line)lines.push(line);
    return lines;
  };
  let low=0,high=Math.min(radius*.4,side/Math.max(...widths));
  for(let i=0;i<14;i++){
    const size=(low+high)/2,lines=wrap(size);
    if(lines.length*size*1.2<=side)low=size;else high=size;
  }
  const result={size:low,lines:wrap(low)};
  labelCache.set(key,result);return result;
},draw(c,label,x,y,radius,scale,maxPixels=12){
  const fitted=this.layout(c,label,radius),size=Math.min(fitted.size,maxPixels/scale);
  c.font=`600 ${size}px system-ui`;c.textAlign='center';c.textBaseline='middle';
  c.strokeStyle='#040a13';c.lineWidth=size*.14;c.lineJoin='round';
  fitted.lines.forEach((line,i)=>{
    const lineY=y+(i-(fitted.lines.length-1)/2)*size*1.2;
    c.strokeText(line,x,lineY);c.fillText(line,x,lineY);
  });
}};
root.FogCircuitPainter={draw:function(c,v,scale,ox,oy){
      c.translate(ox-v[0]*scale,oy-v[1]*scale);c.scale(scale,scale);
      const pad=200/scale,box={left:v[0]-pad,top:v[1]-pad,right:v[0]+v[2]+pad,bottom:v[1]+v[3]+pad};
      const edgeIndices=[],itemIndices=[];query(this.edgeTree,box,edgeIndices);query(this.itemTree,box,itemIndices);const edges=edgeIndices.map(i=>this.edges[i]).filter(e=>!this.scopeKeys||(this.scopeKeys.has(e.from)&&this.scopeKeys.has(e.to))),items=itemIndices.map(i=>this.items[i]).filter(e=>!this.scopeKeys||this.scopeKeys.has(e.key));
      c.lineJoin='miter';c.lineCap='butt';c.lineWidth=.75/scale;
      // Batch by field; no shadows, SVG filters, DOM mutations or animation per record.
      for(const family of this.data.families){c.strokeStyle=family.color;c.globalAlpha=this.options.frontierLens ? .22 : .78;c.beginPath();for(const edge of edges){if(edge.familyId!==family.id)continue;edge.points.forEach((p,i)=>{if(i)c.lineTo(p.x,p.y);else c.moveTo(p.x,p.y)})}c.stroke()}
      if(this.options.evidenceLens){const indices=[];query(this.evidenceTree,box,indices);c.lineWidth=.65/scale;c.globalAlpha=.6;c.setLineDash([4/scale,3/scale]);
        for(const color of ['#aebeff','#ff637d']){c.strokeStyle=color;c.beginPath();for(const index of indices){const edge=this.evidence[index];if(edge.color!==color||(this.scopeKeys&&!this.scopeKeys.has(edge.from)&&!this.scopeKeys.has(edge.to)))continue;edge.points.forEach((p,i)=>{if(i)c.lineTo(p.x,p.y);else c.moveTo(p.x,p.y)})}c.stroke()}c.setLineDash([])
      }
      c.lineWidth=1.5/scale;
      for(const family of this.data.families){
        const records=items.filter(e=>e.kind==='node'&&(this.nodes.get(e.id)?.domain||e.familyId)===family.id);
        for(const pending of [false,true]){c.strokeStyle=family.color;c.globalAlpha=this.options.frontierLens ? .16 : .94;c.setLineDash(pending?[2/scale,3/scale]:[]);c.beginPath();for(const e of records){if(this.pending.has(e.id)!==pending)continue;const n=this.nodes.get(e.id);if(n.frontier||['invalidated','historical','dependency-broken'].includes(n._status))continue;const r=Math.max(e.radius,.7/scale);c.moveTo(e.x+r,e.y);c.arc(e.x,e.y,r,0,Math.PI*2)}c.stroke()}
      }
      c.setLineDash([]);
      for(const e of items){
        const n=this.nodes.get(e.id);if(e.kind!=='node'||(!n.frontier&&!['invalidated','historical','dependency-broken'].includes(n._status)))continue;
        c.strokeStyle=n.frontier?'#c497ff':'#ff4d67';c.globalAlpha=1;c.setLineDash(n.frontier?[3/scale,3/scale]:[]);c.beginPath();c.arc(e.x,e.y,Math.max(e.radius,1/scale),0,Math.PI*2);c.stroke();
      }
      c.setLineDash([]);c.globalAlpha=1;c.textAlign='center';c.textBaseline='top';
      for(const e of items){
        if(e.kind==='family'){const family=this.families.get(e.id);c.strokeStyle=family.color;c.fillStyle='#06101b';c.lineWidth=2/scale;c.beginPath();c.arc(e.x,e.y,e.radius,0,Math.PI*2);c.fill();c.stroke();c.fillStyle='#def6ff';FogCircleLabel.draw(c,family.title||family.short,e.x,e.y,e.radius*.88,scale);continue}
        const node=this.nodes.get(e.id);
        c.globalAlpha=this.options.frontierLens&&!node.frontier ? .55 : 1;c.fillStyle='#d5e8fa';
        FogCircleLabel.draw(c,node.label,e.x,e.y,e.radius*.88,scale,this.options.allLabels?18:12);
      }
      if(!this.scopeKeys){c.globalAlpha=1;c.strokeStyle='#65e1f2';c.fillStyle='#071420';c.lineWidth=2/scale;c.beginPath();c.arc(800,500,95,0,Math.PI*2);c.fill();c.stroke();c.fillStyle='#d7f8ff';FogCircleLabel.draw(c,'HUMAN KNOWLEDGE',800,500,95*.88,scale);}

return {visibleNodes:items.length,visibleEdges:edges.length};
}};
})(globalThis);
