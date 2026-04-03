# Architecture

**Analysis Date:** 2026-04-03

## Pattern Overview

**Overall:** Monolith-with-extracted-modules (incremental migration in progress)

**Key Characteristics:**
- `src/app-core.js` (19,197 lines) is the central plain-script orchestrator — not an ES module
- Extracted ES modules live in `src/modules/` (bundled into `dist/app.bundle.js`) and `src/exports/` (bundled into `dist/core.bundle.js`)
- Modules communicate back to `app-core.js` exclusively via `window` globals
- Electron main process (`main.js`) and renderer (`app-core.js`) communicate strictly through `contextBridge`/IPC
- `app-core.js` is NOT bundled by esbuild — it is copied or minified as a plain script

## Layers

**Electron Main Process:**
- Purpose: Native OS integration, file I/O, AWS CLI execution, auto-update
- Location: `main.js` (root, 19,399 bytes)
- Contains: BrowserWindow creation, ipcMain handlers, `execFile` calls to AWS CLI
- Depends on: Node.js, `electron-updater`
- Used by: renderer via `window.electronAPI` (exposed through preload)

**Preload Bridge:**
- Purpose: Secure renderer↔main communication boundary
- Location: `preload.js`
- Contains: `contextBridge.exposeInMainWorld('electronAPI', {...})` — exposes file ops, AWS scan, update events
- Depends on: `contextBridge`, `ipcRenderer`
- Used by: `src/app-core.js` via `window.electronAPI.*`

**app.bundle.js (ES Module Bundle):**
- Purpose: Pure logic modules — engines, utilities, state — exposed as window globals
- Entry: `src/main.js`
- Build output: `dist/app.bundle.js` (IIFE, `globalName: 'AppBundle'`)
- Contains: 29 ES modules imported from `src/modules/`
- Exposes: `window.AppModules = {...}` then spreads all exports onto `window` directly via `Object.assign(window, window.AppModules)`
- Does NOT contain: topology renderers, dashboard DOM code, firewall engine

**Core Bundle (Export Modules):**
- Purpose: Export format generators and diff logic — heavy pure functions
- Entry: `src/exports/index.js`
- Build output: `dist/core.bundle.js` (IIFE, no `globalName`)
- Contains: IaC generators, Visio/Lucid/DOCX/XLSX/script exporters, diff logic, shared state
- Exposes: `window._core = { generateTerraform, exportVsdx, buildLucidZip, computeDiff, ... }`

**app-core.js (Monolith Orchestrator):**
- Purpose: UI wiring, DOM rendering, event handling, all remaining non-extracted features
- Location: `src/app-core.js` → `dist/app-core.js` (copy in dev, minified in prod)
- Contains: 333 functions organized in `#region` blocks (see below)
- Depends on: `window.AppModules` (from app.bundle.js), `window._core` (from core.bundle.js), `d3`, `window.electronAPI`
- Script type: plain `<script>` — NOT an ES module — uses `var`/`let`/`const` at global script scope

**Custom D3 Bundle:**
- Purpose: Optimized D3 subset (5 modules vs full 30+)
- Entry: `src/d3-custom.js`
- Build output: `libs/d3.custom.min.js` (IIFE, `globalName: 'd3'`)
- Contains: `d3-selection`, `d3-zoom`, `d3-shape`, `d3-ease`, `d3-transition`

## app-core.js Internal Regions

The monolith is organized into `#region` / `#endregion` blocks:

| Region | Lines | Responsibility |
|--------|-------|----------------|
| INITIALIZATION & GLOBALS | 1–347 | Electron detection, global vars, sidebar |
| BUDR ENGINE | 348–399 | BUDR delegation stubs |
| REPORT BUILDER | 400–402 | Report module registry |
| COMPLIANCE DASHBOARD | 403–1046 | Compliance DOM, filtering, export |
| DESIGN MODE | 1047–1706 | Design form rendering, change log |
| IAM ENGINE | 1707–1710 | IAM delegation |
| GOVERNANCE & INVENTORY | 1711–2640 | Classification, inventory table |
| UI UTILITIES & DETAIL PANELS | 2641–4069 | Detail panel, zoom, click handlers |
| TOPOLOGY RENDERER | 4070–7859 | All 4 layout renderers + renderMap entry |
| PROJECT IO & SEARCH | 7860–9136 | Save/load, matchFile, import folder |
| TIMELINE & ANNOTATIONS | 9137–9526 | Timeline UI |
| MULTI-ACCOUNT | 9527–10244 | Merge mode, context assembly |
| FIREWALL EDITOR | 10245–11832 | Firewall rule CRUD DOM |
| FLOW TRACING | 11833–13154 | Flow trace SVG rendering |
| FLOW ANALYSIS | 13155–14479 | Flow analysis overlays |
| DIFF MODE | 14480–15414 | Diff overlay, diff XLSX export |
| DEPENDENCY GRAPH | 15415–15418 | Dep graph delegation |
| UNIFIED DASHBOARD | 15419–16909 | Dashboard tabs |
| REPORTS & XLSX | 16910–17956 | Report builder, HTML export |
| SESSION & EVENT WIRING | 17957–18461 | Auto-save, input event handlers |
| EXPORT UTILITIES | 18462–18576 | PNG export, download helpers |
| IAC GENERATOR | 18577–19197 | IaC modal, onboarding |

## Script Load Order

```html
libs/d3.custom.min.js      <!-- d3 on window.d3 -->
libs/jszip.min.js          <!-- JSZip on window.JSZip -->
dist/app.bundle.js         <!-- window.AppModules + Object.assign(window, ...) -->
dist/core.bundle.js        <!-- window._core -->
dist/app-core.js           <!-- consumes all of the above -->
dist/edge-tests.js         <!-- dev-only, onerror ignored in prod -->
```

All scripts use `defer` — execution order is guaranteed by DOM order, runs after HTML parse.

## Module System

**ES Modules (src/modules/ — imported by src/main.js):**

These 29 modules use `export`/`import` syntax and are bundled by esbuild into `dist/app.bundle.js`:

| Module | Purpose |
|--------|---------|
| `src/modules/utils.js` | Pure utility functions (`safeParse`, `esc`, `gn`, `sid`, etc.) |
| `src/modules/constants.js` | App-wide constants (`SEV_ORDER`, `MUTE_KEY`, etc.) |
| `src/modules/state.js` | Shared cross-cutting state (`rlCtx`, `mapSvg`, `detailLevel`) with setter functions |
| `src/modules/dom-helpers.js` | DOM utility functions (`showToast`, `toggleClass`, `qs`) |
| `src/modules/dom-builders.js` | Safe element builders (`buildEl`, `buildSelect`) |
| `src/modules/prefs.js` | User preferences (localStorage) |
| `src/modules/cidr-engine.js` | CIDR math — parse, overlap, contains |
| `src/modules/network-rules.js` | Route table, NACL, SG rule evaluation |
| `src/modules/compliance-engine.js` | Compliance check rules engine |
| `src/modules/budr-engine.js` | Backup/uptime/DR assessment engine |
| `src/modules/iam-engine.js` | IAM policy parsing and checks |
| `src/modules/dep-graph.js` | Dependency graph and blast radius |
| `src/modules/demo-data.js` | Demo AWS dataset generator |
| `src/modules/design-mode.js` | Design change validation and CLI generation |
| `src/modules/flow-tracing.js` | Network flow trace engine |
| `src/modules/flow-analysis.js` | Traffic flow discovery |
| `src/modules/firewall-editor.js` | Firewall rule CRUD and validation |
| `src/modules/multi-account.js` | Multi-account context building and merging |
| `src/modules/compliance-view.js` | Compliance scoring, grouping, muting |
| `src/modules/unified-dashboard.js` | Dashboard state and filter logic |
| `src/modules/governance.js` | Resource classification, inventory, IAM permissions |
| `src/modules/export-utils.js` | VSDX layout helpers, XML builders, `downloadBlob` |
| `src/modules/iac-generator.js` | Terraform/CloudFormation/Checkov generators |
| `src/modules/report-html.js` | Report section HTML renderers |
| `src/modules/timeline.js` | Timeline state and pure logic |
| `src/modules/notes.js` | Notes state |
| `src/modules/search.js` | Search logic |
| `src/modules/detail-panel.js` | Detail panel logic |
| `src/modules/dashboards.js` | Dashboard tab logic |

**Not-yet-converted plain scripts in src/modules/ (NOT in build):**
- `src/modules/topology-renderer.js` — parallel extracted version, marked `TODO: convert to ES module`, NOT wired into build
- `src/modules/firewall-engine.js` — same situation

**ES Modules (src/exports/ — entry for core.bundle.js):**

| Module | Exposed via `window._core` |
|--------|---------------------------|
| `src/exports/exports-iac.js` | `generateTerraform`, `generateCloudFormation`, `detectCircularSGs` |
| `src/exports/exports-visio.js` | `exportVsdx` |
| `src/exports/exports-lucid.js` | `buildLucidZip` |
| `src/exports/exports-scripts.js` | `generateBashScript`, `generatePsScript` |
| `src/exports/exports-docx.js` | `generateDocx` |
| `src/exports/exports-xlsx.js` | `generateXlsx`, `exportComplianceXlsx`, `exportFullXlsx` |
| `src/exports/diff-logic.js` | `computeDiff`, `normalizeResource`, `classifyChange` |
| `src/exports/state.js` | Shared state `S` for export modules |

## Data Flow

**AWS Data Import:**
1. User pastes JSON or imports folder via sidebar textareas (`<textarea class="ji" id="in_vpcs">` etc.)
2. `matchFile()` in `app-core.js` (line 18214) heuristically maps filenames/content to textarea IDs
3. User clicks "Render Map" → `renderMap(cb)` called
4. `_renderMapInner()` reads textareas via `_cachedParse(id)`, assembles full resource context
5. Context stored as `_rlCtx` global for downstream use by compliance, exports, dashboards

**Render Dispatch:**
1. `renderMap(cb)` sets loading overlay, debounces 50ms, calls `_renderMapInner()`
2. `_renderMapInner()` reads `layoutMode` select value
3. Dispatches to one of four layout renderers (see Rendering Paths)
4. After render: `_runComplianceWithCache(_rlCtx)` runs compliance checks; BUDR runs on demand

**Export Flow:**
1. User clicks export button in toolbar
2. `app-core.js` invokes `window._core.generateTerraform(ctx)` or similar
3. Export function returns string/blob
4. `downloadBlob()` (from `ExportUtils`) triggers browser download
5. For BUDR XLSX: routes through Electron IPC (`window.electronAPI.exportBUDRXlsx`)

**Multi-Account Merge:**
1. User imports multiple account folders → `enterMultiView()` called
2. `_mergedCtx` assembled by `MultiAccount.buildMergedContext()`
3. `renderMap()` detects `_multiViewMode`, uses `_prebuiltCtx = _mergedCtx`
4. VPCs tagged with `_accountId` and `_accountColor` for visual differentiation

**State Management:**
- Global script-scope variables in `app-core.js`: `_rlCtx`, `_complianceFindings`, `_detailLevel`, `_multiViewMode`
- Shared ES module state in `src/modules/state.js`: `rlCtx`, `mapSvg`, `mapZoom`, `detailLevel`
- Export module state in `src/exports/state.js`: `S` object passed through export functions
- localStorage: user preferences via `src/modules/prefs.js`
- sessionStorage: auto-save via `_SAVE_KEY` constant

## Rendering Paths

**CRITICAL: Four independent rendering paths for labels and layout — changes must be applied to ALL.**

**Path 1: Grid Layout (primary)**
- Location: `src/app-core.js` lines ~6068–7859 (inside `_renderMapInner()`)
- Trigger: `layoutMode === 'grid'` (default)
- Layout: VPCs as columns, subnets stacked vertically per AZ
- Reads: `_detailLevel`, textarea parse cache

**Path 2: Landing Zone Hub-Spoke**
- Location: `src/app-core.js` function `renderLandingZoneMap()` lines 4072–5430
- Trigger: `layoutMode === 'landingzone'`
- Layout: Hub-spoke with shared gateways left, VPC spokes right
- Uses: D3 force-like positioning

**Path 3: Executive Overview**
- Location: `src/app-core.js` function `renderExecutiveOverview()` lines 5433–5766
- Trigger: `layoutMode === 'executive'`
- Layout: High-level summary cards per VPC

**Path 4: topology-renderer.js (not-yet-wired extract)**
- Location: `src/modules/topology-renderer.js` (1,960 lines)
- Status: Extracted parallel implementation, marked `TODO: convert to ES module` — NOT in build
- Intended: Future replacement for Paths 1+2+3 as proper ES module

**D3 Usage:**
- All renderers use `d3.select('#mapSvg')` as root SVG
- `d3-zoom` handles pan/zoom on `#mapSvg`
- `d3-selection` for element creation, `d3-shape` for connection paths
- GPU acceleration enabled via Electron `--enable-gpu-rasterization` flag

## Key Abstractions

**Resource Context (`_rlCtx`):**
- Purpose: The parsed/assembled AWS data passed to all renderers and engines
- Set by: `_renderMapInner()` and saved after render completion
- Shape: `{ vpcs, subnets, sgs, nacls, enis, igws, nats, ... instBySub, albBySub, ... }`
- Consumed by: compliance engine, BUDR engine, detail panel, all dashboards, all exports

**`matchFile(fname, content)`:**
- Purpose: Heuristically maps imported JSON filenames to textarea IDs
- Location: `src/app-core.js` line 18214
- Pattern: Exact filename match → contains match (by length) → content-key fallback

**`_cachedParse(id)`:**
- Purpose: Debounced JSON parse cache keyed by textarea ID + content hash
- Location: `src/app-core.js` around line 5757
- Avoids re-parsing unchanged textareas on re-render

## Entry Points

**Renderer Process Startup:**
- Location: `index.html` (loads all scripts via `defer`)
- `app-core.js` starts executing immediately — no explicit init function
- Electron scan listeners registered at line 8403: `if(_isElectron){...}`

**Electron Main:**
- Location: `main.js` → `createWindow()` → loads `index.html`
- IPC handlers registered at module scope (no init function)

**Render Trigger:**
- `document.getElementById('renderBtn').addEventListener('click', ...)` at line 7855
- Also called programmatically: after folder import, after scan complete, after design changes

## Error Handling

**Strategy:** Localized try/catch with user-visible toasts for user-facing operations; `console.warn` for non-critical failures

**Patterns:**
- `_showToast(msg)` for user-visible errors
- `try { ... } catch(e) { console.warn('context:', e) }` for compliance/BUDR runs (non-fatal)
- Electron IPC calls use `.catch(e => console.error(...))` — no user feedback on file I/O errors
- `matchFile` returns `null` on mismatch — callers skip silently

## Cross-Cutting Concerns

**Theme:** CSS custom properties on `:root`, toggled via `data-theme="light"` on `<html>`
**Text Scale:** `--txt-scale` CSS variable, applied globally via `applyGlobalTxtScale()`
**Detail Level:** `_detailLevel` (0=collapsed, 1=normal, 2=expanded) — all 4 renderers must check
**Compliance Cache:** `_runComplianceWithCache()` fingerprints input data to avoid recomputation
**Parse Cache:** `_cachedParse(id)` with MD5-like quickhash prevents re-parse on re-render

---

*Architecture analysis: 2026-04-03*
