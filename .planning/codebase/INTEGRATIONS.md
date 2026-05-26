# External Integrations

**Analysis Date:** 2026-04-29

## Runtime Integrations

### AWS CLI

- Purpose: Collect AWS environment JSON for the desktop app.
- Entry points:
  - Renderer calls `window.electronAPI.scanAWS(opts)` from `preload.js`.
  - Main process handles `ipcMain.handle('aws:scan', ...)` in `main.js`.
  - Main process spawns `scripts/export-aws-data.sh` with profile/region flags.
- Validation:
  - `main.js` validates profile and region against `SAFE_INPUT = /^[a-zA-Z0-9_-]{0,64}$/`.
  - `checkAwsCli()` uses `/usr/bin/which aws` before scan work.
- Data returned:
  - Progress, completion, and error events are streamed over IPC.
  - JSON exports are ultimately mapped back into the renderer's resource textareas.

### AWS Export Scripts

- `scripts/export-aws-data.sh` - Bash export script for macOS/Linux.
- `scripts/export-aws-data.ps1` - PowerShell export script for Windows/cross-platform use.
- README documents profile, region, all-region, and multi-profile use.
- These scripts are also included in Electron packaged files via `package.json` `"files": ["scripts/**", ...]`.

### Python BUDR XLSX Utility

- Purpose: Native desktop BUDR XLSX export path.
- Renderer calls `window.electronAPI.exportBUDRXlsx(jsonData)`.
- Main process handles `ipcMain.handle('budr:export-xlsx', ...)`.
- `main.js` writes temporary JSON, runs `python3 scripts/budr_export_xlsx.py`, reads the generated XLSX, and returns bytes.
- Risk: Requires Python 3 on the desktop machine for this path.

### File System and Native Dialogs

- `file:save`, `file:open`, `file:open-folder`, and `file:export` IPC handlers live in `main.js`.
- `preload.js` exposes `saveFile`, `openFile`, `openFolder`, and `exportFile`.
- Browser runtime uses blob downloads instead of native dialogs.
- Electron import supports flat JSON files, region directories, and profile/region directory structures.

### Electron Auto Update

- Dependency: `electron-updater`.
- Main process sets `autoDownload = false` and `autoInstallOnAppQuit = true`.
- Events are bridged through preload:
  - `onUpdateAvailable`
  - `onUpdateDownloadProgress`
  - `onUpdateDownloaded`
  - `onUpdateError`
  - `downloadUpdate`
  - `installUpdate`
- Publisher is configured as GitHub Releases in `package.json`.

## Web And Deployment Integrations

### Static Web Deployment

- `index.html` and committed runtime assets can run as a static site.
- `vercel.json` exists for Vercel deployment.
- `index.html` currently includes Vercel analytics and speed-insights script paths:
  - `/_vercel/insights/script.js`
  - `/_vercel/speed-insights/script.js`
- CSP includes `connect-src 'self'`; verify analytics behavior when changing CSP or deployment paths.

### GitHub Actions

- `.github/workflows/ci.yml`
  - Runs on pushes and PRs to main branches.
  - Uses Node 20.
  - Runs `npm ci`, `npm run test:unit`, `node build.js`, installs Playwright Chromium, and runs `npx playwright test`.
  - Auto-tags package versions on main after tests pass.

- `.github/workflows/release.yml`
  - Runs on `v*` tags and manual dispatch.
  - Builds macOS, Linux, and Windows Electron artifacts.
  - Uploads generated installers and metadata to GitHub Releases.

## Vendored Client Libraries

### D3 Custom Bundle

- Source: `src/d3-custom.js`.
- Output: `libs/d3.custom.min.js`.
- Used by: Active topology rendering in `src/app-core.js`.
- Built by: `build.js`.

### JSZip

- File: `libs/jszip.min.js`.
- Loaded before app bundles in `index.html`.
- Used by: ZIP-like binary export formats and generated Office/document formats.

### SheetJS

- File: `libs/xlsx.bundle.min.js`.
- Loaded on demand by `src/exports/exports-xlsx.js`.
- Used by: Compliance, BUDR, full report, and diff XLSX flows.
- Concern: Full bundle is still vendored; only write functionality is needed.

### Fonts

- Files: `libs/fonts/*.woff2`.
- Used by: CSS in `src/styles/main.css`.
- Runtime dependency: Local only, no external font CDN.

## AWS Resource Data Integrations

The app accepts JSON exports for many AWS APIs. The primary data model is assembled from textarea IDs and file matching logic in `src/app-core.js`.

Core categories include:
- VPCs, subnets, route tables, NACLs, ENIs, security groups.
- Internet gateways, NAT gateways, VPC endpoints, transit gateway attachments, peering, VPN.
- EC2, Lambda, ECS, RDS, ElastiCache, Redshift.
- ALB/NLB, target groups.
- S3, EBS volumes, snapshots.
- Route 53, CloudFront, WAF.
- IAM authorization details.

## Security Boundaries

- Electron renderer has no direct Node access.
- All privileged work goes through the preload API and explicit IPC handlers.
- External navigation is blocked except HTTP(S) URLs opened via `shell.openExternal`.
- AWS scan user input is validated in the main process before spawning shell commands.
- The app has no backend database or server-side persistence.

## Not Present

- No database integration.
- No auth provider integration.
- No payment integration.
- No hosted API dependency for normal runtime.
- No cloud storage backend for saved projects.

---
*Integrations analysis: 2026-04-29*
*Update when IPC, deployment, AWS export scripts, or vendored runtime libraries change.*
