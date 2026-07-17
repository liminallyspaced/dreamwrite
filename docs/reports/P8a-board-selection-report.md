# Phase 8a — Board selection + resize

**Date:** 2026-07-17  
**Status:** COMPLETE  

## Summary

Board now has a real selection model (click, Shift+click, marquee, Ctrl/⌘+A, Esc), group drag-move committed as one undoable `board.updateItems`, bulk Delete via `board.removeItems`, and bottom-right resize handles (images keep aspect; Ctrl free-resize).

## Files

| File | Change |
|------|--------|
| `src/core/board/selection.js` | Pure selection + marquee + clampResize |
| `tests/unit/board-selection.test.js` | 8 unit tests |
| `src/core/store/mutations/board.js` | `boardUpdateItems`, `boardRemoveItems` |
| `src/core/store/commands.js` | Commands + prepare for batch ops |
| `src/views/board/board-view.js` | Selection UI, marquee, group move, resize |
| `src/styles.css` | `.selected`, `.bd-resize`, `.bd-marquee` |
| `tests/smoke/smoke.js` | Board 8a surface check |

## Interaction map

| Input | Behavior |
|-------|----------|
| Click card | Select only that card |
| Shift+click | Toggle in selection |
| Drag empty stage | Marquee (Shift = additive) |
| Middle-drag | Pan (unchanged) |
| Drag selected card(s) | Group move; commit on pointerup |
| BR handle | Resize; Ctrl = free aspect on images |
| Delete/Backspace | Bulk remove selection |
| Ctrl/⌘+A | Select all cards on board |
| Esc | Clear selection |

## Verify

- **209** unit tests pass  
- Smoke extended for board cards + resize handle + selection API  
- Golden pagination unchanged  

## Next

**Phase 8b** — connectors create UI (attach & follow, labels, curves).

## Compressed handoff

8a shipped pure `selection.js`, batch board commands, marquee multi-select, group move, and resize handles with aspect lock. Undo is one gesture per move/resize/bulk-delete. Next is 8b connector creation from card edge handles.
