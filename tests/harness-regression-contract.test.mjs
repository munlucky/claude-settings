import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

import { classifyFailure } from '../scripts/lib/failure-classifier.mjs';
import { diagnoseShellCommand } from '../scripts/lib/shell-command-diagnostics.mjs';

test('verify-plan-conformance compatibility specimen rejects plan-level options with an artifact-level alternative', () => {
  const result = spawnSync(process.execPath, [
    'archive/scripts/legacy-phase-adapters/verify-plan-conformance.mjs',
    '--status-file',
    '.claude/docs/phase-status.yaml',
  ], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });

  assert.equal(result.status, 64);
  assert.match(result.stderr, /Unsupported plan-level option/);
  assert.match(result.stderr, /verify-phase-closeout\.mjs --plan-dir <path> --master-plan <path> --status-file <path> --json/);
  assert.match(result.stderr, /verify-plan-conformance\.mjs --phase-doc <path>/);
});

test('active tests do not import archive runtime helpers', async () => {
  const { readdir, readFile } = await import('node:fs/promises');
  const path = await import('node:path');
  const testsDir = path.join(process.cwd(), 'tests');
  const files = (await readdir(testsDir))
    .filter((name) => name.endsWith('.test.mjs') && name !== 'harness-regression-contract.test.mjs');
  const violations = [];

  for (const file of files) {
    const text = await readFile(path.join(testsDir, file), 'utf8');
    if (/\.\.\/archive\/scripts\/legacy-phase-adapters/.test(text)) {
      violations.push(file);
    }
  }

  assert.deepEqual(violations, []);
});

test('PowerShell parser mistakes are diagnosed as operator command syntax errors', () => {
  const hereDoc = diagnoseShellCommand("node <<'EOF'\nconsole.log('x')\nEOF", {
    shell: 'powershell.exe',
  });
  const parserError = diagnoseShellCommand('ParserError: Missing file specification after redirection operator.', {
    shell: 'pwsh.exe',
  });

  assert.equal(hereDoc.ok, false);
  assert.equal(hereDoc.code, 'powershell_command_syntax');
  assert.match(hereDoc.example, /@'[\s\S]*'@ \| node -/);
  assert.equal(parserError.ok, false);
  assert.equal(parserError.code, 'powershell_command_syntax');
});

test('failure classifier treats PowerShell parser errors as operator errors', () => {
  for (const detail of [
    'ParserError: Missing file specification after redirection operator.',
    'The \'<\' operator is reserved for future use.',
    'Array index expression is missing or not valid.',
    'Unexpected token \']\' in expression or statement.',
  ]) {
    const classification = classifyFailure({ name: 'operator.powershell', detail });
    assert.equal(classification.code, 'powershell_command_syntax');
    assert.equal(classification.category, 'operator_error');
    assert.equal(classification.decision, 'fix_command');
  }
});
