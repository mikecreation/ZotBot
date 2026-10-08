// Load the actual background entrypoint and every import, not individual modules.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(process.argv[2]||path.join(__dirname,'..'));
const store={},listeners=[];let pollCalls=0,bootError,now=100000;
const event=()=>({addListener(){},removeListener(){}});
const url='chrome-extension://startup-fixture/';
const ctx={console,URL,AbortSignal,setTimeout,clearTimeout,crypto:require('node:crypto').webcrypto,
 Date:class extends Date{static now(){return now;}},
 chrome:{
  runtime:{getURL:p=>url+p,onMessage:{addListener:f=>listeners.push(f)},onInstalled:event(),onStartup:event(),sendMessage:async()=>({})},
  storage:{local:{get:async keys=>{const result={};for(const key of typeof keys==='string'?[keys]:keys||Object.keys(store))result[key]=store[key];return result;},set:async v=>Object.assign(store,v),remove:async keys=>{for(const k of keys)delete store[k];}}},
  tabs:{onRemoved:event(),onUpdated:event(),get:async id=>({id,url:'https://chatgpt.com/c/persistent-brain'}),query:async()=>[],sendMessage:async()=>({state:'READY',bridgeBuild:'6.2.4',collectorVersion:'6.2.0',transportRevision:'6.2.3-editor-transaction'})},
  downloads:{onCreated:event(),onChanged:event()},sidePanel:{setPanelBehavior:async()=>{}},
  scripting:{executeScript:async()=>[]},alarms:{create(){},onAlarm:event()}
 },
 fetch:async(url,options)=>{pollCalls++;const body=JSON.parse(options.body);assert(['PAIRING','READY'].includes(body.state));return {ok:true,json:async()=>({enabled:true,job:null})};}
};
vm.createContext(ctx);
ctx.importScripts=(...files)=>{for(const file of files)vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),ctx,{filename:file});};
try{ctx.importScripts('background.js');}catch(e){bootError=e;}
if(process.argv.includes('--expect-broken')){
 assert(bootError,'Original must reproduce a startup crash');console.log('REPRODUCED original startup failure: '+bootError.message);process.exit(0);
}
if(bootError)throw bootError;
async function message(m){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('No reply to '+m.type)),1000);for(const listener of listeners){listener(m,{id:'startup-fixture',url:url+'brain.html'},r=>{clearTimeout(timer);resolve(r);});}});}
(async()=>{
 const initial=await message({type:'NB_GET'});assert.equal(Object.keys(initial.config.slots).length,0);assert.equal(initial.config.enabled,false);
 const bound=await message({type:'NB_BIND',base:'http://127.0.0.1:8000',token:'fixture-token',tabId:7});
 assert.equal(bound.ok,true,JSON.stringify(bound));assert.equal(pollCalls,2);
 assert.equal(store['nb.config'].slots.primary.tabId,7);assert.equal(store['nb.status'].state,'READY');
 const current=await message({type:'NB_GET'});assert.equal(current.config.slots.primary.url,'https://chatgpt.com/c/persistent-brain');
 ctx.fetch=async()=>({ok:false,json:async()=>({detail:'Pair extension using the local Brain token'})});
 const failed=await message({type:'NB_BIND',base:'http://127.0.0.1:8000',token:'wrong',tabId:8});assert.equal(failed.ok,false);assert.match(failed.error,/token/);assert.equal(store['nb.config'].slots.primary.tabId,7,'A rejected token must preserve the previous binding');
 console.log('PASS full startup: scanner + Auto-Continue + orchestrator + Brain loaded; NB_GET responds; Bind verifies page and server; bad token rejected.');
})().catch(e=>{console.error(e);process.exit(1)});
