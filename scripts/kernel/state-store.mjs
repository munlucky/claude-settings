import path from 'node:path';
import { createHash } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { resolveKernelRuntimeHome, assertIsolatedRuntimeHomes } from './runtime-home.mjs';
import { canTransition } from './transition.mjs';
import { openSqliteDb } from './sqlite-adapter.mjs';
import { mapCandidateToCanonicalRecord } from './knowledge/canonical-record-mapper.mjs';
import { isProtectedObligation } from './proof/protected-obligations.mjs';
import { assertCommandBinding } from './run/obligation-compiler.mjs';
import { normalizeModelRouteDecision, normalizeModelUsageReceipt } from './run/model-route-contract.mjs';
import { digestOfEvidence, evaluateReviewReceipt, normalizeReviewReceipt, parseReviewEvidenceRef } from './proof/review-receipt.mjs';
import { sanitizePersistentPayload, sanitizePersistentText } from './persistent-sanitizer.mjs';

const TIER_RANK = { T0: 0, T1: 1, T2: 2, T3: 3 };
const EVIDENCE_RANK = { E0: 0, E1: 1, E2: 2 };

export const kernelDbPath = (runtimeHome = resolveKernelRuntimeHome()) => path.join(runtimeHome, 'state', 'runtime-state.sqlite');

// A lease whose owning process has exited cannot be a live conflict; this is
// what lets consecutive CLI invocations of one session proceed while genuinely
// concurrent runners are still detected.
const isProcessAlive = (pid) => {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
};

const sourceIdentityRegex = /^(?:[a-f0-9]{40}|sha256:[a-f0-9]{64}|[a-zA-Z0-9_.:/-]{1,128})$/i;
const sha256Regex = /^sha256:[a-f0-9]{64}$/i;

export const openKernelStateStore = async ({ runtimeHome = resolveKernelRuntimeHome(), relayHome } = {}) => {
  assertIsolatedRuntimeHomes(runtimeHome, relayHome);
  const dbPath = kernelDbPath(runtimeHome);
  await mkdir(path.dirname(dbPath), { recursive: true });
  const db = await openSqliteDb(dbPath);

  db.exec(`
    PRAGMA journal_mode=WAL;
    PRAGMA synchronous=NORMAL;
    PRAGMA busy_timeout=5000;
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
    CREATE TABLE IF NOT EXISTS workspace_mutation_locks (
      project_id TEXT PRIMARY KEY,
      holder_run_id TEXT NOT NULL,
      session_token TEXT NOT NULL,
      fencing_token INTEGER NOT NULL,
      acquired_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
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
    CREATE TABLE IF NOT EXISTS finalization_receipts (
      run_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      completion_status TEXT NOT NULL,
      knowledge_status TEXT NOT NULL,
      projection_status TEXT NOT NULL,
      git_closeout_status TEXT NOT NULL,
      finalization_status TEXT NOT NULL,
      receipt_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
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
    CREATE TABLE IF NOT EXISTS knowledge_review_receipts (
      run_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      status TEXT NOT NULL,
      candidate_count INTEGER NOT NULL,
      verified_count INTEGER NOT NULL,
      rejected_count INTEGER NOT NULL,
      waiting_approval_count INTEGER NOT NULL,
      waiting_verification_count INTEGER NOT NULL,
      review_digest TEXT NOT NULL,
      receipt_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(run_id) REFERENCES runs(run_id)
    );
    CREATE TABLE IF NOT EXISTS candidate_evidence_bindings (
      candidate_id TEXT NOT NULL,
      run_id TEXT NOT NULL,
      evidence_digest TEXT NOT NULL,
      obligation_id TEXT NOT NULL,
      source_identity TEXT NOT NULL,
      mutation_revision INTEGER NOT NULL,
      binding_type TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY(candidate_id, evidence_digest),
      FOREIGN KEY(candidate_id) REFERENCES knowledge_candidates(candidate_id),
      FOREIGN KEY(run_id) REFERENCES runs(run_id)
    );
    CREATE TABLE IF NOT EXISTS model_route_decisions (
      decision_id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      attempt_number INTEGER NOT NULL,
      replan_count INTEGER NOT NULL DEFAULT 0,
      plan_revision INTEGER NOT NULL DEFAULT 1,
      obligation_id TEXT,
      action_kind TEXT NOT NULL,
      role TEXT NOT NULL,
      model_class TEXT NOT NULL,
      risk_tier TEXT NOT NULL,
      independent_context_required INTEGER NOT NULL DEFAULT 0,
      permissions TEXT NOT NULL,
      reason_codes_json TEXT NOT NULL,
      policy_revision TEXT NOT NULL,
      decision_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(run_id) REFERENCES runs(run_id)
    );
    CREATE TABLE IF NOT EXISTS model_usage_receipts (
      receipt_id TEXT PRIMARY KEY,
      decision_id TEXT NOT NULL,
      run_id TEXT NOT NULL,
      host_surface TEXT NOT NULL,
      actor_session_id TEXT NOT NULL,
      parent_session_id TEXT,
      resolved_model TEXT,
      resolved_effort TEXT,
      enforcement_status TEXT NOT NULL,
      input_tokens INTEGER,
      cached_input_tokens INTEGER,
      output_tokens INTEGER,
      cost_micros INTEGER,
      wall_clock_ms INTEGER,
      result_status TEXT NOT NULL,
      receipt_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(decision_id) REFERENCES model_route_decisions(decision_id),
      FOREIGN KEY(run_id) REFERENCES runs(run_id)
    );
    CREATE TABLE IF NOT EXISTS route_admissions (
      admission_id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      step_id TEXT,
      decision_id TEXT NOT NULL,
      capsule_id TEXT,
      requested_json TEXT NOT NULL,
      resolved_json TEXT NOT NULL,
      policy_json TEXT NOT NULL,
      economics_json TEXT NOT NULL,
      decision TEXT NOT NULL,
      rejection_code TEXT,
      digest TEXT NOT NULL,
      admission_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(run_id) REFERENCES runs(run_id)
    );
    CREATE INDEX IF NOT EXISTS idx_route_admissions_run ON route_admissions(run_id, decision_id);
    CREATE TABLE IF NOT EXISTS run_steps (
      step_id TEXT NOT NULL,
      run_id TEXT NOT NULL,
      sequence INTEGER NOT NULL,
      objective TEXT NOT NULL,
      state TEXT NOT NULL,
      plan_revision INTEGER NOT NULL DEFAULT 1,
      dependency_ids_json TEXT NOT NULL DEFAULT '[]',
      allowed_paths_json TEXT NOT NULL DEFAULT '[]',
      forbidden_paths_json TEXT NOT NULL DEFAULT '[]',
      acceptance_ids_json TEXT NOT NULL DEFAULT '[]',
      obligation_ids_json TEXT NOT NULL DEFAULT '[]',
      expected_outputs_json TEXT NOT NULL DEFAULT '[]',
      assigned_role TEXT NOT NULL DEFAULT 'implementer',
      synthetic INTEGER NOT NULL DEFAULT 0,
      migration_origin TEXT,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      capsule_digest TEXT,
      result_digest TEXT,
      workspace_identity_start TEXT,
      workspace_identity_end TEXT,
      blocked_reason TEXT,
      created_at TEXT NOT NULL,
      started_at TEXT,
      completed_at TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(run_id, step_id),
      FOREIGN KEY(run_id) REFERENCES runs(run_id)
    );
    CREATE INDEX IF NOT EXISTS idx_run_steps_run ON run_steps(run_id, plan_revision, sequence);
    CREATE TABLE IF NOT EXISTS run_step_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT NOT NULL,
      step_id TEXT NOT NULL,
      attempt_number INTEGER NOT NULL,
      actor_session_id TEXT,
      capsule_digest TEXT,
      route_decision_id TEXT,
      usage_receipt_id TEXT,
      status TEXT NOT NULL,
      workspace_identity_start TEXT,
      workspace_identity_end TEXT,
      summary TEXT,
      changed_paths_json TEXT NOT NULL DEFAULT '[]',
      result_digest TEXT,
      failure_reasons_json TEXT NOT NULL DEFAULT '[]',
      started_at TEXT NOT NULL,
      finished_at TEXT,
      FOREIGN KEY(run_id) REFERENCES runs(run_id)
    );
    CREATE INDEX IF NOT EXISTS idx_run_step_attempts_step ON run_step_attempts(run_id, step_id);
    CREATE TABLE IF NOT EXISTS run_capsules (
      capsule_id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      step_id TEXT,
      role TEXT NOT NULL,
      plan_revision INTEGER NOT NULL DEFAULT 1,
      mutation_revision INTEGER NOT NULL DEFAULT 0,
      workspace_identity TEXT NOT NULL,
      route_decision_id TEXT,
      digest TEXT NOT NULL,
      capsule_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(run_id) REFERENCES runs(run_id)
    );
    CREATE INDEX IF NOT EXISTS idx_run_capsules_run ON run_capsules(run_id, role);
    CREATE TABLE IF NOT EXISTS review_receipts (
      receipt_id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      obligation_id TEXT NOT NULL,
      review_stage TEXT NOT NULL,
      verdict TEXT NOT NULL,
      finding_class TEXT NOT NULL DEFAULT 'none',
      plan_revision INTEGER NOT NULL DEFAULT 1,
      reviewer_usage_receipt_id TEXT,
      implementer_usage_receipt_id TEXT,
      reviewer_session_id TEXT NOT NULL,
      implementer_session_id TEXT,
      route_decision_id TEXT,
      model_class TEXT NOT NULL,
      resolved_model TEXT,
      enforcement_status TEXT NOT NULL,
      workspace_identity TEXT NOT NULL,
      mutation_revision INTEGER NOT NULL,
      changed_paths_digest TEXT NOT NULL,
      evidence_digest TEXT NOT NULL,
      acceptance_coverage_json TEXT NOT NULL DEFAULT '[]',
      findings_json TEXT NOT NULL DEFAULT '[]',
      rationale TEXT NOT NULL,
      digest TEXT NOT NULL,
      receipt_json TEXT NOT NULL,
      created_by_version TEXT,
      migration_origin TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(run_id) REFERENCES runs(run_id)
    );
    CREATE INDEX IF NOT EXISTS idx_review_receipts_run ON review_receipts(run_id);
    CREATE INDEX IF NOT EXISTS idx_review_receipts_obligation ON review_receipts(run_id, obligation_id);
    CREATE TABLE IF NOT EXISTS run_obligations (
      run_id TEXT NOT NULL,
      obligation_id TEXT NOT NULL,
      source_type TEXT NOT NULL,
      source_ref TEXT,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(run_id, obligation_id),
      FOREIGN KEY(run_id) REFERENCES runs(run_id)
    );
  `);

  const addCol = (t, c, typ) => { try { db.exec(`ALTER TABLE ${t} ADD COLUMN ${c} ${typ}`); } catch {} };
  addCol('git_closeout_receipts', 'status', 'TEXT');
  addCol('git_closeout_receipts', 'before_head_sha', 'TEXT');
  addCol('git_closeout_receipts', 'selected_paths_json', 'TEXT');
  addCol('git_closeout_receipts', 'error_code', 'TEXT');
  addCol('git_closeout_receipts', 'error_message', 'TEXT');
  addCol('git_closeout_receipts', 'updated_at', 'TEXT');

  // Task Contract authority (P0-4), finalization split (P0-7), route cursor (P1-1).
  addCol('runs', 'task_contract_json', 'TEXT');
  addCol('runs', 'contract_revision', 'INTEGER DEFAULT 1');
  addCol('runs', 'finalization_status', "TEXT DEFAULT 'pending'");
  addCol('runs', 'route_json', 'TEXT');
  addCol('runs', 'implementation_context_json', 'TEXT');
  // Plan revision (K2) is the ledger's own revision: a replan supersedes the
  // live steps and writes the replacement plan at the next revision, without
  // touching the task contract's revision.
  addCol('runs', 'plan_revision', 'INTEGER DEFAULT 1');
  // Obligation binding authority (P0-2/P0-3).
  addCol('run_obligations', 'evidence_class', "TEXT DEFAULT 'hard'");
  addCol('run_obligations', 'verification_method', 'TEXT');
  addCol('run_obligations', 'allowed_command_refs', "TEXT DEFAULT '[]'");
  addCol('run_obligations', 'acceptance_ids', "TEXT DEFAULT '[]'");
  addCol('run_obligations', 'protected', 'INTEGER DEFAULT 0');
  addCol('run_obligations', 'contract_revision', 'INTEGER DEFAULT 1');
  addCol('run_obligations', 'rejected_command_refs', "TEXT DEFAULT '[]'");
  // Capsule (K1), admission (K3), and step (K2) lineage on the usage receipt.
  // Legacy receipts keep NULL: a turn that ran before these existed is not
  // retroactively claimed to have had them.
  addCol('model_usage_receipts', 'capsule_id', 'TEXT');
  addCol('model_usage_receipts', 'capsule_digest', 'TEXT');
  addCol('model_usage_receipts', 'admission_id', 'TEXT');
  addCol('model_usage_receipts', 'admission_digest', 'TEXT');
  addCol('model_usage_receipts', 'step_id', 'TEXT');
  addCol('verifications', 'evidence_class', "TEXT DEFAULT 'attested'");
  addCol('verifications', 'contract_revision', 'INTEGER DEFAULT 1');
  addCol('leases', 'fencing_token', 'INTEGER DEFAULT 0');
  addCol('leases', 'owner_pid', 'INTEGER');

  try { db.exec(`ALTER TABLE runs ADD COLUMN source_identity TEXT;`); } catch {}
  try { db.exec(`ALTER TABLE runs ADD COLUMN mutation_revision INTEGER DEFAULT 0;`); } catch {}
  try { db.exec(`ALTER TABLE runs ADD COLUMN run_start_workspace_identity TEXT;`); } catch {}
  try { db.exec(`ALTER TABLE runs ADD COLUMN current_workspace_identity TEXT;`); } catch {}
  try { db.exec(`ALTER TABLE runs ADD COLUMN blocked_reason TEXT;`); } catch {}
  try { db.exec(`ALTER TABLE runs ADD COLUMN intervention_count INTEGER DEFAULT 0;`); } catch {}
  try { db.exec(`ALTER TABLE runs ADD COLUMN project_mode TEXT;`); } catch {}
  try { db.exec(`ALTER TABLE runs ADD COLUMN baseline_failures TEXT DEFAULT '[]';`); } catch {}
  try { db.exec(`ALTER TABLE runs ADD COLUMN baseline_status TEXT DEFAULT 'pending';`); } catch {}
  try { db.exec(`ALTER TABLE runs ADD COLUMN replan_count INTEGER DEFAULT 0;`); } catch {}
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
  try { db.exec(`ALTER TABLE verifications ADD COLUMN verified_source_identity TEXT;`); } catch {}
  try { db.exec(`ALTER TABLE verifications ADD COLUMN executor TEXT DEFAULT 'caller-attested';`); } catch {}
  try { db.exec(`ALTER TABLE verifications ADD COLUMN network_isolation TEXT;`); } catch {}
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
  const persistentJson = (value) => typeof value === 'string'
    ? sanitizePersistentText(value)
    : JSON.stringify(sanitizePersistentPayload(value));

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
      workspaceIdentity = null,
      projectMode = null,
      taskContract = null,
      contractRevision = 1,
      route = null,
      implementationContext = null,
    }) {
      if (!sourceIdentity || typeof sourceIdentity !== 'string' || !sourceIdentityRegex.test(sourceIdentity)) {
        throw new Error('sourceIdentity is required and must be a valid candidate identity string for Kernel run');
      }
      if (workspaceIdentity !== null && !sha256Regex.test(workspaceIdentity)) {
        throw new Error('workspaceIdentity must be a sha256:<hex> digest when provided');
      }
      db.prepare(`
        INSERT INTO runs(run_id, objective, state, status, revision, mutation_revision, source_identity, run_start_workspace_identity, current_workspace_identity, project_mode, proof_tier, evidence_tier, required_obligations, acceptance_criteria, release_evidence_required, project_id, knowledge_revision_start, knowledge_status, task_contract_json, contract_revision, finalization_status, route_json, implementation_context_json, updated_at)
        VALUES(?, ?, 'FRAME', 'active', 0, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, 'pending', ?, ?, ?)
      `).run(
        runId,
        objective,
        sourceIdentity,
        workspaceIdentity,
        workspaceIdentity,
        projectMode || null,
        proofTier,
        evidenceTier,
        JSON.stringify(requiredObligations),
        JSON.stringify(acceptanceCriteria),
        requireReleaseEvidence ? 1 : 0,
        projectId || null,
        knowledgeRevisionStart !== undefined && knowledgeRevisionStart !== null ? String(knowledgeRevisionStart) : null,
        taskContract ? persistentJson(taskContract) : null,
        Number(contractRevision) || 1,
        route ? JSON.stringify(route) : null,
        implementationContext ? persistentJson(implementationContext) : null,
        now()
      );
      return this.getRun(runId);
    },

    // Task Contract is the run's authority; a revision bump records that the
    // model refined it (e.g. supplied a missing evidence plan) mid-run.
    updateTaskContract(runId, taskContract, { bumpRevision = true } = {}) {
      const run = this.getRun(runId);
      if (!run) throw new Error(`Run ${runId} not found`);
      const nextRevision = bumpRevision ? Number(run.contractRevision || 1) + 1 : Number(run.contractRevision || 1);
      db.prepare(`UPDATE runs SET task_contract_json=?, contract_revision=?, acceptance_criteria=?, revision=revision+1, updated_at=? WHERE run_id=?`)
        .run(persistentJson(taskContract), nextRevision, persistentJson((taskContract.acceptance || []).map((item) => item.statement).filter(Boolean)), now(), runId);
      return this.getRun(runId);
    },

    setRunRoute(runId, route) {
      db.prepare(`UPDATE runs SET route_json=?, revision=revision+1, updated_at=? WHERE run_id=?`).run(JSON.stringify(route), now(), runId);
      return this.getRun(runId);
    },

    // Finalization is tracked separately from completion (P0-7): an accepted
    // completion whose knowledge commit or Git closeout failed is NOT done.
    setFinalizationStatus(runId, finalizationStatus) {
      db.prepare(`UPDATE runs SET finalization_status=?, revision=revision+1, updated_at=? WHERE run_id=?`).run(String(finalizationStatus), now(), runId);
      return this.getRun(runId);
    },

    // Compiled obligations are the run's binding authority: which evidence
    // class and which project commands may satisfy each required obligation.
    declareRunObligations(runId, obligations = []) {
      for (const obligation of obligations) {
        db.prepare(`
          INSERT INTO run_obligations(run_id, obligation_id, source_type, source_ref, status, evidence_class, verification_method, allowed_command_refs, rejected_command_refs, acceptance_ids, protected, contract_revision, created_at, updated_at)
          VALUES(?, ?, ?, ?, 'required', ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(run_id, obligation_id) DO UPDATE SET
            evidence_class=excluded.evidence_class,
            verification_method=excluded.verification_method,
            allowed_command_refs=excluded.allowed_command_refs,
            rejected_command_refs=excluded.rejected_command_refs,
            acceptance_ids=excluded.acceptance_ids,
            protected=excluded.protected,
            contract_revision=excluded.contract_revision,
            updated_at=excluded.updated_at
        `).run(
          runId,
          obligation.obligationId,
          obligation.sourceType || 'proof-policy',
          obligation.sourceRef || null,
          obligation.evidenceClass || 'hard',
          obligation.verificationMethod || null,
          JSON.stringify(obligation.allowedCommandRefs || []),
          JSON.stringify(obligation.rejectedCommandRefs || []),
          JSON.stringify(obligation.acceptanceIds || []),
          obligation.protected ? 1 : 0,
          Number(obligation.contractRevision) || 1,
          now(),
          now(),
        );
      }
      return this.getRunObligations(runId);
    },

    // Within a run, route and tier may only be promoted, never demoted
    // (§13.5). Demotion requires a new run.
    escalateRun(runId, { proofTier, evidenceTier, addObligations = [] } = {}) {
      const run = this.getRun(runId);
      if (!run) throw new Error(`Run ${runId} not found`);
      if (run.status === 'completed') throw new Error(`Cannot escalate completed run ${runId}`);

      let nextTier = run.proofTier;
      if (proofTier) {
        if (TIER_RANK[proofTier] === undefined) throw new Error(`Unknown proof tier: ${proofTier}`);
        if (TIER_RANK[proofTier] < TIER_RANK[run.proofTier]) {
          throw new Error(`ROUTE_DEMOTION_FORBIDDEN: cannot demote ${run.proofTier} -> ${proofTier}; start a new run instead`);
        }
        nextTier = proofTier;
      }

      let nextEvidence = run.evidenceTier;
      if (evidenceTier) {
        if (EVIDENCE_RANK[evidenceTier] === undefined) throw new Error(`Unknown evidence tier: ${evidenceTier}`);
        if (EVIDENCE_RANK[evidenceTier] < EVIDENCE_RANK[run.evidenceTier]) {
          throw new Error(`ROUTE_DEMOTION_FORBIDDEN: cannot demote evidence ${run.evidenceTier} -> ${evidenceTier}`);
        }
        nextEvidence = evidenceTier;
      }

      const mergedObligations = [...new Set([...run.requiredObligations, ...addObligations])];
      db.prepare(`UPDATE runs SET proof_tier=?, evidence_tier=?, required_obligations=?, release_evidence_required=?, revision=revision+1, updated_at=? WHERE run_id=?`)
        .run(nextTier, nextEvidence, JSON.stringify(mergedObligations), nextEvidence === 'E2' ? 1 : (run.releaseEvidenceRequired ? 1 : 0), now(), runId);
      return this.getRun(runId);
    },

    setBaselineFailures(runId, failures = []) {
      if (!this.getRun(runId)) throw new Error(`Run ${runId} not found`);
      db.prepare(`UPDATE runs SET baseline_failures=?, updated_at=? WHERE run_id=?`).run(JSON.stringify(failures), now(), runId);
      return this.getRun(runId);
    },

    setBaselineStatus(runId, status) {
      if (!this.getRun(runId)) throw new Error(`Run ${runId} not found`);
      db.prepare(`UPDATE runs SET baseline_status=?, updated_at=? WHERE run_id=?`).run(String(status), now(), runId);
      return this.getRun(runId);
    },

    // A replan is a durable event; counting it keeps the measurement honest.
    incrementReplanCount(runId) {
      if (!this.getRun(runId)) throw new Error(`Run ${runId} not found`);
      db.prepare(`UPDATE runs SET replan_count=replan_count+1, revision=revision+1, updated_at=? WHERE run_id=?`).run(now(), runId);
      return this.getRun(runId);
    },

    markRunBlocked(runId, reason) {
      const run = this.getRun(runId);
      if (!run) throw new Error(`Run ${runId} not found`);
      if (run.status === 'completed') throw new Error(`Cannot block completed run ${runId}`);
      db.prepare(`UPDATE runs SET status='blocked', blocked_reason=?, revision=revision+1, updated_at=? WHERE run_id=?`).run(String(reason || 'question'), now(), runId);
      return this.getRun(runId);
    },

    // Each blocked->active resume is a user intervention; counting it here
    // keeps the measurement honest without a caller-held tally.
    resumeBlockedRun(runId) {
      const run = this.getRun(runId);
      if (!run) throw new Error(`Run ${runId} not found`);
      if (run.status !== 'blocked') return run;
      db.prepare(`UPDATE runs SET status='active', blocked_reason=NULL, intervention_count=intervention_count+1, revision=revision+1, updated_at=? WHERE run_id=?`).run(now(), runId);
      return this.getRun(runId);
    },

    // Mutation revision advances only when the observed workspace identity
    // actually changes, never on state transitions alone.
    observeWorkspaceIdentity(runId, identity) {
      if (!identity || !sha256Regex.test(identity)) {
        throw new Error('observeWorkspaceIdentity requires a sha256:<hex> workspace identity');
      }
      db.exec('BEGIN IMMEDIATE TRANSACTION');
      try {
        const run = this.getRun(runId);
        if (!run) throw new Error(`Run ${runId} not found`);
        if (run.currentWorkspaceIdentity === identity) {
          db.exec('COMMIT');
          return { changed: false, run };
        }
        const isInitialObservation = !run.currentWorkspaceIdentity;
        db.prepare(`
          UPDATE runs
          SET current_workspace_identity=?,
              run_start_workspace_identity=COALESCE(run_start_workspace_identity, ?),
              mutation_revision=mutation_revision+?,
              revision=revision+1,
              updated_at=?
          WHERE run_id=?
        `).run(identity, identity, isInitialObservation ? 0 : 1, now(), runId);
        db.exec('COMMIT');
        return { changed: !isInitialObservation, run: this.getRun(runId) };
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    },

    getRun(runId) {
      const row = db.prepare(`
        SELECT run_id as runId, objective, state, status, revision,
               mutation_revision as mutationRevision, source_identity as sourceIdentity,
               run_start_workspace_identity as runStartWorkspaceIdentity,
               current_workspace_identity as currentWorkspaceIdentity,
               blocked_reason as blockedReason,
               intervention_count as interventionCount,
               project_mode as projectMode,
               baseline_failures as baselineFailures,
               baseline_status as baselineStatus,
               replan_count as replanCount,
               proof_tier as proofTier, evidence_tier as evidenceTier,
               required_obligations as requiredObligations, acceptance_criteria as acceptanceCriteria,
               release_evidence_required as releaseEvidenceRequired,
               project_id as projectId, knowledge_revision_start as knowledgeRevisionStart,
               knowledge_revision_close as knowledgeRevisionClose, knowledge_status as knowledgeStatus,
               context_pack_ref as contextPackRef,
               task_contract_json as taskContractJson,
               contract_revision as contractRevision,
               finalization_status as finalizationStatus,
               route_json as routeJson,
               implementation_context_json as implementationContextJson,
               plan_revision as planRevision,
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
        runStartWorkspaceIdentity: row.runStartWorkspaceIdentity || null,
        currentWorkspaceIdentity: row.currentWorkspaceIdentity || null,
        blockedReason: row.blockedReason || null,
        interventionCount: row.interventionCount || 0,
        projectMode: row.projectMode || null,
        baselineFailures: safeJsonParse(row.baselineFailures, []),
        baselineStatus: row.baselineStatus || 'pending',
        replanCount: row.replanCount || 0,
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
        taskContract: row.taskContractJson ? safeJsonParse(row.taskContractJson, null) : null,
        contractRevision: Number(row.contractRevision || 1),
        finalizationStatus: row.finalizationStatus || 'pending',
        route: row.routeJson ? safeJsonParse(row.routeJson, null) : null,
        implementationContext: row.implementationContextJson ? safeJsonParse(row.implementationContextJson, null) : null,
        planRevision: Number(row.planRevision || 1),
        updatedAt: row.updatedAt,
      };
    },

    listActiveRuns({ projectId = null } = {}) {
      const rows = projectId
        ? db.prepare(`SELECT run_id as runId FROM runs WHERE project_id=? AND status='active' ORDER BY updated_at DESC`).all(projectId)
        : db.prepare(`SELECT run_id as runId FROM runs WHERE status='active' ORDER BY updated_at DESC`).all();
      return rows.map((row) => this.getRun(row.runId)).filter(Boolean);
    },

    acquireWorkspaceMutationLock({ projectId, runId, sessionToken, ttlMs = 60000 } = {}) {
      if (!projectId || !runId || !sessionToken) throw new Error('workspace mutation lock requires projectId, runId, and sessionToken');
      const acquiredAt = now();
      const expiresAt = new Date(Date.now() + ttlMs).toISOString();
      db.exec('BEGIN IMMEDIATE');
      try {
        const current = db.prepare(`SELECT project_id as projectId, holder_run_id as holderRunId, session_token as sessionToken, fencing_token as fencingToken, acquired_at as acquiredAt, expires_at as expiresAt FROM workspace_mutation_locks WHERE project_id=?`).get(projectId);
        if (current && Date.parse(current.expiresAt) > Date.now() && (current.holderRunId !== runId || current.sessionToken !== sessionToken)) {
          db.exec('ROLLBACK');
          return { acquired: false, lock: current };
        }
        const fencingToken = Number(current?.fencingToken || 0) + 1;
        db.prepare(`
          INSERT INTO workspace_mutation_locks(project_id, holder_run_id, session_token, fencing_token, acquired_at, expires_at)
          VALUES(?, ?, ?, ?, ?, ?)
          ON CONFLICT(project_id) DO UPDATE SET holder_run_id=excluded.holder_run_id, session_token=excluded.session_token, fencing_token=excluded.fencing_token, acquired_at=excluded.acquired_at, expires_at=excluded.expires_at
        `).run(projectId, runId, sessionToken, fencingToken, acquiredAt, expiresAt);
        db.exec('COMMIT');
        return { acquired: true, lock: { projectId, holderRunId: runId, sessionToken, fencingToken, acquiredAt, expiresAt } };
      } catch (error) {
        try { db.exec('ROLLBACK'); } catch {}
        throw error;
      }
    },

    getWorkspaceMutationLock(projectId) {
      const row = db.prepare(`SELECT project_id as projectId, holder_run_id as holderRunId, session_token as sessionToken, fencing_token as fencingToken, acquired_at as acquiredAt, expires_at as expiresAt FROM workspace_mutation_locks WHERE project_id=?`).get(projectId);
      if (!row || Date.parse(row.expiresAt) <= Date.now()) return null;
      return row;
    },

    releaseWorkspaceMutationLock({ projectId, runId, sessionToken } = {}) {
      const result = db.prepare(`UPDATE workspace_mutation_locks SET expires_at=? WHERE project_id=? AND holder_run_id=? AND session_token=?`)
        .run('1970-01-01T00:00:00.000Z', projectId, runId, sessionToken);
      return Number(result.changes || 0) > 0;
    },

    recordKnowledgeContextReceipt(runId, { stage, knowledgeRevision, digest, receiptJson }) {
      db.prepare(`
        INSERT INTO knowledge_context_receipts(run_id, stage, knowledge_revision, digest, receipt_json, created_at)
        VALUES(?, ?, ?, ?, ?, ?)
        ON CONFLICT(run_id, stage) DO UPDATE SET knowledge_revision=excluded.knowledge_revision, digest=excluded.digest, receipt_json=excluded.receipt_json, created_at=excluded.created_at
      `).run(runId, stage, knowledgeRevision, digest, persistentJson(receiptJson), now());
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
      `).run(candidateId, runId, projectId, proposedType, status, persistentJson(candidateJson), now());
    },

    getKnowledgeCandidates(runId) {
      return db.prepare(`SELECT candidate_id as candidateId, run_id as runId, project_id as projectId, proposed_type as proposedType, status, candidate_json as candidateJson, created_at as createdAt FROM knowledge_candidates WHERE run_id=?`).all(runId).map((row) => ({ ...row, candidateJson: safeJsonParse(row.candidateJson, {}) }));
    },

    recordKnowledgeReviewReceipt(runId, { projectId, status, candidateCount = 0, verifiedCount = 0, rejectedCount = 0, waitingApprovalCount = 0, waitingVerificationCount = 0, reviewDigest, receiptJson }) {
      db.prepare(`
        INSERT INTO knowledge_review_receipts(run_id, project_id, status, candidate_count, verified_count, rejected_count, waiting_approval_count, waiting_verification_count, review_digest, receipt_json, created_at, updated_at)
        VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(run_id) DO UPDATE SET status=excluded.status, candidate_count=excluded.candidate_count, verified_count=excluded.verified_count, rejected_count=excluded.rejected_count, waiting_approval_count=excluded.waiting_approval_count, waiting_verification_count=excluded.waiting_verification_count, review_digest=excluded.review_digest, receipt_json=excluded.receipt_json, updated_at=excluded.updated_at
      `).run(runId, projectId, status, candidateCount, verifiedCount, rejectedCount, waitingApprovalCount, waitingVerificationCount, reviewDigest, persistentJson(receiptJson || {}), now(), now());
    },

    getKnowledgeReviewReceipt(runId) {
      const row = db.prepare(`SELECT run_id as runId, project_id as projectId, status, candidate_count as candidateCount, verified_count as verifiedCount, rejected_count as rejectedCount, waiting_approval_count as waitingApprovalCount, waiting_verification_count as waitingVerificationCount, review_digest as reviewDigest, receipt_json as receiptJson, created_at as createdAt, updated_at as updatedAt FROM knowledge_review_receipts WHERE run_id=?`).get(runId);
      if (!row) return null;
      return { ...row, receiptJson: safeJsonParse(row.receiptJson, {}) };
    },

    recordCandidateEvidenceBinding({ candidateId, runId, evidenceDigest, obligationId = 'default', sourceIdentity, mutationRevision, bindingType = 'verification' }) {
      db.prepare(`
        INSERT INTO candidate_evidence_bindings(candidate_id, run_id, evidence_digest, obligation_id, source_identity, mutation_revision, binding_type, created_at)
        VALUES(?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(candidate_id, evidence_digest) DO NOTHING
      `).run(candidateId, runId, evidenceDigest, obligationId, sourceIdentity, mutationRevision, bindingType, now());
    },

    getCandidateEvidenceBindings(runId, candidateId = null) {
      if (candidateId) {
        return db.prepare(`SELECT candidate_id as candidateId, run_id as runId, evidence_digest as evidenceDigest, obligation_id as obligationId, source_identity as sourceIdentity, mutation_revision as mutationRevision, binding_type as bindingType, created_at as createdAt FROM candidate_evidence_bindings WHERE run_id=? AND candidate_id=?`).all(runId, candidateId);
      }
      return db.prepare(`SELECT candidate_id as candidateId, run_id as runId, evidence_digest as evidenceDigest, obligation_id as obligationId, source_identity as sourceIdentity, mutation_revision as mutationRevision, binding_type as bindingType, created_at as createdAt FROM candidate_evidence_bindings WHERE run_id=?`).all(runId);
    },

    ensureRunObligation(runId, { obligationId, sourceType = 'ontology_constraint', sourceRef = null, evidenceClass = 'hard', verificationMethod = null, allowedCommandRefs = [], acceptanceIds = [], status = 'required' }) {
      const run = this.getRun(runId);
      db.prepare(`
        INSERT INTO run_obligations(run_id, obligation_id, source_type, source_ref, status, evidence_class, verification_method, allowed_command_refs, acceptance_ids, protected, contract_revision, created_at, updated_at)
        VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(run_id, obligation_id) DO NOTHING
      `).run(
        runId,
        obligationId,
        sourceType,
        sourceRef || null,
        status,
        evidenceClass,
        verificationMethod,
        JSON.stringify(allowedCommandRefs),
        JSON.stringify(acceptanceIds),
        isProtectedObligation(obligationId) ? 1 : 0,
        Number(run?.contractRevision || 1),
        now(),
        now(),
      );
    },

    markRunObligationPassed(runId, obligationId) {
      db.prepare(`UPDATE run_obligations SET status='passed', updated_at=? WHERE run_id=? AND obligation_id=?`).run(now(), runId, obligationId);
    },

    getRunObligations(runId) {
      return db.prepare(`SELECT run_id as runId, obligation_id as obligationId, source_type as sourceType, source_ref as sourceRef, status, evidence_class as evidenceClass, verification_method as verificationMethod, allowed_command_refs as allowedCommandRefs, rejected_command_refs as rejectedCommandRefs, acceptance_ids as acceptanceIds, protected, contract_revision as contractRevision, created_at as createdAt, updated_at as updatedAt FROM run_obligations WHERE run_id=?`).all(runId).map((row) => ({
        ...row,
        allowedCommandRefs: safeJsonParse(row.allowedCommandRefs, []),
        rejectedCommandRefs: safeJsonParse(row.rejectedCommandRefs, []),
        acceptanceIds: safeJsonParse(row.acceptanceIds, []),
        protected: Boolean(row.protected),
      }));
    },

    getRunObligation(runId, obligationId) {
      return this.getRunObligations(runId).find((obligation) => obligation.obligationId === obligationId) || null;
    },

    recordKnowledgeCommitReceipt(runId, { projectId, revisionBefore, revisionAfter, status = 'committed', receiptJson }) {
      db.prepare(`
        INSERT INTO knowledge_commit_receipts(run_id, project_id, revision_before, revision_after, status, receipt_json, created_at)
        VALUES(?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(run_id) DO UPDATE SET revision_before=excluded.revision_before, revision_after=excluded.revision_after, status=excluded.status, receipt_json=excluded.receipt_json, created_at=excluded.created_at
      `).run(runId, projectId, revisionBefore, revisionAfter, status, persistentJson(receiptJson), now());
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
      `).run(runId, decision, sourceIdentity, mutationRevision, evidenceDigest, persistentJson(decisionJson), now());
    },

    getCompletionDecision(runId) {
      const row = db.prepare(`SELECT run_id as runId, decision, source_identity as sourceIdentity, mutation_revision as mutationRevision, evidence_digest as evidenceDigest, decision_json as decisionJson, created_at as createdAt FROM completion_decisions WHERE run_id=?`).get(runId);
      if (!row) return null;
      return { ...row, decisionJson: safeJsonParse(row.decisionJson, {}) };
    },

    recordGitCloseoutReceipt(runId, { projectId, mode, commitSha, branch, remote = 'origin', pushStatus, parity, status = 'completed', beforeHeadSha = null, selectedPaths = [], errorCode = null, errorMessage = null, receiptJson }) {
      db.prepare(`
        INSERT INTO git_closeout_receipts(run_id, project_id, mode, commit_sha, branch, remote, push_status, parity, status, before_head_sha, selected_paths_json, error_code, error_message, receipt_json, created_at, updated_at)
        VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(run_id) DO UPDATE SET mode=excluded.mode, commit_sha=excluded.commit_sha, branch=excluded.branch, remote=excluded.remote, push_status=excluded.push_status, parity=excluded.parity, status=excluded.status, before_head_sha=excluded.before_head_sha, selected_paths_json=excluded.selected_paths_json, error_code=excluded.error_code, error_message=excluded.error_message, receipt_json=excluded.receipt_json, updated_at=excluded.updated_at
      `).run(runId, projectId, mode, commitSha || null, branch || null, remote, pushStatus, parity, status, beforeHeadSha || null, JSON.stringify(selectedPaths), errorCode || null, errorMessage || null, typeof receiptJson === 'string' ? receiptJson : JSON.stringify(receiptJson || {}), now(), now());
    },

    getGitCloseoutReceipt(runId) {
      const row = db.prepare(`SELECT run_id as runId, project_id as projectId, mode, commit_sha as commitSha, branch, remote, push_status as pushStatus, parity, status, before_head_sha as beforeHeadSha, selected_paths_json as selectedPathsJson, error_code as errorCode, error_message as errorMessage, receipt_json as receiptJson, created_at as createdAt, updated_at as updatedAt FROM git_closeout_receipts WHERE run_id=?`).get(runId);
      if (!row) return null;
      return { ...row, receiptJson: safeJsonParse(row.receiptJson, {}), selectedPaths: safeJsonParse(row.selectedPathsJson, []) };
    },

    recordFinalizationReceipt(runId, receipt = {}) {
      const { projectId, completionStatus, knowledgeStatus, projectionStatus, gitCloseoutStatus, finalizationStatus, receiptJson } = receipt;
      const jsonStr = persistentJson(receiptJson || receipt || {});
      db.prepare(`
        INSERT INTO finalization_receipts(run_id, project_id, completion_status, knowledge_status, projection_status, git_closeout_status, finalization_status, receipt_json, created_at, updated_at)
        VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(run_id) DO UPDATE SET completion_status=excluded.completion_status, knowledge_status=excluded.knowledge_status, projection_status=excluded.projection_status, git_closeout_status=excluded.git_closeout_status, finalization_status=excluded.finalization_status, receipt_json=excluded.receipt_json, updated_at=excluded.updated_at
      `).run(runId, projectId || 'unknown', completionStatus || 'unknown', knowledgeStatus || 'unknown', projectionStatus || 'completed', gitCloseoutStatus || 'skipped', finalizationStatus || 'unknown', jsonStr, now(), now());
    },

    getFinalizationReceipt(runId) {
      const row = db.prepare(`SELECT run_id as runId, project_id as projectId, completion_status as completionStatus, knowledge_status as knowledgeStatus, projection_status as projectionStatus, git_closeout_status as gitCloseoutStatus, finalization_status as finalizationStatus, receipt_json as receiptJson, created_at as createdAt, updated_at as updatedAt FROM finalization_receipts WHERE run_id=?`).get(runId);
      if (!row) return null;
      return { ...row, receiptJson: safeJsonParse(row.receiptJson, {}) };
    },

    // Model routing evidence (§7). The decision is written BEFORE the Host
    // dispatches, so a crashed turn leaves an interrupted decision rather than
    // an invisible one; the receipt is what proves the Host actually complied.
    recordModelRouteDecision(runId, decision) {
      const normalized = normalizeModelRouteDecision(decision);
      if (normalized.runId !== runId) throw new Error(`model route decision runId ${normalized.runId} does not match run ${runId}`);
      if (!this.getRun(runId)) throw new Error(`Run ${runId} not found`);
      db.prepare(`
        INSERT INTO model_route_decisions(decision_id, run_id, attempt_number, replan_count, plan_revision, obligation_id, action_kind, role, model_class, risk_tier, independent_context_required, permissions, reason_codes_json, policy_revision, decision_json, created_at)
        VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(decision_id) DO UPDATE SET decision_json=excluded.decision_json, reason_codes_json=excluded.reason_codes_json, model_class=excluded.model_class, action_kind=excluded.action_kind, independent_context_required=excluded.independent_context_required
      `).run(
        normalized.decisionId, runId, normalized.attemptNumber, normalized.replanCount, normalized.planRevision,
        normalized.obligationId, normalized.actionKind, normalized.role, normalized.modelClass, normalized.riskTier,
        normalized.independentContextRequired ? 1 : 0, normalized.permissions, JSON.stringify(normalized.reasonCodes),
        normalized.policyRevision, persistentJson(normalized), normalized.createdAt,
      );
      return normalized;
    },

    getModelRouteDecision(decisionId, { runId = null } = {}) {
      const row = db.prepare(`SELECT run_id as runId, decision_json as decisionJson FROM model_route_decisions WHERE decision_id=?`).get(decisionId);
      if (!row) return null;
      if (runId && row.runId !== runId) return null;
      return safeJsonParse(row.decisionJson, null);
    },

    listModelRouteDecisions(runId) {
      return db.prepare(`SELECT decision_json as decisionJson FROM model_route_decisions WHERE run_id=? ORDER BY rowid ASC`).all(runId)
        .map((row) => safeJsonParse(row.decisionJson, null)).filter(Boolean);
    },

    recordModelUsageReceipt(runId, receipt) {
      const normalized = normalizeModelUsageReceipt(receipt);
      if (normalized.runId !== runId) throw new Error(`model usage receipt runId ${normalized.runId} does not match run ${runId}`);
      const decision = this.getModelRouteDecision(normalized.decisionId, { runId });
      if (!decision) throw new Error(`model usage receipt references decision ${normalized.decisionId}, which does not belong to run ${runId}`);
      db.prepare(`
        INSERT INTO model_usage_receipts(receipt_id, decision_id, run_id, host_surface, actor_session_id, parent_session_id, resolved_model, resolved_effort, enforcement_status, input_tokens, cached_input_tokens, output_tokens, cost_micros, wall_clock_ms, result_status, capsule_id, capsule_digest, admission_id, admission_digest, step_id, receipt_json, created_at)
        VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(receipt_id) DO UPDATE SET enforcement_status=excluded.enforcement_status, resolved_model=excluded.resolved_model, resolved_effort=excluded.resolved_effort, input_tokens=excluded.input_tokens, cached_input_tokens=excluded.cached_input_tokens, output_tokens=excluded.output_tokens, cost_micros=excluded.cost_micros, wall_clock_ms=excluded.wall_clock_ms, result_status=excluded.result_status, capsule_id=excluded.capsule_id, capsule_digest=excluded.capsule_digest, admission_id=excluded.admission_id, admission_digest=excluded.admission_digest, step_id=excluded.step_id, receipt_json=excluded.receipt_json
      `).run(
        normalized.receiptId, normalized.decisionId, runId, normalized.hostSurface, normalized.actorSessionId,
        normalized.parentSessionId, normalized.resolvedModel, normalized.resolvedEffort, normalized.enforcementStatus,
        normalized.inputTokens, normalized.cachedInputTokens, normalized.outputTokens, normalized.costMicros,
        normalized.wallClockMs, normalized.resultStatus,
        normalized.capsuleId, normalized.capsuleDigest, normalized.admissionId, normalized.admissionDigest, normalized.stepId,
        persistentJson(normalized), normalized.createdAt,
      );
      return normalized;
    },

    getModelUsageReceipt(receiptId, { runId = null } = {}) {
      const row = db.prepare(`SELECT run_id as runId, receipt_json as receiptJson FROM model_usage_receipts WHERE receipt_id=?`).get(receiptId);
      if (!row) return null;
      if (runId && row.runId !== runId) return null;
      return safeJsonParse(row.receiptJson, null);
    },

    listModelUsageReceipts(runId) {
      return db.prepare(`SELECT receipt_json as receiptJson FROM model_usage_receipts WHERE run_id=? ORDER BY rowid ASC`).all(runId)
        .map((row) => safeJsonParse(row.receiptJson, null)).filter(Boolean);
    },

    // Route admissions (K3). Recorded whatever the outcome: a blocked admission
    // is the evidence that a dispatch was refused, and losing it would make a
    // refusal indistinguishable from a turn that never happened.
    recordRouteAdmission(runId, admission) {
      if (!admission?.admissionId) throw new Error('recordRouteAdmission requires a built admission');
      if (admission.runId !== runId) throw new Error(`route admission runId ${admission.runId} does not match run ${runId}`);
      if (!this.getRun(runId)) throw new Error(`Run ${runId} not found`);
      db.prepare(`
        INSERT INTO route_admissions(admission_id, run_id, step_id, decision_id, capsule_id, requested_json, resolved_json, policy_json, economics_json, decision, rejection_code, digest, admission_json, created_at)
        VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(admission_id) DO NOTHING
      `).run(
        admission.admissionId, runId, admission.stepId || null, admission.decisionId, admission.capsuleId || null,
        JSON.stringify(admission.requested), JSON.stringify(admission.resolved), JSON.stringify(admission.policy),
        JSON.stringify(admission.economics), admission.decision, admission.rejectionCode || null,
        admission.digest, persistentJson(admission), admission.createdAt,
      );
      return admission;
    },

    getRouteAdmission(admissionId, { runId = null } = {}) {
      const row = db.prepare(`SELECT run_id as runId, admission_json as admissionJson FROM route_admissions WHERE admission_id=?`).get(admissionId);
      if (!row) return null;
      if (runId && row.runId !== runId) return null;
      return safeJsonParse(row.admissionJson, null);
    },

    listRouteAdmissions(runId, { decisionId = null } = {}) {
      const rows = decisionId
        ? db.prepare(`SELECT admission_json as admissionJson FROM route_admissions WHERE run_id=? AND decision_id=? ORDER BY rowid ASC`).all(runId, decisionId)
        : db.prepare(`SELECT admission_json as admissionJson FROM route_admissions WHERE run_id=? ORDER BY rowid ASC`).all(runId);
      return rows.map((row) => safeJsonParse(row.admissionJson, null)).filter(Boolean);
    },

    // Run Step Ledger (K2). The work cursor is state, not chat context: which
    // unit is running, what it may touch, what it must prove, and how many times
    // it has already failed all survive a process restart.
    createRunSteps(runId, steps = []) {
      if (!this.getRun(runId)) throw new Error(`Run ${runId} not found`);
      // Step ids are unique per run. A replacement plan that reuses an id from a
      // superseded revision would be swallowed by the upsert and vanish, leaving
      // the run pointing at a plan that is missing steps — so it fails loudly.
      const existing = new Map(this.getRunSteps(runId).map((step) => [step.stepId, step.planRevision]));
      for (const step of steps) {
        const collidesWith = existing.get(step.stepId);
        if (collidesWith !== undefined && collidesWith !== Number(step.planRevision || 1)) {
          throw new Error(`STEP_ID_COLLISION: step "${step.stepId}" already exists at plan revision ${collidesWith}; a replacement plan needs its own ids`);
        }
      }
      const insert = db.prepare(`
        INSERT INTO run_steps(step_id, run_id, sequence, objective, state, plan_revision, dependency_ids_json, allowed_paths_json, forbidden_paths_json, acceptance_ids_json, obligation_ids_json, expected_outputs_json, assigned_role, synthetic, migration_origin, created_at, updated_at)
        VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(run_id, step_id) DO NOTHING
      `);
      for (const step of steps) {
        insert.run(
          step.stepId, runId, Number(step.sequence) || 1, String(step.objective || ''), String(step.state || 'planned'),
          Number(step.planRevision) || 1,
          JSON.stringify(step.dependencyIds || []), JSON.stringify(step.allowedPaths || []), JSON.stringify(step.forbiddenPaths || []),
          JSON.stringify(step.acceptanceIds || []), JSON.stringify(step.obligationIds || []), JSON.stringify(step.expectedOutputs || []),
          String(step.assignedRole || 'implementer'), step.synthetic ? 1 : 0, step.migrationOrigin || null, now(), now(),
        );
      }
      return this.getRunSteps(runId);
    },

    getRunSteps(runId, { planRevision = null } = {}) {
      const rows = planRevision === null
        ? db.prepare(`SELECT * FROM run_steps WHERE run_id=? ORDER BY plan_revision ASC, sequence ASC`).all(runId)
        : db.prepare(`SELECT * FROM run_steps WHERE run_id=? AND plan_revision=? ORDER BY sequence ASC`).all(runId, planRevision);
      return rows.map((row) => ({
        stepId: row.step_id,
        runId: row.run_id,
        sequence: row.sequence,
        objective: row.objective,
        state: row.state,
        planRevision: row.plan_revision,
        dependencyIds: safeJsonParse(row.dependency_ids_json, []),
        allowedPaths: safeJsonParse(row.allowed_paths_json, []),
        forbiddenPaths: safeJsonParse(row.forbidden_paths_json, []),
        acceptanceIds: safeJsonParse(row.acceptance_ids_json, []),
        obligationIds: safeJsonParse(row.obligation_ids_json, []),
        expectedOutputs: safeJsonParse(row.expected_outputs_json, []),
        assignedRole: row.assigned_role,
        synthetic: Boolean(row.synthetic),
        migrationOrigin: row.migration_origin || null,
        attemptCount: row.attempt_count,
        capsuleDigest: row.capsule_digest || null,
        resultDigest: row.result_digest || null,
        workspaceIdentityStart: row.workspace_identity_start || null,
        workspaceIdentityEnd: row.workspace_identity_end || null,
        blockedReason: row.blocked_reason || null,
        createdAt: row.created_at,
        startedAt: row.started_at || null,
        completedAt: row.completed_at || null,
        updatedAt: row.updated_at,
      }));
    },

    getRunStep(runId, stepId) {
      return this.getRunSteps(runId).find((step) => step.stepId === stepId) || null;
    },

    updateRunStep(runId, stepId, patch = {}) {
      const columns = {
        state: 'state',
        attemptCount: 'attempt_count',
        capsuleDigest: 'capsule_digest',
        resultDigest: 'result_digest',
        workspaceIdentityStart: 'workspace_identity_start',
        workspaceIdentityEnd: 'workspace_identity_end',
        blockedReason: 'blocked_reason',
        startedAt: 'started_at',
        completedAt: 'completed_at',
      };
      const assignments = [];
      const values = [];
      for (const [key, column] of Object.entries(columns)) {
        if (patch[key] === undefined) continue;
        assignments.push(`${column}=?`);
        values.push(patch[key]);
      }
      if (assignments.length === 0) return this.getRunStep(runId, stepId);
      db.prepare(`UPDATE run_steps SET ${assignments.join(', ')}, updated_at=? WHERE run_id=? AND step_id=?`).run(...values, now(), runId, stepId);
      return this.getRunStep(runId, stepId);
    },

    // A replan never edits an attempted step; it supersedes it, so what was tried
    // stays readable at its own plan revision.
    supersedeRunSteps(runId, { planRevision }) {
      db.prepare(`UPDATE run_steps SET state='superseded', updated_at=? WHERE run_id=? AND plan_revision=? AND state NOT IN ('passed','superseded','cancelled')`)
        .run(now(), runId, planRevision);
      return this.getRunSteps(runId);
    },

    setPlanRevision(runId, planRevision) {
      db.prepare(`UPDATE runs SET plan_revision=?, revision=revision+1, updated_at=? WHERE run_id=?`).run(Number(planRevision), now(), runId);
      return this.getRun(runId);
    },

    recordStepAttempt(runId, { stepId, actorSessionId = null, capsuleDigest = null, routeDecisionId = null, usageReceiptId = null, workspaceIdentityStart = null, summary = null, changedPaths = [] }) {
      const attemptNumber = this.nextStepAttemptNumber(runId, stepId);
      const result = db.prepare(`
        INSERT INTO run_step_attempts(run_id, step_id, attempt_number, actor_session_id, capsule_digest, route_decision_id, usage_receipt_id, status, workspace_identity_start, summary, changed_paths_json, started_at)
        VALUES(?, ?, ?, ?, ?, ?, ?, 'started', ?, ?, ?, ?)
      `).run(runId, stepId, attemptNumber, actorSessionId, capsuleDigest, routeDecisionId, usageReceiptId, workspaceIdentityStart, summary, JSON.stringify(changedPaths), now());
      db.prepare(`UPDATE run_steps SET attempt_count=attempt_count+1, updated_at=? WHERE run_id=? AND step_id=?`).run(now(), runId, stepId);
      return this.getStepAttempt(result.lastInsertRowid);
    },

    finishStepAttempt(attemptId, { status = 'finished', workspaceIdentityEnd = null, resultDigest = null, failureReasons = [], changedPaths = null } = {}) {
      const assignments = ['status=?', 'finished_at=?', 'workspace_identity_end=?', 'result_digest=?', 'failure_reasons_json=?'];
      const values = [status, now(), workspaceIdentityEnd, resultDigest, JSON.stringify(failureReasons)];
      if (changedPaths) {
        assignments.push('changed_paths_json=?');
        values.push(JSON.stringify(changedPaths));
      }
      db.prepare(`UPDATE run_step_attempts SET ${assignments.join(', ')} WHERE id=?`).run(...values, attemptId);
      return this.getStepAttempt(attemptId);
    },

    getStepAttempt(id) {
      const row = db.prepare(`SELECT * FROM run_step_attempts WHERE id=?`).get(id);
      if (!row) return null;
      return {
        id: row.id,
        runId: row.run_id,
        stepId: row.step_id,
        attemptNumber: row.attempt_number,
        actorSessionId: row.actor_session_id || null,
        capsuleDigest: row.capsule_digest || null,
        routeDecisionId: row.route_decision_id || null,
        usageReceiptId: row.usage_receipt_id || null,
        status: row.status,
        workspaceIdentityStart: row.workspace_identity_start || null,
        workspaceIdentityEnd: row.workspace_identity_end || null,
        summary: row.summary || null,
        changedPaths: safeJsonParse(row.changed_paths_json, []),
        resultDigest: row.result_digest || null,
        failureReasons: safeJsonParse(row.failure_reasons_json, []),
        startedAt: row.started_at,
        finishedAt: row.finished_at || null,
      };
    },

    getStepAttempts(runId, { stepId = null } = {}) {
      const rows = stepId
        ? db.prepare(`SELECT id FROM run_step_attempts WHERE run_id=? AND step_id=? ORDER BY id ASC`).all(runId, stepId)
        : db.prepare(`SELECT id FROM run_step_attempts WHERE run_id=? ORDER BY id ASC`).all(runId);
      return rows.map((row) => this.getStepAttempt(row.id));
    },

    nextStepAttemptNumber(runId, stepId) {
      const row = db.prepare(`SELECT MAX(attempt_number) as maxAttempt FROM run_step_attempts WHERE run_id=? AND step_id=?`).get(runId, stepId);
      return (row?.maxAttempt || 0) + 1;
    },

    // Execution capsules (K1). The capsule a worker actually received is
    // persisted, so a resumed process can hand out the same bounded context and
    // a report can be checked against the capsule it claims to answer.
    recordExecutionCapsule(runId, capsule) {
      if (!capsule?.capsuleId) throw new Error('recordExecutionCapsule requires a normalized capsule');
      if (capsule.runId !== runId) throw new Error(`capsule runId ${capsule.runId} does not match run ${runId}`);
      if (!this.getRun(runId)) throw new Error(`Run ${runId} not found`);
      db.prepare(`
        INSERT INTO run_capsules(capsule_id, run_id, step_id, role, plan_revision, mutation_revision, workspace_identity, route_decision_id, digest, capsule_json, created_at)
        VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(capsule_id) DO NOTHING
      `).run(
        capsule.capsuleId, runId, capsule.stepId || null, capsule.role,
        Number(capsule.planRevision || 1),
        Number(capsule.mutationRevision ?? capsule.subject?.mutationRevision ?? 0),
        capsule.provenance.workspaceIdentity, capsule.provenance.routeDecisionId || null,
        capsule.provenance.capsuleDigest, persistentJson(capsule), capsule.createdAt,
      );
      return capsule;
    },

    getExecutionCapsule(capsuleId, { runId = null } = {}) {
      const row = db.prepare(`SELECT run_id as runId, capsule_json as capsuleJson FROM run_capsules WHERE capsule_id=?`).get(capsuleId);
      if (!row) return null;
      if (runId && row.runId !== runId) return null;
      return safeJsonParse(row.capsuleJson, null);
    },

    latestExecutionCapsule(runId, { role = 'implementer', stepId = null } = {}) {
      const row = stepId
        ? db.prepare(`SELECT capsule_json as capsuleJson FROM run_capsules WHERE run_id=? AND role=? AND step_id=? ORDER BY rowid DESC LIMIT 1`).get(runId, role, stepId)
        : db.prepare(`SELECT capsule_json as capsuleJson FROM run_capsules WHERE run_id=? AND role=? ORDER BY rowid DESC LIMIT 1`).get(runId, role);
      return row ? safeJsonParse(row.capsuleJson, null) : null;
    },

    listExecutionCapsules(runId) {
      return db.prepare(`SELECT capsule_json as capsuleJson FROM run_capsules WHERE run_id=? ORDER BY rowid ASC`).all(runId)
        .map((row) => safeJsonParse(row.capsuleJson, null)).filter(Boolean);
    },

    // Review receipts (K0). A judgment obligation is proven by a receipt whose
    // reviewer lineage and reviewed subject are both persisted, so a later
    // completion check can re-derive whether the review still holds.
    recordReviewReceipt(runId, receipt) {
      const normalized = normalizeReviewReceipt(sanitizePersistentPayload({ ...receipt, runId: receipt?.runId || runId }));
      if (normalized.runId !== runId) throw new Error(`review receipt runId ${normalized.runId} does not match run ${runId}`);
      if (!this.getRun(runId)) throw new Error(`Run ${runId} not found`);
      db.prepare(`
        INSERT INTO review_receipts(receipt_id, run_id, obligation_id, review_stage, verdict, finding_class, plan_revision, reviewer_usage_receipt_id, implementer_usage_receipt_id, reviewer_session_id, implementer_session_id, route_decision_id, model_class, resolved_model, enforcement_status, workspace_identity, mutation_revision, changed_paths_digest, evidence_digest, acceptance_coverage_json, findings_json, rationale, digest, receipt_json, created_by_version, migration_origin, created_at)
        VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(receipt_id) DO NOTHING
      `).run(
        normalized.receiptId, runId, normalized.obligationId, normalized.reviewStage, normalized.verdict,
        normalized.findingClass, normalized.planRevision,
        normalized.reviewer.usageReceiptId, normalized.implementer.usageReceiptId,
        normalized.reviewer.actorSessionId, normalized.implementer.actorSessionId,
        normalized.reviewer.routeDecisionId, normalized.reviewer.modelClass, normalized.reviewer.resolvedModel,
        normalized.reviewer.enforcementStatus,
        normalized.subject.workspaceIdentity, normalized.subject.mutationRevision,
        normalized.subject.changedPathsDigest, normalized.subject.evidenceDigest,
        JSON.stringify(normalized.acceptanceCoverage), JSON.stringify(normalized.findings),
        sanitizePersistentText(normalized.rationale), normalized.digest, persistentJson(normalized),
        normalized.createdByVersion, normalized.migrationOrigin, normalized.createdAt,
      );
      return normalized;
    },

    getReviewReceipt(receiptId, { runId = null } = {}) {
      const row = db.prepare(`SELECT run_id as runId, receipt_json as receiptJson FROM review_receipts WHERE receipt_id=?`).get(receiptId);
      if (!row) return null;
      if (runId && row.runId !== runId) return null;
      return safeJsonParse(row.receiptJson, null);
    },

    listReviewReceipts(runId, { obligationId = null } = {}) {
      const rows = obligationId
        ? db.prepare(`SELECT receipt_json as receiptJson FROM review_receipts WHERE run_id=? AND obligation_id=? ORDER BY rowid ASC`).all(runId, obligationId)
        : db.prepare(`SELECT receipt_json as receiptJson FROM review_receipts WHERE run_id=? ORDER BY rowid ASC`).all(runId);
      return rows.map((row) => safeJsonParse(row.receiptJson, null)).filter(Boolean);
    },

    // Reviewer independence at T3 is checked against the session that actually
    // implemented, not against a caller-supplied string (§9.2).
    getLatestImplementationSession(runId) {
      const row = db.prepare(`
        SELECT u.receipt_id as receiptId, u.actor_session_id as actorSessionId, u.decision_id as decisionId,
               u.capsule_id as capsuleId, u.capsule_digest as capsuleDigest, u.resolved_model as resolvedModel,
               d.model_class as modelClass, d.action_kind as actionKind
        FROM model_usage_receipts u JOIN model_route_decisions d ON d.decision_id = u.decision_id
        WHERE u.run_id=? AND d.role='implementer' ORDER BY u.rowid DESC LIMIT 1
      `).get(runId);
      return row || null;
    },

    listKnowledgeRecords({ projectId, statuses = ['verified', 'committed'] } = {}) {
      if (!projectId) return [];
      const placeholders = statuses.map(() => '?').join(',');
      const rows = db.prepare(`SELECT record_json as recordJson FROM knowledge_records WHERE project_id=? AND status IN (${placeholders})`).all(projectId, ...statuses);
      return rows.map((r) => safeJsonParse(r.recordJson, null)).filter(Boolean);
    },

    commitKnowledgeTransaction({ transactionId, runId, projectId, expectedRevision = null, records = null, supersessions = [], provenance = {}, faultInjection = null, noChange = false }) {
      db.exec('BEGIN IMMEDIATE TRANSACTION');
      try {
        const run = this.getRun(runId);
        if (!run) {
          throw new Error(`RUN_NOT_FOUND: Run ${runId} not found`);
        }
        const completion = this.getCompletionDecision(runId);
        if (!completion || completion.decision !== 'accepted') {
          throw new Error('COMPLETION_NOT_ACCEPTED: Transaction commit requires accepted completion decision');
        }
        if (run.projectId !== projectId) {
          throw new Error(`PROJECT_ID_MISMATCH: Run project ${run.projectId} != ${projectId}`);
        }

        const reviewReceipt = this.getKnowledgeReviewReceipt(runId);
        if (reviewReceipt && !['passed', 'no_candidates'].includes(reviewReceipt.status)) {
          throw new Error(`KNOWLEDGE_REVIEW_NOT_PASSED: Cannot commit knowledge when review status is ${reviewReceipt.status}`);
        }

        const currentRev = this.getProjectKnowledgeRevision(projectId);
        if (expectedRevision !== null && expectedRevision !== undefined && Number(expectedRevision) !== Number(currentRev)) {
          throw new Error(`STALE_KNOWLEDGE_REVISION: Expected revision ${expectedRevision} but found ${currentRev}`);
        }

        if (faultInjection === 'after_records_before_revision') {
          throw new Error('FAULT_INJECTION_AFTER_RECORDS');
        }

        // If records parameter is omitted, query verified candidates from DB (Task 10.3)
        let recordsToCommit = records;
        if (recordsToCommit === null || recordsToCommit === undefined) {
          const rawCandidates = this.getKnowledgeCandidates(runId);
          recordsToCommit = rawCandidates
            .filter((c) => c.status === 'verified')
            .map((c) => mapCandidateToCanonicalRecord(c.candidateJson || c, { runId, projectId, revision: currentRev + 1 }));
        }

        const isNoChange = noChange || recordsToCommit.length === 0;

        if (isNoChange) {
          const receiptPayload = {
            runId,
            projectId,
            revisionBefore: String(currentRev),
            revisionAfter: String(currentRev),
            status: 'no_change',
            committedCount: 0,
            completionDecisionRef: completion.evidenceDigest || null,
            knowledgeReviewRef: reviewReceipt?.reviewDigest || null,
          };

          db.prepare(`
            INSERT INTO knowledge_commit_receipts(run_id, project_id, revision_before, revision_after, status, receipt_json, created_at)
            VALUES(?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(run_id) DO UPDATE SET revision_before=excluded.revision_before, revision_after=excluded.revision_after, status=excluded.status, receipt_json=excluded.receipt_json, created_at=excluded.created_at
          `).run(runId, projectId, String(currentRev), String(currentRev), 'no_change', JSON.stringify(receiptPayload), now());

          db.prepare(`UPDATE runs SET knowledge_revision_close=?, knowledge_status=?, updated_at=? WHERE run_id=?`).run(String(currentRev), 'no_change', now(), runId);

          db.exec('COMMIT');
          return { revisionBefore: String(currentRev), revisionAfter: String(currentRev), status: 'no_change', receipt: receiptPayload };
        }

        const nextRev = currentRev + 1;

        for (const rec of recordsToCommit) {
          const recId = rec.id || rec.candidateId;
          const recType = rec.type || rec.proposedType || 'semantic_fact';
          const recPayload = { ...rec, status: 'committed', revision: nextRev };
          db.prepare(`
            INSERT INTO knowledge_records(project_id, record_id, record_type, status, trust_tier, record_json, revision, created_at, updated_at)
            VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(project_id, record_id) DO UPDATE SET record_type=excluded.record_type, status=excluded.status, trust_tier=excluded.trust_tier, record_json=excluded.record_json, revision=excluded.revision, updated_at=excluded.updated_at
          `).run(projectId, recId, recType, 'committed', rec.trustTier || 'verified', JSON.stringify(recPayload), nextRev, now(), now());
        }

        for (const supId of supersessions) {
          db.prepare(`UPDATE knowledge_records SET status='superseded', updated_at=? WHERE project_id=? AND record_id=?`).run(now(), projectId, supId);
        }

        const casSuccess = this.updateProjectKnowledgeRevision(projectId, currentRev, nextRev);
        if (!casSuccess) {
          throw new Error(`STALE_KNOWLEDGE_REVISION: Revision CAS increment failed for ${projectId}`);
        }

        const txJson = JSON.stringify({ transactionId, runId, projectId, expectedRevision: currentRev, targetRevision: nextRev, recordsCount: recordsToCommit.length, provenance });
        db.prepare(`
          INSERT INTO knowledge_transactions(transaction_id, project_id, run_id, expected_revision, target_revision, status, transaction_json, created_at, completed_at)
          VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(transaction_id) DO UPDATE SET status='completed', completed_at=excluded.completed_at
        `).run(transactionId, projectId, runId, currentRev, nextRev, 'completed', txJson, now(), now());

        const receiptPayload = {
          runId,
          projectId,
          revisionBefore: String(currentRev),
          revisionAfter: String(nextRev),
          status: 'committed',
          committedCount: recordsToCommit.length,
          completionDecisionRef: completion.evidenceDigest || null,
          knowledgeReviewRef: reviewReceipt?.reviewDigest || null,
        };

        db.prepare(`
          INSERT INTO knowledge_commit_receipts(run_id, project_id, revision_before, revision_after, status, receipt_json, created_at)
          VALUES(?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(run_id) DO UPDATE SET revision_before=excluded.revision_before, revision_after=excluded.revision_after, status=excluded.status, receipt_json=excluded.receipt_json, created_at=excluded.created_at
        `).run(runId, projectId, String(currentRev), String(nextRev), 'committed', JSON.stringify(receiptPayload), now());

        db.prepare(`UPDATE runs SET knowledge_revision_close=?, knowledge_status=?, updated_at=? WHERE run_id=?`).run(String(nextRev), 'committed', now(), runId);

        db.exec('COMMIT');
        return { revisionBefore: String(currentRev), revisionAfter: String(nextRev), status: 'committed', receipt: receiptPayload };
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
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

    saveKnowledgeRecord(projectId, recordId, { recordType = 'semantic_fact', status = 'committed', trustTier = 'verified', recordJson = {}, revision = 1 } = {}) {
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
      if (!runId || !candidateId || !approvedBy || !approvalReceipt) {
        throw new Error('recordKnowledgeApproval requires runId, candidateId, approvedBy, and approvalReceipt');
      }
      db.prepare(`
        INSERT INTO knowledge_approvals(approval_id, run_id, candidate_id, approved_by, approval_receipt, created_at)
        VALUES(?, ?, ?, ?, ?, ?)
        ON CONFLICT(approval_id) DO UPDATE SET approved_by=excluded.approved_by, approval_receipt=excluded.approval_receipt
      `).run(approvalId, runId, candidateId, approvedBy, approvalReceipt, now());
    },

    getKnowledgeApproval(runId, candidateId) {
      return db.prepare(`SELECT approval_id as approvalId, run_id as runId, candidate_id as candidateId, approved_by as approvedBy, approval_receipt as approvalReceipt, created_at as createdAt FROM knowledge_approvals WHERE run_id=? AND candidate_id=?`).get(runId, candidateId) || null;
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

        const res = db.prepare(`
          UPDATE runs
          SET state=?, revision=revision+1, updated_at=?
          WHERE run_id=? AND state=? AND revision=?
        `).run(nextState, now(), runId, run.state, run.revision);

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

    recordVerification(runId, { obligationId = 'default', status, evidenceRef, sourceIdentity, command, commandRef = null, exitCode = 0, evidenceDigest, acceptanceCoverage = [], verifiedSourceIdentity = null, executor = 'caller-attested', networkIsolation = null, evidenceClass = null }) {
      const run = this.getRun(runId);
      if (!run) throw new Error(`Run ${runId} not found`);
      if (run.status === 'completed') throw new Error(`Cannot add verification to completed run ${runId}`);
      if (run.state !== 'PROVE') throw new Error(`Verification can only be recorded in PROVE state for run ${runId}`);
      if (!['passed', 'failed'].includes(status)) throw new Error(`Invalid verification status: ${status}`);
      sourceIdentity = sourceIdentity || run.sourceIdentity;
      if (!sourceIdentity || typeof sourceIdentity !== 'string' || !sourceIdentityRegex.test(sourceIdentity) || sourceIdentity !== run.sourceIdentity) {
        throw new Error('sourceIdentity is required and must be a valid candidate identity string for verification');
      }
      if (verifiedSourceIdentity !== null && !sha256Regex.test(verifiedSourceIdentity)) {
        throw new Error('verifiedSourceIdentity must be a sha256:<hex> workspace identity when provided');
      }
      if (!['kernel-runtime', 'caller-attested'].includes(executor)) {
        throw new Error(`Invalid verification executor: ${executor}`);
      }
      if (executor === 'kernel-runtime' && !verifiedSourceIdentity) {
        throw new Error('kernel-runtime verification requires the verifiedSourceIdentity it was executed against');
      }

      // Obligation binding (P0-2). A declared obligation fixes HOW it may be
      // satisfied; a Kernel execution may only be recorded against it when the
      // command it ran is bound to that obligation. Undeclared obligation names
      // are recorded as ad-hoc evidence that can never satisfy a required one.
      const declared = this.getRunObligation(runId, obligationId);
      if (declared && declared.sourceType !== 'ad-hoc' && executor === 'kernel-runtime') {
        assertCommandBinding(declared, commandRef);
      }
      if (!declared) {
        this.ensureRunObligation(runId, {
          obligationId,
          sourceType: 'ad-hoc',
          sourceRef: 'reported-verification',
          evidenceClass: executor === 'kernel-runtime' ? 'hard' : 'attested',
          status: 'optional',
        });
      }
      // The class is a fact about how this evidence was produced, never a
      // caller assertion: only the Kernel running a bound command is `hard`.
      const resolvedEvidenceClass = executor === 'kernel-runtime'
        ? 'hard'
        : (evidenceClass === 'judgment' ? 'judgment' : 'attested');

      db.exec('BEGIN IMMEDIATE TRANSACTION');
      try {
        db.prepare(`
          INSERT INTO verifications(run_id, obligation_id, status, evidence_ref, verified_runtime_revision, verified_mutation_revision, source_identity, verified_source_identity, executor, network_isolation, command, exit_code, evidence_digest, acceptance_coverage, evidence_class, contract_revision, observed_at)
          VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(runId, obligationId, status, evidenceRef || null, run.revision, run.mutationRevision, sourceIdentity, verifiedSourceIdentity, executor, networkIsolation, command || null, exitCode, evidenceDigest || null, JSON.stringify(acceptanceCoverage), resolvedEvidenceClass, Number(run.contractRevision || 1), now());

        if (evidenceDigest && sha256Regex.test(evidenceDigest)) {
          db.prepare(`INSERT INTO evidence_lineage(run_id, evidence_digest, created_at) VALUES(?, ?, ?)`).run(runId, evidenceDigest, now());
        }

        if (status === 'passed') {
          db.prepare(`UPDATE run_obligations SET status='passed', updated_at=? WHERE run_id=? AND obligation_id=?`).run(now(), runId, obligationId);
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
      return db.prepare(`SELECT id, obligation_id as obligationId, status, evidence_ref as evidenceRef, verified_runtime_revision as verifiedRuntimeRevision, verified_mutation_revision as verifiedMutationRevision, source_identity as sourceIdentity, verified_source_identity as verifiedSourceIdentity, executor, network_isolation as networkIsolation, command, exit_code as exitCode, evidence_digest as evidenceDigest, acceptance_coverage as acceptanceCoverage, evidence_class as evidenceClass, contract_revision as contractRevision, observed_at as observedAt FROM verifications WHERE run_id=? AND id IN (SELECT MAX(v2.id) FROM verifications v2 WHERE v2.run_id=? GROUP BY v2.obligation_id) ORDER BY id ASC`).all(runId, runId).map((v) => ({ ...v, acceptanceCoverage: safeJsonParse(v.acceptanceCoverage) }));
    },

    addWaiver(runId, { obligationId, approvedBy, reason, approvalReceipt, acceptanceCoverage = [] }) {
      if (!this.getRun(runId)) throw new Error(`Run ${runId} not found`);
      if (!obligationId || !approvedBy || !reason || !approvalReceipt) throw new Error('Waiver requires obligation, approver, reason, and approval receipt');
      if (isProtectedObligation(obligationId)) {
        throw new Error(`PROTECTED_OBLIGATION_WAIVER_FORBIDDEN: ${obligationId} (auth/payment/migration/data-loss/security/core-scenario) requires real evidence and cannot be waived`);
      }
      db.prepare(`INSERT INTO waivers(run_id, obligation_id, approved_by, reason, approved_at, approval_receipt, acceptance_coverage) VALUES(?, ?, ?, ?, ?, ?, ?)`)
        .run(runId, obligationId, approvedBy, reason, now(), approvalReceipt, JSON.stringify(acceptanceCoverage));
      return this.getWaivers(runId).at(-1);
    },

    getWaivers(runId) {
      return db.prepare(`SELECT id, run_id as runId, obligation_id as obligationId, approved_by as approvedBy, reason, approved_at as approvedAt, approval_receipt as approvalReceipt, acceptance_coverage as acceptanceCoverage FROM waivers WHERE run_id=? ORDER BY id ASC`).all(runId).map((row) => ({ ...row, acceptanceCoverage: safeJsonParse(row.acceptanceCoverage) }));
    },

    recordLease(runId, { holder, expiresAt, fencingToken, ownerPid = process.pid }) {
      if (!this.getRun(runId)) throw new Error(`Run ${runId} not found`);
      db.prepare(`INSERT INTO leases(run_id, holder, acquired_at, expires_at, fencing_token, owner_pid) VALUES(?, ?, ?, ?, ?, ?) ON CONFLICT(run_id) DO UPDATE SET holder=excluded.holder, acquired_at=excluded.acquired_at, expires_at=excluded.expires_at, fencing_token=excluded.fencing_token, owner_pid=excluded.owner_pid`)
        .run(runId, holder, now(), expiresAt, Number(fencingToken) || 1, Number(ownerPid) || null);
      return this.getLease(runId);
    },

    getLease(runId) {
      const row = db.prepare(`SELECT run_id as runId, holder, acquired_at as acquiredAt, expires_at as expiresAt, fencing_token as fencingToken, owner_pid as ownerPid FROM leases WHERE run_id=?`).get(runId);
      return row ? { ...row, fencingToken: Number(row.fencingToken || 0), ownerPid: row.ownerPid ? Number(row.ownerPid) : null } : null;
    },

    // Detects a still-valid lease held by a different runner, so a resumed
    // session does not silently stomp another live process's run. Each
    // acquisition mints a monotonically increasing fencing token, so a runner
    // that was superseded while paused can be rejected even if it still holds
    // the same holder string (P0-6).
    acquireLease(runId, { holder, ttlMs = 15 * 60 * 1000 } = {}) {
      const existing = this.getLease(runId);
      const nowMs = Date.now();
      const live = Boolean(existing?.expiresAt && Date.parse(existing.expiresAt) > nowMs);
      if (existing && existing.holder !== holder && live) {
        return { acquired: false, lease: existing, conflict: true };
      }
      // Two sessions in the same project share the fallback holder when the
      // host exports no session id. Matching holders are therefore not enough
      // to prove same-owner: a live lease whose owning process is still running
      // and is not us belongs to a genuinely concurrent runner.
      if (existing && existing.holder === holder && live && existing.ownerPid && existing.ownerPid !== process.pid && isProcessAlive(existing.ownerPid)) {
        return { acquired: false, lease: existing, conflict: true };
      }
      const lease = this.recordLease(runId, {
        holder,
        expiresAt: new Date(nowMs + ttlMs).toISOString(),
        fencingToken: (existing?.fencingToken || 0) + 1,
      });
      return { acquired: true, lease, conflict: false };
    },

    // A command that finishes releases its lease, so the next CLI invocation
    // (a new process) is never blocked by a lease its predecessor abandoned.
    releaseLease(runId, { holder, fencingToken = null } = {}) {
      const existing = this.getLease(runId);
      if (!existing || existing.holder !== holder) return false;
      if (fencingToken !== null && existing.fencingToken !== Number(fencingToken)) return false;
      db.prepare(`DELETE FROM leases WHERE run_id=? AND holder=?`).run(runId, holder);
      return true;
    },

    // True when the caller still owns the lease it acquired; a superseded
    // holder must not be allowed to finalize.
    isLeaseHeld(runId, { holder, fencingToken = null } = {}) {
      const existing = this.getLease(runId);
      if (!existing) return false;
      if (existing.holder !== holder) return false;
      if (fencingToken !== null && existing.fencingToken !== Number(fencingToken)) return false;
      return Date.parse(existing.expiresAt) > Date.now();
    },

    recordAttempt(runId, { attemptNumber, state, status = 'started', finishedAt = null }) {
      if (!this.getRun(runId)) throw new Error(`Run ${runId} not found`);
      const result = db.prepare(`INSERT INTO attempts(run_id, attempt_number, state, started_at, finished_at, status) VALUES(?, ?, ?, ?, ?, ?)`).run(runId, attemptNumber, state, now(), finishedAt, status);
      return db.prepare(`SELECT id, run_id as runId, attempt_number as attemptNumber, state, started_at as startedAt, finished_at as finishedAt, status FROM attempts WHERE id=?`).get(result.lastInsertRowid);
    },

    getAttempts(runId) {
      return db.prepare(`SELECT id, run_id as runId, attempt_number as attemptNumber, state, started_at as startedAt, finished_at as finishedAt, status FROM attempts WHERE run_id=? ORDER BY id ASC`).all(runId);
    },

    // Next attempt number is derived from persisted rows, so retry counting
    // survives process restarts without a caller-held counter.
    nextAttemptNumber(runId) {
      const row = db.prepare(`SELECT MAX(attempt_number) as maxAttempt FROM attempts WHERE run_id=?`).get(runId);
      return (row?.maxAttempt || 0) + 1;
    },

    finishAttempt(attemptId, status = 'finished') {
      db.prepare(`UPDATE attempts SET status=?, finished_at=? WHERE id=?`).run(status, now(), attemptId);
      return db.prepare(`SELECT id, run_id as runId, attempt_number as attemptNumber, state, started_at as startedAt, finished_at as finishedAt, status FROM attempts WHERE id=?`).get(attemptId);
    },

    getEvidenceLineage(runId) {
      return db.prepare(`SELECT id, run_id as runId, evidence_digest as evidenceDigest, parent_digest as parentDigest, created_at as createdAt FROM evidence_lineage WHERE run_id=? ORDER BY id ASC`).all(runId);
    },

    evaluateCompletion(runId, { expectedSourceIdentity = null } = {}) {
      const run = this.getRun(runId);
      if (!run) {
        return { decision: 'blocked', run: null, verifications: [] };
      }

      const verifications = db.prepare(`
        SELECT id, obligation_id as obligationId, status, evidence_ref as evidenceRef,
               verified_runtime_revision as verifiedRuntimeRevision,
               verified_mutation_revision as verifiedMutationRevision,
               source_identity as sourceIdentity,
               verified_source_identity as verifiedSourceIdentity,
               executor, network_isolation as networkIsolation, command, exit_code as exitCode,
               evidence_digest as evidenceDigest, acceptance_coverage as acceptanceCoverage,
               evidence_class as evidenceClass, contract_revision as contractRevision, observed_at as observedAt
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

        // Evidence proven against a different workspace state than the one the
        // run currently observes is stale regardless of its other fields.
        if (v.verifiedSourceIdentity && run.currentWorkspaceIdentity && v.verifiedSourceIdentity !== run.currentWorkspaceIdentity) return false;

        return true;
      };

      const requiredObligations = run.requiredObligations.length > 0 ? run.requiredObligations : ['default'];
      const declaredObligations = this.getRunObligations(runId);
      const declaredById = new Map(declaredObligations.map((obligation) => [obligation.obligationId, obligation]));
      const dynamicObligationRows = declaredObligations.filter((obligation) => obligation.status === 'required' && obligation.sourceType !== 'ad-hoc');

      const waivers = this.getWaivers(runId);
      const waivedObligations = new Set(waivers.filter((w) => w.approvalReceipt).map((w) => w.obligationId));
      const latestByObligation = new Map(verifications.map((v) => [v.obligationId, v]));

      // Evidence class is not substitutable (P0-3): a `hard` obligation needs
      // executable evidence, a `judgment` obligation needs a structured
      // verdict, and neither can stand in for the other. A run that actually
      // mutated the workspace tightens `hard` further — only the Kernel
      // executing the bound command counts. A protected obligation can never
      // be waived.
      const runMutatedWorkspace = run.mutationRevision > 0;

      // K0: a judgment that stands in for a protected obligation, or any
      // judgment in a T3 run, must be backed by a Review Receipt whose reviewer
      // lineage and reviewed subject still hold. Two different reviewer strings
      // are not evidence that an independent review happened.
      const reviewLineageFor = (obligationId, verification, declared) => {
        const protectedObligation = Boolean(declared?.protected || isProtectedObligation(obligationId));
        const independenceRequired = run.proofTier === 'T3';
        if (!protectedObligation && !independenceRequired) {
          return { required: false, usable: true, receiptId: null, reasons: [] };
        }
        const parsed = parseReviewEvidenceRef(verification?.evidenceRef);
        if (!parsed || parsed.runId !== runId) {
          return { required: true, usable: false, receiptId: null, reasons: ['review-receipt-not-referenced'] };
        }
        const receipt = this.getReviewReceipt(parsed.receiptId, { runId });
        const reasons = [];
        if (receipt) {
          if (receipt.obligationId !== obligationId) reasons.push('review-receipt-obligation-mismatch');
          if (verification.evidenceDigest !== receipt.digest) reasons.push('review-receipt-digest-mismatch');
        }
        const evaluation = evaluateReviewReceipt({
          receipt,
          run,
          requireIndependentSession: independenceRequired,
          requireFrontierClass: independenceRequired,
          requireTrustedEnforcement: true,
          // The verdict must describe the evidence set the run has NOW; a check
          // rerun after the review changes nothing about the workspace.
          currentEvidenceDigest: digestOfEvidence(verifications, { excludeObligationId: obligationId }),
        });
        const allReasons = [...reasons, ...evaluation.reasons];
        return { required: true, usable: allReasons.length === 0, receiptId: parsed.receiptId, reasons: allReasons };
      };

      const obligationSatisfied = (obligationId) => {
        const declared = declaredById.get(obligationId);
        const expectedClass = declared?.evidenceClass || 'hard';
        const verification = latestByObligation.get(obligationId);
        if (verification && isVerificationValid(verification)) {
          if (expectedClass === 'judgment') {
            if (verification.evidenceClass === 'judgment') return reviewLineageFor(obligationId, verification, declared).usable;
          } else if (verification.executor === 'kernel-runtime' && verification.evidenceClass === 'hard') {
            return true;
          } else if (!runMutatedWorkspace && verification.evidenceClass !== 'judgment') {
            // Nothing changed, so attested evidence is still an honest record;
            // a judgment verdict is never accepted for an executable obligation.
            return true;
          }
        }
        if (waivedObligations.has(obligationId) && !(declared?.protected || isProtectedObligation(obligationId))) return true;
        return false;
      };

      const obligationStatuses = [...new Set([...requiredObligations, ...dynamicObligationRows.map((row) => row.obligationId)])]
        .map((obligationId) => {
          const declared = declaredById.get(obligationId);
          const verification = latestByObligation.get(obligationId);
          const requiredEvidenceClass = declared?.evidenceClass || 'hard';
          const reviewLineage = requiredEvidenceClass === 'judgment' && verification
            ? reviewLineageFor(obligationId, verification, declared)
            : null;
          return {
            obligationId,
            requiredEvidenceClass,
            observedEvidenceClass: verification?.evidenceClass || null,
            executor: verification?.executor || null,
            reviewLineage,
            satisfied: obligationSatisfied(obligationId),
            waived: waivedObligations.has(obligationId),
          };
        });

      const staticPassed = requiredObligations.every((ob) => obligationSatisfied(ob));
      const dynamicPassed = dynamicObligationRows.every((row) => row.status === 'passed' || row.status === 'waived' || obligationSatisfied(row.obligationId));

      const coveredAcceptance = new Set([
        ...verifications.filter(isVerificationValid).flatMap((v) => v.acceptanceCoverage || []),
        ...waivers.flatMap((w) => w.acceptanceCoverage || []),
      ]);
      // Coverage may be declared by acceptance id (AC-1) or by statement.
      const contractAcceptance = run.taskContract?.acceptance || [];
      const acceptanceCovered = run.acceptanceCriteria.every((criterion, index) => {
        const declared = contractAcceptance[index];
        return coveredAcceptance.has(criterion) || (declared?.id && coveredAcceptance.has(declared.id));
      });
      const releaseEvidence = db.prepare(`SELECT tier, digest, mutation_revision as mutationRevision, pack_json as packJson FROM evidence_packs WHERE run_id=? ORDER BY id DESC LIMIT 1`).get(runId);
      
      const releaseEvidencePresent = !run.releaseEvidenceRequired || (releaseEvidence?.tier === 'E2' && releaseEvidence.mutationRevision === run.mutationRevision && sha256Regex.test(releaseEvidence.digest));

      // A run that actually mutated the workspace cannot complete on
      // caller-attested proofs alone; at least one verification must have been
      // executed by the Kernel runtime itself.
      const hardEvidenceRequired = run.mutationRevision > 0;
      const hardEvidenceCount = verifications.filter((v) => isVerificationValid(v) && v.executor === 'kernel-runtime').length;
      const hardEvidenceSatisfied = !hardEvidenceRequired || hardEvidenceCount > 0;

      // All completion gates except the CLOSE-state requirement. Callers use
      // this to decide whether it is SAFE to transition to CLOSE, so a run is
      // never closed into an unrecoverable blocked state.
      const readyExceptClose = staticPassed && dynamicPassed && acceptanceCovered && releaseEvidencePresent && hardEvidenceSatisfied;
      const gates = { isClosed, staticPassed, dynamicPassed, acceptanceCovered, releaseEvidencePresent, hardEvidenceSatisfied };
      const unsatisfiedObligations = obligationStatuses.filter((entry) => !entry.satisfied);

      const accepted = isClosed && readyExceptClose;

      const decision = accepted ? 'accepted' : 'blocked';
      // A run that leaned on any waiver to pass is completed but degraded
      // (§17.5), never silently clean.
      const completionQuality = accepted && waivers.length > 0 ? 'degraded' : (accepted ? 'clean' : 'none');
      const decisionPayload = {
        runId,
        decision,
        completionQuality,
        sourceIdentity: run.sourceIdentity,
        currentWorkspaceIdentity: run.currentWorkspaceIdentity,
        mutationRevision: run.mutationRevision,
        hardEvidence: { required: hardEvidenceRequired, count: hardEvidenceCount },
        evidenceDigest: releaseEvidence?.digest || verifications[0]?.evidenceDigest || `sha256:${'0'.repeat(64)}`,
        verifications,
      };
      const decisionDigest = `sha256:${createHash('sha256').update(JSON.stringify(decisionPayload)).digest('hex')}`;

      return {
        decision,
        completionQuality,
        digest: decisionDigest,
        run,
        verifications,
        waivers,
        releaseEvidence: releaseEvidence || null,
        acceptanceCovered: [...coveredAcceptance],
        hardEvidence: { required: hardEvidenceRequired, count: hardEvidenceCount },
        obligationStatuses,
        unsatisfiedObligations,
        gates,
        readyExceptClose,
        decisionPayload,
      };
    },

    persistCompletionDecision(runId, evaluation) {
      if (!evaluation || !evaluation.run) {
        throw new Error(`Cannot persist completion decision for missing evaluation/run: ${runId}`);
      }
      const { decision, digest, run, decisionPayload } = evaluation;
      db.exec('BEGIN IMMEDIATE TRANSACTION');
      try {
        db.prepare(`
          INSERT INTO completion_decisions(run_id, decision, source_identity, mutation_revision, evidence_digest, decision_json, created_at)
          VALUES(?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(run_id) DO UPDATE SET decision=excluded.decision, source_identity=excluded.source_identity, mutation_revision=excluded.mutation_revision, evidence_digest=excluded.evidence_digest, decision_json=excluded.decision_json, created_at=excluded.created_at
        `).run(runId, decision, run.sourceIdentity, run.mutationRevision, digest, JSON.stringify({ ...(decisionPayload || {}), digest }), now());

        db.prepare('UPDATE runs SET status=?, revision=revision+1, updated_at=? WHERE run_id=?')
          .run(decision === 'accepted' ? 'completed' : 'blocked', now(), runId);
        
        db.exec('COMMIT');
        return this.getRun(runId);
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    },

    assessCompletion(runId, options = {}) {
      return this.evaluateCompletion(runId, options);
    },


    close() {
      db.close();
    },
  };
};
