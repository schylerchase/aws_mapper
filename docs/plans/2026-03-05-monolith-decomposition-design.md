# app-core.js Monolith Decomposition Design

## Goal
Decompose `src/app-core.js` (~29K lines) into focused ES modules under `src/core/`, improving both performance (lazy-loadable code-split boundaries) and maintainability (navigable, testable files), without breaking Electron or Vercel deployments.

## Constraints
- No new dev dependencies (esbuild only)
- Electron build (`package.json` `files` array, `main.js` loadFile) must work
- Vercel static deploy (index.html with script tags) must work
- Existing `window.AppModules` pattern for 33 modules in `src/modules/` is untouched
- Phased extraction: 4 batches, each committed and tested before the next

## Approach
Phase-extracted ES modules. New `src/core/` directory with ES import/export files bundled by esbuild into `dist/app-core.js` (same output path). The monolith shrinks phase by phase. Existing modules continue using `window.AppModules`.

## Architecture

### Module Map

```
src/core/
  index.js            Entry point — imports all, calls init(), exposes globals
  state.js            Shared mutable state (~50 vars)
  utils-ui.js         Cross-cutting UI helpers (toast, account color, detect region)
  parse-inputs.js     Textarea parsing + cache layer
  renderers.js        Hub-spoke layout, grid/exec labels, dispatchLayout()
  event-wiring.js     Centralized addEventListener registration
  dashboards.js       Posture, Compliance, BUDR, Inventory dashboards
  detail-panel.js     Resource/subnet detail panel builder
  exports-png.js      PNG export (~50 lines)
  exports-visio.js    Visio VSDX export (~2,650 lines)
  exports-iac.js      Terraform + CloudFormation generators (~1,200 lines)
  exports-lucid.js    Lucid export wrapper
```

### Shared State (`state.js`)
Single exported `S` object holding all module-level variables. Modules import `S` and read/write directly. This is an honest representation of the current mutable global state — not a new pattern, just making it explicit.

Key state groups:
- **Render state**: `_rlCtx`, `_mapSvg`, `_mapZoom`, `_mapG`, `_prebuiltCtx`, `_parseCache`
- **Compliance cache**: `_complianceFindings`, `_complianceCachedFindings`, `_budrFindings`
- **Dashboard state**: `_compDashState`, `_budrDashState`, `_invState`, `_govDashState`
- **Mode flags**: `_designMode`, `_flowMode`, `_diffMode`, `_multiViewMode`
- **UI state**: `_detailLevel`, `_showNested`, `_spotlightActive`, `_searchIndex`

### Build System Change
`build.js` gets a second esbuild entry point:
```js
// New: bundle src/core/ → dist/app-core.js
esbuild.build({
  entryPoints: ['src/core/index.js'],
  bundle: true,
  format: 'iife',
  outfile: 'dist/app-core.js',
  minify: production,
  external: ['d3-*']  // d3 loaded separately via libs/d3.custom.min.js
});
```
Same output filename → no index.html or Electron changes.

### Cross-Module Communication
- Extracted `src/core/` modules use ES imports between each other
- They access existing `window.AppModules` for already-extracted modules (compliance-engine, topology-renderer, etc.)
- `index.js` exposes any functions that need to be globally accessible (for onclick handlers in HTML strings)

## Extraction Phases

### Phase 1: Renderers + Event Wiring + Foundation (highest pain)
- `state.js` — extract ~50 shared variables
- `utils-ui.js` — `_showToast`, `getAccountColor`, `detectAccountId`, `detectRegion`, `_awsConsoleUrl`
- `parse-inputs.js` — `_cachedParse()`, textarea fingerprinting
- `renderers.js` — `renderLandingZoneMap()` (lines 7075-7661), grid/exec labels (10050-10200), `dispatchLayout()`
- `event-wiring.js` — centralize all addEventListener calls with explicit registration

### Phase 2: Dashboards
- `dashboards.js` — `_renderCompDash` (2393-2540), `_renderPostureDash` (18968-19215), `_renderBUDRDash` (19216-19450), `_renderInventoryTab`/`Body`/`Tree` (4546-5070)
- Move dashboard state vars to `state.js`

### Phase 3: Exports
- `exports-png.js` — lines 23588-23630 (~50 lines)
- `exports-visio.js` — lines 23633-26268 (~2,650 lines, self-contained)
- `exports-iac.js` — Terraform (26377-26991) + CloudFormation (26993-27437) + YAML serializer (27463-27570)
- `exports-lucid.js` — lines 26269-26277 wrapper

### Phase 4: Detail Panel + Remaining UI
- `detail-panel.js` — generic detail builder (6189-6745), gateway detail (6747+), Related Resources flow
- `sidebar.js` — textarea parsing UI, section collapse, render trigger
- `toolbar.js` — bottom toolbar buttons, stats bar, modal triggers
- `index.js` becomes the sole entry point; old `src/app-core.js` deleted

## _renderMapInner() Decomposition
The 3,178-line orchestrator function is broken into callable sub-functions, NOT moved wholesale:
- `parseAllInputs(textareas)` → returns parsed data object
- `mergeAccountContexts(parsed, accounts)` → returns merged context
- `dispatchLayout(ctx, layout)` → calls hub-spoke or grid renderer
- `runPostRenderChecks(ctx)` → compliance + BUDR engines
The orchestrator itself (~100 lines) calls these in sequence.

## Testing Strategy
- Existing unit tests (200/200) unaffected — they test `src/modules/`
- E2E Playwright tests run after each phase to catch rendering/export regressions
- New unit tests added for extracted modules where logic is independently testable
- Visual regression: E2E screenshots compared before/after each phase

## Rollback
Each phase is a single git commit. If a phase breaks something, `git revert` restores the previous state. No index.html changes during migration means no cascading rollback needed.
