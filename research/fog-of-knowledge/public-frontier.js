let publicFrontierPage=0;
function frontierRecords(){
  return model.nodes.filter(n=>n.frontier||(n.public_frontier&&evidenceIndex.states[n.id]==='evidence-reviewed'));
}
function bindPublicFrontier(){
  const atlas=document.querySelector('#atlasTab'),frontier=document.querySelector('#publicFrontierTab'),panel=document.querySelector('#publicFrontier');
  atlas.onclick=()=>{document.body.classList.remove('publicFrontierOpen');panel.hidden=true;atlas.setAttribute('aria-selected','true');frontier.setAttribute('aria-selected','false');massiveAtlas?.schedule()};
  frontier.onclick=()=>{document.body.classList.add('publicFrontierOpen');panel.hidden=false;atlas.setAttribute('aria-selected','false');frontier.setAttribute('aria-selected','true');renderPublicFrontier()};
  [atlas,frontier].forEach((tab,index)=>tab.addEventListener('keydown',ev=>{if(['ArrowLeft','ArrowRight'].includes(ev.key)){ev.preventDefault();const target=index?atlas:frontier;target.focus();target.click()}}));
}
function renderPublicFrontier(){
  const panel=document.querySelector('#publicFrontier'),records=frontierRecords();publicFrontierPage=0;
  panel.innerHTML='<h2 id="publicFrontierTitle">Public Frontier</h2><p>The recorded edge of the atlas: open scientific questions and evidence-reviewed public technology disclosures. This inventory is still being built; it does not yet establish the latest state of knowledge across every field.</p><p>Company and tool names belong here when a public source confirms them. Unshared capabilities remain <b>undisclosed</b>. A source date records a disclosure; it does not prove that a record is still the world’s leading result.</p><div class="frontierFilters"><input id="frontierSearch" type="search" aria-label="Search public frontier" placeholder="Search questions, companies, tools…"><select id="frontierDomain" aria-label="Filter field"><option value="">All fields</option>'+FAMILIES.map(f=>'<option value="'+esc(f.id)+'">'+esc(f.short)+'</option>').join('')+'</select><select id="frontierCategory" aria-label="Filter record category"><option value="">Questions & public disclosures</option><option value="question">Open questions</option><option value="company-tool">Companies & tools</option></select></div><p id="frontierInventoryCount"></p><div id="frontierCards" class="frontierCards"></div><button id="frontierNext" class="frontierNext" hidden>SHOW MORE</button>';
  const search=panel.querySelector('#frontierSearch'),domain=panel.querySelector('#frontierDomain'),category=panel.querySelector('#frontierCategory');
  const update=()=>{
    const q=search.value.toLocaleLowerCase(),values=records.filter(n=>(!domain.value||n.domain===domain.value)&&(!category.value||(category.value==='question'?n.frontier:n.public_frontier?.category===category.value))&&[n.label,n.summary,n.public_frontier?.company,n.public_frontier?.tool].filter(Boolean).join(' ').toLocaleLowerCase().includes(q));
    // Sort dated, reviewed disclosures by their explicit date. Undated questions
    // remain alphabetical; graph insertion order is never a freshness signal.
    values.sort((a,b)=>String(b.public_frontier?.disclosed_at||'').localeCompare(String(a.public_frontier?.disclosed_at||''))||a.label.localeCompare(b.label));
    const reviewed=values.filter(n=>evidenceIndex.states[n.id]==='evidence-reviewed').length;
    panel.querySelector('#frontierInventoryCount').textContent=`${values.length} recorded entries · ${reviewed} evidence-reviewed · ${values.length-reviewed} awaiting source-to-assertion review`;
    const cards=panel.querySelector('#frontierCards');cards.replaceChildren();
    const display=values.slice(0,(publicFrontierPage+1)*60);
    for(const node of display){
      const metadata=node.public_frontier||{},reviewed=evidenceIndex.states[node.id]==='evidence-reviewed',card=document.createElement('article');card.className='frontierCard';
      const sources=(node.sources||[]).filter(s=>/^https?:\/\//.test(s.url||''));
      card.innerHTML='<small>'+esc(familyById.get(node.domain)?.short||node.domain)+'</small><h3>'+esc(node.label)+'</h3><span class="frontierBadge">'+(reviewed?'Source-to-assertion review retained':'Legacy frontier · not evidence-reviewed')+'</span><p>'+esc(node.summary||'No assertion summary recorded.')+'</p>'+(metadata.company?'<p>Company: '+esc(metadata.company)+'<br>Tool: '+esc(metadata.tool||'Not specified')+'<br>Capability disclosure: '+esc(metadata.capability_status||'undisclosed')+'</p>':'')+'<p>Public disclosure date: '+esc(metadata.disclosed_at||'Not recorded')+'</p><p>'+sources.map(source=>'<a href="'+esc(source.url)+'" target="_blank" rel="noreferrer">'+esc(source.title||source.id||'Recorded source')+'</a>').join('<br>')+'</p><button type="button">OPEN IN CIRCUIT</button>';
      card.querySelector('button').onclick=()=>{document.querySelector('#atlasTab').click();activateSearchResult(node)};cards.append(card);
    }
    if(!values.length)cards.textContent=category.value==='company-tool'?'No evidence-reviewed company/tool disclosures have been added yet. Publicly sourced candidates enter through the evidence compiler.':'No matching recorded frontiers.';
    const more=panel.querySelector('#frontierNext');more.hidden=display.length>=values.length;more.onclick=()=>{publicFrontierPage++;update()};
  };
  for(const input of [search,domain,category])input.addEventListener('input',()=>{publicFrontierPage=0;update()});update();
}
