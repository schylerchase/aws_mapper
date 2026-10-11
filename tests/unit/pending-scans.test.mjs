import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '../..');
const nativeRequire = createRequire(import.meta.url);

function scanRuntime(deferredStage) {
  const handlers = new Map(), listeners = new Map(), children = [], messages = [];
  let announceSetup, releaseSetup, deferred = false;
  const setupEntered = new Promise(resolve => { announceSetup = resolve; });
  const setupReleased = new Promise(resolve => { releaseSetup = resolve; });
  async function waitAt(stage) {
    if (stage === deferredStage && !deferred) {
      deferred = true;
      announceSetup();
      await setupReleased;
    }
  }
  const context = vm.createContext({
    __dirname: root, process, console, URL, Buffer, ArrayBuffer, setTimeout,
    require(name) {
      if (name === 'electron') return {
        app: { isPackaged: false, setName() {}, commandLine: { appendSwitch() {} },
          on() {}, whenReady: () => ({ then() {} }) },
        ipcMain: { handle: (channel, fn) => handlers.set(channel, fn),
          on: (channel, fn) => listeners.set(channel, fn) }
      };
      if (name === 'electron-updater') return { autoUpdater: {} };
      if (name === 'fs') return { promises: {
        access: () => waitAt('access'), chmod: () => waitAt('chmod'), readdir: async () => []
      } };
      if (name === 'child_process') return {
        execFile: (...args) => { waitAt('cli').then(() => args.at(-1)(null, 'aws-cli/2', '')); },
        spawn: (_command, args) => {
          const child = new EventEmitter();
          child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
          child.args = args; child.kills = 0; child.kill = () => { child.kills++; };
          children.push(child);
          return child;
        }
      };
      return nativeRequire(name);
    }
  });
  vm.runInContext(fs.readFileSync(path.join(root, 'main.js'), 'utf8'), context);
  const event = { sender: { isDestroyed: () => false,
    send: (channel, data) => messages.push({ channel, data }) } };
  return { children, messages, setupEntered, releaseSetup,
    start: profile => handlers.get('aws:scan')(event, { profile, region: 'us-east-1' }),
    abort: () => listeners.get('aws:scan:abort')() };
}

for (const stage of ['cli', 'chmod']) {
  test(`cancel while awaiting ${stage} prevents the pending scan from spawning`, async () => {
    const runtime = scanRuntime(stage);
    const pending = runtime.start('canceled');
    await runtime.setupEntered;
    runtime.abort();
    runtime.releaseSetup();
    await pending;
    assert.equal(runtime.children.length, 0);
    assert.deepEqual(runtime.messages, []);
  });
}

test('an older setup cannot replace a newer running scan', async () => {
  const runtime = scanRuntime('chmod');
  const older = runtime.start('old');
  await runtime.setupEntered;
  await runtime.start('new');
  const newer = runtime.children[0];
  runtime.releaseSetup();
  await older;
  assert.equal(runtime.children.length, 1);
  assert.equal(newer.args[newer.args.indexOf('-p') + 1], 'new');
  assert.equal(newer.kills, 0);
  runtime.abort();
  assert.equal(newer.kills, 1);
});

test('obsolete child callbacks cannot clear or report for the replacement', async () => {
  const runtime = scanRuntime();
  await runtime.start('old');
  const older = runtime.children[0];
  await runtime.start('new');
  const newer = runtime.children[1];
  older.stdout.emit('data', Buffer.from('obsolete progress'));
  older.stderr.emit('data', Buffer.from('obsolete error'));
  older.emit('error', new Error('obsolete process failure'));
  await older.listeners('close')[0](1);
  assert.deepEqual(runtime.messages, []);
  runtime.abort();
  assert.equal(newer.kills, 1);
});

test('a current scan still reports completion', async () => {
  const runtime = scanRuntime();
  await runtime.start('current');
  await runtime.children[0].listeners('close')[0](0);
  assert.equal(runtime.messages.length, 1);
  assert.equal(runtime.messages[0].channel, 'aws:scan:complete');
});

test('output reads from a completed scan cannot report over a newer scan', async () => {
  const runtime = scanRuntime('access');
  await runtime.start('old');
  const older = runtime.children[0];
  older.stdout.emit('data', Buffer.from('Output : ' + root));
  runtime.messages.length = 0;
  const closing = older.listeners('close')[0](0);
  await runtime.setupEntered;
  await runtime.start('new');
  runtime.releaseSetup();
  await closing;
  assert.deepEqual(runtime.messages, []);
  runtime.abort();
  assert.equal(runtime.children[1].kills, 1);
});
