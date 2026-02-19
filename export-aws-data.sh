#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# AWS Network Mapper — Data Export Script
# Exports all AWS CLI data needed for the web-based mapper tool.
# Outputs individual JSON files into a timestamped directory.
#
# Usage:
#   ./export-aws-data.sh                   # default profile + region
#   ./export-aws-data.sh -p prod -r us-west-2
#   ./export-aws-data.sh -p prod -r us-east-1 -o ./my-export
#   ./export-aws-data.sh -p prod -a         # all regions
#
# The output folder can be dragged onto the mapper's "UPLOAD JSON FILES"
# button, or files can be pasted individually into text areas.
# ─────────────────────────────────────────────────────────────────
set -euo pipefail

PROFILE=""
REGION=""
OUTDIR=""
ALL_REGIONS=""

usage() {
  echo "Usage: $0 [-p aws-profile] [-r region] [-a] [-o output-dir]"
  echo "  -p  AWS CLI profile (optional, uses default if omitted)"
  echo "  -r  AWS region (optional, uses CLI default if omitted)"
  echo "  -a  Export all regions (discovers regions via EC2 API)"
  echo "  -o  Output directory (optional, creates timestamped dir)"
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

# Validate inputs — only allow safe characters
if [[ -n "$PROFILE" && ! "$PROFILE" =~ ^[a-zA-Z0-9_-]+$ ]]; then
  echo "ERROR: Invalid profile name. Use only letters, numbers, hyphens, underscores." >&2
  exit 1
fi
if [[ -n "$REGION" && ! "$REGION" =~ ^[a-zA-Z0-9-]+$ ]]; then
  echo "ERROR: Invalid region name. Use only letters, numbers, hyphens." >&2
  exit 1
fi

# Build profile-only flags (region added per-call inside export_region)
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
  echo "  Region  : ALL (auto-discover)"
else
  echo "  Region  : ${REGION:-default}"
fi
echo "  Output  : $OUTDIR"
echo ""

# Current output directory — set per-region or to $OUTDIR for single-region
CURRENT_OUTDIR=""

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

# ─────────────────────────────────────────────────────────────────
# export_region [region-name]
# Runs all 29 exports for a single region. If a region argument is
# provided, it is added to AWS_FLAGS; otherwise only profile flags
# are used (CLI default region).
# ─────────────────────────────────────────────────────────────────
export_region() {
  local region_arg="${1:-}"

  # Build AWS_FLAGS for this region
  AWS_FLAGS=("${AWS_PROFILE_FLAGS[@]+"${AWS_PROFILE_FLAGS[@]}"}")
  if [ -n "$region_arg" ]; then
    AWS_FLAGS+=(--region "$region_arg")
  elif [ -n "$REGION" ]; then
    AWS_FLAGS+=(--region "$REGION")
  fi

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
        # Validate zone ID format
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
  # ECS requires listing clusters, then services per cluster, then describing each
  printf "  %-35s" "ECS Services..."
  if clusters=$(aws "${AWS_FLAGS[@]}" ecs list-clusters --query 'clusterArns[]' --output text 2>&1) && [ -n "$clusters" ] && [ "$clusters" != "None" ]; then
    echo '{"services":[]}' > "$CURRENT_OUTDIR/ecs-services.json"
    for cluster in $clusters; do
      # Validate ARN format
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

# ─────────────────────────────────────────────────────────────────
# Main dispatch: all-regions loop or single-region call
# ─────────────────────────────────────────────────────────────────
if [ -n "$ALL_REGIONS" ]; then
  echo "Discovering regions..."
  REGIONS=$(aws "${AWS_PROFILE_FLAGS[@]+"${AWS_PROFILE_FLAGS[@]}"}" ec2 describe-regions \
    --query 'Regions[].RegionName' --output text 2>&1)
  if [ -z "$REGIONS" ]; then
    echo "ERROR: Could not discover regions." >&2
    exit 1
  fi
  REGION_COUNT=$(echo "$REGIONS" | wc -w | tr -d ' ')
  echo "  Found $REGION_COUNT regions"
  echo ""
  SKIPPED=0
  for REG in $REGIONS; do
    # Quick check: skip regions with no non-default VPCs
    REG_FLAGS=("${AWS_PROFILE_FLAGS[@]+"${AWS_PROFILE_FLAGS[@]}"}" --region "$REG")
    VPC_COUNT=$(aws "${REG_FLAGS[@]}" ec2 describe-vpcs --query 'Vpcs[?IsDefault==`false`].VpcId' --output json 2>/dev/null | python3 -c "import json,sys;print(len(json.load(sys.stdin)))" 2>/dev/null || echo "0")
    if [ "$VPC_COUNT" = "0" ]; then
      SKIPPED=$((SKIPPED+1))
      echo "  Region: $REG — no resources, skipping"
      continue
    fi
    echo "╔══════════════════════════════════════════════════════╗"
    echo "║  Region: $REG"
    echo "╚══════════════════════════════════════════════════════╝"
    CURRENT_OUTDIR="$OUTDIR/$REG"
    mkdir -p "$CURRENT_OUTDIR"
    export_region "$REG"
    echo ""
  done
  if [ "$SKIPPED" -gt 0 ]; then echo "  Skipped $SKIPPED empty regions"; fi
else
  CURRENT_OUTDIR="$OUTDIR"
  export_region "$REGION"
fi

echo ""
echo "═════════════════════════════════════════════════════════"
FILE_COUNT=$(find "$OUTDIR" -name '*.json' | wc -l | tr -d ' ')
TOTAL_SIZE=$(du -sh "$OUTDIR" | cut -f1)
echo "  Done! $FILE_COUNT files exported ($TOTAL_SIZE)"
echo "  Output: $OUTDIR"
echo ""
echo "  To use: drag the folder onto the mapper's"
echo "  'UPLOAD JSON FILES' button, or open individual"
echo "  files and paste into the corresponding text areas."
echo "═════════════════════════════════════════════════════════"
