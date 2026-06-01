#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveProjectIdentity } from './project-identity.mjs';

const VALID_SEVERITIES = new Set(['error', 'warn', 'info', 'blocking', 'warning', 'advisory']);
const VALID_STATUSES = new Set(['staged', 'verified', 'superseded', 'archived', 'rejected']);
const ACTIVE_STATUSES = new Set(['staged', 'verified', undefined, '']);
const RAW_ALLOWED_FIELDS = new Set([
  'type',
  'id',
  'projectId',
  'status',
  'origin',
  'scope',
  'appliesTo',
  'severity',
  'enforcedBy',
  'sourceRef',
  'supersedes',
  'specificity',
  'createdAt',
  'updatedAt',
]);
const NORMALIZED_ALLOWED_FIELDS = new Set([
  ...RAW_ALLOWED_FIELDS,
  'recordRef',
  'declaredOrigin',
  'unknownRawFields',
]);
const DEFAULT_RESULT = Object.freeze({
  ok: true,
  projectId: '',
  checked: 0,
  violations: [],
  warnings: [],
  degradedEvidence: [],
});

function normalizeSeverity(severity) {
  if (severity === 'blocking') return 'error';
  if (severity === 'warning') return 'warn';
  if (severity === 'advisory') return 'info';
  return severity;
}

function asArray(value) {
  if (value === undefined || value === null || value === '') return [];
  return Array.isArray(value) ? value : [value];
}

function parseSimpleYamlProjectId(text) {
  for (const rawLine of String(text || '').split(/\r?\n/)) {
    const match = rawLine.match(/^\s*projectId:\s*['"]?([^'"\s#]+)['"]?\s*(?:#.*)?$/);
    if (match) return match[1];
  }
  return '';
}

function findRepoRoot(startDir) {
  let current = path.resolve(startDir);
  while (true) {
    if (fs.existsSync(path.join(current, '.git'))) return current;
    const parent = path.dirname(current);
    if (parent === current) return path.resolve(startDir);
    current = parent;
  }
}

function defaultStateRoot(env) {
  if (env.MOONSHOT_RELAY_STATE_ROOT) return env.MOONSHOT_RELAY_STATE_ROOT;
  if (env.CODEX_STATE_ROOT) return env.CODEX_STATE_ROOT;
  return path.join(env.USERPROFILE || os.homedir(), '.moonshot-relay', 'state');
}

function resolveProjectId(projectRoot, env) {
  const identityPath = path.join(projectRoot, '.claude', 'project.identity.yaml');
  if (fs.existsSync(identityPath)) {
    const explicit = parseSimpleYamlProjectId(fs.readFileSync(identityPath, 'utf8'));
    if (explicit) return explicit;
  }
  try {
    return resolveProjectIdentity({ cwd: projectRoot, env }).identity.projectId;
  } catch {
    return path.basename(projectRoot);
  }
}

function parseArgs(argv) {
  const args = {
    projectRoot: process.cwd(),
    json: false,
    globalConstraints: [],
    projectConstraints: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === '--project-root') args.projectRoot = argv[++index] || args.projectRoot;
    else if (item.startsWith('--project-root=')) args.projectRoot = item.slice('--project-root='.length);
    else if (item === '--global-constraints') args.globalConstraints.push(argv[++index] || '');
    else if (item.startsWith('--global-constraints=')) args.globalConstraints.push(item.slice('--global-constraints='.length));
    else if (item === '--project-constraints') args.projectConstraints.push(argv[++index] || '');
    else if (item.startsWith('--project-constraints=')) args.projectConstraints.push(item.slice('--project-constraints='.length));
    else if (item === '--json') args.json = true;
    else if (item === '--help' || item === '-h') args.help = true;
  }

  return args;
}

function defaultConstraintPaths(projectRoot, projectId, env) {
  const stateRoot = defaultStateRoot(env);
  return {
    global: [
      path.join(stateRoot, 'harness', 'ontology', 'constraints.jsonl'),
      path.join(stateRoot, 'global', 'ontology', 'constraints.jsonl'),
    ],
    project: [
      path.join(projectRoot, '.claude', 'ontology', 'constraints.jsonl'),
      path.join(stateRoot, 'projects', projectId, 'knowledge', 'ontology', 'constraints.jsonl'),
    ],
  };
}

function existingDefaults(paths) {
  return paths.filter((filePath) => fs.existsSync(filePath));
}

function readConstraintFile(filePath, origin, required) {
  const absolutePath = path.resolve(filePath);
  if (!fs.existsSync(absolutePath)) {
    if (required) {
      return {
        constraints: [],
        diagnostics: [{
          code: 'constraint_file_unreadable',
          severity: 'error',
          message: `constraint file is not readable: ${absolutePath}`,
          sourceRef: absolutePath,
        }],
      };
    }
    return { constraints: [], diagnostics: [] };
  }

  try {
    const text = fs.readFileSync(absolutePath, 'utf8');
    return {
      constraints: parseConstraintText(text, absolutePath, origin),
      diagnostics: [],
    };
  } catch (error) {
    return {
      constraints: [],
      diagnostics: [{
        code: 'constraint_file_unreadable',
        severity: 'error',
        message: `constraint file is not readable: ${absolutePath}: ${error.message}`,
        sourceRef: absolutePath,
      }],
    };
  }
}

function parseConstraintText(text, sourcePath, origin) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return [];

  if (trimmed.startsWith('[')) {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) throw new Error(`expected JSON array in ${sourcePath}`);
    return parsed.map((constraint, index) => normalizeConstraint(constraint, origin, `${sourcePath}#${index + 1}`));
  }

  return trimmed
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line, index) => normalizeConstraint(JSON.parse(line), origin, `${sourcePath}:${index + 1}`));
}

function normalizeConstraint(rawConstraint, origin, recordRef) {
  const unknownRawFields = Object.keys(rawConstraint || {}).filter((field) => !RAW_ALLOWED_FIELDS.has(field));
  return {
    ...rawConstraint,
    declaredOrigin: rawConstraint.origin,
    origin,
    severity: normalizeSeverity(rawConstraint.severity),
    supersedes: asArray(rawConstraint.supersedes),
    appliesTo: asArray(rawConstraint.appliesTo),
    recordRef,
    unknownRawFields,
  };
}

function validateConstraintShape(constraint) {
  const errors = [];
  for (const field of Object.keys(constraint)) {
    if (!NORMALIZED_ALLOWED_FIELDS.has(field)) {
      errors.push(`unknown field: ${field}`);
    }
  }
  for (const field of asArray(constraint.unknownRawFields)) {
    errors.push(`unknown field: ${field}`);
  }
  const requiredFields = ['id', 'scope', 'appliesTo', 'severity', 'enforcedBy', 'sourceRef', 'supersedes'];
  for (const field of requiredFields) {
    const value = constraint[field];
    if (value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0 && field !== 'supersedes')) {
      errors.push(`missing required field: ${field}`);
    }
  }
  if (constraint.type !== undefined && constraint.type !== 'ontology_constraint') {
    errors.push('type must be ontology_constraint when present');
  }
  if (!Array.isArray(constraint.appliesTo) || constraint.appliesTo.length === 0) {
    errors.push('appliesTo must be a non-empty array');
  }
  if (!VALID_SEVERITIES.has(constraint.severity)) {
    errors.push(`severity must be one of ${[...VALID_SEVERITIES].join(', ')}`);
  }
  if (!['global', 'project'].includes(constraint.origin)) {
    errors.push('origin must be global or project');
  }
  if (constraint.declaredOrigin !== undefined && constraint.declaredOrigin !== constraint.origin) {
    errors.push(`origin ${constraint.declaredOrigin} does not match ${constraint.origin} constraint source`);
  }
  if (constraint.status !== undefined && constraint.status !== '' && !VALID_STATUSES.has(constraint.status)) {
    errors.push('status must be one of staged, verified, superseded, archived, rejected');
  }
  if (constraint.specificity !== undefined && (!Number.isInteger(constraint.specificity) || constraint.specificity < 0)) {
    errors.push('specificity must be a non-negative integer when present');
  }
  return errors;
}

function conflictKey(constraint) {
  const appliesTo = [...new Set(asArray(constraint.appliesTo).map(String))].sort().join('|');
  return `${constraint.scope}::${appliesTo}`;
}

function specificityFor(constraint) {
  if (Number.isInteger(constraint.specificity)) return constraint.specificity;
  return String(constraint.scope || '').split(/[/:.]/).filter(Boolean).length + asArray(constraint.appliesTo).length;
}

function makeViolation(code, message, constraint, extra = {}) {
  return {
    code,
    severity: 'error',
    message,
    constraintId: constraint?.id || '',
    sourceRef: constraint?.recordRef || constraint?.sourceRef || '',
    ...extra,
  };
}

function makeWarning(code, message, constraint, extra = {}) {
  return {
    code,
    severity: 'warn',
    message,
    constraintId: constraint?.id || '',
    sourceRef: constraint?.recordRef || constraint?.sourceRef || '',
    ...extra,
  };
}

export function validateOntologyConstraints(options = {}) {
  const env = options.env || process.env;
  const projectRoot = path.resolve(options.projectRoot || process.cwd());
  const repoRoot = findRepoRoot(projectRoot);
  const projectId = options.projectId || resolveProjectId(repoRoot, env);
  const defaults = defaultConstraintPaths(repoRoot, projectId, env);
  const globalPaths = options.globalConstraints?.length ? options.globalConstraints : existingDefaults(defaults.global);
  const projectPaths = options.projectConstraints?.length ? options.projectConstraints : existingDefaults(defaults.project);
  const explicitPaths = Boolean(options.globalConstraints?.length || options.projectConstraints?.length);
  const result = {
    ...DEFAULT_RESULT,
    projectId,
    violations: [],
    warnings: [],
    degradedEvidence: [],
  };
  const loaded = [];

  if (globalPaths.length === 0 && projectPaths.length === 0) {
    result.degradedEvidence.push({
      code: 'ontology_constraints_not_configured',
      severity: 'info',
      message: 'no global or project-local ontology constraints were configured',
    });
    return result;
  }

  for (const filePath of globalPaths) {
    const read = readConstraintFile(filePath, 'global', explicitPaths);
    loaded.push(...read.constraints);
    result.violations.push(...read.diagnostics.filter((item) => item.severity === 'error'));
  }
  for (const filePath of projectPaths) {
    const read = readConstraintFile(filePath, 'project', explicitPaths);
    loaded.push(...read.constraints);
    result.violations.push(...read.diagnostics.filter((item) => item.severity === 'error'));
  }

  for (const constraint of loaded) {
    const shapeErrors = validateConstraintShape(constraint);
    for (const error of shapeErrors) {
      result.violations.push(makeViolation('invalid_ontology_constraint', error, constraint));
    }
  }

  const active = loaded.filter((constraint) => ACTIVE_STATUSES.has(constraint.status));
  for (const constraint of active) {
    if (constraint.severity === 'warn') {
      result.degradedEvidence.push(makeWarning('ontology_constraint_degraded', 'warn severity constraint is advisory degraded evidence', constraint));
    } else if (constraint.severity === 'info') {
      result.degradedEvidence.push({
        code: 'ontology_constraint_advisory',
        severity: 'info',
        message: 'info severity constraint is advisory evidence',
        constraintId: constraint.id || '',
        sourceRef: constraint.recordRef || constraint.sourceRef || '',
      });
    }
  }

  const validActive = active.filter((constraint) => validateConstraintShape(constraint).length === 0);
  const globalsByKey = new Map();
  for (const constraint of validActive.filter((item) => item.origin === 'global')) {
    const key = conflictKey(constraint);
    if (!globalsByKey.has(key)) globalsByKey.set(key, []);
    globalsByKey.get(key).push(constraint);
  }

  for (const local of validActive.filter((item) => item.origin === 'project')) {
    const matchingGlobals = globalsByKey.get(conflictKey(local)) || [];
    for (const globalConstraint of matchingGlobals) {
      const hasSupersedes = local.supersedes.includes(globalConstraint.id);
      const localSpecificity = specificityFor(local);
      const globalSpecificity = specificityFor(globalConstraint);
      if (!hasSupersedes || localSpecificity < globalSpecificity) {
        result.violations.push(makeViolation(
          'ontology_override_conflict',
          'project-local constraint conflicts with a global constraint without explicit supersedes and equal-or-higher specificity',
          local,
          {
            globalConstraintId: globalConstraint.id,
            localSpecificity,
            globalSpecificity,
          },
        ));
      }
    }
  }

  result.checked = validActive.length;
  result.ok = result.violations.filter((item) => item.severity === 'error').length === 0;
  return result;
}

function printHelp() {
  console.log(`Usage: node ontology-constraint-validate.mjs --project-root <path> --json

Validates global and project-local ontology constraints. Optional files can be supplied with
--global-constraints <json-or-jsonl> and --project-constraints <json-or-jsonl>.`);
}

function cli() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const result = validateOntologyConstraints({
    projectRoot: args.projectRoot,
    globalConstraints: args.globalConstraints,
    projectConstraints: args.projectConstraints,
  });
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath && invokedPath === fileURLToPath(import.meta.url)) cli();
