import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  ProjectIdentityError,
  pathHashId,
  resolveProjectIdentity
} from './project-identity.mjs';

function makeTempDir(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `project-identity-${name}-`));
}

function writeFile(filePath, contents) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents);
}

function envFor(home) {
  return { ...process.env, USERPROFILE: home, HOME: home, CODEX_STATE_ROOT: '' };
}

function writeGitRemote(root, remoteUrl) {
  writeFile(path.join(root, '.git', 'config'), `[remote "origin"]\n\turl = ${remoteUrl}\n`);
}

test('explicit identity wins over package, basename, and registry fallbacks', () => {
  const root = makeTempDir('explicit');
  const home = makeTempDir('home');
  writeFile(path.join(root, '.claude', 'project.identity.yaml'), [
    'projectId: stable-explicit',
    'aliases:',
    '  - old-package',
    'canonicalRemote:',
    '  url: https://example.com/org/renamed.git',
    'owner: platform',
    'createdAt: 2026-05-29T00:00:00.000Z',
    'migratedFrom: []',
    ''
  ].join('\n'));
  writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'package-fallback' }));
  writeFile(path.join(home, '.codex', 'state', 'project-registry.json'), JSON.stringify({
    aliases: { 'package-fallback': 'registry-project' },
    projects: [{ projectId: 'registry-project', aliases: ['package-fallback'] }]
  }));

  const resolved = resolveProjectIdentity({ cwd: root, env: envFor(home), runId: 'run-a' });
  assert.equal(resolved.source, 'explicit');
  assert.equal(resolved.identity.projectId, 'stable-explicit');
  assert.match(resolved.namespaces.knowledgeRoot, /stable-explicit[\\/]knowledge$/);
});

test('registry alias resolves before git remote, package, or basename fallback', () => {
  const root = makeTempDir('registry');
  const home = makeTempDir('home');
  writeGitRemote(root, 'https://github.com/acme/registry-alias-repo.git');
  writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'package-fallback' }));
  writeFile(path.join(home, '.codex', 'state', 'project-registry.json'), JSON.stringify({
    projects: [
      {
        projectId: 'logical-registry-project',
        aliases: ['acme-registry-alias-repo'],
        canonicalRemote: { url: 'https://github.com/acme/registry-alias-repo.git', slug: 'acme-registry-alias-repo' },
        createdAt: '2026-05-29T00:00:00.000Z'
      }
    ]
  }));

  const resolved = resolveProjectIdentity({ cwd: root, env: envFor(home), runId: 'run-a' });
  assert.equal(resolved.source, 'registry-alias');
  assert.equal(resolved.identity.projectId, 'logical-registry-project');
});

test('same project in different worktrees shares knowledge root but has distinct execution run roots', () => {
  const home = makeTempDir('home');
  const worktreeA = makeTempDir('worktree-a');
  const worktreeB = makeTempDir('worktree-b');
  for (const worktree of [worktreeA, worktreeB]) {
    writeFile(path.join(worktree, 'package.json'), JSON.stringify({ name: 'shared-package' }));
  }
  writeFile(path.join(home, '.codex', 'state', 'project-registry.json'), JSON.stringify({
    projects: [{ projectId: 'shared-logical-project', aliases: ['shared-package'] }]
  }));

  const first = resolveProjectIdentity({ cwd: worktreeA, env: envFor(home), runId: 'run-a' });
  const second = resolveProjectIdentity({ cwd: worktreeB, env: envFor(home), runId: 'run-b' });
  assert.equal(first.identity.projectId, 'shared-logical-project');
  assert.equal(second.identity.projectId, 'shared-logical-project');
  assert.equal(first.namespaces.knowledgeRoot, second.namespaces.knowledgeRoot);
  assert.notEqual(first.namespaces.worktreeId, second.namespaces.worktreeId);
  assert.notEqual(first.namespaces.executionRoot, second.namespaces.executionRoot);
  assert.notEqual(first.namespaces.runRoot, second.namespaces.runRoot);
  assert.equal(first.namespaces.executionRoot, first.namespaces.runRoot);
  assert.equal(second.namespaces.executionRoot, second.namespaces.runRoot);
});

test('package and basename fallbacks exist only inside resolver order', () => {
  const packageRoot = makeTempDir('package-fallback');
  const home = makeTempDir('home');
  writeFile(path.join(packageRoot, 'package.json'), JSON.stringify({ name: '@scope/Package Name' }));
  const packageResolved = resolveProjectIdentity({ cwd: packageRoot, env: envFor(home), runId: 'run-a' });
  assert.equal(packageResolved.source, 'package-name');
  assert.equal(packageResolved.identity.projectId, 'scope-package-name');

  const basenameRoot = path.join(makeTempDir('base-parent'), 'Base Name Repo');
  fs.mkdirSync(basenameRoot, { recursive: true });
  writeFile(path.join(basenameRoot, '.git', 'config'), '');
  const basenameResolved = resolveProjectIdentity({ cwd: basenameRoot, env: envFor(home), runId: 'run-a' });
  assert.equal(basenameResolved.source, 'git-root-basename');
  assert.equal(basenameResolved.identity.projectId, 'base-name-repo');
});

test('alias collision blocks with project_identity_collision', () => {
  const root = makeTempDir('collision');
  const home = makeTempDir('home');
  writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'shared-alias' }));
  writeFile(path.join(home, '.codex', 'state', 'project-registry.json'), JSON.stringify({
    projects: [
      { projectId: 'first-project', aliases: ['shared-alias'] },
      { projectId: 'second-project', aliases: ['shared-alias'] }
    ]
  }));

  assert.throws(
    () => resolveProjectIdentity({ cwd: root, env: envFor(home), runId: 'run-a' }),
    (error) => error instanceof ProjectIdentityError && error.code === 'project_identity_collision'
  );
});

test('fallback collision requires registry alias entry instead of silent fallback reuse', () => {
  const root = makeTempDir('fallback-collision');
  const home = makeTempDir('home');
  writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'claimed-project' }));
  writeFile(path.join(home, '.codex', 'state', 'project-registry.json'), JSON.stringify({
    projects: [{ projectId: 'claimed-project', aliases: ['different-alias'] }]
  }));

  assert.throws(
    () => resolveProjectIdentity({ cwd: root, env: envFor(home), runId: 'run-a' }),
    (error) => error instanceof ProjectIdentityError && error.code === 'project_identity_collision'
  );
});

test('absolute path hash fallback is stable when no explicit, registry, git, package, or basename signal exists', () => {
  const root = makeTempDir('path-only');
  const home = makeTempDir('home');
  const resolved = resolveProjectIdentity({ cwd: root, env: envFor(home), runId: 'run-a' });
  assert.equal(resolved.source, 'path-hash');
  assert.equal(resolved.identity.projectId, pathHashId(root));
  assert.equal(
    resolved.namespaces.knowledgeRoot,
    path.join(home, '.codex', 'state', 'projects', pathHashId(root), 'knowledge')
  );
});

test('path-hash fallback collision is blocked without confirmed registry alias', () => {
  const root = makeTempDir('path-collision');
  const home = makeTempDir('home');
  writeFile(path.join(home, '.codex', 'state', 'project-registry.json'), JSON.stringify({
    projects: [{ projectId: pathHashId(root), aliases: ['different-confirmed-alias'] }]
  }));

  assert.throws(
    () => resolveProjectIdentity({ cwd: root, env: envFor(home), runId: 'run-a' }),
    (error) => error instanceof ProjectIdentityError && error.code === 'project_identity_collision'
  );
});
