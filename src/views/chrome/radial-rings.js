/**
 * Marking-menu ring payloads — pure, no DOM.
 * ≤8 items per ring (Kurtenbach & Buxton). Prefer 5–6 for readability.
 * Contextual by element / view — most-used only; rare options stay on ribbons.
 *
 * @see docs/architecture/decisions/0005-marking-menu-and-mmb-collision.md
 */

export const MAX_RING_ITEMS = 8;
export const RADIAL_DEAD_ZONE_PX = 40;
export const MARK_MIN_PX = 52;
export const PAN_SLOP_PX = 6;
export const RADIAL_HOLD_MS = 140;

/**
 * @typedef {{
 *   id: string,
 *   label: string,
 *   action: 'element'|'snip'|'line'|'focus'|'submenu'|'submenu-back'|'noop'|'board'|'view'|'timeline',
 *   value?: string,
 *   type?: string,
 *   forceScene?: boolean,
 * }} RadialItem
 */

/**
 * Submenus stay ≤8 and include Back. Only high-frequency extras.
 * @type {Record<string, RadialItem[]>}
 */
export const SUBMENUS = {
  timeOfDay: [
    { id: 'dawn', label: 'DAWN', action: 'snip', value: ' - DAWN' },
    { id: 'dusk', label: 'DUSK', action: 'snip', value: ' - DUSK' },
    { id: 'later', label: 'LATER', action: 'snip', value: ' - LATER' },
    { id: 'same', label: 'SAME', action: 'snip', value: ' - SAME' },
    { id: 'cont', label: 'CONT.', action: 'snip', value: ' - CONTINUOUS' },
    { id: 'back', label: '◂ Back', action: 'submenu-back' },
  ],
  transitions: [
    { id: 'cut', label: 'CUT TO', action: 'line', value: 'CUT TO:', type: 'transition' },
    { id: 'fadeout', label: 'FADE OUT', action: 'line', value: 'FADE OUT.', type: 'transition' },
    { id: 'dissolve', label: 'DISSOLVE', action: 'line', value: 'DISSOLVE TO:', type: 'transition' },
    { id: 'smash', label: 'SMASH', action: 'line', value: 'SMASH CUT TO:', type: 'transition' },
    { id: 'back', label: '◂ Back', action: 'submenu-back' },
  ],
};

/**
 * Root ring for the active writing / view context.
 * Always ≤ MAX_RING_ITEMS.
 *
 * @param {{ view?: string, elementType?: string }} ctx
 * @returns {RadialItem[]}
 */
export function ringForContext(ctx = {}) {
  const view = ctx.view || 'script';
  if (view === 'cards' || view === 'board') return clampRing(boardRing());
  if (view === 'timeline') return clampRing(timelineRing());
  return clampRing(scriptRing(ctx.elementType || 'action'));
}

/**
 * Active items: submenu if open, else root for context.
 * @param {{ view?: string, elementType?: string }} ctx
 * @param {string|null} submenuKey
 */
export function activeRingItems(ctx, submenuKey = null) {
  if (submenuKey && SUBMENUS[submenuKey]) {
    return clampRing(SUBMENUS[submenuKey]);
  }
  return ringForContext(ctx);
}

/**
 * Map pointer angle to ring index.
 * 0 = up (atan2(dy,dx) + π/2).
 *
 * @param {number} dx
 * @param {number} dy
 * @param {number} n
 * @returns {number}
 */
export function angleToIndex(dx, dy, n) {
  if (n < 1) return -1;
  let ang = Math.atan2(dy, dx) + Math.PI / 2;
  if (ang < 0) ang += Math.PI * 2;
  return Math.round((ang / (Math.PI * 2)) * n) % n;
}

/**
 * Expert mark: distance past MARK_MIN → sector index.
 * @returns {number}
 */
export function markIndexFromVector(dx, dy, n, minPx = MARK_MIN_PX) {
  const dist = Math.hypot(dx, dy);
  if (dist < minPx || n < 1) return -1;
  return angleToIndex(dx, dy, n);
}

/**
 * Orbit radius for n items — wider when fuller so wedges don't bunch.
 * @param {number} n
 */
export function ringRadiusForCount(n) {
  if (n <= 4) return 108;
  if (n <= 6) return 132;
  return 152;
}

/** @param {RadialItem[]} items */
function clampRing(items) {
  if (!Array.isArray(items)) return [];
  if (items.length <= MAX_RING_ITEMS) return items.slice();
  return items.slice(0, MAX_RING_ITEMS);
}

/**
 * Script rings: writing flow only. No View/Focus (already on top chrome).
 * Target 5–7 items so MMB sectors stay wide.
 * @param {string} type
 */
function scriptRing(type) {
  switch (type) {
    case 'scene':
      // Scene heading: location type + time + leave for action/dialogue
      return [
        { id: 'int', label: 'INT.', action: 'snip', value: 'INT. ', forceScene: true },
        { id: 'ext', label: 'EXT.', action: 'snip', value: 'EXT. ', forceScene: true },
        { id: 'day', label: 'DAY', action: 'snip', value: ' - DAY' },
        { id: 'night', label: 'NIGHT', action: 'snip', value: ' - NIGHT' },
        { id: 'time', label: 'Time ▸', action: 'submenu', value: 'timeOfDay' },
        { id: 'action', label: 'Action', action: 'element', value: 'action' },
      ];
    case 'character':
      return [
        { id: 'vo', label: 'V.O.', action: 'line', value: '(V.O.)', type: 'character-suffix' },
        { id: 'os', label: 'O.S.', action: 'line', value: '(O.S.)', type: 'character-suffix' },
        { id: 'contd', label: "CONT'D", action: 'line', value: "(CONT'D)", type: 'character-suffix' },
        { id: 'dlg', label: 'Dial', action: 'element', value: 'dialogue' },
        { id: 'paren', label: '( )', action: 'element', value: 'parenthetical' },
        { id: 'action', label: 'Action', action: 'element', value: 'action' },
      ];
    case 'parenthetical':
      return [
        { id: 'dlg', label: 'Dial', action: 'element', value: 'dialogue' },
        { id: 'char', label: 'Char', action: 'element', value: 'character' },
        { id: 'action', label: 'Action', action: 'element', value: 'action' },
        { id: 'scene', label: 'Scene', action: 'element', value: 'scene' },
      ];
    case 'dialogue':
      return [
        { id: 'char', label: 'Char', action: 'element', value: 'character' },
        { id: 'paren', label: '( )', action: 'element', value: 'parenthetical' },
        { id: 'action', label: 'Action', action: 'element', value: 'action' },
        { id: 'scene', label: 'Scene', action: 'element', value: 'scene' },
        { id: 'cut', label: 'CUT TO', action: 'line', value: 'CUT TO:', type: 'transition' },
        { id: 'trans', label: 'Trans ▸', action: 'submenu', value: 'transitions' },
      ];
    case 'transition':
      return [
        { id: 'scene', label: 'Scene', action: 'element', value: 'scene' },
        { id: 'action', label: 'Action', action: 'element', value: 'action' },
        { id: 'cut', label: 'CUT TO', action: 'line', value: 'CUT TO:', type: 'transition' },
        { id: 'fade', label: 'FADE OUT', action: 'line', value: 'FADE OUT.', type: 'transition' },
        { id: 'more', label: 'More ▸', action: 'submenu', value: 'transitions' },
      ];
    case 'shot':
      return [
        { id: 'action', label: 'Action', action: 'element', value: 'action' },
        { id: 'scene', label: 'Scene', action: 'element', value: 'scene' },
        { id: 'char', label: 'Char', action: 'element', value: 'character' },
        { id: 'dlg', label: 'Dial', action: 'element', value: 'dialogue' },
        { id: 'cut', label: 'CUT TO', action: 'line', value: 'CUT TO:', type: 'transition' },
      ];
    case 'action':
    case 'general':
    case 'note':
    default:
      // Default writing surface — highest frequency cycle
      return [
        { id: 'scene', label: 'Scene', action: 'element', value: 'scene' },
        { id: 'char', label: 'Char', action: 'element', value: 'character' },
        { id: 'dlg', label: 'Dial', action: 'element', value: 'dialogue' },
        { id: 'int', label: 'INT.', action: 'snip', value: 'INT. ', forceScene: true },
        { id: 'cut', label: 'CUT TO', action: 'line', value: 'CUT TO:', type: 'transition' },
        { id: 'trans', label: 'Trans ▸', action: 'submenu', value: 'transitions' },
      ];
  }
}

function boardRing() {
  return [
    { id: 'note', label: 'Note', action: 'board', value: 'note' },
    { id: 'image', label: 'Image', action: 'board', value: 'image' },
    { id: 'table', label: 'Table', action: 'board', value: 'table' },
    { id: 'sync', label: 'Scenes', action: 'board', value: 'sync' },
    { id: 'script', label: 'Script', action: 'view', value: 'script' },
    { id: 'tl', label: 'Time', action: 'view', value: 'timeline' },
  ];
}

function timelineRing() {
  return [
    { id: 'add', label: 'Event', action: 'timeline', value: 'add' },
    { id: 'sync', label: 'Scenes', action: 'timeline', value: 'sync' },
    { id: 'fit', label: 'Fit', action: 'timeline', value: 'fit' },
    { id: 'script', label: 'Script', action: 'view', value: 'script' },
    { id: 'board', label: 'Board', action: 'view', value: 'board' },
  ];
}
