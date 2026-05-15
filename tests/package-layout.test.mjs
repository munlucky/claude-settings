import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readdir, readFile } from 'node:fs/promises';
import { existsSync, lstatSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const fromRoot = (...segments) => path.join(root, ...segments);

const canonicalDirs = [
  'skills',
  'agents',
  'rules',
  'scripts',
  'bin',
  'tools',
  'schemas',
  'templates',
  'tests',
  'package',
];

const wrapperDirs = ['.claude-plugin', '.codex-plugin'];

const profileDirs = ['package/claude/profile', 'package/codex/profile'];

const canonicalSourceMinimums = new Map([
  ['skills', 10],
  ['agents', 5],
  ['rules', 5],
  ['scripts', 20],
  ['bin', 1],
  ['tools', 5],
  ['schemas', 2],
  ['templates', 5],
]);

const generatedStateExclusions = [
  '.claude/logs/**',
  '.claude/cache/**',
  '.claude/traces/**',
  '.claude/browser-artifacts/**',
  '.claude/browser-runtime/**',
  '.claude/tools/**/node_modules/**',
  '.claude/tmp/**',
  '.claude/runtime-state.sqlite*',
  '.claude/memory.json',
  '.claude/memorygraph/**',
  '.claude/*verdict*.json',
  '.code-review-graph/**',
];

const listFiles = async (relativeDir) => {
  const absoluteDir = fromRoot(relativeDir);
  const entries = await readdir(absoluteDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const relativePath = path.join(relativeDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFiles(relativePath));
    } else {
      files.push(relativePath.replaceAll(path.sep, '/'));
    }
  }

  return files;
};

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

test('canonical source directories contain real harness files, not README-only placeholders', async () => {
  for (const [dir, minimumFileCount] of canonicalSourceMinimums) {
    const files = await listFiles(dir);
    const sourceFiles = files.filter((file) => !file.endsWith('/README.md') && file !== `${dir}/README.md`);

    assert.ok(
      sourceFiles.length >= minimumFileCount,
      `${dir}/ should contain at least ${minimumFileCount} real source files, found ${sourceFiles.length}`,
    );
  }

  assert.equal(existsSync(fromRoot('skills', 'moonshot-phase-runner', 'SKILL.md')), true);
  assert.equal(existsSync(fromRoot('scripts', 'moonshot-phase-dispatch.mjs')), true);
  assert.equal(existsSync(fromRoot('bin', 'browserctl')), true);
  assert.equal(existsSync(fromRoot('tools', 'browserd', 'package.json')), true);
  assert.equal(existsSync(fromRoot('rules', 'workflow.md')), true);
  assert.equal(existsSync(fromRoot('schemas', 'verification.contract.yaml')), true);
  assert.equal(existsSync(fromRoot('templates', 'GOAL_CONTRACT.template.yaml')), true);
});

test('package contract declares required source payload entries and generated-state exclusions', async () => {
  const contract = await readFile(fromRoot('package', 'package-contract.yaml'), 'utf8');

  for (const key of ['skills', 'agents', 'rules', 'scripts', 'bin', 'tools', 'schemas', 'templates', 'tests', 'publicDocs']) {
    assert.match(contract, new RegExp(`^  ${key}:`, 'm'), `canonicalSource.${key} should be declared`);
  }

  for (const entry of [
    'skills/**',
    'agents/**',
    'rules/**',
    'scripts/**',
    'bin/**',
    'tools/**',
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
