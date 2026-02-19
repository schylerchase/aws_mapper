# Multi-Region Folder Import — Design Doc

**Date:** 2026-02-19
**Status:** Approved

## Problem

The PowerShell export script (`export-aws-data.ps1 -AllRegions`) outputs a folder tree with region subfolders:

```
aws-export-prod-allregions-20260219/
  us-east-1/*.json
  us-west-2/*.json
  eu-west-1/*.json
```

The app currently imports only flat folders of JSON files. There is no way to load multi-region exports, and no visual distinction between regions beyond a subtle label inferred from subnet AZs.

## Design Decisions

### Core Insight

**Region import is architecturally identical to multi-account import.** Each region becomes a context entry in `_loadedContexts[]`, fed through the existing `addAccountContext()` → `mergeContexts()` pipeline. No new abstractions needed.

### What Already Exists

- `getVpcRegion(vpc)`: extracts region from subnet AZ data (strips trailing letter)
- Region boundary rendering: groups consecutive same-region VPCs, draws labeled boundary rects with blue fill
- `_loadedContexts[]` + `addAccountContext()` + `mergeContexts()`: multi-account context system that concatenates arrays, unions Sets, and merges lookup maps
- `.awsmap` v2.0 format: saves/loads multiple account contexts with `region` fields
- `detectAccountId(resource)`: existing pattern for tagging resources from ARN/OwnerId fields

## Architecture

### 1. Folder Import — Recursive with Region Detection

**Electron (`main.js`):**

Change `file:open-folder` IPC handler (line 142) from flat `readdirSync` to recursive. Detect region-named subdirectories and return structure metadata:

```javascript
// Returns: {files: {relPath: content}, structure: 'flat'|'multi-region', regions: ['us-east-1',...]}
```

Region subfolder regex: `/^[a-z]{2}-(north|south|east|west|central|northeast|southeast|northwest|southwest)-\d+$/`

**Browser (`index.html`):**

Add "Import Folder" button using `window.showDirectoryPicker()` (File System Access API — Chrome/Edge). Hidden if unsupported. Reconstructs folder tree recursively from directory handle.

**Both paths converge on `importFolder(files, structure)`:**

- `flat` → load as today (matchFile → textareas → renderMap)
- `multi-region` → for each region subfolder, create textarea dict via matchFile, call `addAccountContext({textareas, accountLabel: regionName, _isRegion: true}, regionName)`, then enter merge view and renderMap

> **Note:** The `_isRegion` flag lets the Accounts panel distinguish region contexts from account contexts (e.g., showing a globe icon vs user icon, grouping by type). The bash export script produces flat folders (single region) and continues to work via the `flat` path.

### 2. Resource Tagging — `_region`

New `detectRegion(resource)` function (parallel to `detectAccountId`):

1. Parse region from ARN: `arn:aws:ec2:us-east-1:123456789012:...`
2. Fallback to `AvailabilityZone` → strip trailing letter
3. Return null if undetectable

Stamp `resource._region` during parse block (alongside `_accountId`). Add to `_rlCtx`:

- `_regions` (Set of region strings)
- `_multiRegion` (boolean, true when `_regions.size > 1`)

Update `mergeContexts()` to union `_regions` Sets and derive `_multiRegion`.

### 3. Layout — Region Column Gaps

When `_multiRegion` is true, insert a `REGION_GAP` (120px) in the `cx` cursor loop when transitioning between region groups:

```javascript
const REGION_GAP = 120;
let prevRegion = null;
knownVpcs.forEach((vpc, idx) => {
  const region = getVpcRegion(vpc);
  if(prevRegion && region !== prevRegion && _multiRegion) cx += REGION_GAP;
  prevRegion = region;
  // ... existing VPC positioning unchanged ...
});
```

Upgrade region boundary visuals when `_multiRegion`:
- 1.5px border (up from 1px)
- Region label with monospace pill badge + resource count
- Subtle gradient fill

When `_multiRegion` is false: render exactly as today (no visual change).

### 4. Stats Bar — Region Chip

When `_multiRegion`, add a "N Regions" chip to the stats bar (same pattern as "N Accounts" chip at line 11531).

### 5. Save/Load

No format changes needed. The `.awsmap` v2.0 format already stores `accounts[]` with `region` fields. Each region context loaded via folder import is stored as an entry in `_loadedContexts[]` and serialized on save.

### 6. Sort Order

VPCs sorted by: `region → accountId → VpcId`. This ensures region columns are contiguous, with account stripes within each column.

## Scope Cuts (Deferred)

| Deferred | Rationale |
|----------|-----------|
| Cross-region peering line redesign | Existing U-bends work across wider gaps. Polish later |
| Global service connection lines | Text-only associations in detail panels are sufficient |
| Region-specific global service badges | Nice-to-have, not MVP |
| Geography-inspired positioning | Fun but low value for core import feature |

## Files Changed

| File | Change | ~Lines |
|------|--------|--------|
| `main.js` | Recursive folder reading in `file:open-folder` | ~20 |
| `index.html` | `importFolder()`, `detectRegion()`, browser folder button, `REGION_GAP`, `_region` tagging, `_regions`/`_multiRegion` in `_rlCtx`, region boundary upgrades | ~200 |

## User Flow

```
1. User runs: ./export-aws-data.ps1 -Profile prod -AllRegions
2. Output:    aws-export-prod-allregions-20260219/{us-east-1,us-west-2,eu-west-1}/*.json
3. User clicks: Import Folder → selects root folder
4. App detects: 3 region subfolders
5. App loads:   3 contexts into _loadedContexts[]
6. App renders: 3 region columns with 120px gaps
                Region boundary boxes labeled "us-east-1", "us-west-2", "eu-west-1"
                Stats bar shows "3 Regions" chip
                Cross-region peerings draw as wider U-bends (existing behavior)
```

## Backward Compatibility

- **Single-region flat folder** (bash script or manual): loads exactly as today, `_multiRegion=false`, no visual change
- **Multi-account without multi-region**: works as today with account color stripes
- **Multi-account + multi-region**: VPCs grouped by region first, account stripes within each column
- **All downstream features** (search, compliance, governance, flow analysis, design mode, diff, BUDR) unchanged — `_rlCtx` shape is identical with two additive fields (`_regions`, `_multiRegion`) and `_region` tags on resources
