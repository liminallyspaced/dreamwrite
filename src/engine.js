/**
 * Platen screenplay engine
 * Industry-standard US film format (Final Draft / WGA defaults)
 * + Fountain I/O + stats + PDF + lint
 *
 * Spec (US Letter, Courier 12pt):
 *   Left 1.5" · Right 1" · Top 1" · Bottom 1"
 *   54 lines/page (FD KB: 9" × 6 lpi) · ~1 page ≈ 1 screen minute
 * Elements: Scene Heading, Action, Character, Parenthetical, Dialogue, Transition, Shot
 *
 * Pagination: core/script/paginate.js (ADR-0006) — one engine, three consumers.
 */

import { paginate, pageCount } from './core/script/paginate.js';
import { DEFAULT_FORMAT as PAGE_FORMAT } from './core/script/format.js';
import {
  pageTypewriterJitter,
  jitterSeedFromKey,
} from './core/script/typewriter-jitter.js';
import { COURIER_PRIME_REGULAR_BASE64 } from './core/script/courier-prime-regular.js';

const ELEMENTS = ['scene', 'action', 'character', 'parenthetical', 'dialogue', 'transition', 'shot', 'general', 'note'];

/** Canonical industry layout (inches from page edge) */
const FORMAT = {
  page: 'letter',
  font: 'Courier Prime',
  fontSizePt: 12,
  marginLeftIn: 1.5,
  marginRightIn: 1.0,
  marginTopIn: 1.0,
  marginBottomIn: 1.0,
  // Indents measured from LEFT EDGE of page (industry standard)
  indent: {
    scene: 1.5, // left margin
    action: 1.5,
    character: 3.7, // ~2.2" from left margin content start → 3.7 from edge
    parenthetical: 3.1,
    dialogue: 2.5,
    dialogueWidth: 3.5,
    parentheticalWidth: 2.0,
    transition: 'right', // right-aligned in right margin area
  },
  /** 54 — Final Draft KB (9" × 6 lpi). Was wrongly 55. */
  linesPerPage: 54,
  minutesPerPage: 1,
  maxCharacterCueLen: 38,
  timesOfDay: ['DAY', 'NIGHT', 'DAWN', 'DUSK', 'MORNING', 'EVENING', 'AFTERNOON', 'CONTINUOUS', 'LATER', 'SAME', 'MOMENTS LATER'],
  intExt: ['INT.', 'EXT.', 'I/E.', 'E/I.', 'EST.', 'INT./EXT.', 'EXT./INT.'],
  extensions: ['V.O.', 'O.S.', 'O.C.', "CONT'D", 'CONT’D'],
};

const ELEMENT_LABELS = {
  scene: 'Scene Heading',
  action: 'Action',
  character: 'Character',
  parenthetical: 'Parenthetical',
  dialogue: 'Dialogue',
  transition: 'Transition',
  shot: 'Shot',
  general: 'General',
  note: 'Note',
};

/** Tab cycle order (WriterDuet / Final Draft style) */
const TAB_CYCLE = {
  scene: 'action',
  action: 'character',
  character: 'dialogue',
  parenthetical: 'dialogue',
  dialogue: 'parenthetical',
  transition: 'scene',
  shot: 'action',
  general: 'action',
  note: 'action',
};

/** Enter next-element defaults */
const ENTER_NEXT = {
  scene: 'action',
  action: 'action',
  character: 'dialogue',
  parenthetical: 'dialogue',
  dialogue: 'character',
  transition: 'scene',
  shot: 'action',
  general: 'action',
  note: 'action',
};

function uid() {
  return `b_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function emptyProject(title = 'Untitled Screenplay') {
  return {
    version: 1,
    format: 'platen',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    titlePage: {
      title,
      writtenBy: '',
      contact: '',
      basedOn: '',
      draftDate: new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
    },
    blocks: [
      { id: uid(), type: 'scene', text: 'INT. LOCATION - DAY' },
      { id: uid(), type: 'action', text: '' },
    ],
    characters: [],
    locations: [],
    cards: [],
    notes: '',
    settings: {
      theme: 'dark',
      pageTarget: null,
    },
    history: [],
  };
}

function createBlock(type = 'action', text = '') {
  return { id: uid(), type, text };
}

function normalizeType(type) {
  const t = String(type || 'action').toLowerCase();
  return ELEMENTS.includes(t) ? t : 'action';
}

/* ---------- Fountain export ---------- */

function toFountain(project) {
  const lines = [];
  const tp = project.titlePage || {};
  if (tp.title) lines.push(`Title: ${tp.title}`);
  if (tp.writtenBy) lines.push(`Author: ${tp.writtenBy}`);
  if (tp.draftDate) lines.push(`Draft date: ${tp.draftDate}`);
  if (tp.contact) lines.push(`Contact: ${tp.contact}`);
  if (tp.basedOn) lines.push(`Source: ${tp.basedOn}`);
  lines.push('');
  lines.push('===');
  lines.push('');

  for (const block of project.blocks || []) {
    const text = (block.text || '').replace(/\r\n/g, '\n');
    switch (block.type) {
      case 'scene':
        lines.push(text.toUpperCase());
        lines.push('');
        break;
      case 'action':
      case 'general':
        lines.push(text);
        lines.push('');
        break;
      case 'character': {
        // Fountain dual: second column marked with caret after the name
        let cue = text.toUpperCase().replace(/\s*\^\s*$/, '').trim();
        if (block.dual) cue = `${cue}^`;
        lines.push(cue);
        break;
      }
      case 'parenthetical': {
        let p = text.trim();
        if (!p.startsWith('(')) p = `(${p}`;
        if (!p.endsWith(')')) p = `${p})`;
        lines.push(p);
        break;
      }
      case 'dialogue':
        lines.push(text);
        lines.push('');
        break;
      case 'transition': {
        let t = text.trim().toUpperCase();
        if (t && !t.endsWith(':') && !t.endsWith('.')) t = `${t}:`;
        lines.push(t);
        lines.push('');
        break;
      }
      case 'shot':
        lines.push(text.toUpperCase());
        lines.push('');
        break;
      case 'note':
        lines.push(`[[${text}]]`);
        lines.push('');
        break;
      default:
        lines.push(text);
        lines.push('');
    }
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n');
}

/* ---------- Fountain import ---------- */

function looksLikeScene(line) {
  const u = line.trim().toUpperCase();
  if (!u) return false;
  if (/^(INT|EXT|EST|I\/E|E\/I)[\.\s]/i.test(u)) return true;
  if (/\s-\s(DAY|NIGHT|DAWN|DUSK|MORNING|EVENING|LATER|CONTINUOUS|SAME)/i.test(u) && u === line.trim().toUpperCase()) {
    return true;
  }
  return false;
}

function looksLikeTransition(line) {
  const u = line.trim().toUpperCase();
  return (
    /^(CUT TO:|FADE OUT\.|FADE IN:|DISSOLVE TO:|SMASH CUT TO:|MATCH CUT TO:|JUMP CUT TO:|FADE TO BLACK\.|CUT TO BLACK\.)$/i.test(
      u
    ) || (/TO:$/.test(u) && u === line.trim().toUpperCase() && u.length < 40)
  );
}

function looksLikeCharacter(line) {
  // Allow trailing dual caret for Fountain dual dialogue
  const t = line.trim().replace(/\s*\^\s*$/, '');
  if (!t || t.length > 40) return false;
  if (t !== t.toUpperCase()) return false;
  if (looksLikeScene(t) || looksLikeTransition(t)) return false;
  if (/^[A-Z0-9][A-Z0-9 \.\-']+(\s*\([^)]+\))?$/.test(t)) return true;
  return false;
}

function looksLikeParenthetical(line) {
  const t = line.trim();
  return /^\(.*\)$/.test(t);
}

function parseTitlePage(lines) {
  const meta = {};
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '===') {
      i += 1;
      break;
    }
    const m = line.match(/^([^:]+):\s*(.*)$/);
    if (m) {
      const key = m[1].trim().toLowerCase();
      const val = m[2].trim();
      if (key === 'title') meta.title = val;
      else if (key === 'author' || key === 'authors' || key === 'written by') meta.writtenBy = val;
      else if (key === 'draft date' || key === 'date') meta.draftDate = val;
      else if (key === 'contact') meta.contact = val;
      else if (key === 'source' || key === 'based on') meta.basedOn = val;
      i += 1;
    } else if (!line.trim()) {
      // blank after title page keys ends title page if we already have keys
      if (Object.keys(meta).length) {
        i += 1;
        break;
      }
      i += 1;
    } else {
      break;
    }
  }
  return { meta, start: i };
}

function fromFountain(text, baseTitle = 'Imported Script') {
  const project = emptyProject(baseTitle);
  const raw = String(text || '').replace(/\r\n/g, '\n');
  const lines = raw.split('\n');
  const { meta, start } = parseTitlePage(lines);
  if (meta.title) project.titlePage.title = meta.title;
  if (meta.writtenBy) project.titlePage.writtenBy = meta.writtenBy;
  if (meta.draftDate) project.titlePage.draftDate = meta.draftDate;
  if (meta.contact) project.titlePage.contact = meta.contact;
  if (meta.basedOn) project.titlePage.basedOn = meta.basedOn;

  const blocks = [];
  let i = start;
  let lastType = null;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    // Boneyard /* */
    if (trimmed.startsWith('/*')) {
      while (i < lines.length && !lines[i].includes('*/')) i += 1;
      i += 1;
      continue;
    }

    // Notes [[ ]]
    if (trimmed.startsWith('[[') && trimmed.endsWith(']]')) {
      i += 1;
      continue;
    }

    // Section / synopsis
    if (trimmed.startsWith('#') || trimmed.startsWith('=')) {
      i += 1;
      continue;
    }

    if (looksLikeScene(trimmed)) {
      blocks.push(createBlock('scene', trimmed.toUpperCase()));
      lastType = 'scene';
      i += 1;
      continue;
    }

    if (looksLikeTransition(trimmed)) {
      blocks.push(createBlock('transition', trimmed.toUpperCase()));
      lastType = 'transition';
      i += 1;
      continue;
    }

    if (looksLikeCharacter(trimmed) && !trimmed.startsWith('!')) {
      let cue = trimmed.toUpperCase();
      let dual = false;
      // Fountain dual dialogue: CHARACTER^ or CHARACTER ^
      if (/\^\s*$/.test(cue) || /\s+\^\s*$/.test(cue)) {
        dual = true;
        cue = cue.replace(/\s*\^\s*$/, '').trim();
      }
      const ch = createBlock('character', cue);
      if (dual) ch.dual = true;
      blocks.push(ch);
      lastType = 'character';
      i += 1;
      // absorb following parentheticals / dialogue
      while (i < lines.length) {
        const n = lines[i].trim();
        if (!n) {
          i += 1;
          break;
        }
        if (looksLikeScene(n) || looksLikeCharacter(n) || looksLikeTransition(n)) break;
        if (looksLikeParenthetical(n)) {
          blocks.push(createBlock('parenthetical', n.replace(/^\(|\)$/g, '')));
          lastType = 'parenthetical';
          i += 1;
          continue;
        }
        // dialogue may be multi-line until blank
        const dlg = [];
        while (i < lines.length && lines[i].trim()) {
          const d = lines[i].trim();
          if (looksLikeScene(d) || looksLikeCharacter(d) || looksLikeTransition(d)) break;
          if (looksLikeParenthetical(d)) break;
          dlg.push(d);
          i += 1;
        }
        if (dlg.length) {
          blocks.push(createBlock('dialogue', dlg.join('\n')));
          lastType = 'dialogue';
        }
      }
      continue;
    }

    if (looksLikeParenthetical(trimmed)) {
      blocks.push(createBlock('parenthetical', trimmed.replace(/^\(|\)$/g, '')));
      lastType = 'parenthetical';
      i += 1;
      continue;
    }

    // Force action with !
    if (trimmed.startsWith('!')) {
      blocks.push(createBlock('action', trimmed.slice(1).trimStart()));
      lastType = 'action';
      i += 1;
      continue;
    }

    // Multi-line action until blank
    const action = [trimmed];
    i += 1;
    while (i < lines.length && lines[i].trim()) {
      const n = lines[i].trim();
      if (looksLikeScene(n) || looksLikeCharacter(n) || looksLikeTransition(n)) break;
      action.push(n);
      i += 1;
    }
    blocks.push(createBlock(lastType === 'character' || lastType === 'parenthetical' ? 'dialogue' : 'action', action.join('\n')));
    lastType = 'action';
  }

  project.blocks = blocks.length ? blocks : emptyProject().blocks;
  project.characters = extractCharacters(project);
  project.locations = extractLocations(project);
  project.cards = autoCardsFromScenes(project);
  return project;
}

/* ---------- Extraction helpers ---------- */

function extractCharacters(project) {
  const map = new Map();
  for (const c of project.characters || []) {
    if (c.name) map.set(c.name.toUpperCase(), { ...c });
  }
  for (const b of project.blocks || []) {
    if (b.type !== 'character') continue;
    const name = (b.text || '').replace(/\s*\(.*\)\s*$/, '').trim().toUpperCase();
    if (!name) continue;
    if (!map.has(name)) {
      map.set(name, {
        id: uid(),
        name,
        role: '',
        description: '',
        notes: '',
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function extractLocations(project) {
  const map = new Map();
  for (const l of project.locations || []) {
    if (l.name) map.set(l.name.toUpperCase(), { ...l });
  }
  for (const b of project.blocks || []) {
    if (b.type !== 'scene') continue;
    const parsed = parseSceneHeading(b.text || '');
    if (!parsed.location) continue;
    const key = parsed.location.toUpperCase();
    if (!map.has(key)) {
      map.set(key, {
        id: uid(),
        name: parsed.location,
        intExt: parsed.intExt,
        times: parsed.time ? [parsed.time] : [],
        notes: '',
      });
    } else if (parsed.time) {
      const loc = map.get(key);
      if (!loc.times.includes(parsed.time)) loc.times.push(parsed.time);
    }
  }
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function parseSceneHeading(text) {
  const t = (text || '').trim();
  const m = t.match(/^(INT\.?\s*\/\s*EXT\.?|EXT\.?\s*\/\s*INT\.?|I\/E\.?|E\/I\.?|INT\.?|EXT\.?|EST\.?)?\s*[.\s]*(.*?)(?:\s+-\s+(.+))?$/i);
  if (!m) return { intExt: '', location: t, time: '' };
  let intExt = (m[1] || '').toUpperCase().replace(/\s+/g, '');
  // normalize punctuation
  if (intExt === 'INT') intExt = 'INT.';
  if (intExt === 'EXT') intExt = 'EXT.';
  if (intExt === 'EST') intExt = 'EST.';
  if (intExt === 'I/E') intExt = 'I/E.';
  if (intExt === 'E/I') intExt = 'E/I.';
  if (intExt === 'INT./EXT' || intExt === 'INT/EXT' || intExt === 'INT./EXT.') intExt = 'INT./EXT.';
  if (intExt === 'EXT./INT' || intExt === 'EXT/INT' || intExt === 'EXT./INT.') intExt = 'EXT./INT.';
  if (intExt && !intExt.endsWith('.') && !intExt.includes('/')) intExt = `${intExt}.`;
  return {
    intExt,
    location: (m[2] || '').trim().replace(/\s+/g, ' '),
    time: (m[3] || '').trim().toUpperCase(),
  };
}

/**
 * Normalize a single block to industry conventions (mutates copy, returns new text/type).
 */
function normalizeBlock(block) {
  if (!block) return block;
  const type = normalizeType(block.type === 'note' ? 'note' : block.type);
  let text = String(block.text || '').replace(/\r\n/g, '\n').replace(/\u00a0/g, ' ');

  switch (type) {
    case 'scene': {
      text = text.toUpperCase().replace(/\s+/g, ' ').trim();
      // fix "INT LOCATION" → "INT. LOCATION"
      text = text.replace(/^(INT|EXT|EST)\s+(?!\.)/i, '$1. ');
      text = text.replace(/^(I\/E|E\/I)\s+(?!\.)/i, '$1. ');
      // prefer " - " before time of day
      text = text.replace(/\s*[–—-]\s*/g, ' - ');
      const p = parseSceneHeading(text);
      if (p.intExt || p.location) {
        const parts = [];
        if (p.intExt) parts.push(p.intExt);
        if (p.location) parts.push(p.location.toUpperCase());
        text = parts.join(' ');
        if (p.time) text = `${text} - ${p.time}`;
      }
      break;
    }
    case 'character': {
      text = text.toUpperCase().replace(/\s+/g, ' ').trim();
      // normalize extensions: (VO) → (V.O.)
      text = text
        .replace(/\(\s*V\s*\.?\s*O\s*\.?\s*\)/gi, '(V.O.)')
        .replace(/\(\s*O\s*\.?\s*S\s*\.?\s*\)/gi, '(O.S.)')
        .replace(/\(\s*O\s*\.?\s*C\s*\.?\s*\)/gi, '(O.C.)')
        .replace(/\(\s*CONT'?D\s*\)/gi, "(CONT'D)");
      break;
    }
    case 'parenthetical': {
      text = text.trim();
      // strip wrapping parens for storage; UI/PDF re-add
      text = text.replace(/^\(+/, '').replace(/\)+$/, '').trim();
      break;
    }
    case 'transition': {
      text = text.toUpperCase().replace(/\s+/g, ' ').trim();
      // FADE OUT. keeps period; most others end with :
      if (text && !/[.:]$/.test(text)) {
        if (/FADE OUT|CUT TO BLACK|FADE TO BLACK|BLACKOUT/i.test(text)) text = `${text}.`;
        else text = `${text}:`;
      }
      break;
    }
    case 'shot': {
      text = text.toUpperCase().replace(/\s+/g, ' ').trim();
      break;
    }
    case 'action':
    case 'general': {
      // Action is present-tense description; keep author casing but collapse wild whitespace
      text = text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
      break;
    }
    case 'dialogue': {
      text = text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
      break;
    }
    case 'note': {
      text = text.replace(/^\[\[/, '').replace(/\]\]$/, '').trim();
      break;
    }
    default:
      break;
  }

  return { ...block, type, text };
}

function characterBaseName(text) {
  return String(text || '')
    .replace(/\s*\([^)]*\)\s*$/g, '')
    .trim()
    .toUpperCase();
}

/**
 * If the same speaker returns after action/scene (not another character),
 * industry form often uses (CONT'D) on the character cue.
 */
function applyContd(blocks) {
  const out = (blocks || []).map((b) => ({ ...b }));
  let lastSpeaker = null;
  let interrupted = false;
  for (let i = 0; i < out.length; i++) {
    const b = out[i];
    if (b.type === 'character') {
      const name = characterBaseName(b.text);
      const hasContd = /\(CONT'?D\)/i.test(b.text || '');
      if (lastSpeaker && name === lastSpeaker && interrupted && name) {
        if (!hasContd) {
          const base = characterBaseName(b.text);
          const ext = (b.text || '').match(/\((V\.O\.|O\.S\.|O\.C\.)\)/i);
          b.text = ext ? `${base} (CONT'D) ${ext[0]}` : `${base} (CONT'D)`;
          b.text = b.text.replace(/\s+/g, ' ').trim();
        }
      } else if (hasContd && (!lastSpeaker || name !== lastSpeaker || !interrupted)) {
        // strip spurious CONT'D
        b.text = (b.text || '').replace(/\s*\(CONT'?D\)\s*/gi, ' ').replace(/\s+/g, ' ').trim();
      }
      lastSpeaker = name;
      interrupted = false;
    } else if (b.type === 'dialogue' || b.type === 'parenthetical') {
      // still same speech block
    } else if (b.type === 'scene') {
      lastSpeaker = null;
      interrupted = false;
    } else if (b.type === 'action' || b.type === 'shot' || b.type === 'general' || b.type === 'transition') {
      if (lastSpeaker) interrupted = true;
    }
  }
  return out;
}

/**
 * Lint against common format / craft rules. Returns { ok, issues[] }.
 */
function lintScript(project) {
  const issues = [];
  const blocks = project.blocks || [];
  let prev = null;
  let sceneCount = 0;

  blocks.forEach((b, i) => {
    const t = (b.text || '').trim();
    const n = i + 1;

    if (b.type === 'scene') {
      sceneCount += 1;
      const p = parseSceneHeading(t);
      if (!p.intExt) {
        issues.push({ level: 'warn', line: n, msg: 'Scene heading should start with INT./EXT./I/E./EST.' });
      }
      if (!p.location || /^LOCATION$/i.test(p.location)) {
        issues.push({ level: 'warn', line: n, msg: 'Scene heading needs a specific location' });
      }
      if (!p.time) {
        issues.push({ level: 'info', line: n, msg: 'Scene heading missing time of day (DAY/NIGHT/…)' });
      }
    }

    if (b.type === 'character') {
      if (!t) issues.push({ level: 'warn', line: n, msg: 'Empty character cue' });
      if (t.length > FORMAT.maxCharacterCueLen) {
        issues.push({ level: 'info', line: n, msg: 'Character cue is long — keep names short' });
      }
      if (prev && prev.type === 'character') {
        issues.push({ level: 'warn', line: n, msg: 'Two character cues in a row (missing dialogue?)' });
      }
    }

    if (b.type === 'dialogue') {
      if (!prev || (prev.type !== 'character' && prev.type !== 'parenthetical' && prev.type !== 'dialogue')) {
        issues.push({ level: 'warn', line: n, msg: 'Dialogue should follow a character cue' });
      }
      if (!t) issues.push({ level: 'info', line: n, msg: 'Empty dialogue' });
    }

    if (b.type === 'parenthetical') {
      if (!prev || (prev.type !== 'character' && prev.type !== 'dialogue' && prev.type !== 'parenthetical')) {
        issues.push({ level: 'warn', line: n, msg: 'Parenthetical should sit under a character / dialogue' });
      }
    }

    if (b.type === 'action' && t) {
      // light craft: past tense heuristic
      if (/\b(walked|said|looked|went|ran|opened|closed)\b/i.test(t) && !/\b(is|are|walks|says|looks|goes|runs|opens|closes)\b/i.test(t)) {
        issues.push({ level: 'info', line: n, msg: 'Action is usually present tense (walks, not walked)' });
      }
    }

    if (b.type === 'transition' && t && !/:$|\.$/.test(t)) {
      issues.push({ level: 'info', line: n, msg: 'Transitions usually end with : or .' });
    }

    prev = b;
  });

  if (!sceneCount) {
    issues.push({ level: 'warn', line: 0, msg: 'Script has no scene headings' });
  }

  const errors = issues.filter((x) => x.level === 'warn').length;
  return { ok: errors === 0, issues, sceneCount };
}

/** Normalize every block + optional CONT'D pass */
function normalizeProject(project, { contd = true } = {}) {
  const p = { ...project };
  p.blocks = (project.blocks || []).map((b) => normalizeBlock(b));
  if (contd) p.blocks = applyContd(p.blocks);
  p.updatedAt = new Date().toISOString();
  return p;
}

/**
 * Build a fresh card per scene. Only safe on an EMPTY board — it has no idea what
 * the user may have written. To refresh an existing board use syncCardsFromScenes.
 */
function autoCardsFromScenes(project) {
  const cards = [];
  let sceneIndex = 0;
  for (const b of project.blocks || []) {
    if (b.type !== 'scene') continue;
    sceneIndex += 1;
    cards.push({
      id: uid(),
      sceneId: b.id,
      number: sceneIndex,
      title: b.text || `Scene ${sceneIndex}`,
      summary: '',
      color: cardColor(sceneIndex),
      beat: '',
    });
  }
  return cards;
}

/**
 * Reconcile the beat board against the script, PRESERVING what the writer wrote.
 *
 * Replaces the old behaviour, where "Sync from scenes" called autoCardsFromScenes
 * and assigned the result straight over project.cards — destroying every
 * hand-written summary and beat, with no merge and no confirmation
 * (docs/plan/00-findings.md §5.5 #4).
 *
 * Rules, in priority order:
 *  1. NEVER silently delete the writer's prose. A card whose scene has gone is
 *     kept and marked `orphaned`, not dropped — the scene may have been cut by
 *     accident, or renamed, and the summary is often the more valuable half.
 *  2. Match on sceneId. Title and number are derived from the script (the script
 *     is the source of truth for those); summary, beat and colour are the user's
 *     and are left alone.
 *  3. Order follows the script.
 *
 * @returns {{ cards: object[], added: number, updated: number, orphaned: number }}
 */
function syncCardsFromScenes(project) {
  const existing = Array.isArray(project.cards) ? project.cards : [];
  const bySceneId = new Map();
  for (const card of existing) {
    if (card && card.sceneId) bySceneId.set(card.sceneId, card);
  }

  const cards = [];
  const matched = new Set();
  let sceneIndex = 0;
  let added = 0;
  let updated = 0;

  for (const b of project.blocks || []) {
    if (b.type !== 'scene') continue;
    sceneIndex += 1;

    const prior = bySceneId.get(b.id);
    if (prior) {
      matched.add(prior.id);
      updated += 1;
      cards.push({
        ...prior, // summary / beat / colour / anything else the user set: untouched
        sceneId: b.id,
        number: sceneIndex,
        title: b.text || `Scene ${sceneIndex}`,
        orphaned: false,
      });
    } else {
      added += 1;
      cards.push({
        id: uid(),
        sceneId: b.id,
        number: sceneIndex,
        title: b.text || `Scene ${sceneIndex}`,
        summary: '',
        color: cardColor(sceneIndex),
        beat: '',
        orphaned: false,
      });
    }
  }

  // Anything left over: keep it. Losing a scene must not lose the writing about it.
  let orphaned = 0;
  for (const card of existing) {
    if (matched.has(card.id)) continue;
    const hasContent = (card.summary || '').trim() || (card.beat || '').trim();
    // A pristine auto-generated card for a deleted scene carries nothing worth
    // keeping — drop those. Only preserve what the writer actually typed.
    if (!hasContent && card.sceneId) continue;
    orphaned += 1;
    cards.push({ ...card, orphaned: !!card.sceneId });
  }

  return { cards, added, updated, orphaned };
}

function cardColor(n) {
  const palette = ['#111111', '#2a2a2a', '#444444', '#5a5a5a', '#1a1a1a', '#333333', '#4a4a4a', '#000000'];
  return palette[(n - 1) % palette.length];
}

/* ---------- Stats & pagination estimate ---------- */

function countWords(text) {
  return (text || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function computeStats(project) {
  const blocks = project.blocks || [];
  let words = 0;
  let dialogueWords = 0;
  let actionWords = 0;
  let scenes = 0;
  const chars = new Set();

  for (const b of blocks) {
    const w = countWords(b.text);
    words += w;
    if (b.type === 'scene') scenes += 1;
    if (b.type === 'dialogue') dialogueWords += w;
    if (b.type === 'action' || b.type === 'general') actionWords += w;
    if (b.type === 'character') {
      const name = (b.text || '').replace(/\s*\(.*\)\s*$/, '').trim().toUpperCase();
      if (name) chars.add(name);
    }
  }

  // ADR-0006: same engine as screen + PDF
  const pages = pageCount(blocks);
  const runtimeMin = Math.max(blocks.length ? 1 : 0, pages);

  return {
    words,
    dialogueWords,
    actionWords,
    scenes,
    characters: chars.size,
    pages,
    runtimeMin,
    dialoguePct: words ? Math.round((dialogueWords / words) * 100) : 0,
  };
}

/**
 * @deprecated Use pageCount / paginate from core/script. Kept as a thin alias
 * so older call sites keep working; returns integer page count (not the old
 * char-count fraction).
 */
function estimatePages(blocks) {
  return pageCount(blocks || []);
}

function charsPerLine(type) {
  // Courier 12 ≈ 10 cpi; widths from industry columns (pagination.md §3)
  switch (type) {
    case 'dialogue':
      return 35; // ~3.5" — CORRECT; do not "fix" to 30
    case 'parenthetical':
      return 29;
    case 'character':
      return 38;
    case 'transition':
      return 15;
    case 'scene':
    case 'action':
    case 'general':
    case 'shot':
      return 60; // ~6" action column
    default:
      return 60;
  }
}

/* ---------- PDF HTML ---------- */

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * PDF HTML from the same Page[] as stats/screen (ADR-0006).
 * Embeds Courier Prime (base64) — data: print origin cannot load ../assets/fonts/.
 */
function toPdfHtml(project) {
  const tp = project.titlePage || {};
  const pages = paginate(project.blocks || []);
  const fontFace = `@font-face {
    font-family: "Courier Prime";
    src: url(data:font/truetype;base64,${COURIER_PRIME_REGULAR_BASE64}) format("truetype");
    font-weight: 400;
    font-style: normal;
  }`;

  const titlePage = `
    <div class="sheet title-page">
      <div class="tp-title">${escapeHtml(tp.title || 'Untitled')}</div>
      <div class="tp-by">Written by</div>
      <div class="tp-author">${escapeHtml(tp.writtenBy || '')}</div>
      ${tp.basedOn ? `<div class="tp-based">Based on ${escapeHtml(tp.basedOn)}</div>` : ''}
      <div class="tp-footer">
        <div>${escapeHtml(tp.draftDate || '')}</div>
        <div class="tp-contact">${escapeHtml(tp.contact || '').replace(/\n/g, '<br>')}</div>
      </div>
    </div>`;

  const jitterSeed = jitterSeedFromKey(project.id || tp.title || 'dreamwrite');
  const jitterOn = project.settings?.typewriterJitter !== false;

  const scriptPages = pages
    .map((page) => {
      const j = pageTypewriterJitter(page.number, {
        seed: jitterSeed,
        enabled: jitterOn,
      });
      const num =
        page.number >= (PAGE_FORMAT.pageNumber.startAt || 2)
          ? `<div class="page-num" style="transform:translate(${j.dxIn * 0.35}in,${j.dyIn * 0.5}in)">${escapeHtml(PAGE_FORMAT.pageNumber.format(page.number))}</div>`
          : '';
      const rows = page.rows
        .map((row) => {
          if (row.isBlank || row.type === 'blank') {
            return `<div class="line blank">&nbsp;</div>`;
          }
          if (row.type === 'dual-row') {
            const lc = escapeHtml(row.left?.character || '');
            const lt = escapeHtml(row.left?.text || '');
            const rc = escapeHtml(row.right?.character || '');
            const rt = escapeHtml(row.right?.text || '');
            const leftInner = lc
              ? `<div class="dual-char">${lc}</div>`
              : `<div class="dual-dlg">${lt || '&nbsp;'}</div>`;
            const rightInner = rc
              ? `<div class="dual-char">${rc}</div>`
              : `<div class="dual-dlg">${rt || '&nbsp;'}</div>`;
            return `<div class="line el-dual-row"><div class="dual-col">${leftInner}</div><div class="dual-col">${rightInner}</div></div>`;
          }
          if (row.type === 'scene' && row.sceneNumber != null) {
            const sn = escapeHtml(String(row.sceneNumber));
            const text = escapeHtml(row.text || '') || '&nbsp;';
            return `<div class="line el-scene has-sn"><span class="sn-left">${sn}</span><span class="sn-body">${text}</span><span class="sn-right">${sn}</span></div>`;
          }
          const cls = `line el-${escapeHtml(row.type)}`;
          const text = escapeHtml(row.text || '') || '&nbsp;';
          return `<div class="${cls}">${text}</div>`;
        })
        .join('\n');
      // Body base: top 1in, left 1.5in — plus micro typewriter seating
      return `<div class="sheet script-page" data-page="${page.number}">
${num}
<div class="body" style="top:calc(1in + ${j.dyIn}in);left:calc(1.5in + ${j.dxIn}in)">${rows}</div>
</div>`;
    })
    .join('\n');

  // Indents from page left edge: content starts at 1.5" (marginLeft).
  // character 3.7" → margin-left 2.2" inside body; dialogue 2.5" → 1.0"; etc.
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<style>
  ${fontFace}
  @page { size: letter; margin: 0; }
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    font-family: "Courier Prime", "Courier New", Courier, monospace;
    font-size: 12pt;
    line-height: 12pt;
    color: #000;
  }
  .sheet {
    width: 8.5in;
    height: 11in;
    page-break-after: always;
    position: relative;
    overflow: hidden;
  }
  .sheet:last-child { page-break-after: auto; }
  .title-page {
    text-align: center;
    padding: 1in 1in 1in 1.5in;
    padding-top: 3.5in;
  }
  .tp-title { text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 1.2em; text-decoration: underline; }
  .tp-by { margin-bottom: 0.4em; }
  .tp-author { margin-bottom: 1.5em; }
  .tp-based { margin-top: 1em; }
  .tp-footer {
    position: absolute;
    left: 1.5in;
    bottom: 1in;
    text-align: left;
    white-space: pre-wrap;
  }
  .tp-contact { margin-top: 1em; white-space: pre-wrap; }
  .script-page { padding: 0; }
  /* Page number: grid line 3 = 0.5" from top, flush right at 7.5" */
  .page-num {
    position: absolute;
    top: 0.5in;
    right: 1in;
    text-align: right;
    width: 1in;
  }
  /* Body: first text line at 1.0" (grid line 7) */
  .body {
    position: absolute;
    top: 1in;
    left: 1.5in;
    right: 1in;
    height: 9in; /* 54 lines × 12pt */
    overflow: hidden;
  }
  .line {
    margin: 0;
    padding: 0;
    height: 12pt;
    white-space: pre;
    overflow: hidden;
  }
  .blank { height: 12pt; }
  .el-scene { text-transform: uppercase; }
  .el-shot { text-transform: uppercase; }
  .el-character { margin-left: 2.2in; text-transform: uppercase; }
  .el-more { margin-left: 2.2in; }
  .el-parenthetical { margin-left: 1.6in; max-width: 2.9in; }
  .el-dialogue { margin-left: 1.0in; max-width: 3.5in; }
  .el-transition { text-align: right; text-transform: uppercase; }
  .el-action, .el-general { max-width: 6in; }
  .el-dual-row {
    display: flex;
    flex-direction: row;
    gap: 0.25in;
    height: 12pt;
    white-space: pre;
  }
  .dual-col { width: 2.9in; overflow: hidden; }
  .dual-char { text-transform: uppercase; text-align: center; }
  .dual-dlg { max-width: 2.9in; }
  .el-scene.has-sn {
    display: flex;
    justify-content: space-between;
    gap: 0.25in;
    white-space: pre;
  }
  .sn-left, .sn-right { width: 0.4in; flex: 0 0 auto; }
  .sn-right { text-align: right; }
  .sn-body { flex: 1; text-align: left; }
</style>
</head>
<body>
${titlePage}
${scriptPages}
<script>
  document.fonts.ready.then(function () {
    window.__platenFontsReady = true;
  });
</script>
</body>
</html>`;
}

/* ---------- Snapshot history ---------- */

function pushHistory(project, label = 'edit') {
  const snap = {
    id: uid(),
    at: new Date().toISOString(),
    label,
    blocks: JSON.parse(JSON.stringify(project.blocks || [])),
  };
  project.history = project.history || [];
  project.history.push(snap);
  if (project.history.length > 30) project.history.shift();
}

export {
  ELEMENTS,
  ELEMENT_LABELS,
  TAB_CYCLE,
  ENTER_NEXT,
  FORMAT,
  uid,
  emptyProject,
  createBlock,
  normalizeType,
  normalizeBlock,
  normalizeProject,
  characterBaseName,
  applyContd,
  lintScript,
  toFountain,
  fromFountain,
  extractCharacters,
  extractLocations,
  parseSceneHeading,
  autoCardsFromScenes,
  syncCardsFromScenes,
  computeStats,
  toPdfHtml,
  pushHistory,
  /** @deprecated alias of pageCount — ADR-0006 */
  estimatePages,
  pageCount,
  paginate,
  // exported for tests — previously module-private
  charsPerLine,
  looksLikeScene,
  looksLikeTransition,
  looksLikeCharacter,
  looksLikeParenthetical,
};
