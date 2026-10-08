/* NEMESIS Brain 6.2.4 — bounded messages and durable delivery ambiguity. */
(() => {
  const KEY='nb.config';
  const STATUS_KEY='nb.status';
  const POOL_STATUS_KEY='nb.poolStatus';
  const SLOT_NAMES=['primary','worker_1','worker_2','worker_3','worker_4'];
  const TRANSPORT_REVISION='6.2.3-editor-transaction';
  const polling=new Set();
  const lastTick=new Map();
  const fenceKey=tabId=>'nb.deliveryFence.'+tabId;
  const lifecycleKey=tabId=>'nb.tabLifecycle.'+tabId;

  // A timeout ends our wait, not the operation in the page. Never infer "unsent"
  // from it. The fence survives service-worker termination and extension reload.
  async function contentMessage(tabId,message){
    const mutation=['NB_CONTENT_SEND','NB_CONTENT_REPAIR_FORMAT'].includes(message.type);
    let fence=null;
    if(mutation){
      if((await chrome.storage.local.get(fenceKey(tabId)))[fenceKey(tabId)])
        throw Error('Previous page submission is unconfirmed; no duplicate send.');
      fence={id:message.job.id,type:message.type,nonce:crypto.randomUUID(),at:Date.now()};
      await chrome.storage.local.set({[fenceKey(tabId)]:fence});
    }
    const limit=mutation?45000:8000;
    let timer;
    try {
      const result=await Promise.race([
        Promise.resolve().then(()=>chrome.tabs.sendMessage(tabId,message)),
        new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('ChatGPT page did not answer '+message.type+' within '+limit/1000+'s. Delivery state preserved; no resend.')),limit);})
      ]);
      if(fence && (result?.sent===true || result?.state==='COMPLETE' || result?.safeUnsent===true))
        await clearFence(tabId,fence);
      return result;
    }finally{clearTimeout(timer);}
  }
  async function clearFence(tabId,fence){
    const key=fenceKey(tabId),current=(await chrome.storage.local.get(key))[key];
    if(current?.nonce===fence.nonce)await chrome.storage.local.set({[key]:null});
  }
  async function reconcileFence(tabId,report){
    const key=fenceKey(tabId),fence=(await chrome.storage.local.get(key))[key];
    if(!fence)return null;
    const d=report?.delivery;
    if(d?.requestId===fence.id && (d.userTurnConfirmed || (!d.sending && d.safeUnsent===true)) &&
       (fence.type!=='NB_CONTENT_REPAIR_FORMAT' || !d.sending && d.formatDeliveryConfirmed)){
      await clearFence(tabId,fence);return null;
    }
    return fence;
  }
  async function keepBoundTabAlive(tab){
    const key=lifecycleKey(tab.id);
    if(tab.autoDiscardable===true){
      if(!(await chrome.storage.local.get(key))[key])await chrome.storage.local.set({[key]:{autoDiscardable:true}});
      await chrome.tabs.update(tab.id,{autoDiscardable:false});
    }
    if(tab.discarded)throw Error('ChatGPT tab was discarded. Restore its conversation before collecting; no automatic reload or resend.');
    // Activation unfreezes an existing tab without focusing its browser window.
    // Never reload a page which may still contain a generating answer or draft.
    if(tab.frozen)await chrome.tabs.update(tab.id,{active:true});
  }
  async function restoreBoundTab(tabId){
    const key=lifecycleKey(tabId),prior=(await chrome.storage.local.get(key))[key];
    if(prior){try{await chrome.tabs.update(tabId,{autoDiscardable:prior.autoDiscardable});}catch{}await chrome.storage.local.set({[key]:null});}
  }

  function baseURL(value){
    const u=new URL(value||'http://127.0.0.1:8000');
    if(u.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(u.hostname)||u.username||u.password||u.search||u.hash||u.pathname!=='/')
      throw Error('Use a loopback HTTP address, such as http://127.0.0.1:8000');
    return u.origin;
  }
  const chat=url=>{try{const u=new URL(url);return u.protocol==='https:'&&['chatgpt.com','chat.openai.com'].includes(u.hostname);}catch{return false;}};
  const chatIdentity=url=>{try{const u=new URL(url);if(!chat(url))return'';const m=u.pathname.match(/(?:^|\/)c\/([^/?#]+)/i);if(m)return'c:'+m[1];if(u.pathname==='/'||u.pathname==='')return'root';return'page:'+u.pathname.replace(/\/+$/,'');}catch{return'';}};
  const roleFor=slot=>slot==='primary'?'primary':'research';

  function normalize(raw={}){
    const c={...raw};
    c.base=c.base||'http://127.0.0.1:8000';
    c.enabled=!!c.enabled;
    c.clientId=c.clientId||crypto.randomUUID();
    c.slots={...(c.slots||{})};
    // Backward compatible migration from the original one-tab binding.
    if(c.tabId && !c.slots.primary)c.slots.primary={tabId:c.tabId,url:c.url||'',activeJobId:c.activeJobId||null,enabled:true};
    for(const name of SLOT_NAMES){
      if(c.slots[name]) c.slots[name]={enabled:true,activeJobId:null,...c.slots[name],role:roleFor(name)};
    }
    delete c.tabId;delete c.url;delete c.activeJobId;
    return c;
  }
  async function config(){const raw=(await chrome.storage.local.get(KEY))[KEY]||{};return normalize(raw);}
  async function save(c){await chrome.storage.local.set({[KEY]:normalize(c)});}
  async function api(c,path,body){
    if(path==='poll')body={...body,extension_build:'6.2.4-scientific-resume'};
    const r=await fetch(baseURL(c.base)+'/api/brain/'+path,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+c.token},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
    const data=await r.json();if(!r.ok)throw Error(data.detail||data.error||'NEMESIS HTTP '+r.status);return data;
  }
  async function apiGet(c,path){
    const r=await fetch(baseURL(c.base)+'/api/brain/'+path,{headers:{'Authorization':'Bearer '+c.token},signal:AbortSignal.timeout(15000)});
    const data=await r.json();if(!r.ok)throw Error(data.detail||data.error||'NEMESIS HTTP '+r.status);return data;
  }
  function boundSlots(c){return SLOT_NAMES.filter(n=>c.slots?.[n]?.tabId);}
  async function dropClosedSlots(c){
    let changed=false;
    for(const name of [...boundSlots(c)]){
      const sc=c.slots?.[name];let tab=null;
      try{tab=await chrome.tabs.get(sc.tabId);}catch{}
      if(tab)continue;
      delete c.slots[name];changed=true;
      await slotState(name,{state:'UNBOUND',detail:'Bound ChatGPT tab was closed; slot released automatically.',url:sc.url||''});
    }
    if(changed)await save(c);
    return c;
  }
  async function slotState(slot,state){
    const obj=(await chrome.storage.local.get(POOL_STATUS_KEY))[POOL_STATUS_KEY]||{};
    obj[slot]={...state,slot,updated:Date.now()};
    await chrome.storage.local.set({[POOL_STATUS_KEY]:obj});
    const bound=Object.values(obj).filter(x=>x&&x.state!=='UNBOUND');
    const primary=obj.primary||{};
    const busy=bound.filter(x=>['COMPOSING','SUBMITTING','GENERATING','BUSY','SENT','WAITING','COLLECTING'].includes(x.state)).length;
    const overall={state:primary.state|| (busy?'BUSY':'READY'),detail:`Brain pool · ${bound.length}/5 bound · ${busy} busy`,pool:obj,updated:Date.now()};
    await chrome.storage.local.set({[STATUS_KEY]:overall});
  }

  function provisionalChatIdentity(value){
    const s=String(value||'');
    try{return s==='root' || decodeURIComponent(s).startsWith('c:local-chatgpt:');}catch{return s==='root' || s.startsWith('c:local-chatgpt%3A');}
  }
  async function validateConversation(c,slotName,slot,tab){
    const current=chatIdentity(tab.url),saved=chatIdentity(slot.url);
    // ChatGPT can bind a brand-new tab under a temporary local-chatgpt identity,
    // then replace that URL with the real /c/<id> as soon as NEMESIS creates the
    // first user turn. That is the SAME tab/conversation bootstrap, not a user
    // navigation. Promote it only while this slot owns an active NEMESIS job.
    if(provisionalChatIdentity(saved)&&current.startsWith('c:')&&slot.activeJobId){
      slot.url=tab.url;await save(c);return current;
    }
    if(saved==='root'&&current.startsWith('c:')){slot.url=tab.url;await save(c);return current;}
    if(saved.startsWith('c:')&&current.startsWith('c:')){
      if(saved!==current)throw Error('Bound tab changed to a different ChatGPT conversation. Restore it or explicitly rebind this slot.');
      if(slot.url!==tab.url){slot.url=tab.url;await save(c);}return current;
    }
    if(saved!=='root'&&saved!==current)throw Error('Bound tab left the bound ChatGPT conversation. Restore it or explicitly rebind this slot.');
    return current;
  }

  async function pollSlot(slotName,{force=false}={}){
    const now=Date.now();if(polling.has(slotName)||(!force&&now-(lastTick.get(slotName)||0)<900))return;
    polling.add(slotName);lastTick.set(slotName,now);
    let c,slot,tab;
    try{
      c=await config();if(!c.enabled)return;slot=c.slots?.[slotName];if(!slot?.tabId)return;
      try{tab=await chrome.tabs.get(slot.tabId);}catch{}
      if(!tab){
        delete c.slots[slotName];await save(c);
        await slotState(slotName,{state:'UNBOUND',detail:'Bound ChatGPT tab was closed; slot released automatically.',url:slot.url||''});
        return;
      }
      if(!chat(tab.url)){
        const st={state:'DISCONNECTED',detail:'Bound Brain tab left ChatGPT. Return it to ChatGPT or explicitly rebind this slot.',url:tab.url||slot.url||''};
        try{await api(c,'poll',{...st,client_id:c.clientId,worker_slot:slotName,role:roleFor(slotName),tab_id:slot.tabId,conversation_id:chatIdentity(slot.url),tab_count:boundSlots(c).length});}catch{}
        await slotState(slotName,st);return;
      }
      const identity=await validateConversation(c,slotName,slot,tab);
      await keepBoundTabAlive(tab);
      let content=await contentMessage(slot.tabId,{type:'NB_CONTENT_STATUS',id:slot.activeJobId});
      const previousFence=await reconcileFence(slot.tabId,content);
      if(content?.collectorVersion!=='6.2.0')throw Error('ChatGPT has an old reply collector. Refresh this ChatGPT tab. Expected 6.2.0; received '+(content?.collectorVersion||'unversioned')+'.');
      if(content?.transportRevision!==TRANSPORT_REVISION)throw Error('Refresh this ChatGPT tab to load transport '+TRANSPORT_REVISION+'.');
      if(content?.bridgeBuild!=='6.2.4')throw Error('Refresh this ChatGPT tab to load Brain 6.2.4 packet-file and rejection detection.');
      const response=await api(c,'poll',{client_id:c.clientId,worker_slot:slotName,role:roleFor(slotName),state:previousFence?'DELIVERY_UNCONFIRMED':content.state,detail:content.detail||'',url:tab.url,tab_id:tab.id,conversation_id:identity,tab_count:boundSlots(c).length});
      const job=response.job;
      if((slot.activeJobId||null)!==(job?.id||null)){slot.activeJobId=job?.id||null;c.slots[slotName]=slot;await save(c);}
      // A server-side Primary review hold outranks the local composer state. Do not
      // show READY below a global PRIMARY_PAUSED_REVIEW banner.
      if(slotName==='primary' && response.hold){
        await slotState(slotName,{...content,state:'HELD',detail:response.hold,job:null,url:tab.url,conversation_id:identity,serverEnabled:response.enabled,hold:response.hold});
        return;
      }
      await slotState(slotName,{...content,job:job?.id||null,url:tab.url,conversation_id:identity,serverEnabled:response.enabled,hold:response.hold||''});
      if(!job)return;

      let s=await contentMessage(slot.tabId,{type:'NB_CONTENT_STATUS',id:job.id});
      const pendingFence=await reconcileFence(slot.tabId,s);
      // A FAILED receipt is normally terminal for this tab because replay after an
      // unknown click could duplicate a user turn. The one exception is a newer
      // server transport attempt that both sides know was never sent. The server
      // increments transport_retries before re-leasing that same job ID.
      const safeRetry=s.state==='FAILED' && !s.transportBlocked && s.safeUnsent===true && job.status!=='SENT' &&
        Number(job.transport_retries||0)>Number(s.transportRetries||0);
      if(s.state==='READY' || safeRetry){
        if(JSON.parse(job.packet||'{}').STATE?.resume_only)s={state:'DELIVERY_UNCONFIRMED',detail:'Restart or deadline: awaiting exact owned turn '+job.id+'. No resend.'};
        else if(job.status==='SENT')s={state:'FAILED',error:'Sent request is missing from this page. Review manually; no resend.',clicked:true,safeUnsent:false,phase:'SENT_REQUEST_MISSING'};
        else if(pendingFence)s={state:'DELIVERY_UNCONFIRMED',detail:'Previous page submission '+pendingFence.id+' remains unconfirmed. No duplicate send.'};
        else s=await contentMessage(slot.tabId,{type:'NB_CONTENT_SEND',job});
      }
      if(s.state==='NEEDS_FORMAT'&&!pendingFence)s=await contentMessage(slot.tabId,{type:'NB_CONTENT_REPAIR_FORMAT',job:{id:job.id}});
      const lease={client_id:c.clientId,lease:job.lease};
      if(s.state==='COMPLETE'){
        const accepted=await api(c,'jobs/'+job.id+'/result',{...lease,result:s.result});
        if(!accepted.ok||accepted.status!=='COMPLETE')throw Error('NEMESIS did not accept collected reply: '+(accepted.status||'unknown')+'.');
      }else if(s.state==='FAILED' || (s.state==='TRANSPORT_BLOCKED' && s.safeUnsent===true)){
        const safeUnsent=s.safeUnsent===true;
        const clicked=s.clicked===true;
        const phase=String(s.phase||'');
        await api(c,'jobs/'+job.id+'/result',{...lease,error:s.error||'Brain worker failed',safe_unsent:safeUnsent,clicked,phase,
          transport:{safe_unsent:safeUnsent,clicked,phase,transport_retries:Number(s.transportRetries||0),
            transport_blocked:s.transportBlocked===true,revision:s.transportRevision||'',retry_after:s.retryAfter||null}});
      }else if(s.sent&&job.status!=='SENT'){
        await api(c,'jobs/'+job.id+'/result',{...lease,sent:true});
      }
      await api(c,'poll',{client_id:c.clientId,worker_slot:slotName,role:roleFor(slotName),state:s.state,detail:s.detail||s.error||'',request_id:job.id,url:tab.url,tab_id:tab.id,conversation_id:identity,tab_count:boundSlots(c).length});
      await slotState(slotName,{...s,job:job.id,url:tab.url,conversation_id:identity,serverEnabled:response.enabled});
    }catch(e){
      const failure={state:'ERROR',detail:'Brain pool 6.2.4: '+String(e.message||e),url:tab?.url||slot?.url||''};await slotState(slotName,failure);
      if(c?.enabled&&slot){try{await api(c,'poll',{...failure,client_id:c.clientId,worker_slot:slotName,role:roleFor(slotName),tab_id:slot.tabId,conversation_id:chatIdentity(slot.url),tab_count:boundSlots(c).length});}catch{}}
    }finally{polling.delete(slotName);}
  }
  async function pollAll(){let c=await config();if(!c.enabled)return;c=await dropClosedSlots(c);await Promise.allSettled(boundSlots(c).map(n=>pollSlot(n)));}

  chrome.alarms.create('nb-heartbeat',{periodInMinutes:.5});
  chrome.alarms.onAlarm.addListener(a=>{if(a.name==='nb-heartbeat')void pollAll();});
  chrome.tabs.onRemoved.addListener(tabId=>{void (async()=>{
    const c=await config();let changed=false;
    for(const name of SLOT_NAMES){
      if(c.slots?.[name]?.tabId!==tabId)continue;
      delete c.slots[name];changed=true;
      await slotState(name,{state:'UNBOUND',detail:'Bound ChatGPT tab was closed; slot released automatically.'});
    }
    if(changed)await save(c);
  })();});
  chrome.runtime.onMessage.addListener((m,sender,reply)=>{
    if(!m?.type?.startsWith('NB_'))return false;
    if(m.type==='NB_AUTHORIZE_SEND'){
      (async()=>{
        const c=await config(),name=SLOT_NAMES.find(n=>c.slots?.[n]?.tabId===sender.tab?.id);
        if(!c.enabled || !name || !m.job?.id)return {ok:false};
        const tab=await chrome.tabs.get(sender.tab.id);
        await validateConversation(c,name,c.slots[name],tab);
        return api(c,'jobs/'+m.job.id+'/authorize-send',{client_id:c.clientId,lease:m.job.lease,worker_slot:name});
      })().then(reply).catch(()=>reply({ok:false}));return true;
    }
    if(m.type==='NB_TICK'){
      config().then(c=>{const slot=SLOT_NAMES.find(n=>c.slots?.[n]?.tabId===sender.tab?.id);if(slot)void pollSlot(slot);});reply({ok:true});return false;
    }
    if(!sender.url?.startsWith(chrome.runtime.getURL('')))return false;
    (async()=>{
      if(m.type==='NB_GET'){const c=await dropClosedSlots(await config());return {config:c,status:(await chrome.storage.local.get(STATUS_KEY))[STATUS_KEY],poolStatus:(await chrome.storage.local.get(POOL_STATUS_KEY))[POOL_STATUS_KEY]||{}};}
      if(m.type==='NB_RESEARCH_GET'){const c=await config();if(!c.token)throw Error('Pair with NEMESIS first');return {ok:true,research:await api(c,'research/status',{})};}
      if(m.type==='NB_RESEARCH_CONFIG'){const c=await config();if(!c.token)throw Error('Pair with NEMESIS first');const body={};if('enabled'in m)body.enabled=!!m.enabled;if('multi'in m)body.multi=!!m.multi;return {ok:true,research:await api(c,'research/configure',body)};}
      if(m.type==='NB_DIAGNOSTICS'){
        const c=await dropClosedSlots(await config());const slots={};
        for(const name of boundSlots(c)){
          const sc=c.slots[name];let tab=null,content=null;try{tab=await chrome.tabs.get(sc.tabId);if(tab&&chat(tab.url))content=await contentMessage(sc.tabId,{type:'NB_CONTENT_DIAGNOSTICS'});}catch(e){content={error:String(e.message||e)}}
          slots[name]={role:roleFor(name),tabId:sc.tabId,savedIdentity:chatIdentity(sc.url),currentIdentity:chatIdentity(tab?.url||''),sameConversation:!!tab&&chatIdentity(sc.url)===chatIdentity(tab.url),url:tab?.url||sc.url,frozen:tab?.frozen,discarded:tab?.discarded,autoDiscardable:tab?.autoDiscardable,deliveryFence:(await chrome.storage.local.get(fenceKey(sc.tabId)))[fenceKey(sc.tabId)]||null,collector:content};
        }
        let research=null,pool=null;try{research=await api(c,'research/status',{});}catch(e){research={error:String(e.message||e)}}try{pool=await apiGet(c,'pool');}catch(e){pool={error:String(e.message||e)}}
        return {ok:true,diagnostics:{at:Date.now(),bridgeStatus:(await chrome.storage.local.get(STATUS_KEY))[STATUS_KEY]||null,poolStatus:(await chrome.storage.local.get(POOL_STATUS_KEY))[POOL_STATUS_KEY]||{},slots,research,serverPool:pool}};
      }
      if(m.type==='NB_BIND'){
        const old=await config();const name=SLOT_NAMES.includes(m.slot)?m.slot:'primary';const tab=await chrome.tabs.get(Number(m.tabId));if(!chat(tab.url))throw Error('Choose an existing ChatGPT tab');
        const previousTabId=old.slots?.[name]?.tabId;
        if(!String(m.token||old.token||'').trim())throw Error('Paste the token from NEMESIS Brain settings');
        for(const other of SLOT_NAMES){if(other!==name&&old.slots?.[other]?.tabId===tab.id)throw Error('That ChatGPT tab is already bound to '+other+'.');}
        old.base=baseURL(m.base||old.base);old.token=String(m.token||old.token).trim();old.enabled=true;old.clientId=old.clientId||crypto.randomUUID();old.slots=old.slots||{};old.slots[name]={tabId:tab.id,url:tab.url,enabled:true,role:roleFor(name),activeJobId:null};
        await chrome.scripting.executeScript({target:{tabId:tab.id},files:['contentScript.js']}).catch(()=>{});
        const ts=await contentMessage(tab.id,{type:'NB_CONTENT_STATUS'});if(ts?.collectorVersion!=='6.2.0')throw Error('Refresh this ChatGPT tab to load reply collector 6.2.0, then bind again.');if(!ts?.state)throw Error('ChatGPT content bridge did not respond.');
        await api(old,'poll',{client_id:old.clientId,worker_slot:name,role:roleFor(name),state:'PAIRING',tab_id:tab.id,url:tab.url,conversation_id:chatIdentity(tab.url),tab_count:boundSlots(old).length});
        if(previousTabId&&previousTabId!==tab.id)await restoreBoundTab(previousTabId);
        await save(old);await pollSlot(name,{force:true});return {ok:true,slot:name,status:ts};
      }
      if(m.type==='NB_UNBIND'){
        const c=await config();const name=SLOT_NAMES.includes(m.slot)?m.slot:'worker_1';if(c.slots?.[name]){await restoreBoundTab(c.slots[name].tabId);delete c.slots[name];}await save(c);await slotState(name,{state:'UNBOUND',detail:'Slot unbound'});return {ok:true};
      }
      if(m.type==='NB_PAUSE'){const c=await config();c.enabled=false;await save(c);await Promise.allSettled(boundSlots(c).map(n=>restoreBoundTab(c.slots[n].tabId)));return {ok:true};}
      if(m.type==='NB_RESUME'){const c=await config();c.enabled=true;await save(c);void pollAll();return {ok:true};}
      if(m.type==='NB_TRANSPORT_RETRY'){
        const c=await config(),name=SLOT_NAMES.includes(m.slot)?m.slot:null;
        if(!name || !c.slots[name]?.tabId)throw Error('Choose a bound slot');
        const tab=await chrome.tabs.get(c.slots[name].tabId);
        await validateConversation(c,name,c.slots[name],tab);
        await contentMessage(tab.id,{type:'NB_CONTENT_TRANSPORT_RETRY'});
        void pollSlot(name,{force:true});return {ok:true};
      }
      if(m.type==='NB_CAPTURE'){
        const c=await config();if(!c.token)throw Error('Pair with NEMESIS first');const payload={capture:m.capture,trust:'UNTRUSTED_PAGE_CONTENT',scientific_evidence:false,screenshot:null};const[active]=await chrome.tabs.query({active:true,lastFocusedWindow:true});if(m.screenshot&&active?.url===m.capture?.page?.url){try{payload.screenshot={kind:'visible_viewport',url:active.url,data:await chrome.tabs.captureVisibleTab(active.windowId,{format:'jpeg',quality:75})};}catch(e){payload.screenshot_error=e.message;}}return api(c,'perception',payload);
      }
      throw Error('Unknown Brain operation');
    })().then(reply).catch(e=>reply({ok:false,error:String(e.message||e)}));return true;
  });
})();
