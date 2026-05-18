import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  authoritativePlanCloseoutPassed,
  parsePhaseStatusSummary,
} from './workflow-enforcement.mjs';

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
