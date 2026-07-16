# ADR-0002 — Keep Platen's ink identity; take the reference's interactions, not its skin

**Date:** 2026-07-16
**Status:** Accepted

## Context

The timeline reference clip is deep-blue gradient glassmorphism with a starfield, glassy translucent pills, and bright per-event colour.

Platen is monochrome carbon/ink/paper: Courier Prime, cream paper texture, ink-edge smudge, black metal chrome, typewriter platen. Its README pitch is *"No blue glow."*

These are not compatible looks.

## Decision

**Take the reference's interaction model exactly. Render it in Platen's ink language.**

- Timeline pills: letterpress ink-on-cream capsules, not glass
- Colour is **semantic only** — thread, character, act coding — never decorative
- Same for the board

## Rationale

- Platen's identity is its entire differentiation. It is not competing on features with Final Draft; it's competing on *feel*. "No blue glow" is in the pitch.
- An app that is a typewriter desk in one tab and a glass dashboard in the next is two products stapled together. The user is one person building one thing.
- The reference's *value* is its interaction model — custom era axis, lane-packed pills, leader lines to axis dots, span bars, click-to-card. None of that is load-bearing on the blue gradient.
- Monochrome also forces better information design: without colour to lean on, hierarchy has to come from scale, weight, and space.

## Consequences

- The timeline will not look like the clip. That's intended, and it was confirmed explicitly.
- Colour coding needs a disciplined semantic palette (see `docs/spec/board.md` when written) — a small set of inks, each meaning something.
- Image fills on span bars (the reference's textured "Galactic Empire" bar) still work — treat them as duotone/halftone plates rather than full-colour photos, consistent with the paper language.
- Risk: monochrome timelines can read as flat/undifferentiated at high item counts. Mitigate with weight and texture, not by reaching for hue.
