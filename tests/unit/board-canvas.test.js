import { describe, it, expect } from 'vitest';
import {
  boundsOfItems,
  fitCameraToBounds,
  snapWithGuides,
  cloneBoardItem,
  wouldCreateBoardCycle,
  moveItemToBoard,
  findSubBoardAtPoint,
} from '../../src/core/board/canvas.js';
import { emptyBoardGraph, createBoardItem, addItemToBoard, createSubBoard } from '../../src/core/board/model.js';

describe('bounds + fit', () => {
  it('computes bounds of cards', () => {
    const b = boundsOfItems([
      { id: 'a', x: 0, y: 0, w: 100, h: 50 },
      { id: 'b', x: 200, y: 100, w: 100, h: 50 },
    ]);
    expect(b).toEqual({ x0: 0, y0: 0, x1: 300, y1: 150 });
  });

  it('fits camera so content is scaled into viewport', () => {
    const cam = { scale: 1, panX: 0, panY: 0, minScale: 0.1, maxScale: 4, x0: 0, y0: 0 };
    const next = fitCameraToBounds(cam, { x0: 0, y0: 0, x1: 1000, y1: 1000 }, { width: 500, height: 500 }, 50);
    expect(next.scale).toBeLessThan(1);
    expect(next.scale).toBeGreaterThan(0);
  });
});

describe('guides', () => {
  it('snaps left edges together within threshold', () => {
    const moving = { id: 'm', x: 102, y: 10, w: 100, h: 80 };
    const others = [{ id: 'o', x: 100, y: 200, w: 100, h: 80 }];
    const r = snapWithGuides(moving, others, 6);
    expect(r.x).toBe(100);
    expect(r.guides.some((g) => g.type === 'v')).toBe(true);
  });
});

describe('clone', () => {
  it('clones with new id and offset', () => {
    const c = cloneBoardItem({ id: 'a', type: 'note', x: 10, y: 20, body: 'hi' }, 'b', {
      x: 30,
      y: 40,
    });
    expect(c.id).toBe('b');
    expect(c.x).toBe(40);
    expect(c.y).toBe(60);
    expect(c.body).toBe('hi');
    expect(c.parentId).toBeNull();
  });
});

describe('nested board move + cycle guard', () => {
  it('blocks moving a sub-board tile into its own board', () => {
    let g = emptyBoardGraph();
    const { graph, boardId, tileId } = createSubBoard(g, g.rootId, 'Child');
    g = graph;
    expect(wouldCreateBoardCycle(g, tileId, boardId)).toBe(true);
    const res = moveItemToBoard(g, tileId, boardId);
    expect(res.error).toBe('cycle');
  });

  it('moves a note into a nested board', () => {
    let g = emptyBoardGraph();
    const note = createBoardItem('note', { boardId: g.rootId, id: 'n1', x: 0, y: 0 });
    g = addItemToBoard(g, g.rootId, note);
    const sub = createSubBoard(g, g.rootId, 'Child');
    g = sub.graph;
    const res = moveItemToBoard(g, 'n1', sub.boardId);
    expect(res.error).toBeUndefined();
    expect(res.graph.items.n1.boardId).toBe(sub.boardId);
    expect(res.graph.boards[g.rootId].items).not.toContain('n1');
    expect(res.graph.boards[sub.boardId].items).toContain('n1');
  });

  it('finds sub-board tiles under a point', () => {
    const tile = { id: 't', type: 'sub-board', x: 50, y: 50, w: 160, h: 120 };
    expect(findSubBoardAtPoint([tile], { x: 60, y: 60 })?.id).toBe('t');
    expect(findSubBoardAtPoint([tile], { x: 0, y: 0 })).toBeNull();
  });
});
