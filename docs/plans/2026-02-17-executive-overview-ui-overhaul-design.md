# Executive Overview UI Overhaul

**Date:** 2026-02-17
**Status:** Approved

## Problem

Two UI areas in the Executive Overview layout need improvement:

1. **Top header** — "Executive Overview" title + tiny 7px resource chips are cramped, hard to read, lack context (no region, no compliance score), and waste vertical space poorly
2. **Bottom toolbar** — flat row of 12+ pill buttons with no grouping, competing visually with the separate "Global Services" SVG section

## Design

### 1. Dashboard Header Card (SVG)

Replace the inline title + chips with a frosted-glass dashboard header card.

**Layout:**
```
┌──────────────────────────────────────────────────────────────────┐
│  Executive Overview                              us-east-1      │
│                                                                  │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ...   │
│  │  598 │ │  154 │ │   26 │ │    5 │ │    4 │ │  164 │        │
│  │  EC2 │ │  Sub │ │  ALB │ │  RDS │ │  ECS │ │   SG │        │
│  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘ └──────┘        │
│                                                                  │
│  Compliance: 78% ████████░░                                     │
└──────────────────────────────────────────────────────────────────┘
```

**Specifics:**
- Background: `rgba(17,24,39,.85)` with 1px border `var(--border)`, rounded corners (rx=8)
- Title: 14px font weight 700, left-aligned
- Region: 10px muted text, right-aligned on same line as title
- Stat cards: grid of ~60x40px mini cards, each with:
  - Count on top (12px, bold, colored per resource type)
  - Label below (8px, muted)
  - Colored left border (3px, matching resource color)
  - Background: `rgba(255,255,255,.03)`
  - Hover: `rgba(255,255,255,.08)` + border brightens
  - Click: opens resource list (existing behavior)
- Compliance bar: horizontal progress bar with percentage, colored green/yellow/red based on score
- Global Services (S3, R53, CloudFront, TGW, VPN, Peering) absorbed into the stat cards grid — no separate SVG section needed

**Where:** `renderExecutiveOverview()` around line 7021-7057, replaces existing `hdrG` group and `hdrStats` rendering.

### 2. Grouped Dock Toolbar (HTML)

Replace the flat `#bottomToolbar` with a grouped, frosted-glass dock.

**Layout:**
```
┌────────────────────────────────────────────────────────────────────┐
│ Save  Open  │  Search  Compare  History  │  Trace  Flow  ...     │
│    FILE     │        ANALYZE             │      NETWORK          │
└────────────────────────────────────────────────────────────────────┘
```

**Groups:**
1. **FILE** — Save, Open
2. **ANALYZE** — Search, Compare, History
3. **NETWORK** — Trace, Flow, Firewall
4. **VIEW** — Notes, Accounts

**Specifics:**
- Container: `backdrop-filter:blur(12px)`, `rgba(17,24,39,.88)`, `border-radius:12px`, `border:1px solid var(--border)`
- Group dividers: 1px vertical line, `rgba(255,255,255,.08)`, 18px height
- Group labels: 7px uppercase, `var(--text-muted)`, centered below each group
- Buttons: keep existing colors per button, but:
  - Remove individual borders (container provides the border)
  - Add subtle SVG icons (inline, 12px) before labels
  - Consistent padding: `6px 12px`
  - Hover: background glow matching button color at 12% opacity
- Help (?) button: stays as circular, positioned at start or end
- Scan AWS button: stays hidden unless Electron, appended to FILE group
- Design button: stays separate, positioned at far right (already separate)

**Where:** `#bottomToolbar` HTML at line 1082-1096, plus CSS at line 70 area.

**Icons (inline SVG, no external deps):**
- Save: floppy disk
- Open: folder
- Search: magnifying glass
- Compare: two overlapping squares
- History: clock
- Trace: route/path
- Flow: wave/arrow
- Firewall: shield
- Notes: pencil/notepad
- Accounts: people/users

### 3. Global Services Section Removal

The "Global Services" SVG section (line 7063-7095) currently renders S3/R53/CloudFront/TGW/VPN/Peering as cards below all VPCs. These counts are absorbed into the dashboard header stat cards grid, so this section is removed from the executive overview layout.

The `sharedCard()` function and its rendering block can be deleted from `renderExecutiveOverview()`.

## Files Modified

- `index.html` — all changes in single file:
  - CSS: new `.dock-toolbar`, `.dock-group`, `.dock-divider`, `.dock-label` styles; update executive overview header SVG styles
  - HTML: restructure `#bottomToolbar` with grouped containers
  - JS: rewrite header rendering in `renderExecutiveOverview()`, remove Global Services section, add compliance bar to header

## Scope

- Executive Overview layout only (grid and landing zone layouts unchanged)
- Bottom toolbar affects all layouts (it's shared HTML)
- No new dependencies
- No breaking changes to existing functionality
