#!/usr/bin/env node

import {
  hasRemediationPacketReference,
  isRemediationPacketPath,
} from './lib/phase-remediation-packet.mjs';

const CANONICAL_NEXT_PATHS = [
  'clean_finish',
  'retry_loop',
  'resume_later_handoff',
];

const CANONICAL_CLOSEOUT_REASONS = [
  'scope_complete',
  'verification_failed',
  'blocked',
  'interrupted',
  'context_limit',
  'user_pause',
  'deferred_verification',
];

const CANONICAL_HANDOFF_STOP_REASONS = [
  'blocked',
  'interrupted',
  'context_limit',
  'user_pause',
  'deferred_verification',
];

const HEADING_ALIAS_ENTRIES = [
  ['goal', ['목표']],
  ['scope', ['범위']],
  ['detailed tasks', ['상세 작업']],
  ['exact execution targets', ['정확한 실행 대상']],
  ['phase completion checklist', ['Phase 완료 체크리스트']],
];

const HEADING_ALIAS_MAP = new Map(HEADING_ALIAS_ENTRIES);
const HEADING_LOOKUP = new Map();

for (const [canonical, aliases] of HEADING_ALIAS_ENTRIES) {
  HEADING_LOOKUP.set(canonical.toLowerCase(), canonical);
  for (const alias of aliases) {
    HEADING_LOOKUP.set(alias.toLowerCase(), canonical);
  }
}

function normalizeLineEndings(value) {
  return String(value ?? '').replace(/\r\n/g, '\n');
}

function normalizeWhitespace(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function canonicalizeHeading(value) {
  const normalized = normalizeWhitespace(value);
  const canonical = HEADING_LOOKUP.get(normalized.toLowerCase());
  return canonical || normalized;
}

export function getHeadingAliases(heading) {
  const canonical = canonicalizeHeading(heading).toLowerCase();
  return [...(HEADING_ALIAS_MAP.get(canonical) || [])];
}

export function sectionText(text, heading, aliases = []) {
  const normalizedTargets = new Set([
    canonicalizeHeading(heading),
    ...aliases.map((alias) => canonicalizeHeading(alias)),
  ]);
  const lines = normalizeLineEndings(text).split('\n');
  let start = -1;
  let level = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^(#{1,6})\s+(.+?)\s*$/);
    if (match && normalizedTargets.has(canonicalizeHeading(match[2]))) {
      start = index + 1;
      level = match[1].length;
      break;
    }
  }

  if (start < 0) {
    return '';
  }

  let end = lines.length;
  for (let index = start; index < lines.length; index += 1) {
    const match = lines[index].match(/^(#{1,6})\s+/);
    if (match && match[1].length <= level) {
      end = index;
      break;
    }
  }

  return lines.slice(start, end).join('\n').trim();
}

export function extractBulletValue(text, heading, label, aliases = []) {
  const section = sectionText(text, heading, aliases);
  const prefix = `- ${label}:`;
  for (const line of section.split('\n')) {
    const stripped = line.trim();
    if (stripped.toLowerCase().startsWith(prefix.toLowerCase())) {
      return stripped.slice(prefix.length).trim();
    }
  }
  return '';
}

function normalizeEnumValue(value) {
  return normalizeWhitespace(value).toLowerCase();
}

export function canonicalizeNextPath(value) {
  const normalized = normalizeEnumValue(value);
  if (normalized === 'blocked' || normalized === 'stop_and_handoff') {
    return 'resume_later_handoff';
  }
  if (CANONICAL_NEXT_PATHS.includes(normalized)) {
    return normalized;
  }
  return normalized;
}

export function canonicalizeCloseoutReason(value) {
  const normalized = normalizeEnumValue(value);
  if (normalized === 'stop_and_handoff') {
    return 'blocked';
  }
  if (CANONICAL_CLOSEOUT_REASONS.includes(normalized)) {
    return normalized;
  }
  return normalized;
}

export function canonicalizeHandoffStopReason(value) {
  const normalized = normalizeEnumValue(value);
  if (normalized === 'stop_and_handoff') {
    return 'blocked';
  }
  if (CANONICAL_HANDOFF_STOP_REASONS.includes(normalized)) {
    return normalized;
  }
  return normalized;
}

function rewriteBulletValue(line, label, mapper) {
  const match = line.match(/^(\s*-\s+)([^:]+:)(\s*)(.*)$/);
  if (!match) {
    return line;
  }
  const bulletLabel = match[2].trim().slice(0, -1);
  if (bulletLabel.toLowerCase() !== label.toLowerCase()) {
    return line;
  }
  const replacement = mapper(match[4]);
  return `${match[1]}${match[2]}${match[3]}${replacement}`;
}

export function normalizeArtifactText(text, options = {}) {
  const artifactType = normalizeEnumValue(options.artifactType || options.kind || '');
  const lines = normalizeLineEndings(text).split('\n');
  const normalized = lines.map((line) => {
    let nextLine = rewriteBulletValue(line, 'Next path', canonicalizeNextPath);
    nextLine = rewriteBulletValue(nextLine, 'Closeout reason', canonicalizeCloseoutReason);
    if (artifactType === 'handoff') {
      nextLine = rewriteBulletValue(nextLine, 'Stop reason', canonicalizeHandoffStopReason);
    }
    return nextLine;
  });
  return normalized.join('\n');
}

function isPassingStatus(status) {
  const normalized = normalizeEnumValue(status);
  return normalized === 'pass' || normalized === 'passed' || normalized === 'done' || normalized === 'verified';
}

function parseScenarioRow(line) {
  const cleaned = normalizeWhitespace(line.replace(/^[>*-]\s*/, ''));
  if (!cleaned.includes('|')) {
    return null;
  }
  const columns = cleaned.split('|').map((part) => normalizeWhitespace(part));
  if (columns.length < 3) {
    return null;
  }
  const scenarioId = columns[0];
  if (!/^SCN-[A-Za-z0-9_.-]+$/i.test(scenarioId)) {
    return null;
  }
  const status = columns[1];
  const evidencePath = columns.slice(2).join(' | ').trim();
  return {
    scenarioId,
    status,
    evidencePath,
  };
}

export function scenarioEvidencePassed(scenarioId, evidenceText) {
  const normalizedId = normalizeWhitespace(scenarioId).toLowerCase();
  const normalizedText = normalizeLineEndings(evidenceText);
  const structuredEvidencePattern = new RegExp(
    `"id"\\s*:\\s*"${normalizedId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[\\s\\S]{0,400}?"status"\\s*:\\s*"(?:pass|passed|done|verified)"[\\s\\S]{0,400}?"evidencePath"\\s*:\\s*"([^"]+)"`,
    'i',
  );
  const structuredMatch = normalizedText.match(structuredEvidencePattern);
  if (structuredMatch && !isRemediationPacketPath(structuredMatch[1])) {
    return true;
  }

  return normalizedText.split('\n').some((line) => {
    const lowered = line.toLowerCase();
    if (!lowered.includes(normalizedId)) {
      return false;
    }
    const parsed = parseScenarioRow(line);
    if (parsed) {
      return parsed.scenarioId.toLowerCase() === normalizedId
        && isPassingStatus(parsed.status)
        && Boolean(parsed.evidencePath)
        && !isRemediationPacketPath(parsed.evidencePath)
        && !/^(none|null|n\/a|placeholder)$/i.test(parsed.evidencePath);
    }
    if (hasRemediationPacketReference(line)) {
      return false;
    }
    return /\b(pass|passed|done|verified)\b/i.test(line) && !/\b(fail|failed|blocked|missing|todo|pending|retry)\b/i.test(line);
  });
}

export function parseScenarioRowEvidence(line) {
  return parseScenarioRow(line);
}

export {
  CANONICAL_NEXT_PATHS,
  CANONICAL_CLOSEOUT_REASONS,
  CANONICAL_HANDOFF_STOP_REASONS,
  canonicalizeHeading,
  normalizeLineEndings,
  normalizeWhitespace,
};
