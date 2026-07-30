import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, mkdtemp, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { canonicalMutationPath } from '../scripts/kernel/run/mutation-guard.mjs';
import { normalizeProviderMutationRequest } from '../scripts/kernel/run/provider-mutation-adapter.mjs';

test('mutation paths reject traversal and symlink escapes', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'kernel-path-root-'));
  const outside = await mkdtemp(path.join(os.tmpdir(), 'kernel-path-outside-'));
  await mkdir(path.join(root, 'src'), { recursive: true });
  await writeFile(path.join(root, 'src', 'app.mjs'), 'x');
  assert.equal(canonicalMutationPath({ workspaceRoot: root, targetPath: 'src/../src/app.mjs' }), 'src/app.mjs');
  assert.throws(() => canonicalMutationPath({ workspaceRoot: root, targetPath: '../escape' }), /mutation_outside_workspace/);
  await symlink(outside, path.join(root, 'link'), process.platform === 'win32' ? 'junction' : undefined);
  assert.throws(() => canonicalMutationPath({ workspaceRoot: root, targetPath: 'link/file' }), /mutation_outside_workspace/);
});

test('provider adapters only normalize mutation payloads', () => {
  assert.deepEqual(normalizeProviderMutationRequest({
    provider: 'claude',
    payload: { tool_name: 'Write', tool_input: { file_path: 'src/a.mjs', path: 'src/a.mjs' } },
    context: { runId: 'r', stepId: 's', capsuleId: 'c', fencingToken: 2, sessionToken: 'h' },
  }), {
    provider: 'claude',
    runId: 'r',
    stepId: 's',
    capsuleId: 'c',
    fencingToken: 2,
    sessionToken: 'h',
    operation: 'file_write',
    targetPaths: ['src/a.mjs'],
  });
});
