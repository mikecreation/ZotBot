const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../brain-background.js'),'utf8');
const flush=async()=>{for(let i=0;i<100;i++)await new Promise(r=>setImmediate(r));};
const ready={state:'READY',bridgeBuild:'6.2.11',collectorVersion:'6.2.11',transportRevision:'6.2.11-status-scan'};
function fixture(options={}){
  let now=options.now||100000,nextTimer=0,nextTab=100,handler=options.handler;
  const retirements=[];const timers=new Map(),listeners=[],removedListeners=[],updatedListeners=[],alarms=[],messages=[],creates=[],removes=[],reloads=[],results=[],restores=[];
  const names=options.names||['worker_1','worker_2'];
  const store=options.store||{'nb.config':{base:'http://127.0.0.1:8000',token:'fixture',enabled:true,clientId:'fixture-client',slots:Object.fromEntries(names.map((n,i)=>[n,{tabId:i+1,url:'https://chatgpt.com/c/'+(i+1),activeJobId:'job-'+(i+1)}]))}};
  const tabs=options.tabs||{1:{id:1,url:'https://chatgpt.com/c/1',windowId:10,status:'complete'},2:{id:2,url:'https://chatgpt.com/c/2',windowId:10,status:'complete'}};
  const jobs=options.jobs||Object.fromEntries(names.map((n,i)=>[n,{id:'job-'+(i+1),status:'CLAIMED',lease:'original-lease-'+(i+1),packet:'{}'}]));
  const chrome={storage:{local:{get:async key=>({[key]:structuredClone(store[key])}),set:async v=>Object.assign(store,structuredClone(v))}},
    tabs:{get:async id=>{if(!tabs[id])throw Error('No tab');return {...tabs[id]};},query:async()=>Object.values(tabs).map(t=>({...t})),
      create:async changes=>{const id=++nextTab,t={id,status:'complete',...changes};tabs[id]=t;creates.push(t);if(options.stallCreate)return new Promise(()=>{});if(options.onCreate)await options.onCreate(store,t);return {...t};},
      remove:async id=>{removes.push(id);delete tabs[id];for(const f of removedListeners)f(id);},
      reload:async id=>{reloads.push(id);if(options.onReload)options.onReload(id);},
      update:async(id,changes)=>{Object.assign(tabs[id],changes);return {...tabs[id]};},onRemoved:{addListener:fn=>removedListeners.push(fn)},onUpdated:{addListener:fn=>updatedListeners.push(fn)},
      sendMessage:(id,m)=>{messages.push({id,type:m.type});if(m.type==='NB_CONTENT_RESTORE'){restores.push({id,journal:structuredClone(store['nb.recovery.'+m.slot])});return {ok:true};}return handler?handler(id,m):m.type==='NB_CONTENT_STATUS'?ready:{state:'GENERATING',sent:true};}},
    scripting:{executeScript:async options=>{if(options && fixtureOptions.onInject)fixtureOptions.onInject(options);}},
    alarms:{create(){},onAlarm:{addListener:fn=>alarms.push(fn)}},runtime:{id:'fixture',getURL:x=>'chrome-extension://fixture/'+x,onMessage:{addListener:fn=>listeners.push(fn)}}};
  const fixtureOptions=options;
  const ctx={console,URL,AbortSignal,crypto:require('node:crypto').webcrypto,Date:class extends Date{static now(){return now;}},
    setTimeout:(fn,ms)=>{const id=++nextTimer;timers.set(id,{fn,at:now+ms});return id;},clearTimeout:id=>timers.delete(id),chrome,
    fetch:async(url,o)=>{if(options.apiFailure)throw Error('Native server is offline');const body=JSON.parse(o.body);if(url.endsWith('/poll'))return {ok:true,json:async()=>({enabled:true,job:jobs[body.worker_slot],hold:''})};if(url.endsWith('/retire-conversation')){retirements.push({url,body});for(const n of names)if(jobs[n]?.id===url.split('/').at(-2))delete jobs[n];return {ok:true,json:async()=>({ok:true,retired:true,status:'QUARANTINED'})};}results.push({url,body});return {ok:true,json:async()=>({ok:true,status:body.sent?'SENT':'COMPLETE'})};}};
  vm.createContext(ctx);vm.runInContext(source,ctx);
  const f={store,tabs,jobs,retirements,messages,creates,removes,reloads,restores,results,now:()=>now,
    handler:fn=>handler=fn,
    advance:async ms=>{now+=ms;for(const [id,t] of [...timers])if(t.at<=now){timers.delete(id);t.fn();}await flush();},
    tick:async id=>{now+=2000;listeners[0]({type:'NB_TICK'},{tab:{id}},()=>{});await flush();},
    alarm:async()=>{alarms[0]({name:'nb-heartbeat'});await flush();},
    op:(type,extra={},sender={url:'chrome-extension://fixture/brain.html'})=>new Promise(resolve=>listeners[0]({type,...extra},sender,resolve))};
  f.hang=async()=>{await f.tick(1);await f.advance(8001);};return f;
}
async function prolongedHang(f){for(let i=0;i<3;i++){await f.hang();if(i<2)await f.advance(65000);}}
(async()=>{
  for(const name of ['primary','worker_1']){
    const f=fixture({names:[name,'worker_2'],handler:(id,m)=>id===1?new Promise(()=>{}):m.type==='NB_CONTENT_STATUS'?ready:{state:'GENERATING',sent:true}});
    f.store['nb.deliveryFence.1']={id:'job-1',type:'NB_CONTENT_SEND',nonce:'original-ambiguity',at:1};
    f.store['nb.pageHealth.1']={state:'GENERATING',receipt:{id:'job-1',state:'SENT',clicked:true,phase:'WAIT_FOR_GENERATION',at:1}};
    await f.tick(2);assert(f.messages.some(m=>m.id===2&&m.type==='NB_CONTENT_SEND'),'healthy worker continues');
    await f.hang();assert.equal(f.creates.length,0,'one timeout is not a freeze');await f.advance(65000);
    await f.hang();assert.equal(f.creates.length,0,'two checks still do not replace');await f.advance(65000);
    await f.hang();assert.equal(f.creates.length,1);assert.deepEqual(f.removes,[1]);
    const id=f.store['nb.config'].slots[name].tabId;assert.equal(f.tabs[id].url,'https://chatgpt.com/');assert.equal(f.store['nb.config'].slots[name].activeJobId,null);
    assert.equal(f.store['nb.deliveryFence.'+id],null);assert.equal(f.restores.length,0,'old receipt never transplanted into fresh chat');
    assert.equal(f.store['nb.recovery.'+name].receipt.clicked,true,'exact old receipt retained in journal');
    assert.equal(f.store['nb.recovery.'+name].phase,'DONE');assert(!f.messages.some(m=>m.id===id&&m.type==='NB_CONTENT_SEND'),'old request never replayed');
    assert.equal(f.retirements[0].body.lease,'original-lease-1');assert.equal(f.retirements[0].body.old_url,'https://chatgpt.com/c/1');
    await f.tick(id);assert(!f.messages.some(m=>m.id===id&&m.type==='NB_CONTENT_SEND'),'next heartbeat never repeats quarantined job');
    f.jobs[name]={id:'independent-new-job',status:'CLAIMED',lease:'new-lease',packet:'{}'};
    await f.tick(id);assert(f.messages.some(m=>m.id===id&&m.type==='NB_CONTENT_SEND'),'fresh worker can accept independent new work');
  }
  let f=fixture({handler:()=>({...ready,state:'GENERATING',sent:true})});
  for(let i=0;i<6;i++){await f.tick(1);await f.advance(60000);}assert.equal(f.creates.length,0,'long responsive thinking is never treated as a freeze');
  f=fixture({apiFailure:true});for(let i=0;i<5;i++){await f.tick(1);await f.advance(60000);}assert.equal(f.creates.length,0,'Native/network errors are not page hangs');
  let bridgeReady=false,injected=0;
  f=fixture({onInject:()=>{injected++;bridgeReady=true;},handler:(_id,m)=>{if(!bridgeReady)return Promise.reject(Error('Receiving end does not exist'));return m.type==='NB_CONTENT_STATUS'?ready:{state:'GENERATING',sent:true};}});
  await f.tick(1);assert.equal(injected,1);assert.equal(f.creates.length,0,'healthy renderer gets its invalidated extension bridge repaired without replacement');assert(f.messages.some(m=>m.type==='NB_CONTENT_SEND'));
  f=fixture({handler:()=>new Promise(()=>{})});await f.hang();await f.op('NB_PAUSE');await f.advance(180000);await f.alarm();assert.equal(f.creates.length,0,'paused pool never recovers tabs');
  f=fixture({handler:()=>new Promise(()=>{})});await f.hang();await f.advance(65000);f.tabs[1].url='https://chatgpt.com/c/user-navigation';await f.tick(1);await f.advance(180000);await f.alarm();assert.equal(f.creates.length,0,'user navigation is not a hang');
  f=fixture({handler:()=>new Promise(()=>{})});f.store['nb.pageHealth.1']={state:'BLOCKED',detail:'Existing draft preserved; send or clear it to resume'};await prolongedHang(f);assert.equal(f.creates.length,0,'known human draft is preserved');
  f=fixture({stallCreate:true,handler:()=>new Promise(()=>{})});await prolongedHang(f);assert.equal(f.creates.length,1);assert.equal(f.store['nb.recovery.worker_1'].newTabId,null,'simulated worker termination immediately after tab creation');
  const restart=fixture({store:f.store,tabs:f.tabs,jobs:f.jobs,now:f.now()});await restart.alarm();
  assert.equal(restart.creates.length,0,'restart finds the nonce-owned placeholder without a duplicate tab');assert.deepEqual(restart.removes,[1]);assert.equal(restart.store['nb.recovery.worker_1'].phase,'DONE');
  assert.equal(restart.tabs[restart.store['nb.config'].slots.worker_1.tabId].url,'https://chatgpt.com/');assert.equal(restart.retirements.length,1,'restart retires exact old request once');
  f=fixture({onCreate:async store=>{store['nb.config'].enabled=false;},handler:()=>new Promise(()=>{})});await prolongedHang(f);assert(!f.removes.includes(1),'pause during handoff preserves old page');
  f=fixture({handler:()=>new Promise(()=>{})});f.store['nb.watchdog.worker_1']={tabId:1,recoveries:[f.now()-1000,f.now()-500]};await prolongedHang(f);assert.equal(f.creates.length,0);assert.equal(f.store['nb.poolStatus'].worker_1.state,'RECOVERY_BACKOFF');
  const stream={...ready,state:'FAILED',phase:'STREAM_ERROR',error:'ChatGPT error in message stream',sent:true,delivery:{requestId:'job-1',userTurnConfirmed:true,clicked:true}};
  f=fixture({handler:(_id,m)=>m.type==='NB_CONTENT_STATUS'?stream:{state:'GENERATING'}});await f.tick(1);
  assert.deepEqual(f.reloads,[1]);assert.equal(f.creates.length,0);assert(f.store['nb.deliveryFence.1']);assert(f.results.some(r=>r.body.sent));assert(!f.results.some(r=>r.body.error),'refresh precedes terminal failure reporting');
  await f.tick(1);assert.equal(f.reloads.length,1,'repeat stream notice observes cooldown');await f.advance(61000);await f.tick(1);assert.equal(f.reloads.length,2);await f.advance(61000);await f.tick(1);assert.equal(f.reloads.length,2,'same failing job does not loop forever');assert(f.results.some(r=>r.body.error));
  f=fixture({handler:()=>({...stream,delivery:{requestId:'other-job',userTurnConfirmed:false}})});await f.tick(1);assert.equal(f.reloads.length,0,'unowned or quoted error never refreshes');
  f=fixture();f.store['nb.deliveryFence.1']={id:'job-1',nonce:'exact'};
  const receipt={id:'job-1',state:'SENDING',phase:'SEND',clicked:true,safeUnsent:false};
  const checkpoint=await f.op('NB_DELIVERY_CHECKPOINT',{id:'job-1',receipt},{tab:{id:1}});assert(checkpoint.ok);assert.equal(f.store['nb.pageHealth.1'].receipt.clicked,true);
  assert.equal((await f.op('NB_DELIVERY_CHECKPOINT',{id:'other',receipt},{tab:{id:1}})).ok,false,'checkpoint identity cannot be invented');
  // A rebound empty root must collect the same sent job in its original chat.
  f=fixture();f.jobs.worker_1.status='SENT';f.jobs.worker_1.packet=JSON.stringify({STATE:{resume_only:true}});
  f.tabs[1].url='https://chatgpt.com/';f.store['nb.config'].slots.worker_1.url=f.tabs[1].url;
  f.store['nb.jobConversation.job-1']={id:'job-1',identity:'c:original',url:'https://chatgpt.com/c/original',transportRetries:0};
  await f.tick(1);assert.equal(f.tabs[1].url,'https://chatgpt.com/');assert.equal(f.store['nb.config'].slots.worker_1.url,f.tabs[1].url);assert(!f.messages.some(m=>m.type==='NB_CONTENT_SEND'),'restoring fresh conversation never replays a sent request');
  f=fixture({handler:()=>({...ready,state:'BLOCKED',detail:'Existing draft preserved'})});f.jobs.worker_1.status='SENT';f.tabs[1].url='https://chatgpt.com/';f.store['nb.config'].slots.worker_1.url=f.tabs[1].url;f.store['nb.jobConversation.job-1']={identity:'c:original',url:'https://chatgpt.com/c/original'};
  await f.tick(1);assert.equal(f.tabs[1].url,'https://chatgpt.com/','human draft is never navigated away');
  f=fixture();f.jobs.worker_1.status='SENT';f.store['nb.jobConversation.job-1']={identity:'c:original',url:'https://chatgpt.com/c/original'};await f.tick(1);assert.equal(f.tabs[1].url,'https://chatgpt.com/c/1','another conversation is never silently replaced');assert(!f.messages.some(m=>m.type==='NB_CONTENT_SEND'));
  f=fixture();f.store['nb.jobConversation.job-1']={identity:'c:previous',url:'https://chatgpt.com/c/previous',transportRetries:0};f.jobs.worker_1.transport_retries=1;await f.tick(1);assert.equal(f.store['nb.jobConversation.job-1'].identity,'c:1','server-known-unsent retry may use a different worker conversation');assert.equal(f.store['nb.jobConversation.job-1.attempt.0'].identity,'c:previous');assert(f.messages.some(m=>m.type==='NB_CONTENT_SEND'));
  // Resume-only jobs without an old URL must not trap a fresh root either.
  f=fixture();f.jobs.worker_1.status='SENT';f.jobs.worker_1.packet=JSON.stringify({STATE:{resume_only:true}});f.tabs[1].url='https://chatgpt.com/';f.store['nb.config'].slots.worker_1.url=f.tabs[1].url;
  await f.tick(1);assert.equal(f.tabs[1].url,'https://chatgpt.com/');assert.equal(f.retirements.length,1);assert(!f.messages.some(m=>m.type==='NB_CONTENT_SEND'));
  // Completed conversation rollover never occurs mid-generation or over a draft.
  f=fixture();delete f.jobs.worker_1;Object.assign(f.store['nb.config'].slots.worker_1,{activeJobId:null,completedTurns:4});
  await f.tick(1);assert.equal(f.creates.length,1);assert.equal(f.tabs[f.store['nb.config'].slots.worker_1.tabId].url,'https://chatgpt.com/');assert.equal(f.retirements.length,0);
  f=fixture({handler:()=>({...ready,state:'GENERATING'})});Object.assign(f.store['nb.config'].slots.worker_1,{activeJobId:null,completedTurns:4});await f.tick(1);assert.equal(f.creates.length,0);
  f=fixture({handler:()=>({...ready,state:'BLOCKED',detail:'Existing draft preserved'})});Object.assign(f.store['nb.config'].slots.worker_1,{activeJobId:null,completedTurns:4});await f.tick(1);assert.equal(f.creates.length,0);
  // A server that cannot acknowledge retirement never authorizes a fresh send.
  f=fixture({apiFailure:true,handler:()=>new Promise(()=>{})});await prolongedHang(f);assert.equal(f.removes.length,0);assert.equal(f.tabs[1].url,'https://chatgpt.com/c/1');
  // An old build may have copied its ambiguity fence onto an empty root.
  f=fixture();f.jobs.worker_1.status='SENT';f.tabs[1].url='https://chatgpt.com/';f.store['nb.config'].slots.worker_1.url=f.tabs[1].url;
  f.store['nb.deliveryFence.1']={id:'job-1',nonce:'old-fence'};f.store['nb.jobConversation.job-1']={identity:'c:original',url:'https://chatgpt.com/c/original'};
  await f.tick(1);assert.equal(f.retirements.length,1);assert.equal(f.store['nb.deliveryFence.1'],null);assert.equal(f.tabs[1].url,'https://chatgpt.com/');
  // An unfinished old journal that already committed its replacement migrates.
  f=fixture();f.store['nb.recovery.worker_1']={nonce:'journal-old-123456',phase:'LOADING',at:f.now(),oldTabId:50,newTabId:1,jobId:'job-1',url:'https://chatgpt.com/c/1',bindingToken:null,placeholder:'chrome-extension://fixture/recovery.html#journal-old-123456'};
  await f.alarm();assert.equal(f.tabs[1].url,'https://chatgpt.com/');assert.equal(f.retirements.length,1);assert.equal(f.store['nb.config'].slots.worker_1.activeJobId,null);
  console.log('PASS primary/worker fresh-chat replacement, independent next-job delivery, exact lease retirement, journal/legacy-fence migration, completed-turn rollover, restart idempotency, generation/draft/navigation protections and bounded recovery. OFFLINE FAULT INJECTION.');
})().catch(e=>{console.error(e);process.exitCode=1;});
