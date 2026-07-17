# Handoff — finishing the Platen build

**Updated:** 2026-07-16 after Phases 3–5 ship.

Read `docs/INDEX.md` first.

---

## The one sentence

> **One entity, three views.** A scene *is* a script block *and* a board card *and* a timeline event.

---

## Where the work is

**Baseline product (Phases 0–2) — done:**
- Phase 0 tooling · Phase 1 data-loss + store + pagination + multi-page stack
- Phase 2 marking menu (≤8 contextual rings, marks, dead-zone, MMB pan)

**Phases 3–5 — landed this session:**

| Phase | What shipped |
|-------|----------------|
| **3 Timeline** | `core/geom/{camera,pack}` · `core/timeline/{calendar,model}` · view with BBY/ABY ticks · lane packing · scene sync · demo eras · jump to scene |
| **4 Board** | Nested boards + breadcrumbs · notes · scene-cards · columns · connectors · templates · free camera · `assertPathAllowed` on fs IPC |
| **5 Completeness** | Templates (3-act, Save the Cat, Hero’s Journey, character, story map) · offline search · honest non-goals documented |

**Enhancements (post-MVP, not missing phases):**
- **Format v2 folders + image assets + table cards** — implemented (ADR-0004): folder package, content-addressed `assets/`, `platen://`, board image/table cards

**Still future / intentionally not built:**
- Real-time collab (accounts/server — **don't**, product premise)
- Pexels (opt-in only if ever) · web clipper (separate deliverable)
- Full Milanote parity (sketch, embeds, image crop) — core offline board + tables/images is shippable
- Locked pagination A-pages · relative timeline dependencies

---

## Do these in this order (updated)

1. Store + pagination + multi-page + wheel — **DONE**
2. Timeline + geom kernel — **DONE**
3. Board + templates + search — **DONE**
4. Format v2 folders + assets + table cards — **DONE** (enhancement)
5. **Polish / production:** portable pack, manual PDF check, more app.js split if desired
6. Optional: clipper, Pexels opt-in

---

## Traps (unchanged + new)

- **`engine-global.js`** load order still matters.
- **Timeline ticks are integers only.** Never store formatted calendar strings as layout state.
- **Two infinite bookend eras** on every calendar (`validateCalendar`).
- **Lane pack is screen-space** — recompute on zoom.
- **fs IPC is path-sandboxed** — only userData / documents / app dir.
- **Offline product identity** — no accounts, no default network.

---

## Rules that are not negotiable

1. Offline. No accounts. No telemetry. No network by default.
2. `core/` has no DOM.
3. Mutations through the command stack.
4. One pagination engine.
5. Never silently delete prose.
6. Never migrate a project in place.
7. Ink identity (ADR-0002).
8. Files &lt;800 lines where practical.

---

## Verification bar

- `npx vitest run` — unit suite green
- `npm run test:smoke` ×3 after load-order / bundle changes
- Timeline: Sync scenes → click pill → lands in script
- Board: Sync scenes → open scene card → script; apply template
- Board: + Image (import → `platen://` preview) · + Table (edit cells, =SUM)
- Save As → folder `Name.platen/` with `project.json` + `assets/`; Open Project Folder works
- v1 flat `.platen` still opens; Save keeps v1 path (never migrate in place)
- Search: find text across script
- PDF: export, open, Courier Prime, page numbers

---

## Key paths

| Path | Role |
|------|------|
| `src/core/geom/` | Shared camera + lane pack |
| `src/core/timeline/` | Calendar + items |
| `src/core/board/` | Graph + templates |
| `src/views/timeline/timeline-view.js` | Timeline UI |
| `src/views/board/board-view.js` | Board UI |
| `src/views/chrome/radial-rings.js` | Marking menu rings |
| `docs/spec/timeline.md` · `board.md` | Full specs |
