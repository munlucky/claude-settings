#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_REPLAY_SCORECARD_OUTPUT, buildReplayScorecardIndex, loadReplayScorecardRecords, isReplayScorecardExcluded } from './awtl-replay-scorecard.mjs';
import { validateFailedTurnCase } from './awtl-failed-turn-case.mjs';

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(MODULE_DIR, '../../..');

export const DEFAULT_FAILED_TURN_CASE_OUTPUT = path.join(REPO_ROOT, '.claude/cache/awtl/failed_turn_cases.jsonl');
export const FAILURE_PREVENTION_BRIEF_LIMIT = 5;

function toText(value, fallback = '') {
  const text = String(value ?? '').trim();
  return text.length > 0 ? text : fallback;
}

function normalizeList(values = []) {
  const seen = new Set();
  const output = [];
  for (const value of values) {
    const text = toText(value, '');
    if (!text || seen.has(text)) {
      continue;
    }
    seen.add(text);
    output.push(text);
  }
  return output;
}

function splitSentences(text) {
  const compact = toText(text, '').replace(/\s+/g, ' ');
  if (!compact) {
    return '';
  }
  const sentenceMatch = compact.match(/^(.+?[.!?])(?:\s|$)/);
  return toText(sentenceMatch?.[1] ?? compact, compact);
}

function normalizeTokens(value) {
  return toText(value, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map((part) => part.trim())
    .filter(Boolean);
}

function intersects(left = [], right = []) {
  const rightSet = new Set(normalizeList(right).map((value) => value.toLowerCase()));
  return normalizeList(left).some((value) => rightSet.has(value.toLowerCase()));
}

function pathMatches(targetPath = '', candidatePath = '') {
  const left = toText(targetPath, '').replace(/\\/g, '/').toLowerCase();
  const right = toText(candidatePath, '').replace(/\\/g, '/').toLowerCase();
  if (!left || !right) {
    return false;
  }
  return left === right || left.includes(right) || right.includes(left);
}

function loadScorecardIndex(scorecardPath = DEFAULT_REPLAY_SCORECARD_OUTPUT) {
  const loaded = loadReplayScorecardRecords(scorecardPath);
  return {
    ...loaded,
    index: buildReplayScorecardIndex(loaded.records),
  };
}

function caseReplayKeys(caseValue = {}) {
  return normalizeList([
    caseValue.case_id,
    caseValue.caseId,
    caseValue.failure_turn_id,
    caseValue.failureTurnId,
    caseValue.turn_id,
    caseValue.turnId,
    caseValue.applicability?.run_id,
    caseValue.applicability?.runId,
    caseValue.applicability?.trace_id,
    caseValue.applicability?.traceId,
  ]);
}

function caseExcludedByScorecard(caseValue = {}, scorecardIndex = new Map()) {
  for (const key of caseReplayKeys(caseValue)) {
    const record = scorecardIndex.get(key);
    if (record && isReplayScorecardExcluded(record)) {
      return true;
    }
  }
  return false;
}

function scoreCase(caseValue, context = {}) {
  const applicability = caseValue?.applicability ?? {};
  let score = 0;
  const reasons = [];

  if (context.scope && applicability.scope) {
    const scope = toText(context.scope, '').toLowerCase();
    const caseScope = toText(applicability.scope, '').toLowerCase();
    if (scope === caseScope) {
      score += 4;
      reasons.push('scope');
    } else if (caseScope.includes(scope) || scope.includes(caseScope)) {
      score += 2;
      reasons.push('scope-partial');
    }
  }

  if (context.phaseDocPath && intersects([context.phaseDocPath], caseValue.artifact_refs ?? []) ) {
    score += 6;
    reasons.push('phase-doc');
  }
  if (score > 0 && context.phaseTitle) {
    const titleTokens = normalizeTokens(context.phaseTitle);
    const artifactText = normalizeList(caseValue.artifact_refs ?? []).join(' ').toLowerCase();
    const evidenceText = normalizeList(caseValue.evidence_refs ?? []).join(' ').toLowerCase();
    const hintText = toText(caseValue.prevention_hint, '').toLowerCase();
    const tokenHit = titleTokens.find((token) => token.length > 2 && (artifactText.includes(token) || evidenceText.includes(token) || hintText.includes(token)));
    if (tokenHit) {
      score += 3;
      reasons.push('phase-title');
    }
  }

  if (Array.isArray(context.artifactRefs) && context.artifactRefs.length > 0 && intersects(context.artifactRefs, caseValue.artifact_refs ?? [])) {
    score += 6;
    reasons.push('artifact');
  }

  if (context.failureType && toText(context.failureType, '').toLowerCase() === toText(applicability.failure_type, '').toLowerCase()) {
    score += 5;
    reasons.push('failure-type');
  }

  if (context.failureClass && toText(context.failureClass, '').toLowerCase() === toText(applicability.failure_class, '').toLowerCase()) {
    score += 3;
    reasons.push('failure-class');
  }

  const confidence = typeof applicability.confidence === 'number' ? applicability.confidence : null;
  if (confidence !== null) {
    if (score <= 0) {
      reasons.push('confidence-ignored-without-context-match');
    } else if (confidence >= 0.75) {
      score += 2;
      reasons.push('high-confidence');
    } else if (confidence >= 0.5) {
      score += 1;
      reasons.push('medium-confidence');
    } else {
      score -= 1;
      reasons.push('low-confidence');
    }
  } else {
    reasons.push('confidence-unknown');
  }

  return {
    score,
    reasons,
    confidence,
  };
}

function classifyConfidenceLabel(caseValue = {}) {
  const confidence = caseValue?.applicability?.confidence;
  if (typeof confidence !== 'number') {
    return 'imported-only';
  }
  if (confidence >= 0.75) {
    return 'high-confidence';
  }
  if (confidence >= 0.5) {
    return 'medium-confidence';
  }
  return 'low-confidence';
}

function summarizeMatchedCase(caseValue, context = {}) {
  const artifactRefs = normalizeList(caseValue.artifact_refs ?? []);
  const evidenceRefs = normalizeList(caseValue.evidence_refs ?? []);
  const scope = toText(caseValue?.applicability?.scope, context.scope ?? 'next-run recall');
  const preventionHint = splitSentences(caseValue.prevention_hint);
  const confidenceLabel = classifyConfidenceLabel(caseValue);
  const matchTarget = artifactRefs[0] || evidenceRefs[0] || scope;

  return `For ${scope}, ${preventionHint.replace(/^For\s+[^,]+,\s*/i, '').replace(/\bthe same artifact set\b/gi, matchTarget)} [${confidenceLabel}].`;
}

export function loadFailedTurnCases(cachePath = DEFAULT_FAILED_TURN_CASE_OUTPUT) {
  const resolvedPath = path.resolve(cachePath);
  if (!fs.existsSync(resolvedPath)) {
    return {
      cachePath: resolvedPath,
      loaded: false,
      cases: [],
      warnings: ['cache-missing'],
    };
  }

  const cases = [];
  const warnings = [];
  const rawLines = fs.readFileSync(resolvedPath, 'utf8').split(/\r?\n/);
  for (const rawLine of rawLines) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }
    try {
      const parsed = JSON.parse(line);
      const validation = validateFailedTurnCase(parsed);
      if (!validation.ok) {
        warnings.push(`invalid-case:${validation.errors.join('|')}`);
        continue;
      }
      cases.push(parsed);
    } catch (error) {
      warnings.push(`unparseable-line:${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return {
    cachePath: resolvedPath,
    loaded: true,
    cases,
    warnings,
  };
}

export function selectFailurePreventionCases(cases = [], context = {}, options = {}) {
  const scorecardPath = options.scorecardPath ?? DEFAULT_REPLAY_SCORECARD_OUTPUT;
  const scorecard = loadScorecardIndex(scorecardPath);
  const projected = [];
  for (const caseValue of cases) {
    if (caseExcludedByScorecard(caseValue, scorecard.index)) {
      continue;
    }
    const scored = scoreCase(caseValue, context);
    if (scored.score <= 0) {
      continue;
    }
    projected.push({
      case: caseValue,
      score: scored.score,
      reasons: scored.reasons,
      confidenceLabel: classifyConfidenceLabel(caseValue),
    });
  }

  projected.sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }
    const leftCreated = Date.parse(left.case.created_at ?? '') || 0;
    const rightCreated = Date.parse(right.case.created_at ?? '') || 0;
    return rightCreated - leftCreated;
  });

  const limit = Number.isInteger(options.limit) && options.limit > 0 ? options.limit : FAILURE_PREVENTION_BRIEF_LIMIT;
  return projected.slice(0, limit);
}

export function formatFailurePreventionBrief(selectedCases = [], context = {}) {
  const bullets = selectedCases.slice(0, FAILURE_PREVENTION_BRIEF_LIMIT).map((entry) => {
    const caseValue = entry.case ?? entry;
    const label = entry.confidenceLabel ?? classifyConfidenceLabel(caseValue);
    const artifactRefs = normalizeList(caseValue.artifact_refs ?? []);
    const target = artifactRefs.length > 0 ? artifactRefs.join(', ') : 'the matched failure context';
    const hint = splitSentences(caseValue.prevention_hint)
      .replace(/^For\s+[^,]+,\s*/i, '')
      .replace(/\bthe same artifact set\b/gi, target);
    const scope = toText(caseValue?.applicability?.scope, context.scope ?? 'next-run recall');
    const body = hint.endsWith('.') ? hint : `${hint}.`;
    return `- [${label}] For ${scope}, ${body}`;
  });

  if (bullets.length === 0) {
    return '';
  }

  return ['Failure Prevention Brief', ...bullets].join('\n');
}

export function buildFailurePreventionBrief(context = {}, options = {}) {
  const cachePath = options.cachePath ?? DEFAULT_FAILED_TURN_CASE_OUTPUT;
  const loaded = loadFailedTurnCases(cachePath);
  if (!loaded.loaded || loaded.cases.length === 0) {
    return {
      cachePath: loaded.cachePath,
      loaded: loaded.loaded,
      warnings: loaded.warnings,
      selectedCases: [],
      section: '',
      status: 'no-op',
    };
  }

  const selectedCases = selectFailurePreventionCases(loaded.cases, context, options);
  if (selectedCases.length === 0) {
    return {
      cachePath: loaded.cachePath,
      loaded: true,
      warnings: loaded.warnings,
      selectedCases: [],
      section: '',
      status: 'no-op',
    };
  }

  return {
    cachePath: loaded.cachePath,
    loaded: true,
    warnings: loaded.warnings,
    selectedCases,
    section: formatFailurePreventionBrief(selectedCases, context),
    status: 'matched',
  };
}

export function buildFailurePreventionBriefSection(context = {}, options = {}) {
  const result = buildFailurePreventionBrief(context, options);
  if (!result.section) {
    return '';
  }
  return `${result.section}`;
}
