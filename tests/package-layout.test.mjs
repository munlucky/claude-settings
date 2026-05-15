import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { existsSync, lstatSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const fromRoot = (...segments) => path.join(root, ...segments);

const canonicalDirs = [
  'skills',
  'agents',
  'rules',
  'scripts',
  'schemas',
  'templates',
  'tests',
  'package',
];

const wrapperDirs = ['.claude-plugin', '.codex-plugin'];

const profileDirs = ['package/claude/profile', 'package/codex/profile'];

const generatedStateExclusions = [
  '.claude/logs/**',
  '.claude/cache/**',
  '.claude/traces/**',
  '.claude/browser-artifacts/**',
  '.claude/browser-runtime/**',
  '.claude/tmp/**',
  '.claude/runtime-state.sqlite*',
  '.claude/memory.json',
  '.claude/memorygraph/**',
  '.claude/*verdict*.json',
  '.code-review-graph/**',
];

test('canonical source and package boundary directories exist', () => {
  for (const dir of canonicalDirs) {
    const fullPath = fromRoot(dir);
    assert.equal(existsSync(fullPath), true, `${dir} should exist`);
    assert.equal(lstatSync(fullPath).isDirectory(), true, `${dir} should be a directory`);
  }

  for (const dir of wrapperDirs) {
    const fullPath = fromRoot(dir);
    assert.equal(existsSync(fullPath), true, `${dir} should exist`);
    assert.equal(lstatSync(fullPath).isDirectory(), true, `${dir} should be a directory`);
  }

  for (const dir of profileDirs) {
    const fullPath = fromRoot(dir);
    assert.equal(existsSync(fullPath), true, `${dir} should exist`);
    assert.equal(lstatSync(fullPath).isDirectory(), true, `${dir} should be a directory`);
  }
});

test('package contract declares required source payload entries and generated-state exclusions', async () => {
  const contract = await readFile(fromRoot('package', 'package-contract.yaml'), 'utf8');

  for (const key of ['skills', 'agents', 'rules', 'scripts', 'schemas', 'templates', 'tests', 'publicDocs']) {
    assert.match(contract, new RegExp(`^  ${key}:`, 'm'), `canonicalSource.${key} should be declared`);
  }

  for (const entry of [
    'skills/**',
    'agents/**',
    'rules/**',
    'scripts/**',
    'schemas/**',
    'templates/**',
    'docs/public/**',
    'tests/package-layout.test.mjs',
    '.claude/verification.contract.yaml',
  ]) {
    assert.match(contract, new RegExp(entry.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `${entry} should be listed`);
  }

  for (const exclusion of generatedStateExclusions) {
    assert.match(contract, new RegExp(exclusion.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `${exclusion} should be excluded`);
  }

  assert.match(contract, /symlinkPolicy: avoid_required_symlinks/);
  assert.match(contract, /windowsMaterializationPolicy:/);
  assert.match(contract, /duplicateSourcePolicy:/);
});

test('repository layout docs name canonical source, development profile, generated state, and package payload boundaries', async () => {
  const repositoryLayout = await readFile(fromRoot('docs', 'public', 'repository-layout.md'), 'utf8');
  const packageReadme = await readFile(fromRoot('package', 'README.md'), 'utf8');
  const combined = `${repositoryLayout}\n${packageReadme}`;

  for (const phrase of ['canonical source', 'development profile', 'generated state', 'package payload']) {
    assert.match(combined, new RegExp(phrase, 'i'), `${phrase} boundary should be documented`);
  }

  assert.match(repositoryLayout, /Do not add new canonical source under `\.claude\/`/);
  assert.match(packageReadme, /Generated state is never part of the package payload/);
});
