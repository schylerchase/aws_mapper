# Multi-Profile Export & Import — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add multi-profile export to PowerShell, AllRegions to bash, and auto-detect profile folders in the mapper's import flow.

**Architecture:** Three independent changes — PowerShell script gets `-Profiles` parameter that loops `Export-Region` per profile into profile subfolders; bash script gets `-a` flag that discovers regions and loops exports into region subfolders; the mapper's import (Electron + browser) adds a third `_structure:'multi-profile'` detection path that wraps existing multi-region handling with a profile-level loop.

**Tech Stack:** PowerShell 7+, Bash, JavaScript (single-file HTML app), Electron IPC

---

## Task 1: Bash — Add `-a` (AllRegions) flag

**Files:**
- Modify: `export-aws-data.sh:17-69` (flags, usage, output dir logic)
- Modify: `export-aws-data.sh:88-161` (wrap export block in region loop)

**Step 1: Add the `-a` flag and usage update**

In `export-aws-data.sh`, add `ALL_REGIONS=""` at line 19 (after `OUTDIR=""`), update `usage()` to mention `-a`, update `getopts` to include `a`, and add the flag case:

```bash
# Line 17-37 becomes:
PROFILE=""
REGION=""
OUTDIR=""
ALL_REGIONS=""

usage() {
  echo "Usage: $0 [-p aws-profile] [-r region] [-o output-dir] [-a]"
  echo "  -p  AWS CLI profile (optional, uses default if omitted)"
  echo "  -r  AWS region (optional, uses CLI default if omitted)"
  echo "  -o  Output directory (optional, creates timestamped dir)"
  echo "  -a  Export all enabled regions into subfolders"
  exit 1
}

while getopts "p:r:o:ah" opt; do
  case $opt in
    p) PROFILE="$OPTARG" ;;
    r) REGION="$OPTARG" ;;
    o) OUTDIR="$OPTARG" ;;
    a) ALL_REGIONS="1" ;;
    h) usage ;;
    *) usage ;;
  esac
done
```

**Step 2: Add AllRegions output dir + region discovery logic**

Replace the output dir block (lines 54-69) and add region discovery. The entire main body from line 54 to end of file gets restructured:

```bash
# After validation block (line 47), replace lines 49-213 with:

# Build common AWS CLI flags (profile only — region added per-loop)
AWS_PROFILE_FLAGS=()
[ -n "$PROFILE" ] && AWS_PROFILE_FLAGS+=(--profile "$PROFILE")

# Determine output directory
if [ -z "$OUTDIR" ]; then
  TIMESTAMP=$(date +%Y%m%d-%H%M%S)
  LABEL="${PROFILE:-default}"
  if [ -n "$ALL_REGIONS" ]; then
    OUTDIR="./aws-export-${LABEL}-allregions-${TIMESTAMP}"
  else
    OUTDIR="./aws-export-${LABEL}-${TIMESTAMP}"
  fi
fi
mkdir -p "$OUTDIR"

echo "╔══════════════════════════════════════════════════════╗"
echo "║        AWS Network Mapper — Data Export              ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
echo "  Profile : ${PROFILE:-default}"
if [ -n "$ALL_REGIONS" ]; then
  echo "  Mode    : All Regions"
else
  echo "  Region  : ${REGION:-default}"
fi
echo "  Output  : $OUTDIR"
echo ""

# Helper: run an AWS CLI command, save output, report status
run() {
  local label="$1"
  local filename="$2"
  shift 2

  printf "  %-35s" "$label..."
  if output=$(aws "${AWS_FLAGS[@]}" "$@" 2>&1); then
    echo "$output" > "$CURRENT_OUTDIR/$filename"
    local size
    size=$(wc -c < "$CURRENT_OUTDIR/$filename" | tr -d ' ')
    echo "OK (${size} bytes)"
  else
    echo "SKIP (${output:0:60})"
  fi
}

# Export function for a single region
export_region() {
  local region_flags=("${AWS_PROFILE_FLAGS[@]}")
  [ -n "$1" ] && region_flags+=(--region "$1")
  AWS_FLAGS=("${region_flags[@]}")

  echo "── Network ─────────────────────────────────────────────"
  run "VPCs"                    "vpcs.json"                    ec2 describe-vpcs
  run "Subnets"                 "subnets.json"                 ec2 describe-subnets
  run "Route Tables"            "route-tables.json"            ec2 describe-route-tables
  run "Security Groups"         "security-groups.json"         ec2 describe-security-groups
  run "Network ACLs"            "network-acls.json"            ec2 describe-network-acls
  run "ENIs"                    "network-interfaces.json"      ec2 describe-network-interfaces

  echo ""
  echo "── Gateways ──────────────────────────────────────────────"
  run "Internet Gateways"       "internet-gateways.json"       ec2 describe-internet-gateways
  run "NAT Gateways"            "nat-gateways.json"            ec2 describe-nat-gateways
  run "VPC Endpoints"           "vpc-endpoints.json"           ec2 describe-vpc-endpoints

  echo ""
  echo "── Compute ───────────────────────────────────────────────"
  run "EC2 Instances"           "ec2-instances.json"           ec2 describe-instances
  run "RDS Instances"           "rds-instances.json"           rds describe-db-instances
  run "Lambda Functions"        "lambda-functions.json"        lambda list-functions
  run "ElastiCache Clusters"    "elasticache-clusters.json"    elasticache describe-cache-clusters --show-cache-node-info
  run "Redshift Clusters"       "redshift-clusters.json"       redshift describe-clusters

  echo ""
  echo "── Load Balancing ────────────────────────────────────────"
  run "ALBs / NLBs"             "load-balancers.json"          elbv2 describe-load-balancers
  run "Target Groups"           "target-groups.json"           elbv2 describe-target-groups

  echo ""
  echo "── Connectivity ──────────────────────────────────────────"
  run "VPC Peering"             "vpc-peering.json"             ec2 describe-vpc-peering-connections
  run "VPN Connections"         "vpn-connections.json"         ec2 describe-vpn-connections
  run "TGW Attachments"         "tgw-attachments.json"         ec2 describe-transit-gateway-attachments

  echo ""
  echo "── Storage ───────────────────────────────────────────────"
  run "EBS Volumes"             "volumes.json"                 ec2 describe-volumes
  run "EBS Snapshots"           "snapshots.json"               ec2 describe-snapshots --owner-ids self
  run "S3 Buckets"              "s3-buckets.json"              s3api list-buckets

  echo ""
  echo "── DNS ───────────────────────────────────────────────────"
  run "Route 53 Hosted Zones"   "hosted-zones.json"            route53 list-hosted-zones

  # Export record sets for each hosted zone
  if [ -f "$CURRENT_OUTDIR/hosted-zones.json" ]; then
    ZONE_IDS=$(python3 -c "
import json, sys
d=json.load(open(sys.argv[1]))
for z in d.get('HostedZones',[]):
  print(z['Id'].replace('/hostedzone/',''))
" "$CURRENT_OUTDIR/hosted-zones.json" 2>/dev/null || true)

    if [ -n "$ZONE_IDS" ]; then
      echo '{"RecordSets":[]}' > "$CURRENT_OUTDIR/r53-records.json"
      for zid in $ZONE_IDS; do
        if [[ ! "$zid" =~ ^[A-Z0-9]+$ ]]; then continue; fi
        printf "  %-35s" "  Records ($zid)..."
        if aws "${AWS_FLAGS[@]}" route53 list-resource-record-sets --hosted-zone-id "$zid" > "$CURRENT_OUTDIR/_tmp_rr.json" 2>/dev/null; then
          python3 -c "
import json, sys
a=json.load(open(sys.argv[1]))
b=json.load(open(sys.argv[2]))
a['RecordSets'].extend(b.get('ResourceRecordSets',[]))
json.dump(a,open(sys.argv[1],'w'))
" "$CURRENT_OUTDIR/r53-records.json" "$CURRENT_OUTDIR/_tmp_rr.json" 2>/dev/null
          echo "OK"
        else
          echo "SKIP"
        fi
      done
      rm -f "$CURRENT_OUTDIR/_tmp_rr.json"
    fi
  fi

  echo ""
  echo "── Security ──────────────────────────────────────────────"
  run "WAF WebACLs"             "waf-web-acls.json"            wafv2 list-web-acls --scope REGIONAL
  run "CloudFront Distributions" "cloudfront.json"             cloudfront list-distributions

  echo ""
  echo "── IAM ───────────────────────────────────────────────────"
  run "IAM Authorization"       "iam.json"                     iam get-account-authorization-details

  echo ""
  echo "── ECS (multi-step) ──────────────────────────────────────"
  printf "  %-35s" "ECS Services..."
  if clusters=$(aws "${AWS_FLAGS[@]}" ecs list-clusters --query 'clusterArns[]' --output text 2>&1) && [ -n "$clusters" ] && [ "$clusters" != "None" ]; then
    echo '{"services":[]}' > "$CURRENT_OUTDIR/ecs-services.json"
    for cluster in $clusters; do
      if [[ ! "$cluster" =~ ^arn:aws ]]; then continue; fi
      svc_arns=$(aws "${AWS_FLAGS[@]}" ecs list-services --cluster "$cluster" --query 'serviceArns[]' --output text 2>/dev/null || true)
      if [ -n "$svc_arns" ] && [ "$svc_arns" != "None" ]; then
        for svc_arn in $svc_arns; do
          if [[ ! "$svc_arn" =~ ^arn:aws ]]; then continue; fi
          if aws "${AWS_FLAGS[@]}" ecs describe-services --cluster "$cluster" --services "$svc_arn" > "$CURRENT_OUTDIR/_tmp_ecs.json" 2>/dev/null; then
            python3 -c "
import json, sys
a=json.load(open(sys.argv[1]))
b=json.load(open(sys.argv[2]))
a['services'].extend(b.get('services',[]))
json.dump(a,open(sys.argv[1],'w'))
" "$CURRENT_OUTDIR/ecs-services.json" "$CURRENT_OUTDIR/_tmp_ecs.json" 2>/dev/null
          fi
        done
      fi
    done
    rm -f "$CURRENT_OUTDIR/_tmp_ecs.json"
    echo "OK"
  else
    echo "SKIP (no clusters)"
  fi
}

# ── Main dispatch ─────────────────────────────────────────────
if [ -n "$ALL_REGIONS" ]; then
  REGIONS=$(aws "${AWS_PROFILE_FLAGS[@]}" ec2 describe-regions --query 'Regions[].RegionName' --output text 2>&1)
  if [ $? -ne 0 ] || [ -z "$REGIONS" ]; then
    echo "ERROR: Failed to list regions: $REGIONS" >&2
    exit 1
  fi
  REGION_COUNT=$(echo "$REGIONS" | wc -w | tr -d ' ')
  echo "  Found $REGION_COUNT regions"
  echo ""
  IDX=0
  for REG in $REGIONS; do
    IDX=$((IDX+1))
    echo ""
    echo "┌─ Region $IDX/$REGION_COUNT: $REG ─────────────────────"
    CURRENT_OUTDIR="$OUTDIR/$REG"
    mkdir -p "$CURRENT_OUTDIR"
    export_region "$REG"
    FILE_COUNT=$(ls -1 "$CURRENT_OUTDIR"/*.json 2>/dev/null | wc -l | tr -d ' ')
    echo "└─ $FILE_COUNT files"
  done
else
  CURRENT_OUTDIR="$OUTDIR"
  export_region "$REGION"
fi

echo ""
echo "═════════════════════════════════════════════════════════"
FILE_COUNT=$(find "$OUTDIR" -name '*.json' 2>/dev/null | wc -l | tr -d ' ')
TOTAL_SIZE=$(du -sh "$OUTDIR" | cut -f1)
echo "  Done! $FILE_COUNT files exported ($TOTAL_SIZE)"
echo "  Output: $OUTDIR"
echo ""
echo "  To use: drag the folder onto the mapper's"
echo "  'UPLOAD JSON FILES' button, or open individual"
echo "  files and paste into the corresponding text areas."
echo "═════════════════════════════════════════════════════════"
```

Key changes:
- `AWS_FLAGS` is now set per-region inside `export_region()`, not globally
- `CURRENT_OUTDIR` is set before calling `export_region()` — the `run()` helper and R53/ECS blocks use it
- `export_region()` takes an optional region name arg — empty for default region
- AllRegions branch discovers regions, loops, creates `$OUTDIR/$REG/` per region
- Summary uses `find` for recursive file count (works with nested dirs)

**Step 3: Verify script syntax**

Run: `bash -n export-aws-data.sh`
Expected: No output (clean parse)

**Step 4: Commit**

```
feat(bash): add -a AllRegions flag to export script
```

---

## Task 2: PowerShell — Add `-Profiles` parameter

**Files:**
- Modify: `export-aws-data.ps1:26-32` (param block)
- Modify: `export-aws-data.ps1:36-44` (validation)
- Modify: `export-aws-data.ps1:243-304` (main dispatch)

**Step 1: Add `-Profiles` parameter and validation**

Update param block (lines 26-32):

```powershell
param(
    [Alias("p")][string]$Profile,
    [Alias("r")][string]$Region,
    [Alias("o")][string]$OutputDir,
    [switch]$AllRegions,
    [Alias("P")][string]$Profiles,
    [int]$MaxParallel = 6
)
```

Update validation block (after line 44), add:

```powershell
# Parse -Profiles into array, merge with -Profile for backward compat
$profileList = @()
if ($Profiles) {
    $profileList = $Profiles -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ }
    foreach ($p in $profileList) {
        if ($p -notmatch '^[a-zA-Z0-9_-]+$') {
            Write-Error "Invalid profile name '$p'. Use only letters, numbers, hyphens, underscores."
            exit 1
        }
    }
}
if ($Profile -and $profileList.Count -eq 0) {
    $profileList = @($Profile)
}
```

**Step 2: Add multi-profile dispatch to main block**

Replace the main block (lines 243-304) with a 3-way dispatch: multi-profile, all-regions single-profile, or single-region single-profile.

Insert a new `if ($profileList.Count -gt 1)` branch at the top of the main block (before the existing `if ($AllRegions)`):

```powershell
# ─── Main ──────────────────────────────────────────────────────
# (banner stays the same)

if ($profileList.Count -gt 1) {
    # ── Multi-Profile Mode ────────────────────────────────────
    Write-Host "  Mode    : Multi-Profile ($($profileList.Count) profiles)" -ForegroundColor Cyan
    if ($AllRegions) { Write-Host "  Regions : All Regions" -ForegroundColor Cyan }
    elseif ($Region) { Write-Host "  Region  : $Region" }
    Write-Host "  Parallel: $MaxParallel concurrent calls"

    if (-not $OutputDir) {
        $ts = Get-Date -Format "yyyyMMdd-HHmmss"
        $OutputDir = "./aws-export-multi-${ts}"
    }
    New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
    Write-Host "  Output  : $OutputDir"
    Write-Host ""

    $profIdx = 0
    foreach ($prof in $profileList) {
        $profIdx++
        $profDir = Join-Path $OutputDir $prof
        Write-Host ""
        Write-Host "  ╔═ Profile $profIdx/$($profileList.Count): $prof ════════════════════════" -ForegroundColor Magenta

        # Override profile for this iteration
        $Profile = $prof
        $awsFlags = @("--profile", $prof)

        if ($AllRegions) {
            $regRaw = & aws @awsFlags ec2 describe-regions --query 'Regions[].RegionName' --output json 2>&1
            if ($LASTEXITCODE -ne 0) {
                Write-Host "  SKIP profile $prof (failed to list regions)" -ForegroundColor Yellow
                continue
            }
            $regions = $regRaw | ConvertFrom-Json | Sort-Object
            Write-Host "  Found $($regions.Count) regions" -ForegroundColor Green

            $regionIdx = 0
            foreach ($reg in $regions) {
                $regionIdx++
                $regDir = Join-Path $profDir $reg
                Write-Host "  ┌─ Region $regionIdx/$($regions.Count): $reg ─────────" -ForegroundColor Cyan
                Export-Region -RegionName $reg -OutPath $regDir -Parallel $MaxParallel
                $fc = (Get-ChildItem -Path $regDir -Filter "*.json" -ErrorAction SilentlyContinue | Measure-Object).Count
                Write-Host "  └─ $fc files" -ForegroundColor Cyan
            }
        } else {
            Export-Region -RegionName $Region -OutPath $profDir -Parallel $MaxParallel
        }

        $profFiles = (Get-ChildItem -Path $profDir -Filter "*.json" -Recurse -ErrorAction SilentlyContinue | Measure-Object).Count
        Write-Host "  ╚═ $prof: $profFiles files ═══════════════════════════" -ForegroundColor Magenta
    }
} elseif ($AllRegions) {
    # (existing AllRegions block — unchanged except use $profileList[0] if set)
    ...
} else {
    # (existing single-region block — unchanged)
    ...
}
```

The existing `$AllRegions` and single-region blocks remain as-is. The only change is: if `$profileList` has exactly 1 entry, set `$Profile` to it before entering the existing paths (already handled by the merge logic above).

**Step 3: Update script header examples**

Add to the `.EXAMPLE` block:

```
    ./export-aws-data.ps1 -Profiles prod,staging,dev -AllRegions
    ./export-aws-data.ps1 -Profiles prod,staging -Region us-east-1
```

**Step 4: Verify script syntax**

Run: `pwsh -c "Get-Command ./export-aws-data.ps1"` (or just check it parses)

**Step 5: Commit**

```
feat(ps1): add -Profiles parameter for multi-profile export
```

---

## Task 3: Electron — Detect profile folders in `file:open-folder`

**Files:**
- Modify: `main.js:142-177` (IPC handler `file:open-folder`)

**Step 1: Add profile detection to folder scanner**

The current logic checks each top-level entry against `regionRe`. Add a third classification: directories that don't match `regionRe` but contain `.json` files or region subdirs are profile folders.

Replace `main.js` lines 148-176 with:

```javascript
  const dir = result.filePaths[0];
  const regionRe = /^[a-z]{2}-(north|south|east|west|central|northeast|southeast|northwest|southwest)-\d+$/;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const regions = {};
  const flatFiles = {};
  const profiles = {};
  const MAX_FILE_SIZE = 100 * 1024 * 1024;

  for (const ent of entries) {
    const isDir = ent.isDirectory() || ent.isSymbolicLink();
    if (isDir) {
      const subdir = path.join(dir, ent.name);
      try { if (!fs.statSync(subdir).isDirectory()) continue; } catch { continue; }

      if (regionRe.test(ent.name)) {
        // Region folder (existing behavior)
        const regionFiles = {};
        for (const f of fs.readdirSync(subdir, { withFileTypes: true })) {
          if (f.isFile() && f.name.endsWith('.json')) {
            const fp = path.join(subdir, f.name);
            try { if (fs.statSync(fp).size > MAX_FILE_SIZE) continue; } catch { continue; }
            regionFiles[f.name] = fs.readFileSync(fp, 'utf8');
          }
        }
        if (Object.keys(regionFiles).length) regions[ent.name] = regionFiles;
      } else {
        // Potential profile folder — scan for region subdirs or flat JSON
        const profRegions = {};
        const profFlat = {};
        for (const sub of fs.readdirSync(subdir, { withFileTypes: true })) {
          if ((sub.isDirectory() || sub.isSymbolicLink()) && regionRe.test(sub.name)) {
            const regDir = path.join(subdir, sub.name);
            try { if (!fs.statSync(regDir).isDirectory()) continue; } catch { continue; }
            const regFiles = {};
            for (const f of fs.readdirSync(regDir, { withFileTypes: true })) {
              if (f.isFile() && f.name.endsWith('.json')) {
                const fp = path.join(regDir, f.name);
                try { if (fs.statSync(fp).size > MAX_FILE_SIZE) continue; } catch { continue; }
                regFiles[f.name] = fs.readFileSync(fp, 'utf8');
              }
            }
            if (Object.keys(regFiles).length) profRegions[sub.name] = regFiles;
          } else if (sub.isFile() && sub.name.endsWith('.json')) {
            const fp = path.join(subdir, sub.name);
            try { if (fs.statSync(fp).size > MAX_FILE_SIZE) continue; } catch { continue; }
            profFlat[sub.name] = fs.readFileSync(fp, 'utf8');
          }
        }
        if (Object.keys(profRegions).length || Object.keys(profFlat).length) {
          profiles[ent.name] = { regions: profRegions, files: profFlat };
        }
      }
    } else if (ent.isFile() && ent.name.endsWith('.json')) {
      const fp = path.join(dir, ent.name);
      try { if (fs.statSync(fp).size > MAX_FILE_SIZE) continue; } catch { continue; }
      flatFiles[ent.name] = fs.readFileSync(fp, 'utf8');
    }
  }

  // Priority: profiles > regions > flat
  if (Object.keys(profiles).length) {
    return { _structure: 'multi-profile', profiles, files: flatFiles };
  }
  if (Object.keys(regions).length) {
    return { _structure: 'multi-region', regions, files: flatFiles };
  }
  return { _structure: 'flat', files: flatFiles };
```

**Step 2: Commit**

```
feat(electron): detect profile folders in folder import
```

---

## Task 4: Browser — Detect profile folders in File System Access API

**Files:**
- Modify: `index.html:11884-11909` (browser folder import click handler)

**Step 1: Add profile detection to browser folder scanner**

Replace the inner logic of the `showDirectoryPicker` handler (lines 11884-11906):

```javascript
      const dirHandle=await window.showDirectoryPicker({mode:'read'});
      const regionRe=/^[a-z]{2}-(north|south|east|west|central|northeast|southeast|northwest|southwest)-\d+$/;
      const regions={},flatFiles={},profiles={};
      for await(const [name,handle] of dirHandle.entries()){
        if(handle.kind==='directory'){
          if(regionRe.test(name)){
            const regionFiles={};
            for await(const [fname,fhandle] of handle.entries()){
              if(fhandle.kind==='file'&&fname.endsWith('.json')){
                const file=await fhandle.getFile();
                regionFiles[fname]=await file.text();
              }
            }
            if(Object.keys(regionFiles).length)regions[name]=regionFiles;
          }else{
            // Potential profile folder
            const profRegions={},profFlat={};
            for await(const [subName,subHandle] of handle.entries()){
              if(subHandle.kind==='directory'&&regionRe.test(subName)){
                const regFiles={};
                for await(const [fname,fhandle] of subHandle.entries()){
                  if(fhandle.kind==='file'&&fname.endsWith('.json')){
                    const file=await fhandle.getFile();
                    regFiles[fname]=await file.text();
                  }
                }
                if(Object.keys(regFiles).length)profRegions[subName]=regFiles;
              }else if(subHandle.kind==='file'&&subName.endsWith('.json')){
                const file=await subHandle.getFile();
                profFlat[subName]=await file.text();
              }
            }
            if(Object.keys(profRegions).length||Object.keys(profFlat).length){
              profiles[name]={regions:profRegions,files:profFlat};
            }
          }
        }else if(handle.kind==='file'&&name.endsWith('.json')){
          const file=await handle.getFile();
          flatFiles[name]=await file.text();
        }
      }
      if(Object.keys(profiles).length){
        importFolder({_structure:'multi-profile',profiles,files:flatFiles});
      }else if(Object.keys(regions).length){
        importFolder({_structure:'multi-region',regions,files:flatFiles});
      }else{
        importFolder({_structure:'flat',files:flatFiles});
      }
```

**Step 2: Commit**

```
feat(browser): detect profile folders in folder import
```

---

## Task 5: Mapper — Handle `multi-profile` in `importFolder()`

**Files:**
- Modify: `index.html:11738-11797` (function `importFolder`)

**Step 1: Add `multi-profile` branch**

Insert after the `multi-region` branch (line 11773, before the `else` for flat structure):

```javascript
  }else if(result._structure==='multi-profile'&&result.profiles){
    const profileNames=Object.keys(result.profiles).sort();
    let totalLoaded=0;
    profileNames.forEach(profileName=>{
      const prof=result.profiles[profileName];
      const profRegions=prof.regions||{};
      const profFlat=prof.files||{};
      const regionNames=Object.keys(profRegions).sort();
      if(regionNames.length){
        // Profile has region subfolders — load each as a context
        regionNames.forEach(regionName=>{
          const regionFiles=profRegions[regionName];
          const textareas={};
          Object.entries(regionFiles).forEach(([fname,content])=>{
            try{JSON.parse(content)}catch(e){return}
            const inputId=matchFile(fname,content);
            if(inputId)textareas[inputId]=content;
          });
          if(Object.keys(textareas).length){
            addAccountContext({textareas,accountLabel:profileName+' / '+regionName,_isRegion:true},profileName+' / '+regionName);
            totalLoaded++;
          }
        });
      }else if(Object.keys(profFlat).length){
        // Profile has flat JSON files only (single-region export)
        const textareas={};
        Object.entries(profFlat).forEach(([fname,content])=>{
          try{JSON.parse(content)}catch(e){return}
          const inputId=matchFile(fname,content);
          if(inputId)textareas[inputId]=content;
        });
        if(Object.keys(textareas).length){
          addAccountContext({textareas,accountLabel:profileName},profileName);
          totalLoaded++;
        }
      }
    });
    // Load any top-level flat files (rare but possible)
    const globalFiles=result.files||{};
    Object.entries(globalFiles).forEach(([fname,content])=>{
      try{JSON.parse(content)}catch(e){return}
      const inputId=matchFile(fname,content);
      if(inputId){const el=document.getElementById(inputId);if(el){el.value=content;el.className='ji valid'}}
    });
    if(totalLoaded>0){
      if(!_multiViewMode)enterMultiView();
      else _remergeAndRender();
      _showToast(totalLoaded+' context'+(totalLoaded>1?'s':'')+' imported from '+profileNames.length+' profile'+(profileNames.length>1?'s':''));
    }else{
      _showToast('No valid data found in profile folders');
    }
  }else{
```

This replaces the existing `}else{` at line 11774. The flat-file fallback block stays the same after it.

**Step 2: Commit**

```
feat(mapper): handle multi-profile folder structure on import
```

---

## Task 6: Update README

**Files:**
- Modify: `README.md:132-149` (Export AWS Data section)

**Step 1: Update export examples**

Replace the export section with:

```markdown
### Export AWS Data

Two export scripts are included for extracting data from your AWS accounts:

**Bash** (macOS / Linux):
```bash
./export-aws-data.sh
./export-aws-data.sh -p my-profile -r us-west-2
./export-aws-data.sh -p my-profile -a              # all regions
```

**PowerShell** (Windows / Cross-platform):
```powershell
.\export-aws-data.ps1
.\export-aws-data.ps1 -Profile my-profile -Region us-west-2
.\export-aws-data.ps1 -Profile my-profile -AllRegions
.\export-aws-data.ps1 -Profiles prod,staging,dev -AllRegions
```

The `-AllRegions` flag exports all active regions into subfolders. The PowerShell `-Profiles` flag exports multiple AWS profiles into profile subfolders, each with region subfolders when combined with `-AllRegions`. The mapper auto-detects all folder structures on import.
```

**Step 2: Commit**

```
docs: update README with multi-profile and AllRegions examples
```

---

## Task 7: Manual verification

**Steps:**
1. `bash -n export-aws-data.sh` — confirm clean parse
2. Open `index.html` in browser, verify no console errors on load
3. Test folder detection logic mentally: a folder with `prod/us-east-1/*.json` should trigger `multi-profile`, a folder with `us-east-1/*.json` should trigger `multi-region`, a folder with `*.json` should trigger `flat`
4. Final commit with version bump if desired

---

## Dependency Graph

```
Task 1 (bash -a)     ─┐
Task 2 (PS -Profiles) ─┼─→ Task 6 (README) ─→ Task 7 (verify)
Task 3 (Electron)     ─┤
Task 4 (Browser)      ─┤
Task 5 (importFolder) ─┘
```

Tasks 1-5 are independent and can be done in any order or in parallel. Task 6 depends on 1+2 being done (for accurate docs). Task 7 is final.
