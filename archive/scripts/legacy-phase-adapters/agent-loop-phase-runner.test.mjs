import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import { summarizeRetrySuppression } from './agent-loop-phase-runner.mjs';

test('retry suppression ignores passing capability reports with no active blockers', () => {
  withCapabilityReport({
    status: 'passed_with_equivalent_evidence',
    decision: 'continue',
    reason: 'ok',
    sameFailureClassCount: 0,
    currentBlockers: [],
    failureClassCounts: {
      command_not_found: 6,
      docker_daemon_unavailable: 2,
    },
  }, (root) => {
    const summary = summarizeRetrySuppression(root, 'scorecard-verdict=retry');

    assert.equal(summary?.decision, 'continue');
    assert.equal(summary?.reason, 'ok');
    assert.equal(summary?.shouldSuppressRetry, false);
  });
});

test('retry suppression does not convert phase verification failures into preflight blockers when capabilities are healthy', () => {
  withCapabilityReport({
    status: 'passed_with_equivalent_evidence',
    decision: 'continue',
    reason: 'ok',
    sameFailureClassCount: 0,
    currentBlockers: [],
    failureClassCounts: {
      command_not_found: 6,
      docker_daemon_unavailable: 2,
    },
  }, (root) => {
    const summary = summarizeRetrySuppression(root, 'phase11-attempt:verdict=failed');

    assert.equal(summary?.decision, 'continue');
    assert.equal(summary?.reason, 'ok');
    assert.equal(summary?.shouldSuppressRetry, false);
  });
});

function withCapabilityReport(payload, callback) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-runner-'));
  try {
    const logDir = path.join(root, '.claude/logs/agent-loop');
    fs.mkdirSync(logDir, { recursive: true });
    fs.writeFileSync(
      path.join(logDir, 'capabilities-2026-05-15T08-15-34-998Z.json'),
      `${JSON.stringify(payload, null, 2)}\n`,
      'utf8',
    );
    callback(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}
