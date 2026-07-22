import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import {
  hydrateKernelProject,
  inspectKernelProject,
  unhydrateKernelProject,
} from '../scripts/kernel/project-hydrate.mjs';

const sourceRoot = path.resolve(process.cwd());
async function makeTempDir() {
  return await mkdtemp(path.join(os.tmpdir(), 'kernel-proj-test-'));
}

test('hydrateKernelProject creates valid Kernel project structure and inspects ready', async () => {
  const projectRoot = await makeTempDir();
  try {
    const result = await hydrateKernelProject({ projectRoot, sourceRoot });
    assert.equal(result.status, 'hydrated');
    assert.ok(result.manifestPath);

    const inspect = await inspectKernelProject({ projectRoot });
    assert.equal(inspect.status, 'ready');

    const trackContent = await readFile(path.join(projectRoot, '.moon-relay', 'track.yaml'), 'utf8');
    assert.match(trackContent, /^track:\s*kernel$/m);

    const skillContent = await readFile(path.join(projectRoot, '.agents', 'skills', 'moon-relay-kernel', 'SKILL.md'), 'utf8');
    assert.ok(skillContent.length > 0);

    const configContent = await readFile(path.join(projectRoot, '.codex', 'config.toml'), 'utf8');
    assert.ok(configContent.length > 0);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('hydrateKernelProject refuses existing Relay track marker', async () => {
  const projectRoot = await makeTempDir();
  try {
    await mkdir(path.join(projectRoot, '.moon-relay'), { recursive: true });
    await writeFile(path.join(projectRoot, '.moon-relay', 'track.yaml'), 'schemaVersion: 1\ntrack: relay\n', 'utf8');

    await assert.rejects(
      async () => hydrateKernelProject({ projectRoot, sourceRoot }),
      /protected|relay/i
    );
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('inspectKernelProject detects modified owned file as drift', async () => {
  const projectRoot = await makeTempDir();
  try {
    await hydrateKernelProject({ projectRoot, sourceRoot });
    const overrideFile = path.join(projectRoot, 'AGENTS.override.md');
    await writeFile(overrideFile, '# modified by user\n', 'utf8');

    const inspect = await inspectKernelProject({ projectRoot });
    assert.equal(inspect.status, 'drift');

    const unhydrate = await unhydrateKernelProject({ projectRoot });
    assert.equal(unhydrate.status, 'collision');
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('unhydrateKernelProject removes manifest-owned files and leaves user files', async () => {
  const projectRoot = await makeTempDir();
  try {
    await hydrateKernelProject({ projectRoot, sourceRoot });
    await writeFile(path.join(projectRoot, 'user-file.txt'), 'hello', 'utf8');

    const unhydrate = await unhydrateKernelProject({ projectRoot });
    assert.equal(unhydrate.status, 'unhydrated');

    const inspect = await inspectKernelProject({ projectRoot });
    assert.equal(inspect.status, 'not_hydrated');

    const userFileExists = await readFile(path.join(projectRoot, 'user-file.txt'), 'utf8');
    assert.equal(userFileExists, 'hello');
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});
