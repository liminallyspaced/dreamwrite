import { describe, it, expect } from 'vitest';
import {
  cardAnchor,
  facingSide,
  facingSides,
  constrainHV,
  connectorPathD,
  resolveEndpoints,
  hitTestCard,
  makeConnectorFields,
} from '../../src/core/board/connectors.js';

const A = { id: 'a', x: 0, y: 0, w: 100, h: 100, type: 'note' };
const B = { id: 'b', x: 200, y: 0, w: 100, h: 100, type: 'note' };

describe('connector geometry', () => {
  it('anchors to card edges', () => {
    expect(cardAnchor(A, 'e')).toEqual({ x: 100, y: 50 });
    expect(cardAnchor(A, 'n')).toEqual({ x: 50, y: 0 });
  });

  it('picks facing sides between cards', () => {
    const s = facingSides(A, B);
    expect(s.fromSide).toBe('e');
    expect(s.toSide).toBe('w');
  });

  it('Shift constrains to H or V', () => {
    expect(constrainHV({ x: 0, y: 0 }, { x: 40, y: 10 })).toEqual({ x: 40, y: 0 });
    expect(constrainHV({ x: 0, y: 0 }, { x: 5, y: 50 })).toEqual({ x: 0, y: 50 });
  });

  it('builds straight and curved paths', () => {
    const straight = connectorPathD({ x: 0, y: 0 }, { x: 10, y: 0 }, { curved: false });
    expect(straight).toContain('L');
    const curved = connectorPathD({ x: 0, y: 0 }, { x: 10, y: 10 }, { curved: true });
    expect(curved).toContain('Q');
  });

  it('resolves attached endpoints and free ends', () => {
    const items = { a: A, b: B };
    const attached = resolveEndpoints(
      { fromId: 'a', toId: 'b', fromSide: 'e', toSide: 'w' },
      items
    );
    expect(attached.ok).toBe(true);
    expect(attached.p0.x).toBe(100);
    expect(attached.p1.x).toBe(200);

    const free = resolveEndpoints({ fromId: 'a', freeX: 300, freeY: 40 }, items);
    expect(free.ok).toBe(true);
    expect(free.p1).toEqual({ x: 300, y: 40 });
  });

  it('hit-tests cards under a point', () => {
    expect(hitTestCard([A, B], { x: 250, y: 50 })?.id).toBe('b');
    expect(hitTestCard([A, B], { x: 500, y: 500 })).toBeNull();
  });

  it('makeConnectorFields defaults', () => {
    const f = makeConnectorFields({ fromId: 'a', toId: 'b' });
    expect(f.type).toBe('connector');
    expect(f.curved).toBe(true);
    expect(f.fromId).toBe('a');
  });
});
