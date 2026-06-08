#!/usr/bin/env node
import crypto from 'node:crypto';
import { access, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { resolveRuntimeStatePath } from './lib/runtime-state-root.mjs';
import { acquireRunLease, recordResumeSnapshot, recordRuntimeEvent } from './lib/runtime-state-store.mjs';
import { gitStatusBranchLine } from './lib/git-safe.mjs';

const usage = () => `Usage: node scripts/prepare-phase-runner-state.mjs [--plan-dir <dir>] [--master-plan <file>] [--status-file <file>] [--execution-root <dir>] [--run-id <id>] [--goal-id <id>] [--workspace-id <id>] [--allow-parallel] [--lease-ttl-ms <ms>] [--dry-run] [--json]`;

const parseArgs = (argv) => {
  const options = {
    planDir: '',
    masterPlan: '',
    statusFile: '',
    executionRoot: '',
    runId: '',
    goalId: '',
    workspaceId: '',
    allowParallel: false,
    leaseTtlMs: '',
    dryRun: false,
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--plan-dir') {
      options.planDir = argv[++index] || '';
    } else if (arg === '--master-plan') {
      options.masterPlan = argv[++index] || '';
    } else if (arg === '--status-file') {
      options.statusFile = argv[++index] || '';
    } else if (arg === '--execution-root') {
      options.executionRoot = argv[++index] || '';
    } else if (arg === '--run-id') {
      options.runId = argv[++index] || '';
    } else if (arg === '--goal-id') {
      options.goalId = argv[++index] || '';
    } else if (arg === '--workspace-id') {
      options.workspaceId = argv[++index] || '';
    } else if (arg === '--allow-parallel') {
      options.allowParallel = true;
    } else if (arg === '--lease-ttl-ms') {
      options.leaseTtlMs = argv[++index] || '';
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}\n${usage()}`);
    }
  }

  return options;
};

const exists = async (target) => {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
};

const toPortable = (target) => target.split(path.sep).join('/');

const shortHash = (value) => crypto.createHash('sha1').update(String(value || '')).digest('hex').slice(0, 12);

const defaultRunId = () => {
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  return `phase-runner-${timestamp}-${crypto.randomUUID().slice(0, 8)}`;
};

const defaultExecutionRoot = (repoRoot, planDir) => {
  if (!planDir) {
    return path.join(repoRoot, 'docs', 'implementation', 'execution');
  }

  const relativePlanDir = toPortable(path.relative(repoRoot, planDir));
  const sourceRoadmapPrefix = 'docs/public/roadmaps/';
  if (relativePlanDir.startsWith(sourceRoadmapPrefix)) {
    const [roadmapSlug] = relativePlanDir.slice(sourceRoadmapPrefix.length).split('/');
    return path.join(repoRoot, 'docs', 'implementation', roadmapSlug, 'execution');
  }

  return path.join(planDir, 'execution');
};

const discoverPlanDirs = async (repoRoot) => {
  const implementationRoot = path.join(repoRoot, 'docs', 'implementation');
  if (!await exists(implementationRoot)) {
    return [];
  }

  const entries = await readdir(implementationRoot, { withFileTypes: true });
  const candidates = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const candidate = path.join(implementationRoot, entry.name);
    const files = await readdir(candidate);
    if (files.some((file) => /^00-master-plan-v\d+\.md$/.test(file))) {
      candidates.push(candidate);
    }
  }
  return candidates.sort();
};

const chooseMasterPlan = async (planDir, explicitMasterPlan) => {
  if (explicitMasterPlan) {
    return explicitMasterPlan;
  }
  const files = await readdir(planDir);
  const masters = files.filter((file) => /^00-master-plan-v\d+\.md$/.test(file)).sort();
  if (masters.length !== 1) {
    return null;
  }
  return path.join(planDir, masters[0]);
};

const masterPlanVersion = (masterPlan) => {
  const match = /^00-master-plan-(v\d+)\.md$/.exec(path.basename(masterPlan || ''));
  return match ? match[1] : '';
};

const listPhaseDocs = async (planDir, masterPlan = '') => {
  const files = await readdir(planDir);
  const version = masterPlanVersion(masterPlan);
  return files
    .filter((file) => /^\d{2}-.*\.md$/.test(file) && !file.startsWith('00-'))
    .filter((file) => !version || file.endsWith(`-${version}.md`))
    .sort();
};

const listReviewArtifacts = async (planDir) => {
  const reviewRoot = path.join(planDir, 'planning-loop');
  if (!await exists(reviewRoot)) {
    return [];
  }
  const files = await readdir(reviewRoot);
  return files.filter((file) => /(audit|review|quality|improvement)/i.test(file)).sort();
};

const titleFromPhaseFile = (file) => {
  const match = /^(\d{2})-(.*)-v\d+\.md$/.exec(file);
  if (!match) {
    return file;
  }
  return match[2]
    .split('-')
    .filter(Boolean)
    .map((word) => `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`)
    .join(' ');
};

const buildPhaseStates = (phaseDocs) => phaseDocs.map((file, index) => ({
  number: index + 1,
  doc: file,
  title: titleFromPhaseFile(file),
  status: index === 0 ? 'in_progress' : 'pending',
  attempts: {
    total: 0,
    lastOutcome: '',
    lastUpdatedAt: '',
  },
}));

const hasAheadClaim = (masterText) => /ahead\s+\d+/i.test(masterText) || /unpushed\s+commit/i.test(masterText);

const gitBranchLine = async () => gitStatusBranchLine(process.cwd());

const buildStatusYaml = (result) => {
  const lines = [
    `planDir: "${result.planDir}"`,
    `masterPlan: "${result.masterPlan}"`,
    `runId: "${result.runId}"`,
    `goalId: "${result.goalId}"`,
    `workspaceId: "${result.workspaceId}"`,
    `activeExecutionStatus: "${result.activeExecutionStatus}"`,
    `activePhaseDoc: "${result.activePhaseDoc}"`,
    `status: "${result.status}"`,
    `preparedAt: "${result.preparedAt}"`,
    'phaseDocs:',
  ];
  for (const file of result.phaseDocs) {
    lines.push(`  - "${file}"`);
  }
  lines.push('phases:');
  for (const phase of result.phases) {
    lines.push(`  - number: ${phase.number}`);
    lines.push(`    title: "${phase.title.replaceAll('"', '\\"')}"`);
    lines.push(`    doc: "${phase.doc}"`);
    lines.push(`    status: "${phase.status}"`);
    lines.push('    attempts:');
    lines.push(`      total: ${phase.attempts.total}`);
    lines.push(`      lastOutcome: "${phase.attempts.lastOutcome}"`);
    lines.push(`      lastUpdatedAt: "${phase.attempts.lastUpdatedAt}"`);
  }
  lines.push('warnings:');
  for (const warning of result.warnings) {
    lines.push(`  - "${warning.replaceAll('"', '\\"')}"`);
  }
  return `${lines.join('\n')}\n`;
};

const main = async () => {
  const options = parseArgs(process.argv.slice(2));
  const repoRoot = process.cwd();
  const warnings = [];
  const errors = [];

  let planDir = options.planDir ? path.resolve(options.planDir) : '';
  if (!planDir) {
    const discovered = await discoverPlanDirs(repoRoot);
    if (discovered.length === 1) {
      planDir = discovered[0];
    } else if (discovered.length === 0) {
      errors.push('No docs/implementation plan package with 00-master-plan-v*.md was found.');
    } else {
      errors.push(`Implicit plan resolution is ambiguous: ${discovered.map((dir) => toPortable(path.relative(repoRoot, dir))).join(', ')}`);
    }
  }

  let masterPlan = '';
  let phaseDocs = [];
  let reviewArtifacts = [];
  if (planDir && await exists(planDir)) {
    masterPlan = await chooseMasterPlan(planDir, options.masterPlan ? path.resolve(options.masterPlan) : '');
    if (!masterPlan) {
      errors.push('Plan package must contain exactly one 00-master-plan-v*.md or pass --master-plan.');
    } else if (!await exists(masterPlan)) {
      errors.push(`Master plan does not exist: ${toPortable(masterPlan)}`);
    }
    phaseDocs = await listPhaseDocs(planDir, masterPlan);
    reviewArtifacts = await listReviewArtifacts(planDir);
  } else if (planDir) {
    errors.push(`Plan directory does not exist: ${toPortable(planDir)}`);
  }

  if (phaseDocs.length === 0) {
    errors.push('Plan package has no phase docs matching NN-*.md.');
  }
  if (reviewArtifacts.length === 0) {
    warnings.push('No planning-loop review/audit artifacts were found; delegated review evidence is missing.');
  }

  if (masterPlan && await exists(masterPlan)) {
    const masterText = await readFile(masterPlan, 'utf8');
    const branch = await gitBranchLine();
    if (hasAheadClaim(masterText) && !/ahead\s+\d+/.test(branch)) {
      warnings.push('Master plan mentions unpushed/ahead commits, but current git branch is not ahead.');
    }
  }

  const executionRoot = options.executionRoot
    ? path.resolve(options.executionRoot)
    : defaultExecutionRoot(repoRoot, planDir);
  const statusFile = options.statusFile
    ? path.resolve(options.statusFile)
    : resolveRuntimeStatePath('docs', 'phase-status.yaml');
  const closeoutFile = path.join(executionRoot, 'phase-runner-readiness.json');
  const runId = options.runId || defaultRunId();
  const goalId = options.goalId || (planDir ? path.basename(planDir) : 'phase-runner');
  const workspaceId = options.workspaceId || `workspace-${shortHash(repoRoot)}`;
  const status = errors.length > 0 ? 'blocked' : reviewArtifacts.length === 0 ? 'docs_only' : 'ready';
  const phases = buildPhaseStates(phaseDocs);
  const preparedAt = new Date().toISOString();
  const result = {
    status,
    activeExecutionStatus: errors.length > 0 ? 'blocked' : 'active',
    activePhaseDoc: phaseDocs[0] || '',
    preparedAt,
    dryRun: options.dryRun,
    runId,
    goalId,
    workspaceId,
    allowParallel: options.allowParallel,
    leaseTtlMs: options.leaseTtlMs,
    planDir: planDir ? toPortable(path.relative(repoRoot, planDir)) || '.' : '',
    masterPlan: masterPlan ? toPortable(path.relative(repoRoot, masterPlan)) : '',
    phaseDocs,
    phases,
    reviewArtifacts,
    plannedWrites: [
      toPortable(path.relative(repoRoot, statusFile)),
      toPortable(path.relative(repoRoot, closeoutFile)),
    ],
    warnings,
    errors,
  };
  const identity = {
    planDir: result.planDir,
    masterPlan: result.masterPlan,
    workspacePathHash: shortHash(repoRoot),
  };

  if (!options.dryRun && errors.length === 0) {
    result.runLease = await acquireRunLease({
      runId,
      goalId,
      workspaceId,
      identity,
      allowParallel: options.allowParallel,
      leaseTtlMs: options.leaseTtlMs,
    });
    if (result.runLease.status === 'blocked') {
      result.status = 'blocked';
      errors.push(result.runLease.reason);
    }
  }

  if (!options.dryRun && errors.length === 0) {
    try {
      result.phaseStartEvent = await recordRuntimeEvent({
        runId,
        goalId,
        workspaceId,
        eventType: 'phase.start',
        severity: 'info',
        payload: {
          planDir: result.planDir,
          masterPlan: result.masterPlan,
          phaseDoc: result.activePhaseDoc,
          phaseNumber: result.phases[0]?.number ?? null,
          workspaceId,
        },
        identity,
      });
      result.runtimeSnapshot = await recordResumeSnapshot({
        runId,
        goalId,
        workspaceId,
        status: result,
        resumeBrief: {
          nextAction: phaseDocs[0] || '',
          currentBlocker: '',
          lineage: [result.planDir, result.masterPlan],
        },
        identity,
      });
    } catch (error) {
      warnings.push(`Runtime resume snapshot was not recorded: ${error instanceof Error ? error.message : String(error)}`);
    }
    await mkdir(path.dirname(statusFile), { recursive: true });
    await mkdir(executionRoot, { recursive: true });
    await writeFile(statusFile, buildStatusYaml(result));
    await writeFile(closeoutFile, `${JSON.stringify(result, null, 2)}\n`);
  }

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`${result.status}: ${result.planDir || '(no plan)'}`);
    for (const warning of warnings) {
      console.log(`warning: ${warning}`);
    }
    for (const error of errors) {
      console.error(`error: ${error}`);
    }
  }

  if (errors.length > 0) {
    process.exitCode = 2;
  }
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
