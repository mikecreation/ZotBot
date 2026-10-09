const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const {JSDOM}=require(path.join(process.env.NEMESIS_QA_NODE_MODULES,'jsdom'));
const source=fs.readFileSync(path.join(__dirname,'../contentScript.js'),'utf8');
const dom=new JSDOM('<body><main><div id="history"></div><article data-message-author-role="user" id="owned"></article><section id="error"><div id="notice">Error in message stream</div><button>Retry</button></section><div id="noise"></div></main><span id="quota">Upload limit reached</span></body>');
const doc=dom.window.document,owned=doc.getElementById('owned'),history=doc.getElementById('history');
owned.textContent='[NEMESIS_REQUEST exact-job] '+ 'exact immutable scientific evidence '.repeat(10000);
for(let i=0;i<1500;i++){
 const p=doc.createElement('div');p.innerHTML='<span><span></span></span>';
 p.firstChild.firstChild.textContent='benign historical explanation '.repeat(50);history.append(p);
}
const quoted=doc.createElement('pre');quoted.innerHTML='<div>Error in message stream</div><button>Retry</button><span>Upload limit reached</span>';owned.append(quoted);
const immutable=crypto.createHash('sha256').update(owned.textContent).digest('hex');
let geometry=0,rendered=0;
Object.defineProperty(dom.window.HTMLElement.prototype,'innerText',{get(){
 rendered++;
 assert(this.id==='notice'||this.id==='quota'||this.tagName==='BUTTON','must not read rendered text of a history, prompt, source or unrelated ancestor');
 return this.textContent;
}});
const ctx={document:doc,Node:dom.window.Node,String,latestMessage:()=>({root:owned}),
 norm:s=>String(s).replace(/\s+/g,' ').trim(),elementVisible:n=>{geometry++;return !n.hidden;}};
const from=source.indexOf('  function nbShortNoticeText('),to=source.indexOf('  async function nbRepairFormat(',from);
const quotaStart=source.indexOf('  function nbUploadBlockedNotice('),quotaEnd=source.indexOf('  function nbUploadBlockError(',quotaStart);
vm.createContext(ctx);vm.runInContext(source.slice(from,to)+source.slice(quotaStart,quotaEnd)+'globalThis.check=nbRequestRejection;globalThis.quota=nbUploadBlockedNotice;',ctx);
assert.match(ctx.check({root:owned}),/error in message stream/);
assert.equal(ctx.quota(),'Upload limit reached');
assert(geometry<=6,`matching notices alone get layout measurements: ${geometry}`);
assert(rendered<=6,`matching notices alone get rendered text: ${rendered}`);
doc.getElementById('notice').hidden=true;doc.getElementById('quota').hidden=true;
assert.equal(ctx.check({root:owned}),null);assert.equal(ctx.quota(),null,'hidden and quoted notices cannot trigger recovery/fallback');
assert.equal(crypto.createHash('sha256').update(owned.textContent).digest('hex'),immutable,'large research evidence remains exact and complete');
dom.window.close();
console.log('PASS 4,500 history elements and a 350 KB evidence prompt: no rendered history/source reads, only matching-notice layout checks, hidden/quoted notice isolation and unchanged evidence hash. Structural performance regression, not a claim of zero browser lag.');
