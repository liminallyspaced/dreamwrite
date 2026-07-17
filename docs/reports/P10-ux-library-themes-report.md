# Phase 10 — UX rework report

**Date:** 2026-07-17  
**Status:** COMPLETE  
**Verify:** `npm test` (248) · `npm run build` · smoke **26/26**

## Scope delivered

| Item | Status |
|------|--------|
| Project library (cover grid, recent, rename/dup/remove, cover pick) | Done |
| Theme system Carbon / Paper / Manuscript (`data-theme` tokens) | Done |
| Grouped view rail Write / Plan / Ref | Done (HTML + CSS) |
| Zero native `alert` / `confirm` / `prompt` in `src/` | Done + smoke gate |
| Editor zoom 60–200% CSS transform (`Ctrl+scroll`, `Ctrl+0/=/-`) | Done |
| Command palette `Ctrl+K` + shortcuts overlay `?` | Done |
| Keymap single table (`core/keymap.js`) | Done |
| Harness A5: library Sample first, welcome stub fallback | Done (smoke + capture-screenshots) |
| `project:openPath` IPC + preload for library re-open | Done |

## Modules

- `src/core/ui/dialogs.js` — toast, confirmModal, alertModal, promptModal
- `src/core/library/catalog.js` — localStorage library + theme pref
- `src/core/keymap.js` — KEYMAP + search/group
- `src/views/library/library-view.js` — cover grid home
- `src/views/chrome/command-palette.js` — palette + shortcuts overlay
- `main.js` — `project:openPath` (assertPathAllowed)
- `preload.js` — `openPath`

## UX notes

- Library is first-run home when no autosave; `#welcome` stubs remain for smoke.
- Themes: legacy `dark`/`light` map to carbon/paper; Manuscript is warm sepia chrome.
- Views stay on `Ctrl+Shift+1…`; script element types stay on `Ctrl+1–7`.
- Board template apply + image-missing use ink modals/toasts.

## Deferred (continuous)

- `app.js` still large (~2.5k LOC). Full &lt;800 split continues outside Phase 10 gate.
- Cover generation from first page still manual (user picks image).

## Smoke evidence

```
phase 10 library/chrome surface — ok
phase 10 theme token set — carbon
phase 10 palette/zoom/theme live — paletteOpen, carbon→paper
zero native alert/confirm/prompt in src — ok
26/26 smoke checks passed
```
