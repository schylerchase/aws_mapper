# Testing Patterns

**Analysis Date:** 2026-04-29

## Test Frameworks

**Unit:**
- Runner: Node.js built-in `node:test`.
- Assertions: `node:assert/strict`.
- Command: `npm run test:unit`.
- Pattern: `node --test tests/unit/*.test.mjs`.

**E2E:**
- Runner: Playwright `^1.58.2`.
- Command: `npm run test` or `npx playwright test`.
- Config: `playwright.config.js`.
- Browser: Chromium.
- Default viewport: 1400 x 900.
- Timeout: 30 seconds per test.
- Retries: 1 in CI, 0 locally.

**Combined:**
- Command: `npm run test:all`.
- Runs unit tests first, then Playwright.

## Test Layout

```text
tests/
├── helpers.js
├── dashboard.spec.js
├── detail-panel.spec.js
├── edge-cases.spec.js
├── export.spec.js
├── flow-mode.spec.js
├── smoke.spec.js
├── visual.spec.js
├── visual.spec.js-snapshots/
└── unit/
    ├── budr-engine.test.mjs
    ├── cidr-engine.test.mjs
    ├── compliance-engine.test.mjs
    ├── diff-engine.test.mjs
    ├── export-utils.test.mjs
    ├── flow-analysis.test.mjs
    ├── governance-checks.test.mjs
    ├── iac-generator.test.mjs
    ├── iam-engine.test.mjs
    ├── multi-account.test.mjs
    ├── network-rules.test.mjs
    └── utils.test.mjs
```

## Unit Test Style

- Tests import named exports directly for pure modules.
- Tests use `describe()` and `it()` from `node:test`.
- Test data is mostly inline object literals and local factory functions.
- No Jest, Vitest, sinon, or mock library is used.
- Modules with browser/global dependencies are set up by assigning `globalThis.window`, `globalThis.document`, or stub functions before import.
- Dynamic `await import()` is used when global stubs must exist before module evaluation.

## Unit Coverage Areas

Current unit coverage includes:
- Utility parsing and escaping: `tests/unit/utils.test.mjs`.
- CIDR math: `tests/unit/cidr-engine.test.mjs`.
- Network route/NACL/SG evaluation: `tests/unit/network-rules.test.mjs`.
- Compliance and governance rules: `tests/unit/compliance-engine.test.mjs`, `tests/unit/governance-checks.test.mjs`.
- IAM and BUDR engines: `tests/unit/iam-engine.test.mjs`, `tests/unit/budr-engine.test.mjs`.
- Diff logic: `tests/unit/diff-engine.test.mjs`.
- Flow analysis: `tests/unit/flow-analysis.test.mjs`.
- Multi-account context helpers: `tests/unit/multi-account.test.mjs`.
- IaC and export helpers: `tests/unit/iac-generator.test.mjs`, `tests/unit/export-utils.test.mjs`.

## Playwright Style

- Specs are CommonJS files under `tests/*.spec.js`.
- `tests/helpers.js` exports `BASE`, `loadDemo`, `countElements`, `openDashTab`, `clickSubnet`, and `captureErrors`.
- `loadDemo(page)` sets onboarding localStorage before navigation, opens the static server URL, clicks `#loadDemo`, waits for `#landingDash` to hide, and waits for `.vpc-group`.
- SVG interactions use `page.evaluate()` to dispatch DOM events because Playwright cannot reliably click SVG groups directly.
- Console error capture filters expected static asset 404 noise.

## E2E Coverage Areas

Current E2E specs include:
- `smoke.spec.js` - App load, demo render, basic SVG presence.
- `dashboard.spec.js` - Unified dashboard tab behavior.
- `detail-panel.spec.js` - Subnet click and detail panel behavior.
- `export.spec.js` - Export-oriented flows.
- `flow-mode.spec.js` - Flow analysis/tracing UI.
- `edge-cases.spec.js` - Empty/malformed input and layout edge cases.
- `visual.spec.js` - Screenshot baselines, ignored in CI by config.

## CI Testing

`.github/workflows/ci.yml` runs:
1. `npm ci`
2. `npm run test:unit`
3. `node build.js`
4. `npx playwright install --with-deps chromium`
5. `npx playwright test`
6. Uploads `test-results/` artifacts on completion/cancel.

## Local Commands

```bash
npm run test:unit
npm run test
npm run test:headed
npm run test:all
node build.js
```

Playwright automatically starts:

```bash
npx serve . -l 8377 --no-clipboard
```

## Mocking Patterns

**Pure module import:**
- Used for CIDR, network rules, diff logic, utilities, and many export helpers.

**Pre-import globals:**
- Used when modules read `window`, `document`, or app globals.
- Assign `globalThis.window = globalThis` or a narrow object, then dynamically import the module.

**DOM stubs:**
- Minimal `document.getElementById`, `querySelector`, and `querySelectorAll` stubs appear in unit tests for DOM-adjacent modules.

**No network mocking:**
- Tests use demo/local data and static server runtime. There is no hosted API to mock.

## Known Coverage Gaps

- PNG export path in `src/app-core.js` has no dedicated automated coverage.
- Multi-account/multi-region rendering has helper unit tests but limited end-to-end coverage for merged SVG output.
- Active topology rendering remains mostly covered by smoke/visual tests, not unit tests.
- Report builder paths have some export-flow coverage but many DOM assembly branches remain hard to isolate.
- Electron IPC and AWS CLI scan flows are not fully exercised by the Playwright browser tests.

## Test Hygiene Notes

- Visual tests are ignored in CI via `playwright.config.js`.
- `test-results/` is ignored by git.
- Running build before E2E matters when source modules changed because runtime loads `dist/*`.
- When changing source and tests together, verify both unit tests and the relevant Playwright spec, then run `node build.js` if runtime bundles are expected to change.

---
*Testing analysis: 2026-04-29*
*Update when test framework, helper behavior, or coverage areas change.*
