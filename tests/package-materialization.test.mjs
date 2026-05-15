import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

const root = process.cwd();
const fromRoot = (...segments) => path.join(root, ...segments);

const canonicalRoots = [
  'skills/',
  'agents/',
  'rules/',
  'scripts/',
  'schemas/',
  'templates/',
  'tests/',
  'docs/public/',
];

const generatedProfileRoots = [
  '.claude/skills/',
  '.claude/agents/',
  '.claude/scripts/',
  '.claude/schemas/',
  '.claude/templates/',
];

const generatedStateExclusions = [
  '.claude/logs/**',
  '.claude/cache/**',
  '.claude/traces/**',
  '.claude/browser-artifacts/**',
  '.claude/browser-runtime/**',
  '.claude/tmp/**',
  '.claude/runtime-state.sqlite*',
  '.claude/memory.json',
  '.claude/memorygraph/**',
  '.claude/*verdict*.json',
  '.claude/knowledge-repo-audit-*.json',
  '.code-review-graph/**',
];

const read = (relativePath) => readFile(fromRoot(relativePath), 'utf8');
const escapePattern = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

test('dev profile documents canonical source and generated state boundaries', async () => {
  const readme = await read('.claude/README.md');
  const claudeToc = await read('.claude/CLAUDE.md');
  const profileContract = await read('.claude/profile-contract.yaml');
  const combined = `${readme}\n${claudeToc}\n${profileContract}`;

  for (const phrase of ['development profile', 'canonical source', 'generated state']) {
    assert.match(combined, new RegExp(phrase, 'i'), `${phrase} should be documented`);
  }

  for (const rootPath of canonicalRoots) {
    assert.match(profileContract, new RegExp(`- ${escapePattern(rootPath)}`), `${rootPath} should be a canonical source root`);
  }

  for (const rootPath of generatedProfileRoots) {
    assert.match(profileContract, new RegExp(`- ${escapePattern(rootPath)}`), `${rootPath} should be a generated profile root`);
  }
});

test('dev profile package contract excludes runtime generated state', async () => {
  const packageContract = await read('package/package-contract.yaml');
  const profileContract = await read('.claude/profile-contract.yaml');
  const combined = `${packageContract}\n${profileContract}`;

  for (const exclusion of generatedStateExclusions) {
    assert.match(combined, new RegExp(escapePattern(exclusion)), `${exclusion} should be excluded from package/profile payloads`);
  }
});

test('dev profile keeps active runtime files and compatibility launchers available', () => {
  for (const relativePath of [
    '.claude/CLAUDE.md',
    '.claude/PROJECT.md',
    '.claude/README.md',
    '.claude/verification.contract.yaml',
    '.claude/profile-contract.yaml',
    '.claude/scripts/moonshot-phase-dispatch.sh',
    '.claude/scripts/workflow-enforcement.sh',
    '.claude/scripts/install-browser-runtime.sh',
  ]) {
    assert.equal(existsSync(fromRoot(relativePath)), true, `${relativePath} should remain available`);
  }
});
