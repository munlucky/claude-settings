#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

function usage() {
  return [
    'Usage:',
    '  search-helper.mjs <pattern> [dir ...]',
    '',
    'Runs rg as: rg <pattern> <dir ...>.',
    'Do not pass shell globs such as src\\*.ts; pass the directory instead.',
  ].join('\n');
}

function containsGlob(value) {
  return /[*?[\]{}]/.test(String(value || ''));
}

function runSearch(pattern, dirs = [], options = {}) {
  if (!pattern) {
    throw new Error('Missing search pattern');
  }
  for (const dir of dirs) {
    if (containsGlob(dir)) {
      throw new Error(`Glob path is not supported: ${dir}. Use "rg pattern dir" form.`);
    }
  }
  const targets = dirs.length > 0 ? dirs : ['.'];
  return spawnSync(options.rg || 'rg', [pattern, ...targets], {
    cwd: options.cwd || process.cwd(),
    encoding: 'utf8',
  });
}

function selfTest() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'search-helper-'));
  try {
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', 'a.ts'), 'needle\n', 'utf8');
    assert.throws(() => runSearch('needle', ['src\\*.ts'], { cwd: root }), /Glob path is not supported/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function main() {
  const [first, ...rest] = process.argv.slice(2);
  if (first === 'self-test') {
    selfTest();
    console.log('search-helper self-test passed');
    return;
  }
  if (!first || first === '--help' || first === '-h') {
    console.error(usage());
    process.exit(first ? 0 : 64);
  }
  const result = runSearch(first, rest);
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  process.exit(result.status ?? 0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main();
}
