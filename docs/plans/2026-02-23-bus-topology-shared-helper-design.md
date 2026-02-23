# Bus Topology Shared Helper — Design

**Date:** 2026-02-23
**Status:** Approved

## Problem

Flow analysis connector arrows have a 25px dead-end gap between the vertical trunk (outside VPC at `trunkX = vpcEdge ± 25`) and horizontal branches (starting at `vpcEdgeX`). Affects ingress and egress modes. Bastion is unaffected because it routes trunk-to-subnet directly.

The gap was introduced when branches were shortened from `trunkX → subEdgeX` to `vpcEdgeX → subEdgeX` to fix a "clipping through VPC" complaint, but the bridging segment was never added.

Additionally, ingress trunk doesn't extend to include the gateway Y position, creating a second dead-end when the IGW icon sits below the lowest subnet.

## Solution

Extract a shared `_drawBusTopology(faG, opts)` function that all three modes call. It guarantees connectivity by construction — branches always go from `trunkX` to `subEdgeX` as one continuous line.

## Function Signature

```javascript
function _drawBusTopology(faG, opts)
```

### Options

| Option | Type | Description |
|--------|------|-------------|
| `trunkX` | number | X position of vertical trunk |
| `subnets` | array | `[{sid, x, y, w, h, cy}]` sorted by cy |
| `gwPos` | object/null | `{x, y}` gateway icon center |
| `pathClass` | string | CSS class for trunk + branches |
| `gwClass` | string/null | CSS class for gateway connector (defaults to pathClass) |
| `branchMarker` | string/null | `'url(#id)'` for branch arrowheads |
| `gwMarker` | string/null | `'url(#id)'` for gateway arrowhead |
| `trunkStartY` | number/null | Override trunk top (e.g., `vpcBB.top - 15`) |
| `trunkStyle` | object/null | Extra styles on trunk `{key: val}` |
| `branchDirection` | string | `'toSubnet'` or `'toTrunk'` — controls arrow direction |
| `onBranch` | function/null | `callback(sp, idx, edgeX)` for per-branch decorations |

### What It Draws

```
               trunkStartY
                   │
   ┌───────────────┤  trunk (vertical)
   │               │
 ◄─┤subnet   ◄────┤  branch (trunkX → subEdgeX, continuous)
   │               │
   │          ◄────┤──────► GW icon   gateway connector
   │               │
 ◄─┤subnet   ◄────┤  branch
   │               │
               trunkEndY
```

### Connectivity Rules

1. **Trunk Y range** = `min(allSubnetY, gwY)` to `max(allSubnetY, gwY)` — trunk always reaches the gateway
2. **Branches** = `trunkX → subEdgeX` — one continuous line per subnet
3. **Gateway connector** = `trunkX → gwPos.x` at `gwPos.y`
4. **No gaps by construction** — all horizontal lines originate from trunkX

## Per-Mode Integration

### Ingress (`_renderIngressFlowArrows`)

```javascript
_drawBusTopology(faG, {
  trunkX: trunkX,
  subnets: subPositions,
  gwPos: gwPos,
  pathClass: 'flow-ingress-arrow',
  branchMarker: 'url(#ingress-branch-head)',
  gwMarker: 'url(#ingress-branch-head)',
  trunkStartY: vpcBB ? vpcBB.top - 15 : null,
  branchDirection: 'toSubnet'
});
```

Mode still handles: backbone, drops, subnet highlighting, ALB forwarding.

### Egress (`_renderEgressArrows`)

```javascript
_drawBusTopology(faG, {
  trunkX: trunkX,
  subnets: subPositions,
  gwPos: gwPos,
  pathClass: 'flow-egress-arrow',
  gwClass: 'flow-egress-gw',
  branchMarker: 'url(#egress-branch-head)',
  gwMarker: 'url(#egress-arrow-head)',
  branchDirection: 'toTrunk'
});
```

Mode still handles: per-VPC gateway grouping, subnet highlighting.

### Bastion (`_renderBastionArrows`)

```javascript
_drawBusTopology(faG, {
  trunkX: trunkX,
  subnets: targetSubs,
  pathClass: 'flow-path-leg allowed',
  branchMarker: 'url(#bastion-arrow-head)',
  trunkStyle: {'stroke-dasharray': 'none', 'opacity': '0.6'},
  branchDirection: 'toSubnet',
  onBranch: function(sp, idx, edgeX) {
    // numbered hop circles
  }
});
```

Mode still handles: bastion→trunk source branch, B badge, target highlighting.

## What Gets Removed

~15-20 lines of manual trunk + branch drawing per mode (×3 modes = ~50 lines removed).

## What Stays Unchanged

- All SVG marker definitions
- All CSS classes
- `_renderIngressConnectedPath` (backbone + drops)
- `_renderForwardingArrows` (ALB forwarding)
- Subnet/gateway highlighting logic
- Data collection from `_flowAnalysisCache`
