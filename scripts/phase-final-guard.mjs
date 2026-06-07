#!/usr/bin/env node
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { resolveDbPath } from './lib/runtime-state-db-path.mjs';
import { resolveRuntimeStatePath } from './lib/runtime-state-root.mjs';

const ACTIONABLE_PHASE_STATUSES = new Set([
  'active',
  'blocked',
  'docs_only',
  'in_progress',
  'needs_more_evidence',
  'pending',
  'ready',
  'running',
]);

const COMPLETE_PHASE_STATUSES = new Set([
  'cancelled',
  'complete',
  'completed',
  'done',
  'skipped',
]);

const usage = () => `Usage: node scripts/phase-final-guard.mjs [--mode check|claude-stop|codex-stop|codex-turn-ended] [--status-file <file>] [--resume-file <file>] [--db <file>] [--always-block] [--fail-on-resume-required] [--json]`;

const parseArgs = (argv) => {
  const options = {
    mode: 'check',
    statusFile: '',
    resumeFile: '',
    dbPath: '',
    alwaysBlock: false,
    failOnResumeRequired: false,
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--mode') {
      options.mode = argv[++index] || '';
    } else if (arg === '--status-file') {
      options.statusFile = argv[++index] || '';
    } else if (arg === '--resume-file') {
      options.resumeFile = argv[++index] || '';
    } else if (arg === '--db') {
      options.dbPath = argv[++index] || '';
    } else if (arg === '--always-block') {
      options.alwaysBlock = true;
    } else if (arg === '--fail-on-resume-required') {
      options.failOnResumeRequired = true;
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}\n${usage()}`);
    }
  }

  if (!['check', 'claude-stop', 'codex-stop', 'codex-turn-ended'].includes(options.mode)) {
    throw new Error(`Unsupported mode: ${options.mode}\n${usage()}`);
  }

  return options;
};

const pathExists = async (target) => {
  try {
    await access(target, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
};

const readStdinJson = async () => {
  if (process.stdin.isTTY) {
    return {};
  }
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString('utf8').trim();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text);
  } catch {
    return { rawInput: text };
  }
};

const unquote = (value) => {
  const trimmed = String(value || '').trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
};

const parseScalar = (line, key) => {
  const match = new RegExp(`^${key}:\\s*(.*)$`).exec(line);
  return match ? unquote(match[1]) : null;
};

const parsePhaseStatusProjection = (text) => {
  const status = {
    planDir: '',
    masterPlan: '',
    runId: '',
    goalId: '',
    workspaceId: '',
    activeExecutionStatus: '',
    activePhaseDoc: '',
    status: '',
    phases: [],
  };
  let currentPhase = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    for (const key of ['planDir', 'masterPlan', 'runId', 'goalId', 'workspaceId', 'activeExecutionStatus', 'activePhaseDoc', 'status']) {
      const value = parseScalar(line, key);
      if (value !== null) {
        status[key] = value;
      }
    }

    const numberMatch = /^\s*-\s+number:\s*(\d+)/.exec(line);
    if (numberMatch) {
      currentPhase = {
        number: Number(numberMatch[1]),
        title: '',
        doc: '',
        status: '',
      };
      status.phases.push(currentPhase);
      continue;
    }

    if (!currentPhase) {
      continue;
    }

    const titleMatch = /^\s+title:\s*(.*)$/.exec(line);
    if (titleMatch) {
      currentPhase.title = unquote(titleMatch[1]);
      continue;
    }

    const docMatch = /^\s+doc:\s*(.*)$/.exec(line);
    if (docMatch) {
      currentPhase.doc = unquote(docMatch[1]);
      continue;
    }

    const statusMatch = /^\s+status:\s*(.*)$/.exec(line);
    if (statusMatch) {
      currentPhase.status = unquote(statusMatch[1]).toLowerCase();
    }
  }

  return status;
};

const finalClaimPattern = /(\b(all set|complete|completed|done|finished|final|wrapped up)\b|완료|완료했습니다|진행 완료|작업 완료|전체 완료|마무리|끝났|종료)/i;
const nonFinalPattern = /(아직|남아|남았습니다|남아 있습니다|not complete|not done|remaining|pending|in_progress|status|상태|중간보고|현재)/i;

const isFinalCompletionClaim = (message = '') => {
  const normalized = String(message || '');
  return finalClaimPattern.test(normalized) && !nonFinalPattern.test(normalized);
};

async function readLatestCompletionDecision(dbPath, runId, goalId) {
  if (!runId || !goalId || !await pathExists(dbPath)) {
    return null;
  }

  let Database;
  try {
    Database = (await import('better-sqlite3')).default;
  } catch (error) {
    return {
      status: 'unavailable',
      reason: 'missing_native_module',
      detail: error instanceof Error ? error.message : String(error),
    };
  }

  let db;
  try {
    db = new Database(dbPath, { readonly: true, fileMustExist: true });
    const row = db.prepare(`
      SELECT decision_id, status, reason, evidence_hash, writer, created_at
      FROM completion_decisions
      WHERE run_id = ? AND goal_id = ?
      ORDER BY decision_sequence DESC, created_at DESC
      LIMIT 1
    `).get(runId, goalId);
    return row || null;
  } catch (error) {
    return {
      status: 'unavailable',
      reason: 'runtime_state_unreadable',
      detail: error instanceof Error ? error.message : String(error),
    };
  } finally {
    if (db) {
      db.close();
    }
  }
}

const buildResumeReason = ({ status, remainingPhases, latestCompletionDecision }) => {
  if (remainingPhases.length > 0) {
    const next = remainingPhases[0];
    return `Phase run is not complete. Continue ${next.doc || `phase ${next.number}`} (${next.status}).`;
  }
  if (!latestCompletionDecision || latestCompletionDecision.status !== 'accepted') {
    return 'All phase projections are complete, but runtime-state has no accepted completion decision.';
  }
  return status.activeExecutionStatus === 'blocked'
    ? 'Phase execution is blocked.'
    : '';
};

async function evaluateGuard(options, hookInput) {
  const statusFile = options.statusFile
    ? path.resolve(options.statusFile)
    : resolveRuntimeStatePath('docs', 'phase-status.yaml');
  const resumeFile = options.resumeFile
    ? path.resolve(options.resumeFile)
    : resolveRuntimeStatePath('docs', 'phase-final-guard-resume-required.json');
  const dbPath = resolveDbPath(options.dbPath);

  if (!await pathExists(statusFile)) {
    return {
      status: 'no_phase_status',
      mode: options.mode,
      statusFile,
      resumeFile,
      dbPath,
      reason: 'phase-status projection was not found',
      remainingPhases: [],
      hookOutput: {},
    };
  }

  const projection = parsePhaseStatusProjection(await readFile(statusFile, 'utf8'));
  const phases = projection.phases;
  const remainingPhases = phases.filter((phase) => {
    const phaseStatus = String(phase.status || '').toLowerCase();
    if (COMPLETE_PHASE_STATUSES.has(phaseStatus)) {
      return false;
    }
    return ACTIONABLE_PHASE_STATUSES.has(phaseStatus) || phaseStatus !== '';
  });
  const latestCompletionDecision = remainingPhases.length === 0
    ? await readLatestCompletionDecision(dbPath, projection.runId, projection.goalId)
    : null;
  const hasAcceptedCompletion = latestCompletionDecision?.status === 'accepted';
  const needsResume = remainingPhases.length > 0;
  const completionAuthorityMissing = !needsResume && !hasAcceptedCompletion;
  const status = needsResume
    ? 'resume_required'
    : completionAuthorityMissing
      ? 'completion_authority_missing'
      : 'clear';
  const reason = buildResumeReason({ status: projection, remainingPhases, latestCompletionDecision });
  const lastAssistantMessage = hookInput.last_assistant_message || hookInput.lastAssistantMessage || '';
  const shouldBlock = (options.mode === 'claude-stop' || options.mode === 'codex-stop')
    && status !== 'clear'
    && (options.alwaysBlock || isFinalCompletionClaim(lastAssistantMessage));
  const hookOutput = shouldBlock
    ? {
      decision: 'block',
      reason,
    }
    : {};

  return {
    status,
    mode: options.mode,
    statusFile,
    resumeFile,
    dbPath,
    reason,
    phaseStatus: projection,
    remainingPhases,
    latestCompletionDecision,
    finalCompletionClaim: isFinalCompletionClaim(lastAssistantMessage),
    hookOutput,
  };
}

async function writeResumeArtifact(result, hookInput) {
  if (result.status === 'clear' || result.status === 'no_phase_status') {
    return null;
  }

  const artifact = {
    schemaVersion: 1,
    status: result.status,
    reason: result.reason,
    createdAt: new Date().toISOString(),
    runtimeAdapter: 'codex-turn-ended',
    cwd: process.cwd(),
    hookInputType: hookInput.type || hookInput.hook_event_name || '',
    statusFile: result.statusFile,
    dbPath: result.dbPath,
    planDir: result.phaseStatus?.planDir || '',
    masterPlan: result.phaseStatus?.masterPlan || '',
    runId: result.phaseStatus?.runId || '',
    goalId: result.phaseStatus?.goalId || '',
    activePhaseDoc: result.phaseStatus?.activePhaseDoc || '',
    remainingPhases: result.remainingPhases,
    nextPrompt: `Continue the unfinished Moonshot phase run. ${result.reason}`,
  };
  await mkdir(path.dirname(result.resumeFile), { recursive: true });
  await writeFile(result.resumeFile, `${JSON.stringify(artifact, null, 2)}\n`);
  return {
    path: result.resumeFile,
    status: artifact.status,
    nextPrompt: artifact.nextPrompt,
  };
}

const writeOutput = (payload, options) => {
  if ((options.mode === 'claude-stop' || options.mode === 'codex-stop') && !options.json) {
    console.log(JSON.stringify(payload.hookOutput));
    return;
  }

  if (options.json || options.mode === 'check') {
    console.log(JSON.stringify(payload, null, 2));
  }
};

const main = async () => {
  const options = parseArgs(process.argv.slice(2));
  const hookInput = await readStdinJson();
  const result = await evaluateGuard(options, hookInput);
  let resumeArtifact = null;
  if (options.mode === 'codex-turn-ended') {
    resumeArtifact = await writeResumeArtifact(result, hookInput);
  }
  const payload = {
    ...result,
    resumeArtifact,
    host: {
      platform: os.platform(),
      cwd: process.cwd(),
    },
  };

  writeOutput(payload, options);

  if (options.failOnResumeRequired && payload.status !== 'clear' && payload.status !== 'no_phase_status') {
    process.exitCode = 2;
  }
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
