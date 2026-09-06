import { test } from 'node:test';
import assert from 'node:assert/strict';
import { access, appendFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createKernelControlPlane } from '../scripts/kernel/control-plane.mjs';
import { dispatchKernelTurn } from '../scripts/host/kernel/turn-dispatcher.mjs';
import { createClaudeAdapter } from '../scripts/host/kernel/adapters/claude.mjs';
import { createModelRegistry } from '../scripts/host/kernel/model-registry.mjs';

const CHILD_READY_TIMEOUT_MS = 8000;
const CHILD_RUN_TIMEOUT_MS = 10000;

const childSource = String.raw`
import { access, appendFile, writeFile } from 'node:fs/promises';
import { createKernelControlPlane } from 'CONTROL_PLANE';
import { dispatchKernelTurn } from 'DISPATCHER';
import { createClaudeAdapter } from 'CLAUDE';
import { createModelRegistry } from 'REGISTRY';

const [runtimeHome, projectRoot, runId, marker, ready, start] = process.argv.slice(2);
const waitForFile = async (file, timeoutMs) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await access(file);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  throw new Error('child synchronization timeout: ' + file);
};

let cp = null;
let output;
try {
  cp = await createKernelControlPlane({ runtimeHome, projectRoot, holder: 'child-' + process.pid });
  await writeFile(ready, JSON.stringify({ pid: process.pid }));
  await waitForFile(start, 8000);
  const adapter = createClaudeAdapter({
    launch: async ({ invocation }) => {
      await appendFile(marker, String(process.pid) + '\n');
      return {
        resolvedModel: invocation.model,
        observedModel: invocation.model,
        resolvedEffort: invocation.effort,
        observedEffort: invocation.effort,
        sessionId: 'reviewer-' + process.pid,
        outcome: { verdict: 'pass', findings: [], risks: [], evidenceRefs: ['review://child'] },
      };
    },
  });
  const result = await dispatchKernelTurn({
    controlPlane: cp,
    runId,
    adapter,
    registry: createModelRegistry({
      surface: 'claude',
      env: { MOON_RELAY_KERNEL_MODEL_FRONTIER: 'configured-frontier', MOON_RELAY_KERNEL_MODEL_VALUE: 'configured-value' },
    }),
    actionContext: {
      actionKind: 'review_engineering',
      obligationId: 'security-review',
      executionMode: 'native-subagent',
      delegationRequested: true,
      changedPaths: ['app.mjs'],
    },
  });
  output = {
    pid: process.pid,
    status: result.status || null,
    dispatched: result.dispatched === true,
    receipt: Boolean(result.receipt),
    reviewReceiptId: result.reviewReceiptId || null,
    reviewStatus: result.review?.status || null,
    reason: result.reason || null,
    dispatchStatus: result.dispatch?.status || null,
  };
} catch (error) {
  output = {
    pid: process.pid,
    status: 'child-error',
    errorCode: error?.code || null,
    error: String(error?.message || error),
  };
  process.exitCode = 1;
} finally {
  if (cp) await cp.close().catch(() => {});
}
process.stdout.write(JSON.stringify(output) + '\n');
`;

const withTimeout = async (promise, timeoutMs, message) => {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), timeoutMs); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
};

const waitForFile = async (file, timeoutMs, message) => withTimeout(
  (async () => {
    while (true) {
      try {
        await access(file);
        return;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    }
  })(),
  timeoutMs,
  message,
);

const terminateChildren = async (children) => {
  for (const child of children) {
    if (child.exitCode === null && !child.killed) child.kill();
  }
  await Promise.allSettled(children.map((child) => new Promise((resolve) => {
    if (child.exitCode !== null) {
      resolve();
      return;
    }
    child.once('close', resolve);
  })));
};

const prepareReviewRun = async ({ root, runtimeHome, runId }) => {
  await mkdir(path.join(root, '.moon-relay'), { recursive: true });
  await writeFile(path.join(root, '.moon-relay', 'track.yaml'), 'track: kernel\n');
  await writeFile(path.join(root, 'package.json'), JSON.stringify({ scripts: { test: 'node --test', lint: 'node -e "process.exit(0)"' } }));
  await writeFile(path.join(root, 'app.mjs'), 'export const value = 0;\n');
  const cp = await createKernelControlPlane({ runtimeHome, projectRoot: root, holder: 'parent' });
  await cp.startRun({
    runId,
    objective: 'secure change',
    taskContract: {
      surfaces: ['security_boundary'],
      acceptance: ['secure'],
      allowedPaths: ['app.mjs'],
    },
  });
  const implementer = createClaudeAdapter({
    launch: async ({ invocation }) => ({
      resolvedModel: invocation.model,
      observedModel: invocation.model,
      resolvedEffort: invocation.effort,
      observedEffort: invocation.effort,
      sessionId: `${runId}-implementer`,
    }),
  });
  const implementation = await dispatchKernelTurn({
    controlPlane: cp,
    runId,
    adapter: implementer,
    registry: createModelRegistry({
      surface: 'claude',
      env: { MOON_RELAY_KERNEL_MODEL_FRONTIER: 'configured-frontier', MOON_RELAY_KERNEL_MODEL_VALUE: 'configured-value' },
    }),
    actionContext: { executionMode: 'native-subagent', delegationRequested: true },
  });
  assert.equal(implementation.dispatched, true, JSON.stringify(implementation));
  await writeFile(path.join(root, 'app.mjs'), 'export const value = 1;\n');
  await cp.report(runId, {
    summary: 'implemented',
    capsuleId: implementation.executionCapsule.capsuleId,
    stepId: implementation.executionCapsule.stepId,
    changedPaths: ['app.mjs'],
  });
  await cp.transition(runId, 'EXECUTE');
  await cp.transition(runId, 'PROVE');
  return cp;
};

const writeChildSource = async (file) => {
  const replacements = [
    ['CONTROL_PLANE', pathToFileURL(path.join(process.cwd(), 'scripts/kernel/control-plane.mjs')).href],
    ['DISPATCHER', pathToFileURL(path.join(process.cwd(), 'scripts/host/kernel/turn-dispatcher.mjs')).href],
    ['CLAUDE', pathToFileURL(path.join(process.cwd(), 'scripts/host/kernel/adapters/claude.mjs')).href],
    ['REGISTRY', pathToFileURL(path.join(process.cwd(), 'scripts/host/kernel/model-registry.mjs')).href],
  ];
  let source = childSource;
  for (const [token, value] of replacements) source = source.replace(token, value);
  await writeFile(file, source);
};

const spawnChild = ({ name, child, runtimeHome, root, runId, marker, ready, start, children }) => new Promise((resolve, reject) => {
  const processChild = spawn(process.execPath, [child, runtimeHome, root, runId, marker, ready, start], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push(processChild);
  let stdout = '';
  let stderr = '';
  processChild.stdout.on('data', (chunk) => { stdout += chunk; });
  processChild.stderr.on('data', (chunk) => { stderr += chunk; });
  processChild.on('error', reject);
  processChild.on('close', (code) => {
    if (code !== 0) {
      reject(new Error(`${name} exited ${code}: ${stderr || stdout}`));
      return;
    }
    try {
      const lines = stdout.trim().split(/\r?\n/).filter(Boolean);
      resolve(JSON.parse(lines.at(-1)));
    } catch (error) {
      reject(new Error(`${name} returned invalid JSON: ${error.message}; stdout=${stdout}; stderr=${stderr}`));
    }
  });
});

test('durable review claim converges real adapter dispatch across independent child processes', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'kernel-review-cross-process-'));
  const runtimeHome = await mkdtemp(path.join(os.tmpdir(), 'kernel-review-cross-process-state-'));
  // Coordination files live outside projectRoot. The workspace identity is part
  // of the review subject, so a ready/start marker inside the project would be
  // observed as a mutation between PROVE and reviewer ingestion.
  const coordinationRoot = await mkdtemp(path.join(os.tmpdir(), 'kernel-review-cross-process-coordination-'));
  const marker = path.join(coordinationRoot, 'dispatches.log');
  const start = path.join(coordinationRoot, 'start');
  const child = path.join(root, 'child.mjs');
  const ready = [path.join(coordinationRoot, 'ready-a'), path.join(coordinationRoot, 'ready-b')];
  const children = [];
  let cp = null;
  try {
    await writeChildSource(child);
    cp = await prepareReviewRun({ root, runtimeHome, runId: 'cross-process-review' });
    const childRuns = ready.map((readyPath, index) => spawnChild({
      name: index === 0 ? 'a' : 'b',
      child,
      runtimeHome,
      root,
      runId: 'cross-process-review',
      marker,
      ready: readyPath,
      start,
      children,
    }));
    await withTimeout(Promise.all(ready.map((file) => waitForFile(file, CHILD_READY_TIMEOUT_MS, 'child ready timeout'))), CHILD_READY_TIMEOUT_MS, 'children did not become ready');
    await writeFile(start, 'go');
    const results = await withTimeout(Promise.all(childRuns), CHILD_RUN_TIMEOUT_MS, 'cross-process review timeout');

    const markers = (await readFile(marker, 'utf8').catch(() => '')).trim().split(/\r?\n/).filter(Boolean);
    assert.equal(markers.length, 1, `marker=${markers.length} results=${JSON.stringify(results)}`);
    assert.equal(cp.listReviewReceipts('cross-process-review').length, 1, JSON.stringify(results));

    const winners = results.filter((result) => result.dispatched === true && result.receipt === true && result.reviewReceiptId);
    assert.equal(winners.length, 1, JSON.stringify(results));
    const losers = results.filter((result) => result.status === 'review-in-progress'
      && ['review-already-claimed', 'review-already-recorded', 'deduplicated'].includes(result.reason));
    assert.equal(losers.length, 1, JSON.stringify(results));
  } finally {
    await terminateChildren(children);
    if (cp) await cp.close();
    await rm(root, { recursive: true, force: true });
    await rm(runtimeHome, { recursive: true, force: true });
    await rm(coordinationRoot, { recursive: true, force: true });
  }
});

test('owner-session attempts cannot satisfy the durable reviewer claim candidate query', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'kernel-review-owner-claim-'));
  const runtimeHome = await mkdtemp(path.join(os.tmpdir(), 'kernel-review-owner-claim-state-'));
  await mkdir(path.join(root, '.moon-relay'), { recursive: true });
  await writeFile(path.join(root, '.moon-relay', 'track.yaml'), 'track: kernel\n');
  const cp = await createKernelControlPlane({ runtimeHome, projectRoot: root, holder: 'parent' });
  try {
    const runId = 'owner-session-review-claim';
    await cp.startRun({ runId, objective: 'review', taskContract: { acceptance: ['review'] } });
    const step = cp.stateStore.getRunSteps(runId)[0];
    cp.stateStore.recordStepAttempt(runId, {
      stepId: step.stepId,
      attemptId: `attempt-${'a'.repeat(16)}`,
      provenanceKind: 'owner-session',
      planRevision: 1,
      mutationRevision: 0,
    });
    const claim = cp.stateStore.claimReviewAttempt({
      runId,
      stepId: step.stepId,
      claimKey: `${runId}|0|security-review`,
      holder: 'parent',
      expiresAt: new Date(Date.now() + 60000).toISOString(),
      role: 'reviewer',
      actionKind: 'review_engineering',
      obligationId: 'security-review',
      planRevision: 1,
      mutationRevision: 0,
    });
    assert.equal(claim.claimed, false);
    assert.equal(claim.reason, 'no-review-attempt');
  } finally {
    await cp.close();
    await rm(root, { recursive: true, force: true });
    await rm(runtimeHome, { recursive: true, force: true });
  }
});
