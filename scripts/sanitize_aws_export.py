#!/usr/bin/env python3
"""
sanitize_aws_export.py - Sanitize AWS export JSON data for safe sharing.

Reads a directory of AWS CLI JSON exports (produced by export-aws-data.ps1/sh),
replaces all sensitive values (account IDs, resource IDs, IPs, CIDRs, names,
ARNs, DNS, IAM details) with deterministic fake values, and writes sanitized
copies that still load correctly in aws_mapper.

Usage:
    python sanitize_aws_export.py ./aws-export [-o ./sanitized] [--seed 42] [--dry-run]

Stdlib only -- no external dependencies.
"""

import argparse
import copy
import ipaddress
import json
import os
import random
import re
import sys
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# CIDRs the compliance engine checks literally -- never sanitize these
PRESERVED_CIDRS = frozenset(["0.0.0.0/0", "::/0"])

# Special route targets that must stay literal
PRESERVED_ROUTE_TARGETS = frozenset(["local"])

# AWS managed policy ARN prefix -- preserve these
AWS_MANAGED_POLICY_PREFIX = "arn:aws:iam::aws:policy/"

# Tag keys whose Values should NOT be sanitized (structural/AWS-managed)
PRESERVED_TAG_KEYS = frozenset([
    "aws:cloudformation:stack-name",
    "aws:cloudformation:stack-id",
    "aws:cloudformation:logical-id",
    "aws:autoscaling:groupName",
])

# Environment/purpose keywords preserved in sanitized names so the
# classification engine can still tier resources (prod → critical, etc.)
# These are structural indicators, not sensitive identifiers.
_ENV_KEYWORD_RE = re.compile(
    r"(?<![a-zA-Z0-9])(prod(?:uction)?|pci|complian(?:ce)?|dr|disaster|recovery|"
    r"shared|serv(?:ice)?s?|security|edge|proxy|waf|cdn|"
    r"data|platform|"
    r"stag(?:ing|e)|qa|uat|"
    r"mgmt|management|monitor|"
    r"dev(?:elop)?|sandbox|test|experiment|"
    r"bastion|jump|ssh)(?![a-zA-Z0-9])", re.IGNORECASE
)

# Fields whose values are structural and should never be sanitized
STRUCTURAL_FIELDS = frozenset([
    "State", "Status", "Code", "Name",  # Name inside State object only
    "InstanceType", "DBInstanceClass", "Engine", "EngineVersion",
    "Runtime", "Handler", "MemorySize", "Timeout", "PackageType",
    "IpProtocol", "Protocol", "FromPort", "ToPort", "Port",
    "RuleAction", "Egress", "RuleNumber", "IsDefault",
    "MapPublicIpOnLaunch", "DefaultForAz", "AssignIpv6AddressOnCreation",
    "Scheme", "Type", "IpAddressType", "Action",
    "Effect", "Sid",
    "CacheNodeType", "NumCacheNodes", "NodeType", "NumberOfNodes",
    "StorageType", "AllocatedStorage", "MultiAZ", "StorageEncrypted",
    "EbsOptimized", "Architecture", "Hypervisor", "VirtualizationType",
    "RootDeviceType", "RootDeviceName", "DeviceName", "VolumeType",
    "Size", "Iops", "Encrypted",
    "HealthCheckProtocol", "HealthCheckPort", "HealthCheckPath",
    "HealthyThresholdCount", "UnhealthyThresholdCount",
    "Matcher", "TargetType", "ProtocolVersion",
    "AvailabilityZone", "AvailabilityZones",
    "ServiceName",  # VPC endpoint ServiceName (com.amazonaws.*)
    "PrefixListId", "PrefixListIds",
    "Tenancy", "Platform",
    "TTL", "Weight", "Failover", "SetIdentifier",
    "RecordCount", "TrafficPolicyInstanceCount",
    "HttpCode", "GrpcCode",
    "Config", "PrivateZone",
    "StatusCode",
])

# Top-level JSON wrapper keys -- the app parses by key name
TOP_LEVEL_KEYS = frozenset([
    "Vpcs", "Subnets", "RouteTables", "SecurityGroups", "NetworkAcls",
    "NetworkInterfaces", "InternetGateways", "NatGateways", "VpcEndpoints",
    "Reservations", "Instances", "DBInstances", "Functions",
    "CacheClusters", "Clusters", "LoadBalancers", "TargetGroups",
    "VpcPeeringConnections", "VpnConnections", "TransitGatewayAttachments",
    "Volumes", "Snapshots", "Buckets", "HostedZones",
    "ResourceRecordSets", "RecordSets", "WebACLs",
    "DistributionList", "Items",
    "RoleDetailList", "UserDetailList", "Policies",
    "services", "Tags", "IpPermissions", "IpPermissionsEgress",
    "Routes", "Associations", "Entries", "Attachments",
    "SecurityGroups",  # nested inside other objects too
    "IpRanges", "Ipv6Ranges", "UserIdGroupPairs",
    "RequesterVpcInfo", "AccepterVpcInfo",
    "DBSubnetGroup",
    "Placement", "State", "Endpoint",
    "NatGatewayAddresses", "SubnetIds", "RouteTableIds",
    "AvailabilityZones",
    "PolicyVersionList", "AttachedManagedPolicies",
    "InstanceProfileList", "RolePolicyList", "GroupPolicyList",
    "UserPolicyList",
    "Document", "PolicyDocument",
    "Statement",
    "BlockDeviceMappings", "Ebs",
    "ResourceRecords",
    "AliasTarget",
])

# Field names -> sanitization type
# Order matters: more specific matches checked first in classify_field()
FIELD_RESOURCE_ID = {
    "VpcId", "SubnetId", "GroupId", "InstanceId", "RouteTableId",
    "NetworkAclId", "NetworkInterfaceId", "InternetGatewayId",
    "NatGatewayId", "VpcEndpointId", "VpcPeeringConnectionId",
    "VpnConnectionId", "VpnGatewayId", "CustomerGatewayId",
    "TransitGatewayId", "TransitGatewayAttachmentId",
    "VolumeId", "SnapshotId", "AllocationId", "AssociationId",
    "ImageId", "RouteTableAssociationId", "SubnetIdentifier",
    "AttachmentId", "NetworkAclAssociationId",
    "TargetGroupArn",  # treated as ARN below, but listed for completeness
    "SecurityGroupId", "MainRouteTableAssociationId",
    "ReservationId", "RequesterId",
    "DhcpOptionsId", "KeyName",
    "LaunchTemplateId",
    "VpcSecurityGroupId",  # RDS security group cross-ref
    "GatewayId",  # Route table gateway (igw-/vpce- prefix checked by compliance)
}

FIELD_ACCOUNT_ID = {"OwnerId", "AccountId"}

FIELD_CIDR = {
    "CidrBlock", "CidrIp", "CidrIpv6", "DestinationCidrBlock",
    "DestinationIpv6CidrBlock", "Ipv6CidrBlock",
}

FIELD_PRIVATE_IP = {"PrivateIpAddress", "PrivateDnsName"}
FIELD_PUBLIC_IP = {"PublicIpAddress", "PublicIp", "PublicDnsName"}

FIELD_ARN = {
    "Arn", "FunctionArn", "LoadBalancerArn", "TargetGroupArn",
    "RoleArn", "PolicyArn", "InstanceProfileArn",
    "DBSubnetGroupArn", "DbiResourceId", "CacheClusterId",
    "ARN", "WebACLArn", "HostedZoneId",
    "StackId",
    "KmsKeyId",  # KMS key ARN — compliance checks aws/rds pattern inside
}

FIELD_DNS = {"DNSName", "DomainName", "Address", "Endpoint"}

FIELD_NAME = {
    "FunctionName": "function",
    "DBInstanceIdentifier": "database",
    "DBClusterIdentifier": "db-cluster",
    "DBSubnetGroupName": "db-subnet-group",
    "LoadBalancerName": "load-balancer",
    "TargetGroupName": "target-group",
    "CacheClusterId": "cache-cluster",
    "ClusterIdentifier": "redshift-cluster",
    "BucketName": "bucket",
    "GroupName": "security-group",
    "KeyName": "keypair",
    "LaunchTemplateName": "launch-template",
    "serviceName": "ecs-service",
    "clusterArn": "ecs-cluster",
    "taskDefinition": "task-def",
}

FIELD_IAM_NAME = {
    "RoleName": "role",
    "UserName": "user",
    "PolicyName": "policy",
    "GroupName": "group",  # IAM group context
    "InstanceProfileName": "instance-profile",
    "Path": "iam-path",
}

FIELD_DESCRIPTION = {"Description"}

FIELD_TIMESTAMP = set()  # Timestamps left as-is; only names/IDs need sanitization

# Regex patterns for embedded sensitive data in unkeyed strings
RE_ACCOUNT_ID = re.compile(r"\b\d{12}\b")
RE_RESOURCE_ID = re.compile(
    r"\b(vpc|subnet|sg|igw|nat|rtb|acl|eni|pcx|vpce|vgw|cgw|tgw|tgw-attach|"
    r"vol|snap|i|rtbassoc|aclassoc|eipalloc|eipassoc|lt|ami|dopt)-[0-9a-f]{8,17}\b"
)
RE_ARN = re.compile(r"arn:aws[a-zA-Z-]*:[a-zA-Z0-9-]+:[a-z0-9-]*:\d{12}:[^\s\"',\]]+")
RE_IPV4 = re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}\b")
RE_CIDR = re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}/\d{1,2}\b")

# RFC 5737 documentation ranges for public IP replacement
RFC5737_RANGES = [
    ipaddress.IPv4Network("192.0.2.0/24"),      # TEST-NET-1
    ipaddress.IPv4Network("198.51.100.0/24"),    # TEST-NET-2
    ipaddress.IPv4Network("203.0.113.0/24"),     # TEST-NET-3
]


# ---------------------------------------------------------------------------
# SanitizationRegistry
# ---------------------------------------------------------------------------

class SanitizationRegistry:
    """Central get-or-create mapping store.

    Same original value always maps to the same sanitized value.
    Counters per category ensure sequential, readable fake values.
    """

    def __init__(self, seed=None):
        self._maps = {}           # {category: {original: sanitized}}
        self._counters = defaultdict(int)  # {category: next_id}
        self._rng = random.Random(seed)

        # CIDR management
        self._vpc_cidr_map = {}       # {original_cidr: sanitized_cidr}
        self._vpc_subnet_counter = defaultdict(int)  # {sanitized_vpc_cidr: next_subnet_idx}
        self._vpc_id_to_cidr = {}     # {vpc_id: sanitized_vpc_cidr}
        self._subnet_to_vpc = {}      # {subnet_cidr: vpc_cidr}
        self._next_vpc_octet = 1      # next 10.{n}.0.0 allocation

        # Timestamp offset (random, applied uniformly)
        self._ts_offset = None

        # Public IP counter for RFC 5737 ranges
        self._public_ip_idx = 0

    def _get_or_create(self, category, original, factory):
        """Core get-or-create. Returns cached mapping or creates via factory."""
        if category not in self._maps:
            self._maps[category] = {}
        m = self._maps[category]
        if original not in m:
            m[original] = factory(original)
        return m[original]

    def _next_id(self, category):
        """Increment and return counter for category."""
        self._counters[category] += 1
        return self._counters[category]

    # -- Account IDs --
    def map_account_id(self, acct_id):
        if not acct_id or not re.fullmatch(r"\d{12}", str(acct_id)):
            return acct_id
        return self._get_or_create("account", str(acct_id),
            lambda _: f"{111000000000 + self._next_id('account'):012d}")

    # -- Resource IDs (vpc-xxx, sg-xxx, i-xxx, etc.) --
    def map_resource_id(self, rid):
        if not rid or not isinstance(rid, str):
            return rid
        m = re.match(r"^([a-z]+-?)([0-9a-f]+)$", rid)
        if not m:
            # Handle compound prefixes like tgw-attach-xxx
            m = re.match(r"^([a-z]+-[a-z]+-?)([0-9a-f]+)$", rid)
        if not m:
            return rid
        prefix = m.group(1)
        if not prefix.endswith("-"):
            prefix += "-"
        return self._get_or_create("resource_id", rid,
            lambda _: f"{prefix}{self._next_id('res_' + prefix):08x}")

    # -- VPC CIDRs --
    def map_vpc_cidr(self, cidr, vpc_id=None):
        if not cidr or cidr in PRESERVED_CIDRS:
            return cidr
        if cidr in self._vpc_cidr_map:
            return self._vpc_cidr_map[cidr]

        try:
            net = ipaddress.IPv4Network(cidr, strict=False)
        except (ValueError, TypeError):
            return cidr

        prefix = net.prefixlen
        sanitized = f"10.{self._next_vpc_octet}.0.0/{prefix}"
        self._next_vpc_octet += 1
        self._vpc_cidr_map[cidr] = sanitized

        if vpc_id:
            self._vpc_id_to_cidr[vpc_id] = sanitized

        return sanitized

    # -- Subnet CIDRs (must fall within parent VPC) --
    def map_subnet_cidr(self, cidr, vpc_id=None):
        if not cidr or cidr in PRESERVED_CIDRS:
            return cidr

        # Check if already mapped
        if cidr in self._vpc_cidr_map:
            return self._vpc_cidr_map[cidr]

        try:
            net = ipaddress.IPv4Network(cidr, strict=False)
        except (ValueError, TypeError):
            return cidr

        prefix = net.prefixlen

        # Find parent VPC CIDR
        parent_cidr = None
        if vpc_id and vpc_id in self._vpc_id_to_cidr:
            parent_cidr = self._vpc_id_to_cidr[vpc_id]
        else:
            # Try to find from pre-scanned relationships
            parent_cidr = self._subnet_to_vpc.get(cidr)

        if not parent_cidr:
            # Fallback: treat as standalone CIDR
            return self.map_cidr(cidr)

        try:
            parent_net = ipaddress.IPv4Network(parent_cidr, strict=False)
        except (ValueError, TypeError):
            return self.map_cidr(cidr)

        # Allocate sequential subnet within parent range
        idx = self._vpc_subnet_counter[parent_cidr]
        self._vpc_subnet_counter[parent_cidr] += 1

        # Calculate subnet offset within parent
        parent_prefix = parent_net.prefixlen
        subnet_bits = prefix - parent_prefix
        if subnet_bits <= 0:
            subnet_bits = 8  # fallback

        # Compute subnet network address
        parent_int = int(parent_net.network_address)
        subnet_size = 1 << (32 - prefix)
        subnet_addr = parent_int + (idx * subnet_size)

        try:
            sanitized = f"{ipaddress.IPv4Address(subnet_addr)}/{prefix}"
            # Verify containment
            sanitized_net = ipaddress.IPv4Network(sanitized, strict=False)
            if not sanitized_net.subnet_of(parent_net):
                # Wrap around if we exceed parent range
                sanitized = f"{parent_net.network_address}/{prefix}"
        except (ValueError, OverflowError):
            sanitized = f"{parent_net.network_address}/{prefix}"

        self._vpc_cidr_map[cidr] = sanitized
        return sanitized

    # -- Generic CIDRs (route destinations, SG rules, etc.) --
    def map_cidr(self, cidr):
        if not cidr or cidr in PRESERVED_CIDRS:
            return cidr
        if cidr in self._vpc_cidr_map:
            return self._vpc_cidr_map[cidr]

        try:
            net = ipaddress.IPv4Network(cidr, strict=False)
        except (ValueError, TypeError):
            # Might be IPv6
            if ":" in str(cidr):
                return cidr
            return cidr

        prefix = net.prefixlen
        sanitized = f"10.{self._next_vpc_octet}.0.0/{prefix}"
        self._next_vpc_octet += 1
        self._vpc_cidr_map[cidr] = sanitized
        return sanitized

    # -- Private IPs --
    def map_private_ip(self, ip):
        if not ip or not isinstance(ip, str):
            return ip
        try:
            addr = ipaddress.IPv4Address(ip)
        except (ValueError, TypeError):
            return ip
        if not addr.is_private:
            return self.map_public_ip(ip)

        return self._get_or_create("private_ip", ip,
            lambda _: str(ipaddress.IPv4Address(
                int(ipaddress.IPv4Address("10.0.0.1")) + self._next_id("priv_ip"))))

    # -- Public IPs (use RFC 5737 ranges) --
    def map_public_ip(self, ip):
        if not ip or not isinstance(ip, str):
            return ip
        try:
            ipaddress.IPv4Address(ip)
        except (ValueError, TypeError):
            return ip

        def _alloc(_):
            idx = self._public_ip_idx
            self._public_ip_idx += 1
            # Cycle through RFC 5737 ranges (768 addresses total)
            range_idx = idx // 254
            host = (idx % 254) + 1
            if range_idx >= len(RFC5737_RANGES):
                range_idx = range_idx % len(RFC5737_RANGES)
            net = RFC5737_RANGES[range_idx]
            return str(net.network_address + host)

        return self._get_or_create("public_ip", ip, _alloc)

    # -- ARNs --
    def map_arn(self, arn):
        if not arn or not isinstance(arn, str):
            return arn
        if not arn.startswith("arn:"):
            return arn
        # Preserve AWS managed policy ARNs
        if arn.startswith(AWS_MANAGED_POLICY_PREFIX):
            return arn

        parts = arn.split(":")
        if len(parts) < 6:
            return arn

        # arn:partition:service:region:account:resource
        partition = parts[1]
        service = parts[2]
        region = parts[3]
        account = parts[4]
        resource = ":".join(parts[5:])

        # Sanitize account
        if account and re.fullmatch(r"\d{12}", account):
            account = self.map_account_id(account)

        # Sanitize resource portion
        resource = self._sanitize_arn_resource(resource, service)

        return f"arn:{partition}:{service}:{region}:{account}:{resource}"

    # ARN resource parts that are structural and must never be sanitized
    _PRESERVED_ARN_RESOURCES = frozenset(["root", "*"])

    # ELB load balancer sub-types (appear at path index 1 in loadbalancer ARNs)
    _ELB_SUBTYPES = frozenset(["app", "net", "gateway"])

    # Map (service, resource_type) → FIELD_NAME category so ARN-embedded names
    # match their standalone field counterparts in compliance cross-references
    _ARN_NAME_CATEGORY = {
        ("elasticloadbalancing", "loadbalancer"): "load-balancer",
        ("elasticloadbalancing", "targetgroup"): "target-group",
        ("lambda", "function"): "function",
        ("rds", "db"): "database",
        ("rds", "cluster"): "db-cluster",
        ("s3", ""): "bucket",
    }

    def _sanitize_arn_resource(self, resource, service):
        """Sanitize the resource portion of an ARN."""
        # Handle resource-type/resource-id patterns
        if "/" in resource:
            parts = resource.split("/")
            rtype = parts[0] if parts else ""

            # Preserve AWS-managed KMS key identifiers (alias/aws/rds, key/aws/ebs, etc.)
            # Compliance engine checks db.KmsKeyId.includes('aws/rds') (PCI-3.5.1)
            if service == "kms" and len(parts) >= 3 and parts[1] == "aws":
                return resource

            # Look up the consistent name category for this service+resource_type
            name_cat = self._ARN_NAME_CATEGORY.get(
                (service, rtype), service)
            sanitized_parts = []
            for i, p in enumerate(parts):
                if i == 0:
                    # Resource type (e.g., "instance", "loadbalancer", "role")
                    sanitized_parts.append(p)
                elif p in self._PRESERVED_ARN_RESOURCES:
                    sanitized_parts.append(p)
                elif rtype == "loadbalancer" and i == 1 and p in self._ELB_SUBTYPES:
                    # Preserve ELB type indicator (app/net/gateway)
                    sanitized_parts.append(p)
                elif RE_RESOURCE_ID.fullmatch(p):
                    sanitized_parts.append(self.map_resource_id(p))
                elif re.fullmatch(r"\d{12}", p):
                    sanitized_parts.append(self.map_account_id(p))
                else:
                    sanitized_parts.append(self.map_name(p, name_cat))
            return "/".join(sanitized_parts)
        elif ":" in resource:
            rtype, _, rname = resource.partition(":")
            if rname in self._PRESERVED_ARN_RESOURCES:
                pass  # keep as-is
            elif RE_RESOURCE_ID.fullmatch(rname):
                rname = self.map_resource_id(rname)
            else:
                rname = self.map_name(rname, service)
            return f"{rtype}:{rname}"
        else:
            # Bare resource (e.g., "root" in arn:aws:iam::account:root)
            if resource in self._PRESERVED_ARN_RESOURCES:
                return resource
            if RE_RESOURCE_ID.fullmatch(resource):
                return self.map_resource_id(resource)
            return self.map_name(resource, service)

    # -- DNS names --
    def map_dns_name(self, name):
        if not name or not isinstance(name, str):
            return name
        if not ("." in name and any(c.isalpha() for c in name)):
            return name

        # AWS service DNS patterns
        patterns = [
            # ELB: xxx.region.elb.amazonaws.com
            (r"^(.+?)\.([\w-]+)\.elb\.amazonaws\.com$",
             lambda m: f"sanitized-lb-{self._next_id('dns_elb')}.{m.group(2)}.elb.amazonaws.com"),
            # RDS: xxx.region.rds.amazonaws.com
            (r"^(.+?)\.([\w-]+)\.rds\.amazonaws\.com$",
             lambda m: f"sanitized-db-{self._next_id('dns_rds')}.{m.group(2)}.rds.amazonaws.com"),
            # ElastiCache: xxx.region.cache.amazonaws.com
            (r"^(.+?)\.([\w-]+)\.cache\.amazonaws\.com$",
             lambda m: f"sanitized-cache-{self._next_id('dns_cache')}.{m.group(2)}.cache.amazonaws.com"),
            # CloudFront: xxx.cloudfront.net
            (r"^(.+?)\.cloudfront\.net$",
             lambda m: f"sanitized-cf-{self._next_id('dns_cf')}.cloudfront.net"),
            # S3: bucket.s3.amazonaws.com
            (r"^(.+?)\.s3[.\w-]*\.amazonaws\.com$",
             lambda m: f"sanitized-s3-{self._next_id('dns_s3')}.s3.amazonaws.com"),
            # EC2 internal: ip-x-x-x-x.region.compute.internal
            (r"^ip-[\d-]+\.([\w-]+)\.compute\.internal$",
             lambda m: f"ip-10-0-0-{self._next_id('dns_ec2')}.{m.group(1)}.compute.internal"),
            # EC2 public: ec2-x-x-x-x.region.compute.amazonaws.com
            (r"^ec2-[\d-]+\.([\w-]+)\.compute\.amazonaws\.com$",
             lambda m: f"ec2-192-0-2-{self._next_id('dns_ec2pub')}.{m.group(1)}.compute.amazonaws.com"),
        ]

        for pattern, replacer in patterns:
            m = re.match(pattern, name)
            if m:
                return self._get_or_create("dns", name, lambda _, _m=m, _r=replacer: _r(_m))

        # Generic domain name
        return self._get_or_create("dns", name,
            lambda _: f"sanitized-{self._next_id('dns_generic')}.example.com")

    # -- Names (function names, DB identifiers, bucket names, etc.) --
    def map_name(self, name, category="resource"):
        if not name or not isinstance(name, str):
            return name
        # Preserve ALL environment keywords so classification engine can tier resources
        env_hits = _ENV_KEYWORD_RE.findall(name)
        env_prefix = ("-".join(dict.fromkeys(w.lower() for w in env_hits)) + "-") if env_hits else ""
        return self._get_or_create(f"name_{category}", name,
            lambda _: f"{env_prefix}{category}-{self._next_id('name_' + category):03d}")

    # -- IAM names --
    def map_iam_name(self, name, iam_type="role"):
        if not name or not isinstance(name, str):
            return name
        return self._get_or_create(f"iam_{iam_type}", name,
            lambda _: f"{iam_type}-{self._next_id('iam_' + iam_type):03d}")

    # -- Descriptions --
    def map_description(self, desc):
        if not desc or not isinstance(desc, str):
            return desc
        return "Resource description"

    # -- Timestamps --
    def map_timestamp(self, ts):
        if not ts or not isinstance(ts, str):
            return ts
        if self._ts_offset is None:
            self._ts_offset = timedelta(days=self._rng.randint(-365, -30))

        # Try ISO format parsing
        for fmt in [
            "%Y-%m-%dT%H:%M:%S.%fZ",
            "%Y-%m-%dT%H:%M:%SZ",
            "%Y-%m-%dT%H:%M:%S%z",
            "%Y-%m-%dT%H:%M:%S.%f%z",
            "%Y-%m-%d %H:%M:%S",
            "%Y-%m-%dT%H:%M:%S+00:00",
        ]:
            try:
                dt = datetime.strptime(ts, fmt)
                shifted = dt + self._ts_offset
                # Return in same format
                if ts.endswith("Z"):
                    return shifted.strftime(fmt.replace("%z", ""))
                return shifted.strftime(fmt)
            except ValueError:
                continue
        return ts  # Can't parse, return as-is

    # -- Hosted zone IDs --
    def map_hosted_zone_id(self, zone_id):
        if not zone_id or not isinstance(zone_id, str):
            return zone_id
        # Strip /hostedzone/ prefix if present
        bare = zone_id.replace("/hostedzone/", "")
        sanitized = self._get_or_create("hosted_zone", bare,
            lambda _: f"Z{self._next_id('zone'):014d}")
        if zone_id.startswith("/hostedzone/"):
            return f"/hostedzone/{sanitized}"
        return sanitized

    # -- Route53 zone names --
    def map_zone_name(self, name):
        if not name or not isinstance(name, str):
            return name
        # Strip trailing dot if present
        bare = name.rstrip(".")
        had_dot = name.endswith(".")
        sanitized = self._get_or_create("zone_name", bare,
            lambda _: f"sanitized-{self._next_id('zone_name')}.example.com")
        return sanitized + "." if had_dot else sanitized

    # -- Export mapping.json --
    def export_mapping(self):
        """Return full mapping dict for debugging/audit."""
        result = {}
        for category, m in sorted(self._maps.items()):
            result[category] = {orig: san for orig, san in sorted(m.items())}
        result["_cidr_map"] = dict(sorted(self._vpc_cidr_map.items()))
        return result


# ---------------------------------------------------------------------------
# Phase 1: Scan all files and build CIDR relationships
# ---------------------------------------------------------------------------

def scan_json_files(input_dir):
    """Recursively load all JSON files from input directory."""
    data = {}
    input_path = Path(input_dir)
    for json_file in sorted(input_path.rglob("*.json")):
        rel = json_file.relative_to(input_path)
        try:
            with open(json_file, "r", encoding="utf-8") as f:
                data[str(rel)] = json.load(f)
        except (json.JSONDecodeError, UnicodeDecodeError) as e:
            print(f"  WARN: skipping {rel} ({e})")
    return data


def build_cidr_relationships(data, registry):
    """Pre-scan to discover VPC->subnet CIDR mappings and register them."""
    vpcs = []
    subnets = []

    for filename, content in data.items():
        if isinstance(content, dict):
            # Find VPCs
            for vpc in content.get("Vpcs", []):
                vpc_id = vpc.get("VpcId", "")
                cidr = vpc.get("CidrBlock", "")
                if vpc_id and cidr:
                    vpcs.append((vpc_id, cidr))

            # Find subnets
            for sub in content.get("Subnets", []):
                sub_cidr = sub.get("CidrBlock", "")
                vpc_id = sub.get("VpcId", "")
                if sub_cidr and vpc_id:
                    subnets.append((vpc_id, sub_cidr))

    # Phase 1a: Register all VPC CIDRs first
    for vpc_id, cidr in vpcs:
        registry.map_vpc_cidr(cidr, vpc_id)

    # Phase 1b: Build subnet->VPC lookup for containment
    for vpc_id, sub_cidr in subnets:
        if vpc_id in registry._vpc_id_to_cidr:
            registry._subnet_to_vpc[sub_cidr] = registry._vpc_id_to_cidr[vpc_id]

    # Phase 1c: Register all subnet CIDRs within their parent VPCs
    for vpc_id, sub_cidr in subnets:
        registry.map_subnet_cidr(sub_cidr, vpc_id)

    # Also pick up peering CIDRs
    for filename, content in data.items():
        if isinstance(content, dict):
            for peer in content.get("VpcPeeringConnections", []):
                for side in ["RequesterVpcInfo", "AccepterVpcInfo"]:
                    info = peer.get(side, {})
                    cidr = info.get("CidrBlock", "")
                    vpc_id = info.get("VpcId", "")
                    if cidr and cidr not in registry._vpc_cidr_map:
                        registry.map_vpc_cidr(cidr, vpc_id)

    return len(vpcs), len(subnets)


# ---------------------------------------------------------------------------
# Phase 2: Deep sanitization walker
# ---------------------------------------------------------------------------

def classify_and_sanitize(key, value, registry, parent_keys=None):
    """Given a field name and value, return sanitized value."""
    if not isinstance(value, str) or not value:
        return value

    # Parent container is parent_keys[-2] ([-1] is the current key itself)
    parent = parent_keys[-2] if parent_keys and len(parent_keys) >= 2 else ""

    # Skip structural fields
    if key in STRUCTURAL_FIELDS:
        # "Name" inside a State object is structural (e.g., "running")
        if key == "Name" and parent == "State":
            return value
        # "Name" elsewhere should fall through to context-specific handling
        if key == "Name":
            pass
        else:
            return value

    # VPC Endpoint ServiceName (com.amazonaws.*) -- preserve
    if key == "ServiceName" and value.startswith("com.amazonaws."):
        return value

    # AvailabilityZone -- preserve
    if key in ("AvailabilityZone", "ZoneName"):
        return value

    # Account IDs
    if key in FIELD_ACCOUNT_ID:
        return registry.map_account_id(value)

    # Resource IDs
    if key in FIELD_RESOURCE_ID:
        return registry.map_resource_id(value)

    # CIDRs
    if key in FIELD_CIDR:
        if value in PRESERVED_CIDRS:
            return value
        return registry.map_cidr(value)

    # Private IPs
    if key in FIELD_PRIVATE_IP:
        if key == "PrivateDnsName":
            return registry.map_dns_name(value)
        return registry.map_private_ip(value)

    # Public IPs
    if key in FIELD_PUBLIC_IP:
        if key == "PublicDnsName":
            return registry.map_dns_name(value)
        return registry.map_public_ip(value)

    # ARNs
    if key in FIELD_ARN:
        if key == "HostedZoneId":
            return registry.map_hosted_zone_id(value)
        return registry.map_arn(value)

    # DNS names
    if key in FIELD_DNS:
        if key == "Endpoint" and not ("." in value and any(c.isalpha() for c in value)):
            return value  # Not a DNS name (could be a dict handled elsewhere)
        return registry.map_dns_name(value)

    # Named resources
    if key in FIELD_NAME:
        # GroupName "default" is checked literally by compliance engine (CIS 5.4, SOC2, PCI)
        if key == "GroupName" and value == "default":
            return value
        return registry.map_name(value, FIELD_NAME[key])

    # IAM names
    if key in FIELD_IAM_NAME:
        if key == "Path":
            # IAM paths like /service-role/ -- preserve
            if value == "/" or value.startswith("/aws-service-role/"):
                return value
            return f"/sanitized-path-{registry._next_id('iam_path')}/"
        return registry.map_iam_name(value, FIELD_IAM_NAME[key])

    # Descriptions
    if key in FIELD_DESCRIPTION:
        return registry.map_description(value)

    # Timestamps
    if key in FIELD_TIMESTAMP:
        return registry.map_timestamp(value)

    # R53 zone name
    if key == "Name" and parent_keys:
        # Inside HostedZones list
        if "HostedZones" in parent_keys:
            return registry.map_zone_name(value)
        # Inside ResourceRecordSets -- record name
        if "ResourceRecordSets" in parent_keys or "RecordSets" in parent_keys:
            return registry.map_zone_name(value)
        # Tag Value handled separately; generic Name tag
        if parent not in ("State", "Placement"):
            return registry.map_name(value, "resource")

    # CallerReference in R53
    if key == "CallerReference":
        return f"ref-{registry._next_id('caller_ref')}"

    # R53 record Value field
    if key == "Value":
        if parent_keys and "ResourceRecords" in parent_keys:
            return _sanitize_record_value(value, registry)
        # Tag value -- fall through
        return value

    # Regex fallback for embedded sensitive data
    return _regex_fallback(value, registry)


def _sanitize_record_value(value, registry):
    """Sanitize a Route53 record value based on content."""
    value = value.strip()
    # IP address
    if RE_IPV4.fullmatch(value):
        try:
            addr = ipaddress.IPv4Address(value)
            if addr.is_private:
                return registry.map_private_ip(value)
            return registry.map_public_ip(value)
        except ValueError:
            pass
    # CNAME / alias target
    if "." in value and any(c.isalpha() for c in value):
        return registry.map_dns_name(value)
    return value


def _regex_fallback(value, registry):
    """Catch embedded ARNs, resource IDs, and account IDs in freeform strings."""
    if not isinstance(value, str):
        return value

    result = value

    # Replace embedded ARNs
    for m in RE_ARN.finditer(result):
        sanitized = registry.map_arn(m.group(0))
        result = result.replace(m.group(0), sanitized)

    # Replace embedded resource IDs
    for m in RE_RESOURCE_ID.finditer(result):
        sanitized = registry.map_resource_id(m.group(0))
        result = result.replace(m.group(0), sanitized)

    # Replace embedded 12-digit account IDs (careful: don't match port numbers etc.)
    for m in RE_ACCOUNT_ID.finditer(result):
        candidate = m.group(0)
        # Skip if it looks like a timestamp or port
        if int(candidate) < 100000000000:
            continue
        sanitized = registry.map_account_id(candidate)
        result = result.replace(candidate, sanitized)

    return result


def deep_sanitize(obj, registry, parent_keys=None):
    """Recursively walk and sanitize a JSON structure."""
    if parent_keys is None:
        parent_keys = []

    if isinstance(obj, dict):
        result = {}
        for k, v in obj.items():
            new_keys = parent_keys + [k]

            # Special handlers for known complex structures
            if k == "Tags" and isinstance(v, list):
                result[k] = sanitize_tags(v, registry)
            elif k in ("PolicyDocument", "Document", "AssumeRolePolicyDocument"):
                result[k] = sanitize_policy_document(v, registry)
            elif k == "ResourceRecordSets" or k == "RecordSets":
                result[k] = [deep_sanitize(rec, registry, new_keys) for rec in v] if isinstance(v, list) else v
            else:
                result[k] = deep_sanitize(v, registry, new_keys)
        return result

    elif isinstance(obj, list):
        return [deep_sanitize(item, registry, parent_keys) for item in obj]

    elif isinstance(obj, str):
        key = parent_keys[-1] if parent_keys else ""
        return classify_and_sanitize(key, obj, registry, parent_keys)

    else:
        # Numbers, booleans, None -- pass through
        return obj


def sanitize_tags(tags, registry):
    """Sanitize tag list: preserve Key, sanitize Value."""
    if not isinstance(tags, list):
        return tags

    result = []
    for tag in tags:
        if not isinstance(tag, dict):
            result.append(tag)
            continue

        key = tag.get("Key", "")
        value = tag.get("Value", "")

        new_tag = dict(tag)

        # Preserve AWS-managed tag values
        if key in PRESERVED_TAG_KEYS or key.startswith("aws:"):
            result.append(new_tag)
            continue

        # Sanitize the Value
        if isinstance(value, str) and value:
            # Check if value is a resource ID
            if RE_RESOURCE_ID.fullmatch(value):
                new_tag["Value"] = registry.map_resource_id(value)
            elif RE_ARN.fullmatch(value):
                new_tag["Value"] = registry.map_arn(value)
            elif RE_CIDR.fullmatch(value):
                new_tag["Value"] = registry.map_cidr(value)
            else:
                new_tag["Value"] = registry.map_name(value, "tag")

        result.append(new_tag)
    return result


def sanitize_policy_document(doc, registry):
    """Sanitize IAM policy document. May be a dict or a JSON string."""
    if isinstance(doc, str):
        try:
            parsed = json.loads(doc)
            sanitized = _sanitize_policy_obj(parsed, registry)
            return json.dumps(sanitized, separators=(",", ":"))
        except (json.JSONDecodeError, TypeError):
            return _regex_fallback(doc, registry)

    if isinstance(doc, dict):
        return _sanitize_policy_obj(doc, registry)

    return doc


def _sanitize_policy_obj(doc, registry):
    """Sanitize a parsed IAM policy document."""
    result = {}
    for k, v in doc.items():
        if k == "Statement" and isinstance(v, list):
            result[k] = [_sanitize_statement(stmt, registry) for stmt in v]
        elif k == "Version":
            result[k] = v  # Preserve policy version
        else:
            result[k] = v
    return result


def _sanitize_statement(stmt, registry):
    """Sanitize a single IAM policy statement."""
    result = {}
    for k, v in stmt.items():
        if k in ("Effect", "Sid"):
            result[k] = v
        elif k == "Action" or k == "NotAction":
            result[k] = v  # Preserve action names
        elif k in ("Resource", "NotResource"):
            result[k] = _sanitize_policy_resource(v, registry)
        elif k == "Principal" or k == "NotPrincipal":
            result[k] = _sanitize_principal(v, registry)
        elif k == "Condition":
            result[k] = deep_sanitize(v, registry, ["Condition"])
        else:
            result[k] = v
    return result


def _sanitize_policy_resource(resource, registry):
    """Sanitize Resource field (string or list of ARNs)."""
    if resource == "*":
        return "*"
    if isinstance(resource, str):
        return registry.map_arn(resource) if resource.startswith("arn:") else resource
    if isinstance(resource, list):
        return [
            registry.map_arn(r) if isinstance(r, str) and r.startswith("arn:") else r
            for r in resource
        ]
    return resource


def _sanitize_principal(principal, registry):
    """Sanitize Principal field."""
    if principal == "*":
        return "*"
    if isinstance(principal, str):
        return _regex_fallback(principal, registry)
    if isinstance(principal, dict):
        result = {}
        for k, v in principal.items():
            if k == "AWS":
                if isinstance(v, str):
                    result[k] = registry.map_arn(v) if v.startswith("arn:") else _regex_fallback(v, registry)
                elif isinstance(v, list):
                    result[k] = [
                        registry.map_arn(x) if isinstance(x, str) and x.startswith("arn:")
                        else _regex_fallback(x, registry) if isinstance(x, str)
                        else x
                        for x in v
                    ]
                else:
                    result[k] = v
            elif k == "Service":
                result[k] = v  # Preserve service principals
            else:
                result[k] = v
        return result
    return principal


# ---------------------------------------------------------------------------
# Phase 3: Write output
# ---------------------------------------------------------------------------

def write_output(sanitized_data, output_dir, registry, dry_run=False):
    """Write sanitized JSON files and mapping.json."""
    out_path = Path(output_dir)

    if dry_run:
        print(f"\n  DRY RUN -- would write to: {out_path}")
        print(f"  Files: {len(sanitized_data)}")
        mapping = registry.export_mapping()
        total_mappings = sum(len(v) for v in mapping.values())
        print(f"  Total mappings: {total_mappings}")
        return

    out_path.mkdir(parents=True, exist_ok=True)

    for rel_path, content in sanitized_data.items():
        file_out = out_path / rel_path
        file_out.parent.mkdir(parents=True, exist_ok=True)
        with open(file_out, "w", encoding="utf-8") as f:
            json.dump(content, f, indent=2, ensure_ascii=False)

    # Write mapping file
    mapping_path = out_path / "_mapping.json"
    with open(mapping_path, "w", encoding="utf-8") as f:
        json.dump(registry.export_mapping(), f, indent=2, ensure_ascii=False)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Sanitize AWS export JSON data for safe sharing.",
        epilog="Example: python sanitize_aws_export.py ./aws-export -o ./sanitized",
    )
    parser.add_argument("input_dir", help="Directory containing exported JSON files")
    parser.add_argument("-o", "--output", default=None,
                        help="Output directory (default: {input_dir}-sanitized)")
    parser.add_argument("--seed", type=int, default=None,
                        help="Random seed for reproducible output")
    parser.add_argument("--dry-run", action="store_true",
                        help="Scan only, show stats without writing files")

    args = parser.parse_args()

    input_dir = Path(args.input_dir)
    if not input_dir.is_dir():
        print(f"ERROR: {input_dir} is not a directory")
        sys.exit(1)

    output_dir = args.output or f"{input_dir}-sanitized"

    print(f"AWS Export Sanitizer")
    print(f"  Input:  {input_dir.resolve()}")
    print(f"  Output: {Path(output_dir).resolve()}")
    if args.seed is not None:
        print(f"  Seed:   {args.seed}")
    print()

    # Phase 1: Scan
    print("Phase 1: Scanning JSON files...")
    data = scan_json_files(input_dir)
    print(f"  Found {len(data)} JSON files")

    if not data:
        print("  No JSON files found. Nothing to do.")
        sys.exit(0)

    registry = SanitizationRegistry(seed=args.seed)

    print("  Building CIDR relationships...")
    num_vpcs, num_subnets = build_cidr_relationships(data, registry)
    print(f"  Registered {num_vpcs} VPCs, {num_subnets} subnets")

    # Phase 2: Sanitize
    print("\nPhase 2: Sanitizing...")
    sanitized = {}
    for rel_path, content in data.items():
        sanitized[rel_path] = deep_sanitize(copy.deepcopy(content), registry)
        print(f"  {rel_path}")

    # Phase 3: Write
    print(f"\nPhase 3: Writing output...")
    write_output(sanitized, output_dir, registry, dry_run=args.dry_run)

    # Summary
    mapping = registry.export_mapping()
    total = sum(len(v) for v in mapping.values())
    print(f"\nDone! {total} values sanitized across {len(data)} files.")
    if not args.dry_run:
        print(f"  Sanitized files: {Path(output_dir).resolve()}")
        print(f"  Mapping file:    {Path(output_dir).resolve() / '_mapping.json'}")


if __name__ == "__main__":
    main()
