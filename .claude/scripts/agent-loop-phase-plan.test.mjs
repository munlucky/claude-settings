import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import { getNextPhase } from './agent-loop-phase-plan.mjs';
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
