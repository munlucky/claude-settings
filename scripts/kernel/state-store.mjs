import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { resolveKernelRuntimeHome, assertIsolatedRuntimeHomes } from './runtime-home.mjs';
import { canTransition } from './transition.mjs';
import { openSqliteDb } from './sqlite-adapter.mjs';

export const kernelDbPath = (runtimeHome = resolveKernelRuntimeHome()) => path.join(runtimeHome, 'state', 'runtime-state.sqlite');

const sourceIdentityRegex = /^[a-zA-Z0-9_.:/-]{1,128}$/;

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
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS verifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT NOT NULL,
      status TEXT NOT NULL,
      evidence_ref TEXT,
      verified_runtime_revision INTEGER,
      verified_mutation_revision INTEGER,
      source_identity TEXT,
      command TEXT,
      exit_code INTEGER,
      evidence_digest TEXT,
      observed_at TEXT NOT NULL
    );
  `);

  try { db.exec(`ALTER TABLE runs ADD COLUMN source_identity TEXT;`); } catch {}
  try { db.exec(`ALTER TABLE runs ADD COLUMN mutation_revision INTEGER DEFAULT 0;`); } catch {}
  try { db.exec(`ALTER TABLE verifications ADD COLUMN verified_runtime_revision INTEGER;`); } catch {}
  try { db.exec(`ALTER TABLE verifications ADD COLUMN verified_mutation_revision INTEGER;`); } catch {}
  try { db.exec(`ALTER TABLE verifications ADD COLUMN source_identity TEXT;`); } catch {}
  try { db.exec(`ALTER TABLE verifications ADD COLUMN command TEXT;`); } catch {}
  try { db.exec(`ALTER TABLE verifications ADD COLUMN exit_code INTEGER;`); } catch {}
  try { db.exec(`ALTER TABLE verifications ADD COLUMN evidence_digest TEXT;`); } catch {}

  const now = () => new Date().toISOString();
  const sha256Regex = /^sha256:[a-f0-9]{64}$/i;

  return {
    dbPath,
    createRun({ runId, objective, sourceIdentity }) {
      if (!sourceIdentity || typeof sourceIdentity !== 'string' || !sourceIdentityRegex.test(sourceIdentity)) {
        throw new Error('sourceIdentity is required and must be a valid non-empty identity string for Kernel run');
      }
      db.prepare('INSERT INTO runs(run_id,objective,state,status,revision,mutation_revision,source_identity,updated_at) VALUES(?,?,?,?,0,0,?,?)')
        .run(runId, objective, 'FRAME', 'active', sourceIdentity, now());
      return this.getRun(runId);
    },

    getRun(runId) {
      return db.prepare(`
        SELECT run_id as runId, objective, state, status, revision,
               mutation_revision as mutationRevision, source_identity as sourceIdentity, updated_at as updatedAt
        FROM runs WHERE run_id=?
      `).get(runId) || null;
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

    recordVerification(runId, { status, evidenceRef, sourceIdentity, command, exitCode = 0, evidenceDigest }) {
      const run = this.getRun(runId);
      if (!run) throw new Error(`Run ${runId} not found`);
      if (run.status === 'completed') throw new Error(`Cannot add verification to completed run ${runId}`);
      if (!sourceIdentity || typeof sourceIdentity !== 'string' || !sourceIdentityRegex.test(sourceIdentity)) {
        throw new Error('sourceIdentity is required and must be a valid non-empty identity string for verification');
      }

      db.exec('BEGIN IMMEDIATE TRANSACTION');
      try {
        db.prepare(`
          INSERT INTO verifications(run_id, status, evidence_ref, verified_runtime_revision, verified_mutation_revision, source_identity, command, exit_code, evidence_digest, observed_at)
          VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(runId, status, evidenceRef || null, run.revision, run.mutationRevision, sourceIdentity, command || null, exitCode, evidenceDigest || null, now());

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
          return { decision: 'blocked', run: null, verification: null };
        }

        const verification = db.prepare(`
          SELECT status, evidence_ref as evidenceRef, verified_runtime_revision as verifiedRuntimeRevision,
                 verified_mutation_revision as verifiedMutationRevision,
                 source_identity as sourceIdentity, command, exit_code as exitCode, evidence_digest as evidenceDigest,
                 observed_at as observedAt
          FROM verifications WHERE run_id=? ORDER BY id DESC LIMIT 1
        `).get(runId);

        const isClosed = Boolean(run.state === 'CLOSE');
        const isVerified = Boolean(
          verification &&
          verification.status === 'passed' &&
          Number(verification.exitCode) === 0 &&
          verification.command &&
          verification.evidenceRef &&
          verification.evidenceDigest &&
          sha256Regex.test(verification.evidenceDigest)
        );

        const isSourceIdentityMatch = Boolean(
          run.sourceIdentity &&
          verification &&
          verification.sourceIdentity &&
          verification.sourceIdentity === run.sourceIdentity &&
          (!expectedSourceIdentity || verification.sourceIdentity === expectedSourceIdentity)
        );

        if (run.status === 'completed') {
          db.exec('COMMIT');
          const accepted = isClosed && isVerified && isSourceIdentityMatch;
          return { decision: accepted ? 'accepted' : 'blocked', run, verification: verification || null };
        }

        const verifiedMutation = verification ? (verification.verifiedMutationRevision ?? verification.verifiedRuntimeRevision) : -1;
        const isRevisionBound = Boolean(verification && verifiedMutation === run.mutationRevision);
        const accepted = isClosed && isVerified && isRevisionBound && isSourceIdentityMatch;
        const decision = accepted ? 'accepted' : 'blocked';

        db.prepare('UPDATE runs SET status=?, revision=revision+1, updated_at=? WHERE run_id=?')
          .run(accepted ? 'completed' : 'blocked', now(), runId);
        db.exec('COMMIT');

        return { decision, run: this.getRun(runId), verification: verification || null };
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
