const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {JSDOM}=require(path.join(process.env.NEMESIS_QA_NODE_MODULES||'../../../../../brain-transport/node_modules','jsdom'));
const source=fs.readFileSync(path.join(__dirname,'../contentScript.js'),'utf8');
const a=source.indexOf('  chrome.runtime.onMessage.addListener(',source.indexOf('  async function nbSend('));
const b=source.indexOf("  document.addEventListener('click'",a);
function fixture({url='https://chatgpt.com/c/original',existing=null}={}){
  const dom=new JSDOM('',{url});let listener,receipt=existing;
  const journal={nonce:'real-recovery',newTabId:100,url:'https://chatgpt.com/c/original',jobId:'exact-job',receipt:{id:'exact-job',state:'SENDING',clicked:true,safeUnsent:false,phase:'SEND',at:100}};
  const ctx={URL,location:dom.window.location,chrome:{runtime:{id:'fixture',onMessage:{addListener:fn=>listener=fn}},storage:{local:{get:async()=>({'nb.recovery.worker_1':journal})}}},nbReceipt:()=>receipt,nbSave:r=>receipt=structuredClone(r)};
  vm.createContext(ctx);vm.runInContext(source.slice(a,b),ctx);
  return {journal,receipt:()=>receipt,close:()=>dom.window.close(),restore:(changes={},sender={id:'fixture'})=>new Promise(resolve=>listener({type:'NB_CONTENT_RESTORE',slot:'worker_1',nonce:'real-recovery',tabId:100,...changes},sender,resolve))};
}
(async()=>{
  let f=fixture();assert.equal((await f.restore()).ok,true);assert.deepEqual(f.receipt(),f.journal.receipt,'actual original ambiguity receipt survives renderer loss');assert.equal((await f.restore()).ok,true,'restore is idempotent');f.close();
  for(const changes of [{nonce:'invented'},{tabId:101}]){f=fixture();assert.equal((await f.restore(changes)).ok,false);assert.equal(f.receipt(),null);f.close();}
  for(const sender of [{id:'other-extension'},{id:'fixture',tab:{id:100}}]){f=fixture();assert.equal((await f.restore({},sender)).ok,false);assert.equal(f.receipt(),null);f.close();}
  f=fixture({url:'https://chatgpt.com/c/user-chosen'});assert.equal((await f.restore()).ok,false);assert.equal(f.receipt(),null);f.close();
  f=fixture({existing:{id:'different-job',state:'SENT',clicked:true}});assert.equal((await f.restore()).ok,false);assert.equal(f.receipt().id,'different-job');f.close();
  f=fixture();f.journal.receipt=null;assert.equal((await f.restore()).ok,true);assert.equal(f.receipt(),null,'unknown delivery is never made into a synthetic click receipt');f.close();
  console.log('PASS actual content restore: exact journal nonce/tab/conversation, genuine receipt bytes, idempotence, background-only sender, existing receipt protection and unknown-delivery preservation. OFFLINE ONLY.');
})().catch(e=>{console.error(e);process.exitCode=1;});
