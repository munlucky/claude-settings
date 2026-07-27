import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, symlink } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { activeGate } from './helpers/active-gate.mjs';

const root = process.cwd();
const readRoot = (...segments) => readFile(path.join(root, ...segments), 'utf8');
const tempRoots = [];

after(async () => {
  await Promise.all(tempRoots.map((dir) => rm(dir, { recursive: true, force: true })));
});

const requiredChecks = async () => JSON.parse(await readRoot('.github', 'required-checks.json'));

test('CI workflow runs active gates across supported OS and Node matrix', async () => {
  const ci = await readRoot('.github', 'workflows', 'ci.yml');

  for (const os of ['ubuntu-latest', 'windows-latest', 'macos-latest']) {
    assert.match(ci, new RegExp(`- ${os}`));
  }
  for (const node of ['20.x', '22.x']) {
    assert.match(ci, new RegExp(`- ${node.replace('.', '\\.')}`));
  }
  for (const command of [
    'npm ci',
    'npm test',
    'npm run test:package',
    'npm run test:eval',
    'node package/build-package.mjs --runtime all --dry-run --json',
    'node scripts/install-account-root-harness.mjs --runtime all --dry-run --json',
    'git diff --check',
  ]) {
    assert.match(ci, new RegExp(command.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(ci, /permissions:\s*\n\s*contents: read/);
  assert.match(ci, /concurrency:/);
  assert.match(ci, /name: CI \/ Node \$\{\{ matrix\.node \}\} on \$\{\{ matrix\.os \}\}/);
  assert.match(ci, /--moonshot-home \$moonshotHome --claude-home \$claudeHome --codex-home \$codexHome --qwen-home \$qwenHome --antigravity-home \$antigravityHome/);
  assert.match(ci, /\$payload\.dryRun -ne \$true/);
  assert.match(ci, /\$payload\.manifests/);
  assert.doesNotMatch(ci, /\$payload\.runtimes/);
  assert.match(ci, /removedCount/);
  assert.match(ci, /backupCount/);
});

test('CodeQL workflow targets JavaScript TypeScript with least privilege', async () => {
  const codeql = await readRoot('.github', 'workflows', 'codeql.yml');

  assert.match(codeql, /github\/codeql-action\/init@v4/);
  assert.match(codeql, /github\/codeql-action\/analyze@v4/);
  assert.match(codeql, /languages: javascript-typescript/);
  assert.match(codeql, /contents: read/);
  assert.match(codeql, /security-events: write/);
  assert.match(codeql, /name: CodeQL \/ Analyze JavaScript/);
  assert.match(codeql, /concurrency:/);
});

test('Dependency Review workflow is least privilege and release blocking', async () => {
  const workflow = await readRoot('.github', 'workflows', 'dependency-review.yml');

  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /contents: read/);
  assert.match(workflow, /pull-requests: read/);
  assert.match(workflow, /concurrency:/);
  assert.match(workflow, /actions\/dependency-review-action@v5/);
  assert.match(workflow, /fail-on-severity: high/);
  assert.match(workflow, /name: Dependency Review \/ Pull Request/);
});

test('Dependabot covers npm and GitHub Actions', async () => {
  const dependabot = await readRoot('.github', 'dependabot.yml');

  assert.match(dependabot, /package-ecosystem: npm/);
  assert.match(dependabot, /package-ecosystem: github-actions/);
  assert.match(dependabot, /interval: weekly/);
  assert.match(dependabot, /groups:/);
});

test('CODEOWNERS covers harness-critical roots', async () => {
  const codeowners = await readRoot('.github', 'CODEOWNERS');

  for (const rootPath of ['/scripts/', '/skills/', '/agents/', '/schemas/', '/package/', '/.github/', '/docs/public/']) {
    assert.match(codeowners, new RegExp(rootPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('required check names are stable and mapped to workflow jobs', async () => {
  const checks = await requiredChecks();
  const ci = await readRoot('.github', 'workflows', 'ci.yml');
  const codeql = await readRoot('.github', 'workflows', 'codeql.yml');
  const dependencyReview = await readRoot('.github', 'workflows', 'dependency-review.yml');

  assert.deepEqual(checks.statuses['source-ci-ready'].requiresGitHubSettingsEvidence, false);
  assert.deepEqual(checks.statuses['github-settings-applied'].requiresGitHubSettingsEvidence, true);
  assert.deepEqual(checks.statuses['release-protected'].requiresGitHubSettingsEvidence, true);

  for (const node of ['20.x', '22.x']) {
    for (const osName of ['ubuntu-latest', 'windows-latest', 'macos-latest']) {
      assert.ok(checks.requiredChecks.includes(`CI / Node ${node} on ${osName}`));
    }
  }
  for (const check of ['CodeQL / Analyze JavaScript', 'Dependency Review / Pull Request']) {
    assert.ok(checks.requiredChecks.includes(check));
  }

  assert.match(ci, /CI \/ Node \$\{\{ matrix\.node \}\} on \$\{\{ matrix\.os \}\}/);
  assert.match(codeql, /CodeQL \/ Analyze JavaScript/);
  assert.match(dependencyReview, /Dependency Review \/ Pull Request/);
});

test('active npm test includes CI security contract', async () => {
  const packageJson = JSON.parse(await readRoot('package.json'));

  assert.match(activeGate(packageJson), /tests\/github-ci-security-contract\.test\.mjs/);
});

test('docs name required branch protection checks and review roots', async () => {
  const docs = await readRoot('docs', 'public', 'installer-usage.md');

  for (const phrase of [
    'Branch protection is a repository setting',
    'CI / Node 20.x on ubuntu-latest',
    'CI / Node 22.x on macos-latest',
    'CodeQL / Analyze JavaScript',
    'Dependency Review / Pull Request',
    'secret scanning',
    'source-ci-ready',
    'github-settings-applied',
    'release-protected',
    'Do not allow direct pushes to `main`',
  ]) {
    assert.match(docs, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  for (const rootPath of ['scripts/', 'skills/', 'agents/', 'schemas/', 'package/', '.github/', 'docs/public/']) {
    assert.match(docs, new RegExp(rootPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('temp-home installer dry-run does not target live account-root profiles', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'moonshot-ci-dry-run-'));
  tempRoots.push(tempRoot);
  const moonshotHome = path.join(tempRoot, 'moonshot-home');
  const claudeHome = path.join(tempRoot, 'claude-home');
  const codexHome = path.join(tempRoot, 'codex-home');
  const qwenHome = path.join(tempRoot, 'qwen-home');
  const antigravityHome = path.join(tempRoot, 'antigravity-home');
  const antigravitySkillsHome = path.join(tempRoot, 'antigravity-skills-home');
  const result = spawnSync(process.execPath, [
    'scripts/install-account-root-harness.mjs',
    '--runtime',
    'all',
    '--dry-run',
    '--json',
    '--moonshot-home',
    moonshotHome,
    '--claude-home',
    claudeHome,
    '--codex-home',
    codexHome,
    '--qwen-home',
    qwenHome,
    '--antigravity-home',
    antigravityHome,
    '--antigravity-skills-home',
    antigravitySkillsHome,
  ], {
    cwd: root,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.dryRun, true);
  assert.deepEqual(payload.manifests.map((manifest) => manifest.targetRoot).sort(), [
    claudeHome,
    codexHome,
    moonshotHome,
    qwenHome,
    antigravityHome,
    antigravitySkillsHome,
  ].sort());
  assert.equal(payload.manifests.reduce((sum, manifest) => sum + manifest.removedCount, 0), 0);
  assert.equal(payload.manifests.reduce((sum, manifest) => sum + manifest.backupCount, 0), 0);
});

test('ANTIGRAVITY_HOME environment override keeps global skills projection beside temp profile', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'moonshot-antigravity-env-'));
  tempRoots.push(tempRoot);
  const antigravityHome = path.join(tempRoot, '.gemini', 'antigravity');
  const moonshotHome = path.join(tempRoot, 'moonshot-home');
  const env = {
    ...process.env,
    ANTIGRAVITY_HOME: antigravityHome,
    MOONSHOT_RELAY_HOME: moonshotHome,
  };
  delete env.ANTIGRAVITY_SKILLS_HOME;

  const result = spawnSync(process.execPath, [
    'scripts/install-account-root-harness.mjs',
    '--runtime',
    'antigravity',
    '--dry-run',
    '--json',
  ], {
    cwd: root,
    env,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.deepEqual(payload.manifests.map((manifest) => manifest.targetRoot).sort(), [
    antigravityHome,
    path.join(tempRoot, '.gemini', 'config'),
    moonshotHome,
  ].sort());
});

test('Antigravity global skills projection rejects symlinked target paths', async (t) => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'moonshot-antigravity-symlink-'));
  tempRoots.push(tempRoot);
  const antigravityHome = path.join(tempRoot, '.gemini', 'antigravity');
  const antigravitySkillsHome = path.join(tempRoot, '.gemini', 'config');
  const outsideRoot = path.join(tempRoot, 'outside');
  const targetSkillsRoot = path.join(antigravitySkillsHome, 'skills');
  await mkdir(outsideRoot, { recursive: true });
  await mkdir(antigravitySkillsHome, { recursive: true });

  try {
    await symlink(outsideRoot, targetSkillsRoot, process.platform === 'win32' ? 'junction' : 'dir');
  } catch (error) {
    if (['EPERM', 'EACCES', 'UNKNOWN'].includes(error.code)) {
      t.skip(`symlink creation unavailable: ${error.code}`);
      return;
    }
    throw error;
  }

  const result = spawnSync(process.execPath, [
    'scripts/install-account-root-harness.mjs',
    '--runtime',
    'antigravity',
    '--antigravity-home',
    antigravityHome,
    '--antigravity-skills-home',
    antigravitySkillsHome,
    '--no-backup',
    '--json',
  ], {
    cwd: root,
    encoding: 'utf8',
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Unsafe symlink path under target root/);
  assert.deepEqual(await readdir(outsideRoot), []);
});
