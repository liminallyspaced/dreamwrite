# Platen

**Offline carbon-black typewriter screenwriting.**  
No accounts. No subscriptions. No blue glow. Scripts stay on your machine.

Paper grain · ink-edge smudge · optional platen focus (roller + ribbon + typebars).  
Inspired by workflows in WriterDuet, Celtx, Highland, and Fade In — **not affiliated**.

## Features

| Area | What you get |
|------|----------------|
| **Editor** | Industry elements: Scene Heading, Action, Character, Parenthetical, Dialogue, Transition, Shot |
| **Flow** | Tab cycles types · Enter inserts smart next block · Ctrl+1–7 set type |
| **Autocomplete** | Character names from cast bible + script |
| **Outline** | Scene navigator + beat/index cards |
| **Bible** | Characters & locations with scan-from-script |
| **Title page** | Title, author, based on, draft date, contact |
| **Notes** | Freeform project notes |
| **Stats** | Pages, runtime (~1 page/min), scenes, words, dialogue % |
| **Interop** | Import/export **Fountain** · export **PDF** (US Letter) |
| **Projects** | `.sdesk` JSON · autosave · local revision snapshots |
| **UX** | Monochrome desk · paper night toggle · Platen focus · find/replace |
| **Look** | Cream paper texture · randomized ink edge smudge · black metal UI |

## Run from source

```powershell
cd C:\Users\nicks\Desktop\SYNTH-PROJECTS\ScriptDesk
npm install
npm start
```

## Build Windows .exe

```powershell
cd C:\Users\nicks\Desktop\SYNTH-PROJECTS\ScriptDesk
$env:CSC_IDENTITY_AUTO_DISCOVERY="false"
npx electron-builder --win portable --x64
```

Output: `dist\Platen-Portable.exe`

Projects default to: `Documents\Platen\`

## Keyboard

| Shortcut | Action |
|----------|--------|
| Tab | Cycle element |
| Enter | New block |
| Ctrl+1…7 | Set element type |
| Ctrl+S / O / N | Save / Open / New |
| Ctrl+F | Find & replace |
| Ctrl+P | Export PDF |
| Ctrl+T | Theme |
| F11 | Focus mode (hide panels) |
| Ctrl+Shift+W | **Platen mode** (typewriter roller view) |

## License

MIT — personal and commercial use of *this* app is fine.  
Do not redistribute third-party trademarks as if this were their product.
