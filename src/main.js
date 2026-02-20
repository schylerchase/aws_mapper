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
// Note: CIDR engine, compliance, etc. will be imported as we refactor the code that uses them

// Export to global scope for backward compatibility with inline code
window.AppModules = {
  // Constants
  SEV_ORDER, FW_LABELS, EOL_RUNTIMES, EFFORT_LABELS, EFFORT_TIME,
  PRIORITY_META, TIER_META, PRIORITY_ORDER, PRIORITY_KEYS,
  MUTE_KEY, NOTES_KEY, SNAP_KEY, SAVE_KEY, MAX_SNAPSHOTS, SAVE_INTERVAL, NOTE_CATEGORIES,

  // Utils
  safeParse, ext, esc, gn, sid, clsGw, isShared, gcv, gch, gv,

  // DOM helpers
  showToast, closeAllDashboards, toggleClass, setVisible, getEl, qs, qsa,

  // Prefs
  _prefs, loadPrefs, savePrefs,

  // Engines
  generateDemo
};

// Make functions available globally (transitional - will remove once all code is modularized)
Object.assign(window, window.AppModules);

console.log('AWS Network Mapper modules loaded');
