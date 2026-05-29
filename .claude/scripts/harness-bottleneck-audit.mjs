#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadWorkflowRegistry, resolveWorkflowRegistryPath } from './workflow-registry.mjs';

const DEFAULT_PUBLIC_SKILL_LINE_BUDGET = 180;
const DEFAULT_INTERNAL_SKILL_LINE_BUDGET = 120;

const PUBLIC_ENTRYPOINTS = new Set([
  'product-orchestrator',
  'moonshot-phase-runner',
  'moonshot-orchestrator',
]);

const PUBLIC_UTILITIES = new Set([
  'session-logger',
  'commit-moonshot',
]);

const BOTTLENECK_PATTERNS = [
  {
    category: 'runtime_continuation',
    label: 'runtime continuation and stop-boundary drift',
    regex: /(멈|중단|timeout|watchdog|restart-limit|delegated-terminal|in-session|interactive|continue|return-boundary)/i,
  },
  {
    category: 'verification_evidence',
    label: 'verification fixture and evidence gaps',
    regex: /(workflowEvidence|scorecard|verdict|evidence|fixture|검증|parity|smoke|RED|GREEN|pass_with_warning)/i,
  },
  {
    category: 'state_authority',
    label: 'state authority and stale projection drift',
    regex: /(phase-status|current-run|latest-dispatch|stale|active phase|close\/|archive|archivedPhaseDoc|SQLite|runtime-state)/i,
  },
  {
    category: 'skill_surface',
    label: 'skill surface growth and discovery friction',
    regex: /(skill|SKILL\.md|스킬|\.codex\/skills|\.agents\/skills|symlink|mirror|discovery|중복|public skill)/i,
  },
  {
    category: 'windows_host',
    label: 'Windows host and shell friction',
    regex: /(Windows|PowerShell|rg\.exe|Select-String|index\.lock|safe\.directory|permission|권한|access denied|CP949|PYTHONUTF8)/i,
  },
  {
    category: 'memory_transport',
    label: 'MemoryGraph and MCP transport fragility',
    regex: /(MemoryGraph|Memory MCP|Transport closed|memorygraph|MCP|stdin|stdout|wrapper|session restart)/i,
  },
  {
    category: 'closeout_hygiene',
    label: 'closeout, commit, and artifact hygiene',
    regex: /(commit|closeout|staging|unstaged|dirty tree|artifact|cache|logs|generated|memory artifacts|git add)/i,
  },
];

function lineCount(text) {
  if (!text) {
    return 0;
  }
  return String(text).split(/\r?\n/).length;
}

function readText(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

function resolveRootDir(argv = process.argv.slice(2)) {
  const rootArg = valueAfter(argv, '--root');
  if (rootArg) {
    return path.resolve(rootArg);
  }
  const cwd = process.cwd();
  if (fs.existsSync(path.join(cwd, '.claude'))) {
    return cwd;
  }
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
}

function defaultMemoryFile() {
  const profile = process.env.USERPROFILE || os.homedir();
  return path.join(profile, '.codex', 'memories', 'MEMORY.md');
}

function valueAfter(argv, flag) {
  const index = argv.indexOf(flag);
  if (index === -1 || index + 1 >= argv.length) {
    return null;
  }
  return argv[index + 1];
}

function normalizeOverlayRoot(rootDir, overlayRoot = '') {
  if (!overlayRoot) {
    return '';
  }
  return path.resolve(rootDir, overlayRoot);
}

function resolveOverlayFile(rootDir, overlayRoot, relativePath) {
  const normalized = relativePath.replaceAll('\\', '/');
  const overlay = normalizeOverlayRoot(rootDir, overlayRoot);
  const overlayPath = overlay ? path.join(overlay, ...normalized.split('/')) : '';
  if (overlayPath && fs.existsSync(overlayPath)) {
    return overlayPath;
  }
  return path.join(rootDir, ...normalized.split('/'));
}

function listSkillNames(rootDir, overlayRoot = '') {
  const roots = [
    path.join(rootDir, '.claude', 'skills'),
    normalizeOverlayRoot(rootDir, overlayRoot) ? path.join(normalizeOverlayRoot(rootDir, overlayRoot), '.claude', 'skills') : '',
  ].filter(Boolean);
  const names = new Set();

  for (const skillsRoot of roots) {
    if (!fs.existsSync(skillsRoot)) {
      continue;
    }
    for (const entry of fs.readdirSync(skillsRoot, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        names.add(entry.name);
      }
    }
  }

  return [...names].sort((a, b) => a.localeCompare(b));
}

function loadBudgetConfig(rootDir, overlayRoot = '') {
  try {
    const loaded = loadWorkflowRegistry({ rootDir, overlayRoot });
    return {
      budgetSource: 'registry',
      registryPath: path.relative(rootDir, loaded.registryPath).replaceAll(path.sep, '/'),
      validation: loaded.validation,
      registry: loaded.registry,
      budgets: {
        public_entrypoint: Number(loaded.registry.skillBudgets.public_entrypoint),
        public_utility: Number(loaded.registry.skillBudgets.public_utility),
        internal_or_optional: Number(loaded.registry.skillBudgets.internal_or_optional),
      },
    };
  } catch (error) {
    if (overlayRoot) {
      throw error;
    }
    const registryPath = resolveWorkflowRegistryPath({ rootDir });
    if (fs.existsSync(registryPath)) {
      throw error;
    }
    return {
      budgetSource: 'hardcoded-default',
      registryPath: '',
      validation: { ok: true, violations: [] },
      registry: {},
      budgets: {
        public_entrypoint: DEFAULT_PUBLIC_SKILL_LINE_BUDGET,
        public_utility: DEFAULT_INTERNAL_SKILL_LINE_BUDGET,
        internal_or_optional: DEFAULT_INTERNAL_SKILL_LINE_BUDGET,
      },
    };
  }
}

function surfaceForSkill(skill, registry = {}) {
  if (registry.entrypoints?.[skill]?.surface) {
    return registry.entrypoints[skill].surface;
  }
  if (registry.utilities?.[skill]?.surface) {
    return registry.utilities[skill].surface;
  }
  if (PUBLIC_ENTRYPOINTS.has(skill)) {
    return 'public_entrypoint';
  }
  if (PUBLIC_UTILITIES.has(skill)) {
    return 'public_utility';
  }
  return 'internal_or_optional';
}

function walkSkillFiles(rootDir, overlayRoot = '', budgetConfig = loadBudgetConfig(rootDir, overlayRoot)) {
  return listSkillNames(rootDir, overlayRoot)
    .map((skill) => {
      const relativePath = `.claude/skills/${skill}/SKILL.md`;
      const filePath = resolveOverlayFile(rootDir, overlayRoot, relativePath);
      const text = readText(filePath);
      const surface = surfaceForSkill(skill, budgetConfig.registry);
      const budget = budgetConfig.budgets[surface] || budgetConfig.budgets.internal_or_optional;
      return {
        skill,
        surface,
        path: relativePath,
        lines: lineCount(text),
        overBudget: lineCount(text) > budget,
        budget,
        budgetSource: budgetConfig.budgetSource,
      };
    })
    .filter((record) => record.lines > 0)
    .sort((a, b) => b.lines - a.lines || a.skill.localeCompare(b.skill));
}

function compareCodexSkillMirror(rootDir, skills, overlayRoot = '') {
  const overlay = normalizeOverlayRoot(rootDir, overlayRoot);
  const mirrorRoot = overlay && fs.existsSync(path.join(overlay, '.codex', 'skills'))
    ? path.join(overlay, '.codex', 'skills')
    : path.join(rootDir, '.codex', 'skills');
  if (!fs.existsSync(mirrorRoot)) {
    return {
      present: false,
      source: 'missing',
      driftCount: 0,
      missingCount: 0,
      records: [],
    };
  }

  const mirrorSkills = mirrorRoot.startsWith(overlay)
    ? skills.filter((skill) => fs.existsSync(path.join(overlay, ...skill.path.replaceAll('\\', '/').split('/'))))
    : skills;

  const records = [];
  for (const skill of mirrorSkills) {
    const sourcePath = resolveOverlayFile(rootDir, overlayRoot, skill.path);
    const mirrorPath = path.join(mirrorRoot, skill.skill, 'SKILL.md');
    const sourceText = readText(sourcePath);
    const mirrorText = readText(mirrorPath);
    const status = !mirrorText ? 'missing' : sourceText === mirrorText ? 'synced' : 'drift';
    records.push({
      skill: skill.skill,
      status,
      artifact: 'SKILL.md',
      source: skill.path,
      mirror: path.relative(rootDir, mirrorPath).replaceAll(path.sep, '/'),
    });

    for (const reference of deepReferences(sourceText)) {
      const sourceReferencePath = path.join(path.dirname(sourcePath), reference);
      const mirrorReferencePath = path.join(path.dirname(mirrorPath), reference);
      const sourceReferenceText = readText(sourceReferencePath);
      const mirrorReferenceText = readText(mirrorReferencePath);
      const referenceStatus = !sourceReferenceText
        ? 'source-reference-missing'
        : !mirrorReferenceText
          ? 'missing'
          : sourceReferenceText === mirrorReferenceText ? 'synced' : 'drift';
      records.push({
        skill: skill.skill,
        status: referenceStatus,
        artifact: reference,
        source: path.relative(rootDir, sourceReferencePath).replaceAll(path.sep, '/'),
        mirror: path.relative(rootDir, mirrorReferencePath).replaceAll(path.sep, '/'),
      });
    }
  }

  return {
    present: true,
    source: mirrorRoot.startsWith(overlay) ? 'overlay' : 'live',
    driftCount: records.filter((record) => record.status === 'drift').length,
    missingCount: records.filter((record) => record.status === 'missing' || record.status === 'source-reference-missing').length,
    records: records.filter((record) => record.status !== 'synced'),
  };
}

function deepReferences(skillText) {
  const references = [];
  const lines = String(skillText || '').split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^\s*-\s+(references\/[^\s#]+)/);
    if (match) {
      references.push(match[1].trim());
    }
  }
  return [...new Set(references)];
}

function parseMemoryEvidence(memoryText, rootDir) {
  if (!memoryText) {
    return [];
  }

  const normalizedRoot = rootDir.replaceAll('/', '\\').toLowerCase();
  const lines = memoryText.split(/\r?\n/);
  const evidence = [];
  let inRelevantBlock = false;
  let currentGroup = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.startsWith('# Task Group:')) {
      currentGroup = line.replace(/^# Task Group:\s*/, '').trim();
      inRelevantBlock = false;
      continue;
    }
    if (line.startsWith('applies_to:')) {
      inRelevantBlock = line.toLowerCase().includes(normalizedRoot);
      continue;
    }
    if (!inRelevantBlock) {
      continue;
    }
    const matched = BOTTLENECK_PATTERNS.filter((pattern) => pattern.regex.test(line));
    if (matched.length === 0) {
      continue;
    }
    const trimmed = line.trim();
    if (!trimmed.startsWith('-')) {
      continue;
    }
    evidence.push({
      line: index + 1,
      group: currentGroup,
      text: trimmed.replace(/^-\s*/, ''),
      categories: [...new Set(matched.map((pattern) => pattern.category))],
    });
  }

  return evidence;
}

function summarizeCategories(evidence) {
  const counts = new Map(BOTTLENECK_PATTERNS.map((pattern) => [pattern.category, {
    category: pattern.category,
    label: pattern.label,
    count: 0,
    sampleLines: [],
  }]));

  for (const item of evidence) {
    for (const category of item.categories) {
      const summary = counts.get(category);
      if (!summary) {
        continue;
      }
      summary.count += 1;
      if (summary.sampleLines.length < 3) {
        summary.sampleLines.push(item.line);
      }
    }
  }

  return [...counts.values()].filter((summary) => summary.count > 0)
    .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));
}

function buildFindings({ skills, mirror, memoryCategories }) {
  const findings = [];
  const oversizedPublic = skills.filter((skill) => skill.surface === 'public_entrypoint' && skill.overBudget);
  if (oversizedPublic.length > 0) {
    findings.push({
      id: 'skill-entrypoint-bloat',
      severity: 'high',
      title: 'Public entrypoint skills are too large for fast routing',
      evidence: oversizedPublic.map((skill) => `${skill.skill}: ${skill.lines} lines`),
      improvement: 'Keep SKILL.md as routing plus execution contract; move deep policy, examples, and incident taxonomy to referenced guides.',
    });
  }

  const heavyInternal = skills.filter((skill) => skill.surface !== 'public_entrypoint' && skill.overBudget).slice(0, 8);
  if (heavyInternal.length > 0) {
    findings.push({
      id: 'internal-stage-owner-bloat',
      severity: 'medium',
      title: 'Internal stage-owner skills carry too much local policy',
      evidence: heavyInternal.map((skill) => `${skill.skill}: ${skill.lines} lines`),
      improvement: 'Convert repeated policy into bundle-level guides and keep stage owners to trigger, inputs, hard gate, and output artifact.',
    });
  }

  if (mirror.present && (mirror.driftCount > 0 || mirror.missingCount > 0)) {
    findings.push({
      id: 'codex-skill-mirror-drift',
      severity: 'high',
      title: '.codex skill mirror can diverge from .claude source',
      evidence: [`drift=${mirror.driftCount}`, `missing=${mirror.missingCount}`],
      improvement: 'After changing .claude/skills, sync the concrete .codex/skills copy or run the project installer before closeout.',
    });
  }

  for (const category of memoryCategories.slice(0, 6)) {
    findings.push({
      id: `local-history-${category.category}`,
      severity: category.count >= 5 ? 'high' : 'medium',
      title: category.label,
      evidence: [`${category.count} local Codex memory hits`, `sample memory lines: ${category.sampleLines.join(', ')}`],
      improvement: improvementForCategory(category.category),
    });
  }

  return findings;
}

function improvementForCategory(category) {
  switch (category) {
    case 'runtime_continuation':
      return 'Make delegated-terminal the default autonomous path and keep return-boundary checks separate from milestone reporting.';
    case 'verification_evidence':
      return 'Seed required verifier fixtures before smoke checks and keep adapter smoke separate from closeout scorecard gates.';
    case 'state_authority':
      return 'Read completion and active phase state from phase-status.yaml and compact runtime state, not from root file counts or stale projections.';
    case 'skill_surface':
      return 'Treat skill changes as source plus mirror plus validation; do not expand public surface unless the trigger and output contract are distinct.';
    case 'windows_host':
      return 'Classify host-shell failures separately and use native PowerShell or explicit node/python paths as documented fallbacks.';
    case 'memory_transport':
      return 'Keep MemoryGraph transport health non-blocking for Git closeout unless the task explicitly requires memory persistence.';
    case 'closeout_hygiene':
      return 'Separate generated runtime artifacts from source fixtures and make closeout scope explicit before staging.';
    default:
      return 'Record the incident as a targeted regression before changing harness policy.';
  }
}

export function analyzeHarnessBottlenecks(options = {}) {
  const rootDir = path.resolve(options.rootDir ?? resolveRootDir([]));
  const overlayRoot = options.overlayRoot || '';
  const memoryFile = options.memoryFile ?? defaultMemoryFile();
  const budgetConfig = loadBudgetConfig(rootDir, overlayRoot);
  const skills = walkSkillFiles(rootDir, overlayRoot, budgetConfig);
  const mirror = compareCodexSkillMirror(rootDir, skills, overlayRoot);
  const memoryText = readText(memoryFile);
  const memoryEvidence = parseMemoryEvidence(memoryText, rootDir);
  const memoryCategories = summarizeCategories(memoryEvidence);

  return {
    generatedAt: new Date().toISOString(),
    rootDir,
    overlayRoot: overlayRoot ? path.relative(rootDir, normalizeOverlayRoot(rootDir, overlayRoot)).replaceAll(path.sep, '/') : '',
    memoryFile,
    registry: {
      budgetSource: budgetConfig.budgetSource,
      registryPath: budgetConfig.registryPath,
      validation: budgetConfig.validation,
    },
    memoryEvidenceCount: memoryEvidence.length,
    skillSummary: {
      count: skills.length,
      overBudgetCount: skills.filter((skill) => skill.overBudget).length,
      largest: skills.slice(0, 10),
    },
    mirror,
    memoryCategories,
    findings: buildFindings({ skills, mirror, memoryCategories }),
  };
}

export function renderTextReport(report) {
  const lines = [
    'Harness Bottleneck Audit',
    `root: ${report.rootDir}`,
    `overlay: ${report.overlayRoot || '(none)'}`,
    `budget source: ${report.registry.budgetSource}${report.registry.registryPath ? ` (${report.registry.registryPath})` : ''}`,
    `memory: ${report.memoryFile}`,
    `skills: ${report.skillSummary.count} total, ${report.skillSummary.overBudgetCount} over budget`,
    `memory evidence: ${report.memoryEvidenceCount} local Codex hits`,
    '',
    'Top findings:',
  ];

  for (const finding of report.findings) {
    lines.push(`- [${finding.severity}] ${finding.id}: ${finding.title}`);
    for (const item of finding.evidence) {
      lines.push(`  evidence: ${item}`);
    }
    lines.push(`  improve: ${finding.improvement}`);
  }

  lines.push('', 'Largest skills:');
  for (const skill of report.skillSummary.largest) {
    lines.push(`- ${skill.skill}: ${skill.lines} lines (${skill.surface}, budget ${skill.budget})`);
  }

  if (report.mirror.present) {
    lines.push('', `Codex mirror drift: drift=${report.mirror.driftCount}, missing=${report.mirror.missingCount}`);
    for (const record of report.mirror.records.slice(0, 10)) {
      lines.push(`- ${record.skill}: ${record.status}`);
    }
  }

  return `${lines.join('\n')}\n`;
}

function main() {
  const argv = process.argv.slice(2);
  const report = analyzeHarnessBottlenecks({
    rootDir: resolveRootDir(argv),
    overlayRoot: valueAfter(argv, '--overlay-root') || process.env.HARNESS_OVERLAY_ROOT || '',
    memoryFile: valueAfter(argv, '--memory-file') ?? defaultMemoryFile(),
  });
  const asJson = argv.includes('--json');
  process.stdout.write(asJson ? `${JSON.stringify(report, null, 2)}\n` : renderTextReport(report));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
