import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { after, test } from 'node:test';

import Database from 'better-sqlite3';

const root = process.cwd();
const tempRoots = [];

const makeTempRoot = async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'moonshot-tool-dispatch-'));
  tempRoots.push(dir);
  return dir;
};

after(async () => {
  await Promise.all(tempRoots.map((dir) => rm(dir, { recursive: true, force: true })));
});

const runDispatch = (args, env = {}) => spawnSync(process.execPath, [
  'tools/agent-api/dispatch.mjs',
  ...args,
  '--json',
], {
  cwd: root,
  encoding: 'utf8',
  env: {
    ...process.env,
    ...env,
  },
});

const parseJson = (result) => {
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
};

test('tool registry source and public group budget are valid', async () => {
  const schema = JSON.parse(await readFile(path.join(root, 'schemas/tool-registry.schema.json'), 'utf8'));
  const registrySource = JSON.parse(await readFile(path.join(root, 'tools/agent-api/registry.yaml'), 'utf8'));
  const registry = parseJson(runDispatch(['registry'])).registry;

  assert.equal(schema.properties.groups.minItems, 10);
  assert.equal(schema.properties.groups.maxItems, 12);
  assert.equal(registrySource.version, registry.version);
  assert.deepEqual(registrySource.budget, registry.budget);
  assert.equal(registrySource.groups.length, registry.groupCount);
  assert.equal(registry.groupCount >= registry.budget.minGroups, true);
  assert.equal(registry.groupCount <= registry.budget.maxGroups, true);
  assert.equal(registry.groupCount, 11);
  for (const group of registry.groups) {
    const sourceGroup = registrySource.groups.find((item) => item.id === group.id);
    assert.ok(sourceGroup, `${group.id} must be defined in registry source`);
    assert.ok(group.summary);
    assert.equal(Array.isArray(sourceGroup.tools), true);
    assert.equal(sourceGroup.tools.length > 0, true);
    for (const tool of sourceGroup.tools) {
      assert.equal(typeof tool.schema, 'object');
      assert.equal(tool.schema.type, 'object');
      assert.equal(Array.isArray(tool.schema.required), true);
      assert.equal(typeof tool.schema.properties, 'object');
    }
  }
});

test('dispatcher records selected and skipped groups with summary schema mode', async () => {
  const tempRoot = await makeTempRoot();
  const env = { PHASE_RUNTIME_DB: path.join(tempRoot, 'runtime-state.sqlite') };
  const selected = parseJson(runDispatch([
    'select',
    '--task',
    'run npm test and inspect runtime state',
    '--run-id',
    'run-tool-select',
    '--goal-id',
    'goal-tool-select',
  ], env));

  assert.equal(selected.status, 'selected');
  assert.ok(selected.selectedGroups.some((group) => group.id === 'shell'));
  assert.ok(selected.selectedGroups.some((group) => group.id === 'runtime-state'));
  assert.ok(selected.selectedGroups.every((group) => group.schemaMode === 'summary'));
  assert.ok(selected.skippedGroups.length > 0);

  const db = new Database(env.PHASE_RUNTIME_DB);
  try {
    const event = db.prepare("SELECT * FROM runtime_events WHERE event_type = 'tool.dispatch.selection'").get();
    assert.ok(event);
    const payload = JSON.parse(event.payload_json);
    assert.ok(payload.selectedGroups.some((group) => group.id === 'shell'));
    assert.ok(payload.skippedGroups.some((group) => group.id === 'browser'));
  } finally {
    db.close();
  }
});

test('dispatcher promotes full schema only for selected valid tool calls', async () => {
  const tempRoot = await makeTempRoot();
  const env = { PHASE_RUNTIME_DB: path.join(tempRoot, 'runtime-state.sqlite') };
  const result = parseJson(runDispatch([
    'dispatch',
    '--group',
    'shell',
    '--tool',
    'run-command',
    '--selected-groups-json',
    '["shell"]',
    '--args-json',
    '{"command":"npm test"}',
    '--run-id',
    'run-tool-full',
    '--goal-id',
    'goal-tool-full',
  ], env));

  assert.equal(result.status, 'prepared');
  assert.equal(result.schemaMode, 'full');
  assert.equal(result.fullSchema.required.includes('command'), true);

  const db = new Database(env.PHASE_RUNTIME_DB);
  try {
    const row = db.prepare('SELECT status, schema_mode FROM tool_calls WHERE tool_group = ? AND tool_name = ?').get('shell', 'run-command');
    assert.equal(row.status, 'prepared');
    assert.equal(row.schema_mode, 'full');
  } finally {
    db.close();
  }
});

test('dispatcher rejects invalid args and wrong selected tool group before execution', async () => {
  const tempRoot = await makeTempRoot();
  const env = { PHASE_RUNTIME_DB: path.join(tempRoot, 'runtime-state.sqlite') };
  const invalidArgs = parseJson(runDispatch([
    'dispatch',
    '--group',
    'shell',
    '--tool',
    'run-command',
    '--selected-groups-json',
    '["shell"]',
    '--args-json',
    '{"command":123}',
    '--run-id',
    'run-tool-reject',
    '--goal-id',
    'goal-tool-reject',
  ], env));
  const wrongTool = parseJson(runDispatch([
    'dispatch',
    '--group',
    'browser',
    '--tool',
    'browser-smoke',
    '--selected-groups-json',
    '["shell"]',
    '--args-json',
    '{"url":"http://localhost:3000"}',
    '--run-id',
    'run-tool-reject',
    '--goal-id',
    'goal-tool-reject',
  ], env));

  assert.equal(invalidArgs.status, 'rejected');
  assert.equal(invalidArgs.schemaMode, 'rejected');
  assert.match(invalidArgs.errors.join('\n'), /invalid type for command/);
  assert.equal(wrongTool.status, 'rejected');
  assert.match(wrongTool.reason, /wrong tool group/);

  const db = new Database(env.PHASE_RUNTIME_DB);
  try {
    const rows = db.prepare('SELECT tool_group, status, schema_mode FROM tool_calls ORDER BY created_at').all();
    assert.equal(rows.length, 2);
    assert.deepEqual(rows.map((row) => row.schema_mode), ['rejected', 'rejected']);
  } finally {
    db.close();
  }
});
