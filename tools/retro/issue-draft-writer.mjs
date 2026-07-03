import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { readDailyRetro } from './daily-retro.mjs';
import { containedFile, resolveRetroRoot } from './retro-store.mjs';
import { validateDate, validateImprovementCandidate } from './retro-normalize.mjs';

const slugify = (value) => String(value || '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '')
  .slice(0, 64);

function fingerprint({ projectId, date, candidate }) {
  return createHash('sha256')
    .update(`${projectId}\n${date}\n${candidate.targetArea}\n${candidate.title.toLowerCase()}`)
    .digest('hex')
    .slice(0, 24);
}

export async function writeIssueDrafts({ projectId, date, stateRoot }) {
  if (!projectId) throw new Error('--project is required');
  validateDate(date);
  const daily = await readDailyRetro({ projectId, date, stateRoot });
  const root = path.join(resolveRetroRoot({ projectId, stateRoot }), 'issue-drafts');
  await mkdir(root, { recursive: true });
  const drafts = [];
  for (const candidate of daily.improvementCandidates || []) {
    validateImprovementCandidate(candidate);
    const id = fingerprint({ projectId, date, candidate });
    const body = `<!-- moonshot-retro:fingerprint=${id} -->

# ${candidate.title}

## Source

- Project: ${projectId}
- Date: ${date}
- Candidate: ${candidate.id}

## Proposed Change

Target area: ${candidate.targetArea}

${candidate.expectedImpact}

## Risk

${candidate.risk}

## Authority

Local draft only. No GitHub write was performed. \`promotionAuthority=false\`.
`;
    const bodyPath = containedFile(root, `${candidate.id}-${slugify(candidate.title)}.issue.md`);
    await writeFile(bodyPath, body);
    drafts.push({
      schemaVersion: 'retro.issue-draft.v1',
      projectId,
      date,
      candidateId: candidate.id,
      fingerprint: id,
      title: candidate.title,
      bodyPath,
      remoteWrite: false,
      promotionAuthority: false,
    });
  }
  await writeFile(path.join(root, 'issue-drafts.json'), `${JSON.stringify({
    schemaVersion: 'retro.issue-drafts.v1',
    projectId,
    date,
    drafts,
    promotionAuthority: false,
  }, null, 2)}\n`);
  return { drafts, outRoot: root, promotionAuthority: false };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  console.error('Use tools/retro/retro-cli.mjs issue-draft ...');
  process.exitCode = 1;
}
