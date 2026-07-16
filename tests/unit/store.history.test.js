import { describe, it, expect } from 'vitest';
import { createHistory } from '../../src/core/store/history.js';

describe('createHistory', () => {
  it('pushes and pops undo onto redo', () => {
    const h = createHistory({ maxDepth: 10, mergeWindowMs: 1000 });
    h.push({
      do: { type: 'a', payload: { n: 1 } },
      undo: { type: 'a', payload: { n: 0 } },
      label: 'one',
      at: 1000,
    });
    expect(h.canUndo()).toBe(true);
    expect(h.undoLabel()).toBe('one');
    const e = h.popUndo();
    expect(e.label).toBe('one');
    expect(h.canUndo()).toBe(false);
    expect(h.canRedo()).toBe(true);
    expect(h.redoLabel()).toBe('one');
    h.popRedo();
    expect(h.canUndo()).toBe(true);
    expect(h.canRedo()).toBe(false);
  });

  it('merges same mergeKey within window, keeps earliest undo payload', () => {
    const h = createHistory({ mergeWindowMs: 1000 });
    h.push({
      do: { type: 'blocks.setText', payload: { id: 'b1', text: 'a' } },
      undo: { type: 'blocks.setText', payload: { id: 'b1', text: '' } },
      label: 'Typing',
      mergeKey: 'block:b1',
      at: 1000,
    });
    const r = h.push({
      do: { type: 'blocks.setText', payload: { id: 'b1', text: 'ab' } },
      undo: { type: 'blocks.setText', payload: { id: 'b1', text: 'a' } },
      label: 'Typing',
      mergeKey: 'block:b1',
      at: 1500,
    });
    expect(r.merged).toBe(true);
    expect(h._depth().undo).toBe(1);
    const top = h.peekUndo();
    expect(top.do.payload.text).toBe('ab');
    expect(top.undo.payload.text).toBe(''); // earliest
  });

  it('does not merge after window expires', () => {
    const h = createHistory({ mergeWindowMs: 1000 });
    h.push({
      do: { type: 'blocks.setText', payload: { id: 'b1', text: 'a' } },
      undo: { type: 'blocks.setText', payload: { id: 'b1', text: '' } },
      mergeKey: 'block:b1',
      label: 'Typing',
      at: 1000,
    });
    h.push({
      do: { type: 'blocks.setText', payload: { id: 'b1', text: 'ab' } },
      undo: { type: 'blocks.setText', payload: { id: 'b1', text: 'a' } },
      mergeKey: 'block:b1',
      label: 'Typing',
      at: 3000,
    });
    expect(h._depth().undo).toBe(2);
  });

  it('clears redo on new push', () => {
    const h = createHistory();
    h.push({
      do: { type: 'x', payload: {} },
      undo: { type: 'x', payload: {} },
      label: 'a',
      at: 1,
    });
    h.popUndo();
    expect(h.canRedo()).toBe(true);
    h.push({
      do: { type: 'y', payload: {} },
      undo: { type: 'y', payload: {} },
      label: 'b',
      at: 2,
    });
    expect(h.canRedo()).toBe(false);
  });

  it('respects maxDepth', () => {
    const h = createHistory({ maxDepth: 3 });
    for (let i = 0; i < 5; i++) {
      h.push({
        do: { type: 'x', payload: { i } },
        undo: { type: 'x', payload: { i: i - 1 } },
        label: String(i),
        at: i,
      });
    }
    expect(h._depth().undo).toBe(3);
  });
});
