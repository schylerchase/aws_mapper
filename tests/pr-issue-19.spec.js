const { test, expect } = require('@playwright/test');
const BASE = process.env.AWS_MAPPER_TEST_URL || 'http://localhost:8377/index.html';
async function openApp(page) {
  await page.addInitScript(() => localStorage.setItem('aws_mapper_onboarded', '1'));
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof _loadProjectData === 'function');
}
function project(id, extra = {}) {
  return { _format: 'awsmap', textareas: { in_vpcs: { Vpcs: [{ VpcId: id, CidrBlock: '10.0.0.0/16', OwnerId: '111111111111' }] } }, ...extra };
}
async function loadProjectData(page, data) {
  await page.evaluate(value => _loadProjectData(value), data);
  await page.waitForFunction(id => _rlCtx?.vpcs?.some(v => v.VpcId === id), data.textareas.in_vpcs.Vpcs[0].VpcId);
}

for (const source of ['html', 'json']) {
  test(source + ' report import replaces empty optional sections', async ({ page }) => {
    await openApp(page);
    const state = await page.evaluate(kind => {
      _applyImportedData({ title: 'A', findings: [], iamReviewData: [{ name: 'role-A', type: 'Role', findings: [], crossAccounts: [], policies: [], created: null, lastUsed: null }], appRegistry: [{ id: 'app-A', name: 'Application A', resources: [], dependencies: [] }], contexts: [{ accountId: '111111111111' }] }, kind);
      _applyImportedData({ title: 'B', findings: [{ severity: 'HIGH', control: 'TEST', framework: 'ARCH', resource: 'vpc-B', message: 'B finding' }], iamReviewData: [], appRegistry: [], contexts: [] }, kind);
      return { title: _importedReportData.title, iam: _iamReviewData.length, apps: _appRegistry.length, contexts: _loadedContexts.length, enabled: _RPT_MODULES.filter(m => m.enabled).map(m => m.id) };
    }, source);
    expect(state.title).toBe('B');
    expect(state.iam).toBe(0); expect(state.apps).toBe(0); expect(state.contexts).toBe(0);
    expect(state.enabled).not.toContain('iam-review'); expect(state.enabled).not.toContain('app-summary');
  });
}
