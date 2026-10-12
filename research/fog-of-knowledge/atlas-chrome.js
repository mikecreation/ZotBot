/* Collapsible atlas chrome. Presentation only: never changes graph, review or worker state. */
(() => {
  'use strict';
  const KEY = 'fog:atlas-chrome:v1';
  const body = document.body;
  const $ = s => document.querySelector(s);
  const headerBtn = $('#collapseHeaderBtn'), focusBtns = [...document.querySelectorAll('[data-chrome-focus]')];
  const panelTab = $('#detailEdgeTab'), searchBtn = $('#chromeSearchBtn'), caption = $('#mapCaption');
  const infoBtn = $('#captionToggleBtn');
  const defaults = { header: true, panel: true, caption: true, focus: false };
  let state = { ...defaults };
  try { Object.assign(state, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (_) {}
  for (const k of Object.keys(defaults)) state[k] = !!state[k];

  const shown = k => !state.focus && state[k];
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (_) {} }

  let fitTimer = null;
  function refit() {
    // Wait for grid/flex layout and canvas resize, then fit the visible viewport.
    clearTimeout(fitTimer);
    window.dispatchEvent(new Event('resize'));
    fitTimer = setTimeout(() => requestAnimationFrame(() => { $('#fitMapBtn')?.click(); }), 90);
  }

  function ensureCaptionClose() {
    if (!caption || caption.querySelector('.captionClose')) return;
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'captionClose'; b.title = 'Hide this note (I to show)'; b.setAttribute('aria-label', 'Hide map note');
    b.textContent = '×';
    b.onclick = ev => { ev.stopPropagation(); set({ caption: false }); };
    caption.prepend(b);
  }

  function paint(fit = true) {
    const header = shown('header'), panel = shown('panel'), cap = shown('caption');
    body.classList.toggle('chrome-header-collapsed', !header);
    body.classList.toggle('chrome-panel-collapsed', !panel);
    body.classList.toggle('chrome-caption-hidden', !cap);
    body.classList.toggle('chrome-focus', state.focus);
    if (!header) body.classList.remove('chrome-search-open');
    headerBtn.setAttribute('aria-expanded', String(header));
    headerBtn.title = header ? 'Collapse header  [' : 'Expand header  [';
    headerBtn.textContent = header ? '▴' : '▾';
    panelTab.setAttribute('aria-expanded', String(panel));
    panelTab.title = panel ? 'Collapse details panel  ]' : 'Expand details panel  ]';
    panelTab.querySelector('.edgeArrow').textContent = panel ? '›' : '‹';
    for (const b of focusBtns) {
      b.setAttribute('aria-pressed', String(state.focus));
      b.textContent = state.focus ? ('short' in b.dataset ? '⤡' : 'EXIT FOCUS') : ('short' in b.dataset ? '⤢' : 'FOCUS MAP');
      b.title = state.focus ? 'Restore panels  (F or Esc)' : 'Focus map: collapse everything  (F)';
    }
    if (infoBtn) infoBtn.setAttribute('aria-pressed', String(cap));
    ensureCaptionClose();
    if (parent !== window) { try { parent.postMessage({ type: 'fog-atlas-display', shellHidden: state.focus }, '*'); } catch (_) {} }
    save();
    if (fit) refit();
  }
  function set(patch) {
    // Toggling an individual section leaves focus mode with the remaining choices intact.
    if (state.focus && !('focus' in patch)) {
      state = { ...state, header: shown('header'), panel: shown('panel'), caption: shown('caption'), focus: false };
    }
    Object.assign(state, patch); paint();
  }
  const toggleHeader = () => set({ header: !shown('header') });
  const togglePanel = () => set({ panel: !shown('panel') });
  const toggleCaption = () => set({ caption: !shown('caption') });
  const toggleFocus = () => set({ focus: !state.focus });

  headerBtn.onclick = toggleHeader;
  panelTab.onclick = togglePanel;
  focusBtns.forEach(b => b.onclick = toggleFocus);
  if (infoBtn) infoBtn.onclick = toggleCaption;
  function openSearch() {
    if (shown('header')) return;
    body.classList.add('chrome-search-open');
  }
  searchBtn.onclick = () => { openSearch(); const s = $('#search'); s.focus(); s.select(); };
  $('#search').addEventListener('blur', () => setTimeout(() => {
    if (!$('#searchResults') || $('#searchResults').hidden || !document.activeElement?.closest?.('#searchResults')) body.classList.remove('chrome-search-open');
  }, 200));
  if (caption) new MutationObserver(ensureCaptionClose).observe(caption, { childList: true });

  document.addEventListener('keydown', ev => {
    const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    if (ev.key === '/' && !typing) { openSearch(); return; } // app.js focuses the search box next
    if (typing) { if (ev.key === 'Escape') body.classList.remove('chrome-search-open'); return; }
    if (ev.key === '[') { ev.preventDefault(); toggleHeader(); }
    else if (ev.key === ']') { ev.preventDefault(); togglePanel(); }
    else if (ev.key === 'f' || ev.key === 'F') { ev.preventDefault(); toggleFocus(); }
    else if (ev.key === 'i' || ev.key === 'I') { ev.preventDefault(); toggleCaption(); }
    else if (ev.key === 'Escape' && state.focus) { ev.stopImmediatePropagation(); set({ focus: false }); }
  }, true);

  window.FogAtlasChrome = { state: () => ({ ...state }), set, refit };
  paint(false);
  // Initial fit after the atlas boots with the restored chrome state.
  window.addEventListener('load', () => setTimeout(refit, 400));
})();
