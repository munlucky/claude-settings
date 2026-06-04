import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { after, test } from 'node:test';

const root = process.cwd();
const fromRoot = (...segments) => path.join(root, ...segments);

let materializedRoot = null;

const materializePackage = async () => {
  if (materializedRoot) {
    return materializedRoot;
  }

  materializedRoot = await mkdtemp(path.join(os.tmpdir(), 'moonshot-relay-package-'));
  const result = spawnSync(process.execPath, [
    'package/build-package.mjs',
    '--runtime',
    'all',
    '--out',
    materializedRoot,
    '--clean',
    '--json',
  ], {
    cwd: root,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  return materializedRoot;
};

const claudeProfile = async () => path.join(await materializePackage(), 'claude', 'profile', '.claude');
const codexProfile = async () => path.join(await materializePackage(), 'codex', 'profile', '.codex');

after(async () => {
  if (materializedRoot) {
    await rm(materializedRoot, { recursive: true, force: true });
  }
});

const requiredClaudeEntries = [
  'CLAUDE.md',
  'PROJECT.md',
  'README.md',
  'verification.contract.yaml',
  'profile-contract.yaml',
  'skills',
  'agents',
  'rules',
  'scripts',
  'bin',
  'tools/browserd',
  'schemas',
  'templates',
  'docs/public',
];

const requiredCodexEntries = [
  'AGENTS.md',
  'README.md',
  'verification.contract.yaml',
  'config.toml',
  'skills',
  'agents',
  'docs/public',
];

const requiredConcretePayloadFiles = [
  'skills/moonshot-phase-runner/SKILL.md',
  'skills/moonshot-plan-writer/SKILL.md',
  'agents/phase-attempt-agent.md',
  'rules/workflow.md',
  'scripts/install-browser-runtime.sh',
  'scripts/memorygraph-mcp-wrapper.js',
  'scripts/memorygraph-mcp-wrapper.mjs',
  'scripts/code-review-graph-mcp-wrapper.js',
  'scripts/commit-moonshot-memory-refresh.mjs',
  'scripts/lib/runtime-state-root.mjs',
  'scripts/verification-verdict-state.mjs',
  'bin/browserctl',
  'tools/browserd/package.json',
  'tools/browserd/server.mjs',
  'schemas/verification.contract.yaml',
  'templates/GOAL_CONTRACT.template.yaml',
];

const requiredConcreteCodexFiles = [
  'skills/moonshot-phase-runner/SKILL.md',
  'skills/moonshot-plan-writer/SKILL.md',
  'agents/phase-attempt-agent.md',
];

const generatedStateFragments = [
  '.moonshot-relay/',
  '.moonshot-state/',
  '.claude/state/',
  '/logs/',
  '/cache/',
  '/traces/',
  '/browser-artifacts/',
  '/browser-runtime/',
  '/scripts/fixtures/',
  'fixtures',
  '/node_modules/',
  '/tmp/',
  '/memorygraph/',
  '/.local/',
  'runtime-state.sqlite',
  'memory.json',
  'verification-verdict-',
  'runtime-verdict-',
  'browser-flow-verdict-',
  'knowledge-repo-audit-',
  '.code-review-graph/',
  '.test.mjs',
  '.e2e.test.mjs',
  '_test.py',
  '.test.py',
];

const obsoleteWorkflowScriptExclusions = [
  '.claude/archive/scripts/legacy-phase-adapters/agent-loop.mjs',
  '.claude/archive/scripts/legacy-phase-adapters/verify-code-policy.mjs',
  '.claude/scripts/check-mcp.sh',
  '.claude/scripts/harness-surface-inventory.mjs',
  '.claude/scripts/verify-phase-closeout-fixtures.mjs',
  '.claude/scripts/lib/windows-safe-files.mjs',
  '.claude/scripts/lib/phase-attempt-telemetry.mjs',
  '.claude/scripts/moonshot-phase-dispatch.mjs',
  '.claude/scripts/moonshot-phase-dispatch.sh',
  '.claude/scripts/agent-loop.sh',
  '.claude/scripts/harness-prepare-worktree.sh',
  '.claude/scripts/verify-phase-runner-boundary.sh',
  '.claude/scripts/verification-agent-run.mjs',
];

const runtimeStateDenylistExamples = [
  '.moonshot-relay/logs/agent-loop/run.log',
  '.moonshot-relay/cache/code-review-graph-native-mcp-cache.json',
  '.moonshot-relay/traces/self-test/agent_work_trace.jsonl',
  '.moonshot-relay/browser-artifacts/session/output.json',
  '.moonshot-relay/memorygraph/memory.db',
  '.moonshot-relay/runtime-state.sqlite',
  '.moonshot-state/logs/agent-loop/run.log',
  '.moonshot-state/cache/code-review-graph-native-mcp-cache.json',
  '.moonshot-state/traces/self-test/agent_work_trace.jsonl',
  '.moonshot-state/browser-artifacts/session/output.json',
  '.moonshot-state/memorygraph/memory.db',
  '.moonshot-state/runtime-state.sqlite',
  '.claude/tools/browserd/node_modules/playwright/package.json',
  '.claude/state/runtime-state.sqlite',
  '.claude/logs/agent-loop/run.log',
  '.claude/cache/memorygraph/memory_update_candidates.jsonl',
  '.claude/traces/self-test/agent_work_trace.jsonl',
  '.claude/browser-artifacts/session/output.json',
  '.claude/browser-runtime/profile/lock',
  '.claude/memorygraph/memory.db',
  '.claude/runtime-state.sqlite-wal',
  '.claude/verification-verdict-phase05-final.json',
  '.claude/knowledge-repo-audit-20260515.json',
  '.claude/memory.json',
  '.code-review-graph/index.sqlite',
];

const rootVerdictFragments = new Set([
  'verification-verdict-',
  'runtime-verdict-',
  'browser-flow-verdict-',
  'knowledge-repo-audit-',
]);

const listFiles = async (absoluteDir, prefix = '') => {
  const entries = await readdir(absoluteDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const relativePath = path.join(prefix, entry.name);
    const absolutePath = path.join(absoluteDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFiles(absolutePath, relativePath));
    } else {
      files.push(relativePath.replaceAll(path.sep, '/'));
    }
  }

  return files;
};

const assertEntryExists = async (profileRoot, entry) => {
  const target = path.join(profileRoot, entry);
  assert.equal(existsSync(target), true, `${profileRoot}/${entry} should exist`);
  assert.ok(await stat(target), `${profileRoot}/${entry} should be stat-able`);
};

const matchesGeneratedStateFragment = (file, fragment) => {
  if (rootVerdictFragments.has(fragment)) {
    return new RegExp(`(?:^|/)\\.claude/${fragment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(file);
  }

  return file.includes(fragment);
};

test('Claude package payload includes required compatibility and source entries', async () => {
  const profileRoot = await claudeProfile();
  for (const entry of requiredClaudeEntries) {
    await assertEntryExists(profileRoot, entry);
  }

  for (const entry of requiredConcretePayloadFiles) {
    await assertEntryExists(profileRoot, entry);
  }
});

test('Codex package payload includes required compatibility and source entries', async () => {
  const profileRoot = await codexProfile();
  for (const entry of requiredCodexEntries) {
    await assertEntryExists(profileRoot, entry);
  }

  for (const entry of requiredConcreteCodexFiles) {
    await assertEntryExists(profileRoot, entry);
  }
});

test('excludes runtime state from package payloads and local-only artifacts', async () => {
  const files = [
    ...await listFiles(await claudeProfile(), '.claude'),
    ...await listFiles(await codexProfile(), '.codex'),
  ];

  for (const file of files) {
    for (const fragment of generatedStateFragments) {
      assert.equal(
        matchesGeneratedStateFragment(file, fragment),
        false,
        `${file} should not include generated state fragment ${fragment}`,
      );
    }
  }
});

test('excludes archived legacy and obsolete workflow scripts from Claude package payload', async () => {
  const files = new Set(await listFiles(await claudeProfile(), '.claude'));

  for (const exclusion of obsoleteWorkflowScriptExclusions) {
    assert.equal(files.has(exclusion), false, `${exclusion} should not be installed in the Claude payload`);
  }
});

test('excludes runtime state roots from package materialization denylist', () => {
  for (const file of runtimeStateDenylistExamples) {
    assert.equal(
      generatedStateFragments.some((fragment) => matchesGeneratedStateFragment(file, fragment)),
      true,
      `${file} should match generated runtime state denylist`,
    );
  }
});

test('package materialization contract names generated payload roots and exclusions', async () => {
  const contract = await readFile(fromRoot('package/package-contract.yaml'), 'utf8');
  assert.match(contract, /templateRoot: package\/profile-templates\/claude\/\.claude\//);
  assert.match(contract, /templateRoot: package\/profile-templates\/codex\/\.codex\//);
  assert.match(contract, /generatedProfileRoot: package\/claude\/profile\/\.claude\//);
  assert.match(contract, /generatedProfileRoot: package\/codex\/profile\/\.codex\//);
  assert.match(contract, /materializer: package\/build-package\.mjs/);
  assert.match(contract, /claudeSupportScripts:/);
  assert.match(contract, /archivedLegacyScripts:/);
  assert.match(contract, /archive\/scripts\/legacy-phase-adapters\//);
  assert.doesNotMatch(contract, /source: scripts\/\*\*/);
  assert.match(contract, /\.claude\/logs\/\*\*/);
  assert.match(contract, /\.claude\/runtime-state\.sqlite\*/);
  assert.match(contract, /\.code-review-graph\/\*\*/);
  assert.doesNotMatch(contract, /excludedDevOnlyPayload:/);
});

test('generated package profiles are not tracked source files', () => {
  const result = spawnSync('git', ['ls-files', 'package/claude/profile', 'package/codex/profile'], {
    cwd: root,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), '', 'generated package profile files should not be tracked');
});

test('account-root installer merges shared directories without deleting unrelated skills', async () => {
  const installRoot = await mkdtemp(path.join(os.tmpdir(), 'moonshot-relay-account-root-install-'));
  const moonshotHome = path.join(installRoot, 'moonshot-home');
  const claudeHome = path.join(installRoot, 'claude-home');
  const codexHome = path.join(installRoot, 'codex-home');

  await mkdir(path.join(codexHome, 'skills', 'external-skill'), { recursive: true });
  await writeFile(path.join(codexHome, 'skills', 'external-skill', 'SKILL.md'), 'external\n');
  await writeFile(path.join(codexHome, 'skills', 'moonshot-decide-sequence'), 'legacy file collision\n');
  await mkdir(path.join(codexHome, 'schemas'), { recursive: true });
  await writeFile(path.join(codexHome, 'schemas', 'old-managed.schema.json'), '{}\n');
  await writeFile(path.join(codexHome, '.moonshot-relay-install-manifest.json'), `${JSON.stringify({
    copied: [{ path: 'schemas/old-managed.schema.json' }],
  })}\n`);
  await mkdir(path.join(claudeHome, 'skills', 'external-skill'), { recursive: true });
  await writeFile(path.join(claudeHome, 'skills', 'external-skill', 'SKILL.md'), 'external\n');
  await mkdir(path.join(claudeHome, 'scripts'), { recursive: true });
  await writeFile(path.join(claudeHome, 'scripts', 'old-managed.mjs'), 'old\n');
  await writeFile(path.join(claudeHome, '.moonshot-relay-install-manifest.json'), `${JSON.stringify({
    copied: [{ path: 'scripts/old-managed.mjs' }],
  })}\n`);

  try {
    const result = spawnSync(process.execPath, [
      'scripts/install-account-root-harness.mjs',
      '--runtime',
      'all',
      '--source-root',
      root,
      '--moonshot-home',
      moonshotHome,
      '--claude-home',
      claudeHome,
      '--codex-home',
      codexHome,
      '--remove-legacy-harness-core',
    ], {
      cwd: root,
      encoding: 'utf8',
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(existsSync(path.join(codexHome, 'skills', 'external-skill', 'SKILL.md')), true);
    assert.equal(existsSync(path.join(claudeHome, 'skills', 'external-skill', 'SKILL.md')), true);
    assert.equal(existsSync(path.join(codexHome, 'skills', 'moonshot-decide-sequence', 'SKILL.md')), true);
    assert.equal(existsSync(path.join(claudeHome, 'rules', 'workflow.md')), true);
    assert.equal(existsSync(path.join(moonshotHome, 'scripts', 'install-account-root-harness.mjs')), true);
    assert.equal(existsSync(path.join(moonshotHome, 'templates', 'GOAL_CONTRACT.template.yaml')), true);
    assert.equal(existsSync(path.join(claudeHome, 'scripts')), false);
    assert.equal(existsSync(path.join(codexHome, 'scripts')), false);
    assert.equal(existsSync(path.join(codexHome, 'schemas')), false);
  } finally {
    await rm(installRoot, { recursive: true, force: true });
  }
});
