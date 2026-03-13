# Optimization Plan

Updated: 2026-03-12
Status: 22/46 completed, 24 remaining

---

## What's Done

| # | Item | Commit |
|---|------|--------|
| 1 | D3 custom build (52KB vs 280KB) | `1a87251` |
| 2 | `flow-analyzer.js` deleted (duplicate of flow-tracing) | `1a87251` |
| 3 | `index.html` modularized (570 lines, was 29,163) | `a3c4027` |
| 4 | esbuild bundler + ES module system | `524b8e5` |
| 5 | `structuredClone` in core (partial — app-core paths) | `69ac564` |
| 6 | Map-based lookups for SG/resource by ID | `9952cb5` |
| 7 | Search index built once at load time | `9952cb5` |
| 8 | Compliance check caching | `9952cb5` |
| 9 | `var` → `const/let` phase 1 (app-core.js) | `1a87251` |
| 10 | `innerHTML` → `textContent` where safe | `19d5692` |
| 11 | O(1) SG lookups via Map | `19d5692` |
| 12 | `alert()` → `showToast()` in app-core.js | `69ac564` |
| 13 | Lazy demo data init | `36b0528` |
| 14 | Deterministic data for stable renders | `36b0528` |
| 15 | Local libs (no CDN dependency at runtime) | `36b0528` |
| 16 | 14 ES modules extracted (Phase 5) | `a3c4027` |
| 17 | Module bridge for cross-module calls | `19d5692` |
| 18 | Unused `execSync`/`execFileSync` imports removed (main.js) | prior |
| 19 | `governance.js` `structuredClone` | prior |
| 20 | `dashboards.js` 2× `JSON.parse(JSON.stringify())` → `structuredClone()` | pending |
| 21 | `topology-renderer.js` `.main` querySelector cached | pending |
| 22 | `export-utils.js` `resolveColor` Map cache | prior |

---

## Remaining — Quick Wins (< 5 min each)

| # | File | Issue | Fix |
|---|------|-------|-----|
| Q4 | `compliance-engine.js:51` | `_gn2` similar to `gn()` but has WeakMap cache + lowercase tags support | Not a true duplicate — keep as-is or unify carefully |
| Q5 | `notes.js:9` | `localStorage` read at parse time | Low ROI — 17 access sites make lazy-init invasive |

---

## Remaining — High Priority

### H1. `app-core.js` — 28,691-line monolith
**Category**: code_quality | **Effort**: Very High | **Impact**: Very High

The original monolith. Modules were extracted from it but code was NOT removed, creating duplicates. Contains copies of `_sanitizeName`, `resolveColor`, test harness, snapshot logic, and report-builder functions that also exist in their respective modules.

**Fix**: Identify code in `app-core.js` that is already in extracted modules. Delete the duplicates. What remains becomes the app initialization + orchestration layer (target: < 3,000 lines).

---

### H2. `report-builder.js` — 7,283 lines, 123+ functions
**Category**: code_quality | **Effort**: High | **Impact**: High

Contains HTML report generation, XLSX export, IaC generation, modal logic, and test harnesses. Untestable and unmaintainable.

**Fix**: Split into `report-html.js`, `report-xlsx.js`, `iac-checkov.js`, `iac-modal.js`. Move test harness to `tests/`. Dynamic `import()` so it only loads when reports are opened.

---

### H3. `topology-renderer.js` — `_renderMapInner` is 1,973 lines
**Category**: code_quality | **Effort**: High | **Impact**: High

Single function with 5+ nesting levels. Impossible to test stages independently.

**Fix**: Extract into `parseInputData()`, `buildLookupMaps()`, `computeLayout()`, `renderVpcGroups()`, `renderResources()`, `renderConnections()`. Each < 150 lines.

---

### H4. 46 `JSON.parse(JSON.stringify())` calls remain
**Category**: performance | **Effort**: Low | **Impact**: Medium

Spread across 6 files: `report-builder.js` (16), `app-core.js` (15), `firewall-editor.js` (6), `detail-panel.js` (4), `firewall-engine.js` (3), `dashboards.js` (2).

**Fix**: Replace all with `structuredClone()`. Batch find-and-replace with manual review for edge cases.

---

### H5. 17 `alert()` calls in production code
**Category**: code_quality | **Effort**: Low | **Impact**: Medium

Blocks main thread, inconsistent with toast-based UX. Found in: `report-builder.js` (12), `design-mode.js` (3), `topology-renderer.js` (1), `firewall-engine.js` (2). (Excludes 2 XSS test strings.)

**Fix**: Replace with `showToast(msg, 'error')` or `showToast(msg, 'warning')` as appropriate. Log full errors to `console.error`.

---

### H6. `_sanitizeName` defined in 2 places, `resolveColor` in 3
**Category**: code_quality | **Effort**: Low | **Impact**: Medium

- `_sanitizeName`: `app-core.js:25917`, `report-builder.js:4526`
- `resolveColor`: `export-utils.js:361`, `app-core.js:23149`, `report-builder.js:1762`

**Fix**: Keep canonical copies in `export-utils.js`. Import everywhere else. Delete duplicates.

---

## Remaining — Medium Priority

### M1. SheetJS still full 415KB bundle
**Category**: bundle_size | **Effort**: Medium | **Impact**: High

Only write operations are used. Read/parse modules account for ~60% of size.

**Fix**: Build write-only SheetJS bundle (~200KB). Lazy-load via `import()` only when export is triggered.

---

### M2. 151 `window.*` global exports across 13 files
**Category**: code_quality | **Effort**: High | **Impact**: Medium

Top offenders: `iac-generator.js` (40), `app-core.js` (29), `design-mode.js` (23), `report-builder.js` (20), `compliance-view.js` (17).

**Fix**: Replace with proper ES module imports. Create bridge modules for legacy callers during transition. Delete bridges once all callers are converted.

---

### M3. ~500 `var` declarations outside app-core.js
**Category**: code_quality | **Effort**: Medium | **Impact**: Low

Top files: `governance.js` (161), `flow-tracing.js` (106), `search.js` (62), `topology-renderer.js` (61), `detail-panel.js` (57).

**Fix**: Run `jscodeshift` or ESLint `--fix` with `prefer-const`. Manual review for hoisting-sensitive cases.

---

### M4. Compliance dashboard — chunked rendering, not virtualized
**Category**: performance | **Effort**: Medium | **Impact**: Medium

Currently renders first 100 rows, defers rest via `requestIdleCallback`. All rows still end up in the DOM. Performance degrades with 1000+ findings.

**Fix**: Implement virtual scrolling — render only visible rows + buffer. Use IntersectionObserver or scroll listener. Alternatively, cache rendered DOM subtrees per tab and reattach instead of rebuilding.

---

### M5. `diff-engine.js:43` — `JSON.stringify` as sort comparator
**Category**: performance | **Effort**: Low | **Impact**: Low

Each element serialized multiple times during sort.

**Fix**: Pre-serialize once into a parallel array, sort by those strings, discard.

---

### M6. `diff-engine.js:100` — repeated `JSON.stringify` during field diff
**Category**: performance | **Effort**: Low | **Impact**: Low

Same objects serialized multiple times across comparisons.

**Fix**: Cache with `WeakMap` keyed by object. Reuse for same diff run.

---

### M7. Governance classification code in `diff-engine.js`
**Category**: code_quality | **Effort**: Medium | **Impact**: Medium

Belongs in `governance.js`. Forces `diff-engine.js` to load when only governance rules are needed.

**Fix**: Move classification block to `governance.js`. Export and import where needed.

---

### M8. `compliance-engine.js:430` — `parseIAMData` not cached
**Category**: performance | **Effort**: Low | **Impact**: Medium

Re-processes IAM data on every compliance check.

**Fix**: Parse once, cache in module-level variable, invalidate on data reload.

---

### M9. `topology-renderer.js:523` — zoom level DOM update on every frame
**Category**: performance | **Effort**: Low | **Impact**: Low

Fires many times per second during scroll/pinch.

**Fix**: Throttle with `requestAnimationFrame` — set dirty flag, update DOM only in rAF callback.

---

## Remaining — Low Priority

| # | File | Issue | Fix |
|---|------|-------|-----|
| L1 | `design-mode.js:613` | State exported as `window` globals | Expose via getter/setter functions |
| L2 | `report-builder.js:7271` | iOS gesture listeners in wrong module | Move to `mobile-compat.js` or app init |
| L3 | `firewall-engine.js:293` | 293 `var` declarations | Convert to ES module, codemod `var` → `const/let` |
| L4 | `detail-panel.js:392` | Duplicate snapshot loading logic | Centralize in `snapshots.js` |
| L5 | `dom-helpers.js:9` | `showToast` creates new DOM node every call | Reuse one persistent element |
| L6 | `search.js:27` | Search results built by string concat + innerHTML | Use `DocumentFragment` + `textContent` |
| L7 | `export-utils.js:449` | VSDX bridge initialized at module load | Wrap in lazy-init `getVsdxBridge()` |
| L8 | `topology-renderer.js:5` | Not an ES module | Add `export`/`import`, load as `type="module"` |

---

## Summary

| Category | Done | Remaining | Total |
|----------|------|-----------|-------|
| Code Quality | 10 | 14 | 24 |
| Performance | 10 | 6 | 16 |
| Bundle Size | 2 | 2 | 4 |
| **Total** | **22** | **24** | **46** |

## Recommended Order

1. **Quick wins Q1–Q7** — 30 min total, immediate improvement
2. **H4–H6** — low effort deduplication + cleanup, 1-2 hours
3. **H1** — deduplicate `app-core.js` against extracted modules (biggest structural win)
4. **H2** — split `report-builder.js`
5. **H3** — extract `_renderMapInner`
6. **M1** — SheetJS write-only build
7. **M2–M4** — window globals, var modernization, virtualization
8. **Rest** — as time permits
