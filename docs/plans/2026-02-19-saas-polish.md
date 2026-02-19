# SaaS Polish Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform the app from "dev tool with textareas" into a polished SaaS product — landing dashboard, sidebar facelift, IAM→dashboard link, unified dashboard CSS, chip consistency, missing CSS token.

**Architecture:** Single-file HTML app (`index.html`, ~24k lines). All changes are CSS + JS within that file. Design doc at `docs/plans/2026-02-19-saas-polish-design.md`. Approved mockup at `mockup-redesign.html`.

**Tech Stack:** Vanilla HTML/CSS/JS, D3.js, IBM Plex Mono/Sans fonts, CSS custom properties (`:root` tokens).

---

## Task 1: Add Missing `--bg-card` CSS Token

**Files:**
- Modify: `index.html:13` (`:root` CSS variables)

**Step 1: Add the token**

On line 13, after `--bg-tertiary:#1a2236;`, add `--bg-card:#141c2e;` to the same line. The line currently reads:

```css
--bg-primary:#0a0e17;--bg-secondary:#111827;--bg-tertiary:#1a2236;
```

Change to:

```css
--bg-primary:#0a0e17;--bg-secondary:#111827;--bg-tertiary:#1a2236;--bg-card:#141c2e;
```

**Step 2: Verify**

Search for `--bg-card` usage in the file. It should appear in `.design-form`, `.iac-box`, `.change-log`, `.change-log-header`. All should now resolve.

**Step 3: Commit**

```
git add index.html && git commit -m "style: add missing --bg-card CSS token"
```

---

## Task 2: Chip Consistency — Stat Chips

**Files:**
- Modify: `index.html:73` (`.stat-chip` CSS)
- Modify: `index.html:9315` (IAM chip inline style — landing zone stats)
- Modify: `index.html:11562` (IAM chip inline style — grid layout stats)

**Step 1: Update `.stat-chip` CSS**

Line 73 currently:
```css
.stat-chip{...border-radius:4px;...backdrop-filter:blur(8px);...}
```

Change `border-radius:4px` to `border-radius:8px` and remove `backdrop-filter:blur(8px);`.

**Step 2: Add accent variant classes**

After line 74 (`.stat-chip:hover{...}`), add:
```css
.stat-chip.accent-amber{border-color:rgba(245,158,11,.3);background:rgba(245,158,11,.08)}
.stat-chip.accent-purple{border-color:rgba(139,92,246,.3);background:rgba(139,92,246,.08)}
.stat-chip.accent-blue{border-color:rgba(59,130,246,.3);background:rgba(59,130,246,.08)}
```

**Step 3: Replace inline IAM chip styles with CSS class**

On line 9315, find `ic.style.cssText='border:1px solid rgba(245,158,11,.3);background:rgba(245,158,11,.08)';` and replace with `ic.classList.add('accent-amber');`.

On line 11562, same replacement.

**Step 4: Verify**

Load demo data, render map, check stats bar. IAM chip should have amber accent, all chips should have 8px radius, no blur artifacts.

**Step 5: Commit**

```
git add index.html && git commit -m "style: unify stat-chip border-radius and add accent classes"
```

---

## Task 3: Chip Consistency — Compliance Chips

**Files:**
- Modify: `index.html:383` (`.compliance-chip` CSS)
- Modify: `index.html:387` (`.compliance-chip:hover` CSS)

**Step 1: Update `.compliance-chip` CSS**

Line 383 — change `padding:4px 10px` to `padding:5px 10px`, `border-radius:10px` to `border-radius:8px`, add `font-weight:500`, and update transition to `transition:border-color .15s,background .15s`.

**Step 2: Replace hover filter**

Line 387: replace `filter:brightness(1.2)` with `border-color:currentColor;background:rgba(255,255,255,.04)`.

**Step 3: Verify**

Load demo, render, hover over compliance chip. Should match stat-chip hover pattern.

**Step 4: Commit**

```
git add index.html && git commit -m "style: align compliance-chip to stat-chip pattern"
```

---

## Task 4: Dashboard Unification — Firewall CSS

**Files:**
- Modify: `index.html:278` (`.fw-dash-hdr` CSS — reduce to gap override)
- Modify: `index.html:286-289` (`.fw-dash-toolbar` CSS — reduce to border-radius override)
- Modify: `index.html:302-305` (`.fw-dash-footer` CSS — keep only `.fw-edit-count`)
- Modify: `index.html:1417` (`.dash-toolbar input` — change border-radius to 6px)

The HTML already has dual classes (`dash-hdr`, `dash-toolbar`, `dash-footer`) on firewall elements (lines 1984, 1990, 2000).

**Step 1: Reduce `.fw-dash-hdr` (line 278)**

Replace the full rule with just: `.fw-dash-hdr{gap:16px}`

**Step 2: Reduce `.fw-dash-toolbar` (lines 286-289)**

Replace all 4 rules with just: `.fw-dash-toolbar input{border-radius:6px}`

**Step 3: Reduce `.fw-dash-footer` (lines 302-305)**

Replace all 4 rules with just: `.fw-dash-footer .fw-edit-count{font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--text-muted);margin-left:auto}`

**Step 4: Normalize toolbar input border-radius**

In `.dash-toolbar input[type="text"]` (line 1417), change `border-radius:4px` to `border-radius:6px`.

**Step 5: Verify**

Open firewall dashboard — layout, toolbar, footer should look identical to before.

**Step 6: Commit**

```
git add index.html && git commit -m "refactor: deduplicate firewall dashboard CSS to unified system"
```

---

## Task 5: Dashboard Unification — BUDR Toolbar

**Files:**
- Modify: `index.html:1427-1431` (`.budr-toolbar` CSS — delete)
- Modify: `index.html:1915` (BUDR toolbar HTML — add class)

**Step 1: Delete `.budr-toolbar` CSS (lines 1427-1431)**

Remove all 5 rules (`.budr-toolbar`, `.budr-toolbar input`, `.budr-toolbar input:focus`, `.budr-toolbar label`, `.budr-toolbar select`).

**Step 2: Add `dash-toolbar` class to HTML**

Line 1915: `<div class="budr-toolbar" id="budrToolbar">` → `<div class="budr-toolbar dash-toolbar" id="budrToolbar">`

**Step 3: Verify**

Open BUDR dashboard — toolbar should look identical.

**Step 4: Commit**

```
git add index.html && git commit -m "refactor: deduplicate BUDR toolbar CSS to unified system"
```

---

## Task 6: Dashboard Unification — Governance Toolbar

**Files:**
- Modify: `index.html:511-515` (`.gov-toolbar` CSS — delete)
- Modify: `index.html:1937` (Gov toolbar HTML — add class)

**Step 1: Delete `.gov-toolbar` CSS (lines 511-515)**

Remove all 5 rules.

**Step 2: Add `dash-toolbar` class to HTML**

Line 1937: `<div class="gov-toolbar" id="govToolbar"></div>` → `<div class="gov-toolbar dash-toolbar" id="govToolbar"></div>`

**Step 3: Verify**

Open governance dashboard — toolbar renders correctly.

**Step 4: Commit**

```
git add index.html && git commit -m "refactor: deduplicate governance toolbar CSS to unified system"
```

---

## Task 7: Dashboard Unification — Reports Footer

**Files:**
- Modify: `index.html:641-643` (`.rpt-footer` CSS — reduce)
- Modify: `index.html:1975` (Reports footer HTML — add class)

**Step 1: Reduce `.rpt-footer` CSS**

Replace lines 641-643 with just the unique overrides:
```css
.rpt-footer{justify-content:flex-end}
.rpt-footer button:hover{background:rgba(245,158,11,.1);border-color:#f59e0b}
```

**Step 2: Add `dash-footer` class to HTML**

Line 1975: `<div class="rpt-footer">` → `<div class="rpt-footer dash-footer">`

**Step 3: Verify**

Open reports builder — footer renders correctly with generate buttons.

**Step 4: Commit**

```
git add index.html && git commit -m "refactor: deduplicate reports footer CSS to unified system"
```

---

## Task 8: Dashboard Unification — Normalize Header Font Sizes

**Files:**
- Modify: `index.html:510` (`.gov-hdr h2` — remove redundant properties)

**Step 1: Reduce governance h2 override**

Line 510: `.gov-hdr h2{font-family:'IBM Plex Mono',monospace;font-size:16px;color:#8b5cf6;margin:0}`

Replace with: `.gov-hdr h2{color:#8b5cf6}`

The `font-family`, `font-size:15px`, and `margin:0` come from `.dash-hdr h2` (line 1414).

**Step 2: Verify**

Open governance dashboard — header h2 should be 15px (matching all other dashboards).

**Step 3: Commit**

```
git add index.html && git commit -m "style: normalize dashboard header h2 to 15px"
```

---

## Task 9: IAM Panel → Dashboard Button

**Files:**
- Add CSS after `.iam-risk-card` rules (after line 312)
- Modify: `index.html:7193` (after risk cards in `case 'IAM'`)
- Add click handler near line 7224

**Step 1: Add `.iam-dashboard-link` CSS**

After line 312, add:
```css
.iam-dashboard-link{background:rgba(139,92,246,.06);border:1px solid rgba(139,92,246,.2);border-radius:8px;padding:10px 14px;margin:0 0 10px;cursor:pointer;font-family:'IBM Plex Mono',monospace;font-size:11px;color:#a78bfa;display:flex;align-items:center;justify-content:space-between;transition:all .15s}
.iam-dashboard-link:hover{background:rgba(139,92,246,.12);border-color:rgba(139,92,246,.4)}
```

**Step 2: Add the link in JS**

After line 7193 (`items.push(riskHtml);`), add:
```js
items.push('<div class="iam-dashboard-link" data-action="open-gov-dash">Open Full Governance Dashboard <span style="opacity:.6">\u2192</span></div>');
```

**Step 3: Add click handler**

Find where IAM click handlers are wired (around line 7224+, in the same case block). Add delegation for `.iam-dashboard-link`:
```js
panel.querySelectorAll('.iam-dashboard-link').forEach(function(el){
  el.addEventListener('click',function(){
    document.getElementById('detailPanel').classList.remove('open');
    openGovernanceDashboard();
    if(typeof _govDashState!=='undefined')_govDashState.tab='iam';
  });
});
```

**Step 4: Verify**

Load demo, click IAM chip, see "Open Full Governance Dashboard →" below risk cards. Clicking opens governance dashboard.

**Step 5: Commit**

```
git add index.html && git commit -m "feat: add governance dashboard link to IAM panel"
```

---

## Task 10: Sidebar Facelift — Brand Area

**Files:**
- Modify: `index.html:1453-1455` (sidebar header HTML)
- Add CSS after line 34

**Step 1: Update sidebar header HTML**

Replace lines 1453-1455:
```html
  <div class="sidebar-header">
    <h1><img src="logo.png" alt="Logo" style="width:28px;height:28px;border-radius:50%;vertical-align:middle;margin-right:6px">AWS Network Map <span style="font-size:8px;color:var(--text-muted);font-weight:400">v33</span></h1>
    <p>Paste CLI JSON exports or upload folder</p>
```

With:
```html
  <div class="sidebar-header">
    <div class="brand-row">
      <div class="brand-icon"><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="url(#brandGrad)" stroke-width="1.5"><defs><linearGradient id="brandGrad" x1="0" y1="0" x2="24" y2="24"><stop offset="0%" stop-color="#06b6d4"/><stop offset="100%" stop-color="#3b82f6"/></linearGradient></defs><rect x="2" y="6" width="20" height="4" rx="1"/><rect x="4" y="12" width="16" height="4" rx="1"/><rect x="6" y="18" width="12" height="4" rx="1"/></svg></div>
      <div class="brand-text"><h1>AWS Network Mapper <span class="brand-ver">v1.4</span></h1><p>Infrastructure topology & compliance</p></div>
    </div>
```

**Step 2: Add brand CSS**

After line 34, add:
```css
.brand-row{display:flex;align-items:center;gap:10px;margin-bottom:6px}
.brand-icon{width:36px;height:36px;background:linear-gradient(135deg,rgba(6,182,212,.15),rgba(59,130,246,.15));border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.brand-text h1{font-family:'IBM Plex Mono',monospace;font-size:13px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:var(--accent-cyan);margin-bottom:1px}
.brand-ver{font-size:9px;font-weight:400;color:var(--text-muted);background:var(--bg-primary);padding:1px 5px;border-radius:8px;margin-left:4px;letter-spacing:0;text-transform:none}
.brand-text p{font-size:10px;color:var(--text-muted);font-family:'IBM Plex Mono',monospace}
```

**Step 3: Verify**

Reload — sidebar shows gradient icon, title with version pill, subtitle.

**Step 4: Commit**

```
git add index.html && git commit -m "style: redesign sidebar brand area with gradient icon"
```

---

## Task 11: Sidebar Facelift — Upload Row

**Files:**
- Add CSS for `.btn-action` (around upload button area)
- Modify: `index.html:1463-1468` (upload row HTML)

**Step 1: Add `.btn-action` CSS**

Add after existing upload-row styles:
```css
.upload-row{padding:8px 14px;display:flex;gap:4px;flex-wrap:wrap}
.btn-action{padding:6px 12px;border:none;border-radius:8px;font-family:'IBM Plex Mono',monospace;font-size:10px;font-weight:600;cursor:pointer;transition:all .15s;display:inline-flex;align-items:center;gap:4px;text-transform:uppercase;letter-spacing:.3px;color:#fff}
.btn-action:hover{transform:translateY(-1px);box-shadow:0 4px 12px rgba(0,0,0,.3)}
.btn-action.green{background:linear-gradient(135deg,#10b981,#059669)}
.btn-action.amber{background:linear-gradient(135deg,#f59e0b,#d97706)}
.btn-action.indigo{background:linear-gradient(135deg,#6366f1,#4f46e5)}
```

**Step 2: Update upload row HTML**

Replace upload button elements (lines 1463-1468) — change `btn-upload` classes to `btn-action` variants, add Unicode icons before text. Keep the existing `id` attributes and `style="display:none"` on folder buttons.

**Step 3: Verify**

Reload — upload row shows gradient-styled buttons with icons and hover elevation.

**Step 4: Commit**

```
git add index.html && git commit -m "style: upgrade upload row buttons with gradient action style"
```

---

## Task 12: Sidebar Facelift — Section Headers & Bodies

**Files:**
- Modify: `index.html:44` (`.sec-hdr` CSS)
- Add CSS after line 48 (dot and badge)
- Modify: `index.html:49` (`.sec-body` CSS)
- Modify: `index.html:2203-2204` (section building JS)

**Step 1: Update `.sec-hdr` CSS (line 44)**

Change `padding:7px 14px` to `padding:10px 14px`, add `gap:8px`, remove `justify-content:space-between`.

New: `.sec-hdr{display:flex;align-items:center;gap:8px;padding:10px 14px;background:var(--bg-tertiary);border-bottom:1px solid var(--border);cursor:pointer;user-select:none}`

**Step 2: Add dot and badge CSS**

After line 48:
```css
.sec-dot{width:4px;height:16px;border-radius:2px;flex-shrink:0}
.sec-badge{font-family:'IBM Plex Mono',monospace;font-size:8px;padding:1px 6px;border-radius:8px;background:rgba(16,185,129,.12);color:#10b981;font-weight:600;margin-left:auto}
.sec-hdr .arr{margin-left:0}
```

**Step 3: Update `.sec-body` CSS (line 49)**

Add `background:rgba(0,0,0,.08)` to the rule.

**Step 4: Update section building JS (lines 2203-2204)**

Add dot color logic based on section name, insert `.sec-dot` span before section title. Keep existing collapse/expand logic.

**Step 5: Verify**

Reload — sections have colored accent dots, slightly more padding, bodies have subtle background.

**Step 6: Commit**

```
git add index.html && git commit -m "style: add accent dots and rhythm to sidebar sections"
```

---

## Task 13: Sidebar Facelift — Textareas & Footer

**Files:**
- Modify: `index.html:55` (`.ji` CSS — height and resize)
- Modify: `index.html:54` (`.ig-lbl code` — font size)
- Modify: `index.html:58` (`.sidebar-actions` — add background)
- Modify: `index.html:59` (`.btn` — border-radius)

**Step 1: Update textarea CSS (line 55)**

Change `height:48px` to `height:56px`, `resize:vertical` to `resize:none`.

**Step 2: Update label font size (line 54)**

Change `font-size:8px` to `font-size:9px`.

**Step 3: Add footer background (line 58)**

Add `background:var(--bg-tertiary)` to `.sidebar-actions`.

**Step 4: Update button border-radius (line 59)**

Change `border-radius:6px` to `border-radius:8px`.

**Step 5: Verify**

Reload — textareas taller, no resize handle, footer has background, buttons have 8px radius.

**Step 6: Commit**

```
git add index.html && git commit -m "style: refine sidebar textareas, labels, and footer"
```

---

## Task 14: Landing Dashboard — HTML & CSS

**Files:**
- Add CSS after `.empty-state` rules (after line 69)
- Modify: `index.html:1498` (replace/augment `#emptyState` div)

**Step 1: Add landing dashboard CSS**

After line 69, add ~40 lines of landing dashboard styles:
- `.landing` — full-screen overlay with flex column, scroll
- `.landing-hero` — centered icon, h1, tagline
- `.landing-icon` — gradient background, rounded, with stacked-layers SVG
- `.landing-cta` — flex row with primary gradient button and secondary button
- `.landing-cards` — 3-column grid, max 860px
- `.landing-card` — card with left accent bar, 9 color variants, staggered `cardUp` animation
- `.landing-footer` — version, license, link
- `@keyframes cardUp` — fade up from 12px

Reference the mockup at `mockup-redesign.html` for exact styles.

**Step 2: Add landing HTML after `#emptyState`**

Keep `#emptyState` div (hidden icon/title/desc for design mode fallback). Add `#landingDash` div after it with:
- Hero section: gradient icon, h1 "AWS Network Mapper", tagline
- CTA row: "Explore Demo" (primary) + "Import Your Data" (secondary)
- 9 feature cards: Topology Map, Compliance Engine, Flow Analysis, Design Mode, Multi-Region, Backup & DR, Report Builder, IaC Export, Governance
- Footer: version, license, GitHub link

**Step 3: Verify**

Reload — landing dashboard visible with hero, CTAs, 9 cards with staggered animation.

**Step 4: Commit**

```
git add index.html && git commit -m "feat: add polished landing dashboard with feature cards"
```

---

## Task 15: Landing Dashboard — Behavior Wiring

**Files:**
- Modify: `index.html:9660` (hide landing on render)
- Modify: `index.html:9750-9753` (show landing on empty non-design state)
- Modify: `index.html:19997` (show landing on Clear)
- Add JS near line 19998 (CTA button wiring)

**Step 1: Hide landing when map renders (line 9660)**

After `document.getElementById('emptyState').style.display='none';`, add:
`document.getElementById('landingDash').style.display='none';`

**Step 2: Show landing on empty state (lines 9750-9753)**

In the non-design empty state block, add `document.getElementById('landingDash').style.display='flex';` before `return`.

Do NOT show landing in the design-mode empty state (line 9742 block).

**Step 3: Show landing on Clear (line 19997)**

After `document.getElementById('emptyState').style.display='flex';`, add:
`document.getElementById('landingDash').style.display='flex';`

**Step 4: Wire CTA buttons**

After the Clear handler, add:
```js
document.getElementById('landingDemo').addEventListener('click',function(){document.getElementById('loadDemo').click()});
document.getElementById('landingImport').addEventListener('click',function(){document.getElementById('uploadBtn').click()});
```

**Step 5: Verify**

1. Reload → landing shows
2. Click "Explore Demo" → demo loads, landing hides
3. Click Clear → landing reappears
4. Click "Import Your Data" → file picker opens

**Step 6: Commit**

```
git add index.html && git commit -m "feat: wire landing dashboard show/hide and CTA buttons"
```

---

## Task 16: Final Verification

**Step 1: Full smoke test**

1. Reload app → landing dashboard with 9 cards, staggered animation
2. Sidebar has brand row, gradient action buttons, section dots
3. Click "Explore Demo" → map renders, landing hidden
4. Stats bar: chips have 8px radius, IAM chip amber accent
5. Click IAM chip → "Open Full Governance Dashboard" link visible
6. Click governance link → dashboard opens
7. All dashboards render correctly (firewall, BUDR, governance, reports)
8. Click Clear → landing reappears
9. Zero console errors

---

## Critical Files Reference

| Location | What | Action |
|----------|------|--------|
| Line 13 | `:root` CSS vars | Add `--bg-card` |
| Lines 32-34 | `.sidebar-header` CSS | Add brand styles |
| Line 44 | `.sec-hdr` CSS | Update padding/gap |
| Line 49 | `.sec-body` CSS | Add background |
| Line 54 | `.ig-lbl code` CSS | 8px to 9px |
| Line 55 | `.ji` CSS | Height 56px, no resize |
| Lines 58-59 | Footer/btn CSS | Background, 8px radius |
| After 69 | Landing CSS | Add ~40 lines |
| Line 73 | `.stat-chip` CSS | 8px radius, no blur |
| Lines 278-305 | Firewall CSS | Deduplicate |
| Lines 383-387 | `.compliance-chip` CSS | Align to stat-chip |
| Line 510 | `.gov-hdr h2` CSS | Reduce to color only |
| Lines 511-515 | `.gov-toolbar` CSS | Delete |
| Lines 641-643 | `.rpt-footer` CSS | Reduce |
| Lines 1427-1431 | `.budr-toolbar` CSS | Delete |
| Lines 1453-1455 | Sidebar header HTML | Brand row |
| Lines 1463-1468 | Upload row HTML | Action buttons |
| Line 1498 | Empty state HTML | Add landing div |
| Line 1915 | BUDR toolbar HTML | Add class |
| Line 1937 | Gov toolbar HTML | Add class |
| Line 1975 | Reports footer HTML | Add class |
| Lines 2203-2204 | Section building JS | Add dots |
| Line 7193 | IAM panel JS | Add link |
| Lines 9315, 11562 | IAM chip JS | Replace inline styles |
| Line 9660 | Render hide | Also hide landing |
| Lines 9750-9753 | Empty state show | Also show landing |
| Line 19997 | Clear handler | Also show landing |

## Estimated Size
- ~50 lines CSS added, ~30 lines CSS deleted (dedup) = net +20 CSS
- ~30 lines HTML changed
- ~20 lines JS added
- Net delta: ~+70 lines
