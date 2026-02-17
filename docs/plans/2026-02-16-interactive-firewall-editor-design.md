# Interactive Firewall Editor Design

## Overview

Add an interactive editor for NACLs, Security Groups, and Route Tables in the subnet detail panel. Edits update the in-memory data live (so traces reflect changes immediately) and generate AWS CLI commands for export.

Two modes: inline editing in the detail panel for quick changes, and a full-panel overlay for complex editing sessions.

## Data Model

### Edit Tracking

```js
_fwEdits = [
  { type: 'nacl'|'sg'|'rt', action: 'add'|'modify'|'delete',
    resourceId: 'acl-xxx', direction: 'inbound'|'outbound',
    ruleData: {...}, originalRule: {...} }
]
```

### Live Updates

When an edit is saved, the corresponding object in `_rlCtx` (nacls, sgs, rts) is mutated in place. `traceFlow()` evaluates against the current `_rlCtx` with zero changes needed to the trace engine.

### Undo / Reset

- Each edit stores `originalRule` for single-step undo
- `_fwSnapshot` captures original `_rlCtx` state (deep clone of nacls, sgs, rts) when first edit occurs
- "Reset All" restores from `_fwSnapshot` and clears `_fwEdits`

### CLI Generation

Iterate `_fwEdits` to produce AWS CLI commands:

- **NACL:** `create-network-acl-entry`, `replace-network-acl-entry`, `delete-network-acl-entry`
- **SG:** `authorize-security-group-ingress/egress`, `revoke-security-group-ingress/egress`
- **RT:** `create-route`, `replace-route`, `delete-route`

## Inline Editor (Detail Panel)

### NACL Section

Current read-only rule rows gain:
- Pencil icon (edit) and trash icon (delete) per rule
- Click edit: row transforms to inline inputs (rule number, protocol dropdown, port from-to, CIDR, allow/deny toggle, Save/Cancel)
- "+ Add Rule" button at bottom of each direction (inbound/outbound)
- "Full Editor" button on section header opens the full-panel view
- "Export CLI" button copies that section's commands
- "N edits" badge on section header

### Security Groups Section

Same pattern:
- Edit/delete per inbound/outbound rule
- Inline inputs: protocol, port range, source/destination (CIDR or sg-xxx)
- "+ Add Rule" per direction

### Route Table Section

Same pattern:
- Edit/delete per route
- Inline inputs: destination CIDR, target dropdown (local, IGW, NAT, TGW, peering, VPCE)
- "+ Add Route" button

### Shared Visual Patterns

- Green highlight on modified rules
- Red strikethrough on deleted rules
- Red border + tooltip on invalid fields
- Save button disabled until validation passes

## Full Panel Editor

Opened via "Full Editor" button on any section header. Fixed-position overlay that slides in from the right, covers the detail panel.

### Layout

- **Top bar:** Resource name/ID, direction tabs (Inbound | Outbound), Close button
- **Rule table:** Full-width rows with columns per field. Sortable by rule number. Drag-to-reorder for NACLs (rule evaluation order matters).
- **Bottom split pane:**
  - Left: Live `fw-*` arrow visualization, updates as rules change
  - Right: Auto-generated CLI commands, scrollable, "Copy All" button
- **Re-trace button:** Re-runs last active trace to show if edits fixed the issue

## Validation

### Per Resource Type

- **NACL:** Rule number 1-32766 (32767 reserved), no duplicate numbers per direction, valid CIDR, valid protocol/port combos (ICMP/ALL have no port range)
- **SG:** Valid CIDR or sg-xxx source/dest, port 0-65535, protocol tcp/udp/icmp/-1
- **RT:** Valid destination CIDR, no duplicate destinations, target must exist in current VPC

### Conflict Warnings (Non-blocking)

Orange warning badges for:
- NACL rule shadowed by lower-numbered rule
- Redundant SG rule (broader rule already covers traffic)
- Overlapping routes (more-specific route takes precedence)

## Testing

10 edge case tests (extending `window._edgeCaseTests`, total becomes 80):

1. Add NACL inbound rule: appears in `_rlCtx.nacls`, correct CLI output
2. Delete NACL rule: removed from `_rlCtx`, CLI generates `delete-network-acl-entry`
3. Modify SG inbound rule: old revoked + new authorized in CLI
4. Add route: `_rlCtx.rts` updated, CLI generates `create-route`
5. Shadowed NACL rule warning fires correctly
6. Invalid CIDR rejected with red border
7. Duplicate NACL rule number rejected
8. Undo restores original rule in `_rlCtx`
9. Reset All restores full original snapshot
10. Re-trace after edit reflects new rules (blocked -> allowed)

## Integration Points

- `openSubnetPanel()`: NACL, SG, RT sections upgraded from read-only to editable
- `traceFlow()`: No changes needed (reads from `_rlCtx` which is mutated live)
- `_renderFlowDetail()`: Re-trace button uses updated rules
- Design mode: `_fwEdits` are independent of `_designChanges` (different system)
- CLI export bar: Add "Firewall Edits" export option alongside existing Terraform/CF export
