import crypto from 'node:crypto';

import { buildRuntimeStatusReadModel } from './runtime-state-store.mjs';

export const CONTEXT_STATE_SCHEMA_VERSION = 1;

export const STABLE_PROMPT_PREFIX = [
  '# Moonshot Relay Runtime Context',
  '',
  'Use runtime-state read models as authority for active contract, blockers, lineage, and next action.',
  'Do not treat raw chat transcripts, hand-written phase status, or stale projections as clean completion authority.',
  'Keep stable policy/tool instructions before volatile execution state.',
].join('\n');

const asArray = (value) => (Array.isArray(value) ? value : []);

const text = (value, fallback = '') => String(value ?? fallback).trim();

const hash = (value) => crypto
  .createHash('sha256')
  .update(typeof value === 'string' ? value : JSON.stringify(value))
  .digest('hex');

const estimateTokens = (value) => Math.max(1, Math.ceil(JSON.stringify(value).length / 4));

const limitArray = (items, limit) => {
  const normalized = asArray(items);
  if (!Number.isFinite(limit) || limit <= 0 || normalized.length <= limit) {
    return normalized;
  }
  return normalized.slice(-limit);
};

export function buildContextStateFromRuntimeStatus(runtimeStatus) {
  const compactStatus = runtimeStatus?.compactStatus || {};
  const resumeBrief = runtimeStatus?.resumeBrief || {};
  const projectionFreshness = resumeBrief.projectionFreshness
    || compactStatus.projectionFreshness
    || { stale: false, source: 'runtime-state.sqlite' };
  const staleWarnings = asArray(compactStatus.staleWarnings);
  const currentBlocker = text(resumeBrief.currentBlocker || compactStatus.currentBlocker);

  return {
    schemaVersion: CONTEXT_STATE_SCHEMA_VERSION,
    authoritySource: 'runtime-state.sqlite',
    activeContract: compactStatus.activeContract || null,
    objective: text(resumeBrief.objective || compactStatus.objective),
    phase: text(resumeBrief.phase || compactStatus.phase),
    currentBlocker,
    lineage: asArray(resumeBrief.lineage).length > 0 ? asArray(resumeBrief.lineage) : asArray(compactStatus.lineage),
    assumptions: asArray(resumeBrief.assumptions || compactStatus.assumptions),
    evidence: asArray(resumeBrief.evidence || compactStatus.evidence),
    changedFiles: asArray(resumeBrief.changedFiles || compactStatus.changedFiles),
    openRisks: asArray(resumeBrief.openRisks || compactStatus.openRisks),
    nextAction: text(resumeBrief.nextAction),
    staleWarnings,
    projectionFreshness,
    completionEligible: staleWarnings.length === 0 && projectionFreshness.stale !== true,
  };
}

export async function buildContextState({ runId = '', goalId = '' } = {}) {
  const runtimeStatus = await buildRuntimeStatusReadModel({ runId, goalId });
  return {
    status: runtimeStatus.runtimeCapabilityStatus?.status === 'available' ? 'built' : 'degraded',
    runtimeStatus,
    contextState: buildContextStateFromRuntimeStatus(runtimeStatus),
  };
}

export function compactContextState(contextState, options = {}) {
  const maxEvidence = Number(options.maxEvidence || 24);
  const maxChangedFiles = Number(options.maxChangedFiles || 80);
  const maxRisks = Number(options.maxRisks || 24);
  const maxAssumptions = Number(options.maxAssumptions || 24);
  const originalTokens = estimateTokens(contextState);
  const compacted = {
    ...contextState,
    assumptions: limitArray(contextState.assumptions, maxAssumptions),
    evidence: limitArray(contextState.evidence, maxEvidence),
    changedFiles: limitArray(contextState.changedFiles, maxChangedFiles),
    openRisks: limitArray(contextState.openRisks, maxRisks),
  };
  delete compacted.eventHistory;
  const compactedTokens = estimateTokens(compacted);
  const requiredFields = [
    'objective',
    'phase',
    'currentBlocker',
    'lineage',
    'assumptions',
    'evidence',
    'changedFiles',
    'openRisks',
    'nextAction',
  ];
  const lostRequiredFields = requiredFields.filter((field) => compacted[field] === undefined);

  return {
    status: lostRequiredFields.length === 0 ? 'compacted' : 'invalid',
    contextState: compacted,
    metrics: {
      originalTokenEstimate: originalTokens,
      compactedTokenEstimate: compactedTokens,
      contextCompactionRatio: Number((compactedTokens / originalTokens).toFixed(4)),
      omittedEventHistoryCount: asArray(contextState.eventHistory).length,
      lostRequiredFields,
    },
  };
}

export function rehydratePhaseBrief(contextState) {
  const lines = [
    '# Phase Resume Brief',
    '',
    `- authoritySource: ${contextState.authoritySource || 'runtime-state.sqlite'}`,
    `- objective: ${contextState.objective || ''}`,
    `- phase: ${contextState.phase || ''}`,
    `- nextAction: ${contextState.nextAction || ''}`,
    `- currentBlocker: ${contextState.currentBlocker || ''}`,
    `- completionEligible: ${contextState.completionEligible === true ? 'true' : 'false'}`,
    '',
    '## Lineage',
    ...asArray(contextState.lineage).map((item) => `- ${item}`),
    '',
    '## Changed Files',
    ...asArray(contextState.changedFiles).map((item) => `- ${item}`),
    '',
    '## Evidence',
    ...asArray(contextState.evidence).map((item) => `- ${typeof item === 'string' ? item : JSON.stringify(item)}`),
    '',
    '## Open Risks',
    ...asArray(contextState.openRisks).map((item) => `- ${typeof item === 'string' ? item : JSON.stringify(item)}`),
  ];
  return {
    status: 'rehydrated',
    phaseBrief: `${lines.join('\n')}\n`,
    nextAction: contextState.nextAction || '',
  };
}

export function assemblePrompt(contextState, options = {}) {
  const stablePrefix = options.stablePrefix || STABLE_PROMPT_PREFIX;
  const compacted = compactContextState(contextState, options);
  const volatileTail = [
    '## Volatile Runtime State',
    '',
    JSON.stringify(compacted.contextState, null, 2),
  ].join('\n');
  const stablePrefixHash = hash(stablePrefix);
  const previous = text(options.previousStablePrefixHash);
  return {
    status: compacted.status === 'compacted' ? 'assembled' : 'invalid',
    stablePrefix,
    volatileTail,
    prompt: `${stablePrefix}\n\n${volatileTail}\n`,
    metrics: {
      ...compacted.metrics,
      stablePrefixHash,
      volatileTailHash: hash(volatileTail),
      stablePrefixBytes: Buffer.byteLength(stablePrefix, 'utf8'),
      volatileTailBytes: Buffer.byteLength(volatileTail, 'utf8'),
      promptCacheHit: previous ? previous === stablePrefixHash : false,
      cacheablePrefix: true,
    },
  };
}
