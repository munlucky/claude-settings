#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { nowIsoSeconds, nowMs } from './lib/clock.mjs';

const DEFAULT_DB_PATH = '.claude/runtime-state.sqlite';
const DEFAULT_STATUS_FILE = '.claude/docs/phase-status.yaml';
const VALID_GOAL_STATUSES = new Set(['active', 'paused', 'budget_limited', 'complete']);
const TERMINAL_LEASE_COMPLETION_STATUSES = new Set([
  'blocked',
  'completed',
  'failed',
  'stale',
  'superseded',
  'superseded-by-local-fallback',
  'verification_blocked',
  'runtime_unhealthy',
]);

function sqliteUnavailableError(error) {
  const detail = error instanceof Error ? error.message : String(error);
  return new Error(`node:sqlite unavailable; DB-backed goal runtime cannot run (${detail})`);
}

async function loadSqlite() {
  try {
    return await import('node:sqlite');
  } catch (error) {
    throw sqliteUnavailableError(error);
  }
}

function nowIso() {
  return nowIsoSeconds();
}

function resolveDbPath(dbPath = process.env.PHASE_RUNTIME_DB || DEFAULT_DB_PATH) {
  return path.resolve(dbPath || DEFAULT_DB_PATH);
}

function resolveStatusFile(statusFile = DEFAULT_STATUS_FILE) {
  return path.resolve(statusFile || DEFAULT_STATUS_FILE);
}

function shellQuote(value) {
  if (value === undefined || value === null) {
    return "''";
  }
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function printAssignments(payload) {
  for (const [key, value] of Object.entries(payload || {})) {
    process.stdout.write(`${key}=${shellQuote(value)}\n`);
  }
}

function printJson(payload) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

function readStatusText(statusFile) {
  const resolved = resolveStatusFile(statusFile);
  return fs.existsSync(resolved) ? fs.readFileSync(resolved, 'utf8') : '';
}

function yamlScalar(value) {
  if (value === null || value === undefined || value === '') {
    return 'null';
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : 'null';
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function parseRootValue(text, key) {
  const pattern = new RegExp(`^${key}:\\s*(.+?)\\s*$`, 'm');
  const match = text.match(pattern);
  return match ? match[1].trim().replace(/^"|"$/g, '') : '';
}

function parseStatusBlocks(statusFile) {
  const text = readStatusText(statusFile);
  const lines = text.split(/\r?\n/);
  const blocks = [];
  let current = null;
  let inAttempts = false;
  let currentIndent = 0;

  for (const rawLine of lines) {
    if (/^\s*-\s+number:\s*/.test(rawLine)) {
      if (current) {
        blocks.push(current);
      }
      const match = rawLine.match(/number:\s*([0-9]+)/);
      current = {
        phaseNumber: match ? Number.parseInt(match[1], 10) : 0,
        phaseTitle: '',
        phaseDoc: '',
        status: '',
        planConfirmed: true,
        attemptTotal: 0,
        lastOutcome: '',
        lastUpdatedAtMs: null,
        sprintContract: '',
        qaReport: '',
        handoff: '',
        scorecard: '',
      };
      currentIndent = rawLine.length - rawLine.trimStart().length;
      inAttempts = false;
      continue;
    }
    if (!current) {
      continue;
    }

    const indent = rawLine.length - rawLine.trimStart().length;
    const stripped = rawLine.trim();
    if (!stripped) {
      continue;
    }
    if (stripped.startsWith('attempts:') && indent > currentIndent) {
      inAttempts = true;
      continue;
    }
    if (inAttempts && indent <= currentIndent + 2 && !stripped.startsWith('attempts:')) {
      inAttempts = false;
    }

    if (inAttempts && stripped.startsWith('total:')) {
      current.attemptTotal = Number.parseInt(stripped.slice('total:'.length).trim(), 10) || 0;
    } else if (inAttempts && stripped.startsWith('lastOutcome:')) {
      current.lastOutcome = stripped.slice('lastOutcome:'.length).trim();
    } else if (inAttempts && stripped.startsWith('lastUpdatedAt:')) {
      current.lastUpdatedAtMs = Date.parse(stripped.slice('lastUpdatedAt:'.length).trim().replace(/^"|"$/g, '')) || null;
    } else if (stripped.startsWith('title:')) {
      current.phaseTitle = stripped.slice('title:'.length).trim().replace(/^"|"$/g, '');
    } else if (stripped.startsWith('status:')) {
      current.status = stripped.slice('status:'.length).trim();
    } else if (stripped.startsWith('planConfirmed:')) {
      current.planConfirmed = !stripped.slice('planConfirmed:'.length).trim().toLowerCase().startsWith('false');
    } else if (stripped.startsWith('activePhaseDoc:')) {
      current.phaseDoc = stripped.slice('activePhaseDoc:'.length).trim().replace(/^"|"$/g, '');
    } else if (stripped.startsWith('sprintContract:')) {
      current.sprintContract = stripped.slice('sprintContract:'.length).trim().replace(/^"|"$/g, '');
    } else if (stripped.startsWith('qaReport:')) {
      current.qaReport = stripped.slice('qaReport:'.length).trim().replace(/^"|"$/g, '');
    } else if (stripped.startsWith('handoff:')) {
      current.handoff = stripped.slice('handoff:'.length).trim().replace(/^"|"$/g, '');
    } else if (stripped.startsWith('scorecard:')) {
      current.scorecard = stripped.slice('scorecard:'.length).trim().replace(/^"|"$/g, '');
    }
  }

  if (current) {
    blocks.push(current);
  }
  return blocks;
}

function actionableStatuses() {
  return new Set(['pending', 'in_progress', 'pending_reverify', 'failed']);
}

function blockedStatuses() {
  return new Set(['blocked', 'verification_blocked', 'runtime_unhealthy']);
}

function orderedPhaseRows(rows) {
  return [...(rows || [])].sort((a, b) => {
    const left = Number.parseInt(a.phase_number ?? a.phaseNumber ?? 0, 10) || 0;
    const right = Number.parseInt(b.phase_number ?? b.phaseNumber ?? 0, 10) || 0;
    return left - right;
  });
}

function firstBlockingPhase(rows) {
  const blocked = blockedStatuses();
  return orderedPhaseRows(rows).find((row) => row.plan_confirmed !== 0 && blocked.has(String(row.status || ''))) || null;
}

function countActionablePhasesFromRows(rows) {
  const actionable = actionableStatuses();
  let count = 0;
  for (const row of orderedPhaseRows(rows)) {
    if (row.plan_confirmed === 0) {
      continue;
    }
    if (blockedStatuses().has(String(row.status || ''))) {
      break;
    }
    if (actionable.has(String(row.status || ''))) {
      count += 1;
    }
  }
  return count;
}

function deterministicGoalId(planDir) {
  const hash = crypto.createHash('sha1').update(path.resolve(planDir || '.')).digest('hex').slice(0, 10);
  return `goal-${nowMs()}-${hash}`;
}

function parseIntegerOrNull(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function isTerminalLeaseCompletionStatus(value) {
  return TERMINAL_LEASE_COMPLETION_STATUSES.has(String(value || '').trim().toLowerCase());
}

async function openDatabase() {
  const { DatabaseSync } = await loadSqlite();
  const dbPath = resolveDbPath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA busy_timeout = 5000;');
  db.exec('PRAGMA foreign_keys = ON;');
  migrate(db);
  return db;
}

function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at_ms INTEGER NOT NULL
    );
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS workflow_goals (
      goal_id TEXT PRIMARY KEY,
      plan_dir TEXT NOT NULL UNIQUE,
      status_file TEXT NOT NULL,
      objective TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('active','paused','budget_limited','complete')),
      token_budget INTEGER,
      tokens_used INTEGER,
      time_budget_seconds INTEGER,
      time_used_seconds INTEGER NOT NULL DEFAULT 0,
      accounting_quality TEXT NOT NULL DEFAULT 'unavailable',
      continuation_suppressed INTEGER NOT NULL DEFAULT 0,
      current_lease_id TEXT,
      last_event TEXT,
      created_at_ms INTEGER NOT NULL,
      updated_at_ms INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS phase_runs (
      phase_run_id TEXT PRIMARY KEY,
      goal_id TEXT NOT NULL,
      plan_dir TEXT NOT NULL,
      status_file TEXT NOT NULL,
      phase_number INTEGER NOT NULL,
      phase_title TEXT NOT NULL DEFAULT '',
      phase_doc TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL,
      plan_confirmed INTEGER NOT NULL DEFAULT 1,
      attempt_total INTEGER NOT NULL DEFAULT 0,
      last_outcome TEXT NOT NULL DEFAULT '',
      last_updated_at_ms INTEGER,
      sprint_contract TEXT NOT NULL DEFAULT '',
      qa_report TEXT NOT NULL DEFAULT '',
      handoff TEXT NOT NULL DEFAULT '',
      scorecard TEXT NOT NULL DEFAULT '',
      updated_at_ms INTEGER NOT NULL,
      UNIQUE(goal_id, phase_number)
    );
    CREATE TABLE IF NOT EXISTS phase_attempts (
      attempt_id TEXT PRIMARY KEY,
      goal_id TEXT NOT NULL,
      phase_run_id TEXT NOT NULL,
      lease_id TEXT,
      runtime TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'started',
      outcome TEXT NOT NULL DEFAULT '',
      started_at_ms INTEGER NOT NULL,
      finished_at_ms INTEGER,
      duration_seconds INTEGER,
      log_file TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS runtime_events (
      event_id INTEGER PRIMARY KEY AUTOINCREMENT,
      goal_id TEXT,
      phase_run_id TEXT,
      attempt_id TEXT,
      lease_id TEXT,
      event_type TEXT NOT NULL,
      detail TEXT NOT NULL DEFAULT '',
      created_at_ms INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS artifact_links (
      artifact_id INTEGER PRIMARY KEY AUTOINCREMENT,
      goal_id TEXT,
      phase_run_id TEXT,
      kind TEXT NOT NULL,
      path TEXT NOT NULL,
      updated_at_ms INTEGER NOT NULL,
      UNIQUE(phase_run_id, kind, path)
    );
    CREATE TABLE IF NOT EXISTS verification_results (
      verification_id INTEGER PRIMARY KEY AUTOINCREMENT,
      goal_id TEXT,
      phase_run_id TEXT,
      attempt_id TEXT,
      verdict_path TEXT NOT NULL DEFAULT '',
      verdict TEXT NOT NULL DEFAULT '',
      evidence_fresh INTEGER,
      created_at_ms INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS budget_accounting (
      accounting_id INTEGER PRIMARY KEY AUTOINCREMENT,
      goal_id TEXT NOT NULL,
      attempt_id TEXT,
      time_delta_seconds INTEGER NOT NULL DEFAULT 0,
      token_delta INTEGER,
      accounting_quality TEXT NOT NULL DEFAULT 'unavailable',
      created_at_ms INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS control_commands (
      command_id INTEGER PRIMARY KEY AUTOINCREMENT,
      goal_id TEXT,
      plan_dir TEXT NOT NULL,
      command TEXT NOT NULL,
      detail TEXT NOT NULL DEFAULT '',
      created_at_ms INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS leases (
      lease_id TEXT PRIMARY KEY,
      goal_id TEXT,
      plan_dir TEXT NOT NULL,
      status_file TEXT NOT NULL,
      execution_boundary TEXT NOT NULL DEFAULT '',
      execution_root TEXT NOT NULL DEFAULT '',
      runtime TEXT NOT NULL DEFAULT '',
      master_plan TEXT NOT NULL DEFAULT '',
      dispatcher_pid TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active',
      current_stage TEXT NOT NULL DEFAULT '',
      phase_number INTEGER,
      phase_title TEXT NOT NULL DEFAULT '',
      completion_status TEXT NOT NULL DEFAULT '',
      return_boundary TEXT NOT NULL DEFAULT '',
      stop_reason_code TEXT NOT NULL DEFAULT '',
      stop_reason_detail TEXT NOT NULL DEFAULT '',
      attached_at_ms INTEGER NOT NULL,
      last_heartbeat_at_ms INTEGER NOT NULL,
      finished_at_ms INTEGER,
      actionable_phases_remaining INTEGER NOT NULL DEFAULT 0
    );
  `);
  const runtimeEventColumns = new Set(db.prepare('PRAGMA table_info(runtime_events)').all().map((column) => column.name));
  if (!runtimeEventColumns.has('transaction_id')) {
    db.exec('ALTER TABLE runtime_events ADD COLUMN transaction_id TEXT NOT NULL DEFAULT "";');
  }
  db.prepare('INSERT OR IGNORE INTO schema_migrations(version, applied_at_ms) VALUES (?, ?)').run(1, nowMs());
}

function eventDetail(detail, transactionId) {
  if (!transactionId) {
    return detail;
  }
  if (!detail) {
    return JSON.stringify({ transactionId });
  }
  try {
    const parsed = JSON.parse(detail);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return JSON.stringify({ ...parsed, transactionId });
    }
  } catch {
    // Keep plain text detail stable and append structured transaction metadata.
  }
  return JSON.stringify({ message: String(detail), transactionId });
}

function recordEvent(db, { goalId = '', phaseRunId = '', attemptId = '', leaseId = '', eventType, detail = '', transactionId = '' }) {
  db.prepare(`
    INSERT INTO runtime_events(goal_id, phase_run_id, attempt_id, lease_id, event_type, detail, transaction_id, created_at_ms)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(goalId || null, phaseRunId || null, attemptId || null, leaseId || null, eventType, eventDetail(detail, transactionId), transactionId || '', nowMs());
}

function activeGoalForPlan(db, planDir) {
  return db.prepare(`
    SELECT * FROM workflow_goals
    WHERE plan_dir = ?
    ORDER BY updated_at_ms DESC
    LIMIT 1
  `).get(path.resolve(planDir));
}

function getGoalByStatusFile(db, statusFile) {
  const resolvedStatus = resolveStatusFile(statusFile);
  return db.prepare(`
    SELECT * FROM workflow_goals
    WHERE status_file = ?
    ORDER BY updated_at_ms DESC
    LIMIT 1
  `).get(resolvedStatus);
}

function upsertGoal(db, config) {
  const resolvedPlan = path.resolve(config.planDir || '.');
  const resolvedStatus = resolveStatusFile(config.statusFile);
  const existing = activeGoalForPlan(db, resolvedPlan);
  const timestamp = nowMs();
  const goalId = existing?.goal_id || config.goalId || deterministicGoalId(resolvedPlan);
  const objective = config.objective || existing?.objective || 'Complete active plan directory';
  const status = config.status || existing?.status || 'active';
  if (!VALID_GOAL_STATUSES.has(status)) {
    throw new Error(`invalid goal status: ${status}`);
  }
  db.prepare(`
    INSERT INTO workflow_goals(
      goal_id, plan_dir, status_file, objective, status, token_budget, tokens_used,
      time_budget_seconds, time_used_seconds, accounting_quality, continuation_suppressed,
      current_lease_id, last_event, created_at_ms, updated_at_ms
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(plan_dir) DO UPDATE SET
      status_file = excluded.status_file,
      objective = excluded.objective,
      status = excluded.status,
      token_budget = COALESCE(excluded.token_budget, workflow_goals.token_budget),
      time_budget_seconds = COALESCE(excluded.time_budget_seconds, workflow_goals.time_budget_seconds),
      current_lease_id = COALESCE(excluded.current_lease_id, workflow_goals.current_lease_id),
      last_event = excluded.last_event,
      updated_at_ms = excluded.updated_at_ms
  `).run(
    goalId,
    resolvedPlan,
    resolvedStatus,
    objective,
    status,
    parseIntegerOrNull(config.tokenBudget ?? existing?.token_budget),
    existing?.tokens_used ?? null,
    parseIntegerOrNull(config.timeBudgetSeconds ?? existing?.time_budget_seconds),
    existing?.time_used_seconds ?? 0,
    existing?.accounting_quality || 'unavailable',
    existing?.continuation_suppressed ?? 0,
    config.leaseId || existing?.current_lease_id || null,
    config.eventType || 'GoalStarted',
    existing?.created_at_ms || timestamp,
    timestamp,
  );
  const goal = activeGoalForPlan(db, resolvedPlan);
  recordEvent(db, {
    goalId: goal.goal_id,
    leaseId: config.leaseId || '',
    eventType: config.eventType || 'GoalStarted',
    detail: config.detail || objective,
    transactionId: config.transactionId || '',
  });
  return goal;
}

function seedPhasesFromStatus(db, goal, statusFile) {
  const blocks = parseStatusBlocks(statusFile);
  const timestamp = nowMs();
  const upsert = db.prepare(`
    INSERT INTO phase_runs(
      phase_run_id, goal_id, plan_dir, status_file, phase_number, phase_title, phase_doc,
      status, plan_confirmed, attempt_total, last_outcome, last_updated_at_ms,
      sprint_contract, qa_report, handoff, scorecard, updated_at_ms
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(goal_id, phase_number) DO UPDATE SET
      phase_title = excluded.phase_title,
      phase_doc = CASE WHEN excluded.phase_doc != '' THEN excluded.phase_doc ELSE phase_runs.phase_doc END,
      status = excluded.status,
      plan_confirmed = excluded.plan_confirmed,
      attempt_total = excluded.attempt_total,
      last_outcome = excluded.last_outcome,
      last_updated_at_ms = excluded.last_updated_at_ms,
      sprint_contract = excluded.sprint_contract,
      qa_report = excluded.qa_report,
      handoff = excluded.handoff,
      scorecard = excluded.scorecard,
      updated_at_ms = excluded.updated_at_ms
  `);
  for (const block of blocks) {
    if (!block.phaseNumber) {
      continue;
    }
    const phaseRunId = `${goal.goal_id}-phase-${String(block.phaseNumber).padStart(2, '0')}`;
    upsert.run(
      phaseRunId,
      goal.goal_id,
      goal.plan_dir,
      goal.status_file,
      block.phaseNumber,
      block.phaseTitle,
      block.phaseDoc,
      block.status || 'pending',
      block.planConfirmed ? 1 : 0,
      block.attemptTotal,
      block.lastOutcome || 'pending',
      block.lastUpdatedAtMs,
      block.sprintContract,
      block.qaReport,
      block.handoff,
      block.scorecard,
      timestamp,
    );
    for (const [kind, artifactPath] of Object.entries({
      sprint_contract: block.sprintContract,
      qa_report: block.qaReport,
      handoff: block.handoff,
      scorecard: block.scorecard,
    })) {
      if (!artifactPath) {
        continue;
      }
      db.prepare(`
        INSERT OR IGNORE INTO artifact_links(goal_id, phase_run_id, kind, path, updated_at_ms)
        VALUES (?, ?, ?, ?, ?)
      `).run(goal.goal_id, phaseRunId, kind, artifactPath, timestamp);
    }
  }
}

export function updateGoalStatus(db, { planDir, status, detail = '', expectedGoalId = '' }) {
  if (!VALID_GOAL_STATUSES.has(status)) {
    throw new Error(`invalid goal status: ${status}`);
  }
  const goal = activeGoalForPlan(db, planDir);
  if (!goal) {
    throw new Error(`goal not found for plan: ${planDir}`);
  }
  if (expectedGoalId && goal.goal_id !== expectedGoalId) {
    throw new Error(`stale goal update rejected: expected ${expectedGoalId}, current ${goal.goal_id}`);
  }
  db.prepare(`
    UPDATE workflow_goals
    SET status = ?,
        last_event = ?,
        current_lease_id = CASE WHEN ? = 'active' THEN current_lease_id ELSE NULL END,
        updated_at_ms = ?
    WHERE goal_id = ?
  `).run(status, statusToEvent(status), status, nowMs(), goal.goal_id);
  db.prepare(`
    INSERT INTO control_commands(goal_id, plan_dir, command, detail, created_at_ms)
    VALUES (?, ?, ?, ?, ?)
  `).run(goal.goal_id, goal.plan_dir, status, detail, nowMs());
  recordEvent(db, { goalId: goal.goal_id, eventType: statusToEvent(status), detail });
  return activeGoalForPlan(db, planDir);
}

function statusToEvent(status) {
  switch (status) {
    case 'paused':
      return 'GoalPaused';
    case 'active':
      return 'GoalResumed';
    case 'budget_limited':
      return 'BudgetLimited';
    case 'complete':
      return 'GoalCompleted';
    default:
      return 'GoalUpdated';
  }
}

export function clearGoal(db, planDir, detail = '') {
  const goal = activeGoalForPlan(db, planDir);
  if (!goal) {
    return null;
  }
  db.prepare(`
    INSERT INTO control_commands(goal_id, plan_dir, command, detail, created_at_ms)
    VALUES (?, ?, 'clear', ?, ?)
  `).run(goal.goal_id, goal.plan_dir, detail, nowMs());
  recordEvent(db, { goalId: goal.goal_id, eventType: 'GoalCleared', detail });
  db.prepare('DELETE FROM leases WHERE goal_id = ?').run(goal.goal_id);
  db.prepare('DELETE FROM phase_attempts WHERE goal_id = ?').run(goal.goal_id);
  db.prepare('DELETE FROM phase_runs WHERE goal_id = ?').run(goal.goal_id);
  db.prepare('DELETE FROM workflow_goals WHERE goal_id = ?').run(goal.goal_id);
  return goal;
}

export function startLease(db, config) {
  const goal = upsertGoal(db, {
    planDir: config.planDir,
    statusFile: config.statusFile,
    objective: config.objective,
    status: 'active',
    leaseId: config.leaseId,
    eventType: 'GoalStarted',
    tokenBudget: config.tokenBudget,
    timeBudgetSeconds: config.timeBudgetSeconds,
    transactionId: config.transactionId || '',
  });
  seedPhasesFromStatus(db, goal, config.statusFile);
  const rows = db.prepare('SELECT phase_number, status, plan_confirmed FROM phase_runs WHERE goal_id = ? ORDER BY phase_number').all(goal.goal_id);
  const actionable = countActionablePhasesFromRows(rows);
  const timestamp = nowMs();
  db.prepare(`
    INSERT INTO leases(
      lease_id, goal_id, plan_dir, status_file, execution_boundary, execution_root, runtime,
      master_plan, dispatcher_pid, status, current_stage, completion_status,
      attached_at_ms, last_heartbeat_at_ms, actionable_phases_remaining
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 'ready/isolate', 'prepared', ?, ?, ?)
    ON CONFLICT(lease_id) DO UPDATE SET
      status = 'active',
      current_stage = 'ready/isolate',
      last_heartbeat_at_ms = excluded.last_heartbeat_at_ms,
      actionable_phases_remaining = excluded.actionable_phases_remaining
  `).run(
    config.leaseId,
    goal.goal_id,
    goal.plan_dir,
    goal.status_file,
    config.executionBoundary || '',
    config.executionRoot || '',
    config.runtime || '',
    config.masterPlan || '',
    config.dispatcherPid || '',
    timestamp,
    timestamp,
    actionable,
  );
  db.prepare('UPDATE workflow_goals SET current_lease_id = ?, updated_at_ms = ? WHERE goal_id = ?')
    .run(config.leaseId, timestamp, goal.goal_id);
  recordEvent(db, { goalId: goal.goal_id, leaseId: config.leaseId, eventType: 'LeaseStarted', detail: config.executionBoundary || '', transactionId: config.transactionId || '' });
  return { ...activeGoalForPlan(db, goal.plan_dir), actionablePhasesRemaining: actionable };
}

function accountLeaseTime(db, lease, timestamp) {
  const goal = db.prepare('SELECT * FROM workflow_goals WHERE goal_id = ?').get(lease.goal_id);
  if (!goal) {
    return null;
  }
  const previousMs = Number.parseInt(lease.last_heartbeat_at_ms || lease.attached_at_ms || timestamp, 10);
  const deltaSeconds = Math.max(0, Math.floor((timestamp - previousMs) / 1000));
  if (deltaSeconds <= 0) {
    return goal;
  }
  const nextUsed = (Number.parseInt(goal.time_used_seconds, 10) || 0) + deltaSeconds;
  const budget = parseIntegerOrNull(goal.time_budget_seconds);
  const budgetLimited = goal.status === 'active' && budget !== null && nextUsed >= budget;
  db.prepare(`
    INSERT INTO budget_accounting(goal_id, attempt_id, time_delta_seconds, token_delta, accounting_quality, created_at_ms)
    VALUES (?, NULL, ?, NULL, 'unavailable', ?)
  `).run(goal.goal_id, deltaSeconds, timestamp);
  db.prepare(`
    UPDATE workflow_goals
    SET time_used_seconds = ?,
        accounting_quality = 'unavailable',
        status = CASE WHEN ? THEN 'budget_limited' ELSE status END,
        last_event = CASE WHEN ? THEN 'BudgetLimited' ELSE last_event END,
        updated_at_ms = ?
    WHERE goal_id = ?
  `).run(nextUsed, budgetLimited ? 1 : 0, budgetLimited ? 1 : 0, timestamp, goal.goal_id);
  if (budgetLimited) {
    recordEvent(db, {
      goalId: goal.goal_id,
      leaseId: lease.lease_id,
      eventType: 'BudgetLimited',
      detail: `timeUsedSeconds=${nextUsed}; timeBudgetSeconds=${budget}`,
    });
  }
  return db.prepare('SELECT * FROM workflow_goals WHERE goal_id = ?').get(goal.goal_id);
}

export function heartbeatLease(db, config) {
  const lease = db.prepare('SELECT * FROM leases WHERE lease_id = ?').get(config.leaseId);
  if (!lease) {
    return null;
  }
  const goal = db.prepare('SELECT * FROM workflow_goals WHERE goal_id = ?').get(lease.goal_id);
  if (goal) {
    seedPhasesFromStatus(db, goal, lease.status_file);
  }
  const rows = db.prepare('SELECT phase_number, status, plan_confirmed FROM phase_runs WHERE goal_id = ? ORDER BY phase_number').all(lease.goal_id);
  const actionable = countActionablePhasesFromRows(rows);
  const timestamp = nowMs();
  accountLeaseTime(db, lease, timestamp);
  const terminalCompletion = isTerminalLeaseCompletionStatus(lease.completion_status)
    || Boolean(String(lease.stop_reason_code || '').trim());
  const nextCompletionStatus = terminalCompletion
    ? lease.completion_status
    : (config.completionStatus || lease.completion_status || '');
  db.prepare(`
    UPDATE leases
    SET current_stage = ?, phase_number = ?, phase_title = ?, completion_status = ?,
        last_heartbeat_at_ms = ?, actionable_phases_remaining = ?
    WHERE lease_id = ?
  `).run(
    config.currentStage || lease.current_stage || '',
    parseIntegerOrNull(config.phaseNum),
    config.phaseTitle || '',
    nextCompletionStatus,
    timestamp,
    actionable,
    config.leaseId,
  );
  const detailPayload = {
    currentStage: config.currentStage || '',
    phaseNum: config.phaseNum || '',
    phaseTitle: config.phaseTitle || '',
    requestedCompletionStatus: config.completionStatus || '',
    preservedCompletionStatus: terminalCompletion ? lease.completion_status : '',
  };
  recordEvent(db, {
    goalId: lease.goal_id,
    leaseId: config.leaseId,
    eventType: 'LeaseHeartbeat',
    detail: terminalCompletion ? JSON.stringify(detailPayload) : (config.currentStage || ''),
    transactionId: config.transactionId || '',
  });
  return db.prepare('SELECT * FROM leases WHERE lease_id = ?').get(config.leaseId);
}

export function finishLease(db, config) {
  const lease = db.prepare('SELECT * FROM leases WHERE lease_id = ?').get(config.leaseId);
  if (!lease) {
    return null;
  }
  const goal = db.prepare('SELECT * FROM workflow_goals WHERE goal_id = ?').get(lease.goal_id);
  if (goal) {
    seedPhasesFromStatus(db, goal, lease.status_file);
  }
  const rows = db.prepare('SELECT phase_number, status, plan_confirmed FROM phase_runs WHERE goal_id = ? ORDER BY phase_number').all(lease.goal_id);
  const actionable = countActionablePhasesFromRows(rows);
  const requestedFinalStatus = String(config.finalStatus || '').trim();
  const status = requestedFinalStatus || (actionable === 0 ? 'finished' : 'paused');
  const timestamp = nowMs();
  accountLeaseTime(db, lease, timestamp);
  db.prepare(`
    UPDATE leases
    SET status = ?, return_boundary = ?, stop_reason_code = ?, stop_reason_detail = ?,
        completion_status = ?, finished_at_ms = ?, last_heartbeat_at_ms = ?,
        actionable_phases_remaining = ?
    WHERE lease_id = ?
  `).run(
    status,
    config.returnBoundary || '',
    config.stopReasonCode || '',
    config.stopReasonDetail || '',
    config.completionStatus || lease.completion_status || '',
    timestamp,
    timestamp,
    actionable,
    config.leaseId,
  );
  if (actionable === 0 && goal) {
    db.prepare(`
      UPDATE workflow_goals
      SET status = 'complete', last_event = 'GoalCompleted', current_lease_id = NULL, updated_at_ms = ?
      WHERE goal_id = ?
    `).run(timestamp, goal.goal_id);
    recordEvent(db, { goalId: goal.goal_id, leaseId: config.leaseId, eventType: 'GoalCompleted', detail: 'No actionable phases remaining.', transactionId: config.transactionId || '' });
  } else if (goal && status !== 'active') {
    db.prepare(`
      UPDATE workflow_goals
      SET status = 'paused',
          last_event = 'GoalPaused',
          current_lease_id = CASE WHEN current_lease_id = ? THEN NULL ELSE current_lease_id END,
          updated_at_ms = ?
      WHERE goal_id = ?
    `).run(config.leaseId, timestamp, goal.goal_id);
    recordEvent(db, {
      goalId: goal.goal_id,
      leaseId: config.leaseId,
      eventType: 'GoalPaused',
      detail: `Lease finished with status=${status}; actionablePhasesRemaining=${actionable}.`,
      transactionId: config.transactionId || '',
    });
  }
  recordEvent(db, { goalId: lease.goal_id, leaseId: config.leaseId, eventType: 'LeaseFinished', detail: config.stopReasonCode || '', transactionId: config.transactionId || '' });
  return db.prepare('SELECT * FROM leases WHERE lease_id = ?').get(config.leaseId);
}

export function updatePhase(db, config) {
  const goal = getGoalByStatusFile(db, config.statusFile);
  if (!goal) {
    return null;
  }
  const phaseRunId = `${goal.goal_id}-phase-${String(config.phaseNum).padStart(2, '0')}`;
  const timestamp = nowMs();
  db.prepare(`
    INSERT INTO phase_runs(
      phase_run_id, goal_id, plan_dir, status_file, phase_number, phase_title, phase_doc,
      status, plan_confirmed, attempt_total, last_outcome, last_updated_at_ms,
      sprint_contract, qa_report, handoff, scorecard, updated_at_ms
    )
    VALUES (?, ?, ?, ?, ?, '', ?, ?, 1, 0, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(goal_id, phase_number) DO UPDATE SET
      phase_doc = CASE WHEN excluded.phase_doc != '' THEN excluded.phase_doc ELSE phase_runs.phase_doc END,
      status = excluded.status,
      attempt_total = phase_runs.attempt_total + CASE WHEN ? = 'true' THEN 1 ELSE 0 END,
      last_outcome = excluded.last_outcome,
      last_updated_at_ms = excluded.last_updated_at_ms,
      sprint_contract = excluded.sprint_contract,
      qa_report = excluded.qa_report,
      handoff = excluded.handoff,
      scorecard = excluded.scorecard,
      updated_at_ms = excluded.updated_at_ms
  `).run(
    phaseRunId,
    goal.goal_id,
    goal.plan_dir,
    goal.status_file,
    Number.parseInt(config.phaseNum, 10),
    config.activePhaseDoc || '',
    config.newStatus || '',
    config.lastOutcome || '',
    Date.parse(config.timestamp || '') || timestamp,
    config.sprintContractPath || '',
    config.qaReportPath || '',
    config.handoffPath || '',
    config.scorecardPath || '',
    timestamp,
    config.incrementAttempt || 'false',
  );
  recordEvent(db, {
    goalId: goal.goal_id,
    phaseRunId,
    eventType: 'PhaseStateUpdated',
    detail: `${config.phaseNum}:${config.newStatus}:${config.lastOutcome || ''}`,
    transactionId: config.transactionId || '',
  });
  return db.prepare('SELECT * FROM phase_runs WHERE phase_run_id = ?').get(phaseRunId);
}

export function assertReturnAllowed(db, { statusFile, leaseId, executionIntent, prepareOnly }) {
  const execution = String(executionIntent || '').toLowerCase() === 'true';
  const prepare = String(prepareOnly || '').toLowerCase() === 'true';
  if (!execution || prepare) {
    return { RETURN_ALLOWED: 'true', RETURN_REASON: 'non_execution_or_prepare_only', ACTIONABLE_PHASES_REMAINING: '0' };
  }
  const goal = getGoalByStatusFile(db, statusFile);
  if (!goal) {
    return { RETURN_ALLOWED: 'false', RETURN_REASON: 'missing-goal-runtime-state', ACTIONABLE_PHASES_REMAINING: 'unknown' };
  }
  seedPhasesFromStatus(db, goal, statusFile);
  const rows = db.prepare('SELECT phase_number, status, plan_confirmed FROM phase_runs WHERE goal_id = ? ORDER BY phase_number').all(goal.goal_id);
  const actionable = countActionablePhasesFromRows(rows);
  const blockingPhase = firstBlockingPhase(rows);
  if (blockingPhase) {
    return {
      RETURN_ALLOWED: 'false',
      RETURN_REASON: 'blocked-phase-prevents-downstream-action',
      ACTIONABLE_PHASES_REMAINING: String(actionable),
      BLOCKED_PHASE: String(blockingPhase.phase_number || ''),
    };
  }
  if (actionable === 0) {
    return { RETURN_ALLOWED: 'true', RETURN_REASON: 'plan_directory_complete', ACTIONABLE_PHASES_REMAINING: '0' };
  }
  if (goal.status === 'paused') {
    return { RETURN_ALLOWED: 'false', RETURN_REASON: 'paused-goal-with-actionable-phases', ACTIONABLE_PHASES_REMAINING: String(actionable) };
  }
  if (goal.status === 'budget_limited') {
    return { RETURN_ALLOWED: 'false', RETURN_REASON: 'budget-limited-goal-with-actionable-phases', ACTIONABLE_PHASES_REMAINING: String(actionable) };
  }
  const lease = db.prepare('SELECT * FROM leases WHERE lease_id = ?').get(leaseId);
  if (!lease) {
    return { RETURN_ALLOWED: 'false', RETURN_REASON: 'missing-active-run-lease', ACTIONABLE_PHASES_REMAINING: String(actionable) };
  }
  return { RETURN_ALLOWED: 'false', RETURN_REASON: 'actionable-phases-remaining', ACTIONABLE_PHASES_REMAINING: String(actionable) };
}

export function statusPayload(db, planDir) {
  const goal = activeGoalForPlan(db, planDir);
  if (!goal) {
    return { found: false, planDir: path.resolve(planDir) };
  }
  seedPhasesFromStatus(db, goal, goal.status_file);
  const phases = db.prepare('SELECT * FROM phase_runs WHERE goal_id = ? ORDER BY phase_number').all(goal.goal_id);
  const lease = goal.current_lease_id
    ? db.prepare('SELECT * FROM leases WHERE lease_id = ?').get(goal.current_lease_id)
    : null;
  const blockedPhase = firstBlockingPhase(phases);
  const activePhase = phases.find((phase) => phase.status === 'in_progress') || blockedPhase || null;
  const nextPhase = blockedPhase
    ? null
    : phases.find((phase) => phase.plan_confirmed !== 0 && actionableStatuses().has(phase.status)) || null;
  return {
    found: true,
    goal,
    actionablePhasesRemaining: countActionablePhasesFromRows(phases),
    activePhase,
    nextPhase,
    blockedPhase,
    blockedReason: blockedPhase ? 'blocked phase prevents downstream phases' : '',
    lease,
  };
}

export function exportStatusMirror(db, statusFile) {
  const goal = getGoalByStatusFile(db, statusFile);
  if (!goal || !fs.existsSync(goal.status_file)) {
    return null;
  }
  const text = fs.readFileSync(goal.status_file, 'utf8');
  const lines = text.split(/\r?\n/).filter((_, index, array) => !(index === array.length - 1 && array[index] === ''));
  const cleaned = [];
  let skippingGoalRuntime = false;
  for (const line of lines) {
    if (line.startsWith('goalRuntime:')) {
      skippingGoalRuntime = true;
      continue;
    }
    if (skippingGoalRuntime) {
      if (/^\S/.test(line) || line.startsWith('phases:')) {
        skippingGoalRuntime = false;
      } else {
        continue;
      }
    }
    if (!skippingGoalRuntime) {
      cleaned.push(line);
    }
  }
  const insertAt = cleaned.findIndex((line) => line.startsWith('phases:'));
  const block = [
    'goalRuntime:',
    `  goalId: ${yamlScalar(goal.goal_id)}`,
    `  objective: ${yamlScalar(goal.objective)}`,
    `  status: ${yamlScalar(goal.status)}`,
    `  tokenBudget: ${yamlScalar(goal.token_budget)}`,
    `  tokensUsed: ${yamlScalar(goal.tokens_used)}`,
    `  timeBudgetSeconds: ${yamlScalar(goal.time_budget_seconds)}`,
    `  timeUsedSeconds: ${yamlScalar(goal.time_used_seconds)}`,
    `  accountingQuality: ${yamlScalar(goal.accounting_quality)}`,
    `  continuationSuppressed: ${goal.continuation_suppressed ? 'true' : 'false'}`,
    `  currentRunLeaseId: ${yamlScalar(goal.current_lease_id)}`,
    `  lastEvent: ${yamlScalar(goal.last_event)}`,
    `  createdAt: ${yamlScalar(new Date(goal.created_at_ms).toISOString().replace(/\.\d{3}Z$/, 'Z'))}`,
    `  updatedAt: ${yamlScalar(new Date(goal.updated_at_ms).toISOString().replace(/\.\d{3}Z$/, 'Z'))}`,
  ];
  if (insertAt >= 0) {
    cleaned.splice(insertAt, 0, ...block);
  } else {
    cleaned.push(...block);
  }
  fs.writeFileSync(goal.status_file, `${cleaned.join('\n')}\n`, 'utf8');
  return goal;
}

export function phaseGoalObjective(planDir, masterPlan) {
  const plan = masterPlan ? ` using ${masterPlan}` : '';
  return `Complete active plan directory ${planDir}${plan}`;
}

export async function withDb(handler) {
  const db = await openDatabase();
  try {
    db.exec('BEGIN IMMEDIATE;');
    const result = await handler(db);
    db.exec('COMMIT;');
    return result;
  } catch (error) {
    try {
      db.exec('ROLLBACK;');
    } catch {
      // Ignore rollback failures.
    }
    throw error;
  } finally {
    db.close();
  }
}

function usage() {
  console.error([
    'Usage:',
    '  runtime-state.mjs init <status-file> <plan-dir> [execution-root] [runtime] [master-plan]',
    '  runtime-state.mjs start-lease <status-file> <lease-id> <execution-boundary> <plan-dir> <execution-root> <runtime> [master-plan] [dispatcher-pid] [time-budget] [token-budget]',
    '  runtime-state.mjs heartbeat-lease <status-file> <lease-id> <stage> [phase-num] [phase-title] [completion-status]',
    '  runtime-state.mjs finish-lease <status-file> <lease-id> <return-boundary> <stop-reason-code> <stop-reason-detail> [completion-status]',
    '  runtime-state.mjs assert-return-allowed <status-file> <lease-id> <execution-intent> <prepare-only>',
    '  runtime-state.mjs update-phase <status-file> <phase-num> <new-status> <timestamp> <last-outcome> <increment-attempt> <active-phase-doc> <sprint-contract> <qa-report> <handoff> <scorecard>',
    '  runtime-state.mjs goal-status <plan-dir>',
    '  runtime-state.mjs pause <plan-dir> [detail]',
    '  runtime-state.mjs resume <plan-dir> [detail]',
    '  runtime-state.mjs clear <plan-dir> [detail]',
    '  runtime-state.mjs export-status <status-file>',
  ].join('\n'));
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  switch (command) {
    case 'init': {
      const [statusFile, planDir, executionRoot = '', runtime = '', masterPlan = ''] = args;
      const result = await withDb((db) => {
        const goal = upsertGoal(db, {
          statusFile,
          planDir,
          objective: phaseGoalObjective(planDir, masterPlan),
          status: 'active',
          eventType: 'GoalInitialized',
          detail: executionRoot || runtime,
        });
        seedPhasesFromStatus(db, goal, statusFile);
        exportStatusMirror(db, statusFile);
        return goal;
      });
      printAssignments({ GOAL_ID: result.goal_id, STATUS: result.status });
      return;
    }
    case 'start-lease': {
      const [statusFile, leaseId, executionBoundary, planDir, executionRoot, runtime, masterPlan = '', dispatcherPid = '', timeBudgetSeconds = '', tokenBudget = ''] = args;
      const result = await withDb((db) => {
        const payload = startLease(db, {
          statusFile,
          leaseId,
          executionBoundary,
          planDir,
          executionRoot,
          runtime,
          masterPlan,
          dispatcherPid,
          timeBudgetSeconds,
          tokenBudget,
          objective: phaseGoalObjective(planDir, masterPlan),
        });
        exportStatusMirror(db, statusFile);
        return payload;
      });
      printAssignments({
        GOAL_ID: result.goal_id,
        STATUS: result.status,
        ACTIONABLE_PHASES_REMAINING: result.actionablePhasesRemaining,
      });
      return;
    }
    case 'heartbeat-lease': {
      const [statusFile, leaseId, currentStage = '', phaseNum = '', phaseTitle = '', completionStatus = ''] = args;
      const result = await withDb((db) => {
        const payload = heartbeatLease(db, { statusFile, leaseId, currentStage, phaseNum, phaseTitle, completionStatus });
        if (payload) exportStatusMirror(db, statusFile);
        return payload;
      });
      printAssignments(result || {});
      return;
    }
    case 'finish-lease': {
      const [statusFile, leaseId, returnBoundary = '', stopReasonCode = '', stopReasonDetail = '', completionStatus = '', finalStatus = ''] = args;
      const result = await withDb((db) => {
        const payload = finishLease(db, { statusFile, leaseId, returnBoundary, stopReasonCode, stopReasonDetail, completionStatus, finalStatus });
        if (payload) exportStatusMirror(db, statusFile);
        return payload;
      });
      printAssignments(result || {});
      return;
    }
    case 'assert-return-allowed': {
      const [statusFile, leaseId, executionIntent = '', prepareOnly = ''] = args;
      const result = await withDb((db) => assertReturnAllowed(db, { statusFile, leaseId, executionIntent, prepareOnly }));
      printAssignments(result);
      return;
    }
    case 'update-phase': {
      const result = await withDb((db) => {
        const payload = updatePhase(db, {
          statusFile: args[0],
          phaseNum: args[1],
          newStatus: args[2],
          timestamp: args[3],
          lastOutcome: args[4],
          incrementAttempt: args[5],
          activePhaseDoc: args[6],
          sprintContractPath: args[7],
          qaReportPath: args[8],
          handoffPath: args[9],
          scorecardPath: args[10],
        });
        if (payload) exportStatusMirror(db, args[0]);
        return payload;
      });
      printAssignments(result || {});
      return;
    }
    case 'goal-status': {
      const result = await withDb((db) => statusPayload(db, args[0] || '.'));
      printJson(result);
      return;
    }
    case 'pause':
    case 'resume':
    case 'clear': {
      const [planDir, detail = ''] = args;
      const result = await withDb((db) => {
        if (command === 'clear') return clearGoal(db, planDir, detail);
        return updateGoalStatus(db, { planDir, status: command === 'pause' ? 'paused' : 'active', detail });
      });
      printAssignments(result ? { GOAL_ID: result.goal_id, STATUS: command === 'clear' ? 'cleared' : result.status } : { STATUS: 'not_found' });
      return;
    }
    case 'export-status': {
      const result = await withDb((db) => exportStatusMirror(db, args[0] || DEFAULT_STATUS_FILE));
      printAssignments(result ? { GOAL_ID: result.goal_id, STATUS: result.status } : {});
      return;
    }
    default:
      usage();
      process.exit(64);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
