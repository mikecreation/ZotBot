const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {JSDOM}=require(path.join(process.env.NEMESIS_QA_NODE_MODULES,'jsdom'));
const source=fs.readFileSync(path.join(__dirname,'../contentScript.js'),'utf8');
const start=source.indexOf('  function nbUploadBlockedNotice('),end=source.indexOf('  async function nbPreparePacket(',start);
function fixture({quota=true,open=false,disabled=true,throttle=1,quoted=false}={}){
 const dom=new JSDOM('<body><main><button aria-label="Add files and more" aria-expanded="'+open+'"></button><input type="file" '+(disabled?'disabled':'')+'></main></body>');
 const doc=dom.window.document,toggle=doc.querySelector('button'),input=doc.querySelector('input');let clock=0,clicks=0,files=0;
 if(quoted){const q=doc.createElement('div');q.setAttribute('data-message-author-role','assistant');q.textContent='Upload limit reached';doc.body.append(q);}
 function notice(){if(quota && !doc.getElementById('quota')){const n=doc.createElement('span');n.id='quota';n.textContent='Upload limit reached';doc.body.append(n);}}
 if(open)notice();toggle.onclick=()=>{clicks++;const state=toggle.getAttribute('aria-expanded')==='true';toggle.setAttribute('aria-expanded',String(!state));if(!state)notice();else doc.getElementById('quota')?.remove();};
 const ctx={document:doc,elementVisible:n=>!n.hidden,String,Date:{now:()=>clock},wait:async n=>{clock+=n*throttle;},File,Uint8Array,atob,Event,DataTransfer:class{constructor(){this.files=[];this.items={add:f=>this.files.push(f)}}},nbAttachmentState:()=>({count:0}),nbAttachmentRemoveButtons:()=>[],nbMarkOwnedAttachments:()=>{files++;}};
 // For timeout tests use a plain input so mocked upload does not depend on JSDOM FileList internals.
 if(!disabled){const plain={webkitdirectory:false,getAttribute:()=>null,dispatchEvent(){}};const query=doc.querySelectorAll.bind(doc);doc.querySelectorAll=s=>s==='input[type="file"]'?[plain]:query(s);}
 vm.createContext(ctx);vm.runInContext(source.slice(source.indexOf('  function nbShortNoticeText('),source.indexOf('  function nbRequestRejection('))+source.slice(start,end)+'globalThis.attach=nbAttach;globalThis.notice=nbUploadBlockedNotice;',ctx);
 return {ctx,dom,clicks:()=>clicks,files:()=>files,clock:()=>clock,toggle};
}
(async()=>{
 const item={kind:'site-evidence',name:'nemesis-site-evidence-0123456789abcdef.json',data_url:'data:application/json;base64,e30='};
 let f=fixture();const phases=[];await assert.rejects(f.ctx.attach([item],'exact',p=>phases.push(p)),e=>e.code==='NB_UPLOAD_BLOCKED');assert.deepEqual(phases,['CHECK_UPLOAD_QUOTA']);assert.equal(f.clicks(),2);assert.equal(f.files(),0);assert.equal(f.toggle.getAttribute('aria-expanded'),'false');f.dom.window.close();
 f=fixture({open:true});await assert.rejects(f.ctx.attach([item],'exact'),e=>e.code==='NB_UPLOAD_BLOCKED');assert.equal(f.clicks(),0,'human-opened menu remains open');f.dom.window.close();
 f=fixture({quota:false,quoted:true});await assert.rejects(f.ctx.attach([item],'exact'),/disabled without a confirmed quota/);assert.equal(f.ctx.notice(),null,'source quotation cannot authorize fallback');assert.equal(f.files(),0);f.dom.window.close();
 f=fixture({quota:false,disabled:false,throttle:4});await assert.rejects(f.ctx.attach([item],'exact'),/upload could not be confirmed/);assert.equal(f.clock(),20000,'background one-second timer throttling still stops after 20 seconds, not 80 iterations');f.dom.window.close();
 console.log('PASS disabled live-shape file input, quota portal outside main, automatic menu probe/close, preservation of human-opened menu, quoted notice exclusion, disabled-without-proof no fallback, wall-clock upload deadline. OFFLINE FAULT INJECTION.');
})().catch(e=>{console.error(e);process.exitCode=1;});
