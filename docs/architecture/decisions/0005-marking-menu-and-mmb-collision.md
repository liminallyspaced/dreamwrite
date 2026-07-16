# ADR-0005 — The wheel is a marking menu; resolving the middle-mouse collision

**Date:** 2026-07-16
**Status:** Accepted

## Context

### The bug

`ui-chrome.js:279-287`:

```js
document.addEventListener('click', (e) => {
  if (!state.radialOpen) return;
  const radial = document.getElementById('radial');
  if (radial && !radial.contains(e.target)) {
    if (state.radialIndex >= 0) activateRadial(state.radialIndex);   // <-- always true
    closeRadial();
  }
});
```

`state.radialIndex` initialises to `0` (`ui-chrome.js:15`) and is never set to `-1`. `openRadial` calls `highlightRadial(0)` = `Scene` (`ui-chrome.js:172`). **Dismissing the wheel by clicking away retypes your current block as a Scene Heading.** There is no cancel.

### The model

- **14 items** at 360/14 = 25.7° per slice (`ui-chrome.js:19-34`)
- **Click-to-select**: `pointerup` merely clears the held flag, commenting *"keep radial open until click outside or select"* (`ui-chrome.js:252-258`). The gesture is hold 140ms → release → move → click.
- **Not contextual**: `buildRadial()` runs once at init (`ui-chrome.js:196`)
- **No submenus**

### The collision

MMB-hold opens the wheel (`ui-chrome.js:243`). MMB-drag is also the universal pan gesture on any canvas — and Phases 3 and 4 add two canvases.

## Decision

### 1. It's a marking menu, not a popup menu

**Press → flick → release.** One gesture. `pointerup` selects the highlighted item and closes.

### 2. Centre dead-zone cancels

Inside the 36px dead-zone, set `radialIndex = -1` and clear the highlight. Release there = cancel, no mutation. Today `pointermove` returns early inside the dead-zone (`ui-chrome.js:269`) but *keeps* the previous highlight, so cancelling is impossible.

### 3. ≤8 items per ring

Marking-menu research (Kurtenbach & Buxton) puts the reliable ceiling at 8. 4 and 8 are ideal — they map to compass directions, which is what turns the menu into muscle memory. One level of submenus for overflow.

### 4. Contextual root

The payload depends on the active element / view (scene heading vs character cue vs board vs timeline). Rebuild per open, not once at init.

### 5. Novice→expert continuum

- Flick **before** the 140ms timer fires → execute immediately; the wheel never draws.
- Hold past 140ms → the wheel appears and shows you the options.

Same gesture either way. **The menu is its own tutorial** — you learn the directions by using it, then stop needing to see it. This is what makes it eyes-free, which is the entire point of the feature.

### 6. Resolving the MMB collision

On MMB-down: start the 140ms timer **and** record the origin.

| Then | Result |
|------|--------|
| Pointer moves >6px before the timer fires | It's a **pan**. Cancel the wheel. |
| Timer fires with no movement | The **wheel** opens. |
| Quick flick, released before the timer | **Mark** — execute directly. |

Tap, hold-flick-release, and drag then coexist unambiguously on one button.

## Rationale

The wheel is the feature most aligned with the stated goal — *stop doing repetitive tasks* — and it is currently a **net negative**: it silently corrupts documents. Fixing it is cheap and high-visibility.

14 slices at 25.7° cannot become muscle memory; you must look at it every time, which defeats the purpose. A menu you have to look at is a slower ribbon.

## Consequences

- Behaviour changes for anyone who learned the old wheel. Accepted: nobody has muscle memory for a menu that silently retypes their blocks.
- The contextual root means the wheel's contents must be defined per view. Each new surface owns a small config, not a fork of the wheel.
- `auxclick` preventDefault (`ui-chrome.js:276`) must stay — it suppresses Chromium's middle-click autoscroll, which would otherwise fight the pan.
- Unrelated but adjacent: `playSound` clones an `Audio` element per keystroke (`ui-chrome.js:50`) with no pooling. Move to WebAudio with pre-decoded buffers while in this file.
