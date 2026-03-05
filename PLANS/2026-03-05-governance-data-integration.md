# Governance Data Integration -- Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Integrate 18 new AWS governance/security data sources into the mapper's import pipeline, compliance engine, posture dashboard, and reports.

**Architecture:** No topology/SVG changes. New textareas feed data through existing parse pipeline into `ctx.*` fields. A new `runGovernanceChecks(ctx)` function in compliance-engine.js generates findings. A new "Posture" tab in the unified dashboard shows account-level service status. A new report module renders posture tables.

**Tech Stack:** Vanilla JS (no framework), D3.js for dashboard cards, existing compliance-engine pattern, Node test runner for unit tests.

**Design Doc:** `PLANS/2026-03-05-governance-data-integration-design.md`

**Test Data:** `aws-export-multi-20260305-125628/` (prod, staging, dev profiles with real exports)

**Security Note:** innerHTML usage in Task 7 and 9 follows the existing app-core.js pattern where all content is derived from parsed AWS API responses (not user-provided HTML). This is consistent with how all other dashboard tabs render.

---

## Task 1: Add Textarea Definitions

**Files:**
- Modify: `src/app-core.js:92-141` (inputSections array)

**Step 1: Add two new sections to inputSections**

After the `IAM` section (line 140), before the closing `];` on line 141, add:

```javascript
  {t:'Governance',open:false,inputs:[
    {id:'in_cloudtrail',l:'CloudTrail',c:'cloudtrail describe-trails'},
    {id:'in_cwalarms',l:'CW Alarms',c:'cloudwatch describe-alarms'},
    {id:'in_loggroups',l:'Log Groups',c:'logs describe-log-groups'},
    {id:'in_flowlogs',l:'Flow Logs',c:'ec2 describe-flow-logs'},
    {id:'in_configrecorders',l:'Config Recorders',c:'configservice describe-configuration-recorders'},
    {id:'in_configrules',l:'Config Rules',c:'configservice describe-config-rules'},
    {id:'in_configconformance',l:'Config Conformance',c:'configservice describe-conformance-packs'},
    {id:'in_securityhub',l:'Security Hub',c:'securityhub get-enabled-standards'},
    {id:'in_accessanalyzer',l:'Access Analyzer',c:'accessanalyzer list-analyzers'},
    {id:'in_kmskeys',l:'KMS Keys',c:'(see export script -- multi-step)'},
    {id:'in_guardduty',l:'GuardDuty',c:'(see export script -- multi-step)'},
    {id:'in_secrets',l:'Secrets Manager',c:'secretsmanager list-secrets'},
    {id:'in_ssmparams',l:'SSM Parameters',c:'ssm describe-parameters'},
  ]},
  {t:'Integration',open:false,inputs:[
    {id:'in_ecr',l:'ECR Repos',c:'ecr describe-repositories'},
    {id:'in_asg',l:'Auto Scaling',c:'autoscaling describe-auto-scaling-groups'},
    {id:'in_apigw',l:'API Gateway',c:'apigateway get-rest-apis'},
    {id:'in_sns',l:'SNS Topics',c:'sns list-topics'},
    {id:'in_sqs',l:'SQS Queues',c:'sqs list-queues'},
  ]},
```

**Step 2: Verify sidebar renders**

Run: `node build.js && npx electron .`
Expected: Sidebar shows "Governance" and "Integration" sections with textareas

**Step 3: Commit**

```
feat(import): add 18 governance/integration textarea definitions
```

---

## Task 2: Add File Mapping

**Files:**
- Modify: `src/app-core.js:22660-22689` (fileMap array)
- Modify: `src/app-core.js:22724-22751` (matchFile content detection)

**Step 1: Add entries to fileMap**

After the `in_iam` entry (line 22688), before the closing `];` on line 22689, add:

```javascript
  // Governance
  {id:'in_cloudtrail',patterns:['cloudtrail-trail','cloudtrail_trail','cloudtrail']},
  {id:'in_cwalarms',patterns:['cloudwatch-alarm','cloudwatch_alarm','cwalarm','cw-alarm']},
  {id:'in_loggroups',patterns:['log-group','log_group','loggroup']},
  {id:'in_flowlogs',patterns:['flow-log','flow_log','flowlog']},
  {id:'in_configrecorders',patterns:['config-recorder','config_recorder','configrecorder']},
  {id:'in_configrules',patterns:['config-rule','config_rule','configrule']},
  {id:'in_configconformance',patterns:['config-conformance','config_conformance','conformance-pack','conformance_pack']},
  {id:'in_securityhub',patterns:['securityhub-standard','securityhub_standard','securityhub','security-hub']},
  {id:'in_accessanalyzer',patterns:['access-analyzer','access_analyzer','accessanalyzer']},
  {id:'in_kmskeys',patterns:['kms-key','kms_key','kmskey','kms']},
  {id:'in_guardduty',patterns:['guardduty-detector','guardduty_detector','guardduty']},
  {id:'in_secrets',patterns:['secret','secrets']},
  {id:'in_ssmparams',patterns:['ssm-parameter','ssm_parameter','ssmparameter','ssm']},
  // Integration
  {id:'in_ecr',patterns:['ecr-repositor','ecr_repositor','ecrrepositor','ecr']},
  {id:'in_asg',patterns:['auto-scaling-group','auto_scaling_group','autoscalinggroup','asg']},
  {id:'in_apigw',patterns:['api-gateway','api_gateway','apigateway','apigw']},
  {id:'in_sns',patterns:['sns-topic','sns_topic','snstopic','sns']},
  {id:'in_sqs',patterns:['sqs-queue','sqs_queue','sqsqueue','sqs']},
```

**Step 2: Add content-based fallback in matchFile**

After the `UserDetailList` check (line 22750), before the closing `}` on line 22751, add:

```javascript
    // Governance
    if(_hasKey('trailList'))return 'in_cloudtrail';
    if(_hasKey('MetricAlarms'))return 'in_cwalarms';
    if(_hasKey('logGroups'))return 'in_loggroups';
    if(_hasKey('FlowLogs'))return 'in_flowlogs';
    if(_hasKey('ConfigurationRecorders'))return 'in_configrecorders';
    if(_hasKey('ConfigRules'))return 'in_configrules';
    if(_hasKey('ConformancePackDetails'))return 'in_configconformance';
    if(_hasKey('StandardsSubscriptions'))return 'in_securityhub';
    if(_hasKey('analyzers'))return 'in_accessanalyzer';
    if(_hasKey('SecretList'))return 'in_secrets';
    // Integration
    if(_hasKey('repositories')&&_hasKey('repositoryArn'))return 'in_ecr';
    if(_hasKey('AutoScalingGroups'))return 'in_asg';
    if(_hasKey('QueueUrls'))return 'in_sqs';
```

Note: KMS keys (`Keys` array) and GuardDuty (`Detectors` array) use our custom export format, so filename matching handles them. SNS `Topics` is too generic for content detection -- rely on filename match. Same for API Gateway `items`.

**Step 3: Test file drop**

Run: `node build.js && npx electron .`
Drop the `aws-export-multi-20260305-125628/prod/us-east-1/` folder onto the upload area.
Expected: All 36 files matched (existing + new governance files)

**Step 4: Commit**

```
feat(import): add file mapping for 18 governance/integration sources
```

---

## Task 3: Add Context Parsing

**Files:**
- Modify: `src/app-core.js:8712-8714` (variable declarations)
- Modify: `src/app-core.js:8718-8734` (prebuilt context path)
- Modify: `src/app-core.js:8777-8782` (textarea parse path)
- Modify: `src/app-core.js:12585-12664` (_buildRlCtxFromData)

**Step 1: Add variable declarations**

After the existing declarations on lines 8712-8714, add a new line:

```javascript
  let cloudtrailTrails,cwAlarms,logGroups,flowLogs,configRecorders,configRules,configConformance;
  let securityHubStds,accessAnalyzers,kmsKeys,guarddutyDetectors,secrets,ssmParams;
  let ecrRepos,asgs,apiGateways,snsTopics,sqsQueues;
```

**Step 2: Add prebuilt context extraction**

Inside the `if(_prebuiltCtx)` block (after line 8728), add:

```javascript
    cloudtrailTrails=pc.cloudtrailTrails||[];cwAlarms=pc.cwAlarms||[];logGroups=pc.logGroups||[];
    flowLogs=pc.flowLogs||[];configRecorders=pc.configRecorders||[];configRules=pc.configRules||[];
    configConformance=pc.configConformance||[];securityHubStds=pc.securityHubStds||[];
    accessAnalyzers=pc.accessAnalyzers||[];kmsKeys=pc.kmsKeys||[];
    guarddutyDetectors=pc.guarddutyDetectors||[];secrets=pc.secrets||[];ssmParams=pc.ssmParams||[];
    ecrRepos=pc.ecrRepos||[];asgs=pc.asgs||[];apiGateways=pc.apiGateways||[];
    snsTopics=pc.snsTopics||[];sqsQueues=pc.sqsQueues||[];
```

**Step 3: Add textarea parsing**

After the IAM parse (line 8779), before `tagResource` (line 8780), add:

```javascript
  // Governance
  cloudtrailTrails=ext(_cachedParse('in_cloudtrail'),['trailList']);
  cwAlarms=ext(_cachedParse('in_cwalarms'),['MetricAlarms']);
  logGroups=ext(_cachedParse('in_loggroups'),['logGroups']);
  flowLogs=ext(_cachedParse('in_flowlogs'),['FlowLogs']);
  configRecorders=ext(_cachedParse('in_configrecorders'),['ConfigurationRecorders']);
  configRules=ext(_cachedParse('in_configrules'),['ConfigRules']);
  configConformance=ext(_cachedParse('in_configconformance'),['ConformancePackDetails']);
  securityHubStds=ext(_cachedParse('in_securityhub'),['StandardsSubscriptions']);
  accessAnalyzers=ext(_cachedParse('in_accessanalyzer'),['analyzers']);
  const kmsRaw=_cachedParse('in_kmskeys');
  kmsKeys=kmsRaw?(kmsRaw.Keys||[]):[];
  const gdRaw=_cachedParse('in_guardduty');
  guarddutyDetectors=gdRaw?(gdRaw.Detectors||[]):[];
  secrets=ext(_cachedParse('in_secrets'),['SecretList']);
  ssmParams=ext(_cachedParse('in_ssmparams'),['Parameters']);
  // Integration
  ecrRepos=ext(_cachedParse('in_ecr'),['repositories']);
  asgs=ext(_cachedParse('in_asg'),['AutoScalingGroups']);
  const apigwRaw=_cachedParse('in_apigw');
  apiGateways=apigwRaw?(apigwRaw.items||apigwRaw.Items||[]):[];
  const snsRaw=_cachedParse('in_sns');
  snsTopics=snsRaw?(snsRaw.Topics||[]):[];
  const sqsRaw=_cachedParse('in_sqs');
  sqsQueues=sqsRaw?(sqsRaw.QueueUrls||[]):[];
```

**Step 4: Add to ctx object**

Find where the `ctx` object is assembled (search for `ctx.vpcs=` or equivalent pattern after the parse block). Add all new fields to ctx:

```javascript
  ctx.cloudtrailTrails=cloudtrailTrails;ctx.cwAlarms=cwAlarms;ctx.logGroups=logGroups;
  ctx.flowLogs=flowLogs;ctx.configRecorders=configRecorders;ctx.configRules=configRules;
  ctx.configConformance=configConformance;ctx.securityHubStds=securityHubStds;
  ctx.accessAnalyzers=accessAnalyzers;ctx.kmsKeys=kmsKeys;
  ctx.guarddutyDetectors=guarddutyDetectors;ctx.secrets=secrets;ctx.ssmParams=ssmParams;
  ctx.ecrRepos=ecrRepos;ctx.asgs=asgs;ctx.apiGateways=apiGateways;
  ctx.snsTopics=snsTopics;ctx.sqsQueues=sqsQueues;
```

**Step 5: Mirror in _buildRlCtxFromData**

In `_buildRlCtxFromData()` (line 12585+), after the existing parse block (around line 12617), add the same parsing using `_val()` instead of `_cachedParse()`:

```javascript
    // Governance
    let cloudtrailTrails=ext(_val('in_cloudtrail'),['trailList']);
    let cwAlarms=ext(_val('in_cwalarms'),['MetricAlarms']);
    let logGroups=ext(_val('in_loggroups'),['logGroups']);
    let flowLogs=ext(_val('in_flowlogs'),['FlowLogs']);
    let configRecorders=ext(_val('in_configrecorders'),['ConfigurationRecorders']);
    let configRules=ext(_val('in_configrules'),['ConfigRules']);
    let configConformance=ext(_val('in_configconformance'),['ConformancePackDetails']);
    let securityHubStds=ext(_val('in_securityhub'),['StandardsSubscriptions']);
    let accessAnalyzers=ext(_val('in_accessanalyzer'),['analyzers']);
    let kmsRaw2=_val('in_kmskeys');let kmsKeys=kmsRaw2?(kmsRaw2.Keys||[]):[];
    let gdRaw2=_val('in_guardduty');let guarddutyDetectors=gdRaw2?(gdRaw2.Detectors||[]):[];
    let secrets=ext(_val('in_secrets'),['SecretList']);
    let ssmParams=ext(_val('in_ssmparams'),['Parameters']);
    // Integration
    let ecrRepos=ext(_val('in_ecr'),['repositories']);
    let asgs=ext(_val('in_asg'),['AutoScalingGroups']);
    let apigwRaw2=_val('in_apigw');let apiGateways=apigwRaw2?(apigwRaw2.items||apigwRaw2.Items||[]):[];
    let snsRaw2=_val('in_sns');let snsTopics=snsRaw2?(snsRaw2.Topics||[]):[];
    let sqsRaw2=_val('in_sqs');let sqsQueues=sqsRaw2?(sqsRaw2.QueueUrls||[]):[];
```

Then add these fields to the returned context object (find where the function builds the return value).

**Step 6: Build and verify**

Run: `node build.js`
Expected: No build errors

**Step 7: Commit**

```
feat(import): parse 18 governance/integration sources into render context
```

---

## Task 4: Write Governance Check Tests

**Files:**
- Create: `tests/unit/governance-checks.test.mjs`

**Step 1: Create test file**

Write tests covering all governance checks. Follow the existing pattern in `tests/unit/compliance-engine.test.mjs` for global setup. Test each control ID with both failing and passing conditions. See design doc for full check list.

Key test cases:
- CIS-2.1: no trails, non-multi-region trail, fully-configured trail
- CIS-2.2: log validation disabled
- CIS-2.3: no KMS encryption
- CIS-2.4: no CloudWatch integration
- CIS-2.7: VPC without flow logs, VPC with flow logs
- GOV-GD1: no GuardDuty detectors
- GOV-GD2: disabled features (check specific feature name in message)
- GOV-CFG1: no Config recorder, recorder not all-supported
- GOV-CFG2: recorder exists but no rules
- GOV-SH1: no Security Hub standards
- GOV-AA1: no Access Analyzer
- GOV-KMS1: rotation disabled, rotation enabled
- GOV-LOG1: no retention, with retention
- GOV-ECR1: mutable tags
- GOV-ECR2: scan-on-push disabled
- GOV-SEC1: rotation disabled
- GOV-APIGW1: non-TLS-1.2

**Step 2: Run tests -- expect failures**

Run: `npm run test:unit -- --test-name-pattern governance`
Expected: All tests FAIL (runGovernanceChecks not yet exported)

**Step 3: Commit**

```
test(governance): add unit tests for governance compliance checks
```

---

## Task 5: Implement Governance Checks

**Files:**
- Modify: `src/modules/compliance-engine.js` (add runGovernanceChecks, wire into runComplianceChecks)

**Step 1: Add runGovernanceChecks function**

Before the `runComplianceChecks` export (line 432), add `runGovernanceChecks(ctx)`. This function returns an array of findings. Each finding uses the standard format: `{severity, control, framework:'GOV'|'CIS', resource, resourceName, message, remediation}`.

Checks to implement (see design doc Section 3 for full specification):
- CloudTrail: CIS-2.1 through CIS-2.4
- Flow Logs: CIS-2.7 (cross-reference flowLogs ResourceId with vpcs VpcId)
- GuardDuty: GOV-GD1, GOV-GD2
- Config: GOV-CFG1, GOV-CFG2
- Security Hub: GOV-SH1
- Access Analyzer: GOV-AA1
- KMS: GOV-KMS1
- Log Groups: GOV-LOG1
- ECR: GOV-ECR1, GOV-ECR2
- Secrets: GOV-SEC1
- API Gateway: GOV-APIGW1

**Step 2: Wire into runComplianceChecks**

On line 436, add `...runGovernanceChecks(ctx)` to the spread array.

**Step 3: Export runGovernanceChecks**

Add to the module's exports.

**Step 4: Run tests -- expect pass**

Run: `npm run test:unit -- --test-name-pattern governance`
Expected: All tests PASS

**Step 5: Run full unit test suite**

Run: `npm run test:unit`
Expected: All existing tests still pass

**Step 6: Commit**

```
feat(compliance): add governance checks for 18 new data sources
```

---

## Task 6: Add Effort Map, Compliance Refs, and CKV Mappings

**Files:**
- Modify: `src/modules/compliance-view.js:9-43` (EFFORT_MAP)
- Modify: `src/modules/compliance-view.js:46-127` (complianceRefs)
- Modify: `src/modules/compliance-engine.js:10-40` (_CKV_MAP)

**Step 1: Add effort ratings to EFFORT_MAP**

After the BUDR entries (line 42), before the closing `};`, add:

```javascript
  // Governance
  'CIS-2.1':'high','CIS-2.2':'low','CIS-2.3':'med','CIS-2.4':'med','CIS-2.7':'med',
  'GOV-GD1':'high','GOV-GD2':'low',
  'GOV-CFG1':'high','GOV-CFG2':'med',
  'GOV-SH1':'high','GOV-AA1':'med',
  'GOV-KMS1':'low','GOV-LOG1':'low',
  'GOV-ECR1':'low','GOV-ECR2':'low',
  'GOV-SEC1':'med','GOV-APIGW1':'low',
```

**Step 2: Add compliance references to complianceRefs**

Add entries mapping each new control ID to its AWS documentation URL and reference label. Use actual AWS docs URLs for CloudTrail, GuardDuty, Config, Security Hub, Access Analyzer, KMS, ECR, Secrets Manager, API Gateway, VPC Flow Logs, and CloudWatch Logs.

**Step 3: Add CKV mappings to _CKV_MAP**

```javascript
  'CIS-2.1':'CKV_AWS_252',  // CloudTrail multi-region
  'CIS-2.2':'CKV_AWS_36',   // CloudTrail log validation
  'CIS-2.3':'CKV_AWS_35',   // CloudTrail KMS encryption
  'CIS-2.7':'CKV_AWS_126',  // VPC flow logs
  'GOV-KMS1':'CKV_AWS_7',   // KMS rotation
  'GOV-ECR1':'CKV_AWS_51',  // ECR tag immutability
  'GOV-ECR2':'CKV_AWS_163', // ECR scan on push
```

**Step 4: Build and run tests**

Run: `node build.js && npm run test:unit`
Expected: Build succeeds, all tests pass

**Step 5: Commit**

```
feat(compliance): add effort map, references, and CKV mappings for governance checks
```

---

## Task 7: Build Security Posture Dashboard Tab

**Files:**
- Modify: `src/app-core.js` (add to _UDASH_TABS, implement render function)
- Modify: `src/styles/main.css` (posture dashboard styles)

**Step 1: Find _UDASH_TABS array and add posture tab**

Search for `_UDASH_TABS` in app-core.js. Add a new tab entry:

```javascript
  {id:'posture',label:'Security Posture',icon:'',
   prereq:function(){return true},
   render:function(){_renderPostureDash()}},
```

**Step 2: Implement _renderPostureDash function**

Add before `openUnifiedDash` (line 18770). This function:
1. Gets `udashBody` element
2. Reads governance data from `_rlCtx` (or current context)
3. Computes status per service (green/yellow/red/gray)
4. Builds a three-column card grid using DOM methods or the same HTML-building pattern used by other dashboard tabs

Columns:
- Detection and Monitoring: CloudTrail, GuardDuty, VPC Flow Logs, CloudWatch Alarms
- Configuration and Compliance: AWS Config, Security Hub, IAM Access Analyzer, Config Rules
- Encryption and Secrets: KMS Keys, Secrets Manager, SSM Parameters, ECR Repositories, Log Groups

Footer row: API Gateway count, SNS Topics count, SQS Queues count

Status logic per card (see design doc Section 4 for full specification).

**Step 3: Add CSS for posture dashboard**

In `src/styles/main.css`, add styles for `.posture-grid`, `.posture-col`, `.posture-card`, `.posture-card-hdr`, `.posture-card-body`, `.posture-footer`. Use CSS grid with 3 columns, existing CSS custom properties for colors.

**Step 4: Build and test manually**

Run: `node build.js && npx electron .`
Load test data, open unified dashboard, click "Security Posture" tab.
Expected: Three-column card grid with status dots.

**Step 5: Commit**

```
feat(dashboard): add Security Posture tab to unified dashboard
```

---

## Task 8: Add Detail Panel Enrichment

**Files:**
- Modify: `src/app-core.js` (detail panel rendering functions)

**Step 1: Build cross-reference maps after governance parsing**

After the governance data is parsed in `_renderMapInner()` (after Task 3's additions), build:

```javascript
  const flowLogsByVpc={};(flowLogs||[]).forEach(fl=>{
    if(fl.ResourceId&&fl.ResourceId.startsWith('vpc-')){(flowLogsByVpc[fl.ResourceId]=flowLogsByVpc[fl.ResourceId]||[]).push(fl)}});
  const apiGwByVpce={};(apiGateways||[]).forEach(api=>{
    ((api.endpointConfiguration||{}).vpcEndpointIds||[]).forEach(vpceId=>{(apiGwByVpce[vpceId]=apiGwByVpce[vpceId]||[]).push(api)})});
```

Store on ctx: `ctx.flowLogsByVpc=flowLogsByVpc; ctx.apiGwByVpce=apiGwByVpce;`

**Step 2: Enrich VPC detail panel**

Find the VPC detail panel rendering function (search for the function that builds VPC info in the detail sidebar). Add a "Flow Logs" section showing FlowLogId, TrafficType, and LogDestinationType for each flow log attached to the VPC.

**Step 3: Enrich VPC Endpoint detail panel**

Find the VPC Endpoint detail panel. Add an "API Gateways" section showing connected API Gateway name, endpoint type, and TLS policy.

**Step 4: Build and test**

Run: `node build.js && npx electron .`
Load test data, click a VPC with flow logs, verify section appears.
Click a VPC Endpoint linked to an API Gateway, verify section appears.

**Step 5: Commit**

```
feat(detail-panel): enrich VPC and VPC Endpoint panels with governance data
```

---

## Task 9: Add Security Posture Report Module

**Files:**
- Modify: `src/app-core.js:652-689` (_RPT_MODULES array)
- Add `_rptSecurityPosture` function near existing report render functions

**Step 1: Add report module to _RPT_MODULES**

After the `exec-summary` entry (line 656), add:

```javascript
  {id:'security-posture',name:'Security Posture',icon:'',category:'security',enabled:true,
   available:function(){return !!_rlCtx},
   desc:function(){if(!_rlCtx)return 'No data';
     var g=_rlCtx.guarddutyDetectors||[];var ct=_rlCtx.cloudtrailTrails||[];
     return (ct.length?'CloudTrail ':'')+(g.length?'GuardDuty ':'')+'posture data'},
   render:function(ctx,opts){return _rptSecurityPosture(ctx,opts)}},
```

**Step 2: Implement _rptSecurityPosture**

Add near other `_rpt*` functions. This function:
1. Reads governance data from ctx or _rlCtx
2. Builds three HTML tables (Detection and Monitoring, Configuration and Compliance, Encryption and Secrets)
3. Each row: Service name, Status (PASS/PARTIAL/FAIL), Detail text
4. Uses the same `rpt-tbl` CSS class as other report tables
5. Supports account filter via `_rptGetAccountFilter()` and `_rptFilterByAccount()`

**Step 3: Build and test**

Run: `node build.js && npx electron .`
Load data, open Report Builder, enable "Security Posture" module.
Expected: Renders three tables with PASS/PARTIAL/FAIL status per service.

**Step 4: Commit**

```
feat(reports): add Security Posture report module
```

---

## Task 10: Build Verification and Smoke Test

**Step 1: Production build**

Run: `node build.js --production`
Expected: No errors, dist/ files generated

**Step 2: Run full test suite**

Run: `npm run test:unit`
Expected: All unit tests pass (including new governance tests)

**Step 3: Manual E2E verification**

Run: `npx electron .`
1. Drop `aws-export-multi-20260305-125628/prod/us-east-1/` folder
2. Verify: All files matched (check console for unmatched warnings)
3. Verify: Compliance dashboard shows new GOV-* findings
4. Verify: Security Posture tab renders with card grid
5. Verify: VPC detail panel shows Flow Logs
6. Verify: Report builder includes Security Posture module
7. Verify: Existing map rendering unchanged

**Step 4: Final commit**

```
chore: verify governance integration build and tests
```

---

## Task Summary

| Task | Description | Files | Type |
|------|-------------|-------|------|
| 1 | Textarea definitions | app-core.js | Wiring |
| 2 | File mapping | app-core.js | Wiring |
| 3 | Context parsing | app-core.js | Wiring |
| 4 | Governance check tests | tests/unit/ | TDD |
| 5 | Governance checks impl | compliance-engine.js | TDD |
| 6 | Effort map + refs + CKV | compliance-view.js, compliance-engine.js | Config |
| 7 | Posture dashboard tab | app-core.js, main.css | UI |
| 8 | Detail panel enrichment | app-core.js | UI |
| 9 | Report module | app-core.js | UI |
| 10 | Build + smoke test | -- | Verification |
