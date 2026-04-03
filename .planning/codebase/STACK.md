# Technology Stack

**Analysis Date:** 2026-04-03

## Languages

**Primary:**
- JavaScript (ES2020) - All application logic, modules, and build scripts
- HTML5 - Static UI structure (`index.html`, 573 lines)
- CSS3 - Theming and layout (`src/styles/main.css`)

**Secondary:**
- Python 3 - Two utility scripts: `scripts/budr_export_xlsx.py` (XLSX generation via `openpyxl`), `scripts/sanitize_aws_export.py` (AWS export cleanup)
- Bash - AWS data export script (`scripts/export-aws-data.sh`)
- PowerShell 7+ - Windows-native AWS data export (`scripts/export-aws-data.ps1`), supports parallel API calls

## Runtime

**Environment:**
- Electron 35.x (`electron@^35.7.5`) — wraps the web app in a native desktop shell
- Chromium renderer process serves `index.html` as a local file (`file://`)
- Node.js 20 (pinned in CI via `actions/setup-node@v4`) — main process and build

**Package Manager:**
- npm
- Lockfile: `package-lock.json` present (221.6KB — committed)

## Frameworks

**Core:**
- Electron `^35.7.5` — desktop window, IPC, native dialogs, file system, OS menus
- No frontend framework (Vanilla JS). UI is hand-rolled with direct DOM manipulation.

**Rendering:**
- D3.js (custom 5-module bundle, ~52KB) — SVG topology rendering
  - Modules used: `d3-selection`, `d3-zoom`, `d3-shape`, `d3-transition`, `d3-ease`
  - Source: `src/d3-custom.js` → built to `libs/d3.custom.min.js`
  - Full module versions are devDependencies; bundled at build time via esbuild

**Testing:**
- Playwright `^1.58.2` — E2E browser tests (Chromium only, headless)
- Node.js built-in `node:test` runner — unit tests (`tests/unit/*.test.mjs`)

**Build/Dev:**
- esbuild `^0.27.3` — bundles ES modules into IIFE; also minifies `app-core.js` in production
- electron-builder `^26.7.0` — packages app for macOS (DMG/ZIP), Windows (NSIS/portable), Linux (AppImage/deb)
- serve `^14.2.5` — local HTTP server for Playwright E2E tests (port 8377)

## Key Dependencies

**Critical:**
- `electron-updater@^6.7.3` — auto-update via GitHub Releases provider; the only runtime `dependency` (everything else is `devDependencies`)
- `jszip.min.js` (vendored, `libs/jszip.min.js`, ~95KB) — powers all binary export formats: DOCX, XLSX post-processing, Visio VSDX, Lucid ZIP
- `xlsx.bundle.min.js` (vendored, `libs/xlsx.bundle.min.js`, ~415KB) — SheetJS; loaded on-demand for XLSX generation

**Infrastructure:**
- `esbuild` — three separate build targets:
  1. `src/main.js` → `dist/app.bundle.js` (ES module graph, IIFE, `window.AppModules`)
  2. `src/exports/index.js` → `dist/core.bundle.js` (export + diff logic, IIFE, `window._core`)
  3. `src/d3-custom.js` → `libs/d3.custom.min.js` (custom D3 subset, IIFE, `window.d3`)

## Configuration

**Environment:**
- No `.env` file required for runtime. App reads AWS credentials from the OS environment at CLI scan time (passed through `process.env` to the spawned Bash process).
- `NODE_ENV` controls dev vs. production build behavior in `build.js`.
- `GH_TOKEN` / `GITHUB_TOKEN` required in CI for auto-tagging and GitHub Releases.

**Build:**
- `build.js` (root) — custom esbuild orchestration script; handles all three bundles, D3 rebuild, version injection into `index.html` and `README.md`, and MD5 cache-bust hash injection into `index.html` query strings (production only).
- `electron-builder` config is inline in `package.json` under the `"build"` key.
- `package.json` `"files"` array controls what is packaged into the Electron distributable.

## Security Model

**Renderer isolation:**
- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` (set in `main.js:createWindow`)
- All Node/OS access is gated through the `contextBridge` API in `preload.js`, exposed as `window.electronAPI`
- Content-Security-Policy in `index.html` restricts to `'self'` only; no external network requests from renderer
- Navigation is locked to `file://` origin; external URLs open in the system browser via `shell.openExternal`

**Input validation:**
- CLI profile and region inputs validated against `/^[a-zA-Z0-9_-]{0,64}$/` before spawning subprocesses (`main.js:SAFE_INPUT`)

## Platform Requirements

**Development:**
- Node.js 20+
- npm
- Python 3 (for BUDR XLSX export and AWS export sanitization scripts)
- AWS CLI (optional, for live scanning)

**Production:**
- macOS: DMG or ZIP (signed identity set to `null` — unsigned)
- Windows: NSIS installer or portable EXE
- Linux: AppImage or deb package
- Distributed via GitHub Releases; auto-update checks GitHub Releases provider on launch

---

*Stack analysis: 2026-04-03*
