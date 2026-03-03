// Export Utilities — VSDX helpers, download, layout calculations
// PNG/SVG export (DOM-dependent) remains inline in index.html.
// Lucid/Landing-Zone export (deeply coupled to DOM data) remains inline.

import { esc, gn, sid, clsGw } from './utils.js';
import { gwNames } from './state.js';
import { showToast } from './dom-helpers.js';

// === Constants — VSDX layout sizing ===
export const PX = 96;
export const SUB_W = 520;
export const SUB_H_MIN = 90;
export const SUB_GAP = 24;
export const VPC_PAD = 50;
export const VPC_HDR = 80;
export const GW_INSIDE_W = 160;
export const GW_INSIDE_H = 50;
export const GW_INSIDE_GAP = 16;
export const GW_ROW_H = 70;
export const COL_GAP = 280;
export const LINE_H = 15;
export const TOP_MARGIN = 80;

/** Convert pixel value to inches at 96 DPI */
export function toIn(px) {
  return px / PX;
}

// === Gateway type styles (legend + cross-VPC lines) ===
export const gwStyles = {
  'IGW':  { color: '#059669', pattern: 1, label: 'Internet Gateway', fill: '#ECFDF5', border: '#059669' },
  'NAT':  { color: '#D97706', pattern: 2, label: 'NAT Gateway',      fill: '#FFFBEB', border: '#D97706' },
  'TGW':  { color: '#2563EB', pattern: 1, label: 'Transit Gateway',  fill: '#EFF6FF', border: '#2563EB' },
  'VGW':  { color: '#7C3AED', pattern: 4, label: 'Virtual Private GW', fill: '#F5F3FF', border: '#7C3AED' },
  'PCX':  { color: '#EA580C', pattern: 2, label: 'VPC Peering',      fill: '#FFF7ED', border: '#EA580C' },
  'VPCE': { color: '#0891B2', pattern: 3, label: 'VPC Endpoint',     fill: '#ECFEFF', border: '#0891B2' },
  'GW':   { color: '#6B7280', pattern: 1, label: 'Gateway',          fill: '#F9FAFB', border: '#6B7280' }
};

// === Module State ===
// Shape/connector collectors — reset via resetShapeState() before each export
let shapeId = 1;
let shapes = [];
let polyEdges = [];
let idMap = {};

/** Reset mutable export state before a new VSDX build */
export function resetShapeState() {
  shapeId = 1;
  shapes = [];
  polyEdges = [];
  idMap = {};
}

/** Get current shapes array */
export function getShapes() { return shapes; }

/** Get current polyEdges array */
export function getPolyEdges() { return polyEdges; }

/** Get current idMap */
export function getIdMap() { return idMap; }

/** Set an entry in the idMap */
export function setIdMapEntry(key, value) { idMap[key] = value; }

// === Pure Logic ===

/**
 * Escape XML special characters for Visio XML output
 * @param {string} s - Raw string
 * @returns {string} XML-safe string
 */
export function xmlEsc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Generate a unique ID string in Visio format {uuid}
 * @returns {string}
 */
export function uid() {
  return '{' + crypto.randomUUID() + '}';
}

/**
 * Sanitize a resource name for IaC identifiers
 * @param {string} s - Raw name
 * @returns {string} Sanitized lowercase identifier
 */
export function sanitizeName(s) {
  if (!s) return 'unnamed';
  return s
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/^[0-9]/, 'r$&')
    .replace(/-/g, '_')
    .toLowerCase();
}

/**
 * Accumulate a rectangle shape for VSDX export
 * @returns {number} The assigned shape ID
 */
export function addRect(x, y, w, h, fill, stroke, strokeW, text, opts = {}) {
  const id = shapeId++;
  shapes.push({
    id, type: 'rect', x, y, w, h, fill, stroke, strokeW, text,
    dashed: opts.dashed || false,
    fontSize: opts.fontSize || 11,
    fontColor: opts.fontColor || '#1F2937',
    bold: opts.bold || false,
    topAlign: opts.topAlign || false,
    props: opts.props || [],
    hAlign: opts.hAlign || 'left',
    linePattern: opts.linePattern || 1
  });
  return id;
}

/**
 * Accumulate a polyline edge/connector for VSDX export
 * linePattern: 1=solid, 2=dash, 3=dot, 4=dash-dot
 */
export function addPolyEdge(waypoints, color, width, linePattern, label) {
  polyEdges.push({
    waypoints, color, width,
    linePattern: linePattern || 1,
    label: label || '',
    id: shapeId++
  });
}

/**
 * Build display text for a subnet in VSDX export
 * @param {Object} s - Subnet object
 * @param {Object} ctx - Context: { pubSubs, instBySub, eniBySub, albBySub, subRT }
 * @returns {{ text: string, lineCount: number }}
 */
export function buildSubText(s, ctx) {
  const { pubSubs, instBySub, eniBySub, albBySub, subRT } = ctx;
  const isPub = pubSubs.has(s.SubnetId);
  const si = instBySub[s.SubnetId] || [];
  const se = eniBySub[s.SubnetId] || [];
  const sa = albBySub[s.SubnetId] || [];
  const lines = [];
  lines.push((isPub ? '[PUBLIC] ' : '[PRIVATE] ') + gn(s, s.SubnetId));
  lines.push(s.CidrBlock + '  |  ' + (s.AvailabilityZone || ''));
  const parts = [];
  if (si.length) parts.push(si.length + ' EC2');
  if (se.length) parts.push(se.length + ' ENI');
  if (sa.length) parts.push(sa.length + ' ALB');
  if (parts.length) lines.push(parts.join(' | '));
  const rt = subRT[s.SubnetId];
  if (rt) {
    const nonLocal = (rt.Routes || []).filter(r => {
      const t = r.GatewayId || r.NatGatewayId || r.TransitGatewayId || r.VpcPeeringConnectionId;
      return t && t !== 'local';
    });
    if (nonLocal.length) {
      lines.push('Routes:');
      nonLocal.forEach(r => {
        const dest = r.DestinationCidrBlock || r.DestinationPrefixListId || '?';
        const tgt = r.GatewayId || r.NatGatewayId || r.TransitGatewayId || r.VpcPeeringConnectionId;
        lines.push('  ' + dest + ' -> ' + clsGw(tgt || '') + ' ' + sid(tgt));
      });
    }
  }
  return { text: lines.join('\n'), lineCount: lines.length };
}

/**
 * Build a Visio XML <Shape> element for a rectangle
 * @param {Object} s - Shape descriptor from the shapes array
 * @param {number} pgH - Page height in inches (for Y-axis flip)
 * @returns {string} Visio XML fragment
 */
export function buildShape(s, pgH) {
  const wi = toIn(s.w);
  const hi = toIn(s.h);
  const cx = toIn(s.x) + wi / 2;
  const cy = pgH - (toIn(s.y) + hi / 2);
  const lp = s.linePattern || 1;
  const dashXml = s.dashed
    ? '<Cell N="LinePattern" V="2"/>'
    : (lp !== 1 ? '<Cell N="LinePattern" V="' + lp + '"/>' : '');
  const sw = toIn(s.strokeW || 1);
  const fs = (s.fontSize || 11) / 72;

  const geom = '<Section N="Geometry" IX="0">'
    + '<Cell N="NoFill" V="0"/><Cell N="NoLine" V="0"/>'
    + '<Row T="MoveTo" IX="1"><Cell N="X" V="0"/><Cell N="Y" V="0"/></Row>'
    + '<Row T="LineTo" IX="2"><Cell N="X" V="' + wi + '"/><Cell N="Y" V="0"/></Row>'
    + '<Row T="LineTo" IX="3"><Cell N="X" V="' + wi + '"/><Cell N="Y" V="' + hi + '"/></Row>'
    + '<Row T="LineTo" IX="4"><Cell N="X" V="0"/><Cell N="Y" V="' + hi + '"/></Row>'
    + '<Row T="LineTo" IX="5"><Cell N="X" V="0"/><Cell N="Y" V="0"/></Row>'
    + '</Section>';

  const vAlign = s.topAlign ? 0 : 1;
  const hAlign = s.hAlign === 'center' ? 1 : 0;

  const propsXml = s.props && s.props.length
    ? '<Section N="Property">' + s.props.map((p, i) =>
        '<Row N="Row_' + i + '"><Cell N="Label" V="' + xmlEsc(p.label) + '"/>'
        + '<Cell N="Value" V="' + xmlEsc(p.val) + '"/>'
        + '<Cell N="Type" V="0"/></Row>'
      ).join('') + '</Section>'
    : '';

  return '<Shape ID="' + s.id + '" NameU="Shape' + s.id + '" Type="Shape" UniqueID="' + uid() + '">'
    + '<Cell N="PinX" V="' + cx + '"/>'
    + '<Cell N="PinY" V="' + cy + '"/>'
    + '<Cell N="Width" V="' + wi + '"/>'
    + '<Cell N="Height" V="' + hi + '"/>'
    + '<Cell N="LocPinX" V="' + (wi / 2) + '"/>'
    + '<Cell N="LocPinY" V="' + (hi / 2) + '"/>'
    + '<Cell N="TxtWidth" V="' + wi + '"/>'
    + '<Cell N="TxtHeight" V="' + hi + '"/>'
    + '<Cell N="TxtPinX" V="' + (wi / 2) + '"/>'
    + '<Cell N="TxtPinY" V="' + (hi / 2) + '"/>'
    + '<Cell N="TxtLocPinX" V="' + (wi / 2) + '"/>'
    + '<Cell N="TxtLocPinY" V="' + (hi / 2) + '"/>'
    + '<Cell N="FillForegnd" V="' + s.fill + '"/>'
    + '<Cell N="FillBkgnd" V="' + s.fill + '"/>'
    + '<Cell N="LineColor" V="' + s.stroke + '"/>'
    + '<Cell N="LineWeight" V="' + sw + '"/>'
    + '<Cell N="VerticalAlign" V="' + vAlign + '"/>'
    + '<Cell N="HorzAlign" V="' + hAlign + '"/>'
    + '<Cell N="TopMargin" V="0.06"/>'
    + '<Cell N="BottomMargin" V="0.06"/>'
    + '<Cell N="LeftMargin" V="0.1"/>'
    + '<Cell N="RightMargin" V="0.1"/>'
    + dashXml
    + '<Section N="Character" IX="0">'
    + '<Row IX="0">'
    + '<Cell N="Font" V="Calibri"/>'
    + '<Cell N="Color" V="' + (s.fontColor || '#000000') + '"/>'
    + '<Cell N="Size" V="' + fs + '"/>'
    + '<Cell N="Style" V="' + (s.bold ? 1 : 0) + '"/>'
    + '</Row>'
    + '</Section>'
    + geom
    + propsXml
    + '<Text>' + xmlEsc(s.text) + '</Text>'
    + '</Shape>';
}

/**
 * Build a Visio XML <Shape> polyline connector
 * @param {Object} e - Edge descriptor from polyEdges array
 * @param {number} pgH - Page height in inches (for Y-axis flip)
 * @returns {string} Visio XML fragment
 */
export function buildPolyConnector(e, pgH) {
  const pts = e.waypoints.map(wp => ({ x: toIn(wp.x), y: pgH - toIn(wp.y) }));
  if (pts.length < 2) return '';
  const p1 = pts[0];
  const pN = pts[pts.length - 1];
  const sw = toIn(e.width || 1);
  const cid = e.id;
  let geomRows = '<Row T="MoveTo" IX="1"><Cell N="X" V="' + p1.x + '"/><Cell N="Y" V="' + p1.y + '"/></Row>';
  for (let i = 1; i < pts.length; i++) {
    geomRows += '<Row T="LineTo" IX="' + (i + 1) + '"><Cell N="X" V="' + pts[i].x + '"/><Cell N="Y" V="' + pts[i].y + '"/></Row>';
  }
  return '<Shape ID="' + cid + '" NameU="Conn.' + cid + '" Type="Shape" UniqueID="' + uid() + '">'
    + '<Cell N="ObjType" V="2"/>'
    + '<Cell N="BeginX" V="' + p1.x + '"/>'
    + '<Cell N="BeginY" V="' + p1.y + '"/>'
    + '<Cell N="EndX" V="' + pN.x + '"/>'
    + '<Cell N="EndY" V="' + pN.y + '"/>'
    + '<Cell N="LineColor" V="' + (e.color || '#6B7280') + '"/>'
    + '<Cell N="LineWeight" V="' + sw + '"/>'
    + '<Cell N="LinePattern" V="' + (e.linePattern || 1) + '"/>'
    + '<Cell N="BeginArrow" V="0"/>'
    + '<Cell N="EndArrow" V="5"/>'
    + '<Cell N="EndArrowSize" V="2"/>'
    + '<Section N="Geometry" IX="0">'
    + '<Cell N="NoFill" V="1"/><Cell N="NoLine" V="0"/>'
    + geomRows
    + '</Section>'
    + '</Shape>';
}

/**
 * Build complete VSDX XML strings from accumulated shapes/edges
 * @param {number} pgW - Page width in inches
 * @param {number} pgH - Page height in inches
 * @returns {{ page1, pagesXml, docXml, contentTypes, topRels, docRels, pagesRels }}
 */
export function buildVsdxXml(pgW, pgH) {
  let shapesStr = '';
  shapes.forEach(s => { shapesStr += buildShape(s, pgH); });
  polyEdges.forEach(e => { shapesStr += buildPolyConnector(e, pgH); });

  const page1 = '<?xml version="1.0" encoding="utf-8"?>'
    + '<PageContents xmlns="http://schemas.microsoft.com/office/visio/2012/main"'
    + ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
    + '<Shapes>' + shapesStr + '</Shapes>'
    + '</PageContents>';

  const pagesXml = '<?xml version="1.0" encoding="utf-8"?>'
    + '<Pages xmlns="http://schemas.microsoft.com/office/visio/2012/main"'
    + ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
    + '<Page ID="0" Name="AWS Network Map" NameU="AWS Network Map">'
    + '<PageSheet>'
    + '<Cell N="PageWidth" V="' + pgW + '"/>'
    + '<Cell N="PageHeight" V="' + pgH + '"/>'
    + '<Cell N="PrintPageOrientation" V="2"/>'
    + '</PageSheet>'
    + '<Rel r:id="rId1"/>'
    + '</Page>'
    + '</Pages>';

  const docXml = '<?xml version="1.0" encoding="utf-8"?>'
    + '<VisioDocument xmlns="http://schemas.microsoft.com/office/visio/2012/main"'
    + ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
    + '<DocumentProperties>'
    + '<Creator>AWS Network Map Tool</Creator>'
    + '<Description>AWS Network Infrastructure Diagram</Description>'
    + '</DocumentProperties>'
    + '</VisioDocument>';

  const contentTypes = '<?xml version="1.0" encoding="utf-8"?>'
    + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    + '<Default Extension="xml" ContentType="application/xml"/>'
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    + '<Override PartName="/visio/document.xml" ContentType="application/vnd.ms-visio.drawing.main+xml"/>'
    + '<Override PartName="/visio/pages/pages.xml" ContentType="application/vnd.ms-visio.pages+xml"/>'
    + '<Override PartName="/visio/pages/page1.xml" ContentType="application/vnd.ms-visio.page+xml"/>'
    + '</Types>';

  const topRels = '<?xml version="1.0" encoding="utf-8"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.microsoft.com/visio/2010/relationships/document" Target="visio/document.xml"/>'
    + '</Relationships>';

  const docRels = '<?xml version="1.0" encoding="utf-8"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.microsoft.com/visio/2010/relationships/pages" Target="pages/pages.xml"/>'
    + '</Relationships>';

  const pagesRels = '<?xml version="1.0" encoding="utf-8"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.microsoft.com/visio/2010/relationships/page" Target="page1.xml"/>'
    + '</Relationships>';

  return { page1, pagesXml, docXml, contentTypes, topRels, docRels, pagesRels };
}

/**
 * Resolve a CSS variable/color string to a hex color.
 * Creates a temporary DOM element to let the browser resolve CSS custom properties.
 * Results are cached for the page lifetime since CSS variables don't change at runtime.
 * @param {string} cssVar - CSS color value (may be a var() expression)
 * @returns {string} Hex color string like '#rrggbb'
 */
const _colorCache = new Map();
export function resolveColor(cssVar) {
  if (_colorCache.has(cssVar)) return _colorCache.get(cssVar);
  if (typeof document === 'undefined') return '#888888';
  const el = document.createElement('div');
  el.style.color = cssVar;
  document.body.appendChild(el);
  const c = getComputedStyle(el).color;
  document.body.removeChild(el);
  const m = c.match(/(\d+)/g);
  if (!m) return '#888888';
  const hex = '#' + m.slice(0, 3).map(x => (+x).toString(16).padStart(2, '0')).join('');
  _colorCache.set(cssVar, hex);
  return hex;
}

/**
 * Download a Blob as a file.
 * In Electron, delegates to the native export dialog.
 * In browsers, creates a temporary anchor element for programmatic download.
 * @param {Blob} blob - The file content
 * @param {string} name - Suggested filename
 */
export function downloadBlob(blob, name) {
  const isElectron = typeof window !== 'undefined' && !!window.electronAPI;
  if (isElectron) {
    const ext = (name.match(/\.([^.]+)$/) || [])[1] || '*';
    const filters = [
      { name: ext.toUpperCase() + ' Files', extensions: [ext] },
      { name: 'All Files', extensions: ['*'] }
    ];
    if (blob.type && blob.type.startsWith('text')) {
      blob.text().then(text => {
        window.electronAPI.exportFile(text, name, filters)
          .then(p => { if (p) showToast('Exported: ' + p.split('/').pop()); })
          .catch(e => console.error('Export failed:', e));
      });
    } else {
      blob.arrayBuffer().then(ab => {
        window.electronAPI.exportFile(new Uint8Array(ab), name, filters)
          .then(p => { if (p) showToast('Exported: ' + p.split('/').pop()); })
          .catch(e => console.error('Export failed:', e));
      });
    }
    return;
  }
  // Browser download via temporary anchor element
  const a = document.createElement('a');
  const objUrl = URL.createObjectURL(blob);
  a.href = objUrl;
  a.download = name;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function () { URL.revokeObjectURL(objUrl); }, 1000);
}

/**
 * Compute subnet heights based on their display text
 * @param {Array} subnets - Array of subnet objects
 * @param {Object} ctx - Context for buildSubText
 * @returns {Object} Map of SubnetId -> height in pixels
 */
export function computeSubnetHeights(subnets, ctx) {
  const heights = {};
  subnets.forEach(s => {
    const bt = buildSubText(s, ctx);
    heights[s.SubnetId] = Math.max(SUB_H_MIN, bt.lineCount * LINE_H + 30);
  });
  return heights;
}

/**
 * Compute page dimensions from accumulated shapes and layout state
 * @param {number} totalWidth - Total horizontal extent of VPC columns
 * @param {number} busStartY - Y position where bus lanes start
 * @param {number} busLaneIdx - Number of bus lanes used
 * @param {number} busLaneH - Height per bus lane
 * @returns {{ pgWpx: number, pgHpx: number, pgW: number, pgH: number }}
 */
export function computePageDimensions(totalWidth, busStartY, busLaneIdx, busLaneH) {
  let pgWpx = totalWidth + 200;
  let pgHpx = busStartY + (busLaneIdx + 2) * busLaneH + 300;
  shapes.forEach(s => {
    pgWpx = Math.max(pgWpx, s.x + s.w + 120);
    pgHpx = Math.max(pgHpx, s.y + s.h + 120);
  });
  const pgW = toIn(pgWpx) + 2;
  const pgH = toIn(pgHpx) + 2;
  return { pgWpx, pgHpx, pgW, pgH };
}

// === Window Bridge ===
if (typeof window !== 'undefined') {
  // Expose functions that are called from inline code in index.html
  window.downloadBlob = downloadBlob;
  window.resolveColor = resolveColor;
  window._sanitizeName = sanitizeName;

  // VSDX helpers — used by the inline VSDX click handler
  window._vsdx = {
    resetShapeState,
    getShapes,
    getPolyEdges,
    getIdMap,
    setIdMapEntry,
    xmlEsc,
    uid,
    addRect,
    addPolyEdge,
    buildSubText,
    buildShape,
    buildPolyConnector,
    buildVsdxXml,
    computeSubnetHeights,
    computePageDimensions,
    gwStyles,
    // Layout constants
    PX, SUB_W, SUB_H_MIN, SUB_GAP, VPC_PAD, VPC_HDR,
    GW_INSIDE_W, GW_INSIDE_H, GW_INSIDE_GAP, GW_ROW_H,
    COL_GAP, LINE_H, TOP_MARGIN, toIn
  };
}
