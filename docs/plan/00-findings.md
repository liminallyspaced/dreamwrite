# Platen — Codebase Findings

**Date:** 2026-07-16
**Scope:** Full read of `main.js`, `preload.js`, `src/engine.js`, `src/app.js`, `src/ui-chrome.js`, `src/index.html`, `src/styles.css`
**Verdict:** Good bones, four load-bearing cracks. The document model is sound; the correctness layer is not.

---

## 1. What's actually here

~4,500 lines of vanilla JS in an Electron 33 shell. No build step, no modules, no tests, no dependencies beyond `electron` + `electron-builder`.

| File | Lines | Role |
|------|-------|------|
| `main.js` | 260 | Electron main, menu, IPC handlers, PDF print |
| `preload.js` | 40 | `contextBridge` IPC surface |
| `src/engine.js` | 939 | Pure-ish logic: format constants, Fountain, stats, PDF HTML |
| `src/app.js` | 1,939 | Everything else: state, render, editor, views, persistence |
| `src/ui-chrome.js` | 313 | Rails, focus modes, radial wheel, typing sounds |
| `src/styles.css` | 1,038 | Current styles |
| `src/styles.legacy.css` | 1,473 | Dead? Not linked from `index.html` |

### The good news (this matters)

- **The document model is real.** `state.project.blocks` is a JS array of `{id, type, text}` and is the single source of truth (`engine.js:101`). It is *not* DOM-scraping.
- **Per-block `contenteditable`**, not one monolithic editable (`app.js:633`). This is the right call — monolithic contenteditable is where screenwriting apps go to die. Each block owns its text; a non-editable `.block-gutter` shows the element label.
- **The format is already versioned** (`version: 1`, `engine.js:86`) — migration has a clean hook.
- **`main.js` is tidy** — small, focused, `contextIsolation: true`, `nodeIntegration: false`, `setWindowOpenHandler` denies popups, CSP is set. Security posture is decent for an offline app.

---

## 2. The four cracks

### CRACK 1 — Platen cannot tell a writer how long their script is

This is the most important finding. **1 page = 1 minute is the industry's fundamental unit** — contracts, budgets, and shooting schedules key off page count. Platen has *three* independently-computed notions of "page" and none of them is the industry's.

| Where | How it computes pages | Correct? |
|-------|----------------------|----------|
| **The screen** | One static `<div class="page">` with a hardcoded `<div id="pageNumber">1.</div>` (`index.html:146-150`) | No — there is exactly one fake infinite page |
| **The stats panel** | `estimatePages()` — `Math.ceil(text.length / charsPerLine(type))` (`engine.js:726-760`) | No — character count, not word-wrap |
| **The PDF** | Chromium's print engine breaks pages wherever it likes (`engine.js:793`) | No — one explicit `page-break`, after the title page (`engine.js:806`) |

`estimatePages` divides raw character count by a per-element column width. Real text wraps at **word** boundaries, so a 35-column dialogue line rarely holds 35 characters. The error is systematic (always under-counts lines → under-counts pages) and compounds over 100 pages.

The three numbers are computed by three different algorithms and cannot agree even in principle.

**Consequences:** the Pages stat is wrong → the Runtime stat is wrong (`engine.js:712`, `runtimeMin = round(pages)`) → you cannot build scene numbering, production sides, or revision pages on top.

### CRACK 2 — The PDF is not in Courier Prime, and has no page discipline

- `styles.css:6-8` declares `@font-face { font-family: "Courier Prime"; src: url("../assets/fonts/CourierPrime-Regular.ttf") }`. The screen renders Courier Prime.
- `engine.js:849` — the PDF stylesheet asks for `font-family: "Courier New", Courier, monospace` and **declares no `@font-face` at all**. The PDF renders Courier New.

Both are 10 cpi so horizontal metrics match, but vertical metrics differ — at `line-height: 1` the line box height differs, so breaks land differently. The writer previews one font and delivers another.

Compounding it, `main.js:216` loads the print HTML via a `data:text/html` URL. That's an opaque origin — even if an `@font-face` were added pointing at `../assets/fonts/`, it could not resolve. The fix must embed the font (base64) or serve from a real origin.

Also missing from the PDF entirely:
- **Page numbers** — industry requires top-right, from page 2. Not emitted.
- **`(MORE)` / `(CHARACTER) (CONT'D)`** at dialogue page breaks. Not emitted — impossible, since there are no controlled breaks.
- **Widow/orphan control** — a scene heading can land as the last line of a page; a character cue can be orphaned from its dialogue.

`main.js:218` — `await new Promise((r) => setTimeout(r, 350))` is a magic sleep waiting for layout. It's a race; on a long script it fires before layout settles.

### CRACK 3 — There is no undo

There is **no undo stack anywhere in the codebase.** The only `history.push` is `engine.js:907`, which is the manual "Revision snapshot" button — a different feature.

`main.js:59` wires `{ role: 'undo' }` — Chromium's *native* contenteditable undo. That undoes typing **within the one focused block only**. Every structural operation is unundoable:

- Delete a block
- Change an element type (Tab, Ctrl+1-7, ribbon, radial)
- Insert act break / dual dialogue
- **Replace All** (`index.html:118`) — can silently mangle an entire script with no recovery
- "Sync from scenes" (`index.html:175`) — rewrites the card board
- "Scan script" for characters/locations

For an app whose pitch is *write without worrying about mistakes*, the primary safety net is absent. This also hard-blocks the board and timeline: a canvas without undo is unusable.

### CRACK 4 — The radial silently edits your script when you dismiss it

`ui-chrome.js:279-287`:

```js
document.addEventListener('click', (e) => {
  if (!state.radialOpen) return;
  const radial = document.getElementById('radial');
  if (radial && !radial.contains(e.target)) {
    // if hot item, activate
    if (state.radialIndex >= 0) activateRadial(state.radialIndex);
    closeRadial();
  }
});
```

`state.radialIndex` initializes to `0` (`ui-chrome.js:15`) and is **never set to `-1`** anywhere. So `>= 0` is always true. Opening the wheel and clicking away to dismiss it **applies whatever is highlighted** — and `openRadial` calls `highlightRadial(0)` (`ui-chrome.js:172`), which is `Scene`. Dismissing the wheel retypes your current block as a Scene Heading.

There is also no cancel affordance: `pointermove` returns early inside a 36px dead-zone (`ui-chrome.js:269`) but *keeps the previous highlight* rather than clearing it, so returning to center cannot cancel.

**Beyond the bug, the interaction model is wrong:**

- **14 items** at 360/14 = **25.7° per slice** (`ui-chrome.js:19-34`). Marking-menu research (Kurtenbach & Buxton) puts the reliable ceiling at **8**; 4 and 8 are ideal because they map to compass directions and become muscle memory.
- **Click-to-select, not release-to-select.** `pointerup` (`ui-chrome.js:252`) just clears the held flag and comments *"keep radial open until click outside or select"*. So the gesture is: hold 140ms → wheel opens → release → move → click. That's a popup menu with extra steps, not a marking menu. A marking menu is **one** gesture: press, flick, release.
- **Not contextual.** The same 14 items regardless of element. `buildRadial()` runs once at init (`ui-chrome.js:196`), so items can't vary.
- **No submenus.**

The wheel is the feature most aligned with "stop doing repetitive tasks," and right now it's a net negative.

---

## 3. Two hard blockers for the board and timeline

### BLOCKER A — The IPC surface is UTF-8 text only

Every handler in `main.js` reads and writes `'utf8'`:

- `fs.readFileSync(filePath, 'utf8')` (`main.js:152`, `185`, `230`)
- `fs.writeFileSync(target, content, 'utf8')` (`main.js:170`, `199`, `235`)

There is **no binary channel**. Board and timeline images cannot be loaded or saved today. This is not a tuning problem — the capability does not exist.

### BLOCKER B — CSP blocks user images

`index.html:6` — `img-src 'self' data:`. User images can't be shown from disk. Loosening to `file://` would be the wrong fix (it hands the renderer the whole filesystem). The right fix is a **custom protocol** (`platen://asset/<hash>`) registered in main, scoped to the open project's asset directory.

---

## 4. The format won't survive a board

`engine.js:84` — `emptyProject()`:

```js
{
  version: 1,
  format: 'platen',
  createdAt, updatedAt,
  titlePage: { title, writtenBy, basedOn, draftDate, contact },
  blocks:     [ { id, type, text } ],
  characters: [],
  locations:  [],
  cards:      [],
  notes:      '',
  settings:   { theme, ... },
  history:    []          // <-- revision snapshots nested INSIDE the project
}
```

One flat JSON file. Problems as soon as a board exists:

1. **`history` is nested inside the document.** Every snapshot bloats the same file that's rewritten on every save.
2. **`fs.writeFileSync`** (`main.js:170`) — synchronous, blocking. Autosaving a multi-megabyte JSON will visibly jank typing.
3. **Non-atomic.** A crash mid-write truncates the project. There's no temp-and-rename.
4. **No place for binary assets.** Base64-in-JSON would be the tempting wrong answer: ~33% size inflation, no dedupe, and it re-serializes every image on every keystroke's autosave.

---

## 5. Structural problems

| Problem | Evidence | Why it matters now |
|---------|----------|--------------------|
| No modules | 3 `<script>` tags (`index.html:336-338`), IIFEs + `window.PlatenUI` / `window.PlatenChrome` globals | Can't unit-test, can't tree-shake, every new surface grows a global |
| No build step | `package.json` scripts are `start`/`pack`/`dist` only | No ESM (blocked over `file://`), no npm packages |
| No tests | none | Pagination is exactly the thing that needs golden-file tests |
| 1,939-line `app.js` | — | Violates the project's own 800-line rule |
| Dead file? | `styles.legacy.css` (1,473 lines) not linked from `index.html` | Confusion / rot |

### Interaction collision to resolve

**Middle mouse is double-booked.** MMB-hold opens the radial (`ui-chrome.js:243`). MMB-drag is also the universal pan gesture on any canvas — which the board and timeline both need. These must coexist.

*Resolution (see ADR-0005):* on MMB down, start the 140ms timer **and** record the origin. If the pointer moves >6px before the timer fires → it's a pan, cancel the radial. If the timer fires without movement → the wheel opens. Tap, hold-flick-release, and drag then all coexist unambiguously.

---

## 5.5 Real bugs, and features that don't do what the README says

### Data-loss class — fix these in Phase 1 regardless of sequencing

| # | Bug | Why it's bad |
|---|-----|--------------|
| 1 | **`app.js:567-569` — autosave dies permanently and silently.** `history` embeds up to 30 full deep copies of every block *inside* the project; `persistLocal` writes that whole structure to **two** localStorage keys (one a legacy alias). The quota error is swallowed by a bare `catch {}`. | Once the script grows past quota, autosave stops forever. **No user feedback.** This is the worst bug in the codebase. |
| 2 | **`app.js:547-556` — autosave overwrites the user's real file** 800ms after any keystroke, with `.catch(() => {})`. Every main-process `fs` call is sync with no `try`/`catch` (`main.js:170,199,224,230,234`); `app.js:459` has none either. | Saves fail **silently**. Combined with #1, both persistence paths can be dead at once with no indication. |
| 3 | **`app.js:1602` — revision restore replaces blocks without snapshotting current state first.** | One `confirm()` dialog away from unrecoverable loss. |
| 4 | **`app.js:144-148` — "Sync from scenes" is destructive.** `autoCardsFromScenes` (`engine.js:657-674`) rebuilds the array from scratch: every hand-written summary is destroyed. No merge on `sceneId`, no confirm. **Auto-fires on first Cards visit** (`app.js:1682-1685`). | Silent, automatic, unundoable destruction of the user's writing. |

### Correctness

- **`engine.js:192-198` — Fountain import is broken by a tautology.** `const u = line.trim().toUpperCase()` then guards on `u === line.trim().toUpperCase()` — always true. Intent was "line is already all-caps." So **any** line containing `" - DAY"` imports as a scene heading (e.g. *"He waited - DAY after day"*). Same tautology at `engine.js:206`: any line ending `"TO:"` becomes a transition regardless of case.
- **Fountain is not round-trip safe.** Import discards notes (`engine.js:289-292`), sections/synopses (`:295-298`), and boneyard (`:282-286`) — while export *writes* `[[notes]]` (`engine.js:177-180`) that a re-import then silently drops.
- **`app.js:1253-1256` — Shift+Tab is broken.** It inverts `TAB_CYCLE` by first-matching-value, but the map isn't a bijection (4 keys → `'action'`). Shift+Tab from Action always lands on Scene.
- **`app.js:1118-1122` — caret drops mid-block.** If a block contains `<br>`, every keystroke resets `textContent`; the caret is restored *only* if already at the end. Editing multi-line dialogue in the middle loses your place.
- **`app.js:1202` — dead logic.** `if (!text || atStart && !text)` reduces to `!text`. `atStart` is computed across `:1191-1201` then rendered irrelevant. Backspace at the start of a non-empty block never merges.
- **`app.js:1758-1770` — find/replace is index-fragile.** `state.findIndex` is never invalidated when the query changes, and `replaceAll`/`renderBlocks` don't reset it → **Replace can hit the wrong block.** Case-insensitive only; no regex, no whole-word, no match highlight (`app.js:1749` selects the whole block).
- **`app.js:305` vs `:431` — two load paths, two normalizations.** `sanitizeProject` runs on the autosave load path but **not** on `openProject`.
- **`app.js:1452` — attribute injection.** `style="background:${card.color}"` unescaped from project JSON. CSP blocks script execution, so not full XSS — but it's a hole.

### Mislabeled, not broken

- **The lint panel works.** `renderLintPanel` (`app.js:1632-1662`) off `E.lintScript` (`engine.js:579`). But `i.line` is a **block index** (`engine.js:587`, `n = i+1`) shown to users as `#12` like a line number. Click-jump reads `blocks[line-1]` (`app.js:1655`) — self-consistent, wrong label. It also re-runs on **every keystroke** via `refreshStats` (`app.js:1126`, `:1620`) with a full `innerHTML` rebuild.
- **`cards[].sceneId` is written** (`engine.js:665`) **and read by nothing.** No card→scene jump, no drag-reorder. The link the whole product thesis depends on is already half-scaffolded and inert.

### Why undo is *more* broken than it looks

`renderBlocks` does `root.innerHTML = ''` (`app.js:603`) on **every** Enter, Backspace, or type change. Chromium's native contenteditable undo history is scoped to one element **and dies with its DOM node**. So not only are structural edits permanently un-undoable — **your typing history is wiped every time you press Enter.**

---

## 6. Minor / passing observations

- `main.js:229-236` — `fs:readText` / `fs:writeText` accept an arbitrary renderer-supplied path with no validation. Low severity today (offline, CSP-locked, no remote content), but this becomes a real arbitrary-file-write primitive the moment the board imports files or the clipper opens a local port. Constrain to the project directory before Phase 5.
- `ui-chrome.js:50` — `playSound` does `a.cloneNode()` per keystroke with no pooling. A new `Audio` element per character will GC-thrash during fast typing. Move to WebAudio with pre-decoded buffers.
- `engine.js:34` — **`FORMAT.linesPerPage: 55` is wrong. It's 54.** Final Draft's own KB: *"a theoretical maximum of 54 lines (9 inches x 6 lines per inch)."* Independently confirmed by Story Sense's line grid (first text line = grid line 7; line 60 = 1" from bottom → 54). Every source claiming 55 says "approximately" and shows no work. See `docs/spec/pagination.md` §2 — including a correction-history note, because this document briefly claimed the opposite on the strength of those weaker sources.
  Note the constant is the *smaller* problem here: `estimatePages()` never wraps at word boundaries, so even a correct 54 gets applied to a wrong line count.
- `engine.js:762` — `dialogue: 35` is **correct** (Nicholl: 2.5" left / 2.5" right margins → 3.5" → 35 chars). Don't "fix" it to 30.
- `app.js:319` — a comment about stripping gutter labels that "used to leak into text when gutter was inside contentEditable" — evidence of prior model/DOM sync bugs. The current split (gutter outside the editable) is correct.
- `app.js:353` — uses `confirm()`; `app.js:451` uses `alert()`. Blocking native dialogs in Electron; also `app.js:451` says "Use the Platen desktop app for real files," implying this was once web-hosted.

---

## 7. What this means for the plan

The board and timeline are not blocked by their own difficulty. They're blocked by **undo, binary assets, and the file format** — all Phase-1 concerns.

And the thing the user actually asked for — *"write without worrying about scriptwriting errors"* — is precisely what Crack 1 breaks. Page count **is** the error class that matters most in screenwriting.

The fix for Crack 1 is structural, not a patch: there are three implementations of "page," so the fix is **one**. A single pure `paginate(blocks, format) → Page[]` feeding all three consumers (screen, stats, PDF) makes them agree *by construction*.

See `01-roadmap.md`.
