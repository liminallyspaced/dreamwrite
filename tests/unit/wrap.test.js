/**
 * wrap() — greedy word-fitting (pagination.md §3, §7).
 */
import { describe, it, expect } from 'vitest';
import { wrap, wrapParenthetical } from '../../src/core/script/wrap.js';

describe('wrap', () => {
  it('returns a single empty line for empty text', () => {
    expect(wrap('', 60)).toEqual(['']);
  });

  it('keeps short text on one line', () => {
    expect(wrap('Hello world.', 60)).toEqual(['Hello world.']);
  });

  it('greedy word-fits; never hyphenates', () => {
    // 100 single-char words: ~18 fit per 35-col line → ~6 lines.
    // Char-count ceil(199/35)=6 happens to agree; the important property is
    // whole-word boundaries and no hyphens (see also longer-word case below).
    const words = Array.from({ length: 100 }, () => 'x').join(' ');
    const lines = wrap(words, 35);
    expect(lines.every((l) => l.length <= 35)).toBe(true);
    expect(lines.every((l) => !/-/.test(l))).toBe(true);
    expect(lines.length).toBeGreaterThan(4);
    expect(lines.join(' ').replace(/\s+/g, ' ').trim()).toBe(words);
  });

  it('under-counts vs naive char/cols when words leave ragged gaps', () => {
    // "hello" = 5; six fit in 35 (5*6+5=35). 20 words → 4 lines.
    // Char length = 119; ceil(119/35)=4. Use mixed lengths so wrap > ceil:
    const words = Array.from({ length: 30 }, (_, i) => (i % 2 ? 'hi' : 'wonderful')).join(' ');
    const lines = wrap(words, 35);
    const naive = Math.ceil(words.length / 35);
    expect(lines.every((l) => l.length <= 35)).toBe(true);
    expect(lines.length).toBeGreaterThanOrEqual(naive);
  });

  it('never breaks mid-word unless the word exceeds columns', () => {
    const lines = wrap('alpha bravo charlie', 10);
    expect(lines).toEqual(['alpha', 'bravo', 'charlie']);
  });

  it('hard-splits overlong words without inserting hyphens', () => {
    const lines = wrap('abcdefghijKLMNOP', 5);
    expect(lines).toEqual(['abcde', 'fghij', 'KLMNO', 'P']);
    expect(lines.join('')).toBe('abcdefghijKLMNOP');
  });

  it('honours hard newlines', () => {
    expect(wrap('one\ntwo three', 20)).toEqual(['one', 'two three']);
  });

  it('dialogue column 35 matches industry width', () => {
    const d =
      'This is a line of dialogue that should wrap somewhere near thirty-five.';
    const lines = wrap(d, 35);
    expect(lines.every((l) => l.length <= 35)).toBe(true);
    expect(lines.length).toBeGreaterThanOrEqual(2);
  });
});

describe('wrapParenthetical', () => {
  it('wraps short parentheticals with parens on one line', () => {
    expect(wrapParenthetical('beat', 29)).toEqual(['(beat)']);
  });

  it('outdents continuation lines by one character space', () => {
    const long =
      'whispering urgently so the whole room can somehow still hear every word';
    const lines = wrapParenthetical(long, 29);
    expect(lines[0].startsWith('(')).toBe(true);
    expect(lines.length).toBeGreaterThan(1);
    // Continuations are space-prefixed (outdent under text, not paren)
    for (let i = 1; i < lines.length; i++) {
      expect(lines[i].startsWith(' ')).toBe(true);
    }
  });
});
