# Multi-Region Folder Import — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable importing multi-region AWS export folders (PowerShell `-AllRegions` output) and rendering regions as visually distinct columns.

**Architecture:** Reuse the existing multi-account context system (`_loadedContexts[]` + `addAccountContext()` + `mergeContexts()`). Each region subfolder becomes a context entry. Add `_region` tags to resources, `_regions`/`_multiRegion` to `_rlCtx`, and a 120px gap between region columns in the layout loop.

**Tech Stack:** Vanilla JS, D3.js (SVG rendering), Electron IPC (Node.js `fs`), File System Access API (browser)

**Design doc:** `docs/plans/2026-02-19-multi-region-folder-import-design.md`

---

### Task 1: `detectRegion()` Function

Add region detection for resources, mirroring the existing `detectAccountId()` pattern.

**Files:**
- Modify: `index.html` — insert after `detectAccountId()` (after line ~2166)

**Step 1: Write `detectRegion()`**

Insert immediately after the closing `}` of `detectAccountId` (line 2166):

```javascript
function detectRegion(resource){
  if(!resource)return null;
  // 1. Parse region from ARN
  const arnFields=['Arn','FunctionArn','LoadBalancerArn','TargetGroupArn','DBInstanceArn','ServiceArn','CacheClusterArn'];
  for(const f of arnFields){
    const arn=resource[f];
    if(arn&&typeof arn==='string'){const m=arn.match(/arn:aws[^:]*:[^:]+:([a-z]{2}-[a-z]+-\d+):/);if(m)return m[1]}
  }
  // 2. AvailabilityZone fallback
  const az=resource.AvailabilityZone||(resource.Placement&&resource.Placement.AvailabilityZone)||null;
  if(az&&typeof az==='string')return az.replace(/[a-z]$/,'');
  return null;
}
```

**Step 2: Verify no console errors**

Open `http://localhost:8888/index.html`, load demo data, check browser console for zero errors.

**Step 3: Commit**

```bash
git add index.html
git commit -m "feat(region): add detectRegion() function for resource region tagging"
```

---

### Task 2: Tag Resources with `_region` in Parse Block

Stamp `_region` on every resource during context building, and add `_regions`/`_multiRegion` to `_rlCtx`.

**Files:**
- Modify: `index.html` — main parse block in `_renderMapInner` (around lines 9696-9712)
- Modify: `index.html` — `_rlCtx` assignment (line 11505)
- Modify: `index.html` — `_buildRlCtxFromTextareas()` (lines 12287-12343)

**Step 1: Add `tagRegion` alongside `tagAccount` in `_renderMapInner`**

After the `tagAccount` calls (line 9704), add:

```javascript
function tagRegion(resource){
  if(!resource)return resource;
  resource._region=detectRegion(resource)||'unknown';
  return resource;
}
vpcs.forEach(tagRegion);subnets.forEach(tagRegion);igws.forEach(tagRegion);nats.forEach(tagRegion);
sgs.forEach(tagRegion);instances.forEach(tagRegion);albs.forEach(tagRegion);rdsInstances.forEach(tagRegion);
ecsServices.forEach(tagRegion);lambdaFns.forEach(tagRegion);peerings.forEach(tagRegion);
const _regions=new Set();vpcs.forEach(v=>{if(v._region&&v._region!=='unknown')_regions.add(v._region)});
const _multiRegion=_regions.size>1;
```

**Step 2: Add `_regions` and `_multiRegion` to `_rlCtx`**

At the `_rlCtx=` assignment (line 11505), append `_regions,_multiRegion` to the object.

**Step 3: Mirror in `_buildRlCtxFromTextareas()`**

After the `tagAccount` calls (line 12295), add the same `tagRegion` pattern. Add `_regions,_multiRegion` to the return object (line 12343).

**Step 4: Verify**

Load demo data, render map, check console: `_rlCtx._regions` should be a Set with 1 entry. `_rlCtx._multiRegion` should be `false`.

**Step 5: Commit**

```bash
git add index.html
git commit -m "feat(region): tag resources with _region, add _regions/_multiRegion to _rlCtx"
```

---

### Task 3: Update `mergeContexts()` for Region Support

Make the merge pipeline union `_regions` Sets and derive `_multiRegion`.

**Files:**
- Modify: `index.html` — `mergeContexts()` (lines 12358-12414)

**Step 1: Add `_regions` to merged defaults**

In the `merged` object declaration (line 12374), add after `_accounts:new Set()`:

```javascript
_regions:new Set(),_multiRegion:false
```

**Step 2: Union `_regions` in the merge loop**

After the `_accounts` merge (line 12391), add:

```javascript
if(c._regions)c._regions.forEach(r=>merged._regions.add(r));
if(ctx._isRegion&&ctx.region)merged._regions.add(ctx.region);
```

**Step 3: Derive `_multiRegion` at the end**

Before `return merged;` (line 12413), add:

```javascript
merged._multiRegion=merged._regions.size>1;
```

**Step 4: Commit**

```bash
git add index.html
git commit -m "feat(region): update mergeContexts() to union _regions sets"
```

---

### Task 4: Region Column Gaps in Layout

Insert 120px gap between region groups when `_multiRegion` is true.

**Files:**
- Modify: `index.html` — VPC positioning loop in grid layout (lines 9965-9991)

**Step 1: Add `REGION_GAP` and gap insertion**

Before the `knownVpcs.forEach` loop (line 9965), declare:

```javascript
const REGION_GAP=120;
let _prevLayoutRegion=null;
```

Inside the loop body (top of line 9966), add:

```javascript
const _vpcRegion=getVpcRegion(vpc);
if(_prevLayoutRegion&&_vpcRegion!==_prevLayoutRegion&&_multiRegion)cx+=REGION_GAP;
_prevLayoutRegion=_vpcRegion;
```

**Step 2: Verify with single-region data**

Load demo data, render map — layout should be identical to before.

**Step 3: Commit**

```bash
git add index.html
git commit -m "feat(region): add 120px gap between region columns when multi-region"
```

---

### Task 5: Upgrade Region Boundary Visuals

Make region boundaries more prominent when `_multiRegion` is true.

**Files:**
- Modify: `index.html` — region boundary rendering (lines 10884-10903)

**Step 1: Conditional styling**

Replace the `regionGroups.forEach` block. When `_multiRegion`, use thicker borders, pill badge labels with VPC count, and slightly stronger fill. When not, keep existing subtle styling unchanged.

Key changes:
- `stroke-width`: 1.5 when multi-region (up from 1)
- `fill` opacity: .08 when multi-region (up from .06)
- `stroke` opacity: .25 when multi-region (up from .15)
- Region label: centered pill badge with `region (N VPCs)` text in `#60a5fa`

**Step 2: Verify single-region is unchanged**

Load demo data, confirm the subtle label renders as before.

**Step 3: Commit**

```bash
git add index.html
git commit -m "feat(region): upgraded region boundary visuals for multi-region mode"
```

---

### Task 6: Regions Chip in Stats Bar

Show "N Regions" chip when `_multiRegion` is true.

**Files:**
- Modify: `index.html` — stats bar section (after line ~11537)

**Step 1: Add regions chip**

After the `if(_multiAccount){...}` block (line 11537), add a chip for regions using the same DOM pattern: create a `div.stat-chip` with blue styling (`border:1px solid rgba(59,130,246,.3);background:rgba(59,130,246,.08)`), text content showing region count.

**Step 2: Commit**

```bash
git add index.html
git commit -m "feat(region): add Regions chip to stats bar"
```

---

### Task 7: Electron Recursive Folder Import

Upgrade the `file:open-folder` IPC handler to detect and read region subfolders.

**Files:**
- Modify: `main.js` — `file:open-folder` handler (lines 142-156)

**Step 1: Replace the handler**

Use `readdirSync(dir, { withFileTypes: true })` to get directory entries. Check each entry: if it's a directory matching the region regex (`/^[a-z]{2}-(north|south|east|west|central|northeast|southeast|northwest|southwest)-\d+$/`), read its JSON files into a `regions[regionName]` object. If region dirs found, return `{ _structure: 'multi-region', regions }`. Otherwise return `{ _structure: 'flat', files }`.

**Step 2: Commit**

```bash
git add main.js
git commit -m "feat(region): upgrade Electron folder import to detect region subfolders"
```

---

### Task 8: `importFolder()` Function in index.html

Create the unified import function that handles both flat and multi-region structures. Update the Electron `importFolderBtn` handler to use it.

**Files:**
- Modify: `index.html` — replace Electron folder import handler (lines 11696-11719)
- Modify: `index.html` — add `importFolder()` function nearby

**Step 1: Add `importFolder()` before the Electron init block**

This function checks `result._structure`:
- `'multi-region'`: iterate `result.regions`, for each region create a textarea dict via `matchFile()`, call `addAccountContext({textareas, accountLabel: regionName, _isRegion: true}, regionName)`, then auto-enter merge view
- `'flat'` (or legacy format without `_structure`): existing behavior — iterate files, matchFile to textareas, renderMap

**Step 2: Update Electron `importFolderBtn` handler**

Replace handler body with: `const result=await window.electronAPI.openFolder(); importFolder(result);`

**Step 3: Verify flat folder import still works**

Import a flat folder of JSON files — should load exactly as before.

**Step 4: Commit**

```bash
git add index.html
git commit -m "feat(region): add importFolder() function, update Electron handler"
```

---

### Task 9: Browser "Import Folder" Button

Add folder import for non-Electron browsers using File System Access API.

**Files:**
- Modify: `index.html` — HTML upload row (after line ~1465)
- Modify: `index.html` — add event handler in JS

**Step 1: Add button in HTML**

After the `importFolderBtn` button (line 1465), add a new button `id="importFolderBrowser"` with `display:none` and the same orange gradient styling.

**Step 2: Show button and wire handler if API available**

After the Electron init block (line 11720), check `!_isElectron && window.showDirectoryPicker`. If supported, show the button and add click handler that:
1. Calls `window.showDirectoryPicker({mode:'read'})`
2. Iterates entries: region dirs → `regions` object, flat files → `flatFiles` object
3. Calls `importFolder()` with appropriate structure

**Step 3: Verify in Chrome**

The button should appear in non-Electron Chrome. Click it — browser shows native folder picker.

**Step 4: Commit**

```bash
git add index.html
git commit -m "feat(region): add browser folder import via File System Access API"
```

---

### Task 10: Store `_isRegion` on Context and Update Accounts Panel

Make the Accounts panel distinguish region contexts from account contexts.

**Files:**
- Modify: `index.html` — `addAccountContext()` (line 12208)
- Modify: `index.html` — `_renderAccountPanel()` (line 12481)

**Step 1: Preserve `_isRegion` flag**

In `addAccountContext()`, add `_isRegion:!!(projectData._isRegion)` to the `_loadedContexts.push()` object.

**Step 2: Update panel rendering**

In `_renderAccountPanel()`, use a globe indicator for region contexts vs existing user indicator for accounts. Adjust accent color to blue for regions.

**Step 3: Commit**

```bash
git add index.html
git commit -m "feat(region): distinguish region vs account contexts in Accounts panel"
```

---

### Task 11: VPC Sort Order — Region First

Ensure VPCs are sorted `region -> accountId -> VpcId` for consistent column grouping.

**Files:**
- Modify: `index.html` — VPC sort in grid layout (line 9930)

**Step 1: Update sort**

Replace the existing `knownVpcs.sort()` with a three-level comparison:
1. `getVpcRegion(a).localeCompare(getVpcRegion(b))` — region first
2. `(a._accountId||'').localeCompare(b._accountId||'')` — account second
3. `(a.VpcId||'').localeCompare(b.VpcId||'')` — VpcId third

**Step 2: Commit**

```bash
git add index.html
git commit -m "feat(region): sort VPCs by region then accountId then VpcId"
```

---

### Task 12: End-to-End Test

Create a test folder structure and verify the full flow.

**Step 1: Create test multi-region folder**

```bash
mkdir -p /tmp/aws-test-multiregion/us-east-1
mkdir -p /tmp/aws-test-multiregion/us-west-2
```

Create minimal VPC/subnet JSON in each with different AZs (us-east-1a, us-west-2a).

**Step 2: Test in browser**

1. Open app, click "Import Folder", select the test folder
2. Verify: 2 region columns with gap, pill badge labels, "2 Regions" chip
3. Verify: Accounts panel shows 2 region entries with globe indicators

**Step 3: Test backward compat**

1. Load demo data — verify no visual change
2. Import a flat folder — verify works as before
3. Save as .awsmap, reload — verify regions persist

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat(region): multi-region folder import complete"
```

---

## Summary

| Task | What | ~Lines |
|------|------|--------|
| 1 | `detectRegion()` function | ~12 |
| 2 | Resource `_region` tagging + `_rlCtx` fields | ~15 |
| 3 | `mergeContexts()` region support | ~5 |
| 4 | Region column gaps (120px) | ~5 |
| 5 | Upgraded region boundary visuals | ~25 |
| 6 | Regions stat chip | ~8 |
| 7 | Electron recursive folder import | ~30 |
| 8 | `importFolder()` function | ~50 |
| 9 | Browser folder import button | ~30 |
| 10 | `_isRegion` in Accounts panel | ~10 |
| 11 | VPC sort order | ~5 |
| 12 | End-to-end test | Manual |
| **Total** | | **~195 lines** |
