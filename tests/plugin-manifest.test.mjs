import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

const root = process.cwd();
const fromRoot = (...segments) => path.join(root, ...segments);

const manifests = [
  '.claude-plugin/plugin.json',
  '.claude-plugin/marketplace.json',
  '.codex-plugin/plugin.json',
  '.codex-plugin/marketplace.json',
];

const loadJson = async (relativePath) => {
  const content = await readFile(fromRoot(relativePath), 'utf8');
  return JSON.parse(content);
};

const assertExistingPath = (relativePath, label) => {
  assert.equal(existsSync(fromRoot(relativePath)), true, `${label} should exist: ${relativePath}`);
};

test('plugin manifests are valid JSON files', async () => {
  for (const manifest of manifests) {
    const parsed = await loadJson(manifest);
    assert.equal(typeof parsed, 'object', `${manifest} should parse as an object`);
  }
});

test('runtime plugin manifests point at generated package payloads', async () => {
  for (const manifest of ['.claude-plugin/plugin.json', '.codex-plugin/plugin.json']) {
    const parsed = await loadJson(manifest);
    assert.match(parsed.source.path, /^package\/(claude|codex)\/profile\//);
    assert.doesNotMatch(parsed.source.path, /^\.claude\/(skills|scripts|templates)/);
    assertExistingPath(parsed.source.path, `${manifest} source.path`);

    for (const entry of parsed.entries) {
      assert.match(entry, /^package\/(claude|codex)\/profile\//, `${entry} should be package-scoped`);
      assertExistingPath(entry, `${manifest} entry`);
    }
  }
});

test('marketplace manifests reference existing plugin manifests and payload roots', async () => {
  for (const manifest of ['.claude-plugin/marketplace.json', '.codex-plugin/marketplace.json']) {
    const parsed = await loadJson(manifest);
    assert.ok(Array.isArray(parsed.plugins), `${manifest} should expose plugins[]`);

    for (const plugin of parsed.plugins) {
      assertExistingPath(plugin.manifest, `${manifest} plugin manifest`);
      assertExistingPath(plugin.profileRoot, `${manifest} profileRoot`);
      assert.match(plugin.profileRoot, /^package\/(claude|codex)\/profile\//);
    }
  }
});
