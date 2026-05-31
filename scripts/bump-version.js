#!/usr/bin/env node
// Single-command version bump: updates package.json, syncs package-lock.json,
// runs a build to verify the bundled runtime version, then checks source
// placeholders remain template-safe.
//
// Usage:
//   npm run version:bump -- patch    # 2.8.0 → 2.8.1
//   npm run version:bump -- minor    # 2.8.0 → 2.9.0
//   npm run version:bump -- major    # 2.8.0 → 3.0.0
//   npm run version:bump -- 2.9.0   # explicit version

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.join(__dirname, '..');
const arg = process.argv[2];

if (!arg) {
  console.error('Usage: npm run version:bump -- <patch|minor|major|X.Y.Z>');
  process.exit(1);
}

// Read current version
const pkgPath = path.join(root, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const current = pkg.version;
const [maj, min, pat] = current.split('.').map(Number);

// Compute new version
let next;
if (arg === 'patch') {
  next = `${maj}.${min}.${pat + 1}`;
} else if (arg === 'minor') {
  next = `${maj}.${min + 1}.0`;
} else if (arg === 'major') {
  next = `${maj + 1}.0.0`;
} else if (/^\d+\.\d+\.\d+$/.test(arg)) {
  next = arg;
} else {
  console.error(`Invalid argument: ${arg}`);
  process.exit(1);
}

console.log(`Bumping version: ${current} → ${next}\n`);

// 1. Update package.json
pkg.version = next;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
console.log('  ✓ package.json');

// 2. Sync package-lock.json (updates both line 3 and line 9)
const lockPath = path.join(root, 'package-lock.json');
if (fs.existsSync(lockPath)) {
  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  lock.version = next;
  if (lock.packages && lock.packages['']) {
    lock.packages[''].version = next;
  }
  fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n');
  console.log('  ✓ package-lock.json');
}

// 3. Run build so __APP_VERSION__ is compiled from package.json
console.log('\nRunning build...');
execSync('node build.js', { cwd: root, stdio: 'inherit' });

// 4. Verify package files match and source files stayed template-safe
console.log('\nVerifying version consistency...');
const checks = [
  { file: 'package.json', pattern: /"version":\s*"([^"]+)"/, label: 'package.json' },
  {
    file: 'package-lock.json',
    pattern: /"version":\s*"([^"]+)"/,
    label: 'package-lock.json (root)'
  }
];

let allMatch = true;
for (const check of checks) {
  const content = fs.readFileSync(path.join(root, check.file), 'utf8');
  const match = content.match(check.pattern);
  const found = match ? match[1] : 'NOT FOUND';
  const ok = found === next;
  console.log(`  ${ok ? '✓' : '✗'} ${check.label}: ${found}`);
  if (!ok) {
    allMatch = false;
  }
}

if (allMatch) {
  const sourceChecks = [
    {
      file: 'index.html',
      pattern: /brand-ver">v__VERSION__</,
      label: 'index.html brand placeholder'
    },
    {
      file: 'index.html',
      pattern: /landing-footer">v__VERSION__/,
      label: 'index.html footer placeholder'
    },
    {
      file: 'README.md',
      pattern: /shields\.io\/github\/package-json\/v\/schylerchase\/aws_mapper/,
      label: 'README.md dynamic version badge'
    }
  ];
  for (const check of sourceChecks) {
    const content = fs.readFileSync(path.join(root, check.file), 'utf8');
    const ok = check.pattern.test(content);
    console.log(`  ${ok ? '✓' : '✗'} ${check.label}`);
    if (!ok) {
      allMatch = false;
    }
  }
}

if (allMatch) {
  console.log(`\n✓ Package files updated to v${next}; source placeholders preserved`);
} else {
  console.error(`\n✗ Version mismatch or source placeholder issue detected! Expected ${next}.`);
  process.exit(1);
}
