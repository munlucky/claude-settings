import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

const root = process.cwd();

test('retro CLI help is reachable through package bin', () => {
  const result = spawnSync(process.execPath, ['bin/moonshot-relay.mjs', 'retro', '--help'], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /moonshot-relay retro collect/);
});

test('retro CLI direct help exits successfully', () => {
  const result = spawnSync(process.execPath, ['tools/retro/retro-cli.mjs', '--help'], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /moonshot-relay retro collect/);
});

test('retro CLI runs collect import daily propose and issue-draft flow', async () => {
  const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'retro-cli-state-'));
  const outbox = await mkdtemp(path.join(os.tmpdir(), 'retro-cli-outbox-'));
  const collect = spawnSync(process.execPath, [
    'tools/retro/retro-cli.mjs',
    'collect',
    '--project', 'fixture',
    '--task-id', 'TASK-001',
    '--task-root', 'tests/fixtures/retro/task-full',
    '--date', '2026-07-03',
    '--out', outbox,
    '--json',
  ], { cwd: root, encoding: 'utf8' });
  assert.equal(collect.status, 0, collect.stderr || collect.stdout);
  assert.equal(JSON.parse(collect.stdout).promotionAuthority, false);

  for (const [command, args] of [
    ['import', ['--from', outbox]],
    ['daily', []],
    ['propose', []],
    ['issue-draft', []],
  ]) {
    const result = spawnSync(process.execPath, [
      'tools/retro/retro-cli.mjs',
      command,
      '--project', 'fixture',
      '--date', '2026-07-03',
      '--state-root', stateRoot,
      '--json',
      ...args,
    ], { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 0, `${command}: ${result.stderr || result.stdout}`);
    assert.equal(JSON.parse(result.stdout).promotionAuthority, false);
  }
});
