(function(root){
  // Bounding-volume index: query cost follows visible geometry, not total DOM size.
  const {boundsTree,query}=FogCircuitSpatial;
  class FogMassiveAtlas{
    constructor(canvas,graph,data){
      this.canvas=canvas;this.graph=graph;this.data=data;this.ctx=canvas.getContext('2d',{alpha:true});this.ready=false;this.active=false;this.frame=0;this.options={};
      this.nodes=new Map(data.nodes.map(n=>[n.id,n]));this.families=new Map(data.families.map(f=>[f.id,f]));this.pending=new Set(data.navigation.placement_pending_ids);
      this.stats={nodes:data.nodes.length,drawMs:0,draws:0};
      this.progress=document.querySelector('#circuitProgress');
      this.worker=new Worker('./circuit-worker.js?v=0.11.2');
      this.worker.onmessage=({data:message})=>{
        if(message.type==='overview'){
          this.installOverview(message.overview);this.schedule();
        }else if(message.type==='layout'){
          this.items=message.items;this.edges=message.edges;this.itemTree=message.itemTree;
          this.edgeTree=message.edgeTree;this.byId=new Map(this.items.map(e=>[e.id,e]));this.ready=true;Object.assign(this,FogCircuitSpatial.scope(this.items,this.edges,this.options.scopeKey));
          this.stats.layoutMs=message.layoutMs;this.stats.edges=this.edges.length;
          this.evidence=message.evidence;this.evidenceTree=message.evidenceTree;
          if(message.overview)this.installOverview(message.overview);if(this.active)this.fit();this.schedule();
        }else if(message.type==='routes'){
          this.overviewCache=null;
          for(const route of message.routes){const edge=this.edges[route.index];edge.points=route.points;edge.box=route.box}
          // Route changes are infrequent; rebuild bounds once for this batch.
          this.edgeTree=message.edgeTree;this.schedule();
          this.progress.textContent=`${this.nodes.size.toLocaleString()} records expanded · refining circuit traces ${message.done}/${message.total}`;
        }else if(message.type==='complete'){
          this.stats.workMs=message.workMs;this.stats.routing=message.routing;this.progress.hidden=true;if(message.overview)this.installOverview(message.overview);this.schedule();
        }else if(message.type==='error'){this.progress.hidden=false;this.progress.textContent='Circuit could not load: '+message.message}
      };
      this.worker.onerror=()=>{this.progress.hidden=false;this.progress.textContent='Circuit worker could not load. Reload the atlas to retry.'};
      const rect=canvas.parentElement.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);
      this.worker.postMessage({families:data.families,links:data.navigation.links,nodes:data.nodes.map(n=>({id:n.id,domain:n.domain,label:n.label,short_label:n.short_label,kind:n.kind,frontier:n.frontier,_status:n._status})),pending:data.navigation.placement_pending_ids,edges:data.edges,size:{width:Math.round(rect.width*dpr),height:Math.round(rect.height*dpr),dpr}});
      this.resizeObserver=new ResizeObserver(()=>this.schedule());this.resizeObserver.observe(canvas.parentElement);
      graph.addEventListener('pointermove',ev=>{if(!this.active||!this.ready||ev.buttons)return;const item=this.hit(ev);data.onHover(item?.kind==='node'?this.nodes.get(item.id):null)});
      graph.addEventListener('pointerleave',()=>data.onHover(null));
      graph.addEventListener('click',ev=>{if(!this.active||!this.ready||cameraGesture)return;const item=this.hit(ev);if(item?.kind==='node')data.onSelect(this.nodes.get(item.id));else if(item?.kind==='family'){expandAll=false;expandFieldDeep=false;activePath=[familyToken(item.id)];render()}});
    }
    installOverview(overview){if(["evidenceLens","frontierLens","allLabels"].some(k=>!!overview.options?.[k]!==!!this.options[k])||(overview.options?.scopeKey||null)!==(this.options.scopeKey||null)){overview.bitmap.close();return}if(this.overviewCache?.canvas.close)this.overviewCache.canvas.close();this.overviewCache={...overview,canvas:overview.bitmap};}
    requestOverview(){const rect=this.canvas.parentElement.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);this.worker.postMessage({type:"overview",options:this.options,size:{width:Math.round(rect.width*dpr),height:Math.round(rect.height*dpr),dpr}})}
    setActive(active){this.active=active;this.canvas.hidden=!active;this.graph.classList.toggle('canvasOverlay',active);this.progress.hidden=!active||this.stats.workMs!==undefined;if(active&&!this.ready)this.progress.textContent='Expanding the complete knowledge circuit…';this.schedule()}
    configure(options){const next={...this.options,...options},changed=JSON.stringify(next)!==JSON.stringify(this.options);if(changed){if(this.items?.length<=2000)this.overviewCache=null;this.options=next;if(this.ready){Object.assign(this,FogCircuitSpatial.scope(this.items,this.edges,next.scopeKey));this.requestOverview()}}this.schedule()}
    cameraChanged(){
      this.movingUntil=performance.now()+120;this.schedule();
      clearTimeout(this.settleTimer);this.settleTimer=setTimeout(()=>this.schedule(),130);
    }
    schedule(){if(!this.active||this.frame)return;this.frame=requestAnimationFrame(()=>{this.frame=0;if(this.active&&this.ready)this.draw()})}
    viewport(){return this.graph.getAttribute('viewBox').split(/\s+/).map(Number)}
    fit(){if(!this.ready)return;const b=this.scopeBounds||this.itemTree,rect=this.canvas.parentElement.getBoundingClientRect(),aspect=rect.width/rect.height;let w=b.right-b.left+180,h=b.bottom-b.top+180;if(w/h<aspect)w=h*aspect;else h=w/aspect;const v=[(b.left+b.right-w)/2,(b.top+b.bottom-h)/2,w,h];this.graph.setAttribute('viewBox',v.join(' '));fittedViewport=v;this.schedule()}
    hit(ev){
      const rect=this.canvas.getBoundingClientRect(),v=this.viewport(),s=Math.min(rect.width/v[2],rect.height/v[3]);
      const ox=(rect.width-v[2]*s)/2,oy=(rect.height-v[3]*s)/2,x=v[0]+(ev.clientX-rect.left-ox)/s,y=v[1]+(ev.clientY-rect.top-oy)/s,pad=10/s;
      const candidates=[];query(this.itemTree,{left:x-pad,top:y-pad,right:x+pad,bottom:y+pad},candidates);
      let best=null,distance=Infinity;for(const index of candidates){const e=this.items[index];if(this.scopeKeys&&!this.scopeKeys.has(e.key))continue;const d=Math.hypot(e.x-x,e.y-y);if(d<=Math.max(e.radius,8/s)&&d<distance){best=e;distance=d}}return best;
    }
    draw(){
      const started=performance.now(),rect=this.canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);
      const width=Math.round(rect.width*dpr),height=Math.round(rect.height*dpr);if(!width||!height)return;
      if(this.canvas.width!==width||this.canvas.height!==height){this.canvas.width=width;this.canvas.height=height}
      const c=this.ctx,v=this.viewport(),scale=Math.min(rect.width/v[2],rect.height/v[3]),ox=(rect.width-v[2]*scale)/2,oy=(rect.height-v[3]*scale)/2;
      c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,rect.width,rect.height);
      const cache=this.overviewCache;
      if(cache&&cache.width===width&&cache.height===height&&(performance.now()<this.movingUntil||scale<=cache.scale*1.05)){
        const ratio=scale/cache.scale;
        c.drawImage(cache.canvas,(cache.viewport[0]-v[0])*scale+ox-cache.ox*ratio,(cache.viewport[1]-v[1])*scale+oy-cache.oy*ratio,rect.width*ratio,rect.height*ratio);
        this.stats.drawMs=performance.now()-started;this.stats.draws++;this.stats.cachedFrames=(this.stats.cachedFrames||0)+1;return;
      }
      const visible=FogCircuitPainter.draw.call(this,c,v,scale,ox,oy);
      this.stats.drawMs=performance.now()-started;this.stats.draws++;this.stats.visibleNodes=visible.visibleNodes;this.stats.visibleEdges=visible.visibleEdges;
      const b=this.scopeBounds||this.itemTree;
      if(v[0]<=b.left&&v[1]<=b.top&&v[0]+v[2]>=b.right&&v[1]+v[3]>=b.bottom){
        const copy=document.createElement('canvas');copy.width=width;copy.height=height;copy.getContext('2d').drawImage(this.canvas,0,0);
        this.overviewCache={canvas:copy,width,height,scale,viewport:[...v],ox,oy};
      }
    }
  }
  root.FogMassiveAtlas=FogMassiveAtlas;
})(globalThis);
