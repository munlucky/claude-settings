import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { after, test } from 'node:test';

import Database from 'better-sqlite3';

const root = process.cwd();
const tempRoots = [];
const planDir = 'docs/public/roadmaps/harness-control-plane-modernization';
const masterPlan = `${planDir}/00-master-plan-v1.md`;

const makeTempRoot = async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'moonshot-runtime-read-model-'));
  tempRoots.push(dir);
  return dir;
};

after(async () => {
  await Promise.all(tempRoots.map((dir) => rm(dir, { recursive: true, force: true })));
});

const runNode = (args, env = {}) => spawnSync(process.execPath, args, {
  cwd: root,
  encoding: 'utf8',
  env: {
    ...process.env,
    ...env,
  },
});

const parseJson = (result) => {
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
};

const readPath = (value, dottedPath) => dottedPath
  .split('.')
  .reduce((current, part) => (current && Object.hasOwn(current, part) ? current[part] : undefined), value);

const fullPassingEvidence = (runLeaseId) => JSON.stringify({
  fresh: true,
  requiredChecksPassed: true,
  activeIdentityPresent: true,
  identityMatches: true,
  identity: { runLeaseId },
  profile: 'runtime_adapter',
  requiredPlanes: ['unit', 'package', 'installer', 'browser', 'security', 'quality'],
  profileRequiredPlanes: ['unit', 'package', 'installer', 'browser', 'security', 'quality'],
  completionAuthorityRequiredPlanes: ['unit', 'package', 'installer', 'browser', 'security', 'quality'],
  planes: [
    { plane: 'unit', status: 'passed', command: 'npm test' },
    { plane: 'package', status: 'passed', command: 'npm run test:package' },
    { plane: 'installer', status: 'passed', command: 'installer dry-run' },
    { plane: 'browser', status: 'passed', tracePath: '.moonshot-relay/browser-artifacts/run/goal/smoke/trace-metadata.json' },
    { plane: 'security', status: 'passed', blockers: [] },
    { plane: 'quality', status: 'passed', command: 'git diff --check' },
  ],
  taskLocalCompletion: {
    status: 'complete',
    fresh: true,
    profile: 'runtime_adapter',
    requiredPlanes: ['unit', 'package', 'installer', 'browser', 'security', 'quality'],
    missingPlanes: [],
    failedPlanes: [],
    reason: 'profile evidence complete',
  },
  wholePlanAuthority: {
    status: 'evidence_eligible',
    authoritySource: 'runtime-state.sqlite',
    acceptedCompletionRequired: true,
    requiredPlanes: ['unit', 'package', 'installer', 'browser', 'security', 'quality'],
    missingPlanes: [],
    failedPlanes: [],
    reason: 'all authority planes present; accepted DB decision still required',
  },
  evidenceId: `evidence-${runLeaseId}`,
});

test('runtime status read model includes all verification contract fields', async () => {
  const tempRoot = await makeTempRoot();
  const dbPath = path.join(tempRoot, 'runtime-state.sqlite');
  const env = { PHASE_RUNTIME_DB: dbPath };
  const status = parseJson(runNode([
    'scripts/runtime-state.mjs',
    'status',
    '--run-id',
    'run-read-model',
    '--goal-id',
    'goal-read-model',
    '--json',
  ], env));
  const contract = await readFile(path.join(root, 'schemas', 'verification.contract.yaml'), 'utf8');
  const requiredFields = [...contract.matchAll(/^\s+- "([^"]+)"$/gm)]
    .map((match) => match[1])
    .filter((field) => field.startsWith('runtimeCapabilityStatus') || field === 'operationalMetrics' || field.startsWith('compactStatus.') || field.startsWith('resumeBrief.'));

  assert.deepEqual(requiredFields, [
    'runtimeCapabilityStatus',
    'operationalMetrics',
    'compactStatus.activeContract',
    'compactStatus.latestVerdict',
    'compactStatus.latestVerificationEvidence',
    'compactStatus.currentBlocker',
    'compactStatus.lineage',
    'compactStatus.staleWarnings',
    'compactStatus.operationalMetrics',
    'resumeBrief.nextAction',
    'resumeBrief.currentBlocker',
    'resumeBrief.lineage',
    'resumeBrief.operationalMetrics',
  ]);

  for (const field of requiredFields) {
    assert.notEqual(readPath(status, field), undefined, `${field} should be present`);
  }
});

test('empty DB and missing native dependency return typed read-model defaults', async () => {
  const tempRoot = await makeTempRoot();
  const available = parseJson(runNode([
    'scripts/runtime-state.mjs',
    'status',
    '--run-id',
    'run-empty',
    '--goal-id',
    'goal-empty',
    '--json',
  ], {
    PHASE_RUNTIME_DB: path.join(tempRoot, 'available.sqlite'),
  }));
  assert.equal(available.runtimeCapabilityStatus.status, 'available');
  assert.equal(available.compactStatus.latestVerificationEvidence, null);
  assert.deepEqual(available.compactStatus.staleWarnings, []);
  assert.deepEqual(available.compactStatus.lineage, ['run-empty', 'goal-empty']);

  const degraded = parseJson(runNode([
    'scripts/runtime-state.mjs',
    'status',
    '--run-id',
    'run-degraded',
    '--goal-id',
    'goal-degraded',
    '--json',
  ], {
    PHASE_RUNTIME_DB: path.join(tempRoot, 'degraded.sqlite'),
    MOONSHOT_RUNTIME_STATE_DISABLE_NATIVE: '1',
  }));
  assert.equal(degraded.runtimeCapabilityStatus.status, 'degraded');
  assert.equal(degraded.runtimeCapabilityStatus.reason, 'missing_native_module');
  assert.equal(degraded.compactStatus.latestVerificationEvidence, null);
  assert.ok(degraded.compactStatus.staleWarnings.includes('missing_native_module'));
});

test('runtime status exposes normalized latest verification evidence projection', async () => {
  const tempRoot = await makeTempRoot();
  const dbPath = path.join(tempRoot, 'runtime-state.sqlite');
  const env = { PHASE_RUNTIME_DB: dbPath };
  parseJson(runNode([
    'scripts/verification-plane.mjs',
    'record-summary',
    '--run-id',
    'run-latest-verification',
    '--goal-id',
    'goal-latest-verification',
    '--profile',
    'docs_only',
    '--planes-json',
    JSON.stringify([
      { plane: 'package', status: 'passed', command: 'doc payload check', rawLog: 'not surfaced' },
      { plane: 'quality', status: 'passed', command: 'git diff --check', rawLog: 'not surfaced' },
    ]),
    '--task-class-json',
    '{"taskType":"docs_only"}',
    '--identity-json',
    '{"runLeaseId":"lease-latest-verification"}',
    '--json',
  ], env));

  const status = parseJson(runNode([
    'scripts/runtime-state.mjs',
    'status',
    '--run-id',
    'run-latest-verification',
    '--goal-id',
    'goal-latest-verification',
    '--json',
  ], env));
  const latest = status.compactStatus.latestVerificationEvidence;

  assert.equal(latest.eventType, 'verification.evidence');
  assert.equal(latest.profile, 'docs_only');
  assert.equal(latest.fresh, true);
  assert.equal(latest.requiredChecksPassed, true);
  assert.equal(latest.taskLocalCompletion.status, 'complete');
  assert.equal(latest.wholePlanAuthority.status, 'blocked');
  assert.deepEqual(latest.missingCompletionAuthorityPlanes, ['unit', 'installer', 'browser', 'security']);
  assert.deepEqual(latest.planeStatuses, [
    { plane: 'package', status: 'passed' },
    { plane: 'quality', status: 'passed' },
  ]);
  assert.equal(Object.hasOwn(latest, 'planes'), false);
});

test('phase runner prepare dry-run writes nothing but non-dry-run records resume snapshot', async () => {
  const tempRoot = await makeTempRoot();
  const dbPath = path.join(tempRoot, 'runtime-state.sqlite');
  const statusFile = path.join(tempRoot, 'phase-status.yaml');
  const executionRoot = path.join(tempRoot, 'execution');
  const env = { PHASE_RUNTIME_DB: dbPath };

  const dryRun = parseJson(runNode([
    'scripts/prepare-phase-runner-state.mjs',
    '--dry-run',
    '--json',
    '--plan-dir',
    planDir,
    '--master-plan',
    masterPlan,
    '--status-file',
    statusFile,
    '--execution-root',
    executionRoot,
  ], env));
  assert.equal(dryRun.status, 'ready');
  assert.equal(existsSync(dbPath), false, 'dry-run should not create runtime DB');
  assert.equal(existsSync(statusFile), false, 'dry-run should not create phase status');
  assert.equal(existsSync(path.join(executionRoot, 'phase-runner-readiness.json')), false, 'dry-run should not create readiness JSON');

  const prepared = parseJson(runNode([
    'scripts/prepare-phase-runner-state.mjs',
    '--json',
    '--plan-dir',
    planDir,
    '--master-plan',
    masterPlan,
    '--status-file',
    statusFile,
    '--execution-root',
    executionRoot,
    '--run-id',
    'run-prepare-explicit',
    '--goal-id',
    'goal-prepare-explicit',
    '--workspace-id',
    'workspace-prepare-explicit',
  ], env));
  assert.equal(prepared.status, 'ready');
  assert.equal(prepared.runId, 'run-prepare-explicit');
  assert.equal(prepared.goalId, 'goal-prepare-explicit');
  assert.equal(prepared.workspaceId, 'workspace-prepare-explicit');
  assert.equal(existsSync(dbPath), true, 'non-dry-run should create runtime DB');
  assert.equal(existsSync(statusFile), true, 'non-dry-run should create phase status');
  assert.equal(existsSync(path.join(executionRoot, 'phase-runner-readiness.json')), true, 'non-dry-run should create readiness JSON');

  const db = new Database(dbPath);
  try {
    const snapshot = db.prepare('SELECT * FROM resume_snapshots ORDER BY snapshot_sequence DESC LIMIT 1').get();
    assert.equal(snapshot.run_id, 'run-prepare-explicit');
    assert.equal(snapshot.goal_id, 'goal-prepare-explicit');
    const run = db.prepare('SELECT * FROM runs WHERE run_id = ?').get('run-prepare-explicit');
    assert.equal(run.workspace_id, 'workspace-prepare-explicit');
    const events = db.prepare('SELECT event_type, severity, payload_json FROM runtime_events ORDER BY event_sequence').all();
    assert.deepEqual(events.map((event) => event.event_type), ['phase.start', 'resume.success']);
    assert.equal(events[0].severity, 'info');
    assert.equal(events[1].severity, 'info');
    const phasePayload = JSON.parse(events[0].payload_json);
    assert.equal(phasePayload.phaseDoc, '01-baseline-source-truth-v1.md');
    assert.equal(phasePayload.workspaceId, 'workspace-prepare-explicit');
    const resumeBrief = JSON.parse(snapshot.resume_brief_json);
    assert.equal(resumeBrief.nextAction, '01-baseline-source-truth-v1.md');
    assert.deepEqual(resumeBrief.lineage, [planDir, masterPlan]);
  } finally {
    db.close();
  }
});

test('resume snapshots record success and failure events in the read model', async () => {
  const tempRoot = await makeTempRoot();
  const dbPath = path.join(tempRoot, 'runtime-state.sqlite');
  const env = { PHASE_RUNTIME_DB: dbPath };

  parseJson(runNode([
    'scripts/runtime-state.mjs',
    'snapshot-resume',
    '--run-id',
    'run-resume-success',
    '--goal-id',
    'goal-resume-taxonomy',
    '--workspace-id',
    'workspace-resume',
    '--status-json',
    '{"phase":"02","status":"running"}',
    '--resume-brief-json',
    '{"nextAction":"continue phase 02","currentBlocker":"","lineage":["phase-02"]}',
    '--identity-json',
    '{"phaseId":"02"}',
    '--json',
  ], env));
  parseJson(runNode([
    'scripts/runtime-state.mjs',
    'snapshot-resume',
    '--run-id',
    'run-resume-failure',
    '--goal-id',
    'goal-resume-taxonomy',
    '--workspace-id',
    'workspace-resume',
    '--status-json',
    '{"phase":"02","status":"blocked"}',
    '--resume-brief-json',
    '{"nextAction":"refresh runtime-state","currentBlocker":"missing resume identity","lineage":["phase-02"]}',
    '--identity-json',
    '{"phaseId":"02"}',
    '--json',
  ], env));

  const db = new Database(dbPath);
  try {
    const successEvent = db.prepare('SELECT event_type, severity, payload_json FROM runtime_events WHERE run_id = ?').get('run-resume-success');
    assert.equal(successEvent.event_type, 'resume.success');
    assert.equal(successEvent.severity, 'info');
    assert.equal(JSON.parse(successEvent.payload_json).workspaceId, 'workspace-resume');

    const failureEvent = db.prepare('SELECT event_type, severity, payload_json FROM runtime_events WHERE run_id = ?').get('run-resume-failure');
    assert.equal(failureEvent.event_type, 'resume.failure');
    assert.equal(failureEvent.severity, 'blocking');
    assert.equal(JSON.parse(failureEvent.payload_json).reason, 'missing resume identity');
  } finally {
    db.close();
  }

  const failureStatus = parseJson(runNode([
    'scripts/runtime-state.mjs',
    'status',
    '--run-id',
    'run-resume-failure',
    '--goal-id',
    'goal-resume-taxonomy',
    '--json',
  ], env));
  assert.equal(failureStatus.compactStatus.currentBlocker, 'missing resume identity');
  assert.equal(failureStatus.resumeBrief.nextAction, 'refresh runtime-state');
  assert.equal(failureStatus.operationalMetrics.metrics.run_resume_success_rate, 0);
});

test('blocker lifecycle events control current blocker and completion authority', async () => {
  const tempRoot = await makeTempRoot();
  const dbPath = path.join(tempRoot, 'runtime-state.sqlite');
  const env = { PHASE_RUNTIME_DB: dbPath };
  const runId = 'run-blocker-lifecycle';
  const goalId = 'goal-blocker-lifecycle';

  parseJson(runNode([
    'scripts/runtime-state.mjs',
    'record-event',
    '--run-id',
    runId,
    '--goal-id',
    goalId,
    '--event-type',
    'verification.evidence',
    '--payload-json',
    fullPassingEvidence('lease-blocker-lifecycle'),
    '--json',
  ], env));
  parseJson(runNode([
    'scripts/runtime-state.mjs',
    'record-event',
    '--run-id',
    runId,
    '--goal-id',
    goalId,
    '--event-type',
    'blocker.opened',
    '--severity',
    'blocking',
    '--payload-json',
    '{"blockerFingerprint":"blocker-db-authority","reason":"DB authority missing","nextAction":"record runtime event"}',
    '--json',
  ], env));

  const blocked = parseJson(runNode([
    'scripts/runtime-state.mjs',
    'assess-completion',
    '--run-id',
    runId,
    '--goal-id',
    goalId,
    '--json',
  ], env));
  assert.equal(blocked.status, 'rejected');
  assert.equal(blocked.reason, 'DB authority missing');

  parseJson(runNode([
    'scripts/runtime-state.mjs',
    'record-event',
    '--run-id',
    runId,
    '--goal-id',
    goalId,
    '--event-type',
    'blocker.resolved',
    '--payload-json',
    '{"blockerFingerprint":"unrelated","reason":"unrelated resolution"}',
    '--json',
  ], env));
  const stillBlocked = parseJson(runNode([
    'scripts/runtime-state.mjs',
    'status',
    '--run-id',
    runId,
    '--goal-id',
    goalId,
    '--json',
  ], env));
  assert.equal(stillBlocked.compactStatus.currentBlocker, 'DB authority missing');
  assert.equal(stillBlocked.compactStatus.blockingEvents[0].blockerFingerprint, 'blocker-db-authority');

  parseJson(runNode([
    'scripts/runtime-state.mjs',
    'record-event',
    '--run-id',
    runId,
    '--goal-id',
    goalId,
    '--event-type',
    'blocker.resolved',
    '--payload-json',
    '{"blockerFingerprint":"blocker-db-authority","reason":"runtime event recorded"}',
    '--json',
  ], env));
  const accepted = parseJson(runNode([
    'scripts/runtime-state.mjs',
    'assess-completion',
    '--run-id',
    runId,
    '--goal-id',
    goalId,
    '--json',
  ], env));
  assert.equal(accepted.status, 'accepted');

  parseJson(runNode([
    'scripts/runtime-state.mjs',
    'record-event',
    '--run-id',
    runId,
    '--goal-id',
    goalId,
    '--event-type',
    'blocker.reopened',
    '--severity',
    'blocking',
    '--payload-json',
    '{"blockerFingerprint":"blocker-db-authority","reason":"regression reopened","nextAction":"rerun audit"}',
    '--json',
  ], env));
  const reopened = parseJson(runNode([
    'scripts/runtime-state.mjs',
    'status',
    '--run-id',
    runId,
    '--goal-id',
    goalId,
    '--json',
  ], env));
  assert.equal(reopened.compactStatus.currentBlocker, 'regression reopened');
  assert.equal(reopened.resumeBrief.nextAction, 'rerun audit');
});

test('phase runner prepare blocks duplicate active goal unless parallel is explicit', async () => {
  const tempRoot = await makeTempRoot();
  const dbPath = path.join(tempRoot, 'runtime-state.sqlite');
  const env = { PHASE_RUNTIME_DB: dbPath };
  const tempPlanDir = path.join(tempRoot, 'plan');
  await cp(path.join(root, planDir), tempPlanDir, { recursive: true });
  const phaseDocs = [
    '01-baseline-source-truth-v1.md',
    '02-runtime-control-plane-foundation-v1.md',
    '03-completion-authority-derived-artifacts-v1.md',
    '04-context-state-engine-prompt-assembly-v1.md',
    '05-tool-registry-lazy-schema-sandbox-v1.md',
    '06-eval-regression-trace-improvement-loop-v1.md',
    '07-ci-security-branch-protection-v1.md',
    '08-packaging-rollout-account-root-adoption-v1.md',
  ];
  await writeFile(path.join(tempPlanDir, 'plan-graph.json'), JSON.stringify({
    schemaVersion: 1,
    planId: 'runtime-read-model-duplicate-goal-test',
    executionMode: 'graph',
    phases: phaseDocs.map((doc, index) => ({
      id: `phase-${String(index + 1).padStart(2, '0')}`,
      doc,
      dependsOn: index === 0 ? [] : [`phase-${String(index).padStart(2, '0')}`],
      ownedPaths: [`execution/phase-${String(index + 1).padStart(2, '0')}/**`],
    })),
  }, null, 2));
  const commonArgs = [
    'scripts/prepare-phase-runner-state.mjs',
    '--json',
    '--plan-dir',
    tempPlanDir,
    '--master-plan',
    path.join(tempPlanDir, '00-master-plan-v1.md'),
    '--goal-id',
    'goal-shared-plan',
    '--workspace-id',
    'workspace-shared-plan',
  ];

  const first = parseJson(runNode([
    ...commonArgs,
    '--run-id',
    'run-shared-a',
    '--status-file',
    path.join(tempRoot, 'a', 'phase-status.yaml'),
    '--execution-root',
    path.join(tempRoot, 'a', 'execution'),
  ], env));
  assert.equal(first.runLease.status, 'acquired');

  const second = runNode([
    ...commonArgs,
    '--run-id',
    'run-shared-b',
    '--status-file',
    path.join(tempRoot, 'b', 'phase-status.yaml'),
    '--execution-root',
    path.join(tempRoot, 'b', 'execution'),
  ], env);
  assert.equal(second.status, 2, second.stderr || second.stdout);
  const blocked = JSON.parse(second.stdout);
  assert.equal(blocked.status, 'blocked');
  assert.match(blocked.errors.join('\n'), /active run already exists for goal goal-shared-plan: run-shared-a/);

  const allowed = parseJson(runNode([
    ...commonArgs,
    '--run-id',
    'run-shared-c',
    '--allow-parallel',
    '--status-file',
    path.join(tempRoot, 'c', 'phase-status.yaml'),
    '--execution-root',
    path.join(tempRoot, 'c', 'execution'),
  ], env));
  assert.equal(allowed.runLease.status, 'parallel_allowed');

  const status = parseJson(runNode([
    'scripts/runtime-state.mjs',
    'status',
    '--json',
  ], env));
  const activeRunIds = status.runtimeCapabilityStatus.activeRuns.map((run) => run.run_id).sort();
  assert.deepEqual(activeRunIds, ['run-shared-a', 'run-shared-c']);
});

test('same workspace can hold different active goals concurrently', async () => {
  const tempRoot = await makeTempRoot();
  const dbPath = path.join(tempRoot, 'runtime-state.sqlite');
  const env = { PHASE_RUNTIME_DB: dbPath };

  for (const [runId, goalId] of [
    ['run-multi-goal-a', 'goal-multi-a'],
    ['run-multi-goal-b', 'goal-multi-b'],
  ]) {
    const lease = parseJson(runNode([
      'scripts/runtime-state.mjs',
      'acquire-run-lease',
      '--run-id',
      runId,
      '--goal-id',
      goalId,
      '--workspace-id',
      'workspace-multi-goal',
      '--json',
    ], env));
    assert.equal(lease.status, 'acquired');
  }

  const status = parseJson(runNode([
    'scripts/runtime-state.mjs',
    'status',
    '--json',
  ], env));
  const active = status.runtimeCapabilityStatus.activeRuns
    .filter((run) => run.workspace_id === 'workspace-multi-goal')
    .map((run) => `${run.run_id}:${run.goal_id}`)
    .sort();
  assert.deepEqual(active, ['run-multi-goal-a:goal-multi-a', 'run-multi-goal-b:goal-multi-b']);
});

test('run lease heartbeat TTL stale cleanup and recovery are visible', async () => {
  const tempRoot = await makeTempRoot();
  const dbPath = path.join(tempRoot, 'runtime-state.sqlite');
  const env = { PHASE_RUNTIME_DB: dbPath };
  const commonArgs = [
    'scripts/runtime-state.mjs',
    'acquire-run-lease',
    '--goal-id',
    'goal-stale-lease',
    '--workspace-id',
    'workspace-stale-lease',
    '--lease-ttl-ms',
    '1',
    '--json',
  ];

  const first = parseJson(runNode([
    ...commonArgs,
    '--run-id',
    'run-stale-a',
  ], env));
  assert.equal(first.status, 'acquired');
  assert.ok(first.heartbeatAt);
  assert.ok(first.leaseExpiresAt);

  await new Promise((resolve) => { setTimeout(resolve, 25); });

  const expiredStatus = parseJson(runNode([
    'scripts/runtime-state.mjs',
    'status',
    '--json',
  ], env));
  assert.equal(expiredStatus.runtimeCapabilityStatus.activeRuns.some((run) => run.run_id === 'run-stale-a'), false);
  assert.ok(expiredStatus.runtimeCapabilityStatus.staleRuns.some((run) => run.run_id === 'run-stale-a'));
  assert.ok(expiredStatus.compactStatus.staleWarnings.some((warning) => warning.includes('run-stale-a')));

  const second = parseJson(runNode([
    'scripts/runtime-state.mjs',
    'acquire-run-lease',
    '--run-id',
    'run-stale-b',
    '--goal-id',
    'goal-stale-lease',
    '--workspace-id',
    'workspace-stale-lease',
    '--lease-ttl-ms',
    '10000',
    '--json',
  ], env));
  assert.equal(second.status, 'acquired');
  assert.equal(second.recoveredStaleRuns.some((run) => run.run_id === 'run-stale-a'), true);

  const heartbeat = parseJson(runNode([
    'scripts/runtime-state.mjs',
    'heartbeat-run-lease',
    '--run-id',
    'run-stale-b',
    '--goal-id',
    'goal-stale-lease',
    '--lease-ttl-ms',
    '10000',
    '--json',
  ], env));
  assert.equal(heartbeat.status, 'heartbeat_recorded');

  const cleanup = parseJson(runNode([
    'scripts/runtime-state.mjs',
    'cleanup-stale-leases',
    '--json',
  ], env));
  assert.equal(cleanup.status, 'cleaned');

  const db = new Database(dbPath);
  try {
    const staleRun = db.prepare('SELECT status, stale_reason FROM runs WHERE run_id = ?').get('run-stale-a');
    assert.equal(staleRun.status, 'stale');
    assert.equal(staleRun.stale_reason, 'lease_ttl_expired');
    const recoveryEvent = db.prepare(`
      SELECT * FROM runtime_events
      WHERE run_id = ? AND goal_id = ? AND event_type = 'run_lease.stale_recovered'
    `).get('run-stale-a', 'goal-stale-lease');
    assert.ok(recoveryEvent);
  } finally {
    db.close();
  }
});

test('accepted completion closes active run lease for later same-goal runs', async () => {
  const tempRoot = await makeTempRoot();
  const dbPath = path.join(tempRoot, 'runtime-state.sqlite');
  const env = { PHASE_RUNTIME_DB: dbPath };
  const commonArgs = [
    'scripts/prepare-phase-runner-state.mjs',
    '--json',
    '--plan-dir',
    planDir,
    '--master-plan',
    masterPlan,
    '--goal-id',
    'goal-completes-lease',
    '--workspace-id',
    'workspace-completes-lease',
  ];

  parseJson(runNode([
    ...commonArgs,
    '--run-id',
    'run-complete-a',
    '--status-file',
    path.join(tempRoot, 'a', 'phase-status.yaml'),
    '--execution-root',
    path.join(tempRoot, 'a', 'execution'),
  ], env));
  parseJson(runNode([
    'scripts/runtime-state.mjs',
    'record-event',
    '--run-id',
    'run-complete-a',
    '--goal-id',
    'goal-completes-lease',
    '--event-type',
    'verification.evidence',
    '--payload-json',
    fullPassingEvidence('lease-complete-a'),
    '--json',
  ], env));
  const accepted = parseJson(runNode([
    'scripts/runtime-state.mjs',
    'assess-completion',
    '--run-id',
    'run-complete-a',
    '--goal-id',
    'goal-completes-lease',
    '--json',
  ], env));
  assert.equal(accepted.status, 'accepted');

  const afterCompletion = parseJson(runNode([
    'scripts/runtime-state.mjs',
    'status',
    '--json',
  ], env));
  assert.equal(afterCompletion.runtimeCapabilityStatus.activeRuns.some((run) => run.run_id === 'run-complete-a'), false);

  const nextRun = parseJson(runNode([
    ...commonArgs,
    '--run-id',
    'run-complete-b',
    '--status-file',
    path.join(tempRoot, 'b', 'phase-status.yaml'),
    '--execution-root',
    path.join(tempRoot, 'b', 'execution'),
  ], env));
  assert.equal(nextRun.runLease.status, 'acquired');
});
