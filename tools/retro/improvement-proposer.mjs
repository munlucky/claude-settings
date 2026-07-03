import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { readDailyRetro, writeImprovementCandidates } from './daily-retro.mjs';
import { containedFile, resolveRetroRoot } from './retro-store.mjs';
import { validateDate, validateImprovementCandidate } from './retro-normalize.mjs';

const slugify = (value) => String(value || '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '')
  .slice(0, 64);

function renderProposal({ projectId, date, candidate, patterns }) {
  const patternList = candidate.evidencePatternIds.join(', ');
  const evidence = patterns
    .filter((pattern) => candidate.evidencePatternIds.includes(pattern.id))
    .flatMap((pattern) => pattern.evidenceTasks.map((task) => `- ${task}: ${pattern.title}`))
    .join('\n') || '- See daily retro report.';
  return `# ${candidate.id}: ${candidate.title}

## Priority

${candidate.priority}

## Source

- Project: ${projectId}
- Date: ${date}
- Patterns: ${patternList}

## Problem

Repeated retro evidence indicates this harness area needs attention.

## Evidence

${evidence}

## Proposed Change

Update ${candidate.targetArea} checks or guidance so this failure is detected earlier.

## Expected Impact

${candidate.expectedImpact}

## Risk

${candidate.risk}

## Acceptance Criteria

- Retro fixture reproduces the pattern.
- The candidate remains advisory with \`promotionAuthority=false\`.
- Focused retro tests pass.
- \`npm test\` passes.

## Authority

Advisory only. Requires human approval before implementation. \`promotionAuthority=false\`.
`;
}

export async function proposeImprovements({ projectId, date, stateRoot }) {
  if (!projectId) throw new Error('--project is required');
  validateDate(date);
  const daily = await readDailyRetro({ projectId, date, stateRoot });
  const root = path.join(resolveRetroRoot({ projectId, stateRoot }), 'proposals');
  await mkdir(root, { recursive: true });
  const proposalPaths = [];
  for (const candidate of daily.improvementCandidates || []) {
    validateImprovementCandidate(candidate);
    const file = containedFile(root, `${candidate.id}-${slugify(candidate.title)}.md`);
    await writeFile(file, renderProposal({
      projectId,
      date,
      candidate,
      patterns: daily.rootPatterns || [],
    }));
    proposalPaths.push(file);
  }
  const payload = await writeImprovementCandidates({
    projectId,
    date,
    candidates: daily.improvementCandidates || [],
    stateRoot,
  });
  return { ...payload, proposalPaths };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  console.error('Use tools/retro/retro-cli.mjs propose ...');
  process.exitCode = 1;
}
