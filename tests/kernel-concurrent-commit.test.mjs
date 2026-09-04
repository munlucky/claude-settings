import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { spawnSync, spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { createKernelControlPlane } from '../scripts/kernel/control-plane.mjs';

const setup = async () => {
  const runtimeHome = await mkdtemp(path.join(os.tmpdir(), 'krn-conc-commit-home-'));
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'krn-conc-commit-proj-'));
  spawnSync('git', ['init', '-b', 'main'], { cwd: projectRoot, encoding: 'utf8' });
  spawnSync('git', ['config', 'user.name', 'Kernel Test'], { cwd: projectRoot, encoding: 'utf8' });
  spawnSync('git', ['config', 'user.email', 'test@example.com'], { cwd: projectRoot, encoding: 'utf8' });
  await mkdir(path.join(projectRoot, '.moon-relay'), { recursive: true });
  await writeFile(path.join(projectRoot, '.moon-relay', 'track.yaml'), 'track: kernel\nproduct: moon-relay-kernel\n');
  await writeFile(path.join(projectRoot, 'package.json'), JSON.stringify({
    name: 'concurrent-commit-test',
    version: '0.0.1',
    scripts: { test: 'node -e "process.exit(0)"' },
  }));
  await writeFile(path.join(projectRoot, 'app.mjs'), 'export const active = true;\n');
  spawnSync('git', ['add', '.'], { cwd: projectRoot, encoding: 'utf8' });
  spawnSync('git', ['commit', '-m', 'Initial commit'], { cwd: projectRoot, encoding: 'utf8' });

  // Create two distinct git worktrees in the same repository
  const worktreeA = path.join(projectRoot, 'wt-a');
  spawnSync('git', ['worktree', 'add', worktreeA, '-b', 'branch-a'], { cwd: projectRoot, encoding: 'utf8' });
  const worktreeB = path.join(projectRoot, 'wt-b');
  spawnSync('git', ['worktree', 'add', worktreeB, '-b', 'branch-b'], { cwd: projectRoot, encoding: 'utf8' });

  return { runtimeHome, projectRoot, worktreeA, worktreeB };
};

const cleanup = async ({ runtimeHome, projectRoot }) => {
  await new Promise((resolve) => setTimeout(resolve, 100));
  await rm(runtimeHome, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }).catch(() => {});
  await rm(projectRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }).catch(() => {});
};

test('Concurrent Commit: Two concurrent sessions serialize OCC knowledge commit cleanly without blocking code delivery', async () => {
  const fixture = await setup();
  const cpA = await createKernelControlPlane({
    runtimeHome: fixture.runtimeHome,
    projectRoot: fixture.worktreeA,
    env: {
      ...process.env,
      MOON_RELAY_KERNEL_SESSION_ID: 'codex:session-concurrent-A',
      MOON_RELAY_KERNEL_PROVIDER: 'codex',
    },
  });

  const cpB = await createKernelControlPlane({
    runtimeHome: fixture.runtimeHome,
    projectRoot: fixture.worktreeB,
    env: {
      ...process.env,
      MOON_RELAY_KERNEL_SESSION_ID: 'codex:session-concurrent-B',
      MOON_RELAY_KERNEL_PROVIDER: 'codex',
    },
  });

  try {
    const runIdA = 'r-concurrent-session-A';
    const runIdB = 'r-concurrent-session-B';

    // Start both runs concurrently in separate sessions
    await cpA.startRun({
      runId: runIdA,
      objective: 'concurrent feature A',
      taskContract: {
        riskTier: 'T0',
        acceptance: [{
          acceptance: 'unit works A',
          evidencePlan: { class: 'hard', method: 'unit-test', commandRefs: ['test'], obligationId: 'default' },
        }],
        allowedPaths: ['app.mjs'],
      },
    });

    await cpB.startRun({
      runId: runIdB,
      objective: 'concurrent feature B',
      taskContract: {
        riskTier: 'T0',
        acceptance: [{
          acceptance: 'unit works B',
          evidencePlan: { class: 'hard', method: 'unit-test', commandRefs: ['test'], obligationId: 'default' },
        }],
        allowedPaths: ['app.mjs'],
      },
    });

    // Advance Run A through EXECUTE -> PROVE -> CLOSE
    await cpA.transition(runIdA, 'EXECUTE');
    await cpA.transition(runIdA, 'PROVE');
    await cpA.recordProof(runIdA, {
      obligationId: 'default',
      status: 'passed',
      evidenceRef: 'ev-proof-A',
      commandRef: 'test',
      command: 'node -e "process.exit(0)"',
      exitCode: 0,
      evidenceDigest: `sha256:${'a'.repeat(64)}`,
      acceptanceCoverage: ['unit works A'],
    });
    await cpA.transition(runIdA, 'CLOSE');

    // Advance Run B through EXECUTE -> PROVE -> CLOSE
    await cpB.transition(runIdB, 'EXECUTE');
    await cpB.transition(runIdB, 'PROVE');
    await cpB.recordProof(runIdB, {
      obligationId: 'default',
      status: 'passed',
      evidenceRef: 'ev-proof-B',
      commandRef: 'test',
      command: 'node -e "process.exit(0)"',
      exitCode: 0,
      evidenceDigest: `sha256:${'b'.repeat(64)}`,
      acceptanceCoverage: ['unit works B'],
    });
    await cpB.transition(runIdB, 'CLOSE');

    // Simulate accepted completion decisions
    const store = cpA.stateStore;
    const runA = store.getRun(runIdA);
    const runB = store.getRun(runIdB);
    const projectId = runA.projectId;

    store.recordCompletionDecision(runIdA, {
      decision: 'accepted',
      sourceIdentity: runA.sourceIdentity,
      mutationRevision: runA.mutationRevision,
      evidenceDigest: `sha256:${'a'.repeat(64)}`,
      decisionJson: { decision: 'accepted' },
    });

    store.recordCompletionDecision(runIdB, {
      decision: 'accepted',
      sourceIdentity: runB.sourceIdentity,
      mutationRevision: runB.mutationRevision,
      evidenceDigest: `sha256:${'b'.repeat(64)}`,
      decisionJson: { decision: 'accepted' },
    });

    // Finalize Run A and Run B concurrently via Promise.all:
    // Both start at revision 1. One wins CAS on attempt 1 (bumping revision to 2).
    // The other encounters revision conflict on attempt 1, reloads revision 2, and commits on attempt 2!
    const [receiptA, receiptB] = await Promise.all([
      cpA.finalizeRun(runIdA, {
        knowledgeObservations: [
          { proposedType: 'semantic_fact', statement: 'knowledge observation from run A' },
        ],
      }),
      cpB.finalizeRun(runIdB, {
        knowledgeObservations: [
          { proposedType: 'semantic_fact', statement: 'knowledge observation from run B' },
        ],
      }),
    ]);

    assert.equal(receiptA.completionStatus, 'accepted');
    assert.equal(receiptA.knowledgeStatus, 'committed');
    assert.equal(receiptB.completionStatus, 'accepted');
    assert.equal(receiptB.knowledgeStatus, 'committed');

    const totalAttempts = receiptA.knowledgeCommitAttempts + receiptB.knowledgeCommitAttempts;
    assert.equal(totalAttempts, 3, 'One run must succeed on attempt 1, and the overlapping run on attempt 2 after CAS reload');
    assert.equal(store.getProjectKnowledgeRevision(projectId), 3, 'Revision should be 3 after both concurrent commits');
  } finally {
    await cpA.close();
    await cpB.close();
    await cleanup(fixture);
  }
});

test('Concurrent Commit: Cross-process lock contention serializes cleanly via child processes without IDENTITY_MIGRATION_LOCKED', async () => {
  const fixture = await setup();
  try {
    const storeModule = path.resolve('scripts/kernel/knowledge/store.mjs').replaceAll('\\', '/');
    const workerScript = `
import { ensureKnowledgeStoreDirectories } from 'file:///${storeModule}';
const projectId = process.argv[2];
const runtimeHome = process.argv[3];
for (let i = 0; i < 5; i++) {
  await ensureKnowledgeStoreDirectories(projectId, { env: { MOON_RELAY_KERNEL_HOME: runtimeHome } });
  await new Promise((r) => setTimeout(r, 10));
}
process.exit(0);
`;
    const workerPath = path.join(fixture.runtimeHome, 'worker.mjs');
    await writeFile(workerPath, workerScript);

    const cp1 = spawn(process.execPath, [workerPath, 'proj-cross-proc', fixture.runtimeHome], { stdio: 'pipe' });
    const cp2 = spawn(process.execPath, [workerPath, 'proj-cross-proc', fixture.runtimeHome], { stdio: 'pipe' });

    const [res1, res2] = await Promise.all([
      new Promise((resolve) => {
        let err = '';
        cp1.stderr.on('data', (d) => { err += d; });
        cp1.on('close', (code) => resolve({ code, err }));
      }),
      new Promise((resolve) => {
        let err = '';
        cp2.stderr.on('data', (d) => { err += d; });
        cp2.on('close', (code) => resolve({ code, err }));
      }),
    ]);

    assert.equal(res1.code, 0, `Child process 1 failed with: ${res1.err}`);
    assert.equal(res2.code, 0, `Child process 2 failed with: ${res2.err}`);
  } finally {
    await cleanup(fixture);
  }
});

