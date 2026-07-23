import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp, readFile } from 'node:fs/promises';
import {
  ensureKnowledgeStoreDirectories,
  loadAllProjectRecords,
  readProjectRevision,
  writeAtomicJson,
  writeAtomicJsonl,
  projectKnowledgeDirectory,
} from '../scripts/kernel/knowledge/store.mjs';

test('ensureKnowledgeStoreDirectories creates expected directory structure and initial revision', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'kernel-store-test-'));
  const env = { MOON_RELAY_KERNEL_HOME: tmp };
  const root = await ensureKnowledgeStoreDirectories('test-proj', { env });

  assert.ok(root.endsWith('test-proj'));
  const revision = await readProjectRevision('test-proj', { env });
  assert.equal(revision, '1');
});

test('writeAtomicJson write files atomically without partial writes', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'kernel-store-test-'));
  const targetFile = path.join(tmp, 'test.json');
  await writeAtomicJson(targetFile, { hello: 'world' });

  const content = JSON.parse(await readFile(targetFile, 'utf8'));
  assert.equal(content.hello, 'world');
});

test('loadAllProjectRecords reads empty JSONL files cleanly', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'kernel-store-test-'));
  const env = { MOON_RELAY_KERNEL_HOME: tmp };
  const records = await loadAllProjectRecords('test-proj', { env });

  assert.deepEqual(records.policyAnchors, []);
  assert.deepEqual(records.semanticFacts, []);
  assert.deepEqual(records.observations, []);
});
