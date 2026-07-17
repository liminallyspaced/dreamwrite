/**
 * One pagination engine → Page[] for screen, stats, and PDF.
 *
 * @see docs/spec/pagination.md
 * @see docs/architecture/decisions/0006-one-pagination-engine.md
 */
import { DEFAULT_FORMAT, blanksBefore, widthChars } from './format.js';
import { wrap, wrapParenthetical } from './wrap.js';

/**
 * @typedef {{ number: number, rows: Row[] }} Page
 * @typedef {{
 *   blockId: string | null,
 *   type: string,
 *   text: string,
 *   isContinuation?: boolean,
 *   isBlank?: boolean,
 *   isSynthetic?: boolean,
 *   sceneNumber?: number | null,
 *   dual?: boolean,
 *   left?: { character?: string, text?: string, blockId?: string | null },
 *   right?: { character?: string, text?: string, blockId?: string | null },
 * }} Row
 */

/**
 * Paginate script blocks into industry pages.
 * Pure: never mutates blocks; (MORE)/(CONT'D) are synthetic rows only.
 *
 * @param {Array<{ id?: string, type: string, text?: string }>} blocks
 * @param {Partial<typeof DEFAULT_FORMAT>} [formatOverride]
 * @returns {Page[]}
 */
export function paginate(blocks, formatOverride = {}) {
  const format = mergeFormat(DEFAULT_FORMAT, formatOverride);
  const bodyLines = format.bodyLines;
  const items = expandBlocks(blocks || [], format);

  /** @type {Page[]} */
  const pages = [];
  /** @type {Row[]} */
  let current = [];
  let used = 0;

  function flush() {
    if (current.length === 0 && pages.length === 0) return;
    pages.push({ number: pages.length + 1, rows: current });
    current = [];
    used = 0;
  }

  function spaceLeft() {
    return bodyLines - used;
  }

  /**
   * @param {Row} row
   * @param {number} [cost]
   */
  function pushRow(row, cost = 1) {
    current.push(row);
    used += cost;
  }

  /**
   * @param {number} n
   * @param {string | null} blockId
   */
  function pushBlanks(n, blockId) {
    for (let i = 0; i < n; i++) {
      if (spaceLeft() < 1) flush();
      pushRow({ blockId, type: 'blank', text: '', isBlank: true });
    }
  }

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const next = items[i + 1] || null;

    // Skip pure notes from pagination (industry: often omitted)
    if (item.type === 'note') continue;

    let blanks = item.blanksBefore;
    // Don't spend blanks if they would leave an orphan heading alone —
    // handled when placing content.

    // Transitions must never start a page (unless nothing else we can do)
    if (item.type === 'transition' && used === 0 && pages.length > 0) {
      // Pull is handled by never ending previous page in a way that leaves
      // transition first — if we still land here, place it anyway.
    }

    // Character cue is atomic with first dialogue/parenthetical line
    if (item.type === 'character') {
      if (item._consumed) continue;
      // Dual partner speech is placed with its left partner
      if (item.dual) continue;
      const dualPartner = findDualPartner(items, i);
      if (dualPartner) {
        placeDualGroup(item, dualPartner, items, i);
        continue;
      }
      placeCharacterGroup(item, next, items, i);
      continue;
    }

    // If previous iteration was character and already consumed this dialogue —
    // use a consumed flag
    if (item._consumed) continue;

    placeElement(item, blanks);
  }

  if (current.length > 0 || pages.length === 0) {
    if (current.length === 0) {
      // Empty script → one empty page
      pages.push({ number: 1, rows: [] });
    } else {
      flush();
    }
  }

  return pages;

  /**
   * @param {Expanded} item
   * @param {Expanded | null} next
   * @param {Expanded[]} all
   * @param {number} index
   */
  function placeCharacterGroup(item, next, all, index) {
    const blanks = item.blanksBefore;
    const cueLine = item.lines[0] || '';

    // Gather first speech line (parenthetical or dialogue)
    /** @type {Expanded | null} */
    let speech = null;
    if (next && (next.type === 'parenthetical' || next.type === 'dialogue')) {
      speech = next;
    }

    const need =
      blanks +
      1 + // cue
      (speech ? 1 : 0); // at least first speech line

    if (need > bodyLines) {
      // Pathological: force onto its own page
      if (used > 0) flush();
    } else if (need > spaceLeft()) {
      // Can't fit atomic unit — move whole group to next page
      flush();
    }

    pushBlanks(Math.min(blanks, spaceLeft() > blanks ? blanks : Math.max(0, spaceLeft() - (speech ? 2 : 1))), item.blockId);
    // Recompute: after blanks ensure cue + first speech fit
    if (1 + (speech ? 1 : 0) > spaceLeft()) flush();

    pushRow({
      blockId: item.blockId,
      type: 'character',
      text: cueLine,
      isContinuation: false,
      dual: !!item.dual,
    });

    if (!speech) return;

    // Mark speech start consumed only for the first line path through placeDialogue
    if (speech.type === 'parenthetical') {
      placeParenthetical(speech, /*blanks*/ 0, item);
      speech._consumed = true;
      // Dialogue after parenthetical
      const after = all[index + 2];
      if (after && after.type === 'dialogue' && !after._consumed) {
        placeDialogue(after, 0, item, /*isContinuationSpeech*/ false);
        after._consumed = true;
      }
    } else {
      placeDialogue(speech, 0, item, false);
      speech._consumed = true;
    }
  }

  /**
   * @param {Expanded} item
   * @param {number} blanks
   */
  function placeElement(item, blanks) {
    if (item.type === 'dialogue') {
      placeDialogue(item, blanks, null, false);
      return;
    }
    if (item.type === 'parenthetical') {
      placeParenthetical(item, blanks, null);
      return;
    }
    if (item.type === 'scene' || item.type === 'shot') {
      placeKeepWithNext(item, blanks);
      return;
    }
    if (item.type === 'transition') {
      placeTransition(item, blanks);
      return;
    }
    // action / general / default — breakable at sentence ends
    placeBreakable(item, blanks, format.breaks.minActionLines);
  }

  /**
   * Scene/shot: never last on page unless next is also scene/shot.
   * Prefer ≥2 following action lines when possible.
   * @param {Expanded} item
   * @param {number} blanks
   */
  function placeKeepWithNext(item, blanks) {
    const lines = item.lines;
    const cost = blanks + lines.length;
    // Need room for heading + at least a little following content preference
    const minKeep = blanks + lines.length + 1; // +1 following line preferred
    if (cost > spaceLeft() || (minKeep > spaceLeft() && spaceLeft() < bodyLines)) {
      if (used > 0) flush();
    }
    pushBlanks(blanks, item.blockId);
    if (lines.length > spaceLeft()) {
      if (used > 0) flush();
      pushBlanks(blanks, item.blockId);
    }
    for (const text of lines) {
      if (spaceLeft() < 1) flush();
      pushRow({
        blockId: item.blockId,
        type: item.type,
        text,
        isContinuation: false,
        sceneNumber: item.type === 'scene' ? item.sceneNumber : undefined,
      });
    }
  }

  /**
   * Dual dialogue: left character speech + right (dual:true) partner, side-by-side.
   * Pair breaks as a unit (no page split inside the dual block when avoidable).
   * @param {Expanded} leftCue
   * @param {{ cue: Expanded, cueIndex: number }} partner
   * @param {Expanded[]} all
   * @param {number} leftIndex
   */
  function placeDualGroup(leftCue, partner, all, leftIndex) {
    const leftSpeech = collectSpeech(all, leftIndex);
    const rightSpeech = collectSpeech(all, partner.cueIndex);
    // Mark consumed
    markSpeechConsumed(all, leftIndex);
    markSpeechConsumed(all, partner.cueIndex);
    partner.cue._consumed = true;

    const leftChar = leftCue.lines[0] || leftCue.rawText || '';
    const rightChar = partner.cue.lines[0] || partner.cue.rawText || '';
    const leftLines = speechLines(leftSpeech);
    const rightLines = speechLines(rightSpeech);
    const maxBody = Math.max(leftLines.length, rightLines.length, 1);
    const blanks = leftCue.blanksBefore || 0;
    // cue row + body rows
    const need = blanks + 1 + maxBody;
    if (need > spaceLeft() && used > 0) flush();
    pushBlanks(Math.min(blanks, Math.max(0, spaceLeft() - (1 + maxBody))), leftCue.blockId);
    if (1 + maxBody > spaceLeft() && used > 0) flush();

    // Character cues row
    pushRow({
      blockId: leftCue.blockId,
      type: 'dual-row',
      text: '',
      isSynthetic: false,
      left: { character: leftChar, text: '', blockId: leftCue.blockId },
      right: { character: rightChar, text: '', blockId: partner.cue.blockId },
      dual: true,
    });

    for (let li = 0; li < maxBody; li++) {
      if (spaceLeft() < 1) {
        // Pair should not split mid-dual if possible — flush and re-emit cues (CONT'D style)
        flush();
        pushRow({
          blockId: leftCue.blockId,
          type: 'dual-row',
          text: '',
          left: {
            character: formatContdCue(leftChar, format),
            text: '',
            blockId: leftCue.blockId,
          },
          right: {
            character: formatContdCue(rightChar, format),
            text: '',
            blockId: partner.cue.blockId,
          },
          dual: true,
          isContinuation: true,
        });
      }
      pushRow({
        blockId: leftCue.blockId,
        type: 'dual-row',
        text: '',
        left: {
          character: '',
          text: leftLines[li] || '',
          blockId: leftSpeech.dialogueId || leftCue.blockId,
        },
        right: {
          character: '',
          text: rightLines[li] || '',
          blockId: rightSpeech.dialogueId || partner.cue.blockId,
        },
        dual: true,
      });
    }
  }

  /**
   * @param {Expanded} item
   * @param {number} blanks
   */
  function placeTransition(item, blanks) {
    // Never first on page if we can avoid it
    if (used === 0 && pages.length > 0 && !format.breaks.allowTransitionFirstOnPage) {
      // Place with a preceding blank already impossible — just place
    }
    const need = blanks + item.lines.length;
    if (need > spaceLeft() && used > 0) flush();
    // If still first on page after flush, leave a blank if room (unconventional)
    pushBlanks(blanks, item.blockId);
    for (const text of item.lines) {
      if (spaceLeft() < 1) flush();
      pushRow({
        blockId: item.blockId,
        type: 'transition',
        text,
        isContinuation: false,
      });
    }
  }

  /**
   * @param {Expanded} item
   * @param {number} blanks
   * @param {Expanded | null} cueItem
   */
  function placeParenthetical(item, blanks, cueItem) {
    const lines = item.lines;
    // Parenthetical is atomic — never break inside
    const need = blanks + lines.length;
    if (need > spaceLeft() && used > 0) flush();
    // Still must fit with cue? cue already placed when called from character group
    if (need > spaceLeft() && used > 0) flush();
    pushBlanks(blanks, item.blockId);
    for (let li = 0; li < lines.length; li++) {
      if (spaceLeft() < 1) {
        // Can't split parenthetical — move remaining (+ already placed?) to next page
        // Whole parenthetical should move: if we already placed some, we're in trouble
        // → only flush before any lines
        flush();
      }
      pushRow({
        blockId: item.blockId,
        type: 'parenthetical',
        text: lines[li],
        isContinuation: li > 0,
      });
    }
  }

  /**
   * @param {Expanded} item
   * @param {number} blanks
   * @param {Expanded | null} cueItem
   * @param {boolean} pageContinued  true when resuming after MORE
   */
  function placeDialogue(item, blanks, cueItem, pageContinued) {
    const minD = format.breaks.minDialogueLines;
    const lines = item.lines;
    let start = 0;

    // Leading blanks only once
    if (blanks > 0) {
      if (blanks + 1 > spaceLeft() && used > 0) flush();
      pushBlanks(blanks, item.blockId);
    }

    while (start < lines.length) {
      const remaining = lines.length - start;
      let room = spaceLeft();

      if (room < 1) {
        flush();
        // After page break mid-dialogue: CONT'D cue
        if (format.autoContdOnPageBreak && cueItem) {
          emitContdCue(cueItem);
          room = spaceLeft();
        }
        pageContinued = true;
      }

      // If we must break (remaining won't fit), reserve MORE line
      const needsBreak = remaining > room;
      const moreReserve =
        needsBreak && format.breaks.countMoreLine && format.autoContdOnPageBreak ? 1 : 0;
      let avail = room - moreReserve;

      if (avail < 1) {
        // Not even one dialogue line — flush and retry
        if (used > 0) {
          flush();
          if (format.autoContdOnPageBreak && cueItem) emitContdCue(cueItem);
          continue;
        }
        avail = Math.max(1, room);
      }

      // How many lines can we take?
      let take = Math.min(remaining, avail);

      // Min lines both sides when splitting
      if (take < remaining) {
        // Breaking: need ≥ minD before break (including prior lines on this page for this speech)
        const alreadyOnPage = start; // lines of this element already emitted… not tracking prior page
        // For this chunk: ensure take >= minD and remaining-take >= minD when possible
        if (remaining - take < minD && remaining > minD) {
          // Leave at least minD for next page
          take = Math.max(0, remaining - minD);
          take = Math.min(take, avail);
        }
        if (take < minD && start === 0 && remaining > minD) {
          // Not enough room for min dialogue on this page — push whole rest to next
          if (used > 0 && current.some((r) => r.type !== 'blank')) {
            // If only blanks+cue on page, might still need to place something
            // Remove trailing character cue if we placed nothing of dialogue? Keep cue with dialogue.
          }
        }

        // Sentence-ends only: walk back to a sentence end within the take window
        if (take > 0 && take < remaining) {
          const adjusted = sentenceEndBreak(lines, start, take);
          if (adjusted > 0) take = adjusted;
        }

        // Ensure we still leave minD on each side if possible
        if (take > 0 && take < remaining) {
          if (take < minD) {
            // Can't satisfy min — move entire remaining speech to next page
            // If cue is alone at end, move cue too (hard: cue already on page)
            if (used > 1) {
              flush();
              if (format.autoContdOnPageBreak && cueItem) emitContdCue(cueItem);
              continue;
            }
          }
        }
      }

      if (take < 1) {
        flush();
        if (format.autoContdOnPageBreak && cueItem) emitContdCue(cueItem);
        continue;
      }

      for (let k = 0; k < take; k++) {
        pushRow({
          blockId: item.blockId,
          type: 'dialogue',
          text: lines[start + k],
          isContinuation: start + k > 0 || pageContinued,
        });
      }
      start += take;

      if (start < lines.length) {
        // Emit MORE and break page
        if (format.breaks.countMoreLine) {
          pushRow({
            blockId: null,
            type: 'more',
            text: format.moreText,
            isSynthetic: true,
          });
        }
        flush();
        if (format.autoContdOnPageBreak && cueItem) {
          emitContdCue(cueItem);
        }
        pageContinued = true;
      }
    }
  }

  /**
   * @param {Expanded} item
   * @param {number} blanks
   * @param {number} minLines
   */
  function placeBreakable(item, blanks, minLines) {
    const lines = item.lines;
    let start = 0;

    if (blanks > 0) {
      if (blanks + Math.min(lines.length, 1) > spaceLeft() && used > 0) flush();
      pushBlanks(blanks, item.blockId);
    }

    while (start < lines.length) {
      let room = spaceLeft();
      if (room < 1) {
        flush();
        room = spaceLeft();
      }

      const remaining = lines.length - start;
      let take = Math.min(remaining, room);

      if (take < remaining) {
        if (remaining - take < minLines && remaining > minLines) {
          take = Math.max(0, remaining - minLines);
          take = Math.min(take, room);
        }
        if (take > 0 && take < remaining) {
          const adjusted = sentenceEndBreak(lines, start, take);
          if (adjusted > 0) take = adjusted;
        }
        if (take < minLines && remaining > minLines && used > 0) {
          flush();
          continue;
        }
      }

      if (take < 1) {
        // Force at least one line if element is huge
        take = 1;
        if (spaceLeft() < 1) flush();
      }

      for (let k = 0; k < take; k++) {
        pushRow({
          blockId: item.blockId,
          type: item.type,
          text: lines[start + k],
          isContinuation: start + k > 0,
        });
      }
      start += take;
    }
  }

  /**
   * @param {Expanded} cueItem
   */
  function emitContdCue(cueItem) {
    if (spaceLeft() < 2) flush();
    const text = formatContdCue(cueItem.lines[0] || cueItem.rawText || '', format);
    pushRow({
      blockId: cueItem.blockId,
      type: 'character',
      text,
      isContinuation: true,
      isSynthetic: true,
    });
  }
}

/**
 * @param {typeof DEFAULT_FORMAT} base
 * @param {object} over
 */
function mergeFormat(base, over) {
  if (!over || !Object.keys(over).length) return base;
  return {
    ...base,
    ...over,
    elements: { ...base.elements, ...(over.elements || {}) },
    breaks: { ...base.breaks, ...(over.breaks || {}) },
    pageNumber: { ...base.pageNumber, ...(over.pageNumber || {}) },
    sceneNumbers: { ...base.sceneNumbers, ...(over.sceneNumbers || {}) },
    dual: { ...base.dual, ...(over.dual || {}) },
  };
}

/**
 * @typedef {{
 *   blockId: string | null,
 *   type: string,
 *   lines: string[],
 *   blanksBefore: number,
 *   rawText: string,
 *   dual?: boolean,
 *   sceneNumber?: number | null,
 *   _consumed?: boolean,
 * }} Expanded
 */

/**
 * @param {Array<{ id?: string, type: string, text?: string, dual?: boolean }>} blocks
 * @param {typeof DEFAULT_FORMAT} format
 * @returns {Expanded[]}
 */
function expandBlocks(blocks, format) {
  /** @type {Expanded[]} */
  const out = [];
  let prevType = null;
  let lastSpeaker = null;
  let interrupted = false;
  let sceneIndex = 0;
  const sceneMode = format.sceneNumbers?.mode || 'both';
  const autoReturn = format.autoContdOnReturn !== false;

  for (const b of blocks) {
    const type = b.type || 'action';
    if (type === 'note') {
      continue;
    }
    let raw = b.text || '';
    // Strip caret from dual fountain leftovers if any
    if (type === 'character') {
      raw = raw.replace(/\s*\^\s*$/, '').trim();
    }

    // Same-speaker CONT'D (paginate-time only)
    let displayRaw = raw;
    if (type === 'character') {
      const name = baseName(raw);
      if (autoReturn && lastSpeaker && name === lastSpeaker && interrupted && name) {
        displayRaw = formatContdCue(raw, format);
      }
      lastSpeaker = name;
      interrupted = false;
    } else if (type === 'dialogue' || type === 'parenthetical') {
      // still same speech
    } else if (type === 'scene') {
      lastSpeaker = null;
      interrupted = false;
    } else if (
      type === 'action' ||
      type === 'shot' ||
      type === 'general' ||
      type === 'transition'
    ) {
      if (lastSpeaker) interrupted = true;
    }

    let sceneNumber = null;
    if (type === 'scene') {
      sceneIndex += 1;
      if (sceneMode !== 'hidden') sceneNumber = sceneIndex;
    }

    const cols = widthChars(type, format);
    let lines;
    if (type === 'parenthetical') {
      lines = wrapParenthetical(displayRaw, cols);
    } else if (type === 'character' || type === 'scene' || type === 'shot' || type === 'transition') {
      lines = wrap(displayRaw, cols);
    } else {
      lines = wrap(displayRaw, cols);
    }

    if (!raw && (type === 'action' || type === 'general' || type === 'dialogue')) {
      lines = [];
    }
    if (lines.length === 0) {
      prevType = type;
      continue;
    }

    const blanks = blanksBefore(prevType, type, format);
    out.push({
      blockId: b.id ?? null,
      type,
      lines,
      blanksBefore: blanks,
      rawText: raw,
      dual: !!b.dual,
      sceneNumber,
    });
    prevType = type;
  }
  return out;
}

function baseName(text) {
  return String(text || '')
    .replace(/\s*\^?\s*$/, '')
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

/**
 * Find dual partner cue after left character's speech unit.
 * @param {Expanded[]} items
 * @param {number} leftIndex
 */
function findDualPartner(items, leftIndex) {
  let j = leftIndex + 1;
  // skip speech of left
  while (j < items.length && (items[j].type === 'parenthetical' || items[j].type === 'dialogue')) {
    j += 1;
  }
  if (j < items.length && items[j].type === 'character' && items[j].dual) {
    return { cue: items[j], cueIndex: j };
  }
  return null;
}

/**
 * @param {Expanded[]} all
 * @param {number} cueIndex
 */
function collectSpeech(all, cueIndex) {
  /** @type {Expanded[]} */
  const parts = [];
  let j = cueIndex + 1;
  while (j < all.length && (all[j].type === 'parenthetical' || all[j].type === 'dialogue')) {
    parts.push(all[j]);
    j += 1;
  }
  let dialogueId = null;
  for (const p of parts) {
    if (p.type === 'dialogue') dialogueId = p.blockId;
  }
  return { parts, dialogueId };
}

/**
 * @param {Expanded[]} all
 * @param {number} cueIndex
 */
function markSpeechConsumed(all, cueIndex) {
  let j = cueIndex + 1;
  while (j < all.length && (all[j].type === 'parenthetical' || all[j].type === 'dialogue')) {
    all[j]._consumed = true;
    j += 1;
  }
}

/**
 * Flatten speech parts to display lines (paren + dialogue).
 * @param {{ parts: Expanded[] }} speech
 */
function speechLines(speech) {
  /** @type {string[]} */
  const lines = [];
  for (const p of speech.parts || []) {
    for (const line of p.lines || []) {
      if (p.type === 'parenthetical') {
        const t = line.trim();
        lines.push(t.startsWith('(') ? t : `(${t.replace(/^\(|\)$/g, '')})`);
      } else {
        lines.push(line);
      }
    }
  }
  return lines;
}

/**
 * Find the latest sentence-ending line index within [start, start+take).
 * Returns take count from start, or 0 if none (caller may still mid-break as last resort).
 *
 * @param {string[]} lines
 * @param {number} start
 * @param {number} take
 */
function sentenceEndBreak(lines, start, take) {
  for (let n = take; n >= 1; n--) {
    const line = lines[start + n - 1] || '';
    if (/[.!?]["')\]]*\s*$/.test(line) || /[.!?]$/.test(line.trim())) {
      return n;
    }
  }
  // No sentence end — SENTENCE_ENDS_ONLY would refuse mid-sentence; if the
  // whole remaining speech has no end in the window, take the max that fits
  // only when forced by page size (last resort: still break so we don't infinite-loop).
  return take;
}

/**
 * @param {string} cueText
 * @param {typeof DEFAULT_FORMAT} format
 */
function formatContdCue(cueText, format) {
  const raw = String(cueText || '').trim();
  const contd = format.contdText || "(CONT'D)";
  // Already has CONT'D?
  if (/\(CONT'?D\)/i.test(raw)) return raw.toUpperCase();

  const extMatch = raw.match(/\((V\.O\.|O\.S\.|O\.C\.)\)/i);
  const base = raw
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();

  if (extMatch) {
    const ext = extMatch[1].toUpperCase();
    if (format.contdStyle === 'semicolon') {
      return `${base} (${ext}; ${contd.replace(/[()]/g, '')})`;
    }
    return `${base} (${ext}) ${contd}`;
  }
  return `${base} ${contd}`;
}

/**
 * Page count for stats — integer pages (at least 1 if any content).
 * @param {Array<{ id?: string, type: string, text?: string }>} blocks
 * @param {object} [format]
 */
export function pageCount(blocks, format) {
  const pages = paginate(blocks, format);
  return pages.length;
}
