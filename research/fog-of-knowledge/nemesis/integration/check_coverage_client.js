async page => {
  await page.goto('about:blank');
  await page.unroute('**/api/**');
  const a='a'.repeat(40), writes=[], forbidden=[];
  let enabled=false, visited=0;
  const coverage=()=>({enabled,state:enabled?'RUNNING':'PAUSED',eligible_branches:400,visited_branches:visited,
    domains:[{id:'physical',visited:visited?1:0},{id:'living',visited:visited?1:0}],
    totals:{new_nodes:12,updated_nodes:3,edges:4},states:{HELD:1},
    active_tasks:visited?[{label:'Life <img src=x>',domain:'living',state:'QUEUED'}]:[]});
  await page.route('**/api/**',async route=>{
    const request=route.request(),url=new URL(request.url()),p=url.pathname;
    let json={ok:true};
    if(request.method()==='POST'&&p.endsWith('/coverage')){
      const body=request.postDataJSON();writes.push(body);enabled=body.enabled;json=coverage();
    }else if(p.endsWith('/use'))json={active:{owner:'example',repo:'fixture',path:'research/fog-of-knowledge'}};
    else if(request.method()==='POST'&& !p.endsWith('/atlas')){forbidden.push(p);return route.fulfill({status:500,json:{error:'Live dispatch forbidden'}})}
    else if(p==='/api/brain/status')json={connected:true,state:'READY'};
    else if(p==='/api/brain/pool')json={pool:{primary:{connected:true,state:'READY'}}};
    else if(p.endsWith('/evidence-crew'))json={running:true,client_revision:'gh-evidence-5',coverage:coverage(),discoveries:[],flows:[{batch_id:'fixture',state:'REVIEW',updated_at:1}]};
    else if(p.endsWith('/atlas'))json={ok:true,sha:a,url:'/coverage-atlas-fixture',name:'Fog'};
    else if(p==='/api/github/active')json={active:{owner:'example',repo:'fixture',path:'research/fog-of-knowledge'}};
    else if(p.endsWith('/batches'))json={batches:[]};
    return route.fulfill({json});
  });
  await page.route('**/coverage-atlas-fixture',route=>route.fulfill({contentType:'text/html',body:'<body>Circuit fixture<script>window.FogAtlasState={snapshot:()=>({expanded:true,viewport:[1,2,3,4]})}</script>'}));
  await page.route('**/coverage-client-fixture',route=>route.fulfill({contentType:'text/html',body:'<body style="background:#05070d;color:white"><main id="fixture"></main><script>window.setInterval=(fn,ms)=>{if(ms===5000)window.pollCrew=fn;return 1}</script><script src="/static/github.js"></script><script>NemesisGitHub.render(document.querySelector("#fixture"))</script>'}));
  await page.goto('http://127.0.0.1:8000/coverage-client-fixture#github/atlas/example/fixture?path=research%2Ffog-of-knowledge');
  const button=()=>page.locator('[data-gh="expand-crew"]');
  await button().waitFor();
  await page.waitForFunction(()=>document.querySelector('iframe')?.contentWindow.FogAtlasState);
  await page.evaluate(()=>window.originalFrame=document.querySelector('iframe'));
  if(await button().isDisabled())throw Error('An active review prevented queue control');
  await button().click();
  await page.getByRole('button',{name:'Pause expansion queue',exact:true}).waitFor();
  visited=2;
  await page.evaluate(()=>window.pollCrew());
  await page.getByText(/2\/400 branches visited/).waitFor();
  if(await page.locator('.gh-evidence-progress img').count())throw Error('Branch label was not escaped');
  await button().click();
  await page.getByRole('button',{name:'Expand map with crew',exact:true}).waitFor();
  if(!await page.evaluate(()=>window.originalFrame===document.querySelector('iframe')))throw Error('Queue toggle replaced the circuit iframe');
  if(JSON.stringify(writes.map(w=>w.enabled))!==JSON.stringify([true,false]))throw Error('Queue enable/pause did not persist explicit boolean requests');
    if(forbidden.length)throw Error('Unexpected fixture write: '+forbidden.join(', '));
  await page.screenshot({path:'output/playwright/coverage-queue-controls.png'});
  return {queueEnabledAndPaused:true,activeReviewDoesNotDisableControls:true,wholeAtlasProgressVisible:true,circuitCameraPreserved:true,labelEscaped:true,noRealResearch:true};
}
