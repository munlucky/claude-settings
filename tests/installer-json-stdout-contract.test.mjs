import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { existsSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const wrapper = path.join(repoRoot, 'bin', 'moonshot-relay.mjs');
const kernelCli = path.join(repoRoot, 'bin', 'moon-relay-kernel.mjs');

// A fully sandboxed home so a REAL (non-dry-run) install never touches the
// user's actual account roots.
const sandboxedEnv = (home) => ({
  ...process.env,
  USERPROFILE: realpathSync(home),
  HOME: realpathSync(home),
  MOONSHOT_RELAY_HOME: path.join(realpathSync(home), '.moonshot-relay'),
  MOON_RELAY_KERNEL_HOME: path.join(realpathSync(home), '.moon-relay-kernel'),
  MOON_HARNESS_SWITCHER_HOME: path.join(realpathSync(home), '.moon-harness-switcher'),
  CLAUDE_CONFIG_DIR: path.join(realpathSync(home), '.claude'),
  CODEX_HOME: path.join(realpathSync(home), '.codex'),
  QWEN_HOME: path.join(realpathSync(home), '.qwen'),
  ANTIGRAVITY_HOME: path.join(realpathSync(home), '.gemini', 'antigravity'),
});

test('install --json emits a single parseable JSON document on stdout (real install, chaining active)', async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'mr-json-stdout-'));
  try {
    const result = spawnSync(process.execPath, [wrapper, 'install', '--runtime', 'all', '--json'], {
      cwd: repoRoot,
      env: sandboxedEnv(home),
      encoding: 'utf8',
      timeout: 240000,
    });
    assert.equal(result.status, 0, result.stderr);

    // The whole of stdout must parse as one JSON object — the chained kernel
    // install / switcher adopt logs must have gone to stderr, not stdout.
    let parsed;
    assert.doesNotThrow(() => { parsed = JSON.parse(result.stdout); }, `stdout was not pure JSON:\n${result.stdout.slice(0, 400)}`);
    assert.equal(parsed.dryRun, false);
    assert.ok(Array.isArray(parsed.manifests) && parsed.manifests.length > 0);
    // The chaining did run (non-dry-run) — its human output belongs on stderr.
    assert.match(result.stderr, /kernel|switcher|adopt|install/i);

    const identity = spawnSync(process.execPath, [
      kernelCli,
      'identity',
      'status',
      '--project-root',
      repoRoot,
      '--runtime-home',
      path.join(home, '.moon-relay-kernel'),
      '--json',
    ], {
      cwd: repoRoot,
      env: { ...sandboxedEnv(home), MOON_RELAY_TRACK: 'kernel' },
      encoding: 'utf8',
    });
    assert.equal(identity.status, 0, identity.stderr);
    assert.equal(JSON.parse(identity.stdout).status, 'ready');
    const accountHome = realpathSync(home);
    assert.equal(existsSync(path.join(accountHome, '.codex', '.moonshot-relay-install-manifest.json')), true);
    assert.equal(existsSync(path.join(accountHome, '.moon-relay-kernel', '.moon-relay', 'install-manifest.json')), true);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test('install --dry-run --json is also pure JSON (no chaining)', async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'mr-json-dry-'));
  try {
    const result = spawnSync(process.execPath, [wrapper, 'install', '--runtime', 'all', '--dry-run', '--json'], {
      cwd: repoRoot,
      env: sandboxedEnv(home),
      encoding: 'utf8',
      timeout: 120000,
    });
    assert.equal(result.status, 0, result.stderr);
    let parsed;
    assert.doesNotThrow(() => { parsed = JSON.parse(result.stdout); });
    assert.equal(parsed.dryRun, true);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test('setup refuses a symlinked Kernel home before the primary installer or adoption', async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'mr-symlink-kernel-home-'));
  const realKernel = path.join(home, 'kernel-real');
  const aliasKernel = path.join(home, 'kernel-alias');
  await mkdir(realKernel, { recursive: true });
  try {
    try {
      await symlink(realKernel, aliasKernel, process.platform === 'win32' ? 'junction' : 'dir');
    } catch (error) {
      if (process.platform === 'win32' && error.code === 'EPERM') return;
      throw error;
    }
    const result = spawnSync(process.execPath, [wrapper, 'install', '--dry-run', '--json'], {
      cwd: repoRoot,
      env: { ...sandboxedEnv(home), MOON_RELAY_KERNEL_HOME: aliasKernel },
      encoding: 'utf8',
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /unsafe Kernel home/i);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
