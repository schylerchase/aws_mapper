# Architecture

**Analysis Date:** 2026-04-29

## Pattern Overview

**Overall:** Brownfield Electron/static web app with a monolith-plus-extracted-modules migration.

**Key Characteristics:**
- `src/app-core.js` is still the active plain-script orchestrator and is 19,197 lines.
- `src/main.js` imports 25 ES modules from `src/modules/` and exposes them through `window.AppModules`, then flattens exports onto `window`.
- `src/exports/index.js` imports export/diff modules and exposes them through `window._core`.
- `index.html` loads scripts in fixed deferred order: D3, JSZip, `dist/app.bundle.js`, `dist/core.bundle.js`, `dist/app-core.js`, and dev-only edge tests.
- Browser runtime has no backend. Electron adds native file dialogs, AWS CLI scanning, XLSX utility execution, menus, and auto-update.

## Layers

**Electron Main Process:**
- Purpose: Native desktop integration and privileged OS work.
- Location: `main.js`.
- Contains: BrowserWindow setup, menu creation, file open/save/export IPC, folder import, AWS CLI scan orchestration, Python BUDR XLSX execution, update checks, and navigation guards.
- Depends on: Electron, Node built-ins, `electron-updater`, Python 3 for BUDR XLSX, AWS CLI for scanning.
- Used by: Renderer through preload-exposed `window.electronAPI`.

**Preload Bridge:**
- Purpose: Safe API boundary between sandboxed renderer and Electron main process.
- Location: `preload.js`.
- Contains: `contextBridge.exposeInMainWorld('electronAPI', ...)`.
- Depends on: Electron `contextBridge` and `ipcRenderer`.
- Used by: `src/app-core.js`, `src/modules/export-utils.js`, and dashboard/export paths.

**HTML Shell and Runtime Assets:**
- Purpose: Static UI skeleton and deterministic script load order.
- Location: `index.html`.
- Contains: CSP, toolbar/sidebar/panels, `#mapSvg`, hidden layout selector, and script tags.
- Depends on: `libs/d3.custom.min.js`, `libs/jszip.min.js`, `dist/app.bundle.js`, `dist/core.bundle.js`, `dist/app-core.js`.

**Module Bundle:**
- Purpose: Extracted engines, utility modules, state bridges, and report helpers.
- Entry: `src/main.js`.
- Output: `dist/app.bundle.js`.
- Contains: 25 imported ES modules from `src/modules/`.
- Exposes: `window.AppModules` and then `Object.assign(window, window.AppModules)`.
- Not imported: `src/modules/dashboards.js`, `detail-panel.js`, `firewall-engine.js`, `landing.js`, `notes.js`, `search.js`, and `topology-renderer.js`.

**Core Export Bundle:**
- Purpose: Export formats and pure diff logic.
- Entry: `src/exports/index.js`.
- Output: `dist/core.bundle.js`.
- Contains: Terraform/CloudFormation/Checkov, Visio, Lucid, Bash/PowerShell scripts, DOCX, XLSX, and diff logic modules.
- Exposes: `window._core`.

**App-Core Orchestrator:**
- Purpose: Active UI state, event wiring, DOM rendering, topology rendering, dashboards, reports, imports, diffing, and session behavior.
- Location: `src/app-core.js`.
- Build output: `dist/app-core.js`.
- Depends on: D3, `window.AppModules`, `window._core`, `window.electronAPI`, DOM elements in `index.html`, browser storage.
- Status: Still the highest-risk file in the app.

## Data Flow

**Browser Import and Render:**
1. User pastes JSON into sidebar textareas or loads demo data.
2. `src/app-core.js` validates textarea JSON and caches parsed input.
3. `renderMap(cb)` debounces render work and calls `_renderMapInner()`.
4. `_renderMapInner()` parses AWS resource categories, builds lookup maps, and assembles `_rlCtx`.
5. Layout dispatch renders grid, landing zone, or executive topology into `#mapSvg`.
6. Compliance and dashboard state are updated from `_rlCtx`.

**Electron Folder Import:**
1. Renderer calls `window.electronAPI.openFolder()`.
2. `main.js` recursively reads JSON files by region/profile structure.
3. Main process returns parsed flat, region, or profile data.
4. Renderer maps filenames and content back to textarea data and renders.

**Electron AWS Scan:**
1. Renderer calls `window.electronAPI.scanAWS({ profile, region })`.
2. `main.js` validates `profile` and `region` with `SAFE_INPUT`.
3. Main process spawns `scripts/export-aws-data.sh` through `/usr/bin/env bash`.
4. Progress, completion, and error events stream back over IPC.

**Export Flow:**
1. UI handlers in `src/app-core.js` invoke export utilities.
2. Pure export functions are called through `window._core` or `window.AppModules`.
3. Browser downloads use blob links; Electron downloads delegate to `window.electronAPI.exportFile`.
4. BUDR XLSX delegates to `main.js`, which runs `scripts/budr_export_xlsx.py`.

**State Management:**
- Runtime app state is mostly script-scope globals in `src/app-core.js`.
- Extracted modules keep local module state and expose getters/setters or `Object.defineProperty` bridges.
- Browser persistence uses `localStorage` for preferences, muted findings, timeline snapshots, annotations, and onboarding.
- Session autosave uses `sessionStorage` in web context and is disabled in Electron.

## Key Abstractions

**Resource Context (`_rlCtx`):**
- Purpose: Canonical current AWS resource model after parsing.
- Built by: `_renderMapInner()` in `src/app-core.js`; multi-account imports also use `buildRlCtxFromData()` in `src/modules/multi-account.js`.
- Used by: topology renderers, compliance, dashboards, reports, exports, flow tracing, and diffing.

**Window Bridge:**
- Purpose: Transitional compatibility layer between extracted ES modules and plain `app-core.js`.
- Examples: `window.AppModules`, flattened module exports, `window._core`, module `Object.defineProperty` bridges.
- Risk: Load-order and name-collision sensitivity.

**Compliance Finding:**
- Purpose: Normalized object for rule output across CIS, WAF, SOC2, PCI, IAM, BUDR, architecture, and governance checks.
- Owner: `src/modules/compliance-engine.js`, `src/modules/compliance-view.js`, and report/export consumers.

**Export Core:**
- Purpose: Pure export and diff functions isolated from the UI.
- Owner: `src/exports/*`.
- Access: `window._core`.

**Preload API:**
- Purpose: Explicit renderer capabilities for privileged desktop operations.
- Owner: `preload.js` and matching IPC handlers in `main.js`.

## Entry Points

**Desktop App:**
- Location: `main.js`.
- Trigger: `npm start`, `npm run dev`, packaged Electron app.
- Responsibilities: Create BrowserWindow, load `index.html`, install menu, wire IPC, configure updater, guard navigation.

**Preload API:**
- Location: `preload.js`.
- Trigger: BrowserWindow preload.
- Responsibilities: Expose safe renderer API surface.

**Browser App:**
- Location: `index.html`.
- Trigger: Static page load.
- Responsibilities: Load scripts, provide DOM skeleton, bootstrap app-core behavior.

**Module Bundle:**
- Location: `src/main.js`.
- Trigger: Loaded as `dist/app.bundle.js`.
- Responsibilities: Import modules and expose compatibility globals.

**Core Bundle:**
- Location: `src/exports/index.js`.
- Trigger: Loaded as `dist/core.bundle.js`.
- Responsibilities: Expose export and diff functions on `window._core`.

**Active UI Runtime:**
- Location: `src/app-core.js`.
- Trigger: Loaded as `dist/app-core.js`.
- Responsibilities: Wire controls, parse data, render topology, run dashboards, manage reports, autosave, and handle user workflows.

## Rendering Paths

There are multiple rendering implementations. Changes to shared label placement, resource shape, or layout assumptions must check each path.

- `src/app-core.js:4072` - `renderLandingZoneMap(ctx)`.
- `src/app-core.js:5433` - `renderExecutiveOverview(ctx)`.
- `src/app-core.js:5780` - `_renderMapInner()` grid path.
- `src/modules/topology-renderer.js` - extracted topology renderer, not imported by `src/main.js`.
- `src/modules/landing.js` - extracted landing renderer, not imported by `src/main.js`.

## Error Handling

**Strategy:** Boundary handlers catch and report; internal UI code often logs warnings or shows toasts.

**Patterns:**
- Electron IPC handlers return null or structured results for canceled dialogs.
- File/folder import skips unreadable or oversized JSON files.
- JSON parse helpers return null rather than throwing into the UI.
- Renderer user feedback primarily uses `showToast()` and dashboard panel messages.
- Some module storage operations intentionally catch and warn because storage can be unavailable.

## Cross-Cutting Concerns

**Security:**
- Electron renderer runs with `contextIsolation: true`, `nodeIntegration: false`, and `sandbox: true`.
- Navigation is restricted in `main.js`; HTTP(S) window opens are sent to `shell.openExternal`.
- AWS scan profile and region are constrained by `SAFE_INPUT`.
- CSP in `index.html` uses `default-src 'self'` but still allows `'unsafe-inline'` scripts/styles for the current static app model.

**Performance:**
- Render is debounced and scheduled through requestAnimationFrame/setTimeout.
- D3 is custom-bundled to five modules.
- Compliance and IAM parsing have targeted caches.
- Several large DOM dashboards still rely on chunked rendering or full `innerHTML` rebuilds.

**Validation:**
- External JSON input is parsed with `safeParse` and category extraction helpers.
- Electron AWS scan inputs are validated server-side in `main.js`.
- Most AWS resource validation is structural and opportunistic rather than schema-based.

---
*Architecture analysis: 2026-04-29*
*Update when module ownership, script load order, or app-core boundaries change.*
