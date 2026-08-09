import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { createKernelControlPlane } from '../scripts/kernel/control-plane.mjs';
import { buildExecutionContract, dispatchKernelTurn } from '../scripts/host/kernel/turn-dispatcher.mjs';
import { createModelRegistry } from '../scripts/host/kernel/model-registry.mjs';
import { createClaudeAdapter } from '../scripts/host/kernel/adapters/claude.mjs';
import { createCodexAdapter } from '../scripts/host/kernel/adapters/codex.mjs';
import { createFableAdapter } from '../scripts/host/kernel/adapters/fable.mjs';

const registryFor = (surface, env) => createModelRegistry({ surface, env });
const FRONTIER_ENV = { MOON_RELAY_KERNEL_MODEL_FRONTIER: 'configured-frontier', MOON_RELAY_KERNEL_MODEL_VALUE: 'configured-value' };

const withRun = async (fn) => {
  const runtimeHome = await mkdtemp(path.join(os.tmpdir(), 'krn-dispatch-home-'));
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'krn-dispatch-proj-'));
  spawnSync('git', ['init'], { cwd: projectRoot, encoding: 'utf8' });
  await writeFile(path.join(projectRoot, 'package.json'), JSON.stringify({ name: 'x', scripts: { test: 'node -e "process.exit(0)"', lint: 'node -e "process.exit(0)"' } }));
  const cp = await createKernelControlPlane({ runtimeHome, projectRoot });
  try {
    await cp.startRun({ runId: 'r-dispatch', objective: 'dispatch' });
    return await fn(cp, 'r-dispatch');
  } finally {
    await cp.close();
    await rm(runtimeHome, { recursive: true, force: true });
    await rm(projectRoot, { recursive: true, force: true });
  }
};

test('a Host that applies the requested model records an enforced receipt', async () => {
  await withRun(async (cp, runId) => {
    const adapter = createClaudeAdapter({
      launch: async ({ invocation }) => ({ resolvedModel: invocation.model, sessionId: 'claude-session-1', inputTokens: 900, outputTokens: 120 }),
    });
    const result = await dispatchKernelTurn({ controlPlane: cp, runId, adapter, registry: registryFor('claude', FRONTIER_ENV) });
    assert.equal(result.dispatched, true);
    assert.equal(result.dispatch.invocation.subagent, 'kernel-implementer');
    assert.equal(result.resolution.model, 'configured-value');
    assert.equal(result.receipt.enforcementStatus, 'enforced');
    assert.equal(result.receipt.resolvedModel, 'configured-value');
    assert.equal(result.receipt.inputTokens, 900);
    assert.match(result.receipt.actorSessionId, /^sha256:[a-f0-9]{64}$/);
    assert.equal(cp.modelRoutingSummary(runId).enforcedTurns, 1);
  });
});

test('a Host that silently answers with a different model records a fallback', async () => {
  await withRun(async (cp, runId) => {
    const adapter = createClaudeAdapter({ launch: async () => ({ resolvedModel: 'some-other-model', sessionId: 's' }) });
    const result = await dispatchKernelTurn({ controlPlane: cp, runId, adapter, registry: registryFor('claude', FRONTIER_ENV) });
    assert.equal(result.receipt.enforcementStatus, 'fallback');
    assert.equal(result.receipt.resolvedModel, 'some-other-model');
  });
});

test('an unconfigured model resolves to the installed Host default and stays advisory', async () => {
  await withRun(async (cp, runId) => {
    const adapter = createClaudeAdapter({ launch: async () => ({ resolvedModel: 'whatever-the-host-runs', sessionId: 's' }) });
    const result = await dispatchKernelTurn({ controlPlane: cp, runId, adapter, registry: registryFor('claude', {}) });
    assert.equal(result.resolution.source, 'host-default');
    assert.equal(result.receipt.enforcementStatus, 'advisory');
  });
});

test('a Host without model switching is recorded as unsupported, never as enforced', async () => {
  await withRun(async (cp, runId) => {
    const result = await dispatchKernelTurn({ controlPlane: cp, runId, adapter: createFableAdapter(), registry: registryFor('fable', FRONTIER_ENV) });
    assert.equal(result.hostDirective.enforcementStrategy, 'unsupported');
    assert.equal(result.receipt.enforcementStatus, 'unsupported');
    assert.equal(result.receipt.resolvedModel, null);
    assert.equal(result.receipt.inputTokens, null);
  });
});

test('a Host that cannot report tokens leaves them unavailable rather than zero', async () => {
  await withRun(async (cp, runId) => {
    const adapter = createCodexAdapter({ launch: async ({ invocation }) => ({ resolvedModel: invocation.model, sessionId: 'codex-1' }) });
    const result = await dispatchKernelTurn({ controlPlane: cp, runId, adapter, registry: registryFor('codex', FRONTIER_ENV) });
    assert.equal(result.dispatch.invocation.mechanism, 'session-model-override');
    assert.equal(result.dispatch.invocation.sandbox, 'workspace-write');
    assert.equal(result.receipt.enforcementStatus, 'enforced');
    assert.equal(result.receipt.inputTokens, null);
    assert.equal(result.receipt.outputTokens, null);
    assert.equal(cp.modelRoutingSummary(runId).tokens.reportedTurns, 0);
  });
});

test('a failing dispatch is recorded as failed and never as an enforced success', async () => {
  await withRun(async (cp, runId) => {
    const adapter = createClaudeAdapter({ launch: async () => { throw new Error('worker crashed'); } });
    const result = await dispatchKernelTurn({ controlPlane: cp, runId, adapter, registry: registryFor('claude', FRONTIER_ENV) });
    assert.equal(result.receipt.enforcementStatus, 'failed');
    assert.equal(result.receipt.resultStatus, 'failed');
  });
});

test('kernel-owned actions are never dispatched to a provider', async () => {
  await withRun(async (cp, runId) => {
    const adapter = createClaudeAdapter({ launch: async () => { throw new Error('must not be called'); } });
    const result = await dispatchKernelTurn({ controlPlane: cp, runId, adapter, registry: registryFor('claude', FRONTIER_ENV), actionContext: { actionKind: 'prove' } });
    assert.equal(result.dispatched, false);
    assert.equal(result.reason, 'kernel-owned-action');
    assert.equal(result.receipt, null);
    assert.equal(cp.modelRoutingSummary(runId).kernelOnlyActions, 1);
  });
});

test('the worker receives an execution contract, not the conversation', () => {
  const modelInput = {
    objective: 'add a flag', acceptance: ['flag works'], constraints: ['no new deps'], nonGoals: ['redesign'],
    evidence: [
      { obligationId: 'default', status: 'passed', evidenceClass: 'hard' },
      { obligationId: 'security-review', status: 'failed', evidenceClass: 'judgment' },
    ], knowledge: 'irrelevant prompt block',
    action: { type: 'implement', guidance: 'do it', outstandingObligations: ['default'], obligations: [{ obligationId: 'default' }] },
  };
  const implement = buildExecutionContract(modelInput, { role: 'implementer', permissions: 'workspace_write', riskTier: 'T1' });
  assert.deepEqual(implement.outstandingObligations, ['default']);
  assert.equal(implement.permissions, 'workspace_write');
  assert.equal(JSON.stringify(implement).includes('irrelevant prompt block'), false);

  const review = buildExecutionContract({ ...modelInput, changedPaths: ['src/a.ts'] }, { role: 'reviewer', permissions: 'read_only', riskTier: 'T3', obligationId: 'security-review' });
  assert.deepEqual(Object.keys(review).sort(), ['acceptance', 'changedPaths', 'objective', 'permissions', 'riskTier', 'role', 'verificationEvidence']);
  assert.equal(review.permissions, 'read_only');
  assert.equal(review.constraints, undefined);
  assert.deepEqual(review.acceptance, []);
  assert.deepEqual(review.verificationEvidence.map((entry) => entry.obligationId), ['default']);

  const visualReview = buildExecutionContract({ ...modelInput, acceptance: [{ id: 'AC-9' }, { id: 'AC-10' }] }, { role: 'reviewer', permissions: 'read_only', riskTier: 'T3', obligationId: 'judgment-ac-10' });
  assert.deepEqual(visualReview.acceptance, [{ id: 'AC-10' }]);
});
