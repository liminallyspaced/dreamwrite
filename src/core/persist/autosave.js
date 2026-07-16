/**
 * Local autosave — payload construction and storage I/O.
 *
 * Pure except for the `storage` object handed in, so it's fully testable against a
 * fake. No DOM, no app state.
 *
 * ── Why this module exists ────────────────────────────────────────────────────
 * The inherited implementation (app.js persistLocal) had the worst bug in the
 * codebase (docs/plan/00-findings.md §5.5 #1):
 *
 *   - It serialised the WHOLE project — including history[], up to 30 deep copies
 *     of every block (engine.js:907) — on every keystroke's autosave.
 *   - It wrote that payload to TWO localStorage keys, doubling it.
 *   - It swallowed the resulting QuotaExceededError with a bare `catch {}`.
 *
 * Past a certain script length, autosave stopped. Forever. Silently. No feedback.
 *
 * ── The design ────────────────────────────────────────────────────────────────
 * Two rules, both load-bearing:
 *
 *  1. THE USER'S CURRENT WORK MUST NEVER FAIL TO SAVE BECAUSE OF OLD SNAPSHOTS.
 *     History is written under its own key. The project payload carries no history
 *     at all, so it stays small and bounded. If quota is hit, history is evicted
 *     and the project is retried alone — a snapshot is worth less than the draft.
 *     This is ADR-0004's "revisions live outside the document", applied here.
 *
 *  2. FAILURES ARE RETURNED, NEVER SWALLOWED. Callers must surface them.
 */

export const AUTOSAVE_KEY = 'platen.autosave';
export const HISTORY_KEY = 'platen.autosave.history';

/**
 * Superseded key. Still READ (so a project autosaved by an older build survives an
 * upgrade), never written. It is deleted on the first successful write — otherwise
 * a stale copy would shadow fresh work forever, because the old read path checked
 * it FIRST (app.js:313).
 */
export const LEGACY_AUTOSAVE_KEY = 'scriptdesk.autosave';

/**
 * Split a project into the always-save part and the best-effort part.
 * @returns {{ core: object, history: unknown[] }}
 */
export function splitProject(project) {
  const { history, ...core } = project || {};
  return { core, history: Array.isArray(history) ? history : [] };
}

/** @returns {{ project: object, filePath: string|null, dirty: boolean, savedAt: string }} */
export function buildAutosavePayload({ project, filePath, dirty, savedAt }) {
  const { core } = splitProject(project);
  return {
    project: core,
    filePath: filePath || null,
    dirty: !!dirty,
    savedAt,
  };
}

function isQuotaError(err) {
  if (!err) return false;
  // Browsers disagree on the shape; check all the spellings.
  return (
    err.name === 'QuotaExceededError' ||
    err.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    err.code === 22 ||
    err.code === 1014
  );
}

/**
 * Persist the project, and history on a best-effort basis.
 *
 * Never throws. Always returns a result the caller is expected to surface.
 *
 * @returns {{ ok: boolean, bytes: number, historySaved: boolean, evictedHistory: boolean,
 *             reason?: 'quota'|'unavailable', error?: Error }}
 */
export function writeAutosave(storage, { project, filePath, dirty, savedAt }) {
  const { history } = splitProject(project);
  const payload = buildAutosavePayload({ project, filePath, dirty, savedAt });
  const serialized = JSON.stringify(payload);

  let evictedHistory = false;

  // The draft first. It is the thing that must not be lost.
  try {
    storage.setItem(AUTOSAVE_KEY, serialized);
  } catch (err) {
    if (!isQuotaError(err)) {
      return { ok: false, bytes: 0, historySaved: false, evictedHistory, reason: 'unavailable', error: err };
    }
    // Out of room. Evict history and retry — a snapshot is worth less than the draft.
    try {
      storage.removeItem(HISTORY_KEY);
      evictedHistory = true;
      storage.setItem(AUTOSAVE_KEY, serialized);
    } catch (err2) {
      return {
        ok: false,
        bytes: serialized.length,
        historySaved: false,
        evictedHistory,
        reason: 'quota',
        error: err2,
      };
    }
  }

  // A stale legacy entry would shadow what we just wrote. Remove it.
  try {
    storage.removeItem(LEGACY_AUTOSAVE_KEY);
  } catch {
    // Non-fatal: the read path prefers AUTOSAVE_KEY anyway.
  }

  // History is best-effort by design. Failing to store it must not fail the save.
  let historySaved = false;
  if (!evictedHistory && history.length) {
    try {
      storage.setItem(HISTORY_KEY, JSON.stringify(history));
      historySaved = true;
    } catch (err) {
      if (isQuotaError(err)) {
        try {
          storage.removeItem(HISTORY_KEY);
        } catch {
          /* nothing more to do */
        }
        evictedHistory = true;
      }
    }
  }

  return { ok: true, bytes: serialized.length, historySaved, evictedHistory };
}

/**
 * Read the autosave back, recombining history.
 *
 * Prefers the current key over the legacy one — the OPPOSITE of the inherited read
 * order (app.js:313 checked legacy first). With the legacy key no longer written,
 * checking it first would resurrect a stale draft over the real one.
 *
 * @returns {{ project: object, filePath: string|null, dirty: boolean, savedAt?: string }|null}
 */
export function readAutosave(storage) {
  let raw = null;
  try {
    raw = storage.getItem(AUTOSAVE_KEY) || storage.getItem(LEGACY_AUTOSAVE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return null; // corrupt — treat as absent rather than throwing on boot
  }
  if (!data || !data.project) return null;

  let history = [];
  try {
    const rawHistory = storage.getItem(HISTORY_KEY);
    if (rawHistory) {
      const parsed = JSON.parse(rawHistory);
      if (Array.isArray(parsed)) history = parsed;
    }
  } catch {
    // History is best-effort on the way in too. A corrupt snapshot list must not
    // cost the user their draft.
  }

  // A legacy payload still carries its history inline; keep it if we found none.
  if (!history.length && Array.isArray(data.project.history)) {
    history = data.project.history;
  }

  return {
    project: { ...data.project, history },
    filePath: data.filePath || null,
    dirty: !!data.dirty,
    savedAt: data.savedAt,
  };
}

/** Approximate footprint, for diagnostics. */
export function autosaveBytes(storage) {
  let total = 0;
  for (const key of [AUTOSAVE_KEY, HISTORY_KEY, LEGACY_AUTOSAVE_KEY]) {
    try {
      const v = storage.getItem(key);
      if (v) total += v.length;
    } catch {
      /* ignore */
    }
  }
  return total;
}
