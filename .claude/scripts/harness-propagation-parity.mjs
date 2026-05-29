#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildSurfaceInventory } from './harness-surface-inventory.mjs';

function valueAfter(argv, flag) {
  const index = argv.indexOf(flag);
  return index >= 0 && index + 1 < argv.length ? argv[index + 1] : '';
}

function readText(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

function resolvePath(rootDir, overlayRoot, relativePath) {
  const parts = relativePath.replaceAll('\\', '/').split('/');
  const overlayPath = overlayRoot ? path.join(overlayRoot, ...parts) : '';
  if (overlayPath && fs.existsSync(overlayPath)) return overlayPath;
  return path.join(rootDir, ...parts);
}

function extractRegistryExecutionMode(registryText, entrypoint) {
  const lines = registryText.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === `${entrypoint}:`);
  if (start < 0) return '';
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^\s{2}[A-Za-z0-9_-]+:\s*$/.test(line)) break;
    const match = line.match(/defaultExecutionMode:\s*([A-Za-z0-9_-]+)/);
    if (match) return match[1];
  }
  return '';
}

function extractYamlList(registryText, key) {
  const match = registryText.match(new RegExp(`${key}:\\s*\\[([^\\]]*)\\]`));
  if (!match) return [];
  return match[1].split(',').map((item) => item.trim()).filter(Boolean);
}

function extractForbiddenPrimaryOwnerUses(registryText) {
  const forbiddenOwners = new Set(extractYamlList(registryText, 'forbiddenPrimaryOwners'));
  const ownerKeys = new Set(['owner', 'primaryOwner', 'controlPlaneOwner', 'phaseAttemptOwner', 'diffAndEvidenceOwner']);
  const violations = [];
  for (const [index, line] of registryText.split(/\r?\n/).entries()) {
    const match = line.match(/^\s*([A-Za-z0-9_-]+):\s*([A-Za-z0-9_.-]+)\s*$/);
    if (!match) continue;
    const [, key, value] = match;
    if (ownerKeys.has(key) && forbiddenOwners.has(value)) {
      violations.push({
        code: 'forbidden_primary_owner',
        ownerField: key,
        owner: value,
        line: index + 1,
      });
    }
  }
  return violations;
}

function compareMirror(rootDir, overlayRoot, skillRecord) {
  const skill = skillRecord.owner;
  const sourcePath = resolvePath(rootDir, overlayRoot, `.claude/skills/${skill}/SKILL.md`);
  const mirrorPath = resolvePath(rootDir, overlayRoot, `.codex/skills/${skill}/SKILL.md`);
  const sourceText = readText(sourcePath);
  const mirrorText = readText(mirrorPath);
  if (!mirrorText) return { skill, status: 'missing' };
  if (sourceText !== mirrorText) return { skill, status: 'drift' };
  return { skill, status: 'synced' };
}

export function evaluatePropagationParity({ rootDir = process.cwd(), overlayRoot = '' } = {}) {
  const root = path.resolve(rootDir);
  const overlay = overlayRoot ? path.resolve(root, overlayRoot) : '';
  const inventory = buildSurfaceInventory({ rootDir: root, overlayRoot: overlay });
  const registryText = readText(resolvePath(root, overlay, '.claude/workflow.registry.yaml'));
  const violations = [];
  const exceptions = [
    {
      surface: '.claude/scripts/agent-loop*',
      reason: 'fallback/headless/cron adapter only',
    },
  ];

  for (const entrypoint of ['product-orchestrator', 'moonshot-phase-runner', 'moonshot-orchestrator']) {
    const mode = extractRegistryExecutionMode(registryText, entrypoint);
    if (entrypoint === 'moonshot-phase-runner' && mode !== 'forked-agent') {
      violations.push({ code: 'stale_phase_runner_primary_mode', entrypoint, mode });
    }
    if (entrypoint !== 'moonshot-phase-runner' && mode === 'delegated-terminal') {
      violations.push({ code: 'stale_delegated_terminal_primary', entrypoint, mode });
    }
  }

  for (const record of inventory.records.filter((item) => item.group === 'command_adapters')) {
    if (record.owner.includes('agent-loop') && record.role !== 'fallback_adapter') {
      violations.push({ code: 'agent_loop_primary_owner', path: record.path });
    }
  }

  const mirrorDrift = inventory.records
    .filter((record) => ['public_workflow_entrypoints', 'utility_entrypoints', 'internal_stage_owner_skills'].includes(record.group))
    .filter((record) => fs.existsSync(resolvePath(root, overlay, `.codex/skills/${record.owner}/SKILL.md`)))
    .map((record) => compareMirror(root, overlay, record))
    .filter((record) => record.status !== 'synced');
  for (const record of mirrorDrift) {
    violations.push({ code: 'staged_mirror_drift', ...record });
  }

  violations.push(...extractForbiddenPrimaryOwnerUses(registryText));

  const unclassified = inventory.records.filter((record) => record.contractStatus !== 'classified');
  for (const record of unclassified) {
    violations.push({ code: 'unclassified_surface', path: record.path, group: record.group });
  }

  return {
    ok: inventory.ok && violations.length === 0,
    verdict: inventory.ok && violations.length === 0 ? 'passed' : 'failed',
    inventoryGroups: inventory.groups,
    exceptions,
    violations,
  };
}

function main() {
  const argv = process.argv.slice(2);
  const rootDir = path.resolve(valueAfter(argv, '--root') || process.cwd());
  const rawOverlay = valueAfter(argv, '--overlay-root') || process.env.HARNESS_OVERLAY_ROOT || '';
  const result = evaluatePropagationParity({ rootDir, overlayRoot: rawOverlay });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) process.exitCode = 2;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
