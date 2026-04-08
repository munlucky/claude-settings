#!/usr/bin/env node

function shellQuote(value) {
  if (value === undefined || value === null) {
    return "''";
  }
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function toBool(value) {
  return String(value ?? '').trim().toLowerCase() === 'true';
}

function toInt(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function printAssignments(values) {
  for (const [key, value] of Object.entries(values)) {
    console.log(`${key}=${shellQuote(value)}`);
  }
}

function decideMissingEvidenceAction(config) {
  const autoFixCount = toInt(config.autoFixCount);
  const maxAutoFixAttempts = toInt(config.maxAutoFixAttempts);
  const autonomousMode = toBool(config.autonomousMode);
  const advanceOnFailure = toBool(config.advanceOnFailure);
  const finalStopReason = String(config.finalStopReason || 'missing-verification-evidence');

  if (finalStopReason === 'tool-schema-error-loop' && autonomousMode) {
    return { ACTION: 'stop-loop', SUMMARY: 'tool-schema-error-loop' };
  }

  if (finalStopReason === 'verification-command-missing' && autonomousMode && !advanceOnFailure) {
    return { ACTION: 'stop-loop', SUMMARY: 'verification-command-missing' };
  }

  if (autonomousMode && autoFixCount < maxAutoFixAttempts) {
    return { ACTION: 'verification-remediation', SUMMARY: 'retry-with-verification-remediation' };
  }

  if (autonomousMode && advanceOnFailure) {
    return { ACTION: 'advance-after-failure', SUMMARY: 'advance-after-missing-verification-evidence' };
  }

  return { ACTION: 'stop-loop', SUMMARY: 'missing-verification-evidence' };
}

function decideTimeoutAction(config) {
  const restartCount = toInt(config.restartCount);
  const maxRestarts = toInt(config.maxRestarts);
  const timeoutRuntimeFallback = toBool(config.timeoutRuntimeFallback);
  const timeoutFallbackUsed = toBool(config.timeoutFallbackUsed);
  const fallbackRuntime = String(config.fallbackRuntime || '');
  const currentRuntime = String(config.currentRuntime || '');
  const autonomousMode = toBool(config.autonomousMode);
  const advanceOnFailure = toBool(config.advanceOnFailure);

  if (
    timeoutRuntimeFallback &&
    !timeoutFallbackUsed &&
    fallbackRuntime &&
    fallbackRuntime !== currentRuntime
  ) {
    return {
      ACTION: 'switch-runtime',
      SUMMARY: `switch-runtime:${currentRuntime}->${fallbackRuntime}`,
      FALLBACK_RUNTIME: fallbackRuntime,
    };
  }

  if (maxRestarts > 0 && restartCount >= maxRestarts) {
    if (autonomousMode && advanceOnFailure) {
      return { ACTION: 'advance-after-failure', SUMMARY: 'advance-after-timeout-restart-limit' };
    }
    return { ACTION: 'stop-loop', SUMMARY: 'timeout-restart-limit' };
  }

  return { ACTION: 'retry-timeout', SUMMARY: 'retry-after-timeout' };
}

function decideFailureAction(config) {
  const autoFixCount = toInt(config.autoFixCount);
  const maxAutoFixAttempts = toInt(config.maxAutoFixAttempts);
  const autonomousMode = toBool(config.autonomousMode);
  const advanceOnFailure = toBool(config.advanceOnFailure);
  const finalStopReason = String(config.finalStopReason || 'phase-failed');

  if (finalStopReason === 'tool-schema-error-loop' && autonomousMode) {
    return { ACTION: 'stop-loop', SUMMARY: 'tool-schema-error-loop' };
  }

  if (finalStopReason === 'verification-command-missing' && autonomousMode && !advanceOnFailure) {
    return { ACTION: 'stop-loop', SUMMARY: 'verification-command-missing' };
  }

  if (autonomousMode && autoFixCount < maxAutoFixAttempts) {
    return { ACTION: 'auto-fix', SUMMARY: 'retry-with-auto-fix' };
  }

  if (autonomousMode && advanceOnFailure) {
    return { ACTION: 'advance-after-failure', SUMMARY: 'advance-after-max-attempts' };
  }

  return { ACTION: 'stop-loop', SUMMARY: 'phase-max-attempts' };
}

function buildVerificationRemediationPrompt(config) {
  const phaseNum = String(config.phaseNum || '');
  const logFile = String(config.logFile || '');
  const phaseCompletionReason = String(config.phaseCompletionReason || '');

  return `The previous phase attempt exited cleanly, but completion evidence is still missing.

Failure context:
- Log file: ${logFile}
- Gate reason: ${phaseCompletionReason}

Remediation steps:
1. Refresh or generate the latest verification/runtime verdict artifact for this phase.
2. If contract-backed verification applies, satisfy evidenceFresh=true and requiredChecks.missing=[].
3. Record the refreshed evidence in QA_REPORT.md.
4. If the phase is still incomplete, update HANDOFF.md.
5. Re-run only the active phase and finish with fresh evidence.
6. Keep SCORECARD.md authoritative: use \`retry\` until the target score is met with no unmet checklist items or blocking defects.`;
}

function buildAutoFixPrompt(config) {
  const phaseNum = String(config.phaseNum || '');
  const logFile = String(config.logFile || '');

  return `The previous phase attempt failed.

Failure context:
- Log file: ${logFile}

Remediation steps:
1. Analyze the failure from the log and current execution artifacts.
2. Fix only the active-phase issue.
3. Update QA_REPORT.md with the failure cause and remediation result.
4. If the phase is still incomplete, update HANDOFF.md with the next action.
5. Re-run the phase work and verification for phase ${phaseNum}.
6. Update SCORECARD.md and keep the verdict at \`retry\` unless the phase objectively meets the target score.`;
}

function printUsage() {
  console.error([
    'Usage:',
    '  agent-loop-phase-attempt.mjs decide-missing-evidence-action <auto-fix-count> <max-auto-fix-attempts> <autonomous-mode> <advance-on-failure> <final-stop-reason>',
    '  agent-loop-phase-attempt.mjs decide-timeout-action <restart-count> <max-restarts> <timeout-runtime-fallback> <timeout-fallback-used> <fallback-runtime> <current-runtime> <autonomous-mode> <advance-on-failure>',
    '  agent-loop-phase-attempt.mjs decide-failure-action <auto-fix-count> <max-auto-fix-attempts> <autonomous-mode> <advance-on-failure> <final-stop-reason>',
    '  agent-loop-phase-attempt.mjs build-verification-remediation-prompt <phase-num> <log-file> <phase-completion-reason>',
    '  agent-loop-phase-attempt.mjs build-auto-fix-prompt <phase-num> <log-file>',
  ].join('\n'));
}

const [command, ...args] = process.argv.slice(2);

switch (command) {
  case 'decide-missing-evidence-action':
    printAssignments(decideMissingEvidenceAction({
      autoFixCount: args[0],
      maxAutoFixAttempts: args[1],
      autonomousMode: args[2],
      advanceOnFailure: args[3],
      finalStopReason: args[4],
    }));
    break;
  case 'decide-timeout-action':
    printAssignments(decideTimeoutAction({
      restartCount: args[0],
      maxRestarts: args[1],
      timeoutRuntimeFallback: args[2],
      timeoutFallbackUsed: args[3],
      fallbackRuntime: args[4],
      currentRuntime: args[5],
      autonomousMode: args[6],
      advanceOnFailure: args[7],
    }));
    break;
  case 'decide-failure-action':
    printAssignments(decideFailureAction({
      autoFixCount: args[0],
      maxAutoFixAttempts: args[1],
      autonomousMode: args[2],
      advanceOnFailure: args[3],
      finalStopReason: args[4],
    }));
    break;
  case 'build-verification-remediation-prompt':
    process.stdout.write(buildVerificationRemediationPrompt({
      phaseNum: args[0],
      logFile: args[1],
      phaseCompletionReason: args[2],
    }));
    break;
  case 'build-auto-fix-prompt':
    process.stdout.write(buildAutoFixPrompt({
      phaseNum: args[0],
      logFile: args[1],
    }));
    break;
  default:
    printUsage();
    process.exit(64);
}
