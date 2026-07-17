/**
 * Timeline span math — pure. Phase 9.
 * Ticks are absolute integers (not calendar dates).
 */

/** Minimum span length in ticks */
export const MIN_SPAN_TICKS = 1;

/**
 * Semantic colors for timeline items (dark-desk friendly ink family).
 */
export const TIMELINE_COLORS = [
  { id: 'ink', label: 'Ink', value: '#2a2a2a' },
  { id: 'act', label: 'Act', value: '#3d3830' },
  { id: 'thread', label: 'Thread', value: '#4a453c' },
  { id: 'character', label: 'Character', value: '#555048' },
  { id: 'status', label: 'Status', value: '#5c564c' },
  { id: 'era', label: 'Era', value: '#1a1a1a' },
];

/**
 * @param {number} t0
 * @param {number} t1
 * @returns {{ t0: number, t1: number }}
 */
export function normalizeSpan(t0, t1) {
  let a = Number.isFinite(t0) ? Math.trunc(t0) : 0;
  let b = Number.isFinite(t1) ? Math.trunc(t1) : a + MIN_SPAN_TICKS;
  if (b < a) {
    const s = a;
    a = b;
    b = s;
  }
  if (b - a < MIN_SPAN_TICKS) b = a + MIN_SPAN_TICKS;
  return { t0: a, t1: b };
}

/**
 * Move a span by dt ticks (both ends).
 * @param {{ t0: number, t1?: number }} item
 * @param {number} dt
 */
export function moveSpan(item, dt) {
  const d = Math.trunc(dt || 0);
  const t0 = Math.trunc(item.t0 || 0) + d;
  const t1 = Math.trunc(item.t1 != null ? item.t1 : item.t0) + d;
  return normalizeSpan(t0, t1);
}

/**
 * Resize one end of a span.
 * @param {{ t0: number, t1?: number }} item
 * @param {'start'|'end'} which
 * @param {number} newT
 */
export function resizeSpanEnd(item, which, newT) {
  const t = Math.trunc(newT);
  let t0 = Math.trunc(item.t0 || 0);
  let t1 = Math.trunc(item.t1 != null ? item.t1 : t0 + MIN_SPAN_TICKS);
  if (which === 'start') t0 = t;
  else t1 = t;
  return normalizeSpan(t0, t1);
}

/**
 * Build a new span item fields object from a drag range.
 * @param {number} tA
 * @param {number} tB
 * @param {Partial<object>} [extra]
 */
export function spanFromDrag(tA, tB, extra = {}) {
  const { t0, t1 } = normalizeSpan(tA, tB);
  return {
    kind: 'span',
    t0,
    t1,
    title: extra.title || 'Period',
    color: extra.color || '#3d3830',
    description: extra.description || '',
    lane: extra.lane ?? null,
  };
}

/**
 * Duration in ticks.
 * @param {{ t0: number, t1?: number }} item
 */
export function spanDuration(item) {
  if (!item || item.kind === 'instant') return 0;
  const { t0, t1 } = normalizeSpan(item.t0, item.t1 ?? item.t0);
  return t1 - t0;
}
