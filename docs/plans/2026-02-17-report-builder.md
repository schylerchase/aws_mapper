# Report Builder Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a modular report builder that lets users compose custom assessment reports from all app data sources, generating a self-contained HTML deliverable.

**Architecture:** Full-screen overlay UI with a module registry pattern. Each report section is a standalone render function (`_RPT_MODULES[]`). Users toggle/reorder modules via draggable cards in a left panel, preview in real-time on the right, and generate a single HTML file. All code lives in `index.html`.

**Tech Stack:** Vanilla JS, D3.js (for SVG capture), HTML5 drag-and-drop API, inline CSS in generated report.

**Security Note:** All user-facing strings are escaped via the existing `esc()` helper before DOM insertion. Report data comes exclusively from the app's own parsed AWS JSON — no untrusted external input enters the render pipeline.

---

### Task 1: Report Module Registry + CSS

**Files:**
- Modify: `index.html` — insert CSS after BUDR dashboard CSS block (~line 510), insert JS module registry after BUDR `_getBUDRTierCounts()` (~line 2842)

**Step 1: Add Report Builder CSS**

Insert after `#budrExportXLSX` CSS rule (~line 510). Full-screen overlay (same z-index pattern as `.budr-dash`), two-column layout with `.rpt-picker` (320px left) and `.rpt-preview` (flex right), module cards with drag states, preset pills, metadata inputs, footer with generate button. Mobile responsive breakpoint at 768px stacks columns vertically.

**Step 2: Add module registry JS**

Insert after `_getBUDRTierCounts()` (~line 2842). Define `_RPT_MODULES` array with 7 module objects (exec-summary, architecture, compliance, budr, inventory, action-plan, iac-recs). Each has `id`, `name`, `icon`, `enabled`, `available()`, `desc()`, `render()`. Add `_rptState` object for order/title/author/date.

**Step 3: Verify no syntax errors** — open app, check console.

**Step 4: Commit** — `feat(report): add report module registry and builder CSS`

---

### Task 2: Report Builder HTML + Overlay Open/Close

**Files:**
- Modify: `index.html` — insert overlay HTML after `budrDash` div (~line 1433), add event handlers

**Step 1: Add report builder HTML**

Two-column overlay: left panel with presets div, metadata inputs (title, author, date), and modules container; right panel with preview frame. Footer has "Generate HTML Report" button.

**Step 2: Add open/close JS**

`openReportBuilder()` populates metadata fields, calls `_renderRptPicker()` and `_renderRptPreview()`, adds `.open` class. Close button removes `.open`.

**Step 3: Add ESC handler** — insert before BUDR dash handler in escape chain.

**Step 4: Add Shift+R shortcut** — toggle report builder open/closed.

**Step 5: Rewire dock Reports button** — call `openReportBuilder()` instead of compliance export modal.

**Step 6: Add to help overlay** — `Shift+R → Report Builder` row.

**Step 7: Verify** — Shift+R opens, Esc closes, dock button works.

**Step 8: Commit** — `feat(report): add builder overlay with open/close and keyboard shortcuts`

---

### Task 3: Section Picker with Drag-to-Reorder

**Files:**
- Modify: `index.html` — add `_renderRptPicker()` with presets, module cards, checkbox handlers, HTML5 drag-and-drop reorder

**Step 1: Implement `_renderRptPicker()`**

- Render preset buttons (Full Assessment, Compliance Only, BUDR Only, Diagram + Inventory)
- Render module cards in current order with grip handle, checkbox, icon, name, description count
- Disabled cards for unavailable modules (no data)
- Checkbox change toggles `m.enabled` and re-renders preview
- Drag-and-drop: `dragstart`/`dragover`/`drop` handlers reorder `_rptState.order` array, re-render both panels

**Step 2: Verify** — drag reorder works, presets toggle correct modules.

**Step 3: Commit** — `feat(report): add section picker with presets and drag-to-reorder`

---

### Task 4: Module Render Functions (Executive Summary + Architecture Diagram)

**Files:**
- Modify: `index.html` — add `_rptCSS()`, `_rptExecSummary()`, `_rptArchDiagram()`

**Step 1: Add `_rptCSS()` — returns inline CSS string for generated HTML**

Dark theme (navy/slate), `@media print` white background override, table styles, severity badges, tier badges, stat grid, code blocks, page-break hints.

**Step 2: Add `_rptExecSummary()`**

Reads `_rlCtx` for resource counts (VPCs, subnets, EC2, RDS, ALBs, ECS, Lambda, SGs). Shows stat grid boxes. Adds compliance posture summary (critical/high counts) and BUDR posture summary (protected/partial/at_risk).

**Step 3: Add `_rptArchDiagram()`**

Clones `#mapSvg`, removes zoom transform, embeds app CSS, adds background rect, serializes to SVG data URI. For preview uses SVG; for final export converts to PNG via canvas (`_rptCapturePNG()` async helper).

**Step 4: Verify** — enable both modules in builder, preview shows stats and map.

**Step 5: Commit** — `feat(report): add executive summary and architecture diagram modules`

---

### Task 5: Module Render Functions (Compliance + BUDR + Inventory)

**Files:**
- Modify: `index.html` — add `_rptCompliance()`, `_rptBUDR()`, `_rptInventory()`

**Step 1: Add `_rptCompliance()`**

Groups findings by framework, sorts by severity within each group. Renders per-framework tables with columns: Severity, Control, Resource, Finding, Remediation. Uses severity badge classes.

**Step 2: Add `_rptBUDR()`**

Shows tier summary stat boxes (protected/partial/at_risk with accent colors). Renders assessment table sorted by tier (at_risk first): Type, Resource, Tier, RTO, RPO, Signals. Then findings table if any.

**Step 3: Add `_rptInventory()`**

Iterates resource groups (VPCs, Subnets, EC2, RDS, ALBs, ECS, Lambda). Each group renders a table with ID, Name, and type-specific columns (CIDR, State, Engine, Runtime, etc.). Extracts Name from Tags.

**Step 4: Verify** — all three modules render correctly with real data.

**Step 5: Commit** — `feat(report): add compliance, BUDR, and inventory render modules`

---

### Task 6: Module Render Functions (Action Plan + IaC Recommendations)

**Files:**
- Modify: `index.html` — add `_rptActionPlan()`, `_rptIaCRecs()`

**Step 1: Add `_rptActionPlan()`**

Combines `_complianceFindings` + `_budrFindings`, uses existing `_getTierGroups()` to bucket into Fix Now / This Sprint / Backlog. Renders each tier as a table with Severity, Framework, Control, Resource, Finding, Remediation.

**Step 2: Add `_rptIaCRecs()`**

Filters CRITICAL/HIGH findings (top 10), renders each with severity badge, control ID, resource name, message, and remediation as a code block. Defaults to disabled in module registry.

**Step 3: Verify** — both modules render, action plan shows tier grouping.

**Step 4: Commit** — `feat(report): add action plan and IaC recommendations modules`

---

### Task 7: Preview Renderer + HTML Export

**Files:**
- Modify: `index.html` — add `_renderRptPreview()`, `_generateReport()`, export handler, meta field listeners

**Step 1: Add `_renderRptPreview()`**

Reads enabled modules in current order. Builds preview: header (title/author/date), table of contents with anchor links, rendered sections in order, footer with timestamp. Wraps each `m.render()` in try/catch for resilience.

**Step 2: Add meta field change handlers**

Title/author/date inputs call `_renderRptPreview()` on input/change and update `_rptState`.

**Step 3: Add `_generateReport()`**

Async function. If architecture module is enabled, calls `_rptCapturePNG()` to get base64 PNG. Assembles full HTML document: `<!DOCTYPE html>` + `<head>` with `_rptCSS()` inline + `<body>` with all enabled sections. Downloads via `downloadBlob()`. Filename: slugified title + date + `.html`.

**Step 4: Wire export button**

`document.getElementById('rptExportHTML').addEventListener('click', _generateReport)`

**Step 5: Verify full flow** — toggle sections, preview updates, generate HTML, open in browser, print to PDF.

**Step 6: Commit** — `feat(report): add live preview renderer and HTML export`

---

### Task 8: Polish and Integration

**Files:**
- Modify: `index.html` — async PNG capture, mobile CSS, edge cases

**Step 1: Add `_rptCapturePNG()` async helper**

Returns Promise that resolves to base64 PNG data URL. Clones SVG, renders to canvas, calls `canvas.toDataURL('image/png')`. Used by `_generateReport()` for architecture section in final HTML.

**Step 2: Update `_rptArchDiagram()` to accept optional PNG override**

When called from `_generateReport()` with a pre-captured PNG, use that instead of SVG data URI.

**Step 3: Add mobile responsive CSS**

At 768px breakpoint: stack picker/preview vertically, picker gets max-height 40vh.

**Step 4: End-to-end verification**

1. Load AWS data, render map
2. Shift+R opens builder
3. Toggle sections, drag to reorder, preview updates
4. "Full Assessment" preset enables all
5. Edit title/author/date — preview reflects
6. "Generate HTML Report" downloads file
7. Open HTML — professional, all sections present
8. Print to PDF — clean page breaks
9. Mobile viewport — layout stacks

**Step 5: Commit** — `feat(report): polish with async PNG capture, mobile layout, edge cases`
