import crypto from 'node:crypto';

export class FinalizationAggregateSnapshot {
  constructor({
    runId,
    projectId,
    status = 'ready',
    reviewStatus = 'passed',
    blockers = [],
    candidates = [],
    evidenceBindings = [],
    approvals = [],
    obligations = [],
    reviewDigest = '',
  } = {}) {
    this.schemaVersion = 1;
    this.runId = runId;
    this.projectId = projectId;
    this.status = status; // 'ready' | 'blocked'
    this.reviewStatus = reviewStatus; // 'no_candidates' | 'passed' | 'needs_approval' | 'pending_verification' | 'failed'
    this.blockers = blockers;
    this.candidates = candidates;
    this.evidenceBindings = evidenceBindings;
    this.approvals = approvals;
    this.obligations = obligations;
    this.reviewDigest = reviewDigest || crypto.createHash('sha256').update(JSON.stringify({ runId, reviewStatus, candidates, blockers })).digest('hex');
  }
}
