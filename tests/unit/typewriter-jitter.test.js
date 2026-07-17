import { describe, it, expect } from 'vitest';
import {
  pageTypewriterJitter,
  jitterSeedFromKey,
} from '../../src/core/script/typewriter-jitter.js';

describe('typewriter jitter', () => {
  it('is deterministic per page + seed', () => {
    const a = pageTypewriterJitter(3, { seed: 42 });
    const b = pageTypewriterJitter(3, { seed: 42 });
    expect(a).toEqual(b);
  });

  it('varies across pages', () => {
    const p1 = pageTypewriterJitter(1, { seed: 1 });
    const p2 = pageTypewriterJitter(2, { seed: 1 });
    const p3 = pageTypewriterJitter(3, { seed: 1 });
    // Not all identical (extremely unlikely with hash)
    const key = (j) => `${j.dxIn},${j.dyIn}`;
    expect(new Set([key(p1), key(p2), key(p3)]).size).toBeGreaterThan(1);
  });

  it('stays within tiny bounds', () => {
    for (let n = 1; n <= 40; n++) {
      const j = pageTypewriterJitter(n, { seed: 7, maxXIn: 0.028, maxYIn: 0.018 });
      expect(Math.abs(j.dxIn)).toBeLessThanOrEqual(0.028);
      expect(Math.abs(j.dyIn)).toBeLessThanOrEqual(0.018);
    }
  });

  it('disabled returns zeros', () => {
    expect(pageTypewriterJitter(5, { enabled: false })).toEqual({
      dxIn: 0,
      dyIn: 0,
      dxPx: 0,
      dyPx: 0,
    });
  });

  it('seed from key is stable', () => {
    expect(jitterSeedFromKey('THE LAST SIGNAL')).toBe(jitterSeedFromKey('THE LAST SIGNAL'));
    expect(jitterSeedFromKey('A')).not.toBe(jitterSeedFromKey('B'));
  });
});
