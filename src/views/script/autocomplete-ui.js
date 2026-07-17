/**
 * SmartType autocomplete popup UI — extracted from app.js.
 */
import {
  smarttypeSuggestions,
  applySceneSuggestion,
} from '../../core/script/smarttype.js';
import { setBlockDomText, readBlockText, placeCaretEnd } from './block-dom.js';
import { escapeHtml } from '../shared/text.js';

/**
 * @param {{
 *   getEls: () => object,
 *   getState: () => object,
 *   getBlock: (id: string) => object|null,
 *   blockEl: (id: string) => HTMLElement|null,
 *   exec: Function,
 *   renderScenes: () => void,
 * }} api
 */
export function createAutocompleteUi(api) {
  function hideAc() {
    const els = api.getEls();
    const state = api.getState();
    els.ac.classList.remove('show');
    state.acItems = [];
  }

  function paintAc() {
    const els = api.getEls();
    const state = api.getState();
    els.ac.innerHTML = state.acItems
      .map((n, i) => `<div class="${i === state.acIndex ? 'active' : ''}" data-i="${i}">${escapeHtml(n)}</div>`)
      .join('');
    els.ac.querySelectorAll('div').forEach((d) => {
      d.onmousedown = (e) => {
        e.preventDefault();
        const b = api.getBlock(state.activeBlockId);
        const div = api.blockEl(state.activeBlockId);
        applyAc(state.acItems[+d.dataset.i], div, b);
      };
    });
  }

  function applyAc(suggestion, textEl, block) {
    if (!block || !textEl || !suggestion) return;
    let next = suggestion;
    if (block.type === 'scene') {
      next = applySceneSuggestion(block.text || readBlockText(textEl), suggestion);
    }
    api.exec('blocks.setText', { id: block.id, text: next }, { mergeKey: `block:${block.id}` });
    setBlockDomText(textEl, next);
    placeCaretEnd(textEl);
    hideAc();
    if (block.type === 'scene') {
      api.renderScenes();
      maybeShowAc(textEl, api.getBlock(block.id));
    }
  }

  function maybeShowAc(div, block) {
    const els = api.getEls();
    const state = api.getState();
    if (!block || !div) {
      hideAc();
      return;
    }
    const type = block.type;
    if (type !== 'character' && type !== 'scene' && type !== 'transition') {
      hideAc();
      return;
    }
    const q = block.text || '';
    const items = smarttypeSuggestions(type, q, {
      blocks: state.project.blocks || [],
      characters: state.project.characters || [],
      limit: 8,
    });
    if (!items.length) {
      hideAc();
      return;
    }
    state.acItems = items;
    state.acIndex = 0;
    const rect = div.getBoundingClientRect();
    els.ac.style.left = `${rect.left}px`;
    els.ac.style.top = `${rect.bottom + 4}px`;
    paintAc();
    els.ac.classList.add('show');
  }

  return { maybeShowAc, paintAc, applyAc, hideAc };
}
