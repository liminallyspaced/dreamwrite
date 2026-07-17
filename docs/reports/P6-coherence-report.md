# Phase 6 — Coherence + chrome diet + fs gate

**Date:** 2026-07-17  
**Status:** COMPLETE  
**Orchestration:** single orchestrator (no parallel specialists — package size favored one sitting)

## Summary

Phase 6 shipped: DreamWrite bridge naming, true docs, fs path gate verified + unit-tested, STATS rail removed, export moved to top-left Export + bottom-right FAB/sheet, stale "desktop app" alerts removed from open/save/import paths.

## Files touched

| File | Change |
|------|--------|
| `docs/plan/03-master-plan.md` | APPROVED + review amendments A1–A5 + 8a–8d gates |
| `docs/plan/ORCHESTRATION.md` | Hybrid orchestration contract |
| `docs/plan/00-findings.md` / `01-roadmap.md` | HISTORICAL banners |
| `.claude/CLAUDE.md` | DreamWrite truth; `.platen` keep; read order |
| `preload.js` | `window.dreamwrite` + deprecated `scriptdesk` alias |
| `src/app.js` | Prefer dreamwrite; export sheet; stats removed; status lint; soft errors |
| `src/index.html` | No rightbar; export FAB/sheet; status lint button |
| `src/styles.css` | 2-col workspace; export sheet + FAB styles |
| `main.js` | Shared `assertPathAllowed`; `.dreamwrite` open filter |
| `lib/allowed-path.js` | Pure path gate |
| `tests/unit/allowed-path.test.js` | 5 unit tests |
| `docs/spec/board.md` | Implemented? column |
| `docs/reports/P6-coherence-report.md` | This report |

## Verifications

| Check | Result |
|-------|--------|
| `npm test` | **182/182 pass** (was 177 + 5 path) |
| `npm run build` | green |
| `node tests/smoke/smoke.js` | **15/15 pass** |
| STATS panel gone | `#rightbar` removed/hidden |
| Export sheet | `#btnExport`, `#btnExportFab`, `#exportSheet` |

## Deferred

- Remaining `confirm`/`alert` on new project, restore revision, find/replace → Phase 10 / touch-as-edit
- Board-view alerts → Phase 8 when board files edit
- Full theme system + library → Phase 10
- Remove `scriptdesk` alias after one release

## Next unlock

**Phase 7 — Guardrails** (SmartType, real dual dialogue, Fountain dual, CONT'D rules, scene numbers).

## Compressed handoff (~150 words)

Phase 6 complete. Product name DreamWrite in CLAUDE + bridge `window.dreamwrite` (alias `scriptdesk`). Format stays `.platen`. FS paths gated via `lib/allowed-path.js` with unit tests; main reuses it. Right-rail STATS deleted; page/scene counts status bar only; Export top slim + bottom-right FAB opens sheet (Fountain/PDF/snapshot). Stale desktop-app alerts on open/save/import replaced with status-bar `reportSaveProblem`. Docs: master plan APPROVED with A1–A5, orchestration doc, board implemented column, historical banners. 182 tests + 15 smoke green. Start Phase 7 next.
