# DreamWrite

**Public product / engineering showcase.** Offline screenwriting desktop app.

**Nicholas Siegel** · [liminallyspaced](https://github.com/liminallyspaced) · AI Systems Engineer / Researcher

> One entity, three views. A scene **is** a script block **and** a board card **and** a timeline event.

**No accounts. No subscriptions. No network by default.** Scripts stay on your machine.

| | |
|---|---|
| **Platform** | Windows 10/11 (x64) · macOS (arm64 / x64 via CI or Mac build) |
| **Stack** | Electron 33 · vanilla JS · esbuild · vitest |
| **License** | MIT |

---

## What problem exists?

Screenwriters still bounce between **Final Draft-class format**, **Milanote-class boards**, and **Aeon-class timelines** — three tools, three models, three truths about “what a scene is.” Online tools add logins, subscriptions, and cloud lock-in.

DreamWrite is a single offline workspace where pagination, undo, board, and timeline share one document model.

## Why it was built

To ship a **real offline product**, not a demo:

1. **Industry pagination** — one engine for screen, stats, and PDF (not three conflicting page counts).
2. **Trust** — command-stack undo; never silently delete prose; never migrate projects in place.
3. **Offline identity** — monochrome ink/paper desk; no telemetry; no account wall.

## Features

| Area | Capability |
|------|------------|
| **Script** | Courier Prime · 54 lines/page · Tab/Enter · CONT'D/MORE · multi-page paper stack · PDF |
| **Pagination** | Single pure engine for layout, word/page stats, and export |
| **Undo** | Full command stack · typing merge · Ctrl/Cmd+Z |
| **Marking wheel** | MMB hold ≤8 contextual items · flick marks · drag pan |
| **Timeline** | Integer ticks · bookend eras (e.g. BBY/ABY) · lane pack · scene sync |
| **Board** | Notes · scene-cards · nested boards · templates · images · tables |
| **Search / Bible** | Offline full-text · characters & locations from script |
| **Projects** | Fountain in/out · folder packages + content-addressed assets · atomic saves |

### Intentionally not included

| Non-goal | Why |
|----------|-----|
| Real-time collab | Needs accounts/server — breaks the premise |
| Stock / Pexels by default | Network is opt-in only if ever |
| Web clipper as core | Separate deliverable |

---

## Screenshots / visuals

| Clean paper + dark desk | App direction |
|-------------------------|--------------|
| ![Hero](website/images/hero.jpg) | ![App](website/images/app-shot.jpg) |

Icon: `assets/icon-256.png`

---

## Install

### Windows (ready now)

From a [Release](https://github.com/liminallyspaced/dreamwrite/releases/latest) (or local `dist/` after build):

| File | Use |
|------|-----|
| **DreamWrite-Setup-\*.exe** | Installer — Start Menu + Desktop shortcuts |
| **DreamWrite-Portable-\*.exe** | No install — run anywhere |

SmartScreen may warn on unsigned builds → More info → Run anyway if you trust the build.

### macOS

Build on a Mac or via GitHub Actions (`macos-latest`):

```bash
npm install
bash scripts/pack-mac.sh
# → dist/DreamWrite-*-arm64.dmg  (and/or x64)
```

First launch if unsigned: right-click app → **Open**.

Projects default to **`Documents/DreamWrite/`**.

---

## Develop

```bash
git clone https://github.com/liminallyspaced/dreamwrite.git
cd dreamwrite
npm install
npm start
```

```bash
npm test              # unit (vitest)
npm run test:smoke    # Electron smoke (Windows)
npm run pack:win      # Setup + Portable → dist/
npm run deploy:desktop  # pack + clean Desktop, archive older builds
```

| Script | Output |
|--------|--------|
| `npm run pack:win` | `DreamWrite-Setup-<ver>.exe` + `DreamWrite-Portable-<ver>.exe` |
| `npm run pack:mac` | DMG + ZIP (macOS only) |
| `npm run deploy:desktop` | Refreshes Desktop; archives old DreamWrite\* copies |

---

## Architecture (short)

```
src/core/     pure modules — store, pagination, board, timeline, format-v2
src/views/    script / board / timeline UI
src/app.js    renderer shell
main.js       Electron main — dialogs, atomic writes, path sandbox, platen://
docs/         ADRs + specs (pagination, board, timeline)
```

**Invariants:** offline · `core/` has no DOM · mutations through the command stack · one pagination engine · never silently delete prose · never migrate in place.

---

## Verification

- **177** unit tests (vitest)
- Electron smoke suite (load, type, autosave)
- Windows NSIS + portable packages via electron-builder

---

## Keyboard

| Shortcut | Action |
|----------|--------|
| Tab / Enter | Cycle element / new block |
| Ctrl/Cmd+1…7 | Element type |
| Ctrl/Cmd+Z | Undo |
| Ctrl/Cmd+S / O / N | Save / Open / New |
| Ctrl/Cmd+F | Find |
| Ctrl/Cmd+P | Export PDF |
| F11 | Focus mode |
| MMB | Wheel / mark / pan |

---

## License

MIT — see [LICENSE](LICENSE).

Not affiliated with Final Draft, WriterDuet, Celtx, Milanote, or Aeon Timeline.
