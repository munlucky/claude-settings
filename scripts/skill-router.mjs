#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const repoRootDefault = path.dirname(path.dirname(scriptPath));

const unsafePatterns = [
  /secret/i,
  /token/i,
  /password/i,
  /credential/i,
  /runtimeLogBody/i,
  /rawMemoryGraph/i,
  /browserScrapeBody/i,
];

const parseFrontmatter = (text) => {
  if (!text.startsWith('---\n')) {
    return { frontmatter: {}, body: text };
  }
  const end = text.indexOf('\n---', 4);
  if (end === -1) {
    return { frontmatter: {}, body: text };
  }
  const raw = text.slice(4, end).trim();
  const body = text.slice(end + 4).replace(/^\r?\n/, '');
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
  return { frontmatter, body };
};

const extractHeadings = (text) => text
  .split(/\r?\n/)
  .filter((line) => /^#{1,3}\s+/.test(line))
  .map((line) => line.replace(/^#{1,3}\s+/, '').trim());

const tokenEstimate = (text) => Math.ceil(text.split(/\s+/).filter(Boolean).length * 1.35);

const sanitizePromptBlock = (text) => {
  const removed = [];
  const lines = [];
  let unsafeBlockIndent = null;
  for (const line of text.split(/\r?\n/)) {
    const indent = line.match(/^\s*/)[0].length;
    if (unsafeBlockIndent !== null) {
      if (line.trim() === '') {
        removed.push('');
        continue;
      }
      if (indent > unsafeBlockIndent && !/^#{1,6}\s+/.test(line)) {
        removed.push(line.trim().slice(0, 80));
        continue;
      }
      unsafeBlockIndent = null;
    }
    if (unsafePatterns.some((pattern) => pattern.test(line))) {
      removed.push(line.trim().slice(0, 80));
      if (/^\s*[A-Za-z0-9_-]+\s*:\s*($|[>|])/.test(line) || /^\s*(?:-\s*)?(runtimeLogBody|rawMemoryGraph|browserScrapeBody)\s*:/i.test(line)) {
        unsafeBlockIndent = indent;
      }
      continue;
    }
    lines.push(line);
  }
  return {
    promptBlock: lines.join('\n').trim(),
    redactedLineCount: removed.length,
  };
};

const readJson = async (target) => JSON.parse(await readFile(target, 'utf8'));

const listSkillDirs = async (repoRoot) => {
  const skillsRoot = path.join(repoRoot, 'skills');
  const entries = await readdir(skillsRoot, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
};

export const loadSkillCatalog = async (options = {}) => {
  const repoRoot = options.repoRoot || repoRootDefault;
  const catalogPath = options.catalogPath || path.join(repoRoot, 'catalog', 'moonshot-catalog.json');
  const catalog = await readJson(catalogPath);
  const publicNames = new Set((catalog.publicEntrypoints || []).map((entry) => entry.name));
  const catalogByName = new Map((catalog.publicEntrypoints || []).map((entry) => [entry.name, entry]));
  const clusterBySkill = new Map();
  for (const cluster of catalog.internalSkillClusters || []) {
    for (const skill of cluster.skills || []) {
      clusterBySkill.set(skill, cluster);
    }
  }

  const skills = [];
  for (const name of await listSkillDirs(repoRoot)) {
    const sourcePath = path.join(repoRoot, 'skills', name, 'SKILL.md');
    let text = '';
    try {
      text = await readFile(sourcePath, 'utf8');
    } catch {
      continue;
    }
    const { frontmatter, body } = parseFrontmatter(text);
    const publicEntry = catalogByName.get(name);
    const internalCluster = clusterBySkill.get(name);
    const description = frontmatter.description || publicEntry?.purpose || '';
    skills.push({
      name,
      exposure: publicNames.has(name) ? 'public' : 'internal',
      stage: publicEntry?.stage || internalCluster?.stage || frontmatter.layer || 'unclassified',
      ownerCluster: publicEntry?.ownerCluster || internalCluster?.id || 'unclassified',
      description,
      triggers: Array.isArray(frontmatter.triggers) ? frontmatter.triggers : [],
      references: [
        `skills/${name}/SKILL.md`,
        ...[frontmatter.deepReferences].flat().filter(Boolean).map((ref) => `skills/${name}/${ref}`),
      ],
      headings: extractHeadings(body),
      tokenEstimate: tokenEstimate(text),
      contentHash: createHash('sha256').update(text).digest('hex').slice(0, 16),
      sourcePath,
      text,
    });
  }
  return { repoRoot, catalogPath, skills };
};

const publicView = (skill) => ({
  name: skill.name,
  exposure: skill.exposure,
  stage: skill.stage,
  ownerCluster: skill.ownerCluster,
  description: skill.description,
  triggers: skill.triggers,
  references: skill.references,
  headings: skill.headings,
  tokenEstimate: skill.tokenEstimate,
  contentHash: skill.contentHash,
});

export const searchSkills = async (query, options = {}) => {
  const { skills } = await loadSkillCatalog(options);
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const results = skills
    .filter((skill) => !options.stage || skill.stage === options.stage)
    .map((skill) => {
      const haystack = [
        skill.name,
        skill.exposure,
        skill.stage,
        skill.ownerCluster,
        skill.description,
        ...skill.triggers,
        ...skill.headings,
      ].join(' ').toLowerCase();
      const score = terms.reduce((sum, term) => sum + (haystack.includes(term) ? 1 : 0), 0);
      return { skill, score };
    })
    .filter((entry) => terms.length === 0 || entry.score > 0)
    .sort((left, right) => right.score - left.score || left.skill.name.localeCompare(right.skill.name))
    .slice(0, options.limit || 12)
    .map((entry) => ({ ...publicView(entry.skill), score: entry.score }));
  return {
    schemaVersion: 'moonshot-skill-router.v1',
    status: 'pass',
    command: 'search',
    query,
    results,
  };
};

export const inspectSkill = async (name, options = {}) => {
  const { skills } = await loadSkillCatalog(options);
  const skill = skills.find((entry) => entry.name === name);
  if (!skill) {
    return { schemaVersion: 'moonshot-skill-router.v1', status: 'fail', command: 'inspect', findings: [{ severity: 'blocking', code: 'skill.not_found', message: `Unknown skill: ${name}` }] };
  }
  return {
    schemaVersion: 'moonshot-skill-router.v1',
    status: 'pass',
    command: 'inspect',
    skill: publicView(skill),
  };
};

export const loadSkill = async (name, options = {}) => {
  const { skills } = await loadSkillCatalog(options);
  const skill = skills.find((entry) => entry.name === name);
  if (!skill) {
    return { schemaVersion: 'moonshot-skill-router.v1', status: 'fail', command: 'load', findings: [{ severity: 'blocking', code: 'skill.not_found', message: `Unknown skill: ${name}` }] };
  }
  const sanitized = sanitizePromptBlock(skill.text);
  return {
    schemaVersion: 'moonshot-skill-router.v1',
    status: 'pass',
    command: 'load',
    task: options.task || '',
    skill: publicView(skill),
    promptSafety: {
      status: sanitized.redactedLineCount === 0 ? 'pass' : 'redacted',
      redactedLineCount: sanitized.redactedLineCount,
    },
    promptBlock: sanitized.promptBlock,
  };
};

const parseArgs = (argv) => {
  const options = { json: false };
  const positional = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') {
      options.json = true;
    } else if (arg === '--repo-root') {
      options.repoRoot = path.resolve(argv[++index]);
    } else if (arg === '--catalog') {
      options.catalogPath = path.resolve(argv[++index]);
    } else if (arg === '--stage') {
      options.stage = argv[++index];
    } else if (arg === '--limit') {
      options.limit = Number(argv[++index]);
    } else if (arg === '--task') {
      options.task = argv[++index];
    } else if (arg === '--help' || arg === '-h') {
      console.log('Usage: node scripts/skill-router.mjs <search|inspect|load> <query-or-skill> [--json] [--stage <stage>] [--task <text>]');
      process.exit(0);
    } else {
      positional.push(arg);
    }
  }
  return { command: positional[0], value: positional.slice(1).join(' '), options };
};

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  const { command, value, options } = parseArgs(process.argv.slice(2));
  const run = command === 'search'
    ? searchSkills(value, options)
    : command === 'inspect'
      ? inspectSkill(value, options)
      : command === 'load'
        ? loadSkill(value, options)
        : Promise.resolve({ schemaVersion: 'moonshot-skill-router.v1', status: 'fail', command: command || '', findings: [{ severity: 'blocking', code: 'router.unknown_command', message: 'Expected search, inspect, or load.' }] });

  run.then((result) => {
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else if (result.status === 'pass') {
      console.log(`${result.command}: ${result.skill?.name || `${result.results.length} result(s)`}`);
    } else {
      console.error(result.findings.map((item) => item.message).join('\n'));
    }
    process.exit(result.status === 'pass' ? 0 : 2);
  }).catch((error) => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}
