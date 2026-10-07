const byId=id=>document.getElementById(id);
const safe=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
async function request(path,body){const r=await fetch(path,body?{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}:{});const value=await r.json();if(!r.ok)throw Error(value.error||r.statusText);return value}
function show(value){byId("result").textContent=JSON.stringify(value,null,2)}
async function action(operation,batch){
  try{
    if(operation==="packet")show(await request("./api/evidence/packet?batch_id="+encodeURIComponent(batch)));
    else{
      const result=await request("./api/evidence/"+operation,{batch_id:batch});show(result);
      if(operation==="check"){
        const button=[...byId("queue").querySelectorAll('[data-op="apply"]')].find(b=>b.dataset.batch===batch);
        if(button)button.disabled=!result.passed;
      }
      if(operation==="apply"&&result.passed)await load();
    }
  }catch(error){byId("result").textContent=error.message}
}
async function load(){
  try{
    const audit=await request("./api/evidence/audit");
    byId("audit").innerHTML=`<h2>Review coverage</h2><div class="counts"><div><b>${audit.counts.evidence_reviewed}</b>evidence-reviewed</div><div><b>${audit.counts.legacy_unreviewed}</b>legacy awaiting review</div><div><b>${audit.counts.missing_sources}</b>source gaps</div></div>`;
    byId("identities").innerHTML=audit.identity_candidates.map(i=>`<article><b>${safe(i.label)}</b><br><small>${safe(i.left)} ↔ ${safe(i.right)}</small><p>${safe(i.reason)} · Suggested review: ${safe(i.suggested_type)}</p></article>`).join("")||"No unresolved matching-label candidates.";
    const queue=await request("./api/evidence/queue");
    byId("queue").innerHTML=queue.batches.map(b=>`<article><b>${safe(b.batch_id)}</b><p>${safe(b.mission)}</p><small>${b.has_captures?"Sources captured":"Source capture missing"} · ${b.has_assertions?"Assertions present":"Scoped assertions missing"} · ${b.decisions} retained decisions</small><br><button data-op="packet" data-batch="${safe(b.batch_id)}">Inspect evidence</button><button data-op="check" data-batch="${safe(b.batch_id)}">Check gate</button><button data-op="review" data-batch="${safe(b.batch_id)}" ${b.has_captures&&b.has_assertions?"":"disabled"}>Request Brain review</button><button data-op="apply" data-batch="${safe(b.batch_id)}" disabled>Apply reviewed batch</button></article>`).join("")||"No candidates retained yet.";
    byId("queue").onclick=event=>{const button=event.target.closest("button[data-op]");if(button)action(button.dataset.op,button.dataset.batch)};
  }catch(error){byId("audit").innerHTML=`<p class="error">${safe(error.message)}. Run the atlas with scripts/atlas_server.py to enable the evidence desk.</p>`}
}
byId("collectReviews").onclick=async()=>{try{show(await request('./api/evidence/jobs'));await load()}catch(error){show({error:error.message})}};
let sourceBlob;
byId('captureForm').onsubmit=async event=>{
  event.preventDefault();const button=event.target.querySelector('button');button.disabled=true;
  try{
    const source=await request('./api/evidence/capture',Object.fromEntries(new FormData(event.target)));
    if(sourceBlob)URL.revokeObjectURL(sourceBlob);
    sourceBlob=URL.createObjectURL(new Blob([JSON.stringify(source)+'\n'],{type:'application/x-ndjson'}));
    const link=byId('sourceDownload');link.href=sourceBlob;link.download='sources.jsonl';link.hidden=false;
    byId('sourcePreview').textContent=source.title+'\nCaptured revision '+source.sha256+'\n\n'+source.text.slice(0,1600)+'\n\nPreview only; the download retains the complete captured text.';
  }catch(error){byId('sourcePreview').textContent=error.message}finally{button.disabled=false}
};
load();
