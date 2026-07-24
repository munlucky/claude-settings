import { TRANSITIONS } from '../transition.mjs';

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

const summarizeEvidence = (verifications = []) => verifications.map((verification) => ({
  obligationId: verification.obligationId,
  status: verification.status,
  executor: verification.executor || 'caller-attested',
  command: verification.command || null,
  exitCode: verification.exitCode,
  evidenceDigest: verification.evidenceDigest || null,
  observedAt: verification.observedAt,
}));

// Model-visible payload for `kernel next`: objective, acceptance, current
// evidence, and one action. Internal state names are never exposed.
export const buildNextPayload = ({ run, verifications = [], requiredObligations = [], failures = [], knowledgePromptBlock = null }) => {
  const base = {
    schemaVersion: 1,
    runId: run.runId,
    objective: run.objective,
    acceptance: run.acceptanceCriteria || [],
    evidence: summarizeEvidence(verifications),
    knowledge: knowledgePromptBlock,
  };

  if (run.status === 'completed') {
    return { ...base, action: { type: 'done', guidance: 'Run is complete. No further work is required.' } };
  }
  if (run.status === 'blocked' && run.blockedReason) {
    return { ...base, action: { type: 'blocked', reason: run.blockedReason, guidance: 'Resolve the blocker with the user, then submit a new report.' } };
  }

  const failing = failures.length > 0 ? failures : verifications.filter((verification) => verification.status === 'failed');
  if (failing.length > 0) {
    return {
      ...base,
      action: {
        type: 'fix',
        guidance: 'Fix the failing verification(s), then submit kernel report again with the verifications to re-run.',
        failures: failing.map((failure) => ({
          obligationId: failure.obligationId,
          command: failure.command || failure.commandRef || null,
          errorSummary: failure.errorSummary || null,
        })),
      },
    };
  }

  const passed = new Set(verifications.filter((verification) => verification.status === 'passed').map((verification) => verification.obligationId));
  const outstanding = requiredObligations.filter((obligation) => !passed.has(obligation));
  if (verifications.length === 0 || outstanding.length > 0) {
    return {
      ...base,
      action: {
        type: 'implement',
        guidance: 'Implement the objective, then submit kernel report with a summary, changed paths, and the verifications to run.',
        outstandingObligations: outstanding,
      },
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
  const judgments = Array.isArray(payload.judgments) ? payload.judgments : [];
  for (const judgment of judgments) {
    if (!judgment || typeof judgment !== 'object' || !judgment.obligationId || !['pass', 'fail'].includes(judgment.verdict)) {
      throw new Error('each judgment requires an obligationId and a pass/fail verdict');
    }
  }
  return {
    summary: typeof payload.summary === 'string' ? payload.summary : '',
    changedPaths: Array.isArray(payload.changedPaths) ? payload.changedPaths.map(String) : [],
    risks: Array.isArray(payload.risks) ? payload.risks.map(String) : [],
    verifications,
    judgments,
    blocker,
    gitCloseoutRequest: payload.gitCloseoutRequest && typeof payload.gitCloseoutRequest === 'object' ? payload.gitCloseoutRequest : null,
    knowledgeObservations: Array.isArray(payload.knowledgeObservations) ? payload.knowledgeObservations : [],
  };
};
