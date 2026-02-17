<p align="center">
  <img src="logo-cropped.png" alt="AWS Mapper" width="300">
</p>

<h1 align="center">AWS Network Mapper</h1>

<p align="center">
  Interactive topology mapper for AWS infrastructure. Paste AWS CLI JSON exports and get a visual network map with VPCs, subnets, gateways, EC2 instances, RDS, Lambda, ECS, and more.
</p>

**[Live Demo](https://schylerchase.github.io/aws_mapper/)** | **[Download Desktop App](https://github.com/schylerchase/aws_mapper/releases/latest)**

## Features

### Visualization
- **Visual Network Map** — D3.js SVG canvas with VPCs, public/private subnets, gateways, peering, transit gateways, and 25+ resource types
- **Traffic Flow Tracing** — Trace network paths between resources with SG/NACL/route table evaluation
- **Dependency Graph** — Blast radius analysis for any resource
- **Multi-Account/Multi-Region** — Merge and view multiple AWS accounts side by side
- **Design Mode** — Add VPCs, subnets, and resources from scratch with a drag-and-drop palette

### Compliance & Reporting
- **Compliance Dashboard** — 2800+ checks across CIS, SOC2, HIPAA, PCI-DSS, NIST frameworks with per-framework scoring
- **IAM Analysis** — Effective permissions view with overprivileged principal detection
- **Exportable Reports** — Generate compliance reports as CSV, Excel, or HTML with framework filtering and severity breakdowns
- **Diff/Change Detection** — Compare snapshots to detect added, removed, and modified resources

### Export & Integration
- **Infrastructure as Code** — Export to Terraform HCL or CloudFormation YAML/JSON
- **Diagram Export** — PNG, Visio (.vsdx), Lucidchart (.lucid)
- **Time-Series Snapshots** — Capture, browse, and restore historical infrastructure states
- **Annotations/Notes** — Pin notes to any resource, searchable and exportable

## Quick Start

### Browser (no install)

1. Open the [live demo](https://schylerchase.github.io/aws_mapper/) or `index.html` locally
2. Click **Demo** to see a sample map, or paste your own AWS CLI JSON
3. Click **Render Map**

### Desktop App (Electron)

```bash
npm install
npm start
```

The desktop app adds:
- **Scan AWS** button — runs 29 AWS CLI commands automatically
- Native file save/open/export dialogs
- Import Folder for bulk JSON loading
- Auto-update via GitHub Releases

### Export AWS Data

```bash
# Export all supported resources from your AWS account
./export-aws-data.sh

# With specific profile and region
./export-aws-data.sh -p my-profile -r us-west-2
```

This creates a timestamped folder with JSON files you can upload directly into the mapper.

## Supported AWS Resources

| Category | Resources |
|----------|-----------|
| Network | VPCs, Subnets, Route Tables, NACLs, ENIs |
| Gateways | Internet GW, NAT GW, VPC Endpoints, Transit GW |
| Compute | EC2, Lambda, ECS, ECS Services/Tasks |
| Database | RDS, ElastiCache, Redshift |
| Load Balancing | ALB/NLB, Target Groups |
| Connectivity | VPC Peering, VPN, Transit GW Attachments |
| Storage | S3, EBS Volumes, Snapshots |
| DNS/CDN | Route 53, CloudFront |
| Security | Security Groups, WAF, IAM |

## Build Desktop App

```bash
# macOS
npm run build:mac

# Windows
npm run build:win

# Linux
npm run build:linux
```

Outputs are in `dist/`. macOS builds are unsigned by default — right-click and Open on first launch.

## Architecture

Single-file HTML app (`index.html`) with embedded CSS and JavaScript. D3.js handles SVG rendering. No build step needed for the browser version.

```
index.html          # Complete app
main.js             # Electron main process
preload.js          # Secure IPC bridge
export-aws-data.sh  # AWS CLI export script
package.json        # Electron + build config
```

## License

MIT
