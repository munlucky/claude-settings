import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { openKernelStateStore } from '../scripts/kernel/state-store.mjs';
import { buildCodebaseIndex } from '../scripts/kernel/codebase/build-index.mjs';
import { redactText } from '../scripts/kernel/knowledge-ingestion/redact.mjs';
import { isDeniedStagingPath, selectStagingPaths } from '../scripts/kernel/standalone/kernel-commit.mjs';

test('manual knowledge import uses explicit approval without a Kernel Run and is idempotent by source digest', async () => {
  const runtimeHome = await mkdtemp(path.join(os.tmpdir(), 'kernel-import-home-'));
  const stateStore = await openKernelStateStore({ runtimeHome });
  try {
    const sourceReceipt = { sourceType: 'codex_session', sourceIdentity: 'codex:session-1', sourceDigest: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' };
    const first = stateStore.commitImportedKnowledgeTransaction({
      projectId: 'project-import-test',
      expectedKnowledgeRevision: 1,
      candidates: [{ candidateId: 'cand-1', proposedType: 'architecture_decision', statement: 'Auth is owned by auth-service.', scope: ['src/auth/service.mjs'], status: 'staged' }],
      sourceReceipt,
      userApprovalRef: 'user-selected:cand-1',
    });
    assert.equal(first.status, 'committed');
    assert.equal(first.receipt.authorityType, 'user_approved_import');
    assert.equal(first.receipt.knowledgeRevisionBefore, 1);
    assert.equal(first.receipt.knowledgeRevisionAfter, 2);
    assert.equal(stateStore.getProjectKnowledgeRevision('project-import-test'), 2);
    const second = stateStore.commitImportedKnowledgeTransaction({ projectId: 'project-import-test', expectedKnowledgeRevision: 2, candidates: [{ candidateId: 'cand-1', proposedType: 'architecture_decision', statement: 'Auth is owned by auth-service.', scope: ['src/auth/service.mjs'] }], sourceReceipt, userApprovalRef: 'user-selected:cand-1' });
    assert.equal(second.status, 'no_op');
    assert.equal(stateStore.getKnowledgeImport(first.receipt.importId).status, 'committed');
  } finally {
    await stateStore.close();
    await rm(runtimeHome, { recursive: true, force: true });
  }
});

test('redaction removes credentials and forbidden prompt/transcript content', () => {
  assert.equal(redactText('token=abc123 secret=xyz sk-12345678901234567890'), 'token=[REDACTED] secret=[REDACTED] [REDACTED]');
});

test('Code Index writes account-root manifests and cache-hits the same tree', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'kernel-codebase-project-'));
  const codebaseRoot = await mkdtemp(path.join(os.tmpdir(), 'kernel-codebase-index-'));
  try {
    await writeFile(path.join(projectRoot, 'package.json'), JSON.stringify({ name: 'fixture' }));
    await writeFile(path.join(projectRoot, 'app.mjs'), 'export function run() { return 1; }\n');
    const first = await buildCodebaseIndex({ projectRoot, projectId: 'codebase-test', codebaseRoot });
    assert.equal(first.status, 'completed');
    assert.equal(first.manifest.status, 'fresh');
    const second = await buildCodebaseIndex({ projectRoot, projectId: 'codebase-test', codebaseRoot });
    assert.equal(second.status, 'cache_hit');
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
    await rm(codebaseRoot, { recursive: true, force: true });
  }
});

test('Kernel commit staging uses explicit paths and deny filters', () => {
  assert.equal(isDeniedStagingPath('.agents/skills/example/SKILL.md'), true);
  assert.equal(isDeniedStagingPath('src/app.mjs'), false);
  const selected = selectStagingPaths([{ status: ' M', path: 'src/app.mjs' }, { status: '??', path: '.mcp.json' }]);
  assert.deepEqual(selected.selected, ['src/app.mjs']);
  assert.equal(selected.denied[0].reason, 'deny_path');
});
