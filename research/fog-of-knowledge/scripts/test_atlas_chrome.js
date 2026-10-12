/* Collapsible atlas chrome: one-click controls, persistence, refit, no research side effects. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require(path.join(process.env.NEMESIS_QA_NODE_MODULES||path.resolve(__dirname,'../nemesis/integration/brain-transport/node_modules'),'jsdom'));
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8').replace(/<script id="nemesis-atlas-shell-bounce">[\s\S]*?<\/script>/,'');
const source=fs.readFileSync(path.join(root,'atlas-chrome.js'),'utf8');
function boot(storage){
  const dom=new JSDOM(html,{url:'http://localhost/atlas/',runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window,d=w.document;
  if(storage)w.localStorage.setItem('fog:atlas-chrome:v1',storage);
  w.fetch=()=>{throw Error('Layout controls must never dispatch research')};
  let fits=0;d.querySelector('#fitMapBtn').addEventListener('click',()=>fits++);
  w.eval(source);
  return {dom,w,d,fits:()=>fits,body:d.body,key:k=>d.dispatchEvent(new w.KeyboardEvent('keydown',{key:k,bubbles:true}))};
}
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function main(){
  let t=boot();const {d,body}=t;
  assert(!body.classList.contains('chrome-header-collapsed'));
  const header=d.querySelector('#collapseHeaderBtn'),tab=d.querySelector('#detailEdgeTab');
  header.click();assert(body.classList.contains('chrome-header-collapsed'));assert.equal(header.getAttribute('aria-expanded'),'false');
  // Slim bar keeps the most-used controls in the DOM.
  for(const id of ['#hubBtn','#expandAllBtn','#frontierLensBtn','#chromeSearchBtn','#collapseHeaderBtn'])assert(d.querySelector('.topbar '+id),id);
  tab.click();assert(body.classList.contains('chrome-panel-collapsed'));assert.equal(tab.getAttribute('aria-expanded'),'false');
  // The edge tab is a grid column, not an overlay above the map.
  assert.equal(tab.parentElement.tagName,'MAIN');assert.equal(tab.nextElementSibling.id,'detail');
  await wait(200);assert(t.fits()>=1,'collapse refits the map');
  assert.deepEqual(JSON.parse(t.w.localStorage.getItem('fog:atlas-chrome:v1')),{header:false,panel:false,caption:true,focus:false});
  // Caption close survives app.js replacing the caption markup.
  const cap=d.querySelector('#mapCaption');cap.innerHTML='<b>EXPAND ALL</b><span>replaced</span>';await wait(0);
  cap.querySelector('.captionClose').click();assert(body.classList.contains('chrome-caption-hidden'));
  t.key('i');assert(!body.classList.contains('chrome-caption-hidden'));
  // Focus collapses everything; exit restores individual choices.
  header.click();tab.click();
  assert(!body.classList.contains('chrome-header-collapsed'));
  t.key('f');for(const c of ['chrome-focus','chrome-header-collapsed','chrome-panel-collapsed','chrome-caption-hidden'])assert(body.classList.contains(c),c);
  t.key('Escape');assert(!body.classList.contains('chrome-focus'));assert(!body.classList.contains('chrome-header-collapsed'));assert(!body.classList.contains('chrome-caption-hidden'));
  // Shortcuts ignore typing in search.
  d.querySelector('#search').focus();t.key('[');t.key('f');assert(!body.classList.contains('chrome-header-collapsed'));assert(!body.classList.contains('chrome-focus'));
  d.querySelector('#search').blur();t.key('[');assert(body.classList.contains('chrome-header-collapsed'));t.key(']');assert(body.classList.contains('chrome-panel-collapsed'));
  // Search icon opens the search strip while collapsed.
  d.querySelector('#chromeSearchBtn').click();assert(body.classList.contains('chrome-search-open'));assert.equal(d.activeElement.id,'search');
  t.dom.window.close();
  // Persistence across reloads.
  t=boot(JSON.stringify({header:false,panel:false,caption:false,focus:true}));
  for(const c of ['chrome-focus','chrome-header-collapsed','chrome-panel-collapsed','chrome-caption-hidden'])assert(t.body.classList.contains(c),c);
  t.d.querySelector('.chromeControls [data-chrome-focus]').click();assert(!t.body.classList.contains('chrome-focus'));
  assert(t.body.classList.contains('chrome-header-collapsed'));t.dom.window.close();
  t=boot('not json');assert(!t.body.classList.contains('chrome-header-collapsed'));t.dom.window.close();
  console.log('PASS header/panel/caption collapse, focus map, shortcuts, persistence, refit, edge tab outside the map, no research operations');
}
main().catch(e=>{console.error(e);process.exit(1)});
