# ADR-0006 — One pagination engine, three consumers

**Date:** 2026-07-16
**Status:** Accepted
**This is the most important decision in the plan.**

## Context

Platen currently has **three independent notions of "page"**, computed by three different algorithms, none of them the industry's:

| Where | How | Correct? |
|-------|-----|----------|
| The screen | one static `<div class="page">` + hardcoded `<div id="pageNumber">1.</div>` (`index.html:146-150`) | No — one fake infinite page |
| The stats panel | `estimatePages()` — `Math.ceil(text.length / charsPerLine(type))` (`engine.js:726-760`) | No — character count, not word-wrap |
| The PDF | Chromium's print engine, one explicit break after the title page (`engine.js:793-806`) | No |

`estimatePages` divides raw character count by a column width. Real text wraps at **word** boundaries, so a 35-column dialogue line rarely holds 35 characters. The error is systematic — it always under-counts — and compounds over 100 pages.

**1 page = 1 minute is the industry's fundamental unit.** Contracts, budgets, and shooting schedules key off page count. Getting it wrong isn't a cosmetic bug; it makes the tool untrustworthy for the job it exists to do. And the stated product goal is *"write without worrying about scriptwriting errors."*

## Decision

**The bug is that there are three implementations. The fix is one.**

```js
// core/script/wrap.js       — pure
wrap(text, columns) -> string[]           // greedy word-wrap

// core/script/paginate.js   — pure
paginate(blocks, format) -> Page[]
  Page = { number, rows: Row[] }
  Row  = { blockId, type, text, isContinuation }
```

Three consumers, one source of truth:

| Consumer | After |
|----------|-------|
| Screen | renders `Page[]` → a real multi-page paper stack |
| Stats | `pages.length` |
| PDF | renders the same `Page[]` with explicit page breaks |

They agree **by construction**. Not by being carefully kept in sync — by there being nothing to sync.

## Supporting fixes (same phase)

- **Embed Courier Prime as base64 `@font-face` in the print HTML.** The PDF currently asks for `"Courier New", Courier, monospace` and declares no `@font-face` at all (`engine.js:849`), while the screen renders Courier Prime (`styles.css:6-8`). Same 10 cpi, different vertical metrics → breaks land differently. And `main.js:216` serves the print HTML from a `data:` URL — an opaque origin that could not reach `../assets/fonts/` even if asked. Base64 is the origin-proof fix.
- **Page numbers** — top-right, from page 2. Not currently emitted at all.
- **`(MORE)` / `CHARACTER (CONT'D)`** at dialogue breaks. Impossible today; falls out of `paginate()`.
- **Replace the magic `setTimeout(350)`** (`main.js:218`) with `document.fonts.ready` + an explicit ready ping. It's a race today.
- **54 vs 55 lines/page — settled: 54.** Final Draft's own KB states *"a theoretical maximum of 54 lines (9 inches x 6 lines per inch)"*; Story Sense's line grid confirms it independently (text runs grid lines 7–60). Sources claiming 55 all hedge with "approximately" and never derive it. **`FORMAT.linesPerPage: 55` (`engine.js:34`) is wrong → 54.** And 54 is a **ceiling the break rules pull back from**, not a target — the bottom margin is a minimum, not a fixed value. Never pad to fill. Cited in `docs/spec/pagination.md` §2.

## Verification — the acceptance gate

**Golden-file test:** take a public-domain screenplay in Fountain, paginate, assert the page count against a known-good reference.

Without this, we've only replaced one guess with another.

And then, because this is integration-shaped: **export a real PDF, open it, count the pages, check the font.** Every one of the four cracks in `00-findings.md` would have survived a passing unit suite.

## Consequences

- We will not match Final Draft to the line, ever. Neither do Fade In, WriterDuet, or Highland — they disagree with each other. **Bar: ±1 page over 100 pages.** Document the deviation rather than pretending.
- `estimatePages()` and `FORMAT.linesPerPage` get deleted, not fixed.
- The editor becomes a real paged surface. This is a visible change to the writing experience and needs care — a paginating editor that re-flows while you type is distracting. Debounce; paginate off the hot path; never move the caret.
- Once pagination is real, downstream production features (scene numbering, sides, revision pages, colored pages) become possible. They are not possible today.
