/* Read-only live preview. A changed published commit replaces only this frame. */
(function(root){
  'use strict';
  function createLivePreview(win, options={}){
    const doc=win.document, button=doc.getElementById('refreshAtlas');
    const status=doc.getElementById('previewStatus'), count=doc.getElementById('liveNodeCount');
    const summary=doc.getElementById('researchSummary'), batches=doc.getElementById('researchBatches');
    let frame=doc.getElementById('publishedAtlas'), busy=false, timer=null, stopped=false, sequence=0;
    let sha=frame?.dataset.sha||'', previousCount=null;
    // Frontend-only activation also works with an already-running preview server.
    const displayStyle=doc.createElement('style');
    displayStyle.textContent='body.atlas-shell-hidden .preview-bar,body.atlas-shell-hidden .research-progress{display:none}';
    doc.head.append(displayStyle);
    if(frame)frame.allowFullscreen=true;
    win.addEventListener('message',event=>{
      if(event.source!==frame?.contentWindow||event.data?.type!=='fog-atlas-display')return;
      if(event.origin!==new URL(frame.src,win.location.href).origin)return;
      doc.body.classList.toggle('atlas-shell-hidden',event.data.shellHidden===true);
    });
    const labels={CAPTURE:'Capturing sources',AUTHOR:'Building candidates',REVIEW:'Reviewing',
      READY:'Ready to publish',PUBLISH:'Publishing',CI:'Awaiting CI',MERGED:'Published',BLOCKED:'Blocked'};
    function progress(research){
      batches.replaceChildren();
      if(!research||research.unavailable){summary.textContent='Research progress unavailable · map sync still active';return;}
      const parts=Object.entries(research.states||{}).map(([state,n])=>(labels[state]||state)+' '+n);
      const additions=research.totals?.new_nodes;
      summary.textContent=(research.running?'Research active':'Research paused')+
        (Number.isSafeInteger(additions)?' · '+additions+' published additions':'')+
        ' · '+(parts.join(' · ')||'No retained batches yet');
      const taskNames=new Map((research.active_tasks||[]).map(task=>[task.batch_id,task.label]));
      for(const row of research.batches||[]){
        const item=doc.createElement('li'), yielded=row.yield_counts;
        const stage=row.state==='MERGED'?'published':'proposed';
        const yieldText=yielded?' · '+(yielded.new_nodes||0)+' '+stage+' new nodes, '+(yielded.updated_nodes||0)+' '+stage+' updates':'';
        item.textContent=(taskNames.get(row.batch_id)||row.batch_id||'Batch')+' — '+(labels[row.state]||row.state)+yieldText+
          (row.error?' · '+row.error:'')+(row.publication_wait?' · '+row.publication_wait:'');
        batches.append(item);
      }
      if(research.last_error){const item=doc.createElement('li');item.textContent='Research issue: '+research.last_error;batches.prepend(item);}
    }
    function snapshot(){
      if(!frame)return Promise.resolve(null);
      const origin=new URL(frame.src).origin, source=frame.contentWindow, requestId='preview-'+(++sequence);
      return new Promise(resolve=>{
        const done=value=>{win.clearTimeout(timeout);win.removeEventListener('message',receive);resolve(value);};
        const receive=event=>{if(event.source===source&&event.origin===origin&&event.data?.type==='fog-preview:state'&&event.data.request_id===requestId)done(event.data.snapshot);};
        const timeout=win.setTimeout(()=>done(null),500);
        win.addEventListener('message',receive);
        source.postMessage({type:'fog-preview:snapshot',request_id:requestId},origin);
      });
    }
    async function replaceFrame(value){
      const saved=await snapshot();
      if(!frame){
        frame=doc.createElement('iframe');frame.id='publishedAtlas';frame.title='Published Fog of Knowledge';frame.allowFullscreen=true;
        doc.querySelector('.sync-error')?.remove();doc.getElementById('researchProgress').after(frame);
      }
      const activeFrame=frame;
      await new Promise((resolve,reject)=>{
        const timeout=win.setTimeout(()=>{activeFrame.removeEventListener('load',loaded);reject(new Error('Map loading timed out'));},30000);
        const loaded=()=>{win.clearTimeout(timeout);activeFrame.removeEventListener('load',loaded);
          if(saved)activeFrame.contentWindow.postMessage({type:'fog-preview:restore',snapshot:saved},new URL(value.url).origin);
          resolve();};
        activeFrame.addEventListener('load',loaded);activeFrame.src=value.url;
      });
      sha=value.sha;frame.dataset.sha=sha;
    }
    function validate(value){
      const expected='http://127.0.0.1:8000/github-atlas/mikecreation/ZotBot/'+value.sha+'/research__fog-of-knowledge/';
      if(!/^[0-9a-f]{40}$/.test(value.sha)||value.url!==expected||
        !Number.isSafeInteger(value.counts?.discoverable)||value.counts.discoverable<0)throw new Error('Invalid published snapshot');
    }
    async function poll(manual=false){
      if(busy||stopped)return;
      if(doc.visibilityState==='hidden'&&!manual){schedule();return;}
      busy=true;button.disabled=true;win.clearTimeout(timer);
      const controller=new win.AbortController(), deadline=win.setTimeout(()=>controller.abort(),65000);
      try{
        if(manual)status.textContent='Checking latest publication…';
        const response=await win.fetch('/api/preview/live',{cache:'no-store',signal:controller.signal});
        if(!response.ok)throw new Error('Sync service returned '+response.status);
        const value=await response.json();validate(value);progress(value.research);
        if(value.sha!==sha){status.textContent='Updating map…';await replaceFrame(value);}
        const n=value.counts.discoverable, delta=previousCount===null?0:n-previousCount;
        count.textContent='Live nodes · '+n.toLocaleString();
        status.textContent='Live · checked '+new Date(value.checked_at).toLocaleTimeString()+
          (delta>0?' · +'+delta+' new '+(delta===1?'node':'nodes'):'');
        status.title='Published snapshot '+value.sha;previousCount=n;
      }catch(error){
        status.textContent='Live sync unavailable · retrying automatically';
        status.title=String(error.message||error);
        count.textContent=previousCount===null?'Live nodes · unavailable':'Last synced nodes · '+previousCount.toLocaleString();
      }finally{win.clearTimeout(deadline);busy=false;button.disabled=false;schedule();}
    }
    function schedule(){win.clearTimeout(timer);if(!stopped)timer=win.setTimeout(()=>poll(),5000);}
    const click=()=>poll(true), visible=()=>{if(doc.visibilityState==='visible')poll();};
    button.addEventListener('click',click);doc.addEventListener('visibilitychange',visible);
    if(options.autoStart!==false)poll();
    return {poll,stop(){stopped=true;win.clearTimeout(timer);button.removeEventListener('click',click);doc.removeEventListener('visibilitychange',visible);}};
  }
  if(typeof module==='object'&&module.exports)module.exports=createLivePreview;
  else root.FogPreview=createLivePreview(root);
})(typeof window==='object'?window:null);
