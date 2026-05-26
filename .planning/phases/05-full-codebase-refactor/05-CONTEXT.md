# Phase 5: Full Codebase Refactor

Created: 2026-05-24

## Problem Frame

The previous readability pass made source files consistently formatted, but it did not resolve the underlying architecture problems. The codebase still has large mixed-responsibility modules, especially `src/app-core.js`, and several engines combine rule predicates, finding construction, rendering hooks, export behavior, and global bridge assumptions in the same files.

The target is a real structural refactor across the codebase, not another visual formatting pass.

## Primary Goal

Refactor AWS Network Mapper so source ownership is clear, modules are smaller, engines are easier to test, and the Electron/web app continues to behave exactly as it does today.

## Requirements

- Preserve existing user-visible behavior unless a later implementation plan explicitly calls out a behavior change.
- Keep generated outputs (`dist/*`, minified libraries, packaged assets) derived from source, not hand-edited.
- Reduce `src/app-core.js` as the central orchestration monolith by moving cohesive behavior to named modules.
- Split business logic from UI rendering where current modules mix both.
- Refactor engines around reusable predicates, rule definitions, and finding factories instead of repeated inline objects.
- Keep export flows working across PNG, Visio, Lucid, DOCX, XLSX, Terraform, CloudFormation, Bash, and PowerShell.
- Keep all active rendering paths in sync: grid/executive topology, landing zone, app-core hub-spoke paths, and landing page renderers.
- Preserve multi-account, multi-region, compliance, BUDR, governance, reports, timeline, detail panel, search, flow mode, and firewall editor behavior.
- Add characterization tests before risky extractions.
- Keep public-repo hygiene in mind: planning artifacts should remain under `.planning/` and not be moved to public docs.

## Non-Goals

- Do not rewrite the app into a new framework.
- Do not replace Electron or D3.
- Do not remove feature surfaces to simplify the refactor.
- Do not hand-edit `dist/*` as a substitute for source refactors.
- Do not combine history cleanup or public document cleanup with this structural refactor plan.

## Current State

- Branch: `readability_refactor`.
- Formatting pass has already run with Prettier and passed build, unit tests, and Playwright tests.
- `src/app-core.js` remains very large after formatting.
- Engine modules exist but are unevenly factored.
- `.planning/ROADMAP.md` already defines stabilization phases, but those phases are narrower than this full-codebase refactor request.
- Deep-plan dependency check:
  - Codex CLI: `0.132.0`.
  - GSD: `1.42.3`, installed as a symlinked local package, not a git checkout.
  - Deep Plan plugin: `0.3.0`, marketplace snapshot already up to date.
  - Compound Engineering plugin: `3.8.4`, marketplace snapshot already up to date.
  - RTK: `0.36.0`.

## Open Questions

No product behavior questions are blocking the plan. Implementation-time questions should be resolved with characterization tests and small extraction steps.

<signals>
files_modified: 40
tasks: 9
key_links: 12
artifacts: 6
truths: 14
novel: 3
checkpoints: 0
unknown_deps: 3
</signals>
