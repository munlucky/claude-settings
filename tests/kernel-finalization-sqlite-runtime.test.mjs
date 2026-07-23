import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp } from 'node:fs/promises';
import { openKernelStateStore } from '../scripts/kernel/state-store.mjs';
import { prepareFinalization } from '../scripts/kernel/finalization/prepare.mjs';
import { commitFinalizationAuthority } from '../scripts/kernel/finalization/authority-commit.mjs';
import { buildProjectKnowledgeContext } from '../scripts/kernel/knowledge/context-load.mjs';

test('buildProjectKnowledgeContext reads runtime knowledge strictly from SQLite', async () => {
  const tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'krn-sq-rt-test-'));
  const store = await openKernelStateStore({ runtimeHome: path.join(tmpRoot, 'kernel'), relayHome: path.join(tmpRoot, 'relay') });

  store.createRun({ runId: 'sq-r1', objective: 'sqlite runtime test', sourceIdentity: 'src-sq1', projectId: 'munlucky-moonshot-relay' });
  store.transition('sq-r1', 'SHAPE');
  store.transition('sq-r1', 'EXECUTE');
  store.transition('sq-r1', 'PROVE');

  store.recordVerification('sq-r1', {
    status: 'passed',
    evidenceRef: 'ev-sq1',
    command: 'npm test',
    exitCode: 0,
    evidenceDigest: 'sha256:' + 'a'.repeat(64),
    sourceIdentity: 'src-sq1',
  });

  const snapshot = await prepareFinalization('sq-r1', {
    observations: [
      {
        candidateId: 'cand-sq-1',
        proposedType: 'semantic_fact',
        statement: 'Fact stored only in SQLite.',
        scope: ['scripts/**'],
        evidenceRefs: ['ev-sq1'],
      },
    ],
  }, { stateStore: store });

  await commitFinalizationAuthority('sq-r1', snapshot, {}, { stateStore: store });

  const ctx = await buildProjectKnowledgeContext({
    projectId: 'munlucky-moonshot-relay',
    stateStore: store,
    stage: 'FRAME',
  });

  assert.equal(ctx.status, 'ready');
  assert.match(ctx.promptBlock, /Fact stored only in SQLite/);

  store.close();
});
