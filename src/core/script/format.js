/**
 * Industry pagination constants — Final Draft / Nicholl / MMSW defaults.
 * Source: docs/spec/pagination.md §6. Do not invent dual-dialogue geometry.
 *
 * @see docs/architecture/decisions/0006-one-pagination-engine.md
 */

/** @typedef {typeof DEFAULT_FORMAT} PageFormat */

export const DEFAULT_FORMAT = {
  pageWidthIn: 8.5,
  pageHeightIn: 11,
  marginTopIn: 1.0,
  /** Minimum bottom margin; 54 is a ceiling the break rules pull back from. */
  marginBottomIn: 1.0,
  marginLeftIn: 1.5,
  marginRightIn: 1.0,

  cpi: 10,
  lpi: 6,
  gridLines: 66,
  /** Body lines 7–60 inclusive → 54. Final Draft KB: 9" × 6 lpi. */
  bodyLines: 54,
  firstBodyLine: 7,
  lastBodyLine: 60,

  pageNumber: {
    gridLine: 3,
    alignRightIn: 7.5,
    /** `{n}.` — never "Page n" */
    format: (n) => `${n}.`,
    /** First numbered page (page 1 unnumbered). */
    startAt: 2,
  },

  /**
   * leftIn / rightEdgeIn / widthChars / blanksBefore (default).
   * blanksBefore for scene is CONFIG — default 2 (FD).
   */
  elements: {
    scene: { leftIn: 1.5, rightEdgeIn: 7.5, widthChars: 60, blanksBefore: 2 },
    action: { leftIn: 1.5, rightEdgeIn: 7.5, widthChars: 60, blanksBefore: 1 },
    shot: { leftIn: 1.5, rightEdgeIn: 7.5, widthChars: 60, blanksBefore: 2 },
    character: { leftIn: 3.7, rightEdgeIn: 7.5, widthChars: 38, blanksBefore: 1 },
    parenthetical: { leftIn: 3.1, rightEdgeIn: 6.0, widthChars: 29, blanksBefore: 0 },
    dialogue: { leftIn: 2.5, rightEdgeIn: 6.0, widthChars: 35, blanksBefore: 0 },
    transition: { leftIn: 6.0, rightEdgeIn: 7.5, widthChars: 15, blanksBefore: 1 },
    general: { leftIn: 1.5, rightEdgeIn: 7.5, widthChars: 60, blanksBefore: 1 },
    /** Synthetic — emitted only by paginate at dialogue breaks. */
    more: { leftIn: 3.7, rightEdgeIn: 7.5, widthChars: 10, blanksBefore: 0 },
    note: { leftIn: 1.5, rightEdgeIn: 7.5, widthChars: 60, blanksBefore: 1 },
  },

  breaks: {
    minDialogueLines: 2,
    minActionLines: 2,
    /** SENTENCE_ENDS_ONLY + 2-line guard (conservative intersection). */
    policy: 'SENTENCE_ENDS_ONLY',
    countMoreLine: true,
    allowTransitionFirstOnPage: false,
  },

  /**
   * Inject CHARACTER (CONT'D) at page-break continuation.
   * Never written into the document model.
   */
  autoContdOnPageBreak: true,
  moreText: '(MORE)',
  contdText: "(CONT'D)",
  /** Screenwriter style: NAME (V.O.; CONT'D). FD uses NAME (V.O.) (CONT'D). */
  contdStyle: 'paren', // 'paren' | 'semicolon'
};

/**
 * Width in characters for a block type.
 * @param {string} type
 * @param {PageFormat} [format]
 */
export function widthChars(type, format = DEFAULT_FORMAT) {
  const el = format.elements[type] || format.elements.action;
  return el.widthChars;
}

/**
 * Blank lines before placing an element, given the previous non-blank type.
 * @param {string | null} prevType
 * @param {string} type
 * @param {PageFormat} [format]
 */
export function blanksBefore(prevType, type, format = DEFAULT_FORMAT) {
  if (!prevType) {
    // First content on a page / script — scene still wants 0 at very start of page 1
    // but normal blanks apply between elements.
    if (type === 'scene') return 0; // first scene of page/script: no leading blanks on first page
    return 0;
  }

  // Zero-space transitions inside a speech unit
  if (
    (prevType === 'character' && (type === 'parenthetical' || type === 'dialogue')) ||
    (prevType === 'parenthetical' && type === 'dialogue') ||
    (prevType === 'dialogue' && type === 'parenthetical')
  ) {
    return 0;
  }

  const el = format.elements[type] || format.elements.action;
  return el.blanksBefore ?? 1;
}
