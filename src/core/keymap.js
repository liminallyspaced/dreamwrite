/**
 * Single keymap table — shortcuts overlay + palette + bindings.
 * Phase 10.
 */

/**
 * @typedef {{ id: string, keys: string, label: string, group: string, action: string }} KeyBinding
 */

/** @type {KeyBinding[]} */
export const KEYMAP = [
  { id: 'save', keys: 'Ctrl+S', label: 'Save project', group: 'File', action: 'save' },
  { id: 'saveAs', keys: 'Ctrl+Shift+S', label: 'Save as…', group: 'File', action: 'saveAs' },
  { id: 'open', keys: 'Ctrl+O', label: 'Open project', group: 'File', action: 'open' },
  { id: 'new', keys: 'Ctrl+N', label: 'New project', group: 'File', action: 'new' },
  { id: 'exportPdf', keys: 'Ctrl+P', label: 'Export PDF', group: 'File', action: 'exportPdf' },
  { id: 'library', keys: 'Ctrl+Shift+L', label: 'Project library', group: 'File', action: 'library' },
  { id: 'undo', keys: 'Ctrl+Z', label: 'Undo', group: 'Edit', action: 'undo' },
  { id: 'redo', keys: 'Ctrl+Y', label: 'Redo', group: 'Edit', action: 'redo' },
  { id: 'find', keys: 'Ctrl+F', label: 'Find / replace', group: 'Edit', action: 'find' },
  { id: 'palette', keys: 'Ctrl+K', label: 'Command palette', group: 'Navigate', action: 'palette' },
  { id: 'help', keys: '?', label: 'Shortcuts', group: 'Navigate', action: 'shortcuts' },
  // Ctrl+1–7 are element types in the script editor; views use Shift.
  { id: 'script', keys: 'Ctrl+Shift+1', label: 'Script view', group: 'Views', action: 'view:script' },
  { id: 'board', keys: 'Ctrl+Shift+3', label: 'Board view', group: 'Views', action: 'view:board' },
  { id: 'timeline', keys: 'Ctrl+Shift+4', label: 'Timeline view', group: 'Views', action: 'view:timeline' },
  { id: 'focus', keys: 'F11', label: 'Cycle Desk / Paper focus', group: 'View', action: 'focus' },
  { id: 'zoomIn', keys: 'Ctrl+=', label: 'Zoom editor in', group: 'View', action: 'zoomIn' },
  { id: 'zoomOut', keys: 'Ctrl+-', label: 'Zoom editor out', group: 'View', action: 'zoomOut' },
  { id: 'zoomReset', keys: 'Ctrl+0', label: 'Reset editor zoom', group: 'View', action: 'zoomReset' },
];

/**
 * @param {string} query
 * @returns {KeyBinding[]}
 */
export function searchKeymap(query) {
  const q = String(query || '')
    .trim()
    .toLowerCase();
  if (!q) return KEYMAP.slice();
  return KEYMAP.filter(
    (k) =>
      k.label.toLowerCase().includes(q) ||
      k.keys.toLowerCase().includes(q) ||
      k.group.toLowerCase().includes(q) ||
      k.action.toLowerCase().includes(q)
  );
}

/**
 * Group bindings for shortcuts overlay.
 * @returns {Record<string, KeyBinding[]>}
 */
export function keymapByGroup() {
  /** @type {Record<string, KeyBinding[]>} */
  const out = {};
  for (const k of KEYMAP) {
    if (!out[k.group]) out[k.group] = [];
    out[k.group].push(k);
  }
  return out;
}
