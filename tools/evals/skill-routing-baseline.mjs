#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { readFile as readSourceFile } from 'node:fs/promises';
import { resolveExplicitSkillInvocation, searchSkills } from '../../scripts/skill-router.mjs';
import { generateSkillCompatibilityManifest } from './skill-compatibility-manifest.mjs';

const hash = (value) => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const git = (repoRoot, args) => spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8' }).stdout.trim();

export async function captureSkillRoutingBaseline({ repoRoot = process.cwd(), out = '' } = {}) {
  const fixturePath = path.join(repoRoot, 'tests/fixtures/skill-routing/public-entrypoint-cases.json');
  const fixtureText = await readFile(fixturePath, 'utf8');
  const fixture = JSON.parse(fixtureText);
  const previousReleaseSha = git(repoRoot, ['rev-parse', 'HEAD']);
  const skillBytes = await Promise.all(fixture.skills.map((entry) => readSourceFile(path.join(repoRoot, 'skills', entry.name, 'SKILL.md'), 'utf8')));
  const routerBytes = await readSourceFile(path.join(repoRoot, 'scripts/skill-router.mjs'), 'utf8');
  const sourceFingerprint = hash([
    previousReleaseSha,
    await readFile(path.join(repoRoot, 'package/runtime-surface.json'), 'utf8'),
    await readFile(path.join(repoRoot, 'catalog/moonshot-catalog.json'), 'utf8'),
    routerBytes,
    ...skillBytes,
    fixtureText,
  ].join('\n'));
  const compatibilityManifest = await generateSkillCompatibilityManifest({ repoRoot, sourceFingerprint });
  const deterministicResults = [];
  for (const skill of fixture.skills) {
    for (const [polarity, prompts] of [['positive', skill.positive], ['negative', skill.negative]]) {
      for (const prompt of prompts) {
        const explicit = prompt.trim().startsWith('$');
        const route = explicit
          ? await resolveExplicitSkillInvocation(prompt, { repoRoot })
          : await searchSkills(prompt, { repoRoot, limit: 1 });
        const selected = explicit ? route.selected : (route.results[0]?.name || '');
        deterministicResults.push({
          skill: skill.name, polarity, promptHash: hash(prompt), explicit, selected,
          matched: polarity === 'positive' ? selected === skill.name : selected !== skill.name,
          evaluatorId: explicit ? 'public-surface-explicit.v1' : 'skill-search-ranking.v1',
          loadedSkills: [], loadedReferences: [], estimatedContextTokens: Number(explicit ? 0 : (route.results[0]?.tokenEstimate || 0)),
          retries: 0, prematureCompletion: false, completionOutcome: 'not_executed', repeatedFailureClass: '',
        });
      }
    }
  }
  const direct = deterministicResults.filter((entry) => entry.explicit && entry.polarity === 'positive');
  const payload = {
    schemaVersion: 'moonshot-skill-routing-baseline.v1',
    capturedAt: new Date().toISOString(), sourceFingerprint, fixtureHash: hash(fixtureText), scorerVersion: 'production-router.v1',
    sourceHeadSha: previousReleaseSha, orderedPublicSurfaceHash: compatibilityManifest.orderedPublicContractHash,
    compatibilityManifestHashes: Object.fromEntries(compatibilityManifest.skills.map((skill) => [skill.name, skill.contractHash])),
    lintWarningFingerprints: [],
    deterministic: {
      evaluator: 'scripts/skill-router.mjs#searchSkills', results: deterministicResults,
      directInvocationSuccessRate: direct.length ? direct.filter((entry) => entry.matched).length / direct.length : 0,
    },
    model: { status: 'not_run', requiredRunsPerCase: 3, provider: '', model: '', version: '', promptHash: '', runSeed: null, timeoutMs: null, usage: null, cost: null, scorerVersion: '' },
    previousRelease: { sha: '', status: 'unverified', liveAdoptionBlocked: true, reason: 'operator must supply the actual previous release ref and matching installed materialization evidence' },
    installedMaterialization: { status: 'unverified', liveAdoptionBlocked: true, reason: 'installed manifest materialization comparison requires controlled adoption evidence' },
  };
  if (out) { await mkdir(path.dirname(out), { recursive: true }); await writeFile(out, `${JSON.stringify(payload, null, 2)}\n`); }
  return payload;
}

async function main() {
  const args = process.argv.slice(2); const value = (flag) => { const index = args.indexOf(flag); return index >= 0 ? args[index + 1] : ''; };
  const repoRoot = path.resolve(value('--repo-root') || process.cwd());
  const requestedOut = value('--out');
  const provisional = await captureSkillRoutingBaseline({ repoRoot });
  const out = path.resolve(requestedOut || path.join(repoRoot, 'runtime/eval/baselines/skill-compatibility', provisional.sourceFingerprint, 'baseline.json'));
  const payload = await captureSkillRoutingBaseline({ repoRoot, out });
  console.log(JSON.stringify({ ...payload, outputPath: out }, null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
