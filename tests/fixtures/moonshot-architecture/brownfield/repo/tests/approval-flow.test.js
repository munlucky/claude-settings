import assert from 'node:assert/strict';
import { listAuditEvents } from '../src/audit-log.js';
import { recordReviewerDecision, submitApprovalRequest } from '../src/approval-service.js';

const request = submitApprovalRequest({
  title: 'Laptop',
  amount: 1200,
  justification: 'Developer workstation',
});

const decided = recordReviewerDecision(request, {
  reviewerId: 'reviewer-1',
  decision: 'approved',
  note: 'Within budget',
});

assert.equal(decided.status, 'approved');
assert.equal(listAuditEvents()[0].note, 'Within budget');
