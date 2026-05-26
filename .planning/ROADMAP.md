# Roadmap: AWS Network Mapper Stabilization

## Overview

This roadmap turns the existing optimization backlog into a GSD-ready stabilization milestone. The work starts by reducing duplication in the active monolith, then isolates report/export logic, tightens module boundaries and rendering data flows, and finishes with performance and coverage hardening around the workflows most likely to regress. Phase 5 extends that stabilization work into a full-codebase structural readability refactor.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions marked with INSERTED

- [ ] **Phase 1: App-Core Deduplication** - Remove verified duplicate logic from the monolith while preserving active UI behavior.
- [ ] **Phase 2: Report And Export Isolation** - Move report/export assembly toward focused modules with regression coverage.
- [ ] **Phase 3: Bridge And Rendering Boundaries** - Reduce unsafe global coupling and stabilize rendering/data-flow seams.
- [ ] **Phase 4: Performance And Coverage Hardening** - Address the remaining high-value performance and test gaps.
- [ ] **Phase 5: Full Codebase Refactor** - Refactor source ownership across the whole app so readability comes from clear boundaries, not formatting alone.

## Phase Details

### Phase 1: App-Core Deduplication
**Goal**: Remove verified duplicate logic from `src/app-core.js` and modernize narrow legacy patterns without changing shipped behavior.
**Depends on**: Nothing (first phase)
**Requirements**: [ARCH-01, ARCH-03, TEST-01]
**Success Criteria** (what must be TRUE):
  1. Duplicate functions removed from `src/app-core.js` have an identified canonical module implementation.
  2. Existing import, render, dashboard, and export smoke tests still pass after deduplication.
  3. Any touched extracted module has focused unit coverage or an explicit reason coverage is not practical.
  4. `dist/` outputs are refreshed when source changes affect browser/Electron runtime bundles.
**Plans**: 3 plans

Plans:
- [ ] 01-01: Inventory duplicate `app-core.js` functions against extracted modules and pick safe removals.
- [ ] 01-02: Remove selected dead copies and preserve compatibility bridges for active callers.
- [ ] 01-03: Add focused tests and rebuild affected bundles.

### Phase 2: Report And Export Isolation
**Goal**: Make report generation and export flows easier to test and change by moving remaining inline report logic out of the monolith.
**Depends on**: Phase 1
**Requirements**: [RPT-01, RPT-02, RPT-03, TEST-02]
**Success Criteria** (what must be TRUE):
  1. Report assembly code has a canonical module owner instead of parallel copies in `app-core.js`.
  2. HTML, XLSX, DOCX, IaC, Visio/Lucid, and PNG-adjacent export entry points still work after refactoring.
  3. Report preview state is initialized and updated from one implementation.
  4. Playwright coverage verifies at least one full report/export user path touched by this phase.
**Plans**: 3 plans

Plans:
- [ ] 02-01: Extract remaining report builder helpers and state into focused modules.
- [ ] 02-02: Rewire `app-core.js` event handlers to call canonical report/export functions.
- [ ] 02-03: Cover report/export regressions with unit and Playwright tests.

### Phase 3: Bridge And Rendering Boundaries
**Goal**: Reduce implicit global coupling and stabilize fragile rendering, timeline, detail, and multi-account boundaries.
**Depends on**: Phase 2
**Requirements**: [ARCH-02, REND-01, REND-02, REND-03]
**Success Criteria** (what must be TRUE):
  1. Remaining `window.*` exports are documented as intentional bridges or replaced with module imports where safe.
  2. Shared rendering changes are applied consistently across active grid, landing zone, executive, and extracted renderer paths.
  3. Multi-account and multi-region merge behavior keeps expected resource counts and account labels.
  4. Snapshot/timeline/detail panel duplication is reduced or fenced with tests around the active behavior.
**Plans**: 3 plans

Plans:
- [ ] 03-01: Replace low-risk global bridge reads/writes with explicit module ownership.
- [ ] 03-02: Normalize rendering helper boundaries across the active layout paths.
- [ ] 03-03: Consolidate or test timeline, detail panel, and multi-account state behavior.

### Phase 4: Performance And Coverage Hardening
**Goal**: Close the highest-value performance and test gaps after structural risk has been reduced.
**Depends on**: Phase 3
**Requirements**: [PERF-01, PERF-02, PERF-03, TEST-03]
**Success Criteria** (what must be TRUE):
  1. Compliance dashboard large-result rendering remains responsive and does not grow DOM work unnecessarily.
  2. Heavy export dependencies remain lazy and any bundle-size changes are understood.
  3. Repeated serialization, parsing, and DOM lookup hotspots from `OPTIMIZATION_PLAN.md` are addressed where the fix is low risk.
  4. PNG export, multi-account rendering, and topology renderer pure functions have either automated coverage or documented blockers.
**Plans**: 3 plans

Plans:
- [ ] 04-01: Improve compliance dashboard and export dependency performance hotspots.
- [ ] 04-02: Add coverage for PNG export and multi-account rendering flows.
- [ ] 04-03: Add unit coverage for topology renderer pure helpers and close remaining low-risk optimization items.

### Phase 5: Full Codebase Refactor
**Goal**: Make the entire codebase easier to read and maintain by clarifying ownership across app orchestration, engines, rendering, exports, reports, and UI feature modules.
**Depends on**: Phase 4
**Requirements**: [ARCH-01, ARCH-02, ARCH-03, REND-01, RPT-01, RPT-02, TEST-01, TEST-02]
**Success Criteria** (what must be TRUE):
  1. `src/app-core.js` is materially smaller and mostly orchestration, with cohesive feature logic extracted to named modules.
  2. Engine modules are organized around readable predicates, rule definitions, and finding/result factories.
  3. Report and export generators accept explicit inputs where practical and keep compatibility wrappers stable.
  4. All active rendering paths keep behavior synchronized through shared helpers or explicitly tested boundaries.
  5. The full unit suite, Playwright suite, format check, and production bundle pass before completion is claimed.
**Plans**: 1 plan

Plans:
- [ ] 05-01: Execute the full-codebase readability refactor in behavior-preserving units.

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. App-Core Deduplication | 0/3 | Not started | - |
| 2. Report And Export Isolation | 0/3 | Not started | - |
| 3. Bridge And Rendering Boundaries | 0/3 | Not started | - |
| 4. Performance And Coverage Hardening | 0/3 | Not started | - |
| 5. Full Codebase Refactor | 0/1 | Not started | - |

---
*Roadmap created: 2026-04-29 after GSD initialization*
