import fs from 'node:fs';
import path from 'node:path';

function normalizeError(error) {
  if (!error) {
    return '';
  }
  return error instanceof Error ? error.message : String(error);
}

export function buildCloseoutDiagnosticEvent({ eventType, runId = '', phaseNumber = '', payload = {}, now = new Date().toISOString() }) {
  if (!eventType) {
    throw new Error('eventType is required');
  }
  return {
    eventVersion: 1,
    eventType,
    runId,
    phaseNumber: String(phaseNumber || ''),
    timestamp: now,
    payload,
  };
}

export function appendCloseoutDiagnostic({ ledgerPath, event, fallbackWriter = (line) => process.stderr.write(line) }) {
  if (!ledgerPath) {
    throw new Error('ledgerPath is required');
  }
  const line = `${JSON.stringify(event)}\n`;
  try {
    fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
    fs.appendFileSync(ledgerPath, line, 'utf8');
    return {
      ok: true,
      ledgerPath,
      fallbackEmitted: false,
      error: '',
    };
  } catch (error) {
    const fallbackEvent = {
      ...event,
      eventType: `${event.eventType || 'closeout_diagnostic'}_fallback`,
      payload: {
        ...(event.payload || {}),
        diagnosticLedgerPath: ledgerPath,
        diagnosticAppendError: normalizeError(error),
      },
    };
    fallbackWriter(`${JSON.stringify(fallbackEvent)}\n`);
    return {
      ok: false,
      ledgerPath,
      fallbackEmitted: true,
      error: normalizeError(error),
    };
  }
}
