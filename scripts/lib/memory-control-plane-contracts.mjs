const STAGES = new Set([
  'init',
  'requirements',
  'design',
  'plan',
  'validate-plan',
  'prepare',
  'execute',
  'review',
  'verify',
  'score',
  'replan',
  'close',
  'intake',
  'finish',
]);

const PROMPT_UNSAFE_PATTERNS = [
  /sk-[A-Za-z0-9_-]{6,}/,
  /ghp_[A-Za-z0-9_]{6,}/,
  /BEGIN PRIVATE KEY/,
  /password\s*=\s*[^,\s;]+/i,
  /"?nodes"?\s*:\s*\[[\s\S]*"?relationships"?\s*:\s*\[/i,
  /(@prefix|owl:|rdf:|rdfs:|sh:NodeShape|sh:property)/i,
];

const hasText = (value) => typeof value === 'string' && value.trim().length > 0;
const asArray = (value) => Array.isArray(value) ? value : [];
const hasSha256 = (value) => /^[a-f0-9]{64}$/i.test(String(value || ''));

function result(violations) {
  return {
    ok: violations.length === 0,
    violations,
  };
}

function promptUnsafe(value) {
  const text = String(value || '');
  return PROMPT_UNSAFE_PATTERNS.some((pattern) => pattern.test(text));
}

export function validateMemoryClaim(claim = {}) {
  const violations = [];
  if (claim.schemaVersion !== 1) violations.push('schemaVersion must be 1');
  if (!hasText(claim.claimId)) violations.push('claimId is required');
  if (!['candidate', 'verified', 'rejected', 'superseded', 'rolled_back'].includes(claim.status)) violations.push('status is invalid');
  if (!['run', 'project', 'harness', 'global'].includes(claim.scope)) violations.push('scope is invalid');
  if (!STAGES.has(claim.stage)) violations.push('stage is invalid');
  if (!hasText(claim.claim)) violations.push('claim text is required');
  if (!['candidate', 'verified', 'rejected', 'stale'].includes(claim.confidence)) violations.push('confidence is invalid');
  if (!['public', 'internal', 'secret_like', 'unknown'].includes(claim.sensitivity)) violations.push('sensitivity is invalid');
  if (claim.sensitivity === 'secret_like' || promptUnsafe(claim.claim)) violations.push('secret-like or raw memory text cannot become a memory claim');

  const provenance = claim.provenance || {};
  const hasProvenance = hasText(provenance.sourceRef) || hasText(provenance.sourceCommand);
  if (!hasProvenance) violations.push('memory claim requires sourceRef or sourceCommand');

  const evidence = asArray(claim.evidence);
  if (['candidate', 'verified'].includes(claim.status) && evidence.length === 0) {
    violations.push('candidate or verified memory claim requires evidence');
  }
  if (['candidate', 'verified'].includes(claim.status) && !hasSha256(provenance.artifactSha256)) {
    violations.push('candidate or verified memory claim requires artifactSha256');
  }
  if (claim.confidence === 'verified' && claim.status !== 'verified') violations.push('verified confidence requires verified status');
  if (claim.status === 'verified' && claim.confidence !== 'verified') violations.push('verified status requires verified confidence');

  const validity = claim.validity || {};
  if (!hasText(validity.validFrom)) violations.push('validity.validFrom is required');
  if ((claim.status === 'superseded' || claim.status === 'rolled_back') && asArray(validity.supersedes).length === 0) {
    violations.push('superseded or rolled_back claim requires supersedes reference');
  }

  return result(violations);
}

export function validateEpisodeLedgerRecord(record = {}) {
  const violations = [];
  if (record.schemaVersion !== 1) violations.push('schemaVersion must be 1');
  for (const field of ['episodeId', 'runId', 'stage', 'eventType', 'timestamp', 'sourceRef']) {
    if (!hasText(record[field])) violations.push(`${field} is required`);
  }
  if (record.promptSafe !== true && record.promptSafe !== false) violations.push('promptSafe boolean is required');
  if (record.promptSafe && (promptUnsafe(record.summary) || promptUnsafe(record.rawRef))) {
    violations.push('prompt-safe episode projection contains unsafe raw content');
  }
  if (!record.promptSafe && asArray(record.omittedReasons).length === 0) {
    violations.push('prompt-unsafe episode requires omittedReasons');
  }
  return result(violations);
}

export function validateTaskEvidenceGraph(graph = {}) {
  const violations = [];
  if (graph.schemaVersion !== 1) violations.push('schemaVersion must be 1');
  const nodes = asArray(graph.nodes);
  const edges = asArray(graph.edges);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const outgoing = (id, type) => edges.filter((edge) => edge.from === id && (!type || edge.type === type));
  const incoming = (id, type) => edges.filter((edge) => edge.to === id && (!type || edge.type === type));
  const allowedEdgePairs = new Map([
    ['VERIFIED_BY', [['Requirement', 'AcceptanceCriterion']]],
    ['DERIVED_FROM', [
      ['TestResult', 'CommandRun'],
      ['CommandRun', 'TestResult'],
      ['MemoryFact', 'Artifact'],
      ['Artifact', 'MemoryFact'],
      ['MemoryFact', 'CommandRun'],
      ['CommandRun', 'MemoryFact'],
      ['MemoryFact', 'TestResult'],
      ['TestResult', 'MemoryFact'],
      ['MemoryFact', 'ReviewFinding'],
      ['ReviewFinding', 'MemoryFact'],
      ['MemoryFact', 'VerificationResult'],
      ['VerificationResult', 'MemoryFact'],
    ]],
  ]);
  const edgeConnectsType = (nodeId, edgeType, targetTypes) => edges.some((edge) => {
    if (edge.type !== edgeType) return false;
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    if (edge.from === nodeId) return targetTypes.includes(to?.type);
    if (edge.to === nodeId) return targetTypes.includes(from?.type);
    return false;
  });

  for (const node of nodes) {
    if (!hasText(node.id)) violations.push('node id is required');
    if (!hasText(node.type)) violations.push(`node ${node.id || '<missing>'} type is required`);
    if (node.type === 'Requirement' && !edgeConnectsType(node.id, 'VERIFIED_BY', ['AcceptanceCriterion']) && !hasText(node.blocker)) {
      violations.push(`Requirement ${node.id} requires AcceptanceCriterion edge or blocker`);
    }
    if (node.type === 'TestResult' && !edgeConnectsType(node.id, 'DERIVED_FROM', ['CommandRun'])) {
      violations.push(`TestResult ${node.id} requires CommandRun provenance`);
    }
    if (node.type === 'MemoryFact' && node.status === 'verified' && !edgeConnectsType(node.id, 'DERIVED_FROM', ['Artifact', 'CommandRun', 'TestResult', 'ReviewFinding', 'VerificationResult'])) {
      violations.push(`MemoryFact ${node.id} requires evidence provenance`);
    }
    if (node.type === 'MemoryFact' && (node.stale || node.status === 'superseded') && !hasText(node.validTo) && asArray(node.supersedes).length === 0) {
      violations.push(`stale MemoryFact ${node.id} requires validTo or supersedes`);
    }
  }

  for (const edge of edges) {
    if (!byId.has(edge.from)) violations.push(`edge from unknown node ${edge.from}`);
    if (!byId.has(edge.to)) violations.push(`edge to unknown node ${edge.to}`);
    const allowedPairs = allowedEdgePairs.get(edge.type);
    if (!allowedPairs || !byId.has(edge.from) || !byId.has(edge.to)) continue;
    const fromType = byId.get(edge.from)?.type;
    const toType = byId.get(edge.to)?.type;
    const allowed = allowedPairs.some(([allowedFrom, allowedTo]) => allowedFrom === fromType && allowedTo === toType);
    if (!allowed) violations.push(`edge ${edge.type} from ${fromType || 'unknown'} to ${toType || 'unknown'} is not allowed`);
  }

  return result(violations);
}

export function buildMemoryGateResult({
  claims = [],
  unauthorizedMemoryAccess = 0,
  piiPolicyViolations = 0,
} = {}) {
  const findings = [];
  let verifiedCount = 0;
  let verifiedWithEvidence = 0;
  let staleMemoryErrorCount = 0;
  let candidateAsFactViolations = 0;

  for (const claim of claims) {
    if (claim.status === 'verified') {
      verifiedCount += 1;
      if (asArray(claim.evidence).length > 0) verifiedWithEvidence += 1;
    }
    if (claim.confidence === 'stale' || claim.status === 'superseded') staleMemoryErrorCount += 1;
    if (claim.status === 'candidate' && claim.renderedAsSemanticFact) candidateAsFactViolations += 1;
    const validation = validateMemoryClaim(claim);
    findings.push(...validation.violations.map((violation) => `${claim.claimId || 'claim'}: ${violation}`));
  }

  const provenanceCoverage = verifiedCount === 0 ? 1 : verifiedWithEvidence / verifiedCount;
  const failed = findings.length > 0
    || provenanceCoverage < 1
    || staleMemoryErrorCount > 0
    || unauthorizedMemoryAccess > 0
    || candidateAsFactViolations > 0
    || piiPolicyViolations > 0;

  return {
    schemaVersion: 1,
    status: failed ? 'failed' : 'passed',
    provenanceCoverage,
    staleMemoryErrorCount,
    unauthorizedMemoryAccess,
    candidateAsFactViolations,
    piiPolicyViolations,
    findings,
  };
}

export function validateFailureMemoryCandidate(candidate = {}) {
  const violations = [];
  if (candidate.schemaVersion !== 1) violations.push('schemaVersion must be 1');
  for (const field of ['candidateId', 'status', 'failureClass', 'sourceCommand', 'attemptedFix', 'replanDelta']) {
    if (!hasText(candidate[field])) violations.push(`${field} is required`);
  }
  if (!['candidate', 'ready_for_review', 'rejected', 'promoted', 'superseded'].includes(candidate.status)) violations.push('status is invalid');
  if (asArray(candidate.evidenceRefs).length === 0) violations.push('evidenceRefs are required');
  if (candidate.status === 'promoted') {
    const gate = candidate.promotionGate || {};
    const complete = gate.requiresEvidence === true
      && gate.requiresReview === true
      && gate.requiresReplay === true
      && gate.requiresRollbackPlan === true
      && gate.requiresScopeOwner === true;
    if (!complete) violations.push('promoted failure memory requires full promotion gate');
  }
  return result(violations);
}

export function evaluateFailureReplan(history = []) {
  const violations = [];
  const seen = new Map();
  for (const attempt of asArray(history)) {
    const failureClass = String(attempt.failureClass || '');
    if (!failureClass) continue;
    if (seen.has(failureClass) && attempt.changedApproach !== true) {
      violations.push(`repeated failure class ${failureClass} requires changed approach`);
    }
    seen.set(failureClass, attempt);
  }
  return {
    ok: violations.length === 0,
    status: violations.length === 0 ? 'passed' : 'blocked',
    violations,
  };
}
