// Run manually in a headless Playwright CLI session: run-code --filename scripts/benchmark_atlas.js
// Synthetic rendering workload only; never modifies canonical knowledge.
async (page)=>{
const result=await page.evaluate(async()=>{
  const ticks=[],timer=setInterval(()=>ticks.push(performance.now()),16);
  const count=50000,nodes=Array.from({length:count},(_,i)=>({id:'perf.'+i,label:'Synthetic performance node '+i,domain:FAMILIES[i%10].id,kind:'claim',_status:'active',frontier:i%8000===0}));
  const links=nodes.map(n=>({source:'family:'+n.domain,target:n.id,type:'placement_pending'}));
  const canvas=document.createElement('canvas'),svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  canvas.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none';svg.setAttribute('viewBox','0 0 1600 1000');
  mapShell.append(canvas,svg);const start=performance.now();
  const engine=new FogMassiveAtlas(canvas,svg,{nodes,families:FAMILIES,navigation:{links,placement_pending_ids:[]},edges:[],onSelect:()=>{},onHover:()=>{}});
  engine.setActive(true);await new Promise((resolve,reject)=>{const began=performance.now();const poll=()=>{if(engine.stats.draws)resolve();else if(performance.now()-began>30000)reject(Error('benchmark timeout'));else setTimeout(poll,10)};poll()});
  const readyMs=performance.now()-start,initialDrawMs=engine.stats.drawMs,view=engine.viewport(),frames=[];
  for(let i=0;i<30;i++){svg.setAttribute('viewBox',[view[0]+i*15,view[1]+i*7,view[2],view[3]].join(' '));engine.cameraChanged();await new Promise(requestAnimationFrame);frames.push(engine.stats.drawMs)}
  engine.movingUntil=0;engine.overviewCache=null;svg.setAttribute('viewBox',[1000,0,1200,800].join(' '));engine.draw();const detail={drawMs:engine.stats.drawMs,nodes:engine.stats.visibleNodes,edges:engine.stats.visibleEdges};
  clearInterval(timer);const gaps=ticks.slice(1).map((t,i)=>t-ticks[i]).sort((a,b)=>a-b),sorted=frames.sort((a,b)=>a-b);
  const out={fixture:'synthetic 50,000 nodes / 50,000 navigation connections, no scientific claims',coverage:engine.items.filter(e=>e.kind==='node').length,workerLayoutMs:engine.stats.layoutMs,readyMs,initialDrawMs,cachedPanP50:sorted[15],cachedPanP95:sorted[28],detail,timerGapP95:gaps[Math.floor(gaps.length*.95)],maxTimerGap:gaps.at(-1),routing:engine.stats.routing};
  engine.active=false;engine.worker.terminate();engine.resizeObserver.disconnect();clearTimeout(engine.settleTimer);canvas.remove();svg.remove();massiveAtlas.schedule();return out;
});return result;
}
