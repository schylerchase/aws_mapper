# app-core.js Monolith Decomposition Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Decompose src/app-core.js (~29K lines) into ~12 ES modules under src/core/, bundled by esbuild into dist/app-core.js.

**Architecture:** Phase-extracted ES modules. Shared state in state.js, cross-cutting helpers in utils-ui.js. esbuild bundles src/core/index.js → dist/app-core.js (IIFE). 4 phases, each committed independently.

**Tech Stack:** esbuild (existing), ES modules, no new dependencies

---

## Task 0: Build System Setup

**Files:**
- Modify: `build.js`
- Create: `src/core/index.js`
- Create: `src/core/state.js`

**Step 1: Read current build.js to understand the minify-copy step for app-core.js**

Read `build.js` and find how it currently handles `src/app-core.js` → `dist/app-core.js`.

**Step 2: Create src/core/index.js as a thin wrapper that re-exports the current monolith**

```js
// Phase 0: just re-export everything from the monolith
// This file will grow as we extract modules
import '../app-core.js';
```

Wait — this won't work because app-core.js isn't an ES module. Instead:

**Step 2 (revised): Modify build.js to bundle src/core/index.js → dist/app-core.js**

Add a new esbuild entry alongside the existing modules bundle:
```js
await esbuild.build({
  entryPoints: ['src/core/index.js'],
  bundle: true,
  format: 'iife',
  outfile: 'dist/app-core.js',
  minify: production,
});
```

Remove or guard the old `src/app-core.js` minify-copy step so it doesn't overwrite.

**Step 3: Create minimal src/core/index.js that imports state.js (empty for now)**

```js
import { S } from './state.js';
// Phase 0 placeholder — modules will be imported here as extracted
```

**Step 4: Create src/core/state.js with empty S export**

```js
// Shared mutable state — populated as modules are extracted
export const S = {};
```

**Step 5: Verify build works**

Run: `node build.js`
Expected: Both `dist/app.bundle.js` and `dist/app-core.js` are produced without errors.

**Step 6: Verify app still works**

Run: `npm run test:unit`
Expected: 200/200 pass

Open in browser, click Explore Demo, verify map renders.

**Step 7: Commit**

```bash
git add build.js src/core/index.js src/core/state.js
git commit -m "refactor(build): add src/core/ esbuild entry point for monolith decomposition"
```

---

## Task 1: Extract state.js — Shared State Variables

**Files:**
- Modify: `src/app-core.js` (remove variable declarations, import from state.js)
- Modify: `src/core/state.js` (add all shared variables)
- Modify: `src/core/index.js` (import state, expose on window for app-core.js transition)

**Step 1: Identify and extract top-level state variables**

Scan `src/app-core.js` for all top-level `let`/`var`/`const` declarations. Move them to `state.js` as properties of `S`:

```js
export const S = {
  isElectron: typeof process !== 'undefined' && process.versions?.electron,
  complianceFindings: null,
  gTxtScale: 1,
  svgHeavy: false,
  rlCtx: null,
  sgById: {},
  gwNames: {},
  mapSvg: null,
  mapZoom: null,
  mapG: null,
  // ... all ~50 vars
};
```

**Step 2: Expose S on window for gradual migration**

In `src/core/index.js`:
```js
import { S } from './state.js';
window.__coreState = S;
```

In `src/app-core.js`, replace direct variable references with `window.__coreState.xxx` OR keep local aliases:
```js
const S = window.__coreState;
// Then use S.rlCtx instead of _rlCtx
```

**NOTE:** This is the hardest task because every variable reference in app-core.js must be updated. Consider doing this incrementally — move 5-10 variables per sub-step, verify, continue.

**Step 3: Build and test**

Run: `node build.js && npm run test:unit`
Open browser, verify demo works.

**Step 4: Commit**

```bash
git add src/core/state.js src/core/index.js src/app-core.js
git commit -m "refactor(core): extract shared state to src/core/state.js"
```

---

## Task 2: Extract utils-ui.js — Cross-Cutting Helpers

**Files:**
- Create: `src/core/utils-ui.js`
- Modify: `src/app-core.js` (remove extracted functions)
- Modify: `src/core/index.js` (import and expose on window)

**Step 1: Extract these functions to utils-ui.js**

Functions to move (with approximate line numbers in app-core.js):
- `getAccountColor()` (~line 200)
- `detectAccountId()` (~line 166)
- `detectRegion()` (~line 180)
- `_detectRegionFromCtx()` (~line 193)
- `_awsConsoleUrl()` (~line 725)
- `_showToast()` (~line 10914)
- `_rptCollectStyles()` (~line 1535)
- `_dataFingerprint()` (~line 291)

```js
import { S } from './state.js';

export function getAccountColor(accountId) { /* ... */ }
export function detectAccountId(obj) { /* ... */ }
// etc.
```

**Step 2: In index.js, expose on window for app-core.js transition**

```js
import * as uiUtils from './utils-ui.js';
Object.assign(window, uiUtils); // or window.__coreUtils = uiUtils;
```

**Step 3: In app-core.js, remove the extracted functions and use window references**

**Step 4: Build, test, verify in browser**

**Step 5: Commit**

```bash
git add src/core/utils-ui.js src/core/index.js src/app-core.js
git commit -m "refactor(core): extract cross-cutting UI helpers to utils-ui.js"
```

---

## Task 3: Extract renderers.js — Hub-Spoke + Grid Labels

**Files:**
- Create: `src/core/renderers.js`
- Modify: `src/app-core.js` (remove renderer functions)
- Modify: `src/core/index.js`

**Step 1: Extract renderLandingZoneMap() (lines 7075-7661, ~587 lines)**

Move the entire function to `renderers.js`. It needs:
- `S` (state) for `gwNames`, render flags
- `window.AppModules` for topology-renderer
- d3 for SVG manipulation

```js
import { S } from './state.js';

export function renderLandingZoneMap(ctx, container, options) {
  // ... moved code
}
```

**Step 2: Extract grid/executive label placement (lines 10050-10200, ~150 lines)**

These are helper functions called during grid layout rendering. Move to `renderers.js`.

**Step 3: Extract dispatchLayout() — the layout switching logic**

Create a thin function that decides hub-spoke vs grid and calls the appropriate renderer.

**Step 4: Update app-core.js to call renderers.js functions via window**

In `index.js`:
```js
import { renderLandingZoneMap, dispatchLayout } from './renderers.js';
window.renderLandingZoneMap = renderLandingZoneMap;
```

In `app-core.js`, replace the inline function with `window.renderLandingZoneMap(...)`.

**Step 5: Build, test, verify all 4 rendering paths**

CRITICAL: Test these layouts:
- Grid layout (default)
- Hub-spoke / Landing Zone
- Executive layout
- Columns layout

Run: `node build.js && npm run test:unit`
E2E: `npx playwright test` (if browsers installed)
Manual: Open demo, switch layouts, verify labels render correctly.

**Step 6: Commit**

```bash
git add src/core/renderers.js src/core/index.js src/app-core.js
git commit -m "refactor(core): extract renderers (hub-spoke, grid labels) to renderers.js"
```

---

## Task 4: Extract event-wiring.js — Centralized Event Registration

**Files:**
- Create: `src/core/event-wiring.js`
- Modify: `src/app-core.js`
- Modify: `src/core/index.js`

**Step 1: Identify all addEventListener calls in app-core.js**

Search for `addEventListener`, `.on(`, `.click(` patterns. Group by:
- Global/toolbar events (sidebar toggle, text scale, layout selectors)
- Keyboard shortcuts
- Drag/zoom handlers
- Section-specific handlers (dashboard filters, export buttons)

**Step 2: Create event-wiring.js with initEventWiring() function**

```js
import { S } from './state.js';

export function initEventWiring() {
  // Sidebar toggle
  document.getElementById('sidebarToggle')?.addEventListener('click', ...);
  // Text scale
  document.getElementById('gTxtUp')?.addEventListener('click', ...);
  // ... etc
}
```

**Step 3: Move global event handlers from app-core.js to event-wiring.js**

Start with the simplest handlers (sidebar toggle, text scale, section collapse). Leave dashboard-specific handlers for Phase 2.

**Step 4: Call initEventWiring() from index.js after DOMContentLoaded**

**Step 5: Build, test, verify all click handlers work**

Manual test: sidebar toggle, text scale, section collapse, keyboard shortcuts.

**Step 6: Commit**

```bash
git add src/core/event-wiring.js src/core/index.js src/app-core.js
git commit -m "refactor(core): centralize global event wiring in event-wiring.js"
```

---

## Task 5: Extract dashboards.js — All Dashboard Renderers

**Files:**
- Create: `src/core/dashboards.js`
- Modify: `src/app-core.js`
- Modify: `src/core/state.js` (add dashboard state vars)
- Modify: `src/core/index.js`

**Step 1: Move dashboard state to state.js**

Add to `S`: `compDashState`, `budrDashState`, `invState`, `govDashState`, `iamDashState`, `inventoryData`, etc.

**Step 2: Extract _renderCompDash() (lines 2393-2540, ~147 lines)**

**Step 3: Extract _renderPostureDash() (lines 18968-19215, ~247 lines)**

**Step 4: Extract _renderBUDRDash() (lines 19216-19450, ~234 lines)**

**Step 5: Extract _renderInventoryTab/Body/Tree (lines 4546-5070, ~500 lines)**

All go into `dashboards.js`:
```js
import { S } from './state.js';
import { getAccountColor, _showToast } from './utils-ui.js';

export function renderCompDash(bodyOnly) { /* ... */ }
export function renderPostureDash() { /* ... */ }
export function renderBUDRDash() { /* ... */ }
export function renderInventoryTab() { /* ... */ }
```

**Step 6: Move dashboard event handlers to dashboards.js**

Each dashboard has inline filter/sort/click handlers. Move them into the dashboard functions or into a `initDashboardEvents()` function.

**Step 7: Expose on window, update app-core.js references**

**Step 8: Build, test all dashboards**

Manual test: Open Compliance tab, BUDR tab, Inventory tab, Governance tab. Verify filters, sorts, pagination, mute buttons all work.

**Step 9: Commit**

```bash
git add src/core/dashboards.js src/core/state.js src/core/index.js src/app-core.js
git commit -m "refactor(core): extract dashboard renderers to dashboards.js"
```

---

## Task 6: Extract exports-visio.js — Visio VSDX Export

**Files:**
- Create: `src/core/exports-visio.js`
- Modify: `src/app-core.js`
- Modify: `src/core/index.js`

**Step 1: Extract Visio export (lines 23633-26268, ~2,635 lines)**

This is the single largest self-contained block. Move everything between the `expVsdx` click handler and the Lucid export. Includes:
- `xmlEsc()`, `uid()`, `addRect()`, `addPolyEdge()`, `addConnector()`
- `buildVsdxTemplate()`
- All OOXML XML serialization

```js
export function exportVsdx(ctx) { /* ... all 2,635 lines */ }
```

**Step 2: Wire up from index.js**

```js
import { exportVsdx } from './exports-visio.js';
window.exportVsdx = exportVsdx;
```

**Step 3: Update app-core.js expVsdx handler to call window.exportVsdx()**

**Step 4: Build, test Visio export**

Load demo, click Export > Visio, verify .vsdx file downloads and opens.

**Step 5: Commit**

```bash
git add src/core/exports-visio.js src/core/index.js src/app-core.js
git commit -m "refactor(core): extract Visio VSDX export to exports-visio.js (~2,650 lines)"
```

---

## Task 7: Extract exports-iac.js — Terraform + CloudFormation

**Files:**
- Create: `src/core/exports-iac.js`
- Modify: `src/app-core.js`
- Modify: `src/core/index.js`

**Step 1: Extract Terraform generator (lines 26377-26991, ~614 lines)**

Includes: `generateTerraform()`, `_sanitizeName()`, `_tfName()`, `_tfRef()`, `detectCircularSGs()`

**Step 2: Extract CloudFormation generator (lines 26993-27570, ~577 lines)**

Includes: `generateCloudFormation()`, `_cfnTags()`, `_cfnRef()`, `_cfnName()`, `generateCheckovCfn()`, `_serializeCfnYaml()`

**Step 3: Wire up from index.js, update app-core.js**

**Step 4: Build, test IaC exports**

Load demo, click Export > Terraform, verify HCL output. Click Export > CloudFormation, verify YAML output.

**Step 5: Commit**

```bash
git add src/core/exports-iac.js src/core/index.js src/app-core.js
git commit -m "refactor(core): extract Terraform + CloudFormation generators to exports-iac.js"
```

---

## Task 8: Extract exports-png.js + exports-lucid.js

**Files:**
- Create: `src/core/exports-png.js`
- Create: `src/core/exports-lucid.js`
- Modify: `src/app-core.js`
- Modify: `src/core/index.js`

**Step 1: Extract PNG export (lines 23588-23630, ~50 lines)**

Tiny module. Depends on `_rptCollectStyles()` from utils-ui.js.

**Step 2: Extract Lucid export wrapper (lines 26269-26277, ~9 lines)**

Wrapper around `buildLucidZip()` which may already be in modules.

**Step 3: Build, test both exports**

**Step 4: Commit**

```bash
git add src/core/exports-png.js src/core/exports-lucid.js src/core/index.js src/app-core.js
git commit -m "refactor(core): extract PNG and Lucid export modules"
```

---

## Task 9: Extract detail-panel.js

**Files:**
- Create: `src/core/detail-panel.js`
- Modify: `src/app-core.js`
- Modify: `src/core/index.js`

**Step 1: Extract the generic detail panel builder (lines 6189-6745, ~556 lines)**

This builds the HTML for VPC, EC2, RDS, Lambda, SG, ALB, NACL, Route details based on resource type.

**Step 2: Extract gateway detail panel (lines 6747+, ~300 lines)**

IGW, TGW, NAT, VGW, PCX, VPCE info panels.

**Step 3: Extract Related Resources flow path builder**

The INGRESS/EGRESS flow path HTML (lines ~6500-6560) that we just improved with the arrow CSS.

**Step 4: Move detail panel state to state.js**

`_detailLevel`, `_lastRlType`, `_navStack`, `_selectedSubnet`

**Step 5: Build, test detail panels**

Click various resources in the demo map. Verify all detail panel sections render: Route Table, NACLs, EC2, ENIs, SGs, Compliance Findings, Related Resources.

**Step 6: Commit**

```bash
git add src/core/detail-panel.js src/core/state.js src/core/index.js src/app-core.js
git commit -m "refactor(core): extract detail panel builder to detail-panel.js"
```

---

## Task 10: Extract _renderMapInner() Sub-Functions + Final Cleanup

**Files:**
- Create: `src/core/parse-inputs.js`
- Modify: `src/app-core.js` (should be <3K lines after this)
- Modify: `src/core/index.js`

**Step 1: Extract parseAllInputs() from _renderMapInner() (lines 8829-8889)**

Reads all 18 textareas, runs `_cachedParse()`, returns parsed data object.

**Step 2: Extract mergeAccountContexts() (lines 8900-9050)**

Multi-account context merging logic.

**Step 3: Extract runPostRenderChecks() (lines ~11900-11960)**

Post-render compliance + BUDR engine invocation.

**Step 4: Slim down _renderMapInner() to ~100-line orchestrator**

```js
function _renderMapInner() {
  const parsed = parseAllInputs();
  const ctx = mergeAccountContexts(parsed);
  dispatchLayout(ctx, currentLayout);
  runPostRenderChecks(ctx);
}
```

**Step 5: Assess remaining app-core.js**

At this point, `src/app-core.js` should be down to ~2-3K lines of:
- Design mode logic
- Flow analysis mode
- Diff mode
- Snapshot/annotation state
- Search/spotlight
- Session storage/auto-save
- Miscellaneous UI that didn't fit elsewhere

These can either stay in a slimmed `app-core.js` (acceptable for Type B project) or be extracted in a future pass.

**Step 6: Final build + full test suite**

Run: `node build.js --production && npm run test:all`
Manual: Full walkthrough — demo load, all layouts, all dashboards, all exports, detail panels, flow mode.

**Step 7: Commit**

```bash
git add src/core/parse-inputs.js src/core/index.js src/app-core.js
git commit -m "refactor(core): decompose _renderMapInner() into focused sub-functions"
```

---

## Phase Summary

| Phase | Tasks | Lines Extracted | What Moves |
|-------|-------|-----------------|------------|
| 1 | 0-4 | ~2,500 | Build setup, state, utils, renderers, events |
| 2 | 5 | ~1,200 | All dashboards |
| 3 | 6-8 | ~3,900 | All exports (Visio, IaC, PNG, Lucid) |
| 4 | 9-10 | ~1,500 | Detail panel, _renderMapInner decomposition |

**Total extracted:** ~9,100 lines → app-core.js shrinks from ~29K to ~20K after Phase 4, with the remaining code being mode-specific logic (design, flow, diff, snapshots) that can be extracted in a future pass.

## Verification After Each Phase

1. `node build.js` — no build errors
2. `npm run test:unit` — 200/200 pass
3. `npx playwright test` — E2E pass (if browsers installed)
4. Manual: Explore Demo loads, switch layouts, open dashboards, export PNG/Visio, click resources for detail panel
