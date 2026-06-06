#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

import { resolveRuntimeStatePath } from './lib/runtime-state-root.mjs';
import { resolveProjectIdentity } from './project-identity.mjs';

const ROOT = process.cwd();
const DEFAULT_OUTPUT = resolveRuntimeStatePath('cache', 'memorygraph', 'project-graph-seed.json');
const DEFAULT_PROMOTION_OUTPUT = resolveRuntimeStatePath('cache', 'memorygraph', 'promotion-candidates.json');

const TEXT_EXTENSIONS = new Set([
  '.cjs',
  '.css',
  '.html',
  '.js',
  '.json',
  '.jsx',
  '.md',
  '.mdx',
  '.mjs',
  '.ps1',
  '.py',
  '.sh',
  '.toml',
  '.ts',
  '.tsx',
  '.txt',
  '.yaml',
  '.yml',
]);

const EXCLUDED_SEGMENTS = new Set([
  '.git',
  '.hg',
  '.svn',
  '.claude-cache',
  '.moonshot-state',
  '.next',
  '.nuxt',
  '.output',
  '.turbo',
  '.venv',
  '__pycache__',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'out',
  'target',
]);

const EXCLUDED_PREFIXES = [
  '.claude/cache/',
  '.moonshot-relay/docs/ko/',
  '.claude/memorygraph/',
  '.claude/logs/',
  '.moonshot-state/',
  '.moonshot-relay/',
  '.tmp/',
  'tmp/',
];

const EXCLUDED_FILE_PATTERNS = [
  /^\.claude\/knowledge-repo-audit-.*\.json$/,
  /^\.claude\/settings\.local\.json$/,
  /^\.claude\/runtime-verdict-.*\.json$/,
  /^\.claude\/verification-verdict-.*\.json$/,
  /^\.claude\/verification-verdict-state\.json$/,
];

function parseArgs(argv) {
  const options = {
    analysisLevel: 'code',
    dryRun: false,
    maxFiles: 500,
    output: DEFAULT_OUTPUT,
    promotionOutput: DEFAULT_PROMOTION_OUTPUT,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }
    if (arg === '--max-files') {
      options.maxFiles = Number(argv[++i] || options.maxFiles);
      continue;
    }
    if (arg === '--analysis-level') {
      options.analysisLevel = String(argv[++i] || options.analysisLevel);
      if (!['file', 'code'].includes(options.analysisLevel)) {
        throw new Error('--analysis-level must be file or code');
      }
      continue;
    }
    if (arg === '--output') {
      options.output = path.resolve(argv[++i]);
      continue;
    }
    if (arg === '--promotion-output') {
      options.promotionOutput = path.resolve(argv[++i]);
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!Number.isFinite(options.maxFiles) || options.maxFiles < 1) {
    throw new Error('--max-files must be a positive number');
  }

  return options;
}

function printHelp() {
  process.stdout.write(`Usage: node memorygraph-project-index.mjs [options]

Build a project MemoryGraph seed under the resolved runtime state root without writing to MemoryGraph.

Options:
  --dry-run                 Print seed and promotion candidates to stdout only
  --analysis-level <level>  file or code, default code
  --max-files <n>           Maximum indexed files, default 500
  --output <path>           Seed output path
  --promotion-output <path> Promotion candidate output path
  -h, --help                Show this help
`);
}

function toPosix(filePath) {
  return filePath.replace(/\\/g, '/');
}

function rel(filePath) {
  return toPosix(path.relative(ROOT, filePath));
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function projectId() {
  try {
    return resolveProjectIdentity({ cwd: ROOT }).identity.projectId;
  } catch {
    const pkg = readJson(path.join(ROOT, 'package.json'));
    if (pkg?.name && typeof pkg.name === 'string') {
      return pkg.name;
    }
    return path.basename(ROOT);
  }
}

function isExcluded(relativePath) {
  const normalized = toPosix(relativePath);
  if (EXCLUDED_PREFIXES.some((prefix) => normalized === prefix.slice(0, -1) || normalized.startsWith(prefix))) {
    return true;
  }
  if (EXCLUDED_FILE_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return true;
  }
  return normalized.split('/').some((segment) => EXCLUDED_SEGMENTS.has(segment));
}

function walk(current, files, excludedPaths) {
  if (!fs.existsSync(current)) {
    return;
  }

  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    const absolute = path.join(current, entry.name);
    const relative = rel(absolute);
    if (isExcluded(relative)) {
      excludedPaths.add(relative);
      continue;
    }
    if (entry.isDirectory()) {
      walk(absolute, files, excludedPaths);
      continue;
    }
    if (entry.isFile() && TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      files.push(absolute);
    }
  }
}

function stableHash(input) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function node(stableKey, type, title, content, tags, context = {}, importance = 0.55) {
  return {
    stable_key: stableKey,
    type,
    title,
    content,
    tags: [...new Set([...tags, `key:${stableHash(stableKey)}`])].sort(),
    importance,
    context: { ...context, stable_key: stableKey },
  };
}

function relationship(fromStableKey, toStableKey, relationshipType, context = '') {
  return {
    from_stable_key: fromStableKey,
    to_stable_key: toStableKey,
    relationship_type: relationshipType,
    context,
  };
}

function firstExistingTarget(baseFile, rawTarget) {
  if (!rawTarget || rawTarget.startsWith('http://') || rawTarget.startsWith('https://') || rawTarget.startsWith('#')) {
    return null;
  }

  const withoutAnchor = rawTarget.split('#', 1)[0];
  const candidates = [];
  if (withoutAnchor.startsWith('.')) {
    candidates.push(path.resolve(path.dirname(baseFile), withoutAnchor));
  } else if (withoutAnchor.startsWith('/')) {
    candidates.push(path.resolve(ROOT, withoutAnchor.slice(1)));
  } else {
    return null;
  }

  const extensions = ['', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.json', '.md'];
  for (const candidate of candidates) {
    for (const extension of extensions) {
      const withExtension = `${candidate}${extension}`;
      if (fs.existsSync(withExtension) && fs.statSync(withExtension).isFile()) {
        return withExtension;
      }
      const indexFile = path.join(candidate, `index${extension}`);
      if (fs.existsSync(indexFile) && fs.statSync(indexFile).isFile()) {
        return indexFile;
      }
    }
  }
  return null;
}

function readText(filePath) {
  const stat = fs.statSync(filePath);
  if (stat.size > 250_000) {
    return '';
  }
  return fs.readFileSync(filePath, 'utf8');
}

function classifyFile(relativePath) {
  const lower = relativePath.toLowerCase();
  const tags = ['file'];
  let type = 'file_context';

  if (lower.includes('/test') || /\.(spec|test)\.[cm]?[jt]sx?$/.test(lower)) {
    tags.push('test', 'verification');
  }
  if (lower.includes('/components/') || lower.includes('/component/')) {
    tags.push('component');
  }
  if (lower.includes('/api/') || lower.includes('/routes/') || lower.includes('/route.')) {
    tags.push('api');
  }
  if (lower.includes('/docs/') || lower.endsWith('.md') || lower.endsWith('.mdx')) {
    tags.push('document');
  }
  if (lower.startsWith('.claude/skills/') || lower.startsWith('.claude/agents/')) {
    tags.push('workflow', 'harness');
    type = 'workflow';
  }
  if (lower.startsWith('.claude/scripts/') || lower.startsWith('.claude/config/') || lower.startsWith('.claude/schemas/')) {
    tags.push('harness');
  }
  if (lower.includes('verification') || lower.includes('verify')) {
    tags.push('verification');
  }

  return { type, tags };
}

function componentName(relativePath) {
  const match = relativePath.match(/(?:^|\/)(?:components?|ui)\/([^/.]+)(?:\/index)?\.[cm]?[jt]sx?$/i);
  if (!match) {
    return null;
  }
  return match[1];
}

function moduleName(relativePath) {
  const parts = relativePath.split('/');
  if (parts.length < 2) {
    return null;
  }
  if (parts[0] === '.claude') {
    return `.claude/${parts[1] || ''}`;
  }
  return parts[0];
}

function extractReferences(filePath, text) {
  const refs = [];
  const patterns = [
    /\[[^\]]+\]\(([^)]+)\)/g,
    /(?:from|import)\s+['"]([^'"]+)['"]/g,
    /require\(['"]([^'"]+)['"]\)/g,
    /(?:node|bash|source)\s+["']?((?:\.\.?\/)[A-Za-z0-9_./-]+)["']?/g,
  ];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const target = firstExistingTarget(filePath, match[1]);
      if (target && !isExcluded(rel(target))) {
        refs.push(target);
      }
    }
  }
  return [...new Set(refs)].sort((a, b) => rel(a).localeCompare(rel(b)));
}

function lineOf(text, index) {
  return text.slice(0, index).split(/\r?\n/).length;
}

function extractCodeSymbols(relativePath, text, contextBase, tagsBase) {
  const ext = path.extname(relativePath).toLowerCase();
  const symbols = [];
  if (!['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.py'].includes(ext)) {
    return symbols;
  }

  const patterns = [
    {
      kind: 'class',
      type: 'code_pattern',
      tags: ['code-symbol', 'class'],
      regex: /\b(?:export\s+)?class\s+([A-Za-z_$][\w$]*)/g,
    },
    {
      kind: 'function',
      type: 'code_pattern',
      tags: ['code-symbol', 'function'],
      regex: /\b(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g,
    },
    {
      kind: 'function',
      type: 'code_pattern',
      tags: ['code-symbol', 'function'],
      regex: /\b(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/g,
    },
    {
      kind: 'type',
      type: 'code_pattern',
      tags: ['code-symbol', 'type'],
      regex: /\bexport\s+(?:interface|type)\s+([A-Za-z_$][\w$]*)/g,
    },
    {
      kind: 'python-function',
      type: 'code_pattern',
      tags: ['code-symbol', 'function'],
      regex: /^\s*def\s+([A-Za-z_][\w]*)\s*\(/gm,
    },
    {
      kind: 'python-class',
      type: 'code_pattern',
      tags: ['code-symbol', 'class'],
      regex: /^\s*class\s+([A-Za-z_][\w]*)/gm,
    },
  ];

  const seen = new Set();
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern.regex)) {
      const name = match[1];
      const key = `${relativePath}:${name}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      const symbolTags = [...tagsBase, ...pattern.tags];
      if (/^[A-Z]/.test(name) && ['.jsx', '.tsx'].includes(ext)) {
        symbolTags.push('component', `component:${name}`);
      }
      symbols.push(node(
        `symbol:${relativePath}:${name}`,
        pattern.type,
        name,
        `${name} ${pattern.kind} is declared in ${relativePath}.`,
        symbolTags,
        { ...contextBase, source_path: relativePath, symbol_name: name, line: lineOf(text, match.index || 0) },
        0.52,
      ));
    }
  }

  const routeLike = /(?:^|\/)(?:api|routes?|app)\/|route\.[cm]?[jt]s$|page\.[cm]?[jt]sx$/i.test(relativePath);
  if (routeLike) {
    const routeKey = `api:${relativePath}`;
    symbols.push(node(
      routeKey,
      'general',
      `API or route surface: ${relativePath}`,
      `Route or API-facing file ${relativePath}.`,
      [...tagsBase, 'api', 'route'],
      { ...contextBase, source_path: relativePath },
      0.55,
    ));
  }

  return symbols;
}

function packageNodes(pkg, projectKey, tagsBase, contextBase) {
  const nodes = [];
  const relationships = [];
  const dependencies = {
    ...(pkg.dependencies || {}),
    ...(pkg.devDependencies || {}),
    ...(pkg.peerDependencies || {}),
  };

  for (const depName of Object.keys(dependencies).sort()) {
    const depKey = `technology:${depName}`;
    nodes.push(node(
      depKey,
      'technology',
      depName,
      `Project uses ${depName}.`,
      [...tagsBase, 'technology'],
      { ...contextBase, package_name: depName },
      0.45,
    ));
    relationships.push(relationship(projectKey, depKey, 'REQUIRES', `package dependency ${depName}`));
  }

  for (const scriptName of Object.keys(pkg.scripts || {}).sort()) {
    const scriptKey = `workflow:npm-script:${scriptName}`;
    nodes.push(node(
      scriptKey,
      'workflow',
      `npm script: ${scriptName}`,
      String(pkg.scripts[scriptName]),
      [...tagsBase, 'workflow', 'script'],
      { ...contextBase, script_name: scriptName, source_path: 'package.json' },
      0.55,
    ));
    relationships.push(relationship(projectKey, scriptKey, 'USED_IN', `npm script ${scriptName}`));
  }

  return { nodes, relationships };
}

function promotionCandidates(seed, project) {
  const candidates = [];
  const allowedTags = new Set(['workflow', 'harness', 'verification', 'convention']);

  for (const item of seed.nodes) {
    const sourcePath = item.context?.source_path || '';
    if (!sourcePath.startsWith('.claude/')) {
      continue;
    }
    if (sourcePath.startsWith('.moonshot-relay/docs/ko/') || sourcePath.startsWith('.claude/memorygraph/') || sourcePath.startsWith('.moonshot-relay/')) {
      continue;
    }
    if (!item.tags.some((tag) => allowedTags.has(tag))) {
      continue;
    }

    candidates.push({
      source_project_id: project.id,
      source_project_path: project.path,
      source_stable_key: item.stable_key,
      source_path: sourcePath,
      suggested_type: item.type === 'workflow' ? 'workflow' : 'general',
      title: item.title,
      content: item.content,
      tags: [
        'project:moonshot-relay',
        'source:moonshot',
        'promoted',
        `from-project:${project.id}`,
        'harness',
        ...item.tags.filter((tag) => ['workflow', 'verification', 'convention'].includes(tag)),
      ],
      context: {
        source_project_id: project.id,
        source_project_path: project.path,
        source_stable_key: item.stable_key,
        source_path: sourcePath,
        promotion_mode: 'candidate_requires_approval',
      },
      promotion_reason: 'Reusable harness workflow, verification, or convention candidate.',
    });
  }

  return {
    generatedAt: seed.generatedAt,
    promotionMode: 'candidate_requires_approval',
    targetProjectId: 'moonshot-relay',
    sourceProjectId: project.id,
    sourceProjectPath: project.path,
    candidateCount: candidates.length,
    candidates,
  };
}

function buildSeed(options) {
  const id = projectId();
  const project = { id, path: ROOT };
  const projectTag = `project:${id}`;
  const tagsBase = [projectTag, 'source:moonshot'];
  const contextBase = { project_path: ROOT, project_id: id };
  const projectKey = `project:${id}`;

  const files = [];
  const excludedPaths = new Set();
  walk(ROOT, files, excludedPaths);
  files.sort((a, b) => rel(a).localeCompare(rel(b)));

  const selectedFiles = files.slice(0, options.maxFiles);
  const nodes = new Map();
  const relationships = [];

  nodes.set(projectKey, node(
    projectKey,
    'project',
    id,
    `Project-local knowledge graph root for ${id}.`,
    [...tagsBase, 'project'],
    contextBase,
    0.75,
  ));

  const packageJson = readJson(path.join(ROOT, 'package.json'));
  if (packageJson) {
    const packagePayload = packageNodes(packageJson, projectKey, tagsBase, contextBase);
    for (const item of packagePayload.nodes) {
      nodes.set(item.stable_key, item);
    }
    relationships.push(...packagePayload.relationships);
  }

  for (const filePath of selectedFiles) {
    const relativePath = rel(filePath);
    const text = readText(filePath);
    const hash = stableHash(text || relativePath);
    const { type, tags } = classifyFile(relativePath);
    const fileKey = `file:${relativePath}`;
    const mod = moduleName(relativePath);

    nodes.set(fileKey, node(
      fileKey,
      type,
      relativePath,
      `Project file ${relativePath}.`,
      [...tagsBase, ...tags],
      { ...contextBase, source_path: relativePath, fingerprint: hash },
      0.4,
    ));
    relationships.push(relationship(fileKey, projectKey, 'OCCURS_IN', `file in ${id}`));

    if (mod) {
      const moduleKey = `module:${mod}`;
      if (!nodes.has(moduleKey)) {
        nodes.set(moduleKey, node(
          moduleKey,
          'general',
          mod,
          `Project module ${mod}.`,
          [...tagsBase, 'module', `module:${mod}`],
          { ...contextBase, module_name: mod },
          0.5,
        ));
        relationships.push(relationship(moduleKey, projectKey, 'OCCURS_IN', `module in ${id}`));
      }
      relationships.push(relationship(fileKey, moduleKey, 'OCCURS_IN', `file belongs to ${mod}`));
    }

    const comp = componentName(relativePath);
    if (comp) {
      const componentKey = `component:${comp}`;
      nodes.set(componentKey, node(
        componentKey,
        'code_pattern',
        comp,
        `Component ${comp} is defined in ${relativePath}.`,
        [...tagsBase, 'component', `component:${comp}`],
        { ...contextBase, component_name: comp, source_path: relativePath },
        0.55,
      ));
      relationships.push(relationship(componentKey, fileKey, 'OCCURS_IN', `component source ${relativePath}`));
    }

    if (options.analysisLevel === 'code') {
      for (const symbolNode of extractCodeSymbols(relativePath, text, contextBase, tagsBase)) {
        nodes.set(symbolNode.stable_key, symbolNode);
        relationships.push(relationship(symbolNode.stable_key, fileKey, 'OCCURS_IN', `symbol source ${relativePath}`));
      }
    }

    for (const target of extractReferences(filePath, text)) {
      relationships.push(relationship(fileKey, `file:${rel(target)}`, 'DEPENDS_ON', `reference from ${relativePath}`));
    }
  }

  const dedupedRelationships = [...new Map(
    relationships.map((item) => [
      `${item.from_stable_key}->${item.relationship_type}->${item.to_stable_key}`,
      item,
    ]),
  ).values()].filter((item) => nodes.has(item.from_stable_key) && nodes.has(item.to_stable_key));

  const seed = {
    generatedAt: new Date().toISOString(),
    schemaVersion: 'memorygraph-project-seed-v1',
    analysisLevel: options.analysisLevel,
    project,
    sourceExclusions: [...EXCLUDED_PREFIXES],
    excludedPaths: [...excludedPaths].sort(),
    indexedFileCount: selectedFiles.length,
    skippedFileCount: Math.max(0, files.length - selectedFiles.length),
    nodes: [...nodes.values()].sort((a, b) => a.stable_key.localeCompare(b.stable_key)),
    relationships: dedupedRelationships.sort((a, b) => (
      `${a.from_stable_key}:${a.relationship_type}:${a.to_stable_key}`
        .localeCompare(`${b.from_stable_key}:${b.relationship_type}:${b.to_stable_key}`)
    )),
  };

  seed.nodeCount = seed.nodes.length;
  seed.relationshipCount = seed.relationships.length;
  return { seed, candidates: promotionCandidates(seed, project) };
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

try {
  const options = parseArgs(process.argv.slice(2));
  const { seed, candidates } = buildSeed(options);

  if (options.dryRun) {
    process.stdout.write(`${JSON.stringify({ seed, promotionCandidates: candidates }, null, 2)}\n`);
  } else {
    writeJson(options.output, seed);
    writeJson(options.promotionOutput, candidates);
    process.stdout.write(`${options.output}\n${options.promotionOutput}\n`);
  }
} catch (error) {
  process.stderr.write(`[memorygraph-project-index] ${error.message}\n`);
  process.exit(1);
}
