# UX Overhaul Design — Progressive Disclosure

**Goal**: Reduce information overload for new users while preserving power-user workflows, through progressive disclosure, contextual visibility, and better signposting.

**Approach**: Show less by default, reveal on demand, guide with context. No visual identity changes — refine spacing, hierarchy, and flow within the existing dark-theme aesthetic.

---

## 1. Sidebar Redesign

**Problem**: 18 textareas visible immediately. "Render Map" below the fold. No guidance on which sections matter.

**Solution**:
- Start with 3 large action buttons: **Import Folder** (primary/green), **Paste JSON** (secondary), **Load Report** (tertiary)
- "Demo" as a text link below, not a full button
- Clicking "Paste JSON" reveals current textarea sections, all collapsed by default except Network
- Hint text: "Expand sections and paste AWS CLI JSON output"
- **Sticky "Render Map" button** at sidebar bottom, always visible regardless of scroll
- After folder import: show **data summary** ("3 VPCs, 12 subnets, 8 EC2, 2 RDS — us-east-1, eu-west-2") with Render button and "Edit Raw Data" link
- Text size controls and theme toggle move to a **gear icon popover** in the sidebar header

## 2. Toolbar Reorganization

**Problem**: 30+ buttons in 6 groups all visible simultaneously, regardless of app state.

**Solution**:
- **Before render**: Only FILE group visible (Save, Open, Scan AWS)
- **After render**: Primary/secondary split:
  - **Always visible** (5): Search, Compliance, Inventory, Reports, Trace
  - **Overflow "More..."** button: Compare, History, BUDR, Governance, Flows, Firewall, Notes, Accounts
- Overflow threshold responsive to viewport width (>1600px shows all)
- **Active tab highlight**: bottom border accent on currently-open dashboard button
- **Inline shortcut hints**: subtle `kbd` tags on the 5 primary buttons (e.g., `Compliance Shift+C`)

## 3. Export Bar & Layout Selector

**Problem**: Export bar collapsed by default (dead discovery). Layout selector buried inside export bar.

**Solution**:
- **Layout selector moves to toolbar area** near zoom controls, as dropdown or segmented control
- Hub VPC name field appears inline when "Landing Zone" is selected
- Export bar **auto-expands after first render** with subtle slide-in
- **Remembers collapsed/expanded state** via localStorage
- Export buttons grouped with divider: Visual (PNG, Visio, Lucid) | Code (Terraform, CloudFormation)

## 4. Dashboard Empty States & Onboarding

**Problem**: Empty dashboards show blank tables. New users have no guided entry point.

**Solution**:
- **Empty state per dashboard tab**: one-line description + required data + action button ("Import Data" or "Load Demo")
- **First-visit onboarding overlay** (4 steps, tooltip-style popovers):
  1. "Start here — import your AWS data or try the demo" (sidebar)
  2. "Your infrastructure map renders here" (canvas)
  3. "Analyze with dashboards" (toolbar dashboard group)
  4. "Export diagrams and reports" (export bar area)
- Each step: Next / Skip / step counter
- Tracked via `localStorage.aws_mapper_onboarded`
- Replayable via "?" help button in toolbar

## 5. Detail Panel & Search

**Problem**: Detail panel has no hierarchy navigation. Search returns flat, ungrouped list.

**Solution**:
- **Breadcrumb navigation**: `VPC > Subnet > EC2 Instance` at panel top, clickable to navigate up
- **Structural relationships first** in related resources (parent VPC, sibling subnets, attached gateways), then flow-based relationships
- **Search results grouped by type** with counts per group (VPCs: 2, Subnets: 5, EC2: 12)
- **Compliance search**: when compliance tab is active, main search (`/`) also filters compliance findings

## 6. Directory Cleanup

**Problem**: Plans split across root `PLANS/` and `docs/plans/`, stray files at root, ambiguous `src/core/` vs `src/modules/`.

**Solution**:
- Merge `PLANS/*.md` into `docs/plans/`, delete root `PLANS/`
- Move `sanitize_aws_export.py` to `scripts/` (or delete if one-off)
- Move `AWSMapper.png` to `docs/`
- Move `src/dev/edge-tests.js` to `tests/`
- Rename `src/core/` to `src/exports/` (7 of 9 files are export modules)
- Move `src/data/effort-map.json` into `src/modules/`

## What Does NOT Change

- Dark theme aesthetic, color palette, typography
- All existing features and keyboard shortcuts
- Module architecture and build pipeline
- Test infrastructure
- Electron app structure

---

## Success Criteria

- New user can go from app open to rendered map in < 3 clicks
- No blank/empty panel states — every view has actionable context
- Toolbar shows <= 8 buttons by default on a 1440px-wide screen
- Power users can access all features within 1 extra click of current workflow
- All 263 unit tests and 54 E2E tests continue to pass
