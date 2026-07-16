/**
 * CHARACTERIZATION tests for the inherited engine.
 *
 * These pin down what engine.js does TODAY — bugs included. They are not a
 * statement that the behaviour is correct. Their job is to make the Phase 0
 * module split provably behaviour-preserving: if a refactor changes an answer,
 * a test goes red.
 *
 * Tests that assert a KNOWN BUG are tagged `BUG:` and cite the finding. When the
 * bug is fixed in Phase 1, the test flips to asserting the correct behaviour —
 * deliberately, with the ADR referenced. Do not "fix" one by loosening it.
 *
 * See docs/plan/00-findings.md
 */
import { describe, it, expect } from 'vitest';
import * as E from '../../src/engine.js';

describe('module surface', () => {
  it('exports the functions app.js consumes via window.ScriptEngine', () => {
    // engine-global.js re-exports this namespace wholesale; app.js:3 grabs it.
    // If an export disappears, app.js breaks at runtime with no compile error.
    const required = [
      'ELEMENTS', 'ELEMENT_LABELS', 'TAB_CYCLE', 'ENTER_NEXT', 'FORMAT',
      'uid', 'emptyProject', 'createBlock', 'normalizeType', 'normalizeBlock',
      'normalizeProject', 'characterBaseName', 'applyContd', 'lintScript',
      'toFountain', 'fromFountain', 'extractCharacters', 'extractLocations',
      'parseSceneHeading', 'autoCardsFromScenes', 'computeStats', 'toPdfHtml',
      'pushHistory', 'estimatePages', 'paginate', 'pageCount',
    ];
    for (const name of required) {
      expect(E[name], `missing export: ${name}`).toBeDefined();
    }
  });
});

describe('emptyProject', () => {
  it('is version 1 with the documented shape', () => {
    const p = E.emptyProject();
    expect(p.version).toBe(1);
    expect(p.format).toBe('platen');
    expect(Array.isArray(p.blocks)).toBe(true);
    expect(p.characters).toEqual([]);
    expect(p.locations).toEqual([]);
    expect(p.cards).toEqual([]);
    expect(p.history).toEqual([]);
  });

  it('seeds a scene + action block', () => {
    const p = E.emptyProject();
    expect(p.blocks.map((b) => b.type)).toEqual(['scene', 'action']);
  });
});

describe('parseSceneHeading', () => {
  it('splits INT./EXT., location and time', () => {
    const r = E.parseSceneHeading('INT. COFFEE SHOP - DAY');
    expect(r.location).toBe('COFFEE SHOP');
    expect(r.time).toBe('DAY');
  });
});

describe('characterBaseName', () => {
  it('strips extensions', () => {
    expect(E.characterBaseName("SARAH (V.O.)")).toBe('SARAH');
    expect(E.characterBaseName("SARAH (CONT'D)")).toBe('SARAH');
    expect(E.characterBaseName('SARAH')).toBe('SARAH');
  });
});

describe('Fountain import — scene detection', () => {
  it('detects a real scene heading', () => {
    expect(E.looksLikeScene('INT. HOUSE - DAY')).toBe(true);
  });

  it('BUG: any line containing " - DAY" is treated as a scene heading', () => {
    // findings.md §5.5 — engine.js:192-198 guards on
    //   `u === line.trim().toUpperCase()` where `u` IS `line.trim().toUpperCase()`.
    // A tautology: always true. The intent was "the line is already all-caps".
    // Consequence: prose imports as a slugline.
    expect(E.looksLikeScene('He waited - DAY after day')).toBe(true);
    //                                                     ^^^^ should be false
  });

  it('BUG: any line ending "TO:" is a transition regardless of case', () => {
    // findings.md §5.5 — same tautology at engine.js:206.
    expect(E.looksLikeTransition('CUT TO:')).toBe(true);
    expect(E.looksLikeTransition('he turned to:')).toBe(true);
    //                            ^^^^ lowercase prose; should be false
  });
});

describe('Fountain round-trip', () => {
  it('preserves scene/action/character/dialogue through export→import', () => {
    const p = E.emptyProject();
    p.blocks = [
      E.createBlock('scene', 'INT. HOUSE - DAY'),
      E.createBlock('action', 'Sarah enters.'),
      E.createBlock('character', 'SARAH'),
      E.createBlock('dialogue', 'Hello.'),
    ];
    const round = E.fromFountain(E.toFountain(p));
    const got = round.blocks.filter((b) => b.text.trim()).map((b) => [b.type, b.text]);
    expect(got).toEqual([
      ['scene', 'INT. HOUSE - DAY'],
      ['action', 'Sarah enters.'],
      ['character', 'SARAH'],
      ['dialogue', 'Hello.'],
    ]);
  });

  it('BUG: notes are exported as [[...]] but silently dropped on re-import', () => {
    // findings.md §5.5 — export writes notes (engine.js:177-180); import
    // discards them (engine.js:289-292). Not round-trip safe: data loss.
    const p = E.emptyProject();
    p.blocks = [E.createBlock('note', 'remember this')];

    const fountain = E.toFountain(p);
    expect(fountain).toContain('remember this'); // it IS written out

    const round = E.fromFountain(fountain);
    const notes = round.blocks.filter((b) => b.type === 'note');
    expect(notes).toEqual([]); // ...and silently lost coming back
  });
});

describe('pagination — ADR-0006 (fixed)', () => {
  it('uses word-wrapped lines via paginate(), not char-count ceil', () => {
    // Was: estimatePages used Math.ceil(text.length / cols) → systematic under-count.
    // Now: same engine as PDF/stats (core/script/paginate.js).
    const words = Array.from({ length: 100 }, () => 'x').join(' ');
    const blocks = [
      E.createBlock('character', 'A'),
      E.createBlock('dialogue', words),
    ];
    const pages = E.paginate(blocks);
    const diaLines = pages.flatMap((p) => p.rows).filter((r) => r.type === 'dialogue');
    expect(diaLines.length).toBeGreaterThan(4);
    expect(E.estimatePages(blocks)).toBe(pages.length);
    expect(E.pageCount(blocks)).toBe(pages.length);
  });

  it('FORMAT.linesPerPage is 54 (pagination.md §2 / FD KB)', () => {
    expect(E.FORMAT.linesPerPage).toBe(54);
  });

  it('dialogue is 35 columns — spec CONFIRMS this is correct', () => {
    // Nicholl: dialogue margins left 2.5in / right 2.5in -> 3.5in -> 35 chars.
    // Do NOT "fix" this to 30. See pagination.md §3.
    expect(E.charsPerLine('dialogue')).toBe(35);
  });

  it('toPdfHtml embeds Courier Prime and page structure', () => {
    const p = E.emptyProject();
    p.blocks = [
      E.createBlock('scene', 'INT. HOUSE - DAY'),
      E.createBlock('action', 'Light.'),
    ];
    const html = E.toPdfHtml(p);
    expect(html).toContain('Courier Prime');
    expect(html).toContain('base64,');
    expect(html).toContain('script-page');
    expect(html).toContain('__platenFontsReady');
  });
});

describe('computeStats', () => {
  it('counts scenes, words and unique characters', () => {
    const p = E.emptyProject();
    p.blocks = [
      E.createBlock('scene', 'INT. HOUSE - DAY'),
      E.createBlock('character', 'SARAH'),
      E.createBlock('dialogue', 'One two three.'),
      E.createBlock('character', 'SARAH (V.O.)'),
      E.createBlock('dialogue', 'Four five.'),
    ];
    const s = E.computeStats(p);
    expect(s.scenes).toBe(1);
    expect(s.characters).toBe(1); // SARAH and SARAH (V.O.) are one person
    expect(s.dialogueWords).toBe(5);
  });
});

describe('pushHistory', () => {
  it('BUG: stores full deep copies of every block inside the project', () => {
    // findings.md §5.5 #1 — this is the mechanism behind the worst bug in the
    // codebase. history[] lives INSIDE the document (engine.js:907); app.js:567
    // then serialises the whole thing to localStorage on every autosave and
    // swallows the quota error with a bare catch {}. Autosave dies silently.
    // ADR-0004 moves revisions OUT of the document.
    const p = E.emptyProject();
    p.blocks = [E.createBlock('action', 'x'.repeat(1000))];
    E.pushHistory(p, 'test');

    expect(p.history).toHaveLength(1);
    expect(JSON.stringify(p.history)).toContain('x'.repeat(1000));
  });

  it('caps history at 30 entries', () => {
    const p = E.emptyProject();
    for (let i = 0; i < 35; i++) E.pushHistory(p, `edit ${i}`);
    expect(p.history).toHaveLength(30);
  });
});
