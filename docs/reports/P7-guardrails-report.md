# Phase 7 — Guardrails

**Date:** 2026-07-17  
**Status:** COMPLETE  
**Orchestration:** single orchestrator (TDD on paginate / Fountain / SmartType)

## Summary

Professional screenwriting layer: SmartType (INT./EXT., locations, times, transitions, Tab slug flow), real dual dialogue (model + paginate dual-row + Fountain `^` round-trip), same-speaker CONT'D at paginate-time without double-stacking page-break CONT'D, sequential scene numbers on screen gutter + PDF, title page live preview.

## Files touched

| File | Change |
|------|--------|
| `src/core/script/smarttype.js` | Pure SmartType helpers |
| `src/core/script/paginate.js` | Dual pairs, return CONT'D, scene numbers |
| `src/core/script/format.js` | dual / sceneNumbers / autoContdOnReturn |
| `src/engine.js` | Fountain dual I/O; PDF dual-row + scene nums |
| `src/app.js` | SmartType AC, Dual button, title preview, scene gutters |
| `src/index.html` | Title split + preview sheet |
| `src/styles.css` | Title preview + dual/scene UI |
| `tests/unit/smarttype.test.js` | 10 tests |
| `tests/unit/dual-dialogue.test.js` | 9 tests (dual, CONT'D, scene #, Fountain) |
| `tests/smoke/smoke.js` | Dual control + no fake marker |

## Verifications

| Check | Result |
|-------|--------|
| `npm test` | **201/201** |
| Golden pagination page count | unchanged (2) |
| `npm run build` | green |
| Smoke | extended checks |

## Deferred / Phase 8 unlock

- Full side-by-side **editable** dual columns on paper (PDF is dual-row; screen still sequential blocks with dual partner gutter)
- Production A-scene locking (ADV)
- Reports ADV
- Remaining confirm/alert on restore/new/find

## Compressed handoff

Phase 7 shipped SmartType pure module + AC for scene/character/transition with Tab slug progression. Dual is real: `block.dual`, Dual button inserts partner character, Fountain exports `NAME^` and imports dual flag, paginate emits `dual-row` for PDF. Same-speaker CONT'D is paginate-time only; page-break CONT'D does not double. Scene numbers sequential (mode both/hidden). Title form has live industry-layout preview. 201 unit tests, golden page count stable. Next: Phase 8a board selection + resize.
