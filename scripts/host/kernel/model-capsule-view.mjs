// Model capsule view (Wave 3). The persisted Execution Capsule carries the
// provenance the Kernel needs to prove what happened: digests, admission ids,
// mutation revisions, workspace identity. None of that helps the model do the
// work, and all of it changes every turn — so shipping the persisted capsule to
// a provider both leaks control metadata and guarantees a cache miss.
//
// The view is a projection: whatever the capsule gains later, only the fields
// listed here ever reach a provider.

const list = (value) => Object.freeze(Array.isArray(value) ? [...value] : []);

export const MODEL_VISIBLE_CAPSULE_FIELDS = Object.freeze([
  'role', 'objective', 'acceptance', 'constraints', 'nonGoals',
  'workUnit', 'repositoryContext', 'verification', 'permissions',
]);

// Present in the persisted capsule, never in the view.
export const CONTROL_ONLY_CAPSULE_FIELDS = Object.freeze([
  'capsuleId', 'stepId', 'runId', 'routeDecisionId', 'admissionId', 'mutationRevision',
  'workspaceIdentity', 'provenance', 'capsuleDigest', 'createdAt', 'observedAt', 'leaseId',
]);

export const buildModelCapsuleView = (capsule = {}, { role = null } = {}) => {
  const workUnit = capsule.workUnit || {};
  const repositoryContext = capsule.repositoryContext || {};
  const verification = capsule.verification || {};
  return Object.freeze({
    role: role || capsule.role || null,
    objective: capsule.objective || '',
    acceptance: list(capsule.acceptance),
    constraints: list(capsule.constraints),
    nonGoals: list(capsule.nonGoals),
    workUnit: Object.freeze({
      objective: workUnit.objective || capsule.objective || '',
      dependencies: list(workUnit.dependencies),
      allowedPaths: list(workUnit.allowedPaths),
      forbiddenPaths: list(workUnit.forbiddenPaths),
      expectedOutputs: list(workUnit.expectedOutputs),
    }),
    repositoryContext: Object.freeze({
      projectMode: repositoryContext.projectMode || null,
      entrypoints: list(repositoryContext.entrypoints),
      relevantFiles: list(repositoryContext.relevantFiles),
      relevantSymbols: list(repositoryContext.relevantSymbols),
      manifests: list(repositoryContext.manifests),
      knownCommands: list(repositoryContext.knownCommands),
      architectureRecords: list(repositoryContext.architectureRecords),
      knowledgeRecords: list(repositoryContext.knowledgeRecords),
      knownFailurePatterns: list(repositoryContext.knownFailurePatterns),
      baseline: repositoryContext.baseline || null,
    }),
    verification: Object.freeze({ obligations: list(verification.obligations) }),
    permissions: capsule.permissions || null,
  });
};

// Used by the envelope tests: proves the projection dropped everything the
// model must not see, rather than trusting that it was never added.
export const findControlMetadataLeaks = (view) => {
  const seen = new Set();
  const walk = (value) => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) { value.forEach(walk); return; }
    for (const [key, child] of Object.entries(value)) {
      if (CONTROL_ONLY_CAPSULE_FIELDS.includes(key)) seen.add(key);
      walk(child);
    }
  };
  walk(view);
  return [...seen].sort();
};
