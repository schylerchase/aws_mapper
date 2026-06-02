# Humify Audit — AWS Mapper

Date: 2026-06-02 | Branch: `refactor/module-ownership` | Mode: read-only audit
Standard: `.codex/readable-codebase-standard.md` | Method: massive-codebase workflow (19 parallel scoring agents + per-area gate-open analysis)

## Coverage

- inventory coverage: 100% (all `src/` enumerated).
- Deep-dive: all 16 `app-core.js` regions, the 2 largest `src/exports` files, and a 3-module sample read with file/line evidence.
- Unknown: 28 smaller `src/modules/*` files not deep-audited (already-extracted, lower-risk).
- Excluded (generated/vendored): `dist/**`, `libs/**`, `node_modules/**`, `package-lock.json`, logos, `src/dev/edge-tests.js`.

## Lay of the land

Vanilla-JS AWS network-topology mapper (no framework; custom D3; esbuild). Ships as Electron desktop + Vercel web. ~37.7k lines source.

| Tier | Size | Role |
| --- | --- | --- |
| `src/app-core.js` | 19,123 (51%) | classic-script **monolith** — mixes model+state+render+controller; no direct tests |
| `src/modules/*.js` (31) | ~11.2k | extracted, esbuild-bundled, window-bridged; mostly owned/layered |
| `src/exports/*.js` (9) | ~5.9k | report/export generators; `exports-lucid.js` (2,086) over the split trigger |

Over the 1,500-line "must split" trigger: `app-core.js`, `src/exports/exports-lucid.js`.

## Heatmap (higher = worse; ranked by judgment + findings, not raw totals)

| Tier | Area | Class | Drives it |
| --- | --- | --- | --- |
| 🔴 High-risk | FLOW TRACING (app-core 12111-13329) | High-risk | confirmed `_sgById` vs `ctx.sgs` drift; untested |
| 🔴 | TOPOLOGY RENDERER (4429-8279) | High-risk | 1,922+1,929-line render fns; **`vpcVpces` crash @4855**; untested |
| 🔴 | exports-lucid.js | High-risk | two ~1,000-line duplicate layout engines; no error handling |
| 🔴 | exports-iac + exports-xlsx | High-risk | **bug #1** XLSX account-filter skip (7 types); untested |
| 🔴 | MULTI-account (9981-10700) + multi-account.js | M-shaped | **governance data-loss** (see H-GOV); dup 150-line parsers |
| 🟠 Readability | GOVERNANCE/INVENTORY, DESIGN MODE, UNIFIED DASHBOARD, UI UTILITIES, COMPLIANCE, FIREWALL, DIFF, FLOW ANALYSIS, PROJECT-IO, INIT | M-shaped | huge HTML-concat render fns, globals-at-generation, testability 0 |
| 🟢 Healthiest | REPORTS & XLSX (17015-19123) | Clean | extraction landed; thin bridges |
| 🟢 | TIMELINE & ANNOTATIONS | Needs cleanup | state in `timeline.js`; render + dup init left |

## Systemic findings (clustered)

- **[C1] No layer separation in `app-core.js` (HIGH).** Render fns read `_rlCtx`/`_complianceFindings`/`_annotations` at generation time instead of explicit inputs. Root cause of "debugging is hard."
- **[C2] Zero direct tests of `app-core.js` (HIGH).** 339 unit tests cover extracted modules only. Behavior movement here needs characterization tests first.
- **[C3] Machine-shaped density (HIGH machine-shaped confidence).** Massive HTML string concatenation (150-500 char lines, ~3.9% blank lines), repetitive field-by-field blocks, 318-char nested ternary (@246). The "machine-generated looking terrible" signal.
- **[C4] Silent app-core ↔ partially-extracted-module drift (HIGH).** Same logic in two places, diverging: flow tracing, multi-account parsers, firewall, governance `_inventoryData`, timeline init.

## Verified bugs (file/line confirmed)

- **[H-GOV] Governance/compliance data loss in multi-account (HIGH).** `src/modules/multi-account.js` `buildRlCtxFromData` parses **no** governance fields — `cloudtrailTrails, cwAlarms, logGroups, flowLogs, configRecorders, configRules, configConformance, securityHubStds, accessAnalyzers, kmsKeys, guarddutyDetectors, secrets, ssmParams, ecrRepos, asgs, apiGateways, snsTopics, sqsQueues` are all absent (0 refs vs 16-17 in app-core), and its return (line 163) omits them. Any account context built through this module path silently drops all compliance/audit/security data, so multi-account merges under-report. Fix: parse + return the governance fields (mirror app-core's data parser); regression test first.
- **[H-VPCE] `vpcVpces` ReferenceError (HIGH).** `src/app-core.js:4855` references undeclared `vpcVpces` in the landing-zone VPC tooltip; declared only at 5424 (different scope). Crashes that tooltip path. Fix: `const vpcVpces = vpceByVpc[vl.vpc.VpcId] || [];`.
- **[H-XLSX] XLSX inventory ignores account filter for 7 types (HIGH) = backlog bug #1.** `src/exports/exports-xlsx.js:513-537` iterate raw arrays instead of `_af()` (peerings, zones, wafAcls, cfDistributions, vpns, tgwAttachments, tgs). Fix: wrap each in `_af()`.
- **[H-FLOW] Flow-trace SG drift (HIGH).** app-core `_resolveNetworkPosition` uses the `_sgById` global cache; `flow-tracing.js` `resolveNetworkPosition` uses `ctx.sgs`. Divergent reachability results; untested.
- **[M-LEAK] Dashboard event-listener reattach leak (MEDIUM).** UNIFIED DASHBOARD re-`addEventListener` on every render after `innerHTML=`; clicks fire N× after N renders.

## Cleared items (judgment)

- The `window` bridge itself is not a defect — it is the standard's temporary drain mechanism. Flagged only where a copy has drifted (C4).
- REPORTS & XLSX region — extraction already landed; mostly clean bridges. Not a target.
- `exports-docx/visio/scripts`, `diff-logic.js`, 28 unsampled modules — not deep-audited; inferred lower-risk, not verified.
- Density is a maintainability signal; no AI-authorship claimed.

## Refactor Readiness Verdict

**Gate: PARTIALLY OPEN.** Worktree is clean, but high-risk areas (flow tracing, topology, exports-lucid, multi-account parsers) are gated **closed until characterization tests exist** (C1/C2). Safe now: fixing the verified bugs and extracting pure helpers tests-first. First slice: characterization harness for flow tracing. See `HUMIFY-PLAN.md`.
