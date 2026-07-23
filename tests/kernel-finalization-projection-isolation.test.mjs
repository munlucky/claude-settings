import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { openKernelStateStore } from '../scripts/kernel/state-store.mjs';
import { prepareFinalization } from '../scripts/kernel/finalization/prepare.mjs';
import { commitFinalizationAuthority } from '../scripts/kernel/finalization/authority-commit.mjs';
import { rebuildKnowledgeProjection } from '../scripts/kernel/knowledge/projection.mjs';

test('tampering with JSONL file does not alter SQLite authority records', async () => {
  const tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'krn-proj-iso-test-'));
  const runtimeHome = path.join(tmpRoot, 'kernel');
  const store = await openKernelStateStore({ runtimeHome, relayHome: path.join(tmpRoot, 'relay') });

  store.createRun({ runId: 'iso-r1', objective: 'isolation test', sourceIdentity: 'src-iso1', projectId: 'munlucky-moonshot-relay' });
  store.transition('iso-r1', 'SHAPE');
  store.transition('iso-r1', 'EXECUTE');
  store.transition('iso-r1', 'PROVE');

  store.recordVerification('iso-r1', {
    status: 'passed',
    evidenceRef: 'ev-iso1',
    command: 'npm test',
    exitCode: 0,
    evidenceDigest: 'sha256:' + 'c'.repeat(64),
    sourceIdentity: 'src-iso1',
  });

  const snapshot = await prepareFinalization('iso-r1', {
    observations: [
      {
        candidateId: 'cand-iso-1',
        proposedType: 'semantic_fact',
        statement: 'Authoritative SQLite record.',
        scope: ['scripts/**'],
        evidenceRefs: ['ev-iso1'],
      },
    ],
  }, { stateStore: store });

  await commitFinalizationAuthority('iso-r1', snapshot, {}, { stateStore: store });
  await rebuildKnowledgeProjection('munlucky-moonshot-relay', { stateStore: store, runtimeHome });

  // Tamper with projected JSONL file
  const factsPath = path.join(runtimeHome, 'projects', 'munlucky-moonshot-relay', 'knowledge', 'facts.jsonl');
  await writeFile(factsPath, JSON.stringify({ statement: 'TAMPERED FACT' }) + '\n', 'utf8');

  // Verify SQLite authority remains untampered
  const dbRecords = store.listKnowledgeRecords({ projectId: 'munlucky-moonshot-relay', statuses: ['committed'] });
  assert.equal(dbRecords[0].statement, 'Authoritative SQLite record.');

  // Rebuilding projection overwrites tampered file
  await rebuildKnowledgeProjection('munlucky-moonshot-relay', { stateStore: store, runtimeHome });
  const restoredContent = await readFile(factsPath, 'utf8');
  assert.match(restoredContent, /Authoritative SQLite record\./);

  store.close();
});
