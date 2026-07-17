/**
 * Block editor key handling — extracted from app.js.
 */
import { readBlockText, setBlockDomText, placeCaretEnd } from './block-dom.js';
import { sceneTabAdvance } from '../../core/script/smarttype.js';

/**
 * @param {{
 *   getState: () => object,
 *   getEls: () => object,
 *   getBlock: (id: string) => object|null,
 *   indexOfBlock: (id: string) => number,
 *   exec: Function,
 *   renderBlocks: () => void,
 *   renderScenes: () => void,
 *   focusBlock: (id: string, selectAll?: boolean) => void,
 *   refreshStats: () => void,
 *   cycleType: (id: string, reverse?: boolean) => void,
 *   insertAfter: (id: string) => void,
 *   maybeShowAc: Function,
 *   paintAc: Function,
 *   applyAc: Function,
 *   hideAc: Function,
 * }} api
 */
export function createBlockKeyboard(api) {
  function onBlockKeydown(e, id, textEl) {
    const state = api.getState();
    const els = api.getEls();
    const b = api.getBlock(id);
    if (!b) return;

    if (els.ac.classList.contains('show')) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        state.acIndex = Math.min(state.acIndex + 1, state.acItems.length - 1);
        api.paintAc();
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        state.acIndex = Math.max(state.acIndex - 1, 0);
        api.paintAc();
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        if (state.acItems[state.acIndex]) {
          e.preventDefault();
          api.applyAc(state.acItems[state.acIndex], textEl, b);
          return;
        }
      }
      if (e.key === 'Escape') {
        api.hideAc();
        return;
      }
    }

    if (e.key === 'Tab') {
      e.preventDefault();
      b.text = readBlockText(textEl);
      if (b.type === 'scene' && !e.shiftKey) {
        const adv = sceneTabAdvance(b.text);
        if (adv.handled) {
          api.exec('blocks.setText', { id, text: adv.text }, { mergeKey: `block:${id}` });
          setBlockDomText(textEl, adv.text);
          placeCaretEnd(textEl);
          api.maybeShowAc(textEl, api.getBlock(id));
          return;
        }
      }
      if (els.ac.classList.contains('show') && state.acItems[state.acIndex]) {
        api.applyAc(state.acItems[state.acIndex], textEl, b);
        return;
      }
      api.cycleType(id, e.shiftKey);
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      api.hideAc();
      b.text = readBlockText(textEl);
      api.insertAfter(id);
      return;
    }

    if (e.key === 'Backspace') {
      const text = readBlockText(textEl);
      const sel = window.getSelection();
      const atStart =
        sel &&
        sel.rangeCount &&
        sel.getRangeAt(0).collapsed &&
        (() => {
          const r = sel.getRangeAt(0);
          const pre = document.createRange();
          pre.selectNodeContents(textEl);
          pre.setEnd(r.startContainer, r.startOffset);
          return pre.toString().length === 0;
        })();
      if (!text || (atStart && !text)) {
        const idx = api.indexOfBlock(id);
        if (idx > 0 && !text) {
          e.preventDefault();
          const prevId = state.project.blocks[idx - 1].id;
          api.exec('blocks.remove', { id }, { label: 'Delete block' });
          api.renderBlocks();
          api.renderScenes();
          api.focusBlock(prevId);
          api.refreshStats();
        }
      }
    }

    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      const idx = api.indexOfBlock(id);
      if (e.key === 'ArrowUp' && idx > 0) {
        const sel = window.getSelection();
        if (sel && sel.rangeCount) {
          const r = sel.getRangeAt(0);
          const pre = document.createRange();
          pre.selectNodeContents(textEl);
          pre.setEnd(r.startContainer, r.startOffset);
          if (pre.toString().length === 0 && r.collapsed) {
            e.preventDefault();
            b.text = readBlockText(textEl);
            api.focusBlock(state.project.blocks[idx - 1].id);
          }
        }
      }
      if (e.key === 'ArrowDown' && idx < state.project.blocks.length - 1) {
        const sel = window.getSelection();
        if (sel && sel.rangeCount) {
          const r = sel.getRangeAt(0);
          const post = document.createRange();
          post.selectNodeContents(textEl);
          post.setStart(r.endContainer, r.endOffset);
          if (post.toString().length === 0 && r.collapsed) {
            e.preventDefault();
            b.text = readBlockText(textEl);
            api.focusBlock(state.project.blocks[idx + 1].id);
          }
        }
      }
    }
  }

  return { onBlockKeydown };
}
