# Codebase Structure

**Analysis Date:** 2026-04-03

## Directory Layout

```
aws_mapper/
├── src/                    # All source code
│   ├── app-core.js         # Monolith orchestrator (19,197 lines) — NOT an ES module
│   ├── main.js             # ES module entry point → dist/app.bundle.js
│   ├── d3-custom.js        # D3 subset entry → libs/d3.custom.min.js
│   ├── modules/            # ES modules (imported by main.js) + plain-script extracts
│   ├── exports/            # Export format ES modules → dist/core.bundle.js
│   ├── dev/                # Dev-only files (not shipped in production)
│   ├── styles/             # CSS
│   └── data/               # Static JSON data
├── dist/                   # Build outputs (committed, loaded by index.html)
│   ├── app.bundle.js       # Bundled ES modules (window.AppModules)
│   ├── core.bundle.js      # Bundled export modules (window._core)
│   ├── app-core.js         # Copied/minified app-core.js
│   └── edge-tests.js       # Dev-only test runner (removed in prod build)
├── libs/                   # Vendored libraries (committed)
│   ├── d3.custom.min.js    # Custom D3 build (5 modules, ~53KB)
│   ├── jszip.min.js        # JSZip for archive exports
│   ├── xlsx.bundle.min.js  # SheetJS for XLSX generation
│   └── fonts/              # Bundled web fonts
├── tests/                  # All tests
│   ├── unit/               # Node test runner unit tests (*.test.mjs)
│   ├── *.spec.js           # Playwright E2E tests
│   ├── helpers.js          # Shared Playwright helpers
│   └── visual.spec.js-snapshots/  # Playwright snapshot baselines
├── scripts/                # Dev utility scripts (not shipped)
│   ├── bump-version.js     # Version bump across all 5 locations
│   ├── export-aws-data.sh  # AWS CLI data export script (Bash)
│   ├── export-aws-data.ps1 # AWS CLI data export script (PowerShell)
│   ├── sanitize_aws_export.py  # Sanitize exported AWS data
│   └── budr_export_xlsx.py # Python BUDR XLSX utility
├── docs/                   # Documentation
│   └── plans/              # Planning documents
├── build/                  # Electron build assets (icons)
├── main.js                 # Electron main process entry
├── preload.js              # Electron contextBridge preload
├── index.html              # App HTML shell (573 lines)
├── build.js                # esbuild configuration and build runner
├── package.json            # Dependencies and electron-builder config
├── playwright.config.js    # Playwright test configuration
├── logo.png                # App logo (MUST stay in root — referenced by index.html + Electron)
└── logo-cropped.png        # Cropped variant (MUST stay in root)
```

## Directory Purposes

**`src/modules/`:**
- Purpose: Feature modules — two types coexist:
  1. **ES modules** (have `export` statements) — imported by `src/main.js`, bundled into `dist/app.bundle.js`
  2. **Plain-script extracts** (no `export`) — maintained as source reference, NOT in build
- Key ES module files:
  - `src/modules/utils.js` — pure utility functions
  - `src/modules/state.js` — shared cross-cutting globals with setter pattern
  - `src/modules/compliance-engine.js` — compliance rule checks (~49KB)
  - `src/modules/topology-renderer.js` — extracted topology renderer (NOT yet wired into build, marked TODO)
  - `src/modules/landing.js` — extracted landing zone renderer (NOT yet wired, 1,710 lines)
  - `src/modules/dashboards.js` — extracted dashboard code (NOT yet wired, 837 lines)
  - `src/modules/firewall-engine.js` — extracted firewall engine (NOT yet wired, 1,492 lines)

**`src/exports/`:**
- Purpose: Pure export format generators, bundled separately into `dist/core.bundle.js`
- All files use ES module syntax
- Entry point: `src/exports/index.js` — assembles `window._core`
- Key files: `exports-iac.js`, `exports-visio.js`, `exports-lucid.js`, `exports-docx.js`, `exports-xlsx.js`, `exports-scripts.js`, `diff-logic.js`

**`src/dev/`:**
- Purpose: Development-only utilities, copied to `dist/edge-tests.js` in dev builds, excluded from prod
- Key files: `src/dev/edge-tests.js` (73KB — console test runners and edge case generators)

**`src/styles/`:**
- Purpose: Single CSS file with all styling
- Key file: `src/styles/main.css` (197KB — CSS custom properties for dark/light themes)

**`src/data/`:**
- Purpose: Static JSON data bundled with app
- Key file: `src/data/effort-map.json` — effort classification map for compliance findings

**`dist/`:**
- Purpose: Build outputs — committed to repo, loaded by `index.html` at runtime
- Generated: Yes (by `node build.js`)
- Committed: Yes (Electron builds require it; web deploy requires it)
- NOT included in Electron app bundle: `dist/mac-arm64/`, `dist/win-arm64-unpacked/`

**`libs/`:**
- Purpose: Vendored third-party libraries not available as npm packages (or requiring custom builds)
- Generated: `d3.custom.min.js` is built by `node build.js`; others are manually vendored
- Committed: Yes (required at runtime, no CDN)

**`tests/unit/`:**
- Purpose: Node test runner unit tests for pure-logic modules
- Files: `*.test.mjs` (12 files covering engines and utilities)
- Run with: `npm run test:unit`

**`tests/*.spec.js`:**
- Purpose: Playwright E2E tests against the Electron app
- Files: `smoke.spec.js`, `dashboard.spec.js`, `detail-panel.spec.js`, `export.spec.js`, `flow-mode.spec.js`, `edge-cases.spec.js`, `visual.spec.js`

## Key File Locations

**Entry Points:**
- `main.js` — Electron main process
- `preload.js` — Electron renderer bridge (`window.electronAPI`)
- `index.html` — HTML shell, loads all scripts in correct order
- `src/main.js` — ES module bundle entry (→ `dist/app.bundle.js`)
- `src/exports/index.js` — Core bundle entry (→ `dist/core.bundle.js`)
- `src/app-core.js` — Monolith orchestrator (plain script, copied to `dist/app-core.js`)

**Configuration:**
- `package.json` — Version source of truth, electron-builder config, npm scripts
- `build.js` — esbuild config and build orchestration
- `playwright.config.js` — E2E test configuration
- `src/modules/constants.js` — App-wide constants (localStorage keys, compliance metadata)
- `src/modules/prefs.js` — User preference keys and defaults

**Core Logic:**
- `src/app-core.js:4072` — `renderLandingZoneMap()` — Landing Zone hub-spoke renderer
- `src/app-core.js:5433` — `renderExecutiveOverview()` — Executive layout renderer
- `src/app-core.js:5767` — `renderMap(cb)` — render entry point with debounce
- `src/app-core.js:5780` — `_renderMapInner()` — main grid renderer and layout dispatcher
- `src/app-core.js:18214` — `matchFile(fname, content)` — filename-to-textarea-ID mapping
- `src/modules/compliance-engine.js` — `runComplianceChecks(ctx)` — all compliance rules
- `src/modules/network-rules.js` — `evaluateRouteTable()`, `evaluateNACL()`, `evaluateSG()`
- `src/exports/diff-logic.js` — `computeDiff()` — pure diff logic

**Topology:**
- `src/app-core.js` `#region TOPOLOGY RENDERER` (lines 4070–7859) — active rendering code
- `src/modules/topology-renderer.js` — parallel extracted version (NOT in active build)

**Export Handlers:**
- `src/app-core.js:18467` — PNG export (`expPng` button listener)
- `src/exports/exports-visio.js` — Visio VSDX generation
- `src/exports/exports-lucid.js` — Lucid CSV/ZIP generation
- `src/exports/exports-iac.js` — Terraform and CloudFormation generation

**Testing:**
- `tests/unit/` — Pure logic unit tests
- `tests/helpers.js` — Shared Playwright launch helpers
- `tests/visual.spec.js-snapshots/` — Visual regression baselines

## Naming Conventions

**Source files:**
- Kebab-case: `compliance-engine.js`, `iac-generator.js`, `topology-renderer.js`
- ES modules in `src/modules/` and `src/exports/`
- Plain scripts have no `export` statements and are excluded from esbuild entry

**Test files:**
- Unit: `{module-name}.test.mjs` co-located in `tests/unit/`
- E2E: `{feature}.spec.js` in `tests/`

**Functions in app-core.js:**
- Private: `_camelCase` prefix (e.g., `_renderMapInner`, `_buildInventoryData`)
- Public/event-wired: `camelCase` (e.g., `renderMap`, `saveProject`, `openIacModal`)
- Region prefix pattern: `_render*` for DOM render functions, `_build*` for data assembly

**CSS:**
- BEM-inspired: `.sidebar-header`, `.sidebar-hdr-actions`, `.dp-body`
- Theme: CSS custom properties `--bg-primary`, `--text-primary`, `--accent-green` etc.

## Where to Add New Code

**New pure-logic feature (engine/utility):**
- Implement as ES module in `src/modules/{feature}.js` with named exports
- Import in `src/main.js` and add to `window.AppModules` object
- Write unit test in `tests/unit/{feature}.test.mjs`
- Consume in `app-core.js` via the global name (automatically available after `Object.assign`)

**New export format:**
- Implement in `src/exports/exports-{format}.js`
- Import in `src/exports/index.js` and expose on `window._core`
- Consume in `app-core.js` via `window._core.{functionName}()`

**New rendering layout:**
- Add to `app-core.js` `#region TOPOLOGY RENDERER` block
- Add `layoutMode` option to `<select id="layoutMode">` in `index.html`
- Add dispatch case in `_renderMapInner()` after line 6041

**New dashboard tab:**
- Add to `_UDASH_TABS` array in `src/app-core.js` `#region UNIFIED DASHBOARD` (line ~15419)
- Implement `render:function(){}` pointing to a new `_render{Tab}Tab()` function

**New compliance rule:**
- Add to `src/modules/compliance-engine.js` — `runComplianceChecks(ctx)` function
- Write test case in `tests/unit/compliance-engine.test.mjs`

**New IPC channel (Electron feature):**
- Add `ipcMain.handle('channel:name', ...)` in `main.js`
- Expose via `contextBridge.exposeInMainWorld('electronAPI', { ... })` in `preload.js`
- Consume in `app-core.js` via `window.electronAPI.{methodName}()`

**New test:**
- Unit (pure logic): `tests/unit/{module}.test.mjs` using Node built-in test runner
- E2E (UI flow): `tests/{feature}.spec.js` using Playwright

## Special Directories

**`dist/`:**
- Purpose: Runtime build artifacts
- Generated: Yes (by `node build.js`)
- Committed: Yes — required for Electron packaging and web deploy

**`dist/mac-arm64/` and `dist/win-arm64-unpacked/`:**
- Purpose: Electron packaged application outputs
- Generated: Yes (by `npm run build:mac` / `npm run build:win`)
- Committed: No (in `.gitignore`, binary artifacts)

**`libs/`:**
- Purpose: Vendored JS libraries loaded directly by `index.html`
- `d3.custom.min.js` is rebuilt by `node build.js`
- `jszip.min.js`, `xlsx.bundle.min.js` are manually vendored — do NOT replace without testing export formats

**`.planning/`:**
- Purpose: GSD planning documents (codebase maps, phase plans)
- Generated: Yes (by GSD commands)
- Committed: Yes

**`delete-me/`:**
- Purpose: Scratch workspace for refactoring experiments
- Committed: Yes (but name indicates pending cleanup)

**`src/data/`:**
- Purpose: Static JSON data shipped with app
- Committed: Yes
- Included in Electron `files` array in `package.json`

## Build Outputs Included in Electron Package

Per `package.json` `files` array — only these are bundled into the distributable:
```
index.html
main.js
preload.js
scripts/**
libs/**
dist/app.bundle.js
dist/core.bundle.js
dist/app-core.js
src/styles/**
src/data/**
logo.png
```

Note: `dist/edge-tests.js` is intentionally excluded (removed by production build).
Note: `src/modules/` and `src/exports/` source files are NOT included (only their compiled outputs).

---

*Structure analysis: 2026-04-03*
