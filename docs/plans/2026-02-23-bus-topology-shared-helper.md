# Bus Topology Shared Helper — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extract a shared `_drawBusTopology()` function that eliminates dead-end gaps in flow analysis connectors across all modes.

**Architecture:** Single shared helper function inserted before the three mode functions in index.html. Each mode's manual trunk+branch drawing code (~15-20 lines) gets replaced by a one-liner call. The helper guarantees connectivity by always drawing branches from trunkX to subEdgeX.

**Tech Stack:** Vanilla JS, D3.js (SVG), inline in index.html

---

### Task 1: Add `_drawBusTopology` shared helper

**Files:**
- Modify: `index.html:13996` (insert new function just before `_renderIngressFlowArrows`)

**Step 1: Insert the shared helper function**

Add this function at line 13996 (between `_getGatewayCenter` and `_renderIngressFlowArrows`):

```javascript
function _drawBusTopology(faG,opts){
  var subs=opts.subnets;
  if(!subs||subs.length===0) return;
  var tx=opts.trunkX;
  // Compute trunk Y range — always includes gateway to prevent dead ends
  var ys=subs.map(function(s){return s.cy});
  if(opts.gwPos) ys.push(opts.gwPos.y);
  var startY=opts.trunkStartY!=null?Math.min(opts.trunkStartY,Math.min.apply(null,ys)):Math.min.apply(null,ys);
  var endY=opts.trunkEndY!=null?Math.max(opts.trunkEndY,Math.max.apply(null,ys)):Math.max.apply(null,ys);
  // 1. Vertical trunk
  var trunkPath=faG.append('path').attr('class',opts.pathClass)
    .attr('d','M'+tx+','+startY+' L'+tx+','+endY);
  if(opts.trunkStyle){
    Object.keys(opts.trunkStyle).forEach(function(k){trunkPath.style(k,opts.trunkStyle[k])});
  }
  // 2. Gateway connector (trunk → gateway icon)
  if(opts.gwPos){
    var gp=faG.append('path').attr('class',opts.gwClass||opts.pathClass)
      .attr('d','M'+tx+','+opts.gwPos.y+' L'+opts.gwPos.x+','+opts.gwPos.y);
    if(opts.gwMarker) gp.attr('marker-end',opts.gwMarker);
  }
  // 3. Branches: continuous from trunk to subnet edge (no gaps)
  subs.forEach(function(sp,idx){
    var subEdgeX=(sp.x+sp.w/2)<tx?sp.x+sp.w:sp.x;
    var fromX,toX;
    if(opts.branchDirection==='toTrunk'){fromX=subEdgeX;toX=tx}
    else{fromX=tx;toX=subEdgeX}
    var bp=faG.append('path').attr('class',opts.pathClass)
      .attr('d','M'+fromX+','+sp.cy+' L'+toX+','+sp.cy);
    if(opts.branchMarker) bp.attr('marker-end',opts.branchMarker);
    if(opts.onBranch) opts.onBranch(sp,idx,subEdgeX);
  });
}
```

**Step 2: Build and verify no syntax errors**

Run: `node build.js`
Expected: Build succeeds with no errors (function is defined but not yet called).

**Step 3: Commit**

```bash
git add index.html
git commit -m "feat(flow): add _drawBusTopology shared helper"
```

---

### Task 2: Refactor `_renderIngressFlowArrows` to use shared helper

**Files:**
- Modify: `index.html` — function `_renderIngressFlowArrows` (starts at ~line 13997, now shifted by Task 1)

**Step 1: Replace trunk + branch drawing code**

In `_renderIngressFlowArrows`, locate the section that draws the vertical trunk, IGW connector, and branches (approximately lines after `subPositions.sort(...)` through end of the `Object.keys(igwToSubs).forEach` callback). Replace:

```javascript
    // OLD CODE TO REMOVE — everything from "var minY" through the closing of
    // subPositions.forEach (the trunk line, gwPos connector, vpcEdgeX branches):
    var minY=subPositions[0].cy;
    var maxY=subPositions[subPositions.length-1].cy;
    var trunkStartY=vpcBB?vpcBB.top-15:minY-40;
    var trunkEndY=maxY;
    faG.append('path').attr('class','flow-ingress-arrow')
      .attr('d','M'+trunkX+','+trunkStartY+' L'+trunkX+','+trunkEndY);
    if(gwPos){
      faG.append('path').attr('class','flow-ingress-arrow')
        .attr('d','M'+trunkX+','+gwPos.y+' L'+gwPos.x+','+gwPos.y)
        .attr('marker-end','url(#ingress-branch-head)');
    }
    var vpcEdgeX=vpcBB?(goLeft?vpcBB.left:vpcBB.right):trunkX;
    subPositions.forEach(function(sp){
      var subEdgeX=goLeft?sp.x:sp.x+sp.w;
      faG.append('path').attr('class','flow-ingress-arrow')
        .attr('d','M'+vpcEdgeX+','+sp.cy+' L'+subEdgeX+','+sp.cy)
        .attr('marker-end','url(#ingress-branch-head)');
    });
```

With:

```javascript
    subPositions.sort(function(a,b){return a.cy-b.cy});
    _drawBusTopology(faG,{
      trunkX:trunkX,
      subnets:subPositions,
      gwPos:gwPos,
      pathClass:'flow-ingress-arrow',
      branchMarker:'url(#ingress-branch-head)',
      gwMarker:'url(#ingress-branch-head)',
      trunkStartY:vpcBB?vpcBB.top-15:null,
      branchDirection:'toSubnet'
    });
```

Note: Keep the `subPositions.sort` call, marker definitions, VPC bounds cache, and the trunkX/gwPos computation code above this block — only replace the drawing section.

**Step 2: Build and verify**

Run: `node build.js`
Expected: Build succeeds.

**Step 3: Visual verify — activate ingress mode in browser**

Open preview, load demo data, click Flows → Ingress. Zoom to a VPC/IGW junction area. Confirm:
- Branches connect continuously from trunk to subnet edge (no 25px gap)
- Trunk extends to include IGW Y position
- IGW connector arrow still points to IGW icon
- Arrowheads are small (7-8px, not giant)

**Step 4: Commit**

```bash
git add index.html
git commit -m "refactor(flow): ingress uses _drawBusTopology, fixes dead-end gap"
```

---

### Task 3: Refactor `_renderEgressArrows` to use shared helper

**Files:**
- Modify: `index.html` — function `_renderEgressArrows` (starts at ~line 14178, shifted by Tasks 1-2)

**Step 1: Replace trunk + branch + gateway drawing code**

In the `Object.keys(data.gateways).forEach` callback, locate the section after `subPositions.sort(...)`. Replace:

```javascript
      // OLD CODE TO REMOVE:
      var minY=subPositions[0].cy;
      var maxY=subPositions[subPositions.length-1].cy;
      var trunkStartY=Math.min(minY,gwPos.y);
      var trunkEndY=Math.max(maxY,gwPos.y);
      faG.append('path').attr('class','flow-egress-arrow')
        .attr('d','M'+trunkX+','+trunkStartY+' L'+trunkX+','+trunkEndY);
      var vpcEdgeX=vb?(goRight?vb.right:vb.left):trunkX;
      subPositions.forEach(function(sp){
        var subEdgeX=goRight?sp.x+sp.w:sp.x;
        faG.append('path').attr('class','flow-egress-arrow')
          .attr('d','M'+subEdgeX+','+sp.cy+' L'+vpcEdgeX+','+sp.cy)
          .attr('marker-end','url(#egress-branch-head)');
      });
      faG.append('path').attr('class','flow-egress-gw')
        .attr('d','M'+trunkX+','+gwPos.y+' L'+gwPos.x+','+gwPos.y)
        .attr('marker-end','url(#egress-arrow-head)');
```

With:

```javascript
      subPositions.sort(function(a,b){return a.cy-b.cy});
      _drawBusTopology(faG,{
        trunkX:trunkX,
        subnets:subPositions,
        gwPos:gwPos,
        pathClass:'flow-egress-arrow',
        gwClass:'flow-egress-gw',
        branchMarker:'url(#egress-branch-head)',
        gwMarker:'url(#egress-arrow-head)',
        branchDirection:'toTrunk'
      });
```

Note: Keep the marker definitions, VPC bounds, gateway position lookup, trunkX computation, and subnet highlighting code above this block.

**Step 2: Build and verify**

Run: `node build.js`
Expected: Build succeeds.

**Step 3: Visual verify — activate egress mode in browser**

Click Flows → Egress. Zoom to a VPC junction. Confirm:
- Branches connect continuously from subnet edge to trunk (no gap)
- Trunk extends to include gateway Y position
- Gateway connector arrow points to NAT/IGW icon with larger arrowhead
- Branch arrowheads point toward trunk (outward direction)

**Step 4: Commit**

```bash
git add index.html
git commit -m "refactor(flow): egress uses _drawBusTopology, fixes dead-end gap"
```

---

### Task 4: Refactor `_renderBastionArrows` to use shared helper

**Files:**
- Modify: `index.html` — function `_renderBastionArrows` (starts at ~line 14307, shifted by Tasks 1-3)

**Step 1: Replace trunk + target branch drawing code**

In the `_flowAnalysisCache.bastionChains.forEach` callback, locate the section after `var trunkX` computation. Replace:

```javascript
    // OLD CODE TO REMOVE:
    var trunkStartY=allSubs[0].cy;
    var trunkEndY=allSubs[allSubs.length-1].cy;
    faG.append('path').attr('class','flow-path-leg allowed')
      .attr('d','M'+trunkX+','+trunkStartY+' L'+trunkX+','+trunkEndY)
      .style('stroke-dasharray','none').style('opacity','0.6');
    var bEdgeX=bastionSub.x+bastionSub.w/2<trunkX?bastionSub.x+bastionSub.w:bastionSub.x;
    faG.append('path').attr('class','flow-path-leg allowed')
      .attr('d','M'+bEdgeX+','+bastionSub.cy+' L'+trunkX+','+bastionSub.cy)
      .style('stroke-dasharray','none');
    targetSubs.forEach(function(sp,idx){
      var edgeX=sp.x<trunkX?sp.x:sp.x+sp.w;
      faG.append('path').attr('class','flow-path-leg allowed')
        .attr('d','M'+trunkX+','+sp.cy+' L'+edgeX+','+sp.cy)
        .attr('marker-end','url(#bastion-arrow-head)');
      var hopG=faG.append('g').attr('class','flow-hop flow-hop-allow');
      hopG.append('circle').attr('cx',edgeX+(edgeX<trunkX?-12:12)).attr('cy',sp.cy).attr('r',8);
      hopG.append('text').attr('x',edgeX+(edgeX<trunkX?-12:12)).attr('y',sp.cy)
        .style('font-size','7px').text(idx+1);
    });
```

With:

```javascript
    // Include bastion subnet in trunk range via allSubs (already sorted)
    _drawBusTopology(faG,{
      trunkX:trunkX,
      subnets:allSubs,
      pathClass:'flow-path-leg allowed',
      branchMarker:'url(#bastion-arrow-head)',
      trunkStyle:{'stroke-dasharray':'none','opacity':'0.6'},
      branchDirection:'toSubnet',
      onBranch:function(sp,idx,edgeX){
        // Skip decoration for bastion subnet itself (first in allSubs)
        if(sp===bastionSub) return;
        // Numbered hop circles at target subnets
        var hopIdx=idx-(allSubs.indexOf(bastionSub)<idx?1:0);
        var hopG=faG.append('g').attr('class','flow-hop flow-hop-allow');
        hopG.append('circle').attr('cx',edgeX+(edgeX<trunkX?-12:12)).attr('cy',sp.cy).attr('r',8);
        hopG.append('text').attr('x',edgeX+(edgeX<trunkX?-12:12)).attr('y',sp.cy)
          .style('font-size','7px').text(hopIdx+1);
      }
    });
```

Note: This replaces both the bastion→trunk source branch AND the target branches, because we pass `allSubs` (which includes bastion subnet). The helper draws the bastion→trunk branch as a regular branch (no separate handling needed). The `onBranch` callback skips decoration for the bastion subnet itself.

**Step 2: Build and verify**

Run: `node build.js`
Expected: Build succeeds.

**Step 3: Visual verify — activate bastion mode in browser**

Click Flows → Bastion. Zoom to Security VPC. Confirm:
- Bus topology: vertical trunk + horizontal branches
- Purple target subnets with numbered hop circles
- Cyan bastion subnet with B badge (badge is drawn separately, not in helper)
- All branches connect to trunk (no gaps)

**Step 4: Commit**

```bash
git add index.html
git commit -m "refactor(flow): bastion uses _drawBusTopology, completes shared helper migration"
```

---

### Task 5: Full regression test — all flow modes

**Step 1: Test each mode with visual screenshots**

Cycle through every flow mode and verify at zoomed-in level:

1. **Tiers** — colored tier badges, no stale highlights from other modes
2. **Ingress** — green arrows: trunk→branches→subnets, IGW connector, backbone drops all connected
3. **Egress** — orange arrows: subnets→trunk→gateway connector, no gaps
4. **Bastion** — cyan bus topology: trunk + source + numbered targets, B badge
5. **Exit** — all flow classes removed, map returns to normal

For each mode, zoom to at least one VPC junction at 4x+ zoom to verify no dead-end gaps.

**Step 2: Test mode switching**

Rapidly switch between modes (Ingress → Egress → Bastion → Tiers → Exit) and verify:
- No stale highlights bleed between modes
- Peering labels stay dimmed during flow modes
- Clean exit returns to baseline

**Step 3: Build final bundle**

Run: `node build.js`
Expected: Build succeeds, no warnings.

**Step 4: Final commit**

```bash
git add index.html
git commit -m "test(flow): verify all flow modes after bus topology refactor"
```
