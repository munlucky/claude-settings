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
import { executeKernelGitCloseout } from '../git/closeout.mjs';
import { normalizeChangedContract } from '../change-contract.mjs';
import { resolveRecordType } from '../knowledge/records.mjs';
import { projectRunState } from '../state-projector.mjs';
import { resolveRunArtifactPaths } from '../artifact-paths.mjs';
import { mkdir, writeFile, rename } from 'node:fs/promises';
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
      ...observation,
      candidateId,
    });
  }

  const reviewResult = await reviewKnowledgeCandidates({
    projectId: run.projectId,
    runId,
    stateStore: store,
    candidates,
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

  persistReviewReceipt(store, runId, run.projectId, candidates.length, reviewResult);
  return reviewResult;
};

const blockedReceipt = (store, runId, receipt) => {
  store.recordFinalizationReceipt(runId, receipt);
  store.setFinalizationStatus(runId, 'blocked');
  return receipt;
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
  approvals = [],
}) => {
  const run = store.getRun(runId);
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
  let reviewResult = { status: 'no_candidates', verifiedCandidates: [], rejectedCandidates: [] };
  if (Array.isArray(knowledgeObservations) && knowledgeObservations.length > 0) {
    reviewResult = await recordKnowledgeObservations({ store, runtimeHome, runId, observations: knowledgeObservations });
  } else {
    const dbCandidates = store.getKnowledgeCandidates(runId).map((candidate) => candidate.candidateJson);
    if (dbCandidates.length > 0) {
      reviewResult = await reviewKnowledgeCandidates({
        projectId: run.projectId,
        runId,
        stateStore: store,
        candidates: dbCandidates,
        evidencePack: latestEvidencePack(store, runId),
        env: { MOON_RELAY_KERNEL_HOME: runtimeHome },
      });
      persistReviewReceipt(store, runId, run.projectId, dbCandidates.length, reviewResult);
    }
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

  // Step 2: pre-flight completion gates BEFORE closing. CLOSE is terminal, so
  // closing a run whose gates are unmet would strand it unrecoverably. When
  // gates are unmet, stay in the current (recoverable) state and say which.
  if (run.state !== 'CLOSE' && run.status !== 'completed') {
    const preflight = store.evaluateCompletion(runId);
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
    store.transition(runId, 'CLOSE');
  }

  // Step 3: assess & persist completion authority. A run that already reached
  // an accepted decision keeps it; this pass is a finalization retry, not a
  // re-judgement of evidence that is now historical (P0-7).
  const existingDecision = store.getCompletionDecision(runId);
  const isFinalizationRetry = existingDecision?.decision === 'accepted' && run.status === 'completed';
  const completionEval = isFinalizationRetry
    ? { ...store.evaluateCompletion(runId), decision: 'accepted', digest: existingDecision.evidenceDigest, decisionPayload: existingDecision.decisionJson }
    : store.evaluateCompletion(runId);
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
  let knowledgeStatus = 'skipped';
  let commitReceipt = null;
  let knowledgeCommitError = null;
  const priorCommit = store.getKnowledgeCommitReceipt(runId);
  if (priorCommit && ['committed', 'no_change'].includes(priorCommit.status)) {
    // Already committed on an earlier attempt; re-running it would fail the
    // revision CAS and mask the step that actually failed.
    commitReceipt = priorCommit.receiptJson;
    knowledgeStatus = priorCommit.status;
  } else {
    try {
      commitReceipt = await commitProjectKnowledge({
        runId,
        projectId: run.projectId,
        stateStore: store,
        expectedKnowledgeRevision: run.knowledgeRevisionStart,
        env: { MOON_RELAY_KERNEL_HOME: runtimeHome },
      });
      knowledgeStatus = commitReceipt.status || 'committed';
    } catch (error) {
      knowledgeStatus = 'failed';
      knowledgeCommitError = error.message;
    }
  }

  // Step 5: Git closeout.
  let gitCloseoutStatus = 'skipped';
  let gitReceipt = null;
  let gitCloseoutError = null;
  if (effectiveCloseoutRequest?.requested) {
    const knowledgeCommitReceipt = store.getKnowledgeCommitReceipt(runId)?.receiptJson;
    if (!knowledgeCommitReceipt) {
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
          knowledgeCommitReceipt,
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

  const finalizationReceipt = {
    schemaVersion: 1,
    runId,
    projectId: run.projectId,
    completionStatus: completionEval.decision,
    knowledgeStatus,
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
  store.setFinalizationStatus(runId, finalizationStatus);
  if (run.projectId) {
    const dir = resolveRunArtifactPaths({ runtimeHome, projectId: run.projectId, runId }).finalization;
    await mkdir(dir, { recursive: true });
    const target = path.join(dir, 'receipt.json');
    const temporary = `${target}.${process.pid}.tmp`;
    await writeFile(temporary, JSON.stringify(finalizationReceipt, null, 2));
    await rename(temporary, target);
  }
  await projectRunState(store.getRun(runId), { runtimeHome });

  return finalizationReceipt;
};
