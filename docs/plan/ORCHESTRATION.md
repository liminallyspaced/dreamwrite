# DreamWrite orchestration (Phases 6–10)

**Mode:** Hybrid orchestrator + specialist subagents  
**Canonical plan:** `docs/plan/03-master-plan.md` (APPROVED)  
**Do not re-litigate ADRs or the skip-lists.**

---

## How we run efficiently

We do **not** spin 8 always-on agent windows for sequential coherence work. We use a
**harmonic** model:

1. **One orchestrator** (this session or a fresh session with LAUNCH-PROMPT) owns the plan,
   sequencing, merge, verify, and commit.
2. **Specialists** spawn only when work is **file-disjoint** and the package is large enough
   (≥ ~30 min). Small sequential edits stay with the orchestrator.
3. **Sentinels + reports** after every phase (and every parallel specialist): write
   `docs/reports/P{N}-{slug}-report.md`, append one line to `docs/plan/REVIEW-LOG.md`.
4. **Gates** — no phase advances without: `npm test` + `npm run build` green; phase Done when
   from the master plan; smoke extended if the phase says so.

### Parallelism rules

| May run in parallel | Must stay sequential |
|---------------------|----------------------|
| Docs-only vs pure `core/` pure functions with no app.js touch | Anything that both edit `app.js` |
| Board 8a core/selection + styles polish (if no shared files) | Phase 7 paginate + dual + Fountain |
| Security unit tests for main.js path gate alone | Chrome HTML + app.js wiring for same UI |

**File ownership** must be listed in the spawn brief. Overlap → single agent.

### Phase DAG

```
P6 ──► P7 ──► P8a ──► P8b ──► P8c ──► P8d ──► P9 ──► P10
                 │
                 └── (P8 gates are chain-ordered; do not skip ahead)
```

Within P6, recommended parallel split (if using subagents):

| Stream | Owns | Forbidden |
|--------|------|-----------|
| P6-docs | CLAUDE.md, plan banners, board.md implemented column, ORCHESTRATION reports | src/** |
| P6-bridge | preload.js, app.js api alias only | main.js path logic |
| P6-chrome | index.html rightbar/export sheet, app.js export/stats wiring, styles for sheet | core/** |
| P6-fs | main.js assertPathAllowed + tests | UI |

In practice for Phase 6 size: **orchestrator does all four in one sitting** is faster than spawn overhead.

### Sentinel format

Append to `docs/plan/REVIEW-LOG.md`:

```
PHASE 6 complete on YYYY-MM-DD. Coherence+chrome diet+fs verified. Report: docs/reports/P6-coherence-report.md
```

Each specialist:

```
P6-docs complete on YYYY-MM-DD. Report: docs/reports/P6-docs-report.md
```

### Report minimum (every package)

- Summary (what shipped)
- Files touched (table)
- Verifications run (commands + pass/fail)
- Deferred / next phase unlocks
- Blockers

---

## Orchestration ability (honest)

| Capability | Strength |
|------------|----------|
| Plan fidelity + sequencing | High — plan is law |
| Parallel specialists with file ownership | High when briefs are tight |
| Integration-shaped verify (PDF, CDP smoke) | High — required every phase |
| Multi-window .bat dream-team | Available via SE-dream-team skill for ≥4 long parallel roles |
| Self-approval | **Forbidden** — orchestrator or inquisitor pass after each phase |

**Efficient default for this plan:** orchestrator-driven phases 6–7 (tight coupling), then optional
parallel specialists on Phase 8 (core selection vs UI connectors) once 8a core is pure.

---

## Commands (every phase end)

```bash
npm test
npm run build
npm run test:smoke   # or npm run test:all
```

Commit only after green. Push only when Nick asked or phase report says ship.
