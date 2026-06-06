import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

const root = process.cwd();
const fromRoot = (...segments) => path.join(root, ...segments);

const listFiles = async (relativeDir, predicate = () => true) => {
  const absoluteDir = fromRoot(relativeDir);
  const entries = await readdir(absoluteDir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relativePath = path.join(relativeDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFiles(relativePath, predicate));
    } else if (predicate(relativePath.replaceAll(path.sep, '/'))) {
      files.push(relativePath.replaceAll(path.sep, '/'));
    }
  }
  return files;
};

const commandExists = (command, args) => {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8' });
  return result.status === 0;
};

test('active JSON schemas and JSON templates parse cleanly', async () => {
  const files = [
    ...await listFiles('schemas', (file) => file.endsWith('.json')),
    ...await listFiles('templates', (file) => file.endsWith('.json')),
  ];

  for (const file of files) {
    const content = await readFile(fromRoot(file), 'utf8');
    assert.doesNotThrow(() => JSON.parse(content), `${file} should parse as JSON`);
  }
});

test('active package and runtime JavaScript entrypoints pass node --check', async () => {
  const files = [
    'package/build-package.mjs',
    ...await listFiles('bin', (file) => file.endsWith('.mjs')),
    ...await listFiles('scripts', (file) => (file.endsWith('.mjs') || file.endsWith('.js')) && !file.includes('/fixtures/')),
  ];
  const failures = [];

  for (const file of files) {
    const result = spawnSync(process.execPath, ['--check', file], {
      cwd: root,
      encoding: 'utf8',
    });
    if (result.status !== 0) {
      failures.push(`${file}: ${result.stderr || result.stdout}`);
    }
  }

  assert.deepEqual(failures, [], failures.join('\n'));
});

test('active shell entrypoints pass bash syntax when bash is available', () => {
  if (!commandExists('bash', ['--version'])) {
    return;
  }

  const files = [
    'install-claude.sh',
    'scripts/install-browser-runtime.sh',
    'skills/moonshot-relay-setup/scripts/install-account-root.sh',
    'agents/verification/verify-changes.sh',
    'agents/verification/verify-runtime.sh',
  ];
  const failures = [];

  for (const file of files) {
    const result = spawnSync('bash', ['-n', file], {
      cwd: root,
      encoding: 'utf8',
    });
    if (result.status !== 0) {
      failures.push(`${file}: ${result.stderr || result.stdout}`);
    }
  }

  assert.deepEqual(failures, [], failures.join('\n'));
});

test('active PowerShell installers parse when PowerShell is available', () => {
  const shell = commandExists('pwsh', ['-NoProfile', '-Command', '$PSVersionTable.PSVersion.ToString()'])
    ? 'pwsh'
    : commandExists('powershell', ['-NoProfile', '-Command', '$PSVersionTable.PSVersion.ToString()'])
      ? 'powershell'
      : '';
  if (!shell) {
    return;
  }

  const files = [
    'install-claude.ps1',
    'skills/moonshot-relay-setup/scripts/install-account-root.ps1',
  ];
  const failures = [];

  for (const file of files) {
    const command = `$tokens=$errors=$null; [System.Management.Automation.PSParser]::Tokenize((Get-Content -Raw -LiteralPath '${fromRoot(file).replaceAll("'", "''")}'), [ref]$errors) | Out-Null; if ($errors.Count -gt 0) { $errors | ForEach-Object { Write-Error $_.Message }; exit 1 }`;
    const result = spawnSync(shell, ['-NoProfile', '-Command', command], {
      cwd: root,
      encoding: 'utf8',
    });
    if (result.status !== 0) {
      failures.push(`${file}: ${result.stderr || result.stdout}`);
    }
  }

  assert.deepEqual(failures, [], failures.join('\n'));
});
