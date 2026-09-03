import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp, rm } from 'node:fs/promises';
import { ensureKnowledgeStoreDirectories, writeAtomicJsonl, projectKnowledgeDirectory } from '../scripts/kernel/knowledge/store.mjs';
import { buildProjectKnowledgeContext } from '../scripts/kernel/knowledge/context-load.mjs';

test('buildProjectKnowledgeContext returns deterministic context and digest', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'kernel-ctx-test-'));
  const env = { MOON_RELAY_KERNEL_HOME: tmp };
  await ensureKnowledgeStoreDirectories('test-proj', { env });

  const root = projectKnowledgeDirectory('test-proj', { env });
  await writeAtomicJsonl(path.join(root, 'knowledge', 'semantic', 'verified-facts.jsonl'), [
    { id: 'fact-1', projectId: 'test-proj', type: 'policy_anchor', statement: 'System uses UTC timestamping.', status: 'verified', trustTier: 'verified', createdAt: '2026-07-23T00:00:00.000Z' },
  ]);

  const ctx1 = await buildProjectKnowledgeContext({ projectId: 'test-proj', stage: 'FRAME', env });
  const ctx2 = await buildProjectKnowledgeContext({ projectId: 'test-proj', stage: 'FRAME', env });

  assert.equal(ctx1.digest, ctx2.digest);
  assert.equal(ctx1.stage, 'FRAME');
  assert.equal(ctx1.status, 'ready-populated');
  assert.ok(ctx1.promptBlock.includes('System uses UTC timestamping.'));
});

const contextStateStore = (records) => ({
  getProjectKnowledgeRevision: () => 7,
  listKnowledgeRecords: () => records,
});

test('empty and populated context states are explicit and degraded only when empty', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'kernel-context-quality-'));
  const env = { MOON_RELAY_KERNEL_HOME: root };
  try {
    const empty = await buildProjectKnowledgeContext({
      projectId: 'context-quality',
      runId: 'run-empty',
      stage: 'FRAME',
      stateStore: contextStateStore([]),
      projectRoot: root,
      env,
    });
    assert.equal(empty.status, 'ready-empty');
    assert.equal(empty.degradedContext, true);
    assert.equal(empty.quality.status, 'ready-empty');
    assert.equal(empty.quality.usableRecordCount, 0);
    assert.equal(empty.quality.selectedCounts.policy, 0);

    const populated = await buildProjectKnowledgeContext({
      projectId: 'context-quality',
      runId: 'run-populated',
      stage: 'FRAME',
      stateStore: contextStateStore([{
        id: 'policy-1',
        type: 'policy_anchor',
        statement: 'Use the Kernel receipt authority.',
        status: 'committed',
        trustTier: 'verified',
      }]),
      projectRoot: root,
      env,
    });
    assert.equal(populated.status, 'ready-populated');
    assert.equal(populated.degradedContext, false);
    assert.equal(populated.quality.usableRecordCount, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('context store failures become unavailable instead of ready-empty', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'kernel-context-unavailable-'));
  const env = { MOON_RELAY_KERNEL_HOME: root };
  try {
    const context = await buildProjectKnowledgeContext({
      projectId: 'context-unavailable',
      runId: 'run-unavailable',
      stage: 'FRAME',
      stateStore: {
        getProjectKnowledgeRevision: () => { throw Object.assign(new Error('store offline'), { code: 'STORE_OFFLINE' }); },
        listKnowledgeRecords: () => [],
      },
      projectRoot: root,
      env,
    });
    assert.equal(context.status, 'unavailable');
    assert.equal(context.degradedContext, true);
    assert.equal(context.quality.omittedCounts.unavailable, 1);
    assert.equal(context.staleOrUnavailable[0].errorCode, 'STORE_OFFLINE');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('context with only stale candidates is reported as stale', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'kernel-context-stale-'));
  try {
    const context = await buildProjectKnowledgeContext({
      projectId: 'context-stale',
      runId: 'run-stale',
      stage: 'FRAME',
      projectRoot: root,
      env: { MOON_RELAY_KERNEL_HOME: root },
      stateStore: {
        getProjectKnowledgeRevision: () => 3,
        listKnowledgeRecords: () => [{
          id: 'stale-policy',
          type: 'policy_anchor',
          statement: 'This source no longer exists.',
          status: 'committed',
          trustTier: 'verified',
          sourceRefs: ['missing-source.md'],
          sourceDigest: 'sha256:stale',
        }],
      },
    });
    assert.equal(context.status, 'stale');
    assert.equal(context.quality.reason, 'all-candidates-stale-or-unavailable');
    assert.equal(context.quality.omittedCounts.stale, 1);
    assert.equal(context.semanticFacts.length, 0);
    assert.equal(context.policyAnchors.length, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
