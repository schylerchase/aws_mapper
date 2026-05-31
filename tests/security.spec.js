const { test, expect } = require('@playwright/test');
const { BASE, loadDemo, openDashTab } = require('./helpers');

test.describe('Security', () => {
  test('subnet detail panel escapes imported resource fields', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('aws_mapper_onboarded', '1'));
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.locator('#landingDash').waitFor({ state: 'visible', timeout: 10000 });

    await page.evaluate(() => {
      window.__awsMapperXss = false;
      const payload = '<img src=x onerror="window.__awsMapperXss=true">';
      const sub = {
        SubnetId: 'subnet-test',
        VpcId: 'vpc-test',
        CidrBlock: '10.0.1.0/24',
        AvailabilityZone: 'us-east-1a',
        Tags: [{ Key: 'Name', Value: 'test-subnet' }]
      };
      const inst = {
        InstanceId: 'i-test',
        InstanceType: payload,
        State: { Name: payload },
        PrivateIpAddress: payload,
        Tags: [{ Key: 'Name', Value: 'test-instance' }]
      };
      const eni = {
        NetworkInterfaceId: 'eni-test',
        PrivateIpAddress: payload,
        InterfaceType: payload,
        Status: payload,
        Description: payload,
        Groups: [{ GroupId: 'sg-test', GroupName: payload }],
        Attachment: { InstanceId: 'i-test' }
      };
      const albArn = 'arn:aws:elasticloadbalancing:us-east-1:123:loadbalancer/app/test/1';
      const alb = {
        LoadBalancerName: payload,
        LoadBalancerArn: albArn,
        Type: payload,
        Scheme: payload,
        DNSName: payload
      };
      const rds = {
        DBInstanceIdentifier: payload,
        Engine: payload,
        DBInstanceClass: payload,
        DBInstanceStatus: payload,
        Endpoint: { Address: payload, Port: 5432 },
        AllocatedStorage: 20
      };
      const ecs = {
        serviceName: payload,
        clusterArn: 'arn:aws:ecs:us-east-1:123:cluster/' + payload,
        launchType: payload,
        runningCount: 1,
        desiredCount: 1,
        cpu: payload,
        memory: payload
      };
      const fn = {
        FunctionName: payload,
        Runtime: payload,
        MemorySize: payload,
        Timeout: payload
      };

      openSubnetPanel(sub, 'vpc-test', {
        pubSubs: new Set(['subnet-test']),
        subRT: {},
        subNacl: {},
        instBySub: { 'subnet-test': [inst] },
        eniBySub: { 'subnet-test': [eni] },
        albBySub: { 'subnet-test': [alb] },
        sgByVpc: {},
        volByInst: {},
        enis: [eni],
        snapByVol: {},
        tgByAlb: {
          [albArn]: [
            {
              TargetGroupName: payload,
              TargetGroupArn: 'arn:aws:elasticloadbalancing:us-east-1:123:targetgroup/test/1',
              Protocol: payload,
              Port: 443,
              TargetType: payload,
              HealthCheckPath: payload,
              Targets: [{}]
            }
          ]
        },
        wafByAlb: {
          [albArn]: [{ Name: payload, Description: payload, Rules: [{ Name: payload }] }]
        },
        cfByAlb: { [albArn]: [{ DomainName: payload, Aliases: { Items: [payload] } }] },
        rdsBySub: { 'subnet-test': [rds] },
        ecsBySub: { 'subnet-test': [ecs] },
        lambdaBySub: { 'subnet-test': [fn] },
        ecacheByVpc: {},
        redshiftByVpc: {}
      });
    });

    await page.locator('#detailPanel.open').waitFor({ state: 'visible', timeout: 5000 });
    await page.waitForTimeout(100);

    await expect(page.locator('#dpBody img')).toHaveCount(0);
    expect(await page.evaluate(() => window.__awsMapperXss)).toBe(false);
    await expect(page.locator('#dpBody')).toContainText('<img src=x onerror=');
  });

  test('resource lists escape imported detail fields', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('aws_mapper_onboarded', '1'));
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.locator('#landingDash').waitFor({ state: 'visible', timeout: 10000 });

    await page.evaluate(() => {
      window.__awsMapperResourceListXss = false;
      const payload = '<img src=x onerror="window.__awsMapperResourceListXss=true">';
      _rlCtx = {
        vpcs: [],
        subnets: [{ SubnetId: 'subnet-test', VpcId: 'vpc-test', CidrBlock: '10.0.1.0/24' }],
        instances: [
          {
            InstanceId: 'i-test',
            InstanceType: payload,
            State: { Name: payload },
            SubnetId: 'subnet-test',
            NetworkInterfaces: [{ PrivateIpAddress: payload }],
            Tags: [{ Key: 'Name', Value: 'test-instance' }]
          }
        ]
      };

      openResourceList('EC2');
    });

    await page.locator('#detailPanel.open').waitFor({ state: 'visible', timeout: 5000 });
    await page.waitForTimeout(100);

    await expect(page.locator('#dpBody img')).toHaveCount(0);
    expect(await page.evaluate(() => window.__awsMapperResourceListXss)).toBe(false);
    await expect(page.locator('#dpBody')).toContainText('<img src=x onerror=');
  });

  test('design toolbar treats imported resource IDs as inert data', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('aws_mapper_onboarded', '1'));
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.locator('#landingDash').waitFor({ state: 'visible', timeout: 10000 });

    const result = await page.evaluate(() => {
      window.__awsMapperDesignToolbarXss = false;
      const payload = "vpc-safe'||(window.__awsMapperDesignToolbarXss=true)||'";
      _designMode = true;
      _rlCtx = {
        vpcs: [{ VpcId: payload, CidrBlock: '10.0.0.0/16' }],
        subnets: [],
        instances: [],
        sgs: [],
        routeTables: [],
        natGateways: [],
        igws: [],
        endpoints: []
      };

      openResourceList('VPCs');
      const toolbar = document.querySelector('#dpBody .design-toolbar');
      const subButton = Array.from(toolbar.querySelectorAll('button')).find((button) =>
        button.textContent.startsWith('+ Sub')
      );
      subButton.click();

      const gatewayContainer = document.createElement('div');
      document.body.appendChild(gatewayContainer);
      injectDesignToolbar(gatewayContainer, {
        type: 'gateway',
        gwType: 'IGW',
        data: "'||(window.__awsMapperDesignToolbarXss=true)||'"
      });
      const gatewayToolbar = gatewayContainer.querySelector('.design-toolbar');
      gatewayToolbar.querySelector('button').click();

      return {
        onclickCount: toolbar.querySelectorAll('[onclick]').length,
        gatewayOnclickCount: gatewayToolbar.querySelectorAll('[onclick]').length,
        buttonText: toolbar.textContent,
        xss: window.__awsMapperDesignToolbarXss
      };
    });

    expect(result.onclickCount).toBe(0);
    expect(result.gatewayOnclickCount).toBe(0);
    expect(result.buttonText).toContain('window.__awsMapperDesignToolbarXss=true');
    expect(result.xss).toBe(false);
  });

  test('map resource lookups tolerate selector metacharacters in imported IDs', async ({
    page
  }) => {
    await page.addInitScript(() => localStorage.setItem('aws_mapper_onboarded', '1'));
    await loadDemo(page);

    const result = await page.evaluate(() => {
      const payload = 'vpc-selector"] [data-vpc-id="other';
      const node = document.querySelector('[data-vpc-id]');
      if (!node) {
        return { setup: 'missing-node', errors: [] };
      }
      const originalId = node.getAttribute('data-vpc-id');
      node.setAttribute('data-vpc-id', payload);
      const vpc = (_rlCtx.vpcs || []).find((item) => item.VpcId === originalId);
      if (vpc) {
        vpc.VpcId = payload;
        vpc.Tags = [{ Key: 'Name', Value: 'selector stress VPC' }];
      }

      const errors = [];
      try {
        _zoomToElement(payload);
      } catch (err) {
        errors.push('_zoomToElement:' + err.name);
      }
      try {
        _openResourceSpotlight(payload);
      } catch (err) {
        errors.push('_openResourceSpotlight:' + err.name);
      }
      try {
        _annotations = {
          [payload]: [
            { text: 'selector note', category: 'info', created: new Date().toISOString() }
          ]
        };
        _renderNoteBadges();
      } catch (err) {
        errors.push('_renderNoteBadges:' + err.name);
      }

      return {
        errors,
        spotlightOpened: !!document.getElementById('spotlightCard'),
        noteBadges: document.querySelectorAll('.note-badge').length
      };
    });

    expect(result.setup).toBeUndefined();
    expect(result.errors).toEqual([]);
    expect(result.spotlightOpened).toBe(true);
    expect(result.noteBadges).toBeGreaterThan(0);
  });

  test('notes author input escapes persisted author value', async ({ page }) => {
    const payload = '&quot; autofocus onfocus="window.__awsMapperNoteAuthorXss=true" data-x="';
    await page.addInitScript((author) => {
      localStorage.setItem('aws_mapper_onboarded', '1');
      localStorage.setItem('aws_mapper_note_author', author);
    }, payload);
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.locator('#landingDash').waitFor({ state: 'visible', timeout: 10000 });

    const result = await page.evaluate(() => {
      window.__awsMapperNoteAuthorXss = false;
      _renderNotesPanel();
      const input = document.getElementById('noteNewAuthor');
      input.dispatchEvent(new FocusEvent('focus'));
      return {
        value: input.value,
        onfocus: input.getAttribute('onfocus'),
        autofocus: input.hasAttribute('autofocus'),
        xss: window.__awsMapperNoteAuthorXss
      };
    });

    expect(result.value).toContain('autofocus onfocus=');
    expect(result.onfocus).toBeNull();
    expect(result.autofocus).toBe(false);
    expect(result.xss).toBe(false);
  });

  test('notes resource picker escapes imported resource names and ids', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('aws_mapper_onboarded', '1'));
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.locator('#landingDash').waitFor({ state: 'visible', timeout: 10000 });

    const result = await page.evaluate(() => {
      window.__awsMapperNoteSelectXss = false;
      const payload = '\"></option><img src=x onerror=\"window.__awsMapperNoteSelectXss=true\">';
      _rlCtx = {
        vpcs: [{ VpcId: payload, Tags: [{ Key: 'Name', Value: payload }] }],
        subnets: [],
        instances: [{ InstanceId: 'i-test', Tags: [{ Key: 'Name', Value: payload }] }],
        rdsInstances: [],
        lambdaFns: [],
        sgs: []
      };
      _annotations = {};
      _renderNotesPanel();
      return {
        imgCount: document.querySelectorAll('#notesPanelBody img').length,
        optionText: document.getElementById('noteNewResource').textContent,
        xss: window.__awsMapperNoteSelectXss
      };
    });

    expect(result.imgCount).toBe(0);
    expect(result.optionText).toContain('&lt;img src=x onerror=');
    expect(result.xss).toBe(false);
  });

  test('BUDR dashboard tolerates unexpected tiers and escapes finding severity', async ({
    page
  }) => {
    await page.addInitScript(() => localStorage.setItem('aws_mapper_onboarded', '1'));
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.locator('#landingDash').waitFor({ state: 'visible', timeout: 10000 });

    const result = await page.evaluate(() => {
      window.__awsMapperBudrXss = false;
      const payload = '<img src=x onerror="window.__awsMapperBudrXss=true">';
      _rlCtx = {};
      _budrDashState = { tierFilter: 'all', search: '', sort: 'tier' };
      _budrAssessments = [
        {
          id: 'rds-test',
          name: payload,
          type: 'RDS',
          profile: { tier: payload, rto: payload, rpo: payload, strategy: 'cold' },
          classTier: payload,
          signals: {},
          compliance: { status: 'unknown', issues: [] }
        }
      ];
      _budrFindings = [
        {
          severity: payload,
          resource: 'rds-test',
          message: payload,
          remediation: payload
        }
      ];
      document.getElementById('udash').classList.add('open');
      _renderBUDRDash();
      return {
        imgCount: document.querySelectorAll('#udashBody img').length,
        bodyText: document.getElementById('udashBody').textContent,
        xss: window.__awsMapperBudrXss
      };
    });

    expect(result.imgCount).toBe(0);
    expect(result.bodyText).toContain('<img src=x onerror=');
    expect(result.xss).toBe(false);
  });

  test('HTML report embedded data is scoped and script-safe', async ({ page }) => {
    await loadDemo(page);
    await openDashTab(page, 'reports');

    const result = await page.evaluate(async () => {
      window.__awsMapperReportXss = false;
      const payload = '</script><img src=x onerror="window.__awsMapperReportXss=true">';
      const originalTitle = _rptState.title;
      _rptState.title = payload;
      try {
        const html = await _rptFullHTML(['exec-summary'], null);
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const jsonEl = doc.getElementById('rpt-embedded-data');
        const parsed = JSON.parse(jsonEl.textContent);
        return {
          parsedTitle: parsed.title,
          breakoutHtml: html.includes('</script><img'),
          injectedImages: doc.querySelectorAll('img[onerror]').length,
          findings: parsed.findings.length,
          budrAssessments: parsed.budrAssessments.length,
          budrFindings: parsed.budrFindings.length,
          inventoryData: parsed.inventoryData.length,
          iamReviewData: parsed.iamReviewData.length,
          appRegistry: parsed.appRegistry.length,
          xss: window.__awsMapperReportXss
        };
      } finally {
        _rptState.title = originalTitle;
      }
    });

    expect(result.parsedTitle).toContain('</script>');
    expect(result.breakoutHtml).toBe(false);
    expect(result.injectedImages).toBe(0);
    expect(result.findings).toBe(0);
    expect(result.budrAssessments).toBe(0);
    expect(result.budrFindings).toBe(0);
    expect(result.inventoryData).toBe(0);
    expect(result.iamReviewData).toBe(0);
    expect(result.appRegistry).toBe(0);
    expect(result.xss).toBe(false);
  });

  test('clear removes persisted workspace storage', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('aws_mapper_onboarded', '1'));
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.locator('#landingDash').waitFor({ state: 'visible', timeout: 10000 });

    const result = await page.evaluate(() => {
      localStorage.setItem(
        'aws_mapper_snapshots',
        JSON.stringify([{ textareas: { vpcs: 'secret' } }])
      );
      localStorage.setItem(
        'aws_mapper_annotations',
        JSON.stringify({ 'i-test': [{ text: 'secret' }] })
      );
      localStorage.setItem('aws_mapper_note_author', 'secret author');
      sessionStorage.setItem(
        'aws_mapper_session',
        JSON.stringify({ _ts: Date.now(), vpcs: 'secret' })
      );
      _snapshots = [{ textareas: { vpcs: 'secret' } }];
      _annotations = { 'i-test': [{ text: 'secret' }] };
      _annotationAuthor = 'secret author';

      document.getElementById('clearBtn').click();

      return {
        snapshotsKey: localStorage.getItem('aws_mapper_snapshots'),
        annotationsKey: localStorage.getItem('aws_mapper_annotations'),
        authorKey: localStorage.getItem('aws_mapper_note_author'),
        sessionKey: sessionStorage.getItem('aws_mapper_session'),
        snapshotCount: _snapshots.length,
        annotationCount: Object.keys(_annotations).length,
        author: _annotationAuthor
      };
    });

    expect(result.snapshotsKey).toBeNull();
    expect(result.annotationsKey).toBeNull();
    expect(result.authorKey).toBeNull();
    expect(result.sessionKey).toBeNull();
    expect(result.snapshotCount).toBe(0);
    expect(result.annotationCount).toBe(0);
    expect(result.author).toBe('');
  });
});
