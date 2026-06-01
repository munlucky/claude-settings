#!/usr/bin/env node

import assert from 'node:assert/strict';
import test from 'node:test';

import { validateAwtlEvent } from './awtl-event-schema.mjs';
import { importClaudeCodeTranscript, importCodexRolloutSession, importRuntimeSource } from './awtl-runtime-importers.mjs';

test('codex rollout/session importer emits schema-valid imported events with import metadata', () => {
  const events = importCodexRolloutSession({
    source_runtime_schema: 'codex.rollout.session.v1',
    session_id: 'session-06',
    run_id: 'run-06',
    task_id: 'phase-06',
    rollout: {
      events: [
        {
          event_id: 'codex-rec-01',
          type: 'session_start',
          title: 'Codex rollout session',
          summary: 'session started',
          stage: 'ready/isolate',
          actor: 'codex',
          timestamp: '2026-05-06T12:00:00.000Z',
          span_id: 'span-codex-session',
          span_name: 'codex rollout session',
        },
        {
          event_id: 'codex-rec-02',
          type: 'action',
          command: 'node --test .claude/scripts/lib/awtl-runtime-importers.test.mjs',
          summary: 'run importer tests',
          stage: 'execute',
          actor: 'codex',
          timestamp: '2026-05-06T12:01:00.000Z',
          action_name: 'run importer tests',
        },
      ],
    },
  }, {
    importedAt: '2026-05-06T12:02:00.000Z',
    sourceRuntimeSchema: 'codex.rollout.session.v1',
  });

  assert.equal(events.length, 4);
  const importedEvents = events.filter((event) => event.payload.import_kind === 'codex-imported');
  assert.equal(importedEvents.length, 2);

  for (const event of events) {
    const validation = validateAwtlEvent(event);
    assert.equal(validation.ok, true, validation.errors.join('; '));
  }

  assert.equal(importedEvents[0].payload.source_runtime_schema, 'codex.rollout.session.v1');
  assert.equal(importedEvents[0].payload.imported_at, '2026-05-06T12:02:00.000Z');
  assert.equal(importedEvents[0].payload.native_capture, false);
  assert.ok(importedEvents[0].payload.import_confidence >= 0.7);
  assert.equal(importedEvents[0].payload.import_kind, 'codex-imported');
});

test('claude transcript importer approximates span and action events with low confidence', () => {
  const events = importClaudeCodeTranscript({
    source_runtime_schema: 'claude.code.transcript.v1',
    session_id: 'session-06',
    run_id: 'run-06',
    task_id: 'phase-06',
    transcript: [
      {
        line_number: 1,
        role: 'user',
        content: 'Please inspect the importer.',
        timestamp: '2026-05-06T12:03:00.000Z',
      },
      {
        line_number: 2,
        role: 'assistant',
        content: 'I will inspect the module and tests.',
        timestamp: '2026-05-06T12:03:10.000Z',
      },
      {
        line_number: 3,
        role: 'assistant',
        type: 'tool_call',
        tool_name: 'read_file',
        content: 'sed -n 1,80p file',
        timestamp: '2026-05-06T12:03:20.000Z',
      },
    ],
  }, {
    importedAt: '2026-05-06T12:04:00.000Z',
    sourceRuntimeSchema: 'claude.code.transcript.v1',
  });

  assert.ok(events.some((event) => event.event_type === 'span_start'));
  assert.ok(events.some((event) => event.event_type === 'action'));
  assert.ok(events.some((event) => event.event_type === 'observation'));

  const importedEvents = events.filter((event) => event.event_type !== 'span_start' && event.event_type !== 'span_end');
  for (const event of importedEvents) {
    const validation = validateAwtlEvent(event);
    assert.equal(validation.ok, true, validation.errors.join('; '));
    assert.equal(event.payload.source_runtime_schema, 'claude.code.transcript.v1');
    assert.equal(event.payload.native_capture, false);
    assert.ok(event.payload.import_confidence <= 0.6);
    assert.equal(event.payload.import_kind, 'claude-transcript-imported');
  }

  const toolEvent = events.find((event) => event.event_type === 'action');
  assert.equal(toolEvent.payload.source_runtime_record_type, 'tool_call');
  assert.equal(toolEvent.payload.imported_at, '2026-05-06T12:04:00.000Z');
});

test('importRuntimeSource routes transcript-shaped input to the claude importer', () => {
  const events = importRuntimeSource({
    source_runtime_schema: 'claude.code.transcript.v1',
    transcript: [
      {
        role: 'user',
        content: 'Route me.',
        timestamp: '2026-05-06T12:05:00.000Z',
      },
    ],
  });

  assert.ok(events.some((event) => event.payload.source_runtime_schema === 'claude.code.transcript.v1'));
});
