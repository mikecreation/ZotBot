const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {JSDOM}=require(path.join(process.env.NEMESIS_QA_NODE_MODULES||'../../../../../brain-transport/node_modules','jsdom'));
const source=fs.readFileSync(path.join(__dirname,'../contentScript.js'),'utf8');
const start=source.indexOf('  async function nbPreparePacket('),end=source.indexOf('  async function nbPrepareSafeRetry(',start);
const ctx={crypto:require('node:crypto').webcrypto,TextEncoder,Uint8Array,Array,String,JSON,btoa};
vm.createContext(ctx);vm.runInContext(source.slice(start,end)+'globalThis.prepare=nbPreparePacket;globalThis.prompt=nbPromptText;',ctx);
(async()=>{
  for(const role of ['author','entailment','adversarial'])for(const size of [48001,94000,125000,181000,287000]){
    const packet={GOAL:'Exact source 🧠 日本語 \\"\n'+ 'x'.repeat(size),STATE:{tag:'fog-crew:evidence:'+role},CONSTRAINT:{caller_instructions:'Complete independent review'},EVIDENCE:[{text:'Do not omit this evidence'}],request_id:'exact-fixture'};
    const before=JSON.stringify(packet),out=await ctx.prepare({id:'exact-fixture',packet:before});
    assert.equal(out.attachments.length,0,'complete evidence that fits must not consume upload quota');
    assert.equal(JSON.stringify(out.packet),before,'no source, contract, identity, escaping or Unicode omitted');
    assert(ctx.prompt(out.packet,'exact-fixture').endsWith(before));
  }
  const base={GOAL:'',STATE:{tag:'fog-crew:evidence:entailment'}};
  const room=600000-ctx.prompt(base,'boundary').length;
  base.GOAL='x'.repeat(room);
  assert.equal(ctx.prompt(base,'boundary').length,600000);
  assert.equal((await ctx.prepare({id:'boundary',packet:base})).attachments.length,0,'cap includes exact wrapper and request identity');
  base.GOAL+='x';
  assert.equal((await ctx.prepare({id:'boundary',packet:base})).attachments.length,1,'one character over local cap retains the whole packet in the existing file adapter');
  const image={kind:'image',name:'human-selected.jpg',data_url:'data:image/jpeg;base64,eA=='};
  assert.deepEqual((await ctx.prepare({id:'image',packet:{...base,GOAL:'small',ATTACHMENTS:[image]}})).attachments,[image],'explicit images remain unchanged');

  function uploadFixture(html){
    const dom=new JSDOM('<main>'+html+'</main>');let touched=0;
    const context={document:dom.window.document,elementVisible:n=>!n.hidden,nbAttachmentState:()=>({count:0}),String,
      DataTransfer:class {constructor(){touched++;throw Error('attempted upload');}}};
    vm.createContext(context);vm.runInContext(source.slice(source.indexOf('  async function nbAttach('),start)+'globalThis.attach=nbAttach;',context);
    return {attach:context.attach,touched:()=>touched};
  }
  let f=uploadFixture('<div>You’re out of attachments for now. Try again after 9:52 PM.</div><input type="file">');
  await assert.rejects(f.attach([image],'quota'),/attachment quota exhausted.*9:52 PM.*No file upload attempted; no send attempted/);
  assert.equal(f.touched(),0);
  assert.equal((await f.attach([],'text')).count,0,'upload quota never blocks text-only jobs');
  for(const html of [
    '<div data-message-author-role="assistant">You’re out of attachments for now.</div>',
    '<div data-conversation-role="assistant">You’re out of attachments for now.</div>',
    '<div><div contenteditable="true">You’re out of attachments for now.</div></div>',
    '<pre>You’re out of attachments for now.</pre>',
    '<div contenteditable="true">You’re out of attachments for now.</div>',
    '<div hidden>You’re out of attachments for now.</div>'
  ]){f=uploadFixture(html);await assert.rejects(f.attach([image],'quoted'),/upload input unavailable/);}
  const send=source.slice(source.indexOf('  async function nbSend('));
  assert(send.indexOf('prompt.length > NB_INLINE_PROMPT_LIMIT')<send.indexOf('await nbAttach(attachments,job.id)'),'size guard precedes any upload');
  console.log('PASS text-first complete packets across all review roles, Unicode/escaping, exact wrapper cap, unchanged explicit images, quota-before-upload, source/draft isolation and no text quota coupling. OFFLINE ONLY.');
})().catch(e=>{console.error(e);process.exitCode=1;});
