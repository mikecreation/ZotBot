/* Display controls affect presentation only; workers and graph state stay live. */
(() => {
  'use strict';
  const dock=document.querySelector('#atlasDisplayDock');
  document.querySelector('#atlasDockTabs').append(document.querySelector('.atlasTabs'));
  const focusButton=document.querySelector('#mapOnlyBtn');
  const fullscreenButton=document.querySelector('#fullscreenMapBtn');
  const status=document.querySelector('#atlasDisplayStatus');
  const minimize=document.querySelector('#minimizeMapControlsBtn');
  const checks=[...dock.querySelectorAll('[data-atlas-panel]')];
  let focus=false, beforeFullscreen=false;
  try {
    const saved=JSON.parse(sessionStorage.getItem('fog:display')||'null');
    if(saved){focus=!!saved.focus;checks.forEach(c=>c.checked=saved.panels?.[c.dataset.atlasPanel]!==false)}
  } catch (_) {}
  minimize.onclick=()=>{
    const compact=dock.classList.toggle('controls-minimized');
    minimize.setAttribute('aria-expanded',String(!compact));
    minimize.textContent=compact?'+':'−';
    minimize.title=compact?'Show map controls':'Minimize map controls';
  };
  function paint(){
    checks.forEach(c=>document.body.classList.toggle('hide-atlas-'+c.dataset.atlasPanel,focus||!c.checked));
    document.body.classList.toggle('atlas-map-only',focus);
    focusButton.setAttribute('aria-pressed',String(focus));
    focusButton.textContent=focus?'RESTORE PANELS':'MAP ONLY';
    if(parent!==window)parent.postMessage({type:'fog-atlas-display',shellHidden:focus||!checks.find(c=>c.dataset.atlasPanel==='shell').checked},'*');
    try{sessionStorage.setItem('fog:display',JSON.stringify({focus,panels:Object.fromEntries(checks.map(c=>[c.dataset.atlasPanel,c.checked]))}))}catch(_){}
    window.dispatchEvent(new Event('resize'));
  }
  focusButton.onclick=()=>{focus=!focus;paint()};
  checks.forEach(c=>c.onchange=()=>{focus=false;paint()});
  fullscreenButton.onclick=async()=>{
    status.hidden=true;
    if(document.fullscreenElement){await document.exitFullscreen();return}
    beforeFullscreen=focus;focus=true;paint();
    try{await document.documentElement.requestFullscreen()}
    catch(_){status.textContent='Map fills the page. For screen fullscreen, press F11.';status.hidden=false}
  };
  document.addEventListener('fullscreenchange',()=>{
    const active=!!document.fullscreenElement;
    fullscreenButton.textContent=active?'EXIT FULLSCREEN':'FULLSCREEN';
    if(!active){focus=beforeFullscreen;paint()}
    window.dispatchEvent(new Event('resize'));
  });
  document.addEventListener('keydown',ev=>{
    if(ev.key==='Escape'&&!document.fullscreenElement){
      document.querySelector('#atlasPanelsMenu').open=false;
      if(focus){focus=false;paint()}
    }
  });
  document.querySelector('#mapShell').scrollTop=0;
  document.querySelector('#mapShell').scrollLeft=0;
  paint();
})();
