#!/usr/bin/env node

import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const scriptDir = path.dirname(new URL(import.meta.url).pathname);
const phaseStatePath = path.join(scriptDir, 'agent-loop-phase-state.mjs');

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

function resolveRunnerRuntime(requestedRuntime) {
  if (requestedRuntime === 'claude' || requestedRuntime === 'codex') {
    return requestedRuntime;
  }

  if (commandExists('codex')) {
    return 'codex';
  }

  if (commandExists('claude')) {
    return 'claude';
  }

  console.error('Neither Codex CLI nor Claude CLI was found');
  process.exit(1);
}

function describeStopReason(reason, runtime, detail = '') {
  switch (reason) {
    case 'verification-command-missing':
      return '필수 verification 진입점 경로를 찾지 못해 phase를 진행할 수 없습니다 (block)';
    case 'timeout-auth':
      return `런타임 인증 또는 권한 문제로 ${runtime} 실행이 watchdog 제한 시간 안에 완료되지 않았습니다`;
    case 'timeout-network':
      return `네트워크 또는 외부 요청 문제로 ${runtime} 실행이 watchdog 제한 시간 안에 완료되지 않았습니다`;
    case 'timeout-browser':
      return '브라우저 또는 앱 런타임 smoke가 제한 시간 안에 준비되지 않았습니다';
    case 'timeout-verification':
      return '검증 산출물이 제시간에 생성되지 않아 phase 완료 판정을 내릴 수 없었습니다';
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
    if (/does not have access to Claude|Please login again|Could not resolve authentication method|login required|subscription|authentication/i.test(text)) {
      return 'timeout-auth';
    }
    if (/error sending request for url|network error|ENOTFOUND|ECONNREFUSED|connection refused|temporary failure/i.test(text)) {
      return 'timeout-network';
    }
    if (/browserctl|Browser flow failed|URL check failed|setup gap|http=000|LOCAL_FILE_MISSING/i.test(text)) {
      return 'timeout-browser';
    }
    if (/verification|scorecard|evidenceFresh|requiredChecks|QA_REPORT|HANDOFF/i.test(text)) {
      return 'timeout-verification';
    }
  }
  return 'timeout-restart-limit';
}

function resolveTimeoutFallbackRuntime(currentRuntime) {
  if (currentRuntime === 'claude' && commandExists('codex')) {
    return 'codex';
  }
  if (currentRuntime === 'codex' && commandExists('claude')) {
    return 'claude';
  }
  return '';
}

function detectFinalStopReason(logFile, defaultReason = 'phase-failed', guardRaw = '2') {
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

function terminateProcess(pid) {
  if (!Number.isFinite(pid)) {
    return;
  }

  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
    return;
  }

  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    return;
  }
}

function killProcessHard(pid) {
  if (!Number.isFinite(pid) || process.platform === 'win32') {
    return;
  }

  try {
    process.kill(pid, 'SIGKILL');
  } catch {
    // Ignore processes that already exited.
  }
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
  });

  child.stdout.pipe(logStream, { end: false });
  child.stderr.pipe(logStream, { end: false });

  const exitCodePromise = new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', (code) => resolve(code ?? 0));
  });

  let timedOut = false;
  const startTime = Date.now();

  while (child.exitCode === null && child.signalCode === null) {
    const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
    if (maxSeconds > 0 && elapsedSeconds >= maxSeconds) {
      timedOut = true;
      terminateProcess(child.pid);
      await sleep(5000);
      killProcessHard(child.pid);
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
      '    -- <command...>',
    ].join('\n'));
    process.exit(64);
  }

  const logStream = fs.createWriteStream(logFile, { flags: 'a' });
  const child = spawn(command[0], command.slice(1), {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  });

  child.stdout.pipe(logStream, { end: false });
  child.stderr.pipe(logStream, { end: false });

  const exitCodePromise = new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', (code) => resolve(code ?? 0));
  });

  const startTime = Date.now();
  let timedOut = false;
  let completedEarly = false;

  while (child.exitCode === null && child.signalCode === null) {
    const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);

    if (qaChecksumBefore) {
      const qaChecksumNow = sha1FileOrEmpty(phaseQaReport);
      if (qaChecksumNow !== qaChecksumBefore) {
        const allowed = evaluatePhaseCompletionAllowed({
          phaseStartEpoch,
          phaseQaReport,
          phaseScorecard,
          phaseExecutionDir,
          scorecardRequired,
          targetCompletionScore,
        });
        if (allowed) {
          completedEarly = true;
          terminateProcess(child.pid);
          await sleep(2000);
          killProcessHard(child.pid);
          break;
        }
      }
    }

    if (watchdogMaxSeconds > 0 && elapsedSeconds >= watchdogMaxSeconds) {
      timedOut = true;
      terminateProcess(child.pid);
      await sleep(5000);
      killProcessHard(child.pid);
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
    '  agent-loop-phase-runtime.mjs run-worker-prompt-with-completion-gate ...',
  ].join('\n'));
}

function writeStdoutLine(value) {
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
