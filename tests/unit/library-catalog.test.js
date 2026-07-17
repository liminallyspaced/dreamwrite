import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadLibrary,
  saveLibrary,
  touchLibraryEntry,
  removeLibraryEntry,
  updateLibraryEntry,
  duplicateLibraryEntry,
  loadThemePref,
  saveThemePref,
  LIBRARY_KEY,
  THEME_KEY,
} from '../../src/core/library/catalog.js';

/** Minimal localStorage for node/vitest (no jsdom). */
function installLocalStorage() {
  const map = new Map();
  globalThis.localStorage = {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => {
      map.set(String(k), String(v));
    },
    removeItem: (k) => {
      map.delete(k);
    },
    clear: () => map.clear(),
  };
}

beforeEach(() => {
  installLocalStorage();
  localStorage.removeItem(LIBRARY_KEY);
  localStorage.removeItem(THEME_KEY);
});

describe('library catalog', () => {
  it('starts empty', () => {
    expect(loadLibrary()).toEqual([]);
  });

  it('touches entries most-recent first', () => {
    touchLibraryEntry({ id: 'a', title: 'A', path: '/a' });
    touchLibraryEntry({ id: 'b', title: 'B', path: '/b' });
    const list = loadLibrary();
    expect(list[0].id).toBe('b');
    expect(list[1].id).toBe('a');
  });

  it('updates and removes', () => {
    touchLibraryEntry({ id: 'a', title: 'A' });
    updateLibraryEntry('a', { title: 'Renamed', coverDataUrl: 'data:x' });
    expect(loadLibrary()[0].title).toBe('Renamed');
    expect(loadLibrary()[0].coverDataUrl).toBe('data:x');
    removeLibraryEntry('a');
    expect(loadLibrary()).toEqual([]);
  });

  it('duplicates as autosave copy', () => {
    touchLibraryEntry({ id: 'a', title: 'A', path: '/a', kind: 'v2-folder' });
    const d = duplicateLibraryEntry('a');
    expect(d.title).toContain('copy');
    expect(d.path).toBeNull();
    expect(loadLibrary().length).toBe(2);
  });

  it('theme pref', () => {
    expect(loadThemePref()).toBe('carbon');
    saveThemePref('manuscript');
    expect(loadThemePref()).toBe('manuscript');
  });

  it('saveLibrary caps length', () => {
    const many = Array.from({ length: 60 }, (_, i) => ({
      id: `i${i}`,
      title: `T${i}`,
      path: null,
      kind: 'autosave',
      lastOpened: new Date().toISOString(),
    }));
    saveLibrary(many);
    expect(loadLibrary().length).toBe(48);
  });
});
