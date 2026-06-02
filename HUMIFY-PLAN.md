# Humify Refactor Plan — Gate Opening (tests-first)

Date: 2026-06-02 | Branch: `refactor/module-ownership` | Companion: `HUMIFY-AUDIT.md`

Refactor stance: **behavior-preserving**. No code moves until its area's characterization harness is green against current code. The gate opens per area, not all at once.

Seams available in this repo:
- **importable module twins** (`flow-tracing.js`, `multi-account.js`, `exports/*`) → `node:test` characterization now, fixture from `src/modules/demo-data.js` `generateDemo()` (deterministic, seed 12345).
- **live app-core (classic script)** → Playwright golden-output (chromium + headless shell are installed; visual pixel baselines are darwin/win32 only, so new browser tests use **functional** assertions, not pixel snapshots).

## Units (ordered)

### Unit 1. Flow-tracing characterization harness  ·  node  ·  no blocker
Goal: pin SG resolution before killing the `_sgById` drift.
Findings: H-FLOW. File: `tests/unit/flow-tracing-resolve-sg.test.mjs`.
Asserts: instance w/ 3 SGs resolves all from `ctx.sgs`; empty SGs → `[]`; missing SG filtered (no crash); null ctx → null; unknown id → null.
Opens gate for: FLOW TRACING. Rollback: delete test file.

### Unit 2. Multi-account governance-loss fix (test-first)  ·  node  ·  no blocker  ·  PRIORITY
Goal: stop silent compliance/audit data loss in `buildRlCtxFromData`.
Findings: H-GOV. Files: `tests/unit/multi-account-governance.test.mjs`, `src/modules/multi-account.js`.
Approach: (1) write regression test asserting `buildRlCtxFromData` returns populated governance fields (RED); (2) port the governance-field parsing from app-core's data parser into the module + add to its return; (3) test GREEN + full suite + build.
Opens gate for: MULTI-account parsers (then the dup-parser collapse can follow).
Rollback: revert `multi-account.js`; delete test.

### Unit 3. Exports XLSX/IaC harness + bug #1 fix  ·  node (global stubs)  ·  no blocker
Goal: pin account-filtered inventory; fix bug #1.
Findings: H-XLSX. Files: `tests/unit/exports-xlsx-inventory.test.mjs`, `src/exports/exports-xlsx.js`.
Approach: red test (7 unfiltered types leak across accounts) → wrap the 7 loops (lines 513-537) in `_af()` → green.
Opens gate for: IaC/XLSX exports.

### Unit 4. Topology smoke harness + `vpcVpces` fix  ·  Playwright (functional)
Goal: pin the live map render; fix the tooltip crash.
Findings: H-VPCE. Files: `tests/topology-smoke.spec.js`, `src/app-core.js`.
Approach: red test (`loadDemo()` + hover VPC w/ endpoints → no console ReferenceError) → `const vpcVpces = vpceByVpc[vl.vpc.VpcId]||[]` @~4855 → green. Functional assertions only (no Linux pixel baseline).
Opens gate for: TOPOLOGY renderer.

### Unit 5. Exports-lucid golden + ctx injection  ·  Playwright → node
Goal: pin Lucid doc structure, then unify the two duplicate layout engines.
Approach: Playwright golden snapshot of `doc.pages[0]` shapes/lines on demo data → refactor `buildLucidExport` to accept `ctx` → node unit test → snapshot unchanged.
Opens gate for: exports-lucid. Residual risk: HIGH (algorithmic layout); golden-output is the guardrail.

## After the gate opens (per area)
characterize ✓ → rename → extract pure logic → separate boundaries → collapse duplicates → delete dead code → error contract → readability pass.

## Steelman check
- Strongest evidence: importable seams + verified facts (`vpcVpces`@4855, bug#1@513-537, governance fields=0 in module, flow drift).
- Biggest uncertainty: 28 unsampled modules; whether every live multi-account path routes through the lossy `buildRlCtxFromData` (red test confirms scope).
- False-positive risk: low (behavior facts, not style).
- Safety guardrail: every unit tests-first + reversible; Playwright functional-only.
- Decision: proceed; node units first (zero blocker, highest-risk areas).

## Execution status — 2026-06-02 (branch `refactor/module-ownership`)

All five units actioned. Unit suite 341 → **364 passing**. Every importable fix
ships a node:test regression verified green→red(revert)→green.

| Unit | What landed | State |
| --- | --- | --- |
| 1. Flow-tracing characterization | `tests/unit/flow-tracing-resolve-sg.test.mjs` (5 cases) | ✅ done |
| 2. Multi-account governance (H-GOV) | done earlier (`f1c4ced`) | ✅ done |
| 3. XLSX inventory account-filter (bug #1) | extracted pure `buildInventoryRows(ctx, acctFilter)`; `tests/unit/exports-xlsx-inventory.test.mjs` | ✅ done |
| 4. Topology `vpcVpces` crash (H-VPCE) | one-line decl in `renderLandingZoneMap` mouseenter | ✅ fix done; ⏳ Playwright smoke deferred (no browser libs in sandbox) |
| 5. Exports-lucid | golden-structure test for both modes (`tests/unit/exports-lucid-golden.test.mjs`); engine ctx-injection **extraction deferred** | ◐ characterized; extraction = next step |

### BUG-HUNT backlog (`BUG-HUNT-main.md`) — applied this session
All 18 confirmed bugs are now resolved on this branch:
- Earlier: #1 (`f41f13a`), #2 (`6074c81`), #4 (`f2af2d5`), #8 (`327d5da`).
- This session (`dc96dfd`): #3, #5, #6, #7, #9, #10, #11, #12, #13, #14, #15, #16, #17 + audit M-LEAK and H-VPCE.
- #18 (sidebar/tab CSS) was already fixed by `33bb0c0` (verified, no change needed).

Live-path discipline: where a bug existed in both the app-core inline monolith
(the shipped path) and a `src/modules` twin, BOTH copies were patched in lockstep
(#3, #5, #12, #14, #17). The node tests target the importable twin; the inline
copies share identical logic and were verified by adversarial re-analysis +
`node --check` + a clean prod esbuild/terser build.

### Deferred (need a browser-capable env — chromium libs absent here)
- Unit 4 topology hover smoke; functional coverage for the app-core-only fixes
  (#6 SnapAgeDays badge, #15 admin wildcard-Resource, #16 imported-finding
  severity, M-LEAK listener dedupe, #5/#12 client re-sort).
- Unit 5 grid-engine extraction into `buildGridLayout(ctx)` (golden test is the
  guard once a browser env can confirm the exported `.lucid` opens correctly).
