/**
 * Block DOM primitives — reading, writing and caret placement for a single
 * contenteditable block element.
 *
 * Extracted verbatim from app.js (Phase 0). These six functions touch NOTHING but
 * their arguments and the DOM — no `state`, no `els`, no engine. That's why they
 * came out first: the extraction cannot change behaviour, and it makes the block
 * text-reading logic testable, which nothing in this layer was before.
 *
 * Platen gives each block its OWN contenteditable, with a non-editable `.block-gutter`
 * sibling holding the element label. That split is deliberate and correct — a comment
 * at app.js:319 records that the gutter used to live *inside* the editable and leaked
 * its label into the user's action text. Keep the gutter out of the editable.
 */

// Non-breaking space, built from a char code rather than written literally.
// A raw nbsp in source is invisible; the next reader will "tidy" it into a plain
// space and silently break trailing-space normalisation in readBlockText().
const NBSP = String.fromCharCode(0xa0);

/**
 * Write plain text into a block's editable node.
 *
 * textContent only — never innerHTML. The editable must hold a plain text node and
 * nothing else, or the gutter/markup leaks back into the user's prose.
 */
export function setBlockDomText(textEl, value) {
  textEl.textContent = value || '';
}

/**
 * Read a block's text back out of the DOM.
 *
 * Not just `textContent`: browsers insert <br> for empty lines inside a
 * contenteditable, and textContent silently drops them — so multi-line dialogue
 * would lose its line breaks. Walk the tree instead and map BR -> "\n".
 *
 * Also normalises the non-breaking space contenteditable inserts on trailing
 * spaces, and trims one trailing newline (the browser's own, not the user's).
 */
export function readBlockText(textEl) {
  if (!textEl) return '';

  let raw = '';
  const walk = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      raw += node.nodeValue;
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const tag = node.tagName;
    if (tag === 'BR') {
      raw += '\n';
      return;
    }
    if (tag === 'DIV' || tag === 'P') {
      // A nested block element implies a line break before it — but not a leading one.
      if (raw.length && !raw.endsWith('\n')) raw += '\n';
    }
    node.childNodes.forEach(walk);
  };
  textEl.childNodes.forEach(walk);

  return raw.split(NBSP).join(' ').replace(/\n$/, '');
}

/** Focus `el` and collapse the caret to the end of its content. */
export function placeCaretEnd(el) {
  el.focus();
  const range = document.createRange();
  const sel = window.getSelection();
  range.selectNodeContents(el);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}

/** Focus `el` and collapse the caret to the start of its content. */
export function placeCaretStart(el) {
  el.focus();
  const range = document.createRange();
  const sel = window.getSelection();
  range.selectNodeContents(el);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}

/**
 * Is the caret at the end of `el`'s content?
 *
 * Returns true when there is no selection, or the selection is outside `el` —
 * callers treat "don't know" as "at end". That default matters: app.js:1118 only
 * restores the caret after a textContent reset if this returns true, which is why
 * editing mid-block multi-line dialogue currently drops the caret
 * (docs/plan/00-findings.md §5.5).
 */
export function isCaretAtEnd(el) {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return true;

  const range = sel.getRangeAt(0);
  if (!el.contains(range.endContainer)) return true;

  const test = document.createRange();
  test.selectNodeContents(el);
  test.setStart(range.endContainer, range.endOffset);
  return test.toString().length === 0;
}

/** Ghost text shown in an empty block, by element type. */
export function placeholderFor(type) {
  switch (type) {
    case 'scene':
      return 'INT. LOCATION - DAY';
    case 'action':
      return 'What we SEE and HEAR — present tense...';
    case 'character':
      return 'CHARACTER NAME';
    case 'parenthetical':
      return 'wryly';
    case 'dialogue':
      return 'Spoken words...';
    case 'transition':
      return 'CUT TO:';
    case 'shot':
      return 'CLOSE ON — use sparingly';
    case 'note':
      return 'Production note (not spoken)...';
    default:
      return 'Type...';
  }
}
