import { describe, it, expect } from 'vitest';
import {
  createSelection,
  selectOnly,
  toggleInSelection,
  clearSelection,
  selectAll,
  selectInRect,
  normalizeRect,
  rectsIntersect,
  clampResize,
  minSizeForType,
} from '../../src/core/board/selection.js';

describe('board selection model', () => {
  it('selectOnly replaces selection', () => {
    const s = selectOnly(createSelection(['a', 'b']), 'c');
    expect([...s]).toEqual(['c']);
  });

  it('toggle adds and removes', () => {
    let s = createSelection(['a']);
    s = toggleInSelection(s, 'b');
    expect(s.has('a') && s.has('b')).toBe(true);
    s = toggleInSelection(s, 'a');
    expect(s.has('a')).toBe(false);
    expect(s.has('b')).toBe(true);
  });

  it('clear and selectAll', () => {
    expect(clearSelection().size).toBe(0);
    expect(selectAll(['x', 'y']).size).toBe(2);
  });

  it('marquee selects intersecting cards', () => {
    const items = [
      { id: 'n1', x: 0, y: 0, w: 100, h: 100, type: 'note' },
      { id: 'n2', x: 200, y: 200, w: 100, h: 100, type: 'note' },
      { id: 'c1', x: 50, y: 50, w: 0, h: 0, type: 'connector' },
    ];
    const hit = selectInRect(items, { x: 0, y: 0, w: 80, h: 80 });
    expect(hit.has('n1')).toBe(true);
    expect(hit.has('n2')).toBe(false);
    expect(hit.has('c1')).toBe(false);
  });

  it('normalizeRect handles inverted drags', () => {
    expect(normalizeRect(10, 10, 0, 0)).toEqual({ x: 0, y: 0, w: 10, h: 10 });
  });

  it('rectsIntersect is symmetric for overlap', () => {
    expect(rectsIntersect({ x: 0, y: 0, w: 50, h: 50 }, { x: 40, y: 40, w: 20, h: 20 })).toBe(
      true
    );
    expect(rectsIntersect({ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: 20, w: 10, h: 10 })).toBe(
      false
    );
  });
});

describe('clampResize', () => {
  it('enforces minimums', () => {
    const r = clampResize({ type: 'note', w: 200, h: 140 }, 10, 10);
    expect(r.w).toBeGreaterThanOrEqual(minSizeForType('note').w);
    expect(r.h).toBeGreaterThanOrEqual(minSizeForType('note').h);
  });

  it('preserves image aspect unless freeResize', () => {
    const r = clampResize({ type: 'image', w: 200, h: 100 }, 300, 50);
    expect(Math.abs(r.w / r.h - 2)).toBeLessThan(0.05);
    const free = clampResize({ type: 'image', w: 200, h: 100 }, 300, 50, { freeResize: true });
    expect(free.w).toBe(300);
    expect(free.h).toBeGreaterThanOrEqual(minSizeForType('image').h);
  });
});
