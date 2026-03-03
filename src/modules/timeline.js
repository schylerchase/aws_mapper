// Timeline & Annotations — state and pure logic
// DOM rendering functions (_renderTimeline, _renderNotesPanel, etc.)
// remain inline until modernized with dom-builders.js in Phase 5.

import { SNAP_KEY, NOTES_KEY, MAX_SNAPSHOTS, NOTE_CATEGORIES } from './constants.js';
import { esc, gn } from './utils.js';
import { showToast } from './dom-helpers.js';

// === Module State ===
let snapshots = [];
let viewingHistory = false;
let currentSnapshot = null;
let lastAutoSnap = 0;
let annotations = {};
let annotationAuthor = '';

// Initialize from localStorage
try { const s = localStorage.getItem(SNAP_KEY); if (s) snapshots = JSON.parse(s); } catch (e) { snapshots = []; }
try { const s = localStorage.getItem(NOTES_KEY); if (s) annotations = JSON.parse(s); } catch (e) {}
try { annotationAuthor = localStorage.getItem('aws_mapper_note_author') || ''; } catch (e) {}

// Max snapshots (Electron gets 5, web gets constant)
const maxSnapshots = (typeof window !== 'undefined' && window.electronAPI) ? 5 : MAX_SNAPSHOTS;

// === State Accessors ===
export function getSnapshots() { return snapshots; }
export function setSnapshots(v) { snapshots = v; }
export function isViewingHistory() { return viewingHistory; }
export function setViewingHistory(v) { viewingHistory = v; }
export function getCurrentSnapshot() { return currentSnapshot; }
export function setCurrentSnapshot(v) { currentSnapshot = v; }
export function getLastAutoSnap() { return lastAutoSnap; }
export function setLastAutoSnap(v) { lastAutoSnap = v; }
export function getAnnotations() { return annotations; }
export function setAnnotations(v) { annotations = v; }
export function getAnnotationAuthor() { return annotationAuthor; }
export function setAnnotationAuthor(v) {
  annotationAuthor = v;
  try { localStorage.setItem('aws_mapper_note_author', v); } catch (e) {}
}

// === Pure Logic ===

/** Save snapshots to localStorage, trimming oldest half if storage is full. */
export function saveSnapshots() {
  try {
    localStorage.setItem(SNAP_KEY, JSON.stringify(snapshots));
  } catch (e) {
    if (snapshots.length > 4) {
      snapshots = snapshots.slice(Math.floor(snapshots.length / 2));
      try { localStorage.setItem(SNAP_KEY, JSON.stringify(snapshots)); } catch (e2) {}
    }
  }
}

/** Compute a simple hash checksum of textarea values for deduplication. */
export function computeChecksum(textareas) {
  let s = '';
  Object.keys(textareas).sort().forEach(k => s += k + ':' + String(textareas[k]).length + ';');
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0; }
  return h;
}

/** Save annotations to localStorage. */
export function saveAnnotations() {
  try { localStorage.setItem(NOTES_KEY, JSON.stringify(annotations)); } catch (e) {}
}

/** Build a note key from resource ID and optional account ID. */
export function noteKey(resourceId, accountId) {
  return accountId && accountId !== 'default' ? accountId + ':' + resourceId : resourceId;
}

/** Get all notes flattened and sorted by most recent update. */
export function getAllNotes() {
  const all = [];
  Object.entries(annotations).forEach(([rid, notes]) => {
    (Array.isArray(notes) ? notes : [notes]).forEach((n, i) => {
      if (n && n.text) all.push({ ...n, resourceId: rid, noteIndex: i });
    });
  });
  return all.sort((a, b) => new Date(b.updated || b.created || 0) - new Date(a.updated || a.created || 0));
}

/** Format a relative time string from ISO timestamp. */
export function relTime(iso) {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000), m = Math.floor(s / 60), h = Math.floor(m / 60), d = Math.floor(h / 24);
  if (d > 30) return Math.floor(d / 30) + 'mo ago';
  if (d > 0) return d + 'd ago';
  if (h > 0) return h + 'h ago';
  if (m > 0) return m + 'm ago';
  return 'just now';
}

/** HTML-escape a string. */
export function escHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Check if a resource ID is orphaned (no longer in current context). */
export function isOrphaned(rid, ctx) {
  if (!ctx) return false;
  if (rid.startsWith('canvas:')) return false;
  const all = [
    ...(ctx.vpcs || []).map(x => x.VpcId),
    ...(ctx.subnets || []).map(x => x.SubnetId),
    ...(ctx.instances || []).map(x => x.InstanceId),
    ...(ctx.igws || []).map(x => x.InternetGatewayId),
    ...(ctx.nats || []).map(x => x.NatGatewayId),
    ...(ctx.vpces || []).map(x => x.VpcEndpointId),
    ...(ctx.rdsInstances || []).map(x => x.DBInstanceIdentifier),
    ...(ctx.lambdaFns || []).map(x => x.FunctionName),
    ...(ctx.sgs || []).map(x => x.GroupId),
    ...(ctx.albs || []).map(x => x.LoadBalancerName),
    ...(ctx.ecacheClusters || []).map(x => x.CacheClusterId),
    ...(ctx.redshiftClusters || []).map(x => x.ClusterIdentifier)
  ];
  return !all.includes(rid);
}

/** Look up a human-readable name for a resource ID. */
export function getResourceName(rid, ctx) {
  if (!ctx) return rid;
  const v = (ctx.vpcs || []).find(x => x.VpcId === rid); if (v) return gn(v, rid);
  const s = (ctx.subnets || []).find(x => x.SubnetId === rid); if (s) return gn(s, rid);
  const i = (ctx.instances || []).find(x => x.InstanceId === rid); if (i) return gn(i, rid);
  const r = (ctx.rdsInstances || []).find(x => x.DBInstanceIdentifier === rid); if (r) return rid;
  const l = (ctx.lambdaFns || []).find(x => x.FunctionName === rid); if (l) return rid;
  const sg = (ctx.sgs || []).find(x => x.GroupId === rid); if (sg) return sg.GroupName || rid;
  return rid;
}

/** Build a compliance lookup: resourceId -> {worst, count, findings[]}. */
export function buildComplianceLookup(findings, isMutedFn) {
  const lookup = {};
  if (!findings || !findings.length) return lookup;
  const sevOrder = { CRITICAL: 1, HIGH: 2, MEDIUM: 3, LOW: 4 };
  findings.forEach(f => {
    if (isMutedFn && isMutedFn(f)) return;
    const rid = f.resource; if (!rid || rid === 'Multiple') return;
    if (!lookup[rid]) lookup[rid] = { worst: 'LOW', count: 0, findings: [] };
    lookup[rid].count++;
    lookup[rid].findings.push(f);
    if ((sevOrder[f.severity] || 9) < (sevOrder[lookup[rid].worst] || 9)) lookup[rid].worst = f.severity;
  });
  return lookup;
}

/** Add an annotation to a resource. */
export function addAnnotation(resourceId, text, category, pinned) {
  if (!text || !text.trim()) return;
  const note = {
    text: text.trim(),
    category: category || 'info',
    author: annotationAuthor || '',
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    pinned: !!pinned
  };
  if (!annotations[resourceId]) annotations[resourceId] = [];
  if (!Array.isArray(annotations[resourceId])) annotations[resourceId] = [annotations[resourceId]];
  annotations[resourceId].push(note);
  saveAnnotations();
  return note;
}

/** Update an existing annotation. */
export function updateAnnotation(resourceId, noteIndex, text, category, pinned) {
  if (!annotations[resourceId] || !annotations[resourceId][noteIndex]) return;
  const n = annotations[resourceId][noteIndex];
  if (text !== undefined) n.text = text;
  if (category !== undefined) n.category = category;
  if (pinned !== undefined) n.pinned = pinned;
  n.updated = new Date().toISOString();
  saveAnnotations();
}

/** Delete an annotation. */
export function deleteAnnotation(resourceId, noteIndex) {
  if (!annotations[resourceId]) return;
  annotations[resourceId].splice(noteIndex, 1);
  if (annotations[resourceId].length === 0) delete annotations[resourceId];
  saveAnnotations();
}

// Export state references for backward compatibility
export {
  snapshots as _snapshots,
  annotations as _annotations,
  annotationAuthor as _annotationAuthor,
  maxSnapshots as _MAX_SNAPSHOTS
};

// Re-export constants used by inline code
export { NOTE_CATEGORIES as _NOTE_CATEGORIES };
