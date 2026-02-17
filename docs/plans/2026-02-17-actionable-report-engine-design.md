# Actionable Report Engine — Design Document

**Date:** 2026-02-17
**Status:** Phase 1 of Dashboard Integration Rethink
**Goal:** Transform compliance reporting from raw data dumps into prioritized, actionable remediation plans

---

## Problem

The compliance system generates findings but doesn't help users decide what to fix first. Reports dump flat tables of findings — same output regardless of audience (security team, executives, auditors). The dashboard feels like an afterthought overlay rather than an integrated feature.

**Core pain points:**
- No prioritization — 50 findings with no guidance on order
- No effort estimation — a 5-minute SG fix looks the same as a week-long VPC redesign
- No resource grouping — 4 findings on the same SG show as 4 separate rows
- Not actionable — shows problems but doesn't structure them as a remediation plan

---

## Design

### 1. Priority Tier System

Each finding is classified into an action tier based on **severity x effort**:

| Tier | Name | Criteria | Color |
|------|------|----------|-------|
| 1 | **Fix Now** | CRITICAL (any effort) OR HIGH + Quick Fix | `#ef4444` (red) |
| 2 | **This Sprint** | HIGH + Moderate/Project OR MEDIUM + Quick Fix | `#f59e0b` (amber) |
| 3 | **Backlog** | MEDIUM + Moderate/Project, LOW (any effort) | `#3b82f6` (blue) |

### 2. Effort Classification

Each compliance control maps to an effort level based on real-world remediation complexity:

**Quick Fix** (~5 min, config change):
- Security group rule changes (CIS 5.2, 5.3, 5.4, WAF-NET-2, WAF-NET-3)
- NACL rule edits (CIS 5.1)
- Enabling encryption flags (ARCH-ENC-*)
- Enabling logging/monitoring (SOC2-LOG-*)
- Tag additions (ARCH-TAG-*)
- Default SG cleanup

**Moderate** (~1-2 hrs, infrastructure change):
- Route table restructuring (CIS 5.5, ARCH-RT-*)
- Adding NAT gateways (ARCH-NAT-*)
- Subnet splitting/reorganization
- Creating dedicated SGs (WAF-SEC-*)
- IAM policy tightening (IAM-*)
- Multi-AZ for single-AZ resources (ARCH-HA-*)

**Project** (~1+ days, architecture change):
- VPC redesign / CIDR re-planning (ARCH-VPC-*)
- Migrating resources between subnets
- Implementing VPC endpoints (ARCH-VPCE-*)
- Network segmentation overhauls
- Full encryption-at-rest migration for existing data

Unmapped controls default to **Moderate**.

### 3. Resource Clustering

Findings on the same resource are grouped into a single **resource card**:

```
[sg-abc123 — Security Group "web-sg"]          3 findings
  CRITICAL  CIS 5.2   SSH open to 0.0.0.0/0         Quick Fix
  HIGH      WAF-NET-2 Overly permissive egress       Quick Fix
  MEDIUM    CIS 5.4   Default SG has rules           Quick Fix

  Remediation:
  1. Remove inbound rule allowing 0.0.0.0/0 on port 22
  2. Restrict egress to required destinations only
  3. Migrate workloads off default SG, then remove its rules
```

Resource card severity = worst finding severity. Cards sort by worst severity, then by finding count.

### 4. In-App Dashboard Changes

Add a **view toggle** to the existing compliance dashboard header:

- **Table** — Current flat findings table (unchanged, for power users)
- **Action Plan** — New default view with tier sections and resource cards

**Action Plan view layout:**

```
[Executive Summary]  (existing — score ring, severity bars, framework scores)

[Action Summary Bar]
  ┌─────────────┐  ┌──────────────────┐  ┌─────────────┐
  │  3 Fix Now   │  │  8 This Sprint    │  │  14 Backlog  │
  │  ~15 min     │  │  ~6 hrs           │  │  ~2 weeks    │
  └─────────────┘  └──────────────────┘  └─────────────┘

[Fix Now]  ─────────────────────────────────────
  [Resource Card] sg-abc123 ...
  [Resource Card] nacl-def456 ...

[This Sprint]  ──────────────────────────────────
  [Resource Card] vpc-ghi789 ...
  ...

[Backlog]  ──────────────────────────────────────
  [Resource Card] ... (collapsed by default)
```

Each tier section header shows total estimated effort (sum of effort estimates).

Resource cards are interactive:
- Click to expand/collapse findings
- **Jump** button zooms to resource on map
- **Mute** works per-finding within the card
- Effort tag on each finding (Quick Fix / Moderate / Project)

### 5. HTML Report Enhancement

The exported HTML report restructures to match the Action Plan view:

1. **Header** — Title, date, compliance score ring
2. **Action Summary** — Three tier cards with counts and effort totals
3. **Fix Now Section** — Red header, resource cards with numbered remediation steps
4. **This Sprint Section** — Amber header, same card format
5. **Backlog Section** — Blue header, same card format
6. **Framework Scorecard** — Existing framework scores grid
7. **Appendix** — Full findings table (for auditors wanting raw data)

Print-friendly with page breaks between sections.

### 6. CSV/Excel Enhancement

Three new columns added to existing exports:
- `Priority Tier` — Fix Now / This Sprint / Backlog
- `Effort` — Quick Fix / Moderate / Project
- `Resource Group` — Groups same-resource findings (shared resource ID)

Sorted by tier (Fix Now first), then by severity within tier.

---

## What Stays the Same

- Executive summary section (score ring, severity bars, framework scores, top risky resources)
- Compliance check engine (all existing checks, finding format)
- Export modal with framework/severity/muted filters
- Mute system
- Jump-to-resource
- Table view (now secondary, toggled)

---

## Implementation Notes

- Effort mapping is a static JS object keyed by control ID prefix
- `_classifyTier(finding)` returns tier based on severity + effort lookup
- `_groupByResource(findings)` returns array of resource cards
- Action Plan view reuses existing `.comp-*` CSS namespace
- Frontend-design skill should be used for the Action Plan UI to ensure it feels like a premium, integrated feature — not another afterthought panel
- Phase 2 (future): Full dashboard integration rethink across compliance, firewall, flow, trace
