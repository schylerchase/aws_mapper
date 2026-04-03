# Coding Conventions

**Analysis Date:** 2026-04-03

## Style Tiers: Two Distinct Styles Coexist

The codebase has two distinct code styles that reflect an ongoing extraction from a monolithic inline script into proper ES modules:

**Tier 1 — Extracted Modules** (`src/modules/*.js`, `src/exports/*.js`): Well-formatted, readable ES module syntax with JSDoc, `const`/`let`, arrow functions, named exports. This is the target style.

**Tier 2 — Legacy Inline / app-core.js** (`src/app-core.js`, older sections of `src/modules/topology-renderer.js`, `src/modules/compliance-engine.js`): Aggressively minified one-liners, single-char variable names, no whitespace, `var` in places. Written for density, not readability.

When adding new code, match Tier 1 style. Do not emulate the minified patterns.

---

## Naming Patterns

**Files:**
- Modules: `kebab-case.js` — `cidr-engine.js`, `flow-analysis.js`, `dom-helpers.js`
- Test files: `kebab-case.test.mjs` (unit), `kebab-case.spec.js` (E2E)
- Exports subsystem: `exports-{format}.js` — `exports-visio.js`, `exports-docx.js`

**Functions:**
- Public API: `camelCase` — `runComplianceChecks()`, `discoverTrafficFlows()`, `buildRlCtxFromData()`
- Private helpers: `_camelCase` with leading underscore — `_buildSearchIndex()`, `_parseInputs()`, `_buildLookupMaps()`
- State setters: `set{Name}(v)` — `setRlCtx(v)`, `setFlowAnalysisMode(v)`, `setComplianceFindings(v)`
- State getters: `get{Name}()` — `getFlowAnalysisMode()`, `getIamData()`
- Event/DOM handlers: `_on{Event}` or unnamed arrow functions on addEventListener

**Variables:**
- Extracted modules use `const`/`let` exclusively (completed var→const/let refactor)
- `app-core.js` still mixes `var` (for cross-script globals) and `const`/`let`
- Single-char names (`f`, `t`, `s`, `v`) used aggressively in legacy minified sections — avoid in new code
- Boolean state: no `is_`/`has_`/`can_` prefix convention enforced; plain names used (`_designMode`, `_diffMode`, `_svgHeavy`)

**Constants:**
- `SCREAMING_SNAKE_CASE` for module-level constants: `SEV_ORDER`, `FW_LABELS`, `EOL_RUNTIMES`, `MUTE_KEY`
- LocalStorage key constants defined in `src/modules/constants.js`

**CSS Classes:**
- BEM-lite: block + modifier pattern — `.dock-btn`, `.dock-btn.green`, `.dock-btn.active`
- Section prefixes group related components: `.sidebar-*`, `.landing-*`, `.stat-*`, `.dock-*`
- State classes: `.open`, `.collapsed`, `.hidden`, `.active`, `.offscreen`, `.animating`
- Resource-type classes: `.vpc-group`, `.subnet-node`, `.subnet-public`, `.subnet-private`

**DOM IDs:**
- camelCase IDs with descriptive prefixes: `#compDashBtn`, `#udash`, `#udashBody`, `#rptExportHTML`
- Input field IDs: `in_{resource}` prefix — `#in_vpcs`, `#in_subnets`, `#in_ec2`

---

## Code Style

**Formatting (Extracted Modules):**
- No formatter config file (no `.prettierrc`, no `.eslintrc`); formatting is manual
- 2-space indentation in module files
- Single-line arrow functions for simple getters/setters: `export function getFoo() { return foo; }`
- Multi-line for functions with logic
- Semicolons used throughout extracted modules
- Template literals preferred for HTML string construction

**Legacy / Minified Sections:**
- No whitespace between tokens; statements concatenated on single lines
- This style is used in `src/modules/cidr-engine.js` (exported functions), `src/modules/compliance-engine.js` (internal helpers), `src/app-core.js` (most of it)

---

## Import Organization

Only applies to ES module files (`src/modules/*.js`, `src/exports/*.js`, `src/main.js`).

**Order (as seen in `src/main.js`):**
1. Core utilities: `constants.js`, `utils.js`, `dom-helpers.js`, `prefs.js`
2. Feature engines: `demo-data.js`, `cidr-engine.js`, `compliance-engine.js`
3. Network rules
4. Shared state: `state.js`
5. DOM builders: `dom-builders.js`
6. Feature modules grouped by domain

**Path Aliases:**
- None. All imports use relative paths: `import { esc } from './utils.js'`
- `.js` extension required on all imports (bundled by esbuild)

**No barrel files:** Each consumer imports directly from the owning module.

---

## Module Export Pattern

Extracted modules export named exports only. No default exports.

```javascript
// State variables exported alongside setters
export let rlCtx = null;
export function setRlCtx(v) { rlCtx = v; }

// Pure functions
export function runComplianceChecks(ctx) { ... }
export function invalidateComplianceCache() { ... }

// Constants
export const SEV_ORDER = { CRITICAL: 1, HIGH: 2, MEDIUM: 3, LOW: 4 };
```

ES modules cannot reassign imported bindings, so all mutable state follows the `export let` + `export function set{X}(v)` pattern (see `src/modules/state.js` and `src/modules/flow-analysis.js`).

---

## Window Global Bridge Pattern

`app-core.js` is NOT an ES module. It reads `window.AppModules` (set by the bundle) and `window._core` (set by core bundle). The bridge is in `src/main.js`:

```javascript
// src/main.js — after all imports
window.AppModules = { runComplianceChecks, parseIAMData, ... };
Object.assign(window, window.AppModules);  // flatten to bare globals
```

Modules that are partially extracted but still need to call inline `app-core.js` functions bridge via `window`:
```javascript
// src/modules/flow-analysis.js
function _traceInbound(target, config, ctx, opts) {
  return typeof window !== 'undefined' && window._traceInternetToResource
    ? window._traceInternetToResource(target, config, ctx, opts)
    : { blocked: true, path: [] };
}
```

**Rule:** New modules added to `src/modules/` must export cleanly. Do not add new `window.*` assignments. Bridge functions (as above) are acceptable for calling still-inline functions during the ongoing extraction.

---

## Error Handling

**Pattern 1 — Swallow with console.warn (most common in rendering path):**
```javascript
try { _renderNoteBadges() } catch(ne) { console.warn('Note badges error:', ne) }
try { runComplianceChecks(_rlCtx) } catch(ce) { console.warn('Compliance check error:', ce) }
```
Used extensively in `src/app-core.js` and `src/modules/topology-renderer.js` to prevent any single post-render step from crashing the whole render.

**Pattern 2 — Return null/empty on failure (pure functions):**
```javascript
// src/modules/cidr-engine.js
export const parseCIDR = (cidr) => {
  if (!cidr || typeof cidr !== 'string') return null;
  // ... returns null for any invalid input
};
// src/modules/utils.js
export function safeParse(t) {
  if (!t || !t.trim()) return null;
  try { return JSON.parse(t.trim()); } catch (e) { /* extraction fallback */ }
}
```
All pure utility and engine functions guard null/invalid input and return `null`/`[]`/`{}` rather than throwing.

**Pattern 3 — Toast + console.error (user-visible errors):**
```javascript
// src/modules/design-mode.js
} catch (e) {
  showToast('Failed to import plan: ' + e.message, 4000);
  console.error('Plan import failed:', e);
}
```
Used when the failure needs user awareness (export failures, import failures).

**Pattern 4 — Silent fail for optional persistence:**
```javascript
// src/modules/prefs.js
try { localStorage.setItem(PREFS_KEY, JSON.stringify(_prefs)); }
catch (e) { /* Silent fail OK - localStorage might be disabled */ }
```

**Never:** re-throw errors, use `Promise.reject` for user-facing flows, or let unhandled rejections bubble up.

---

## Logging

**No logging framework.** Raw `console.*` calls throughout.

**Patterns:**
- `console.log('[PERF] ...')` — performance timing in render path (always tagged `[PERF]`)
- `console.warn('Descriptive message:', error)` — caught errors that shouldn't crash
- `console.error('Descriptive message:', error)` — unexpected failures that need attention
- No `console.debug` or `console.info` used

Performance logs in `src/app-core.js` follow `[PERF] {phase}: {ms}ms` format:
```javascript
console.log('[PERF] parse phase: ' + (performance.now() - _t0).toFixed(1) + 'ms');
console.log('[PERF] SVG draw: ' + (performance.now() - _t3).toFixed(1) + 'ms');
```

---

## Function Design

**Target (extracted modules):**
- Pure functions take context object `ctx` as first argument and return results — no side effects
- DOM helper functions accept `string | HTMLElement` for element references:
  ```javascript
  export function setVisible(el, visible) {
    const element = typeof el === 'string' ? document.getElementById(el) : el;
    if (!element) return;
    element.style.display = visible ? '' : 'none';
  }
  ```
- Null guard at top of every exported function

**Legacy (app-core.js):**
- Functions freely read/write module-scope variables
- Large functions (hundreds to thousands of lines) are common
- Inline IIFEs used for scoping: `(function(){ ... })()`

---

## CSS Architecture

**File:** `src/styles/main.css` (2068 lines, single file, no preprocessor)

**Custom Properties (CSS Variables) — two themes:**
```css
:root {
  /* dark theme — default */
  --bg-primary: #0a0e17; --bg-secondary: #111827; --bg-tertiary: #1a2236;
  --text-primary: #e2e8f0; --text-secondary: #94a3b8; --text-muted: #64748b;
  --accent-blue: #3b82f6; --accent-green: #10b981; /* etc */
  /* Resource-specific colors */
  --igw-color: #10b981; --nat-color: #f59e0b; --tgw-color: #ec4899;
}
[data-theme="light"] {
  /* Overrides all --bg-*, --text-*, --accent-*, resource colors */
  --bg-primary: #e8ecf1; --text-primary: #111824;
}
```

**Property Naming:**
- Background: `--bg-{role}` — `--bg-primary`, `--bg-card`, `--bg-input`
- Text: `--text-{role}` — `--text-primary`, `--text-secondary`, `--text-muted`
- Accents: `--accent-{color}` — `--accent-blue`, `--accent-green`, `--accent-red`
- Component-specific: `--{component}-color` — `--igw-color`, `--vpc-stroke`, `--subnet-public`
- Transparency helpers: `--overlay-bg`, `--panel-bg`, `--hover-bg`, `--shadow-color`

**Dynamic scaling:**
```css
font-size: calc(10px * var(--txt-scale));  /* global text scale control */
font-size: calc(10px * var(--dp-txt-scale));  /* detail panel text scale */
```

**Modifier classes on dock buttons (semantic color variants):**
`.dock-btn.green`, `.dock-btn.orange`, `.dock-btn.cyan`, `.dock-btn.pink`, `.dock-btn.red`, `.dock-btn.purple`, `.dock-btn.amber`

**Inline styles in JS:** Used liberally in `app-core.js` and `dom-helpers.js` for dynamic/programmatic styling. Toast element built entirely with `element.style.cssText`.

**No CSS modules, no Tailwind, no SCSS.** Single stylesheet loaded via `<link>` in `index.html`.

---

## JSDoc Comments

Used in extracted modules (`src/modules/utils.js`, `src/modules/dom-helpers.js`, `src/modules/export-utils.js`):

```javascript
/**
 * Safe JSON parse with fallback for malformed JSON
 * @param {string} t - Text to parse
 * @returns {Object|Object[]|null} Parsed JSON or null
 */
export function safeParse(t) { ... }
```

Legacy/minified code has no JSDoc. New code added to modules should include JSDoc for exported functions.

---

## TODO/Transitional Comments

Active migration in progress. Key TODO markers indicate code still to extract:

- `src/modules/topology-renderer.js:3`: `// TODO: convert to ES module — export renderMap, _renderMapInner`
- `src/modules/flow-analysis.js:6`: `// TODO: convert to proper ES module imports when app-core.js is modularized`
- `src/modules/flow-analysis.js:3`: `// D3/SVG visualization remains inline until modernized in Phase 5`

When working in files with these markers, do not deepen coupling to `window.*` globals.

---

*Convention analysis: 2026-04-03*
