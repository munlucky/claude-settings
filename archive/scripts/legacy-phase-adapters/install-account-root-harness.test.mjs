import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = process.cwd();
const testDir = path.dirname(fileURLToPath(import.meta.url));
const scriptPath = path.join(testDir, 'install-account-root-harness.mjs');

const tempRoots = [];

const makeTempRoot = async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'moonshot-relay-account-root-test-'));
  tempRoots.push(root);
  return root;
};

after(async () => {
  for (const root of tempRoots) {
    await rm(root, { recursive: true, force: true });
  }
});

const withSourceRoot = (args) => args.includes('--source-root')
  ? args
  : ['--source-root', repoRoot, ...args];

const runInstaller = (args) => spawnSync(process.execPath, [scriptPath, ...withSourceRoot(args)], {
  cwd: repoRoot,
  encoding: 'utf8',
});

const runInstallerPath = (installerPath, args) => spawnSync(process.execPath, [installerPath, ...withSourceRoot(args)], {
  cwd: repoRoot,
  encoding: 'utf8',
});

test('account-root installer writes direct .claude and .codex payloads without harness-core', async () => {
  const root = await makeTempRoot();
  const claudeHome = path.join(root, '.claude');
  const codexHome = path.join(root, '.codex');

  const result = runInstaller([
    '--runtime',
    'all',
    '--claude-home',
    claudeHome,
    '--codex-home',
    codexHome,
    '--json',
  ]);

  assert.equal(result.status, 0, result.stderr || result.stdout);

  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.mode, 'account-root-direct');
  assert.equal(parsed.manifests.length, 2);
  assert.ok(parsed.manifests.every((manifest) => manifest.legacyHarnessCorePresent === false));

  assert.equal(existsSync(path.join(claudeHome, 'skills', 'moonshot-phase-runner', 'SKILL.md')), true);
  assert.equal(existsSync(path.join(claudeHome, 'scripts', 'project-identity.mjs')), true);
  assert.equal(existsSync(path.join(codexHome, 'skills', 'moonshot-phase-runner', 'SKILL.md')), true);
  assert.equal(existsSync(path.join(codexHome, 'agents', 'phase-attempt-agent.md')), true);
  assert.equal(existsSync(path.join(claudeHome, 'harness-core')), false);
  assert.equal(existsSync(path.join(codexHome, 'harness-core')), false);
});

test('account-root installer skips protected config and removes legacy harness-core when requested', async () => {
  const root = await makeTempRoot();
  const codexHome = path.join(root, '.codex');
  const claudeHome = path.join(root, '.claude');

  await mkdir(path.join(codexHome, 'harness-core'), { recursive: true });
  await mkdir(path.join(claudeHome, 'harness-core'), { recursive: true });
  await writeFile(path.join(codexHome, 'config.toml'), 'local = true\n');
  await writeFile(path.join(codexHome, 'harness-core', 'old.txt'), 'legacy codex\n');
  await writeFile(path.join(claudeHome, 'harness-core', 'old.txt'), 'legacy claude\n');

  const result = runInstaller([
    '--runtime',
    'all',
    '--claude-home',
    claudeHome,
    '--codex-home',
    codexHome,
    '--remove-legacy-harness-core',
    '--json',
  ]);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(await readFile(path.join(codexHome, 'config.toml'), 'utf8'), 'local = true\n');
  assert.equal(existsSync(path.join(codexHome, 'harness-core')), false);
  assert.equal(existsSync(path.join(claudeHome, 'harness-core')), false);

  const codexManifest = JSON.parse(await readFile(path.join(codexHome, '.moonshot-relay-install-manifest.json'), 'utf8'));
  assert.equal(codexManifest.installMode, 'account-root-direct');
  assert.ok(codexManifest.skipped.some((entry) => entry.path === 'config.toml' && entry.reason === 'protected_runtime_entry'));
  assert.ok(codexManifest.skipped.some((entry) => entry.path === 'harness-core' && entry.reason === 'removed_legacy_harness_core'));
});

test('account-root installer preserves legacy manifest evidence when marking it superseded', async () => {
  const root = await makeTempRoot();
  const codexHome = path.join(root, '.codex');
  await mkdir(codexHome, { recursive: true });
  await writeFile(path.join(codexHome, '.claude-settings-install-manifest.json'), `${JSON.stringify({
    schemaVersion: 1,
    installId: 'legacy-install',
    copied: [{ path: 'skills/legacy.md', sha256: 'legacy-hash' }],
  }, null, 2)}\n`);

  const result = runInstaller([
    '--runtime',
    'codex',
    '--codex-home',
    codexHome,
    '--json',
  ]);

  assert.equal(result.status, 0, result.stderr || result.stdout);

  const currentManifest = JSON.parse(await readFile(path.join(codexHome, '.moonshot-relay-install-manifest.json'), 'utf8'));
  const legacyManifest = JSON.parse(await readFile(path.join(codexHome, '.claude-settings-install-manifest.json'), 'utf8'));
  assert.equal(currentManifest.installId === legacyManifest.installId, false);
  assert.equal(legacyManifest.installId, 'legacy-install');
  assert.deepEqual(legacyManifest.copied, [{ path: 'skills/legacy.md', sha256: 'legacy-hash' }]);
  assert.equal(legacyManifest.legacyManifest, true);
  assert.equal(legacyManifest.supersededBy, '.moonshot-relay-install-manifest.json');
});

test('account-root installer writes a minimal superseded marker for invalid legacy manifests', async () => {
  const root = await makeTempRoot();
  const claudeHome = path.join(root, '.claude');
  await mkdir(claudeHome, { recursive: true });
  await writeFile(path.join(claudeHome, '.claude-settings-install-manifest.json'), 'not json\n');

  const result = runInstaller([
    '--runtime',
    'claude',
    '--claude-home',
    claudeHome,
    '--json',
  ]);

  assert.equal(result.status, 0, result.stderr || result.stdout);

  const legacyManifest = JSON.parse(await readFile(path.join(claudeHome, '.claude-settings-install-manifest.json'), 'utf8'));
  assert.deepEqual(legacyManifest, {
    legacyManifest: true,
    supersededBy: '.moonshot-relay-install-manifest.json',
  });
});

test('account-root installer can run from an installed profile when source root is explicit', async () => {
  const root = await makeTempRoot();
  const installedScripts = path.join(root, '.claude', 'scripts');
  const claudeHome = path.join(root, 'target-claude');
  await mkdir(installedScripts, { recursive: true });
  const installedInstaller = path.join(installedScripts, 'install-account-root-harness.mjs');
  await copyFile(scriptPath, installedInstaller);

  const result = runInstallerPath(installedInstaller, [
    '--runtime',
    'claude',
    '--source-root',
    repoRoot,
    '--claude-home',
    claudeHome,
    '--json',
  ]);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(existsSync(path.join(claudeHome, 'scripts', 'project-identity.mjs')), true);
});
