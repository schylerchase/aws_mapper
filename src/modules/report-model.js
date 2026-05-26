export function getEnabledReportModuleIds(reportModules, order) {
  const moduleOrder = order || reportModules.map((module) => module.id);

  return moduleOrder.filter((id) => {
    const module = reportModules.find((candidate) => candidate.id === id);
    return !!(module && module.enabled && module.available());
  });
}

export function normalizeReportContexts(contexts) {
  return (contexts || []).map((context) => ({
    accountId: context.accountId,
    accountLabel: context.accountLabel,
    region: context.region
  }));
}

export function stripPrivateInventoryFields(rows) {
  return (rows || []).map((row) => {
    const copy = {};
    Object.keys(row).forEach((key) => {
      if (key !== '_raw' && key !== '_related') copy[key] = row[key];
    });
    return copy;
  });
}

export function normalizeIamReviewData(rows) {
  return (rows || []).map((row) => {
    const copy = {};
    Object.keys(row).forEach((key) => {
      if (key !== '_raw') copy[key] = normalizeReportDate(row[key]);
    });
    return copy;
  });
}

export function buildReportDataBlob({
  title,
  author,
  date,
  enabledModules,
  contexts,
  findings,
  budrAssessments,
  budrFindings,
  inventoryData,
  iamReviewData,
  appRegistry
}) {
  return {
    _rptFormat: 'awsmapper-report',
    _rptVersion: '1.0',
    title: title || 'AWS Infrastructure Assessment',
    author: author || '',
    date: date || '',
    enabledModules: enabledModules || [],
    contexts: contexts || [],
    findings: findings || [],
    budrAssessments: budrAssessments || [],
    budrFindings: budrFindings || [],
    inventoryData: stripPrivateInventoryFields(inventoryData || []),
    iamReviewData: normalizeIamReviewData(iamReviewData || []),
    appRegistry: appRegistry || []
  };
}

function normalizeReportDate(value) {
  if (value instanceof Date) return value.toISOString().split('T')[0];
  return value;
}
