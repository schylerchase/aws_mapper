// Main entry point for AWS Network Mapper
// Imports all modules and initializes the application
// This file is bundled by esbuild into dist/app.bundle.js

// Core utilities
import { SEV_ORDER, FW_LABELS, EOL_RUNTIMES, EFFORT_LABELS, EFFORT_TIME, PRIORITY_META, TIER_META, PRIORITY_ORDER, PRIORITY_KEYS, MUTE_KEY, NOTES_KEY, SNAP_KEY, SAVE_KEY, MAX_SNAPSHOTS, SAVE_INTERVAL, NOTE_CATEGORIES } from './modules/constants.js';
import { safeParse, ext, esc, gn, sid, clsGw, isShared, gcv, gch, gv } from './modules/utils.js';
import { showToast, closeAllDashboards, toggleClass, setVisible, getEl, qs, qsa } from './modules/dom-helpers.js';
import { _prefs, loadPrefs, savePrefs } from './modules/prefs.js';

// Feature engines
import { generateDemo } from './modules/demo-data.js';
import { ipToInt, intToIp, parseCIDR, cidrToString, splitCIDR, cidrContains, cidrOverlap, ipInCIDR } from './modules/cidr-engine.js';
import { runComplianceChecks, invalidateComplianceCache } from './modules/compliance-engine.js';

// Network rules (pure functions extracted from flow-analyzer)
import { ipToNum, ipFromCidr, cidrContains as nrCidrContains, protoMatch, portInRange, protoName, evaluateRouteTable, evaluateNACL, evaluateSG } from './modules/network-rules.js';

// Shared state (cross-cutting globals used by 5+ regions)
import * as State from './modules/state.js';

// Safe DOM builders (used by extracted modules, available to inline code during transition)
import { buildEl, buildOption, buildSelect, buildButton, setText, replaceChildren, safeHtml } from './modules/dom-builders.js';

// BUDR engine (backup, uptime, disaster recovery assessment)
import {
  _BUDR_STRATEGY, _BUDR_STRATEGY_ORDER, _BUDR_STRATEGY_LEGEND,
  _BUDR_RTO_RPO, _BUDR_EST_MINUTES, _TIER_TARGETS,
  runBUDRChecks, _budrTierCompliance, _fmtMin,
  _enrichBudrWithClassification, _reapplyBUDROverrides,
  _getBUDRTierCounts, _getBudrComplianceCounts,
  budrFindings, budrAssessments, budrOverrides,
  setBudrFindings, setBudrAssessments, setBudrOverrides,
  _budrFindings, _budrAssessments, _budrOverrides
} from './modules/budr-engine.js';

// Dependency graph (pure logic — DOM display functions remain inline)
import {
  buildDependencyGraph, getBlastRadius, getResType, getResName,
  clearBlastRadius, resetDepGraph, isBlastActive,
  depGraph, blastActive
} from './modules/dep-graph.js';

// IAM engine (policy analysis and compliance checks)
import {
  _stmtArr, _safePolicyParse,
  parseIAMData, getIAMAccessForVpc, runIAMChecks,
  _iamData, _showIAM, setIamData, setShowIAM, getIamData, getShowIAM
} from './modules/iam-engine.js';

// Timeline & Annotations (state + pure logic — DOM rendering remains inline)
import * as Timeline from './modules/timeline.js';

// Phase 3: Feature Engines
// Design mode (validation, apply functions, CLI generation — DOM forms remain inline)
import * as DesignMode from './modules/design-mode.js';

// Flow tracing (trace engine, network position — DOM/SVG rendering remains inline)
import * as FlowTracing from './modules/flow-tracing.js';

// Flow analysis (traffic flow discovery — dashboard rendering remains inline)
import * as FlowAnalysis from './modules/flow-analysis.js';

// Firewall editor (rule CRUD, validation, CLI — DOM editor remains inline)
import * as FirewallEditor from './modules/firewall-editor.js';

// Multi-account (context building, merging — DOM panels remain inline)
import * as MultiAccount from './modules/multi-account.js';

// Phase 4: Dashboards & Reports
// Compliance view (scoring, grouping, muting — DOM rendering remains inline)
import * as ComplianceView from './modules/compliance-view.js';

// Unified dashboard (state + filter — DOM orchestration remains inline)
import * as UnifiedDashboard from './modules/unified-dashboard.js';

// Governance & Inventory (classification, inventory, IAM permissions — DOM rendering remains inline)
import * as Governance from './modules/governance.js';

// Phase 5: Core
// Export utilities (VSDX layout, XML builders, downloadBlob — DOM export handlers remain inline)
import * as ExportUtils from './modules/export-utils.js';

// IAC generator (Terraform, CloudFormation, Checkov — DOM modal remains inline)
import * as IacGenerator from './modules/iac-generator.js';

// NOTE: Diff and report code lives in app-core.js (DOM-coupled).
// Pure diff logic extracted to src/core/diff-logic.js (bundled into core.bundle.js).

// Export to global scope for backward compatibility with inline code
window.AppModules = {
  // Constants (clean + underscore-prefixed aliases for inline code)
  SEV_ORDER, FW_LABELS, EOL_RUNTIMES, EFFORT_LABELS, EFFORT_TIME,
  PRIORITY_META, TIER_META, PRIORITY_ORDER, PRIORITY_KEYS,
  MUTE_KEY, NOTES_KEY, SNAP_KEY, SAVE_KEY, MAX_SNAPSHOTS, SAVE_INTERVAL, NOTE_CATEGORIES,
  _SEV_ORDER: SEV_ORDER,
  _FW_LABELS: FW_LABELS,

  // Utils
  safeParse, ext, esc, gn, sid, clsGw, isShared, gcv, gch, gv,

  // DOM helpers
  showToast, closeAllDashboards, toggleClass, setVisible, getEl, qs, qsa,

  // Prefs
  _prefs, loadPrefs, savePrefs,

  // CIDR engine
  ipToInt, intToIp, parseCIDR, cidrToString, splitCIDR, cidrContains, cidrOverlap, ipInCIDR,

  // Compliance
  runComplianceChecks, invalidateComplianceCache,

  // Engines
  generateDemo,

  // Network rules
  ipToNum, ipFromCidr, nrCidrContains, protoMatch, portInRange, protoName,
  evaluateRouteTable, evaluateNACL, evaluateSG,

  // Shared state
  State,

  // DOM builders
  buildEl, buildOption, buildSelect, buildButton, setText, replaceChildren, safeHtml,

  // BUDR engine
  _BUDR_STRATEGY, _BUDR_STRATEGY_ORDER, _BUDR_STRATEGY_LEGEND,
  _BUDR_RTO_RPO, _BUDR_EST_MINUTES, _TIER_TARGETS,
  runBUDRChecks, _budrTierCompliance, _fmtMin,
  _enrichBudrWithClassification, _reapplyBUDROverrides,
  _getBUDRTierCounts, _getBudrComplianceCounts,
  _budrFindings, _budrAssessments, _budrOverrides,
  setBudrFindings, setBudrAssessments, setBudrOverrides,

  // Dependency graph
  buildDependencyGraph, getBlastRadius, getResType, getResName,
  clearBlastRadius, resetDepGraph, isBlastActive,

  // IAM engine
  _stmtArr, _safePolicyParse,
  parseIAMData, getIAMAccessForVpc, runIAMChecks,
  _iamData, _showIAM, setIamData, setShowIAM, getIamData, getShowIAM,

  // Timeline & Annotations
  Timeline,

  // Phase 3: Feature Engines
  DesignMode,
  FlowTracing,
  FlowAnalysis,
  FirewallEditor,
  MultiAccount,

  // Phase 4: Dashboards & Reports
  ComplianceView,
  UnifiedDashboard,
  Governance,

  // Phase 5: Core
  ExportUtils,
  IacGenerator,

  // Note: diff/report code lives in app-core.js; pure diff logic in src/core/diff-logic.js
};

// Make functions available globally (transitional - will remove once all code is modularized)
Object.assign(window, window.AppModules);

// Initialize _complianceFindings on window so inline code can reference it before first run
if (!window._complianceFindings) window._complianceFindings = [];

console.log('AWS Network Mapper modules loaded');
