const { test, expect } = require('@playwright/test');
const { BASE } = require('./helpers');

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
          [albArn]: [{
            TargetGroupName: payload,
            TargetGroupArn: 'arn:aws:elasticloadbalancing:us-east-1:123:targetgroup/test/1',
            Protocol: payload,
            Port: 443,
            TargetType: payload,
            HealthCheckPath: payload,
            Targets: [{}]
          }]
        },
        wafByAlb: { [albArn]: [{ Name: payload, Description: payload, Rules: [{ Name: payload }] }] },
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
});
