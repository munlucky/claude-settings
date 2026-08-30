import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ACTIVE_EXECUTION_FILES, auditActiveRuntimeBoundary } from '../scripts/kernel/runtime-boundary-audit.mjs';

const collectFiles = async (dir, ext = '.mjs') => {
  const result = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...await collectFiles(fullPath, ext));
    } else if (entry.isFile() && (ext ? fullPath.endsWith(ext) : true)) {
      result.push(fullPath);
    }
  }
  return result;
};

test('Static boundary: No production file imports deleted legacy launchers', async () => {
  const productionDirs = [
    path.resolve('scripts/kernel'),
    path.resolve('scripts/switcher'),
    path.resolve('scripts/host'),
    path.resolve('bin'),
  ];
  const forbiddenPatterns = [
    /codex-cli-launcher/i,
    /codex-runtime/i,
    /codex-profile-materializer/i,
    /codex-review-host/i,
    /moon-relay-kernel-host/i,
  ];

  for (const dir of productionDirs) {
    const files = await collectFiles(dir);
    for (const file of files) {
      const content = await readFile(file, 'utf8');
      for (const pattern of forbiddenPatterns) {
        assert.equal(
          pattern.test(content),
          false,
          `Forbidden legacy launcher reference matched in production file ${file}: ${pattern}`,
        );
      }
    }
  }
});

test('Static boundary: No production file contains forbidden legacy vocabulary strings', async () => {
  const productionDirs = [
    path.resolve('scripts/kernel'),
    path.resolve('scripts/switcher'),
    path.resolve('scripts/host'),
    path.resolve('bin'),
  ];
  const forbiddenStrings = [
    'relaunch-through-kernel-host',
    'shared-host-dispatch',
    'profile-and-data-root',
  ];

  for (const dir of productionDirs) {
    const files = await collectFiles(dir);
    for (const file of files) {
      const content = await readFile(file, 'utf8');
      for (const str of forbiddenStrings) {
        assert.equal(
          content.includes(str),
          false,
          `Forbidden legacy string '${str}' found in production file ${file}`,
        );
      }
    }
  }
});

test('Static boundary: Active Kernel surfaces cannot reintroduce retired runtime paths', async () => {
  const audit = await auditActiveRuntimeBoundary({ repoRoot: path.resolve('.') });
  assert.equal(audit.status, 'pass', JSON.stringify(audit.findings, null, 2));
  for (const file of ACTIVE_EXECUTION_FILES) assert.ok(audit.scannedFiles.includes(file), `${file} must be audited as a reachable execution target`);
  assert.ok(audit.migrationOnlyFiles.includes('scripts/install-account-root-harness.mjs'));
});

test('Static boundary: Reachable local helpers are included in active execution audit', async () => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'kernel-boundary-closure-'));
  try {
    await mkdir(path.join(fixtureRoot, 'scripts'), { recursive: true });
    await writeFile(path.join(fixtureRoot, 'scripts', 'delivery-submit.mjs'), "import(/* comment before specifier */ './reachable-helper.mjs');\n", 'utf8');
    await writeFile(path.join(fixtureRoot, 'scripts', 'reachable-helper.mjs'), "export const marker = 'MOONSHOT_RELAY_HOME';\n", 'utf8');
    const audit = await auditActiveRuntimeBoundary({ repoRoot: fixtureRoot });
    assert.equal(audit.status, 'fail');
    assert.ok(audit.scannedFiles.includes('scripts/reachable-helper.mjs'));
    assert.ok(audit.findings.some((finding) => finding.file === 'scripts/reachable-helper.mjs' && finding.code === 'active-runtime-relay-home-interactive'));
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test('Static boundary: Symlinked reachable helpers outside the repository fail closed', async () => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'kernel-boundary-symlink-'));
  const externalRoot = await mkdtemp(path.join(os.tmpdir(), 'kernel-boundary-external-'));
  try {
    await mkdir(path.join(fixtureRoot, 'scripts'), { recursive: true });
    await writeFile(path.join(fixtureRoot, 'scripts', 'delivery-submit.mjs'), "import './linked/helper.mjs';\n", 'utf8');
    await writeFile(path.join(externalRoot, 'helper.mjs'), "export const marker = 'MOONSHOT_RELAY_HOME';\n", 'utf8');
    await symlink(externalRoot, path.join(fixtureRoot, 'scripts', 'linked'), 'junction');

    const audit = await auditActiveRuntimeBoundary({ repoRoot: fixtureRoot });
    assert.equal(audit.status, 'fail', JSON.stringify(audit, null, 2));
    assert.ok(audit.findings.some((finding) => finding.code === 'active-runtime-import-outside-repo'));
    assert.equal(audit.scannedFiles.some((file) => file.includes('kernel-boundary-external-')), false);
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
    await rm(externalRoot, { recursive: true, force: true });
  }
});
