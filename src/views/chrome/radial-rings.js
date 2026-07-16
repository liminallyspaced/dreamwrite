/**
 * Marking-menu ring payloads — pure, no DOM.
 * ≤8 items per ring (Kurtenbach & Buxton). Contextual by element / view.
 *
 * @see docs/architecture/decisions/0005-marking-menu-and-mmb-collision.md
 * @see docs/plan/01-roadmap.md Phase 2
 */

export const MAX_RING_ITEMS = 8;
export const RADIAL_DEAD_ZONE_PX = 36;
export const MARK_MIN_PX = 48; // expert flick distance before timer
export const PAN_SLOP_PX = 6;
export const RADIAL_HOLD_MS = 140;

/**
 * @typedef {{
 *   id: string,
 *   label: string,
 *   action: 'element'|'snip'|'line'|'focus'|'submenu'|'submenu-back'|'noop',
 *   value?: string,
 *   type?: string,
 *   forceScene?: boolean,
 * }} RadialItem
 */

/** @type {Record<string, RadialItem[]>} */
export const SUBMENUS = {
  timeOfDay: [
    { id: 'dawn', label: 'DAWN', action: 'snip', value: ' - DAWN' },
    { id: 'dusk', label: 'DUSK', action: 'snip', value: ' - DUSK' },
    { id: 'morning', label: 'A.M.', action: 'snip', value: ' - MORNING' },
    { id: 'evening', label: 'P.M.', action: 'snip', value: ' - EVENING' },
    { id: 'later', label: 'LATER', action: 'snip', value: ' - LATER' },
    { id: 'same', label: 'SAME', action: 'snip', value: ' - SAME' },
    { id: 'moments', label: 'MOMENT', action: 'snip', value: ' - MOMENTS LATER' },
    { id: 'back', label: '◂ Back', action: 'submenu-back' },
  ],
  transitions: [
    { id: 'cut', label: 'CUT TO', action: 'line', value: 'CUT TO:', type: 'transition' },
    { id: 'fadeout', label: 'FADE OUT', action: 'line', value: 'FADE OUT.', type: 'transition' },
    { id: 'dissolve', label: 'DISSOLVE', action: 'line', value: 'DISSOLVE TO:', type: 'transition' },
    { id: 'smash', label: 'SMASH', action: 'line', value: 'SMASH CUT TO:', type: 'transition' },
    { id: 'match', label: 'MATCH', action: 'line', value: 'MATCH CUT TO:', type: 'transition' },
    { id: 'intercut', label: 'INTERCUT', action: 'line', value: 'INTERCUT WITH:', type: 'transition' },
    { id: 'back', label: '◂ Back', action: 'submenu-back' },
  ],
  focus: [
    { id: 'desk', label: 'Desk', action: 'focus', value: 'desk' },
    { id: 'paper', label: 'Paper', action: 'focus', value: 'paper' },
    { id: 'type', label: 'Type', action: 'focus', value: 'typewriter' },
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
  if (view === 'cards') return clampRing(boardRing());
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
 * Map pointer angle (atan2 style, 0 = east, CCW) to ring index.
 * Uses same convention as the chrome: angle = atan2(dy,dx) + π/2 so 0 is up.
 *
 * @param {number} dx  clientX - centerX
 * @param {number} dy  clientY - centerY
 * @param {number} n   item count
 * @returns {number} index 0..n-1, or -1 if n < 1
 */
export function angleToIndex(dx, dy, n) {
  if (n < 1) return -1;
  let ang = Math.atan2(dy, dx) + Math.PI / 2;
  if (ang < 0) ang += Math.PI * 2;
  return Math.round((ang / (Math.PI * 2)) * n) % n;
}

/**
 * Expert mark: distance past MARK_MIN from origin → sector index.
 * @returns {number} index or -1 if too short / empty ring
 */
export function markIndexFromVector(dx, dy, n, minPx = MARK_MIN_PX) {
  const dist = Math.hypot(dx, dy);
  if (dist < minPx || n < 1) return -1;
  return angleToIndex(dx, dy, n);
}

/** @param {RadialItem[]} items */
function clampRing(items) {
  if (!Array.isArray(items)) return [];
  if (items.length <= MAX_RING_ITEMS) return items.slice();
  return items.slice(0, MAX_RING_ITEMS);
}

/** @param {string} type */
function scriptRing(type) {
  switch (type) {
    case 'scene':
      return [
        { id: 'int', label: 'INT.', action: 'snip', value: 'INT. ', forceScene: true },
        { id: 'ext', label: 'EXT.', action: 'snip', value: 'EXT. ', forceScene: true },
        { id: 'day', label: 'DAY', action: 'snip', value: ' - DAY' },
        { id: 'night', label: 'NIGHT', action: 'snip', value: ' - NIGHT' },
        { id: 'cont', label: 'CONT.', action: 'snip', value: ' - CONTINUOUS' },
        { id: 'time', label: 'Time ▸', action: 'submenu', value: 'timeOfDay' },
        { id: 'action', label: 'Action', action: 'element', value: 'action' },
        { id: 'char', label: 'Char', action: 'element', value: 'character' },
      ];
    case 'character':
      return [
        { id: 'vo', label: 'V.O.', action: 'line', value: '(V.O.)', type: 'character-suffix' },
        { id: 'os', label: 'O.S.', action: 'line', value: '(O.S.)', type: 'character-suffix' },
        { id: 'oc', label: 'O.C.', action: 'line', value: '(O.C.)', type: 'character-suffix' },
        { id: 'contd', label: "CONT'D", action: 'line', value: "(CONT'D)", type: 'character-suffix' },
        { id: 'dlg', label: 'Dial', action: 'element', value: 'dialogue' },
        { id: 'paren', label: '( )', action: 'element', value: 'parenthetical' },
        { id: 'action', label: 'Action', action: 'element', value: 'action' },
        { id: 'scene', label: 'Scene', action: 'element', value: 'scene' },
      ];
    case 'parenthetical':
      return [
        { id: 'dlg', label: 'Dial', action: 'element', value: 'dialogue' },
        { id: 'char', label: 'Char', action: 'element', value: 'character' },
        { id: 'action', label: 'Action', action: 'element', value: 'action' },
        { id: 'scene', label: 'Scene', action: 'element', value: 'scene' },
        { id: 'trans', label: 'Trans ▸', action: 'submenu', value: 'transitions' },
        { id: 'shot', label: 'Shot', action: 'element', value: 'shot' },
        { id: 'focus', label: 'View ▸', action: 'submenu', value: 'focus' },
        { id: 'note', label: 'Note', action: 'element', value: 'note' },
      ];
    case 'dialogue':
      return [
        { id: 'char', label: 'Char', action: 'element', value: 'character' },
        { id: 'paren', label: '( )', action: 'element', value: 'parenthetical' },
        { id: 'action', label: 'Action', action: 'element', value: 'action' },
        { id: 'scene', label: 'Scene', action: 'element', value: 'scene' },
        { id: 'trans', label: 'Trans ▸', action: 'submenu', value: 'transitions' },
        { id: 'shot', label: 'Shot', action: 'element', value: 'shot' },
        { id: 'focus', label: 'View ▸', action: 'submenu', value: 'focus' },
        { id: 'note', label: 'Note', action: 'element', value: 'note' },
      ];
    case 'transition':
      return [
        { id: 'scene', label: 'Scene', action: 'element', value: 'scene' },
        { id: 'action', label: 'Action', action: 'element', value: 'action' },
        { id: 'char', label: 'Char', action: 'element', value: 'character' },
        { id: 'cut', label: 'CUT TO', action: 'line', value: 'CUT TO:', type: 'transition' },
        { id: 'fade', label: 'FADE OUT', action: 'line', value: 'FADE OUT.', type: 'transition' },
        { id: 'more', label: 'More ▸', action: 'submenu', value: 'transitions' },
        { id: 'focus', label: 'View ▸', action: 'submenu', value: 'focus' },
        { id: 'shot', label: 'Shot', action: 'element', value: 'shot' },
      ];
    case 'shot':
      return [
        { id: 'action', label: 'Action', action: 'element', value: 'action' },
        { id: 'scene', label: 'Scene', action: 'element', value: 'scene' },
        { id: 'char', label: 'Char', action: 'element', value: 'character' },
        { id: 'trans', label: 'Trans ▸', action: 'submenu', value: 'transitions' },
        { id: 'dlg', label: 'Dial', action: 'element', value: 'dialogue' },
        { id: 'focus', label: 'View ▸', action: 'submenu', value: 'focus' },
        { id: 'note', label: 'Note', action: 'element', value: 'note' },
        { id: 'shot', label: 'Shot', action: 'element', value: 'shot' },
      ];
    case 'action':
    case 'general':
    case 'note':
    default:
      return [
        { id: 'scene', label: 'Scene', action: 'element', value: 'scene' },
        { id: 'char', label: 'Char', action: 'element', value: 'character' },
        { id: 'dlg', label: 'Dial', action: 'element', value: 'dialogue' },
        { id: 'trans', label: 'Trans ▸', action: 'submenu', value: 'transitions' },
        { id: 'shot', label: 'Shot', action: 'element', value: 'shot' },
        { id: 'int', label: 'INT.', action: 'snip', value: 'INT. ', forceScene: true },
        { id: 'cut', label: 'CUT TO', action: 'line', value: 'CUT TO:', type: 'transition' },
        { id: 'focus', label: 'View ▸', action: 'submenu', value: 'focus' },
      ];
  }
}

function boardRing() {
  // Board surface not fully built — honest stubs won't mutate prose
  return [
    { id: 'note', label: 'Note', action: 'noop', value: 'card-note' },
    { id: 'scene', label: '→ Scene', action: 'noop', value: 'link-scene' },
    { id: 'col', label: 'Column', action: 'noop', value: 'column' },
    { id: 'arrow', label: 'Arrow', action: 'noop', value: 'arrow' },
    { id: 'focus', label: 'View ▸', action: 'submenu', value: 'focus' },
    { id: 'script', label: 'Script', action: 'noop', value: 'view-script' },
  ];
}

function timelineRing() {
  return [
    { id: 'event', label: 'Event', action: 'noop', value: 'event' },
    { id: 'period', label: 'Period', action: 'noop', value: 'period' },
    { id: 'link', label: '→ Scene', action: 'noop', value: 'link-scene' },
    { id: 'date', label: 'Date', action: 'noop', value: 'set-date' },
    { id: 'fit', label: 'Fit', action: 'noop', value: 'fit' },
    { id: 'focus', label: 'View ▸', action: 'submenu', value: 'focus' },
  ];
}
