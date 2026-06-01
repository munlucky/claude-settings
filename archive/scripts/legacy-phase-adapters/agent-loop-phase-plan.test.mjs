import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  countTotalPhases,
  getPhaseDoc,
  getPhaseTitle,
  getNextPhase,
  validateStatusPlanIdentity,
} from './agent-loop-phase-plan.mjs';
import { validateCloseoutSynchronization } from './workflow-enforcement.mjs';

test('get-next-phase prefers pending_reverify before pending phases', () => {
  withStatusFile([
    'phases:',
    '  - number: 9',
    '    status: pending',
    '    planConfirmed: true',
    '  - number: 10',
    '    status: pending_reverify',
    '    planConfirmed: true',
    '',
  ], (statusFile) => {
    assert.equal(getNextPhase(statusFile), '10');
  });
});

test('get-next-phase does not skip blocked phases by default', () => {
  withStatusFile([
    'phases:',
    '  - number: 9',
    '    status: verification_blocked',
    '    planConfirmed: true',
    '  - number: 10',
    '    status: pending',
    '    planConfirmed: true',
    '',
  ], (statusFile) => {
    assert.equal(getNextPhase(statusFile), '');
  });
});

test('phase discovery uses phase-status as truth source after archive sync', () => {
  withTempPlan((paths) => {
    const archivedPhase = path.join(paths.planDir, 'close', '01-archived-phase.md');
    const activePhase = path.join(paths.planDir, '02-active-phase.md');
    fs.mkdirSync(path.dirname(archivedPhase), { recursive: true });
    fs.writeFileSync(archivedPhase, '# Phase 01: Archived Phase\n', 'utf8');
    fs.writeFileSync(activePhase, '# Phase 02: Active Phase\n', 'utf8');
    fs.writeFileSync(path.join(paths.planDir, '00-master-plan-v1.md'), '# Master\n', 'utf8');
    fs.writeFileSync(paths.statusFile, [
      'schemaVersion: "1.0"',
      `masterPlan: "${path.join(paths.planDir, '00-master-plan-v1.md')}"`,
      'phases:',
      '  - number: 1',
      '    title: "Archived Phase"',
      '    status: completed',
      `    archivedPhaseDoc: "${archivedPhase}"`,
      '  - number: 2',
      '    title: "Active Phase"',
      '    status: pending',
      `    activePhaseDoc: "${activePhase}"`,
      '',
    ].join('\n'), 'utf8');

    assert.equal(countTotalPhases(paths.planDir, paths.statusFile), '2');
    assert.equal(getPhaseDoc(paths.planDir, '1', paths.statusFile), archivedPhase);
    assert.equal(getPhaseDoc(paths.planDir, '2', paths.statusFile), activePhase);
    assert.equal(getPhaseTitle(paths.planDir, '1', paths.statusFile), 'Phase 01: Archived Phase');
  });
});

test('phase discovery rejects stale phase-status from another plan directory', () => {
  withTempPlan((paths) => {
    const otherPlanDir = path.join(paths.root, 'docs', 'other-plan');
    fs.mkdirSync(otherPlanDir, { recursive: true });
    fs.writeFileSync(paths.statusFile, [
      'schemaVersion: "1.0"',
      `masterPlan: "${path.join(otherPlanDir, '00-master-plan-v1.md')}"`,
      'phases:',
      '  - number: 1',
      '    status: completed',
      '',
    ].join('\n'), 'utf8');

    const identity = validateStatusPlanIdentity(paths.planDir, paths.statusFile);
    assert.equal(identity.ok, false);
    assert.equal(identity.reason, 'plan-status-mismatch');
    assert.throws(() => countTotalPhases(paths.planDir, paths.statusFile), /plan-status-mismatch/);
  });
});

test('validate-closeout-synchronization rejects retry_loop and scope_complete contradictions', () => {
  withTempCloseoutArtifacts((paths) => {
    fs.writeFileSync(paths.qaReport, [
      '# QA',
      '',
      '## Verdict',
      '- Status: passed',
      '- Summary: fixture',
      '- Scope status: complete',
      '- Next path: retry_loop',
      '- Closeout reason: scope_complete',
      '',
      '## Review Checkpoint',
      '- Review completed: yes',
      '- Review owners: codex-review-code',
      '- Review-driven code changes:',
      '',
      '## Finish Readiness',
      '- Fresh evidence confirmed: yes',
      '- Why this round may stop now: fixture',
      '- Remaining in-scope work: none',
      '- Remaining blockers before closeout: none',
      '- Checks to rerun if code changes again: none',
      '',
      '## Score Summary',
      '- Current score: 100',
      '- Target score: 100',
      '- Unmet checklist items: 0',
      '- Blocking defects: 0',
      '- Verdict: done',
      '',
    ].join('\n'), 'utf8');
    fs.writeFileSync(paths.scorecard, [
      '# Scorecard',
      '',
      '## Score Summary',
      '- Current score: 100',
      '- Target score: 100',
      '- Unmet checklist items: 0',
      '- Blocking defects: 0',
      '- Verdict: done',
      '',
      '## Task-Level Status Adapter',
      '- Status: FULL | PARTIAL | NO',
      '- Current task status: FULL',
      '- Partial threshold: 60',
      '',
    ].join('\n'), 'utf8');
    fs.writeFileSync(paths.handoff, [
      '# Handoff',
      '',
      '## Status',
      '- Required: no',
      '- Reason: clean finish marker',
      '',
      '## Resume Trigger',
      '- Why this handoff exists: clean-finish marker only',
      '- Stop reason: phase_local_closeout_marker',
      '- Why this cannot continue in the current round: none',
      '- Condition to resume: none',
      '',
      '## Checks To Rerun',
      '- Review: none',
      '- Verification: none',
      '- Runtime flow: none',
      '',
      '## Remaining Scope',
      '- Remaining in-scope work: none',
      '- Next planned phase or slice: none',
      '',
    ].join('\n'), 'utf8');

    const violations = validateCloseoutSynchronization({
      qaReportPath: paths.qaReport,
      scorecardPath: paths.scorecard,
      handoffPath: paths.handoff,
    });

    assert.ok(violations.some((item) => item.includes('retry_loop requires Closeout reason = verification_failed')));
    assert.ok(violations.some((item) => item.includes('retry_loop requires Verdict = retry')));
  });
});

function withStatusFile(lines, callback) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-plan-'));
  try {
    const statusFile = path.join(root, 'phase-status.yaml');
    fs.writeFileSync(statusFile, `${lines.join('\n')}\n`, 'utf8');
    callback(statusFile);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function withTempPlan(callback) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-plan-root-'));
  try {
    const planDir = path.join(root, 'docs', 'implementation', 'active-plan');
    const statusFile = path.join(root, '.claude', 'docs', 'phase-status.yaml');
    fs.mkdirSync(planDir, { recursive: true });
    fs.mkdirSync(path.dirname(statusFile), { recursive: true });
    callback({ root, planDir, statusFile });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function withTempCloseoutArtifacts(callback) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-closeout-'));
  try {
    callback({
      root,
      qaReport: path.join(root, 'QA_REPORT.md'),
      scorecard: path.join(root, 'SCORECARD.md'),
      handoff: path.join(root, 'HANDOFF.md'),
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}
