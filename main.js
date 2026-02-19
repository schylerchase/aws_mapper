const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn, execSync } = require('child_process');

app.setName('AWS Network Mapper');

let mainWindow = null;
let activeScan = null;
const SAFE_INPUT = /^[a-zA-Z0-9_-]{0,64}$/;

// ── Window ────────────────────────────────────────────────────────

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 900,
    minHeight: 600,
    title: 'AWS Network Mapper',
    icon: path.join(__dirname, 'build', 'icon.png'),
    backgroundColor: '#0b1120',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile('index.html');

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ── Menus ─────────────────────────────────────────────────────────

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    }] : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'Save Project',
          accelerator: 'CmdOrCtrl+S',
          click: () => mainWindow?.webContents.send('menu:save')
        },
        {
          label: 'Open Project',
          accelerator: 'CmdOrCtrl+O',
          click: () => mainWindow?.webContents.send('menu:open')
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { role: 'resetZoom' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        ...(!app.isPackaged ? [{ type: 'separator' }, { role: 'toggleDevTools' }] : [])
      ]
    },
    {
      label: 'Tools',
      submenu: [
        {
          label: 'Scan AWS Account...',
          accelerator: 'CmdOrCtrl+Shift+A',
          click: () => mainWindow?.webContents.send('menu:scan-aws')
        },
        { type: 'separator' },
        {
          label: 'Check for Updates...',
          click: () => checkForUpdates(true)
        }
      ]
    }
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ── IPC: File Operations ──────────────────────────────────────────

ipcMain.handle('file:save', async (event, { data, defaultName }) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save Project',
    defaultPath: defaultName || 'aws-project.awsmap',
    filters: [
      { name: 'AWS Map Project', extensions: ['awsmap'] },
      { name: 'JSON', extensions: ['json'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  if (result.canceled || !result.filePath) return null;
  fs.writeFileSync(result.filePath, data, 'utf8');
  return result.filePath;
});

ipcMain.handle('file:open', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Open Project',
    filters: [
      { name: 'AWS Map Project', extensions: ['awsmap', 'json'] },
      { name: 'All Files', extensions: ['*'] }
    ],
    properties: ['openFile']
  });
  if (result.canceled || !result.filePaths.length) return null;
  return fs.readFileSync(result.filePaths[0], 'utf8');
});

ipcMain.handle('file:open-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select AWS Export Folder',
    properties: ['openDirectory']
  });
  if (result.canceled || !result.filePaths.length) return null;
  const dir = result.filePaths[0];
  const regionRe = /^[a-z]{2}-(north|south|east|west|central|northeast|southeast|northwest|southwest)-\d+$/;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const regions = {};
  const flatFiles = {};
  for (const ent of entries) {
    if (ent.isDirectory() && regionRe.test(ent.name)) {
      const regionDir = path.join(dir, ent.name);
      const regionFiles = {};
      for (const f of fs.readdirSync(regionDir)) {
        if (f.endsWith('.json')) {
          regionFiles[f] = fs.readFileSync(path.join(regionDir, f), 'utf8');
        }
      }
      if (Object.keys(regionFiles).length) regions[ent.name] = regionFiles;
    } else if (ent.isFile() && ent.name.endsWith('.json')) {
      flatFiles[ent.name] = fs.readFileSync(path.join(dir, ent.name), 'utf8');
    }
  }
  if (Object.keys(regions).length) {
    return { _structure: 'multi-region', regions };
  }
  return { _structure: 'flat', files: flatFiles };
});

// ── IPC: AWS CLI Scan ─────────────────────────────────────────────

function checkAwsCli() {
  try {
    execSync('/usr/bin/which aws', { encoding: 'utf8', env: { ...process.env, PATH: process.env.PATH + ':/usr/local/bin:/opt/homebrew/bin' } });
    return true;
  } catch { return false; }
}

ipcMain.handle('aws:check-cli', () => checkAwsCli());

ipcMain.handle('aws:scan', async (event, { profile, region }) => {
  if (!checkAwsCli()) {
    event.sender.send('aws:scan:error', 'AWS CLI not found. Install it from https://aws.amazon.com/cli/');
    return;
  }

  // Validate inputs to prevent command injection
  if (profile && !SAFE_INPUT.test(profile)) {
    event.sender.send('aws:scan:error', 'Invalid profile name. Use only letters, numbers, hyphens, underscores.');
    return;
  }
  if (region && !SAFE_INPUT.test(region)) {
    event.sender.send('aws:scan:error', 'Invalid region name. Use only letters, numbers, hyphens, underscores.');
    return;
  }

  const scriptPath = path.join(__dirname, 'export-aws-data.sh');

  // Ensure script is executable
  try { fs.chmodSync(scriptPath, 0o755); } catch {}

  const args = [];
  if (profile) args.push('-p', profile);
  if (region) args.push('-r', region);

  const proc = spawn('/usr/bin/env', ['bash', scriptPath, ...args], {
    cwd: __dirname,
    env: { ...process.env, PATH: process.env.PATH + ':/usr/local/bin:/opt/homebrew/bin' }
  });

  activeScan = proc;
  let stdout = '';

  proc.stdout.on('data', (data) => {
    const text = data.toString();
    stdout += text;
    event.sender.send('aws:scan:progress', text);
  });

  proc.stderr.on('data', (data) => {
    event.sender.send('aws:scan:progress', '[stderr] ' + data.toString());
  });

  proc.on('close', (code) => {
    activeScan = null;
    if (code === 0) {
      // Parse output directory from stdout
      const match = stdout.match(/Output\s*:\s*(.+)/);
      const outDir = match ? match[1].trim() : null;
      // Auto-read JSON files from output directory
      let files = null;
      if (outDir && fs.existsSync(outDir)) {
        files = {};
        for (const fname of fs.readdirSync(outDir)) {
          if (fname.endsWith('.json')) {
            try { files[fname] = fs.readFileSync(path.join(outDir, fname), 'utf8'); } catch {}
          }
        }
      }
      event.sender.send('aws:scan:complete', { code, outDir, files });
    } else {
      event.sender.send('aws:scan:error', 'Scan exited with code ' + code);
    }
  });

  proc.on('error', (err) => {
    activeScan = null;
    event.sender.send('aws:scan:error', err.message);
  });
});

ipcMain.on('aws:scan:abort', () => {
  if (activeScan) {
    activeScan.kill('SIGTERM');
    activeScan = null;
  }
});

// ── IPC: Export with native dialog ────────────────────────────────

ipcMain.handle('file:export', async (event, { data, defaultName, filters }) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Export',
    defaultPath: defaultName,
    filters: filters || [{ name: 'All Files', extensions: ['*'] }]
  });
  if (result.canceled || !result.filePath) return null;
  if (Buffer.isBuffer(data) || ArrayBuffer.isView(data)) {
    fs.writeFileSync(result.filePath, Buffer.from(data));
  } else {
    fs.writeFileSync(result.filePath, data, 'utf8');
  }
  return result.filePath;
});

// ── BUDR XLSX Export ──────────────────────────────────────────────

ipcMain.handle('budr:export-xlsx', async (event, { jsonData }) => {
  const os = require('os');
  const tmpJson = path.join(os.tmpdir(), `budr-${Date.now()}.json`);
  const tmpXlsx = path.join(os.tmpdir(), `budr-${Date.now()}.xlsx`);
  fs.writeFileSync(tmpJson, jsonData, 'utf8');

  const scriptPath = path.join(__dirname, 'budr_export_xlsx.py');
  if (!fs.existsSync(scriptPath)) {
    return { error: 'budr_export_xlsx.py not found' };
  }

  try {
    const { execFileSync } = require('child_process');
    execFileSync('python3', [scriptPath, tmpJson, '-o', tmpXlsx], {
      timeout: 30000,
      stdio: 'pipe'
    });
  } catch (err) {
    return { error: err.stderr?.toString() || err.message };
  }

  if (!fs.existsSync(tmpXlsx)) {
    return { error: 'XLSX generation failed — output file not created' };
  }

  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save BUDR Report',
    defaultPath: `budr-assessment-${new Date().toISOString().slice(0, 10)}.xlsx`,
    filters: [{ name: 'Excel Workbook', extensions: ['xlsx'] }]
  });

  if (result.canceled || !result.filePath) {
    fs.unlinkSync(tmpJson);
    fs.unlinkSync(tmpXlsx);
    return null;
  }

  fs.copyFileSync(tmpXlsx, result.filePath);
  fs.unlinkSync(tmpJson);
  fs.unlinkSync(tmpXlsx);
  return { path: result.filePath };
});

// ── Auto-Update ───────────────────────────────────────────────────

function checkForUpdates(manual = false) {
  try {
    const { autoUpdater } = require('electron-updater');
    autoUpdater.autoDownload = false;
    autoUpdater.removeAllListeners();
    autoUpdater.on('update-available', (info) => {
      mainWindow?.webContents.send('update:available', {
        version: info.version,
        releaseNotes: info.releaseNotes
      });
    });
    if (manual) {
      autoUpdater.on('update-not-available', () => {
        dialog.showMessageBox(mainWindow, {
          type: 'info',
          title: 'No Updates',
          message: `You're on the latest version (${app.getVersion()}).`
        });
      });
      autoUpdater.on('error', (err) => {
        dialog.showMessageBox(mainWindow, {
          type: 'warning',
          title: 'Update Check Failed',
          message: 'Could not check for updates.',
          detail: err?.message || ''
        });
      });
    }
    autoUpdater.checkForUpdates().catch(() => {});
  } catch {}
}

// ── Navigation Guards ─────────────────────────────────────────────

app.on('web-contents-created', (event, contents) => {
  contents.on('will-navigate', (ev, url) => {
    if (!url.startsWith('file://')) ev.preventDefault();
  });
  contents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) shell.openExternal(url);
    return { action: 'deny' };
  });
});

// ── App Lifecycle ─────────────────────────────────────────────────

app.whenReady().then(() => {
  if (process.platform === 'darwin') {
    app.dock.setIcon(path.join(__dirname, 'build', 'icon.png'));
  }
  buildMenu();
  createWindow();

  // Check for updates after a short delay
  setTimeout(checkForUpdates, 5000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Handle .awsmap file open (macOS: double-click file, drag to dock icon)
app.on('open-file', (event, filePath) => {
  event.preventDefault();
  if (mainWindow) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      mainWindow.webContents.send('file:opened', content);
    } catch {}
  }
});
