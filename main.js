const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises; // OPTIMIZED: Use async file I/O to avoid blocking main process
const { spawn, execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);
const os = require('os');
const { randomUUID } = require('crypto');
const { autoUpdater } = require('electron-updater');

app.setName('AWS Network Mapper');

// ── GPU Hardware Acceleration ────────────────────────────────────
// SVG/D3 rendering benefits heavily from GPU-accelerated compositing
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-features', 'CanvasOopRasterization,Vulkan');

let mainWindow = null;
let activeScan = null;
const SAFE_INPUT = /^[a-zA-Z0-9_-]{0,64}$/;
const MAX_JSON_FILE_SIZE = 100 * 1024 * 1024;
const MAX_IMPORT_BYTES = 250 * 1024 * 1024;
const MAX_IMPORT_FILES = 2000;
const ALLOWED_EXTERNAL_HOSTS = new Set([
  'aws.amazon.com',
  'docs.aws.amazon.com',
  'github.com',
  'vercel.com',
  'awsmapper.schylerryan.com',
  'schylerryan.com'
]);

function isWithinPath(parent, child) {
  const rel = path.relative(parent, child);
  return rel === '' || (!!rel && !rel.startsWith('..') && !path.isAbsolute(rel));
}

function cliEnv() {
  const extraPath = process.platform === 'win32' ? '' : ':/usr/local/bin:/opt/homebrew/bin';
  return { ...process.env, PATH: (process.env.PATH || '') + extraPath };
}

async function execFirst(candidates, options) {
  let notFound = null;
  for (const candidate of candidates) {
    try {
      return await execFileAsync(candidate.command, candidate.args, options);
    } catch (err) {
      if (err.code === 'ENOENT') {
        notFound = err;
        continue;
      }
      throw err;
    }
  }
  throw notFound || new Error('No executable candidates found');
}

function awsScanCommand(scriptPath, args) {
  if (process.platform === 'win32') {
    return {
      command: 'pwsh.exe',
      args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, ...args]
    };
  }
  return { command: '/usr/bin/env', args: ['bash', scriptPath, ...args] };
}

async function runPythonScript(args, options) {
  const candidates =
    process.platform === 'win32'
      ? [
          { command: 'py.exe', args: ['-3', ...args] },
          { command: 'python.exe', args },
          { command: 'python3.exe', args }
        ]
      : [
          { command: 'python3', args },
          { command: 'python', args }
        ];
  return execFirst(candidates, options);
}

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
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.loadFile('index.html');

  mainWindow.webContents.on('did-finish-load', async () => {
    if (_pendingOpenFile) {
      try {
        const content = await fsp.readFile(_pendingOpenFile, 'utf8');
        mainWindow.webContents.send('file:opened', content);
      } catch (e) {
        console.warn('file:opened - deferred read failed:', e.message);
      }
      _pendingOpenFile = null;
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ── Menus ─────────────────────────────────────────────────────────

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac
      ? [
          {
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
          }
        ]
      : []),
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
        { type: 'separator' },
        {
          label: 'Toggle Light Mode',
          accelerator: 'CmdOrCtrl+Shift+L',
          click: () => mainWindow?.webContents.send('menu:toggle-theme')
        },
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
  if (result.canceled || !result.filePath) {
    return null;
  }
  await fsp.writeFile(result.filePath, data, 'utf8');
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
  if (result.canceled || !result.filePaths.length) {
    return null;
  }
  return await fsp.readFile(result.filePaths[0], 'utf8');
});

ipcMain.handle('file:open-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select AWS Export Folder',
    properties: ['openDirectory']
  });
  if (result.canceled || !result.filePaths.length) {
    return null;
  }
  const dir = result.filePaths[0];
  const regionRe =
    /^[a-z]{2}-(north|south|east|west|central|northeast|southeast|northwest|southwest)-\d+$/;
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  const regions = {};
  const flatFiles = {};
  const profiles = {};
  let importBytes = 0;
  let importFiles = 0;

  async function readJsonFile(filePath, fileName, target) {
    let stat;
    try {
      stat = await fsp.stat(filePath);
    } catch {
      return;
    }
    if (!stat.isFile() || stat.size > MAX_JSON_FILE_SIZE) {
      return;
    }
    if (importFiles >= MAX_IMPORT_FILES) {
      return;
    }
    if (importBytes + stat.size > MAX_IMPORT_BYTES) {
      return;
    }

    const raw = await fsp.readFile(filePath, 'utf8');
    importFiles++;
    importBytes += stat.size;
    try {
      target[fileName] = JSON.parse(raw);
    } catch {
      target[fileName] = raw;
    }
  }

  // Helper: read JSON files in a directory with bounded memory usage.
  async function readJsonDir(dirPath) {
    const files = {};
    const ents = await fsp.readdir(dirPath, { withFileTypes: true });
    for (const f of ents) {
      if (!f.isFile() || !f.name.endsWith('.json')) {
        continue;
      }
      await readJsonFile(path.join(dirPath, f.name), f.name, files);
    }
    return files;
  }

  for (const ent of entries) {
    if (ent.isDirectory()) {
      const subdir = path.join(dir, ent.name);

      if (regionRe.test(ent.name)) {
        const regionFiles = await readJsonDir(subdir);
        if (Object.keys(regionFiles).length) {
          regions[ent.name] = regionFiles;
        }
      } else {
        const profRegions = {};
        const profFlat = {};
        const subs = await fsp.readdir(subdir, { withFileTypes: true });
        for (const sub of subs) {
          if (sub.isDirectory() && regionRe.test(sub.name)) {
            const regDir = path.join(subdir, sub.name);
            const regFiles = await readJsonDir(regDir);
            if (Object.keys(regFiles).length) {
              profRegions[sub.name] = regFiles;
            }
          } else if (sub.isFile() && sub.name.endsWith('.json')) {
            await readJsonFile(path.join(subdir, sub.name), sub.name, profFlat);
          }
        }
        if (Object.keys(profRegions).length || Object.keys(profFlat).length) {
          profiles[ent.name] = { regions: profRegions, files: profFlat };
        }
      }
    } else if (ent.isFile() && ent.name.endsWith('.json')) {
      await readJsonFile(path.join(dir, ent.name), ent.name, flatFiles);
    }
  }

  // Priority: profiles > regions > flat
  if (Object.keys(profiles).length) {
    return { _structure: 'multi-profile', profiles, files: flatFiles };
  }
  if (Object.keys(regions).length) {
    return { _structure: 'multi-region', regions, files: flatFiles };
  }
  return { _structure: 'flat', files: flatFiles };
});

// ── IPC: AWS CLI Scan ─────────────────────────────────────────────

// OPTIMIZED: Cache AWS CLI check result with 60s TTL, use async exec to avoid blocking main process
let _awsCliCached = null;
let _awsCliCacheTime = 0;
const AWS_CLI_CACHE_TTL = 60000;
async function checkAwsCli() {
  if (_awsCliCached !== null && Date.now() - _awsCliCacheTime < AWS_CLI_CACHE_TTL) {
    return _awsCliCached;
  }
  try {
    await execFileAsync('aws', ['--version'], {
      encoding: 'utf8',
      env: cliEnv()
    });
    _awsCliCached = true;
    _awsCliCacheTime = Date.now();
  } catch {
    _awsCliCached = false;
    _awsCliCacheTime = 0; // don't cache failures — retry next time
  }
  return _awsCliCached;
}

ipcMain.handle('aws:check-cli', async () => await checkAwsCli());

function safeSend(sender, channel, data) {
  if (sender && !sender.isDestroyed()) {
    sender.send(channel, data);
  }
}

function isAllowedExternalUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:') {
      return false;
    }
    const host = parsed.hostname.toLowerCase();
    return (
      ALLOWED_EXTERNAL_HOSTS.has(host) ||
      [...ALLOWED_EXTERNAL_HOSTS].some((allowed) => host.endsWith('.' + allowed))
    );
  } catch {
    return false;
  }
}

ipcMain.handle('aws:scan', async (event, { profile, region }) => {
  // Kill any existing scan before starting a new one
  if (activeScan) {
    activeScan.kill('SIGTERM');
    activeScan = null;
  }

  if (!(await checkAwsCli())) {
    safeSend(
      event.sender,
      'aws:scan:error',
      'AWS CLI not found. Install it from https://aws.amazon.com/cli/'
    );
    return;
  }

  // Validate inputs to prevent command injection
  if (profile && !SAFE_INPUT.test(profile)) {
    safeSend(
      event.sender,
      'aws:scan:error',
      'Invalid profile name. Use only letters, numbers, hyphens, underscores.'
    );
    return;
  }
  if (region && !SAFE_INPUT.test(region)) {
    safeSend(
      event.sender,
      'aws:scan:error',
      'Invalid region name. Use only letters, numbers, hyphens, underscores.'
    );
    return;
  }

  const scriptPath = path.join(
    __dirname,
    'scripts',
    process.platform === 'win32' ? 'export-aws-data.ps1' : 'export-aws-data.sh'
  );
  try {
    await fsp.access(scriptPath);
  } catch {
    safeSend(
      event.sender,
      'aws:scan:error',
      'AWS export script not found: ' + path.basename(scriptPath)
    );
    return;
  }

  // Ensure script is executable
  try {
    await fsp.chmod(scriptPath, 0o755);
  } catch {}

  const args = [];
  if (profile) {
    args.push('-p', profile);
  }
  if (region) {
    args.push('-r', region);
  }

  const scanCommand = awsScanCommand(scriptPath, args);
  const proc = spawn(scanCommand.command, scanCommand.args, {
    cwd: __dirname,
    env: cliEnv()
  });

  activeScan = proc;
  let stdout = '';

  proc.stdout.on('data', (data) => {
    const text = data.toString();
    stdout += text;
    safeSend(event.sender, 'aws:scan:progress', text);
  });

  proc.stderr.on('data', (data) => {
    safeSend(event.sender, 'aws:scan:progress', '[stderr] ' + data.toString());
  });

  proc.on('error', (err) => {
    activeScan = null;
    const tool = process.platform === 'win32' ? 'PowerShell 7 (pwsh)' : 'bash';
    safeSend(event.sender, 'aws:scan:error', tool + ' failed to start: ' + err.message);
  });

  proc.on('close', async (code) => {
    activeScan = null;
    if (code === 0) {
      // Parse output directory from stdout
      const match = stdout.match(/Output\s*:\s*(.+)/);
      const outDir = match ? match[1].trim() : null;
      // Auto-read JSON files from output directory (validate path prefix)
      let files = null;
      const resolvedDir = outDir ? path.resolve(__dirname, outDir) : null;
      try {
        if (
          resolvedDir &&
          (isWithinPath(__dirname, resolvedDir) || isWithinPath(os.tmpdir(), resolvedDir))
        ) {
          await fsp.access(resolvedDir);
          files = {};
          let scanBytes = 0;
          let scanFiles = 0;
          for (const ent of await fsp.readdir(resolvedDir, { withFileTypes: true })) {
            if (!ent.isFile() || !ent.name.endsWith('.json')) {
              continue;
            }
            if (scanFiles >= MAX_IMPORT_FILES) {
              break;
            }
            const fp = path.join(resolvedDir, ent.name);
            let stat;
            try {
              stat = await fsp.stat(fp);
            } catch {
              continue;
            }
            if (!stat.isFile() || stat.size > MAX_JSON_FILE_SIZE) {
              continue;
            }
            if (scanBytes + stat.size > MAX_IMPORT_BYTES) {
              break;
            }
            try {
              files[ent.name] = await fsp.readFile(fp, 'utf8');
              scanBytes += stat.size;
              scanFiles++;
            } catch (e) {
              console.warn('aws:scan - failed to read', ent.name, ':', e.message);
            }
          }
        }
      } catch {
        /* outDir doesn't exist, files stays null */
      }
      safeSend(event.sender, 'aws:scan:complete', { code, files });
    } else {
      safeSend(event.sender, 'aws:scan:error', 'Scan exited with code ' + code);
    }
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
  if (result.canceled || !result.filePath) {
    return null;
  }
  if (Buffer.isBuffer(data) || ArrayBuffer.isView(data)) {
    await fsp.writeFile(result.filePath, Buffer.from(data));
  } else {
    await fsp.writeFile(result.filePath, data, 'utf8');
  }
  return result.filePath;
});

// ── BUDR XLSX Export ──────────────────────────────────────────────

ipcMain.handle('budr:export-xlsx', async (event, { jsonData }) => {
  const id = randomUUID();
  const tmpJson = path.join(os.tmpdir(), `budr-${id}.json`);
  const tmpXlsx = path.join(os.tmpdir(), `budr-${id}.xlsx`);
  await fsp.writeFile(tmpJson, jsonData, 'utf8');

  const scriptPath = path.join(__dirname, 'scripts', 'budr_export_xlsx.py');
  try {
    await fsp.access(scriptPath);
  } catch {
    await fsp.unlink(tmpJson).catch(() => {});
    return { error: 'scripts/budr_export_xlsx.py not found' };
  }

  try {
    await runPythonScript([scriptPath, tmpJson, '-o', tmpXlsx], {
      timeout: 30000
    });
  } catch (err) {
    await Promise.all([fsp.unlink(tmpJson).catch(() => {}), fsp.unlink(tmpXlsx).catch(() => {})]);
    return { error: err.stderr?.toString() || err.message };
  }

  try {
    await fsp.access(tmpXlsx);
  } catch {
    await fsp.unlink(tmpJson).catch(() => {});
    return { error: 'XLSX generation failed — output file not created' };
  }

  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save BUDR Report',
    defaultPath: `budr-assessment-${new Date().toISOString().slice(0, 10)}.xlsx`,
    filters: [{ name: 'Excel Workbook', extensions: ['xlsx'] }]
  });

  if (result.canceled || !result.filePath) {
    await Promise.all([fsp.unlink(tmpJson), fsp.unlink(tmpXlsx)]);
    return null;
  }

  await fsp.copyFile(tmpXlsx, result.filePath);
  await Promise.all([fsp.unlink(tmpJson), fsp.unlink(tmpXlsx)]);
  return { path: result.filePath };
});

// ── Auto-Update ───────────────────────────────────────────────────

let _updateNotified = false;

function setupAutoUpdater() {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => {
    if (!_updateNotified) {
      _updateNotified = true;
      mainWindow?.webContents.send('update:available', {
        version: info.version,
        currentVersion: app.getVersion()
      });
    }
  });

  autoUpdater.on('download-progress', (progress) => {
    mainWindow?.webContents.send('update:download-progress', {
      percent: Math.round(progress.percent)
    });
  });

  autoUpdater.on('update-downloaded', () => {
    mainWindow?.webContents.send('update:downloaded');
  });

  autoUpdater.on('error', (err) => {
    mainWindow?.webContents.send('update:error', err?.message || 'Update failed');
  });
}

function checkForUpdates(manual = false) {
  try {
    if (manual) {
      const manualNotAvail = () => {
        if (!mainWindow) {
          return;
        }
        dialog.showMessageBox(mainWindow, {
          type: 'info',
          title: 'No Updates',
          message: `You're on the latest version (v${app.getVersion()}).`
        });
      };
      const manualErr = (err) => {
        if (!mainWindow) {
          return;
        }
        dialog.showMessageBox(mainWindow, {
          type: 'warning',
          title: 'Update Check Failed',
          message: 'Could not check for updates.',
          detail: err?.message || ''
        });
      };
      autoUpdater.once('update-not-available', manualNotAvail);
      autoUpdater.once('error', manualErr);
      // Clean up one-time listeners after check completes
      setTimeout(() => {
        autoUpdater.removeListener('update-not-available', manualNotAvail);
        autoUpdater.removeListener('error', manualErr);
      }, 30000);
    }
    autoUpdater.checkForUpdates().catch((err) => {
      console.warn('Auto-update check failed:', err.message);
    });
  } catch (e) {
    console.warn('checkForUpdates error:', e.message);
  }
}

ipcMain.on('update:download', () => {
  autoUpdater.downloadUpdate().catch((err) => {
    mainWindow?.webContents.send('update:error', err?.message || 'Download failed');
  });
});

ipcMain.on('update:install', () => {
  autoUpdater.quitAndInstall(false, true);
});

// ── Navigation Guards ─────────────────────────────────────────────

const appOrigin = 'file://' + __dirname + '/';
app.on('web-contents-created', (event, contents) => {
  contents.on('will-navigate', (ev, url) => {
    if (!url.startsWith(appOrigin)) {
      ev.preventDefault();
    }
  });
  contents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) {
      shell.openExternal(url);
    } else {
      console.warn('Blocked external navigation:', url);
    }
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
  setupAutoUpdater();

  // Check for updates after a short delay
  setTimeout(checkForUpdates, 5000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Handle .awsmap file open (macOS: double-click file, drag to dock icon)
let _pendingOpenFile = null;
app.on('open-file', (event, filePath) => {
  event.preventDefault();
  if (mainWindow && !mainWindow.webContents.isLoading()) {
    fsp
      .readFile(filePath, 'utf8')
      .then((content) => {
        mainWindow.webContents.send('file:opened', content);
      })
      .catch((e) => {
        console.warn('file:opened - failed to read:', e.message);
      });
  } else {
    _pendingOpenFile = filePath;
  }
});
