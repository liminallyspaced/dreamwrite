# DreamWrite codebase audit — 2026-07-17

## Verdict

**Ship-ready as an offline story workspace** for Windows; macOS packaging is configured and builds on macOS CI / a Mac. Unit suite **177** tests green. Product is coherent: script + board + timeline + format-v2 enhancements.

## What’s solid

| Area | Notes |
|------|--------|
| Core purity | `src/core/` has no DOM |
| Pagination | Single engine (paginate/wrap) for screen/stats/PDF |
| Store | Command stack + inverse payloads |
| Offline | No accounts/network by default |
| Assets | Content-addressed v2 folders, `platen://` protocol |
| Tests | Vitest unit + Electron smoke |
| Brand | DreamWrite naming on UI/package; `.platen` extension kept for open-compat |

## Packaging

| Platform | Artifacts |
|----------|-----------|
| Windows | NSIS **Setup** installer + **Portable** exe |
| macOS | DMG + ZIP (arm64 + x64) via `pack:mac` / GitHub Actions |
| Web | `website/` → GitHub Pages |

## Residual / non-blockers

1. **app.js still large** (~2k lines) — works; further splits optional.
2. **Dual dialogue geometry** — unverified industry edge case (spec note).
3. **Mac unsigned** — Gatekeeper right-click Open until Developer ID signing.
4. **GitHub homepage URL** in package.json is a placeholder (`nicks/dreamwrite`) — set to real remote.
5. **`.platen` extension name** still legacy; product name is DreamWrite.

## Non-goals (confirmed)

Collab · default network stock · web clipper as core feature.
