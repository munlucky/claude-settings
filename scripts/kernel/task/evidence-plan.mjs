// Evidence plan gating (§8). Every acceptance criterion must have a plan for
// how it will be proven before execution. Plain-string acceptance is allowed
// (its coverage is enforced at completion), but a STRUCTURED acceptance object
// that omits its evidence plan is a vague criterion and blocks execution.

const VALID_CLASSES = ['hard', 'judgment'];

export class MissingEvidencePlanError extends Error {
  constructor(message, missing) {
    super(message);
    this.name = 'MissingEvidencePlanError';
    this.code = 'MISSING_EVIDENCE_PLAN';
    this.missing = missing;
  }
}

export const normalizeAcceptance = (acceptance = []) => acceptance.map((item) => {
  if (typeof item === 'string') {
    return { statement: item, evidencePlan: null, structured: false };
  }
  if (item && typeof item === 'object') {
    const plan = item.evidencePlan && typeof item.evidencePlan === 'object' ? item.evidencePlan : null;
    return { statement: item.acceptance || item.statement || '', evidencePlan: plan, structured: true };
  }
  return { statement: String(item), evidencePlan: null, structured: false };
});

// Throws when a structured acceptance omits a valid evidence plan. Plain-string
// acceptance is left to completion-time coverage.
export const assertEvidencePlans = (acceptance = []) => {
  const items = normalizeAcceptance(acceptance);
  const missing = items.filter((item) => item.structured && (!item.evidencePlan || !VALID_CLASSES.includes(item.evidencePlan.class)));
  if (missing.length > 0) {
    throw new MissingEvidencePlanError(
      `acceptance without an evidence plan blocks execution: ${missing.map((m) => m.statement || '(empty)').join('; ')}`,
      missing.map((m) => m.statement),
    );
  }
  return items;
};

// The plain acceptance strings used by the run's completion coverage gate.
export const acceptanceStatements = (acceptance = []) => normalizeAcceptance(acceptance).map((item) => item.statement).filter(Boolean);
