#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { assignExecutionArtifactPaths, sanitizeSlug } from './agent-loop-phase-plan-lib.mjs';

const DEFAULT_PLAN_DIR = 'docs/implementation';
const DEFAULT_STATUS_FILE = '.claude/docs/phase-status.yaml';

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
  fs.mkdirSync(executionRoot, { recursive: true });
  fs.mkdirSync(path.dirname(statusFile), { recursive: true });
  fs.writeFileSync(statusFile, statusContent, 'utf8');

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
