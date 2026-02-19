<p align="center">
  <img src="logo-cropped.png" alt="AWS Mapper" width="300">
</p>

<h1 align="center">AWS Network Mapper</h1>

<p align="center">
  Interactive topology visualization, compliance auditing, and infrastructure reporting for AWS environments.
</p>

<p align="center">
  <a href="https://schylerchase.github.io/aws_mapper/">Live Demo</a> &middot;
  <a href="https://github.com/schylerchase/aws_mapper/releases/latest">Download Desktop App</a> &middot;
  <a href="#quick-start">Quick Start</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-1.4.0-blue" alt="Version">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License">
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux%20%7C%20Browser-lightgrey" alt="Platform">
</p>

---

## What It Does

Paste AWS CLI JSON exports (or scan directly from the desktop app) and get an interactive network map with compliance scoring, traffic flow tracing, governance rules, and exportable reports. Zero backend, zero dependencies for the browser version.

---

## Features

### Visualization
- D3.js SVG canvas with VPCs, public/private subnets, gateways, peering, transit gateways, and 25+ resource types
- Three layout modes: **Grid** (columns), **Landing Zone** (hub-spoke), **Executive Overview**
- Traffic flow tracing with SG/NACL/route table evaluation and flow analysis dashboard
- Blast radius analysis for any resource
- Multi-account and multi-region side-by-side view with region column gaps and boundary badges
- **Design Mode**: build infrastructure from scratch with a drag-and-drop palette

### Multi-Region Support
- Import multi-region AWS export folders (PowerShell `-AllRegions` output) in one click
- Automatic region detection from folder structure, ARNs, and availability zones
- Region columns with 120px gaps and pill-badge labels showing VPC counts
- Works in both the desktop app (native folder picker) and browser (File System Access API)
- Backward compatible: single-region data renders identically to before

### Compliance Engine
89 controls across 7 frameworks, evaluated against every applicable resource:

| Framework | Controls | Coverage |
|-----------|----------|----------|
| CIS Benchmarks | 7 | Network ACLs, security groups, routing |
| SOC 2 | 16 | CC6/CC7/CC8, availability, confidentiality |
| PCI DSS 4 | 15 | Network segmentation, encryption, access control |
| IAM Security | 13 | Overprivileged principals, policy analysis |
| AWS Architecture | 22 | Best practices, HA, fault tolerance |
| BUDR | 12 | Backup, uptime, disaster recovery |
| WAF | 4 | Web application firewall rules |

Full compliance dashboard with severity filtering, framework breakdowns, and remediation guidance.

### Governance Rules Engine
- Custom governance rules with visual editor
- Severity levels, auto-fix suggestions, and real-time evaluation
- Governance dashboard with per-rule pass/fail breakdown

### Backup & Disaster Recovery (BUDR)
- RTO/RPO assessment across RDS, EC2, ECS, Lambda, ElastiCache, Redshift, ALB, S3, EBS
- Three tiers: Protected, Partial, At Risk
- Export as CSV, JSON, or XLSX

### Report Builder
Modular report generator with drag-to-reorder sections, live preview, and standalone HTML export:
- Executive Summary
- Architecture Diagram (embedded SVG/PNG)
- Compliance Findings
- BUDR Assessment
- Resource Inventory
- Action Plan
- IaC Recommendations

### Flow Analysis
- Ingress/egress path mapping for all resources
- Bastion host detection and access tier classification
- Flow analysis dashboard with filtering, sorting, and pagination
- One-click trace launch from any flow entry

### Export Formats

| Format | Description |
|--------|-------------|
| PNG | Map screenshot |
| Visio (.vsdx) | Import into Visio/Lucidchart |
| Lucidchart (.lucid) | Native Lucidchart format |
| Terraform HCL | With import blocks (Terraform 1.5+) |
| CloudFormation | YAML/JSON templates |
| HTML Report | Standalone compliance/assessment report |
| CSV / XLSX | Compliance findings and BUDR assessments |
| .awsmap | Full project save/restore |

### Other Capabilities
- Landing dashboard with feature overview and quick-start CTAs
- IAM detail panel links directly to governance dashboard IAM tab
- Snapshot timeline: capture, browse, and compare historical infrastructure states
- Diff/change detection between snapshots with dashboard
- Firewall editor dashboard (SG/NACL management)
- Annotations: pin searchable notes to any resource
- Auto-save to browser every 30 seconds

---

## Quick Start

### Browser (no install)

1. Open the [live demo](https://schylerchase.github.io/aws_mapper/) or `index.html` locally
2. The landing dashboard shows all features -- click **Load Demo** or **Import Data** to get started
3. Click **Render Map** after pasting AWS CLI JSON

### Desktop App (Electron)

Download from [Releases](https://github.com/schylerchase/aws_mapper/releases/latest). Available for macOS (.dmg), Windows (.exe), and Linux (.AppImage).

The desktop app adds:
- **Scan AWS** button -- runs 29 AWS CLI commands automatically
- Native file save/open/export dialogs
- **Import Folder** for bulk JSON loading (including multi-region folders)
- BUDR XLSX export
- Auto-update via GitHub Releases

### Export AWS Data

Two export scripts are included for extracting data from your AWS accounts:

**Bash** (macOS / Linux):
```bash
./export-aws-data.sh
./export-aws-data.sh -p my-profile -r us-west-2
```

**PowerShell** (Windows / Cross-platform):
```powershell
.\export-aws-data.ps1
.\export-aws-data.ps1 -Profile my-profile -Region us-west-2
.\export-aws-data.ps1 -Profile my-profile -AllRegions
```

The `-AllRegions` flag exports all active regions into subfolders that the mapper auto-detects as a multi-region import.

---

## Supported AWS Resources

| Category | Resources |
|----------|-----------|
| Network | VPCs, Subnets, Route Tables, NACLs, ENIs |
| Gateways | Internet GW, NAT GW, VPC Endpoints, Transit GW |
| Compute | EC2, Lambda, ECS Services/Tasks, ElastiCache, Redshift |
| Database | RDS |
| Load Balancing | ALB/NLB, Target Groups |
| Connectivity | VPC Peering, VPN, Transit GW Attachments |
| Storage | S3, EBS Volumes, Snapshots |
| DNS/CDN | Route 53, CloudFront |
| Security | Security Groups, WAF, IAM |

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `/` | Search resources |
| `D` | Toggle Design Mode |
| `F` | Zoom to fit |
| `N` | Notes / Annotations |
| `H` | Snapshot timeline |
| `?` | Help overlay |
| `Shift+A` | Accounts panel |
| `Shift+B` | BUDR Assessment |
| `Shift+C` | Compliance Dashboard |
| `Shift+D` | Compare / Diff |
| `Shift+R` | Report Builder |
| `Shift+T` | Traffic Trace |
| `Shift+F` | Firewall Editor |
| `Shift+G` | Governance Dashboard |
| `Ctrl+S` | Save project |
| `+` / `-` | Zoom in / out |

---

## License

MIT
