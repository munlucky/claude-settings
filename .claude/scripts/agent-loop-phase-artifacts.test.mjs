import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { syncPhaseArtifacts } from './agent-loop-phase-artifacts.mjs';

function writeFixture(root) {
  const qaReportPath = path.join(root, 'QA_REPORT.md');
  const scorecardPath = path.join(root, 'SCORECARD.md');
  const handoffPath = path.join(root, 'HANDOFF.md');
  const worksetsPath = path.join(root, 'WORKSETS.yaml');
  fs.writeFileSync(qaReportPath, [
    '# QA',
    '',
    '## Verdict',
    '- Status: in_progress',
    '- Summary: fixture',
    '',
  ].join('\n'), 'utf8');
  fs.writeFileSync(scorecardPath, [
    '# Scorecard',
    '',
    '## Objective Checklist',
    '| ID | Category | Weight | Status | Evidence | Notes |',
    '|----|----------|--------|--------|----------|-------|',
    '| OBJ-CONFORM | Source plan conformance verified | 20 | pending | fixture | fixture |',
    '',
    '## Score Summary',
    '- Current score: 0',
    '- Target score: 100',
    '- Unmet checklist items: 1',
    '- Blocking defects: 0',
    '- Verdict: retry',
    '',
    '## Task-Level Status Adapter',
    '- Status: FULL | PARTIAL | NO',
    '- Current task status: NO',
    '- Partial threshold: 60',
    '',
  ].join('\n'), 'utf8');
  fs.writeFileSync(handoffPath, '# Handoff\n', 'utf8');
  fs.writeFileSync(worksetsPath, [
    'schemaVersion: 1',
    'activeAtomicTask: AT-01',
    'atomicTasks:',
    '  - id: AT-01',
    '    title: "Fixture task"',
    '    evidence:',
    '      - stale runtime evidence',
    '    status: pending',
    '    verificationCommands:',
    '      - stale command',
    '    ownedPaths:',
    '      - stale path',
    '    completedAt: null',
    'unknownTopLevel:',
    '  keep: true',
    'worksets: []',
    '',
  ].join('\n'), 'utf8');
  return { qaReportPath, scorecardPath, handoffPath, worksetsPath };
}

test('sync-phase-artifacts rejects clean finish without active log path', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-artifacts-log-'));
  try {
    const paths = writeFixture(root);
    const statePath = path.join(root, 'state.json');
    fs.writeFileSync(statePath, JSON.stringify({
      ...paths,
      phaseNum: '7',
      phaseTitle: 'Phase 07',
      finish: { nextPath: 'clean_finish', status: 'passed' },
      runtime: { status: 'completed', verdict: 'passed' },
    }), 'utf8');

    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    assert.throws(() => syncPhaseArtifacts(state), /active log path/);
    assert.doesNotMatch(fs.readFileSync(paths.qaReportPath, 'utf8'), /Log: none/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('sync-phase-artifacts rejects generated stale phase residue', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-artifacts-stale-'));
  try {
    const paths = writeFixture(root);
    const statePath = path.join(root, 'state.json');
    fs.writeFileSync(statePath, JSON.stringify({
      ...paths,
      phaseNum: '7',
      phaseTitle: 'Phase 07',
      finish: { nextPath: 'retry_loop', status: 'in_progress' },
      runtime: { status: 'in_progress', logFile: '.claude/logs/agent-loop/phase-07.log' },
      workset: {
        activeAtomicTask: 'AT-01',
        status: 'in_progress',
        semanticEvaluation: { status: 'not_run', reason: 'out_of_scope_for_phase_03' },
      },
    }), 'utf8');

    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    assert.throws(() => syncPhaseArtifacts(state), /stale phase residue/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('sync-phase-artifacts renders known WORKSETS fields deterministically and preserves unknown top-level blocks', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-artifacts-worksets-'));
  try {
    const paths = writeFixture(root);
    const statePath = path.join(root, 'state.json');
    const state = {
      ...paths,
      phaseNum: '7',
      phaseTitle: 'Phase 07',
      timestamp: '2026-05-11T12:00:00Z',
      finish: { nextPath: 'clean_finish', status: 'passed' },
      runtime: {
        stage: 'verify',
        status: 'completed',
        verdict: 'passed',
        logFile: '.claude/logs/agent-loop/phase-07.log',
      },
      workset: {
        activeAtomicTask: 'AT-01',
        status: 'completed',
        acceptanceCriterionId: 'AC-001',
        linkedRequirementIds: ['REQ-1.11'],
        acVerdict: 'passed',
        semanticEvaluation: { status: 'not_run', reason: 'not_applicable_to_current_phase' },
        ownedPaths: ['.claude/scripts/agent-loop-phase-artifacts.mjs'],
        verificationCommands: ['node .claude/scripts/agent-loop-phase-artifacts.mjs self-test'],
        evidence: ['SCN-12 open-act-mutate-persist-recover passed'],
        completedAt: '2026-05-11T12:00:00Z',
      },
    };
    fs.writeFileSync(statePath, JSON.stringify(state), 'utf8');

    syncPhaseArtifacts(JSON.parse(fs.readFileSync(statePath, 'utf8')));
    const first = fs.readFileSync(paths.worksetsPath, 'utf8');
    syncPhaseArtifacts(JSON.parse(fs.readFileSync(statePath, 'utf8')));
    const second = fs.readFileSync(paths.worksetsPath, 'utf8');
    assert.equal(second, first);
    assert.match(first, /unknownTopLevel:\n  keep: true/);
    assert.match(first, /status: completed\n    taskStatus: "completed"\n    acceptanceCriterionId: "AC-001"/);
    assert.match(first, /semanticEvaluation:\n      status: "not_run"\n      reason: "not_applicable_to_current_phase"/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('sync-phase-artifacts does not mutate workflow source state files', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-artifacts-read-only-'));
  try {
    const paths = writeFixture(root);
    const workflowDir = path.join(root, '.claude/logs/workflow-enforcement');
    const statusFile = path.join(root, '.claude/docs/phase-status.yaml');
    fs.mkdirSync(workflowDir, { recursive: true });
    fs.mkdirSync(path.dirname(statusFile), { recursive: true });
    const sourceFiles = [
      statusFile,
      path.join(workflowDir, 'current-run.json'),
      path.join(workflowDir, 'active-phase-run.json'),
      path.join(workflowDir, 'latest-dispatch.json'),
    ];
    for (const filePath of sourceFiles) {
      fs.writeFileSync(filePath, `${path.basename(filePath)} source\n`, 'utf8');
    }
    const before = Object.fromEntries(sourceFiles.map((filePath) => [filePath, fs.readFileSync(filePath, 'utf8')]));

    syncPhaseArtifacts({
      ...paths,
      phaseNum: '7',
      phaseTitle: 'Phase 07',
      timestamp: '2026-05-11T12:00:00Z',
      finish: { nextPath: 'retry_loop', status: 'in_progress' },
      runtime: {
        stage: 'execute',
        status: 'in_progress',
        verdict: 'pending',
        logFile: '.claude/logs/agent-loop/phase-07.log',
      },
      workset: {
        activeAtomicTask: 'AT-01',
        status: 'in_progress',
        semanticEvaluation: { status: 'not_run', reason: 'not_applicable_to_current_phase' },
      },
    });

    for (const filePath of sourceFiles) {
      assert.equal(fs.readFileSync(filePath, 'utf8'), before[filePath], filePath);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
