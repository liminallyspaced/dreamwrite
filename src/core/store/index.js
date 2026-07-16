/**
 * Platen document store — command stack, subscribe, session.
 * Pure core: no DOM, no Electron.
 *
 * @see docs/architecture/store-design.md
 */
import { createHistory, DEFAULT_MAX_DEPTH, DEFAULT_MERGE_WINDOW_MS } from './history.js';
import { prepare, applyCommand, invertCommand, registry } from './commands.js';

/**
 * @param {{ project: object, session?: object }} initial
 * @param {{ maxDepth?: number, mergeWindowMs?: number }} [opts]
 */
export function createStore(initial, opts = {}) {
  if (!initial || !initial.project) {
    throw new Error('createStore requires { project }');
  }

  let project = initial.project;
  let session = {
    filePath: null,
    dirty: false,
    activeBlockId: null,
    view: 'script',
    ...(initial.session || {}),
  };

  const history = createHistory({
    maxDepth: opts.maxDepth ?? DEFAULT_MAX_DEPTH,
    mergeWindowMs: opts.mergeWindowMs ?? DEFAULT_MERGE_WINDOW_MS,
  });

  /** @type {Set<Function>} */
  const listeners = new Set();

  function notify(event) {
    const state = getState();
    for (const fn of listeners) {
      try {
        fn(state, event);
      } catch (err) {
        // Subscribers must not break the store
        console.error('[store] subscriber error', err);
      }
    }
  }

  function getState() {
    return {
      project,
      session: { ...session },
    };
  }

  /**
   * @param {{ type: string, payload?: object, label?: string, mergeKey?: string }} command
   */
  function execute(command) {
    if (!command || !command.type) {
      return { ok: false, error: 'Command requires type' };
    }
    const type = command.type;
    const payload = command.payload || {};
    const prep = prepare(type, project, payload);
    if (prep.error === 'noop') {
      return { ok: true, noop: true };
    }
    if (prep.error) {
      return { ok: false, error: prep.error };
    }

    const next = applyCommand(type, project, payload);
    if (next === project) {
      return { ok: true, noop: true };
    }

    project = next;
    session = { ...session, dirty: true };

    history.push({
      do: { type, payload },
      undo: { type, payload: prep.inversePayload },
      label: command.label || prep.label || registry[type]?.label || type,
      mergeKey: command.mergeKey ?? prep.mergeKey,
      at: Date.now(),
    });

    notify({ type: 'execute', commandType: type, label: command.label || prep.label });
    return { ok: true };
  }

  function undo() {
    const entry = history.popUndo();
    if (!entry) return { ok: false, error: 'Nothing to undo' };
    // Inverse payload is interpreted by the original command's invert(),
    // not re-applied as a forward command (insert≠remove shape).
    project = invertCommand(entry.do.type, project, entry.undo.payload);
    session = { ...session, dirty: true };
    notify({ type: 'undo', label: entry.label });
    return { ok: true, label: entry.label };
  }

  function redo() {
    const entry = history.popRedo();
    if (!entry) return { ok: false, error: 'Nothing to redo' };
    project = applyCommand(entry.do.type, project, entry.do.payload);
    session = { ...session, dirty: true };
    notify({ type: 'redo', label: entry.label });
    return { ok: true, label: entry.label };
  }

  /**
   * Load / new / import — replaces document identity, clears undo stacks.
   * @param {object} nextProject
   * @param {object} [sessionPatch]
   */
  function resetDocument(nextProject, sessionPatch = {}) {
    project = nextProject;
    session = {
      ...session,
      dirty: false,
      activeBlockId: null,
      ...sessionPatch,
    };
    history.clear();
    notify({ type: 'reset' });
  }

  function setSession(patch) {
    session = { ...session, ...patch };
    notify({ type: 'session' });
  }

  function markClean() {
    session = { ...session, dirty: false };
    notify({ type: 'session' });
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return {
    getState,
    getProject: () => project,
    subscribe,
    execute,
    undo,
    redo,
    canUndo: () => history.canUndo(),
    canRedo: () => history.canRedo(),
    undoLabel: () => history.undoLabel(),
    redoLabel: () => history.redoLabel(),
    resetDocument,
    setSession,
    markClean,
    // testing
    _history: history,
  };
}

export { registry } from './commands.js';
export { createHistory, DEFAULT_MAX_DEPTH, DEFAULT_MERGE_WINDOW_MS } from './history.js';
