# DreamWrite — Master Plan (Phases 6–10)

**Date:** 2026-07-17 · **Status:** APPROVED (Nick review + recommendations folded in)
**Supersedes:** `01-roadmap.md` Phases 0–5 (all shipped; see audit below). `00-findings.md` is
**historical** — its four cracks are fixed; do not treat it as current.
**Authority for execution:** this file + `docs/plan/ORCHESTRATION.md`.

**Decisions locked this session (Nick, 2026-07-17):**
1. Canonical product name: **DreamWrite** (docs/bridge/format cleanup below).
2. Board scope: **story-planning core** (full canvas mechanics; skip video/audio/map embeds and all collab).
3. Order: **Guardrails → Board → UX** (with chrome diet pulled into Phase 6).
4. UX scope: **layout + interaction rework** inside the existing ink/minimal identity (ADR-0002 stands).
5. Review recommendations (2026-07-17) are **binding** — see §0.

---

## 0. Review amendments (binding)

| # | Amendment | Why |
|---|-----------|-----|
| A1 | **Chrome diet in Phase 6** — delete STATS panel; export top-left + bottom-right EXPORT sheet. Themes + library stay Phase 10. | Hard UX directives must not wait until the last phase. |
| A2 | **`fs:` path gate in Phase 6** (verify/tighten/test) — not deferred to Phase 8. | Standing landmine; every later import path needs it. |
| A3 | **Phase 8 ship gates 8a→8d** — selection+resize; connectors; columns+reachability; polish+templates. | Full Milanote tutorial is end of 8d, not a single all-or-nothing drop. |
| A4 | **Phase 7 dual + CONT'D non-negotiables** — Fountain dual round-trip; same-speaker CONT'D must not stack with page-break CONT'D/MORE. | Prevents one-way models and double CONT'D. |
| A5 | **Phase 10 harness update** — smoke + `capture-screenshots.js` must open via library / sample template API when welcome goes away. | Avoid silent test break. |

Optional (Phase 6 if cheap): fix broken IBM Plex font files (OTS decode fails) or fall back to system UI fonts.

---

## 1. Where the codebase actually is (audit, 2026-07-17)

Verified with 177/177 tests passing, clean esbuild, and file:line evidence.

**Solid — keep, don't rebuild:**
- `core/` is genuinely DOM-free; command/undo stack has no bypass paths (`core/store/commands.js`).
- One pagination engine (ADR-0006) with real widow/orphan control and (MORE)/(CONT'D)
  (`core/script/paginate.js`).
- Tab/Enter element flow matches industry convention.
- Format v2: atomic writes, `platen://` asset protocol, revisions outside the document (ADR-0004).
- Board/timeline mutations all go through the command stack.
- `assertPathAllowed` already exists in `main.js` — Phase 6 **verifies, tests, documents** it (A2).

**Broken / shallow — the work:**

| # | Problem | Evidence |
|---|---------|----------|
| 1 | Board **connectors are a dead feature** — modeled, rendered, delete-cascaded, but no creation UI | `board-view.js` renders; nothing writes one |
| 2 | **No board selection model** — no multi-select, marquee, or bulk ops | Delete only works on one focused card |
| 3 | **No card resize** — zero handles (only tables grow) | — |
| 4 | **Dual dialogue is fake** — inserts literal `== DUAL DIALOGUE ==` text | `app.js` dual insert |
| 5 | **Timeline spans can't be authored** — `+Event` only creates instants | `timeline-view.js` |
| 6 | **app.js still oversized** | continuous extract per phase |
| 7 | **Autocomplete is character-names only** | SmartType incomplete |
| 8 | **Blocking `confirm()`/`alert()`**, some saying "requires the desktop app" | app.js + board-view |
| 9 | **Three-way branding**: DreamWrite (UI) / platen (format) / scriptdesk (IPC bridge) | `preload.js` |
| 10 | **Stale docs**: findings/roadmap historical; CLAUDE.md wrong product name | — |
| 11 | **Right-rail STATS/Export clutter** (UX directive) | `index.html` `#rightbar` |

Board/timeline items that exist in code but are **unreachable from the UI**: columns (template-only,
no snap-in logic), to-do cards, card colors, connectors, timeline spans.

---

## 2. Sequencing

```
Phase 6  Coherence + chrome diet + fs gate    1 sitting
Phase 7  Guardrails ★   SmartType, dual dialogue, scene numbers, title preview
Phase 8  Board ★        8a → 8b → 8c → 8d (ship gates)
Phase 9  Timeline       span authoring (reuses Phase-8 drag/resize)
Phase 10 UX rework ★    library + themes + remaining chrome + dialog zero + zoom + palette
```

Phase 6 first: branding, docs truth, fs gate, **chrome diet (A1)**.  
7 before 8 per priority. 9 after 8 for interaction patterns. 10 last for library/themes;
**dialog replacement is pulled forward** into each phase's touched files.

`app.js` split is **not a phase** — each phase extracts the module it touches. No big-bang.

**Orchestration:** see `docs/plan/ORCHESTRATION.md` — hybrid single-orchestrator + specialist
subagents with disjoint file ownership, sentinel handoffs, per-phase reports.

---

## 3. Phase 6 — Coherence + chrome diet + fs gate

*Goal: one name, true docs, safe paths, less UI clutter.*

1. **Branding to DreamWrite everywhere user-visible.** Bridge: `window.dreamwrite` primary;
   keep `window.scriptdesk` as deprecated alias one release; update call sites to prefer
   `dreamwrite`.
2. **File format stays `.platen` / `platen://` internally** — renaming a shipped file format buys
   nothing and risks user data (ADR-0004). Add `.dreamwrite` to open-dialog filter as accepted
   alias only. Document in CLAUDE.md so no future agent "fixes" it.
3. **Docs truth pass:**
   - `.claude/CLAUDE.md`: product name → DreamWrite; remove deleted `styles.legacy.css` landmine;
     point "read first" at this master plan; keep non-negotiables.
   - Stamp `00-findings.md` and `01-roadmap.md` with HISTORICAL banner + date.
   - `docs/spec/board.md`: add an "implemented?" column keyed to the audit.
4. **Delete stale web-degradation strings** ("requires the desktop app") — this app *is* the
   desktop app; those paths should be real errors or silent no-ops with status-bar message.
5. **Chrome diet (A1):**
   - **Remove the STATS panel** (`#rightbar` stat grid). Page/scene counts remain in **status bar only**.
   - **Export:** top-left File area (Export control) + **bottom-right EXPORT** button → sheet with
     Fountain · PDF · revision snapshot. Remove duplicate export buttons from right rail.
   - Format check → status-bar lint count (opens popover if list non-empty). Revisions list leaves
     the right rail (snapshot lives on export sheet; full history UI Phase 10).
6. **fs security gate (A2):** verify `assertPathAllowed` in `main.js`; add/extend automated test;
   document allowed roots (userData, documents, app dir, active project root). Do **not** open
   arbitrary filesystem paths from the renderer.

**Done when:**
- grep for `scriptdesk` finds only deprecated alias + docs.
- No STATS panel in UI; export sheet works; status bar shows counts + lint.
- CLAUDE.md has zero false product facts.
- `npm test` + `npm run build` + smoke green.

---

## 4. Phase 7 — Guardrails ★ (professional screenwriting layer)

*Goal: Celtx/WriterDuet-grade "hard to format wrong".*

1. **SmartType autocomplete** → `views/script/autocomplete.js` + pure `core/script/smarttype.js`:
   - Scene headings: INT. / EXT. / INT./EXT.; remembered locations; times after ` - `.
   - Tab inside slug: prefix → location → time (Final Draft convention).
   - Transitions list; character ranking by recency + scene presence.
2. **Real dual dialogue.** Model: `dualWith` pairing on dialogue groups. Pagination: two half-width
   columns; pair breaks as a unit. Screen + PDF from same `Page[]` (ADR-0006). Remove
   `== DUAL DIALOGUE ==` fake. **TDD in paginate; golden fixture.**
3. **Fountain dual round-trip (A4)** — dual must import/export via Fountain dual convention
   (second character `^` / dual markers). No DreamWrite-only one-way model.
4. **Character (CONT'D) for consecutive speeches** — paginate-time injection, not stored.
   **Must not stack** with page-break `(CONT'D)` / MORE (A4). Toggle in settings. Golden fixtures
   for both cases.
5. **Scene numbers** — sequential on slugs; left/right/both/hidden; screen + PDF.
6. **Title page** — form + live preview from same engine.
7. **Reports (ADV, only if time)** — scene / character / location lists.

**Done when:** full scene via Enter/Tab/accept-completion; dual side-by-side on screen **and**
exported PDF (open the real PDF); Fountain dual round-trips; CONT'D rules hold; scene numbers
in both; core ≥80% covered; non-dual golden page counts unchanged.

---

## 5. Phase 8 — Board ★ (story-planning core parity)

*Goal: Milanote canvas mechanics a solo writer uses, in ink.*  
*Skip:* video/audio/map/embeds, synced notes, sketch/draw, formulas beyond tables, collab.

### Ship gates (A3)

| Gate | Scope | Ship when |
|------|--------|-----------|
| **8a** | Selection model (click, Shift, marquee, Ctrl+A, Esc); group move; bulk delete; **card resize** | Multi-select + resize work with undo |
| **8b** | Connectors: create from handle → target; attach & follow; labels; curve; Shift H/V; ink colors | Dead feature resurrected |
| **8c** | Columns as real containers (snap, reorder, collapse, unit drag); +To-do + color reachability | Columns + color/todo usable |
| **8d** | Canvas polish (Alt-dup, nudge, Z-fit, double-click note, guides); nested-board polish; story templates incl. Character Relationship Map | Full tutorial flow offline |

1. **Selection model** — pure `core/board/selection.js`; undo-integrated per gesture.
2. **Card resize** — BR handle; images aspect (Ctrl free); min sizes.
3. **Connectors** — drag from edge handle; reflow on card move; labels; curve; delete-cascade exists.
4. **Columns** — drop snap, drag out, reorder, collapse, count label.
5. **Reachability** — +To-do, semantic color (ADR-0002 palette only).
6. **Canvas polish** — Alt+drag duplicate · arrow nudge · `Z` fit · lock · smart guides.
7. **Nested boards** — drop into sub-board; breadcrumb hold; **cycle guard**.
8. **Story templates** — Three-Act · Save the Cat · Hero's Journey · Character Profile · **Character Relationship Map**.
9. **ADV backlog later:** plot-thread lanes · board↔timeline · minimap.

**Done when (full 8d):** create → connect labeled arrows → arrows follow → multi-select move →
resize → color → columns → nest → template. Undo at every step. Smoke extended per gate.

---

## 6. Phase 9 — Timeline authoring (small)

1. **Span creation** — `+Period` + drag-across-axis; start/end handles (reuse 8a resize pattern).
2. **Kind/color/lane** editing (semantic palette).
3. Keep: ticks-not-dates, lane packing, entity link.

**Done when:** Star Wars–style reference timeline buildable in-UI without seed script.

---

## 7. Phase 10 — UX rework ★

**Hard directives (Nick):** kill STATS (done in P6); export placement (done in P6); rebuild themes;
AethelReader-style library with cover images.

1. **Project library** — cover grid (AethelReader `LibraryPane` reference); content-addressed covers;
   recent; open/rename/duplicate/delete (undo-first); New from template.
2. **Theme system** — tokenize all colors; Carbon / Paper / Manuscript; ADR-0002 monochrome.
3. **Remaining chrome** — grouped view rail (Write / Plan / Reference); contextual toolbars;
   FORMAT CHECK / REVISIONS placement finalized.
4. **Zero blocking dialogs** — remaining `alert`/`confirm` → undo-first toast or ink modal;
   CI/smoke grep gate.
5. **Editor zoom** — Ctrl+scroll 60–200%, Ctrl+0; CSS transform only (not layout).
6. **Command palette** Ctrl+K; **shortcuts overlay** `?` from one keymap table.
7. **Motion pass** — ink-respecting transitions.
8. **Harness update (A5)** — smoke + capture-screenshots use library / sample API, not
   `#welcomeSample` alone.

**Done when:** library home with covers; themes clean both ways; zero native dialogs (grep);
palette + shortcuts; zoom; first-run finds script/board/timeline without docs.

---

## 8. app.js split — continuous

| Extract | Phase |
|---|---|
| `views/script/autocomplete.js` + `core/script/smarttype.js` | 7 |
| page-layout / dual render pieces | 7 |
| `views/script/keyboard.js` | 7 |
| `views/find-replace.js` | 10 |
| per-view renderers | 10 |
| `core/keymap.js` | 10 |

**Done when** app.js < 800 lines by end of Phase 10.

---

## 9. Verification protocol (non-negotiable)

> A green unit test does not prove the PDF is right. **Export it, open it, count the pages, check
> the font.**

- `npm test` + `npm run build` before any commit.
- `tests/smoke/smoke.js` extended each phase.
- Golden-file pagination: dual adds fixtures; never edit old ones.
- `ecc:code-reviewer` after each work package; security review on IPC/path changes.
- 80% coverage on `core/`.

---

## 10. Agent onboarding (read order)

1. `.claude/CLAUDE.md` (updated Phase 6)
2. **This file** + `docs/plan/ORCHESTRATION.md`
3. `docs/architecture/decisions/`
4. `docs/spec/` — pagination, board (implemented column), timeline
5. `git log --oneline -15`
6. `npm run dev` · `npm test` · `npm run test:all` · `npm start`

---

## 11. Risk register

| Risk | Mitigation |
|---|---|
| Dual dialogue destabilizes pagination | Additive row kinds; golden regression gate |
| Connector reflow perf | Reflow only moved cards' edges; measure first |
| Chrome rework muscle memory | Palette + same shortcuts ship with layout |
| Scope creep to 22-type Milanote | Skip-list explicit; 8a–8d gates |
| Branding cleanup breaks IPC | Alias kept one release; smoke exercises bridge |
| Library breaks smoke | A5 harness update in Phase 10 definition of done |
