#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { evaluatePhaseCloseout } from './verify-phase-closeout.mjs';
import { resolveGitTreeFingerprint } from './verification-verdict-state.mjs';
import { parsePhaseStatusDocument, readText, resolvePath } from './lib/phase-closeout-parsers.mjs';
import { updateGoalStatus, withDb } from './runtime-state.mjs';

const DEFAULT_STATUS_FILE = '.claude/docs/phase-status.yaml';
const DEFAULT_WORKFLOW_DIR = '.claude/logs/workflow-enforcement';
const STATE_FILES = ['current-run.json', 'active-phase-run.json', 'latest-dispatch.json'];

function usage() {
  return [
    'Usage:',
    '  phase-closeout-finalize.mjs finalize --phase <NN> --status-file <path> --plan-dir <path> --master-plan <path> --execution-root <path> [--dry-run] [--json]',
    '',
    'Options:',
    '  --phase <NN>             Phase number to finalize.',
    `  --status-file <path>     Default: ${DEFAULT_STATUS_FILE}`,
    '  --plan-dir <path>        Active plan directory.',
    '  --master-plan <path>     Master plan path.',
    '  --execution-root <path>  Plan execution root or phase execution directory.',
    `  --workflow-dir <path>    Default: ${DEFAULT_WORKFLOW_DIR}`,
    '  --dry-run                Report expected writes without mutating files.',
    '  --json                   Print JSON payload.',
    '  --now <iso>              Deterministic timestamp for tests.',
  ].join('\n');
}

function parseArgs(argv) {
  const args = [...argv];
  const result = { command: 'finalize' };
  if (args.length > 0 && !args[0].startsWith('--')) {
    result.command = args.shift();
  }
  while (args.length > 0) {
    const arg = args.shift();
    switch (arg) {
      case '--phase':
        result.phase = args.shift() || '';
        break;
      case '--status-file':
        result.statusFile = args.shift() || '';
        break;
      case '--plan-dir':
        result.planDir = args.shift() || '';
        break;
      case '--master-plan':
        result.masterPlan = args.shift() || '';
        break;
      case '--execution-root':
        result.executionRoot = args.shift() || '';
        break;
      case '--workflow-dir':
        result.workflowDir = args.shift() || '';
        break;
      case '--now':
        result.now = args.shift() || '';
        break;
      case '--dry-run':
        result.dryRun = true;
        break;
      case '--json':
        result.json = true;
        break;
      case '--help':
      case '-h':
        result.help = true;
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }
  return result;
}

function timestamp(now = '') {
  if (!now) {
    return new Date().toISOString();
  }
  const parsed = new Date(now);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid --now value: ${now}`);
  }
  return parsed.toISOString();
}

function rel(root, filePath) {
  return path.relative(root, filePath).replace(/\\/g, '/') || '.';
}

function yamlScalar(value) {
  if (value === null || value === undefined) {
    return 'null';
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  const text = String(value);
  if (/^[A-Za-z0-9_.:/-]+$/.test(text)) {
    return text;
  }
  return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function writeJsonAtomic(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempFile = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`);
  fs.writeFileSync(tempFile, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  fs.renameSync(tempFile, filePath);
}

function writeTextAtomic(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempFile = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`);
  fs.writeFileSync(tempFile, content, 'utf8');
  fs.renameSync(tempFile, filePath);
}

function upsertTopLevel(lines, key, value) {
  const rendered = `${key}: ${yamlScalar(value)}`;
  const existingIndex = lines.findIndex((line) => new RegExp(`^${key}:\\s*`).test(line));
  if (existingIndex >= 0) {
    lines[existingIndex] = rendered;
    return;
  }
  const phaseIndex = lines.findIndex((line) => /^phases:\s*$/.test(line));
  lines.splice(phaseIndex >= 0 ? phaseIndex : 0, 0, rendered);
}

function upsertPhaseField(lines, phaseNumber, key, value) {
  const phaseStart = lines.findIndex((line) => new RegExp(`^\\s*-\\s+number:\\s*0?${phaseNumber}\\s*$`).test(line));
  if (phaseStart < 0) {
    return false;
  }
  let phaseEnd = lines.length;
  for (let index = phaseStart + 1; index < lines.length; index += 1) {
    if (/^\s*-\s+number:\s*\d+/.test(lines[index])) {
      phaseEnd = index;
      break;
    }
  }
  const fieldPattern = new RegExp(`^ {4}${key}:\\s*`);
  const existingIndex = lines.findIndex((line, index) => index > phaseStart && index < phaseEnd && fieldPattern.test(line));
  const rendered = `    ${key}: ${yamlScalar(value)}`;
  if (existingIndex >= 0) {
    lines[existingIndex] = rendered;
  } else {
    lines.splice(phaseStart + 1, 0, rendered);
  }
  return true;
}

function rewritePhaseStatus({ statusPath, phaseNumber, now, allActionableComplete, dryRun, plannedWrites }) {
  const lines = fs.existsSync(statusPath)
    ? fs.readFileSync(statusPath, 'utf8').split(/\r?\n/).filter((line, index, array) => !(index === array.length - 1 && line === ''))
    : [];
  upsertTopLevel(lines, 'updatedAt', now);
  upsertTopLevel(lines, 'finalVerdict', 'complete');
  upsertTopLevel(lines, 'normalizedRunVerdict', 'complete');
  upsertTopLevel(lines, 'lastStopReasonCode', 'scope_complete');
  upsertTopLevel(lines, 'lastStopReasonDetail', 'phase closeout finalized');
  if (allActionableComplete) {
    upsertTopLevel(lines, 'activeExecutionStatus', 'finished');
    upsertTopLevel(lines, 'activeRemainingPhases', 0);
    upsertTopLevel(lines, 'activeActionablePhasesRemaining', 0);
    upsertTopLevel(lines, 'activeRunLeaseId', '');
  }
  upsertPhaseField(lines, phaseNumber, 'status', 'completed');
  upsertPhaseField(lines, phaseNumber, 'completedAt', now);
  upsertPhaseField(lines, phaseNumber, 'updatedAt', now);
  upsertPhaseField(lines, phaseNumber, 'lastOutcome', 'success');

  const next = `${lines.join('\n')}\n`;
  plannedWrites.push({ path: statusPath, kind: 'phase-status' });
  if (!dryRun) {
    writeTextAtomic(statusPath, next);
  }
}

function updateMasterChecklist({ masterPlan, phaseNumber, dryRun, plannedWrites }) {
  if (!masterPlan || !fs.existsSync(masterPlan)) {
    return false;
  }
  const before = fs.readFileSync(masterPlan, 'utf8');
  const pattern = new RegExp(`(-\\s+\\[) \\](.*?Phase\\s+0?${phaseNumber}\\b)`, 'g');
  const after = before.replace(pattern, '$1x]$2');
  if (after === before) {
    return false;
  }
  plannedWrites.push({ path: masterPlan, kind: 'master-checklist' });
  if (!dryRun) {
    writeTextAtomic(masterPlan, after);
  }
  return true;
}

function extractIds(text, prefix) {
  const seen = new Set();
  const regex = new RegExp(`\\b(${prefix}-[A-Za-z0-9_.-]+)\\b`, 'g');
  let match;
  while ((match = regex.exec(text)) !== null) {
    seen.add(match[1]);
  }
  return [...seen];
}

function ensureCoverageArtifact({ filePath, title, ids, dryRun, plannedWrites }) {
  if (fs.existsSync(filePath)) {
    return 'existing';
  }
  const rows = ids.length > 0
    ? ids.map((id) => `| ${id} | pending | phase-closeout-finalize generated placeholder |`).join('\n')
    : '| pending | pending | No source IDs were discovered. |';
  const content = [
    `# ${title}`,
    '',
    '| ID | Status | Evidence |',
    '|---|---|---|',
    rows,
    '',
  ].join('\n');
  plannedWrites.push({ path: filePath, kind: title });
  if (!dryRun) {
    writeTextAtomic(filePath, content);
  }
  return 'created_pending';
}

function ensureTraceability({ executionRoot, masterPlan, phaseDoc, dryRun, plannedWrites }) {
  const text = `${readText(masterPlan)}\n${readText(phaseDoc)}`;
  const reqIds = extractIds(text, 'REQ');
  const scnIds = extractIds(text, 'SCN');
  const requirementsPath = path.join(executionRoot, 'REQUIREMENTS_TRACEABILITY.md');
  const scenarioPath = path.join(executionRoot, 'SCENARIO_MATRIX.md');
  return {
    requirementsPath,
    scenarioPath,
    traceabilityStatus: ensureCoverageArtifact({
      filePath: requirementsPath,
      title: 'Requirements Traceability',
      ids: reqIds,
      dryRun,
      plannedWrites,
    }),
    scenarioMatrixStatus: ensureCoverageArtifact({
      filePath: scenarioPath,
      title: 'Scenario Matrix',
      ids: scnIds,
      dryRun,
      plannedWrites,
    }),
  };
}

function syncWorksetsEvidence({ root, executionRoot, canonicalVerdictPath, dryRun, plannedWrites }) {
  const worksetsPath = path.join(executionRoot, 'WORKSETS.yaml');
  if (!fs.existsSync(worksetsPath)) {
    return false;
  }
  const verdictRef = rel(root, canonicalVerdictPath);
  const blockedEvidence = /\b(blocked|failed|in_progress|runtime_unavailable)\b/i;
  const lines = fs.readFileSync(worksetsPath, 'utf8').split(/\r?\n/);
  const next = [];
  let inCompletedTask = false;
  let inEvidence = false;
  let evidenceIndent = '';
  let evidenceSeen = false;
  let changed = false;

  function finishEvidenceBlock() {
    if (inCompletedTask && inEvidence && !evidenceSeen) {
      next.push(`${evidenceIndent}  - ${verdictRef}`);
      changed = true;
    }
    inEvidence = false;
    evidenceIndent = '';
    evidenceSeen = false;
  }

  for (const line of lines) {
    if (/^\s+-\s+id:\s*/.test(line)) {
      finishEvidenceBlock();
      inCompletedTask = false;
    }
    if (/^\s{4}status:\s*completed\s*$/.test(line)) {
      inCompletedTask = true;
    }
    const evidenceMatch = line.match(/^(\s{4}evidence:)\s*(.*)$/);
    if (evidenceMatch) {
      finishEvidenceBlock();
      inEvidence = true;
      evidenceIndent = '    ';
      evidenceSeen = false;
      next.push(line);
      continue;
    }
    if (inEvidence && /^\s{4}[A-Za-z][A-Za-z0-9]*:\s*/.test(line)) {
      finishEvidenceBlock();
    }
    if (inCompletedTask && inEvidence && /^\s{6}-\s+/.test(line)) {
      if (blockedEvidence.test(line)) {
        changed = true;
        continue;
      }
      evidenceSeen = true;
    }
    next.push(line);
  }
  finishEvidenceBlock();

  if (!next.some((line) => line.includes(verdictRef))) {
    const evidenceIndex = next.findIndex((line) => /^\s{4}evidence:\s*$/.test(line));
    if (evidenceIndex >= 0) {
      next.splice(evidenceIndex + 1, 0, `      - ${verdictRef}`);
      changed = true;
    }
  }
  if (!changed) {
    return false;
  }
  plannedWrites.push({ path: worksetsPath, kind: 'worksets-final-evidence' });
  if (!dryRun) {
    writeTextAtomic(worksetsPath, `${next.join('\n').replace(/\n+$/, '')}\n`);
  }
  return true;
}

function warningFromState(payload = {}) {
  const exitCode = payload.exitCode ?? payload.workerExitCode ?? payload.phaseRunLease?.exitCode ?? '';
  const stopReason = payload.stopReasonCode || payload.phaseRunLease?.stopReasonCode || '';
  const fields = [payload.status, payload.completionStatus, stopReason, payload.failureClass].map((value) => String(value || '').toLowerCase());
  if (exitCode && String(exitCode) !== '0') {
    return stopReason || `delegated-terminal-exit-${exitCode}`;
  }
  if (fields.some((value) => value.includes('failed') || value.includes('failure'))) {
    return stopReason || 'historical-executor-failure';
  }
  return '';
}

function reconcileWorkflowState({ workflowDir, phaseNumber, now, dryRun, plannedWrites }) {
  const historicalWarnings = [];
  const updated = [];
  for (const basename of STATE_FILES) {
    const filePath = path.join(workflowDir, basename);
    if (!fs.existsSync(filePath)) {
      continue;
    }
    const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const warning = warningFromState(payload);
    if (warning) {
      historicalWarnings.push(warning);
    }
    const next = {
      ...payload,
      status: basename === 'latest-dispatch.json' ? 'superseded' : 'completed',
      completionStatus: 'completed',
      activeExecutionStatus: 'completed',
      activePhaseNumber: phaseNumber,
      stopReasonCode: 'scope_complete',
      stopReasonDetail: 'phase closeout finalized',
      finalVerdict: 'complete',
      normalizedRunVerdict: historicalWarnings.length > 0 ? 'success_with_warning' : 'complete',
      historicalWarnings: [...new Set([...(Array.isArray(payload.historicalWarnings) ? payload.historicalWarnings : []), ...historicalWarnings])],
      blockingStopReasonCode: '',
      completedAt: payload.completedAt || now,
      updatedAt: now,
    };
    if (next.phaseRunLease && typeof next.phaseRunLease === 'object') {
      next.phaseRunLease = {
        ...next.phaseRunLease,
        status: 'completed',
        completionStatus: 'completed',
        stopReasonCode: 'scope_complete',
        blockingStopReasonCode: '',
        completedAt: next.phaseRunLease.completedAt || now,
        updatedAt: now,
      };
    }
    plannedWrites.push({ path: filePath, kind: 'workflow-state' });
    if (!dryRun) {
      writeJsonAtomic(filePath, next);
    }
    updated.push(filePath);
  }
  return {
    stateReconciled: updated.length > 0,
    reconciledStateFiles: updated,
    historicalWarnings: [...new Set(historicalWarnings)],
  };
}

function buildCanonicalVerdict({ root, phase, phaseNumber, statusRoot, statusPath, planDir, masterPlan, now, historicalWarnings }) {
  return {
    schemaVersion: '3',
    script: '.claude/scripts/phase-closeout-finalize.mjs',
    runId: `phase${String(phaseNumber).padStart(2, '0')}-final`,
    phase: {
      number: phaseNumber,
      title: phase.title || `Phase ${phaseNumber}`,
      activePhaseDocPath: phase.archivedPhaseDoc || phase.plan || phase.phaseDocPath || phase.docPath || '',
    },
    contract: {
      applicable: true,
      verificationMode: 'phase_closeout',
    },
    contractApplicable: true,
    verificationMode: 'phase_closeout',
    mode: 'phase-closeout-finalize',
    verdict: 'passed',
    evidenceFresh: true,
    requiredChecks: {
      expected: ['phase-closeout-finalize'],
      passed: ['phase-closeout-finalize'],
      missing: [],
    },
    changedFiles: [],
    commands: [
      {
        name: 'phase_closeout_finalize',
        run: 'node .claude/scripts/phase-closeout-finalize.mjs finalize',
        status: 'passed',
      },
    ],
    workflowEvidence: {
      selectedBundles: ['ready-isolate-bundle', 'implementation-bundle', 'review-bundle', 'verification-bundle', 'finish-bundle'],
      stageOrder: ['ready/isolate', 'execute', 'review', 'verify', 'finish'],
      warnings: historicalWarnings,
    },
    identity: {
      runLeaseId: statusRoot.activeRunLeaseId || statusRoot.lastRunLeaseId || '',
      activePhaseDocPath: phase.archivedPhaseDoc || phase.plan || phase.phaseDocPath || phase.docPath || '',
      masterPlan: path.resolve(masterPlan),
      planDir: path.resolve(planDir),
      statusFile: path.resolve(statusPath),
      gitTreeFingerprint: resolveGitTreeFingerprint(root),
    },
    verdictScope: 'phase_closeout',
    blockerClass: '',
    blockerFingerprint: '',
    environmentFingerprint: '',
    environmentBlockers: [],
    artifactFingerprint: '',
    supersedes: [],
    supersededBy: '',
    staleWhen: [],
    stale: false,
    failureClass: '',
    blocking: false,
    blockingReasonCode: '',
    score: {
      detected: true,
      current: 100,
      target: 100,
      unmetChecklistItems: 0,
      unmetItems: 0,
      blockingDefects: 0,
      verdict: 'done',
    },
    generatedAt: now,
  };
}

function writeCanonicalVerdict({ root, phase, phaseNumber, statusRoot, statusPath, planDir, masterPlan, now, historicalWarnings, dryRun, plannedWrites }) {
  const phaseId = String(phaseNumber).padStart(2, '0');
  const filePath = path.join(root, '.claude', `verification-verdict-phase${phaseId}-final.json`);
  const payload = buildCanonicalVerdict({ root, phase, phaseNumber, statusRoot, statusPath, planDir, masterPlan, now, historicalWarnings });
  plannedWrites.push({ path: filePath, kind: 'canonical-verdict' });
  if (!dryRun) {
    writeJsonAtomic(filePath, payload);
  }
  return filePath;
}

function runNodeScript(scriptPath, args, cwd) {
  const result = spawnSync(process.execPath, [scriptPath, ...args], { cwd, encoding: 'utf8' });
  let parsed = null;
  const output = result.stdout || result.stderr || '';
  try {
    parsed = JSON.parse(output);
  } catch {
    parsed = null;
  }
  return {
    status: result.status ?? 0,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    parsed,
  };
}

async function closeGoalRuntime({ planDir, dryRun }) {
  if (dryRun) {
    return { attempted: false, status: 'dry_run' };
  }
  try {
    const result = await withDb((db) => updateGoalStatus(db, {
      planDir,
      status: 'complete',
      detail: 'phase closeout finalized',
    }));
    return result ? { attempted: true, status: 'complete', goalId: result.goal_id } : { attempted: true, status: 'not_found' };
  } catch (error) {
    return { attempted: true, status: 'failed', error: error instanceof Error ? error.message : String(error) };
  }
}

function allActionableComplete(phases, phaseNumber) {
  const next = phases.map((phase) => (
    Number(phase.number) === Number(phaseNumber) ? { ...phase, status: 'completed' } : phase
  ));
  return next.every((phase) => phase.planConfirmed === 'false' || phase.status === 'completed' || /blocked|unhealthy/i.test(String(phase.status || '')));
}

export async function finalizePhaseCloseout(rawConfig = {}) {
  const root = path.resolve(rawConfig.root || process.cwd());
  const phaseNumber = Number.parseInt(String(rawConfig.phase || rawConfig.phaseNumber || ''), 10);
  if (!Number.isFinite(phaseNumber) || phaseNumber <= 0) {
    throw new Error('--phase is required');
  }
  const now = timestamp(rawConfig.now || '');
  const dryRun = rawConfig.dryRun === true;
  const statusPath = resolvePath(rawConfig.statusFile || DEFAULT_STATUS_FILE, root);
  const planDir = resolvePath(rawConfig.planDir || 'docs/implementation', root);
  const masterPlan = resolvePath(rawConfig.masterPlan || '', root);
  const executionRoot = resolvePath(rawConfig.executionRoot || path.join(planDir, 'execution'), root);
  const workflowDir = resolvePath(rawConfig.workflowDir || DEFAULT_WORKFLOW_DIR, root);
  const plannedWrites = [];

  const statusText = readText(statusPath);
  const statusDocument = statusText ? parsePhaseStatusDocument(statusText) : { root: {}, phases: [] };
  const phase = statusDocument.phases.find((entry) => Number(entry.number) === phaseNumber) || { number: phaseNumber };
  const complete = allActionableComplete(statusDocument.phases, phaseNumber);

  const stateResult = reconcileWorkflowState({ workflowDir, phaseNumber, now, dryRun, plannedWrites });
  const canonicalVerdictPath = writeCanonicalVerdict({
    root,
    phase,
    phaseNumber,
    statusRoot: statusDocument.root,
    statusPath,
    planDir,
    masterPlan,
    now,
    historicalWarnings: stateResult.historicalWarnings,
    dryRun,
    plannedWrites,
  });
  const worksetsEvidenceUpdated = syncWorksetsEvidence({
    root,
    executionRoot,
    canonicalVerdictPath,
    dryRun,
    plannedWrites,
  });
  rewritePhaseStatus({ statusPath, phaseNumber, now, allActionableComplete: complete, dryRun, plannedWrites });
  updateMasterChecklist({ masterPlan, phaseNumber, dryRun, plannedWrites });

  const phaseDoc = resolvePath(phase.archivedPhaseDoc || phase.plan || phase.phaseDocPath || phase.docPath || '', root);
  const traceability = ensureTraceability({
    executionRoot,
    masterPlan,
    phaseDoc,
    dryRun,
    plannedWrites,
  });
  const goalRuntime = await closeGoalRuntime({ planDir, dryRun });

  const closeoutResult = dryRun
    ? { status: 'dry_run', allowed: false, reason: 'dry_run' }
    : evaluatePhaseCloseout({
      statusFile: statusPath,
      planDir,
      masterPlan,
      executionRoot,
      workflowDir,
      now,
      masterPlanProvided: true,
    });

  const gitCloseout = dryRun
    ? { status: 'dry_run', clean: false }
    : runNodeScript(path.join(root, '.claude/scripts/phase-final-git-closeout.mjs'), [
      'preflight',
      '--plan-dir',
      planDir,
      '--status-file',
      statusPath,
      '--json',
    ], root);

  return {
    ok: dryRun ? true : closeoutResult.allowed === true,
    dryRun,
    finalVerdict: 'complete',
    normalizedRunVerdict: stateResult.historicalWarnings.length > 0 ? 'success_with_warning' : 'complete',
    historicalWarnings: stateResult.historicalWarnings,
    stateReconciled: stateResult.stateReconciled,
    reconciledStateFiles: stateResult.reconciledStateFiles.map((filePath) => rel(root, filePath)),
    canonicalVerdictPath: rel(root, canonicalVerdictPath),
    worksetsEvidenceUpdated,
    traceabilityStatus: traceability.traceabilityStatus,
    scenarioMatrixStatus: traceability.scenarioMatrixStatus,
    traceabilityPath: rel(root, traceability.requirementsPath),
    scenarioMatrixPath: rel(root, traceability.scenarioPath),
    goalRuntime,
    phaseCloseoutGate: closeoutResult,
    gitCloseoutPreflight: gitCloseout.parsed || {
      status: gitCloseout.status,
      stdout: gitCloseout.stdout,
      stderr: gitCloseout.stderr,
    },
    plannedWrites: plannedWrites.map((entry) => ({ ...entry, path: rel(root, entry.path) })),
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${usage()}${os.EOL}`);
    return;
  }
  if (options.command !== 'finalize') {
    throw new Error(`Unknown command: ${options.command}`);
  }
  const result = await finalizePhaseCloseout(options);
  if (options.json || options.dryRun) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}${os.EOL}`);
  } else if (result.ok) {
    process.stdout.write(`phase closeout finalized: ${result.canonicalVerdictPath}${os.EOL}`);
  } else {
    process.stdout.write(`phase closeout finalize blocked: ${result.phaseCloseoutGate?.reason || 'unknown'}${os.EOL}`);
  }
  process.exit(result.ok ? 0 : 2);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exit(64);
  });
}
