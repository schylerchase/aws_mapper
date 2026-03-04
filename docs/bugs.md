# AWS Mapper -- Fragile Areas and Bug History

> Generated from git history analysis (2026-03-04). Use this as a reference
> when planning changes to high-churn areas.

---

## Files With Highest Modification Churn

These files are modified in nearly every commit, making them the most likely sources of regression.

| Rank | File | Modifications | Notes |
|------|------|---------------|-------|
| 1 | `index.html` | 212 | Monolith UI; nearly every feature/fix touches it |
| 2 | `package.json` | 75 | Version bumps, dependency changes |
| 3 | `src/styles/main.css` | 35 | Global styles; layout side-effects are common |
| 4 | `README.md` | 30 | Docs only (low risk) |
| 5 | `main.js` | 28 | Electron main process |
| 6 | `package-lock.json` | 26 | Dependency lock (low risk) |
| 7 | `export-aws-data.ps1` | 15 | PowerShell data collector |
| 8 | `dist/app.bundle.js` | 12 | Build output (should not be edited directly) |
| 9 | `src/app-core.js` | 11 | App bootstrap and orchestration |
| 10 | `.github/workflows/release.yml` | 10 | CI/CD release workflow |
| 11 | `src/modules/topology-renderer.js` | 7 | SVG topology rendering |
| 12 | `src/modules/report-builder.js` | 7 | Report generation |
| 13 | `src/main.js` | 7 | Module entry point |
| 14 | `export-aws-data.sh` | 7 | Bash data collector |
| 15 | `src/modules/flow-analyzer.js` | 5 | Network flow analysis |
| 16 | `src/modules/diff-engine.js` | 5 | Config comparison |
| 17 | `src/modules/compliance-engine.js` | 4 | Compliance checks |
| 18 | `src/modules/firewall-engine.js` | 4 | Security group analysis |

---

## Recurring Bug Categories (Ranked by Frequency)

Derived from keyword analysis of all fix/bug commits across the full history.

| Category | Fix Count | Key Patterns |
|----------|-----------|--------------|
| **Exports** | 23 | PNG crash, Visio ReferenceError, XLSX logo collision, account enrichment missing, export modal bugs |
| **Flow Analysis** | 21 | Arrow direction wrong (fixed 3+ times), dash animation, ingress/egress confusion, discovery engine |
| **Dashboard** | 21 | Render timing, expansion bugs, paint reliability, count display, state reset |
| **Mobile/Responsive** | 18 | Sidebar clipping, toolbar overlap, safe-area insets, landscape offsets, gesture scoping |
| **Build/CI** | 19 | Release tag validation, NSIS artifact name, workflow_dispatch, .deb packaging, cross-platform flags |
| **UI Layout** | 15 | Z-index wars, sidebar reflow, export bar overlap, column alignment, emoji removal |
| **Compare/Diff** | 14 | ECS key mismatch, Lambda filter, multi-file compare, field-level diff, banner clipping |
| **Reports** | 13 | Import round-trip, account pill counts, action plan counts, legacy parser |
| **Compliance** | 12 | Count filtering inconsistency, severity vs. priority confusion, muted finding counts |
| **Security/XSS** | 12 | innerHTML injection, prototype pollution, command injection, Electron IPC, ReDoS |
| **Classification/Rules** | 11 | Cross-type collisions, pipe-only wildcards, tag scope prefix, chip toggle state |
| **PowerShell Collector** | 6 | Duplicate alias, profile nesting, runtime bugs |
| **Sidebar Performance** | 6 | SVG reflow on toggle, backdrop-filter, transition suppression |
| **BUDR** | 5 | RTO/RPO estimates, type-qualified classMap lookup |
| **Bundle/Module** | 2 | CIDR function exports, underscore-prefixed aliases |
---

## Known Fragile Areas

### 1. `index.html` -- The Monolith (CRITICAL)

With 212 modifications, this is by far the highest-churn file. Although modules
have been extracted to `src/modules/`, the main HTML file still contains
significant inline logic and serves as the integration point for all UI
features. Nearly every bug fix touches this file.

**Risk**: Any change here can cause cascading side-effects across exports,
dashboard, mobile layout, and compliance views.

**Mitigation**: The Phase 5 module extraction (commit `a3c4027`) moved 14
modules out. Continue extracting remaining inline code. Add integration tests
for critical paths.

### 2. Export Pipeline (Recurring Crashes)

Exports have the highest fix count (23). Bugs recur because:
- Multiple export formats (PNG, Visio, XLSX, HTML report) each have their own rendering path
- Account context and enrichment data must be threaded through all formats
- SVG clone operations for PNG export are fragile with dynamic content

**Recurring patterns**:
- ReferenceError in Visio export (undefined variables)
- PNG export crashes on heavy topologies
- XLSX logo placement collides with content
- Account filter state not propagated to export output

### 3. Flow Analysis Arrow Directions (Fixed 3+ Times)

The ingress/egress arrow direction has been fixed in at least 4 separate commits:
- `59ba63a` -- correct egress/ingress dash animation directions
- `e36c9e4` -- correct arrow directions and visual consistency
- `57b8842` -- replace dead-end ingress lines with directional arrows
- `349c860` -- sync export scripts with flow support, fix dash direction

**Root cause**: The flow visualization conflates data direction (ingress vs
egress) with visual direction (left-to-right vs right-to-left). Each layout
mode (horizontal, vertical, radial) needs its own directional logic, and the
export paths must match.

### 4. Dashboard Rendering and Counts

21 fix commits touch dashboard behavior. Common issues:
- Render timing: dashboard painted before data was ready
- Compliance counts: inconsistent between dashboard, exports, and reports
- Expansion state: expand/collapse caused count recalculation errors
- Account pill counts showing 0 on grouped tables

**Root cause**: Dashboard aggregation depends on multiple async data sources
(compliance engine, classification, account filter) that can resolve in
different orders.

### 5. Mobile Layout (18 fixes)

Ongoing whack-a-mole with mobile CSS:
- Sidebar toggle clips account panel header
- Zoom controls and legend overlap bottom toolbar
- Safe-area insets hardcoded instead of using CSS env()
- `_isMobile` variable collision between modules
- Landscape orientation offsets wrong

**Note**: One fix was reverted (`0155076` reverted toolbar button hiding),
indicating the mobile UX strategy is still unsettled.

### 6. Compliance Engine Counting

At least 4 dedicated compliance counting fixes:
- `233d9c2` -- count by priority tier, not severity name
- `8a8aeb4` -- consistent filtering across dashboard/exports/reports
- `3e32c72` -- account pill counts always showed 0
- `a103f47` -- stable counts across expand/collapse

**Root cause**: The compliance engine has two parallel classification systems
(severity name vs. priority tier) and the UI components do not always agree on
which one to use for counting.

### 7. CI/CD Release Pipeline

10 modifications to `release.yml` plus 8 CI-scoped fix commits. Issues:
- Empty v-only tag releases
- NSIS artifact name mismatch breaking auto-updater
- .deb packaging missing author metadata
- workflow_dispatch not working for manual releases

### 8. Classification and Rules Engine

Cross-type collisions in the classMap (e.g., an SG and a VPC with the same
name getting the same classification). Pipe-only regex patterns acting as
wildcards. Tag scope prefix confusion (`Name` vs `tag:Name`).

### 9. Security Hardening (Ongoing)

Multiple rounds of security fixes:
- `9bcfc9f` -- 21 bugs: XSS, Electron IPC, logic
- `0b7734d` -- XSS, command injection, prototype pollution
- `129243b` -- XSS escaping, Electron nav guards
- `451ffee` -- CVE-2026-27903 ReDoS

These have been addressed reactively. No evidence of automated SAST/DAST scanning in CI.
---

## Areas Needing Test Coverage

The project has a test suite (added in `fc80d00` -- 148 unit tests, 8 visual
screenshots, CI gate), but the following areas have repeated regressions
suggesting insufficient coverage:

| Area | Why It Needs Tests | Suggested Test Type |
|------|--------------------|---------------------|
| Export pipeline (PNG, Visio, XLSX) | 23 fix commits, recurring crashes | Integration tests with mock SVG data |
| Compliance count aggregation | 4+ counting bugs | Unit tests for each aggregation path |
| Flow arrow direction per layout | Fixed 3+ times | Visual regression tests per layout mode |
| Dashboard render timing | Race conditions | Integration tests with async data mocking |
| Mobile layout breakpoints | 18 fixes, one revert | Visual regression snapshots at key widths |
| Classification cross-type lookup | Type collision bugs | Unit tests with same-name different-type resources |
| Report import/export round-trip | Account context lost | Round-trip unit tests (export then re-import) |
| CI release tag validation | Empty tags, artifact mismatch | Workflow dry-run tests |

---

## Recommendations

1. **Continue extracting logic from `index.html`** -- 212 modifications to a
   single file is the biggest risk multiplier in the codebase.
2. **Unify compliance counting** -- Pick one classification system (priority
   tier) and use it everywhere. Remove the severity-name counting path.
3. **Add directional flow tests** -- Create a test fixture for each layout mode
   that asserts arrow direction for ingress/egress/forwarding.
4. **Add SAST to CI** -- Security fixes have been reactive. A CodeQL or Semgrep
   step would catch XSS and injection patterns before merge.
5. **Stabilize mobile CSS** -- The revert at `0155076` suggests the mobile
   strategy needs a design decision before more incremental fixes.
6. **Lock down export format tests** -- Each export format (PNG, Visio, XLSX,
   HTML) should have a fixture-based test that runs on CI to prevent regression.
