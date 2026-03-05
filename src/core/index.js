/**
 * Core module entry point — bundled by esbuild into dist/core.bundle.js
 * Exports extracted modules onto window._core for consumption by app-core.js
 * during the incremental migration. Once migration is complete, this replaces
 * app-core.js entirely.
 */

import { S } from './state.js';

import {
  generateTerraform, generateCloudFormation,
  detectCircularSGs, generateCheckovCfn,
  _highlightHCL, _highlightYAML
} from './exports-iac.js';

import { exportVsdx } from './exports-visio.js';
import { buildLucidZip } from './exports-lucid.js';
import { generateBashScript, generatePsScript } from './exports-scripts.js';
import { generateDocx } from './exports-docx.js';
import {
  generateXlsx, exportComplianceXlsx, exportFullXlsx,
  loadSheetJS, xlsxHeaderStyle, xlsxBorder
} from './exports-xlsx.js';

// Expose shared state and extracted modules globally
window._core = {
  S,
  // IaC generators
  generateTerraform,
  generateCloudFormation,
  detectCircularSGs,
  generateCheckovCfn,
  _highlightHCL,
  _highlightYAML,
  // Visio export
  exportVsdx,
  // Lucid export
  buildLucidZip,
  // Script generators
  generateBashScript,
  generatePsScript,
  // DOCX export
  generateDocx,
  // XLSX export
  generateXlsx,
  exportComplianceXlsx,
  exportFullXlsx,
  // XLSX utilities (needed by _exportDiffXlsx in app-core.js)
  loadSheetJS,
  xlsxHeaderStyle,
  xlsxBorder
};
