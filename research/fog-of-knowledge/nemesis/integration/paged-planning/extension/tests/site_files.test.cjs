/* Exercise the actual attachment function without touching a browser. */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../contentScript.js'),'utf8');
const start=source.indexOf('  async function nbAttach('),end=source.indexOf('  async function nbPrepareSafeRetry(',start);
assert.ok(start>0&&end>start);let clock=0,owned=null,events=0;const input={webkitdirectory:false,getAttribute:()=>null,dispatchEvent(){events++}},image={webkitdirectory:false,getAttribute:()=> 'image/*',dispatchEvent(){events++}};
const ctx={File,Uint8Array,atob,Event,String,Date:{now:()=>clock},DataTransfer:class{constructor(){this.files=[];this.items={add:f=>this.files.push(f)}}},document:{querySelectorAll:()=>[image,input],querySelector:()=>null},nbAttachmentState:()=>({count:0}),nbAttachmentRemoveButtons:()=>input.files?.length?input.files:image.files||[],nbMarkOwnedAttachments:(id,names)=>owned={id,names},wait:async n=>{clock+=n}};
vm.createContext(ctx);vm.runInContext(source.slice(start,end)+'globalThis.attach=nbAttach;',ctx);
(async()=>{
 const text='UNTRUSTED EVIDENCE — full indexed structure 🧠';const item={name:'nemesis-site-evidence-0123456789abcdef.txt',kind:'site-evidence',data_url:'data:text/plain;base64,'+Buffer.from(text).toString('base64')};
 const result=await ctx.attach([item],'TEST_ONLY_JOB');assert.equal(result.count,1);assert.equal(await input.files[0].text(),text);assert.equal(input.files[0].type,'text/plain');assert.equal(owned.id,'TEST_ONLY_JOB');assert.equal(events,1);assert.equal(image.files,undefined,'document must use general upload input, not image-only input');
 await assert.rejects(ctx.attach([{...item,kind:'untrusted-page'}],'TEST'),/unowned/);assert.equal(events,1);
 await assert.rejects(ctx.attach([{...item,name:'credentials.txt'}],'TEST'),/unowned/);assert.equal(events,1);
 input.files=[];const old={name:'legacy.jpg',data_url:'data:image/jpeg;base64,'+Buffer.from([255,216,255]).toString('base64')};await ctx.attach([old],'OLD_SCREENSHOT');assert.equal(image.files[0].type,'image/jpeg');assert.equal(events,2);
 console.log('PASS actual attachment adapter: Unicode text, ownership restrictions, unchanged JPEG behavior, one upload, no composer/send/collector changes. OFFLINE ONLY.');
})().catch(e=>{console.error(e);process.exitCode=1;});
