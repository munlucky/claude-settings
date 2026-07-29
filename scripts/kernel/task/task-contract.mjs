// Task Contract normalization and persistence (§8, P0-4/P0-5).
//
// The contract — objective, acceptance, constraints, non-goals, risks, and the
// evidence plan for every acceptance criterion — is the run's authority. It is
// persisted verbatim in SQLite so a new process can resume without any chat
// history, and every acceptance criterion carries a stable id (AC-n) so
// evidence can be bound to it rather than to a free-text string.

import { createHash } from 'node:crypto';
import { assertNoRawSecret } from '../persistent-sanitizer.mjs';

const EVIDENCE_CLASSES = ['hard', 'judgment'];

export class MissingEvidencePlanError extends Error {
  constructor(message, missing) {
    super(message);
    this.name = 'MissingEvidencePlanError';
    this.code = 'MISSING_EVIDENCE_PLAN';
    this.missing = missing;
  }
}

const asStringList = (value) => (Array.isArray(value) ? value : value ? [value] : [])
  .map((item) => (typeof item === 'string' ? item : String(item?.statement || item?.text || '')))
  .map((item) => item.trim())
  .filter(Boolean);

const normalizeEvidencePlan = (plan) => {
  if (!plan || typeof plan !== 'object') return null;
  const commandRefs = [
    ...(Array.isArray(plan.commandRefs) ? plan.commandRefs : []),
    ...(plan.commandRef ? [plan.commandRef] : []),
  ].map(String).filter(Boolean);
  return {
    class: EVIDENCE_CLASSES.includes(plan.class) ? plan.class : null,
    method: plan.method ? String(plan.method) : null,
    commandRefs: [...new Set(commandRefs)],
    obligationId: plan.obligationId ? String(plan.obligationId) : null,
  };
};

// Acceptance may arrive as plain strings (allowed: the Kernel derives the plan
// from the run's proof tier) or as structured objects. A structured criterion
// that omits its evidence plan is a vague criterion and blocks the run.
export const normalizeAcceptance = (acceptance = []) => (Array.isArray(acceptance) ? acceptance : []).map((item, index) => {
  const id = `AC-${index + 1}`;
  if (typeof item === 'string') {
    return { id, statement: item.trim(), evidencePlan: null, structured: false };
  }
  if (item && typeof item === 'object') {
    return {
      id: item.id ? String(item.id) : id,
      statement: String(item.acceptance || item.statement || '').trim(),
      evidencePlan: normalizeEvidencePlan(item.evidencePlan),
      structured: true,
    };
  }
  return { id, statement: String(item), evidencePlan: null, structured: false };
});

export const assertEvidencePlans = (acceptance = []) => {
  const items = normalizeAcceptance(acceptance);
  const missing = items.filter((item) => item.structured && (!item.evidencePlan || !item.evidencePlan.class));
  if (missing.length > 0) {
    throw new MissingEvidencePlanError(
      `acceptance without an evidence plan blocks execution: ${missing.map((m) => m.statement || '(empty)').join('; ')}`,
      missing.map((m) => m.statement),
    );
  }
  return items;
};

export const acceptanceStatements = (acceptance = []) => normalizeAcceptance(acceptance).map((item) => item.statement).filter(Boolean);

const RISK_FLAGS = [
  'behaviorChanging', 'publicContract', 'securityBoundary', 'authBoundary', 'dataMigration',
  'migration', 'dataStorageChange', 'externalIntegration', 'componentBoundaryChange',
  'irreversibleDecision', 'crossLayer', 'complex', 'newDependency', 'ambiguityChangesOutcome',
  'domainTerminologyConflict', 'destructiveSchemaChange', 'schemaChange', 'acceptanceAmbiguity',
  'baselineRequired',
];

const normalizeSafeWave = (input) => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { requested: false, approved: false, approvedBy: null, integrationVerification: null };
  }
  const commandRef = input.integrationVerification?.commandRef || input.integrationVerification || null;
  const approvedBy = input.approvedBy ? String(input.approvedBy) : null;
  return {
    requested: input.requested === true || input.approved === true,
    // Approval requires all three: the flag, a named approver, and an
    // integration command. Any one missing leaves the run sequential.
    approved: input.approved === true && Boolean(approvedBy) && Boolean(commandRef),
    approvedBy,
    integrationVerification: commandRef ? { commandRef: String(commandRef) } : null,
  };
};

// The full contract the Kernel persists. Everything the model needs on resume
// must be reachable from this object alone.
export const normalizeTaskContract = (input = {}, { objective, changedFileCount = 0 } = {}) => {
  assertNoRawSecret(input);
  const contract = input && typeof input === 'object' ? input : {};
  const acceptance = assertEvidencePlans(contract.acceptance || contract.acceptanceCriteria || []);
  const flags = {};
  for (const flag of RISK_FLAGS) {
    const value = contract[flag] === true || (contract.risk && typeof contract.risk === 'object' && contract.risk[flag] === true);
    if (value) flags[flag] = true;
  }
  const normalized = {
    schemaVersion: 1,
    objective: String(objective || contract.objective || 'Kernel execution task'),
    acceptance,
    constraints: asStringList(contract.constraints),
    nonGoals: asStringList(contract.nonGoals || contract.nonGoal),
    risks: asStringList(contract.risks),
    surfaces: asStringList(contract.surfaces),
    taskClass: String(contract.taskClass || 'feature'),
    requestedTier: contract.riskTier || contract.proofTier || contract.requestedTier || null,
    requiredObligations: asStringList(contract.requiredObligations),
    // Work-unit scope (K1). Declared here so an Execution Capsule can bound a
    // worker to the paths the contract actually authorises; an empty list means
    // the whole workspace and can never be violated.
    // Declared decomposition (K2). Present only when the caller actually split
    // the work; otherwise the run gets one synthetic step.
    steps: Array.isArray(contract.steps) ? contract.steps : [],
    // Safe Wave (§2.4/§7.6) is default-deny. Parallel step execution needs an
    // explicit operator approval, an approver on record, and the integration
    // check that per-step evidence cannot replace — declaring the intent alone
    // is a request, never an authorisation.
    safeWave: normalizeSafeWave(contract.safeWave),
    allowedPaths: asStringList(contract.allowedPaths),
    forbiddenPaths: asStringList(contract.forbiddenPaths),
    filesChanged: Number.isFinite(contract.filesChanged) ? Number(contract.filesChanged) : changedFileCount,
    flags,
  };
  return { ...normalized, digest: contractDigest(normalized) };
};

export const contractDigest = (contract) => `sha256:${createHash('sha256').update(JSON.stringify({
  objective: contract.objective,
  acceptance: contract.acceptance,
  constraints: contract.constraints,
  nonGoals: contract.nonGoals,
  risks: contract.risks,
  surfaces: contract.surfaces,
  taskClass: contract.taskClass,
  requestedTier: contract.requestedTier,
  requiredObligations: contract.requiredObligations,
  steps: contract.steps,
  safeWave: contract.safeWave,
  allowedPaths: contract.allowedPaths,
  forbiddenPaths: contract.forbiddenPaths,
  flags: contract.flags,
})).digest('hex')}`;

// A declared risk flag names the same thing as a risk surface; mapping it
// makes the flag reach the tier resolver's hard floors instead of only
// influencing the route (P1-1).
const FLAG_SURFACES = Object.freeze({
  publicContract: 'public_contract',
  securityBoundary: 'security_boundary',
  authBoundary: 'security_boundary',
  dataMigration: 'data_migration',
  migration: 'data_migration',
  destructiveSchemaChange: 'destructive_schema_change',
  schemaChange: 'schema_change',
  runtimeAuthority: 'runtime_authority',
});

export const surfacesFromFlags = (flags = {}) => [...new Set(
  Object.entries(FLAG_SURFACES).filter(([flag]) => flags[flag] === true).map(([, surface]) => surface),
)];

const surfacesFromDeclaredRisks = (risks = []) => [...new Set(risks.flatMap((risk) => {
  const value = String(risk).toLowerCase();
  if (/(security|auth(?:entication|orization)?)/.test(value)) return ['security_boundary'];
  if (/migration/.test(value)) return ['data_migration'];
  if (/(data.?loss|data.?deletion|irreversible)/.test(value)) return ['destructive_schema_change'];
  if (/payment/.test(value)) return ['payment_boundary'];
  return [];
}))];

// The risk summary the proof-route and task-route resolvers consume. Behavior
// change is carried through so an ordinary behavior-changing task is not left
// at T0 (P1-1).
export const riskSummaryFromContract = (contract) => ({
  requestedTier: contract.requestedTier || undefined,
  filesChanged: contract.filesChanged,
  surfaces: [...new Set([...contract.surfaces, ...surfacesFromFlags(contract.flags), ...surfacesFromDeclaredRisks(contract.risks)])],
  taskClass: contract.taskClass,
  crossLayer: contract.flags.crossLayer === true,
  // Declared behaviour change reaches the tier resolver (P1-1); it is never
  // inferred, because guessing it would silently escalate every task to T1.
  behaviorChanging: contract.flags.behaviorChanging === true,
  complex: contract.flags.complex === true,
  ...contract.flags,
});

// The compact contract slice `kernel next` returns. Full contract stays in
// SQLite; the model sees what changes its decisions.
export const contractBriefing = (contract) => ({
  objective: contract.objective,
  acceptance: contract.acceptance.map((item) => ({ id: item.id, statement: item.statement, evidence: item.evidencePlan?.class || null })),
  constraints: contract.constraints,
  nonGoals: contract.nonGoals,
  risks: contract.risks,
});

const nextAcceptanceId = (items) => {
  const used = new Set(items.map((item) => item.id));
  let index = items.length + 1;
  while (used.has(`AC-${index}`)) index += 1;
  return `AC-${index}`;
};

// Acceptance is merged by STATEMENT, never by id. Plain-string acceptance is
// numbered positionally, so `AC-1` means "the first criterion of whichever list
// was submitted" — merging on it would let a later, shorter list overwrite an
// earlier criterion in place (["A","B"] revised with ["C"] becoming ["C","B"]),
// silently dropping A and re-pointing A's existing evidence at C.
//
// A statement that already exists is refined in place (its plan may be filled
// in); a statement that does not is appended under a fresh id. Rewording a
// criterion therefore adds one rather than replacing one, which is the
// conservative direction: a revision can never shrink the completion gate.
const mergeAcceptance = (previous = [], next = []) => {
  const merged = previous.map((item) => ({ ...item }));
  const indexByStatement = new Map(merged.map((item, index) => [item.statement, index]));
  for (const item of next) {
    const existingIndex = indexByStatement.get(item.statement);
    if (existingIndex !== undefined) {
      const existing = merged[existingIndex];
      merged[existingIndex] = { ...existing, evidencePlan: item.evidencePlan || existing.evidencePlan };
      continue;
    }
    const appended = { ...item, id: nextAcceptanceId(merged) };
    indexByStatement.set(appended.statement, merged.length);
    merged.push(appended);
  }
  return merged;
};

// Within a run a contract may only be REFINED, never weakened — the same rule
// route and tier already follow. Acceptance, constraints, non-goals, risks and
// risk flags are unioned, so a later turn cannot quietly drop a criterion the
// completion gate is meant to enforce. Dropping scope requires a new run.
export const mergeContractRevision = (previous, next) => {
  if (!previous) return next;
  const union = (left = [], right = []) => [...new Set([...left, ...right])];
  const merged = {
    ...next,
    acceptance: mergeAcceptance(previous.acceptance, next.acceptance),
    constraints: union(previous.constraints, next.constraints),
    nonGoals: union(previous.nonGoals, next.nonGoals),
    risks: union(previous.risks, next.risks),
    surfaces: union(previous.surfaces, next.surfaces),
    requiredObligations: union(previous.requiredObligations, next.requiredObligations),
    steps: next.steps?.length ? next.steps : (previous.steps || []),
    // An approval is NOT inherited: a revision that does not restate it revokes
    // it. Carrying the previous object forward would let a replanned contract
    // keep dispatching parallel workers under an approval granted for the plan
    // it replaced. The request and the named integration command survive so the
    // operator can re-approve without restating everything.
    safeWave: next.safeWave?.approved ? next.safeWave : {
      requested: Boolean(previous.safeWave?.requested || next.safeWave?.requested),
      approved: false,
      approvedBy: null,
      integrationVerification: next.safeWave?.integrationVerification || previous.safeWave?.integrationVerification || null,
    },
    allowedPaths: union(previous.allowedPaths, next.allowedPaths),
    forbiddenPaths: union(previous.forbiddenPaths, next.forbiddenPaths),
    flags: { ...previous.flags, ...next.flags },
    filesChanged: Math.max(Number(previous.filesChanged) || 0, Number(next.filesChanged) || 0),
    requestedTier: next.requestedTier || previous.requestedTier,
  };
  return { ...merged, digest: contractDigest(merged) };
};

// Merge model-supplied evidence plans (submitted from FRAME) into the stored
// contract. Returns null when nothing changed so callers can skip a revision.
export const applyEvidencePlans = (contract, evidencePlans = []) => {
  if (!Array.isArray(evidencePlans) || evidencePlans.length === 0) return null;
  const byId = new Map(evidencePlans.filter((plan) => plan && (plan.acceptanceId || plan.id)).map((plan) => [String(plan.acceptanceId || plan.id), plan]));
  let changed = false;
  const acceptance = contract.acceptance.map((item) => {
    const update = byId.get(item.id);
    if (!update) return item;
    const plan = normalizeEvidencePlan(update.evidencePlan || update);
    if (!plan || !plan.class) return item;
    changed = true;
    return { ...item, evidencePlan: plan };
  });
  if (!changed) return null;
  const next = { ...contract, acceptance };
  return { ...next, digest: contractDigest(next) };
};
