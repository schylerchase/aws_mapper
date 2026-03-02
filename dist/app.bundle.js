var AppBundle = (() => {
  // src/modules/constants.js
  var SEV_ORDER = {
    CRITICAL: 1,
    HIGH: 2,
    MEDIUM: 3,
    LOW: 4
  };
  var FW_LABELS = {
    CIS: "CIS Benchmark",
    WAF: "AWS WAF",
    IAM: "IAM Security",
    ARCH: "Well-Architected Framework",
    SOC2: "SOC 2",
    PCI: "PCI DSS 4",
    BUDR: "Backup & DR"
  };
  var EOL_RUNTIMES = /* @__PURE__ */ new Set([
    "nodejs14.x",
    "nodejs12.x",
    "nodejs10.x",
    "nodejs8.10",
    "python2.7",
    "python3.6",
    "python3.7",
    "dotnetcore3.1",
    "dotnetcore2.1",
    "ruby2.5",
    "ruby2.7",
    "java8",
    "go1.x"
  ]);
  var EFFORT_LABELS = {
    low: "Low",
    med: "Med",
    high: "High"
  };
  var EFFORT_TIME = {
    low: "~5 min",
    med: "~1-2 hrs",
    high: "~1+ days"
  };
  var PRIORITY_META = {
    crit: {
      name: "Critical",
      color: "#ef4444",
      bg: "rgba(239,68,68,.08)",
      border: "rgba(239,68,68,.3)"
    },
    high: {
      name: "High",
      color: "#f97316",
      bg: "rgba(249,115,22,.08)",
      border: "rgba(249,115,22,.3)"
    },
    med: {
      name: "Medium",
      color: "#f59e0b",
      bg: "rgba(245,158,11,.08)",
      border: "rgba(245,158,11,.3)"
    },
    low: {
      name: "Low",
      color: "#3b82f6",
      bg: "rgba(59,130,246,.08)",
      border: "rgba(59,130,246,.3)"
    }
  };
  var TIER_META = PRIORITY_META;
  var PRIORITY_ORDER = {
    crit: 1,
    high: 2,
    med: 3,
    low: 4
  };
  var PRIORITY_KEYS = ["crit", "high", "med", "low"];
  var MUTE_KEY = "aws_mapper_muted_findings";
  var NOTES_KEY = "aws_mapper_annotations";
  var SNAP_KEY = "aws_mapper_snapshots";
  var SAVE_KEY = "aws_mapper_session";
  var MAX_SNAPSHOTS = 30;
  var SAVE_INTERVAL = 3e4;
  var NOTE_CATEGORIES = [
    "owner",
    "status",
    "incident",
    "todo",
    "info",
    "warning"
  ];

  // src/modules/utils.js
  function safeParse(t) {
    if (!t || !t.trim()) return null;
    try {
      return JSON.parse(t.trim());
    } catch (e) {
      const b = [];
      let d = 0, s = -1;
      for (let i = 0; i < t.length; i++) {
        if (t[i] === "{") {
          if (d === 0) s = i;
          d++;
        }
        if (t[i] === "}") {
          d--;
          if (d === 0 && s >= 0) {
            b.push(t.substring(s, i + 1));
            s = -1;
          }
        }
      }
      return b.length ? b.map((x) => {
        try {
          return JSON.parse(x);
        } catch (e2) {
          return null;
        }
      }).filter(Boolean) : null;
    }
  }
  function ext(r, keys) {
    if (!r) return [];
    const a = Array.isArray(r) ? r : [r];
    let res = [];
    for (const i of a) {
      for (const k of keys) {
        if (i[k]) res = res.concat(i[k]);
      }
    }
    return res;
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function gn(i, f) {
    const t = (i.Tags || []).find((x) => x.Key === "Name");
    return esc(t ? t.Value : f);
  }
  function sid(id) {
    return id ? id.replace(/^[a-z]+-/, "").substring(0, 10) : "";
  }
  function clsGw(id) {
    const m = {
      "igw-": "IGW",
      "vgw-": "VGW",
      "vpce-": "VPCE",
      "pcx-": "PCX",
      "eigw-": "EIGW",
      "lgw-": "LGW"
    };
    for (const [p, t] of Object.entries(m)) {
      if (id.startsWith(p)) return t;
    }
    return "GW";
  }
  function isShared(t) {
    return t === "TGW" || t === "PCX";
  }
  function gcv(t) {
    return {
      IGW: "var(--igw-color)",
      NAT: "var(--nat-color)",
      TGW: "var(--tgw-color)",
      VGW: "var(--vgw-color)",
      VPCE: "var(--vpce-color)",
      PCX: "var(--pcx-color)",
      EIGW: "var(--igw-color)"
    }[t] || "var(--text-muted)";
  }
  function gch(t) {
    return {
      IGW: "#10b981",
      NAT: "#f59e0b",
      TGW: "#ec4899",
      VGW: "#ef4444",
      VPCE: "#a78bfa",
      PCX: "#fb923c",
      EIGW: "#10b981"
    }[t] || "#4a5e80";
  }
  function gv(id) {
    return (document.getElementById(id) || {}).value || "";
  }

  // src/modules/dom-helpers.js
  function showToast(msg, duration = 3e3) {
    const t = document.createElement("div");
    t.style.cssText = `
    position:fixed;
    bottom:60px;
    left:50%;
    transform:translateX(-50%);
    z-index:300;
    background:var(--accent-green);
    color:#000;
    padding:8px 20px;
    border-radius:6px;
    font-family:Segoe UI,system-ui,sans-serif;
    font-size:12px;
    font-weight:600;
    box-shadow:0 4px 12px rgba(0,0,0,.4);
    transition:opacity .3s
  `;
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => {
      t.style.opacity = "0";
      setTimeout(() => t.remove(), 300);
    }, duration);
  }
  function closeAllDashboards(except) {
    const ids = ["udash", "diffDash", "notesPanel"];
    ids.forEach(function(id) {
      if (id === except) return;
      const el = document.getElementById(id);
      if (el && el.classList.contains("open")) {
        el.classList.remove("open");
      }
    });
    if (except !== "udash" && window._udashTab !== void 0) {
      window._udashTab = null;
    }
  }
  function toggleClass(el, className) {
    const element = typeof el === "string" ? document.getElementById(el) : el;
    if (!element) return false;
    const hasClass = element.classList.contains(className);
    element.classList.toggle(className);
    return !hasClass;
  }
  function setVisible(el, visible) {
    const element = typeof el === "string" ? document.getElementById(el) : el;
    if (!element) return;
    element.style.display = visible ? "" : "none";
  }
  function getEl(id) {
    return document.getElementById(id);
  }
  function qs(selector, parent = document) {
    return parent.querySelector(selector);
  }
  function qsa(selector, parent = document) {
    return Array.from(parent.querySelectorAll(selector));
  }

  // src/modules/prefs.js
  var PREFS_KEY = "awsNetMapPrefs";
  function loadPrefs() {
    try {
      const r = localStorage.getItem(PREFS_KEY);
      return r ? JSON.parse(r) : {};
    } catch (e) {
      return {};
    }
  }
  var _prefs = loadPrefs();
  function savePrefs(p) {
    for (const k of Object.keys(p)) {
      if (k === "__proto__" || k === "constructor" || k === "prototype") continue;
      _prefs[k] = p[k];
    }
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(_prefs));
    } catch (e) {
    }
  }

  // src/modules/demo-data.js
  function generateDemo() {
    let _seed = 12345;
    const _random = () => {
      _seed = _seed * 1664525 + 1013904223 | 0;
      return (_seed >>> 0) / 4294967296;
    };
    const AZS = ["us-east-1a", "us-east-1b", "us-east-1c"];
    const INST_TYPES = ["t3.micro", "t3.small", "t3.medium", "t3.large", "m5.large", "m5.xlarge", "m5.2xlarge", "r5.large", "r5.xlarge", "r5.2xlarge", "c5.large", "c5.xlarge"];
    const STATES = ["running", "running", "running", "running", "running", "stopped"];
    const LB_TYPES = ["application", "network"];
    const SVC_ENDPOINTS = ["s3", "dynamodb", "ssm", "ssmmessages", "ec2messages", "logs", "monitoring", "kms", "secretsmanager", "sts", "ecr.api", "ecr.dkr", "execute-api", "elasticloadbalancing", "autoscaling", "sqs", "sns", "events"];
    let iid = 1;
    function nid(p) {
      return p + "-" + String(iid++).padStart(5, "0");
    }
    const vpcDefs = [
      { name: "Production", cidr: "10.0.0.0/16", tiers: ["public", "private-web", "private-app", "private-api", "private-data", "private-cache", "private-queue", "private-mgmt"], azsUsed: 3, instancesPer: [4, 6, 10, 8, 6, 4, 3, 2], albCount: 5 },
      { name: "Staging", cidr: "10.1.0.0/16", tiers: ["public", "private-web", "private-app", "private-data", "private-cache"], azsUsed: 3, instancesPer: [2, 4, 6, 4, 2], albCount: 3 },
      { name: "Development", cidr: "10.2.0.0/16", tiers: ["public", "private-app", "private-data", "private-test"], azsUsed: 2, instancesPer: [2, 6, 3, 4], albCount: 2 },
      { name: "QA-Automation", cidr: "10.3.0.0/16", tiers: ["public", "private-runners", "private-selenium", "private-data"], azsUsed: 2, instancesPer: [1, 8, 6, 2], albCount: 1 },
      { name: "Shared-Services", cidr: "10.10.0.0/16", tiers: ["public", "private-tools", "private-monitoring", "private-cicd", "private-artifact", "private-vault"], azsUsed: 3, instancesPer: [2, 5, 4, 6, 3, 2], albCount: 3 },
      { name: "Data-Platform", cidr: "10.20.0.0/16", tiers: ["private-ingest", "private-streaming", "private-processing", "private-warehouse", "private-analytics", "private-ml"], azsUsed: 3, instancesPer: [5, 4, 8, 4, 3, 6], albCount: 2 },
      { name: "Security", cidr: "10.30.0.0/16", tiers: ["public", "private-siem", "private-scanner", "private-forensics", "private-logging"], azsUsed: 2, instancesPer: [1, 4, 3, 2, 4], albCount: 1 },
      { name: "DR-Recovery", cidr: "10.40.0.0/16", tiers: ["public", "private-web", "private-app", "private-data"], azsUsed: 2, instancesPer: [2, 3, 5, 3], albCount: 2 },
      { name: "Edge-Services", cidr: "10.50.0.0/16", tiers: ["public", "private-proxy", "private-waf", "private-cdn-origin"], azsUsed: 3, instancesPer: [3, 4, 3, 2], albCount: 3 },
      { name: "Management", cidr: "10.100.0.0/16", tiers: ["public", "private-bastion", "private-logging", "private-backup", "private-config"], azsUsed: 2, instancesPer: [1, 3, 4, 3, 2], albCount: 1 },
      { name: "Sandbox", cidr: "10.200.0.0/16", tiers: ["public", "private-dev1", "private-dev2", "private-experiment"], azsUsed: 2, instancesPer: [1, 5, 5, 3], albCount: 1 },
      { name: "PCI-Compliant", cidr: "10.60.0.0/16", tiers: ["private-dmz", "private-app", "private-tokenize", "private-vault", "private-audit"], azsUsed: 3, instancesPer: [3, 6, 4, 2, 2], albCount: 2 }
    ];
    const vpcs = [], subnets = [], rts = [], sgs = [], nacls = [], igwsList = [], natsList = [];
    const ec2Instances = [], albsList = [], vpceList = [];
    const volsList = [], enisList = [], snapsList = [], tgsList = [];
    let subOct = 0;
    vpcDefs.forEach((vd, vi) => {
      const vpcId = "vpc-" + vd.name.toLowerCase().replace(/[^a-z0-9]/g, "");
      vpcs.push({ VpcId: vpcId, CidrBlock: vd.cidr, State: "available", Tags: [{ Key: "Name", Value: vd.name }] });
      const hasPublic = vd.tiers.some((t) => t.startsWith("public"));
      const igwId = nid("igw");
      if (hasPublic) {
        igwsList.push({ InternetGatewayId: igwId, Attachments: [{ VpcId: vpcId, State: "available" }], Tags: [{ Key: "Name", Value: vd.name + "-igw" }] });
      }
      const natIds = [];
      if (hasPublic) {
        for (let a = 0; a < Math.min(vd.azsUsed, 2); a++) {
          const natId = nid("nat");
          natIds.push(natId);
          natsList.push({ NatGatewayId: natId, VpcId: vpcId, SubnetId: null, State: "available", Tags: [{ Key: "Name", Value: vd.name + "-nat-" + AZS[a].slice(-2) }] });
        }
      }
      const sgDefs = [
        "web-https",
        "web-http",
        "app-internal",
        "api-gateway",
        "db-mysql",
        "db-postgres",
        "db-redis",
        "monitoring-agents",
        "ssh-bastion",
        "alb-external",
        "alb-internal",
        "efs-mount",
        "elasticsearch",
        "memcached",
        "vpn-access",
        "mgmt-rdp"
      ];
      const sgCount = Math.min(sgDefs.length, vd.tiers.length * 2 + 4);
      for (let si = 0; si < sgCount; si++) {
        const sgName = sgDefs[si];
        const ports = {
          https: [443, 443],
          http: [80, 80],
          "app-internal": [8080, 8099],
          "api-gateway": [8443, 8443],
          "db-mysql": [3306, 3306],
          "db-postgres": [5432, 5432],
          "db-redis": [6379, 6379],
          "monitoring-agents": [9090, 9100],
          elasticsearch: [9200, 9300],
          memcached: [11211, 11211],
          "mgmt-rdp": [3389, 3389],
          "ssh-bastion": [22, 22]
        }[sgName] || [443, 443];
        sgs.push({
          GroupId: nid("sg"),
          GroupName: vd.name.toLowerCase() + "-" + sgName,
          VpcId: vpcId,
          IpPermissions: [
            { IpProtocol: "tcp", FromPort: ports[0], ToPort: ports[1], IpRanges: [{ CidrIp: sgName.includes("ssh") || sgName.includes("rdp") ? "10.0.0.0/8" : "0.0.0.0/0" }] },
            { IpProtocol: "tcp", FromPort: 22, ToPort: 22, IpRanges: [{ CidrIp: "10.0.0.0/8" }] }
          ],
          IpPermissionsEgress: [{ IpProtocol: "-1", IpRanges: [{ CidrIp: "0.0.0.0/0" }] }],
          Tags: [{ Key: "Name", Value: vd.name.toLowerCase() + "-" + sgName }]
        });
      }
      vd.tiers.forEach((tier, ti) => {
        const isPub = tier.startsWith("public");
        const rtId = nid("rtb");
        const routes = [{ DestinationCidrBlock: vd.cidr, GatewayId: "local" }];
        if (isPub) routes.push({ DestinationCidrBlock: "0.0.0.0/0", GatewayId: igwId });
        routes.push({ DestinationCidrBlock: "10.0.0.0/8", TransitGatewayId: "tgw-enterprise01" });
        const naclId = nid("acl");
        const naclAssocs = [];
        const naclEntries = [
          { RuleNumber: 100, Protocol: "6", RuleAction: "allow", Egress: false, CidrBlock: "0.0.0.0/0", PortRange: { From: 443, To: 443 } },
          { RuleNumber: 110, Protocol: "6", RuleAction: "allow", Egress: false, CidrBlock: "10.0.0.0/8", PortRange: { From: 0, To: 65535 } },
          { RuleNumber: 120, Protocol: "6", RuleAction: "allow", Egress: false, CidrBlock: "0.0.0.0/0", PortRange: { From: 1024, To: 65535 } }
        ];
        if (isPub) naclEntries.push({ RuleNumber: 130, Protocol: "6", RuleAction: "allow", Egress: false, CidrBlock: "0.0.0.0/0", PortRange: { From: 80, To: 80 } });
        naclEntries.push({ RuleNumber: 32767, Protocol: "-1", RuleAction: "deny", Egress: false, CidrBlock: "0.0.0.0/0" });
        const assocs = [];
        for (let a = 0; a < vd.azsUsed; a++) {
          const subId = nid("subnet");
          const oct2 = ti * 10 + subOct;
          subnets.push({
            SubnetId: subId,
            VpcId: vpcId,
            CidrBlock: vd.cidr.replace(/\.0\.0\//, "." + oct2 + "." + a + "/").replace(/\/16/, "/24"),
            AvailabilityZone: AZS[a],
            MapPublicIpOnLaunch: isPub,
            Tags: [{ Key: "Name", Value: vd.name.toLowerCase() + "-" + tier + "-" + AZS[a].slice(-2) }]
          });
          if (!isPub && natIds.length) {
            const azRtId = nid("rtb");
            rts.push({
              RouteTableId: azRtId,
              VpcId: vpcId,
              Routes: [
                { DestinationCidrBlock: vd.cidr, GatewayId: "local" },
                { DestinationCidrBlock: "0.0.0.0/0", NatGatewayId: natIds[Math.min(a, natIds.length - 1)] },
                { DestinationCidrBlock: "10.0.0.0/8", TransitGatewayId: "tgw-enterprise01" }
              ],
              Associations: [{ SubnetId: subId, RouteTableAssociationId: nid("rtbassoc") }],
              Tags: [{ Key: "Name", Value: vd.name.toLowerCase() + "-" + tier + "-" + AZS[a].slice(-2) + "-rt" }]
            });
          } else {
            assocs.push({ SubnetId: subId, RouteTableAssociationId: nid("rtbassoc") });
          }
          naclAssocs.push({ SubnetId: subId });
          if (isPub && a < natIds.length && natsList[natsList.length - vd.azsUsed + a + Math.min(a, natIds.length - 1)])
            natsList.forEach((n) => {
              if (n.NatGatewayId === natIds[a] && !n.SubnetId) n.SubnetId = subId;
            });
          const instCount = vd.instancesPer[ti] || 0;
          for (let ii = 0; ii < instCount; ii++) {
            const instId = nid("i");
            const iType = INST_TYPES[Math.floor(_random() * INST_TYPES.length)];
            const st = STATES[Math.floor(_random() * STATES.length)];
            const isBastionSlot = isPub && ii === 0 && a === 0 && vd.tiers.length > 2;
            const instName = isBastionSlot ? vd.name.toLowerCase() + "-bastion" : vd.name.toLowerCase() + "-" + tier.replace("private-", "") + "-" + String(ii + 1).padStart(2, "0");
            const _ec2Entry = {
              InstanceId: instId,
              SubnetId: subId,
              InstanceType: isBastionSlot ? "t3.micro" : iType,
              PrivateIpAddress: "10." + Math.floor(_random() * 255) + "." + Math.floor(_random() * 255) + "." + Math.floor(_random() * 254 + 1),
              Placement: { AvailabilityZone: AZS[a] },
              State: { Name: isBastionSlot ? "running" : st, Code: isBastionSlot ? 16 : st === "running" ? 16 : 80 },
              Tags: [{ Key: "Name", Value: instName }]
            };
            if (vi === 0) _ec2Entry.IamInstanceProfile = { Arn: "arn:aws:iam::111222333444:instance-profile/EC2InstanceRole", Id: "AIPA000000001" };
            ec2Instances.push(_ec2Entry);
            const volSize = [50, 100, 200, 500][Math.floor(_random() * 4)];
            volsList.push({
              VolumeId: nid("vol"),
              Size: volSize,
              State: "in-use",
              VolumeType: "gp3",
              AvailabilityZone: AZS[a],
              Attachments: [{ InstanceId: instId, Device: "/dev/sda1", State: "attached" }]
            });
            if (tier.includes("data") || tier.includes("cache") || tier.includes("warehouse") || tier.includes("ml")) {
              const dataSize = [200, 500, 1e3, 2e3][Math.floor(_random() * 4)];
              volsList.push({
                VolumeId: nid("vol"),
                Size: dataSize,
                State: "in-use",
                VolumeType: "io2",
                AvailabilityZone: AZS[a],
                Attachments: [{ InstanceId: instId, Device: "/dev/sdf", State: "attached" }]
              });
            }
            enisList.push({
              NetworkInterfaceId: nid("eni"),
              SubnetId: subId,
              VpcId: vpcId,
              InterfaceType: "interface",
              Status: "in-use",
              Attachment: { InstanceId: instId, Status: "attached" }
            });
            if (tier.includes("app") || tier.includes("proxy") || tier.includes("web")) {
              enisList.push({
                NetworkInterfaceId: nid("eni"),
                SubnetId: subId,
                VpcId: vpcId,
                InterfaceType: "interface",
                Status: "in-use",
                Attachment: { InstanceId: instId, Status: "attached" }
              });
            }
            if (_random() > 0.6) {
              snapsList.push({
                SnapshotId: nid("snap"),
                VolumeId: volsList[volsList.length - 1].VolumeId,
                State: "completed",
                VolumeSize: volSize,
                StartTime: "2025-01-15T00:00:00Z"
              });
            }
          }
        }
        if (isPub || !natIds.length) rts.push({
          RouteTableId: rtId,
          VpcId: vpcId,
          Routes: routes,
          Associations: assocs,
          Tags: [{ Key: "Name", Value: vd.name.toLowerCase() + "-" + tier + "-rt" }]
        });
        nacls.push({
          NetworkAclId: naclId,
          VpcId: vpcId,
          Associations: naclAssocs,
          Entries: naclEntries,
          Tags: [{ Key: "Name", Value: vd.name.toLowerCase() + "-" + tier + "-nacl" }]
        });
        subOct++;
      });
      for (let lb = 0; lb < vd.albCount; lb++) {
        const pubSubs = subnets.filter((s) => s.VpcId === vpcId && (s.Tags[0]?.Value || "").includes("public"));
        const prvSubs = subnets.filter((s) => s.VpcId === vpcId && !(s.Tags[0]?.Value || "").includes("public"));
        const lbSubs = pubSubs.length ? pubSubs : prvSubs;
        const scheme = pubSubs.length && lb === 0 ? "internet-facing" : "internal";
        const lbType = LB_TYPES[lb % 2];
        albsList.push({
          LoadBalancerArn: "arn:aws:elasticloadbalancing:us-east-1:111222333444:loadbalancer/" + lbType + "/" + vd.name.toLowerCase() + "-" + lbType.slice(0, 3) + "-" + lb + "/abc" + lb,
          LoadBalancerName: vd.name.toLowerCase() + "-" + lbType.slice(0, 3) + "-" + lb,
          Type: lbType,
          Scheme: scheme,
          VpcId: vpcId,
          AvailabilityZones: lbSubs.slice(0, vd.azsUsed).map((s) => ({ SubnetId: s.SubnetId, ZoneName: s.AvailabilityZone })),
          State: { Code: "active" },
          DNSName: vd.name.toLowerCase() + "-" + lb + ".us-east-1.elb.amazonaws.com"
        });
      }
      const epCount = Math.min(SVC_ENDPOINTS.length, vi < 3 ? 18 : vi < 6 ? 12 : 6 + vi);
      for (let e = 0; e < epCount; e++) {
        vpceList.push({
          VpcEndpointId: nid("vpce"),
          VpcId: vpcId,
          ServiceName: "com.amazonaws.us-east-1." + SVC_ENDPOINTS[e],
          VpcEndpointType: e < 2 ? "Gateway" : "Interface",
          State: "available",
          SubnetIds: subnets.filter((s) => s.VpcId === vpcId).slice(0, 2).map((s) => s.SubnetId),
          Tags: [{ Key: "Name", Value: vd.name.toLowerCase() + "-" + SVC_ENDPOINTS[e] }]
        });
      }
      const vpcSubnetIds = new Set(subnets.filter((s) => s.VpcId === vpcId).map((s) => s.SubnetId));
      const vpcInstances = ec2Instances.filter((i) => i.SubnetId && vpcSubnetIds.has(i.SubnetId));
      albsList.filter((a) => a.VpcId === vpcId).forEach((alb, li) => {
        const tgInsts = vpcInstances.slice(0, 3 + li);
        const tgType = alb.Type === "application" ? "instance" : "ip";
        tgsList.push({
          TargetGroupArn: "arn:aws:elasticloadbalancing:us-east-1:111222333444:targetgroup/" + vd.name.toLowerCase() + "-tg-" + li + "/abc" + li,
          TargetGroupName: vd.name.toLowerCase() + "-tg-" + li,
          Protocol: li % 2 === 0 ? "HTTPS" : "HTTP",
          Port: li % 2 === 0 ? 443 : 80,
          VpcId: vpcId,
          TargetType: tgType,
          HealthCheckProtocol: "HTTP",
          HealthCheckPort: "traffic-port",
          HealthCheckPath: "/health",
          HealthCheckIntervalSeconds: 30,
          HealthyThresholdCount: 3,
          UnhealthyThresholdCount: 3,
          LoadBalancerArns: [alb.LoadBalancerArn],
          Targets: tgInsts.map((i) => ({ Id: i.InstanceId, Port: li % 2 === 0 ? 443 : 80 }))
        });
      });
    });
    const peerings = [];
    const sharedIdx = 4;
    vpcs.forEach((v, i) => {
      if (i === sharedIdx) return;
      peerings.push({
        VpcPeeringConnectionId: nid("pcx"),
        Status: { Code: "active" },
        RequesterVpcInfo: { VpcId: vpcs[sharedIdx].VpcId, CidrBlock: vpcs[sharedIdx].CidrBlock },
        AccepterVpcInfo: { VpcId: v.VpcId, CidrBlock: v.CidrBlock },
        Tags: [{ Key: "Name", Value: "shared-to-" + v.Tags[0].Value.toLowerCase() }]
      });
    });
    [
      { r: 0, a: 1, n: "prod-to-staging" },
      { r: 0, a: 7, n: "prod-to-dr" },
      { r: 5, a: 11, n: "data-to-pci" },
      { r: 6, a: 9, n: "security-to-mgmt" },
      { r: 0, a: 8, n: "prod-to-edge" }
    ].forEach((p) => {
      if (vpcs[p.r] && vpcs[p.a]) peerings.push({
        VpcPeeringConnectionId: nid("pcx"),
        Status: { Code: "active" },
        RequesterVpcInfo: { VpcId: vpcs[p.r].VpcId, CidrBlock: vpcs[p.r].CidrBlock },
        AccepterVpcInfo: { VpcId: vpcs[p.a].VpcId, CidrBlock: vpcs[p.a].CidrBlock },
        Tags: [{ Key: "Name", Value: p.n }]
      });
    });
    const vpnConns = [
      { VpnConnectionId: nid("vpn"), State: "available", VpnGatewayId: "vgw-onprem01", CustomerGatewayId: "cgw-dc01", Tags: [{ Key: "Name", Value: "datacenter-east-primary" }] },
      { VpnConnectionId: nid("vpn"), State: "available", VpnGatewayId: "vgw-onprem01", CustomerGatewayId: "cgw-dc02", Tags: [{ Key: "Name", Value: "datacenter-east-backup" }] },
      { VpnConnectionId: nid("vpn"), State: "available", VpnGatewayId: "vgw-onprem02", CustomerGatewayId: "cgw-dc03", Tags: [{ Key: "Name", Value: "datacenter-west-primary" }] },
      { VpnConnectionId: nid("vpn"), State: "available", VpnGatewayId: "vgw-onprem02", CustomerGatewayId: "cgw-dc04", Tags: [{ Key: "Name", Value: "datacenter-west-backup" }] }
    ];
    const s3Buckets = [];
    [
      "prod-assets",
      "prod-logs",
      "prod-backups",
      "prod-media",
      "prod-static",
      "prod-config",
      "staging-deploy",
      "staging-logs",
      "staging-assets",
      "dev-artifacts",
      "dev-sandbox",
      "dev-test-data",
      "shared-terraform-state",
      "shared-ami-store",
      "shared-lambda-layers",
      "shared-container-images",
      "data-lake-raw",
      "data-lake-processed",
      "data-lake-curated",
      "data-lake-archive",
      "data-lake-temp",
      "ml-training-data",
      "ml-models",
      "ml-experiments",
      "audit-logs",
      "config-history",
      "cloudtrail-logs",
      "vpc-flow-logs",
      "dns-query-logs",
      "dr-backup-primary",
      "dr-backup-secondary",
      "dr-config-mirror",
      "pci-audit-trail",
      "pci-transaction-logs",
      "pci-encryption-keys",
      "app-uploads",
      "static-frontend",
      "lambda-packages",
      "cloudformation-templates",
      "codepipeline-artifacts"
    ].forEach((n) => {
      s3Buckets.push({ Name: n + "-" + Math.floor(_random() * 99999), CreationDate: "2024-" + String(Math.floor(_random() * 12) + 1).padStart(2, "0") + "-15" });
    });
    const zones = [
      { Id: "/hostedzone/Z001", Name: "example.com.", Config: { PrivateZone: false }, ResourceRecordSetCount: 187 },
      { Id: "/hostedzone/Z002", Name: "internal.example.com.", Config: { PrivateZone: true }, ResourceRecordSetCount: 342, VPCs: [{ VPCId: "vpc-production" }, { VPCId: "vpc-dataplatform" }, { VPCId: "vpc-management" }] },
      { Id: "/hostedzone/Z003", Name: "staging.example.com.", Config: { PrivateZone: false }, ResourceRecordSetCount: 64 },
      { Id: "/hostedzone/Z004", Name: "api.example.com.", Config: { PrivateZone: false }, ResourceRecordSetCount: 96 },
      { Id: "/hostedzone/Z005", Name: "dev.example.com.", Config: { PrivateZone: false }, ResourceRecordSetCount: 78 },
      { Id: "/hostedzone/Z006", Name: "data.internal.example.com.", Config: { PrivateZone: true }, ResourceRecordSetCount: 124, VPCs: [{ VPCId: "vpc-dataplatform" }] },
      { Id: "/hostedzone/Z007", Name: "pci.example.com.", Config: { PrivateZone: true }, ResourceRecordSetCount: 45, VPCs: [{ VPCId: "vpc-pcicompliant" }, { VPCId: "vpc-security" }] },
      { Id: "/hostedzone/Z008", Name: "dr.example.com.", Config: { PrivateZone: false }, ResourceRecordSetCount: 52 }
    ];
    const r53records = [];
    zones.forEach((z) => {
      const zid = z.Id.replace("/hostedzone/", "");
      const base = z.Name;
      r53records.push({ HostedZoneId: zid, Name: base, Type: "NS", TTL: 172800, ResourceRecords: [{ Value: "ns-1.awsdns-01.org." }, { Value: "ns-2.awsdns-02.co.uk." }] });
      r53records.push({ HostedZoneId: zid, Name: base, Type: "SOA", TTL: 900, ResourceRecords: [{ Value: "ns-1.awsdns-01.org. awsdns-hostmaster.amazon.com. 1 7200 900 1209600 86400" }] });
      r53records.push({ HostedZoneId: zid, Name: "www." + base, Type: "A", AliasTarget: { DNSName: "dualstack.elb-prod-123456.us-east-1.elb.amazonaws.com.", HostedZoneId: "Z35SXDOTRQ7X7K", EvaluateTargetHealth: true } });
      r53records.push({ HostedZoneId: zid, Name: "api." + base, Type: "CNAME", TTL: 300, ResourceRecords: [{ Value: "api-gateway.execute-api.us-east-1.amazonaws.com" }] });
      r53records.push({ HostedZoneId: zid, Name: "mail." + base, Type: "MX", TTL: 300, ResourceRecords: [{ Value: "10 inbound-smtp.us-east-1.amazonaws.com" }] });
      r53records.push({ HostedZoneId: zid, Name: "_dmarc." + base, Type: "TXT", TTL: 300, ResourceRecords: [{ Value: '"v=DMARC1; p=quarantine; rua=mailto:dmarc@' + base + '"' }] });
    });
    const wafAcls = [];
    const internetFacingAlbs = albsList.filter((a) => a.Scheme === "internet-facing");
    if (internetFacingAlbs.length > 0) {
      wafAcls.push({
        Name: "prod-web-acl",
        Id: "waf-001",
        ARN: "arn:aws:wafv2:us-east-1:111222333444:regional/webacl/prod-web-acl/abc1",
        Description: "Production WAF - OWASP rules",
        DefaultAction: { Allow: {} },
        Rules: [{ Name: "AWSManagedRulesCommonRuleSet", Priority: 1 }, { Name: "AWSManagedRulesSQLiRuleSet", Priority: 2 }, { Name: "RateLimit-1000", Priority: 3 }],
        ResourceArns: internetFacingAlbs.slice(0, 2).map((a) => a.LoadBalancerArn)
      });
    }
    if (internetFacingAlbs.length > 2) {
      wafAcls.push({
        Name: "staging-web-acl",
        Id: "waf-002",
        ARN: "arn:aws:wafv2:us-east-1:111222333444:regional/webacl/staging-web-acl/abc2",
        Description: "Staging WAF - basic protection",
        DefaultAction: { Allow: {} },
        Rules: [{ Name: "AWSManagedRulesCommonRuleSet", Priority: 1 }],
        ResourceArns: internetFacingAlbs.slice(2, 4).map((a) => a.LoadBalancerArn)
      });
    }
    wafAcls.push({
      Name: "pci-web-acl",
      Id: "waf-003",
      ARN: "arn:aws:wafv2:us-east-1:111222333444:regional/webacl/pci-web-acl/abc3",
      Description: "PCI DSS compliant WAF",
      DefaultAction: { Block: {} },
      Rules: [{ Name: "AWSManagedRulesCommonRuleSet", Priority: 1 }, { Name: "AWSManagedRulesSQLiRuleSet", Priority: 2 }, { Name: "AWSManagedRulesKnownBadInputsRuleSet", Priority: 3 }, { Name: "AWSManagedRulesLinuxRuleSet", Priority: 4 }],
      ResourceArns: []
    });
    const rdsInstances = [];
    const rdsConfigs = [
      { vpc: 0, name: "prod-primary-db", engine: "aurora-mysql", cls: "db.r6g.xlarge", multi: true, storage: 500 },
      { vpc: 0, name: "prod-replica-db", engine: "aurora-mysql", cls: "db.r6g.large", multi: false, storage: 500 },
      { vpc: 1, name: "staging-db", engine: "postgres", cls: "db.t3.medium", multi: false, storage: 100 },
      { vpc: 3, name: "data-warehouse-db", engine: "aurora-postgresql", cls: "db.r6g.2xlarge", multi: true, storage: 2e3 },
      { vpc: 6, name: "pci-db", engine: "mysql", cls: "db.r6g.large", multi: true, storage: 200 }
    ];
    rdsConfigs.forEach((rc, ri) => {
      const vpcId = vpcs[rc.vpc]?.VpcId;
      if (!vpcId) return;
      const prvSubs = subnets.filter((s) => s.VpcId === vpcId && !(s.Tags[0]?.Value || "").includes("public"));
      const sub = prvSubs[ri % Math.max(prvSubs.length, 1)];
      rdsInstances.push({
        DBInstanceIdentifier: rc.name,
        DBInstanceClass: rc.cls,
        Engine: rc.engine,
        DBInstanceStatus: "available",
        MultiAZ: rc.multi,
        AllocatedStorage: rc.storage,
        Endpoint: { Address: rc.name + ".cluster-abc.us-east-1.rds.amazonaws.com", Port: rc.engine.includes("postgres") ? 5432 : 3306 },
        DBSubnetGroup: {
          VpcId: vpcId,
          DBSubnetGroupName: rc.name + "-subnet-group",
          Subnets: prvSubs.slice(0, 3).map((s) => ({ SubnetIdentifier: s.SubnetId, SubnetAvailabilityZone: { Name: s.AvailabilityZone } }))
        },
        VpcSecurityGroups: sgs.filter((sg) => sg.VpcId === vpcId).slice(0, 1).map((sg) => ({ VpcSecurityGroupId: sg.GroupId, Status: "active" })),
        StorageEncrypted: true,
        AvailabilityZone: sub?.AvailabilityZone || "us-east-1a"
      });
    });
    const ecsServices = [];
    const ecsConfigs = [
      { vpc: 0, name: "prod-api", cluster: "prod-cluster", tasks: 4, cpu: "512", mem: "1024" },
      { vpc: 0, name: "prod-worker", cluster: "prod-cluster", tasks: 2, cpu: "1024", mem: "2048" },
      { vpc: 1, name: "staging-api", cluster: "staging-cluster", tasks: 2, cpu: "256", mem: "512" },
      { vpc: 3, name: "data-pipeline", cluster: "data-cluster", tasks: 3, cpu: "2048", mem: "4096" }
    ];
    ecsConfigs.forEach((ec) => {
      const vpcId = vpcs[ec.vpc]?.VpcId;
      if (!vpcId) return;
      const prvSubs = subnets.filter((s) => s.VpcId === vpcId && !(s.Tags[0]?.Value || "").includes("public"));
      ecsServices.push({
        serviceName: ec.name,
        clusterArn: "arn:aws:ecs:us-east-1:111222333444:cluster/" + ec.cluster,
        taskRoleArn: "arn:aws:iam::111222333444:role/ECSTaskRole",
        status: "ACTIVE",
        desiredCount: ec.tasks,
        runningCount: ec.tasks,
        launchType: "FARGATE",
        networkConfiguration: { awsvpcConfiguration: {
          subnets: prvSubs.slice(0, 2).map((s) => s.SubnetId),
          securityGroups: sgs.filter((sg) => sg.VpcId === vpcId).slice(0, 1).map((sg) => sg.GroupId),
          assignPublicIp: "DISABLED"
        } },
        taskDefinition: "arn:aws:ecs:us-east-1:111222333444:task-definition/" + ec.name + ":12",
        cpu: ec.cpu,
        memory: ec.mem
      });
    });
    const lambdaFunctions = [];
    const lambdaConfigs = [
      { vpc: 0, name: "prod-auth-handler", runtime: "nodejs20.x", mem: 256, timeout: 30 },
      { vpc: 0, name: "prod-image-processor", runtime: "python3.12", mem: 1024, timeout: 300 },
      { vpc: 3, name: "data-etl-trigger", runtime: "python3.12", mem: 512, timeout: 900 },
      { vpc: 4, name: "shared-log-shipper", runtime: "nodejs20.x", mem: 128, timeout: 60 }
    ];
    lambdaConfigs.forEach((lc) => {
      const vpcId = vpcs[lc.vpc]?.VpcId;
      if (!vpcId) return;
      const prvSubs = subnets.filter((s) => s.VpcId === vpcId && !(s.Tags[0]?.Value || "").includes("public"));
      lambdaFunctions.push({
        FunctionName: lc.name,
        Runtime: lc.runtime,
        MemorySize: lc.mem,
        Timeout: lc.timeout,
        FunctionArn: "arn:aws:lambda:us-east-1:111222333444:function:" + lc.name,
        Role: "arn:aws:iam::111222333444:role/LambdaExecutionRole",
        State: "Active",
        LastModified: "2025-01-20T00:00:00Z",
        VpcConfig: {
          VpcId: vpcId,
          SubnetIds: prvSubs.slice(0, 2).map((s) => s.SubnetId),
          SecurityGroupIds: sgs.filter((sg) => sg.VpcId === vpcId).slice(0, 1).map((sg) => sg.GroupId)
        }
      });
    });
    const ecacheClusters = [];
    const ecConfigs = [
      { vpc: 0, name: "prod-redis", engine: "redis", type: "cache.r6g.large", nodes: 3 },
      { vpc: 1, name: "staging-redis", engine: "redis", type: "cache.t3.micro", nodes: 1 },
      { vpc: 3, name: "data-redis", engine: "redis", type: "cache.r6g.xlarge", nodes: 2 }
    ];
    ecConfigs.forEach((ec) => {
      const vpcId = vpcs[ec.vpc]?.VpcId;
      if (!vpcId) return;
      ecacheClusters.push({
        CacheClusterId: ec.name,
        Engine: ec.engine,
        CacheNodeType: ec.type,
        CacheClusterStatus: "available",
        NumCacheNodes: ec.nodes,
        CacheSubnetGroupName: ec.name + "-subnet-group",
        VpcId: vpcId,
        CacheNodes: Array.from({ length: ec.nodes }, (_, i) => ({
          CacheNodeId: "000" + (i + 1),
          CacheNodeStatus: "available",
          Endpoint: { Address: ec.name + ".abc.0001.use1.cache.amazonaws.com", Port: 6379 }
        })),
        SecurityGroups: sgs.filter((sg) => sg.VpcId === vpcId).slice(0, 1).map((sg) => ({ SecurityGroupId: sg.GroupId, Status: "active" }))
      });
    });
    const redshiftClusters = [];
    if (vpcs[3]) {
      const vpcId = vpcs[3].VpcId;
      const prvSubs = subnets.filter((s) => s.VpcId === vpcId && !(s.Tags[0]?.Value || "").includes("public"));
      redshiftClusters.push({
        ClusterIdentifier: "data-analytics-cluster",
        NodeType: "ra3.xlplus",
        ClusterStatus: "available",
        NumberOfNodes: 4,
        DBName: "analytics",
        Endpoint: { Address: "data-analytics-cluster.abc.us-east-1.redshift.amazonaws.com", Port: 5439 },
        VpcId: vpcId,
        ClusterSubnetGroupName: "data-redshift-subnet-group",
        VpcSecurityGroups: sgs.filter((sg) => sg.VpcId === vpcId).slice(0, 1).map((sg) => ({ VpcSecurityGroupId: sg.GroupId, Status: "active" })),
        Encrypted: true,
        ClusterNodes: Array.from({ length: 4 }, (_, i) => ({ NodeRole: i === 0 ? "LEADER" : "COMPUTE" }))
      });
    }
    const tgwAttachments = [];
    vpcs.forEach((vpc) => {
      const hasRoute = rts.some((rt) => rt.VpcId === vpc.VpcId && (rt.Routes || []).some((r) => r.TransitGatewayId));
      if (hasRoute) {
        tgwAttachments.push({
          TransitGatewayAttachmentId: nid("tgw-attach"),
          TransitGatewayId: "tgw-enterprise01",
          ResourceId: vpc.VpcId,
          ResourceType: "vpc",
          State: "available",
          Association: { TransitGatewayRouteTableId: "tgw-rtb-main", State: "associated" }
        });
      }
    });
    const cfDistributions = [];
    const cfAlbs = albsList.filter((a) => a.Scheme === "internet-facing").slice(0, 2);
    cfAlbs.forEach((alb, ci) => {
      cfDistributions.push({
        Id: "E" + String(ci + 1).padStart(13, "0"),
        DomainName: "d" + String(ci + 1).padStart(13, "0") + ".cloudfront.net",
        Status: "Deployed",
        Enabled: true,
        Origins: { Items: [{
          DomainName: alb.DNSName,
          Id: "ALB-" + alb.LoadBalancerName,
          CustomOriginConfig: { HTTPPort: 80, HTTPSPort: 443, OriginProtocolPolicy: "https-only" }
        }] },
        DefaultCacheBehavior: { ViewerProtocolPolicy: "redirect-to-https", Compress: true },
        ViewerCertificate: { ACMCertificateArn: "arn:aws:acm:us-east-1:111222333444:certificate/abc-" + ci },
        Aliases: { Items: ci === 0 ? ["www.example.com", "api.example.com"] : ["staging.example.com"] },
        WebACLId: wafAcls.length > ci ? wafAcls[ci].ARN : ""
      });
    });
    if (s3Buckets.length > 0) {
      cfDistributions.push({
        Id: "E0000000000003",
        DomainName: "d0000000000003.cloudfront.net",
        Status: "Deployed",
        Enabled: true,
        Origins: { Items: [{
          DomainName: s3Buckets[4].Name + ".s3.amazonaws.com",
          Id: "S3-" + s3Buckets[4].Name,
          S3OriginConfig: { OriginAccessIdentity: "origin-access-identity/cloudfront/EOAI123" }
        }] },
        DefaultCacheBehavior: { ViewerProtocolPolicy: "redirect-to-https", Compress: true },
        Aliases: { Items: ["static.example.com"] }
      });
    }
    const iamRoles = [
      {
        RoleName: "EC2InstanceRole",
        Arn: "arn:aws:iam::111222333444:role/EC2InstanceRole",
        CreateDate: "2024-01-15T00:00:00Z",
        AssumeRolePolicyDocument: { Version: "2012-10-17", Statement: [{ Effect: "Allow", Principal: { Service: "ec2.amazonaws.com" }, Action: "sts:AssumeRole" }] },
        RolePolicyList: [{ PolicyName: "EC2InlinePolicy", PolicyDocument: { Version: "2012-10-17", Statement: [
          { Effect: "Allow", Action: ["s3:GetObject", "s3:PutObject"], Resource: "arn:aws:s3:::prod-app-data/*" },
          { Effect: "Allow", Action: ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"], Resource: "arn:aws:logs:*:111222333444:*" }
        ] } }],
        AttachedManagedPolicies: [{ PolicyArn: "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore", PolicyName: "AmazonSSMManagedInstanceCore" }],
        RoleLastUsed: { LastUsedDate: (/* @__PURE__ */ new Date()).toISOString() }
      },
      {
        RoleName: "LambdaExecutionRole",
        Arn: "arn:aws:iam::111222333444:role/LambdaExecutionRole",
        CreateDate: "2024-02-01T00:00:00Z",
        AssumeRolePolicyDocument: { Version: "2012-10-17", Statement: [{ Effect: "Allow", Principal: { Service: "lambda.amazonaws.com" }, Action: "sts:AssumeRole" }] },
        RolePolicyList: [{ PolicyName: "LambdaInlinePolicy", PolicyDocument: { Version: "2012-10-17", Statement: [
          { Effect: "Allow", Action: ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"], Resource: "arn:aws:logs:*:111222333444:*" },
          { Effect: "Allow", Action: ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:Query", "dynamodb:UpdateItem", "dynamodb:DeleteItem"], Resource: "arn:aws:dynamodb:us-east-1:111222333444:table/prod-*" }
        ] } }],
        AttachedManagedPolicies: [],
        RoleLastUsed: { LastUsedDate: (/* @__PURE__ */ new Date()).toISOString() }
      },
      {
        RoleName: "ECSTaskRole",
        Arn: "arn:aws:iam::111222333444:role/ECSTaskRole",
        CreateDate: "2024-03-10T00:00:00Z",
        AssumeRolePolicyDocument: { Version: "2012-10-17", Statement: [{ Effect: "Allow", Principal: { Service: "ecs-tasks.amazonaws.com" }, Action: "sts:AssumeRole" }] },
        RolePolicyList: [{ PolicyName: "ECSInlinePolicy", PolicyDocument: { Version: "2012-10-17", Statement: [
          { Effect: "Allow", Action: ["ecr:GetDownloadUrlForLayer", "ecr:BatchGetImage", "ecr:GetAuthorizationToken"], Resource: "*" },
          { Effect: "Allow", Action: ["s3:GetObject", "s3:ListBucket"], Resource: ["arn:aws:s3:::prod-assets", "arn:aws:s3:::prod-assets/*"] },
          { Effect: "Allow", Action: ["sqs:SendMessage", "sqs:ReceiveMessage", "sqs:DeleteMessage"], Resource: "arn:aws:sqs:us-east-1:111222333444:prod-*" }
        ] } }],
        AttachedManagedPolicies: [],
        RoleLastUsed: { LastUsedDate: (/* @__PURE__ */ new Date()).toISOString() }
      },
      {
        RoleName: "AdminRole",
        Arn: "arn:aws:iam::111222333444:role/AdminRole",
        CreateDate: "2023-06-01T00:00:00Z",
        AssumeRolePolicyDocument: { Version: "2012-10-17", Statement: [{ Effect: "Allow", Principal: { AWS: "arn:aws:iam::111222333444:root" }, Action: "sts:AssumeRole" }] },
        RolePolicyList: [],
        AttachedManagedPolicies: [{ PolicyArn: "arn:aws:iam::aws:policy/AdministratorAccess", PolicyName: "AdministratorAccess" }],
        RoleLastUsed: { LastUsedDate: new Date(Date.now() - 864e5).toISOString() }
      },
      {
        RoleName: "ReadOnlyRole",
        Arn: "arn:aws:iam::111222333444:role/ReadOnlyRole",
        CreateDate: "2024-04-15T00:00:00Z",
        AssumeRolePolicyDocument: { Version: "2012-10-17", Statement: [{ Effect: "Allow", Principal: { AWS: "arn:aws:iam::111222333444:root" }, Action: "sts:AssumeRole" }] },
        RolePolicyList: [{ PolicyName: "ReadOnlyInline", PolicyDocument: { Version: "2012-10-17", Statement: [
          { Effect: "Allow", Action: ["ec2:Describe*", "s3:Get*", "s3:List*", "rds:Describe*", "lambda:List*", "lambda:Get*", "ecs:Describe*", "ecs:List*", "iam:Get*", "iam:List*", "cloudwatch:Get*", "cloudwatch:List*", "logs:Describe*", "logs:Get*"], Resource: "*" }
        ] } }],
        AttachedManagedPolicies: [],
        RoleLastUsed: { LastUsedDate: (/* @__PURE__ */ new Date()).toISOString() }
      },
      {
        RoleName: "DeployRole",
        Arn: "arn:aws:iam::111222333444:role/DeployRole",
        CreateDate: "2024-05-20T00:00:00Z",
        AssumeRolePolicyDocument: { Version: "2012-10-17", Statement: [{ Effect: "Allow", Principal: { AWS: "arn:aws:iam::111222333444:root" }, Action: "sts:AssumeRole", Condition: { Bool: { "aws:MultiFactorAuthPresent": "true" } } }] },
        PermissionsBoundary: { PermissionsBoundaryType: "Policy", PermissionsBoundaryArn: "arn:aws:iam::111222333444:policy/DeployBoundary" },
        RolePolicyList: [{ PolicyName: "DeployInline", PolicyDocument: { Version: "2012-10-17", Statement: [
          { Effect: "Allow", Action: ["codedeploy:*", "s3:GetObject", "s3:PutObject", "s3:ListBucket"], Resource: "*" },
          { Effect: "Allow", Action: ["ec2:DescribeInstances", "ec2:DescribeInstanceStatus"], Resource: "*" }
        ] } }],
        AttachedManagedPolicies: [],
        RoleLastUsed: { LastUsedDate: (/* @__PURE__ */ new Date()).toISOString() }
      },
      {
        RoleName: "CrossAccountRole",
        Arn: "arn:aws:iam::111222333444:role/CrossAccountRole",
        CreateDate: "2024-06-01T00:00:00Z",
        AssumeRolePolicyDocument: { Version: "2012-10-17", Statement: [{ Effect: "Allow", Principal: { AWS: "arn:aws:iam::555666777888:root" }, Action: "sts:AssumeRole" }] },
        RolePolicyList: [{ PolicyName: "CrossAccountPolicy", PolicyDocument: { Version: "2012-10-17", Statement: [
          { Effect: "Allow", Action: ["s3:GetObject", "s3:ListBucket"], Resource: ["arn:aws:s3:::shared-data", "arn:aws:s3:::shared-data/*"] }
        ] } }],
        AttachedManagedPolicies: [],
        RoleLastUsed: { LastUsedDate: new Date(Date.now() - 7776e6).toISOString() }
      },
      {
        RoleName: "DataAnalystRole",
        Arn: "arn:aws:iam::111222333444:role/DataAnalystRole",
        CreateDate: "2024-07-01T00:00:00Z",
        AssumeRolePolicyDocument: { Version: "2012-10-17", Statement: [{ Effect: "Allow", Principal: { AWS: "arn:aws:iam::111222333444:root" }, Action: "sts:AssumeRole" }] },
        RolePolicyList: [{ PolicyName: "DataAnalystInline", PolicyDocument: { Version: "2012-10-17", Statement: [
          { Effect: "Allow", Action: "s3:*", Resource: "*" },
          { Effect: "Allow", Action: "redshift:*", Resource: "*" }
        ] } }],
        AttachedManagedPolicies: [],
        RoleLastUsed: { LastUsedDate: (/* @__PURE__ */ new Date()).toISOString() }
      },
      {
        RoleName: "AWSServiceRoleForECS",
        Arn: "arn:aws:iam::111222333444:role/aws-service-role/ecs.amazonaws.com/AWSServiceRoleForECS",
        CreateDate: "2023-01-01T00:00:00Z",
        Path: "/aws-service-role/ecs.amazonaws.com/",
        AssumeRolePolicyDocument: { Version: "2012-10-17", Statement: [{ Effect: "Allow", Principal: { Service: "ecs.amazonaws.com" }, Action: "sts:AssumeRole" }] },
        RolePolicyList: [],
        AttachedManagedPolicies: [{ PolicyArn: "arn:aws:iam::aws:policy/aws-service-role/AmazonECSServiceRolePolicy", PolicyName: "AmazonECSServiceRolePolicy" }],
        RoleLastUsed: { LastUsedDate: (/* @__PURE__ */ new Date()).toISOString() }
      },
      {
        RoleName: "SecurityAuditRole",
        Arn: "arn:aws:iam::111222333444:role/SecurityAuditRole",
        CreateDate: "2024-08-01T00:00:00Z",
        AssumeRolePolicyDocument: { Version: "2012-10-17", Statement: [{ Effect: "Allow", Principal: { AWS: "arn:aws:iam::111222333444:root" }, Action: "sts:AssumeRole" }] },
        RolePolicyList: [],
        AttachedManagedPolicies: [
          { PolicyArn: "arn:aws:iam::aws:policy/SecurityAudit", PolicyName: "SecurityAudit" },
          { PolicyArn: "arn:aws:iam::aws:policy/ReadOnlyAccess", PolicyName: "ReadOnlyAccess" }
        ],
        RoleLastUsed: { LastUsedDate: (/* @__PURE__ */ new Date()).toISOString() }
      }
    ];
    const iamUsers = [
      {
        UserName: "admin-user",
        Arn: "arn:aws:iam::111222333444:user/admin-user",
        CreateDate: "2023-01-15T00:00:00Z",
        MFADevices: [{ SerialNumber: "arn:aws:iam::111222333444:mfa/admin-user" }],
        UserPolicyList: [],
        AttachedManagedPolicies: [{ PolicyArn: "arn:aws:iam::aws:policy/AdministratorAccess", PolicyName: "AdministratorAccess" }]
      },
      {
        UserName: "dev-user",
        Arn: "arn:aws:iam::111222333444:user/dev-user",
        CreateDate: "2024-03-01T00:00:00Z",
        MFADevices: [],
        UserPolicyList: [{ PolicyName: "DevInlinePolicy", PolicyDocument: { Version: "2012-10-17", Statement: [
          { Effect: "Allow", Action: "ec2:*", Resource: "*" },
          { Effect: "Allow", Action: "s3:GetObject", Resource: "arn:aws:s3:::dev-*/*" }
        ] } }],
        AttachedManagedPolicies: []
      },
      {
        UserName: "ci-bot",
        Arn: "arn:aws:iam::111222333444:user/ci-bot",
        CreateDate: "2024-05-01T00:00:00Z",
        MFADevices: [],
        UserPolicyList: [{ PolicyName: "CIBotPolicy", PolicyDocument: { Version: "2012-10-17", Statement: [
          { Effect: "Allow", Action: ["codedeploy:CreateDeployment", "codedeploy:GetDeployment", "codedeploy:RegisterApplicationRevision"], Resource: "*" },
          { Effect: "Allow", Action: ["s3:GetObject", "s3:PutObject"], Resource: "arn:aws:s3:::ci-artifacts/*" }
        ] } }],
        AttachedManagedPolicies: []
      },
      {
        UserName: "readonly-user",
        Arn: "arn:aws:iam::111222333444:user/readonly-user",
        CreateDate: "2024-06-01T00:00:00Z",
        MFADevices: [{ SerialNumber: "arn:aws:iam::111222333444:mfa/readonly-user" }],
        UserPolicyList: [],
        AttachedManagedPolicies: [{ PolicyArn: "arn:aws:iam::aws:policy/ReadOnlyAccess", PolicyName: "ReadOnlyAccess" }]
      }
    ];
    const iamPolicies = [
      {
        PolicyName: "AdministratorAccess",
        Arn: "arn:aws:iam::aws:policy/AdministratorAccess",
        PolicyVersionList: [{ Document: JSON.stringify({ Version: "2012-10-17", Statement: [{ Effect: "Allow", Action: "*", Resource: "*" }] }), IsDefaultVersion: true }]
      },
      {
        PolicyName: "ReadOnlyAccess",
        Arn: "arn:aws:iam::aws:policy/ReadOnlyAccess",
        PolicyVersionList: [{ Document: JSON.stringify({ Version: "2012-10-17", Statement: [{ Effect: "Allow", Action: ["ec2:Describe*", "s3:Get*", "s3:List*", "rds:Describe*", "lambda:List*", "lambda:Get*", "ecs:Describe*", "ecs:List*", "iam:Get*", "iam:List*", "cloudwatch:Get*", "cloudwatch:List*", "logs:Describe*", "logs:Get*"], Resource: "*" }] }), IsDefaultVersion: true }]
      },
      {
        PolicyName: "AmazonSSMManagedInstanceCore",
        Arn: "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore",
        PolicyVersionList: [{ Document: JSON.stringify({ Version: "2012-10-17", Statement: [
          { Effect: "Allow", Action: ["ssm:UpdateInstanceInformation", "ssmmessages:CreateControlChannel", "ssmmessages:CreateDataChannel", "ssmmessages:OpenControlChannel", "ssmmessages:OpenDataChannel", "ec2messages:GetMessages"], Resource: "*" }
        ] }), IsDefaultVersion: true }]
      },
      {
        PolicyName: "SecurityAudit",
        Arn: "arn:aws:iam::aws:policy/SecurityAudit",
        PolicyVersionList: [{ Document: JSON.stringify({ Version: "2012-10-17", Statement: [
          { Effect: "Allow", Action: ["access-analyzer:Get*", "access-analyzer:List*", "config:Describe*", "config:Get*", "config:List*", "guardduty:Get*", "guardduty:List*", "inspector:Describe*", "inspector:Get*", "inspector:List*", "iam:Get*", "iam:List*", "iam:GenerateCredentialReport", "cloudtrail:Describe*", "cloudtrail:Get*", "cloudtrail:LookupEvents"], Resource: "*" }
        ] }), IsDefaultVersion: true }]
      }
    ];
    return {
      vpcs: { Vpcs: vpcs },
      subnets: { Subnets: subnets },
      rts: { RouteTables: rts },
      sgs: { SecurityGroups: sgs },
      nacls: { NetworkAcls: nacls },
      igws: { InternetGateways: igwsList },
      nats: { NatGateways: natsList },
      ec2: { Reservations: [{ Instances: ec2Instances }] },
      albs: { LoadBalancers: albsList },
      vpces: { VpcEndpoints: vpceList },
      peer: { VpcPeeringConnections: peerings },
      vpn: { VpnConnections: vpnConns },
      vols: { Volumes: volsList },
      snaps: { Snapshots: snapsList },
      s3: { Buckets: s3Buckets },
      r53: { HostedZones: zones },
      r53records: { ResourceRecordSets: r53records },
      tgs: { TargetGroups: tgsList },
      enis: { NetworkInterfaces: enisList },
      waf: { WebACLs: wafAcls },
      rds: { DBInstances: rdsInstances },
      ecs: { services: ecsServices },
      lambda: { Functions: lambdaFunctions },
      elasticache: { CacheClusters: ecacheClusters },
      redshift: { Clusters: redshiftClusters },
      tgwatt: { TransitGatewayAttachments: tgwAttachments },
      cf: { DistributionList: { Items: cfDistributions } },
      iam: { RoleDetailList: iamRoles, UserDetailList: iamUsers, Policies: iamPolicies }
    };
  }

  // src/modules/cidr-engine.js
  var ipToInt = (ip) => {
    if (!ip || typeof ip !== "string") return null;
    const parts = ip.split(".");
    if (parts.length !== 4) return null;
    let n = 0;
    for (let i = 0; i < 4; i++) {
      const o = parseInt(parts[i], 10);
      if (isNaN(o) || o < 0 || o > 255 || parts[i] !== String(o)) return null;
      n = n * 256 + o;
    }
    return n >>> 0;
  };
  var intToIp = (n) => {
    n = n >>> 0;
    return `${n >>> 24 & 255}.${n >>> 16 & 255}.${n >>> 8 & 255}.${n & 255}`;
  };
  var parseCIDR = (cidr) => {
    if (!cidr || typeof cidr !== "string") return null;
    const parts = cidr.trim().split("/");
    if (parts.length !== 2) return null;
    const network = ipToInt(parts[0]);
    const prefix = parseInt(parts[1], 10);
    if (network === null || isNaN(prefix) || prefix < 0 || prefix > 32 || parts[1] !== String(prefix)) return null;
    const mask = prefix === 0 ? 0 : 4294967295 << 32 - prefix >>> 0;
    if ((network & mask) !== network) return null;
    const size = prefix === 32 ? 1 : 1 << 32 - prefix >>> 0;
    return { network, prefix, mask, size };
  };
  var cidrToString = (network, prefix) => `${intToIp(network)}/${prefix}`;
  var splitCIDR = (cidr) => {
    const p = parseCIDR(cidr);
    if (!p || p.prefix >= 32) return null;
    const np = p.prefix + 1;
    const half = p.size >>> 1;
    return [cidrToString(p.network, np), cidrToString(p.network + half >>> 0, np)];
  };
  var cidrContains = (parent, child) => {
    const p = parseCIDR(parent);
    const c = parseCIDR(child);
    if (!p || !c || c.prefix < p.prefix) return false;
    return (c.network & p.mask) === p.network;
  };
  var cidrOverlap = (a, b) => {
    const pa = parseCIDR(a);
    const pb = parseCIDR(b);
    if (!pa || !pb) return false;
    const bigger = pa.prefix <= pb.prefix ? pa : pb;
    const smaller = pa.prefix <= pb.prefix ? pb : pa;
    return (smaller.network & bigger.mask) === bigger.network;
  };
  var ipInCIDR = (ip, cidr) => {
    const n = ipToInt(ip);
    const p = parseCIDR(cidr);
    if (n === null || !p) return false;
    return (n & p.mask) === p.network;
  };

  // src/modules/compliance-engine.js
  var _CKV_MAP = {
    // CIS / NET → Checkov
    "CIS 5.2": "CKV_AWS_24",
    // SSH from 0.0.0.0/0
    "CIS 5.3": "CKV_AWS_25",
    // RDP from 0.0.0.0/0
    "CIS 5.4": "CKV_AWS_277",
    // Default SG restricts all traffic
    "NET-2": "CKV_AWS_260",
    // All traffic from 0.0.0.0/0
    // ARCH → Checkov
    "ARCH-C2": "CKV_AWS_189",
    // EBS encryption
    "ARCH-D1": "CKV_AWS_17",
    // RDS publicly accessible
    "ARCH-D2": "CKV_AWS_157",
    // RDS Multi-AZ
    "ARCH-D3": "CKV_AWS_16",
    // RDS encryption at rest
    "ARCH-D5": "CKV_AWS_64",
    // Redshift encryption
    "ARCH-D6": "CKV_AWS_29",
    // ElastiCache at-rest encryption
    "ARCH-D7": "CKV_AWS_142",
    // Redshift publicly accessible
    "ARCH-S1": "CKV_AWS_19",
    // S3 default encryption
    "ARCH-E2": "CKV_AWS_34",
    // CloudFront viewer protocol
    "ARCH-C4": "CKV_AWS_363",
    // Lambda deprecated runtime
    // SOC2 → Checkov
    "SOC2-CC7.2": "CKV_AWS_126",
    // VPC flow logs
    "SOC2-C1.2": "CKV_AWS_3",
    // EBS encryption
    "SOC2-C1.3": "CKV_AWS_30",
    // ElastiCache transit encryption
    // PCI → Checkov
    "PCI-3.4.1": "CKV_AWS_3",
    // Encryption at rest (EBS/RDS/S3)
    "PCI-10.2.1": "CKV_AWS_126",
    // VPC flow logs
    "PCI-11.3.1": "CKV_AWS_17",
    // RDS publicly accessible
    // IAM → Checkov
    "IAM-1": "CKV_AWS_274",
    // Admin access (*:*)
    "IAM-3": "CKV_AWS_36",
    // MFA for IAM users
    "IAM-11": "CKV_AWS_273",
    // Console without MFA
    "IAM-13": "CKV_AWS_56"
    // Password policy
  };
  var _complianceFindings = [];
  var _gn2Cache = /* @__PURE__ */ new WeakMap();
  function _gn2(o, id) {
    if (!o) return id;
    let v = _gn2Cache.get(o);
    if (v !== void 0) return v || id;
    const t = o.Tags || o.tags || [];
    const n = t.find((t2) => t2.Key === "Name");
    v = n ? n.Value : "";
    _gn2Cache.set(o, v);
    return v || id;
  }
  function _hasOpenCidr(perm) {
    return (perm.IpRanges || []).some((r) => r.CidrIp === "0.0.0.0/0") || (perm.Ipv6Ranges || []).some((r) => r.CidrIpv6 === "::/0");
  }
  function _hasPort(perm, port) {
    if (perm.IpProtocol === "-1") return true;
    const p = String(perm.IpProtocol);
    if (p !== "6" && p !== "17" && p !== "tcp" && p !== "udp") return false;
    const from = perm.FromPort, to = perm.ToPort;
    if (from === void 0 || to === void 0) return false;
    return from <= port && to >= port;
  }
  function _naclCoversPort(e, port) {
    if (e.Protocol === "-1") return true;
    const p = parseInt(e.Protocol, 10);
    if (p !== 6 && p !== 17) return false;
    const pr = e.PortRange;
    if (!pr || pr.From === void 0 || pr.To === void 0) return false;
    return pr.From <= port && pr.To >= port;
  }
  function runCISChecks(ctx) {
    const f = [];
    (ctx.sgs || []).forEach((sg) => {
      (sg.IpPermissions || []).forEach((p) => {
        if (_hasPort(p, 22) && _hasOpenCidr(p)) f.push({ severity: "HIGH", control: "CIS 5.2", framework: "CIS", resource: sg.GroupId, resourceName: sg.GroupName || "", message: "SG allows SSH (22) from 0.0.0.0/0", remediation: "Restrict SSH to specific CIDR ranges or bastion host SG" });
      });
    });
    (ctx.sgs || []).forEach((sg) => {
      (sg.IpPermissions || []).forEach((p) => {
        if (_hasPort(p, 3389) && _hasOpenCidr(p)) f.push({ severity: "HIGH", control: "CIS 5.3", framework: "CIS", resource: sg.GroupId, resourceName: sg.GroupName || "", message: "SG allows RDP (3389) from 0.0.0.0/0", remediation: "Restrict RDP to specific CIDR ranges or VPN" });
      });
    });
    (ctx.sgs || []).forEach((sg) => {
      if (sg.GroupName === "default") {
        const hasIngress = (sg.IpPermissions || []).length > 0;
        const hasEgress = (sg.IpPermissionsEgress || []).length > 0;
        if (hasIngress || hasEgress) f.push({ severity: "MEDIUM", control: "CIS 5.4", framework: "CIS", resource: sg.GroupId, resourceName: "default", message: `Default SG in VPC ${sg.VpcId} has ${hasIngress ? "ingress" : ""}${hasIngress && hasEgress ? " and " : ""}${hasEgress ? "egress" : ""} rules`, remediation: "Remove all rules from default SGs; use custom SGs instead" });
      }
    });
    (ctx.nacls || []).forEach((nacl) => {
      (nacl.Entries || []).forEach((e) => {
        if (!e.Egress && e.RuleAction === "allow" && (e.CidrBlock === "0.0.0.0/0" || e.Ipv6CidrBlock === "::/0")) {
          if (_naclCoversPort(e, 22)) f.push({ severity: "HIGH", control: "CIS 5.1", framework: "CIS", resource: nacl.NetworkAclId, resourceName: gn(nacl, nacl.NetworkAclId), message: "NACL allows SSH (22) from 0.0.0.0/0", remediation: "Restrict NACL ingress to specific source CIDRs" });
          if (_naclCoversPort(e, 3389)) f.push({ severity: "HIGH", control: "CIS 5.1", framework: "CIS", resource: nacl.NetworkAclId, resourceName: gn(nacl, nacl.NetworkAclId), message: "NACL allows RDP (3389) from 0.0.0.0/0", remediation: "Restrict NACL ingress to specific source CIDRs" });
        }
      });
    });
    (ctx.rts || []).forEach((rt) => {
      (rt.Routes || []).forEach((r) => {
        if (r.VpcPeeringConnectionId && r.DestinationCidrBlock === "0.0.0.0/0") f.push({ severity: "MEDIUM", control: "CIS 5.5", framework: "CIS", resource: rt.RouteTableId, resourceName: gn(rt, rt.RouteTableId), message: "Peering route has overly broad 0.0.0.0/0 destination", remediation: "Use specific CIDR ranges for peering routes" });
      });
    });
    const pubSubIds = ctx.pubSubs || /* @__PURE__ */ new Set();
    (ctx.subnets || []).forEach((sub) => {
      if (pubSubIds.has && pubSubIds.has(sub.SubnetId)) return;
      const rt = ctx.subRT && ctx.subRT[sub.SubnetId];
      if (!rt) return;
      const hasIgw = (rt.Routes || []).some((r) => r.GatewayId && r.GatewayId.startsWith("igw-") && r.State === "active");
      if (hasIgw) f.push({ severity: "MEDIUM", control: "NET-1", framework: "CIS", resource: sub.SubnetId, resourceName: gn(sub, sub.SubnetId), message: "Private subnet has direct IGW route", remediation: "Remove IGW route from private subnet route table" });
    });
    (ctx.sgs || []).forEach((sg) => {
      (sg.IpPermissions || []).forEach((p) => {
        if (p.IpProtocol === "-1" && _hasOpenCidr(p)) f.push({ severity: "CRITICAL", control: "NET-2", framework: "CIS", resource: sg.GroupId, resourceName: sg.GroupName || "", message: "SG allows ALL traffic from 0.0.0.0/0", remediation: "Restrict to specific ports and source CIDRs" });
      });
    });
    (ctx.instances || []).forEach((inst) => {
      const mo = inst.MetadataOptions || {};
      if (mo.HttpTokens !== "required") f.push({ severity: "HIGH", control: "CKV_AWS_79", framework: "CIS", resource: inst.InstanceId, resourceName: gn(inst, inst.InstanceId), message: "EC2 instance not enforcing IMDSv2 (HttpTokens != required)", remediation: 'Set MetadataOptions.HttpTokens to "required" to enforce IMDSv2' });
    });
    if ((ctx.vpcs || []).some((v) => v.FlowLogs !== void 0)) {
      (ctx.vpcs || []).forEach((vpc) => {
        if (!vpc.FlowLogs || vpc.FlowLogs.length === 0) f.push({ severity: "MEDIUM", control: "CKV_AWS_126", framework: "CIS", resource: vpc.VpcId, resourceName: gn(vpc, vpc.VpcId), message: "VPC does not have flow logs enabled", remediation: "Enable VPC Flow Logs to CloudWatch or S3" });
      });
    }
    if ((ctx.s3bk || []).some((b) => b.Versioning !== void 0)) {
      (ctx.s3bk || []).forEach((bk) => {
        if (!bk.Versioning || bk.Versioning.Status !== "Enabled") f.push({ severity: "MEDIUM", control: "CKV_AWS_21", framework: "CIS", resource: bk.Name, resourceName: bk.Name, message: "S3 bucket versioning not enabled", remediation: "Enable versioning for data protection and recovery" });
      });
    }
    if ((ctx.s3bk || []).some((b) => b.LoggingConfiguration !== void 0 || b.LoggingEnabled !== void 0)) {
      (ctx.s3bk || []).forEach((bk) => {
        if (!bk.LoggingConfiguration && !bk.LoggingEnabled) f.push({ severity: "LOW", control: "CKV_AWS_18", framework: "CIS", resource: bk.Name, resourceName: bk.Name, message: "S3 bucket access logging not configured", remediation: "Enable server access logging to an audit bucket" });
      });
    }
    (ctx.rdsInstances || []).forEach((db) => {
      if ((db.BackupRetentionPeriod || 0) < 7) f.push({ severity: "MEDIUM", control: "CKV_AWS_26", framework: "CIS", resource: db.DBInstanceIdentifier, resourceName: db.DBInstanceIdentifier, message: "RDS backup retention is " + (db.BackupRetentionPeriod || 0) + " days (should be >=7)", remediation: "Set BackupRetentionPeriod to at least 7 days" });
    });
    (ctx.lambdaFns || []).forEach((fn) => {
      if (fn.Environment && fn.Environment.Variables && Object.keys(fn.Environment.Variables).length > 0 && !fn.KMSKeyArn)
        f.push({ severity: "LOW", control: "CKV_AWS_45", framework: "CIS", resource: fn.FunctionName, resourceName: fn.FunctionName, message: "Lambda has environment variables without KMS encryption", remediation: "Set KMSKeyArn to encrypt environment variables at rest" });
    });
    (ctx.lambdaFns || []).forEach((fn) => {
      if (!fn.TracingConfig || fn.TracingConfig.Mode !== "Active")
        f.push({ severity: "LOW", control: "CKV_AWS_50", framework: "CIS", resource: fn.FunctionName, resourceName: fn.FunctionName, message: "Lambda X-Ray tracing not active", remediation: "Enable active tracing for distributed tracing and debugging" });
    });
    return f;
  }
  function runWAFChecks(ctx) {
    const f = [];
    const acls = ctx.wafAcls || [];
    acls.forEach((acl) => {
      if (!(acl.Rules || []).length) f.push({ severity: "HIGH", control: "WAF-1", framework: "WAF", resource: acl.Id || acl.WebACLId || "", resourceName: acl.Name || "", message: "WebACL has zero rules", remediation: "Add rate-limiting and IP-filtering rules to WebACL" });
    });
    acls.forEach((acl) => {
      const hasRate = (acl.Rules || []).some((r) => r.Statement && r.Statement.RateBasedStatement || r.Type === "RATE_BASED");
      if (!hasRate && (acl.Rules || []).length > 0) f.push({ severity: "MEDIUM", control: "WAF-2", framework: "WAF", resource: acl.Id || acl.WebACLId || "", resourceName: acl.Name || "", message: "WebACL has no rate-limiting rule", remediation: "Add a rate-based rule to prevent DDoS/brute-force" });
    });
    const protectedArns = /* @__PURE__ */ new Set();
    acls.forEach((acl) => {
      (acl.ResourceArns || []).forEach((a) => protectedArns.add(a));
    });
    (ctx.albs || []).forEach((alb) => {
      if (alb.LoadBalancerArn && !protectedArns.has(alb.LoadBalancerArn)) f.push({ severity: "MEDIUM", control: "WAF-3", framework: "WAF", resource: alb.LoadBalancerArn, resourceName: alb.LoadBalancerName || "", message: "ALB not associated with any WebACL", remediation: "Associate this ALB with a WAF WebACL" });
    });
    acls.forEach((acl) => {
      const da = acl.DefaultAction || {};
      if (da.Allow || da.Type === "ALLOW") f.push({ severity: "MEDIUM", control: "WAF-4", framework: "WAF", resource: acl.Id || acl.WebACLId || "", resourceName: acl.Name || "", message: "WebACL default action is ALLOW (should be BLOCK)", remediation: "Set default action to BLOCK and add explicit ALLOW rules" });
    });
    return f;
  }
  function runArchChecks(ctx) {
    const f = [];
    const gn2 = _gn2;
    const pubSubs = ctx.pubSubs || /* @__PURE__ */ new Set();
    const subRT = ctx.subRT || {};
    (ctx.subnets || []).forEach((sub) => {
      if (!sub.MapPublicIpOnLaunch) return;
      const rt = subRT[sub.SubnetId];
      if (!rt) return;
      const hasIgw = (rt.Routes || []).some((r) => r.GatewayId && r.GatewayId.startsWith("igw-") && r.State !== "blackhole");
      if (!hasIgw) f.push({ severity: "HIGH", control: "ARCH-N1", framework: "ARCH", resource: sub.SubnetId, resourceName: gn2(sub, sub.SubnetId), message: "Subnet has MapPublicIpOnLaunch=true but no IGW route", remediation: "Add an IGW route to the route table or disable MapPublicIpOnLaunch" });
    });
    (ctx.subnets || []).forEach((sub) => {
      if (pubSubs.has(sub.SubnetId)) return;
      const rt = subRT[sub.SubnetId];
      if (!rt) return;
      const hasNat = (rt.Routes || []).some((r) => r.NatGatewayId);
      const hasVpce = (rt.Routes || []).some((r) => r.GatewayId && r.GatewayId.startsWith("vpce-"));
      const cnt = ((ctx.instBySub || {})[sub.SubnetId] || []).length + ((ctx.lambdaBySub || {})[sub.SubnetId] || []).length + ((ctx.ecsBySub || {})[sub.SubnetId] || []).length;
      if (cnt > 0 && !hasNat && !hasVpce) f.push({ severity: "HIGH", control: "ARCH-N2", framework: "ARCH", resource: sub.SubnetId, resourceName: gn2(sub, sub.SubnetId), message: "Private subnet has " + cnt + " resources but no NAT gateway or VPC endpoint route", remediation: "Add a NAT gateway in a public subnet and route 0.0.0.0/0 through it" });
    });
    const subByVpc = {};
    (ctx.subnets || []).forEach((s) => {
      (subByVpc[s.VpcId] = subByVpc[s.VpcId] || []).push(s);
    });
    Object.entries(subByVpc).forEach(([vid, subs]) => {
      const azs = new Set(subs.map((s) => s.AvailabilityZone).filter(Boolean));
      if (subs.length > 1 && azs.size === 1) {
        const vpc = (ctx.vpcs || []).find((v) => v.VpcId === vid);
        f.push({ severity: "HIGH", control: "ARCH-N3", framework: "ARCH", resource: vid, resourceName: gn2(vpc || {}, vid), message: "All " + subs.length + " subnets in single AZ (" + [...azs][0] + ") \u2014 no HA", remediation: "Create subnets across at least 2 AZs for fault tolerance" });
      }
    });
    (ctx.sgs || []).forEach((sg) => {
      if (sg.GroupName === "default") return;
      (sg.IpPermissionsEgress || []).forEach((p) => {
        if (p.IpProtocol === "-1" && _hasOpenCidr(p)) {
          const inst = (ctx.instances || []).filter((i) => (i.SecurityGroups || []).some((g) => g.GroupId === sg.GroupId));
          if (inst.length > 0) f.push({ severity: "LOW", control: "ARCH-N5", framework: "ARCH", resource: sg.GroupId, resourceName: sg.GroupName || "", message: "SG has unrestricted egress attached to " + inst.length + " instance(s)", remediation: "Restrict egress to required ports/CIDRs only" });
        }
      });
    });
    (ctx.instances || []).forEach((inst) => {
      if (!pubSubs.has(inst.SubnetId)) return;
      const sgIds = (inst.SecurityGroups || []).map((g) => g.GroupId);
      const hasBroad = sgIds.some((gid) => {
        const sg = (ctx.sgs || []).find((s) => s.GroupId === gid);
        return sg && (sg.IpPermissions || []).some((p) => p.IpProtocol === "-1" && _hasOpenCidr(p));
      });
      if (hasBroad) f.push({ severity: "CRITICAL", control: "ARCH-C1", framework: "ARCH", resource: inst.InstanceId, resourceName: gn2(inst, inst.InstanceId), message: "EC2 in public subnet with SG allowing all traffic from 0.0.0.0/0", remediation: "Restrict to specific ports; use ALB/NLB as entry point" });
    });
    (ctx.instances || []).forEach((inst) => {
      const vols = (inst.BlockDeviceMappings || []).map((b) => b.Ebs?.VolumeId).filter(Boolean);
      const unenc = vols.filter((vid) => {
        const v = (ctx.volumes || []).find((x) => x.VolumeId === vid);
        return v && !v.Encrypted;
      });
      if (unenc.length > 0) f.push({ severity: "MEDIUM", control: "ARCH-C2", framework: "ARCH", resource: inst.InstanceId, resourceName: gn2(inst, inst.InstanceId), message: unenc.length + " unencrypted EBS volume(s)", remediation: "Enable EBS encryption by default in account settings" });
    });
    (ctx.lambdaFns || []).forEach((fn) => {
      const vc = fn.VpcConfig;
      if (!vc || !vc.SubnetIds || !vc.SubnetIds.length) return;
      const azs = new Set(vc.SubnetIds.map((sid2) => {
        const s = (ctx.subnets || []).find((x) => x.SubnetId === sid2);
        return s ? s.AvailabilityZone : null;
      }).filter(Boolean));
      if (azs.size < 2) f.push({ severity: "MEDIUM", control: "ARCH-C3", framework: "ARCH", resource: fn.FunctionName, resourceName: fn.FunctionName, message: "Lambda in single AZ only", remediation: "Configure Lambda VPC subnets across at least 2 AZs" });
    });
    (ctx.rdsInstances || []).forEach((db) => {
      if (db.PubliclyAccessible) f.push({ severity: "CRITICAL", control: "ARCH-D1", framework: "ARCH", resource: db.DBInstanceIdentifier, resourceName: db.DBInstanceIdentifier, message: "RDS instance is publicly accessible", remediation: "Set PubliclyAccessible=false; access via VPN/bastion" });
    });
    (ctx.rdsInstances || []).forEach((db) => {
      if (db.MultiAZ) return;
      if ((db.DBInstanceClass || "").includes(".micro")) return;
      f.push({ severity: "MEDIUM", control: "ARCH-D2", framework: "ARCH", resource: db.DBInstanceIdentifier, resourceName: db.DBInstanceIdentifier, message: "RDS not configured for Multi-AZ", remediation: "Enable Multi-AZ for production databases" });
    });
    (ctx.rdsInstances || []).forEach((db) => {
      if (!db.StorageEncrypted) f.push({ severity: "HIGH", control: "ARCH-D3", framework: "ARCH", resource: db.DBInstanceIdentifier, resourceName: db.DBInstanceIdentifier, message: "RDS storage not encrypted", remediation: "Enable encryption at rest" });
    });
    (ctx.ecacheClusters || []).forEach((ec) => {
      if (ec.NumCacheNodes > 1 || (ec.CacheNodeType || "").includes(".micro")) return;
      f.push({ severity: "MEDIUM", control: "ARCH-D4", framework: "ARCH", resource: ec.CacheClusterId, resourceName: ec.CacheClusterId, message: "ElastiCache cluster has only 1 node", remediation: "Add read replicas or enable cluster mode" });
    });
    (ctx.redshiftClusters || []).forEach((rs) => {
      if (!rs.Encrypted) f.push({ severity: "HIGH", control: "ARCH-D5", framework: "ARCH", resource: rs.ClusterIdentifier, resourceName: rs.ClusterIdentifier, message: "Redshift cluster not encrypted at rest", remediation: "Enable encryption (requires snapshot migration)" });
    });
    (ctx.s3bk || []).forEach((bk) => {
      if (!bk.ServerSideEncryption && !bk.BucketEncryption) f.push({ severity: "MEDIUM", control: "ARCH-S1", framework: "ARCH", resource: bk.Name, resourceName: bk.Name, message: "S3 bucket may lack default encryption", remediation: "Enable default encryption (SSE-S3 or SSE-KMS)" });
    });
    (ctx.volumes || []).forEach((vol) => {
      const snaps = (ctx.snapByVol || {})[vol.VolumeId] || [];
      if (snaps.length > 0 || vol.State !== "in-use") return;
      f.push({ severity: "LOW", control: "ARCH-S2", framework: "ARCH", resource: vol.VolumeId, resourceName: gn2(vol, vol.VolumeId), message: "In-use EBS volume has no snapshots", remediation: "Create regular snapshots using AWS Backup or DLM" });
    });
    const cfOrigins = /* @__PURE__ */ new Set();
    (ctx.cfDistributions || []).forEach((d) => {
      (d.Origins?.Items || []).forEach((o) => {
        cfOrigins.add(o.DomainName);
      });
    });
    (ctx.albs || []).forEach((alb) => {
      if (alb.Scheme !== "internet-facing" || cfOrigins.has(alb.DNSName)) return;
      f.push({ severity: "LOW", control: "ARCH-E1", framework: "ARCH", resource: alb.LoadBalancerName, resourceName: alb.LoadBalancerName, message: "Internet-facing ALB without CloudFront", remediation: "Place CloudFront in front for caching and DDoS protection" });
    });
    const natByVpc = {};
    (ctx.nats || []).forEach((n) => {
      (natByVpc[n.VpcId] = natByVpc[n.VpcId] || []).push(n);
    });
    Object.entries(natByVpc).forEach(([vid, nats]) => {
      const azs = new Set(nats.map((n) => {
        const s = (ctx.subnets || []).find((x) => x.SubnetId === n.SubnetId);
        return s ? s.AvailabilityZone : null;
      }).filter(Boolean));
      if (nats.length >= 1 && azs.size === 1 && (subByVpc[vid] || []).length > 2) {
        const vpc = (ctx.vpcs || []).find((v) => v.VpcId === vid);
        f.push({ severity: "MEDIUM", control: "ARCH-G1", framework: "ARCH", resource: vid, resourceName: gn2(vpc || {}, vid), message: "NAT Gateway(s) only in 1 AZ", remediation: "Deploy NAT Gateways in each AZ for resilience" });
      }
    });
    const vpcHasS3Vpce = {};
    (ctx.vpces || []).forEach((e) => {
      if ((e.ServiceName || "").includes(".s3")) vpcHasS3Vpce[e.VpcId] = true;
    });
    (ctx.vpcs || []).forEach((vpc) => {
      const hasFns = (ctx.lambdaFns || []).some((fn) => fn.VpcConfig && fn.VpcConfig.VpcId === vpc.VpcId);
      const hasInst = (ctx.instances || []).some((i) => i.VpcId === vpc.VpcId);
      if ((hasFns || hasInst) && !vpcHasS3Vpce[vpc.VpcId]) f.push({ severity: "LOW", control: "ARCH-G2", framework: "ARCH", resource: vpc.VpcId, resourceName: gn2(vpc, vpc.VpcId), message: "VPC has compute but no S3 Gateway Endpoint (traffic routes through NAT)", remediation: "Create an S3 Gateway Endpoint (free) to reduce NAT costs" });
    });
    (ctx.peerings || []).forEach((p) => {
      if (p.Status?.Code !== "active") return;
      [p.RequesterVpcInfo?.VpcId, p.AccepterVpcInfo?.VpcId].forEach((vid) => {
        if (!vid) return;
        const hasRoute = (ctx.rts || []).some((rt) => rt.VpcId === vid && (rt.Routes || []).some((r) => r.VpcPeeringConnectionId === p.VpcPeeringConnectionId));
        if (!hasRoute) f.push({ severity: "HIGH", control: "ARCH-X1", framework: "ARCH", resource: p.VpcPeeringConnectionId, resourceName: p.VpcPeeringConnectionId, message: "VPC " + vid + " has no route for peering " + p.VpcPeeringConnectionId, remediation: "Add routes in both VPCs for the peering connection" });
      });
    });
    (ctx.lambdaFns || []).forEach((fn) => {
      if (fn.Runtime && EOL_RUNTIMES.has(fn.Runtime))
        f.push({ severity: "HIGH", control: "ARCH-C4", framework: "ARCH", resource: fn.FunctionName, resourceName: fn.FunctionName, message: "Lambda uses deprecated runtime: " + fn.Runtime, remediation: "Upgrade to a supported runtime version to receive security patches" });
    });
    (ctx.lambdaFns || []).forEach((fn) => {
      if ((fn.Timeout || 3) > 300 && !fn.DeadLetterConfig?.TargetArn)
        f.push({ severity: "LOW", control: "ARCH-C5", framework: "ARCH", resource: fn.FunctionName, resourceName: fn.FunctionName, message: "Lambda timeout >5min with no dead letter queue", remediation: "Add an SQS or SNS DLQ for failed invocations" });
    });
    (ctx.ecacheClusters || []).forEach((ec) => {
      if (ec.AtRestEncryptionEnabled === false || !ec.AtRestEncryptionEnabled && ec.Engine === "redis")
        f.push({ severity: "MEDIUM", control: "ARCH-D6", framework: "ARCH", resource: ec.CacheClusterId, resourceName: ec.CacheClusterId, message: "ElastiCache cluster without encryption at rest", remediation: "Enable at-rest encryption (requires creating a new cluster)" });
    });
    (ctx.redshiftClusters || []).forEach((rs) => {
      if (rs.PubliclyAccessible)
        f.push({ severity: "CRITICAL", control: "ARCH-D7", framework: "ARCH", resource: rs.ClusterIdentifier, resourceName: rs.ClusterIdentifier, message: "Redshift cluster is publicly accessible", remediation: "Disable public access; connect via VPN or bastion in private subnet" });
    });
    (ctx.cfDistributions || []).forEach((d) => {
      const vpp = d.DefaultCacheBehavior?.ViewerProtocolPolicy;
      if (vpp === "allow-all") f.push({ severity: "MEDIUM", control: "ARCH-E2", framework: "ARCH", resource: d.Id || d.ARN || "", resourceName: d.DomainName || d.Id || "", message: "CloudFront allows HTTP connections", remediation: "Set ViewerProtocolPolicy to redirect-to-https or https-only" });
    });
    (ctx.ecsServices || []).forEach((svc) => {
      if (svc.desiredCount > 0 && svc.runningCount === 0)
        f.push({ severity: "HIGH", control: "ARCH-C6", framework: "ARCH", resource: svc.serviceName, resourceName: svc.serviceName, message: "ECS service has 0 running tasks (desired: " + svc.desiredCount + ")", remediation: "Check task definition, IAM role, and container health checks" });
    });
    return f;
  }
  function runSOC2Checks(ctx) {
    const f = [];
    const gn2 = _gn2;
    const pubSubs = ctx.pubSubs || /* @__PURE__ */ new Set();
    const sensPorts = [22, 3389, 3306, 5432, 1433, 1521, 6379, 27017];
    (ctx.sgs || []).forEach((sg) => {
      (sg.IpPermissions || []).forEach((p) => {
        sensPorts.forEach((port) => {
          if (_hasPort(p, port) && _hasOpenCidr(p))
            f.push({ severity: "HIGH", control: "SOC2-CC6.1", framework: "SOC2", resource: sg.GroupId, resourceName: sg.GroupName || "", message: "SG allows port " + port + " from 0.0.0.0/0 \u2014 logical access control gap", remediation: "Restrict to known CIDR ranges; use bastion hosts or SSM Session Manager" });
        });
      });
    });
    (ctx.sgs || []).forEach((sg) => {
      if (sg.GroupName !== "default") return;
      if ((sg.IpPermissions || []).length > 0) f.push({ severity: "MEDIUM", control: "SOC2-CC6.3", framework: "SOC2", resource: sg.GroupId, resourceName: "default", message: "Default SG has inbound rules \u2014 violates least-privilege", remediation: "Remove all inbound rules from default SG; create explicit SGs per role" });
    });
    (ctx.vpcs || []).forEach((vpc) => {
      const nacls = (ctx.nacls || []).filter((n) => n.VpcId === vpc.VpcId && !n.IsDefault);
      if (nacls.length === 0) f.push({ severity: "MEDIUM", control: "SOC2-CC6.6", framework: "SOC2", resource: vpc.VpcId, resourceName: gn2(vpc, vpc.VpcId), message: "VPC uses only default NACLs \u2014 no network boundary segmentation", remediation: "Create custom NACLs for each subnet tier (public/private/data)" });
    });
    (ctx.albs || []).forEach((alb) => {
      const hasHttps = (alb.Listeners || []).some((l) => l.Protocol === "HTTPS");
      if (alb.Scheme === "internet-facing" && !hasHttps) f.push({ severity: "HIGH", control: "SOC2-CC6.7", framework: "SOC2", resource: alb.LoadBalancerName, resourceName: alb.LoadBalancerName, message: "Internet-facing ALB has no HTTPS listener \u2014 data transmitted unencrypted", remediation: "Add HTTPS listener with TLS 1.2+ certificate via ACM" });
    });
    (ctx.instances || []).forEach((inst) => {
      if (!pubSubs.has(inst.SubnetId)) return;
      const sgIds = (inst.SecurityGroups || []).map((g) => g.GroupId);
      const anyOpen = sgIds.some((gid) => {
        const sg = (ctx.sgs || []).find((s) => s.GroupId === gid);
        return sg && (sg.IpPermissionsEgress || []).some((p) => p.IpProtocol === "-1" && _hasOpenCidr(p));
      });
      if (anyOpen) f.push({ severity: "MEDIUM", control: "SOC2-CC6.8", framework: "SOC2", resource: inst.InstanceId, resourceName: gn2(inst, inst.InstanceId), message: "Public EC2 with unrestricted egress \u2014 C2 callback risk", remediation: "Restrict outbound to required ports; use VPC endpoints for AWS services" });
    });
    if ((ctx.vpcs || []).some((v) => v.FlowLogs !== void 0)) {
      (ctx.vpcs || []).forEach((vpc) => {
        if (!vpc.FlowLogs || vpc.FlowLogs.length === 0) f.push({ severity: "HIGH", control: "SOC2-CC7.2", framework: "SOC2", resource: vpc.VpcId, resourceName: gn2(vpc, vpc.VpcId), message: "VPC has no flow logs enabled \u2014 insufficient monitoring", remediation: "Enable VPC Flow Logs to CloudWatch or S3 for audit trail" });
      });
    }
    let untagged = 0;
    (ctx.instances || []).forEach((inst) => {
      if (!gn2(inst, null)) untagged++;
    });
    (ctx.rdsInstances || []).forEach((db) => {
      if (!(db.TagList || []).some((t) => t.Key === "Name")) untagged++;
    });
    if (untagged > 0) f.push({ severity: "LOW", control: "SOC2-CC8.1", framework: "SOC2", resource: "Multiple", resourceName: untagged + " resources", message: untagged + " resource(s) missing Name tags \u2014 change tracking gap", remediation: "Apply consistent tagging policy (Name, Environment, Owner, CostCenter)" });
    (ctx.rdsInstances || []).forEach((db) => {
      if (!db.MultiAZ && !(db.DBInstanceClass || "").includes(".micro"))
        f.push({ severity: "HIGH", control: "SOC2-A1.2", framework: "SOC2", resource: db.DBInstanceIdentifier, resourceName: db.DBInstanceIdentifier, message: "RDS not Multi-AZ \u2014 does not meet availability commitment", remediation: "Enable Multi-AZ for production databases" });
    });
    (ctx.volumes || []).forEach((vol) => {
      const snaps = (ctx.snapByVol || {})[vol.VolumeId] || [];
      if (snaps.length === 0 && vol.State === "in-use") f.push({ severity: "MEDIUM", control: "SOC2-A1.3", framework: "SOC2", resource: vol.VolumeId, resourceName: gn2(vol, vol.VolumeId), message: "In-use EBS volume with no backup snapshots \u2014 recovery gap", remediation: "Configure AWS Backup or DLM lifecycle policy" });
    });
    (ctx.s3bk || []).forEach((bk) => {
      if (!bk.ServerSideEncryption && !bk.BucketEncryption)
        f.push({ severity: "HIGH", control: "SOC2-C1.1", framework: "SOC2", resource: bk.Name, resourceName: bk.Name, message: "S3 bucket without default encryption \u2014 confidentiality risk", remediation: "Enable SSE-S3 or SSE-KMS default encryption" });
    });
    (ctx.volumes || []).forEach((vol) => {
      if (!vol.Encrypted && vol.State === "in-use")
        f.push({ severity: "HIGH", control: "SOC2-C1.2", framework: "SOC2", resource: vol.VolumeId, resourceName: gn2(vol, vol.VolumeId), message: "EBS volume not encrypted at rest \u2014 data protection gap", remediation: "Enable EBS encryption by default in account settings" });
    });
    (ctx.ecacheClusters || []).forEach((ec) => {
      if (ec.TransitEncryptionEnabled === false || ec.Engine === "redis" && !ec.TransitEncryptionEnabled)
        f.push({ severity: "HIGH", control: "SOC2-C1.3", framework: "SOC2", resource: ec.CacheClusterId, resourceName: ec.CacheClusterId, message: "ElastiCache without in-transit encryption \u2014 data exposure risk", remediation: "Enable transit encryption (requires new cluster for existing Redis)" });
    });
    (ctx.cfDistributions || []).forEach((d) => {
      const vpp = d.DefaultCacheBehavior?.ViewerProtocolPolicy;
      if (vpp === "allow-all") f.push({ severity: "MEDIUM", control: "SOC2-CC7.3", framework: "SOC2", resource: d.Id || d.ARN || "", resourceName: d.DomainName || d.Id || "", message: "CloudFront allows unencrypted HTTP \u2014 monitoring blind spot", remediation: "Set ViewerProtocolPolicy to redirect-to-https" });
    });
    (ctx.ecsServices || []).forEach((svc) => {
      if (svc.desiredCount > 0 && svc.runningCount < svc.desiredCount)
        f.push({ severity: "HIGH", control: "SOC2-A1.4", framework: "SOC2", resource: svc.serviceName, resourceName: svc.serviceName, message: "ECS service running " + svc.runningCount + "/" + svc.desiredCount + " tasks \u2014 availability gap", remediation: "Check task health, resource limits, and container image availability" });
    });
    (ctx.lambdaFns || []).forEach((fn) => {
      if (fn.Runtime && EOL_RUNTIMES.has(fn.Runtime))
        f.push({ severity: "HIGH", control: "SOC2-CC6.10", framework: "SOC2", resource: fn.FunctionName, resourceName: fn.FunctionName, message: "Lambda using EOL runtime " + fn.Runtime + " \u2014 no security patches", remediation: "Upgrade to supported runtime version" });
    });
    (ctx.vpcs || []).forEach((vpc) => {
      const customRts = (ctx.rts || []).filter((rt) => rt.VpcId === vpc.VpcId && !(rt.Associations || []).some((a) => a.Main));
      if (customRts.length === 0 && (ctx.subnets || []).filter((s) => s.VpcId === vpc.VpcId).length > 1)
        f.push({ severity: "LOW", control: "SOC2-PI1.1", framework: "SOC2", resource: vpc.VpcId, resourceName: gn2(vpc, vpc.VpcId), message: "VPC uses only main route table for all subnets \u2014 processing integrity risk", remediation: "Create custom route tables per subnet tier for explicit routing control" });
    });
    return f;
  }
  function runPCIDSSChecks(ctx) {
    const f = [];
    const gn2 = _gn2;
    const pubSubs = ctx.pubSubs || /* @__PURE__ */ new Set();
    const dbPorts = [3306, 5432, 1433, 1521, 6379, 27017, 5439];
    (ctx.sgs || []).forEach((sg) => {
      (sg.IpPermissions || []).forEach((p) => {
        dbPorts.forEach((port) => {
          if (_hasPort(p, port) && _hasOpenCidr(p))
            f.push({ severity: "CRITICAL", control: "PCI-1.3.1", framework: "PCI", resource: sg.GroupId, resourceName: sg.GroupName || "", message: "SG allows DB port " + port + " from 0.0.0.0/0 \u2014 CDE exposure", remediation: "Restrict database ports to application-tier SGs only; never expose to 0.0.0.0/0" });
        });
      });
    });
    (ctx.rdsInstances || []).forEach((db) => {
      const sgIds = (db.VpcSecurityGroups || []).map((g) => g.VpcSecurityGroupId);
      const allOpen = sgIds.some((gid) => {
        const sg = (ctx.sgs || []).find((s) => s.GroupId === gid);
        return sg && (sg.IpPermissionsEgress || []).some((p) => p.IpProtocol === "-1" && _hasOpenCidr(p));
      });
      if (allOpen) f.push({ severity: "HIGH", control: "PCI-1.3.2", framework: "PCI", resource: db.DBInstanceIdentifier, resourceName: db.DBInstanceIdentifier, message: "RDS SG has unrestricted outbound \u2014 must restrict CDE egress", remediation: "Restrict egress to specific app-tier SGs and required AWS service endpoints" });
    });
    const pubSgIds = /* @__PURE__ */ new Set();
    const privSgIds = /* @__PURE__ */ new Set();
    (ctx.instances || []).forEach((inst) => {
      const sgs = (inst.SecurityGroups || []).map((g) => g.GroupId);
      if (pubSubs.has(inst.SubnetId)) sgs.forEach((g) => pubSgIds.add(g));
      else sgs.forEach((g) => privSgIds.add(g));
    });
    pubSgIds.forEach((gid) => {
      if (privSgIds.has(gid)) {
        const sg = (ctx.sgs || []).find((s) => s.GroupId === gid);
        f.push({ severity: "HIGH", control: "PCI-1.3.4", framework: "PCI", resource: gid, resourceName: (sg ? sg.GroupName : "") || gid, message: "SG shared between public and private subnets \u2014 network segmentation failure", remediation: "Create separate SGs for each network tier; never share across CDE boundary" });
      }
    });
    (ctx.instances || []).forEach((inst) => {
      const hasDefault = (inst.SecurityGroups || []).some((g) => {
        const sg = (ctx.sgs || []).find((s) => s.GroupId === g.GroupId);
        return sg && sg.GroupName === "default";
      });
      if (hasDefault) f.push({ severity: "MEDIUM", control: "PCI-2.2.1", framework: "PCI", resource: inst.InstanceId, resourceName: gn2(inst, inst.InstanceId), message: "EC2 using default SG \u2014 non-compliant with configuration standards", remediation: "Replace default SG with purpose-built SG following least privilege" });
    });
    (ctx.rdsInstances || []).forEach((db) => {
      if (!db.StorageEncrypted)
        f.push({ severity: "CRITICAL", control: "PCI-3.4.1", framework: "PCI", resource: db.DBInstanceIdentifier, resourceName: db.DBInstanceIdentifier, message: "RDS storage not encrypted \u2014 cardholder data at risk", remediation: "Enable encryption at rest (requires snapshot + restore for existing instances)" });
    });
    (ctx.volumes || []).forEach((vol) => {
      if (!vol.Encrypted && vol.State === "in-use")
        f.push({ severity: "CRITICAL", control: "PCI-3.4.1", framework: "PCI", resource: vol.VolumeId, resourceName: gn2(vol, vol.VolumeId), message: "EBS volume not encrypted \u2014 stored data exposure risk", remediation: "Enable EBS encryption by default; migrate existing volumes via snapshot" });
    });
    (ctx.s3bk || []).forEach((bk) => {
      if (!bk.ServerSideEncryption && !bk.BucketEncryption)
        f.push({ severity: "CRITICAL", control: "PCI-3.4.1", framework: "PCI", resource: bk.Name, resourceName: bk.Name, message: "S3 bucket without default encryption \u2014 data at rest violation", remediation: "Enable SSE-S3 or SSE-KMS default encryption; add bucket policy to deny unencrypted uploads" });
    });
    (ctx.rdsInstances || []).forEach((db) => {
      if (db.StorageEncrypted && db.KmsKeyId && db.KmsKeyId.includes("aws/rds"))
        f.push({ severity: "LOW", control: "PCI-3.5.1", framework: "PCI", resource: db.DBInstanceIdentifier, resourceName: db.DBInstanceIdentifier, message: "RDS using AWS-managed key instead of CMK \u2014 limited key control", remediation: "Use customer-managed KMS key for full key rotation and access control" });
    });
    (ctx.albs || []).forEach((alb) => {
      const hasHttps = (alb.Listeners || []).some((l) => l.Protocol === "HTTPS");
      if (alb.Scheme === "internet-facing" && !hasHttps) f.push({ severity: "CRITICAL", control: "PCI-4.2.1", framework: "PCI", resource: alb.LoadBalancerName, resourceName: alb.LoadBalancerName, message: "Internet-facing ALB without HTTPS \u2014 data in transit unencrypted", remediation: "Add HTTPS listener with TLS 1.2+ via ACM certificate; redirect HTTP to HTTPS" });
    });
    const albsWithWaf = /* @__PURE__ */ new Set();
    (ctx.wafAcls || []).forEach((acl) => {
      (acl.ResourceArns || []).forEach((arn) => {
        const m = arn.match(/loadbalancer\/app\/([^/]+)/);
        if (m) albsWithWaf.add(m[1]);
      });
    });
    (ctx.albs || []).forEach((alb) => {
      if (alb.Scheme !== "internet-facing") return;
      if (!albsWithWaf.has(alb.LoadBalancerName)) f.push({ severity: "HIGH", control: "PCI-6.4.1", framework: "PCI", resource: alb.LoadBalancerName, resourceName: alb.LoadBalancerName, message: "Internet-facing ALB without WAF \u2014 web app firewall required", remediation: "Associate AWS WAF WebACL with ALB; add OWASP Top 10 managed rule group" });
    });
    (ctx.sgs || []).forEach((sg) => {
      if (sg.GroupName === "default") return;
      (sg.IpPermissions || []).forEach((p) => {
        if (p.IpProtocol === "-1" && _hasOpenCidr(p))
          f.push({ severity: "HIGH", control: "PCI-7.2.1", framework: "PCI", resource: sg.GroupId, resourceName: sg.GroupName || "", message: "SG allows all inbound traffic \u2014 violates least privilege", remediation: "Replace with specific port/protocol rules matching business need" });
      });
    });
    if ((ctx.vpcs || []).some((v) => v.FlowLogs !== void 0)) {
      (ctx.vpcs || []).forEach((vpc) => {
        if (!vpc.FlowLogs || vpc.FlowLogs.length === 0) f.push({ severity: "HIGH", control: "PCI-10.2.1", framework: "PCI", resource: vpc.VpcId, resourceName: gn2(vpc, vpc.VpcId), message: "VPC flow logs not enabled \u2014 insufficient audit logging", remediation: "Enable VPC Flow Logs with at least 1 year retention for PCI compliance" });
      });
    }
    (ctx.rdsInstances || []).forEach((db) => {
      if (db.PubliclyAccessible)
        f.push({ severity: "CRITICAL", control: "PCI-11.3.1", framework: "PCI", resource: db.DBInstanceIdentifier, resourceName: db.DBInstanceIdentifier, message: "RDS publicly accessible \u2014 immediate vulnerability exposure", remediation: "Set PubliclyAccessible=false; access only via private subnet or VPN" });
    });
    (ctx.vpcs || []).forEach((vpc) => {
      const instCount = (ctx.instances || []).filter((i) => i.VpcId === vpc.VpcId).length;
      if (instCount > 5 && vpc.FlowLogs !== void 0 && !vpc.FlowLogs) f.push({ severity: "MEDIUM", control: "PCI-12.10.1", framework: "PCI", resource: vpc.VpcId, resourceName: gn2(vpc, vpc.VpcId), message: "Large VPC (" + instCount + " instances) without monitoring \u2014 incident response gap", remediation: "Enable GuardDuty, CloudTrail, and VPC Flow Logs; create SNS alerts" });
    });
    (ctx.ecacheClusters || []).forEach((ec) => {
      if (ec.TransitEncryptionEnabled === false || ec.Engine === "redis" && !ec.TransitEncryptionEnabled)
        f.push({ severity: "HIGH", control: "PCI-2.3.1", framework: "PCI", resource: ec.CacheClusterId, resourceName: ec.CacheClusterId, message: "ElastiCache without in-transit encryption \u2014 data exposed in network", remediation: "Enable transit encryption; use TLS for Redis connections" });
    });
    (ctx.ecacheClusters || []).forEach((ec) => {
      if (ec.AtRestEncryptionEnabled === false || ec.Engine === "redis" && !ec.AtRestEncryptionEnabled)
        f.push({ severity: "HIGH", control: "PCI-3.4.1", framework: "PCI", resource: ec.CacheClusterId, resourceName: ec.CacheClusterId, message: "ElastiCache without at-rest encryption \u2014 cached data at risk", remediation: "Enable at-rest encryption (requires new cluster)" });
    });
    (ctx.lambdaFns || []).forEach((fn) => {
      if (fn.Runtime && EOL_RUNTIMES.has(fn.Runtime))
        f.push({ severity: "CRITICAL", control: "PCI-6.3.1", framework: "PCI", resource: fn.FunctionName, resourceName: fn.FunctionName, message: "Lambda on EOL runtime " + fn.Runtime + " \u2014 unpatched vulnerabilities", remediation: "Upgrade to supported runtime for security patch coverage" });
    });
    (ctx.cfDistributions || []).forEach((d) => {
      const vpp = d.DefaultCacheBehavior?.ViewerProtocolPolicy;
      if (vpp === "allow-all") f.push({ severity: "HIGH", control: "PCI-4.2.1", framework: "PCI", resource: d.Id || d.ARN || "", resourceName: d.DomainName || d.Id || "", message: "CloudFront allows unencrypted HTTP \u2014 data in transit violation", remediation: "Set ViewerProtocolPolicy to redirect-to-https or https-only" });
    });
    (ctx.redshiftClusters || []).forEach((rs) => {
      if (rs.PubliclyAccessible)
        f.push({ severity: "CRITICAL", control: "PCI-11.3.1", framework: "PCI", resource: rs.ClusterIdentifier, resourceName: rs.ClusterIdentifier, message: "Redshift publicly accessible \u2014 data warehouse exposed", remediation: "Disable public access; use private subnet with VPN access only" });
    });
    return f;
  }
  var _complianceCacheCtx = null;
  function invalidateComplianceCache() {
    _complianceCacheCtx = null;
    _complianceFindings = [];
    window._complianceFindings = _complianceFindings;
  }
  function runComplianceChecks(ctx) {
    if (_complianceCacheCtx === ctx && _complianceFindings.length > 0) {
      return _complianceFindings;
    }
    _complianceCacheCtx = ctx;
    _complianceFindings = [...runCISChecks(ctx), ...runWAFChecks(ctx), ...runArchChecks(ctx), ...runSOC2Checks(ctx), ...runPCIDSSChecks(ctx), ...runBUDRChecks(ctx)];
    try {
      const iamRaw = safeParse(gv("in_iam"));
      if (iamRaw) {
        const iamData = parseIAMData(iamRaw);
        _complianceFindings = _complianceFindings.concat(runIAMChecks(iamData));
      }
    } catch (e) {
      console.warn("IAM compliance checks failed:", e);
    }
    _complianceFindings.forEach((f) => {
      if (_CKV_MAP[f.control]) f.ckv = _CKV_MAP[f.control];
    });
    window._complianceFindings = _complianceFindings;
    return _complianceFindings;
  }

  // src/main.js
  window.AppModules = {
    // Constants (clean + underscore-prefixed aliases for inline code)
    SEV_ORDER,
    FW_LABELS,
    EOL_RUNTIMES,
    EFFORT_LABELS,
    EFFORT_TIME,
    PRIORITY_META,
    TIER_META,
    PRIORITY_ORDER,
    PRIORITY_KEYS,
    MUTE_KEY,
    NOTES_KEY,
    SNAP_KEY,
    SAVE_KEY,
    MAX_SNAPSHOTS,
    SAVE_INTERVAL,
    NOTE_CATEGORIES,
    _SEV_ORDER: SEV_ORDER,
    _FW_LABELS: FW_LABELS,
    // Utils
    safeParse,
    ext,
    esc,
    gn,
    sid,
    clsGw,
    isShared,
    gcv,
    gch,
    gv,
    // DOM helpers
    showToast,
    closeAllDashboards,
    toggleClass,
    setVisible,
    getEl,
    qs,
    qsa,
    // Prefs
    _prefs,
    loadPrefs,
    savePrefs,
    // CIDR engine
    ipToInt,
    intToIp,
    parseCIDR,
    cidrToString,
    splitCIDR,
    cidrContains,
    cidrOverlap,
    ipInCIDR,
    // Compliance
    runComplianceChecks,
    invalidateComplianceCache,
    // Engines
    generateDemo
  };
  Object.assign(window, window.AppModules);
  if (!window._complianceFindings) window._complianceFindings = [];
  console.log("AWS Network Mapper modules loaded");
})();
//# sourceMappingURL=app.bundle.js.map
