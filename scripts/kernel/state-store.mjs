import path from 'node:path';
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
  `);

  try { db.exec(`ALTER TABLE runs ADD COLUMN source_identity TEXT;`); } catch {}
  try { db.exec(`ALTER TABLE runs ADD COLUMN mutation_revision INTEGER DEFAULT 0;`); } catch {}
  try { db.exec(`ALTER TABLE runs ADD COLUMN proof_tier TEXT DEFAULT 'T0';`); } catch {}
  try { db.exec(`ALTER TABLE runs ADD COLUMN evidence_tier TEXT DEFAULT 'E0';`); } catch {}
  try { db.exec(`ALTER TABLE runs ADD COLUMN required_obligations TEXT DEFAULT '[]';`); } catch {}
  try { db.exec(`ALTER TABLE runs ADD COLUMN acceptance_criteria TEXT DEFAULT '[]';`); } catch {}
  try { db.exec(`ALTER TABLE verifications ADD COLUMN obligation_id TEXT DEFAULT 'default';`); } catch {}

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
    }) {
      if (!sourceIdentity || typeof sourceIdentity !== 'string' || !sourceIdentityRegex.test(sourceIdentity)) {
        throw new Error('sourceIdentity is required and must be a valid candidate identity string for Kernel run');
      }
      db.prepare(`
        INSERT INTO runs(run_id, objective, state, status, revision, mutation_revision, source_identity, proof_tier, evidence_tier, required_obligations, acceptance_criteria, updated_at)
        VALUES(?, ?, 'FRAME', 'active', 0, 0, ?, ?, ?, ?, ?, ?)
      `).run(
        runId,
        objective,
        sourceIdentity,
        proofTier,
        evidenceTier,
        JSON.stringify(requiredObligations),
        JSON.stringify(acceptanceCriteria),
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
        updatedAt: row.updatedAt,
      };
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

    recordVerification(runId, { obligationId = 'default', status, evidenceRef, sourceIdentity, command, exitCode = 0, evidenceDigest }) {
      const run = this.getRun(runId);
      if (!run) throw new Error(`Run ${runId} not found`);
      if (run.status === 'completed') throw new Error(`Cannot add verification to completed run ${runId}`);
      if (!sourceIdentity || typeof sourceIdentity !== 'string' || !sourceIdentityRegex.test(sourceIdentity)) {
        throw new Error('sourceIdentity is required and must be a valid candidate identity string for verification');
      }

      db.exec('BEGIN IMMEDIATE TRANSACTION');
      try {
        db.prepare(`
          INSERT INTO verifications(run_id, obligation_id, status, evidence_ref, verified_runtime_revision, verified_mutation_revision, source_identity, command, exit_code, evidence_digest, observed_at)
          VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(runId, obligationId, status, evidenceRef || null, run.revision, run.mutationRevision, sourceIdentity, command || null, exitCode, evidenceDigest || null, now());

        db.prepare('UPDATE runs SET revision=revision+1, updated_at=? WHERE run_id=?').run(now(), runId);
        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }

      return this.getRun(runId);
    },

    assessCompletion(runId, { expectedSourceIdentity = null } = {}) {
      db.exec('BEGIN IMMEDIATE TRANSACTION');
      try {
        const run = this.getRun(runId);
        if (!run) {
          db.exec('COMMIT');
          return { decision: 'blocked', run: null, verifications: [] };
        }

        const verifications = db.prepare(`
          SELECT obligation_id as obligationId, status, evidence_ref as evidenceRef,
                 verified_runtime_revision as verifiedRuntimeRevision,
                 verified_mutation_revision as verifiedMutationRevision,
                 source_identity as sourceIdentity, command, exit_code as exitCode,
                 evidence_digest as evidenceDigest, observed_at as observedAt
          FROM verifications WHERE run_id=? ORDER BY id ASC
        `).all(runId);

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
        const passedObligations = new Set(
          verifications.filter(isVerificationValid).map((v) => v.obligationId)
        );

        const allObligationsPassed = requiredObligations.every((ob) => passedObligations.has(ob));
        const accepted = isClosed && allObligationsPassed;

        if (run.status === 'completed') {
          db.exec('COMMIT');
          return { decision: accepted ? 'accepted' : 'blocked', run, verifications };
        }

        const decision = accepted ? 'accepted' : 'blocked';
        db.prepare('UPDATE runs SET status=?, revision=revision+1, updated_at=? WHERE run_id=?')
          .run(accepted ? 'completed' : 'blocked', now(), runId);
        db.exec('COMMIT');

        return { decision, run: this.getRun(runId), verifications };
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
