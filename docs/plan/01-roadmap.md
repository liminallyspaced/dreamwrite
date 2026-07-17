# HISTORICAL — do not treat as current

**Superseded 2026-07-17** by `docs/plan/03-master-plan.md`.
The four load-bearing cracks described below were fixed in Phases 0–5.
Read the master plan + `docs/architecture/decisions/` for current truth.

---

# Platen — Build Roadmap

**Date:** 2026-07-16
**Read first:** `00-findings.md` (what's broken and why)
**Specs:** `../spec/pagination.md` · `../spec/timeline.md` · `../spec/board.md`
**Decisions:** `../architecture/decisions/`

---

## The thesis

> **One entity, three views.**
> A scene *is* a script block *and* a board card *and* a timeline event.
> Rename a character once; it updates everywhere.

This is the only reason to build this instead of using Final Draft + Milanote + Aeon Timeline. Those three tools cannot do it, because they are three tools. Everything below is organised around that sentence.

If a feature doesn't serve either **(a)** removing screenwriting error/toil, or **(b)** the entity link, it's a nice-to-have and goes last.

---

## Sequencing (decided)

**Foundation → Wheel → Timeline → Board → Milanote-completeness.**

The board and timeline are not blocked by their own difficulty. They're blocked by **undo, binary assets, and the file format** — all foundation concerns. Building them first means building them twice.

Timeline before board because it is **fully specified** (we have the reference clip), **smaller**, and it is *a constrained board* — it validates the shared kernel at lower cost.

```
Phase 0  Scaffolding      make change safe            no user-visible change
Phase 1  Trust            page count becomes TRUE     ★ the product fix
Phase 2  The Wheel        eyes-free writing           ★ the daily-driver fix
Phase 3  Timeline         the clip, in ink            ★ new surface (+ kernel)
Phase 4  Board            Milanote, offline, linked   ★ new surface
Phase 5  Completeness     templates, clipper, stock   opt-in / online
```

---

## Phase 0 — Scaffolding

*Goal: make it possible to change this codebase safely. No user-visible change.*

Right now there are no modules, no tests, and a 1,939-line `app.js`. Everything after this phase is harder without it, and it's cheap.

- **esbuild** (one devDependency, ~10ms builds). `npm run dev` watches, `npm run build` bundles.
  - *Why a bundler at all:* native ESM is blocked over `file://`, which is how `loadFile` serves the app. Alternative is serving over a custom `app://` protocol — attractive (we need a custom protocol anyway for assets, ADR-0004) but esbuild also unlocks npm packages. Chose esbuild; see ADR-0006.
- **vitest** + first tests.
- **Split `app.js`** into modules — mechanical, behaviour-preserving, no logic changes:

```
src/
  core/            ← pure. no DOM. 100% unit-testable. THIS is where correctness lives
    model/         project schema, entities, ids, migrate
    store/         store, commands (do/undo), history
    script/        format constants, wrap, paginate, lint, fountain/, pdf
    time/          calendar, pack
    geom/          camera, rect, spatial      ← the shared kernel
  views/           script/ board/ timeline/ cards/ bible/
  ui/              radial/ chrome/ components/
  assets/          content-addressed asset store
```

  The `core/` boundary is the whole point: **no DOM in `core/`**, so it can be tested without a browser. Pagination is a pure function of blocks → pages. That's exactly what TDD is good at.
- Delete `styles.legacy.css` (1,473 lines, unreferenced) — or link it if it's actually live. Verify first.

**Done when:** `npm test` runs, `npm run dev` hot-rebuilds, app behaves identically, no file >800 lines.

**Skills:** `ecc:architect` (module boundaries) · `ecc:refactor-cleaner` (dead code — it has knip/depcheck/ts-prune) · `ecc:typescript-reviewer` (review the split)

---

### Phase 0 — status (2026-07-16)

**Done:**
- ✅ esbuild (`build.js`, ~20ms) + vitest + jsdom. `npm run dev` watches; `npm run test:all` runs both suites.
- ✅ `engine.js` → ESM. Logic untouched; only the `window.ScriptEngine` tail changed.
  `engine-global.js` is a **temporary shim** — delete it when `app.js` imports the engine directly.
- ✅ 16 **characterization** tests pinning current engine behaviour, bugs included and tagged `BUG:`.
- ✅ Deleted `styles.legacy.css` (1,473 lines, verified unreferenced).
- ✅ Extracted `views/script/block-dom.js` (6 leaf functions) + 15 jsdom tests. app.js 1,939 → 1,869.
- ✅ **`tests/smoke/smoke.js`** — drives the real app over CDP. 10 checks.

**⚠️ Amendment to this plan — the app.js split is NOT "mechanical"**

This phase originally said *"Split app.js into modules — mechanical, behaviour-preserving, no logic
changes."* Having done the first slice, that's only true of the **leaf functions**. The remaining ~64
functions close over a shared `state` and `els` object that every one of them reaches into. Splitting
those is a **design decision** (how is state shared — a store? DI? module singleton?), not a move.

And doing it blind is exactly the big-bang refactor Phase 0 exists to prevent: `app.js` still has **no
test coverage of its own**.

**So the order is:**
1. ✅ Smoke test first (done — it caught nothing yet, but it's the net)
2. Build `core/store/` **in Phase 1** — the command/undo stack already requires a real store (ADR-0001)
3. Split `app.js` **against that store**, one section at a time, smoke-verified per slice

**Splitting app.js is therefore folded into Phase 1, not a prerequisite for it.** The store is the
thing that makes the split mechanical; building the store first is cheaper than inventing a temporary
state-sharing scheme and then replacing it.

**Why the smoke test is non-negotiable:** the unit suite AND "Electron boots with no console errors"
both pass while the editor is completely broken — booting only renders the welcome screen. Every crack
in `00-findings.md` would have survived a green unit suite.

---

## Phase 1 — Trust ★

*Goal: the number on screen is the number in the PDF is the number the industry means — and the app stops eating work.*

### ✅ Data-loss bugs — DONE (2026-07-16, `a7ea661` + `e9a9052`)

All four fixed; the app is now safe to write in. #3 (revision restore) is **stopgapped** — it snapshots
before overwriting, but the real fix is the command stack below. Detail in `00-findings.md` §5.5.

<details>
<summary>The original four, for context</summary>

The audit surfaced four **active data-loss bugs** (`00-findings.md` §5.5). These weren't "Phase 1 work,"
they were "the app is currently unsafe to write in" work:

1. **`app.js:567-569` — autosave dies permanently and silently.** 30 deep copies of every block live
   *inside* the project; `persistLocal` writes the lot to two localStorage keys; the quota error is
   swallowed by a bare `catch {}`. Past a certain script length, autosave just stops. Forever. Silently.
2. **`app.js:547-556` — the real file is overwritten 800ms after any keystroke** with `.catch(() => {})`,
   and every main-process `fs` call is sync with no `try`/`catch`. Saves fail silently too. **Both
   persistence paths can be dead simultaneously with zero indication.**
3. **`app.js:1602` — revision restore doesn't snapshot current state first.** One `confirm()` from
   unrecoverable loss.
4. **`app.js:144-148` — "Sync from scenes" destroys every hand-written card summary**, no merge, no
   confirm, and it **auto-fires on first Cards visit**.

Fixing #1 and #2 largely falls out of ADR-0004 (revisions move out of the document; writes become async
and atomic) — but **surface the errors**. A swallowed `catch {}` on the save path is the bug behind the bug.

</details>

**What landed:** `core/persist/autosave.js` (pure, quota-tested against a fake storage that really
enforces a budget) · `writeFileAtomic` in main.js · a `#saveAlert` in the status bar · atomic async
writes throughout · `engine.syncCardsFromScenes` (merges rather than overwrites; orphans are kept).

**The principle that fell out, worth keeping:** *the user's current work must never fail to save because
of old snapshots.* On quota, history is evicted and the draft is retried alone. A snapshot is worth less
than the draft. That's ADR-0004's "revisions live outside the document" applied at the storage layer.

**Also added:** `tests/smoke/smoke.js` — 15 checks driving the real app over CDP, including that autosave
actually lands under the new key with no inlined history. It caught its own race (asserting before the
bundle evaluated) once the bundle grew.

---

### ▶ Next: `core/store/` + the command stack

This is the phase that makes Platen honest. Per `00-findings.md` Crack 1, there are **three** implementations of "page" and none is right. **The fix is not three patches. The fix is one implementation.**

```js
// core/script/wrap.js
wrap(text, columns) -> string[]           // greedy word-wrap. pure. trivially testable.

// core/script/paginate.js
paginate(blocks, format) -> Page[]        // applies break rules, emits (MORE)/(CONT'D)
  Page = { number, rows: Row[] }
  Row  = { blockId, type, text, isContinuation }
```

Then **three consumers, one source**:

| Consumer | Before | After |
|----------|--------|-------|
| Screen | one fake infinite page | renders `Page[]` → a real paper stack |
| Stats | `estimatePages()` char-count guess | `pages.length` |
| PDF | Chromium breaks wherever | renders the same `Page[]` with explicit breaks |

They agree **by construction**. That's the design.

### Work

1. `core/script/format.js` — the constants object is **written out in full** in `../spec/pagination.md` §6.
   **54 lines/page** (not 55 — `engine.js:34` is wrong); dialogue **35** chars (`engine.js:762` is right).
2. `core/script/wrap.js` — **greedy word-fitting**. Never hyphenate, never justify — ragged right, whole
   words only (both VERIFIED rules). TDD.
3. `core/script/paginate.js` — TDD. Rules are fully specced in `../spec/pagination.md` §5. Three traps:
   - **Reserve the `(MORE)` line BEFORE choosing the break point** — the classic off-by-one
   - **54 is a ceiling the break rules pull back from**, not a target. The bottom margin is a *minimum*.
     Never pad to fill.
   - **Blanks-before-scene-heading is config (default 2)** and moves feature page counts by several pages
   - Parenthetical wrap **outdents** by one char (aligns under the text, not the paren)
   - `(CONT'D)` is **injected at paginate time, never into the document model** — John August's point:
     for page breaks there's no authorial intent. Make it a toggle.
4. **Golden-file test** — take a public-domain screenplay in Fountain, paginate, assert the page count against a known-good reference. *This is the acceptance test for "we fixed pagination."* Without it, we've only moved the guess.
5. Editor renders a real multi-page stack.
6. **PDF fixes:**
   - Render from `Page[]` with explicit breaks — no more Chromium guessing
   - **Embed Courier Prime as base64 `@font-face`** in the print HTML. The PDF currently renders Courier New (findings Crack 2) and the `data:` URL origin can't reach `../assets/fonts/`, so base64 is the origin-proof fix.
   - Page numbers, top-right, from page 2
   - Replace the magic `setTimeout(350)` (`main.js:218`) with `document.fonts.ready` + an explicit ready ping. Deterministic, not a race.
7. **Undo/redo** — a real command stack. Every mutation goes through `store/commands.js`. Un-wire Chromium's `{role:'undo'}` (`main.js:59`) and own it.
   - This is a prerequisite for the board and timeline, not a nicety. It also de-fangs Replace All.
8. **Format v2** — see ADR-0004. Folder container, content-addressed assets, revisions out of the main document, **atomic** async writes (temp + rename), v1→v2 migration with backup.
9. **Binary IPC + `platen://` protocol** — see ADR-0004. Unblocks all images.

**Done when:**
- Golden-file test passes: our page count matches a reference script's known count
- The stat, the screen, and the PDF report the same number, always
- The PDF is in Courier Prime, has page numbers, and has correct `(MORE)`/`(CONT'D)`
- Ctrl+Z undoes a block delete, a type change, and a Replace All
- Killing the app mid-save never corrupts a project

**Skills:** `tdd` + `ecc:tdd-guide` (pagination is *the* TDD-shaped problem) · `ecc:architect` (command/undo design) · `verify` (drive the real app; a green unit test does not prove the PDF is right — **open the PDF and count the pages**) · `ecc:code-reviewer`

> ⚠️ The active instinct on this machine is *"verify integration-shaped features with a real end-to-end run."* PDF export is integration-shaped. Export a real script, open it, count pages, check the font. Do not trust the unit tests alone.

---

## Phase 2 — The Wheel ★

*Goal: eyes-free element switching. The thing that kills the repetitive tasks.*

Per findings Crack 4, the wheel today is a **net negative**: dismissing it silently retypes your block as a Scene Heading (`ui-chrome.js:284` — `radialIndex` inits to `0`, never resets to `-1`, so `>= 0` is always true).

### Redesign

1. **Fix the silent-apply bug.** Centre dead-zone sets `radialIndex = -1`; releasing there cancels.
2. **Release-to-select, not click-to-select.** One gesture: press MMB → flick → release. Today it's hold → release → move → click, which is a popup menu with extra steps.
3. **≤8 items per ring.** Currently 14 at 25.7° each. Marking-menu research (Kurtenbach & Buxton) puts the reliable ceiling at 8; 4 and 8 map to compass directions and become muscle memory.
4. **Contextual root** — the payload depends on where you are:

| Context | Wheel |
|---------|-------|
| Scene heading | INT. · EXT. · DAY · NIGHT · CONTINUOUS · time-of-day ▸ · … |
| Character cue | (V.O.) · (O.S.) · (CONT'D) · Dialogue · Parenthetical · Dual |
| Action | Character · Scene · Transition · Shot · Note |
| Board | Note · Image · Sub-board · Column · Arrow · Link to scene |
| Timeline | New event · New period · Link to scene · Set date · Filter · Fit |

  `buildRadial()` runs once at init today (`ui-chrome.js:196`) — it must rebuild per context.
5. **Submenus** (one level) for overflow.
6. **Marks / novice→expert continuum.** Flick *before* the 140ms timer → execute immediately without ever drawing the wheel. Hold → the wheel appears and teaches you. Same gesture, and the menu is its own tutorial. This is what makes it eyes-free.
7. **Resolve the MMB collision** with pan — ADR-0005.
8. Pool the key sounds via WebAudio (`ui-chrome.js:50` clones an `Audio` element per keystroke).

**Done when:** an experienced user can retype a block without looking at the wheel; dismissing never mutates the document; MMB-drag pans a canvas without opening it.

**Skills:** `ecc:motion-ui` + `ecc:motion-foundations` (the feel — this lives or dies on timing/easing) · `impeccable` (interaction polish) · `verify`

---

## Phase 3 — Timeline ★

*Goal: the reference clip, in Platen's ink.*

Full spec: **`../spec/timeline.md`**. Key points:

- **The axis is a custom era system** (`25 BBY … 0 … 15 ABY`). Fictional calendars are *the* feature, not a nice-to-have.
- **Store absolute integer ticks; calendars are display/parse only.** Layout math never touches calendar logic. This is what makes 13-month years and multi-epoch dating tractable.
- **Two item kinds:** instants → pills above the axis with leader lines to a dot; spans → thick bars below, lane-packed, image-filled.
- **Lane packing is screen-space, not time-space** — a pill's footprint is its label width, so lanes must recompute on zoom. This is the subtle part; it's what produces the reference's staircase.
- Characters appear on the axis as lifespans → this *is* the entity link, visible.

The **shared kernel** (`core/geom/`) gets built here: `camera`, `spatial`, selection, drag, marquee, `pack`. The timeline camera is X-locked-to-time and Y-locked-to-lanes; the board camera is free in both. **The timeline is a constrained board** — same kernel, different constraints.

Built here with the timeline as its first consumer, then reused (not rewritten) by Phase 4. Deliberately *not* a separate "build the kernel" phase — an abstraction with one consumer and no user-visible deliverable is how plans stall.

**Done when:** you can build the Star Wars timeline from the clip; pills lane-pack correctly through zoom; clicking a scene's event jumps to that scene in the script.

**Skills:** `ecc:architect` (kernel boundaries) · `frontend-design` or `impeccable` (ink-language visual direction) · `ecc:motion-ui` (pan/zoom feel) · `ecc:performance-optimizer` (only if measured slow) · `verify`

---

## Phase 4 — Board ★

*Goal: Milanote, offline, and linked to the script.*

Full spec + complete Milanote feature inventory: **`../spec/board.md`**.

Reuses the Phase-3 kernel with an unconstrained camera. Core:

- Infinite canvas, drag-drop notes/images/cards, resize, colour-code
- **Nested boards** — the actual killer feature. Double-click a sub-board → a whole new canvas, breadcrumb back out.
- Connectors, arrows, columns
- **The link:** a board card *is* a scene. That's the differentiator.

**Skills:** `frontend-design` / `impeccable` · `ecc:performance-optimizer` (culling/virtualisation, once measured) · `ecc:security-reviewer` (file import — see below) · `verify`

> ⚠️ Before this phase, constrain `fs:readText`/`fs:writeText` (`main.js:229-236`) to the project directory. They currently accept any renderer-supplied path. Harmless today (offline, CSP-locked); a real arbitrary-file-write primitive once the board imports files.

---

## Phase 5 — Milanote completeness

*Goal: the rest of the inventory.*

**An honest flag, carried forward rather than silently resolved.** Three requested Milanote features contradict Platen's stated identity — *"No accounts. No subscriptions. Scripts stay on your machine."*:

| Feature | Requires | Verdict |
|---------|----------|---------|
| **Real-time collaboration** | a server **and** accounts | Cannot be done offline. Would invert the product's premise. **Recommend: don't.** If multi-writer matters, the offline-native answer is file-based merge (CRDT or Fountain diff), not a server. |
| **Pexels stock library (3M images)** | network + API key | Possible as **opt-in**, off by default. Needs a CSP carve-out. The offline-native alternative is a local folder you point at. |
| **Web clipper** | a browser extension talking to the desktop app via a **localhost port** | Doable — Electron can serve one. It's a real security surface and a separate deliverable (a Chrome extension). Sequence last. |

Everything else in the inventory (templates, tags, search, export, sketching, tables, embeds) is `[OFFLINE-OK]`.

**Templates** (Save the Cat, Hero's Journey, character profiles, storyboards) are cheap and high-leverage once the board exists — they're just seeded board JSON.

**Skills:** `ecc:security-reviewer` (**mandatory** for the clipper's local port) · `ecc:api-connector-builder` (Pexels) · `ecc:e2e-runner`

---

## Cross-cutting

### Testing

Zero tests today. Not negotiable going forward for `core/`:

- **vitest** for `core/` — it's pure, so this is easy and fast
- **Golden-file pagination tests** — the acceptance gate for Phase 1
- **Playwright-over-Electron** for E2E (`ecc:windows-desktop-e2e`, `ecc:e2e-runner`)
- Project rule is 80% coverage. Apply it to `core/`; be pragmatic about view code, where visual/E2E checks carry more signal than brittle DOM assertions.

### The rule that matters most here

> A green unit test does not prove the PDF is right. **Export it, open it, count the pages, check the font.**

Every one of the four cracks in `00-findings.md` would have survived a passing unit suite. They're all integration-shaped. Drive the real app.

### Visual direction

Platen is monochrome carbon/ink/paper, Courier Prime, letterpress. The reference timeline is blue glassmorphism. **We take the interactions, not the skin** (ADR-0002). Colour is semantic only — thread/character coding — never decorative.

### Skill routing — and re-scan

Per phase, above. But **re-scan rather than trust this list**: it was written 2026-07-16 and the installed capability set changes.

- `~/.claude/capability-map.md` — full inventory of installed plugins/skills/MCPs/agents. Read **on demand**, never paste wholesale into context.
- `~/.claude/skills-library/` — parked skills, zero session cost. Copy one into `.claude/skills/` to activate it here.
- `find-skills` / `ecc:skill-scout` — discover a skill for a job you don't have one for.

At the start of each phase: read `.claude/CLAUDE.md`, then re-scan the capability map for that phase's work. **Don't assume this document is current.**

### Second brain

Per global operating notes: consult `LLM-Wiki/wiki/index.md` before substantial work; file durable findings back with `/wiki ingest`. The pagination spec and the timeline data model are exactly the kind of durable, reusable knowledge that should compound into the vault rather than evaporate.

---

## Risk register

| Risk | Severity | Mitigation |
|------|----------|------------|
| Pagination never matches Final Draft exactly | High | Golden-file tests against real scripts. Accept "matches to ±1 page over 100pp" as the bar; industry tools disagree with each other too. Document the deviation. |
| Format v2 migration corrupts a real project | **Critical** | Migrate to a *copy*; keep the v1 file untouched; verify round-trip before deleting. Never migrate in place. |
| Scope: "all of Milanote" + "all of Aeon" + a screenwriting app is 3 products | **High** | Phases are independently shippable. Phase 1+2 alone is a genuinely better app than today. Stop anywhere after any phase and it's still coherent. |
| Board perf dies at N items | Medium | DOM + culling first; measure before optimising. Canvas/WebGL only if measured. |
| Kernel doesn't generalise from timeline → board | Medium | Timeline is a *constrained* board, so the constraint direction is right. But keep `core/geom/` free of timeline concepts. |
| Radial rework breaks muscle memory | Low | Nobody has muscle memory for it yet — it silently corrupts documents. |
| **Locked pagination retrofit** | Medium | Production drafts pin page breaks and overflow into **A-pages** rather than reflowing. It's a *distinct engine mode*, cheap to design for now and painful to retrofit. Don't build it in Phase 1 — but don't foreclose it either. (`spec/pagination.md` §7) |
| **Aeon's trap: baking resolved dates** | **High if missed** | Aeon's calendars lock permanently once populated, can't do multiples, and break their own JSON export — all because they store resolved dates instead of canonical instants. Storing integer ticks costs nothing now and is very expensive to retrofit. **This is why Aeon hasn't.** (`spec/timeline.md` §3.1) |

---

## What "done" looks like after each phase

| Phase | A writer can… |
|-------|---------------|
| 0 | (nothing new — but we can now change things safely) |
| 1 | Trust the page count. Undo anything. Not lose work. Hand the PDF to a producer. |
| 2 | Write without touching the ribbon or looking at the wheel. |
| 3 | See their story on a custom-calendar timeline, click an event, land in the scene. |
| 4 | Plan on an infinite wall where the cards *are* the scenes. |
| 5 | Start from a beat-sheet template; clip references from the web. |

**Phase 1 + 2 alone is the app the pitch already claims to be.** Everything after is the expansion.

