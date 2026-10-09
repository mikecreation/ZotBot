/* Reversible display controls must not dispatch research or replace tab IDs. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require(path.join(process.env.NEMESIS_QA_NODE_MODULES||path.resolve(__dirname,'../nemesis/integration/brain-transport/node_modules'),'jsdom'));
const root=path.resolve(__dirname,'..');
async function main(){
  const dom=new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8'),{url:'http://localhost/atlas/',runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window,d=w.document;
  w.fetch=()=>{throw Error('Display must never dispatch research')};
  let full=null,fail=false,requests=0;
  Object.defineProperty(d,'fullscreenElement',{get:()=>full});
  d.documentElement.requestFullscreen=async()=>{requests++;if(fail)throw Error('Denied');full=d.documentElement;d.dispatchEvent(new w.Event('fullscreenchange'))};
  d.exitFullscreen=async()=>{full=null;d.dispatchEvent(new w.Event('fullscreenchange'))};
  const tab=d.querySelector('#atlasTab');
  w.eval(fs.readFileSync(path.join(root,'atlas-display.js'),'utf8'));
  assert.equal(d.querySelector('#atlasDockTabs #atlasTab'),tab);
  assert.equal(d.querySelectorAll('#atlasTab').length,1);
  const minimize=d.querySelector('#minimizeMapControlsBtn');minimize.click();assert.equal(minimize.getAttribute('aria-expanded'),'false');minimize.click();assert.equal(minimize.getAttribute('aria-expanded'),'true');
  const focus=d.querySelector('#mapOnlyBtn'),fullscreen=d.querySelector('#fullscreenMapBtn');
  const caption=d.querySelector('[data-atlas-panel="caption"]');
  caption.checked=false;caption.dispatchEvent(new w.Event('change'));
  focus.click();assert(d.body.classList.contains('atlas-map-only'));
  for(const name of ['header','toolbar','detail','caption','tools','shell'])assert(d.body.classList.contains('hide-atlas-'+name));
  focus.click();assert(!d.body.classList.contains('atlas-map-only'));
  assert(d.body.classList.contains('hide-atlas-caption'));assert(!d.body.classList.contains('hide-atlas-detail'));
  fullscreen.click();await new Promise(r=>setImmediate(r));
  assert.equal(requests,1);assert.equal(full,d.documentElement);assert.equal(fullscreen.textContent,'EXIT FULLSCREEN');
  await d.exitFullscreen();assert(!d.body.classList.contains('atlas-map-only'));
  assert(d.body.classList.contains('hide-atlas-caption'));
  fail=true;fullscreen.click();await new Promise(r=>setImmediate(r));
  assert(d.body.classList.contains('atlas-map-only'));assert(!d.querySelector('#atlasDisplayStatus').hidden);
  d.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape'}));assert(!d.body.classList.contains('atlas-map-only'));
  assert(d.querySelector('#atlasDockTabs #publicFrontierTab'));
  assert.equal(JSON.parse(w.sessionStorage.getItem('fog:display')).panels.caption,false);
  dom.window.close();
  const hashes=JSON.parse(fs.readFileSync(path.join(root,'nemesis/integration/atlas-display/source-sha256.json'),'utf8'));
  for(const [name,hash] of Object.entries(hashes))assert.equal(require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(root,'nemesis/integration/atlas-display',name))).digest('hex'),hash);
  console.log('PASS panels, retained tab identities, fullscreen entry/exit/fallback, Escape, saved preferences, no research operations and source hashes');
}
main().catch(e=>{console.error(e);process.exit(1)});
