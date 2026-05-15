#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const REPORT_DIR = path.join(ROOT, '.claude', 'docs', 'reports');

function run(command, args, env = {}) {
  return spawnSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

function lineCount(text) {
  const trimmed = String(text || '').trimEnd();
  return trimmed ? trimmed.split(/\r?\n/).length : 0;
}

function measureDoc(filePath) {
  const absolute = path.join(ROOT, filePath);
  const text = fs.readFileSync(absolute, 'utf8');
  return {
    path: filePath,
    lines: text.split(/\r?\n/).length,
    bytes: Buffer.byteLength(text, 'utf8'),
  };
}

function extractAuditMetrics(stdout) {
  const lines = String(stdout || '').split(/\r?\n/);
  const metrics = {};
  for (const line of lines) {
    let match = line.match(/^Always-loaded lines \(rules\/total\):\s*([0-9]+)\/([0-9]+)/);
    if (match) {
      metrics.alwaysLoadedRuleLines = Number.parseInt(match[1], 10);
      metrics.alwaysLoadedTotalLines = Number.parseInt(match[2], 10);
      continue;
    }
    match = line.match(/^Always-loaded estimated tokens:\s*([0-9]+)/);
    if (match) {
      metrics.alwaysLoadedEstimatedTokens = Number.parseInt(match[1], 10);
      continue;
    }
    match = line.match(/^Errors:\s*([0-9]+)\s*\/\s*Warnings:\s*([0-9]+)/);
    if (match) {
      metrics.errors = Number.parseInt(match[1], 10);
      metrics.warnings = Number.parseInt(match[2], 10);
    }
  }
  return metrics;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function main() {
  const outputPath = process.argv[2] ? path.resolve(process.argv[2]) : path.join(REPORT_DIR, 'token-optimization-latest.json');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  const auditDefault = run('bash', ['.claude/scripts/knowledge-repo-audit.sh']);
  const auditCompact = run('node', ['.claude/scripts/knowledge-repo-audit.mjs', '--compact']);
  const boundary = run('bash', ['.claude/scripts/verify-phase-runner-boundary.sh']);
  const parityCompact = run('node', ['.claude/scripts/verify-phase-runtime-parity.mjs', '--compact', '.claude/docs/runtime-parity-reference-plan', '--render-only']);
  const graphRun = run('node', ['.claude/scripts/build-context-graph.mjs']);
  const graphPath = String(graphRun.stdout || '').trim().split(/\r?\n/).filter(Boolean).at(-1) || path.join(ROOT, '.claude', 'cache', 'context-graph.json');
  const graph = readJson(graphPath);

  const docs = [
    '.claude/CLAUDE.md',
    '.claude/docs/guidelines/document-memory-policy.md',
    '.claude/docs/guidelines/token-optimization.md',
    '.claude/skills/session-logger/SKILL.md',
    '.claude/skills/commit-moonshot/SKILL.md',
  ].map(measureDoc);

  const payload = {
    generatedAt: new Date().toISOString(),
    docs,
    commandOutputs: {
      knowledgeAuditDefaultLines: lineCount(auditDefault.stdout),
      knowledgeAuditCompactLines: lineCount(auditCompact.stdout),
      verifyPhaseRunnerBoundaryLines: lineCount(boundary.stdout),
      parityRenderCompactLines: lineCount(parityCompact.stdout),
    },
    audit: extractAuditMetrics(auditDefault.stdout),
    contextGraph: {
      nodeCount: graph.nodeCount,
      edgeCount: graph.edgeCount,
      reachableSamples: graph.reachableSamples,
    },
  };

  fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  process.stdout.write(`${outputPath}\n`);
}

main();
