import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';

const SCRIPT = path.resolve('.claude/scripts/write-verification-verdict.py');

function runWriter(args) {
  return spawnSync('python', [SCRIPT, ...args], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
}

function withTempFile(callback) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verdict-writer-'));
  try {
    callback(path.join(root, 'verdict.json'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('verification mode phase_closeout alone preserves legacy verdict writes', () => {
  withTempFile((output) => {
    const result = runWriter([
      '--output', output,
      '--run-id', 'legacy-run',
      '--phase-number', '5',
      '--phase-title', 'Phase 05',
      '--active-phase-doc-path', 'docs/implementation/phase05.md',
      '--verification-mode', 'phase_closeout',
      '--verdict', 'passed',
      '--evidence-fresh', 'true',
    ]);

    assert.equal(result.status, 0, result.stderr);
    const payload = JSON.parse(fs.readFileSync(output, 'utf8'));
    assert.equal(payload.authoritative, false);
    assert.equal(payload.identityStatus, 'legacy');
  });
});

test('verdict scope phase_closeout requires complete authoritative identity', () => {
  withTempFile((output) => {
    const result = runWriter([
      '--output', output,
      '--run-id', 'authoritative-run',
      '--phase-number', '5',
      '--phase-title', 'Phase 05',
      '--active-phase-doc-path', 'docs/implementation/phase05.md',
      '--verification-mode', 'phase_closeout',
      '--verdict-scope', 'phase_closeout',
      '--verdict', 'passed',
      '--evidence-fresh', 'true',
    ]);

    assert.equal(result.status, 64);
    assert.match(result.stderr, /missing_authoritative_identity/);
    assert.equal(fs.existsSync(output), false);
  });
});
