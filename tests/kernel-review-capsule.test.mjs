// K1 §6.8: reviewers do not receive the implementer's capsule. They receive a
// read-only capsule describing the subject and the evidence, and nothing about
// how the implementation was reasoned about.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { createKernelControlPlane } from '../scripts/kernel/control-plane.mjs';
import { normalizeReviewCapsule } from '../scripts/kernel/run/execution-capsule.mjs';
import { hashSessionId } from '../scripts/kernel/run/model-route-contract.mjs';
import { dispatchKernelTurn } from '../scripts/host/kernel/turn-dispatcher.mjs';
import { createModelRegistry } from '../scripts/host/kernel/model-registry.mjs';
import { createClaudeAdapter } from '../scripts/host/kernel/adapters/claude.mjs';

const IMPLEMENTER = hashSessionId('review-capsule-implementer');

const setup = async () => {
  const runtimeHome = await mkdtemp(path.join(os.tmpdir(), 'krn-revcap-home-'));
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'krn-revcap-proj-'));
  spawnSync('git', ['init'], { cwd: projectRoot, encoding: 'utf8' });
  await writeFile(path.join(projectRoot, 'package.json'), JSON.stringify({
    name: 'revcap-fixture', version: '0.0.1', scripts: { 'test:ok': 'node -e "process.exit(0)"', lint: 'node -e "process.exit(0)"' },
  }, null, 2));
  await mkdir(path.join(projectRoot, 'src', 'auth'), { recursive: true });
  await writeFile(path.join(projectRoot, 'src', 'auth', 'service.mjs'), 'export const v = 0;\n');
  spawnSync('git', ['add', '--all'], { cwd: projectRoot, encoding: 'utf8' });
  spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', 'commit', '-m', 'fixture', '--quiet'], { cwd: projectRoot, encoding: 'utf8' });
  return { runtimeHome, projectRoot };
};

const cleanup = async ({ runtimeHome, projectRoot }) => {
  await rm(runtimeHome, { recursive: true, force: true });
  await rm(projectRoot, { recursive: true, force: true });
};

test('K1-8: the reviewer capsule is read-only and carries subject plus evidence only', async () => {
  const fixture = await setup();
  const cp = await createKernelControlPlane(fixture);
  try {
    await cp.startRun({
      runId: 'r-revcap',
      objective: 'auth boundary',
      taskContract: { surfaces: ['security_boundary'], acceptance: ['works'], allowedPaths: ['src/auth/**'], constraints: ['keep the response shape'] },
    });
    await writeFile(path.join(fixture.projectRoot, 'src', 'auth', 'service.mjs'), 'export const v = 1;\n');

    const implementerCapsule = await cp.buildCapsule('r-revcap');
    const decision = await cp.decideModelRoute('r-revcap', { actionKind: 'implement', obligationId: 'unit-test' });
    await cp.recordModelUsage('r-revcap', {
      decisionId: decision.decisionId,
      runId: 'r-revcap',
      hostSurface: 'claude',
      actorSessionId: IMPLEMENTER,
      resolvedModel: 'configured-model',
      enforcementStatus: 'enforced',
      resultStatus: 'completed',
      capsuleId: implementerCapsule.capsuleId,
      capsuleDigest: implementerCapsule.provenance.capsuleDigest,
    });
    await cp.report('r-revcap', {
      summary: 'implemented',
      changedPaths: ['src/auth/service.mjs'],
      verifications: [
        { obligationId: 'unit-test', commandRef: 'test:ok', acceptanceCoverage: ['works'] },
        { obligationId: 'static-analysis', commandRef: 'lint' },
      ],
    });

    const reviewCapsule = await cp.buildReviewerCapsule('r-revcap', {
      stage: 'engineering',
      obligationId: 'security-review',
      changedPaths: ['src/auth/service.mjs'],
    });

    assert.equal(reviewCapsule.role, 'reviewer');
    assert.equal(reviewCapsule.permissions.filesystem, 'read_only');
    assert.equal(reviewCapsule.permissions.canCommit, false);
    assert.notEqual(reviewCapsule.capsuleId, implementerCapsule.capsuleId);

    // Subject and evidence: what changed, against which state, and what ran.
    assert.deepEqual(reviewCapsule.subject.changedPaths, ['src/auth/service.mjs']);
    // The diff digest identifies the exact file states reviewed, without the
    // capsule carrying the diff — and it moves when the files move.
    assert.match(reviewCapsule.subject.diffDigest, /^sha256:[a-f0-9]{64}$/);
    await writeFile(path.join(fixture.projectRoot, 'src', 'auth', 'service.mjs'), 'export const v = 2;\n');
    const afterEdit = await cp.buildReviewerCapsule('r-revcap', { stage: 'engineering', obligationId: 'security-review', changedPaths: ['src/auth/service.mjs'] });
    assert.notEqual(afterEdit.subject.diffDigest, reviewCapsule.subject.diffDigest);
    assert.equal(reviewCapsule.subject.mutationRevision, (await cp.getRun('r-revcap')).mutationRevision);
    const evidence = Object.fromEntries(reviewCapsule.verificationEvidence.map((entry) => [entry.obligationId, entry]));
    assert.equal(evidence['unit-test'].status, 'passed');
    assert.equal(evidence['unit-test'].exitCode, 0);
    assert.equal(reviewCapsule.reviewScope.stage, 'engineering');
    assert.equal(reviewCapsule.reviewScope.obligationId, 'security-review');

    // The implementation is identified by its receipt, not reproduced.
    assert.equal(reviewCapsule.implementationReceipt.actorSessionId, IMPLEMENTER);
    assert.equal(reviewCapsule.implementationReceipt.capsuleDigest, implementerCapsule.provenance.capsuleDigest);

    // What the reviewer must NOT receive.
    assert.equal(reviewCapsule.repositoryContext, undefined, 'no implementer repository context');
    assert.equal(reviewCapsule.workUnit, undefined, 'no implementer work unit or allowed paths');
    assert.equal(reviewCapsule.verification, undefined, 'no implementer obligation worksheet');
    const serialized = JSON.stringify(reviewCapsule);
    assert.ok(!serialized.includes('keep the response shape'), 'implementer constraints are not review input');
    assert.ok(!serialized.includes('workspace_write'));
  } finally {
    await cp.close();
    await cleanup(fixture);
  }
});

test('K1: a review capsule is a closed record with a read-only permission floor', () => {
  const base = {
    runId: 'r-1',
    subject: { changedPaths: ['a.mjs'], workspaceIdentity: `sha256:${'a'.repeat(64)}`, mutationRevision: 1 },
    reviewScope: { stage: 'contract' },
  };
  const capsule = normalizeReviewCapsule(base);
  assert.equal(capsule.permissions.filesystem, 'read_only');
  assert.match(capsule.capsuleId, /^capsule-[a-f0-9]{24}$/);
  assert.equal(normalizeReviewCapsule({ ...base, createdAt: '2026-01-01T00:00:00.000Z' }).capsuleId, capsule.capsuleId, 'identity excludes creation time');

  assert.throws(() => normalizeReviewCapsule({ ...base, reviewScope: { stage: 'implementation' } }), /reviewScope.stage/);
  assert.throws(() => normalizeReviewCapsule({ ...base, subject: { ...base.subject, workspaceIdentity: 'HEAD' } }), /workspaceIdentity/);
});

test('K1: the capsule reaches the worker launcher, not just the dispatcher', async () => {
  const fixture = await setup();
  const cp = await createKernelControlPlane(fixture);
  try {
    await cp.startRun({ runId: 'r-launch', objective: 'auth boundary', taskContract: { surfaces: ['security_boundary'], acceptance: ['works'], allowedPaths: ['src/auth/**'] } });
    const seen = [];
    const adapter = createClaudeAdapter({
      launch: async ({ invocation, executionCapsule }) => {
        seen.push(executionCapsule);
        return { resolvedModel: invocation.model, sessionId: 'worker' };
      },
    });

    const implementTurn = await dispatchKernelTurn({
      controlPlane: cp,
      runId: 'r-launch',
      adapter,
      registry: createModelRegistry({ surface: 'claude', env: { MOON_RELAY_KERNEL_MODEL_FRONTIER: 'configured-frontier', MOON_RELAY_KERNEL_MODEL_VALUE: 'configured-value' } }),
    });
    // The launcher is the thing that actually starts a worker session; a capsule
    // that stops at the dispatcher would leave the worker with the old flat
    // contract and no work unit at all. It receives the model-visible
    // projection, though — capsuleId and other control fields stay on the
    // full capsule dispatchKernelTurn returns, never on what the launcher saw.
    assert.ok(implementTurn.executionCapsule.capsuleId);
    assert.ok(!Object.hasOwn(seen[0], 'capsuleId'), 'the launcher must not see the persisted capsuleId');
    assert.equal(seen[0].role, 'implementer');
    assert.deepEqual(seen[0].workUnit.allowedPaths, ['src/auth/**']);

    const reviewTurn = await dispatchKernelTurn({
      controlPlane: cp,
      runId: 'r-launch',
      adapter,
      registry: createModelRegistry({ surface: 'claude', env: { MOON_RELAY_KERNEL_MODEL_FRONTIER: 'configured-frontier', MOON_RELAY_KERNEL_MODEL_VALUE: 'configured-value' } }),
      actionContext: { actionKind: 'review_engineering', obligationId: 'security-review' },
    });
    assert.ok(reviewTurn.executionCapsule.capsuleId);
    assert.ok(!Object.hasOwn(seen[1], 'capsuleId'), 'the launcher must not see the persisted capsuleId');
    assert.equal(seen[1].role, 'reviewer');
    assert.equal(seen[1].permissions.filesystem, 'read_only');
    assert.equal(seen[1].workUnit, undefined, 'a reviewer never receives the implementer work unit');
  } finally {
    await cp.close();
    await cleanup(fixture);
  }
});

test('K1: the Host receives a reviewer capsule for a review turn and an implementer capsule otherwise', async () => {
  const fixture = await setup();
  const cp = await createKernelControlPlane(fixture);
  try {
    await cp.startRun({ runId: 'r-hostcap', objective: 'auth boundary', taskContract: { surfaces: ['security_boundary'], acceptance: ['works'] } });
    const capabilities = { surface: 'claude', supportsSubagentModel: true, supportsIndependentContext: true, supportsResolvedModelIdentity: true };

    const implementTurn = await cp.hostNext('r-hostcap', { hostCapabilities: capabilities, actionContext: { actionKind: 'implement' } });
    assert.equal(implementTurn.executionCapsule.role, 'implementer');
    assert.equal(implementTurn.modelInput.action.capsuleId, implementTurn.executionCapsule.capsuleId);

    const reviewTurn = await cp.hostNext('r-hostcap', { hostCapabilities: capabilities, actionContext: { actionKind: 'review_engineering', obligationId: 'security-review' } });
    assert.equal(reviewTurn.executionCapsule.role, 'reviewer');
    assert.equal(reviewTurn.executionCapsule.permissions.filesystem, 'read_only');
    assert.equal(reviewTurn.hostDirective.executionCapsule.capsuleId, reviewTurn.executionCapsule.capsuleId);
  } finally {
    await cp.close();
    await cleanup(fixture);
  }
});
