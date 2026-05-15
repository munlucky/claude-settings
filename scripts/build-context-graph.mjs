#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const CLAUDE_ROOT = path.join(ROOT, '.claude');
const INCLUDE_DIRS = [
  path.join(CLAUDE_ROOT, 'scripts'),
  path.join(CLAUDE_ROOT, 'skills'),
  path.join(CLAUDE_ROOT, 'rules'),
  path.join(CLAUDE_ROOT, 'docs'),
  path.join(CLAUDE_ROOT, 'templates'),
];
const EXTENSIONS = new Set(['.md', '.mjs', '.js', '.sh', '.yaml', '.yml', '.json']);

function walk(current, files = []) {
  if (!fs.existsSync(current)) {
    return files;
  }
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.tmp') {
      continue;
    }
    const next = path.join(current, entry.name);
    if (entry.isDirectory()) {
      walk(next, files);
      continue;
    }
    if (EXTENSIONS.has(path.extname(entry.name))) {
      files.push(next);
    }
  }
  return files;
}

function rel(filePath) {
  return path.relative(ROOT, filePath).replace(/\\/g, '/');
}

function resolveReference(baseFile, rawTarget) {
  const target = String(rawTarget || '').trim();
  if (!target || target.startsWith('http://') || target.startsWith('https://') || target.startsWith('#')) {
    return '';
  }
  if (target.startsWith('/')) {
    return '';
  }
  if (target.startsWith('.claude/')) {
    const absolute = path.join(ROOT, target);
    return fs.existsSync(absolute) ? rel(absolute) : '';
  }
  if (target.startsWith('./') || target.startsWith('../')) {
    const absolute = path.resolve(path.dirname(baseFile), target);
    return fs.existsSync(absolute) ? rel(absolute) : '';
  }
  return '';
}

function extractReferences(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const refs = new Set();

  for (const match of text.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    const target = resolveReference(filePath, match[1]?.split('#', 1)[0]);
    if (target) refs.add(target);
  }

  for (const match of text.matchAll(/(?:from|import)\s+['"]([^'"]+)['"]/g)) {
    const target = resolveReference(filePath, match[1]);
    if (target) refs.add(target);
  }

  for (const match of text.matchAll(/(?:source|exec|node|bash)\s+["']?((?:\.\.?\/|\.claude\/)[A-Za-z0-9_./-]+)["']?/g)) {
    const target = resolveReference(filePath, match[1]);
    if (target) refs.add(target);
  }

  for (const match of text.matchAll(/(?:(?:\.\.\/|\.\/)?\.claude\/[A-Za-z0-9_./-]+\.(?:md|mjs|js|sh|yaml|yml|json))/g)) {
    const target = resolveReference(filePath, match[0]);
    if (target) refs.add(target);
  }

  return [...refs].sort((a, b) => a.localeCompare(b));
}

function reachableCount(graph, startNode) {
  if (!graph.has(startNode)) {
    return 0;
  }
  const seen = new Set([startNode]);
  const queue = [startNode];
  while (queue.length > 0) {
    const node = queue.shift();
    for (const next of graph.get(node) || []) {
      if (seen.has(next)) {
        continue;
      }
      seen.add(next);
      queue.push(next);
    }
  }
  return seen.size;
}

const files = INCLUDE_DIRS.flatMap((dir) => walk(dir));
const graph = new Map();
const nodes = files.map((filePath) => rel(filePath)).sort((a, b) => a.localeCompare(b));

for (const filePath of files) {
  graph.set(rel(filePath), extractReferences(filePath));
}

const edges = [];
for (const [from, targets] of graph.entries()) {
  for (const to of targets) {
    edges.push({ from, to });
  }
}

const payload = {
  generatedAt: new Date().toISOString(),
  root: ROOT,
  nodeCount: nodes.length,
  edgeCount: edges.length,
  reachableSamples: {
    sessionLogger: reachableCount(graph, '.claude/skills/session-logger/SKILL.md'),
    commitMoonshot: reachableCount(graph, '.claude/skills/commit-moonshot/SKILL.md'),
    phaseRuntimeParity: reachableCount(graph, '.claude/scripts/verify-phase-runtime-parity.sh'),
  },
  nodes,
  edges,
};

const outputPath = process.argv[2] ? path.resolve(process.argv[2]) : path.join(CLAUDE_ROOT, 'cache', 'context-graph.json');
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
process.stdout.write(`${outputPath}\n`);
