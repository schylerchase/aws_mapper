# Multi-Profile Export & Import

**Date:** 2026-02-19
**Status:** Approved

## Problem

The export scripts support only a single AWS profile per invocation. Users with multiple accounts (prod, staging, dev) must run the script repeatedly and manually manage output folders. The mapper has no way to auto-detect profile-level folder structure on import.

## Design Decisions

1. **PowerShell gets multi-profile** (`-Profiles prod,staging,dev`); bash gets `-a` (AllRegions) parity only — no multi-profile for bash since PowerShell already covers it.
2. **Folder layout**: Profile > Region hierarchy (`prod/us-east-1/*.json`). Single-profile exports remain flat (backward compatible).
3. **Mapper auto-detects** profile folders on import — no manual per-profile import needed.

## Folder Structure

```
aws-export-multi-20260219/
  prod/
    us-east-1/
      vpcs.json
      subnets.json
      ...
    us-west-2/
      vpcs.json
      ...
  staging/
    us-east-1/
      vpcs.json
      ...
```

Single-profile + single-region stays flat:
```
aws-export-prod-20260219/
  vpcs.json
  subnets.json
  ...
```

Single-profile + AllRegions:
```
aws-export-prod-allregions-20260219/
  us-east-1/
    vpcs.json
    ...
  us-west-2/
    vpcs.json
    ...
```

## PowerShell Changes

- Add `-Profiles` parameter (comma-separated string, alias `-P`)
- Validate each profile name with existing `^[a-zA-Z0-9_-]+$` regex
- When `-Profiles` provided: loop each profile, call `Export-Region` into `$OutputDir/<profile>/<region>/` (or `$OutputDir/<profile>/` if single region)
- `-Profile` (singular) still works for backward compat — treated as single-item Profiles
- `-AllRegions` combines with `-Profiles`: each profile gets all regions

## Bash Changes

- Add `-a` flag for AllRegions
- When `-a` set: discover regions via `aws ec2 describe-regions`, loop each into `$OUTDIR/<region>/`
- Existing `-p` / `-r` flags unchanged
- No multi-profile in bash (use PowerShell for that)

## Mapper Auto-Detection

Detection logic (both Electron and browser):

1. Scan top-level directory entries
2. Classify each subdirectory:
   - Matches `regionRe` → region folder (existing behavior)
   - Does NOT match `regionRe` AND contains `.json` files or region subdirs → profile folder
3. Structure returned:
   - Only region dirs found → `{ _structure: 'multi-region', regions, files }`
   - Only profile dirs found → `{ _structure: 'multi-profile', profiles }`
   - Only flat .json files → `{ _structure: 'flat', files }`

`importFolder()` handles `'multi-profile'` by iterating profiles, calling `addAccountContext(profileName)` for each, then loading their regions/flat files into that context.

## YAGNI (Excluded)

- No interactive profile picker in mapper
- No per-profile region filtering
- No profile metadata/config files
- No cross-profile dependency mapping
