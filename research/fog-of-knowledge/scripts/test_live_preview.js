/* Offline HTTP/UI boundary regression: one node must update the frame once. */
const assert=require('node:assert/strict');
const path=require('node:path');
const {JSDOM}=require(path.join(process.env.NEMESIS_QA_NODE_MODULES||
  path.resolve(__dirname,'../nemesis/integration/brain-transport/node_modules'),'jsdom'));
const create=require('../atlas-preview.js');
async function main(){
  const a='a'.repeat(40), b='b'.repeat(40);
  const url=sha=>'http://127.0.0.1:8000/github-atlas/mikecreation/ZotBot/'+sha+'/research__fog-of-knowledge/';
  const dom=new JSDOM('<button id="refreshAtlas">Refresh atlas</button><strong id="liveNodeCount"></strong>'+
    '<output id="previewStatus"></output><details id="researchProgress"><summary id="researchSummary"></summary>'+
    '<ul id="researchBatches"></ul></details><iframe id="publishedAtlas" data-sha="'+a+'" src="'+url(a)+'"></iframe>',
    {url:'http://127.0.0.1:8097/',pretendToBeVisual:true});
  const win=dom.window, doc=win.document, frame=doc.getElementById('publishedAtlas');
  let value={sha:a,url:url(a),counts:{discoverable:710},checked_at:new Date().toISOString(),
    research:{running:true,states:{REVIEW:3,BLOCKED:1},totals:{new_nodes:134},
      active_tasks:[{batch_id:'<script>unsafe</script>',label:'Current superconductivity investigation'}],
      batches:[{batch_id:'<script>unsafe</script>',state:'BLOCKED',error:'Missing evidence'}]}};
  let calls=0, reloads=0, fail=false, release=null, restored=null, active=0,maxActive=0;
  win.fetch=async()=>{calls++;active++;maxActive=Math.max(maxActive,active);
    if(release===true)await new Promise(resolve=>{release=resolve});
    active--;if(fail)throw new Error('Offline');return{ok:true,json:async()=>value};};
  const saved={version:2,path:[],expanded:true,viewport:[42,84,1000,700]};
  function attachBridge(){frame.contentWindow.postMessage=(message,origin)=>{
    if(message.type==='fog-preview:snapshot')win.dispatchEvent(new win.MessageEvent('message',
      {source:frame.contentWindow,origin,data:{type:'fog-preview:state',request_id:message.request_id,snapshot:saved}}));
    else restored=message.snapshot;
  };}
  attachBridge();
  const observer=new win.MutationObserver(records=>{if(records.some(r=>r.attributeName==='src')){
    reloads++;attachBridge();frame.dispatchEvent(new win.Event('load'));
  }});observer.observe(frame,{attributes:true});
  const controller=create(win,{autoStart:false});
  const display=(source,origin,hidden)=>win.dispatchEvent(new win.MessageEvent('message',{source,origin,data:{type:'fog-atlas-display',shellHidden:hidden}}));
  display(frame.contentWindow,'http://evil.invalid',true);assert(!doc.body.classList.contains('atlas-shell-hidden'));
  display(win,'http://127.0.0.1:8000',true);assert(!doc.body.classList.contains('atlas-shell-hidden'));
  display(frame.contentWindow,'http://127.0.0.1:8000',true);assert(doc.body.classList.contains('atlas-shell-hidden'));
  display(frame.contentWindow,'http://127.0.0.1:8000',false);assert(!doc.body.classList.contains('atlas-shell-hidden'));
  try{
    await controller.poll();await controller.poll();
    assert.equal(reloads,0);assert.match(doc.getElementById('liveNodeCount').textContent,/710/);
    assert.match(doc.getElementById('researchSummary').textContent,/Reviewing 3/);
    assert.match(doc.getElementById('researchSummary').textContent,/134 published additions/);
    assert.match(doc.getElementById('researchBatches').textContent,/Current superconductivity investigation.*Missing evidence/);
    assert.equal(doc.querySelectorAll('script').length,0); // untrusted status is text only
    value={...value,sha:b,url:url(b),counts:{discoverable:711}};
    await controller.poll();
    assert.equal(reloads,1);assert.equal(frame.src,url(b));assert.deepEqual(restored,saved);
    assert.match(doc.getElementById('liveNodeCount').textContent,/711/);
    assert.match(doc.getElementById('previewStatus').textContent,/\+1 new node/);
    doc.getElementById('refreshAtlas').click();await new Promise(resolve=>setImmediate(resolve));
    assert.equal(reloads,1);assert.equal(calls,4);
    fail=true;await controller.poll();assert.match(doc.getElementById('previewStatus').textContent,/unavailable/);
    assert.match(doc.getElementById('liveNodeCount').textContent,/Last synced nodes.*711/);
    fail=false;await controller.poll();assert.match(doc.getElementById('previewStatus').textContent,/Live/);
    release=true;const pending=controller.poll();await controller.poll();
    assert.equal(maxActive,1);release();await pending;
    const before=frame.src;value={...value,sha:'main',url:'https://example.com/'};await controller.poll();
    assert.equal(frame.src,before);assert.match(doc.getElementById('previewStatus').textContent,/unavailable/);
    console.log('PASS one-node automatic refresh, unchanged snapshot preservation, camera/path transfer, manual refresh, serialized polls, safe status rendering and offline recovery.');
  }finally{controller.stop();observer.disconnect();dom.window.close();}
  const recovery=new JSDOM('<button id="refreshAtlas"></button><strong id="liveNodeCount"></strong>'+
    '<output id="previewStatus"></output><main class="sync-error">Unavailable</main>'+
    '<details id="researchProgress"><summary id="researchSummary"></summary><ul id="researchBatches"></ul></details>',
    {url:'http://127.0.0.1:8097/',pretendToBeVisual:true});
  recovery.window.fetch=async()=>({ok:true,json:async()=>({...value,sha:b,url:url(b)})});
  const recovering=create(recovery.window,{autoStart:false});
  const watch=new recovery.window.MutationObserver(()=>{
    const recoveredFrame=recovery.window.document.querySelector('iframe');
    if(recoveredFrame?.src)recoveredFrame.dispatchEvent(new recovery.window.Event('load'));
  });watch.observe(recovery.window.document.body,{subtree:true,childList:true,attributes:true});
  try{
    await recovering.poll();
    assert.equal(recovery.window.document.querySelector('iframe').src,url(b));
    assert.equal(recovery.window.document.querySelector('.sync-error'),null);
    assert.match(recovery.window.document.getElementById('liveNodeCount').textContent,/711/);
    console.log('PASS initial unavailable page recovers automatically into the published atlas.');
  }finally{recovering.stop();watch.disconnect();recovery.window.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
