import { describe, it, expect } from 'vitest';
import {
  MAX_RING_ITEMS,
  ringForContext,
  activeRingItems,
  angleToIndex,
  markIndexFromVector,
  SUBMENUS,
  MARK_MIN_PX,
} from '../../src/views/chrome/radial-rings.js';

describe('ringForContext', () => {
  it('never exceeds 8 items', () => {
    const types = ['scene', 'action', 'character', 'dialogue', 'parenthetical', 'transition', 'shot', 'note'];
    for (const elementType of types) {
      const ring = ringForContext({ view: 'script', elementType });
      expect(ring.length, elementType).toBeLessThanOrEqual(MAX_RING_ITEMS);
      expect(ring.length, elementType).toBeGreaterThan(0);
    }
    expect(ringForContext({ view: 'cards' }).length).toBeLessThanOrEqual(MAX_RING_ITEMS);
    expect(ringForContext({ view: 'timeline' }).length).toBeLessThanOrEqual(MAX_RING_ITEMS);
  });

  it('scene ring includes INT/EXT and a time submenu', () => {
    const ring = ringForContext({ view: 'script', elementType: 'scene' });
    const labels = ring.map((i) => i.label);
    expect(labels).toContain('INT.');
    expect(labels).toContain('EXT.');
    expect(ring.some((i) => i.action === 'submenu' && i.value === 'timeOfDay')).toBe(true);
  });

  it('character ring has extensions and dialogue', () => {
    const ring = ringForContext({ view: 'script', elementType: 'character' });
    expect(ring.some((i) => i.label === 'V.O.')).toBe(true);
    expect(ring.some((i) => i.action === 'element' && i.value === 'dialogue')).toBe(true);
  });

  it('action ring is the default for unknown types', () => {
    const a = ringForContext({ view: 'script', elementType: 'action' });
    const u = ringForContext({ view: 'script', elementType: 'weird' });
    expect(u.map((i) => i.id)).toEqual(a.map((i) => i.id));
  });
});

describe('activeRingItems + submenus', () => {
  it('returns submenu when key set', () => {
    const items = activeRingItems({ view: 'script', elementType: 'action' }, 'timeOfDay');
    expect(items.some((i) => i.action === 'submenu-back')).toBe(true);
    expect(items.length).toBeLessThanOrEqual(MAX_RING_ITEMS);
  });

  it('every submenu is ≤8 and has a back item', () => {
    for (const [key, items] of Object.entries(SUBMENUS)) {
      expect(items.length, key).toBeLessThanOrEqual(MAX_RING_ITEMS);
      expect(items.some((i) => i.action === 'submenu-back'), key).toBe(true);
    }
  });
});

describe('angleToIndex / marks', () => {
  it('maps up to index 0 for 8 items', () => {
    // up = dy negative, dx 0 → atan2(-1,0)+π/2 = 0
    expect(angleToIndex(0, -100, 8)).toBe(0);
  });

  it('markIndexFromVector ignores short flicks', () => {
    expect(markIndexFromVector(10, 0, 8)).toBe(-1);
    expect(markIndexFromVector(MARK_MIN_PX + 10, 0, 8)).toBeGreaterThanOrEqual(0);
  });

  it('returns -1 for empty ring', () => {
    expect(angleToIndex(1, 0, 0)).toBe(-1);
    expect(markIndexFromVector(100, 0, 0)).toBe(-1);
  });
});
