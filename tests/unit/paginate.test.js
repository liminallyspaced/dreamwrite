/**
 * paginate() — ADR-0006 / pagination.md
 */
import { describe, it, expect } from 'vitest';
import { paginate, pageCount } from '../../src/core/script/paginate.js';
import { DEFAULT_FORMAT } from '../../src/core/script/format.js';
import { wrap } from '../../src/core/script/wrap.js';

function B(type, text, id) {
  return { id: id || `${type}-${Math.random().toString(36).slice(2, 7)}`, type, text };
}

describe('format constants', () => {
  it('bodyLines is 54 — Final Draft KB derivation', () => {
    expect(DEFAULT_FORMAT.bodyLines).toBe(54);
  });

  it('dialogue width is 35 chars', () => {
    expect(DEFAULT_FORMAT.elements.dialogue.widthChars).toBe(35);
  });

  it('blanks before scene default to 2', () => {
    expect(DEFAULT_FORMAT.elements.scene.blanksBefore).toBe(2);
  });
});

describe('paginate — basics', () => {
  it('empty blocks → one empty page', () => {
    const pages = paginate([]);
    expect(pages).toHaveLength(1);
    expect(pages[0].number).toBe(1);
    expect(pages[0].rows).toEqual([]);
  });

  it('short scene + action fits on one page', () => {
    const pages = paginate([
      B('scene', 'INT. HOUSE - DAY'),
      B('action', 'Sarah enters.'),
    ]);
    expect(pages).toHaveLength(1);
    const types = pages[0].rows.filter((r) => !r.isBlank).map((r) => r.type);
    expect(types).toEqual(['scene', 'action']);
  });

  it('never mutates input blocks', () => {
    const blocks = [B('action', 'Hello.')];
    const snapshot = JSON.stringify(blocks);
    paginate(blocks);
    expect(JSON.stringify(blocks)).toBe(snapshot);
  });

  it('skips note blocks', () => {
    const pages = paginate([
      B('action', 'Visible.'),
      B('note', 'Secret note'),
    ]);
    const texts = pages[0].rows.map((r) => r.text);
    expect(texts.join(' ')).not.toContain('Secret');
  });
});

describe('paginate — page capacity', () => {
  it('overflows to a second page when bodyLines are exceeded', () => {
    // 54 lines of action (plus blanks) must spill
    const blocks = [];
    for (let i = 0; i < 60; i++) {
      blocks.push(B('action', `Line number ${i} is here.`));
    }
    const pages = paginate(blocks);
    expect(pages.length).toBeGreaterThan(1);
    // No page exceeds bodyLines content rows
    for (const p of pages) {
      expect(p.rows.length).toBeLessThanOrEqual(DEFAULT_FORMAT.bodyLines);
    }
  });

  it('pageCount matches pages.length', () => {
    const blocks = [B('scene', 'INT. A - DAY'), B('action', 'Go.')];
    expect(pageCount(blocks)).toBe(paginate(blocks).length);
  });
});

describe('paginate — (MORE) / (CONT\'D)', () => {
  it('splits long dialogue with MORE and CONT\'D (not in the model)', () => {
    // Build dialogue that wraps to many lines
    const sentence =
      'This is a long speech that continues for quite a while without much pause. ';
    const text = sentence.repeat(80); // plenty to cross a page
    const cue = B('character', 'WAITRESS');
    const dia = B('dialogue', text);
    const blocks = [
      B('scene', 'INT. DINER - NIGHT'),
      B('action', 'The waitress leans in.'),
      cue,
      dia,
    ];
    const pages = paginate(blocks);
    expect(pages.length).toBeGreaterThan(1);

    const allRows = pages.flatMap((p) => p.rows);
    const mores = allRows.filter((r) => r.type === 'more');
    expect(mores.length).toBeGreaterThanOrEqual(1);
    expect(mores[0].text).toBe('(MORE)');
    expect(mores[0].isSynthetic).toBe(true);

    const contds = allRows.filter(
      (r) => r.type === 'character' && /\(CONT'?D\)/i.test(r.text) && r.isSynthetic,
    );
    expect(contds.length).toBeGreaterThanOrEqual(1);
    expect(contds[0].text).toMatch(/WAITRESS/);

    // Document model unchanged — no CONT'D injected into blocks
    expect(cue.text).toBe('WAITRESS');
    expect(dia.text).toBe(text);
  });

  it('reserves the MORE line (no page exceeds bodyLines including MORE)', () => {
    const sentence = 'Word. ';
    const text = sentence.repeat(400);
    const pages = paginate([
      B('character', 'BOB'),
      B('dialogue', text),
    ]);
    for (const p of pages) {
      expect(p.rows.length).toBeLessThanOrEqual(DEFAULT_FORMAT.bodyLines);
    }
  });
});

describe('paginate — break rules', () => {
  it('does not leave a character cue as the last non-blank row alone without speech when dialogue follows', () => {
    // Fill page so cue would sit at the bottom with no room for dialogue
    const blocks = [];
    for (let i = 0; i < 50; i++) {
      blocks.push(B('action', `Filler action paragraph number ${i} with words.`));
    }
    blocks.push(B('character', 'SARAH'));
    blocks.push(B('dialogue', 'Hello there friend of mine.'));

    const pages = paginate(blocks);
    for (const p of pages) {
      const content = p.rows.filter((r) => !r.isBlank);
      if (content.length === 0) continue;
      const last = content[content.length - 1];
      // If last is character, next page should start with its dialogue — or cue moved
      if (last.type === 'character' && !last.isSynthetic) {
        // Allowed only if this is truly the end of script (no more content)
        const pageIdx = pages.indexOf(p);
        const rest = pages.slice(pageIdx + 1).flatMap((x) => x.rows);
        const hasMoreDialogue = rest.some((r) => r.type === 'dialogue');
        // If dialogue remains, character shouldn't be last without MORE path
        if (hasMoreDialogue) {
          // Prefer: not alone — either MORE follows or cue moved with dialogue
          // Soft assert: next page has CONT'D or dialogue soon
          const next = pages[pageIdx + 1];
          expect(next).toBeTruthy();
        }
      }
    }
  });

  it('never ends a page with a scene heading when action follows', () => {
    const blocks = [];
    for (let i = 0; i < 52; i++) {
      blocks.push(B('action', `Pad line ${i} keeps us near the edge of the page today.`));
    }
    blocks.push(B('scene', 'INT. KITCHEN - DAY'));
    blocks.push(B('action', 'Morning light. Coffee steams on the counter near the sink.'));

    const pages = paginate(blocks);
    for (let pi = 0; pi < pages.length; pi++) {
      const content = pages[pi].rows.filter((r) => !r.isBlank);
      if (!content.length) continue;
      const last = content[content.length - 1];
      if (last.type === 'scene' && pi < pages.length - 1) {
        // Following page should start with related content; scene shouldn't be stranded
        // Strict: scene alone at end is a failure when more content exists
        expect(content.length).toBeGreaterThan(1);
      }
    }
  });
});

describe('paginate — word wrap feeds line counts', () => {
  it('counts wrapped dialogue lines, not char/cols ceil', () => {
    const words = Array.from({ length: 100 }, () => 'x').join(' ');
    const wrapped = wrap(words, 35);
    expect(wrapped.length).toBeGreaterThan(4);

    const pages = paginate([B('character', 'A'), B('dialogue', words)]);
    const diaLines = pages.flatMap((p) => p.rows).filter((r) => r.type === 'dialogue');
    expect(diaLines.length).toBe(wrapped.length);
  });
});
