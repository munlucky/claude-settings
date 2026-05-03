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

const REVIEW_CLOSEOUT_REASONS = new Set([
  'review-incomplete',
  'workflow-review-skill-missing',
  'workflow-review-bundle-missing',
  'finish-closeout-incomplete',
  'workflow-finish-bundle-missing',
  'workflow-evidence-warnings',
]);

const REVIEW_ONLY_REASONS = new Set([
  'review-incomplete',
  'workflow-review-skill-missing',
  'workflow-review-bundle-missing',
]);

function requiresCloseoutRemediation(reason) {
  return REVIEW_CLOSEOUT_REASONS.has(String(reason || '').trim());
}

function remediationStage(reason) {
  const normalized = String(reason || '').trim();
  if (REVIEW_ONLY_REASONS.has(normalized)) {
    return 'review';
  }
  if (requiresCloseoutRemediation(normalized)) {
    return 'finish/handoff';
  }
  return 'verify';
}

function writeStdoutLine(value = '') {
  process.stdout.write(`${String(value)}\n`);
}

function printAssignments(values) {
  for (const [key, value] of Object.entries(values)) {
    writeStdoutLine(`${key}=${shellQuote(value)}`);
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

  if (autonomousMode && autoFixCount <= maxAutoFixAttempts) {
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

  if (autonomousMode && autoFixCount <= maxAutoFixAttempts) {
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
  const reviewFocused = REVIEW_ONLY_REASONS.has(phaseCompletionReason);
  const closeoutFocused = requiresCloseoutRemediation(phaseCompletionReason) && !reviewFocused;
  const nextStage = remediationStage(phaseCompletionReason);

  return `The previous phase attempt exited cleanly, but completion evidence is still missing.

Failure context:
- Log file: ${logFile}
- Gate reason: ${phaseCompletionReason}

Remediation steps:
1. Refresh the active phase artifacts instead of starting a new phase or switching to another phase.
2. Treat the missing completion evidence as an active closeout task for this same phase, not as a valid stop boundary.
3. If the gate reason starts with \`blocked:\` or equals \`scorecard-verdict=blocked\`, treat it as retryable phase remediation unless the active runtime/preflight is explicitly unavailable.
4. If the gate reason is review-related, run the required review pass now and record it in QA_REPORT.md:
   - set \`Review completed: yes\` only after the review actually ran
   - ensure \`codex-review-code\` appears in applied workflow evidence
   - capture review-driven changes or explicitly record that no blocking findings remained
5. If the gate reason is finish-closeout-related, complete finish-stage closeout now:
   - fill Why this round may stop now
   - fill Remaining in-scope work
   - fill Remaining blockers before closeout
   - remove placeholder or seed text from HANDOFF.md / QA_REPORT.md closeout sections
6. If verification evidence is already fresh and the remaining gap is only review or closeout bookkeeping, do not restart broad implementation work. Update only the missing review/finish artifacts and SCORECARD.md.
7. If a repository-global verifier still fails for a clearly pre-existing reason that this phase did not worsen, record that as carried-forward warning context in QA_REPORT.md/HANDOFF.md instead of leaving the phase in a placeholder closeout state.
8. Refresh or generate the latest verification/runtime verdict artifact for this phase when the active evidence is stale.
9. If contract-backed verification applies, satisfy evidenceFresh=true and requiredChecks.missing=[] unless the evidence is already fresh and the gate reason is review/finish-closeout only.
10. Do not return control just because implementation is complete or a verifier ran once. Return only after review evidence is recorded, finish-closeout fields are concrete, SCORECARD.md reaches \`Verdict: done\`, and SCORECARD.md reaches \`Current task status: FULL\`; otherwise keep the phase in retry with an explicit next action.

Priority notes:
- Review focused: ${reviewFocused ? 'yes' : 'no'}
- Finish closeout focused: ${closeoutFocused ? 'yes' : 'no'}
- Resume at stage: ${nextStage}`;
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
