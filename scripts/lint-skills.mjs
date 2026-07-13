#!/usr/bin/env node
import { access, readFile, readdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const repoRootDefault = path.dirname(path.dirname(scriptPath));
const publicSkillTokenBudgets = Object.freeze({
  // Exact accepted P04 candidate estimates. Any growth requires an explicit reviewed ratchet update.
  'product-orchestrator': 1858,
  'moonshot-architecture': 1473,
  'moonshot-orchestrator': 1087,
  'moonshot-phase-runner': 2145,
  'moonshot-plan-writer': 1463,
  'commit-moonshot': 2353,
  'session-logger': 677,
});
const estimatedTokens = (text) => Math.ceil(Buffer.byteLength(text, 'utf8') / 4);

const pathExists = async (target) => {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
};

const readJson = async (target) => JSON.parse(await readFile(target, 'utf8'));

const parseFrontmatter = (text) => {
  if (!text.startsWith('---\n')) {
    return {};
  }
  const end = text.indexOf('\n---', 4);
  if (end === -1) {
    return {};
  }
  const raw = text.slice(4, end).trim();
  const frontmatter = {};
  let activeKey = '';
  for (const line of raw.split(/\r?\n/)) {
    const keyValue = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (keyValue) {
      activeKey = keyValue[1];
      const value = keyValue[2].trim();
      frontmatter[activeKey] = value === '' ? [] : value.replace(/^["']|["']$/g, '');
      continue;
    }
    const item = line.match(/^\s*-\s+(.+)$/);
    if (item && activeKey) {
      if (!Array.isArray(frontmatter[activeKey])) {
        frontmatter[activeKey] = [];
      }
      frontmatter[activeKey].push(item[1].trim().replace(/^["']|["']$/g, ''));
    }
  }
  return frontmatter;
};

const headings = (text) => text
  .split(/\r?\n/)
  .filter((line) => /^#{1,3}\s+/.test(line))
  .map((line) => line.replace(/^#{1,3}\s+/, '').trim());

const headingLevels = (text) => text
  .split(/\r?\n/)
  .filter((line) => /^#{1,3}\s+/.test(line))
  .map((line) => line.match(/^(#{1,3})\s+/)[1].length);

const hasHeading = (items, name) => items.some((item) => item.toLowerCase() === name.toLowerCase());
const hasAnyHeading = (items, names) => names.some((name) => hasHeading(items, name));
const koreanHeadingAliases = new Map([
  ['사용 시점', 'Use When'], ['다른 경로', 'Route Away'], ['역할', 'Role'], ['절차', 'Procedure'],
  ['중단 조건', 'Hard Stops'], ['출력 계약', 'Output Contract'], ['명시적 호출', 'Explicit Invocation'],
]);
const normalizedTopology = (text, korean = false) => text.split(/\r?\n/)
  .filter((line) => /^##\s+/.test(line) && !/^###/.test(line))
  .map((line) => line.replace(/^##\s+/, '').trim())
  .map((heading) => korean ? (koreanHeadingAliases.get(heading) || heading) : heading);
const canonicalPolicyBinding = (text, skillName, korean = false) => {
  let canonical = text;
  if (korean) for (const [ko, en] of koreanHeadingAliases) canonical = canonical.replace(new RegExp(`^## ${ko}$`, 'gm'), `## ${en}`);
  const split = canonical.indexOf('\n---', 4); const body = split >= 0 ? canonical.slice(split + 4) : canonical;
  const section = (heading) => body.match(new RegExp(`^##\\s+${heading}\\s*$([\\s\\S]*?)(?=^##\\s+|(?![\\s\\S]))`, 'mi'))?.[1].trim().replace(/\s+/g, ' ') || '';
  const routing = ['commit-moonshot', 'session-logger'].includes(skillName) ? 'Explicit Invocation' : 'Route Away';
  const clauses = [['use-when', section('Use When') || section('Role')], ['routing', section(routing)], ['hard-stops', section('Hard Stops')], ['output-contract', section('Output Contract')]];
  const paths = [...new Set([...body.matchAll(/`([^`]*(?:\/|\\)[^`]*)`/g)].map((entry) => entry[1]).filter((entry) => !entry.includes(' ')).slice(0, 20))];
  return { ids: clauses.map(([id]) => `${skillName}.policy.${id}`), digest: createHash('sha256').update(JSON.stringify({ clauses, defaultPathClauses: paths })).digest('hex') };
};

const addFinding = (findings, severity, code, message, details = {}) => {
  findings.push({ severity, code, message, ...details });
};

const findingFingerprint = (finding) => createHash('sha256')
  .update(JSON.stringify([finding.severity, finding.code, finding.skill || '', finding.file || '', finding.reference || '', finding.key || '', finding.line || 0, finding.text || '']))
  .digest('hex');

const sectionLines = (text, heading) => {
  const match = text.match(new RegExp(`^##\\s+${heading}\\s*$([\\s\\S]*?)(?=^##\\s+|(?![\\s\\S]))`, 'mi'));
  return (match?.[1] || '').split(/\r?\n/).map((line) => line.trim()).filter((line) => /^[-*]\s+/.test(line));
};

const normalizedPolicyLine = (line) => line.replace(/^[-*]\s+/, '').replace(/`/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

const profileReferencePattern = /\.(claude|codex)[/\\](scripts|skills|agents|rules)(?:[/\\]|\b|$)/;
const dangerousProfileSourcePattern = /\b(edit|add|create|write|modify|maintain)\b|canonical source|durable source|source of truth/i;

const listDirs = async (target) => {
  const entries = await readdir(target, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
};

const listMarkdownFiles = async (target) => {
  const entries = await readdir(target, { withFileTypes: true });
  return entries.filter((entry) => entry.isFile() && entry.name.endsWith('.md')).map((entry) => entry.name).sort();
};

const lintSkill = async (repoRoot, skillName, publicSkills, publicMetadata, triggerFixtureSkills, findings, tokenBudgetEvidence) => {
  const skillRoot = path.join(repoRoot, 'skills', skillName);
  const skillPath = path.join(skillRoot, 'SKILL.md');
  if (!await pathExists(skillPath)) {
    addFinding(findings, 'blocking', 'skill.missing_main_file', `Skill ${skillName} is missing SKILL.md.`, { skill: skillName });
    return;
  }
  const text = await readFile(skillPath, 'utf8');
  const frontmatter = parseFrontmatter(text);
  const skillHeadings = headings(text);
  const isPublic = publicSkills.has(skillName);

  if (!frontmatter.name || !frontmatter.description) {
    addFinding(findings, isPublic ? 'blocking' : 'warning', 'skill.frontmatter_missing', `Skill ${skillName} must define name and description frontmatter.`, { skill: skillName });
  }
  if (frontmatter.name && frontmatter.name !== skillName) {
    addFinding(findings, 'blocking', 'skill.frontmatter_name_mismatch', `Skill ${skillName} frontmatter name does not match directory.`, { skill: skillName, frontmatterName: frontmatter.name });
  }

  if (isPublic) {
    const budget = publicSkillTokenBudgets[skillName];
    const actual = estimatedTokens(text);
    tokenBudgetEvidence.push({ skill: skillName, metric: 'utf8_bytes_divided_by_4_ceiling', actual, budget: budget || null, status: budget && actual <= budget ? 'pass' : 'fail' });
    if (!budget) addFinding(findings, 'blocking', 'skill.token_budget_missing', `Public skill ${skillName} has no token budget.`, { skill: skillName });
    else if (actual > budget) addFinding(findings, 'blocking', 'skill.token_budget_exceeded', `Public skill ${skillName} exceeds its ${budget}-token budget (${actual}).`, { skill: skillName, actual, budget });
    const metadata = publicMetadata.get(skillName);
    if (!metadata?.invocationMode || !Array.isArray(metadata.allowedStages) || metadata.allowedStages.length === 0) {
      addFinding(findings, 'blocking', 'skill.invocation_metadata_missing', `Public skill ${skillName} is missing invocationMode or allowedStages catalog metadata.`, { skill: skillName });
    }
    if (!metadata?.conditionalSkillGroups || Object.keys(metadata.conditionalSkillGroups).length === 0) {
      addFinding(findings, 'blocking', 'skill.conditional_loading_missing', `Public skill ${skillName} must declare conditionalSkillGroups.`, { skill: skillName });
    }
    if (!triggerFixtureSkills.has(skillName)) {
      addFinding(findings, 'blocking', 'skill.trigger_fixture_missing', `Public skill ${skillName} has no routing trigger fixture.`, { skill: skillName });
    }
    const binding = canonicalPolicyBinding(text, skillName);
    if (JSON.stringify(frontmatter.policyClauseIds || []) !== JSON.stringify(binding.ids) || frontmatter.policyDigest !== binding.digest) {
      addFinding(findings, 'blocking', 'skill.policy_binding_drift', `Public skill ${skillName} policy clause IDs or digest do not bind to its current policy text.`, { skill: skillName });
    }
    for (const heading of ['Role', 'Procedure', 'Hard Stops', 'Output Contract']) {
      if (!hasHeading(skillHeadings, heading)) {
        addFinding(findings, 'blocking', 'skill.public_heading_missing', `Public skill ${skillName} is missing typed heading ${heading}.`, { skill: skillName, required: heading });
      }
    }
    const explicitUtilities = new Set(['commit-moonshot', 'session-logger']);
    const routeHeadings = explicitUtilities.has(skillName)
      ? ['Explicit Invocation']
      : ['Use When', 'Route Away'];
    for (const heading of routeHeadings) {
      if (!hasHeading(skillHeadings, heading)) {
        addFinding(findings, 'blocking', 'skill.public_routing_heading_missing', `Public skill ${skillName} is missing routing heading ${heading}.`, { skill: skillName, required: heading });
      }
    }
    if (!hasHeading(skillHeadings, 'References') && !frontmatter.deepReferences) {
      addFinding(findings, 'blocking', 'skill.public_references_missing', `Public skill ${skillName} must define References or deepReferences.`, { skill: skillName });
    }
    const policyLines = [...sectionLines(text, 'Hard Stops'), ...sectionLines(text, 'Output Contract')];
    const seen = new Set();
    for (const line of policyLines) {
      const normalized = normalizedPolicyLine(line);
      if (normalized.length < 24) continue;
      if (seen.has(normalized)) addFinding(findings, 'blocking', 'skill.duplicate_policy_prose', `Public skill ${skillName} duplicates completion or hard-stop prose.`, { skill: skillName, text: normalized });
      seen.add(normalized);
    }
  }

  for (const reference of [frontmatter.deepReferences].flat().filter(Boolean)) {
    const referencePath = reference.startsWith('docs/') || reference.startsWith('rules/') || reference.startsWith('schemas/')
      ? path.join(repoRoot, reference)
      : path.join(skillRoot, reference);
    if (!await pathExists(referencePath) && !reference.startsWith('.moonshot-relay/')) {
      addFinding(findings, 'blocking', 'skill.deep_reference_missing', `Skill ${skillName} deep reference is missing: ${reference}`, { skill: skillName, reference });
    }
  }

  for (const [index, line] of text.split(/\r?\n/).entries()) {
    if (!profileReferencePattern.test(line)) {
      continue;
    }
    const dangerous = dangerousProfileSourcePattern.test(line);
    addFinding(
      findings,
      dangerous ? 'blocking' : 'warning',
      dangerous ? 'skill.profile_local_source_reference_blocking' : 'skill.profile_local_source_reference',
      dangerous
        ? `Skill ${skillName} tells contributors to treat profile-local runtime paths as source.`
        : `Skill ${skillName} references profile-local runtime source; verify this describes installed runtime behavior, not canonical source ownership.`,
      { skill: skillName, line: index + 1 },
    );
  }

  const koreanPath = path.join(skillRoot, 'SKILL.ko.md');
  if (await pathExists(koreanPath)) {
    const koreanText = await readFile(koreanPath, 'utf8');
    const koreanFrontmatter = parseFrontmatter(koreanText);
    const englishTopology = normalizedTopology(text);
    const koreanTopology = normalizedTopology(koreanText, true);
    if (JSON.stringify(englishTopology) !== JSON.stringify(koreanTopology)) {
      addFinding(findings, isPublic ? 'blocking' : 'warning', 'skill.translation_heading_drift', `Skill ${skillName} Korean translation heading topology drifted from SKILL.md.`, { skill: skillName, englishTopology, koreanTopology });
    }
    for (const key of ['name', 'triggers', 'outputArtifacts', 'deepReferences']) {
      if (JSON.stringify(frontmatter[key] || []) !== JSON.stringify(koreanFrontmatter[key] || [])) {
        addFinding(findings, isPublic ? 'blocking' : 'warning', 'skill.translation_policy_drift', `Skill ${skillName} Korean translation ${key} drifted from SKILL.md.`, { skill: skillName, key });
      }
    }
    if (isPublic) {
      const koreanBinding = canonicalPolicyBinding(koreanText, skillName, true);
      if (JSON.stringify(koreanFrontmatter.policyClauseIds || []) !== JSON.stringify(koreanBinding.ids) || koreanFrontmatter.policyDigest !== koreanBinding.digest || koreanFrontmatter.policyDigest !== frontmatter.policyDigest) {
        addFinding(findings, 'blocking', 'skill.translation_policy_binding_drift', `Skill ${skillName} Korean policy clauses do not bind to the canonical policy digest.`, { skill: skillName });
      }
    }
  }
};

const lintAgentFile = async (repoRoot, relativeFile, findings) => {
  const text = await readFile(path.join(repoRoot, relativeFile), 'utf8');
  const agentHeadings = headings(text);
  const required = ['Role', 'Inputs'];
  const outputOk = hasHeading(agentHeadings, 'Output') || hasHeading(agentHeadings, 'Outputs') || hasHeading(agentHeadings, 'Output Contract') || hasHeading(agentHeadings, 'Contract');
  for (const heading of required) {
    if (!hasHeading(agentHeadings, heading)) {
      addFinding(findings, 'blocking', 'agent.heading_missing', `Agent ${relativeFile} is missing ## ${heading}.`, { file: relativeFile, required: heading });
    }
  }
  if (!outputOk) {
    addFinding(findings, 'blocking', 'agent.output_heading_missing', `Agent ${relativeFile} must define Output or Outputs.`, { file: relativeFile });
  }
  if (!hasHeading(agentHeadings, 'References')) {
    addFinding(findings, 'warning', 'agent.references_heading_missing', `Agent ${relativeFile} should define References.`, { file: relativeFile });
  }
};

export const lintSkillsAndAgents = async (options = {}) => {
  const repoRoot = options.repoRoot || repoRootDefault;
  const runtimeSurfacePath = options.runtimeSurfacePath || path.join(repoRoot, 'package', 'runtime-surface.json');
  const runtimeSurface = await readJson(runtimeSurfacePath);
  const publicSkills = new Set(runtimeSurface.publicRuntimeSkills || []);
  const findings = [];
  const tokenBudgetEvidence = [];
  const carryForwardPath = options.carryForwardPath || path.join(repoRoot, 'tools', 'evals', 'skill-lint-carry-forward.json');
  const catalogPath = options.catalogPath || path.join(repoRoot, 'catalog', 'moonshot-catalog.json');
  const fixturePath = options.triggerFixturePath || path.join(repoRoot, 'tests', 'fixtures', 'skill-routing', 'public-entrypoint-cases.json');
  const catalog = await pathExists(catalogPath) ? await readJson(catalogPath) : { publicEntrypoints: [] };
  const fixture = await pathExists(fixturePath) ? await readJson(fixturePath) : { skills: [] };
  const publicMetadata = new Map((catalog.publicEntrypoints || []).map((entry) => [entry.name, entry]));
  const triggerFixtureSkills = new Set((fixture.skills || []).filter((entry) => Array.isArray(entry.positive) && entry.positive.length > 0 && Array.isArray(entry.negative) && entry.negative.length > 0).map((entry) => entry.name));

  for (const skillName of await listDirs(path.join(repoRoot, 'skills'))) {
    await lintSkill(repoRoot, skillName, publicSkills, publicMetadata, triggerFixtureSkills, findings, tokenBudgetEvidence);
  }

  for (const fileName of await listMarkdownFiles(path.join(repoRoot, 'agents'))) {
    if (fileName === 'README.md' || fileName.endsWith('.ko.md')) {
      continue;
    }
    await lintAgentFile(repoRoot, `agents/${fileName}`, findings);
  }

  for (const finding of findings) finding.fingerprint = findingFingerprint(finding);
  const warningFingerprints = findings.filter((finding) => finding.severity === 'warning').map((finding) => finding.fingerprint).sort();
  const warningDigest = createHash('sha256').update(JSON.stringify(warningFingerprints)).digest('hex');
  const carryForward = await pathExists(carryForwardPath) ? await readJson(carryForwardPath) : null;
  const registryValid = Boolean(carryForward?.reviewed === true && carryForward.warningCount >= 0 && carryForward.warningFingerprintDigest);
  if (!registryValid) addFinding(findings, 'blocking', 'skill.warning_baseline_missing', 'Reviewed warning carry-forward registry is required and must not be empty.');
  const baselineInput = options.baselineFindingFingerprints;
  const baselineFingerprints = baselineInput ? new Set(Array.isArray(baselineInput) ? baselineInput : (baselineInput.findingFingerprints || [])) : null;
  const newFindingCount = baselineFingerprints ? findings.filter((finding) => !baselineFingerprints.has(finding.fingerprint)).length : 0;
  if (baselineFingerprints && baselineFingerprints.size === 0) addFinding(findings, 'blocking', 'skill.warning_baseline_empty', 'Explicit warning baseline must not be empty.');
  if (registryValid && (carryForward.warningCount !== warningFingerprints.length || carryForward.warningFingerprintDigest !== warningDigest)) {
    addFinding(findings, 'blocking', 'skill.warning_ratchet_drift', 'Warning fingerprint set drifted from the reviewed carry-forward registry.', { expectedCount: carryForward.warningCount, actualCount: warningFingerprints.length });
  }
  if (registryValid) {
    const publicWarnings = findings.filter((finding) => finding.severity === 'warning' && publicSkills.has(finding.skill));
    for (const finding of publicWarnings) {
      const explanation = (carryForward.publicCarryForward || []).find((entry) => entry.skill === finding.skill && entry.code === finding.code && entry.reason);
      if (!explanation) addFinding(findings, 'blocking', 'skill.public_warning_unexplained', `Public skill warning lacks reviewed carry-forward rationale: ${finding.skill}/${finding.code}.`, { skill: finding.skill });
    }
  }
  const rawBlockingCount = findings.filter((item) => item.severity === 'blocking').length;
  const blockingCount = rawBlockingCount + newFindingCount;
  return {
    schemaVersion: 'moonshot-skill-agent-lint.v2',
    status: blockingCount === 0 ? 'pass' : 'fail',
    publicSkills: [...publicSkills].sort(),
    blockingCount,
    warningCount: findings.length - rawBlockingCount,
    newFindingCount,
    findingFingerprints: findings.map((finding) => finding.fingerprint).sort(),
    warningFingerprintDigest: warningDigest,
    carryForwardRegistry: registryValid ? carryForwardPath : null,
    tokenBudgetEvidence: tokenBudgetEvidence.sort((a, b) => a.skill.localeCompare(b.skill)),
    findings,
  };
};

const parseArgs = (argv) => {
  const options = { json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') {
      options.json = true;
    } else if (arg === '--repo-root') {
      options.repoRoot = path.resolve(argv[++index]);
    } else if (arg === '--runtime-surface') {
      options.runtimeSurfacePath = path.resolve(argv[++index]);
    } else if (arg === '--baseline-findings') {
      options.baselineFindingFingerprints = JSON.parse(readFileSync(path.resolve(argv[++index]), 'utf8'));
    } else if (arg === '--help' || arg === '-h') {
      console.log('Usage: node scripts/lint-skills.mjs [--json] [--repo-root <dir>] [--runtime-surface <file>]');
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
};

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  const options = parseArgs(process.argv.slice(2));
  lintSkillsAndAgents(options).then((result) => {
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`${result.status}: ${result.blockingCount} blocking, ${result.warningCount} warning`);
      for (const item of result.findings) {
        console.log(`[${item.severity}] ${item.code}: ${item.message}`);
      }
    }
    process.exit(result.status === 'pass' ? 0 : 2);
  }).catch((error) => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}
