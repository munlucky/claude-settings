import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const scriptPath = path.join(repoRoot, '.claude', 'scripts', 'code-review-graph-stage.mjs');
const isWindows = process.platform === 'win32';

function makeTempRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crg-stage-'));
  spawnSync('git', ['init'], { cwd: dir, stdio: 'ignore' });
  fs.writeFileSync(path.join(dir, 'README.md'), 'test\n');
  spawnSync('git', ['add', 'README.md'], { cwd: dir, stdio: 'ignore' });
  spawnSync('git', ['-c', 'user.email=test@example.com', '-c', 'user.name=Test', 'commit', '-m', 'init'], { cwd: dir, stdio: 'ignore' });
  fs.mkdirSync(path.join(dir, '.claude', 'docs'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.claude', 'docs', 'moonshot-analysis.yaml'), 'analysisContext: {}\n');
  return dir;
}

function writeFakeCrg(dir, body) {
  const bin = path.join(dir, 'bin');
  fs.mkdirSync(bin, { recursive: true });
  if (isWindows) {
    fs.writeFileSync(path.join(bin, 'code-review-graph.cmd'), `@echo off\r\nnode "%~dp0\\fake-crg.cjs" %*\r\n`);
    fs.writeFileSync(path.join(bin, 'fake-crg.cjs'), body);
  } else {
    fs.writeFileSync(path.join(bin, 'code-review-graph'), `#!/usr/bin/env node\n${body}`);
    fs.chmodSync(path.join(bin, 'code-review-graph'), 0o755);
  }
  return bin;
}

function runAdapter(repo, extraArgs = [], env = {}) {
  const result = spawnSync(process.execPath, [
    scriptPath,
    'run',
    '--stage', 'execute',
    '--repo', repo,
    '--base', 'HEAD',
    '--evidence-carrier', 'phase',
    '--analysis-file', '.claude/docs/moonshot-analysis.yaml',
    '--phase-execution-dir', 'execution',
    ...extraArgs,
  ], {
    cwd: repo,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
  return result;
}

test('execute writes adapter artifact atomically and updates analysis cross-check fields', () => {
  const repo = makeTempRepo();
  const bin = writeFakeCrg(repo, `
const args = process.argv.slice(2);
if (args[0] === 'status') {
  console.log(JSON.stringify({ status: 'fresh', nodes: 3, files: 2 }));
  process.exit(0);
}
if (args[0] === 'update') process.exit(0);
process.exit(2);
`);
  const result = runAdapter(repo, [], { PATH: `${bin}${path.delimiter}${process.env.PATH}` });
  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, true);
  assert.equal(fs.existsSync(payload.artifactPath), true);
  assert.equal(fs.existsSync(`${payload.artifactPath}.tmp`), false);
  const analysis = fs.readFileSync(path.join(repo, '.claude', 'docs', 'moonshot-analysis.yaml'), 'utf8');
  assert.match(analysis, /adapterArtifact:/);
  assert.match(analysis, /adapterArtifactDigest:/);
});

test('review uses detect-changes with base instead of legacy detect command', () => {
  const repo = makeTempRepo();
  const seenPath = path.join(repo, 'seen-args.json');
  const bin = writeFakeCrg(repo, `
const fs = require('fs');
const args = process.argv.slice(2);
if (args[0] === 'status') {
  console.log(JSON.stringify({ status: 'fresh', nodes: 3, files: 2 }));
  process.exit(0);
}
if (args[0] === 'detect-changes') {
  fs.writeFileSync(${JSON.stringify(seenPath)}, JSON.stringify(args));
  process.exit(0);
}
process.exit(2);
`);
  const result = runAdapter(repo, ['--stage', 'review'], { PATH: `${bin}${path.delimiter}${process.env.PATH}` });
  assert.equal(result.status, 0, result.stderr);
  const seen = JSON.parse(fs.readFileSync(seenPath, 'utf8'));
  assert.deepEqual(seen, ['detect-changes', '--repo', repo, '--base', 'HEAD', '--brief']);
});

test('empty graph is classified as graph_empty and is not treated as ready', () => {
  const repo = makeTempRepo();
  const bin = writeFakeCrg(repo, `
const args = process.argv.slice(2);
if (args[0] === 'status') {
  console.log(JSON.stringify({ status: 'fresh', nodes: 0, files: 4 }));
  process.exit(0);
}
process.exit(2);
`);
  const result = runAdapter(repo, [], { PATH: `${bin}${path.delimiter}${process.env.PATH}` });
  assert.equal(result.status, 1);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.failureClass, 'tool_unavailable:graph_empty');
});

test('verify fails string-only stageCoverage without adapter artifact cross-check', () => {
  const repo = makeTempRepo();
  fs.writeFileSync(path.join(repo, '.claude', 'docs', 'moonshot-analysis.yaml'), [
    'analysisContext:',
    '  codeReviewGraph:',
    '    stageCoverage: execute',
    '',
  ].join('\n'));
  const result = runAdapter(repo, ['--stage', 'verify'], { PATH: process.env.PATH });
  assert.equal(result.status, 1);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.failureClass, 'tool_unavailable:qa_report_missing');
});

test('finish records persist_summary without invoking code-review-graph', () => {
  const repo = makeTempRepo();
  const result = runAdapter(repo, ['--stage', 'finish'], { PATH: process.env.PATH });
  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.coverage, 'persist_summary');
  assert.equal(fs.existsSync(payload.artifactPath), true);
});
