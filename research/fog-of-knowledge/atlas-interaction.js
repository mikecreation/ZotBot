// Full circuit navigation; scientific evidence remains a separate lens.
function readViewport(){return graph.getAttribute("viewBox").split(/\s+/).map(Number)}
function writeViewport(v){
  graph.setAttribute("viewBox",v.join(" "));
  massiveAtlas?.cameraChanged();
}
function zoomAtlas(factor,screenPoint=null){
  const v=readViewport(),box=graph.getBoundingClientRect();
  const px=screenPoint?(screenPoint.x-box.left)/box.width:.5;
  const py=screenPoint?(screenPoint.y-box.top)/box.height:.5;
  const width=clamp(v[2]*factor,250,100000),height=width*v[3]/v[2];
  viewportOverride=[v[0]+px*(v[2]-width),v[1]+py*(v[3]-height),width,height];
  writeViewport(viewportOverride);
}
function bindAtlasCamera(){
  document.querySelector("#zoomInBtn").onclick=()=>zoomAtlas(.72);
  document.querySelector("#zoomOutBtn").onclick=()=>zoomAtlas(1.4);
  document.querySelector("#fitMapBtn").onclick=()=>{viewportOverride=null;if(massiveAtlas.active)massiveAtlas.fit();else if(fittedViewport)writeViewport(fittedViewport)};
  document.querySelector("#evidenceLensBtn").onclick=ev=>{evidenceLens=!evidenceLens;ev.currentTarget.setAttribute("aria-pressed",String(evidenceLens));cameraGesture=true;render();cameraGesture=false};
  document.querySelector('#nodeConnectionsBtn').onclick=toggleNodeConnections;
  document.querySelector("#reviewDeskBtn").onclick=()=>window.open("./review.html","_blank","noopener");
  graph.addEventListener("wheel",ev=>{ev.preventDefault();zoomAtlas(Math.exp(clamp(ev.deltaY,-150,150)*.0025),{x:ev.clientX,y:ev.clientY})},{passive:false});
  let drag=null;
  graph.addEventListener("pointerdown",ev=>{if(ev.button!==0)return;drag={x:ev.clientX,y:ev.clientY,v:readViewport()};graph.setPointerCapture(ev.pointerId)});
  graph.addEventListener("pointermove",ev=>{
    if(!drag)return;
    const dx=ev.clientX-drag.x,dy=ev.clientY-drag.y;
    if(Math.hypot(dx,dy)<4&&!cameraGesture)return;
    cameraGesture=true;
    const box=graph.getBoundingClientRect(),v=drag.v;
    viewportOverride=[v[0]-dx*v[2]/box.width,v[1]-dy*v[3]/box.height,v[2],v[3]];
    writeViewport(viewportOverride);
  });
  graph.addEventListener("pointerup",()=>{drag=null;setTimeout(()=>{cameraGesture=false},0)});
  graph.addEventListener("pointercancel",()=>{drag=null;cameraGesture=false});
}
function showNodeHover(node,p){
  const hover=document.querySelector("#nodeHover");
  hover.textContent=node.label;
  hover.hidden=false;
}
const circleLabelMeasure=document.createElement('canvas').getContext('2d');
function setInsideCircleLabel(group,label,radius){
  const fitted=FogCircleLabel.layout(circleLabelMeasure,label,radius);
  const size=fitted.size;
  group.removeAttribute('transform');
  group.replaceChildren(...fitted.lines.map((line,i)=>{
    const text=textNode(0,fitted.ys[i]*size,line,'nodeTitle');
    text.style.font=`600 ${size}px system-ui`;
    text.style.dominantBaseline='alphabetic';
    text.style.strokeWidth=String(size*.1);
    return text;
  }));
}
function drawEvidenceTopology(parent,center){
  const focus=currentToken()?.kind==="node"?currentToken().id:null;
  const branch=currentToken()?.kind==="family"?currentToken().id:null;
  const visible=visibleNodeIds();
  const group=mk("g",{class:"evidenceTopology"});
  const context=new Map();
  evidenceContextPoints=[];
  if(focus){
    const origin=nodePosOnMap(focus,center);
    const neighbors=[...new Set(model.edges.filter(e=>e.source===focus||e.target===focus).map(e=>e.source===focus?e.target:e.source))].sort();
    const obstacles=lastObstacleCircles.length?[...lastObstacleCircles]:[...visible].map(id=>{const p=nodePosOnMap(id,center);return p?{...p,r:65}:null}).filter(Boolean);
    neighbors.forEach((id,i)=>{
      if(nodePosOnMap(id,center))return;
      let position;
      for(let attempt=0;attempt<10000;attempt++){
        const index=i+attempt,angle=index*Math.PI*(3-Math.sqrt(5)),r=200+85*Math.sqrt(index+1);
        position={x:origin.x+Math.cos(angle)*r,y:origin.y+Math.sin(angle)*r};
        if(obstacles.every(o=>Math.hypot(o.x-position.x,o.y-position.y)>o.r+52))break;
      }
      obstacles.push({...position,r:45});context.set(id,position);evidenceContextPoints.push({...position,pad:150});
      const node=nodeById.get(id),angle=Math.atan2(position.y-center.y,position.x-center.x),r=Math.hypot(position.x-center.x,position.y-center.y);
      drawKnowledgeNode(parent,node,position,{kind:'node',id,angle,r,visualRadius:38,relation:'evidence_context'},false,'evidenceNeighbor',()=>activateSearchResult(node),'evidence_context');
    });
  }
  let count=0;
  for(const e of model.edges){
    if(!evidenceLens&&e.source!==focus&&e.target!==focus&&!(branch&&(nodeById.get(e.source)?.domain===branch||nodeById.get(e.target)?.domain===branch)))continue;
    const a=nodePosOnMap(e.source,center)||context.get(e.source),b=nodePosOnMap(e.target,center)||context.get(e.target);
    // Offscreen relationships remain listed in details; a lens never deletes them.
    if(!a||!b)continue;
    const color=FALSE_EDGE_TYPES.has(e.type)?"#ff637d":e.type==="tests"?"#ffd35f":"#aebeff";
    const dx=b.x-a.x,dy=b.y-a.y,bend=35+(count%5)*18;
    const path=mk("path",{d:`M ${a.x} ${a.y} Q ${(a.x+b.x)/2-dy/Math.max(1,Math.hypot(dx,dy))*bend} ${(a.y+b.y)/2+dx/Math.max(1,Math.hypot(dx,dy))*bend} ${b.x} ${b.y}`,
                          class:"evidenceWire",stroke:color,"data-relation":e.type});
    const title=mk("title");title.textContent=`${nodeById.get(e.source).label} — ${e.type} → ${nodeById.get(e.target).label}`;path.append(title);
    group.append(path);count++;
  }
  parent.prepend(group);
}
let evidenceContextPoints=[];
let connectionListFocus=null,connectionListPage=0;
function toggleNodeConnections(){
  if(currentToken()?.kind!=='node')return;
  const fromDetails=document.activeElement?.id==='detailNodeConnections';
  nodeConnectionsEnabled=!nodeConnectionsEnabled;expandAll=false;expandFieldDeep=false;render();
  if(fromDetails)detail.querySelector('#detailNodeConnections')?.focus();
}
function connectionTarget(id){
  return id.startsWith('family:')?{label:familyById.get(id.slice(7)).title,family:familyById.get(id.slice(7))}:{label:nodeById.get(id.slice(5)).label,family:familyById.get(nodeById.get(id.slice(5)).domain)};
}
function connectionDescription(link,focus){
  const kind={scientific:'Scientific',navigation:'Navigation',taxonomy:'Reviewed placement',identity:'Concept facet'}[link.kind];
  const arrow=link.kind==='identity'?'':link.from==='node:'+focus?'→ ':'← ';
  return kind+' · '+arrow+link.type.replaceAll('_',' ');
}
function renderNodeConnectionDetails(){
  const token=currentToken();if(token?.kind!=='node')return;
  const id=token.id,peers=FogNodeConnections.peers(massiveAtlas.connectionIndex,id),links=massiveAtlas.connectionIndex.get('node:'+id)||[];
  const action=document.createElement('button');action.id='detailNodeConnections';action.type='button';action.setAttribute('aria-pressed',String(nodeConnectionsEnabled));
  action.textContent=nodeConnectionsEnabled?'HIDE NODE CONNECTIONS':'SHOW ALL CONNECTIONS · '+peers.size;action.onclick=toggleNodeConnections;
  detail.querySelector('.detailActionRow')?.append(action);
  if(!nodeConnectionsEnabled)return;
  if(connectionListFocus!==id){connectionListFocus=id;connectionListPage=0}
  const rows=[...peers].map(([key,relations])=>({key,relations,...connectionTarget(key)})).sort((a,b)=>(a.family?.title||'').localeCompare(b.family?.title||'')||a.label.localeCompare(b.label));
  const pageSize=36,pages=Math.max(1,Math.ceil(rows.length/pageSize));connectionListPage=Math.min(connectionListPage,pages-1);
  const counts=new Map();for(const link of links)counts.set(link.kind,(counts.get(link.kind)||0)+1);
  const section=document.createElement('section');section.className='detailSection nodeConnectionSection';section.setAttribute('aria-label','Node connections');
  section.innerHTML='<h3>ALL CONNECTION POINTS · '+peers.size+'</h3><p>'+[...counts].map(([kind,count])=>count+' '+({scientific:'scientific',navigation:'navigation',taxonomy:'reviewed placement',identity:'concept facet'}[kind])).join(' · ')+'</p><p>Recorded relationships across fields. Navigation lines describe placement, not scientific support.</p><div class="connectionLegend">'+[...counts.keys()].map(kind=>'<span class="connectionKind '+kind+'">'+esc({scientific:'Scientific',navigation:'Navigation',taxonomy:'Reviewed placement',identity:'Concept facet'}[kind])+'</span>').join('')+'</div><div class="connectionPoints">'+rows.slice(connectionListPage*pageSize,(connectionListPage+1)*pageSize).map(row=>'<button class="nodeLink connectionPoint" data-connection-key="'+esc(row.key)+'" style="--connection-color:'+esc(row.family?.color||'#aebeff')+'"><span>'+esc(row.label)+'</span><small>'+esc(row.family?.short||'Field')+'</small>'+row.relations.map(link=>'<small>'+esc(connectionDescription(link,id))+'</small>').join('')+'</button>').join('')+(rows.length?'':'<p>No other connection points are recorded yet.</p>')+'</div>'+(pages>1?'<div class="connectionPages"><button id="connectionsPrev" '+(connectionListPage?'':'disabled')+'>← Previous</button><span>'+(connectionListPage+1)+' / '+pages+'</span><button id="connectionsNext" '+(connectionListPage<pages-1?'':'disabled')+'>Next →</button></div><p>The map shows every connection point; only this list is paginated.</p>':'');
  detail.querySelector('.detailHero').after(section);
  section.querySelectorAll('[data-connection-key]').forEach(button=>button.onclick=()=>{
    const key=button.dataset.connectionKey;
    if(key.startsWith('node:'))activateSearchResult(nodeById.get(key.slice(5)));
    else{expandAll=false;expandFieldDeep=false;nodeConnectionsEnabled=false;activePath=[familyToken(key.slice(7))];render()}
  });
  function changePage(delta){connectionListPage+=delta;section.remove();detail.querySelector('#detailNodeConnections')?.remove();renderNodeConnectionDetails();detail.querySelector('.nodeConnectionSection').scrollIntoView({block:'start'})}
  section.querySelector('#connectionsPrev')?.addEventListener('click',()=>changePage(-1));section.querySelector('#connectionsNext')?.addEventListener('click',()=>changePage(1));
}
function fitEvidenceContext(){
  if(!evidenceContextPoints.length)return;
  const v=readViewport(),box=graph.getBoundingClientRect();
  let left=v[0],top=v[1],right=v[0]+v[2],bottom=v[1]+v[3];
  for(const p of evidenceContextPoints){left=Math.min(left,p.x-p.pad);right=Math.max(right,p.x+p.pad);top=Math.min(top,p.y-p.pad);bottom=Math.max(bottom,p.y+p.pad)}
  const aspect=box.width/box.height;
  let width=right-left,height=bottom-top;
  if(width/height<aspect)width=height*aspect;else height=width/aspect;
  graph.setAttribute('viewBox',`${(left+right-width)/2} ${(top+bottom-height)/2} ${width} ${height}`);
}

function augmentEvidenceDetails(){
  const token=currentToken();
  if(token?.kind!=="node")return;
  const node=nodeById.get(token.id);
  const relations=[...(incomingById.get(node.id)||[]),...(outgoingById.get(node.id)||[])];
  const section=document.createElement("section");section.className="detailSection";
  section.innerHTML='<h3>EVIDENCE RELATIONSHIPS · '+relations.length+'</h3><p>Original scientific relationships, independent of navigation placement.</p>'+(nodeConnectionsEnabled?'<p>All recorded scientific links are included in the connection list above.</p>':'<div class="evidenceList">'+relations.slice(0,36).map(e=>{
    const other=nodeById.get(e.source===node.id?e.target:e.source);
    return '<button class="nodeLink" data-evidence-node="'+esc(other.id)+'"><span>'+esc(other.label)+'</span><small>'+esc(e.source===node.id?'→ '+e.type:e.type+' → here')+'</small></button>';
  }).join("")+'</div>'+(relations.length>36?'<button id="showRemainingConnections" class="nodeLink">SHOW ALL '+relations.length+' RELATIONSHIPS</button>':''));
  detail.append(section);
  section.querySelectorAll("[data-evidence-node]").forEach(button=>button.onclick=()=>activateSearchResult(nodeById.get(button.dataset.evidenceNode)));
  section.querySelector('#showRemainingConnections')?.addEventListener('click',toggleNodeConnections);
  const placements=(navigation.taxonomy||[]).filter(p=>p.child===node.id);
  const facets=(navigation.identities||[]).filter(p=>p.left===node.id||p.right===node.id);
  if(placements.length||facets.length){
    const links=document.createElement("section");links.className="detailSection";
    links.innerHTML='<h3>REVIEWED PLACEMENTS & CONCEPT FACETS</h3>'+[...placements.map(p=>({id:p.parent,type:'specialty of'})),...facets.map(p=>({id:p.left===node.id?p.right:p.left,type:p.type}))].map(p=>'<button class="nodeLink" data-facet="'+esc(p.id)+'"><span>'+esc(nodeById.get(p.id)?.label||familyById.get(p.id.replace('family:',''))?.short||p.id)+'</span><small>'+esc(p.type)+'</small></button>').join('');detail.append(links);
    links.querySelectorAll('[data-facet]').forEach(button=>button.onclick=()=>{
      const id=button.dataset.facet;
      if(nodeById.has(id))activateSearchResult(nodeById.get(id));
      else{expandAll=false;expandFieldDeep=false;activePath=[familyToken(id.replace('family:',''))];render()}
    });
  }
  const assertions=(model.evidence_reviews||[]).flatMap(bundle=>bundle.assertions).filter(a=>a.canonical_record?.id===node.id&&a.target_kind==='node');
  const quotes=document.createElement("section");quotes.className="detailSection";
  quotes.innerHTML='<h3>EXACT REVIEWED SUPPORT</h3>'+(assertions.length?assertions.map(a=>'<p>'+esc(a.statement)+'</p>'+a.support.map(span=>'<blockquote>'+esc(span.quote)+'</blockquote><small>'+esc(span.source_id)+' · retained revision '+esc(span.source_sha256.slice(0,12))+'</small>').join('')).join(''):'<p>No source-to-assertion review is retained for this legacy record yet. Citation presence alone does not establish support.</p>');
  detail.append(quotes);
}
