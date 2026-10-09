// Regression for the rendered Latest response UI observed during live activation.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const qa=process.env.NEMESIS_QA_NODE_MODULES||path.resolve(__dirname,'../../../release-v17-transport/qa/node_modules');
const {JSDOM}=require(path.join(qa,'jsdom'));
const source=fs.readFileSync(path.join(__dirname,'../contentScript.js'),'utf8');
const id='fixture-owned-job',envelope={protocol:'pandora-language/1',request_id:id,RETURN:{status:'complete',text:'exact retained answer',evidence:[]}};
function slice(start,end){const a=source.indexOf(start),b=source.indexOf(end,a);assert(a>=0&&b>a);return source.slice(a,b);}
function fixture(options={}){
  const dom=new JSDOM('<main><h2>Latest response</h2><div class="group" data-talvt-turn-state="complete"><div><div data-content-search-unit-key="fallback-turn-0:1:assistant" data-chatgpt-search-unit-key="fallback-turn-0:1:assistant"><h4 class="sr-only" data-conversation-role="assistant">ChatGPT said:</h4><pre><code></code></pre></div></div><div class="turn-action-controls"><button aria-label="Copy">Copy</button><button aria-label="Read aloud">Read aloud</button></div></div></main>',{url:'https://chatgpt.com/c/owned-conversation'});
  const d=dom.window.document;d.querySelector('code').textContent=JSON.stringify(options.envelope||envelope);
  let now=100000,receipt=options.receipt===null?null:{id,state:'SENT',clicked:true,safeUnsent:false,...options.receipt};
  const ctx={document:d,Node:dom.window.Node,location:dom.window.location,console,
    Date:class extends Date{static now(){return now;}},getComputedStyle:()=>({display:'block',visibility:'visible'}),
    nbReceipt:()=>receipt,nbSave:r=>{receipt=JSON.parse(JSON.stringify(r));},nbRefreshEditorGeneration(){},
    nbDropOwnedAttachments(){},nbSending:false,nbStableId:'',nbStableText:'',nbStableAt:0,nbLastCapture:null,
    NB_TRANSPORT_REVISION:'6.2.3-editor-transaction',nbEditorGeneration:1,
    norm:s=>String(s).replace(/\s+/g,' ').trim(),isGenerating:()=>!!options.generating,
    elementVisible:()=>true,nbBlockActive:()=>false,nbBlock:()=>null,
    nbRequestRejection:()=>null,getComposer:()=>({}),composerText:()=>'',nbAttachmentState:()=>({count:0})};
  for(const b of d.querySelectorAll('button'))b.getBoundingClientRect=()=>({width:20,height:20});
  vm.createContext(ctx);
  const selectors=slice('  const S = {','  const runtimeIds');
  // Keep selectors and message root resolution from the deployed source.
  vm.runInContext(selectors+slice('  function canonicalMessageRoot(','  function runtimeKey(')+
    slice('  function latestMessage(','  function isUsableComposer(')+
    slice('  function nbUsers(','  function nbRequestRejection(')+
    slice('  function nbReport(','  async function nbAttach(')+'globalThis.report=nbReport;',ctx);
  return {d,ctx,receipt:()=>receipt,tick:ms=>{now+=ms;return ctx.report(id);},close:()=>dom.window.close()};
}
let f=fixture();assert.equal(f.tick(0).state,'COLLECTING');assert.equal(f.tick(7999).state,'COLLECTING');
let report=f.tick(1);assert.equal(report.state,'COMPLETE');assert.equal(report.matchingUserTurns,0);
assert.equal(report.delivery.userTurnConfirmed,false);assert.equal(report.delivery.responseConfirmed,true);
assert.equal(report.result.RETURN.text,envelope.RETURN.text);assert.equal(f.receipt().clicked,true);
assert.equal(f.tick(1000).state,'COMPLETE','persisted completion supports service-worker/tab restart');f.close();
for(const options of [{receipt:null},{receipt:{id:'other'}},{receipt:{clicked:false}},{receipt:{state:'PREPARING'}},
  {receipt:{state:'FORMAT_SENDING',priorUserCount:0,at:100000}},{generating:true},
  {envelope:{...envelope,request_id:'wrong'}},{envelope:{...envelope,RETURN:{status:'complete',text:'',evidence:[]}}},
  {envelope:{...envelope,RETURN:{status:'working',text:'unfinished',evidence:[]}}},
  {receipt:{state:'FAILED',error:'Response stopped manually. No automatic retry.'}}]){
  f=fixture(options);f.tick(0);assert.notEqual(f.tick(9000).state,'COMPLETE',JSON.stringify(options));f.close();
}
for(const mutate of [d=>d.querySelector('.turn-action-controls').remove(),
  d=>d.querySelector('[data-talvt-turn-state]').setAttribute('data-talvt-turn-state','streaming'),
  d=>{const user=d.createElement('div');user.dataset.userMessageBubble='true';user.textContent='intervening user';d.querySelector('main').append(user);},
  d=>{const other=d.createElement('div');other.dataset.messageAuthorRole='assistant';other.textContent='newer unrelated reply';d.querySelector('main').append(other);},
  d=>{d.querySelector('code').textContent='{"protocol":"pandora-language/1","request_id":';}]){
  f=fixture();mutate(f.d);f.tick(0);assert.notEqual(f.tick(9000).state,'COMPLETE');f.close();
}
f=fixture();f.tick(0);f.tick(7000);f.d.querySelector('code').textContent=JSON.stringify({...envelope,RETURN:{...envelope.RETURN,text:'updated answer'}});
assert.equal(f.tick(2000).state,'COLLECTING','changed response restarts the stability interval');assert.equal(f.tick(8000).state,'COMPLETE');f.close();
console.log('PASS observed assistant-only DOM: exact clicked ownership, completed/stable latest reply, retained recovery, wrong/unowned/unfinished/intervened/manual-stop exclusion; no sends or format recovery.');
