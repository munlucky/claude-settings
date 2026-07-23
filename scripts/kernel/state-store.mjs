import path from 'node:path';
import { createHash } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { resolveKernelRuntimeHome, assertIsolatedRuntimeHomes } from './runtime-home.mjs';
import { canTransition } from './transition.mjs';
import { openSqliteDb } from './sqlite-adapter.mjs';

export const kernelDbPath = (runtimeHome = resolveKernelRuntimeHome()) => path.join(runtimeHome, 'state', 'runtime-state.sqlite');

const sourceIdentityRegex = /^(?:[a-f0-9]{40}|sha256:[a-f0-9]{64}|[a-zA-Z0-9_.:/-]{1,128})$/i;
const sha256Regex = /^sha256:[a-f0-9]{64}$/i;

export const openKernelStateStore = async ({ runtimeHome = resolveKernelRuntimeHome(), relayHome } = {}) => {
  assertIsolatedRuntimeHomes(runtimeHome, relayHome);
  const dbPath = kernelDbPath(runtimeHome);
  await mkdir(path.dirname(dbPath), { recursive: true });
  const db = await openSqliteDb(dbPath);

  db.exec(`
    PRAGMA journal_mode=WAL;
    PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS runs (
      run_id TEXT PRIMARY KEY,
      objective TEXT NOT NULL,
      state TEXT NOT NULL,
      status TEXT NOT NULL,
      revision INTEGER NOT NULL DEFAULT 0,
      mutation_revision INTEGER NOT NULL DEFAULT 0,
      source_identity TEXT NOT NULL,
      proof_tier TEXT NOT NULL DEFAULT 'T0',
      evidence_tier TEXT NOT NULL DEFAULT 'E0',
      required_obligations TEXT NOT NULL DEFAULT '[]',
      acceptance_criteria TEXT NOT NULL DEFAULT '[]',
      release_evidence_required INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS verifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT NOT NULL,
      obligation_id TEXT NOT NULL DEFAULT 'default',
      status TEXT NOT NULL,
      evidence_ref TEXT,
      verified_runtime_revision INTEGER,
      verified_mutation_revision INTEGER,
      source_identity TEXT,
      command TEXT,
      exit_code INTEGER,
      evidence_digest TEXT,
      acceptance_coverage TEXT NOT NULL DEFAULT '[]',
      observed_at TEXT NOT NULL,
      FOREIGN KEY(run_id) REFERENCES runs(run_id)
    );
    CREATE TABLE IF NOT EXISTS leases (
      run_id TEXT PRIMARY KEY,
      holder TEXT NOT NULL,
      acquired_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      FOREIGN KEY(run_id) REFERENCES runs(run_id)
    );
    CREATE TABLE IF NOT EXISTS attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT NOT NULL,
      attempt_number INTEGER NOT NULL,
      state TEXT NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      status TEXT NOT NULL,
      FOREIGN KEY(run_id) REFERENCES runs(run_id)
    );
    CREATE TABLE IF NOT EXISTS waivers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT NOT NULL,
      obligation_id TEXT NOT NULL,
      approved_by TEXT NOT NULL,
      reason TEXT NOT NULL,
      approved_at TEXT NOT NULL,
      approval_receipt TEXT NOT NULL,
      acceptance_coverage TEXT NOT NULL DEFAULT '[]',
      FOREIGN KEY(run_id) REFERENCES runs(run_id)
    );
    CREATE TABLE IF NOT EXISTS evidence_lineage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT NOT NULL,
      evidence_digest TEXT NOT NULL,
      parent_digest TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(run_id) REFERENCES runs(run_id)
    );
    CREATE TABLE IF NOT EXISTS evidence_packs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT NOT NULL,
      tier TEXT NOT NULL,
      digest TEXT NOT NULL,
      pack_json TEXT NOT NULL,
      mutation_revision INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY(run_id) REFERENCES runs(run_id)
    );
    CREATE TABLE IF NOT EXISTS knowledge_context_receipts (
      run_id TEXT NOT NULL,
      stage TEXT NOT NULL,
      knowledge_revision TEXT NOT NULL,
      digest TEXT NOT NULL,
      receipt_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (run_id, stage),
      FOREIGN KEY(run_id) REFERENCES runs(run_id)
    );
    CREATE TABLE IF NOT EXISTS knowledge_candidates (
      candidate_id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      proposed_type TEXT NOT NULL,
      status TEXT NOT NULL,
      candidate_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(run_id) REFERENCES runs(run_id)
    );
    CREATE TABLE IF NOT EXISTS knowledge_commit_receipts (
      run_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      revision_before TEXT NOT NULL,
      revision_after TEXT NOT NULL,
      status TEXT NOT NULL,
      receipt_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(run_id) REFERENCES runs(run_id)
    );
    CREATE TABLE IF NOT EXISTS completion_decisions (
      run_id TEXT PRIMARY KEY,
      decision TEXT NOT NULL,
      source_identity TEXT NOT NULL,
      mutation_revision INTEGER NOT NULL,
      evidence_digest TEXT NOT NULL,
      decision_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(run_id) REFERENCES runs(run_id)
    );
    CREATE TABLE IF NOT EXISTS git_closeout_receipts (
      run_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      mode TEXT NOT NULL,
      commit_sha TEXT,
      branch TEXT,
      remote TEXT,
      push_status TEXT NOT NULL,
      parity TEXT NOT NULL,
      receipt_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(run_id) REFERENCES runs(run_id)
    );
    CREATE TABLE IF NOT EXISTS knowledge_records (
      project_id TEXT NOT NULL,
      record_id TEXT NOT NULL,
      record_type TEXT NOT NULL,
      status TEXT NOT NULL,
      trust_tier TEXT NOT NULL,
      record_json TEXT NOT NULL,
      revision INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(project_id, record_id)
    );
    CREATE TABLE IF NOT EXISTS knowledge_revisions (
      project_id TEXT PRIMARY KEY,
      revision INTEGER NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS knowledge_transactions (
      transaction_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      run_id TEXT NOT NULL,
      expected_revision INTEGER NOT NULL,
      target_revision INTEGER NOT NULL,
      status TEXT NOT NULL,
      transaction_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      completed_at TEXT
    );
    CREATE TABLE IF NOT EXISTS knowledge_approvals (
      approval_id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      candidate_id TEXT NOT NULL,
      approved_by TEXT NOT NULL,
      approval_receipt TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(run_id) REFERENCES runs(run_id)
    );
  `);

  try { db.exec(`ALTER TABLE runs ADD COLUMN source_identity TEXT;`); } catch {}
  try { db.exec(`ALTER TABLE runs ADD COLUMN mutation_revision INTEGER DEFAULT 0;`); } catch {}
  try { db.exec(`ALTER TABLE runs ADD COLUMN proof_tier TEXT DEFAULT 'T0';`); } catch {}
  try { db.exec(`ALTER TABLE runs ADD COLUMN evidence_tier TEXT DEFAULT 'E0';`); } catch {}
  try { db.exec(`ALTER TABLE runs ADD COLUMN required_obligations TEXT DEFAULT '[]';`); } catch {}
  try { db.exec(`ALTER TABLE runs ADD COLUMN acceptance_criteria TEXT DEFAULT '[]';`); } catch {}
  try { db.exec(`ALTER TABLE runs ADD COLUMN release_evidence_required INTEGER DEFAULT 0;`); } catch {}
  try { db.exec(`ALTER TABLE runs ADD COLUMN project_id TEXT;`); } catch {}
  try { db.exec(`ALTER TABLE runs ADD COLUMN knowledge_revision_start TEXT;`); } catch {}
  try { db.exec(`ALTER TABLE runs ADD COLUMN knowledge_revision_close TEXT;`); } catch {}
  try { db.exec(`ALTER TABLE runs ADD COLUMN knowledge_status TEXT;`); } catch {}
  try { db.exec(`ALTER TABLE runs ADD COLUMN context_pack_ref TEXT;`); } catch {}
  try { db.exec(`ALTER TABLE verifications ADD COLUMN obligation_id TEXT DEFAULT 'default';`); } catch {}
  try { db.exec(`ALTER TABLE verifications ADD COLUMN acceptance_coverage TEXT DEFAULT '[]';`); } catch {}
  try { db.exec(`ALTER TABLE waivers ADD COLUMN approval_receipt TEXT;`); } catch {}
  try { db.exec(`ALTER TABLE waivers ADD COLUMN acceptance_coverage TEXT DEFAULT '[]';`); } catch {}
  try { db.exec(`ALTER TABLE evidence_packs ADD COLUMN mutation_revision INTEGER DEFAULT 0;`); } catch {}

  const now = () => new Date().toISOString();

  const safeJsonParse = (str, fallback = []) => {
    try {
      return JSON.parse(str || '[]');
    } catch {
      return fallback;
    }
  };

  return {
    dbPath,
    createRun({
      runId,
      objective,
      sourceIdentity,
      proofTier = 'T0',
      evidenceTier = 'E0',
      requiredObligations = [],
      acceptanceCriteria = [],
      requireReleaseEvidence = false,
      projectId = null,
      knowledgeRevisionStart = null,
    }) {
      if (!sourceIdentity || typeof sourceIdentity !== 'string' || !sourceIdentityRegex.test(sourceIdentity)) {
        throw new Error('sourceIdentity is required and must be a valid candidate identity string for Kernel run');
      }
      db.prepare(`
        INSERT INTO runs(run_id, objective, state, status, revision, mutation_revision, source_identity, proof_tier, evidence_tier, required_obligations, acceptance_criteria, release_evidence_required, project_id, knowledge_revision_start, knowledge_status, updated_at)
        VALUES(?, ?, 'FRAME', 'active', 0, 0, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)
      `).run(
        runId,
        objective,
        sourceIdentity,
        proofTier,
        evidenceTier,
        JSON.stringify(requiredObligations),
        JSON.stringify(acceptanceCriteria),
        requireReleaseEvidence ? 1 : 0,
        projectId || null,
        knowledgeRevisionStart !== undefined && knowledgeRevisionStart !== null ? String(knowledgeRevisionStart) : null,
        now()
      );
      return this.getRun(runId);
    },

    getRun(runId) {
      const row = db.prepare(`
        SELECT run_id as runId, objective, state, status, revision,
               mutation_revision as mutationRevision, source_identity as sourceIdentity,
               proof_tier as proofTier, evidence_tier as evidenceTier,
               required_obligations as requiredObligations, acceptance_criteria as acceptanceCriteria,
               release_evidence_required as releaseEvidenceRequired,
               project_id as projectId, knowledge_revision_start as knowledgeRevisionStart,
               knowledge_revision_close as knowledgeRevisionClose, knowledge_status as knowledgeStatus,
               context_pack_ref as contextPackRef,
               updated_at as updatedAt
        FROM runs WHERE run_id=?
      `).get(runId);

      if (!row) return null;

      return {
        schemaVersion: 1,
        runId: row.runId,
        objective: row.objective,
        currentState: row.state,
        state: row.state,
        status: row.status,
        revision: row.revision,
        mutationRevision: row.mutationRevision,
        sourceIdentity: row.sourceIdentity,
        proofTier: row.proofTier,
        evidenceTier: row.evidenceTier,
        requiredObligations: safeJsonParse(row.requiredObligations),
        acceptanceCriteria: safeJsonParse(row.acceptanceCriteria),
        releaseEvidenceRequired: Boolean(row.releaseEvidenceRequired),
        projectId: row.projectId || null,
        knowledgeRevisionStart: row.knowledgeRevisionStart || null,
        knowledgeRevisionClose: row.knowledgeRevisionClose || null,
        knowledgeStatus: row.knowledgeStatus || null,
        contextPackRef: row.contextPackRef || null,
        updatedAt: row.updatedAt,
      };
    },

    recordKnowledgeContextReceipt(runId, { stage, knowledgeRevision, digest, receiptJson }) {
      db.prepare(`
        INSERT INTO knowledge_context_receipts(run_id, stage, knowledge_revision, digest, receipt_json, created_at)
        VALUES(?, ?, ?, ?, ?, ?)
        ON CONFLICT(run_id, stage) DO UPDATE SET knowledge_revision=excluded.knowledge_revision, digest=excluded.digest, receipt_json=excluded.receipt_json, created_at=excluded.created_at
      `).run(runId, stage, knowledgeRevision, digest, typeof receiptJson === 'string' ? receiptJson : JSON.stringify(receiptJson), now());
      db.prepare(`UPDATE runs SET context_pack_ref=?, updated_at=? WHERE run_id=?`).run(`context-packs/${runId}/${stage}.json`, now(), runId);
    },

    getKnowledgeContextReceipt(runId, stage) {
      const row = db.prepare(`SELECT run_id as runId, stage, knowledge_revision as knowledgeRevision, digest, receipt_json as receiptJson, created_at as createdAt FROM knowledge_context_receipts WHERE run_id=? AND stage=?`).get(runId, stage);
      if (!row) return null;
      return { ...row, receiptJson: safeJsonParse(row.receiptJson, {}) };
    },

    recordKnowledgeCandidate(candidateId, runId, { projectId, proposedType = 'semantic_fact', status = 'pending', candidateJson }) {
      db.prepare(`
        INSERT INTO knowledge_candidates(candidate_id, run_id, project_id, proposed_type, status, candidate_json, created_at)
        VALUES(?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(candidate_id) DO UPDATE SET status=excluded.status, candidate_json=excluded.candidate_json, created_at=excluded.created_at
      `).run(candidateId, runId, projectId, proposedType, status, typeof candidateJson === 'string' ? candidateJson : JSON.stringify(candidateJson), now());
    },

    getKnowledgeCandidates(runId) {
      return db.prepare(`SELECT candidate_id as candidateId, run_id as runId, project_id as projectId, proposed_type as proposedType, status, candidate_json as candidateJson, created_at as createdAt FROM knowledge_candidates WHERE run_id=?`).all(runId).map((row) => ({ ...row, candidateJson: safeJsonParse(row.candidateJson, {}) }));
    },

    recordKnowledgeCommitReceipt(runId, { projectId, revisionBefore, revisionAfter, status = 'committed', receiptJson }) {
      db.prepare(`
        INSERT INTO knowledge_commit_receipts(run_id, project_id, revision_before, revision_after, status, receipt_json, created_at)
        VALUES(?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(run_id) DO UPDATE SET revision_before=excluded.revision_before, revision_after=excluded.revision_after, status=excluded.status, receipt_json=excluded.receipt_json, created_at=excluded.created_at
      `).run(runId, projectId, revisionBefore, revisionAfter, status, typeof receiptJson === 'string' ? receiptJson : JSON.stringify(receiptJson), now());
      db.prepare(`UPDATE runs SET knowledge_revision_close=?, knowledge_status=?, updated_at=? WHERE run_id=?`).run(revisionAfter, status, now(), runId);
    },

    getKnowledgeCommitReceipt(runId) {
      const row = db.prepare(`SELECT run_id as runId, project_id as projectId, revision_before as revisionBefore, revision_after as revisionAfter, status, receipt_json as receiptJson, created_at as createdAt FROM knowledge_commit_receipts WHERE run_id=?`).get(runId);
      if (!row) return null;
      return { ...row, receiptJson: safeJsonParse(row.receiptJson, {}) };
    },

    recordCompletionDecision(runId, { decision, sourceIdentity, mutationRevision, evidenceDigest, decisionJson }) {
      db.prepare(`
        INSERT INTO completion_decisions(run_id, decision, source_identity, mutation_revision, evidence_digest, decision_json, created_at)
        VALUES(?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(run_id) DO UPDATE SET decision=excluded.decision, source_identity=excluded.source_identity, mutation_revision=excluded.mutation_revision, evidence_digest=excluded.evidence_digest, decision_json=excluded.decision_json, created_at=excluded.created_at
      `).run(runId, decision, sourceIdentity, mutationRevision, evidenceDigest, typeof decisionJson === 'string' ? decisionJson : JSON.stringify(decisionJson), now());
    },

    getCompletionDecision(runId) {
      const row = db.prepare(`SELECT run_id as runId, decision, source_identity as sourceIdentity, mutation_revision as mutationRevision, evidence_digest as evidenceDigest, decision_json as decisionJson, created_at as createdAt FROM completion_decisions WHERE run_id=?`).get(runId);
      if (!row) return null;
      return { ...row, decisionJson: safeJsonParse(row.decisionJson, {}) };
    },

    recordGitCloseoutReceipt(runId, { projectId, mode, commitSha, branch, remote = 'origin', pushStatus, parity, receiptJson }) {
      db.prepare(`
        INSERT INTO git_closeout_receipts(run_id, project_id, mode, commit_sha, branch, remote, push_status, parity, receipt_json, created_at)
        VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(run_id) DO UPDATE SET mode=excluded.mode, commit_sha=excluded.commit_sha, branch=excluded.branch, remote=excluded.remote, push_status=excluded.push_status, parity=excluded.parity, receipt_json=excluded.receipt_json, created_at=excluded.created_at
      `).run(runId, projectId, mode, commitSha || null, branch || null, remote, pushStatus, parity, typeof receiptJson === 'string' ? receiptJson : JSON.stringify(receiptJson), now());
    },

    getGitCloseoutReceipt(runId) {
      const row = db.prepare(`SELECT run_id as runId, project_id as projectId, mode, commit_sha as commitSha, branch, remote, push_status as pushStatus, parity, receipt_json as receiptJson, created_at as createdAt FROM git_closeout_receipts WHERE run_id=?`).get(runId);
      if (!row) return null;
      return { ...row, receiptJson: safeJsonParse(row.receiptJson, {}) };
    },

    getProjectKnowledgeRevision(projectId) {
      const row = db.prepare(`SELECT revision FROM knowledge_revisions WHERE project_id=?`).get(projectId);
      return row ? Number(row.revision) : 1;
    },

    updateProjectKnowledgeRevision(projectId, expectedRevision, nextRevision) {
      const existing = db.prepare(`SELECT revision FROM knowledge_revisions WHERE project_id=?`).get(projectId);
      if (!existing) {
        db.prepare(`INSERT INTO knowledge_revisions(project_id, revision, updated_at) VALUES(?, ?, ?)`).run(projectId, nextRevision, now());
        return true;
      }
      const res = db.prepare(`UPDATE knowledge_revisions SET revision=?, updated_at=? WHERE project_id=? AND revision=?`).run(nextRevision, now(), projectId, expectedRevision);
      return res.changes === 1;
    },

    saveKnowledgeRecord(projectId, recordId, { recordType, status, trustTier, recordJson, revision }) {
      db.prepare(`
        INSERT INTO knowledge_records(project_id, record_id, record_type, status, trust_tier, record_json, revision, created_at, updated_at)
        VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(project_id, record_id) DO UPDATE SET record_type=excluded.record_type, status=excluded.status, trust_tier=excluded.trust_tier, record_json=excluded.record_json, revision=excluded.revision, updated_at=excluded.updated_at
      `).run(projectId, recordId, recordType, status, trustTier, typeof recordJson === 'string' ? recordJson : JSON.stringify(recordJson), revision, now(), now());
    },

    saveKnowledgeTransaction(transactionId, { projectId, runId, expectedRevision, targetRevision, status, transactionJson }) {
      db.prepare(`
        INSERT INTO knowledge_transactions(transaction_id, project_id, run_id, expected_revision, target_revision, status, transaction_json, created_at, completed_at)
        VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(transaction_id) DO UPDATE SET status=excluded.status, completed_at=excluded.completed_at
      `).run(transactionId, projectId, runId, expectedRevision, targetRevision, status, typeof transactionJson === 'string' ? transactionJson : JSON.stringify(transactionJson), now(), now());
    },

    recordKnowledgeApproval(approvalId, { runId, candidateId, approvedBy, approvalReceipt }) {
      db.prepare(`
        INSERT INTO knowledge_approvals(approval_id, run_id, candidate_id, approved_by, approval_receipt, created_at)
        VALUES(?, ?, ?, ?, ?, ?)
        ON CONFLICT(approval_id) DO UPDATE SET approved_by=excluded.approved_by, approval_receipt=excluded.approval_receipt
      `).run(approvalId, runId, candidateId, approvedBy, approvalReceipt, now());
    },

    getKnowledgeApprovals(runId) {
      return db.prepare(`SELECT approval_id as approvalId, run_id as runId, candidate_id as candidateId, approved_by as approvedBy, approval_receipt as approvalReceipt, created_at as createdAt FROM knowledge_approvals WHERE run_id=?`).all(runId);
    },

    transition(runId, nextState, { expectedState, expectedRevision } = {}) {
      db.exec('BEGIN IMMEDIATE TRANSACTION');
      try {
        const run = this.getRun(runId);
        if (!run) throw new Error(`Run ${runId} not found`);
        if (run.status === 'completed') throw new Error(`Cannot transition run ${runId} in completed state`);

        if (expectedState && run.state !== expectedState) {
          throw new Error(`STATE_CONFLICT: Expected state ${expectedState} but found ${run.state} for run ${runId}`);
        }
        if (expectedRevision !== undefined && run.revision !== expectedRevision) {
          throw new Error(`STALE_RUN_REVISION: Expected revision ${expectedRevision} but found ${run.revision} for run ${runId}`);
        }

        if (!canTransition(run.state, nextState)) {
          throw new Error(`Invalid Kernel transition ${run.state} -> ${nextState}`);
        }

        const isMutation = nextState === 'SHAPE' || nextState === 'EXECUTE';
        const mutationInc = isMutation ? 1 : 0;

        const res = db.prepare(`
          UPDATE runs
          SET state=?, revision=revision+1, mutation_revision=mutation_revision+?, updated_at=?
          WHERE run_id=? AND state=? AND revision=?
        `).run(nextState, mutationInc, now(), runId, run.state, run.revision);

        if (res.changes !== 1) {
          throw new Error(`STATE_CONFLICT: Concurrent state or revision modification for run ${runId}`);
        }

        db.exec('COMMIT');
        return this.getRun(runId);
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    },

    recordVerification(runId, { obligationId = 'default', status, evidenceRef, sourceIdentity, command, exitCode = 0, evidenceDigest, acceptanceCoverage = [] }) {
      const run = this.getRun(runId);
      if (!run) throw new Error(`Run ${runId} not found`);
      if (run.status === 'completed') throw new Error(`Cannot add verification to completed run ${runId}`);
      if (run.state !== 'PROVE') throw new Error(`Verification can only be recorded in PROVE state for run ${runId}`);
      if (!['passed', 'failed'].includes(status)) throw new Error(`Invalid verification status: ${status}`);
      sourceIdentity = sourceIdentity || run.sourceIdentity;
      if (!sourceIdentity || typeof sourceIdentity !== 'string' || !sourceIdentityRegex.test(sourceIdentity) || sourceIdentity !== run.sourceIdentity) {
        throw new Error('sourceIdentity is required and must be a valid candidate identity string for verification');
      }

      db.exec('BEGIN IMMEDIATE TRANSACTION');
      try {
        db.prepare(`
          INSERT INTO verifications(run_id, obligation_id, status, evidence_ref, verified_runtime_revision, verified_mutation_revision, source_identity, command, exit_code, evidence_digest, acceptance_coverage, observed_at)
          VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(runId, obligationId, status, evidenceRef || null, run.revision, run.mutationRevision, sourceIdentity, command || null, exitCode, evidenceDigest || null, JSON.stringify(acceptanceCoverage), now());

        if (evidenceDigest && sha256Regex.test(evidenceDigest)) {
          db.prepare(`INSERT INTO evidence_lineage(run_id, evidence_digest, created_at) VALUES(?, ?, ?)`).run(runId, evidenceDigest, now());
        }

        db.prepare('UPDATE runs SET revision=revision+1, updated_at=? WHERE run_id=?').run(now(), runId);
        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }

      return this.getRun(runId);
    },

    recordEvidencePack(runId, { tier, pack, digest, mutationRevision }) {
      const run = this.getRun(runId);
      if (!run) throw new Error(`Run ${runId} not found`);
      if (!tier || !pack || !digest || !sha256Regex.test(digest) || mutationRevision !== run.mutationRevision) throw new Error('Evidence pack requires a tier, pack, sha256 digest, and current mutation revision');
      if (tier === 'E2' && !Array.isArray(pack.qaReport?.checks)) throw new Error('E2 release evidence must persist its QA checks');
      db.prepare(`INSERT INTO evidence_packs(run_id, tier, digest, pack_json, mutation_revision, created_at) VALUES(?, ?, ?, ?, ?, ?)`)
        .run(runId, tier, digest, JSON.stringify(pack), mutationRevision, now());
      return { runId, tier, digest, mutationRevision };
    },

    getVerifications(runId) {
      return db.prepare(`SELECT id, obligation_id as obligationId, status, evidence_ref as evidenceRef, verified_runtime_revision as verifiedRuntimeRevision, verified_mutation_revision as verifiedMutationRevision, source_identity as sourceIdentity, command, exit_code as exitCode, evidence_digest as evidenceDigest, acceptance_coverage as acceptanceCoverage, observed_at as observedAt FROM verifications WHERE run_id=? AND id IN (SELECT MAX(v2.id) FROM verifications v2 WHERE v2.run_id=? GROUP BY v2.obligation_id) ORDER BY id ASC`).all(runId, runId).map((v) => ({ ...v, acceptanceCoverage: safeJsonParse(v.acceptanceCoverage) }));
    },

    addWaiver(runId, { obligationId, approvedBy, reason, approvalReceipt, acceptanceCoverage = [] }) {
      if (!this.getRun(runId)) throw new Error(`Run ${runId} not found`);
      if (!obligationId || !approvedBy || !reason || !approvalReceipt) throw new Error('Waiver requires obligation, approver, reason, and approval receipt');
      db.prepare(`INSERT INTO waivers(run_id, obligation_id, approved_by, reason, approved_at, approval_receipt, acceptance_coverage) VALUES(?, ?, ?, ?, ?, ?, ?)`)
        .run(runId, obligationId, approvedBy, reason, now(), approvalReceipt, JSON.stringify(acceptanceCoverage));
      return this.getWaivers(runId).at(-1);
    },

    getWaivers(runId) {
      return db.prepare(`SELECT id, run_id as runId, obligation_id as obligationId, approved_by as approvedBy, reason, approved_at as approvedAt, approval_receipt as approvalReceipt, acceptance_coverage as acceptanceCoverage FROM waivers WHERE run_id=? ORDER BY id ASC`).all(runId).map((row) => ({ ...row, acceptanceCoverage: safeJsonParse(row.acceptanceCoverage) }));
    },

    recordLease(runId, { holder, expiresAt }) {
      if (!this.getRun(runId)) throw new Error(`Run ${runId} not found`);
      db.prepare(`INSERT INTO leases(run_id, holder, acquired_at, expires_at) VALUES(?, ?, ?, ?) ON CONFLICT(run_id) DO UPDATE SET holder=excluded.holder, acquired_at=excluded.acquired_at, expires_at=excluded.expires_at`).run(runId, holder, now(), expiresAt);
      return db.prepare(`SELECT run_id as runId, holder, acquired_at as acquiredAt, expires_at as expiresAt FROM leases WHERE run_id=?`).get(runId);
    },

    recordAttempt(runId, { attemptNumber, state, status = 'started', finishedAt = null }) {
      if (!this.getRun(runId)) throw new Error(`Run ${runId} not found`);
      const result = db.prepare(`INSERT INTO attempts(run_id, attempt_number, state, started_at, finished_at, status) VALUES(?, ?, ?, ?, ?, ?)`).run(runId, attemptNumber, state, now(), finishedAt, status);
      return db.prepare(`SELECT id, run_id as runId, attempt_number as attemptNumber, state, started_at as startedAt, finished_at as finishedAt, status FROM attempts WHERE id=?`).get(result.lastInsertRowid);
    },

    getEvidenceLineage(runId) {
      return db.prepare(`SELECT id, run_id as runId, evidence_digest as evidenceDigest, parent_digest as parentDigest, created_at as createdAt FROM evidence_lineage WHERE run_id=? ORDER BY id ASC`).all(runId);
    },

    assessCompletion(runId, { expectedSourceIdentity = null, commitDecision = true } = {}) {
      db.exec('BEGIN IMMEDIATE TRANSACTION');
      try {
        const run = this.getRun(runId);
        if (!run) {
          db.exec('COMMIT');
          return { decision: 'blocked', run: null, verifications: [] };
        }

        const verifications = db.prepare(`
          SELECT id, obligation_id as obligationId, status, evidence_ref as evidenceRef,
                 verified_runtime_revision as verifiedRuntimeRevision,
                 verified_mutation_revision as verifiedMutationRevision,
                 source_identity as sourceIdentity, command, exit_code as exitCode,
                 evidence_digest as evidenceDigest, acceptance_coverage as acceptanceCoverage, observed_at as observedAt
          FROM verifications WHERE run_id=? AND id IN (
            SELECT MAX(v2.id) FROM verifications v2 WHERE v2.run_id=? GROUP BY v2.obligation_id
          ) ORDER BY id ASC
        `).all(runId, runId).map((v) => ({ ...v, acceptanceCoverage: safeJsonParse(v.acceptanceCoverage) }));

        const isClosed = Boolean(run.state === 'CLOSE');

        const isVerificationValid = (v) => {
          if (!v) return false;
          if (v.status !== 'passed') return false;
          if (Number(v.exitCode) !== 0) return false;
          if (!v.command) return false;
          if (!v.evidenceRef) return false;
          if (!v.evidenceDigest || !sha256Regex.test(v.evidenceDigest)) return false;

          const verifiedMutation = v.verifiedMutationRevision ?? v.verifiedRuntimeRevision;
          if (verifiedMutation !== run.mutationRevision) return false;

          if (!v.sourceIdentity || v.sourceIdentity !== run.sourceIdentity) return false;
          if (expectedSourceIdentity && v.sourceIdentity !== expectedSourceIdentity) return false;

          return true;
        };

        const requiredObligations = run.requiredObligations.length > 0 ? run.requiredObligations : ['default'];
        const waivers = this.getWaivers(runId);
        const passedObligations = new Set(verifications.filter(isVerificationValid).map((v) => v.obligationId));
        const waivedObligations = new Set(waivers.filter((w) => w.approvalReceipt).map((w) => w.obligationId));

        const allObligationsPassed = requiredObligations.every((ob) => passedObligations.has(ob) || waivedObligations.has(ob));
        const coveredAcceptance = new Set([
          ...verifications.flatMap((v) => v.acceptanceCoverage || []),
          ...waivers.flatMap((w) => w.acceptanceCoverage || []),
        ]);
        const acceptanceCovered = run.acceptanceCriteria.every((criterion) => coveredAcceptance.has(criterion));
        const releaseEvidence = db.prepare(`SELECT tier, digest, mutation_revision as mutationRevision, pack_json as packJson FROM evidence_packs WHERE run_id=? ORDER BY id DESC LIMIT 1`).get(runId);
        
        const releaseEvidencePresent = !run.releaseEvidenceRequired || (releaseEvidence?.tier === 'E2' && releaseEvidence.mutationRevision === run.mutationRevision && sha256Regex.test(releaseEvidence.digest));
        const accepted = isClosed && allObligationsPassed && acceptanceCovered && releaseEvidencePresent;

        const decision = accepted ? 'accepted' : 'blocked';
        const decisionPayload = {
          runId,
          decision,
          sourceIdentity: run.sourceIdentity,
          mutationRevision: run.mutationRevision,
          evidenceDigest: releaseEvidence?.digest || verifications[0]?.evidenceDigest || `sha256:${'0'.repeat(64)}`,
          verifications,
        };
        const decisionDigest = `sha256:${createHash('sha256').update(JSON.stringify(decisionPayload)).digest('hex')}`;
        db.prepare(`
          INSERT INTO completion_decisions(run_id, decision, source_identity, mutation_revision, evidence_digest, decision_json, created_at)
          VALUES(?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(run_id) DO UPDATE SET decision=excluded.decision, source_identity=excluded.source_identity, mutation_revision=excluded.mutation_revision, evidence_digest=excluded.evidence_digest, decision_json=excluded.decision_json, created_at=excluded.created_at
        `).run(runId, decision, run.sourceIdentity, run.mutationRevision, decisionDigest, JSON.stringify({ ...decisionPayload, digest: decisionDigest }), now());

        if (commitDecision) {
          db.prepare('UPDATE runs SET status=?, revision=revision+1, updated_at=? WHERE run_id=?')
            .run(accepted ? 'completed' : 'blocked', now(), runId);
        }
        db.exec('COMMIT');

        return { decision, digest: decisionDigest, run: commitDecision ? this.getRun(runId) : run, verifications, waivers, releaseEvidence: releaseEvidence || null, acceptanceCovered: [...coveredAcceptance] };
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    },

    close() {
      db.close();
    },
  };
};
