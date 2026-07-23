export class FinalizationAggregateSnapshot {
  constructor({
    run,
    staticObligations = [],
    dynamicObligations = [],
    candidates = [],
    candidateBindings = [],
    approvals = [],
    reviewReceipt = null,
    verificationSummary = { passedObligations: [], failedObligations: [], staleObligations: [] },
    acceptanceSummary = { required: [], covered: [], uncovered: [] },
    releaseEvidence = { required: false, present: false, currentMutationRevision: false, digest: null },
    readiness = { status: 'blocked', blockers: [] },
  }) {
    this.schemaVersion = 1;
    this.run = run;
    this.projectId = run ? run.projectId : 'unknown';
    this.runId = run ? run.runId : 'unknown';
    this.staticObligations = staticObligations;
    this.dynamicObligations = dynamicObligations;
    this.candidates = candidates;
    this.candidateBindings = candidateBindings;
    this.approvals = approvals;
    this.reviewReceipt = reviewReceipt;
    this.verificationSummary = verificationSummary;
    this.acceptanceSummary = acceptanceSummary;
    this.releaseEvidence = releaseEvidence;
    this.readiness = readiness;
    this.status = readiness.status;
    this.blockers = readiness.blockers;
    this.reviewStatus = reviewReceipt ? reviewReceipt.status : readiness.status;
  }
}
