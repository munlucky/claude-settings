import { recordRuntimeEvent } from './runtime-state-store.mjs';

export const COMMIT_CLOSEOUT_EVENT_TYPES = new Set([
  'commit.closeout.started',
  'commit.memory_refresh.completed',
  'commit.memory_refresh.failed',
  'commit.memory_refresh.skipped',
  'commit.promotion_audit.completed',
  'commit.promotion_audit.failed',
  'commit.promotion_audit.skipped',
  'commit.staging.selected',
  'commit.created',
  'commit.failed',
  'commit.push.skipped',
  'commit.push.requested',
  'commit.push.completed',
  'commit.push.failed',
]);

const BLOCKING_EVENTS = new Set([
  'commit.failed',
  'commit.push.failed',
]);

const WARNING_EVENTS = new Set([
  'commit.memory_refresh.failed',
  'commit.memory_refresh.skipped',
  'commit.promotion_audit.failed',
  'commit.promotion_audit.skipped',
]);

const DENIED_PAYLOAD_KEYS = new Set([
  'commands',
  'storePayload',
  'rawMemoryGraph',
  'memoryGraph',
  'kg',
  'ontology',
  'transcript',
  'transcripts',
  'results',
  'candidates',
]);

export function defaultCommitEventSeverity(eventType) {
  if (BLOCKING_EVENTS.has(eventType)) {
    return 'blocking';
  }
  if (WARNING_EVENTS.has(eventType)) {
    return 'warning';
  }
  return 'info';
}

export function commitRuntimeIdentity({
  runId = '',
  goalId = '',
  workspaceId = '',
  projectId = 'moonshot-relay',
  projectPath = '',
  writer = 'commit-moonshot-closeout-event',
} = {}) {
  const auditOnly = !runId || !goalId;
  return {
    runId: runId || `commit-closeout-audit:${projectId}`,
    goalId: goalId || `commit-closeout:${projectId}`,
    workspaceId,
    auditOnly,
    identity: {
      projectId,
      projectPath,
      commitCloseoutAuditOnly: auditOnly,
      writer,
    },
  };
}

export function sanitizeCommitEventPayload(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeCommitEventPayload(entry));
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  const output = {};
  for (const [key, entry] of Object.entries(value)) {
    if (DENIED_PAYLOAD_KEYS.has(key)) {
      continue;
    }
    output[key] = sanitizeCommitEventPayload(entry);
  }
  return output;
}

export async function recordCommitCloseoutEvent({
  runId = '',
  goalId = '',
  workspaceId = '',
  projectId = 'moonshot-relay',
  projectPath = '',
  eventType,
  severity = '',
  payload = {},
  writer = 'commit-moonshot-closeout-event',
} = {}) {
  if (!COMMIT_CLOSEOUT_EVENT_TYPES.has(eventType)) {
    throw new Error(`unknown commit closeout event type: ${eventType}`);
  }
  const runtime = commitRuntimeIdentity({
    runId,
    goalId,
    workspaceId,
    projectId,
    projectPath,
    writer,
  });
  const eventSeverity = severity || defaultCommitEventSeverity(eventType);
  return recordRuntimeEvent({
    runId: runtime.runId,
    goalId: runtime.goalId,
    workspaceId: runtime.workspaceId,
    eventType,
    severity: eventSeverity,
    payload: {
      projectId,
      projectPath,
      auditOnly: runtime.auditOnly,
      ...sanitizeCommitEventPayload(payload),
    },
    identity: runtime.identity,
  });
}
