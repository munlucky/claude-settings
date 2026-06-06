#!/usr/bin/env node
import { access, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const usage = () => `Usage: node scripts/prepare-phase-runner-state.mjs [--plan-dir <dir>] [--master-plan <file>] [--status-file <file>] [--execution-root <dir>] [--dry-run] [--json]`;

const parseArgs = (argv) => {
  const options = {
    planDir: '',
    masterPlan: '',
    statusFile: '.claude/docs/phase-status.yaml',
    executionRoot: '',
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

const listPhaseDocs = async (planDir) => {
  const files = await readdir(planDir);
  return files.filter((file) => /^\d{2}-.*\.md$/.test(file) && !file.startsWith('00-')).sort();
};

const listReviewArtifacts = async (planDir) => {
  const reviewRoot = path.join(planDir, 'planning-loop');
  if (!await exists(reviewRoot)) {
    return [];
  }
  const files = await readdir(reviewRoot);
  return files.filter((file) => /(audit|review|quality|improvement)/i.test(file)).sort();
};

const hasAheadClaim = (masterText) => /ahead\s+\d+/i.test(masterText) || /unpushed\s+commit/i.test(masterText);

const gitBranchLine = async () => {
  const { spawnSync } = await import('node:child_process');
  const result = spawnSync('git', ['status', '--short', '--branch'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    return '';
  }
  return result.stdout.split(/\r?\n/)[0] || '';
};

const buildStatusYaml = (result) => {
  const lines = [
    `planDir: "${result.planDir}"`,
    `masterPlan: "${result.masterPlan}"`,
    `status: "${result.status}"`,
    `preparedAt: "${result.preparedAt}"`,
    'phaseDocs:',
  ];
  for (const file of result.phaseDocs) {
    lines.push(`  - "${file}"`);
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
    phaseDocs = await listPhaseDocs(planDir);
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
    : path.join(planDir || repoRoot, 'execution');
  const statusFile = path.resolve(options.statusFile || '.claude/docs/phase-status.yaml');
  const closeoutFile = path.join(executionRoot, 'phase-runner-readiness.json');
  const status = errors.length > 0 ? 'blocked' : reviewArtifacts.length === 0 ? 'docs_only' : 'ready';
  const preparedAt = new Date().toISOString();
  const result = {
    status,
    preparedAt,
    dryRun: options.dryRun,
    planDir: planDir ? toPortable(path.relative(repoRoot, planDir)) || '.' : '',
    masterPlan: masterPlan ? toPortable(path.relative(repoRoot, masterPlan)) : '',
    phaseDocs,
    reviewArtifacts,
    plannedWrites: [
      toPortable(path.relative(repoRoot, statusFile)),
      toPortable(path.relative(repoRoot, closeoutFile)),
    ],
    warnings,
    errors,
  };

  if (!options.dryRun && errors.length === 0) {
    await mkdir(path.dirname(statusFile), { recursive: true });
    await mkdir(executionRoot, { recursive: true });
    await writeFile(statusFile, buildStatusYaml(result));
    await writeFile(closeoutFile, `${JSON.stringify(result, null, 2)}\n`);
  }

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`${status}: ${result.planDir || '(no plan)'}`);
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
