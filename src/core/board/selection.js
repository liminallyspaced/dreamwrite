/**
 * Board selection model — pure, no DOM.
 * Phase 8a: click / Shift+click / marquee / Ctrl+A / Esc.
 */

/**
 * @param {Iterable<string>} [ids]
 * @returns {Set<string>}
 */
export function createSelection(ids = []) {
  return new Set(ids);
}

/**
 * @param {Set<string>} _sel
 * @param {string} id
 */
export function selectOnly(_sel, id) {
  return new Set(id ? [id] : []);
}

/**
 * @param {Set<string>} sel
 * @param {string} id
 */
export function toggleInSelection(sel, id) {
  const next = new Set(sel);
  if (next.has(id)) next.delete(id);
  else if (id) next.add(id);
  return next;
}

/**
 * @param {Set<string>} sel
 * @param {string} id
 */
export function addToSelection(sel, id) {
  const next = new Set(sel);
  if (id) next.add(id);
  return next;
}

/**
 * @returns {Set<string>}
 */
export function clearSelection() {
  return new Set();
}

/**
 * @param {Iterable<string>} ids
 */
export function selectAll(ids) {
  return new Set(ids || []);
}

/**
 * Axis-aligned rect intersection (world space).
 * @param {{ x: number, y: number, w: number, h: number }} a
 * @param {{ x: number, y: number, w: number, h: number }} b
 */
export function rectsIntersect(a, b) {
  if (!a || !b) return false;
  const aw = Math.max(0, a.w);
  const ah = Math.max(0, a.h);
  const bw = Math.max(0, b.w);
  const bh = Math.max(0, b.h);
  return a.x < b.x + bw && a.x + aw > b.x && a.y < b.y + bh && a.y + ah > b.y;
}

/**
 * Normalize a marquee from two corners (screen or world).
 * @param {number} x0
 * @param {number} y0
 * @param {number} x1
 * @param {number} y1
 */
export function normalizeRect(x0, y0, x1, y1) {
  const x = Math.min(x0, x1);
  const y = Math.min(y0, y1);
  return {
    x,
    y,
    w: Math.abs(x1 - x0),
    h: Math.abs(y1 - y0),
  };
}

/**
 * Select items whose bounds intersect the marquee rect.
 * @param {Array<{ id: string, x: number, y: number, w?: number, h?: number, type?: string }>} items
 * @param {{ x: number, y: number, w: number, h: number }} rect
 * @returns {Set<string>}
 */
export function selectInRect(items, rect) {
  const next = new Set();
  if (!rect || rect.w < 2 && rect.h < 2) return next;
  for (const it of items || []) {
    if (!it?.id || it.type === 'connector') continue;
    const box = {
      x: it.x ?? 0,
      y: it.y ?? 0,
      w: it.w ?? 200,
      h: it.h ?? 120,
    };
    if (rectsIntersect(box, rect)) next.add(it.id);
  }
  return next;
}

/**
 * Minimum card size by type (resize clamp).
 * @param {string} type
 */
export function minSizeForType(type) {
  switch (type) {
    case 'image':
      return { w: 80, h: 80 };
    case 'scene-card':
      return { w: 120, h: 72 };
    case 'column':
      return { w: 160, h: 120 };
    case 'sub-board':
      return { w: 100, h: 72 };
    case 'table':
      return { w: 160, h: 100 };
    case 'note':
    default:
      return { w: 120, h: 80 };
  }
}

/**
 * Clamp resized dimensions; images preserve aspect unless freeResize.
 * @param {{ w: number, h: number, type?: string }} item
 * @param {number} nextW
 * @param {number} nextH
 * @param {{ freeResize?: boolean }} [opts]
 */
export function clampResize(item, nextW, nextH, opts = {}) {
  const min = minSizeForType(item?.type || 'note');
  let w = Math.max(min.w, Math.round(nextW));
  let h = Math.max(min.h, Math.round(nextH));
  if (item?.type === 'image' && !opts.freeResize) {
    const ow = Math.max(1, item.w || w);
    const oh = Math.max(1, item.h || h);
    const aspect = ow / oh;
    // Prefer width as driver
    h = Math.max(min.h, Math.round(w / aspect));
    w = Math.max(min.w, Math.round(h * aspect));
  }
  return { w, h };
}
