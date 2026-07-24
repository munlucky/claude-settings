import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const wrapper = path.join(repoRoot, 'bin', 'moonshot-relay.mjs');

// A fully sandboxed home so a REAL (non-dry-run) install never touches the
// user's actual account roots.
const sandboxedEnv = (home) => ({
  ...process.env,
  USERPROFILE: home,
  HOME: home,
  MOONSHOT_RELAY_HOME: path.join(home, '.moonshot-relay'),
  MOON_RELAY_KERNEL_HOME: path.join(home, '.moon-relay-kernel'),
  MOON_HARNESS_SWITCHER_HOME: path.join(home, '.moon-harness-switcher'),
  CLAUDE_CONFIG_DIR: path.join(home, '.claude'),
  CODEX_HOME: path.join(home, '.codex'),
  QWEN_HOME: path.join(home, '.qwen'),
  ANTIGRAVITY_HOME: path.join(home, '.gemini', 'antigravity'),
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
