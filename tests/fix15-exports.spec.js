const { test, expect } = require('@playwright/test');
const { BASE, openDashTab } = require('./helpers');
const A = '111111111111', B = '222222222222';

function account(id, suffix, region) {
  const vpc = 'vpc-' + suffix, subnet = 'subnet-' + suffix;
  return { id, label: 'Account ' + suffix, region, textareas: {
    in_vpcs: { Vpcs: [{ VpcId: vpc, OwnerId: id, CidrBlock: '10.' + (suffix === 'A' ? '1' : '2') + '.0.0/16' }] },
    in_subnets: { Subnets: [{ SubnetId: subnet, VpcId: vpc, OwnerId: id, CidrBlock: '10.' + (suffix === 'A' ? '1' : '2') + '.1.0/24', AvailabilityZone: region + 'a' }] },
    in_ec2: { Reservations: [{ OwnerId: id, Instances: [{ InstanceId: 'i-' + suffix, VpcId: vpc, SubnetId: subnet, Placement: { AvailabilityZone: region + 'a' }, Tags: [{ Key: 'Name', Value: suffix + '_RESOURCE' }, { Key: 'Application', Value: suffix + '_APP' }], State: { Name: 'running' } }] }] },
    in_rds: { DBInstances: [{ DBInstanceIdentifier: 'shared', DBInstanceArn: 'arn:aws:rds:' + region + ':' + id + ':db:shared', DBInstanceStatus: 'available', Engine: 'postgres', MultiAZ: true, BackupRetentionPeriod: 7, DBSubnetGroup: { VpcId: vpc, Subnets: [{ SubnetIdentifier: subnet }] } }] }
  } };
}
async function loadAccounts(page) {
  await page.addInitScript(() => localStorage.setItem('aws_mapper_onboarded', '1'));
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof _loadProjectData === 'function');
  await page.evaluate(value => _loadProjectData(value), { _format: 'awsmap', _version: '2.0', layout: 'grid', multiViewMode: true, textareas: {}, accounts: [account(A, 'A', 'us-east-1'), account(B, 'B', 'us-west-2')] });
  await page.waitForFunction(() => _multiViewMode && _rlCtx?.vpcs?.length === 2 && document.querySelectorAll('#mapSvg .vpc-group').length === 2);
  await expect(page.locator('#loadingOverlay')).toBeHidden();
  await page.evaluate(() => { runClassificationEngine(_rlCtx); runBUDRChecks(_rlCtx); });
}

for (const selected of [A, B, 'all']) {
  test('IAM/application HTML, DOCX and XLSX retain only ' + selected + ' report rows', async ({ page }) => {
    await loadAccounts(page);
    await page.evaluate(() => {
      const roles = ['111111111111', '222222222222'].map((id, i) => ({ RoleName: (i ? 'B' : 'A') + '_ROLE', Arn: 'arn:aws:iam::' + id + ':role/' + (i ? 'B' : 'A') + '_ROLE', AssumeRolePolicyDocument: { Version: '2012-10-17', Statement: [{ Effect: 'Allow', Principal: { Service: 'lambda.amazonaws.com' }, Action: 'sts:AssumeRole' }] }, RolePolicyList: [{ PolicyName: 'admin', PolicyDocument: { Version: '2012-10-17', Statement: [{ Effect: 'Allow', Action: '*', Resource: '*' }] } }] }));
      _iamData = parseIAMData({ RoleDetailList: roles }); prepareIAMReviewData(_iamData);
      _appRegistry = []; _appAutoDiscovered = false; _autoDiscoverApps();
      _appRegistry.push({ name: 'SHARED_APP', pattern: '_RESOURCE', type: '', tier: '' });
    });
    await openDashTab(page, 'reports');
    await page.locator('#rptAccountFilter').selectOption(selected);
    const result = await page.evaluate(async () => {
      _RPT_MODULES.forEach(m => m.enabled = ['exec-summary', 'iam-review', 'app-summary'].includes(m.id));
      const html = _rptAppSummary(_rlCtx, {});
      let blob; const old = downloadBlob; downloadBlob = value => { blob = value; };
      try {
        const docs = {};
        for (const tone of ['technical', 'executive']) {
          blob = null; await _core.generateDocx(tone);
          if (!blob) throw new Error('DOCX did not download');
          docs[tone] = await (await JSZip.loadAsync(blob)).file('word/document.xml').async('string');
        }
        blob = null; await _core.generateXlsx();
        if (!blob) throw new Error('XLSX did not download');
        const wb = XLSX.read(await blob.arrayBuffer(), { type: 'array' });
        const sheet = name => XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1 });
        return { html, docs, iam: sheet('IAM Review'), apps: sheet('App Summary'), resources: sheet('App Resources'), summary: sheet('Summary') };
      } finally { downloadBlob = old; }
    });
    const expected = selected === 'all' ? ['A', 'B'] : [selected === A ? 'A' : 'B'];
    for (const suffix of ['A', 'B']) {
      const included = expected.includes(suffix);
      expect(result.html.includes(suffix + '_RESOURCE')).toBe(included);
      expect(result.html.includes(suffix + '_APP')).toBe(included);
      for (const tone of ['technical', 'executive']) {
        expect(result.docs[tone].includes(suffix + '_ROLE')).toBe(included);
        expect(result.docs[tone].includes(suffix + '_APP')).toBe(included);
      }
      expect(result.docs.technical.includes(suffix + '_RESOURCE')).toBe(included);
    }
    expect(result.iam.slice(1).map(row => row[0]).sort()).toEqual(expected.map(s => s + '_ROLE'));
    expect(result.apps.slice(1).map(row => row[0]).sort()).toEqual([...expected.map(s => s + '_APP'), 'SHARED_APP'].sort());
    expect(result.apps.find(row => row[0] === 'SHARED_APP')[3]).toBe(expected.length);
    expect([...new Set(result.resources.slice(1).map(row => row[1]))].sort()).toEqual(expected.map(s => s + '_RESOURCE'));
    expect(result.summary.find(row => row[0] === 'VPCs')[1]).toBe(expected.length);
    expect(result.html).toContain((expected.length + 1) + ' applications identified across ' + (expected.length * 4) + ' resources');
  });
}

test('BUDR CSV/JSON scope rows, summary, findings and qualified/legacy overrides', async ({ page }) => {
  await loadAccounts(page);
  const keys = await page.evaluate(() => {
    const a = _budrAssessments.find(r => r.type === 'RDS' && (r.account || r._accountId) === '111111111111');
    const b = _budrAssessments.find(r => r.type === 'RDS' && (r.account || r._accountId) === '222222222222');
    _budrOverrides = { [a.overrideKey]: { rto: 'A_OVERRIDE' }, [b.overrideKey]: { rto: 'B_OVERRIDE' }, shared: { rto: 'AMBIGUOUS_LEGACY' }, 'i-A': { strategy: 'critical', rto: 'A_LEGACY' } };
    _reapplyBUDROverrides();
    _budrFindings = [
      { resource: 'i-A', resourceType: 'EC2', _accountId: '111111111111', _region: 'us-east-1', message: 'A_FINDING', severity: 'HIGH' },
      { resource: 'i-B', resourceType: 'EC2', _accountId: '222222222222', _region: 'us-west-2', message: 'B_FINDING', severity: 'HIGH' },
      { resource: 'shared', message: 'AMBIGUOUS_FINDING', severity: 'HIGH' }
    ];
    return { a: a.overrideKey, b: b.overrideKey };
  });
  await openDashTab(page, 'budr');
  await page.evaluate(() => { _udashAcctFilter = '111111111111'; _renderBUDRDash(); });
  const scoped = await page.evaluate(async () => {
    let blob; const old = downloadBlob; downloadBlob = value => { blob = value; };
    try {
      document.getElementById('budrExportJSON').click(); const json = JSON.parse(await blob.text());
      document.getElementById('budrExportCSV').click(); return { json, csv: await blob.text() };
    } finally { downloadBlob = old; }
  });
  expect(scoped.json.assessments).toHaveLength(2);
  expect(scoped.json.assessments.map(r => r.id).sort()).toEqual(['i-A', 'shared']);
  expect(Object.values(scoped.json.summary).reduce((a, b) => a + b, 0)).toBe(2);
  expect(scoped.json.findings.map(f => f.message)).toEqual(['A_FINDING']);
  expect(Object.keys(scoped.json.overrides).sort()).toEqual([keys.a, 'i-A'].sort());
  expect(scoped.csv).toContain('A_RESOURCE'); expect(scoped.csv).not.toContain('B_RESOURCE');
  expect(scoped.csv.trim().split('\n')).toHaveLength(3);
  const all = await page.evaluate(async () => {
    _udashAcctFilter = 'all'; _renderBUDRDash();
    let blob; const old = downloadBlob; downloadBlob = value => { blob = value; };
    try { document.getElementById('budrExportJSON').click(); return JSON.parse(await blob.text()); } finally { downloadBlob = old; }
  });
  expect(all.assessments).toHaveLength(4); expect(all.findings).toHaveLength(3);
  expect(Object.keys(all.overrides).sort()).toEqual([keys.a, keys.b, 'shared', 'i-A'].sort());
  expect(Object.values(all.summary).reduce((a, b) => a + b, 0)).toBe(4);
});

test('imported BUDR findings attach only to their account, region and resource type', async ({ page }) => {
  await loadAccounts(page);
  const keys = await page.evaluate(() => {
    const a = _budrAssessments.find(r => r.type === 'RDS' && (r.account || r._accountId) === '111111111111');
    const westKey = resourceOverrideKey({ _accountId: '111111111111', _region: 'us-west-2', Arn: 'arn:aws:rds:us-west-2:111111111111:db:shared' }, 'RDS', 'shared');
    const ecsKey = resourceOverrideKey({ _accountId: '111111111111', _region: 'us-east-1', Arn: 'arn:aws:ecs:us-east-1:111111111111:service/shared' }, 'ECS', 'shared');
    const findings = [
      { resource: 'shared', resourceType: 'RDS', _accountId: '111111111111', _region: 'us-east-1', message: 'A_EAST_WARNING' },
      { resource: 'shared', resourceType: 'RDS', _accountId: '111111111111', _region: 'us-west-2', message: 'A_WEST_WARNING' },
      { resource: 'shared', resourceType: 'RDS', _accountId: '222222222222', _region: 'us-west-2', message: 'B_WARNING' },
      { resource: 'shared', resourceType: 'ECS', _accountId: '111111111111', _region: 'us-east-1', message: 'A_ECS_WARNING' },
      { resource: 'shared', message: 'AMBIGUOUS_WARNING' },
      { resource: 'i-A', message: 'UNIQUE_LEGACY_WARNING' }
    ].map(f => ({ ...f, severity: 'HIGH', control: 'BUDR-BAK-1', framework: 'BUDR', remediation: 'Review backups' }));
    _applyImportedData({ title: 'Scoped import', contexts: [{ accountId: '111111111111', accountLabel: 'Account A' }, { accountId: '222222222222', accountLabel: 'Account B' }], budrAssessments: [..._budrAssessments, { ...a, region: 'us-west-2', overrideKey: westKey }, { ...a, type: 'ECS', overrideKey: ecsKey }], budrFindings: findings }, 'json');
    return { east: a.overrideKey, west: westKey, ecs: ecsKey };
  });
  await openDashTab(page, 'budr');
  await page.evaluate(() => { _udashAcctFilter = '111111111111'; _renderBUDRDash(); });
  const cards = await page.locator('.budr-res').evaluateAll(nodes => nodes.map(node => ({ key: node.querySelector('.budr-override-form').dataset.overrideKey, id: node.querySelector('.budr-override-form').dataset.rid, text: node.textContent })));
  for (const [key, message] of [[keys.east, 'A_EAST_WARNING'], [keys.west, 'A_WEST_WARNING'], [keys.ecs, 'A_ECS_WARNING']]) {
    const card = cards.find(c => c.key === key);
    expect(card.text).toContain(message);
    for (const other of ['A_EAST_WARNING', 'A_WEST_WARNING', 'A_ECS_WARNING', 'B_WARNING', 'AMBIGUOUS_WARNING'].filter(m => m !== message)) expect(card.text).not.toContain(other);
  }
  expect(cards.find(c => c.id === 'i-A').text).toContain('UNIQUE_LEGACY_WARNING');
});
