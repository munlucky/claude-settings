// Run finalization (§18, P0-7).
//
// Finalization is deliberately separate from the completion decision:
// completion says "the evidence is accepted", finalization says "the knowledge
// commit and any requested Git closeout actually finished". A run whose
// completion was accepted but whose finalization is partial is NOT done, and
// must stay retryable rather than reporting success.

import { createHash } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import { reviewKnowledgeCandidates } from '../knowledge/candidate-review.mjs';
import { commitProjectKnowledge } from '../knowledge/commit.mjs';
import { executeKernelGitCloseout, isAuthorizedKernelGitCloseoutWorkspace } from '../git/closeout.mjs';
import { normalizeChangedContract } from '../change-contract.mjs';
import { resolveRecordType } from '../knowledge/records.mjs';
import { projectRunState } from '../state-projector.mjs';
import { observeWorkspaceIdentity, observeScopedWorkspaceIdentity } from './workspace-identity.mjs';
import { authoritativeVerificationScope } from './obligation-compiler.mjs';
import { resolveRunArtifactPaths } from '../artifact-paths.mjs';
import { deduplicateKnowledgeCandidates, deriveKnowledgeStatus, extractStructuredKnowledgeCandidates } from '../knowledge/capture.mjs';
import { mkdir } from 'node:fs/promises';
import { atomicWriteText } from '../durable-write.mjs';
import path from 'node:path';

const ALLOWED_CANDIDATE_TYPES = new Set([
  'semantic_fact',
  'architecture_decision',
  'domain_term',
  'component_boundary',
  'api_contract',
  'kg_relation',
  'ontology_constraint',
  'tacit_observation',
  'episodic_observation',
  'tacit_practice',
  'known_failure_pattern',
  'required_verification',
]);

const latestEvidencePack = (store, runId) => {
  const verifications = store.getVerifications(runId);
  const last = verifications[verifications.length - 1];
  return last ? { status: last.status, digest: last.evidenceDigest } : null;
};

const persistReviewReceipt = (store, runId, projectId, candidateCount, reviewResult) => {
  store.recordKnowledgeReviewReceipt(runId, {
    projectId,
    status: reviewResult.status,
    candidateCount,
    verifiedCount: (reviewResult.verifiedCandidates || []).length,
    rejectedCount: (reviewResult.rejectedCandidates || []).length,
    waitingApprovalCount: (reviewResult.needsApprovalCandidates || []).length,
    waitingVerificationCount: (reviewResult.pendingVerificationCandidates || []).length,
    reviewDigest: createHash('sha256').update(JSON.stringify(reviewResult)).digest('hex'),
    receiptJson: reviewResult,
  });
};

export const recordKnowledgeObservations = async ({ store, runtimeHome, runId, observations = [] }) => {
  const run = store.getRun(runId);
  if (!run) throw new Error(`Run ${runId} not found`);
  if (!run.projectId) throw new Error(`Run ${runId} has no projectId`);

  const candidates = [];
  for (const observation of observations) {
    if (!observation || typeof observation !== 'object') continue;
    const proposedType = resolveRecordType(observation.proposedType || observation.type || 'semantic_fact');
    if (!ALLOWED_CANDIDATE_TYPES.has(proposedType)) {
      throw new Error(`INVALID_CANDIDATE_TYPE: ${proposedType} is not an allowed candidate type`);
    }
    const candidateId = observation.candidateId || observation.id || `cand-${runId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    candidates.push({
      candidateId,
      runId,
      projectId: run.projectId,
      proposedType,
      statement: observation.statement || '',
      scope: observation.scope || [],
      sourceRefs: observation.sourceRefs || [],
      evidenceRefs: observation.evidenceRefs || [],
      status: 'pending',
      sourceKind: 'explicit',
      ...observation,
      candidateId,
    });
  }

  const uniqueCandidates = deduplicateKnowledgeCandidates(candidates);
  for (const candidate of uniqueCandidates) {
    store.recordKnowledgeCandidate(candidate.candidateId, runId, {
      projectId: run.projectId,
      proposedType: candidate.proposedType || 'semantic_fact',
      status: 'pending',
      candidateJson: candidate,
    });
  }

  const reviewResult = await reviewKnowledgeCandidates({
    projectId: run.projectId,
    runId,
    stateStore: store,
    candidates: uniqueCandidates,
    evidencePack: latestEvidencePack(store, runId),
    env: { MOON_RELAY_KERNEL_HOME: runtimeHome },
  });

  const allReviewed = [
    ...(reviewResult.verifiedCandidates || []),
    ...(reviewResult.rejectedCandidates || []),
    ...(reviewResult.needsApprovalCandidates || []),
    ...(reviewResult.pendingVerificationCandidates || []),
  ];
  for (const candidate of allReviewed) {
    store.recordKnowledgeCandidate(candidate.candidateId, runId, {
      projectId: run.projectId,
      proposedType: candidate.proposedType || 'semantic_fact',
      status: candidate.status,
      candidateJson: candidate,
    });
  }

  persistReviewReceipt(store, runId, run.projectId, uniqueCandidates.length, reviewResult);
  return { ...reviewResult, submittedCount: uniqueCandidates.length, explicitCount: uniqueCandidates.length };
};

const blockedReceipt = (store, runId, receipt) => {
  if (receipt.knowledgeStatus && typeof store.setKnowledgeStatus === 'function') store.setKnowledgeStatus(runId, receipt.knowledgeStatus);
  store.recordFinalizationReceipt(runId, receipt);
  store.setFinalizationStatus(runId, 'blocked');
  return receipt;
};

const refreshFinalizationWorkspaceIdentity = ({ store, runId, projectRoot, priorGitReceipt }) => {
  if (!projectRoot || typeof store.getRun !== 'function' || typeof store.observeWorkspaceIdentity !== 'function') {
    return store.getRun(runId);
  }

  const run = store.getRun(runId);
  const observation = observeWorkspaceIdentity({ projectRoot });
  const authorizedCloseoutRetry = ['commit_created', 'push_failed', 'parity_failed'].includes(priorGitReceipt?.status)
    && isAuthorizedKernelGitCloseoutWorkspace({ repoRoot: projectRoot, commitSha: priorGitReceipt?.commitSha || null });

  // The HEAD change made by a Kernel commit whose push/parity stage failed is
  // an expected retry boundary.  Preserve the evidence identity for that
  // exact clean HEAD; every other direct Git/index/workspace mutation advances
  // the mutation revision and makes the old proof fail closed.
  if (run?.currentWorkspaceIdentity
    && observation.identity !== run.currentWorkspaceIdentity
    && !authorizedCloseoutRetry) {
    store.observeWorkspaceIdentity(runId, observation.identity);
  } else if (!run?.currentWorkspaceIdentity) {
    store.observeWorkspaceIdentity(runId, observation.identity);
  }
  return store.getRun(runId);
};

const buildVerificationScopeIdentities = ({ store, runId, projectRoot }) => {
  const identities = {};
  for (const obligation of store.getRunObligations(runId)) {
    const authority = authoritativeVerificationScope(obligation);
    if (!authority) continue;
    identities[obligation.obligationId] = observeScopedWorkspaceIdentity({
      projectRoot,
      scopes: authority.scope,
    });
  }
  return identities;
};

export const finalizeRun = async ({
  store,
  runtimeHome,
  projectRoot,
  runId,
  gitCloseoutRequest = null,
  changedPaths = [],
  changedFileCount = null,
  knowledgeObservations = [],
  structuredSignals = {},
  approvals = [],
  verificationScopeIdentities = null,
}) => {
  let run = store.getRun(runId);
  if (!run) throw new Error(`Run ${runId} not found`);

  // A Git closeout that was requested once stays requested across finalization
  // retries; otherwise omitting it on the next report would silently turn a
  // failed closeout into a clean completion (P0-7).
  //
  // Restoring the request alone is not enough: without the selected paths the
  // retry stages nothing and the closeout reports `skipped`, and without the
  // SHA of a commit that was already created a failed push is never retried.
  // Both are recovered here so a retry resumes where the failure happened.
  const priorReceipt = store.getFinalizationReceipt(runId)?.receiptJson;
  const priorGitReceipt = store.getGitCloseoutReceipt(runId);
  const evaluateCompletion = () => store.evaluateCompletion(runId, {
    verificationScopeIdentities: verificationScopeIdentities || buildVerificationScopeIdentities({ store, runId, projectRoot }),
  });
  run = refreshFinalizationWorkspaceIdentity({ store, runId, projectRoot, priorGitReceipt });
  const normalizedChangeSet = normalizeChangedContract({
    changedPaths: changedPaths.length > 0 ? changedPaths : (priorReceipt?.changedPaths || []),
    changedFileCount,
  });

  const requestedCloseout = gitCloseoutRequest || priorReceipt?.gitCloseoutRequest || null;
  const unfinishedCommitSha = priorGitReceipt && priorGitReceipt.status !== 'completed' ? priorGitReceipt.commitSha : null;
  const effectiveCloseoutRequest = requestedCloseout && unfinishedCommitSha
    ? { ...requestedCloseout, existingCommitSha: requestedCloseout.existingCommitSha || unfinishedCommitSha }
    : requestedCloseout;

  for (const approval of Array.isArray(approvals) ? approvals : []) {
    if (approval?.candidateId && approval.approvedBy && approval.approvalReceipt) {
      store.recordKnowledgeApproval(`app-${randomUUID()}`, {
        runId,
        candidateId: approval.candidateId,
        approvedBy: approval.approvedBy,
        approvalReceipt: approval.approvalReceipt,
      });
    }
  }

  // Step 1: observation review BEFORE completion assessment.
  let reviewResult = { status: 'no_candidates', verifiedCandidates: [], rejectedCandidates: [], needsApprovalCandidates: [], pendingVerificationCandidates: [] };
  const explicitCandidates = Array.isArray(knowledgeObservations) && knowledgeObservations.length > 0
    ? knowledgeObservations.map((observation) => ({ ...observation, sourceKind: 'explicit' }))
    : [];
  const autoCandidates = extractStructuredKnowledgeCandidates({
    run,
    signals: structuredSignals,
    priorRunSignals: typeof store.getProjectRunSignals === 'function'
      ? store.getProjectRunSignals(run.projectId, { excludeRunId: runId })
      : [],
  });
  const submittedCandidates = deduplicateKnowledgeCandidates([
    ...explicitCandidates.map((candidate, index) => ({
      ...candidate,
      candidateId: candidate.candidateId || candidate.id || `cand-explicit-${runId}-${index + 1}`,
      runId,
      projectId: run.projectId,
    })),
    ...autoCandidates,
  ]);
  const dbCandidates = store.getKnowledgeCandidates(runId).map((candidate) => candidate.candidateJson);
  const candidatesForReview = submittedCandidates.length > 0 ? submittedCandidates : dbCandidates;
  const candidateCount = candidatesForReview.length;
  if (candidatesForReview.length > 0) {
    for (const candidate of submittedCandidates) {
      store.recordKnowledgeCandidate(candidate.candidateId, runId, {
        projectId: run.projectId,
        proposedType: candidate.proposedType || 'semantic_fact',
        status: 'pending',
        candidateJson: candidate,
      });
    }
    reviewResult = await reviewKnowledgeCandidates({
      projectId: run.projectId,
      runId,
      stateStore: store,
      candidates: candidatesForReview,
      evidencePack: latestEvidencePack(store, runId),
      env: { MOON_RELAY_KERNEL_HOME: runtimeHome },
    });
    persistReviewReceipt(store, runId, run.projectId, candidatesForReview.length, reviewResult);
    const allReviewed = [
      ...(reviewResult.verifiedCandidates || []),
      ...(reviewResult.rejectedCandidates || []),
      ...(reviewResult.needsApprovalCandidates || []),
      ...(reviewResult.pendingVerificationCandidates || []),
    ];
    for (const candidate of allReviewed) {
      store.recordKnowledgeCandidate(candidate.candidateId, runId, {
        projectId: run.projectId,
        proposedType: candidate.proposedType || 'semantic_fact',
        status: candidate.status,
        candidateJson: candidate,
      });
    }
  } else {
    persistReviewReceipt(store, runId, run.projectId, 0, reviewResult);
  }

  if (!['passed', 'no_candidates'].includes(reviewResult.status)) {
    return blockedReceipt(store, runId, {
      schemaVersion: 1,
      runId,
      projectId: run.projectId,
      completionStatus: 'blocked',
      knowledgeStatus: 'blocked',
      projectionStatus: 'none',
      gitCloseoutStatus: 'skipped',
      finalizationStatus: `blocked_${reviewResult.status}`,
      reviewResult,
      reason: `knowledge_review_${reviewResult.status}`,
    });
  }

  // Step 2: pre-flight completion gates BEFORE closing and on every retry.
  // CLOSE is terminal, so both a legacy proof row and a payload with
  // `verifications: []` must be rechecked here instead of inheriting an old
  // accepted decision around incomplete evidence.
  run = refreshFinalizationWorkspaceIdentity({ store, runId, projectRoot, priorGitReceipt });
  const preflight = evaluateCompletion();
  if (!preflight.readyExceptClose) {
    return blockedReceipt(store, runId, {
      schemaVersion: 1,
      runId,
      projectId: run.projectId,
      completionStatus: 'blocked',
      knowledgeStatus: 'skipped',
      projectionStatus: 'none',
      gitCloseoutStatus: 'skipped',
      finalizationStatus: 'incomplete_gates',
      completionResult: preflight,
      reviewResult,
      reason: 'completion_gates_unmet',
      unmetGates: Object.entries(preflight.gates).filter(([key, value]) => key !== 'isClosed' && !value).map(([key]) => key),
    });
  }
  if (run.state !== 'CLOSE' && run.status !== 'completed') {
    store.transition(runId, 'CLOSE');
  }

  // Step 3: assess & persist completion authority. A run that already reached
  // an accepted decision keeps it; this pass is a finalization retry, not a
  // re-judgement of evidence that is now historical (P0-7).
  const existingDecision = store.getCompletionDecision(runId);
  const isFinalizationRetry = existingDecision?.decision === 'accepted' && run.status === 'completed';
  const completionEval = isFinalizationRetry
    ? { ...evaluateCompletion(), decision: 'accepted', digest: existingDecision.evidenceDigest, decisionPayload: existingDecision.decisionJson }
    : evaluateCompletion();
  if (!isFinalizationRetry) store.persistCompletionDecision(runId, completionEval);

  if (completionEval.decision !== 'accepted') {
    return blockedReceipt(store, runId, {
      schemaVersion: 1,
      runId,
      projectId: run.projectId,
      completionStatus: completionEval.decision,
      knowledgeStatus: 'blocked',
      projectionStatus: 'none',
      gitCloseoutStatus: 'skipped',
      finalizationStatus: 'blocked_completion',
      completionResult: completionEval,
      reviewResult,
      reason: 'completion_not_accepted',
    });
  }

  // Step 4: transactional knowledge commit.
  let knowledgeCaptureStatus = deriveKnowledgeStatus({
    explicitCount: explicitCandidates.length,
    autoCount: autoCandidates.length,
    rejectedCount: reviewResult.rejectedCandidates?.length || 0,
    pendingVerificationCount: reviewResult.pendingVerificationCandidates?.length || 0,
    pendingApprovalCount: reviewResult.needsApprovalCandidates?.length || 0,
  });
  let knowledgeStatus = 'skipped';
  let commitReceipt = null;
  let knowledgeCommitError = null;
  let knowledgeCommitAttempts = 1;
  const priorCommit = store.getKnowledgeCommitReceipt(runId);
  if (priorCommit && ['committed', 'no_change'].includes(priorCommit.status)) {
    // Already committed on an earlier attempt; re-running it would fail the
    // revision CAS and mask the step that actually failed.
    commitReceipt = priorCommit.receiptJson;
    knowledgeStatus = priorCommit.status;
    knowledgeCaptureStatus = priorCommit.status === 'committed' ? 'knowledge_committed' : 'no_new_knowledge';
  } else {
    const MAX_CAS_RETRIES = 3;
    let currentExpectedRevision = run.knowledgeRevisionStart;
    for (let attempt = 1; attempt <= MAX_CAS_RETRIES; attempt++) {
      knowledgeCommitAttempts = attempt;
      try {
        commitReceipt = await commitProjectKnowledge({
          runId,
          projectId: run.projectId,
          stateStore: store,
          expectedKnowledgeRevision: currentExpectedRevision,
          env: { MOON_RELAY_KERNEL_HOME: runtimeHome },
        });
        knowledgeStatus = commitReceipt.status || 'committed';
        knowledgeCaptureStatus = knowledgeStatus === 'committed' ? 'knowledge_committed' : 'no_new_knowledge';
        break;
      } catch (error) {
        if (error.code === 'STALE_KNOWLEDGE_REVISION' && attempt < MAX_CAS_RETRIES) {
          const latestRev = store.getProjectKnowledgeRevision
            ? String(store.getProjectKnowledgeRevision(run.projectId))
            : null;
          if (latestRev && latestRev !== currentExpectedRevision) {
            currentExpectedRevision = latestRev;
            continue;
          }
        }
        knowledgeStatus = error.code === 'STALE_KNOWLEDGE_REVISION' ? 'deferred' : 'failed';
        knowledgeCommitError = error.message;
        knowledgeCaptureStatus = knowledgeStatus === 'deferred' ? 'knowledge_deferred' : 'no_new_knowledge';
        if (knowledgeStatus === 'deferred') {
          commitReceipt = {
            schemaVersion: 1,
            runId,
            projectId: run.projectId,
            status: 'deferred',
            reason: 'cas_retry_exhausted',
            attempts: knowledgeCommitAttempts,
            error: knowledgeCommitError,
            deferredAt: new Date().toISOString(),
          };
          store.recordKnowledgeCommitReceipt(runId, {
            projectId: run.projectId,
            revisionBefore: String(run.knowledgeRevisionStart || '0'),
            revisionAfter: String(currentExpectedRevision || run.knowledgeRevisionStart || '0'),
            status: 'deferred',
            receiptJson: commitReceipt,
          });
        }
        break;
      }
    }
  }

  // A closeout retry is allowed to proceed only if the workspace is still the
  // exact Kernel-created commit state.  A direct Git/index/workspace mutation
  // after the completion decision changes the mutation revision, so the
  // second completion check below blocks before Git can be trusted.
  run = refreshFinalizationWorkspaceIdentity({ store, runId, projectRoot, priorGitReceipt });
  const closeoutPreflight = evaluateCompletion();
  if (!closeoutPreflight.readyExceptClose) {
    return blockedReceipt(store, runId, {
      schemaVersion: 1,
      runId,
      projectId: run.projectId,
      completionStatus: 'blocked',
      knowledgeStatus,
      projectionStatus: commitReceipt?.projectionStatus || 'none',
      gitCloseoutStatus: 'skipped',
      finalizationStatus: 'incomplete_gates',
      completionResult: closeoutPreflight,
      reviewResult,
      knowledgeCommitReceipt: commitReceipt,
      reason: 'workspace_identity_changed_before_git_closeout',
      unmetGates: Object.entries(closeoutPreflight.gates)
        .filter(([key, value]) => key !== 'isClosed' && !value)
        .map(([key]) => key),
    });
  }

  // Step 5: Git closeout.
  let gitCloseoutStatus = 'skipped';
  let gitReceipt = null;
  let gitCloseoutError = null;
  if (effectiveCloseoutRequest?.requested) {
    const knowledgeCommitReceipt = store.getKnowledgeCommitReceipt(runId)?.receiptJson;
    if (!knowledgeCommitReceipt && knowledgeStatus !== 'deferred') {
      gitCloseoutStatus = 'failed';
      gitCloseoutError = 'KNOWLEDGE_RECEIPT_REQUIRED: Explicit Git closeout requires knowledge commit receipt';
    } else {
      try {
        gitReceipt = await executeKernelGitCloseout({
          runId,
          projectId: run.projectId,
          stateStore: store,
          repoRoot: projectRoot,
          gitCloseoutRequest: effectiveCloseoutRequest,
          knowledgeCommitReceipt: knowledgeCommitReceipt || { status: 'deferred' },
          changedFiles: normalizedChangeSet.changedPaths,
        });
        gitCloseoutStatus = gitReceipt.status || 'completed';
      } catch (error) {
        gitCloseoutStatus = 'failed';
        gitCloseoutError = error.message;
      }
    }
  }

  // Step 6: finalization receipt. A failure in either step keeps the run in
  // `partial`, which is what stops it being reported as done. A closeout that
  // was *requested* must actually complete: anything else — failed, skipped
  // because nothing was staged, parity mismatch — leaves work the caller asked
  // for unfinished, so it is partial rather than done.
  const requestedCloseoutUnfinished = Boolean(effectiveCloseoutRequest?.requested) && gitCloseoutStatus !== 'completed';
  const finalizationStatus = (knowledgeStatus === 'failed' || gitCloseoutStatus === 'failed' || requestedCloseoutUnfinished || commitReceipt?.projectionStatus === 'failed')
    ? 'partial'
    : 'completed';

  const knowledgeWarning = run.mutationRevision > 0 && candidateCount === 0
    ? {
      code: 'MUTATION_WITHOUT_KNOWLEDGE_CANDIDATE',
      reason: 'mutation_completed_without_explicit_or_structured_knowledge_candidate',
      mutationRevision: run.mutationRevision,
      candidateCount,
    }
    : null;
  const finalizationReceipt = {
    schemaVersion: 1,
    runId,
    projectId: run.projectId,
    completionStatus: completionEval.decision,
    knowledgeStatus,
    knowledgeCaptureStatus,
    knowledgeCommitAttempts,
    knowledgeWarning: Boolean(knowledgeWarning),
    knowledgeWarningReason: knowledgeWarning?.reason || null,
    knowledgeWarningDetail: knowledgeWarning,
    knowledgeCapture: {
      candidateCount,
      explicitCount: explicitCandidates.length,
      autoCount: autoCandidates.length,
      status: knowledgeCaptureStatus,
      warning: knowledgeWarning,
    },
    projectionStatus: commitReceipt?.projectionStatus || 'completed',
    gitCloseoutStatus,
    finalizationStatus,
    completionResult: completionEval,
    reviewResult,
    gitCloseoutRequest: effectiveCloseoutRequest,
    changedPaths: normalizedChangeSet.changedPaths,
    knowledgeCommitReceipt: commitReceipt,
    knowledgeCommitError,
    gitCloseoutReceipt: gitReceipt,
    gitCloseoutError,
  };

  store.recordFinalizationReceipt(runId, finalizationReceipt);
  if (typeof store.setKnowledgeStatus === 'function') store.setKnowledgeStatus(runId, knowledgeStatus);
  store.setFinalizationStatus(runId, finalizationStatus);
  if (run.projectId) {
    const dir = resolveRunArtifactPaths({ runtimeHome, projectId: run.projectId, runId }).finalization;
    await mkdir(dir, { recursive: true });
    const target = path.join(dir, 'receipt.json');
    await atomicWriteText(target, JSON.stringify(finalizationReceipt, null, 2));
  }
  await projectRunState(store.getRun(runId), { runtimeHome });

  return finalizationReceipt;
};
