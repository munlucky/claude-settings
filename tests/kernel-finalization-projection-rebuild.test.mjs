import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp, readFile } from 'node:fs/promises';
import { openKernelStateStore } from '../scripts/kernel/state-store.mjs';
import { prepareFinalization } from '../scripts/kernel/finalization/prepare.mjs';
import { commitFinalizationAuthority } from '../scripts/kernel/finalization/authority-commit.mjs';
import { rebuildKnowledgeProjection } from '../scripts/kernel/knowledge/projection.mjs';

test('rebuildKnowledgeProjection recreates atomic JSONL projection files from SQLite records', async () => {
  const tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'krn-proj-reb-test-'));
  const runtimeHome = path.join(tmpRoot, 'kernel');
  const store = await openKernelStateStore({ runtimeHome, relayHome: path.join(tmpRoot, 'relay') });

  store.createRun({ runId: 'reb-r1', objective: 'rebuild test', sourceIdentity: 'src-reb1', projectId: 'munlucky-moonshot-relay' });
  store.transition('reb-r1', 'SHAPE');
  store.transition('reb-r1', 'EXECUTE');
  store.transition('reb-r1', 'PROVE');

  store.recordVerification('reb-r1', {
    status: 'passed',
    evidenceRef: 'ev-reb1',
    command: 'npm test',
    exitCode: 0,
    evidenceDigest: 'sha256:' + 'b'.repeat(64),
    sourceIdentity: 'src-reb1',
  });

  const snapshot = await prepareFinalization('reb-r1', {
    observations: [
      {
        candidateId: 'cand-reb-1',
        proposedType: 'semantic_fact',
        statement: 'Rebuilt fact line.',
        scope: ['scripts/**'],
        evidenceRefs: ['ev-reb1'],
      },
    ],
  }, { stateStore: store });

  await commitFinalizationAuthority('reb-r1', snapshot, {}, { stateStore: store });

  const res = await rebuildKnowledgeProjection('munlucky-moonshot-relay', { stateStore: store, runtimeHome });

  assert.equal(res.status, 'rebuilt');
  assert.equal(res.count, 1);

  const factsContent = await readFile(path.join(runtimeHome, 'projects', 'munlucky-moonshot-relay', 'knowledge', 'facts.jsonl'), 'utf8');
  assert.match(factsContent, /Rebuilt fact line/);

  store.close();
});
