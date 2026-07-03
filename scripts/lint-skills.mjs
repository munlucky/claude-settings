#!/usr/bin/env node
import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const repoRootDefault = path.dirname(path.dirname(scriptPath));

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

const addFinding = (findings, severity, code, message, details = {}) => {
  findings.push({ severity, code, message, ...details });
};

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

const lintSkill = async (repoRoot, skillName, publicSkills, findings) => {
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
    const publicHeadingGroups = [
      { code: 'role_or_purpose', label: 'Role or Purpose', choices: ['Role', 'Purpose'] },
      { code: 'flow', label: 'Flow, Workflow, or operating flow', choices: ['Flow', 'Workflow', 'Required flow', 'Operating rules'] },
      { code: 'safety', label: 'Hard Stops, Hard rules, Gate Policy, or Operating rules', choices: ['Hard Stops', 'Hard rules', 'Gate Policy', 'Operating rules'] },
      { code: 'evidence_or_output', label: 'Required Evidence, output, or logging contract', choices: ['Required Evidence', 'Output Package', 'Handoff Contract', 'Default outputs', 'Minimum logging contract', 'AWTL Promotion Audit', 'Project Knowledge Boundary'] },
    ];
    for (const group of publicHeadingGroups) {
      if (!hasAnyHeading(skillHeadings, group.choices)) {
        addFinding(findings, 'blocking', 'skill.public_heading_missing', `Public skill ${skillName} is missing ${group.label}.`, { skill: skillName, required: group.code });
      }
    }
    if (!hasHeading(skillHeadings, 'References') && !frontmatter.deepReferences) {
      addFinding(findings, 'blocking', 'skill.public_references_missing', `Public skill ${skillName} must define References or deepReferences.`, { skill: skillName });
    }
  }

  for (const reference of [frontmatter.deepReferences].flat().filter(Boolean)) {
    const referencePath = reference.startsWith('docs/') || reference.startsWith('rules/') || reference.startsWith('schemas/')
      ? path.join(repoRoot, reference)
      : path.join(skillRoot, reference);
    if (!await pathExists(referencePath)) {
      const severity = reference.startsWith('.moonshot-relay/') ? 'warning' : 'blocking';
      addFinding(findings, severity, 'skill.deep_reference_missing', `Skill ${skillName} deep reference is missing: ${reference}`, { skill: skillName, reference });
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
    const englishLevels = headingLevels(text);
    const koreanLevels = headingLevels(koreanText);
    if (englishLevels.join(',') !== koreanLevels.join(',')) {
      addFinding(findings, 'warning', 'skill.translation_heading_drift', `Skill ${skillName} Korean translation heading structure drifted from SKILL.md.`, { skill: skillName });
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

  for (const skillName of await listDirs(path.join(repoRoot, 'skills'))) {
    await lintSkill(repoRoot, skillName, publicSkills, findings);
  }

  for (const fileName of await listMarkdownFiles(path.join(repoRoot, 'agents'))) {
    if (fileName === 'README.md' || fileName.endsWith('.ko.md')) {
      continue;
    }
    await lintAgentFile(repoRoot, `agents/${fileName}`, findings);
  }

  const blockingCount = findings.filter((item) => item.severity === 'blocking').length;
  return {
    schemaVersion: 'moonshot-skill-agent-lint.v1',
    status: blockingCount === 0 ? 'pass' : 'fail',
    publicSkills: [...publicSkills].sort(),
    blockingCount,
    warningCount: findings.length - blockingCount,
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
