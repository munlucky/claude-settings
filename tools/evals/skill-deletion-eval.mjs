#!/usr/bin/env node
import { readFile, writeFile, mkdir, mkdtemp, cp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { createHash } from 'node:crypto';
import { generateSkillCompatibilityManifest } from './skill-compatibility-manifest.mjs';
import { resolveExplicitSkillInvocation, searchSkills } from '../../scripts/skill-router.mjs';
import { lintSkillsAndAgents } from '../../scripts/lint-skills.mjs';

const publicSkills = [
  'product-orchestrator', 'moonshot-architecture', 'moonshot-orchestrator',
  'moonshot-phase-runner', 'moonshot-plan-writer', 'commit-moonshot', 'session-logger',
];

const parseSections = (text) => {
  const sections = [];
  let heading = 'frontmatter';
  let fenced = false;
  for (const [index, raw] of text.split(/\r?\n/).entries()) {
    if (raw.startsWith('```')) { fenced = !fenced; continue; }
    const match = raw.match(/^##\s+(.+)$/);
    if (match) { heading = match[1].trim(); continue; }
    if (fenced || heading === 'frontmatter') continue;
    const value = raw.trim();
    if (value.length >= 48 && !/^[#>|]/.test(value)) sections.push({ line: index + 1, heading, text: value });
  }
  return sections;
};

const behaviorMetrics = (text) => {
  const section = (name) => text.match(new RegExp(`^##\\s+${name}\\s*$([\\s\\S]*?)(?=^##\\s+|(?![\\s\\S]))`, 'mi'))?.[1].trim() || '';
  return {
    trigger: /^triggers:\s*$/m.test(text) ? 1 : 0,
    process: section('Procedure').length > 0 ? 1 : 0,
    outcome: (section('Output Contract').match(/^[-*]\s+/gm) || []).length,
    prematureCompletion: (section('Hard Stops').match(/^[-*]\s+/gm) || []).length,
  };
};

const processContract = (text) => {
  const raw = text.match(/^##\s+Procedure\s*$([\s\S]*?)(?=^##\s+|(?![\s\S]))/mi)?.[1] || '';
  const clauses = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const clauseIds = clauses.map((line, index) => `procedure.${String(index + 1).padStart(2, '0')}:${createHash('sha256').update(line).digest('hex').slice(0, 12)}`);
  return { clauseIds, digest: createHash('sha256').update(JSON.stringify(clauses)).digest('hex') };
};

const worsened = (baseline, candidate) => Object.keys(baseline).filter((key) => candidate[key] < baseline[key]);

const routingResults = async (repoRoot, fixture, skill) => {
  const entry = fixture.skills.find((item) => item.name === skill);
  const results = [];
  for (const [polarity, prompts] of [['positive', entry.positive], ['negative', entry.negative]]) {
    for (const prompt of prompts) {
      const explicit = prompt.trim().startsWith('$');
      const route = explicit ? await resolveExplicitSkillInvocation(prompt, { repoRoot }) : await searchSkills(prompt, { repoRoot, limit: 1 });
      const selected = explicit ? route.selected : (route.results[0]?.name || '');
      results.push({ polarity, prompt, selected, matched: polarity === 'positive' ? selected === skill : selected !== skill });
    }
  }
  return results;
};

const makeCandidateRoot = async (repoRoot) => {
  const target = await mkdtemp(path.join(os.tmpdir(), 'skill-deletion-candidate-'));
  for (const relative of ['package', 'catalog', 'schemas', 'skills', 'agents', 'docs', 'rules', 'tools/evals', 'tests/fixtures/skill-routing']) {
    await cp(path.join(repoRoot, relative), path.join(target, relative), { recursive: true });
  }
  return target;
};

export async function evaluateSkillDeletionCandidates({ repoRoot = process.cwd(), skills = publicSkills } = {}) {
  const decisions = [];
  const fixture = JSON.parse(await readFile(path.join(repoRoot, 'tests/fixtures/skill-routing/public-entrypoint-cases.json'), 'utf8'));
  const baselineManifest = await generateSkillCompatibilityManifest({ repoRoot, sourceFingerprint: 'deletion-baseline' });
  for (const skill of skills) {
    const target = path.join(repoRoot, 'skills', skill, 'SKILL.md');
    const source = await readFile(target, 'utf8');
    const baselineMetrics = behaviorMetrics(source);
    const baselineProcessContract = processContract(source);
    const baselineRouting = await routingResults(repoRoot, fixture, skill);
    const candidateRoot = await makeCandidateRoot(repoRoot);
    for (const candidate of parseSections(source)) {
      const lines = source.split(/\r?\n/);
      lines.splice(candidate.line - 1, 1);
      const candidateMetrics = behaviorMetrics(lines.join('\n'));
      const candidateProcessContract = processContract(lines.join('\n'));
      const affectedMetrics = worsened(baselineMetrics, candidateMetrics);
      const contractFailures = [];
      if (candidateProcessContract.digest !== baselineProcessContract.digest || JSON.stringify(candidateProcessContract.clauseIds) !== JSON.stringify(baselineProcessContract.clauseIds)) contractFailures.push('process_clause_drift');
      let candidateRouting = [];
      try {
        await writeFile(path.join(candidateRoot, 'skills', skill, 'SKILL.md'), lines.join('\n'));
        const lint = await lintSkillsAndAgents({ repoRoot: candidateRoot });
        if (lint.status !== 'pass') contractFailures.push(`lint:${lint.findings.filter((item) => item.severity === 'blocking').map((item) => item.code).join(',')}`);
        try {
          const manifest = await generateSkillCompatibilityManifest({ repoRoot: candidateRoot, sourceFingerprint: 'deletion-candidate' });
          const baselineContract = baselineManifest.skills.find((item) => item.name === skill);
          const candidateContract = manifest.skills.find((item) => item.name === skill);
          for (const key of ['sourcePolicyDigest', 'contractHash', 'requiredOutputs', 'completionSemantics', 'hardStopIds']) {
            if (JSON.stringify(baselineContract[key]) !== JSON.stringify(candidateContract[key])) contractFailures.push(`compatibility:${key}`);
          }
        } catch (error) {
          contractFailures.push(`lint_or_manifest:${error.message}`);
        }
        candidateRouting = await routingResults(candidateRoot, fixture, skill);
        if (JSON.stringify(candidateRouting) !== JSON.stringify(baselineRouting)) contractFailures.push('routing_fixture_regression');
      } finally {
        await writeFile(path.join(candidateRoot, 'skills', skill, 'SKILL.md'), source);
      }
      const regressions = [...affectedMetrics, ...contractFailures];
      decisions.push({
        id: `${skill}:L${candidate.line}`,
        skill,
        line: candidate.line,
        section: candidate.heading,
        sentence: candidate.text,
        baselineMetrics,
        candidateMetrics,
        baselineProcessContract,
        candidateProcessContract,
        affectedMetrics,
        productionContracts: { lintAndSourcePolicyDigest: contractFailures.every((item) => !item.startsWith('lint:') && !item.startsWith('lint_or_manifest:')), compatibilityManifestEqual: contractFailures.every((item) => !item.startsWith('compatibility:')), directInvocationAndRoutingFixturesEqual: !contractFailures.includes('routing_fixture_regression'), requiredProcessOutputCompletionEqual: affectedMetrics.length === 0 && contractFailures.every((item) => !/process_clause_drift|requiredOutputs|completionSemantics|hardStopIds/.test(item)) },
        regressions,
        decision: regressions.length > 0 ? 'retain' : 'eligible_not_applied',
        canonicalMutation: false,
      });
    }
    await rm(candidateRoot, { recursive: true, force: true });
  }
  return {
    schemaVersion: 'moonshot-skill-deletion-eval.v1',
    status: 'pass',
    metricPolicy: 'same deterministic trigger, process, outcome, and premature-completion measures for baseline and each candidate',
    canonicalMutation: false,
    candidateCount: decisions.length,
    retainedCount: decisions.filter((item) => item.decision === 'retain').length,
    eligibleCount: decisions.filter((item) => item.decision === 'eligible_not_applied').length,
    decisions,
  };
}

const option = (args, name, fallback = '') => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : fallback; };
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const args = process.argv.slice(2);
  const repoRoot = path.resolve(option(args, '--repo-root', process.cwd()));
  const out = option(args, '--out');
  evaluateSkillDeletionCandidates({ repoRoot }).then(async (result) => {
    if (out) { const target = path.resolve(out); await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, `${JSON.stringify(result, null, 2)}\n`); }
    console.log(JSON.stringify(result, null, 2));
  }).catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
}
