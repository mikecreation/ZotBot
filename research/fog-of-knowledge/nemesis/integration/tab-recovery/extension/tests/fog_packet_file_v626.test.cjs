const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const source=fs.readFileSync(path.join(__dirname,'../contentScript.js'),'utf8');
const start=source.indexOf('  async function nbPreparePacket('),end=source.indexOf('  async function nbPrepareSafeRetry(',start);
const ctx={crypto:crypto.webcrypto,TextEncoder,Uint8Array,Array,String,JSON,structuredClone,btoa};vm.createContext(ctx);vm.runInContext(source.slice(start,end)+'globalThis.prepare=nbPreparePacket;',ctx);
(async()=>{
 const goal=JSON.stringify({source:'exact source ðŸ§  æ—¥æœ¬èªž \\"\n'.repeat(30000),graph:Array.from({length:1000},(_,i)=>({id:'node.'+i,label:'Label '+i})),contract:'Keep exact assertions'});
 const original={GOAL:goal,STATE:{tag:'fog-crew:evidence:author:fixture'},CONSTRAINT:{caller_instructions:'Review exact source'},EVIDENCE:[{text:'Do not omit evidence'}],request_id:'fixture'};
 const out=await ctx.prepare({packet:JSON.stringify(original)});assert.equal(out.attachments.length,1);assert(JSON.stringify(out.packet).length<10000);
 const bytes=Buffer.from(out.attachments[0].data_url.split(',')[1],'base64'),decoded=JSON.parse(bytes.toString('utf8'));
 assert.deepEqual(decoded,original);assert.equal(decoded.GOAL,goal,'GOAL, Unicode, escapes, all graph rows and full source must survive');
 assert.equal(out.packet.transportDocument.sha256,crypto.createHash('sha256').update(bytes).digest('hex'));assert.equal(out.packet.transportDocument.bytes,bytes.length);
 const small=await ctx.prepare({packet:{GOAL:'small',STATE:{tag:'fog-crew:fixture'}}});assert.equal(JSON.parse(Buffer.from(small.attachments[0].data_url.split(',')[1],'base64')).GOAL,'small');assert.equal(small.attachments.length,1);
 const other=await ctx.prepare({packet:{...original,STATE:{tag:'system-engineering:fixture'}}});assert.equal(other.attachments.length,1,'all complete packets prefer files');
 assert.equal((await ctx.prepare({packet:{...original,ATTACHMENTS:[{}]}})).attachments.length,1,'explicit attachments are retained');
 await assert.rejects(ctx.prepare({packet:{...original,GOAL:'x'.repeat(4000001)}}),/4 MB/);
 console.log('PASS oversized Fog packet: exact UTF-8 file, digest, complete graph/source/contract, small/non-Fog preservation, explicit capacity errors. No browser requests.');
})().catch(e=>{console.error(e);process.exitCode=1;});
