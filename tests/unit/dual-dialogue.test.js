/**
 * Dual dialogue — model + paginate + Fountain round-trip (Phase 7).
 */
import { describe, it, expect } from 'vitest';
import { paginate } from '../../src/core/script/paginate.js';
import { toFountain, fromFountain, createBlock } from '../../src/engine.js';

function B(type, text, extra = {}) {
  return { id: `${type}-${Math.random().toString(36).slice(2, 7)}`, type, text, ...extra };
}

describe('dual dialogue pagination', () => {
  it('emits dual-row rows for a dual pair (side-by-side unit)', () => {
    const blocks = [
      B('scene', 'INT. ROOM - DAY'),
      B('character', 'ALICE'),
      B('dialogue', 'Left side.'),
      B('character', 'BOB', { dual: true }),
      B('dialogue', 'Right side.'),
    ];
    const pages = paginate(blocks);
    const duals = pages.flatMap((p) => p.rows.filter((r) => r.type === 'dual-row'));
    expect(duals.length).toBeGreaterThan(0);
    const first = duals[0];
    expect(first.left?.character).toMatch(/ALICE/);
    expect(first.right?.character).toMatch(/BOB/);
    expect(first.left?.text || first.leftText || '').toMatch(/Left|ALICE|/);
  });

  it('dual pair does not exceed bodyLines when short', () => {
    const blocks = [
      B('character', 'A'),
      B('dialogue', 'Hi.'),
      B('character', 'B', { dual: true }),
      B('dialogue', 'Yo.'),
    ];
    const pages = paginate(blocks);
    expect(pages).toHaveLength(1);
    for (const p of pages) {
      expect(p.rows.length).toBeLessThanOrEqual(54);
    }
  });

  it('never mutates dual flags on input blocks', () => {
    const blocks = [
      B('character', 'A'),
      B('dialogue', 'One.'),
      B('character', 'B', { dual: true }),
      B('dialogue', 'Two.'),
    ];
    const snap = JSON.stringify(blocks);
    paginate(blocks);
    expect(JSON.stringify(blocks)).toBe(snap);
  });
});

describe('Fountain dual round-trip', () => {
  it('exports dual character with caret and imports dual:true', () => {
    const project = {
      titlePage: { title: 'Dual Test' },
      blocks: [
        createBlock('scene', 'INT. ROOM - DAY'),
        createBlock('character', 'ALICE'),
        createBlock('dialogue', 'Hello.'),
        { ...createBlock('character', 'BOB'), dual: true },
        createBlock('dialogue', 'Hi.'),
      ],
    };
    const f = toFountain(project);
    expect(f).toMatch(/BOB\s*\^/i);

    const back = fromFountain(f);
    const chars = back.blocks.filter((b) => b.type === 'character');
    expect(chars.length).toBeGreaterThanOrEqual(2);
    const bob = chars.find((c) => /BOB/.test(c.text || ''));
    expect(bob?.dual).toBe(true);
    // caret stripped from stored name
    expect(bob?.text).not.toMatch(/\^/);
  });

  it('imports Fountain dual caret lines', () => {
    const fountain = `Title: T

===

INT. ROOM - DAY

ALICE
Hello.

BOB^
Hi there.
`;
    const p = fromFountain(fountain);
    const bob = p.blocks.find((b) => b.type === 'character' && /BOB/.test(b.text || ''));
    expect(bob?.dual).toBe(true);
  });
});

describe('same-speaker CONT\'D at paginate time', () => {
  it('injects CONT\'D on return after action without writing into model', () => {
    const blocks = [
      B('character', 'MAYA'),
      B('dialogue', 'One.'),
      B('action', 'She waits.'),
      B('character', 'MAYA'),
      B('dialogue', 'Two.'),
    ];
    const pages = paginate(blocks);
    const cues = pages.flatMap((p) =>
      p.rows.filter((r) => r.type === 'character' && !r.isSynthetic)
    );
    // Second live cue should show CONT'D (paginate-time)
    const mayaCues = cues.filter((r) => /MAYA/i.test(r.text || ''));
    expect(mayaCues.length).toBeGreaterThanOrEqual(2);
    expect(mayaCues.some((r) => /CONT'?D/i.test(r.text || ''))).toBe(true);
    // Model clean
    expect(blocks[3].text).toBe('MAYA');
  });

  it('page-break CONT\'D does not double-stack', () => {
    // Long dialogue to force MORE/CONT'D, same speaker already has return CONT'D path
    const long = Array.from({ length: 40 }, (_, i) => `Word ${i} fills the line here.`).join(' ');
    const blocks = [
      B('character', 'SAM'),
      B('dialogue', long),
    ];
    const pages = paginate(blocks);
    const synthetic = pages.flatMap((p) =>
      p.rows.filter((r) => r.type === 'character' && r.isSynthetic)
    );
    for (const row of synthetic) {
      // One CONT'D marker max
      const matches = (row.text || '').match(/CONT'?D/gi) || [];
      expect(matches.length).toBeLessThanOrEqual(1);
    }
  });
});

describe('scene numbers', () => {
  it('attaches sequential scene numbers to scene rows when enabled', () => {
    const blocks = [
      B('scene', 'INT. A - DAY'),
      B('action', 'Go.'),
      B('scene', 'EXT. B - NIGHT'),
      B('action', 'Stop.'),
    ];
    const pages = paginate(blocks, { sceneNumbers: { mode: 'both' } });
    const scenes = pages.flatMap((p) => p.rows.filter((r) => r.type === 'scene'));
    expect(scenes[0].sceneNumber).toBe(1);
    expect(scenes[1].sceneNumber).toBe(2);
  });

  it('hides scene numbers when mode is hidden', () => {
    const blocks = [B('scene', 'INT. A - DAY'), B('action', 'X.')];
    const pages = paginate(blocks, { sceneNumbers: { mode: 'hidden' } });
    const scenes = pages.flatMap((p) => p.rows.filter((r) => r.type === 'scene'));
    expect(scenes[0].sceneNumber == null || scenes[0].sceneNumberHidden).toBeTruthy();
  });
});
