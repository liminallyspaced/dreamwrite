import { describe, it, expect } from 'vitest';
import { KEYMAP, searchKeymap, keymapByGroup } from '../../src/core/keymap.js';

describe('keymap', () => {
  it('has core bindings', () => {
    expect(KEYMAP.some((k) => k.action === 'palette')).toBe(true);
    expect(KEYMAP.some((k) => k.action === 'save')).toBe(true);
  });

  it('searches by label and keys', () => {
    expect(searchKeymap('palette').length).toBeGreaterThan(0);
    expect(searchKeymap('Ctrl+S').some((k) => k.action === 'save')).toBe(true);
  });

  it('groups bindings', () => {
    const g = keymapByGroup();
    expect(Object.keys(g).length).toBeGreaterThan(2);
  });
});
