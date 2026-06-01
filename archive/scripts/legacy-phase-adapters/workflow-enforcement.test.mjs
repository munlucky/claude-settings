import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  authoritativePlanCloseoutPassed,
  parsePhaseStatusSummary,
} from './workflow-enforcement.mjs';

const nodeBin = process.execPath;
const workflowScript = path.join(path.dirname(fileURLToPath(import.meta.url)), 'workflow-enforcement.mjs');

test('authoritative closeout passes only when finished phase status has canonical closeout evidence', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-authoritative-closeout-'));
  const previousCwd = process.cwd();
  try {
    writeCloseoutFixture(root);
    process.chdir(root);

    const summary = parsePhaseStatusSummary('.claude/docs/phase-status.yaml');
    assert.equal(summary.activeExecutionStatus, 'finished');
    assert.equal(summary.activeActionablePhasesRemaining, 0);
    assert.equal(authoritativePlanCloseoutPassed(summary), true);

    assert.equal(authoritativePlanCloseoutPassed({
      ...summary,
      activeActionablePhasesRemaining: 1,
    }), false);
    assert.equal(authoritativePlanCloseoutPassed({
      ...summary,
      activeExecutionStatus: 'prepared',
    }), false);
  } finally {
    process.chdir(previousCwd);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function writeCloseoutFixture(root) {
  const docsDir = path.join(root, 'docs/implementation');
  const closeDir = path.join(docsDir, 'close');
  const executionDir = path.join(docsDir, 'execution/01-feature');
  const claudeDir = path.join(root, '.claude');
  fs.mkdirSync(closeDir, { recursive: true });
  fs.mkdirSync(executionDir, { recursive: true });
  fs.mkdirSync(path.join(claudeDir, 'docs'), { recursive: true });

  fs.writeFileSync(path.join(docsDir, '00-master-plan-v1.md'), [
    '# Master Plan',
    '',
    '## Phase Completion Checklist',
    '- [x] Phase 01 - Feature (`docs/implementation/01-feature.md`)',
    '',
  ].join('\n'), 'utf8');

  fs.writeFileSync(path.join(closeDir, '01-feature.md'), [
    '# Phase 01: Feature',
    '',
    '## Critical Product Scenarios',
    '| ID | User-Visible Expectation | Verification Command | Expected Signal | Evidence Path |',
    '|----|--------------------------|----------------------|-----------------|---------------|',
    '| SCN-01-1 | Rendered feature is visible | `npm test` | feature visible pass | `QA_REPORT.md` |',
    '',
    '## Exact Execution Targets',
    '| ID | Files To Create | Files To Modify | Files To Test | Commands | Expected Fail/Pass Signals |',
    '|----|-----------------|-----------------|---------------|----------|----------------------------|',
    '| P01-1 | `src/feature.ts` | none | `tests/feature.test.ts` | `npm test` | pass |',
    '',
  ].join('\n'), 'utf8');

  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src/feature.ts'), 'export const ok = true;\n', 'utf8');
  fs.writeFileSync(path.join(claudeDir, 'docs/phase-status.yaml'), [
    'schemaVersion: "1.0"',
    'masterPlan: "docs/implementation/00-master-plan-v1.md"',
    'planDir: "docs/implementation"',
    'executionRoot: "docs/implementation/execution"',
    'activeExecutionStatus: finished',
    'activeActionablePhasesRemaining: 0',
    'phases:',
    '  - number: 1',
    '    title: "Phase 01: Feature"',
    '    status: completed',
    '    attempts:',
    '      total: 1',
    '      lastOutcome: completed',
    '    timing:',
    '      lastStage: finish',
    '    sprintContract: "docs/implementation/execution/01-feature/SPRINT_CONTRACT.md"',
    '    qaReport: "docs/implementation/execution/01-feature/QA_REPORT.md"',
    '    handoff: "docs/implementation/execution/01-feature/HANDOFF.md"',
    '    scorecard: "docs/implementation/execution/01-feature/SCORECARD.md"',
    '    archivedPhaseDoc: "docs/implementation/close/01-feature.md"',
    '',
  ].join('\n'), 'utf8');

  fs.writeFileSync(path.join(executionDir, 'SPRINT_CONTRACT.md'), [
    '# Sprint Contract',
    '',
    '## Source Plan Requirements Snapshot',
    '| P01-1 | `src/feature.ts` | none | `tests/feature.test.ts` | `npm test` | pass |',
    '',
    '## Spec Deviation Ledger',
    '- none',
    '',
  ].join('\n'), 'utf8');
  fs.writeFileSync(path.join(executionDir, 'QA_REPORT.md'), [
    '# QA Report',
    '',
    '## Verdict',
    '- Next path: clean_finish',
    '- Scope status: complete',
    '',
    '## Plan Conformance Review',
    '- Source plan conformance command: pass',
    '- SCN-01-1: pass - rendered feature is visible.',
    '',
    '## Finish Readiness',
    '- Remaining blockers before closeout: none',
    '',
  ].join('\n'), 'utf8');
  fs.writeFileSync(path.join(executionDir, 'SCORECARD.md'), [
    '# Scorecard',
    '',
    '## Objective Checklist',
    '| OBJ-CONFORM | pass |',
    '',
    '## Score Summary',
    '- Verdict: done',
    '',
    '## Task-Level Status Adapter',
    '- Current task status: FULL',
    '',
  ].join('\n'), 'utf8');
  fs.writeFileSync(path.join(executionDir, 'HANDOFF.md'), [
    '# Handoff',
    '',
    '## Status',
    '- Required: no',
    '',
    '## Resume Trigger',
    '- Stop reason: clean_finish',
    '',
  ].join('\n'), 'utf8');
  fs.writeFileSync(path.join(docsDir, 'execution/REQUIREMENTS_TRACEABILITY.md'), [
    '# Requirements Traceability',
    '',
    '| ID | Requirement | Evidence | Status |',
    '|----|-------------|----------|--------|',
    '| REQ-01-1 | Render feature | `QA_REPORT.md` | verified |',
    '',
  ].join('\n'), 'utf8');
  fs.writeFileSync(path.join(docsDir, 'execution/SCENARIO_MATRIX.md'), [
    '# Scenario Matrix',
    '',
    '| ID | Requirement | Scenario | Evidence | Status |',
    '|----|-------------|----------|----------|--------|',
    '| SCN-01-1 | REQ-01-1 | Rendered feature is visible | `QA_REPORT.md` | verified |',
    '',
  ].join('\n'), 'utf8');
  fs.writeFileSync(path.join(claudeDir, 'verification-verdict-phase01-final.json'), JSON.stringify({
    verdict: 'passed',
    evidenceFresh: true,
    blocking: false,
    score: { verdict: 'done' },
  }, null, 2), 'utf8');
}

test('record-dispatch does not persist self-healing stale projection warnings', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-enforcement-'));
  try {
    const statusFile = path.join(root, '.claude/docs/phase-status.yaml');
    const workflowDir = path.join(root, '.claude/logs/workflow-enforcement');
    fs.mkdirSync(path.dirname(statusFile), { recursive: true });
    fs.mkdirSync(workflowDir, { recursive: true });

    fs.writeFileSync(statusFile, [
      'schemaVersion: "1.0"',
      'masterPlan: "docs/implementation/00-master-plan-v4.md"',
      'executionRoot: "docs/implementation/execution/replay-lens-gamestate-timeline-replay-runtime-v4"',
      'phases:',
      '  - number: 19',
      '    title: "Phase 19"',
      '    status: pending',
      '    planConfirmed: true',
      '',
    ].join('\n'), 'utf8');

    const stalePayload = `${JSON.stringify({ stale: true }, null, 2)}\n`;
    const latestDispatch = path.join(workflowDir, 'latest-dispatch.json');
    const currentRun = path.join(workflowDir, 'current-run.json');
    fs.writeFileSync(latestDispatch, stalePayload, 'utf8');
    fs.writeFileSync(currentRun, stalePayload, 'utf8');

    const oldTime = new Date('2026-05-18T07:00:00Z');
    const newTime = new Date('2026-05-18T07:10:00Z');
    fs.utimesSync(latestDispatch, oldTime, oldTime);
    fs.utimesSync(currentRun, oldTime, oldTime);
    fs.utimesSync(statusFile, newTime, newTime);

    execFileSync(nodeBin, [
      workflowScript,
      'record-dispatch',
      '--plan-dir', 'docs/implementation',
      '--execution-mode', 'phase-runner',
      '--execution-root', 'docs/implementation/execution/replay-lens-gamestate-timeline-replay-runtime-v4',
      '--runtime', 'codex',
      '--status-file', '.claude/docs/phase-status.yaml',
      '--master-plan', 'docs/implementation/00-master-plan-v4.md',
    ], { cwd: root, stdio: 'pipe' });

    const nextCurrent = JSON.parse(fs.readFileSync(currentRun, 'utf8'));
    const nextLatest = JSON.parse(fs.readFileSync(latestDispatch, 'utf8'));
    for (const payload of [nextCurrent, nextLatest]) {
      assert.deepEqual(payload.compactStatus.staleWarnings, []);
      assert.equal(payload.compactStatus.currentBlocker, 'verification_pending');
      assert.equal(payload.resumeBrief.nextAction, 'run_review_then_verification');
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
