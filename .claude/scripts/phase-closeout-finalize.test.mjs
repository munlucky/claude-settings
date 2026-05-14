import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { currentIndexVerdictArtifacts, finalizePhaseCloseout, recoveredBlockerFingerprint } from './phase-closeout-finalize.mjs';
import { readCurrentArtifacts, sha256RawBytes } from './lib/current-artifacts-state.mjs';
import {
  patchAttemptManifestChildIdentity,
  patchAttemptManifestExit,
  readAttemptManifest,
  validateAttemptManifest,
  writeAttemptManifestIntent,
} from './lib/phase-attempt-manifest.mjs';
import { dedupePaths, resolveGlobFiles, safeRemove } from './lib/windows-safe-files.mjs';

function writeOpenBlockerSidecar(executionRoot) {
  fs.writeFileSync(path.join(executionRoot, 'BLOCKER_EVIDENCE.jsonl'), `${JSON.stringify({
    id: 'blocker-spawn-eperm',
    status: 'open',
    phaseNumber: 1,
    attemptId: 'attempt-phase-01-a',
    transactionId: 'txn-phase-01-a',
    blockerClass: 'verification_environment_unavailable',
    blockerCode: 'spawn_eperm',
    command: 'node --test .claude/scripts/phase-closeout-finalize.test.mjs',
    stderr: 'Error: spawn EPERM',
    detail: 'node --test spawn EPERM blocked verifier execution',
    createdAt: '2026-05-10T11:59:00Z',
    updatedAt: '2026-05-10T11:59:00Z',
  })}\n`, 'utf8');
  fs.writeFileSync(path.join(executionRoot, 'ATTEMPT_LEDGER.jsonl'), `${JSON.stringify({
    attemptId: 'attempt-phase-01-a',
    transactionId: 'txn-phase-01-a',
    phaseNumber: 1,
    status: 'blocked',
    blockerEvidenceId: 'blocker-spawn-eperm',
    createdAt: '2026-05-10T11:59:00Z',
    updatedAt: '2026-05-10T11:59:00Z',
  })}\n`, 'utf8');
  fs.writeFileSync(path.join(executionRoot, 'projection-manifest.json'), `${JSON.stringify({
    schemaVersion: 'terminal-blocker-projection-manifest-v1',
    transactionId: 'txn-phase-01-a',
    attemptId: 'attempt-phase-01-a',
    phaseNumber: 1,
    blockerEvidenceIds: ['blocker-spawn-eperm'],
    attemptLedgerKeys: ['attempt-phase-01-a:txn-phase-01-a'],
  }, null, 2)}\n`, 'utf8');
}

test('finalize dry-run reports planned writes without mutating closeout files', async () => {
  await withFixture(async (fixture) => {
    const result = await finalizePhaseCloseout({
      root: fixture.root,
      phase: 1,
      statusFile: fixture.statusFile,
      planDir: fixture.planDir,
      masterPlan: fixture.masterPlan,
      executionRoot: fixture.executionRoot,
      workflowDir: fixture.workflowDir,
      now: fixture.now,
      dryRun: true,
      commitToken: 'phase01-test-token',
    });

    assert.equal(result.canonicalVerdictPath, '.claude/verification-verdict-phase01-final.json');
    assert.equal(result.dryRun, true);
    assert.equal(result.canonicalVerdictPath, '.claude/verification-verdict-phase01-final.json');
    assert.equal(result.closeoutPrepRoot, '.claude/logs/workflow-enforcement/closeout-prep/phase01-test-token');
    assert.ok(result.plannedWrites.some((entry) => entry.kind === 'canonical-verdict'));
    assert.ok(result.plannedWrites.some((entry) => entry.kind === 'attempt-local-verdict' && entry.hash));
    assert.equal(fs.existsSync(path.join(fixture.root, '.claude/verification-verdict-phase01-final.json')), false);
    assert.equal(fs.existsSync(path.join(fixture.workflowDir, 'current-artifacts.json')), false);
    assert.equal(readJson(path.join(fixture.workflowDir, 'current-run.json')).status, 'failed');
  });
});

test('finalize keep-prep writes staged candidates without publishing current artifacts', async () => {
  await withFixture(async (fixture) => {
    await finalizePhaseCloseout({
      root: fixture.root,
      phase: 1,
      statusFile: fixture.statusFile,
      planDir: fixture.planDir,
      masterPlan: fixture.masterPlan,
      executionRoot: fixture.executionRoot,
      workflowDir: fixture.workflowDir,
      now: fixture.now,
      dryRun: true,
      keepPrep: true,
      commitToken: 'phase01-prep-only',
    });

    const prepRoot = path.join(fixture.workflowDir, 'closeout-prep/phase01-prep-only');
    assert.equal(fs.existsSync(path.join(prepRoot, '.claude/verification-verdict-phase01-final.json')), true);
    assert.equal(fs.existsSync(path.join(prepRoot, 'closeout-sync-manifest.json')), true);
    assert.equal(fs.existsSync(path.join(prepRoot, 'current-artifacts.json')), true);
    assert.equal(fs.existsSync(path.join(fixture.root, '.claude/verification-verdict-phase01-final.json')), false);
    assert.equal(fs.existsSync(path.join(fixture.workflowDir, 'current-artifacts.json')), false);
  });
});

test('current index verdict artifacts include prior completed phase verdicts', async () => {
  await withFixture(async (fixture) => {
    const phase02Verdict = path.join(fixture.root, '.claude/verification-verdict-phase02-final.json');
    const phase03Verdict = path.join(fixture.root, '.claude/verification-verdict-phase03-final.json');
    fs.writeFileSync(phase02Verdict, '{"verdict":"passed","phase":2}\n', 'utf8');
    fs.writeFileSync(phase03Verdict, '{"verdict":"passed","phase":3}\n', 'utf8');

    const artifacts = currentIndexVerdictArtifacts({
      root: fixture.root,
      phases: [
        { number: 1, status: 'pending' },
        { number: 2, status: 'completed' },
        { number: 4, status: 'pending' },
      ],
      phaseNumber: 3,
      canonicalVerdictPath: phase03Verdict,
      commitToken: 'phase03-current',
    });

    assert.deepEqual(
      artifacts.map((entry) => entry.path).sort(),
      [
        '.claude/verification-verdict-phase02-final.json',
        '.claude/verification-verdict-phase03-final.json',
      ],
    );
    assert.deepEqual(
      artifacts.map((entry) => entry.kind).sort(),
      ['canonical-verdict-phase02', 'canonical-verdict-phase03'],
    );
  });
});

test('finalize writes canonical verdict and reconciles delegated failure as historical warning', async () => {
  await withFixture(async (fixture) => {
    const result = await finalizePhaseCloseout({
      root: fixture.root,
      phase: 1,
      statusFile: fixture.statusFile,
      planDir: fixture.planDir,
      masterPlan: fixture.masterPlan,
      executionRoot: fixture.executionRoot,
      workflowDir: fixture.workflowDir,
      now: fixture.now,
    });

    assert.equal(result.finalVerdict, 'complete');
    assert.equal(result.normalizedRunVerdict, 'success_with_warning');
    assert.equal(result.idempotentNoop, false);
    assert.deepEqual(result.historicalWarnings, ['delegated-terminal-exit-1']);
    const verdict = readJson(path.join(fixture.root, '.claude/verification-verdict-phase01-final.json'));
    const currentIndex = readJson(path.join(fixture.workflowDir, 'current-artifacts.json'));
    assert.equal(verdict.verdict, 'passed');
    assert.equal(verdict.identity.statusFile, fixture.statusFile);
    const phase01Artifact = currentIndex.artifacts['canonical-verdict-phase01'];
    assert.equal(phase01Artifact.sourceAttempt.path, result.attemptLocalVerdict.path);
    assert.equal(phase01Artifact.sourceAttempt.hash, sha256RawBytes(path.join(fixture.root, result.attemptLocalVerdict.path)));
    assert.equal(phase01Artifact.sourceAttempt.hash, phase01Artifact.hash);
    assert.equal(readJson(path.join(fixture.workflowDir, 'current-run.json')).completionStatus, 'completed');
    assert.equal(readJson(path.join(fixture.workflowDir, 'current-run.json')).finalOutcomeSchemaVersion, '1.0');
    assert.equal(readJson(path.join(fixture.workflowDir, 'current-run.json')).normalizedRunVerdict, 'success_with_warning');
    assert.equal(readJson(path.join(fixture.workflowDir, 'latest-dispatch.json')).status, 'superseded');
    const statusText = fs.readFileSync(fixture.statusFile, 'utf8');
    assert.match(statusText, /projectionSchemaVersion: final-outcome-v1/);
    assert.match(statusText, /normalizedRunVerdict: success_with_warning/);
    assert.match(statusText, /lastOutcome: clean_complete/);
    assert.match(statusText, /lastStage: "finish\/handoff"|lastStage: finish\/handoff/);
    const qaReport = fs.readFileSync(path.join(fixture.executionRoot, 'QA_REPORT.md'), 'utf8');
    assert.match(qaReport, /Source plan conformance: pass/);
    assert.match(qaReport, /Structured Evidence Metadata/);
    assert.match(qaReport, /"id": "SCN-1"/);
    assert.match(qaReport, /"status": "passed"/);
    assert.match(fs.readFileSync(path.join(fixture.root, '.claude/logs/agent-loop/summary.current.md'), 'utf8'), /Final outcome schema: 1\.0/);
    assert.equal(result.worksetsEvidenceUpdated, true);
    const worksets = fs.readFileSync(path.join(fixture.executionRoot, 'WORKSETS.yaml'), 'utf8');
    assert.match(worksets, /\.claude\/verification-verdict-phase01-final\.json/);
    assert.doesNotMatch(worksets, /runtime_unavailable/);
    const planExecutionRoot = path.dirname(fixture.executionRoot);
    assert.match(fs.readFileSync(path.join(planExecutionRoot, 'REQUIREMENTS_TRACEABILITY.md'), 'utf8'), /REQ-1 \| verified/);
    assert.match(fs.readFileSync(path.join(planExecutionRoot, 'SCENARIO_MATRIX.md'), 'utf8'), /SCN-1 \| verified/);
    const current = readCurrentArtifacts({ root: fixture.root });
    assert.equal(current.ok, true);
    assert.equal(current.commitToken, result.closeoutCommitToken);
    assert.equal(current.manifestHash, sha256RawBytes(current.manifestPath));
    assert.equal(current.artifacts.some((entry) => entry.relativePath === '.claude/verification-verdict-phase01-final.json'), true);
  });
});

test('finalize blocks clean success when post-closeout read models are split-brain', async () => {
  await withFixture(async (fixture) => {
    for (const basename of ['current-run.json', 'active-phase-run.json', 'latest-dispatch.json']) {
      patchJson(path.join(fixture.workflowDir, basename), {
        stateRunId: 'state-run-split',
      });
    }
    writeStateBoard(fixture.workflowDir, {
      stateRunId: 'state-run-split',
      status: 'active',
      phase: '1',
    });

    const result = await finalizePhaseCloseout({
      root: fixture.root,
      phase: 1,
      statusFile: fixture.statusFile,
      planDir: fixture.planDir,
      masterPlan: fixture.masterPlan,
      executionRoot: fixture.executionRoot,
      workflowDir: fixture.workflowDir,
      now: fixture.now,
      commitToken: 'phase01-split-brain',
    });

    assert.equal(result.ok, false);
    assert.equal(result.finalVerdict, 'blocked');
    assert.equal(result.runtimeCloseout.reason, 'post_closeout_reconcile_barrier_failed');
    assert.equal(result.postCloseoutReconcileBarrier.ok, false);
    assert.equal(
      result.postCloseoutReconcileBarrier.violations.some((entry) => entry.code === 'state-board-active-projection-terminal'),
      true,
    );
    assert.equal(fs.existsSync(path.join(fixture.root, '.claude/verification-verdict-phase01-final.json')), false);
    assert.match(fs.readFileSync(path.join(fixture.executionRoot, 'closeout-diagnostics.jsonl'), 'utf8'), /phase_closeout_reconcile_barrier_blocked/);
  });
});

test('finalize clean terminal projections pass the post-closeout barrier', async () => {
  await withFixture(async (fixture) => {
    for (const basename of ['current-run.json', 'active-phase-run.json', 'latest-dispatch.json']) {
      patchJson(path.join(fixture.workflowDir, basename), {
        stateRunId: 'state-run-clean',
      });
    }
    writeStateBoard(fixture.workflowDir, {
      stateRunId: 'state-run-clean',
      status: 'complete',
      phase: '1',
    });

    const result = await finalizePhaseCloseout({
      root: fixture.root,
      phase: 1,
      statusFile: fixture.statusFile,
      planDir: fixture.planDir,
      masterPlan: fixture.masterPlan,
      executionRoot: fixture.executionRoot,
      workflowDir: fixture.workflowDir,
      now: fixture.now,
      commitToken: 'phase01-clean-barrier',
    });

    assert.equal(result.ok, true);
    assert.equal(result.postCloseoutReconcileBarrier.ok, true);
    assert.deepEqual(result.postCloseoutReconcileBarrier.violations, []);
    assert.equal(fs.existsSync(path.join(fixture.root, '.claude/verification-verdict-phase01-final.json')), true);
  });
});

test('finalize skips final terminal barrier but realigns workflow projections for next phase', async () => {
  await withFixture(async (fixture) => {
    fs.writeFileSync(fixture.statusFile, [
      fs.readFileSync(fixture.statusFile, 'utf8').trimEnd(),
      '  - number: 2',
      '    title: "Next"',
      '    status: pending',
      '',
    ].join('\n'), 'utf8');
    patchJson(path.join(fixture.workflowDir, 'latest-dispatch.json'), {
      stateRunId: 'state-run-stale-dispatch',
      status: 'prepared',
      completionStatus: 'prepared',
      activeExecutionStatus: 'prepared',
      phaseNumber: 1,
    });
    writeStateBoard(fixture.workflowDir, {
      stateRunId: 'state-run-stale-dispatch',
      status: 'blocked',
      phase: '1',
      reason: 'completion-gate-blocked',
    });

    const result = await finalizePhaseCloseout({
      root: fixture.root,
      phase: 1,
      statusFile: fixture.statusFile,
      planDir: fixture.planDir,
      masterPlan: fixture.masterPlan,
      executionRoot: fixture.executionRoot,
      workflowDir: fixture.workflowDir,
      now: fixture.now,
      commitToken: 'phase01-no-repair-invalid',
    });

    assert.equal(result.ok, true);
    assert.equal(result.postCloseoutReconcileBarrier.skipped, true);
    assert.equal(result.postCloseoutReconcileBarrier.reason, 'phase_only_closeout_actionable_phases_remain');
    const latestDispatch = readJson(path.join(fixture.workflowDir, 'latest-dispatch.json'));
    assert.equal(latestDispatch.status, 'prepared');
    assert.equal(latestDispatch.activeExecutionStatus, 'paused');
    assert.equal(latestDispatch.phaseNumber, '2');
    assert.equal(latestDispatch.activePhaseNumber, '2');
    assert.equal(latestDispatch.childAlive, false);
    const stateBoard = fs.readFileSync(path.join(fixture.workflowDir, 'STATE.md'), 'utf8');
    assert.match(stateBoard, /status: paused/);
    assert.match(stateBoard, /phase: 2/);
    assert.match(stateBoard, /reason: actionable-phases-remaining/);
    assert.equal(fs.existsSync(path.join(fixture.root, '.claude/verification-verdict-phase01-final.json')), true);
  });
});

test('finalize writes attempt manifest finalizer seal before status promotion', async () => {
  await withFixture(async (fixture) => {
    const intent = writeAttemptManifestIntent({
      executionRoot: fixture.executionRoot,
      phaseNumber: 1,
      phaseSlug: '01-smoke',
      attemptId: 'attempt-phase-01-a',
      runnerStartedAt: '2026-05-10T11:58:00Z',
      promptHash: 'prompt-hash',
      commandHash: 'command-hash',
      runnerLogPath: '.claude/logs/agent-loop/phase-1.log',
    });
    patchAttemptManifestChildIdentity({
      manifestPath: intent.manifestPath,
      childPid: 12345,
      childProcessStartTime: '2026-05-10T11:58:01Z',
    });
    patchAttemptManifestExit({
      manifestPath: intent.manifestPath,
      runnerFinishedAt: '2026-05-10T11:59:00Z',
      runnerExitCode: 0,
    });

    assert.equal(validateAttemptManifest(intent.manifestPath, { requireFinalizerSeal: true }).reason, 'incomplete_attempt_manifest');

    const result = await finalizePhaseCloseout({
      root: fixture.root,
      phase: 1,
      statusFile: fixture.statusFile,
      planDir: fixture.planDir,
      masterPlan: fixture.masterPlan,
      executionRoot: fixture.executionRoot,
      workflowDir: fixture.workflowDir,
      now: fixture.now,
      commitToken: 'phase01-seal',
    });

    assert.equal(result.attemptManifestSeal.sealed, true);
    assert.equal(result.attemptManifestSeal.manifestPath, path.relative(fixture.root, intent.manifestPath).replace(/\\/g, '/'));
    const manifest = readAttemptManifest(intent.manifestPath).manifest;
    assert.equal(manifest.completionTransactionId, 'completion-phase01-seal');
    assert.equal(manifest.finalizerTransactionId, 'phase01-seal');
    assert.equal(manifest.verificationVerdictPath, '.claude/verification-verdict-phase01-final.json');
    assert.equal(manifest.completionGateVerdict.status, 'passed');
    assert.equal(validateAttemptManifest(intent.manifestPath, { requireFinalizerSeal: true }).ok, true);
    const statusText = fs.readFileSync(fixture.statusFile, 'utf8');
    assert.match(statusText, /status: completed/);
  });
});

test('finalize seals the manifest for the requested phase when execution root contains multiple phases', async () => {
  await withFixture(async (fixture) => {
    const planExecutionRoot = path.dirname(fixture.executionRoot);
    const phase1Dir = path.join(planExecutionRoot, '01-smoke');
    const phase2Dir = path.join(planExecutionRoot, '02-smoke');
    fs.mkdirSync(phase2Dir, { recursive: true });

    const phase1Intent = writeAttemptManifestIntent({
      executionRoot: planExecutionRoot,
      phaseNumber: 1,
      phaseSlug: '01-smoke',
      attemptId: 'attempt-phase-01-a',
      runnerStartedAt: '2026-05-10T11:58:00Z',
      promptHash: 'prompt-hash-1',
      commandHash: 'command-hash-1',
      runnerLogPath: '.claude/logs/agent-loop/phase-1.log',
    });
    patchAttemptManifestChildIdentity({
      manifestPath: phase1Intent.manifestPath,
      childPid: 11111,
      childProcessStartTime: '2026-05-10T11:58:01Z',
    });
    patchAttemptManifestExit({
      manifestPath: phase1Intent.manifestPath,
      runnerFinishedAt: '2026-05-10T11:59:00Z',
      runnerExitCode: 0,
    });

    const phase2OlderIntent = writeAttemptManifestIntent({
      executionRoot: planExecutionRoot,
      phaseNumber: 2,
      phaseSlug: '02-smoke',
      attemptId: 'attempt-phase-02-a',
      runnerStartedAt: '2026-05-10T12:01:00Z',
      promptHash: 'prompt-hash-2',
      commandHash: 'command-hash-2',
      runnerLogPath: '.claude/logs/agent-loop/phase-2.log',
    });
    patchAttemptManifestChildIdentity({
      manifestPath: phase2OlderIntent.manifestPath,
      childPid: 22222,
      childProcessStartTime: '2026-05-10T12:01:01Z',
    });
    patchAttemptManifestExit({
      manifestPath: phase2OlderIntent.manifestPath,
      runnerFinishedAt: '2026-05-10T12:02:00Z',
      runnerExitCode: 0,
    });
    const phase2Intent = writeAttemptManifestIntent({
      executionRoot: planExecutionRoot,
      phaseNumber: 2,
      phaseSlug: '02-smoke',
      attemptId: 'attempt-phase-02-b',
      runnerStartedAt: '2026-05-10T12:03:00Z',
      promptHash: 'prompt-hash-2b',
      commandHash: 'command-hash-2b',
      runnerLogPath: '.claude/logs/agent-loop/phase-2b.log',
    });
    patchAttemptManifestChildIdentity({
      manifestPath: phase2Intent.manifestPath,
      childPid: 22223,
      childProcessStartTime: '2026-05-10T12:03:01Z',
    });
    patchAttemptManifestExit({
      manifestPath: phase2Intent.manifestPath,
      runnerFinishedAt: '2026-05-10T12:04:00Z',
      runnerExitCode: 0,
    });

    const phase2Doc = path.join(fixture.planDir, 'close/02-smoke-v1.md');
    const phase2Sprint = path.join(phase2Dir, 'SPRINT_CONTRACT.md');
    const phase2Qa = path.join(phase2Dir, 'QA_REPORT.md');
    const phase2Handoff = path.join(phase2Dir, 'HANDOFF.md');
    const phase2Scorecard = path.join(phase2Dir, 'SCORECARD.md');
    fs.writeFileSync(phase2Doc, '# Phase 02\n\nREQ-2\nSCN-2\n', 'utf8');
    fs.writeFileSync(phase2Sprint, '# Sprint Contract\n\nREQ-2 implemented.\n', 'utf8');
    fs.writeFileSync(phase2Qa, '# QA Report\n\nSource plan conformance: pass\n\nStructured Evidence Metadata\n\n{"id":"SCN-2","status":"passed"}\n', 'utf8');
    fs.writeFileSync(phase2Handoff, '# Handoff\n\nNo remaining blockers before closeout: none.\n', 'utf8');
    fs.writeFileSync(phase2Scorecard, '# Scorecard\n\nScore verdict: done\nOBJ-CONFORM pass\n', 'utf8');
    fs.writeFileSync(fixture.masterPlan, [
      '# Master Plan',
      '',
      '## Phase Completion Checklist',
      '- [x] Phase 01 - Smoke',
      '- [ ] Phase 02 - Smoke',
      '',
      'REQ-1',
      'REQ-2',
      'SCN-1',
      'SCN-2',
      '',
    ].join('\n'), 'utf8');
    fs.writeFileSync(fixture.statusFile, [
      'schemaVersion: "1.0"',
      `planDir: "${fixture.planDir}"`,
      `masterPlan: "${fixture.masterPlan}"`,
      'activeRunLeaseId: "delegated-run-2"',
      'phases:',
      '  - number: 1',
      '    title: "Smoke"',
      '    status: completed',
      `    archivedPhaseDoc: "${path.join(fixture.planDir, 'close/01-smoke-v1.md')}"`,
      '  - number: 2',
      '    title: "Smoke 2"',
      '    status: in_progress',
      `    sprintContract: "${phase2Sprint}"`,
      `    qaReport: "${phase2Qa}"`,
      `    handoff: "${phase2Handoff}"`,
      `    scorecard: "${phase2Scorecard}"`,
      `    archivedPhaseDoc: "${phase2Doc}"`,
      '',
    ].join('\n'), 'utf8');

    const result = await finalizePhaseCloseout({
      root: fixture.root,
      phase: 2,
      statusFile: fixture.statusFile,
      planDir: fixture.planDir,
      masterPlan: fixture.masterPlan,
      executionRoot: planExecutionRoot,
      workflowDir: fixture.workflowDir,
      now: fixture.now,
      commitToken: 'phase02-seal',
    });

    assert.equal(result.attemptManifestSeal.sealed, true);
    assert.equal(result.attemptManifestSeal.manifestPath, path.relative(fixture.root, phase2Intent.manifestPath).replace(/\\/g, '/'));
    assert.equal(readAttemptManifest(phase1Intent.manifestPath).manifest.finalizerTransactionId, undefined);
    assert.equal(readAttemptManifest(phase2Intent.manifestPath).manifest.finalizerTransactionId, 'phase02-seal');
  });
});

test('finalize skips completed reconciliation when sidecar has open blocker', async () => {
  await withFixture(async (fixture) => {
    writeOpenBlockerSidecar(fixture.executionRoot);

    const result = await finalizePhaseCloseout({
      root: fixture.root,
      phase: 1,
      statusFile: fixture.statusFile,
      planDir: fixture.planDir,
      masterPlan: fixture.masterPlan,
      executionRoot: fixture.executionRoot,
      workflowDir: fixture.workflowDir,
      now: fixture.now,
    });

    assert.equal(result.ok, false);
    assert.equal(result.finalVerdict, 'blocked');
    assert.equal(result.sidecarGuard.reason, 'sidecar_open_blocker');
    assert.equal(fs.existsSync(path.join(fixture.root, '.claude/verification-verdict-phase01-final.json')), false);
    assert.equal(readJson(path.join(fixture.workflowDir, 'current-run.json')).completionStatus, 'failed');
    assert.match(fs.readFileSync(path.join(fixture.executionRoot, 'closeout-diagnostics.jsonl'), 'utf8'), /phase_closeout_finalize_blocked/);
  });
});

test('finalize accepts resolved blocker sidecar after workflow projections were reconciled', async () => {
  await withFixture(async (fixture) => {
    writeOpenBlockerSidecar(fixture.executionRoot);
    fs.appendFileSync(path.join(fixture.executionRoot, 'BLOCKER_EVIDENCE.jsonl'), `${JSON.stringify({
      id: 'blocker-spawn-eperm',
      status: 'resolved',
      phaseNumber: 1,
      attemptId: 'attempt-phase-01-a',
      transactionId: 'txn-phase-01-a',
      blockerClass: 'verification_environment_unavailable',
      blockerCode: 'spawn_eperm',
      detail: 'verifier rerun passed with sufficient controller timeout',
      createdAt: '2026-05-10T11:59:00Z',
      updatedAt: '2026-05-10T12:01:00Z',
      resolvedAt: '2026-05-10T12:01:00Z',
    })}\n`, 'utf8');
    fs.writeFileSync(path.join(fixture.executionRoot, 'projection-manifest.json'), `${JSON.stringify({
      schemaVersion: 'terminal-blocker-projection-manifest-v1',
      transactionId: 'txn-phase-01-a',
      attemptId: 'attempt-phase-01-a',
      phaseNumber: 1,
      terminalOutcome: 'blocked_resolved',
      blockerEvidenceIds: ['blocker-spawn-eperm'],
      attemptLedgerKeys: ['attempt-phase-01-a:txn-phase-01-a'],
      files: [
        {
          path: path.relative(fixture.root, path.join(fixture.executionRoot, 'BLOCKER_EVIDENCE.jsonl')).replace(/\\/g, '/'),
          kind: 'blockerEvidence',
          sha256: sha256RawBytes(path.join(fixture.executionRoot, 'BLOCKER_EVIDENCE.jsonl')),
        },
        {
          path: path.relative(fixture.root, path.join(fixture.executionRoot, 'ATTEMPT_LEDGER.jsonl')).replace(/\\/g, '/'),
          kind: 'attemptLedger',
          sha256: sha256RawBytes(path.join(fixture.executionRoot, 'ATTEMPT_LEDGER.jsonl')),
        },
        {
          path: '.claude/logs/workflow-enforcement/current-run.json',
          kind: 'current-run',
          sha256: 'stale-projection-hash-after-closeout-reconcile',
        },
      ],
    }, null, 2)}\n`, 'utf8');

    const result = await finalizePhaseCloseout({
      root: fixture.root,
      phase: 1,
      statusFile: fixture.statusFile,
      planDir: fixture.planDir,
      masterPlan: fixture.masterPlan,
      executionRoot: fixture.executionRoot,
      workflowDir: fixture.workflowDir,
      now: fixture.now,
    });

    assert.equal(result.finalVerdict, 'complete');
    assert.equal(result.runtimeCloseout.status, 'passed');
  });
});

test('finalize keeps dirty repository closeout pending without failing runtime closeout by default', async () => {
  await withFixture(async (fixture) => {
    const result = await finalizePhaseCloseout({
      root: fixture.root,
      phase: 1,
      statusFile: fixture.statusFile,
      planDir: fixture.planDir,
      masterPlan: fixture.masterPlan,
      executionRoot: fixture.executionRoot,
      workflowDir: fixture.workflowDir,
      now: fixture.now,
      commitToken: 'phase01-dirty-default',
      gitCloseoutResult: dirtyGitCloseoutPayload(),
    });

    assert.equal(result.ok, true);
    assert.equal(result.runtimeCloseout.status, 'passed');
    assert.equal(result.repositoryCloseout.status, 'pending');
    assert.equal(result.repositoryCloseout.exitCode, 2);
    assert.equal(result.normalizedRunVerdict, 'success_with_warning');
  });
});

test('finalize strict repository closeout fails dirty repository without mutating runtime verdict', async () => {
  await withFixture(async (fixture) => {
    const result = await finalizePhaseCloseout({
      root: fixture.root,
      phase: 1,
      statusFile: fixture.statusFile,
      planDir: fixture.planDir,
      masterPlan: fixture.masterPlan,
      executionRoot: fixture.executionRoot,
      workflowDir: fixture.workflowDir,
      now: fixture.now,
      commitToken: 'phase01-dirty-strict',
      strictRepositoryCloseout: true,
      gitCloseoutResult: dirtyGitCloseoutPayload(),
    });

    assert.equal(result.ok, false);
    assert.equal(result.runtimeCloseout.status, 'passed');
    assert.equal(result.repositoryCloseout.status, 'pending');
    assert.equal(result.repositoryCloseout.strict, true);
    assert.equal(result.normalizedRunVerdict, 'success_with_warning');
  });
});

test('finalize excludes completion vocabulary from historical warning candidates', async () => {
  await withFixture(async (fixture) => {
    for (const basename of ['current-run.json', 'active-phase-run.json', 'latest-dispatch.json']) {
      fs.writeFileSync(path.join(fixture.workflowDir, basename), JSON.stringify({
        runLeaseId: 'completion-vocabulary-run',
        status: 'completed',
        completionStatus: 'completed',
        executionMode: 'delegated-terminal',
        stopReasonCode: 'scope_complete',
        exitCode: 1,
        phaseRunLease: {
          status: 'completed',
          completionStatus: 'completed',
          stopReasonCode: 'scope_complete',
          exitCode: 1,
        },
      }, null, 2), 'utf8');
    }

    const result = await finalizePhaseCloseout({
      root: fixture.root,
      phase: 1,
      statusFile: fixture.statusFile,
      planDir: fixture.planDir,
      masterPlan: fixture.masterPlan,
      executionRoot: fixture.executionRoot,
      workflowDir: fixture.workflowDir,
      now: fixture.now,
      commitToken: 'phase01-warning-filter',
    });

    assert.deepEqual(result.historicalWarnings, ['delegated-terminal-exit-1']);
    assert.equal(result.historicalWarnings.includes('scope_complete'), false);
    const currentRun = readJson(path.join(fixture.workflowDir, 'current-run.json'));
    assert.deepEqual(currentRun.historicalWarnings, ['delegated-terminal-exit-1']);
  });
});

test('finalize refuses canonical no-op while closeout verifier is not allowed', async () => {
  await withFixture(async (fixture) => {
    await finalizePhaseCloseout({
      root: fixture.root,
      phase: 1,
      statusFile: fixture.statusFile,
      planDir: fixture.planDir,
      masterPlan: fixture.masterPlan,
      executionRoot: fixture.executionRoot,
      workflowDir: fixture.workflowDir,
      now: fixture.now,
      commitToken: 'phase01-canonical-seed',
    });

    fs.writeFileSync(
      fixture.statusFile,
      fs.readFileSync(fixture.statusFile, 'utf8').replace(/lastStage: "?finish\/handoff"?/, 'lastStage: execute'),
      'utf8',
    );

    const strictTargets = [
      fixture.statusFile,
      path.join(fixture.workflowDir, 'current-run.json'),
      path.join(fixture.workflowDir, 'active-phase-run.json'),
      path.join(fixture.workflowDir, 'latest-dispatch.json'),
      path.join(fixture.root, '.claude/logs/agent-loop/summary.current.md'),
    ];
    const before = Object.fromEntries(strictTargets.map((filePath) => [filePath, fs.readFileSync(filePath, 'utf8')]));

    const result = await finalizePhaseCloseout({
      root: fixture.root,
      phase: 1,
      statusFile: fixture.statusFile,
      planDir: fixture.planDir,
      masterPlan: fixture.masterPlan,
      executionRoot: fixture.executionRoot,
      workflowDir: fixture.workflowDir,
      now: '2026-05-11T12:00:00.000Z',
      commitToken: 'phase01-canonical-noop',
    });

    assert.equal(result.idempotentNoop, false);
    assert.equal(result.phaseCloseoutGate.allowed, false);
    assert.notDeepEqual(
      Object.fromEntries(strictTargets.map((filePath) => [filePath, fs.readFileSync(filePath, 'utf8')])),
      before,
    );
  });
});

test('finalize does not no-op when canonical projection fails closeout verifier', async () => {
  await withFixture(async (fixture) => {
    await finalizePhaseCloseout({
      root: fixture.root,
      phase: 1,
      statusFile: fixture.statusFile,
      planDir: fixture.planDir,
      masterPlan: fixture.masterPlan,
      executionRoot: fixture.executionRoot,
      workflowDir: fixture.workflowDir,
      now: fixture.now,
      commitToken: 'phase01-canonical-seed',
    });

    fs.writeFileSync(
      fixture.masterPlan,
      fs.readFileSync(fixture.masterPlan, 'utf8').replace('- [x] Phase 01 - Smoke', '- [ ] Phase 01 - Smoke'),
      'utf8',
    );

    const result = await finalizePhaseCloseout({
      root: fixture.root,
      phase: 1,
      statusFile: fixture.statusFile,
      planDir: fixture.planDir,
      masterPlan: fixture.masterPlan,
      executionRoot: fixture.executionRoot,
      workflowDir: fixture.workflowDir,
      now: '2026-05-11T12:00:00.000Z',
      commitToken: 'phase01-canonical-repair',
    });

    assert.equal(result.idempotentNoop, false);
    assert.match(fs.readFileSync(fixture.masterPlan, 'utf8'), /- \[x\] Phase 01 - Smoke/);
  });
});

test('finalize rewrites stale summary marker without mutating source state files', async () => {
  await withFixture(async (fixture) => {
    await finalizePhaseCloseout({
      root: fixture.root,
      phase: 1,
      statusFile: fixture.statusFile,
      planDir: fixture.planDir,
      masterPlan: fixture.masterPlan,
      executionRoot: fixture.executionRoot,
      workflowDir: fixture.workflowDir,
      now: fixture.now,
      commitToken: 'phase01-summary-marker-seed',
    });

    const summaryPath = path.join(fixture.root, '.claude/logs/agent-loop/summary.current.md');
    const seededSummary = fs.readFileSync(summaryPath, 'utf8');
    assert.match(seededSummary, /summaryProjectionSchemaVersion: "1\.0"/);
    fs.writeFileSync(summaryPath, seededSummary.replace(/^summaryProjectionSchemaVersion: "1\.0"\n/m, ''), 'utf8');

    const sourceFiles = [
      fixture.statusFile,
      path.join(fixture.workflowDir, 'current-run.json'),
      path.join(fixture.workflowDir, 'active-phase-run.json'),
      path.join(fixture.workflowDir, 'latest-dispatch.json'),
    ];
    const before = Object.fromEntries(sourceFiles.map((filePath) => [filePath, fs.readFileSync(filePath, 'utf8')]));

    const result = await finalizePhaseCloseout({
      root: fixture.root,
      phase: 1,
      statusFile: fixture.statusFile,
      planDir: fixture.planDir,
      masterPlan: fixture.masterPlan,
      executionRoot: fixture.executionRoot,
      workflowDir: fixture.workflowDir,
      now: '2026-05-11T12:00:00.000Z',
      commitToken: 'phase01-summary-marker-rewrite',
    });

    assert.equal(result.finalOutcomeSummary.updated, true);
    assert.deepEqual(result.finalOutcomeSummary.staleReasons, ['summary_projection_stale']);
    assert.match(fs.readFileSync(summaryPath, 'utf8'), /summaryProjectionSchemaVersion: "1\.0"/);
    for (const filePath of sourceFiles) {
      assert.equal(fs.readFileSync(filePath, 'utf8'), before[filePath], filePath);
    }
  });
});

test('finalize ignores stale blocked root verdict when publishing completed canonical verdict', async () => {
  await withFixture(async (fixture) => {
    const originalStatus = fs.readFileSync(fixture.statusFile, 'utf8');
    fs.writeFileSync(fixture.statusFile, originalStatus.replace(
      'activeRunLeaseId: "delegated-run-1"',
      [
        'activeRunLeaseId: "delegated-run-1"',
        'normalizedRunVerdict: blocked',
        'stopReasonClass: runtime_unavailable',
      ].join('\n'),
    ), 'utf8');

    const result = await finalizePhaseCloseout({
      root: fixture.root,
      phase: 1,
      statusFile: fixture.statusFile,
      planDir: fixture.planDir,
      masterPlan: fixture.masterPlan,
      executionRoot: fixture.executionRoot,
      workflowDir: fixture.workflowDir,
      now: fixture.now,
      commitToken: 'phase01-stale-root-blocked',
    });

    assert.equal(result.canonicalVerdictPath, '.claude/verification-verdict-phase01-final.json');
    const verdict = readJson(path.join(fixture.root, '.claude/verification-verdict-phase01-final.json'));
    assert.equal(verdict.workflowEvidence.closeoutInvariant.ok, true);
    assert.equal(verdict.workflowEvidence.closeoutInvariant.normalizedRunVerdict, 'success_with_warning');
  });
});

test('finalize leaves empty blocker scalars empty without creating recovered blockers', async () => {
  await withFixture(async (fixture) => {
    const originalStatus = fs.readFileSync(fixture.statusFile, 'utf8');
    fs.writeFileSync(fixture.statusFile, originalStatus.replace(
      'activeRunLeaseId: "delegated-run-1"',
      [
        'activeRunLeaseId: "delegated-run-1"',
        'stopReasonClass: ""',
        'rawStopReason: null',
        'blockerClass: ""',
        'blockingReasonCode: ""',
        'failureClass: ""',
        'stopReasonExplanation: ""',
      ].join('\n'),
    ), 'utf8');

    await finalizePhaseCloseout({
      root: fixture.root,
      phase: 1,
      statusFile: fixture.statusFile,
      planDir: fixture.planDir,
      masterPlan: fixture.masterPlan,
      executionRoot: fixture.executionRoot,
      workflowDir: fixture.workflowDir,
      now: fixture.now,
      commitToken: 'phase01-empty-blockers',
    });

    const statusText = fs.readFileSync(fixture.statusFile, 'utf8');
    assert.doesNotMatch(statusText, /^recoveredBlockers:/m);
    assert.match(statusText, /^stopReasonClass: ""$/m);
    assert.match(statusText, /^rawStopReason: ""$/m);
    assert.match(statusText, /^blockerClass: ""$/m);
    assert.match(statusText, /^blockingReasonCode: ""$/m);
    assert.match(statusText, /^failureClass: ""$/m);
    assert.match(statusText, /^stopReasonExplanation: ""$/m);
  });
});

test('finalize dedupes recovered blockers by normalized fingerprint and preserves recoveredAt', async () => {
  await withFixture(async (fixture) => {
    const blocker = {
      stopReasonClass: 'runtime_unavailable',
      rawStopReason: '',
      blockerClass: 'verifier_unavailable',
      blockingReasonCode: 'verifier_unavailable',
      failureClass: 'verifier_unavailable',
      stopReasonExplanation: 'delegated-terminal exited with code 1',
    };
    const fingerprint = recoveredBlockerFingerprint(blocker);
    const originalStatus = fs.readFileSync(fixture.statusFile, 'utf8');
    fs.writeFileSync(fixture.statusFile, originalStatus
      .replace(
        'activeRunLeaseId: "delegated-run-1"',
        [
          'activeRunLeaseId: "delegated-run-1"',
          'stopReasonClass: runtime_unavailable',
          'rawStopReason: null',
          'blockerClass: verifier_unavailable',
          'blockingReasonCode: verifier_unavailable',
          'failureClass: verifier_unavailable',
          'stopReasonExplanation: "delegated-terminal exited with code 1"',
        ].join('\n'),
      )
      .replace(
        'phases:',
        [
          'recoveredBlockers:',
          `  - fingerprint: ${fingerprint}`,
          '    stopReasonClass: runtime_unavailable',
          '    rawStopReason: ""',
          '    blockerClass: verifier_unavailable',
          '    blockingReasonCode: verifier_unavailable',
          '    failureClass: verifier_unavailable',
          '    stopReasonExplanation: "delegated-terminal exited with code 1"',
          '    recoveredAt: "2026-05-10T00:00:00.000Z"',
          'phases:',
        ].join('\n'),
      ), 'utf8');

    await finalizePhaseCloseout({
      root: fixture.root,
      phase: 1,
      statusFile: fixture.statusFile,
      planDir: fixture.planDir,
      masterPlan: fixture.masterPlan,
      executionRoot: fixture.executionRoot,
      workflowDir: fixture.workflowDir,
      now: fixture.now,
      commitToken: 'phase01-dedupe-blocker',
    });

    const statusText = fs.readFileSync(fixture.statusFile, 'utf8');
    assert.match(statusText, new RegExp(fingerprint));
    assert.equal((statusText.match(/^  - fingerprint: /gm) || []).length, 1);
    assert.equal((statusText.match(/^  fingerprint: /gm) || []).length, 1);
    assert.equal((statusText.match(/recoveredAt:\s*"?2026-05-10T00:00:00\.000Z"?/g) || []).length, 2);
    assert.doesNotMatch(statusText, /recoveredAt: "2026-05-10T12:00:00.000Z"/);
    assert.match(statusText, /^lastRecoveredBlocker:\n  fingerprint: /m);
    assert.match(statusText, /^blockerClass: ""$/m);
    assert.match(statusText, /^blockingReasonCode: ""$/m);
  });
});

test('finalize publishes current before goal runtime close and writes post-publish status sidecar', async () => {
  await withFixture(async (fixture) => {
    const result = await finalizePhaseCloseout({
      root: fixture.root,
      phase: 1,
      statusFile: fixture.statusFile,
      planDir: fixture.planDir,
      masterPlan: fixture.masterPlan,
      executionRoot: fixture.executionRoot,
      workflowDir: fixture.workflowDir,
      now: fixture.now,
      commitToken: 'phase01-post-publish',
    });

    const current = readJson(path.join(fixture.workflowDir, 'current-artifacts.json'));
    assert.equal(current.commitToken, 'phase01-post-publish');
    assert.equal(current.postPublishStatusPath, '.claude/logs/workflow-enforcement/post-publish-status-phase01-post-publish.json');
    const sidecar = readJson(path.join(fixture.root, current.postPublishStatusPath));
    assert.equal(sidecar.commitToken, 'phase01-post-publish');
    assert.equal(sidecar.goalRuntimeClose.status, result.goalRuntime.status);
    assert.equal(sidecar.goalRuntimeClose.retriable, result.goalRuntime.status === 'failed');
    assert.equal(sidecar.recordedAt, fixture.now);
    assert.equal(result.postPublishStatus.relativePath, current.postPublishStatusPath);
  });
});

test('post-publish status write failure is diagnostic-only after current publish', async () => {
  await withFixture(async (fixture) => {
    const result = await finalizePhaseCloseout({
      root: fixture.root,
      phase: 1,
      statusFile: fixture.statusFile,
      planDir: fixture.planDir,
      masterPlan: fixture.masterPlan,
      executionRoot: fixture.executionRoot,
      workflowDir: fixture.workflowDir,
      now: fixture.now,
      commitToken: 'phase01-sidecar-fail',
      postPublishFailurePoint: 'post_publish_status_write',
    });

    const current = readJson(path.join(fixture.workflowDir, 'current-artifacts.json'));
    assert.equal(current.commitToken, 'phase01-sidecar-fail');
    assert.equal(current.postPublishStatusPath, '.claude/logs/workflow-enforcement/post-publish-status-phase01-sidecar-fail.json');
    assert.equal(fs.existsSync(path.join(fixture.root, current.postPublishStatusPath)), false);
    assert.equal(result.postPublishStatus.ok, false);
    assert.equal(result.postPublishStatus.reason, 'post_publish_status_write_failed');
    const diagnostics = fs.readFileSync(path.join(fixture.executionRoot, 'closeout-diagnostics.jsonl'), 'utf8');
    assert.match(diagnostics, /post_publish_status_write_failed/);
  });
});

test('finalize snapshots previous current artifacts and writes supersede metadata', async () => {
  await withFixture(async (fixture) => {
    seedOldCurrentArtifacts(fixture.root, fixture.workflowDir);

    const result = await finalizePhaseCloseout({
      root: fixture.root,
      phase: 1,
      statusFile: fixture.statusFile,
      planDir: fixture.planDir,
      masterPlan: fixture.masterPlan,
      executionRoot: fixture.executionRoot,
      workflowDir: fixture.workflowDir,
      now: fixture.now,
      commitToken: 'phase01-new-current',
    });

    const current = readJson(path.join(fixture.workflowDir, 'current-artifacts.json'));
    assert.equal(result.supersededArchive.archiveRoot, '.claude/logs/workflow-enforcement/closeout-archive/old-current');
    assert.equal(current.supersededArtifacts.length, 1);
    assert.equal(current.supersededArtifacts[0].canonicalPath, '.claude/verification-verdict-old.json');
    assert.equal(current.supersededArtifacts[0].snapshotPath, '.claude/logs/workflow-enforcement/closeout-archive/old-current/.claude/verification-verdict-old.json');
    assert.equal(current.supersededArtifacts[0].commitToken, 'old-current');
    assert.equal(current.supersededArtifacts[0].supersededByCommitToken, 'phase01-new-current');
    assert.equal(current.supersededArtifacts[0].artifactHash, sha256RawBytes(path.join(fixture.root, current.supersededArtifacts[0].snapshotPath)));
    assert.equal(current.logSnapshots.length, 1);
    assert.equal(current.logSnapshots[0].canonicalPath, '.claude/logs/workflow-enforcement/active-phase-run.log');
    assert.equal(current.logSnapshots[0].hashAtSnapshotTime, sha256RawBytes(path.join(fixture.workflowDir, 'active-phase-run.log')));
    assert.equal(current.logSnapshots[0].sizeBytesAtSnapshotTime, fs.statSync(path.join(fixture.workflowDir, 'active-phase-run.log')).size);
    assert.match(current.logSnapshots[0].tailExcerpt, /old log tail/);
  });
});

test('publish failures keep the old current pointer after canonical and manifest publish', async () => {
  for (const publishFailurePoint of ['after_canonical_publish', 'after_manifest_publish']) {
    await withFixture(async (fixture) => {
      seedOldCurrentArtifacts(fixture.root, fixture.workflowDir);

      await assert.rejects(() => finalizePhaseCloseout({
        root: fixture.root,
        phase: 1,
        statusFile: fixture.statusFile,
        planDir: fixture.planDir,
        masterPlan: fixture.masterPlan,
        executionRoot: fixture.executionRoot,
        workflowDir: fixture.workflowDir,
        now: fixture.now,
        commitToken: `phase01-${publishFailurePoint}`,
        publishFailurePoint,
      }), /Injected publish failure/);

      const current = readCurrentArtifacts({ root: fixture.root });
      assert.equal(current.ok, true);
      assert.equal(current.commitToken, 'old-current');
      assert.equal(current.artifacts.some((entry) => entry.relativePath === '.claude/verification-verdict-old.json'), true);
      assert.equal(current.artifacts.some((entry) => entry.relativePath === '.claude/verification-verdict-phase01-final.json'), false);
      const diagnosticPath = path.join(fixture.workflowDir, 'closeout-archive/old-current/_orphaned_prepare_archive.json');
      const diagnostic = readJson(diagnosticPath);
      assert.equal(diagnostic.diagnostic, 'orphaned_prepare_archive');
      assert.equal(diagnostic.reason, `publish_failed_${publishFailurePoint}`);
    });
  }
});

test('stale previous current artifact emits recovery diagnostic and still publishes new current', async () => {
  await withFixture(async (fixture) => {
    seedOldCurrentArtifacts(fixture.root, fixture.workflowDir);

    const oldVerdictPath = path.join(fixture.root, '.claude/verification-verdict-old.json');
    fs.writeFileSync(oldVerdictPath, '{"verdict":"passed","old":false}\n', 'utf8');

    const result = await finalizePhaseCloseout({
      root: fixture.root,
      phase: 1,
      statusFile: fixture.statusFile,
      planDir: fixture.planDir,
      masterPlan: fixture.masterPlan,
      executionRoot: fixture.executionRoot,
      workflowDir: fixture.workflowDir,
      now: fixture.now,
      commitToken: 'phase01-stale-old-current',
    });

    const current = readJson(path.join(fixture.workflowDir, 'current-artifacts.json'));
    assert.equal(result.ok, true);
    assert.equal(fs.existsSync(path.join(fixture.root, '.claude/verification-verdict-phase01-final.json')), true);
    assert.equal(current.commitToken, 'phase01-stale-old-current');
    assert.equal(current.staleCurrentArtifactDiagnostics.length, 1);
    assert.equal(current.staleCurrentArtifactDiagnostics[0].code, 'stale_current_artifact_index');
    assert.equal(current.staleCurrentArtifactDiagnostics[0].artifactPath, '.claude/verification-verdict-old.json');
    assert.equal(current.staleCurrentArtifactDiagnostics[0].sourceAttempt, 'old-current');
    assert.match(current.staleCurrentArtifactDiagnostics[0].oldHash, /^[a-f0-9]{64}$/);
    assert.match(current.staleCurrentArtifactDiagnostics[0].newHash, /^[a-f0-9]{64}$/);
    assert.match(current.staleCurrentArtifactDiagnostics[0].recoveryCommand, /phase-closeout-finalize\.mjs finalize --phase 1/);
    assert.equal(current.supersededArtifacts.some((entry) => entry.canonicalPath === '.claude/verification-verdict-old.json'), false);
  });
});

test('finalize does not close goal runtime while later phases remain actionable', async () => {
  await withFixture(async (fixture) => {
    fs.writeFileSync(fixture.statusFile, [
      fs.readFileSync(fixture.statusFile, 'utf8').trimEnd(),
      '  - number: 2',
      '    title: "Next"',
      '    status: pending',
      '',
    ].join('\n'), 'utf8');

    const result = await finalizePhaseCloseout({
      root: fixture.root,
      phase: 1,
      statusFile: fixture.statusFile,
      planDir: fixture.planDir,
      masterPlan: fixture.masterPlan,
      executionRoot: fixture.executionRoot,
      workflowDir: fixture.workflowDir,
      now: fixture.now,
    });

    assert.equal(result.goalRuntime.attempted, false);
    assert.equal(result.goalRuntime.status, 'skipped_until_plan_complete');
  });
});

test('windows-safe file utilities resolve globs, dedupe paths, and refuse outside deletes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'windows-safe-files-'));
  try {
    const alpha = path.join(root, 'a', 'alpha.txt');
    const beta = path.join(root, 'a', 'nested', 'beta.txt');
    fs.mkdirSync(path.dirname(beta), { recursive: true });
    fs.writeFileSync(alpha, 'alpha\n', 'utf8');
    fs.writeFileSync(beta, 'beta\n', 'utf8');

    const matches = resolveGlobFiles(['a/**/*.txt'], { cwd: root });
    assert.deepEqual(matches.sort(), [alpha, beta].sort());
    assert.deepEqual(dedupePaths([alpha, alpha]), [path.resolve(alpha)]);
    assert.throws(() => safeRemove([path.join(root, '..', 'outside.txt')], { mustBeInside: root }), /Refusing to remove/);
    assert.deepEqual(safeRemove([alpha], { mustBeInside: root }), [alpha]);
    assert.equal(fs.existsSync(alpha), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function patchJson(filePath, patch) {
  fs.writeFileSync(filePath, `${JSON.stringify({
    ...readJson(filePath),
    ...patch,
  }, null, 2)}\n`, 'utf8');
}

function writeStateBoard(workflowDir, overrides = {}) {
  const state = {
    stateRunId: 'state-run-a',
    transitionId: 'transition-a',
    projectionStatus: 'committed',
    planDir: 'docs/implementation/finalize-smoke',
    statusFile: '.claude/docs/phase-status.yaml',
    status: 'active',
    phase: '1',
    attempt: 'attempt-a',
    owner: 'codex',
    reason: 'fixture',
    runRoot: '.claude/logs/workflow-enforcement/runs/state-run-a',
    updated: '2026-05-10T12:00:00.000Z',
    ...overrides,
  };
  fs.writeFileSync(path.join(workflowDir, 'STATE.md'), [
    '# Simple Run State',
    '',
    ...Object.entries(state).map(([key, value]) => `${key}: ${value}`),
    '',
  ].join('\n'), 'utf8');
}

function dirtyGitCloseoutPayload() {
  return {
    clean: false,
    issues: [{
      type: 'main_worktree_dirty',
      detail: 'main worktree has uncommitted non-runtime changes',
      entries: [{ path: 'dirty.txt', status: '??' }],
    }],
  };
}

async function withFixture(callback, overrides = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-closeout-finalize-'));
  try {
    const fixture = writeFixture(root);
    if (overrides.commitToken) {
      fixture.commitToken = overrides.commitToken;
    }
    await callback(fixture);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function seedOldCurrentArtifacts(root, workflowDir) {
  const verdictPath = path.join(root, '.claude/verification-verdict-old.json');
  fs.writeFileSync(verdictPath, '{"verdict":"passed","old":true}\n', 'utf8');
  const logPath = path.join(workflowDir, 'active-phase-run.log');
  fs.writeFileSync(logPath, 'old log head\nold log tail\n', 'utf8');
  const artifactHash = sha256RawBytes(verdictPath);
  const logHash = sha256RawBytes(logPath);
  const manifestPath = path.join(workflowDir, 'closeout-sync-manifest-old-current.json');
  const manifest = {
    schemaVersion: 1,
    manifestKind: 'closeout-sync-manifest',
    hashAlgorithm: 'sha256_raw_bytes',
    commitToken: 'old-current',
    verifiedGitTreeFingerprint: 'old-tree',
    artifacts: {
      'canonical-verdict': {
        kind: 'canonical-verdict',
        path: '.claude/verification-verdict-old.json',
        hashAlgorithm: 'sha256_raw_bytes',
        hash: artifactHash,
        commitToken: 'old-current',
      },
      'active-log': {
        kind: 'active-log',
        path: '.claude/logs/workflow-enforcement/active-phase-run.log',
        hashAlgorithm: 'sha256_raw_bytes',
        hash: logHash,
        commitToken: 'old-current',
      },
    },
  };
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  const current = {
    schemaVersion: 1,
    commitToken: 'old-current',
    manifestPath: path.relative(root, manifestPath).replace(/\\/g, '/'),
    manifestHash: sha256RawBytes(manifestPath),
    hashAlgorithm: 'sha256_raw_bytes',
    artifacts: manifest.artifacts,
  };
  fs.writeFileSync(path.join(workflowDir, 'current-artifacts.json'), `${JSON.stringify(current, null, 2)}\n`, 'utf8');
}

function writeFixture(root) {
  const now = '2026-05-10T12:00:00.000Z';
  const planDir = path.join(root, 'docs/implementation/finalize-smoke');
  const executionRoot = path.join(planDir, 'execution/01-smoke');
  const workflowDir = path.join(root, '.claude/logs/workflow-enforcement');
  const statusFile = path.join(root, '.claude/docs/phase-status.yaml');
  const masterPlan = path.join(planDir, '00-master-plan-v1.md');
  const phaseDoc = path.join(planDir, 'close/01-smoke-v1.md');
  const sprintContract = path.join(executionRoot, 'SPRINT_CONTRACT.md');
  const qaReport = path.join(executionRoot, 'QA_REPORT.md');
  const handoff = path.join(executionRoot, 'HANDOFF.md');
  const scorecard = path.join(executionRoot, 'SCORECARD.md');
  fs.mkdirSync(path.dirname(statusFile), { recursive: true });
  fs.mkdirSync(path.dirname(phaseDoc), { recursive: true });
  fs.mkdirSync(workflowDir, { recursive: true });
  fs.mkdirSync(executionRoot, { recursive: true });

  fs.writeFileSync(statusFile, [
    'schemaVersion: "1.0"',
    `planDir: "${planDir}"`,
    `masterPlan: "${masterPlan}"`,
    'activeRunLeaseId: "delegated-run-1"',
    'phases:',
    '  - number: 1',
    '    title: "Smoke"',
    '    status: in_progress',
    `    sprintContract: "${sprintContract}"`,
    `    qaReport: "${qaReport}"`,
    `    handoff: "${handoff}"`,
    `    scorecard: "${scorecard}"`,
    `    archivedPhaseDoc: "${phaseDoc}"`,
    '',
  ].join('\n'), 'utf8');
  fs.writeFileSync(masterPlan, [
    '# Master Plan',
    '',
    '## Phase Completion Checklist',
    '- [ ] Phase 01 - Smoke',
    '',
    'REQ-1',
    'SCN-1',
    '',
  ].join('\n'), 'utf8');
  fs.writeFileSync(phaseDoc, [
    '# Phase 01',
    '',
    '## Critical Product Scenarios',
    '',
    'REQ-1',
    'SCN-1',
    '',
  ].join('\n'), 'utf8');
  fs.writeFileSync(sprintContract, '# Sprint Contract\n\nREQ-1 implemented.\n', 'utf8');
  fs.writeFileSync(qaReport, '# QA Report\n\nBaseline QA evidence.\n', 'utf8');
  fs.writeFileSync(handoff, '# Handoff\n\nNo remaining blockers before closeout: none.\n', 'utf8');
  fs.writeFileSync(scorecard, [
    '# Scorecard',
    '',
    'Score verdict: done',
    '| ID | Summary | Points | Status | Evidence |',
    '|---|---|---:|---|---|',
    '| OBJ-CONFORM | Source platform phase plan conformance verified | 20 | pass | Source plan conformance command: pass |',
    '',
  ].join('\n'), 'utf8');

  for (const basename of ['current-run.json', 'active-phase-run.json', 'latest-dispatch.json']) {
    fs.writeFileSync(path.join(workflowDir, basename), JSON.stringify({
      runLeaseId: 'delegated-run-1',
      status: 'failed',
      completionStatus: 'failed',
      executionMode: 'delegated-terminal',
      stopReasonCode: 'delegated-terminal-exit-1',
      exitCode: 1,
      phaseRunLease: {
        status: 'failed',
        completionStatus: 'failed',
        stopReasonCode: 'delegated-terminal-exit-1',
        exitCode: 1,
      },
    }, null, 2), 'utf8');
  }

  fs.writeFileSync(path.join(executionRoot, 'WORKSETS.yaml'), [
    'atomicTasks:',
    '  - id: smoke-task',
    '    status: completed',
    '    ownedPaths:',
    '      - .claude/scripts/phase-closeout-finalize.mjs',
    '    verificationCommands:',
    '      - node .claude/scripts/phase-closeout-finalize.test.mjs',
    '    evidence:',
    '      - runtime_unavailable from previous attempt',
    '',
  ].join('\n'), 'utf8');

  return { root, now, planDir, executionRoot, workflowDir, statusFile, masterPlan, phaseDoc };
}
