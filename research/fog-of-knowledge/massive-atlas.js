(function(root){
  // Bounding-volume index: query cost follows visible geometry, not total DOM size.
  const {boundsTree,query}=FogCircuitSpatial;
  class FogMassiveAtlas{
    constructor(canvas,graph,data){
      this.canvas=canvas;this.graph=graph;this.data=data;this.ctx=canvas.getContext('2d',{alpha:true});this.ready=false;this.active=false;this.frame=0;this.options={};
      this.nodes=new Map(data.nodes.map(n=>[n.id,n]));this.families=new Map(data.families.map(f=>[f.id,f]));this.pending=new Set(data.navigation.placement_pending_ids);
      this.connectionRecords=FogNodeConnections.records(data);this.connectionIndex=FogNodeConnections.index(this.connectionRecords);
      this.stats={nodes:data.nodes.length,drawMs:0,draws:0};
      this.overviewSequence=0;this.overviewInFlight=null;this.overviewQueued=null;this.pendingOverview=false;this.autoFitted=true;
      this.progress=document.querySelector('#circuitProgress');
      this.worker=new Worker('./circuit-worker.js?v=0.16.0');
      this.worker.onmessage=({data:message})=>{
        if(message.type==='overview'){
          this.receiveOverview(message);
        }else if(message.type==='layout'){
          this.items=message.items;this.edges=message.edges;this.itemTree=message.itemTree;
          this.edgeTree=message.edgeTree;this.byId=new Map(this.items.map(e=>[e.id,e]));this.byKey=new Map(this.items.map(e=>[e.key,e]));this.ready=true;this.applyScope();
          this.stats.layoutMs=message.layoutMs;this.stats.edges=this.edges.length;
          this.canvas.setAttribute?.('data-record-count',String(this.nodes.size));
          this.canvas.setAttribute?.('data-layout-ms',message.layoutMs.toFixed(1));
          this.evidence=message.evidence;this.evidenceTree=message.evidenceTree;
          if(message.overview)this.installOverview(message.overview);if(!this.overviewCache)this.requestOverview();if(this.active)this.fit();this.schedule();
        }else if(message.type==='routes'){
          this.clearOverview();
          for(const route of message.routes){const edge=this.edges[route.index];edge.points=route.points;edge.box=route.box}
          // Route changes are infrequent; rebuild bounds once for this batch.
          this.edgeTree=message.edgeTree;this.schedule();
          this.progress.textContent=`${this.nodes.size.toLocaleString()} records expanded · refining circuit traces ${message.done}/${message.total}`;
        }else if(message.type==='complete'){
          this.stats.workMs=message.workMs;this.stats.routing=message.routing;this.stats.unrouted=message.unrouted||0;
          this.canvas.setAttribute?.('data-work-ms',message.workMs.toFixed(1));
          this.canvas.setAttribute?.('data-routing',message.routing);
          this.canvas.setAttribute?.('data-unrouted',String(this.stats.unrouted));
          this.progress.hidden=!this.stats.unrouted;
          if(this.stats.unrouted)this.progress.textContent=`${this.stats.unrouted} connections await a clear path · every record remains available`;
          this.clearOverview();if(message.overview)this.installOverview(message.overview);
          // A bitmap requested during refinement can contain older routes even
          // when its size/options match. Force a new generation for final geometry.
          this.requestOverview(true);this.schedule();
        }else if(message.type==='error'){this.progress.hidden=false;this.progress.textContent='Circuit could not load: '+message.message}
      };
      this.worker.onerror=()=>{this.overviewInFlight=null;this.overviewQueued=null;this.pendingOverview=false;this.stats.overviewFallback=true;this.progress.hidden=false;this.progress.textContent='Circuit worker could not load. Reload the atlas to retry.';this.schedule()};
      const rect=canvas.parentElement.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);
      this.worker.postMessage({families:data.families,links:data.navigation.links,nodes:data.nodes.map(n=>({id:n.id,domain:n.domain,label:n.label,short_label:n.short_label,kind:n.kind,frontier:n.frontier,_status:n._status})),pending:data.navigation.placement_pending_ids,edges:data.edges,connectionRecords:this.connectionRecords,size:{width:Math.round(rect.width*dpr),height:Math.round(rect.height*dpr),dpr}});
      this.resizeObserver=new ResizeObserver(()=>{
        const r=canvas.parentElement.getBoundingClientRect();if(!r.width||!r.height)return;
        this.clearOverview();
        if(this.ready){
          // A manual pan/zoom owns its camera. Only an untouched FIT follows size.
          if(this.autoFitted&&this.lastFittedViewport?.every((n,i)=>n===this.viewport()[i]))this.fit();
          this.requestOverview();
        }
        this.schedule();
      });this.resizeObserver.observe(canvas.parentElement);
      graph.addEventListener('pointermove',ev=>{if(!this.active||!this.ready||ev.buttons)return;const item=this.hit(ev);data.onHover(item?.kind==='node'?this.nodes.get(item.id):null)});
      graph.addEventListener('pointerleave',()=>data.onHover(null));
      graph.addEventListener('click',ev=>{if(!this.active||!this.ready||cameraGesture)return;const item=this.hit(ev);if(item?.kind==='node')data.onSelect(this.nodes.get(item.id));else if(item?.kind==='family'){expandAll=false;expandFieldDeep=false;activePath=[familyToken(item.id)];render()}});
    }
    applyScope(){Object.assign(this,this.options.connectionKey?FogNodeConnections.scope(this.byKey,this.connectionIndex,this.options.connectionKey):{...FogCircuitSpatial.scope(this.items,this.edges,this.options.scopeKey),connectionLinks:null});}
    clearOverview(){if(this.overviewCache?.canvas.close)this.overviewCache.canvas.close();this.overviewCache=null;}
    overviewSize(){const rect=this.canvas.parentElement.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);return {width:Math.round(rect.width*dpr),height:Math.round(rect.height*dpr),dpr};}
    sameOverviewOptions(options){return ["evidenceLens","frontierLens","allLabels"].every(k=>!!options?.[k]===!!this.options[k])&&(options?.scopeKey||null)===(this.options.scopeKey||null)&&(options?.connectionKey||null)===(this.options.connectionKey||null);}
    installOverview(overview,requestId=null){
      const size=this.overviewSize();
      if(!overview?.bitmap)return false;
      if((requestId===null&&this.pendingOverview)||!this.sameOverviewOptions(overview.options)||overview.width!==size.width||overview.height!==size.height||(overview.dpr!=null&&overview.dpr!==size.dpr)){overview.bitmap.close();return false;}
      this.clearOverview();this.overviewCache={...overview,canvas:overview.bitmap};return true;
    }
    sendOverview(request){this.overviewInFlight=request;this.worker.postMessage(request);}
    requestOverview(force=false){
      const size=this.overviewSize();if(!size.width||!size.height)return;
      const desired={type:'overview',options:{...this.options},size};
      const last=this.overviewQueued||this.overviewInFlight;
      if(!force&&last&&JSON.stringify(last.options)===JSON.stringify(desired.options)&&JSON.stringify(last.size)===JSON.stringify(size))return;
      desired.requestId=++this.overviewSequence;this.pendingOverview=true;
      if(this.overviewInFlight)this.overviewQueued=desired;else this.sendOverview(desired);
    }
    receiveOverview(message){
      const request=this.overviewInFlight;
      if(!request||message.requestId!==request.requestId){message.overview?.bitmap?.close();return;}
      this.overviewInFlight=null;
      if(message.requestId===this.overviewSequence){
        const installed=message.overview&&this.installOverview(message.overview,message.requestId);
        this.stats.overviewFallback=!installed||!!message.error;
        this.stats.overviewError=message.error||null;
      }else message.overview?.bitmap?.close();
      const queued=this.overviewQueued;this.overviewQueued=null;
      this.pendingOverview=!!queued;if(queued)this.sendOverview(queued);
      this.schedule();
    }
    setActive(active){this.active=active;this.canvas.hidden=!active;this.graph.classList.toggle('canvasOverlay',active);this.progress.hidden=!active||this.stats.workMs!==undefined;if(active&&!this.ready)this.progress.textContent='Expanding the complete knowledge circuit…';this.schedule()}
    configure(options){const next={...this.options,...options},changed=JSON.stringify(next)!==JSON.stringify(this.options);if(changed){this.clearOverview();this.options=next;if(this.ready){this.applyScope();this.requestOverview()}}this.schedule()}
    cameraChanged(){
      this.autoFitted=false;
      this.movingUntil=performance.now()+120;this.schedule();
      clearTimeout(this.settleTimer);this.settleTimer=setTimeout(()=>this.schedule(),130);
    }
    schedule(){if(!this.active||this.frame)return;this.frame=requestAnimationFrame(()=>{this.frame=0;if(this.active&&this.ready)this.draw()})}
    viewport(){return this.graph.getAttribute('viewBox').split(/\s+/).map(Number)}
    fit(){if(!this.ready)return;const b=this.scopeBounds||this.itemTree,rect=this.canvas.parentElement.getBoundingClientRect(),aspect=rect.width/rect.height;let w=b.right-b.left+180,h=b.bottom-b.top+180;if(w/h<aspect)w=h*aspect;else h=w/aspect;const v=[(b.left+b.right-w)/2,(b.top+b.bottom-h)/2,w,h];this.graph.setAttribute('viewBox',v.join(' '));fittedViewport=v;this.lastFittedViewport=[...v];this.autoFitted=true;this.schedule()}
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
      // Pending/unavailable worker bitmaps never hide the graph. The ordinary
      // spatially culled painter remains the fallback, including large scopes.
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
