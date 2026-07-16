/**
 * Interactive undo/redo stack.
 * Pure. No DOM. Entries hold do/undo command envelopes, not full document clones.
 *
 * @typedef {{ do: object, undo: object, label: string, mergeKey?: string, at: number }} HistoryEntry
 */

export const DEFAULT_MAX_DEPTH = 100;
export const DEFAULT_MERGE_WINDOW_MS = 1000;

/**
 * @param {{ maxDepth?: number, mergeWindowMs?: number }} [opts]
 */
export function createHistory(opts = {}) {
  const maxDepth = opts.maxDepth ?? DEFAULT_MAX_DEPTH;
  const mergeWindowMs = opts.mergeWindowMs ?? DEFAULT_MERGE_WINDOW_MS;

  /** @type {HistoryEntry[]} */
  let undoStack = [];
  /** @type {HistoryEntry[]} */
  let redoStack = [];

  return {
    get mergeWindowMs() {
      return mergeWindowMs;
    },

    /**
     * @param {HistoryEntry} entry
     * @param {{ force?: boolean }} [options]
     */
    push(entry, options = {}) {
      const force = options.force === true;
      const now = entry.at ?? Date.now();
      const e = { ...entry, at: now };

      if (!force && e.mergeKey && undoStack.length) {
        const prev = undoStack[undoStack.length - 1];
        if (
          prev.mergeKey === e.mergeKey &&
          now - prev.at <= mergeWindowMs &&
          prev.do?.type === e.do?.type
        ) {
          // Keep earliest undo inverse; adopt latest do payload.
          undoStack[undoStack.length - 1] = {
            ...prev,
            do: e.do,
            label: e.label || prev.label,
            at: now,
            mergeKey: e.mergeKey,
          };
          redoStack = [];
          return { merged: true };
        }
      }

      undoStack.push(e);
      if (undoStack.length > maxDepth) undoStack.shift();
      redoStack = [];
      return { merged: false };
    },

    canUndo() {
      return undoStack.length > 0;
    },

    canRedo() {
      return redoStack.length > 0;
    },

    peekUndo() {
      return undoStack.length ? undoStack[undoStack.length - 1] : null;
    },

    peekRedo() {
      return redoStack.length ? redoStack[redoStack.length - 1] : null;
    },

    undoLabel() {
      const e = this.peekUndo();
      return e?.label || null;
    },

    redoLabel() {
      const e = this.peekRedo();
      return e?.label || null;
    },

    /** @returns {HistoryEntry | null} */
    popUndo() {
      const e = undoStack.pop();
      if (!e) return null;
      redoStack.push(e);
      return e;
    },

    /** @returns {HistoryEntry | null} */
    popRedo() {
      const e = redoStack.pop();
      if (!e) return null;
      undoStack.push(e);
      return e;
    },

    clear() {
      undoStack = [];
      redoStack = [];
    },

    /** Test/debug only */
    _depth() {
      return { undo: undoStack.length, redo: redoStack.length };
    },
  };
}
