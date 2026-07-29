import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import {
  materializeCodexProfiles, renderCodexProfileToml, resolveCodexProfilePath,
  assertCodexProfileIsolation, CODEX_PROFILE_NAMES, CODEX_PROFILE_SETTINGS,
} from '../scripts/host/kernel/codex-profile-materializer.mjs';

const withTempHome = async (fn) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'kernel-codex-profile-'));
  try { return await fn(dir); } finally { await rm(dir, { recursive: true, force: true }); }
};

test('all four profiles plus the AGENTS contract materialize under the Kernel runtime home', async () => {
  await withTempHome(async (runtimeHome) => {
    const result = await materializeCodexProfiles({ runtimeHome });
    assert.deepEqual(result.written.map((w) => w.profile), [...CODEX_PROFILE_NAMES, 'agents-md']);
    for (const { path: file } of result.written) {
      assert.ok(file.startsWith(path.join(runtimeHome, 'codex')), `profile escaped the runtime home: ${file}`);
      assert.ok((await readFile(file, 'utf8')).length > 0);
    }
  });
});

test('AGENTS.md materialization can be opted out of', async () => {
  await withTempHome(async (runtimeHome) => {
    const result = await materializeCodexProfiles({ runtimeHome, includeAgentsMd: false });
    assert.deepEqual(result.written.map((w) => w.profile), [...CODEX_PROFILE_NAMES]);
  });
});

test('the materialized AGENTS.md matches the packaged reference', async () => {
  await withTempHome(async (runtimeHome) => {
    await materializeCodexProfiles({ runtimeHome });
    const materialized = await readFile(path.join(runtimeHome, 'codex', 'AGENTS.md'), 'utf8');
    const packaged = await readFile('package/profile-templates/codex/AGENTS.md', 'utf8');
    assert.equal(materialized, packaged);
  });
});

test('each profile is a separate overlay file, not a nested [profiles.*] block', async () => {
  for (const profile of CODEX_PROFILE_NAMES) {
    const toml = renderCodexProfileToml(profile);
    assert.doesNotMatch(toml, /\[profiles\./, `${profile} uses a nested profiles table`);
    assert.match(toml, /^model = /m);
  }
  await withTempHome(async (runtimeHome) => {
    assert.match(resolveCodexProfilePath('plan', { runtimeHome }), /plan\.config\.toml$/);
    assert.match(resolveCodexProfilePath('review', { runtimeHome }), /review\.config\.toml$/);
    assert.match(resolveCodexProfilePath('batch', { runtimeHome }), /batch\.config\.toml$/);
    assert.match(resolveCodexProfilePath('default', { runtimeHome }), /[\\/]config\.toml$/);
  });
});

test('the profile settings match the declared routing policy', () => {
  assert.equal(CODEX_PROFILE_SETTINGS.default.model, 'gpt-5.6-terra');
  assert.equal(CODEX_PROFILE_SETTINGS.default.model_reasoning_effort, 'medium');
  assert.equal(CODEX_PROFILE_SETTINGS.plan.model, 'gpt-5.6-sol');
  assert.equal(CODEX_PROFILE_SETTINGS.plan.model_reasoning_effort, 'high');
  assert.equal(CODEX_PROFILE_SETTINGS.review.model_reasoning_effort, 'xhigh');
  assert.equal(CODEX_PROFILE_SETTINGS.batch.model, 'gpt-5.6-luna');
  assert.equal(CODEX_PROFILE_SETTINGS.batch.model_reasoning_effort, 'low');
});

test('the review profile is read-only so the reviewer cannot edit what it judges', () => {
  assert.equal(CODEX_PROFILE_SETTINGS.review.sandbox_mode, 'read-only');
  assert.match(renderCodexProfileToml('review'), /sandbox_mode = "read-only"/);
});

test('no profile enables workspace network access', () => {
  for (const profile of CODEX_PROFILE_NAMES) {
    assert.match(renderCodexProfileToml(profile), /\[sandbox_workspace_write\]\nnetwork_access = false/);
  }
});

test('materializing into the user global Codex home is refused', () => {
  const userHome = path.join(os.tmpdir(), 'fake-user', '.codex');
  assert.throws(
    () => assertCodexProfileIsolation(path.join(userHome, 'config.toml'), { userCodexHome: userHome }),
    /must not be materialized inside the user global Codex home/,
  );
  assert.equal(assertCodexProfileIsolation(path.join(os.tmpdir(), 'kernel-home', 'codex', 'config.toml'), { userCodexHome: userHome }), true);
});

test('an unknown profile name is refused rather than rendered empty', () => {
  assert.throws(() => renderCodexProfileToml('turbo'), /Unknown Codex profile/);
  assert.throws(() => resolveCodexProfilePath('turbo'), /Unknown Codex profile/);
});

test('the packaged templates match what the materializer renders', async () => {
  const file = { default: 'config.toml', plan: 'plan.config.toml', review: 'review.config.toml', batch: 'batch.config.toml' };
  for (const profile of CODEX_PROFILE_NAMES) {
    const packaged = await readFile(`package/profile-templates/codex/${file[profile]}`, 'utf8');
    assert.equal(packaged, renderCodexProfileToml(profile), `${file[profile]} has drifted from the materializer`);
  }
});
