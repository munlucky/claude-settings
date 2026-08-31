import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { createKernelControlPlane } from '../scripts/kernel/control-plane.mjs';
import { observeWorkspaceIdentity } from '../scripts/kernel/run/workspace-identity.mjs';
import { resolveTrustedCommand, executeTrustedProof, UntrustedCommandError, redactSecretLikeOutput } from '../scripts/kernel/proof/proof-executor.mjs';
import { planStatePath, buildNextPayload } from '../scripts/kernel/run/run-loop.mjs';
import { CODEX_MAIN_SESSION_POLICY } from '../scripts/host/kernel/codex-session-observer.mjs';

const setupProject = async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'krn-host-loop-proj-'));
  spawnSync('git', ['init'], { cwd: projectRoot, encoding: 'utf8' });
  await mkdir(path.join(projectRoot, '.moon-relay'), { recursive: true });
  await writeFile(path.join(projectRoot, '.moon-relay', 'track.yaml'), 'schemaVersion: 1\ntrack: kernel\nproduct: moon-relay-kernel\n');
  await writeFile(path.join(projectRoot, 'package.json'), JSON.stringify({
    name: 'host-loop-fixture',
    version: '0.0.1',
    scripts: { 'test:focus': 'node check.mjs' },
  }, null, 2));
  await writeFile(path.join(projectRoot, 'app.mjs'), `export const statusForInvalidPassword = () => 500;\n`);
  await writeFile(path.join(projectRoot, 'check.mjs'), [
    `import { statusForInvalidPassword } from './app.mjs';`,
    `if (statusForInvalidPassword() !== 401) { console.error('expected 401, got ' + statusForInvalidPassword()); process.exit(1); }`,
    `console.log('focused test passed');`,
  ].join('\n'));
  return projectRoot;
};

test('workspace identity observation reflects working tree changes', async () => {
  const projectRoot = await setupProject();
  try {
    const first = observeWorkspaceIdentity({ projectRoot });
    assert.match(first.identity, /^sha256:[a-f0-9]{64}$/);
    const second = observeWorkspaceIdentity({ projectRoot });
    assert.equal(second.identity, first.identity);

    await writeFile(path.join(projectRoot, 'app.mjs'), `export const statusForInvalidPassword = () => 401;\n`);
    const third = observeWorkspaceIdentity({ projectRoot });
    assert.notEqual(third.identity, first.identity);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('workspace identity changes when HEAD provenance changes but the tree does not', async () => {
  const projectRoot = await setupProject();
  try {
    for (const args of [
      ['config', 'user.email', 'kernel@example.invalid'],
      ['config', 'user.name', 'Kernel Test'],
      ['add', '.'],
      ['commit', '-m', 'baseline'],
    ]) {
      const result = spawnSync('git', args, { cwd: projectRoot, encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr || result.stdout);
    }
    const before = observeWorkspaceIdentity({ projectRoot });
    const emptyCommit = spawnSync('git', ['commit', '--allow-empty', '-m', 'provenance-only'], { cwd: projectRoot, encoding: 'utf8' });
    assert.equal(emptyCommit.status, 0, emptyCommit.stderr || emptyCommit.stdout);
    const after = observeWorkspaceIdentity({ projectRoot });
    assert.notEqual(after.identity, before.identity);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('proof executor only accepts manifest scripts and records honest execution facts', async () => {
  const projectRoot = await setupProject();
  try {
    assert.throws(() => resolveTrustedCommand({ projectRoot, commandRef: 'rm -rf /' }), UntrustedCommandError);
    assert.throws(() => resolveTrustedCommand({ projectRoot, commandRef: 'not-a-script' }), UntrustedCommandError);

    const trusted = resolveTrustedCommand({ projectRoot, commandRef: 'test:focus' });
    assert.equal(trusted.kind, 'manifest-script');
    assert.deepEqual(trusted.args, ['run', 'test:focus']);

    const failing = executeTrustedProof({ projectRoot, commandRef: 'test:focus', timeoutMs: 120000 });
    assert.equal(failing.status, 'failed');
    assert.notEqual(failing.exitCode, 0);
    assert.equal(failing.networkIsolation, 'none');
    assert.equal(failing.networkPolicy, 'inherited');
    assert.match(failing.outputDigest, /^sha256:[a-f0-9]{64}$/);
    assert.ok(failing.errorSummary.includes('expected 401'));
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('secret-like output is redacted from error summaries', () => {
  const redacted = redactSecretLikeOutput('api_key=sk-abc123 token: "xyz" normal text');
  assert.ok(!redacted.includes('sk-abc123'));
  assert.ok(!redacted.includes('xyz'));
  assert.ok(redacted.includes('normal text'));
});

test('run loop plans state paths without exposing states to the model', () => {
  assert.deepEqual(planStatePath('FRAME', 'PROVE'), ['EXECUTE', 'PROVE']);
  assert.deepEqual(planStatePath('EXECUTE', 'PROVE'), ['PROVE']);
  assert.deepEqual(planStatePath('PROVE', 'PROVE'), []);
  const payload = buildNextPayload({ run: { runId: 'r', objective: 'o', acceptanceCriteria: [], status: 'active', state: 'FRAME' }, verifications: [], requiredObligations: ['default'] });
  assert.equal(payload.action.type, 'implement');
  assert.ok(!JSON.stringify(payload).includes('FRAME'));
});

test('run loop routes judgment-only obligations to independent review', () => {
  const payload = buildNextPayload({
    run: { runId: 'r-review', objective: 'secure change', acceptanceCriteria: [], status: 'active' },
    verifications: [{ obligationId: 'unit-test', status: 'passed' }],
    requiredObligations: ['unit-test', 'security-review'],
    obligations: [
      { obligationId: 'unit-test', evidenceClass: 'hard', allowedCommandRefs: ['test'] },
      { obligationId: 'security-review', evidenceClass: 'judgment', verificationMethod: 'structured-judgment' },
    ],
  });

  assert.equal(payload.action.type, 'review');
  assert.equal(payload.action.independentReviewRequired, true);
  assert.deepEqual(payload.action.outstandingObligations, ['security-review']);
});

test('blocker report preserves the original blocker after the owner binding is closed', async () => {
  const runtimeHome = await mkdtemp(path.join(os.tmpdir(), 'krn-blocker-report-home-'));
  const projectRoot = await setupProject();
  const runId = 'blocker-report-next';
  const sessionId = 'codex:blocker-report-session';
  const env = {
    ...process.env,
    MOON_RELAY_KERNEL_SESSION_ID: sessionId,
    MOON_RELAY_KERNEL_PROVIDER: 'codex',
    MOON_RELAY_KERNEL_RUN_ID: runId,
  };
  const controlPlane = await createKernelControlPlane({ runtimeHome, projectRoot, env, requireHostBinding: true });
  try {
    await controlPlane.ensureRun({
      runId,
      objective: 'preserve a typed blocker for the caller',
      taskContract: {
        acceptance: [{
          acceptance: 'the blocker remains visible to the caller',
          evidencePlan: { class: 'hard', method: 'unit-test', commandRefs: ['test:focus'], obligationId: 'default' },
        }],
      },
    });
    const report = await controlPlane.report(runId, {
      summary: 'waiting for an external dependency',
      blocker: { reason: 'external-dependency', detail: 'provider is unavailable' },
    });
    assert.equal(report.status, 'blocked');
    assert.equal(report.blockedReason, 'external-dependency');
    assert.equal(report.blockedDetail, 'provider is unavailable');
    assert.equal(report.next.action.type, 'blocked');
    assert.equal(report.next.action.reason, 'external-dependency');
    assert.notEqual(report.next.errorCode, 'host_binding_missing');
    const blockedRun = controlPlane.stateStore.getRun(runId);
    assert.equal(controlPlane.stateStore.getActiveOwnerBinding({ projectId: blockedRun.projectId, sessionId }), null);
  } finally {
    await controlPlane.close();
    await rm(runtimeHome, { recursive: true, force: true });
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('host loop E2E: fail -> fix -> hard evidence -> accepted completion', async () => {
  const runtimeHome = await mkdtemp(path.join(os.tmpdir(), 'krn-host-loop-home-'));
  const projectRoot = await setupProject();
  const cp = await createKernelControlPlane({ runtimeHome, projectRoot });
  try {
    const run = await cp.startRun({
      runId: 'host-loop-1',
      objective: 'Fix invalid password status code',
      taskContract: {
        acceptance: [{
          acceptance: 'invalid password returns 401',
          evidencePlan: { class: 'hard', method: 'unit-test', commandRefs: ['test:focus'], obligationId: 'default' },
        }],
      },
    });
    assert.match(run.runStartWorkspaceIdentity, /^sha256:[a-f0-9]{64}$/);
    assert.equal(run.currentWorkspaceIdentity, run.runStartWorkspaceIdentity);
    assert.equal(run.mutationRevision, 0);

    const first = await cp.next('host-loop-1');
    assert.equal(first.action.type, 'implement');

    // Model reports without fixing the bug: kernel-executed proof fails.
    const failedReport = await cp.report('host-loop-1', {
      summary: 'attempted fix',
      changedPaths: ['app.mjs'],
      verifications: [{ obligationId: 'default', commandRef: 'test:focus', acceptanceCoverage: ['invalid password returns 401'] }],
    });
    assert.equal(failedReport.status, 'evidence-failed');
    assert.equal(failedReport.finalization, null);
    assert.equal(failedReport.next.action.type, 'fix');
    assert.ok(failedReport.failures[0].errorSummary.includes('expected 401'));

    // Model actually fixes the bug and reports again.
    await writeFile(path.join(projectRoot, 'app.mjs'), `export const statusForInvalidPassword = () => 401;\n`);
    const passedReport = await cp.report('host-loop-1', {
      summary: 'fixed status code',
      changedPaths: ['app.mjs'],
      verifications: [{ obligationId: 'default', commandRef: 'test:focus', acceptanceCoverage: ['invalid password returns 401'] }],
    });

    assert.equal(passedReport.mutationDetected, true);
    assert.equal(passedReport.status, 'completed');
    assert.equal(passedReport.finalization.completionStatus, 'accepted');
    assert.equal(passedReport.next.action.type, 'done');

    const finalRun = await cp.getRun('host-loop-1');
    assert.ok(finalRun.mutationRevision >= 1, 'mutation revision must reflect the actual source change');
    assert.equal(passedReport.finalization.completionResult.hardEvidence.required, true);
    assert.ok(passedReport.finalization.completionResult.hardEvidence.count >= 1);
  } finally {
    await cp.close();
    await rm(runtimeHome, { recursive: true, force: true });
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('routed Codex worker E2E: worker receipt -> failed proof -> fix -> accepted completion', async () => {
  const runtimeHome = await mkdtemp(path.join(os.tmpdir(), 'krn-host-loop-cli-home-'));
  const projectRoot = await setupProject();
  const runId = 'host-loop-cli-1';
  const sessionId = 'codex:host-loop-cli-session';
  const env = {
    ...process.env,
    MOON_RELAY_KERNEL_SESSION_ID: sessionId,
    MOON_RELAY_KERNEL_PROVIDER: 'codex',
    MOON_RELAY_KERNEL_RUN_ID: runId,
  };
  const controlPlane = await createKernelControlPlane({ runtimeHome, projectRoot, env, requireHostBinding: true });
  try {
    await controlPlane.ensureRun({
      runId,
      objective: 'Fix invalid password status through a routed Codex worker',
      taskContract: {
        acceptance: [{
          acceptance: 'invalid password returns 401',
          evidencePlan: { class: 'hard', method: 'unit-test', commandRefs: ['test:focus'], obligationId: 'default' },
        }],
      },
    });
    let workerNumber = 0;
    const cliLaunch = async ({ invocation }) => {
      workerNumber += 1;
      return {
        status: 'completed',
        resolvedModel: invocation.model,
        resolvedEffort: invocation.effort,
        observedModel: invocation.model,
        observedEffort: invocation.effort,
        observedSessionConfig: { model: invocation.model, effort: invocation.effort },
        sessionId: `codex:routed-worker-${workerNumber}`,
        outcome: {
          status: 'completed',
          summary: workerNumber === 1 ? 'worker attempted the fix' : 'worker fixed the status code',
          changedPaths: ['app.mjs'],
          risks: [],
          requestedVerifications: ['test:focus'],
          verifications: [{ obligationId: 'default', commandRef: 'test:focus', acceptanceCoverage: ['invalid password returns 401'] }],
          judgments: [],
          knowledgeObservations: [],
          blocker: null,
        },
      };
    };
    const parentSessionObserver = async ({ parentSessionId }) => ({
      sessionId: parentSessionId,
      model: CODEX_MAIN_SESSION_POLICY.model,
      effort: CODEX_MAIN_SESSION_POLICY.effort,
    });
    await controlPlane.next(runId);
    const first = await controlPlane.report(runId, {
      status: 'completed',
      summary: 'worker attempted the fix',
      changedPaths: ['app.mjs'],
      verifications: [{ obligationId: 'default', commandRef: 'test:focus', acceptanceCoverage: ['invalid password returns 401'] }],
    });
    assert.equal(first.status, 'evidence-failed', JSON.stringify(first));
    assert.equal(first.failures[0].obligationId, 'default');

    await writeFile(path.join(projectRoot, 'app.mjs'), `export const statusForInvalidPassword = () => 401;\n`);
    await controlPlane.next(runId);
    const completed = await controlPlane.report(runId, {
      status: 'completed',
      summary: 'worker fixed the status code',
      changedPaths: ['app.mjs'],
      verifications: [{ obligationId: 'default', commandRef: 'test:focus', acceptanceCoverage: ['invalid password returns 401'] }],
    });
    assert.equal(completed.status, 'completed', JSON.stringify(completed));
    assert.equal(completed.finalization.completionStatus, 'accepted');
    assert.equal(completed.next.action.type, 'done');
  } finally {
    await controlPlane.close();
    await rm(runtimeHome, { recursive: true, force: true });
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('host loop blocks on untrusted verification commands instead of executing them', async () => {
  const runtimeHome = await mkdtemp(path.join(os.tmpdir(), 'krn-host-loop-home2-'));
  const projectRoot = await setupProject();
  const cp = await createKernelControlPlane({ runtimeHome, projectRoot });
  try {
    await cp.startRun({ runId: 'host-loop-2', objective: 'Try untrusted command' });
    const res = await cp.report('host-loop-2', {
      summary: 'attempt',
      verifications: [{ commandRef: 'curl-something' }],
    });
    assert.equal(res.status, 'blocked');
    assert.equal(res.blockedReason, 'unsafe-command');
    const nextPayload = await cp.next('host-loop-2');
    assert.equal(nextPayload.action.type, 'blocked');
  } finally {
    await cp.close();
    await rm(runtimeHome, { recursive: true, force: true });
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('caller-attested proof alone cannot complete a source-mutating run', async () => {
  const runtimeHome = await mkdtemp(path.join(os.tmpdir(), 'krn-host-loop-home3-'));
  const projectRoot = await setupProject();
  const cp = await createKernelControlPlane({ runtimeHome, projectRoot });
  const validDigest = `sha256:${'a'.repeat(64)}`;
  try {
    await cp.startRun({ runId: 'host-loop-3', objective: 'Mutating run with attested proof only' });

    // Source mutates after run start.
    await writeFile(path.join(projectRoot, 'app.mjs'), `export const statusForInvalidPassword = () => 401;\n`);
    cp.stateStore.observeWorkspaceIdentity('host-loop-3', observeWorkspaceIdentity({ projectRoot }).identity);

    await cp.transition('host-loop-3', 'EXECUTE');
    await cp.transition('host-loop-3', 'PROVE');
    await cp.recordProof('host-loop-3', {
      obligationId: 'default',
      status: 'passed',
      evidenceRef: 'evidence://attested/1',
      command: 'npm test',
      exitCode: 0,
      evidenceDigest: validDigest,
    });
    const finalization = await cp.finalizeRun('host-loop-3');
    assert.equal(finalization.completionStatus, 'blocked');
    assert.equal(finalization.completionResult.hardEvidence.required, true);
    assert.equal(finalization.completionResult.hardEvidence.count, 0);
  } finally {
    await cp.close();
    await rm(runtimeHome, { recursive: true, force: true });
    await rm(projectRoot, { recursive: true, force: true });
  }
});
