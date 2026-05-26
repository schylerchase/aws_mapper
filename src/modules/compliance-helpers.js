// Small compliance helpers shared by rule engines and tests.

export const CHECKOV_ID_BY_CONTROL = {
  'CIS 5.2': 'CKV_AWS_24',
  'CIS 5.3': 'CKV_AWS_25',
  'CIS 5.4': 'CKV_AWS_277',
  'NET-2': 'CKV_AWS_260',
  'ARCH-C2': 'CKV_AWS_189',
  'ARCH-D1': 'CKV_AWS_17',
  'ARCH-D2': 'CKV_AWS_157',
  'ARCH-D3': 'CKV_AWS_16',
  'ARCH-D5': 'CKV_AWS_64',
  'ARCH-D6': 'CKV_AWS_29',
  'ARCH-D7': 'CKV_AWS_142',
  'ARCH-S1': 'CKV_AWS_19',
  'ARCH-E2': 'CKV_AWS_34',
  'ARCH-C4': 'CKV_AWS_363',
  'SOC2-CC7.2': 'CKV_AWS_126',
  'SOC2-C1.2': 'CKV_AWS_3',
  'SOC2-C1.3': 'CKV_AWS_30',
  'PCI-3.4.1': 'CKV_AWS_3',
  'PCI-10.2.1': 'CKV_AWS_126',
  'PCI-11.3.1': 'CKV_AWS_17',
  'IAM-1': 'CKV_AWS_274',
  'IAM-3': 'CKV_AWS_36',
  'IAM-11': 'CKV_AWS_273',
  'IAM-13': 'CKV_AWS_56',
  'CIS-2.1': 'CKV_AWS_252',
  'CIS-2.2': 'CKV_AWS_36',
  'CIS-2.3': 'CKV_AWS_35',
  'CIS-2.7': 'CKV_AWS_126',
  'GOV-KMS1': 'CKV_AWS_7',
  'GOV-ECR1': 'CKV_AWS_51',
  'GOV-ECR2': 'CKV_AWS_163'
};

const tagNameCache = new WeakMap();

export function buildFinding({
  severity,
  code,
  framework,
  resource,
  resourceName,
  message,
  remediation
}) {
  return {
    severity,
    control: code,
    framework,
    resource,
    resourceName,
    message,
    remediation
  };
}

export function annotateCheckovIds(findings) {
  (findings || []).forEach((finding) => {
    const checkovId = CHECKOV_ID_BY_CONTROL[finding.control];
    if (checkovId) finding.ckv = checkovId;
  });
  return findings;
}

export function getTaggedName(resource, fallback) {
  if (!resource) return fallback;

  const cached = tagNameCache.get(resource);
  if (cached !== undefined) return cached || fallback;

  const tags = resource.Tags || resource.tags || [];
  const nameTag = tags.find((tag) => tag.Key === 'Name');
  const name = nameTag ? nameTag.Value : '';

  tagNameCache.set(resource, name);
  return name || fallback;
}

export function hasOpenCidr(permission) {
  return (
    (permission.IpRanges || []).some((range) => range.CidrIp === '0.0.0.0/0') ||
    (permission.Ipv6Ranges || []).some((range) => range.CidrIpv6 === '::/0')
  );
}

export function hasPort(permission, port) {
  if (permission.IpProtocol === '-1') return true;

  const protocol = String(permission.IpProtocol);
  if (!['6', '17', 'tcp', 'udp'].includes(protocol)) return false;

  const fromPort = permission.FromPort;
  const toPort = permission.ToPort;
  if (fromPort === undefined || toPort === undefined) return false;

  return fromPort <= port && toPort >= port;
}

export function naclCoversPort(entry, port) {
  if (entry.Protocol === '-1') return true;

  const protocol = parseInt(entry.Protocol, 10);
  if (protocol !== 6 && protocol !== 17) return false;

  const range = entry.PortRange;
  if (!range || range.From === undefined || range.To === undefined) return false;

  return range.From <= port && range.To >= port;
}

export function hasEnvironmentVariablesWithoutKms(fn) {
  const variables = fn.Environment && fn.Environment.Variables;
  return !!(variables && Object.keys(variables).length > 0 && !fn.KMSKeyArn);
}
