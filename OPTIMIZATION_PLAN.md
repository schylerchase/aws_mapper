# Optimization Plan

Updated: 2026-06-02
Status: in progress on branch `refactor/module-ownership` — 6 pure-helper modules extracted, 7 dead orphan modules removed (-7,519 lines). See "Done" below.

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
| 16 | 14 ES modules extracted (Phase 5) — most never wired in (dead orphans); 7 removed 2026-06-02 (see #32) | `a3c4027` |
| 17 | Module bridge for cross-module calls | `19d5692` |
| 18 | Unused `execSync`/`execFileSync` imports removed (main.js) | prior |
| 19 | `governance.js` `structuredClone` | prior |
| 20 | `dashboards.js` 2× `JSON.parse(JSON.stringify())` → `structuredClone()` | pending |
| 21 | `topology-renderer.js` `.main` querySelector cached | pending |
| 22 | `export-utils.js` `resolveColor` Map cache | prior |
| 23 | H4: `structuredClone` in modules (29 replacements across 4 files) | 2026-03-13 |
| 24 | H5: `alert()` → `showToast()` in modules (6 replacements) | 2026-03-13 |
| 25 | H6: Deduplicate `resolveColor` + `downloadBlob` from app-core.js | 2026-03-13 |
| 26 | M8: Cache `parseIAMData` in compliance-engine.js | 2026-03-13 |
| 27 | M9: Throttle zoom DOM update with requestAnimationFrame | 2026-03-13 |
| 28 | M3 (partial): `var` → `const/let` in budr-engine, iac-generator, network-rules, compliance-view, search | 2026-03-13 |
| 29 | H1 (partial): Deleted BUDR ENGINE, IAM ENGINE, DEP GRAPH regions from app-core.js (-676 lines) | 2026-03-13 |
| 30 | State bridges: `Object.defineProperty` live bindings added to 11 modules | 2026-03-13 |
| 31 | Flattened namespace exports in main.js for app-core.js backward compat | 2026-03-13 |
| 32 | Dead-code cleanup: 7 unwired orphan modules removed (-7,519 lines): topology-renderer, landing, firewall-engine, dashboards, detail-panel, search, notes — superseded by app-core.js live copies; production bundle byte-identical after removal | 2026-06-02 |
| 33 | 6 pure-helper modules extracted from app-core.js + unit tests: diff-view, file-classify, firewall-cli, firewall-validate, report-view, search-index | 2026-06-02 |
| 34 | Correctness fixes + tests: CFN SG-rule fan-out, /0 CIDR size, IAM own-account/NaN guards (exports-iac, cidr-engine, iam-engine) | 2026-06-02 |

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

**Status**: In progress on branch `refactor/module-ownership`. Earlier: BUDR/IAM/DEP-GRAPH regions deleted (-676 lines), state bridges added, namespace exports flattened. 2026-06-02: removed 7 dead orphan modules (the unwired Phase-5 extractions) — app-core.js (≈19,253 lines) is now the single source of truth per subsystem. Next: extract DOM-coupled subsystems *fresh* from app-core.js into wired modules (notes → detail-panel → …) following the `design-mode.js` pattern (pure logic/state/validation in the module, DOM rendering inline in app-core, bridged via main.js window exports), then delete the inline copy. Do NOT resurrect the deleted orphans — they had drifted from app-core.

---

### H2. `report-builder.js` — 7,283 lines, 123+ functions
**Category**: code_quality | **Effort**: High | **Impact**: High

Contains HTML report generation, XLSX export, IaC generation, modal logic, and test harnesses. Untestable and unmaintainable.

**Fix**: Split into `report-html.js`, `report-xlsx.js`, `iac-checkov.js`, `iac-modal.js`. Move test harness to `tests/`. Dynamic `import()` so it only loads when reports are opened.

---

### ~~H3. `topology-renderer.js` — `_renderMapInner` split~~ ⚠️ STALE / OBSOLETE
The `topology-renderer.js` file was a dead orphan (never wired into any bundle) and was removed 2026-06-02. The live map renderer (`_renderMapInner`, ~1,700 lines) is inline in app-core.js. Any future split must be done *fresh* from app-core.js, not from the deleted file.

---

### ~~H4. `JSON.parse(JSON.stringify())` → `structuredClone()`~~ ✅ DONE
Replaced 29 occurrences across firewall-editor (6), detail-panel (4), firewall-engine (3), edge-tests (16).

---

### ~~H5. `alert()` → `showToast()` in modules~~ ✅ DONE
Replaced 6 production alert() calls in design-mode (3), topology-renderer (1), firewall-engine (2).

---

### ~~H6. Deduplicate `resolveColor` + `downloadBlob`~~ ✅ DONE
Deleted duplicate definitions from app-core.js. Canonical copies in export-utils.js, bridged via `window.*`.

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

### ~~M8. Cache `parseIAMData`~~ ✅ DONE
Added module-level cache in compliance-engine.js — skips re-parse if raw data unchanged.

---

### ~~M9. Throttle zoom DOM update~~ ✅ DONE
Wrapped zoom-level textContent update in `requestAnimationFrame` guard in topology-renderer.js.

---

## Remaining — Low Priority

| # | File | Issue | Fix |
|---|------|-------|-----|
| L1 | ~~`design-mode.js` window globals~~ | ✅ DONE — getter/setter bridges in place | |
| L2 | `report-builder.js` iOS gesture listeners | Move to `mobile-compat.js` or app init | Low ROI |
| L3 | ~~`firewall-engine.js` var declarations~~ | ✅ DONE — 0 var remain | |
| L4 | `detail-panel.js` snapshot logic | Centralize in `timeline.js` | Low ROI |
| L5 | ~~`dom-helpers.js` showToast~~ | ✅ DONE — uses persistent singleton | |
| L6 | `search.js` innerHTML (4 calls) | Use `DocumentFragment` + `textContent` | Low ROI |
| L7 | ~~`export-utils.js` VSDX bridge~~ | ✅ DONE — lazy-init via `Object.defineProperty` | |
| L8 | `topology-renderer.js` not ES module | Blocked by M2 (window globals) | Deferred |

---

## Summary

| Category | Done | Remaining | Total |
|----------|------|-----------|-------|
| Code Quality | 25 | 5 | 30 |
| Performance | 12 | 4 | 16 |
| Bundle Size | 2 | 1 | 3 |
| **Total** | **39** | **10** | **49** |

## Recommended Order

1. **Quick wins Q1–Q7** — 30 min total, immediate improvement
2. **H4–H6** — low effort deduplication + cleanup, 1-2 hours
3. **H1** — deduplicate `app-core.js` against extracted modules (biggest structural win)
4. **H2** — split `report-builder.js`
5. **H3** — extract `_renderMapInner`
6. **M1** — SheetJS write-only build
7. **M2–M4** — window globals, var modernization, virtualization
8. **Rest** — as time permits
