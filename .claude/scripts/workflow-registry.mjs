#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REQUIRED_PUBLIC_ENTRYPOINTS = [
  'product-orchestrator',
  'moonshot-phase-runner',
  'moonshot-orchestrator',
];

const REQUIRED_ENTRY_FIELDS = [
  'profile',
  'stages',
  'defaultExecutionMode',
  'fallbackExecutionMode',
  'stateAuthority',
  'verificationProfile',
  'lineBudget',
  'executionBoundary',
];

const REQUIRED_BOUNDARY_FIELDS = [
  'controlPlaneOwner',
  'phaseAttemptOwner',
  'diffAndEvidenceOwner',
  'agentLoopRole',
];

function valueAfter(argv, flag) {
  const index = argv.indexOf(flag);
  if (index === -1 || index + 1 >= argv.length) {
    return null;
  }
  return argv[index + 1];
}

function stripComment(line) {
  let quote = '';
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if ((char === '"' || char === "'") && line[index - 1] !== '\\') {
      quote = quote === char ? '' : quote || char;
      continue;
    }
    if (char === '#' && !quote) {
      return line.slice(0, index);
    }
  }
  return line;
}

function parseScalar(value) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return '';
  if (trimmed === '[]') return [];
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    const body = trimmed.slice(1, -1).trim();
    if (!body) return [];
    return body.split(',').map((item) => parseScalar(item));
  }
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
    || (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) return Number(trimmed);
  return trimmed;
}

export function parseSimpleYaml(text) {
  const root = {};
  const stack = [{ indent: -1, value: root }];

  for (const rawLine of String(text || '').split(/\r?\n/)) {
    const withoutComment = stripComment(rawLine).replace(/\s+$/, '');
    if (!withoutComment.trim()) continue;

    const indent = withoutComment.match(/^\s*/)?.[0].length ?? 0;
    const line = withoutComment.trim();
    const separator = line.indexOf(':');
    if (separator === -1) continue;

    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    while (stack.length > 1 && indent <= stack.at(-1).indent) {
      stack.pop();
    }

    const parent = stack.at(-1).value;
    if (!value) {
      parent[key] = {};
      stack.push({ indent, value: parent[key] });
    } else {
      parent[key] = parseScalar(value);
    }
  }

  return root;
}

export function resolveRootDir(argv = process.argv.slice(2)) {
  const rootArg = valueAfter(argv, '--root');
  if (rootArg) return path.resolve(rootArg);

  const cwd = process.cwd();
  if (fs.existsSync(path.join(cwd, '.claude'))) return cwd;

  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
}

export function resolveWorkflowRegistryPath({
  rootDir = resolveRootDir([]),
  overlayRoot = '',
  registryPath = '',
} = {}) {
  if (registryPath) return path.resolve(rootDir, registryPath);

  const overlay = overlayRoot ? path.resolve(rootDir, overlayRoot) : '';
  const overlayPath = overlay ? path.join(overlay, '.claude', 'workflow.registry.yaml') : '';
  if (overlayPath && fs.existsSync(overlayPath)) return overlayPath;

  return path.join(rootDir, '.claude', 'workflow.registry.yaml');
}

export function validateWorkflowRegistry(registry) {
  const violations = [];
  const entrypoints = registry?.entrypoints || {};

  for (const name of REQUIRED_PUBLIC_ENTRYPOINTS) {
    const entry = entrypoints[name];
    if (!entry) {
      violations.push(`missing entrypoint: ${name}`);
      continue;
    }
    for (const field of REQUIRED_ENTRY_FIELDS) {
      if (entry[field] === undefined || entry[field] === '') {
        violations.push(`${name} missing ${field}`);
      }
    }
    if (!Array.isArray(entry.stages) || entry.stages.length === 0) {
      violations.push(`${name} stages must be a non-empty inline list`);
    }
    const boundary = entry.executionBoundary || {};
    for (const field of REQUIRED_BOUNDARY_FIELDS) {
      if (!boundary[field]) {
        violations.push(`${name}.executionBoundary missing ${field}`);
      }
    }
  }

  const phaseRunner = entrypoints['moonshot-phase-runner'] || {};
  if (phaseRunner.defaultExecutionMode !== 'forked-agent') {
    violations.push('moonshot-phase-runner.defaultExecutionMode must be forked-agent');
  }
  if (phaseRunner.fallbackExecutionMode !== 'delegated-terminal') {
    violations.push('moonshot-phase-runner.fallbackExecutionMode must be delegated-terminal');
  }
  if (phaseRunner.executionBoundary?.agentLoopRole !== 'legacy-headless-cron-fallback') {
    violations.push('moonshot-phase-runner agentLoopRole must be legacy-headless-cron-fallback');
  }

  const budgets = registry?.skillBudgets || {};
  for (const surface of ['public_entrypoint', 'public_utility', 'internal_or_optional']) {
    if (!Number.isFinite(Number(budgets[surface])) || Number(budgets[surface]) <= 0) {
      violations.push(`skillBudgets.${surface} must be a positive number`);
    }
  }

  const boundaries = registry?.scriptBoundaries || {};
  for (const field of ['deterministicHelpers', 'fallbackAdapters', 'forbiddenPrimaryOwners']) {
    if (!Array.isArray(boundaries[field]) || boundaries[field].length === 0) {
      violations.push(`scriptBoundaries.${field} must be a non-empty inline list`);
    }
  }
  if (!boundaries.deterministicHelpers?.includes('workflow-registry.mjs')) {
    violations.push('workflow-registry.mjs must be declared as a deterministic helper');
  }
  if (!boundaries.fallbackAdapters?.includes('agent-loop.mjs')) {
    violations.push('agent-loop.mjs must be declared as a fallback adapter');
  }
  const forbiddenPrimaryOwners = new Set(boundaries.forbiddenPrimaryOwners || []);
  for (const [name, entry] of Object.entries(entrypoints)) {
    const boundary = entry?.executionBoundary || {};
    for (const ownerField of ['controlPlaneOwner', 'phaseAttemptOwner', 'diffAndEvidenceOwner']) {
      if (forbiddenPrimaryOwners.has(boundary[ownerField])) {
        violations.push(`${name}.executionBoundary.${ownerField} cannot be a forbidden primary owner: ${boundary[ownerField]}`);
      }
    }
  }

  return {
    ok: violations.length === 0,
    violations,
  };
}

export function loadWorkflowRegistry(options = {}) {
  const rootDir = path.resolve(options.rootDir ?? resolveRootDir([]));
  const registryPath = resolveWorkflowRegistryPath({
    rootDir,
    overlayRoot: options.overlayRoot || process.env.HARNESS_OVERLAY_ROOT || '',
    registryPath: options.registryPath || '',
  });

  if (!fs.existsSync(registryPath)) {
    throw new Error(`workflow registry not found: ${registryPath}`);
  }

  const registry = parseSimpleYaml(fs.readFileSync(registryPath, 'utf8'));
  const validation = validateWorkflowRegistry(registry);
  if (!validation.ok && options.throwOnInvalid !== false) {
    throw new Error(`invalid workflow registry: ${validation.violations.join('; ')}`);
  }

  return {
    registryPath,
    registry,
    validation,
  };
}

export function getEntrypointMetadata(name, options = {}) {
  const loaded = loadWorkflowRegistry(options);
  return loaded.registry.entrypoints?.[name] || null;
}

export function skillBudgetForSurface(surface, options = {}) {
  const loaded = loadWorkflowRegistry(options);
  return Number(loaded.registry.skillBudgets?.[surface] || 0);
}

function main() {
  const argv = process.argv.slice(2);
  const rootDir = resolveRootDir(argv);
  const overlayRoot = valueAfter(argv, '--overlay-root') || process.env.HARNESS_OVERLAY_ROOT || '';
  const registryPath = valueAfter(argv, '--registry');
  const loaded = loadWorkflowRegistry({ rootDir, overlayRoot, registryPath });

  if (argv.includes('--print')) {
    process.stdout.write(`${JSON.stringify({
      schemaVersion: loaded.registry.schemaVersion,
      registryPath: path.relative(rootDir, loaded.registryPath).replaceAll(path.sep, '/'),
      validation: loaded.validation,
      entrypoints: loaded.registry.entrypoints,
      skillBudgets: loaded.registry.skillBudgets,
      scriptBoundaries: loaded.registry.scriptBoundaries,
    }, null, 2)}\n`);
    return;
  }

  process.stdout.write(`workflow registry ok: ${path.relative(rootDir, loaded.registryPath).replaceAll(path.sep, '/')}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
