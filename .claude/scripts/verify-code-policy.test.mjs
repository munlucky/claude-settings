import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const POLICY_SCRIPT = path.join(SCRIPT_DIR, 'verify-code-policy.mjs');
const TRACE_PATH = '.claude/.claude/traces/self-test/agent_work_trace.jsonl';

test('tracked forbidden trace artifacts fail code policy', () => {
  withGitFixture((repoRoot) => {
    writeTraceArtifact(repoRoot);
    git(repoRoot, ['add', TRACE_PATH]);
    git(repoRoot, ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'seed trace artifact']);

    const result = runPolicy(repoRoot);

    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /\[forbidden-trace-path\]/);
  });
});

test('staged deletion of forbidden trace artifacts is allowed', () => {
  withGitFixture((repoRoot) => {
    writeTraceArtifact(repoRoot);
    git(repoRoot, ['add', TRACE_PATH]);
    git(repoRoot, ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'seed trace artifact']);
    git(repoRoot, ['rm', TRACE_PATH]);

    const result = runPolicy(repoRoot);

    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.doesNotMatch(result.stdout, /\[forbidden-trace-path\]/);
  });
});

function withGitFixture(callback) {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'code-policy-git-'));
  try {
    git(repoRoot, ['init']);
    callback(repoRoot);
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
}

function writeTraceArtifact(repoRoot) {
  const fullPath = path.join(repoRoot, TRACE_PATH);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, '{"event_type":"test"}\n', 'utf8');
}

function runPolicy(repoRoot) {
  return spawnSync(process.execPath, [POLICY_SCRIPT], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
}

function git(repoRoot, args) {
  const result = spawnSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return result;
}
