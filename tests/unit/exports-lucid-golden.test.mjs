// Characterization / golden-structure test for exports-lucid.js (HUMIFY Unit 5).
// exports-lucid.js is the largest untested exporter (~2.1k lines, two ~1000-line
// layout engines flagged HIGH-risk in the audit). This pins the buildLucidExport
// output shape + determinism for BOTH layout modes so a future ctx-injection
// unification of the two engines can be proven behaviour-preserving.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { generateDemo } from '../../src/modules/demo-data.js';
import * as U from '../../src/modules/utils.js';

// Golden md5 of JSON.stringify(doc) for the seed-12345 demo fixture. These lock
// the exact Lucid output so the grid/landing-zone engine split (and any future
// ctx-injection refactor) is provably byte-identical. Update only on an
// intentional layout change.
const GOLDEN = {
  grid: 'aeeef6d08549bba86183088405004f51',
  landingzone: 'c212389f08ed19442ba084ee4119bba0',
};

const demo = generateDemo(); // seed 12345 is hardcoded; deterministic

// exports-lucid.js declares no imports — it resolves these from the window bridge.
Object.assign(globalThis, {
  ext: U.ext, safeParse: U.safeParse, gv: U.gv, gn: U.gn, esc: U.esc,
  sid: U.sid, clsGw: U.clsGw, gcv: U.gcv, isShared: U.isShared,
  _showToast: () => {},
  // UI-state globals the export reads off the window bridge at generation time
  // (audit C1: no layer separation). Defaults mirror a fresh render.
  _showNested: false, _detailLevel: 0, gwNames: {},
});
globalThis.window = globalThis;

function installDom(mode) {
  globalThis.document = {
    getElementById(id) {
      if (id === 'layoutMode') return { value: mode };
      if (id === 'hubVpcName') return { value: '' };
      if (id && id.indexOf('in_') === 0) {
        const k = id.slice(3);
        return { value: Object.prototype.hasOwnProperty.call(demo, k) ? JSON.stringify(demo[k]) : '' };
      }
      return null;
    },
    createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }),
    head: { appendChild() {} },
  };
}

const { buildLucidExport } = await import('../../src/exports/exports-lucid.js');

describe('buildLucidExport — golden doc structure per layout mode (Unit 5)', () => {
  for (const mode of ['grid', 'landingzone']) {
    it(`produces a deterministic, well-formed Lucid doc in ${mode} mode`, () => {
      installDom(mode);
      const r1 = buildLucidExport();
      const r2 = buildLucidExport();
      assert.ok(r1 && r1.doc, 'returns a doc');
      assert.equal(r1.doc.version, 1);
      const page = r1.doc.pages[0];
      assert.ok(Array.isArray(page.shapes) && page.shapes.length > 0, 'has shapes');
      assert.ok(Array.isArray(page.lines), 'has lines');
      assert.ok(r1.iconSet instanceof Set, 'returns an icon set');
      // Deterministic: same demo in => identical counts out.
      assert.equal(r2.doc.pages[0].shapes.length, page.shapes.length, 'shape count stable across calls');
      assert.equal(r2.doc.pages[0].lines.length, page.lines.length, 'line count stable across calls');
      // Byte-exact golden lock — the engine split must not change the output.
      const md5 = createHash('md5').update(JSON.stringify(r1.doc)).digest('hex');
      assert.equal(md5, GOLDEN[mode], `${mode} Lucid doc must match the golden hash`);
    });
  }
});
