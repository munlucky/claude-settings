import { sha256Hex } from './candidate-identity.mjs';

const FORBIDDEN_KEYS = new Set([
  'implementationTranscript',
  'hiddenReasoning',
  'selfEvaluation',
  'chatHistory',
  'conversation',
]);

const scanForbidden = (value, path = []) => {
  if (!value || typeof value !== 'object') return [];
  const violations = [];
  if (Array.isArray(value)) {
    value.forEach((item, index) => violations.push(...scanForbidden(item, [...path, String(index)])));
    return violations;
  }
  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key)) violations.push([...path, key].join('.'));
    violations.push(...scanForbidden(nested, [...path, key]));
  }
  return violations;
};

export const buildReviewBundle = ({
  candidate_id,
  sourceDigest,
  contractRevision,
  freshSessionId,
  spec,
  plan,
  done,
  diff,
  testResults,
} = {}) => {
  const required = { candidate_id, sourceDigest, contractRevision, freshSessionId };
  for (const [key, value] of Object.entries(required)) {
    if (!value) throw new Error(`missing review bundle field: ${key}`);
  }
  const input = { spec, plan, done, diff, testResults };
  const violations = scanForbidden(input);
  if (violations.length > 0) {
    throw new Error(`review bundle contains forbidden context: ${violations.join(', ')}`);
  }
  const bundle = {
    schemaVersion: 1,
    artifactId: 'REVIEW_BUNDLE',
    candidate_id,
    sourceDigest,
    contractRevision,
    freshSessionId,
    input,
  };
  return {
    ...bundle,
    bundleDigest: sha256Hex(bundle),
  };
};

export const classifyFinding = (finding = {}) => {
  const disposition = finding.disposition || 'informational';
  if (!['autofix_safe', 'replan_required', 'human_decision', 'informational'].includes(disposition)) {
    throw new Error(`unknown review finding disposition: ${disposition}`);
  }
  const severity = finding.severity || 'info';
  const blocksFullScore = severity === 'critical' || disposition === 'replan_required' || disposition === 'human_decision';
  return {
    schemaVersion: 1,
    findingId: finding.findingId || finding.id || `finding-${sha256Hex(finding).slice(0, 12)}`,
    severity,
    disposition,
    blocksFullScore,
    summary: finding.summary || '',
  };
};

export const reviewOutcomeEvidence = ({
  runId,
  goalId,
  candidate_id,
  bundleDigest,
  findings = [],
} = {}) => ({
  runtimeEvent: {
    event_type: 'review.completed',
    severity: findings.some((finding) => classifyFinding(finding).blocksFullScore) ? 'warning' : 'info',
    payload: {
      candidate_id,
      bundleDigest,
      findingCount: findings.length,
    },
  },
  evalEvidence: {
    runId,
    goalId,
    plane: 'review',
    status: findings.some((finding) => classifyFinding(finding).blocksFullScore) ? 'failed' : 'passed',
    candidate_id,
    bundleDigest,
  },
});

export const assertAutofixCreatesNewCandidate = ({ beforeCandidateId, afterCandidateId, finding } = {}) => {
  const classified = classifyFinding(finding);
  if (classified.disposition !== 'autofix_safe') return true;
  if (!beforeCandidateId || !afterCandidateId || beforeCandidateId === afterCandidateId) {
    throw new Error('autofix must create a new candidate_id and invalidate stale review evidence');
  }
  return true;
};
