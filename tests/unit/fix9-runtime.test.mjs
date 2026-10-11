import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tempParent = path.resolve(process.env.TEMP || os.tmpdir());

async function validate(mode) {
  const directory = fs.mkdtempSync(path.join(tempParent, 'aws-fix9-profile-'));
  try {
    const receipt = path.join(directory, 'receipt.json');
    const result = spawnSync('pwsh', ['-NoProfile', '-File', path.join(ROOT, 'tests/fix9_collector_profile.ps1'),
      '-SourceRoot', ROOT, '-Mode', mode, '-Receipt', receipt], {
      encoding: 'utf8', env: { ...process.env, AWS_SHARED_CREDENTIALS_FILE: path.join(directory, 'credentials'),
        AWS_CONFIG_FILE: path.join(directory, 'config') }
    });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const state = JSON.parse(fs.readFileSync(receipt, 'utf8').replace(/^\uFEFF/, ''));
    assert.equal(state.aws_calls, 0);
    assert.deepEqual(fs.readdirSync(directory), ['receipt.json']);
    return state;
  } finally {
    const relative = path.relative(tempParent, directory);
    assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative));
    await fs.promises.rm(directory, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 });
  }
}

test('collector accepts an onboarding-compatible dotted single profile', async () => {
  const state = await validate('single');
  assert.equal(state.accepted, true, state.error);
  assert.equal(state.validation.profile, 'team.readonly');
  assert.deepEqual(state.validation.profiles, ['team.readonly']);
});

test('collector accepts comma-separated and array dotted profiles', async () => {
  const state = await validate('multiple');
  assert.equal(state.accepted, true, state.error);
  assert.deepEqual(state.validation.profiles, ['team.readonly', 'prod.ops', 'qa.test']);
});

test('collector retains underscore, hyphen and numeric profile names', async () => {
  const state = await validate('classic');
  assert.equal(state.accepted, true, state.error);
  assert.equal(state.validation.profile, 'team_readonly-123');
});

for (const mode of ['semicolon', 'slash', 'spaces', 'dotSingle', 'parentSingle', 'dotMultiple', 'parentMultiple']) {
  test(`collector rejects invalid ${mode} profile characters before any AWS operation`, async () => {
    const state = await validate(mode);
    assert.equal(state.accepted, false);
    assert.match(state.error, /Invalid profile name/);
    assert.equal(state.validation, null);
  });
}
