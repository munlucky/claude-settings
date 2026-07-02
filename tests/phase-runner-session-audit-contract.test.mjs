import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { after, test } from 'node:test';

import { auditSessionsRoot } from '../scripts/lib/phase-runner-session-audit.mjs';

const root = process.cwd();
const tempRoots = [];

after(async () => {
  await Promise.all(tempRoots.map((dir) => rm(dir, { recursive: true, force: true })));
});

const makeTempRoot = async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'moonshot-phase-audit-'));
  tempRoots.push(tempRoot);
  return tempRoot;
};

const line = (entry) => `${JSON.stringify(entry)}\n`;

test('session audit counts direct phase-runner invocations and excludes injected metadata', async () => {
  const sessionsRoot = await makeTempRoot();
  await mkdir(path.join(sessionsRoot, 'nested'), { recursive: true });
  await writeFile(path.join(sessionsRoot, 'direct.jsonl'), [
    line({ type: 'session_meta', payload: { id: 'session-direct', thread_id: 'thread-a' } }),
    line({ type: 'response_item', payload: { item: { type: 'message', role: 'user', content: [{ type: 'input_text', text: '[$moonshot-phase-runner](C:/Users/moon/.codex/skills/moonshot-phase-runner/SKILL.md) 작업진행해줘' }] } } }),
    line({ type: 'response_item', payload: { item: { type: 'function_call', name: 'shell_command', arguments: 'node scripts/prepare-phase-runner-state.mjs --json' } } }),
  ].join(''));
  await writeFile(path.join(sessionsRoot, 'nested', 'injected.jsonl'), [
    line({ type: 'session_meta', payload: { id: 'session-injected' } }),
    line({ type: 'response_item', payload: { item: { type: 'message', role: 'user', content: '### Available skills\n- moonshot-phase-runner: Use for large phase based work' } } }),
  ].join(''));
  await writeFile(path.join(sessionsRoot, 'duplicate.jsonl'), [
    line({ type: 'session_meta', payload: { id: 'session-direct', thread_id: 'thread-a' } }),
    line({ type: 'response_item', payload: { item: { type: 'message', role: 'user', content: 'moonshot-phase-runner continue' } } }),
  ].join(''));
  await writeFile(path.join(sessionsRoot, 'noise.jsonl'), [
    'not-json\n',
    line({ type: 'session_meta', payload: { id: 'session-noise' } }),
    line({ type: 'response_item', payload: { item: { type: 'message', role: 'user', content: 'Do not use moonshot-phase-runner in the subagent prompt.' } } }),
    line({ type: 'response_item', payload: { item: { type: 'function_call', name: 'shell_command', arguments: 'node scripts/prepare-phase-runner-state.mjs --json' } } }),
  ].join(''));

  const result = await auditSessionsRoot({ sessionsRoot });

  assert.equal(result.directSessionCount, 1);
  assert.equal(result.duplicateCount, 1);
  assert.equal(result.invalidJsonLineCount, 1);
  assert.equal(result.excludedCountsByReason.skill_metadata_injection, 1);
  assert.equal(result.excludedCountsByReason.subagent_prompt, 1);
  assert.equal(result.excludedCountsByReason.duplicate, 1);
  assert.equal(result.records.some((record) => record.sourceFile.includes('direct.jsonl') && record.directInvocation), true);
});

test('session audit CLI emits deterministic JSON summary', async () => {
  const sessionsRoot = await makeTempRoot();
  await writeFile(path.join(sessionsRoot, 'direct.jsonl'), [
    line({ type: 'session_meta', payload: { id: 'session-cli' } }),
    line({ type: 'response_item', payload: { item: { type: 'message', role: 'user', content: 'please run moonshot-phase-runner' } } }),
  ].join(''));

  const result = spawnSync(process.execPath, [
    'scripts/phase-runner-session-audit.mjs',
    '--sessions-root',
    sessionsRoot,
    '--json',
  ], {
    cwd: root,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.directSessionCount, 1);
  assert.equal(payload.uniqueSessionCount, 1);
  assert.deepEqual(Object.keys(payload.records[0]).sort(), [
    'directInvocation',
    'evidenceTypes',
    'excludedReasons',
    'firstUserInvocationLine',
    'schemaVersion',
    'sessionId',
    'sourceFile',
    'threadId',
    'warningCount',
  ]);
});

test('session audit merges duplicate records so later direct invocation is not undercounted', async () => {
  const sessionsRoot = await makeTempRoot();
  await writeFile(path.join(sessionsRoot, 'a-partial.jsonl'), [
    line({ type: 'session_meta', payload: { id: 'session-merged' } }),
    line({ type: 'response_item', payload: { item: { type: 'message', role: 'user', content: 'ordinary request' } } }),
  ].join(''));
  await writeFile(path.join(sessionsRoot, 'b-direct.jsonl'), [
    line({ type: 'session_meta', payload: { id: 'session-merged' } }),
    line({ type: 'response_item', payload: { item: { type: 'message', role: 'user', content: 'run moonshot-phase-runner now' } } }),
  ].join(''));

  const result = await auditSessionsRoot({ sessionsRoot });

  assert.equal(result.directSessionCount, 1);
  assert.equal(result.duplicateCount, 1);
  assert.equal(result.records[0].directInvocation, true);
  assert.ok(result.records[0].excludedReasons.includes('duplicate'));
});
