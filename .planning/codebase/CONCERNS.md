# Codebase Concerns

**Analysis Date:** 2026-04-29

## High-Risk Technical Debt

### `src/app-core.js` Is Still The Active Monolith

- File: `src/app-core.js`.
- Current size: 19,197 lines.
- Why it matters: It owns most event wiring, DOM rendering, topology rendering, report builder orchestration, import/export flow, session state, timeline, annotations, multi-account behavior, firewall UI, flow tracing, diff mode, and dashboards.
- Risk: Small changes can cross-cut unrelated workflows because many regions share script-scope state.
- Safer approach: Extract or delete only one coherent slice at a time, then rebuild and run focused tests.

### Transitional Window Bridge Is Broad

- Files: `src/main.js`, `src/exports/index.js`, multiple modules.
- Current shape:
  - `src/main.js` imports 25 modules into `window.AppModules`.
  - It then flattens every export onto `window`.
  - `src/exports/index.js` exposes `window._core`.
  - Several modules also define `window.*` properties directly.
- Measured current usage: 209 `window.` occurrences across source.
- Risk: Name collisions, implicit load-order requirements, and hidden coupling between modules and app-core.
- Safer approach: Prefer explicit imports inside bundled modules and keep only documented compatibility bridges for app-core.

### Duplicate Or Partially Migrated Modules

- Files not imported by runtime bundle:
  - `src/modules/dashboards.js`
  - `src/modules/detail-panel.js`
  - `src/modules/firewall-engine.js`
  - `src/modules/landing.js`
  - `src/modules/notes.js`
  - `src/modules/search.js`
  - `src/modules/topology-renderer.js`
- Risk: These files may be useful references or partial extractions, but changing them may not affect runtime unless wired through `src/main.js`.
- Safer approach: Before editing one of these files, verify whether the active implementation is in `src/app-core.js` or the module.

### Topology Renderer Duplication

- Active paths:
  - `src/app-core.js:4072` `renderLandingZoneMap(ctx)`.
  - `src/app-core.js:5433` `renderExecutiveOverview(ctx)`.
  - `src/app-core.js:5780` `_renderMapInner()` grid path.
- Parallel extracted paths:
  - `src/modules/topology-renderer.js` is not imported.
  - `src/modules/landing.js` is not imported.
- Risk: Label placement, highlight behavior, stats chips, and resource details can drift across layout modes.
- Safer approach: Any shared visual/layout change needs a grep across app-core and extracted renderers plus Playwright smoke coverage.

### Untracked Backup File

- File: `src/modules/topology-renderer.js.bak`.
- Status: Untracked working-tree file.
- Risk: It can be accidentally committed or confuse future mapping/refactor work.
- Safer approach: Decide whether to delete it or add `*.bak` to `.gitignore` in a separate cleanup.

## Security Concerns

### Large `innerHTML` Surface Area

- Measured current count: 239 `innerHTML` occurrences across source.
- Top file: `src/app-core.js` with 150 occurrences.
- Risk: AWS JSON includes user-controlled names/tags. Missing escaping in any HTML-building path can become renderer XSS.
- Mitigations already present:
  - `esc()` in `src/modules/utils.js`.
  - Context isolation, sandbox, and no Node integration in Electron renderer.
  - Many comments mark escaped innerHTML paths.
- Safer approach: For new UI, prefer `textContent`, `replaceChildren`, or builders from `src/modules/dom-builders.js`.

### CSP Still Allows Inline Script And Style

- File: `index.html`.
- Current CSP includes `script-src 'self' 'unsafe-inline'` and `style-src 'self' 'unsafe-inline'`.
- Risk: Inline allowance reduces CSP value if an injection path exists.
- Constraint: Current static app still uses inline script/style patterns.
- Safer approach: Treat CSP tightening as its own phase, not incidental cleanup.

### Privileged Process Boundary Must Stay Tight

- Files: `main.js`, `preload.js`.
- Good current state: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
- Risk: Any new IPC surface can become a filesystem or command execution capability if not constrained.
- Safer approach: Validate inputs in `main.js`, keep preload wrappers narrow, and avoid exposing raw IPC.

## Performance Concerns

### Compliance Dashboard Rendering

- Files: `src/app-core.js`, `src/modules/compliance-view.js`.
- Current pattern: Cached/grouped data plus DOM rendering. Some rendering is chunked but not fully virtualized.
- Risk: Large AWS environments can create large finding sets and many DOM nodes.
- Safer approach: Add targeted performance tests or measurement before switching rendering strategy.

### Heavy XLSX Bundle

- File: `libs/xlsx.bundle.min.js`.
- Used by: `src/exports/exports-xlsx.js`.
- Concern: Full SheetJS bundle is vendored even though export/write paths are the main use.
- Mitigation: `loadSheetJS()` lazy-loads on first XLSX export.
- Safer approach: A write-only replacement needs export regression testing across Compliance, BUDR, full reports, and diff XLSX.

### DOM And Parse Hotspots

- Repeated DOM lookups, full HTML rebuilds, and large context assembly remain common.
- `src/app-core.js` still has 2,275 `var` occurrences, indicating many legacy function-scoped blocks.
- `structuredClone` is now used in multiple modules, which is good for correctness but can still be expensive on large contexts.

## Reliability Concerns

### Electron Runtime Requirements

- BUDR XLSX export requires `python3` available to the packaged/desktop environment.
- AWS scanning requires AWS CLI available through `/usr/bin/env`.
- Failure paths are handled, but these dependencies are outside npm.

### Build Output Drift

- Runtime loads `dist/*`, not raw `src/modules/*`.
- Source-only changes are invisible to the browser/Electron app until `node build.js` refreshes bundles.
- Current worktree already has an uncommitted `dist/app.bundle.js` modification unrelated to this codebase map.

### Gitignore Mismatch

- `.gitignore` includes `dist/` and `docs/`, but both contain tracked files.
- New files under those directories may be silently ignored unless force-added.
- This is easy to miss during release or documentation updates.

## Test Coverage Gaps

### PNG Export

- Files: `src/app-core.js` PNG export path and report capture helpers.
- Risk: SVG cloning, stylesheet collection, canvas rendering, and blob download can break without direct tests.
- Suggested next coverage: Playwright test that triggers PNG export enough to verify no console error and download/event path.

### Multi-Account Rendering

- Files: `src/app-core.js` multi-account region, `src/modules/multi-account.js`.
- Risk: Merge behavior can drop or mislabel resources across accounts/regions.
- Existing coverage: Helper unit tests for multi-account logic.
- Gap: End-to-end merged SVG output and account filter behavior.

### Active Topology Renderer

- Files: `src/app-core.js`, `src/modules/topology-renderer.js`.
- Risk: Active grid rendering is DOM/D3-heavy and mostly not unit-tested.
- Current coverage: Smoke and visual tests.
- Gap: Pure parse/lookup helpers and layout invariants.

### Electron IPC

- Files: `main.js`, `preload.js`.
- Risk: Desktop-only paths can regress while browser Playwright tests pass.
- Gaps: Native file dialogs, AWS CLI scanning, Python XLSX handoff, auto-update UI.

## Cleanup Candidates

- Decide fate of `src/modules/topology-renderer.js.bak`.
- Revisit `.gitignore` entries for tracked `dist/` and `docs/`.
- Continue shrinking `src/app-core.js` by deleting verified dead copies.
- Replace low-risk `innerHTML` paths with DOM builders when touching nearby code.
- Document intentional `window.*` bridges and remove the rest incrementally.

---
*Concerns analysis: 2026-04-29*
*Update after major refactors, new IPC, rendering changes, or test coverage changes.*
