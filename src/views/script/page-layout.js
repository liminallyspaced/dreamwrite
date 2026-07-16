/**
 * Multi-page paper stack — pure layout plan + selection helpers.
 * Screen consumer of Page[] (ADR-0006). No project mutations.
 *
 * Blocks are assigned to the page where they first appear in paginate() output.
 * Synthetic MORE / CONT'D rows are chrome only (not in the document model).
 */

/**
 * @typedef {{ number: number, rows: Array<{ blockId?: string|null, type: string, text?: string, isBlank?: boolean, isSynthetic?: boolean, isContinuation?: boolean }> }} Page
 * @typedef {{ number: number, blockIds: string[], showMore: boolean, showContd: boolean, contdText: string }} PagePlan
 */

/**
 * Plan which model blocks live on which paper page.
 * @param {Page[]} pages
 * @returns {PagePlan[]}
 */
export function planPageStack(pages) {
  if (!pages || !pages.length) {
    return [{ number: 1, blockIds: [], showMore: false, showContd: false, contdText: '' }];
  }

  /** @type {PagePlan[]} */
  const plan = pages.map((p) => ({
    number: p.number,
    blockIds: [],
    showMore: false,
    showContd: false,
    contdText: '',
  }));
  const byNum = new Map(plan.map((p) => [p.number, p]));
  const seen = new Set();

  for (const page of pages) {
    const slot = byNum.get(page.number);
    if (!slot) continue;
    for (const row of page.rows || []) {
      if (row.type === 'more') {
        slot.showMore = true;
        continue;
      }
      if (row.type === 'character' && row.isSynthetic) {
        slot.showContd = true;
        slot.contdText = row.text || '';
        continue;
      }
      if (row.isBlank || row.type === 'blank') continue;
      if (row.isSynthetic) continue;
      if (row.blockId && !seen.has(row.blockId)) {
        seen.add(row.blockId);
        slot.blockIds.push(row.blockId);
      }
    }
  }

  return plan;
}

/**
 * Capture caret as offsets inside a contenteditable .block.
 * @param {ParentNode} root
 * @returns {{ blockId: string, start: number, end: number } | null}
 */
export function captureSelection(root) {
  if (!root || typeof window === 'undefined') return null;
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return null;
  const range = sel.getRangeAt(0);
  if (!root.contains(range.startContainer)) return null;

  const startEl =
    range.startContainer.nodeType === Node.ELEMENT_NODE
      ? range.startContainer
      : range.startContainer.parentElement;
  const block = startEl?.closest?.('.block[data-id]');
  if (!block || !root.contains(block)) return null;

  const start = offsetInBlock(block, range.startContainer, range.startOffset);
  const end = offsetInBlock(block, range.endContainer, range.endOffset);
  return { blockId: block.dataset.id, start, end };
}

/**
 * @param {ParentNode} root
 * @param {{ blockId: string, start: number, end: number } | null} snap
 */
export function restoreSelection(root, snap) {
  if (!snap || !root || typeof window === 'undefined') return;
  const block = root.querySelector(`.block[data-id="${cssEscape(snap.blockId)}"]`);
  if (!block) return;

  const startPos = pointAtOffset(block, snap.start);
  const endPos = pointAtOffset(block, snap.end);
  if (!startPos || !endPos) return;

  try {
    const range = document.createRange();
    range.setStart(startPos.node, startPos.offset);
    range.setEnd(endPos.node, endPos.offset);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  } catch {
    // ignore restore failures (node replaced mid-flight)
  }
}

/**
 * @param {Element} block
 * @param {Node} container
 * @param {number} offset
 */
function offsetInBlock(block, container, offset) {
  if (!block.contains(container) && container !== block) {
    return (block.textContent || '').length;
  }
  const pre = document.createRange();
  pre.selectNodeContents(block);
  try {
    pre.setEnd(container, offset);
  } catch {
    return (block.textContent || '').length;
  }
  return pre.toString().length;
}

/**
 * @param {Element} block
 * @param {number} target
 * @returns {{ node: Node, offset: number } | null}
 */
function pointAtOffset(block, target) {
  const t = Math.max(0, target | 0);
  let remaining = t;

  /** @type {Node[]} */
  const nodes = [];
  const walk = (node) => {
    if (node.nodeType === Node.TEXT_NODE) nodes.push(node);
    else if (node.nodeType === Node.ELEMENT_NODE) {
      if (node.tagName === 'BR') {
        // count as one character of visual break — match textContent roughly
        nodes.push(node);
      } else {
        node.childNodes.forEach(walk);
      }
    }
  };
  block.childNodes.forEach(walk);

  if (!nodes.length) {
    return { node: block, offset: 0 };
  }

  for (const node of nodes) {
    if (node.nodeType === Node.ELEMENT_NODE && node.tagName === 'BR') {
      if (remaining <= 0) return { node: block, offset: indexOfChild(block, node) };
      remaining -= 1;
      continue;
    }
    const len = (node.nodeValue || '').length;
    if (remaining <= len) {
      return { node, offset: remaining };
    }
    remaining -= len;
  }

  const last = nodes[nodes.length - 1];
  if (last.nodeType === Node.TEXT_NODE) {
    return { node: last, offset: (last.nodeValue || '').length };
  }
  return { node: block, offset: block.childNodes.length };
}

function indexOfChild(parent, child) {
  return Array.prototype.indexOf.call(parent.childNodes, child);
}

/** CSS.escape polyfill-ish for attribute selectors */
function cssEscape(id) {
  if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(String(id));
  return String(id).replace(/["\\]/g, '\\$&');
}
