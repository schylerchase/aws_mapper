# Monolith Dissolution Plan — `app-core.js` → pristine

Date: 2026-06-02 | Branch: `refactor/module-ownership` | Source: 8-agent structural analysis of all 19,132 lines (78 subsystems mapped)

**Goal:** dissolve the 19,132-line `src/app-core.js` classic-script monolith so the codebase is *pristine* — every file small and single-responsibility, readable by a junior engineer, no machine-shaped density, no globals-read-at-render-time.

This is the execution plan for OPTIMIZATION_PLAN **H1**. It assumes the safety net built in the prior HUMIFY pass (364 unit + 68 Playwright tests) and extends it: **every phase is tests-first and gated on the full Playwright suite staying green.**

---

## Target architecture

`app-core.js` does **not** fully disappear — it's a classic script (minify-copied to `dist/app-core.js`), and modules reach it only through the `window.AppModules` bridge assembled in `src/main.js`. End state: app-core shrinks to a **thin boot + controller seam (< 2,500 lines; stretch < 1,500)** that only (1) wires DOM events, (2) reads textareas/localStorage at the edges, (3) dispatches to bridged module functions. It owns **no pure logic and generates no HTML/code strings.**

Everything else moves into the module tree (extending today's 31 modules). The split is always **pure logic/state → `*-engine`/`*-layout`/`*-model` module (unit-tested)** vs **DOM/d3 render → `*-render`/`*-view` module (Playwright-tested)**. No function both computes and appends to the DOM.

## Definition of "pristine" (the measurable bar)

- No source file > **800 lines** (modules target < 600); app-core < **2,500** (stretch < 1,500).
- No line > **200 chars**; no ternary nested more than 1 level — replaced by named intermediates.
- Every new pure module has a `tests/unit/*.test.mjs`, callable from a fixture ctx with **no global/window setup** (this is the proof that audit-C1 is fixed).
- **Zero C4 drift:** grep proves every previously-twinned symbol is defined in exactly one file.
- Pure-vs-render is always a **function boundary**.
- Full Playwright suite (smoke, topology-smoke, dashboard, detail-panel, flow-mode, export, security, xss, visual) green after **every** phase.
- The `window` bridge is the sole app-core↔module coupling; no module imports app-core.
- A junior engineer can open any single file and understand it without reading app-core.

---

## Ordered plan (10 phases)

Front-loaded: phases 1–4 are net-negative/low-risk and shrink ~3,000 lines while establishing the rhythm. The hard render rewrites (6, 9) and dashboard bulk (7) are ~55% of effort and **must not start until the pure seams (1–5) are green.**

| # | Phase | Lines moved | Risk | Days | Gate (must be green before moving) |
|---|-------|------------:|------|-----:|-----------------------------------|
| 1 | **Quick wins** — pure data/const lifts + leaf utils (constants, inputSections, detect fns, res-tree, svg geometry) | ~650 | low | 4 | new unit tests for detect fns / `buildResTree` / svg math |
| 2 | **Consolidate drifted twins (C4)** — delete inline copies whose module already exists & is bridged (designApplyFns, flow-trace engine, snapshots/notes, complianceLookup, firewall ops, rlCtx builders) | −1,400 | med | 7 | per-twin: diff inline vs module, pin any inline-only branch in a test, then delete; Playwright parity |
| 3 | **State backbone (C1)** — promote scattered `let/var` map/UI/compliance globals into `state.js` (object + setters) | ~200 | med | 3 | full Playwright (high fan-out: `_rlCtx` written at render, read everywhere) + grep no bare top-level twins |
| 4 | **Clean pure extractions, no twin (C2)** — iac-policy-generator, inventory builders, report-import parsers, posture-engine, compliance-cache enrichment, diff-ctx, session-store, demo-split | ~1,500 | med | 9 | new `tests/unit/*` feeding fixture ctx → assert generated strings / rows / parsed objects |
| 5 | **Topology PURE layer (keystone)** — `buildIndexes` → topology-context; grid/landing-zone/executive layout geometry; map-zoom math; render-scheduler | ~1,600 | high | 10 | unit tests on index maps + layout outputs + zoom math; topology-smoke + visual green |
| 6 | **Detail-panel family** — model builders (resource-list/subnet/gateway/resource-info) + thin render; dedupe `section()`; IAM render → iam-engine | ~2,200 | high | 9 | model-builder unit tests with **no global setup**; detail-panel.spec green |
| 7 | **Dashboard render twins** — compliance/inventory/governance/iam/budr/posture/flow-analysis/diff: filter/sort/paginate → owning module, HTML → `*-render` | ~2,400 | med | 12 | unit tests for new filter/sort/aggregate fns; dashboard + export specs green per tab |
| 8 | **Design/firewall/flow/diff views** — controller/render into `*-view` modules; state via logic-module accessors; classification-rules reconciled with compliance scoring | ~3,500 | high | 11 | unit tests for pure cores (countMatches, multi-leg path, hex/circle math); flow-mode + security specs green |
| 9 | **Topology DRAW layer (hardest, last)** — giant d3 draw fns become thin consumers of phase-5 models; one shared `drawCloudResourceSections()`; highlight engine as a controller **factory** | ~3,800 | high | 12 | unit tests for pure geometry/path helpers; **visual.spec + topology-smoke are the hard gate** |
| 10 | **Boot/controller readability pass** — app-shell, declarative keymap, sidebar/onboarding, project-io/png/full-export; break the ~1,500-char clearBtn and 20-key keydown ladder | ~2,000 | med | 7 | unit tests for extractable cores; final grep audit (no twin, no line > 200 chars, no file > 800) |

**Total: ~85 engineering-days (range 75–100).** ≈ 17–20 calendar weeks solo; ≈ 9–11 weeks with two engineers splitting independent families (one on topology/flow, one on dashboards/reports/governance). Phases pause cleanly — each ends on green tests + green Playwright, so the campaign never leaves a half-migrated subsystem.

---

## Quick wins (each < 1 day, do first / anytime)

1. `_MAX_JSON_FILE_SIZE`/`_MAX_IMPORT_*` + `_CKV_MAP` → `constants.js` (pure data, zero risk).
2. `inputSections` AWS-describe manifest → `sidebar-inputs.js` (also reused by import/export).
3. `_hexToRgb` + `_circleEdge` → `flow-render.js`/`utils.js` with 5-line unit tests.
4. **Delete** inline `_designApplyFns` (confirmed full twin of `design-mode.js:494`, already bridged): −174 lines.
5. `buildResTree` + `resTooltipHtml` → `res-tree.js`, repoint flow-tracing's injected fn (removes an injection seam).
6. **Delete** inline `_saveSnapshots`/`_computeChecksum`/`_buildComplianceLookup` → already in `timeline.js`.
7. `detectAccountId`/`detectRegion`/`getAccountColor` → `multi-account.js` with a fixture test.
8. `positionTooltip` clamp math → pure `computeTooltipPos()` in `dom-helpers.js`.
9. Split the ~1,500-char `clearBtn` reset into named `resetCaches()`/`resetMapDom()`/`resetMultiAccount()`.

---

## Top risks & mitigations

1. **Topology has no direct tests** (Playwright/visual only — audit C2). Extraction errors surface as pixel diffs, not unit failures. → Extract pure layout/context **first** (phase 5) with unit tests; treat `visual.spec.js` as the hard gate for phases 6/9; never refactor draw code before its layout model is tested.
2. **Classic-script bridge:** every extraction adds a `main.js` binding; a missing/renamed bridge is a silent runtime `ReferenceError` that unit tests (which import modules directly) won't catch — only Playwright will. → Run full Playwright after each phase; add a boot-time assertion that required `window.*` fns are defined.
3. **`_rlCtx` write-at-render coupling (C1 epicenter):** written at renderMap, read by ~every subsystem at generation time. → Do the `state.js` migration as one atomic phase (3), gated entirely on Playwright, before render extraction.
4. **Drift reconciliation hides bugs:** the inline twin may contain an un-ported fix. → Diff every pair, write a test pinning any inline-only branch, make the module absorb it **before** deleting.
5. **Highlight/interaction engine** is irreducibly DOM-coupled (closures over 6 SVG layer selections). → Extract as a controller **factory** (`createHighlightController`), not pure fns; only path-trimming helpers become testable.
6. **CSS extraction side-effects:** lifting inline styles to classes can change specificity, caught only by visual snapshots. → Lift styles within the phase owning each renderer and re-baseline visual snapshots deliberately, reviewing each diff.
7. **Campaign fatigue** over 17–20 weeks (7 of 10 phases med/high). → Ordering guarantees every phase ships green; pause anytime.

---

## How to run a phase (the standing recipe)

1. Pick the next phase's subsystems. For each unit: read the current inline code, identify the pure core vs the DOM/render shell.
2. **Tests-first:** write/extend the `tests/unit/*.test.mjs` that pins the pure core against a fixture ctx (or, for a twin deletion, pins the canonical module behaviour incl. any inline-only branch). Verify it goes green→red(revert)→green.
3. Move the pure logic to the module, add the `main.js` bridge binding, repoint app-core to call the bridged global, delete the inline copy.
4. `npm run test:unit` green + `LD_LIBRARY_PATH=$HOME/.cache/pw-libs npx playwright test $(ls tests/*.spec.js | grep -v visual)` green (+ `visual.spec.js` for phases 5/6/9).
5. `node build.js --production` (rebuild bundles + cache-bust), commit, repeat.
