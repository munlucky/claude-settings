import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { pathHashId, resolveKernelProjectIdentity, normalizeRemoteUrl, sanitizeId } from '../scripts/kernel/project-identity.mjs';
import { openKernelStateStore } from '../scripts/kernel/state-store.mjs';

test('resolveKernelProjectIdentity anchors identity to the workspace root and keeps origin as an alias', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'kernel-identity-test-'));
  const gitDir = path.join(tmp, '.git');
  await mkdir(gitDir, { recursive: true });
  await writeFile(path.join(gitDir, 'config'), '[remote "origin"]\n  url = git@github.com:myorg/my-cool-project.git\n');

  const result = resolveKernelProjectIdentity({ cwd: tmp, env: { MOON_RELAY_KERNEL_HOME: path.join(tmp, '.moon-relay-kernel') } });
  assert.match(result.projectId, /^path-[a-f0-9]{16}$/);
  assert.equal(result.identitySource, 'workspace_root');
  assert.deepEqual(result.aliases, ['https://github.com/myorg/my-cool-project']);
  assert.ok(result.identityDigest);
  assert.ok(result.namespaces.projectKnowledgeRoot.includes(result.projectId));
});

test('adding origin after the first resolution preserves projectId and identityDigest', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'kernel-identity-origin-migration-'));
  try {
    const gitDir = path.join(tmp, '.git');
    await mkdir(gitDir, { recursive: true });
    await writeFile(path.join(gitDir, 'config'), '[core]\n\trepositoryformatversion = 0\n');
    const env = { MOON_RELAY_KERNEL_HOME: path.join(tmp, '.moon-relay-kernel') };
    const before = resolveKernelProjectIdentity({ cwd: tmp, env });
    await writeFile(path.join(gitDir, 'config'), '[core]\n\trepositoryformatversion = 0\n[remote "origin"]\n\turl = https://github.com/myorg/my-cool-project.git\n');
    const after = resolveKernelProjectIdentity({ cwd: tmp, env });
    assert.equal(after.projectId, before.projectId);
    assert.equal(after.identityDigest, before.identityDigest);
    assert.deepEqual(after.aliases, ['https://github.com/myorg/my-cool-project']);
    assert.ok(after.legacyProjectIds.includes('github-com-myorg-my-cool-project'));
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test('normalizeRemoteUrl normalizes git ssh and https URLs cleanly', () => {
  assert.equal(normalizeRemoteUrl('git@github.com:foo/bar.git'), 'https://github.com/foo/bar');
  assert.equal(normalizeRemoteUrl('https://github.com/foo/bar.git/'), 'https://github.com/foo/bar');
});

test('resolveKernelProjectIdentity prefers local project.identity.yaml when present', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'kernel-identity-test-'));
  const localDir = path.join(tmp, '.moon-relay');
  await mkdir(localDir, { recursive: true });
  await writeFile(path.join(localDir, 'project.identity.yaml'), 'projectId: explicit-project-id\n');

  const result = resolveKernelProjectIdentity({ cwd: tmp, env: { MOON_RELAY_KERNEL_HOME: path.join(tmp, '.moon-relay-kernel') } });
  assert.equal(result.projectId, 'explicit-project-id');
  assert.equal(result.identitySource, 'local_identity_file');
});

test('legacy project-aliases.json direct maps accept Windows backslash and forward-slash root keys', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'kernel-identity-alias-path-'));
  try {
    const stateDir = path.join(tmp, '.moon-relay-kernel', 'state');
    await mkdir(stateDir, { recursive: true });
    const resolved = path.resolve(tmp);
    const keys = [resolved.toLowerCase(), resolved.replaceAll('\\', '/').toLowerCase()];
    for (const key of keys) {
      await writeFile(path.join(stateDir, 'project-aliases.json'), JSON.stringify({
        [key]: { projectId: 'legacy-windows-identity', identitySource: 'account_alias_registry' },
      }));
      const result = resolveKernelProjectIdentity({ cwd: tmp, env: { MOON_RELAY_KERNEL_HOME: path.join(tmp, '.moon-relay-kernel') } });
      assert.equal(result.projectId, 'legacy-windows-identity');
      assert.equal(result.identitySource, 'account_alias_registry');
    }
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test('local identity changes retain persisted and path-derived lineage candidates for migration', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'kernel-identity-lineage-'));
  const runtimeHome = path.join(tmp, '.moon-relay-kernel');
  const legacyPersisted = 'legacy-persisted-lineage';
  try {
    await mkdir(path.join(tmp, '.git'), { recursive: true });
    await mkdir(path.join(tmp, '.moon-relay'), { recursive: true });
    await writeFile(path.join(tmp, '.moon-relay', 'project.identity.yaml'), 'projectId: explicit-lineage-project\n');
    await mkdir(path.join(runtimeHome, 'state'), { recursive: true });
    await writeFile(path.join(runtimeHome, 'state', 'project-aliases.json'), JSON.stringify({
      [path.resolve(tmp).toLowerCase()]: { projectId: legacyPersisted, identitySource: 'account_alias_registry' },
    }));

    const identity = resolveKernelProjectIdentity({ cwd: tmp, env: { MOON_RELAY_KERNEL_HOME: runtimeHome } });
    assert.equal(identity.projectId, 'explicit-lineage-project');
    assert.ok(identity.legacyProjectIds.includes(legacyPersisted));
    assert.ok(identity.legacyProjectIds.includes(pathHashId(tmp)));
    assert.ok(identity.legacyAliases.some((candidate) => candidate.projectId === legacyPersisted && candidate.source === 'persisted'));

    const store = await openKernelStateStore({ runtimeHome });
    try {
      store.createRun({ runId: 'persisted-lineage-run', objective: 'lineage', sourceIdentity: `sha256:${'a'.repeat(64)}`, projectId: legacyPersisted, workspaceId: 'persisted-lineage-workspace' });
      store.registerProjectWorkspace({
        workspaceId: 'persisted-lineage-workspace',
        canonicalRoot: path.resolve(tmp).replaceAll('\\', '/').toLowerCase(),
        gitCommonDir: null,
        gitWorktreeDir: null,
        identity: { projectId: legacyPersisted },
      });
      const registered = store.registerProjectIdentity(identity);
      assert.equal(registered.projectId, 'explicit-lineage-project');
      assert.equal(store.getRun('persisted-lineage-run').projectId, 'explicit-lineage-project');
      assert.equal(store.getProjectIdentity({ alias: `project-id:${legacyPersisted}` }).projectId, 'explicit-lineage-project');
    } finally {
      store.close();
    }
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test('runtime identity registration is immutable, aliases are idempotent, and legacy project rows migrate atomically', async () => {
  const runtimeHome = await mkdtemp(path.join(os.tmpdir(), 'kernel-identity-state-'));
  try {
    const store = await openKernelStateStore({ runtimeHome });
    const sourceIdentity = `sha256:${'a'.repeat(64)}`;
    store.createRun({
      runId: 'legacy-identity-run',
      objective: 'legacy identity migration',
      sourceIdentity,
      projectId: 'github-com-myorg-my-cool-project',
      workspaceId: 'legacy-identity-workspace',
    });
    store.registerProjectWorkspace({
      workspaceId: 'legacy-identity-workspace',
      canonicalRoot: 'c:/workspace/project',
      gitCommonDir: null,
      gitWorktreeDir: null,
      identity: { projectId: 'github-com-myorg-my-cool-project', canonicalRoot: 'c:/workspace/project' },
    });
    const first = store.registerProjectIdentity({
      projectId: 'path-immutable-project',
      canonicalRoot: 'C:/workspace/project',
      identitySource: 'workspace_root',
      identityDigest: 'digest-immutable-project',
      aliases: [],
      legacyProjectIds: ['github-com-myorg-my-cool-project'],
      legacyAliases: [{ projectId: 'github-com-myorg-my-cool-project', source: 'origin' }],
    });
    const second = store.registerProjectIdentity({
      projectId: 'github-com-myorg-my-cool-project',
      canonicalRoot: 'C:/workspace/project',
      identitySource: 'git_remote_origin',
      identityDigest: 'digest-must-not-replace',
      aliases: ['https://github.com/myorg/my-cool-project'],
      legacyProjectIds: [],
    });
    assert.equal(first.projectId, 'path-immutable-project');
    assert.equal(second.projectId, first.projectId);
    assert.equal(second.identityDigest, first.identityDigest);
    assert.deepEqual(second.aliases, ['https://github.com/myorg/my-cool-project']);
    assert.equal(store.getProjectIdentity({ alias: 'https://github.com/myorg/my-cool-project' }).projectId, first.projectId);
    assert.equal(store.getRun('legacy-identity-run').projectId, first.projectId);
    const repeat = store.registerProjectIdentity({
      projectId: 'path-immutable-project',
      canonicalRoot: 'C:/workspace/project',
      identitySource: 'workspace_root',
      identityDigest: first.identityDigest,
      aliases: ['https://github.com/myorg/my-cool-project'],
      legacyProjectIds: [],
    });
    assert.deepEqual(repeat.aliases, second.aliases);
    store.close();
  } finally {
    await rm(runtimeHome, { recursive: true, force: true });
  }
});
