# Handoff — finishing the Platen build

**Written:** 2026-07-16, at the end of the session that produced the audit, plan, and Phase 0/1 work.
**For:** any agent picking this up cold.

Read `docs/INDEX.md` first. This file is the stuff you'd otherwise learn the hard way.

---

## The one sentence

> **One entity, three views.** A scene *is* a script block *and* a board card *and* a timeline event.

It's the only reason to build this instead of using Final Draft + Milanote + Aeon Timeline. If a change
doesn't serve either **(a)** removing screenwriting error/toil or **(b)** the entity link, sequence it last.

---

## Where the work stopped

Baseline is `f987d17` — the app exactly as inherited. Everything since is diffable against it.

**Done:**
- **Phase 0** — esbuild + vitest + jsdom; `engine.js` → ESM; `styles.legacy.css` deleted;
  `views/script/block-dom.js` extracted; `tests/smoke/smoke.js` (drives the real app over CDP).
- **Phase 1, data-loss bugs** — all four fixed (`a7ea661`, `e9a9052`). `core/persist/autosave.js`,
  `writeFileAtomic` in main.js, `#saveAlert` in the status bar, `engine.syncCardsFromScenes`.

**74 unit tests + 15 smoke checks**, from zero. `npm run test:all`.

**Also done (2026-07-16, `5f85643`):**
- **`core/store/` + command stack** — pure history/commands/mutations; typing merge;
  undo/redo via menu and Ctrl+Z/Y; revision restore is one undoable command.
  Design: `docs/architecture/store-design.md`. 88 unit tests; smoke 3× green.

**Also done (2026-07-16):**
- **Pagination (ADR-0006)** — `core/script/{format,wrap,paginate}.js`; `computeStats` +
  `toPdfHtml` consume the same `Page[]`; `FORMAT.linesPerPage` → **54**; Courier Prime
  base64-embedded in PDF; `document.fonts.ready` in main PDF path; golden fixture
  `tests/fixtures/golden-short.fountain`. Screen still one editable page surface;
  page *count* matches stats/PDF. Full multi-page paper stack is a follow-up.

**Not done:** rest of app.js split, multi-page editor stack, wheel/timeline/board.

---

## Do these in this order

### 1. `core/store/` + the command stack ← DONE (`5f85643`)

Landed. Design: `docs/architecture/store-design.md`.

- Every *wired* mutation goes through `store.execute` / `invert`.
- Menu + Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z own undo/redo (Chromium `{role:undo}` removed).
- Revision restore is one undoable command.
- **Still:** snippets/bible/etc. use `markDirty` (may clear undo if project identity diverges).
  Prefer `exec()` for every new path. Rename-propagation (ADR-0003) still future.

### 2. Pagination — the product fix ← DONE (engine + stats + PDF)

Landed: pure `paginate()` / `wrap()`; stats + PDF agree by construction; golden fixture;
Courier Prime in PDF; fonts.ready. **Still open:** render a real multi-page paper stack in
the editor (today the count is correct; the DOM is still one infinite page).

### 3. Split `app.js` against the store ← START HERE
### 4. Multi-page editor stack (finish ADR-0006 screen consumer)
### 5. The wheel (Phase 2) → 6. Timeline (Phase 3) → 7. Board (Phase 4) → 8. Completeness (Phase 5)

Detail for each in `01-roadmap.md`.

---

## Traps — every one of these cost real time

### Architecture

- **`engine-global.js` exists for a reason. Don't inline it.** `app.js:3` reads `window.ScriptEngine` at
  IIFE-execution time. ES imports are hoisted, so assigning the global inside `renderer.js` runs *after*
  `app.js` has already evaluated. Verified by deliberately inverting the order:
  `Uncaught TypeError: Cannot read properties of undefined (reading 'emptyProject')`.
  Delete the shim only when `app.js` imports the engine directly.
- **Splitting `app.js` is NOT mechanical.** The roadmap originally said it was; that's only true of leaf
  functions (six came out cleanly). The other ~64 close over a shared `state`/`els` object, so splitting
  them is a design decision — *how is state shared?* — and `app.js` still has no coverage of its own.
  **Build the store first, then split against it, one section at a time, smoke-verified per slice.**
- **`app.js` got bigger, not smaller** (1,939 → 2,009). That's real error handling replacing swallowed
  `catch {}` blocks. It gets worse before the store lets you split it properly. Expected.

### Verification

- **A green unit test does not prove the PDF is right. Export it, open it, count the pages, check the
  font.** Every crack in `00-findings.md` would have survived a passing unit suite.
- **"Electron booted with no console errors" proves almost nothing** — booting only renders the welcome
  screen. The editor is never touched. That's why `tests/smoke/smoke.js` exists: it loads the sample,
  types into a block, and asserts the text round-trips through the model.
- **The smoke test had a race and will again if you're careless.** It asserted immediately after CDP
  connect; that passed until the bundle grew, then failed check #1 while check #2 passed microseconds
  later. It now waits on `document.readyState` + bundle evaluation. **Use `cdp.waitFor`, never a bare
  `evaluate` for a readiness assertion.** A flaky test is worse than no test.
- Run the smoke test **3× consecutively** after touching load order or the bundle.

### Facts that look like bugs but aren't (do not "fix" these)

- **`linesPerPage` is 54, not 55.** `engine.js:34` says 55 and is **wrong**. Final Draft's own KB derives
  54 (9in × 6 lines/inch); Story Sense confirms independently (text runs grid lines 7–60).
  An earlier revision of the spec claimed 55 on the strength of blog posts saying *"approximately"* —
  **that was a mistake, and it's recorded in `pagination.md` §2 as a correction.**
  When sources conflict, **prefer the one that shows its arithmetic.**
- **`dialogue: 35` chars is CORRECT** (`engine.js:762`). Don't "fix" it to 30. A 2.5″ right *margin* puts
  the right edge at 6.0″, not 5.5″. Nicholl: 2.5″ left / 2.5″ right → 3.5″ → 35.
- **`setView`'s auto card-sync is safe** — guarded by `!cards.length`, so it only seeds an empty board.
  My own audit overstated this one.
- **The non-breaking space in `block-dom.js` is a `String.fromCharCode(0xa0)` constant on purpose.** A
  literal nbsp in source is invisible and the next reader "tidies" it into a plain space, silently
  breaking trailing-space normalisation. There's a regression test. (Also: emitting a ` ` escape
  through tooling is unreliable — that's why it's a constant.)

### Domain traps

- **Reserve the `(MORE)` line BEFORE choosing the page break**, or you overflow by one. The classic
  off-by-one. (`pagination.md` §7)
- **54 is a ceiling the break rules pull back from, not a target.** The bottom margin is a *minimum*.
  Never pad to fill.
- **Blanks-before-scene-heading is config, default 2** — it shifts feature page counts by *several pages*.
- **`(CONT'D)` is injected at paginate time, never into the document model.** John August's point: for
  page breaks there's no authorial intent.
- **Timeline: store canonical integer ticks; calendars are display/parse only.** Aeon's calendars lock
  permanently once populated, can't do multiples, and break their own JSON export — all one cause: they
  store *resolved* dates. Costs nothing now, very expensive to retrofit. **This is the competitive
  opening.** (`timeline.md` §3.1)
- **Timeline lane packing is screen-space, not time-space** — a pill's footprint is its label width, so
  lanes recompute on zoom. That's what makes the reference's staircase.
- **Timeline calendars need two infinite bookend eras** (the BC/AD pattern), or some instants have no
  label. Non-obvious; enforce at creation.
- **Milanote has no shapes.** Review sites claim it does; it's an open roadmap vote. Don't build
  "parity" features that aren't parity. Milanote also has **no offline mode at all** — an offline board
  isn't a degraded Milanote, on the core canvas it's strictly better.
- **MMB is double-booked** — radial vs. canvas pan. Resolution in ADR-0005: on MMB-down start the 140ms
  timer *and* record origin; >6px movement before it fires = pan, cancel the wheel.

---

## Rules that are not negotiable

1. **Offline. No accounts. No telemetry. No network by default.** Any online feature is opt-in, off by
   default, needs a CSP carve-out and an explicit decision. Don't quietly add a `fetch`.
2. **`core/` has no DOM.** Pure functions only. That's what keeps correctness testable.
3. **Every mutation goes through the command stack** (once it exists). Don't reintroduce an unundoable path.
4. **One pagination engine.** Never add a fourth way to count pages.
5. **Never silently delete the writer's prose.** The orphaned-card rule is the template: when a scene is
   cut, the card is *kept and marked*, not binned. Carry this into the board and timeline.
6. **Never migrate a project in place** (ADR-0004). Copy, verify round-trip, keep the v1 backup. This
   touches irreplaceable work and is the highest-risk operation in the plan.
7. **Ink identity** (ADR-0002). Monochrome. Colour is semantic only.
8. **Files <800 lines.**

---

## Open questions — do NOT invent answers

A plausible-looking guess is exactly how `estimatePages()` happened.

- **Dual dialogue geometry** — no published geometry exists. Validate against real FDX output.
- **Milanote sub-board preview rendering** — their docs are silent on whether a tile shows a thumbnail
  of its children. Ten minutes with the Chrome MCP tools on a real board settles it.
- **The reference timeline app is unidentified.** Leads: `timelines.studio` (GPL-3.0, exact
  Events/Spans/Eras triad, readable source) and `vvd.world` (403s). **Cheapest next step: check the
  clip's caption/bio link for the handle**, not more searching.
- **Character cue max width; parenthetical right edge** — unsettled across sources.
- **Vertical spacing (blank lines per element)** — several values are convention, not numerically cited.

---

## Skills — re-scan, don't trust this list

Routing per phase is in `01-roadmap.md` and `.claude/CLAUDE.md`. It was written 2026-07-16 and the
installed capability set changes.

- `~/.claude/capability-map.md` — full inventory. Read **on demand**, never paste wholesale.
- `~/.claude/skills-library/` — parked skills, zero cost. Copy into `.claude/skills/` to activate.
- `find-skills` / `ecc:skill-scout` — for a job with no obvious skill.

**At the start of each phase: re-scan for that phase's work.**

Highest-leverage for what's next: `tdd` + `ecc:tdd-guide` (pagination is *the* TDD-shaped problem) ·
`ecc:architect` (store/command design) · `verify` (**mandatory** — the PDF is integration-shaped) ·
`ecc:code-reviewer`. Later: `ecc:motion-ui` (the wheel lives or dies on timing) · `impeccable` /
`frontend-design` (ink direction) · `ecc:security-reviewer` (**mandatory** before the board's file
import and the clipper's local port).

**Not useful here:** Cloudflare/Workers, `seo`, `marketing-agent`, database skills. Offline desktop app,
no server, no database.

**Second brain:** consult `LLM-Wiki/wiki/index.md` before substantial work. The pagination spec and the
timeline calendar model are exactly the durable, reusable knowledge that should compound back via
`/wiki ingest` rather than evaporate.

---

## Working agreement

- **Commit per increment, verified.** Every commit so far states what was verified and how.
- **`npm run test:all`** before every commit. Smoke 3× if you touched load order.
- **Record amendments to the plan in the plan.** Two already exist (the app.js split; the 54/55
  correction). If you discover the plan is wrong, say so in the doc — don't quietly work around it.
- **Report honestly.** If a number is unverified, say unverified.
