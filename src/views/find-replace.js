/**
 * Find / replace bar — extracted from app.js (continuous split).
 * @param {{
 *   getEls: () => object,
 *   getState: () => object,
 *   setView: (name: string) => void,
 *   focusBlock: (id: string, selectAll?: boolean) => void,
 *   exec: (type: string, payload: object, opts?: object) => object,
 *   renderBlocks: () => void,
 *   refreshStats: () => void,
 *   toast: (msg: string) => void,
 *   escapeRegExp: (s: string) => string,
 * }} api
 */
export function createFindReplace(api) {
  function toggleFind(show) {
    const els = api.getEls();
    els.findBar.classList.toggle('show', show);
    document.getElementById('app')?.classList.toggle('find-open', !!show);
    if (show) {
      els.findInput.focus();
      els.findInput.select();
    }
  }

  function findNext() {
    const els = api.getEls();
    const state = api.getState();
    const q = els.findInput.value;
    if (!q) return;
    const blocks = state.project.blocks;
    const start = state.findIndex + 1;
    for (let i = 0; i < blocks.length; i++) {
      const idx = (start + i) % blocks.length;
      if ((blocks[idx].text || '').toLowerCase().includes(q.toLowerCase())) {
        state.findIndex = idx;
        api.setView('script');
        api.focusBlock(blocks[idx].id, true);
        return;
      }
    }
  }

  function replaceOne() {
    const els = api.getEls();
    const state = api.getState();
    const q = els.findInput.value;
    const r = els.replaceInput.value;
    if (!q || state.findIndex < 0) {
      findNext();
      return;
    }
    const b = state.project.blocks[state.findIndex];
    if (!b) return;
    const re = new RegExp(api.escapeRegExp(q), 'i');
    const nextText = (b.text || '').replace(re, r);
    if (nextText === b.text) {
      findNext();
      return;
    }
    api.exec('blocks.setText', { id: b.id, text: nextText }, { label: 'Replace' });
    api.renderBlocks();
    api.focusBlock(b.id);
    api.refreshStats();
  }

  function replaceAll() {
    const els = api.getEls();
    const state = api.getState();
    const q = els.findInput.value;
    const r = els.replaceInput.value;
    if (!q) return;
    const re = new RegExp(api.escapeRegExp(q), 'gi');
    let count = 0;
    for (const b of state.project.blocks || []) {
      const m = (b.text || '').match(re);
      if (m) count += m.length;
      re.lastIndex = 0;
    }
    if (!count) {
      api.toast('No matches.');
      return;
    }
    const result = api.exec(
      'blocks.replaceAll',
      { find: q, replace: r, caseSensitive: false },
      { label: `Replace all (${count})` }
    );
    if (result.ok && !result.noop) {
      api.renderBlocks();
      api.refreshStats();
    }
    api.toast(`Replaced ${count} occurrence(s).`);
  }

  return { toggleFind, findNext, replaceOne, replaceAll };
}
