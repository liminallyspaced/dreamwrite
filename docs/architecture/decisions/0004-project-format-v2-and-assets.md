# ADR-0004 — Project format v2: folder container, content-addressed assets, `platen://` protocol

**Date:** 2026-07-16
**Status:** Accepted

## Context

Today (`engine.js:84`) a project is one flat JSON file:

```js
{ version: 1, format: 'platen', titlePage, blocks, characters, locations,
  cards, notes, settings, history }
```

written with `fs.writeFileSync(target, content, 'utf8')` (`main.js:170`).

Four problems the moment a board exists:

1. **`history` (revision snapshots) is nested inside the document** — every snapshot bloats the file that's rewritten on every save.
2. **Synchronous writes** — autosaving a multi-megabyte JSON will visibly jank typing.
3. **Non-atomic** — a crash mid-write truncates the project. No temp-and-rename.
4. **Nowhere for binary assets.**

And two hard blockers:

- **The IPC surface is UTF-8 text only** (`main.js:152/170/185/199/230/235`). No binary channel exists. Images cannot be loaded or saved *at all*.
- **CSP is `img-src 'self' data:`** (`index.html:6`). User images can't be displayed from disk.

## Decision

### 1. Folder container

```
MyScript.platen/
  project.json              # entities, script, board, timeline — text only
  assets/
    ab/cd/abcdef01….png     # content-addressed by sha256, 2-level fanout
  revisions/
    2026-07-16T01-30-00.json
  thumbs/
```

Still **export** a single-file zip `.platen` for portability and sharing.

### 2. Content-addressed assets

Asset filename = sha256 of contents. Gives free dedupe (drop the same reference image on ten boards → one file), cheap revisions (snapshots reference hashes, don't copy bytes), and trivial GC (sweep for unreferenced hashes).

### 3. Binary IPC

New handlers: `asset:import(bytes) -> {id}`, `asset:read(id) -> bytes`. This capability does not exist today.

### 4. `platen://` custom protocol

Register in main; resolve `platen://asset/<hash>` from the open project's `assets/` dir only. CSP becomes `img-src 'self' data: platen:` and `media-src 'self' platen:`.

### 5. Atomic async writes

`fs.promises`, write to temp, `fsync`, rename. Debounced autosave.

### 6. Migration

Detect `version: 1` → convert. **Migrate to a copy; never in place. Leave the v1 file untouched until the v2 round-trip is verified.**

## Rejected alternatives

- **Base64 images inside the JSON.** ~33% size inflation, no dedupe, and — fatally — every autosave re-serialises every image. A 20MB board would rewrite 20MB on each keystroke's debounce.
- **Loosening CSP to `file://`.** Hands the renderer the whole filesystem to satisfy an image tag. A scoped custom protocol is strictly better and no harder.
- **SQLite.** Real option, and better at large-N queries. Rejected for now: it makes the project a binary blob — no diffing, no git, no hand-repair, no "it's just a folder." Platen's pitch is *"Scripts stay on your machine."* A folder of JSON honours that; a database doesn't. Revisit only if measured.
- **Zip-as-primary.** Rejected: every save rewrites the whole archive, and it's the same jank problem. Zip is the *export*, not the working format.

## Consequences

- `.platen` becomes a folder, not a file. Windows Explorer will show it as a directory — mildly surprising. Mitigate: the zip export is the shareable artifact, and Open handles both.
- Asset GC needs a sweep (on save, or on explicit "compact"). Unreferenced blobs accumulate otherwise.
- Migration is the highest-risk single operation in the plan. It touches real, irreplaceable user work. Copy-first, verify round-trip, keep a backup. See the risk register in `docs/plan/01-roadmap.md`.
- `fs:readText`/`fs:writeText` (`main.js:229-236`) accept an arbitrary renderer-supplied path with no validation. Harmless today (offline, CSP-locked, no remote content); a real arbitrary-file-write primitive once the board imports files or the clipper opens a port. **Constrain to the project directory before Phase 4.**
