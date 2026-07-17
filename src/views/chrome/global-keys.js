/**
 * Global app shortcuts (Ctrl+S, palette, zoom, …).
 * Extracted from app.js.
 */

/**
 * @param {{
 *   commandPalette: { toggle: () => void }|null,
 *   showShortcutsOverlay: () => void,
 *   showLibrary: (show: boolean) => void,
 *   setEditorZoom: (z: number) => void,
 *   getEditorZoom: () => number,
 *   performUndo: () => void,
 *   performRedo: () => void,
 *   saveProject: (saveAs: boolean) => void,
 *   openProject: () => void,
 *   newProject: () => void,
 *   toggleFind: (show: boolean) => void,
 *   exportPdf: () => void,
 *   toggleTheme: () => void,
 *   setBlockType: (id: string, type: string) => void,
 *   setView: (name: string) => void,
 *   getActiveBlockId: () => string|null,
 * }} api
 */
export function createGlobalKeyHandler(api) {
  return function onGlobalKeydown(e) {
    const mod = e.ctrlKey || e.metaKey;
    const tag = (e.target && e.target.tagName) || '';
    const typing =
      !!e.target?.isContentEditable ||
      tag === 'INPUT' ||
      tag === 'TEXTAREA' ||
      tag === 'SELECT';

    if (!mod && e.key === '?' && !typing) {
      e.preventDefault();
      api.showShortcutsOverlay();
      return;
    }

    if (!mod && e.key !== 'F11') return;

    if (mod && !e.shiftKey && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      api.commandPalette?.toggle();
      return;
    }
    if (mod && e.shiftKey && e.key.toLowerCase() === 'l') {
      e.preventDefault();
      api.showLibrary(true);
      return;
    }
    if (mod && (e.key === '=' || e.key === '+')) {
      e.preventDefault();
      api.setEditorZoom(api.getEditorZoom() * 1.1);
      return;
    }
    if (mod && e.key === '-') {
      e.preventDefault();
      api.setEditorZoom(api.getEditorZoom() * 0.9);
      return;
    }
    if (mod && e.key === '0') {
      e.preventDefault();
      api.setEditorZoom(1);
      return;
    }

    if (mod && !e.altKey && e.key.toLowerCase() === 'z' && !e.shiftKey) {
      e.preventDefault();
      api.performUndo();
      return;
    }
    if (mod && !e.altKey && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
      e.preventDefault();
      api.performRedo();
      return;
    }

    if (mod && e.key.toLowerCase() === 's') {
      e.preventDefault();
      api.saveProject(e.shiftKey);
    }
    if (mod && e.key.toLowerCase() === 'o') {
      e.preventDefault();
      api.openProject();
    }
    if (mod && e.key.toLowerCase() === 'n') {
      e.preventDefault();
      api.newProject();
    }
    if (mod && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      api.toggleFind(true);
    }
    if (mod && e.key.toLowerCase() === 'p') {
      e.preventDefault();
      api.exportPdf();
    }
    if (mod && e.key.toLowerCase() === 't' && !e.shiftKey) {
      e.preventDefault();
      api.toggleTheme();
    }
    if (mod && !e.shiftKey && e.key >= '1' && e.key <= '7') {
      const map = ['scene', 'action', 'character', 'parenthetical', 'dialogue', 'transition', 'shot'];
      const active = api.getActiveBlockId();
      if (active) {
        e.preventDefault();
        api.setBlockType(active, map[+e.key - 1]);
      }
    }
    if (mod && e.shiftKey && e.key >= '1' && e.key <= '9') {
      const views = [
        'script',
        'cards',
        'board',
        'timeline',
        'characters',
        'locations',
        'title',
        'notes',
        'search',
      ];
      e.preventDefault();
      api.showLibrary(false);
      api.setView(views[+e.key - 1]);
    }
  };
}
