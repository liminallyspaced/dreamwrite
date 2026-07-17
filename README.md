# Platen

**Offline carbon-black typewriter screenwriting.**  
No accounts. No subscriptions. Scripts stay on your machine.

One entity, three views: a **scene** is a script block, a board card, and a timeline event.

## Features

| Area | What you get |
|------|----------------|
| **Script** | Industry format (Courier Prime · 54 lines/page) · Tab/Enter flow · CONT'D/MORE · multi-page paper stack |
| **Pagination** | One engine for screen, stats, and PDF (ADR-0006) |
| **Undo** | Full command stack · typing merges · Ctrl+Z/Y |
| **Wheel** | MMB marking menu · ≤8 contextual slices · expert flicks · dead-zone cancel |
| **Timeline** | Integer ticks · BBY/ABY (or any bookend eras) · lane packing · scene sync · jump to script |
| **Board** | Infinite canvas · notes · scene-cards · nested boards · templates · connectors |
| **Search** | Offline full-text across script, cast, timeline, board |
| **Bible** | Characters & locations · scan from script |
| **Interop** | Fountain in/out · PDF (embedded Courier Prime) · `.platen` projects · atomic saves |

### Intentionally not included

| Feature | Why |
|---------|-----|
| Real-time collab | Needs accounts + server — breaks the product premise |
| Pexels stock | Network; optional later, off by default |
| Web clipper | Separate extension + localhost surface |

## Run

```powershell
cd C:\Users\nicks\Desktop\SYNTH-PROJECTS\ScriptDesk
npm install
npm start
```

```powershell
npm test          # unit
npm run test:smoke
npm run test:all
```

## Build portable Windows exe

```powershell
$env:CSC_IDENTITY_AUTO_DISCOVERY="false"
npm run pack
```

Projects default to `Documents\Platen\`.

## Keyboard

| Shortcut | Action |
|----------|--------|
| Tab / Enter | Cycle element / new block |
| Ctrl+1…7 | Set element type |
| Ctrl+Z / Y | Undo / Redo |
| Ctrl+S / O / N | Save / Open / New |
| Ctrl+F | Find & replace |
| Ctrl+P | Export PDF |
| Ctrl+Shift+1…9 | Script · Cards · Board · Timeline · Cast · Locs · Title · Notes · Search |
| F11 | Focus mode cycle |
| MMB | Hold = wheel · flick = mark · drag = pan |

## Architecture (short)

```
src/core/          pure (no DOM) — store, pagination, geom, timeline, board
src/views/         UI surfaces
src/app.js         renderer shell (bindings + store bridge)
main.js            Electron main · atomic writes · path sandbox
docs/spec/         pagination · timeline · board
docs/architecture/ ADRs
```

## License

MIT — use this app freely.  
Do not claim affiliation with WriterDuet, Final Draft, Celtx, Milanote, or Aeon Timeline.
