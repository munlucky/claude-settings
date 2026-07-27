// Work cursor API (K1 + K2). The step ledger and the execution capsule are one
// concern: which unit of work is current, and what bounded context that unit is
// executed with. They live here rather than in the control plane so the control
// plane stays a control plane.
//
// These are control-plane METHODS: they are spread into the object the control
// plane returns, so `this` is the control plane and they can reach the run
// lifecycle (stage knowledge, implementation context, replan accounting).

import { buildExecutionCapsule, buildReviewCapsule, capsuleStaleness, findScopeViolations } from './execution-capsule.mjs';
import { digestOfChangedFiles, extractRelevantSymbols, rankRelevantFiles, selectKnowledgeRecords } from './capsule-selection.mjs';
import { resolveWorkerBound } from './bounded-wave.mjs';
import { discoverProjectCommands } from '../proof/command-catalog.mjs';
import { currentStep as selectCurrentStep, dependenciesSatisfied, detectStepStagnation, evaluateStepCompletion, selectExecutableSteps } from './run-step-ledger.mjs';
import { planReplacementSteps, planRunSteps } from './step-planner.mjs';
import { scanRepositoryEvidence } from '../task/evidence-scan.mjs';
import { canonicalDigest } from '../canonical-digest.mjs';
import { gitLsFiles } from '../../lib/git-safe.mjs';

export const createWorkCursorApi = ({ store, projectRoot }) => ({
  // --- Run Step Ledger (K2) -------------------------------------------
  // No model-visible command is added: `next` returns the current step inside
  // the action it already returned, and `report` answers it.

  getRunSteps(runId, options = {}) {
    return store.getRunSteps(runId, options);
  },

  getCurrentStep(runId) {
    const run = store.getRun(runId);
    if (!run) return null;
    return selectCurrentStep(this.ensureRunStepsMigrated(runId), { planRevision: run.planRevision });
  },

  // K4 migration. A run that started before the ledger existed has no steps.
  // It is given a recovery step at its CURRENT state rather than being
  // replayed, and the step is marked so its origin stays readable.
  ensureRunStepsMigrated(runId) {
    const existing = store.getRunSteps(runId);
    if (existing.length > 0) return existing;
    const run = store.getRun(runId);
    if (!run) return [];
    const obligations = store.getRunObligations(runId);
    const contract = run.taskContract || {};
    const [recovery] = planRunSteps({
      run,
      contract: { ...contract, steps: [] },
      obligations,
      route: run.route || {},
      planRevision: Number(run.planRevision || 1),
    }).steps;
    store.createRunSteps(runId, [{ ...recovery, objective: `${recovery.objective}`, migrationOrigin: 'legacy-run' }]);
    // A run that is already past implementation resumes at its own state; the
    // recovery step is a cursor for what remains, not a replay of what happened.
    return store.getRunSteps(runId);
  },

  startStep(runId, stepId, { workspaceIdentity = null, capsuleDigest = null } = {}) {
    const step = store.getRunStep(runId, stepId);
    if (!step) throw new Error(`Run step ${stepId} not found for run ${runId}`);
    if (step.state === 'running') return step;
    return store.updateRunStep(runId, stepId, {
      state: 'running',
      startedAt: step.startedAt || new Date().toISOString(),
      workspaceIdentityStart: step.workspaceIdentityStart || workspaceIdentity,
      capsuleDigest: capsuleDigest || step.capsuleDigest,
    });
  },

  completeStep(runId, stepId, { workspaceIdentity = null, resultDigest = null } = {}) {
    const completed = store.updateRunStep(runId, stepId, {
      state: 'passed',
      completedAt: new Date().toISOString(),
      workspaceIdentityEnd: workspaceIdentity,
      resultDigest,
    });
    this.unlockDependentSteps(runId);
    return completed;
  },

  failStep(runId, stepId, { reason = null } = {}) {
    return store.updateRunStep(runId, stepId, { state: 'failed', blockedReason: reason });
  },

  // A step whose dependencies have all passed becomes runnable. Doing this on
  // completion, rather than at selection time, keeps the ledger readable: the
  // stored state always says what is actually available.
  unlockDependentSteps(runId) {
    const steps = store.getRunSteps(runId);
    for (const step of steps) {
      if (step.state !== 'planned') continue;
      if (!dependenciesSatisfied(step, steps)) continue;
      store.updateRunStep(runId, step.stepId, { state: 'ready' });
    }
    return store.getRunSteps(runId);
  },

  // Replan (§7.5): the live steps of the current revision are superseded and a
  // replacement plan is written at the next revision. Nothing that was already
  // attempted is edited.
  async replanSteps(runId, { steps = [] } = {}) {
    const run = store.getRun(runId);
    if (!run) throw new Error(`Run ${runId} not found`);
    const nextRevision = Number(run.planRevision || 1) + 1;
    store.supersedeRunSteps(runId, { planRevision: run.planRevision });
    const replacement = planReplacementSteps({
      run,
      contract: run.taskContract || {},
      obligations: store.getRunObligations(runId),
      planRevision: nextRevision,
      deltaSteps: steps,
    });
    store.createRunSteps(runId, replacement);
    store.setPlanRevision(runId, nextRevision);
    await this.signalReplan(runId);
    return { planRevision: nextRevision, steps: store.getRunSteps(runId, { planRevision: nextRevision }) };
  },

  // The wave the Host may dispatch right now (§7.6). Sequential is the answer
  // unless the contract carries an approved Safe Wave whose integration command
  // the project actually declares, the write sets are disjoint, and nothing in
  // the current plan is stagnant — a stuck plan returns to one step at a time.
  getExecutableSteps(runId) {
    const run = store.getRun(runId);
    if (!run) return { steps: [], reason: 'run-not-found', mode: 'sequential' };
    const steps = this.ensureRunStepsMigrated(runId);
    const safeWave = run.taskContract?.safeWave || null;

    let integrationVerification = null;
    let blockedReason = null;
    if (safeWave?.approved) {
      const declared = discoverProjectCommands({ projectRoot })
        .some((command) => command.commandRef === safeWave.integrationVerification.commandRef);
      if (!declared) blockedReason = 'safe-wave-integration-command-not-declared';
      else if (this.planIsStagnant(runId)) blockedReason = 'safe-wave-suspended-by-stagnation';
      else integrationVerification = safeWave.integrationVerification;
    } else if (safeWave?.requested) {
      blockedReason = 'safe-wave-not-approved';
    }

    const selection = selectExecutableSteps(steps, {
      planRevision: run.planRevision,
      safeWave: Boolean(integrationVerification),
      integrationVerification,
      maxWorkers: resolveWorkerBound({ riskTier: run.proofTier, includeIndependentReview: run.proofTier === 'T3' }),
    });
    return {
      steps: selection.steps,
      reason: blockedReason || selection.reason,
      mode: selection.steps.length > 1 ? 'parallel' : 'sequential',
      integrationVerification,
    };
  },

  // True when any live step of the current plan is stuck. Used to collapse a
  // parallel wave back to sequential execution.
  planIsStagnant(runId) {
    const run = store.getRun(runId);
    return this.ensureRunStepsMigrated(runId)
      .filter((step) => step.planRevision === run.planRevision && !['passed', 'superseded', 'cancelled'].includes(step.state))
      .some((step) => detectStepStagnation({ step, attempts: store.getStepAttempts(runId, { stepId: step.stepId }) }).stagnant);
  },

  detectStepStagnation(runId, { stepId = null } = {}) {
    const step = stepId ? store.getRunStep(runId, stepId) : this.getCurrentStep(runId);
    if (!step) return { stagnant: false, signals: {}, attemptCount: 0, recommendation: 'retry' };
    return detectStepStagnation({ step, attempts: store.getStepAttempts(runId, { stepId: step.stepId }) });
  },

  // Which step a report answers. An explicit stepId must be the live one; with
  // a decomposed plan and several runnable units, an unnamed step is genuinely
  // ambiguous and is refused rather than guessed.
  resolveReportStep(runId, report) {
    const run = store.getRun(runId);
    const steps = this.ensureRunStepsMigrated(runId);
    if (steps.length === 0) return { step: null };
    const scoped = steps.filter((step) => step.planRevision === run.planRevision);

    if (report.stepId) {
      const named = scoped.find((step) => step.stepId === report.stepId);
      if (!named) {
        const otherRevision = steps.find((step) => step.stepId === report.stepId);
        return {
          rejection: [{
            obligationId: 'step',
            command: 'kernel report',
            errorSummary: otherRevision
              ? `Step "${report.stepId}" belongs to plan revision ${otherRevision.planRevision}; this run is on revision ${run.planRevision}`
              : `Step "${report.stepId}" does not exist for this run`,
          }],
        };
      }
      if (['passed', 'superseded', 'cancelled'].includes(named.state)) {
        return { rejection: [{ obligationId: 'step', command: 'kernel report', errorSummary: `Step "${named.stepId}" is already ${named.state} and cannot be reported again` }] };
      }
      const active = selectCurrentStep(steps, { planRevision: run.planRevision });
      if (active && active.stepId !== named.stepId) {
        return { rejection: [{ obligationId: 'step', command: 'kernel report', errorSummary: `Step "${named.stepId}" is not the current work unit; "${active.stepId}" is` }] };
      }
      return { step: named };
    }

    const runnable = selectExecutableSteps(steps, { planRevision: run.planRevision }).steps;
    const active = selectCurrentStep(steps, { planRevision: run.planRevision });
    const liveCount = scoped.filter((step) => !['passed', 'superseded', 'cancelled'].includes(step.state)).length;
    if (!active) return { step: null };
    if (liveCount > 1 && runnable.length > 1) {
      return { rejection: [{ obligationId: 'step', command: 'kernel report', errorSummary: `This run has a decomposed plan; name the stepId the report answers (current: ${active.stepId})` }] };
    }
    return { step: active };
  },

  // K1: the bounded execution context for ONE unit of work. Everything in it
  // comes from persisted state, the command catalog, and a scoped repository
  // scan — never from the conversation. Built deterministically, so a fresh
  // process rebuilds the same capsule id from the same SQLite state.
  async buildCapsule(runId, { role = 'implementer', decision = null, step = null, objective = null, changedPaths = [] } = {}) {
    const run = store.getRun(runId);
    if (!run) throw new Error(`Run ${runId} not found`);
    // The capsule is scoped to the step the ledger says is current (K2), so a
    // decomposed run hands each worker only its own unit.
    step = step || this.getCurrentStep(runId);
    if (role === 'reviewer') return this.buildReviewerCapsule(runId, { decision, step, changedPaths });

    const obligations = store.getRunObligations(runId);
    const completion = store.evaluateCompletion(runId);
    const outstanding = completion.unsatisfiedObligations.map((entry) => entry.obligationId);
    const knowledgeContext = await this.refreshStageKnowledge(runId);
    const contract = run.taskContract;
    const allowedPaths = step?.allowedPaths?.length ? step.allowedPaths : (contract?.allowedPaths || []);

    const projectContext = await this.buildImplementationContext(runId, run);
    const relevantFiles = run.projectMode === 'greenfield' ? [] : rankRelevantFiles({
      candidates: (gitLsFiles(projectRoot).stdout || '').split(/\r?\n/).filter(Boolean),
      allowedPaths,
      acceptancePaths: [],
      changedPaths: changedPaths.length > 0 ? changedPaths : scanRepositoryEvidence({ projectRoot }).dirtyPaths,
      projectRoot,
    });
    const selected = selectKnowledgeRecords({ knowledgeContext, allowedPaths });

    const capsule = buildExecutionCapsule({
      run,
      step,
      decision,
      objective,
      contract,
      obligations,
      outstandingObligations: outstanding,
      knowledgeContext,
      repositoryContext: {
        projectMode: run.projectMode,
        entrypoints: projectContext.entrypoints || [],
        manifests: projectContext.manifests || [],
        knownCommands: projectContext.knownCommands || [],
        walkingSkeleton: projectContext.walkingSkeleton || null,
        relevantFiles: relevantFiles.map((file) => ({ path: file.path, reason: file.reason, digest: file.digest })),
          relevantSymbols: extractRelevantSymbols({ projectRoot, files: relevantFiles }),
        architectureRecords: selected.architectureRecords,
        knowledgeRecords: selected.knowledgeRecords,
        baseline: {
          status: projectContext.baseline?.status || 'unknown',
          digest: null,
          knownFailures: [...(run.baselineFailures || []), ...selected.knownFailurePatterns].slice(0, 10),
        },
      },
    });
    return store.recordExecutionCapsule(runId, capsule);
  },

  // Reviewers receive a different capsule (§6.8): subject, evidence, scope —
  // no implementer reasoning, no project knowledge, no write permission.
  async buildReviewerCapsule(runId, { decision = null, step = null, stage = 'engineering', obligationId = null, requiredChecks = [], changedPaths = [] } = {}) {
    const run = store.getRun(runId);
    if (!run) throw new Error(`Run ${runId} not found`);
    const capsule = buildReviewCapsule({
      run,
      step,
      decision,
      contract: run.taskContract,
      stage,
      obligationId,
      requiredChecks,
      changedPaths,
      // Identifies the exact file states the verdict is formed on, without
      // carrying the diff itself into the capsule.
      diffDigest: digestOfChangedFiles({ projectRoot, changedPaths }),
      verifications: store.getVerifications(runId),
      implementationSession: store.getLatestImplementationSession(runId),
    });
    return store.recordExecutionCapsule(runId, capsule);
  },

  // Moves one step through reported -> verifying -> passed|failed against the
  // evidence that now exists. A synthetic step carries the whole run, so it is
  // settled by the run-level obligation check; a declared step is settled by
  // the acceptance and obligations it was actually made responsible for.
  settleStep(runId, { step, attempt, report, failures = [], outstanding = [], observation }) {
    const run = store.getRun(runId);
    store.updateRunStep(runId, step.stepId, { state: 'reported' });
    store.updateRunStep(runId, step.stepId, { state: 'verifying' });

    const evaluation = step.synthetic
      ? { complete: outstanding.length === 0, reasons: outstanding.map((obligationId) => `obligation-unsatisfied:${obligationId}`) }
      : evaluateStepCompletion({
        step,
        verifications: store.getVerifications(runId),
        run,
        acceptance: run.taskContract?.acceptance || [],
      });

    const resultDigest = canonicalDigest({
      stepId: step.stepId,
      planRevision: step.planRevision,
      mutationRevision: run.mutationRevision,
      changedPaths: [...report.changedPaths].sort(),
      failures: failures.map((failure) => failure.obligationId).sort(),
    });

    const passed = failures.length === 0 && evaluation.complete;
    if (passed) {
      this.completeStep(runId, step.stepId, { workspaceIdentity: observation.identity, resultDigest });
    } else {
      this.failStep(runId, step.stepId, { reason: evaluation.reasons[0] || 'evidence-failed' });
    }
    if (attempt) {
      store.finishStepAttempt(attempt.id, {
        status: passed ? 'passed' : 'failed',
        workspaceIdentityEnd: observation.identity,
        resultDigest,
        failureReasons: passed ? [] : [...evaluation.reasons, ...failures.map((failure) => failure.errorSummary).filter(Boolean)],
      });
    }

    const stagnation = passed ? { stagnant: false, recommendation: 'retry', signals: {} } : this.detectStepStagnation(runId, { stepId: step.stepId });
    return {
      stepId: step.stepId,
      state: passed ? 'passed' : 'failed',
      synthetic: step.synthetic,
      planRevision: step.planRevision,
      reasons: passed ? [] : evaluation.reasons,
      resultDigest,
      // A stuck step is replanned, not retried forever (§7.9).
      stagnation,
    };
  },

  // Returns the rejection list when a report cannot be accepted against the
  // capsule it claims, or null when the report is in scope. Runs that never
  // received a capsule (no Host routing) are unaffected.
  assertCapsuleScope(runId, report, step = null) {
    const run = store.getRun(runId);
    const named = report.capsuleId ? store.getExecutionCapsule(report.capsuleId, { runId }) : null;
    if (report.capsuleId && !named) {
      return [{ obligationId: 'capsule', command: 'kernel report', errorSummary: `Execution capsule "${report.capsuleId}" was not issued for this run` }];
    }
    const capsule = named || store.latestExecutionCapsule(runId, { role: 'implementer' });

    // A named capsule must still describe this run; naming a stale one is an
    // error rather than something to silently fall back from.
    if (report.capsuleId) {
      const staleness = capsuleStaleness({ capsule, run });
      if (staleness.stale) {
        return [{ obligationId: 'capsule', command: 'kernel report', errorSummary: `Execution capsule "${capsule.capsuleId}" no longer describes this run: ${staleness.reasons.join(', ')}. Request the current action again to receive a fresh capsule.` }];
      }
    }

    // The scope actually enforced comes from the capsule ONLY while that capsule
    // is current and belongs to the step being reported. Otherwise the step's
    // own scope governs — a superseded capsule must never widen or narrow the
    // replacement step's boundary.
    const capsuleGoverns = Boolean(capsule)
      && !capsuleStaleness({ capsule, run }).stale
      && (!capsule.stepId || (Boolean(step) && capsule.stepId === step.stepId));
    const scope = capsuleGoverns
      ? { source: 'capsule', label: `work unit ${capsule.capsuleId}`, obligationId: 'capsule', allowedPaths: capsule.workUnit?.allowedPaths || [], forbiddenPaths: capsule.workUnit?.forbiddenPaths || [] }
      : (step ? { source: 'step', label: `step ${step.stepId}`, obligationId: 'step', allowedPaths: step.allowedPaths || [], forbiddenPaths: step.forbiddenPaths || [] } : null);
    if (!scope) return null;

    const violations = findScopeViolations({
      changedPaths: report.changedPaths,
      allowedPaths: scope.allowedPaths,
      forbiddenPaths: scope.forbiddenPaths,
    });
    if (violations.length === 0) return null;
    return violations.map((violation) => ({
      obligationId: scope.obligationId,
      command: 'kernel report',
      errorSummary: `Changed path "${violation.path}" is ${violation.reason === 'forbidden-path' ? 'inside a forbidden path' : 'outside the allowed paths'} of ${scope.label} (allowed: ${scope.allowedPaths.join(', ') || 'none'})`,
    }));
  },
});
