#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PUBLIC_ENTRYPOINTS = new Set(['product-orchestrator', 'moonshot-phase-runner', 'moonshot-orchestrator']);
const PUBLIC_UTILITIES = new Set(['session-logger', 'commit-moonshot']);

function valueAfter(argv, flag) {
  const index = argv.indexOf(flag);
  return index >= 0 && index + 1 < argv.length ? argv[index + 1] : '';
}

function resolveRootDir(argv = process.argv.slice(2)) {
  return path.resolve(valueAfter(argv, '--root') || process.cwd());
}

function overlayRoot(rootDir, argv = process.argv.slice(2)) {
  const raw = valueAfter(argv, '--overlay-root') || process.env.HARNESS_OVERLAY_ROOT || '';
  return raw ? path.resolve(rootDir, raw) : '';
}

function exists(filePath) {
  return Boolean(filePath) && fs.existsSync(filePath);
}

function rel(rootDir, filePath) {
  return path.relative(rootDir, filePath).replaceAll(path.sep, '/');
}

function sourceFor(filePath, overlay) {
  if (!overlay) return 'live';
  const overlayPrefix = `${path.resolve(overlay)}${path.sep}`;
  return path.resolve(filePath).startsWith(overlayPrefix) ? 'overlay' : 'live';
}

function readText(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

function listFiles(start, matcher = () => true) {
  if (!exists(start)) return [];
  const files = [];
  const stack = [start];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const candidate = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(candidate);
      else if (entry.isFile() && matcher(candidate)) files.push(candidate);
    }
  }
  return files.sort();
}

function overlayFirstPath(rootDir, overlay, relativePath) {
  const normalized = relativePath.replaceAll('\\', '/');
  const parts = normalized.split('/');
  const overlayPath = overlay ? path.join(overlay, ...parts) : '';
  if (exists(overlayPath)) return { filePath: overlayPath, source: 'overlay' };
  return { filePath: path.join(rootDir, ...parts), source: 'live' };
}

function uniqueByPath(records) {
  const seen = new Set();
  return records.filter((record) => {
    const key = record.path;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function mergeOverlayFirstRecords(records) {
  const byCanonicalPath = new Map();
  for (const record of records) {
    const canonicalPath = record.path
      .replace(/^.*?\/execution\/staging\/phase-07\//, '')
      .replace(/^.*?(?=\.claude\/|\.codex\/)/, '');
    const existing = byCanonicalPath.get(canonicalPath);
    if (!existing || (existing.source !== 'overlay' && record.source === 'overlay')) {
      byCanonicalPath.set(canonicalPath, { ...record, path: canonicalPath });
    }
  }
  return [...byCanonicalPath.values()].sort((a, b) => a.path.localeCompare(b.path));
}

function skillRecords(rootDir, overlay) {
  const roots = [
    path.join(rootDir, '.claude', 'skills'),
    overlay ? path.join(overlay, '.claude', 'skills') : '',
  ].filter(exists);
  const names = new Set();
  for (const root of roots) {
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (entry.isDirectory()) names.add(entry.name);
    }
  }
  return [...names].sort().map((name) => {
    const resolved = overlayFirstPath(rootDir, overlay, `.claude/skills/${name}/SKILL.md`);
    const role = PUBLIC_ENTRYPOINTS.has(name)
      ? 'public_entrypoint'
      : PUBLIC_UTILITIES.has(name)
        ? 'public_utility'
        : 'internal_stage_owner';
    return {
      group: role === 'public_entrypoint' ? 'public_workflow_entrypoints' : role === 'public_utility' ? 'utility_entrypoints' : 'internal_stage_owner_skills',
      path: `.claude/skills/${name}/SKILL.md`,
      source: resolved.source,
      owner: name,
      role,
      contractStatus: exists(resolved.filePath) ? 'classified' : 'missing',
    };
  });
}

function codexMirrorRecords(rootDir, overlay) {
  const roots = [
    path.join(rootDir, '.codex', 'skills'),
    overlay ? path.join(overlay, '.codex', 'skills') : '',
  ].filter(exists);
  return mergeOverlayFirstRecords(roots.flatMap((mirrorRoot) => listFiles(mirrorRoot, (filePath) => path.basename(filePath) === 'SKILL.md').map((filePath) => {
    const skill = path.basename(path.dirname(filePath));
    return {
      group: 'codex_mirrors',
      path: rel(rootDir, filePath),
      source: sourceFor(filePath, overlay),
      owner: skill,
      role: 'mirror_of_claude_skill',
      contractStatus: 'classified',
    };
  })));
}

function agentRecords(rootDir, overlay) {
  const roots = [
    path.join(rootDir, '.claude', 'agents'),
    overlay ? path.join(overlay, '.claude', 'agents') : '',
  ].filter(exists);
  return mergeOverlayFirstRecords(roots.flatMap((agentRoot) => listFiles(agentRoot, (filePath) => filePath.endsWith('.md') && !filePath.includes(`${path.sep}templates${path.sep}`)).map((filePath) => {
    const text = readText(filePath).toLowerCase();
    const name = path.basename(filePath, '.md').toLowerCase();
    const role = name.includes('phase-attempt') || text.includes('phase attempt') || text.includes('phase-attempt')
      ? 'forked_phase_attempt'
      : text.includes('verification') ? 'verifier'
        : text.includes('memory') ? 'memory_helper'
          : text.includes('documentation') ? 'documentation_helper'
            : text.includes('phase') ? 'forked_phase_attempt'
              : 'agent_contract';
    return {
      group: 'agent_definitions',
      path: rel(rootDir, filePath),
      source: sourceFor(filePath, overlay),
      owner: path.basename(filePath, '.md'),
      role: 'agent_contract',
      agentRole: role,
      runtimeDependency: role === 'forked_phase_attempt' ? 'forked-agent' : 'current-session-compatible',
      contractStatus: 'classified',
    };
  })));
}

function scriptRecords(rootDir, overlay) {
  const roots = [
    path.join(rootDir, '.claude', 'scripts'),
    overlay ? path.join(overlay, '.claude', 'scripts') : '',
  ].filter(exists);
  const scripts = roots.flatMap((scriptRoot) => listFiles(scriptRoot, (filePath) => /\.(mjs|sh)$/.test(filePath)));
  const install = overlayFirstPath(rootDir, overlay, 'install-claude.sh');
  if (exists(install.filePath)) scripts.push(install.filePath);
  return mergeOverlayFirstRecords(scripts.map((filePath) => {
    const name = path.basename(filePath);
    const role = name.startsWith('agent-loop') || name.includes('dispatch')
      ? 'fallback_adapter'
      : 'deterministic_helper';
    return {
      group: 'command_adapters',
      path: rel(rootDir, filePath),
      source: sourceFor(filePath, overlay),
      owner: name,
      role,
      contractStatus: 'classified',
    };
  }));
}

function contractRecords(rootDir, overlay) {
  const candidates = [
    '.claude/workflow.registry.yaml',
    '.claude/verification.contract.yaml',
  ];
  const records = candidates.map((relativePath) => {
    const resolved = overlayFirstPath(rootDir, overlay, relativePath);
    return {
      group: 'workflow_docs_contracts',
      path: relativePath,
      source: resolved.source,
      owner: path.basename(relativePath),
      role: 'contract_source',
      contractStatus: exists(resolved.filePath) ? 'classified' : 'missing',
    };
  });
  const guidelineRoots = [
    path.join(rootDir, '.claude', 'docs', 'guidelines'),
    overlay ? path.join(overlay, '.claude', 'docs', 'guidelines') : '',
  ].filter(exists);
  for (const filePath of guidelineRoots.flatMap((guidelineRoot) => listFiles(guidelineRoot, (candidate) => candidate.endsWith('.md')))) {
    records.push({
      group: 'workflow_docs_contracts',
      path: rel(rootDir, filePath),
      source: sourceFor(filePath, overlay),
      owner: path.basename(filePath),
      role: 'contract_source',
      contractStatus: 'classified',
    });
  }
  return mergeOverlayFirstRecords(records);
}

export function buildSurfaceInventory({ rootDir = process.cwd(), overlayRoot = '' } = {}) {
  const root = path.resolve(rootDir);
  const overlay = overlayRoot ? path.resolve(root, overlayRoot) : '';
  const records = uniqueByPath([
    ...skillRecords(root, overlay),
    ...codexMirrorRecords(root, overlay),
    ...agentRecords(root, overlay),
    ...scriptRecords(root, overlay),
    ...contractRecords(root, overlay),
  ]);
  const requiredGroups = [
    'public_workflow_entrypoints',
    'utility_entrypoints',
    'internal_stage_owner_skills',
    'codex_mirrors',
    'agent_definitions',
    'command_adapters',
    'workflow_docs_contracts',
  ];
  const groups = Object.fromEntries(requiredGroups.map((group) => [
    group,
    records.filter((record) => record.group === group).length,
  ]));
  const violations = [
    ...requiredGroups.filter((group) => groups[group] === 0).map((group) => ({
      code: 'missing_surface_group',
      group,
    })),
    ...records.filter((record) => record.contractStatus !== 'classified').map((record) => ({
      code: 'unclassified_surface',
      path: record.path,
      group: record.group,
    })),
  ];
  return {
    ok: violations.length === 0,
    verdict: violations.length === 0 ? 'passed' : 'failed',
    rootDir: root,
    overlayRoot: overlay ? rel(root, overlay) : '',
    groups,
    records,
    violations,
  };
}

function main() {
  const argv = process.argv.slice(2);
  const inventory = buildSurfaceInventory({
    rootDir: resolveRootDir(argv),
    overlayRoot: overlayRoot(resolveRootDir(argv), argv),
  });
  process.stdout.write(`${JSON.stringify(inventory, null, 2)}\n`);
  if (!inventory.ok) process.exitCode = 2;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
