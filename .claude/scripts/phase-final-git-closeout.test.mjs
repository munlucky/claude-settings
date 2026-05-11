import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const scriptPath = fileURLToPath(new URL('./phase-final-git-closeout.mjs', import.meta.url));

test('assert-clean exits 2 when repository has stageable dirty entries', (t) => {
  if (!canSpawnGit()) {
    t.skip('git spawn unavailable');
    return;
  }
  withGitFixture((repo) => {
    fs.writeFileSync(path.join(repo, 'dirty.txt'), 'dirty\n', 'utf8');

    const result = runNode(['assert-clean', '--json'], repo);
    const payload = JSON.parse(result.stdout);

    assert.equal(result.status, 2);
    assert.equal(payload.clean, false);
    assert.equal(payload.issues.some((issue) => issue.type === 'main_worktree_dirty'), true);
  });
});

test('assert-clean exits 0 when repository is clean', (t) => {
  if (!canSpawnGit()) {
    t.skip('git spawn unavailable');
    return;
  }
  withGitFixture((repo) => {
    const result = runNode(['assert-clean', '--json'], repo);
    const payload = JSON.parse(result.stdout);

    assert.equal(result.status, 0);
    assert.equal(payload.clean, true);
    assert.deepEqual(payload.issues, []);
  });
});

function withGitFixture(callback) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-final-git-closeout-test-'));
  try {
    const repo = path.join(root, 'repo');
    fs.mkdirSync(repo, { recursive: true });
    runRequired('git', ['init'], repo);
    runRequired('git', ['config', 'user.email', 'phase-final-closeout@example.invalid'], repo);
    runRequired('git', ['config', 'user.name', 'Phase Final Closeout Test'], repo);
    fs.writeFileSync(path.join(repo, 'README.md'), '# fixture\n', 'utf8');
    runRequired('git', ['add', 'README.md'], repo);
    runRequired('git', ['commit', '-m', 'fixture'], repo);
    callback(repo);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function runNode(args, cwd) {
  return spawnSync(process.execPath, [scriptPath, ...args], { cwd, encoding: 'utf8' });
}

function canSpawnGit() {
  const result = spawnSync('git', ['--version'], { encoding: 'utf8' });
  return result.status === 0 && !result.error;
}

function runRequired(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' });
  if (result.status !== 0 || result.error) {
    throw new Error(result.error?.message || result.stderr || result.stdout || `${command} failed`);
  }
  return result.stdout.trim();
}
