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

const generatedStateFragments = [
  '/logs/',
  '/cache/',
  '/traces/',
  '/browser-artifacts/',
  '/browser-runtime/',
  '/tmp/',
  '/memorygraph/',
  '/.local/',
  'runtime-state.sqlite',
  'memory.json',
  'verification-verdict-',
  'runtime-verdict-',
  'browser-flow-verdict-',
  'knowledge-repo-audit-',
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

const assertEntryExists = async (profileRoot, entry) => {
  const target = fromRoot(profileRoot, entry);
  assert.equal(existsSync(target), true, `${profileRoot}/${entry} should exist`);
  assert.ok(await stat(target), `${profileRoot}/${entry} should be stat-able`);
};

test('Claude package payload includes required compatibility and source entries', async () => {
  for (const entry of requiredClaudeEntries) {
    await assertEntryExists(claudeProfile, entry);
  }
});

test('Codex package payload includes required compatibility and source entries', async () => {
  for (const entry of requiredCodexEntries) {
    await assertEntryExists(codexProfile, entry);
  }
});

test('package payloads exclude generated state and local-only artifacts', async () => {
  const files = [
    ...await listFiles('package/claude/profile'),
    ...await listFiles('package/codex/profile'),
  ];

  for (const file of files) {
    for (const fragment of generatedStateFragments) {
      assert.equal(file.includes(fragment), false, `${file} should not include generated state fragment ${fragment}`);
    }
  }
});

test('package materialization contract names generated payload roots and exclusions', async () => {
  const contract = await readFile(fromRoot('package/package-contract.yaml'), 'utf8');
  assert.match(contract, /profileRoot: package\/claude\/profile\//);
  assert.match(contract, /profileRoot: package\/codex\/profile\//);
  assert.match(contract, /\.claude\/logs\/\*\*/);
  assert.match(contract, /\.claude\/runtime-state\.sqlite\*/);
});
