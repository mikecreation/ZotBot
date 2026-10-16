/* Display boot request/fallback behavior and exact inspector evidence selection. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),app=fs.readFileSync(root+'/app.js','utf8');
const loaders=app.slice(app.indexOf('async function fetchAtlasJSON('),app.indexOf('async function boot()'));
const full=JSON.parse(fs.readFileSync(root+'/data/knowledge.json','utf8'));
const display=JSON.parse(fs.readFileSync(root+'/data/atlas-display.json','utf8'));
const navigation=JSON.parse(fs.readFileSync(root+'/data/atlas-navigation.json','utf8'));
async function load(payload,status=200){
  const calls=[];
  const context={fetch:async(url,options)=>{
    calls.push({url,options});
    const value=url.endsWith('atlas-navigation.json')?navigation:url.endsWith('knowledge.json')?full:payload;
    return {ok:url.endsWith('atlas-display.json')?status===200:true,json:async()=>{
      if(value instanceof Error)throw value;
      return value;
    }};
  }};
  vm.createContext(context);vm.runInContext(loaders,context);
  const nav=context.fetchAtlasJSON('atlas-navigation');
  const result=await context.loadAtlasModel(nav);
  assert(calls.every(call=>call.options===undefined),'pinned fetches must respect HTTP caching');
  return {result,calls};
}
async function main(){
  let test=await load(display);
  assert.equal(test.result,display);
  assert.equal(test.calls.length,2,'display and navigation start together; full graph is not fetched');
  const invalid=[null,{...display,input_sha256:'0'.repeat(64)},
    {...display,protocol:'fog-atlas-display/0'},{...display,schema_version:99},
    {...display,node_support:null},{...display,meta:null},{...display,nodes:[]},new Error('invalid JSON')];
  for(const payload of invalid){
    test=await load(payload);assert.equal(test.result,full);
    assert.equal(test.calls.filter(c=>c.url.endsWith('knowledge.json')).length,1);
  }
  test=await load(null,404);assert.equal(test.result,full,'older deployments fall back to knowledge.json');
  const interaction=fs.readFileSync(root+'/atlas-interaction.js','utf8');
  const select=interaction.slice(interaction.indexOf('function reviewedNodeAssertions('),interaction.indexOf('function augmentEvidenceDetails('));
  const context={model:display};vm.createContext(context);vm.runInContext(select,context);
  for(const [id,slim] of Object.entries(display.node_support)){
    assert.equal(context.reviewedNodeAssertions(id),slim);
    context.model=full;
    const original=context.reviewedNodeAssertions(id);
    assert.equal(original.length,slim.length);
    original.forEach((a,i)=>{
      for(const key of ['id','target_sha256','statement','scope','support'])assert.deepEqual(slim[i][key],a[key]);
      assert.equal(slim[i].target_id,a.canonical_record.id);
    });
    context.model=display;
  }
  assert.equal(context.reviewedNodeAssertions('no-support').length,0);
  assert.equal(context.reviewedNodeAssertions('constructor').length,0,'inherited object keys are not evidence');
  console.log(JSON.stringify({ok:true,canonical:display.nodes.length,inspectorTargets:Object.keys(display.node_support).length,displayBytes:fs.statSync(root+'/data/atlas-display.json').size,fullBytes:fs.statSync(root+'/data/knowledge.json').size}));
}
main().catch(error=>{console.error(error);process.exitCode=1});
