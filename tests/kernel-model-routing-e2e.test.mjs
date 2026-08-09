import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { createKernelControlPlane } from '../scripts/kernel/control-plane.mjs';
import { dispatchKernelTurn } from '../scripts/host/kernel/turn-dispatcher.mjs';
import { createModelRegistry } from '../scripts/host/kernel/model-registry.mjs';
import { createClaudeAdapter } from '../scripts/host/kernel/adapters/claude.mjs';

const ENV = { MOON_RELAY_KERNEL_CLAUDE_FRONTIER: 'frontier-model', MOON_RELAY_KERNEL_CLAUDE_VALUE: 'value-model' };

// A Host that honestly reports the model it was told to use, and a fresh
// session id per role so reviewer independence is observable.
const adapterFor = (sessions) => createClaudeAdapter({
  launch: async ({ invocation, decision }) => {
    sessions.push({ role: decision.role, model: invocation.model });
    return { resolvedModel: invocation.model, sessionId: `${decision.role}-session`, inputTokens: 1000, outputTokens: 200, wallClockMs: 5000 };
  },
});

const withProject = async (scripts, fn) => {
  const runtimeHome = await mkdtemp(path.join(os.tmpdir(), 'krn-route-e2e-home-'));
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'krn-route-e2e-proj-'));
  spawnSync('git', ['init'], { cwd: projectRoot, encoding: 'utf8' });
  await writeFile(path.join(projectRoot, 'package.json'), JSON.stringify({
    name: 'x',
    scripts: {
      test: 'node -e "process.exit(0)"',
      lint: 'node -e "process.exit(0)"',
      ...scripts,
    },
  }));
  await writeFile(path.join(projectRoot, 'app.mjs'), 'export const v = 0;\n');
  const cp = await createKernelControlPlane({ runtimeHome, projectRoot });
  try {
    return await fn(cp, projectRoot);
  } finally {
    await cp.close();
    await rm(runtimeHome, { recursive: true, force: true });
    await rm(projectRoot, { recursive: true, force: true });
  }
};

test('a full routed turn implements on value coding and finishes on kernel evidence', async () => {
  await withProject({ 'test:ok': 'node -e "process.exit(0)"' }, async (cp, projectRoot) => {
    const sessions = [];
    await cp.startRun({
      runId: 'r-e2e',
      objective: 'routed loop',
      taskContract: {
        acceptance: [{ acceptance: 'works', evidencePlan: { class: 'hard', method: 'unit-test', commandRefs: ['test:ok'], obligationId: 'default' } }],
      },
    });

    const turn = await dispatchKernelTurn({
      controlPlane: cp,
      runId: 'r-e2e',
      adapter: adapterFor(sessions),
      registry: createModelRegistry({ surface: 'claude', env: ENV }),
    });
    assert.equal(turn.dispatched, true);
    assert.equal(turn.hostDirective.modelRouteDecision.modelClass, 'value_coding');
    assert.equal(turn.receipt.enforcementStatus, 'enforced');
    assert.deepEqual(sessions, [{ role: 'implementer', model: 'value-model' }]);

    // The value implementer does the work; the Kernel still executes the proof.
    await writeFile(path.join(projectRoot, 'app.mjs'), 'export const v = 1;\n');
    const report = await cp.report('r-e2e', {
      summary: 'implemented',
      changedPaths: ['app.mjs'],
      verifications: [{ obligationId: 'default', commandRef: 'test:ok', acceptanceCoverage: ['works'] }],
    });
    assert.equal(report.status, 'completed', JSON.stringify(report.failures));

    const status = await cp.status('r-e2e');
    assert.equal(status.measurement.providerModelIdentity.status, 'observed');
    assert.deepEqual(status.measurement.providerModelIdentity.value.models, ['value-model']);
    assert.equal(status.measurement.modelRouting.value.valueTurns, 1);
    assert.equal(status.measurement.modelRouting.value.enforcedTurns, 1);
  });
});

test('a value model cannot complete a mutating run on its own say-so', async () => {
  await withProject({ 'test:ok': 'node -e "process.exit(0)"' }, async (cp, projectRoot) => {
    await cp.startRun({ runId: 'r-claim', objective: 'unproven claim', taskContract: { acceptance: ['works'] } });
    await dispatchKernelTurn({
      controlPlane: cp,
      runId: 'r-claim',
      adapter: adapterFor([]),
      registry: createModelRegistry({ surface: 'claude', env: ENV }),
    });
    await writeFile(path.join(projectRoot, 'app.mjs'), 'export const v = 2;\n');
    // No verification requested: the model just says it is done.
    const report = await cp.report('r-claim', { summary: 'trust me, it works', changedPaths: ['app.mjs'] });
    assert.notEqual(report.status, 'completed');
    assert.notEqual((await cp.getRun('r-claim')).status, 'completed');
    assert.notEqual((await cp.assessCompletion('r-claim')).decision, 'accepted');
  });
});

test('planning, implementation, and review each land on the class their action requires', async () => {
  await withProject({}, async (cp) => {
    const sessions = [];
    const adapter = adapterFor(sessions);
    const registry = createModelRegistry({ surface: 'claude', env: ENV });
    await cp.startRun({ runId: 'r-mix', objective: 'auth boundary', taskContract: { surfaces: ['security_boundary'] } });

    for (const actionKind of ['plan', 'implement', 'review_engineering']) {
      await dispatchKernelTurn({ controlPlane: cp, runId: 'r-mix', adapter, registry, actionContext: { actionKind } });
    }
    assert.deepEqual(sessions, [
      { role: 'planner', model: 'frontier-model' },
      { role: 'implementer', model: 'value-model' },
      { role: 'reviewer', model: 'frontier-model' },
    ]);

    const summary = cp.modelRoutingSummary('r-mix');
    assert.equal(summary.frontierTurns, 2);
    assert.equal(summary.valueTurns, 1);
    assert.equal(summary.independentReviewTurns, 1);
    assert.equal(summary.enforcedTurns, 3);
    assert.deepEqual(summary.resolvedModels.sort(), ['frontier_reasoning:frontier-model', 'value_coding:value-model']);
  });
});

test('a proof turn is executed by the Kernel and never handed to a model', async () => {
  await withProject({ 'test:ok': 'node -e "process.exit(0)"' }, async (cp) => {
    const sessions = [];
    await cp.startRun({ runId: 'r-proof', objective: 'proof stays kernel' });
    const turn = await dispatchKernelTurn({
      controlPlane: cp,
      runId: 'r-proof',
      adapter: adapterFor(sessions),
      registry: createModelRegistry({ surface: 'claude', env: ENV }),
      actionContext: { actionKind: 'prove' },
    });
    assert.equal(turn.dispatched, false);
    assert.deepEqual(sessions, []);
    const status = await cp.status('r-proof');
    assert.equal(status.measurement.modelRouting.value.kernelOnlyActions, 1);
    assert.equal(status.measurement.providerModelIdentity.status, 'unavailable');
  });
});
