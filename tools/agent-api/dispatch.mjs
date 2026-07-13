#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  recordRuntimeEvent,
  recordToolCall,
} from '../../scripts/lib/runtime-state-store.mjs';
import { assessToolDispatchFixture } from '../../scripts/lib/control-plane-policy.mjs';

const currentDir = dirname(fileURLToPath(import.meta.url));
const registryPath = resolve(currentDir, 'registry.yaml');
const registry = JSON.parse(readFileSync(registryPath, 'utf8'));

const usage = () => `Usage: node tools/agent-api/dispatch.mjs <registry|select|dispatch> [--task <text>] [--group <id>] [--tool <name>] [--args-json <json>] [--selected-groups-json <json>] [--run-id <id>] [--goal-id <id>] [--json]`;

const parseArgs = (argv) => {
  const [command = ''] = argv;
  const options = { command, json: false };
  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') {
      options.json = true;
    } else if (arg.startsWith('--')) {
      const key = arg.slice(2).replace(/-([a-z])/g, (_, char) => char.toUpperCase());
      options[key] = argv[++index] || '';
    } else {
      throw new Error(`Unknown argument: ${arg}\n${usage()}`);
    }
  }
  return options;
};

const parseJson = (value, fallback, label) => {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`${label} must be valid JSON`);
  }
};

const tokens = (value) => new Set(String(value || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));

const keywords = {
  filesystem: ['read', 'file', 'inspect', 'source'],
  edit: ['edit', 'patch', 'modify', 'apply'],
  shell: ['test', 'command', 'run', 'npm', 'node'],
  package: ['package', 'materialize', 'install', 'payload'],
  'runtime-state': ['runtime', 'state', 'lease', 'completion', 'sqlite'],
  context: ['context', 'compact', 'rehydrate', 'prompt'],
  browser: ['browser', 'ui', 'page', 'screenshot'],
  git: ['git', 'diff', 'status', 'commit', 'branch'],
  github: ['github', 'pr', 'ci', 'actions'],
  security: ['security', 'secret', 'permission', 'sandbox'],
  memory: ['memory', 'knowledge', 'promotion', 'audit'],
};

const selectionPolicy = () => ({
  maxSelectedGroups: Number(registry.selectionPolicy?.maxSelectedGroups || 3),
  fallbackGroup: registry.selectionPolicy?.fallbackGroup || 'filesystem',
  fallbackAuthority: registry.selectionPolicy?.fallbackAuthority || 'diagnosis_only',
  completionAuthority: registry.selectionPolicy?.completionAuthority === true,
  schemaModeBeforeDispatch: registry.selectionPolicy?.schemaModeBeforeDispatch || 'summary',
  schemaModeAfterDispatch: registry.selectionPolicy?.schemaModeAfterDispatch || 'full',
});

const selectGroups = (task) => {
  const policy = selectionPolicy();
  const taskTokens = tokens(task);
  const scored = registry.groups
    .map((group) => ({
      ...group,
      score: (keywords[group.id] || []).filter((keyword) => taskTokens.has(keyword)).length,
    }))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  const selected = scored.filter((group) => group.score > 0).slice(0, policy.maxSelectedGroups);
  const fallback = selected.length > 0 ? selected : [registry.groups.find((group) => group.id === policy.fallbackGroup)];
  const selectedIds = new Set(fallback.map((group) => group.id));
  const selectedGroups = fallback.map((group) => ({
    id: group.id,
    summary: group.summary,
    selectionReason: group.score > 0 ? `matched task keywords for ${group.id}` : 'fallback summary schema only',
    schemaMode: policy.schemaModeBeforeDispatch,
    tools: group.tools.map((tool) => ({ name: tool.name, summary: tool.summary })),
  }));
  return {
    selectionPolicy: policy,
    fallbackPolicy: {
      fallbackGroup: policy.fallbackGroup,
      fallbackAuthority: policy.fallbackAuthority,
      completionAuthority: policy.completionAuthority,
      mutatesState: false,
    },
    selectedGroups,
    selectedToolInjection: {
      schemaVersion: 1,
      schemaMode: policy.schemaModeBeforeDispatch,
      selectedGroupIds: [...selectedIds],
      maxSelectedGroups: policy.maxSelectedGroups,
      fullSchemaAvailableOnlyAfterDispatch: true,
    },
    skippedGroups: registry.groups
      .filter((group) => !selectedIds.has(group.id))
      .map((group) => ({ id: group.id, skipReason: 'not selected for this task summary' })),
  };
};

const validateArgs = (schema, args) => {
  const errors = [];
  for (const key of schema.required || []) {
    if (!Object.hasOwn(args, key)) {
      errors.push(`missing required argument: ${key}`);
    }
  }
  for (const [key, value] of Object.entries(args || {})) {
    const expected = schema.properties?.[key];
    if (!expected) {
      errors.push(`unknown argument: ${key}`);
    } else if (typeof value !== expected.type) {
      errors.push(`invalid type for ${key}: expected ${expected.type}`);
    }
  }
  return errors;
};

const publicRegistry = () => ({
  version: registry.version,
  budget: registry.budget,
  selectionPolicy: registry.selectionPolicy,
  groupCount: registry.groups.length,
  groups: registry.groups.map((group) => ({
    id: group.id,
    summary: group.summary,
    tools: group.tools.map((tool) => ({ name: tool.name, summary: tool.summary })),
  })),
});

const normalizeSelectedGroupIds = (selectedGroups) => {
  if (Array.isArray(selectedGroups)) {
    return selectedGroups.map((item) => (typeof item === 'string' ? item : item.id)).filter(Boolean);
  }
  if (selectedGroups && typeof selectedGroups === 'object') {
    if (Array.isArray(selectedGroups.selectedGroupIds)) return selectedGroups.selectedGroupIds.map(String);
    if (Array.isArray(selectedGroups.selectedGroups)) return normalizeSelectedGroupIds(selectedGroups.selectedGroups);
  }
  return [];
};

const maybeRecordSelection = async (options, payload) => {
  if (!options.runId || !options.goalId) return null;
  return recordRuntimeEvent({
    runId: options.runId,
    goalId: options.goalId,
    eventType: 'tool.dispatch.selection',
    payload,
  });
};

const maybeRecordTool = async (options, payload) => {
  if (!options.runId || !options.goalId) return null;
  return recordToolCall({
    runId: options.runId,
    goalId: options.goalId,
    toolGroup: payload.groupId,
    toolName: payload.toolName,
    status: payload.status,
    schemaMode: payload.schemaMode,
    payload,
  });
};

const dispatchTool = async (options) => {
  const group = registry.groups.find((item) => item.id === options.group);
  const tool = group?.tools.find((item) => item.name === options.tool);
  const selectedGroups = parseJson(options.selectedGroupsJson, [], '--selected-groups-json');
  const args = parseJson(options.argsJson, {}, '--args-json');
  const selectedIds = new Set(normalizeSelectedGroupIds(selectedGroups));

  if (!group || !tool) {
    const payload = {
      status: 'rejected',
      reason: 'unknown tool group or tool',
      groupId: options.group || '',
      toolName: options.tool || '',
      schemaMode: 'rejected',
    };
    payload.record = await maybeRecordTool(options, payload);
    return payload;
  }

  if (selectedIds.size > 0 && !selectedIds.has(group.id)) {
    const policyDecision = assessToolDispatchFixture({ selectedGroup: [...selectedIds][0], actualGroup: group.id });
    const payload = {
      status: 'rejected',
      reason: policyDecision.releaseBlocked ? policyDecision.reason : `wrong tool group for selected context: ${group.id}`,
      groupId: group.id,
      toolName: tool.name,
      schemaMode: 'rejected',
    };
    payload.record = await maybeRecordTool(options, payload);
    return payload;
  }

  const errors = validateArgs(tool.schema, args);
  if (errors.length > 0) {
    const policyDecision = assessToolDispatchFixture({ schemaMode: 'rejected' });
    const payload = {
      status: 'rejected',
      reason: policyDecision.releaseBlocked ? policyDecision.reason : 'invalid tool arguments',
      errors,
      groupId: group.id,
      toolName: tool.name,
      schemaMode: 'rejected',
    };
    payload.record = await maybeRecordTool(options, payload);
    return payload;
  }

  const payload = {
    status: 'prepared',
    groupId: group.id,
    toolName: tool.name,
    schemaMode: 'full',
    fullSchema: tool.schema,
    args,
  };
  payload.record = await maybeRecordTool(options, payload);
  return payload;
};

const write = (payload, json) => {
  if (json) console.log(JSON.stringify(payload, null, 2));
  else console.log(payload.status || 'ok');
};

const main = async () => {
  const options = parseArgs(process.argv.slice(2));
  let result;
  if (options.command === 'registry') {
    result = { status: 'ok', registry: publicRegistry() };
  } else if (options.command === 'select') {
    const selection = selectGroups(options.task || '');
    const record = await maybeRecordSelection(options, selection);
    result = { status: 'selected', ...selection, record };
  } else if (options.command === 'dispatch') {
    result = await dispatchTool(options);
  } else if (options.command === '--help' || options.command === '-h') {
    console.log(usage());
    return;
  } else {
    throw new Error(`Unknown command: ${options.command}\n${usage()}`);
  }
  write(result, options.json);
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
