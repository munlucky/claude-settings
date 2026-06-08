const auditEvents = [];

export function appendAuditEvent(event) {
  auditEvents.push({ ...event, recordedAt: 'fixture-time' });
}

export function listAuditEvents() {
  return [...auditEvents];
}
