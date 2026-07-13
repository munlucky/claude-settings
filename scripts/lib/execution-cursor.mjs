import crypto from 'node:crypto';

import { withRuntimeDb } from './runtime-state-store.mjs';

const json = (value) => JSON.stringify(value ?? {});
const parse = (value, fallback) => {
  try { return JSON.parse(value); } catch { return fallback; }
};
const hash = (value) => crypto.createHash('sha256').update(json(value)).digest('hex');

const syntheticSlice = ({ phaseId, objective = '', requiredReads = [], ownedPaths = [], procedure = 'execute-phase', evidenceCommand = '', evidencePath = '' }) => ({
  id: `${phaseId}:synthetic`,
  objective,
  requiredReads,
  ownedPaths,
  procedure,
  evidence: {
    command: evidenceCommand,
    passSignal: { exitCode: 0 },
    path: evidencePath,
  },
  onPass: 'complete',
  onFail: 'diagnose',
  synthetic: true,
});

export const normalizeSlices = ({ phaseId, slices, ...legacy }) => (
  Array.isArray(slices) && slices.length > 0 ? slices : (() => {
    if (!legacy.evidenceCommand || !legacy.evidencePath) {
      const error = new Error('legacy synthetic slice requires evidenceCommand and evidencePath');
      error.code = 'synthetic_slice_evidence_required';
      throw error;
    }
    return [syntheticSlice({ phaseId, ...legacy })];
  })()
);

const publicSlice = (row) => {
  const slices = parse(row.slices_json, []);
  const slice = slices[row.current_slice_index] || null;
  if (!slice) return null;
  return {
    sliceId: slice.id,
    sliceDigest: hash(slice),
    objective: slice.objective || '',
    requiredReads: slice.requiredReads || [],
    ownedPaths: slice.ownedPaths || [],
    procedure: slice.procedure || '',
    evidenceCommand: slice.evidence?.command || '',
    passSignal: slice.evidence?.passSignal || { exitCode: 0 },
    evidencePath: slice.evidence?.path || '',
    onPass: slice.onPass || 'advance',
    onFail: slice.onFail || 'diagnose',
    synthetic: slice.synthetic === true,
  };
};

const cursorResult = (row, status = 'resolved') => ({
  status,
  runId: row.run_id,
  goalId: row.goal_id,
  planId: row.plan_id,
  phaseId: row.phase_id,
  cursorRevision: row.cursor_revision,
  attempt: row.attempt,
  failureClass: row.failure_class,
  allowedTransitions: parse(row.allowed_transitions_json, []),
  currentSlice: publicSlice(row),
});

const assertIdentity = (row, { workspaceId = '', identity = {} }) => {
  if (row.workspace_id !== String(workspaceId || '') || row.identity_hash !== hash(identity)) {
    const error = new Error('execution cursor identity mismatch');
    error.code = 'identity_mismatch';
    throw error;
  }
};

const getCursor = (db, runId, goalId) => db.prepare(
  'SELECT * FROM execution_cursors WHERE run_id = ? AND goal_id = ?',
).get(runId, goalId);

const transitionAllowed = (row, transition) => parse(row.allowed_transitions_json, []).includes(transition);
const completed = (row) => publicSlice(row) === null;

export async function resolveExecutionCursor(input) {
  return withRuntimeDb((db) => {
    const identityHash = hash(input.identity || {});
    const existing = getCursor(db, input.runId, input.goalId);
    if (existing) {
      assertIdentity(existing, input);
      if (existing.plan_id !== input.planId || existing.phase_id !== input.phaseId) {
        throw new Error('execution cursor plan or phase mismatch');
      }
      return cursorResult(existing, 'resumed');
    }
    const slices = normalizeSlices(input);
    db.transaction(() => {
      db.prepare('INSERT OR IGNORE INTO runs(run_id, workspace_id, identity_json) VALUES (?, ?, ?)')
        .run(input.runId, input.workspaceId || '', json(input.identity || {}));
      db.prepare('INSERT OR IGNORE INTO goals(run_id, goal_id) VALUES (?, ?)').run(input.runId, input.goalId);
      db.prepare(`
        INSERT INTO execution_cursors(
          run_id, goal_id, workspace_id, identity_hash, plan_id, phase_id, slices_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(input.runId, input.goalId, input.workspaceId || '', identityHash, input.planId, input.phaseId, json(slices));
    })();
    return cursorResult(getCursor(db, input.runId, input.goalId));
  }, { requireV2: true });
}

export async function nextExecutionSlice(input) {
  return withRuntimeDb((db) => {
    const row = getCursor(db, input.runId, input.goalId);
    if (!row) throw new Error('execution cursor not resolved');
    assertIdentity(row, input);
    return cursorResult(row, publicSlice(row) ? 'ready' : 'complete');
  }, { requireV2: true });
}

const validateEvidence = (row, evidence = {}) => {
  const slice = publicSlice(row);
  if (!slice) return 'cursor_complete';
  if (evidence.sliceId !== slice.sliceId || evidence.sliceDigest !== slice.sliceDigest) return 'evidence_slice_mismatch';
  if (evidence.fresh !== true) return 'stale_evidence';
  if (evidence.passed !== true) return 'evidence_failed';
  if (!evidence.command || !evidence.path) return 'evidence_incomplete';
  if (evidence.command !== slice.evidenceCommand || evidence.path !== slice.evidencePath) return 'evidence_contract_mismatch';
  const actualSignal = evidence.result || {};
  if (Object.entries(slice.passSignal).some(([key, value]) => actualSignal[key] !== value)) return 'pass_signal_mismatch';
  return '';
};

export async function checkExecutionStep(input) {
  return withRuntimeDb((db) => {
    const row = getCursor(db, input.runId, input.goalId);
    if (!row) throw new Error('execution cursor not resolved');
    assertIdentity(row, input);
    if (completed(row)) return { ...cursorResult(row, 'blocked'), reason: 'cursor_complete' };
    if (!transitionAllowed(row, 'check-step')) return { ...cursorResult(row, 'blocked'), reason: 'transition_not_allowed' };
    if (row.cursor_revision !== Number(input.expectedCursorRevision)) {
      return { ...cursorResult(row, 'blocked'), reason: 'cursor_revision_mismatch' };
    }
    const reason = validateEvidence(row, input.evidence);
    return { ...cursorResult(row, reason ? 'blocked' : 'pass'), reason, evidenceHash: hash(input.evidence) };
  }, { requireV2: true });
}

export async function advanceExecutionCursor(input) {
  return withRuntimeDb((db) => db.transaction(() => {
    const row = getCursor(db, input.runId, input.goalId);
    if (!row) throw new Error('execution cursor not resolved');
    assertIdentity(row, input);
    if (completed(row)) return { ...cursorResult(row, 'blocked'), reason: 'cursor_complete' };
    if (!transitionAllowed(row, 'advance')) return { ...cursorResult(row, 'blocked'), reason: 'transition_not_allowed' };
    const candidateHash = hash(input.evidence);
    if (row.evidence_hash === candidateHash && row.cursor_revision === Number(input.expectedCursorRevision) + 1) {
      return { ...cursorResult(row, 'already_advanced'), evidenceHash: candidateHash };
    }
    if (row.cursor_revision !== Number(input.expectedCursorRevision)) {
      return { ...cursorResult(row, 'blocked'), reason: 'cursor_revision_mismatch' };
    }
    const reason = validateEvidence(row, input.evidence);
    if (reason) return { ...cursorResult(row, 'blocked'), reason };
    if (row.evidence_hash === candidateHash) return { ...cursorResult(row, 'blocked'), reason: 'evidence_reuse' };

    const slices = parse(row.slices_json, []);
    const nextIndex = Math.min(row.current_slice_index + 1, slices.length);
    const allowed = nextIndex >= slices.length ? [] : ['check-step', 'advance', 'diagnose'];
    const update = db.prepare(`
      UPDATE execution_cursors
      SET current_slice_index = ?, attempt = attempt + 1, failure_class = '',
          last_evidence_json = ?, evidence_hash = ?, cursor_revision = cursor_revision + 1,
          allowed_transitions_json = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE run_id = ? AND goal_id = ? AND cursor_revision = ?
    `).run(nextIndex, json(input.evidence), candidateHash, json(allowed), input.runId, input.goalId, Number(input.expectedCursorRevision));
    if (update.changes !== 1) return { ...cursorResult(getCursor(db, input.runId, input.goalId), 'blocked'), reason: 'cursor_cas_failed' };
    const updated = getCursor(db, input.runId, input.goalId);
    return { ...cursorResult(updated, publicSlice(updated) ? 'advanced' : 'complete'), evidenceHash: candidateHash };
  })(), { requireV2: true });
}

export async function diagnoseExecutionCursor(input) {
  return withRuntimeDb((db) => db.transaction(() => {
    const row = getCursor(db, input.runId, input.goalId);
    if (!row) throw new Error('execution cursor not resolved');
    assertIdentity(row, input);
    if (completed(row)) return { ...cursorResult(row, 'blocked'), reason: 'cursor_complete' };
    if (!transitionAllowed(row, 'diagnose')) return { ...cursorResult(row, 'blocked'), reason: 'transition_not_allowed' };
    if (row.cursor_revision !== Number(input.expectedCursorRevision)) {
      return { ...cursorResult(row, 'blocked'), reason: 'cursor_revision_mismatch' };
    }
    const update = db.prepare(`
      UPDATE execution_cursors
      SET failure_class = ?, attempt = attempt + 1,
          cursor_revision = cursor_revision + 1,
          allowed_transitions_json = '["check-step","advance","diagnose"]',
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE run_id = ? AND goal_id = ? AND cursor_revision = ?
    `).run(input.failureClass || 'unclassified', input.runId, input.goalId, Number(input.expectedCursorRevision));
    if (update.changes !== 1) return { ...cursorResult(getCursor(db, input.runId, input.goalId), 'blocked'), reason: 'cursor_cas_failed' };
    return cursorResult(getCursor(db, input.runId, input.goalId), 'diagnosed');
  })(), { requireV2: true });
}
