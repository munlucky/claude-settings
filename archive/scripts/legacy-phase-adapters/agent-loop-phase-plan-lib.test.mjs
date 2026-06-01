import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  ensureExecutionArtifacts,
  extractAtomicTasksFromPhaseDoc,
  renderAtomicWorksetsYaml,
} from './agent-loop-phase-plan-lib.mjs';

test('phase plan lib accepts Purpose, Tasks, and bullet Acceptance Criteria aliases', () => {
  withPhaseDoc([
    '# Phase 09',
    '',
    '## Purpose',
    '- Keep harness closeout stable across synced project plans.',
    '',
    '## Tasks',
    '- [ ] Patch the runner state projection.',
    '- [ ] Add regression coverage for the synced harness incident.',
    '',
    '## Acceptance Criteria',
    '- Runner state projection classifies the incident without a terminal false block.',
    '- Regression tests cover the synced harness behavior.',
    '',
    '## Phase Execution Metadata',
    '- Runtime: codex',
    '- Owner: harness-maintainer',
    '',
    '## Verification Commands',
    '- `node --test scripts/agent-loop-phase-plan-lib.test.mjs`',
    '',
    '## Owned Paths',
    '| Path | Notes |',
    '|---|---|',
    '| `scripts/agent-loop-phase-plan-lib.mjs` | source |',
    '',
  ], ({ root, phaseDoc }) => {
    const tasks = extractAtomicTasksFromPhaseDoc(phaseDoc);
    assert.equal(tasks.length, 2);
    assert.equal(tasks[0].title, 'Patch the runner state projection.');
    assert.equal(tasks[0].acceptanceCriterionId, 'AC-001');
    assert.equal(tasks[1].acceptanceCriterionId, 'AC-002');

    const worksets = renderAtomicWorksetsYaml('09', phaseDoc);
    assert.match(worksets, /Patch the runner state projection\./);
    assert.match(worksets, /Add regression coverage for the synced harness incident\./);

    const masterPlan = path.join(root, '00-master-plan-v1.md');
    const executionRoot = path.join(root, 'execution');
    fs.writeFileSync(masterPlan, '# Master Plan\n', 'utf8');
    const artifacts = ensureExecutionArtifacts({
      phaseNum: 9,
      phaseTitle: 'Harness Sync',
      phaseDoc,
      masterPlan,
      executionRoot,
      verificationContractFile: '',
      targetCompletionScore: 100,
      scorecardProfile: 'default',
      workspaceRoot: root,
    });
    const goalContract = fs.readFileSync(artifacts.phaseGoalContract, 'utf8');
    assert.match(goalContract, /objective: "Keep harness closeout stable across synced project plans\."/);
    assert.match(goalContract, /readinessDecision: "executable"/);
    assert.doesNotMatch(goalContract, /GAP-GOAL/);
    assert.doesNotMatch(goalContract, /GAP-SCOPE/);
    assert.doesNotMatch(goalContract, /GAP-AC/);
  });
});

function withPhaseDoc(lines, callback) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-plan-lib-'));
  try {
    const phaseDoc = path.join(root, '09-harness-sync.md');
    fs.writeFileSync(phaseDoc, `${lines.join('\n')}\n`, 'utf8');
    callback({ root, phaseDoc });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}
