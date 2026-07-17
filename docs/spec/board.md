# Board — Specification

**Status:** Inventory **verified against Milanote's own help centre** (~30 articles fetched).
One item explicitly UNVERIFIED — §4.
**Decisions:** ADR-0002 (ink identity) · ADR-0003 (entity link) · ADR-0004 (assets)
**Directive:** *"find and include all of Milanote's features"* — with four honest exceptions (§7).

---

## 1. 🎯 The headline finding: **Milanote has no offline mode**

It is entirely cloud-based. **The desktop app still requires internet to view or edit boards.** Offline
is an open roadmap request ([poll.milanote.com/c/34][p34]).

This reframes the whole feature. Everything tagged `NEEDS-NET` / `NEEDS-SERVER` below is capability
Milanote has **only because** it's cloud. So:

> **An offline Electron board isn't a degraded Milanote. On the core canvas it's strictly better.**

Combined with ADR-0003 — **a board card *is* a scene** — that's the case for building it rather than
telling you to go use Milanote. It's offline, it's yours, and it knows what a screenplay is.

Milanote's own writer positioning ([writing-software][writing]) is *"the non-linear exploratory phase
that complements rather than replaces linear writing software."* **That's exactly the seam this board
occupies next to the script editor** — and they've already validated it for us.

---

## 2. Element types — the complete inventory

**Implemented?** column (2026-07-17 audit / master plan Phase 8): what DreamWrite actually ships today vs Milanote inventory. Update when Phase 8 gates land.

| # | Element | What it does | Tag | Implemented? |
|---|---------|--------------|-----|--------------|
| 1 | **Note card** | Rich-text card, the primary primitive. Double-click canvas creates one. Background colour incl. transparent. **No embedded images.** | `OFFLINE-OK` | **Yes** — title+body; double-click canvas; no rich-text/bg colors yet |
| 2 | **Image** | Upload/drag-drop. Resize bottom-right; **⌘/Ctrl while resizing = crop as you resize**. Crop, rotate, draw-on, caption toggle, colour strip, reactions, lock, download original. | `OFFLINE-OK` | **Partial** — toolbar import + caption + replace; no resize/crop/draw |
| 3 | **Link card** | Paste URL → unfurls to preview image + URL + description, all three individually toggleable. Drop a new image to replace the preview. Pasting a *board* URL converts it to a board shortcut. | `NEEDS-NET` (unfurl only) | **No** (skip — net) |
| 4 | **To-do list** | Checkboxes, titles, Tab/Shift+Tab sub-tasks, due dates + reminders, assignees. **Cannot be synced across boards.** | `OFFLINE-OK`; assignees/reminders `NEEDS-SERVER` | **Partial (8c)** — +To-do toolbar, checkboxes + text tasks; no due dates/assignees |
| 5 | **Sub-board** | A board as a card. See §4. | `OFFLINE-OK` | **Partial** — create + open; nest polish Phase 8d |
| 6 | **Column** | Vertical container cards snap into. Title, collapse/expand, resize, drop indicator on reorder, permanent card-count label. **Columns can't nest in columns**; boards/documents can go inside. | `OFFLINE-OK` | **Yes (8c)** — +Column, snap on drop, reorder by Y, collapse, count, unit drag |
| 7 | **Line / arrow** | Drag from the circle on a selected card's top-right, or from the toolbar. Anchors. Curve via centre marker; double-click handle to straighten. Text labels. Colour + weight. Shift constrains. | `OFFLINE-OK` | **Dead feature** — modeled + rendered, **no create UI** (Phase 8b) |
| 8 | **Comment card** | Standalone **or** attached to a card (drag-and-hold until it shrinks to a marker). Threaded replies, @mentions, reactions. | see §7 — partly `OFFLINE-OK` | **No** (collab skip) |
| 9 | **Table** | Cell types: Auto, Number, Currency, Percentage, Checkbox, Text, Date/Time. Drag to add rows/cols, resize, reorder headers. **Text/numbers/checkboxes only — no images or nested elements. Row height fixed.** | `OFFLINE-OK` | **Partial** — basic table + row/col |
| 10 | **Table formulas** | Press `=`. Date&Time, Math&Trig, Statistical, Text, Logical, Financial, Lookup&Reference, Engineering, Information — SUM, VLOOKUP, IF, PMT, CONCATENATE, STDEV, NPV… | `OFFLINE-OK` | **Partial** — limited formula support if present; not full Milanote set |
| 11 | **Sketch card** | Dedicated resizable drawing card; double-click to open. | `OFFLINE-OK` | **No** (skip) |
| 12 | **Draw tool** | Freehand scribble **anywhere on the canvas**, not confined to a card. | `OFFLINE-OK` | **No** (skip) |
| 13 | **Draw-on-image** | Annotate an image; strokes resize *with* the image. | `OFFLINE-OK` | **No** (skip) |
| 14 | **Document** | Long-form text container, distinct from a note. Notes auto-offer conversion past a length. Icon or preview via **Card View**. Exports PDF/Word/Markdown/plain text. **Text only — no images.** | `OFFLINE-OK` | **No** |
| 15 | **File attachment** | Any supported file as a card. | `OFFLINE-OK` | **No** |
| 16 | **Video** | **Upload** (mp4/mkv/webm/mov/avi/mpeg) → autoplay, loop, custom thumbnail. **Embed** (YouTube/Vimeo) → live player. | upload `OFFLINE-OK` / embed `NEEDS-NET` | **No** (skip) |
| 17 | **Audio** | **Upload** (mp3/m4a/wav/opus/oga) → autoplay + loop. **Embed**: Spotify, SoundCloud, YouTube Music, Bandcamp, Mixcloud, Apple Music, Vimeo. **No recording, no waveform editing.** | upload `OFFLINE-OK` / embed `NEEDS-NET` | **No** (skip) |
| 18 | **Map card** | **Google Maps only.** Paste a share link → interactive embed. | `NEEDS-NET` | **No** (skip) |
| 19 | **Colour swatch** | Auto-picks a colour from board images and names it. Paste HEX, picker sliders, or **eyedropper from board images**. Display HEX/RGB/HSL. | `OFFLINE-OK` | **Partial (8c)** — semantic ink palette on selection (no free picker / eyedropper) |
| 20 | **Synced note** | Duplicate → "Keep this copy in sync" → all copies update together. Indicator shows which boards hold copies. **Notes only** — not images, links, or to-dos. | `OFFLINE-OK` | **No** (skip) |
| 21 | **Board shortcut** | An alias. Right-click → "Create a shortcut to this board". Deleting the original breaks shortcuts; deleting a shortcut doesn't affect the original. | `OFFLINE-OK` | **No** |
| 22 | **Reactions** | Emoji on images, notes, comments. | solo `OFFLINE-OK` / shared `NEEDS-SERVER` | **No** |
| — | **Scene-card** | Script scene as board card (entity link). | DreamWrite | **Yes** — Sync scenes |
| — | **Selection / marquee / resize** | Canvas multi-select and card resize. | — | **No** (Phase 8a) |

**Link-card embed sources** (all `NEEDS-NET`): YouTube, Vimeo, TED, SoundCloud, Google Maps, CodePen,
Instagram, Dribbble, Flickr, Slideshare, Prezi, Marvel, Airtable, Threads, Behance.

### ⚠️ Do NOT build these as "parity" — Milanote doesn't have them

Verified as **open roadmap votes, not shipped**: vector **shapes** ([c/17][p17]) · **stickers**
([c/20][p20]) · **diagram tools** ([c/18][p18]) · **custom board backgrounds** ([c/63][p63]) ·
user-defined colour palettes.

> Several review sites (Noteey and others) claim Milanote has *"sticky notes, shapes, lines and freehand
> drawing."* **The shapes claim is false.** The note card *is* the sticky note; there is no shape
> palette. Don't let review-sourced specs sneak in as parity features — they'd be net-new work.

---

## 3. Canvas mechanics

All `OFFLINE-OK`.

- **Pan** — drag empty canvas; two-finger trackpad
- **Zoom** — ⌘/Ctrl +/− · ⌘/Ctrl+scroll · pinch · **`Z` = zoom to fit all** · View-menu slider
- **Grid** — faint dot grid + **smart guides** while dragging. ⚠️ **Advisory only — true snap-to-grid is
  a roadmap request ([c/92][p92]), not shipped.**
- **Multi-select** — ⌘/Ctrl+A · marquee by dragging empty canvas
- **Group/ungroup** — ⚠️ **no true group primitive.** Columns and boards *are* the grouping mechanism.
  Right-click a multi-selection → group into a column.
- **Duplicate** — Alt/Option+drag · right-click → Duplicate · ⌘/Ctrl+C/V
- **Copy/paste styles** — ⌘/Ctrl+Shift+V between cards
- **Lock** — right-click → Lock Position. Prevents moving **and deleting**.
- **Resize** — bottom-right handle on essentially everything
- **Rotation** — ⚠️ **images only**, inside the image editor. No arbitrary card rotation.
- **Z-order** — ⚠️ **UNVERIFIED.** No layer / bring-to-front controls documented anywhere. Probably
  absent, but absence can't be proven from docs.
- **Delete** — select + Delete (**notes must be empty first** — a nice guardrail worth copying), or drag
  to the trash zone at screen bottom

---

## 4. Nested boards — the killer feature

Create by making a board inside a board, **or by dragging an existing board onto another**.

- **Breadcrumbs** — top-left, full path of the traversal
- **Moving between levels** — four documented methods: (a) drag content onto a board's icon; (b) **drag
  and hold over a breadcrumb entry ~1 second → that board opens → drop**; (c) drag and hold over a board
  tile to open it and place content precisely; (d) right-click Copy → navigate → Paste. Also: drag boards
  onto breadcrumb titles to move them **up** a level.
- **Depth limit** — none documented. Assume unlimited.
- **Home board** — the root. Cannot be shared, exported, or templated. Default web-clipper destination.

### ⚠️ Sub-board preview on the parent canvas — UNVERIFIED

**This was flagged as important and could not be verified.** Milanote's nesting article
([9860073][nest]) is **silent** on how a sub-board tile renders its children. The only confirmed fact is
a Feb 2023 announcement ([x.com][xpost]) that boards have selectable **background-colour + icon**
combinations.

Whether tiles show a **content thumbnail / mini-preview of child cards** is undocumented in every source
searched. **This needs eyes-on verification** — it's a visible, load-bearing design decision for a
board-in-board UI, and it will not be fabricated here.

> **Action:** open a real Milanote board and look, or drive it with the Chrome MCP tools
> (`mcp__claude-in-chrome__*`). Ten minutes, settles it.

**Design notes for our implementation** (independent of what they do):
- If we render previews: cache them, re-render only on a child's dirty flag, **never per frame**.
- Items must drag **between** levels, including *into* a sub-board tile on the parent.
- **Guard against cycles** — a board containing itself via a move.

---

## 5. Templates

**12 Creative Writing templates** ([milanote.com/templates/creative-writing][ctpl]): Novel Plan · Story
Brainstorming · Novel Research · **Story Map** · **Story Outline** · **Character Profile** ·
**Character Relationship Map** · **Three Act Structure** · **World Building** · **Hero's Journey** ·
Novel Moodboard · Novel Marketing Plan. Plus a **Story Arc** template (opening → rising action → climax
→ resolution). Adjacent: Storyboards, Filmmaking, Novel Outlines, Moodboards, Game Design.

**System:** 100+ templates across 38 categories, all free. Picker appears bottom-right on every newly
created board. **Custom templates:** right-click board → "Convert to template"; "Revert template to
board" undoes it.

All `OFFLINE-OK` — **templates are just board structures.** Ship as bundled JSON. Cheap, high-leverage,
and the writing ones map directly onto what a screenwriter actually needs.

---

## 6. Keyboard shortcuts

Press **`/`** in-app to show the menu.

**Adding** — Double-click canvas = new note · ⌘/Ctrl+Enter = add another note/board/column
**Duplicate/Delete** — Option/Alt+drag = duplicate · Delete (notes must be empty first)
**Formatting** — ⌘⇧1 Large heading · ⌘⇧2 Normal heading · ⌘B Bold · ⌘I Italic · ⌘U Underline ·
⌘⇧U Bullet list · ⌘⇧O Numbered list · ⌘K Link · ⌘J Highlight · ⌘⇧X Strike-through · ⌘`>` Code block ·
⌘`"` Quote · Tab / Shift+Tab Indent · ⌘`\` Align centre
**Editing** — ⌘Z Undo · ⌘C/⌘V · **⌘⇧V Paste styles**
**Selection** — ⌘A Select all · Esc Deselect
**Navigation** — ⌘F Search · ⌘`[` Back · ⌘`]` Forward · **⌘U Go to parent board**
**Zoom** — `Z` fit · ⌘+ / ⌘− · ⌘+scroll
**Image** — hold ⌘/Ctrl while resizing = crop as you resize

⚠️ **Collision needing a decision: ⌘U is BOTH Underline (in text) and Go-to-parent-board (on canvas).**
Milanote resolves it by context. Mirror deliberately or fix — but decide, don't inherit by accident.

⚠️ Docs list **no Redo shortcut** (only Undo). ⌘⇧Z is presumably it — **unverified**.

---

## 7. The four honest exceptions

Everything is `OFFLINE-OK` except these. Flagging rather than silently breaking *"No accounts.
Scripts stay on your machine"* — or silently dropping the ask.

| Feature | Requires | Recommendation |
|---------|----------|----------------|
| **Real-time collaboration** | server **and** accounts | **Don't.** Inverts the product's premise. If multi-writer matters, the offline-native answer is file-based merge (CRDT or Fountain diff), not a server. Worth its own decision. |
| **Comments / @mentions / notifications** | server | **Partially do it.** Comment *cards* work fine offline — solo margin notes are a real screenwriting workflow. Only mentions, notifications, and cross-user threading need a server. **Build the card; skip the social layer.** |
| **Pexels stock library (3M images)** | network + API key | **Opt-in, off by default.** Needs a CSP carve-out. Least relevant feature to screenwriters. Offline-native alternative: point at a local folder. |
| **Web clipper** | a browser extension → the app over a **localhost port** | **Doable, sequence last.** Separate deliverable (a Chrome extension) and a real security surface. `ecc:security-reviewer` mandatory. |

**Also server-bound but cheap to substitute:** share links/permissions · to-do **assignees**
(due *dates* are offline-fine; only push reminders aren't).

### Graceful degradation for the `NEEDS-NET` six

Link unfurl → an un-unfurled link card is still a titled, clickable card. Video/audio embed → upload
covers most real use. Maps → a pasted screenshot. **Only Pexels is a genuine loss**, and it's the least
relevant.

---

## 8. 🎁 Milanote *lacks* these — and they're all cheap for us

| Missing from Milanote | Their situation |
|-----------------------|-----------------|
| **Version history** | roadmap request ([c/65][p65]) only. Their answer to lost content is *"contact support."* We get it free from ADR-0004's revisions. |
| **A real archive** | their docs literally recommend **naming a board "Archive"** as a workaround |
| **Persistent sidebar board tree** | breadcrumbs + search only |
| **Snap-to-grid** | advisory smart guides only ([c/92][p92]) |
| **Shapes** | ([c/17][p17]) |
| **Offline** | ([c/34][p34]) — the whole point |

### Constraints NOT worth copying

Single-page PDF/PNG export limit (a cloud-render artifact — no reason to exist locally) · tables being
text-only · **documents being image-free**. For screenwriters, a document that holds an inline image is
probably the right call.

---

## 9. Ink identity (ADR-0002)

Milanote is bright, white, colourful. Platen is monochrome carbon/ink/paper.

**Take the interaction model. Render it in ink.** Cream canvas, paper grain, letterpress cards, ink-edge
shadows. **Colour is semantic only** — act, thread, character, status — never decorative.

The constraint is a feature: without hue to lean on, hierarchy comes from scale, weight, and space.
That tends to produce a better wall than confetti anyway.

---

## 10. Security gate — before Phase 4

`fs:readText` / `fs:writeText` (`main.js:229-236`) accept **any** renderer-supplied path, unvalidated.
Harmless today (offline, CSP-locked). The moment the board imports files — or the clipper opens a local
port — it's a real arbitrary-file-write primitive.

**Constrain to the project directory before this phase ships.** `ecc:security-reviewer`.

---

## Sources

Help centre (~30 articles): [`adding-organizing-content` index][idx] · [keyboard shortcuts][kbd] ·
[images][img] · [links][lnk] · [lines][lin] · [tables][tbl] · [formulas][fml] · [drawing][drw] ·
[synced notes][syn] · [text formatting][txt] · [videos][vid] · [to-do lists][todo] · [map cards][map] ·
[documents][doc] · [columns][col] · [audio][aud] · [comments][cmt] · [labels][lbl] ·
[colour swatches][swa] · [nesting boards][nest] · [moving content between boards][mv] · [locking][lck] ·
[duplicating][dup] · [zoom][zm] · [board shortcuts][sc] · [home board][hb] · [custom templates][ctm]
Plus: [creative-writing templates][ctpl] · [writing-software positioning][writing] · [releases][rel]
Roadmap polls: [offline c/34][p34] · [shapes c/17][p17] · [stickers c/20][p20] · [diagrams c/18][p18] ·
[backgrounds c/63][p63] · [snap-to-grid c/92][p92] · [board history c/65][p65]

[idx]: https://help.milanote.com/en/collections/166826-adding-organizing-content
[kbd]: https://help.milanote.com/en/articles/111393-keyboard-shortcuts
[img]: https://help.milanote.com/en/articles/359381-images
[lnk]: https://help.milanote.com/en/articles/1722065-links
[lin]: https://help.milanote.com/en/articles/111391-lines
[tbl]: https://help.milanote.com/en/articles/8584584-tables
[fml]: https://help.milanote.com/en/articles/8584809-formulas-functions-for-tables
[drw]: https://help.milanote.com/en/articles/5537688-drawing
[syn]: https://help.milanote.com/en/articles/5147264-synced-notes
[txt]: https://help.milanote.com/en/articles/4675110-text-formatting
[vid]: https://help.milanote.com/en/articles/10478926-videos
[todo]: https://help.milanote.com/en/articles/10486983-to-do-lists
[map]: https://help.milanote.com/en/articles/10684375-map-cards
[doc]: https://help.milanote.com/en/articles/10458661-documents
[col]: https://help.milanote.com/en/articles/10478526-columns
[aud]: https://help.milanote.com/en/articles/10684339-audio
[cmt]: https://help.milanote.com/en/articles/10684379-comments
[lbl]: https://help.milanote.com/en/articles/15442078-labels
[swa]: https://help.milanote.com/en/articles/2497222-color-swatches
[nest]: https://help.milanote.com/en/articles/9860073-nesting-boards
[mv]: https://help.milanote.com/en/articles/491831-moving-content-between-boards
[lck]: https://help.milanote.com/en/articles/4357447-locking-an-item-to-your-board
[dup]: https://help.milanote.com/en/articles/111397-duplicating-content
[zm]: https://help.milanote.com/en/articles/1721940-zoom-in-out
[sc]: https://help.milanote.com/en/articles/2110465-create-a-shortcut-to-a-board
[hb]: https://help.milanote.com/en/articles/9860047-what-is-the-home-board
[ctm]: https://help.milanote.com/en/articles/1945249-custom-templates
[ctpl]: https://milanote.com/templates/creative-writing
[writing]: https://milanote.com/product/writing-software
[rel]: https://milanote.com/releases
[xpost]: https://x.com/milanote/status/1621309152118329344
[p34]: https://poll.milanote.com/c/34
[p17]: https://poll.milanote.com/c/17
[p20]: https://poll.milanote.com/c/20
[p18]: https://poll.milanote.com/c/18
[p63]: https://poll.milanote.com/c/63
[p92]: https://poll.milanote.com/c/92
[p65]: https://poll.milanote.com/c/65
