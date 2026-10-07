(function(root){
const {query}=FogCircuitSpatial;
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
        if(e.kind==='family'){const family=this.families.get(e.id);c.strokeStyle=family.color;c.fillStyle='#06101b';c.lineWidth=2/scale;c.beginPath();c.arc(e.x,e.y,e.radius,0,Math.PI*2);c.fill();c.stroke();c.fillStyle='#def6ff';c.font=`600 ${Math.max(7,Math.min(11,e.radius*scale*.25))/scale}px system-ui`;c.fillText(family.short,e.x,e.y+e.radius+10/scale);continue}
        const node=this.nodes.get(e.id);
        // Every visible circle has a name, including the global overview. Keep
        // text in screen pixels and outline it against the dense circuit wires.
        const size=this.options.allLabels?12:Math.max(7,Math.min(12,e.radius*scale*.4));
        c.globalAlpha=this.options.frontierLens&&!node.frontier ? .55 : 1;c.fillStyle='#d5e8fa';c.font=`500 ${size/scale}px system-ui`;
        const label=e.radius*scale<20?node.short_label||node.label:node.label;
        const labelY=e.y+e.radius+3/scale;
        c.strokeStyle='#040a13';c.lineWidth=2/scale;c.lineJoin='round';
        c.strokeText(label,e.x,labelY);c.fillText(label,e.x,labelY);
      }
      if(!this.scopeKeys){c.globalAlpha=1;c.strokeStyle='#65e1f2';c.fillStyle='#071420';c.lineWidth=2/scale;c.beginPath();c.arc(800,500,95,0,Math.PI*2);c.fill();c.stroke();c.fillStyle='#d7f8ff';c.font=`700 ${Math.max(7,Math.min(12,95*scale*.2))/scale}px system-ui`;c.fillText('HUMAN',800,490);c.fillText('KNOWLEDGE',800,490+14/scale);}

return {visibleNodes:items.length,visibleEdges:edges.length};
}};
})(globalThis);
