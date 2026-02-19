# Unified Dashboard + Enhanced BUDR + Bug Fixes — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace 5 separate full-screen dashboard overlays with a single unified dashboard shell featuring 6 flat tabs, add enhanced BUDR signals from existing JSON data, add account labels to search results, and fix private-subnet text label / ENI mapping bugs.

**Architecture:** Single `#udash` overlay with shared header (tab bar + close), toolbar, body, and footer elements. Each tab's existing render function is retargeted to write into the shared elements. A tab registry drives tab switching, prerequisites, and keyboard shortcuts. Enhanced BUDR signals are mined from existing export JSON fields — no new API calls.

**Tech Stack:** Vanilla JS, D3.js, CSS custom properties, single-file HTML app

---

## Task 1: Add Unified Dashboard HTML Shell

**Files:**
- Modify: `/Users/schylerryan/Desktop/aws_mapper/index.html` — lines 1930–2061 (dashboard overlays HTML)

**Step 1: Replace 5 dashboard overlay divs with single unified shell**

Find lines 1930–2061 (the 5 dashboard div blocks: compDash, budrDash, govDash, rptBuilder, fwDash). Replace ALL of them with a single div containing: header (tab bar + close button), toolbar, scrollable body, and footer.

The old per-dashboard IDs (compDash, budrDash, etc.) will no longer exist. All IDs referenced by JS will need updating in subsequent tasks.

**Step 2: Verify HTML structure**

Search for `id="udash"` — confirm the single shell exists. Search for `id="compDash"`, `id="budrDash"`, `id="govDash"`, `id="rptBuilder"`, `id="fwDash"` — confirm all are GONE.

---

## Task 2: Add Unified Dashboard CSS

**Files:**
- Modify: `/Users/schylerryan/Desktop/aws_mapper/index.html` — CSS section (around line 312–650 where dashboard-specific CSS lives)

**Step 1: Add udash CSS rules**

After the existing shared `.dash-*` CSS block (around line 1455), add rules for:
- `.udash` — fixed positioning, full-screen overlay, opacity transition, flex column layout
- `.udash.open` — visible state
- `.udash-hdr` — flex row, tab bar container, border-bottom
- `.udash-tabs` — flex row, gap between tabs, overflow-x auto
- `.udash-tab` — individual tab button with bottom border highlight, `--tab-color` custom property
- `.udash-tab.active` — highlighted state using the tab's color
- `.udash-toolbar` — flex-shrink:0
- `.udash-body` — flex:1, overflow-y auto (scrollable content area)
- `.udash-footer` — flex-shrink:0
- `.udash-body.rpt-layout` — flex row for Reports split-pane

**Step 2: Remove old per-dashboard overlay positioning CSS**

Remove the old dashboard-specific overlay rules:
- `.comp-dash` position:fixed overlay (line ~449)
- `.budr-dash` position:fixed overlay (line ~482)
- `.gov-dash` position:fixed overlay (line ~541)
- `.rpt-builder` position:fixed overlay (line ~637)
- `.fw-dash` position:fixed overlay (line ~312)

Keep ALL inner styling (.comp-body, .budr-card, .budr-pill, .gov-tier-badge, etc.) — only remove the top-level overlay positioning. Inner element class names are unchanged.

**Step 3: Verify CSS**

Search for `.udash{` — should find the new rules. The old `.comp-dash{position:fixed` etc. should be gone.

---

## Task 3: Add Tab Registry and Core Shell Logic

**Files:**
- Modify: `/Users/schylerryan/Desktop/aws_mapper/index.html` — JS section

**Step 1: Replace _DASH_REGISTRY with tab registry**

Find the old `_DASH_REGISTRY` (line ~17772) and `_initDashNav` function (line ~17778). Replace the entire block (lines 17772–17805, including the patched wrapper functions) with a `_UDASH_TABS` array containing 6 tab objects:

Each tab has: `{id, label, color, icon, prereq(), render()}`

- classification: prereq runs classification engine if needed, render calls _renderClassificationTab
- iam: prereq prepares IAM data, render calls _renderIAMTab
- compliance: prereq checks _rlCtx exists, render calls _renderCompDash
- firewall: prereq checks _rlCtx, render calls _renderFirewallTab
- budr: prereq runs runBUDRChecks if needed, render calls _renderBUDRDash
- reports: prereq always true, render calls _renderReportsTab

Add `_udashTab = null` state variable.

**Step 2: Add openUnifiedDash(tabId) function**

1. Find tab in registry
2. Call tab.prereq() — return if false
3. Set _udashTab = tabId
4. Add .open class to #udash element
5. Force reflow via el.offsetHeight
6. Render tab header (call _renderUdashTabs)
7. Call tab.render()

**Step 3: Add _switchUdashTab(tabId) function**

1. If tabId === current, return
2. Call tab.prereq() — return if false
3. Update _udashTab
4. Re-render tab buttons
5. Clear shared toolbar/body/footer
6. Reset udashBody className (remove rpt-layout if present)
7. Restore toolbar display (in case reports hid it)
8. Call tab.render()

**Step 4: Add _renderUdashTabs() function**

Renders 6 tab buttons into #udashTabs. Each button:
- Has .active class if it matches _udashTab
- Sets --tab-color CSS custom property to the tab's color
- Shows icon + label
- On click calls _switchUdashTab(tabId)

**Step 5: Add close handler**

udashClose click: remove .open from #udash, set _udashTab = null.

**Step 6: Verify**

Search for _UDASH_TABS — should exist. Search for _DASH_REGISTRY — should NOT exist. Search for _initDashNav — should NOT exist.

---

## Task 4: Retarget Classification Tab Render

**Files:**
- Modify: `/Users/schylerryan/Desktop/aws_mapper/index.html` — _renderClassificationTab() function (line ~18029)

**Step 1: Change element ID references**

In _renderClassificationTab(), replace all governance-specific element IDs:

- `getElementById('govToolbar')` → `getElementById('udashToolbar')`
- `getElementById('govBody')` → `getElementById('udashBody')`
- `getElementById('govFooter')` → `getElementById('udashFooter')`
- `getElementById('govSearch')` → `getElementById('udashSearch')`
- `getElementById('govFilter')` → `getElementById('udashFilter')`

Also update the toolbar HTML template strings to use the new IDs for the input/select elements.

**Step 2: Update event listeners inside function**

The toolbar rebuild guard `if(_govToolbarTab!=='classification')` stays — it controls whether toolbar HTML needs rebuilding. But update all IDs referenced in the toolbar HTML and the event listeners attached after it.

**Step 3: Verify**

Search for `govToolbar` and `govBody` in JS — should have 0 getElementById hits. `udashToolbar` should appear in classification render function.

---

## Task 5: Retarget IAM Tab Render

**Files:**
- Modify: `/Users/schylerryan/Desktop/aws_mapper/index.html` — _renderIAMTab() function (line ~18162)

**Step 1: Same ID replacement pattern as Task 4**

Replace getElementById calls:
- govToolbar → udashToolbar
- govBody → udashBody
- govFooter → udashFooter

The IAM tab toolbar has its own input IDs — keep them unique per-tab since Classification and IAM share _govDashState but have different toolbar layouts.

**Step 2: Verify**

Search within _renderIAMTab for any remaining govToolbar, govBody, govFooter references — should be zero.

---

## Task 6: Retarget Compliance Render

**Files:**
- Modify: `/Users/schylerryan/Desktop/aws_mapper/index.html` — `_renderCompDash()` (line ~4694) and `renderCompliancePanel()` (line ~4684)

**Step 1: Simplify renderCompliancePanel**

renderCompliancePanel currently: resets state, closes other dashboards, opens compDash, renders. Rewrite as thin wrapper:
- Store findings in _complianceFindings
- Reset _compDashState
- If already on compliance tab, just re-render; else call openUnifiedDash('compliance')

**Step 2: Retarget _renderCompDash element IDs**

The compliance toolbar was partly static HTML in the old compDash div. Since that HTML is gone, _renderCompDash needs to generate the full toolbar (search input, framework select, sort select, show-muted checkbox, executive summary button, severity pills, view toggle) into udashToolbar.

Replace:
- compBody → udashBody
- compFooter → udashFooter
- compSevPills, compSearch, compFwFilter, compSort, compShowMuted, compViewToggle → new IDs rendered into toolbar

**Step 3: Move compliance toolbar event listeners into render**

Remove the static event listener attachments (~lines 17810–17822 for compSearch, compFwFilter, etc.). These get recreated inside _renderCompDash after toolbar HTML injection — same pattern _renderClassificationTab uses with _govToolbarTab guard.

**Step 4: Handle compExecSummary**

The executive summary div was a child of compDash. Now render it as part of the body content, toggled by a state flag.

**Step 5: Verify**

Search for getElementById('compDash') — should be zero. Only _compDashState variable name should remain.

---

## Task 7: Retarget Firewall Render

**Files:**
- Modify: `/Users/schylerryan/Desktop/aws_mapper/index.html` — openFirewallDash() (line ~14069), _fwDashRender() (line ~14106)

**Step 1: Create _renderFirewallTab() wrapper**

openFirewallDash currently both opens overlay AND builds toolbar HTML. Split into:
- openFirewallDash() → just calls openUnifiedDash('firewall')
- _renderFirewallTab() → new function that builds toolbar into udashToolbar + calls _fwDashRender()

**Step 2: Convert firewall to state-driven**

IMPORTANT: _fwDashRender reads filter state from live DOM (fwDashSearch, fwDashVpcFilter, fwDashSort, fwDashEditsOnly). Add a state object:
```
let _fwDashState = {search:'', vpcFilter:'all', sort:'type', editsOnly:false};
```
Wire toolbar inputs to update _fwDashState + call _fwDashRender(). In _fwDashRender, read from state instead of DOM.

**Step 3: Retarget _fwDashRender element IDs**

- fwDashBody → udashBody
- fwDashFooter → udashFooter
- fwDashPills → render into toolbar

**Step 4: Remove closeFirewallDash and old close handlers**

Replaced by unified close. Remove closeFirewallDash() and all references.

**Step 5: Remove old static event listeners**

Listeners attached to fwDashSearch, fwDashSort etc. on static HTML — remove. Now created inside _renderFirewallTab.

**Step 6: Verify**

Search for getElementById('fwDash') — should have 0 calls. _fwDashState should exist.

---

## Task 8: Retarget BUDR Render

**Files:**
- Modify: `/Users/schylerryan/Desktop/aws_mapper/index.html` — openBUDRDash() (line ~17831), _renderBUDRDash() (line ~17844)

**Step 1: Simplify openBUDRDash**

openBUDRDash → just calls openUnifiedDash('budr'). Prerequisites are in the tab registry prereq function.

**Step 2: Retarget _renderBUDRDash element IDs**

Since the old budrDash div with its static toolbar/pills/footer is gone, _renderBUDRDash needs to:
- Generate toolbar HTML (search input + sort select + tier pills) into udashToolbar
- Render body content into udashBody
- Generate footer (export buttons) into udashFooter

**Step 3: Move BUDR toolbar event listeners into render**

Remove static listeners (line ~17808-17809 for budrSearch, budrSort). Recreate inside _renderBUDRDash after toolbar HTML injection.

**Step 4: Verify**

Search for getElementById('budrDash') — should be 0.

---

## Task 9: Retarget Reports Render

**Files:**
- Modify: `/Users/schylerryan/Desktop/aws_mapper/index.html` — openReportBuilder() (line ~18587), _renderRptPicker(), _renderRptPreview()

**Step 1: Create _renderReportsTab() wrapper**

Reports has a special split-pane layout. The function should:
- Hide toolbar (set display:none)
- Add 'rpt-layout' class to udashBody
- Generate the picker + preview HTML into udashBody
- Generate export buttons into udashFooter
- Set date default
- Call _renderRptPicker() and _renderRptPreview()
- Wire logo upload, module toggle, export button handlers

**Step 2: Move report event wiring into reusable function**

Extract logo upload, module toggle, export handlers from openReportBuilder into a _wireReportEvents() function called after HTML injection.

**Step 3: Retarget _renderRptPicker and _renderRptPreview**

These reference rptPresets, rptModules, rptPreviewContent which are dynamically created. Should work unchanged if called after HTML is injected.

**Step 4: Handle toolbar visibility on tab switch**

In _switchUdashTab, always restore toolbar display before rendering new tab.

**Step 5: Verify**

openReportBuilder should just call openUnifiedDash('reports'). Split-pane layout renders inside udashBody.

---

## Task 10: Update Dock Buttons and Keyboard Shortcuts

**Files:**
- Modify: `/Users/schylerryan/Desktop/aws_mapper/index.html` — dock button listeners and keyboard handler

**Step 1: Update dock button listeners**

Change each dock button's click handler:
- govBtn → openUnifiedDash('classification')
- compDashBtn → openUnifiedDash('compliance')
- budrBtn → openUnifiedDash('budr')
- reportsBtn → openUnifiedDash('reports')
- firewallBtn → openUnifiedDash('firewall')

**Step 2: Update keyboard shortcuts (line ~24411–24417)**

Replace Shift+key handlers to open/close unified dashboard on the correct tab. If already open on that tab, close; otherwise open on that tab.

**Step 3: Update Esc handler (line ~24370–24396)**

Replace per-dashboard Esc checks with single unified check:
If #udash has .open class, remove it and set _udashTab=null, return.
Remove individual checks for fwDash, rptBuilder, govDash, budrDash, compDash.

**Step 4: Verify**

Press Shift+G → unified dashboard opens on Classification tab. Shift+B → BUDR. Esc closes. Dock buttons work.

---

## Task 11: Remove Dead Code

**Files:**
- Modify: `/Users/schylerryan/Desktop/aws_mapper/index.html`

**Step 1: Remove _closeAllDashboards and _closeAllDashboardsExcept**

These functions (line ~2273 and ~17993) close individual dashboard divs. With single overlay, unnecessary. Remove both.

**Step 2: Remove all calls to these functions**

Search and remove all call sites.

**Step 3: Simplify openGovernanceDashboard**

Replace with thin wrapper that sets _govDashState.tab and calls openUnifiedDash.

**Step 4: Remove old close handlers**

Remove individual close button listeners: compDashClose, budrClose, govDashClose, rptClose, fwDashClose. These HTML elements no longer exist.

**Step 5: Remove governance internal tab nav handlers**

The data-gov-tab button click handlers are gone — Classification and IAM are top-level unified tabs.

**Step 6: Remove _renderGovDash**

This function dispatched to _renderClassificationTab or _renderIAMTab. Now the unified tab system calls them directly.

**Step 7: Verify**

Search for _closeAllDashboards, _initDashNav, _DASH_REGISTRY, _renderGovDash — all gone or minimal.

---

## Task 12: Enhanced BUDR Signals — RDS

**Files:**
- Modify: `/Users/schylerryan/Desktop/aws_mapper/index.html` — runBUDRChecks() (line ~3441) and _BUDR_RTO_RPO (line ~3417)

**Step 1: Add new BUDR profile for Aurora**

Add `rds_aurora` entry to _BUDR_RTO_RPO: tier 'protected', rto '<30s', rpo '<5min (PITR)', strategy 'hot'

**Step 2: Enhance RDS assessment**

In the RDS forEach block, add new signal checks:
- DeletionProtection: if false, push MEDIUM finding BUDR-DEL-1
- ReadReplicaDBInstanceIdentifiers.length: DR signal
- ReadReplicaSourceDBInstanceIdentifier: if present, skip (this is a replica)
- LatestRestorableTime: PITR active signal
- Engine.startsWith('aurora'): upgrade to rds_aurora profile

Add all new signals to the assessment push.

**Step 3: Verify**

Load data with Aurora or RDS with deletion protection off → BUDR shows new signals and findings.

---

## Task 13: Enhanced BUDR Signals — S3

**Files:**
- Modify: `/Users/schylerryan/Desktop/aws_mapper/index.html` — runBUDRChecks() and _BUDR_RTO_RPO

**Step 1: Add S3 profiles**

Add to _BUDR_RTO_RPO:
- s3_versioned: tier 'protected', rpo '0 (versioned)'
- s3_unversioned: tier 'at_risk', rpo 'Unrecoverable'
- s3_mfa_delete: tier 'protected', rpo '0 (immutable)'

**Step 2: Add S3 assessment block in runBUDRChecks**

After EBS volumes block, add S3 bucket iteration:
- Check Versioning.Status === 'Enabled'
- Check Versioning.MFADelete === 'Enabled'
- Assign profile based on versioning state
- Push HIGH finding if unversioned
- Push assessment with Versioned and MFADelete signals

**Step 3: Verify**

If S3 data exists in export, BUDR tab shows S3 entries with versioning signals.

---

## Task 14: Enhanced BUDR Signals — EC2 Snapshot Age + ElastiCache Failover

**Files:**
- Modify: `/Users/schylerryan/Desktop/aws_mapper/index.html` — runBUDRChecks()

**Step 1: Add EC2 snapshot age check**

In EC2 forEach block, after hasSnaps check: find the newest snapshot date across all volumes. If older than 7 days, push MEDIUM finding BUDR-AGE-1. Also add Encrypted signal from EBS volume data.

**Step 2: Add ElastiCache automatic failover check**

Check ec.AutomaticFailover === 'enabled'. Add AutoFailover signal. If auto-failover AND multi-node, upgrade tier to protected.

**Step 3: Verify**

Old snapshots generate age findings. ElastiCache with auto-failover gets better tier.

---

## Task 15: Signal Badges in BUDR Table

**Files:**
- Modify: `/Users/schylerryan/Desktop/aws_mapper/index.html` — _renderBUDRDash() function

**Step 1: Add signal badge rendering**

In the BUDR resource card rendering, after the resource header (name, type, RTO/RPO), add a row of inline colored badges for each signal. Green check for true/positive signals, red X for false/bad signals, yellow ! for warnings.

**Step 2: Add badge CSS**

Add .budr-sig-badge inline-block styling with border, small font, border-radius. Add .budr-signals flex-wrap container.

**Step 3: Verify**

BUDR tab resources show colored signal badges.

---

## Task 16: Add Account Labels to Search Results

**Files:**
- Modify: `/Users/schylerryan/Desktop/aws_mapper/index.html` — search input handler (line ~12014) and mergeContexts()

**Step 1: Tag resources with account labels during merge**

In mergeContexts(), when concatenating arrays from multiple account contexts, tag each item with `_acctLabel` from its source context.

**Step 2: Pass account label through search result builder**

Update the `add()` helper to capture account label. Pass `item._acctLabel` for each resource type in the search handler.

**Step 3: Display account label in search result rows**

Add a small muted tag after the resource extra info showing the account label. Only show when in multi-account mode (_accountContexts.length > 1).

**Step 4: Verify**

Load multi-account data → press / to search → results show account label.

---

## Task 17: Bug Fix — Private Subnet Text Labels (Zoom-to-Fit Sub-Pixel)

**Files:**
- Modify: `/Users/schylerryan/Desktop/aws_mapper/index.html` — zoom-to-fit (line ~6935) and resource text (line ~11119)

**Root Cause (confirmed by debugger agent):** Auto zoom-to-fit (line 11678) fires after every grid render. For large multi-account datasets with 10+ VPCs, the content width grows to 7000-10000px. The zoom-to-fit formula `0.92 / max(contentW/viewW, contentH/viewH)` calculates scales like 0.10-0.15, which makes 6.5px resource text render at sub-pixel sizes (0.65-1px = invisible). Resource BOXES (70x26px) remain visible as tiny colored rectangles. This is NOT specific to private subnets — it's more noticeable there because production architectures pack more resources into private subnets.

**Step 1: Clamp zoom-to-fit minimum scale**

In the zoom-to-fit function (line ~6939), change:
```
const s = pad / Math.max(b.width / W, b.height / H);
```
to:
```
const s = Math.max(0.25, pad / Math.max(b.width / W, b.height / H));
```

This ensures zoom-to-fit never goes below 25%, keeping 6.5px text at 1.63px minimum (readable). Users can still manually zoom out further.

**Step 2: Bump base font sizes for resource labels**

At line ~11120, increase resource name from 6.5px to 8px:
- Name: `calc(6.5px * var(--txt-scale,1))` → `calc(8px * var(--txt-scale,1))`
- IP text (line ~11125): 5.5px → 7px
- Type badge (line ~11112): 6px → 7.5px
- Child text (lines ~11141,11144): 4.5px → 6px

**Step 3: Verify**

Load multi-account data with 10+ VPCs → zoom-to-fit shows readable text on all resources in all subnets.

---

## Task 18: Bug Fix — ENI Mapping in Multi-Account View (Stale Textareas)

**Files:**
- Modify: `/Users/schylerryan/Desktop/aws_mapper/index.html` — `_remergeAndRender()` (line ~12743)

**Root Cause (confirmed by debugger agent):** In `_remergeAndRender()`, the merged textareas are applied at line 12772-12774:
```
document.querySelectorAll('.ji').forEach(el=>{
  if(mergedTA[el.id]){el.value=mergedTA[el.id];el.className='ji valid'}
});
```
When account A has ENI data (`in_enis`) and account B does not, hiding account A leaves `mergedTA['in_enis']` as undefined. The `if(mergedTA[el.id])` check SKIPS the textarea, so it **retains account A's stale ENI data**. Then `renderMap()` → `_renderMapInner()` re-parses all textareas from DOM (line 9737), builds `eniBySub` from the stale data (line 9881), and overwrites `_rlCtx`. This affects ALL resource types, not just ENIs.

**Step 1: Clear textareas not present in merged data**

At line 12772-12774, add an else branch to clear textareas:

Before:
```
document.querySelectorAll('.ji').forEach(el=>{
  if(mergedTA[el.id]){el.value=mergedTA[el.id];el.className='ji valid'}
});
```

After:
```
document.querySelectorAll('.ji').forEach(el=>{
  if(mergedTA[el.id]){el.value=mergedTA[el.id];el.className='ji valid'}
  else{el.value='';el.className='ji'}
});
```

This ensures when an account is hidden, any textarea whose data came exclusively from that account is properly emptied.

**Step 2: Verify**

Load multi-account data → toggle one account off → ENIs (and all other resources) update correctly, no stale data from hidden account.

---

## Task 19: Demo Data Multi-Account Support

**Files:**
- Modify: `/Users/schylerryan/Desktop/aws_mapper/index.html` — demo data generator (line ~24429+)

**Step 1: Generate two account contexts**

Modify demo generator to create 2 separate datasets:
- Account 1: "prod-account" (111122223333) — main VPC, public/private subnets, EC2, RDS, ALB
- Account 2: "dev-account" (444455556666) — smaller VPC, Lambda, ElastiCache

**Step 2: Auto-enter multi-account mode**

After generating both, call addAccountContext for each and enter multi-account view.

**Step 3: Verify**

Demo button → map shows 2 accounts with colored stripes. Merge banner shows 2 chips. All dashboards work.

---

## Execution Order

**Foundation (do first):** Tasks 1 → 2 → 3

**Retarget tabs (sequential):** Tasks 4 → 5 → 6 → 7 → 8 → 9

**Entry points + cleanup:** Tasks 10 → 11

**BUDR enhancements:** Tasks 12 → 13 → 14 → 15

**Independent tasks (any order):** Tasks 16, 17, 18, 19

Test after each task — the app should not crash even if not all tabs work yet.
