# Unified Dashboard + Enhanced BUDR Signals

**Date:** 2026-02-19
**Status:** Approved

## Problem

Five separate full-screen dashboard overlays (Governance, Compliance, Firewall, BUDR, Reports) require closing one and reopening another from the dock to navigate between them. Governance has internal tabs (Classification, IAM) that aren't accessible from other dashboards. BUDR assessments don't leverage several recovery/immutability signals already present in the exported JSON data.

## Design Decisions

1. **Single unified overlay** replaces all 5 separate overlays.
2. **6 flat top-level tabs**: Classification, IAM Review, Compliance, Firewall, BUDR, Reports. No nesting — governance sub-tabs promoted to top level.
3. **Existing render functions retargeted** to shared body/toolbar/footer elements. All filtering, search, pagination, sort, and export logic preserved unchanged.
4. **Enhanced BUDR signals** mined from existing JSON fields — no new API calls or export script changes.

## Unified Dashboard Shell

### HTML Structure

```
<div id="udash" class="udash">                    ← single overlay
  <div class="udash-hdr">                          ← shared header
    <div class="udash-tabs" id="udashTabs">        ← 6 tab buttons
    <button class="dash-close" id="udashClose">Close</button>
  </div>
  <div class="udash-toolbar" id="udashToolbar">    ← per-tab controls
  <div class="udash-body" id="udashBody">          ← scrollable content
  <div class="udash-footer" id="udashFooter">      ← per-tab exports/pagination
</div>
```

### Tab Registry

```js
const _UDASH_TABS = [
  {id:'classification', label:'Classification', color:'#8b5cf6', icon:'🔒'},
  {id:'iam',            label:'IAM Review',     color:'#8b5cf6', icon:'👤'},
  {id:'compliance',     label:'Compliance',     color:'#22d3ee', icon:'✓'},
  {id:'firewall',       label:'Firewall',       color:'#ef4444', icon:'🛡'},
  {id:'budr',           label:'BUDR',           color:'#10b981', icon:'💾'},
  {id:'reports',        label:'Reports',        color:'#f59e0b', icon:'📊'},
];
```

### State

```js
let _udashTab = null;  // active tab id
// Per-tab state objects unchanged:
// _govDashState, _compDashState, _budrDashState, _fwDash* vars
```

### Opening

All dock buttons call `openUnifiedDash(tabId)`:
1. Run prerequisites if needed (classification engine, compliance scan, BUDR checks, etc.)
2. Set `_udashTab = tabId`
3. Add `.open` to `#udash`, force reflow
4. Render tab header + call tab's render function

### Tab Switching

`_switchUdashTab(tabId)`:
1. Run prerequisites for target tab
2. Update `_udashTab`
3. Highlight active tab button
4. Call target tab's render function (writes into shared toolbar/body/footer)

### Reports Tab (Special Case)

Reports has a split-pane layout (picker + preview) instead of toolbar + body + footer. When Reports tab is active:
- Toolbar is hidden
- Body contains the full split-pane layout
- Footer contains generate/export buttons

### What Gets Removed

- 5 separate overlay `<div>`s: `compDash`, `budrDash`, `govDash`, `rptBuilder`, `fwDash`
- `_DASH_REGISTRY` array and `_initDashNav()` function
- Patched open function wrappers (`_origRenderCompPanel`, `_origOpenFwDash`, etc.)
- Governance internal tab nav (Classification/IAM become top-level)
- Per-dashboard close buttons and Esc handlers (replaced by single close)
- `_closeAllDashboards()` and `_closeAllDashboardsExcept()` (single overlay, nothing to close)

### What Stays

- All per-tab render functions and state objects (retargeted to `udashBody`/`udashToolbar`/`udashFooter`)
- All CSS for table rows, pills, badges, tier cards (class names unchanged)
- All filtering, search, pagination, sort, export logic
- Keyboard shortcut: Esc closes unified dashboard

### Render Function Changes

Each render function currently targets dashboard-specific element IDs. They need to target shared IDs:

| Tab | Current body ID | Current toolbar ID | Current footer ID |
|-----|----------------|-------------------|-------------------|
| Classification | `govBody` | `govToolbar` | `govFooter` |
| IAM | `govBody` | `govToolbar` | `govFooter` |
| Compliance | `compBody` | (inline in header) | `compFooter` |
| Firewall | `fwDashBody` | (inline in header) | `fwDashFooter` |
| BUDR | `budrBody` | (inline in header) | `budrFooter` |
| Reports | (split pane) | (none) | (inline) |

All retargeted to: `udashBody`, `udashToolbar`, `udashFooter`.

Compliance and Firewall have pills/controls in the header area — these move to `udashToolbar`.

## Enhanced BUDR Signals

### New Signals from Existing JSON Data

**RDS:**
- `DeletionProtection` — finding if false (MEDIUM: "No deletion protection")
- `ReadReplicaDBInstanceIdentifiers.length > 0` — DR signal, improves profile tier
- `ReadReplicaSourceDBInstanceIdentifier` — skip: this is a replica, not primary
- `LatestRestorableTime` exists — PITR active, improves profile
- `Engine.startsWith('aurora')` — Aurora has built-in HA, better tier

**S3 (new BUDR resource type):**
- `Versioning.Status === 'Enabled'` → protected
- `Versioning.MFADelete === 'Enabled'` → immutable signal
- No versioning → at_risk, finding: "S3 bucket not versioned"

**EC2:**
- Snapshot age from `snapByVol[vid].StartTime` — finding if latest > 7 days old
- `Encrypted` on EBS volumes — signal badge

**ElastiCache:**
- `AutomaticFailover === 'enabled'` → better tier (currently only checks node count)

### Signal Badges in BUDR Table

New column in BUDR dashboard table showing color-coded signal badges:
```
✓ MultiAZ  ✓ PITR  ✓ Encrypted  ✗ No Delete Protection
(green)    (green)  (green)       (red)
```

Badges are small inline chips, same style as existing `.gov-tier-badge`.

### New BUDR Profiles

```js
_BUDR_RTO_RPO.s3_versioned   = {tier:'protected', rto:'N/A',  rpo:'0 (versioned)'};
_BUDR_RTO_RPO.s3_unversioned = {tier:'at_risk',   rto:'N/A',  rpo:'Unrecoverable'};
_BUDR_RTO_RPO.rds_aurora     = {tier:'protected', rto:'<30s', rpo:'<5min (PITR)'};
```

## YAGNI (Excluded)

- No new AWS API calls or export script changes
- No AWS Backup plan integration
- No DLM policy detection
- No S3 replication detection
- No interactive remediation (findings + export only)
- No drag-and-drop tab reordering
- No tab persistence across sessions
- No collapsible/pinnable tabs
