# SaaS Polish Redesign — Design Doc

**Goal:** Transform the app from "dev tool with textareas" into a polished SaaS product. Landing dashboard, sidebar facelift, IAM→dashboard link, unified dashboard system, chip consistency, missing CSS token.

**Mockup:** `mockup-redesign.html` (approved by user)

**Approach:** Full polish (Approach 3) — landing + sidebar + IAM button + dashboard unification + chip consistency

---

## Section 1: Landing Dashboard (replaces empty state)

Replace `#emptyState` div with a product landing screen inside `.main`.

**Structure:**
- Hero: gradient icon (layers SVG), "AWS Network Mapper" h1, one-liner tagline
- CTA row: "Explore Demo" (gradient primary) + "Import Your Data" (secondary)
- Feature cards grid: 3x3 cards with left accent bars, each showcasing a capability
- Footer: version, license, GitHub link

**Cards:** Topology Map, Compliance Engine, Flow Analysis, Design Mode, Multi-Region, BUDR, Report Builder, IaC Export, Governance

**Behavior:**
- Hidden when `_renderMapInner()` runs (same trigger as current emptyState hide)
- Reappears on "Clear" (same trigger as current emptyState show)
- "Explore Demo" calls existing `loadDemo()` flow
- "Import Your Data" triggers folder picker or scrolls to sidebar
- Staggered fade-up animations on load (CSS only, `animation-delay`)

---

## Section 2: Sidebar Facelift

**Consistent padding:** Normalize all horizontal padding to 14px (header 16px→14px is close enough, keep 16px for header only).

**Brand area:** Replace raw h1 with brand row: gradient icon (32px, rounded-8px), title + version badge pill, subtitle.

**Upload row:**
- Replace flat `.btn-upload` with `.btn-action` variants
- Add icons (Unicode arrows/folder) before text
- Add gradient backgrounds matching current colors (green=upload, amber=folder, indigo=script)
- Add hover elevation (`box-shadow` + `translateY(-1px)`)
- Move export script dropdown inline styles to CSS class

**Section headers:**
- Add colored `.sec-dot` (4px wide, 16px tall rounded bar) matching section's accent color
- Add `.sec-badge` showing loaded file count (e.g., "3 loaded") — green accent
- Bump padding from 7px 14px to 10px 14px

**Section body:**
- Add `background:rgba(0,0,0,.08)` for subtle rhythm with headers

**Textareas:**
- Height: 48px → 56px
- Add `placeholder="Paste JSON..."`
- Remove `resize:vertical` → `resize:none` (prevents layout breakage)
- Bump label `code` font from 8px → 9px

**Footer actions:**
- Add `background:var(--bg-tertiary)` to footer bar
- Render Map button: gradient background + box-shadow
- All buttons: `border-radius:6px` → `8px`

---

## Section 3: IAM Panel → Dashboard Button

**Placement:** After risk summary cards, before roles list in `openResourceList('IAM')`.

**Element:** `div.iam-dashboard-link` styled as:
- Purple accent: `background:rgba(139,92,246,.06)`, `border:1px solid rgba(139,92,246,.2)`
- `border-radius:8px`, padding 10px 14px
- Text: "Open Full Governance Dashboard →"
- Hover: stronger purple background/border

**Action:** Closes detail panel, calls `openGovernanceDashboard()`, switches to IAM tab via `_govDashState.tab='iam'`.

---

## Section 4: Dashboard Unification

All 6 dashboards share `.dash-hdr`, `.dash-toolbar`, `.dash-footer` CSS.

**Firewall (`#fwDash`):**
- Replace `.fw-dash-hdr` usage with `.dash-hdr`
- Replace `.fw-dash-toolbar` with `.dash-toolbar`
- Replace `.fw-dash-footer` with `.dash-footer`
- Join the `_DASH_REGISTRY` nav system (it currently isn't part of it)

**BUDR (`#budrDash`):**
- Replace `.budr-toolbar` with `.dash-toolbar` (already uses `.dash-hdr`/`.dash-footer`)

**Governance (`#govDash`):**
- Replace `.gov-toolbar` with `.dash-toolbar`

**Reports (`#rptBuilder`):**
- Replace `.rpt-footer` with `.dash-footer`

**All dashboards:**
- Normalize header h2 to 15px (remove individual 16px overrides)
- Normalize footer button hover to unified pattern (remove per-dashboard color overrides)
- Normalize toolbar input `border-radius` from 4px to 6px

---

## Section 5: Chip Consistency

**`.stat-chip`:**
- `border-radius: 4px` → `8px`
- Remove `backdrop-filter:blur(8px)` (no visual benefit on dark bg)
- Add variant classes: `.accent-amber`, `.accent-purple`, `.accent-blue` (replace inline styles in JS)

**`.compliance-chip`:**
- `border-radius: 10px` → `8px` (match stat-chip)
- `padding: 4px 10px` → `5px 10px` (match stat-chip)
- Add `font-weight:500` (match stat-chip)
- Replace `filter:brightness(1.2)` hover with `border-color` + `background` change (match stat-chip pattern)

---

## Section 6: Missing `--bg-card` Token

Add to `:root`:
```css
--bg-card:#141c2e;
```

This fixes the undefined variable used in `.design-form`, `.iac-box`, `.change-log`, `.change-log-header`.

---

## Non-Goals (explicitly excluded)

- Font changes (IBM Plex Mono aesthetic is intentional and good)
- Color palette changes (existing tokens are well-designed)
- Dashboard content/functionality changes
- Mobile responsiveness pass
- Animation library additions (CSS-only animations)
