# AWS Network Mapper

## What This Is

AWS Network Mapper is a shipped browser and Electron app for turning AWS CLI exports or desktop scans into interactive topology maps, compliance dashboards, flow analysis, and exportable infrastructure reports. It is a zero-backend tool for architects, operators, and security-minded teams who need to inspect AWS network posture without sending topology data to a service.

The product already has broad feature coverage. The current GSD focus is to make the codebase easier to change safely by reducing monolith duplication, tightening module boundaries, improving report/export isolation, and adding targeted coverage around fragile workflows.

## Core Value

Users can reliably turn AWS environment data into an accurate, inspectable map and actionable reports without a backend.

## Requirements

### Validated

- [x] Browser and Electron users can load AWS export data and render a topology map.
- [x] Users can inspect VPCs, subnets, gateways, load balancers, databases, compute, IAM, WAF, storage, and related resources.
- [x] Users can analyze compliance across CIS, SOC 2, PCI DSS, IAM, AWS architecture, BUDR, and WAF rule sets.
- [x] Users can work with multi-account and multi-region folder imports.
- [x] Users can trace traffic flows, inspect blast radius, and use dashboard views for governance, firewall, BUDR, inventory, reports, and diffs.
- [x] Users can export diagrams, reports, IaC recommendations, compliance findings, and saved `.awsmap` projects.

### Active

- [ ] Reduce `src/app-core.js` duplication against extracted modules without regressing active UI workflows.
- [ ] Split remaining report/export logic into focused modules that can be tested independently.
- [ ] Reduce reliance on `window.*` bridges and implicit global load order.
- [ ] Harden fragile rendering and multi-account workflows with targeted automated tests.
- [ ] Improve performance hotspots called out in `OPTIMIZATION_PLAN.md` without changing the product model.

### Out of Scope

- Rebuilding the UI in a frontend framework - the current app is vanilla JavaScript with esbuild and direct DOM wiring.
- Adding a hosted backend or telemetry service - local/offline handling of AWS topology is central to the product.
- Adding non-AWS cloud providers in this milestone - Azure mapper is tracked separately.
- Replacing the committed `dist/` and vendored runtime library model without a dedicated packaging decision.
- Large visual redesigns while structural refactoring is in flight.

## Context

The codebase is a brownfield Electron and static web app. `src/app-core.js` is still the active orchestration monolith, while extracted ES modules live in `src/modules/` and `src/exports/` and are bundled into `dist/app.bundle.js` and `dist/core.bundle.js`. The repo already has a codebase map under `.planning/codebase/` and an optimization backlog in `OPTIMIZATION_PLAN.md`.

The main technical risk is divergence between duplicated implementations: active rendering paths, report/export functions, snapshot/timeline logic, and global bridge exports. Work should be incremental, verified by focused unit tests plus Playwright smoke coverage where UI workflows are touched.

## Constraints

- **Architecture**: Keep Electron context isolation, sandboxing, and preload-mediated IPC intact - renderer code must not regain direct Node access.
- **Runtime**: Preserve browser-only operation with no backend and no external CDN dependencies at runtime.
- **Build**: `dist/` and key vendored libraries are committed because Electron packaging and web deploy depend on them.
- **Style**: Prefer plain JavaScript modules and existing helper patterns over introducing a frontend framework or broad abstraction layer.
- **Testing**: Use Node's built-in test runner for unit tests and Playwright for browser/Electron workflows.
- **Change safety**: Rendering has multiple independent paths; label/layout changes must be applied and tested across every active path.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Treat this as a brownfield stabilization milestone | The shipped app already has broad product coverage; the bottleneck is safe change velocity | Pending |
| Preserve vanilla JS and Electron architecture | A framework rewrite would expand scope and risk without directly addressing the current debt | Pending |
| Base the first roadmap on `OPTIMIZATION_PLAN.md` and `.planning/codebase/*` | These files capture current debt, fragile areas, and the recommended order of work | Pending |
| Keep planning docs tracked unless changed later | GSD config defaults to tracked planning artifacts for continuity across sessions | Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition**:
1. Requirements invalidated? Move to Out of Scope with reason.
2. Requirements validated? Move to Validated with phase reference.
3. New requirements emerged? Add to Active.
4. Decisions to log? Add to Key Decisions.
5. "What This Is" still accurate? Update if drifted.

**After each milestone**:
1. Full review of all sections.
2. Core Value check - still the right priority?
3. Audit Out of Scope - reasons still valid?
4. Update Context with current state, feedback, and metrics.

---
*Last updated: 2026-04-29 after GSD initialization*
