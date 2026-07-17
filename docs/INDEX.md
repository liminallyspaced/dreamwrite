# Platen — documentation index

**Platen**: offline, no-accounts screenwriting (Electron 33, vanilla JS), expanding into a story
workspace — script + Milanote-style board + fictional-calendar timeline.

> **The thesis:** *one entity, three views.* A scene **is** a script block **and** a board card **and**
> a timeline event. It's the only reason to build this instead of using
> Final Draft + Milanote + Aeon Timeline.

---

## Start here

| Order | Doc | What it is |
|-------|-----|-----------|
| 1 | [`plan/00-findings.md`](plan/00-findings.md) | Codebase audit. Four load-bearing cracks, with file:line. **Read first.** |
| 2 | [`plan/01-roadmap.md`](plan/01-roadmap.md) | The phased build plan. Skill routing per phase. |
| 3 | [`plan/02-handoff.md`](plan/02-handoff.md) | **Handoff — the traps, the order, the open questions.** Read this if picking the work up cold. |
| 4 | [`../.claude/CLAUDE.md`](../.claude/CLAUDE.md) | Agent onboarding — non-negotiables, landmines, skill routing |

## Decisions (don't re-litigate)

| ADR | Decision |
|-----|----------|
| [0001](architecture/decisions/0001-sequencing-foundation-before-surfaces.md) | Foundation before new surfaces |
| [0002](architecture/decisions/0002-ink-identity-not-reference-skin.md) | Keep Platen's ink identity; take the reference's interactions, not its skin |
| [0003](architecture/decisions/0003-linked-entity-graph.md) | One entity, three views |
| [0004](architecture/decisions/0004-project-format-v2-and-assets.md) | Format v2: folder container, content-addressed assets, `platen://` protocol |
| [0005](architecture/decisions/0005-marking-menu-and-mmb-collision.md) | The wheel is a marking menu; resolving the MMB/pan collision |
| [0006](architecture/decisions/0006-one-pagination-engine.md) | **One pagination engine, three consumers** — the most important decision |

## Specs

| Spec | Status |
|------|--------|
| [`spec/pagination.md`](spec/pagination.md) | Constants **verified and cited** against Final Draft's KB + the Movie Magic Screenwriter manual. **54 lines/page, settled.** ⚠️ Dual dialogue geometry unverified — do not invent it. |
| [`spec/timeline.md`](spec/timeline.md) | Model settled — reference clip + Aeon Timeline's published calendar model. Reference app **unidentified** (leads in §7). |
| [`spec/board.md`](spec/board.md) | Inventory **verified against Milanote's own help centre** (~30 articles). ⚠️ Sub-board preview rendering unverified — needs eyes-on. |

---

## Phases

```
Phase 0  Scaffolding    DONE  esbuild · vitest · module split
Phase 1  Trust      ★   DONE  pagination · undo · multi-page · PDF font
Phase 2  Wheel      ★   DONE  marking menu · marks · ≤8 contextual rings
Phase 3  Timeline   ★   DONE  ticks · BBY/ABY · lane pack · scene link
Phase 4  Board      ★   DONE  nested boards · scene-cards · templates
Phase 5  Complete       DONE* offline templates + search; collab/Pexels/clipper declined
```

\* Phase 5 ships offline completeness. Network features remain explicit non-goals (see handoff).

---

## Known open items

**Do not invent numbers for these.** A plausible-looking guess is exactly how `estimatePages()` happened.

- **Dual dialogue geometry** (`spec/pagination.md` §8) — **no published geometry exists.** Screenwriter
  exposes it as fully user-configurable. Validate against real FDX output.
- **Sub-board preview rendering** (`spec/board.md` §4) — Milanote's docs are silent on whether a
  sub-board tile shows a thumbnail of its children. **Ten minutes with the Chrome MCP tools settles it.**
- **The reference timeline app is unidentified** (`spec/timeline.md` §7) — two unconfirmed leads
  (timelines.studio, vvd.world). **Cheapest next step: check the clip's caption/bio link for the handle**,
  not more searching.
- **Character cue max width, parenthetical right edge** — unsettled across sources (`spec/pagination.md` §8).

## Corrections already made — read before "fixing" these

- **`linesPerPage` is 54, not 55.** This doc briefly claimed 55 on the strength of blog posts saying
  "approximately." Final Draft's own KB derives 54. `engine.js:34` is wrong.
- **`dialogue: 35` chars is correct** — don't "fix" it to 30. A 2.5" right *margin* puts the right edge
  at 6.0", not 5.5".

When sources conflict, **prefer the one that shows its arithmetic.**

---

## The rule that matters most here

> **A green unit test does not prove the PDF is right. Export it, open it, count the pages, check the font.**

All four cracks in `00-findings.md` would have survived a passing unit suite. They're integration-shaped.
