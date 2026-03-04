# AWS Network Mapper -- Architecture Design

## Project Overview

AWS Network Mapper is an Electron + web application for visualizing, auditing, and designing AWS infrastructure. It processes AWS CLI `describe-*` output to render interactive SVG topology maps with compliance checking, flow analysis, and IaC export.

**Runtime:** Electron (desktop) or static HTML (browser)
**Rendering:** D3.js (custom bundle) for SVG topology
**Build:** esbuild (ES modules -> IIFE bundle)
**Version:** 2.7.x

---

## File Structure

```
aws_mapper/
├── index.html                  571 lines   Main HTML layout
├── main.js                     551 lines   Electron main process
├── preload.js                  113 lines   Electron preload/IPC bridge
├── build.js                     86 lines   esbuild config
├── logo.png                                App logo (referenced in index.html)
│
├── src/
│   ├── app-core.js          28,751 lines   Main monolith (see Region Map below)
│   ├── main.js                             Module entry point (esbuild input)
│   ├── d3-custom.js                        Custom D3 bundle source
│   ├── styles/
│   │   └── main.css          1,827 lines   Dark/light theme CSS
│   └── modules/             33 files, ~25.6K lines total
│       ├── constants.js        107 lines   Shared constants
│       ├── utils.js            164 lines   General utilities
│       ├── dom-helpers.js       99 lines   DOM query helpers
│       ├── dom-builders.js     102 lines   DOM element factories
│       ├── state.js             36 lines   Cross-cutting shared state
│       ├── prefs.js             35 lines   User preferences (localStorage)
│       ├── cidr-engine.js      722 lines   CIDR math + overlap detection
│       ├── compliance-engine.js 444 lines  Compliance rule evaluation
│       ├── compliance-view.js  356 lines   Compliance dashboard view
│       ├── network-rules.js    146 lines   Security group rule analysis
│       ├── firewall-engine.js 1,486 lines  Firewall rule evaluation
│       ├── firewall-editor.js  527 lines   Firewall rule editor UI
│       ├── iam-engine.js       188 lines   IAM policy analysis
│       ├── budr-engine.js      391 lines   Backup/Uptime/DR scoring
│       ├── design-mode.js      673 lines   Design mode (drag-drop infra)
│       ├── flow-tracing.js     632 lines   Packet flow tracing
│       ├── flow-analysis.js    221 lines   Flow log analysis
│       ├── multi-account.js    249 lines   Multi-account context
│       ├── dep-graph.js        190 lines   Resource dependency graph
│       ├── diff-engine.js    2,133 lines   Config diff/drift detection
│       ├── timeline.js         198 lines   Config timeline view
│       ├── demo-data.js        626 lines   Built-in demo dataset
│       ├── governance.js       856 lines   Governance rule dashboard
│       ├── dashboards.js       852 lines   Dashboard tab orchestration
│       ├── unified-dashboard.js 62 lines   Unified dashboard shell
│       ├── report-builder.js 7,283 lines   Report generation engine
│       ├── detail-panel.js     566 lines   Resource detail sidebar
│       ├── search.js           379 lines   Search + filter
│       ├── notes.js            279 lines   User annotations
│       ├── landing.js        1,710 lines   Landing page
│       ├── export-utils.js     477 lines   Export helpers (PNG, CSV)
│       ├── iac-generator.js  1,401 lines   Terraform/CloudFormation gen
│       └── topology-renderer.js 1,993 lines Grid/Executive/Columns renderer
│
├── libs/
│   ├── d3.custom.min.js                    Custom D3 bundle (5 modules)
│   ├── jszip.min.js                        ZIP generation for exports
│   └── xlsx.bundle.min.js                  Excel export support
│
├── dist/
│   ├── app.bundle.js                       esbuild output (modules IIFE)
│   └── app-core.js                         Minified copy of src/app-core.js
│
├── tests/
│   ├── helpers.js               72 lines   Shared Playwright helpers
│   ├── smoke.spec.js            54 lines   App launch + basic render
│   ├── dashboard.spec.js        75 lines   Dashboard tab interactions
│   ├── detail-panel.spec.js     82 lines   Detail panel behavior
│   ├── edge-cases.spec.js      186 lines   Edge case coverage
│   ├── export.spec.js          160 lines   Export flows (PNG, Visio, etc.)
│   ├── flow-mode.spec.js       134 lines   Flow tracing mode
│   ├── visual.spec.js           64 lines   Visual regression
│   └── unit/
│       ├── cidr-engine.test.mjs            CIDR engine unit tests
│       ├── diff-engine.test.mjs            Diff engine unit tests
│       ├── iam-engine.test.mjs             IAM engine unit tests
│       ├── network-rules.test.mjs          Network rules unit tests
│       └── utils.test.mjs                  Utility function unit tests
│
└── .github/workflows/
    ├── ci.yml                              Unit -> Build -> E2E -> Platform builds
    └── release.yml                         Auto-release workflow
```

---

## app-core.js Region Map

The monolith is organized into colocated regions. Major sections:

| Line Range | Region | Description |
|---|---|---|
| 1 -- 322 | Initialization | Globals, sidebar generation, preference loading |
| 323 -- 693 | BUDR Engine | Backup/Uptime/Disaster Recovery scoring |
| 694 -- 2286 | Report Builder | Report builder integration and rendering |
| 2287 -- 3073 | Compliance Dashboard | Compliance dashboard rendering |
| 3074 -- 4040 | Design Mode UI | Drag-drop infrastructure design |
| 4041 -- 8686 | IAM + Flow + Diff | IAM engine, flow tracing, diff mode |
| 8687 -- 8698 | `renderMap()` | Landing Zone hub-spoke renderer entry |
| 8699 -- 10700 | `_renderMapInner()` | Hub-spoke + grid layout core |
| 22458 -- 23203 | Session | Session management, event wiring, keyboard shortcuts |
| 23230 -- 23278 | PNG Export | SVG-to-canvas PNG export |
| 23280 -- 23800 | Visio Export | OOXML XML generation -> JSZip -> .vsdx |
| 25917+ | Lucid Export | Custom JSON -> JSZip -> .lucid |
| 27322+ | IaC Export | Terraform HCL and CloudFormation YAML generation |

---

## Build System

**Toolchain:** esbuild

**Three build targets:**

| Target | Input | Output | Format | Notes |
|---|---|---|---|---|
| Module bundle | `src/main.js` (entry) | `dist/app.bundle.js` | IIFE (`AppBundle`) | Bundles all `src/modules/*.js` |
| Core script | `src/app-core.js` | `dist/app-core.js` | Plain script | Minify-only in prod, copy in dev |
| D3 custom | `src/d3-custom.js` | `libs/d3.custom.min.js` | IIFE (`d3`) | 5 D3 modules vs full 30+ |

**Production build extras:**
- MD5 content hashes injected into `index.html` query strings for cache busting
- `--production` flag enables minification and hash injection

**Commands:**

```
node build.js              # Dev build (sourcemaps, no minify)
node build.js --production # Prod build (minify + cache bust)
node build.js --watch      # Watch mode (modules + core)
```

---

## Initialization Flow

```
index.html loads
  |
  1. Inline <script> runs: reads localStorage theme, sets data-theme attribute (prevents FOUC)
  2. CSS <link> discovered, begins download
  3. Deferred <script> tags download in parallel with DOM parsing
  4. Scripts execute in document order after DOM is ready:
  |
  |   d3.custom.min.js          -> window.d3
  |   jszip.min.js              -> window.JSZip
  |   dist/app.bundle.js        -> window.AppModules  (all ES modules as IIFE)
  |   dist/app-core.js          -> initializes app
  |
  5. app-core.js initialization:
       - Generates sidebar HTML
       - Wires event listeners (buttons, keyboard shortcuts, resize)
       - Restores user preferences from localStorage
       - Awaits user action (Demo / Import / Render Map)
```

**Why two scripts instead of one?**
`app-core.js` is a legacy monolith (28K lines). Modules are being incrementally extracted to `src/modules/` and bundled separately. Both coexist during migration: the bundle exports to `window.AppModules`, and `app-core.js` consumes them.

---

## Rendering Pipeline

Two independent renderers exist:

| Renderer | Location | Layouts | Use Case |
|---|---|---|---|
| `topology-renderer.js` | Module (1,993 lines) | Grid, Executive, Columns | Standard multi-VPC views |
| `_renderMapInner()` | app-core.js (lines 8699--10700) | Landing Zone hub-spoke | Hub-spoke with TGW/peering |

Both follow the same dispatch pattern:

```
User clicks Render
  -> setTimeout(50)
    -> requestAnimationFrame
      -> setTimeout(0)
        -> renderer function
```

The triple-defer ensures the loading spinner paints before the synchronous D3 work blocks the main thread.

**Rendering phases (both renderers):**

1. **Parse** -- Read textarea content or context object; extract VPCs, subnets, instances, gateways
2. **Build lookups** -- Create maps: `subByVpc`, `instBySub`, `igwByVpc`, `natByVpc`, etc.
3. **Layout** -- Compute x/y positions for each VPC and subnet based on selected layout algorithm
4. **D3 SVG generation** -- D3 enter/append pattern: groups -> rects -> text -> icons
5. **Connections** -- Render peering, VPN, Transit Gateway lines between VPCs
6. **Post-render** -- Zoom-to-fit, run compliance checks, update dashboard panels

---

## State Management

No state management library. Minimal global state with module-local ownership.

**Shared state (`state.js`):**

| Variable | Type | Purpose |
|---|---|---|
| `rlCtx` | Object | Rendered layout context -- all parsed AWS data + lookups |
| `mapSvg` / `mapZoom` / `mapG` | D3 selections | SVG canvas and zoom behavior references |
| `gwNames` | Object | Gateway name lookup (populated by topology, read by flow/export) |
| `detailLevel` | Number (0/1/2) | Sidebar detail level (collapsed/normal/expanded) |
| `showNested` | Boolean | Topology nesting toggle |
| `gTxtScale` | Number | Global text scale factor |
| `complianceFindings` | Array | Compliance check results |
| `sb` | Element | Sidebar DOM reference |

ES module bindings are immutable on import, so `state.js` exports setter functions (`setRlCtx`, `setMapSvg`, etc.) for mutation.

**Module-local state:**
Each feature module owns its internal state. Examples: `design-mode.js` tracks placed resources, `flow-tracing.js` tracks active path highlights, `diff-engine.js` tracks snapshot pairs.

**Persistence:**
`prefs.js` wraps `localStorage` for user preferences (theme, detail level, text scale, last-used layout).

---

## Export System

| Format | Method | Dependencies | Output |
|---|---|---|---|
| PNG | Clone SVG -> inject computed CSS -> render to `<canvas>` -> blob | None | `.png` download |
| Visio (.vsdx) | Parse textareas -> build OOXML XML documents -> zip | JSZip | `.vsdx` download |
| Lucid (.lucid) | Parse context -> custom JSON format -> zip | JSZip | `.lucid` download |
| Terraform | Parse context -> open modal -> generate HCL | None | Modal with copy button |
| CloudFormation | Parse context -> open modal -> generate YAML | None | Modal with copy button |
| CSV/Excel | Tabular data from findings/inventory -> file | xlsx.bundle | `.csv` / `.xlsx` download |

PNG export injects all computed CSS into the cloned SVG to ensure correct rendering outside the app DOM.

---

## Dashboard System

Five dashboards rendered in a unified tabbed panel:

| Dashboard | Module | Purpose |
|---|---|---|
| Compliance | `compliance-view.js` + `compliance-engine.js` | CIS/Well-Architected rule violations |
| BUDR | `budr-engine.js` | Backup, Uptime, DR readiness scoring |
| Governance | `governance.js` | Tag policies, naming conventions, resource rules |
| Inventory | `dashboards.js` | Resource counts, type breakdown, per-VPC stats |
| Reports | `report-builder.js` | Customizable PDF/HTML report generation |

**Orchestration:** `dashboards.js` manages tab switching. Tabs are **lazy-rendered** -- DOM is only built on first activation, then cached.

`unified-dashboard.js` provides the outer shell (tab bar + content container).

---

## Testing

**Unit tests:** Node.js built-in test runner (`node --test`)

| Test file | Module under test |
|---|---|
| `cidr-engine.test.mjs` | CIDR overlap, containment, subnet math |
| `diff-engine.test.mjs` | Config snapshot diffing |
| `iam-engine.test.mjs` | IAM policy parsing and evaluation |
| `network-rules.test.mjs` | Security group rule analysis |
| `utils.test.mjs` | General utility functions |

**E2E tests:** Playwright (Chromium)

| Test file | Coverage |
|---|---|
| `smoke.spec.js` | App launch, basic render |
| `dashboard.spec.js` | Dashboard tab interactions |
| `detail-panel.spec.js` | Detail panel behavior |
| `edge-cases.spec.js` | Empty data, malformed input, boundary conditions |
| `export.spec.js` | PNG, Visio, Lucid, IaC export flows |
| `flow-mode.spec.js` | Flow tracing mode activation and path highlighting |
| `visual.spec.js` | Visual regression snapshots |

**CI pipeline** (`.github/workflows/ci.yml`):

```
1. Unit tests        (node --test)
2. Build bundles     (node build.js)
3. Install Playwright + Chromium
4. E2E tests         (npx playwright test)
5. Platform builds   (macOS, Linux, Windows via electron-builder)
```

Platform build artifacts: `.dmg`, `.AppImage`, `.deb`, `.exe`, `.zip`

---

## Module Dependency Flow

```
                    index.html
                    /        \
        app.bundle.js      app-core.js
        (IIFE modules)     (legacy monolith)
              |                   |
              v                   v
       window.AppModules    reads AppModules.*
              |
     ┌────────┼────────────────────────┐
     |        |                        |
  state.js  prefs.js             constants.js
     |        |                        |
     v        v                        v
  ┌──────────────────────────────────────────┐
  |          Feature Modules                  |
  |  topology-renderer  compliance-engine     |
  |  design-mode        flow-tracing          |
  |  diff-engine        iac-generator         |
  |  report-builder     firewall-engine  ...  |
  └──────────────────────────────────────────┘
              |
              v
         DOM + D3 SVG
```

All modules export via `src/main.js` -> esbuild bundles to `window.AppModules`. The monolith (`app-core.js`) reads from `window.AppModules` to call module functions. Over time, code migrates from the monolith into modules.

---

## Electron Integration

| File | Role |
|---|---|
| `main.js` (551 lines) | Electron main process: window creation, menu, IPC handlers, auto-update |
| `preload.js` (113 lines) | Context bridge: exposes safe IPC channels to renderer |

IPC channels handle file open/save dialogs, clipboard access, and app metadata. The renderer process (`index.html`) runs the same code as the browser version, with Electron features detected via `window.electronAPI` availability.

The app runs identically in a browser (no Electron features) or as an Electron desktop app (file dialogs, native menus, auto-update).
