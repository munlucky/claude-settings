export const PHASE_LOOP_SCHEMA_VERSION = 1;

export const PHASE_LOOP_DECISIONS = Object.freeze({
  CONTINUE_EXECUTE: 'continue_execute',
  RERUN_REVIEW: 'rerun_review',
  RERUN_VERIFY: 'rerun_verify',
  REPAIR_REQUIRED: 'repair_required',
  BLOCKED: 'blocked',
  CLEAN_FINISH_CANDIDATE: 'clean_finish_candidate',
});

export const ALLOWED_PHASE_LOOP_DECISIONS = Object.freeze(
  Object.values(PHASE_LOOP_DECISIONS),
);

const CODE_CHANGE_FAILURES = new Set([
  'code_change_required',
  'implementation_defect',
  'review_findings_require_code_change',
  'test_failure',
  'code_policy_failed',
  'workflow_enforcement_failed',
]);

const VERIFY_RETRY_FAILURES = new Set([
  'missing_verification_evidence',
  'verification_evidence_missing',
  'stale_verification',
  'verifier_unavailable_retryable',
]);

const BLOCKED_FAILURES = new Set([
  'environment',
  'environment_unavailable',
  'verification_environment_unavailable',
  'verifier_unavailable',
  'tool_unavailable',
  'node_test_runner_spawn_eperm',
  'spawn_eperm',
]);

const REPAIR_FAILURES = new Set([
  'projection_state_inconsistency',
  'state_projection_inconsistency',
  'phase_status_inconsistent',
  'stale_projection',
  'runtime_state_corrupt',
]);

const RETRY_STRATEGIES = Object.freeze({
  executeRepair: 'execute_repair',
  rerunReview: 'rerun_review',
  rerunVerify: 'rerun_verify',
  repairProjection: 'repair_projection',
  stopAndHandoff: 'stop_and_handoff',
  none: 'none',
});

export function decidePhaseLoop(signal = {}) {
  const normalized = normalizeSignal(signal);
  const failedCaseClasses = new Set(
    normalized.failedCases.map((failedCase) => failedCase.class),
  );

  const hasContradictoryPassSignal =
    (normalized.result === 'pass' || normalized.allPassed) && normalized.failedCases.length > 0;

  if (hasContradictoryPassSignal) {
    return buildDecision(normalized, {
      decision: PHASE_LOOP_DECISIONS.REPAIR_REQUIRED,
      retryRecommended: true,
      retryStrategy: RETRY_STRATEGIES.repairProjection,
    });
  }

  if (normalized.result === 'pass' || normalized.allPassed) {
    return buildDecision(normalized, {
      decision: PHASE_LOOP_DECISIONS.CLEAN_FINISH_CANDIDATE,
      retryRecommended: false,
      retryStrategy: RETRY_STRATEGIES.none,
    });
  }

  if (normalized.stage === 'review') {
    if (hasAny(failedCaseClasses, CODE_CHANGE_FAILURES)) {
      return buildDecision(normalized, {
        decision: PHASE_LOOP_DECISIONS.CONTINUE_EXECUTE,
        retryRecommended: true,
        retryStrategy: RETRY_STRATEGIES.executeRepair,
      });
    }

    return buildDecision(normalized, {
      decision: PHASE_LOOP_DECISIONS.RERUN_REVIEW,
      retryRecommended: true,
      retryStrategy: RETRY_STRATEGIES.rerunReview,
    });
  }

  if (normalized.stage === 'verify') {
    if (normalized.result === 'blocked' || hasAny(failedCaseClasses, BLOCKED_FAILURES)) {
      return buildDecision(normalized, {
        decision: PHASE_LOOP_DECISIONS.BLOCKED,
        retryRecommended: false,
        retryStrategy: RETRY_STRATEGIES.stopAndHandoff,
      });
    }

    if (hasAny(failedCaseClasses, VERIFY_RETRY_FAILURES)) {
      return buildDecision(normalized, {
        decision: PHASE_LOOP_DECISIONS.RERUN_VERIFY,
        retryRecommended: true,
        retryStrategy: RETRY_STRATEGIES.rerunVerify,
      });
    }

    return buildDecision(normalized, {
      decision: PHASE_LOOP_DECISIONS.CONTINUE_EXECUTE,
      retryRecommended: true,
      retryStrategy: RETRY_STRATEGIES.executeRepair,
    });
  }

  if (normalized.stage === 'finish') {
    if (hasAny(failedCaseClasses, REPAIR_FAILURES)) {
      return buildDecision(normalized, {
        decision: PHASE_LOOP_DECISIONS.REPAIR_REQUIRED,
        retryRecommended: true,
        retryStrategy: RETRY_STRATEGIES.repairProjection,
      });
    }

    const failedCases = normalized.failedCases.length > 0
      ? normalized.failedCases
      : [{ class: 'unknown_finalizer_failure', message: 'Unknown finalizer failure' }];

    return buildDecision(
      { ...normalized, failedCases },
      {
        decision: PHASE_LOOP_DECISIONS.BLOCKED,
        retryRecommended: false,
        retryStrategy: RETRY_STRATEGIES.stopAndHandoff,
      },
    );
  }

  if (normalized.stage === 'checkpoint') {
    if (hasAny(failedCaseClasses, REPAIR_FAILURES)) {
      return buildDecision(normalized, {
        decision: PHASE_LOOP_DECISIONS.REPAIR_REQUIRED,
        retryRecommended: true,
        retryStrategy: RETRY_STRATEGIES.repairProjection,
      });
    }

    return buildDecision(normalized, {
      decision: PHASE_LOOP_DECISIONS.RERUN_VERIFY,
      retryRecommended: true,
      retryStrategy: RETRY_STRATEGIES.rerunVerify,
    });
  }

  return buildDecision(normalized, {
    decision: PHASE_LOOP_DECISIONS.BLOCKED,
    retryRecommended: false,
    retryStrategy: RETRY_STRATEGIES.stopAndHandoff,
  });
}

export function isAllowedPhaseLoopDecision(decision) {
  return ALLOWED_PHASE_LOOP_DECISIONS.includes(decision);
}

function buildDecision(normalized, options) {
  const failedStage = normalized.failedCases.length > 0 ? normalized.stage : null;
  const sourceDecisionId = stableDecisionId(normalized);

  return {
    schemaVersion: PHASE_LOOP_SCHEMA_VERSION,
    decision: options.decision,
    phaseNumber: normalized.phaseNumber,
    attemptNumber: normalized.attemptNumber,
    sourceDecisionId,
    retryRecommended: options.retryRecommended,
    failedStage,
    failedCases: normalized.failedCases,
    improvementDirectives: normalized.improvementDirectives,
    evidenceRefs: normalized.evidenceRefs,
    nextAttemptInput: {
      phaseNumber: normalized.phaseNumber,
      attemptNumber: normalized.attemptNumber + 1,
      retryStrategy: options.retryStrategy,
      previousStage: normalized.stage,
      sourceDecisionId,
    },
  };
}

function normalizeSignal(signal) {
  const phaseNumber = asPositiveInteger(signal.phaseNumber, 0);
  const attemptNumber = asPositiveInteger(signal.attemptNumber, 1);
  const stage = normalizeToken(signal.stage ?? signal.failedStage ?? 'unknown');
  const result = normalizeResult(signal.result ?? signal.status ?? signal.verdict);
  const failedCases = normalizeFailedCases(signal);

  return {
    phaseNumber,
    attemptNumber,
    stage,
    result,
    allPassed: signal.allPassed === true,
    failedCases,
    improvementDirectives: normalizeStringArray(signal.improvementDirectives),
    evidenceRefs: normalizeStringArray(signal.evidenceRefs),
  };
}

function normalizeFailedCases(signal) {
  const rawCases = Array.isArray(signal.failedCases) ? signal.failedCases : [];
  const normalizedCases = rawCases
    .map((failedCase) => normalizeFailedCase(failedCase))
    .filter(Boolean);

  if (normalizedCases.length > 0) {
    return normalizedCases;
  }

  const failureClass = normalizeToken(signal.failureClass ?? signal.class ?? signal.code);
  if (!failureClass) {
    return [];
  }

  return [{ class: failureClass }];
}

function normalizeFailedCase(failedCase) {
  if (typeof failedCase === 'string') {
    return { class: normalizeToken(failedCase) };
  }

  if (!failedCase || typeof failedCase !== 'object') {
    return null;
  }

  const failureClass = normalizeToken(
    failedCase.class ?? failedCase.failureClass ?? failedCase.code,
  );
  if (!failureClass) {
    return null;
  }

  const normalized = { class: failureClass };
  if (typeof failedCase.message === 'string' && failedCase.message.length > 0) {
    normalized.message = failedCase.message;
  }
  if (typeof failedCase.evidenceRef === 'string' && failedCase.evidenceRef.length > 0) {
    normalized.evidenceRef = failedCase.evidenceRef;
  }
  return normalized;
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item) => typeof item === 'string' && item.length > 0);
}

function normalizeResult(value) {
  const token = normalizeToken(value);
  if (['pass', 'passed', 'done', 'ok', 'success'].includes(token)) {
    return 'pass';
  }
  if (['blocked', 'block'].includes(token)) {
    return 'blocked';
  }
  if (['fail', 'failed', 'failure', 'retry', 'blocked'].includes(token)) {
    return 'fail';
  }
  return token || 'unknown';
}

function normalizeToken(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function asPositiveInteger(value, fallback) {
  return Number.isInteger(value) && value >= 0 ? value : fallback;
}

function stableDecisionId(normalized) {
  const stableInput = {
    phaseNumber: normalized.phaseNumber,
    attemptNumber: normalized.attemptNumber,
    stage: normalized.stage,
    result: normalized.result,
    allPassed: normalized.allPassed,
    failedCases: normalized.failedCases,
    improvementDirectives: normalized.improvementDirectives,
    evidenceRefs: normalized.evidenceRefs,
  };

  return `phase-loop:${hashString(stableStringify(stableInput))}`;
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(',')}}`;
  }

  return JSON.stringify(value);
}

function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function hasAny(values, candidates) {
  for (const value of values) {
    if (candidates.has(value)) {
      return true;
    }
  }
  return false;
}
