const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const {JSDOM}=require(path.join(process.env.NEMESIS_QA_NODE_MODULES||'../../../../../brain-transport/node_modules','jsdom'));
const source=fs.readFileSync(path.join(__dirname,'../contentScript.js'),'utf8');
const start=source.indexOf('  async function nbPreparePacket('),end=source.indexOf('  async function nbPrepareSafeRetry(',start);
function fixture(error=null){
  const uploads=[];
  const ctx={setTimeout,clearTimeout,crypto:crypto.webcrypto,TextEncoder,Uint8Array,Array,String,JSON,btoa,nbAttach:async items=>{uploads.push(items);if(error)throw error;},nbOwnedAttachments:()=>null};
  vm.createContext(ctx);vm.runInContext(source.slice(start,end)+'globalThis.prepare=nbPreparePacket;globalThis.prompt=nbPromptText;globalThis.choose=nbSelectTransport;',ctx);
  return {ctx,uploads};
}
(async()=>{
  for(const role of ['author','entailment','adversarial','primary'])for(const size of [20,94000,125000,287000]){
    const packet={GOAL:'Exact source 🧠 日本語 \\"\n'+'x'.repeat(size),STATE:{tag:'fog-crew:evidence:'+role},CONSTRAINT:{caller_instructions:'Complete independent review'},EVIDENCE:[{text:'Never omit this evidence'}]};
    const before=JSON.stringify(packet),f=fixture(),out=await f.ctx.choose({id:'exact',packet:before});
    assert.equal(out.transport,'file-first');assert.equal(f.uploads.length,1);assert.equal(out.attachments.length,1);
    const bytes=Buffer.from(out.attachments[0].data_url.split(',')[1],'base64');
    assert.equal(bytes.toString('utf8'),before);assert(out.prompt.length<12000,'full research body must not be pasted by default');
    assert.equal(out.packet.transportDocument.sha256,crypto.createHash('sha256').update(bytes).digest('hex'));
    const blocked=fixture(Object.assign(Error('Upgrade for more attachments'),{code:'NB_UPLOAD_BLOCKED'}));
    const fallback=await blocked.ctx.choose({id:'exact',packet:before});
    assert.equal(fallback.transport,'explicit-upload-block-text-fallback');assert.equal(fallback.attachments.length,0);assert(fallback.prompt.includes('\n'+before+'\n'),'fallback keeps exact source, scope, instructions, escaping and Unicode');
  }
  const f=fixture(Error('Upload confirmation timed out'));
  await assert.rejects(f.ctx.choose({id:'unknown',packet:{GOAL:'original'}}),/timed out/,'unknown failure never triggers inline fallback');
  const blocked=fixture(Object.assign(Error('Upgrade for uploads'),{code:'NB_UPLOAD_BLOCKED'}));
  await assert.rejects(blocked.ctx.choose({id:'large',packet:{GOAL:'x'.repeat(600000)}}),/complete packet exceeds/,'no silently clipped fallback');
  const image={kind:'image',name:'human-selected.jpg',data_url:'data:image/jpeg;base64,eA=='};
  await assert.rejects(blocked.ctx.choose({id:'image',packet:{GOAL:'small',ATTACHMENTS:[image]}}),/Upgrade/,'explicit images are never discarded to enable text fallback');

  const uploadStart=source.indexOf('  function nbUploadBlockedNotice(');
  function notice(html){
    const dom=new JSDOM('<main>'+html+'</main>');
    const ctx={document:dom.window.document,elementVisible:n=>!n.hidden,String};
    vm.createContext(ctx);vm.runInContext(source.slice(uploadStart,start)+'globalThis.notice=nbUploadBlockedNotice;',ctx);
    const out=ctx.notice();dom.window.close();return out;
  }
  for(const text of ['You’re out of attachments for now. Upgrade your plan for more.','You’ve reached your file upload limit','Upgrade your plan to upload more files'])assert(notice('<div>'+text+'</div>'));
  for(const html of ['<button>Upgrade to Pro</button>','<div data-message-author-role="assistant">Upgrade your plan to upload more files</div>','<pre>You’re out of attachments for now.</pre>','<div><div contenteditable="true">You’re out of attachments for now.</div></div>','<div hidden>You’re out of attachments for now.</div>'])assert.equal(notice(html),null,'quoted/draft/hidden notices and generic Upgrade are not quota evidence');
  console.log('PASS file-first across all roles, small/large exact packets, SHA256, explicit upload-block-only complete text fallback, no generic-error fallback, no image loss, inline capacity and rendered notice isolation. OFFLINE ONLY.');
})().catch(e=>{console.error(e);process.exitCode=1;});
