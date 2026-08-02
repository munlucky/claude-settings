import { createHash } from 'node:crypto';

const canonical = (value) => Array.isArray(value)
  ? value.map(canonical)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]))
    : value;
const json = (value) => JSON.stringify(canonical(value));
const sha256 = (value) => `sha256:${createHash('sha256').update(typeof value === 'string' ? value : json(value)).digest('hex')}`;

export const digestPatch = (patch) => sha256(patch || '');

export const normalizeChangedPaths = (paths = []) => [...new Set(paths.map((path) => String(path).replaceAll('\\', '/').replace(/^\.\//u, '')))].sort();

export const stepResultReceiptDigest = (receipt) => sha256({
  schemaVersion: receipt.schemaVersion,
  runId: receipt.runId,
  waveId: receipt.waveId,
  stepId: receipt.stepId,
  attemptId: receipt.attemptId,
  baseCommitSha: receipt.baseCommitSha,
  baseWorkspaceIdentity: receipt.baseWorkspaceIdentity,
  resultWorkspaceIdentity: receipt.resultWorkspaceIdentity,
  changedPaths: normalizeChangedPaths(receipt.changedPaths),
  resultCommitSha: receipt.resultCommitSha,
  patchDigest: receipt.patchDigest,
  verificationRefs: [...(receipt.verificationRefs || [])].sort(),
  knowledgeObservationRefs: [...(receipt.knowledgeObservationRefs || [])].sort(),
  status: receipt.status,
});

export const buildStepResultReceipt = ({
  run,
  wave,
  step,
  attempt,
  executionWorkspaceId,
  baseCommitSha,
  baseWorkspaceIdentity,
  resultWorkspaceIdentity,
  changedPaths = [],
  resultCommitSha,
  patchDigest,
  verificationRefs = [],
  knowledgeObservationRefs = [],
  status = 'passed',
  receiptId = null,
  now = new Date().toISOString(),
} = {}) => {
  const receipt = {
    schemaVersion: 1,
    receiptId: receiptId || `step-result-${sha256(`${run?.runId}:${wave?.waveId}:${step?.stepId}:${attempt?.id || attempt?.attemptId || 1}`).slice(7, 23)}`,
    runId: run?.runId || wave?.runId,
    waveId: wave?.waveId,
    stepId: step?.stepId,
    attemptId: attempt?.id || attempt?.attemptId || null,
    actorSessionId: attempt?.actorSessionId || null,
    capsuleId: attempt?.capsuleId || attempt?.capsuleDigest || null,
    executionWorkspaceId: executionWorkspaceId || null,
    baseCommitSha: baseCommitSha || wave?.baseCommitSha || null,
    baseWorkspaceIdentity: baseWorkspaceIdentity || wave?.baseWorkspaceIdentity || null,
    resultWorkspaceIdentity: resultWorkspaceIdentity || null,
    changedPaths: normalizeChangedPaths(changedPaths),
    resultCommitSha: resultCommitSha || null,
    patchDigest: patchDigest || null,
    verificationRefs: [...verificationRefs].sort(),
    knowledgeObservationRefs: [...knowledgeObservationRefs].sort(),
    status,
    createdAt: now,
  };
  return { ...receipt, receiptDigest: stepResultReceiptDigest(receipt) };
};

export const validateStepResultReceipt = (receipt, { runId, waveId, stepId, baseCommitSha, allowedPaths = [], forbiddenPaths = [] } = {}) => {
  const errors = [];
  if (!receipt || receipt.schemaVersion !== 1) errors.push('receipt-schema-invalid');
  if (runId && receipt?.runId !== runId) errors.push('receipt-run-mismatch');
  if (waveId && receipt?.waveId !== waveId) errors.push('receipt-wave-mismatch');
  if (stepId && receipt?.stepId !== stepId) errors.push('receipt-step-mismatch');
  if (baseCommitSha && receipt?.baseCommitSha !== baseCommitSha) errors.push('receipt-base-commit-mismatch');
  if (!receipt?.resultCommitSha) errors.push('result-commit-missing');
  if (!receipt?.resultWorkspaceIdentity) errors.push('result-workspace-identity-missing');
  if (!receipt?.patchDigest) errors.push('patch-digest-missing');
  const normalizedAllowed = allowedPaths.map((path) => String(path).replaceAll('\\', '/').toLowerCase());
  const normalizedForbidden = forbiddenPaths.map((path) => String(path).replaceAll('\\', '/').toLowerCase());
  const within = (value, scope) => {
    const root = scope.replace(/\/\*+$/u, '').replace(/\*+$/u, '').replace(/\/$/u, '');
    return value === root || value.startsWith(`${root}/`);
  };
  for (const changedPath of receipt?.changedPaths || []) {
    const normalized = String(changedPath).replaceAll('\\', '/').toLowerCase();
    const insideAllowed = normalizedAllowed.length > 0 && normalizedAllowed.some((scope) => within(normalized, scope));
    const insideForbidden = normalizedForbidden.some((scope) => within(normalized, scope));
    if (!insideAllowed) errors.push(`path-outside-allowed:${changedPath}`);
    if (insideForbidden) errors.push(`path-forbidden:${changedPath}`);
  }
  if (receipt?.receiptDigest && receipt.receiptDigest !== stepResultReceiptDigest(receipt)) errors.push('receipt-digest-mismatch');
  return { valid: errors.length === 0, errors };
};

const dependencyDepth = (step, byId, seen = new Set()) => {
  if (!step || seen.has(step.stepId)) return 0;
  seen.add(step.stepId);
  return Math.max(0, ...(step.dependencyIds || []).map((id) => dependencyDepth(byId.get(id), byId, seen))) + ((step.dependencyIds || []).length ? 1 : 0);
};

export const sortStepResults = (stepResults = [], steps = []) => {
  const byId = new Map(steps.map((step) => [step.stepId, step]));
  return [...stepResults].sort((a, b) => {
    const depth = dependencyDepth(byId.get(a.stepId), byId) - dependencyDepth(byId.get(b.stepId), byId);
    if (depth !== 0) return depth;
    const sequence = (byId.get(a.stepId)?.sequence || 0) - (byId.get(b.stepId)?.sequence || 0);
    return sequence || String(a.stepId).localeCompare(String(b.stepId));
  });
};

export const integrationReceiptDigest = (receipt) => sha256({
  schemaVersion: receipt.schemaVersion,
  runId: receipt.runId,
  waveId: receipt.waveId,
  planRevision: receipt.planRevision,
  baseMutationRevision: receipt.baseMutationRevision,
  resultMutationRevision: receipt.resultMutationRevision,
  baseCommitSha: receipt.baseCommitSha,
  preIntegrationIdentity: receipt.preIntegrationIdentity,
  postIntegrationIdentity: receipt.postIntegrationIdentity,
  deliveryWorkspaceIdentity: receipt.deliveryWorkspaceIdentity,
  stepResults: receipt.stepResults,
  applyOrder: receipt.applyOrder,
  integrationWorkspaceIdentity: receipt.integrationWorkspaceIdentity,
  integrationVerificationRef: receipt.integrationVerificationRef,
  deliveryPatchDigest: receipt.deliveryPatchDigest,
  status: receipt.status,
});

export const buildIntegrationReceipt = ({
  run,
  wave,
  stepResults = [],
  applyOrder = [],
  preIntegrationIdentity,
  postIntegrationIdentity = null,
  deliveryWorkspaceIdentity = null,
  integrationWorkspaceIdentity = null,
  integrationVerificationRef = null,
  deliveryPatchDigest = null,
  resultMutationRevision = null,
  status = 'integrated',
  receiptId = null,
  attempt = 1,
  now = new Date().toISOString(),
} = {}) => {
  const receipt = {
    schemaVersion: 1,
    receiptId: receiptId || `integration-${sha256(`${run?.runId}:${wave?.waveId}:${attempt}`).slice(7, 23)}`,
    runId: run?.runId || wave?.runId,
    waveId: wave?.waveId,
    planRevision: Number(wave?.planRevision ?? run?.planRevision ?? 1),
    baseMutationRevision: Number(wave?.baseMutationRevision ?? run?.mutationRevision ?? 0),
    resultMutationRevision,
    baseCommitSha: wave?.baseCommitSha || null,
    preIntegrationIdentity: preIntegrationIdentity || null,
    postIntegrationIdentity,
    deliveryWorkspaceIdentity,
    stepResults: stepResults.map((step) => ({ stepId: step.stepId, resultCommitSha: step.resultCommitSha, patchDigest: step.patchDigest })),
    applyOrder: [...applyOrder],
    integrationWorkspaceIdentity,
    integrationVerificationRef,
    deliveryPatchDigest,
    status,
    attempt,
    createdAt: now,
  };
  return { ...receipt, receiptDigest: integrationReceiptDigest(receipt) };
};
