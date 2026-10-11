const { test, expect } = require('@playwright/test');
const { BASE, openDashTab } = require('./helpers');
const A = '111111111111', B = '222222222222';

const finding = (account, region, type, name, severity, message) => ({
  _accountId: account, _region: region, resourceType: type,
  resource: 'shared', resourceName: name, severity, message,
  framework: 'ARCH', control: 'ARCH-DB-1', remediation: 'Review database protection'
});
const groupedReport = () => ({
  title: 'Grouped findings', enabledModules: ['compliance'],
  contexts: [{ accountId: A, accountLabel: 'Account A' }, { accountId: B, accountLabel: 'Account B' }],
  findings: [finding(B, 'us-west-2', 'RDS', 'B_DATABASE_RESOURCE', 'CRITICAL', 'B_PRIVATE_MESSAGE'),
    finding(A, 'us-east-1', 'RDS', 'A_DATABASE_RESOURCE', 'LOW', 'A_PUBLIC_MESSAGE')]
});

async function openApp(page) {
  await page.addInitScript(() => localStorage.setItem('aws_mapper_onboarded', '1'));
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof _applyImportedData === 'function');
}
async function loadReport(page) {
  await openApp(page);
  await page.evaluate(async data => { _applyImportedData(data, 'json'); await _renderRptPreview(); }, groupedReport());
}

async function exerciseGroupedFilters(table) {
  const header = table.locator('.rpt-ctrl-row');
  const details = table.locator('.rpt-ctrl-detail');
  const children = table.locator('.rpt-detail-table > tbody > tr:visible');
  await header.click();
  await expect(details).toBeVisible();
  await expect(children).toHaveCount(2);
  await table.locator('.rpt-pill[data-attr="account"][data-val="' + A + '"]').click();
  await expect(details).toBeVisible();
  await expect(children).toHaveCount(1);
  await expect(children).toContainText('A_DATABASE_RESOURCE');
  await expect(header.locator('td').nth(2)).toHaveText('1');
  await expect(header.locator('.sev-badge')).toHaveText('LOW');
  await expect(header.locator('td').nth(3)).toHaveText('A_PUBLIC_MESSAGE');
  await expect(table.locator('.rpt-row-count')).toHaveText('1 of 1');

  // A foreign resource/message must not match while Account A is selected.
  await table.locator('.rpt-search').fill('B_PRIVATE_MESSAGE');
  await expect(header).toBeHidden();
  await expect(children).toHaveCount(0);
  await expect(table.locator('.rpt-row-count')).toHaveText('0 of 1');
  await table.locator('.rpt-clear').click();
  await expect(header).toBeVisible();
  await expect(details).toBeVisible();
  await expect(children).toHaveCount(2);
  await expect(header.locator('td').nth(2)).toHaveText('2');
  await expect(header.locator('.sev-badge')).toHaveText('CRITICAL');
  await expect(table.locator('.rpt-search')).toHaveValue('');
  await expect(table.locator('.rpt-row-count')).toHaveText('1 of 1');

  // Search must inspect child resources, then intersect with account pills.
  await table.locator('.rpt-search').fill('A_DATABASE_RESOURCE');
  await expect(children).toHaveCount(1);
  await expect(children).toContainText('A_DATABASE_RESOURCE');
  await expect(header.locator('td').nth(2)).toHaveText('1');
  await table.locator('.rpt-pill[data-attr="account"][data-val="' + B + '"]').click();
  await expect(header).toBeHidden();
  await expect(children).toHaveCount(0);
  await table.locator('.rpt-clear').click();
  await expect(children).toHaveCount(2);
  await expect(header.locator('td').nth(2)).toHaveText('2');

  await table.locator('.rpt-pill[data-attr="sev"][data-val="LOW"]').click();
  await expect(children).toHaveCount(1);
  await expect(children).toContainText('A_DATABASE_RESOURCE');
  await table.locator('.rpt-clear').click();
  await expect(children).toHaveCount(2);
  await expect(header.locator('.sev-badge')).toHaveText('CRITICAL');
}

test('report preview filters and searches grouped child findings, then restores all rows', async ({ page }) => {
  await loadReport(page);
  await exerciseGroupedFilters(page.locator('#rpt-tbl-compliance-ARCH'));
});

test('standalone exported HTML preserves scoped grouped filters and expanded rows', async ({ page, context }) => {
  await loadReport(page);
  const html = await page.evaluate(() => _rptFullHTML(['compliance'], null));
  const exported = await context.newPage();
  try {
    await exported.setContent(html, { waitUntil: 'load' });
    await exerciseGroupedFilters(exported.locator('#rpt-tbl-compliance-ARCH'));
  } finally { await exported.close(); }
});

test('HTML fallback import deduplicates only identical scoped findings', async ({ page }) => {
  await loadReport(page);
  const input = [
    finding(A, 'us-east-1', 'RDS', 'shared display name', 'HIGH', 'A_EAST_RDS'),
    finding(B, 'us-west-2', 'RDS', 'shared display name', 'HIGH', 'B_WEST_RDS'),
    finding(A, 'us-west-2', 'RDS', 'shared display name', 'HIGH', 'A_WEST_RDS'),
    finding(A, 'us-east-1', 'ECS', 'shared display name', 'HIGH', 'A_EAST_ECS')
  ];
  const result = await page.evaluate(data => {
    _complianceFindings = [...data, { ...data[0] }];
    const html = _rptCompliance(null, {});
    _parseImportedReport(html);
    return { source: _importedReportData.source, rows: _complianceFindings.map(f => ({
      account: f._accountId, region: f._region, type: f.resourceType, resource: f.resource, message: f.message
    })) };
  }, input);
  expect(result.source).toBe('html');
  expect(result.rows).toHaveLength(4);
  expect(result.rows).toEqual(input.map(f => ({ account: f._accountId, region: f._region,
    type: f.resourceType, resource: 'shared', message: f.message })));
});

test('classification tier edits refresh BUDR assessments, findings and subsequent cache hits', async ({ page }) => {
  await openApp(page);
  const key = JSON.stringify([A, 'us-east-1', 'RDS', 'arn:aws:rds:us-east-1:' + A + ':db:shared']);
  await page.evaluate(data => _loadProjectData(data), {
    _format: 'awsmap', layout: 'grid', classificationOverrides: { [key]: 'low' }, textareas: {
      in_vpcs: { Vpcs: [{ VpcId: 'vpc-A', OwnerId: A, CidrBlock: '10.1.0.0/16' }] },
      in_subnets: { Subnets: [{ SubnetId: 'subnet-A', VpcId: 'vpc-A', OwnerId: A,
        CidrBlock: '10.1.1.0/24', AvailabilityZone: 'us-east-1a' }] },
      in_rds: { DBInstances: [{ DBInstanceIdentifier: 'shared',
        DBInstanceArn: 'arn:aws:rds:us-east-1:' + A + ':db:shared', Engine: 'postgres',
        MultiAZ: false, BackupRetentionPeriod: 7,
        DBSubnetGroup: { VpcId: 'vpc-A', Subnets: [{ SubnetIdentifier: 'subnet-A' }] } }] }
    }
  });
  await page.waitForFunction(() => _rlCtx?.rdsInstances?.length === 1);
  await expect(page.locator('#loadingOverlay')).toBeHidden();
  await page.evaluate(() => _runComplianceWithCache(_rlCtx));
  const state = () => page.evaluate(() => {
    const row = _budrAssessments.find(r => r.type === 'RDS');
    return { classTier: row.classTier, status: row.compliance.status,
      classification: _classificationData.find(r => r.type === 'RDS').tier,
      tierFindings: _budrFindings.filter(f => f.resource === 'shared' && f.control.startsWith('BUDR-TIER')).length };
  });
  expect(await state()).toMatchObject({ classTier: 'low', status: 'pass', classification: 'low', tierFindings: 0 });
  await openDashTab(page, 'classification');
  await page.locator('.gov-override-select[data-res-id="shared"]').selectOption('critical');
  await openDashTab(page, 'budr');
  const critical = await state();
  expect(critical).toMatchObject({ classTier: 'critical', status: 'warn', classification: 'critical' });
  expect(critical.tierFindings).toBeGreaterThan(0);
  await page.evaluate(() => _runComplianceWithCache(_rlCtx));
  expect(await state()).toEqual(critical);
  await openDashTab(page, 'classification');
  await page.locator('.gov-override-select[data-res-id="shared"]').selectOption('low');
  await openDashTab(page, 'budr');
  expect(await state()).toMatchObject({ classTier: 'low', status: 'pass', classification: 'low', tierFindings: 0 });
  await page.evaluate(() => _runComplianceWithCache(_rlCtx));
  expect(await state()).toMatchObject({ classTier: 'low', status: 'pass', classification: 'low', tierFindings: 0 });
});
