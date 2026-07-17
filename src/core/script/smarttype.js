/**
 * SmartType — pure suggestion / Tab-slug helpers (Final Draft–style).
 * No DOM. Unit-testable over blocks alone.
 */

export const SCENE_PREFIXES = ['INT.', 'EXT.', 'INT./EXT.', 'I/E.', 'EST.'];

export const TIMES_OF_DAY = [
  'DAY',
  'NIGHT',
  'CONTINUOUS',
  'LATER',
  'MOMENTS LATER',
  'DAWN',
  'DUSK',
  'MORNING',
  'EVENING',
  'SAME',
];

export const TRANSITIONS = [
  'CUT TO:',
  'DISSOLVE TO:',
  'SMASH CUT TO:',
  'MATCH CUT TO:',
  'FADE OUT.',
  'FADE IN:',
  'FADE TO BLACK.',
  'CUT TO BLACK.',
];

/**
 * @param {string} text
 */
export function characterBaseName(text) {
  return String(text || '')
    .replace(/\s*\^?\s*$/, '')
    .replace(/\s*\([^)]*\)\s*$/g, '')
    .trim()
    .toUpperCase();
}

/**
 * Locations harvested from scene headings (unique, order of first appearance).
 * @param {Array<{ type?: string, text?: string }>} blocks
 * @returns {string[]}
 */
export function harvestLocations(blocks) {
  /** @type {string[]} */
  const out = [];
  const seen = new Set();
  for (const b of blocks || []) {
    if (b.type !== 'scene') continue;
    const loc = parseSceneLocation(b.text || '');
    if (!loc) continue;
    const key = loc.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(loc.toUpperCase());
  }
  return out;
}

/**
 * Characters ranked: recency (later in script first) then bible names.
 * @param {Array<{ type?: string, text?: string }>} blocks
 * @param {Array<{ name?: string }>} [bible]
 * @returns {string[]}
 */
export function harvestCharacters(blocks, bible = []) {
  /** @type {Map<string, number>} */
  const score = new Map();
  let i = 0;
  for (const b of blocks || []) {
    i += 1;
    if (b.type !== 'character') continue;
    const name = characterBaseName(b.text);
    if (!name) continue;
    score.set(name, i); // higher = more recent
  }
  for (const c of bible || []) {
    const name = characterBaseName(c.name || '');
    if (!name) continue;
    if (!score.has(name)) score.set(name, 0);
  }
  return Array.from(score.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([n]) => n);
}

/**
 * @param {string} text
 */
export function parseSceneLocation(text) {
  const t = String(text || '').trim();
  if (!t) return '';
  const m = t.match(
    /^(INT\.?\s*\/\s*EXT\.?|EXT\.?\s*\/\s*INT\.?|I\/E\.?|E\/I\.?|INT\.?|EXT\.?|EST\.?)?\s*[.\s]*(.*?)(?:\s+-\s+(.+))?$/i
  );
  if (!m) return t;
  return (m[2] || '').trim().replace(/\s+/g, ' ');
}

/**
 * Scene slug phase for Tab progression.
 * @param {string} text
 * @returns {'empty'|'prefix'|'location'|'time'|'done'}
 */
export function sceneSlugPhase(text) {
  const raw = String(text || '');
  const t = raw.trim();
  if (!t) return 'empty';
  const u = t.toUpperCase();
  // Prefix only (INT. or INT. with trailing space)
  if (/^(INT\.?\/EXT\.?|EXT\.?\/INT\.?|INT\.\/EXT\.|I\/E\.?|E\/I\.?|INT\.?|EXT\.?|EST\.?)\s*$/i.test(u)) {
    return 'prefix';
  }
  // Has " - " / " -" time separator (trim may drop trailing space after dash)
  if (/\s-\s*/.test(u)) {
    const after = (u.split(/\s-\s*/)[1] || '').trim();
    if (!after) return 'time';
    // Full known time → done; partial typing still time phase
    if (TIMES_OF_DAY.includes(after)) return 'done';
    return 'time';
  }
  // Has prefix + location text
  if (/^(INT|EXT|EST|I\/E|E\/I|INT\.\/EXT)/i.test(u)) return 'location';
  return 'location';
}

/**
 * Tab inside a scene heading: empty → INT. · prefix → location gap · location → " - " · time done.
 * @param {string} text
 * @returns {{ text: string, handled: boolean }}
 */
export function sceneTabAdvance(text) {
  const phase = sceneSlugPhase(text);
  const t = String(text || '');
  if (phase === 'empty') {
    return { text: 'INT. ', handled: true };
  }
  if (phase === 'prefix') {
    const prefix = t.trim().toUpperCase().replace(/INT$/i, 'INT.').replace(/EXT$/i, 'EXT.');
    const p = /^(INT\.|EXT\.|EST\.|I\/E\.|INT\.\/EXT\.|EXT\.\/INT\.)/i.test(prefix)
      ? prefix.match(/^(INT\.\/EXT\.|EXT\.\/INT\.|INT\.|EXT\.|EST\.|I\/E\.)/i)[0].toUpperCase()
      : 'INT.';
    return { text: `${p} `, handled: true };
  }
  if (phase === 'location') {
    const base = t.trim().replace(/\s+$/, '');
    if (/\s-\s*$/.test(base)) return { text: base + ' ', handled: true };
    return { text: `${base} - `, handled: true };
  }
  // time or done — leave for element cycle
  return { text: t, handled: false };
}

/**
 * @param {'scene'|'character'|'transition'|string} type
 * @param {string} queryText
 * @param {{
 *   blocks?: Array<{ type?: string, text?: string }>,
 *   characters?: Array<{ name?: string }>,
 *   limit?: number,
 * }} [ctx]
 * @returns {string[]}
 */
export function smarttypeSuggestions(type, queryText, ctx = {}) {
  const q = String(queryText || '').trim().toUpperCase();
  const limit = ctx.limit ?? 8;
  const blocks = ctx.blocks || [];

  if (type === 'character') {
    const names = harvestCharacters(blocks, ctx.characters || []);
    if (!q) return names.slice(0, limit);
    return names.filter((n) => n.includes(q) && n !== q).slice(0, limit);
  }

  if (type === 'transition') {
    const list = TRANSITIONS;
    if (!q) return list.slice(0, limit);
    return list.filter((t) => t.includes(q) && t !== q).slice(0, limit);
  }

  if (type === 'scene') {
    const phase = sceneSlugPhase(queryText);
    if (phase === 'empty' || phase === 'prefix') {
      if (!q) return SCENE_PREFIXES.slice(0, limit);
      return SCENE_PREFIXES.filter((p) => p.startsWith(q) || p.includes(q)).slice(0, limit);
    }
    if (phase === 'location') {
      // text after prefix
      const locPart = extractLocationQuery(queryText);
      const locs = harvestLocations(blocks);
      if (!locPart) return locs.slice(0, limit);
      return locs
        .filter((l) => l.includes(locPart) && l !== locPart)
        .slice(0, limit);
    }
    if (phase === 'time') {
      const timePart = extractTimeQuery(queryText);
      if (!timePart) return TIMES_OF_DAY.slice(0, limit);
      return TIMES_OF_DAY.filter((t) => t.startsWith(timePart) || t.includes(timePart)).slice(
        0,
        limit
      );
    }
  }

  return [];
}

/**
 * Apply a suggestion into current scene text (prefix / location / time aware).
 * @param {string} current
 * @param {string} suggestion
 * @returns {string}
 */
export function applySceneSuggestion(current, suggestion) {
  const phase = sceneSlugPhase(current);
  const sug = String(suggestion || '').trim().toUpperCase();
  const isPrefixSug = SCENE_PREFIXES.some(
    (p) => p === sug || p.startsWith(sug) || sug === p.replace(/\./g, '')
  );
  if (phase === 'empty' || (phase === 'prefix' && isPrefixSug)) {
    const p = sug.endsWith('.') || sug.includes('/') ? sug : `${sug}.`;
    return `${p.replace(/\.\./g, '.')} `;
  }
  if (phase === 'prefix' || phase === 'location') {
    const prefix = extractPrefix(current) || 'INT.';
    return `${prefix} ${sug} `;
  }
  if (phase === 'time' || phase === 'done') {
    // Prefer full known times as time-of-day even if phase misclassified
    if (TIMES_OF_DAY.includes(sug) || phase === 'time' || phase === 'done') {
      const before = String(current || '').replace(/\s-\s*.*$/, '').trim();
      if (/\s-\s*/.test(String(current || '')) || phase === 'time' || phase === 'done') {
        return `${before} - ${sug}`;
      }
    }
    const before = String(current || '').replace(/\s-\s*.*$/, '').trim();
    return `${before} - ${sug}`;
  }
  return sug;
}

function extractPrefix(text) {
  const m = String(text || '')
    .trim()
    .toUpperCase()
    .match(/^(INT\.\/EXT\.|EXT\.\/INT\.|INT\.|EXT\.|EST\.|I\/E\.|E\/I\.)/);
  return m ? m[1] : '';
}

function extractLocationQuery(text) {
  const t = String(text || '').trim().toUpperCase();
  const prefix = extractPrefix(t);
  let rest = t;
  if (prefix) rest = t.slice(prefix.length).trim();
  rest = rest.replace(/\s-\s*.*$/, '').trim();
  return rest;
}

function extractTimeQuery(text) {
  const t = String(text || '').trim().toUpperCase();
  const parts = t.split(/\s-\s/);
  if (parts.length < 2) return '';
  return (parts[1] || '').trim();
}
