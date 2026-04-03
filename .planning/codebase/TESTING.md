# Testing Patterns

**Analysis Date:** 2026-04-03

## Test Framework

**Unit Runner:**
- Node.js built-in test runner (`node:test`) — no external unit test library
- Config: none (invoked directly via `node --test`)
- Assertion library: `node:assert/strict` (strict equality throughout)

**E2E Runner:**
- Playwright `^1.58.2`
- Config: `playwright.config.js` (project root)
- Browser: Chromium only, headless by default
- Viewport: 1400x900
- Timeout: 30s per test
- Retries: 1 in CI, 0 locally

**Run Commands:**
```bash
npm run test:unit          # Node test runner — tests/unit/*.test.mjs
npm run test               # Playwright E2E — tests/*.spec.js
npm run test:all           # Unit first, then E2E
npx playwright test --headed   # E2E with visible browser
```

**Web server for E2E:** `npx serve . -l 8377` — reuses existing server if running.

---

## Test File Organization

**Unit tests:**
- Location: `tests/unit/*.test.mjs`
- Format: ES modules (`.mjs`) — required to use top-level `await import()`
- Naming: `{module-name}.test.mjs` mirrors `src/modules/{module-name}.js`

**E2E tests:**
- Location: `tests/*.spec.js`
- Format: CommonJS (`.spec.js`) with `require()`
- Naming: feature-based — `smoke.spec.js`, `dashboard.spec.js`, `export.spec.js`

**Helpers:**
- `tests/helpers.js` — shared E2E utilities (CommonJS): `loadDemo`, `openDashTab`, `clickSubnet`, `captureErrors`, `countElements`

**Visual regression snapshots:**
- `tests/visual.spec.js-snapshots/` — Playwright screenshot baselines
- Visual tests excluded from CI via `playwright.config.js` `testIgnore`

```
tests/
├── helpers.js                  # Shared E2E utilities
├── smoke.spec.js               # App load, demo data, SVG render
├── dashboard.spec.js           # Unified dashboard tab navigation
├── detail-panel.spec.js        # Subnet click → detail panel
├── export.spec.js              # HTML/XLSX/DOCX export generation
├── flow-mode.spec.js           # Flow analysis UI
├── edge-cases.spec.js          # Empty data, malformed input
├── visual.spec.js              # Screenshot regression (CI-excluded)
└── unit/
    ├── utils.test.mjs
    ├── cidr-engine.test.mjs
    ├── network-rules.test.mjs
    ├── compliance-engine.test.mjs
    ├── governance-checks.test.mjs
    ├── iam-engine.test.mjs
    ├── budr-engine.test.mjs
    ├── diff-engine.test.mjs
    ├── flow-analysis.test.mjs
    ├── multi-account.test.mjs
    ├── iac-generator.test.mjs
    └── export-utils.test.mjs
```

---

## Unit Test Structure

**Suite/case organization:**
```javascript
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { functionUnderTest } from '../../src/modules/module-name.js';

describe('functionName', () => {
  it('does the happy path', () => {
    assert.equal(functionUnderTest('input'), 'expected');
  });
  it('returns null for invalid input', () => {
    assert.equal(functionUnderTest(null), null);
  });
});
```

**One `describe` block per exported function.** Test file closely mirrors the module's export list.

**Lifecycle hooks used sparingly:**
- `beforeEach` used only when module has side effects to reset (e.g., compliance cache): `invalidateComplianceCache()` in `tests/unit/compliance-engine.test.mjs`
- No `afterEach`, `before`, or `after` in any unit test

---

## Mocking — Unit Tests

Modules that depend on `window.*` globals or `document` require pre-import setup via `globalThis`. This is the dominant mocking pattern.

**Pattern 1 — Pre-import globalThis setup (most common):**
```javascript
// Set up before the dynamic import
globalThis.window = globalThis.window || {};
globalThis.window._classificationData = [];
globalThis.window.runClassificationEngine = () => {};
globalThis.document = globalThis.document || {
  getElementById: () => ({ value: '' }),
  querySelector: () => null,
  querySelectorAll: () => [],
};

// Stub bare globals called by module internals
globalThis.runBUDRChecks = () => [];
globalThis.parseIAMData = () => ({});
globalThis.runIAMChecks = () => [];

import { runComplianceChecks } from '../../src/modules/compliance-engine.js';
```
Used in: `compliance-engine.test.mjs`, `governance-checks.test.mjs`, `budr-engine.test.mjs`

**Pattern 2 — Dynamic import for window-bridging modules:**
```javascript
globalThis.window = globalThis;  // window === global
globalThis._traceInternetToResource = () => ({ blocked: true, path: [] });

const { detectBastions } = await import('../../src/modules/flow-analysis.js');
```
Used when a module reads `window.someFunction` at call time (not import time). `await import()` is needed because `globalThis` must be set first.
Used in: `flow-analysis.test.mjs`, `multi-account.test.mjs`

**Pattern 3 — No mocking needed (pure functions):**
```javascript
import { ipToInt, parseCIDR, cidrContains } from '../../src/modules/cidr-engine.js';
```
Used for: `cidr-engine.test.mjs`, `network-rules.test.mjs`, `diff-engine.test.mjs`, `utils.test.mjs`, `iam-engine.test.mjs`

**No mock library.** No sinon, jest.mock, or similar. Only plain function stubs assigned to `globalThis`.

---

## Fixtures and Factories — Unit Tests

**Inline factory functions** are the standard pattern. Each test file defines a `cleanCtx()` or `govCtx()` helper that returns a minimal valid context object:

```javascript
// tests/unit/compliance-engine.test.mjs
function cleanCtx() {
  return {
    sgs: [], nacls: [], rts: [], subnets: [], instances: [], vpcs: [],
    albs: [], rdsInstances: [], ecsServices: [], lambdaFns: [],
    s3bk: [], ecacheClusters: [], redshiftClusters: [], volumes: [],
    snapshots: [], peerings: [], pubSubs: new Set(),
    subRT: {}, subNacl: {}, sgByVpc: {},
  };
}
```

Tests mutate a fresh factory result to set up specific scenarios:
```javascript
it('detects CIS 5.2: SSH from 0.0.0.0/0', () => {
  const ctx = cleanCtx();
  ctx.sgs = [{ GroupId: 'sg-test', IpPermissions: [{ /* ... */ }] }];
  const findings = runComplianceChecks(ctx);
  assert.ok(findings.some(f => f.control === 'CIS 5.2'));
});
```

**No fixture files.** All test data is inline JavaScript objects.

**Location:** Factory functions are defined locally within each test file, not shared.

---

## E2E Test Structure

**Setup pattern — all E2E specs use `test.beforeEach`:**
```javascript
const { test, expect } = require('@playwright/test');
const { loadDemo, openDashTab, captureErrors } = require('./helpers');

test.describe('Feature Name', () => {
  test.beforeEach(async ({ page }) => {
    await loadDemo(page);  // loads demo data, waits for SVG render
  });

  test('does something', async ({ page }) => {
    await expect(page.locator('#someElement')).toBeVisible();
  });
});
```

**`loadDemo()` helper** (`tests/helpers.js`):
1. Sets `localStorage.setItem('aws_mapper_onboarded', '1')` via `addInitScript` to skip onboarding
2. Navigates to `http://localhost:8377`
3. Waits for `#landingDash` visible, clicks `#loadDemo`
4. Waits for `#landingDash` hidden and `.vpc-group` attached

**SVG interaction — evaluate() required:**
Playwright cannot click SVG `<g>` elements natively. All SVG interactions use `page.evaluate()`:
```javascript
// tests/helpers.js
async function clickSubnet(page, index = 0) {
  const subnetId = await page.evaluate((idx) => {
    const nodes = document.querySelectorAll('.subnet-node');
    nodes[idx].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return nodes[idx].getAttribute('data-subnet-id');
  }, index);
  await page.locator('#detailPanel.open').waitFor({ state: 'visible', timeout: 5000 });
  return subnetId;
}
```

**Console error capture pattern:**
```javascript
async function captureErrors(page, fn) {
  const errors = [];
  const handler = (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      if (text.includes('404') && text.includes('Failed to load resource')) return;
      errors.push(text);
    }
  };
  page.on('console', handler);
  await fn();
  page.off('console', handler);
  return errors;
}
// Usage:
const errors = await captureErrors(page, async () => { /* interaction */ });
expect(errors).toEqual([]);
```
Every action-oriented test captures and asserts zero console errors.

---

## Export Testing Pattern

Export tests intercept `downloadBlob` to capture the generated blob without triggering file dialogs:

```javascript
test('HTML report generates without errors', async ({ page }) => {
  await page.evaluate(() => {
    window._testLastBlob = null;
    window._origDownloadBlob = window.downloadBlob;
    window.downloadBlob = (blob, name) => {
      window._testLastBlob = { size: blob.size, name, type: blob.type };
    };
  });

  const errors = await captureErrors(page, async () => {
    await page.locator('#rptExportHTML').click();
    await page.waitForFunction(
      () => document.getElementById('rptExportHTML').textContent !== 'Generating...',
      { timeout: 15000 }
    );
  });

  expect(errors).toEqual([]);
  const blob = await page.evaluate(() => window._testLastBlob);
  expect(blob).not.toBeNull();
  expect(blob.size).toBeGreaterThan(100);

  await page.evaluate(() => { window.downloadBlob = window._origDownloadBlob; });
});
```

Pattern applies to all export types: HTML, XLSX, DOCX, PNG.

---

## Coverage

**Requirements:** None enforced. No coverage tooling configured.

**What IS covered (unit tests):**
- `src/modules/utils.js` — `safeParse`, `ext`, `esc`, `gn`, `sid`, `clsGw`, `isShared`, `gcv`, `gch`
- `src/modules/cidr-engine.js` — all exported functions
- `src/modules/network-rules.js` — all exported functions
- `src/modules/compliance-engine.js` — `runComplianceChecks`, `runGovernanceChecks`, caching
- `src/modules/iam-engine.js` — `parseIAMData`, `getIAMAccessForVpc`, `runIAMChecks`
- `src/modules/budr-engine.js` — `runBUDRChecks`, tier compliance, formatting
- `src/exports/diff-logic.js` — `normalizeResource`, `classifyChange`, `computeDiff`
- `src/modules/flow-analysis.js` — `detectBastions`, `classifyAllResources`, `discoverTrafficFlows`
- `src/modules/multi-account.js` — `detectRegionFromCtx`, `buildRlCtxFromData`
- `src/modules/iac-generator.js` — IAC generation logic
- `src/modules/export-utils.js` — VSDX layout helpers

**What is NOT covered (gaps):**
- `src/app-core.js` — entirely untested at unit level (19k lines)
- `src/modules/topology-renderer.js` — no unit tests (D3 rendering)
- `src/modules/landing.js` — no unit tests
- `src/modules/dashboards.js` — no unit tests
- `src/modules/report-html.js` — no unit tests
- All DOM-dependent rendering paths

**E2E coverage compensates** for the untested rendering code via smoke, dashboard, detail panel, export, and flow-mode specs.

---

## Test Types

**Unit Tests (`tests/unit/*.test.mjs`):**
- Scope: pure logic functions with no DOM/browser dependency
- Approach: input → output assertions, null/edge cases, error conditions
- Fast: sub-second execution, no server needed

**Integration/E2E Tests (`tests/*.spec.js`):**
- Scope: full app in browser — load, interact, verify visible state
- Approach: load demo data once per suite, then assert UI state
- Slower: requires serve + browser launch (~30s timeout per test)

**Visual Regression (`tests/visual.spec.js`):**
- Scope: screenshot comparison of SVG topology render
- Excluded from CI (`testIgnore` in playwright config when `process.env.CI`)
- Snapshots in `tests/visual.spec.js-snapshots/`

---

## Common Patterns

**Async testing (all E2E):**
```javascript
test('element appears', async ({ page }) => {
  await page.locator('#someElement').waitFor({ state: 'visible', timeout: 5000 });
  await expect(page.locator('#someElement')).toBeVisible();
});
```

**Async unit testing (dynamic imports):**
```javascript
const { myFunction } = await import('../../src/modules/my-module.js');
```

**Error condition testing (unit):**
```javascript
it('returns null for invalid input', () => {
  assert.equal(parseCIDR(null), null);
  assert.equal(parseCIDR(''), null);
  assert.equal(parseCIDR('garbage'), null);
});
```

**Testing compliance/engine findings:**
```javascript
it('detects specific control', () => {
  const ctx = cleanCtx();
  ctx.sgs = [{ /* trigger condition */ }];
  const findings = runComplianceChecks(ctx);
  const match = findings.filter(f => f.control === 'CIS 5.2');
  assert.ok(match.length >= 1, 'Should flag SSH from 0.0.0.0/0');
  assert.equal(match[0].severity, 'HIGH');
  assert.equal(match[0].resource, 'sg-test');
});
```

**Negative assertion (not flagged):**
```javascript
it('does not flag restricted SSH', () => {
  const ctx = cleanCtx();
  ctx.sgs = [{ /* safe CIDR */ }];
  const findings = runComplianceChecks(ctx);
  assert.equal(findings.filter(f => f.control === 'CIS 5.2').length, 0);
});
```

---

*Testing analysis: 2026-04-03*
