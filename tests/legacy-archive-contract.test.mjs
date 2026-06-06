import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

import { evaluateShellSyntax } from '../archive/scripts/legacy-phase-adapters/verify-shell-syntax.mjs';

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

test('legacy shell syntax verifier accepts Windows backslash path input', () => {
  const result = evaluateShellSyntax([
    'skills\\moonshot-relay-setup\\scripts\\install-account-root.sh',
  ], {
    runSyntaxCheck: (filePath) => ({
      status: filePath === 'skills/moonshot-relay-setup/scripts/install-account-root.sh' ? 0 : 1,
      stdout: '',
      stderr: filePath,
      error: '',
    }),
  });

  assert.equal(result.status, 0);
  assert.deepEqual(result.files, ['skills/moonshot-relay-setup/scripts/install-account-root.sh']);
});

test('legacy shell syntax verifier default targets exist in source checkout', () => {
  const result = spawnSync(process.execPath, [
    'archive/scripts/legacy-phase-adapters/verify-shell-syntax.mjs',
  ], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
});
