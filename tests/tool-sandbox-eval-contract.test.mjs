import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { after, test } from 'node:test';

import Database from 'better-sqlite3';

const root = process.cwd();
const tempRoots = [];

const makeEnv = async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'moonshot-tool-sandbox-'));
  tempRoots.push(dir);
  return {
    PHASE_RUNTIME_DB: path.join(dir, 'runtime-state.sqlite'),
  };
};

after(async () => {
  await Promise.all(tempRoots.map((dir) => rm(dir, { recursive: true, force: true })));
});

const runRuntimeState = (args, env) => spawnSync(process.execPath, [
  'scripts/runtime-state.mjs',
  ...args,
], {
  cwd: root,
  encoding: 'utf8',
  env: {
    ...process.env,
    ...env,
  },
});

const json = (result) => {
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
};

test('tool calls record summary full and rejected schema modes', async () => {
  const env = await makeEnv();
  json(runRuntimeState(['init', '--json'], env));

  for (const schemaMode of ['summary', 'full', 'rejected']) {
    const result = json(runRuntimeState([
      'record-tool-call',
      '--run-id',
      'run-tools',
      '--goal-id',
      'goal-tools',
      '--tool-group',
      'shell',
      '--tool-name',
      `tool-${schemaMode}`,
      '--status',
      schemaMode === 'rejected' ? 'rejected' : 'selected',
      '--schema-mode',
      schemaMode,
      '--payload-json',
      `{"schemaMode":"${schemaMode}"}`,
      '--json',
    ], env));
    assert.equal(result.status, 'recorded');
  }

  const db = new Database(env.PHASE_RUNTIME_DB);
  try {
    const rows = db.prepare('SELECT tool_name, schema_mode, status FROM tool_calls ORDER BY created_at, tool_name').all();
    assert.deepEqual(rows.map((row) => row.schema_mode).sort(), ['full', 'rejected', 'summary']);
    assert.equal(rows.find((row) => row.schema_mode === 'rejected').status, 'rejected');
  } finally {
    db.close();
  }
});

test('unauthorized approval-required operations block clean completion', async () => {
  for (const operationCategory of [
    'destructive_file',
    'dependency_install',
    'network',
    'account_root_mutation',
    'external_write',
  ]) {
    const env = await makeEnv();
    const runId = `run-${operationCategory}`;
    const goalId = `goal-${operationCategory}`;
    json(runRuntimeState(['init', '--json'], env));
    json(runRuntimeState([
      'record-event',
      '--run-id',
      runId,
      '--goal-id',
      goalId,
      '--event-type',
      'approval.required',
      '--severity',
      'blocking',
      '--payload-json',
      JSON.stringify({
        operationCategory,
        target: `fixture:${operationCategory}`,
        reason: `missing approval for ${operationCategory}`,
      }),
      '--json',
    ], env));

    const assessed = json(runRuntimeState([
      'assess-completion',
      '--run-id',
      runId,
      '--goal-id',
      goalId,
      '--json',
    ], env));

    assert.equal(assessed.status, 'rejected');
    assert.equal(assessed.reason, `missing approval for ${operationCategory}`);
  }
});

test('approval-required tool call without approval blocks clean completion', async () => {
  const env = await makeEnv();
  json(runRuntimeState(['init', '--json'], env));
  json(runRuntimeState([
    'record-tool-call',
    '--run-id',
    'run-tool-approval',
    '--goal-id',
    'goal-tool-approval',
    '--tool-group',
    'shell',
    '--tool-name',
    'dependency-install',
    '--status',
    'selected',
    '--schema-mode',
    'full',
    '--approval-required',
    'true',
    '--payload-json',
    '{"operationCategory":"dependency_install"}',
    '--json',
  ], env));
  json(runRuntimeState([
    'record-event',
    '--run-id',
    'run-tool-approval',
    '--goal-id',
    'goal-tool-approval',
    '--event-type',
    'verification.evidence',
    '--payload-json',
    '{"fresh":true,"requiredChecksPassed":true,"activeIdentityPresent":true,"identityMatches":true,"identity":{"runLeaseId":"lease-tool"}}',
    '--json',
  ], env));

  const assessed = json(runRuntimeState([
    'assess-completion',
    '--run-id',
    'run-tool-approval',
    '--goal-id',
    'goal-tool-approval',
    '--json',
  ], env));

  assert.equal(assessed.status, 'rejected');
  assert.equal(assessed.reason, 'approval required for tool call: dependency-install');
});

test('review reject eval regression blocks completion and appears in runtime status', async () => {
  const env = await makeEnv();
  json(runRuntimeState(['init', '--json'], env));
  const recorded = json(runRuntimeState([
    'record-eval-result',
    '--run-id',
    'run-review-reject',
    '--goal-id',
    'goal-review-reject',
    '--suite',
    'completion-authority',
    '--status',
    'failed',
    '--score-json',
    '{"findings":4,"severity":"reject"}',
    '--regression-worsened',
    'true',
    '--evidence-json',
    '{"reviewAgent":"independent","decision":"REJECT","findingCount":4}',
    '--json',
  ], env));
  assert.equal(recorded.status, 'recorded');

  json(runRuntimeState([
    'record-event',
    '--run-id',
    'run-review-reject',
    '--goal-id',
    'goal-review-reject',
    '--event-type',
    'verification.evidence',
    '--payload-json',
    '{"fresh":true,"requiredChecksPassed":true,"activeIdentityPresent":true,"identityMatches":true,"identity":{"runLeaseId":"lease-review"}}',
    '--json',
  ], env));

  const assessed = json(runRuntimeState([
    'assess-completion',
    '--run-id',
    'run-review-reject',
    '--goal-id',
    'goal-review-reject',
    '--json',
  ], env));
  assert.equal(assessed.status, 'rejected');
  assert.equal(assessed.reason, 'eval regression worsened: completion-authority');

  const status = json(runRuntimeState([
    'status',
    '--run-id',
    'run-review-reject',
    '--goal-id',
    'goal-review-reject',
    '--json',
  ], env));
  assert.equal(status.compactStatus.currentBlocker, 'eval regression worsened: completion-authority');
  assert.equal(status.compactStatus.latestEval.suite, 'completion-authority');
  assert.equal(status.compactStatus.latestEval.regressionWorsened, true);
  assert.equal(status.compactStatus.latestEval.evidence.findingCount, 4);
});

test('passing eval result appears in runtime status without blocking', async () => {
  const env = await makeEnv();
  json(runRuntimeState(['init', '--json'], env));
  json(runRuntimeState([
    'record-eval-result',
    '--run-id',
    'run-eval-pass',
    '--goal-id',
    'goal-eval-pass',
    '--suite',
    'runtime-read-model',
    '--status',
    'passed',
    '--score-json',
    '{"assertions":9}',
    '--evidence-json',
    '{"command":"node --test tests/runtime-read-model-contract.test.mjs"}',
    '--json',
  ], env));

  const status = json(runRuntimeState([
    'status',
    '--run-id',
    'run-eval-pass',
    '--goal-id',
    'goal-eval-pass',
    '--json',
  ], env));

  assert.equal(status.compactStatus.currentBlocker, '');
  assert.equal(status.compactStatus.latestEval.suite, 'runtime-read-model');
  assert.equal(status.compactStatus.latestEval.status, 'passed');
  assert.equal(status.compactStatus.latestEval.score.assertions, 9);
  assert.equal(status.compactStatus.latestEval.regressionWorsened, false);
});

test('assess-completion returns typed degraded json when native sqlite support is unavailable', async () => {
  const env = await makeEnv();
  const result = json(runRuntimeState([
    'assess-completion',
    '--run-id',
    'run-native-missing-assess',
    '--goal-id',
    'goal-native-missing-assess',
    '--json',
  ], {
    ...env,
    MOONSHOT_RUNTIME_STATE_DISABLE_NATIVE: '1',
  }));

  assert.equal(result.runtimeCapabilityStatus.status, 'degraded');
  assert.equal(result.runtimeCapabilityStatus.reason, 'missing_native_module');
});

test('external harness transfer doc names accepted and rejected patterns', async () => {
  const content = await import('node:fs/promises')
    .then(({ readFile }) => readFile(path.join(root, 'docs/public/guidelines/external-skill-pattern-transfer.md'), 'utf8'));

  for (const phrase of ['testing discipline', 'ledger', 'local edit discipline', 'loop cap', 'sandbox']) {
    assert.match(content, new RegExp(phrase, 'i'));
  }
  for (const phrase of ['public skill sprawl', 'AGENTS.md knowledge hoarding', 'default multi-agent fanout']) {
    assert.match(content, new RegExp(phrase, 'i'));
  }
});
