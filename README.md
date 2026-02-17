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

---

## What It Does

Paste AWS CLI JSON exports (or scan directly from the desktop app) and get an interactive network map with compliance scoring, traffic tracing, and exportable reports. Zero backend, zero dependencies for the browser version.

## Features

### Visualization
- D3.js SVG canvas with VPCs, public/private subnets, gateways, peering, transit gateways, and 25+ resource types
- Three layout modes: Grid (columns), Landing Zone (hub-spoke), Executive Overview
- Traffic flow tracing with SG/NACL/route table evaluation
- Blast radius analysis for any resource
- Multi-account / multi-region side-by-side view
- Design Mode: build infrastructure from scratch with a drag-and-drop palette

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
- Snapshot timeline: capture, browse, and compare historical infrastructure states
- Diff/change detection between snapshots
- Firewall editor dashboard (SG/NACL management)
- Annotations: pin searchable notes to any resource
- Auto-save to browser every 30 seconds

## Quick Start

### Browser (no install)

1. Open the [live demo](https://schylerchase.github.io/aws_mapper/) or `index.html` locally
2. Click **Demo** to load sample data, or paste your own AWS CLI JSON
3. Click **Render Map**

### Desktop App (Electron)

```bash
npm install
npm start
```

The desktop app adds:
- **Scan AWS** button -- runs 29 AWS CLI commands automatically
- Native file save/open/export dialogs
- Import folder for bulk JSON loading
- BUDR XLSX export (via Python/pandas)
- Auto-update via GitHub Releases

### Export AWS Data

```bash
# Export all supported resources from your AWS account
./export-aws-data.sh

# With specific profile and region
./export-aws-data.sh -p my-profile -r us-west-2
```

Creates a timestamped folder with JSON files you can upload directly into the mapper.

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
| `Ctrl+S` | Save project |
| `+` / `-` | Zoom in / out |

## Build Desktop App

```bash
# macOS
npm run build:mac

# Windows
npm run build:win

# Linux
npm run build:linux
```

Outputs are in `dist/`. macOS builds are unsigned by default -- right-click and Open on first launch.

## Architecture

Single-file HTML app (`index.html`) with embedded CSS and JavaScript. D3.js handles SVG rendering. No build step needed for the browser version.

```
index.html           # Complete app (~20k lines)
main.js              # Electron main process
preload.js           # Secure IPC bridge
export-aws-data.sh   # AWS CLI export script (29 commands)
budr_export_xlsx.py  # BUDR Excel export (Python/pandas)
package.json         # Electron + build config
```

## License

MIT
