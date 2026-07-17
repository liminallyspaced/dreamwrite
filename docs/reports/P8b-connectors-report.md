# Phase 8b — Board connectors

**Date:** 2026-07-17  
**Status:** COMPLETE  

## Summary

Connectors are no longer a dead feature. Create via edge ports on selected cards or **+ Arrow** click mode; lines attach to card edges and reflow when cards move; labels, curve toggle, Shift H/V constrain, free ends, undo via `board.addItem` / `board.removeItem`.

## How to use

| Action | How |
|--------|-----|
| Create | Select a card → drag an edge **port** onto another card (or empty for free end) |
| Toolbar | **+ Arrow** arms click mode: first card → second card |
| Label | Select line → type in mid-line label field |
| Curve | Double-click line to toggle curved / straight |
| Constrain | Hold **Shift** while dragging a free end / rubber band (H or V) |
| Delete | Select connector → Delete / Backspace |
| Follow | Moving cards reflows anchors (edge-facing geometry) |

## Files

| File | Role |
|------|------|
| `src/core/board/connectors.js` | Pure geometry (anchors, path, hit-test) |
| `tests/unit/board-connectors.test.js` | 7 unit tests |
| `src/core/board/model.js` | Connector fields: free end, sides, color, weight |
| `src/views/board/board-view.js` | Ports, rubber-band, SVG hit targets, labels |
| `src/styles.css` | Port + label chrome |
| `tests/smoke/smoke.js` | 8b surface check |

## Verify

- **216** unit tests  
- **19/19** smoke  
- Ports + arrow button + connector SVG present after scene sync  

## Next

**Phase 8c** — columns as real containers + to-do/color reachability.

## Compressed handoff

8b resurrected connectors: edge ports, +Arrow mode, attach/follow via `resolveEndpoints`, labels, curve dblclick, Shift HV free ends. Cascade delete already existed. Next: 8c columns + todo/color UI.
