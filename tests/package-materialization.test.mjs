import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

const root = process.cwd();
const fromRoot = (...segments) => path.join(root, ...segments);

const claudeProfile = 'package/claude/profile/.claude';
const codexProfile = 'package/codex/profile/.codex';

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

const assertEntryExists = async (profileRoot, entry) => {
  const target = fromRoot(profileRoot, entry);
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
  for (const entry of requiredClaudeEntries) {
    await assertEntryExists(claudeProfile, entry);
  }

  for (const entry of requiredConcretePayloadFiles) {
    await assertEntryExists(claudeProfile, entry);
  }
});

test('Codex package payload includes required compatibility and source entries', async () => {
  for (const entry of requiredCodexEntries) {
    await assertEntryExists(codexProfile, entry);
  }

  for (const entry of requiredConcreteCodexFiles) {
    await assertEntryExists(codexProfile, entry);
  }
});

test('excludes runtime state from package payloads and local-only artifacts', async () => {
  const files = [
    ...await listFiles('package/claude/profile'),
    ...await listFiles('package/codex/profile'),
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
  assert.match(contract, /profileRoot: package\/claude\/profile\//);
  assert.match(contract, /profileRoot: package\/codex\/profile\//);
  assert.match(contract, /\.claude\/logs\/\*\*/);
  assert.match(contract, /\.claude\/runtime-state\.sqlite\*/);
  assert.match(contract, /\.code-review-graph\/\*\*/);
});
