/**
 * Tests for local autosave.
 *
 * The bug being fixed here (docs/plan/00-findings.md §5.5 #1) was invisible: a
 * QuotaExceededError swallowed by a bare `catch {}`, after which autosave stopped
 * forever with no feedback. So these tests use a fake storage with a REAL enforced
 * quota — the eviction and reporting paths are exercised, not assumed.
 */
import { describe, it, expect } from 'vitest';
import {
  AUTOSAVE_KEY,
  HISTORY_KEY,
  LEGACY_AUTOSAVE_KEY,
  splitProject,
  buildAutosavePayload,
  writeAutosave,
  readAutosave,
  autosaveBytes,
} from '../../src/core/persist/autosave.js';

/** localStorage stand-in that enforces a byte budget, like the real thing. */
function fakeStorage({ quota = Infinity } = {}) {
  const map = new Map();
  const used = (skip) => {
    let n = 0;
    for (const [k, v] of map) if (k !== skip) n += v.length;
    return n;
  };
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    removeItem: (k) => map.delete(k),
    setItem: (k, v) => {
      if (used(k) + v.length > quota) {
        const err = new Error('quota');
        err.name = 'QuotaExceededError';
        throw err;
      }
      map.set(k, v);
    },
  };
}

/** Storage that is present but rejects everything (Safari private mode, etc). */
function hostileStorage() {
  return {
    getItem: () => null,
    removeItem: () => {},
    setItem: () => {
      throw new Error('SecurityError: storage disabled');
    },
  };
}

const project = (over = {}) => ({
  version: 1,
  format: 'platen',
  blocks: [{ id: 'b1', type: 'action', text: 'Sarah enters.' }],
  history: [],
  ...over,
});

const bigHistory = (n = 30) =>
  Array.from({ length: n }, (_, i) => ({
    label: `edit ${i}`,
    blocks: [{ id: 'b1', type: 'action', text: 'x'.repeat(500) }],
  }));

describe('splitProject', () => {
  it('separates history from the rest', () => {
    const { core, history } = splitProject(project({ history: bigHistory(2) }));
    expect(core.history).toBeUndefined();
    expect(history).toHaveLength(2);
    expect(core.blocks).toHaveLength(1);
  });

  it('tolerates a missing or malformed history', () => {
    expect(splitProject({ blocks: [] }).history).toEqual([]);
    expect(splitProject({ history: 'nonsense' }).history).toEqual([]);
    expect(splitProject(null).history).toEqual([]);
  });
});

describe('buildAutosavePayload', () => {
  it('carries NO history — this is the whole point', () => {
    // The inherited version serialised 30 deep copies of every block on every
    // keystroke. That is what blew the quota.
    const payload = buildAutosavePayload({
      project: project({ history: bigHistory() }),
      filePath: '/x.platen',
      dirty: true,
      savedAt: 'now',
    });
    expect(payload.project.history).toBeUndefined();
    expect(JSON.stringify(payload)).not.toContain('edit 0');
  });

  it('keeps the payload small even with a huge history attached', () => {
    const withHistory = JSON.stringify(
      buildAutosavePayload({ project: project({ history: bigHistory() }), savedAt: 'now' })
    );
    const without = JSON.stringify(
      buildAutosavePayload({ project: project({ history: [] }), savedAt: 'now' })
    );
    expect(withHistory.length).toBe(without.length);
  });
});

describe('writeAutosave', () => {
  it('stores project and history under separate keys', () => {
    const s = fakeStorage();
    const r = writeAutosave(s, { project: project({ history: bigHistory(2) }), savedAt: 'now' });
    expect(r.ok).toBe(true);
    expect(r.historySaved).toBe(true);
    expect(s.getItem(AUTOSAVE_KEY)).toBeTruthy();
    expect(s.getItem(HISTORY_KEY)).toBeTruthy();
  });

  it('does not write the legacy key', () => {
    const s = fakeStorage();
    writeAutosave(s, { project: project(), savedAt: 'now' });
    expect(s.getItem(LEGACY_AUTOSAVE_KEY)).toBeNull();
  });

  it('DELETES a stale legacy key so it cannot shadow fresh work', () => {
    // The old read path checked the legacy key FIRST (app.js:313). Leaving a stale
    // one behind would silently resurrect an old draft over the real one.
    const s = fakeStorage();
    s.setItem(LEGACY_AUTOSAVE_KEY, JSON.stringify({ project: project(), filePath: null }));
    writeAutosave(s, { project: project(), savedAt: 'now' });
    expect(s.getItem(LEGACY_AUTOSAVE_KEY)).toBeNull();
  });

  it('evicts history and still saves the draft when quota is tight', () => {
    // THE regression that matters: the draft must survive at history's expense.
    const s = fakeStorage({ quota: 900 });
    s.setItem(HISTORY_KEY, 'x'.repeat(800)); // hogging the budget

    const r = writeAutosave(s, { project: project({ history: bigHistory() }), savedAt: 'now' });

    expect(r.ok).toBe(true);
    expect(r.evictedHistory).toBe(true);
    expect(s.getItem(AUTOSAVE_KEY)).toBeTruthy(); // the draft lived
    expect(s.getItem(HISTORY_KEY)).toBeNull(); // the snapshots did not
  });

  it('REPORTS failure instead of swallowing it when even the draft will not fit', () => {
    // The original did `catch { /* quota */ }` here and returned nothing.
    const s = fakeStorage({ quota: 10 });
    const r = writeAutosave(s, { project: project(), savedAt: 'now' });

    expect(r.ok).toBe(false);
    expect(r.reason).toBe('quota');
    expect(r.error).toBeInstanceOf(Error);
  });

  it('reports unavailable storage rather than throwing', () => {
    const r = writeAutosave(hostileStorage(), { project: project(), savedAt: 'now' });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('unavailable');
  });

  it('never throws, whatever the storage does', () => {
    expect(() => writeAutosave(hostileStorage(), { project: project(), savedAt: 'now' })).not.toThrow();
    expect(() => writeAutosave(fakeStorage({ quota: 0 }), { project: project(), savedAt: 'now' })).not.toThrow();
  });

  it('a failed history write does not fail the save', () => {
    const s = fakeStorage({ quota: 400 });
    const r = writeAutosave(s, { project: project({ history: bigHistory() }), savedAt: 'now' });
    expect(r.ok).toBe(true);
    expect(r.historySaved).toBe(false);
  });
});

describe('readAutosave', () => {
  it('round-trips a project with its history', () => {
    const s = fakeStorage();
    const p = project({ history: bigHistory(3) });
    writeAutosave(s, { project: p, filePath: '/a.platen', dirty: true, savedAt: 'now' });

    const back = readAutosave(s);
    expect(back.project.blocks).toEqual(p.blocks);
    expect(back.project.history).toHaveLength(3);
    expect(back.filePath).toBe('/a.platen');
    expect(back.dirty).toBe(true);
  });

  it('prefers the current key over the legacy one', () => {
    // Opposite of the inherited order, and it matters: legacy is no longer written,
    // so preferring it would mean always loading a stale draft.
    const s = fakeStorage();
    s.setItem(LEGACY_AUTOSAVE_KEY, JSON.stringify({ project: project({ blocks: [{ id: 'old', type: 'action', text: 'STALE' }] }) }));
    s.setItem(AUTOSAVE_KEY, JSON.stringify({ project: project({ blocks: [{ id: 'new', type: 'action', text: 'FRESH' }] }) }));

    expect(readAutosave(s).project.blocks[0].text).toBe('FRESH');
  });

  it('still reads a legacy payload when nothing newer exists (upgrade path)', () => {
    const s = fakeStorage();
    s.setItem(
      LEGACY_AUTOSAVE_KEY,
      JSON.stringify({ project: project({ history: bigHistory(2) }), filePath: '/old.sdesk' })
    );
    const back = readAutosave(s);
    expect(back.filePath).toBe('/old.sdesk');
    expect(back.project.history).toHaveLength(2); // inline history recovered
  });

  it('returns null rather than throwing on corrupt data', () => {
    const s = fakeStorage();
    s.setItem(AUTOSAVE_KEY, '{not json');
    expect(readAutosave(s)).toBeNull();
  });

  it('survives corrupt history without losing the draft', () => {
    const s = fakeStorage();
    writeAutosave(s, { project: project(), savedAt: 'now' });
    s.setItem(HISTORY_KEY, '{{{broken');

    const back = readAutosave(s);
    expect(back.project.blocks).toHaveLength(1); // draft intact
    expect(back.project.history).toEqual([]);
  });

  it('returns null when empty', () => {
    expect(readAutosave(fakeStorage())).toBeNull();
  });
});

describe('autosaveBytes', () => {
  it('reports the footprint', () => {
    const s = fakeStorage();
    writeAutosave(s, { project: project({ history: bigHistory(2) }), savedAt: 'now' });
    expect(autosaveBytes(s)).toBeGreaterThan(0);
  });
});
