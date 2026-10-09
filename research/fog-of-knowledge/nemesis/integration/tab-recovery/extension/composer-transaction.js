/* Injected in MAIN world. Only a model belonging to the exact live composer may
 * receive a transaction. Never replace DOM, forge a paste, or call React setters. */
async function nemesisComposerTransaction(options = {}) {
  const revision = '6.2.9-tab-recovery';
  const canon = value => String(value ?? '').replace(/\r\n?/g, '\n');
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  const visible = el => {
    if (!el?.isConnected) return false;
    const r = el.getBoundingClientRect(), css = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && css.display !== 'none' && css.visibility !== 'hidden';
  };
  const selectors = ['[data-composer-markdown][contenteditable="true"]', '#prompt-textarea[contenteditable="true"]', '#prompt-textarea',
    '[data-testid="prompt-textarea"]', 'form [contenteditable="true"][role="textbox"]',
    'textarea[name="prompt-textarea"]'];
  const candidates = [...new Set(selectors.flatMap(s => [...document.querySelectorAll(s)]))].filter(visible);
  const matches = options.elementToken ? candidates.filter(el => el.getAttribute('data-nemesis-composer') === options.elementToken) : candidates;
  if (matches.length !== 1) return {ok:false, method:'exact-composer-unavailable', revision, count:matches.length};
  const el = matches[0];
  function domText(node) {
    if ('value' in node && /^(TEXTAREA|INPUT)$/.test(node.tagName)) return canon(node.value);
    function inline(n) {
      if (n.nodeType === 3) return n.nodeValue || '';
      if (n.nodeName === 'BR') return n.classList?.contains('ProseMirror-trailingBreak') ? '' : '\n';
      return [...n.childNodes].map(inline).join('');
    }
    const blocks = [...node.childNodes];
    return canon(blocks.map(inline).join(blocks.some(n => /^(P|DIV)$/.test(n.nodeName)) ? '\n' : ''));
  }
  const valid = v => v && v.dom === el && !v.isDestroyed && v.state?.doc && v.state?.schema && typeof v.dispatch === 'function';
  let view = null, controller = null, discovery = 'none';
  function examine(value, label) {
    if (!value || typeof value !== 'object') return;
    for (const v of [value, value.view, value.editor?.view, value.current, value.current?.view, value.current?.editor?.view]) {
      if (valid(v)) {
        view = v; discovery = label;
        if(value.view===v && typeof value.updateLiteralText==='function' && typeof value.getPlainText==='function')controller=value;
        return;
      }
    }
  }
  // Tiptap attaches its editor to the editor DOM. Some application wrappers keep
  // it in a React ref. Inspect only nearby refs, never invoke component handlers.
  examine(el.editor, 'element.editor');
  if (!view) examine(el.tiptapEditor, 'element.tiptapEditor');
  for (let node = el, depth = 0; !view && node && depth < 6; node = node.parentElement, depth++) {
    for (const key of Object.getOwnPropertyNames(node).filter(k => /^__reactFiber\$/.test(k))) {
      let fiber = node[key];
      for (let hops = 0; !view && fiber && hops < 12; fiber = fiber.return, hops++) {
        examine(fiber.memoizedProps?.composerController, 'react.composerController');
        if (!view) examine(fiber.memoizedProps?.editor, 'react.editor');
        if (!view) examine(fiber.memoizedProps?.editorRef, 'react.editorRef');
        for (let hook = fiber.memoizedState, n = 0; !view && hook && n < 40; hook = hook.next, n++)
          examine(hook.memoizedState, 'react.ref');
      }
    }
  }
  const shared = globalThis.__nemesisComposer623 || (globalThis.__nemesisComposer623 = {elements:new WeakMap(), page:crypto.randomUUID()});
  let generation = shared.elements.get(el);
  if (!generation || generation.view !== view) {
    generation = {view, id:shared.page + ':' + crypto.randomUUID()}; shared.elements.set(el, generation);
  }
  const base = {revision, generation:generation.id, discovery, tag:el.tagName,
    proseMirror:el.classList.contains('ProseMirror'), modelAvailable:!!view};
  const modelText = () => controller ? canon(controller.getPlainText()) : view ? canon(view.state.doc.textBetween(0, view.state.doc.content.size, '\n', '\n')) : null;
  if (options.operation === 'inspect') return {...base, ok:true, domChars:domText(el).length, modelChars:modelText()?.length ?? null};
  const value = canon(options.text), expected = canon(options.expected ?? '');
  const blank = text => typeof text==='string' && /^[ \t\r\n]*$/.test(text);
  const blankReplacement=options.allowBlank===true && blank(expected) && blank(domText(el)) && blank(modelText());
  if (domText(el) !== expected || (view && modelText() !== expected && !blankReplacement))
    return {...base, ok:false, method:'draft-changed-preserved'};
  if (!view) return {...base, ok:false, method:'editor-model-unavailable'};
  if(blankReplacement){
    let plain=true;
    view.state.doc.descendants(node=>{
      if(!['paragraph','text','hard_break'].includes(node.type.name) || node.marks?.length ||
         (node.isText && !blank(node.text)))plain=false;
    });
    if(!plain)return {...base,ok:false,method:'non-text-draft-preserved'};
  }
  if (view.composing) return {...base, ok:false, method:'user-composition-in-progress'};
  let method = 'prosemirror-model-transaction';
  try {
    view.focus();
    if (controller) {
      method = 'chatgpt-composerController.updateLiteralText';
      controller.updateLiteralText(value, 'replace');
    } else {
      const state = view.state, paragraph = state.schema.nodes.paragraph;
      if (!paragraph) return {...base, ok:false, method:'unsupported-editor-schema'};
      const blocks = value.split('\n').map(line => paragraph.create(null, line ? state.schema.text(line) : null));
      const Fragment = state.doc.content.constructor;
      const fragment = Fragment.fromArray(blocks);
      // Dispatch through the editor's own dispatchTransaction/onUpdate pipeline.
      view.dispatch(state.tr.replaceWith(0, state.doc.content.size, fragment));
    }
    await pause(250); // includes DOM observer and application render reconciliation
    const first = el.isConnected && modelText() === value && domText(el) === value;
    el.blur(); await pause(40); view.focus(); await pause(250);
    const second = el.isConnected && view.dom === el && modelText() === value && domText(el) === value;
    return {...base, ok:first && second, method, checks:{model:first && second, dom:first && second,
      reconciliation:first, focusRoundTrip:second}, domChars:domText(el).length, modelChars:modelText()?.length ?? null};
  } catch (error) {
    // A rejected attempt stays visible as a draft. Never erase it for a retry.
    return {...base, ok:false, method, error:String(error?.message || error).slice(0,300)};
  }
}
