# Codebase Concerns

**Analysis Date:** 2026-04-03

---

## Tech Debt

### app-core.js Monolith — Primary Structural Debt

- Issue: Core orchestration file began at ~28,691 lines. Module extractions removed code from modules but did NOT simultaneously remove the dead copies in `app-core.js`. BUDR ENGINE, IAM ENGINE, and DEP GRAPH regions were deleted (-676 lines) but many functions duplicated across modules remain.
- Files: `src/app-core.js` (currently 19,197 lines)
- Impact: Any change to shared logic (label positioning, compliance display, report generation) risks only patching one copy while the other silently diverges. ~404 function definitions exist in a single file with 2,687 remaining `var` declarations.
- Fix approach: OPTIMIZATION_PLAN.md H1 — systematically compare each extracted module's exported functions against what still lives in `app-core.js` and delete the `app-core.js` copies. Realistic target: ~15,000–17,000 lines. Do not attempt automated extraction; DOM-coupled rendering code must stay inline.
- Status: In progress.

---

### Report Generation Still in app-core.js — H2

- Issue: `_generateReport`, `_rptBuildHeader`, `_rptBuildTOC`, `_rptBuildSections`, `_rptBuildFooter`, `_rptPrepClone`, `_rptCapturePNG`, `_rptSlugify`, `_rptEmbedDataBlob`, `_rptFullHTML`, `_rptUpdateFooterStats`, `_rptDebouncedPreview` — ~14 report functions remain inline in `app-core.js`. The original OPTIMIZATION_PLAN.md H2 planned to split this into `report-html.js`, `report-xlsx.js`, `iac-checkov.js`, and `iac-modal.js`.
- Files: `src/app-core.js` lines 17142–17933, `src/modules/report-html.js` (1,376 lines), `src/exports/exports-xlsx.js` (905 lines)
- Impact: HTML report generation cannot be tested in isolation. Report module cannot be lazy-loaded. HTML report state (`_rptState`) is declared at `app-core.js:396` as a module-level `var`, coupling report config to the full app lifecycle.
- Fix approach: Extract remaining `_rptBuild*` functions and `_generateReport` to `src/modules/report-html.js` or a new `src/exports/exports-report.js`. Move `_rptState` initialization there.

---

### Duplicate Snapshot/Timeline Logic in detail-panel.js

- Issue: `src/modules/detail-panel.js` lines 435–478 contain a full copy of snapshot state (`_snapshots`, `_viewingHistory`, `_currentSnapshot`) and `_saveSnapshots`/`_computeChecksum` functions. The canonical implementations are in `src/modules/timeline.js`. Comment on line 439: `// TODO: deduplicate — canonical snapshot/timeline logic is in timeline.js`.
- Files: `src/modules/detail-panel.js` lines 435–478, `src/modules/timeline.js`
- Impact: Snapshot state can diverge between the two copies at runtime. Any bug fix to snapshot trimming must be applied in both files.
- Fix approach: Import `takeSnapshot`, `_snapshots`, `_saveSnapshots` from `timeline.js` in `detail-panel.js`. Remove the duplicate declarations.

---

### 2,687 Remaining `var` Declarations in app-core.js

- Issue: While modules have been largely converted (`governance.js`: 0, `flow-tracing.js`: 0, `topology-renderer.js`: 59, `detail-panel.js`: 12, `search.js`: 4), `app-core.js` retains 2,687 `var` declarations. These are function-scoped, creating hoisting risks in complex control flow.
- Files: `src/app-core.js`
- Impact: Risk of accidental variable reuse across branches in large functions. Particularly risky in `_renderMapInner` and `mergeContexts` (line 9926).
- Fix approach: OPTIMIZATION_PLAN.md M3 — use `jscodeshift` or ESLint `--fix` with `prefer-const`. Requires manual review for hoisting-sensitive cases.

---

### Window Global Namespace Pollution

- Issue: `src/main.js` does `Object.assign(window, window.AppModules)` at line 172, dumping ~100+ symbols into the global namespace as a transitional bridge. Modules like `src/modules/compliance-view.js` (15 `window.*` assignments, lines 368–380) and `src/modules/unified-dashboard.js` (6 assignments, lines 60–65) export directly to `window`. `src/modules/flow-analysis.js` reads three functions (`window._traceInternetToResource`, `window._traceResourceToInternet`, `window._traceFlowLeg`) that are only available because `app-core.js` defines them as plain functions in global scope — they are never explicitly assigned to `window`.
- Files: `src/main.js` line 172, `src/modules/compliance-view.js` lines 368–380, `src/modules/unified-dashboard.js` lines 60–65, `src/modules/flow-analysis.js` lines 8–22, `src/app-core.js` lines 12154–12239
- Impact: Name collision risk between any of the ~100+ exported symbols and future code. The `flow-analysis.js` bridge will silently fall back to `{ blocked: true, path: [] }` if `app-core.js` is ever loaded out of order or the functions are renamed.
- Fix approach: OPTIMIZATION_PLAN.md M2 — replace `Object.assign(window, ...)` with proper ES module imports. Requires extracting `_traceInternetToResource`, `_traceResourceToInternet`, and `_traceFlowLeg` from `app-core.js` to `flow-tracing.js` first.

---

### notes.js Eagerly Reads localStorage at Parse Time

- Issue: `src/modules/notes.js` line 9 calls `localStorage.getItem(_NOTES_KEY)` directly at module parse time (top-level statement, not inside a function). OPTIMIZATION_PLAN.md Q5 flags this but marks it low ROI due to 17 access sites.
- Files: `src/modules/notes.js` line 9
- Impact: If `localStorage` is unavailable (sandboxed context, storage disabled) the module load can throw rather than degrade gracefully. A duplicate initialization exists in `src/app-core.js:9272` (`_ensureNotesLoaded`) that wraps the same operation in a try/catch — the two can diverge.
- Fix approach: Wrap the parse-time call in try/catch (line 10 wraps the author read but line 9 does not). Alternatively, move to lazy init inside `_ensureNotesLoaded` and remove the `app-core.js` duplicate.

---

## Fragile Areas

### Four Unsynchronized Rendering Paths

- Issue: Four distinct rendering paths produce VPC and subnet labels with independently hardcoded pixel offsets. None share a common layout engine:
  1. `src/modules/topology-renderer.js` — Grid/Executive/Columns layouts, `vpc-label` at `y+16`, `subnet-label` at `y+16`
  2. `src/app-core.js` lines ~4450, 4650 — Landing Zone hub-spoke VPC/subnet labels
  3. `src/app-core.js` lines ~7199, 7236 — Grid layout VPC/subnet labels (second separate path)
  4. `src/modules/landing.js` lines ~382, 591 — Landing page VPC/subnet labels
- Files: `src/modules/topology-renderer.js`, `src/app-core.js` (four separate label regions), `src/modules/landing.js`
- Impact: Any spacing change (text scale, icon size, AZ header height) must be applied to all four paths simultaneously. Missing one path produces visual inconsistencies that only appear in specific layout modes.
- Safe modification: Any change to `vpc-label` or `subnet-label` y-offsets, AZ header heights, or padding constants requires searching all four locations listed in `CLAUDE.md` under "Rendering Paths (CRITICAL)". Run a full layout smoke test across all four modes after any label change.
- Test coverage: E2E smoke tests verify SVG renders content but do not assert label pixel positions. Layout-mode switching is tested in `tests/edge-cases.spec.js:162` but only checks for the presence of SVG groups, not label coordinates.

---

### PNG Export Relies on Live DOM State

- Issue: `src/app-core.js:18467` (`expPng` click handler) and `src/app-core.js:17488` (`_rptCapturePNG`) both work by: (1) reading the live `#mapSvg` DOM element with `getBBox()`, (2) collecting all stylesheet rules via `_rptCollectStyles()` which iterates `document.styleSheets`, (3) cloning the SVG node, and (4) serializing to a blob and drawing to canvas. `_rptCollectStyles` (`src/modules/report-html.js:931`) caches by theme name only, not by CSS content.
- Files: `src/app-core.js` lines 18466–18514 (export), 17488–17519 (report capture), `src/modules/report-html.js:931` (`_rptCollectStyles`)
- Impact: PNG export fails silently with "PNG render failed - try SVG export instead" if `#mapSvg` has no `.map-root`. Export depends on current theme CSS being loaded in `document.styleSheets`. Style changes or new CSS that loads after the cache is populated will not appear in exports until a theme switch clears the cache.
- Safe modification: Do not remove the `if(!root)return` guard at `app-core.js:18470`. Do not change `getBBox()` timing — the `requestAnimationFrame` + `setTimeout(..., 0)` double-yield at line 18472 is intentional to ensure the SVG is painted before measurement.
- Test coverage: No E2E tests cover the `expPng` export path.

---

### Multi-Account Merge Complexity

- Issue: `mergeContexts` (`src/app-core.js:9926`) manually concatenates 40+ array fields, merges 17 object-lookup maps, handles both `Map` and plain-object types, and yields to the main thread between accounts. `buildRlCtxFromData` (`src/modules/multi-account.js:45`) runs 110+ lines of region inference heuristics for VPCs, subnets, IGWs, NAT gateways, peerings, VPNs, ECS services, and TGW attachments.
- Files: `src/app-core.js` lines 9926–9997, `src/modules/multi-account.js` lines 45–175
- Impact: A missing array key or a Map vs. plain-object inconsistency silently drops resources from the merged context without error. The fallback at line 9930 rebuilds contexts from textareas but is slow and untested for edge cases.
- Safe modification: Before modifying `mergeContexts`, add a test in `tests/unit/multi-account.test.mjs` that merges two real-shaped contexts and asserts key counts. `mergeContexts` is not exported and cannot be unit tested without a browser environment.
- Test coverage: `tests/unit/multi-account.test.mjs` does not test `mergeContexts`. No E2E test covers multi-account mode rendering.

---

### topology-renderer.js Cannot Become an ES Module (Blocked)

- Issue: `src/modules/topology-renderer.js` line 3 has a `// TODO: convert to ES module` comment. Conversion is blocked by OPTIMIZATION_PLAN.md L8: the module reads 40+ window globals set by `app-core.js` at runtime. Until M2 (window globals cleanup) is complete, `topology-renderer.js` cannot be properly imported.
- Files: `src/modules/topology-renderer.js` (59 remaining `var` declarations), `src/modules/topology-renderer.js.bak` (1,996-line backup, untracked, not gitignored)
- Impact: Any change to variable names in `app-core.js` can silently break the renderer at runtime. The `.bak` file can be accidentally committed.
- Safe modification: Do not delete `topology-renderer.js.bak` without confirming it is not needed as a rollback reference. Add `*.bak` to `.gitignore`.

---

## Performance Bottlenecks

### Compliance Dashboard — All Rows in DOM (No Virtualization)

- Problem: `src/app-core.js:562` (`_renderCompTableRows`) renders findings in chunks via `requestIdleCallback`. While this avoids blocking the main thread, all rows eventually end up as real DOM nodes. With 1000+ findings (common for large AWS accounts), the table DOM grows without bound.
- Files: `src/app-core.js` lines 562–584
- Cause: Chunked rendering defers work but does not virtualize. No cap exists on total rows rendered.
- Improvement path: OPTIMIZATION_PLAN.md M4 — implement virtual scrolling. Render only visible rows + a buffer. Use `IntersectionObserver` or a scroll listener to swap rows in/out.

---

### SheetJS Full Bundle — 416KB Loaded Eagerly on First Export

- Problem: `libs/xlsx.bundle.min.js` (416KB) is the full SheetJS bundle including read/parse operations. Only write operations are used. Bundle is lazy-loaded on first XLSX export via `loadSheetJS()` in `src/exports/exports-xlsx.js:15`.
- Files: `libs/xlsx.bundle.min.js`, `src/exports/exports-xlsx.js` lines 15–29
- Cause: No write-only build of SheetJS has been created.
- Improvement path: OPTIMIZATION_PLAN.md M1 — build a write-only SheetJS bundle (~200KB, ~52% reduction).

---

### topology-renderer.js `.main` querySelector Not Cached

- Problem: `src/modules/topology-renderer.js` calls `querySelector('.main')` on each render without caching the result.
- Files: `src/modules/topology-renderer.js`
- Cause: No module-level cache for the `.main` DOM reference.
- Improvement path: OPTIMIZATION_PLAN.md item 21 — cache after first call, invalidate on `DOMContentLoaded`.

---

## Security Considerations

### Large innerHTML Surface Area

- Risk: `src/app-core.js` contains 82+ `innerHTML` assignments. Many construct HTML strings from AWS resource data (names, CIDRs, tag values). `src/modules/search.js:90` sets `res.innerHTML=h` where `h` is built from search result highlights. Total `innerHTML` usage across `src/` is ~235 sites.
- Files: `src/app-core.js` (82 sites), `src/modules/search.js` lines 77, 90, 274, and ~150 additional sites across modules
- Current mitigation: `esc()` from `src/modules/utils.js:65` is used in most paths. Electron's `contextIsolation: true`, `nodeIntegration: false`, and `sandbox: true` (`main.js:38–40`) prevent renderer XSS from reaching Node.js IPC.
- Recommendations: Audit the ~235 total `innerHTML` sites for missing `esc()` calls. Prefer `DocumentFragment` + `textContent` for text-only insertions (tracked in OPTIMIZATION_PLAN.md L6 for `search.js`'s 4 sites).

---

### AWS Credentials in sessionStorage (Web Context Only)

- Risk: `src/app-core.js:17962` persists textarea content (raw AWS JSON — VPCs, subnets, security groups, IAM data) to `sessionStorage` every 30 seconds with a 7-day TTL.
- Files: `src/app-core.js` lines 17958–17975
- Current mitigation: Electron disables auto-save entirely (`_autoSaveDisabled=true` at line 17973). Only textareas with `value.length <= 100000` are saved. Session storage is origin-isolated.
- Recommendations: Consider reducing TTL from 7 days to 24 hours for web context. Consider adding a user-visible notice that session data (which includes AWS topology) is being persisted.

---

## Test Coverage Gaps

### PNG Export Has No Test Coverage

- What's not tested: The entire PNG export pipeline — SVG clone, style injection, canvas rendering, `canvas.toBlob` — has no E2E or unit test. `tests/export.spec.js` tests HTML/XLSX/DOCX but not PNG.
- Files: `src/app-core.js` lines 18466–18514
- Risk: Regressions in SVG serialization, stylesheet collection, or canvas pipeline go undetected until manual testing.
- Priority: Medium

---

### Multi-Account Rendering Has No E2E Coverage

- What's not tested: No E2E test loads two account contexts, triggers multi-account merge, and verifies the rendered SVG contains resources from both accounts. `mergeContexts` is not exported and cannot be unit tested without a browser environment.
- Files: `tests/` (all spec files), `src/app-core.js` lines 9926–9997
- Risk: The complex `mergeContexts` pipeline can silently drop resources. Multi-account is the most complex user workflow and the most likely to break from refactoring.
- Priority: High

---

### Topology Renderer Has No Unit Tests

- What's not tested: `_parseInputs`, `_buildLookupMaps`, and the grid/executive/columns rendering functions in `src/modules/topology-renderer.js` have no unit test file. Visual regression tests in `tests/visual.spec.js` indirectly cover output but do not test module functions directly.
- Files: `src/modules/topology-renderer.js` (1,960 lines), `tests/unit/` (no `topology-renderer.test.mjs`)
- Risk: Refactoring `_renderMapInner` (OPTIMIZATION_PLAN.md H3) or fixing label positioning breaks silently. At minimum, `_parseInputs` and `_buildLookupMaps` are now pure-data sub-functions that could be unit tested.
- Priority: Medium

---

## Abandoned / Leftover Artifacts

### delete-me/ Directory in Repository

- Issue: `delete-me/` directory exists in the repo root and is gitignored. Contains: `index.html.backup`, `index.html.bak`, `index.html.bak2`, `flow-arrow-playground.html`, `mockup-redesign.html`, `modular-refactor.skill`, `OPTIMIZATION_PLAN.md`, `PLAN.md`, `PROMPT.md`, `__pycache__/`.
- Files: `delete-me/` (entire directory)
- Impact: No production risk (gitignored). Dev confusion about which plan documents are canonical — the authoritative `OPTIMIZATION_PLAN.md` is in the repo root.
- Fix approach: Delete the directory entirely once contents are confirmed unneeded.

### topology-renderer.js.bak in Working Tree

- Issue: `src/modules/topology-renderer.js.bak` (1,996 lines) is an untracked file in the working tree. It is listed in `git status` as untracked (`??`) but is not in `.gitignore`.
- Files: `src/modules/topology-renderer.js.bak`
- Impact: Can be accidentally committed. Adds noise to `git status`.
- Fix approach: Add `*.bak` to `.gitignore`, or delete the file if it is no longer needed as a reference.

---

*Concerns audit: 2026-04-03*
