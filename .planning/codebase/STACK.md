# Technology Stack

**Analysis Date:** 2026-04-29

## Languages

**Primary:**
- JavaScript ES2020 - Electron main process, preload bridge, browser runtime, feature modules, export generators, build script, and tests.
- HTML5 - Static app shell in `index.html` (602 lines).
- CSS3 - App-wide visual system in `src/styles/main.css` (2,068 lines).

**Secondary:**
- Python 3 - Utility scripts such as `scripts/budr_export_xlsx.py` and `scripts/sanitize_aws_export.py`.
- Bash - AWS export helper in `scripts/export-aws-data.sh`.
- PowerShell 7+ - Windows/cross-platform AWS export helper in `scripts/export-aws-data.ps1`.

## Runtime

**Environment:**
- Electron `^35.7.5` - Desktop shell using `main.js`, `preload.js`, and `index.html`.
- Chromium renderer - Runs the same static app used by the browser/web deployment.
- Node.js 20 - Used in CI via `actions/setup-node@v4`, and required for build/test tooling.
- Browser static hosting - `index.html` loads committed bundles and vendored libraries directly.

**Package Manager:**
- npm.
- Lockfile: `package-lock.json` is present and committed.

## Frameworks

**Core:**
- Electron `^35.7.5` - Native desktop app, menus, file dialogs, AWS CLI scanning, and auto-update integration.
- Vanilla JavaScript - No frontend framework. UI is direct DOM, SVG, and D3 manipulation.
- D3 custom bundle - Built from `d3-selection`, `d3-zoom`, `d3-shape`, `d3-transition`, and `d3-ease` into `libs/d3.custom.min.js`.

**Testing:**
- Playwright `^1.58.2` - Browser E2E and visual tests in `tests/*.spec.js`.
- Node built-in `node:test` - Unit tests in `tests/unit/*.test.mjs`.
- `node:assert/strict` - Unit assertion style.

**Build/Dev:**
- esbuild `^0.27.3` - Bundles `src/main.js` to `dist/app.bundle.js`, `src/exports/index.js` to `dist/core.bundle.js`, builds the custom D3 bundle, and minifies `src/app-core.js` in production.
- electron-builder `^26.7.0` - Packages macOS, Windows, and Linux desktop builds.
- serve `^14.2.5` - Local static server for Playwright on port 8377.

## Key Dependencies

**Critical:**
- `electron-updater@^6.7.3` - GitHub Releases update flow from the Electron main process.
- `libs/jszip.min.js` - Vendored ZIP creation for binary export formats such as DOCX, XLSX post-processing, Visio VSDX, and Lucid exports.
- `libs/xlsx.bundle.min.js` - Vendored SheetJS bundle used by XLSX exports, loaded on demand by `src/exports/exports-xlsx.js`.
- `libs/d3.custom.min.js` - Runtime SVG rendering library consumed before app bundles load.

**Infrastructure:**
- `build.js` - Custom build orchestrator for app bundle, core bundle, app-core copy/minify, D3 bundle, version injection, README badge update, and production cache-bust hashes.
- `.github/workflows/ci.yml` - Runs npm install, unit tests, build, Playwright install, and E2E tests on Node 20.
- `.github/workflows/release.yml` - Builds Electron artifacts on macOS, Ubuntu, and Windows and publishes GitHub Releases.

## Configuration

**Environment:**
- No `.env` file is required for normal development or browser runtime.
- AWS credentials are read from the OS environment by the AWS CLI when the Electron app launches the export script.
- `GH_TOKEN` or `GITHUB_TOKEN` is required for release publishing and auto-update metadata.
- `NODE_ENV=production` or `node build.js --production` controls minification and cache-busting.

**Build:**
- `package.json` contains scripts and electron-builder config.
- `build.js` is the source of truth for bundle entry points and production transforms.
- `playwright.config.js` starts `npx serve . -l 8377 --no-clipboard` for E2E tests.
- `vercel.json` and `.vercelignore` support static web deployment.

## Platform Requirements

**Development:**
- Node.js 20+ and npm.
- Python 3 for BUDR XLSX generation and AWS export sanitization utilities.
- AWS CLI for live scans from the Electron desktop app.
- Playwright Chromium for E2E tests.

**Production:**
- Browser/static hosting uses committed `index.html`, `dist/*`, `libs/*`, `src/styles/*`, and `src/data/*`.
- Electron packages target macOS DMG/ZIP, Windows NSIS/portable, and Linux AppImage/deb.
- Desktop builds are unsigned in package config (`identity: null` for macOS).
- GitHub Releases is the update channel configured in `package.json`.

## Current Build Outputs

- `dist/app.bundle.js` - 10,964 lines in the current working tree.
- `dist/core.bundle.js` - 6,175 lines.
- `dist/app-core.js` - generated from `src/app-core.js`.
- `libs/d3.custom.min.js` - generated custom D3 runtime.

## Notes

- `dist/` is listed in `.gitignore`, but build outputs are already tracked and used by runtime/package flows.
- `docs/` is listed in `.gitignore`, but tracked docs already exist.
- Current worktree has unrelated uncommitted changes outside this map, including `dist/app.bundle.js` and `src/modules/topology-renderer.js.bak`.

---
*Stack analysis: 2026-04-29*
*Update after dependency, build, packaging, or runtime changes.*
