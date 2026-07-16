import { describe, it, expect } from 'vitest';
import {
  escapeHtml,
  escapeAttr,
  safeColor,
  escapeRegExp,
  slugify,
  baseName,
} from '../../src/views/shared/text.js';

describe('views/shared/text', () => {
  it('escapeHtml encodes markup', () => {
    expect(escapeHtml('<b>&"')).toBe('&lt;b&gt;&amp;&quot;');
  });

  it('escapeAttr also encodes single quotes', () => {
    expect(escapeAttr("it's")).toBe('it&#39;s');
  });

  it('safeColor whitelists hex and keywords only', () => {
    expect(safeColor('#abc')).toBe('#abc');
    expect(safeColor('#aabbcc')).toBe('#aabbcc');
    expect(safeColor('black')).toBe('black');
    expect(safeColor('red;background-image:url(x)')).toBe('#6ea8ff');
    expect(safeColor(null, '#000')).toBe('#000');
  });

  it('escapeRegExp escapes specials', () => {
    expect(escapeRegExp('a.b*')).toBe('a\\.b\\*');
  });

  it('slugify and baseName', () => {
    expect(slugify('My Script!!')).toBe('my-script');
    expect(baseName('C:\\work\\foo.fountain')).toBe('foo');
  });
});
