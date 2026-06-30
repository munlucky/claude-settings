#!/usr/bin/env node
import process from 'node:process';

import {
  assessSecurityScans,
  browserResultToPlane,
  buildCommandEvidence,
  buildBrowserCompletionResult,
  classifyTaskVerification,
  normalizeBrowserConfirmationResult,
  normalizePlaywrightResult,
  buildVerificationReceipt,
  projectVerifyScoreEvidence,
  scoreCandidate,
  buildVerificationSummary,
  writeBrowserTraceMetadata,
} from './lib/verification-plane.mjs';
import {
  recordEvalResult,
  recordRuntimeEvent,
} from './lib/runtime-state-store.mjs';

const usage = () => `Usage: node scripts/verification-plane.mjs <record-summary|assess-security|normalize-browser-trace|normalize-playwright-result|normalize-browser-confirmation|classify-task|browser-result> [--json]`;

const parseArgs = (argv) => {
  const [command = ''] = argv;
  const options = { command, json: false };

  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') {
      options.json = true;
    } else if (arg.startsWith('--')) {
      const key = arg.slice(2).replace(/-([a-z])/g, (_, char) => char.toUpperCase());
      options[key] = argv[++index] || '';
    } else {
      throw new Error(`Unknown argument: ${arg}\n${usage()}`);
    }
  }
  return options;
};

const parseJsonOption = (text, name, fallback = {}) => {
  if (!text) {
    return fallback;
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${name} must be valid JSON`);
  }
};

const requireOption = (options, key) => {
  if (!options[key]) {
    throw new Error(`Missing required option --${key.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`)}`);
  }
  return options[key];
};

const writeResult = (result, json) => {
  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(result.status || 'ok');
  }
};

const main = async () => {
  const options = parseArgs(process.argv.slice(2));
  let result;

  if (options.command === 'record-summary') {
    const runId = requireOption(options, 'runId');
    const goalId = requireOption(options, 'goalId');
    const summary = buildVerificationSummary({
      runId,
      goalId,
      planes: parseJsonOption(options.planesJson, '--planes-json', []),
      profile: options.profile || 'runtime_adapter',
      requiredPlanes: options.requiredPlanesJson
        ? parseJsonOption(options.requiredPlanesJson, '--required-planes-json', [])
        : undefined,
      taskVerificationClass: parseJsonOption(options.taskClassJson || options.taskJson, '--task-class-json', null),
      browserCompletionResult: parseJsonOption(options.browserResultJson, '--browser-result-json', null),
      reviewCritiqueLoopReceipt: parseJsonOption(options.reviewCritiqueLoopJson || options.reviewReceiptJson, '--review-critique-loop-json', null),
      repairLoopReceipt: parseJsonOption(options.repairLoopJson, '--repair-loop-json', null),
      completionClaim: options.completionClaim === 'true',
      phaseCloseout: options.phaseCloseout === 'true',
      identity: parseJsonOption(options.identityJson, '--identity-json', {}),
      producedAt: options.producedAt,
      maxAgeMinutes: options.maxAgeMinutes || 60,
      reason: options.reason || 'verification plane evidence accepted',
    });
    const event = await recordRuntimeEvent({
      runId,
      goalId,
      eventType: 'verification.evidence',
      severity: 'info',
      payload: summary,
      identity: summary.identity,
      workspaceId: options.workspaceId || '',
    });
    const evalResult = await recordEvalResult({
      runId,
      goalId,
      suite: 'verification-plane',
      status: summary.requiredChecksPassed ? 'passed' : 'failed',
      score: {
        profileRequiredPlanes: summary.profileRequiredPlanes.length,
        completionAuthorityRequiredPlanes: summary.completionAuthorityRequiredPlanes.length,
        missingProfilePlanes: summary.missingProfilePlanes.length,
        missingCompletionAuthorityPlanes: summary.missingCompletionAuthorityPlanes.length,
        failedPlanes: summary.failedPlanes.length,
        securityBlockers: summary.securityBlockers.length,
      },
      regressionWorsened: false,
      evidence: summary,
      identity: summary.identity,
      workspaceId: options.workspaceId || '',
    });
    result = { status: 'recorded', ...summary, event, evalResult };
  } else if (options.command === 'score-candidate') {
    const candidate = parseJsonOption(options.candidateJson, '--candidate-json', {});
    const commands = parseJsonOption(options.commandsJson, '--commands-json', []).map((command) => buildCommandEvidence(command));
    const verification = buildVerificationReceipt({
      candidate,
      commands,
      status: options.verifyStatus || 'passed',
    });
    const score = scoreCandidate({
      candidate,
      verification,
      reviewFindings: parseJsonOption(options.reviewFindingsJson, '--review-findings-json', []),
      hardGates: parseJsonOption(options.hardGatesJson, '--hard-gates-json', []),
      policyVersion: options.policyVersion || 'score-policy-v1',
    });
    result = {
      status: 'scored',
      verification,
      score,
      projection: projectVerifyScoreEvidence({
        runId: options.runId || '',
        goalId: options.goalId || '',
        verifyReceipt: verification,
        scoreReceipt: score,
      }),
    };
  } else if (options.command === 'assess-security') {
    const runId = requireOption(options, 'runId');
    const goalId = requireOption(options, 'goalId');
    const assessment = assessSecurityScans({
      scans: parseJsonOption(options.scansJson, '--scans-json', {}),
      maxAgeMinutes: options.maxAgeMinutes || 24 * 60,
      exception: parseJsonOption(options.exceptionJson, '--exception-json', null),
    });
    const event = await recordRuntimeEvent({
      runId,
      goalId,
      eventType: 'security.review',
      severity: assessment.releaseBlocked ? 'blocking' : 'info',
      payload: {
        reason: assessment.blockers[0]?.reason || '',
        ...assessment,
      },
      workspaceId: options.workspaceId || '',
    });
    const evalResult = await recordEvalResult({
      runId,
      goalId,
      suite: 'security-plane',
      status: assessment.releaseBlocked ? 'blocked' : 'passed',
      score: {
        blockers: assessment.blockers.length,
        requiredScans: assessment.requiredScans.length,
        exceptionApplied: assessment.exceptionApplied,
      },
      regressionWorsened: assessment.releaseBlocked,
      evidence: assessment,
      workspaceId: options.workspaceId || '',
    });
    result = { ...assessment, event, evalResult };
  } else if (options.command === 'normalize-browser-trace') {
    const runId = requireOption(options, 'runId');
    const goalId = requireOption(options, 'goalId');
    const trace = await writeBrowserTraceMetadata({
      repoRoot: options.repoRoot || process.cwd(),
      runId,
      goalId,
      flow: options.flow || 'smoke',
      url: options.url || '',
      runtime: options.runtime || 'browserctl',
      evidenceDepth: options.evidenceDepth || 'smoke',
    });
    const event = await recordRuntimeEvent({
      runId,
      goalId,
      eventType: 'browser.trace',
      severity: 'info',
      payload: trace,
      workspaceId: options.workspaceId || '',
    });
    result = { ...trace, event };
  } else if (options.command === 'normalize-playwright-result') {
    const runId = requireOption(options, 'runId');
    const goalId = requireOption(options, 'goalId');
    const scenarioId = requireOption(options, 'scenarioId');
    const taskVerificationClass = parseJsonOption(options.taskClassJson || options.taskJson, '--task-class-json', null);
    const normalized = normalizePlaywrightResult({
      repoRoot: options.repoRoot || process.cwd(),
      runId,
      goalId,
      scenarioId,
      scenario: parseJsonOption(options.scenarioJson, '--scenario-json', {}),
      result: parseJsonOption(options.resultJson, '--result-json', {}),
      taskVerificationClass,
      generatedAt: options.generatedAt,
    });
    result = {
      ...normalized,
      browserPlane: browserResultToPlane(normalized.browserResult, taskVerificationClass),
    };
  } else if (options.command === 'normalize-browser-confirmation') {
    const runId = requireOption(options, 'runId');
    const goalId = requireOption(options, 'goalId');
    const scenarioId = requireOption(options, 'scenarioId');
    const taskVerificationClass = parseJsonOption(options.taskClassJson || options.taskJson, '--task-class-json', null);
    const normalized = normalizeBrowserConfirmationResult({
      repoRoot: options.repoRoot || process.cwd(),
      runId,
      goalId,
      scenarioId,
      scenario: parseJsonOption(options.scenarioJson, '--scenario-json', {}),
      confirmation: parseJsonOption(options.confirmationJson, '--confirmation-json', {}),
      playwrightResult: parseJsonOption(options.playwrightResultJson, '--playwright-result-json', null),
      taskVerificationClass,
      generatedAt: options.generatedAt,
    });
    result = {
      ...normalized,
      browserPlane: browserResultToPlane(normalized.browserResult, taskVerificationClass),
    };
  } else if (options.command === 'classify-task') {
    result = classifyTaskVerification(parseJsonOption(options.taskJson, '--task-json', {}));
  } else if (options.command === 'browser-result') {
    const taskVerificationClass = parseJsonOption(options.taskClassJson || options.taskJson, '--task-class-json', null);
    const browserResult = buildBrowserCompletionResult({
      runId: requireOption(options, 'runId'),
      goalId: requireOption(options, 'goalId'),
      scenarioId: requireOption(options, 'scenarioId'),
      status: options.status || 'failed',
      failedStage: options.failedStage || '',
      failureClass: options.failureClass || 'artifact_missing',
      evidenceDepth: options.evidenceDepth || 'smoke',
      sourceFingerprint: options.sourceFingerprint || '',
      commands: parseJsonOption(options.commandsJson, '--commands-json', []),
      artifacts: parseJsonOption(options.artifactsJson, '--artifacts-json', []),
      repairPromptPath: options.repairPromptPath || '',
      setupGap: options.setupGap === 'true',
      artifactSha256: options.artifactSha256 || '',
      generatedAt: options.generatedAt,
      producerCommand: options.producerCommand || 'node scripts/verification-plane.mjs browser-result',
      staleStatus: options.staleStatus || 'fresh',
      runtimeDecisionRef: options.runtimeDecisionRef || '',
      redactionManifest: parseJsonOption(options.redactionManifestJson, '--redaction-manifest-json', {}),
      taskVerificationClass,
    });
    result = {
      status: 'built',
      browserResult,
      browserPlane: browserResultToPlane(browserResult, taskVerificationClass),
    };
  } else if (options.command === '--help' || options.command === '-h') {
    console.log(usage());
    return;
  } else {
    throw new Error(`Unknown command: ${options.command}\n${usage()}`);
  }

  writeResult(result, options.json);
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
