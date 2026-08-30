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

test('Native Smoke: Native CLI binaries report version; only ENOENT is a skip', async (t) => {
  const cliCommands = [
    { name: process.platform === 'win32' ? 'claude.cmd' : 'claude', surface: 'claude_cli' },
    { name: process.platform === 'win32' ? 'codex.cmd' : 'codex', surface: 'codex_cli' },
    { name: process.platform === 'win32' ? 'qwen.cmd' : 'qwen', surface: 'qwen_cli' },
  ];

  for (const { name } of cliCommands) {
    const lookup = process.platform === 'win32'
      ? spawnSync('where.exe', [name], { encoding: 'utf8', windowsHide: true })
      : null;
    const missing = lookup
      ? lookup.status !== 0 && !lookup.stdout?.trim()
      : false;
    const res = missing
      ? { status: null, error: Object.assign(new Error(`${name} is not installed`), { code: 'ENOENT' }), stdout: '', stderr: '' }
      : process.platform === 'win32'
        ? spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', name, '--version'], { encoding: 'utf8', windowsHide: true })
        : spawnSync(name, ['--version'], { encoding: 'utf8' });
    const providerMissing = missing || res.error?.code === 'ENOENT';
    await t.test(name, { skip: providerMissing ? 'SKIPPED_PROVIDER_NOT_INSTALLED' : false }, () => {
      if (providerMissing) return;
      if (res.error) throw res.error;
      assert.equal(res.status, 0, `${name} --version failed: ${res.stderr || res.stdout || res.signal || 'unknown error'}`);
      assert.ok(`${res.stdout || ''}${res.stderr || ''}`.trim().length > 0, `${name} --version returned no output`);
    });
  }
});
