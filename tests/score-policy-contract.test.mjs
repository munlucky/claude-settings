import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

import { buildCandidateIdentity, sha256Hex } from '../scripts/lib/candidate-identity.mjs';
import {
  buildCommandEvidence,
  buildVerificationReceipt,
  projectVerifyScoreEvidence,
  scoreCandidate,
} from '../scripts/lib/verification-plane.mjs';

const candidate = () => buildCandidateIdentity({
  task: 'task',
  spec: 'spec',
  plan: 'plan',
  done: 'done',
  source: { digest: sha256Hex('source') },
  environment: { node: '22' },
  policy: { version: 'policy' },
});

test('command evidence records argv env allowlist exit code and artifact digests', () => {
  const evidence = buildCommandEvidence({
    argv: ['npm', 'test'],
    cwd: '.',
    env: { NODE_ENV: 'test', SECRET_TOKEN: 'nope' },
    timeoutMs: 1000,
    exitCode: 0,
    stdout: 'ok',
    stderr: '',
  });

  assert.deepEqual(evidence.argv, ['npm', 'test']);
  assert.deepEqual(evidence.env, { NODE_ENV: 'test' });
  assert.equal(evidence.exitCode, 0);
  assert.match(evidence.stdoutDigest, /^[a-f0-9]{64}$/);
});

test('verification and score receipts bind candidate source environment and policy', () => {
  const identity = candidate();
  const verify = buildVerificationReceipt({
    candidate: identity,
    commands: [buildCommandEvidence({ argv: ['node', '--test'], exitCode: 0 })],
    status: 'passed',
  });
  const score = scoreCandidate({
    candidate: identity,
    verification: verify,
    hardGates: [{ id: 'unit', status: 'passed' }],
    policyVersion: 'score-policy-v1',
  });

  assert.equal(verify.candidate_id, identity.candidate_id);
  assert.equal(score.status, 'FULL');
  assert.equal(score.policyVersion, 'score-policy-v1');
  assert.equal(score.wholePlanAuthority.acceptedCompletionRequired, true);
  assert.equal(score.wholePlanAuthority.status, 'not_completion_authority');
});

test('hard gate failure or blocking review finding prevents FULL score', () => {
  const identity = candidate();
  const verify = buildVerificationReceipt({ candidate: identity, commands: [], status: 'passed' });
  const hardGateScore = scoreCandidate({
    candidate: identity,
    verification: verify,
    hardGates: [{ id: 'unit', status: 'failed' }],
  });
  const findingScore = scoreCandidate({
    candidate: identity,
    verification: verify,
    hardGates: [{ id: 'unit', status: 'passed' }],
    reviewFindings: [{ severity: 'critical', disposition: 'human_decision', summary: 'unsafe' }],
  });

  assert.equal(hardGateScore.status, 'BLOCKED');
  assert.equal(findingScore.status, 'BLOCKED');
});

test('verify score projection names runtime event and eval evidence shape', () => {
  const identity = candidate();
  const verify = buildVerificationReceipt({ candidate: identity, commands: [], status: 'passed' });
  const score = scoreCandidate({ candidate: identity, verification: verify, hardGates: [] });
  const projection = projectVerifyScoreEvidence({
    runId: 'run-score',
    goalId: 'goal-score',
    verifyReceipt: verify,
    scoreReceipt: score,
  });

  assert.equal(projection.runtimeEvent.event_type, 'verification.score');
  assert.equal(projection.evalEvidence.suite, 'verification-scoring');
  assert.equal(Object.hasOwn(projection, 'completionDecision'), false);
});

test('score candidate CLI emits verify and score receipts', () => {
  const identity = candidate();
  const result = spawnSync(process.execPath, [
    'scripts/verification-plane.mjs',
    'score-candidate',
    '--candidate-json',
    JSON.stringify(identity),
    '--commands-json',
    JSON.stringify([{ argv: ['npm', 'test'], exitCode: 0 }]),
    '--hard-gates-json',
    JSON.stringify([{ id: 'unit', status: 'passed' }]),
    '--policy-version',
    'score-policy-v1',
    '--json',
  ], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.status, 'scored');
  assert.equal(payload.score.status, 'FULL');
});

test('verification evidence and score policy schemas are parseable', async () => {
  for (const name of ['verification-evidence.schema.json', 'score-policy.schema.json']) {
    const schema = JSON.parse(await readFile(path.join(process.cwd(), 'schemas', name), 'utf8'));
    assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
    assert.equal(schema.type, 'object');
    assert.equal(schema.additionalProperties, false);
  }
});
