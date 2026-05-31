// Anonymous, opt in, browser only telemetry for AWS Network Mapper.
// No identity. No PII. Counts and shapes only.
// Generated from .telemetry/tracking-plan.yaml v1, .telemetry/instrument.md.
// See .telemetry/integration.md for how to wire this into the app.

// ---- Build time constants (replaced by esbuild define in build.js) -------
// Defaults are SAFE: telemetry is dormant unless build.js explicitly enables it.
const ENDPOINT = typeof __TELEMETRY_ENDPOINT__ !== 'undefined' ? __TELEMETRY_ENDPOINT__ : '';
const ENABLED =
  typeof __TELEMETRY_ENABLED__ !== 'undefined'
    ? __TELEMETRY_ENABLED__ === 'true' || __TELEMETRY_ENABLED__ === true
    : false;
const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0';
const BUILD_CHANNEL = typeof __BUILD_CHANNEL__ !== 'undefined' ? __BUILD_CHANNEL__ : 'dev';

// ---- Storage keys --------------------------------------------------------
const LS_CONSENT = 'awsmapper.telemetry_consent';
const LS_LAST_LOG = 'awsmapper.telemetry_debug_log';

// ---- Event name constants (single source of truth) ----------------------
// Every call site MUST use one of these constants. Raw strings are forbidden.
const EVENTS = Object.freeze({
  APP_LOADED: 'app.loaded',
  TELEMETRY_OPT_IN_PROMPTED: 'telemetry.opt_in_prompted',
  TELEMETRY_CONSENT_CHANGED: 'telemetry.consent_changed',
  APP_SESSION_ENDED: 'app.session_ended',
  DATA_IMPORTED: 'data.imported',
  DATA_IMPORT_FAILED: 'data.import_failed',
  MAP_RENDERED: 'map.rendered',
  MAP_LAYOUT_CHANGED: 'map.layout_changed',
  MAP_RENDER_FAILED: 'map.render_failed',
  DASHBOARD_OPENED: 'dashboard.opened',
  COMPLIANCE_FRAMEWORK_FILT: 'compliance.framework_filtered',
  FINDING_FILTER_APPLIED: 'finding.filter_applied',
  EXPORT_STARTED: 'export.started',
  EXPORT_COMPLETED: 'export.completed',
  EXPORT_FAILED: 'export.failed',
  DESIGN_MODE_TOGGLED: 'design_mode.toggled',
  SNAPSHOT_CAPTURED: 'snapshot.captured',
  SNAPSHOT_DIFF_RUN: 'snapshot.diff_run',
  FLOW_TRACE_STARTED: 'flow_trace.started',
  THEME_TOGGLED: 'theme.toggled',
  PERF_SLOW_RENDER: 'perf.slow_render',
  ERROR_OCCURRED: 'error.occurred'
});

// ---- Bucket helpers ------------------------------------------------------
// Convert raw counts and durations into the enum buckets in tracking-plan.yaml.
// These are the privacy contract in code form. See enums: block in the plan.
const COUNT_SMALL = [
  [0, '0'],
  [1, '1'],
  [5, '2_5'],
  [20, '6_20'],
  [100, '21_100'],
  [Infinity, '100_plus']
];
const COUNT_TINY = [
  [1, '1'],
  [3, '2_3'],
  [Infinity, '4_plus']
];
const MS_BUCKETS = [
  [100, 'under_100'],
  [500, '100_500'],
  [1000, '500_1000'],
  [3000, '1000_3000'],
  [10000, '3000_10000'],
  [Infinity, '10000_plus']
];
const KB_BUCKETS = [
  [100, 'under_100'],
  [1000, '100_1000'],
  [10000, '1000_10000'],
  [50000, '10000_50000'],
  [Infinity, '50000_plus']
];
const VW_BUCKETS = [
  [768, 'under_768'],
  [1280, '768_1280'],
  [1920, '1280_1920'],
  [Infinity, '1920_plus']
];
const VH_BUCKETS = [
  [600, 'under_600'],
  [900, '600_900'],
  [1200, '900_1200'],
  [Infinity, '1200_plus']
];
const SESS_SECS = [
  [30, 'under_30'],
  [120, '30_120'],
  [600, '120_600'],
  [1800, '600_1800'],
  [Infinity, '1800_plus']
];
const OUTPUT_KB = [
  [100, 'under_100'],
  [1000, '100_1000'],
  [5000, '1000_5000'],
  [Infinity, '5000_plus']
];

function pickBucket(value, table) {
  const n = Number(value);
  const v = Number.isFinite(n) && n >= 0 ? n : 0;
  for (let i = 0; i < table.length; i++) {
    if (v <= table[i][0]) {return table[i][1];}
  }
  return table[table.length - 1][1];
}

const bucket = Object.freeze({
  count: function (n, kind) {
    return pickBucket(n, kind === 'tiny' ? COUNT_TINY : COUNT_SMALL);
  },
  ms: function (n) {
    return pickBucket(n, MS_BUCKETS);
  },
  kb: function (n) {
    return pickBucket(n, KB_BUCKETS);
  },
  outKb: function (n) {
    return pickBucket(n, OUTPUT_KB);
  },
  vw: function (n) {
    return pickBucket(n, VW_BUCKETS);
  },
  vh: function (n) {
    return pickBucket(n, VH_BUCKETS);
  },
  sessSecs: function (n) {
    return pickBucket(n, SESS_SECS);
  }
});

// ---- Privacy scrubber (final safety net) --------------------------------
// Drops any property whose value matches a known AWS specific shape. Belt
// and suspenders. Call sites should already pass bucketed values; this
// catches accidental copy paste regressions.
const FORBIDDEN_VALUE_PATTERNS = [
  /^\d{12}$/, // AWS account ID
  /^arn:aws:/i, // ARN
  /^vpc-[0-9a-f]+$/i,
  /^subnet-[0-9a-f]+$/i,
  /^sg-[0-9a-f]+$/i,
  /^i-[0-9a-f]+$/i,
  /^vol-[0-9a-f]+$/i,
  /^eni-[0-9a-f]+$/i,
  /^rtb-[0-9a-f]+$/i,
  /^acl-[0-9a-f]+$/i,
  /^igw-[0-9a-f]+$/i,
  /^nat-[0-9a-f]+$/i,
  /^pcx-[0-9a-f]+$/i,
  /^tgw-[0-9a-f]+$/i
];

const AWS_REGIONS = new Set([
  'us-east-1',
  'us-east-2',
  'us-west-1',
  'us-west-2',
  'af-south-1',
  'ap-east-1',
  'ap-south-1',
  'ap-south-2',
  'ap-northeast-1',
  'ap-northeast-2',
  'ap-northeast-3',
  'ap-southeast-1',
  'ap-southeast-2',
  'ap-southeast-3',
  'ap-southeast-4',
  'ca-central-1',
  'ca-west-1',
  'eu-central-1',
  'eu-central-2',
  'eu-west-1',
  'eu-west-2',
  'eu-west-3',
  'eu-south-1',
  'eu-south-2',
  'eu-north-1',
  'il-central-1',
  'me-central-1',
  'me-south-1',
  'sa-east-1',
  'us-gov-east-1',
  'us-gov-west-1',
  'cn-north-1',
  'cn-northwest-1'
]);

function isForbiddenValue(v) {
  if (typeof v !== 'string') {return false;}
  if (AWS_REGIONS.has(v)) {return true;}
  for (let i = 0; i < FORBIDDEN_VALUE_PATTERNS.length; i++) {
    if (FORBIDDEN_VALUE_PATTERNS[i].test(v)) {return true;}
  }
  return false;
}

function scrub(props) {
  const out = {};
  if (!props) {return out;}
  const keys = Object.keys(props);
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') {continue;}
    const v = props[k];
    if (v === undefined || v === null) {continue;}
    if (typeof v === 'object') {continue;}
    if (isForbiddenValue(v)) {continue;}
    if (typeof v === 'string' && v.length > 64) {continue;}
    out[k] = v;
  }
  return out;
}

function classifyError(err) {
  if (!err) {return 'unknown';}
  const msg = String(err && err.message ? err.message : err).toLowerCase();
  if (msg.indexOf('parse') >= 0) {return 'parse_error';}
  if (msg.indexOf('quotaexceeded') >= 0) {return 'storage_quota';}
  if (msg.indexOf('clipboard') >= 0) {return 'clipboard_blocked';}
  if (msg.indexOf('too large') >= 0) {return 'file_too_large';}
  if (msg.indexOf('format') >= 0) {return 'unsupported_format';}
  if (msg.indexOf('render') >= 0) {return 'render_failure';}
  if (msg.indexOf('export') >= 0) {return 'export_failure';}
  return 'unknown';
}

// ---- Consent state -------------------------------------------------------
// Returns one of: accepted, declined, deferred (the default).
function getConsent() {
  try {
    const v = localStorage.getItem(LS_CONSENT);
    if (v === 'accepted' || v === 'declined' || v === 'deferred') {return v;}
    return 'deferred';
  } catch (_) {
    return 'declined';
  }
}

function _writeConsent(choice) {
  try {
    localStorage.setItem(LS_CONSENT, choice);
  } catch (_) {}
}

// ---- Queue + dispatcher --------------------------------------------------
const FLUSH_INTERVAL_MS = 5000;
const MAX_QUEUE = 200;
const queue = [];
let flushTimer = null;
let eventsSentSession = 0;
const sessionStartMs = Date.now();
let initialized = false;

function envelope(name, props) {
  const id =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : 'e_' + Date.now() + '_' + Math.random().toString(36).slice(2);
  return {
    id: id,
    name: name,
    ts: new Date().toISOString(),
    props: scrub(props),
    meta: { app_version: APP_VERSION, build_channel: BUILD_CHANNEL, schema: 1 }
  };
}

function appendDebugLog(batch) {
  try {
    const cur = JSON.parse(localStorage.getItem(LS_LAST_LOG) || '[]');
    cur.push({ at: Date.now(), batch: batch });
    while (cur.length > 50) {cur.shift();}
    localStorage.setItem(LS_LAST_LOG, JSON.stringify(cur));
  } catch (_) {}
}

function flush(useBeacon) {
  if (!ENABLED) {return;}
  if (getConsent() !== 'accepted') {
    queue.length = 0;
    return;
  }
  if (!ENDPOINT) {return;}
  if (queue.length === 0) {return;}

  const batch = queue.splice(0, queue.length);
  const payload = JSON.stringify({ batch: batch });
  eventsSentSession += batch.length;
  appendDebugLog(batch);

  try {
    if (useBeacon && typeof navigator !== 'undefined' && navigator.sendBeacon) {
      const blob = new Blob([payload], { type: 'application/json' });
      navigator.sendBeacon(ENDPOINT, blob);
      return;
    }
    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: true,
      credentials: 'omit',
      mode: 'cors'
    }).catch(function () {
      /* fire and forget */
    });
  } catch (_) {
    /* fire and forget */
  }
}

function ensureFlushTimer() {
  if (flushTimer || !ENABLED) {return;}
  flushTimer = setInterval(function () {
    if (queue.length > 0) {flush(false);}
  }, FLUSH_INTERVAL_MS);
}

function track(name, props) {
  if (!ENABLED) {return;}
  if (typeof name !== 'string' || name.length === 0) {return;}
  queue.push(envelope(name, props));
  while (queue.length > MAX_QUEUE) {queue.shift();}
  ensureFlushTimer();
}

// ---- Lifecycle wiring ----------------------------------------------------
function deriveOrigin() {
  try {
    if (!document.referrer) {return 'direct';}
    const host = new URL(document.referrer).hostname;
    if (host.indexOf('github.com') >= 0) {return 'github_release_link';}
    if (host.indexOf('vercel.app') >= 0) {return 'demo_link';}
    return 'unknown';
  } catch (_) {
    return 'unknown';
  }
}

function fireAppLoaded() {
  track(EVENTS.APP_LOADED, {
    app_version: APP_VERSION,
    build_channel: BUILD_CHANNEL,
    viewport_width_bucket: bucket.vw(window.innerWidth),
    viewport_height_bucket: bucket.vh(window.innerHeight),
    theme: document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark',
    prefers_reduced_motion: !!(
      window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ),
    session_origin: deriveOrigin()
  });
}

function fireSessionEnded() {
  track(EVENTS.APP_SESSION_ENDED, {
    session_duration_bucket_seconds: bucket.sessSecs((Date.now() - sessionStartMs) / 1000),
    events_sent_count_bucket: bucket.count(eventsSentSession, 'small')
  });
  flush(true);
}

function recordConsent(choice, source) {
  if (choice !== 'accepted' && choice !== 'declined' && choice !== 'deferred') {return;}
  _writeConsent(choice);
  track(EVENTS.TELEMETRY_CONSENT_CHANGED, {
    choice: choice,
    source: source === 'settings_panel' ? 'settings_panel' : 'first_run_prompt'
  });
  if (choice === 'accepted') {fireAppLoaded();}
}

function notePrompted() {
  // Prompt visibility itself is interesting even pre consent. We allow this
  // single event through the gate so prompt to acceptance rate is measurable.
  // It still respects ENABLED and ENDPOINT, so a dormant build sends nothing.
  if (!ENABLED || !ENDPOINT) {return;}
  const env = envelope(EVENTS.TELEMETRY_OPT_IN_PROMPTED, { app_version: APP_VERSION });
  appendDebugLog([env]);
  try {
    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ batch: [env] }),
      keepalive: true,
      credentials: 'omit',
      mode: 'cors'
    }).catch(function () {});
  } catch (_) {}
}

function debugLastN() {
  try {
    return JSON.parse(localStorage.getItem(LS_LAST_LOG) || '[]');
  } catch (_) {
    return [];
  }
}

// Allows the UI layer to skip rendering the consent prompt and settings row
// when telemetry is dormant. Without this gate, a build with ENABLED=false
// would still show a consent prompt for a feature that cannot actually run.
function isEnabled() {
  return !!ENABLED;
}

// ---- Init ---------------------------------------------------------------
// Idempotent. Safe to call from main.js once. Does nothing if disabled.
function init() {
  if (initialized) {return;}
  initialized = true;
  if (!ENABLED) {return;}

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') {fireSessionEnded();}
  });
  window.addEventListener('pagehide', fireSessionEnded);

  // If consent was accepted on a prior visit, fire app.loaded now.
  if (getConsent() === 'accepted') {fireAppLoaded();}
}

export {
  EVENTS,
  bucket,
  classifyError,
  track,
  flush,
  recordConsent,
  notePrompted,
  getConsent,
  debugLastN,
  isEnabled,
  init
};
