#!/usr/bin/env node

import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { resolveParentRuntimeContext } from './lib/runtime-platform.mjs';
import { classifyFailure } from './lib/failure-classifier.mjs';
import { assessRuntimeHealthFromVerdictFiles } from './verification-verdict-state.mjs';
import { summarizeSpawnCommand } from './lib/prompt-redaction.mjs';
import { knownUnavailableSummary } from './lib/runtime-unavailable-cache.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const phaseStatePath = path.join(scriptDir, 'agent-loop-phase-state.mjs');
const runtimeCliPath = path.join(scriptDir, 'runtime-cli.mjs');
const strictMemoryGateEnabled = String(process.env.PHASE_STRICT_MEMORY_GATE ?? process.env.MEMORYGRAPH_STRICT_MODE ?? 'false').toLowerCase() === 'true';

function resolvePhaseStatusFile(workspaceRoot) {
  return path.join(workspaceRoot, '.claude', 'docs', 'phase-status.yaml');
}

function parseTimestampMs(value) {
  const parsed = Date.parse(String(value || '').trim().replace(/^"|"$/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function readCurrentRunAttachedAtMs(phaseStatusFile) {
  if (!phaseStatusFile || !fs.existsSync(phaseStatusFile)) {
    return 0;
  }

  const text = fs.readFileSync(phaseStatusFile, 'utf8');
  for (const key of ['activeExecutionAttachedAt', 'lastExecutionAttachedAt']) {
    const match = text.match(new RegExp(`^${key}:\\s*(.+?)\\s*$`, 'm'));
    const parsed = parseTimestampMs(match?.[1] || '');
    if (parsed > 0) {
      return parsed;
    }
  }
  return 0;
}

function commandExists(command) {
  const checker = process.platform === 'win32' ? 'where' : 'which';
  const result = spawnSync(checker, [command], { stdio: 'ignore' });
  return !result.error && result.status === 0;
}

function sha1FileOrEmpty(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return '';
  }

  const hash = crypto.createHash('sha1');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function parseShellAssignments(text) {
  const result = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }
    const separator = line.indexOf('=');
    if (separator <= 0) {
      continue;
    }
    const key = line.slice(0, separator);
    let value = line.slice(separator + 1);
    value = value.replace(/^'/, '').replace(/'$/, '').replace(/'\\''/g, "'");
    result[key] = value;
  }
  return result;
}

function shellQuote(value) {
  if (value === undefined || value === null) {
    return "''";
  }
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function runtimeCli(args) {
  const result = spawnSync('node', [runtimeCliPath, ...args], {
    encoding: 'utf8',
    env: process.env,
  });
  if (result.error || (result.status ?? 0) !== 0) {
    return [];
  }
  return (result.stdout ?? '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function runtimeAvailable(runtime) {
  if (runtime === 'codex') {
    return runtimeCli(['resolve-codex-command']).length > 0;
  }
  if (runtime === 'claude') {
    return commandExists('claude');
  }
  return false;
}

function evaluatePhaseCompletionAllowed(config) {
  const result = spawnSync('node', [
    phaseStatePath,
    'evaluate-phase-completion-gate',
    String(config.phaseStartEpoch ?? ''),
    config.phaseQaReport ?? '',
    config.phaseScorecard ?? '',
    config.phaseExecutionDir ?? '',
    config.scorecardRequired ?? 'true',
    config.targetCompletionScore ?? '100',
    config.phaseHandoff ?? '',
  ], {
    encoding: 'utf8',
    env: process.env,
  });

  if (result.error || (result.status ?? 0) !== 0) {
    return false;
  }

  const values = parseShellAssignments(result.stdout ?? '');
  return values.PHASE_COMPLETION_ALLOWED === 'true';
}

function resolveCrossRuntimeFallbackPolicy() {
  const explicit = String(process.env.AGENT_LOOP_ALLOW_CROSS_RUNTIME_FALLBACK ?? 'auto').trim().toLowerCase();
  if (explicit === 'true') {
    return {
      allow: true,
      reason: 'env-override-true',
    };
  }
  if (explicit === 'false') {
    return {
      allow: false,
      reason: 'env-override-false',
    };
  }
  const context = resolveParentRuntimeContext();

  return {
    allow: context.allowCrossRuntimeFallback,
    reason: context.allowCrossRuntimeFallback
      ? context.mixedRuntimeExplicit
        ? 'explicit-mixed-runtime'
        : 'auto-allow'
      : context.parentRuntime === 'unknown'
        ? 'same-runtime-only-default'
        : `same-runtime-only-parent-${context.parentRuntime}`,
  };
}

function resolveRunnerRuntime(requestedRuntime) {
  const context = resolveParentRuntimeContext({ requestedRuntime });
  if (context.explicitRuntime === 'claude' || context.explicitRuntime === 'codex') {
    if (!runtimeAvailable(context.explicitRuntime)) {
      console.error(`${context.explicitRuntime} runtime was requested explicitly but is not available`);
      process.exit(1);
    }
    return context.explicitRuntime;
  }

  if (context.fixedRuntime) {
    if (runtimeAvailable(context.fixedRuntime)) {
      return context.fixedRuntime;
    }
    console.error(`${context.fixedRuntime} runtime required by parent runtime policy but not available`);
    process.exit(1);
  }

  if (context.allowCodexChecks && runtimeAvailable('codex')) {
    return 'codex';
  }

  if (context.allowClaudeChecks && runtimeAvailable('claude')) {
    return 'claude';
  }

  console.error('No allowed runtime matched the current parent runtime policy');
  process.exit(1);
}

function describeStopReason(reason, runtime, detail = '') {
  switch (reason) {
    case 'bash_access_denied':
      return `bash 실행이 권한 문제로 막혀 ${runtime} 작업을 진행할 수 없습니다`;
    case 'git_eperm':
    case 'git_index_denied':
      return `git 작업이 권한 문제로 막혀 ${runtime} 작업을 진행할 수 없습니다`;
    case 'node_spawn_eperm':
      return `Node 프로세스 spawn이 권한 문제로 막혀 ${runtime} 작업을 진행할 수 없습니다`;
    case 'verification_environment_unavailable':
    case 'verifier_unavailable':
      return `검증 런타임을 사용할 수 없어 ${runtime} 작업을 진행할 수 없습니다`;
    case 'codex_unavailable':
      return `Codex 런타임을 찾을 수 없어 ${runtime} 작업을 진행할 수 없습니다`;
    case 'codex_session_storage_readonly':
    case 'codex_home_readonly':
    case 'codex_state_db_readonly':
      return `Codex 저장소가 읽기 전용이어서 ${runtime} 작업을 진행할 수 없습니다`;
    case 'spawn_blocked':
      return `프로세스 spawn이 호스트 정책에 의해 차단되어 ${runtime} 작업을 진행할 수 없습니다`;
    case 'verification-command-missing':
      return '필수 verification 진입점 경로를 찾지 못해 phase를 진행할 수 없습니다 (block)';
    case 'timeout-auth':
      return `런타임 인증 또는 권한 문제로 ${runtime} 실행이 watchdog 제한 시간 안에 완료되지 않았습니다`;
    case 'timeout-network':
      return `네트워크 또는 외부 요청 문제로 ${runtime} 실행이 watchdog 제한 시간 안에 완료되지 않았습니다`;
    case 'codex_upstream_stream_stalled':
      return `Codex upstream 스트림 재연결이 반복되어 ${runtime} 작업을 안전하게 중단했습니다`;
    case 'timeout-browser':
      return '브라우저 또는 앱 런타임 smoke가 제한 시간 안에 준비되지 않았습니다';
    case 'timeout-verification':
      return '검증 산출물이 제시간에 생성되지 않아 phase 완료 판정을 내릴 수 없었습니다';
    case 'raw_diff_output_timeout':
      return 'raw git diff 본문이 로그/트랜스크립트를 지배해 worker가 제한 시간 안에 완료되지 않았습니다. 다음 시도는 git diff --stat, --name-only, --check 또는 path-limited 200-line raw diff만 사용해야 합니다';
    case 'timeout-restart-limit':
      return '같은 phase가 반복 timeout 되었고 재시도 한도에 도달했습니다';
    case 'tool-schema-error-loop':
      return 'MCP 스키마 유효성 검증 오류 패턴(claude-in-chrome tool)으로 인해 실행기가 반복 실패했습니다';
    case 'missing-verification-evidence':
      return '필수 검증 증거가 없어 완료 판정을 내릴 수 없었습니다';
    case 'phase-max-attempts':
      return '자동 수정 재시도 한도에 도달했지만 phase를 안정적으로 완료하지 못했습니다';
    case 'phase-failed':
      return 'phase 실행이 실패했고 자동 복구가 끝나지 않았습니다';
    default:
      return detail || '루프가 중단되었습니다';
  }
}

function detectVerificationCommandMissing(logFile) {
  if (!logFile || !fs.existsSync(logFile)) {
    return false;
  }
  const text = fs.readFileSync(logFile, 'utf8');
  if (text.includes('VERIFICATION_COMMAND_MISSING')) {
    return true;
  }
  const verifierLinePatterns = [
    /(?:^|\n)[^\n]*\.claude\/agents\/verification\/verify-changes\.sh[^\n]*(?:No such file or directory|command not found|No such file|is not found)[^\n]*(?:\n|$)/i,
    /(?:^|\n)[^\n]*\.claude\/agents\/verification\/run-verify-changes\.sh[^\n]*(?:No such file or directory|command not found|No such file|is not found)[^\n]*(?:\n|$)/i,
    /(?:^|\n)[^\n]*(?:No such file or directory|command not found|No such file|is not found)[^\n]*\.claude\/agents\/verification\/verify-changes\.sh[^\n]*(?:\n|$)/i,
    /(?:^|\n)[^\n]*(?:No such file or directory|command not found|No such file|is not found)[^\n]*\.claude\/agents\/verification\/run-verify-changes\.sh[^\n]*(?:\n|$)/i,
  ];
  return verifierLinePatterns.some((pattern) => pattern.test(text));
}

function detectToolSchemaErrorLoop(logFile, guardRaw = '2') {
  if (!logFile || !fs.existsSync(logFile)) {
    return false;
  }
  const text = fs.readFileSync(logFile, 'utf8');
  const guard = Number.parseInt(String(guardRaw), 10) || 2;
  const matches = text.match(/API Error: 400|input_schema|additionalProperties=false|invalid request format/gi) || [];
  return matches.length >= guard && /mcp__claude-in-chrome__|claude-in-chrome/i.test(text);
}

function classifyTimeoutReason(logFile) {
  if (logFile && fs.existsSync(logFile)) {
    const text = fs.readFileSync(logFile, 'utf8');
    if (/(?:codex_core::session::turn: stream disconnected|stream disconnected - retrying sampling request|ERROR:\s*Reconnecting\.\.\. \d+\/\d+|UPSTREAM_STREAM_STALL)/i.test(text)) {
      return 'codex_upstream_stream_stalled';
    }
    if (/does not have access to Claude|Please login again|Could not resolve authentication method|login required|subscription|authentication/i.test(text)) {
      return 'timeout-auth';
    }
    if (/error sending request for url|network error|ENOTFOUND|ECONNREFUSED|connection refused|temporary failure/i.test(text)) {
      return 'timeout-network';
    }
    if (/browserctl|Browser flow failed|URL check failed|setup gap|http=000|LOCAL_FILE_MISSING/i.test(text)) {
      return 'timeout-browser';
    }
    if (isRawDiffDominatedLog(text)) {
      return 'raw_diff_output_timeout';
    }
    if (/verification|scorecard|evidenceFresh|requiredChecks|QA_REPORT|HANDOFF/i.test(text)) {
      return 'timeout-verification';
    }
  }
  return 'timeout-restart-limit';
}

function isRawDiffDominatedLog(text) {
  const lines = String(text || '').split(/\r?\n/).filter((line) => line.trim());
  if (lines.length === 0 || !/\bdiff --git\b/.test(text)) {
    return false;
  }
  const diffLines = lines.filter((line) => /^(?:diff --git|index |@@|\+\+\+ |--- |\+|-)/.test(line.trim()));
  return diffLines.length >= 80 || diffLines.length / lines.length >= 0.45;
}

function writeSupervisorEvent(logStream, event, payload = {}) {
  logStream.write(`SUPERVISOR_EVENT ${JSON.stringify({
    timestamp: new Date().toISOString(),
    event,
    ...payload,
  })}\n`);
}

function resolveTimeoutFallbackRuntime(currentRuntime) {
  const fallbackPolicy = resolveCrossRuntimeFallbackPolicy();
  if (!fallbackPolicy.allow) {
    return '';
  }
  if (currentRuntime === 'claude' && runtimeAvailable('codex')) {
    return 'codex';
  }
  const context = resolveParentRuntimeContext();
  if (currentRuntime === 'codex' && context.allowClaudeChecks && runtimeAvailable('claude')) {
    return 'claude';
  }
  return '';
}

function detectCodexUpstreamStreamStall(logFile, elapsedSeconds) {
  const maxSeconds = Number.parseInt(String(process.env.AGENT_LOOP_CODEX_UPSTREAM_STALL_SECONDS ?? '120'), 10) || 120;
  const reconnectThreshold = Number.parseInt(String(process.env.AGENT_LOOP_CODEX_UPSTREAM_RECONNECT_THRESHOLD ?? '3'), 10) || 3;
  if (elapsedSeconds < maxSeconds || !logFile || !fs.existsSync(logFile)) {
    return { stalled: false, maxReconnect: 0, reconnectThreshold, maxSeconds };
  }

  const text = fs.readFileSync(logFile, 'utf8');
  let maxReconnect = 0;
  for (const match of text.matchAll(/(?:stream disconnected - retrying sampling request|ERROR:\s*Reconnecting\.\.\.)[^\n]*?(\d+)\/(\d+)/gi)) {
    const current = Number.parseInt(match[1] || '0', 10) || 0;
    maxReconnect = Math.max(maxReconnect, current);
  }

  return {
    stalled: maxReconnect >= reconnectThreshold,
    maxReconnect,
    reconnectThreshold,
    maxSeconds,
  };
}

const TERMINAL_STOP_CODES = new Set([
  'bash_access_denied',
  'git_eperm',
  'git_index_denied',
  'rg_access_denied',
  'codex_unavailable',
  'codex_session_storage_readonly',
  'codex_home_readonly',
  'codex_state_db_readonly',
  'mcp_cleanup_eperm',
  'path_update_denied',
  'plugin_network_sync_failed',
  'network_fetch_failed',
  'codex_upstream_stream_stalled',
  'node_spawn_eperm',
  'verification_environment_unavailable',
  'verifier_unavailable',
  'spawn_blocked',
]);

function isLogEvidenceLine(line) {
  const trimmed = String(line ?? '').trim();
  if (!trimmed) {
    return false;
  }

  if (/^(?:diff --git|index |@@|\+\+\+|---|[+-]\s|case |return |const |let |function |\| |[-*]\s)/.test(trimmed)) {
    return false;
  }
  if (/^(?:\/bin\/zsh -lc|exec_command|Chunk ID:|Wall time:|Process exited|Original token count:|Output:)/i.test(trimmed)) {
    return false;
  }
  if (/\brg\s+-n\b/.test(trimmed) || /\bgrep\s+-n\b/.test(trimmed)) {
    return false;
  }

  return /(?:Failed to create session:|readonly database|read only database|spawn(?:Sync)? .*?(?:EPERM|EACCES)|(?:Error|ERROR|fatal|Failed|failed): .*?(?:permission denied|operation not permitted|access is denied|EPERM|EACCES)|Failed to terminate MCP process group|Failed to kill MCP process group|Could not resolve host|plugin sync failed|could not update PATH|(?:node --test|bash|git|rg).*?(?:spawn EPERM|access denied|permission denied|operation not permitted)|runtime verifier unavailable|verification runtime unavailable|verifier unavailable|spawn blocked|unable to create process|stream disconnected - retrying sampling request|ERROR:\s*Reconnecting\.\.\. \d+\/\d+|UPSTREAM_STREAM_STALL)/i.test(trimmed);
}

function detectEnvironmentStopReason(logFile, defaultReason = 'phase-failed') {
  if (!logFile || !fs.existsSync(logFile)) {
    return '';
  }

  const evidenceLines = fs.readFileSync(logFile, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(isLogEvidenceLine);
  const combinedEvidence = evidenceLines.join('\n');
  if (/(?:node\s+--test|verifier|verification runtime|runtime verifier)[\s\S]*spawn(?:Sync)?\s+node\s+EPERM/i.test(combinedEvidence)) {
    return 'verification_environment_unavailable';
  }

  for (const line of evidenceLines) {
    const classification = classifyFailure({
      reason: defaultReason,
      message: line,
      detail: line,
      stderr: line,
      stdout: line,
    });
    if ((classification.category === 'environment' || classification.category === 'network') && TERMINAL_STOP_CODES.has(classification.code)) {
      return classification.code;
    }
  }
  return '';
}

function detectFinalStopReason(logFile, defaultReason = 'phase-failed', guardRaw = '2') {
  const environmentStopReason = detectEnvironmentStopReason(logFile, defaultReason);
  if (environmentStopReason) {
    return environmentStopReason;
  }
  if (detectToolSchemaErrorLoop(logFile, guardRaw)) {
    return 'tool-schema-error-loop';
  }
  if (detectVerificationCommandMissing(logFile)) {
    return 'verification-command-missing';
  }
  return defaultReason;
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function utcTimestamp() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function buildProcessKillTarget(pid, useProcessGroup = false) {
  if (!Number.isFinite(pid)) {
    return null;
  }
  if (useProcessGroup && process.platform !== 'win32') {
    return -Math.abs(pid);
  }
  return pid;
}

function terminateProcess(pid, useProcessGroup = false) {
  if (!Number.isFinite(pid)) {
    return;
  }

  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
    return;
  }

  try {
    const target = buildProcessKillTarget(pid, useProcessGroup);
    if (target === null) {
      return;
    }
    process.kill(target, 'SIGTERM');
  } catch {
    return;
  }
}

function killProcessHard(pid, useProcessGroup = false) {
  if (!Number.isFinite(pid) || process.platform === 'win32') {
    return;
  }

  try {
    const target = buildProcessKillTarget(pid, useProcessGroup);
    if (target === null) {
      return;
    }
    process.kill(target, 'SIGKILL');
  } catch {
    // Ignore processes that already exited.
  }
}

function updatePhaseHeartbeat({
  statusFile,
  phaseNum,
  activePhaseDoc,
  sprintContractPath,
  qaReportPath,
  handoffPath,
  scorecardPath,
}) {
  if (!statusFile || !phaseNum) {
    return false;
  }

  const result = spawnSync('node', [
    phaseStatePath,
    'update-phase-state',
    statusFile,
    String(phaseNum),
    'in_progress',
    utcTimestamp(),
    'running',
    'false',
    activePhaseDoc ?? '',
    sprintContractPath ?? '',
    qaReportPath ?? '',
    handoffPath ?? '',
    scorecardPath ?? '',
  ], {
    encoding: 'utf8',
    env: process.env,
  });

  return !result.error && (result.status ?? 0) === 0;
}

function parseRecentRuntimeIssues(logDir, pattern, recentWindowMs, maxFiles, minMtimeMs = 0) {
  if (!logDir || !fs.existsSync(logDir)) {
    return [];
  }

  const now = Date.now();
  return fs.readdirSync(logDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^phase-.*\.log$/.test(entry.name))
    .map((entry) => {
      const fullPath = path.join(logDir, entry.name);
      const stats = fs.statSync(fullPath);
      return {
        path: fullPath,
        mtimeMs: stats.mtimeMs,
      };
    })
    .filter((entry) => now - entry.mtimeMs <= recentWindowMs && entry.mtimeMs >= minMtimeMs)
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, maxFiles)
    .flatMap((entry) => {
      try {
        const text = fs.readFileSync(entry.path, 'utf8');
        return pattern.test(text) ? [entry] : [];
      } catch {
        return [];
      }
    });
}

function parseRecentVerificationVerdicts(workspaceRoot, recentWindowMs, maxFiles) {
  const verdictDir = path.join(workspaceRoot, '.claude');
  if (!fs.existsSync(verdictDir)) {
    return [];
  }

  const now = Date.now();
  return fs.readdirSync(verdictDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^verification-verdict-.*\.json$/.test(entry.name))
    .map((entry) => {
      const fullPath = path.join(verdictDir, entry.name);
      const stats = fs.statSync(fullPath);
      return {
        path: fullPath,
        mtimeMs: stats.mtimeMs,
      };
    })
    .filter((entry) => now - entry.mtimeMs <= recentWindowMs)
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, maxFiles)
    .flatMap((entry) => {
      try {
        const payload = JSON.parse(fs.readFileSync(entry.path, 'utf8'));
        return [{ ...entry, payload }];
      } catch {
        return [];
      }
    });
}

function verdictTargetsRuntime(payload, runtime) {
  const runtimeContext = payload?.runtimeContext && typeof payload.runtimeContext === 'object'
    ? payload.runtimeContext
    : {};
  const targets = new Set();

  for (const value of [
    runtimeContext.requestedRuntime,
    runtimeContext.effectiveRuntime,
  ]) {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized) {
      targets.add(normalized);
    }
  }

  for (const part of String(runtimeContext.verificationRuntimeTargets || '').split(/[,\s]+/)) {
    const normalized = String(part || '').trim().toLowerCase();
    if (normalized) {
      targets.add(normalized);
    }
  }

  if (targets.size === 0) {
    return true;
  }

  return targets.has(runtime) || targets.has('both') || targets.has('auto');
}

function assessRuntimeHealthFromVerdicts(runtime, workspaceRoot, recentWindowMs, maxFiles) {
  return assessRuntimeHealthFromVerdictFiles(runtime, workspaceRoot, recentWindowMs, maxFiles);
}

function assessRuntimeHealth(runtime, workspaceRoot = process.cwd()) {
  const normalizedRuntime = String(runtime || '').trim();
  const fallbackPolicy = resolveCrossRuntimeFallbackPolicy();
  if (!normalizedRuntime || normalizedRuntime === 'claude' || normalizedRuntime === 'auto') {
    return {
      HEALTHY: 'true',
      RUNTIME: normalizedRuntime || 'claude',
      REASON: 'ok',
      DETAIL: '',
      FALLBACK_RUNTIME: '',
      FALLBACK_POLICY: fallbackPolicy.reason,
    };
  }

  if (normalizedRuntime !== 'codex') {
    return {
      HEALTHY: 'true',
      RUNTIME: normalizedRuntime,
      REASON: 'ok',
      DETAIL: '',
      FALLBACK_RUNTIME: '',
      FALLBACK_POLICY: fallbackPolicy.reason,
    };
  }

  const logDir = path.join(workspaceRoot, '.claude', 'logs', 'agent-loop');
  const issuePattern = /migration \d+ was previously applied but is missing|state db discrepancy|Failed to kill MCP process group/i;
  const recentWindowMs = Number.parseInt(process.env.AGENT_LOOP_RUNTIME_HEALTH_WINDOW_MS ?? String(2 * 60 * 60 * 1000), 10) || (2 * 60 * 60 * 1000);
  const maxLogs = Number.parseInt(process.env.AGENT_LOOP_RUNTIME_HEALTH_MAX_LOGS ?? '5', 10) || 5;
  const phaseStatusFile = resolvePhaseStatusFile(workspaceRoot);
  const currentRunAttachedAtMs = readCurrentRunAttachedAtMs(phaseStatusFile);
  const memorygraphSummary = knownUnavailableSummary(phaseStatusFile, { code: 'memorygraph_unavailable' });
  const matchingLogs = parseRecentRuntimeIssues(
    logDir,
    issuePattern,
    recentWindowMs,
    maxLogs,
    currentRunAttachedAtMs,
  );
  const structuredVerdictAssessment = assessRuntimeHealthFromVerdicts(
    normalizedRuntime,
    workspaceRoot,
    recentWindowMs,
    maxLogs,
  );

  if (structuredVerdictAssessment) {
    return {
      ...structuredVerdictAssessment,
      FALLBACK_RUNTIME: '',
      FALLBACK_POLICY: fallbackPolicy.reason,
    };
  }

  if (!strictMemoryGateEnabled && memorygraphSummary) {
    return {
      HEALTHY: 'true',
      RUNTIME: normalizedRuntime,
      REASON: 'cached-unavailable-capability',
      DETAIL: memorygraphSummary,
      FALLBACK_RUNTIME: '',
      FALLBACK_POLICY: fallbackPolicy.reason,
    };
  }

  if (matchingLogs.length === 0) {
    return {
      HEALTHY: 'true',
      RUNTIME: normalizedRuntime,
      REASON: 'ok',
      DETAIL: '',
      FALLBACK_RUNTIME: '',
      FALLBACK_POLICY: fallbackPolicy.reason,
    };
  }

  return {
    HEALTHY: 'false',
    RUNTIME: normalizedRuntime,
    REASON: 'runtime-log-health-check-failed',
    DETAIL: `Recent runtime warnings detected in ${matchingLogs.map((entry) => entry.path).join(', ')}`,
    FALLBACK_RUNTIME: fallbackPolicy.allow && resolveParentRuntimeContext().allowClaudeChecks && runtimeAvailable('claude') ? 'claude' : '',
    FALLBACK_POLICY: fallbackPolicy.reason,
  };
}

async function runWithWatchdog(args) {
  let logFile = '';
  let maxSeconds = 0;
  let checkSeconds = 5;
  let separatorIndex = -1;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--') {
      separatorIndex = index;
      break;
    }
    if (arg === '--log-file') {
      logFile = args[index + 1] ?? '';
      index += 1;
      continue;
    }
    if (arg === '--max-seconds') {
      maxSeconds = Number.parseInt(args[index + 1] ?? '0', 10);
      index += 1;
      continue;
    }
    if (arg === '--check-seconds') {
      checkSeconds = Number.parseInt(args[index + 1] ?? '5', 10);
      index += 1;
      continue;
    }
  }

  const command = separatorIndex >= 0 ? args.slice(separatorIndex + 1) : [];
  if (!logFile || command.length === 0) {
    console.error('Usage: agent-loop-phase-runtime.mjs run-with-watchdog --log-file <path> --max-seconds <n> --check-seconds <n> -- <command...>');
    process.exit(64);
  }

  const logStream = fs.createWriteStream(logFile, { flags: 'a' });
  const child = spawn(command[0], command.slice(1), {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
    detached: process.platform !== 'win32',
  });
  const spawnSummary = summarizeSpawnCommand(command, process.cwd());
  writeSupervisorEvent(logStream, 'spawn', {
    pid: child.pid ?? null,
    commandName: spawnSummary.commandName,
    argvSummary: spawnSummary.argvSummary,
    argvHash: spawnSummary.argvHash,
    promptHash: spawnSummary.promptHash,
    promptBytes: spawnSummary.promptBytes,
    promptArchivePath: spawnSummary.promptArchivePath,
    mode: 'watchdog',
  });

  child.stdout.pipe(logStream, { end: false });
  child.stderr.pipe(logStream, { end: false });

  const exitCodePromise = new Promise((resolve, reject) => {
    child.on('error', (error) => {
      writeSupervisorEvent(logStream, 'error', {
        pid: child.pid ?? null,
        mode: 'watchdog',
        message: error.message,
      });
      reject(error);
    });
    child.on('exit', (code, signal) => {
      writeSupervisorEvent(logStream, 'exit', {
        pid: child.pid ?? null,
        mode: 'watchdog',
        code: code ?? 0,
        signal: signal ?? '',
      });
      resolve(code ?? 0);
    });
  });

  let timedOut = false;
  const startTime = Date.now();

  while (child.exitCode === null && child.signalCode === null) {
    const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
    if (maxSeconds > 0 && elapsedSeconds >= maxSeconds) {
      timedOut = true;
      terminateProcess(child.pid, process.platform !== 'win32');
      await sleep(5000);
      killProcessHard(child.pid, process.platform !== 'win32');
      break;
    }
    await sleep(Math.max(checkSeconds, 1) * 1000);
  }

  const exitCode = await exitCodePromise;

  if (timedOut) {
    logStream.write(`WATCHDOG_TIMEOUT after ${maxSeconds}s\n`);
    logStream.end();
    return 124;
  }

  logStream.end();
  return exitCode;
}

async function runWorkerPromptWithCompletionGate(args) {
  let logFile = '';
  let phaseStartEpoch = '';
  let qaChecksumBefore = '';
  let phaseQaReport = '';
  let phaseScorecard = '';
  let phaseExecutionDir = '';
  let scorecardRequired = 'true';
  let targetCompletionScore = '100';
  let watchdogMaxSeconds = 0;
  let watchdogCheckSeconds = 5;
  let statusFile = '';
  let phaseNum = '';
  let activePhaseDoc = '';
  let phaseSprintContract = '';
  let phaseHandoff = '';
  let heartbeatSeconds = 20;
  let separatorIndex = -1;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--') {
      separatorIndex = index;
      break;
    }
    switch (arg) {
      case '--log-file':
        logFile = args[index + 1] ?? '';
        index += 1;
        break;
      case '--phase-start-epoch':
        phaseStartEpoch = args[index + 1] ?? '';
        index += 1;
        break;
      case '--qa-checksum-before':
        qaChecksumBefore = args[index + 1] ?? '';
        index += 1;
        break;
      case '--phase-qa-report':
        phaseQaReport = args[index + 1] ?? '';
        index += 1;
        break;
      case '--phase-scorecard':
        phaseScorecard = args[index + 1] ?? '';
        index += 1;
        break;
      case '--phase-execution-dir':
        phaseExecutionDir = args[index + 1] ?? '';
        index += 1;
        break;
      case '--scorecard-required':
        scorecardRequired = args[index + 1] ?? 'true';
        index += 1;
        break;
      case '--target-completion-score':
        targetCompletionScore = args[index + 1] ?? '100';
        index += 1;
        break;
      case '--watchdog-max-seconds':
        watchdogMaxSeconds = Number.parseInt(args[index + 1] ?? '0', 10) || 0;
        index += 1;
        break;
      case '--watchdog-check-seconds':
        watchdogCheckSeconds = Number.parseInt(args[index + 1] ?? '5', 10) || 5;
        index += 1;
        break;
      case '--status-file':
        statusFile = args[index + 1] ?? '';
        index += 1;
        break;
      case '--phase-num':
        phaseNum = args[index + 1] ?? '';
        index += 1;
        break;
      case '--active-phase-doc':
        activePhaseDoc = args[index + 1] ?? '';
        index += 1;
        break;
      case '--phase-sprint-contract':
        phaseSprintContract = args[index + 1] ?? '';
        index += 1;
        break;
      case '--phase-handoff':
        phaseHandoff = args[index + 1] ?? '';
        index += 1;
        break;
      case '--heartbeat-seconds':
        heartbeatSeconds = Number.parseInt(args[index + 1] ?? '20', 10) || 20;
        index += 1;
        break;
      default:
        break;
    }
  }

  const command = separatorIndex >= 0 ? args.slice(separatorIndex + 1) : [];
  if (!logFile || command.length === 0) {
    console.error([
      'Usage:',
      '  agent-loop-phase-runtime.mjs run-worker-prompt-with-completion-gate',
      '    --log-file <path>',
      '    --phase-start-epoch <seconds>',
      '    --qa-checksum-before <sha1>',
      '    --phase-qa-report <path>',
      '    --phase-scorecard <path>',
      '    --phase-execution-dir <path>',
      '    --scorecard-required <true|false>',
      '    --target-completion-score <n>',
      '    --watchdog-max-seconds <n>',
      '    --watchdog-check-seconds <n>',
      '    --status-file <path>',
      '    --phase-num <n>',
      '    --active-phase-doc <path>',
      '    --phase-sprint-contract <path>',
      '    --phase-handoff <path>',
      '    --heartbeat-seconds <n>',
      '    -- <command...>',
    ].join('\n'));
    process.exit(64);
  }

  const logStream = fs.createWriteStream(logFile, { flags: 'a' });
  const child = spawn(command[0], command.slice(1), {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
    detached: process.platform !== 'win32',
  });
  const spawnSummary = summarizeSpawnCommand(command, process.cwd());
  writeSupervisorEvent(logStream, 'spawn', {
    pid: child.pid ?? null,
    commandName: spawnSummary.commandName,
    argvSummary: spawnSummary.argvSummary,
    argvHash: spawnSummary.argvHash,
    promptHash: spawnSummary.promptHash,
    promptBytes: spawnSummary.promptBytes,
    promptArchivePath: spawnSummary.promptArchivePath,
    mode: 'completion-gate',
  });

  child.stdout.pipe(logStream, { end: false });
  child.stderr.pipe(logStream, { end: false });

  const exitCodePromise = new Promise((resolve, reject) => {
    child.on('error', (error) => {
      writeSupervisorEvent(logStream, 'error', {
        pid: child.pid ?? null,
        mode: 'completion-gate',
        message: error.message,
      });
      reject(error);
    });
    child.on('exit', (code, signal) => {
      writeSupervisorEvent(logStream, 'exit', {
        pid: child.pid ?? null,
        mode: 'completion-gate',
        code: code ?? 0,
        signal: signal ?? '',
      });
      resolve(code ?? 0);
    });
  });

  const startTime = Date.now();
  let timedOut = false;
  let completedEarly = false;
  let upstreamStreamStalled = false;
  let upstreamStreamStallDetail = null;
  let lastHeartbeatAt = 0;

  while (child.exitCode === null && child.signalCode === null) {
    const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);

    if (heartbeatSeconds > 0 && Date.now() - lastHeartbeatAt >= heartbeatSeconds * 1000) {
      const heartbeatOk = updatePhaseHeartbeat({
        statusFile,
        phaseNum,
        activePhaseDoc,
        sprintContractPath: phaseSprintContract,
        qaReportPath: phaseQaReport,
        handoffPath: phaseHandoff,
        scorecardPath: phaseScorecard,
      });
      writeSupervisorEvent(logStream, 'heartbeat', {
        pid: child.pid ?? null,
        mode: 'completion-gate',
        ok: heartbeatOk,
        phaseNum,
        statusFile,
      });
      lastHeartbeatAt = Date.now();
    }

    if (qaChecksumBefore) {
      const qaChecksumNow = sha1FileOrEmpty(phaseQaReport);
      if (qaChecksumNow !== qaChecksumBefore) {
        const allowed = evaluatePhaseCompletionAllowed({
          phaseStartEpoch,
          phaseQaReport,
          phaseScorecard,
          phaseHandoff,
          phaseExecutionDir,
          scorecardRequired,
          targetCompletionScore,
        });
        if (allowed) {
          completedEarly = true;
          writeSupervisorEvent(logStream, 'completion-gate-satisfied', {
            pid: child.pid ?? null,
            mode: 'completion-gate',
            phaseNum,
          });
          terminateProcess(child.pid, process.platform !== 'win32');
          await sleep(2000);
          killProcessHard(child.pid, process.platform !== 'win32');
          break;
        }
      }
    }

    const upstreamStall = detectCodexUpstreamStreamStall(logFile, elapsedSeconds);
    if (upstreamStall.stalled) {
      upstreamStreamStalled = true;
      upstreamStreamStallDetail = upstreamStall;
      writeSupervisorEvent(logStream, 'upstream-stream-stalled', {
        pid: child.pid ?? null,
        mode: 'completion-gate',
        phaseNum,
        maxReconnect: upstreamStall.maxReconnect,
        reconnectThreshold: upstreamStall.reconnectThreshold,
        maxSeconds: upstreamStall.maxSeconds,
      });
      terminateProcess(child.pid, process.platform !== 'win32');
      await sleep(5000);
      killProcessHard(child.pid, process.platform !== 'win32');
      break;
    }

    if (watchdogMaxSeconds > 0 && elapsedSeconds >= watchdogMaxSeconds) {
      timedOut = true;
      terminateProcess(child.pid, process.platform !== 'win32');
      await sleep(5000);
      killProcessHard(child.pid, process.platform !== 'win32');
      break;
    }

    await sleep(Math.max(watchdogCheckSeconds, 1) * 1000);
  }

  const exitCode = await exitCodePromise;

  if (completedEarly) {
    logStream.write('EARLY_COMPLETION_GATE satisfied; worker terminated after fresh verification evidence.\n');
    logStream.end();
    return 0;
  }

  if (timedOut) {
    logStream.write(`WATCHDOG_TIMEOUT after ${watchdogMaxSeconds}s\n`);
    logStream.end();
    return 124;
  }

  if (upstreamStreamStalled) {
    logStream.write(`UPSTREAM_STREAM_STALL reconnect=${upstreamStreamStallDetail?.maxReconnect ?? 'unknown'} threshold=${upstreamStreamStallDetail?.reconnectThreshold ?? 'unknown'} after=${upstreamStreamStallDetail?.maxSeconds ?? 'unknown'}s\n`);
    logStream.end();
    return 125;
  }

  logStream.end();
  return exitCode;
}

function printUsage() {
  console.error([
    'Usage:',
    '  agent-loop-phase-runtime.mjs resolve-runner-runtime <requested-runtime>',
    '  agent-loop-phase-runtime.mjs run-with-watchdog --log-file <path> --max-seconds <n> --check-seconds <n> -- <command...>',
    '  agent-loop-phase-runtime.mjs describe-stop-reason <reason> <runtime> [detail]',
    '  agent-loop-phase-runtime.mjs detect-final-stop-reason <log-file> [default-reason] [tool-schema-guard]',
    '  agent-loop-phase-runtime.mjs classify-timeout-reason <log-file>',
    '  agent-loop-phase-runtime.mjs resolve-timeout-fallback-runtime <current-runtime>',
    '  agent-loop-phase-runtime.mjs assess-runtime-health <runtime> [workspace-root]',
    '  agent-loop-phase-runtime.mjs run-worker-prompt-with-completion-gate ...',
  ].join('\n'));
}

function writeStdoutLine(value = '') {
  process.stdout.write(`${String(value)}\n`);
}

async function main() {
  const [command, ...args] = process.argv.slice(2);

  switch (command) {
    case 'resolve-runner-runtime':
      writeStdoutLine(resolveRunnerRuntime(args[0] ?? 'auto'));
      return 0;
    case 'describe-stop-reason':
      writeStdoutLine(describeStopReason(args[0] ?? '', args[1] ?? '', args[2] ?? ''));
      return 0;
    case 'detect-final-stop-reason':
      writeStdoutLine(detectFinalStopReason(args[0] ?? '', args[1] ?? 'phase-failed', args[2] ?? '2'));
      return 0;
    case 'classify-timeout-reason':
      writeStdoutLine(classifyTimeoutReason(args[0] ?? ''));
      return 0;
    case 'resolve-timeout-fallback-runtime':
      writeStdoutLine(resolveTimeoutFallbackRuntime(args[0] ?? ''));
      return 0;
    case 'assess-runtime-health': {
      const values = assessRuntimeHealth(args[0] ?? '', args[1] ?? process.cwd());
      for (const [key, value] of Object.entries(values)) {
        writeStdoutLine(`${key}=${shellQuote(value)}`);
      }
      return 0;
    }
    case 'run-with-watchdog':
      return runWithWatchdog(args);
    case 'run-worker-prompt-with-completion-gate':
      return runWorkerPromptWithCompletionGate(args);
    default:
      printUsage();
      return 64;
  }
}

main()
  .then((code) => {
    process.exit(code ?? 0);
  })
  .catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
