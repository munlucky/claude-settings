#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { assignExecutionArtifactPaths, sanitizeSlug } from './agent-loop-phase-plan-lib.mjs';

const DEFAULT_PLAN_DIR = 'docs/implementation';
const DEFAULT_STATUS_FILE = '.claude/docs/phase-status.yaml';
const WORKFLOW_ENFORCEMENT_DIR = '.claude/logs/workflow-enforcement';
const ACTIVE_POINTER_FILES = [
  'current-run.json',
  'active-phase-run.json',
  'latest-dispatch.json',
];

function parseArgs(argv) {
  const options = {
    planDir: DEFAULT_PLAN_DIR,
    masterPlan: '',
    statusFile: DEFAULT_STATUS_FILE,
    executionRoot: '',
    archiveLabel: '',
    dryRun: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    switch (value) {
      case '--plan-dir':
        options.planDir = argv[++index] || '';
        break;
      case '--master-plan':
        options.masterPlan = argv[++index] || '';
        break;
      case '--status-file':
        options.statusFile = argv[++index] || '';
        break;
      case '--execution-root':
        options.executionRoot = argv[++index] || '';
        break;
      case '--archive-label':
        options.archiveLabel = argv[++index] || '';
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--help':
      case '-h':
        printUsage();
        process.exit(0);
        break;
      default:
        throw new Error(`unknown argument: ${value}`);
    }
  }

  return options;
}

function normalizePath(value) {
  return String(value || '').replace(/\\/g, '/');
}

function resolveFromCwd(value) {
  return path.resolve(process.cwd(), value);
}

function displayPath(absolutePath) {
  const relative = path.relative(process.cwd(), absolutePath);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    return normalizePath(absolutePath);
  }
  return normalizePath(relative);
}

function yamlScalar(value) {
  const stringValue = String(value ?? '').trim();
  if (!stringValue) {
    return '""';
  }
  return `"${stringValue.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function readMarkdownTitle(filePath, fallback) {
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/).slice(0, 20);
  for (const line of lines) {
    const match = line.match(/^#\s+(.+?)\s*$/);
    if (match) {
      return match[1].trim();
    }
  }
  return fallback;
}

function findMasterPlan(planDir) {
  const names = fs.existsSync(planDir)
    ? fs.readdirSync(planDir).filter((name) => /^00-master-plan.*\.md$/i.test(name)).sort()
    : [];
  if (names.length === 0) {
    throw new Error(`master plan not found in ${displayPath(planDir)}`);
  }
  return path.join(planDir, names.at(-1));
}

function listPhaseDocs(planDir) {
  if (!fs.existsSync(planDir)) {
    throw new Error(`plan directory not found: ${displayPath(planDir)}`);
  }

  return fs.readdirSync(planDir)
    .filter((name) => /^[0-9]{2}-.*\.md$/i.test(name))
    .filter((name) => !/^00-/i.test(name))
    .sort()
    .map((name) => {
      const number = Number.parseInt(name.slice(0, 2), 10);
      const filePath = path.join(planDir, name);
      return {
        number,
        filePath,
        title: readMarkdownTitle(filePath, `Phase ${String(number).padStart(2, '0')}`),
      };
    });
}

function makeArchiveLabel(masterPlan) {
  const date = new Date().toISOString().slice(0, 10);
  const masterSlug = planSlugFromMasterPlan(masterPlan);
  return `${date}-before-${masterSlug}-harness-state`;
}

function planSlugFromMasterPlan(masterPlan) {
  return sanitizeSlug(path.basename(masterPlan, path.extname(masterPlan)).replace(/^00-master-plan-?/i, '')) || 'plan';
}

function uniqueDirectory(baseDir) {
  if (!fs.existsSync(baseDir)) {
    return baseDir;
  }
  for (let index = 1; index < 1000; index += 1) {
    const candidate = `${baseDir}-${index}`;
    if (!fs.existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error(`could not allocate unique archive directory for ${displayPath(baseDir)}`);
}

function hasDirectoryEntries(directory) {
  return fs.existsSync(directory) && fs.statSync(directory).isDirectory() && fs.readdirSync(directory).length > 0;
}

function readJsonIfExists(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function pathMatchesPointer(value, expected) {
  return normalizePath(value) === normalizePath(expected);
}

function pointerIdentityStatus(payload, expected) {
  const refs = [
    { key: 'masterPlan', actual: payload?.masterPlan || '' },
    { key: 'executionRoot', actual: payload?.executionRoot || '' },
    { key: 'phaseRunLease.masterPlan', actual: payload?.phaseRunLease?.masterPlan || '' },
    { key: 'phaseRunLease.executionRoot', actual: payload?.phaseRunLease?.executionRoot || '' },
  ].filter((entry) => entry.actual);
  const staleRefs = refs.filter((entry) => {
    const wanted = entry.key.endsWith('masterPlan') ? expected.masterPlan : expected.executionRoot;
    return !pathMatchesPointer(entry.actual, wanted);
  });

  return {
    hasIdentity: refs.length > 0,
    stale: staleRefs.length > 0,
    staleRefs,
  };
}

function renderPreparedPointerPayload({ masterPlan, executionRoot, statusFile, planDir, preparedAt }) {
  const masterPlanDisplay = displayPath(masterPlan);
  const executionRootDisplay = displayPath(executionRoot);
  const statusFileDisplay = displayPath(statusFile);
  const planDirDisplay = displayPath(planDir);
  return {
    stateVersion: '1.0',
    status: 'prepared',
    preparedAt,
    updatedAt: preparedAt,
    masterPlan: masterPlanDisplay,
    executionRoot: executionRootDisplay,
    planDir: planDirDisplay,
    statusFile: statusFileDisplay,
    activeExecutionStatus: 'prepared',
    phaseRunLease: {
      stateVersion: '1.0',
      status: 'prepared',
      completionStatus: 'prepared',
      masterPlan: masterPlanDisplay,
      executionRoot: executionRootDisplay,
      planDir: planDirDisplay,
      statusFile: statusFileDisplay,
      attachedAt: preparedAt,
      lastHeartbeatAt: preparedAt,
      currentStage: 'prepared',
    },
  };
}

function collectWorkflowPointerState({ masterPlan, executionRoot, statusFile, planDir, archiveRoot, preparedAt }) {
  const workflowDir = resolveFromCwd(WORKFLOW_ENFORCEMENT_DIR);
  const expected = {
    masterPlan: displayPath(masterPlan),
    executionRoot: displayPath(executionRoot),
  };
  const pointerPayload = renderPreparedPointerPayload({ masterPlan, executionRoot, statusFile, planDir, preparedAt });
  const entries = [];

  for (const basename of ACTIVE_POINTER_FILES) {
    const filePath = path.join(workflowDir, basename);
    const payload = readJsonIfExists(filePath);
    const identity = pointerIdentityStatus(payload, expected);
    entries.push({
      basename,
      path: filePath,
      archivePath: path.join(archiveRoot, 'workflow-enforcement', basename),
      action: fs.existsSync(filePath) ? 'archive-and-rewrite' : 'write',
      existed: fs.existsSync(filePath),
      stale: identity.stale,
      staleRefs: identity.staleRefs,
      expectedIdentity: expected,
      payload: pointerPayload,
    });
  }

  if (fs.existsSync(workflowDir)) {
    for (const basename of fs.readdirSync(workflowDir).filter((name) => /^dispatch-.*\.json$/i.test(name)).sort()) {
      const filePath = path.join(workflowDir, basename);
      const payload = readJsonIfExists(filePath);
      const identity = pointerIdentityStatus(payload, expected);
      if (!identity.stale && identity.hasIdentity) {
        continue;
      }
      entries.push({
        basename,
        path: filePath,
        archivePath: path.join(archiveRoot, 'workflow-enforcement', basename),
        action: 'archive-stale-dispatch',
        existed: true,
        stale: identity.stale || !identity.hasIdentity,
        staleRefs: identity.staleRefs,
        expectedIdentity: expected,
        payload: null,
      });
    }
  }

  return entries;
}

function verifyPreparedPointers(pointerEntries) {
  const required = pointerEntries.filter((entry) => ACTIVE_POINTER_FILES.includes(entry.basename));
  for (const entry of required) {
    const payload = readJsonIfExists(entry.path);
    const identity = pointerIdentityStatus(payload, entry.expectedIdentity);
    if (!payload || identity.stale) {
      throw new Error(`workflow pointer identity self-check failed for ${displayPath(entry.path)}`);
    }
  }
}

function renderStatus({
  masterPlan,
  executionRoot,
  phases,
  preparedAt,
}) {
  const activePhase = phases[0] || null;
  const lines = [
    'schemaVersion: "1.0"',
    `masterPlan: ${yamlScalar(displayPath(masterPlan))}`,
    'autonomousMode: true',
    'executionMode: delegated-terminal',
    `executionRoot: ${yamlScalar(displayPath(executionRoot))}`,
    `preparedAt: ${yamlScalar(preparedAt)}`,
    'activeExecutionStatus: prepared',
    'activeCurrentStage: prepared',
    `activePhaseNumber: ${activePhase ? activePhase.number : 0}`,
    `activePhaseTitle: ${yamlScalar(activePhase ? activePhase.title : '')}`,
    `activePlannedPhases: ${phases.length}`,
    'activeCompletedPhases: 0',
    'activeBlockedPhases: 0',
    `activePendingPhases: ${phases.length}`,
    `activeRemainingPhases: ${phases.length}`,
    `activeActionablePhasesRemaining: ${phases.length}`,
    'normalizedRunVerdict: ""',
    'stopReasonClass: ""',
    'stopReasonExplanation: ""',
    'phases:',
  ];

  for (const phase of phases) {
    const paths = assignExecutionArtifactPaths(phase.number, phase.title, displayPath(executionRoot));
    lines.push(
      `  - number: ${phase.number}`,
      `    title: ${yamlScalar(phase.title)}`,
      '    status: pending',
      '    planConfirmed: true',
      `    activePhaseDoc: ${yamlScalar(displayPath(phase.filePath))}`,
      '    attempts:',
      '      total: 0',
      '      lastOutcome: pending',
      '      lastUpdatedAt: ""',
      `    sprintContract: ${yamlScalar(paths.phaseSprintContract)}`,
      `    qaReport: ${yamlScalar(paths.phaseQaReport)}`,
      `    handoff: ${yamlScalar(paths.phaseHandoff)}`,
      `    scorecard: ${yamlScalar(paths.phaseScorecard)}`,
    );
  }

  return `${lines.join('\n')}\n`;
}

function prepareImplementationPlanState(options) {
  const planDir = resolveFromCwd(options.planDir || DEFAULT_PLAN_DIR);
  const masterPlan = options.masterPlan ? resolveFromCwd(options.masterPlan) : findMasterPlan(planDir);
  const statusFile = resolveFromCwd(options.statusFile || DEFAULT_STATUS_FILE);
  const executionRoot = resolveFromCwd(options.executionRoot || path.join(displayPath(planDir), 'execution', planSlugFromMasterPlan(masterPlan)));
  const archiveLabel = options.archiveLabel || makeArchiveLabel(masterPlan);
  const archiveRoot = uniqueDirectory(path.join(planDir, 'archive', archiveLabel));
  const executionDir = path.join(planDir, 'execution');
  const closeDir = path.join(planDir, 'close');
  const phases = listPhaseDocs(planDir);
  const preparedAt = new Date().toISOString();
  const statusContent = renderStatus({ masterPlan, executionRoot, phases, preparedAt });
  const workflowPointers = collectWorkflowPointerState({
    masterPlan,
    executionRoot,
    statusFile,
    planDir,
    archiveRoot,
    preparedAt,
  });

  if (phases.length === 0) {
    throw new Error(`no phase docs found in ${displayPath(planDir)}`);
  }
  if (!fs.existsSync(masterPlan)) {
    throw new Error(`master plan not found: ${displayPath(masterPlan)}`);
  }

  const actions = [];
  if (hasDirectoryEntries(executionDir)) {
    actions.push({ type: 'move', from: displayPath(executionDir), to: displayPath(path.join(archiveRoot, 'execution')) });
  }
  if (hasDirectoryEntries(closeDir)) {
    actions.push({ type: 'move', from: displayPath(closeDir), to: displayPath(path.join(archiveRoot, 'close')) });
  }
  if (fs.existsSync(statusFile)) {
    actions.push({ type: 'copy', from: displayPath(statusFile), to: displayPath(path.join(archiveRoot, 'phase-status.yaml')) });
  }
  for (const pointer of workflowPointers) {
    if (pointer.existed) {
      actions.push({
        type: 'copy',
        from: displayPath(pointer.path),
        to: displayPath(pointer.archivePath),
        reason: pointer.action,
        stale: pointer.stale,
      });
    }
    if (pointer.payload) {
      actions.push({
        type: 'write',
        path: displayPath(pointer.path),
        reason: 'prepared-pointer-rewrite',
      });
    }
  }
  actions.push({ type: 'mkdir', path: displayPath(executionRoot) });
  actions.push({ type: 'write', path: displayPath(statusFile) });

  const summary = {
    ok: true,
    dryRun: Boolean(options.dryRun),
    planDir: displayPath(planDir),
    masterPlan: displayPath(masterPlan),
    statusFile: displayPath(statusFile),
    executionRoot: displayPath(executionRoot),
    archiveRoot: displayPath(archiveRoot),
    phases: phases.length,
    pointerSelfCheck: workflowPointers.map((pointer) => ({
      path: displayPath(pointer.path),
      action: pointer.action,
      existed: pointer.existed,
      stale: pointer.stale,
      staleRefs: pointer.staleRefs,
      expectedIdentity: pointer.expectedIdentity,
      rewriteIdentity: pointer.payload ? {
        masterPlan: pointer.payload.masterPlan,
        executionRoot: pointer.payload.executionRoot,
      } : null,
    })),
    actions,
  };

  if (options.dryRun) {
    return summary;
  }

  fs.mkdirSync(archiveRoot, { recursive: true });
  if (hasDirectoryEntries(executionDir)) {
    fs.renameSync(executionDir, path.join(archiveRoot, 'execution'));
  }
  if (hasDirectoryEntries(closeDir)) {
    fs.renameSync(closeDir, path.join(archiveRoot, 'close'));
  }
  if (fs.existsSync(statusFile)) {
    fs.mkdirSync(path.dirname(path.join(archiveRoot, 'phase-status.yaml')), { recursive: true });
    fs.copyFileSync(statusFile, path.join(archiveRoot, 'phase-status.yaml'));
  }
  for (const pointer of workflowPointers) {
    if (pointer.existed) {
      fs.mkdirSync(path.dirname(pointer.archivePath), { recursive: true });
      fs.copyFileSync(pointer.path, pointer.archivePath);
    }
    if (pointer.payload) {
      writeJson(pointer.path, pointer.payload);
    }
  }
  fs.mkdirSync(executionRoot, { recursive: true });
  fs.mkdirSync(path.dirname(statusFile), { recursive: true });
  fs.writeFileSync(statusFile, statusContent, 'utf8');
  verifyPreparedPointers(workflowPointers);

  return summary;
}

function printUsage() {
  process.stderr.write([
    'Usage:',
    '  prepare-implementation-plan-state.mjs [--plan-dir docs/implementation] [--master-plan <path>] [--status-file .claude/docs/phase-status.yaml] [--execution-root <path>] [--archive-label <label>] [--dry-run]',
    '',
    'Archives stale plan execution surfaces and rewrites the active phase-status pointer for a new plan package.',
  ].join('\n'));
  process.stderr.write('\n');
}

function main() {
  try {
    const summary = prepareImplementationPlanState(parseArgs(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main();
}

export {
  prepareImplementationPlanState,
  renderStatus,
};
