# Requirements: AWS Network Mapper Stabilization

**Defined:** 2026-04-29
**Core Value:** Users can reliably turn AWS environment data into an accurate, inspectable map and actionable reports without a backend.

## v1 Requirements

Requirements for the current brownfield stabilization milestone. Each maps to roadmap phases.

### Architecture Debt

- [ ] **ARCH-01**: Duplicate logic in `src/app-core.js` is removed only after the extracted module path is verified as the active equivalent.
- [ ] **ARCH-02**: Remaining global bridge usage is documented, reduced where safe, and kept backward-compatible for active callers.
- [ ] **ARCH-03**: Modernization of legacy declarations or shared helpers does not change runtime behavior in browser or Electron builds.

### Report And Export Isolation

- [ ] **RPT-01**: HTML report generation code is isolated from `app-core.js` enough to test report assembly without loading the full UI.
- [ ] **RPT-02**: XLSX, DOCX, IaC, and diagram export flows continue to work after report/export refactoring.
- [ ] **RPT-03**: Report state initialization and preview updates have a single canonical implementation.

### Rendering And Data Flows

- [ ] **REND-01**: Active grid, landing zone, executive, and extracted topology rendering paths stay visually and behaviorally consistent for shared layout changes.
- [ ] **REND-02**: Multi-account and multi-region merge behavior preserves resource counts, labels, and account filtering.
- [ ] **REND-03**: Snapshot, timeline, detail panel, and annotation state have one canonical source of truth where practical.

### Performance

- [ ] **PERF-01**: Compliance dashboard rendering remains responsive with large finding sets.
- [ ] **PERF-02**: Heavy export dependencies are loaded only when needed and do not increase startup cost.
- [ ] **PERF-03**: Repeated parsing, serialization, and DOM lookups called out in the optimization plan are cached or reduced where low risk.

### Test Coverage

- [ ] **TEST-01**: Refactors touching extracted modules add or update unit tests using Node's built-in test runner.
- [ ] **TEST-02**: UI workflows touched by each phase are covered by Playwright smoke or targeted E2E tests.
- [ ] **TEST-03**: Known high-risk gaps have explicit coverage plans: PNG export, multi-account rendering, and topology renderer pure functions.

## v2 Requirements

Deferred to future milestones.

### Product Expansion

- **PROD-01**: Add new cloud providers or merge AWS/Azure mapper experiences.
- **PROD-02**: Add hosted collaboration, telemetry, or cloud project storage.
- **PROD-03**: Redesign the overall visual language or navigation model.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Frontend framework migration | Too much blast radius for a stabilization milestone |
| Hosted backend | Conflicts with the local/offline trust model |
| New major AWS feature areas | Current priority is maintainability of existing coverage |
| Removing committed build outputs | Packaging and web deploy currently rely on them |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| ARCH-01 | Phase 1 | Pending |
| ARCH-03 | Phase 1 | Pending |
| TEST-01 | Phase 1 | Pending |
| RPT-01 | Phase 2 | Pending |
| RPT-02 | Phase 2 | Pending |
| RPT-03 | Phase 2 | Pending |
| TEST-02 | Phase 2 | Pending |
| ARCH-02 | Phase 3 | Pending |
| REND-01 | Phase 3 | Pending |
| REND-02 | Phase 3 | Pending |
| REND-03 | Phase 3 | Pending |
| PERF-01 | Phase 4 | Pending |
| PERF-02 | Phase 4 | Pending |
| PERF-03 | Phase 4 | Pending |
| TEST-03 | Phase 4 | Pending |

**Coverage:**
- v1 requirements: 15 total
- Mapped to phases: 15
- Unmapped: 0

---
*Requirements defined: 2026-04-29*
*Last updated: 2026-04-29 after GSD initialization*
