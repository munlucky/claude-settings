import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createKernelControlPlane } from '../scripts/kernel/control-plane.mjs';
import { resolveBoundInvocation } from '../scripts/kernel/run/invocation-resolver.mjs';
import { openKernelStateStore } from '../scripts/kernel/state-store.mjs';
import { normalizeTaskContract } from '../scripts/kernel/task/task-contract.mjs';

const kernelCli = path.join(process.cwd(), 'bin', 'moon-relay-kernel.mjs');
const parseCliJson = (result) => {
  const line = `${result.stdout}\n${result.stderr}`.split(/\r?\n/).find((entry) => entry.trim().startsWith('{'));
  assert.ok(line, result.stderr || result.stdout);
  return JSON.parse(line);
};

test('contract-first invocation resolver deterministically selects every lifecycle mode', () => {
  const projectId = 'resolver-project';
  const sessionId = 'codex:resolver-session';
  const workspaceId = 'resolver-workspace';
  const contractA = normalizeTaskContract({
    objective: 'contract A',
    acceptance: ['A is complete'],
  }, { objective: 'contract A' });
  const contractB = {
    objective: 'contract B',
    acceptance: ['B is complete'],
  };
  let binding = null;
  let run = null;
  const stateStore = {
    getActiveOwnerBinding: () => binding,
    getRun: (runId) => run?.runId === runId ? run : null,
    getProjectWorkspace: (candidateWorkspaceId) => candidateWorkspaceId === 'workspace-next'
      ? { workspaceId: candidateWorkspaceId, projectId }
      : null,
  };
  const resolve = (taskContract = null, extra = {}) => resolveBoundInvocation({
    stateStore,
    projectId,
    provider: 'codex',
    sessionId,
    workspaceId,
    taskContract,
    ...extra,
  });

  assert.equal(resolve(contractA).mode, 'create');

  binding = {
    bindingId: 'binding-a',
    runId: 'run-a',
    projectId,
    sessionId,
    workspaceId,
  };
  run = {
    runId: 'run-a',
    projectId,
    workspaceId,
    status: 'active',
    finalizationStatus: 'pending',
    taskContract: contractA,
  };
  assert.equal(resolve(contractA).mode, 'resume');
  assert.equal(resolve(contractB).mode, 'revise');

  run = { ...run, status: 'completed', finalizationStatus: 'partial' };
  assert.equal(resolve(contractB).mode, 'finalization-retry');

  run = { ...run, finalizationStatus: 'completed' };
  assert.equal(resolve().mode, 'done');
  assert.equal(resolve(contractA).mode, 'done');
  const successor = resolve(contractB);
  assert.equal(successor.mode, 'successor');
  assert.equal(successor.predecessorRunId, 'run-a');
  assert.match(successor.runId, /^run-[0-9a-f-]{36}$/i);
  assert.equal(resolve(contractB, { workspaceId: 'workspace-next' }).mode, 'successor');
});

test('contract-first invocation resolver fails closed on explicit, provider, and workspace mismatches', () => {
  const stateStore = {
    getActiveOwnerBinding: () => ({
      bindingId: 'binding-a',
      runId: 'run-a',
      projectId: 'resolver-project',
      sessionId: 'codex:resolver-session',
      workspaceId: 'resolver-workspace',
    }),
    getRun: () => ({
      runId: 'run-a',
      projectId: 'resolver-project',
      workspaceId: 'resolver-workspace',
      status: 'active',
      finalizationStatus: 'pending',
      taskContract: null,
    }),
  };
  const base = {
    stateStore,
    projectId: 'resolver-project',
    provider: 'codex',
    sessionId: 'codex:resolver-session',
    workspaceId: 'resolver-workspace',
  };
  assert.throws(
    () => resolveBoundInvocation({ ...base, explicitRunId: 'run-other' }),
    (error) => error.code === 'run_session_mismatch',
  );
  assert.throws(
    () => resolveBoundInvocation({ ...base, provider: 'claude' }),
    (error) => error.code === 'provider_session_invalid',
  );
  assert.throws(
    () => resolveBoundInvocation({ ...base, workspaceId: 'workspace-other' }),
    (error) => error.code === 'run_workspace_mismatch',
  );
});

const makeProject = async (prefix) => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), `${prefix}-project-`));
  const runtimeHome = await mkdtemp(path.join(os.tmpdir(), `${prefix}-state-`));
  await mkdir(path.join(projectRoot, '.moon-relay'), { recursive: true });
  await writeFile(
    path.join(projectRoot, '.moon-relay', 'track.yaml'),
    'schemaVersion: 1\ntrack: kernel\nproduct: moon-relay-kernel\n',
  );
  await writeFile(
    path.join(projectRoot, '.moon-relay', 'project.identity.yaml'),
    `projectId: ${prefix}\n`,
  );
  await writeFile(path.join(projectRoot, 'package.json'), JSON.stringify({
    name: prefix,
    version: '0.0.1',
    scripts: { test: 'node -e "process.exit(0)"' },
  }));
  return { projectRoot, runtimeHome };
};

const startOwnedRun = async ({ projectRoot, runtimeHome, sessionId, runId, objective }) => {
  const cp = await createKernelControlPlane({
    runtimeHome,
    projectRoot,
    requireHostBinding: true,
    env: {
      MOON_RELAY_KERNEL_SESSION_ID: sessionId,
      MOON_RELAY_KERNEL_PROVIDER: 'codex',
      MOON_RELAY_KERNEL_RUN_ID: runId,
    },
  });
  try {
    await cp.ensureRun({
      runId,
      objective,
      taskContract: { objective, acceptance: [`${objective} is complete`] },
    });
  } finally {
    await cp.close();
  }
};

const markTerminal = async ({ runtimeHome, runId, finalizationStatus }) => {
  const store = await openKernelStateStore({ runtimeHome });
  try {
    const run = store.getRun(runId);
    store.persistCompletionDecision(runId, {
      decision: 'accepted',
      digest: `sha256:${'a'.repeat(64)}`,
      run,
      decisionPayload: { decision: 'accepted' },
    });
    store.setFinalizationStatus(runId, finalizationStatus);
  } finally {
    store.close();
  }
};

const invokeNext = ({ projectRoot, runtimeHome, sessionId, contractPath }) =>
  spawnSync(process.execPath, [
    kernelCli,
    'next',
    '--contract-json',
    contractPath,
    '--session-id',
    sessionId,
    '--project-root',
    projectRoot,
    '--runtime-home',
    runtimeHome,
    '--json',
  ], {
    cwd: projectRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      MOON_RELAY_KERNEL_REEXEC: '1',
      MOON_RELAY_KERNEL_RUN_ID: '',
      MOON_RELAY_KERNEL_SESSION_ID: '',
      MOON_RELAY_KERNEL_PROJECT_ID: '',
      MOON_RELAY_KERNEL_WORKSPACE_ID: '',
      CODEX_THREAD_ID: '',
    },
  });

const successorAfterCompletedFinalization = async () => {
  const fixture = await makeProject('kernel-session-successor');
  const sessionId = 'codex:thread-a';
  const predecessorRunId = 'codex-thread-a';
  const contractPath = path.join(fixture.projectRoot, 'contract-b.json');
  try {
    await startOwnedRun({
      ...fixture,
      sessionId,
      runId: predecessorRunId,
      objective: 'contract A',
    });
    await markTerminal({
      runtimeHome: fixture.runtimeHome,
      runId: predecessorRunId,
      finalizationStatus: 'completed',
    });
    await writeFile(contractPath, JSON.stringify({
      objective: 'contract B',
      acceptance: ['contract B has an independent Run'],
    }));

    const result = invokeNext({ ...fixture, sessionId, contractPath });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout);
    assert.match(payload.runId, /^run-[0-9a-f-]{36}$/i);
    assert.notEqual(payload.runId, predecessorRunId);

    const store = await openKernelStateStore({ runtimeHome: fixture.runtimeHome });
    try {
      const predecessor = store.getRun(predecessorRunId);
      assert.equal(predecessor.status, 'completed');
      assert.equal(predecessor.objective, 'contract A');
      assert.equal(predecessor.finalizationStatus, 'completed');
      assert.equal(
        store.getActiveOwnerBinding({ projectId: predecessor.projectId, sessionId }).runId,
        payload.runId,
      );
      assert.equal(
        store.getActiveRunBinding({ projectId: predecessor.projectId, sessionId, runId: predecessorRunId }),
        null,
      );
    } finally {
      store.close();
    }
  } finally {
    await rm(fixture.projectRoot, { recursive: true, force: true });
    await rm(fixture.runtimeHome, { recursive: true, force: true });
  }
};
test('a new contract after completed finalization creates an opaque successor and preserves its predecessor', successorAfterCompletedFinalization);

const incompleteFinalizationBlocksSuccessor = async () => {
  const fixture = await makeProject('kernel-session-finalization');
  const sessionId = 'codex:thread-partial';
  const predecessorRunId = 'codex-thread-partial';
  const contractPath = path.join(fixture.projectRoot, 'contract-b.json');
  try {
    await startOwnedRun({
      ...fixture,
      sessionId,
      runId: predecessorRunId,
      objective: 'contract A',
    });
    await markTerminal({
      runtimeHome: fixture.runtimeHome,
      runId: predecessorRunId,
      finalizationStatus: 'partial',
    });
    await writeFile(contractPath, JSON.stringify({
      objective: 'contract B',
      acceptance: ['contract B waits for predecessor finalization'],
    }));

    const result = invokeNext({ ...fixture, sessionId, contractPath });

    assert.notEqual(result.status, 0);
    const payload = parseCliJson(result);
    assert.equal(payload.errorCode, 'finalization_incomplete');
    assert.equal(payload.nextAction, 'retry-finalization');
    assert.equal(payload.runId, predecessorRunId);
  } finally {
    await rm(fixture.projectRoot, { recursive: true, force: true });
    await rm(fixture.runtimeHome, { recursive: true, force: true });
  }
};
test('a completed Run with incomplete finalization blocks successor creation with a stable recovery action', incompleteFinalizationBlocksSuccessor);
