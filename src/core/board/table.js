/**
 * Board table card helpers — pure.
 * Cells: { type: 'text'|'number'|'checkbox', value: string|number|boolean }
 */

export function emptyCell(type = 'text') {
  if (type === 'checkbox') return { type: 'checkbox', value: false };
  if (type === 'number') return { type: 'number', value: 0 };
  return { type: 'text', value: '' };
}

/**
 * @param {number} rows
 * @param {number} cols
 */
export function createTableGrid(rows = 3, cols = 3) {
  const r = Math.max(1, Math.min(50, rows | 0));
  const c = Math.max(1, Math.min(20, cols | 0));
  /** @type {{ type: string, value: any }[][]} */
  const cells = [];
  for (let i = 0; i < r; i++) {
    const row = [];
    for (let j = 0; j < c; j++) row.push(emptyCell('text'));
    cells.push(row);
  }
  return {
    rows: r,
    cols: c,
    cells,
    colWidths: Array.from({ length: c }, () => 88),
  };
}

/**
 * Ensure table shape is well-formed.
 * @param {object} table
 */
export function normalizeTable(table) {
  const base = createTableGrid(table?.rows || 3, table?.cols || 3);
  if (!table || !Array.isArray(table.cells)) return base;
  const rows = Math.max(1, table.rows || table.cells.length);
  const cols = Math.max(1, table.cols || (table.cells[0] && table.cells[0].length) || 3);
  const cells = [];
  for (let i = 0; i < rows; i++) {
    const row = [];
    for (let j = 0; j < cols; j++) {
      const src = table.cells[i] && table.cells[i][j];
      if (!src || typeof src !== 'object') {
        row.push(emptyCell('text'));
      } else {
        const type = ['text', 'number', 'checkbox'].includes(src.type) ? src.type : 'text';
        let value = src.value;
        if (type === 'checkbox') value = !!value;
        else if (type === 'number') value = Number(value) || 0;
        else value = String(value ?? '');
        row.push({ type, value });
      }
    }
    cells.push(row);
  }
  const colWidths = Array.from({ length: cols }, (_, j) =>
    Math.max(48, Number(table.colWidths && table.colWidths[j]) || 88)
  );
  return { rows, cols, cells, colWidths };
}

/**
 * Set a single cell (immutable).
 */
export function setCell(table, row, col, cell) {
  const t = normalizeTable(table);
  if (row < 0 || col < 0 || row >= t.rows || col >= t.cols) return t;
  const cells = t.cells.map((r, i) =>
    i === row ? r.map((c, j) => (j === col ? { ...cell } : c)) : r.slice()
  );
  return { ...t, cells };
}

/**
 * Resize grid, preserving overlapping cells.
 */
export function resizeTable(table, rows, cols) {
  const t = normalizeTable(table);
  const next = createTableGrid(rows, cols);
  for (let i = 0; i < next.rows; i++) {
    for (let j = 0; j < next.cols; j++) {
      if (i < t.rows && j < t.cols) next.cells[i][j] = { ...t.cells[i][j] };
    }
  }
  next.colWidths = Array.from({ length: next.cols }, (_, j) =>
    j < t.colWidths.length ? t.colWidths[j] : 88
  );
  return next;
}

/**
 * Very small formula set: =SUM(r1c1:r2c2) using 0-based numeric ranges
 * or =SUM(col) for a whole column index.
 * Non-formula cells return as-is.
 */
export function evaluateCellDisplay(table, row, col) {
  const t = normalizeTable(table);
  const cell = t.cells[row][col];
  if (cell.type !== 'text') return cell.value;
  const s = String(cell.value || '');
  if (!s.startsWith('=')) return s;
  const m = s.match(/^=SUM\(\s*(\d+)\s*,\s*(\d+)\s*:\s*(\d+)\s*,\s*(\d+)\s*\)$/i);
  if (m) {
    const r0 = +m[1];
    const c0 = +m[2];
    const r1 = +m[3];
    const c1 = +m[4];
    let sum = 0;
    for (let i = Math.min(r0, r1); i <= Math.max(r0, r1); i++) {
      for (let j = Math.min(c0, c1); j <= Math.max(c0, c1); j++) {
        if (i === row && j === col) continue;
        if (i < t.rows && j < t.cols) {
          const v = t.cells[i][j];
          if (v.type === 'number') sum += Number(v.value) || 0;
          else if (v.type === 'text' && !String(v.value).startsWith('=')) {
            const n = Number(v.value);
            if (!Number.isNaN(n)) sum += n;
          }
        }
      }
    }
    return sum;
  }
  return s;
}
