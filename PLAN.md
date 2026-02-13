# AWS Mapper v28 — Design Validation Engine, Empty-State Design, Multi-Account Support

## Status: Phase 1 issues fixed (commit 584edf5). This plan covers Phases 2-4.

---

## Problem Statement

Three fundamental gaps prevent Design Mode from being a real infrastructure planning tool:

### 1. Empty-State Dead End
When no data is loaded, users can enter Design Mode but **cannot do anything**:
- No VPC creation flow exists — every operation requires a VPC context
- `showDesignForm('add_subnet', ...)` crashes with `TypeError: Cannot read properties of null` when `context.vpc` is null
- `_rlCtx` is never populated (renderMap returns early at line 4465 when vpcs.length === 0)
- The resource list toolbar hides when `ctx.vpcs.length === 0` (line 2081 guard)
- All three layout renderers (grid, landing-zone, executive) alert and return with 0 VPCs

**Impact:** Design Mode is useless without pre-existing data. Users can't plan new infrastructure from scratch.

### 2. No Validation Engine
The apply functions (`_designApplyFns`) perform **zero constraint validation**. All validation lives only in the UI forms, meaning:
- Imported plans via `importDesignPlan()` bypass all validation
- Programmatic `addDesignChange()` calls bypass all validation
- The exported AWS CLI commands will fail when they hit real AWS constraints

**Specific violations currently allowed:**

| AWS Constraint | Current Behavior |
|---|---|
| 1 IGW per VPC (hard limit) | Can add unlimited IGWs per VPC |
| NAT must be in public subnet | Apply function accepts any subnet ID |
| Subnet CIDR must be within VPC CIDR | Apply function doesn't check |
| Subnet CIDRs cannot overlap | Apply function doesn't check |
| One route per destination CIDR per RT | Can add duplicate destination routes |
| VPC CIDR range /16 to /28 | No prefix length validation |
| Subnet CIDR range /16 to /28 | No prefix length validation (split can produce /33) |
| 5 IPs reserved per subnet (/28 = only 11 usable) | Not calculated or displayed |
| No overlapping CIDRs in VPC peering | Not checked |
| SG limit: 60 inbound rules default | Not enforced |
| SGs per ENI hard cap: combined 1,000 rules | Not tracked |
| Subnets per VPC: 200 default | Not checked |
| Route tables per VPC: 200 default | Not checked |

### 3. Multi-Account Data Merging Is Broken
All context lookups are keyed by raw AWS resource ID with no account namespace:
```
subByVpc['vpc-12345']  → silently overwrites if two accounts have vpc-12345
sgByVpc['vpc-12345']   → same
instBySub['subnet-x']  → same
```
- `ext()` concatenates arrays blindly — no deduplication
- No account ID extraction from ARNs or user input
- No conflict detection or warning when IDs collide
- Region inferred only from AZ suffix, never validated
- Demo data simulates single account only (hardcoded `123456789`)

**Impact:** Pasting data from 2+ AWS accounts causes silent data loss. Users see only the last account's resources for any colliding ID.

---

## Architecture: Validation Engine

### Design Principle: **Dual-Layer Validation**

```
UI Form Validation (soft)     →  Prevents user input errors
                                  Real-time feedback in forms
                                  Can be overridden for "what if" scenarios

Apply-Level Validation (hard) →  Enforces AWS constraints
                                  Runs on every applyDesignChanges()
                                  Blocks invalid state mutations
                                  Produces warnings in change log
                                  Annotates exported CLI with ⚠️ warnings
```

### Core Validation Module: `validateDesignChange(change, ctx)`

Returns `{ valid: boolean, errors: string[], warnings: string[] }`

```
Rules derived from official AWS documentation:

VPC Rules (source: docs.aws.amazon.com/vpc/latest/userguide/vpc-cidr-blocks.html):
├─ CIDR prefix must be /16 to /28
├─ Primary CIDR must be RFC 1918 (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16) — warn if not
├─ Secondary CIDRs cannot overlap primary or other secondaries
├─ Maximum 5 IPv4 CIDR blocks per VPC (default)
└─ Avoid 172.17.0.0/16 (Docker/SageMaker conflict) — warning

Subnet Rules (source: docs.aws.amazon.com/vpc/latest/userguide/subnet-sizing.html):
├─ CIDR must fall within a VPC CIDR block
├─ CIDR prefix must be /16 to /28
├─ Cannot overlap any existing subnet in the same VPC
├─ 5 IPs reserved per subnet (network, router, DNS, future, broadcast)
├─ Minimum usable IPs = 2^(32-prefix) - 5 (must be > 0, so /28 minimum)
├─ One subnet = one AZ (cannot span AZs)
└─ Maximum 200 subnets per VPC (default)

IGW Rules (source: docs.aws.amazon.com/vpc/latest/userguide/amazon-vpc-limits.html):
├─ Hard limit: exactly 1 IGW per VPC
├─ Must be attached to function
└─ Horizontally scaled (no bandwidth limit)

NAT Gateway Rules (source: docs.aws.amazon.com/vpc/latest/userguide/vpc-nat-gateway.html):
├─ Public NAT must be in a public subnet (subnet with 0.0.0.0/0 → IGW route)
├─ Public NAT requires Elastic IP
├─ Maximum 5 NAT Gateways per AZ (default)
├─ Warn: best practice is 1 NAT per AZ for HA
└─ Private NAT: no EIP needed, no IGW route needed

Route Table Rules (source: docs.aws.amazon.com/vpc/latest/userguide/VPC_Route_Tables.html):
├─ Local route is immutable (auto-created, cannot modify destination)
├─ Only one route per unique destination CIDR per route table
├─ Cannot add routes to 169.254.168.0/22 (reserved for IMDS/DNS)
├─ Maximum 500 routes per route table (default, raised from 50 in June 2025)
├─ 0.0.0.0/0 → IGW makes the associated subnets "public"
└─ Longest prefix match determines routing priority

Security Group Rules (source: docs.aws.amazon.com/vpc/latest/userguide/amazon-vpc-limits.html):
├─ Maximum 500 SGs per VPC (default)
├─ Maximum 60 inbound rules per SG (default, adjustable to 200)
├─ Maximum 60 outbound rules per SG (default)
├─ Maximum 5 SGs per ENI (default)
├─ Hard limit: combined SGs × rules per ENI ≤ 1,000
└─ Allow-only (no deny rules)

Peering Rules (source: docs.aws.amazon.com/vpc/latest/peering/vpc-peering-basics.html):
├─ No transitive peering (A↔B and A↔C does not give B↔C)
├─ CIDRs cannot overlap between peered VPCs (including secondary CIDRs)
├─ Only 1 peering connection per VPC pair
├─ Maximum 50 active peering connections per VPC (default)
└─ Cannot use peer VPC's IGW, NAT, or VPN

NACL Rules (source: docs.aws.amazon.com/vpc/latest/userguide/vpc-network-acls.html):
├─ Stateless (must define both inbound and outbound)
├─ Rule numbers 1-32766 (lowest evaluated first, first match wins)
├─ * rule (deny all) is immutable catch-all
├─ Maximum 20 rules per direction per NACL (default, max 40)
└─ Ephemeral ports (1024-65535) must be opened for return traffic
```

### Validation Integration Points

1. **Form submission** — `showDesignForm()` calls `validateDesignChange()` before `addDesignChange()`
   - Errors: block submission, show in form-error div
   - Warnings: show in form-hint div with orange color, allow override

2. **Apply pipeline** — `applyDesignChanges()` validates each change against current state
   - Errors: skip the change, mark in change log with red ⚠️
   - Warnings: apply but annotate

3. **Plan import** — `importDesignPlan()` validates each change before adding
   - Report validation summary after import

4. **Export** — `exportDesignPlan()` runs full validation on final state
   - Annotate CLI commands with `# ⚠️ WARNING:` comments
   - Include validation summary in exported JSON

---

## Phase 2: Empty-State Design (VPC Creation from Scratch)

### New Action: `add_vpc`

**Apply function:**
```
add_vpc(ch):
  - Parse in_vpcs textarea
  - Generate VPC ID: vpc-design-{timestamp}
  - Create VPC object: { VpcId, CidrBlock, Tags, IsDefault: false }
  - Push to VPCs array
  - Create default route table: { RouteTableId, VpcId, Routes: [{local}] }
  - Create default NACL: { NetworkAclId, VpcId, Entries: [allow-all in/out] }
  - Create default SG: { GroupId, VpcId, GroupName: 'default' }
  - Write all three textareas
```

**Validation (via validateDesignChange):**
- CIDR prefix /16 to /28
- CIDR is valid RFC 1918 (warn if not)
- CIDR doesn't overlap any existing VPC CIDRs
- Not 172.17.0.0/16 (warn: Docker conflict)

**CLI generation:**
```
aws ec2 create-vpc --cidr-block 10.0.0.0/16 --tag-specifications 'ResourceType=vpc,Tags=[{Key=Name,Value=my-vpc}]'
# Note: Default route table, NACL, and SG are created automatically by AWS
```

### Empty-State UI Flow

When Design Mode is entered with no data:

1. Show a **design canvas** instead of the "No data" empty state
   - Replace `emptyState` div with a design-mode aware version
   - Display: "Start designing — create your first VPC" with a prominent button
   - Include region selector dropdown (affects AZ options)

2. **VPC creation form** appears in detail panel:
   - Name, CIDR block (with RFC 1918 presets: 10.0.0.0/16, 172.16.0.0/16, 192.168.0.0/16)
   - Region selector (populates AZ dropdown for subsequent subnet forms)
   - IP usage calculator: shows total IPs, usable IPs, reserved IPs

3. After VPC is created, re-render the map:
   - VPC box appears (empty, just CIDR label)
   - Clicking it opens detail panel with design toolbar: + Subnet, + Gateway, + SG
   - User can now use all existing design operations

4. **Region-aware AZ generation:**
   - Store selected region in design state
   - `_detectAZs()` uses: loaded data AZs > design region AZs > fallback
   - Region → AZ mapping for common regions:
     - us-east-1: 6 AZs (a-f)
     - us-west-2: 4 AZs (a-d)
     - eu-west-1: 3 AZs (a-c)
     - ap-southeast-1: 3 AZs (a-c)
     - etc.

### Canvas for Design-Only Mode

When in design mode with 0 loaded VPCs but design changes pending:
- Skip the early-return at line 4465 (`if(!vpcs.length&&!subnets.length)`)
- Instead, check: `if(!vpcs.length && !subnets.length && !_designMode) { show empty state }`
- Allow renderMap to proceed — the grid layout will render whatever design changes produce
- Add a subtle "DESIGN" watermark to the SVG background

---

## Phase 3: Multi-Account Data Support

### Problem: VPC ID collisions across accounts

AWS VPC IDs are unique within an account+region, but NOT globally unique. Two accounts can both have `vpc-0abc123`.

### Solution: Account-Prefixed Composite Keys

**Input change:** Add an optional "Account" field per data section, OR auto-detect from ARNs.

**Account ID detection strategy (ordered by reliability):**

1. **Explicit input:** New textarea or dropdown per paste allowing user to tag with account alias/ID
2. **ARN extraction:** Many AWS resources include ARNs containing the account ID:
   - `arn:aws:ec2:us-east-1:123456789012:vpc/vpc-xxx`
   - `arn:aws:lambda:us-east-1:123456789012:function:my-func`
   - Parse with regex: `arn:aws:[^:]+:[^:]*:(\d{12}):`
3. **Owner ID:** Some resources (VPCs, SGs) have an `OwnerId` field containing the account ID
4. **Fallback:** `default` account if no identifier found

**Context building change:**

Current:
```
subByVpc[vpc.VpcId] = [...]
```

Proposed:
```
// Compute composite key at parse time
vpc._accountId = detectAccountId(vpc) || 'default'
vpc._compositeId = vpc._accountId + ':' + vpc.VpcId

// Use composite key in ALL lookups
subByVpc[vpc._compositeId] = [...]
sgByVpc[vpc._compositeId] = [...]
```

**All affected lookup maps:**
- `subByVpc` — keyed by VPC composite ID
- `sgByVpc` — keyed by VPC composite ID
- `instBySub` — keyed by subnet composite ID (inherits account from parent VPC)
- `eniBySub` — same
- `albBySub` — same
- `rdsBySub` — same
- `ecsBySub` — same
- `lambdaBySub` — same
- `subRT` — keyed by subnet composite ID
- `subNacl` — same
- `ecacheByVpc` — keyed by VPC composite ID
- `redshiftByVpc` — same
- `volByInst` — keyed by instance composite ID
- `snapByVol` — keyed by volume composite ID
- `tgByAlb` — keyed by ALB composite ID
- `wafByAlb` — same
- `cfByAlb` — same

**Rendering changes:**
- Display account badge on VPC boxes: `[123456789012]` or user-supplied alias
- Group VPCs by account in resource list
- Color-code by account (auto-assign palette per unique account ID)
- Show account column in all resource list tables

**Peering/TGW cross-account display:**
- VPC peering connections already have `RequesterVpcInfo.OwnerId` and `AccepterVpcInfo.OwnerId`
- Render peering lines with account labels at each end
- TGW attachments show `ResourceOwnerId` — display in TGW detail panel

### Backward Compatibility

- If no account ID detected and only one set of data: behaves identically to current code
- Composite key with `default:` prefix is transparent
- No breaking changes to existing demo data or single-account users

### Data Input UX

Option A: **Account wrapper textarea** (simpler)
```
Paste format stays the same. Add a small "Account" label input above each section.
User types "prod-account" or "123456789012" and all resources pasted below inherit it.
```

Option B: **Multi-paste modal** (more powerful)
```
A dedicated "Import Data" modal with:
1. Account ID / Alias input
2. Region selector
3. Large textarea for all JSON
4. "Add Another Account" button
5. Shows account/region/resource summary before import
```

**Recommendation:** Option A for v28 (minimal UI change), Option B as future enhancement.

### Duplicate Detection

When `ext()` concatenates arrays, scan for duplicate resource IDs:
```
After concatenation:
  const seen = new Map();  // id → accountId
  vpcs.forEach(v => {
    const existing = seen.get(v.VpcId);
    if (existing && existing !== v._accountId) {
      // Different accounts, same ID — composite key handles this
    } else if (existing === v._accountId) {
      // Same account, duplicate paste — deduplicate by keeping latest
      // Warn user
    }
    seen.set(v.VpcId, v._accountId);
  });
```

---

## Phase 4: Validation Engine Implementation

### `_awsConstraints` — Centralized Constraint Registry

```
const _awsConstraints = {
  vpc: {
    cidrPrefixMin: 16,        // /16 = 65,536 IPs
    cidrPrefixMax: 28,        // /28 = 16 IPs (11 usable)
    maxCidrsPerVpc: 5,        // 1 primary + 4 secondary
    maxPerRegion: 5,          // default quota
    reservedCidrs: ['172.17.0.0/16'],  // warn only
    rfc1918: ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16']
  },
  subnet: {
    cidrPrefixMin: 16,
    cidrPrefixMax: 28,
    reservedIps: 5,           // first 4 + last 1
    maxPerVpc: 200
  },
  igw: {
    maxPerVpc: 1              // HARD limit
  },
  nat: {
    maxPerAz: 5,
    requiresPublicSubnet: true,
    requiresEip: true
  },
  routeTable: {
    maxPerVpc: 200,
    maxRoutesPerTable: 500,
    reservedDestinations: ['169.254.168.0/22'],
    localRouteImmutable: true
  },
  securityGroup: {
    maxPerVpc: 500,
    maxInboundRules: 60,
    maxOutboundRules: 60,
    maxPerEni: 5,
    hardLimitRulesPerEni: 1000
  },
  nacl: {
    maxPerVpc: 200,
    maxRulesPerDirection: 20,
    ruleNumberMin: 1,
    ruleNumberMax: 32766
  },
  peering: {
    maxActivePerVpc: 50,
    noTransitive: true,
    noOverlappingCidrs: true,
    onePeerPerVpcPair: true
  }
};
```

### `validateDesignChange(change, ctx)` — Per-Action Validation

```
validateDesignChange(change, ctx) → { valid, errors[], warnings[] }

For add_vpc:
  ✓ CIDR is valid (parseCIDR succeeds)
  ✓ Prefix is /16 to /28
  ✓ No overlap with existing VPC CIDRs in same account
  ⚠ Warn if not RFC 1918
  ⚠ Warn if 172.17.0.0/16

For add_subnet:
  ✓ VPC exists
  ✓ CIDR is valid
  ✓ Prefix is /16 to /28
  ✓ CIDR falls within VPC CIDR (or secondary CIDRs)
  ✓ No overlap with other subnets in same VPC
  ✓ Subnet count < 200 for this VPC
  ⚠ Usable IPs calculation shown (total - 5 reserved)
  ⚠ Warn if single-AZ (no matching subnet in other AZs)

For add_gateway (IGW):
  ✓ VPC does NOT already have an IGW attached ← CRITICAL
  ✓ IGW count for this VPC is 0

For add_gateway (NAT):
  ✓ Target subnet exists
  ✓ Target subnet is public (has 0.0.0.0/0 → IGW route)
  ✓ NAT count < 5 in this AZ
  ⚠ Warn if AZ already has a NAT (recommend 1 per AZ)

For add_route:
  ✓ Route table exists
  ✓ Destination CIDR is valid
  ✓ Destination is not 169.254.168.0/22 or subset
  ✓ No existing route with same destination CIDR in this RT
  ✓ Route count < 500 for this RT
  ⚠ Warn if destination = 0.0.0.0/0 and target is IGW (makes subnets public)

For split_subnet:
  ✓ Resulting prefix is ≤ /28 (both halves must be ≥ /28)
  ✓ Current prefix < /28 (can split /27 into two /28s, but cannot split /28)
  ⚠ Warn about instance migration requirements
  ⚠ Show usable IPs for each resulting half

For add_security_group:
  ✓ SG count < 500 for this VPC
  ✓ Inbound rules count ≤ 60
  ⚠ Warn if rule allows 0.0.0.0/0 on non-HTTP/HTTPS port

For remove_resource:
  ⚠ Warn about dependencies (e.g., removing subnet with running instances)
  ⚠ Warn about IGW removal if subnets have public routes
  ⚠ Warn about NAT removal if private subnets route through it

For add_resource:
  ⚠ Show subnet remaining capacity (usable IPs - current resource count)
```

### `validateDesignState(changes, ctx)` — Full State Validation

Runs after all changes are applied. Checks **cross-change consistency:**

```
Cross-change checks:
  ✓ No subnet CIDR overlaps (including newly added subnets from multiple add_subnet changes)
  ✓ No duplicate routes across all changes targeting same RT
  ✓ IGW count per VPC = 0 or 1 after all changes
  ✓ All NAT gateways still in public subnets (in case a route was removed making a subnet private)
  ✓ VPC peering CIDRs still don't overlap (in case secondary CIDRs were added)
  ✓ All quotas respected cumulatively

Returns: { valid, errors[], warnings[], stats: { subnetsAdded, gatewaysAdded, ... } }
```

### Validation Result Display

**In change log:** Each entry shows validation status icon:
- Green checkmark: valid
- Orange triangle: has warnings
- Red X: has errors (will not apply)

**In export:** Validation summary section at top of exported JSON:
```json
{
  "validation": {
    "status": "warnings",
    "errors": [],
    "warnings": [
      "NAT Gateway nat-design-xxx is in AZ us-east-1a which already has a NAT (prod-nat-1a). AWS recommends 1 per AZ.",
      "Security Group sg-design-xxx allows 0.0.0.0/0 on port 22 (SSH). Consider restricting source CIDR."
    ]
  }
}
```

---

## Implementation Order

### Phase 2a: VPC Creation + Empty State (enables from-scratch design)
1. Add `add_vpc` to `_designApplyFns` with VPC + default RT + default NACL + default SG creation
2. Add VPC creation form to `showDesignForm('add_vpc', ...)`
3. Modify renderMap early-return to allow rendering in design mode with 0 loaded VPCs
4. Add "Create VPC" button to empty state when in design mode
5. Add region selector with AZ mapping table
6. Add `_generateCLI` for `add_vpc`

### Phase 2b: Validation Engine Core
1. Create `_awsConstraints` constant object
2. Implement `validateDesignChange(change, ctx)` for each action type
3. Integrate into `showDesignForm()` — validate before `addDesignChange()`
4. Integrate into `applyDesignChanges()` — validate during apply, annotate failures
5. Add validation status icons to change log
6. Add validation to `importDesignPlan()`
7. Add validation summary to `exportDesignPlan()` output

### Phase 3: Multi-Account Support
1. Add account label input to sidebar section headers
2. Implement `detectAccountId()` — OwnerId field → ARN parse → user label → 'default'
3. Add `_compositeId` to all parsed resources
4. Refactor all lookup maps to use composite keys
5. Add duplicate detection in `ext()` concatenation
6. Add account badge rendering on VPC boxes
7. Group-by-account in resource list
8. Color-code VPCs by account
9. Update demo to optionally generate 2-account data

### Phase 4: Advanced Validation + HA Analysis
1. `validateDesignState()` — full cross-change consistency check
2. HA analyzer: detect single-AZ deployments, missing NAT redundancy
3. Cost estimation: approximate monthly cost for designed resources
4. Subnet IP capacity visualization (used/available/reserved)
5. Route path tracing: visualize packet path from source to destination through the designed network

---

## Key Decisions

### Why dual-layer validation (form + apply)?
- Form validation gives instant feedback but can be bypassed (import, programmatic)
- Apply validation is the safety net that prevents invalid state
- Matches AWS behavior: the console warns you, but the API enforces constraints

### Why composite keys instead of separate data stores per account?
- Minimal refactoring: same data structures, just different key format
- All existing rendering code works with VPC objects — just need to pass composite ID through
- Peering/TGW naturally crosses accounts — composite keys let us follow the connection

### Why not a full rewrite to a framework?
- The current monolith works. Adding validation is additive, not structural.
- Module extraction (Vite split) is orthogonal — can happen before or after these features
- Users don't care about architecture; they care about: can I design from empty? does it catch my mistakes?

---

## Sources

- [VPC CIDR blocks](https://docs.aws.amazon.com/vpc/latest/userguide/vpc-cidr-blocks.html)
- [Subnet sizing](https://docs.aws.amazon.com/vpc/latest/userguide/subnet-sizing.html)
- [Amazon VPC quotas](https://docs.aws.amazon.com/vpc/latest/userguide/amazon-vpc-limits.html)
- [NAT gateways](https://docs.aws.amazon.com/vpc/latest/userguide/vpc-nat-gateway.html)
- [Route tables](https://docs.aws.amazon.com/vpc/latest/userguide/VPC_Route_Tables.html)
- [VPC peering basics](https://docs.aws.amazon.com/vpc/latest/peering/vpc-peering-basics.html)
- [Network ACLs](https://docs.aws.amazon.com/vpc/latest/userguide/vpc-network-acls.html)
- [Default security groups](https://docs.aws.amazon.com/vpc/latest/userguide/default-security-group.html)
- [Multi-account network connectivity](https://docs.aws.amazon.com/prescriptive-guidance/latest/transitioning-to-multiple-aws-accounts/network-connectivity.html)
- [VPC sharing](https://aws.amazon.com/blogs/networking-and-content-delivery/vpc-sharing-a-new-approach-to-multiple-accounts-and-vpc-management/)
- [Well-Architected Reliability Pillar: Multi-AZ](https://docs.aws.amazon.com/wellarchitected/latest/reliability-pillar/rel_fault_isolation_multiaz_region_system.html)
