import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { buildRetroPatterns } from './retro-patterns.mjs';
import { readInboxRecords, resolveRetroRoot, writeDailyArtifacts } from './retro-store.mjs';
import { validateDate, validateImprovementCandidate, validateRetroIdentifier } from './retro-normalize.mjs';

function average(values) {
  const numeric = values.map(Number).filter((value) => Number.isFinite(value));
  if (numeric.length === 0) return 0;
  return Math.round((numeric.reduce((sum, value) => sum + value, 0) / numeric.length) * 1000) / 1000;
}

export function buildDailyRetro({ projectId, date, records }) {
  const summary = {
    completed: records.length,
    full: records.filter((record) => record.status === 'FULL').length,
    partial: records.filter((record) => record.status === 'PARTIAL').length,
    no: records.filter((record) => record.status === 'NO').length,
    averageScore: average(records.map((record) => record.score?.total)),
    totalReplans: records.reduce((sum, record) => sum + Number(record.execution?.replanCount || 0), 0),
  };
  const patterns = buildRetroPatterns({ projectId, date, records });
  return {
    schemaVersion: 'retro.daily.v1',
    projectId,
    date,
    sourceCount: records.length,
    summary,
    ...patterns,
    promotionAuthority: false,
  };
}

export function renderDailyMarkdown(report) {
  const repeated = report.repeatedFailureClasses.length === 0
    ? '- None'
    : report.repeatedFailureClasses
      .map((entry) => `- ${entry.failureClass}: ${entry.count} (${entry.affectedTasks.join(', ')})`)
      .join('\n');
  const candidates = report.improvementCandidates.length === 0
    ? '- None'
    : report.improvementCandidates
      .map((entry) => `- ${entry.id}: ${entry.title} (${entry.priority})`)
      .join('\n');
  return `# Daily Retro - ${report.projectId} - ${report.date}

## Summary

- Inputs: ${report.sourceCount}
- FULL: ${report.summary.full}
- PARTIAL: ${report.summary.partial}
- NO: ${report.summary.no}
- Average score: ${report.summary.averageScore}

## Repeated Failure Classes

${repeated}

## Recommended Harness Improvements

${candidates}

## Authority

This report is advisory only. \`promotionAuthority=false\`.`;
}

export async function runDailyRetro({ projectId, date, stateRoot }) {
  if (!projectId) throw new Error('--project is required');
  validateDate(date);
  const records = await readInboxRecords({ projectId, date, stateRoot });
  const report = buildDailyRetro({ projectId, date, records });
  const markdown = renderDailyMarkdown(report);
  const outRoot = await writeDailyArtifacts({ projectId, date, payload: report, markdown, stateRoot });
  return { report, outRoot };
}

export async function readDailyRetro({ projectId, date, stateRoot }) {
  const root = path.join(resolveRetroRoot({ projectId, stateRoot }), 'daily', date);
  const payload = JSON.parse(await readFile(path.join(root, 'daily-retro.json'), 'utf8'));
  return validateDailyRetro(payload, { projectId, date });
}

export async function writeImprovementCandidates({ projectId, date, candidates, stateRoot }) {
  const root = path.join(resolveRetroRoot({ projectId, stateRoot }), 'daily', date);
  await mkdir(root, { recursive: true });
  const validatedCandidates = (candidates || []).map(validateImprovementCandidate);
  const payload = {
    schemaVersion: 'retro.improvement-candidates.v1',
    projectId,
    date,
    candidates: validatedCandidates,
    promotionAuthority: false,
  };
  await writeFile(path.join(root, 'improvement-candidates.json'), `${JSON.stringify(payload, null, 2)}\n`);
  return payload;
}

export function validateDailyRetro(payload, { projectId, date } = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('daily retro payload must be an object');
  }
  if (payload.schemaVersion !== 'retro.daily.v1') throw new Error('unsupported daily retro schemaVersion');
  validateRetroIdentifier(payload.projectId, 'projectId');
  validateDate(payload.date);
  if (projectId && payload.projectId !== projectId) throw new Error('daily retro projectId does not match command project');
  if (date && payload.date !== date) throw new Error('daily retro date does not match command date');
  if (payload.promotionAuthority !== false) throw new Error('daily retro promotionAuthority must be false');
  if (!Array.isArray(payload.improvementCandidates)) throw new Error('daily retro improvementCandidates must be an array');
  payload.improvementCandidates = payload.improvementCandidates.map(validateImprovementCandidate);
  return payload;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  console.error('Use tools/retro/retro-cli.mjs daily ...');
  process.exitCode = 1;
}
