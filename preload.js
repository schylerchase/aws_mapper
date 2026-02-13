const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Feature detection
  isElectron: true,

  // ── File Operations ───────────────────────────────────────────

  saveFile: (data, defaultName) =>
    ipcRenderer.invoke('file:save', { data, defaultName }),

  openFile: () =>
    ipcRenderer.invoke('file:open'),

  openFolder: () =>
    ipcRenderer.invoke('file:open-folder'),

  exportFile: (data, defaultName, filters) =>
    ipcRenderer.invoke('file:export', { data, defaultName, filters }),

  // ── AWS CLI ───────────────────────────────────────────────────

  checkCli: () =>
    ipcRenderer.invoke('aws:check-cli'),

  scanAWS: (opts) =>
    ipcRenderer.invoke('aws:scan', opts),

  abortScan: () =>
    ipcRenderer.send('aws:scan:abort'),

  // ── Event Listeners (return unsubscribe function) ─────────────

  onScanProgress: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('aws:scan:progress', handler);
    return () => ipcRenderer.removeListener('aws:scan:progress', handler);
  },

  onScanComplete: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('aws:scan:complete', handler);
    return () => ipcRenderer.removeListener('aws:scan:complete', handler);
  },

  onScanError: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('aws:scan:error', handler);
    return () => ipcRenderer.removeListener('aws:scan:error', handler);
  },

  onUpdateAvailable: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('update:available', handler);
    return () => ipcRenderer.removeListener('update:available', handler);
  },

  // Menu triggers (main process → renderer)
  onMenuSave: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('menu:save', handler);
    return () => ipcRenderer.removeListener('menu:save', handler);
  },

  onMenuOpen: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('menu:open', handler);
    return () => ipcRenderer.removeListener('menu:open', handler);
  },

  onMenuScanAWS: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('menu:scan-aws', handler);
    return () => ipcRenderer.removeListener('menu:scan-aws', handler);
  },

  onFileOpened: (callback) => {
    const handler = (_event, content) => callback(content);
    ipcRenderer.on('file:opened', handler);
    return () => ipcRenderer.removeListener('file:opened', handler);
  }
});
