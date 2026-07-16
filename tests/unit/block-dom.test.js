/**
 * @vitest-environment jsdom
 *
 * Tests for the block DOM primitives extracted from app.js in Phase 0.
 *
 * Nothing in this layer was testable before the extraction — it was buried inside
 * a 1,939-line IIFE. readBlockText() in particular is load-bearing (it's how the
 * user's typing reaches the document model) and had zero coverage.
 */
import { describe, it, expect } from 'vitest';
import {
  setBlockDomText,
  readBlockText,
  placeCaretEnd,
  placeCaretStart,
  isCaretAtEnd,
  placeholderFor,
} from '../../src/views/script/block-dom.js';

const NBSP = String.fromCharCode(0xa0);

function editable(html = '') {
  const el = document.createElement('div');
  el.contentEditable = 'true';
  el.innerHTML = html;
  document.body.appendChild(el);
  return el;
}

describe('setBlockDomText', () => {
  it('writes plain text', () => {
    const el = editable();
    setBlockDomText(el, 'INT. HOUSE - DAY');
    expect(el.textContent).toBe('INT. HOUSE - DAY');
  });

  it('coerces null/undefined to empty rather than printing "undefined"', () => {
    const el = editable('stale');
    setBlockDomText(el, null);
    expect(el.textContent).toBe('');
  });

  it('does NOT interpret HTML — markup must never enter the editable', () => {
    const el = editable();
    setBlockDomText(el, '<b>not bold</b>');
    expect(el.textContent).toBe('<b>not bold</b>');
    expect(el.querySelector('b')).toBeNull();
  });
});

describe('readBlockText', () => {
  it('returns empty for a null element', () => {
    expect(readBlockText(null)).toBe('');
  });

  it('reads flat text', () => {
    expect(readBlockText(editable('Sarah enters.'))).toBe('Sarah enters.');
  });

  it('maps <br> to a newline — this is why textContent alone is wrong', () => {
    // The whole reason this function exists. textContent drops <br> entirely,
    // so multi-line dialogue would silently lose its line breaks.
    const el = editable('one<br>two');
    expect(el.textContent).toBe('onetwo'); // what the naive approach gives
    expect(readBlockText(el)).toBe('one\ntwo'); // what we actually need
  });

  it('normalises the nbsp that contenteditable inserts on trailing spaces', () => {
    // Regression guard: this replacement was briefly a literal nbsp in source.
    // It is now split(NBSP) against a char-code constant. If someone "tidies"
    // that into a plain space, this test goes red.
    const el = editable();
    el.textContent = 'a' + NBSP + 'b';
    expect(readBlockText(el)).toBe('a b');
  });

  it('trims exactly one trailing newline (the browser is, not the user is)', () => {
    const el = editable('text<br>');
    expect(readBlockText(el)).toBe('text');
  });

  it('inserts a break before a nested DIV but not a leading one', () => {
    expect(readBlockText(editable('<div>first</div><div>second</div>'))).toBe('first\nsecond');
  });
});

describe('caret placement', () => {
  it('placeCaretEnd collapses to the end', () => {
    const el = editable('hello');
    placeCaretEnd(el);
    const sel = window.getSelection();
    expect(sel.isCollapsed).toBe(true);
    expect(isCaretAtEnd(el)).toBe(true);
  });

  it('placeCaretStart collapses to the start', () => {
    const el = editable('hello');
    placeCaretStart(el);
    expect(window.getSelection().isCollapsed).toBe(true);
    expect(isCaretAtEnd(el)).toBe(false);
  });
});

describe('isCaretAtEnd', () => {
  it('defaults to true when there is no selection — "don\'t know" means "at end"', () => {
    // Load-bearing default: app.js:1118 only restores the caret after a
    // textContent reset when this is true. See findings.md §5.5.
    const el = editable('hello');
    window.getSelection().removeAllRanges();
    expect(isCaretAtEnd(el)).toBe(true);
  });

  it('returns true when the selection is outside the element', () => {
    const el = editable('hello');
    const other = editable('elsewhere');
    placeCaretStart(other);
    expect(isCaretAtEnd(el)).toBe(true);
  });
});

describe('placeholderFor', () => {
  it('gives each element type its own ghost text', () => {
    expect(placeholderFor('scene')).toBe('INT. LOCATION - DAY');
    expect(placeholderFor('character')).toBe('CHARACTER NAME');
    expect(placeholderFor('parenthetical')).toBe('wryly');
    expect(placeholderFor('transition')).toBe('CUT TO:');
  });

  it('falls back for unknown types rather than returning undefined', () => {
    expect(placeholderFor('nonsense')).toBe('Type...');
    expect(placeholderFor(undefined)).toBe('Type...');
  });
});
