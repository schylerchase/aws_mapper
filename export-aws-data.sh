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
#
# The output folder can be dragged onto the mapper's "UPLOAD JSON FILES"
# button, or files can be pasted individually into text areas.
# ─────────────────────────────────────────────────────────────────
set -euo pipefail

PROFILE=""
REGION=""
OUTDIR=""

usage() {
  echo "Usage: $0 [-p aws-profile] [-r region] [-o output-dir]"
  echo "  -p  AWS CLI profile (optional, uses default if omitted)"
  echo "  -r  AWS region (optional, uses CLI default if omitted)"
  echo "  -o  Output directory (optional, creates timestamped dir)"
  exit 1
}

while getopts "p:r:o:h" opt; do
  case $opt in
    p) PROFILE="$OPTARG" ;;
    r) REGION="$OPTARG" ;;
    o) OUTDIR="$OPTARG" ;;
    h) usage ;;
    *) usage ;;
  esac
done

# Build common AWS CLI flags
AWS_FLAGS=""
[ -n "$PROFILE" ] && AWS_FLAGS="$AWS_FLAGS --profile $PROFILE"
[ -n "$REGION" ] && AWS_FLAGS="$AWS_FLAGS --region $REGION"

# Determine output directory
if [ -z "$OUTDIR" ]; then
  TIMESTAMP=$(date +%Y%m%d-%H%M%S)
  LABEL="${PROFILE:-default}"
  OUTDIR="./aws-export-${LABEL}-${TIMESTAMP}"
fi
mkdir -p "$OUTDIR"

echo "╔══════════════════════════════════════════════════════╗"
echo "║        AWS Network Mapper — Data Export              ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
echo "  Profile : ${PROFILE:-default}"
echo "  Region  : ${REGION:-default}"
echo "  Output  : $OUTDIR"
echo ""

# Helper: run an AWS CLI command, save output, report status
run() {
  local label="$1"
  local filename="$2"
  shift 2
  local cmd="$*"

  printf "  %-35s" "$label..."
  if output=$(eval "aws $AWS_FLAGS $cmd" 2>&1); then
    echo "$output" > "$OUTDIR/$filename"
    local size
    size=$(wc -c < "$OUTDIR/$filename" | tr -d ' ')
    echo "OK (${size} bytes)"
  else
    echo "SKIP (${output:0:60})"
  fi
}

echo "── Network ─────────────────────────────────────────────"
run "VPCs"                    "vpcs.json"                    "ec2 describe-vpcs"
run "Subnets"                 "subnets.json"                 "ec2 describe-subnets"
run "Route Tables"            "route-tables.json"            "ec2 describe-route-tables"
run "Security Groups"         "security-groups.json"         "ec2 describe-security-groups"
run "Network ACLs"            "network-acls.json"            "ec2 describe-network-acls"
run "ENIs"                    "network-interfaces.json"      "ec2 describe-network-interfaces"

echo ""
echo "── Gateways ──────────────────────────────────────────────"
run "Internet Gateways"       "internet-gateways.json"       "ec2 describe-internet-gateways"
run "NAT Gateways"            "nat-gateways.json"            "ec2 describe-nat-gateways"
run "VPC Endpoints"           "vpc-endpoints.json"           "ec2 describe-vpc-endpoints"

echo ""
echo "── Compute ───────────────────────────────────────────────"
run "EC2 Instances"           "ec2-instances.json"           "ec2 describe-instances"
run "RDS Instances"           "rds-instances.json"           "rds describe-db-instances"
run "Lambda Functions"        "lambda-functions.json"        "lambda list-functions"
run "ElastiCache Clusters"    "elasticache-clusters.json"    "elasticache describe-cache-clusters --show-cache-node-info"
run "Redshift Clusters"       "redshift-clusters.json"       "redshift describe-clusters"

echo ""
echo "── Load Balancing ────────────────────────────────────────"
run "ALBs / NLBs"             "load-balancers.json"          "elbv2 describe-load-balancers"
run "Target Groups"           "target-groups.json"           "elbv2 describe-target-groups"

echo ""
echo "── Connectivity ──────────────────────────────────────────"
run "VPC Peering"             "vpc-peering.json"             "ec2 describe-vpc-peering-connections"
run "VPN Connections"         "vpn-connections.json"         "ec2 describe-vpn-connections"
run "TGW Attachments"         "tgw-attachments.json"         "ec2 describe-transit-gateway-attachments"

echo ""
echo "── Storage ───────────────────────────────────────────────"
run "EBS Volumes"             "volumes.json"                 "ec2 describe-volumes"
run "EBS Snapshots"           "snapshots.json"               "ec2 describe-snapshots --owner-ids self"
run "S3 Buckets"              "s3-buckets.json"              "s3api list-buckets"

echo ""
echo "── DNS ───────────────────────────────────────────────────"
run "Route 53 Hosted Zones"   "hosted-zones.json"            "route53 list-hosted-zones"

# Export record sets for each hosted zone
if [ -f "$OUTDIR/hosted-zones.json" ]; then
  ZONE_IDS=$(python3 -c "
import json
d=json.load(open('$OUTDIR/hosted-zones.json'))
for z in d.get('HostedZones',[]):
  print(z['Id'].replace('/hostedzone/',''))
" 2>/dev/null || true)

  if [ -n "$ZONE_IDS" ]; then
    echo '{"RecordSets":[]}' > "$OUTDIR/r53-records.json"
    for zid in $ZONE_IDS; do
      printf "  %-35s" "  Records ($zid)..."
      if eval "aws $AWS_FLAGS route53 list-resource-record-sets --hosted-zone-id $zid" > "$OUTDIR/_tmp_rr.json" 2>/dev/null; then
        python3 -c "
import json
a=json.load(open('$OUTDIR/r53-records.json'))
b=json.load(open('$OUTDIR/_tmp_rr.json'))
a['RecordSets'].extend(b.get('ResourceRecordSets',[]))
json.dump(a,open('$OUTDIR/r53-records.json','w'))
" 2>/dev/null
        echo "OK"
      else
        echo "SKIP"
      fi
    done
    rm -f "$OUTDIR/_tmp_rr.json"
  fi
fi

echo ""
echo "── Security ──────────────────────────────────────────────"
run "WAF WebACLs"             "waf-web-acls.json"            "wafv2 list-web-acls --scope REGIONAL"
run "CloudFront Distributions" "cloudfront.json"             "cloudfront list-distributions"

echo ""
echo "── IAM ───────────────────────────────────────────────────"
run "IAM Authorization"       "iam.json"                     "iam get-account-authorization-details"

echo ""
echo "── ECS (multi-step) ──────────────────────────────────────"
# ECS requires listing clusters, then services per cluster, then describing each
printf "  %-35s" "ECS Services..."
if clusters=$(eval "aws $AWS_FLAGS ecs list-clusters --query 'clusterArns[]' --output text" 2>&1) && [ -n "$clusters" ] && [ "$clusters" != "None" ]; then
  echo '{"services":[]}' > "$OUTDIR/ecs-services.json"
  for cluster in $clusters; do
    svc_arns=$(eval "aws $AWS_FLAGS ecs list-services --cluster $cluster --query 'serviceArns[]' --output text" 2>/dev/null || true)
    if [ -n "$svc_arns" ] && [ "$svc_arns" != "None" ]; then
      for svc_arn in $svc_arns; do
        if eval "aws $AWS_FLAGS ecs describe-services --cluster $cluster --services $svc_arn" > "$OUTDIR/_tmp_ecs.json" 2>/dev/null; then
          python3 -c "
import json
a=json.load(open('$OUTDIR/ecs-services.json'))
b=json.load(open('$OUTDIR/_tmp_ecs.json'))
a['services'].extend(b.get('services',[]))
json.dump(a,open('$OUTDIR/ecs-services.json','w'))
" 2>/dev/null
        fi
      done
    fi
  done
  rm -f "$OUTDIR/_tmp_ecs.json"
  echo "OK"
else
  echo "SKIP (no clusters)"
fi

echo ""
echo "═════════════════════════════════════════════════════════"
FILE_COUNT=$(ls -1 "$OUTDIR"/*.json 2>/dev/null | wc -l | tr -d ' ')
TOTAL_SIZE=$(du -sh "$OUTDIR" | cut -f1)
echo "  Done! $FILE_COUNT files exported ($TOTAL_SIZE)"
echo "  Output: $OUTDIR"
echo ""
echo "  To use: drag the folder onto the mapper's"
echo "  'UPLOAD JSON FILES' button, or open individual"
echo "  files and paste into the corresponding text areas."
echo "═════════════════════════════════════════════════════════"
