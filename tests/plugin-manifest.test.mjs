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

const publicRuntimeSkills = [
  'product-orchestrator',
  'moonshot-orchestrator',
  'moonshot-phase-runner',
  'moonshot-plan-writer',
  'commit-moonshot',
  'session-logger',
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

test('runtime plugin manifests point at package materializers and canonical inputs', async () => {
  const runtimeSurface = await loadJson('package/runtime-surface.json');
  assert.deepEqual(runtimeSurface.publicRuntimeSkills, publicRuntimeSkills);
  assert.equal(runtimeSurface.serviceProfileSkillPolicy, 'allowlist_only');
  assert.equal(runtimeSurface.commonPayloadSkillPolicy, 'preserve_all_canonical_skills');

  for (const manifest of ['.claude-plugin/plugin.json', '.codex-plugin/plugin.json']) {
    const parsed = await loadJson(manifest);
    assert.equal(parsed.source.type, 'materialized-package-profile');
    assert.match(parsed.source.templateRoot, /^package\/profile-templates\/(claude|codex)\/\.(claude|codex)$/);
    assert.equal(parsed.source.materializer, 'package/build-package.mjs');
    assert.match(parsed.source.generatedProfileRoot, /^package\/(claude|codex)\/profile\/\.(claude|codex)$/);
    assert.equal(parsed.payloadAuthority, 'package/build-package.mjs');
    assert.equal(parsed.entriesRole, 'materializer-inputs-only');
    assert.equal(parsed.runtimeSurfaceManifest, 'package/runtime-surface.json');
    assertExistingPath(parsed.source.templateRoot, `${manifest} source.templateRoot`);
    assertExistingPath(parsed.source.materializer, `${manifest} source.materializer`);
    assertExistingPath(parsed.runtimeSurfaceManifest, `${manifest} runtimeSurfaceManifest`);
    assert.equal(parsed.entries.includes('package/runtime-surface.json'), true, `${manifest} entries should include runtime surface manifest`);
    assert.equal(parsed.entries.includes('scripts'), false, `${manifest} entries must not expose broad scripts as consumer payload`);

    for (const entry of parsed.entries) {
      assert.doesNotMatch(entry, /^package\/(claude|codex)\/profile\//, `${entry} should not require committed generated payloads`);
      assertExistingPath(entry, `${manifest} entry`);
    }
  }
});

test('marketplace manifests reference existing plugin manifests and materializers', async () => {
  for (const manifest of ['.claude-plugin/marketplace.json', '.codex-plugin/marketplace.json']) {
    const parsed = await loadJson(manifest);
    assert.ok(Array.isArray(parsed.plugins), `${manifest} should expose plugins[]`);

    for (const plugin of parsed.plugins) {
      assertExistingPath(plugin.manifest, `${manifest} plugin manifest`);
      assertExistingPath(plugin.profileTemplateRoot, `${manifest} profileTemplateRoot`);
      assertExistingPath(plugin.materializer, `${manifest} materializer`);
      assert.equal(plugin.payloadAuthority, 'package/build-package.mjs');
      assert.match(plugin.profileTemplateRoot, /^package\/profile-templates\/(claude|codex)\/\.(claude|codex)$/);
      assert.match(plugin.generatedProfileRoot, /^package\/(claude|codex)\/profile\/\.(claude|codex)$/);
    }
  }
});
