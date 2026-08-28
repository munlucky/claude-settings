// Work-unit scope guard (K1). Broad structured implementation work must have
// an explicit, bounded repository scope before it can acquire mutation state or
// create routed-attempt lineage. Simple legacy synthetic work and read-only
// turns retain their compatibility behavior.

export const WORK_UNIT_SCOPE_ERROR_CODES = Object.freeze({
  missing: 'work-unit-scope-missing',
  workspaceWide: 'work-unit-scope-unbounded',
});

export const WORK_UNIT_SCOPE_NEXT_ACTION = 'revise-task-contract-with-scoped-allowedPaths';

const IMPLEMENTATION_ACTIONS = new Set(['implement', 'fix']);
const WORKSPACE_WIDE_PATTERNS = new Set(['*', '**']);
const MULTI_ACCEPTANCE_THRESHOLD = 2;
const DURABLE_STEP_FIELDS = ['stepId', 'sequence', 'planRevision'];

export const normalizeWorkUnitAllowedPaths = (allowedPaths) => (
  Array.isArray(allowedPaths)
    ? [...new Set(allowedPaths.map((entry) => String(entry).trim()).filter(Boolean))]
    : []
);

export const isWorkspaceWideScope = (allowedPaths) => normalizeWorkUnitAllowedPaths(allowedPaths)
  .some((entry) => WORKSPACE_WIDE_PATTERNS.has(entry));

// Empty allowedPaths is a legacy representation for a simple synthetic turn,
// not a safe default for a broad work unit. This predicate is shared by every
// implementation boundary so a scope is required for the same durable signals
// regardless of whether the caller is dispatching, building a capsule, or
// starting a step.
export const requiresImplementationWorkUnitScope = ({ contract = null, step = null } = {}) => {
  const source = contract && typeof contract === 'object' ? contract : {};
  const flags = source.flags && typeof source.flags === 'object' ? source.flags : {};
  const acceptanceCount = Array.isArray(source.acceptance) ? source.acceptance.length : 0;
  const declaredSteps = Array.isArray(source.steps) && source.steps.length > 0;
  const durableNonSyntheticStep = Boolean(
    step
    && step.synthetic !== true
    && DURABLE_STEP_FIELDS.some((field) => Object.prototype.hasOwnProperty.call(step, field)),
  );
  const filesChanged = Number(source.filesChanged || 0);
  const safeWave = source.safeWave;

  return acceptanceCount >= MULTI_ACCEPTANCE_THRESHOLD
    || declaredSteps
    || durableNonSyntheticStep
    || String(source.taskClass || '').toLowerCase() === 'long-running'
    || source.longRunning === true
    || flags.longRunning === true
    || source.complex === true
    || flags.complex === true
    || source.independentDeliverables === true
    || flags.independentDeliverables === true
    || source.safeParallelSplit === true
    || flags.safeParallelSplit === true
    || safeWave === true
    || (safeWave && typeof safeWave === 'object' && (safeWave.requested === true || safeWave.approved === true))
    || filesChanged > 8
    || (Array.isArray(source.requiredObligations) && source.requiredObligations.length > 1)
    || (Array.isArray(source.requiredVerifications) && source.requiredVerifications.length > 1);
};

// A persisted step owns its scope, including an explicitly empty list. Only a
// step without an allowedPaths field inherits the run-level contract scope.
export const resolveWorkUnitAllowedPaths = ({ step = null, contract = null } = {}) => {
  const source = step && Object.prototype.hasOwnProperty.call(step, 'allowedPaths')
    ? step.allowedPaths
    : contract?.allowedPaths;
  return normalizeWorkUnitAllowedPaths(source);
};

export const classifyWorkUnitScope = ({ allowedPaths = [] } = {}) => {
  const normalized = normalizeWorkUnitAllowedPaths(allowedPaths);
  if (normalized.length === 0) {
    return {
      valid: false,
      reason: 'missing',
      errorCode: WORK_UNIT_SCOPE_ERROR_CODES.missing,
      allowedPaths: normalized,
      nextAction: WORK_UNIT_SCOPE_NEXT_ACTION,
      message: 'Ordinary implementation/fix dispatch requires one or more explicit repository-relative allowedPaths; declare a bounded work-unit scope before dispatch.',
    };
  }
  const workspaceWide = normalized.filter((entry) => WORKSPACE_WIDE_PATTERNS.has(entry));
  if (workspaceWide.length > 0) {
    return {
      valid: false,
      reason: 'workspace-wide',
      errorCode: WORK_UNIT_SCOPE_ERROR_CODES.workspaceWide,
      allowedPaths: normalized,
      workspaceWide,
      nextAction: WORK_UNIT_SCOPE_NEXT_ACTION,
      message: `Ordinary implementation/fix dispatch requires a bounded allowedPaths list; replace workspace-wide ${workspaceWide.join(', ')} with the specific repository paths this work unit may change.`,
    };
  }
  return { valid: true, reason: null, errorCode: null, allowedPaths: normalized };
};

export const inspectWorkUnitScope = ({ step = null, contract = null } = {}) => {
  const allowedPaths = resolveWorkUnitAllowedPaths({ step, contract });
  if (!requiresImplementationWorkUnitScope({ contract, step })) {
    return { valid: true, required: false, reason: null, errorCode: null, allowedPaths };
  }
  return {
    ...classifyWorkUnitScope({ allowedPaths }),
    required: true,
  };
};

export class WorkUnitScopeError extends Error {
  constructor(scope) {
    super(scope.message);
    this.name = 'WorkUnitScopeError';
    this.code = scope.errorCode;
    this.errorCode = scope.errorCode;
    this.reason = scope.reason;
    this.allowedPaths = scope.allowedPaths;
    this.nextAction = scope.nextAction;
    this.scope = scope;
  }
}

export const assertImplementationWorkUnitScope = ({ step = null, contract = null, actionType = 'implement' } = {}) => {
  if (!IMPLEMENTATION_ACTIONS.has(String(actionType))) return inspectWorkUnitScope({ step, contract });
  const scope = inspectWorkUnitScope({ step, contract });
  if (!scope.valid) throw new WorkUnitScopeError(scope);
  return scope;
};

export const assertBoundedWorkUnitScope = assertImplementationWorkUnitScope;

export const workUnitScopeFailure = (error) => {
  const scope = error?.scope || error || {};
  const errorCode = error?.errorCode || error?.code || scope.errorCode || WORK_UNIT_SCOPE_ERROR_CODES.missing;
  return {
    errorCode,
    failureCode: errorCode,
    errorSummary: error?.message || scope.message || String(error),
    nextAction: error?.nextAction || scope.nextAction || WORK_UNIT_SCOPE_NEXT_ACTION,
    scopeReason: error?.reason || scope.reason || null,
    allowedPaths: error?.allowedPaths || scope.allowedPaths || [],
    workspaceWide: error?.workspaceWide || scope.workspaceWide || [],
  };
};
