const { test, expect } = require('@playwright/test');
const { BASE } = require('./helpers');

const accounts = ['a', 'b'].map((name, index) => ({
  id: index ? '222222222222' : '111111111111', label: 'Account ' + name,
  textareas: { in_vpcs: { Vpcs: [{ VpcId: 'vpc-' + name, CidrBlock: '10.' + (index + 1) + '.0.0/16', OwnerId: index ? '222222222222' : '111111111111' }] } },
}));
const merged = { _format: 'awsmap', _version: '2.0', textareas: {}, multiViewMode: true, accounts };

async function open(page, project) {
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.addInitScript(() => localStorage.setItem('aws_mapper_onboarded', '1'));
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof _loadProjectData === 'function');
  await page.evaluate(value => _loadProjectData(value), project);
  await page.waitForFunction(() => _rlCtx && document.getElementById('loadingOverlay').style.display === 'none');
}

async function save(page) {
  return page.evaluate(async () => {
    let blob; const original = downloadBlob; downloadBlob = value => { blob = value; };
    try { saveProject(); return JSON.parse(await blob.text()); } finally { downloadBlob = original; }
  });
}

for (const hidden of [true, false]) {
  test('last account survives project round trip while ' + (hidden ? 'hidden' : 'visible'), async ({ page, context }) => {
    await open(page, merged);
    await page.evaluate(() => removeAccountContext(1));
    await page.waitForFunction(() => _loadedContexts.length === 1 && _rlCtx.vpcs.length === 1 && !document.getElementById('in_vpcs').value.includes('vpc-b'));
    if (hidden) {
      await page.evaluate(() => openAccountPanel());
      await page.locator('#accountPanelBody button', { hasText: /^Hide$/ }).click();
      await page.waitForFunction(() => _rlCtx.vpcs.length === 0 && document.getElementById('in_vpcs').value === '');
    }
    const saved = await save(page);
    expect(saved._version).toBe('2.0');
    expect(saved.accounts).toHaveLength(1);
    expect(saved.accounts[0].visible).toBe(!hidden);
    expect(saved.accounts[0].textareas.in_vpcs.Vpcs[0].VpcId).toBe('vpc-a');
    const restored = await context.newPage();
    try {
      await open(restored, saved);
      expect(await restored.evaluate(() => ({ merged: _multiViewMode, visible: _loadedContexts.map(a => a.visible), vpcs: _rlCtx.vpcs.map(v => v.VpcId) })))
        .toEqual({ merged: true, visible: [!hidden], vpcs: hidden ? [] : ['vpc-a'] });
      if (hidden) {
        await restored.evaluate(() => openAccountPanel());
        await restored.locator('#accountPanelBody button', { hasText: /^Show$/ }).click();
        await restored.waitForFunction(() => _rlCtx.vpcs.length === 1 && !!document.querySelector('#mapSvg [data-vpc-id="vpc-a"]'));
      }
      expect(await restored.evaluate(() => _rlCtx.vpcs[0].VpcId)).toBe('vpc-a');
    } finally { await restored.close(); }
  });
}

test('plain single-account project still saves and loads as version 1', async ({ page, context }) => {
  await open(page, { _format: 'awsmap', textareas: accounts[0].textareas });
  const saved = await save(page);
  expect(saved._version).toBe('1.0');
  expect(saved.accounts).toBeUndefined();
  expect(saved.textareas.in_vpcs.Vpcs[0].VpcId).toBe('vpc-a');
  const restored = await context.newPage();
  try {
    await open(restored, saved);
    expect(await restored.evaluate(() => ({ merged: _multiViewMode, vpcs: _rlCtx.vpcs.map(v => v.VpcId) })))
      .toEqual({ merged: false, vpcs: ['vpc-a'] });
  } finally { await restored.close(); }
});
