import { appendAuditEvent } from './audit-log.js';

export function submitApprovalRequest({ title, amount, justification }) {
  return {
    id: `req-${title.toLowerCase().replaceAll(' ', '-')}`,
    title,
    amount,
    justification,
    status: 'pending',
  };
}

export function recordReviewerDecision(request, { reviewerId, decision, note }) {
  const decided = {
    ...request,
    status: decision,
    reviewerId,
  };
  appendAuditEvent({
    requestId: request.id,
    reviewerId,
    decision,
    note,
  });
  return decided;
}
