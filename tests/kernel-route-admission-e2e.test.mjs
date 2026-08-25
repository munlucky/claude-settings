// K3 end to end: the admission is created, revalidated, and linked to the usage
// receipt on every dispatched turn — including the honest weaker outcomes.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { createKernelControlPlane } from '../scripts/kernel/control-plane.mjs';
import { openKernelStateStore } from '../scripts/kernel/state-store.mjs';
import { dispatchKernelTurn } from '../scripts/host/kernel/turn-dispatcher.mjs';
import { createModelRegistry } from '../scripts/host/kernel/model-registry.mjs';
import { createClaudeAdapter } from '../scripts/host/kernel/adapters/claude.mjs';
import { createCodexAdapter } from '../scripts/host/kernel/adapters/codex.mjs';
import { createFableAdapter } from '../scripts/host/kernel/adapters/fable.mjs';
import { CODEX_MAIN_SESSION_POLICY } from '../scripts/host/kernel/codex-session-observer.mjs';

const CONFIGURED = { MOON_RELAY_KERNEL_MODEL_FRONTIER: 'configured-frontier', MOON_RELAY_KERNEL_MODEL_VALUE: 'configured-value' };
const stableParentObserver = async ({ parentSessionId }) => ({ sessionId: parentSessionId, model: CODEX_MAIN_SESSION_POLICY.model, effort: CODEX_MAIN_SESSION_POLICY.effort });

const withRun = async (fn, { taskContract = { acceptance: ['works'] } } = {}) => {
  const runtimeHome = await mkdtemp(path.join(os.tmpdir(), 'krn-adme2e-home-'));
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'krn-adme2e-proj-'));
  spawnSync('git', ['init'], { cwd: projectRoot, encoding: 'utf8' });
  await writeFile(path.join(projectRoot, 'package.json'), JSON.stringify({ name: 'x', scripts: { 'test:ok': 'node -e "process.exit(0)"' } }));
  const cp = await createKernelControlPlane({ runtimeHome, projectRoot });
  try {
    await cp.startRun({ runId: 'r-e2e', objective: 'implement', taskContract });
    return await fn(cp, 'r-e2e', { runtimeHome, projectRoot });
  } finally {
    await cp.close();
    await rm(runtimeHome, { recursive: true, force: true });
    await rm(projectRoot, { recursive: true, force: true });
  }
};

test('K3-1/10: a value implementation turn is admitted and its receipt carries the lineage', async () => {
  await withRun(async (cp, runId, fixture) => {
    const adapter = createClaudeAdapter({ launch: async ({ invocation }) => ({ resolvedModel: invocation.model, sessionId: 'worker-1', inputTokens: 10, outputTokens: 5 }) });
    const result = await dispatchKernelTurn({
      controlPlane: cp,
      runId,
      adapter,
      registry: createModelRegistry({ surface: 'claude', env: CONFIGURED }),
      economics: { maxCostUnits: 10, estimatedCostUnits: 3 },
    });

    assert.equal(result.dispatched, true);
    assert.equal(result.admission.decision, 'admitted');
    assert.equal(result.admission.requested.modelClass, 'value_coding');
    assert.equal(result.admission.resolved.source, 'environment');
    assert.equal(result.receipt.enforcementStatus, 'enforced');

    // Everything resolves from persisted state after the process is gone.
    const store = await openKernelStateStore({ runtimeHome: fixture.runtimeHome });
    try {
      const [receipt] = store.listModelUsageReceipts(runId);
      const admission = store.getRouteAdmission(receipt.admissionId, { runId });
      assert.equal(admission.digest, receipt.admissionDigest);
      assert.equal(admission.decisionId, receipt.decisionId);
      assert.equal(store.getExecutionCapsule(receipt.capsuleId, { runId }).provenance.capsuleDigest, receipt.capsuleDigest);
      assert.equal(receipt.stepId, admission.stepId);
    } finally {
      store.close();
    }
  });
});

test('K3-7: a Host that answers with another model is admitted but recorded as a fallback', async () => {
  await withRun(async (cp, runId) => {
    const adapter = createClaudeAdapter({ launch: async () => ({ resolvedModel: 'something-else', sessionId: 's' }) });
    const result = await dispatchKernelTurn({ controlPlane: cp, runId, adapter, registry: createModelRegistry({ surface: 'claude', env: CONFIGURED }) });
    // Admission answers "may this dispatch happen"; the receipt answers "what
    // actually ran". The mismatch surfaces in the receipt, not as a success.
    assert.equal(result.admission.decision, 'admitted');
    assert.equal(result.receipt.enforcementStatus, 'fallback');
    assert.equal(result.receipt.resolvedModel, 'something-else');
  });
});

test('K3-8: a Host that cannot report tokens leaves them unavailable on an admitted turn', async () => {
  await withRun(async (cp, runId, fixture) => {
    const adapter = createCodexAdapter({ parentSessionObserver: stableParentObserver, launch: async ({ invocation }) => ({ resolvedModel: invocation.model, resolvedEffort: invocation.effort, effortObserved: true, sessionId: 'codex-1' }) });
    const result = await dispatchKernelTurn({ controlPlane: cp, runId, adapter, parentSessionId: 'codex-parent-session', registry: createModelRegistry({ surface: 'codex', env: CONFIGURED }) });
    assert.equal(result.admission.decision, 'admitted');
    assert.equal(result.receipt.enforcementStatus, 'enforced');
    assert.equal(result.receipt.inputTokens, null);
    assert.equal(result.receipt.outputTokens, null);
    assert.equal(result.receipt.requestedModel, result.resolution.model);
    assert.equal(result.receipt.requestedEffort, result.resolution.effort);
    assert.equal(result.receipt.observedModel, result.resolution.model);
    assert.equal(result.receipt.observedEffort, result.resolution.effort);
    const store = await openKernelStateStore({ runtimeHome: fixture.runtimeHome });
    try {
      const [stored] = store.listModelUsageReceipts(runId);
      assert.equal(stored.requestedModel, result.resolution.model);
      assert.equal(stored.requestedEffort, result.resolution.effort);
      assert.equal(stored.observedModel, result.resolution.model);
      assert.equal(stored.observedEffort, result.resolution.effort);
    } finally {
      store.close();
    }
  });
});

test('K3: a Host that can neither select a model nor prove one is advisory, and says so', async () => {
  await withRun(async (cp, runId) => {
    // The generic surface declares nothing it cannot prove. Ordinary work still
    // proceeds on whatever model the Host runs — but the admission and the
    // receipt both refuse to call that the requested class.
    const result = await dispatchKernelTurn({ controlPlane: cp, runId, adapter: createFableAdapter(), registry: createModelRegistry({ surface: 'fable', env: CONFIGURED }) });
    assert.equal(result.dispatched, true);
    assert.equal(result.admission.decision, 'advisory_admitted');
    assert.notEqual(result.admission.decision, 'admitted');
    assert.equal(result.receipt.enforcementStatus, 'unsupported');
    assert.equal(result.receipt.resolvedModel, null);
    assert.equal(cp.listRouteAdmissions(runId).at(-1).decision, 'advisory_admitted');
  });
});

test('K3: an advisory admission is recorded as advisory, never as admitted', async () => {
  await withRun(async (cp, runId) => {
    const adapter = createClaudeAdapter({ launch: async () => ({ resolvedModel: 'host-default-model', sessionId: 's' }) });
    const result = await dispatchKernelTurn({ controlPlane: cp, runId, adapter, registry: createModelRegistry({ surface: 'claude', env: {} }) });
    assert.equal(result.dispatched, true);
    assert.equal(result.admission.decision, 'advisory_admitted');
    assert.equal(result.admission.resolved.source, 'host-default');
    assert.equal(result.receipt.enforcementStatus, 'advisory');
  });
});

test('K3-6: a permission policy that moved between admission and dispatch stops the turn', async () => {
  await withRun(async (cp, runId) => {
    let launched = false;
    const adapter = createClaudeAdapter({ launch: async () => { launched = true; return { resolvedModel: 'configured-value', sessionId: 's' }; } });
    // The adapter the dispatcher revalidates against reports different
    // capabilities than the ones the admission was computed from.
    const drifting = { ...adapter, capabilities: { ...adapter.capabilities, supportsUsageTokens: !adapter.capabilities.supportsUsageTokens } };
    const original = drifting.capabilities;
    Object.defineProperty(drifting, 'capabilities', {
      get() {
        // First read (admission) sees the recorded snapshot; the revalidation
        // read sees the changed configuration.
        this._reads = (this._reads || 0) + 1;
        return this._reads <= 1 ? adapter.capabilities : original;
      },
    });

    const result = await dispatchKernelTurn({ controlPlane: cp, runId, adapter: drifting, registry: createModelRegistry({ surface: 'claude', env: CONFIGURED }) });
    assert.equal(result.dispatched, false);
    assert.equal(launched, false, 'drift is caught before the worker starts');
    assert.ok(result.drift.length > 0);
    assert.equal(result.drift[0].field, 'hostCapabilityDigest');
  });
});
