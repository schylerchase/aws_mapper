# Coding Conventions

**Analysis Date:** 2026-04-29

## Overall Style

- Plain JavaScript is the project norm. There is no TypeScript, JSX, or frontend framework.
- Runtime code targets ES2020.
- Extracted modules use ES module syntax with named exports.
- `src/app-core.js` is a plain deferred script, not an ES module.
- Existing code is compact and often uses dense one-line expressions, especially in the legacy monolith.

## File Organization

- Root `main.js` is Electron main process code.
- Root `preload.js` is the context bridge.
- `src/main.js` is the bundle entry for extracted renderer modules.
- `src/app-core.js` owns most active UI behavior.
- `src/modules/` contains extracted engines and helpers. Imported modules must be added to `src/main.js`.
- `src/exports/` contains export and diff modules. Consumed exports must be added to `src/exports/index.js`.
- `dist/` files are generated, but tracked and consumed by runtime.

## Naming Patterns

**Files:**
- Kebab-case for source modules and tests: `multi-account.js`, `compliance-engine.js`, `network-rules.test.mjs`.
- `exports-*` prefix for export format modules.

**Functions and Variables:**
- Legacy private helpers commonly use underscore prefixes: `_renderMapInner`, `_cachedParse`, `_saveSnapshots`.
- Extracted modules often use explicit getters/setters for migrated state: `getDesignMode`, `setDesignMode`, `getFwEdits`, `setFwEdits`.
- Boolean-ish state names are not consistently normalized because app-core predates the current code quality preferences.
- AWS object fields preserve AWS response casing, such as `VpcId`, `SubnetId`, `IpPermissions`, and `LoadBalancerArn`.

**DOM IDs:**
- Many IDs are short and legacy: `in_vpcs`, `mapSvg`, `udash`, `compDashBtn`, `accountsBtn`.
- Textarea IDs map directly to AWS export categories and are used by parsing/file matching.

## Module Boundary Pattern

**Current migration pattern:**
1. Extract pure or mostly-pure logic into `src/modules/{feature}.js`.
2. Import it in `src/main.js`.
3. Expose it through `window.AppModules`.
4. Flatten exports to `window` with `Object.assign(window, window.AppModules)`.
5. Keep app-core call sites working until they can be rewired.

**Export module pattern:**
1. Implement pure format logic in `src/exports/exports-{format}.js`.
2. Import in `src/exports/index.js`.
3. Expose on `window._core`.
4. Call from `src/app-core.js`.

**State bridge pattern:**
- Modules that own migrated state expose getters/setters and sometimes `Object.defineProperty(window, ...)` bridges.
- This keeps app-core code compatible while reducing duplicated state over time.

## DOM Patterns

- Active UI rendering is mostly direct DOM construction, `innerHTML`, and event listeners.
- Safer helper modules exist:
  - `src/modules/dom-builders.js`
  - `src/modules/dom-helpers.js`
  - `src/modules/utils.js` `esc()`
- `innerHTML` remains widespread: 239 occurrences across current source, with 150 in `src/app-core.js`.
- Many `innerHTML` paths use `esc()` or internal escaping helpers; every new path should avoid raw AWS data interpolation.
- SVG interactions are D3-driven in app code and often require `page.evaluate()` in tests.

## Error Handling Patterns

- JSON parsing uses `safeParse()` and extraction helpers rather than throwing into UI flows.
- Storage operations usually catch and warn because `localStorage` may be unavailable.
- Electron IPC handlers catch operational failures and return null/structured errors or send progress/error events.
- User-visible errors usually go through `showToast()` or panel-specific empty/error messages.
- Some lower-level paths log to `console.warn` and continue, especially import and optional enrichment flows.

## Data Handling Patterns

- AWS resource arrays are normalized by `ext(raw, ['Key'])` style helpers.
- Resource display names usually come from `gn(resource, fallback)` and AWS `Name` tags.
- Resource context is assembled into `_rlCtx` with arrays and lookup maps such as `subRT`, `subNacl`, `sgByVpc`, `instBySub`, and `wafByAlb`.
- Multi-account/multi-region logic tags resources with account and region metadata before merge/render.
- `structuredClone` is now preferred over JSON clone patterns where browser support is available.

## Build And Generated Files

- Source changes that affect runtime need `node build.js` to refresh `dist/app.bundle.js`, `dist/core.bundle.js`, `dist/app-core.js`, and possibly `libs/d3.custom.min.js`.
- Production build also updates cache-bust hashes in `index.html`.
- `build.js` can update the version badge in `README.md`.
- Treat generated bundle diffs as expected only when source changes require them.

## Testing Conventions

- Unit tests use `node:test` and `node:assert/strict`.
- Tests are ES modules under `tests/unit/*.test.mjs`.
- Browser E2E tests use Playwright CommonJS specs in `tests/*.spec.js`.
- Global/window-dependent modules are tested by setting `globalThis.window` and related stubs before dynamic imports.
- SVG click interactions in Playwright are dispatched with `page.evaluate()` because direct SVG `<g>` clicking is unreliable.

## Comments

- Comments are used to mark extraction status and intentional bridge behavior.
- Examples:
  - `src/modules/topology-renderer.js` notes it still needs ES module conversion.
  - `src/modules/detail-panel.js` notes duplicate timeline logic.
  - `src/exports/index.js` documents the migration role of `window._core`.

## Current Style Risks

- `src/app-core.js` still contains 2,275 `var` occurrences, and total source contains 2,657.
- `window.*` bridge usage appears 209 times across source.
- Not all extracted files are imported by the runtime bundle.
- Some ignored/generated/local files appear in the working tree and can confuse status unless checked before committing.

---
*Conventions analysis: 2026-04-29*
*Update when module migration patterns or test conventions change.*
