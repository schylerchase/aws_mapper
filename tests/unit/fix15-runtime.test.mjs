import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tempParent = path.resolve(process.env.TEMP || os.tmpdir());

async function importFolder(files) {
  const folder = fs.mkdtempSync(path.join(tempParent, 'aws-fix15-folder-'));
  try {
    for (const [name, value] of Object.entries(files)) {
      const target = path.join(folder, name);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, JSON.stringify(value));
    }
    const handlers = new Map();
    const electron = {
      app: { setName() {}, commandLine: { appendSwitch() {} }, on() {}, whenReady() { return { then() {} }; } },
      BrowserWindow: { getAllWindows() { return []; } }, Menu: {}, shell: {},
      dialog: { async showOpenDialog() { return { canceled: false, filePaths: [folder] }; } },
      ipcMain: { handle(key, handler) { handlers.set(key, handler); }, on() {} }
    };
    vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8'), {
      require: name => name === 'electron' ? electron : name === 'electron-updater' ? { autoUpdater: {} } : require(name),
      __dirname: ROOT, process, console, URL, Buffer, setTimeout, clearTimeout
    }, { filename: path.join(ROOT, 'main.js') });
    return JSON.parse(JSON.stringify(await handlers.get('file:open-folder')()));
  } finally {
    const relative = path.relative(tempParent, folder);
    assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative));
    await fs.promises.rm(folder, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 });
  }
}

const vpcs = { Vpcs: [{ VpcId: 'vpc-12345678', CidrBlock: '172.20.0.0/16' }] };
const account = { Account: '111122223333' };
const iam = { RoleDetailList: [{ RoleName: 'mock-role' }] };

test('folder IPC imports a region-named profile with nested regions and global files', async () => {
  const result = await importFolder({ 'us-east-1/us-west-2/vpcs.json': vpcs,
    'us-east-1/account.json': account, 'us-east-1/iam.json': iam });
  assert.equal(result._structure, 'multi-profile');
  assert.deepEqual(result.profiles['us-east-1'], {
    regions: { 'us-west-2': { 'vpcs.json': vpcs } }, files: { 'account.json': account, 'iam.json': iam }
  });
});

test('folder IPC retains an ordinary profile and its account metadata', async () => {
  const result = await importFolder({ 'prod/us-west-2/vpcs.json': vpcs, 'prod/account.json': account });
  assert.equal(result._structure, 'multi-profile');
  assert.deepEqual(result.profiles.prod.regions['us-west-2']['vpcs.json'], vpcs);
  assert.deepEqual(result.profiles.prod.files['account.json'], account);
});

test('folder IPC keeps direct region folders as regions', async () => {
  const result = await importFolder({ 'us-east-1/vpcs.json': vpcs, 'account.json': account });
  assert.equal(result._structure, 'multi-region');
  assert.deepEqual(result.regions['us-east-1']['vpcs.json'], vpcs);
  assert.deepEqual(result.files['account.json'], account);
});

test('folder IPC retains flat exports', async () => {
  assert.deepEqual(await importFolder({ 'vpcs.json': vpcs, 'account.json': account }), {
    _structure: 'flat', files: { 'account.json': account, 'vpcs.json': vpcs }
  });
});
