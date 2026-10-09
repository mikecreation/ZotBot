/* GitHub workspace: browse, discover Nemesis projects, use project, run context, CI. Read-only this pass. */
(() => {
  'use strict';
  const E = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const enc = encodeURIComponent;
  const CREW_CLIENT_REVISION = 'gh-evidence-5';
  const $ = s => document.querySelector(s);
  let host = null, view = 'home', owner = '', repo = '', path = '', filePath = '', status = null, repos = null;
  let meta = null, tree = null, projects = null, active = null, context = null, ci = null, file = null;
  let notice = '', busy = false, connectTimer = null, atlasUrl = '', atlasTitle = '', atlasPath = '', crew = null, crewTimer = null, batches = null, lastPropose = null, automateMerge = true;
  let crewPollBusy = false, atlasSha = '', atlasSyncNotice = '', atlasSyncBusy = false;
  let noticeConnectionError = false;
  const refreshedMerges = new Set();

  async function api(path, body) {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 45000);
    try {
      const r = await fetch(path, {cache:'no-store', signal:controller.signal, ...(body === undefined ? {} : {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)})});
      let d; try { d = await r.json(); } catch { throw Error('Unreadable response from the local GitHub workspace.'); }
      if (!r.ok) throw Error(d.error || d.detail || ('Request failed (' + r.status + ')'));
      return d;
    } catch (error) {
      if (error.name === 'AbortError') {
        const timeout=Error('Local workspace request timed out. Background jobs remain retained; status will reconnect automatically.');
        timeout.workspaceConnection=true;throw timeout;
      }
      if(error.name==='TypeError')error.workspaceConnection=true;
      throw error;
    } finally { clearTimeout(timer); }
  }
  function say(t){ noticeConnectionError=false;notice = t || ''; paint(); }
  function sayError(error){ noticeConnectionError=error.workspaceConnection===true;notice=error.message||String(error);paint(); }
  function clearConnectionNotice(){
    if(!noticeConnectionError)return;
    notice='';noticeConnectionError=false;
    host?.querySelectorAll('[data-gh-connection-notice]').forEach(el=>el.remove());
  }
  function setHash(){
    let h = '#github';
    if (view === 'atlas' && owner && repo) {
      h += '/atlas/' + owner + '/' + repo;
      if (atlasPath) h += '?' + new URLSearchParams({path: atlasPath}).toString();
    } else if (owner && repo) {
      h += '/' + owner + '/' + repo;
      if (filePath) h += '/blob/' + filePath.split('/').map(enc).join('/');
      else if (path) h += '/tree/' + path.split('/').map(enc).join('/');
    }
    if (location.hash !== h) history.replaceState(null, '', h);
  }
  function parseHash(){
    const raw = String(location.hash || '').replace(/^#/, '');
    if (!raw.startsWith('github')) return false;
    const [pathPart, queryPart] = raw.split('?');
    const parts = pathPart.split('/').map(decodeURIComponent);
    if (parts[1] === 'atlas') {
      owner = parts[2] || ''; repo = parts[3] || '';
      const q = new URLSearchParams(queryPart || '');
      atlasPath = q.get('path') || '';
      path = atlasPath; filePath = '';
      view = owner && repo ? 'atlas' : 'home';
      return true;
    }
    owner = parts[1] || ''; repo = parts[2] || '';
    const kind = parts[3] || '';
    const rest = parts.slice(4).join('/');
    filePath = kind === 'blob' ? rest : '';
    path = kind === 'tree' ? rest : '';
    atlasPath = ''; atlasUrl = ''; atlasTitle = '';
    view = owner && repo ? (filePath ? 'file' : 'repo') : 'home';
    return true;
  }

  function empty(title, text){ return `<div class="workspace-empty"><strong>${E(title)}</strong>${E(text)}</div>`; }
  function eyebrow(t){ return `<span class="workspace-eyebrow">${E(t)}</span>`; }
  function badge(cls, label){ return `<span class="gh-badge ${cls}">${E(label)}</span>`; }
  function crumbs(){
    if (!owner) return '';
    const bits = [`<button type="button" data-gh="home">GitHub</button>`, `<button type="button" data-gh="open-repo" data-owner="${E(owner)}" data-repo="${E(repo)}">${E(owner)}/${E(repo)}</button>`];
    const segs = (filePath || path || '').split('/').filter(Boolean);
    let acc = '';
    segs.forEach((s,i) => {
      acc = acc ? acc + '/' + s : s;
      const last = i === segs.length - 1;
      bits.push(last ? `<span>${E(s)}</span>` : `<button type="button" data-gh="cd" data-path="${E(acc)}">${E(s)}</button>`);
    });
    return `<nav class="gh-crumbs" aria-label="Path">${bits.join('<span aria-hidden="true"> / </span>')}</nav>`;
  }

  function isConnected(){ return !!(status && status.mode === 'authenticated' && status.login); }

  function connectCard(){
    const st = status || {};
    const c = st.connect || {};
    if (isConnected()) {
      return `<section class="workspace-section gh-card gh-connected"><div class="gh-card-head">${eyebrow('ACCOUNT')}${badge('ok','Signed in')}</div>
        <p>Signed in as <strong>${E(st.login)}</strong>. Private repos are available. Your token stays on this computer and is never sent to the browser.</p>
        <p class="workspace-muted">Rate limit: ${E(st.rate?.remaining ?? '—')} / ${E(st.rate?.limit ?? '—')} remaining.</p></section>`;
    }
    if (c.state === 'pending' || c.state === 'starting' || c.state === 'waiting') {
      return `<section class="workspace-section gh-card"><div class="gh-card-head">${eyebrow('ACCOUNT')}${badge('warn','Waiting for you')}</div>
        <p>1. Open <a href="${E(c.url||'https://github.com/login/device')}" target="_blank" rel="noopener">github.com/login/device</a></p>
        <p>2. Enter this one-time code:</p>
        <p class="gh-code">${E(c.user_code || c.code || '…')}</p>
        <p class="workspace-muted">This page updates when GitHub confirms the login.</p>
        <button type="button" data-gh="cancel-connect">Cancel</button></section>`;
    }
    const failed = c.state === 'failed' || c.state === 'error';
    return `<section class="workspace-section gh-card"><div class="gh-card-head">${eyebrow('ACCOUNT')}${badge('muted','Public browse')}</div>
      <p><strong>You do not need to sign in to open public repos</strong> like mikecreation/ZotBot. That is why Fog of Knowledge can show while this says you are not signed in. Sign in only if you need private repos or higher rate limits.</p>
      ${failed ? `<p class="gh-err">Last connect attempt failed${c.detail ? ': ' + E(String(c.detail).split('\\n')[0].slice(0,180)) : '.'} Click Connect and enter a fresh code.</p>` : ''}
      <button type="button" class="workspace-primary" data-gh="connect" ${busy?'disabled':''}>Connect GitHub</button>
      ${st.gh_installed ? '' : '<p class="workspace-muted">Install the GitHub CLI (<code>gh</code>) on this PC if Connect fails.</p>'}</section>`;
  }

  function contextCard(){
    if (!context) return '';
    const s = context.summary || {};
    const counts = s.counts || {};
    const lists = s.lists || {};
    const frontier = (lists.frontier_nodes?.first || []).slice(0, 8);
    const challenged = (lists.challenged_nodes?.first || []).slice(0, 8);
    const domains = (s.table?.rows || []).slice(0, 8);
    const ok = context.exit_code === 0 && !context.error;
    return `<section class="workspace-section gh-card" id="gh-snapshot"><div class="gh-card-head">${eyebrow('PROJECT SNAPSHOT')}${badge(ok?'ok':'warn', ok ? 'Fresh' : 'Failed')}</div>
      <p class="workspace-muted">Optional status report from the context script. For the interactive map, use Open atlas.</p>
      ${context.error ? `<p class="gh-err">${E(context.error)}</p>` : ''}
      ${s.headline ? `<h3 class="gh-headline">${E(s.headline)}</h3>` : ''}
      <div class="gh-stats">
        <div><b>${E(counts.nodes ?? '—')}</b><span>nodes</span></div>
        <div><b>${E(counts.edges ?? '—')}</b><span>edges</span></div>
        <div><b>${E(counts.frontier ?? '—')}</b><span>frontier</span></div>
        <div><b>${E(counts.challenged ?? '—')}</b><span>challenged</span></div>
        <div><b>${E(counts.reviews ?? '—')}</b><span>reviews</span></div>
      </div>
      ${domains.length ? `<h4>Coverage by domain</h4><ul class="gh-ci">${domains.map(r => `<li><strong>${E(r[1]||r[0])}</strong> · ${E(r[2])} nodes · ${E(r[6])} frontier</li>`).join('')}</ul>` : ''}
      ${frontier.length ? `<h4>Frontier</h4><ul class="gh-ci">${frontier.map(x => `<li>${E(x)}</li>`).join('')}</ul>` : ''}
      ${challenged.length ? `<h4>Challenged / falsified</h4><ul class="gh-ci">${challenged.map(x => `<li>${E(x)}</li>`).join('')}</ul>` : ''}
      <p class="workspace-muted">${E(context.command||'')} · commit ${(context.sha||'').slice(0,7)} · ${E(context.duration!=null ? context.duration+'s' : '')}</p>
      <details class="gh-raw"><summary>Show raw report</summary><pre class="gh-pre">${E(JSON.stringify(s,null,2).slice(0,8000))}</pre></details>
    </section>`;
  }

  function homeView(){
    const list = (repos?.yours?.length ? repos.yours : (repos?.recent||[])).concat(repos?.search||[]);
    const rows = list.length ? list.map(r => {
      const name = r.full_name || (r.owner + '/' + r.name);
      const [o,n] = name.split('/');
      return `<button type="button" class="gh-repo" data-gh="open-repo" data-owner="${E(o)}" data-repo="${E(n)}"><strong>${E(name)}</strong><small>${E(r.private?'Private':'Public')} · ${E(r.default_branch||'main')}</small></button>`;
    }).join('') : empty(isConnected()?'No repos returned.':'No private repo list yet.','Connect GitHub for your account’s repos, or paste a public link below.');
    const act = active?.active || active;
    const activeBlock = act && act.owner ? `<aside class="gh-active"><div><h3>Remembered project</h3><p><strong>${E(act.name||act.project_id)}</strong> in ${E(act.owner)}/${E(act.repo)} · <code>${E(act.path)}</code></p><p class="workspace-muted">Remembered means selected for Nemesis. Use Open atlas for the map.</p></div>
      <button type="button" class="workspace-primary" data-gh="open-atlas-active" data-owner="${E(act.owner)}" data-repo="${E(act.repo)}" data-path="${E(act.path)}">Open atlas</button></aside>` : '';
    return `<header class="workspace-page-head">${eyebrow('GITHUB WORKSPACE')}<h1>Your repositories</h1><p>Open a repo, find Nemesis projects, then open the atlas full-page when the project has a map UI.</p></header>
      ${connectCard()}${crewCard()}${batchCard()}${activeBlock}
      <section class="workspace-section"><form class="gh-open" data-gh-form="open"><label>Open a GitHub link or <code>owner/repo</code><input name="url" placeholder="https://github.com/mikecreation/ZotBot" maxlength="300" autocomplete="off"></label><button class="workspace-primary" type="submit">Open</button></form>
      <div class="gh-repo-list">${rows}</div></section>`;
  }

  function projectCard(p){
    const ready = p.valid !== false && !((p.errors||[]).length);
    const act = active?.active || active;
    const isActive = !!(act && act.path === p.path && act.repo === repo && act.owner === owner);
    return `<article class="gh-project ${ready?'ready':''}">
      <div class="gh-card-head"><strong>${E(p.name||p.project_id||p.path)}</strong>${badge(ready?'ok':'muted','Nemesis ready')}${isActive?badge('ok','Active'):''}</div>
      <p class="workspace-muted"><code>${E(p.path)}</code> · ${E(p.protocol||'')} ${E(p.version||'')}</p>
      <p>${E(p.purpose||'')}</p>
      <p class="workspace-muted">Open atlas shows the interactive Fog map. Expand map with Brain + 3 workers starts the crew on sourced batches. Snapshot is optional status only.</p>
      <div class="workspace-output-actions">
        <button type="button" class="workspace-primary" data-gh="open-atlas" data-path="${E(p.path)}" ${busy?'disabled':''}>${busy?'Opening atlas…':'Open atlas'}</button>
        <button type="button" data-gh="run-context" data-path="${E(p.path)}" ${busy?'disabled':''}>Load snapshot</button>
        <button type="button" data-gh="use" data-path="${E(p.path)}" ${busy?'disabled':''}>${isActive?'Remembered ✓':'Remember project'}</button>
        <button type="button" data-gh="cd" data-path="${E(p.path)}">Browse files</button>
      </div></article>`;
  }

  function treeView(){
    const entries = (tree?.entries||[]).slice().sort((a,b)=>(a.type===b.type?a.name.localeCompare(b.name):(a.type==='dir'?-1:1)));
    const rows = entries.map(e => e.type==='dir'
      ? `<button type="button" class="gh-entry dir" data-gh="cd" data-path="${E(e.path)}">📁 ${E(e.name)}</button>`
      : `<button type="button" class="gh-entry file" data-gh="file" data-path="${E(e.path)}">📄 ${E(e.name)} <small>${E(e.size||0)} B</small></button>`).join('') || empty('Empty folder.','Nothing here at this path.');
    const parent = path.includes('/') ? path.split('/').slice(0,-1).join('/') : '';
    const up = path ? `<button type="button" data-gh="cd" data-path="${E(parent)}">↑ Parent folder</button>` : '';
    const proj = (projects?.projects||[]).map(projectCard).join('') || empty('No Nemesis projects found.','A folder becomes a project when it contains a valid <code>.nemesis.json</code>.');
    const checks = (ci?.checks||[]).map(c => `<li><strong>${E(c.name)}</strong> · ${E(c.status)} / ${E(c.conclusion||'—')} ${c.html_url?`<a href="${E(c.html_url)}" target="_blank" rel="noopener">GitHub Actions log</a>`:''}</li>`).join('');
    const runs = (ci?.runs||[]).map(r => `<li><strong>${E(r.name)}</strong> · ${E(r.conclusion||r.status||'—')} · ${E(r.event||'')} ${r.html_url?`<a href="${E(r.html_url)}" target="_blank" rel="noopener">GitHub Actions run</a>`:''}</li>`).join('');
    const ciBlock = ci ? `<section class="workspace-section gh-card"><div class="gh-card-head">${eyebrow('GITHUB ACTIONS')}${badge(((ci.checks||[]).some(c=>c.conclusion==='success')||(ci.runs||[]).some(r=>r.conclusion==='success'))?'ok':'muted','Latest on GitHub')}</div>
      <p class="workspace-muted">These are the repo’s CI checks on GitHub (did the last push’s validation job pass?). Links open GitHub’s Actions page — they are not a Nemesis screen.</p>
      <ul class="gh-ci">${checks}${runs}</ul></section>` : '';
    return `<header class="workspace-page-head">${crumbs()}${eyebrow('REPOSITORY')}<h1>${E(owner)}/${E(repo)}</h1>
      <p>${E(meta?.description||'Browse files, find Nemesis projects, remember one as active, and read a project snapshot.')}</p>
      <div class="workspace-output-actions"><button type="button" data-gh="soft-refresh" ${busy?'disabled':''} title="Refresh repo/atlas/batch UI cache. Does not reload the page or remount ChatGPT Brain/worker tabs.">Refresh</button>
      <button type="button" data-gh="reload-repo" ${busy?'disabled':''}>Reload</button>
      <button type="button" data-gh="cd" data-path="">Repo root</button></div></header>
      ${connectCard()}${crewCard()}${batchCard()}${ciBlock}
      ${contextCard()}
      <section class="workspace-section"><h2>Nemesis projects</h2>${proj}</section>
      <section class="workspace-section"><div class="gh-card-head"><h2>Files${path?': '+E(path):''}</h2>${up}</div><div class="gh-tree">${rows}</div></section>`;
  }

  function fileView(){
    const body = !file ? empty('Loading file…','') : file.binary
      ? empty('Binary file', `${file.bytes||0} bytes. Not shown as text.`)
      : `<pre class="gh-pre">${E((file.text||'').slice(0,120000))}${file.truncated?'\n… truncated …':''}</pre>`;
    return `<header class="workspace-page-head">${crumbs()}${eyebrow('FILE')}<h1>${E(filePath)}</h1>
      <p class="workspace-muted">${E(file?.bytes||0)} bytes · sha ${(file?.sha||'').slice(0,7)}</p>
      <button type="button" data-gh="cd" data-path="${E(filePath.split('/').slice(0,-1).join('/'))}">← Back to folder</button></header>${body}`;
  }

  function scrollSnapshot(){
    requestAnimationFrame(() => {
      const el = host && host.querySelector('#gh-snapshot');
      if (el) el.scrollIntoView({behavior:'smooth', block:'start'});
    });
  }
  function atlasView(){
    const title = atlasTitle || 'Project atlas';
    const src = atlasUrl || 'about:blank';
    const pool = (crew && crew.pool) || {};
    const crewMini = ['primary','worker_1','worker_2','worker_3'].map(s => {
      const info = pool[s] || {};
      const label = s === 'primary' ? 'Brain' : s.replace('worker_','W');
      return `<span class="gh-crew-mini">${E(label)}:${E(info.connected ? (info.state||'ON') : 'OFF')}</span>`;
    }).join('');
    return `<div class="gh-atlas-full">
      <header class="gh-atlas-bar">
        <button type="button" data-gh="atlas-back">← Back to GitHub</button>
        <button type="button" data-gh="soft-refresh" ${busy?'disabled':''} title="Refresh atlas/repo cache UI only. Keeps #github and does not remount ChatGPT workers.">Refresh</button>
        <strong>${E(title)}</strong>
        <span class="workspace-muted">${E(owner)}/${E(repo)}${atlasPath ? ' · ' + atlasPath : ''}</span>
        <span class="gh-crew-mini-row">${crewMini}</span>
        <button type="button" class="workspace-primary" data-gh="expand-crew" ${busy?'disabled':''}>${crew?.evidence?.coverage?.enabled?'Pause expansion queue':'Expand map with crew'}</button>
      </header>
      ${notice ? `<p class="gh-atlas-notice" role="status" ${noticeConnectionError?'data-gh-connection-notice':''}>${E(notice)}</p>` : ''}
      <div class="gh-evidence-progress" role="status">${crewProgress()}</div>
      <iframe class="gh-atlas-frame" allowfullscreen src="${E(src)}" title="${E(title)}"></iframe>
    </div>`;
  }
  function paint(opts){
    if (!host) return;
    if (view === 'atlas') {
      if (host.querySelector('.gh-atlas-full')) atlasSoftPaint();
      else host.innerHTML = atlasView();
      document.body.classList.add('gh-atlas-mode');
      return;
    }
    document.body.classList.remove('gh-atlas-mode');
    let html = notice ? `<p class="gh-notice" role="status" ${noticeConnectionError?'data-gh-connection-notice':''}>${E(notice)}</p>` : '';
    if (view === 'home') html += homeView();
    else if (view === 'file') html += fileView();
    else html += treeView();
    host.innerHTML = html;
    if (opts && opts.scrollSnapshot) scrollSnapshot();
  }


  const FOG_OBJECTIVE = 'Continuously expand Fog of Knowledge across all atlas fields using its persistent coverage queue. Produce exact source-bound records, independent reviews and verified publication. Preserve historical errors and uncertain evidence; do not chase money missions.';

  function crewCard(){
    const pool = (crew && crew.pool) || {};
    const slots = ['primary','worker_1','worker_2','worker_3'];
    const labels = {primary:'Brain (boss)', worker_1:'Worker 1', worker_2:'Worker 2', worker_3:'Worker 3'};
    const pills = slots.map(s => {
      const info = pool[s] || {};
      const st = info.connected ? (info.state || 'READY') : 'OFF';
      const cls = !info.connected ? 'muted' : (st === 'READY' || st === 'COMPLETE' ? 'ok' : (st === 'FAILED' || st === 'DISCONNECTED' ? 'warn' : 'ok'));
      return `<span class="gh-crew-pill"><b>${E(labels[s])}</b>${badge(cls, st)}</span>`;
    }).join('');
    const detail = (crew && crew.detail) || 'Bind ChatGPT tabs in the extension to see live crew status.';
    return `<section class="workspace-section gh-card gh-crew"><div class="gh-card-head">${eyebrow('FOG CREW')}${badge(crew && crew.connected ? 'ok' : 'warn', crew && crew.state ? crew.state : 'UNKNOWN')}</div>
      <p>Connected workers discover sources, construct exact candidates and review the evidence in separate stages.</p>
      <div class="gh-evidence-progress" role="status">${crewProgress()}</div>
      <div class="gh-crew-row">${pills}</div>
      <p class="workspace-muted">${E(String(detail).slice(0,220))}</p>
      <div class="workspace-output-actions">
        <button type="button" class="workspace-primary" data-gh="expand-crew" ${busy?'disabled':''}>${crew?.evidence?.coverage?.enabled?'Pause expansion queue':'Expand map with crew'}</button>
        <button type="button" data-gh="goto-research">Watch on Research page</button>
        <button type="button" data-gh="refresh-crew">Refresh crew</button>
      </div></section>`;
  }

  function crewWorking(){
    if (busy) return true;
    if (crew?.evidence?.flows?.some(f=>!['MERGED','PR_OPEN','READY','BLOCKED','STALE','QUARANTINED'].includes(f.state)) || crew?.evidence?.discoveries?.some(d=>!['HANDED_OFF','BLOCKED','QUARANTINED'].includes(d.state))) return true;
    const pool = (crew && crew.pool) || {};
    const hot = {GENERATING:1, SENT:1, CLAIMED:1, WORKING:1, WAITING_REPLY:1};
    if (crew && hot[crew.state]) return true;
    return ['primary','worker_1','worker_2','worker_3'].some(s => {
      const info = pool[s] || {};
      return !!(hot[info.state] || info.active_job_id);
    });
  }

  function crewProgress(){
    const evidence = crew?.evidence;
    if (crew?.status_error) return `<strong class="gh-evidence-warning">Status connection interrupted</strong>: ${E(crew.status_error)}. Reconnecting automatically; saved workflow records are retained.`;
    if (!evidence) return 'Checking evidence workflow…';
    if (evidence.client_revision && evidence.client_revision !== CREW_CLIENT_REVISION) return 'Nemesis was upgraded. <button type="button" data-gh="reload-client">Reload this page</button> before starting another crew.';
    if (!evidence.running || evidence.last_error) return `<strong class="gh-evidence-warning">Evidence workflow unavailable</strong>: ${E(evidence.last_error || 'server handoff is not running')}. Saved candidates are retained.`;
    const flows = evidence.flows || [], discoveries = evidence.discoveries || [];
    const parts = [];
    const coverage=evidence.coverage;
    if(coverage && (coverage.enabled || coverage.visited_branches)){
      const totals=coverage.totals||{}, states=coverage.states||{};
      const label=coverage.enabled?'Continuous atlas expansion':'Expansion queue paused · current batches finish';
      parts.push(`<div class="gh-evidence-line"><strong>${E(label)}</strong><span class="gh-evidence-reason">${coverage.visited_branches||0}/${coverage.eligible_branches||0} branches visited · ${(coverage.domains||[]).filter(d=>d.visited).length}/${(coverage.domains||[]).length} fields · ${totals.new_nodes||0} new reviewed targets · ${totals.updated_nodes||0} reviewed updates · ${totals.edges||0} proposed edges in merged batches · ${states.HELD||0} held branches</span>${coverage.error?`<span class="gh-evidence-reason">${E(coverage.error)}</span>`:''}</div>`);
      (coverage.active_tasks||[]).forEach(task=>parts.push(`<div class="gh-evidence-line"><strong>${E(task.label)}</strong> <span>${E(task.domain)} · ${E(task.state.toLowerCase())}</span></div>`));
    }
    const pending = discoveries.filter(d=>d.state!=='HANDED_OFF');
    pending.forEach(d=>parts.push(flowProgress(d, true)));
    flows.slice().sort((a,b)=>(b.updated_at||b.created_at||0)-(a.updated_at||a.created_at||0)).slice(0,12).forEach(f=>parts.push(flowProgress(f)));
    if (atlasSyncNotice) parts.unshift(`<div class="gh-evidence-line">${E(atlasSyncNotice)}</div>`);
    return parts.join('') || 'Evidence crew ready. Expand starts discovery → capture → candidates → two reviews → validation → CI → merge. The atlas changes after a verified merge.';
  }

  function flowProgress(flow, discovery=false){
    const state=String(flow.state||'UNKNOWN'), retry=flow.retry||{};
    const retryAt=Number(retry.next_at||0)*1000;
    let label, tone='working';
    if (state==='MERGED') { label='Merged into the atlas'; tone='success'; }
    else if (state==='PR_OPEN') { label='Reviewed PR open · awaiting merge'; tone='ready'; }
    else if (state==='READY') { label='Reviews passed · ready to publish'; tone='ready'; }
    else if (state==='STALE') { label='Context changed · candidate retained'; tone='held'; }
    else if (state==='QUARANTINED' || state==='BLOCKED') {
      tone='held';
      label=flow.failure_kind==='scientific'?'Evidence inconclusive · candidate quarantined':flow.failure_kind==='operational'?'Workflow needs recovery · candidate retained':'Candidate validation held · no graph changes';
    } else {
      label=({CAPTURE:'Capturing source bytes',AUTHOR:'Constructing exact candidates',REPAIR:'Repairing candidate format',REVIEW:'Entailment and adversarial reviews',PUBLISH:'Compiler checks and PR publication',CI:'Waiting for GitHub validation',RETRY:'Automatic recovery',QUEUED:'Source discovery queued',CLAIMED:'Source discovery claimed',SENT:'Discovering primary sources'})[state]||(discovery?'Source discovery: ':'Evidence stage: ')+state.toLowerCase();
    }
    if (retryAt) { label += ' · recovery scheduled '+new Date(retryAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}); }
    else if (retry.attempt) label += ' · recovery attempt '+retry.attempt;
    const reason=flow.publication_wait?'Waiting for '+flow.publication_wait+' to finish publication; reviewed candidate retained.':flow.error||retry.last_error;
    const pub=flow.publication||{};
    const prUrl=/^https:\/\/github\.com\//.test(pub.pr_url||'')?` <a href="${E(pub.pr_url)}" target="_blank" rel="noopener">View PR</a>`:'';
    return `<div class="gh-evidence-line ${tone}"><strong>${E(label)}</strong> <span class="gh-evidence-id">${E(flow.batch_id||flow.mission||flow.job_id||'')}</span>${prUrl}${reason?`<span class="gh-evidence-reason">${E(reason)}</span>`:''}${revisionProgress(flow)}${failureProgress(flow)}</div>`;
  }

  function revisionProgress(flow){
    const budget=flow.revision_budget||{}, counts=flow.revision_counts||{}, parts=[];
    if(Number.isInteger(budget.total_attempts))parts.push('Candidate attempts '+(flow.author_attempt||1)+'/'+budget.total_attempts);
    if(Number.isInteger(budget.format_revisions))parts.push('Format revisions '+(counts.format||0)+'/'+budget.format_revisions);
    if(Number.isInteger(budget.scientific_revisions))parts.push('Evidence revisions '+(counts.scientific||0)+'/'+budget.scientific_revisions);
    const exhausted=flow.revision_exhausted;
    if(exhausted)parts.push('Revision limit reached ('+exhausted.budget+': '+exhausted.used+'/'+exhausted.limit+') · candidate retained');
    return parts.length?`<span class="gh-evidence-reason">${E(parts.join(' · '))}</span>`:'';
  }

  function failureProgress(flow){
    const failure=flow.failure_details;
    if(!failure||typeof failure!=='object')return '';
    const details=failure.details||{}, decisions=Array.isArray(details.decisions)?details.decisions:[];
    const role=details.role||'', code=failure.code||flow.error_code||'';
    const key=[flow.batch_id||flow.job_id,code,role].join(':');
    let body='';
    const historical=['MERGED','READY','PUBLISH','CI','PR_OPEN'].includes(flow.state)||(Number.isInteger(failure.author_attempt)&&Number.isInteger(flow.author_attempt)&&failure.author_attempt<flow.author_attempt);
    if(Number.isInteger(failure.author_attempt))body+=`<p class="workspace-muted">Candidate attempt ${failure.author_attempt}${failure.stage?' · '+E(String(failure.stage).toLowerCase())+' stage':''}</p>`;
    if(failure.message)body+=`<p>${E(failure.message)}</p>`;
    for(const decision of decisions){
      if(!decision||typeof decision!=='object')continue;
      body+=`<p><strong>${E(decision.outcome||'Review decision')}</strong>${decision.assertion_id?' · '+E(decision.assertion_id):''}</p>`;
      if(decision.rationale)body+=`<p>${E(decision.rationale)}</p>`;
      if(decision.limitations)body+=`<p class="workspace-muted"><strong>Limitations:</strong> ${E(decision.limitations)}</p>`;
      const checks=decision.checks||{}, failed=Object.keys(checks).filter(name=>checks[name]===false);
      if(failed.length)body+=`<p class="workspace-muted">Checks requiring revision: ${E(failed.map(name=>name.replaceAll('_',' ')).join(', '))}</p>`;
    }
    // Non-review failures retain the complete structured compiler diagnostic.
    if(!decisions.length&&Object.keys(details).length)body+=`<pre class="gh-pre">${E(JSON.stringify(details,null,2))}</pre>`;
    if(!body)return '';
    const caption=historical?'Previous revision feedback'+(role?' · '+role:''):role?'Latest '+role+' review feedback':'Failure details';
    return `<details data-gh-review-detail="${E(key)}"><summary>${E(caption)}${code?' · '+E(code):''}</summary>${body}</details>`;
  }

  function updateCrewProgress(progress){
    if(!progress)return;
    const markup=crewProgress();
    if(progress.crewMarkup===markup)return;
    const open=new Set([...progress.querySelectorAll('details[data-gh-review-detail][open]')].map(el=>el.dataset.ghReviewDetail));
    progress.innerHTML=markup;progress.crewMarkup=markup;
    progress.querySelectorAll('details[data-gh-review-detail]').forEach(el=>{el.open=open.has(el.dataset.ghReviewDetail)});
  }

  async function loadCrew(){
    const previous=crew;
    try {
      const st = await api('/api/brain/status');
      let pool = {};
      try {
        const p = await api('/api/brain/pool');
        pool = (p && p.pool) || {};
      } catch (_){ pool = (st && st.pool) || {}; }
      crew = Object.assign({}, st, {pool});
      if(owner&&repo){try{crew.evidence=await api(`/api/github/project/${enc(owner)}/${enc(repo)}/evidence-crew?path=${enc(fogPath())}`)}catch(error){crew.evidence=previous?.evidence;crew.status_error=error.message;}}
      if(!crew.status_error)clearConnectionNotice();
    } catch (error) {
      crew = Object.assign({},previous||{}, {connected:false, state:'UNAVAILABLE', detail:'Brain status unavailable', status_error:error.message, pool:previous?.pool||{}});
    }
  }

  let crewSig = '', batchSig = '';
  function signatureCrew(){
    const pool = (crew && crew.pool) || {};
    return [crew && crew.state, crew && crew.detail,JSON.stringify(crew?.evidence||{})].concat(
      ['primary','worker_1','worker_2','worker_3'].map(s => {
        const i = pool[s] || {};
        return [s, i.state, i.active_job_id || '', i.connected ? 1 : 0].join(':');
      })
    ).join('|');
  }
  function signatureBatches(){
    const list = (batches && batches.batches) || [];
    return list.map(b => [b.batch_id, b.status, (b.check && b.check.ok), (b.propose && b.propose.stage)].join(':')).join('|') + '|' + (lastPropose || '');
  }
  function typingInFog(){
    const a = document.activeElement;
    return !!(a && host.contains(a) && (a.tagName === 'TEXTAREA' || a.tagName === 'INPUT'));
  }
  
  function atlasSoftPaint(){
    if (view !== 'atlas' || !host) return;
    const root=host.querySelector('.gh-atlas-full');
    if (!root) return;
    const tmp = document.createElement('div');
    tmp.innerHTML = atlasView();
    for(const selector of ['.gh-atlas-bar','.gh-evidence-progress']) {
      const old=root.querySelector(selector), neu=tmp.querySelector(selector);
      if(old&&neu)old.replaceWith(neu);
    }
    root.querySelector('.gh-atlas-notice')?.remove();
    const message=tmp.querySelector('.gh-atlas-notice');
    if(message)root.querySelector('.gh-atlas-bar').after(message);
    // Worker/status changes preserve the existing map document, camera and selection.
    const frame=root.querySelector('.gh-atlas-frame');
    if(frame&&atlasUrl&&frame.getAttribute('src')!==atlasUrl)replaceAtlasDocument(frame,atlasUrl);
  }

  function atlasSnapshot(frame){
    try{return frame.contentWindow.FogAtlasState?.snapshot?.()||null}catch(_){return null}
  }
  function replaceAtlasDocument(frame,url){
    const snapshot=atlasSnapshot(frame);
    if(snapshot)frame.addEventListener('load',()=>{
      try{Promise.resolve(frame.contentWindow.FogAtlasState?.restore?.(snapshot)).catch(error=>console.warn('Atlas state restore',error))}catch(error){console.warn('Atlas state restore',error)}
    },{once:true});
    frame.src=url;
  }
  async function refreshMergedAtlas(){
    if(view!=='atlas'||!atlasPath||atlasSyncBusy)return;
    const merged=(crew?.evidence?.flows||[]).filter(flow=>flow.state==='MERGED'&&/^[0-9a-f]{40}$/i.test(flow.publication?.merge_commit_sha||''));
    const pending=merged.filter(flow=>!refreshedMerges.has(flow.batch_id+':'+flow.publication.merge_commit_sha));
    if(!pending.length)return;
    atlasSyncBusy=true;
    const project={owner,repo,path:atlasPath};
    try{
      const prep=await api(`/api/github/project/${enc(project.owner)}/${enc(project.repo)}/atlas`,{path:project.path});
      if(view!=='atlas'||owner!==project.owner||repo!==project.repo||atlasPath!==project.path)return;
      if(!prep.ok||!/^[0-9a-f]{40}$/i.test(prep.sha||'')||!prep.url)throw Error('Merged atlas checkout did not return a verified commit.');
      const changed=prep.sha!==atlasSha;
      atlasSha=prep.sha;atlasUrl=prep.url;atlasTitle=prep.name||atlasTitle;
      pending.forEach(flow=>refreshedMerges.add(flow.batch_id+':'+flow.publication.merge_commit_sha));
      atlasSyncNotice=changed?'Verified changes merged · atlas updated to '+prep.sha.slice(0,7):'Atlas includes the verified merged changes · '+prep.sha.slice(0,7);
      atlasSoftPaint();
    }catch(error){
      atlasSyncNotice='Changes merged; atlas refresh will retry automatically: '+error.message;
    }finally{atlasSyncBusy=false}
  }

  async function tickCrew(){
    if(crewPollBusy)return;
    crewPollBusy=true;
    try{
    await loadCrew();
    const harvested = await harvestFogJobs();
    if (harvested && harvested.ingested) await loadBatches();
    const nextCrew = signatureCrew();
    const nextBatch = signatureBatches();
    const changed = nextCrew !== crewSig || nextBatch !== batchSig || (harvested && harvested.ingested);
    await refreshMergedAtlas();
    if (!changed) {
      const progress=host?.querySelector('.gh-evidence-progress');
      updateCrewProgress(progress);
      return;
    }
    crewSig = nextCrew; batchSig = nextBatch;
    if (view === 'atlas') {
      // Update crew pills / Expand only; do not rebuild iframe (that resets the map).
      const progress = host.querySelector('.gh-evidence-progress');
      updateCrewProgress(progress);
      const btn = host.querySelector('[data-gh="expand-crew"]');
      if (btn) {
        btn.disabled = busy;
        btn.textContent = crew?.evidence?.coverage?.enabled ? 'Pause expansion queue' : 'Expand map with crew';
      }
      const row = host.querySelector('.gh-crew-mini-row');
      if (row) {
        const tmp = document.createElement('div');
        tmp.innerHTML = atlasView();
        const neu = tmp.querySelector('.gh-crew-mini-row');
        if (neu) row.replaceWith(neu);
      }
      return;
    }
    if (typingInFog()) {
      // Update Expand button + pills without wiping the paste box
      const btn = host.querySelector('[data-gh="expand-crew"]');
      if (btn) {
        btn.disabled = busy;
        btn.textContent = crew?.evidence?.coverage?.enabled ? 'Pause expansion queue' : 'Expand map with crew';
      }
      const row = host.querySelector('.gh-crew-row');
      if (row) {
        const tmp = document.createElement('div');
        tmp.innerHTML = crewCard();
        const neu = tmp.querySelector('.gh-crew-row');
        if (neu) row.replaceWith(neu);
      }
      return;
    }
    paint();
    }finally{crewPollBusy=false}
  }
  function startCrewPoll(){
    stopCrewPoll();
    crewTimer = setInterval(() => { tickCrew().catch(()=>{}); }, 5000);
  }
  function stopCrewPoll(){ clearInterval(crewTimer); crewTimer = null; }

  async function loadWorkerContract(o, r, p){
    try {
      const res = await api(`/api/github/project/${enc(o)}/${enc(r)}/worker-contract`, {path: p});
      if (res && res.ok && res.prompt_block) return res;
      if (res && res.prompt_block) return res;
    } catch (e) { console.warn('worker-contract', e); }
    return null;
  }

  async function expandWithCrew(){
    busy = true; if(view==='atlas')atlasSoftPaint();else paint();
    try {
      await loadCrew();
      if (crew?.evidence?.client_revision && crew.evidence.client_revision !== CREW_CLIENT_REVISION) throw Error('Nemesis was upgraded. Reload this page before starting the evidence crew.');
      await loadActive();
      const act = active?.active || active;
      const p = (act && act.path) || 'research/fog-of-knowledge';
      const o = (act && act.owner) || owner || 'mikecreation';
      const r = (act && act.repo) || repo || 'ZotBot';
      owner=o; repo=r; path=p;
      const enabled=!crew?.evidence?.coverage?.enabled;
      const res=await api(`/api/github/project/${enc(o)}/${enc(r)}/evidence-crew/coverage`, {
        path:p, enabled, auto_publish:!!automateMerge
      });
      await loadCrew(); await loadBatches();
      say(enabled?'Continuous expansion enabled across all atlas fields. Branches advance after completion or an evidence hold; every published target still requires both reviews and exact-head CI.':'Expansion queue paused. Current evidence batches finish; no new branches are dispatched.');
      startCrewPoll();
    } catch(err) { sayError(err); }
    finally { busy=false; if(view==='atlas')atlasSoftPaint();else paint(); }
  }

  const harvestedJobs = new Set();
  function extractFogPacket(raw){
    if (!raw) return null;
    let text = raw;
    if (typeof raw === 'object') {
      try {
        const ret = raw.RETURN || raw.return || raw;
        text = ret.text || ret.TEXT || JSON.stringify(raw);
      } catch { text = JSON.stringify(raw); }
    }
    text = String(text);
    // strip fences
    const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) text = fence[1];
    // find JSON object with nodes
    const start = text.indexOf('{');
    if (start < 0) return null;
    for (let i = start; i < text.length; i++) {
      if (text[i] !== '{') continue;
      try {
        const obj = JSON.parse(text.slice(i));
        if (obj && Array.isArray(obj.nodes) && (obj.batch_id || (obj.manifest && obj.manifest.batch_id))) return obj;
      } catch (_) {}
      // try balanced scan
      let depth = 0, end = -1;
      for (let j = i; j < text.length; j++) {
        if (text[j] === '{') depth++;
        else if (text[j] === '}') { depth--; if (depth === 0) { end = j; break; } }
      }
      if (end > i) {
        try {
          const obj = JSON.parse(text.slice(i, end + 1));
          if (obj && Array.isArray(obj.nodes) && (obj.batch_id || (obj.manifest && obj.manifest.batch_id))) return obj;
        } catch (_) {}
      }
      break;
    }
    return null;
  }

  async function harvestFogJobs(){
    // The durable server workflow owns capture/review/publication, even with this page closed.
    // Legacy jobs and reviewer replies must never be harvested as new worker batches.
    await loadBatches();
    return {ingested:0};
  }

  function batchCard(){
    const list = (batches && batches.batches) || [];
    const rows = list.slice(0, 8).map(b => {
      const st = b.status || 'DRAFT';
      const cls = /FAIL|BLOCKED|QUARANTINED|STALE/.test(st) ? 'warn' : (/MERGED|PR_OPEN|CHECKED_OK/.test(st) ? 'ok' : 'muted');
      const flow=crew?.evidence?.flows?.find(f=>f.batch_id===b.batch_id);
      return `<div class="gh-batch-row">
        <div><strong>${E(b.batch_id)}</strong> ${badge(cls, st)}
          <p class="workspace-muted">${E((b.mission||'').slice(0,140))}</p>${flow?flowProgress(flow):b.evidence&&b.evidence.error?'<p class="gh-notice">Candidate retained: '+E(b.evidence.error)+'</p>':''}</div>
        <div class="workspace-output-actions">
          <button type="button" data-gh="batch-check" data-batch="${E(b.batch_id)}" ${busy||st.startsWith('EVIDENCE_')&&st!=='EVIDENCE_READY'?'disabled':''}>Check</button>
          <button type="button" class="workspace-primary" data-gh="batch-propose" data-batch="${E(b.batch_id)}" ${busy||st.startsWith('EVIDENCE_')&&st!=='EVIDENCE_READY'?'disabled':''}>Open PR</button>
        </div></div>`;
    }).join('') || `<p class="workspace-muted">No batch drafts yet. After workers return Fog JSON, paste it below or wait for ingest.</p>`;
    const proposeNote = lastPropose ? `<p class="gh-notice">${E(lastPropose)}</p>` : '';
    return `<section class="workspace-section gh-card" id="gh-batches"><div class="gh-card-head">${eyebrow('FOG BATCHES')}${badge('ok','Write path')}</div>
      <p>Crew discoveries pass through retained source capture, candidate construction and two evidence reviews. Format and transport recovery runs automatically. Inconclusive scientific evidence stays quarantined. <strong>Automate</strong> publishes only after compiler checks and CI pass; the map updates after the merge.</p>
      <label class="gh-automate"><input type="checkbox" data-gh="automate-merge" ${automateMerge?'checked':''}/> Automate</label>
      ${proposeNote}
      <div class="gh-batch-list">${rows}</div>
      <form class="gh-batch-paste" data-gh-form="batch-paste">
        <label>Paste a complete candidate JSON (manifest/nodes/edges/reviews/sources/assertions)
          <textarea name="packet" rows="6" placeholder='{"batch_id":"fog-physical-001","nodes":[...],"edges":[],"reviews":[]}'></textarea>
        </label>
        <button type="submit" class="workspace-primary" ${busy?'disabled':''}>Save draft</button>
      </form>
      <button type="button" data-gh="refresh-batches">Refresh drafts</button>
    </section>`;
  }

  async function loadBatches(){
    if (!owner || !repo) { batches = {batches:[]}; return; }
    try { batches = await api(`/api/github/project/${enc(owner)}/${enc(repo)}/batches`); }
    catch { batches = {batches:[]}; }
  }

  function fogPath(){
    const act = active?.active || active;
    return (act && act.path) || atlasPath || path || 'research/fog-of-knowledge';
  }

  async function saveBatchPaste(raw){
    busy = true; paint();
    try {
      const packet = JSON.parse(raw);
      const saved = await api(`/api/github/project/${enc(owner)}/${enc(repo)}/batch`, {path: fogPath(), packet, source:'paste'});
      await loadBatches();
      say('Saved batch draft ' + (saved.batch_id || '') + '. Click Check, then Open PR.');
    } catch (err) { sayError(err); }
    finally { busy = false; paint(); }
  }

  async function runBatchCheck(batchId){
    busy = true; paint();
    try {
      const res = await api(`/api/github/project/${enc(owner)}/${enc(repo)}/batch/${enc(batchId)}/check`, {path: fogPath()});
      await loadBatches();
      say(res.ok ? ('Check passed for ' + batchId) : ('Check failed: ' + (res.error || res.stderr_excerpt || 'see draft')));
    } catch (err) { sayError(err); }
    finally { busy = false; paint(); }
  }

  async function runBatchPropose(batchId){
    const auto = !!automateMerge;
    busy = true; lastPropose = auto ? ('Brain accepting ' + batchId + '…') : ('Opening PR for ' + batchId + '…'); paint();
    try {
      const flow=crew?.evidence?.flows?.find(f=>f.batch_id===batchId);
      if(flow?.state==='READY'){
        await api(`/api/github/project/${enc(owner)}/${enc(repo)}/evidence-crew/${enc(batchId)}/publish`,{path:fogPath(),auto_publish:auto});
        say(auto?'Reviewed candidate queued for PR, CI and exact-head merge.':'Reviewed candidate queued to open its PR.');
        lastPropose='Publication queued for '+batchId;startCrewPoll();return;
      }
      const res = await api(`/api/github/project/${enc(owner)}/${enc(repo)}/batch/${enc(batchId)}/propose`, {path: fogPath(), open_pr: true, merge: false});
      await loadBatches();
      if (res.ok && (res.merged || res.stage === 'merged')) {
        lastPropose = 'Brain merged: ' + (res.pr_url || batchId);
        say('Brain merged ' + batchId + ' into main. Refreshing atlas…');
          if (view === 'atlas' && atlasPath) {
            try {
              const prep = await api(`/api/github/project/${enc(owner)}/${enc(repo)}/atlas`, {path: atlasPath});
              atlasUrl = prep.url + (prep.url.includes('?') ? '&' : '?') + 't=' + Date.now();
              atlasTitle = prep.name || atlasTitle;
            } catch (e) { console.warn(e); }
          }
      } else if (res.ok && res.pr_url) {
        lastPropose = 'PR opened: ' + res.pr_url;
        say('PR opened for ' + batchId + (auto ? ' — merge failed, check draft.' : ' — Automate off; merge on GitHub if you want it.'));
      } else {
        lastPropose = 'Propose failed at ' + (res.stage || 'unknown') + ': ' + (res.error || '');
        say(lastPropose);
      }
    } catch (err) { lastPropose = err.message; sayError(err); }
    finally { busy = false; paint(); }
  }

  async function loadStatus(){ status = await api('/api/github/status'); }
  async function loadRepos(){ repos = await api('/api/github/repos'); }
  async function loadActive(){ try { active = await api('/api/github/active'); } catch { active = null; } }

  async function openRepo(o, r, folder){
    owner = o; repo = r; path = folder || ''; filePath = ''; view = 'repo'; file = null; setHash(); paint();
    busy = true; paint();
    try {
      await loadStatus();
      [meta, tree, projects, ci] = await Promise.all([
        api(`/api/github/repo/${enc(o)}/${enc(r)}`),
        api(`/api/github/repo/${enc(o)}/${enc(r)}/tree?path=${enc(path)}`),
        api(`/api/github/repo/${enc(o)}/${enc(r)}/projects`),
        api(`/api/github/repo/${enc(o)}/${enc(r)}/ci`),
      ]);
      await loadActive();
      say('');
    } catch (err) { sayError(err); }
    finally { busy = false; paint(); }
  }

  async function openFile(p){
    filePath = p; path = p.split('/').slice(0,-1).join('/'); view = 'file'; setHash(); paint();
    busy = true; paint();
    try { file = await api(`/api/github/repo/${enc(owner)}/${enc(repo)}/file?path=${enc(p)}`); say(''); }
    catch (err) { sayError(err); }
    finally { busy = false; paint(); }
  }

  async function cd(p){
    path = p || ''; filePath = ''; view = 'repo'; setHash(); paint();
    busy = true; paint();
    try { tree = await api(`/api/github/repo/${enc(owner)}/${enc(repo)}/tree?path=${enc(path)}`); say(''); }
    catch (err) { sayError(err); }
    finally { busy = false; paint(); }
  }

  async function useProject(p){
    const act = active?.active || active;
    const already = act && act.path === p && act.repo === repo && act.owner === owner;
    if (already) {
      say('Already remembered. Opening atlas…');
      return openAtlas(p);
    }
    busy = true; paint();
    try {
      active = await api(`/api/github/project/${enc(owner)}/${enc(repo)}/use`, {path: p});
      await loadActive();
      say('Remembered: ' + (active.name || active.project_id || p) + '. Opening atlas…');
      busy = false;
      await openAtlas(p);
    } catch (err) { sayError(err); busy = false; paint(); }
  }

  async function runContext(p){
    busy = true; paint();
    try {
      context = await api(`/api/github/project/${enc(owner)}/${enc(repo)}/context`, {path: p});
      say(context.error ? ('Snapshot failed: ' + context.error) : 'Snapshot loaded. Use Open atlas for the interactive map.');
    } catch (err) { sayError(err); }
    finally { busy = false; paint({scrollSnapshot: true}); }
  }


  async function openAtlas(p, o, r){
    const oo = o || owner, rr = r || repo;
    if (!oo || !rr || !p) { say('Pick a Nemesis project first.'); return; }
    owner = oo; repo = rr; atlasPath = p; path = p; filePath = '';
    busy = true; view = 'atlas'; setHash(); paint();
    try {
      // remember project, then prepare atlas checkout
      try { active = await api(`/api/github/project/${enc(oo)}/${enc(rr)}/use`, {path: p}); } catch (_) {}
      const prep = await api(`/api/github/project/${enc(oo)}/${enc(rr)}/atlas`, {path: p});
      atlasUrl = prep.url;
      atlasSha = prep.sha || '';
      atlasSyncNotice = '';
      atlasTitle = prep.name || p;
      say('');
    } catch (err) {
      sayError(err);
      view = 'repo'; atlasUrl = ''; atlasTitle = '';
      setHash();
    } finally {
      busy = false; paint();
    }
  }

  function closeAtlas(){
    document.body.classList.remove('gh-atlas-mode');
    atlasUrl = ''; atlasTitle = ''; atlasSha = ''; atlasSyncNotice = '';
    view = owner && repo ? 'repo' : 'home';
    path = atlasPath || path; atlasPath = '';
    setHash();
    refresh();
  }

  function stopConnectPoll(){ clearInterval(connectTimer); connectTimer = null; }
  async function connect(){
    busy = true; paint();
    try {
      const started = await api('/api/github/connect', {});
      await loadStatus();
      if (started && !started.mode && (started.code || started.state)) {
        status = Object.assign({}, status || {}, { connect: started });
      }
      say('Code ready — enter it at github.com/login/device');
      stopConnectPoll();
      connectTimer = setInterval(async () => {
        try {
          const poll = await api('/api/github/connect');
          await loadStatus();
          if (poll && !poll.mode && (poll.code || poll.state)) {
            status = Object.assign({}, status || {}, { connect: poll });
          }
          const st = (status && status.connect) || poll || {};
          if (isConnected() || st.state === 'failed' || st.state === 'error' || st.state === 'cancelled' || (st.state === 'idle' && !st.code)) {
            stopConnectPoll();
            await loadStatus();
            if (isConnected()) { await loadRepos(); say('Signed in as ' + status.login); }
            else say(st.detail ? String(st.detail).split('\\n')[0].slice(0,200) : 'Connect finished without a login. Try again.');
            paint();
          } else paint();
        } catch (e) { stopConnectPoll(); sayError(e); }
      }, 2500);
    } catch (err) { sayError(err); }
    finally { busy = false; paint(); }
  }

  async function openUrl(raw){
    const opened = await api('/api/github/open?url=' + enc(raw));
    if (opened.kind === 'file' && opened.path) await openRepo(opened.owner, opened.repo, opened.path.split('/').slice(0,-1).join('/')).then(() => openFile(opened.path));
    else await openRepo(opened.owner, opened.repo, opened.path || '');
  }


  async function softRefreshWorkspace(){
    // Soft GitHub UI refresh: stay on #github, refresh repo/atlas/batch cache views.
    // MUST NOT: location.reload, remount Brain/worker tabs, clear holds, or enqueue Expand.
    if (!owner || !repo) { say('Open a repository first.'); return; }
    const keepView = view;
    const keepAtlasPath = atlasPath;
    const keepAtlasUrl = atlasUrl;
    busy = true; paint();
    try {
      setHash();
      await loadStatus();
      await loadCrew();
      if (keepView === 'atlas' && keepAtlasPath) {
        try {
          const prep = await api(`/api/github/project/${enc(owner)}/${enc(repo)}/atlas`, {path: keepAtlasPath});
          atlasUrl = prep.url;
          atlasSha = prep.sha || atlasSha;
          atlasTitle = prep.name || atlasTitle || keepAtlasPath;
          atlasPath = keepAtlasPath;
          view = 'atlas';
        } catch (e) {
          atlasUrl = keepAtlasUrl;
          console.warn(e);
        }
        try { await loadBatches(); } catch (_){}
        say('GitHub atlas/cache refreshed (ChatGPT workers untouched).');
      } else {
        view = 'repo';
        [meta, tree, projects, ci] = await Promise.all([
          api(`/api/github/repo/${enc(owner)}/${enc(repo)}`),
          api(`/api/github/repo/${enc(owner)}/${enc(repo)}/tree?path=${enc(path||'')}`),
          api(`/api/github/repo/${enc(owner)}/${enc(repo)}/projects`),
          api(`/api/github/repo/${enc(owner)}/${enc(repo)}/ci`),
        ]);
        await loadActive();
        try { await loadBatches(); } catch (_){}
        say('GitHub repo/batches refreshed (ChatGPT workers untouched).');
      }
      setHash();
    } catch (err) { sayError(err); }
    finally { busy = false; paint(); }
  }

  async function refresh(){
    if (!parseHash()) { view = 'home'; owner = repo = path = filePath = ''; atlasPath = ''; }
    const stayAtlas = view === 'atlas' && atlasPath && atlasUrl && host && host.querySelector('.gh-atlas-frame');
    if (!stayAtlas) { busy = true; paint(); }
    try {
      await loadStatus(); await loadCrew(); startCrewPoll();
      if (view === 'atlas') {
        if (!atlasPath) { view = 'repo'; await openRepo(owner, repo, path); }
        else if (stayAtlas) {
          // Soft: update crew pills / Expand only. Do not rebuild iframe (keeps map focus
          // and avoids flipping a mid-iframe refresh into a bare atlas tab).
          const btn = host.querySelector('[data-gh="expand-crew"]');
          if (btn) {
            btn.disabled = busy;
            btn.textContent = crew?.evidence?.coverage?.enabled ? 'Pause expansion queue' : 'Expand map with crew';
          }
          const row = host.querySelector('.gh-crew-mini-row');
          if (row) {
            const tmp = document.createElement('div');
            tmp.innerHTML = atlasView();
            const neu = tmp.querySelector('.gh-crew-mini-row');
            if (neu) row.replaceWith(neu);
          }
          setHash();
          return;
        } else {
          await openAtlas(atlasPath, owner, repo);
        }
      } else if (view === 'home') { await loadRepos(); await loadActive(); }
      else if (view === 'file') await openFile(filePath);
      else await openRepo(owner, repo, path);
      say('');
    } catch (err) { sayError(err); }
    finally { if (!stayAtlas) { busy = false; paint(); } }
  }

  function onClick(ev){
    const b = ev.target.closest('[data-gh]');
    if (!b || !host.contains(b)) return;
    const a = b.dataset.gh;
    if (a === 'home') { view='home'; owner=repo=path=filePath=''; setHash(); refresh(); }
    if (a === 'connect') connect();
    if (a === 'cancel-connect') { stopConnectPoll(); api('/api/github/connect/cancel',{}).then(loadStatus).then(paint).catch(e=>sayError(e)); }
    if (a === 'open-repo') openRepo(b.dataset.owner, b.dataset.repo, b.dataset.path || '');
    if (a === 'cd') cd(b.dataset.path || '');
    if (a === 'file') openFile(b.dataset.path);
    if (a === 'use') useProject(b.dataset.path);
    if (a === 'run-context') runContext(b.dataset.path);
    if (a === 'open-atlas') openAtlas(b.dataset.path);
    if (a === 'open-atlas-active') openAtlas(b.dataset.path, b.dataset.owner, b.dataset.repo);
    if (a === 'atlas-back') closeAtlas();
    if (a === 'expand-crew') expandWithCrew();
    if (a === 'reload-client') location.reload();
    if (a === 'automate-merge') { automateMerge = !!b.checked; return; }
    if (a === 'batch-check') runBatchCheck(b.dataset.batch);
    if (a === 'batch-propose') runBatchPropose(b.dataset.batch);
    if (a === 'refresh-batches') loadBatches().then(paint);
    if (a === 'refresh-crew') loadCrew().then(paint);
    if (a === 'goto-research') { location.hash = '#research'; location.reload(); }
    if (a === 'soft-refresh') softRefreshWorkspace();
    if (a === 'reload-repo') openRepo(owner, repo, path);
  }
  function onSubmit(ev){
    const form = ev.target.closest('[data-gh-form]');
    if (!form || !host.contains(form)) return;
    ev.preventDefault();
    if (form.getAttribute('data-gh-form') === 'batch-paste') {
      const raw = new FormData(form).get('packet');
      if (!raw) return;
      saveBatchPaste(String(raw)).catch(e => sayError(e));
      return;
    }
    if (form.getAttribute('data-gh-form') === 'open') {
      const url = new FormData(form).get('url');
      if (!url) return;
      openUrl(String(url).trim()).catch(e => sayError(e));
    }
  }

  function ensure(el){
    const first = !host || host !== el;
    host = el;
    parseHash();
    if (first || view !== 'atlas' || !atlasUrl) paint();
    return refresh();
  }
  function render(el){ return ensure(el); }
  function tryOpenFromText(text){
    const t = String(text||'').trim();
    if (!/^https?:\/\/(www\.)?github\.com\//i.test(t) && !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(t)) return false;
    openUrl(t).catch(e=>sayError(e));
    return true;
  }

  window.NemesisGitHub = { render, refresh, softRefreshWorkspace, ensure, tryOpenFromText, parseHash };
  document.addEventListener('click', onClick);
  document.addEventListener('submit', onSubmit);
  window.addEventListener('message', event => {
    const root=host?.querySelector('.gh-atlas-full'), frame=root?.querySelector('.gh-atlas-frame');
    if(!frame || event.source!==frame.contentWindow || event.origin!==location.origin || event.data?.type!=='fog-atlas-display')return;
    root.classList.toggle('atlas-shell-hidden',event.data.shellHidden===true);
  });
})();
