/* NEMESIS Brain 6.2.13 — exact completed-fence reconciliation. */
(() => {
  const KEY='nb.config';
  const STATUS_KEY='nb.status';
  const POOL_STATUS_KEY='nb.poolStatus';
  const SLOT_NAMES=['primary','worker_1','worker_2','worker_3','worker_4'];
  const TRANSPORT_REVISION='6.2.11-status-scan';
  const BACKGROUND_BUILD='6.2.13-fresh-chat';
  const polling=new Set();
  const lastTick=new Map();
  const fenceKey=tabId=>'nb.deliveryFence.'+tabId;
  const lifecycleKey=tabId=>'nb.tabLifecycle.'+tabId;
  const healthKey=tabId=>'nb.pageHealth.'+tabId;
  const recoveryKey=name=>'nb.recovery.'+name;
  const watchdogKey=name=>'nb.watchdog.'+name;
  const streamKey=name=>'nb.streamRecovery.'+name;
  const recovering=new Set();
  const bridgeInjectedAt=new Map();
  let configWrites=Promise.resolve();
  let statusWrites=Promise.resolve();
  const HANG_AFTER_MS=120000, MIN_HANG_FAILURES=3, RECOVERY_WINDOW_MS=900000;
  // Both the slot lease and the page's real receipt survive renderer replacement.
  // A fence is ambiguity, never proof that a submission was or wasn't clicked.
  function retainedReceipt(value,id){
    if(!value || value.id!==id || JSON.stringify(value).length>1100000)return null;
    const out={id};
    for(const key of ['state','phase','clicked','safeUnsent','transportRetries','formatAttempts','priorUserCount','at','responseOwnership','transport','promptChars'])
      if(key in value)out[key]=value[key];
    if(typeof value.error==='string')out.error=value.error.slice(0,2000);
    if(value.state==='COMPLETE' && value.result?.protocol==='pandora-language/1' && value.result.request_id===id &&
       value.result.RETURN?.status==='complete' && typeof value.result.RETURN.text==='string' && value.result.RETURN.text.trim())out.result=value.result;
    if(out.state==='COMPLETE'&&!out.result)return null;
    return out;
  }
  async function cacheHealth(tabId,report){
    const c=await config(),name=SLOT_NAMES.find(n=>c.slots?.[n]?.tabId===tabId);
    if(!name)return;
    const prior=(await chrome.storage.local.get(healthKey(tabId)))[healthKey(tabId)]||{};
    const id=c.slots[name].activeJobId,receipt=retainedReceipt(report.recoveryReceipt,id);
    await chrome.storage.local.set({[healthKey(tabId)]:{at:Date.now(),state:report.state,detail:report.detail||'',receipt:receipt||prior.receipt||null}});
    const w=(await chrome.storage.local.get(watchdogKey(name)))[watchdogKey(name)]||{};
    await chrome.storage.local.set({[watchdogKey(name)]:{...w,tabId,failures:0,firstFailure:null,lastHealthy:Date.now()}});
  }

  // A timeout ends our wait, not the operation in the page. Never infer "unsent"
  // from it. The fence survives service-worker termination and extension reload.
  async function contentMessage(tabId,message,{injected=false}={}){
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
        new Promise((_,reject)=>{timer=setTimeout(()=>{const e=Error('ChatGPT page did not answer '+message.type+' within '+limit/1000+'s. Delivery state preserved; no resend.');e.pageUnresponsive=true;e.tabId=tabId;reject(e);},limit);})
      ]);
      if(fence && (result?.sent===true || result?.state==='COMPLETE' || result?.safeUnsent===true))
        await clearFence(tabId,fence);
      if(message.type==='NB_CONTENT_STATUS' && result?.state)await cacheHealth(tabId,result);
      return result;
    }catch(e){
      const missing=/Receiving end does not exist|Could not establish connection/i.test(String(e.message||e));
      if(missing && !mutation && !injected && message.type==='NB_CONTENT_STATUS' &&
         Date.now()-(bridgeInjectedAt.get(tabId)||0)>=60000){
        // An extension reload can invalidate an otherwise healthy page bridge.
        // Repair that bridge before treating the renderer as hung. Never repeat
        // a SEND message, and bound injection itself in case the renderer froze.
        bridgeInjectedAt.set(tabId,Date.now());let injectionTimer;
        try{
          await Promise.race([chrome.scripting.executeScript({target:{tabId},files:['contentScript.js']}),
            new Promise((_,reject)=>{injectionTimer=setTimeout(()=>{const failure=Error('Page bridge injection did not respond');failure.pageUnresponsive=true;failure.tabId=tabId;reject(failure);},8000);})]);
          return await contentMessage(tabId,message,{injected:true});
        }finally{clearTimeout(injectionTimer);}
      }
      if(missing || /message port closed|channel closed/i.test(String(e.message||e))){e.pageUnresponsive=true;e.tabId=tabId;}
      throw e;
    }finally{clearTimeout(timer);}
  }
  async function clearFence(tabId,fence){
    const key=fenceKey(tabId),current=(await chrome.storage.local.get(key))[key];
    if(current?.nonce===fence.nonce)await chrome.storage.local.set({[key]:null});
  }
  async function reconcileFence(tabId,report){
    const key=fenceKey(tabId),fence=(await chrome.storage.local.get(key))[key];
    if(!fence)return null;
    // Once the server accepts a result, its active lease disappears. A generic
    // READY page report does not inspect the retained request. Probe that exact
    // fence ID before declaring this slot ambiguous forever. Status only: no
    // editor changes, replay, format send, lease reset, or server result write.
    if(report?.state==='READY' || report?.delivery?.requestId!==fence.id)
      report=await contentMessage(tabId,{type:'NB_CONTENT_STATUS',id:fence.id});
    const d=report?.delivery;
    const ownedResponse=report?.state==='COMPLETE' && d?.responseConfirmed===true &&
      d.receiptId===fence.id && d.clicked===true && !d.sending &&
      report.result?.protocol==='pandora-language/1' && report.result.request_id===fence.id &&
      report.result.RETURN?.status==='complete' && typeof report.result.RETURN.text==='string' && report.result.RETURN.text.trim();
    if(d?.requestId===fence.id && (d.userTurnConfirmed || ownedResponse || (!d.sending && d.safeUnsent===true)) &&
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
    if(tab.discarded){const e=Error('ChatGPT tab was discarded; watchdog is preserving the job before replacement.');e.pageUnresponsive=true;e.tabId=tab.id;throw e;}
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
  function editConfig(edit){
    const run=configWrites.then(async()=>{const current=await config();const value=await edit(current);current.revision=Number(current.revision||0)+1;await chrome.storage.local.set({[KEY]:normalize(current)});return value;});
    configWrites=run.catch(()=>{});return run;
  }
  async function save(c){return editConfig(current=>{if(Number(current.revision||0)!==Number(c.revision||0))throw Error('Brain binding changed concurrently; retry using current configuration');Object.assign(current,normalize(c));});}
  async function updateSlot(name,expectedTabId,changes){
    return editConfig(c=>{if(!c.enabled || c.slots?.[name]?.tabId!==expectedTabId)throw Error('Brain slot binding changed; old poll retired');Object.assign(c.slots[name],changes);});
  }
  async function api(c,path,body){
    if(path==='poll')body={...body,extension_build:BACKGROUND_BUILD};
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
      const journal=(await chrome.storage.local.get(recoveryKey(name)))[recoveryKey(name)];
      if(journal && !['DONE','CANCELLED'].includes(journal.phase))continue;
      await editConfig(current=>{if(current.slots?.[name]?.tabId===sc.tabId)delete current.slots[name];});changed=true;
      await slotState(name,{state:'UNBOUND',detail:'Bound ChatGPT tab was closed; slot released automatically.',url:sc.url||''});
    }
    return changed?config():c;
  }
  function slotState(slot,state){
    const run=statusWrites.then(async()=>{
    const obj=(await chrome.storage.local.get(POOL_STATUS_KEY))[POOL_STATUS_KEY]||{};
    obj[slot]={...state,slot,updated:Date.now()};
    await chrome.storage.local.set({[POOL_STATUS_KEY]:obj});
    const bound=Object.values(obj).filter(x=>x&&x.state!=='UNBOUND');
    const primary=obj.primary||{};
    const busy=bound.filter(x=>['COMPOSING','SUBMITTING','GENERATING','BUSY','SENT','WAITING','COLLECTING'].includes(x.state)).length;
    const overall={state:primary.state|| (busy?'BUSY':'READY'),detail:`Brain pool · ${bound.length}/5 bound · ${busy} busy`,pool:obj,updated:Date.now()};
    await chrome.storage.local.set({[STATUS_KEY]:overall});
    });statusWrites=run.catch(()=>{});return run;
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
      slot.url=tab.url;await updateSlot(slotName,slot.tabId,{url:tab.url});return current;
    }
    if(saved==='root'&&current.startsWith('c:')){slot.url=tab.url;await updateSlot(slotName,slot.tabId,{url:tab.url});return current;}
    if(saved.startsWith('c:')&&current.startsWith('c:')){
      if(saved!==current)throw Error('Bound tab changed to a different ChatGPT conversation. Restore it or explicitly rebind this slot.');
      if(slot.url!==tab.url){slot.url=tab.url;await updateSlot(slotName,slot.tabId,{url:tab.url});}return current;
    }
    if(saved!=='root'&&saved!==current)throw Error('Bound tab left the bound ChatGPT conversation. Restore it or explicitly rebind this slot.');
    return current;
  }

  async function recoveryState(name,j,detail){
    await slotState(name,{state:'RECOVERING',detail,job:j.jobId,url:j.url,recovery:{phase:j.phase,oldTabId:j.oldTabId,newTabId:j.newTabId,started:j.at}});
  }
  async function retireForFreshChat(c,name,j){
    if(j.retired)return;
    // An explicitly rebound tab can have no local activeJobId while Native
    // still owns the old claim. Check Native even during idle rollover.
    if(!j.jobId){
      const r=await api(c,'poll',{client_id:c.clientId,worker_slot:name,role:roleFor(name),state:'RECOVERING'});
      if(r.job){j.jobId=r.job.id;j.job=r.job;await chrome.storage.local.set({[recoveryKey(name)]:j});}
    }
    if(j.jobId){
      // RECOVERING cannot claim a new queued request. It only returns the
      // existing lease; use that exact lease, never invent a replacement.
      let job=j.job;
      if(!job){const r=await api(c,'poll',{client_id:c.clientId,worker_slot:name,role:roleFor(name),state:'RECOVERING',recovery_request_id:j.jobId});job=r.job;}
      if(job?.id===j.jobId){
        j.job=job;await chrome.storage.local.set({[recoveryKey(name)]:j});
        if(j.receipt?.state==='COMPLETE' && j.receipt.result){
          const accepted=await api(c,'jobs/'+job.id+'/result',{client_id:c.clientId,lease:job.lease,result:j.receipt.result});
          if(!accepted.ok || accepted.status!=='COMPLETE')throw Error('Native did not accept the retained completed reply');
        }
        const result=await api(c,'jobs/'+job.id+'/retire-conversation',{client_id:c.clientId,lease:job.lease,worker_slot:name,recovery_id:j.nonce,old_url:j.oldUrl});
        if(!result.ok || !result.retired)throw Error('Native did not acknowledge conversation retirement');
      }else if(job){throw Error('Slot lease changed during recovery; preserving both conversations');}
      else throw Error('Native cannot locate the exact old request; retirement remains pending');
    }
    j.retired=true;await chrome.storage.local.set({[recoveryKey(name)]:j});
  }

  async function finishRecovery(name,j){
    // Migrate unfinished journals from the same-URL recovery build.
    j.oldUrl=j.oldUrl||j.url;j.url='https://chatgpt.com/';j.mode='FRESH_CHAT';
    if(!('expectedActiveJobId' in j))j.expectedActiveJobId=j.jobId||null;
    let c=await config(),slot=c.slots?.[name];
    if(!c.enabled || !slot || (slot.bindingToken||null)!==j.bindingToken || ![j.oldTabId,j.newTabId].includes(slot.tabId)){
      j.phase='CANCELLED';j.detail='Paused or explicitly rebound; recovery cancelled';
      await chrome.storage.local.set({[recoveryKey(name)]:j});
      if(j.newTabId){try{const tab=await chrome.tabs.get(j.newTabId);if(tab?.url===j.placeholder)await chrome.tabs.remove(j.newTabId);}catch{}}
      return false;
    }
    if(!j.newTabId){
      // First open an extension-owned placeholder. Its nonce lets a restarted
      // service worker find the same tab after create() but before journaling.
      const candidates=await chrome.tabs.query({});
      const existing=candidates.find(t=>t.url===j.placeholder);
      const made=existing||await chrome.tabs.create({url:j.placeholder,active:false,...(j.windowId?{windowId:j.windowId}:{})});
      j.newTabId=made.id;j.phase='CREATED';await chrome.storage.local.set({[recoveryKey(name)]:j});
      c=await config();slot=c.slots?.[name];
      if(!c.enabled || !slot || (slot.bindingToken||null)!==j.bindingToken || slot.tabId!==j.oldTabId){
        j.phase='CANCELLED';j.detail='Pool paused or rebound while opening replacement';await chrome.storage.local.set({[recoveryKey(name)]:j});
        const tab=await chrome.tabs.get(j.newTabId);if(tab?.url===j.placeholder)await chrome.tabs.remove(j.newTabId);return false;
      }
    }
    if(slot.tabId===j.oldTabId){
      let old=null;try{old=await chrome.tabs.get(j.oldTabId);}catch{}
      if(old && (!chat(old.url)||chatIdentity(old.url)!==chatIdentity(j.oldUrl))){
        j.phase='CANCELLED';j.detail='User navigated the old tab; it was preserved';await chrome.storage.local.set({[recoveryKey(name)]:j});
        try{await chrome.tabs.remove(j.newTabId);}catch{}return false;
      }
      // Fence the old renderer before asking Native to detach its lease.
      await updateSlot(name,j.oldTabId,{recoveryPending:j.nonce});
      await retireForFreshChat(c,name,j);
      await chrome.storage.local.set({[fenceKey(j.newTabId)]:null});
      await editConfig(current=>{
        const bound=current.slots?.[name];
        if(!current.enabled || bound?.tabId!==j.oldTabId || (bound.bindingToken||null)!==j.bindingToken || (bound.activeJobId||null)!==j.expectedActiveJobId)throw Error('Recovery cancelled by a changed binding or lease');
        current.slots[name]={...bound,tabId:j.newTabId,url:j.url,activeJobId:null,recoveryPending:j.nonce,completedTurns:0,conversationChars:0,lastCompletedJob:null};
      });
      j.phase='COMMITTED';await chrome.storage.local.set({[recoveryKey(name)]:j});
    }
    c=await config();slot=c.slots?.[name];
    if(!c.enabled || slot?.tabId!==j.newTabId)return false;
    if(!j.retired){await retireForFreshChat(c,name,j);await updateSlot(name,j.newTabId,{activeJobId:null});}
    await chrome.storage.local.set({[fenceKey(j.newTabId)]:null});
    // Bind the replacement first. Late authorization from the retired renderer
    // is now denied. Closing that renderer does not authorize replay of its job.
    let old=null;try{old=await chrome.tabs.get(j.oldTabId);}catch{}
    if(old){
      if(chatIdentity(old.url)!==chatIdentity(j.oldUrl))throw Error('Old tab navigated during recovery; refusing to close it');
      await chrome.tabs.remove(j.oldTabId);
    }
    await chrome.storage.local.set({[fenceKey(j.oldTabId)]:null,[lifecycleKey(j.oldTabId)]:null,[healthKey(j.oldTabId)]:null});
    let replacement=await chrome.tabs.get(j.newTabId);
    if(replacement.url===j.placeholder || chatIdentity(replacement.url)===chatIdentity(j.oldUrl) && j.oldUrl!==j.url){
      j.phase='LOADING';await chrome.storage.local.set({[recoveryKey(name)]:j});
      replacement=await chrome.tabs.update(j.newTabId,{url:j.url});
    }
    if(!chat(replacement.url) || chatIdentity(replacement.url)!==chatIdentity(j.url))throw Error('Replacement has not reached the fresh chat');
    await recoveryState(name,j,'Opened a fresh chat; old delivery retained in Native quarantine. No request replay.');
    if(replacement.status==='loading'){
      if(Date.now()-j.at>=180000)throw Error('Replacement page loading exceeded three minutes');
      return false;
    }
    await keepBoundTabAlive(replacement);
    const report=await contentMessage(j.newTabId,{type:'NB_CONTENT_STATUS'});
    if(report?.bridgeBuild!=='6.2.11' || report?.transportRevision!==TRANSPORT_REVISION)throw Error('Replacement page has not loaded the tested recovery collector');
    await updateSlot(name,j.newTabId,{recoveryPending:null});
    j.phase='DONE';j.finished=Date.now();j.detail='Fresh chat ready; old request retained without replay';
    await chrome.storage.local.set({[recoveryKey(name)]:j});
    await slotState(name,{...report,job:null,retiredJob:j.jobId,url:j.url,recoveredAt:j.finished,detail:j.detail+'. '+(report.detail||report.state)});
    return true;
  }
  async function finishRootRetirement(name,j){
    const c=await config(),slot=c.slots?.[name];
    if(!c.enabled || slot?.tabId!==j.oldTabId || (slot.bindingToken||null)!==j.bindingToken){
      j.phase='CANCELLED';await chrome.storage.local.set({[recoveryKey(name)]:j});return false;
    }
    const tab=await chrome.tabs.get(j.oldTabId);
    if(chatIdentity(tab.url)!=='root')throw Error('Fresh root navigated during retirement; no automatic replay');
    await updateSlot(name,j.oldTabId,{recoveryPending:j.nonce});
    await retireForFreshChat(c,name,j);
    if(j.fence)await clearFence(j.oldTabId,j.fence);
    await updateSlot(name,j.oldTabId,{activeJobId:null,recoveryPending:null});
    j.phase='DONE';await chrome.storage.local.set({[recoveryKey(name)]:j});
    await slotState(name,{state:'READY',retiredJob:j.jobId,url:tab.url,detail:'Keeping this fresh chat. Old uncertain request quarantined; no replay.'});
    return true;
  }
  async function resumeRecovery(name){
    const j=(await chrome.storage.local.get(recoveryKey(name)))[recoveryKey(name)];
    if(!j || ['DONE','CANCELLED'].includes(j.phase))return true;
    if(recovering.has(name))return false;
    recovering.add(name);
    try{return await (j.kind==='ROOT_RETIREMENT'?finishRootRetirement(name,j):finishRecovery(name,j));}catch(e){
      j.error=String(e.message||e);await chrome.storage.local.set({[recoveryKey(name)]:j});
      await recoveryState(name,j,'Tab replacement is pending: '+j.error);
      // A hung replacement must not trap the watchdog in LOADING forever.
      // Retain the original receipt/fence for the next bounded recovery attempt.
      if(Date.now()-j.at>=180000 && j.newTabId){
        const c=await config();if(c.enabled && c.slots?.[name]?.tabId===j.newTabId){
          await updateSlot(name,j.newTabId,{recoveryPending:null});j.phase='DONE';j.detail='Replacement load did not respond; watchdog will retry with backoff';await chrome.storage.local.set({[recoveryKey(name)]:j});
        }
      }
      return false;
    }finally{recovering.delete(name);}
  }
  async function cancelRecovery(name){
    const j=(await chrome.storage.local.get(recoveryKey(name)))[recoveryKey(name)];
    if(!j || ['DONE','CANCELLED'].includes(j.phase))return;
    j.phase='CANCELLED';j.detail='Pool paused or slot unbound';await chrome.storage.local.set({[recoveryKey(name)]:j});
    if(j.newTabId){try{const tab=await chrome.tabs.get(j.newTabId);if(tab?.url===j.placeholder)await chrome.tabs.remove(j.newTabId);}catch{}}
    await editConfig(c=>{const slot=c.slots?.[name];if(slot?.recoveryPending===j.nonce)slot.recoveryPending=null;});
  }
  async function noteHang(name,expectedTabId,error){
    const c=await config(),slot=c.slots?.[name];
    if(!c.enabled || slot?.tabId!==expectedTabId)return false;
    let tab;try{tab=await chrome.tabs.get(expectedTabId);}catch{return false;}
    if(!chat(tab?.url) || chatIdentity(tab.url)!==chatIdentity(slot.url))return false;
    const key=watchdogKey(name),prior=(await chrome.storage.local.get(key))[key]||{};
    const w={...prior,tabId:expectedTabId,failures:prior.tabId===expectedTabId?Number(prior.failures||0)+1:1,
      firstFailure:prior.tabId===expectedTabId&&prior.firstFailure?prior.firstFailure:Date.now(),lastFailure:Date.now(),error:String(error.message||error),recoveries:(prior.recoveries||[]).filter(t=>Date.now()-t<RECOVERY_WINDOW_MS)};
    await chrome.storage.local.set({[key]:w});
    if(w.failures<MIN_HANG_FAILURES || Date.now()-w.firstFailure<HANG_AFTER_MS)return false;
    if(w.recoveries.length>=2){
      await slotState(name,{state:'RECOVERY_BACKOFF',detail:'Page remains unresponsive. Automatic tab recovery is cooling down after two replacements in 15 minutes; original job and evidence retained.',retryAfter:w.recoveries[0]+RECOVERY_WINDOW_MS,url:slot.url});return true;
    }
    const health=(await chrome.storage.local.get(healthKey(expectedTabId)))[healthKey(expectedTabId)]||{};
    if(health.state==='BLOCKED' && /Existing draft preserved|Existing attachments preserved/.test(health.detail))return false;
    // While the first turn bootstraps, / is not a recoverable conversation ID.
    // Preserve that uncertain job rather than turn replacement into a new send.
    // A hung root also gets a fresh renderer; uncertain first sends are quarantined.
    const previous=(await chrome.storage.local.get(recoveryKey(name)))[recoveryKey(name)];
    const receipt=retainedReceipt(health.receipt,slot.activeJobId)||retainedReceipt(previous?.receipt,slot.activeJobId);
    const fence=(await chrome.storage.local.get(fenceKey(expectedTabId)))[fenceKey(expectedTabId)]||
      (slot.activeJobId?{id:slot.activeJobId,type:'NB_CONTENT_SEND',nonce:crypto.randomUUID(),at:Date.now(),source:'TAB_RECOVERY_COLLECTION_ONLY'}:null);
    const nonce=crypto.randomUUID(),j={nonce,phase:'OPENING',at:Date.now(),oldTabId:expectedTabId,newTabId:null,
      placeholder:chrome.runtime.getURL('recovery.html')+'#'+nonce,url:tab.url,windowId:tab.windowId,jobId:slot.activeJobId||null,bindingToken:slot.bindingToken||null,receipt,fence,reason:w.error};
    w.recoveries.push(Date.now());await chrome.storage.local.set({[key]:w,[recoveryKey(name)]:j});
    await recoveryState(name,j,'ChatGPT stopped answering page checks for two minutes. Opening a fresh chat; old job retained without replay.');
    await resumeRecovery(name);return true;
  }
  async function refreshStreamError(name,slot,tab,job,report){
    if(report.phase!=='STREAM_ERROR' || !report.delivery?.userTurnConfirmed)return false;
    const key=streamKey(name),old=(await chrome.storage.local.get(key))[key];
    const record=old?.jobId===job.id?old:{jobId:job.id,count:0,at:0};
    if(record.count>=2)return false; // expose the real terminal error after bounded recovery
    if(record.at && Date.now()-record.at<60000){
      await slotState(name,{state:'RECOVERING',detail:'Current response reported a stream error. Waiting for the same-conversation refresh cooldown; no request replay.',job:job.id,url:tab.url});return true;
    }
    const c=await config(),current=c.slots?.[name];
    if(!c.enabled || current?.tabId!==tab.id || current.activeJobId!==job.id)return true;
    const latest=await chrome.tabs.get(tab.id);
    if(chatIdentity(latest.url)!==chatIdentity(slot.url))return true;
    const existing=(await chrome.storage.local.get(fenceKey(tab.id)))[fenceKey(tab.id)];
    if(!existing)await chrome.storage.local.set({[fenceKey(tab.id)]:{id:job.id,type:'NB_CONTENT_SEND',nonce:crypto.randomUUID(),at:Date.now(),source:'STREAM_ERROR_COLLECTION_ONLY'}});
    const next={...record,count:record.count+1,at:Date.now(),phase:'REQUESTED',url:tab.url,reason:report.error};
    await chrome.storage.local.set({[key]:next});
    if(report.sent && job.status!=='SENT')await api(c,'jobs/'+job.id+'/result',{client_id:c.clientId,lease:job.lease,sent:true});
    await slotState(name,{state:'RECOVERING',detail:'Refreshing this conversation after its visible stream error. Original request retained; no resend.',job:job.id,url:tab.url});
    const beforeReload=await config();
    if(!beforeReload.enabled || beforeReload.slots?.[name]?.tabId!==tab.id)return true;
    await chrome.tabs.reload(tab.id);
    next.phase='RELOADED';await chrome.storage.local.set({[key]:next});return true;
  }

  async function routePendingJob(slotName,slot,tab,identity,job,report,fence){
    const key='nb.jobConversation.'+job.id;
    let route=(await chrome.storage.local.get(key))[key];
    const resume=job.status==='SENT'||JSON.parse(job.packet||'{}').STATE?.resume_only;
    const exactTurn=report.delivery?.requestId===job.id && report.delivery?.userTurnConfirmed===true;
    if(identity.startsWith('c:') && ((!route && (!resume || exactTurn)) || (!resume && Number(job.transport_retries||0)>Number(route?.transportRetries||0)))){
      if(route)await chrome.storage.local.set({[key+'.attempt.'+Number(route.transportRetries||0)]:route});
      route={id:job.id,url:tab.url,identity,transportRetries:Number(job.transport_retries||0),at:Date.now()};await chrome.storage.local.set({[key]:route});
    }
    if(route?.identity===identity)return false;
    if((resume || route && route.identity!==identity) && identity==='root' && report.state==='READY' && !report.delivery?.sending && (!fence || fence.id===job.id)){
      const current=await config();
      if(!current.enabled || current.slots?.[slotName]?.tabId!==tab.id)return true;
      const nonce=crypto.randomUUID();
      const j={nonce,kind:'ROOT_RETIREMENT',jobId:job.id,oldTabId:tab.id,at:Date.now(),oldUrl:route?.url||slot.url||tab.url,
        job,fence,bindingToken:current.slots[slotName].bindingToken||null,phase:'RETIRING'};
      await chrome.storage.local.set({[recoveryKey(slotName)]:j});
      await resumeRecovery(slotName);
      return true;
    }
    if(!route)return false;
    await slotState(slotName,{state:'DELIVERY_UNCONFIRMED',job:job.id,url:tab.url,detail:'Pending job belongs to '+route.url+'. Current conversation/draft preserved; no resend.'});
    return true;
  }

  async function pollSlot(slotName,{force=false}={}){
    const now=Date.now();if(polling.has(slotName)||(!force&&now-(lastTick.get(slotName)||0)<900))return;
    polling.add(slotName);lastTick.set(slotName,now);
    let c,slot,tab;
    try{
      c=await config();if(!c.enabled)return;slot=c.slots?.[slotName];if(!slot?.tabId)return;
      if(!await resumeRecovery(slotName))return;
      c=await config();slot=c.slots?.[slotName];if(!c.enabled||!slot?.tabId)return;
      try{tab=await chrome.tabs.get(slot.tabId);}catch{}
      if(!tab){
        await editConfig(current=>{if(current.slots?.[slotName]?.tabId===slot.tabId)delete current.slots[slotName];});
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
      if(content?.collectorVersion!=='6.2.11')throw Error('ChatGPT has an old reply collector. Refresh this ChatGPT tab. Expected 6.2.11; received '+(content?.collectorVersion||'unversioned')+'.');
      if(content?.transportRevision!==TRANSPORT_REVISION)throw Error('Refresh this ChatGPT tab to load transport '+TRANSPORT_REVISION+'.');
      if(content?.bridgeBuild!=='6.2.11')throw Error('Refresh this ChatGPT tab to load Brain 6.2.11 completed-response ownership and rejection detection.');
      if(!slot.activeJobId && !previousFence && content.state==='READY' &&
         (Number(slot.completedTurns||0)>=4 || Number(slot.conversationChars||0)>=120000)){
        const nonce=crypto.randomUUID(),j={nonce,phase:'OPENING',at:Date.now(),oldTabId:tab.id,newTabId:null,
          placeholder:chrome.runtime.getURL('recovery.html')+'#'+nonce,url:tab.url,oldUrl:tab.url,windowId:tab.windowId,jobId:null,bindingToken:slot.bindingToken||null,reason:'Completed conversation size checkpoint'};
        await chrome.storage.local.set({[recoveryKey(slotName)]:j});await resumeRecovery(slotName);return;
      }
      const response=await api(c,'poll',{client_id:c.clientId,worker_slot:slotName,role:roleFor(slotName),state:previousFence?'DELIVERY_UNCONFIRMED':content.state,detail:content.detail||'',url:tab.url,tab_id:tab.id,conversation_id:identity,tab_count:boundSlots(c).length});
      const job=response.job;
      if((slot.activeJobId||null)!==(job?.id||null)){slot.activeJobId=job?.id||null;await updateSlot(slotName,slot.tabId,{activeJobId:slot.activeJobId});}
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
      if(await routePendingJob(slotName,slot,tab,identity,job,s,pendingFence))return;
      if(await refreshStreamError(slotName,slot,tab,job,s))return;
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
        if(slot.lastCompletedJob!==job.id)await updateSlot(slotName,slot.tabId,{
          lastCompletedJob:job.id,completedTurns:Number(slot.completedTurns||0)+1,
          conversationChars:Number(slot.conversationChars||0)+String(job.packet||'').length+JSON.stringify(s.result).length});
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
      if(e.pageUnresponsive && e.tabId===slot?.tabId && await noteHang(slotName,slot.tabId,e))return;
      const failure={state:'ERROR',detail:'Brain pool 6.2.12: '+String(e.message||e),url:tab?.url||slot?.url||''};await slotState(slotName,failure);
      if(c?.enabled&&slot){try{await api(c,'poll',{...failure,client_id:c.clientId,worker_slot:slotName,role:roleFor(slotName),tab_id:slot.tabId,conversation_id:chatIdentity(slot.url),tab_count:boundSlots(c).length});}catch{}}
    }finally{polling.delete(slotName);}
  }
  async function pollAll(){let c=await config();if(!c.enabled)return;c=await dropClosedSlots(c);await Promise.allSettled(boundSlots(c).map(n=>pollSlot(n)));}

  chrome.alarms.create('nb-heartbeat',{periodInMinutes:.5});
  chrome.alarms.onAlarm.addListener(a=>{if(a.name==='nb-heartbeat')void pollAll();});
  chrome.tabs.onRemoved.addListener(tabId=>{void (async()=>{
    const c=await config();
    for(const name of SLOT_NAMES){
      if(c.slots?.[name]?.tabId!==tabId)continue;
      const journal=(await chrome.storage.local.get(recoveryKey(name)))[recoveryKey(name)];
      if(journal && !['DONE','CANCELLED'].includes(journal.phase) && journal.oldTabId===tabId)continue;
      if(journal && journal.newTabId===tabId && !['DONE','CANCELLED'].includes(journal.phase)){
        journal.phase='CANCELLED';journal.detail='Replacement tab was closed';await chrome.storage.local.set({[recoveryKey(name)]:journal});
      }
      await editConfig(current=>{if(current.slots?.[name]?.tabId===tabId)delete current.slots[name];});
      await slotState(name,{state:'UNBOUND',detail:'Bound ChatGPT tab was closed; slot released automatically.'});
    }
  })();});
  chrome.tabs.onUpdated.addListener((tabId,changes)=>{if(changes.status==='complete')config().then(c=>{const name=SLOT_NAMES.find(n=>c.slots?.[n]?.tabId===tabId);if(name)void pollSlot(name,{force:true});});});
  chrome.runtime.onMessage.addListener((m,sender,reply)=>{
    if(!m?.type?.startsWith('NB_'))return false;
    if(m.type==='NB_DELIVERY_CHECKPOINT'){
      (async()=>{
        const c=await config(),name=SLOT_NAMES.find(n=>c.slots?.[n]?.tabId===sender.tab?.id);
        if(!c.enabled || !name || c.slots[name].recoveryPending || c.slots[name].activeJobId!==m.id)return {ok:false};
        const receipt=retainedReceipt(m.receipt,m.id),fence=(await chrome.storage.local.get(fenceKey(sender.tab.id)))[fenceKey(sender.tab.id)];
        if(!receipt || fence?.id!==m.id)return {ok:false};
        const old=(await chrome.storage.local.get(healthKey(sender.tab.id)))[healthKey(sender.tab.id)]||{};
        await chrome.storage.local.set({[healthKey(sender.tab.id)]:{...old,receipt}});return {ok:true,slot:name,tabId:sender.tab.id};
      })().then(reply).catch(()=>reply({ok:false}));return true;
    }
    if(m.type==='NB_AUTHORIZE_SEND'){
      (async()=>{
        const c=await config(),name=SLOT_NAMES.find(n=>c.slots?.[n]?.tabId===sender.tab?.id);
        if(!c.enabled || !name || c.slots[name].recoveryPending || !m.job?.id)return {ok:false};
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
          slots[name]={role:roleFor(name),tabId:sc.tabId,savedIdentity:chatIdentity(sc.url),currentIdentity:chatIdentity(tab?.url||''),sameConversation:!!tab&&chatIdentity(sc.url)===chatIdentity(tab.url),url:tab?.url||sc.url,frozen:tab?.frozen,discarded:tab?.discarded,autoDiscardable:tab?.autoDiscardable,deliveryFence:(await chrome.storage.local.get(fenceKey(sc.tabId)))[fenceKey(sc.tabId)]||null,watchdog:(await chrome.storage.local.get(watchdogKey(name)))[watchdogKey(name)]||null,recovery:(await chrome.storage.local.get(recoveryKey(name)))[recoveryKey(name)]||null,collector:content};
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
        const ts=await contentMessage(tab.id,{type:'NB_CONTENT_STATUS'});if(ts?.collectorVersion!=='6.2.11')throw Error('Refresh this ChatGPT tab to load reply collector 6.2.11, then bind again.');if(!ts?.state)throw Error('ChatGPT content bridge did not respond.');
        await api(old,'poll',{client_id:old.clientId,worker_slot:name,role:roleFor(name),state:'PAIRING',tab_id:tab.id,url:tab.url,conversation_id:chatIdentity(tab.url),tab_count:boundSlots(old).length});
        if(previousTabId&&previousTabId!==tab.id)await restoreBoundTab(previousTabId);
        await cancelRecovery(name);
        await editConfig(current=>{
          if(current.slots?.[name]?.tabId!==previousTabId)throw Error('Slot binding changed while pairing; choose it again');
          if(SLOT_NAMES.some(n=>n!==name&&current.slots?.[n]?.tabId===tab.id))throw Error('Tab was bound to another slot while pairing');
          current.base=old.base;current.token=old.token;current.enabled=true;
          current.slots[name]={...old.slots[name],bindingToken:crypto.randomUUID()};
        });await pollSlot(name,{force:true});return {ok:true,slot:name,status:ts};
      }
      if(m.type==='NB_UNBIND'){
        const name=SLOT_NAMES.includes(m.slot)?m.slot:'worker_1';await editConfig(async c=>{if(c.slots?.[name]){await restoreBoundTab(c.slots[name].tabId);delete c.slots[name];}});await cancelRecovery(name);await slotState(name,{state:'UNBOUND',detail:'Slot unbound'});return {ok:true};
      }
      if(m.type==='NB_PAUSE'){await editConfig(c=>{c.enabled=false;});await Promise.allSettled(SLOT_NAMES.map(cancelRecovery));const c=await config();await Promise.allSettled(boundSlots(c).map(n=>restoreBoundTab(c.slots[n].tabId)));return {ok:true};}
      if(m.type==='NB_RESUME'){await editConfig(c=>{c.enabled=true;});void pollAll();return {ok:true};}
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
