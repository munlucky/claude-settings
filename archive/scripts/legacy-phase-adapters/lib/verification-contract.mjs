#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  normalizeRequestedRuntime,
  normalizeVerificationRuntimeSelection,
  resolveParentRuntimeContext,
} from './runtime-platform.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const runtimeCliPath = path.join(scriptDir, '..', 'runtime-cli.mjs');

function parseScalar(value) {
  const trimmed = String(value ?? '').trim();
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
    || (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function parseSimpleYamlFile(filePath) {
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  const root = {};
  const stack = [{ indent: -1, value: root }];

  function nextMeaningful(startIndex) {
    for (let index = startIndex + 1; index < lines.length; index += 1) {
      const stripped = lines[index].trim();
      if (!stripped || stripped.startsWith('#')) continue;
      return {
        indent: lines[index].length - lines[index].trimStart().length,
        stripped,
      };
    }
    return null;
  }

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index];
    const stripped = rawLine.trim();
    if (!stripped || stripped.startsWith('#')) continue;

    const indent = rawLine.length - rawLine.trimStart().length;
    while (stack.length > 1 && indent <= stack.at(-1).indent) {
      stack.pop();
    }

    const container = stack.at(-1).value;
    if (stripped.startsWith('- ')) {
      if (Array.isArray(container)) {
        container.push(parseScalar(stripped.slice(2)));
      }
      continue;
    }

    const separatorIndex = stripped.indexOf(':');
    if (separatorIndex === -1) continue;

    const key = stripped.slice(0, separatorIndex).trim();
    const value = stripped.slice(separatorIndex + 1).trim();
    if (!key || typeof container !== 'object' || Array.isArray(container)) continue;

    if (!value) {
      const next = nextMeaningful(index);
      const nested = next && next.indent > indent && next.stripped.startsWith('- ') ? [] : {};
      container[key] = nested;
      stack.push({ indent, value: nested });
      continue;
    }

    container[key] = parseScalar(value);
  }

  return root;
}

function commandExists(command) {
  const checker = process.platform === 'win32' ? 'where' : 'which';
  const result = spawnSync(checker, [command], { stdio: 'ignore' });
  return !result.error && result.status === 0;
}

function resolveCodexCommand() {
  const result = spawnSync('node', [runtimeCliPath, 'resolve-codex-command'], {
    encoding: 'utf8',
  });
  if (result.error || (result.status ?? 0) !== 0) return '';
  return String(result.stdout || '').trim();
}

export function resolveVerificationRuntimeSelection({
  requestedRuntime = 'auto',
  verificationRuntimes = 'auto',
  currentRuntime = '',
} = {}) {
  const normalizedRequestedRuntime = normalizeRequestedRuntime(requestedRuntime);
  const normalizedCurrentRuntime = normalizeRequestedRuntime(currentRuntime);
  const requestedSelection = normalizeVerificationRuntimeSelection(verificationRuntimes);

  if (requestedSelection === 'claude' || requestedSelection === 'codex' || requestedSelection === 'both') {
    return { requestedSelection, effectiveSelection: requestedSelection };
  }

  const fallbackRuntime = normalizedCurrentRuntime === 'claude' || normalizedCurrentRuntime === 'codex'
    ? normalizedCurrentRuntime
    : normalizedRequestedRuntime === 'claude' || normalizedRequestedRuntime === 'codex'
      ? normalizedRequestedRuntime
      : 'current';

  return { requestedSelection, effectiveSelection: fallbackRuntime };
}

function applyVerificationTargetTemplate(value, verificationTarget) {
  return String(value ?? '').replaceAll('{verificationTarget}', verificationTarget);
}

function buildCommandWithEnv(baseCommand, commandEnv, verificationTarget) {
  const envPrefix = Object.entries(commandEnv || {})
    .map(([key, value]) => `${key}=${applyVerificationTargetTemplate(value, verificationTarget)}`)
    .filter(Boolean)
    .join(' ');
  return envPrefix ? `${envPrefix} ${baseCommand}`.trim() : baseCommand;
}

function resolveCheckVerificationTarget(metadata, context) {
  const defaults = metadata && typeof metadata.defaultVerificationRuntimes === 'object'
    ? metadata.defaultVerificationRuntimes
    : {};
  const mapped = defaults[context.requestedSelection] ?? defaults.auto ?? context.effectiveSelection;
  if (mapped === 'current') {
    return context.currentRuntime || context.effectiveSelection || 'current';
  }
  return mapped || context.effectiveSelection;
}

function expandVerificationTargets(selection, currentRuntime = '') {
  if (selection === 'both') return ['claude', 'codex'];
  if (selection === 'claude' || selection === 'codex') return [selection];
  if (currentRuntime === 'claude' || currentRuntime === 'codex') return [currentRuntime];
  return [];
}

function normalizeAlternateId(value) {
  return String(value || '').trim();
}

function normalizeDeclaredAlternateEntry(entry, fallbackAlternateId = '', fallbackRequiredVerifierId = '') {
  if (typeof entry === 'string') {
    const text = entry.trim();
    if (!text) return null;
    const [left, right] = text.includes('->')
      ? text.split('->', 2).map((part) => part.trim())
      : [fallbackRequiredVerifierId, text];
    const requiredVerifierId = normalizeAlternateId(left || fallbackRequiredVerifierId);
    const alternateVerifierId = normalizeAlternateId(right || fallbackAlternateId);
    if (!requiredVerifierId || !alternateVerifierId) return null;
    return {
      requiredVerifierId,
      alternateVerifierId,
      command: '',
      reason: '',
      declared: true,
    };
  }

  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    return null;
  }

  const requiredVerifierId = normalizeAlternateId(
    entry.requiredVerifierId
      || entry.requiredVerifier
      || entry.required
      || entry.for
      || fallbackRequiredVerifierId,
  );
  const alternateVerifierId = normalizeAlternateId(
    entry.alternateVerifierId
      || entry.alternateVerifier
      || entry.alternate
      || entry.id
      || fallbackAlternateId,
  );

  if (!requiredVerifierId || !alternateVerifierId) {
    return null;
  }

  return {
    requiredVerifierId,
    alternateVerifierId,
    command: String(entry.command || '').trim(),
    reason: String(entry.reason || entry.declarationReason || '').trim(),
    declared: true,
  };
}

export function normalizeDeclaredAlternateVerifiers(contract = {}) {
  const entries = [];
  const declared = contract && typeof contract.declaredAlternateVerifiers === 'object'
    ? contract.declaredAlternateVerifiers
    : {};
  for (const [alternateVerifierId, metadata] of Object.entries(declared || {})) {
    const normalized = normalizeDeclaredAlternateEntry(metadata, alternateVerifierId);
    if (normalized) entries.push(normalized);
  }

  const checkPolicies = contract && typeof contract.checkPolicies === 'object'
    ? contract.checkPolicies
    : {};
  for (const [requiredVerifierId, metadata] of Object.entries(checkPolicies || {})) {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) continue;
    const declaredAlternates = Array.isArray(metadata.declaredAlternates)
      ? metadata.declaredAlternates
      : metadata.declaredAlternates
        ? [metadata.declaredAlternates]
        : [];
    for (const entry of declaredAlternates) {
      const normalized = normalizeDeclaredAlternateEntry(entry, '', requiredVerifierId);
      if (normalized) entries.push(normalized);
    }
  }

  const byKey = new Map();
  for (const entry of entries) {
    const key = `${entry.requiredVerifierId}\0${entry.alternateVerifierId}`;
    if (!byKey.has(key)) {
      byKey.set(key, entry);
    }
  }

  return [...byKey.values()].sort((a, b) => (
    a.requiredVerifierId.localeCompare(b.requiredVerifierId)
    || a.alternateVerifierId.localeCompare(b.alternateVerifierId)
  ));
}

export function isDeclaredAlternateVerifier(contract = {}, requiredVerifierId = '', alternateVerifierId = '') {
  const requiredId = normalizeAlternateId(requiredVerifierId);
  const alternateId = normalizeAlternateId(alternateVerifierId);
  if (!requiredId || !alternateId) return false;
  return normalizeDeclaredAlternateVerifiers(contract).some((entry) => (
    entry.requiredVerifierId === requiredId
    && entry.alternateVerifierId === alternateId
  ));
}

export function resolveAvailableRuntimes(options = {}) {
  const override = String(process.env.PHASE_VERIFICATION_AVAILABLE_RUNTIMES || '').trim();
  if (override) {
    return override
      .split(/[,\s]+/)
      .map((value) => value.trim().toLowerCase())
      .filter((value) => value === 'claude' || value === 'codex');
  }

  const parentRuntimeContext = resolveParentRuntimeContext(options);
  const currentRuntime = normalizeRequestedRuntime(options.currentRuntime);
  const available = [];
  if (commandExists('claude') && (parentRuntimeContext.allowClaudeChecks || currentRuntime === 'claude')) {
    available.push('claude');
  }
  if (resolveCodexCommand() && (parentRuntimeContext.allowCodexChecks || currentRuntime === 'codex')) {
    available.push('codex');
  }
  return available;
}

export function loadVerificationContractContext(contractFile, options = {}) {
  if (!contractFile || !fs.existsSync(contractFile)) {
    return {
      contract: {},
      commands: {},
      requestedSelection: 'auto',
      effectiveSelection: 'current',
      currentRuntime: normalizeRequestedRuntime(options.currentRuntime),
      requiredChecks: [],
    };
  }

  const contract = parseSimpleYamlFile(contractFile);
  const commands = typeof contract.commands === 'object' && contract.commands ? contract.commands : {};
  const policy = typeof contract.policy === 'object' && contract.policy ? contract.policy : {};
  const checkPolicies = typeof contract.checkPolicies === 'object' && contract.checkPolicies ? contract.checkPolicies : {};
  const requiredCheckNames = Array.isArray(policy.requiredChecks)
    ? policy.requiredChecks
    : policy.requiredChecks
      ? [policy.requiredChecks]
      : [];

  const selectionContext = resolveVerificationRuntimeSelection(options);
  const currentRuntime = normalizeRequestedRuntime(options.currentRuntime);

  return {
    contract,
    commands,
    declaredAlternateVerifiers: normalizeDeclaredAlternateVerifiers(contract),
    parentRuntimeContext: resolveParentRuntimeContext(options),
    requestedSelection: selectionContext.requestedSelection,
    effectiveSelection: selectionContext.effectiveSelection,
    currentRuntime,
    requiredChecks: requiredCheckNames.map((checkName) => {
      const baseCommand = typeof commands[checkName] === 'string' ? commands[checkName] : '';
      const metadata = typeof checkPolicies[checkName] === 'object' && checkPolicies[checkName] ? checkPolicies[checkName] : {};
      const runtimeSelectionAware = metadata.runtimeSelectionAware === true;
      const resolvedVerificationTarget = runtimeSelectionAware
        ? resolveCheckVerificationTarget(metadata, {
          ...selectionContext,
          currentRuntime,
        })
        : '';
      const command = runtimeSelectionAware
        ? buildCommandWithEnv(baseCommand, metadata.commandEnv, resolvedVerificationTarget)
        : baseCommand;

      return {
        name: String(checkName),
        baseCommand,
        command,
        metadata,
        runtimeSelectionAware,
        resolvedVerificationTarget,
        verificationTargets: runtimeSelectionAware
          ? expandVerificationTargets(resolvedVerificationTarget, currentRuntime)
          : [],
        preflightBlockOnUnavailable: metadata.preflightBlockOnUnavailable === true,
      };
    }),
  };
}

export function collectVerificationPreflightBlockers(contractFile, options = {}) {
  const context = loadVerificationContractContext(contractFile, options);
  const availableRuntimes = new Set(resolveAvailableRuntimes(options));
  const blockers = [];

  for (const check of context.requiredChecks) {
    if (!check.preflightBlockOnUnavailable || check.verificationTargets.length === 0) continue;
    const missingRuntimes = check.verificationTargets.filter((runtime) => !availableRuntimes.has(runtime));
    if (missingRuntimes.length === 0) continue;
    blockers.push({
      checkName: check.name,
      verificationTarget: check.resolvedVerificationTarget,
      missingRuntimes,
      reason: `blocked:missing-${missingRuntimes.join('-')}-runtime-for-${check.name}`,
      detail: `${check.name} requires ${missingRuntimes.join(', ')} runtime(s) for verification target ${check.resolvedVerificationTarget}`,
    });
  }

  return {
    ...context,
    availableRuntimes: [...availableRuntimes],
    blockers,
  };
}
