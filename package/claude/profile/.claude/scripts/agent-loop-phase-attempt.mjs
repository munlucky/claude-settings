#!/usr/bin/env node

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { classifyFailure } from './lib/failure-classifier.mjs';

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

const REVIEW_CLOSEOUT_GATES = new Set([
  'review-incomplete',
  'workflow-review-skill-missing',
  'workflow-review-bundle-missing',
  'missing-review-evidence',
]);

const FINISH_CLOSEOUT_GATES = new Set([
  'finish-closeout-incomplete',
  'workflow-finish-bundle-missing',
  'workflow-evidence-warnings',
  'missing-finish-closeout',
]);

const REVIEW_ONLY_REASONS = new Set(REVIEW_CLOSEOUT_GATES);

const VERIFICATION_MISSING_GATES = new Set([
  'no-fresh-verification-artifact',
  'missing-verification-evidence',
  'missing-fresh-verification-evidence',
  'verification-verdict-missing',
  'verification-verdict-inconsistent',
  'verification-evidence-missing',
]);

const SCORE_INCOMPLETE_GATES = new Set([
  'scorecard-missing',
  'scorecard-verdict=missing',
  'scorecard-verdict=blocked',
  'scorecard-score-below-target',
  'scorecard-unmet-items',
  'scorecard-blocking-defects',
  'scorecard-task-status=no',
  'scorecard-task-status=partial',
]);

const ARTIFACT_CONTRACT_INVALID_GATES = new Set([
  'workflow-section-missing',
  'workflow-selected-bundles-missing',
  'workflow-applied-skills-missing',
  'workflow-skipped-skills-missing',
  'workflow-selected-harness-components-missing',
  'workflow-harness-decision-evidence-missing',
  'workflow-effort-escalation-reason-missing',
  'workflow-code-simplifier-missing',
  'atomic-ledger-missing',
  'atomic-ledger-empty',
  'atomic-tasks-incomplete',
  'demo-first-gate-blocked',
  'demo-first-missing-approval',
  'demo-first-missing-scope',
  'plan-conformance-missing-master-plan',
  'plan-conformance-plan-status-mismatch',
  'plan-conformance-unapproved-deferred-scope',
  'plan-conformance-verification-verdict-inconsistent',
]);

function requiresCloseoutRemediation(reason) {
  const classification = classifyCompletionGateReason(reason);
  return [
    'review_closeout_missing',
    'finish_closeout_missing',
    'verification_missing',
    'score_incomplete',
    'artifact_contract_invalid',
  ].includes(classification.category);
}

function classifyCompletionGateReason(reason, context = {}) {
  const rawReason = String(reason || '').trim();
  const normalizedReason = rawReason.toLowerCase();
  const strongCompletion = context.strongCompletion === true;

  if (!normalizedReason || normalizedReason === 'ok') {
    return {
      category: 'ok',
      detail: rawReason || 'ok',
      retryPolicy: 'clean_finish',
      stopReason: 'ok',
      remediationStage: 'finish/handoff',
    };
  }

  if (
    normalizedReason.startsWith('blocked:')
    || normalizedReason === 'verification-preflight-blocked'
    || normalizedReason === 'path-authority-preflight-failed'
  ) {
    return {
      category: 'environment_blocked',
      detail: rawReason,
      retryPolicy: 'stop_loop',
      stopReason: rawReason,
      remediationStage: 'verify',
    };
  }

  if (normalizedReason === 'workflow-evidence-warnings' && strongCompletion) {
    return {
      category: 'ok',
      detail: rawReason,
      retryPolicy: 'clean_finish',
      stopReason: 'ok',
      remediationStage: 'finish/handoff',
    };
  }

  if (REVIEW_CLOSEOUT_GATES.has(normalizedReason)) {
    return {
      category: 'review_closeout_missing',
      detail: rawReason,
      retryPolicy: 'writer_only',
      stopReason: 'missing-review-evidence',
      remediationStage: 'review',
    };
  }

  if (FINISH_CLOSEOUT_GATES.has(normalizedReason)) {
    return {
      category: 'finish_closeout_missing',
      detail: rawReason,
      retryPolicy: 'writer_only',
      stopReason: 'missing-finish-closeout',
      remediationStage: 'finish/handoff',
    };
  }

  if (VERIFICATION_MISSING_GATES.has(normalizedReason)) {
    return {
      category: 'verification_missing',
      detail: rawReason,
      retryPolicy: 'verification_remediation',
      stopReason: 'missing-fresh-verification-evidence',
      remediationStage: 'verify',
    };
  }

  const contextualBlockerCode = classifyFailure({
    code: context.blockingReasonCode,
    failureCode: context.failureClass,
    blockerClass: context.blockerClass,
    reason: context.reason,
    detail: context.detail,
  }).code;
  if (
    normalizedReason.startsWith('scorecard-verdict=')
    && contextualBlockerCode === 'verification_environment_unavailable'
  ) {
    return {
      category: 'environment_blocked',
      detail: rawReason,
      retryPolicy: 'stop_loop',
      stopReason: 'blocked:verification_environment_unavailable',
      remediationStage: 'verify',
    };
  }

  if (normalizedReason === 'scorecard-verdict=blocked') {
    return {
      category: 'terminal_blocked',
      detail: rawReason,
      retryPolicy: 'stop_loop',
      stopReason: 'blocked:scorecard-verdict-blocked',
      remediationStage: 'finish/handoff',
    };
  }

  if (SCORE_INCOMPLETE_GATES.has(normalizedReason) || normalizedReason.startsWith('scorecard-')) {
    return {
      category: 'score_incomplete',
      detail: rawReason,
      retryPolicy: 'limited_retry',
      stopReason: 'missing-fresh-verification-evidence',
      remediationStage: 'verify',
    };
  }

  if (
    ARTIFACT_CONTRACT_INVALID_GATES.has(normalizedReason)
    || normalizedReason.startsWith('plan-conformance-')
    || normalizedReason.startsWith('workflow-')
    || normalizedReason.startsWith('atomic-')
    || normalizedReason.startsWith('demo-first-')
  ) {
    return {
      category: 'artifact_contract_invalid',
      detail: rawReason,
      retryPolicy: 'limited_retry',
      stopReason: 'missing-fresh-verification-evidence',
      remediationStage: 'verify',
    };
  }

  return {
    category: 'artifact_contract_invalid',
    detail: rawReason,
    retryPolicy: 'limited_retry',
    stopReason: 'missing-fresh-verification-evidence',
    remediationStage: 'verify',
  };
}

function isEnvironmentStopReason(reason) {
  const classification = classifyFailure({ reason, message: reason });
  return classification.category === 'environment' && classification.code !== 'unknown_failure';
}

function stopReasonForGateReason(reason, gate = null) {
  const classification = classifyCompletionGateReason(reason, {
    strongCompletion: gate?.PHASE_COMPLETION_CLEAN_FINISH === 'true',
  });
  return classification.stopReason;
}

function remediationStage(reason, gate = null) {
  return classifyCompletionGateReason(reason, {
    strongCompletion: gate?.PHASE_COMPLETION_CLEAN_FINISH === 'true',
  }).remediationStage;
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
  const classification = classifyCompletionGateReason(finalStopReason);

  if (classification.category === 'environment_blocked' || isEnvironmentStopReason(finalStopReason)) {
    return { ACTION: 'stop-loop', SUMMARY: finalStopReason };
  }

  if (finalStopReason === 'tool-schema-error-loop' && autonomousMode) {
    return { ACTION: 'stop-loop', SUMMARY: 'tool-schema-error-loop' };
  }

  if (finalStopReason === 'verification-command-missing' && autonomousMode && !advanceOnFailure) {
    return { ACTION: 'stop-loop', SUMMARY: 'verification-command-missing' };
  }

  if (classification.category === 'review_closeout_missing' && autonomousMode && autoFixCount <= 1) {
    return { ACTION: 'review-remediation', SUMMARY: 'retry-with-review-remediation' };
  }

  if (classification.category === 'finish_closeout_missing' && autonomousMode && autoFixCount <= 1) {
    return { ACTION: 'finish-remediation', SUMMARY: 'retry-with-finish-remediation' };
  }

  if (classification.retryPolicy === 'writer_only') {
    return { ACTION: 'stop-loop', SUMMARY: finalStopReason };
  }

  if (classification.retryPolicy === 'verification_remediation' || classification.retryPolicy === 'limited_retry') {
    if (autonomousMode && autoFixCount <= maxAutoFixAttempts) {
      return { ACTION: 'verification-remediation', SUMMARY: 'retry-with-verification-remediation' };
    }
    if (autonomousMode && advanceOnFailure) {
      return { ACTION: 'advance-after-failure', SUMMARY: 'advance-after-missing-verification-evidence' };
    }
    return { ACTION: 'stop-loop', SUMMARY: classification.stopReason };
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

function decideTimeoutPolicy(config) {
  const timeoutClass = String(config.timeoutClass || 'unknown_timeout');
  const repeated = toBool(config.repeated);
  if (timeoutClass === 'broad_search_timeout') {
    return { ACTION: 'stop-loop', SUMMARY: 'do_not_retry:broad_search_timeout', SAME_RUN_DECISION_RESULT: 'do_not_retry' };
  }
  if (timeoutClass === 'phaseRuntimeParity_timeout') {
    return { ACTION: 'route-long-budget', SUMMARY: 'route_to_long_budget:phaseRuntimeParity_timeout', SAME_RUN_DECISION_RESULT: 'route_to_long_budget' };
  }
  if (timeoutClass === 'raw_diff_output_timeout') {
    return repeated
      ? { ACTION: 'stop-loop', SUMMARY: 'stop_and_handoff:raw_diff_output_timeout', SAME_RUN_DECISION_RESULT: 'stop_and_handoff' }
      : { ACTION: 'retry-timeout', SUMMARY: 'bounded_retry:raw_diff_output_timeout', SAME_RUN_DECISION_RESULT: 'bounded_retry' };
  }
  if (timeoutClass === 'upstream_runtime_stall' || timeoutClass === 'codex_upstream_stream_stalled') {
    return { ACTION: 'stop-loop', SUMMARY: 'stop_and_handoff:upstream_runtime_stall', SAME_RUN_DECISION_RESULT: 'stop_and_handoff' };
  }
  return repeated
    ? { ACTION: 'stop-loop', SUMMARY: 'stop_and_handoff:unknown_timeout', SAME_RUN_DECISION_RESULT: 'stop_and_handoff' }
    : { ACTION: 'retry-timeout', SUMMARY: 'bounded_retry:unknown_timeout', SAME_RUN_DECISION_RESULT: 'bounded_retry' };
}

function decideFailureAction(config) {
  const autoFixCount = toInt(config.autoFixCount);
  const maxAutoFixAttempts = toInt(config.maxAutoFixAttempts);
  const autonomousMode = toBool(config.autonomousMode);
  const advanceOnFailure = toBool(config.advanceOnFailure);
  const finalStopReason = String(config.finalStopReason || 'phase-failed');

  if (isEnvironmentStopReason(finalStopReason)) {
    return { ACTION: 'stop-loop', SUMMARY: finalStopReason };
  }

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
3. If the gate reason starts with \`blocked:\` or equals \`scorecard-verdict=blocked\`, preserve it as a terminal blocked handoff and do not launch another equivalent remediation attempt.
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
    '  agent-loop-phase-attempt.mjs decide-timeout-policy <timeout-class> <repeated>',
    '  agent-loop-phase-attempt.mjs decide-failure-action <auto-fix-count> <max-auto-fix-attempts> <autonomous-mode> <advance-on-failure> <final-stop-reason>',
    '  agent-loop-phase-attempt.mjs classify-gate-stop-reason <phase-completion-reason>',
    '  agent-loop-phase-attempt.mjs build-verification-remediation-prompt <phase-num> <log-file> <phase-completion-reason>',
    '  agent-loop-phase-attempt.mjs build-auto-fix-prompt <phase-num> <log-file>',
  ].join('\n'));
}

function main(argv = process.argv.slice(2)) {
const [command, ...args] = argv;
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
  case 'classify-gate-stop-reason':
    {
      const classification = classifyCompletionGateReason(args[0]);
      printAssignments({
        STOP_REASON: stopReasonForGateReason(args[0]),
        GATE_REASON_CATEGORY: classification.category,
        GATE_REASON_DETAIL: classification.detail,
        RETRY_POLICY: classification.retryPolicy,
        REMEDIATION_STAGE: remediationStage(args[0]),
      });
    }
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
  case 'decide-timeout-policy':
    printAssignments(decideTimeoutPolicy({
      timeoutClass: args[0],
      repeated: args[1],
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
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}

export {
  classifyCompletionGateReason,
  decideMissingEvidenceAction,
  decideTimeoutPolicy,
};
