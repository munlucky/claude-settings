import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { resolveKernelProjectIdentity, normalizeRemoteUrl, sanitizeId } from '../scripts/kernel/project-identity.mjs';

test('resolveKernelProjectIdentity resolves deterministic identity from git remote', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'kernel-identity-test-'));
  const gitDir = path.join(tmp, '.git');
  await mkdir(gitDir, { recursive: true });
  await writeFile(path.join(gitDir, 'config'), '[remote "origin"]\n  url = git@github.com:myorg/my-cool-project.git\n');

  const result = resolveKernelProjectIdentity({ cwd: tmp, env: { MOON_RELAY_KERNEL_HOME: path.join(tmp, '.moon-relay-kernel') } });
  assert.equal(result.projectId, 'myorg-my-cool-project');
  assert.equal(result.identitySource, 'git_remote_origin');
  assert.ok(result.identityDigest);
  assert.ok(result.namespaces.projectKnowledgeRoot.includes('myorg-my-cool-project'));
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
