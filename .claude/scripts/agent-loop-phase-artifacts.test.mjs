import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { recordPhaseProgressCheckpoint, syncPhaseArtifacts } from './agent-loop-phase-artifacts.mjs';

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

function writeBlockerSidecars(root) {
  const sidecarRoot = path.join(root, 'execution', 'blocker-closeout-prevention-v1', '06-phase-06-artifact-projection-sidecar-v1');
  fs.mkdirSync(sidecarRoot, { recursive: true });
  const sidecarPaths = {
    blockerEvidencePath: path.join(sidecarRoot, 'BLOCKER_EVIDENCE.jsonl'),
    attemptLedgerPath: path.join(sidecarRoot, 'ATTEMPT_LEDGER.jsonl'),
    projectionManifestPath: path.join(sidecarRoot, 'projection-manifest.json'),
  };
  fs.writeFileSync(sidecarPaths.blockerEvidencePath, `${JSON.stringify({
    id: 'blocker-spawn-eperm',
    status: 'open',
    phaseNumber: 6,
    attemptId: 'attempt-phase-06-a',
    transactionId: 'txn-phase-06-a',
    blockerClass: 'verification_environment_unavailable',
    blockerCode: 'spawn_eperm',
    command: 'node --test .claude/scripts/agent-loop-phase-artifacts.test.mjs',
    exitCode: null,
    stderr: 'Error: spawn EPERM',
    detail: 'node --test spawn EPERM blocked verifier execution',
    runtime: 'node:test',
    rerunCommand: 'node --test .claude/scripts/agent-loop-phase-artifacts.test.mjs',
    createdAt: '2026-05-12T09:40:00Z',
    updatedAt: '2026-05-12T09:40:00Z',
  })}\n`, 'utf8');
  fs.writeFileSync(sidecarPaths.attemptLedgerPath, `${JSON.stringify({
    attemptId: 'attempt-phase-06-a',
    parentAttemptId: '',
    transactionId: 'txn-phase-06-a',
    phaseNumber: 6,
    status: 'blocked',
    reason: 'terminal_blocked_published',
    blockerEvidenceId: 'blocker-spawn-eperm',
    createdAt: '2026-05-12T09:40:00Z',
    updatedAt: '2026-05-12T09:40:00Z',
  })}\n`, 'utf8');
  fs.writeFileSync(sidecarPaths.projectionManifestPath, `${JSON.stringify({
    schemaVersion: 'terminal-blocker-projection-manifest-v1',
    transactionId: 'txn-phase-06-a',
    attemptId: 'attempt-phase-06-a',
    phaseNumber: 6,
    blockerEvidenceIds: ['blocker-spawn-eperm'],
    attemptLedgerKeys: ['attempt-phase-06-a:txn-phase-06-a'],
  }, null, 2)}\n`, 'utf8');
  return sidecarPaths;
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
        linkedScenarioIds: ['SCN-06-2'],
        acVerdict: 'passed',
        semanticEvaluation: { status: 'not_run', reason: 'not_applicable_to_current_phase' },
        ownedPaths: ['.claude/scripts/agent-loop-phase-artifacts.mjs'],
        verificationCommands: ['node .claude/scripts/agent-loop-phase-artifacts.mjs self-test'],
        evidence: ['SCN-12 open-act-mutate-persist-recover passed'],
        completedAt: '2026-05-11T12:00:00Z',
      },
      evidenceMetadata: {
        schemaVersion: 'phase-closeout-evidence-v1',
        requirements: {
          'REQ-1.11': { status: 'verified', evidencePath: 'QA_REPORT.md' },
        },
        scenarios: {
          'SCN-06-2': { status: 'passed', evidencePath: 'QA_REPORT.md' },
        },
        blockers: [],
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
    assert.match(fs.readFileSync(paths.qaReportPath, 'utf8'), /## Structured Evidence Metadata[\s\S]*"SCN-06-2"/);
    assert.match(fs.readFileSync(paths.scorecardPath, 'utf8'), /## Structured Evidence Metadata[\s\S]*"REQ-1.11"/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('sync-phase-artifacts renders blocker details from sidecar projections', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-artifacts-sidecar-'));
  try {
    const paths = writeFixture(root);
    const sidecarPaths = writeBlockerSidecars(root);
    syncPhaseArtifacts({
      ...paths,
      sidecarPaths,
      phaseNum: '6',
      phaseTitle: 'Phase 06',
      timestamp: '2026-05-12T09:41:00Z',
      finish: {
        nextPath: 'resume_later_handoff',
        status: 'blocked',
        closeoutReason: 'blocked',
      },
      runtime: {
        stage: 'verify',
        status: 'blocked',
        verdict: 'blocked',
        logFile: '.claude/logs/agent-loop/phase-06.log',
      },
      workset: {
        activeAtomicTask: 'AT-01',
        status: 'blocked',
        semanticEvaluation: { status: 'not_run', reason: 'not_applicable_to_current_phase' },
      },
    });

    const qa = fs.readFileSync(paths.qaReportPath, 'utf8');
    const scorecard = fs.readFileSync(paths.scorecardPath, 'utf8');
    const handoff = fs.readFileSync(paths.handoffPath, 'utf8');

    for (const text of [qa, scorecard, handoff]) {
      assert.match(text, /## Blocker Evidence Projection/);
      assert.match(text, /verification_environment_unavailable\/spawn_eperm/);
      assert.match(text, /node --test \.claude\/scripts\/agent-loop-phase-artifacts\.test\.mjs/);
      assert.match(text, /Error: spawn EPERM/);
      assert.match(text, /blocker-spawn-eperm/);
    }
    assert.doesNotMatch(handoff, /deferred_verification/);
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

test('progress checkpoint preserves terminal blocked scorecard verdict', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-artifacts-blocked-checkpoint-'));
  try {
    const paths = writeFixture(root);
    fs.writeFileSync(paths.scorecardPath, [
      '# Scorecard',
      '',
      '## Score Summary',
      '- Current score: 50',
      '- Target score: 100',
      '- Unmet checklist items: 2',
      '- Blocking defects: 1',
      '- Verdict: blocked',
      '',
      '## Progress Checkpoints',
      '- previous blocked checkpoint',
      '',
    ].join('\n'), 'utf8');

    recordPhaseProgressCheckpoint({
      qaReportPath: paths.qaReportPath,
      scorecardPath: paths.scorecardPath,
      stage: 'execute',
      status: 'controller-execute-retry-started',
      logFile: '.claude/logs/agent-loop/phase-04.log',
      detail: 'scorecard-verdict=blocked',
      runtimeName: 'codex',
    });

    const scorecard = fs.readFileSync(paths.scorecardPath, 'utf8');
    const qa = fs.readFileSync(paths.qaReportPath, 'utf8');
    assert.match(scorecard, /- Verdict: blocked/);
    assert.doesNotMatch(scorecard, /- Verdict: retry/);
    assert.doesNotMatch(qa, /Active phase attempt is running at stage `execute`/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('sync-phase-artifacts preserves code-review-graph marker when rewriting workflow execution', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-artifacts-crg-'));
  try {
    const paths = writeFixture(root);
    const marker = [
      '# code-review-graph-stage:begin',
      'analysisContext:',
      '  codeReviewGraph:',
      '    graphStatus: fresh',
      '    stageCoverage: finish',
      '    evidenceCarrier: phase',
      '    adapterRunId: crg-fixture',
      '    adapterArtifact: execution/phase/evidence/code-review-graph/crg-fixture.json',
      '    adapterArtifactDigest: abc123',
      '    updatedAt: 2026-05-13T12:00:00Z',
      '# code-review-graph-stage:end',
      '',
    ].join('\n');
    fs.appendFileSync(paths.qaReportPath, [
      '',
      '## Workflow Execution',
      '- Selected bundles: stale',
      marker,
    ].join('\n'), 'utf8');

    syncPhaseArtifacts({
      ...paths,
      phaseNum: '7',
      phaseTitle: 'Phase 07',
      timestamp: '2026-05-13T12:01:00Z',
      finish: { nextPath: 'retry_loop', status: 'in_progress' },
      runtime: {
        stage: 'execute',
        status: 'in_progress',
        verdict: 'pending',
        logFile: '.claude/logs/agent-loop/phase-07.log',
      },
      workflow: {
        selectedBundles: 'ready-isolate-bundle, implementation-bundle, review-bundle, verification-bundle, finish-bundle',
        appliedSkills: 'implementation-runner',
        skippedSkills: 'codex-review-code pending',
      },
      workset: {
        activeAtomicTask: 'AT-01',
        status: 'in_progress',
        semanticEvaluation: { status: 'not_run', reason: 'not_applicable_to_current_phase' },
      },
    });

    const qa = fs.readFileSync(paths.qaReportPath, 'utf8');
    assert.equal((qa.match(/# code-review-graph-stage:begin/g) || []).length, 1);
    assert.match(qa, /adapterRunId: crg-fixture/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
