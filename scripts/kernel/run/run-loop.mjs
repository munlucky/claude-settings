import { TRANSITIONS } from '../transition.mjs';
import { sanitizePersistentPayload } from '../persistent-sanitizer.mjs';

export const REPORT_BLOCK_REASONS = Object.freeze([
  'question',
  'permission',
  'external-dependency',
  'unsupported-verification',
  'unsafe-command',
  'network-policy',
]);

// Shortest transition path between workflow states, so the report loop can
// advance a run without the model ever naming internal states.
export const planStatePath = (from, to) => {
  if (from === to) return [];
  const visited = new Set([from]);
  const queue = [[from, []]];
  while (queue.length > 0) {
    const [state, pathSoFar] = queue.shift();
    for (const next of TRANSITIONS[state] || []) {
      if (visited.has(next)) continue;
      const nextPath = [...pathSoFar, next];
      if (next === to) return nextPath;
      visited.add(next);
      queue.push([next, nextPath]);
    }
  }
  return null;
};

// Steps along the route fixed at run start (P1-1). Following the stored route
// keeps conditional stages (SHAPE, SLICE, SCHEDULE) in the path instead of
// letting the shortest route to PROVE skip them.
export const planRouteSteps = (route, from, to) => {
  if (!Array.isArray(route) || route.length === 0) return null;
  const fromIndex = route.indexOf(from);
  const toIndex = route.indexOf(to);
  if (fromIndex < 0 || toIndex < 0 || toIndex < fromIndex) return null;
  const steps = route.slice(fromIndex + 1, toIndex + 1);
  // Only usable when every hop is a legal transition; otherwise fall back.
  let cursor = from;
  for (const step of steps) {
    if (!(TRANSITIONS[cursor] || []).includes(step)) return null;
    cursor = step;
  }
  return steps;
};

const summarizeEvidence = (verifications = []) => verifications.map((verification) => ({
  obligationId: verification.obligationId,
  status: verification.status,
  executor: verification.executor || 'caller-attested',
  evidenceClass: verification.evidenceClass || 'attested',
  command: verification.command || null,
  exitCode: verification.exitCode,
  evidenceDigest: verification.evidenceDigest || null,
  observedAt: verification.observedAt,
}));

// What the model needs to satisfy an obligation: the class of evidence that
// counts and the exact commands that are bound to it. Without this the model
// has to guess, and guessing is what produced forged obligation names.
const describeObligations = (obligations = [], obligationIds = []) => obligationIds.map((obligationId) => {
  const declared = obligations.find((obligation) => obligation.obligationId === obligationId);
  return {
    obligationId,
    evidenceClass: declared?.evidenceClass || 'hard',
    verificationMethod: declared?.verificationMethod || 'kernel-executed-command',
    allowedCommandRefs: declared?.allowedCommandRefs || [],
    acceptanceIds: declared?.acceptanceIds || [],
  };
});

// An ordinary work unit is assigned to a bounded actor before the model can
// report implementation work.  This is deliberately provider-neutral: the
// Host maps the role onto its own worker mechanism and model policy.
const actorRoleForAction = (actionType) => {
  if (actionType === 'review') return 'reviewer';
  if (actionType === 'debug') return 'debugger';
  if (['implement', 'fix'].includes(actionType)) return 'implementer';
  if (['understand', 'design', 'plan', 'replan'].includes(actionType)) return 'planner';
  return null;
};

const withActorAssignment = (action) => {
  const role = actorRoleForAction(action?.type);
  if (!role) return action;
  return {
    ...action,
    actorAssignment: {
      required: true,
      role,
      parentRole: 'orchestrator',
      parentMayImplement: false,
      nestedDelegationAllowed: false,
    },
  };
};

// Model-visible payload for `kernel next`: contract, current evidence, and one
// action. Internal state names are never exposed.
export const buildNextPayload = ({
  run,
  verifications = [],
  requiredObligations = [],
  obligations = [],
  contract = null,
  failures = [],
  knowledgePromptBlock = null,
  capabilities = [],
}) => {
  const acceptancePlans = Array.isArray(contract?.acceptance)
    ? contract.acceptance.map((item) => ({
      id: item.id,
      statement: item.statement,
      evidencePlan: item.evidencePlan || null,
    }))
    : [];
  const missingEvidencePlans = acceptancePlans.filter((item) => !item.evidencePlan).map((item) => item.id);
  const mutationRun = Number(run.mutationRevision || 0) > 0;
  const base = {
    schemaVersion: 1,
    runId: run.runId,
    objective: run.objective,
    acceptance: contract?.acceptance?.map((item) => item.statement) || run.acceptanceCriteria || [],
    // Constraints and non-goals come from persisted SQLite state, so a run
    // resumed in a fresh process does not lose them (P0-4).
    constraints: contract?.constraints || [],
    nonGoals: contract?.nonGoals || [],
    risks: contract?.risks || [],
    completionPredicate: contract?.completionPredicate || { requiredOutcomes: [] },
    evidence: summarizeEvidence(verifications),
    knowledge: knowledgePromptBlock,
    acceptancePlans,
    knowledgeCapture: {
      required: mutationRun,
      status: run.knowledgeStatus || null,
      warning: mutationRun && ['no_candidates_submitted', 'no_new_knowledge', 'no_change'].includes(run.knowledgeStatus),
      guidance: mutationRun
        ? 'Before final report, include reusable knowledgeObservations with evidenceRefs, or record why this mutation established no reusable project knowledge.'
        : 'Knowledge observations become required when this run mutates the workspace.',
    },
    capabilities,
  };

  if (run.status === 'completed' && (run.finalizationStatus || 'completed') === 'completed') {
    return { ...base, action: { type: 'done', guidance: 'Run is complete. No further work is required.' } };
  }
  // Accepted completion whose knowledge commit or Git closeout did not finish
  // is NOT done; the run stays retryable (P0-7).
  if (run.status === 'completed') {
    return {
      ...base,
      action: {
        type: 'finalize',
        finalizationStatus: run.finalizationStatus,
        guidance: 'Evidence was accepted but finalization did not complete. Submit kernel report again to retry the outstanding finalization step.',
      },
    };
  }
  if (run.status === 'blocked' && run.blockedReason) {
    return { ...base, action: { type: 'blocked', reason: run.blockedReason, guidance: 'Resolve the blocker with the user, then submit a new report.' } };
  }

  const failing = failures.length > 0 ? failures : verifications.filter((verification) => verification.status === 'failed');
  if (failing.length > 0) {
    return {
      ...base,
      action: withActorAssignment({
        type: 'fix',
        guidance: 'Fix the failing verification(s), then submit kernel report again with the verifications to re-run.',
        failures: failing.map((failure) => ({
          obligationId: failure.obligationId,
          command: failure.command || failure.commandRef || null,
          errorSummary: failure.errorSummary || null,
          allowedCommandRefs: failure.allowedCommandRefs || undefined,
        })),
      }),
    };
  }

  const passed = new Set(verifications.filter((verification) => verification.status === 'passed').map((verification) => verification.obligationId));
  const outstanding = requiredObligations.filter((obligation) => !passed.has(obligation));
  if (missingEvidencePlans.length > 0 || verifications.length === 0 || outstanding.length > 0) {
    const described = describeObligations(obligations, outstanding);
    if (outstanding.length > 0 && described.every((entry) => entry.evidenceClass === 'judgment')) {
      return {
        ...base,
        action: withActorAssignment({
          type: 'review',
          guidance: 'Route the outstanding judgment obligations to an independent reviewer session and submit the Kernel-recorded review receipt in kernel report.',
          outstandingObligations: outstanding,
          obligations: described,
          independentReviewRequired: true,
        }),
      };
    }
    const unsatisfiable = described
      .filter((entry) => entry.evidenceClass === 'hard' && entry.allowedCommandRefs.length === 0);
    return {
      ...base,
      action: withActorAssignment({
        type: 'implement',
        guidance: missingEvidencePlans.length > 0
          ? `Before submitting proof, provide one structured evidencePlan per acceptance criterion (${missingEvidencePlans.join(', ')}), each bound to the real obligation and project commandRef.`
          : unsatisfiable.length > 0
          ? 'Implement the objective. Some required evidence has no runnable project command yet — add one to the project manifest, or report an unsupported-verification blocker.'
          : 'Implement the objective, then submit kernel report with a summary, changed paths, and the verifications to run.',
        outstandingObligations: outstanding,
        obligations: described,
        evidencePlansRequired: missingEvidencePlans,
        shapeRequired: Boolean(run.route?.shapeRequired),
      }),
    };
  }

  return {
    ...base,
    action: { type: 'report', guidance: 'All requested evidence passed. Submit kernel report to finalize the run.' },
  };
};

export const normalizeReport = (payload = {}) => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('report payload must be a JSON object');
  }
  const blocker = payload.blocker && typeof payload.blocker === 'object' ? payload.blocker : null;
  if (blocker && !REPORT_BLOCK_REASONS.includes(blocker.reason)) {
    throw new Error(`blocker.reason must be one of: ${REPORT_BLOCK_REASONS.join(', ')}`);
  }
  const verifications = Array.isArray(payload.verifications) ? payload.verifications : [];
  for (const request of verifications) {
    if (!request || typeof request !== 'object' || !request.commandRef) {
      throw new Error('each requested verification requires a commandRef');
    }
  }
  // A judgment carries the Review Receipt it rests on, not a reviewer name the
  // report invented; protected and T3 judgments are refused without one.
  const judgments = (Array.isArray(payload.judgments) ? payload.judgments : []).map((judgment) => {
    if (!judgment || typeof judgment !== 'object' || !judgment.obligationId || !['pass', 'fail'].includes(judgment.verdict)) {
      throw new Error('each judgment requires an obligationId and a pass/fail verdict');
    }
    if (judgment.reviewReceiptId !== undefined && judgment.reviewReceiptId !== null && !/^review-receipt-[a-f0-9]{8,64}$/.test(String(judgment.reviewReceiptId))) {
      throw new Error('judgment.reviewReceiptId must be a review-receipt-<hex> identifier recorded by the Kernel');
    }
    return {
      ...judgment,
      reviewReceiptId: judgment.reviewReceiptId ? String(judgment.reviewReceiptId) : null,
      acceptanceCoverage: Array.isArray(judgment.acceptanceCoverage) ? judgment.acceptanceCoverage.map(String) : undefined,
    };
  });
  return sanitizePersistentPayload({
    summary: typeof payload.summary === 'string' ? payload.summary : '',
    implementerId: payload.implementerId ? String(payload.implementerId) : null,
    // The bounded context (K1) and the work unit (K2) this report answers.
    capsuleId: payload.capsuleId ? String(payload.capsuleId) : null,
    attemptId: payload.attemptId ? String(payload.attemptId) : null,
    bindingId: payload.bindingId ? String(payload.bindingId) : null,
    // The Host-issued actor handle is consumed at the report boundary.  It is
    // not part of the model-visible action, and a capsule id cannot substitute
    // for it.
    assignmentId: payload.assignmentId ? String(payload.assignmentId) : null,
    stepId: payload.stepId ? String(payload.stepId) : null,
    waveId: payload.waveId ? String(payload.waveId) : null,
    planRevision: payload.planRevision === undefined || payload.planRevision === null ? undefined : Number(payload.planRevision),
    actorSessionId: payload.actorSessionId || payload.sessionId || payload.workerSessionId ? String(payload.actorSessionId || payload.sessionId || payload.workerSessionId) : null,
    workspaceId: payload.workspaceId ? String(payload.workspaceId) : null,
    changedPaths: Array.isArray(payload.changedPaths) ? payload.changedPaths.map(String) : [],
    risks: Array.isArray(payload.risks) ? payload.risks.map(String) : [],
    verifications,
    judgments,
    // Evidence plans the model produced in FRAME; persisted before execution.
    evidencePlans: Array.isArray(payload.evidencePlans) ? payload.evidencePlans : [],
    blocker,
    gitCloseoutRequest: payload.gitCloseoutRequest && typeof payload.gitCloseoutRequest === 'object' ? payload.gitCloseoutRequest : null,
    knowledgeObservations: Array.isArray(payload.knowledgeObservations) ? payload.knowledgeObservations : [],
  });
};
