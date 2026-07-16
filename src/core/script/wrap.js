/**
 * Greedy word-wrap for screenplay columns.
 * Never hyphenate, never justify — ragged right, whole words only.
 *
 * @see docs/spec/pagination.md §3, §7
 */

/**
 * Wrap text to `columns` characters per line.
 * Overlong single words are hard-split (no hyphens).
 *
 * @param {string} text
 * @param {number} columns
 * @returns {string[]}
 */
export function wrap(text, columns) {
  if (columns < 1) throw new Error('wrap: columns must be >= 1');
  const raw = String(text ?? '');
  if (raw === '') return [''];

  // Preserve explicit hard line breaks as forced wraps.
  const hardLines = raw.split('\n');
  /** @type {string[]} */
  const out = [];

  for (let h = 0; h < hardLines.length; h++) {
    const segment = hardLines[h];
    if (segment === '') {
      // Empty hard line (from trailing \n or blank line in text)
      if (h < hardLines.length - 1 || hardLines.length === 1) out.push('');
      continue;
    }
    out.push(...wrapSoft(segment, columns));
  }

  return out.length ? out : [''];
}

/**
 * Soft-wrap one hard line (no \n).
 * @param {string} text
 * @param {number} columns
 * @returns {string[]}
 */
function wrapSoft(text, columns) {
  const words = text.split(/(\s+)/);
  /** @type {string[]} */
  const lines = [];
  let current = '';

  for (const token of words) {
    if (token === '') continue;
    const isSpace = /^\s+$/.test(token);

    if (isSpace) {
      // Spaces only attach if something is already on the line and they fit
      if (current === '') continue; // leading space on a soft line — drop
      if (current.length + token.length <= columns) {
        current += token;
      }
      // else: space that would overflow is discarded (word boundary is the break)
      continue;
    }

    // Word token
    if (token.length > columns) {
      // Flush current, then hard-split the overlong word
      if (current.trimEnd()) lines.push(current.trimEnd());
      current = '';
      for (const chunk of hardSplit(token, columns)) {
        lines.push(chunk);
      }
      continue;
    }

    const needsSpace = current.length > 0 && !/\s$/.test(current);
    const candidate = needsSpace ? `${current} ${token}` : current + token;

    if (candidate.length <= columns) {
      current = candidate;
    } else {
      if (current.trimEnd()) lines.push(current.trimEnd());
      current = token;
    }
  }

  if (current.trimEnd() || current === '') {
    // Keep non-empty content; trim trailing spaces on the line
    const t = current.trimEnd();
    if (t || lines.length === 0) lines.push(t);
  }

  return lines.length ? lines : [''];
}

/**
 * @param {string} word
 * @param {number} columns
 * @returns {string[]}
 */
function hardSplit(word, columns) {
  /** @type {string[]} */
  const parts = [];
  for (let i = 0; i < word.length; i += columns) {
    parts.push(word.slice(i, i + columns));
  }
  return parts;
}

/**
 * Parenthetical wrap: first line uses full width; continuation lines outdent
 * by one character (align under text, not the opening paren).
 *
 * Returns lines of content; continuation lines are prefixed with a space so
 * total visual width still fits the parenthetical column.
 *
 * @param {string} text  without surrounding parens (engine stores bare text)
 * @param {number} columns  typically 29
 * @returns {string[]}
 */
export function wrapParenthetical(text, columns) {
  if (columns < 2) return wrap(text, columns);
  const body = String(text ?? '').replace(/^\(|\)$/g, '');
  // Model as "(body)" for width of first line
  const withParens = `(${body})`;
  const firstCols = columns;
  const contCols = columns - 1; // one char consumed by outdent space

  if (withParens.length <= firstCols) {
    return [withParens];
  }

  // Wrap the interior with first line shorter (reserve for parens on first only)
  // Simpler approach: wrap full "(body)" greedily, then outdent continuations.
  const lines = wrap(withParens, firstCols);
  if (lines.length <= 1) return lines;

  // Re-wrap: first line at full width; rest at contCols with leading space
  const words = withParens.split(/(\s+)/).filter((t) => t !== '');
  /** @type {string[]} */
  const out = [];
  let current = '';
  let isFirst = true;
  let limit = firstCols;

  for (const token of words) {
    const isSpace = /^\s+$/.test(token);
    if (isSpace) {
      if (current === '') continue;
      if (current.length + token.length <= limit) current += token;
      continue;
    }
    if (token.length > limit) {
      if (current.trimEnd()) {
        out.push(isFirst ? current.trimEnd() : ` ${current.trimEnd()}`);
        isFirst = false;
        limit = contCols;
      }
      current = '';
      for (const chunk of hardSplit(token, limit)) {
        out.push(isFirst ? chunk : ` ${chunk}`);
        isFirst = false;
        limit = contCols;
      }
      continue;
    }
    const needsSpace = current.length > 0 && !/\s$/.test(current);
    const candidate = needsSpace ? `${current} ${token}` : current + token;
    if (candidate.length <= limit) {
      current = candidate;
    } else {
      if (current.trimEnd()) {
        out.push(isFirst ? current.trimEnd() : ` ${current.trimEnd()}`);
        isFirst = false;
        limit = contCols;
      }
      current = token;
    }
  }
  if (current.trimEnd()) {
    out.push(isFirst ? current.trimEnd() : ` ${current.trimEnd()}`);
  }
  return out.length ? out : ['()'];
}
