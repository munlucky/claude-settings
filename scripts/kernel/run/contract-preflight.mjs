// Contract admission boundary (K1/K2). A task contract is validated before a
// Run, owner binding, or mutation lease becomes durable. Keeping this check
// separate from the later dispatch guards makes malformed work fail before it
// can strand lifecycle state.

import path from 'node:path';
import {
  classifyWorkUnitScope,
  requiresImplementationWorkUnitScope,
} from './work-unit-scope.mjs';

export const CONTRACT_PREFLIGHT_ERROR_CODES = Object.freeze({
  invalid: 'contract-preflight-invalid',
  pathInvalid: 'contract-path-invalid',
  stepBindingInvalid: 'contract-step-binding-invalid',
  verificationCommandMissing: 'verification-command-missing',
});

const NEXT_ACTION = 'revise-task-contract-before-run-creation';
const IMPLEMENTATION_TASK_CLASSES = new Set(['analysis', 'review', 'read-only', 'readonly']);
const DETAILED_STEP_BINDING_FLAGS = new Set([
  'behaviorChanging',
  'crossLayer',
  'independentDeliverables',
  'safeParallelSplit',
  'longRunning',
]);

const fail = (errorCode, message, details = {}, nextAction = NEXT_ACTION) => {
  const error = new Error(message);
  error.name = 'ContractPreflightError';
  error.code = errorCode;
  error.errorCode = errorCode;
  error.nextAction = nextAction;
  error.details = details;
  return error;
};

const isAbsoluteRepositoryPath = (value) => (
  value.startsWith('/')
  || value.startsWith('~')
  || /^[A-Za-z]:[\\/]/u.test(value)
  || /^[A-Za-z]:[^/]/u.test(value)
);

const normalizeRepositoryPath = (entry, projectRoot) => {
  if (typeof entry !== 'string') {
    throw fail(
      CONTRACT_PREFLIGHT_ERROR_CODES.pathInvalid,
      'allowedPaths entries must be repository-relative strings',
      { entry, reason: 'non-string' },
    );
  }
  const value = entry.trim().replaceAll('\\', '/');
  if (!value || value === '.') {
    throw fail(
      CONTRACT_PREFLIGHT_ERROR_CODES.pathInvalid,
      'allowedPaths entries must name a bounded repository path',
      { entry, reason: 'empty-or-root' },
    );
  }
  if (value.includes('\u0000') || isAbsoluteRepositoryPath(value)) {
    throw fail(
      CONTRACT_PREFLIGHT_ERROR_CODES.pathInvalid,
      `allowedPaths entry is not repository-relative: ${entry}`,
      { entry, reason: 'absolute-or-invalid-root' },
    );
  }
  const segments = value.split('/');
  if (segments.some((segment) => segment === '..')) {
    throw fail(
      CONTRACT_PREFLIGHT_ERROR_CODES.pathInvalid,
      `allowedPaths entry may not traverse outside the repository: ${entry}`,
      { entry, reason: 'path-traversal' },
    );
  }
  const normalized = segments.filter((segment) => segment && segment !== '.').join('/');
  if (!normalized) {
    throw fail(
      CONTRACT_PREFLIGHT_ERROR_CODES.pathInvalid,
      `allowedPaths entry is empty after normalization: ${entry}`,
      { entry, reason: 'empty-after-normalization' },
    );
  }

  const root = path.resolve(projectRoot || process.cwd());
  const resolved = path.resolve(root, normalized);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw fail(
      CONTRACT_PREFLIGHT_ERROR_CODES.pathInvalid,
      `allowedPaths entry escapes the repository: ${entry}`,
      { entry, reason: 'out-of-root', projectRoot: root },
    );
  }
  return normalized;
};

export const normalizeBoundedPaths = ({ paths = [], projectRoot = process.cwd() } = {}) => {
  if (!Array.isArray(paths)) {
    throw fail(
      CONTRACT_PREFLIGHT_ERROR_CODES.pathInvalid,
      'allowedPaths must be an array of repository-relative strings',
      { valueType: typeof paths, reason: 'not-array' },
    );
  }
  return [...new Set(paths.map((entry) => normalizeRepositoryPath(entry, projectRoot)))].sort();
};

const acceptanceIdsFor = (contract) => new Set(
  (Array.isArray(contract?.acceptance) ? contract.acceptance : [])
    .map((entry, index) => (entry && typeof entry === 'object' && entry.id ? entry.id : `AC-${index + 1}`))
    .filter(Boolean)
    .map(String),
);

const obligationIdsFor = (obligations, contract) => new Set([
  ...(Array.isArray(obligations) ? obligations : []).map((entry) => entry?.obligationId).filter(Boolean).map(String),
  ...(Array.isArray(contract?.requiredObligations) ? contract.requiredObligations : []).map(String),
  ...(Array.isArray(contract?.acceptance) ? contract.acceptance : [])
    .map((entry) => entry?.evidencePlan?.obligationId)
    .filter(Boolean)
    .map(String),
]);

const assertNonEmptyStringList = (value, label, details) => {
  if (!Array.isArray(value) || value.length === 0 || value.some((entry) => typeof entry !== 'string' || !entry.trim())) {
    throw fail(
      CONTRACT_PREFLIGHT_ERROR_CODES.stepBindingInvalid,
      `Each declared step requires a non-empty ${label} list`,
      { ...details, field: label },
    );
  }
  return [...new Set(value.map((entry) => entry.trim()))];
};

export const requiresDetailedStepBindings = (contract = {}) => {
  const flags = contract?.flags && typeof contract.flags === 'object' ? contract.flags : {};
  return String(contract?.taskClass || '').toLowerCase() === 'long-running'
    || [...DETAILED_STEP_BINDING_FLAGS].some((flag) => flags[flag] === true || contract?.[flag] === true)
    || (Array.isArray(contract?.steps) && contract.steps.some((step) => (
      step && typeof step === 'object' && Object.prototype.hasOwnProperty.call(step, 'expectedOutputs')
    )));
};

export const validateDeclaredSteps = ({
  contract = {},
  commands = null,
  obligations = [],
  projectRoot = process.cwd(),
  requireDetailedBindings = null,
} = {}) => {
  const declared = Array.isArray(contract.steps) ? contract.steps : [];
  if (declared.length === 0) return { valid: true, steps: [] };

  const detailedBindings = requireDetailedBindings === null
    ? requiresDetailedStepBindings(contract)
    : Boolean(requireDetailedBindings);
  const acceptanceIds = acceptanceIdsFor(contract);
  const obligationIds = obligationIdsFor(obligations, contract);
  const seenStepIds = new Set();
  const claimedAcceptanceIds = new Set();
  const normalizedSteps = [];

  for (const [index, raw] of declared.entries()) {
    const details = { index, stepId: raw?.stepId || null };
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw fail(
        CONTRACT_PREFLIGHT_ERROR_CODES.stepBindingInvalid,
        `Declared step ${index + 1} must be an object`,
        details,
      );
    }
    const stepId = raw.stepId ? String(raw.stepId).trim() : `step-${index + 1}`;
    if (seenStepIds.has(stepId)) {
      throw fail(
        CONTRACT_PREFLIGHT_ERROR_CODES.stepBindingInvalid,
        `Declared step id is duplicated: ${stepId}`,
        { ...details, stepId },
      );
    }
    seenStepIds.add(stepId);

    const hasStepScope = Object.prototype.hasOwnProperty.call(raw, 'allowedPaths');
    if (detailedBindings && !hasStepScope) {
      throw fail(
        CONTRACT_PREFLIGHT_ERROR_CODES.stepBindingInvalid,
        `Declared step ${stepId} must bind its own allowedPaths`,
        { ...details, stepId, reason: 'step-scope-missing' },
      );
    }
    const allowedPaths = normalizeBoundedPaths({
      paths: hasStepScope ? raw.allowedPaths : contract.allowedPaths,
      projectRoot,
    });
    const scope = classifyWorkUnitScope({ allowedPaths });
    if (detailedBindings && !scope.valid) {
      throw fail(scope.errorCode, scope.message, { ...details, stepId, scope }, scope.nextAction);
    }

    const stepAcceptanceIds = Array.isArray(raw.acceptanceIds)
      ? assertNonEmptyStringList(raw.acceptanceIds, 'acceptanceIds', { ...details, stepId })
      : [];
    if (detailedBindings && stepAcceptanceIds.length === 0) {
      throw fail(
        CONTRACT_PREFLIGHT_ERROR_CODES.stepBindingInvalid,
        `Each declared step requires a non-empty acceptanceIds list`,
        { ...details, stepId, field: 'acceptanceIds' },
      );
    }
    const unknownAcceptanceIds = stepAcceptanceIds.filter((id) => !acceptanceIds.has(id));
    if (unknownAcceptanceIds.length > 0) {
      throw fail(
        CONTRACT_PREFLIGHT_ERROR_CODES.stepBindingInvalid,
        `Declared step ${stepId} references unknown acceptance ids: ${unknownAcceptanceIds.join(', ')}`,
        { ...details, stepId, unknownAcceptanceIds },
      );
    }
    for (const id of stepAcceptanceIds) claimedAcceptanceIds.add(id);

    const stepObligationIds = Array.isArray(raw.obligationIds)
      ? assertNonEmptyStringList(raw.obligationIds, 'obligationIds', { ...details, stepId })
      : [];
    if (detailedBindings && stepObligationIds.length === 0) {
      throw fail(
        CONTRACT_PREFLIGHT_ERROR_CODES.stepBindingInvalid,
        `Each declared step requires a non-empty obligationIds list`,
        { ...details, stepId, field: 'obligationIds' },
      );
    }
    const unknownObligationIds = stepObligationIds.filter((id) => obligationIds.size > 0 && !obligationIds.has(id));
    if (unknownObligationIds.length > 0) {
      throw fail(
        CONTRACT_PREFLIGHT_ERROR_CODES.stepBindingInvalid,
        `Declared step ${stepId} references unknown obligation ids: ${unknownObligationIds.join(', ')}`,
        { ...details, stepId, unknownObligationIds },
      );
    }

    const expectedOutputs = Object.prototype.hasOwnProperty.call(raw, 'expectedOutputs')
      ? assertNonEmptyStringList(raw.expectedOutputs, 'expectedOutputs', { ...details, stepId })
      : [];
    if (detailedBindings && expectedOutputs.length === 0) {
      throw fail(
        CONTRACT_PREFLIGHT_ERROR_CODES.stepBindingInvalid,
        `Each declared step requires a non-empty expectedOutputs list`,
        { ...details, stepId, field: 'expectedOutputs' },
      );
    }
    normalizedSteps.push({ stepId, allowedPaths, acceptanceIds: stepAcceptanceIds, obligationIds: stepObligationIds, expectedOutputs });
  }

  const unclaimedAcceptanceIds = [...acceptanceIds].filter((id) => !claimedAcceptanceIds.has(id));
  if (detailedBindings && unclaimedAcceptanceIds.length > 0) {
    throw fail(
      CONTRACT_PREFLIGHT_ERROR_CODES.stepBindingInvalid,
      `Declared steps do not bind acceptance ids: ${unclaimedAcceptanceIds.join(', ')}`,
      { unclaimedAcceptanceIds, reason: 'acceptance-unbound' },
    );
  }

  // A step contract may be checked with the same command catalog as the run;
  // this keeps command existence validation at the pre-create boundary too.
  validateVerificationCommands({ contract, commands });
  return { valid: true, steps: normalizedSteps, detailedBindings };
};

const commandReferencesFor = (contract) => {
  const refs = [];
  for (const acceptance of Array.isArray(contract?.acceptance) ? contract.acceptance : []) {
    const plan = acceptance?.evidencePlan;
    if (Array.isArray(plan?.commandRefs)) refs.push(...plan.commandRefs);
    if (plan?.commandRef) refs.push(plan.commandRef);
  }
  for (const verification of Array.isArray(contract?.requiredVerifications) ? contract.requiredVerifications : []) {
    if (typeof verification === 'string') refs.push(verification);
    else if (verification?.commandRef) refs.push(verification.commandRef);
    else if (Array.isArray(verification?.commandRefs)) refs.push(...verification.commandRefs);
  }
  return [...new Set(refs.map(String).map((entry) => entry.trim()).filter(Boolean))];
};

export const validateVerificationCommands = ({ contract = {}, commands = null } = {}) => {
  if (!Array.isArray(commands)) return { valid: true, commandRefs: commandReferencesFor(contract), missing: [] };
  const known = new Set(commands.map((entry) => entry?.commandRef).filter(Boolean).map(String));
  const commandRefs = commandReferencesFor(contract);
  const missing = commandRefs.filter((ref) => !known.has(ref));
  if (missing.length > 0) {
    throw fail(
      CONTRACT_PREFLIGHT_ERROR_CODES.verificationCommandMissing,
      `Task contract references verification commands not declared by the project: ${missing.join(', ')}`,
      { missing, commandRefs },
    );
  }
  return { valid: true, commandRefs, missing: [] };
};

export const preflightTaskContract = ({
  contract = {},
  projectRoot = process.cwd(),
  commands = null,
  obligations = [],
  requireImplementationScope = null,
} = {}) => {
  if (!contract || typeof contract !== 'object' || Array.isArray(contract)) {
    throw fail(CONTRACT_PREFLIGHT_ERROR_CODES.invalid, 'Task contract must be an object', { reason: 'not-object' });
  }

  const declaredSteps = Array.isArray(contract.steps) && contract.steps.length > 0;
  const implementationScopeRequired = requireImplementationScope === null
    ? !IMPLEMENTATION_TASK_CLASSES.has(String(contract.taskClass || '').toLowerCase())
    : Boolean(requireImplementationScope);
  const requiresScope = implementationScopeRequired && requiresImplementationWorkUnitScope({ contract });
  let allowedPaths = [];
  if (Array.isArray(contract.allowedPaths)) {
    allowedPaths = normalizeBoundedPaths({ paths: contract.allowedPaths, projectRoot });
    const scope = classifyWorkUnitScope({ allowedPaths });
    if (requiresScope && !declaredSteps && !scope.valid) {
      throw fail(scope.errorCode, scope.message, { scope }, scope.nextAction);
    }
  } else if (requiresScope && !declaredSteps) {
    const scope = classifyWorkUnitScope({ allowedPaths: [] });
    throw fail(scope.errorCode, scope.message, { scope }, scope.nextAction);
  }

  const stepResult = validateDeclaredSteps({ contract, commands, obligations, projectRoot });
  const verification = validateVerificationCommands({ contract, commands });
  return {
    valid: true,
    required: requiresScope,
    declaredSteps,
    allowedPaths,
    steps: stepResult.steps,
    detailedStepBindings: stepResult.detailedBindings || false,
    verification,
  };
};
