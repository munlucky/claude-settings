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

test('passed command evidence clears stale missing required checks', () => {
  withTempFile((output) => {
    const result = runWriter([
      '--output', output,
      '--run-id', 'phase04-run',
      '--phase-number', '4',
      '--phase-title', 'Phase 04',
      '--active-phase-doc-path', 'docs/implementation/phase04.md',
      '--verification-mode', 'contract',
      '--verdict', 'failed',
      '--evidence-fresh', 'true',
      '--expected-check', 'phaseRuntimeParity',
      '--expected-check', 'phaseCloseout',
      '--passed-check', 'phaseRuntimeParity',
      '--missing-check', 'phaseRuntimeParity:timeout',
      '--missing-check', 'phaseCloseout:failed',
      '--command', 'PHASE_RUNTIME_PARITY_TARGET_RUNTIMES=codex|PHASE_RUNTIME_PARITY_TARGET_RUNTIMES=codex bash .claude/scripts/verify-phase-runtime-parity.sh .claude/docs/runtime-parity-reference-plan|passed',
      '--command', 'node|node .claude/scripts/verify-phase-closeout.mjs --status-file .claude/docs/phase-status.yaml|passed',
    ]);

    assert.equal(result.status, 0, result.stderr);
    const payload = JSON.parse(fs.readFileSync(output, 'utf8'));
    assert.deepEqual(payload.requiredChecks.expected, ['phaseRuntimeParity', 'phaseCloseout']);
    assert.deepEqual(payload.requiredChecks.passed, ['phaseRuntimeParity', 'phaseCloseout']);
    assert.deepEqual(payload.requiredChecks.missing, []);
  });
});
