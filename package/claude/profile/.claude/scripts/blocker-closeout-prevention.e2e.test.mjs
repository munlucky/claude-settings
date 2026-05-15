import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { publishTerminalBlockedOutcome } from './lib/terminal-blocker-publisher.mjs';
import { recordLifecycleTransition } from './lib/lifecycle-projection-writer.mjs';
import { readBlockerSidecarState } from './lib/blocker-sidecar-state.mjs';
import { isEnvironmentBlockerCode } from './lib/failure-classifier.mjs';
import { finalizePhaseCloseout } from './phase-closeout-finalize.mjs';
import { evaluatePhaseCloseout } from './verify-phase-closeout.mjs';
import { config, withFixture } from './verify-phase-closeout-fixtures.mjs';

const FIXTURE_PATH = new URL('./fixtures/blocker-closeout-prevention/terminal-blocked-sequence.json', import.meta.url);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeText(filePath, text) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text, 'utf8');
}

function sidecarPathsFor(executionDir) {
  return {
    blockerEvidencePath: path.join(executionDir, 'BLOCKER_EVIDENCE.jsonl'),
    attemptLedgerPath: path.join(executionDir, 'ATTEMPT_LEDGER.jsonl'),
    projectionManifestPath: path.join(executionDir, 'projection-manifest.json'),
  };
}

function writePhaseHarness(root, fixture) {
  const planDir = path.join(root, 'docs/implementation/e2e');
  const masterPlan = path.join(planDir, '00-master-plan-v1.md');
  const phaseDoc = path.join(planDir, '01-blocker-closeout-fixture-v1.md');
  const executionRoot = path.join(planDir, 'execution/blocker-closeout-prevention-v1');
  const phaseDir = path.join(executionRoot, '01-phase-01-blocker-closeout-fixture-v1');
  const workflowDir = path.join(root, '.claude/logs/workflow-enforcement');
  const statusFile = path.join(root, '.claude/docs/phase-status.yaml');

  writeText(masterPlan, [
    '# Master Plan',
    '',
    '## Phase Completion Checklist',
    '- [ ] Phase 01 - Blocker Closeout Fixture (`docs/implementation/e2e/01-blocker-closeout-fixture-v1.md`)',
    '',
  ].join('\n'));
  writeText(phaseDoc, '# Phase 01: Blocker Closeout Fixture\n');
  writeText(statusFile, [
    'schemaVersion: "1.0"',
    `masterPlan: "${masterPlan}"`,
    `planDir: "${planDir}"`,
    'phases:',
    '  - number: 1',
    `    title: "${fixture.phaseTitle}"`,
    '    status: in_progress',
    `    activePhaseDoc: "${phaseDoc}"`,
    `    sprintContract: "${path.join(phaseDir, 'SPRINT_CONTRACT.md')}"`,
    `    qaReport: "${path.join(phaseDir, 'QA_REPORT.md')}"`,
    `    handoff: "${path.join(phaseDir, 'HANDOFF.md')}"`,
    `    scorecard: "${path.join(phaseDir, 'SCORECARD.md')}"`,
    '',
  ].join('\n'));
  fs.mkdirSync(phaseDir, { recursive: true });
  fs.mkdirSync(workflowDir, { recursive: true });
  return { planDir, masterPlan, phaseDoc, executionRoot, phaseDir, workflowDir, statusFile };
}

function assertTerminalBlockerPreserved(payload) {
  assert.equal(payload.completionStatus, 'blocked');
  assert.equal(payload.attemptOutcome, 'blocked');
  assert.equal(payload.blockingStopReasonCode, 'spawn_eperm');
  assert.match(payload.stopReasonDetail, /spawn EPERM/);
  assert.equal(payload.finalVerdict, 'blocked');
  assert.equal(payload.normalizedRunVerdict, 'complete_with_environment_blocker');
}

function writeVerifierSidecar(root, { status = 'open', manifestOnly = false, sidecarOnly = false, manifestId = 'blocker-spawn-eperm' } = {}) {
  const executionDir = path.join(root, 'docs/implementation/execution/01-feature');
  const paths = sidecarPathsFor(executionDir);
  if (!manifestOnly) {
    fs.writeFileSync(paths.blockerEvidencePath, `${JSON.stringify({
      id: 'blocker-spawn-eperm',
      status,
      phaseNumber: 1,
      attemptId: 'attempt-phase-01-a',
      transactionId: 'txn-phase-01-a',
      blockerClass: 'verification_environment_unavailable',
      blockerCode: 'spawn_eperm',
      command: 'node --test .claude/scripts/blocker-closeout-prevention.e2e.test.mjs',
      stderr: 'Error: spawn EPERM',
      detail: 'node --test spawn EPERM blocked verifier execution',
      createdAt: '2026-05-12T10:10:00Z',
      updatedAt: '2026-05-12T10:10:00Z',
    })}\n`, 'utf8');
    fs.writeFileSync(paths.attemptLedgerPath, `${JSON.stringify({
      attemptId: 'attempt-phase-01-a',
      transactionId: 'txn-phase-01-a',
      phaseNumber: 1,
      status: 'blocked',
      blockerEvidenceId: 'blocker-spawn-eperm',
      createdAt: '2026-05-12T10:10:00Z',
      updatedAt: '2026-05-12T10:10:00Z',
    })}\n`, 'utf8');
  }
  if (!sidecarOnly) {
    fs.writeFileSync(paths.projectionManifestPath, `${JSON.stringify({
      schemaVersion: 'terminal-blocker-projection-manifest-v1',
      transactionId: 'txn-phase-01-a',
      attemptId: 'attempt-phase-01-a',
      phaseNumber: 1,
      blockerEvidenceIds: [manifestId],
      attemptLedgerKeys: ['attempt-phase-01-a:txn-phase-01-a'],
    }, null, 2)}\n`, 'utf8');
  }
}

test('terminal blocked attempt survives publish, heartbeat, lease heartbeat, finalize, and remediation routing', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blocker-closeout-e2e-'));
  const previousCwd = process.cwd();
  const previousWorkflowDir = process.env.WORKFLOW_ENFORCEMENT_LOG_DIR;
  try {
    const fixture = readJson(FIXTURE_PATH);
    const harness = writePhaseHarness(root, fixture);
    process.chdir(root);
    process.env.WORKFLOW_ENFORCEMENT_LOG_DIR = harness.workflowDir;
    const projectionFiles = [
      path.join(harness.workflowDir, 'active-phase-run.json'),
      path.join(harness.workflowDir, 'current-run.json'),
      path.join(harness.workflowDir, 'latest-dispatch.json'),
    ];

    publishTerminalBlockedOutcome({
      planDir: harness.planDir,
      executionRoot: harness.executionRoot,
      phaseNumber: fixture.phaseNumber,
      phaseTitle: fixture.phaseTitle,
      phaseSlug: 'phase-01-blocker-closeout-fixture-v1',
      phaseDoc: harness.phaseDoc,
      attemptId: fixture.attemptId,
      transactionId: fixture.transactionId,
      blockerEvidence: fixture.blockerEvidence,
      projectionFiles,
      writtenAt: '2026-05-12T10:10:00Z',
    });

    for (const filePath of projectionFiles) {
      assertTerminalBlockerPreserved(readJson(filePath));
    }

    recordLifecycleTransition({
      source: 'e2e-dispatch-heartbeat',
      targetStateFiles: projectionFiles,
      primaryTargetStateFile: projectionFiles[2],
      phaseNumber: fixture.phaseNumber,
      phaseTitle: fixture.phaseTitle,
      status: 'running',
      lifecycleEvent: 'dispatch_heartbeat',
      attemptId: fixture.attemptId,
      timestamp: '2026-05-12T10:11:00Z',
      payloadPatch: {
        status: 'running',
        completionStatus: 'running',
        attemptOutcome: 'running',
        blockingStopReasonCode: '',
        stopReasonDetail: '',
        finalVerdict: '',
        normalizedRunVerdict: 'running',
      },
      writeMode: 'merge',
    });
    assertTerminalBlockerPreserved(readJson(path.join(harness.workflowDir, 'current-run.json')));

    const leaseStore = await import(`./lib/phase-run-lease-store.mjs?e2e=${Date.now()}`);
    leaseStore.writeActiveLease(harness.statusFile, {
      runLeaseId: 'lease-heartbeat-a',
      status: 'active',
      completionStatus: 'running',
      attemptOutcome: 'running',
      activePhaseNumber: fixture.phaseNumber,
      activePhaseTitle: fixture.phaseTitle,
    });
    assertTerminalBlockerPreserved(readJson(path.join(harness.workflowDir, 'current-run.json')));

    const finalizeResult = await finalizePhaseCloseout({
      root,
      phase: fixture.phaseNumber,
      statusFile: harness.statusFile,
      planDir: harness.planDir,
      masterPlan: harness.masterPlan,
      executionRoot: harness.phaseDir,
      workflowDir: harness.workflowDir,
      now: '2026-05-12T10:12:00Z',
    });
    assert.equal(finalizeResult.ok, false);
    assert.equal(finalizeResult.sidecarGuard.reason, 'sidecar_open_blocker');
    assertTerminalBlockerPreserved(readJson(path.join(harness.workflowDir, 'current-run.json')));

    const sidecarState = readBlockerSidecarState(sidecarPathsFor(harness.phaseDir));
    const blocker = sidecarState.latestBlockers.active[0];
    const remediationBlocked = blocker.blockerClass === 'verification_environment_unavailable'
      || isEnvironmentBlockerCode(blocker.blockerCode);
    assert.equal(remediationBlocked, true);
  } finally {
    process.chdir(previousCwd);
    if (previousWorkflowDir === undefined) {
      delete process.env.WORKFLOW_ENFORCEMENT_LOG_DIR;
    } else {
      process.env.WORKFLOW_ENFORCEMENT_LOG_DIR = previousWorkflowDir;
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('split-brain and partial publish states are detected without legacy fallback', () => {
  withFixture({ legacyCompletedWorksets: true }, (root) => {
    writeVerifierSidecar(root, { status: 'resolved', manifestId: 'wrong-blocker-id' });
    const result = evaluatePhaseCloseout(config(root));
    assert.equal(result.allowed, false);
    assert.ok(result.violations.some((violation) => violation.code === 'sidecar-manifest-mismatch'));
  });

  withFixture({ legacyCompletedWorksets: true }, (root) => {
    writeVerifierSidecar(root, { manifestOnly: true });
    const result = evaluatePhaseCloseout(config(root));
    assert.equal(result.allowed, false);
    assert.ok(result.violations.some((violation) => violation.code === 'manifest-sidecar-missing'));
  });

  withFixture({ legacyCompletedWorksets: true }, (root) => {
    writeVerifierSidecar(root, { status: 'resolved', sidecarOnly: true });
    const result = evaluatePhaseCloseout(config(root));
    assert.equal(result.allowed, false);
    assert.ok(result.violations.some((violation) => violation.code === 'incomplete-transaction'));
  });
});

test('legacy completed run without sidecar still verifies', () => {
  withFixture({ legacyCompletedWorksets: true }, (root) => {
    const result = evaluatePhaseCloseout(config(root));
    assert.equal(result.allowed, true);
    assert.equal(result.status, 'pass');
  });
});
