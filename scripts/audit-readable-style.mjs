import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const includedExtensions = new Set(['.html', '.js', '.mjs']);
const ignoredDirectories = new Set([
  '.git',
  'dist',
  'libs',
  'node_modules',
  'tests',
  'tests/visual.spec.js-snapshots'
]);

const rules = [
  {
    id: 'inline-handler-html',
    label: 'Use addEventListener instead of inline HTML event handlers',
    pattern: /(?:^|[\s<])on[a-z]+\s*=/
  },
  {
    id: 'dom-property-handler',
    label: 'Use addEventListener instead of .onclick assignments',
    pattern: /\.onclick\s*=/
  },
  {
    id: 'embedded-compact-function',
    label: 'Embedded generated script is still compacted',
    pattern: /function\s+[\w$]+\([^)]*\)\{/
  },
  {
    id: 'embedded-compact-logical',
    label: 'Embedded generated script still has compact logical operators',
    pattern: /[\w)\]'"](&&|\|\|)[\w([_'"]/
  },
  {
    id: 'compact-safe-helper',
    label: 'Use guard clauses instead of compact safe-helper ternaries',
    pattern: /return\s+[_A-Z0-9]+\s+&&\s+[_A-Z0-9]+\[[^\]]+\]\s+\?\s+[^:]+:\s+/
  }
];

function shouldIgnoreDirectory(relativePath) {
  return [...ignoredDirectories].some(
    ignored => relativePath === ignored || relativePath.startsWith(`${ignored}/`)
  );
}

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(root, fullPath).replaceAll(path.sep, '/');

    if (entry.isDirectory()) {
      if (!shouldIgnoreDirectory(relativePath)) {
        walk(fullPath, files);
      }
      continue;
    }

    if (includedExtensions.has(path.extname(entry.name))) {
      files.push(relativePath);
    }
  }

  return files;
}

const findings = [];

for (const relativePath of walk(root)) {
  const text = fs.readFileSync(path.join(root, relativePath), 'utf8');
  const lines = text.split(/\r?\n/);

  lines.forEach((line, index) => {
    if (line.includes('readability-audit-ignore')) {
      return;
    }

    for (const rule of rules) {
      if (!rule.pattern.test(line)) {
        continue;
      }
      findings.push({
        rule: rule.id,
        label: rule.label,
        file: relativePath,
        line: index + 1,
        text: line.trim().slice(0, 140)
      });
    }
  });
}

if (!findings.length) {
  console.log('Readable style audit found no manual cleanup slices.');
  process.exit(0);
}

const byRule = findings.reduce((groups, finding) => {
  groups[finding.rule] = (groups[finding.rule] || 0) + 1;
  return groups;
}, {});

const byFile = findings.reduce((groups, finding) => {
  groups[finding.file] = (groups[finding.file] || 0) + 1;
  return groups;
}, {});

console.log(`Readable style audit found ${findings.length} manual cleanup slice(s).`);
console.log('\nBy rule:');
Object.entries(byRule)
  .sort((a, b) => b[1] - a[1])
  .forEach(([rule, count]) => console.log(`  ${rule}: ${count}`));

console.log('\nTop files:');
Object.entries(byFile)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 20)
  .forEach(([file, count]) => console.log(`  ${file}: ${count}`));

console.log('\nExamples:');
for (const finding of findings.slice(0, 80)) {
  console.log(`${finding.file}:${finding.line} ${finding.rule} - ${finding.label}`);
  console.log(`  ${finding.text}`);
}

if (findings.length > 80) {
  console.log(`...and ${findings.length - 80} more.`);
}
