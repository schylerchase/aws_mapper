# Executive Overview UI Overhaul — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Overhaul the Executive Overview header and bottom toolbar for better readability, grouping, and visual polish.

**Architecture:** Replace SVG header chips with a dashboard card containing larger stat cards + compliance bar. Restructure the HTML bottom toolbar into grouped dock with dividers, labels, and icons. Absorb Global Services into the header stats grid.

**Tech Stack:** D3.js (SVG rendering), inline CSS, vanilla JS — all in `index.html`

---

### Task 1: Add CSS for Grouped Dock Toolbar

**Files:**
- Modify: `index.html:70-75` (CSS section, after `.stat-chip` styles)

**Step 1: Add dock toolbar CSS classes**

Insert after the `.stat-chip b` rule (line 75):

```css
.dock-toolbar{position:absolute;bottom:12px;left:50%;transform:translateX(-50%);z-index:7;display:none;align-items:stretch;background:rgba(17,24,39,.88);border:1px solid var(--border);border-radius:12px;backdrop-filter:blur(12px);padding:6px 8px;gap:0}
.dock-group{display:flex;align-items:center;gap:4px;padding:0 10px;position:relative}
.dock-group:not(:last-child)::after{content:'';position:absolute;right:0;top:50%;transform:translateY(-50%);width:1px;height:20px;background:rgba(255,255,255,.08)}
.dock-label{position:absolute;bottom:-10px;left:50%;transform:translateX(-50%);font-family:'IBM Plex Mono',monospace;font-size:6px;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);opacity:.5;white-space:nowrap;pointer-events:none}
.dock-btn{height:28px;border-radius:6px;background:transparent;border:none;color:var(--text-secondary);font-family:'IBM Plex Mono',monospace;font-size:10px;cursor:pointer;display:flex;align-items:center;gap:4px;padding:0 10px;transition:all .15s;white-space:nowrap}
.dock-btn:hover{background:rgba(255,255,255,.06)}
.dock-btn svg{width:12px;height:12px;flex-shrink:0}
.dock-btn.green{color:var(--accent-green)}.dock-btn.green:hover{background:rgba(16,185,129,.12)}
.dock-btn.orange{color:var(--accent-orange)}.dock-btn.orange:hover{background:rgba(249,115,22,.12)}
.dock-btn.cyan{color:var(--accent-cyan)}.dock-btn.cyan:hover{background:rgba(6,182,212,.12)}
.dock-btn.mint{color:#6ee7b7}.dock-btn.mint:hover{background:rgba(110,231,183,.12)}
.dock-btn.pink{color:#f472b6}.dock-btn.pink:hover{background:rgba(244,114,182,.12)}
.dock-btn.teal{color:#22d3ee}.dock-btn.teal:hover{background:rgba(34,211,238,.12)}
.dock-btn.red{color:#ef4444}.dock-btn.red:hover{background:rgba(239,68,68,.12)}
.dock-btn.purple{color:var(--accent-purple)}.dock-btn.purple:hover{background:rgba(168,85,247,.12)}
.dock-btn.amber{color:#f59e0b}.dock-btn.amber:hover{background:rgba(245,158,11,.12)}
.dock-btn.help{width:28px;padding:0;justify-content:center;border-radius:50%;font-size:13px;font-weight:700;color:var(--accent-cyan)}
```

**Step 2: Update mobile responsive rules**

Find the existing mobile `bottomToolbar` hide rule around line 717 and ensure the dock-toolbar also hides on very small screens. Also update the existing responsive rules near lines 659-730 to reference `.dock-toolbar` instead of `#bottomToolbar` where relevant.

**Step 3: Verify CSS parses correctly**

Open `index.html` in browser, confirm no CSS errors in console.

**Step 4: Commit**

```
feat(ui): add CSS for grouped dock toolbar
```

---

### Task 2: Restructure Bottom Toolbar HTML

**Files:**
- Modify: `index.html:1082-1096` (HTML bottomToolbar div)

**Step 1: Replace the bottomToolbar div**

Replace lines 1082-1096 with the grouped dock structure. Keep all existing button IDs so JS event listeners still work:

```html
<div id="bottomToolbar" class="dock-toolbar">
  <div class="dock-group">
    <span class="dock-label">FILE</span>
    <button id="saveProjectBtn" class="dock-btn green" title="Save project to file (Ctrl+S)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>Save</button>
    <button id="loadProjectBtn" class="dock-btn orange" title="Load project from file"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>Open</button>
    <button id="scanAwsBtn" class="dock-btn amber" style="display:none" title="Scan AWS account via CLI"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/><path d="M9 12l2 2 4-4"/></svg>Scan AWS</button>
  </div>
  <div class="dock-group">
    <span class="dock-label">ANALYZE</span>
    <button id="helpBtn" class="dock-btn help" title="Help and keyboard shortcuts">?</button>
    <button id="searchBtn" class="dock-btn" title="Search resources (/)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>Search</button>
    <button id="compareBtn" class="dock-btn mint" title="Compare with another snapshot (Shift+D)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><path d="M14 3h7v7M3 14h7v7"/></svg>Compare</button>
    <button id="timelineBtn" class="dock-btn cyan" title="Snapshot timeline (H)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>History</button>
  </div>
  <div class="dock-group">
    <span class="dock-label">NETWORK</span>
    <button id="traceBtn" class="dock-btn pink" title="Trace from a subnet -- click a subnet to start"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="5" cy="12" r="2"/><circle cx="19" cy="12" r="2"/><path d="M7 12h10"/><path d="M15 8l4 4-4 4"/></svg>Trace</button>
    <button id="flowBtn" class="dock-btn teal" title="Trace traffic flow (Shift+T)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>Flow</button>
    <button id="firewallBtn" class="dock-btn red" title="Open firewall editor (F)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>Firewall</button>
  </div>
  <div class="dock-group">
    <span class="dock-label">VIEW</span>
    <button id="notesBtn" class="dock-btn orange" title="Annotations and notes (N)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>Notes</button>
    <button id="accountsBtn" class="dock-btn purple" title="Multi-account view (Shift+A)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>Accounts</button>
  </div>
</div>
```

**Step 2: Remove old inline styles**

The old `#bottomToolbar` had inline `style=` on every element. The new version uses CSS classes instead. Verify no JS references depend on inline style values.

**Step 3: Verify button IDs preserved**

Check that all existing `addEventListener` calls for these button IDs still work. The IDs are: `saveProjectBtn`, `loadProjectBtn`, `scanAwsBtn`, `helpBtn`, `searchBtn`, `compareBtn`, `timelineBtn`, `traceBtn`, `flowBtn`, `firewallBtn`, `notesBtn`, `accountsBtn`.

**Step 4: Test in browser**

Open `index.html`, load demo data, render map. Confirm bottom toolbar appears grouped with dividers and labels.

**Step 5: Commit**

```
feat(ui): restructure bottom toolbar as grouped dock with icons
```

---

### Task 3: Rewrite Executive Overview Header

**Files:**
- Modify: `index.html:7021-7057` (JS in `renderExecutiveOverview()`)

**Step 1: Replace the header rendering code**

Replace the existing `hdrG` group (lines 7021-7057) with a dashboard header card. The new code should:

1. Create a background rect with `rgba(17,24,39,.85)`, `rx=8`, `stroke=var(--border)`
2. Add "Executive Overview" title at 14px bold
3. Add region label (from first VPC's region or 'Multi-Region') right-aligned at 10px
4. Render stat cards as a grid of ~60x40 mini-cards with:
   - Colored left border (3px rect)
   - Count (12px bold, colored)
   - Label (8px muted)
   - Click handler to `openResourceList()`
   - Hover effects via mouseenter/mouseleave
5. Include Global Services counts (S3, R53, CloudFront, TGW, VPN, Peering, Snapshots, WAF) in the same stat grid — they are currently in the separate Global Services section
6. Add compliance score bar at bottom of card

**Step 2: Calculate compliance score**

Use `runComplianceChecks(_rlCtx)` to get findings, then compute pass rate. The compliance checks return an array of findings (failures). Need to compute total checks vs failures for a percentage. Use a simplified approach: `score = Math.max(0, 100 - findings.length)` capped at 0-100, or calculate based on severity weights.

Reference existing logic: findings are the FAILED checks. The total number of possible checks isn't tracked, so use findings count as a severity indicator:
- 0 findings = 100% (green)
- 1-10 = high (green-ish)
- 10-50 = medium (yellow)
- 50+ = needs attention (orange/red)

Display as: `Compliance: N findings` with a colored bar segment.

**Step 3: Adjust `startY` for VPC cards**

The header card will be taller than the old title+chips. Adjust the `startY` variable so VPC cards render below the new header. Currently `startY` is around 80. Increase to ~140 to accommodate the taller header.

**Step 4: Test in browser**

Load demo data, select Executive Overview layout, render. Confirm header card renders with all stat cards, region label, and compliance bar.

**Step 5: Commit**

```
feat(ui): add dashboard header card to executive overview
```

---

### Task 4: Remove Global Services Section from Executive Overview

**Files:**
- Modify: `index.html:7059-7094` (JS in `renderExecutiveOverview()`)

**Step 1: Remove the Global Services rendering block**

Delete the code block from line 7059 (`const lastRow=...`) through line 7094 (end of `sharedCard` calls). This section renders the "Global Services" label and S3/R53/CloudFront/TGW/VPN/Peering/Snapshot/WAF cards as a separate SVG section below VPCs.

These counts are now in the header stat grid (Task 3), so this section is redundant.

**Step 2: Verify no references to sharedCard or sharedY outside this block**

Search for `sharedCard` and `sharedY` usage. They should only exist within `renderExecutiveOverview()`.

**Step 3: Test in browser**

Render Executive Overview. Confirm:
- No "Global Services" section below VPCs
- All those resource counts appear in the header card instead
- VPC cards still render correctly

**Step 4: Commit**

```
refactor(ui): absorb global services into header, remove separate section
```

---

### Task 5: Polish and Edge Cases

**Files:**
- Modify: `index.html` (CSS + JS various locations)

**Step 1: Handle mobile/tablet responsive rules**

Update the mobile CSS rules (around lines 717-730) to handle the dock toolbar:
- On small screens (<768px), hide dock labels, reduce button padding
- On very small screens (<480px), the dock toolbar is already `display:none !important` via existing mobile rules for `#bottomToolbar`

**Step 2: Handle detail panel offset**

The export bar shifts right when detail panel is open (line 72). Ensure the dock toolbar doesn't overlap with the detail panel. The dock is centered via `left:50%;transform:translateX(-50%)` so it should be fine, but verify.

**Step 3: Handle design mode**

In design mode, the export bar is hidden (line 2939). The dock toolbar should remain visible. Verify `enterDesignMode()` and `exitDesignMode()` don't break the dock.

**Step 4: Test all layouts**

- Grid layout: dock toolbar visible, no header card (grid uses stats-bar instead)
- Landing Zone layout: dock toolbar visible, no header card
- Executive Overview: dock toolbar + header card both visible

**Step 5: Commit**

```
fix(ui): responsive and edge case handling for toolbar/header
```

---

### Task 6: Final Visual QA

**Step 1: Screenshot comparison**

Load demo data and render in Executive Overview. Compare before/after appearance.

**Step 2: Check hover states**

Verify all dock buttons have correct hover glow colors. Verify header stat cards highlight on hover.

**Step 3: Check click handlers**

Click each dock button — confirm Save/Open/Search/Compare/History/Trace/Flow/Firewall/Notes/Accounts all still function. Click header stat cards — confirm resource list opens.

**Step 4: Final commit**

```
feat(ui): executive overview UI overhaul complete
```
