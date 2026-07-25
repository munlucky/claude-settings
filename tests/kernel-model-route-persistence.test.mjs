import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { openKernelStateStore } from '../scripts/kernel/state-store.mjs';
import { resolveModelRoute } from '../scripts/kernel/run/model-routing.mjs';

const withStore = async (fn) => {
  const runtimeHome = await mkdtemp(path.join(os.tmpdir(), 'krn-route-db-'));
  const store = await openKernelStateStore({ runtimeHome });
  try {
    return await fn(store, runtimeHome);
  } finally {
    store.close();
    await rm(runtimeHome, { recursive: true, force: true });
  }
};

const seedRun = (store, runId) => store.createRun({ runId, objective: 'route persistence', sourceIdentity: 'kernel-test-source' });

test('route decisions persist with their reason codes and are readable per run', async () => {
  await withStore(async (store) => {
    seedRun(store, 'r-a');
    seedRun(store, 'r-b');
    const planned = store.recordModelRouteDecision('r-a', resolveModelRoute({ runId: 'r-a', actionKind: 'plan' }));
    const implemented = store.recordModelRouteDecision('r-a', resolveModelRoute({ runId: 'r-a', actionKind: 'implement', sequence: 1, obligationId: 'default' }));
    store.recordModelRouteDecision('r-b', resolveModelRoute({ runId: 'r-b', actionKind: 'implement' }));

    assert.equal(store.getModelRouteDecision(planned.decisionId).modelClass, 'frontier_reasoning');
    assert.equal(store.getModelRouteDecision(implemented.decisionId).modelClass, 'value_coding');
    assert.deepEqual(store.listModelRouteDecisions('r-a').map((d) => d.actionKind), ['plan', 'implement']);
    assert.equal(store.listModelRouteDecisions('r-b').length, 1);
    // A decision from another run is not reachable through this run.
    assert.equal(store.getModelRouteDecision(planned.decisionId, { runId: 'r-b' }), null);
  });
});

test('a decision cannot be filed against a foreign or missing run', async () => {
  await withStore(async (store) => {
    seedRun(store, 'r-a');
    const decision = resolveModelRoute({ runId: 'r-a', actionKind: 'implement' });
    assert.throws(() => store.recordModelRouteDecision('r-b', decision), /does not match run/);
    assert.throws(() => store.recordModelRouteDecision('r-missing', resolveModelRoute({ runId: 'r-missing', actionKind: 'implement' })), /not found/);
  });
});

test('persisted decisions never carry provider identity, prompts, or secrets', async () => {
  await withStore(async (store) => {
    seedRun(store, 'r-a');
    const decision = resolveModelRoute({ runId: 'r-a', actionKind: 'implement' });
    assert.throws(() => store.recordModelRouteDecision('r-a', { ...decision, resolvedModel: 'some-provider-model' }), /must not carry host\/provider field/);
    assert.throws(() => store.recordModelRouteDecision('r-a', { ...decision, prompt: 'full transcript' }), /must not carry host\/provider field/);
    store.recordModelRouteDecision('r-a', decision);
    const stored = JSON.stringify(store.listModelRouteDecisions('r-a'));
    assert.doesNotMatch(stored, /sk-|api[_-]?key|prompt|stdout/i);
  });
});

test('an escalated decision is recorded so the next turn can honour the escalation lock', async () => {
  await withStore(async (store) => {
    seedRun(store, 'r-a');
    store.recordModelRouteDecision('r-a', resolveModelRoute({ runId: 'r-a', actionKind: 'implement', obligationId: 'unit-test', retryCount: 2, currentPlanRevision: 2, attemptNumber: 3 }));
    const [decision] = store.listModelRouteDecisions('r-a');
    assert.equal(decision.modelClass, 'frontier_reasoning');
    assert.equal(decision.planRevision, 2);
    assert.equal(decision.obligationId, 'unit-test');
    assert.ok(decision.reasonCodes.includes('RETRY_ESCALATION'));
  });
});
