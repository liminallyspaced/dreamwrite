/**
 * Screen-space greedy lane packing (timeline staircase).
 * Footprint is label width for instants, not duration.
 * Recompute on zoom, not on pan.
 *
 * @see docs/spec/timeline.md §3.3
 */

/**
 * @typedef {{ id: string, kind: 'instant'|'span', t0: number, t1?: number, lane?: number|null, labelWidth: number }} PackItem
 * @typedef {{ id: string, lane: number, left: number, right: number }} Packed
 */

/**
 * @param {PackItem[]} items
 * @param {(t: number) => number} xOf  world/tick → screen x
 * @param {{ gap?: number, side?: 'up'|'down' }} [opts]
 * @returns {Packed[]}
 */
export function packLanes(items, xOf, opts = {}) {
  const gap = opts.gap ?? 8;
  const list = (items || []).map((it) => {
    const left =
      it.kind === 'span'
        ? xOf(it.t0)
        : xOf(it.t0) - (it.labelWidth || 80) / 2;
    const right =
      it.kind === 'span'
        ? xOf(it.t1 != null ? it.t1 : it.t0)
        : left + (it.labelWidth || 80);
    return {
      id: it.id,
      kind: it.kind,
      left,
      right: Math.max(right, left + 4),
      pinned: it.lane != null && it.lane >= 0 ? it.lane : null,
    };
  });

  list.sort((a, b) => a.left - b.left || a.right - b.right);

  /** @type {number[]} rightmost edge used in each lane */
  const lanes = [];
  /** @type {Packed[]} */
  const out = [];

  // Reserve pinned lanes first
  for (const it of list) {
    if (it.pinned != null) {
      while (lanes.length <= it.pinned) lanes.push(-Infinity);
    }
  }

  for (const it of list) {
    let L;
    if (it.pinned != null) {
      L = it.pinned;
      lanes[L] = Math.max(lanes[L] ?? -Infinity, it.right);
    } else {
      L = -1;
      for (let i = 0; i < lanes.length; i++) {
        if ((lanes[i] ?? -Infinity) + gap <= it.left) {
          L = i;
          break;
        }
      }
      if (L < 0) {
        L = lanes.length;
        lanes.push(it.right);
      } else {
        lanes[L] = it.right;
      }
    }
    out.push({ id: it.id, lane: L, left: it.left, right: it.right });
  }

  return out;
}

/**
 * Estimate label width in px (Courier-ish mono ~7.2px/char at 12px).
 * @param {string} title
 * @param {number} [charPx]
 */
export function estimateLabelWidth(title, charPx = 7.2) {
  const t = String(title || '·');
  return Math.max(48, Math.min(280, Math.round(t.length * charPx + 28)));
}
