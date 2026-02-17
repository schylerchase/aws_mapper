# Interactive Firewall Editor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an interactive NACL/SG/Route Table editor to the subnet detail panel with live trace updates and AWS CLI export.

**Architecture:** Inline edit controls on existing read-only rule sections in `openSubnetPanel()`. Edits mutate `_rlCtx` in place so `traceFlow()` reflects changes immediately. A `_fwEdits` array tracks changes for CLI generation and undo. A full-panel overlay provides a wider editing surface with live visual + CLI output.

**Tech Stack:** Vanilla JS, D3.js (existing), inline HTML rendering (existing pattern). Note: innerHTML usage follows existing codebase patterns where all content is derived from internal data structures, not user-supplied HTML.

---

### Task 1: CSS for Firewall Editor

**Files:**
- Modify: `index.html:209-224` (after existing `.fw-dot` styles)

**Step 1: Add firewall editor CSS**

Insert after line 224 (after `.fw-dot` rule). Includes classes for:
- `.fw-edit-row` (base, `.modified`, `.deleted`, `.new-rule` variants)
- `.fw-edit-btn` (`.edit`, `.del`, `.add`, `.save`, `.cancel` variants)
- `.fw-input`, `.fw-input.invalid`, `.fw-select`
- `.fw-badge` (`.edits`, `.warning` variants)
- `.fw-toolbar` with button styles
- `.fw-full-panel` with `.open` transition, header, tabs, body, bottom split pane, visual pane, CLI pane

**Step 2: Verify no CSS parse errors in console**

**Step 3: Commit**

```
feat(fw): add CSS for inline and full-panel firewall editor
```

---

### Task 2: Data Model and Core Functions

**Files:**
- Modify: `index.html` -- insert new section before `// === FLOW / TRACE ===` (around line 9540)

**Step 1: Add core data model**

Global state:
- `_fwEdits = []` -- tracks all edits
- `_fwSnapshot = null` -- deep clone of original nacls/sgs/rts for reset

Functions to implement:
- `_fwTakeSnapshot()` -- deep clone nacls/sgs/rts on first edit
- `_fwResetAll()` -- restore from snapshot, clear edits
- `_fwRebuildLookups()` -- rebuild subNacl/subRT/sgByVpc maps
- `_fwUndo()` -- pop last edit, reverse it
- `_fwRemoveRule(edit)` -- remove a rule from _rlCtx
- `_fwRestoreRule(edit)` -- restore a deleted rule
- `_fwApplyRule(type, resourceId, direction, ruleData)` -- add/replace rule in _rlCtx
- `_fwRuleMatch(a, b)` -- compare two SG rules for equality
- `_fwEditCount(resourceId)` -- count edits for a resource

**Step 2: Add validation functions**

- `_fwValidateCidr(cidr)` -- regex + range check
- `_fwValidateNaclRule(rule, existingEntries, direction)` -- rule number 1-32766, no dupes, valid CIDR, valid protocol/port combos
- `_fwValidateSgRule(rule)` -- valid protocol, port range, source required
- `_fwValidateRoute(route, existingRoutes)` -- valid destination CIDR, no dupes, target required

**Step 3: Add conflict warning function**

- `_fwCheckNaclShadow(nacl, direction)` -- detect rules shadowed by lower-numbered rules

**Step 4: Add CLI generation**

- `_fwGenerateCli(edits)` -- iterate edits, produce correct AWS CLI command per type:
  - NACL: `create-network-acl-entry`, `replace-network-acl-entry`, `delete-network-acl-entry`
  - SG: `authorize-security-group-ingress/egress`, `revoke-security-group-ingress/egress`
  - RT: `create-route`, `replace-route`, `delete-route`

**Step 5: Verify no runtime errors**

Load demo data, confirm console clean.

**Step 6: Commit**

```
feat(fw): add firewall edit data model, validation, CLI generation
```

---

### Task 3: Inline NACL Editor

**Files:**
- Modify: `index.html` -- replace NACL rendering in `openSubnetPanel()` (lines ~4446-4465) and remove separate NACL Visual section (lines ~4644-4658)

**Step 1: Write NACL rendering functions**

- `_fwRenderNaclInline(nacl, sub)` -- renders full NACL section with edit controls, warnings, toolbar
- `_fwRenderNaclDirection(nacl, entries, direction, sub)` -- renders inbound or outbound rule list with edit/delete buttons per row, add button at bottom, default deny row (read-only)

**Step 2: Write NACL edit form**

- `_fwShowNaclEditForm(naclId, ruleNum, egress, container)` -- renders inline form with inputs for rule number, protocol dropdown (TCP/UDP/ICMP/ALL), port from-to, CIDR, allow/deny toggle, Save/Cancel. Disables port fields for ICMP/ALL protocols.

**Step 3: Write event delegation handler**

- `_fwHandleAction(e, sub, vpcId, lk)` -- handles all `data-fw-action` clicks: `edit-nacl`, `add-nacl`, `delete-nacl`, `save-nacl`, `cancel-edit`, `undo`, `reset`, `export-cli`, `full-editor`
- Save validates via `_fwValidateNaclRule()`, shows `.invalid` class on bad fields
- Delete takes snapshot, removes from Entries, pushes to _fwEdits
- After mutation, re-calls `openSubnetPanel()` to re-render

**Step 4: Wire into openSubnetPanel**

- Replace read-only NACL section with `_fwRenderNaclInline(nc, sub)`
- Remove the separate "NACL Visual" section (merged into interactive section)
- Add click delegation: `dpBody.addEventListener('click', function(ev) { _fwHandleAction(ev, sub, vpcId, lk); });`

**Step 5: Verify NACL inline editing**

Load demo, click subnet, edit/add/delete NACL rules. Confirm validation, undo, export CLI.

**Step 6: Commit**

```
feat(fw): interactive inline NACL editor with validation and CLI export
```

---

### Task 4: Inline SG Editor

**Files:**
- Modify: `index.html` -- replace SG rendering in `openSubnetPanel()` (lines ~4608-4642)

**Step 1: Write SG rendering functions**

- `_fwRenderSgInline(sg)` -- renders SG with edit badge, inbound/outbound sections, toolbar
- `_fwRenderSgDirection(sg, direction)` -- renders rule list with edit/delete per rule, add button

**Step 2: Write SG edit form**

- `_fwShowSgEditForm(sgId, ruleIdx, direction, container)` -- protocol dropdown, port from-to, source input (CIDR or sg-xxx), Save/Cancel

**Step 3: Add SG action handlers to _fwHandleAction**

Handle `edit-sg`, `add-sg`, `delete-sg`, `save-sg`. Validate via `_fwValidateSgRule()`. For modify: revoke old + authorize new in _fwEdits.

**Step 4: Replace SG section in openSubnetPanel**

Use `_fwRenderSgInline()` for each displayed SG.

**Step 5: Verify SG editing**

**Step 6: Commit**

```
feat(fw): interactive inline security group editor
```

---

### Task 5: Inline Route Table Editor

**Files:**
- Modify: `index.html` -- replace RT rendering in `openSubnetPanel()` (lines ~4430-4444)

**Step 1: Write RT rendering functions**

- `_fwRenderRtInline(rt, vpcId, lk)` -- renders route table with edit controls per route, add button
- Each route row: destination CIDR, target (with name resolution), edit/delete buttons

**Step 2: Write RT edit form**

- `_fwShowRtEditForm(rtId, routeIdx, container, vpcId, lk)` -- destination CIDR input, target dropdown populated from VPC context (local, igws, nats, vpces, peerings, tgwAttachments)

**Step 3: Add RT action handlers to _fwHandleAction**

Handle `edit-rt`, `add-rt`, `delete-rt`, `save-rt`. Validate via `_fwValidateRoute()`.

**Step 4: Replace RT section in openSubnetPanel**

**Step 5: Verify route editing**

**Step 6: Commit**

```
feat(fw): interactive inline route table editor
```

---

### Task 6: Full Panel Editor

**Files:**
- Modify: `index.html` -- add overlay HTML after detail panel, add `_fwOpenFullEditor()` function

**Step 1: Add full panel HTML**

Insert after detail panel closing `</div>` (around line 920). Structure:
- `.fw-full-panel` overlay with id `fwFullPanel`
- Header: title + close button
- Tabs: Inbound | Outbound
- Body: scrollable rule list
- Bottom split: visual pane (left) + CLI pane (right)

**Step 2: Write `_fwOpenFullEditor(type, resourceId, sub, vpcId, lk)`**

- Sets title to resource name/ID
- Renders rule table in body (same edit/add/delete as inline)
- Updates visual pane with `fw-*` arrow visualization
- Updates CLI pane with `_fwGenerateCli()` filtered to this resource
- Re-trace button calls `_executeTrace()` if `_flowMode` is active

**Step 3: Wire `full-editor` action in `_fwHandleAction`**

**Step 4: Add close handler and tab switching**

Tab clicks swap inbound/outbound view. Close slides panel out.

**Step 5: Verify full panel**

Open full editor, edit rules, confirm visual and CLI panes update live.

**Step 6: Commit**

```
feat(fw): full-panel firewall editor with live visual and CLI panes
```

---

### Task 7: Edge Case Tests (10 tests)

**Files:**
- Modify: `index.html` -- add after last `window._edgeCaseTests` block (around line 15927)

**Step 1: Write firewall test suite**

Add `window._edgeCaseTests.firewall = function() { ... }` with 10 tests:

1. **Add NACL inbound rule** -- call edit functions, assert rule in `_rlCtx.nacls`, assert CLI contains `create-network-acl-entry`
2. **Delete NACL rule** -- assert removal from `_rlCtx`, CLI contains `delete-network-acl-entry`
3. **Modify SG inbound rule** -- assert old revoked + new authorized in CLI
4. **Add route** -- assert `_rlCtx.rts` updated, CLI contains `create-route`
5. **Shadowed NACL rule warning** -- create low-numbered deny + high-numbered allow on same CIDR, assert `_fwCheckNaclShadow()` returns warning
6. **Invalid CIDR rejected** -- call `_fwValidateCidr('not-a-cidr')`, assert false
7. **Duplicate NACL rule number rejected** -- call `_fwValidateNaclRule()` with existing rule number, assert error
8. **Undo restores original** -- make edit, undo, assert `_rlCtx` matches snapshot
9. **Reset All restores snapshot** -- make multiple edits, reset, assert full restoration
10. **Re-trace after edit** -- set up blocked trace, add allow rule, re-trace, assert allowed

Each test builds its own minimal context, runs assertions, cleans up.

**Step 2: Run firewall tests**

Console: `_runEdgeCaseTests('firewall')` -- expect 10/10 PASS

**Step 3: Run all tests**

Console: `_runAllEdgeCaseTests()` -- expect 80/80 PASS

**Step 4: Commit**

```
test(fw): add 10 edge case tests for interactive firewall editor
```

---

### Task 8: Final Integration and Polish

**Step 1: Update demo data**

Add NACL rules to demo that create interesting editing scenarios:
- A shadowed rule (warning demo)
- A blocked trace path fixable by adding an SG rule

**Step 2: Update CURRENT_PLAN.md**

Add firewall editor to completed features. Update test count to 80/80.

**Step 3: Full verification**

- Load demo, click subnet, NACL/SG/RT are editable
- Edit a rule, run trace, trace reflects change
- Full editor opens, visual + CLI panes update
- Export CLI produces correct commands
- Undo/Reset work correctly
- All 80 tests pass

**Step 4: Commit and tag**

```
feat(fw): interactive firewall editor v1
```

Bump version to 1.0.4, tag `v1.0.4`, push to trigger release workflow.
