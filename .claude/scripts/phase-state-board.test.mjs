#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { buildPhaseStateBoard, evaluateCloseoutReadiness } from './phase-state-board.mjs';

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'phase-state-board-'));
}

function writeFile(filePath, text) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text, 'utf8');
}

function statusYaml(overrides = {}) {
  return `
schemaVersion: "1.0"
masterPlan: "docs/implementation/sample/00-master-plan-v1.md"
executionMode: ${overrides.executionMode || 'forked-agent'}
executionRoot: "docs/implementation/sample/execution"
activeExecutionStatus: paused
activeCurrentStage: ready/isolate
activePhaseNumber: ${overrides.activePhaseNumber || 3}
activePhaseTitle: "Phase 03 - State Authority Refactor"
activeRunLeaseId: "${overrides.activeRunLeaseId || ''}"
phases:
  - number: 2
    title: "Phase 02 - Control Plane Registry"
    status: completed
    attempts:
      total: 1
      lastOutcome: completed
  - number: 3
    title: "Phase 03 - State Authority Refactor"
    status: ${overrides.phase3Status || 'pending'}
    attempts:
      total: ${overrides.phase3Attempts || 0}
      lastOutcome: ${overrides.phase3Outcome || 'pending'}
`;
}

test('state board emits one authoritative next action with forked-agent attempt identity', () => {
  const root = tempDir();
  writeFile(path.join(root, '.claude/docs/phase-status.yaml'), statusYaml());

  const board = buildPhaseStateBoard({ rootDir: root });

  assert.equal(board.sourceAuthority, 'phase-status.yaml');
  assert.deepEqual(board.nextAction, {
    type: 'execute_phase',
    phaseNumber: 3,
    phaseTitle: 'Phase 03 - State Authority Refactor',
  });
  assert.equal(board.forkedAgentAttempt.owner, 'forked-agent');
  assert.equal(board.parentEvidenceCollection.owner, 'parent-session');
  assert.equal(board.parentEvidenceCollection.status, 'collecting');
});

test('stale projection fixtures produce typed stale warnings', () => {
  const root = tempDir();
  writeFile(path.join(root, '.claude/docs/phase-status.yaml'), statusYaml());
  writeFile(path.join(root, '.claude/logs/workflow-enforcement/latest-dispatch.json'), JSON.stringify({
    status: 'running',
    phaseNumber: 2,
    planDir: path.join(root, 'docs/implementation/sample'),
  }));

  const board = buildPhaseStateBoard({ rootDir: root });

  assert.ok(board.staleReadModelWarnings.some((warning) => warning.type === 'stale_read_model_projection'));
  assert.ok(board.staleReadModelWarnings.some((warning) => warning.reason === 'projection_phase_mismatch'));
});

test('fallback mode marks delegated-terminal and agent-loop as non-authoritative fallback state', () => {
  const root = tempDir();
  writeFile(path.join(root, '.claude/docs/phase-status.yaml'), statusYaml({ executionMode: 'delegated-terminal' }));

  const board = buildPhaseStateBoard({ rootDir: root });

  assert.equal(board.fallbackAdapterState.mode, 'delegated-terminal');
  assert.equal(board.fallbackAdapterState.adapter, 'agent-loop.mjs');
  assert.equal(board.fallbackAdapterState.authoritative, false);
  assert.ok(board.staleReadModelWarnings.some((warning) => warning.type === 'fallback_execution_mode_selected'));
});

test('closeout reader uses board state and blocks when parent evidence is incomplete', () => {
  const root = tempDir();
  writeFile(path.join(root, '.claude/docs/phase-status.yaml'), statusYaml({ phase3Status: 'in_progress', phase3Outcome: 'running' }));

  const board = buildPhaseStateBoard({ rootDir: root });
  const readiness = evaluateCloseoutReadiness(board);

  assert.equal(readiness.allowed, false);
  assert.equal(readiness.parentEvidenceCollection.status, 'collecting');
  assert.deepEqual(readiness.blockingReasons, ['active_phase_not_completed', 'parent_evidence_not_collected']);
});

test('closeout reader allows completed phase only after parent evidence is collected', () => {
  const root = tempDir();
  writeFile(path.join(root, '.claude/docs/phase-status.yaml'), statusYaml({ phase3Status: 'completed', phase3Attempts: 1, phase3Outcome: 'completed' }));

  const board = buildPhaseStateBoard({ rootDir: root });
  const readiness = evaluateCloseoutReadiness(board);

  assert.equal(readiness.allowed, true);
  assert.equal(readiness.parentEvidenceCollection.status, 'collected');
});
