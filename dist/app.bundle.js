var AppBundle = (() => {
  var __defProp = Object.defineProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };

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
  var _toastEl = null;
  var _toastTimer = null;
  function showToast(msg, duration = 3e3) {
    if (!_toastEl) {
      _toastEl = document.createElement("div");
      _toastEl.style.cssText = `
      position:fixed;bottom:60px;left:50%;transform:translateX(-50%);z-index:300;
      background:var(--accent-green);color:#000;padding:8px 20px;border-radius:6px;
      font-family:Segoe UI,system-ui,sans-serif;font-size:12px;font-weight:600;
      box-shadow:0 4px 12px rgba(0,0,0,.4);transition:opacity .3s
    `;
      document.body.appendChild(_toastEl);
    }
    clearTimeout(_toastTimer);
    _toastEl.textContent = msg;
    _toastEl.style.opacity = "1";
    _toastTimer = setTimeout(() => {
      _toastEl.style.opacity = "0";
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
    if ((network & mask) >>> 0 !== network) return null;
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
    return (c.network & p.mask) >>> 0 === p.network;
  };
  var cidrOverlap = (a, b) => {
    const pa = parseCIDR(a);
    const pb = parseCIDR(b);
    if (!pa || !pb) return false;
    const bigger = pa.prefix <= pb.prefix ? pa : pb;
    const smaller = pa.prefix <= pb.prefix ? pb : pa;
    return (smaller.network & bigger.mask) >>> 0 === bigger.network;
  };
  var ipInCIDR = (ip, cidr) => {
    const n = ipToInt(ip);
    const p = parseCIDR(cidr);
    if (n === null || !p) return false;
    return (n & p.mask) >>> 0 === p.network;
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
    "IAM-13": "CKV_AWS_56",
    // Password policy
    // Governance
    "CIS-2.1": "CKV_AWS_252",
    // CloudTrail multi-region
    "CIS-2.2": "CKV_AWS_36",
    // CloudTrail log validation
    "CIS-2.3": "CKV_AWS_35",
    // CloudTrail KMS encryption
    "CIS-2.7": "CKV_AWS_126",
    // VPC flow logs
    "GOV-KMS1": "CKV_AWS_7",
    // KMS rotation
    "GOV-ECR1": "CKV_AWS_51",
    // ECR tag immutability
    "GOV-ECR2": "CKV_AWS_163"
    // ECR scan on push
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
    const sgById = new Map((ctx.sgs || []).map((s) => [s.GroupId, s]));
    const volById = new Map((ctx.volumes || []).map((v) => [v.VolumeId, v]));
    const subById = new Map((ctx.subnets || []).map((s) => [s.SubnetId, s]));
    const vpcById = new Map((ctx.vpcs || []).map((v) => [v.VpcId, v]));
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
        const vpc = vpcById.get(vid);
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
        const sg = sgById.get(gid);
        return sg && (sg.IpPermissions || []).some((p) => p.IpProtocol === "-1" && _hasOpenCidr(p));
      });
      if (hasBroad) f.push({ severity: "CRITICAL", control: "ARCH-C1", framework: "ARCH", resource: inst.InstanceId, resourceName: gn2(inst, inst.InstanceId), message: "EC2 in public subnet with SG allowing all traffic from 0.0.0.0/0", remediation: "Restrict to specific ports; use ALB/NLB as entry point" });
    });
    (ctx.instances || []).forEach((inst) => {
      const vols = (inst.BlockDeviceMappings || []).map((b) => b.Ebs?.VolumeId).filter(Boolean);
      const unenc = vols.filter((vid) => {
        const v = volById.get(vid);
        return v && !v.Encrypted;
      });
      if (unenc.length > 0) f.push({ severity: "MEDIUM", control: "ARCH-C2", framework: "ARCH", resource: inst.InstanceId, resourceName: gn2(inst, inst.InstanceId), message: unenc.length + " unencrypted EBS volume(s)", remediation: "Enable EBS encryption by default in account settings" });
    });
    (ctx.lambdaFns || []).forEach((fn) => {
      const vc = fn.VpcConfig;
      if (!vc || !vc.SubnetIds || !vc.SubnetIds.length) return;
      const azs = new Set(vc.SubnetIds.map((sid2) => {
        const s = subById.get(sid2);
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
        const s = subById.get(n.SubnetId);
        return s ? s.AvailabilityZone : null;
      }).filter(Boolean));
      if (nats.length >= 1 && azs.size === 1 && (subByVpc[vid] || []).length > 2) {
        const vpc = vpcById.get(vid);
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
    const sgById = new Map((ctx.sgs || []).map((s) => [s.GroupId, s]));
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
        const sg = sgById.get(gid);
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
    const sgById = new Map((ctx.sgs || []).map((s) => [s.GroupId, s]));
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
        const sg = sgById.get(gid);
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
        const sg = sgById.get(gid);
        f.push({ severity: "HIGH", control: "PCI-1.3.4", framework: "PCI", resource: gid, resourceName: (sg ? sg.GroupName : "") || gid, message: "SG shared between public and private subnets \u2014 network segmentation failure", remediation: "Create separate SGs for each network tier; never share across CDE boundary" });
      }
    });
    (ctx.instances || []).forEach((inst) => {
      const hasDefault = (inst.SecurityGroups || []).some((g) => {
        const sg = sgById.get(g.GroupId);
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
  function runGovernanceChecks(ctx) {
    const f = [];
    const trails = ctx.cloudtrailTrails || [];
    const flowLogs = ctx.flowLogs || [];
    const detectors = ctx.guarddutyDetectors || [];
    const recorders = ctx.configRecorders || [];
    const rules = ctx.configRules || [];
    const shStds = ctx.securityHubStds || [];
    const analyzers = ctx.accessAnalyzers || [];
    const keys = ctx.kmsKeys || [];
    const logs = ctx.logGroups || [];
    const repos = ctx.ecrRepos || [];
    const secs = ctx.secrets || [];
    const apis = ctx.apiGateways || [];
    trails.forEach((t) => {
      if (!t.IsMultiRegionTrail)
        f.push({ severity: "CRITICAL", control: "CIS-2.1", framework: "CIS", resource: t.TrailARN || t.Name || "", resourceName: t.Name || "", message: 'CloudTrail "' + t.Name + '" is not multi-region', remediation: "Enable multi-region trail to capture all API activity across regions" });
    });
    trails.forEach((t) => {
      if (!t.LogFileValidationEnabled)
        f.push({ severity: "HIGH", control: "CIS-2.2", framework: "CIS", resource: t.TrailARN || t.Name || "", resourceName: t.Name || "", message: 'CloudTrail "' + t.Name + '" log file validation disabled', remediation: "Enable log file validation to detect tampering" });
    });
    trails.forEach((t) => {
      if (!t.KmsKeyId)
        f.push({ severity: "HIGH", control: "CIS-2.3", framework: "CIS", resource: t.TrailARN || t.Name || "", resourceName: t.Name || "", message: 'CloudTrail "' + t.Name + '" not encrypted with KMS', remediation: "Configure KMS encryption for CloudTrail logs" });
    });
    trails.forEach((t) => {
      if (!t.CloudWatchLogsLogGroupArn)
        f.push({ severity: "HIGH", control: "CIS-2.4", framework: "CIS", resource: t.TrailARN || t.Name || "", resourceName: t.Name || "", message: 'CloudTrail "' + t.Name + '" not integrated with CloudWatch Logs', remediation: "Configure CloudWatch Logs delivery for real-time alerting" });
    });
    const flVpcs = new Set(flowLogs.filter((fl) => fl.ResourceId && fl.ResourceId.startsWith("vpc-")).map((fl) => fl.ResourceId));
    (ctx.vpcs || []).forEach((v) => {
      if (!flVpcs.has(v.VpcId))
        f.push({ severity: "HIGH", control: "CIS-2.7", framework: "CIS", resource: v.VpcId, resourceName: gn(v) || v.VpcId, message: "VPC " + v.VpcId + " has no flow logs", remediation: "Enable VPC Flow Logs for traffic visibility and audit compliance" });
    });
    detectors.forEach((d) => {
      if (d.Status && d.Status !== "ENABLED")
        f.push({ severity: "HIGH", control: "GOV-GD1", framework: "GOV", resource: d.DetectorId || "", resourceName: "GuardDuty", message: "GuardDuty detector is not enabled (status: " + d.Status + ")", remediation: "Enable GuardDuty for threat detection" });
    });
    detectors.forEach((d) => {
      (d.Features || []).forEach((feat) => {
        if (feat.Status === "DISABLED")
          f.push({ severity: "MEDIUM", control: "GOV-GD2", framework: "GOV", resource: d.DetectorId || "", resourceName: "GuardDuty", message: "GuardDuty feature " + feat.Name + " is disabled", remediation: "Enable " + feat.Name + " for comprehensive threat detection" });
      });
    });
    recorders.forEach((r) => {
      const rg = r.recordingGroup || {};
      if (!rg.allSupported)
        f.push({ severity: "HIGH", control: "GOV-CFG1", framework: "GOV", resource: r.name || "", resourceName: "AWS Config", message: 'Config recorder "' + r.name + '" not recording all supported resources', remediation: "Enable all-supported resource recording in AWS Config" });
    });
    if (recorders.length > 0 && rules.length === 0)
      f.push({ severity: "MEDIUM", control: "GOV-CFG2", framework: "GOV", resource: "", resourceName: "AWS Config", message: "AWS Config recorder active but no Config rules configured", remediation: "Add AWS Config rules to evaluate resource compliance" });
    if (shStds.length === 0 && (trails.length > 0 || recorders.length > 0 || detectors.length > 0))
      f.push({ severity: "HIGH", control: "GOV-SH1", framework: "GOV", resource: "", resourceName: "Security Hub", message: "Security Hub has no enabled standards", remediation: "Enable Security Hub with AWS Foundational Security Best Practices or CIS standards" });
    if (analyzers.length > 0 && !analyzers.some((a) => a.status === "ACTIVE"))
      f.push({ severity: "MEDIUM", control: "GOV-AA1", framework: "GOV", resource: "", resourceName: "IAM Access Analyzer", message: "No active IAM Access Analyzer found", remediation: "Create an IAM Access Analyzer to identify unintended resource access" });
    keys.forEach((k) => {
      if (k.KeyManager === "CUSTOMER" && k.KeyState === "Enabled" && !k.RotationEnabled)
        f.push({ severity: "HIGH", control: "GOV-KMS1", framework: "GOV", resource: k.KeyId || k.KeyArn || "", resourceName: k.KeyId || "", message: "KMS key " + k.KeyId + " does not have automatic rotation enabled", remediation: "Enable automatic key rotation for customer-managed KMS keys" });
    });
    logs.forEach((lg) => {
      if (!lg.retentionInDays)
        f.push({ severity: "MEDIUM", control: "GOV-LOG1", framework: "GOV", resource: lg.arn || lg.logGroupName || "", resourceName: lg.logGroupName || "", message: 'Log group "' + lg.logGroupName + '" has no retention policy (logs retained indefinitely)', remediation: "Set a retention policy to control storage costs and compliance" });
    });
    repos.forEach((r) => {
      if (r.imageTagMutability === "MUTABLE")
        f.push({ severity: "MEDIUM", control: "GOV-ECR1", framework: "GOV", resource: r.repositoryArn || r.repositoryName || "", resourceName: r.repositoryName || "", message: 'ECR repo "' + r.repositoryName + '" has mutable image tags', remediation: "Enable tag immutability to prevent image overwrites" });
    });
    repos.forEach((r) => {
      const sc = r.imageScanningConfiguration || {};
      if (!sc.scanOnPush)
        f.push({ severity: "MEDIUM", control: "GOV-ECR2", framework: "GOV", resource: r.repositoryArn || r.repositoryName || "", resourceName: r.repositoryName || "", message: 'ECR repo "' + r.repositoryName + '" does not have scan-on-push enabled', remediation: "Enable scan-on-push to detect vulnerabilities in container images" });
    });
    secs.forEach((s) => {
      if (!s.RotationEnabled)
        f.push({ severity: "HIGH", control: "GOV-SEC1", framework: "GOV", resource: s.ARN || s.Name || "", resourceName: s.Name || "", message: 'Secret "' + s.Name + '" does not have rotation enabled', remediation: "Enable automatic rotation for secrets" });
    });
    apis.forEach((a) => {
      const policy = (a.endpointConfiguration || {}).securityPolicy || a.securityPolicy || "";
      if (policy !== "TLS_1_2")
        f.push({ severity: "LOW", control: "GOV-APIGW1", framework: "GOV", resource: a.id || a.name || "", resourceName: a.name || "", message: 'API Gateway "' + a.name + '" is not enforcing TLS 1.2' + (policy ? " (using " + policy + ")" : ""), remediation: "Set minimum TLS version to TLS 1.2 on API Gateway" });
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
    _complianceFindings = [...runCISChecks(ctx), ...runWAFChecks(ctx), ...runArchChecks(ctx), ...runSOC2Checks(ctx), ...runPCIDSSChecks(ctx), ...runBUDRChecks(ctx), ...runGovernanceChecks(ctx)];
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

  // src/modules/network-rules.js
  function ipToNum(ip) {
    if (!ip) return null;
    const p = ip.split(".");
    if (p.length !== 4) return null;
    return (parseInt(p[0]) << 24 | parseInt(p[1]) << 16 | parseInt(p[2]) << 8 | parseInt(p[3])) >>> 0;
  }
  function ipFromCidr(cidr) {
    if (!cidr) return null;
    return cidr.split("/")[0];
  }
  function cidrContains2(cidr, ip) {
    if (!cidr || !ip) return false;
    if (cidr === "0.0.0.0/0") return true;
    const parts = cidr.split("/");
    if (parts.length !== 2) return false;
    const mask = parseInt(parts[1], 10);
    const cidrNum = ipToNum(parts[0]);
    const ipNum = ipToNum(ip);
    if (cidrNum === null || ipNum === null) return false;
    const shift = 32 - mask;
    return cidrNum >>> shift === ipNum >>> shift;
  }
  function protoMatch(ruleProto, queryProto) {
    if (ruleProto === "-1" || ruleProto === "all") return true;
    const rp = String(ruleProto).toLowerCase();
    const qp = String(queryProto).toLowerCase();
    if (rp === qp) return true;
    if (rp === "6" && qp === "tcp") return true;
    if (rp === "17" && qp === "udp") return true;
    if (rp === "1" && qp === "icmp") return true;
    if (qp === "6" && rp === "tcp") return true;
    if (qp === "17" && rp === "udp") return true;
    return false;
  }
  function portInRange(port, from, to) {
    if (from === void 0 && to === void 0) return true;
    if (from === 0 && to === 65535) return true;
    if (from === -1 && to === -1) return true;
    const p = parseInt(port, 10);
    return p >= parseInt(from, 10) && p <= parseInt(to, 10);
  }
  function protoName(p) {
    if (p === "-1" || p === "all") return "ALL";
    if (p === "6") return "TCP";
    if (p === "17") return "UDP";
    if (p === "1") return "ICMP";
    return String(p).toUpperCase();
  }
  function evaluateRouteTable(rt, destCidr) {
    if (!rt || !rt.Routes) return { target: "local", type: "local" };
    const dest = ipFromCidr(destCidr) || destCidr;
    let bestMatch = null;
    let bestMask = -1;
    rt.Routes.forEach(function(r) {
      const rCidr = r.DestinationCidrBlock || r.DestinationIpv6CidrBlock;
      if (!rCidr) return;
      const mask = parseInt(rCidr.split("/")[1], 10) || 0;
      if (cidrContains2(rCidr, dest) && mask > bestMask) {
        bestMask = mask;
        bestMatch = r;
      }
    });
    if (!bestMatch) return { target: "blackhole", type: "blackhole", detail: "No matching route" };
    if (bestMatch.State === "blackhole") return { target: "blackhole", type: "blackhole", detail: "Route is blackholed" };
    if (bestMatch.GatewayId && bestMatch.GatewayId.startsWith("igw-")) return { target: bestMatch.GatewayId, type: "igw" };
    if (bestMatch.NatGatewayId) return { target: bestMatch.NatGatewayId, type: "nat" };
    if (bestMatch.VpcPeeringConnectionId) return { target: bestMatch.VpcPeeringConnectionId, type: "pcx" };
    if (bestMatch.TransitGatewayId) return { target: bestMatch.TransitGatewayId, type: "tgw" };
    if (bestMatch.GatewayId === "local") return { target: "local", type: "local" };
    if (bestMatch.VpcEndpointId) return { target: bestMatch.VpcEndpointId, type: "vpce" };
    if (bestMatch.GatewayId && bestMatch.GatewayId.startsWith("vgw-")) return { target: bestMatch.GatewayId, type: "vgw" };
    return { target: "local", type: "local" };
  }
  function evaluateNACL(nacl, direction, protocol, port, sourceCidr, opts) {
    if (!nacl || !nacl.Entries) return { action: "allow", rule: "Default allow (no NACL)", ruleNum: "-" };
    const entries = (nacl.Entries || []).filter(function(e2) {
      return e2.Egress === (direction === "outbound");
    }).sort(function(a, b) {
      return a.RuleNumber - b.RuleNumber;
    });
    if (entries.length === 0 && opts && opts.assumeAllow) return { action: "allow", rule: "No " + direction + " rules defined (assumed allow)", ruleNum: "-" };
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      if (e.RuleNumber === 32767) continue;
      if (!protoMatch(e.Protocol, protocol)) continue;
      var portOk = true;
      if (e.PortRange) {
        portOk = portInRange(port, e.PortRange.From, e.PortRange.To);
      }
      if (!portOk) continue;
      var cidrOk = false;
      if (e.CidrBlock) cidrOk = cidrContains2(e.CidrBlock, ipFromCidr(sourceCidr));
      if (!cidrOk && e.Ipv6CidrBlock) {
        if (e.Ipv6CidrBlock === "::/0") cidrOk = true;
        else continue;
      }
      if (!cidrOk) continue;
      var act = e.RuleAction === "allow" ? "allow" : "deny";
      var cidrLabel = e.CidrBlock || e.Ipv6CidrBlock || "";
      return { action: act, rule: "Rule #" + e.RuleNumber + " " + act.toUpperCase() + " " + protoName(e.Protocol) + " port " + (e.PortRange ? e.PortRange.From + "-" + e.PortRange.To : "all") + " from " + cidrLabel, ruleNum: e.RuleNumber };
    }
    return { action: "deny", rule: "Default deny (no matching rule)", ruleNum: "*" };
  }
  function evaluateSG(sgs, direction, protocol, port, sourceCidr, opts) {
    if (!sgs || sgs.length === 0) return { action: opts && opts.assumeAllow ? "allow" : "deny", rule: "No security groups attached", matchedSg: null };
    for (var si = 0; si < sgs.length; si++) {
      var sg = sgs[si];
      var rules = direction === "inbound" ? sg.IpPermissions || [] : sg.IpPermissionsEgress || [];
      for (var ri = 0; ri < rules.length; ri++) {
        var r = rules[ri];
        if (!protoMatch(String(r.IpProtocol), protocol)) continue;
        var portOk = true;
        if (r.FromPort !== void 0 && r.FromPort !== -1) {
          portOk = portInRange(port, r.FromPort, r.ToPort);
        }
        if (!portOk) continue;
        var cidrOk = false;
        (r.IpRanges || []).forEach(function(ipr) {
          if (cidrContains2(ipr.CidrIp, ipFromCidr(sourceCidr))) cidrOk = true;
        });
        (r.Ipv6Ranges || []).forEach(function(ipr) {
          if (ipr.CidrIpv6 === "::/0") cidrOk = true;
        });
        if (!cidrOk && (r.UserIdGroupPairs || []).length > 0) {
          var srcSgIds = opts && opts.sourceSgIds;
          if (srcSgIds) {
            (r.UserIdGroupPairs || []).forEach(function(gp) {
              if (gp.GroupId && srcSgIds.indexOf(gp.GroupId) !== -1) cidrOk = true;
            });
          } else {
            (r.UserIdGroupPairs || []).forEach(function(gp) {
              if (gp.GroupId) cidrOk = true;
            });
          }
        }
        if (cidrOk) {
          var desc = sg.GroupName + ": " + protoName(String(r.IpProtocol)) + " port " + (r.FromPort !== -1 && r.FromPort !== void 0 ? r.FromPort + "-" + r.ToPort : "all");
          return { action: "allow", rule: desc, matchedSg: sg.GroupId || sg.GroupName };
        }
      }
    }
    return { action: "deny", rule: "No matching SG rule for " + protocol + "/" + port, matchedSg: null };
  }

  // src/modules/state.js
  var state_exports = {};
  __export(state_exports, {
    complianceFindings: () => complianceFindings,
    detailLevel: () => detailLevel,
    gTxtScale: () => gTxtScale,
    gwNames: () => gwNames,
    mapG: () => mapG,
    mapSvg: () => mapSvg,
    mapZoom: () => mapZoom,
    rlCtx: () => rlCtx,
    sb: () => sb,
    setComplianceFindings: () => setComplianceFindings,
    setDetailLevel: () => setDetailLevel,
    setGTxtScale: () => setGTxtScale,
    setGwNames: () => setGwNames,
    setMapG: () => setMapG,
    setMapSvg: () => setMapSvg,
    setMapZoom: () => setMapZoom,
    setRlCtx: () => setRlCtx,
    setSb: () => setSb,
    setShowNested: () => setShowNested,
    showNested: () => showNested
  });
  var rlCtx = null;
  var mapSvg = null;
  var mapZoom = null;
  var mapG = null;
  var gwNames = {};
  var detailLevel = 0;
  var showNested = false;
  var gTxtScale = 1;
  var complianceFindings = [];
  var sb = null;
  function setRlCtx(v) {
    rlCtx = v;
  }
  function setMapSvg(v) {
    mapSvg = v;
  }
  function setMapZoom(v) {
    mapZoom = v;
  }
  function setMapG(v) {
    mapG = v;
  }
  function setGwNames(v) {
    gwNames = v;
  }
  function setDetailLevel(v) {
    detailLevel = v;
  }
  function setShowNested(v) {
    showNested = v;
  }
  function setGTxtScale(v) {
    gTxtScale = v;
  }
  function setComplianceFindings(v) {
    complianceFindings = v;
  }
  function setSb(v) {
    sb = v;
  }

  // src/modules/dom-builders.js
  function buildEl(tag, attrs = {}, children = []) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") el.className = v;
      else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
      else if (k.startsWith("data-")) el.setAttribute(k, v);
      else el[k] = v;
    }
    for (const child of children) {
      if (typeof child === "string") el.appendChild(document.createTextNode(child));
      else if (child instanceof Node) el.appendChild(child);
    }
    return el;
  }
  function buildOption(value, text, selected = false) {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = text;
    if (selected) opt.selected = true;
    return opt;
  }
  function buildSelect(id, options) {
    const sel = document.createElement("select");
    if (id) sel.id = id;
    for (const o of options) sel.appendChild(buildOption(o.value, o.text));
    return sel;
  }
  function buildButton(text, onClick, className) {
    const btn = document.createElement("button");
    btn.textContent = text;
    if (onClick) btn.addEventListener("click", onClick);
    if (className) btn.className = className;
    return btn;
  }
  function setText(el, text) {
    const target = typeof el === "string" ? document.getElementById(el) : el;
    if (target) target.textContent = String(text);
  }
  function replaceChildren(el, children = []) {
    el.textContent = "";
    for (const child of children) el.appendChild(child);
  }
  function safeHtml(strings, ...values) {
    let result = strings[0];
    for (let i = 0; i < values.length; i++) {
      result += esc(String(values[i] ?? "")) + strings[i + 1];
    }
    return result;
  }

  // src/modules/budr-engine.js
  function _getClassificationData() {
    return window._classificationData || [];
  }
  function _runClassificationEngine(ctx) {
    if (typeof window.runClassificationEngine === "function") window.runClassificationEngine(ctx);
  }
  var _BUDR_STRATEGY = { hot: "Hot", warm: "Warm", pilot: "Pilot Light", cold: "Cold" };
  var _BUDR_STRATEGY_ORDER = { hot: 0, warm: 1, pilot: 2, cold: 3 };
  var _BUDR_STRATEGY_LEGEND = [
    { k: "critical", label: "Critical (Hot)", color: "#ef4444", icon: "\u{1F534}", desc: "Active-active \u2014 full replica running at all times. Near-zero RTO & RPO." },
    { k: "high", label: "High (Warm)", color: "#f59e0b", icon: "\u{1F7E1}", desc: "Scaled-down replica running. Scale up on failover. Minutes to recover." },
    { k: "medium", label: "Medium (Pilot Light)", color: "#6366f1", icon: "\u{1F7E3}", desc: "Data replicated continuously, compute stopped. Spin up on failover. ~10-30 min." },
    { k: "low", label: "Low (Cold)", color: "#64748b", icon: "\u26AA", desc: "Backups only, no standby. Rebuild from scratch. Hours to recover." }
  ];
  var _BUDR_RTO_RPO = {
    rds_multi_az: { rto: "~5 min", rpo: "~1 min", tier: "protected", strategy: "warm" },
    rds_single_backup: { rto: "~30 min", rpo: "~24 hr", tier: "partial", strategy: "pilot" },
    rds_no_backup: { rto: "~8 hr", rpo: "total loss", tier: "at_risk", strategy: "cold" },
    rds_aurora: { rto: "<30 sec", rpo: "~5 min (PITR)", tier: "protected", strategy: "hot" },
    ec2_asg: { rto: "~3 min", rpo: "0 (stateless)", tier: "protected", strategy: "warm" },
    ec2_ami_snap: { rto: "~15 min", rpo: "~7 days", tier: "partial", strategy: "pilot" },
    ec2_standalone: { rto: "~8 hr", rpo: "total loss", tier: "at_risk", strategy: "cold" },
    ecs_multi: { rto: "~1 min", rpo: "0 (stateless)", tier: "protected", strategy: "hot" },
    ecs_single: { rto: "~5 min", rpo: "0 (stateless)", tier: "partial", strategy: "warm" },
    lambda: { rto: "0 (managed)", rpo: "0 (stateless)", tier: "protected", strategy: "hot" },
    ecache_multi: { rto: "~2 min", rpo: "~seconds", tier: "protected", strategy: "warm" },
    ecache_single: { rto: "~15 min", rpo: "~7 days", tier: "partial", strategy: "pilot" },
    ecache_no_snap: { rto: "~15 min", rpo: "total loss", tier: "at_risk", strategy: "cold" },
    redshift_snap: { rto: "~30 min", rpo: "~8 hr", tier: "partial", strategy: "pilot" },
    redshift_multi: { rto: "~15 min", rpo: "~5 min", tier: "protected", strategy: "warm" },
    redshift_none: { rto: "~8 hr", rpo: "total loss", tier: "at_risk", strategy: "cold" },
    alb_multi_az: { rto: "0 (managed)", rpo: "N/A", tier: "protected", strategy: "hot" },
    alb_single_az: { rto: "~5 min", rpo: "N/A", tier: "partial", strategy: "warm" },
    s3: { rto: "0 (managed)", rpo: "0 (durable)", tier: "protected", strategy: "hot" },
    s3_versioned: { rto: "0 (managed)", rpo: "0 (versioned)", tier: "protected", strategy: "hot" },
    s3_unversioned: { rto: "0 (managed)", rpo: "total loss", tier: "at_risk", strategy: "cold" },
    s3_mfa_delete: { rto: "0 (managed)", rpo: "0 (immutable)", tier: "protected", strategy: "hot" },
    ebs_snap: { rto: "~15 min", rpo: "~7 days", tier: "partial", strategy: "pilot" },
    ebs_no_snap: { rto: "~8 hr", rpo: "total loss", tier: "at_risk", strategy: "cold" }
  };
  var _BUDR_EST_MINUTES = {
    rds_multi_az: { rto: 5, rpo: 1, rtoWhy: "Multi-AZ automatic failover completes in 1-2 min; DNS propagation adds ~3 min", rpoWhy: "Synchronous replication to standby \u2014 data loss limited to in-flight transactions (~seconds)" },
    rds_single_backup: { rto: 30, rpo: 1440, rtoWhy: "Restore from automated snapshot requires instance provisioning + data load (~20-30 min)", rpoWhy: "Automated backups run daily \u2014 worst case RPO is 24 hours since last backup window" },
    rds_no_backup: { rto: 480, rpo: Infinity, rtoWhy: "No backups \u2014 requires manual rebuild from application layer or external source", rpoWhy: "No backup mechanism configured \u2014 all data since creation is unrecoverable" },
    rds_aurora: { rto: 0.5, rpo: 5, rtoWhy: "Aurora automatic failover promotes read replica in <30 sec; DNS TTL is 5 sec", rpoWhy: "Aurora replicates 6 copies across 3 AZs \u2014 RPO limited to last committed transaction (~seconds)" },
    ec2_asg: { rto: 3, rpo: 0, rtoWhy: "ASG detects failure via health check (1-2 min) and launches replacement from AMI (~1-2 min)", rpoWhy: "Stateless compute \u2014 no persistent data on instance; state lives in external stores" },
    ec2_ami_snap: { rto: 15, rpo: 10080, rtoWhy: "Manual AMI launch + EBS restore from snapshot (~10-15 min depending on volume size)", rpoWhy: "Snapshot frequency is typically weekly \u2014 worst case RPO is 7 days since last snapshot" },
    ec2_standalone: { rto: 480, rpo: Infinity, rtoWhy: "No AMI/snapshot \u2014 requires full OS install, config, and application deployment from scratch", rpoWhy: "No backup mechanism \u2014 local EBS data is unrecoverable if instance or volume is lost" },
    ecs_multi: { rto: 1, rpo: 0, rtoWhy: "ECS service scheduler replaces failed tasks in ~30-60 sec from container image", rpoWhy: "Stateless containers \u2014 no persistent data; state lives in external stores (RDS, S3, etc.)" },
    ecs_single: { rto: 5, rpo: 0, rtoWhy: "Single task replacement takes ~2-5 min including image pull and health check", rpoWhy: "Stateless containers \u2014 no persistent data; state lives in external stores" },
    lambda: { rto: 0, rpo: 0, rtoWhy: "Fully managed \u2014 AWS handles all availability; cold start adds <1 sec latency", rpoWhy: "Stateless execution \u2014 no persistent data; code stored in S3 with versioning" },
    ecache_multi: { rto: 2, rpo: 0.1, rtoWhy: "Multi-AZ auto-failover promotes replica in 1-2 min; DNS endpoint updates automatically", rpoWhy: "Async replication lag is typically <100ms \u2014 data loss limited to replication lag" },
    ecache_single: { rto: 15, rpo: 10080, rtoWhy: "Restore from snapshot requires new cluster provisioning + data load (~10-15 min)", rpoWhy: "Snapshot frequency is typically daily/weekly \u2014 worst case RPO equals snapshot interval" },
    ecache_no_snap: { rto: 15, rpo: Infinity, rtoWhy: "New cluster provisioning takes ~10-15 min but cache starts cold (empty)", rpoWhy: "No snapshots \u2014 entire cache contents are lost; must be rebuilt from source of truth" },
    redshift_snap: { rto: 30, rpo: 1440, rtoWhy: "Restore from snapshot creates new cluster (~20-30 min depending on data size)", rpoWhy: "Automated snapshots run every 8 hours by default \u2014 worst case RPO is snapshot interval" },
    redshift_multi: { rto: 15, rpo: 5, rtoWhy: "Multi-node cluster redistributes work to surviving nodes (~10-15 min recovery)", rpoWhy: "Synchronous replication across nodes \u2014 RPO limited to in-flight queries (~minutes)" },
    redshift_none: { rto: 480, rpo: Infinity, rtoWhy: "No snapshots \u2014 requires full data reload from S3/source systems (hours to days)", rpoWhy: "No backup mechanism \u2014 all warehouse data is unrecoverable" },
    alb_multi_az: { rto: 0, rpo: 0, rtoWhy: "Fully managed multi-AZ \u2014 AWS handles node replacement transparently", rpoWhy: "Stateless load balancer \u2014 no data to lose; config stored in AWS control plane" },
    alb_single_az: { rto: 5, rpo: 0, rtoWhy: "Single-AZ ALB may need DNS failover if AZ goes down (~3-5 min)", rpoWhy: "Stateless load balancer \u2014 no data to lose" },
    s3: { rto: 0, rpo: 0, rtoWhy: "11 nines durability \u2014 service is always available across 3+ AZs", rpoWhy: "Objects replicated across multiple AZs automatically" },
    s3_versioned: { rto: 0, rpo: 0, rtoWhy: "Versioned objects can be restored to any previous version instantly", rpoWhy: "Every object change creates a new version \u2014 zero data loss possible" },
    s3_unversioned: { rto: 0, rpo: Infinity, rtoWhy: "Bucket is always available, but deleted/overwritten objects cannot be recovered", rpoWhy: "No versioning \u2014 overwrites and deletes are permanent and unrecoverable" },
    s3_mfa_delete: { rto: 0, rpo: 0, rtoWhy: "MFA Delete prevents accidental deletion \u2014 objects recoverable from versions", rpoWhy: "Versioning + MFA Delete = immutable storage; data cannot be accidentally lost" },
    ebs_snap: { rto: 15, rpo: 10080, rtoWhy: "Create new volume from snapshot + attach to instance (~10-15 min)", rpoWhy: "Snapshot frequency is typically weekly \u2014 worst case RPO is 7 days since last snapshot" },
    ebs_no_snap: { rto: 480, rpo: Infinity, rtoWhy: "No snapshots \u2014 volume data is unrecoverable if volume fails (rare but possible)", rpoWhy: "No backup mechanism \u2014 all volume data is permanently lost on failure" }
  };
  var _TIER_TARGETS = {
    critical: { rto: 240, rpo: 60, rtoLabel: "2-4 hours", rpoLabel: "Hourly" },
    high: { rto: 480, rpo: 360, rtoLabel: "4-8 hours", rpoLabel: "6 hours" },
    medium: { rto: 720, rpo: 1440, rtoLabel: "12 hours", rpoLabel: "Daily" },
    low: { rto: 1440, rpo: 10080, rtoLabel: "24 hours", rpoLabel: "Weekly" }
  };
  function _budrTierCompliance(profileKey, classTier) {
    if (!profileKey || !classTier) return { status: "unknown", issues: [] };
    var est = _BUDR_EST_MINUTES[profileKey];
    var target = _TIER_TARGETS[classTier];
    if (!est || !target) return { status: "unknown", issues: [] };
    var issues = [];
    if (est.rpo === Infinity) issues.push({ field: "RPO", severity: "critical", msg: "No backup \u2014 RPO unrecoverable (target: " + target.rpoLabel + ")" });
    else if (est.rpo > target.rpo) issues.push({ field: "RPO", severity: "warning", msg: "Est. RPO ~" + _fmtMin(est.rpo) + " exceeds " + classTier + " target of " + target.rpoLabel });
    if (est.rto > target.rto) issues.push({ field: "RTO", severity: "warning", msg: "Est. RTO ~" + _fmtMin(est.rto) + " exceeds " + classTier + " target of " + target.rtoLabel });
    var status = issues.some(function(i) {
      return i.severity === "critical";
    }) ? "fail" : issues.length ? "warn" : "pass";
    return { status, issues, estRto: est.rto, estRpo: est.rpo, targetRto: target.rto, targetRpo: target.rpo, rtoWhy: est.rtoWhy || "", rpoWhy: est.rpoWhy || "" };
  }
  function _fmtMin(m) {
    if (m === 0) return "0";
    if (m === Infinity) return "\u221E";
    if (m < 60) return Math.round(m) + " min";
    if (m < 1440) return Math.round(m / 60 * 10) / 10 + " hr";
    return Math.round(m / 1440 * 10) / 10 + " days";
  }
  var budrFindings = [];
  var budrAssessments = [];
  var budrOverrides = {};
  function setBudrFindings(v) {
    budrFindings = v;
  }
  function setBudrAssessments(v) {
    budrAssessments = v;
  }
  function setBudrOverrides(v) {
    budrOverrides = v;
  }
  function runBUDRChecks2(ctx) {
    const f = [];
    const assessments = [];
    const gn2 = (o, id) => {
      const t = o.Tags || o.tags || [];
      const n = t.find((t2) => t2.Key === "Name");
      return n ? n.Value : id;
    };
    (ctx.rdsInstances || []).forEach((db) => {
      if (db.ReadReplicaSourceDBInstanceIdentifier) return;
      const id = db.DBInstanceIdentifier;
      const name = id;
      const hasMultiAZ = !!db.MultiAZ;
      const hasBackup = (db.BackupRetentionPeriod || 0) > 0;
      const encrypted = !!db.StorageEncrypted;
      const isMicro = (db.DBInstanceClass || "").includes(".micro");
      const hasPITR = !!db.LatestRestorableTime;
      const isAurora = (db.Engine || "").startsWith("aurora");
      let profile, sev;
      if (hasMultiAZ && hasBackup) {
        profile = _BUDR_RTO_RPO.rds_multi_az;
        sev = null;
      } else if (hasBackup) {
        profile = _BUDR_RTO_RPO.rds_single_backup;
        sev = isMicro ? null : "MEDIUM";
        f.push({ severity: "MEDIUM", control: "BUDR-HA-1", framework: "BUDR", resource: id, resourceName: name, message: "RDS not Multi-AZ \u2014 single point of failure", remediation: "Enable Multi-AZ for automatic failover" });
      } else {
        profile = _BUDR_RTO_RPO.rds_no_backup;
        sev = "CRITICAL";
        f.push({ severity: "CRITICAL", control: "BUDR-BAK-1", framework: "BUDR", resource: id, resourceName: name, message: "RDS has no automated backups (retention=0)", remediation: "Set BackupRetentionPeriod to at least 7 days" });
      }
      if (isAurora && hasBackup) {
        profile = _BUDR_RTO_RPO.rds_aurora;
      }
      if (!hasMultiAZ && !isMicro && hasBackup)
        f.push({ severity: "HIGH", control: "BUDR-DR-1", framework: "BUDR", resource: id, resourceName: name, message: "RDS single-AZ with backups only \u2014 extended RTO on AZ failure", remediation: "Enable Multi-AZ or create cross-region read replica" });
      if (!db.DeletionProtection && !isMicro)
        f.push({ severity: "MEDIUM", control: "BUDR-DEL-1", framework: "BUDR", resource: id, resourceName: name, message: "RDS deletion protection disabled", remediation: "Enable DeletionProtection to prevent accidental deletion" });
      assessments.push({ type: "RDS", id, name, profile, signals: { MultiAZ: hasMultiAZ, Backup: hasBackup, Encrypted: encrypted, DeletionProtection: !!db.DeletionProtection, ReadReplicas: (db.ReadReplicaDBInstanceIdentifiers || []).length, PITR: hasPITR } });
    });
    const asgInstIds = /* @__PURE__ */ new Set();
    (ctx.instances || []).forEach((inst) => {
      const asgTag = (inst.Tags || []).find((t) => t.Key === "aws:autoscaling:groupName");
      if (asgTag && asgTag.Value) asgInstIds.add(inst.InstanceId);
    });
    (ctx.instances || []).forEach((inst) => {
      const id = inst.InstanceId;
      const name = gn2(inst, id);
      const inASG = asgInstIds.has(id);
      const vols = (inst.BlockDeviceMappings || []).map((b) => b.Ebs?.VolumeId).filter(Boolean);
      const hasSnaps = vols.some((vid) => {
        const s = (ctx.snapByVol || {})[vid];
        return s && s.length > 0;
      });
      let newestSnap = null;
      vols.forEach((vid) => {
        const ss = (ctx.snapByVol || {})[vid] || [];
        ss.forEach((s) => {
          const d = new Date(s.StartTime);
          if (!newestSnap || d > newestSnap) newestSnap = d;
        });
      });
      const snapAgeDays = newestSnap ? Math.floor((Date.now() - newestSnap.getTime()) / 864e5) : null;
      if (hasSnaps && snapAgeDays !== null && snapAgeDays > 7) {
        f.push({ severity: "MEDIUM", control: "BUDR-AGE-1", framework: "BUDR", resource: id, resourceName: name, message: "Newest EBS snapshot is " + snapAgeDays + " days old (>7 days)", remediation: "Configure AWS Backup or DLM to take snapshots at least weekly" });
      }
      const encrypted = vols.some((vid) => {
        const vs = (ctx.volumes || []).filter((v) => v.VolumeId === vid);
        return vs.length && vs[0].Encrypted;
      });
      let profile;
      if (inASG) {
        profile = _BUDR_RTO_RPO.ec2_asg;
      } else if (hasSnaps) {
        profile = _BUDR_RTO_RPO.ec2_ami_snap;
        f.push({ severity: "LOW", control: "BUDR-HA-2", framework: "BUDR", resource: id, resourceName: name, message: "EC2 not in Auto Scaling group \u2014 manual recovery required", remediation: "Place behind ASG or create AMI + launch template for quick recovery" });
      } else {
        profile = _BUDR_RTO_RPO.ec2_standalone;
        f.push({ severity: "HIGH", control: "BUDR-BAK-2", framework: "BUDR", resource: id, resourceName: name, message: "EC2 standalone with no EBS snapshots \u2014 unrecoverable on failure", remediation: "Create regular EBS snapshots via AWS Backup or DLM; consider ASG" });
        if (!inASG) f.push({ severity: "MEDIUM", control: "BUDR-DR-2", framework: "BUDR", resource: id, resourceName: name, message: "EC2 has no disaster recovery strategy", remediation: "Create AMI, configure ASG with multi-AZ, or use EBS snapshots" });
      }
      assessments.push({ type: "EC2", id, name, profile, signals: { ASG: inASG, Snapshots: hasSnaps, SnapAgeDays: snapAgeDays, Encrypted: encrypted } });
    });
    (ctx.ecsServices || []).forEach((svc) => {
      const id = svc.serviceName || svc.serviceArn;
      const name = svc.serviceName || id;
      const desired = svc.desiredCount || 0;
      const multi = desired > 1;
      let profile;
      if (multi) {
        profile = _BUDR_RTO_RPO.ecs_multi;
      } else {
        profile = _BUDR_RTO_RPO.ecs_single;
        f.push({ severity: "LOW", control: "BUDR-HA-3", framework: "BUDR", resource: id, resourceName: name, message: "ECS service has desiredCount=" + desired + " \u2014 no redundancy", remediation: "Set desiredCount \u2265 2 across multiple AZs" });
      }
      assessments.push({ type: "ECS", id, name, profile, signals: { DesiredCount: desired, MultiTask: multi } });
    });
    (ctx.lambdaFns || []).forEach((fn) => {
      assessments.push({ type: "Lambda", id: fn.FunctionName, name: fn.FunctionName, profile: _BUDR_RTO_RPO.lambda, signals: { Managed: true } });
    });
    (ctx.ecacheClusters || []).forEach((ec) => {
      const id = ec.CacheClusterId;
      const name = id;
      const multiNode = (ec.NumCacheNodes || 1) > 1;
      const hasSnap = !!(ec.SnapshotWindow || ec.SnapshotRetentionLimit);
      const autoFailover = ec.AutomaticFailover === "enabled";
      let profile;
      if (multiNode) {
        profile = _BUDR_RTO_RPO.ecache_multi;
      } else if (hasSnap) {
        profile = _BUDR_RTO_RPO.ecache_single;
        f.push({ severity: "MEDIUM", control: "BUDR-HA-4", framework: "BUDR", resource: id, resourceName: name, message: "ElastiCache single node \u2014 failover requires manual intervention", remediation: "Add replicas or enable cluster mode for automatic failover" });
      } else {
        profile = _BUDR_RTO_RPO.ecache_no_snap;
        f.push({ severity: "HIGH", control: "BUDR-BAK-3", framework: "BUDR", resource: id, resourceName: name, message: "ElastiCache single node with no snapshots \u2014 data loss risk", remediation: "Enable automatic snapshots and add read replicas" });
      }
      assessments.push({ type: "ElastiCache", id, name, profile, signals: { MultiNode: multiNode, Snapshots: hasSnap, AutoFailover: autoFailover } });
    });
    (ctx.redshiftClusters || []).forEach((rs) => {
      const id = rs.ClusterIdentifier;
      const name = id;
      const multiNode = (rs.NumberOfNodes || 1) > 1;
      const hasSnap = (rs.AutomatedSnapshotRetentionPeriod || 0) > 0;
      let profile;
      if (multiNode && hasSnap) {
        profile = _BUDR_RTO_RPO.redshift_multi;
      } else if (hasSnap) {
        profile = _BUDR_RTO_RPO.redshift_snap;
        f.push({ severity: "MEDIUM", control: "BUDR-HA-5", framework: "BUDR", resource: id, resourceName: name, message: "Redshift single-node cluster \u2014 no compute redundancy", remediation: "Resize to multi-node cluster for HA" });
      } else {
        profile = _BUDR_RTO_RPO.redshift_none;
        f.push({ severity: "HIGH", control: "BUDR-BAK-4", framework: "BUDR", resource: id, resourceName: name, message: "Redshift with no automated snapshots \u2014 data loss risk", remediation: "Enable automated snapshots with \u22657 day retention" });
      }
      assessments.push({ type: "Redshift", id, name, profile, signals: { MultiNode: multiNode, Snapshots: hasSnap } });
    });
    (ctx.albs || []).forEach((alb) => {
      const id = alb.LoadBalancerName || alb.LoadBalancerArn;
      const name = alb.LoadBalancerName || id;
      const azs = (alb.AvailabilityZones || []).length;
      let profile;
      if (azs >= 2) {
        profile = _BUDR_RTO_RPO.alb_multi_az;
      } else {
        profile = _BUDR_RTO_RPO.alb_single_az;
        f.push({ severity: "MEDIUM", control: "BUDR-HA-6", framework: "BUDR", resource: id, resourceName: name, message: "ALB in single AZ only \u2014 no failover", remediation: "Register subnets in at least 2 AZs" });
      }
      assessments.push({ type: "ALB", id, name, profile, signals: { AZCount: azs } });
    });
    (ctx.volumes || []).forEach((vol) => {
      if (vol.State !== "in-use") return;
      const id = vol.VolumeId;
      const name = gn2(vol, id);
      const snaps = (ctx.snapByVol || {})[id] || [];
      if (snaps.length === 0) {
        f.push({ severity: "MEDIUM", control: "BUDR-BAK-5", framework: "BUDR", resource: id, resourceName: name, message: "In-use EBS volume has no snapshots", remediation: "Create snapshot schedule via AWS Backup or DLM lifecycle policy" });
      }
    });
    (ctx.s3bk || []).forEach((bk) => {
      const id = bk.Name || "unknown";
      const name = id;
      const versioned = bk.Versioning && bk.Versioning.Status === "Enabled";
      const mfaDel = bk.Versioning && bk.Versioning.MFADelete === "Enabled";
      let profile;
      if (mfaDel) {
        profile = _BUDR_RTO_RPO.s3_mfa_delete;
      } else if (versioned) {
        profile = _BUDR_RTO_RPO.s3_versioned;
      } else {
        profile = _BUDR_RTO_RPO.s3_unversioned;
        f.push({ severity: "HIGH", control: "BUDR-S3-1", framework: "BUDR", resource: id, resourceName: name, message: "S3 bucket has no versioning \u2014 data loss risk", remediation: "Enable versioning to protect against accidental deletes and overwrites" });
      }
      assessments.push({ type: "S3", id, name, profile, signals: { Versioned: versioned, MFADelete: mfaDel } });
    });
    var _budrLookup = {};
    var _bSubVpc = {};
    (ctx.subnets || []).forEach(function(s) {
      if (s.SubnetId) _bSubVpc[s.SubnetId] = s.VpcId || "";
    });
    (ctx.rdsInstances || []).forEach(function(r) {
      _budrLookup["RDS:" + r.DBInstanceIdentifier] = { a: r._accountId || "", r: r._region || "", v: r.DBSubnetGroup && r.DBSubnetGroup.VpcId || "" };
    });
    (ctx.instances || []).forEach(function(r) {
      _budrLookup["EC2:" + r.InstanceId] = { a: r._accountId || "", r: r._region || "", v: r.VpcId || _bSubVpc[r.SubnetId] || "" };
    });
    (ctx.ecsServices || []).forEach(function(r) {
      var nc = r.networkConfiguration && r.networkConfiguration.awsvpcConfiguration;
      var sid2 = nc && nc.subnets && nc.subnets[0] ? nc.subnets[0] : "";
      _budrLookup["ECS:" + (r.serviceName || r.serviceArn)] = { a: r._accountId || "", r: r._region || "", v: sid2 ? _bSubVpc[sid2] || "" : "" };
    });
    (ctx.lambdaFns || []).forEach(function(r) {
      _budrLookup["Lambda:" + r.FunctionName] = { a: r._accountId || "", r: r._region || "", v: r.VpcConfig && r.VpcConfig.VpcId || "" };
    });
    (ctx.ecacheClusters || []).forEach(function(r) {
      _budrLookup["ElastiCache:" + r.CacheClusterId] = { a: r._accountId || "", r: r._region || "", v: r.VpcId || "" };
    });
    (ctx.redshiftClusters || []).forEach(function(r) {
      _budrLookup["Redshift:" + r.ClusterIdentifier] = { a: r._accountId || "", r: r._region || "", v: r.VpcId || "" };
    });
    (ctx.albs || []).forEach(function(r) {
      _budrLookup["ALB:" + (r.LoadBalancerName || r.LoadBalancerArn)] = { a: r._accountId || "", r: r._region || "", v: r.VpcId || "" };
    });
    (ctx.s3bk || []).forEach(function(r) {
      _budrLookup["S3:" + r.Name] = { a: r._accountId || "", r: r._region || "", v: "" };
    });
    (ctx.volumes || []).forEach(function(r) {
      _budrLookup["EBS:" + r.VolumeId] = { a: r._accountId || "", r: r._region || "", v: "" };
    });
    (ctx.snapshots || []).forEach(function(r) {
      _budrLookup["Snapshot:" + r.SnapshotId] = { a: r._accountId || "", r: r._region || "", v: "" };
    });
    assessments.forEach(function(a) {
      var info = _budrLookup[a.type + ":" + a.id];
      if (info) {
        a.account = info.a;
        a.region = info.r;
        a.vpcId = info.v;
      }
    });
    var _bAccts = /* @__PURE__ */ new Set();
    (ctx.vpcs || []).forEach(function(v) {
      if (v._accountId && v._accountId !== "default") _bAccts.add(v._accountId);
    });
    if (_bAccts.size >= 1) {
      var _bPri = [..._bAccts][0];
      assessments.forEach(function(a) {
        if (!a.account) a.account = _bPri;
      });
    }
    var _bResLookup = {};
    Object.keys(_budrLookup).forEach(function(k) {
      var id = k.split(":").slice(1).join(":");
      _bResLookup[id] = _budrLookup[k];
    });
    f.forEach(function(finding) {
      var info = _bResLookup[finding.resource];
      if (info) {
        finding._accountId = info.a;
        finding._region = info.r;
        finding._vpcId = info.v;
      }
    });
    if (_bAccts.size >= 1) {
      var _bPri2 = [..._bAccts][0];
      f.forEach(function(finding) {
        if (!finding._accountId) finding._accountId = _bPri2;
      });
    }
    ;
    budrFindings = f;
    budrAssessments = assessments;
    _enrichBudrWithClassification(ctx, f);
    return f;
  }
  function _enrichBudrWithClassification(ctx, findings) {
    var classData = _getClassificationData();
    if (!classData.length && ctx) _runClassificationEngine(ctx);
    classData = _getClassificationData();
    var classMap = {};
    var classMapTyped = {};
    classData.forEach(function(c) {
      classMap[c.id] = c;
      classMap[c.name] = c;
      classMapTyped[c.type + "|" + c.id] = c;
      classMapTyped[c.type + "|" + c.name] = c;
    });
    budrAssessments.forEach(function(a) {
      var cls = classMapTyped[a.type + "|" + a.id] || classMapTyped[a.type + "|" + a.name] || classMap[a.id] || classMap[a.name];
      a.classTier = cls ? cls.tier : "low";
      a.classVpcName = cls ? cls.vpcName : "";
      var profileKey = null;
      for (var k in _BUDR_RTO_RPO) {
        if (_BUDR_RTO_RPO[k] === a.profile) {
          profileKey = k;
          break;
        }
      }
      a.profileKey = profileKey;
      a.compliance = _budrTierCompliance(profileKey, a.classTier);
      if (a.compliance.issues.length > 0) {
        a.compliance.issues.forEach(function(issue) {
          var sev = issue.severity === "critical" ? "CRITICAL" : "HIGH";
          findings.push({
            severity: sev,
            control: "BUDR-TIER-" + issue.field,
            framework: "BUDR",
            resource: a.id,
            resourceName: a.name,
            message: issue.msg + " [" + a.classTier + " tier]",
            remediation: issue.field === "RPO" ? "Configure automated backups to meet " + a.classTier + " RPO target" : "Improve HA/DR strategy to meet " + a.classTier + " RTO target"
          });
        });
      }
      var ov = budrOverrides[a.id];
      if (ov) {
        a.overridden = true;
        a.autoProfile = { strategy: a.profile.strategy, rto: a.profile.rto, rpo: a.profile.rpo, tier: a.profile.tier };
        if (ov.strategy) {
          a.profile = Object.assign({}, a.profile);
          var sm = { critical: "hot", high: "warm", medium: "pilot", low: "cold" };
          var tm = { critical: "protected", high: "protected", medium: "partial", low: "at_risk" };
          a.profile.strategy = sm[ov.strategy] || ov.strategy;
          a.profile.tier = tm[ov.strategy] || a.profile.tier;
        }
        if (ov.rto) a.profile.rto = ov.rto;
        if (ov.rpo) a.profile.rpo = ov.rpo;
      }
    });
  }
  function _reapplyBUDROverrides() {
    budrAssessments.forEach(function(a) {
      if (a.autoProfile) {
        a.profile = Object.assign({}, a.profile);
        a.profile.strategy = a.autoProfile.strategy;
        a.profile.rto = a.autoProfile.rto;
        a.profile.rpo = a.autoProfile.rpo;
        a.profile.tier = a.autoProfile.tier;
        a.overridden = false;
      }
      var ov = budrOverrides[a.id];
      if (ov) {
        a.overridden = true;
        if (!a.autoProfile) a.autoProfile = { strategy: a.profile.strategy, rto: a.profile.rto, rpo: a.profile.rpo, tier: a.profile.tier };
        a.profile = Object.assign({}, a.profile);
        if (ov.strategy) {
          var sm = { critical: "hot", high: "warm", medium: "pilot", low: "cold" };
          var tm = { critical: "protected", high: "protected", medium: "partial", low: "at_risk" };
          a.profile.strategy = sm[ov.strategy] || ov.strategy;
          a.profile.tier = tm[ov.strategy] || a.profile.tier;
        }
        if (ov.rto) a.profile.rto = ov.rto;
        if (ov.rpo) a.profile.rpo = ov.rpo;
      }
    });
  }
  function _getBUDRTierCounts() {
    const counts = { protected: 0, partial: 0, at_risk: 0 };
    budrAssessments.forEach((a) => {
      if (a.profile) counts[a.profile.tier] = (counts[a.profile.tier] || 0) + 1;
    });
    return counts;
  }
  function _getBudrComplianceCounts() {
    var counts = { pass: 0, warn: 0, fail: 0, unknown: 0 };
    budrAssessments.forEach(function(a) {
      var s = a.compliance ? a.compliance.status : "unknown";
      counts[s] = (counts[s] || 0) + 1;
    });
    return counts;
  }

  // src/modules/dep-graph.js
  var depGraph = null;
  var blastActive = false;
  function buildDependencyGraph(ctx) {
    if (!ctx) return {};
    const g = {};
    const addEdge = (from, to, rel, strength) => {
      if (!g[from]) g[from] = [];
      g[from].push({ id: to, rel, strength });
    };
    (ctx.vpcs || []).forEach((v) => {
      (ctx.subnets || []).filter((s) => s.VpcId === v.VpcId).forEach((s) => addEdge(v.VpcId, s.SubnetId, "contains", "hard"));
      (ctx.igws || []).forEach((ig) => {
        if ((ig.Attachments || []).some((a) => a.VpcId === v.VpcId)) addEdge(v.VpcId, ig.InternetGatewayId, "attached", "hard");
      });
      (ctx.nats || []).filter((n) => n.VpcId === v.VpcId).forEach((n) => addEdge(v.VpcId, n.NatGatewayId, "contains", "hard"));
      (ctx.vpces || []).filter((e) => e.VpcId === v.VpcId).forEach((e) => addEdge(v.VpcId, e.VpcEndpointId, "contains", "soft"));
      (ctx.rts || []).filter((rt) => rt.VpcId === v.VpcId).forEach((rt) => addEdge(v.VpcId, rt.RouteTableId, "contains", "config"));
      (ctx.nacls || []).filter((n) => n.VpcId === v.VpcId).forEach((n) => addEdge(v.VpcId, n.NetworkAclId, "contains", "config"));
      (ctx.sgs || []).filter((sg) => sg.VpcId === v.VpcId).forEach((sg) => addEdge(v.VpcId, sg.GroupId, "contains", "config"));
    });
    (ctx.subnets || []).forEach((sub) => {
      ((ctx.instBySub || {})[sub.SubnetId] || []).forEach((i) => addEdge(sub.SubnetId, i.InstanceId, "contains", "hard"));
      ((ctx.rdsBySub || {})[sub.SubnetId] || []).forEach((r) => addEdge(sub.SubnetId, r.DBInstanceIdentifier, "contains", "hard"));
      ((ctx.ecsBySub || {})[sub.SubnetId] || []).forEach((e) => addEdge(sub.SubnetId, e.serviceName, "contains", "hard"));
      ((ctx.lambdaBySub || {})[sub.SubnetId] || []).forEach((l) => addEdge(sub.SubnetId, l.FunctionName, "contains", "hard"));
      ((ctx.albBySub || {})[sub.SubnetId] || []).forEach((a) => addEdge(sub.SubnetId, a.LoadBalancerName, "contains", "hard"));
      const rt = (ctx.subRT || {})[sub.SubnetId];
      if (rt) addEdge(sub.SubnetId, rt.RouteTableId, "associated", "config");
      const nacl = (ctx.subNacl || {})[sub.SubnetId];
      if (nacl) addEdge(sub.SubnetId, nacl.NetworkAclId, "associated", "config");
    });
    (ctx.instances || []).forEach((inst) => {
      (inst.SecurityGroups || []).forEach((sg) => addEdge(inst.InstanceId, sg.GroupId, "secured_by", "soft"));
      (inst.BlockDeviceMappings || []).forEach((b) => {
        if (b.Ebs && b.Ebs.VolumeId) addEdge(inst.InstanceId, b.Ebs.VolumeId, "attached", "hard");
      });
    });
    (ctx.rdsInstances || []).forEach((db) => {
      (db.VpcSecurityGroups || []).forEach((sg) => addEdge(db.DBInstanceIdentifier, sg.VpcSecurityGroupId, "secured_by", "soft"));
    });
    (ctx.albs || []).forEach((alb) => {
      (alb.SecurityGroups || []).forEach((gid) => addEdge(alb.LoadBalancerName, gid, "secured_by", "soft"));
      const tgs = (ctx.tgByAlb || {})[alb.LoadBalancerArn] || [];
      tgs.forEach((tg) => {
        addEdge(alb.LoadBalancerName, tg.TargetGroupName || tg.TargetGroupArn, "targets", "soft");
      });
    });
    (ctx.sgs || []).forEach((sg) => {
      [...sg.IpPermissions || [], ...sg.IpPermissionsEgress || []].forEach((p) => {
        (p.UserIdGroupPairs || []).forEach((pair) => {
          if (pair.GroupId && pair.GroupId !== sg.GroupId) addEdge(sg.GroupId, pair.GroupId, "references", "config");
        });
      });
    });
    (ctx.rts || []).forEach((rt) => {
      (rt.Routes || []).forEach((r) => {
        if (r.GatewayId && r.GatewayId !== "local") addEdge(rt.RouteTableId, r.GatewayId, "routes_through", "config");
        if (r.NatGatewayId) addEdge(rt.RouteTableId, r.NatGatewayId, "routes_through", "config");
        if (r.TransitGatewayId) addEdge(rt.RouteTableId, r.TransitGatewayId, "routes_through", "config");
        if (r.VpcPeeringConnectionId) addEdge(rt.RouteTableId, r.VpcPeeringConnectionId, "routes_through", "config");
      });
    });
    (ctx.peerings || []).forEach((p) => {
      if (p.RequesterVpcInfo) addEdge(p.VpcPeeringConnectionId, p.RequesterVpcInfo.VpcId, "connects", "soft");
      if (p.AccepterVpcInfo) addEdge(p.VpcPeeringConnectionId, p.AccepterVpcInfo.VpcId, "connects", "soft");
    });
    return g;
  }
  function getBlastRadius(resourceId, graph, maxDepth) {
    maxDepth = maxDepth || 5;
    const result = { hard: [], soft: [], config: [], all: [] };
    const visited = /* @__PURE__ */ new Set([resourceId]);
    const queue = [{ id: resourceId, depth: 0 }];
    while (queue.length) {
      const { id, depth } = queue.shift();
      if (depth >= maxDepth) continue;
      const edges = graph[id] || [];
      edges.forEach((e) => {
        if (visited.has(e.id)) return;
        visited.add(e.id);
        const entry = { id: e.id, rel: e.rel, strength: e.strength, depth: depth + 1, parent: id };
        result[e.strength] = result[e.strength] || [];
        result[e.strength].push(entry);
        result.all.push(entry);
        queue.push({ id: e.id, depth: depth + 1 });
      });
    }
    return result;
  }
  function getResType(id) {
    if (!id) return "Unknown";
    if (id.startsWith("vpc-")) return "VPC";
    if (id.startsWith("subnet-")) return "Subnet";
    if (id.startsWith("i-")) return "EC2";
    if (id.startsWith("igw-")) return "IGW";
    if (id.startsWith("nat-")) return "NAT";
    if (id.startsWith("vpce-")) return "VPCE";
    if (id.startsWith("sg-")) return "SG";
    if (id.startsWith("rtb-")) return "RT";
    if (id.startsWith("acl-")) return "NACL";
    if (id.startsWith("vol-")) return "EBS";
    if (id.startsWith("pcx-")) return "Peering";
    if (id.startsWith("tgw-")) return "TGW";
    if (id.startsWith("arn:")) return "ARN";
    const ctx = rlCtx;
    if (ctx) {
      if ((ctx.rdsInstances || []).some((r) => r.DBInstanceIdentifier === id)) return "RDS";
      if ((ctx.lambdaFns || []).some((f) => f.FunctionName === id)) return "Lambda";
      if ((ctx.ecsServices || []).some((e) => e.serviceName === id)) return "ECS";
      if ((ctx.albs || []).some((a) => a.LoadBalancerName === id)) return "ALB";
      if ((ctx.ecacheClusters || []).some((c) => c.CacheClusterId === id)) return "ElastiCache";
      if ((ctx.redshiftClusters || []).some((c) => c.ClusterIdentifier === id)) return "Redshift";
    }
    return "Resource";
  }
  function getResName(id) {
    const ctx = rlCtx;
    if (!ctx) return id;
    const v = (ctx.vpcs || []).find((x) => x.VpcId === id);
    if (v) {
      const t = (v.Tags || []).find((t2) => t2.Key === "Name");
      return t ? t.Value : id;
    }
    const s = (ctx.subnets || []).find((x) => x.SubnetId === id);
    if (s) {
      const t = (s.Tags || []).find((t2) => t2.Key === "Name");
      return t ? t.Value : id;
    }
    const i = (ctx.instances || []).find((x) => x.InstanceId === id);
    if (i) {
      const t = (i.Tags || []).find((t2) => t2.Key === "Name");
      return t ? t.Value : id;
    }
    const sg = (ctx.sgs || []).find((x) => x.GroupId === id);
    if (sg) return sg.GroupName || id;
    return id;
  }
  function clearBlastRadius() {
    const mg = mapG;
    if (!blastActive || !mg) return;
    blastActive = false;
    mg.selectAll(".blast-dimmed,.blast-glow-hard,.blast-glow-soft,.blast-glow-config").classed("blast-dimmed", false).classed("blast-glow-hard", false).classed("blast-glow-soft", false).classed("blast-glow-config", false);
  }
  function resetDepGraph() {
    depGraph = null;
  }
  function isBlastActive() {
    return blastActive;
  }

  // src/modules/iam-engine.js
  function _stmtArr(s) {
    return Array.isArray(s) ? s : s ? [s] : [];
  }
  function _safePolicyParse(s) {
    if (typeof s !== "string") return s || {};
    try {
      return JSON.parse(s);
    } catch (e) {
      return {};
    }
  }
  var _iamData = null;
  var _showIAM = false;
  function setIamData(v) {
    _iamData = v;
  }
  function setShowIAM(v) {
    _showIAM = v;
  }
  function getIamData() {
    return _iamData;
  }
  function getShowIAM() {
    return _showIAM;
  }
  function parseIAMData2(raw) {
    if (!raw) return null;
    const data = { roles: [], users: [], policies: [] };
    if (raw.RoleDetailList) data.roles = raw.RoleDetailList;
    else if (raw.Roles) data.roles = raw.Roles;
    if (raw.UserDetailList) data.users = raw.UserDetailList;
    if (raw.Policies) data.policies = raw.Policies;
    if (raw.PasswordPolicy) data.passwordPolicy = raw.PasswordPolicy;
    if (raw.AccountPasswordPolicy) data.passwordPolicy = raw.AccountPasswordPolicy;
    const policyMap = /* @__PURE__ */ new Map();
    data.policies.forEach((dp) => {
      if (dp.Arn) policyMap.set(dp.Arn, dp);
      if (dp.PolicyName) policyMap.set(dp.PolicyName, dp);
    });
    function _resolvePolicyDoc(p) {
      if (p.PolicyDocument) {
        const doc = _safePolicyParse(p.PolicyDocument);
        return _stmtArr(doc.Statement);
      }
      if (p.Document) {
        const doc = _safePolicyParse(p.Document);
        return _stmtArr(doc.Statement);
      }
      if (p.PolicyArn || p.PolicyName) {
        const pol = policyMap.get(p.PolicyArn) || policyMap.get(p.PolicyName);
        if (pol) {
          const ver = (pol.PolicyVersionList || []).find((v) => v.IsDefaultVersion);
          if (ver) {
            let dd = ver.Document;
            if (typeof dd === "string") {
              try {
                dd = JSON.parse(dd);
              } catch (e) {
                dd = {};
              }
            }
            return _stmtArr(dd.Statement);
          }
        }
      }
      return [];
    }
    data.roles.forEach((role) => {
      role._vpcAccess = [];
      role._isAdmin = false;
      role._hasWildcard = false;
      const policies = [...role.RolePolicyList || [], ...role.AttachedManagedPolicies || []];
      policies.forEach((p) => {
        const stmts = _resolvePolicyDoc(p);
        stmts.forEach((stmt) => {
          if (stmt.Effect !== "Allow") return;
          const actions = Array.isArray(stmt.Action) ? stmt.Action : [stmt.Action || ""];
          const resources = Array.isArray(stmt.Resource) ? stmt.Resource : [stmt.Resource || ""];
          const hasWildAction = actions.some((a) => a === "*" || a === "*:*");
          const hasWildResource = resources.some((r) => r === "*");
          if (hasWildAction && hasWildResource) role._isAdmin = true;
          if (hasWildResource) role._hasWildcard = true;
          const cond = stmt.Condition || {};
          Object.values(cond).forEach((cv) => {
            if (cv["aws:SourceVpc"]) role._vpcAccess.push(...Array.isArray(cv["aws:SourceVpc"]) ? cv["aws:SourceVpc"] : [cv["aws:SourceVpc"]]);
            if (cv["ec2:Vpc"]) role._vpcAccess.push(...Array.isArray(cv["ec2:Vpc"]) ? cv["ec2:Vpc"] : [cv["ec2:Vpc"]]);
          });
          if (actions.some((a) => a.startsWith("ec2:")) || actions.some((a) => a === "ec2:*")) {
            resources.forEach((r) => {
              if (r.includes(":vpc/") || r.includes(":subnet/")) role._vpcAccess.push(r);
            });
          }
        });
      });
    });
    return data;
  }
  function getIAMAccessForVpc(iamData, vpcId) {
    if (!iamData) return [];
    return iamData.roles.filter((r) => r._isAdmin || r._hasWildcard || r._vpcAccess.some((v) => v === vpcId || v.includes(vpcId) || v === "*"));
  }
  function runIAMChecks2(iamData) {
    const f = [];
    if (!iamData) return f;
    const policyByArn = /* @__PURE__ */ new Map();
    (iamData.policies || []).forEach((p) => {
      if (p.Arn) policyByArn.set(p.Arn, p);
      if (p.PolicyName) policyByArn.set(p.PolicyName, p);
    });
    function _acctFromArn(r) {
      if (!r || !r.Arn) return "";
      const m = r.Arn.match(/arn:aws:iam::(\d+):/);
      return m ? m[1] : "";
    }
    (iamData.roles || []).forEach((role) => {
      const _iamOwnAccountId = _acctFromArn(role);
      if (role._isAdmin) f.push({ severity: "CRITICAL", control: "IAM-1", framework: "IAM", resource: role.RoleName || role.Arn || "", resourceName: role.RoleName || "", message: "Role has admin (*:*) permissions", remediation: "Apply least-privilege: scope actions and resources" });
      if (role._hasWildcard && !role._isAdmin) f.push({ severity: "HIGH", control: "IAM-2", framework: "IAM", resource: role.RoleName || role.Arn || "", resourceName: role.RoleName || "", message: 'Role has wildcard Resource: "*"', remediation: "Scope Resource ARNs to specific resources" });
      if (role.AssumeRolePolicyDocument) {
        const trust = _safePolicyParse(role.AssumeRolePolicyDocument);
        const stmts = _stmtArr(trust.Statement);
        const crossAccount = stmts.some((s) => {
          const p = s.Principal || {};
          const aws = p.AWS || "";
          return (Array.isArray(aws) ? aws : [aws]).some((a) => {
            if (!a || !a.includes(":root")) return false;
            const m = a.match(/arn:aws:iam::(\d+):/);
            return m && m[1] !== _iamOwnAccountId;
          });
        });
        const hasMFA = stmts.some((s) => JSON.stringify(s.Condition || {}).includes("aws:MultiFactorAuth"));
        if (crossAccount && !hasMFA) f.push({ severity: "MEDIUM", control: "IAM-3", framework: "IAM", resource: role.RoleName || "", resourceName: role.RoleName || "", message: "Cross-account role without MFA condition", remediation: "Add Condition with aws:MultiFactorAuthPresent" });
      }
      const allStmts4 = [];
      (role.RolePolicyList || []).forEach((p) => {
        _stmtArr(_safePolicyParse(p.PolicyDocument).Statement).forEach((s) => allStmts4.push(s));
      });
      (role.AttachedManagedPolicies || []).forEach((mp) => {
        const pol = policyByArn.get(mp.PolicyArn) || policyByArn.get(mp.PolicyName);
        if (pol) {
          const ver = (pol.PolicyVersionList || []).find((v) => v.IsDefaultVersion);
          if (ver) {
            _stmtArr(_safePolicyParse(ver.Document).Statement).forEach((s) => allStmts4.push(s));
          }
        }
      });
      var hasIAM4 = false;
      allStmts4.forEach((stmt) => {
        if (hasIAM4) return;
        if (stmt.Effect !== "Allow") return;
        const acts = Array.isArray(stmt.Action) ? stmt.Action : [stmt.Action || ""];
        if (acts.some((a) => /^[a-z0-9]+:\*$/i.test(a))) {
          hasIAM4 = true;
          f.push({ severity: "MEDIUM", control: "IAM-4", framework: "IAM", resource: role.RoleName || "", resourceName: role.RoleName || "", message: "Role uses service-level wildcard actions (e.g. s3:*)", remediation: "Scope actions to specific API calls needed" });
        }
      });
      const lastUsed = role.RoleLastUsed?.LastUsedDate;
      if (!lastUsed || Date.now() - new Date(lastUsed).getTime() > 90 * 864e5) f.push({ severity: "LOW", control: "IAM-5", framework: "IAM", resource: role.RoleName || "", resourceName: role.RoleName || "", message: "Role unused for >90 days or never used", remediation: "Review and remove unused roles" });
      if (role.AssumeRolePolicyDocument) {
        const tr6 = _safePolicyParse(role.AssumeRolePolicyDocument);
        _stmtArr(tr6.Statement).forEach((s) => {
          const pr = s.Principal || {};
          const awsPr = pr.AWS || "";
          const awsList = Array.isArray(awsPr) ? awsPr : [awsPr];
          const isCross = awsList.some((a) => {
            if (!a || !a.includes(":root")) return false;
            const m = a.match(/arn:aws:iam::(\d+):/);
            return m && m[1] !== _iamOwnAccountId;
          });
          const hasExtId = s.Condition && (s.Condition.StringEquals?.["sts:ExternalId"] || s.Condition.StringLike?.["sts:ExternalId"]);
          if (isCross && !hasExtId) f.push({ severity: "HIGH", control: "IAM-6", framework: "IAM", resource: role.RoleName || "", resourceName: role.RoleName || "", message: "Cross-account trust without ExternalId condition", remediation: "Add sts:ExternalId condition to assume role policy" });
        });
      }
      if (role.RolePolicyList?.length > 0) f.push({ severity: "LOW", control: "IAM-7", framework: "IAM", resource: role.RoleName || "", resourceName: role.RoleName || "", message: "Role uses inline policies instead of managed", remediation: "Convert inline policies to managed policies for reusability" });
      if ((role._isAdmin || role._hasWildcard) && !role.PermissionsBoundary) f.push({ severity: "MEDIUM", control: "IAM-8", framework: "IAM", resource: role.RoleName || "", resourceName: role.RoleName || "", message: "Privileged role without permission boundary", remediation: "Attach a permission boundary to limit effective permissions" });
    });
    (iamData.users || []).forEach((user) => {
      let uIsAdmin = false, uHasWildcard = false;
      const uPolicies = [...user.UserPolicyList || [], ...user.AttachedManagedPolicies || []];
      uPolicies.forEach((p) => {
        const doc = _safePolicyParse(p.PolicyDocument);
        const stmts = _stmtArr(doc.Statement);
        stmts.forEach((stmt) => {
          if (stmt.Effect !== "Allow") return;
          const acts = Array.isArray(stmt.Action) ? stmt.Action : [stmt.Action || ""];
          const res = Array.isArray(stmt.Resource) ? stmt.Resource : [stmt.Resource || ""];
          const uHasWildAct = acts.some((a) => a === "*" || a === "*:*");
          const uHasWildRes = res.some((r) => r === "*");
          if (uHasWildAct && uHasWildRes) uIsAdmin = true;
          if (uHasWildRes) uHasWildcard = true;
        });
      });
      (user.AttachedManagedPolicies || []).forEach((mp) => {
        const pol = policyByArn.get(mp.PolicyArn) || policyByArn.get(mp.PolicyName);
        if (pol) {
          const ver = (pol.PolicyVersionList || []).find((v) => v.IsDefaultVersion);
          if (ver) {
            const dd = _safePolicyParse(ver.Document);
            _stmtArr(dd.Statement).forEach((s) => {
              if (s.Effect === "Allow") {
                const a = Array.isArray(s.Action) ? s.Action : [s.Action || ""];
                const r = Array.isArray(s.Resource) ? s.Resource : [s.Resource || ""];
                if (a.some((x) => x === "*") && r.some((x) => x === "*")) uIsAdmin = true;
                if (r.some((x) => x === "*")) uHasWildcard = true;
              }
            });
          }
        }
      });
      if (uIsAdmin) f.push({ severity: "CRITICAL", control: "IAM-1", framework: "IAM", resource: user.UserName || "", resourceName: user.UserName || "", message: "User has admin (*:*) permissions", remediation: "Apply least-privilege: scope actions and resources" });
      if (uHasWildcard && !uIsAdmin) f.push({ severity: "HIGH", control: "IAM-2", framework: "IAM", resource: user.UserName || "", resourceName: user.UserName || "", message: 'User has wildcard Resource: "*"', remediation: "Scope Resource ARNs to specific resources" });
      if (!(user.MFADevices || []).length) f.push({ severity: "HIGH", control: "IAM-3", framework: "IAM", resource: user.UserName || "", resourceName: user.UserName || "", message: "User has no MFA device configured", remediation: "Enable MFA for all IAM users" });
      if (user.UserPolicyList?.length > 0) f.push({ severity: "LOW", control: "IAM-7", framework: "IAM", resource: user.UserName || "", resourceName: user.UserName || "", message: "User uses inline policies instead of managed", remediation: "Convert inline policies to managed policies" });
      const uStmts = [];
      (user.UserPolicyList || []).forEach((p) => {
        _stmtArr(_safePolicyParse(p.PolicyDocument).Statement).forEach((s) => uStmts.push(s));
      });
      (user.AttachedManagedPolicies || []).forEach((mp) => {
        const pol = policyByArn.get(mp.PolicyArn) || policyByArn.get(mp.PolicyName);
        if (pol) {
          const ver = (pol.PolicyVersionList || []).find((v) => v.IsDefaultVersion);
          if (ver) {
            _stmtArr(_safePolicyParse(ver.Document).Statement).forEach((s) => uStmts.push(s));
          }
        }
      });
      var uHasIAM4 = false;
      uStmts.forEach((stmt) => {
        if (uHasIAM4) return;
        if (stmt.Effect === "Allow") {
          const acts = Array.isArray(stmt.Action) ? stmt.Action : [stmt.Action || ""];
          if (acts.some((a) => /^[a-z0-9]+:\*$/i.test(a))) {
            uHasIAM4 = true;
            f.push({ severity: "MEDIUM", control: "IAM-4", framework: "IAM", resource: user.UserName || "", resourceName: user.UserName || "", message: "User uses service-level wildcard actions", remediation: "Scope actions to specific API calls needed" });
          }
        }
      });
      (user.AccessKeys || []).forEach((ak) => {
        if (ak.Status === "Active" && ak.CreateDate) {
          const cd = new Date(ak.CreateDate);
          if (isNaN(cd.getTime())) return;
          const age = (Date.now() - cd.getTime()) / 864e5;
          if (age > 90) f.push({ severity: "MEDIUM", control: "IAM-9", framework: "IAM", resource: user.UserName || "", resourceName: user.UserName || "", message: "Access key " + ak.AccessKeyId + " is " + Math.floor(age) + " days old", remediation: "Rotate access keys every 90 days; use IAM roles for EC2/Lambda instead" });
        }
      });
      const activeKeys = (user.AccessKeys || []).filter((ak) => ak.Status === "Active");
      if (activeKeys.length > 1) f.push({ severity: "LOW", control: "IAM-10", framework: "IAM", resource: user.UserName || "", resourceName: user.UserName || "", message: "User has " + activeKeys.length + " active access keys", remediation: "Maintain only one active key; rotate and deactivate old keys" });
      if (user.LoginProfile && !(user.MFADevices || []).length) f.push({ severity: "CRITICAL", control: "IAM-11", framework: "IAM", resource: user.UserName || "", resourceName: user.UserName || "", message: "Console login enabled without MFA", remediation: "Enable MFA immediately; enforce MFA via IAM policy condition" });
      if ((user.AttachedManagedPolicies || []).length > 10) f.push({ severity: "LOW", control: "IAM-12", framework: "IAM", resource: user.UserName || "", resourceName: user.UserName || "", message: "User has " + (user.AttachedManagedPolicies || []).length + " managed policies attached", remediation: "Consolidate policies; use groups with managed policies instead" });
    });
    if (iamData.passwordPolicy) {
      const pp = iamData.passwordPolicy;
      if (!pp.RequireUppercaseCharacters || !pp.RequireLowercaseCharacters || !pp.RequireNumbers || !pp.RequireSymbols)
        f.push({ severity: "MEDIUM", control: "IAM-13", framework: "IAM", resource: "AccountPasswordPolicy", resourceName: "Password Policy", message: "Password policy does not require all character types", remediation: "Require uppercase, lowercase, numbers, and symbols" });
      if ((pp.MinimumPasswordLength || 0) < 14)
        f.push({ severity: "MEDIUM", control: "IAM-13", framework: "IAM", resource: "AccountPasswordPolicy", resourceName: "Password Policy", message: "Minimum password length is " + (pp.MinimumPasswordLength || "not set") + " (should be 14+)", remediation: "Set MinimumPasswordLength to at least 14 characters" });
      if ((pp.MaxPasswordAge || 0) > 90 || !pp.MaxPasswordAge)
        f.push({ severity: "MEDIUM", control: "IAM-13", framework: "IAM", resource: "AccountPasswordPolicy", resourceName: "Password Policy", message: "Password max age is " + (pp.MaxPasswordAge || "unlimited") + " days", remediation: "Set MaxPasswordAge to 90 days or less" });
    }
    return f;
  }

  // src/modules/timeline.js
  var timeline_exports = {};
  __export(timeline_exports, {
    _MAX_SNAPSHOTS: () => maxSnapshots,
    _NOTE_CATEGORIES: () => NOTE_CATEGORIES,
    _annotationAuthor: () => annotationAuthor,
    _annotations: () => annotations,
    _snapshots: () => snapshots,
    addAnnotation: () => addAnnotation,
    buildComplianceLookup: () => buildComplianceLookup,
    computeChecksum: () => computeChecksum,
    deleteAnnotation: () => deleteAnnotation,
    escHtml: () => escHtml,
    getAllNotes: () => getAllNotes,
    getAnnotationAuthor: () => getAnnotationAuthor,
    getAnnotations: () => getAnnotations,
    getCurrentSnapshot: () => getCurrentSnapshot,
    getLastAutoSnap: () => getLastAutoSnap,
    getResourceName: () => getResourceName,
    getSnapshots: () => getSnapshots,
    isOrphaned: () => isOrphaned,
    isViewingHistory: () => isViewingHistory,
    noteKey: () => noteKey,
    relTime: () => relTime,
    saveAnnotations: () => saveAnnotations,
    saveSnapshots: () => saveSnapshots,
    setAnnotationAuthor: () => setAnnotationAuthor,
    setAnnotations: () => setAnnotations,
    setCurrentSnapshot: () => setCurrentSnapshot,
    setLastAutoSnap: () => setLastAutoSnap,
    setSnapshots: () => setSnapshots,
    setViewingHistory: () => setViewingHistory,
    updateAnnotation: () => updateAnnotation
  });
  var snapshots = [];
  var viewingHistory = false;
  var currentSnapshot = null;
  var lastAutoSnap = 0;
  var annotations = {};
  var annotationAuthor = "";
  try {
    const s = localStorage.getItem(SNAP_KEY);
    if (s) snapshots = JSON.parse(s);
  } catch (e) {
    snapshots = [];
  }
  try {
    const s = localStorage.getItem(NOTES_KEY);
    if (s) annotations = JSON.parse(s);
  } catch (e) {
  }
  try {
    annotationAuthor = localStorage.getItem("aws_mapper_note_author") || "";
  } catch (e) {
  }
  var maxSnapshots = typeof window !== "undefined" && window.electronAPI ? 5 : MAX_SNAPSHOTS;
  function getSnapshots() {
    return snapshots;
  }
  function setSnapshots(v) {
    snapshots = v;
  }
  function isViewingHistory() {
    return viewingHistory;
  }
  function setViewingHistory(v) {
    viewingHistory = v;
  }
  function getCurrentSnapshot() {
    return currentSnapshot;
  }
  function setCurrentSnapshot(v) {
    currentSnapshot = v;
  }
  function getLastAutoSnap() {
    return lastAutoSnap;
  }
  function setLastAutoSnap(v) {
    lastAutoSnap = v;
  }
  function getAnnotations() {
    return annotations;
  }
  function setAnnotations(v) {
    annotations = v;
  }
  function getAnnotationAuthor() {
    return annotationAuthor;
  }
  function setAnnotationAuthor(v) {
    annotationAuthor = v;
    try {
      localStorage.setItem("aws_mapper_note_author", v);
    } catch (e) {
    }
  }
  function saveSnapshots() {
    try {
      localStorage.setItem(SNAP_KEY, JSON.stringify(snapshots));
    } catch (e) {
      if (snapshots.length > 4) {
        snapshots = snapshots.slice(Math.floor(snapshots.length / 2));
        try {
          localStorage.setItem(SNAP_KEY, JSON.stringify(snapshots));
        } catch (e2) {
        }
      }
    }
  }
  function computeChecksum(textareas) {
    let s = "";
    Object.keys(textareas).sort().forEach((k) => s += k + ":" + String(textareas[k]).length + ";");
    let h = 0;
    for (let i = 0; i < s.length; i++) {
      h = (h << 5) - h + s.charCodeAt(i);
      h |= 0;
    }
    return h;
  }
  function saveAnnotations() {
    try {
      localStorage.setItem(NOTES_KEY, JSON.stringify(annotations));
    } catch (e) {
    }
  }
  function noteKey(resourceId, accountId) {
    return accountId && accountId !== "default" ? accountId + ":" + resourceId : resourceId;
  }
  function getAllNotes() {
    const all = [];
    Object.entries(annotations).forEach(([rid, notes]) => {
      (Array.isArray(notes) ? notes : [notes]).forEach((n, i) => {
        if (n && n.text) all.push({ ...n, resourceId: rid, noteIndex: i });
      });
    });
    return all.sort((a, b) => new Date(b.updated || b.created || 0) - new Date(a.updated || a.created || 0));
  }
  function relTime(iso) {
    if (!iso) return "";
    const ms = Date.now() - new Date(iso).getTime();
    const s = Math.floor(ms / 1e3), m = Math.floor(s / 60), h = Math.floor(m / 60), d = Math.floor(h / 24);
    if (d > 30) return Math.floor(d / 30) + "mo ago";
    if (d > 0) return d + "d ago";
    if (h > 0) return h + "h ago";
    if (m > 0) return m + "m ago";
    return "just now";
  }
  function escHtml(s) {
    return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function isOrphaned(rid, ctx) {
    if (!ctx) return false;
    if (rid.startsWith("canvas:")) return false;
    const all = [
      ...(ctx.vpcs || []).map((x) => x.VpcId),
      ...(ctx.subnets || []).map((x) => x.SubnetId),
      ...(ctx.instances || []).map((x) => x.InstanceId),
      ...(ctx.igws || []).map((x) => x.InternetGatewayId),
      ...(ctx.nats || []).map((x) => x.NatGatewayId),
      ...(ctx.vpces || []).map((x) => x.VpcEndpointId),
      ...(ctx.rdsInstances || []).map((x) => x.DBInstanceIdentifier),
      ...(ctx.lambdaFns || []).map((x) => x.FunctionName),
      ...(ctx.sgs || []).map((x) => x.GroupId),
      ...(ctx.albs || []).map((x) => x.LoadBalancerName),
      ...(ctx.ecacheClusters || []).map((x) => x.CacheClusterId),
      ...(ctx.redshiftClusters || []).map((x) => x.ClusterIdentifier)
    ];
    return !all.includes(rid);
  }
  function getResourceName(rid, ctx) {
    if (!ctx) return rid;
    const v = (ctx.vpcs || []).find((x) => x.VpcId === rid);
    if (v) return gn(v, rid);
    const s = (ctx.subnets || []).find((x) => x.SubnetId === rid);
    if (s) return gn(s, rid);
    const i = (ctx.instances || []).find((x) => x.InstanceId === rid);
    if (i) return gn(i, rid);
    const r = (ctx.rdsInstances || []).find((x) => x.DBInstanceIdentifier === rid);
    if (r) return rid;
    const l = (ctx.lambdaFns || []).find((x) => x.FunctionName === rid);
    if (l) return rid;
    const sg = (ctx.sgs || []).find((x) => x.GroupId === rid);
    if (sg) return sg.GroupName || rid;
    return rid;
  }
  function buildComplianceLookup(findings, isMutedFn) {
    const lookup = {};
    if (!findings || !findings.length) return lookup;
    const sevOrder = { CRITICAL: 1, HIGH: 2, MEDIUM: 3, LOW: 4 };
    findings.forEach((f) => {
      if (isMutedFn && isMutedFn(f)) return;
      const rid = f.resource;
      if (!rid || rid === "Multiple") return;
      if (!lookup[rid]) lookup[rid] = { worst: "LOW", count: 0, findings: [] };
      lookup[rid].count++;
      lookup[rid].findings.push(f);
      if ((sevOrder[f.severity] || 9) < (sevOrder[lookup[rid].worst] || 9)) lookup[rid].worst = f.severity;
    });
    return lookup;
  }
  function addAnnotation(resourceId, text, category, pinned) {
    if (!text || !text.trim()) return;
    const note = {
      text: text.trim(),
      category: category || "info",
      author: annotationAuthor || "",
      created: (/* @__PURE__ */ new Date()).toISOString(),
      updated: (/* @__PURE__ */ new Date()).toISOString(),
      pinned: !!pinned
    };
    if (!annotations[resourceId]) annotations[resourceId] = [];
    if (!Array.isArray(annotations[resourceId])) annotations[resourceId] = [annotations[resourceId]];
    annotations[resourceId].push(note);
    saveAnnotations();
    return note;
  }
  function updateAnnotation(resourceId, noteIndex, text, category, pinned) {
    if (!annotations[resourceId] || !annotations[resourceId][noteIndex]) return;
    const n = annotations[resourceId][noteIndex];
    if (text !== void 0) n.text = text;
    if (category !== void 0) n.category = category;
    if (pinned !== void 0) n.pinned = pinned;
    n.updated = (/* @__PURE__ */ new Date()).toISOString();
    saveAnnotations();
  }
  function deleteAnnotation(resourceId, noteIndex) {
    if (!annotations[resourceId]) return;
    annotations[resourceId].splice(noteIndex, 1);
    if (annotations[resourceId].length === 0) delete annotations[resourceId];
    saveAnnotations();
  }

  // src/modules/design-mode.js
  var design_mode_exports = {};
  __export(design_mode_exports, {
    _awsConstraints: () => _awsConstraints,
    _designApplyFns: () => _designApplyFns,
    _generateCLI: () => _generateCLI,
    _generateWarnings: () => _generateWarnings,
    _regionAZs: () => _regionAZs,
    detectAZs: () => detectAZs,
    getDesignBaseline: () => getDesignBaseline,
    getDesignChanges: () => getDesignChanges,
    getDesignDebounce: () => getDesignDebounce,
    getDesignMode: () => getDesignMode,
    getDesignRegion: () => getDesignRegion,
    getLastDesignValidation: () => getLastDesignValidation,
    getSidebarWasCollapsed: () => getSidebarWasCollapsed,
    importDesignPlan: () => importDesignPlan,
    setDesignBaseline: () => setDesignBaseline,
    setDesignChanges: () => setDesignChanges,
    setDesignDebounce: () => setDesignDebounce,
    setDesignMode: () => setDesignMode,
    setDesignRegion: () => setDesignRegion,
    setLastDesignValidation: () => setLastDesignValidation,
    setSidebarWasCollapsed: () => setSidebarWasCollapsed,
    validateDesignChange: () => validateDesignChange,
    validateDesignState: () => validateDesignState
  });
  var _designMode = false;
  var _designChanges = [];
  var _designBaseline = null;
  var _designDebounce = null;
  var _lastDesignValidation = null;
  var _sidebarWasCollapsed = false;
  var _designRegion = "us-east-1";
  function getDesignMode() {
    return _designMode;
  }
  function setDesignMode(v) {
    _designMode = v;
  }
  function getDesignChanges() {
    return _designChanges;
  }
  function setDesignChanges(v) {
    _designChanges = v;
  }
  function getDesignBaseline() {
    return _designBaseline;
  }
  function setDesignBaseline(v) {
    _designBaseline = v;
  }
  function getDesignDebounce() {
    return _designDebounce;
  }
  function setDesignDebounce(v) {
    _designDebounce = v;
  }
  function getLastDesignValidation() {
    return _lastDesignValidation;
  }
  function setLastDesignValidation(v) {
    _lastDesignValidation = v;
  }
  function getSidebarWasCollapsed() {
    return _sidebarWasCollapsed;
  }
  function setSidebarWasCollapsed(v) {
    _sidebarWasCollapsed = v;
  }
  function getDesignRegion() {
    return _designRegion;
  }
  function setDesignRegion(v) {
    _designRegion = v;
  }
  var _regionAZs = {
    "us-east-1": ["us-east-1a", "us-east-1b", "us-east-1c", "us-east-1d", "us-east-1e", "us-east-1f"],
    "us-east-2": ["us-east-2a", "us-east-2b", "us-east-2c"],
    "us-west-1": ["us-west-1a", "us-west-1b"],
    "us-west-2": ["us-west-2a", "us-west-2b", "us-west-2c", "us-west-2d"],
    "eu-west-1": ["eu-west-1a", "eu-west-1b", "eu-west-1c"],
    "eu-west-2": ["eu-west-2a", "eu-west-2b", "eu-west-2c"],
    "eu-central-1": ["eu-central-1a", "eu-central-1b", "eu-central-1c"],
    "ap-southeast-1": ["ap-southeast-1a", "ap-southeast-1b", "ap-southeast-1c"],
    "ap-southeast-2": ["ap-southeast-2a", "ap-southeast-2b", "ap-southeast-2c"],
    "ap-northeast-1": ["ap-northeast-1a", "ap-northeast-1b", "ap-northeast-1c", "ap-northeast-1d"],
    "ca-central-1": ["ca-central-1a", "ca-central-1b", "ca-central-1d"],
    "sa-east-1": ["sa-east-1a", "sa-east-1b", "sa-east-1c"]
  };
  var _awsConstraints = {
    vpc: {
      cidrPrefixMin: 16,
      cidrPrefixMax: 28,
      maxCidrsPerVpc: 5,
      maxPerRegion: 5,
      reservedCidrs: ["172.17.0.0/16"],
      rfc1918: ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"]
    },
    subnet: { cidrPrefixMin: 16, cidrPrefixMax: 28, reservedIps: 5, maxPerVpc: 200 },
    igw: { maxPerVpc: 1 },
    nat: { maxPerAz: 5, requiresPublicSubnet: true },
    routeTable: { maxPerVpc: 200, maxRoutesPerTable: 500, reservedDestinations: ["169.254.168.0/22"], localRouteImmutable: true },
    securityGroup: { maxPerVpc: 500, maxInboundRules: 60, maxOutboundRules: 60, maxPerEni: 5, hardLimitRulesPerEni: 1e3 },
    nacl: { maxPerVpc: 200, maxRulesPerDirection: 20, ruleNumberMin: 1, ruleNumberMax: 32766 },
    peering: { maxActivePerVpc: 50, noOverlappingCidrs: true, onePeerPerVpcPair: true }
  };
  function validateDesignChange(change, ctx) {
    const errors = [], warnings = [];
    const vpcs = ctx ? ctx.vpcs || [] : [];
    const subnets = ctx ? ctx.subnets || [] : [];
    const igws = ctx ? ctx.igws || [] : [];
    const nats = ctx ? ctx.nats || [] : [];
    const sgs = ctx ? ctx.sgs || [] : [];
    const rts = ctx ? ctx.rts || [] : [];
    const pubSubs = ctx ? ctx.pubSubs || /* @__PURE__ */ new Set() : /* @__PURE__ */ new Set();
    if (change.action === "add_vpc") {
      const p = change.params;
      const cidr = parseCIDR(p.CidrBlock);
      if (!cidr) {
        errors.push("Invalid CIDR: " + p.CidrBlock);
        return { valid: false, errors, warnings };
      }
      const prefix = parseInt(p.CidrBlock.split("/")[1], 10);
      if (prefix < _awsConstraints.vpc.cidrPrefixMin || prefix > _awsConstraints.vpc.cidrPrefixMax)
        errors.push("VPC CIDR must be /16 to /28, got /" + prefix);
      const isRfc1918 = _awsConstraints.vpc.rfc1918.some((r) => cidrContains(r, p.CidrBlock));
      if (!isRfc1918) warnings.push("CIDR " + p.CidrBlock + " is not RFC 1918 \u2014 private subnets may have issues");
      if (_awsConstraints.vpc.reservedCidrs.some((r) => cidrOverlap(p.CidrBlock, r)))
        warnings.push("172.17.0.0/16 conflicts with Docker/SageMaker internal ranges");
      vpcs.forEach((v) => {
        if (cidrOverlap(p.CidrBlock, v.CidrBlock)) errors.push("Overlaps existing VPC " + gn(v, v.VpcId) + " (" + v.CidrBlock + ")");
      });
      if (vpcs.length >= _awsConstraints.vpc.maxPerRegion) warnings.push("Exceeds default quota of " + _awsConstraints.vpc.maxPerRegion + " VPCs per region (adjustable)");
    }
    if (change.action === "add_subnet") {
      const p = change.params;
      const cidr = parseCIDR(p.CidrBlock);
      if (!cidr) {
        errors.push("Invalid CIDR: " + p.CidrBlock);
        return { valid: false, errors, warnings };
      }
      const prefix = parseInt(p.CidrBlock.split("/")[1], 10);
      if (prefix < _awsConstraints.subnet.cidrPrefixMin || prefix > _awsConstraints.subnet.cidrPrefixMax)
        errors.push("Subnet CIDR must be /16 to /28, got /" + prefix);
      const vpc = vpcs.find((v) => v.VpcId === p.VpcId);
      if (!vpc) {
        errors.push("VPC " + p.VpcId + " not found");
        return { valid: false, errors, warnings };
      }
      if (!cidrContains(vpc.CidrBlock, p.CidrBlock)) errors.push("Subnet CIDR " + p.CidrBlock + " is not within VPC CIDR " + vpc.CidrBlock);
      const vpcSubs = subnets.filter((s) => s.VpcId === p.VpcId);
      vpcSubs.forEach((s) => {
        if (cidrOverlap(p.CidrBlock, s.CidrBlock)) errors.push("Overlaps subnet " + gn(s, s.SubnetId) + " (" + s.CidrBlock + ")");
      });
      if (vpcSubs.length >= _awsConstraints.subnet.maxPerVpc) warnings.push("Exceeds default quota of " + _awsConstraints.subnet.maxPerVpc + " subnets per VPC");
      const usable = Math.pow(2, 32 - prefix) - _awsConstraints.subnet.reservedIps;
      warnings.push(usable + " usable IPs (" + _awsConstraints.subnet.reservedIps + " reserved by AWS)");
      const otherAZSubs = vpcSubs.filter((s) => s.AvailabilityZone && s.AvailabilityZone !== p.AZ);
      if (vpcSubs.length > 0 && otherAZSubs.length === 0) warnings.push("All subnets in same AZ \u2014 consider multi-AZ for high availability");
    }
    if (change.action === "split_subnet") {
      const prefix = parseInt((change.target.CidrBlock || "").split("/")[1], 10);
      if (prefix >= _awsConstraints.subnet.cidrPrefixMax) errors.push("Cannot split /" + prefix + " subnet (minimum is /" + _awsConstraints.subnet.cidrPrefixMax + ")");
      else {
        const newPrefix = prefix + 1;
        const usable = Math.pow(2, 32 - newPrefix) - _awsConstraints.subnet.reservedIps;
        warnings.push("Each half: /" + newPrefix + " = " + usable + " usable IPs");
        if (usable < 16) warnings.push("Very small subnets \u2014 limited IP capacity");
      }
      const insts = ctx ? (ctx.instBySub || {})[change.target.SubnetId] || [] : [];
      if (insts.length) warnings.push(insts.length + " instance(s) will require IP-based migration");
    }
    if (change.action === "add_gateway") {
      const p = change.params;
      if (p.GatewayType === "IGW") {
        const vpcIgws = igws.filter((g) => (g.Attachments || []).some((a) => a.VpcId === p.VpcId));
        if (vpcIgws.length >= _awsConstraints.igw.maxPerVpc)
          errors.push("VPC already has an Internet Gateway (hard limit: 1 per VPC)");
      }
      if (p.GatewayType === "NAT") {
        if (p.SubnetId && !pubSubs.has(p.SubnetId))
          errors.push("NAT Gateway must be placed in a public subnet (one with 0.0.0.0/0 \u2192 IGW route)");
        const subnetAZ = (subnets.find((s) => s.SubnetId === p.SubnetId) || {}).AvailabilityZone;
        if (subnetAZ) {
          const azNats = nats.filter((n) => n.State !== "deleted" && (subnets.find((s) => s.SubnetId === n.SubnetId) || {}).AvailabilityZone === subnetAZ);
          if (azNats.length >= _awsConstraints.nat.maxPerAz) errors.push("Exceeds limit of " + _awsConstraints.nat.maxPerAz + " NAT Gateways in " + subnetAZ);
          else if (azNats.length > 0) warnings.push(subnetAZ + " already has " + azNats.length + " NAT GW(s) \u2014 AWS recommends 1 per AZ");
        }
      }
    }
    if (change.action === "add_route") {
      const p = change.params;
      const t = change.target;
      const dest = p.DestinationCidrBlock;
      if (!parseCIDR(dest) && dest !== "0.0.0.0/0") errors.push("Invalid destination CIDR: " + dest);
      if (_awsConstraints.routeTable.reservedDestinations.some((r) => cidrContains(r, dest) || cidrContains(dest, r)))
        errors.push("Cannot add routes to 169.254.168.0/22 (reserved for AWS services)");
      const rt = rts.find((r) => r.RouteTableId === t.RouteTableId);
      if (rt) {
        if ((rt.Routes || []).some((r) => r.DestinationCidrBlock === dest))
          errors.push("Route table already has a route for " + dest);
        if ((rt.Routes || []).length >= _awsConstraints.routeTable.maxRoutesPerTable)
          warnings.push("Exceeds default quota of " + _awsConstraints.routeTable.maxRoutesPerTable + " routes per table");
      }
      if (dest === "0.0.0.0/0" && p.TargetId && p.TargetId.startsWith("igw-"))
        warnings.push("This will make associated subnets public");
    }
    if (change.action === "add_security_group") {
      const p = change.params;
      const vpcSgs = sgs.filter((s) => s.VpcId === p.VpcId);
      if (vpcSgs.length >= _awsConstraints.securityGroup.maxPerVpc)
        warnings.push("Exceeds default quota of " + _awsConstraints.securityGroup.maxPerVpc + " SGs per VPC");
      if ((p.IngressRules || []).length > _awsConstraints.securityGroup.maxInboundRules)
        errors.push("Exceeds limit of " + _awsConstraints.securityGroup.maxInboundRules + " inbound rules per SG");
      (p.IngressRules || []).forEach((r) => {
        if (r.CidrIp === "0.0.0.0/0" && r.FromPort !== 80 && r.FromPort !== 443 && r.Protocol !== "-1")
          warnings.push("Rule allows 0.0.0.0/0 on port " + r.FromPort + " \u2014 consider restricting source CIDR");
      });
    }
    if (change.action === "add_resource") {
      const p = change.params;
      if (p.SubnetId) {
        const sub = subnets.find((s) => s.SubnetId === p.SubnetId);
        if (sub) {
          const prefix = parseInt(sub.CidrBlock.split("/")[1], 10);
          const usable = Math.pow(2, 32 - prefix) - _awsConstraints.subnet.reservedIps;
          const currentInst = (ctx ? (ctx.instBySub || {})[p.SubnetId] || [] : []).length;
          const remaining = usable - currentInst;
          if (remaining <= 0) warnings.push("Subnet " + gn(sub, sub.SubnetId) + " has no remaining IP capacity (" + usable + " usable, " + currentInst + " used)");
          else if (remaining < 5) warnings.push("Subnet " + gn(sub, sub.SubnetId) + " has only " + remaining + " IPs remaining");
        }
      }
    }
    if (change.action === "remove_resource") {
      const t = change.target;
      if (t.ResourceType === "IGW") {
        const affectedRts = rts.filter((rt) => (rt.Routes || []).some((r) => r.GatewayId === t.ResourceId));
        if (affectedRts.length) warnings.push(affectedRts.length + " route table(s) reference this IGW \u2014 subnets will lose internet access");
      }
      if (t.ResourceType === "NAT") {
        const affectedRts = rts.filter((rt) => (rt.Routes || []).some((r) => r.NatGatewayId === t.ResourceId));
        if (affectedRts.length) warnings.push(affectedRts.length + " route table(s) route through this NAT \u2014 private subnets will lose outbound access");
      }
      if (t.ResourceType === "Subnet") {
        const sub = subnets.find((s) => s.SubnetId === t.ResourceId);
        if (sub) {
          const insts = ctx ? (ctx.instBySub || {})[t.ResourceId] || [] : [];
          if (insts.length) warnings.push(insts.length + " instance(s) in this subnet will be terminated");
          const subNats = nats.filter((n) => n.SubnetId === t.ResourceId);
          if (subNats.length) warnings.push(subNats.length + " NAT Gateway(s) in this subnet will be deleted");
        }
      }
    }
    return { valid: errors.length === 0, errors, warnings };
  }
  function validateDesignState(changes, ctx) {
    const errors = [], warnings = [], stats = {
      subnetsAdded: 0,
      gatewaysAdded: 0,
      resourcesAdded: 0,
      removed: 0,
      routes: 0,
      sgs: 0
    };
    changes.forEach((ch) => {
      if (ch.action === "add_subnet") stats.subnetsAdded++;
      if (ch.action === "add_gateway") stats.gatewaysAdded++;
      if (ch.action === "add_resource") stats.resourcesAdded++;
      if (ch.action === "remove_resource") stats.removed++;
      if (ch.action === "add_route") stats.routes++;
      if (ch.action === "add_security_group") stats.sgs++;
    });
    if (ctx) {
      const igwCounts = {};
      (ctx.igws || []).forEach((g) => {
        (g.Attachments || []).forEach((a) => {
          igwCounts[a.VpcId] = (igwCounts[a.VpcId] || 0) + 1;
        });
      });
      Object.entries(igwCounts).forEach(([vid, count]) => {
        if (count > 1) {
          const v = (ctx.vpcs || []).find((x) => x.VpcId === vid);
          errors.push("VPC " + (v ? gn(v, vid) : vid) + " has " + count + " IGWs (hard limit: 1)");
        }
      });
      const subsByVpc = {};
      (ctx.subnets || []).forEach((s) => {
        (subsByVpc[s.VpcId] = subsByVpc[s.VpcId] || []).push(s);
      });
      Object.entries(subsByVpc).forEach(([vid, subs]) => {
        for (let i = 0; i < subs.length; i++) {
          for (let j = i + 1; j < subs.length; j++) {
            if (cidrOverlap(subs[i].CidrBlock, subs[j].CidrBlock))
              errors.push("Subnets " + gn(subs[i], subs[i].SubnetId) + " and " + gn(subs[j], subs[j].SubnetId) + " have overlapping CIDRs");
          }
        }
      });
      Object.entries(subsByVpc).forEach(([vid, subs]) => {
        const azs = new Set(subs.map((s) => s.AvailabilityZone).filter(Boolean));
        if (subs.length > 1 && azs.size === 1) {
          const v = (ctx.vpcs || []).find((x) => x.VpcId === vid);
          warnings.push("VPC " + (v ? gn(v, vid) : vid) + " \u2014 all " + subs.length + " subnets in single AZ (" + [...azs][0] + ") \u2014 no HA");
        }
      });
      (ctx.nats || []).forEach((n) => {
        if (n.SubnetId && ctx.pubSubs && !ctx.pubSubs.has(n.SubnetId))
          warnings.push("NAT Gateway " + gn(n, n.NatGatewayId) + " is in a private subnet \u2014 will not function");
      });
      const peerPairs = [];
      (ctx.peerings || []).forEach((p) => {
        const rv = p.RequesterVpcInfo, av = p.AccepterVpcInfo;
        if (rv && av && rv.CidrBlock && av.CidrBlock) {
          if (cidrOverlap(rv.CidrBlock, av.CidrBlock))
            errors.push("VPC Peering " + gn(p, p.VpcPeeringConnectionId) + " \u2014 CIDRs overlap: " + rv.CidrBlock + " / " + av.CidrBlock);
          const pair = [rv.VpcId, av.VpcId].sort().join(":");
          if (peerPairs.includes(pair)) warnings.push("Duplicate peering between " + rv.VpcId + " and " + av.VpcId);
          peerPairs.push(pair);
        }
      });
    }
    return { valid: errors.length === 0, errors, warnings, stats };
  }
  function _applyAddVpc(ch, getTa, setTa) {
    const raw = safeParse(getTa("in_vpcs"));
    const vpcs = raw ? ext(raw, ["Vpcs"]) : [];
    const id = ch.params.VpcId || "vpc-design-" + Date.now();
    ch.params.VpcId = id;
    const vpc = { VpcId: id, CidrBlock: ch.params.CidrBlock, State: "available", IsDefault: false, OwnerId: ch.params.AccountId || "design", Tags: [{ Key: "Name", Value: ch.params.Name || "New VPC" }] };
    vpcs.push(vpc);
    setTa("in_vpcs", JSON.stringify({ Vpcs: vpcs }));
    ch._addedIds = [id];
    const rtRaw = safeParse(getTa("in_rts"));
    const rts = rtRaw ? ext(rtRaw, ["RouteTables"]) : [];
    const rtId = ch.params._rtId || "rtb-design-" + Date.now();
    ch.params._rtId = rtId;
    rts.push({ RouteTableId: rtId, VpcId: id, Associations: [{ Main: true, RouteTableId: rtId }], Routes: [{ DestinationCidrBlock: ch.params.CidrBlock, GatewayId: "local", State: "active", Origin: "CreateRouteTable" }], Tags: [{ Key: "Name", Value: (ch.params.Name || "vpc") + "-main-rt" }] });
    setTa("in_rts", JSON.stringify({ RouteTables: rts }));
    const naclRaw = safeParse(getTa("in_nacls"));
    const nacls = naclRaw ? ext(naclRaw, ["NetworkAcls"]) : [];
    const naclId = ch.params._naclId || "acl-design-" + Date.now();
    ch.params._naclId = naclId;
    nacls.push({ NetworkAclId: naclId, VpcId: id, IsDefault: true, Entries: [{ RuleNumber: 100, Protocol: "-1", RuleAction: "allow", Egress: false, CidrBlock: "0.0.0.0/0" }, { RuleNumber: 100, Protocol: "-1", RuleAction: "allow", Egress: true, CidrBlock: "0.0.0.0/0" }, { RuleNumber: 32767, Protocol: "-1", RuleAction: "deny", Egress: false, CidrBlock: "0.0.0.0/0" }, { RuleNumber: 32767, Protocol: "-1", RuleAction: "deny", Egress: true, CidrBlock: "0.0.0.0/0" }], Tags: [{ Key: "Name", Value: (ch.params.Name || "vpc") + "-default-nacl" }] });
    setTa("in_nacls", JSON.stringify({ NetworkAcls: nacls }));
    const sgRaw = safeParse(getTa("in_sgs"));
    const sgs = sgRaw ? ext(sgRaw, ["SecurityGroups"]) : [];
    const sgId = ch.params._sgId || "sg-design-" + Date.now();
    ch.params._sgId = sgId;
    sgs.push({ GroupId: sgId, GroupName: "default", VpcId: id, Description: "default VPC security group", IpPermissions: [{ IpProtocol: "-1", IpRanges: [], UserIdGroupPairs: [{ GroupId: sgId }] }], IpPermissionsEgress: [{ IpProtocol: "-1", IpRanges: [{ CidrIp: "0.0.0.0/0" }] }], Tags: [{ Key: "Name", Value: "default" }] });
    setTa("in_sgs", JSON.stringify({ SecurityGroups: sgs }));
  }
  function _applyAddSubnet(ch, getTa, setTa) {
    const raw = safeParse(getTa("in_subnets"));
    const subs = raw ? ext(raw, ["Subnets"]) : [];
    const subId = ch.params.SubnetId || "subnet-design-" + Date.now();
    ch.params.SubnetId = subId;
    subs.push({ SubnetId: subId, VpcId: ch.params.VpcId, CidrBlock: ch.params.CidrBlock, AvailabilityZone: ch.params.AZ, MapPublicIpOnLaunch: ch.params.isPublic || false, Tags: [{ Key: "Name", Value: ch.params.Name || "New Subnet" }] });
    setTa("in_subnets", JSON.stringify({ Subnets: subs }));
    ch._addedIds = [subId];
  }
  function _applySplitSubnet(ch, getTa, setTa) {
    const raw = safeParse(getTa("in_subnets"));
    const subs = raw ? ext(raw, ["Subnets"]) : [];
    const idx = subs.findIndex((s) => s.SubnetId === ch.target.SubnetId);
    if (idx < 0) return;
    const orig = subs[idx];
    const halves = splitCIDR(orig.CidrBlock);
    if (!halves) return;
    if (!ch.params.newIds) ch.params.newIds = ["subnet-split-a-" + Date.now(), "subnet-split-b-" + Date.now()];
    const sub1 = { ...orig, SubnetId: ch.params.newIds[0], CidrBlock: halves[0], Tags: [{ Key: "Name", Value: ch.params.names?.[0] || gn(orig, "") + "_a" }] };
    const sub2 = { ...orig, SubnetId: ch.params.newIds[1], CidrBlock: halves[1], Tags: [{ Key: "Name", Value: ch.params.names?.[1] || gn(orig, "") + "_b" }] };
    subs.splice(idx, 1, sub1, sub2);
    setTa("in_subnets", JSON.stringify({ Subnets: subs }));
    ch._removedIds = [ch.target.SubnetId];
    ch._addedIds = [sub1.SubnetId, sub2.SubnetId];
    const instRaw = safeParse(getTa("in_ec2"));
    if (instRaw) {
      const reservations = ext(instRaw, ["Reservations"]);
      reservations.forEach((res) => {
        (res.Instances || []).forEach((inst) => {
          if (inst.SubnetId === ch.target.SubnetId && inst.PrivateIpAddress) {
            inst.SubnetId = ipInCIDR(inst.PrivateIpAddress, halves[0]) ? sub1.SubnetId : sub2.SubnetId;
          }
        });
      });
      setTa("in_ec2", JSON.stringify({ Reservations: reservations }));
    }
  }
  function _applyAddGateway(ch, getTa, setTa) {
    const type = ch.params.GatewayType;
    if (type === "IGW") {
      const raw = safeParse(getTa("in_igws"));
      const igws = raw ? ext(raw, ["InternetGateways"]) : [];
      const id = ch.params.GatewayId || "igw-design-" + Date.now();
      ch.params.GatewayId = id;
      igws.push({ InternetGatewayId: id, Attachments: [{ VpcId: ch.params.VpcId, State: "available" }], Tags: [{ Key: "Name", Value: ch.params.Name || "New IGW" }] });
      setTa("in_igws", JSON.stringify({ InternetGateways: igws }));
      ch._addedIds = [id];
    } else if (type === "NAT") {
      const raw = safeParse(getTa("in_nats"));
      const nats = raw ? ext(raw, ["NatGateways"]) : [];
      const id = ch.params.GatewayId || "nat-design-" + Date.now();
      ch.params.GatewayId = id;
      nats.push({ NatGatewayId: id, VpcId: ch.params.VpcId, SubnetId: ch.params.SubnetId, State: "available", Tags: [{ Key: "Name", Value: ch.params.Name || "New NAT" }] });
      setTa("in_nats", JSON.stringify({ NatGateways: nats }));
      ch._addedIds = [id];
    } else if (type === "VPCE") {
      const raw = safeParse(getTa("in_vpces"));
      const vpces = raw ? ext(raw, ["VpcEndpoints"]) : [];
      const id = ch.params.GatewayId || "vpce-design-" + Date.now();
      ch.params.GatewayId = id;
      vpces.push({ VpcEndpointId: id, VpcId: ch.params.VpcId, ServiceName: ch.params.ServiceName || "com.amazonaws.region.s3", VpcEndpointType: ch.params.EndpointType || "Gateway", State: "available", Tags: [{ Key: "Name", Value: ch.params.Name || "New VPCE" }] });
      setTa("in_vpces", JSON.stringify({ VpcEndpoints: vpces }));
      ch._addedIds = [id];
    }
  }
  function _applyAddRoute(ch, getTa, setTa) {
    const raw = safeParse(getTa("in_rts"));
    const rts = raw ? ext(raw, ["RouteTables"]) : [];
    const rt = rts.find((r) => r.RouteTableId === ch.target.RouteTableId);
    if (!rt) return;
    rt.Routes = rt.Routes || [];
    rt.Routes.push({ DestinationCidrBlock: ch.params.DestinationCidrBlock, GatewayId: ch.params.TargetId, State: "active" });
    setTa("in_rts", JSON.stringify({ RouteTables: rts }));
    ch._modifiedIds = [ch.target.RouteTableId];
  }
  function _applyAddResource(ch, getTa, setTa) {
    const type = ch.params.ResourceType;
    if (type === "EC2") {
      const raw = safeParse(getTa("in_ec2"));
      const reservations = raw ? ext(raw, ["Reservations"]) : [];
      const id = ch.params.ResourceId || "i-design-" + Date.now();
      ch.params.ResourceId = id;
      reservations.push({ Instances: [{ InstanceId: id, SubnetId: ch.params.SubnetId, VpcId: ch.params.VpcId, InstanceType: ch.params.InstanceType || "t3.micro", State: { Name: "running" }, PrivateIpAddress: ch.params.PrivateIp || "", Tags: [{ Key: "Name", Value: ch.params.Name || "New Instance" }] }] });
      setTa("in_ec2", JSON.stringify({ Reservations: reservations }));
      ch._addedIds = [id];
    } else if (type === "RDS") {
      const raw = safeParse(getTa("in_rds"));
      const rds = raw ? ext(raw, ["DBInstances"]) : [];
      const id = ch.params.ResourceId || "db-design-" + Date.now();
      ch.params.ResourceId = id;
      rds.push({ DBInstanceIdentifier: id, DBSubnetGroup: { VpcId: ch.params.VpcId, Subnets: [{ SubnetIdentifier: ch.params.SubnetId }] }, DBInstanceClass: ch.params.InstanceClass || "db.t3.micro", Engine: ch.params.Engine || "mysql", DBInstanceStatus: "available" });
      setTa("in_rds", JSON.stringify({ DBInstances: rds }));
      ch._addedIds = [id];
    } else if (type === "ElastiCache") {
      const raw = safeParse(getTa("in_elasticache"));
      const clusters = raw ? ext(raw, ["CacheClusters"]) : [];
      const id = ch.params.ResourceId || "cache-design-" + Date.now();
      ch.params.ResourceId = id;
      clusters.push({ CacheClusterId: id, CacheNodeType: ch.params.NodeType || "cache.t3.micro", Engine: ch.params.Engine || "redis", CacheClusterStatus: "available", CacheNodes: [{ CacheNodeId: "0001", Endpoint: { Address: id + ".cache.amazonaws.com", Port: 6379 } }], ConfigurationEndpoint: { Address: id + ".cache.amazonaws.com", Port: 6379 } });
      setTa("in_elasticache", JSON.stringify({ CacheClusters: clusters }));
      ch._addedIds = [id];
    } else if (type === "Lambda") {
      const raw = safeParse(getTa("in_lambda"));
      const fns = raw ? ext(raw, ["Functions"]) : [];
      const id = ch.params.ResourceId || "lambda-design-" + Date.now();
      ch.params.ResourceId = id;
      fns.push({ FunctionName: ch.params.Name || "new-function", FunctionArn: "arn:aws:lambda:::function:" + (ch.params.Name || id), VpcConfig: { VpcId: ch.params.VpcId, SubnetIds: [ch.params.SubnetId], SecurityGroupIds: ch.params.SGIds || [] }, Runtime: ch.params.Runtime || "nodejs18.x", MemorySize: 128 });
      setTa("in_lambda", JSON.stringify({ Functions: fns }));
      ch._addedIds = [id];
    } else if (type === "ECS") {
      const raw = safeParse(getTa("in_ecs"));
      const svcs = raw ? ext(raw, ["services", "Services"]) : [];
      const id = ch.params.ResourceId || "ecs-svc-design-" + Date.now();
      ch.params.ResourceId = id;
      svcs.push({ serviceName: ch.params.Name || "new-service", serviceArn: "arn:aws:ecs:::service/" + id, networkConfiguration: { awsvpcConfiguration: { subnets: [ch.params.SubnetId], securityGroups: ch.params.SGIds || [] } }, runningCount: ch.params.DesiredCount || 1, desiredCount: ch.params.DesiredCount || 1, launchType: "FARGATE" });
      setTa("in_ecs", JSON.stringify({ services: svcs }));
      ch._addedIds = [id];
    } else if (type === "Redshift") {
      const raw = safeParse(getTa("in_redshift"));
      const clusters = raw ? ext(raw, ["Clusters"]) : [];
      const id = ch.params.ResourceId || "redshift-design-" + Date.now();
      ch.params.ResourceId = id;
      clusters.push({ ClusterIdentifier: id, NodeType: ch.params.NodeType || "dc2.large", ClusterStatus: "available", DBName: ch.params.DBName || "dev", Endpoint: { Address: id + ".redshift.amazonaws.com", Port: 5439 }, VpcId: ch.params.VpcId, ClusterSubnetGroupName: "design-subnet-group" });
      setTa("in_redshift", JSON.stringify({ Clusters: clusters }));
      ch._addedIds = [id];
    }
  }
  function _applyAddSecurityGroup(ch, getTa, setTa) {
    const raw = safeParse(getTa("in_sgs"));
    const sgs = raw ? ext(raw, ["SecurityGroups"]) : [];
    const id = ch.params.GroupId || "sg-design-" + Date.now();
    ch.params.GroupId = id;
    const sg = { GroupId: id, GroupName: ch.params.Name || "new-sg", VpcId: ch.params.VpcId, Description: ch.params.Description || "Design mode security group", IpPermissions: [], IpPermissionsEgress: [], Tags: [{ Key: "Name", Value: ch.params.Name || "new-sg" }] };
    if (ch.params.IngressRules) {
      ch.params.IngressRules.forEach((r) => {
        sg.IpPermissions.push({ IpProtocol: r.Protocol || "tcp", FromPort: r.FromPort, ToPort: r.ToPort, IpRanges: [{ CidrIp: r.CidrIp || "0.0.0.0/0" }] });
      });
    }
    sgs.push(sg);
    setTa("in_sgs", JSON.stringify({ SecurityGroups: sgs }));
    ch._addedIds = [id];
  }
  function _applyRemoveResource(ch, getTa, setTa) {
    ch._removedIds = [ch.target.ResourceId];
    const type = ch.target.ResourceType;
    if (type === "EC2") {
      const raw = safeParse(getTa("in_ec2"));
      if (!raw) return;
      const reservations = ext(raw, ["Reservations"]);
      reservations.forEach((res) => {
        res.Instances = (res.Instances || []).filter((i) => i.InstanceId !== ch.target.ResourceId);
      });
      setTa("in_ec2", JSON.stringify({ Reservations: reservations.filter((r) => (r.Instances || []).length) }));
    } else if (type === "RDS") {
      const raw = safeParse(getTa("in_rds"));
      const rds = raw ? ext(raw, ["DBInstances"]) : [];
      setTa("in_rds", JSON.stringify({ DBInstances: rds.filter((d) => d.DBInstanceIdentifier !== ch.target.ResourceId) }));
    } else if (type === "ElastiCache") {
      const raw = safeParse(getTa("in_elasticache"));
      const c = raw ? ext(raw, ["CacheClusters"]) : [];
      setTa("in_elasticache", JSON.stringify({ CacheClusters: c.filter((d) => d.CacheClusterId !== ch.target.ResourceId) }));
    } else if (type === "Lambda") {
      const raw = safeParse(getTa("in_lambda"));
      const fns = raw ? ext(raw, ["Functions"]) : [];
      setTa("in_lambda", JSON.stringify({ Functions: fns.filter((f) => f.FunctionName !== ch.target.ResourceId && f.FunctionArn !== ch.target.ResourceId) }));
    } else if (type === "Subnet") {
      const raw = safeParse(getTa("in_subnets"));
      const subs = raw ? ext(raw, ["Subnets"]) : [];
      setTa("in_subnets", JSON.stringify({ Subnets: subs.filter((s) => s.SubnetId !== ch.target.ResourceId) }));
    } else if (type === "Redshift") {
      const raw = safeParse(getTa("in_redshift"));
      const c = raw ? ext(raw, ["Clusters"]) : [];
      setTa("in_redshift", JSON.stringify({ Clusters: c.filter((d) => d.ClusterIdentifier !== ch.target.ResourceId) }));
    } else if (type === "IGW") {
      const raw = safeParse(getTa("in_igws"));
      const igws = raw ? ext(raw, ["InternetGateways"]) : [];
      setTa("in_igws", JSON.stringify({ InternetGateways: igws.filter((g) => g.InternetGatewayId !== ch.target.ResourceId) }));
    } else if (type === "NAT") {
      const raw = safeParse(getTa("in_nats"));
      const nats = raw ? ext(raw, ["NatGateways"]) : [];
      setTa("in_nats", JSON.stringify({ NatGateways: nats.filter((g) => g.NatGatewayId !== ch.target.ResourceId) }));
    } else if (type === "VPCE") {
      const raw = safeParse(getTa("in_vpces"));
      const vpces = raw ? ext(raw, ["VpcEndpoints"]) : [];
      setTa("in_vpces", JSON.stringify({ VpcEndpoints: vpces.filter((g) => g.VpcEndpointId !== ch.target.ResourceId) }));
    }
  }
  var _designApplyFns = {
    add_vpc: _applyAddVpc,
    add_subnet: _applyAddSubnet,
    split_subnet: _applySplitSubnet,
    add_gateway: _applyAddGateway,
    add_route: _applyAddRoute,
    add_resource: _applyAddResource,
    add_security_group: _applyAddSecurityGroup,
    remove_resource: _applyRemoveResource
  };
  function _generateCLI(ch) {
    const cmds = [];
    if (ch.action === "add_vpc") {
      cmds.push(`aws ec2 create-vpc --cidr-block ${ch.params.CidrBlock}${ch.params.Name ? " --tag-specifications 'ResourceType=vpc,Tags=[{Key=Name,Value=" + ch.params.Name + "}]'" : ""}`);
      cmds.push("# Default route table, NACL, and SG are created automatically by AWS");
    }
    if (ch.action === "add_subnet") cmds.push(`aws ec2 create-subnet --vpc-id ${ch.params.VpcId} --cidr-block ${ch.params.CidrBlock} --availability-zone ${ch.params.AZ}${ch.params.Name ? " --tag-specifications 'ResourceType=subnet,Tags=[{Key=Name,Value=" + ch.params.Name + "}]'" : ""}`);
    if (ch.action === "split_subnet") {
      cmds.push("# Split subnet: delete original, create two new");
      cmds.push(`aws ec2 delete-subnet --subnet-id ${ch.target.SubnetId}`);
      const halves = splitCIDR(ch.target.CidrBlock);
      if (halves) {
        const az = ch.params.AZ || "$AZ";
        cmds.push(`aws ec2 create-subnet --vpc-id $VPC_ID --cidr-block ${halves[0]} --availability-zone ${az}${ch.params.names?.[0] ? " --tag-specifications 'ResourceType=subnet,Tags=[{Key=Name,Value=" + ch.params.names[0] + "}]'" : ""}`);
        cmds.push(`aws ec2 create-subnet --vpc-id $VPC_ID --cidr-block ${halves[1]} --availability-zone ${az}${ch.params.names?.[1] ? " --tag-specifications 'ResourceType=subnet,Tags=[{Key=Name,Value=" + ch.params.names[1] + "}]'" : ""}`);
      }
    }
    if (ch.action === "add_gateway") {
      if (ch.params.GatewayType === "IGW") {
        cmds.push(`aws ec2 create-internet-gateway${ch.params.Name ? " --tag-specifications 'ResourceType=internet-gateway,Tags=[{Key=Name,Value=" + ch.params.Name + "}]'" : ""}`);
        cmds.push(`aws ec2 attach-internet-gateway --internet-gateway-id $IGW_ID --vpc-id ${ch.params.VpcId}`);
      }
      if (ch.params.GatewayType === "NAT") {
        cmds.push("# Allocate EIP first: aws ec2 allocate-address --domain vpc");
        cmds.push(`aws ec2 create-nat-gateway --subnet-id ${ch.params.SubnetId || "$SUBNET_ID"} --allocation-id $EIP_ALLOC_ID${ch.params.Name ? " --tag-specifications 'ResourceType=natgateway,Tags=[{Key=Name,Value=" + ch.params.Name + "}]'" : ""}`);
      }
      if (ch.params.GatewayType === "VPCE") cmds.push(`aws ec2 create-vpc-endpoint --vpc-id ${ch.params.VpcId} --service-name ${ch.params.ServiceName || "com.amazonaws.REGION.s3"} --vpc-endpoint-type ${ch.params.EndpointType || "Gateway"}`);
    }
    if (ch.action === "add_route") cmds.push(`aws ec2 create-route --route-table-id ${ch.target.RouteTableId} --destination-cidr-block ${ch.params.DestinationCidrBlock} --gateway-id ${ch.params.TargetId}`);
    if (ch.action === "add_resource") {
      if (ch.params.ResourceType === "EC2") cmds.push(`aws ec2 run-instances --subnet-id ${ch.params.SubnetId} --instance-type ${ch.params.InstanceType || "t3.micro"} --image-id $AMI_ID${ch.params.Name ? " --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=" + ch.params.Name + "}]'" : ""}`);
      if (ch.params.ResourceType === "RDS") cmds.push(`aws rds create-db-instance --db-instance-identifier ${ch.params.Name || "new-db"} --db-instance-class ${ch.params.InstanceClass || "db.t3.micro"} --engine ${ch.params.Engine || "mysql"} --master-username admin --master-user-password $DB_PASSWORD`);
      if (ch.params.ResourceType === "Lambda") cmds.push(`aws lambda create-function --function-name ${ch.params.Name || "new-function"} --runtime ${ch.params.Runtime || "nodejs18.x"} --role $LAMBDA_ROLE_ARN --handler index.handler --zip-file fileb://function.zip --vpc-config SubnetIds=${ch.params.SubnetId}`);
      if (ch.params.ResourceType === "ElastiCache") cmds.push(`aws elasticache create-cache-cluster --cache-cluster-id ${ch.params.Name || "new-cache"} --cache-node-type ${ch.params.NodeType || "cache.t3.micro"} --engine ${ch.params.Engine || "redis"} --num-cache-nodes 1`);
      if (ch.params.ResourceType === "ECS") cmds.push(`aws ecs create-service --cluster $CLUSTER --service-name ${ch.params.Name || "new-service"} --task-definition $TASK_DEF --desired-count ${ch.params.DesiredCount || 1} --launch-type FARGATE --network-configuration "awsvpcConfiguration={subnets=[${ch.params.SubnetId}]}"`);
      if (ch.params.ResourceType === "Redshift") cmds.push(`aws redshift create-cluster --cluster-identifier ${ch.params.Name || "new-cluster"} --node-type ${ch.params.NodeType || "dc2.large"} --master-username admin --master-user-password $RS_PASSWORD --number-of-nodes 1`);
    }
    if (ch.action === "add_security_group") {
      cmds.push(`aws ec2 create-security-group --group-name ${ch.params.Name || "new-sg"} --description "${ch.params.Description || "Design mode SG"}" --vpc-id ${ch.params.VpcId}`);
      if (ch.params.IngressRules) {
        ch.params.IngressRules.forEach((r) => {
          if (r.Protocol === "-1") cmds.push(`aws ec2 authorize-security-group-ingress --group-id $SG_ID --protocol -1 --cidr ${r.CidrIp || "0.0.0.0/0"}`);
          else cmds.push(`aws ec2 authorize-security-group-ingress --group-id $SG_ID --protocol ${r.Protocol} --port ${r.FromPort} --cidr ${r.CidrIp || "0.0.0.0/0"}`);
        });
      }
    }
    if (ch.action === "remove_resource") {
      const id = ch.target.ResourceId;
      const t = ch.target.ResourceType;
      if (t === "EC2") cmds.push(`aws ec2 terminate-instances --instance-ids ${id}`);
      if (t === "RDS") cmds.push(`aws rds delete-db-instance --db-instance-identifier ${id} --skip-final-snapshot`);
      if (t === "Lambda") cmds.push(`aws lambda delete-function --function-name ${id}`);
      if (t === "Subnet") cmds.push(`aws ec2 delete-subnet --subnet-id ${id}`);
      if (t === "IGW") {
        cmds.push(`aws ec2 detach-internet-gateway --internet-gateway-id ${id} --vpc-id $VPC_ID`);
        cmds.push(`aws ec2 delete-internet-gateway --internet-gateway-id ${id}`);
      }
      if (t === "NAT") cmds.push(`aws ec2 delete-nat-gateway --nat-gateway-id ${id}`);
      if (t === "VPCE") cmds.push(`aws ec2 delete-vpc-endpoints --vpc-endpoint-ids ${id}`);
    }
    return cmds;
  }
  function _generateWarnings() {
    const w = [];
    const splits = _designChanges.filter((c) => c.action === "split_subnet");
    if (splits.length) w.push(splits.length + " subnet split(s) require instance migration");
    const removes = _designChanges.filter((c) => c.action === "remove_resource");
    if (removes.length) w.push(removes.length + " resource removal(s) \u2014 verify dependencies first");
    return w;
  }
  function importDesignPlan(json, enterFn, addChangeFn) {
    try {
      const plan = typeof json === "string" ? JSON.parse(json) : json;
      if (!plan.changes || !Array.isArray(plan.changes)) {
        alert("Invalid plan format");
        return;
      }
      if (!_designMode) enterFn();
      if (plan.region) _designRegion = plan.region;
      let imported = 0, blocked = 0;
      plan.changes.forEach((ch) => {
        addChangeFn(ch);
        if (ch._invalid) blocked++;
        else imported++;
      });
      if (blocked > 0) alert("Imported " + imported + " changes, " + blocked + " blocked by validation errors. Check the change log for details.");
    } catch (e) {
      alert("Failed to import plan: " + e.message);
    }
  }
  function detectAZs(subnets) {
    const azSet = /* @__PURE__ */ new Set();
    (subnets || []).forEach((s) => {
      if (s.AvailabilityZone) azSet.add(s.AvailabilityZone);
    });
    if (azSet.size > 0) return Array.from(azSet).sort();
    if (_regionAZs[_designRegion]) return _regionAZs[_designRegion];
    return ["us-east-1a", "us-east-1b", "us-east-1c"];
  }
  Object.defineProperty(window, "_designMode", {
    get() {
      return _designMode;
    },
    set(v) {
      _designMode = v;
    },
    configurable: true
  });
  Object.defineProperty(window, "_designChanges", {
    get() {
      return _designChanges;
    },
    set(v) {
      _designChanges = v;
    },
    configurable: true
  });
  Object.defineProperty(window, "_designBaseline", {
    get() {
      return _designBaseline;
    },
    set(v) {
      _designBaseline = v;
    },
    configurable: true
  });
  Object.defineProperty(window, "_designDebounce", {
    get() {
      return _designDebounce;
    },
    set(v) {
      _designDebounce = v;
    },
    configurable: true
  });
  Object.defineProperty(window, "_lastDesignValidation", {
    get() {
      return _lastDesignValidation;
    },
    set(v) {
      _lastDesignValidation = v;
    },
    configurable: true
  });
  Object.defineProperty(window, "_sidebarWasCollapsed", {
    get() {
      return _sidebarWasCollapsed;
    },
    set(v) {
      _sidebarWasCollapsed = v;
    },
    configurable: true
  });
  Object.defineProperty(window, "_designRegion", {
    get() {
      return _designRegion;
    },
    set(v) {
      _designRegion = v;
    },
    configurable: true
  });
  window._regionAZs = _regionAZs;
  window._awsConstraints = _awsConstraints;
  window._designApplyFns = _designApplyFns;
  window.validateDesignChange = validateDesignChange;
  window.validateDesignState = validateDesignState;
  window._generateCLI = _generateCLI;
  window._generateWarnings = _generateWarnings;
  window.importDesignPlan = importDesignPlan;
  window.detectAZs = detectAZs;
  window.getDesignMode = getDesignMode;
  window.setDesignMode = setDesignMode;
  window.getDesignChanges = getDesignChanges;
  window.setDesignChanges = setDesignChanges;
  window.getDesignBaseline = getDesignBaseline;
  window.setDesignBaseline = setDesignBaseline;
  window.getDesignDebounce = getDesignDebounce;
  window.setDesignDebounce = setDesignDebounce;
  window.getLastDesignValidation = getLastDesignValidation;
  window.setLastDesignValidation = setLastDesignValidation;
  window.getSidebarWasCollapsed = getSidebarWasCollapsed;
  window.setSidebarWasCollapsed = setSidebarWasCollapsed;
  window.getDesignRegion = getDesignRegion;
  window.setDesignRegion = setDesignRegion;

  // src/modules/flow-tracing.js
  var flow_tracing_exports = {};
  __export(flow_tracing_exports, {
    findAlternatePaths: () => findAlternatePaths,
    getFlowActiveLeg: () => getFlowActiveLeg,
    getFlowBlocked: () => getFlowBlocked,
    getFlowConfig: () => getFlowConfig,
    getFlowLegs: () => getFlowLegs,
    getFlowMode: () => getFlowMode,
    getFlowPath: () => getFlowPath,
    getFlowSelecting: () => getFlowSelecting,
    getFlowSelectingWaypoint: () => getFlowSelectingWaypoint,
    getFlowSource: () => getFlowSource,
    getFlowStepIndex: () => getFlowStepIndex,
    getFlowSuggestions: () => getFlowSuggestions,
    getFlowTarget: () => getFlowTarget,
    getFlowWaypoints: () => getFlowWaypoints,
    hopTypeLabel: () => hopTypeLabel,
    resetFlowState: () => resetFlowState,
    resolveClickTarget: () => resolveClickTarget,
    resolveNetworkPosition: () => resolveNetworkPosition,
    setFlowActiveLeg: () => setFlowActiveLeg,
    setFlowBlocked: () => setFlowBlocked,
    setFlowConfig: () => setFlowConfig,
    setFlowLegs: () => setFlowLegs,
    setFlowMode: () => setFlowMode,
    setFlowPath: () => setFlowPath,
    setFlowSelecting: () => setFlowSelecting,
    setFlowSelectingWaypoint: () => setFlowSelectingWaypoint,
    setFlowSource: () => setFlowSource,
    setFlowStepIndex: () => setFlowStepIndex,
    setFlowSuggestions: () => setFlowSuggestions,
    setFlowTarget: () => setFlowTarget,
    setFlowWaypoints: () => setFlowWaypoints,
    suggestPort: () => suggestPort,
    traceFlow: () => traceFlow,
    traceFlowLeg: () => traceFlowLeg,
    traceInternetToResource: () => traceInternetToResource,
    traceResourceToInternet: () => traceResourceToInternet
  });
  var _flowMode = false;
  var _flowSource = null;
  var _flowTarget = null;
  var _flowConfig = { protocol: "tcp", port: 443 };
  var _flowPath = null;
  var _flowBlocked = null;
  var _flowStepIndex = -1;
  var _flowSelecting = null;
  var _flowWaypoints = [];
  var _flowLegs = [];
  var _flowActiveLeg = -1;
  var _flowSelectingWaypoint = -1;
  var _flowSuggestions = [];
  function getFlowMode() {
    return _flowMode;
  }
  function setFlowMode(v) {
    _flowMode = v;
  }
  function getFlowSource() {
    return _flowSource;
  }
  function setFlowSource(v) {
    _flowSource = v;
  }
  function getFlowTarget() {
    return _flowTarget;
  }
  function setFlowTarget(v) {
    _flowTarget = v;
  }
  function getFlowConfig() {
    return _flowConfig;
  }
  function setFlowConfig(v) {
    _flowConfig = v;
  }
  function getFlowPath() {
    return _flowPath;
  }
  function setFlowPath(v) {
    _flowPath = v;
  }
  function getFlowBlocked() {
    return _flowBlocked;
  }
  function setFlowBlocked(v) {
    _flowBlocked = v;
  }
  function getFlowStepIndex() {
    return _flowStepIndex;
  }
  function setFlowStepIndex(v) {
    _flowStepIndex = v;
  }
  function getFlowSelecting() {
    return _flowSelecting;
  }
  function setFlowSelecting(v) {
    _flowSelecting = v;
  }
  function getFlowWaypoints() {
    return _flowWaypoints;
  }
  function setFlowWaypoints(v) {
    _flowWaypoints = v;
  }
  function getFlowLegs() {
    return _flowLegs;
  }
  function setFlowLegs(v) {
    _flowLegs = v;
  }
  function getFlowActiveLeg() {
    return _flowActiveLeg;
  }
  function setFlowActiveLeg(v) {
    _flowActiveLeg = v;
  }
  function getFlowSelectingWaypoint() {
    return _flowSelectingWaypoint;
  }
  function setFlowSelectingWaypoint(v) {
    _flowSelectingWaypoint = v;
  }
  function getFlowSuggestions() {
    return _flowSuggestions;
  }
  function setFlowSuggestions(v) {
    _flowSuggestions = v;
  }
  function resetFlowState() {
    _flowMode = false;
    _flowSource = null;
    _flowTarget = null;
    _flowConfig = { protocol: "tcp", port: 443 };
    _flowPath = null;
    _flowBlocked = null;
    _flowStepIndex = -1;
    _flowSelecting = null;
    _flowWaypoints = [];
    _flowLegs = [];
    _flowActiveLeg = -1;
    _flowSelectingWaypoint = -1;
    _flowSuggestions = [];
  }
  function suggestPort(targetType, targetResource) {
    if (targetType === "rds") return targetResource && targetResource.Endpoint && targetResource.Endpoint.Port || 3306;
    if (targetType === "ecache") return 6379;
    if (targetType === "alb") return 443;
    if (targetType === "instance") return 22;
    if (targetType === "lambda") return 443;
    if (targetType === "ecs") return 443;
    return 443;
  }
  var HOP_TYPE_LABELS = {
    "source": "Source",
    "target": "Target",
    "route-table": "Route Table",
    "nacl-outbound": "NACL Outbound",
    "nacl-inbound": "NACL Inbound",
    "sg-outbound": "SG Outbound",
    "sg-inbound": "SG Inbound",
    "peering": "VPC Peering",
    "tgw": "Transit Gateway",
    "cross-vpc": "Cross-VPC",
    "error": "Error",
    "igw-check": "IGW Check"
  };
  function hopTypeLabel(type) {
    return HOP_TYPE_LABELS[type] || type;
  }
  function resolveNetworkPosition(type, id, ctx) {
    if (!ctx) return null;
    if (type === "internet") {
      return { subnetId: null, vpcId: null, cidr: "0.0.0.0/0", sgs: [], name: "Internet", ip: "0.0.0.0" };
    }
    if (type === "subnet") {
      var sub = (ctx.subnets || []).find(function(s) {
        return s.SubnetId === id;
      });
      if (!sub) return null;
      return {
        subnetId: sub.SubnetId,
        vpcId: sub.VpcId,
        cidr: sub.CidrBlock,
        sgs: [],
        name: sub.Tags ? (sub.Tags.find(function(t) {
          return t.Key === "Name";
        }) || {}).Value || sub.SubnetId : sub.SubnetId
      };
    }
    if (type === "instance") {
      var inst = null;
      Object.keys(ctx.instBySub || {}).forEach(function(sid2) {
        (ctx.instBySub[sid2] || []).forEach(function(i) {
          if (i.InstanceId === id) inst = i;
        });
      });
      if (!inst) return null;
      var iSgs = (inst.SecurityGroups || []).map(function(s) {
        return s.GroupId;
      });
      var fullSgs = iSgs.map(function(gid) {
        return (ctx.sgs || []).find(function(s) {
          return s.GroupId === gid;
        });
      }).filter(Boolean);
      return {
        subnetId: inst.SubnetId,
        vpcId: inst.VpcId || ((ctx.subnets || []).find(function(s) {
          return s.SubnetId === inst.SubnetId;
        }) || {}).VpcId,
        cidr: inst.PrivateIpAddress ? inst.PrivateIpAddress + "/32" : null,
        sgs: fullSgs,
        name: inst.Tags ? (inst.Tags.find(function(t) {
          return t.Key === "Name";
        }) || {}).Value || inst.InstanceId : inst.InstanceId,
        ip: inst.PrivateIpAddress
      };
    }
    if (type === "rds") {
      var rds2 = null;
      var rSid = null;
      Object.keys(ctx.rdsBySub || {}).forEach(function(sid2) {
        (ctx.rdsBySub[sid2] || []).forEach(function(d) {
          if (d.DBInstanceIdentifier === id) {
            rds2 = d;
            rSid = sid2;
          }
        });
      });
      if (!rds2) return null;
      var rVpc = ((ctx.subnets || []).find(function(s) {
        return s.SubnetId === rSid;
      }) || {}).VpcId;
      var rSgs2 = (rds2.VpcSecurityGroups || []).map(function(s) {
        return (ctx.sgs || []).find(function(sg) {
          return sg.GroupId === s.VpcSecurityGroupId;
        });
      }).filter(Boolean);
      var rSubCidr = rSid ? ((ctx.subnets || []).find(function(s) {
        return s.SubnetId === rSid;
      }) || {}).CidrBlock : null;
      return { subnetId: rSid, vpcId: rVpc, cidr: rSubCidr, sgs: rSgs2, name: rds2.DBInstanceIdentifier };
    }
    if (type === "alb") {
      var alb2 = null;
      var aSid = null;
      Object.keys(ctx.albBySub || {}).forEach(function(sid2) {
        (ctx.albBySub[sid2] || []).forEach(function(a) {
          var aid = a.LoadBalancerArn ? a.LoadBalancerArn.split("/").pop() : "";
          if (aid === id || a.LoadBalancerName === id) {
            alb2 = a;
            aSid = sid2;
          }
        });
      });
      if (!alb2) return null;
      var aVpc = ((ctx.subnets || []).find(function(s) {
        return s.SubnetId === aSid;
      }) || {}).VpcId;
      var aSgs = (alb2.SecurityGroups || []).map(function(gid) {
        return (ctx.sgs || []).find(function(sg) {
          return sg.GroupId === gid;
        });
      }).filter(Boolean);
      return { subnetId: aSid, vpcId: aVpc, cidr: null, sgs: aSgs, name: alb2.LoadBalancerName || id };
    }
    if (type === "lambda") {
      var fn2 = null;
      var fSid = null;
      Object.keys(ctx.lambdaBySub || {}).forEach(function(sid2) {
        (ctx.lambdaBySub[sid2] || []).forEach(function(f) {
          if (f.FunctionName === id) {
            fn2 = f;
            fSid = sid2;
          }
        });
      });
      if (!fn2) return null;
      var fVpc = ((ctx.subnets || []).find(function(s) {
        return s.SubnetId === fSid;
      }) || {}).VpcId;
      var fSgs2 = ((fn2.VpcConfig || {}).SecurityGroupIds || []).map(function(gid) {
        return (ctx.sgs || []).find(function(sg) {
          return sg.GroupId === gid;
        });
      }).filter(Boolean);
      return { subnetId: fSid, vpcId: fVpc, cidr: null, sgs: fSgs2, name: fn2.FunctionName };
    }
    if (type === "ecs") {
      var ecs2 = null;
      var eSid = null;
      Object.keys(ctx.ecsBySub || {}).forEach(function(sid2) {
        (ctx.ecsBySub[sid2] || []).forEach(function(s) {
          if (s.serviceName === id) {
            ecs2 = s;
            eSid = sid2;
          }
        });
      });
      if (!ecs2) return null;
      var eVpc = ((ctx.subnets || []).find(function(s) {
        return s.SubnetId === eSid;
      }) || {}).VpcId;
      var eNc = (ecs2.networkConfiguration || {}).awsvpcConfiguration || {};
      var eSgs2 = (eNc.securityGroups || []).map(function(gid) {
        return (ctx.sgs || []).find(function(sg) {
          return sg.GroupId === gid;
        });
      }).filter(Boolean);
      return { subnetId: eSid, vpcId: eVpc, cidr: null, sgs: eSgs2, name: ecs2.serviceName || id };
    }
    if (type === "ecache") {
      var ec2 = null;
      var ecVpc = null;
      (ctx.ecacheClusters || []).forEach(function(c) {
        if (c.CacheClusterId === id) ec2 = c;
      });
      if (!ec2) return null;
      var ecMap = ctx.ecacheByVpc || {};
      var ecKeys = ecMap instanceof Map ? Array.from(ecMap.keys()) : Object.keys(ecMap);
      ecKeys.forEach(function(vid) {
        var arr = ecMap instanceof Map ? ecMap.get(vid) : ecMap[vid];
        (arr || []).forEach(function(c) {
          if (c.CacheClusterId === id) ecVpc = vid;
        });
      });
      var ecSgs = (ec2.SecurityGroups || []).map(function(s) {
        return (ctx.sgs || []).find(function(sg) {
          return sg.GroupId === (s.SecurityGroupId || s);
        });
      }).filter(Boolean);
      var ecSid = null;
      if (ecVpc) (ctx.subnets || []).forEach(function(s) {
        if (!ecSid && s.VpcId === ecVpc && !(ctx.pubSubs && ctx.pubSubs.has(s.SubnetId))) ecSid = s.SubnetId;
      });
      if (!ecSid && ecVpc) (ctx.subnets || []).forEach(function(s) {
        if (!ecSid && s.VpcId === ecVpc) ecSid = s.SubnetId;
      });
      var ecSubCidr = ecSid ? ((ctx.subnets || []).find(function(s) {
        return s.SubnetId === ecSid;
      }) || {}).CidrBlock : null;
      return { subnetId: ecSid, vpcId: ecVpc, cidr: ecSubCidr, sgs: ecSgs, name: ec2.CacheClusterId };
    }
    if (type === "redshift") {
      var rs2 = null;
      var rsVpc = null;
      (ctx.redshiftClusters || []).forEach(function(c) {
        if (c.ClusterIdentifier === id) rs2 = c;
      });
      if (!rs2) return null;
      var rsMap = ctx.redshiftByVpc || {};
      var rsKeys = rsMap instanceof Map ? Array.from(rsMap.keys()) : Object.keys(rsMap);
      rsKeys.forEach(function(vid) {
        var arr = rsMap instanceof Map ? rsMap.get(vid) : rsMap[vid];
        (arr || []).forEach(function(c) {
          if (c.ClusterIdentifier === id) rsVpc = vid;
        });
      });
      var rsSgs = (rs2.VpcSecurityGroups || []).map(function(s) {
        return (ctx.sgs || []).find(function(sg) {
          return sg.GroupId === (s.VpcSecurityGroupId || s);
        });
      }).filter(Boolean);
      var rsSid = null;
      if (rsVpc) (ctx.subnets || []).forEach(function(s) {
        if (!rsSid && s.VpcId === rsVpc && !(ctx.pubSubs && ctx.pubSubs.has(s.SubnetId))) rsSid = s.SubnetId;
      });
      if (!rsSid && rsVpc) (ctx.subnets || []).forEach(function(s) {
        if (!rsSid && s.VpcId === rsVpc) rsSid = s.SubnetId;
      });
      var rsSubCidr = rsSid ? ((ctx.subnets || []).find(function(s) {
        return s.SubnetId === rsSid;
      }) || {}).CidrBlock : null;
      return { subnetId: rsSid, vpcId: rsVpc, cidr: rsSubCidr, sgs: rsSgs, name: rs2.ClusterIdentifier };
    }
    return null;
  }
  function resolveClickTarget(el, ctx, buildResTreeFn) {
    if (!ctx) return null;
    var inetNode = el.closest(".internet-node");
    if (inetNode) return { type: "internet", id: "internet" };
    var resNode = el.closest(".res-node");
    var subNode = el.closest(".subnet-node");
    if (resNode && subNode) {
      var subId = subNode.getAttribute("data-subnet-id");
      var resIdx = Array.from(subNode.querySelectorAll(".res-node")).indexOf(resNode);
      var tree = buildResTreeFn ? buildResTreeFn(subId, ctx) : null;
      if (tree && tree[resIdx]) {
        var res = tree[resIdx];
        if (res.type === "EC2") return { type: "instance", id: res.rid || "" };
        if (res.type === "ALB") return { type: "alb", id: res.rid || res.name };
        if (res.type === "RDS") return { type: "rds", id: res.rid || res.name };
        if (res.type === "FN") return { type: "lambda", id: res.rid || res.name };
        if (res.type === "ECS") return { type: "ecs", id: res.rid || res.name };
        if (res.type === "CACHE") return { type: "ecache", id: res.rid || res.name };
        if (res.type === "RS") return { type: "redshift", id: res.rid || res.name };
        if (res.type === "ENI") return { type: "subnet", id: subId };
      }
      return { type: "subnet", id: subId };
    }
    if (subNode) {
      return { type: "subnet", id: subNode.getAttribute("data-subnet-id") };
    }
    return null;
  }
  function traceInternetToResource(target, config, ctx, opts) {
    var path = [];
    var hopN = 1;
    var tgtPos = resolveNetworkPosition(target.type, target.id, ctx);
    if (!tgtPos) return { path: [{ hop: 1, type: "error", id: "-", action: "block", detail: "Cannot resolve target" }], blocked: { hop: 1, reason: "Target not found" } };
    path.push({ hop: hopN++, type: "source", id: "Internet", action: "allow", detail: "Source: Internet (0.0.0.0/0)" });
    var vpcId = tgtPos.vpcId;
    var igw = (ctx.igws || []).find(function(g) {
      return (g.Attachments || []).some(function(a) {
        return a.VpcId === vpcId;
      });
    });
    if (!igw) {
      path.push({ hop: hopN++, type: "igw-check", id: "No IGW", action: "block", detail: "No Internet Gateway attached to VPC " + vpcId });
      path.push({ hop: hopN++, type: "target", id: tgtPos.name || target.id, action: "block", detail: "Target unreachable", subnetId: tgtPos.subnetId });
      return { path, blocked: { hop: 2, reason: "No Internet Gateway in target VPC", suggestion: "Attach an Internet Gateway to VPC " + vpcId } };
    }
    path.push({ hop: hopN++, type: "igw-check", id: igw.InternetGatewayId || "IGW", action: "allow", detail: "Internet Gateway " + igw.InternetGatewayId + " attached to VPC" });
    var isPublic = ctx.pubSubs && ctx.pubSubs.has(tgtPos.subnetId);
    if (!isPublic) {
      path.push({ hop: hopN++, type: "route-table", id: "No IGW route", action: "block", detail: "Target subnet " + tgtPos.subnetId + " has no route to IGW (private subnet)" });
      path.push({ hop: hopN++, type: "target", id: tgtPos.name || target.id, action: "block", detail: "Target in private subnet", subnetId: tgtPos.subnetId });
      return { path, blocked: { hop: hopN - 2, reason: "Target is in a private subnet with no IGW route", suggestion: "Move resource to a public subnet or use an ALB/NAT" } };
    }
    path.push({ hop: hopN++, type: "route-table", id: "IGW route", action: "allow", detail: "Target subnet has route to Internet Gateway" });
    var tgtNacl = (ctx.subNacl || {})[tgtPos.subnetId];
    var naclOpts = opts && opts.discovery ? { assumeAllow: true } : null;
    var naclIn = evaluateNACL(tgtNacl, "inbound", config.protocol, config.port, "0.0.0.0/0", naclOpts);
    path.push({ hop: hopN++, type: "nacl-inbound", id: tgtNacl ? tgtNacl.NetworkAclId || "NACL" : "Default NACL", action: naclIn.action, detail: "Target subnet NACL inbound from Internet", rule: naclIn.rule });
    if (naclIn.action === "deny") {
      path.push({ hop: hopN++, type: "target", id: tgtPos.name || target.id, action: "block", detail: "Blocked by NACL", subnetId: tgtPos.subnetId });
      return { path, blocked: { hop: hopN - 2, reason: "NACL denies inbound from Internet", suggestion: "Add NACL inbound rule allowing " + config.protocol + "/" + config.port + " from 0.0.0.0/0" } };
    }
    var sgOpts = opts && opts.discovery ? { assumeAllow: true } : null;
    var sgIn = evaluateSG(tgtPos.sgs, "inbound", config.protocol, config.port, "0.0.0.0/0", sgOpts);
    path.push({ hop: hopN++, type: "sg-inbound", id: "Target SG", action: sgIn.action, detail: "Security Group inbound from Internet", rule: sgIn.rule });
    if (sgIn.action === "deny") {
      path.push({ hop: hopN++, type: "target", id: tgtPos.name || target.id, action: "block", detail: "Blocked by SG", subnetId: tgtPos.subnetId });
      return { path, blocked: { hop: hopN - 2, reason: "Security group denies inbound " + config.protocol + "/" + config.port + " from Internet", suggestion: "Add SG inbound rule allowing " + config.protocol + "/" + config.port + " from 0.0.0.0/0" } };
    }
    path.push({ hop: hopN++, type: "target", id: tgtPos.name || target.id, action: "allow", detail: "Target: " + (tgtPos.name || target.id) + " (" + target.type + ")", subnetId: tgtPos.subnetId });
    return { path, blocked: null };
  }
  function traceResourceToInternet(source, config, ctx, opts) {
    var path = [];
    var hopN = 1;
    var srcPos = resolveNetworkPosition(source.type, source.id, ctx);
    if (!srcPos) return { path: [{ hop: 1, type: "error", id: "-", action: "block", detail: "Cannot resolve source" }], blocked: { hop: 1, reason: "Source not found" } };
    path.push({ hop: hopN++, type: "source", id: srcPos.name || source.id, action: "allow", detail: "Source: " + (srcPos.name || source.id) + " (" + source.type + ")", subnetId: srcPos.subnetId });
    var sgOpts = opts && opts.discovery ? { assumeAllow: true } : null;
    var sgOut = evaluateSG(srcPos.sgs, "outbound", config.protocol, config.port, "0.0.0.0/0", sgOpts);
    path.push({ hop: hopN++, type: "sg-outbound", id: "Source SG", action: sgOut.action, detail: "SG outbound to Internet", rule: sgOut.rule });
    if (sgOut.action === "deny") {
      path.push({ hop: hopN++, type: "target", id: "Internet", action: "block", detail: "Blocked by SG" });
      return { path, blocked: { hop: 2, reason: "Security group denies outbound", suggestion: "Add SG outbound rule allowing " + config.protocol + "/" + config.port + " to 0.0.0.0/0" } };
    }
    var srcNacl = (ctx.subNacl || {})[srcPos.subnetId];
    var naclOpts = opts && opts.discovery ? { assumeAllow: true } : null;
    var naclOut = evaluateNACL(srcNacl, "outbound", config.protocol, config.port, "0.0.0.0/0", naclOpts);
    path.push({ hop: hopN++, type: "nacl-outbound", id: srcNacl ? srcNacl.NetworkAclId || "NACL" : "Default NACL", action: naclOut.action, detail: "Source subnet NACL outbound to Internet", rule: naclOut.rule });
    if (naclOut.action === "deny") {
      path.push({ hop: hopN++, type: "target", id: "Internet", action: "block", detail: "Blocked by NACL" });
      return { path, blocked: { hop: hopN - 2, reason: "NACL denies outbound to Internet", suggestion: "Add NACL outbound rule allowing " + config.protocol + "/" + config.port } };
    }
    var srcRT = (ctx.subRT || {})[srcPos.subnetId];
    var hasIgwRoute = false;
    var hasNatRoute = false;
    var routeTarget = "";
    if (srcRT && srcRT.Routes) {
      srcRT.Routes.forEach(function(r) {
        if (r.GatewayId && r.GatewayId.startsWith("igw-")) {
          hasIgwRoute = true;
          routeTarget = r.GatewayId;
        }
        if (r.NatGatewayId) {
          hasNatRoute = true;
          routeTarget = r.NatGatewayId;
        }
      });
    }
    if (hasIgwRoute || hasNatRoute) {
      path.push({ hop: hopN++, type: "route-table", id: srcRT ? srcRT.RouteTableId || "RT" : "RT", action: "allow", detail: "Route to Internet via " + (hasIgwRoute ? "IGW" : "NAT") + " (" + routeTarget + ")", rule: "0.0.0.0/0 \u2192 " + routeTarget });
    } else {
      path.push({ hop: hopN++, type: "route-table", id: "No route", action: "block", detail: "No route to Internet (no IGW or NAT Gateway route in route table)" });
      path.push({ hop: hopN++, type: "target", id: "Internet", action: "block", detail: "No Internet route" });
      return { path, blocked: { hop: hopN - 2, reason: "No route to Internet in route table", suggestion: "Add a route 0.0.0.0/0 \u2192 IGW or NAT Gateway" } };
    }
    path.push({ hop: hopN++, type: "target", id: "Internet", action: "allow", detail: "Target: Internet (0.0.0.0/0)" });
    return { path, blocked: null };
  }
  function traceFlowLeg(source, target, config, ctx, opts) {
    if (source.type === "internet") return traceInternetToResource(target, config, ctx, opts);
    if (target.type === "internet") return traceResourceToInternet(source, config, ctx, opts);
    return traceFlow(source, target, config, ctx);
  }
  function traceFlow(source, target, config, ctx) {
    var path = [];
    var srcPos = resolveNetworkPosition(source.type, source.id, ctx);
    var tgtPos = resolveNetworkPosition(target.type, target.id, ctx);
    if (!srcPos) {
      return { path: [{ hop: 1, type: "error", id: "-", action: "block", detail: "Cannot resolve source position" }], blocked: { hop: 1, reason: "Source not found" } };
    }
    if (!tgtPos) {
      return { path: [{ hop: 1, type: "error", id: "-", action: "block", detail: "Cannot resolve target position" }], blocked: { hop: 1, reason: "Target not found" } };
    }
    var hopN = 1;
    var srcCidr = srcPos.ip || srcPos.cidr || ((ctx.subnets || []).find(function(s) {
      return s.SubnetId === srcPos.subnetId;
    }) || {}).CidrBlock || "10.0.0.0/8";
    var tgtCidr = tgtPos.ip || tgtPos.cidr || ((ctx.subnets || []).find(function(s) {
      return s.SubnetId === tgtPos.subnetId;
    }) || {}).CidrBlock || "10.0.0.0/8";
    path.push({ hop: hopN++, type: "source", id: srcPos.name || source.id, action: "allow", detail: "Source: " + (srcPos.name || source.id) + " (" + source.type + ") in subnet " + srcPos.subnetId, subnetId: srcPos.subnetId });
    var srcSgIds = srcPos.sgs.map(function(s) {
      return s.GroupId;
    }).filter(Boolean);
    var tgtSgIds = tgtPos.sgs.map(function(s) {
      return s.GroupId;
    }).filter(Boolean);
    if (srcPos.subnetId === tgtPos.subnetId) {
      var sgOut = evaluateSG(srcPos.sgs, "outbound", config.protocol, config.port, tgtCidr, { sourceSgIds: tgtSgIds });
      path.push({ hop: hopN++, type: "sg-outbound", id: "Source SG", action: sgOut.action, detail: "Security Group outbound check", rule: sgOut.rule });
      if (sgOut.action === "deny") {
        var sgInSkip = evaluateSG(tgtPos.sgs, "inbound", config.protocol, config.port, srcCidr, { sourceSgIds: srcSgIds });
        path.push({ hop: hopN++, type: "sg-inbound", id: "Target SG", action: "skip", detail: "Skipped (blocked upstream)", rule: sgInSkip.rule });
        path.push({ hop: hopN++, type: "target", id: tgtPos.name || target.id, action: "block", detail: "Target: " + (tgtPos.name || target.id), subnetId: tgtPos.subnetId });
        return { path, blocked: { hop: 2, reason: "Source security group denies outbound " + config.protocol + "/" + config.port, suggestion: "Add outbound rule to source SG allowing " + config.protocol + "/" + config.port + " to " + tgtCidr } };
      }
      var sgIn = evaluateSG(tgtPos.sgs, "inbound", config.protocol, config.port, srcCidr, { sourceSgIds: srcSgIds });
      path.push({ hop: hopN++, type: "sg-inbound", id: "Target SG", action: sgIn.action, detail: "Security Group inbound check", rule: sgIn.rule });
      if (sgIn.action === "deny") {
        path.push({ hop: hopN++, type: "target", id: tgtPos.name || target.id, action: "block", detail: "Target: " + (tgtPos.name || target.id), subnetId: tgtPos.subnetId });
        return { path, blocked: { hop: hopN - 2, reason: "Target security group denies inbound " + config.protocol + "/" + config.port, suggestion: "Add inbound rule to target SG allowing " + config.protocol + "/" + config.port + " from " + (srcCidr || "source CIDR") } };
      }
      path.push({ hop: hopN++, type: "target", id: tgtPos.name || target.id, action: "allow", detail: "Target: " + (tgtPos.name || target.id) + " (" + target.type + ")", subnetId: tgtPos.subnetId });
      return { path, blocked: null };
    }
    if (srcPos.vpcId === tgtPos.vpcId) {
      var srcRT = (ctx.subRT || {})[srcPos.subnetId];
      var rtResult = evaluateRouteTable(srcRT, tgtCidr);
      path.push({ hop: hopN++, type: "route-table", id: srcRT ? srcRT.RouteTableId || "RT" : "Main RT", action: rtResult.type === "blackhole" ? "block" : "allow", detail: "Route table lookup for " + tgtCidr + " => " + rtResult.type + (rtResult.target !== "local" ? " (" + rtResult.target + ")" : ""), rule: "Route: " + rtResult.type + (rtResult.target !== "local" ? " via " + rtResult.target : "") });
      if (rtResult.type === "blackhole") {
        path.push({ hop: hopN++, type: "target", id: tgtPos.name || target.id, action: "block", detail: "Target unreachable", subnetId: tgtPos.subnetId });
        return { path, blocked: { hop: hopN - 2, reason: "Route table has no route to destination", suggestion: "Add a route to " + tgtCidr + " in the source subnet route table" } };
      }
      var srcNacl = (ctx.subNacl || {})[srcPos.subnetId];
      var naclOut = evaluateNACL(srcNacl, "outbound", config.protocol, config.port, tgtCidr);
      path.push({ hop: hopN++, type: "nacl-outbound", id: srcNacl ? srcNacl.NetworkAclId || "NACL" : "Default NACL", action: naclOut.action, detail: "Source subnet NACL outbound", rule: naclOut.rule });
      if (naclOut.action === "deny") {
        path.push({ hop: hopN++, type: "target", id: tgtPos.name || target.id, action: "block", detail: "Blocked by NACL", subnetId: tgtPos.subnetId });
        return { path, blocked: { hop: hopN - 2, reason: "Source NACL denies outbound traffic", suggestion: "Add NACL outbound rule allowing " + config.protocol + "/" + config.port } };
      }
      var sgOut2 = evaluateSG(srcPos.sgs, "outbound", config.protocol, config.port, tgtCidr, { sourceSgIds: tgtSgIds });
      path.push({ hop: hopN++, type: "sg-outbound", id: "Source SG", action: sgOut2.action, detail: "Source SG outbound", rule: sgOut2.rule });
      if (sgOut2.action === "deny") {
        path.push({ hop: hopN++, type: "target", id: tgtPos.name || target.id, action: "block", detail: "Blocked by SG", subnetId: tgtPos.subnetId });
        return { path, blocked: { hop: hopN - 2, reason: "Source security group denies outbound", suggestion: "Add SG outbound rule for " + config.protocol + "/" + config.port } };
      }
      var tgtNacl = (ctx.subNacl || {})[tgtPos.subnetId];
      var naclIn = evaluateNACL(tgtNacl, "inbound", config.protocol, config.port, srcCidr);
      path.push({ hop: hopN++, type: "nacl-inbound", id: tgtNacl ? tgtNacl.NetworkAclId || "NACL" : "Default NACL", action: naclIn.action, detail: "Target subnet NACL inbound", rule: naclIn.rule });
      if (naclIn.action === "deny") {
        path.push({ hop: hopN++, type: "target", id: tgtPos.name || target.id, action: "block", detail: "Blocked by NACL", subnetId: tgtPos.subnetId });
        return { path, blocked: { hop: hopN - 2, reason: "Target NACL denies inbound traffic", suggestion: "Add NACL inbound rule allowing " + config.protocol + "/" + config.port + " from " + srcCidr } };
      }
      var sgIn2 = evaluateSG(tgtPos.sgs, "inbound", config.protocol, config.port, srcCidr, { sourceSgIds: srcSgIds });
      path.push({ hop: hopN++, type: "sg-inbound", id: "Target SG", action: sgIn2.action, detail: "Target SG inbound", rule: sgIn2.rule });
      if (sgIn2.action === "deny") {
        path.push({ hop: hopN++, type: "target", id: tgtPos.name || target.id, action: "block", detail: "Blocked by SG", subnetId: tgtPos.subnetId });
        return { path, blocked: { hop: hopN - 2, reason: "Target security group denies inbound", suggestion: "Add SG inbound rule for " + config.protocol + "/" + config.port + " from source" } };
      }
      path.push({ hop: hopN++, type: "target", id: tgtPos.name || target.id, action: "allow", detail: "Target: " + (tgtPos.name || target.id) + " (" + target.type + ")", subnetId: tgtPos.subnetId });
      return { path, blocked: null };
    }
    var srcRTx = (ctx.subRT || {})[srcPos.subnetId];
    var rtResultX = evaluateRouteTable(srcRTx, tgtCidr);
    path.push({ hop: hopN++, type: "route-table", id: srcRTx ? srcRTx.RouteTableId || "RT" : "Main RT", action: rtResultX.type === "blackhole" ? "block" : "allow", detail: "Route table lookup for " + tgtCidr + " => " + rtResultX.type + (rtResultX.target !== "local" ? " (" + rtResultX.target + ")" : ""), rule: "Route: " + rtResultX.type + (rtResultX.target !== "local" ? " via " + rtResultX.target : "") });
    if (rtResultX.type === "blackhole") {
      path.push({ hop: hopN++, type: "target", id: tgtPos.name || target.id, action: "block", detail: "Target unreachable", subnetId: tgtPos.subnetId });
      return { path, blocked: { hop: hopN - 2, reason: "Route table has no route to destination", suggestion: "Add a route to " + tgtCidr + " via peering or TGW" } };
    }
    var srcNaclX = (ctx.subNacl || {})[srcPos.subnetId];
    var naclOutX = evaluateNACL(srcNaclX, "outbound", config.protocol, config.port, tgtCidr);
    path.push({ hop: hopN++, type: "nacl-outbound", id: srcNaclX ? srcNaclX.NetworkAclId || "NACL" : "Default NACL", action: naclOutX.action, detail: "Source subnet NACL outbound", rule: naclOutX.rule });
    if (naclOutX.action === "deny") {
      path.push({ hop: hopN++, type: "target", id: tgtPos.name || target.id, action: "block", detail: "Blocked by NACL", subnetId: tgtPos.subnetId });
      return { path, blocked: { hop: hopN - 2, reason: "Source NACL denies outbound traffic", suggestion: "Add NACL outbound rule allowing " + config.protocol + "/" + config.port } };
    }
    var sgOutX = evaluateSG(srcPos.sgs, "outbound", config.protocol, config.port, tgtCidr, { sourceSgIds: tgtSgIds });
    path.push({ hop: hopN++, type: "sg-outbound", id: "Source SG", action: sgOutX.action, detail: "Source SG outbound", rule: sgOutX.rule });
    if (sgOutX.action === "deny") {
      path.push({ hop: hopN++, type: "target", id: tgtPos.name || target.id, action: "block", detail: "Blocked by SG", subnetId: tgtPos.subnetId });
      return { path, blocked: { hop: hopN - 2, reason: "Source security group denies outbound", suggestion: "Add SG outbound rule for " + config.protocol + "/" + config.port } };
    }
    var peeringRoute = null;
    (ctx.peerings || []).forEach(function(p) {
      var req = p.RequesterVpcInfo || {};
      var acc = p.AccepterVpcInfo || {};
      if (req.VpcId === srcPos.vpcId && acc.VpcId === tgtPos.vpcId || acc.VpcId === srcPos.vpcId && req.VpcId === tgtPos.vpcId) {
        peeringRoute = p;
      }
    });
    if (peeringRoute) {
      path.push({ hop: hopN++, type: "peering", id: peeringRoute.VpcPeeringConnectionId || "PCX", action: "allow", detail: "VPC Peering connection between " + srcPos.vpcId + " and " + tgtPos.vpcId, rule: "Peering: " + peeringRoute.VpcPeeringConnectionId });
    } else {
      var tgwRoute = false;
      (ctx.tgwAttachments || []).forEach(function(att) {
        if (att.ResourceId === srcPos.vpcId || att.ResourceId === tgtPos.vpcId) tgwRoute = true;
      });
      if (tgwRoute) {
        path.push({ hop: hopN++, type: "tgw", id: "Transit Gateway", action: "allow", detail: "Transit Gateway route between VPCs" });
      } else {
        path.push({ hop: hopN++, type: "cross-vpc", id: "No route", action: "block", detail: "No peering or TGW connection between VPCs" });
        path.push({ hop: hopN++, type: "target", id: tgtPos.name || target.id, action: "block", detail: "Target unreachable", subnetId: tgtPos.subnetId });
        return { path, blocked: { hop: hopN - 2, reason: "No connectivity between VPCs", suggestion: "Create a VPC peering connection or Transit Gateway attachment" } };
      }
    }
    var tgtNaclX = (ctx.subNacl || {})[tgtPos.subnetId];
    var naclInX = evaluateNACL(tgtNaclX, "inbound", config.protocol, config.port, srcCidr);
    path.push({ hop: hopN++, type: "nacl-inbound", id: tgtNaclX ? tgtNaclX.NetworkAclId || "NACL" : "Default NACL", action: naclInX.action, detail: "Target subnet NACL inbound", rule: naclInX.rule });
    if (naclInX.action === "deny") {
      path.push({ hop: hopN++, type: "target", id: tgtPos.name || target.id, action: "block", detail: "Blocked by NACL", subnetId: tgtPos.subnetId });
      return { path, blocked: { hop: hopN - 2, reason: "Target NACL denies inbound traffic", suggestion: "Add NACL inbound rule allowing " + config.protocol + "/" + config.port + " from " + srcCidr } };
    }
    var sgIn3 = evaluateSG(tgtPos.sgs, "inbound", config.protocol, config.port, srcCidr, { sourceSgIds: srcSgIds });
    path.push({ hop: hopN++, type: "sg-inbound", id: "Target SG", action: sgIn3.action, detail: "Target SG inbound (cross-VPC)", rule: sgIn3.rule });
    if (sgIn3.action === "deny") {
      path.push({ hop: hopN++, type: "target", id: tgtPos.name || target.id, action: "block", detail: "Blocked by SG", subnetId: tgtPos.subnetId });
      return { path, blocked: { hop: hopN - 2, reason: "Target SG denies inbound from cross-VPC source", suggestion: "Add SG inbound rule for " + config.protocol + "/" + config.port } };
    }
    path.push({ hop: hopN++, type: "target", id: tgtPos.name || target.id, action: "allow", detail: "Target: " + (tgtPos.name || target.id) + " (" + target.type + ")", subnetId: tgtPos.subnetId });
    return { path, blocked: null };
  }
  function findAlternatePaths(source, target, config, ctx) {
    if (!ctx) return [];
    var tgtPos = resolveNetworkPosition(target.type, target.id, ctx);
    if (!tgtPos) return [];
    var vpcId = tgtPos.vpcId;
    var results = [];
    var candidates = [];
    var isInternet = source.type === "internet";
    (ctx.instances || []).forEach(function(inst) {
      var instVpc = inst.VpcId || ((ctx.subnets || []).find(function(s) {
        return s.SubnetId === inst.SubnetId;
      }) || {}).VpcId;
      if (!isInternet && instVpc !== vpcId) return;
      if (inst.InstanceId === (target.type === "instance" ? target.id : "")) return;
      if (inst.InstanceId === (source.type === "instance" ? source.id : "")) return;
      var isPub = ctx.pubSubs && ctx.pubSubs.has(inst.SubnetId);
      var gn2 = inst.Tags ? (inst.Tags.find(function(t) {
        return t.Key === "Name";
      }) || {}).Value || inst.InstanceId : inst.InstanceId;
      candidates.push({ ref: { type: "instance", id: inst.InstanceId }, name: gn2, isPub, defaultPort: 22 });
    });
    Object.keys(ctx.albBySub || {}).forEach(function(sid2) {
      var sub = (ctx.subnets || []).find(function(s) {
        return s.SubnetId === sid2;
      });
      if (!sub || !isInternet && sub.VpcId !== vpcId) return;
      (ctx.albBySub[sid2] || []).forEach(function(alb) {
        var albId = alb.LoadBalancerArn ? alb.LoadBalancerArn.split("/").pop() : "";
        if (albId === (target.type === "alb" ? target.id : "")) return;
        candidates.push({ ref: { type: "alb", id: albId || alb.LoadBalancerName }, name: alb.LoadBalancerName || albId, isPub: true, defaultPort: 443 });
      });
    });
    candidates.sort(function(a, b) {
      return (b.isPub ? 1 : 0) - (a.isPub ? 1 : 0);
    });
    var tested = 0;
    for (var i = 0; i < candidates.length && tested < 20 && results.length < 5; i++) {
      var cand = candidates[i];
      tested++;
      var leg1Config = { protocol: "tcp", port: cand.defaultPort };
      var leg1 = traceFlowLeg(source, cand.ref, leg1Config, ctx);
      if (leg1.blocked) continue;
      var leg2 = traceFlowLeg(cand.ref, target, config, ctx);
      if (leg2.blocked) continue;
      results.push({ via: { type: cand.ref.type, id: cand.ref.id, name: cand.name }, leg1Result: leg1, leg2Result: leg2, leg1Config });
    }
    return results;
  }

  // src/modules/flow-analysis.js
  var flow_analysis_exports = {};
  __export(flow_analysis_exports, {
    _faDashRows: () => faDashRows,
    _faDashState: () => faDashState,
    _flowAnalysisCache: () => flowAnalysisCache,
    _flowAnalysisMode: () => flowAnalysisMode,
    classifyAllResources: () => classifyAllResources,
    detectBastions: () => detectBastions,
    discoverTrafficFlows: () => discoverTrafficFlows,
    findBastionChains: () => findBastionChains,
    findEgressPaths: () => findEgressPaths,
    findIngressPaths: () => findIngressPaths,
    getFaDashRows: () => getFaDashRows,
    getFaDashState: () => getFaDashState,
    getFlowAnalysisCache: () => getFlowAnalysisCache,
    getFlowAnalysisMode: () => getFlowAnalysisMode,
    setFaDashRows: () => setFaDashRows,
    setFaDashState: () => setFaDashState,
    setFlowAnalysisCache: () => setFlowAnalysisCache,
    setFlowAnalysisMode: () => setFlowAnalysisMode
  });
  function _traceInbound(target, config, ctx, opts) {
    return typeof window !== "undefined" && window._traceInternetToResource ? window._traceInternetToResource(target, config, ctx, opts) : { blocked: true, path: [] };
  }
  function _traceOutbound(source, config, ctx, opts) {
    return typeof window !== "undefined" && window._traceResourceToInternet ? window._traceResourceToInternet(source, config, ctx, opts) : { blocked: true, path: [] };
  }
  function _traceLeg(source, target, config, ctx, opts) {
    return typeof window !== "undefined" && window._traceFlowLeg ? window._traceFlowLeg(source, target, config, ctx, opts) : { blocked: true, path: [] };
  }
  var flowAnalysisMode = null;
  var flowAnalysisCache = null;
  var faDashState = { section: "all", search: "", sort: "name", sortDir: "asc", page: 1, perPage: 50 };
  var faDashRows = null;
  function getFlowAnalysisMode() {
    return flowAnalysisMode;
  }
  function setFlowAnalysisMode(v) {
    flowAnalysisMode = v;
  }
  function getFlowAnalysisCache() {
    return flowAnalysisCache;
  }
  function setFlowAnalysisCache(v) {
    flowAnalysisCache = v;
  }
  function getFaDashState() {
    return faDashState;
  }
  function setFaDashState(v) {
    faDashState = v;
  }
  function getFaDashRows() {
    return faDashRows;
  }
  function setFaDashRows(v) {
    faDashRows = v;
  }
  function _gn3(resource) {
    const tags = resource.Tags || resource.tags || [];
    const t = tags.find((t2) => t2.Key === "Name");
    return t ? t.Value : resource.InstanceId || resource.LoadBalancerName || resource.DBInstanceIdentifier || "unknown";
  }
  function discoverTrafficFlows(ctx) {
    if (!ctx) return null;
    const hasSgData = (ctx.instances || []).some((i) => (i.SecurityGroups || []).length > 0);
    const hasNaclEgress = (ctx.nacls || []).some((n) => (n.Entries || []).some((e) => e.Egress));
    const ingressPaths = findIngressPaths(ctx);
    const egressPaths = findEgressPaths(ctx);
    const bastions = detectBastions(ctx);
    const bastionChains = findBastionChains(bastions, ctx);
    const accessTiers = classifyAllResources(ctx, ingressPaths, bastionChains);
    return { ingressPaths, egressPaths, accessTiers, bastionChains, bastions, hasSgData, hasNaclEgress };
  }
  function findIngressPaths(ctx) {
    const paths = [];
    (ctx.igws || []).forEach((igw) => {
      const vpcId = (igw.Attachments || [])[0]?.VpcId;
      if (!vpcId) return;
      (ctx.subnets || []).forEach((sub) => {
        if (sub.VpcId !== vpcId) return;
        if (!ctx.pubSubs || !ctx.pubSubs.has(sub.SubnetId)) return;
        (ctx.instBySub[sub.SubnetId] || []).forEach((inst) => {
          [443, 80, 22].forEach((port) => {
            const r = _traceInbound({ type: "instance", id: inst.InstanceId }, { protocol: "tcp", port }, ctx, { discovery: true });
            if (!r.blocked) {
              paths.push({ from: "internet", to: { type: "instance", id: inst.InstanceId }, toName: _gn3(inst), path: r.path, port, type: "direct", vpcId });
            }
          });
        });
        (ctx.albBySub[sub.SubnetId] || []).forEach((alb) => {
          const albId = alb.LoadBalancerArn ? alb.LoadBalancerArn.split("/").pop() : "";
          const r = _traceInbound({ type: "alb", id: albId || alb.LoadBalancerName }, { protocol: "tcp", port: 443 }, ctx, { discovery: true });
          if (!r.blocked) {
            paths.push({ from: "internet", to: { type: "alb", id: albId || alb.LoadBalancerName }, toName: alb.LoadBalancerName || albId, path: r.path, port: 443, type: "loadbalancer", vpcId });
          }
        });
      });
    });
    return paths;
  }
  function findEgressPaths(ctx) {
    const paths = [];
    const checked = /* @__PURE__ */ new Set();
    (ctx.instances || []).forEach((inst) => {
      if (checked.has(inst.SubnetId)) return;
      const r = _traceOutbound({ type: "instance", id: inst.InstanceId }, { protocol: "tcp", port: 443 }, ctx, { discovery: true });
      if (!r.blocked) {
        checked.add(inst.SubnetId);
        paths.push({
          from: { type: "instance", id: inst.InstanceId },
          fromName: _gn3(inst),
          to: "internet",
          subnetId: inst.SubnetId,
          via: r.path.some((h) => h.detail && h.detail.includes("NAT")) ? "nat" : "igw"
        });
      }
    });
    return paths;
  }
  function detectBastions(ctx) {
    const bastions = [];
    const hasSgData = (ctx.instances || []).some((i) => (i.SecurityGroups || []).length > 0);
    (ctx.instances || []).forEach((inst) => {
      if (!ctx.pubSubs || !ctx.pubSubs.has(inst.SubnetId)) return;
      const name = _gn3(inst);
      const nameMatch = /bastion|jump|ssh/i.test(name);
      if (hasSgData) {
        const sgs = (inst.SecurityGroups || []).map((s) => (ctx.sgs || []).find((sg) => sg.GroupId === s.GroupId)).filter(Boolean);
        const hasSSH = sgs.some((sg) => (sg.IpPermissions || []).some((r) => r.FromPort <= 22 && r.ToPort >= 22));
        if (!hasSSH && !nameMatch) return;
      } else {
        if (!nameMatch) return;
      }
      bastions.push({
        type: "instance",
        id: inst.InstanceId,
        name,
        subnetId: inst.SubnetId,
        vpcId: inst.VpcId || ((ctx.subnets || []).find((s) => s.SubnetId === inst.SubnetId) || {}).VpcId
      });
    });
    return bastions;
  }
  function findBastionChains(bastions, ctx) {
    const chains = [];
    const hasSgData = (ctx.instances || []).some((i) => (i.SecurityGroups || []).length > 0);
    bastions.forEach((bastion) => {
      const targets = [];
      const testedSubs = /* @__PURE__ */ new Set();
      (ctx.instances || []).forEach((inst) => {
        if (inst.InstanceId === bastion.id) return;
        const instVpc = inst.VpcId || ((ctx.subnets || []).find((s) => s.SubnetId === inst.SubnetId) || {}).VpcId;
        if (instVpc !== bastion.vpcId) return;
        if (ctx.pubSubs && ctx.pubSubs.has(inst.SubnetId)) return;
        const name = _gn3(inst);
        if (!hasSgData) {
          if (targets.length < 50) targets.push({ type: "instance", id: inst.InstanceId, name });
        } else if (!testedSubs.has(inst.SubnetId)) {
          testedSubs.add(inst.SubnetId);
          const r = _traceLeg({ type: "instance", id: bastion.id }, { type: "instance", id: inst.InstanceId }, { protocol: "tcp", port: 22 }, ctx, { discovery: true });
          if (!r.blocked) targets.push({ type: "instance", id: inst.InstanceId, name });
        } else {
          targets.push({ type: "instance", id: inst.InstanceId, name });
        }
      });
      (ctx.rdsInstances || []).forEach((db) => {
        let rSid = null;
        Object.keys(ctx.rdsBySub || {}).forEach((sid2) => {
          (ctx.rdsBySub[sid2] || []).forEach((d) => {
            if (d.DBInstanceIdentifier === db.DBInstanceIdentifier) rSid = sid2;
          });
        });
        if (!rSid) return;
        const rVpc = ((ctx.subnets || []).find((s) => s.SubnetId === rSid) || {}).VpcId;
        if (rVpc !== bastion.vpcId) return;
        if (!hasSgData) {
          targets.push({ type: "rds", id: db.DBInstanceIdentifier, name: db.DBInstanceIdentifier });
        } else {
          const port = db.Endpoint && db.Endpoint.Port || 3306;
          const r = _traceLeg({ type: "instance", id: bastion.id }, { type: "rds", id: db.DBInstanceIdentifier }, { protocol: "tcp", port }, ctx, { discovery: true });
          if (!r.blocked) targets.push({ type: "rds", id: db.DBInstanceIdentifier, name: db.DBInstanceIdentifier });
        }
      });
      if (targets.length > 0) chains.push({ bastion, targets });
    });
    return chains;
  }
  function classifyAllResources(ctx, ingressPaths, bastionChains) {
    const tiers = { internetFacing: [], bastionOnly: [], fullyPrivate: [], database: [] };
    const ingressSet = /* @__PURE__ */ new Set();
    ingressPaths.forEach((p) => {
      ingressSet.add(p.to.type + ":" + p.to.id);
    });
    const bastionSet = /* @__PURE__ */ new Set();
    bastionChains.forEach((ch) => {
      ch.targets.forEach((t) => {
        bastionSet.add(t.type + ":" + t.id);
      });
    });
    (ctx.instances || []).forEach((inst) => {
      const key = "instance:" + inst.InstanceId;
      const ref = { type: "instance", id: inst.InstanceId, name: _gn3(inst) };
      if (ingressSet.has(key)) {
        tiers.internetFacing.push(ref);
        return;
      }
      if (bastionSet.has(key)) {
        tiers.bastionOnly.push(ref);
        return;
      }
      tiers.fullyPrivate.push(ref);
    });
    Object.keys(ctx.albBySub || {}).forEach((sid2) => {
      (ctx.albBySub[sid2] || []).forEach((alb) => {
        const albId = alb.LoadBalancerArn ? alb.LoadBalancerArn.split("/").pop() : "";
        const key = "alb:" + (albId || alb.LoadBalancerName);
        const ref = { type: "alb", id: albId || alb.LoadBalancerName, name: alb.LoadBalancerName || albId };
        if (ingressSet.has(key)) {
          tiers.internetFacing.push(ref);
          return;
        }
        tiers.fullyPrivate.push(ref);
      });
    });
    (ctx.rdsInstances || []).forEach((db) => {
      tiers.database.push({ type: "rds", id: db.DBInstanceIdentifier, name: db.DBInstanceIdentifier });
    });
    (ctx.ecacheClusters || []).forEach((ec) => {
      tiers.database.push({ type: "ecache", id: ec.CacheClusterId, name: ec.CacheClusterId });
    });
    return tiers;
  }

  // src/modules/firewall-editor.js
  var firewall_editor_exports = {};
  __export(firewall_editor_exports, {
    fwApplyRule: () => fwApplyRule,
    fwCheckNaclShadow: () => fwCheckNaclShadow,
    fwEditCount: () => fwEditCount,
    fwGenNaclCli: () => fwGenNaclCli,
    fwGenRouteCli: () => fwGenRouteCli,
    fwGenSgCli: () => fwGenSgCli,
    fwGenerateCli: () => fwGenerateCli,
    fwProtoLabel: () => fwProtoLabel,
    fwRebuildLookups: () => fwRebuildLookups,
    fwRemoveRule: () => fwRemoveRule,
    fwResetAll: () => fwResetAll,
    fwRestoreRule: () => fwRestoreRule,
    fwRuleMatch: () => fwRuleMatch,
    fwTakeSnapshot: () => fwTakeSnapshot,
    fwUndo: () => fwUndo,
    fwValidateCidr: () => fwValidateCidr,
    fwValidateNaclRule: () => fwValidateNaclRule,
    fwValidateRoute: () => fwValidateRoute,
    fwValidateSgRule: () => fwValidateSgRule,
    getFwEdits: () => getFwEdits,
    getFwFpDir: () => getFwFpDir,
    getFwFpLk: () => getFwFpLk,
    getFwFpResId: () => getFwFpResId,
    getFwFpSub: () => getFwFpSub,
    getFwFpType: () => getFwFpType,
    getFwFpVpcId: () => getFwFpVpcId,
    getFwSnapshot: () => getFwSnapshot,
    setFwEdits: () => setFwEdits,
    setFwFpDir: () => setFwFpDir,
    setFwFpLk: () => setFwFpLk,
    setFwFpResId: () => setFwFpResId,
    setFwFpSub: () => setFwFpSub,
    setFwFpType: () => setFwFpType,
    setFwFpVpcId: () => setFwFpVpcId,
    setFwSnapshot: () => setFwSnapshot
  });
  var _fwEdits = [];
  var _fwSnapshot = null;
  var _fwFpType = null;
  var _fwFpResId = null;
  var _fwFpSub = null;
  var _fwFpVpcId = null;
  var _fwFpLk = null;
  var _fwFpDir = "ingress";
  function getFwEdits() {
    return _fwEdits;
  }
  function setFwEdits(v) {
    _fwEdits = v;
  }
  function getFwSnapshot() {
    return _fwSnapshot;
  }
  function setFwSnapshot(v) {
    _fwSnapshot = v;
  }
  function getFwFpType() {
    return _fwFpType;
  }
  function setFwFpType(v) {
    _fwFpType = v;
  }
  function getFwFpResId() {
    return _fwFpResId;
  }
  function setFwFpResId(v) {
    _fwFpResId = v;
  }
  function getFwFpSub() {
    return _fwFpSub;
  }
  function setFwFpSub(v) {
    _fwFpSub = v;
  }
  function getFwFpVpcId() {
    return _fwFpVpcId;
  }
  function setFwFpVpcId(v) {
    _fwFpVpcId = v;
  }
  function getFwFpLk() {
    return _fwFpLk;
  }
  function setFwFpLk(v) {
    _fwFpLk = v;
  }
  function getFwFpDir() {
    return _fwFpDir;
  }
  function setFwFpDir(v) {
    _fwFpDir = v;
  }
  function fwProtoLabel(proto) {
    const p = String(proto);
    if (p === "6") return "TCP";
    if (p === "17") return "UDP";
    if (p === "1") return "ICMP";
    if (p === "-1") return "ALL";
    return p;
  }
  function fwRuleMatch(a, b) {
    if (!a || !b) return false;
    if (String(a.IpProtocol) !== String(b.IpProtocol)) return false;
    if ((a.FromPort || 0) !== (b.FromPort || 0)) return false;
    if ((a.ToPort || 0) !== (b.ToPort || 0)) return false;
    const aCidrs = (a.IpRanges || []).map((r) => r.CidrIp).sort().join(",");
    const bCidrs = (b.IpRanges || []).map((r) => r.CidrIp).sort().join(",");
    if (aCidrs !== bCidrs) return false;
    const aGrps = (a.UserIdGroupPairs || []).map((g) => g.GroupId).sort().join(",");
    const bGrps = (b.UserIdGroupPairs || []).map((g) => g.GroupId).sort().join(",");
    return aGrps === bGrps;
  }
  function fwEditCount(resourceId) {
    return _fwEdits.filter((e) => e.resourceId === resourceId).length;
  }
  function fwValidateCidr(cidr) {
    if (!cidr || typeof cidr !== "string") return false;
    if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\/\d{1,2}$/.test(cidr)) return false;
    const parts = cidr.split("/");
    const octets = parts[0].split(".");
    for (let i = 0; i < 4; i++) {
      if (parseInt(octets[i], 10) > 255) return false;
    }
    if (parseInt(parts[1], 10) > 32) return false;
    return true;
  }
  function fwValidateNaclRule(rule, existingEntries, direction) {
    const errs = [];
    const num = parseInt(rule.RuleNumber, 10);
    if (isNaN(num) || num < 1 || num > 32766) {
      errs.push("Rule number must be 1-32766");
    }
    const isEgress = direction === "egress";
    if (existingEntries && !isNaN(num)) {
      const dup = existingEntries.some(
        (e) => e.RuleNumber === num && e.Egress === isEgress
      );
      if (dup) errs.push("Duplicate rule number " + num + " in " + direction + " direction");
    }
    if (!fwValidateCidr(rule.CidrBlock)) errs.push("Invalid CIDR format");
    const proto = String(rule.Protocol);
    if (proto === "6" || proto === "17") {
      if (!rule.PortRange) {
        errs.push("Port range required for TCP/UDP");
      } else {
        const from = parseInt(rule.PortRange.From, 10);
        const to = parseInt(rule.PortRange.To, 10);
        if (isNaN(from) || isNaN(to)) {
          errs.push("Invalid port range values");
        } else {
          if (from < 0 || from > 65535) errs.push("From port must be 0-65535");
          if (to < 0 || to > 65535) errs.push("To port must be 0-65535");
          if (from > to) errs.push("From port must be <= To port");
        }
      }
    }
    return errs;
  }
  function fwValidateSgRule(rule) {
    const errs = [];
    const proto = String(rule.IpProtocol || "");
    const validProtos = ["tcp", "udp", "icmp", "-1"];
    if (!validProtos.includes(proto)) errs.push("Invalid protocol: " + proto);
    if (proto === "tcp" || proto === "udp") {
      const from = parseInt(rule.FromPort, 10);
      const to = parseInt(rule.ToPort, 10);
      if (isNaN(from) || isNaN(to)) {
        errs.push("Port range required for TCP/UDP");
      } else {
        if (from < 0 || from > 65535) errs.push("FromPort must be 0-65535");
        if (to < 0 || to > 65535) errs.push("ToPort must be 0-65535");
        if (from > to) errs.push("FromPort must be <= ToPort");
      }
    }
    const hasCidr = (rule.IpRanges || []).some((r) => r.CidrIp);
    const hasSgRef = (rule.UserIdGroupPairs || []).some((g) => g.GroupId);
    if (!hasCidr && !hasSgRef) {
      errs.push("At least one source (CIDR or SG reference) required");
    }
    if (hasCidr) {
      (rule.IpRanges || []).forEach((r) => {
        if (r.CidrIp && !fwValidateCidr(r.CidrIp)) errs.push("Invalid CIDR: " + r.CidrIp);
      });
    }
    return errs;
  }
  function fwValidateRoute(route, existingRoutes) {
    const errs = [];
    if (!fwValidateCidr(route.DestinationCidrBlock)) errs.push("Invalid destination CIDR");
    if (existingRoutes) {
      const dup = existingRoutes.some(
        (r) => r.DestinationCidrBlock === route.DestinationCidrBlock
      );
      if (dup) errs.push("Duplicate destination CIDR: " + route.DestinationCidrBlock);
    }
    const hasTarget = route.GatewayId || route.NatGatewayId || route.TransitGatewayId || route.VpcPeeringConnectionId || route.VpcEndpointId;
    if (!hasTarget) errs.push("Route target required");
    return errs;
  }
  function fwCheckNaclShadow(nacl, direction) {
    if (!nacl || !nacl.Entries) return [];
    const isEgress = direction === "egress";
    const entries = (nacl.Entries || []).filter((e) => e.Egress === isEgress && e.RuleNumber !== 32767).sort((a, b) => a.RuleNumber - b.RuleNumber);
    const warnings = [];
    for (let i = 1; i < entries.length; i++) {
      for (let j = 0; j < i; j++) {
        const hi = entries[i];
        const lo = entries[j];
        const sameCidr = (hi.CidrBlock || "") === (lo.CidrBlock || "");
        const sameProto = (hi.Protocol || "") === (lo.Protocol || "") || lo.Protocol === "-1";
        if (sameCidr && sameProto && hi.RuleAction !== lo.RuleAction) {
          warnings.push(
            "Rule #" + hi.RuleNumber + " (" + hi.RuleAction + ") is shadowed by #" + lo.RuleNumber + " (" + lo.RuleAction + ") \u2014 same CIDR " + (hi.CidrBlock || "any") + ", evaluated first"
          );
        }
      }
    }
    return warnings;
  }
  function fwGenerateCli(edits) {
    const list = edits || _fwEdits;
    const cmds = [];
    list.forEach((edit) => {
      if (edit.type === "nacl") fwGenNaclCli(edit, cmds);
      else if (edit.type === "sg") fwGenSgCli(edit, cmds);
      else if (edit.type === "route") fwGenRouteCli(edit, cmds);
    });
    return cmds;
  }
  function fwGenNaclCli(edit, cmds) {
    const id = edit.resourceId;
    const dirFlag = edit.direction === "egress" ? "--egress" : "--ingress";
    if (edit.action === "add") {
      cmds.push(_fwNaclEntryCmd("create-network-acl-entry", id, edit.rule, dirFlag));
    } else if (edit.action === "modify") {
      cmds.push(_fwNaclEntryCmd("replace-network-acl-entry", id, edit.rule, dirFlag));
    } else if (edit.action === "delete") {
      cmds.push(
        "aws ec2 delete-network-acl-entry --network-acl-id " + id + " --rule-number " + edit.rule.RuleNumber + " " + dirFlag
      );
    }
  }
  function _fwNaclEntryCmd(verb, naclId, rule, dirFlag) {
    let cmd = "aws ec2 " + verb + " --network-acl-id " + naclId + " --rule-number " + rule.RuleNumber + " " + dirFlag + " --protocol " + rule.Protocol + " --cidr-block " + rule.CidrBlock;
    if (rule.PortRange) {
      cmd += " --port-range From=" + rule.PortRange.From + ",To=" + rule.PortRange.To;
    }
    cmd += " --rule-action " + rule.RuleAction;
    return cmd;
  }
  function fwGenSgCli(edit, cmds) {
    const id = edit.resourceId;
    const suffix = edit.direction === "ingress" ? "ingress" : "egress";
    if (edit.action === "add") {
      cmds.push(_fwSgRuleCmd("authorize-security-group-" + suffix, id, edit.rule));
    } else if (edit.action === "delete") {
      cmds.push(_fwSgRuleCmd("revoke-security-group-" + suffix, id, edit.rule));
    } else if (edit.action === "modify") {
      if (edit.originalRule) {
        cmds.push(_fwSgRuleCmd("revoke-security-group-" + suffix, id, edit.originalRule));
      }
      cmds.push(_fwSgRuleCmd("authorize-security-group-" + suffix, id, edit.rule));
    }
  }
  function _fwSgRuleCmd(verb, sgId, rule) {
    let cmd = "aws ec2 " + verb + " --group-id " + sgId + " --protocol " + rule.IpProtocol;
    if (rule.FromPort !== void 0 && rule.FromPort !== -1) {
      cmd += " --port " + rule.FromPort;
      if (rule.ToPort !== void 0 && rule.ToPort !== rule.FromPort) {
        cmd += "-" + rule.ToPort;
      }
    }
    const cidrs = (rule.IpRanges || []).map((r) => r.CidrIp).filter(Boolean);
    const sgRefs = (rule.UserIdGroupPairs || []).map((g) => g.GroupId).filter(Boolean);
    if (cidrs.length) cmd += " --cidr " + cidrs[0];
    else if (sgRefs.length) cmd += " --source-group " + sgRefs[0];
    return cmd;
  }
  function fwGenRouteCli(edit, cmds) {
    const id = edit.resourceId;
    if (edit.action === "add") {
      cmds.push(_fwRouteCmd("create-route", id, edit.rule));
    } else if (edit.action === "modify") {
      cmds.push(_fwRouteCmd("replace-route", id, edit.rule));
    } else if (edit.action === "delete") {
      cmds.push(
        "aws ec2 delete-route --route-table-id " + id + " --destination-cidr-block " + edit.rule.DestinationCidrBlock
      );
    }
  }
  function _fwRouteCmd(verb, rtId, route) {
    let cmd = "aws ec2 " + verb + " --route-table-id " + rtId + " --destination-cidr-block " + route.DestinationCidrBlock;
    if (route.GatewayId) cmd += " --gateway-id " + route.GatewayId;
    else if (route.NatGatewayId) cmd += " --nat-gateway-id " + route.NatGatewayId;
    else if (route.TransitGatewayId) cmd += " --transit-gateway-id " + route.TransitGatewayId;
    else if (route.VpcPeeringConnectionId) cmd += " --vpc-peering-connection-id " + route.VpcPeeringConnectionId;
    else if (route.VpcEndpointId) cmd += " --vpc-endpoint-id " + route.VpcEndpointId;
    return cmd;
  }
  function fwTakeSnapshot(ctx) {
    if (_fwSnapshot) return;
    if (!ctx) return;
    _fwSnapshot = {
      nacls: JSON.parse(JSON.stringify(ctx.nacls || [])),
      sgs: JSON.parse(JSON.stringify(ctx.sgs || [])),
      rts: JSON.parse(JSON.stringify(ctx.rts || []))
    };
  }
  function fwResetAll(ctx) {
    if (!_fwSnapshot || !ctx) return;
    ctx.nacls.length = 0;
    _fwSnapshot.nacls.forEach((n) => ctx.nacls.push(JSON.parse(JSON.stringify(n))));
    ctx.sgs.length = 0;
    _fwSnapshot.sgs.forEach((s) => ctx.sgs.push(JSON.parse(JSON.stringify(s))));
    ctx.rts.length = 0;
    _fwSnapshot.rts.forEach((r) => ctx.rts.push(JSON.parse(JSON.stringify(r))));
    fwRebuildLookups(ctx);
    _fwEdits = [];
    _fwSnapshot = null;
  }
  function fwRebuildLookups(ctx) {
    if (!ctx) return;
    const subNacl = {};
    (ctx.nacls || []).forEach((n) => {
      (n.Associations || []).forEach((a) => {
        if (a.SubnetId) subNacl[a.SubnetId] = n;
      });
    });
    ctx.subNacl = subNacl;
    const mainRT = {};
    (ctx.rts || []).forEach((rt) => {
      if ((rt.Associations || []).some((a) => a.Main)) mainRT[rt.VpcId] = rt;
    });
    const subRT = {};
    (ctx.rts || []).forEach((rt) => {
      (rt.Associations || []).forEach((a) => {
        if (a.SubnetId) subRT[a.SubnetId] = rt;
      });
    });
    (ctx.subnets || []).forEach((s) => {
      if (!subRT[s.SubnetId] && mainRT[s.VpcId]) subRT[s.SubnetId] = mainRT[s.VpcId];
    });
    ctx.subRT = subRT;
    const sgByVpc = {};
    (ctx.sgs || []).forEach((sg) => {
      (sgByVpc[sg.VpcId] = sgByVpc[sg.VpcId] || []).push(sg);
    });
    ctx.sgByVpc = sgByVpc;
  }
  function fwRemoveRule(edit, ctx) {
    if (edit.type === "nacl") {
      const nacl = (ctx.nacls || []).find((n) => n.NetworkAclId === edit.resourceId);
      if (!nacl) return;
      const isEgress = edit.direction === "egress";
      const idx = (nacl.Entries || []).findIndex(
        (e) => e.RuleNumber === edit.rule.RuleNumber && e.Egress === isEgress
      );
      if (idx >= 0) nacl.Entries.splice(idx, 1);
    } else if (edit.type === "sg") {
      const sg = (ctx.sgs || []).find((s) => s.GroupId === edit.resourceId);
      if (!sg) return;
      const arr = edit.direction === "ingress" ? sg.IpPermissions : sg.IpPermissionsEgress;
      if (!arr) return;
      const idx = arr.findIndex((p) => fwRuleMatch(p, edit.rule));
      if (idx >= 0) arr.splice(idx, 1);
    } else if (edit.type === "route") {
      const rt = (ctx.rts || []).find((r) => r.RouteTableId === edit.resourceId);
      if (!rt || !rt.Routes) return;
      const idx = rt.Routes.findIndex((r) => r.DestinationCidrBlock === edit.rule.DestinationCidrBlock);
      if (idx >= 0) rt.Routes.splice(idx, 1);
    }
  }
  function fwRestoreRule(edit, ctx) {
    if (edit.originalRule) {
      fwApplyRule(edit.type, edit.resourceId, edit.direction, edit.originalRule, ctx);
    }
  }
  function fwApplyRule(type, resourceId, direction, ruleData, ctx) {
    if (type === "nacl") {
      const nacl = (ctx.nacls || []).find((n) => n.NetworkAclId === resourceId);
      if (!nacl) return;
      if (!nacl.Entries) nacl.Entries = [];
      const isEgress = direction === "egress";
      const idx = nacl.Entries.findIndex(
        (e) => e.RuleNumber === ruleData.RuleNumber && e.Egress === isEgress
      );
      const entry = Object.assign({}, ruleData, { Egress: isEgress });
      if (idx >= 0) nacl.Entries[idx] = entry;
      else nacl.Entries.push(entry);
    } else if (type === "sg") {
      const sg = (ctx.sgs || []).find((s) => s.GroupId === resourceId);
      if (!sg) return;
      const key = direction === "ingress" ? "IpPermissions" : "IpPermissionsEgress";
      if (!sg[key]) sg[key] = [];
      const arr = sg[key];
      const idx = arr.findIndex((p) => fwRuleMatch(p, ruleData));
      if (idx >= 0) arr[idx] = Object.assign({}, ruleData);
      else arr.push(Object.assign({}, ruleData));
    } else if (type === "route") {
      const rt = (ctx.rts || []).find((r) => r.RouteTableId === resourceId);
      if (!rt) return;
      if (!rt.Routes) rt.Routes = [];
      const idx = rt.Routes.findIndex((r) => r.DestinationCidrBlock === ruleData.DestinationCidrBlock);
      if (idx >= 0) rt.Routes[idx] = Object.assign({}, ruleData);
      else rt.Routes.push(Object.assign({}, ruleData));
    }
  }
  function fwUndo(ctx) {
    if (!_fwEdits.length) return null;
    const edit = _fwEdits.pop();
    if (edit.action === "add") fwRemoveRule(edit, ctx);
    else if (edit.action === "delete") fwRestoreRule(edit, ctx);
    else if (edit.action === "modify") {
      fwApplyRule(edit.type, edit.resourceId, edit.direction, edit.originalRule, ctx);
    }
    fwRebuildLookups(ctx);
    return edit;
  }

  // src/modules/multi-account.js
  var multi_account_exports = {};
  __export(multi_account_exports, {
    _loadedContexts: () => loadedContexts,
    _mergedCtx: () => mergedCtx,
    _multiViewMode: () => multiViewMode,
    _singleCtxBackup: () => singleCtxBackup,
    buildRlCtxFromData: () => buildRlCtxFromData,
    detectRegionFromCtx: () => detectRegionFromCtx,
    getLoadedContexts: () => getLoadedContexts,
    getMergedCtx: () => getMergedCtx,
    getMultiViewMode: () => getMultiViewMode,
    getSingleCtxBackup: () => getSingleCtxBackup,
    mergeContexts: () => mergeContexts,
    setLoadedContexts: () => setLoadedContexts,
    setMergedCtx: () => setMergedCtx,
    setMultiViewMode: () => setMultiViewMode,
    setSingleCtxBackup: () => setSingleCtxBackup
  });
  function _detectAccountId(r) {
    return typeof window !== "undefined" && window.detectAccountId ? window.detectAccountId(r) : null;
  }
  function _detectRegion(r) {
    return typeof window !== "undefined" && window.detectRegion ? window.detectRegion(r) : null;
  }
  var multiViewMode = false;
  var loadedContexts = [];
  var mergedCtx = null;
  var singleCtxBackup = null;
  function getMultiViewMode() {
    return multiViewMode;
  }
  function setMultiViewMode(v) {
    multiViewMode = v;
  }
  function getLoadedContexts() {
    return loadedContexts;
  }
  function setLoadedContexts(v) {
    loadedContexts = v;
  }
  function getMergedCtx() {
    return mergedCtx;
  }
  function setMergedCtx(v) {
    mergedCtx = v;
  }
  function getSingleCtxBackup() {
    return singleCtxBackup;
  }
  function setSingleCtxBackup(v) {
    singleCtxBackup = v;
  }
  function detectRegionFromCtx(ctx) {
    if (!ctx) return "unknown";
    const sub = (ctx.subnets || [])[0];
    if (sub && sub.AvailabilityZone) return sub.AvailabilityZone.replace(/[a-z]$/, "");
    return "unknown";
  }
  function buildRlCtxFromData(textareas, accountLabel) {
    try {
      let _val = function(id) {
        const v = textareas[id];
        if (!v) return null;
        if (typeof v === "string") {
          const p = safeParse(v);
          if (p !== null) textareas[id] = p;
          return p;
        }
        return v;
      }, tagResource = function(r) {
        if (!r) return r;
        r._accountId = _detectAccountId(r) || userAccount || "default";
        r._region = _detectRegion(r) || "unknown";
        return r;
      }, fillRegion = function(r) {
        if (r && r._region === "unknown" && r.VpcId && vpcRegion[r.VpcId]) r._region = vpcRegion[r.VpcId];
      }, m2o = function(m) {
        const o = {};
        m.forEach((v, k) => {
          o[k] = v;
        });
        return o;
      };
      const userAccount = accountLabel || "";
      let vpcs = ext(_val("in_vpcs"), ["Vpcs"]);
      let subnets = ext(_val("in_subnets"), ["Subnets"]);
      let rts = ext(_val("in_rts"), ["RouteTables"]);
      let sgs = ext(_val("in_sgs"), ["SecurityGroups"]);
      let nacls = ext(_val("in_nacls"), ["NetworkAcls"]);
      let enis = ext(_val("in_enis"), ["NetworkInterfaces"]);
      let igwRaw = ext(_val("in_igws"), ["InternetGateways"]);
      let natRaw = ext(_val("in_nats"), ["NatGateways"]);
      let vpceRaw = ext(_val("in_vpces"), ["VpcEndpoints", "Endpoints"]);
      let instances = ext(_val("in_ec2"), ["Reservations"]).flatMap((r) => r.Instances || [r]);
      let albs = ext(_val("in_albs"), ["LoadBalancers"]);
      let tgs = ext(_val("in_tgs"), ["TargetGroups"]);
      let peerings = ext(_val("in_peer"), ["VpcPeeringConnections"]);
      let vpns = ext(_val("in_vpn"), ["VpnConnections"]);
      let volumes = ext(_val("in_vols"), ["Volumes"]);
      let snapshots2 = ext(_val("in_snaps"), ["Snapshots"]);
      let rdsInstances = ext(_val("in_rds"), ["DBInstances"]);
      let ecsServices = ext(_val("in_ecs"), ["services", "Services"]);
      let lambdaFns = ext(_val("in_lambda"), ["Functions"]).filter((f) => f.VpcConfig && f.VpcConfig.VpcId);
      let ecacheClusters = ext(_val("in_elasticache"), ["CacheClusters"]);
      let redshiftClusters = ext(_val("in_redshift"), ["Clusters"]);
      let s3raw = _val("in_s3");
      let s3bk = s3raw ? ext(s3raw, ["Buckets"]) : [];
      let zones = ext(_val("in_r53"), ["HostedZones"]);
      let wafAcls = ext(_val("in_waf"), ["WebACLs"]);
      let cfDistributions = [];
      const cfRaw = _val("in_cf");
      if (cfRaw) {
        const dl = cfRaw.DistributionList || cfRaw;
        cfDistributions = dl.Items || dl.Distributions || [];
      }
      let tgwAttRaw = ext(_val("in_tgwatt"), ["TransitGatewayAttachments"]);
      [
        vpcs,
        subnets,
        igwRaw,
        natRaw,
        sgs,
        instances,
        albs,
        rdsInstances,
        ecsServices,
        lambdaFns,
        peerings,
        volumes,
        snapshots2,
        enis,
        ecacheClusters,
        redshiftClusters,
        nacls,
        rts,
        vpceRaw,
        vpns,
        s3bk,
        zones,
        wafAcls,
        cfDistributions,
        tgs
      ].forEach((arr) => arr.forEach(tagResource));
      const vpcRegion = {};
      subnets.forEach((s) => {
        if (s.VpcId && s._region && s._region !== "unknown") vpcRegion[s.VpcId] = s._region;
      });
      [vpcs, sgs, nacls, rts, vpceRaw, igwRaw, natRaw, enis, ecacheClusters, redshiftClusters].forEach((arr) => arr.forEach(fillRegion));
      igwRaw.forEach((g) => {
        if (g._region === "unknown") {
          const att = (g.Attachments || [])[0];
          if (att && att.VpcId && vpcRegion[att.VpcId]) g._region = vpcRegion[att.VpcId];
        }
      });
      const subVpcLookup = {};
      subnets.forEach((s) => {
        if (s.SubnetId) subVpcLookup[s.SubnetId] = s.VpcId || "";
      });
      ecsServices.forEach((svc) => {
        if (svc._region === "unknown") {
          const nc = svc.networkConfiguration && svc.networkConfiguration.awsvpcConfiguration;
          const sid2 = nc && nc.subnets && nc.subnets[0];
          if (sid2) {
            const vid = subVpcLookup[sid2];
            if (vid && vpcRegion[vid]) svc._region = vpcRegion[vid];
          }
        }
      });
      vpns.forEach((v) => {
        if (v._region === "unknown") {
          const vgw = v.VpnGatewayId;
          if (vgw) vpcs.forEach((vpc) => {
            if (vpc._region && vpc._region !== "unknown") {
              (vpc.VpnGateways || []).forEach((g) => {
                if (g.VpnGatewayId === vgw) v._region = vpc._region;
              });
            }
          });
        }
      });
      peerings.forEach((p) => {
        if (p._region === "unknown") {
          const rv = p.RequesterVpcInfo && p.RequesterVpcInfo.VpcId;
          const av = p.AccepterVpcInfo && p.AccepterVpcInfo.VpcId;
          if (rv && vpcRegion[rv]) p._region = vpcRegion[rv];
          else if (av && vpcRegion[av]) p._region = vpcRegion[av];
        }
      });
      const volRegion = {};
      volumes.forEach((v) => {
        if (v.VolumeId && v._region && v._region !== "unknown") volRegion[v.VolumeId] = v._region;
      });
      snapshots2.forEach((s) => {
        if (s._region === "unknown" && s.VolumeId && volRegion[s.VolumeId]) s._region = volRegion[s.VolumeId];
      });
      const albArnRegion = {};
      albs.forEach((a) => {
        if (a.LoadBalancerArn && a._region && a._region !== "unknown") albArnRegion[a.LoadBalancerArn] = a._region;
      });
      wafAcls.forEach((w) => {
        if (w._region === "unknown") {
          (w.ResourceArns || []).some((arn) => {
            if (albArnRegion[arn]) {
              w._region = albArnRegion[arn];
              return true;
            }
          });
        }
      });
      zones.forEach((z) => {
        if (z._region === "unknown") z._region = "global";
      });
      cfDistributions.forEach((d) => {
        if (d._region === "unknown") d._region = "global";
      });
      const acctRegion = {};
      [vpcs, subnets, instances].forEach((arr) => {
        arr.forEach((r) => {
          if (r._accountId && r._region && r._region !== "unknown" && r._region !== "global" && !acctRegion[r._accountId]) acctRegion[r._accountId] = r._region;
        });
      });
      [vpcs, sgs, nacls, rts, igwRaw, natRaw, vpceRaw, enis, s3bk, snapshots2, wafAcls, vpns, peerings, volumes, tgs, ecacheClusters, redshiftClusters, ecsServices, lambdaFns, albs, rdsInstances].forEach((arr) => {
        arr.forEach((r) => {
          if (r._region === "unknown" && r._accountId && acctRegion[r._accountId]) r._region = acctRegion[r._accountId];
        });
      });
      const _accounts = /* @__PURE__ */ new Set();
      vpcs.forEach((v) => {
        if (v._accountId && v._accountId !== "default") _accounts.add(v._accountId);
      });
      if (_accounts.size >= 1) {
        const _prAcct = [..._accounts][0];
        [vpcs, subnets, sgs, nacls, rts, igwRaw, natRaw, vpceRaw, enis, instances, albs, rdsInstances, ecsServices, lambdaFns, peerings, ecacheClusters, redshiftClusters, volumes, snapshots2, s3bk, tgs, wafAcls, vpns].forEach((arr) => {
          arr.forEach((r) => {
            if (r && r._accountId === "default") r._accountId = _prAcct;
          });
        });
      }
      const _multiAccount = _accounts.size > 1;
      const _regions = /* @__PURE__ */ new Set();
      vpcs.forEach((v) => {
        if (v._region && v._region !== "unknown") _regions.add(v._region);
      });
      const _multiRegion = _regions.size > 1;
      const vpcIds = new Set(vpcs.map((v) => v.VpcId));
      subnets = subnets.filter((s) => vpcIds.has(s.VpcId));
      const pubSubs = /* @__PURE__ */ new Set();
      rts.forEach((rt) => {
        const hasIgw = rt.Routes && rt.Routes.some((r) => r.GatewayId && r.GatewayId.startsWith("igw-") && r.State !== "blackhole");
        if (hasIgw) (rt.Associations || []).forEach((a) => {
          if (a.SubnetId) pubSubs.add(a.SubnetId);
        });
      });
      const igws = [], nats = [], vpces = [];
      igwRaw.forEach((g) => {
        (g.Attachments || []).forEach((a) => {
          if (vpcIds.has(a.VpcId)) igws.push(Object.assign({}, g, { _vpcId: a.VpcId }));
        });
      });
      natRaw.forEach((g) => {
        if (vpcIds.has(g.VpcId)) nats.push(g);
      });
      vpceRaw.forEach((g) => {
        if (vpcIds.has(g.VpcId)) vpces.push(g);
      });
      const instBySub = /* @__PURE__ */ new Map(), albBySub = /* @__PURE__ */ new Map(), eniBySub = /* @__PURE__ */ new Map();
      const rdsBySub = /* @__PURE__ */ new Map(), ecsBySub = /* @__PURE__ */ new Map(), lambdaBySub = /* @__PURE__ */ new Map();
      instances.forEach((i) => {
        const s = i.SubnetId;
        if (s) {
          if (!instBySub.has(s)) instBySub.set(s, []);
          instBySub.get(s).push(i);
        }
      });
      albs.forEach((a) => {
        (a.AvailabilityZones || []).forEach((az) => {
          const s = az.SubnetId;
          if (s) {
            if (!albBySub.has(s)) albBySub.set(s, []);
            albBySub.get(s).push(a);
          }
        });
      });
      enis.forEach((e) => {
        const s = e.SubnetId;
        if (s) {
          if (!eniBySub.has(s)) eniBySub.set(s, []);
          eniBySub.get(s).push(e);
        }
      });
      rdsInstances.forEach((d) => {
        (d.DBSubnetGroup?.Subnets || []).forEach((s) => {
          const sid2 = s.SubnetIdentifier;
          if (sid2) {
            if (!rdsBySub.has(sid2)) rdsBySub.set(sid2, []);
            rdsBySub.get(sid2).push(d);
          }
        });
      });
      ecsServices.forEach((svc) => {
        (svc.NetworkConfiguration?.awsvpcConfiguration?.Subnets || []).forEach((s) => {
          if (!ecsBySub.has(s)) ecsBySub.set(s, []);
          ecsBySub.get(s).push(svc);
        });
      });
      lambdaFns.forEach((f) => {
        (f.VpcConfig?.SubnetIds || []).forEach((s) => {
          if (!lambdaBySub.has(s)) lambdaBySub.set(s, []);
          lambdaBySub.get(s).push(f);
        });
      });
      const subRT = /* @__PURE__ */ new Map(), subNacl = /* @__PURE__ */ new Map(), sgByVpc = /* @__PURE__ */ new Map();
      rts.forEach((rt) => {
        (rt.Associations || []).forEach((a) => {
          if (a.SubnetId) subRT.set(a.SubnetId, rt);
        });
      });
      nacls.forEach((n) => {
        (n.Associations || []).forEach((a) => {
          if (a.SubnetId) subNacl.set(a.SubnetId, n);
        });
      });
      sgs.forEach((sg) => {
        const v = sg.VpcId;
        if (v) {
          if (!sgByVpc.has(v)) sgByVpc.set(v, []);
          sgByVpc.get(v).push(sg);
        }
      });
      const volByInst = /* @__PURE__ */ new Map(), snapByVol = /* @__PURE__ */ new Map();
      volumes.forEach((v) => {
        (v.Attachments || []).forEach((a) => {
          if (a.InstanceId) {
            if (!volByInst.has(a.InstanceId)) volByInst.set(a.InstanceId, []);
            volByInst.get(a.InstanceId).push(v);
          }
        });
      });
      snapshots2.forEach((s) => {
        const vid = s.VolumeId;
        if (vid) {
          if (!snapByVol.has(vid)) snapByVol.set(vid, []);
          snapByVol.get(vid).push(s);
        }
      });
      const ecacheByVpc = /* @__PURE__ */ new Map(), redshiftByVpc = /* @__PURE__ */ new Map();
      ecacheClusters.forEach((c) => {
        const vid = c.VpcId || "";
        if (vid) {
          if (!ecacheByVpc.has(vid)) ecacheByVpc.set(vid, []);
          ecacheByVpc.get(vid).push(c);
        }
      });
      redshiftClusters.forEach((c) => {
        const v = c.VpcId;
        if (v) {
          if (!redshiftByVpc.has(v)) redshiftByVpc.set(v, []);
          redshiftByVpc.get(v).push(c);
        }
      });
      const tgwAttachments = [...tgwAttRaw];
      rts.forEach((rt) => {
        (rt.Routes || []).forEach((r) => {
          if (r.TransitGatewayId) {
            const vid = rt.VpcId || ((rt.Associations || [])[0] || {}).VpcId;
            tgwAttachments.push({ TransitGatewayId: r.TransitGatewayId, VpcId: vid, _accountId: rt._accountId || "", _region: rt._region || vid && vpcRegion[vid] || "unknown" });
          }
        });
      });
      tgwAttRaw.forEach((t) => {
        tagResource(t);
        fillRegion(t);
      });
      tgwAttachments.forEach((t) => {
        if ((!t._region || t._region === "unknown") && t._accountId && acctRegion[t._accountId]) t._region = acctRegion[t._accountId];
        if (!t._region || t._region === "unknown") {
          const vid = t.VpcId;
          if (vid && vpcRegion[vid]) t._region = vpcRegion[vid];
        }
      });
      const wafByAlb = {};
      wafAcls.forEach((acl) => {
        (acl.ResourceArns || []).forEach((arn) => {
          (wafByAlb[arn] = wafByAlb[arn] || []).push(acl);
        });
      });
      const tgByAlb = {};
      tgs.forEach((tg) => {
        (tg.LoadBalancerArns || []).forEach((arn) => {
          (tgByAlb[arn] = tgByAlb[arn] || []).push(tg);
        });
      });
      const cfByAlb = {};
      cfDistributions.forEach((d) => {
        (d.Origins?.Items || []).forEach((o) => {
          const matchAlb = albs.find((a) => a.DNSName && o.DomainName && o.DomainName.includes(a.DNSName));
          if (matchAlb) (cfByAlb[matchAlb.LoadBalancerArn] = cfByAlb[matchAlb.LoadBalancerArn] || []).push(d);
        });
      });
      const recsByZone = {};
      const allRecSets = ext(_val("in_r53records"), ["ResourceRecordSets", "RecordSets"]);
      allRecSets.forEach((r) => {
        if (r.HostedZoneId) (recsByZone[r.HostedZoneId] = recsByZone[r.HostedZoneId] || []).push(r);
      });
      return {
        vpcs,
        subnets,
        pubSubs,
        rts,
        sgs,
        nacls,
        enis,
        igws,
        nats,
        vpces,
        instances,
        albs,
        tgs,
        peerings,
        vpns,
        volumes,
        snapshots: snapshots2,
        s3bk,
        zones,
        wafAcls,
        wafByAlb,
        tgByAlb,
        cfByAlb,
        rdsInstances,
        ecsServices,
        lambdaFns,
        ecacheClusters,
        redshiftClusters,
        cfDistributions,
        instBySub: m2o(instBySub),
        albBySub: m2o(albBySub),
        eniBySub: m2o(eniBySub),
        rdsBySub: m2o(rdsBySub),
        ecsBySub: m2o(ecsBySub),
        lambdaBySub: m2o(lambdaBySub),
        subRT: m2o(subRT),
        subNacl: m2o(subNacl),
        sgByVpc: m2o(sgByVpc),
        volByInst: m2o(volByInst),
        snapByVol: m2o(snapByVol),
        ecacheByVpc: m2o(ecacheByVpc),
        redshiftByVpc: m2o(redshiftByVpc),
        tgwAttachments,
        recsByZone,
        _multiAccount,
        _accounts,
        _regions,
        _multiRegion
      };
    } catch (e) {
      console.warn("buildRlCtxFromData error:", e);
      return null;
    }
  }
  function mergeContexts(contexts) {
    const visible = contexts.filter((c) => c.visible);
    if (!visible.length) return null;
    visible.forEach((c) => {
      if (!c.rlCtx && c.textareas) c.rlCtx = buildRlCtxFromData(c.textareas, c.accountLabel);
    });
    if (visible.length === 1) return visible[0].rlCtx;
    const merged = {
      vpcs: [],
      subnets: [],
      pubSubs: /* @__PURE__ */ new Set(),
      rts: [],
      sgs: [],
      nacls: [],
      enis: [],
      igws: [],
      nats: [],
      vpces: [],
      instances: [],
      albs: [],
      tgs: [],
      peerings: [],
      vpns: [],
      volumes: [],
      snapshots: [],
      s3bk: [],
      zones: [],
      wafAcls: [],
      wafByAlb: {},
      tgByAlb: {},
      cfByAlb: {},
      rdsInstances: [],
      ecsServices: [],
      lambdaFns: [],
      ecacheClusters: [],
      redshiftClusters: [],
      cfDistributions: [],
      instBySub: {},
      albBySub: {},
      eniBySub: {},
      rdsBySub: {},
      ecsBySub: {},
      lambdaBySub: {},
      subRT: {},
      subNacl: {},
      sgByVpc: {},
      volByInst: {},
      snapByVol: {},
      ecacheByVpc: {},
      redshiftByVpc: {},
      tgwAttachments: [],
      recsByZone: {},
      _multiAccount: true,
      _accounts: /* @__PURE__ */ new Set(),
      _regions: /* @__PURE__ */ new Set(),
      _multiRegion: false
    };
    visible.forEach((ctx) => {
      const c = ctx.rlCtx;
      if (!c) return;
      const tag = (r) => {
        if (r) {
          r._accountId = r._accountId || ctx.accountId;
          r._accountLabel = ctx.accountLabel;
          r._ctxColor = ctx.color;
        }
        return r;
      };
      const arrayKeys = [
        "vpcs",
        "subnets",
        "rts",
        "sgs",
        "nacls",
        "enis",
        "igws",
        "nats",
        "vpces",
        "instances",
        "albs",
        "tgs",
        "peerings",
        "vpns",
        "volumes",
        "snapshots",
        "s3bk",
        "zones",
        "wafAcls",
        "rdsInstances",
        "ecsServices",
        "lambdaFns",
        "ecacheClusters",
        "redshiftClusters",
        "cfDistributions",
        "tgwAttachments"
      ];
      arrayKeys.forEach((k) => {
        if (c[k] && Array.isArray(c[k])) c[k].forEach((r) => {
          tag(r);
          merged[k].push(r);
        });
      });
      if (c.pubSubs) c.pubSubs.forEach((s) => merged.pubSubs.add(s));
      if (c._accounts) c._accounts.forEach((a) => merged._accounts.add(a));
      merged._accounts.add(ctx.accountId);
      if (c._regions) c._regions.forEach((r) => merged._regions.add(r));
      if (ctx._isRegion && ctx.region) merged._regions.add(ctx.region);
      const mapKeys = [
        "instBySub",
        "albBySub",
        "eniBySub",
        "rdsBySub",
        "ecsBySub",
        "lambdaBySub",
        "subRT",
        "subNacl",
        "sgByVpc",
        "volByInst",
        "snapByVol",
        "ecacheByVpc",
        "redshiftByVpc",
        "wafByAlb",
        "tgByAlb",
        "cfByAlb",
        "recsByZone"
      ];
      mapKeys.forEach((k) => {
        if (!c[k]) return;
        const src = c[k];
        const keys = src instanceof Map ? [...src.keys()] : Object.keys(src);
        keys.forEach((key) => {
          const val = src instanceof Map ? src.get(key) : src[key];
          if (Array.isArray(val)) {
            if (!merged[k][key]) merged[k][key] = [];
            val.forEach((v) => merged[k][key].push(v));
          } else {
            if (!merged[k][key]) merged[k][key] = val;
          }
        });
      });
    });
    merged._multiRegion = merged._regions.size > 1;
    return merged;
  }

  // src/modules/compliance-view.js
  var compliance_view_exports = {};
  __export(compliance_view_exports, {
    EFFORT_MAP: () => EFFORT_MAP,
    _EFFORT_MAP: () => EFFORT_MAP,
    _compDashState: () => _compDashState,
    _complianceRefs: () => complianceRefs,
    _mutedFindings: () => _mutedFindings,
    aggregateTopResources: () => aggregateTopResources,
    buildComplianceView: () => buildComplianceView,
    calcComplianceScore: () => calcComplianceScore,
    classifyTier: () => classifyTier,
    complianceRefs: () => complianceRefs,
    estimateTotalEffort: () => estimateTotalEffort,
    getCompDashState: () => getCompDashState,
    getEffort: () => getEffort,
    getMutedFindings: () => getMutedFindings,
    getSeverityGroups: () => getSeverityGroups,
    getTierGroups: () => getTierGroups,
    groupByResource: () => groupByResource,
    isMuted: () => isMuted,
    muteKey: () => muteKey,
    saveMuted: () => saveMuted,
    setCompDashState: () => setCompDashState,
    setMutedFindings: () => setMutedFindings,
    toggleMute: () => toggleMute
  });
  var EFFORT_MAP = {
    // CIS
    "CIS 5.1": "low",
    "CIS 5.2": "low",
    "CIS 5.3": "low",
    "CIS 5.4": "low",
    "CIS 5.5": "med",
    "NET-1": "med",
    "NET-2": "low",
    // WAF
    "WAF-1": "med",
    "WAF-2": "med",
    "WAF-3": "med",
    "WAF-4": "low",
    // ARCH
    "ARCH-N1": "med",
    "ARCH-N2": "med",
    "ARCH-N3": "high",
    "ARCH-N5": "low",
    "ARCH-C1": "low",
    "ARCH-C2": "low",
    "ARCH-C3": "med",
    "ARCH-C4": "med",
    "ARCH-C5": "low",
    "ARCH-C6": "med",
    "ARCH-D1": "low",
    "ARCH-D2": "med",
    "ARCH-D3": "high",
    "ARCH-D4": "med",
    "ARCH-D5": "high",
    "ARCH-D6": "high",
    "ARCH-D7": "low",
    "ARCH-S1": "low",
    "ARCH-S2": "low",
    "ARCH-E1": "med",
    "ARCH-E2": "low",
    "ARCH-G1": "high",
    "ARCH-G2": "low",
    "ARCH-X1": "med",
    // SOC2
    "SOC2-CC6.1": "low",
    "SOC2-CC6.3": "low",
    "SOC2-CC6.6": "med",
    "SOC2-CC6.7": "med",
    "SOC2-CC6.8": "low",
    "SOC2-CC6.10": "med",
    "SOC2-CC7.2": "med",
    "SOC2-CC7.3": "low",
    "SOC2-CC8.1": "low",
    "SOC2-A1.2": "med",
    "SOC2-A1.3": "low",
    "SOC2-A1.4": "med",
    "SOC2-C1.1": "low",
    "SOC2-C1.2": "low",
    "SOC2-C1.3": "high",
    "SOC2-PI1.1": "med",
    // PCI
    "PCI-1.3.1": "low",
    "PCI-1.3.2": "low",
    "PCI-1.3.4": "med",
    "PCI-2.2.1": "low",
    "PCI-2.3.1": "high",
    "PCI-3.4.1": "med",
    "PCI-3.5.1": "med",
    "PCI-4.2.1": "med",
    "PCI-6.3.1": "med",
    "PCI-6.4.1": "med",
    "PCI-7.2.1": "low",
    "PCI-10.2.1": "med",
    "PCI-11.3.1": "low",
    "PCI-12.10.1": "med",
    // IAM
    "IAM-1": "med",
    "IAM-2": "med",
    "IAM-3": "low",
    "IAM-4": "med",
    "IAM-5": "low",
    "IAM-6": "low",
    "IAM-7": "low",
    "IAM-8": "med",
    "IAM-9": "low",
    "IAM-10": "low",
    "IAM-11": "low",
    "IAM-12": "med",
    "IAM-13": "low",
    // CKV (standalone Checkov checks)
    "CKV_AWS_79": "med",
    "CKV_AWS_126": "med",
    "CKV_AWS_21": "low",
    "CKV_AWS_18": "low",
    "CKV_AWS_26": "low",
    "CKV_AWS_45": "low",
    "CKV_AWS_50": "low",
    // BUDR
    "BUDR-HA-1": "med",
    "BUDR-HA-2": "med",
    "BUDR-HA-3": "low",
    "BUDR-HA-4": "med",
    "BUDR-HA-5": "med",
    "BUDR-HA-6": "low",
    "BUDR-BAK-1": "low",
    "BUDR-BAK-2": "med",
    "BUDR-BAK-3": "med",
    "BUDR-BAK-4": "low",
    "BUDR-BAK-5": "low",
    "BUDR-DR-1": "high",
    "BUDR-DR-2": "med",
    // Governance
    "CIS-2.1": "high",
    "CIS-2.2": "low",
    "CIS-2.3": "med",
    "CIS-2.4": "med",
    "CIS-2.7": "med",
    "GOV-GD1": "high",
    "GOV-GD2": "low",
    "GOV-CFG1": "high",
    "GOV-CFG2": "med",
    "GOV-SH1": "high",
    "GOV-AA1": "med",
    "GOV-KMS1": "low",
    "GOV-LOG1": "low",
    "GOV-ECR1": "low",
    "GOV-ECR2": "low",
    "GOV-SEC1": "med",
    "GOV-APIGW1": "low"
  };
  var complianceRefs = {
    "CIS 5.1": { url: "https://docs.aws.amazon.com/securityhub/latest/userguide/nacl-controls.html", ref: "CIS AWS Foundations 5.1" },
    "CIS 5.2": { url: "https://docs.aws.amazon.com/securityhub/latest/userguide/ec2-controls.html#ec2-13", ref: "CIS AWS Foundations 5.2" },
    "CIS 5.3": { url: "https://docs.aws.amazon.com/securityhub/latest/userguide/ec2-controls.html#ec2-14", ref: "CIS AWS Foundations 5.3" },
    "CIS 5.4": { url: "https://docs.aws.amazon.com/securityhub/latest/userguide/ec2-controls.html#ec2-2", ref: "CIS AWS Foundations 5.4" },
    "CIS 5.5": { url: "https://docs.aws.amazon.com/vpc/latest/peering/peering-configurations-partial-access.html", ref: "CIS AWS Foundations 5.5" },
    "NET-1": { url: "https://docs.aws.amazon.com/vpc/latest/userguide/VPC_Scenario2.html", ref: "VPC Private Subnet Design" },
    "NET-2": { url: "https://docs.aws.amazon.com/vpc/latest/userguide/security-group-rules.html", ref: "Security Group Best Practices" },
    "WAF-1": { url: "https://docs.aws.amazon.com/waf/latest/developerguide/waf-rules.html", ref: "AWS WAF Rules" },
    "WAF-2": { url: "https://docs.aws.amazon.com/waf/latest/developerguide/waf-rate-based-rules.html", ref: "WAF Rate-Based Rules" },
    "WAF-3": { url: "https://docs.aws.amazon.com/waf/latest/developerguide/waf-protections.html", ref: "WAF ALB Protection" },
    "WAF-4": { url: "https://docs.aws.amazon.com/waf/latest/developerguide/waf-default-action.html", ref: "WAF Default Action" },
    "ARCH-N1": { url: "https://docs.aws.amazon.com/vpc/latest/userguide/vpc-ip-addressing.html", ref: "Well-Architected SEC05-BP01" },
    "ARCH-N2": { url: "https://docs.aws.amazon.com/vpc/latest/userguide/vpc-nat-gateway.html", ref: "Well-Architected REL-10" },
    "ARCH-N3": { url: "https://docs.aws.amazon.com/wellarchitected/latest/reliability-pillar/use-fault-isolation-to-protect-your-workload.html", ref: "Well-Architected REL-10" },
    "ARCH-N5": { url: "https://docs.aws.amazon.com/vpc/latest/userguide/security-group-rules.html", ref: "Well-Architected SEC05-BP02" },
    "ARCH-C1": { url: "https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-security-groups.html", ref: "Well-Architected SEC05-BP01" },
    "ARCH-C2": { url: "https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/EBSEncryption.html", ref: "Well-Architected SEC08-BP02" },
    "ARCH-C3": { url: "https://docs.aws.amazon.com/lambda/latest/dg/configuration-vpc.html", ref: "Lambda VPC Config" },
    "ARCH-D1": { url: "https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_BestPractices.Security.html", ref: "Well-Architected SEC05-BP01" },
    "ARCH-D2": { url: "https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Concepts.MultiAZ.html", ref: "Well-Architected REL-09" },
    "ARCH-D3": { url: "https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Overview.Encryption.html", ref: "Well-Architected SEC08-BP02" },
    "ARCH-D4": { url: "https://docs.aws.amazon.com/AmazonElastiCache/latest/red-ug/Replication.html", ref: "Well-Architected REL-09" },
    "ARCH-D5": { url: "https://docs.aws.amazon.com/redshift/latest/mgmt/working-with-db-encryption.html", ref: "Well-Architected SEC08-BP02" },
    "ARCH-S1": { url: "https://docs.aws.amazon.com/AmazonS3/latest/userguide/default-bucket-encryption.html", ref: "Well-Architected SEC08-BP02" },
    "ARCH-S2": { url: "https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/EBSSnapshots.html", ref: "Well-Architected REL-09" },
    "ARCH-E1": { url: "https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/Introduction.html", ref: "Well-Architected PERF04-BP01" },
    "ARCH-G1": { url: "https://docs.aws.amazon.com/vpc/latest/userguide/vpc-nat-gateway.html", ref: "Well-Architected REL-10" },
    "ARCH-G2": { url: "https://docs.aws.amazon.com/vpc/latest/privatelink/vpc-endpoints-s3.html", ref: "Well-Architected COST07-BP01" },
    "ARCH-X1": { url: "https://docs.aws.amazon.com/vpc/latest/peering/vpc-peering-routing.html", ref: "VPC Peering Routing" },
    "SOC2-CC6.1": { url: "https://docs.aws.amazon.com/securityhub/latest/userguide/ec2-controls.html", ref: "SOC2 CC6.1 Logical Access Security" },
    "SOC2-CC6.3": { url: "https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html", ref: "SOC2 CC6.3 Role-Based Access" },
    "SOC2-CC6.6": { url: "https://docs.aws.amazon.com/vpc/latest/userguide/security-group-rules.html", ref: "SOC2 CC6.6 Network Boundaries" },
    "SOC2-CC6.7": { url: "https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/data-protection.html", ref: "SOC2 CC6.7 Data Transmission" },
    "SOC2-CC6.8": { url: "https://docs.aws.amazon.com/wellarchitected/latest/security-pillar/infrastructure-protection.html", ref: "SOC2 CC6.8 Malicious Software" },
    "SOC2-CC7.2": { url: "https://docs.aws.amazon.com/guardduty/latest/ug/what-is-guardduty.html", ref: "SOC2 CC7.2 Monitoring" },
    "SOC2-CC8.1": { url: "https://docs.aws.amazon.com/config/latest/developerguide/WhatIsConfig.html", ref: "SOC2 CC8.1 Change Management" },
    "SOC2-A1.2": { url: "https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Concepts.MultiAZ.html", ref: "SOC2 A1.2 Availability" },
    "SOC2-A1.3": { url: "https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/EBSSnapshots.html", ref: "SOC2 A1.3 Recovery" },
    "SOC2-C1.1": { url: "https://docs.aws.amazon.com/AmazonS3/latest/userguide/default-bucket-encryption.html", ref: "SOC2 C1.1 Confidentiality" },
    "SOC2-C1.2": { url: "https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/EBSEncryption.html", ref: "SOC2 C1.2 Data Protection" },
    "SOC2-PI1.1": { url: "https://docs.aws.amazon.com/vpc/latest/userguide/vpc-network-acls.html", ref: "SOC2 PI1.1 Processing Integrity" },
    "PCI-1.3.1": { url: "https://docs.aws.amazon.com/vpc/latest/userguide/VPC_SecurityGroups.html", ref: "PCI DSS 4.0 Req 1.3.1 Inbound Traffic" },
    "PCI-1.3.2": { url: "https://docs.aws.amazon.com/vpc/latest/userguide/security-group-rules.html", ref: "PCI DSS 4.0 Req 1.3.2 Outbound Traffic" },
    "PCI-1.3.4": { url: "https://docs.aws.amazon.com/vpc/latest/userguide/vpc-network-acls.html", ref: "PCI DSS 4.0 Req 1.3.4 Network Segmentation" },
    "PCI-2.2.1": { url: "https://docs.aws.amazon.com/config/latest/developerguide/WhatIsConfig.html", ref: "PCI DSS 4.0 Req 2.2.1 Configuration Standards" },
    "PCI-3.4.1": { url: "https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/EBSEncryption.html", ref: "PCI DSS 4.0 Req 3.4.1 Data Encryption" },
    "PCI-3.5.1": { url: "https://docs.aws.amazon.com/kms/latest/developerguide/overview.html", ref: "PCI DSS 4.0 Req 3.5.1 Key Management" },
    "PCI-4.2.1": { url: "https://docs.aws.amazon.com/elasticloadbalancing/latest/application/create-https-listener.html", ref: "PCI DSS 4.0 Req 4.2.1 TLS" },
    "PCI-6.4.1": { url: "https://docs.aws.amazon.com/waf/latest/developerguide/waf-chapter.html", ref: "PCI DSS 4.0 Req 6.4.1 Web App Firewall" },
    "PCI-7.2.1": { url: "https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html", ref: "PCI DSS 4.0 Req 7.2.1 Least Privilege" },
    "PCI-8.3.1": { url: "https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_mfa.html", ref: "PCI DSS 4.0 Req 8.3.1 MFA" },
    "PCI-10.2.1": { url: "https://docs.aws.amazon.com/awscloudtrail/latest/userguide/cloudtrail-user-guide.html", ref: "PCI DSS 4.0 Req 10.2.1 Audit Logging" },
    "PCI-11.3.1": { url: "https://docs.aws.amazon.com/inspector/latest/user/what-is-inspector.html", ref: "PCI DSS 4.0 Req 11.3.1 Vulnerability Scanning" },
    "PCI-12.10.1": { url: "https://docs.aws.amazon.com/guardduty/latest/ug/what-is-guardduty.html", ref: "PCI DSS 4.0 Req 12.10.1 Incident Response" },
    "IAM-1": { url: "https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html", ref: "IAM Best Practices" },
    "IAM-2": { url: "https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html#grant-least-privilege", ref: "IAM Least Privilege" },
    "IAM-3": { url: "https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_common-scenarios_third-party.html", ref: "Cross-Account MFA" },
    "IAM-4": { url: "https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html#grant-least-privilege", ref: "IAM Service Wildcards" },
    "IAM-5": { url: "https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_finding-unused.html", ref: "Unused IAM Roles" },
    "IAM-6": { url: "https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_create_for-user_externalid.html", ref: "External ID Best Practice" },
    "IAM-7": { url: "https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html#bp-use-aws-defined-policies", ref: "Managed vs Inline Policies" },
    "IAM-8": { url: "https://docs.aws.amazon.com/IAM/latest/UserGuide/access_policies_boundaries.html", ref: "Permission Boundaries" },
    "CKV_AWS_79": { url: "https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/configuring-instance-metadata-service.html", ref: "Checkov CKV_AWS_79 - IMDSv2" },
    "CKV_AWS_126": { url: "https://docs.aws.amazon.com/vpc/latest/userguide/flow-logs.html", ref: "Checkov CKV_AWS_126 - VPC Flow Logs" },
    "CKV_AWS_21": { url: "https://docs.aws.amazon.com/AmazonS3/latest/userguide/Versioning.html", ref: "Checkov CKV_AWS_21 - S3 Versioning" },
    "CKV_AWS_18": { url: "https://docs.aws.amazon.com/AmazonS3/latest/userguide/ServerLogs.html", ref: "Checkov CKV_AWS_18 - S3 Access Logging" },
    "CKV_AWS_26": { url: "https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_WorkingWithAutomatedBackups.html", ref: "Checkov CKV_AWS_26 - RDS Backup Retention" },
    "CKV_AWS_45": { url: "https://docs.aws.amazon.com/lambda/latest/dg/configuration-envvars.html", ref: "Checkov CKV_AWS_45 - Lambda Env Encryption" },
    "CKV_AWS_50": { url: "https://docs.aws.amazon.com/lambda/latest/dg/services-xray.html", ref: "Checkov CKV_AWS_50 - Lambda X-Ray Tracing" },
    "BUDR-HA-1": { url: "https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Concepts.MultiAZ.html", ref: "RDS Multi-AZ Deployments" },
    "BUDR-HA-2": { url: "https://docs.aws.amazon.com/autoscaling/ec2/userguide/what-is-amazon-ec2-auto-scaling.html", ref: "EC2 Auto Scaling" },
    "BUDR-HA-3": { url: "https://docs.aws.amazon.com/AmazonECS/latest/developerguide/service-auto-scaling.html", ref: "ECS Service Scaling" },
    "BUDR-HA-4": { url: "https://docs.aws.amazon.com/AmazonElastiCache/latest/red-ug/Replication.html", ref: "ElastiCache Replication" },
    "BUDR-HA-5": { url: "https://docs.aws.amazon.com/redshift/latest/mgmt/managing-clusters-console.html", ref: "Redshift Cluster Management" },
    "BUDR-HA-6": { url: "https://docs.aws.amazon.com/elasticloadbalancing/latest/application/load-balancer-subnets.html", ref: "ALB Availability Zones" },
    "BUDR-BAK-1": { url: "https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_WorkingWithAutomatedBackups.html", ref: "RDS Automated Backups" },
    "BUDR-BAK-2": { url: "https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/EBSSnapshots.html", ref: "EBS Snapshots" },
    "BUDR-BAK-3": { url: "https://docs.aws.amazon.com/AmazonElastiCache/latest/red-ug/backups.html", ref: "ElastiCache Backups" },
    "BUDR-BAK-4": { url: "https://docs.aws.amazon.com/redshift/latest/mgmt/working-with-snapshots.html", ref: "Redshift Snapshots" },
    "BUDR-BAK-5": { url: "https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/EBSSnapshots.html", ref: "EBS Snapshot Scheduling" },
    "BUDR-DR-1": { url: "https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Concepts.MultiAZ.html", ref: "RDS DR Strategy" },
    "BUDR-DR-2": { url: "https://docs.aws.amazon.com/prescriptive-guidance/latest/backup-recovery/ec2-backup.html", ref: "EC2 DR Strategy" },
    // Governance
    "CIS-2.1": { url: "https://docs.aws.amazon.com/awscloudtrail/latest/userguide/cloudtrail-create-and-update-a-trail.html", ref: "CIS AWS 2.1 CloudTrail Multi-Region" },
    "CIS-2.2": { url: "https://docs.aws.amazon.com/awscloudtrail/latest/userguide/cloudtrail-log-file-validation-intro.html", ref: "CIS AWS 2.2 Log Validation" },
    "CIS-2.3": { url: "https://docs.aws.amazon.com/awscloudtrail/latest/userguide/encrypting-cloudtrail-log-files-with-aws-kms.html", ref: "CIS AWS 2.3 KMS Encryption" },
    "CIS-2.4": { url: "https://docs.aws.amazon.com/awscloudtrail/latest/userguide/send-cloudtrail-events-to-cloudwatch-logs.html", ref: "CIS AWS 2.4 CloudWatch Integration" },
    "CIS-2.7": { url: "https://docs.aws.amazon.com/vpc/latest/userguide/flow-logs.html", ref: "CIS AWS 2.7 VPC Flow Logs" },
    "GOV-GD1": { url: "https://docs.aws.amazon.com/guardduty/latest/ug/guardduty_settingup.html", ref: "GuardDuty Setup" },
    "GOV-GD2": { url: "https://docs.aws.amazon.com/guardduty/latest/ug/guardduty-features-activation-model.html", ref: "GuardDuty Features" },
    "GOV-CFG1": { url: "https://docs.aws.amazon.com/config/latest/developerguide/stop-start-recorder.html", ref: "AWS Config Recorder" },
    "GOV-CFG2": { url: "https://docs.aws.amazon.com/config/latest/developerguide/evaluate-config.html", ref: "AWS Config Rules" },
    "GOV-SH1": { url: "https://docs.aws.amazon.com/securityhub/latest/userguide/securityhub-standards.html", ref: "Security Hub Standards" },
    "GOV-AA1": { url: "https://docs.aws.amazon.com/IAM/latest/UserGuide/what-is-access-analyzer.html", ref: "IAM Access Analyzer" },
    "GOV-KMS1": { url: "https://docs.aws.amazon.com/kms/latest/developerguide/rotate-keys.html", ref: "KMS Key Rotation" },
    "GOV-LOG1": { url: "https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/Working-with-log-groups-and-streams.html", ref: "CloudWatch Logs Retention" },
    "GOV-ECR1": { url: "https://docs.aws.amazon.com/AmazonECR/latest/userguide/image-tag-mutability.html", ref: "ECR Tag Immutability" },
    "GOV-ECR2": { url: "https://docs.aws.amazon.com/AmazonECR/latest/userguide/image-scanning.html", ref: "ECR Image Scanning" },
    "GOV-SEC1": { url: "https://docs.aws.amazon.com/secretsmanager/latest/userguide/rotating-secrets.html", ref: "Secrets Manager Rotation" },
    "GOV-APIGW1": { url: "https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-custom-domain-tls-version.html", ref: "API Gateway TLS Policy" }
  };
  var _compDashState = { sevFilter: "ALL", fwFilter: "all", search: "", sort: "severity", showMuted: false, execSummary: false, view: "action" };
  var _mutedFindings = /* @__PURE__ */ new Set();
  try {
    const raw = localStorage.getItem(MUTE_KEY);
    if (raw) _mutedFindings = new Set(JSON.parse(raw));
  } catch (e) {
  }
  function getCompDashState() {
    return _compDashState;
  }
  function setCompDashState(v) {
    _compDashState = v;
  }
  function getMutedFindings() {
    return _mutedFindings;
  }
  function setMutedFindings(v) {
    _mutedFindings = v;
  }
  function saveMuted() {
    try {
      localStorage.setItem(MUTE_KEY, JSON.stringify([..._mutedFindings]));
    } catch (e) {
    }
  }
  function muteKey(f) {
    return f.control + "::" + f.resource;
  }
  function isMuted(f) {
    return _mutedFindings.has(muteKey(f));
  }
  function toggleMute(f) {
    const k = muteKey(f);
    if (_mutedFindings.has(k)) _mutedFindings.delete(k);
    else _mutedFindings.add(k);
    saveMuted();
  }
  function getEffort(f) {
    return EFFORT_MAP[f.control] || "med";
  }
  function classifyTier(f) {
    const e = getEffort(f), s = f.severity;
    if (s === "CRITICAL") return "crit";
    if (s === "HIGH" && e === "low") return "crit";
    if (s === "HIGH") return "high";
    if (s === "MEDIUM" && e === "low") return "high";
    if (s === "MEDIUM") return "med";
    return "low";
  }
  function groupByResource(findings) {
    const map = {};
    findings.forEach((f) => {
      const k = f.resource;
      if (!map[k]) map[k] = { resource: f.resource, resourceName: f.resourceName || f.resource, findings: [], worstSev: "LOW", worstTier: "low", _accountId: f._accountId };
      const tier = classifyTier(f);
      map[k].findings.push(Object.assign({}, f, { effort: getEffort(f), tier }));
      if ((SEV_ORDER[f.severity] || 9) < (SEV_ORDER[map[k].worstSev] || 9)) map[k].worstSev = f.severity;
      if ((PRIORITY_ORDER[tier] || 9) < (PRIORITY_ORDER[map[k].worstTier] || 9)) map[k].worstTier = tier;
    });
    return Object.values(map).sort((a, b) => {
      if (a.worstTier !== b.worstTier) return (PRIORITY_ORDER[a.worstTier] || 9) - (PRIORITY_ORDER[b.worstTier] || 9);
      return (SEV_ORDER[a.worstSev] || 9) - (SEV_ORDER[b.worstSev] || 9);
    });
  }
  function getTierGroups(findings) {
    const g = { crit: [], high: [], med: [], low: [] };
    groupByResource(findings).forEach((rg) => {
      g[rg.worstTier].push(rg);
    });
    return g;
  }
  function getSeverityGroups(findings) {
    const g = { CRITICAL: [], HIGH: [], MEDIUM: [], LOW: [] };
    groupByResource(findings).forEach((rg) => {
      g[rg.worstSev].push(rg);
    });
    return g;
  }
  function estimateTotalEffort(resourceGroups) {
    var mins = 0;
    resourceGroups.forEach((rg) => {
      rg.findings.forEach((f) => {
        if (f.effort === "low") mins += 5;
        else if (f.effort === "med") mins += 90;
        else mins += 480;
      });
    });
    if (mins < 60) return "~" + mins + " min";
    if (mins < 480) return "~" + Math.round(mins / 60) + " hrs";
    return "~" + Math.round(mins / 480) + " days";
  }
  function calcComplianceScore(findings) {
    const active = findings.filter((f) => !isMuted(f));
    if (!active.length) return { score: 100, grade: "A", color: "#22c55e" };
    const w = { CRITICAL: 10, HIGH: 5, MEDIUM: 2, LOW: 0.5 };
    const penalty = active.reduce((s, f) => s + (w[f.severity] || 0), 0);
    const maxPenalty = active.length * 10;
    const score = Math.max(0, Math.round(100 - penalty / maxPenalty * 100));
    const grade = score >= 90 ? "A" : score >= 80 ? "B" : score >= 70 ? "C" : score >= 50 ? "D" : "F";
    const color = score >= 90 ? "#22c55e" : score >= 70 ? "#eab308" : score >= 50 ? "#f97316" : "#ef4444";
    return { score, grade, color };
  }
  function aggregateTopResources(findings, limit) {
    const map = {};
    findings.forEach((f) => {
      const r = f.resourceName || f.resource;
      if (!r || r === "Multiple") return;
      if (!map[r]) map[r] = { count: 0, worst: "LOW", sevs: {} };
      map[r].count++;
      map[r].sevs[f.severity] = (map[r].sevs[f.severity] || 0) + 1;
      if ((SEV_ORDER[f.severity] || 9) < (SEV_ORDER[map[r].worst] || 9)) map[r].worst = f.severity;
    });
    return Object.entries(map).sort((a, b) => {
      const sd = (SEV_ORDER[a[1].worst] || 9) - (SEV_ORDER[b[1].worst] || 9);
      return sd !== 0 ? sd : b[1].count - a[1].count;
    }).slice(0, limit);
  }
  function _rptFilterByAccount(items, acctId) {
    if (typeof window !== "undefined" && window._rptFilterByAccount) {
      return window._rptFilterByAccount(items, acctId);
    }
    if (!acctId || acctId === "all") return items;
    return items.filter((item) => (item._accountId || item.account || "") === acctId);
  }
  function buildComplianceView(opts) {
    opts = opts || {};
    var src = (opts.findings || complianceFindings || []).slice();
    if (opts.accountFilter) src = _rptFilterByAccount(src, opts.accountFilter);
    if (Array.isArray(opts.frameworks)) src = src.filter((f) => opts.frameworks.indexOf(f.framework) !== -1);
    else if (opts.frameworks && opts.frameworks !== "all") src = src.filter((f) => f.framework === opts.frameworks);
    if (Array.isArray(opts.severities)) src = src.filter((f) => opts.severities.indexOf(f.severity) !== -1);
    if (opts.search) {
      var q = opts.search.toLowerCase();
      src = src.filter(
        (f) => (f.message || "").toLowerCase().indexOf(q) !== -1 || (f.resource || "").toLowerCase().indexOf(q) !== -1 || (f.resourceName || "").toLowerCase().indexOf(q) !== -1 || (f.control || "").toLowerCase().indexOf(q) !== -1 || (f.ckv || "").toLowerCase().indexOf(q) !== -1 || (f.remediation || "").toLowerCase().indexOf(q) !== -1
      );
    }
    if (!opts.includeMuted) src = src.filter((f) => !isMuted(f));
    var base = src.map((f) => Object.assign({}, f, { _tier: classifyTier(f), _effort: getEffort(f) }));
    var filtered = typeof opts.severity === "string" && opts.severity !== "ALL" ? base.filter((f) => f.severity === opts.severity) : base;
    var sevCounts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
    var tierCounts = { crit: 0, high: 0, med: 0, low: 0 };
    base.forEach((f) => {
      sevCounts[f.severity]++;
      tierCounts[f._tier]++;
    });
    var filteredTierCounts = { crit: 0, high: 0, med: 0, low: 0 };
    var filteredSevCounts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
    filtered.forEach((f) => {
      filteredTierCounts[f._tier]++;
      filteredSevCounts[f.severity]++;
    });
    var tiers = getTierGroups(filtered);
    var baseTiers = typeof opts.severity === "string" && opts.severity !== "ALL" ? getTierGroups(base) : tiers;
    var sevGroups = getSeverityGroups(filtered);
    return {
      base,
      filtered,
      tiers,
      baseTiers,
      sevGroups,
      sevCounts,
      tierCounts,
      filteredTierCounts,
      filteredSevCounts,
      score: calcComplianceScore(base),
      effort: estimateTotalEffort(groupByResource(base)),
      mutedCount: (complianceFindings || []).filter((f) => isMuted(f)).length
    };
  }
  if (typeof window !== "undefined") {
    window._EFFORT_MAP = EFFORT_MAP;
    window._complianceRefs = complianceRefs;
    window._compDashState = _compDashState;
    window._mutedFindings = _mutedFindings;
    window._saveMuted = saveMuted;
    window._muteKey = muteKey;
    window._isMuted = isMuted;
    window._toggleMute = toggleMute;
    window._getEffort = getEffort;
    window._classifyTier = classifyTier;
    window._groupByResource = groupByResource;
    window._getTierGroups = getTierGroups;
    window._getSeverityGroups = getSeverityGroups;
    window._estimateTotalEffort = estimateTotalEffort;
    window._calcComplianceScore = calcComplianceScore;
    window._aggregateTopResources = aggregateTopResources;
    window._buildComplianceView = buildComplianceView;
  }

  // src/modules/unified-dashboard.js
  var unified_dashboard_exports = {};
  __export(unified_dashboard_exports, {
    BUDR_TIER_META: () => BUDR_TIER_META,
    _BUDR_TIER_META: () => BUDR_TIER_META,
    _budrDashState: () => _budrDashState,
    _udashAcctFilter: () => _udashAcctFilter,
    _udashTab: () => _udashTab,
    getBudrDashState: () => getBudrDashState,
    getUdashAcctFilter: () => getUdashAcctFilter,
    getUdashTab: () => getUdashTab,
    setBudrDashState: () => setBudrDashState,
    setUdashAcctFilter: () => setUdashAcctFilter,
    setUdashTab: () => setUdashTab,
    udashFilterByAccount: () => udashFilterByAccount
  });
  var _udashTab = null;
  var _udashAcctFilter = "all";
  var _budrDashState = { tierFilter: "all", search: "", sort: "tier" };
  var BUDR_TIER_META = {
    protected: { name: "Protected", color: "#10b981", icon: "" },
    partial: { name: "Partially Protected", color: "#f59e0b", icon: "" },
    at_risk: { name: "At Risk", color: "#ef4444", icon: "" }
  };
  function getUdashTab() {
    return _udashTab;
  }
  function setUdashTab(v) {
    _udashTab = v;
  }
  function getUdashAcctFilter() {
    return _udashAcctFilter;
  }
  function setUdashAcctFilter(v) {
    _udashAcctFilter = v;
  }
  function getBudrDashState() {
    return _budrDashState;
  }
  function setBudrDashState(v) {
    _budrDashState = v;
  }
  function udashFilterByAccount(items) {
    if (!_udashAcctFilter || _udashAcctFilter === "all") return items;
    var id = _udashAcctFilter;
    var lbl = typeof window !== "undefined" && typeof window._rptAccountLabel === "function" ? window._rptAccountLabel(id) : "";
    return items.filter(function(item) {
      var a = item._accountId || item.account || "";
      return a === id || a === lbl;
    });
  }
  if (typeof window !== "undefined") {
    window._udashTab = _udashTab;
    window._udashAcctFilter = _udashAcctFilter;
    window._budrDashState = _budrDashState;
    window._BUDR_TIER_META = BUDR_TIER_META;
    window._udashFilterByAccount = udashFilterByAccount;
    window.getUdashTab = getUdashTab;
    window.setUdashTab = setUdashTab;
    window.getUdashAcctFilter = getUdashAcctFilter;
    window.setUdashAcctFilter = setUdashAcctFilter;
  }

  // src/modules/governance.js
  var governance_exports = {};
  __export(governance_exports, {
    _APP_TYPE_SUGGESTIONS: () => _APP_TYPE_SUGGESTIONS,
    _DEFAULT_CLASS_RULES: () => _DEFAULT_CLASS_RULES,
    _INV_NO_MAP_TYPES: () => _INV_NO_MAP_TYPES,
    _INV_TYPE_COLORS: () => _INV_TYPE_COLORS,
    _TIER_RPO_RTO: () => _TIER_RPO_RTO,
    _appAutoDiscovered: () => _appAutoDiscovered,
    _appRegistry: () => _appRegistry,
    _appSummaryState: () => _appSummaryState,
    _buildInventoryData: () => _buildInventoryData,
    _classificationData: () => _classificationData,
    _classificationOverrides: () => _classificationOverrides,
    _classificationRules: () => _classificationRules,
    _collectStatements: () => _collectStatements,
    _discoverTagKeys: () => _discoverTagKeys,
    _discoveredTags: () => _discoveredTags,
    _filterInventory: () => _filterInventory,
    _getTagMap: () => _getTagMap,
    _govDashState: () => _govDashState,
    _iamDashState: () => _iamDashState,
    _iamReviewData: () => _iamReviewData,
    _invFilterCache: () => _invFilterCache,
    _invFilterKey: () => _invFilterKey,
    _invState: () => _invState,
    _invToolbarRendered: () => _invToolbarRendered,
    _inventoryData: () => _inventoryData,
    _safeRegex: () => _safeRegex,
    _scoreClassification: () => _scoreClassification,
    canDo: () => canDo,
    evaluateCondition: () => evaluateCondition,
    getAppAutoDiscovered: () => getAppAutoDiscovered,
    getAppRegistry: () => getAppRegistry,
    getAppSummaryState: () => getAppSummaryState,
    getClassificationData: () => getClassificationData,
    getClassificationOverrides: () => getClassificationOverrides,
    getClassificationRules: () => getClassificationRules,
    getDiscoveredTags: () => getDiscoveredTags,
    getGovDashState: () => getGovDashState,
    getIamDashState: () => getIamDashState,
    getIamReviewData: () => getIamReviewData,
    getInvFilterCache: () => getInvFilterCache,
    getInvFilterKey: () => getInvFilterKey,
    getInvState: () => getInvState,
    getInvToolbarRendered: () => getInvToolbarRendered,
    getInventoryData: () => getInventoryData,
    matchAction: () => matchAction,
    matchResource: () => matchResource,
    prepareIAMReviewData: () => prepareIAMReviewData,
    runClassificationEngine: () => runClassificationEngine,
    setAppAutoDiscovered: () => setAppAutoDiscovered,
    setAppRegistry: () => setAppRegistry,
    setAppSummaryState: () => setAppSummaryState,
    setClassificationData: () => setClassificationData,
    setClassificationOverrides: () => setClassificationOverrides,
    setClassificationRules: () => setClassificationRules,
    setDiscoveredTags: () => setDiscoveredTags,
    setGovDashState: () => setGovDashState,
    setIamDashState: () => setIamDashState,
    setIamReviewData: () => setIamReviewData,
    setInvFilterCache: () => setInvFilterCache,
    setInvFilterKey: () => setInvFilterKey,
    setInvState: () => setInvState,
    setInvToolbarRendered: () => setInvToolbarRendered,
    setInventoryData: () => setInventoryData,
    summarizePermissions: () => summarizePermissions
  });
  var _govDashState = { tab: "classification", filter: "all", search: "", sort: "tier", sortDir: "asc", page: 1, perPage: 50 };
  var _iamDashState = { filter: "all", search: "", sort: "name", sortDir: "asc", page: 1, perPage: 50 };
  var _classificationData = [];
  var _classificationOverrides = {};
  var _iamReviewData = [];
  var _inventoryData = [];
  var _invState = { typeFilter: "all", regionFilter: "all", accountFilter: "all", vpcFilter: "all", viewMode: "flat", search: "", sort: "type", sortDir: "asc", page: 1, perPage: 50 };
  var _appRegistry = [];
  var _appAutoDiscovered = false;
  var _appSummaryState = { search: "", sort: "tier", sortDir: "asc", adding: false, editing: -1 };
  var _APP_TYPE_SUGGESTIONS = ["Web App", "Database", "Monitoring", "CI/CD", "Security", "Analytics", "Storage", "Infrastructure"];
  var _invToolbarRendered = false;
  var _INV_TYPE_COLORS = {
    "VPC": "#7C3AED",
    "Subnet": "#6366f1",
    "EC2": "#f97316",
    "RDS": "#22d3ee",
    "Lambda": "#f59e0b",
    "ECS": "#10b981",
    "ALB": "#ec4899",
    "ElastiCache": "#8b5cf6",
    "Redshift": "#06b6d4",
    "SG": "#64748b",
    "NACL": "#64748b",
    "Route Table": "#64748b",
    "IGW": "#34d399",
    "NAT GW": "#34d399",
    "VPC Endpoint": "#34d399",
    "ENI": "#94a3b8",
    "EBS Volume": "#fb923c",
    "Snapshot": "#a78bfa",
    "S3 Bucket": "#f472b6",
    "Route 53": "#38bdf8",
    "WAF": "#fbbf24",
    "CloudFront": "#818cf8",
    "VPC Peering": "#c084fc",
    "VPN": "#2dd4bf",
    "TGW Attachment": "#67e8f9",
    "Target Group": "#f9a8d4"
  };
  var _INV_NO_MAP_TYPES = { "S3 Bucket": 1, "Route 53": 1, "WAF": 1, "CloudFront": 1, "Snapshot": 1, "TGW Attachment": 1, "Target Group": 1 };
  var _invFilterCache = null;
  var _invFilterKey = "";
  var _DEFAULT_CLASS_RULES = [
    { pattern: "prod|production", scope: "vpc", tier: "critical", weight: 100 },
    { pattern: "pci|complian", scope: "vpc", tier: "critical", weight: 95 },
    { pattern: "dr-|disaster|recovery", scope: "vpc", tier: "critical", weight: 90 },
    { pattern: "shared.?serv|data.?platform|security", scope: "vpc", tier: "high", weight: 80 },
    { pattern: "edge|proxy|waf|cdn", scope: "vpc", tier: "high", weight: 75 },
    { pattern: "staging|stage|qa|uat", scope: "vpc", tier: "medium", weight: 50 },
    { pattern: "management|mgmt|monitor", scope: "vpc", tier: "medium", weight: 45 },
    { pattern: "dev|develop|sandbox|test|experiment", scope: "vpc", tier: "low", weight: 20 },
    { pattern: "rds|database|db|aurora|dynamo", scope: "type", tier: "critical", weight: 90 },
    { pattern: "redshift|warehouse", scope: "type", tier: "critical", weight: 85 },
    { pattern: "elasticache|redis|memcache|cache", scope: "type", tier: "high", weight: 70 },
    { pattern: "alb|elb|loadbalancer|nlb", scope: "type", tier: "high", weight: 65 },
    { pattern: "lambda|fargate|ecs", scope: "type", tier: "medium", weight: 40 },
    { pattern: "bastion|jump|ssh", scope: "name", tier: "medium", weight: 35 },
    // Tag-based rules — Environment tag is strongest classification signal
    { pattern: "prod|production|prd", scope: "tag:Environment", tier: "critical", weight: 120 },
    { pattern: "staging|stage|uat|qa", scope: "tag:Environment", tier: "medium", weight: 110 },
    { pattern: "dev|develop|sandbox|test", scope: "tag:Environment", tier: "low", weight: 110 }
  ];
  var _classificationRules = structuredClone(_DEFAULT_CLASS_RULES);
  var _discoveredTags = {};
  var _TIER_RPO_RTO = {
    critical: { rpo: "Hourly", rto: "2-4 hours", priority: 1, color: "#ef4444" },
    high: { rpo: "6 hours", rto: "4-8 hours", priority: 2, color: "#f59e0b" },
    medium: { rpo: "Daily", rto: "12 hours", priority: 3, color: "#22d3ee" },
    low: { rpo: "Weekly", rto: "24 hours", priority: 4, color: "#64748b" }
  };
  function getGovDashState() {
    return _govDashState;
  }
  function setGovDashState(v) {
    _govDashState = v;
  }
  function getIamDashState() {
    return _iamDashState;
  }
  function setIamDashState(v) {
    _iamDashState = v;
  }
  function getClassificationData() {
    return _classificationData;
  }
  function setClassificationData(v) {
    _classificationData = v;
  }
  function getClassificationOverrides() {
    return _classificationOverrides;
  }
  function setClassificationOverrides(v) {
    _classificationOverrides = v;
  }
  function getIamReviewData() {
    return _iamReviewData;
  }
  function setIamReviewData(v) {
    _iamReviewData = v;
  }
  function getInventoryData() {
    return _inventoryData;
  }
  function setInventoryData(v) {
    _inventoryData = v;
  }
  function getInvState() {
    return _invState;
  }
  function setInvState(v) {
    _invState = v;
  }
  function getAppRegistry() {
    return _appRegistry;
  }
  function setAppRegistry(v) {
    _appRegistry = v;
  }
  function getAppAutoDiscovered() {
    return _appAutoDiscovered;
  }
  function setAppAutoDiscovered(v) {
    _appAutoDiscovered = v;
  }
  function getAppSummaryState() {
    return _appSummaryState;
  }
  function setAppSummaryState(v) {
    _appSummaryState = v;
  }
  function getInvToolbarRendered() {
    return _invToolbarRendered;
  }
  function setInvToolbarRendered(v) {
    _invToolbarRendered = v;
  }
  function getInvFilterCache() {
    return _invFilterCache;
  }
  function setInvFilterCache(v) {
    _invFilterCache = v;
  }
  function getInvFilterKey() {
    return _invFilterKey;
  }
  function setInvFilterKey(v) {
    _invFilterKey = v;
  }
  function getClassificationRules() {
    return _classificationRules;
  }
  function setClassificationRules(v) {
    _classificationRules = v;
  }
  function getDiscoveredTags() {
    return _discoveredTags;
  }
  function setDiscoveredTags(v) {
    _discoveredTags = v;
  }
  function _buildInventoryData() {
    _inventoryData = [];
    var ctx = rlCtx;
    if (!ctx) return;
    var rows = [];
    var vpcNameMap = {};
    (ctx.vpcs || []).forEach(function(v) {
      vpcNameMap[v.VpcId] = gn(v, v.VpcId);
    });
    function tag(obj) {
      var t = (obj.Tags || obj.tags || []).find(function(x) {
        return x.Key === "Name";
      });
      return t ? t.Value : "";
    }
    function tags(obj) {
      var m = {};
      (obj.Tags || obj.tags || []).forEach(function(t) {
        m[t.Key] = t.Value;
      });
      return m;
    }
    function mkRow(id, type, name, obj, extra) {
      return {
        id,
        type,
        name,
        account: obj._accountLabel || obj._accountId || "",
        region: obj._region || "",
        vpcId: extra.vpcId || "",
        vpcName: extra.vpcId ? vpcNameMap[extra.vpcId] || "" : "",
        subnetId: extra.subnetId || "",
        az: extra.az || "",
        state: extra.state || "",
        config: extra.config || "",
        tags: tags(obj),
        encrypted: extra.encrypted != null ? extra.encrypted : null,
        sgCount: extra.sgCount || 0,
        classificationTier: null,
        budrTier: null,
        budrStrategy: null,
        rto: null,
        rpo: null,
        compliancePass: 0,
        complianceFail: 0,
        _raw: obj,
        _related: extra.related || []
      };
    }
    var subVpcMap = {};
    (ctx.subnets || []).forEach(function(s) {
      if (s.SubnetId) subVpcMap[s.SubnetId] = s.VpcId || "";
    });
    var instVpcMap = {};
    (ctx.instances || []).forEach(function(i) {
      if (i.InstanceId) instVpcMap[i.InstanceId] = i.VpcId || subVpcMap[i.SubnetId] || "";
    });
    (ctx.vpcs || []).forEach(function(v) {
      rows.push(mkRow(v.VpcId, "VPC", tag(v) || v.VpcId, v, { vpcId: v.VpcId, config: v.CidrBlock || "", state: v.State || "" }));
    });
    (ctx.subnets || []).forEach(function(s) {
      var isPub = ctx.pubSubs && ctx.pubSubs.has(s.SubnetId);
      rows.push(mkRow(s.SubnetId, "Subnet", tag(s) || s.SubnetId, s, { vpcId: s.VpcId, az: s.AvailabilityZone || "", config: (s.CidrBlock || "") + " " + (isPub ? "public" : "private"), state: s.State || "" }));
    });
    (ctx.instances || []).forEach(function(i) {
      var sgs = (i.SecurityGroups || []).map(function(g) {
        return g.GroupId;
      });
      rows.push(mkRow(i.InstanceId, "EC2", tag(i) || i.InstanceId, i, { vpcId: i.VpcId || subVpcMap[i.SubnetId] || "", subnetId: i.SubnetId || "", az: i.Placement ? i.Placement.AvailabilityZone : "", config: i.InstanceType || "", state: i.State ? i.State.Name || "" : "", sgCount: sgs.length, related: sgs }));
    });
    (ctx.rdsInstances || []).forEach(function(db) {
      var vpcId = db.DBSubnetGroup && db.DBSubnetGroup.VpcId || "";
      rows.push(mkRow(db.DBInstanceIdentifier, "RDS", db.DBInstanceIdentifier, db, { vpcId, az: db.AvailabilityZone || "", config: (db.Engine || "") + " " + (db.DBInstanceClass || ""), state: db.DBInstanceStatus || "", encrypted: !!db.StorageEncrypted }));
    });
    (ctx.lambdaFns || []).forEach(function(fn) {
      var vc = fn.VpcConfig || {};
      var vpcId = vc.VpcId || "";
      var subId = vc.SubnetIds && vc.SubnetIds[0] || "";
      rows.push(mkRow(fn.FunctionName, "Lambda", fn.FunctionName, fn, { vpcId, subnetId: subId, config: (fn.Runtime || "") + (fn.MemorySize ? " " + fn.MemorySize + "MB" : ""), state: fn.State || "Active" }));
    });
    (ctx.ecsServices || []).forEach(function(svc) {
      var nc = svc.networkConfiguration && svc.networkConfiguration.awsvpcConfiguration;
      var subId = nc && nc.subnets && nc.subnets[0] ? nc.subnets[0] : "";
      var vpcId = "";
      if (subId) {
        var subObj = (ctx.subnets || []).find(function(s) {
          return s.SubnetId === subId;
        });
        if (subObj) vpcId = subObj.VpcId || "";
      }
      var cpu = svc.cpu || "";
      var mem = svc.memory || "";
      rows.push(mkRow(svc.serviceName, "ECS", svc.serviceName, svc, { vpcId, subnetId: subId, config: (svc.launchType || "") + " " + (cpu ? cpu + "/" : "") + (mem || ""), state: svc.status || "" }));
    });
    (ctx.albs || []).forEach(function(a) {
      rows.push(mkRow(a.LoadBalancerName, "ALB", a.LoadBalancerName, a, { vpcId: a.VpcId || "", config: (a.Type || "application") + " " + (a.Scheme || ""), state: a.State ? a.State.Code || "" : "" }));
    });
    (ctx.ecacheClusters || []).forEach(function(ec) {
      var vpcId = ec.VpcId || (ec.CacheSubnetGroupName ? "" : "");
      if (!vpcId && ec.CacheNodes && ec.CacheNodes[0]) {
        var cn = ec.CacheNodes[0];
        if (cn.SubnetId) vpcId = subVpcMap[cn.SubnetId] || "";
      }
      rows.push(mkRow(ec.CacheClusterId, "ElastiCache", ec.CacheClusterId, ec, { vpcId, config: (ec.Engine || "") + " " + (ec.CacheNodeType || ""), state: ec.CacheClusterStatus || "" }));
    });
    (ctx.redshiftClusters || []).forEach(function(rs) {
      rows.push(mkRow(rs.ClusterIdentifier, "Redshift", rs.ClusterIdentifier, rs, { vpcId: rs.VpcId || "", config: (rs.NodeType || "") + " x" + (rs.NumberOfNodes || 1), state: rs.ClusterStatus || "", encrypted: !!rs.Encrypted }));
    });
    (ctx.sgs || []).forEach(function(sg) {
      var inCt = (sg.IpPermissions || []).length;
      var outCt = (sg.IpPermissionsEgress || []).length;
      rows.push(mkRow(sg.GroupId, "SG", sg.GroupName || sg.GroupId, sg, { vpcId: sg.VpcId || "", config: inCt + " inbound / " + outCt + " outbound" }));
    });
    (ctx.nacls || []).forEach(function(n) {
      var ct = (n.Entries || []).length;
      rows.push(mkRow(n.NetworkAclId, "NACL", tag(n) || n.NetworkAclId, n, { vpcId: n.VpcId || "", config: ct + " entries" }));
    });
    (ctx.rts || []).forEach(function(rt) {
      var ct = (rt.Routes || []).length;
      rows.push(mkRow(rt.RouteTableId, "Route Table", tag(rt) || rt.RouteTableId, rt, { vpcId: rt.VpcId || "", config: ct + " routes" }));
    });
    (ctx.igws || []).forEach(function(g) {
      var att = g.Attachments || [];
      var attachedVpc = att.length ? att[0].VpcId : "";
      rows.push(mkRow(g.InternetGatewayId, "IGW", tag(g) || g.InternetGatewayId, g, { vpcId: attachedVpc, config: attachedVpc ? "attached: " + attachedVpc : "detached" }));
    });
    (ctx.nats || []).forEach(function(n) {
      rows.push(mkRow(n.NatGatewayId, "NAT GW", tag(n) || n.NatGatewayId, n, { vpcId: n.VpcId || "", subnetId: n.SubnetId || "", config: (n.SubnetId || "") + " " + (n.State || ""), state: n.State || "" }));
    });
    (ctx.vpces || []).forEach(function(e) {
      rows.push(mkRow(e.VpcEndpointId, "VPC Endpoint", tag(e) || e.VpcEndpointId, e, { vpcId: e.VpcId || "", config: e.ServiceName || "", state: e.State || "" }));
    });
    (ctx.enis || []).forEach(function(e) {
      rows.push(mkRow(e.NetworkInterfaceId, "ENI", e.Description || e.NetworkInterfaceId, e, { vpcId: e.VpcId || "", subnetId: e.SubnetId || "", az: e.AvailabilityZone || "", config: e.PrivateIpAddress || "", state: e.Status || "" }));
    });
    (ctx.volumes || []).forEach(function(vol) {
      var attInsts = (vol.Attachments || []).map(function(a) {
        return a.InstanceId;
      }).filter(Boolean);
      var vpcId = "";
      if (attInsts.length) vpcId = instVpcMap[attInsts[0]] || "";
      rows.push(mkRow(vol.VolumeId, "EBS Volume", tag(vol) || vol.VolumeId, vol, { vpcId, az: vol.AvailabilityZone || "", config: vol.Size + "GB " + (vol.VolumeType || ""), state: vol.State || "", encrypted: !!vol.Encrypted, related: attInsts }));
    });
    (ctx.snapshots || []).forEach(function(snap) {
      rows.push(mkRow(snap.SnapshotId, "Snapshot", snap.Description || snap.SnapshotId, snap, { config: (snap.VolumeSize || "") + "GB", state: snap.State || "", encrypted: !!snap.Encrypted }));
    });
    (ctx.s3bk || []).forEach(function(b) {
      rows.push(mkRow(b.Name, "S3 Bucket", b.Name, b, { config: b.CreationDate || "" }));
    });
    (ctx.zones || []).forEach(function(z) {
      var recs = ctx.recsByZone && ctx.recsByZone[z.Id] ? ctx.recsByZone[z.Id].length : z.ResourceRecordSetCount || 0;
      var vis = z.Config && z.Config.PrivateZone ? "private" : "public";
      rows.push(mkRow(z.Id, "Route 53", z.Name || z.Id, z, { config: recs + " records " + vis }));
    });
    (ctx.wafAcls || []).forEach(function(w) {
      var ruleCount = (w.Rules || []).length;
      rows.push(mkRow(w.Id || w.Name, "WAF", w.Name || w.Id || "", w, { config: ruleCount + " rules" }));
    });
    (ctx.cfDistributions || []).forEach(function(cf) {
      rows.push(mkRow(cf.Id, "CloudFront", cf.DomainName || cf.Id, cf, { config: cf.Status || "", state: cf.Status || "" }));
    });
    (ctx.peerings || []).forEach(function(p) {
      var req = p.RequesterVpcInfo ? p.RequesterVpcInfo.VpcId : "";
      var acc = p.AccepterVpcInfo ? p.AccepterVpcInfo.VpcId : "";
      rows.push(mkRow(p.VpcPeeringConnectionId, "VPC Peering", tag(p) || p.VpcPeeringConnectionId, p, { config: req + "\u2194" + acc, state: p.Status ? p.Status.Code || "" : "" }));
    });
    (ctx.vpns || []).forEach(function(v) {
      rows.push(mkRow(v.VpnConnectionId, "VPN", tag(v) || v.VpnConnectionId, v, { config: (v.State || "") + " " + (v.Type || ""), state: v.State || "" }));
    });
    (ctx.tgwAttachments || []).forEach(function(t) {
      var tid = t.TransitGatewayAttachmentId || t.TransitGatewayId + "-" + (t.VpcId || "");
      rows.push(mkRow(tid, "TGW Attachment", tag(t) || tid, t, { vpcId: t.VpcId || "", config: (t.ResourceType || "") + " " + (t.TransitGatewayId || ""), state: t.State || "" }));
    });
    (ctx.tgs || []).forEach(function(tg) {
      rows.push(mkRow(tg.TargetGroupName, "Target Group", tg.TargetGroupName, tg, { vpcId: tg.VpcId || "", config: (tg.Protocol || "") + ":" + (tg.Port || ""), state: tg.TargetType || "" }));
    });
    var classMap = {};
    (_classificationData || []).forEach(function(c) {
      classMap[c.id] = c;
    });
    var budrAssessments2 = typeof window !== "undefined" && window._budrAssessments || [];
    var budrMap = {};
    (budrAssessments2 || []).forEach(function(a) {
      budrMap[a.id] = { tier: a.profile ? a.profile.tier : null, strategy: a.profile ? a.profile.strategy : null, rto: a.profile ? a.profile.rto : null, rpo: a.profile ? a.profile.rpo : null };
    });
    var compMap = {};
    (complianceFindings || []).forEach(function(f) {
      if (!f.resource) return;
      if (!compMap[f.resource]) compMap[f.resource] = { pass: 0, fail: 0 };
      if (f.status === "PASS") compMap[f.resource].pass++;
      else compMap[f.resource].fail++;
    });
    rows.forEach(function(r) {
      var cls = classMap[r.id];
      if (cls) r.classificationTier = cls.tier;
      var budr = budrMap[r.id];
      if (budr) {
        r.budrTier = budr.tier;
        r.budrStrategy = budr.strategy;
        r.rto = budr.rto;
        r.rpo = budr.rpo;
      }
      var comp = compMap[r.id];
      if (comp) {
        r.compliancePass = comp.pass;
        r.complianceFail = comp.fail;
      }
    });
    _inventoryData = rows;
  }
  function _filterInventory() {
    var st = _invState;
    var filterFn = typeof window !== "undefined" && window._udashFilterByAccount || function(x) {
      return x;
    };
    var items = filterFn(_inventoryData).slice();
    if (st.typeFilter !== "all") items = items.filter(function(r) {
      return r.type === st.typeFilter;
    });
    if (st.regionFilter !== "all") items = items.filter(function(r) {
      return r.region === st.regionFilter;
    });
    if (st.accountFilter !== "all") items = items.filter(function(r) {
      return r.account === st.accountFilter;
    });
    if (st.vpcFilter !== "all") items = items.filter(function(r) {
      return r.vpcId === st.vpcFilter;
    });
    if (st.search) {
      var q = st.search.toLowerCase();
      items = items.filter(function(r) {
        return (r.name || "").toLowerCase().indexOf(q) !== -1 || (r.id || "").toLowerCase().indexOf(q) !== -1 || (r.type || "").toLowerCase().indexOf(q) !== -1 || (r.config || "").toLowerCase().indexOf(q) !== -1 || (r.vpcName || "").toLowerCase().indexOf(q) !== -1 || (r.region || "").toLowerCase().indexOf(q) !== -1 || JSON.stringify(r.tags || {}).toLowerCase().indexOf(q) !== -1;
      });
    }
    var sortKey = st.sort;
    var dir = st.sortDir === "asc" ? 1 : -1;
    items.sort(function(a, b) {
      if (sortKey === "complianceFail") {
        return ((a.complianceFail || 0) - (b.complianceFail || 0)) * dir;
      }
      if (sortKey === "tags") {
        return (Object.keys(a.tags || {}).length - Object.keys(b.tags || {}).length) * dir;
      }
      var av = (a[sortKey] || "").toString().toLowerCase();
      var bv = (b[sortKey] || "").toString().toLowerCase();
      return av < bv ? -dir : av > bv ? dir : 0;
    });
    return items;
  }
  function _getTagMap(obj) {
    var arr = obj.Tags || obj.tags || obj.TagList || [];
    var m = {};
    arr.forEach(function(t) {
      if (t.Key) m[t.Key] = t.Value || "";
    });
    return m;
  }
  function _safeRegex(pattern) {
    try {
      var re = new RegExp(pattern, "i");
      if (/(\+|\*|\{)\s*\)(\+|\*|\{)/.test(pattern)) return null;
      return re;
    } catch (e) {
      return null;
    }
  }
  function _scoreClassification(name, type, vpcName, rules, tagMap) {
    rules = rules || _classificationRules;
    tagMap = tagMap || {};
    var bestTier = "low";
    var bestWeight = -1;
    rules.forEach(function(rule) {
      if (rule.enabled === false) return;
      var p = rule.pattern;
      if (!p) return;
      p = p.replace(/^\|+|\|+$/g, "").replace(/\|{2,}/g, "|");
      if (!p) return;
      var re = _safeRegex(p);
      if (!re) return;
      var text = "";
      if (rule.scope === "any") text = (name || "") + " " + (type || "") + " " + (vpcName || "") + " " + Object.values(tagMap).join(" ");
      else if (rule.scope === "vpc") text = vpcName || "";
      else if (rule.scope === "type") text = type || "";
      else if (rule.scope === "name") text = name || "";
      else if (rule.scope.indexOf("tag:") === 0) text = tagMap[rule.scope.substring(4)] || "";
      else text = (name || "") + " " + (type || "") + " " + (vpcName || "");
      if (re.test(text) && rule.weight > bestWeight) {
        bestWeight = rule.weight;
        bestTier = rule.tier;
      }
    });
    return { tier: bestTier, weight: bestWeight };
  }
  function _discoverTagKeys(ctx) {
    if (!ctx) return {};
    var disc = {};
    function scan(arr, typeName) {
      (arr || []).forEach(function(obj) {
        var tagArr = obj.Tags || obj.tags || obj.TagList || [];
        tagArr.forEach(function(t) {
          if (!t.Key || t.Key.indexOf("aws:") === 0) return;
          if (!disc[t.Key]) disc[t.Key] = { count: 0, samples: [], types: {} };
          var d = disc[t.Key];
          d.count++;
          d.types[typeName] = true;
          if (d.samples.length < 5 && t.Value && d.samples.indexOf(t.Value) < 0) d.samples.push(t.Value);
        });
      });
    }
    scan(ctx.instances, "EC2");
    scan(ctx.rdsInstances, "RDS");
    scan(ctx.ecacheClusters, "ElastiCache");
    scan(ctx.albs, "ALB");
    scan(ctx.lambdaFns, "Lambda");
    scan(ctx.ecsServices, "ECS");
    scan(ctx.redshiftClusters, "Redshift");
    scan(ctx.vpcs, "VPC");
    scan(ctx.subnets, "Subnet");
    scan(ctx.sgs, "SG");
    scan(ctx.s3bk, "S3");
    Object.keys(disc).forEach(function(k) {
      disc[k].types = Object.keys(disc[k].types);
    });
    return disc;
  }
  function runClassificationEngine(ctx) {
    if (!ctx) return [];
    var results = [];
    var vpcNameMap = {};
    (ctx.vpcs || []).forEach(function(v) {
      vpcNameMap[v.VpcId] = gn(v, v.VpcId);
    });
    var subnetVpcMap = {};
    (ctx.subnets || []).forEach(function(s) {
      if (s.VpcId) subnetVpcMap[s.SubnetId] = s.VpcId;
    });
    function resolveVpc(vpcId, subnetId) {
      return vpcId || subnetVpcMap[subnetId] || "";
    }
    (ctx.instances || []).forEach(function(inst) {
      var name = inst.Tags ? (inst.Tags.find(function(t) {
        return t.Key === "Name";
      }) || {}).Value || inst.InstanceId : inst.InstanceId;
      var vpcId = resolveVpc(inst.VpcId, inst.SubnetId);
      var vpcName = vpcNameMap[vpcId] || "";
      var tm = _getTagMap(inst);
      var sc = _scoreClassification(name, "instance", vpcName, null, tm);
      var tier = _classificationOverrides[inst.InstanceId] || sc.tier;
      var meta = _TIER_RPO_RTO[tier];
      results.push({ id: inst.InstanceId, name, type: "EC2", tier, rpo: meta.rpo, rto: meta.rto, auto: !_classificationOverrides[inst.InstanceId], vpcId, vpcName, tags: tm });
    });
    (ctx.rdsInstances || []).forEach(function(db) {
      var name = db.DBInstanceIdentifier;
      var vpcId = db.DBSubnetGroup ? db.DBSubnetGroup.VpcId : "";
      var vpcName = vpcNameMap[vpcId] || "";
      var tm = _getTagMap(db);
      var sc = _scoreClassification(name, "rds", vpcName, null, tm);
      var tier = _classificationOverrides[name] || sc.tier;
      var meta = _TIER_RPO_RTO[tier];
      results.push({ id: name, name, type: "RDS", tier, rpo: meta.rpo, rto: meta.rto, auto: !_classificationOverrides[name], vpcId, vpcName, tags: tm });
    });
    (ctx.ecacheClusters || []).forEach(function(ec) {
      var name = ec.CacheClusterId;
      var vpcId = ec.VpcId || "";
      var vpcName = vpcNameMap[vpcId] || "";
      var tm = _getTagMap(ec);
      var sc = _scoreClassification(name, "elasticache", vpcName, null, tm);
      var tier = _classificationOverrides[name] || sc.tier;
      var meta = _TIER_RPO_RTO[tier];
      results.push({ id: name, name, type: "ElastiCache", tier, rpo: meta.rpo, rto: meta.rto, auto: !_classificationOverrides[name], vpcId, vpcName, tags: tm });
    });
    (ctx.albs || []).forEach(function(alb) {
      var albId = alb.LoadBalancerArn ? alb.LoadBalancerArn.split("/").pop() : "";
      var name = alb.LoadBalancerName || albId;
      var vpcId = alb.VpcId || "";
      var vpcName = vpcNameMap[vpcId] || "";
      var tm = _getTagMap(alb);
      var sc = _scoreClassification(name, "alb", vpcName, null, tm);
      var tier = _classificationOverrides[name] || sc.tier;
      var meta = _TIER_RPO_RTO[tier];
      results.push({ id: name, name, type: "ALB", tier, rpo: meta.rpo, rto: meta.rto, auto: !_classificationOverrides[name], vpcId, vpcName, tags: tm });
    });
    (ctx.lambdaFns || []).forEach(function(fn) {
      var name = fn.FunctionName;
      var vpcId = fn.VpcConfig ? fn.VpcConfig.VpcId : "";
      if (!vpcId && fn.VpcConfig && fn.VpcConfig.SubnetIds && fn.VpcConfig.SubnetIds[0]) vpcId = subnetVpcMap[fn.VpcConfig.SubnetIds[0]] || "";
      var vpcName = vpcNameMap[vpcId] || "";
      var tm = _getTagMap(fn);
      var sc = _scoreClassification(name, "lambda", vpcName, null, tm);
      var tier = _classificationOverrides[name] || sc.tier;
      var meta = _TIER_RPO_RTO[tier];
      results.push({ id: name, name, type: "Lambda", tier, rpo: meta.rpo, rto: meta.rto, auto: !_classificationOverrides[name], vpcId, vpcName, tags: tm });
    });
    (ctx.ecsServices || []).forEach(function(svc) {
      var name = svc.serviceName || "";
      var nc = svc.networkConfiguration && svc.networkConfiguration.awsvpcConfiguration;
      var vpcId = nc && nc.subnets && nc.subnets[0] ? subnetVpcMap[nc.subnets[0]] || "" : "";
      var vpcName = vpcNameMap[vpcId] || "";
      var tm = _getTagMap(svc);
      var sc = _scoreClassification(name, "ecs", vpcName, null, tm);
      var tier = _classificationOverrides[name] || sc.tier;
      var meta = _TIER_RPO_RTO[tier];
      results.push({ id: name, name, type: "ECS", tier, rpo: meta.rpo, rto: meta.rto, auto: !_classificationOverrides[name], vpcId, vpcName, tags: tm });
    });
    (ctx.redshiftClusters || []).forEach(function(rs) {
      var name = rs.ClusterIdentifier;
      var vpcId = rs.VpcId || "";
      var vpcName = vpcNameMap[vpcId] || "";
      var tm = _getTagMap(rs);
      var sc = _scoreClassification(name, "redshift", vpcName, null, tm);
      var tier = _classificationOverrides[name] || sc.tier;
      var meta = _TIER_RPO_RTO[tier];
      results.push({ id: name, name, type: "Redshift", tier, rpo: meta.rpo, rto: meta.rto, auto: !_classificationOverrides[name], vpcId, vpcName, tags: tm });
    });
    (ctx.sgs || []).forEach(function(sg) {
      var id = sg.GroupId;
      var name = gn(sg, id);
      var vpcId = sg.VpcId || "";
      var vpcName = vpcNameMap[vpcId] || "";
      var tm = _getTagMap(sg);
      var sc = _scoreClassification(name, "security-group", vpcName, null, tm);
      var tier = _classificationOverrides[id] || sc.tier;
      var meta = _TIER_RPO_RTO[tier];
      results.push({ id, name, type: "Security Group", tier, rpo: meta.rpo, rto: meta.rto, auto: !_classificationOverrides[id], vpcId, vpcName, tags: tm });
    });
    (ctx.vpcs || []).forEach(function(v) {
      var id = v.VpcId;
      var name = gn(v, id);
      var tm = _getTagMap(v);
      var sc = _scoreClassification(name, "vpc", name, null, tm);
      var tier = _classificationOverrides[id] || sc.tier;
      var meta = _TIER_RPO_RTO[tier];
      results.push({ id, name, type: "VPC", tier, rpo: meta.rpo, rto: meta.rto, auto: !_classificationOverrides[id], vpcId: id, vpcName: name, tags: tm });
    });
    (ctx.subnets || []).forEach(function(s) {
      var id = s.SubnetId;
      var name = gn(s, id);
      var vpcId = s.VpcId || "";
      var vpcName = vpcNameMap[vpcId] || "";
      var tm = _getTagMap(s);
      var sc = _scoreClassification(name, "subnet", vpcName, null, tm);
      var tier = _classificationOverrides[id] || sc.tier;
      var meta = _TIER_RPO_RTO[tier];
      results.push({ id, name, type: "Subnet", tier, rpo: meta.rpo, rto: meta.rto, auto: !_classificationOverrides[id], vpcId, vpcName, tags: tm });
    });
    (ctx.igws || []).forEach(function(gw) {
      var id = gw.InternetGatewayId;
      var name = gn(gw, id);
      var vpcId = gw.Attachments && gw.Attachments[0] ? gw.Attachments[0].VpcId : "";
      var vpcName = vpcNameMap[vpcId] || "";
      var tm = _getTagMap(gw);
      var sc = _scoreClassification(name, "igw", vpcName, null, tm);
      var tier = _classificationOverrides[id] || sc.tier;
      var meta = _TIER_RPO_RTO[tier];
      results.push({ id, name, type: "IGW", tier, rpo: meta.rpo, rto: meta.rto, auto: !_classificationOverrides[id], vpcId, vpcName, tags: tm });
    });
    (ctx.nats || []).forEach(function(ng) {
      var id = ng.NatGatewayId;
      var name = gn(ng, id);
      var vpcId = ng.VpcId || "";
      var vpcName = vpcNameMap[vpcId] || "";
      var tm = _getTagMap(ng);
      var sc = _scoreClassification(name, "nat-gateway", vpcName, null, tm);
      var tier = _classificationOverrides[id] || sc.tier;
      var meta = _TIER_RPO_RTO[tier];
      results.push({ id, name, type: "NAT GW", tier, rpo: meta.rpo, rto: meta.rto, auto: !_classificationOverrides[id], vpcId, vpcName, tags: tm });
    });
    (ctx.vpces || []).forEach(function(ve) {
      var id = ve.VpcEndpointId;
      var name = ve.ServiceName || id;
      var vpcId = ve.VpcId || "";
      var vpcName = vpcNameMap[vpcId] || "";
      var tm = _getTagMap(ve);
      var sc = _scoreClassification(name, "vpc-endpoint", vpcName, null, tm);
      var tier = _classificationOverrides[id] || sc.tier;
      var meta = _TIER_RPO_RTO[tier];
      results.push({ id, name, type: "VPC Endpoint", tier, rpo: meta.rpo, rto: meta.rto, auto: !_classificationOverrides[id], vpcId, vpcName, tags: tm });
    });
    (ctx.s3bk || []).forEach(function(b) {
      var name = b.Name || "";
      var tm = _getTagMap(b);
      var sc = _scoreClassification(name, "s3", "", null, tm);
      var tier = _classificationOverrides[name] || sc.tier;
      var meta = _TIER_RPO_RTO[tier];
      results.push({ id: name, name, type: "S3", tier, rpo: meta.rpo, rto: meta.rto, auto: !_classificationOverrides[name], vpcId: "", vpcName: "", tags: tm });
    });
    var _clResAcct = {};
    (ctx.instances || []).forEach(function(r) {
      _clResAcct[r.InstanceId] = r._accountId;
    });
    (ctx.rdsInstances || []).forEach(function(r) {
      _clResAcct[r.DBInstanceIdentifier] = r._accountId;
    });
    (ctx.ecacheClusters || []).forEach(function(r) {
      _clResAcct[r.CacheClusterId] = r._accountId;
    });
    (ctx.albs || []).forEach(function(r) {
      _clResAcct[r.LoadBalancerName || r.LoadBalancerArn] = r._accountId;
    });
    (ctx.lambdaFns || []).forEach(function(r) {
      _clResAcct[r.FunctionName] = r._accountId;
    });
    (ctx.ecsServices || []).forEach(function(r) {
      _clResAcct[r.serviceName || r.serviceArn] = r._accountId;
    });
    (ctx.sgs || []).forEach(function(r) {
      _clResAcct[r.GroupId] = r._accountId;
    });
    (ctx.vpcs || []).forEach(function(r) {
      _clResAcct[r.VpcId] = r._accountId;
    });
    (ctx.subnets || []).forEach(function(r) {
      _clResAcct[r.SubnetId] = r._accountId;
    });
    (ctx.s3bk || []).forEach(function(r) {
      _clResAcct[r.Name] = r._accountId;
    });
    results.forEach(function(r) {
      if (_clResAcct[r.id]) r._accountId = _clResAcct[r.id];
    });
    _classificationData = results;
    _discoveredTags = _discoverTagKeys(ctx);
    return results;
  }
  function prepareIAMReviewData(iamData) {
    if (!iamData) return [];
    var items = [];
    (iamData.roles || []).forEach(function(role) {
      var created = role.CreateDate ? new Date(role.CreateDate) : null;
      var lastUsed = role.RoleLastUsed && role.RoleLastUsed.LastUsedDate ? new Date(role.RoleLastUsed.LastUsedDate) : null;
      var trustDoc = role.AssumeRolePolicyDocument;
      var trustParsed = {};
      if (typeof trustDoc === "string") {
        try {
          trustParsed = JSON.parse(trustDoc);
        } catch (e) {
        }
      } else if (trustDoc) trustParsed = trustDoc;
      var crossAccts = [];
      _stmtArr(trustParsed.Statement).forEach(function(stmt) {
        if (stmt.Effect === "Allow" && stmt.Principal) {
          var aws = stmt.Principal.AWS;
          if (aws) {
            (Array.isArray(aws) ? aws : [aws]).forEach(function(arn) {
              var m = String(arn).match(/:(\d{12}):/);
              if (m) crossAccts.push(m[1]);
            });
          }
        }
      });
      var findings = (complianceFindings || []).filter(function(f) {
        return f.framework === "IAM" && (f.resource === role.RoleName || f.resource === (role.Arn || ""));
      });
      var policyCount = (role.RolePolicyList || []).length + (role.AttachedManagedPolicies || []).length;
      var policyNames = (role.AttachedManagedPolicies || []).map(function(p) {
        return p.PolicyName || p.PolicyArn || "";
      });
      var roleAcct = (role.Arn || "").match(/:(\d{12}):/);
      items.push({ name: role.RoleName || "", arn: role.Arn || "", type: "Role", created, lastUsed, isAdmin: role._isAdmin || false, hasWildcard: role._hasWildcard || false, crossAccounts: crossAccts, policies: policyCount, policyNames, permBoundary: role.PermissionsBoundary ? role.PermissionsBoundary.PermissionsBoundaryArn : "", findings, _accountId: roleAcct ? roleAcct[1] : "", _raw: role });
    });
    (iamData.users || []).forEach(function(user) {
      var created = user.CreateDate ? new Date(user.CreateDate) : null;
      var lastUsed = user.PasswordLastUsed ? new Date(user.PasswordLastUsed) : null;
      var hasMFA = (user.MFADevices || []).length > 0;
      var hasConsole = !!user.LoginProfile;
      var activeKeys = (user.AccessKeys || []).filter(function(k) {
        return k.Status === "Active";
      }).length;
      var findings = (complianceFindings || []).filter(function(f) {
        return f.framework === "IAM" && (f.resource === user.UserName || f.resource === (user.Arn || ""));
      });
      var policyCount = (user.UserPolicyList || []).length + (user.AttachedManagedPolicies || []).length;
      var policyNames = (user.AttachedManagedPolicies || []).map(function(p) {
        return p.PolicyName || p.PolicyArn || "";
      });
      var uIsAdmin = false;
      (user.UserPolicyList || []).forEach(function(p) {
        if (uIsAdmin) return;
        var doc = _safePolicyParse(p.PolicyDocument);
        _stmtArr(doc.Statement).forEach(function(s) {
          if (s.Effect === "Allow") {
            var a = Array.isArray(s.Action) ? s.Action : [s.Action || ""];
            var r = Array.isArray(s.Resource) ? s.Resource : [s.Resource || ""];
            if (a.some(function(x) {
              return x === "*";
            }) && r.some(function(x) {
              return x === "*";
            })) uIsAdmin = true;
          }
        });
      });
      (user.AttachedManagedPolicies || []).forEach(function(mp) {
        if (uIsAdmin) return;
        var pol = (iamData.policies || []).find(function(p) {
          return p.Arn === mp.PolicyArn || p.PolicyName === mp.PolicyName;
        });
        if (pol) {
          var ver = (pol.PolicyVersionList || []).find(function(v) {
            return v.IsDefaultVersion;
          });
          if (ver) {
            _stmtArr(_safePolicyParse(ver.Document).Statement).forEach(function(s) {
              if (s.Effect === "Allow") {
                var a = Array.isArray(s.Action) ? s.Action : [s.Action || ""];
                var r = Array.isArray(s.Resource) ? s.Resource : [s.Resource || ""];
                if (a.some(function(x) {
                  return x === "*";
                }) && r.some(function(x) {
                  return x === "*";
                })) uIsAdmin = true;
              }
            });
          }
        }
      });
      var userAcct = (user.Arn || "").match(/:(\d{12}):/);
      items.push({ name: user.UserName || "", arn: user.Arn || "", type: "User", created, lastUsed, isAdmin: uIsAdmin, hasWildcard: false, crossAccounts: [], policies: policyCount, policyNames, permBoundary: user.PermissionsBoundary ? user.PermissionsBoundary.PermissionsBoundaryArn : "", findings, _accountId: userAcct ? userAcct[1] : "", hasMFA, hasConsole, activeKeys, _raw: user });
    });
    _iamReviewData = items;
    return items;
  }
  function matchAction(pattern, action) {
    if (!pattern || !action) return false;
    if (pattern === "*") return true;
    const re = new RegExp("^" + pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$", "i");
    return re.test(action);
  }
  function matchResource(pattern, arn) {
    if (!pattern || !arn) return false;
    if (pattern === "*") return true;
    const pParts = pattern.split(":");
    const aParts = arn.split(":");
    if (pParts.length !== aParts.length && pParts.length < 6) return false;
    const reStr = pParts.map((p, i) => {
      if (p === "*" && i === pParts.length - 1) return ".*";
      if (p === "*") return "[^:]*";
      return p.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
    }).join(":");
    return new RegExp("^" + reStr + "$", "i").test(arn);
  }
  function evaluateCondition(condBlock, context) {
    if (!condBlock || Object.keys(condBlock).length === 0) return true;
    for (const [op, keys] of Object.entries(condBlock)) {
      for (const [ck, cv] of Object.entries(keys)) {
        if (op === "Bool" && ck === "aws:MultiFactorAuthPresent") {
          if (context && context.mfa !== void 0) return String(context.mfa) === String(cv);
        }
        if (op === "StringEquals" || op === "StringLike") {
          if (context && context[ck]) {
            const vals = Array.isArray(cv) ? cv : [cv];
            if (!vals.some((v) => v === context[ck])) return false;
          }
        }
      }
    }
    return true;
  }
  function _collectStatements(principal, iamData) {
    const stmts = [];
    const policyLists = principal.RolePolicyList || principal.UserPolicyList || [];
    policyLists.forEach((p) => {
      let doc = p.PolicyDocument;
      if (typeof doc === "string") {
        try {
          doc = JSON.parse(decodeURIComponent(doc));
        } catch (e) {
          try {
            doc = JSON.parse(doc);
          } catch (e2) {
            doc = {};
          }
        }
      }
      if (!doc) doc = {};
      _stmtArr(doc.Statement).forEach((st) => stmts.push(st));
    });
    (principal.AttachedManagedPolicies || []).forEach((mp) => {
      const pol = (iamData.policies || []).find((p) => p.Arn === mp.PolicyArn || p.PolicyName === mp.PolicyName);
      if (pol) {
        const ver = (pol.PolicyVersionList || []).find((v) => v.IsDefaultVersion);
        if (ver) {
          let dd = ver.Document;
          if (typeof dd === "string") {
            try {
              dd = JSON.parse(decodeURIComponent(dd));
            } catch (e) {
              try {
                dd = JSON.parse(dd);
              } catch (e2) {
                dd = {};
              }
            }
          }
          if (dd) {
            _stmtArr(dd.Statement).forEach((st) => stmts.push(st));
          }
        }
      }
    });
    return stmts;
  }
  function canDo(principal, action, resource, iamData) {
    const stmts = _collectStatements(principal, iamData);
    for (const s of stmts) {
      if (s.Effect !== "Deny") continue;
      const acts = Array.isArray(s.Action) ? s.Action : [s.Action || ""];
      const res = Array.isArray(s.Resource) ? s.Resource : [s.Resource || ""];
      if (acts.some((a) => matchAction(a, action)) && res.some((r) => matchResource(r, resource))) {
        if (evaluateCondition(s.Condition)) return { effect: "DENY", reason: "Explicit deny in policy", statements: [s] };
      }
    }
    if (principal.PermissionsBoundary) {
      const bArn = principal.PermissionsBoundary.PermissionsBoundaryArn || principal.PermissionsBoundary;
      const bPol = (iamData.policies || []).find((p) => p.Arn === bArn);
      if (bPol) {
        const ver = (bPol.PolicyVersionList || []).find((v) => v.IsDefaultVersion);
        if (ver) {
          const dd = _safePolicyParse(ver.Document);
          const bStmts = _stmtArr(dd.Statement);
          const allowed = bStmts.some((s) => {
            if (s.Effect !== "Allow") return false;
            const ba = Array.isArray(s.Action) ? s.Action : [s.Action || ""];
            const br = Array.isArray(s.Resource) ? s.Resource : [s.Resource || ""];
            return ba.some((a) => matchAction(a, action)) && br.some((r) => matchResource(r, resource));
          });
          if (!allowed) return { effect: "IMPLICIT_DENY", reason: "Not allowed by permission boundary", statements: [] };
        }
      }
    }
    const matchedStmts = [];
    for (const s of stmts) {
      if (s.Effect !== "Allow") continue;
      const acts = Array.isArray(s.Action) ? s.Action : [s.Action || ""];
      const res = Array.isArray(s.Resource) ? s.Resource : [s.Resource || ""];
      if (acts.some((a) => matchAction(a, action)) && res.some((r) => matchResource(r, resource))) {
        if (evaluateCondition(s.Condition)) matchedStmts.push(s);
      }
    }
    if (matchedStmts.length) return { effect: "ALLOW", reason: "Allowed by policy", statements: matchedStmts };
    return { effect: "IMPLICIT_DENY", reason: "No matching allow statement", statements: [] };
  }
  function summarizePermissions(principal, iamData) {
    const stmts = _collectStatements(principal, iamData);
    const services = {};
    let isAdmin = false;
    let hasWildcard = false;
    const boundaryArn = principal.PermissionsBoundary?.PermissionsBoundaryArn || null;
    stmts.forEach((s) => {
      const acts = Array.isArray(s.Action) ? s.Action : [s.Action || ""];
      const res = Array.isArray(s.Resource) ? s.Resource : [s.Resource || ""];
      if (s.NotAction) {
        const na = Array.isArray(s.NotAction) ? s.NotAction : [s.NotAction];
        na.forEach((a) => {
          const svc = a.includes(":") ? a.split(":")[0] : "ALL";
          if (!services[svc]) services[svc] = { allowed: [], denied: [], resources: {} };
          services[svc].notActions = (services[svc].notActions || []).concat(a);
        });
        return;
      }
      acts.forEach((a) => {
        if (a === "*" || a === "*:*") {
          isAdmin = true;
          return;
        }
        const svc = a.includes(":") ? a.split(":")[0] : "ALL";
        if (!services[svc]) services[svc] = { allowed: [], denied: [], resources: {} };
        const actionName = a.includes(":") ? a.split(":")[1] : a;
        if (s.Effect === "Allow") {
          if (!services[svc].allowed.includes(actionName)) services[svc].allowed.push(actionName);
          res.forEach((r) => {
            services[svc].resources[actionName] = r;
          });
        } else if (s.Effect === "Deny") {
          if (!services[svc].denied.includes(actionName)) services[svc].denied.push(actionName);
        }
      });
      if (res.some((r) => r === "*")) hasWildcard = true;
    });
    if (boundaryArn) {
      const bPol = (iamData.policies || []).find((p) => p.Arn === boundaryArn);
      if (bPol) {
        const ver = (bPol.PolicyVersionList || []).find((v) => v.IsDefaultVersion);
        if (ver) {
          const dd = _safePolicyParse(ver.Document);
          const bStmts = _stmtArr(dd.Statement);
          const bAllowed = /* @__PURE__ */ new Set();
          bStmts.forEach((s) => {
            if (s.Effect !== "Allow") return;
            const ba = Array.isArray(s.Action) ? s.Action : [s.Action || ""];
            ba.forEach((a) => bAllowed.add(a));
          });
          if (!bAllowed.has("*")) {
            Object.keys(services).forEach((svc) => {
              services[svc].allowed = services[svc].allowed.filter((a) => {
                const full = svc + ":" + a;
                return Array.from(bAllowed).some((b) => matchAction(b, full));
              });
            });
          }
        }
      }
    }
    return { services, isAdmin, hasWildcard, permissionBoundary: boundaryArn };
  }
  if (typeof window !== "undefined") {
    Object.assign(window, {
      // State variables — direct references (for backward compat reading)
      _govDashState,
      _iamDashState,
      _classificationData,
      _classificationOverrides,
      _iamReviewData,
      _inventoryData,
      _invState,
      _appRegistry,
      _appAutoDiscovered,
      _appSummaryState,
      _APP_TYPE_SUGGESTIONS,
      _invToolbarRendered,
      _INV_TYPE_COLORS,
      _INV_NO_MAP_TYPES,
      _invFilterCache,
      _invFilterKey,
      _DEFAULT_CLASS_RULES,
      _classificationRules,
      _discoveredTags,
      _TIER_RPO_RTO,
      // State accessors
      getGovDashState,
      setGovDashState,
      getIamDashState,
      setIamDashState,
      getClassificationData,
      setClassificationData,
      getClassificationOverrides,
      setClassificationOverrides,
      getIamReviewData,
      setIamReviewData,
      getInventoryData,
      setInventoryData,
      getInvState,
      setInvState,
      getAppRegistry,
      setAppRegistry,
      getAppAutoDiscovered,
      setAppAutoDiscovered,
      getAppSummaryState,
      setAppSummaryState,
      getInvToolbarRendered,
      setInvToolbarRendered,
      getInvFilterCache,
      setInvFilterCache,
      getInvFilterKey,
      setInvFilterKey,
      getClassificationRules,
      setClassificationRules,
      getDiscoveredTags,
      setDiscoveredTags,
      // Pure logic functions
      _buildInventoryData,
      _filterInventory,
      _getTagMap,
      _safeRegex,
      _scoreClassification,
      _discoverTagKeys,
      runClassificationEngine,
      prepareIAMReviewData,
      matchAction,
      matchResource,
      evaluateCondition,
      _collectStatements,
      canDo,
      summarizePermissions
    });
  }

  // src/modules/export-utils.js
  var export_utils_exports = {};
  __export(export_utils_exports, {
    COL_GAP: () => COL_GAP,
    GW_INSIDE_GAP: () => GW_INSIDE_GAP,
    GW_INSIDE_H: () => GW_INSIDE_H,
    GW_INSIDE_W: () => GW_INSIDE_W,
    GW_ROW_H: () => GW_ROW_H,
    LINE_H: () => LINE_H,
    PX: () => PX,
    SUB_GAP: () => SUB_GAP,
    SUB_H_MIN: () => SUB_H_MIN,
    SUB_W: () => SUB_W,
    TOP_MARGIN: () => TOP_MARGIN,
    VPC_HDR: () => VPC_HDR,
    VPC_PAD: () => VPC_PAD,
    addPolyEdge: () => addPolyEdge,
    addRect: () => addRect,
    buildPolyConnector: () => buildPolyConnector,
    buildShape: () => buildShape,
    buildSubText: () => buildSubText,
    buildVsdxXml: () => buildVsdxXml,
    computePageDimensions: () => computePageDimensions,
    computeSubnetHeights: () => computeSubnetHeights,
    downloadBlob: () => downloadBlob,
    getIdMap: () => getIdMap,
    getPolyEdges: () => getPolyEdges,
    getShapes: () => getShapes,
    gwStyles: () => gwStyles,
    resetShapeState: () => resetShapeState,
    resolveColor: () => resolveColor,
    sanitizeName: () => sanitizeName,
    setIdMapEntry: () => setIdMapEntry,
    toIn: () => toIn,
    uid: () => uid,
    xmlEsc: () => xmlEsc
  });
  var PX = 96;
  var SUB_W = 520;
  var SUB_H_MIN = 90;
  var SUB_GAP = 24;
  var VPC_PAD = 50;
  var VPC_HDR = 80;
  var GW_INSIDE_W = 160;
  var GW_INSIDE_H = 50;
  var GW_INSIDE_GAP = 16;
  var GW_ROW_H = 70;
  var COL_GAP = 280;
  var LINE_H = 15;
  var TOP_MARGIN = 80;
  function toIn(px) {
    return px / PX;
  }
  var gwStyles = {
    "IGW": { color: "#059669", pattern: 1, label: "Internet Gateway", fill: "#ECFDF5", border: "#059669" },
    "NAT": { color: "#D97706", pattern: 2, label: "NAT Gateway", fill: "#FFFBEB", border: "#D97706" },
    "TGW": { color: "#2563EB", pattern: 1, label: "Transit Gateway", fill: "#EFF6FF", border: "#2563EB" },
    "VGW": { color: "#7C3AED", pattern: 4, label: "Virtual Private GW", fill: "#F5F3FF", border: "#7C3AED" },
    "PCX": { color: "#EA580C", pattern: 2, label: "VPC Peering", fill: "#FFF7ED", border: "#EA580C" },
    "VPCE": { color: "#0891B2", pattern: 3, label: "VPC Endpoint", fill: "#ECFEFF", border: "#0891B2" },
    "GW": { color: "#6B7280", pattern: 1, label: "Gateway", fill: "#F9FAFB", border: "#6B7280" }
  };
  var shapeId = 1;
  var shapes = [];
  var polyEdges = [];
  var idMap = {};
  function resetShapeState() {
    shapeId = 1;
    shapes = [];
    polyEdges = [];
    idMap = {};
  }
  function getShapes() {
    return shapes;
  }
  function getPolyEdges() {
    return polyEdges;
  }
  function getIdMap() {
    return idMap;
  }
  function setIdMapEntry(key, value) {
    idMap[key] = value;
  }
  function xmlEsc(s) {
    return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function uid() {
    return "{" + crypto.randomUUID() + "}";
  }
  function sanitizeName(s) {
    if (!s) return "unnamed";
    return s.replace(/[^a-zA-Z0-9_-]/g, "_").replace(/^[0-9]/, "r$&").replace(/-/g, "_").toLowerCase();
  }
  function addRect(x, y, w, h, fill, stroke, strokeW, text, opts = {}) {
    const id = shapeId++;
    shapes.push({
      id,
      type: "rect",
      x,
      y,
      w,
      h,
      fill,
      stroke,
      strokeW,
      text,
      dashed: opts.dashed || false,
      fontSize: opts.fontSize || 11,
      fontColor: opts.fontColor || "#1F2937",
      bold: opts.bold || false,
      topAlign: opts.topAlign || false,
      props: opts.props || [],
      hAlign: opts.hAlign || "left",
      linePattern: opts.linePattern || 1
    });
    return id;
  }
  function addPolyEdge(waypoints, color, width, linePattern, label) {
    polyEdges.push({
      waypoints,
      color,
      width,
      linePattern: linePattern || 1,
      label: label || "",
      id: shapeId++
    });
  }
  function buildSubText(s, ctx) {
    const { pubSubs, instBySub, eniBySub, albBySub, subRT } = ctx;
    const isPub = pubSubs.has(s.SubnetId);
    const si = instBySub[s.SubnetId] || [];
    const se = eniBySub[s.SubnetId] || [];
    const sa = albBySub[s.SubnetId] || [];
    const lines = [];
    lines.push((isPub ? "[PUBLIC] " : "[PRIVATE] ") + gn(s, s.SubnetId));
    lines.push(s.CidrBlock + "  |  " + (s.AvailabilityZone || ""));
    const parts = [];
    if (si.length) parts.push(si.length + " EC2");
    if (se.length) parts.push(se.length + " ENI");
    if (sa.length) parts.push(sa.length + " ALB");
    if (parts.length) lines.push(parts.join(" | "));
    const rt = subRT[s.SubnetId];
    if (rt) {
      const nonLocal = (rt.Routes || []).filter((r) => {
        const t = r.GatewayId || r.NatGatewayId || r.TransitGatewayId || r.VpcPeeringConnectionId;
        return t && t !== "local";
      });
      if (nonLocal.length) {
        lines.push("Routes:");
        nonLocal.forEach((r) => {
          const dest = r.DestinationCidrBlock || r.DestinationPrefixListId || "?";
          const tgt = r.GatewayId || r.NatGatewayId || r.TransitGatewayId || r.VpcPeeringConnectionId;
          lines.push("  " + dest + " -> " + clsGw(tgt || "") + " " + sid(tgt));
        });
      }
    }
    return { text: lines.join("\n"), lineCount: lines.length };
  }
  function buildShape(s, pgH) {
    const wi = toIn(s.w);
    const hi = toIn(s.h);
    const cx = toIn(s.x) + wi / 2;
    const cy = pgH - (toIn(s.y) + hi / 2);
    const lp = s.linePattern || 1;
    const dashXml = s.dashed ? '<Cell N="LinePattern" V="2"/>' : lp !== 1 ? '<Cell N="LinePattern" V="' + lp + '"/>' : "";
    const sw = toIn(s.strokeW || 1);
    const fs = (s.fontSize || 11) / 72;
    const geom = '<Section N="Geometry" IX="0"><Cell N="NoFill" V="0"/><Cell N="NoLine" V="0"/><Row T="MoveTo" IX="1"><Cell N="X" V="0"/><Cell N="Y" V="0"/></Row><Row T="LineTo" IX="2"><Cell N="X" V="' + wi + '"/><Cell N="Y" V="0"/></Row><Row T="LineTo" IX="3"><Cell N="X" V="' + wi + '"/><Cell N="Y" V="' + hi + '"/></Row><Row T="LineTo" IX="4"><Cell N="X" V="0"/><Cell N="Y" V="' + hi + '"/></Row><Row T="LineTo" IX="5"><Cell N="X" V="0"/><Cell N="Y" V="0"/></Row></Section>';
    const vAlign = s.topAlign ? 0 : 1;
    const hAlign = s.hAlign === "center" ? 1 : 0;
    const propsXml = s.props && s.props.length ? '<Section N="Property">' + s.props.map(
      (p, i) => '<Row N="Row_' + i + '"><Cell N="Label" V="' + xmlEsc(p.label) + '"/><Cell N="Value" V="' + xmlEsc(p.val) + '"/><Cell N="Type" V="0"/></Row>'
    ).join("") + "</Section>" : "";
    return '<Shape ID="' + s.id + '" NameU="Shape' + s.id + '" Type="Shape" UniqueID="' + uid() + '"><Cell N="PinX" V="' + cx + '"/><Cell N="PinY" V="' + cy + '"/><Cell N="Width" V="' + wi + '"/><Cell N="Height" V="' + hi + '"/><Cell N="LocPinX" V="' + wi / 2 + '"/><Cell N="LocPinY" V="' + hi / 2 + '"/><Cell N="TxtWidth" V="' + wi + '"/><Cell N="TxtHeight" V="' + hi + '"/><Cell N="TxtPinX" V="' + wi / 2 + '"/><Cell N="TxtPinY" V="' + hi / 2 + '"/><Cell N="TxtLocPinX" V="' + wi / 2 + '"/><Cell N="TxtLocPinY" V="' + hi / 2 + '"/><Cell N="FillForegnd" V="' + s.fill + '"/><Cell N="FillBkgnd" V="' + s.fill + '"/><Cell N="LineColor" V="' + s.stroke + '"/><Cell N="LineWeight" V="' + sw + '"/><Cell N="VerticalAlign" V="' + vAlign + '"/><Cell N="HorzAlign" V="' + hAlign + '"/><Cell N="TopMargin" V="0.06"/><Cell N="BottomMargin" V="0.06"/><Cell N="LeftMargin" V="0.1"/><Cell N="RightMargin" V="0.1"/>' + dashXml + '<Section N="Character" IX="0"><Row IX="0"><Cell N="Font" V="Calibri"/><Cell N="Color" V="' + (s.fontColor || "#000000") + '"/><Cell N="Size" V="' + fs + '"/><Cell N="Style" V="' + (s.bold ? 1 : 0) + '"/></Row></Section>' + geom + propsXml + "<Text>" + xmlEsc(s.text) + "</Text></Shape>";
  }
  function buildPolyConnector(e, pgH) {
    const pts = e.waypoints.map((wp) => ({ x: toIn(wp.x), y: pgH - toIn(wp.y) }));
    if (pts.length < 2) return "";
    const p1 = pts[0];
    const pN = pts[pts.length - 1];
    const sw = toIn(e.width || 1);
    const cid = e.id;
    let geomRows = '<Row T="MoveTo" IX="1"><Cell N="X" V="' + p1.x + '"/><Cell N="Y" V="' + p1.y + '"/></Row>';
    for (let i = 1; i < pts.length; i++) {
      geomRows += '<Row T="LineTo" IX="' + (i + 1) + '"><Cell N="X" V="' + pts[i].x + '"/><Cell N="Y" V="' + pts[i].y + '"/></Row>';
    }
    return '<Shape ID="' + cid + '" NameU="Conn.' + cid + '" Type="Shape" UniqueID="' + uid() + '"><Cell N="ObjType" V="2"/><Cell N="BeginX" V="' + p1.x + '"/><Cell N="BeginY" V="' + p1.y + '"/><Cell N="EndX" V="' + pN.x + '"/><Cell N="EndY" V="' + pN.y + '"/><Cell N="LineColor" V="' + (e.color || "#6B7280") + '"/><Cell N="LineWeight" V="' + sw + '"/><Cell N="LinePattern" V="' + (e.linePattern || 1) + '"/><Cell N="BeginArrow" V="0"/><Cell N="EndArrow" V="5"/><Cell N="EndArrowSize" V="2"/><Section N="Geometry" IX="0"><Cell N="NoFill" V="1"/><Cell N="NoLine" V="0"/>' + geomRows + "</Section></Shape>";
  }
  function buildVsdxXml(pgW, pgH) {
    let shapesStr = "";
    shapes.forEach((s) => {
      shapesStr += buildShape(s, pgH);
    });
    polyEdges.forEach((e) => {
      shapesStr += buildPolyConnector(e, pgH);
    });
    const page1 = '<?xml version="1.0" encoding="utf-8"?><PageContents xmlns="http://schemas.microsoft.com/office/visio/2012/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><Shapes>' + shapesStr + "</Shapes></PageContents>";
    const pagesXml = '<?xml version="1.0" encoding="utf-8"?><Pages xmlns="http://schemas.microsoft.com/office/visio/2012/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><Page ID="0" Name="AWS Network Map" NameU="AWS Network Map"><PageSheet><Cell N="PageWidth" V="' + pgW + '"/><Cell N="PageHeight" V="' + pgH + '"/><Cell N="PrintPageOrientation" V="2"/></PageSheet><Rel r:id="rId1"/></Page></Pages>';
    const docXml = '<?xml version="1.0" encoding="utf-8"?><VisioDocument xmlns="http://schemas.microsoft.com/office/visio/2012/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><DocumentProperties><Creator>AWS Network Map Tool</Creator><Description>AWS Network Infrastructure Diagram</Description></DocumentProperties></VisioDocument>';
    const contentTypes = '<?xml version="1.0" encoding="utf-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/visio/document.xml" ContentType="application/vnd.ms-visio.drawing.main+xml"/><Override PartName="/visio/pages/pages.xml" ContentType="application/vnd.ms-visio.pages+xml"/><Override PartName="/visio/pages/page1.xml" ContentType="application/vnd.ms-visio.page+xml"/></Types>';
    const topRels = '<?xml version="1.0" encoding="utf-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.microsoft.com/visio/2010/relationships/document" Target="visio/document.xml"/></Relationships>';
    const docRels = '<?xml version="1.0" encoding="utf-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.microsoft.com/visio/2010/relationships/pages" Target="pages/pages.xml"/></Relationships>';
    const pagesRels = '<?xml version="1.0" encoding="utf-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.microsoft.com/visio/2010/relationships/page" Target="page1.xml"/></Relationships>';
    return { page1, pagesXml, docXml, contentTypes, topRels, docRels, pagesRels };
  }
  var _colorCache = /* @__PURE__ */ new Map();
  function resolveColor(cssVar) {
    if (_colorCache.has(cssVar)) return _colorCache.get(cssVar);
    if (typeof document === "undefined") return "#888888";
    const el = document.createElement("div");
    el.style.color = cssVar;
    document.body.appendChild(el);
    const c = getComputedStyle(el).color;
    document.body.removeChild(el);
    const m = c.match(/(\d+)/g);
    if (!m) return "#888888";
    const hex = "#" + m.slice(0, 3).map((x) => (+x).toString(16).padStart(2, "0")).join("");
    _colorCache.set(cssVar, hex);
    return hex;
  }
  function downloadBlob(blob, name) {
    const isElectron = typeof window !== "undefined" && !!window.electronAPI;
    if (isElectron) {
      const ext2 = (name.match(/\.([^.]+)$/) || [])[1] || "*";
      const filters = [
        { name: ext2.toUpperCase() + " Files", extensions: [ext2] },
        { name: "All Files", extensions: ["*"] }
      ];
      if (blob.type && blob.type.startsWith("text")) {
        blob.text().then((text) => {
          window.electronAPI.exportFile(text, name, filters).then((p) => {
            if (p) showToast("Exported: " + p.split("/").pop());
          }).catch((e) => console.error("Export failed:", e));
        });
      } else {
        blob.arrayBuffer().then((ab) => {
          window.electronAPI.exportFile(new Uint8Array(ab), name, filters).then((p) => {
            if (p) showToast("Exported: " + p.split("/").pop());
          }).catch((e) => console.error("Export failed:", e));
        });
      }
      return;
    }
    const a = document.createElement("a");
    const objUrl = URL.createObjectURL(blob);
    a.href = objUrl;
    a.download = name;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function() {
      URL.revokeObjectURL(objUrl);
    }, 1e3);
  }
  function computeSubnetHeights(subnets, ctx) {
    const heights = {};
    subnets.forEach((s) => {
      const bt = buildSubText(s, ctx);
      heights[s.SubnetId] = Math.max(SUB_H_MIN, bt.lineCount * LINE_H + 30);
    });
    return heights;
  }
  function computePageDimensions(totalWidth, busStartY, busLaneIdx, busLaneH) {
    let pgWpx = totalWidth + 200;
    let pgHpx = busStartY + (busLaneIdx + 2) * busLaneH + 300;
    shapes.forEach((s) => {
      pgWpx = Math.max(pgWpx, s.x + s.w + 120);
      pgHpx = Math.max(pgHpx, s.y + s.h + 120);
    });
    const pgW = toIn(pgWpx) + 2;
    const pgH = toIn(pgHpx) + 2;
    return { pgWpx, pgHpx, pgW, pgH };
  }
  if (typeof window !== "undefined") {
    window.downloadBlob = downloadBlob;
    window.resolveColor = resolveColor;
    window._sanitizeName = sanitizeName;
    let _vsdxCache = null;
    Object.defineProperty(window, "_vsdx", {
      get() {
        if (!_vsdxCache) _vsdxCache = {
          resetShapeState,
          getShapes,
          getPolyEdges,
          getIdMap,
          setIdMapEntry,
          xmlEsc,
          uid,
          addRect,
          addPolyEdge,
          buildSubText,
          buildShape,
          buildPolyConnector,
          buildVsdxXml,
          computeSubnetHeights,
          computePageDimensions,
          gwStyles,
          PX,
          SUB_W,
          SUB_H_MIN,
          SUB_GAP,
          VPC_PAD,
          VPC_HDR,
          GW_INSIDE_W,
          GW_INSIDE_H,
          GW_INSIDE_GAP,
          GW_ROW_H,
          COL_GAP,
          LINE_H,
          TOP_MARGIN,
          toIn
        };
        return _vsdxCache;
      },
      configurable: true
    });
  }

  // src/modules/iac-generator.js
  var iac_generator_exports = {};
  __export(iac_generator_exports, {
    _cfnSGRule: () => _cfnSGRule,
    _cfnSGRuleProps: () => _cfnSGRuleProps,
    _cfnTags: () => _cfnTags,
    _ckAlbs: () => _ckAlbs,
    _ckEc2: () => _ckEc2,
    _ckElastiCache: () => _ckElastiCache,
    _ckExpandRules: () => _ckExpandRules,
    _ckIamRoles: () => _ckIamRoles,
    _ckIamUsers: () => _ckIamUsers,
    _ckId: () => _ckId,
    _ckLambda: () => _ckLambda,
    _ckNacls: () => _ckNacls,
    _ckRds: () => _ckRds,
    _ckRedshift: () => _ckRedshift,
    _ckRts: () => _ckRts,
    _ckS3: () => _ckS3,
    _ckSgs: () => _ckSgs,
    _ckSubnets: () => _ckSubnets,
    _ckVpcs: () => _ckVpcs,
    _serializeCfnYaml: () => _serializeCfnYaml,
    _tfName: () => _tfName,
    _tfRef: () => _tfRef,
    _writeSGRule: () => _writeSGRule,
    _writeSGRuleFlat: () => _writeSGRuleFlat,
    _writeTags: () => _writeTags,
    detectCircularSGs: () => detectCircularSGs,
    generateCheckovCfn: () => generateCheckovCfn,
    generateCloudFormation: () => generateCloudFormation,
    generateTerraform: () => generateTerraform,
    getIacOutput: () => getIacOutput,
    getIacType: () => getIacType,
    getTfIdMap: () => getTfIdMap,
    highlightHCL: () => highlightHCL,
    highlightYAML: () => highlightYAML,
    setIacOutput: () => setIacOutput,
    setIacType: () => setIacType,
    setTfIdMap: () => setTfIdMap
  });
  var _iacType = "terraform";
  var _iacOutput = "";
  var _tfIdMap = {};
  function getIacType() {
    return _iacType;
  }
  function setIacType(v) {
    _iacType = v;
  }
  function getIacOutput() {
    return _iacOutput;
  }
  function setIacOutput(v) {
    _iacOutput = v;
  }
  function getTfIdMap() {
    return _tfIdMap;
  }
  function setTfIdMap(v) {
    _tfIdMap = v;
  }
  function _tfName(resource, prefix) {
    const n = resource.Tags && resource.Tags.find((t) => t.Key === "Name");
    const raw = n ? n.Value : resource.VpcId || resource.SubnetId || resource.GroupId || resource.InstanceId || prefix || "res";
    return sanitizeName(raw);
  }
  function _tfRef(id, attr) {
    if (_tfIdMap[id]) return _tfIdMap[id] + "." + attr;
    return '"' + id + '"';
  }
  function detectCircularSGs(sgs) {
    const graph = {};
    sgs.forEach((sg) => {
      graph[sg.GroupId] = /* @__PURE__ */ new Set();
      (sg.IpPermissions || []).concat(sg.IpPermissionsEgress || []).forEach((rule) => {
        (rule.UserIdGroupPairs || []).forEach((pair) => {
          if (pair.GroupId && pair.GroupId !== sg.GroupId) graph[sg.GroupId].add(pair.GroupId);
        });
      });
    });
    const cycles = [];
    const visited = /* @__PURE__ */ new Set(), inStack = /* @__PURE__ */ new Set();
    function dfs(node, path) {
      if (inStack.has(node)) {
        const ci = path.indexOf(node);
        if (ci >= 0) cycles.push(path.slice(ci));
        return;
      }
      if (visited.has(node)) return;
      visited.add(node);
      inStack.add(node);
      path.push(node);
      (graph[node] || /* @__PURE__ */ new Set()).forEach((nb) => dfs(nb, [...path]));
      inStack.delete(node);
    }
    Object.keys(graph).forEach((n) => {
      if (!visited.has(n)) dfs(n, []);
    });
    return cycles;
  }
  function _writeTags(lines, resource) {
    const tags = (resource.Tags || []).filter((t) => t.Key !== "aws:");
    if (!tags.length) return;
    lines.push("");
    lines.push("  tags = {");
    tags.forEach((t) => {
      const k = t.Key.match(/^[a-zA-Z_][a-zA-Z0-9_]*$/) ? t.Key : '"' + t.Key + '"';
      lines.push("    " + k + ' = "' + (t.Value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"');
    });
    lines.push("  }");
  }
  function _writeSGRule(lines, rule) {
    const fromPort = rule.FromPort != null ? rule.FromPort : 0;
    const toPort = rule.ToPort != null ? rule.ToPort : 0;
    const proto = rule.IpProtocol || "-1";
    lines.push('    protocol    = "' + proto + '"');
    lines.push("    from_port   = " + fromPort);
    lines.push("    to_port     = " + toPort);
    const cidrs = (rule.IpRanges || []).map((r) => r.CidrIp).filter(Boolean);
    const v6cidrs = (rule.Ipv6Ranges || []).map((r) => r.CidrIpv6).filter(Boolean);
    const sgRefs = (rule.UserIdGroupPairs || []).map((p) => p.GroupId).filter(Boolean);
    if (cidrs.length) lines.push("    cidr_blocks = " + JSON.stringify(cidrs));
    if (v6cidrs.length) lines.push("    ipv6_cidr_blocks = " + JSON.stringify(v6cidrs));
    if (sgRefs.length) lines.push("    security_groups = [" + sgRefs.map((s) => _tfRef(s, "id")).join(", ") + "]");
    const desc = (rule.IpRanges || []).find((r) => r.Description);
    if (desc) lines.push('    description = "' + (desc.Description || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"');
  }
  function _writeSGRuleFlat(lines, rule) {
    const fromPort = rule.FromPort != null ? rule.FromPort : 0;
    const toPort = rule.ToPort != null ? rule.ToPort : 0;
    const proto = rule.IpProtocol || "-1";
    lines.push('  protocol         = "' + proto + '"');
    lines.push("  from_port        = " + fromPort);
    lines.push("  to_port          = " + toPort);
    const cidrs = (rule.IpRanges || []).map((r) => r.CidrIp).filter(Boolean);
    const sgRefs = (rule.UserIdGroupPairs || []).map((p) => p.GroupId).filter(Boolean);
    if (cidrs.length) lines.push("  cidr_blocks      = " + JSON.stringify(cidrs));
    if (sgRefs.length && sgRefs[0]) lines.push("  source_security_group_id = " + _tfRef(sgRefs[0], "id"));
  }
  function generateTerraform(ctx, opts) {
    if (!ctx || !ctx.vpcs) return "# No data loaded";
    _tfIdMap = {};
    const lines = [];
    const vars = [];
    const imports = [];
    const warnings = [];
    const mode = opts.mode || "import";
    const scopeVpc = opts.scopeVpcId || null;
    const includeVars = opts.includeVars !== false;
    const vpcs = scopeVpc ? ctx.vpcs.filter((v) => v.VpcId === scopeVpc) : ctx.vpcs;
    const vpcIds = new Set(vpcs.map((v) => v.VpcId));
    const subnets = (ctx.subnets || []).filter((s) => vpcIds.has(s.VpcId));
    const subIds = new Set(subnets.map((s) => s.SubnetId));
    const sgs = (ctx.sgs || []).filter((s) => vpcIds.has(s.VpcId));
    const rts = (ctx.rts || []).filter((r) => {
      const assoc = r.Associations || [];
      return assoc.some((a) => vpcIds.has(a.SubnetId ? subnets.find((s) => s.SubnetId === a.SubnetId)?.VpcId : null)) || vpcIds.has(r.VpcId);
    });
    const nacls = (ctx.nacls || []).filter((n) => vpcIds.has(n.VpcId));
    const igws = (ctx.igws || []).filter((g) => (g.Attachments || []).some((a) => vpcIds.has(a.VpcId)));
    const nats = (ctx.nats || []).filter((n) => vpcIds.has(n.VpcId));
    const vpces = (ctx.vpces || []).filter((v) => vpcIds.has(v.VpcId));
    const instances = (ctx.instances || []).filter((i) => subIds.has(i.SubnetId));
    const rdsInstances = (ctx.rdsInstances || []).filter((r) => {
      const sn = r.DBSubnetGroup;
      return sn && (sn.Subnets || []).some((s) => subIds.has(s.SubnetIdentifier));
    });
    const lambdaFns = (ctx.lambdaFns || []).filter((l) => {
      const vc = l.VpcConfig;
      return vc && (vc.SubnetIds || []).some((s) => subIds.has(s));
    });
    const ecsServices = (ctx.ecsServices || []).filter((e) => {
      const nc = (e.networkConfiguration || {}).awsvpcConfiguration;
      return nc && (nc.subnets || []).some((s) => subIds.has(s));
    });
    const ecacheClusters = (ctx.ecacheClusters || []).filter((c) => c.CacheSubnetGroupName);
    const redshiftClusters = (ctx.redshiftClusters || []).filter((c) => c.ClusterSubnetGroupName);
    const albs = (ctx.albs || []).filter((a) => (a.AvailabilityZones || []).some((az) => subIds.has(az.SubnetId)));
    const volumes = (ctx.volumes || []).filter((v) => v.Attachments && v.Attachments.some((a) => instances.find((i) => i.InstanceId === a.InstanceId)));
    const s3bk = scopeVpc ? [] : ctx.s3bk || [];
    const peerings = (ctx.peerings || []).filter((p) => {
      const a = p.AccepterVpcInfo, r = p.RequesterVpcInfo;
      return a && vpcIds.has(a.VpcId) || r && vpcIds.has(r.VpcId);
    });
    const cfDistributions = scopeVpc ? [] : ctx.cfDistributions || [];
    lines.push("# Generated by AWS Mapper");
    lines.push("# Date: " + (/* @__PURE__ */ new Date()).toISOString().split("T")[0]);
    lines.push("# Mode: " + (mode === "import" ? "Import Existing" : mode === "create" ? "Create New" : "Full Recreate"));
    lines.push("#");
    lines.push("# KNOWN LIMITATIONS - Review before applying:");
    lines.push("# - AMI IDs are region-specific and may need updating");
    lines.push("# - Key pair names must exist in the target account");
    lines.push("# - IAM roles/instance profiles are not included");
    lines.push("# - Passwords and secrets are placeholder values");
    lines.push("# - Custom DNS/DHCP options may need manual configuration");
    lines.push("");
    lines.push("terraform {");
    lines.push("  required_providers {");
    lines.push("    aws = {");
    lines.push('      source  = "hashicorp/aws"');
    lines.push('      version = "~> 5.0"');
    lines.push("    }");
    lines.push("  }");
    lines.push("}");
    lines.push("");
    lines.push('provider "aws" {');
    lines.push("  region = var.aws_region");
    lines.push("");
    lines.push("  default_tags {");
    lines.push("    tags = {");
    lines.push('      ManagedBy   = "terraform"');
    lines.push('      GeneratedBy = "aws-mapper"');
    lines.push("    }");
    lines.push("  }");
    lines.push("}");
    lines.push("");
    if (includeVars) {
      const region = subnets.length && subnets[0].AvailabilityZone ? subnets[0].AvailabilityZone.replace(/[a-z]$/, "") : "us-east-1";
      vars.push({ name: "aws_region", desc: "AWS Region", type: "string", def: region });
      const cidrs = new Set(vpcs.map((v) => v.CidrBlock));
      if (cidrs.size) vars.push({ name: "vpc_cidrs", desc: "VPC CIDR blocks", type: "map(string)", def: null });
      const azs = new Set(subnets.map((s) => s.AvailabilityZone).filter(Boolean));
      if (azs.size) vars.push({ name: "availability_zones", desc: "Availability zones", type: "list(string)", def: [...azs] });
      const iTypes = new Set(instances.map((i) => i.InstanceType).filter(Boolean));
      if (iTypes.size) vars.push({ name: "instance_types", desc: "EC2 instance types in use", type: "map(string)", def: null });
    }
    vars.forEach((v) => {
      lines.push('variable "' + v.name + '" {');
      lines.push('  description = "' + v.desc + '"');
      lines.push("  type        = " + v.type);
      if (v.def !== null && v.def !== void 0) {
        if (Array.isArray(v.def)) {
          lines.push("  default     = " + JSON.stringify(v.def));
        } else {
          lines.push('  default     = "' + v.def + '"');
        }
      }
      lines.push("}");
      lines.push("");
    });
    const sgCycles = detectCircularSGs(sgs);
    const cyclicSgIds = /* @__PURE__ */ new Set();
    sgCycles.forEach((c) => c.forEach((id) => cyclicSgIds.add(id)));
    vpcs.forEach((vpc) => {
      const name = _tfName(vpc, "vpc");
      const resName = "aws_vpc." + name;
      _tfIdMap[vpc.VpcId] = resName;
      if (mode === "import") imports.push({ to: resName, id: vpc.VpcId });
      lines.push("# VPC: " + (vpc.Tags && vpc.Tags.find((t) => t.Key === "Name") ? vpc.Tags.find((t) => t.Key === "Name").Value : vpc.VpcId));
      lines.push('resource "aws_vpc" "' + name + '" {');
      lines.push('  cidr_block           = "' + vpc.CidrBlock + '"');
      lines.push("  enable_dns_support   = " + (vpc.EnableDnsSupport !== false ? "true" : "false"));
      lines.push("  enable_dns_hostnames = " + (vpc.EnableDnsHostnames === true ? "true" : "false"));
      if (vpc.InstanceTenancy && vpc.InstanceTenancy !== "default") lines.push('  instance_tenancy     = "' + vpc.InstanceTenancy + '"');
      _writeTags(lines, vpc);
      lines.push("}");
      lines.push("");
    });
    igws.forEach((igw) => {
      const name = _tfName(igw, "igw");
      const resName = "aws_internet_gateway." + name;
      _tfIdMap[igw.InternetGatewayId] = resName;
      if (mode === "import") imports.push({ to: resName, id: igw.InternetGatewayId });
      lines.push('resource "aws_internet_gateway" "' + name + '" {');
      const att = (igw.Attachments || [])[0];
      if (att) lines.push("  vpc_id = " + _tfRef(att.VpcId, "id"));
      _writeTags(lines, igw);
      lines.push("}");
      lines.push("");
    });
    subnets.forEach((sub) => {
      const name = _tfName(sub, "subnet");
      const resName = "aws_subnet." + name;
      _tfIdMap[sub.SubnetId] = resName;
      if (mode === "import") imports.push({ to: resName, id: sub.SubnetId });
      lines.push('resource "aws_subnet" "' + name + '" {');
      lines.push("  vpc_id            = " + _tfRef(sub.VpcId, "id"));
      lines.push('  cidr_block        = "' + sub.CidrBlock + '"');
      if (sub.AvailabilityZone) lines.push('  availability_zone = "' + sub.AvailabilityZone + '"');
      if (sub.MapPublicIpOnLaunch) lines.push("  map_public_ip_on_launch = true");
      _writeTags(lines, sub);
      lines.push("}");
      lines.push("");
    });
    rts.forEach((rt) => {
      const name = _tfName(rt, "rt");
      const resName = "aws_route_table." + name;
      _tfIdMap[rt.RouteTableId] = resName;
      if (mode === "import") imports.push({ to: resName, id: rt.RouteTableId });
      const vpcId = rt.VpcId || (rt.Associations && rt.Associations[0] ? rt.Associations[0].VpcId : null);
      lines.push('resource "aws_route_table" "' + name + '" {');
      if (vpcId) lines.push("  vpc_id = " + _tfRef(vpcId, "id"));
      (rt.Routes || []).forEach((route) => {
        if (route.GatewayId === "local") return;
        lines.push("");
        lines.push("  route {");
        if (route.DestinationCidrBlock) lines.push('    cidr_block = "' + route.DestinationCidrBlock + '"');
        if (route.GatewayId && route.GatewayId !== "local") lines.push("    gateway_id = " + _tfRef(route.GatewayId, "id"));
        if (route.NatGatewayId) lines.push("    nat_gateway_id = " + _tfRef(route.NatGatewayId, "id"));
        if (route.VpcPeeringConnectionId) lines.push("    vpc_peering_connection_id = " + _tfRef(route.VpcPeeringConnectionId, "id"));
        if (route.TransitGatewayId) lines.push('    transit_gateway_id = "' + route.TransitGatewayId + '"');
        if (route.VpcEndpointId) lines.push("    vpc_endpoint_id = " + _tfRef(route.VpcEndpointId, "id"));
        lines.push("  }");
      });
      _writeTags(lines, rt);
      lines.push("}");
      lines.push("");
      (rt.Associations || []).forEach((assoc, ai) => {
        if (assoc.Main) return;
        if (!assoc.SubnetId) return;
        const aname = name + "_assoc_" + ai;
        lines.push('resource "aws_route_table_association" "' + aname + '" {');
        lines.push("  subnet_id      = " + _tfRef(assoc.SubnetId, "id"));
        lines.push("  route_table_id = " + _tfRef(rt.RouteTableId, "id"));
        lines.push("}");
        lines.push("");
      });
    });
    nats.forEach((nat) => {
      const name = _tfName(nat, "nat");
      const resName = "aws_nat_gateway." + name;
      _tfIdMap[nat.NatGatewayId] = resName;
      if (mode === "import") imports.push({ to: resName, id: nat.NatGatewayId });
      lines.push('resource "aws_nat_gateway" "' + name + '" {');
      if (nat.SubnetId) lines.push("  subnet_id     = " + _tfRef(nat.SubnetId, "id"));
      const eip = (nat.NatGatewayAddresses || [])[0];
      if (eip && eip.AllocationId) lines.push('  allocation_id = "' + eip.AllocationId + '" # EIP allocation');
      lines.push('  connectivity_type = "' + (nat.ConnectivityType || "public") + '"');
      _writeTags(lines, nat);
      lines.push("}");
      lines.push("");
    });
    sgs.forEach((sg) => {
      const name = _tfName(sg, "sg");
      const resName = "aws_security_group." + name;
      _tfIdMap[sg.GroupId] = resName;
      if (mode === "import") imports.push({ to: resName, id: sg.GroupId });
      const isCyclic = cyclicSgIds.has(sg.GroupId);
      if (isCyclic) lines.push("# Circular SG reference detected - rules split into separate resources");
      lines.push('resource "aws_security_group" "' + name + '" {');
      lines.push('  name        = "' + (sg.GroupName || name) + '"');
      lines.push('  description = "' + (sg.Description || "Managed by Terraform") + '"');
      if (sg.VpcId) lines.push("  vpc_id      = " + _tfRef(sg.VpcId, "id"));
      if (!isCyclic) {
        (sg.IpPermissions || []).forEach((rule) => {
          lines.push("");
          lines.push("  ingress {");
          _writeSGRule(lines, rule);
          lines.push("  }");
        });
        (sg.IpPermissionsEgress || []).forEach((rule) => {
          lines.push("");
          lines.push("  egress {");
          _writeSGRule(lines, rule);
          lines.push("  }");
        });
      }
      _writeTags(lines, sg);
      lines.push("}");
      lines.push("");
      if (isCyclic) {
        (sg.IpPermissions || []).forEach((rule, ri) => {
          lines.push('resource "aws_security_group_rule" "' + name + "_ingress_" + ri + '" {');
          lines.push('  type              = "ingress"');
          lines.push("  security_group_id = " + _tfRef(sg.GroupId, "id"));
          _writeSGRuleFlat(lines, rule);
          lines.push("}");
          lines.push("");
        });
        (sg.IpPermissionsEgress || []).forEach((rule, ri) => {
          lines.push('resource "aws_security_group_rule" "' + name + "_egress_" + ri + '" {');
          lines.push('  type              = "egress"');
          lines.push("  security_group_id = " + _tfRef(sg.GroupId, "id"));
          _writeSGRuleFlat(lines, rule);
          lines.push("}");
          lines.push("");
        });
      }
    });
    nacls.forEach((nacl) => {
      const name = _tfName(nacl, "nacl");
      const resName = "aws_network_acl." + name;
      _tfIdMap[nacl.NetworkAclId] = resName;
      if (mode === "import") imports.push({ to: resName, id: nacl.NetworkAclId });
      lines.push('resource "aws_network_acl" "' + name + '" {');
      if (nacl.VpcId) lines.push("  vpc_id     = " + _tfRef(nacl.VpcId, "id"));
      const assocSubs = (nacl.Associations || []).map((a) => a.SubnetId).filter(Boolean);
      if (assocSubs.length) lines.push("  subnet_ids = [" + assocSubs.map((s) => _tfRef(s, "id")).join(", ") + "]");
      (nacl.Entries || []).forEach((entry) => {
        if (entry.RuleNumber === 32767) return;
        const dir = entry.Egress ? "egress" : "ingress";
        lines.push("");
        lines.push("  " + dir + " {");
        lines.push("    rule_no    = " + entry.RuleNumber);
        lines.push('    protocol   = "' + entry.Protocol + '"');
        lines.push('    action     = "' + (entry.RuleAction || "allow") + '"');
        if (entry.CidrBlock) lines.push('    cidr_block = "' + entry.CidrBlock + '"');
        if (entry.PortRange) {
          lines.push("    from_port  = " + (entry.PortRange.From || 0));
          lines.push("    to_port    = " + (entry.PortRange.To || 0));
        }
        lines.push("  }");
      });
      _writeTags(lines, nacl);
      lines.push("}");
      lines.push("");
    });
    vpces.forEach((vpce) => {
      const name = _tfName(vpce, "vpce");
      const resName = "aws_vpc_endpoint." + name;
      _tfIdMap[vpce.VpcEndpointId] = resName;
      if (mode === "import") imports.push({ to: resName, id: vpce.VpcEndpointId });
      lines.push('resource "aws_vpc_endpoint" "' + name + '" {');
      if (vpce.VpcId) lines.push("  vpc_id            = " + _tfRef(vpce.VpcId, "id"));
      if (vpce.ServiceName) lines.push('  service_name      = "' + vpce.ServiceName + '"');
      if (vpce.VpcEndpointType) lines.push('  vpc_endpoint_type = "' + vpce.VpcEndpointType + '"');
      if (vpce.VpcEndpointType === "Interface" && vpce.SubnetIds && vpce.SubnetIds.length) {
        lines.push("  subnet_ids        = [" + vpce.SubnetIds.map((s) => _tfRef(s, "id")).join(", ") + "]");
      }
      if (vpce.RouteTableIds && vpce.RouteTableIds.length) {
        lines.push("  route_table_ids   = [" + vpce.RouteTableIds.map((r) => _tfRef(r, "id")).join(", ") + "]");
      }
      _writeTags(lines, vpce);
      lines.push("}");
      lines.push("");
    });
    instances.forEach((inst) => {
      const name = _tfName(inst, "ec2");
      const resName = "aws_instance." + name;
      _tfIdMap[inst.InstanceId] = resName;
      if (mode === "import") imports.push({ to: resName, id: inst.InstanceId });
      lines.push('resource "aws_instance" "' + name + '" {');
      if (inst.ImageId) lines.push('  ami           = "' + inst.ImageId + '" # WARNING: AMI is region-specific');
      if (inst.InstanceType) lines.push('  instance_type = "' + inst.InstanceType + '"');
      if (inst.SubnetId) lines.push("  subnet_id     = " + _tfRef(inst.SubnetId, "id"));
      if (inst.KeyName) lines.push('  key_name      = "' + inst.KeyName + '" # Must exist in target account');
      const sgIds = (inst.SecurityGroups || inst.NetworkInterfaces && inst.NetworkInterfaces[0] && inst.NetworkInterfaces[0].Groups || []).map((g) => g.GroupId).filter(Boolean);
      if (sgIds.length) lines.push("  vpc_security_group_ids = [" + sgIds.map((s) => _tfRef(s, "id")).join(", ") + "]");
      if (inst.IamInstanceProfile && inst.IamInstanceProfile.Arn) {
        lines.push('  iam_instance_profile = "' + inst.IamInstanceProfile.Arn.split("/").pop() + '" # IAM profile must exist');
      }
      if (inst.Placement && inst.Placement.Tenancy && inst.Placement.Tenancy !== "default") {
        lines.push('  tenancy = "' + inst.Placement.Tenancy + '"');
      }
      _writeTags(lines, inst);
      lines.push("}");
      lines.push("");
    });
    volumes.forEach((vol) => {
      const name = _tfName(vol, "vol");
      const resName = "aws_ebs_volume." + name;
      _tfIdMap[vol.VolumeId] = resName;
      if (mode === "import") imports.push({ to: resName, id: vol.VolumeId });
      lines.push('resource "aws_ebs_volume" "' + name + '" {');
      if (vol.AvailabilityZone) lines.push('  availability_zone = "' + vol.AvailabilityZone + '"');
      if (vol.Size) lines.push("  size              = " + vol.Size);
      if (vol.VolumeType) lines.push('  type              = "' + vol.VolumeType + '"');
      if (vol.Iops && (vol.VolumeType === "io1" || vol.VolumeType === "io2" || vol.VolumeType === "gp3")) lines.push("  iops              = " + vol.Iops);
      if (vol.Encrypted) lines.push("  encrypted         = true");
      _writeTags(lines, vol);
      lines.push("}");
      lines.push("");
    });
    albs.forEach((alb) => {
      const name = _tfName(alb, "alb");
      const type = alb.Type || "application";
      const resType = "aws_lb";
      const resName = resType + "." + name;
      _tfIdMap[alb.LoadBalancerArn] = resName;
      if (mode === "import") imports.push({ to: resName, id: alb.LoadBalancerArn });
      lines.push('resource "' + resType + '" "' + name + '" {');
      if (alb.LoadBalancerName) lines.push('  name               = "' + alb.LoadBalancerName + '"');
      lines.push('  load_balancer_type = "' + type + '"');
      lines.push("  internal           = " + (alb.Scheme === "internal" ? "true" : "false"));
      const albSubs = (alb.AvailabilityZones || []).map((az) => az.SubnetId).filter(Boolean);
      if (albSubs.length) lines.push("  subnets            = [" + albSubs.map((s) => _tfRef(s, "id")).join(", ") + "]");
      const albSgs = alb.SecurityGroups || [];
      if (albSgs.length) lines.push("  security_groups    = [" + albSgs.map((s) => _tfRef(s, "id")).join(", ") + "]");
      _writeTags(lines, alb);
      lines.push("}");
      lines.push("");
    });
    rdsInstances.forEach((rds) => {
      const name = sanitizeName(rds.DBInstanceIdentifier || "rds");
      const resName = "aws_db_instance." + name;
      _tfIdMap[rds.DBInstanceIdentifier] = resName;
      if (mode === "import") imports.push({ to: resName, id: rds.DBInstanceIdentifier });
      lines.push('resource "aws_db_instance" "' + name + '" {');
      if (rds.DBInstanceIdentifier) lines.push('  identifier     = "' + rds.DBInstanceIdentifier + '"');
      if (rds.Engine) lines.push('  engine         = "' + rds.Engine + '"');
      if (rds.EngineVersion) lines.push('  engine_version = "' + rds.EngineVersion + '"');
      if (rds.DBInstanceClass) lines.push('  instance_class = "' + rds.DBInstanceClass + '"');
      if (rds.AllocatedStorage) lines.push("  allocated_storage = " + rds.AllocatedStorage);
      if (rds.StorageType) lines.push('  storage_type   = "' + rds.StorageType + '"');
      if (rds.MultiAZ) lines.push("  multi_az       = true");
      if (rds.StorageEncrypted) lines.push("  storage_encrypted = true");
      if (rds.DBSubnetGroup && rds.DBSubnetGroup.DBSubnetGroupName) {
        lines.push('  db_subnet_group_name = "' + rds.DBSubnetGroup.DBSubnetGroupName + '"');
      }
      const rdsSgs = (rds.VpcSecurityGroups || []).map((s) => s.VpcSecurityGroupId).filter(Boolean);
      if (rdsSgs.length) lines.push("  vpc_security_group_ids = [" + rdsSgs.map((s) => _tfRef(s, "id")).join(", ") + "]");
      lines.push('  username         = "admin" # PLACEHOLDER - set actual username');
      lines.push('  password         = "CHANGE_ME" # PLACEHOLDER - use secrets manager');
      lines.push("  skip_final_snapshot = true");
      lines.push("}");
      lines.push("");
    });
    ecacheClusters.forEach((ec) => {
      const name = sanitizeName(ec.CacheClusterId || "cache");
      const resName = "aws_elasticache_cluster." + name;
      _tfIdMap[ec.CacheClusterId] = resName;
      if (mode === "import") imports.push({ to: resName, id: ec.CacheClusterId });
      lines.push('resource "aws_elasticache_cluster" "' + name + '" {');
      if (ec.CacheClusterId) lines.push('  cluster_id      = "' + ec.CacheClusterId + '"');
      if (ec.Engine) lines.push('  engine          = "' + ec.Engine + '"');
      if (ec.CacheNodeType) lines.push('  node_type       = "' + ec.CacheNodeType + '"');
      if (ec.NumCacheNodes) lines.push("  num_cache_nodes = " + ec.NumCacheNodes);
      if (ec.EngineVersion) lines.push('  engine_version  = "' + ec.EngineVersion + '"');
      if (ec.CacheSubnetGroupName) lines.push('  subnet_group_name = "' + ec.CacheSubnetGroupName + '"');
      const ecSgs = (ec.SecurityGroups || []).map((s) => s.SecurityGroupId).filter(Boolean);
      if (ecSgs.length) lines.push("  security_group_ids = [" + ecSgs.map((s) => _tfRef(s, "id")).join(", ") + "]");
      lines.push("}");
      lines.push("");
    });
    redshiftClusters.forEach((rs) => {
      const name = sanitizeName(rs.ClusterIdentifier || "redshift");
      const resName = "aws_redshift_cluster." + name;
      _tfIdMap[rs.ClusterIdentifier] = resName;
      if (mode === "import") imports.push({ to: resName, id: rs.ClusterIdentifier });
      lines.push('resource "aws_redshift_cluster" "' + name + '" {');
      if (rs.ClusterIdentifier) lines.push('  cluster_identifier  = "' + rs.ClusterIdentifier + '"');
      if (rs.NodeType) lines.push('  node_type           = "' + rs.NodeType + '"');
      if (rs.NumberOfNodes > 1) lines.push("  number_of_nodes     = " + rs.NumberOfNodes);
      lines.push('  cluster_type        = "' + (rs.NumberOfNodes > 1 ? "multi-node" : "single-node") + '"');
      if (rs.DBName) lines.push('  database_name       = "' + rs.DBName + '"');
      lines.push('  master_username     = "admin" # PLACEHOLDER');
      lines.push('  master_password     = "CHANGE_ME" # PLACEHOLDER');
      if (rs.ClusterSubnetGroupName) lines.push('  cluster_subnet_group_name = "' + rs.ClusterSubnetGroupName + '"');
      const rsSgs = (rs.VpcSecurityGroups || []).map((s) => s.VpcSecurityGroupId).filter(Boolean);
      if (rsSgs.length) lines.push("  vpc_security_group_ids = [" + rsSgs.map((s) => _tfRef(s, "id")).join(", ") + "]");
      lines.push("  skip_final_snapshot = true");
      lines.push("}");
      lines.push("");
    });
    lambdaFns.forEach((fn) => {
      const name = sanitizeName(fn.FunctionName || "lambda");
      const resName = "aws_lambda_function." + name;
      _tfIdMap[fn.FunctionName] = resName;
      if (mode === "import") imports.push({ to: resName, id: fn.FunctionName });
      lines.push('resource "aws_lambda_function" "' + name + '" {');
      if (fn.FunctionName) lines.push('  function_name = "' + fn.FunctionName + '"');
      if (fn.Runtime) lines.push('  runtime       = "' + fn.Runtime + '"');
      if (fn.Handler) lines.push('  handler       = "' + fn.Handler + '"');
      if (fn.MemorySize) lines.push("  memory_size   = " + fn.MemorySize);
      if (fn.Timeout) lines.push("  timeout       = " + fn.Timeout);
      lines.push('  role          = "arn:aws:iam::role/PLACEHOLDER" # Set actual IAM role ARN');
      lines.push('  filename      = "placeholder.zip" # Set actual deployment package');
      const vc = fn.VpcConfig;
      if (vc && (vc.SubnetIds || []).length) {
        lines.push("");
        lines.push("  vpc_config {");
        lines.push("    subnet_ids         = [" + vc.SubnetIds.map((s) => _tfRef(s, "id")).join(", ") + "]");
        if (vc.SecurityGroupIds && vc.SecurityGroupIds.length) lines.push("    security_group_ids = [" + vc.SecurityGroupIds.map((s) => _tfRef(s, "id")).join(", ") + "]");
        lines.push("  }");
      }
      lines.push("}");
      lines.push("");
    });
    ecsServices.forEach((svc) => {
      const name = sanitizeName(svc.serviceName || "ecs");
      lines.push("# ECS Service: " + svc.serviceName);
      lines.push("# NOTE: ECS services require cluster and task definition resources");
      lines.push("# which are not captured in network-level data. Skeleton below.");
      lines.push('resource "aws_ecs_service" "' + name + '" {');
      if (svc.serviceName) lines.push('  name            = "' + svc.serviceName + '"');
      lines.push('  cluster         = "PLACEHOLDER" # Set actual cluster ARN');
      lines.push('  task_definition = "PLACEHOLDER" # Set actual task definition');
      if (svc.desiredCount) lines.push("  desired_count   = " + svc.desiredCount);
      if (svc.launchType) lines.push('  launch_type     = "' + svc.launchType + '"');
      const nc = (svc.networkConfiguration || {}).awsvpcConfiguration;
      if (nc) {
        lines.push("");
        lines.push("  network_configuration {");
        if (nc.subnets && nc.subnets.length) lines.push("    subnets          = [" + nc.subnets.map((s) => _tfRef(s, "id")).join(", ") + "]");
        if (nc.securityGroups && nc.securityGroups.length) lines.push("    security_groups  = [" + nc.securityGroups.map((s) => _tfRef(s, "id")).join(", ") + "]");
        if (nc.assignPublicIp) lines.push("    assign_public_ip = " + (nc.assignPublicIp === "ENABLED" ? "true" : "false"));
        lines.push("  }");
      }
      lines.push("}");
      lines.push("");
    });
    s3bk.forEach((bk) => {
      const name = sanitizeName(bk.Name || "bucket");
      const resName = "aws_s3_bucket." + name;
      _tfIdMap[bk.Name] = resName;
      if (mode === "import") imports.push({ to: resName, id: bk.Name });
      lines.push('resource "aws_s3_bucket" "' + name + '" {');
      if (bk.Name) lines.push('  bucket = "' + bk.Name + '"');
      lines.push("}");
      lines.push("");
    });
    peerings.forEach((peer) => {
      const name = sanitizeName(peer.VpcPeeringConnectionId || "peer");
      const resName = "aws_vpc_peering_connection." + name;
      _tfIdMap[peer.VpcPeeringConnectionId] = resName;
      if (mode === "import") imports.push({ to: resName, id: peer.VpcPeeringConnectionId });
      lines.push('resource "aws_vpc_peering_connection" "' + name + '" {');
      const req = peer.RequesterVpcInfo, acc = peer.AccepterVpcInfo;
      if (req && req.VpcId) lines.push("  vpc_id      = " + _tfRef(req.VpcId, "id"));
      if (acc && acc.VpcId) lines.push("  peer_vpc_id = " + _tfRef(acc.VpcId, "id"));
      if (acc && acc.OwnerId) lines.push('  peer_owner_id = "' + acc.OwnerId + '"');
      if (acc && acc.Region) lines.push('  peer_region   = "' + acc.Region + '"');
      lines.push("  auto_accept = false # Set to true for same-account peering");
      lines.push("}");
      lines.push("");
    });
    cfDistributions.forEach((cf) => {
      const name = sanitizeName(cf.Id || "cf");
      lines.push("# CloudFront Distribution: " + (cf.DomainName || cf.Id));
      lines.push("# NOTE: CloudFront has many configuration options not captured here.");
      lines.push("# This is a skeleton. Review and customize before applying.");
      lines.push('resource "aws_cloudfront_distribution" "' + name + '" {');
      lines.push("  enabled = " + (cf.Enabled !== false ? "true" : "false"));
      if (cf.Comment) lines.push('  comment = "' + cf.Comment.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"');
      lines.push("");
      lines.push("  origin {");
      lines.push('    domain_name = "PLACEHOLDER.s3.amazonaws.com"');
      lines.push('    origin_id   = "S3-origin"');
      lines.push("  }");
      lines.push("");
      lines.push("  default_cache_behavior {");
      lines.push('    allowed_methods        = ["GET", "HEAD"]');
      lines.push('    cached_methods         = ["GET", "HEAD"]');
      lines.push('    target_origin_id       = "S3-origin"');
      lines.push('    viewer_protocol_policy = "redirect-to-https"');
      lines.push("");
      lines.push("    forwarded_values {");
      lines.push("      query_string = false");
      lines.push('      cookies { forward = "none" }');
      lines.push("    }");
      lines.push("  }");
      lines.push("");
      lines.push("  restrictions {");
      lines.push('    geo_restriction { restriction_type = "none" }');
      lines.push("  }");
      lines.push("");
      lines.push("  viewer_certificate { cloudfront_default_certificate = true }");
      lines.push("}");
      lines.push("");
    });
    if (mode === "import" && imports.length) {
      lines.push("");
      lines.push("# === Import Blocks (Terraform 1.5+) ===");
      lines.push("# Run: terraform plan to verify imports match existing state");
      lines.push("");
      imports.forEach((imp) => {
        lines.push("import {");
        lines.push("  to = " + imp.to);
        lines.push('  id = "' + imp.id + '"');
        lines.push("}");
        lines.push("");
      });
    }
    if (instances.some((i) => i.ImageId)) warnings.push("AMI IDs are region-specific. Update for target region.");
    if (instances.some((i) => i.KeyName)) warnings.push("Key pair names must exist in the target account.");
    if (rdsInstances.length || redshiftClusters.length) warnings.push("Database passwords are placeholders. Use AWS Secrets Manager.");
    if (sgCycles.length) warnings.push(sgCycles.length + " circular SG reference(s) detected. Rules split into separate resources.");
    _iacOutput = lines.join("\n");
    return {
      code: _iacOutput,
      warnings,
      stats: {
        vpcs: vpcs.length,
        subnets: subnets.length,
        sgs: sgs.length,
        instances: instances.length,
        total: imports.length || lines.filter((l) => l.startsWith("resource ")).length
      }
    };
  }
  function _cfnTags(resource) {
    return (resource.Tags || []).filter((t) => !t.Key.startsWith("aws:")).map((t) => ({ Key: t.Key, Value: t.Value || "" }));
  }
  function _cfnSGRule(rule) {
    const r = { IpProtocol: rule.IpProtocol || "-1" };
    if (rule.FromPort != null) r.FromPort = rule.FromPort;
    if (rule.ToPort != null) r.ToPort = rule.ToPort;
    const cidrs = (rule.IpRanges || []).map((c) => c.CidrIp).filter(Boolean);
    if (cidrs.length) r.CidrIp = cidrs[0];
    const sgRefs = (rule.UserIdGroupPairs || []).map((p) => p.GroupId).filter(Boolean);
    if (sgRefs.length) r.SourceSecurityGroupId = sgRefs[0];
    return r;
  }
  function _cfnSGRuleProps(rule) {
    const r = {};
    if (rule.FromPort != null) r.FromPort = rule.FromPort;
    if (rule.ToPort != null) r.ToPort = rule.ToPort;
    const cidrs = (rule.IpRanges || []).map((c) => c.CidrIp).filter(Boolean);
    if (cidrs.length) r.CidrIp = cidrs[0];
    const sgRefs = (rule.UserIdGroupPairs || []).map((p) => p.GroupId).filter(Boolean);
    if (sgRefs.length) r.SourceSecurityGroupId = sgRefs[0];
    return r;
  }
  function generateCloudFormation(ctx, opts) {
    if (!ctx || !ctx.vpcs) return "# No data loaded";
    const scopeVpc = opts.scopeVpcId || null;
    const vpcs = scopeVpc ? ctx.vpcs.filter((v) => v.VpcId === scopeVpc) : ctx.vpcs;
    const vpcIds = new Set(vpcs.map((v) => v.VpcId));
    const subnets = (ctx.subnets || []).filter((s) => vpcIds.has(s.VpcId));
    const subIds = new Set(subnets.map((s) => s.SubnetId));
    const sgs = (ctx.sgs || []).filter((s) => vpcIds.has(s.VpcId));
    const igws = (ctx.igws || []).filter((g) => (g.Attachments || []).some((a) => vpcIds.has(a.VpcId)));
    const nats = (ctx.nats || []).filter((n) => vpcIds.has(n.VpcId));
    const instances = (ctx.instances || []).filter((i) => subIds.has(i.SubnetId));
    const rts = (ctx.rts || []).filter((r) => r.VpcId && vpcIds.has(r.VpcId));
    const rdsInstances = (ctx.rdsInstances || []).filter((r) => {
      const sn = r.DBSubnetGroup;
      return sn && (sn.Subnets || []).some((s) => subIds.has(s.SubnetIdentifier));
    });
    const albs = (ctx.albs || []).filter((a) => (a.AvailabilityZones || []).some((az) => subIds.has(az.SubnetId)));
    const warnings = [];
    const totalResources = vpcs.length + subnets.length + sgs.length + igws.length + nats.length + instances.length + rts.length + rdsInstances.length + albs.length;
    if (totalResources > 450) warnings.push("Resource count (" + totalResources + ") approaches CloudFormation 500-resource limit. Consider nested stacks.");
    const template = {
      AWSTemplateFormatVersion: "2010-09-09",
      Description: "Generated by AWS Mapper on " + (/* @__PURE__ */ new Date()).toISOString().split("T")[0],
      Parameters: {},
      Resources: {},
      Outputs: {}
    };
    const cfnIdMap = {};
    function cfnName(resource, prefix) {
      const n = resource.Tags && resource.Tags.find((t) => t.Key === "Name");
      const raw = n ? n.Value : prefix || "Res";
      return raw.replace(/[^a-zA-Z0-9]/g, "");
    }
    function cfnRef(id) {
      if (cfnIdMap[id]) return { "Ref": cfnIdMap[id] };
      return id;
    }
    template.Parameters.AWSRegion = {
      Type: "String",
      Default: subnets.length && subnets[0].AvailabilityZone ? subnets[0].AvailabilityZone.replace(/[a-z]$/, "") : "us-east-1",
      Description: "AWS Region"
    };
    vpcs.forEach((vpc) => {
      const ln = cfnName(vpc, "VPC");
      cfnIdMap[vpc.VpcId] = ln;
      template.Resources[ln] = {
        Type: "AWS::EC2::VPC",
        Properties: {
          CidrBlock: vpc.CidrBlock,
          EnableDnsSupport: vpc.EnableDnsSupport !== false,
          EnableDnsHostnames: vpc.EnableDnsHostnames === true,
          Tags: _cfnTags(vpc)
        }
      };
    });
    igws.forEach((igw) => {
      const ln = cfnName(igw, "IGW");
      cfnIdMap[igw.InternetGatewayId] = ln;
      template.Resources[ln] = { Type: "AWS::EC2::InternetGateway", Properties: { Tags: _cfnTags(igw) } };
      const att = (igw.Attachments || [])[0];
      if (att) {
        template.Resources[ln + "Attach"] = {
          Type: "AWS::EC2::VPCGatewayAttachment",
          Properties: { InternetGatewayId: { "Ref": ln }, VpcId: cfnRef(att.VpcId) }
        };
      }
    });
    subnets.forEach((sub) => {
      const ln = cfnName(sub, "Subnet");
      cfnIdMap[sub.SubnetId] = ln;
      const props = { VpcId: cfnRef(sub.VpcId), CidrBlock: sub.CidrBlock, Tags: _cfnTags(sub) };
      if (sub.AvailabilityZone) props.AvailabilityZone = sub.AvailabilityZone;
      if (sub.MapPublicIpOnLaunch) props.MapPublicIpOnLaunch = true;
      template.Resources[ln] = { Type: "AWS::EC2::Subnet", Properties: props };
    });
    rts.forEach((rt) => {
      const ln = cfnName(rt, "RT");
      cfnIdMap[rt.RouteTableId] = ln;
      template.Resources[ln] = { Type: "AWS::EC2::RouteTable", Properties: { VpcId: cfnRef(rt.VpcId), Tags: _cfnTags(rt) } };
      (rt.Routes || []).forEach((route, ri) => {
        if (route.GatewayId === "local") return;
        const routeProps = { RouteTableId: { "Ref": ln } };
        if (route.DestinationCidrBlock) routeProps.DestinationCidrBlock = route.DestinationCidrBlock;
        if (route.GatewayId && route.GatewayId !== "local") routeProps.GatewayId = cfnRef(route.GatewayId);
        if (route.NatGatewayId) routeProps.NatGatewayId = cfnRef(route.NatGatewayId);
        template.Resources[ln + "Route" + ri] = { Type: "AWS::EC2::Route", Properties: routeProps };
      });
      (rt.Associations || []).forEach((assoc, ai) => {
        if (assoc.Main || !assoc.SubnetId) return;
        template.Resources[ln + "Assoc" + ai] = {
          Type: "AWS::EC2::SubnetRouteTableAssociation",
          Properties: { SubnetId: cfnRef(assoc.SubnetId), RouteTableId: { "Ref": ln } }
        };
      });
    });
    nats.forEach((nat) => {
      const ln = cfnName(nat, "NAT");
      cfnIdMap[nat.NatGatewayId] = ln;
      const props = { SubnetId: cfnRef(nat.SubnetId), ConnectivityType: nat.ConnectivityType || "public" };
      const eip = (nat.NatGatewayAddresses || [])[0];
      if (eip && eip.AllocationId) props.AllocationId = eip.AllocationId;
      template.Resources[ln] = {
        Type: "AWS::EC2::NatGateway",
        Properties: props,
        DependsOn: Object.keys(template.Resources).filter((k) => k.endsWith("Attach"))
      };
    });
    const sgCycles = detectCircularSGs(sgs);
    const cyclicSgIds = /* @__PURE__ */ new Set();
    sgCycles.forEach((c) => c.forEach((id) => cyclicSgIds.add(id)));
    sgs.forEach((sg) => {
      const ln = cfnName(sg, "SG");
      cfnIdMap[sg.GroupId] = ln;
      const isCyclic = cyclicSgIds.has(sg.GroupId);
      const props = { GroupDescription: sg.Description || "Managed by CloudFormation", VpcId: cfnRef(sg.VpcId), Tags: _cfnTags(sg) };
      if (!isCyclic) {
        if (sg.IpPermissions && sg.IpPermissions.length) props.SecurityGroupIngress = sg.IpPermissions.map(_cfnSGRule);
        if (sg.IpPermissionsEgress && sg.IpPermissionsEgress.length) props.SecurityGroupEgress = sg.IpPermissionsEgress.map(_cfnSGRule);
      }
      template.Resources[ln] = { Type: "AWS::EC2::SecurityGroup", Properties: props };
      if (isCyclic) {
        (sg.IpPermissions || []).forEach((rule, ri) => {
          const rProps = Object.assign({ GroupId: { "Ref": ln }, IpProtocol: rule.IpProtocol || "-1" }, _cfnSGRuleProps(rule));
          template.Resources[ln + "Ingress" + ri] = { Type: "AWS::EC2::SecurityGroupIngress", Properties: rProps };
        });
        (sg.IpPermissionsEgress || []).forEach((rule, ri) => {
          const rProps = Object.assign({ GroupId: { "Ref": ln }, IpProtocol: rule.IpProtocol || "-1" }, _cfnSGRuleProps(rule));
          template.Resources[ln + "Egress" + ri] = { Type: "AWS::EC2::SecurityGroupEgress", Properties: rProps };
        });
      }
    });
    instances.forEach((inst) => {
      const ln = cfnName(inst, "EC2");
      cfnIdMap[inst.InstanceId] = ln;
      const props = {};
      if (inst.ImageId) props.ImageId = inst.ImageId;
      if (inst.InstanceType) props.InstanceType = inst.InstanceType;
      if (inst.SubnetId) props.SubnetId = cfnRef(inst.SubnetId);
      if (inst.KeyName) props.KeyName = inst.KeyName;
      const sgIds = (inst.SecurityGroups || inst.NetworkInterfaces && inst.NetworkInterfaces[0] && inst.NetworkInterfaces[0].Groups || []).map((g) => g.GroupId).filter(Boolean);
      if (sgIds.length) props.SecurityGroupIds = sgIds.map((s) => cfnRef(s));
      props.Tags = _cfnTags(inst);
      template.Resources[ln] = { Type: "AWS::EC2::Instance", Properties: props };
    });
    albs.forEach((alb) => {
      const ln = cfnName(alb, "ALB");
      cfnIdMap[alb.LoadBalancerArn] = ln;
      const props = { Type: alb.Type || "application", Scheme: alb.Scheme || "internet-facing" };
      if (alb.LoadBalancerName) props.Name = alb.LoadBalancerName;
      const albSubs = (alb.AvailabilityZones || []).map((az) => az.SubnetId).filter(Boolean);
      if (albSubs.length) props.Subnets = albSubs.map((s) => cfnRef(s));
      const albSgs = alb.SecurityGroups || [];
      if (albSgs.length) props.SecurityGroups = albSgs.map((s) => cfnRef(s));
      template.Resources[ln] = { Type: "AWS::ElasticLoadBalancingV2::LoadBalancer", Properties: props };
    });
    rdsInstances.forEach((rds) => {
      const ln = cfnName({ Tags: [{ Key: "Name", Value: rds.DBInstanceIdentifier }] }, "RDS");
      cfnIdMap[rds.DBInstanceIdentifier] = ln;
      const props = { DBInstanceIdentifier: rds.DBInstanceIdentifier };
      if (rds.Engine) props.Engine = rds.Engine;
      if (rds.EngineVersion) props.EngineVersion = rds.EngineVersion;
      if (rds.DBInstanceClass) props.DBInstanceClass = rds.DBInstanceClass;
      if (rds.AllocatedStorage) props.AllocatedStorage = String(rds.AllocatedStorage);
      if (rds.MultiAZ) props.MultiAZ = true;
      props.MasterUsername = "admin";
      props.MasterUserPassword = "CHANGE_ME";
      template.Resources[ln] = { Type: "AWS::RDS::DBInstance", Properties: props };
    });
    vpcs.forEach((vpc) => {
      const ln = cfnIdMap[vpc.VpcId];
      if (ln) {
        template.Outputs[ln + "Id"] = { Value: { "Ref": ln }, Description: "VPC ID for " + ln };
      }
    });
    const format = opts.format || "yaml";
    let code;
    if (format === "json") {
      code = JSON.stringify(template, null, 2);
    } else {
      code = _serializeCfnYaml(template);
    }
    if (sgCycles.length) warnings.push(sgCycles.length + " circular SG reference(s) detected. Rules split into standalone resources.");
    _iacOutput = code;
    return { code, warnings, stats: { resources: Object.keys(template.Resources).length } };
  }
  function _ckId(name, prefix, seen) {
    var base = (name || prefix || "Res").replace(/[^a-zA-Z0-9]/g, "");
    if (!base || /^\d/.test(base)) base = (prefix || "R") + base;
    var id = base, i = 2;
    while (seen.has(id)) {
      id = base + i;
      i++;
    }
    seen.add(id);
    return id;
  }
  function _ckVpcs(vpcs, res, seen) {
    vpcs.forEach(function(v) {
      var id = _ckId(gn(v, v.VpcId), "VPC", seen);
      res[id] = { Type: "AWS::EC2::VPC", Properties: {
        CidrBlock: v.CidrBlock || "10.0.0.0/16",
        EnableDnsSupport: v.EnableDnsSupport !== false,
        EnableDnsHostnames: v.EnableDnsHostnames === true,
        Tags: _cfnTags(v)
      } };
    });
  }
  function _ckSubnets(subnets, res, seen) {
    subnets.forEach(function(s) {
      var id = _ckId(gn(s, s.SubnetId), "Subnet", seen);
      res[id] = { Type: "AWS::EC2::Subnet", Properties: {
        VpcId: s.VpcId,
        CidrBlock: s.CidrBlock,
        AvailabilityZone: s.AvailabilityZone || "",
        MapPublicIpOnLaunch: s.MapPublicIpOnLaunch === true,
        Tags: _cfnTags(s)
      } };
    });
  }
  function _ckExpandRules(perms) {
    var rules = [];
    (perms || []).forEach(function(p) {
      var base = { IpProtocol: p.IpProtocol || "-1" };
      if (p.FromPort != null) base.FromPort = p.FromPort;
      if (p.ToPort != null) base.ToPort = p.ToPort;
      (p.IpRanges || []).forEach(function(r) {
        rules.push(Object.assign({}, base, { CidrIp: r.CidrIp }));
      });
      (p.Ipv6Ranges || []).forEach(function(r) {
        rules.push(Object.assign({}, base, { CidrIpv6: r.CidrIpv6 }));
      });
      (p.UserIdGroupPairs || []).forEach(function(pair) {
        rules.push(Object.assign({}, base, { SourceSecurityGroupId: pair.GroupId }));
      });
      if (!(p.IpRanges || []).length && !(p.Ipv6Ranges || []).length && !(p.UserIdGroupPairs || []).length) rules.push(base);
    });
    return rules;
  }
  function _ckSgs(sgs, res, seen) {
    sgs.forEach(function(sg) {
      var id = _ckId(sg.GroupName || sg.GroupId, "SG", seen);
      res[id] = { Type: "AWS::EC2::SecurityGroup", Properties: {
        GroupDescription: sg.Description || sg.GroupName || "",
        VpcId: sg.VpcId,
        SecurityGroupIngress: _ckExpandRules(sg.IpPermissions),
        SecurityGroupEgress: _ckExpandRules(sg.IpPermissionsEgress),
        Tags: _cfnTags(sg)
      } };
    });
  }
  function _ckNacls(nacls, res, seen) {
    nacls.forEach(function(nacl) {
      var nId = _ckId(gn(nacl, nacl.NetworkAclId), "NACL", seen);
      res[nId] = { Type: "AWS::EC2::NetworkAcl", Properties: { VpcId: nacl.VpcId, Tags: _cfnTags(nacl) } };
      (nacl.Entries || []).forEach(function(e) {
        var eId = _ckId(nId + "Rule" + e.RuleNumber + (e.Egress ? "E" : "I"), "NACLEntry", seen);
        var props = {
          NetworkAclId: nacl.NetworkAclId,
          RuleNumber: e.RuleNumber,
          Protocol: String(e.Protocol),
          RuleAction: e.RuleAction,
          Egress: e.Egress === true
        };
        if (e.CidrBlock) props.CidrBlock = e.CidrBlock;
        if (e.Ipv6CidrBlock) props.Ipv6CidrBlock = e.Ipv6CidrBlock;
        if (e.PortRange) props.PortRange = { From: e.PortRange.From, To: e.PortRange.To };
        res[eId] = { Type: "AWS::EC2::NetworkAclEntry", Properties: props };
      });
    });
  }
  function _ckRts(rts, res, seen) {
    rts.forEach(function(rt) {
      var rtId = _ckId(gn(rt, rt.RouteTableId), "RT", seen);
      res[rtId] = { Type: "AWS::EC2::RouteTable", Properties: { VpcId: rt.VpcId, Tags: _cfnTags(rt) } };
      (rt.Routes || []).forEach(function(r) {
        if (r.GatewayId === "local") return;
        var rId = _ckId(rtId + (r.DestinationCidrBlock || "").replace(/[^a-zA-Z0-9]/g, ""), "Route", seen);
        var props = { RouteTableId: rt.RouteTableId };
        if (r.DestinationCidrBlock) props.DestinationCidrBlock = r.DestinationCidrBlock;
        if (r.GatewayId) props.GatewayId = r.GatewayId;
        if (r.NatGatewayId) props.NatGatewayId = r.NatGatewayId;
        if (r.VpcEndpointId) props.VpcEndpointId = r.VpcEndpointId;
        res[rId] = { Type: "AWS::EC2::Route", Properties: props };
      });
    });
  }
  function _ckEc2(instances, ctx, res, seen) {
    instances.forEach(function(inst) {
      var id = _ckId(gn(inst, inst.InstanceId), "EC2", seen);
      var props = {
        InstanceType: inst.InstanceType || "t3.micro",
        SubnetId: inst.SubnetId || "",
        SecurityGroupIds: (inst.SecurityGroups || []).map(function(s) {
          return s.GroupId;
        }),
        ImageId: inst.ImageId || "",
        Tags: _cfnTags(inst)
      };
      var mo = inst.MetadataOptions || {};
      props.MetadataOptions = { HttpTokens: mo.HttpTokens || "optional", HttpEndpoint: mo.HttpEndpoint || "enabled" };
      if (inst.IamInstanceProfile) props.IamInstanceProfile = inst.IamInstanceProfile.Arn || "";
      if (inst.BlockDeviceMappings && inst.BlockDeviceMappings.length) {
        props.BlockDeviceMappings = inst.BlockDeviceMappings.map(function(b) {
          var r = { DeviceName: b.DeviceName || "/dev/xvda" };
          if (b.Ebs) r.Ebs = { Encrypted: b.Ebs.Encrypted === true, VolumeSize: b.Ebs.VolumeSize || 8, VolumeType: b.Ebs.VolumeType || "gp3" };
          return r;
        });
      }
      res[id] = { Type: "AWS::EC2::Instance", Properties: props };
    });
  }
  function _ckRds(rdsInstances, res, seen) {
    rdsInstances.forEach(function(db) {
      var id = _ckId(db.DBInstanceIdentifier, "RDS", seen);
      res[id] = { Type: "AWS::RDS::DBInstance", Properties: {
        DBInstanceIdentifier: db.DBInstanceIdentifier,
        Engine: db.Engine || "",
        EngineVersion: db.EngineVersion || "",
        DBInstanceClass: db.DBInstanceClass || "db.t3.micro",
        StorageEncrypted: db.StorageEncrypted === true,
        PubliclyAccessible: db.PubliclyAccessible === true,
        MultiAZ: db.MultiAZ === true,
        BackupRetentionPeriod: db.BackupRetentionPeriod || 0,
        StorageType: db.StorageType || "gp2",
        AllocatedStorage: db.AllocatedStorage || 20,
        MasterUsername: "admin"
      } };
    });
  }
  function _ckS3(buckets, res, seen) {
    buckets.forEach(function(bk) {
      var id = _ckId(bk.Name, "S3", seen);
      var props = { BucketName: bk.Name };
      if (bk.BucketEncryption) props.BucketEncryption = bk.BucketEncryption;
      if (bk.VersioningConfiguration) props.VersioningConfiguration = bk.VersioningConfiguration;
      res[id] = { Type: "AWS::S3::Bucket", Properties: props };
    });
  }
  function _ckAlbs(albs, res, seen) {
    albs.forEach(function(alb) {
      var id = _ckId(alb.LoadBalancerName || alb.LoadBalancerArn, "ALB", seen);
      var props = { Type: alb.Type || "application", Scheme: alb.Scheme || "internet-facing" };
      if (alb.SecurityGroups) props.SecurityGroups = alb.SecurityGroups;
      if (alb.Subnets) props.Subnets = alb.Subnets;
      else if (alb.AvailabilityZones) props.Subnets = alb.AvailabilityZones.map(function(az) {
        return az.SubnetId;
      }).filter(Boolean);
      res[id] = { Type: "AWS::ElasticLoadBalancingV2::LoadBalancer", Properties: props };
    });
  }
  function _ckLambda(fns, res, seen) {
    fns.forEach(function(fn) {
      var id = _ckId(fn.FunctionName, "Lambda", seen);
      var props = {
        FunctionName: fn.FunctionName,
        Runtime: fn.Runtime || "",
        Handler: fn.Handler || "index.handler",
        MemorySize: fn.MemorySize || 128,
        Timeout: fn.Timeout || 3,
        Role: fn.Role || "arn:aws:iam::111222333444:role/LambdaRole",
        Code: { ZipFile: "exports.handler=async()=>({})" }
      };
      if (fn.VpcConfig && fn.VpcConfig.SubnetIds && fn.VpcConfig.SubnetIds.length) {
        props.VpcConfig = { SubnetIds: fn.VpcConfig.SubnetIds, SecurityGroupIds: fn.VpcConfig.SecurityGroupIds || [] };
      }
      res[id] = { Type: "AWS::Lambda::Function", Properties: props };
    });
  }
  function _ckIamRoles(roles, res, seen) {
    roles.forEach(function(role) {
      var id = _ckId(role.RoleName, "Role", seen);
      var props = {
        RoleName: role.RoleName,
        AssumeRolePolicyDocument: role.AssumeRolePolicyDocument || { Version: "2012-10-17", Statement: [] }
      };
      var managed = (role.AttachedManagedPolicies || []).map(function(p) {
        return p.PolicyArn;
      }).filter(Boolean);
      if (managed.length) props.ManagedPolicyArns = managed;
      if (role.RolePolicyList && role.RolePolicyList.length) {
        props.Policies = role.RolePolicyList.map(function(p) {
          return { PolicyName: p.PolicyName, PolicyDocument: p.PolicyDocument || {} };
        });
      }
      res[id] = { Type: "AWS::IAM::Role", Properties: props };
    });
  }
  function _ckIamUsers(users, res, seen) {
    users.forEach(function(user) {
      var id = _ckId(user.UserName, "User", seen);
      var props = { UserName: user.UserName };
      var managed = (user.AttachedManagedPolicies || []).map(function(p) {
        return p.PolicyArn;
      }).filter(Boolean);
      if (managed.length) props.ManagedPolicyArns = managed;
      if (user.UserPolicyList && user.UserPolicyList.length) {
        props.Policies = user.UserPolicyList.map(function(p) {
          return { PolicyName: p.PolicyName, PolicyDocument: p.PolicyDocument || {} };
        });
      }
      res[id] = { Type: "AWS::IAM::User", Properties: props };
    });
  }
  function _ckElastiCache(clusters, res, seen) {
    clusters.forEach(function(c) {
      var id = _ckId(c.CacheClusterId, "Cache", seen);
      res[id] = { Type: "AWS::ElastiCache::CacheCluster", Properties: {
        Engine: c.Engine || "redis",
        CacheNodeType: c.CacheNodeType || "cache.t3.micro",
        NumCacheNodes: c.NumCacheNodes || 1,
        AtRestEncryptionEnabled: c.AtRestEncryptionEnabled === true,
        TransitEncryptionEnabled: c.TransitEncryptionEnabled === true
      } };
    });
  }
  function _ckRedshift(clusters, res, seen) {
    clusters.forEach(function(c) {
      var id = _ckId(c.ClusterIdentifier, "Redshift", seen);
      res[id] = { Type: "AWS::Redshift::Cluster", Properties: {
        ClusterIdentifier: c.ClusterIdentifier,
        NodeType: c.NodeType || "dc2.large",
        NumberOfNodes: c.NumberOfNodes || 1,
        Encrypted: c.Encrypted === true,
        PubliclyAccessible: c.PubliclyAccessible === true,
        MasterUsername: "admin",
        MasterUserPassword: "placeholder",
        DBName: c.DBName || "dev"
      } };
    });
  }
  function generateCheckovCfn(ctx, iamData) {
    if (!ctx || !ctx.vpcs) return null;
    var template = {
      AWSTemplateFormatVersion: "2010-09-09",
      Description: "Generated by AWS Mapper for Checkov scanning \u2014 " + (/* @__PURE__ */ new Date()).toISOString().split("T")[0],
      Resources: {}
    };
    var res = template.Resources, seen = /* @__PURE__ */ new Set();
    _ckVpcs(ctx.vpcs || [], res, seen);
    _ckSubnets(ctx.subnets || [], res, seen);
    _ckSgs(ctx.sgs || [], res, seen);
    _ckNacls(ctx.nacls || [], res, seen);
    _ckRts(ctx.rts || [], res, seen);
    _ckEc2(ctx.instances || [], ctx, res, seen);
    _ckRds(ctx.rdsInstances || [], res, seen);
    _ckS3(ctx.s3bk || [], res, seen);
    _ckAlbs(ctx.albs || [], res, seen);
    _ckLambda(ctx.lambdaFns || [], res, seen);
    _ckElastiCache(ctx.ecacheClusters || [], res, seen);
    _ckRedshift(ctx.redshiftClusters || [], res, seen);
    if (iamData) {
      _ckIamRoles(iamData.roles || [], res, seen);
      _ckIamUsers(iamData.users || [], res, seen);
    }
    return JSON.stringify(template, null, 2);
  }
  function _serializeCfnYaml(obj, indent) {
    indent = indent || 0;
    const pad = "  ".repeat(indent);
    const lines = [];
    if (obj === null || obj === void 0) return "null";
    if (typeof obj === "boolean") return obj ? "true" : "false";
    if (typeof obj === "number") return String(obj);
    if (typeof obj === "string") {
      if (obj.includes("\n")) return "|\n" + obj.split("\n").map((l) => pad + "  " + l).join("\n");
      if (obj.match(/[:{}\[\],&*?|>!%@`#'"]/) || obj === "" || obj === "true" || obj === "false" || !isNaN(obj)) return "'" + obj.replace(/'/g, "''") + "'";
      return obj;
    }
    if (Array.isArray(obj)) {
      if (obj.length === 0) return "[]";
      if (obj.every((v) => typeof v === "string" || typeof v === "number" || typeof v === "boolean")) {
        return "[" + obj.map((v) => {
          if (typeof v === "string") return "'" + v.replace(/'/g, "''") + "'";
          return String(v);
        }).join(", ") + "]";
      }
      obj.forEach((item) => {
        if (typeof item === "object" && item !== null && !Array.isArray(item)) {
          const keys = Object.keys(item);
          if (keys.length) {
            lines.push(pad + "- " + keys[0] + ": " + _serializeCfnYaml(item[keys[0]], indent + 2));
            keys.slice(1).forEach((k) => {
              lines.push(pad + "  " + k + ": " + _serializeCfnYaml(item[k], indent + 2));
            });
          } else {
            lines.push(pad + "- {}");
          }
        } else {
          lines.push(pad + "- " + _serializeCfnYaml(item, indent + 1));
        }
      });
      return "\n" + lines.join("\n");
    }
    if (typeof obj === "object") {
      const keys = Object.keys(obj);
      if (keys.length === 1 && keys[0] === "Ref") return "!Ref " + obj.Ref;
      if (keys.length === 1 && keys[0] === "Fn::GetAtt") return "!GetAtt " + obj["Fn::GetAtt"].join(".");
      if (keys.length === 1 && keys[0] === "Fn::Sub") return "!Sub " + _serializeCfnYaml(obj["Fn::Sub"], indent);
      if (keys.length === 0) return "{}";
      keys.forEach((k) => {
        const val = obj[k];
        if (val === null || val === void 0) return;
        if (typeof val === "object" && !Array.isArray(val) && Object.keys(val).length > 0) {
          const vkeys = Object.keys(val);
          if (vkeys.length === 1 && vkeys[0] === "Ref") {
            lines.push(pad + k + ": !Ref " + val.Ref);
          } else if (vkeys.length === 1 && vkeys[0] === "Fn::GetAtt") {
            lines.push(pad + k + ": !GetAtt " + val["Fn::GetAtt"].join("."));
          } else {
            lines.push(pad + k + ":");
            lines.push(_serializeCfnYaml(val, indent + 1));
          }
        } else if (Array.isArray(val)) {
          const ser = _serializeCfnYaml(val, indent + 1);
          if (ser.startsWith("\n")) {
            lines.push(pad + k + ":" + ser);
          } else {
            lines.push(pad + k + ": " + ser);
          }
        } else {
          lines.push(pad + k + ": " + _serializeCfnYaml(val, indent + 1));
        }
      });
      return lines.join("\n");
    }
    return String(obj);
  }
  function highlightHCL(code) {
    code = code.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return code.split("\n").map((line) => {
      if (line.match(/^\s*#/)) return '<span class="hcl-cmt">' + line + "</span>";
      line = line.replace(/"([^"]*)"/g, function(_, s) {
        return '"<span class="hcl-str">' + s + '</span>"';
      });
      line = line.replace(/\b(resource|variable|data|module|provider|output|terraform|required_providers|import|locals|dynamic)\b/g, '<span class="hcl-kw">$1</span>');
      line = line.replace(/\b(string|number|bool|list|map|set|object|any)\b/g, '<span class="hcl-type">$1</span>');
      line = line.replace(/= (\d+)$/g, '= <span class="hcl-num">$1</span>');
      line = line.replace(/\b(true|false|null)\b/g, '<span class="hcl-num">$1</span>');
      line = line.replace(/(aws_[a-z_]+\.[a-z_0-9]+\.[a-z_]+)/g, '<span class="hcl-ref">$1</span>');
      return line;
    }).join("\n");
  }
  function highlightYAML(code) {
    code = code.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return code.split("\n").map((line) => {
      if (line.match(/^\s*#/)) return '<span class="hcl-cmt">' + line + "</span>";
      line = line.replace(/(!Ref|!GetAtt|!Sub|!Select|!Join|!If)\b/g, '<span class="hcl-kw">$1</span>');
      line = line.replace(/(AWS::[A-Za-z0-9:]+)/g, '<span class="hcl-type">$1</span>');
      line = line.replace(/'([^']*)'/g, `'<span class="hcl-str">$1</span>'`);
      line = line.replace(/\b(true|false|null)\b/g, '<span class="hcl-num">$1</span>');
      return line;
    }).join("\n");
  }
  if (typeof window !== "undefined") {
    window.getIacType = getIacType;
    window.setIacType = setIacType;
    window.getIacOutput = getIacOutput;
    window.setIacOutput = setIacOutput;
    window.getTfIdMap = getTfIdMap;
    window.setTfIdMap = setTfIdMap;
    window._sanitizeName = sanitizeName;
    window._tfName = _tfName;
    window._tfRef = _tfRef;
    window.detectCircularSGs = detectCircularSGs;
    window._writeTags = _writeTags;
    window._writeSGRule = _writeSGRule;
    window._writeSGRuleFlat = _writeSGRuleFlat;
    window.generateTerraform = generateTerraform;
    window.generateCloudFormation = generateCloudFormation;
    window._cfnTags = _cfnTags;
    window._cfnSGRule = _cfnSGRule;
    window._cfnSGRuleProps = _cfnSGRuleProps;
    window._serializeCfnYaml = _serializeCfnYaml;
    window.highlightHCL = highlightHCL;
    window.highlightYAML = highlightYAML;
    window._highlightHCL = highlightHCL;
    window._highlightYAML = highlightYAML;
    window._ckId = _ckId;
    window._ckVpcs = _ckVpcs;
    window._ckSubnets = _ckSubnets;
    window._ckExpandRules = _ckExpandRules;
    window._ckSgs = _ckSgs;
    window._ckNacls = _ckNacls;
    window._ckRts = _ckRts;
    window._ckEc2 = _ckEc2;
    window._ckRds = _ckRds;
    window._ckS3 = _ckS3;
    window._ckAlbs = _ckAlbs;
    window._ckLambda = _ckLambda;
    window._ckIamRoles = _ckIamRoles;
    window._ckIamUsers = _ckIamUsers;
    window._ckElastiCache = _ckElastiCache;
    window._ckRedshift = _ckRedshift;
    window.generateCheckovCfn = generateCheckovCfn;
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
    generateDemo,
    // Network rules
    ipToNum,
    ipFromCidr,
    nrCidrContains: cidrContains2,
    protoMatch,
    portInRange,
    protoName,
    evaluateRouteTable,
    evaluateNACL,
    evaluateSG,
    // Shared state
    State: state_exports,
    // DOM builders
    buildEl,
    buildOption,
    buildSelect,
    buildButton,
    setText,
    replaceChildren,
    safeHtml,
    // BUDR engine
    _BUDR_STRATEGY,
    _BUDR_STRATEGY_ORDER,
    _BUDR_STRATEGY_LEGEND,
    _BUDR_RTO_RPO,
    _BUDR_EST_MINUTES,
    _TIER_TARGETS,
    runBUDRChecks: runBUDRChecks2,
    _budrTierCompliance,
    _fmtMin,
    _enrichBudrWithClassification,
    _reapplyBUDROverrides,
    _getBUDRTierCounts,
    _getBudrComplianceCounts,
    _budrFindings: budrFindings,
    _budrAssessments: budrAssessments,
    _budrOverrides: budrOverrides,
    setBudrFindings,
    setBudrAssessments,
    setBudrOverrides,
    // Dependency graph
    buildDependencyGraph,
    getBlastRadius,
    getResType,
    getResName,
    clearBlastRadius,
    resetDepGraph,
    isBlastActive,
    // IAM engine
    _stmtArr,
    _safePolicyParse,
    parseIAMData: parseIAMData2,
    getIAMAccessForVpc,
    runIAMChecks: runIAMChecks2,
    _iamData,
    _showIAM,
    setIamData,
    setShowIAM,
    getIamData,
    getShowIAM,
    // Timeline & Annotations
    Timeline: timeline_exports,
    // Phase 3: Feature Engines
    DesignMode: design_mode_exports,
    FlowTracing: flow_tracing_exports,
    FlowAnalysis: flow_analysis_exports,
    FirewallEditor: firewall_editor_exports,
    MultiAccount: multi_account_exports,
    // Phase 4: Dashboards & Reports
    ComplianceView: compliance_view_exports,
    UnifiedDashboard: unified_dashboard_exports,
    Governance: governance_exports,
    // Phase 5: Core
    ExportUtils: export_utils_exports,
    IacGenerator: iac_generator_exports
    // Note: diff/report code lives in app-core.js; pure diff logic in src/core/diff-logic.js
  };
  Object.assign(window, window.AppModules);
  if (!window._complianceFindings) window._complianceFindings = [];
  console.log("AWS Network Mapper modules loaded");
})();
//# sourceMappingURL=app.bundle.js.map
