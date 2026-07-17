# Phase 8c — Columns, to-do, semantic color

**Date:** 2026-07-17  
**Status:** COMPLETE  

## Summary

Columns are real containers: drop a card onto a column to snap/stack, drag out to detach, reorder by Y, collapse/expand with count badge, column drag moves children as a unit. **+ To-do** creates checklist cards. Semantic ink swatches recolor selected cards (ADR-0002 palette only).

## How to use

| Action | How |
|--------|-----|
| Add column | **+ Column** |
| Snap in | Drag a note/scene/todo onto a column; release |
| Reorder | Drag a child up/down within the column |
| Detach | Drag a child outside the column |
| Collapse | ▾ / ▸ on column header |
| Unit drag | Drag the column shell — children follow |
| To-do | **+ To-do** → checkboxes + task text + **+ Task** |
| Color | Select card(s) → click swatch in toolbar |

## Files

| File | Role |
|------|------|
| `src/core/board/columns.js` | Pure layout, snap/detach, palette |
| `tests/unit/board-columns.test.js` | 9 tests |
| `src/core/board/model.js` | `parentId`, `collapsed` |
| `src/core/board/templates.js` | Three-Act columns wire `childIds` |
| `src/views/board/board-view.js` | Toolbar, snap on move end, UI |
| `src/styles.css` | Column / swatch / todo chrome |
| `docs/spec/board.md` | Implemented? column updated |

## Verify

- **225** unit tests  
- **20/20** smoke  

## Next

**Phase 8d** — canvas polish (Alt-dup, nudge, Z-fit, guides) + nested-board polish + story templates (relationship map).

## Compressed handoff

8c: columns snap/reorder/collapse/unit-drag via pure `columns.js` + batch updates; +To-do and semantic color strip. Templates now parent notes into columns. Next 8d polish + templates.
