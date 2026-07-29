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
  'changedPaths', 'verificationEvidence', 'reviewScope',
]);

// Present in the persisted capsule, never in the view.
export const CONTROL_ONLY_CAPSULE_FIELDS = Object.freeze([
  'capsuleId', 'stepId', 'runId', 'routeDecisionId', 'admissionId', 'mutationRevision',
  'workspaceIdentity', 'provenance', 'capsuleDigest', 'createdAt', 'observedAt', 'leaseId',
]);

// A reviewer capsule (buildReviewCapsule) never has workUnit/repositoryContext/
// verification at all — "no implementer reasoning, no project knowledge, no
// write permission" is enforced by the persisted shape itself. Fabricating an
// empty workUnit/repositoryContext/verification for it here would hand a
// reviewer session an implementer-shaped object it was never meant to see, so
// each of these three is included only when the source capsule actually has it.
export const buildModelCapsuleView = (capsule = {}, { role = null } = {}) => {
  const view = {
    role: role || capsule.role || null,
    objective: capsule.objective || '',
    acceptance: list(capsule.acceptance),
    constraints: list(capsule.constraints),
    nonGoals: list(capsule.nonGoals),
    permissions: capsule.permissions ?? null,
  };
  if (capsule.workUnit) {
    const workUnit = capsule.workUnit;
    view.workUnit = Object.freeze({
      objective: workUnit.objective || capsule.objective || '',
      dependencies: list(workUnit.dependencies),
      allowedPaths: list(workUnit.allowedPaths),
      forbiddenPaths: list(workUnit.forbiddenPaths),
      expectedOutputs: list(workUnit.expectedOutputs),
    });
  }
  if (capsule.repositoryContext) {
    const repositoryContext = capsule.repositoryContext;
    view.repositoryContext = Object.freeze({
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
      // A greenfield run has no repository seam to relevantFiles/entrypoints
      // yet — buildCapsule() puts the generated vertical-slice plan here
      // instead. Omitting it left a greenfield worker with no starting plan
      // at all once live dispatch switched to this projected capsule.
      walkingSkeleton: repositoryContext.walkingSkeleton || null,
    });
  }
  if (capsule.verification) {
    view.verification = Object.freeze({ obligations: list(capsule.verification.obligations) });
  }
  // A review capsule (buildReviewCapsule) has no workUnit/repositoryContext/
  // verification at all; its own content lives in subject/verificationEvidence/
  // reviewScope instead. Without projecting those, a reviewer turn's launcher
  // received an empty capsule and had nothing to judge.
  if (capsule.subject) {
    // subject.workspaceIdentity/mutationRevision/diffDigest are provenance —
    // the same digests CONTROL_ONLY_CAPSULE_FIELDS already excludes at the
    // top level — so only changedPaths, the content the reviewer actually
    // reads, crosses into the view.
    view.changedPaths = list(capsule.subject.changedPaths);
  }
  if (capsule.verificationEvidence) {
    view.verificationEvidence = list(capsule.verificationEvidence);
  }
  if (capsule.reviewScope) {
    view.reviewScope = Object.freeze({
      stage: capsule.reviewScope.stage || null,
      requiredChecks: list(capsule.reviewScope.requiredChecks),
      obligationId: capsule.reviewScope.obligationId || null,
    });
  }
  // implementationReceipt (actorSessionId, capsuleDigest, modelClass,
  // resolvedModel) is deliberately never projected: every field that is not
  // itself a raw session/capsule digest duplicates data the Kernel already
  // binds server-side when it records the review, and the two digest fields
  // are exactly the provenance shape this view exists to keep out of a
  // cacheable prompt.
  return Object.freeze(view);
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
