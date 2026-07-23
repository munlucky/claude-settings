import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp, readFile } from 'node:fs/promises';
import { openKernelStateStore } from '../scripts/kernel/state-store.mjs';
import { prepareFinalization } from '../scripts/kernel/finalization/prepare.mjs';
import { commitFinalizationAuthority } from '../scripts/kernel/finalization/authority-commit.mjs';
import { rebuildKnowledgeProjection } from '../scripts/kernel/knowledge/projection.mjs';

test('MG-04 Projection Parity: typed knowledge projection layout matches SQLite committed records', async () => {
  const tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'krn-proj-par-'));
  const runtimeHome = path.join(tmpRoot, 'kernel');
  const store = await openKernelStateStore({ runtimeHome, relayHome: path.join(tmpRoot, 'relay') });

  store.createRun({ runId: 'par-r1', objective: 'projection parity test', sourceIdentity: 'src-par1', projectId: 'munlucky-moonshot-relay' });
  store.transition('par-r1', 'SHAPE');
  store.transition('par-r1', 'EXECUTE');
  store.transition('par-r1', 'PROVE');

  store.recordVerification('par-r1', {
    status: 'passed',
    evidenceRef: 'ev-par1',
    command: 'npm test',
    exitCode: 0,
    evidenceDigest: 'sha256:' + '6'.repeat(64),
    sourceIdentity: 'src-par1',
  });

  const snapshot = await prepareFinalization('par-r1', {
    observations: [
      {
        candidateId: 'cand-par-1',
        proposedType: 'architecture_decision',
        statement: 'Architecture decision statement.',
        scope: ['scripts/**'],
        evidenceRefs: ['ev-par1'],
      },
      {
        candidateId: 'cand-par-2',
        proposedType: 'domain_term',
        statement: 'Domain term definition.',
        scope: ['docs/**'],
        evidenceRefs: ['ev-par1'],
      },
    ],
  }, { stateStore: store });

  await commitFinalizationAuthority('par-r1', snapshot, {}, { stateStore: store });

  const projRes = await rebuildKnowledgeProjection('munlucky-moonshot-relay', { stateStore: store, runtimeHome });
  assert.equal(projRes.status, 'rebuilt');
  assert.equal(projRes.count, 2);

  const archContent = await readFile(path.join(runtimeHome, 'projects', 'munlucky-moonshot-relay', 'knowledge', 'architecture', 'decisions.jsonl'), 'utf8');
  assert.match(archContent, /Architecture decision statement/);

  const domainContent = await readFile(path.join(runtimeHome, 'projects', 'munlucky-moonshot-relay', 'knowledge', 'domain', 'terms.jsonl'), 'utf8');
  assert.match(domainContent, /Domain term definition/);

  store.close();
});
