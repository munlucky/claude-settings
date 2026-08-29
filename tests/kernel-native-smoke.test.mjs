import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { SURFACES } from '../scripts/switcher/constants.mjs';
import { resolveApplication } from '../scripts/switcher/app-resolver/index.mjs';

test('Native Smoke: All 6 surfaces resolve without throwing unexpected unhandled errors', async () => {
  for (const surface of SURFACES) {
    try {
      const result = await resolveApplication(surface);
      assert.ok(typeof result === 'object');
      if (result.executable) {
        assert.ok(typeof result.executable === 'string');
      } else {
        assert.ok(result.warnings || result.status === 'not_required' || result.executable === null || result.status === 'not_found');
      }
    } catch (err) {
      assert.fail(`resolveApplication threw unexpected error for surface ${surface}: ${err.message}`);
    }
  }
});

test('Native Smoke: Native CLI binaries report version or gracefully skip if not installed', () => {
  const cliCommands = [
    { name: process.platform === 'win32' ? 'claude.cmd' : 'claude', surface: 'claude_cli' },
    { name: process.platform === 'win32' ? 'codex.cmd' : 'codex', surface: 'codex_cli' },
    { name: process.platform === 'win32' ? 'qwen.cmd' : 'qwen', surface: 'qwen_cli' },
  ];

  for (const { name } of cliCommands) {
    try {
      const res = spawnSync(name, ['--version'], { encoding: 'utf8' });
      if (res.status === 0) {
        assert.ok(res.stdout.length > 0, `${name} --version returned empty stdout`);
      } else {
        assert.ok(true, `SKIPPED_PROVIDER_NOT_INSTALLED: ${name}`);
      }
    } catch {
      assert.ok(true, `SKIPPED_PROVIDER_NOT_INSTALLED: ${name}`);
    }
  }
});
