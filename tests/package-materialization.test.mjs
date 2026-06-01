import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises';
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
  'scripts/moonshot-phase-dispatch.mjs',
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

const devOnlyPayloadExclusions = [
  '.claude/scripts/check-mcp.sh',
  '.claude/scripts/harness-surface-inventory.mjs',
  '.claude/scripts/verify-phase-closeout-fixtures.mjs',
  '.claude/scripts/lib/windows-safe-files.mjs',
  '.claude/scripts/lib/phase-attempt-telemetry.mjs',
];

const runtimeStateDenylistExamples = [
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

test('excludes dev-only diagnostics from package payloads', async () => {
  const files = new Set(await listFiles(await claudeProfile(), '.claude'));

  for (const exclusion of devOnlyPayloadExclusions) {
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
  assert.match(contract, /\.claude\/logs\/\*\*/);
  assert.match(contract, /\.claude\/runtime-state\.sqlite\*/);
  assert.match(contract, /\.code-review-graph\/\*\*/);
  assert.match(contract, /excludedDevOnlyPayload:/);
  for (const exclusion of devOnlyPayloadExclusions) {
    assert.match(contract, new RegExp(exclusion.replace(/^\.claude\//, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('generated package profiles are not tracked source files', () => {
  const result = spawnSync('git', ['ls-files', 'package/claude/profile', 'package/codex/profile'], {
    cwd: root,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), '', 'generated package profile files should not be tracked');
});
