import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { evaluateCodePolicy } from './verify-code-policy.mjs';

const TRACE_PATH = '.claude/.claude/traces/self-test/agent_work_trace.jsonl';

test('tracked forbidden trace artifacts fail code policy', () => {
  withPolicyFixture((repoRoot) => {
    writeTraceArtifact(repoRoot);

    const result = runPolicy(repoRoot);

    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /\[forbidden-trace-path\]/);
  });
});

test('staged deletion of forbidden trace artifacts is allowed', () => {
  withPolicyFixture((repoRoot) => {
    const result = runPolicy(repoRoot);

    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.doesNotMatch(result.stdout, /\[forbidden-trace-path\]/);
  });
});

function withPolicyFixture(callback) {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'code-policy-'));
  try {
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
  const previousCwd = process.cwd();
  const previousFiles = process.env.VERIFY_CODE_POLICY_FILES;
  try {
    process.chdir(repoRoot);
    process.env.VERIFY_CODE_POLICY_FILES = TRACE_PATH;
    const result = evaluateCodePolicy([]);
    return {
      status: result.status,
      stdout: `${result.lines.join('\n')}\n`,
      stderr: '',
    };
  } finally {
    process.chdir(previousCwd);
    if (previousFiles === undefined) {
      delete process.env.VERIFY_CODE_POLICY_FILES;
    } else {
      process.env.VERIFY_CODE_POLICY_FILES = previousFiles;
    }
  }
}
