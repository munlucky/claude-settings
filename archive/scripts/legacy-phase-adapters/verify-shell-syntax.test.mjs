import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { diagnoseShellCommand, evaluateShellSyntax } from './verify-shell-syntax.mjs';

test('passes files with LF endings and successful bash syntax check', () => {
  withFixture((root) => {
    const filePath = writeFile(root, 'ok.sh', '#!/usr/bin/env bash\nset -euo pipefail\n');
    const result = evaluateShellSyntax([], {
      files: [filePath],
      runSyntaxCheck: () => ({ status: 0, stdout: '', stderr: '', error: '' }),
    });

    assert.equal(result.status, 0);
    assert.match(result.lines.join('\n'), /Shell syntax policy passed/);
  });
});

test('fails missing shell files', () => {
  const result = evaluateShellSyntax([], {
    files: ['missing.sh'],
    runSyntaxCheck: () => ({ status: 0, stdout: '', stderr: '', error: '' }),
  });

  assert.equal(result.status, 1);
  assert.equal(result.failures[0].reason, 'missing_shell_file');
});

test('fails CRLF shell files before invoking bash', () => {
  withFixture((root) => {
    const filePath = writeFile(root, 'crlf.sh', '#!/usr/bin/env bash\r\nset -e\r\n');
    let invoked = false;
    const result = evaluateShellSyntax([], {
      files: [filePath],
      runSyntaxCheck: () => {
        invoked = true;
        return { status: 0, stdout: '', stderr: '', error: '' };
      },
    });

    assert.equal(result.status, 1);
    assert.equal(result.failures[0].reason, 'crlf_line_endings');
    assert.equal(invoked, false);
  });
});

test('reports bash spawn failure as verifier unavailable', () => {
  withFixture((root) => {
    const filePath = writeFile(root, 'ok.sh', '#!/usr/bin/env bash\n');
    const result = evaluateShellSyntax([], {
      files: [filePath],
      runSyntaxCheck: () => ({ status: null, stdout: '', stderr: '', error: 'spawnSync bash EPERM' }),
    });

    assert.equal(result.status, 2);
    assert.equal(result.unavailable[0].reason, 'spawnSync bash EPERM');
  });
});

test('diagnoses POSIX env prefix in PowerShell with env example', () => {
  const diagnostic = diagnoseShellCommand('FOO=bar node .claude/scripts/verify-plan-conformance.mjs --help', {
    shell: 'powershell.exe',
  });

  assert.equal(diagnostic.ok, false);
  assert.equal(diagnostic.code, 'windows_shell_env_syntax');
  assert.match(diagnostic.message, /\$env:FOO='bar'; node/);
});

test('diagnoses POSIX here-doc syntax in PowerShell', () => {
  const diagnostic = diagnoseShellCommand("node <<'EOF'\nconsole.log('x')\nEOF", {
    shell: 'powershell.exe',
  });

  assert.equal(diagnostic.ok, false);
  assert.equal(diagnostic.code, 'powershell_command_syntax');
  assert.match(diagnostic.example, /@'[\s\S]*'@ \| node -/);
});

test('diagnoses PowerShell ParserError text as command syntax', () => {
  const diagnostic = diagnoseShellCommand('ParserError: Array index expression is missing or not valid.', {
    shell: 'pwsh.exe',
  });

  assert.equal(diagnostic.ok, false);
  assert.equal(diagnostic.code, 'powershell_command_syntax');
});

test('accepts PowerShell env assignment syntax', () => {
  const diagnostic = diagnoseShellCommand("$env:FOO='bar'; node .claude/scripts/verify-plan-conformance.mjs --help", {
    shell: 'pwsh.exe',
  });

  assert.equal(diagnostic.ok, true);
});

test('shell syntax evaluation reports PowerShell env prefix failures', () => {
  const result = evaluateShellSyntax([], {
    files: [],
    commands: ['FOO=bar node script.mjs'],
    shell: 'powershell.exe',
    runSyntaxCheck: () => ({ status: 0, stdout: '', stderr: '', error: '' }),
  });

  assert.equal(result.status, 1);
  assert.equal(result.failures[0].reason, 'windows_shell_env_syntax');
  assert.match(result.lines.join('\n'), /\$env:FOO='bar'; node script\.mjs/);
});

function withFixture(callback) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'shell-syntax-'));
  try {
    callback(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function writeFile(root, name, content) {
  const filePath = path.join(root, name);
  fs.writeFileSync(filePath, content, 'utf8');
  return filePath;
}
