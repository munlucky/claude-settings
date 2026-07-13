import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';

import {
  PortableCommandError,
  parsePortableCommandChain,
  resolvePortableCommand,
} from '../scripts/lib/portable-command-runner.mjs';

const tempRoots = [];
after(async () => Promise.all(tempRoots.map((root) => rm(root, { recursive: true, force: true }))));

const makeWindowsNode = async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'moonshot-portable-node-'));
  tempRoots.push(root);
  await mkdir(path.join(root, 'node_modules', 'npm', 'bin'), { recursive: true });
  await writeFile(path.join(root, 'node.exe'), 'fixture');
  await writeFile(path.join(root, 'npm.cmd'), '@echo off\r\n');
  await writeFile(path.join(root, 'node_modules', 'npm', 'bin', 'npm-cli.js'), 'export {};\n');
  await writeFile(path.join(root, 'node_modules', 'npm', 'package.json'), JSON.stringify({
    name: 'npm',
    bin: { npm: 'bin/npm-cli.js' },
  }));
  return root;
};

test('portable command parser permits argv chains but rejects shell metacharacters', () => {
  assert.deepEqual(parsePortableCommandChain('npm test && node "script file.mjs"'), [
    ['npm', 'test'],
    ['node', 'script file.mjs'],
  ]);
  assert.throws(
    () => parsePortableCommandChain('npm test | more'),
    (error) => error instanceof PortableCommandError && error.code === 'PORTABLE_COMMAND_METACHAR_REJECTED',
  );
});

test('Windows npm resolves to the selected Node installation without a shell', async () => {
  const root = await makeWindowsNode();
  const resolved = resolvePortableCommand(['npm', 'test'], {
    platform: 'win32',
    execPath: path.join(root, 'node.exe'),
    env: { PATH: root },
  });
  assert.equal(resolved.executable, path.join(root, 'node.exe'));
  assert.equal(resolved.npmCli, path.join(root, 'node_modules', 'npm', 'bin', 'npm-cli.js'));
  assert.deepEqual(resolved.args.slice(-1), ['test']);
  assert.equal(resolved.shell, false);
});

test('external npm_execpath is ignored in favor of the trusted local npm', async () => {
  const root = await makeWindowsNode();
  const external = path.join(await mkdtemp(path.join(os.tmpdir(), 'moonshot-external-npm-')), 'npm-cli.js');
  tempRoots.push(path.dirname(external));
  await writeFile(external, 'export {};\n');
  const resolved = resolvePortableCommand(['npm', 'test'], {
    platform: 'win32',
    execPath: path.join(root, 'node.exe'),
    env: { PATH: root, npm_execpath: external },
  });
  assert.equal(resolved.npmCli, path.join(root, 'node_modules', 'npm', 'bin', 'npm-cli.js'));
});

test('explicit batch launchers stay forbidden', () => {
  assert.throws(
    () => resolvePortableCommand(['npm.cmd', 'test'], { platform: 'win32' }),
    (error) => error instanceof PortableCommandError && error.code === 'PORTABLE_BATCH_LAUNCHER_REJECTED',
  );
});
