const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../brain-background.js'),'utf8');
const flush=async()=>{for(let i=0;i<40;i++)await new Promise(r=>setImmediate(r));};
function fixture(options={}){
  let now=100000,nextTimer=0;const timers=new Map(),listeners=[],polls=[],sends=[],updates=[],results=[];
  const store=options.store||{'nb.config':{base:'http://127.0.0.1:8000',token:'fixture',enabled:true,clientId:'fixture-client-123456',slots:{worker_1:{tabId:1,url:'https://chatgpt.com/c/one',activeJobId:'job-one'},worker_2:{tabId:2,url:'https://chatgpt.com/c/two',activeJobId:'job-two'}}}};
  const jobs={1:{id:'job-one',status:'CLAIMED',lease:'fixture',packet:'{}'},2:{id:'job-two',status:'CLAIMED',lease:'fixture',packet:'{}'}};
  let handler=options.handler||((_id,m)=>m.type==='NB_CONTENT_STATUS'?{state:'READY',bridgeBuild:'6.2.8',collectorVersion:'6.2.8',transportRevision:'6.2.8-text-first'}:{state:'GENERATING',sent:true});
  const tabs={1:{id:1,url:'https://chatgpt.com/c/one',...options.tab},2:{id:2,url:'https://chatgpt.com/c/two'}};
  const ctx={console,URL,AbortSignal,crypto:require('node:crypto').webcrypto,
    Date:class extends Date{static now(){return now;}},
    setTimeout:(fn,ms)=>{const id=++nextTimer;timers.set(id,{fn,at:now+ms});return id;},clearTimeout:id=>timers.delete(id),
    chrome:{storage:{local:{get:async k=>({[k]:store[k]}),set:async value=>Object.assign(store,value)}},
      tabs:{get:async id=>tabs[id],update:async(id,changes)=>{updates.push({id,...changes});Object.assign(tabs[id],changes);return tabs[id];},onRemoved:{addListener(){}},
        sendMessage:(id,m)=>{sends.push({id,type:m.type});return handler(id,m);}},
      alarms:{create(){},onAlarm:{addListener(){}}},runtime:{getURL:x=>'chrome-extension://fixture/'+x,onMessage:{addListener:fn=>listeners.push(fn)}}},
    fetch:async(url,o)=>{const body=JSON.parse(o.body);if(url.endsWith('/poll')){polls.push(body);return {ok:true,json:async()=>({enabled:true,job:jobs[body.tab_id],hold:''})};}results.push(body);return {ok:true,json:async()=>({ok:true,status:body.sent?'SENT':'COMPLETE'})};}
  };
  vm.createContext(ctx);vm.runInContext(source,ctx);
  return {store,polls,sends,updates,results,jobs,timers,
    handler:fn=>{handler=fn;},tick:async id=>{now+=2000;listeners[0]({type:'NB_TICK'},{tab:{id}},()=>{});await flush();},
    advance:async ms=>{now+=ms;for(const [id,t] of [...timers])if(t.at<=now){timers.delete(id);t.fn();}await flush();},
    operation:async type=>new Promise(resolve=>listeners[0]({type},{url:'chrome-extension://fixture/brain.html'},resolve))};
}
const ready={state:'READY',bridgeBuild:'6.2.8',collectorVersion:'6.2.8',transportRevision:'6.2.8-text-first'};
(async()=>{
  let f=fixture({handler:(id,m)=>id===1?new Promise(()=>{}):m.type==='NB_CONTENT_STATUS'?ready:{state:'GENERATING',sent:true}});
  await Promise.all([f.tick(1),f.tick(2)]);assert(f.sends.some(s=>s.id===2&&s.type==='NB_CONTENT_SEND'),'a stuck page must not stall another slot');
  await f.advance(8001);assert(f.polls.some(p=>p.tab_id===1&&p.state==='ERROR'),'status timeout must reach server heartbeat');
  const old=f.sends.filter(s=>s.id===1).length;await f.tick(1);assert.equal(f.sends.filter(s=>s.id===1).length,old+1,'polling lock must be released after timeout');
  f=fixture({handler:(_id,m)=>m.type==='NB_CONTENT_SEND'?new Promise(()=>{}):ready});
  await f.tick(1);assert(f.store['nb.deliveryFence.1']);await f.advance(45001);await f.tick(1);
  assert.equal(f.sends.filter(s=>s.type==='NB_CONTENT_SEND').length,1,'timed-out send must never be repeated');
  const restart=fixture({store:f.store});await restart.tick(1);assert(!restart.sends.some(s=>s.type==='NB_CONTENT_SEND'),'fence must survive service-worker restart');
  restart.handler((_id,m)=>({...ready,state:'COLLECTING',sent:true,delivery:{requestId:m.id,userTurnConfirmed:true,sending:false}}));
  await restart.tick(1);assert.equal(restart.store['nb.deliveryFence.1'],null);assert(restart.results.some(r=>r.sent),'confirmed user turn must reconcile original delivery');
  const owned={protocol:'pandora-language/1',request_id:'job-one',RETURN:{status:'complete',text:'exact owned response',evidence:[]}};
  f=fixture();f.store['nb.deliveryFence.1']={id:'job-one',type:'NB_CONTENT_SEND',nonce:'exact-fence'};
  f.jobs[1].status='SENT';f.jobs[1].packet=JSON.stringify({STATE:{resume_only:true}});
  f.handler((_id,m)=>({...ready,state:'COMPLETE',result:owned,delivery:{requestId:m.id,receiptId:m.id,responseConfirmed:true,userTurnConfirmed:false,clicked:true,sending:false}}));
  await f.tick(1);assert.equal(f.store['nb.deliveryFence.1'],null,'an exact owned completed response reconciles the fence without a user DOM turn');
  assert(f.results.some(r=>r.result?.request_id==='job-one'),'recovered response reaches original server lease');
  assert(!f.sends.some(s=>s.type==='NB_CONTENT_SEND'),'restart collection must never resend');
  for(const changes of [{request_id:'wrong'},{RETURN:{status:'working',text:'partial'}}]){
    f=fixture();f.store['nb.deliveryFence.1']={id:'job-one',type:'NB_CONTENT_SEND',nonce:'exact-fence'};
    f.handler((_id,m)=>({...ready,state:'COMPLETE',result:{...owned,...changes},delivery:{requestId:m.id,receiptId:m.id,responseConfirmed:true,clicked:true,sending:false}}));
    await f.tick(1);assert(f.store['nb.deliveryFence.1'],'invalid response cannot clear delivery fence');
    assert(!f.sends.some(s=>s.type==='NB_CONTENT_SEND'));
  }
  f=fixture();f.store['nb.deliveryFence.1']={id:'job-one',type:'NB_CONTENT_REPAIR_FORMAT',nonce:'format-fence'};
  f.handler((_id,m)=>({...ready,state:'COMPLETE',result:owned,delivery:{requestId:m.id,receiptId:m.id,responseConfirmed:true,clicked:true,sending:false}}));
  await f.tick(1);assert(f.store['nb.deliveryFence.1'],'format recovery retains its separate user-turn confirmation requirement');
  f=fixture({tab:{frozen:true,autoDiscardable:true}});await f.tick(1);
  assert(f.updates.some(u=>u.id===1&&u.active===true));assert(f.updates.some(u=>u.id===1&&u.autoDiscardable===false));assert(!f.updates.some(u=>u.id!==1));
  await f.operation('NB_PAUSE');assert(f.updates.some(u=>u.id===1&&u.autoDiscardable===true),'pause must restore original discard preference');
  f=fixture({tab:{discarded:true}});await f.tick(1);assert.equal(f.sends.length,0,'discarded conversation must never be reloaded or resent');assert(f.polls.some(p=>p.state==='ERROR'));
  f=fixture({handler:(_id,m)=>m.type==='NB_CONTENT_SEND'?Promise.reject(Error('Channel closed after possible click')):ready});await f.tick(1);assert(f.store['nb.deliveryFence.1']);
  f.handler(()=>({...ready,delivery:{requestId:'different-job',safeUnsent:true,sending:false}}));await f.tick(1);assert(f.store['nb.deliveryFence.1'],'another request receipt cannot clear fence');assert.equal(f.sends.filter(s=>s.type==='NB_CONTENT_SEND').length,1);
  f.handler((_id,m)=>({...ready,state:'FAILED',safeUnsent:true,clicked:false,transportRetries:0,delivery:{requestId:m.id,safeUnsent:true,sending:false}}));f.jobs[1].transport_retries=1;await f.tick(1);
  assert.equal(f.sends.filter(s=>s.type==='NB_CONTENT_SEND').length,2,'independent exact known-unsent receipt and newer lease permit retry');
  f=fixture();f.jobs[1].packet=JSON.stringify({STATE:{resume_only:true}});await f.tick(1);
  assert(!f.sends.some(s=>s.type==='NB_CONTENT_SEND'),'restart ambiguity must never send a new turn');
  assert(f.polls.every(p=>p.extension_build==='6.2.8-text-first'),'server must observe loaded background revision');
  console.log('PASS bounded hung status/send, independent slots, heartbeat, restart fence, exact receipt reconciliation, lifecycle wake/restore, discarded-page preservation, safe retry, and collection-only server restart. Offline fault injection; live acceptance remains separate.');
})().catch(e=>{console.error(e);process.exitCode=1;});
