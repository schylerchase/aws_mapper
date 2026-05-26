export function parseProjectTextareaValue(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return null;

  try {
    return JSON.parse(trimmed);
  } catch (e) {
    return trimmed;
  }
}

export function collectProjectTextareas(textareaElements) {
  const textareas = {};

  Array.from(textareaElements || []).forEach((el) => {
    const parsed = parseProjectTextareaValue(el.value);
    if (parsed !== null) textareas[el.id] = parsed;
  });

  return textareas;
}

export function buildProjectSnapshot(options = {}) {
  const loadedContexts = options.loadedContexts || [];
  const project = {
    _format: 'awsmap',
    _version: loadedContexts.length > 1 ? '2.0' : '1.0',
    created: options.created || new Date().toISOString(),
    accountLabel: options.accountLabel || '',
    layout: options.layout || 'grid',
    hubVpcName: options.hubVpcName || '',
    textareas: options.textareas || {},
    preferences: options.preferences || {},
    designChanges: getPortableDesignChanges(options.designChanges || []),
    designMode: !!options.designMode,
    designRegion: options.designRegion || 'us-east-1',
    annotations: options.annotations || {}
  };

  if (options.budrOverrides && Object.keys(options.budrOverrides).length) {
    project.budrOverrides = options.budrOverrides;
  }

  if (loadedContexts.length > 1) {
    project.accounts = loadedContexts.map((context) => ({
      id: context.accountId || context.id,
      label: context.accountLabel || context.label,
      region: context.region,
      textareas: context.textareas
    }));
    project.multiViewMode = !!options.multiViewMode;
  }

  return project;
}

export function getProjectDownloadName(accountLabel) {
  const safeName = (accountLabel || 'aws-project').replace(/[^a-zA-Z0-9_-]/g, '_');
  return safeName + '.awsmap';
}

export function isProjectFile(project) {
  return !!(project && (project.textareas || project._format));
}

function getPortableDesignChanges(designChanges) {
  return designChanges
    .filter((change) => !change._invalid)
    .map((change) => ({
      id: change.id,
      action: change.action,
      target: change.target,
      params: change.params,
      timestamp: change.timestamp
    }));
}
