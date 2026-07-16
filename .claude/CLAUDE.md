# Platen — project instructions

**Platen** is an offline, no-accounts screenwriting app (Electron 33, vanilla JS) being expanded into a
story workspace: script + Milanote-style board + fictional-calendar timeline.

Directory is `ScriptDesk/`; the **product is called Platen**. Don't rename it.

---

## Read these before substantial work

| Order | File | Why |
|-------|------|-----|
| 1 | `docs/plan/00-findings.md` | What's broken, with file:line. Four load-bearing cracks. |
| 2 | `docs/plan/01-roadmap.md` | The phased plan. Where we are. |
| 3 | `docs/architecture/decisions/` | Decisions already made — **don't re-litigate** |
| 4 | `docs/spec/` | `pagination.md`, `timeline.md`, `board.md` |

Then check `git log` / recent changes to see which phase is live.

---

## The thesis — hold onto this

> **One entity, three views.** A scene *is* a script block *and* a board card *and* a timeline event.

This is the only reason to build this instead of using Final Draft + Milanote + Aeon Timeline.
If a change doesn't serve either **(a)** removing screenwriting error/toil or **(b)** the entity link,
it's a nice-to-have — sequence it last.

---

## Non-negotiables

1. **Offline. No accounts. No telemetry. No network by default.** This is the product's identity
   ("Scripts stay on your machine"). Any online feature is opt-in, off by default, and needs a CSP
   carve-out and an explicit decision. Don't quietly add a fetch.
2. **`core/` has no DOM.** Pure functions only, so it stays unit-testable. Correctness lives there.
3. **Every mutation goes through the command stack.** There was no undo at all before Phase 1
   (only Chromium's per-contenteditable native undo). Don't reintroduce an unundoable path.
4. **One pagination engine** (ADR-0006). Screen, stats, and PDF all render the same `Page[]`.
   Never add a fourth way to count pages.
5. **Ink identity** (ADR-0002). Monochrome carbon/ink/paper. Colour is semantic only, never decorative.
   The timeline reference is blue glassmorphism — we took its *interactions*, not its skin.
6. **Never migrate a project in place** (ADR-0004). Copy, verify round-trip, keep the v1 backup.
   This touches irreplaceable user work.
7. **Files <800 lines.** `app.js` was 1,939 and it's why nothing was testable.

---

## The rule that matters most here

> **A green unit test does not prove the PDF is right. Export it, open it, count the pages, check the font.**

All four original cracks would have survived a passing unit suite — they're integration-shaped.
Drive the real app. Use the `verify` and `run` skills.

*(This matches the active global instinct: "verify integration-shaped features with a real end-to-end run.")*

---

## Stack

- Electron 33 · vanilla JS · **esbuild** (build) · **vitest** (test)
- No framework. Don't add React. The editor is per-block `contenteditable` over a
  `state.project.blocks` array — that model is correct, keep it.
- `contextIsolation: true`, `nodeIntegration: false`, CSP locked. Keep it that way.

---

## Skill routing by phase

**Re-scan rather than trusting this table** — it was written 2026-07-16 and the installed capability
set changes. Read `~/.claude/capability-map.md` **on demand** (never paste it wholesale into context).
Parked skills live in `~/.claude/skills-library/` at zero cost — copy one into `.claude/skills/` to
activate it here. Use `find-skills` / `ecc:skill-scout` for a job with no obvious skill.

| Phase | Skills / agents |
|-------|-----------------|
| **0 — Scaffolding** | `ecc:architect` (module boundaries) · `ecc:refactor-cleaner` (dead code; has knip/depcheck/ts-prune) · `ecc:typescript-reviewer` |
| **1 — Trust** ★ | `tdd` + `ecc:tdd-guide` (**pagination is the TDD-shaped problem** — pure fn, golden fixtures) · `ecc:architect` (command/undo) · `verify` (**mandatory** — the PDF is integration-shaped) · `ecc:code-reviewer` |
| **2 — Wheel** ★ | `ecc:motion-ui` + `ecc:motion-foundations` (**it lives or dies on timing/easing**) · `impeccable` (interaction polish) · `verify` |
| **3 — Timeline** ★ | `ecc:architect` (kernel boundaries) · `frontend-design` / `impeccable` (ink direction) · `ecc:motion-ui` (pan/zoom feel) · `ecc:performance-optimizer` (**only if measured slow**) · `verify` |
| **4 — Board** ★ | `frontend-design` / `impeccable` · `ecc:performance-optimizer` (culling — measure first) · **`ecc:security-reviewer`** (file import) · `verify` |
| **5 — Completeness** | **`ecc:security-reviewer`** (mandatory — the clipper opens a local port) · `ecc:api-connector-builder` (Pexels) · `ecc:e2e-runner` |

**Always:** `ecc:code-reviewer` after writing code · `ecc:security-reviewer` before touching IPC,
file paths, or anything network-adjacent.

**Probably not useful here:** Cloudflare/Workers skills, `seo`, `marketing-agent`, database skills.
This is an offline desktop app with no server and no database.

### Second brain

Per global notes: consult `LLM-Wiki/wiki/index.md` before substantial work; read
`LLM-Wiki/CRITICAL_FACTS.md` for quick grounding. File durable findings back with `/wiki ingest` —
the pagination spec and the timeline calendar model are exactly the kind of reusable knowledge that
should compound into the vault rather than evaporate.

---

## Landmines

| Thing | Watch out |
|-------|-----------|
| `fs:readText` / `fs:writeText` (`main.js:229-236`) | Accept **any** renderer-supplied path, unvalidated. Harmless while offline+CSP-locked; a real arbitrary-file-write primitive once the board imports files. **Constrain before Phase 4.** |
| `styles.legacy.css` | 1,473 lines, not linked from `index.html`. Verify it's dead before deleting. |
| `data:` URL for PDF (`main.js:216`) | Opaque origin — cannot load bundled fonts. Base64-embed instead. |
| `playSound` (`ui-chrome.js:50`) | Clones an `Audio` element per keystroke, no pooling. GC-thrash. |
| `confirm()` / `alert()` (`app.js:353`, `451`) | Blocking native dialogs. `app.js:451` still says "use the desktop app," implying a web past. |
| Fountain export | Has nowhere to put entity links (ADR-0003). Round-tripping via `.fountain` **drops the graph**. `.platen` is the lossless format. |

---

## Conventions

- Follow the global rules in `~/.claude/rules/` (coding-style, testing, security, git-workflow).
- Commits: `<type>: <description>` — feat/fix/refactor/docs/test/chore/perf/ci.
- **Not a git repo yet.** Offer to `git init` before substantial work — the format-v2 migration
  (ADR-0004) touches real user projects and wants version control behind it.
