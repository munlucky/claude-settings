#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_STATUS_FILE = '.claude/docs/phase-status.yaml';
const DEFAULT_WORKFLOW_DIR = '.claude/logs/workflow-enforcement';

function valueAfter(argv, flag) {
  const index = argv.indexOf(flag);
  return index >= 0 && index + 1 < argv.length ? argv[index + 1] : '';
}

function resolveRootDir(argv = process.argv.slice(2)) {
  const rootArg = valueAfter(argv, '--root');
  if (rootArg) return path.resolve(rootArg);
  if (fs.existsSync(path.join(process.cwd(), '.claude'))) return process.cwd();
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
}

function resolveOverlayPath(rootDir, overlayRoot, relativePath) {
  const normalized = String(relativePath || '').replaceAll('\\', '/');
  const overlay = overlayRoot ? path.resolve(rootDir, overlayRoot) : '';
  const overlayPath = overlay ? path.join(overlay, ...normalized.split('/')) : '';
  if (overlayPath && fs.existsSync(overlayPath)) return overlayPath;
  return path.join(rootDir, ...normalized.split('/'));
}

function stripQuotes(value) {
  return String(value ?? '').trim().replace(/^"|"$/g, '');
}

function parseRootScalar(lines, key) {
  for (const raw of lines) {
    if (raw.trim() === 'phases:') return '';
    const match = raw.match(new RegExp(`^${key}:\\s*(.+?)\\s*$`));
    if (match) return stripQuotes(match[1]);
  }
  return '';
}

function parsePhaseBlocks(lines) {
  const blocks = [];
  let current = null;
  let currentIndent = 0;
  let inAttempts = false;

  for (const raw of lines) {
    const phaseMatch = raw.match(/^\s*-\s+number:\s*([0-9]+)/);
    if (phaseMatch) {
      if (current) blocks.push(current);
      current = { number: Number(phaseMatch[1]), attempts: {} };
      currentIndent = raw.length - raw.trimStart().length;
      inAttempts = false;
      continue;
    }
    if (!current) continue;
    const indent = raw.length - raw.trimStart().length;
    const stripped = raw.trim();
    if (!stripped) continue;
    if (inAttempts && indent <= currentIndent + 2) inAttempts = false;
    if (stripped === 'attempts:') {
      inAttempts = true;
      continue;
    }
    const separator = stripped.indexOf(':');
    if (separator === -1) continue;
    const key = stripped.slice(0, separator).trim();
    const value = stripQuotes(stripped.slice(separator + 1));
    if (inAttempts) {
      current.attempts[key] = /^\d+$/.test(value) ? Number(value) : value;
    } else if (['title', 'status', 'activePhaseDoc', 'archivedPhaseDoc'].includes(key)) {
      current[key] = value;
    }
  }
  if (current) blocks.push(current);
  return blocks;
}

function readJsonIfExists(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function normalizePath(value) {
  return String(value || '').replaceAll('\\', '/').replace(/\/+$/, '');
}

function projectionWarnings({ rootDir, board, workflowDir }) {
  const warnings = [];
  for (const basename of ['current-run.json', 'active-phase-run.json', 'latest-dispatch.json']) {
    const projectionPath = path.join(workflowDir, basename);
    const payload = readJsonIfExists(projectionPath);
    if (!payload) continue;
    const projectedPlan = normalizePath(payload.planDir || payload.identity?.planDir || '');
    const expectedPlan = normalizePath(path.resolve(rootDir, board.planDir || path.dirname(board.masterPlan || '')));
    const projectedPhase = Number(payload.phaseNumber || payload.phase?.number || payload.activePhaseNumber || 0);
    const projectedStatus = String(payload.status || payload.completionStatus || payload.normalizedRunVerdict || '').toLowerCase();

    if (projectedPlan && expectedPlan && !normalizePath(path.resolve(rootDir, projectedPlan)).endsWith(normalizePath(path.relative(rootDir, expectedPlan)))) {
      warnings.push({
        type: 'stale_read_model_projection',
        source: basename,
        severity: 'warning',
        reason: 'projection_plan_mismatch',
      });
      continue;
    }
    if (projectedPhase && projectedPhase !== board.activePhase.number) {
      warnings.push({
        type: 'stale_read_model_projection',
        source: basename,
        severity: 'warning',
        reason: 'projection_phase_mismatch',
        projectedPhase,
        activePhase: board.activePhase.number,
      });
    }
    if (['running', 'active', 'prepared'].includes(projectedStatus) && board.activePhase.status === 'pending') {
      warnings.push({
        type: 'stale_read_model_projection',
        source: basename,
        severity: 'warning',
        reason: 'projection_open_while_board_pending',
      });
    }
  }
  return warnings;
}

function nextActionForPhase(phase) {
  if (!phase) {
    return { type: 'none', reason: 'no_actionable_phase' };
  }
  if (phase.status === 'pending') {
    return { type: 'execute_phase', phaseNumber: phase.number, phaseTitle: phase.title };
  }
  if (phase.status === 'in_progress' || phase.status === 'pending_reverify') {
    return { type: 'resume_phase', phaseNumber: phase.number, phaseTitle: phase.title };
  }
  return { type: 'none', reason: `phase_status_${phase.status}` };
}

export function buildPhaseStateBoard(options = {}) {
  const rootDir = path.resolve(options.rootDir || resolveRootDir([]));
  const overlayRoot = options.overlayRoot || '';
  const statusPath = resolveOverlayPath(rootDir, overlayRoot, options.statusFile || DEFAULT_STATUS_FILE);
  const workflowDir = resolveOverlayPath(rootDir, overlayRoot, options.workflowDir || DEFAULT_WORKFLOW_DIR);
  const statusText = fs.readFileSync(statusPath, 'utf8');
  const lines = statusText.split(/\r?\n/);
  const phases = parsePhaseBlocks(lines);
  const activeNumber = Number(parseRootScalar(lines, 'activePhaseNumber')) || phases.find((phase) => phase.status === 'pending')?.number || 0;
  const activePhase = phases.find((phase) => phase.number === activeNumber) || phases.find((phase) => phase.status === 'pending') || null;
  const nextAction = nextActionForPhase(activePhase);
  const executionMode = parseRootScalar(lines, 'executionMode') || 'forked-agent';
  const fallbackMode = executionMode === 'delegated-terminal' ? 'delegated-terminal' : '';

  const board = {
    schemaVersion: 1,
    sourceAuthority: 'phase-status.yaml',
    statusPath: path.relative(rootDir, statusPath).replaceAll(path.sep, '/'),
    planDir: path.dirname(parseRootScalar(lines, 'masterPlan')),
    masterPlan: parseRootScalar(lines, 'masterPlan'),
    executionRoot: parseRootScalar(lines, 'executionRoot'),
    activeRunLeaseId: parseRootScalar(lines, 'activeRunLeaseId'),
    activePhase: {
      number: activePhase?.number || 0,
      title: activePhase?.title || parseRootScalar(lines, 'activePhaseTitle'),
      status: activePhase?.status || '',
      stage: parseRootScalar(lines, 'activeCurrentStage'),
      attempts: activePhase?.attempts || {},
    },
    nextAction,
    forkedAgentAttempt: {
      owner: 'forked-agent',
      role: 'primary_phase_attempt',
      required: true,
      identity: parseRootScalar(lines, 'activeRunLeaseId') || `phase-${String(activeNumber).padStart(2, '0')}-next-forked-agent`,
    },
    parentEvidenceCollection: {
      owner: 'parent-session',
      status: activePhase?.status === 'completed' ? 'collected' : 'collecting',
      requiredBeforeCloseout: true,
      blocking: activePhase?.status !== 'completed',
    },
    fallbackAdapterState: {
      mode: fallbackMode,
      adapter: fallbackMode ? 'agent-loop.mjs' : '',
      role: fallbackMode ? 'legacy-headless-cron-fallback' : 'not_selected',
      authoritative: false,
    },
    staleReadModelWarnings: [],
  };
  board.staleReadModelWarnings = projectionWarnings({ rootDir, board, workflowDir });
  if (fallbackMode) {
    board.staleReadModelWarnings.push({
      type: 'fallback_execution_mode_selected',
      source: 'phase-status.yaml',
      severity: 'warning',
      reason: 'delegated-terminal is fallback/headless adapter state, not primary forked-agent control plane',
    });
  }
  return board;
}

export function evaluateCloseoutReadiness(board) {
  const blockingWarnings = board.staleReadModelWarnings.filter((warning) => warning.severity === 'error');
  const parentEvidenceReady = board.parentEvidenceCollection.status === 'ready'
    || board.parentEvidenceCollection.status === 'collected';
  const phaseComplete = board.activePhase.status === 'completed';
  return {
    allowed: blockingWarnings.length === 0 && parentEvidenceReady && phaseComplete,
    boardSource: board.sourceAuthority,
    activePhase: board.activePhase,
    blockingWarnings,
    parentEvidenceCollection: board.parentEvidenceCollection,
    blockingReasons: [
      ...(phaseComplete ? [] : ['active_phase_not_completed']),
      ...(parentEvidenceReady ? [] : ['parent_evidence_not_collected']),
      ...blockingWarnings.map((warning) => warning.reason),
    ],
  };
}

function main() {
  const argv = process.argv.slice(2);
  const rootDir = resolveRootDir(argv);
  const overlayRoot = valueAfter(argv, '--overlay-root') || process.env.HARNESS_OVERLAY_ROOT || '';
  const board = buildPhaseStateBoard({
    rootDir,
    overlayRoot,
    statusFile: valueAfter(argv, '--status-file') || DEFAULT_STATUS_FILE,
    workflowDir: valueAfter(argv, '--workflow-dir') || DEFAULT_WORKFLOW_DIR,
  });
  if (argv.includes('closeout-check')) {
    process.stdout.write(`${JSON.stringify(evaluateCloseoutReadiness(board), null, 2)}\n`);
    return;
  }
  process.stdout.write(`${JSON.stringify(board, null, 2)}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
