import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
import { test } from 'node:test';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createKernelControlPlane } from '../scripts/kernel/control-plane.mjs';
import { dispatchKernelTurn } from '../scripts/host/kernel/turn-dispatcher.mjs';
import { createClaudeAdapter } from '../scripts/host/kernel/adapters/claude.mjs';
import { createModelRegistry } from '../scripts/host/kernel/model-registry.mjs';

const childSource = String.raw`
import { readFile, writeFile } from 'node:fs/promises';
import { writeFileSync } from 'node:fs';
import { createKernelControlPlane } from 'CONTROL_PLANE';

const [runtimeHome, projectRoot, payloadFile, resultFile, crashAfterReport] = process.argv.slice(2);
const payload = JSON.parse(await readFile(payloadFile, 'utf8'));
const cp = await createKernelControlPlane({ runtimeHome, projectRoot, holder: 'replay-child-' + process.pid });
if (crashAfterReport === '1') {
  let pendingReportResult = null;
  const finishStepAttempt = cp.stateStore.finishStepAttempt.bind(cp.stateStore);
  const finishStepAttemptWithReportResult = cp.stateStore.finishStepAttemptWithReportResult.bind(cp.stateStore);
  cp.stateStore.finishStepAttemptWithReportResult = (attemptId, finishOptions, reportResult) => {
    pendingReportResult = reportResult;
    return finishStepAttemptWithReportResult(attemptId, finishOptions, reportResult);
  };
  cp.stateStore.finishStepAttempt = (...args) => {
    const settled = finishStepAttempt(...args);
    if (pendingReportResult) {
      // Capture the exact in-memory result, then exit after the canonical
      // settlement UPDATE. The durable result journal must survive this
      // interrupted settlement so restart can replay without new proof.
      writeFileSync(resultFile, JSON.stringify(pendingReportResult));
      process.exit(0);
    }
    return settled;
  };
}
try {
  const result = await cp.report(payload.runId, payload);
  if (crashAfterReport === '1') process.exit(3);
  await writeFile(resultFile, JSON.stringify(result));
  process.stdout.write(JSON.stringify({
    status: result.status,
    idempotentReplay: result.idempotentReplay === true,
    attemptNumber: result.attemptNumber,
  }) + '\n');
} finally {
  await cp.close();
}
`;

const runChild = ({ sourceFile, runtimeHome, projectRoot, payloadFile, resultFile, crashAfterReport = false }) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [sourceFile, runtimeHome, projectRoot, payloadFile, resultFile, crashAfterReport ? '1' : '0'], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  child.on('error', reject);
  child.on('close', (code) => {
    if (code !== 0) {
      if (crashAfterReport && code === 3) {
        reject(new Error('replay child returned without reaching the injected crash window'));
        return;
      }
      reject(new Error(`replay child exited ${code}: ${stderr || stdout}`));
      return;
    }
    if (crashAfterReport && !stdout.trim()) {
      resolve({ crashed: true });
      return;
    }
    try {
      resolve(JSON.parse(stdout.trim().split(/\r?\n/).filter(Boolean).at(-1)));
    } catch (error) {
      reject(new Error(`replay child returned invalid JSON: ${error.message}; stdout=${stdout}; stderr=${stderr}`));
    }
  });
});

test('pre-bound Host Step Attempt owns durable report replay across restart', async () => {
  const runtimeHome = await mkdtemp(path.join(os.tmpdir(), 'kernel-report-replay-home-'));
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'kernel-report-replay-project-'));
  const coordinationRoot = await mkdtemp(path.join(os.tmpdir(), 'kernel-report-replay-coordination-'));
  const childFile = path.join(coordinationRoot, 'replay-child.mjs');
  const payloadFile = path.join(coordinationRoot, 'report.json');
  let cp = null;
  try {
    spawnSync('git', ['init'], { cwd: projectRoot, encoding: 'utf8' });
    await writeFile(path.join(projectRoot, 'package.json'), JSON.stringify({
      name: 'report-replay-fixture',
      scripts: { lint: 'node -e "process.exit(0)"' },
    }));
    await writeFile(path.join(projectRoot, 'app.mjs'), 'export const value = 0;\n');
    let child = childSource;
    child = child.replace('CONTROL_PLANE', pathToFileURL(path.join(process.cwd(), 'scripts/kernel/control-plane.mjs')).href);
    await writeFile(childFile, child);

    cp = await createKernelControlPlane({ runtimeHome, projectRoot, holder: 'parent' });
    const runId = 'canonical-report-replay';
    await cp.startRun({
      runId,
      objective: 'persist the canonical report result',
      taskContract: { acceptance: [], allowedPaths: ['app.mjs'] },
    });
    const adapter = createClaudeAdapter({
      launch: async ({ invocation }) => ({ resolvedModel: invocation.model, sessionId: 'pre-bound-host' }),
    });
    const turn = await dispatchKernelTurn({
      controlPlane: cp,
      runId,
      adapter,
      registry: createModelRegistry({
        surface: 'claude',
        env: { MOON_RELAY_KERNEL_MODEL_FRONTIER: 'frontier', MOON_RELAY_KERNEL_MODEL_VALUE: 'value' },
      }),
      actionContext: { executionMode: 'native-subagent', delegationRequested: true },
    });
    assert.equal(turn.dispatched, true);

    const preBoundAttempt = cp.stateStore.getStepAttempts(runId).at(-1);
    assert.ok(preBoundAttempt?.attemptId, 'Host dispatch must pre-bind a canonical string attemptId');
    assert.notEqual(String(preBoundAttempt.attemptId), String(preBoundAttempt.id), 'legacy numeric row id must not be the canonical attempt id');
    await writeFile(path.join(projectRoot, 'app.mjs'), 'export const value = 1;\n');
    const payload = {
      runId,
      summary: 'persisted canonical report',
      capsuleId: turn.executionCapsule.capsuleId,
      stepId: turn.executionCapsule.stepId,
      attemptId: preBoundAttempt.attemptId,
      changedPaths: ['app.mjs'],
    };
    const expectedCanonicalAttemptCount = cp.stateStore.getStepAttempts(runId).length;
    const expectedLegacyAttemptCount = cp.stateStore.getAttempts(runId).length;
    const expectedVerificationCount = cp.stateStore.getVerifications(runId).length;
    await writeFile(payloadFile, JSON.stringify(payload));
    const firstResultFile = path.join(coordinationRoot, 'first-result.json');
    const replayResultFile = path.join(coordinationRoot, 'replay-result.json');
    await cp.close();
    cp = null;

    const firstChild = await runChild({
      sourceFile: childFile,
      runtimeHome,
      projectRoot,
      payloadFile,
      resultFile: firstResultFile,
      crashAfterReport: true,
    });
    const originalResult = JSON.parse(await readFile(firstResultFile, 'utf8'));
    assert.equal(firstChild.crashed, true);
    assert.equal(originalResult.status, 'completed');
    assert.equal(originalResult.attemptNumber, preBoundAttempt.attemptNumber);

    const recoveryCp = await createKernelControlPlane({ runtimeHome, projectRoot, holder: 'recovery-parent' });
    try {
      assert.equal(recoveryCp.stateStore.getStepAttempts(runId).length, expectedCanonicalAttemptCount);
      assert.equal(recoveryCp.stateStore.getAttempts(runId).length, expectedLegacyAttemptCount + 1);
      assert.equal(recoveryCp.stateStore.getVerifications(runId).length, expectedVerificationCount + 1);
      const stored = recoveryCp.stateStore.getStepAttemptByAttemptId(preBoundAttempt.attemptId, { runId });
      assert.equal(stored.reportDigest?.length > 0, true);
      assert.deepEqual(stored.reportResult, originalResult);

      const replay = await runChild({ sourceFile: childFile, runtimeHome, projectRoot, payloadFile, resultFile: replayResultFile });
      const replayResult = JSON.parse(await readFile(replayResultFile, 'utf8'));
      const { idempotentReplay, ...replayedPublicResult } = replayResult;
      assert.equal(idempotentReplay, true);
      assert.deepEqual(replayedPublicResult, originalResult, 'restart replay must return the exact committed report result');
      assert.deepEqual(recoveryCp.stateStore.getStepAttemptByAttemptId(preBoundAttempt.attemptId, { runId }).reportResult, originalResult);
      assert.equal(recoveryCp.stateStore.getStepAttempts(runId).length, expectedCanonicalAttemptCount, 'replay must not create a new canonical attempt');
      assert.equal(recoveryCp.stateStore.getAttempts(runId).length, expectedLegacyAttemptCount + 1, 'replay must not create a new compatibility attempt');
      assert.equal(recoveryCp.stateStore.getVerifications(runId).length, expectedVerificationCount + 1, 'replay must not execute new proof');
    } finally {
      await recoveryCp.close();
    }
  } finally {
    if (cp) await cp.close();
    await rm(runtimeHome, { recursive: true, force: true });
    await rm(projectRoot, { recursive: true, force: true });
    await rm(coordinationRoot, { recursive: true, force: true });
  }
});
