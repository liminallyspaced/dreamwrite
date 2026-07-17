/**
 * Project library catalog — recent entries in localStorage.
 * Phase 10. Covers optional (data URL or platen asset hash).
 */

export const LIBRARY_KEY = 'dreamwrite.library.v1';
export const THEME_KEY = 'dreamwrite.theme';

/**
 * @typedef {{
 *   id: string,
 *   title: string,
 *   path: string|null,
 *   kind: 'v1-file'|'v2-folder'|'sample'|'autosave'|string,
 *   lastOpened: string,
 *   pageCount?: number,
 *   sceneCount?: number,
 *   coverDataUrl?: string|null,
 * }} LibraryEntry
 */

/**
 * @returns {LibraryEntry[]}
 */
export function loadLibrary() {
  try {
    const raw = localStorage.getItem(LIBRARY_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

/**
 * @param {LibraryEntry[]} list
 */
export function saveLibrary(list) {
  localStorage.setItem(LIBRARY_KEY, JSON.stringify((list || []).slice(0, 48)));
}

/**
 * Upsert a recent project entry (most recent first).
 * @param {Partial<LibraryEntry> & { title: string }} entry
 */
export function touchLibraryEntry(entry) {
  const list = loadLibrary().filter(
    (e) => e.id !== entry.id && !(entry.path && e.path === entry.path)
  );
  const next = {
    id: entry.id || `lib_${Date.now().toString(36)}`,
    title: entry.title || 'Untitled',
    path: entry.path ?? null,
    kind: entry.kind || 'autosave',
    lastOpened: entry.lastOpened || new Date().toISOString(),
    pageCount: entry.pageCount ?? 0,
    sceneCount: entry.sceneCount ?? 0,
    coverDataUrl: entry.coverDataUrl ?? null,
  };
  list.unshift(next);
  saveLibrary(list);
  return next;
}

/**
 * @param {string} id
 */
export function removeLibraryEntry(id) {
  saveLibrary(loadLibrary().filter((e) => e.id !== id));
}

/**
 * @param {string} id
 * @param {Partial<LibraryEntry>} patch
 */
export function updateLibraryEntry(id, patch) {
  const list = loadLibrary().map((e) => (e.id === id ? { ...e, ...patch } : e));
  saveLibrary(list);
  return list.find((e) => e.id === id) || null;
}

/**
 * @param {string} id
 * @returns {LibraryEntry|null}
 */
export function getLibraryEntry(id) {
  return loadLibrary().find((e) => e.id === id) || null;
}

/**
 * Duplicate entry metadata (not the file).
 * @param {string} id
 */
export function duplicateLibraryEntry(id) {
  const src = getLibraryEntry(id);
  if (!src) return null;
  return touchLibraryEntry({
    ...src,
    id: `lib_${Date.now().toString(36)}`,
    title: `${src.title} (copy)`,
    path: null,
    kind: 'autosave',
    lastOpened: new Date().toISOString(),
  });
}

/**
 * @param {string} themeId
 */
export function saveThemePref(themeId) {
  localStorage.setItem(THEME_KEY, themeId);
}

/**
 * @returns {string}
 */
export function loadThemePref() {
  return localStorage.getItem(THEME_KEY) || 'carbon';
}

/**
 * Theme token sets (CSS data-theme values).
 */
export const THEMES = [
  { id: 'carbon', label: 'Carbon', desc: 'Dark desk (default)' },
  { id: 'paper', label: 'Paper', desc: 'Light paper chrome' },
  { id: 'manuscript', label: 'Manuscript', desc: 'Warm sepia ink' },
];
