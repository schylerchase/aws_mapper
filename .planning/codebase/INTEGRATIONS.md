# External Integrations

**Analysis Date:** 2026-04-03

## AWS CLI Integration

**Primary external integration — no SDK, CLI subprocess only.**

- Invocation: `main.js` spawns `/usr/bin/env bash scripts/export-aws-data.sh` via `child_process.spawn`
- Auth: Relies on the user's pre-configured AWS CLI credentials (`~/.aws/credentials`, environment variables, or IAM role). No credentials are stored or managed by the app.
- Profile selection: passed as `-p <profile>` flag to the shell script
- Region selection: passed as `-r <region>` flag; `-a` flag sweeps all enabled regions
- Windows equivalent: `scripts/export-aws-data.ps1` (PowerShell 7+, parallel API calls via `ForEach-Object -Parallel`)

**AWS services queried by the export scripts:**

| Category | AWS CLI commands | Output file |
|---|---|---|
| Network | `ec2 describe-vpcs`, `describe-subnets`, `describe-route-tables`, `describe-security-groups`, `describe-network-acls`, `describe-network-interfaces` | `vpcs.json`, `subnets.json`, `route-tables.json`, `security-groups.json`, `network-acls.json`, `network-interfaces.json` |
| Gateways | `ec2 describe-internet-gateways`, `describe-nat-gateways`, `describe-vpc-endpoints` | `internet-gateways.json`, `nat-gateways.json`, `vpc-endpoints.json` |
| Compute | `ec2 describe-instances`, `rds describe-db-instances`, `lambda list-functions`, `elasticache describe-cache-clusters`, `redshift describe-clusters` | `ec2-instances.json`, `rds-instances.json`, `lambda-functions.json`, `elasticache-clusters.json`, `redshift-clusters.json` |
| Load Balancing | `elbv2 describe-load-balancers`, `describe-target-groups` | `load-balancers.json`, `target-groups.json` |
| Connectivity | `ec2 describe-vpc-peering-connections`, `describe-vpn-connections`, `describe-transit-gateway-attachments` | `vpc-peering.json`, `vpn-connections.json`, `tgw-attachments.json` |
| Storage | `ec2 describe-volumes`, `describe-snapshots`, `s3api list-buckets` | `volumes.json`, `snapshots.json`, `s3-buckets.json` |
| DNS | `route53 list-hosted-zones`, `list-resource-record-sets` | `hosted-zones.json`, `r53-records.json` |
| Security | `wafv2 list-web-acls`, `cloudfront list-distributions` | `waf-web-acls.json`, `cloudfront.json` |
| IAM | `iam get-account-authorization-details` | `iam.json` |
| Containers | `ecs list-clusters`, `list-services`, `describe-services` | `ecs-services.json` |

**Scan IPC flow:**
1. Renderer calls `window.electronAPI.scanAWS({ profile, region })` → `preload.js` → `ipcRenderer.invoke('aws:scan')`
2. `main.js` validates inputs, spawns the shell script, streams `stdout`/`stderr` back to renderer via `aws:scan:progress` events
3. On exit code 0, main process reads output JSON files and sends them as `aws:scan:complete`
4. Renderer calls `window.electronAPI.abortScan()` to send `SIGTERM` to active scan process

## File I/O

**Project files (`.awsmap`):**
- Format: JSON, saved with UTF-8 encoding
- Save: `ipcMain.handle('file:save')` → `dialog.showSaveDialog` → `fsp.writeFile`
- Open: `ipcMain.handle('file:open')` → `dialog.showOpenDialog` → `fsp.readFile`
- macOS drag-to-dock and double-click open: handled via `app.on('open-file')` event in `main.js`

**AWS export folder import:**
- `ipcMain.handle('file:open-folder')` reads a directory tree up to 3 levels deep
- Supports three folder structures: flat JSON files, region-organized (`us-east-1/`), or profile+region (`prod/us-east-1/`)
- File size limit: 100MB per file (`MAX_FILE_SIZE` constant in `main.js`)
- All reads are parallel using `Promise.all`; parsed as JSON, falls back to raw string on parse error
- Returns `{ _structure: 'flat'|'multi-region'|'multi-profile', ... }`

**Export file output (all formats use native save dialog):**
- `ipcMain.handle('file:export')` — generic handler; accepts `Buffer`, `ArrayBuffer`, or UTF-8 string
- BUDR XLSX: special path through `ipcMain.handle('budr:export-xlsx')` — writes temp JSON to `os.tmpdir()`, invokes `python3 scripts/budr_export_xlsx.py`, reads resulting `.xlsx`, then prompts save dialog

## Auto-Update

**Provider:** GitHub Releases (`electron-updater@^6.7.3`)
- Configured in `main.js` via `autoUpdater` from `electron-updater`
- Repo: `github.com/schylerchase/aws_mapper` (set in `package.json` `"publish"` key)
- `autoDownload: false` — user must confirm download via renderer UI prompt
- `autoInstallOnAppQuit: true` — installs after user quits
- Update check fires automatically 5 seconds after app launch; also available via `Tools → Check for Updates`
- IPC channels: `update:available`, `update:download-progress`, `update:downloaded`, `update:error`, `update:download` (trigger), `update:install` (trigger)

## Export Format Integrations

The app generates files in multiple formats consumed by third-party tools. All generation is client-side (renderer process) using vendored libraries.

**Visio VSDX** (`src/exports/exports-visio.js`):
- Format: OOXML ZIP package (`.vsdx`)
- Library: `libs/jszip.min.js` (vendored)
- Consumed by: Microsoft Visio

**Lucid CSV/ZIP** (`src/exports/exports-lucid.js`):
- Format: Custom ZIP with CSV shape definitions
- Library: `libs/jszip.min.js` (vendored)
- Consumed by: Lucidchart import

**DOCX** (`src/exports/exports-docx.js`):
- Format: OOXML ZIP package (`.docx`)
- Library: `libs/jszip.min.js` (vendored)
- Consumed by: Microsoft Word, Google Docs

**XLSX** (`src/exports/exports-xlsx.js`):
- Format: Excel workbook
- Libraries: `libs/xlsx.bundle.min.js` (SheetJS, vendored, ~415KB, loaded on demand) + `libs/jszip.min.js` for post-processing
- Consumed by: Microsoft Excel, Google Sheets

**Terraform HCL** (`src/exports/exports-iac.js`):
- Format: Plain text `.tf` files
- No external library; string template generation

**CloudFormation YAML/JSON** (`src/exports/exports-iac.js`):
- Format: Plain text YAML or JSON
- No external library; string template generation

**Bash / PowerShell scripts** (`src/exports/exports-scripts.js`):
- Format: Plain text shell scripts
- No external library; string template generation

## CI/CD

**GitHub Actions** (`.github/workflows/`):

`ci.yml` — runs on push/PR to `main`:
1. Node.js 20 setup, `npm ci`
2. Unit tests (`npm run test:unit`)
3. Dev build (`node build.js`)
4. Playwright install (Chromium only)
5. E2E tests (`npx playwright test`) — visual regression skipped in CI
6. Auto-tags a new git version tag when `package.json` version has no matching tag (triggers release)

`release.yml` — runs on version tag push (`v*`) or manual dispatch:
1. Matrix build: macOS (DMG/ZIP), Linux (AppImage/deb), Windows (NSIS/portable)
2. Each runner: `npm ci`, `npm run build:mac|linux|win` (electron-builder)
3. All artifacts uploaded and attached to a GitHub Release via `softprops/action-gh-release@v2`
4. Release notes auto-generated by GitHub

**Secrets required in GitHub repo:**
- `GITHUB_TOKEN` — auto-provided by GitHub Actions; used for tagging, release creation, and electron-builder publish

## Data Storage

**Databases:** None — no database dependency of any kind.

**File Storage:** Local filesystem only. Project state is serialized to `.awsmap` JSON files by the user.

**In-memory state:** All application state lives in the renderer process during a session. `src/exports/state.js` provides a minimal shared `S` object used across the export bundle. `src/modules/state.js` provides a `STATE` object for the modules bundle.

**Caching:** No server-side caching. AWS CLI check result is cached in `main.js` memory with a 60-second TTL (`_awsCliCached`, `AWS_CLI_CACHE_TTL`).

## Fonts

**Vendored locally** (no CDN calls):
- IBM Plex Mono (300, 400, 500, 600 weights) — `libs/fonts/ibm-plex-mono-*.woff2`
- IBM Plex Sans Latin — `libs/fonts/ibm-plex-sans-latin.woff2`

Referenced from `src/styles/main.css` via `@font-face`. The CSP in `index.html` restricts `font-src` to `'self'` — no external font loading is possible.

## No External Network Calls from Renderer

The Content-Security-Policy (`index.html` line 7) sets `connect-src 'self'`, preventing any `fetch`/`XHR` calls to external URLs from the renderer. All external communication (AWS CLI, auto-update) flows through the main process via IPC.

---

*Integration audit: 2026-04-03*
