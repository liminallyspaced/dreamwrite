import { describe, it, expect } from 'vitest';
import {
  layoutColumnChildren,
  insertChildId,
  removeChildId,
  indexFromY,
  findColumnAtPoint,
  moveColumnUnit,
  snapCardIntoColumn,
  detachCardFromColumn,
  SEMANTIC_COLORS,
  COLUMN_HEADER,
} from '../../src/core/board/columns.js';

describe('column child list helpers', () => {
  it('inserts and removes without duplicates', () => {
    expect(insertChildId(['a', 'b'], 'c', 1)).toEqual(['a', 'c', 'b']);
    expect(insertChildId(['a', 'b'], 'a', 2)).toEqual(['b', 'a']);
    expect(removeChildId(['a', 'b', 'c'], 'b')).toEqual(['a', 'c']);
  });
});

describe('layoutColumnChildren', () => {
  it('stacks children and grows column height', () => {
    const col = {
      id: 'col1',
      type: 'column',
      x: 100,
      y: 50,
      w: 240,
      h: 100,
      childIds: ['n1', 'n2'],
    };
    const items = {
      col1: col,
      n1: { id: 'n1', type: 'note', x: 0, y: 0, w: 200, h: 80 },
      n2: { id: 'n2', type: 'note', x: 0, y: 0, w: 200, h: 80 },
    };
    const { updates, columnPatch } = layoutColumnChildren(col, items);
    expect(updates).toHaveLength(2);
    expect(updates[0].patch.parentId).toBe('col1');
    expect(updates[0].patch.x).toBe(100 + 12);
    expect(updates[1].patch.y).toBeGreaterThan(updates[0].patch.y);
    expect(columnPatch.h).toBeGreaterThan(100);
  });

  it('collapses to header height', () => {
    const col = {
      id: 'col1',
      type: 'column',
      x: 0,
      y: 0,
      w: 240,
      collapsed: true,
      childIds: ['n1'],
    };
    const items = {
      col1: col,
      n1: { id: 'n1', type: 'note', h: 80 },
    };
    const { columnPatch } = layoutColumnChildren(col, items);
    expect(columnPatch.h).toBe(COLUMN_HEADER + 28);
  });
});

describe('snap / detach', () => {
  it('snaps a free card into a column', () => {
    const col = {
      id: 'col1',
      type: 'column',
      x: 0,
      y: 0,
      w: 240,
      h: 200,
      childIds: [],
    };
    const card = { id: 'n1', type: 'note', x: 500, y: 500, w: 200, h: 80 };
    const items = { col1: col, n1: card };
    const updates = snapCardIntoColumn(col, card, items, 0);
    const colUp = updates.find((u) => u.id === 'col1');
    expect(colUp.patch.childIds).toContain('n1');
    const cardUp = updates.find((u) => u.id === 'n1');
    expect(cardUp.patch.parentId).toBe('col1');
  });

  it('detaches a card from a column', () => {
    const col = {
      id: 'col1',
      type: 'column',
      x: 0,
      y: 0,
      w: 240,
      childIds: ['n1'],
    };
    const card = { id: 'n1', type: 'note', parentId: 'col1', x: 12, y: 50, h: 80 };
    const items = { col1: col, n1: card };
    const updates = detachCardFromColumn(card, items, { x: 300, y: 200 });
    expect(updates.find((u) => u.id === 'n1').patch.parentId).toBeNull();
    expect(updates.find((u) => u.id === 'col1').patch.childIds).toEqual([]);
  });
});

describe('geometry helpers', () => {
  it('finds column at point', () => {
    const cols = [{ id: 'c', type: 'column', x: 10, y: 10, w: 100, h: 200 }];
    expect(findColumnAtPoint(cols, { x: 50, y: 50 })?.id).toBe('c');
    expect(findColumnAtPoint(cols, { x: 0, y: 0 })).toBeNull();
  });

  it('moves column as a unit', () => {
    const col = { id: 'c', type: 'column', x: 0, y: 0, childIds: ['n1'] };
    const items = { c: col, n1: { id: 'n1', x: 10, y: 40 } };
    const ups = moveColumnUnit(col, items, 20, 30);
    expect(ups.find((u) => u.id === 'c').patch).toEqual({ x: 20, y: 30 });
    expect(ups.find((u) => u.id === 'n1').patch).toEqual({ x: 30, y: 70 });
  });

  it('indexFromY orders by vertical midpoints', () => {
    const col = {
      id: 'c',
      type: 'column',
      x: 0,
      y: 0,
      childIds: ['a', 'b'],
    };
    const items = {
      a: { id: 'a', h: 80 },
      b: { id: 'b', h: 80 },
    };
    // Near top of first child
    expect(indexFromY(col, items, COLUMN_HEADER + 10)).toBe(0);
  });

  it('exports semantic palette', () => {
    expect(SEMANTIC_COLORS.length).toBeGreaterThanOrEqual(4);
    expect(SEMANTIC_COLORS.every((c) => c.value && c.id)).toBe(true);
  });
});
