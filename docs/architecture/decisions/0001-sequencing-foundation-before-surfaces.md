# ADR-0001 — Foundation before new surfaces

**Date:** 2026-07-16
**Status:** Accepted

## Context

The ask is a middle-mouse quick wheel, a Milanote-style board, and a timeline matching a reference clip. The exciting work is all new surfaces.

But `docs/plan/00-findings.md` established four load-bearing cracks in what already exists:

1. Page count is a character-count heuristic (`engine.js:726`) and disagrees with both the screen and the PDF.
2. The PDF renders in Courier New, not Courier Prime, with no page numbers and no `(MORE)`/`(CONT'D)`.
3. There is no undo stack anywhere — only Chromium's per-contenteditable native undo.
4. The radial silently retypes your block when dismissed (`ui-chrome.js:284`).

And two hard blockers: the IPC surface is UTF-8 text only (no binary channel → images are impossible), and the `.platen` format is a single flat JSON with revision history nested inside, written synchronously.

## Decision

Build in this order: **Foundation → Wheel → Timeline → Board → Completeness.**

## Rationale

- **The board and timeline are not blocked by their own difficulty.** They're blocked by undo, binary assets, and the file format. Building them first means building them twice.
- **Undo is a prerequisite, not a nicety.** A canvas without undo is unusable. Adding a global command stack *after* two canvas surfaces exist means retrofitting every mutation in all of them.
- **The stated goal is "write without worrying about scriptwriting errors."** Page count is the error class that matters most — 1 page = 1 minute is the industry's fundamental unit. The pitch is already broken at the core.
- **Timeline before board** because it is fully specified (we have the clip), smaller, and it is *a constrained board* — X locked to time, Y locked to lanes. It validates the shared kernel at lower cost.
- Each phase is independently shippable. **Phase 1 + 2 alone is the app the README already claims to be.**

## Alternatives rejected

- **Board + timeline first.** Fastest to something impressive-looking. Rejected: they'd be built on the broken format and no-undo base and substantially reworked, and the pagination bug keeps shipping the whole time.
- **A separate "build the kernel" phase.** Rejected: an abstraction with one consumer and no user-visible deliverable is how plans stall. The kernel gets built *inside* Phase 3, with the timeline as its first consumer.
- **Vertical slice through all three first.** Genuinely tempting — it proves the entity-link thesis early. Rejected because the slice would still need undo and the asset pipeline to be real, which is most of Phase 1 anyway.

## Consequences

- Slowest route to the visually exciting work. This is a real cost and was accepted deliberately.
- Mitigation: Phase 1 and 2 are *not* invisible plumbing. "The page count is now true" and "the wheel now works and doesn't corrupt your script" are both user-visible wins.
