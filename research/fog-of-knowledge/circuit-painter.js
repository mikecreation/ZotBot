(function(root){
const {query}=FogCircuitSpatial;
// Compare bounded word-wrap candidates using actual glyph corners against the
// circular border. Cache camera-independent layouts; zoom scales the text too.
const labelCache=new Map();
root.FogCircleLabel={layout(c,label,radius){
  const key=radius+'|'+label;
  if(labelCache.has(key))return labelCache.get(key);
  c.font='600 100px system-ui';c.textAlign='center';c.textBaseline='alphabetic';
  const words=String(label).trim().split(/\s+/),space=c.measureText(' ').width/100;
  const widths=words.map(word=>c.measureText(word).width/100);
  const narrow=Math.max(...widths),wide=widths.reduce((a,b)=>a+b,0)+space*(words.length-1);
  const metrics=new Map(),seen=new Set();let best=null;
  for(let candidate=0;candidate<=24;candidate++){
    const limit=narrow+(wide-narrow)*candidate/24,lines=[];let line='',width=0;
    words.forEach((word,i)=>{
      const next=width+(line?space:0)+widths[i];
      if(line&&next>limit+1e-6){lines.push(line);line=word;width=widths[i]}
      else {line+=(line?' ':'')+word;width=next}
    });
    if(line)lines.push(line);
    const signature=lines.join('\n');if(seen.has(signature))continue;seen.add(signature);
    const bounds=lines.map(text=>{
      if(!metrics.has(text)){
        const m=c.measureText(text);
        metrics.set(text,{left:-m.actualBoundingBoxLeft/100,right:m.actualBoundingBoxRight/100,top:-m.actualBoundingBoxAscent/100,bottom:m.actualBoundingBoxDescent/100});
      }
      return metrics.get(text);
    });
    const ys=lines.map((_,i)=>(i-(lines.length-1)/2)*1.08);
    const top=Math.min(...bounds.map((b,i)=>ys[i]+b.top)),bottom=Math.max(...bounds.map((b,i)=>ys[i]+b.bottom));
    const offset=-(top+bottom)/2;let extent=0;
    bounds.forEach((b,i)=>{
      ys[i]+=offset;
      for(const x of [b.left-.05,b.right+.05])for(const y of [ys[i]+b.top-.05,ys[i]+b.bottom+.05])extent=Math.max(extent,Math.hypot(x,y));
    });
    const size=radius*.94/extent;
    if(!best||size>best.size)best={size,lines,ys};
  }
  // Font hinting changes tiny glyph bounds. Check the final font size rather
  // than assuming that measurements at 100px scale down perfectly.
  for(let pass=0;pass<8;pass++){
    c.font=`600 ${best.size}px system-ui`;
    const bounds=best.lines.map(text=>c.measureText(text));
    const ys=best.lines.map((_,i)=>(i-(best.lines.length-1)/2)*best.size*1.08);
    const top=Math.min(...bounds.map((b,i)=>ys[i]-b.actualBoundingBoxAscent));
    const bottom=Math.max(...bounds.map((b,i)=>ys[i]+b.actualBoundingBoxDescent));
    const offset=-(top+bottom)/2,pad=best.size*.05;let extent=0;
    bounds.forEach((b,i)=>{
      ys[i]+=offset;
      for(const x of [-b.actualBoundingBoxLeft-pad,b.actualBoundingBoxRight+pad])for(const y of [ys[i]-b.actualBoundingBoxAscent-pad,ys[i]+b.actualBoundingBoxDescent+pad])extent=Math.max(extent,Math.hypot(x,y));
    });
    best.ys=ys.map(y=>y/best.size);
    if(extent<=radius*.94)break;
    best.size*=radius*.94/extent;
  }
  labelCache.set(key,best);return best;
},draw(c,label,x,y,radius){
  const fitted=this.layout(c,label,radius),size=fitted.size;
  c.font=`600 ${size}px system-ui`;c.textAlign='center';c.textBaseline='alphabetic';
  c.strokeStyle='#040a13';c.lineWidth=size*.1;c.lineJoin='round';
  fitted.lines.forEach((line,i)=>{
    const lineY=y+fitted.ys[i]*size;
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
        if(e.kind==='family'){const family=this.families.get(e.id);c.strokeStyle=family.color;c.fillStyle='#06101b';c.lineWidth=2/scale;c.beginPath();c.arc(e.x,e.y,e.radius,0,Math.PI*2);c.fill();c.stroke();c.fillStyle='#def6ff';FogCircleLabel.draw(c,family.title||family.short,e.x,e.y,e.radius);continue}
        const node=this.nodes.get(e.id);
        c.globalAlpha=this.options.frontierLens&&!node.frontier ? .55 : 1;c.fillStyle='#d5e8fa';
        FogCircleLabel.draw(c,node.label,e.x,e.y,e.radius);
      }
      if(!this.scopeKeys){c.globalAlpha=1;c.strokeStyle='#65e1f2';c.fillStyle='#071420';c.lineWidth=2/scale;c.beginPath();c.arc(800,500,95,0,Math.PI*2);c.fill();c.stroke();c.fillStyle='#d7f8ff';FogCircleLabel.draw(c,'HUMAN KNOWLEDGE',800,500,95);}

return {visibleNodes:items.length,visibleEdges:edges.length};
}};
})(globalThis);
