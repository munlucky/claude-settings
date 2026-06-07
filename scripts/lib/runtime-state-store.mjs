import { mkdir } from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';

import { resolveDbPath } from './runtime-state-db-path.mjs';

export const RUNTIME_STATE_SCHEMA_VERSION = 1;
export const RUNTIME_STATE_SCHEMA_NAME = 'runtime-control-plane-v1';
export const DEFAULT_RUN_LEASE_TTL_MS = 30 * 60 * 1000;

const jsonText = (value) => {
  if (value === undefined || value === null || value === '') {
    return '{}';
  }
  return typeof value === 'string' ? value : JSON.stringify(value);
};

const parseJsonText = (value, fallback = {}) => {
  if (!value) {
    return fallback;
  }
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const evidenceHash = (evidence) => crypto
  .createHash('sha256')
  .update(jsonText(evidence))
  .digest('hex');

const newId = () => crypto.randomUUID();

const normalizeText = (value) => String(value || '').trim();

const nowIso = () => new Date().toISOString();

const leaseTtlMs = (value) => {
  const parsed = Number(value || process.env.MOONSHOT_RUN_LEASE_TTL_MS || DEFAULT_RUN_LEASE_TTL_MS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_RUN_LEASE_TTL_MS;
};

const leaseExpiryIso = (ttlMs) => new Date(Date.now() + leaseTtlMs(ttlMs)).toISOString();

export function degradedRuntimeStatus(reason, dbPath = resolveDbPath(), detail = '') {
  const metrics = emptyOperationalMetrics();
  metrics.metrics.db_busy_timeout_count = reason === 'db_lock_timeout' ? 1 : 0;
  const evaluatedMetrics = {
    ...metrics,
    ...buildMetricThresholds(metrics.metrics),
  };
  return {
    runtimeCapabilityStatus: {
      status: 'degraded',
      reason,
      detail,
      dbPath,
    },
    operationalMetrics: evaluatedMetrics,
    compactStatus: {
      activeContract: null,
      latestVerdict: null,
      currentBlocker: `runtime-state unavailable: ${reason}`,
      lineage: [],
      staleWarnings: [reason],
      operationalMetrics: evaluatedMetrics,
    },
    resumeBrief: {
      nextAction: 'restore runtime-state capability',
      currentBlocker: `runtime-state unavailable: ${reason}`,
      lineage: [],
      operationalMetrics: evaluatedMetrics,
    },
  };
}

async function loadDatabase() {
  if (process.env.MOONSHOT_RUNTIME_STATE_DISABLE_NATIVE === '1') {
    const error = new Error('Native sqlite support disabled');
    error.code = 'missing_native_module';
    throw error;
  }

  try {
    const module = await import('better-sqlite3');
    return module.default;
  } catch (error) {
    const wrapped = new Error(error instanceof Error ? error.message : String(error));
    wrapped.code = 'missing_native_module';
    throw wrapped;
  }
}

async function openRuntimeDatabase() {
  const dbPath = resolveDbPath();
  try {
    await mkdir(path.dirname(dbPath), { recursive: true });
  } catch (error) {
    const wrapped = new Error(error instanceof Error ? error.message : String(error));
    wrapped.code = 'unresolved_db_path';
    throw wrapped;
  }

  const Database = await loadDatabase();
  try {
    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('busy_timeout = 5000');
    return { db, dbPath };
  } catch (error) {
    const wrapped = new Error(error instanceof Error ? error.message : String(error));
    wrapped.code = /busy|locked/i.test(wrapped.message) ? 'db_lock_timeout' : 'schema_or_open_failure';
    throw wrapped;
  }
}

function applySchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE TABLE IF NOT EXISTS runs (
      run_id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL DEFAULT '',
      started_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      heartbeat_at TEXT,
      lease_expires_at TEXT,
      stale_at TEXT,
      stale_reason TEXT NOT NULL DEFAULT '',
      ended_at TEXT,
      status TEXT NOT NULL DEFAULT 'running',
      identity_json TEXT NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS goals (
      goal_id TEXT NOT NULL,
      run_id TEXT NOT NULL,
      objective_hash TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      PRIMARY KEY (run_id, goal_id),
      FOREIGN KEY (run_id) REFERENCES runs(run_id)
    );

    CREATE TABLE IF NOT EXISTS runtime_events (
      event_id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      goal_id TEXT NOT NULL,
      event_sequence INTEGER NOT NULL,
      event_type TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'info',
      payload_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      UNIQUE (run_id, event_sequence)
    );

    CREATE TABLE IF NOT EXISTS completion_decisions (
      decision_id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      goal_id TEXT NOT NULL,
      decision_sequence INTEGER NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('accepted', 'rejected', 'needs_more_evidence', 'superseded', 'revoked')),
      reason TEXT NOT NULL DEFAULT '',
      evidence_json TEXT NOT NULL DEFAULT '{}',
      evidence_hash TEXT NOT NULL DEFAULT '',
      identity_json TEXT NOT NULL DEFAULT '{}',
      writer TEXT NOT NULL DEFAULT 'runtime-state',
      supersedes_decision_id TEXT,
      revoked_at TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      UNIQUE (run_id, decision_sequence)
    );

    CREATE TABLE IF NOT EXISTS resume_snapshots (
      snapshot_id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      goal_id TEXT NOT NULL,
      snapshot_sequence INTEGER NOT NULL,
      status_json TEXT NOT NULL DEFAULT '{}',
      resume_brief_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      UNIQUE (run_id, snapshot_sequence)
    );

    CREATE TABLE IF NOT EXISTS tool_calls (
      tool_call_id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      goal_id TEXT NOT NULL,
      event_id TEXT,
      tool_group TEXT NOT NULL,
      tool_name TEXT NOT NULL,
      status TEXT NOT NULL,
      schema_mode TEXT NOT NULL CHECK (schema_mode IN ('summary', 'full', 'rejected')),
      approval_required INTEGER NOT NULL DEFAULT 0,
      payload_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE TABLE IF NOT EXISTS eval_results (
      eval_id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      goal_id TEXT NOT NULL,
      suite TEXT NOT NULL,
      status TEXT NOT NULL,
      score_json TEXT NOT NULL DEFAULT '{}',
      regression_worsened INTEGER NOT NULL DEFAULT 0,
      evidence_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE TABLE IF NOT EXISTS memory_promotion_decisions (
      decision_id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      goal_id TEXT NOT NULL,
      decision_sequence INTEGER NOT NULL,
      memory_id TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('rejected', 'ready_for_review', 'promoted', 'superseded', 'rolled_back')),
      reason TEXT NOT NULL DEFAULT '',
      evidence_json TEXT NOT NULL DEFAULT '{}',
      reviewer_json TEXT NOT NULL DEFAULT '{}',
      replay_json TEXT NOT NULL DEFAULT '{}',
      rollback_json TEXT NOT NULL DEFAULT '{}',
      scope_owner TEXT NOT NULL DEFAULT '',
      stale_after TEXT,
      supersedes_decision_id TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      UNIQUE (run_id, decision_sequence)
    );

    CREATE INDEX IF NOT EXISTS idx_runtime_events_run_goal_created_at ON runtime_events(run_id, goal_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_runtime_events_blocking ON runtime_events(run_id, goal_id, severity, created_at);
    CREATE INDEX IF NOT EXISTS idx_completion_latest ON completion_decisions(run_id, goal_id, decision_sequence DESC, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_eval_regression ON eval_results(run_id, goal_id, regression_worsened, created_at);
    CREATE INDEX IF NOT EXISTS idx_memory_promotion_latest ON memory_promotion_decisions(run_id, goal_id, memory_id, decision_sequence DESC, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_memory_promotion_stale ON memory_promotion_decisions(run_id, goal_id, stale_after, status);
  `);

  db.prepare('INSERT OR IGNORE INTO schema_migrations(version, name) VALUES (?, ?)')
    .run(RUNTIME_STATE_SCHEMA_VERSION, RUNTIME_STATE_SCHEMA_NAME);

  for (const [column, definition] of [
    ['heartbeat_at', 'TEXT'],
    ['lease_expires_at', 'TEXT'],
    ['stale_at', 'TEXT'],
    ['stale_reason', "TEXT NOT NULL DEFAULT ''"],
  ]) {
    const exists = db.prepare('PRAGMA table_info(runs)').all().some((row) => row.name === column);
    if (!exists) {
      db.prepare(`ALTER TABLE runs ADD COLUMN ${column} ${definition}`).run();
    }
  }
}

async function withRuntimeDb(work) {
  const { db, dbPath } = await openRuntimeDatabase();
  try {
    applySchema(db);
    return await work(db, dbPath);
  } finally {
    db.close();
  }
}

function ensureRunAndGoal(db, { runId, goalId, identity = {}, workspaceId = '' }) {
  const normalizedWorkspaceId = normalizeText(workspaceId);
  db.prepare('INSERT OR IGNORE INTO runs(run_id, workspace_id, identity_json) VALUES (?, ?, ?)')
    .run(runId, normalizedWorkspaceId, jsonText(identity));
  if (normalizedWorkspaceId) {
    db.prepare('UPDATE runs SET workspace_id = ? WHERE run_id = ? AND workspace_id = ?')
      .run(normalizedWorkspaceId, runId, '');
  }
  db.prepare('INSERT OR IGNORE INTO goals(run_id, goal_id) VALUES (?, ?)')
    .run(runId, goalId);
}

function nextSequence(db, table, column, runId) {
  const row = db.prepare(`SELECT COALESCE(MAX(${column}), 0) + 1 AS next FROM ${table} WHERE run_id = ?`).get(runId);
  return row.next;
}

function markRunGoalCompleted(db, runId, goalId) {
  db.prepare(`
    UPDATE goals
    SET status = 'completed', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE run_id = ? AND goal_id = ?
  `).run(runId, goalId);
  db.prepare(`
    UPDATE runs
    SET status = 'completed', ended_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE run_id = ?
  `).run(runId);
}

function markExpiredRunLeases(db, now = nowIso(), reason = 'lease_ttl_expired') {
  const expired = db.prepare(`
    SELECT
      runs.run_id,
      runs.workspace_id,
      runs.started_at,
      runs.status,
      runs.heartbeat_at,
      runs.lease_expires_at,
      goals.goal_id
    FROM runs
    LEFT JOIN goals ON goals.run_id = runs.run_id
    WHERE runs.status = 'running'
      AND runs.lease_expires_at IS NOT NULL
      AND runs.lease_expires_at <= ?
    ORDER BY runs.lease_expires_at ASC, runs.run_id ASC
  `).all(now);

  for (const run of expired) {
    db.prepare(`
      UPDATE runs
      SET status = 'stale',
          stale_at = ?,
          stale_reason = ?
      WHERE run_id = ? AND status = 'running'
    `).run(now, reason, run.run_id);
    if (run.goal_id) {
      const eventSequence = nextSequence(db, 'runtime_events', 'event_sequence', run.run_id);
      db.prepare(`
        INSERT INTO runtime_events(event_id, run_id, goal_id, event_sequence, event_type, severity, payload_json, created_at)
        VALUES (?, ?, ?, ?, 'run_lease.stale_recovered', 'warning', ?, ?)
      `).run(
        newId(),
        run.run_id,
        run.goal_id,
        eventSequence,
        jsonText({
          reason,
          workspaceId: run.workspace_id,
          leaseExpiresAt: run.lease_expires_at,
          recoveredAt: now,
        }),
        now,
      );
    }
  }

  return expired;
}

export async function initRuntimeState() {
  return withRuntimeDb((db, dbPath) => {
    const migrations = db.prepare('SELECT version, name FROM schema_migrations ORDER BY version').all();
    return {
      status: 'initialized',
      dbPath,
      schemaVersion: RUNTIME_STATE_SCHEMA_VERSION,
      migrations,
      pragmas: {
        journalMode: db.pragma('journal_mode', { simple: true }),
        busyTimeout: db.pragma('busy_timeout', { simple: true }),
      },
    };
  });
}

export async function recordRuntimeEvent({ runId, goalId, eventType, payload = {}, severity = 'info', identity = {}, workspaceId = '' }) {
  return withRuntimeDb((db, dbPath) => {
    const eventId = newId();
    const insert = db.transaction(() => {
      ensureRunAndGoal(db, { runId, goalId, identity, workspaceId });
      const eventSequence = nextSequence(db, 'runtime_events', 'event_sequence', runId);
      db.prepare(`
        INSERT INTO runtime_events(event_id, run_id, goal_id, event_sequence, event_type, severity, payload_json)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(eventId, runId, goalId, eventSequence, eventType, severity, jsonText(payload));
      return eventSequence;
    });
    const eventSequence = insert();
    return { status: 'recorded', dbPath, eventId, runId, goalId, eventSequence, eventType, severity };
  });
}

export async function recordCompletionDecision({
  runId,
  goalId,
  status,
  reason = '',
  evidence = {},
  identity = {},
  writer = 'runtime-state',
  supersedesDecisionId = null,
  manualRepair = false,
  approvalId = '',
  workspaceId = '',
}) {
  return withRuntimeDb((db, dbPath) => {
    const decisionId = newId();
    const requestedStatus = status;
    const allowedAccepted = writer === 'assess-completion' || (manualRepair && approvalId);
    const effectiveStatus = status === 'accepted' && !allowedAccepted ? 'needs_more_evidence' : status;
    const effectiveReason = status === 'accepted' && !allowedAccepted
      ? 'accepted decision requires assess-completion or approved manual repair'
      : reason;
    const evidenceJson = jsonText(evidence);
    const insert = db.transaction(() => {
      ensureRunAndGoal(db, { runId, goalId, identity, workspaceId });
      const decisionSequence = nextSequence(db, 'completion_decisions', 'decision_sequence', runId);
      db.prepare(`
        INSERT INTO completion_decisions(
          decision_id, run_id, goal_id, decision_sequence, status, reason,
          evidence_json, evidence_hash, identity_json, writer, supersedes_decision_id
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        decisionId,
        runId,
        goalId,
        decisionSequence,
        effectiveStatus,
        effectiveReason,
        evidenceJson,
        evidenceHash(evidenceJson),
        jsonText(identity),
        writer,
        supersedesDecisionId,
      );
      if (effectiveStatus === 'accepted') {
        markRunGoalCompleted(db, runId, goalId);
      }
      return decisionSequence;
    });
    const decisionSequence = insert();
    return {
      status: requestedStatus === effectiveStatus ? 'recorded' : 'downgraded',
      decisionStatus: effectiveStatus,
      requestedStatus,
      reason: effectiveReason,
      dbPath,
      decisionId,
      runId,
      goalId,
      decisionSequence,
    };
  });
}

export async function supersedeCompletionDecision({ decisionId, reason = 'superseded' }) {
  return withRuntimeDb((db, dbPath) => {
    const existing = db.prepare('SELECT * FROM completion_decisions WHERE decision_id = ?').get(decisionId);
    if (!existing) {
      return { status: 'not_found', dbPath, decisionId };
    }
    db.prepare(`
      UPDATE completion_decisions
      SET status = 'superseded', reason = ?, revoked_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE decision_id = ?
    `).run(reason, decisionId);
    return { status: 'superseded', dbPath, decisionId };
  });
}

export async function recordResumeSnapshot({ runId, goalId, status = {}, resumeBrief = {}, identity = {}, workspaceId = '' }) {
  return withRuntimeDb((db, dbPath) => {
    const snapshotId = newId();
    const insert = db.transaction(() => {
      ensureRunAndGoal(db, { runId, goalId, identity, workspaceId });
      const snapshotSequence = nextSequence(db, 'resume_snapshots', 'snapshot_sequence', runId);
      db.prepare(`
        INSERT INTO resume_snapshots(snapshot_id, run_id, goal_id, snapshot_sequence, status_json, resume_brief_json)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(snapshotId, runId, goalId, snapshotSequence, jsonText(status), jsonText(resumeBrief));
      const currentBlocker = typeof resumeBrief.currentBlocker === 'string' ? resumeBrief.currentBlocker : '';
      const isFailure = Boolean(currentBlocker)
        || status.status === 'blocked'
        || status.activeExecutionStatus === 'blocked';
      const eventSequence = nextSequence(db, 'runtime_events', 'event_sequence', runId);
      db.prepare(`
        INSERT INTO runtime_events(event_id, run_id, goal_id, event_sequence, event_type, severity, payload_json)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        newId(),
        runId,
        goalId,
        eventSequence,
        isFailure ? 'resume.failure' : 'resume.success',
        isFailure ? 'blocking' : 'info',
        jsonText({
          snapshotId,
          snapshotSequence,
          workspaceId,
          phase: resumeBrief.phase || status.phase || status.activePhaseDoc || '',
          nextAction: resumeBrief.nextAction || '',
          currentBlocker,
          reason: currentBlocker || (isFailure ? 'resume failed' : ''),
          lineage: Array.isArray(resumeBrief.lineage) ? resumeBrief.lineage : [],
          identity,
        }),
      );
      return snapshotSequence;
    });
    const snapshotSequence = insert();
    return { status: 'recorded', dbPath, snapshotId, runId, goalId, snapshotSequence };
  });
}

export async function recordToolCall({
  runId,
  goalId,
  eventId = null,
  toolGroup,
  toolName,
  status,
  schemaMode,
  approvalRequired = false,
  payload = {},
  identity = {},
  workspaceId = '',
}) {
  return withRuntimeDb((db, dbPath) => {
    const toolCallId = newId();
    db.transaction(() => {
      ensureRunAndGoal(db, { runId, goalId, identity, workspaceId });
      db.prepare(`
        INSERT INTO tool_calls(tool_call_id, run_id, goal_id, event_id, tool_group, tool_name, status, schema_mode, approval_required, payload_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(toolCallId, runId, goalId, eventId, toolGroup, toolName, status, schemaMode, approvalRequired ? 1 : 0, jsonText(payload));
    })();
    return { status: 'recorded', dbPath, toolCallId, runId, goalId };
  });
}

export async function recordEvalResult({
  runId,
  goalId,
  suite,
  status,
  score = {},
  regressionWorsened = false,
  evidence = {},
  identity = {},
  workspaceId = '',
}) {
  return withRuntimeDb((db, dbPath) => {
    const evalId = newId();
    db.transaction(() => {
      ensureRunAndGoal(db, { runId, goalId, identity, workspaceId });
      db.prepare(`
        INSERT INTO eval_results(eval_id, run_id, goal_id, suite, status, score_json, regression_worsened, evidence_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(evalId, runId, goalId, suite, status, jsonText(score), regressionWorsened ? 1 : 0, jsonText(evidence));
    })();
    return { status: 'recorded', dbPath, evalId, runId, goalId };
  });
}

function memoryPromotionValidationError({ status, evidence, reviewer, replay, rollbackPlan, scopeOwner }) {
  if (status !== 'promoted') {
    return '';
  }
  if (!scopeOwner) {
    return 'memory promotion requires scope owner';
  }
  if (evidence?.fresh !== true) {
    return 'memory promotion requires fresh evidence';
  }
  const reviewerApproved = reviewer?.approved === true
    || reviewer?.status === 'approved'
    || Boolean(normalizeText(reviewer?.approvalId));
  if (!reviewerApproved) {
    return 'memory promotion requires reviewer approval';
  }
  const replayPassed = replay?.passed === true
    || replay?.status === 'passed'
    || replay?.status === 'accepted';
  if (!replayPassed) {
    return 'memory promotion requires passing replay evidence';
  }
  const rollbackReady = Boolean(normalizeText(rollbackPlan?.strategy))
    && (
      Array.isArray(rollbackPlan?.steps)
      || Array.isArray(rollbackPlan?.removes)
      || Boolean(normalizeText(rollbackPlan?.evidencePath))
    );
  if (!rollbackReady) {
    return 'memory promotion requires rollback plan';
  }
  return '';
}

export async function recordMemoryPromotionDecision({
  runId,
  goalId,
  memoryId,
  status,
  reason = '',
  evidence = {},
  reviewer = {},
  replay = {},
  rollbackPlan = {},
  scopeOwner = '',
  staleAfter = null,
  supersedesDecisionId = null,
  identity = {},
  workspaceId = '',
}) {
  return withRuntimeDb((db, dbPath) => {
    const decisionId = newId();
    const requestedStatus = status;
    const normalizedScopeOwner = normalizeText(scopeOwner);
    const validationError = memoryPromotionValidationError({
      status,
      evidence,
      reviewer,
      replay,
      rollbackPlan,
      scopeOwner: normalizedScopeOwner,
    });
    const effectiveStatus = validationError ? 'rejected' : status;
    const effectiveReason = validationError || reason;
    const insert = db.transaction(() => {
      ensureRunAndGoal(db, { runId, goalId, identity, workspaceId });
      const decisionSequence = nextSequence(db, 'memory_promotion_decisions', 'decision_sequence', runId);
      db.prepare(`
        INSERT INTO memory_promotion_decisions(
          decision_id, run_id, goal_id, decision_sequence, memory_id, status, reason,
          evidence_json, reviewer_json, replay_json, rollback_json, scope_owner,
          stale_after, supersedes_decision_id
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        decisionId,
        runId,
        goalId,
        decisionSequence,
        memoryId,
        effectiveStatus,
        effectiveReason,
        jsonText(evidence),
        jsonText(reviewer),
        jsonText(replay),
        jsonText(rollbackPlan),
        normalizedScopeOwner,
        staleAfter || null,
        supersedesDecisionId,
      );
      const eventSequence = nextSequence(db, 'runtime_events', 'event_sequence', runId);
      db.prepare(`
        INSERT INTO runtime_events(event_id, run_id, goal_id, event_sequence, event_type, severity, payload_json)
        VALUES (?, ?, ?, ?, 'memory_promotion.decision', ?, ?)
      `).run(
        newId(),
        runId,
        goalId,
        eventSequence,
        effectiveStatus === 'rejected' ? 'warning' : 'info',
        jsonText({
          memoryId,
          requestedStatus,
          status: effectiveStatus,
          reason: effectiveReason,
          decisionId,
          staleAfter: staleAfter || null,
          scopeOwner: normalizedScopeOwner,
        }),
      );
      return { decisionSequence, eventSequence };
    });
    const { decisionSequence, eventSequence } = insert();
    return {
      status: requestedStatus === effectiveStatus ? 'recorded' : 'rejected',
      decisionStatus: effectiveStatus,
      requestedStatus,
      reason: effectiveReason,
      dbPath,
      decisionId,
      runId,
      goalId,
      memoryId,
      decisionSequence,
      eventSequence,
    };
  });
}

export async function rollbackMemoryPromotionDecision({
  runId,
  goalId,
  memoryId = '',
  decisionId = '',
  reason = 'memory promotion rolled back',
  rollbackEvidence = {},
  identity = {},
  workspaceId = '',
}) {
  return withRuntimeDb((db, dbPath) => {
    const existing = decisionId
      ? db.prepare('SELECT * FROM memory_promotion_decisions WHERE decision_id = ? AND run_id = ? AND goal_id = ?').get(decisionId, runId, goalId)
      : db.prepare(`
        SELECT *
        FROM memory_promotion_decisions
        WHERE run_id = ?
          AND goal_id = ?
          AND memory_id = ?
          AND status IN ('ready_for_review', 'promoted')
        ORDER BY decision_sequence DESC, created_at DESC
        LIMIT 1
      `).get(runId, goalId, memoryId);

    if (!existing) {
      return { status: 'not_found', dbPath, runId, goalId, memoryId, decisionId };
    }

    const rollbackDecisionId = newId();
    const insert = db.transaction(() => {
      ensureRunAndGoal(db, { runId, goalId, identity, workspaceId });
      db.prepare(`
        UPDATE memory_promotion_decisions
        SET status = 'superseded', reason = ?
        WHERE decision_id = ?
      `).run(reason, existing.decision_id);
      const decisionSequence = nextSequence(db, 'memory_promotion_decisions', 'decision_sequence', runId);
      db.prepare(`
        INSERT INTO memory_promotion_decisions(
          decision_id, run_id, goal_id, decision_sequence, memory_id, status, reason,
          evidence_json, reviewer_json, replay_json, rollback_json, scope_owner,
          stale_after, supersedes_decision_id
        )
        VALUES (?, ?, ?, ?, ?, 'rolled_back', ?, ?, ?, ?, ?, ?, NULL, ?)
      `).run(
        rollbackDecisionId,
        runId,
        goalId,
        decisionSequence,
        existing.memory_id,
        reason,
        existing.evidence_json,
        existing.reviewer_json,
        existing.replay_json,
        jsonText(rollbackEvidence),
        existing.scope_owner,
        existing.decision_id,
      );
      const eventSequence = nextSequence(db, 'runtime_events', 'event_sequence', runId);
      db.prepare(`
        INSERT INTO runtime_events(event_id, run_id, goal_id, event_sequence, event_type, severity, payload_json)
        VALUES (?, ?, ?, ?, 'memory_promotion.rollback', 'warning', ?)
      `).run(
        newId(),
        runId,
        goalId,
        eventSequence,
        jsonText({
          memoryId: existing.memory_id,
          supersedesDecisionId: existing.decision_id,
          rollbackDecisionId,
          reason,
        }),
      );
      return { decisionSequence, eventSequence };
    });
    const { decisionSequence, eventSequence } = insert();
    return {
      status: 'rolled_back',
      dbPath,
      runId,
      goalId,
      memoryId: existing.memory_id,
      decisionId: rollbackDecisionId,
      supersedesDecisionId: existing.decision_id,
      decisionSequence,
      eventSequence,
    };
  });
}

function readLatestDecision(db, runId, goalId) {
  return db.prepare(`
    SELECT *
    FROM completion_decisions
    WHERE run_id = ?
      AND goal_id = ?
      AND revoked_at IS NULL
      AND status NOT IN ('superseded', 'revoked')
    ORDER BY decision_sequence DESC, created_at DESC
    LIMIT 1
  `).get(runId, goalId);
}

function readBlockingEvent(db, runId, goalId) {
  return readBlockingEvents(db, runId, goalId)[0] || null;
}

function readBlockingEvents(db, runId, goalId) {
  const rows = db.prepare(`
    SELECT event_id, event_type, severity, payload_json, created_at, event_sequence
    FROM runtime_events
    WHERE run_id = ?
      AND goal_id = ?
      AND (severity = 'blocking' OR event_type IN ('blocker.opened', 'blocker.resolved', 'blocker.superseded', 'blocker.reopened'))
    ORDER BY event_sequence ASC, created_at ASC
  `).all(runId, goalId);
  const active = new Map();

  for (const row of rows) {
    const payload = parseJsonText(row.payload_json, {});
    const fingerprint = payload.blockerFingerprint || payload.fingerprint || payload.blockerId || '';
    const lifecycleEvent = row.event_type.startsWith('blocker.');
    if (lifecycleEvent && fingerprint) {
      if (row.event_type === 'blocker.opened' || row.event_type === 'blocker.reopened') {
        active.set(fingerprint, { ...row, blockerFingerprint: fingerprint, payload });
      } else if (row.event_type === 'blocker.resolved' || row.event_type === 'blocker.superseded') {
        active.delete(fingerprint);
      }
      continue;
    }
    if (row.severity === 'blocking') {
      active.set(`legacy:${row.event_id}`, { ...row, blockerFingerprint: fingerprint, payload });
    }
  }

  return [...active.values()].sort((left, right) => (
    right.event_sequence - left.event_sequence
    || String(right.created_at).localeCompare(String(left.created_at))
  ));
}

function readWorsenedEval(db, runId, goalId) {
  return db.prepare(`
    SELECT *
    FROM eval_results
    WHERE run_id = ? AND goal_id = ? AND regression_worsened = 1
    ORDER BY created_at DESC
    LIMIT 1
  `).get(runId, goalId);
}

function readEvalRegressions(db, runId, goalId) {
  return db.prepare(`
    SELECT eval_id, suite, status, score_json, evidence_json, created_at
    FROM eval_results
    WHERE run_id = ? AND goal_id = ? AND regression_worsened = 1
    ORDER BY created_at DESC
  `).all(runId, goalId);
}

function readLatestEval(db, runId, goalId) {
  return db.prepare(`
    SELECT *
    FROM eval_results
    WHERE run_id = ? AND goal_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `).get(runId, goalId);
}

function readStaleMemoryPromotions(db, runId, goalId, now) {
  return db.prepare(`
    SELECT latest.*
    FROM memory_promotion_decisions latest
    INNER JOIN (
      SELECT memory_id, MAX(decision_sequence) AS decision_sequence
      FROM memory_promotion_decisions
      WHERE run_id = ? AND goal_id = ?
      GROUP BY memory_id
    ) grouped
      ON grouped.memory_id = latest.memory_id
      AND grouped.decision_sequence = latest.decision_sequence
    WHERE latest.run_id = ?
      AND latest.goal_id = ?
      AND latest.status IN ('ready_for_review', 'promoted')
      AND latest.stale_after IS NOT NULL
      AND latest.stale_after <= ?
    ORDER BY latest.stale_after ASC, latest.decision_sequence DESC
  `).all(runId, goalId, runId, goalId, now);
}

function readRolledBackContextPackWarnings(db, runId, goalId) {
  return db.prepare(`
    SELECT memory_id, rollback_json
    FROM memory_promotion_decisions
    WHERE run_id = ?
      AND goal_id = ?
      AND status = 'rolled_back'
    ORDER BY decision_sequence DESC, created_at DESC
  `).all(runId, goalId)
    .map((row) => {
      const rollback = parseJsonText(row.rollback_json, {});
      const contextPackRef = normalizeText(rollback.contextPackRef);
      if (!contextPackRef) {
        return '';
      }
      return `stale context pack projection: ${contextPackRef} from rolled back memory promotion: ${row.memory_id}`;
    })
    .filter(Boolean);
}

function readUnauthorizedApprovalToolCall(db, runId, goalId) {
  const rows = db.prepare(`
    SELECT *
    FROM tool_calls
    WHERE run_id = ? AND goal_id = ? AND approval_required = 1
    ORDER BY created_at DESC
  `).all(runId, goalId);

  return rows.find((row) => {
    const payload = parseJsonText(row.payload_json, {});
    return !payload.approvalId;
  }) || null;
}

function readPendingApprovalToolCalls(db, runId, goalId) {
  const rows = db.prepare(`
    SELECT *
    FROM tool_calls
    WHERE run_id = ? AND goal_id = ? AND approval_required = 1
    ORDER BY created_at DESC
  `).all(runId, goalId);

  return rows
    .map((row) => ({
      toolCallId: row.tool_call_id,
      toolGroup: row.tool_group,
      toolName: row.tool_name,
      status: row.status,
      payload: parseJsonText(row.payload_json, {}),
      createdAt: row.created_at,
    }))
    .filter((row) => !row.payload.approvalId);
}

function readLatestVerifierEvidence(db, runId, goalId) {
  return db.prepare(`
    SELECT *
    FROM runtime_events
    WHERE run_id = ?
      AND goal_id = ?
      AND event_type IN ('verification.evidence', 'verifier.evidence', 'verification.verdict')
    ORDER BY event_sequence DESC, created_at DESC
    LIMIT 1
  `).get(runId, goalId);
}

function verificationPlaneBlocker(evidencePayload) {
  if (!evidencePayload || evidencePayload.fresh !== true) {
    return '';
  }

  const requiredPlanes = Array.isArray(evidencePayload.completionAuthorityRequiredPlanes)
    ? evidencePayload.completionAuthorityRequiredPlanes
    : ['unit', 'package', 'installer', 'browser', 'security', 'quality'];
  const planes = Array.isArray(evidencePayload.planes) ? evidencePayload.planes : [];
  const planeByName = new Map(planes.map((plane) => [plane.plane, plane]));
  const missingPlanes = Array.isArray(evidencePayload.missingCompletionAuthorityPlanes)
    ? evidencePayload.missingCompletionAuthorityPlanes
    : requiredPlanes.filter((plane) => !planeByName.has(plane));

  if (missingPlanes.length > 0) {
    return `missing verification plane: ${missingPlanes[0]}`;
  }

  const failedPlanes = Array.isArray(evidencePayload.failedPlanes)
    ? evidencePayload.failedPlanes
    : planes
      .filter((plane) => requiredPlanes.includes(plane.plane))
      .filter((plane) => plane.status !== 'passed')
      .map((plane) => ({ plane: plane.plane, status: plane.status || 'missing' }));
  if (failedPlanes.length > 0) {
    return `failed verification plane: ${failedPlanes[0].plane}`;
  }

  const securityBlockers = Array.isArray(evidencePayload.securityBlockers)
    ? evidencePayload.securityBlockers
    : [];
  if (securityBlockers.length > 0) {
    return securityBlockers[0].reason || 'security verification blocker';
  }

  if (evidencePayload.requiredChecksPassed !== true) {
    return evidencePayload.reason || 'verification checks did not pass';
  }

  return '';
}

function readLatestSnapshot(db, runId, goalId) {
  return db.prepare(`
    SELECT *
    FROM resume_snapshots
    WHERE run_id = ? AND goal_id = ?
    ORDER BY snapshot_sequence DESC, created_at DESC
    LIMIT 1
  `).get(runId, goalId);
}

function average(values) {
  const numeric = values.filter((value) => Number.isFinite(value));
  return numeric.length === 0 ? null : numeric.reduce((sum, value) => sum + value, 0) / numeric.length;
}

function rate(numerator, denominator) {
  return denominator > 0 ? numerator / denominator : 0;
}

function buildMetricThresholds(metrics) {
  const thresholds = {
    completion_false_positive_rate: {
      value: metrics.completion_false_positive_rate,
      warning: metrics.completion_false_positive_rate > 0,
      blocker: metrics.completion_false_positive_rate > 0,
      releaseBlocker: metrics.completion_false_positive_rate > 0,
    },
    eval_regression_worsened_count: {
      value: metrics.eval_regression_worsened_count,
      warning: metrics.eval_regression_worsened_count > 0,
      blocker: metrics.eval_regression_worsened_count > 0,
      releaseBlocker: metrics.eval_regression_worsened_count > 0,
    },
    security_open_alerts: {
      value: metrics.security_open_alerts,
      warning: metrics.security_open_alerts > 0,
      blocker: metrics.security_open_alerts > 0,
      releaseBlocker: metrics.security_open_alerts > 0,
    },
    run_resume_success_rate: {
      value: metrics.run_resume_success_rate,
      warning: metrics.run_resume_success_rate < 0.9,
      blocker: metrics.run_resume_success_rate < 0.75,
      releaseBlocker: metrics.run_resume_success_rate < 0.75,
    },
    tool_invalid_call_rate: {
      value: metrics.tool_invalid_call_rate,
      warning: metrics.tool_invalid_call_rate > 0,
      blocker: metrics.tool_invalid_call_rate >= 0.5,
      releaseBlocker: false,
    },
    prompt_cache_hit_ratio: {
      value: metrics.prompt_cache_hit_ratio,
      warning: metrics.prompt_cache_hit_ratio !== null && metrics.prompt_cache_hit_ratio < 0.5,
      blocker: false,
      releaseBlocker: false,
    },
    context_compaction_ratio: {
      value: metrics.context_compaction_ratio,
      warning: metrics.context_compaction_ratio !== null && (metrics.context_compaction_ratio <= 0 || metrics.context_compaction_ratio > 1),
      blocker: metrics.context_required_fields_lost_count > 0,
      releaseBlocker: metrics.context_required_fields_lost_count > 0,
    },
    db_busy_timeout_count: {
      value: metrics.db_busy_timeout_count,
      warning: metrics.db_busy_timeout_count > 0,
      blocker: metrics.db_busy_timeout_count > 0,
      releaseBlocker: metrics.db_busy_timeout_count > 0,
    },
    browser_trace_flaky_rate: {
      value: metrics.browser_trace_flaky_rate,
      warning: metrics.browser_trace_flaky_rate > 0,
      blocker: metrics.browser_trace_flaky_rate >= 0.5,
      releaseBlocker: metrics.browser_trace_flaky_rate > 0,
    },
    memory_promotion_rollback_count: {
      value: metrics.memory_promotion_rollback_count,
      warning: metrics.memory_promotion_rollback_count > 0,
      blocker: false,
      releaseBlocker: false,
    },
  };

  return {
    thresholds,
    warningMetrics: Object.entries(thresholds).filter(([, value]) => value.warning).map(([key]) => key),
    blockerMetrics: Object.entries(thresholds).filter(([, value]) => value.blocker).map(([key]) => key),
    releaseBlockerMetrics: Object.entries(thresholds).filter(([, value]) => value.releaseBlocker).map(([key]) => key),
  };
}

function emptyOperationalMetrics() {
  const metrics = {
    completion_false_positive_rate: 0,
    run_resume_success_rate: 1,
    tool_invalid_call_rate: 0,
    prompt_cache_hit_ratio: null,
    context_compaction_ratio: null,
    context_required_fields_lost_count: 0,
    db_busy_timeout_count: 0,
    browser_trace_flaky_rate: 0,
    security_open_alerts: 0,
    eval_regression_worsened_count: 0,
    memory_promotion_rollback_count: 0,
  };
  return {
    source: 'runtime-state.sqlite',
    metrics,
    ...buildMetricThresholds(metrics),
  };
}

function buildOperationalMetrics(db, runId, goalId) {
  if (!runId || !goalId) {
    return emptyOperationalMetrics();
  }

  const evalRows = db.prepare(`
    SELECT suite, status, regression_worsened, evidence_json
    FROM eval_results
    WHERE run_id = ? AND goal_id = ?
  `).all(runId, goalId);
  const toolRows = db.prepare(`
    SELECT status
    FROM tool_calls
    WHERE run_id = ? AND goal_id = ?
  `).all(runId, goalId);
  const eventRows = db.prepare(`
    SELECT event_type, severity, payload_json
    FROM runtime_events
    WHERE run_id = ? AND goal_id = ?
  `).all(runId, goalId);
  const rollbackRow = db.prepare(`
    SELECT COUNT(*) AS count
    FROM memory_promotion_decisions
    WHERE run_id = ? AND goal_id = ? AND status = 'rolled_back'
  `).get(runId, goalId);

  const metricPayloads = eventRows
    .filter((row) => row.event_type === 'context.prompt_metrics' || row.event_type === 'context.compaction')
    .map((row) => parseJsonText(row.payload_json, {}));
  const promptHits = metricPayloads.filter((payload) => payload.metrics?.promptCacheHit === true || payload.promptCacheHit === true).length;
  const promptTotal = metricPayloads.filter((payload) => payload.metrics?.promptCacheHit !== undefined || payload.promptCacheHit !== undefined).length;
  const compactionRatios = metricPayloads
    .map((payload) => Number(payload.metrics?.contextCompactionRatio ?? payload.contextCompactionRatio))
    .filter((value) => Number.isFinite(value));
  const requiredFieldsLost = metricPayloads
    .map((payload) => payload.metrics?.lostRequiredFields ?? payload.lostRequiredFields ?? [])
    .filter((fields) => Array.isArray(fields))
    .reduce((sum, fields) => sum + fields.length, 0);

  const resumeEvents = eventRows.filter((row) => row.event_type === 'resume.success' || row.event_type === 'resume.failure');
  const resumeSuccess = resumeEvents.filter((row) => row.event_type === 'resume.success').length;
  const dbBusyTimeoutCount = eventRows.filter((row) => {
    const payload = parseJsonText(row.payload_json, {});
    return row.event_type === 'runtime.db_busy_timeout'
      || payload.reason === 'db_lock_timeout'
      || payload.runtimeCapabilityStatus?.reason === 'db_lock_timeout';
  }).length;
  const browserTraceEvents = eventRows.filter((row) => row.event_type === 'browser.trace');
  const browserFlakyEvents = browserTraceEvents.filter((row) => {
    const payload = parseJsonText(row.payload_json, {});
    return payload.flaky === true || payload.status === 'flaky';
  }).length;
  const securityOpenAlerts = eventRows
    .filter((row) => row.event_type === 'security.review' || row.event_type === 'verification.evidence')
    .map((row) => parseJsonText(row.payload_json, {}))
    .reduce((sum, payload) => {
      if (Array.isArray(payload.openAlerts)) {
        return sum + payload.openAlerts.length;
      }
      if (Array.isArray(payload.security?.openAlerts)) {
        return sum + payload.security.openAlerts.length;
      }
      if (Array.isArray(payload.security?.blockers)) {
        return sum + payload.security.blockers.length;
      }
      const securityPlane = Array.isArray(payload.planes)
        ? payload.planes.find((plane) => plane.plane === 'security')
        : null;
      return sum + (Array.isArray(securityPlane?.blockers) ? securityPlane.blockers.length : 0);
    }, 0);
  const completionFalsePositiveCount = evalRows.filter((row) => (
    /completion[-_ ]?false[-_ ]?positive/i.test(row.suite)
    || parseJsonText(row.evidence_json, {}).category === 'completion_false_positive'
  ) && (row.status === 'failed' || row.regression_worsened === 1)).length;

  const metrics = {
    completion_false_positive_rate: rate(completionFalsePositiveCount, Math.max(1, evalRows.length)),
    run_resume_success_rate: resumeEvents.length === 0 ? 1 : rate(resumeSuccess, resumeEvents.length),
    tool_invalid_call_rate: rate(toolRows.filter((row) => row.status === 'rejected' || row.status === 'invalid').length, toolRows.length),
    prompt_cache_hit_ratio: promptTotal === 0 ? null : rate(promptHits, promptTotal),
    context_compaction_ratio: average(compactionRatios),
    context_required_fields_lost_count: requiredFieldsLost,
    db_busy_timeout_count: dbBusyTimeoutCount,
    browser_trace_flaky_rate: rate(browserFlakyEvents, browserTraceEvents.length),
    security_open_alerts: securityOpenAlerts,
    eval_regression_worsened_count: evalRows.filter((row) => row.regression_worsened === 1).length,
    memory_promotion_rollback_count: rollbackRow?.count ?? 0,
  };

  return {
    source: 'runtime-state.sqlite',
    metrics,
    ...buildMetricThresholds(metrics),
  };
}

function readActiveRuns(db, { goalId = '', workspaceId = '', now = nowIso() } = {}) {
  const where = [
    "runs.status = 'running'",
    'runs.lease_expires_at IS NOT NULL',
    'runs.lease_expires_at > ?',
  ];
  const params = [now];
  if (goalId) {
    where.push('goals.goal_id = ?');
    params.push(goalId);
  }
  if (workspaceId) {
    where.push('runs.workspace_id = ?');
    params.push(workspaceId);
  }
  return db.prepare(`
    SELECT
      runs.run_id,
      runs.workspace_id,
      runs.started_at,
      runs.heartbeat_at,
      runs.lease_expires_at,
      runs.status,
      goals.goal_id
    FROM runs
    LEFT JOIN goals ON goals.run_id = runs.run_id
    WHERE ${where.join(' AND ')}
    ORDER BY runs.started_at DESC, runs.run_id DESC
  `).all(...params);
}

function readStaleRuns(db, { goalId = '', workspaceId = '', now = nowIso() } = {}) {
  const where = [
    "(runs.status = 'stale' OR (runs.status = 'running' AND runs.lease_expires_at IS NOT NULL AND runs.lease_expires_at <= ?))",
  ];
  const params = [now];
  if (goalId) {
    where.push('goals.goal_id = ?');
    params.push(goalId);
  }
  if (workspaceId) {
    where.push('runs.workspace_id = ?');
    params.push(workspaceId);
  }
  return db.prepare(`
    SELECT
      runs.run_id,
      runs.workspace_id,
      runs.started_at,
      runs.heartbeat_at,
      runs.lease_expires_at,
      runs.stale_at,
      runs.stale_reason,
      CASE
        WHEN runs.status = 'running' AND runs.lease_expires_at <= ? THEN 'expired'
        ELSE runs.status
      END AS status,
      goals.goal_id
    FROM runs
    LEFT JOIN goals ON goals.run_id = runs.run_id
    WHERE ${where.join(' AND ')}
    ORDER BY COALESCE(runs.stale_at, runs.lease_expires_at, runs.started_at) DESC, runs.run_id DESC
  `).all(now, ...params);
}

export async function acquireRunLease({
  runId,
  goalId,
  workspaceId = '',
  identity = {},
  allowParallel = false,
  leaseTtlMs: ttlMs = undefined,
}) {
  return withRuntimeDb((db, dbPath) => {
    const current = nowIso();
    const recovered = markExpiredRunLeases(db, current);
    const expiresAt = leaseExpiryIso(ttlMs);
    const activeConflict = readActiveRuns(db, { goalId, now: current })
      .find((run) => run.run_id !== runId);
    if (activeConflict && !allowParallel) {
      return {
        status: 'blocked',
        dbPath,
        runId,
        goalId,
        workspaceId,
        reason: `active run already exists for goal ${goalId}: ${activeConflict.run_id}`,
        activeRun: activeConflict,
        recoveredStaleRuns: recovered,
      };
    }

    db.transaction(() => {
      ensureRunAndGoal(db, { runId, goalId, identity, workspaceId });
      db.prepare(`
        UPDATE runs
        SET status = 'running',
            heartbeat_at = ?,
            lease_expires_at = ?,
            stale_at = NULL,
            stale_reason = ''
        WHERE run_id = ?
      `).run(current, expiresAt, runId);
    })();
    return {
      status: activeConflict ? 'parallel_allowed' : 'acquired',
      dbPath,
      runId,
      goalId,
      workspaceId,
      heartbeatAt: current,
      leaseExpiresAt: expiresAt,
      activeRun: activeConflict || null,
      recoveredStaleRuns: recovered,
    };
  });
}

export async function heartbeatRunLease({ runId, goalId, leaseTtlMs: ttlMs = undefined }) {
  return withRuntimeDb((db, dbPath) => {
    const current = nowIso();
    markExpiredRunLeases(db, current);
    const expiresAt = leaseExpiryIso(ttlMs);
    const run = db.prepare(`
      SELECT runs.*, goals.goal_id
      FROM runs
      LEFT JOIN goals ON goals.run_id = runs.run_id
      WHERE runs.run_id = ? AND goals.goal_id = ?
    `).get(runId, goalId);
    if (!run) {
      return { status: 'not_found', dbPath, runId, goalId };
    }
    if (run.status !== 'running') {
      return { status: 'not_running', dbPath, runId, goalId, runStatus: run.status };
    }
    db.prepare(`
      UPDATE runs
      SET heartbeat_at = ?,
          lease_expires_at = ?,
          stale_at = NULL,
          stale_reason = ''
      WHERE run_id = ?
    `).run(current, expiresAt, runId);
    return { status: 'heartbeat_recorded', dbPath, runId, goalId, heartbeatAt: current, leaseExpiresAt: expiresAt };
  });
}

export async function cleanupStaleRunLeases({ reason = 'lease_ttl_expired' } = {}) {
  return withRuntimeDb((db, dbPath) => {
    const current = nowIso();
    const staleRuns = markExpiredRunLeases(db, current, reason);
    return {
      status: 'cleaned',
      dbPath,
      staleRuns,
      cleanedCount: staleRuns.length,
      cleanedAt: current,
    };
  });
}

export async function assessCompletionAuthority({ runId, goalId }) {
  return withRuntimeDb((db, dbPath) => {
    const blockingEvent = readBlockingEvent(db, runId, goalId);
    if (blockingEvent) {
      const payload = parseJsonText(blockingEvent.payload_json);
      return {
        status: 'rejected',
        dbPath,
        runId,
        goalId,
        reason: payload.reason || `blocking event: ${blockingEvent.event_type}`,
        authoritySource: 'runtime-state.sqlite',
      };
    }

    const worsenedEval = readWorsenedEval(db, runId, goalId);
    if (worsenedEval) {
      return {
        status: 'rejected',
        dbPath,
        runId,
        goalId,
        reason: `eval regression worsened: ${worsenedEval.suite}`,
        authoritySource: 'runtime-state.sqlite',
      };
    }

    const unauthorizedToolCall = readUnauthorizedApprovalToolCall(db, runId, goalId);
    if (unauthorizedToolCall) {
      return {
        status: 'rejected',
        dbPath,
        runId,
        goalId,
        reason: `approval required for tool call: ${unauthorizedToolCall.tool_name}`,
        authoritySource: 'runtime-state.sqlite',
      };
    }

    const verifierEvidence = readLatestVerifierEvidence(db, runId, goalId);
    const evidencePayload = parseJsonText(verifierEvidence?.payload_json, {});
    if (evidencePayload.stale === true || evidencePayload.superseded === true) {
      return {
        status: 'rejected',
        dbPath,
        runId,
        goalId,
        reason: evidencePayload.staleReason || 'stale verifier evidence',
        authoritySource: 'runtime-state.sqlite',
      };
    }
    if (evidencePayload.activeIdentityPresent === true && evidencePayload.identityMatches === false) {
      return {
        status: 'rejected',
        dbPath,
        runId,
        goalId,
        reason: 'identity mismatch',
        authoritySource: 'runtime-state.sqlite',
      };
    }
    const planeBlocker = verificationPlaneBlocker(evidencePayload);
    if (planeBlocker) {
      return {
        status: 'rejected',
        dbPath,
        runId,
        goalId,
        reason: planeBlocker,
        authoritySource: 'runtime-state.sqlite',
      };
    }
    const evidenceIdentity = evidencePayload.identity && typeof evidencePayload.identity === 'object'
      ? evidencePayload.identity
      : {};
    if (evidencePayload.fresh === true
      && evidencePayload.requiredChecksPassed === true
      && (evidencePayload.activeIdentityPresent !== true || Object.keys(evidenceIdentity).length === 0)) {
      return {
        status: 'rejected',
        dbPath,
        runId,
        goalId,
        reason: 'missing active identity',
        authoritySource: 'runtime-state.sqlite',
      };
    }

    const latest = readLatestDecision(db, runId, goalId);
    if ((!latest || latest.status !== 'accepted') && evidencePayload.fresh === true && evidencePayload.requiredChecksPassed === true && evidencePayload.identityMatches !== false) {
      const decisionId = newId();
      const evidenceJson = jsonText(evidencePayload);
      const hash = evidenceHash(evidenceJson);
      const revokedSameEvidence = db.prepare(`
        SELECT decision_id, status
        FROM completion_decisions
        WHERE run_id = ?
          AND goal_id = ?
          AND evidence_hash = ?
          AND (status IN ('superseded', 'revoked') OR revoked_at IS NOT NULL)
        ORDER BY decision_sequence DESC, created_at DESC
        LIMIT 1
      `).get(runId, goalId, hash);
      if (revokedSameEvidence) {
        return {
          status: 'rejected',
          dbPath,
          runId,
          goalId,
          decisionId: revokedSameEvidence.decision_id,
          reason: `evidence ${revokedSameEvidence.status}`,
          authoritySource: 'runtime-state.sqlite',
        };
      }
      const decisionSequence = db.transaction(() => {
        ensureRunAndGoal(db, { runId, goalId, identity: evidencePayload.identity || {} });
        const next = nextSequence(db, 'completion_decisions', 'decision_sequence', runId);
        db.prepare(`
          INSERT INTO completion_decisions(
            decision_id, run_id, goal_id, decision_sequence, status, reason,
            evidence_json, evidence_hash, identity_json, writer
          )
          VALUES (?, ?, ?, ?, 'accepted', ?, ?, ?, ?, 'assess-completion')
        `).run(
          decisionId,
          runId,
          goalId,
          next,
          evidencePayload.reason || 'fresh verifier evidence accepted',
          evidenceJson,
          hash,
          jsonText(evidencePayload.identity || {}),
        );
        markRunGoalCompleted(db, runId, goalId);
        return next;
      })();
      return {
        status: 'accepted',
        dbPath,
        runId,
        goalId,
        decisionId,
        decisionSequence,
        evidenceHash: hash,
        reason: evidencePayload.reason || 'fresh verifier evidence accepted',
        authoritySource: 'runtime-state.sqlite',
      };
    }

    if (!latest) {
      return {
        status: 'needs_more_evidence',
        dbPath,
        runId,
        goalId,
        reason: 'missing accepted completion decision',
        authoritySource: 'runtime-state.sqlite',
      };
    }

    return {
      status: latest.status,
      dbPath,
      runId,
      goalId,
      decisionId: latest.decision_id,
      evidenceHash: latest.evidence_hash,
      reason: latest.reason,
      authoritySource: 'runtime-state.sqlite',
    };
  });
}

export async function buildRuntimeStatusReadModel({ runId = '', goalId = '' } = {}) {
  try {
    return await withRuntimeDb((db, dbPath) => {
      const latest = runId && goalId ? readLatestDecision(db, runId, goalId) : null;
      const blockingEvent = runId && goalId ? readBlockingEvent(db, runId, goalId) : null;
      const blockingEvents = runId && goalId ? readBlockingEvents(db, runId, goalId) : [];
      const worsenedEval = runId && goalId ? readWorsenedEval(db, runId, goalId) : null;
      const evalRegressions = runId && goalId ? readEvalRegressions(db, runId, goalId) : [];
      const latestEval = runId && goalId ? readLatestEval(db, runId, goalId) : null;
      const snapshot = runId && goalId ? readLatestSnapshot(db, runId, goalId) : null;
      const current = nowIso();
      const activeRuns = readActiveRuns(db, { now: current });
      const staleRuns = readStaleRuns(db, { now: current });
      const pendingApprovals = runId && goalId ? readPendingApprovalToolCalls(db, runId, goalId) : [];
      const operationalMetrics = buildOperationalMetrics(db, runId, goalId);
      const staleMemoryPromotions = runId && goalId ? readStaleMemoryPromotions(db, runId, goalId, current) : [];
      const memoryWarnings = staleMemoryPromotions.map((memory) => `stale memory promotion: ${memory.memory_id}`);
      const contextPackWarnings = runId && goalId ? readRolledBackContextPackWarnings(db, runId, goalId) : [];
      const resumeBrief = parseJsonText(snapshot?.resume_brief_json, {});
      const snapshotStatus = parseJsonText(snapshot?.status_json, {});
      const blockerPayload = parseJsonText(blockingEvent?.payload_json, {});
      const latestEvalStatus = latestEval ? {
        evalId: latestEval.eval_id,
        suite: latestEval.suite,
        status: latestEval.status,
        score: parseJsonText(latestEval.score_json, {}),
        regressionWorsened: latestEval.regression_worsened === 1,
        evidence: parseJsonText(latestEval.evidence_json, {}),
      } : null;
      const latestStatus = latest ? {
        status: latest.status,
        decisionId: latest.decision_id,
        evidenceHash: latest.evidence_hash,
        reason: latest.reason,
        authoritySource: 'runtime-state.sqlite',
        stale: false,
      } : null;
      const currentBlocker = blockerPayload.reason
        || (worsenedEval ? `eval regression worsened: ${worsenedEval.suite}` : '')
        || (latest && latest.status !== 'accepted' ? latest.reason : '')
        || '';
      const contextProjection = {
        objective: resumeBrief.objective || snapshotStatus.objective || '',
        phase: resumeBrief.phase || snapshotStatus.phase || snapshotStatus.activePhaseDoc || '',
        assumptions: Array.isArray(resumeBrief.assumptions) ? resumeBrief.assumptions : (Array.isArray(snapshotStatus.assumptions) ? snapshotStatus.assumptions : []),
        evidence: Array.isArray(resumeBrief.evidence) ? resumeBrief.evidence : (Array.isArray(snapshotStatus.evidence) ? snapshotStatus.evidence : []),
        changedFiles: Array.isArray(resumeBrief.changedFiles) ? resumeBrief.changedFiles : (Array.isArray(snapshotStatus.changedFiles) ? snapshotStatus.changedFiles : []),
        openRisks: Array.isArray(resumeBrief.openRisks) ? resumeBrief.openRisks : (Array.isArray(snapshotStatus.openRisks) ? snapshotStatus.openRisks : []),
        projectionFreshness: resumeBrief.projectionFreshness || snapshotStatus.projectionFreshness || { stale: false, source: 'runtime-state.sqlite' },
      };

      return {
        runtimeCapabilityStatus: {
          status: 'available',
          dbPath,
          schemaVersion: RUNTIME_STATE_SCHEMA_VERSION,
          activeRuns,
          staleRuns,
        },
        operationalMetrics,
        compactStatus: {
          activeContract: runId && goalId ? { runId, goalId, authoritySource: 'runtime-state.sqlite' } : null,
          activeRuns,
          staleRuns,
          blockingEvents: blockingEvents.map((event) => ({
            eventId: event.event_id,
            eventType: event.event_type,
            blockerFingerprint: event.blockerFingerprint || '',
            reason: parseJsonText(event.payload_json, {}).reason || event.event_type,
            nextAction: parseJsonText(event.payload_json, {}).nextAction || '',
            createdAt: event.created_at,
          })),
          pendingApprovals,
          evalRegressions: evalRegressions.map((row) => ({
            evalId: row.eval_id,
            suite: row.suite,
            status: row.status,
            score: parseJsonText(row.score_json, {}),
            evidence: parseJsonText(row.evidence_json, {}),
            createdAt: row.created_at,
          })),
          latestVerdict: latestStatus,
          latestEval: latestEvalStatus,
          currentBlocker,
          ...contextProjection,
          lineage: Array.isArray(resumeBrief.lineage) ? resumeBrief.lineage : [runId, goalId].filter(Boolean),
          staleWarnings: [
            ...staleRuns.map((run) => `stale run lease: ${run.run_id}`),
            ...memoryWarnings,
            ...contextPackWarnings,
          ],
          memoryWarnings: [
            ...memoryWarnings,
            ...contextPackWarnings,
          ],
          operationalMetrics,
        },
        resumeBrief: {
          nextAction: resumeBrief.nextAction || blockerPayload.nextAction || (currentBlocker ? 'collect fresh evidence' : 'initialize runtime state'),
          currentBlocker: resumeBrief.currentBlocker || currentBlocker,
          ...contextProjection,
          lineage: Array.isArray(resumeBrief.lineage) ? resumeBrief.lineage : [runId, goalId].filter(Boolean),
          memoryWarnings: [
            ...memoryWarnings,
            ...contextPackWarnings,
          ],
          operationalMetrics,
        },
      };
    });
  } catch (error) {
    return degradedRuntimeStatus(error.code || 'schema_mismatch', resolveDbPath(), error.message);
  }
}
