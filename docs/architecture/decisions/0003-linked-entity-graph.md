# ADR-0003 — One entity, three views (linked entity graph)

**Date:** 2026-07-16
**Status:** Accepted

## Context

Platen is gaining a board and a timeline alongside the script. Three ways to model that:

1. Three independent tools sharing a window
2. Three documents with opt-in manual links
3. One entity store, projected into three views

## Decision

**One entity store, many projections.**

A scene *is* a script block *and* a board card *and* a timeline event. Rename a character once; it updates everywhere.

```js
// project.json (v2)
{
  version: 2,
  entities: {
    "e_01": { id, type: 'scene',     title, sceneNumber, ... },
    "e_02": { id, type: 'character', name, aliases, ... },
    "e_03": { id, type: 'event',     title, description, assetId, ... },
  },
  links: [ { from: 'e_01', to: 'e_02', rel: 'appears_in' } ],

  script:   { blocks: [ { id, type, text, entityId? } ] },
  board:    { boards: { root: { items: [ { entityId?, x, y, ... } ] } } },
  timeline: { calendars: [...], items: [ { entityId?, t0, ... } ] },
}
```

Each view holds its own *presentation* data (position, lane, block order); shared *identity and content* lives in `entities`.

## Rationale

- **This is the only reason to build this rather than use the incumbents.** Final Draft + Milanote + Aeon Timeline can't do it, because they are three separate products. If the board is "Milanote but offline and worse," there is no reason for it to exist.
- The reference clip already shows the shape: `Luke Skywalker` and `Din Djarin` sit on the timeline next to `Battle of Yavin`. Those are characters, not events. The reference is *already* surfacing entities on a time axis.
- Rename-propagation, "click the timeline event → land in the scene," and "this card *is* that scene" all fall out for free once identity is shared.

## Scope discipline (important)

**Do not mint an entity for everything.** YAGNI applies:

- **Scene headings** mint a `scene` entity. Action blocks do not.
- **Character cues** resolve to a `character` entity (via the Bible, with aliases).
- Board notes and timeline events may be **entity-free** (`entityId: null`) — a scratch note on the wall is just a note. The link is opt-in per item.

`entityId?` is nullable everywhere. That keeps the graph honest: it holds the things that genuinely exist in more than one view.

## Consequences

- More design work up front; this was accepted explicitly.
- Deletion semantics need care: deleting a board card must not delete the scene. Distinguish "remove this projection" from "delete the entity." Probably: deleting the last projection prompts.
- Rename propagation needs the command stack (ADR-0001 / Phase 1) to be undoable as one atomic operation across three views.
- Fountain export must not lose entity links. Fountain has no place for them — round-tripping through `.fountain` will drop the graph. Document this; keep `.platen` as the lossless format.
