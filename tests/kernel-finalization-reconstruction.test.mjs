import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp, rm, access } from 'node:fs/promises';
import { openKernelStateStore } from '../scripts/kernel/state-store.mjs';
import { prepareFinalization } from '../scripts/kernel/finalization/prepare.mjs';
import { commitFinalizationAuthority } from '../scripts/kernel/finalization/authority-commit.mjs';
import { rebuildKnowledgeProjection } from '../scripts/kernel/knowledge/projection.mjs';

test('reconstruction restores deleted projection folder completely from SQLite', async () => {
  const tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'krn-rec-test-'));
  const runtimeHome = path.join(tmpRoot, 'kernel');
  const store = await openKernelStateStore({ runtimeHome, relayHome: path.join(tmpRoot, 'relay') });

  store.createRun({ runId: 'rec-r1', objective: 'reconstruction test', sourceIdentity: 'src-rec1', projectId: 'munlucky-moonshot-relay' });
  store.transition('rec-r1', 'SHAPE');
  store.transition('rec-r1', 'EXECUTE');
  store.transition('rec-r1', 'PROVE');

  store.recordVerification('rec-r1', {
    status: 'passed',
    evidenceRef: 'ev-rec1',
    command: 'npm test',
    exitCode: 0,
    evidenceDigest: 'sha256:' + 'd'.repeat(64),
    sourceIdentity: 'src-rec1',
  });

  const snapshot = await prepareFinalization('rec-r1', {
    observations: [
      {
        candidateId: 'cand-rec-1',
        proposedType: 'semantic_fact',
        statement: 'Record for full reconstruction.',
        scope: ['scripts/**'],
        evidenceRefs: ['ev-rec1'],
      },
    ],
  }, { stateStore: store });

  await commitFinalizationAuthority('rec-r1', snapshot, {}, { stateStore: store });

  const projDir = path.join(runtimeHome, 'projects', 'munlucky-moonshot-relay', 'knowledge');

  // Build projection then delete folder completely
  await rebuildKnowledgeProjection('munlucky-moonshot-relay', { stateStore: store, runtimeHome });
  await rm(projDir, { recursive: true, force: true });

  // Re-run rebuild projection
  await rebuildKnowledgeProjection('munlucky-moonshot-relay', { stateStore: store, runtimeHome });

  // Verify projection folder and files are restored
  await assert.doesNotReject(async () => {
    await access(path.join(projDir, 'facts.jsonl'));
    await access(path.join(projDir, 'revision.json'));
  });

  store.close();
});
