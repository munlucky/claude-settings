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

const usage = () => `Usage: node scripts/phase-final-guard.mjs [--mode check|claude-stop|codex-stop|codex-phase-runner-stop|codex-turn-ended] [--status-file <file>] [--resume-file <file>] [--db <file>] [--always-block] [--fail-on-resume-required] [--json]`;

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

  if (!['check', 'claude-stop', 'codex-stop', 'codex-phase-runner-stop', 'codex-turn-ended'].includes(options.mode)) {
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
const phaseRunnerSignalPattern = /(moonshot[- ]phase[- ]runner|phase[- ]runner|phase runner|페이즈러너|모든 페이즈|phase-status\.yaml|assess-completion)/i;
const continuationSignalPattern = /^\s*(이어서(?:\s+작업)?(?:\s+진행)?(?:해|해주세요)?|계속(?:\s+작업)?(?:\s+진행)?(?:해|해주세요)?|이어가(?:줘|주세요)?|continue|keep going|resume)\s*[.!?]*\s*$/i;

const isFinalCompletionClaim = (message = '') => {
  const normalized = String(message || '');
  return finalClaimPattern.test(normalized) && !nonFinalPattern.test(normalized);
};

const textFromTranscriptContent = (content) => {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map(textFromTranscriptContent).join(' ');
  if (!content || typeof content !== 'object') return '';
  return [content.text, content.message, content.input_text, content.output_text]
    .filter((value) => value !== undefined)
    .map(textFromTranscriptContent)
    .join(' ');
};

const normalizeTranscriptUserText = (text) => String(text || '').replace(/\s+/g, ' ').trim().toLowerCase();

const phaseRunnerProjectionEvidence = (projection) => Boolean(
  /^phase-runner(?:-|$)/i.test(String(projection.runId || ''))
  && projection.planDir
  && projection.masterPlan
  && projection.phases.length > 0,
);

async function detectPreviousPhaseRunnerTask(hookInput, projection) {
  if (hookInput.phase_runner === true || hookInput.phaseRunner === true || hookInput.moonshot_phase_runner === true) {
    return { detected: true, source: 'hook_input' };
  }

  const transcriptPath = hookInput.transcript_path || hookInput.transcriptPath || '';
  if (!transcriptPath) {
    return { detected: phaseRunnerProjectionEvidence(projection), source: 'phase_projection_fallback' };
  }

  try {
    const transcriptText = await readFile(transcriptPath, 'utf8');
    const boundedText = transcriptText.length > 4 * 1024 * 1024 ? transcriptText.slice(-4 * 1024 * 1024) : transcriptText;
    const lines = boundedText.split(/\r?\n/);
    const userMessages = [];
    lines.forEach((line, index) => {
      try {
        const record = JSON.parse(line);
        const payload = record.payload || record;
        if (payload.type === 'message' && payload.role === 'user') {
          userMessages.push({ index, text: textFromTranscriptContent(payload.content) });
        } else if (payload.type === 'user_message') {
          userMessages.push({ index, text: textFromTranscriptContent(payload.message || payload.content) });
        }
      } catch {
        // Partial transcript lines are ignored; runtime-state projection remains the fallback.
      }
    });

    if (userMessages.length === 0) {
      return { detected: phaseRunnerProjectionEvidence(projection), source: 'phase_projection_no_user_message' };
    }

    const distinct = userMessages.filter((message, index) => (
      index === 0 || normalizeTranscriptUserText(message.text) !== normalizeTranscriptUserText(userMessages[index - 1].text)
    ));
    const latest = distinct[distinct.length - 1];
    const directSignal = phaseRunnerSignalPattern.test(latest.text) || phaseRunnerSignalPattern.test(lines.slice(latest.index).join('\n'));
    let boundaryIndex = distinct.length - 2;
    while (boundaryIndex >= 0 && continuationSignalPattern.test(distinct[boundaryIndex].text)) boundaryIndex -= 1;
    const boundary = boundaryIndex >= 0 ? distinct[boundaryIndex] : null;
    const continuation = !directSignal
      && continuationSignalPattern.test(latest.text)
      && phaseRunnerProjectionEvidence(projection)
      && boundary !== null
      && phaseRunnerSignalPattern.test(boundary.text);
    return { detected: directSignal || continuation, source: continuation ? 'transcript_continuation' : 'transcript' };
  } catch {
    return { detected: phaseRunnerProjectionEvidence(projection), source: 'phase_projection_transcript_fallback' };
  }
}

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

async function readLatestVerificationEvidence(dbPath, runId, goalId) {
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
      SELECT event_id, event_type, payload_json, created_at
      FROM runtime_events
      WHERE run_id = ?
        AND goal_id = ?
        AND event_type IN ('verification.evidence', 'verifier.evidence', 'verification.verdict')
      ORDER BY event_sequence DESC, created_at DESC
      LIMIT 1
    `).get(runId, goalId);
    if (!row) {
      return null;
    }
    let payload = {};
    try {
      payload = JSON.parse(row.payload_json || '{}');
    } catch {
      payload = {};
    }
    return {
      eventId: row.event_id,
      eventType: row.event_type,
      createdAt: row.created_at,
      requiredChecksPassed: payload.requiredChecksPassed === true,
      taskEvidenceBlockers: Array.isArray(payload.taskEvidenceBlockers) ? payload.taskEvidenceBlockers : [],
    };
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

const buildResumeReason = ({ status, remainingPhases, latestCompletionDecision, latestVerificationEvidence }) => {
  if (remainingPhases.length > 0) {
    const next = remainingPhases[0];
    return `Phase run is not complete. Continue ${next.doc || `phase ${next.number}`} (${next.status}).`;
  }
  if (!latestCompletionDecision || latestCompletionDecision.status !== 'accepted') {
    const blocker = latestVerificationEvidence?.taskEvidenceBlockers?.[0];
    if (blocker) {
      return `All phase projections are complete, but verification evidence blocks accepted completion: ${blocker.code || 'verification_blocker'}: ${blocker.reason || 'no blocker reason recorded'}`;
    }
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
  const phaseRunnerTaskEvidence = await detectPreviousPhaseRunnerTask(hookInput, projection);
  if (options.mode === 'codex-phase-runner-stop' && !phaseRunnerTaskEvidence.detected) {
    return {
      status: 'not_phase_runner_task',
      mode: options.mode,
      statusFile,
      resumeFile,
      dbPath,
      phaseStatus: projection,
      phaseRunnerTaskEvidence,
      remainingPhases: [],
      hookOutput: {},
    };
  }
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
  const latestVerificationEvidence = remainingPhases.length === 0
    ? await readLatestVerificationEvidence(dbPath, projection.runId, projection.goalId)
    : null;
  const hasAcceptedCompletion = latestCompletionDecision?.status === 'accepted';
  const needsResume = remainingPhases.length > 0;
  const completionAuthorityMissing = !needsResume && !hasAcceptedCompletion;
  const status = needsResume
    ? 'resume_required'
    : completionAuthorityMissing
      ? 'completion_authority_missing'
      : 'clear';
  const reason = buildResumeReason({
    status: projection,
    remainingPhases,
    latestCompletionDecision,
    latestVerificationEvidence,
  });
  const lastAssistantMessage = hookInput.last_assistant_message || hookInput.lastAssistantMessage || '';
  const shouldBlock = (options.mode === 'claude-stop' || options.mode === 'codex-stop' || options.mode === 'codex-phase-runner-stop')
    && status !== 'clear'
    && (options.mode === 'codex-phase-runner-stop' || options.alwaysBlock || isFinalCompletionClaim(lastAssistantMessage));
  const hookOutput = shouldBlock
    ? {
      decision: 'block',
      reason: options.mode === 'codex-phase-runner-stop'
        ? `The previous task used moonshot-phase-runner and is not fully complete. Resume it now. ${reason}`
        : reason,
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
    phaseRunnerTaskEvidence,
    latestCompletionDecision,
    latestVerificationEvidence,
    finalCompletionClaim: isFinalCompletionClaim(lastAssistantMessage),
    hookOutput,
  };
}

async function writeResumeArtifact(result, hookInput) {
  if (result.status === 'clear' || result.status === 'no_phase_status' || result.status === 'not_phase_runner_task') {
    return null;
  }

  const artifact = {
    schemaVersion: 1,
    status: result.status,
    reason: result.reason,
    createdAt: new Date().toISOString(),
    runtimeAdapter: result.mode === 'codex-turn-ended' ? 'codex-turn-ended' : 'codex-phase-runner-stop',
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
  if ((options.mode === 'claude-stop' || options.mode === 'codex-stop' || options.mode === 'codex-phase-runner-stop') && !options.json) {
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
  if (options.mode === 'codex-turn-ended' || options.mode === 'codex-phase-runner-stop') {
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
