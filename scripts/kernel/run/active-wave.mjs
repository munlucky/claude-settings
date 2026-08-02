import { createHash } from 'node:crypto';

export const WAVE_STATES = Object.freeze([
  'planned', 'preparing', 'dispatching', 'collecting', 'integrating',
  'verifying', 'integrated', 'failed', 'aborted', 'superseded',
]);

export const ACTIVE_WAVE_STATES = Object.freeze([
  'planned', 'preparing', 'dispatching', 'collecting', 'integrating', 'verifying',
]);

export const WAVE_TERMINAL_STATES = Object.freeze(['integrated', 'failed', 'aborted', 'superseded']);
export const INTEGRATION_STATES = Object.freeze(['not-required', 'pending', 'integrated', 'failed', 'superseded']);

const digest = (value) => createHash('sha256').update(String(value)).digest('hex');

export const shortWorktreeToken = (value, length = 8) => digest(value).slice(0, length);

export const buildWaveId = ({ runId, planRevision, sequence = 1 } = {}) => (
  `wave-${shortWorktreeToken(`${runId}:${planRevision}:${sequence}`, 16)}`
);

export const isApprovalSource = (value) => /^(?:user-session|project-policy|operator-policy):[^\s:]+$/u.test(String(value || ''));

export const normalizeHostCapabilities = (capabilities = {}) => ({
  supportsConcurrentSessions: capabilities.supportsConcurrentSessions === true,
  supportsIsolatedWorkingDirectory: capabilities.supportsIsolatedWorkingDirectory === true,
  supportsPerSessionEnvironment: capabilities.supportsPerSessionEnvironment === true,
});

const normalizePath = (value) => String(value || '')
  .replaceAll('\\', '/')
  .replace(/^\.\//u, '')
  .toLowerCase()
  .replace(/\/\*+$/u, '');

export const pathsOverlap = (left, right) => {
  const a = normalizePath(left);
  const b = normalizePath(right);
  if (!a || !b || a === '**' || b === '**') return true;
  return a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
};

export const scopesOverlap = (left = [], right = []) => (
  left.some((a) => right.some((b) => pathsOverlap(a, b)))
);

export const waveStatusIsActive = (status) => ACTIVE_WAVE_STATES.includes(status);

export const assertWaveTransition = (from, to) => {
  const transitions = {
    planned: ['preparing', 'aborted', 'superseded'],
    preparing: ['dispatching', 'failed', 'aborted', 'superseded'],
    dispatching: ['collecting', 'failed', 'aborted', 'superseded'],
    collecting: ['integrating', 'failed', 'aborted', 'superseded'],
    integrating: ['verifying', 'failed', 'aborted', 'superseded'],
    verifying: ['integrated', 'failed', 'aborted', 'superseded'],
    integrated: [],
    failed: [],
    aborted: [],
    superseded: [],
  };
  if (!WAVE_STATES.includes(to) || !(transitions[from] || []).includes(to)) {
    throw Object.assign(new Error(`Invalid active wave transition ${from} -> ${to}`), {
      code: 'WAVE_TRANSITION_INVALID',
    });
  }
  return true;
};

export const resolveWayfinderAdmission = ({
  run,
  steps = [],
  commands = [],
  hostCapabilities = {},
  git = {},
  maxWorkers = 2,
} = {}) => {
  const safeWave = run?.taskContract?.safeWave || null;
  const reasons = [];
  if (run?.status !== 'active') reasons.push('run-not-active');
  if (steps.length < 2) reasons.push('fewer-than-two-executable-steps');
  if (safeWave?.requested !== true) reasons.push('safe-wave-not-requested');
  if (safeWave?.approved !== true) reasons.push('safe-wave-not-approved');
  if (!isApprovalSource(safeWave?.approvedBy)) reasons.push('invalid-approval-source');
  const commandRef = safeWave?.integrationVerification?.commandRef;
  if (!commandRef) reasons.push('integration-command-missing');
  if (commandRef && !commands.some((command) => command.commandRef === commandRef)) {
    reasons.push('integration-command-not-declared');
  }
  if (steps.some((step) => !Array.isArray(step.allowedPaths) || step.allowedPaths.length === 0)) {
    reasons.push('step-write-scope-missing');
  }
  if (steps.some((step) => (step.allowedPaths || []).some((scope) => String(scope).trim() === '**'))) {
    reasons.push('unbounded-write-scope');
  }
  if (steps.some((step) => !((step.obligationIds || []).length || (step.expectedOutputs || []).length))) {
    reasons.push('step-verification-missing');
  }
  const overlapping = steps.some((step, index) => steps.slice(index + 1).some((other) => scopesOverlap(step.allowedPaths || [], other.allowedPaths || [])));
  if (overlapping) reasons.push('write-scope-overlap');
  const caps = normalizeHostCapabilities(hostCapabilities);
  for (const [name, supported] of Object.entries(caps)) if (!supported) reasons.push(`host-${name}-unsupported`);
  if (git.ready === false) reasons.push(git.reason || 'git-workspace-unavailable');
  const t3Review = run?.proofTier === 'T3'
    && (run?.independentReviewRequired === true || run?.taskContract?.flags?.independentReviewRequired === true || run?.taskContract?.independentReview === true);
  const boundedLimit = t3Review ? 3 : 2;
  return {
    admitted: reasons.length === 0,
    reasons,
    workerLimit: Math.max(1, Math.min(Number(maxWorkers) || 2, boundedLimit, steps.length)),
    integrationCommandRef: commandRef || null,
    approvalSource: safeWave?.approvedBy || null,
  };
};

export const buildActiveWave = ({
  run,
  steps = [],
  baseCommitSha,
  baseMutationRevision = 0,
  baseWorkspaceIdentity,
  integrationCommandRef,
  approvalSource,
  workerLimit = 2,
  waveId = null,
  sequence = 1,
  now = new Date().toISOString(),
} = {}) => {
  if (!run?.runId) throw new Error('run is required to build an active wave');
  if (!baseCommitSha) throw new Error('baseCommitSha is required to build an active wave');
  if (!baseWorkspaceIdentity) throw new Error('baseWorkspaceIdentity is required to build an active wave');
  return {
    waveId: waveId || buildWaveId({ runId: run.runId, planRevision: run.planRevision, sequence }),
    runId: run.runId,
    planRevision: Number(run.planRevision || 1),
    status: 'planned',
    baseCommitSha,
    baseMutationRevision: Number(baseMutationRevision),
    baseWorkspaceIdentity,
    integrationWorkspaceId: null,
    integrationCommandRef,
    approvalSource,
    workerLimit: Math.max(1, Number(workerLimit) || 1),
    stepIds: steps.map((step) => step.stepId),
    failureCode: null,
    createdAt: now,
    updatedAt: now,
  };
};

export const dependenciesSatisfiedWithIntegration = (step, steps = []) => {
  const byId = new Map(steps.map((entry) => [entry.stepId, entry]));
  return (step.dependencyIds || []).every((dependencyId) => {
    const dependency = byId.get(dependencyId);
    return dependency?.state === 'passed'
      && ['not-required', 'integrated'].includes(dependency.integrationState || 'not-required');
  });
};
