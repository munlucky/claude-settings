import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  evaluateCompletedWorksets,
  normalizeAtomicTaskStatus,
} from './lib/phase-closeout-artifacts.mjs';

test('atomic workset status accepts legacy FULL as completed', () => {
  assert.equal(normalizeAtomicTaskStatus('FULL'), 'completed');

  withWorksets('FULL', (executionDir) => {
    const result = evaluateCompletedWorksets(executionDir);

    assert.equal(result.ok, true);
    assert.equal(result.reason, 'ok');
  });
});

function withWorksets(taskStatus, callback) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-closeout-artifacts-'));
  try {
    fs.writeFileSync(
      path.join(root, 'WORKSETS.yaml'),
      [
        'schemaVersion: 1',
        'activeAtomicTask: AT-01',
        'atomicTasks:',
        '  - id: AT-01',
        '    status: completed',
        `    taskStatus: "${taskStatus}"`,
        '    acceptanceCriterionId: "AC-001"',
        '    linkedRequirementIds:',
        '      - "REQ-01-1"',
        '    acVerdict: "pass"',
        '    verificationEvidence:',
        '      - "QA_REPORT.md"',
        '    ownedPaths:',
        '      - "src/feature.ts"',
        '    verificationCommands:',
        '      - "npm test"',
        '    evidence:',
        '      - "QA_REPORT.md"',
        '',
      ].join('\n'),
      'utf8',
    );
    callback(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}
