import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { existsSync, lstatSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const fromRoot = (...segments) => path.join(root, ...segments);

const canonicalDirs = [
  'skills',
  'agents',
  'rules',
  'scripts',
  'bin',
  'tools',
  'schemas',
  'templates',
  'tests',
  'package',
];

const wrapperDirs = ['.claude-plugin', '.codex-plugin'];

const profileTemplateDirs = [
  'package/profile-templates/claude/.claude',
  'package/profile-templates/codex/.codex',
];

const archiveDirs = [
  'archive/scripts/legacy-phase-adapters',
];

const canonicalSourceMinimums = new Map([
  ['skills', 10],
  ['agents', 5],
  ['rules', 5],
  ['scripts', 5],
  ['bin', 1],
  ['tools', 5],
  ['schemas', 2],
  ['templates', 5],
]);

const generatedStateExclusions = [
  '.claude/logs/**',
  '.claude/cache/**',
  '.claude/traces/**',
  '.claude/browser-artifacts/**',
  '.claude/browser-runtime/**',
  '.claude/tools/**/node_modules/**',
  '.claude/tmp/**',
  '.claude/runtime-state.sqlite*',
  '.claude/memory.json',
  '.claude/memorygraph/**',
  '.claude/*verdict*.json',
  '.code-review-graph/**',
];

const listFiles = async (relativeDir) => {
  const absoluteDir = fromRoot(relativeDir);
  const entries = await readdir(absoluteDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const relativePath = path.join(relativeDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFiles(relativePath));
    } else {
      files.push(relativePath.replaceAll(path.sep, '/'));
    }
  }

  return files;
};

test('canonical source and package boundary directories exist', () => {
  for (const dir of canonicalDirs) {
    const fullPath = fromRoot(dir);
    assert.equal(existsSync(fullPath), true, `${dir} should exist`);
    assert.equal(lstatSync(fullPath).isDirectory(), true, `${dir} should be a directory`);
  }

  for (const dir of wrapperDirs) {
    const fullPath = fromRoot(dir);
    assert.equal(existsSync(fullPath), true, `${dir} should exist`);
    assert.equal(lstatSync(fullPath).isDirectory(), true, `${dir} should be a directory`);
  }

  for (const dir of profileTemplateDirs) {
    const fullPath = fromRoot(dir);
    assert.equal(existsSync(fullPath), true, `${dir} should exist`);
    assert.equal(lstatSync(fullPath).isDirectory(), true, `${dir} should be a directory`);
  }

  for (const dir of archiveDirs) {
    const fullPath = fromRoot(dir);
    assert.equal(existsSync(fullPath), true, `${dir} should exist`);
    assert.equal(lstatSync(fullPath).isDirectory(), true, `${dir} should be a directory`);
  }
});

test('canonical source directories contain real harness files, not README-only placeholders', async () => {
  for (const [dir, minimumFileCount] of canonicalSourceMinimums) {
    const files = await listFiles(dir);
    const sourceFiles = files.filter((file) => !file.endsWith('/README.md') && file !== `${dir}/README.md`);

    assert.ok(
      sourceFiles.length >= minimumFileCount,
      `${dir}/ should contain at least ${minimumFileCount} real source files, found ${sourceFiles.length}`,
    );
  }

  assert.equal(existsSync(fromRoot('skills', 'moonshot-phase-runner', 'SKILL.md')), true);
  assert.equal(existsSync(fromRoot('scripts', 'install-account-root-harness.mjs')), true);
  assert.equal(existsSync(fromRoot('package.json')), true);
  assert.equal(existsSync(fromRoot('bin', 'moonshot-relay.mjs')), true);
  assert.equal(existsSync(fromRoot('scripts', 'memorygraph-mcp-wrapper.js')), true);
  assert.equal(existsSync(fromRoot('bin', 'browserctl')), true);
  assert.equal(existsSync(fromRoot('tools', 'browserd', 'package.json')), true);
  assert.equal(existsSync(fromRoot('rules', 'workflow.md')), true);
  assert.equal(existsSync(fromRoot('schemas', 'verification.contract.yaml')), true);
  assert.equal(existsSync(fromRoot('templates', 'GOAL_CONTRACT.template.yaml')), true);
});

test('package contract declares required source payload entries and generated-state exclusions', async () => {
  const contract = await readFile(fromRoot('package', 'package-contract.yaml'), 'utf8');

  for (const key of ['skills', 'agents', 'rules', 'scripts', 'bin', 'tools', 'schemas', 'templates', 'tests', 'publicDocs']) {
    assert.match(contract, new RegExp(`^  ${key}:`, 'm'), `canonicalSource.${key} should be declared`);
  }

  for (const entry of [
    'skills/**',
    'agents/**',
    'rules/**',
    'bin/**',
    'tools/**',
    'schemas/**',
    'templates/**',
    'docs/public/**',
    'tests/package-layout.test.mjs',
    'schemas/verification.contract.yaml',
    'package/build-package.mjs',
    'scripts/install-account-root-harness.mjs',
    'claudeSupportScripts:',
    'archivedLegacyScripts:',
    'archive/scripts/legacy-phase-adapters/',
    'scripts/install-browser-runtime.sh',
    'scripts/memorygraph-mcp-wrapper.js',
    'scripts/code-review-graph-mcp-wrapper.js',
    'package/profile-templates/claude/.claude/',
    'package/profile-templates/codex/.codex/',
  ]) {
    assert.match(contract, new RegExp(entry.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `${entry} should be listed`);
  }

  for (const exclusion of generatedStateExclusions) {
    assert.match(contract, new RegExp(exclusion.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `${exclusion} should be excluded`);
  }

  assert.match(contract, /scripts\/fixtures\/\*\*/);
  assert.match(contract, /tests\/fixtures\/\*\*/);

  assert.match(contract, /symlinkPolicy: avoid_required_symlinks/);
  assert.match(contract, /windowsMaterializationPolicy:/);
  assert.match(contract, /duplicateSourcePolicy:/);
  assert.match(contract, /accountRootInstall:/);
  assert.match(contract, /defaultShellInstaller: install-claude\.sh/);
  assert.match(contract, /mode: account-root-direct/);
  assert.match(contract, /projectCompatibilityMode: "install-claude\.sh --project"/);
  assert.match(contract, /sharedRuntimeHome:/);
  assert.match(contract, /env: MOONSHOT_RELAY_HOME/);
  assert.match(contract, /windowsCmd: "%MOONSHOT_RELAY_HOME%"/);
  assert.match(contract, /windowsPowerShell: "\$env:MOONSHOT_RELAY_HOME"/);
  assert.match(contract, /posixShell: "\$\{MOONSHOT_RELAY_HOME\}"/);
  assert.match(contract, /common: "\$\{MOONSHOT_RELAY_HOME:-~\/\.moonshot-relay\}"/);
  assert.match(contract, /claude: "\$\{CLAUDE_HOME:-~\/\.claude\}"/);
  assert.match(contract, /codex: "\$\{CODEX_HOME:-~\/\.codex\}"/);
  assert.match(contract, /commonPayloadEntries:/);
  assert.match(contract, /runtimeExposureEntries:/);
  assert.match(contract, /legacyHarnessCorePolicy: remove_when_requested_after_backup/);
});

test('repository layout docs name canonical source, local runtime profile, generated state, and package payload boundaries', async () => {
  const repositoryLayout = await readFile(fromRoot('docs', 'public', 'repository-layout.md'), 'utf8');
  const installerUsage = await readFile(fromRoot('docs', 'public', 'installer-usage.md'), 'utf8');
  const packageReadme = await readFile(fromRoot('package', 'README.md'), 'utf8');
  const combined = `${repositoryLayout}\n${installerUsage}\n${packageReadme}`;

  for (const phrase of ['canonical source', 'local runtime profile', 'generated state', 'package payload']) {
    assert.match(combined, new RegExp(phrase, 'i'), `${phrase} boundary should be documented`);
  }

  assert.match(repositoryLayout, /Do not add new canonical source under root `\.claude\/` or `\.codex\/`/);
  assert.match(repositoryLayout, /do not create or depend on nested `harness-core` directories/i);
  assert.match(packageReadme, /Generated state is never part of the package payload/);
  assert.match(packageReadme, /install-account-root-harness\.mjs/);
  assert.match(packageReadme, /npx -y github:munlucky\/moonshot-relay install/);
  assert.match(installerUsage, /default mode is account-root installation/i);
  assert.match(installerUsage, /npx -y github:munlucky\/moonshot-relay install/);
  assert.match(installerUsage, /~\/\.moonshot-relay/);
  assert.match(installerUsage, /--project/);
  assert.match(repositoryLayout, /Default installs materialize shared Moonshot Relay runtime assets/);
  assert.match(repositoryLayout, /Claude keeps `\.claude\/rules\/`/);
});

test('skills and agents use Moonshot Relay home for shared runtime assets', async () => {
  const runtimeInstructionFiles = [
    ...await listFiles('skills'),
    ...await listFiles('agents'),
  ].filter((file) => /\.(md|sh)$/.test(file));
  const forbiddenSharedRuntimeProfileRef = /(?:^|[^A-Za-z0-9_])\.claude[\\/](?:scripts|schemas|templates|tools|bin)(?:[\\/]|`|"|'|\s|$)/;
  const violations = [];

  for (const file of runtimeInstructionFiles) {
    const content = await readFile(fromRoot(file), 'utf8');
    const lines = content.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (forbiddenSharedRuntimeProfileRef.test(line)) {
        violations.push(`${file}:${index + 1}: ${line.trim()}`);
      }
    });
  }

  assert.deepEqual(
    violations,
    [],
    `Shared runtime assets must be referenced through MOONSHOT_RELAY_HOME, not .claude profile-local paths:\n${violations.join('\n')}`,
  );
});

test('explicit Moonshot Relay script references point at packaged support scripts', async () => {
  const runtimeInstructionFiles = [
    ...await listFiles('skills'),
    ...await listFiles('agents'),
    ...await listFiles(path.join('package', 'profile-templates')),
  ].filter((file) => /\.(md|sh)$/.test(file));
  const explicitScriptRef = /<MOONSHOT_RELAY_HOME>\/(scripts\/[^`"'\s)|*]+)/g;
  const missing = [];

  for (const file of runtimeInstructionFiles) {
    const content = await readFile(fromRoot(file), 'utf8');
    for (const match of content.matchAll(explicitScriptRef)) {
      const sourcePath = match[1];
      if (!existsSync(fromRoot(sourcePath))) {
        missing.push(`${file}: ${sourcePath}`);
      }
    }
  }

  assert.deepEqual(
    missing,
    [],
    `Explicit Moonshot Relay script references must exist in canonical scripts/:\n${missing.join('\n')}`,
  );
});

test('root runtime profiles are local-only and not tracked source', () => {
  const tracked = execFileSync('git', ['ls-files', '.claude', '.codex'], {
    cwd: root,
    encoding: 'utf8',
  }).trim();

  assert.equal(tracked, '', 'root .claude/ and .codex/ must remain local-only and untracked');
});
