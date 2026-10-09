const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const qa=process.env.NEMESIS_QA_NODE_MODULES||path.resolve(__dirname,'../../../release-v17-transport/qa/node_modules');
const {JSDOM}=require(path.join(qa,'jsdom'));
const {Schema}=require(path.join(qa,'prosemirror-model'));
const {EditorState}=require(path.join(qa,'prosemirror-state'));
const {EditorView}=require(path.join(qa,'prosemirror-view'));
const root=path.resolve(__dirname,'..');
const schema=new Schema({nodes:{doc:{content:'paragraph+'},paragraph:{content:'inline*',toDOM:()=>['p',0]},
  mention:{inline:true,group:'inline',atom:true,toDOM:()=>['span',{'data-mention':'token'},'']},text:{group:'inline'}},
  marks:{strong:{toDOM:()=>['strong',0]}}});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function fixture({reject=false,controller=true,draft='',raceDraft=null}={}) {
  const dom=new JSDOM('<main><div contenteditable="true" role="textbox">USER ANSWER BLOCK</div><form><section><div id="mount"></div></section><button aria-label="Send" type="button">Send</button></form></main>',{url:'https://chatgpt.com/',pretendToBeVisual:true,runScripts:'outside-only'});
  const w=dom.window;w.scrollBy=()=>{};global.window=w;global.document=w.document;global.getSelection=()=>w.getSelection();global.navigator=w.navigator;global.getComputedStyle=w.getComputedStyle.bind(w);
  w.TextEncoder=TextEncoder;Object.defineProperty(w.crypto,'subtle',{value:require('node:crypto').webcrypto.subtle});
  const uploaded=[];w.DataTransfer=class{constructor(){this.files=[];this.items={add:f=>this.files.push(f)}}};
  const fileInput=w.document.createElement('input');fileInput.type='file';let fileList=[];Object.defineProperty(fileInput,'files',{get:()=>fileList,set:files=>{fileList=files;uploaded.push(...files);}});
  fileInput.addEventListener('change',()=>{for(const file of fileList){const chip=w.document.createElement('button');chip.className='composer-attachment';chip.setAttribute('aria-label','Remove '+file.name);chip.textContent=file.name;w.document.querySelector('form').append(chip);}});w.document.querySelector('form').append(fileInput);
  w.HTMLElement.prototype.getBoundingClientRect=()=>({width:400,height:100,top:0,left:0,bottom:100,right:400});
  w.Range.prototype.getClientRects=()=>[];w.Range.prototype.getBoundingClientRect=()=>({width:400,height:100,top:0,left:0,bottom:100,right:400});
  let writes=0,clicks=0;const listeners=[];
  const view=new EditorView(w.document.getElementById('mount'),{state:EditorState.create({schema})});
  const el=view.dom;el.setAttribute('data-composer-markdown','');el.setAttribute('role','textbox');el.setAttribute('aria-label','Ask ChatGPT');
  if(draft)view.dispatch(view.state.tr.insertText(draft));
  // Standard ProseMirror's descriptor really has no .view. This is the shape the
  // previous test incorrectly replaced with an invented {view} descriptor.
  assert.equal(el.pmViewDesc.view,undefined);
  const native={view,getPlainText:()=>view.state.doc.textBetween(0,view.state.doc.content.size,'\n','\n'),updateLiteralText(text){
    writes++;
    const previous=view.state,blocks=text.split('\n').map(t=>schema.nodes.paragraph.create(null,t?schema.text(t):null));
    view.dispatch(view.state.tr.replaceWith(0,view.state.doc.content.size,blocks));
    if(reject)w.queueMicrotask(()=>view.updateState(previous));
  }};
  if(controller)el.parentElement.__reactFiber$test={memoizedProps:{composerController:native},return:null};
  w.eval(fs.readFileSync(path.join(root,'composer-transaction.js'),'utf8'));
  let config={enabled:true};
  w.chrome={storage:{local:{get:async()=>({'nb.config':config}),set:async()=>{}}},runtime:{
    onMessage:{addListener:fn=>listeners.push(fn)},sendMessage:async m=>{
      if(m.type==='AC44_MAIN_SET_COMPOSER'){
        if(raceDraft!==null && m.options?.operation!=='inspect'){
          view.dispatch(view.state.tr.insertText(raceDraft));raceDraft=null;
        }
        return w.nemesisComposerTransaction({...m.options,text:m.text});
      }
      if(m.type==='NB_AUTHORIZE_SEND')return {ok:config.enabled};
      return {ok:true};
    }}};
  w.document.querySelector('button[aria-label="Send"]').addEventListener('click',()=>{
    clicks++;const text=native.getPlainText(),id=text.match(/\[NEMESIS_REQUEST ([^\]]+)\]/)?.[1];
    const user=w.document.createElement('article');user.setAttribute('data-user-message-bubble','true');user.textContent=text;w.document.querySelector('main').prepend(user);
    view.dispatch(view.state.tr.replaceWith(0,view.state.doc.content.size,schema.nodes.paragraph.create()));
    const assistant=w.document.createElement('article');assistant.setAttribute('data-conversation-role','assistant');
    const pre=w.document.createElement('pre');pre.textContent=JSON.stringify({protocol:'pandora-language/1',request_id:id,RETURN:{status:'complete',text:'TRANSPORT_OK',evidence:[]}});assistant.append(pre);
    const copy=w.document.createElement('button');copy.setAttribute('data-testid','copy-turn-action-button');assistant.append(copy);user.after(assistant);
  });
  w.eval(fs.readFileSync(path.join(root,'contentScript.js'),'utf8'));
  async function message(m){return new Promise((resolve,reject)=>{for(const fn of listeners){let answered=false;const async=fn(m,{},r=>{answered=true;resolve(r)});if(answered||async===true)return;}reject(Error('No handler '+m.type));});}
  return {w,view,el,native,message,uploaded,writes:()=>writes,clicks:()=>clicks,pause:()=>{config.enabled=false;},close:()=>{view.destroy();dom.window.close();}};
}
(async()=>{
  for(const draft of [' ','\n \t\n']){
    const blank=await fixture({draft});
    try{
      assert.equal((await blank.message({type:'NB_CONTENT_STATUS'})).state,'READY');
      const out=await blank.message({type:'NB_CONTENT_SEND',job:{id:'blank-space',lease:'fixture',packet:{GOAL:'Keep exact Unicode 日本語 and \\"quotes\\"'},transport_retries:0}});
      assert.equal(out.sent,true,JSON.stringify(out));assert.equal(blank.clicks(),1);assert.equal(blank.writes(),1);
      const diag=await blank.message({type:'NB_CONTENT_DIAGNOSTICS'});
      assert.equal(diag.sendAttempt.filled.independentReadback,true);
      await blank.message({type:'NB_CONTENT_SEND',job:{id:'blank-space',packet:{},transport_retries:1}});
      assert.equal(blank.clicks(),1,'Whitespace recovery must not replay confirmed sends');
    }finally{blank.close();}
  }
  const wrapped=await fixture({draft:' '});
  try{
    wrapped.el.firstChild.innerHTML='<span> </span>';
    assert.equal((await wrapped.message({type:'NB_CONTENT_STATUS'})).state,'READY');
    const out=await wrapped.message({type:'NB_CONTENT_SEND',job:{id:'observed-plain-span',lease:'fixture',packet:{GOAL:'Observed reload shape'}}});
    assert.equal(out.sent,true,JSON.stringify(out));assert.equal(wrapped.clicks(),1);assert.equal(wrapped.writes(),1);
  }finally{wrapped.close();}
  for(const draft of [' my real draft ','\u200B','\u00A0']){
    const protectedDraft=await fixture({draft});
    try{
      assert.equal((await protectedDraft.message({type:'NB_CONTENT_STATUS'})).state,'BLOCKED');
      const out=await protectedDraft.message({type:'NB_CONTENT_SEND',job:{id:'human-draft',packet:{}}});
      assert.equal(out.state,'BLOCKED');assert.equal(protectedDraft.native.getPlainText(),draft);
      assert.equal(protectedDraft.writes(),0);assert.equal(protectedDraft.clicks(),0);
    }finally{protectedDraft.close();}
  }
  let recovery=await fixture({draft:' '});
  try{
    recovery.w.sessionStorage.setItem('nemesis.brain.transport-block.v623',JSON.stringify({revision:'6.2.3-editor-transaction',retryAfter:Date.now()+1800000,error:'old blank gate'}));
    recovery.w.sessionStorage.setItem('nemesis.brain.receipt.v1',JSON.stringify({id:'blank-retry',state:'FAILED',phase:'VERIFY_COMMIT',safeUnsent:true,clicked:false,transportRetries:0}));
    const out=await recovery.message({type:'NB_CONTENT_SEND',job:{id:'blank-retry',lease:'fixture',packet:{GOAL:'Original unsent job'},transport_retries:1}});
    assert.equal(out.sent,true,JSON.stringify(out));assert.equal(recovery.clicks(),1);
  }finally{recovery.close();}
  let raced=await fixture({raceDraft:'human edit during insertion'});
  try{
    const out=await raced.message({type:'NB_CONTENT_SEND',job:{id:'draft-race',lease:'fixture',packet:{GOAL:'Never overwrite user edits'}}});
    assert.equal(out.clicked,false);assert.equal(out.transportBlocked,false);
    assert(out.error.includes('draft-changed-preserved'),JSON.stringify(out));
    assert.equal(raced.native.getPlainText(),'human edit during insertion');assert.equal(raced.writes(),0);assert.equal(raced.clicks(),0);
    assert.equal((await raced.message({type:'NB_CONTENT_STATUS'})).state,'BLOCKED');
  }finally{raced.close();}
  const atom=await fixture();
  try{
    atom.view.dispatch(atom.view.state.tr.insert(1,schema.nodes.mention.create()));
    assert.equal((await atom.message({type:'NB_CONTENT_STATUS'})).state,'BLOCKED');
    const out=await atom.w.nemesisComposerTransaction({text:'Must not replace embedded object',expected:'',allowBlank:true});
    assert.equal(out.ok,false);assert.equal(out.method,'non-text-draft-preserved');
    assert.equal(atom.writes(),0);assert.equal(atom.clicks(),0);assert.equal(atom.view.state.doc.firstChild.firstChild.type.name,'mention');
  }finally{atom.close();}
  const marked=await fixture({draft:' '});
  try{
    marked.view.dispatch(marked.view.state.tr.addMark(1,2,schema.marks.strong.create()));
    const out=await marked.w.nemesisComposerTransaction({text:'Must preserve marked draft',expected:' ',allowBlank:true});
    assert.equal(out.ok,false);assert.equal(out.method,'non-text-draft-preserved');assert.equal(marked.writes(),0);
    assert.equal(marked.view.state.doc.firstChild.firstChild.marks[0].type.name,'strong');
  }finally{marked.close();}
  let f=await fixture();
  try {
    const long='line one\n\nline two \\" escapes\\n unicode 日本語 '+ 'literal [x] {} \\'.repeat(3000);
    const committed=await f.w.nemesisComposerTransaction({text:long,expected:''});
    assert(committed.ok,JSON.stringify(committed));assert.equal(committed.discovery,'react.composerController');
    assert.equal(f.native.getPlainText(),long);assert.equal(f.writes(),1);assert.equal(f.clicks(),0);
    assert.equal(f.w.document.querySelector('[contenteditable="true"]').textContent,'USER ANSWER BLOCK');
    const refused=await f.w.nemesisComposerTransaction({text:'replace user draft',expected:''});assert(!refused.ok);assert.equal(f.native.getPlainText(),long);
    await f.w.nemesisComposerTransaction({text:'',expected:long});
    const out=await f.message({type:'NB_CONTENT_SEND',job:{id:'one-send',lease:'fixture-lease',packet:{GOAL:'Harmless test'},transport_retries:0}});
    assert.equal(out.sent,true,JSON.stringify(out));assert.equal(f.clicks(),1);
    await f.message({type:'NB_CONTENT_SEND',job:{id:'one-send',packet:{},transport_retries:9}});assert.equal(f.clicks(),1,'A seen user turn must never resend');
    await f.message({type:'NB_CONTENT_STATUS',id:'one-send'});await sleep(3100);
    const collected=await f.message({type:'NB_CONTENT_STATUS',id:'one-send'});assert.equal(collected.state,'COMPLETE',JSON.stringify(collected));
  }finally{f.close();}
  f=await fixture({reject:true});
  try {
    const job={id:'rejected-commit',lease:'fixture',packet:{GOAL:'Harmless'},transport_retries:0};
    const first=await f.message({type:'NB_CONTENT_SEND',job});assert.equal(first.state,'TRANSPORT_BLOCKED',JSON.stringify(first));
    assert.equal(first.safeUnsent,true);assert.equal(first.clicked,false);assert.equal(f.clicks(),0);assert.equal(f.writes(),1);
    for(let i=1;i<5;i++)await f.message({type:'NB_CONTENT_SEND',job:{...job,transport_retries:i}});
    assert.equal(f.writes(),1,'Scheduler retry must not hammer the rejecting editor');assert.equal(f.clicks(),0);
    assert.equal((await f.message({type:'NB_CONTENT_STATUS'})).state,'TRANSPORT_BLOCKED');
  }finally{f.close();}
  f=await fixture({controller:false});
  try{const r=await f.w.nemesisComposerTransaction({text:'no real model',expected:''});assert(!r.ok);assert.equal(f.writes(),0);assert.equal(f.clicks(),0);}finally{f.close();}
  f=await fixture();
  try{f.pause();const r=await f.message({type:'NB_CONTENT_SEND',job:{id:'paused',packet:{}}});assert.equal(r.state,'FAILED');assert.equal(f.clicks(),0);}finally{f.close();}
  for(const size of [94000,125000,287000]){
    f=await fixture();
    try{
      const packet={STATE:{tag:'fog-crew:evidence:adversarial:fixture'},GOAL:'Exact full scientific context 日本語 🧠 \\"\n'+'x'.repeat(size),CONSTRAINT:{caller_instructions:'Keep exact evidence'}};
      const r=await f.message({type:'NB_CONTENT_SEND',job:{id:'inline-fog',lease:'fixture',packet}});
      assert.equal(r.sent,true,JSON.stringify(r));assert.equal(f.clicks(),1);assert.equal(f.uploaded.length,0);
      const prompt=f.w.document.querySelector('[data-user-message-bubble="true"]').textContent;
      assert(prompt.endsWith(JSON.stringify(packet)),'editor transaction must preserve the exact complete inline packet');
      await f.message({type:'NB_CONTENT_SEND',job:{id:'inline-fog',packet,transport_retries:9}});
      assert.equal(f.clicks(),1,'complete inline delivery must not be replayed');
    }finally{f.close();}
  }
  f=await fixture();
  try{
    const r=await f.message({type:'NB_CONTENT_SEND',job:{id:'large-fog',lease:'fixture',packet:{STATE:{tag:'fog-crew:evidence:author:fixture'},GOAL:'Exact full scientific context 日本語'.repeat(30000),CONSTRAINT:{caller_instructions:'Keep exact evidence'}}}});
    assert.equal(r.sent,true,JSON.stringify(r));assert.equal(f.clicks(),1);assert.equal(f.uploaded.length,1);assert.equal(f.uploaded[0].type,'application/json');assert(f.uploaded[0].size>100000);
    const prompt=f.w.document.querySelector('[data-user-message-bubble="true"]').textContent;assert(prompt.length<10000);assert(prompt.includes(f.uploaded[0].name));
  }finally{f.close();}
  console.log('PASS real ProseMirror descriptor, native controller long commit, exact composer/draft protection, one send/collection, rejected commit backoff, and pause. Fixture evidence only; live evidence is separate.');
})().catch(e=>{console.error(e);process.exitCode=1;});
