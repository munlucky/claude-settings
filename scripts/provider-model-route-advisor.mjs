#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import {
  buildProviderRoutingDecision,
  buildRoutingDiagnosticEvent,
  normalizeRoutingIntent,
} from './lib/provider-model-routing.mjs';
import { adviseCodexGpt56 } from './lib/providers/codex-gpt-5-6-adapter.mjs';

const usage = () => 'Usage: node scripts/provider-model-route-advisor.mjs run --fixture <file> [--json]';

const parseArgs = (argv) => {
  const [command = 'run'] = argv;
  const options = { command, json: false, fixture: '' };
  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') options.json = true;
    else if (arg === '--fixture') options.fixture = argv[++index] || '';
    else if (arg.startsWith('--')) options[arg.slice(2)] = argv[++index] || '';
    else throw new Error(`Unknown argument: ${arg}\n${usage()}`);
  }
  return options;
};

const unsupportedDecision = (task) => buildProviderRoutingDecision({
  provider: task.provider || 'other',
  adapterId: `${task.provider || 'other'}-unsupported`,
  applicationMode: 'unsupported',
  applicationSurface: 'none',
  intent: task.intent || {},
  selectedModel: null,
  selectedEffort: null,
  reason: `${task.provider || 'other'} adapter capability is not confirmed`,
  fallback: 'manual_review',
  context: {
    projectedInputTokens: task.projectedInputTokens ?? null,
    tokenEstimateSource: task.tokenEstimateSource || 'unknown',
  },
});

export function adviseTask(task = {}) {
  const provider = task.provider || 'codex';
  const candidateDecision = provider === 'codex'
    ? adviseCodexGpt56(task.intent || {}, task)
    : unsupportedDecision(task);
  const decision = candidateDecision.applicationMode === 'enforced'
    ? {
      ...candidateDecision,
      applicationMode: 'advisory',
      applicationSurface: 'profile_default',
      enforcementEligible: false,
      providerMetadata: {
        ...candidateDecision.providerMetadata,
        shadowCandidateApplicationMode: candidateDecision.applicationMode,
        shadowCandidateApplicationSurface: candidateDecision.applicationSurface,
      },
    }
    : candidateDecision;
  return {
    id: task.id || 'unnamed-task',
    provider,
    intent: normalizeRoutingIntent(task.intent || {}),
    decision,
    diagnosticEvent: buildRoutingDiagnosticEvent(decision, {
      runId: task.runId || null,
      taskId: task.id || null,
    }),
    hostMutation: { performed: false, reason: 'shadow_advisor' },
    usage: {
      estimatedInputTokens: decision.projectedInputTokens,
      actualInputTokens: null,
      estimatedOutputTokens: task.estimatedOutputTokens ?? null,
      actualOutputTokens: null,
      estimatedCredits: null,
      actualCredits: null,
      cacheWriteCredits: null,
      retryCredits: null,
      verificationVerdict: null,
      userAcceptance: null,
      rework: null,
    },
  };
}

export function runShadowAdvisor(corpus = {}) {
  const tasks = Array.isArray(corpus.tasks) ? corpus.tasks : [];
  const items = tasks.map(adviseTask);
  const hasNonCodexProvider = tasks.some((task) => (task.provider || 'codex') !== 'codex');
  const reasonCoverage = items.length === 0
    ? 0
    : items.filter((item) => typeof item.decision.reason === 'string' && item.decision.reason.length > 0).length / items.length;
  return {
    schemaVersion: 1,
    mode: 'shadow',
    promotionDecision: 'shadow_only',
    hostMutation: { performed: false },
    reasonCoverage,
    calibration: {
      advisoryHeadroomTokens: null,
      source: 'insufficient_actual_runtime_counts',
      automaticRoutingEligible: false,
      evaluationManifest: {
        candidateProfilesByProvider: {
          codex: ['gpt-5.6-luna:high', 'gpt-5.6-luna:xhigh', 'gpt-5.6-terra:high', 'gpt-5.6-sol:high'],
        },
        candidateProfiles: hasNonCodexProvider
          ? ['mechanical', 'normal', 'hard_reasoning', 'long_context']
          : ['gpt-5.6-luna:high', 'gpt-5.6-luna:xhigh', 'gpt-5.6-terra:high', 'gpt-5.6-sol:high'],
        candidateProfileDisclosure: hasNonCodexProvider ? 'provider_neutral' : 'codex_only',
        sampleCount: tasks.length,
        repetitions: 0,
        nonInferiorityMargin: null,
        creditCeiling: null,
        modelBackedRuns: 'not_run',
        medianP95: null,
        evaluationReadiness: 'declaration_only',
      },
    },
    items,
  };
}

export async function writeDiagnosticEvidence(result, evidenceOut) {
  if (!evidenceOut) return null;
  const payload = {
    schemaVersion: 1,
    stream: 'model.routing.advised',
    mode: result.mode,
    events: result.items.map((item) => item.diagnosticEvent),
  };
  await writeFile(path.resolve(evidenceOut), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return path.resolve(evidenceOut);
}

export async function runFromFixture(fixturePath, { evidenceOut = '' } = {}) {
  const fixture = JSON.parse(await readFile(path.resolve(fixturePath), 'utf8'));
  const result = runShadowAdvisor(fixture);
  await writeDiagnosticEvidence(result, evidenceOut);
  return result;
}

const main = async () => {
  const options = parseArgs(process.argv.slice(2));
  if (options.command === '--help' || options.command === '-h') {
    console.log(usage());
    return;
  }
  if (options.command !== 'run' || !options.fixture) throw new Error(usage());
  const result = await runFromFixture(options.fixture, { evidenceOut: options['evidence-out'] || '' });
  console.log(options.json ? JSON.stringify(result, null, 2) : result.promotionDecision);
};

if (import.meta.url === `file://${process.argv[1]?.replaceAll('\\', '/')}` || process.argv[1]?.endsWith('provider-model-route-advisor.mjs')) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
