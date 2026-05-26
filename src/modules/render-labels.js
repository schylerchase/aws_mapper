export function buildVpcHeaderLabels({
  vpc,
  width,
  region,
  isMultiAccount,
  nameOf,
  nameLengthRatio = 0.7,
  accountSeparator = ' | '
}) {
  const name = getResourceName(vpc, vpc && vpc.VpcId, nameOf);
  const accountId = vpc && vpc._accountId;
  const accountTag =
    isMultiAccount && accountId && accountId !== 'default' ? ' [' + accountId + ']' : '';
  const regionText = region ? accountSeparator + region : '';

  return {
    name,
    cidrLine: String((vpc && vpc.CidrBlock) || '') + regionText + accountTag,
    nameTextLength: getLabelTextLength(name, width, nameLengthRatio)
  };
}

export function buildAccountStripeLabel({ accountId, accountLabel, height }) {
  const label = accountLabel || accountId || '';
  const maxChars = Math.floor((height || 0) / 7);

  if (!label || label.length <= maxChars) return label;
  if (maxChars <= 3) return label.slice(0, Math.max(0, maxChars));

  return label.slice(0, maxChars - 3) + '...';
}

export function buildSubnetHeaderLabels({ subnet, isPublic, nameOf, exposureStyle = 'long' }) {
  const az = (subnet && subnet.AvailabilityZone) || '';
  const cidr = (subnet && subnet.CidrBlock) || '';
  const azSeparator = exposureStyle === 'long' ? '  ' : ' ';
  const exposureLabel = isPublic
    ? exposureStyle === 'short'
      ? 'PUB'
      : 'PUBLIC'
    : exposureStyle === 'short'
      ? 'PRV'
      : 'PRIVATE';

  return {
    name: getResourceName(subnet, subnet && subnet.SubnetId, nameOf),
    cidrLine: cidr + (az ? azSeparator + az.slice(-2) : ''),
    exposureLabel
  };
}

export function formatAzSeparatorLabel(availabilityZone) {
  return (
    'AZ: ' +
    String(availabilityZone || '')
      .slice(-2)
      .toUpperCase()
  );
}

export function getLabelTextLength(text, width, ratio = 0.7, charWidth = 8) {
  return Math.min(String(text || '').length * charWidth, (width || 0) * ratio);
}

function getResourceName(resource, fallback, nameOf) {
  if (typeof nameOf === 'function') return nameOf(resource || {}, fallback || '');
  return fallback || '';
}
