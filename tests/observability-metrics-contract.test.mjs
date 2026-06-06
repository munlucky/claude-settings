import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { after, test } from 'node:test';

const root = process.cwd();
const tempRoots = [];

const makeEnv = async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'moonshot-observability-'));
  tempRoots.push(dir);
  return {
    PHASE_RUNTIME_DB: path.join(dir, 'runtime-state.sqlite'),
  };
};

after(async () => {
  await Promise.all(tempRoots.map((dir) => rm(dir, { recursive: true, force: true })));
});

const runtimeState = (args, env) => spawnSync(process.execPath, [
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

const recordEvent = (env, runId, goalId, eventType, payload, severity = 'info') => json(runtimeState([
  'record-event',
  '--run-id',
  runId,
  '--goal-id',
  goalId,
  '--event-type',
  eventType,
  '--severity',
  severity,
  '--payload-json',
  JSON.stringify(payload),
  '--json',
], env));

test('runtime status derives observability metrics from runtime evidence', async () => {
  const env = await makeEnv();
  const runId = 'run-observability';
  const goalId = 'goal-observability';
  json(runtimeState(['init', '--json'], env));

  recordEvent(env, runId, goalId, 'resume.success', { attempt: 1 });
  recordEvent(env, runId, goalId, 'resume.failure', { attempt: 2 });
  recordEvent(env, runId, goalId, 'context.prompt_metrics', {
    metrics: {
      promptCacheHit: true,
      contextCompactionRatio: 0.5,
      lostRequiredFields: [],
    },
  });
  recordEvent(env, runId, goalId, 'context.compaction', {
    metrics: {
      promptCacheHit: false,
      contextCompactionRatio: 0.25,
      lostRequiredFields: ['resumeBrief.nextAction'],
    },
  });
  recordEvent(env, runId, goalId, 'runtime.db_busy_timeout', { reason: 'db_lock_timeout' });
  recordEvent(env, runId, goalId, 'browser.trace', { status: 'passed' });
  recordEvent(env, runId, goalId, 'browser.trace', { status: 'flaky', traceCandidatePath: '.moonshot-relay/eval-artifacts/trace-candidate.json' });
  recordEvent(env, runId, goalId, 'security.review', { openAlerts: [{ severity: 'high' }, { severity: 'medium' }] });
  recordEvent(env, runId, goalId, 'workflow.blocked', { reason: 'operator approval required' }, 'blocking');

  json(runtimeState([
    'record-tool-call',
    '--run-id',
    runId,
    '--goal-id',
    goalId,
    '--tool-group',
    'sandbox',
    '--tool-name',
    'destructive-write',
    '--status',
    'rejected',
    '--schema-mode',
    'rejected',
    '--approval-required',
    'true',
    '--payload-json',
    '{"operationCategory":"destructive_file_operation"}',
    '--json',
  ], env));
  json(runtimeState([
    'record-tool-call',
    '--run-id',
    runId,
    '--goal-id',
    goalId,
    '--tool-group',
    'runtime-state',
    '--tool-name',
    'status',
    '--status',
    'ok',
    '--schema-mode',
    'summary',
    '--json',
  ], env));
  json(runtimeState([
    'record-eval-result',
    '--run-id',
    runId,
    '--goal-id',
    goalId,
    '--suite',
    'completion-false-positive',
    '--status',
    'failed',
    '--score-json',
    '{"score":0}',
    '--regression-worsened',
    'true',
    '--evidence-json',
    '{"category":"completion_false_positive","traceCandidatePath":".moonshot-relay/eval-artifacts/trace-candidate.json"}',
    '--json',
  ], env));
  const promotion = json(runtimeState([
    'record-memory-promotion',
    '--run-id',
    runId,
    '--goal-id',
    goalId,
    '--memory-id',
    'observability-memory',
    '--status',
    'promoted',
    '--evidence-json',
    '{"fresh":true}',
    '--reviewer-json',
    '{"approved":true}',
    '--replay-json',
    '{"status":"passed"}',
    '--rollback-json',
    '{"strategy":"remove","removes":["observability-memory"]}',
    '--scope-owner',
    'observability',
    '--json',
  ], env));
  json(runtimeState([
    'rollback-memory-promotion',
    '--run-id',
    runId,
    '--goal-id',
    goalId,
    '--decision-id',
    promotion.decisionId,
    '--rollback-evidence-json',
    '{"command":"node --test tests/observability-metrics-contract.test.mjs"}',
    '--json',
  ], env));

  const status = json(runtimeState(['status', '--run-id', runId, '--goal-id', goalId, '--json'], env));
  const metrics = status.operationalMetrics.metrics;

  assert.equal(metrics.completion_false_positive_rate, 1);
  assert.equal(metrics.run_resume_success_rate, 0.5);
  assert.equal(metrics.tool_invalid_call_rate, 0.5);
  assert.equal(metrics.prompt_cache_hit_ratio, 0.5);
  assert.equal(metrics.context_compaction_ratio, 0.375);
  assert.equal(metrics.context_required_fields_lost_count, 1);
  assert.equal(metrics.db_busy_timeout_count, 1);
  assert.equal(metrics.browser_trace_flaky_rate, 0.5);
  assert.equal(metrics.security_open_alerts, 2);
  assert.equal(metrics.eval_regression_worsened_count, 1);
  assert.equal(metrics.memory_promotion_rollback_count, 1);

  assert.ok(status.operationalMetrics.blockerMetrics.includes('completion_false_positive_rate'));
  assert.ok(status.operationalMetrics.releaseBlockerMetrics.includes('eval_regression_worsened_count'));
  assert.ok(status.operationalMetrics.warningMetrics.includes('memory_promotion_rollback_count'));
  assert.equal(status.compactStatus.blockingEvents[0].reason, 'operator approval required');
  assert.equal(status.compactStatus.pendingApprovals[0].toolName, 'destructive-write');
  assert.equal(status.compactStatus.evalRegressions[0].evidence.traceCandidatePath, '.moonshot-relay/eval-artifacts/trace-candidate.json');
  assert.deepEqual(status.compactStatus.operationalMetrics.metrics, metrics);

  const assessed = json(runtimeState(['assess-completion', '--run-id', runId, '--goal-id', goalId, '--json'], env));
  assert.equal(assessed.status, 'rejected');
  assert.equal(assessed.reason, 'operator approval required');
});

test('degraded runtime status includes metrics surface', async () => {
  const env = await makeEnv();
  const result = json(runtimeState([
    'status',
    '--run-id',
    'run-degraded-observability',
    '--goal-id',
    'goal-degraded-observability',
    '--json',
  ], {
    ...env,
    MOONSHOT_RUNTIME_STATE_DISABLE_NATIVE: '1',
  }));

  assert.equal(result.runtimeCapabilityStatus.status, 'degraded');
  assert.equal(result.runtimeCapabilityStatus.reason, 'missing_native_module');
  assert.equal(result.operationalMetrics.source, 'runtime-state.sqlite');
  assert.equal(result.operationalMetrics.metrics.eval_regression_worsened_count, 0);
  assert.ok(Array.isArray(result.operationalMetrics.releaseBlockerMetrics));
  assert.equal(result.compactStatus.operationalMetrics.metrics.db_busy_timeout_count, 0);
});

test('observability docs define metric thresholds and operations recovery', async () => {
  const { readFile } = await import('node:fs/promises');
  const runtimeDoc = await readFile(path.join(root, 'docs', 'public', 'runtime-control-plane.md'), 'utf8');
  const resumeDoc = await readFile(path.join(root, 'docs', 'public', 'guidelines', 'resumable-session-layer.md'), 'utf8');
  const combined = `${runtimeDoc}\n${resumeDoc}`;

  for (const phrase of [
    'completion_false_positive_rate',
    'run_resume_success_rate',
    'tool_invalid_call_rate',
    'prompt_cache_hit_ratio',
    'context_compaction_ratio',
    'db_busy_timeout_count',
    'browser_trace_flaky_rate',
    'security_open_alerts',
    'eval_regression_worsened_count',
    'memory_promotion_rollback_count',
    'restore runtime-state capability',
    'trace-to-testcase',
  ]) {
    assert.match(combined, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});
