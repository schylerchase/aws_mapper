const { test, expect } = require('@playwright/test');
const { BASE, openDashTab } = require('./helpers');
const A = '111111111111', B = '222222222222';

function account(id, suffix, region, name) {
  const vpc = 'vpc-' + suffix, subnet = 'subnet-' + suffix;
  return { id, label: 'Account ' + suffix, region, textareas: {
    in_vpcs: { Vpcs: [{ VpcId: vpc, OwnerId: id, CidrBlock: '10.' + (suffix === 'A' ? '1' : '2') + '.0.0/16', Tags: [{ Key: 'Name', Value: name }] }] },
    in_subnets: { Subnets: [{ SubnetId: subnet, VpcId: vpc, OwnerId: id, CidrBlock: '10.' + (suffix === 'A' ? '1' : '2') + '.1.0/24', AvailabilityZone: region + 'a', Tags: [{ Key: 'Name', Value: name + '_SUBNET' }] }] },
    in_rds: { DBInstances: [{ DBInstanceIdentifier: 'shared', DBInstanceArn: 'arn:aws:rds:' + region + ':' + id + ':db:shared', DBInstanceStatus: 'available', Engine: 'postgres', DBInstanceClass: 'db.t3.small', MultiAZ: true, BackupRetentionPeriod: 7, StorageEncrypted: true, DBSubnetGroup: { VpcId: vpc, Subnets: [{ SubnetIdentifier: subnet }] } }] },
    in_cloudtrail: { trailList: [{ Name: 'trail-' + suffix, IsMultiRegionTrail: true, LogFileValidationEnabled: true, KmsKeyId: 'example-key', CloudWatchLogsLogGroupArn: 'example-log-group', IsLogging: suffix !== 'A' }] }
  } };
}
const project = () => ({ _format: 'awsmap', _version: '2.0', layout: 'grid', multiViewMode: true,
  textareas: {}, accounts: [account(A, 'A', 'us-east-1', 'SELECTED_ACCOUNT_VPC'), account(B, 'B', 'us-west-2', 'FOREIGN_PRIVATE_VPC')] });

async function loadAccounts(page, data = project()) {
  await page.addInitScript(() => localStorage.setItem('aws_mapper_onboarded', '1'));
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof _loadProjectData === 'function');
  await page.evaluate(value => _loadProjectData(value), data);
  await page.waitForFunction(() => _multiViewMode && _rlCtx?.vpcs?.length === 2 && document.querySelectorAll('#mapSvg .vpc-group').length === 2);
  await expect(page.locator('#loadingOverlay')).toBeHidden();
  await expect(page.locator('#landingDash')).toBeHidden();
}

test('classification edits the selected scoped row and retains its tier on engine rerun', async ({ page }) => {
  await loadAccounts(page);
  const before = await page.evaluate(() => {
    _classificationOverrides = {};
    runClassificationEngine(_rlCtx);
    return _classificationData.filter(r => r.type === 'RDS').map(r => ({ key: r.overrideKey, account: r._accountId, tier: r.tier, auto: r.auto }));
  });
  await openDashTab(page, 'classification');
  await page.evaluate(value => { _udashAcctFilter = value; _renderClassificationTab(); }, B);
  await page.locator('.gov-override-select[data-res-id="shared"]').selectOption('critical');
  const after = await page.evaluate(() => {
    runClassificationEngine(_rlCtx);
    _renderClassificationTab();
    return { overrides: _classificationOverrides, rows: _classificationData.filter(r => r.type === 'RDS').map(r => ({ key: r.overrideKey, account: r._accountId, tier: r.tier, auto: r.auto })) };
  });
  expect(after.rows.find(r => r.account === A)).toEqual(before.find(r => r.account === A));
  expect(after.rows.find(r => r.account === B)).toMatchObject({ tier: 'critical', auto: false });
  expect(Object.keys(after.overrides)).toEqual([before.find(r => r.account === B).key]);
  await expect(page.locator('.gov-override-select[data-res-id="shared"]')).toHaveValue('critical');
});

test('BUDR config opens the chosen duplicate-name card, saves scoped overrides, persists and resets', async ({ page }) => {
  await loadAccounts(page);
  const before = await page.evaluate(() => {
    _budrOverrides = { shared: { strategy: 'low', rto: 'FOREIGN_LEGACY_VALUE' } };
    runBUDRChecks(_rlCtx);
    return _budrAssessments.filter(r => r.type === 'RDS').map(r => ({ key: r.overrideKey, account: r.account || r._accountId, profile: { ...r.profile } }));
  });
  await openDashTab(page, 'budr');
  await page.locator('.budr-section[data-tier="protected"] .budr-section-hdr').click();
  const cardB = page.locator('.budr-res').filter({ has: page.locator('.acct-pill', { hasText: 'Account B' }) });
  const cardA = page.locator('.budr-res').filter({ has: page.locator('.acct-pill', { hasText: 'Account A' }) });
  await cardB.locator('.budr-cfg-btn').click();
  await expect(cardB.locator('.budr-override-form')).toBeVisible();
  await expect(cardA.locator('.budr-override-form')).toBeHidden();
  await cardB.locator('.budr-ov-strategy').selectOption('critical');
  await cardB.locator('.budr-ov-rto').fill('1 minute');
  await cardB.locator('.budr-ov-rpo').fill('0');
  await cardB.locator('.budr-ov-save').click();
  const current = await page.evaluate(() => _budrAssessments.filter(r => r.type === 'RDS').map(r => ({ key: r.overrideKey, account: r.account || r._accountId, profile: { ...r.profile } })));
  expect(current.find(r => r.account === A)).toEqual(before.find(r => r.account === A));
  expect(current.find(r => r.account === B).profile).toMatchObject({ strategy: 'hot', rto: '1 minute', rpo: '0' });
  const exported = await page.evaluate(async () => {
    let blob; const old = downloadBlob; downloadBlob = value => { blob = value; };
    try { document.getElementById('budrExportJSON').click(); return JSON.parse(await blob.text()); }
    finally { downloadBlob = old; }
  });
  expect(exported.overrides[before.find(r => r.account === B).key]).toMatchObject({ strategy: 'critical', rto: '1 minute' });
  const saved = await page.evaluate(async () => {
    let blob; const old = downloadBlob; downloadBlob = value => { blob = value; };
    try { saveProject(); return JSON.parse(await blob.text()); } finally { downloadBlob = old; }
  });
  await loadAccounts(page, saved);
  await openDashTab(page, 'budr');
  await page.locator('.budr-section[data-tier="protected"] .budr-section-hdr').click();
  const loaded = await page.evaluate(() => _budrAssessments.filter(r => r.type === 'RDS').map(r => ({ key: r.overrideKey, account: r.account || r._accountId, profile: { ...r.profile } })));
  expect(loaded.find(r => r.account === B).profile).toMatchObject({ rto: '1 minute', rpo: '0' });
  expect(loaded.find(r => r.account === A)).toEqual(before.find(r => r.account === A));
  await cardB.locator('.budr-cfg-btn').click();
  await cardB.locator('.budr-ov-reset').click();
  const reset = await page.evaluate(() => ({ overrides: _budrOverrides, rows: _budrAssessments.filter(r => r.type === 'RDS').map(r => ({ key: r.overrideKey, account: r.account || r._accountId, profile: { ...r.profile } })) }));
  expect(reset.rows.find(r => r.account === B)).toEqual(before.find(r => r.account === B));
  expect(reset.rows.find(r => r.account === A)).toEqual(before.find(r => r.account === A));
  expect(reset.overrides).toEqual({ shared: { strategy: 'low', rto: 'FOREIGN_LEGACY_VALUE' } });
});

for (const layout of ['grid', 'landingzone', 'executive']) {
  test('selected-account report removes foreign rendered nodes and labels in ' + layout + ' SVG and PNG', async ({ page }) => {
    await loadAccounts(page);
    if (layout !== 'grid') {
      await page.evaluate(value => new Promise(resolve => { document.getElementById('layoutMode').value = value; renderMap(resolve); }), layout);
      await page.waitForFunction(mode => document.querySelectorAll(mode === 'executive' ? '#mapSvg .exec-card' : '#mapSvg .vpc-group').length === 2, layout);
    }
    await openDashTab(page, 'reports');
    await page.locator('#rptAccountFilter').selectOption(A);
    const result = await page.evaluate(async () => {
      const svg = document.getElementById('mapSvg'), root = svg.querySelector('.map-root');
      const live = new XMLSerializer().serializeToString(svg);
      const uri = _rptBuildSvgUri(svg, root);
      const xml = decodeURIComponent(escape(atob(uri.split(',')[1])));
      const scoped = new DOMParser().parseFromString(xml, 'image/svg+xml');
      document.getElementById('rptAccountFilter').value = 'all';
      const all = decodeURIComponent(escape(atob(_rptBuildSvgUri(svg, root).split(',')[1])));
      document.getElementById('rptAccountFilter').value = '111111111111';
      const pngPromise = _rptCapturePNG();
      const unchanged = live === new XMLSerializer().serializeToString(svg);
      const png = await pngPromise;
      const image = new Image();
      image.src = png;
      await image.decode();
      const scopedWidth = Number(scoped.documentElement.getAttribute('width'));
      return { xml, all, unchanged, selected: scoped.querySelectorAll('[data-vpc-id="vpc-A"]').length,
        foreign: scoped.querySelectorAll('[data-vpc-id="vpc-B"], [data-subnet-id="subnet-B"]').length,
        scopedWidth, allWidth: Number(new DOMParser().parseFromString(all, 'image/svg+xml').documentElement.getAttribute('width')),
        pngWidth: image.naturalWidth, pngHeight: image.naturalHeight, scopedHeight: Number(scoped.documentElement.getAttribute('height')) };
    });
    expect(result.xml).toContain('SELECTED_ACCOUNT_VPC');
    expect(result.xml).not.toContain('FOREIGN_PRIVATE_VPC');
    expect(result.xml).not.toContain('222222222222');
    expect(result.selected).toBe(1); expect(result.foreign).toBe(0);
    expect(result.all).toContain('FOREIGN_PRIVATE_VPC');
    expect(result.unchanged).toBe(true);
    expect(result.scopedWidth).toBeLessThan(result.allWidth);
    expect(result.pngWidth).toBe(Math.round(result.scopedWidth * Math.min(2, 8000 / result.scopedWidth, 8000 / result.scopedHeight)));
    expect(result.pngHeight).toBeGreaterThan(0);
  });
}

test('live report and security dashboard cannot pass a stopped CloudTrail', async ({ page }) => {
  await loadAccounts(page);
  await openDashTab(page, 'reports');
  await page.locator('#rptAccountFilter').selectOption(A);
  const row = await page.evaluate(() => _rptSecurityPosture(_rlCtx, {}).match(/<tr><td>CloudTrail<\/td>[\s\S]*?<\/tr>/)[0]);
  expect(row).toContain('FAIL'); expect(row).not.toContain('PASS'); expect(row).toContain('1 stopped');
  await openDashTab(page, 'posture');
  await page.evaluate(() => { _rlCtx.cloudtrailTrails.forEach(t => t.IsLogging = false); _renderPostureDash(); });
  const cloudTrail = page.locator('.posture-card').filter({ hasText: 'CloudTrail' });
  await expect(cloudTrail).toContainText('FAIL');
  await expect(cloudTrail).not.toContainText('PASS');
});
