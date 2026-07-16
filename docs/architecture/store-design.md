# Design: `core/store/` + command stack

**Status:** Approved and implemented (core + unit tests + script wiring)  
**Date:** 2026-07-16  
**Phase:** 1 (keystone; blocks app.js split, board, timeline)  
**Baseline:** `20de5ed` (post Phase 0 + data-loss fixes). Do not re-open ADRs.

**Knobs (approved):** merge 1000ms · maxDepth 100 · no native CE undo · Replace All full inverse.

---

## Why this first

From `02-handoff.md`:

| Depends on the store | Why |
|----------------------|-----|
| **Undo** | No stack exists. Chromium `{role:'undo'}` dies on every `renderBlocks` (`innerHTML = ''`). |
| **app.js split** | ~64 functions close over `state`/`els`. Store makes the split mechanical. |
| **Board + timeline** | Canvas without undo is unusable; retrofitting after two surfaces = rewrite twice. |

Thesis constraint: mutations that will eventually touch **script + board + timeline** (rename, delete scene) must be **one atomic undoable command**. Design that now even if only script mutations ship first.

---

## Goals / non-goals

### Goals
1. Every **document** mutation is undoable/redoable through one API.
2. `core/` stays pure — **no DOM**, no Electron, no `window`.
3. Subscribe-based projections so views re-render without reaching into a god object.
4. Coalesce continuous typing into one undo step (industry editor expectation).
5. Revision restore becomes **one command**, not a snapshot side-effect.
6. Files under 800 lines; unit-testable without Electron.

### Non-goals (this increment)
- Entity graph v2 schema (ADR-0003) — design leaves a slot; **do not mint entities yet**.
- Pagination engine (next after store; ADR-0006).
- Splitting all of `app.js` — only enough wiring to prove undo on 3–5 mutations.
- Board/timeline surfaces.

---

## Shape of application state

Two layers. Only the first is command-history material.

```js
// Store snapshot (what getState() returns)
{
  // ── Document (undoable) ─────────────────────────────────
  project: {
    version: 1,           // stay on v1 until ADR-0004 migration
    format: 'platen',
    titlePage: { ... },
    blocks: [ { id, type, text } ],
    characters: [ ... ],
    locations: [ ... ],
    cards: [ ... ],
    notes: '',
    settings: { theme, pageTarget },
    // history: REMOVED from live document path (autosave already splits it)
    createdAt, updatedAt,
  },

  // ── Session (NOT on the undo stack) ─────────────────────
  session: {
    filePath: string | null,
    dirty: boolean,
    activeBlockId: string | null,
    view: 'script' | 'cards' | ...,
    // focus mode stays in ui-chrome; not duplicated here
  },
}
```

**Rule:** if undoing it would surprise the writer ("I undid and jumped views"), it is **session**, not a command.  
**Rule:** if undoing it restores prose or structure, it is a **command**.

Revision *snapshots* remain outside the document payload (ADR-0004 / autosave split) under a separate key or later a folder; the command stack is for interactive undo, not long-term revision storage.

---

## Module layout

```
src/core/store/
  index.js          // createStore({ project, session? }) → store API
  history.js        // stack: undo[] / redo[], push, undo, redo, clear, peek
  commands.js       // defineCommand, execute, dispatch helpers
  apply.js          // pure: applyCommand(project, cmd) → project  (optional thin)
  mutations/
    blocks.js       // insertBlock, removeBlock, setBlockText, setBlockType, moveBlock
    cards.js        // syncCards (merge), updateCard, addCard
    bible.js        // characters / locations CRUD
    meta.js         // titlePage, notes, settings
    compound.js     // restoreRevision, replaceAll, (later: renameCharacter)
```

| File | Max role |
|------|----------|
| `index.js` | createStore, getState, subscribe, replaceProject (load), get history API |
| `history.js` | pure stack ops; configurable `maxDepth` (default 100 interactive steps) |
| `commands.js` | registry + `execute(store, command)` / `undo` / `redo` |
| `mutations/*` | pure functions: `(project, payload) → project` — no I/O |

No DOM. No IPC. Tests import these directly.

---

## Command contract

Every command is a **plain object** plus pure apply/invert functions (not classes).

```js
/**
 * @typedef {object} Command
 * @property {string} type          // e.g. 'blocks.setText'
 * @property {string} label         // human: "Typing", "Delete block", "Restore revision"
 * @property {object} payload       // serializable
 * @property {string} [mergeKey]    // if set, may coalesce with previous same key
 * @property {number} [mergeWindowMs] // default 1000 for typing
 */

// Registry entry:
{
  type: 'blocks.setText',
  // Pure: project → project
  apply(project, payload) → project,
  // Pure invert: given pre-image facts in payload, project → project
  invert(project, payload) → project,
  // Optional: can this command merge with the previous on the stack?
  canMerge(prevCmd, nextCmd) → boolean,
  merge(prevCmd, nextCmd) → Command,  // usually keep prev.undo payload, next.do payload
}
```

### Invert strategy: **explicit inverse payload** (not full document snapshots)

On `execute`:

1. Read current `project`.
2. Build `inversePayload` from current state (e.g. previous text of that block).
3. `next = apply(project, payload)`.
4. Push `{ do: { type, payload }, undo: { type, payload: inversePayload }, label, mergeKey }` onto undo stack.
5. Clear redo stack.
6. Set `session.dirty = true`, bump `updatedAt`.
7. Notify subscribers.

**Why not full-project snapshots per keystroke?**  
Autosave already proved that deep-copying the whole script into history is how quota dies. Inverse payloads stay small. Structural commands still only store the affected ids + before values.

**Exception — rare bulk ops** (`restoreRevision`, import replace):  
Store one compressed snapshot of `blocks` (or full project core) in the inverse payload. Label clearly. Still one stack entry.

---

## Command catalogue (Phase 1 minimum)

Ship these first; wire app.js only for these paths.

| type | label example | Notes |
|------|---------------|--------|
| `blocks.setText` | Typing | mergeKey: `block:${id}` |
| `blocks.setType` | Change to Dialogue | no merge |
| `blocks.insert` | Insert block | payload: `{ index, block }` |
| `blocks.remove` | Delete block | payload: `{ index, block }` (full block for undo) |
| `blocks.replaceAll` | Replace all | inverse: previous texts map or full blocks snapshot |
| `meta.setTitlePage` | Title page | field-level or whole object |
| `meta.setNotes` | Notes | mergeable like typing |
| `cards.update` | Edit card | |
| `cards.syncFromScenes` | Sync cards | uses `engine.syncCardsFromScenes`; undo = previous cards array |
| `project.restoreRevision` | Restore revision | **one command**; inverse = current blocks before restore |
| `project.replace` | Load / New / Import | clears undo stack (new document identity) |

Later (not Phase 1): `entity.renameCharacter` (atomic across views), board/timeline moves.

---

## Typing vs structural edits

```
 contenteditable input
        │
        ▼
  local draft (DOM + optional pendingText map)
        │
        ├─ blur / Tab / Enter / setType / leave block
        │       → flush: commands.execute(setText)
        │
        └─ merge window: repeated setText same mergeKey
                → single undo step "Typing"
```

**On structural edit** (Enter, Backspace-delete-block, type change):  
1. Flush pending text for active block as `setText` (if changed).  
2. Execute structural command.  
3. Then `renderBlocks` — Chromium native undo wipe is irrelevant; **our** stack holds truth.

**Un-wire** `main.js` `{ role: 'undo' }` / `{ role: 'redo' }` → send `menu:undo` / `menu:redo` to renderer → `store.undo()` / `store.redo()`.

Native contenteditable undo within a single focused block *between* flushes is optional nicety; we do **not** rely on it. Prefer flush-on-input-debounce (e.g. 300ms) **or** flush-before-structure only.  

**Proposal: flush-before-structure + blur + 500ms debounce** — fewer stack entries, still safe if the app crashes (autosave already has current project including unflushed… wait — if text is only in DOM, autosave must read from store).

**Critical:** autosave and Save must use **store project**, and input handler must either:
- (A) update store on every input via merged `setText`, or  
- (B) keep a `session.pendingEdits: Map<blockId, text>` that `getProjectForSave()` layers on top.

**Choose (A) with merge** — one source of truth, autosave stays dumb. Debounce not required for correctness if merge coalesces; performance: apply is O(blocks) copy — use structural sharing:

```js
function setBlockText(project, { id, text }) {
  const blocks = project.blocks.map(b => b.id === id ? { ...b, text } : b);
  return { ...project, blocks, updatedAt: now() };
}
```

---

## Store API (public)

```js
export function createStore(initial) {
  return {
    getState(),                    // { project, session }
    getProject(),                  // convenience
    subscribe(listener),           // listener(state, event)
    // Document
    execute(command),              // → { ok, error? }
    undo(),
    redo(),
    canUndo(), canRedo(),
    undoLabel(), redoLabel(),
    // Load / new document (clears stacks)
    resetDocument(project, sessionPatch?),
    // Session-only (no stack)
    setSession(patch),
  };
}
```

### Events (for subscribers)

```js
{ type: 'execute', commandType, label }
{ type: 'undo', label }
{ type: 'redo', label }
{ type: 'reset' }   // load/new/import
{ type: 'session' }
```

Views subscribe once; script view re-renders blocks when `project.blocks` identity changes; chrome updates dirty/undo menu labels from session + history.

---

## Integration plan (after approval — do not skip)

### Step 1 — implement + unit tests (no app.js wiring yet)
- `history.test.js` — push, undo, redo, clear-on-execute, maxDepth
- `commands.blocks.test.js` — setText merge, insert/remove invert
- `commands.compound.test.js` — restoreRevision round-trip

### Step 2 — thin bridge
- `src/store-host.js` (or `views/script/host.js`): owns the singleton store created at boot.
- `renderer.js` creates store from empty project; passes to app init.
- **Do not** put store on `window` long-term; temporary `window.__platenStore` only if smoke needs it (prefer importing).

### Step 3 — wire 5 mutations in app.js (smoke each)
1. `setBlockType`  
2. `insertAfter` / `blocks.insert`  
3. `blocks.remove` (backspace empty)  
4. `setText` flush on blur + before structure  
5. `restoreRevision` as single command  

Menu: Undo / Redo → store.

### Step 4 — `npm run test:all` + smoke **3×**

### Step 5 — commit: `feat(store): command stack with undo/redo for script mutations`

Then pagination (ADR-0006), then continue splitting app.js against the store.

---

## What stays outside the store

| Concern | Where |
|---------|--------|
| DOM / contenteditable | `views/script/block-dom.js`, app.js (until split) |
| Rails, focus modes, radial, sounds | `ui-chrome.js` |
| Autosave I/O | `core/persist/autosave.js` — **call with store.getProject()** |
| File IPC | main.js / preload |
| Pagination (next) | `core/script/paginate.js` — pure; store does not call it inside commands |

Radial and ribbon must call `store.execute`, never mutate `state.project` directly (fixes the path that made silent radial edits unrecoverable — still fix radial dismiss bug separately in Phase 2).

---

## Testing strategy

| Layer | Proves |
|-------|--------|
| Unit: history + mutations | invert(apply(p)) === p for each command |
| Unit: merge | 10 setText same block → 1 undo |
| Smoke: after wiring | type, Enter, undo, assert block text/structure |
| **Not enough** | green unit alone — smoke must touch editor (existing rule) |

---

## Open points for you (not invented)

1. **Merge window** — propose **1000ms** same `mergeKey`; adjustable. OK?
2. **maxDepth** — propose **100** interactive commands (not full project clones). OK?
3. **Native CE undo within a block before flush** — propose **ignore**; always our stack. Slightly different feel mid-word; simpler and correct across Enter. OK?
4. **Replace All** — one stack entry with full `blocks` before snapshot (can be large). Alternative: refuse undo for replace-all and force revision snapshot first — **worse**. Prefer full inverse snapshot labeled "Replace all".

---

## Success criteria for this increment

- [ ] `core/store/**` pure, unit tested, no DOM  
- [ ] Edit → Undo → Redo restores structure **and** text for wired paths  
- [ ] Enter no longer permanently loses undo  
- [ ] Revision restore is one undoable command  
- [ ] Menu Undo/Redo owned by us  
- [ ] `npm run test:all` green; smoke 3× after load-order touch  
- [ ] Files &lt; 800 lines  
- [ ] Commit message states what was verified and how  

---

## Explicitly not in this design

- Fourth page-count algorithm  
- Migrating `.platen` in place  
- Entity minting  
- Dual-dialogue geometry  
- Network/fetch  

---

**Stop here until design is approved.** Next message after approval: implement `core/store/` + tests only, then wire.
