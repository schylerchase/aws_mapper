// Shared application state — ONLY cross-cutting variables used by 5+ regions.
// All domain-specific state lives in its owning module (design-mode.js, flow-tracing.js, etc.)

// Core resource context — the parsed AWS data object passed to every renderer
export let rlCtx = null;

// D3 map references — used by topology, flow, diff, design, and navigation
export let mapSvg = null;
export let mapZoom = null;
export let mapG = null;

// Gateway name lookup — populated by topology renderer, read by firewall, flow, exports
export let gwNames = {};

// UI state — affects sidebar, canvas, and detail panel rendering
export let detailLevel = 0; // 0=collapsed, 1=normal, 2=expanded
export let showNested = false; // topology nesting toggle
export let gTxtScale = 1.0; // global text scale factor

// Compliance findings — core data used by dashboard, exports, and reports
export let complianceFindings = [];

// Sidebar DOM reference — used throughout initialization and event handlers
export let sb = null;

// Setters — ES modules can't reassign imported bindings, so consumers use these
export function setRlCtx(v) {
  rlCtx = v;
}
export function getRenderContext() {
  return rlCtx;
}
export function setRenderContext(v) {
  setRlCtx(v);
}
export function setMapSvg(v) {
  mapSvg = v;
}
export function setMapZoom(v) {
  mapZoom = v;
}
export function setMapG(v) {
  mapG = v;
}
export function getMapRefs() {
  return { svg: mapSvg, zoom: mapZoom, g: mapG };
}
export function setMapRefs(refs) {
  mapSvg = refs && refs.svg ? refs.svg : null;
  mapZoom = refs && refs.zoom ? refs.zoom : null;
  mapG = refs && refs.g ? refs.g : null;
}
export function clearMapRefs() {
  setMapRefs({ svg: null, zoom: null, g: null });
}
export function setGwNames(v) {
  gwNames = v;
}
export function setDetailLevel(v) {
  detailLevel = v;
}
export function setShowNested(v) {
  showNested = v;
}
export function setGTxtScale(v) {
  gTxtScale = v;
}
export function getComplianceFindings() {
  return complianceFindings;
}
export function setComplianceFindings(v) {
  complianceFindings = v;
}
export function setSb(v) {
  sb = v;
}
export function resetAppState() {
  rlCtx = null;
  clearMapRefs();
  gwNames = {};
  detailLevel = 0;
  showNested = false;
  gTxtScale = 1.0;
  complianceFindings = [];
  sb = null;
}
