import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';

import {
  appendLedgerEvent,
  readLedger,
  reconstructResumeState,
  verifyLedger,
} from '../scripts/lib/event-ledger.mjs';

const tempRoots = [];

after(async () => {
  await Promise.all(tempRoots.map((dir) => rm(dir, { recursive: true, force: true })));
});

test('append-only event ledger hash chain detects tampering', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'moonshot-event-ledger-'));
  tempRoots.push(tempRoot);
  const ledgerPath = path.join(tempRoot, 'events.jsonl');
  await appendLedgerEvent(ledgerPath, { type: 'phase.started', payload: { phase: '06' } });
  await appendLedgerEvent(ledgerPath, { type: 'phase.completed', payload: { phase: '06' } });

  const events = await readLedger(ledgerPath);
  assert.equal(verifyLedger(events).valid, true);
  events[0].payload.phase = '99';
  assert.equal(verifyLedger(events).valid, false);
});

test('resume state reconstructs from verified events not last status string', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'moonshot-event-resume-'));
  tempRoots.push(tempRoot);
  const ledgerPath = path.join(tempRoot, 'events.jsonl');
  await appendLedgerEvent(ledgerPath, { type: 'phase.started', payload: { phase: '05', status: 'complete' } });
  await appendLedgerEvent(ledgerPath, { type: 'phase.completed', payload: { phase: '05', status: 'not-authority' } });

  const resume = reconstructResumeState(await readLedger(ledgerPath));
  assert.equal(resume.status, 'ready');
  assert.deepEqual(resume.completedPhases, ['05']);
  assert.equal(resume.nextTransition, 'start_next_phase');
  assert.equal(resume.authority, 'runtime_events_authoritative_jsonl_replay_mirror');
});

test('ledger is JSONL receipt format', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'moonshot-event-jsonl-'));
  tempRoots.push(tempRoot);
  const ledgerPath = path.join(tempRoot, 'events.jsonl');
  await appendLedgerEvent(ledgerPath, { type: 'run.receipt', payload: { runId: 'run-1' } });
  const content = await readFile(ledgerPath, 'utf8');

  assert.equal(content.trim().split(/\r?\n/).length, 1);
  assert.match(content, /"eventHash"/);
});
