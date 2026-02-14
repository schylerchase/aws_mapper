# Azure Mapper Refactoring Plan (Steelmanned x4)

## Iteration 1: Correct Service Mapping

Every AWS resource type maps to a specific Azure equivalent. Where there is no 1:1 match, the plan specifies the architectural adaptation.

### Resource Mapping Table

| AWS Resource | AWS ID Pattern | Azure Resource | Azure ID Pattern | Azure CLI Command |
|---|---|---|---|---|
| VPC | `vpc-xxxx` | Virtual Network (VNet) | `/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Network/virtualNetworks/{name}` | `az network vnet list` |
| Subnet | `subnet-xxxx` | Subnet | `.../virtualNetworks/{vnet}/subnets/{name}` | `az network vnet subnet list` |
| Security Group | `sg-xxxx` | NSG (NIC-level) | `.../networkSecurityGroups/{name}` | `az network nsg list` |
| Network ACL | `acl-xxxx` | NSG (Subnet-level) | Same as above — NSGs serve both roles | Same — filter by subnet association |
| Route Table | `rtb-xxxx` | Route Table | `.../routeTables/{name}` | `az network route-table list` |
| ENI | `eni-xxxx` | NIC | `.../networkInterfaces/{name}` | `az network nic list` |
| Internet Gateway | `igw-xxxx` | *No discrete resource* — model as system route + Public IPs | N/A — detect via Public IP assignments and system routes | `az network public-ip list` |
| NAT Gateway | `nat-xxxx` | NAT Gateway | `.../natGateways/{name}` | `az network nat gateway list` |
| VPC Endpoint | `vpce-xxxx` | Private Endpoint | `.../privateEndpoints/{name}` | `az network private-endpoint list` |
| EC2 Instance | `i-xxxx` | Virtual Machine | `.../virtualMachines/{name}` | `az vm list` |
| ALB/NLB | `arn:aws:elasticloadbalancing:...` | Application Gateway (L7) / Load Balancer (L4) | `.../applicationGateways/{name}` or `.../loadBalancers/{name}` | `az network application-gateway list` + `az network lb list` |
| Target Group | `arn:aws:elasticloadbalancing:...targetgroup/...` | Backend Pool (within AppGW or LB) | Child resource of LB/AppGW | Included in parent resource JSON |
| VPC Peering | `pcx-xxxx` | VNet Peering | `.../virtualNetworks/{vnet}/virtualNetworkPeerings/{name}` | `az network vnet peering list` |
| VPN Connection | `vpn-xxxx` | VPN Connection | `.../connections/{name}` | `az network vpn-connection list` |
| Transit Gateway | `tgw-xxxx` | Virtual WAN + Virtual Hub | `.../virtualWans/{name}` + `.../virtualHubs/{name}` | `az network vwan list` + `az network vhub list` |
| TGW Attachment | `tgw-attach-xxxx` | Virtual Hub Connection | `.../virtualHubs/{hub}/hubVirtualNetworkConnections/{name}` | `az network vhub connection list` |
| EBS Volume | `vol-xxxx` | Managed Disk | `.../disks/{name}` | `az disk list` |
| EBS Snapshot | `snap-xxxx` | Snapshot | `.../snapshots/{name}` | `az snapshot list` |
| S3 Bucket | `arn:aws:s3:::name` | Storage Account | `.../storageAccounts/{name}` | `az storage account list` |
| Route 53 Hosted Zone | `/hostedzone/xxxx` | DNS Zone | `.../dnsZones/{name}` | `az network dns zone list` |
| Route 53 Records | N/A | DNS Record Set | `.../dnsZones/{zone}/{recordType}/{name}` | `az network dns record-set list` |
| CloudFront | `arn:aws:cloudfront::...` | Front Door | `.../frontDoors/{name}` | `az network front-door list` |
| WAF WebACL | `arn:aws:wafv2:...` | WAF Policy | `.../ApplicationGatewayWebApplicationFirewallPolicies/{name}` or Front Door WAF | `az network application-gateway waf-policy list` |
| RDS Instance | `arn:aws:rds:...` | Azure SQL / Azure Database for MySQL/PostgreSQL | `.../servers/{name}` | `az sql server list` + `az mysql flexible-server list` + `az postgres flexible-server list` |
| Lambda (VPC) | `arn:aws:lambda:...` | Azure Functions (VNet-integrated) | `.../sites/{name}` | `az functionapp list` |
| ECS Service | `arn:aws:ecs:...` | Azure Container Instances / AKS | `.../containerGroups/{name}` or `.../managedClusters/{name}` | `az container list` + `az aks list` |
| ElastiCache | N/A | Azure Cache for Redis | `.../redis/{name}` | `az redis list` |
| Redshift | `arn:aws:redshift:...` | Azure Synapse Analytics | `.../workspaces/{name}` | `az synapse workspace list` |
| IAM | `arn:aws:iam::...` | Azure RBAC + Entra ID | Role assignments, role definitions, service principals | `az role assignment list` + `az role definition list` + `az ad sp list` |

---

## Iteration 2: Architectural Adaptations for Non-1:1 Mappings

### Adaptation 1: IGW → Outbound Connectivity Model

AWS models internet connectivity as a discrete IGW resource attached to a VPC. Azure does not. Instead, Azure provides internet access via:
1. **System routes** (automatic `0.0.0.0/0 → Internet` on every subnet)
2. **Public IP addresses** assigned to NICs or Load Balancers
3. **NAT Gateways** for outbound-only

**Plan**: Replace IGW nodes in the topology with a composite "Internet Connectivity" indicator that shows:
- Which subnets have NAT Gateway associations
- Which VMs/NICs have Public IPs
- Which Load Balancers have public frontends
- The effective outbound method for each subnet

In the visualization, render this as a gateway-like node labeled "Internet (Public IP)" or "Internet (NAT GW)" at the VNet boundary, preserving the visual pattern users expect.

### Adaptation 2: NACL + SG → Unified NSG Model

AWS has two layers: stateful SGs (instance-level) + stateless NACLs (subnet-level). Azure has one: stateful NSGs that can be applied at both levels.

**Plan**:
- Merge the NACL and SG data models into a single NSG model
- Track NSG associations at both subnet and NIC level
- In traffic flow analysis, evaluate NSG rules at both levels (subnet NSG first for inbound, NIC NSG first for outbound)
- In compliance checks, distinguish between "subnet-level NSG" and "NIC-level NSG" findings
- Preserve the dual-panel UI (subnet security vs instance security) but both panels reference NSGs

### Adaptation 3: Account ID → Subscription ID + Tenant ID

AWS uses 12-digit Account IDs. Azure uses GUIDs for both Subscription ID and Tenant ID.

**Plan**:
- Replace `detectAccountId()` with `detectSubscriptionId()` — extract from resource IDs (`/subscriptions/{guid}/...`)
- Add `detectTenantId()` for cross-tenant scenarios
- Multi-account support → Multi-subscription support
- Color-coding by account → Color-coding by subscription
- Add Resource Group as an intermediate grouping layer (AWS has no equivalent)

### Adaptation 4: ARN → Azure Resource ID

AWS ARNs: `arn:aws:service:region:account:resource-type/resource-id`
Azure IDs: `/subscriptions/{sub}/resourceGroups/{rg}/providers/{namespace}/{type}/{name}`

**Plan**:
- Replace all ARN parsing regex with Azure Resource ID parsing
- Extract subscription, resource group, provider, type, and name from paths
- Update `canDo()` permission evaluation to use Azure resource ID scope matching
- Handle child resources (subnets, peerings, NSG rules) which nest under parent paths

### Adaptation 5: CloudFormation → ARM Templates / Bicep

CloudFormation has no Azure equivalent. The closest are ARM Templates (JSON) and Bicep (DSL).

**Plan**:
- Replace `generateCloudFormation()` with `generateARMTemplate()` producing valid ARM JSON
- Add `generateBicep()` as a second option (Microsoft's recommended IaC)
- ARM structure: `$schema`, `contentVersion`, `parameters`, `variables`, `resources`, `outputs`
- Bicep structure: `param`, `var`, `resource`, `output` declarations

### Adaptation 6: Target Groups → Backend Pools

AWS ALB Target Groups are standalone resources. Azure Backend Pools are child resources of Load Balancers / Application Gateways.

**Plan**:
- Inline backend pool data within the parent LB/AppGW resource parsing
- Adjust topology links: ALB → TG → EC2 becomes AppGW → Backend Pool → VM

---

## Iteration 3: File-by-File Implementation Plan

### File 1: `package.json`
- `name`: `"aws-network-mapper"` → `"azure-network-mapper"`
- `description`: `"AWS Network Topology Mapper"` → `"Azure Network Topology Mapper"`
- `version`: bump to `2.0.0` (major version for breaking change)

### File 2: `.gitignore`
- `aws-export-*/` → `azure-export-*/`

### File 3: `export-azure-data.sh` (rewrite of `export-aws-data.sh`)
Complete rewrite. 29 `az` CLI commands replacing 29 `aws` CLI commands:

```
az network vnet list                          # VNets (was: describe-vpcs)
az network vnet subnet list                   # Subnets per VNet (was: describe-subnets)
az network nsg list                           # NSGs (was: describe-security-groups + describe-network-acls)
az network route-table list                   # Route Tables (was: describe-route-tables)
az network nic list                           # NICs (was: describe-network-interfaces)
az network public-ip list                     # Public IPs (was: describe-internet-gateways)
az network nat gateway list                   # NAT Gateways (was: describe-nat-gateways)
az network private-endpoint list              # Private Endpoints (was: describe-vpc-endpoints)
az vm list --show-details                     # VMs (was: describe-instances)
az network application-gateway list           # App Gateways (was: elbv2 describe-load-balancers for ALB)
az network lb list                            # Load Balancers (was: elbv2 describe-load-balancers for NLB)
az network vnet peering list                  # VNet Peerings per VNet (was: describe-vpc-peering-connections)
az network vpn-connection list                # VPN Connections (was: describe-vpn-connections)
az network vwan list                          # Virtual WANs (was: N/A)
az network vhub list                          # Virtual Hubs (was: N/A)
az network vhub connection list               # Hub connections (was: describe-transit-gateway-attachments)
az disk list                                  # Managed Disks (was: describe-volumes)
az snapshot list                              # Snapshots (was: describe-snapshots)
az storage account list                       # Storage Accounts (was: s3api list-buckets)
az network dns zone list                      # DNS Zones (was: route53 list-hosted-zones)
az network dns record-set list                # DNS Records per zone (was: route53 list-resource-record-sets)
az network front-door list                    # Front Door (was: cloudfront list-distributions)
az network application-gateway waf-policy list # WAF Policies (was: wafv2 list-web-acls)
az sql server list                            # SQL Servers (was: rds describe-db-instances)
az sql db list                                # SQL Databases per server
az functionapp list                           # Function Apps (was: lambda list-functions)
az container list                             # Container Instances (was: ecs)
az redis list                                 # Redis Cache (was: elasticache describe-cache-clusters)
az synapse workspace list                     # Synapse (was: redshift describe-clusters)
az role assignment list                       # RBAC assignments (was: iam get-account-authorization-details)
az role definition list --custom-role-only    # Custom role definitions
az ad sp list --all                           # Service principals
```

Key changes:
- Input validation: subscription name + resource group (not profile + region)
- Output directory: `azure-export-{subscription}-{YYYYMMDD-HHMMSS}/`
- Azure CLI uses `--subscription` flag for multi-sub queries
- Some commands need iteration (subnets per VNet, peerings per VNet, DNS records per zone, DBs per server)

### File 4: `preload.js`
- `aws:scan` → `azure:scan`
- `aws:check-cli` → `azure:check-cli`
- `aws:scan:abort` → `azure:scan:abort`
- `scanAWS(opts)` → `scanAzure(opts)` — opts change from `{profile, region}` to `{subscription, resourceGroup}`
- `checkCli()` — detect `az` instead of `aws`
- `onMenuScanAWS` → `onMenuScanAzure`

### File 5: `main.js`
- Menu items: "Scan AWS" → "Scan Azure"
- CLI check: `aws --version` → `az --version`
- Spawn: `export-aws-data.sh` → `export-azure-data.sh`
- Input validation regex: keep `^[a-zA-Z0-9_-]{0,64}$` (valid for Azure subscription names)
- IPC channels: rename all `aws:*` → `azure:*`
- Window title: "AWS Network Mapper" → "Azure Network Mapper"

### File 6: `index.html` (15,730 lines — the bulk of the work)

#### 6a. Global text replacements (safe, mechanical)
- "AWS" → "Azure" (in UI labels, titles, help text, tooltips)
- "Amazon Web Services" → "Microsoft Azure"
- "aws" → "azure" (in CSS classes, IDs, variable names where appropriate)
- ".awsmap" → ".azuremap" (project file format)
- "Account" → "Subscription" (in multi-account context)
- "Region" → "Location" (Azure terminology)

#### 6b. Resource type detection (fileMap ~line 10544)
Replace all pattern arrays with Azure equivalents:
```
{id:'in_vnets',    patterns:['vnet','vnets','virtual-network','virtualnetwork']}
{id:'in_subnets',  patterns:['subnet','subnets']}
{id:'in_nsgs',     patterns:['nsg','nsgs','network-security-group']}
{id:'in_rts',      patterns:['route-table','routetable','rt']}
{id:'in_nics',     patterns:['nic','nics','network-interface','networkinterface']}
{id:'in_pips',     patterns:['pip','public-ip','publicip']}
{id:'in_nats',     patterns:['nat-gw','nat-gateway','natgateway']}
{id:'in_pes',      patterns:['private-endpoint','privateendpoint','pe']}
{id:'in_vms',      patterns:['vm','vms','virtual-machine','virtualmachine']}
{id:'in_appgws',   patterns:['appgw','application-gateway','applicationgateway']}
{id:'in_lbs',      patterns:['lb','load-balancer','loadbalancer']}
{id:'in_peerings', patterns:['peering','vnet-peering','peer']}
{id:'in_vpn',      patterns:['vpn','vpn-connection']}
{id:'in_vwan',     patterns:['vwan','virtual-wan','virtualwan']}
{id:'in_vhubs',    patterns:['vhub','virtual-hub','virtualhub']}
{id:'in_vhubconn', patterns:['hub-connection','hubconnection','vhub-connection']}
{id:'in_disks',    patterns:['disk','disks','managed-disk']}
{id:'in_snaps',    patterns:['snapshot','snapshots','snap']}
{id:'in_storage',  patterns:['storage','storage-account','storageaccount']}
{id:'in_dns',      patterns:['dns-zone','dnszone','dns']}
{id:'in_dnsrecs',  patterns:['dns-record','dnsrecord','record-set','recordset']}
{id:'in_fd',       patterns:['front-door','frontdoor','fd']}
{id:'in_waf',      patterns:['waf','waf-policy','wafpolicy']}
{id:'in_sql',      patterns:['sql','sql-server','sqlserver','sql-db']}
{id:'in_func',     patterns:['function','functionapp','func','azure-function']}
{id:'in_aci',      patterns:['aci','container-instance','containerinstance','container-group']}
{id:'in_redis',    patterns:['redis','cache','azure-cache']}
{id:'in_synapse',  patterns:['synapse','synapse-workspace']}
{id:'in_rbac',     patterns:['rbac','role-assignment','roleassignment']}
```

#### 6c. JSON content detection
Replace AWS response keys with Azure response keys:
- `"Reservations"` → detect `"virtualMachines"` or array with `vmId`
- `"Vpcs"` → detect array with `addressSpace.addressPrefixes`
- `"DBInstances"` → detect array with `fullyQualifiedDomainName`
- `"SecurityGroups"` → detect `"securityRules"` (NSG format)
- etc.

Note: Azure CLI returns flat JSON arrays `[...]`, not wrapped in a named key like `{"Vpcs": [...]}`. Detection will use field presence within array items.

#### 6d. Data parsing (~line 6411)
Replace all `ext(safeParse(...), ['KeyName'])` calls:
```javascript
let vnets = safeParse(gv('in_vnets'));           // Azure CLI returns arrays directly
let subnets = safeParse(gv('in_subnets'));
let nsgs = safeParse(gv('in_nsgs'));
let rts = safeParse(gv('in_rts'));
let nics = safeParse(gv('in_nics'));
let pips = safeParse(gv('in_pips'));
let nats = safeParse(gv('in_nats'));
let pes = safeParse(gv('in_pes'));
let vms = safeParse(gv('in_vms'));
let appgws = safeParse(gv('in_appgws'));
let lbs = safeParse(gv('in_lbs'));
let peerings = safeParse(gv('in_peerings'));
let vpns = safeParse(gv('in_vpn'));
let vwans = safeParse(gv('in_vwan'));
let vhubs = safeParse(gv('in_vhubs'));
let vhubConns = safeParse(gv('in_vhubconn'));
let disks = safeParse(gv('in_disks'));
let snapshots = safeParse(gv('in_snaps'));
let storageAccounts = safeParse(gv('in_storage'));
let dnsZones = safeParse(gv('in_dns'));
let dnsRecords = safeParse(gv('in_dnsrecs'));
let frontDoors = safeParse(gv('in_fd'));
let wafPolicies = safeParse(gv('in_waf'));
let sqlServers = safeParse(gv('in_sql'));
let functionApps = safeParse(gv('in_func'));
let containerGroups = safeParse(gv('in_aci'));
let redisCaches = safeParse(gv('in_redis'));
let synapseWorkspaces = safeParse(gv('in_synapse'));
let rbacData = parseRBACData(safeParse(gv('in_rbac')));
```

#### 6e. Network topology extraction (~lines 6494-6598)
Replace all lookup maps:
- `subByVpc` → `subnetsByVnet` — group subnets by parent VNet (extracted from subnet resource IDs)
- `pubSubs` → `publicSubnets` — subnets where VMs have Public IPs or NAT GW is associated
- `subRT` → `subnetRT` — route table per subnet (via `routeTable` property on subnet)
- `gwSet` → `gatewaySet` — NAT Gateways, VPN Gateways, Virtual Hub connections
- `sgByVpc` → `nsgByVnet` — NSGs grouped by VNet (via subnet/NIC associations)
- `subNacl` → merged into `nsgBySubnet` (subnet-level NSG associations)
- `instBySub` → `vmsBySubnet` — VMs per subnet (via NIC → subnet mapping)
- `eniBySub` → `nicsBySubnet` — NICs per subnet
- `albBySub` → `appgwBySubnet` + `lbBySubnet`
- `volByInst` → `disksByVm` — disks attached to VMs
- `tgByAlb` → backend pools are inline within AppGW/LB JSON
- `wafByAlb` → `wafByAppGw` — WAF policies linked to App Gateways
- `rdsBySub` → `sqlBySubnet` — SQL servers with VNet rules / private endpoints
- `ecsBySub` → `aciBySubnet` — Container Instances per subnet
- `lambdaBySub` → `funcBySubnet` — VNet-integrated Function Apps per subnet
- `ecacheByVpc` → `redisByVnet` — Redis caches in VNet
- `redshiftByVpc` → `synapseByVnet` — Synapse workspaces in VNet
- `cfByAlb` → `fdByAppGw` — Front Door origins pointing to App Gateways

#### 6f. Subscription ID detection (replaces Account ID detection ~line 1014)
```javascript
function detectSubscriptionId(resource) {
  // Extract from Azure resource ID: /subscriptions/{guid}/...
  if (resource.id) {
    const match = resource.id.match(/\/subscriptions\/([0-9a-f-]{36})\//i);
    if (match) return match[1];
  }
  return null;
}
```

#### 6g. Traffic flow analysis (~lines 9450-9656)
Rewrite `traceFlow()` for Azure's networking model:
1. **Route evaluation**: UDRs + system routes (longest prefix match)
2. **NSG evaluation at subnet level**: Check subnet NSG rules (priority-based, first match wins)
3. **NSG evaluation at NIC level**: Check NIC NSG rules
4. **Inbound**: Subnet NSG → NIC NSG (both must allow)
5. **Outbound**: NIC NSG → Subnet NSG (both must allow)
6. **Cross-VNet routing**: VNet peering (non-transitive), Virtual WAN hub routing
7. **Service-level**: App Gateway → Backend Pool → VM

Key difference: Azure NSGs are stateful (no need to check return traffic rules). AWS NACLs are stateless (current code checks both directions).

#### 6h. IAM → RBAC analysis (~lines 3159-3283, 3368+)
Replace `parseIAMData()` with `parseRBACData()`:
- AWS IAM Users/Roles/Policies → Azure Role Assignments + Role Definitions + Service Principals
- `canDo(principal, action, resource)` → evaluate Azure RBAC:
  - Check role assignments at resource, resource group, subscription, and management group scopes
  - Role definitions use `Actions`, `NotActions`, `DataActions`, `NotDataActions`
  - Permissions are additive (union of all role assignments)
  - No explicit deny in standard RBAC (use Azure Policy deny instead)
- Admin detection: `*` in Actions at subscription scope = Owner/Contributor
- Wildcard detection: `Microsoft.*/read` patterns
- Managed Identity analysis (replacing IAM Instance Profiles)
- Service Principal credential expiry checks

#### 6i. Compliance engine rewrite

**CIS Azure Foundations Benchmark v2.1** (replacing CIS AWS Foundations):
| Old Check | New Check | Control |
|---|---|---|
| CIS 5.1 NACL ingress | CIS 6.7 HTTP(S) from internet | NSG inbound rules |
| CIS 5.2 SSH exposure | CIS 6.2 SSH restricted | NSG port 22 rules |
| CIS 5.3 RDP exposure | CIS 6.1 RDP restricted | NSG port 3389 rules |
| CIS 5.4 Default SG | CIS 6.6 UDP restricted | Default NSG rules |
| CIS 5.5 Peering routes | No direct equivalent | VNet peering + NSG enforcement |
| N/A (new) | CIS 6.3 No SQL from 0.0.0.0/0 | SQL firewall rules |
| N/A (new) | CIS 6.4 NSG flow log retention >90d | Flow log config |
| N/A (new) | CIS 6.5 Network Watcher enabled | Network Watcher |
| N/A (new) | CIS 6.8 Azure Bastion exists | Bastion host |

**SOC2**: Update service references (NSGs, Azure Monitor, Entra ID, Key Vault, Defender for Cloud)
**PCI DSS 4.0**: Update for Azure services (NSGs, Azure Firewall, Disk Encryption, TDE, Key Vault)
**HIPAA**: Update for Azure services (Disk Encryption, TLS enforcement, Azure Monitor, Entra ID)
**NIST 800-53**: Update for Azure services (NSGs, Azure Firewall, Private Link, Azure Monitor, Azure Policy)

**WAF checks**: Update for Azure WAF Policy structure (rules, managed rule sets, custom rules)
**IAM checks** → **RBAC checks**:
- IAM-1 Admin role → Owner role at subscription scope
- IAM-2 Wildcard resource → Wildcard Actions in role definitions
- IAM-3 MFA → Entra ID Conditional Access MFA enforcement
- IAM-4 Service wildcards → Broad role assignments (Contributor on subscription)
- IAM-5 Unused roles → Role assignments with no sign-in activity
- IAM-6 Cross-account without ExternalId → Cross-tenant access without conditions
- IAM-7 Inline policies → Custom role definitions (vs built-in)
- IAM-8 Permission boundary → Azure Policy deny assignments

#### 6j. IaC generation rewrite

**Terraform** (`generateTerraform()`):
- Provider: `aws` → `azurerm`
- All `aws_*` resources → `azurerm_*` resources
- Add `azurerm_resource_group` as top-level container
- Key mappings:
  - `aws_vpc` → `azurerm_virtual_network`
  - `aws_subnet` → `azurerm_subnet`
  - `aws_security_group` → `azurerm_network_security_group` + `azurerm_network_security_rule`
  - `aws_route_table` → `azurerm_route_table` + `azurerm_route`
  - `aws_instance` → `azurerm_linux_virtual_machine` / `azurerm_windows_virtual_machine`
  - `aws_lb` → `azurerm_lb` / `azurerm_application_gateway`
  - `aws_nat_gateway` → `azurerm_nat_gateway`
  - `aws_ebs_volume` → `azurerm_managed_disk`
  - `aws_db_instance` → `azurerm_mssql_server` + `azurerm_mssql_database`
  - `aws_lambda_function` → `azurerm_function_app`
  - etc.
- Add subnet-NSG associations: `azurerm_subnet_network_security_group_association`

**ARM Templates** (`generateARMTemplate()` — replaces `generateCloudFormation()`):
- Structure: `$schema`, `contentVersion`, `parameters`, `variables`, `resources`, `outputs`
- Resource types use `Microsoft.Network/virtualNetworks`, `Microsoft.Compute/virtualMachines`, etc.
- API versions required for each resource type
- Dependencies via `dependsOn` array or implicit references

**Bicep** (`generateBicep()` — new, Microsoft-recommended):
- Cleaner syntax: `resource vnet 'Microsoft.Network/virtualNetworks@2023-04-01' = { ... }`
- Implicit dependencies via resource references
- ~50% less code than ARM JSON

**Policy exports**:
- AWS Config Rules → Azure Policy definitions (JSON with `if`/`then` structure, effects: Deny/Audit/DeployIfNotExists)
- OPA Rego → Update resource type references
- Checkov → Update check IDs from CKV_AWS_* to CKV_AZURE_*

#### 6k. Design mode updates
- Resource types: VPC → VNet, EC2 → VM, SG → NSG, etc.
- Validation rules:
  - Azure VNet CIDR: /8 to /29
  - Subnet CIDR: within VNet range, /29 minimum (Azure reserves 5 addresses per subnet)
  - Naming conventions: alphanumeric + `_`, `.`, `-`; max 64 chars for most resources
  - No "public vs private subnet" distinction — model connectivity via NSG + Public IP
- Design constraints: no overlapping VNet CIDRs within peered VNets
- Resource Group as organizational container (new concept vs AWS)

#### 6l. Demo data
- Replace all demo resources with Azure-style resources:
  - VNet IDs, Subnet IDs, NSG IDs (as Azure resource ID paths)
  - Subscription GUIDs instead of 12-digit account IDs
  - Azure locations (eastus, westus2, westeurope) instead of AWS regions
  - Azure-style naming (vnet-prod-01, snet-web-01, nsg-web-01, vm-api-01)
  - NSG rules with priority-based format instead of SG IpPermissions

#### 6m. File format
- `.awsmap` → `.azuremap` extension
- Update save/load serialization to use Azure resource schemas

### File 7: `README.md`
- Complete rewrite: Azure CLI prerequisites, `az login`, subscription selection
- Installation: same Electron setup
- Usage: paste Azure CLI JSON output or use built-in scan
- Screenshots updated for Azure terminology

---

## Iteration 4: Risk Mitigation & Execution Strategy

### Risk 1: The 15,730-line monolith
**Mitigation**: Work methodically through sections. Use search-and-replace for mechanical changes first (branding, naming), then tackle structural changes (data parsing, topology, compliance) section by section.

### Risk 2: Azure CLI JSON format differences
**Mitigation**: Azure CLI returns flat arrays `[{...}, {...}]` while AWS returns wrapped objects `{"Vpcs": [{...}]}`. The `ext()` helper function that unwraps AWS responses needs to be updated to handle flat arrays (or removed since unwrapping is unnecessary). Add fallback: if input is already an array, use it directly.

### Risk 3: Child resource iteration
**Mitigation**: Several Azure resources require parent context (subnets per VNet, peerings per VNet, DNS records per zone, DBs per server). The export script must iterate over parents and aggregate children. Use the same Python-merging approach the current script uses for Route 53 records.

### Risk 4: NSG dual-level evaluation
**Mitigation**: The traffic flow engine currently evaluates SGs and NACLs as separate steps. Refactor to evaluate NSGs at both subnet and NIC levels as a unified pipeline. The key insight: for inbound traffic, subnet NSG is evaluated first; for outbound, NIC NSG is evaluated first. Both must allow.

### Risk 5: Azure Resource ID parsing
**Mitigation**: Create a robust `parseResourceId(id)` utility that extracts:
```javascript
{
  subscriptionId: "guid",
  resourceGroup: "name",
  provider: "Microsoft.Network",
  resourceType: "virtualNetworks",
  resourceName: "vnet-01",
  childType: "subnets",        // optional
  childName: "snet-web-01"     // optional
}
```
Use this throughout instead of ad-hoc regex on AWS IDs.

### Risk 6: Compliance check accuracy
**Mitigation**: Cross-reference all checks against the CIS Azure Foundations Benchmark v2.1, Azure Security Benchmark (MCSB), and Microsoft Defender for Cloud recommendations. Include links to official Microsoft Learn documentation in remediation guidance.

### Execution Order
1. **Phase 1** — Config & identity (package.json, .gitignore) — trivial
2. **Phase 2** — Electron shell (main.js, preload.js) — small, isolated
3. **Phase 3** — Export script (export-azure-data.sh) — complete rewrite, independent of UI
4. **Phase 4** — index.html mechanical changes (branding, text, CSS classes)
5. **Phase 5** — index.html resource model (detection, parsing, topology)
6. **Phase 6** — index.html traffic flow analysis
7. **Phase 7** — index.html compliance engine
8. **Phase 8** — index.html IaC generation (Terraform + ARM + Bicep)
9. **Phase 9** — index.html RBAC analysis
10. **Phase 10** — index.html design mode + demo data
11. **Phase 11** — README.md documentation
