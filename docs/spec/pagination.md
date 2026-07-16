# Pagination — Specification

**Status:** Constants **verified and cited.** Three items explicitly UNVERIFIED (§8) — do not invent them.
**Decision:** ADR-0006 (one engine, three consumers)
**Replaces:** `estimatePages()` (`engine.js:726`) — deleted, not fixed.

> **Best source found:** the **Movie Magic Screenwriter 6.5 manual** documents its pagination engine as
> tunable settings *with stated defaults* — the closest thing to a published algorithm that exists.
> Final Draft behaves equivalently. Where this spec says VERIFIED, it's a direct quote from a cited
> source. Where it says UNVERIFIED, **do not bake in a plausible number** — that is exactly how
> `estimatePages()` happened.

---

## 1. Why this exists

Platen has three notions of "page" and none is the industry's (`docs/plan/00-findings.md`, Crack 1):
one fake infinite page on screen, a character-count guess in the stats, and Chromium breaking the PDF
wherever it likes.

**1 page ≈ 1 minute** is what contracts, budgets, and schedules key off. It's a *script-level average,
not a scene-level guarantee* — rapid dialogue plays fast, action pages run long. That's still the unit,
and it's the error class that matters most in an app pitched as *"write without worrying about
scriptwriting errors."*

---

## 2. Page geometry — **54 lines, settled**

| Property | Value | Status |
|----------|-------|--------|
| Page | 8.5" × 11" US Letter | VERIFIED |
| Top margin | 1.0" (6 lines) | VERIFIED |
| Bottom margin | **1.0" MINIMUM** — floats to ~0.5" | VERIFIED |
| Left margin | 1.5" | VERIFIED |
| Right margin | 1.0" → text right edge **7.5"** | VERIFIED |
| Font | 12pt Courier — **10 cpi, 6 lpi** | VERIFIED |
| Grid | 66 lines (grid line *n* sits at *n*/6 inches from top) | derived, corroborated |
| **Body lines** | **54** (grid lines **7–60**) | VERIFIED |

### The 54-vs-55 question — resolved, and this document previously got it wrong

**54.** Derivation: `(11" − 1" top − 1" bottom) × 6 lpi = 9" × 6 = 54`.

Two independent sources confirm it from opposite directions:

1. **Final Draft's own KB**: *"a theoretical maximum of **54 lines (9 inches x 6 lines per inch)**"* ([FD KB][fdkb])
2. **Michael Ray Brown / Story Sense**: *"The first line of text should appear on the **seventh line** from
   the top of each page"* + title-page contact info *"an inch from the bottom of the page (**i.e. line 60**)"*
   → lines 7–60 = **54** ([Story Sense][ssfmt])

Both statements fit exactly one model, and it's the same model.

**55 is a rounding error.** StudioBinder: *"**approx.** 55 lines per page."* Script Serious:
*"**approximately** 55 lines."* Neither shows its work; both hedge. **Every source that derives the
number gets 54.**

> ⚠️ **Correction history — read this, it's the lesson.** An earlier revision of this spec claimed 55,
> citing blog posts. That was wrong: it weighted hedged secondary sources over Final Draft's own
> derivation. **`engine.js:34`'s `linesPerPage: 55` is genuinely wrong and must become 54.**
> When sources conflict, prefer the one that shows its arithmetic.

### 54 is a **ceiling**, not a target

The bottom margin is a **minimum**, not a fixed value — Screenwriter: *"the **minimum** amount of space
between the last line of Text on the page and the bottom edge."* Story Sense: the bottom margin
*"varies, according to the rules for where it's permissible to break a page, but the target is between
half an inch and an inch."*

**Treat 54 as a ceiling that the break rules pull back from. Never pad to fill.**

### Line spacing — model Normal only

Final Draft's Loose/Normal/Tight/Very Tight shifts counts materially: a 100-page Normal script becomes
90 at Very Tight, 107 at Loose. FD *"strongly recommends"* Normal. **Model Normal only.** ([FD KB][fdkb])

⚠️ **Caveat:** FD ships its own *Courier Final Draft* font. Exact FDX parity may require those metrics.
Story Sense warns Courier New is *"too thin."* We render Courier Prime — expect small deviation.

---

## 3. Element geometry

**Two traditions exist.** Use **Column A** — Final Draft's default, and the Academy Nicholl spec
(*"Left margin: 1.5 inches; Right margin: 1.0 inch / Dialogue margins: Left, 2.5 inches; Right, 2.5
inches"*). ([Nicholl][nicholl])

### A — Final Draft / Nicholl (**use this**)

| Element | Left | Right edge | Width | Left col | Width (chars) | Status |
|---------|------|-----------|-------|----------|---------------|--------|
| Scene heading | 1.5" | 7.5" | 6.0" | 15 | **60** | VERIFIED |
| Action | 1.5" | 7.5" | 6.0" | 15 | **60** | VERIFIED |
| Shot | 1.5" | 7.5" | 6.0" | 15 | 60 | left VERIFIED; same-as-action UNVERIFIED |
| Character cue | 3.7" | — | — | 37 | — | left VERIFIED; **max width UNVERIFIED** |
| Parenthetical | 3.1" | 6.0" | 2.9" | 31 | 29 | left VERIFIED; **right edge CONFLICTING** |
| Dialogue | 2.5" | 6.0" | **3.5"** | 25 | **35** | VERIFIED |
| Transition | 6.0" | 7.5" | 1.5" | 60 | 15 | treat as flush-right |

### ⚠️ Dialogue width — resolved to **35**, and this document previously got it wrong

Nicholl's *"Dialogue margins: Left, 2.5 inches; Right, 2.5 inches"* → `8.5 − 2.5 − 2.5 = 3.5"` = **35
chars**. Corroborated by Wikibooks: dialogue *"cut off at 35 characters (including spaces) per line."*

> ⚠️ An earlier revision of this spec said **30**, reading a secondary table's "2.5″ to 5.5″" as the
> right *edge*. It isn't — a 2.5" right **margin** puts the right edge at **6.0"**. **`engine.js:762`'s
> `dialogue: 35` was correct all along.** Story Sense's competing "33 characters" is a different
> tradition (Column B below), not a correction.

### B — classic pica (Story Sense) — reference only, do not implement

| Element | Left | Right margin | Width |
|---------|------|--------------|-------|
| Action | 1.5" | 1.0" | 6.0" |
| Dialogue | 2.9" | 2.3" | 3.3" |
| Character cue | 4.2" | 1.0" | 3.3" |
| Parenthetical | 3.6" | 2.9" | 2.0" |

### Two rules engines routinely get wrong — VERIFIED

- **Parenthetical wrap OUTDENTS.** Screenwriter: *"wraps parenthetical text so that the second line
  text lines up under the first line text and not the parenthesis. Pushes wrapped text over by one
  character space."*
- **Never justify, never hyphenate.** *"Do not justify the margins."* *"When wrapping lines, do not
  insert hyphens to break words."* → **ragged right, whole words only.** This is why `wrap()` must be
  greedy word-fitting, and why `text.length / cols` was never going to work.

---

## 4. Blank lines

| Transition | Blanks | Status |
|------------|--------|--------|
| Before scene heading | **2** (1 acceptable) | VERIFIED |
| Scene heading → action | 1 | VERIFIED |
| `FADE IN:` → first scene heading | 1 | VERIFIED |
| Character cue → parenthetical | **0** | VERIFIED |
| Character cue → dialogue | **0** | VERIFIED |
| Parenthetical → dialogue | **0** | VERIFIED |
| Action → action | 1 | CONVENTION — consistent across every example, not numerically cited |
| Action → character cue | 1 | CONVENTION |
| Dialogue → action | 1 | CONVENTION |
| Dialogue → next character cue | 1 | CONVENTION |
| Before/after transition | 1 | CONVENTION |

Single-spaced within elements (VERIFIED).

**The 2-vs-1 fork before scene headings is real and expensive:** *"Triple-space (making two blank lines)
before each scene heading. It's acceptable to double-space, but triple spacing is standard."* FD emits 2.
→ **Make it config, default 2.** This moves feature page counts by *several pages*.

---

## 5. Page-break rules

### Minimums — VERIFIED (Movie Magic Screenwriter defaults)

| Setting | Value | Quote |
|---------|-------|-------|
| Minimum Dialogue Lines on a Page | 1–10, **default 2** | *"not to break a Dialogue element unless there are at least this number of Dialogue lines **both before and after** the page break"* |
| Minimum Action Lines on a Page | 1–10, **default 2** | identical wording |

**≥2 lines on *each side*, for dialogue and action.** Can't satisfy → move the whole element to the
next page.

### Break-position policy — VERIFIED

| Mode | Behaviour |
|------|-----------|
| **Sentence Ends Only** ← **use this** | *"at the end of a sentence **or between Dialogue and Parenthetical** only"* |
| Sentence Ends Preferred | sentence end if one exists within 3 lines; else mid-sentence |
| Maximum Lines on Page | mid-sentence, maximise fill |
| Do Not Break | never splits |

**Gotcha:** min-lines is *"Not used when Sentence Ends Only is selected."* → ship **Sentence Ends Only
+ the 2-line guard** (the conservative intersection of both rules).

### Hard rules — VERIFIED

**Never end a page with:** scene heading · shot · character cue · parenthetical-under-cue · cast list ·
the line before `END OF ACT` / `END OF SCENE`
**Never start a page with:** transition

| Rule | Answer |
|------|--------|
| Break inside a parenthetical | **NO.** Before one, yes. |
| Break between cue and first dialogue line | **NEVER** — atomic. *"Character Name (never break after)"* |
| Scene heading last on page | **NEVER** unless another heading tops the next page; needs ≥2 action lines after |
| Transition first on page | **NO** — *"unconventional… part of the element preceding the Transition is broken to appear at the top of the new page"* |
| Orphan exception | *"Allow Orphaned Scene Headings and Shots when Followed by Non-Printing Elements — **default unchecked**"* → force to top of next page |

### `(MORE)` / `(CONT'D)` — exact placement, VERIFIED

Screenwriter's own rendering:

```
                    WAITRESS
        Anything else?
                  (MORE)
--------------------- page break ---------------------
                                                  11.

                    WAITRESS (CONT'D)
        Sir, can I get you anything else?
```

| Item | Spec |
|------|------|
| `(MORE)` indent | **3.7"** — the character-cue margin. *"appears on its own line at the same margin as the character cue"* |
| ↳ conflict | Screenwriting.io says *"centered under the dialogue."* FD and Screenwriter **both emit at the cue margin** → use 3.7" |
| Top-of-page cue | `NAME (CONT'D)` at the normal cue margin |
| With an existing extension | Screenwriter separator *"Default is the semi-colon"* → `NAME (V.O.; CONT'D)`. FD defaults `NAME (V.O.) (CONT'D)`. **Support both.** |
| Casing | `(MORE)` / `(more)` both professional, configurable. FD ships uppercase. |

### `(CONT'D)` after intervening action — a *different* rule

Same character, same scene, separated by action → the second cue gets `(CONT'D)`.
Modes: No Auto / **Extension** (`KATY (CONT'D)`) / Only when Extensions Match / Parenthetical.

**Contested on principle.** John August made Highland *not* auto-insert: for page breaks *"there's no
authorial intent"*; for interruptions *"you'll absolutely want to use (cont'd)."* ([John August][ja])
→ **make it a toggle, and inject at paginate time — never into the document model.** FD defaults on.
Partial logic already exists at `engine.js:540-559`.

### Page numbers — VERIFIED

| Property | Value |
|----------|-------|
| Position | top-right, flush to the right margin (7.5"), **0.5" from top = grid line 3** |
| Format | number + period — `2.` — **never** "Page 2" |
| First numbered | **page 2.** Page 1 unnumbered; title page unnumbered *and uncounted* |
| Font | 12pt Courier |

Currently **not emitted at all**. Worth exposing: **Starting Page Number** (default 1) and **Start
1st/Forced Page on Line #** (sitcom formats).

---

## 6. The constants object

```
PAGE:   8.5 x 11, marginTop 1.0, marginBottom 1.0 (MINIMUM), marginLeft 1.5, marginRight 1.0
GRID:   cpi 10, lpi 6, gridLines 66, bodyLines 54, firstBodyLine 7, lastBodyLine 60
PAGENO: line 3, alignRight 7.5", format "{n}.", startAt page 2

ELEMENTS (left, rightEdge, widthChars, blanksBefore):
  sceneHeading  1.5  7.5  60  2      // blanksBefore is CONFIG, default 2
  action        1.5  7.5  60  1
  shot          1.5  7.5  60  2
  character     3.7  7.5  38  1      // atomic w/ first dialogue line; width UNVERIFIED
  parenthetical 3.1  6.0  29  0      // outdent wrap +1 char; right edge CONFLICTING
  dialogue      2.5  6.0  35  0
  transition    6.0  7.5  15  1      // flush right; never first on page
  more          3.7                  // at CHARACTER margin; counts toward the break
  dualDialogue  -- UNVERIFIED, DO NOT SPEC --

BREAKS: minDialogueLines 2 (both sides), minActionLines 2 (both sides),
        breakPolicy SENTENCE_ENDS_ONLY, sentencePreferredLookback 3,
        countMoreLine true, allowTransitionFirstOnPage false,
        atomic [character + firstDialogueLine, parenthetical],
        neverLast [sceneHeading, shot, character, parenthetical]
```

---

## 7. The engine

```js
// core/script/wrap.js — pure
wrap(text, columns) -> string[]         // GREEDY WORD-FITTING. never hyphenate, never justify.

// core/script/paginate.js — pure
paginate(blocks, format) -> Page[]
  Page = { number, rows: Row[] }
  Row  = { blockId, type, text, isContinuation }
```

Three consumers, one source (ADR-0006) — screen, stats, PDF all render the same `Page[]`. They agree
**by construction.**

### 🚩 Three implementation traps

1. **Reserve the `(MORE)` line BEFORE choosing the break point,** or you overflow by one.
   *"Count (MORE) Line in Page Breaking"* — checked → *"(MORE) is considered part of the Dialogue
   element for page breaking purposes."* **This is the classic off-by-one.**
2. **Blanks-before-scene-heading is config (default 2)** and shifts feature page counts by several pages.
3. **Locked pagination is a distinct engine mode** — production drafts pin breaks and overflow into
   **A-pages** instead of reflowing. *Cheap to design for now, painful to retrofit.* Don't build it yet;
   don't foreclose it.

### PDF fixes (same phase)

- **Base64-embed Courier Prime** as `@font-face`. Today the print HTML asks for `"Courier New", Courier,
  monospace` with no `@font-face` at all (`engine.js:849`) while the screen renders Courier Prime
  (`styles.css:6-8`). The `data:` URL (`main.js:216`) is an opaque origin that couldn't reach
  `../assets/fonts/` even if asked.
- Emit page numbers per §5.
- Replace `setTimeout(350)` (`main.js:218`) with `document.fonts.ready` + an explicit ready ping.

---

## 8. Acceptance gate & open items

**Golden-file test.** Paginate a public-domain screenplay in Fountain; assert the page count against a
known-good reference. Then **export a real PDF, open it, count the pages, check the font** — every crack
in `00-findings.md` would have survived a passing unit suite.

**Bar:** ±1 page over 100 pages vs. Final Draft. Fade In, WriterDuet and Highland don't match each other
either. Document the deviation rather than pretending.

### Still UNVERIFIED — do not invent

| Item | Status |
|------|--------|
| **Dual dialogue geometry** | **No published geometry exists.** Screenwriter exposes it as fully user-configurable. Only hard constraint found: *"the left margin of the first dialogue column must be inset slightly. It must not start in the same column as the action or description margin."* **Validate against real FDX output.** |
| Character cue max width | UNVERIFIED (38 is a placeholder) |
| Parenthetical right edge | **Genuinely unsettled** — 6.0" (29 ch) / 5.6" (20 ch) / Wikibooks 16 ch; Celtx hedges *"between 3.1 and 3.4 inches"*. Left 3.1" is safe; width is a judgement call. |
| Shot = action geometry | UNVERIFIED (assumed) |
| Action → action blank lines | CONVENTION, not numerically cited |

### Researched but not yet written up (available on request)

- **Fountain spec** — complete, including the traps: `=` is overloaded (1 = synopsis, 3+ = page break);
  `>` is overloaded (`>x` transition vs `>x<` **centered action**); character = uppercase + blank before
  + **no blank after** (negative-space logic); two-spaces-on-a-blank-line is *semantic* — **never trim
  trailing whitespace**; *"won't look past double line breaks for closing elements, except boneyard"*;
  *"When in doubt, Fountain returns text as Action."*
- **Revision colours** — White/Blue/Pink/Yellow/Green/Goldenrod are universal; **positions 7–10 genuinely
  conflict** across sources.

---

## Sources

- [fdkb]: <https://kb.finaldraft.com/hc/en-us/articles/15575339757716-How-many-lines-per-page-does-Final-Draft-write-and-what-are-my-line-spacing-options> — **Final Draft KB: 54 lines**
- [ssfmt]: <https://www.storysense.com/spformat.pdf> — Michael Ray Brown, Screenplay Format Guide (line grid, spacing, MORE placement)
- MMSW 6.5 manual (break rules, MORE/CONT'D): <http://support.screenplay.com/filestore/mmsw6/docs/Screenwriter65UsersManual.pdf>
- MMSW 6 manual (bottom margin = minimum): <http://support.screenplay.com/filestore/mmsw6/docs/Screenwriter%206%20Users%20Manual.pdf>
- [nicholl]: <https://www.oscars.org/nicholl/screenwriting-resources> — Academy Nicholl
- Story Sense margins: <https://www.storysense.com/format/margins.htm> · dialogue: <https://www.storysense.com/format/dialogue.htm>
- Final Draft format guide: <https://www.finaldraft.com/learn/how-to-format-a-screenplay/>
- StudioBinder margins: <https://www.studiobinder.com/blog/screenplay-margins/>
- Scriptwriting Secrets page-break rules: <https://www.scriptwritingsecrets.com/PageBreak.htm>
- Screenwriting.io MORE/CONT'D: <https://screenwriting.io/what-are-more-and-contd-used-for-in-screenplays/>
- [ja]: <https://johnaugust.com/2018/why-highland-2-doesnt-automatically-add-contd> — John August on (CONT'D)
- Wikibooks screenplay format: <https://en.wikibooks.org/wiki/Movie_Making_Manual/Writing/Screenplay_Format>
- Celtx margins: <https://blog.celtx.com/screenplay-margins-guide/>

### Local extracts (searchable text, for verification)

Under `…/scratchpad/`: `mmsw65.txt` (break rules L11452–11532; MORE/CONT'D example L3849–3864;
revision colours L11653–11669) · `storysense.txt` (margin table L131; line grid L110–112; MORE
placement L425–433) · `mmsw6.txt` · `scriptserious.txt`
