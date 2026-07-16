/**
 * Platen screenplay engine
 * Industry-standard US film format (Final Draft / WGA defaults)
 * + Fountain I/O + stats + PDF + lint
 *
 * Spec (US Letter, Courier 12pt):
 *   Left 1.5" · Right 1" · Top 1" · Bottom 1"
 *   ~55 lines/page · ~1 page ≈ 1 screen minute
 * Elements: Scene Heading, Action, Character, Parenthetical, Dialogue, Transition, Shot
 */

const ELEMENTS = ['scene', 'action', 'character', 'parenthetical', 'dialogue', 'transition', 'shot', 'general', 'note'];

/** Canonical industry layout (inches from page edge) */
const FORMAT = {
  page: 'letter',
  font: 'Courier',
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
  linesPerPage: 55,
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
      case 'character':
        lines.push(text.toUpperCase());
        break;
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
  const t = line.trim();
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
      blocks.push(createBlock('character', trimmed.toUpperCase()));
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

  // Rough industry estimate: ~55 lines / page, variable by element
  const pages = estimatePages(blocks);
  const runtimeMin = Math.max(1, Math.round(pages));

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

function estimatePages(blocks) {
  // Industry rule of thumb: ~55 lines per page in Courier 12
  let lines = 0;
  for (const b of blocks) {
    if (b.type === 'note') continue; // notes often omitted from page count
    const text = b.text || '';
    const hard = Math.max(text ? 1 : 0, text.split('\n').filter((l, i, a) => l || i < a.length - 1).length || (text ? 1 : 0));
    const soft = text ? Math.ceil(text.length / charsPerLine(b.type)) : 0;
    const blockLines = Math.max(hard, soft, text ? 1 : 0);
    switch (b.type) {
      case 'scene':
        lines += 1 + 1; // slug + blank after
        break;
      case 'character':
        lines += 1;
        break;
      case 'parenthetical':
        lines += Math.max(1, blockLines);
        break;
      case 'dialogue':
        lines += blockLines + 1; // + blank after speech
        break;
      case 'transition':
        lines += 1 + 1;
        break;
      case 'shot':
        lines += 1 + 1;
        break;
      default:
        lines += blockLines + 1;
    }
  }
  const pages = lines / FORMAT.linesPerPage;
  return Math.max(pages > 0 ? 0.1 : 0, Math.round(pages * 10) / 10) || (blocks.length ? 1 : 0);
}

function charsPerLine(type) {
  // Courier 12 ≈ 10 cpi; widths from industry columns
  switch (type) {
    case 'dialogue':
      return 35; // ~3.5"
    case 'parenthetical':
      return 25; // ~2.5"
    case 'character':
      return 30;
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

function toPdfHtml(project) {
  const tp = project.titlePage || {};
  const titleBlocks = `
    <div class="title-page">
      <div class="tp-title">${escapeHtml(tp.title || 'Untitled')}</div>
      <div class="tp-by">Written by</div>
      <div class="tp-author">${escapeHtml(tp.writtenBy || '')}</div>
      ${tp.basedOn ? `<div class="tp-based">Based on ${escapeHtml(tp.basedOn)}</div>` : ''}
      <div class="tp-footer">
        <div>${escapeHtml(tp.draftDate || '')}</div>
        <div class="tp-contact">${escapeHtml(tp.contact || '').replace(/\n/g, '<br>')}</div>
      </div>
    </div>
    <div class="page-break"></div>
  `;

  const script = (project.blocks || [])
    .map((b) => {
      const text = escapeHtml(b.text || '').replace(/\n/g, '<br>');
      switch (b.type) {
        case 'scene':
          return `<div class="el scene">${text || '&nbsp;'}</div>`;
        case 'action':
        case 'general':
          return `<div class="el action">${text || '&nbsp;'}</div>`;
        case 'character':
          return `<div class="el character">${text || '&nbsp;'}</div>`;
        case 'parenthetical':
          return `<div class="el parenthetical">(${text.replace(/^\(|\)$/g, '')})</div>`;
        case 'dialogue':
          return `<div class="el dialogue">${text || '&nbsp;'}</div>`;
        case 'transition':
          return `<div class="el transition">${text || '&nbsp;'}</div>`;
        case 'shot':
          return `<div class="el shot">${text || '&nbsp;'}</div>`;
        case 'note':
          return `<div class="el note" style="font-style:italic;color:#555;border-left:2px solid #999;padding-left:8px">[[${text || ''}]]</div>`;
        default:
          return `<div class="el action">${text || '&nbsp;'}</div>`;
      }
    })
    .join('\n');

  // Margins applied via @page; element indents relative to content box
  // Content width ≈ 8.5 - 1.5 - 1 = 6"
  // Character at 3.7" from page edge = 2.2" into content
  // Dialogue at 2.5" from edge = 1.0" into content
  // Parenthetical at 3.1" from edge = 1.6" into content
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<style>
  @page { size: letter; margin: 1in 1in 1in 1.5in; }
  * { box-sizing: border-box; }
  body {
    font-family: "Courier New", Courier, monospace;
    font-size: 12pt;
    line-height: 1;
    color: #000;
    margin: 0;
    padding: 0;
  }
  .title-page {
    height: 9in;
    position: relative;
    text-align: center;
    padding-top: 3.2in;
  }
  .tp-title { font-size: 12pt; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 1.2em; text-decoration: underline; }
  .tp-by { margin-bottom: 0.4em; }
  .tp-author { margin-bottom: 1.5em; }
  .tp-based { margin-top: 1em; font-size: 12pt; }
  .tp-footer {
    position: absolute;
    left: 0;
    bottom: 0.5in;
    text-align: left;
    white-space: pre-wrap;
  }
  .tp-contact { margin-top: 1em; white-space: pre-wrap; }
  .page-break { page-break-after: always; }
  .script { padding: 0; }
  .el { margin: 0 0 12pt 0; white-space: pre-wrap; word-wrap: break-word; }
  .scene { text-transform: uppercase; margin-top: 24pt; margin-bottom: 12pt; }
  .action { max-width: 6in; }
  .character { margin-left: 2.2in; margin-bottom: 0; margin-top: 12pt; text-transform: uppercase; }
  .parenthetical { margin-left: 1.6in; margin-bottom: 0; max-width: 2.0in; }
  .dialogue { margin-left: 1.0in; margin-bottom: 0; max-width: 3.5in; }
  .dialogue + .character, .parenthetical + .character { }
  .transition { text-align: right; text-transform: uppercase; margin-top: 12pt; margin-bottom: 12pt; }
  .shot { text-transform: uppercase; margin-top: 12pt; }
  .note { font-style: italic; color: #444; border-left: 2px solid #999; padding-left: 8px; }
</style>
</head>
<body>
${titleBlocks}
<div class="script">
${script}
</div>
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

// UMD-ish export for browser
if (typeof window !== 'undefined') {
  window.ScriptEngine = {
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
    computeStats,
    toPdfHtml,
    pushHistory,
    estimatePages,
  };
}
