import { describe, it, expect } from 'vitest';
import {
  normalizeSpan,
  moveSpan,
  resizeSpanEnd,
  spanFromDrag,
  spanDuration,
  TIMELINE_COLORS,
  MIN_SPAN_TICKS,
} from '../../src/core/timeline/spans.js';
import { createItem } from '../../src/core/timeline/model.js';

describe('normalizeSpan', () => {
  it('orders ends and enforces minimum length', () => {
    expect(normalizeSpan(10, 5)).toEqual({ t0: 5, t1: 5 + MIN_SPAN_TICKS > 5 ? 10 : 5 + MIN_SPAN_TICKS });
    // 10 > 5 so ordered to 5,10
    expect(normalizeSpan(10, 5)).toEqual({ t0: 5, t1: 10 });
    expect(normalizeSpan(3, 3)).toEqual({ t0: 3, t1: 3 + MIN_SPAN_TICKS });
  });
});

describe('move / resize', () => {
  it('moves both ends by dt', () => {
    expect(moveSpan({ t0: 100, t1: 200 }, 50)).toEqual({ t0: 150, t1: 250 });
  });

  it('resizes start without collapsing past end', () => {
    const r = resizeSpanEnd({ t0: 0, t1: 100 }, 'start', 80);
    expect(r.t0).toBe(80);
    expect(r.t1).toBe(100);
  });

  it('resizes end and swaps if needed', () => {
    const r = resizeSpanEnd({ t0: 100, t1: 200 }, 'end', 50);
    expect(r.t0).toBe(50);
    expect(r.t1).toBe(100);
  });
});

describe('spanFromDrag + createItem', () => {
  it('builds span fields from drag', () => {
    const f = spanFromDrag(20, 5, { title: 'War' });
    expect(f.kind).toBe('span');
    expect(f.t0).toBe(5);
    expect(f.t1).toBe(20);
    expect(f.title).toBe('War');
  });

  it('createItem honors span kind', () => {
    const it = createItem({ kind: 'span', t0: 0, t1: 365, title: 'Year' });
    expect(it.kind).toBe('span');
    expect(it.t1).toBe(365);
    expect(spanDuration(it)).toBe(365);
  });

  it('exports palette', () => {
    expect(TIMELINE_COLORS.length).toBeGreaterThanOrEqual(4);
  });
});
