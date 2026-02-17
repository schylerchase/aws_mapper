# Actionable Report Engine Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add priority tiers, effort classification, and resource grouping to compliance reporting — both in-app dashboard and all export formats.

**Architecture:** Static effort mapping table + classification functions that wrap existing findings data. New Action Plan view component in the compliance dashboard. Enhanced export generators that use the same classification layer.

**Tech Stack:** Vanilla JS (embedded in index.html), CSS, HTML generation for exports

---

### Task 1: Effort Mapping Table + Classification Functions

**Files:**
- Modify: `index.html` (JS section, after compliance check functions ~line 2560)

**Step 1: Add the effort mapping object**

Add `_EFFORT_MAP` keyed by control ID or prefix. Each entry maps to `'quick'`, `'moderate'`, or `'project'`. Include all existing control IDs from the compliance check functions (CIS 5.1-5.5, NET-*, WAF-NET-*, WAF-SEC-*, ARCH-*, SOC2-*, PCI-*, IAM-*). Default unmapped controls to `'moderate'`.

```javascript
const _EFFORT_MAP = {
  // Quick Fix — config changes, ~5 min
  'CIS 5.2': 'quick', 'CIS 5.3': 'quick', 'CIS 5.4': 'quick',
  'CIS 5.1': 'quick',
  'WAF-NET-2': 'quick', 'WAF-NET-3': 'quick',
  // ... all ARCH-ENC-*, SOC2-LOG-*, ARCH-TAG-* → quick
  // Moderate — infrastructure changes, 1-2 hrs
  'CIS 5.5': 'moderate',
  // ... all ARCH-RT-*, ARCH-NAT-*, IAM-*, ARCH-HA-* → moderate
  // Project — architecture changes, 1+ days
  // ... all ARCH-VPC-*, ARCH-VPCE-* → project
};
const _EFFORT_LABELS = { quick: 'Quick Fix', moderate: 'Moderate', project: 'Project' };
const _EFFORT_TIME = { quick: '~5 min', moderate: '~1-2 hrs', project: '~1+ days' };
```

**Step 2: Add classification functions**

```javascript
function _getEffort(finding) {
  return _EFFORT_MAP[finding.control] || 'moderate';
}

function _classifyTier(finding) {
  const effort = _getEffort(finding);
  const sev = finding.severity;
  if (sev === 'CRITICAL') return 1;
  if (sev === 'HIGH' && effort === 'quick') return 1;
  if (sev === 'HIGH') return 2;
  if (sev === 'MEDIUM' && effort === 'quick') return 2;
  return 3;
}

const _TIER_META = {
  1: { name: 'Fix Now', color: '#ef4444', bg: 'rgba(239,68,68,.08)' },
  2: { name: 'This Sprint', color: '#f59e0b', bg: 'rgba(245,158,11,.08)' },
  3: { name: 'Backlog', color: '#3b82f6', bg: 'rgba(59,130,246,.08)' }
};
```

**Step 3: Add resource grouping function**

```javascript
function _groupByResource(findings) {
  const map = {};
  findings.forEach(f => {
    const key = f.resource;
    if (!map[key]) map[key] = {
      resource: f.resource,
      resourceName: f.resourceName || f.resource,
      findings: [],
      worstSev: 'LOW',
      worstTier: 3
    };
    const tier = _classifyTier(f);
    map[key].findings.push({ ...f, effort: _getEffort(f), tier });
    if ((_SEV_ORDER[f.severity] || 9) < (_SEV_ORDER[map[key].worstSev] || 9)) map[key].worstSev = f.severity;
    if (tier < map[key].worstTier) map[key].worstTier = tier;
  });
  return Object.values(map).sort((a, b) => {
    if (a.worstTier !== b.worstTier) return a.worstTier - b.worstTier;
    return (_SEV_ORDER[a.worstSev] || 9) - (_SEV_ORDER[b.worstSev] || 9);
  });
}

function _getTierGroups(findings) {
  const groups = { 1: [], 2: [], 3: [] };
  _groupByResource(findings).forEach(rg => {
    groups[rg.worstTier].push(rg);
  });
  return groups;
}

function _estimateTotalEffort(resourceGroups) {
  let mins = 0;
  resourceGroups.forEach(rg => rg.findings.forEach(f => {
    if (f.effort === 'quick') mins += 5;
    else if (f.effort === 'moderate') mins += 90;
    else mins += 480;
  }));
  if (mins < 60) return '~' + mins + ' min';
  if (mins < 480) return '~' + Math.round(mins / 60) + ' hrs';
  return '~' + Math.round(mins / 480) + ' days';
}
```

**Step 4: Verify by reading all existing compliance control IDs**

Grep all control IDs from `runCISChecks`, `runWAFChecks`, `runArchChecks`, `runSOC2Checks`, `runPCIDSSChecks`, `runIAMChecks` and ensure every control is in `_EFFORT_MAP`. Log any missing ones.

**Step 5: Commit**

```
feat(compliance): add effort mapping, tier classification, and resource grouping
```

---

### Task 2: Action Plan View — In-App Dashboard

**Files:**
- Modify: `index.html` (CSS section ~line 76+, HTML compliance dashboard section, JS `_renderCompDash` area)

**Context:** The compliance dashboard is opened via `renderCompliancePanel()`. It has a `#compDash` overlay with `#compSevPills` for severity filters, `#compBody` for the findings table, and `#compExecSummary` for the executive summary. The new Action Plan view is an alternative rendering of `#compBody`.

**Use frontend-design skill principles:** This view must feel like a first-class feature, not a bolted-on panel. Use intentional typography, clear visual hierarchy, and polished resource cards with meaningful whitespace.

**Step 1: Add CSS for Action Plan view**

Add styles for:
- `.comp-view-toggle` — pill toggle (Table | Action Plan) in the dashboard header
- `.comp-tier-section` — tier section with colored left border and header
- `.comp-tier-header` — tier name + count + estimated effort
- `.comp-action-summary` — three summary cards at top
- `.comp-resource-card` — expandable card per resource
- `.comp-finding-row` — individual finding within a card
- `.comp-effort-tag` — small pill showing Quick Fix / Moderate / Project
- `.comp-tier-badge` — tier indicator

**Step 2: Add view toggle HTML**

Add a toggle control in the compliance dashboard header (near the severity pills):
```html
<div class="comp-view-toggle">
  <button class="comp-view-btn active" data-view="action">Action Plan</button>
  <button class="comp-view-btn" data-view="table">Table</button>
</div>
```

**Step 3: Implement `_renderActionPlan(findings)` function**

This renders the Action Plan view into `#compBody`:

1. Compute tier groups using `_getTierGroups(filtered)`
2. Render Action Summary Bar — three cards showing tier count + estimated effort
3. For each tier (1, 2, 3):
   - Render tier section header with name, color, count, total effort
   - For each resource group in that tier:
     - Render resource card (collapsed by default for Backlog, expanded for Fix Now)
     - Card header: resource name, finding count, worst severity badge
     - Card body: finding rows with severity, control, message, effort tag, remediation
     - Jump + Mute buttons per finding
4. Tier 3 (Backlog) section is collapsed by default with expand toggle

**Step 4: Wire view toggle**

Update `_renderCompDash` to check `_compDashState.view` ('action' or 'table'):
- If 'action': call `_renderActionPlan(findings)`
- If 'table': render existing table (current code)

Add click handlers on toggle buttons to switch `_compDashState.view` and re-render.

Default `_compDashState.view = 'action'`.

**Step 5: Ensure existing filters work with Action Plan view**

Severity pill filters, framework filter, search, and muted toggle must filter the Action Plan view the same way they filter the table view. The filtered findings array feeds into `_getTierGroups()`.

**Step 6: Commit**

```
feat(compliance): add Action Plan view with priority tiers and resource cards
```

---

### Task 3: HTML Report — Action Plan Format

**Files:**
- Modify: `index.html` (JS function `_exportComplianceHTML` ~line 2791)

**Step 1: Restructure `_exportComplianceHTML`**

Replace the current flat-table HTML report with the action plan layout:

1. **Header** — Title, date, compliance score ring (keep existing)
2. **Action Summary** — Three colored cards: Fix Now (count, effort), This Sprint, Backlog
3. **Fix Now Section** — Red section header, resource cards with:
   - Resource name + type
   - Numbered remediation steps
   - Severity + effort tags per finding
4. **This Sprint Section** — Amber section header, same card format
5. **Backlog Section** — Blue section header, same format
6. **Framework Scorecard** — Keep existing framework scores grid
7. **Appendix — Full Findings Table** — Keep existing detailed table with new Priority Tier and Effort columns

Reuse `_getTierGroups()` and `_groupByResource()` for data.

Keep print-friendly CSS with page breaks between sections.

**Step 2: Commit**

```
feat(compliance): restructure HTML report as action plan with priority tiers
```

---

### Task 4: CSV/Excel Export Enhancement

**Files:**
- Modify: `index.html` (JS functions `_exportFilteredCSV` ~line 2778, `_exportComplianceExcel` ~line 2709, `_exportComplianceCSV` ~line 2696)

**Step 1: Add new columns to CSV exports**

In `_exportFilteredCSV` and `_exportComplianceCSV`:
- Add columns: `Priority Tier`, `Effort`, `Resource Group`
- Sort by tier (1 first), then severity within tier
- `Priority Tier` = `_TIER_META[_classifyTier(f)].name`
- `Effort` = `_EFFORT_LABELS[_getEffort(f)]`
- `Resource Group` = `f.resource` (groups same-resource findings)

**Step 2: Add new columns to Excel export**

In `_exportComplianceExcel`:
- Add Priority Tier and Effort columns to the Findings Detail sheet
- Add a new "Action Plan" sheet with tier-grouped resource summaries
- Sort findings by tier then severity

**Step 3: Commit**

```
feat(compliance): add priority tier and effort columns to CSV/Excel exports
```

---

### Task 5: Polish + Integration Testing

**Files:**
- Modify: `index.html` (various sections)

**Step 1: Verify effort mapping completeness**

Run the app with demo data, open compliance dashboard, verify:
- All findings have an effort classification (no 'undefined')
- Tier distribution looks reasonable
- Resource grouping works (multiple findings on same SG grouped)

**Step 2: Test Action Plan view**

- Toggle between Table and Action Plan views
- Verify severity filters work in both views
- Verify search works in both views
- Verify Jump button works from Action Plan resource cards
- Verify Mute works per-finding in Action Plan view
- Verify Backlog section starts collapsed

**Step 3: Test HTML export**

- Export HTML report, open in browser
- Verify action summary cards show correct counts
- Verify tier sections have correct resource cards
- Verify appendix table has new columns
- Test print preview

**Step 4: Test CSV/Excel exports**

- Export CSV, open in text editor — verify new columns present
- Export Excel (.html), open — verify new columns in Findings Detail sheet

**Step 5: Commit any fixes**

```
fix(compliance): polish action plan view and export formatting
```
