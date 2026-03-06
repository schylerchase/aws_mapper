# AWS Network Mapper

## Project Type: B (Desktop Utility)
Single-developer Electron + web app. Relaxed structure rules apply per global CLAUDE.md.

## Architecture

- **Orchestrator**: `src/app-core.js` (~21.8K lines) -- UI orchestration, renderers, dashboards, event wiring
- **Modules**: `src/modules/` (31 files) -- extracted logic modules bundled via esbuild into `dist/app.bundle.js`
- **Exports**: `src/exports/` (9 files) -- extracted export + diff modules bundled into `dist/core.bundle.js`
- **Dev Utilities**: `src/dev/edge-tests.js` -- console test runners, dev-only (not shipped in prod)
- **Layout**: `index.html` (573 lines) -- static HTML structure (sidebar, SVG canvas, dashboards, modals, toolbar)
- **Styles**: `src/styles/main.css` -- CSS custom properties for dark/light themes
- **Electron**: `main.js` (root) -- BrowserWindow, file I/O, AWS CLI, auto-update
- **Build**: `node build.js` bundles modules + core, minifies app-core.js, copies dev files
- See `docs/design.md` for full architectural breakdown

## Key Patterns

- Modules export via `window.AppModules` (IIFE bundle from esbuild)
- Core exports via `window._core` (IIFE bundle from esbuild)
- `app-core.js` consumes both via window globals, NOT ES imports
- Script load order: d3 -> jszip -> app.bundle.js -> core.bundle.js -> app-core.js -> edge-tests.js (dev)
- D3.js for SVG topology rendering -- two independent renderers:
  - `src/modules/topology-renderer.js` -- Grid/Executive/Columns layouts
  - `src/app-core.js:6737` -- Landing Zone hub-spoke layout
- Four rendering paths for labels/layout: `topology-renderer.js`, `app-core.js` (hub-spoke + grid), `landing.js`
- Compliance/BUDR engines run after render completes
- `let`/`const` in plain `<script>` tags are script-scoped (NOT on window); use `var` for cross-script globals

## Rendering Paths (CRITICAL -- changes must be applied to ALL)

When modifying label positioning, spacing, or layout:
1. `src/modules/topology-renderer.js` -- Grid layout VPC/subnet labels
2. `src/app-core.js` lines ~7010-7230 -- Hub-spoke VPC/subnet labels
3. `src/app-core.js` lines ~9700-9750 -- Grid/Executive VPC/subnet labels
4. `src/modules/landing.js` lines ~380-600 -- Landing page VPC/subnet labels

## Export System

| Export | Entry Point | Mechanism |
|--------|-------------|-----------|
| PNG | `app-core.js:21625` (`expPng`) | SVG clone -> canvas -> blob |
| Visio VSDX | `core/exports-visio.js` via `window._core.exportVsdx` | OOXML via JSZip |
| Lucid | `core/exports-lucid.js` via `window._core.buildLucidZip` | Custom format via JSZip |
| DOCX | `core/exports-docx.js` via `window._core.generateDocx` | OOXML via JSZip |
| XLSX | `core/exports-xlsx.js` via `window._core.generateXlsx` | SheetJS + JSZip post-processing |
| Terraform | `core/exports-iac.js` via `window._core.generateTerraform` | HCL string generation |
| CloudFormation | `core/exports-iac.js` via `window._core.generateCloudFormation` | YAML/JSON generation |
| Bash/PS Scripts | `core/exports-scripts.js` via `window._core` | String template generation |

## Testing

```bash
npm run test:unit    # Node test runner (tests/unit/*.test.mjs)
npm run test         # Playwright E2E (tests/*.spec.js)
npm run test:all     # Both (unit first, then E2E)
```

Unit tests cover: utils, cidr-engine, network-rules, diff-engine, iam-engine, compliance-engine, budr-engine, governance-checks.
E2E tests cover: smoke, dashboards, detail panel, exports, flow mode, edge cases, visual regression.

## Version Bump Checklist

All four locations must be updated together:
1. `package.json` -- `"version": "X.Y.Z"`
2. `package-lock.json` -- `"version": "X.Y.Z"` (lines 3 and 9)
3. `index.html` -- brand row `vX.Y.Z` (line ~46)
4. `index.html` -- footer `vX.Y.Z` (line ~118)

## Build & Deploy

```bash
node build.js              # Dev build (copies edge-tests.js for console debugging)
node build.js --production # Production (minified + cache-bust, no edge-tests)
npm run dev                # Build + launch Electron
```

Build outputs: `dist/app.bundle.js`, `dist/core.bundle.js`, `dist/app-core.js`, `dist/edge-tests.js` (dev only), `libs/d3.custom.min.js`
Cache-bust hashes are auto-injected into index.html `?v=` query params.

## Important Files

- `logo.png` and `logo-cropped.png` MUST stay in repo root (referenced by index.html and Electron builds)
- `package.json` `files` array controls what's included in Electron builds
- `.github/workflows/` -- CI (tests + builds) and sync workflows

## Known Fragile Areas

- Export code (PNG) -- relies on DOM state and stylesheet collection
- Label positioning -- 4 separate rendering paths must stay in sync
- Multi-account merging -- complex context assembly in `_renderMapInner()`
- Stats bar overflow -- 400px right padding to clear export bar (380px wide)
