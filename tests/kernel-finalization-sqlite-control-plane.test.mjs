import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp } from 'node:fs/promises';
import { createKernelControlPlane } from '../scripts/kernel/control-plane.mjs';
import { buildProjectKnowledgeContext } from '../scripts/kernel/knowledge/context-load.mjs';

test('MG-04 SQLite-only Control Plane: context loading fails closed without stateStore', async () => {
  await assert.rejects(
    async () => {
      await buildProjectKnowledgeContext({
        projectId: 'munlucky-moonshot-relay',
        stateStore: null,
        stage: 'FRAME',
        env: {},
      });
    },
    { code: 'SQLITE_KNOWLEDGE_AUTHORITY_REQUIRED' }
  );

  const tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'krn-sq-cp-'));
  const cp = await createKernelControlPlane({ runtimeHome: path.join(tmpRoot, 'kernel'), projectRoot: process.cwd() });

  const run = await cp.startRun({
    runId: 'sq-cp-r1',
    objective: 'SQLite control plane test',
  });

  assert.equal(run.runId, 'sq-cp-r1');
  assert.equal(run.state, 'FRAME');

  await cp.close();
});
