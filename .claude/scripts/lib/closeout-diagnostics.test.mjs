import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { appendCloseoutDiagnostic, buildCloseoutDiagnosticEvent } from './closeout-diagnostics.mjs';

test('appendCloseoutDiagnostic writes JSONL diagnostic events', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'closeout-diagnostics-'));
  const ledgerPath = path.join(dir, 'closeout-diagnostics.jsonl');
  const event = buildCloseoutDiagnosticEvent({
    eventType: 'phase_closeout_finalize',
    runId: 'phase02-final',
    phaseNumber: 2,
    now: '2026-05-11T07:30:00.000Z',
    payload: { ok: true },
  });

  const result = appendCloseoutDiagnostic({ ledgerPath, event });

  assert.equal(result.ok, true);
  assert.equal(result.fallbackEmitted, false);
  const lines = fs.readFileSync(ledgerPath, 'utf8').trim().split('\n');
  assert.equal(lines.length, 1);
  assert.deepEqual(JSON.parse(lines[0]), event);
});

test('appendCloseoutDiagnostic emits fallback and does not throw when append fails', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'closeout-diagnostics-'));
  const ledgerPath = path.join(dir, 'not-a-directory', 'closeout-diagnostics.jsonl');
  fs.writeFileSync(path.dirname(ledgerPath), 'occupied', 'utf8');
  const event = buildCloseoutDiagnosticEvent({
    eventType: 'phase_closeout_finalize',
    runId: 'phase02-final',
    phaseNumber: 2,
    now: '2026-05-11T07:31:00.000Z',
    payload: { ok: false },
  });
  const fallbackLines = [];

  const result = appendCloseoutDiagnostic({
    ledgerPath,
    event,
    fallbackWriter: (line) => fallbackLines.push(line),
  });

  assert.equal(result.ok, false);
  assert.equal(result.fallbackEmitted, true);
  assert.match(result.error, /not-a-directory|ENOTDIR|EEXIST|file already exists/i);
  assert.equal(fallbackLines.length, 1);
  const fallbackEvent = JSON.parse(fallbackLines[0]);
  assert.equal(fallbackEvent.eventType, 'phase_closeout_finalize_fallback');
  assert.equal(fallbackEvent.payload.diagnosticLedgerPath, ledgerPath);
  assert.ok(fallbackEvent.payload.diagnosticAppendError);
});
