# Phase 9 — Timeline span authoring

**Date:** 2026-07-17  
**Status:** COMPLETE  

## Summary

Timeline spans are fully authorable in-UI: **+ Period**, **Shift+drag on axis** to draw a range, **drag span body** to move, **end handles** to resize start/end, detail panel for **kind / lane / semantic color**. Demo eras still seed Star Wars–style periods. Ticks remain absolute integers (calendar is labels only).

## How to use

| Action | How |
|--------|-----|
| **+ Period** | Create a span centered in the viewport |
| **Shift+drag** on axis/empty | Draw a new period (rubber band) |
| **+ Event** | Instant (unchanged) |
| **Drag span** | Move whole period |
| **Edge handles** | Resize start / end |
| **Detail → Kind** | Instant ↔ period |
| **Detail → Lane** | Manual lane (blank = auto pack) |
| **Color swatches** | Semantic ink colors |
| **Demo eras** | Seed Clone Wars / Empire / etc. |

## Files

| File | Role |
|------|------|
| `src/core/timeline/spans.js` | normalize / move / resize / drag helpers |
| `tests/unit/timeline-spans.test.js` | 7 unit tests |
| `src/views/timeline/timeline-view.js` | +Period, handles, draw, detail meta |
| `src/core/store/mutations/timeline.js` | kind toggle clears/adds t1 |
| `src/styles.css` | handles, rubber, color strip |
| `tests/smoke/smoke.js` | span surface check |

## Verify

- **239** unit tests  
- **22/22** smoke (`spans:1`, `handles:2` after +Period)  

## Next

**Phase 10** — UX rework: library with covers, theme tokens, remaining chrome, zero blocking dialogs, editor zoom, command palette.

## Compressed handoff

Phase 9: spans via +Period and Shift-drag; move/resize with pure `spans.js`; detail kind/lane/color. Demo eras still available. Next is Phase 10 UX library/themes.
