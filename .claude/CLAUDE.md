# DreamWrite — project instructions

**DreamWrite** is an offline, no-accounts screenwriting app (Electron 33, vanilla JS):
script + Milanote-style board + fictional-calendar timeline.

Directory may still be named `ScriptDesk/`; the **product is DreamWrite**.  
Internal project format remains **`.platen` / `platen://`** (ADR-0004 — do not rename the shipped format).  
IPC bridge: prefer **`window.dreamwrite`**; `window.scriptdesk` is a deprecated alias for one release.

---

## Read these before substantial work

| Order | File | Why |
|-------|------|-----|
| 1 | `docs/plan/03-master-plan.md` | **Current** plan (Phases 6–10). Authority. |
| 2 | `docs/plan/ORCHESTRATION.md` | How phases are executed / parallel rules |
| 3 | `docs/architecture/decisions/` | Settled — **don't re-litigate** |
| 4 | `docs/spec/` | `pagination.md`, `timeline.md`, `board.md` |

Historical only (stamped): `docs/plan/00-findings.md`, `docs/plan/01-roadmap.md` — **not** current status.

Then check `git log` / recent changes to see which phase is live.

---

## The thesis — hold onto this

> **One entity, three views.** A scene *is* a script block *and* a board card *and* a timeline event.

If a change doesn't serve either **(a)** removing screenwriting error/toil or **(b)** the entity link,
it's a nice-to-have — sequence it last.

---

## Non-negotiables

1. **Offline. No accounts. No telemetry. No network by default.**
2. **`core/` has no DOM.** Pure functions only.
3. **Every mutation goes through the command stack.**
4. **One pagination engine** (ADR-0006). Screen, stats, and PDF all use the same `Page[]`.
5. **Ink identity** (ADR-0002). Monochrome carbon/ink/paper. Colour is semantic only.
6. **Never migrate a project in place** (ADR-0004). Format stays `.platen`.
7. **Files <800 lines.** Extract as you touch `app.js`.
8. **No new blocking `alert()`/`confirm()`** — replace as you edit; undo-first or ink modal.
9. **fs paths from renderer must go through `assertPathAllowed`** (project/userData/docs/app only).

---

## The rule that matters most

> **A green unit test does not prove the PDF is right. Export it, open it, count the pages, check the font.**

---

## Stack

- Electron 33 · vanilla JS · **esbuild** · **vitest**
- No framework. Don't add React.
- `contextIsolation: true`, `nodeIntegration: false`, CSP locked.

---

## Commands

```bash
npm run dev          # watch build
npm test             # vitest
npm run test:smoke   # CDP over real Electron
npm run test:all
npm start
```
