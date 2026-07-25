// Task Contract normalization and persistence (§8, P0-4/P0-5).
//
// The contract — objective, acceptance, constraints, non-goals, risks, and the
// evidence plan for every acceptance criterion — is the run's authority. It is
// persisted verbatim in SQLite so a new process can resume without any chat
// history, and every acceptance criterion carries a stable id (AC-n) so
// evidence can be bound to it rather than to a free-text string.

import { createHash } from 'node:crypto';

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
];

// The full contract the Kernel persists. Everything the model needs on resume
// must be reachable from this object alone.
export const normalizeTaskContract = (input = {}, { objective, changedFileCount = 0 } = {}) => {
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

// The risk summary the proof-route and task-route resolvers consume. Behavior
// change is carried through so an ordinary behavior-changing task is not left
// at T0 (P1-1).
export const riskSummaryFromContract = (contract) => ({
  requestedTier: contract.requestedTier || undefined,
  filesChanged: contract.filesChanged,
  surfaces: [...new Set([...contract.surfaces, ...surfacesFromFlags(contract.flags)])],
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

// Within a run a contract may only be REFINED, never weakened — the same rule
// route and tier already follow. Acceptance, constraints, non-goals, risks and
// risk flags are unioned, so a later turn cannot quietly drop a criterion the
// completion gate is meant to enforce. Dropping scope requires a new run.
export const mergeContractRevision = (previous, next) => {
  if (!previous) return next;
  const byId = new Map(previous.acceptance.map((item) => [item.id, item]));
  for (const item of next.acceptance) {
    const existing = byId.get(item.id);
    byId.set(item.id, existing
      ? { ...existing, statement: item.statement || existing.statement, evidencePlan: item.evidencePlan || existing.evidencePlan }
      : item);
  }
  const union = (left = [], right = []) => [...new Set([...left, ...right])];
  const merged = {
    ...next,
    acceptance: [...byId.values()],
    constraints: union(previous.constraints, next.constraints),
    nonGoals: union(previous.nonGoals, next.nonGoals),
    risks: union(previous.risks, next.risks),
    surfaces: union(previous.surfaces, next.surfaces),
    requiredObligations: union(previous.requiredObligations, next.requiredObligations),
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
