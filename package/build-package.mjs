#!/usr/bin/env node
import assert from 'node:assert/strict';
import { constants as fsConstants } from 'node:fs';
import {
  access,
  chmod,
  copyFile,
  cp,
  mkdir,
  readdir,
  rm,
  stat,
} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const packageRoot = path.dirname(scriptPath);
const repoRoot = path.dirname(packageRoot);

const generatedRoot = packageRoot;

const runtimeSpecs = {
  claude: {
    templateRoot: path.join(packageRoot, 'profile-templates', 'claude', '.claude'),
    outputRoot: path.join('claude', 'profile', '.claude'),
    sharedDirs: [
      'skills',
      'agents',
      'rules',
      'bin',
      'tools',
      'schemas',
      'templates',
      path.join('docs', 'public'),
    ],
    sharedFiles: [
      'scripts/awtl-memory-promotion.mjs',
      'scripts/code-review-graph-mcp-wrapper.js',
      'scripts/codex-mcp-singleton.mjs',
      'scripts/commit-moonshot-memory-refresh.mjs',
      'scripts/commit-moonshot-promotion-audit.mjs',
      'scripts/install-account-root-harness.mjs',
      'scripts/install-browser-runtime.mjs',
      'scripts/install-browser-runtime.sh',
      'scripts/knowledge-context-build.mjs',
      'scripts/knowledge-improvement-lifecycle.mjs',
      'scripts/knowledge-records.mjs',
      'scripts/lib/awtl-event-schema.mjs',
      'scripts/lib/awtl-failure-attribution.mjs',
      'scripts/lib/awtl-harness-capture.mjs',
      'scripts/lib/awtl-memory-candidate.mjs',
      'scripts/lib/awtl-memory-promotion.mjs',
      'scripts/lib/awtl-redaction.mjs',
      'scripts/lib/awtl-replay-probes.mjs',
      'scripts/lib/awtl-replay-scorecard.mjs',
      'scripts/lib/awtl-trace-sink.mjs',
      'scripts/lib/failure-classifier.mjs',
      'scripts/lib/runtime-state-root.mjs',
      'scripts/lib/runtime-unavailable-cache.mjs',
      'scripts/memory-mcp-wrapper.js',
      'scripts/memorygraph-direct.mjs',
      'scripts/memorygraph-mcp-wrapper.js',
      'scripts/memorygraph-mcp-wrapper.mjs',
      'scripts/memorygraph-project-index.mjs',
      'scripts/ontology-constraint-validate.mjs',
      'scripts/project-identity.mjs',
      'scripts/verification-verdict-state.mjs',
    ],
    verificationTarget: 'verification.contract.yaml',
  },
  codex: {
    templateRoot: path.join(packageRoot, 'profile-templates', 'codex', '.codex'),
    outputRoot: path.join('codex', 'profile', '.codex'),
    sharedDirs: [
      'skills',
      'agents',
      'schemas',
      path.join('docs', 'public'),
    ],
    sharedFiles: [],
    verificationTarget: 'verification.contract.yaml',
  },
};

const denySegments = new Set([
  '.git',
  '.moonshot-relay',
  '.moonshot-state',
  '.code-review-graph',
  'node_modules',
  'fixtures',
  'browser-artifacts',
  'browser-runtime',
  'cache',
  'logs',
  'memorygraph',
  'tmp',
  'traces',
]);

const denyBasenames = [
  /^runtime-state\.sqlite/,
  /^memory\.json$/,
  /^verification-verdict-/,
  /^runtime-verdict-/,
  /^browser-flow-verdict-/,
  /^knowledge-repo-audit-/,
  /\.test\.[cm]?js$/,
  /\.e2e\.test\.[cm]?js$/,
  /_test\.py$/,
  /\.test\.py$/,
];

const usage = () => `Usage: node package/build-package.mjs [--runtime all|claude|codex] [--out <dir>] [--clean] [--dry-run] [--json]`;

const parseArgs = (argv) => {
  const options = {
    runtime: 'all',
    out: generatedRoot,
    clean: false,
    dryRun: false,
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--runtime') {
      options.runtime = argv[++index];
    } else if (arg === '--out') {
      options.out = path.resolve(argv[++index]);
    } else if (arg === '--clean') {
      options.clean = true;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}\n${usage()}`);
    }
  }

  if (!['all', 'claude', 'codex'].includes(options.runtime)) {
    throw new Error(`Unsupported runtime: ${options.runtime}\n${usage()}`);
  }

  return options;
};

const pathExists = async (target) => {
  try {
    await access(target, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
};

const toPortable = (filePath) => filePath.split(path.sep).join('/');

const shouldExclude = (sourcePath) => {
  const relative = path.relative(repoRoot, sourcePath);
  const portableRelative = toPortable(relative);
  const segments = relative.split(path.sep);
  const basename = path.basename(sourcePath);

  if (segments.some((segment) => denySegments.has(segment) || segment.endsWith('fixtures'))) {
    return true;
  }

  return basename.includes('fixtures') || denyBasenames.some((pattern) => pattern.test(basename));
};

const walkTree = async (source, visit) => {
  const entries = await readdir(source, { withFileTypes: true });
  for (const entry of entries) {
    const absolute = path.join(source, entry.name);
    await visit(absolute, entry);
    if (entry.isDirectory()) {
      await walkTree(absolute, visit);
    }
  }
};

const planTree = async (source, destination, plannedCopies) => {
  await walkTree(source, async (candidate) => {
    const excluded = shouldExclude(candidate);
    if (!excluded) {
      plannedCopies.push({
        from: toPortable(path.relative(repoRoot, candidate)),
        to: toPortable(path.relative(repoRoot, path.join(destination, path.relative(source, candidate)))),
      });
    }
  });
};

const copyTree = async (source, destination, plannedCopies, options = {}) => {
  if (!await pathExists(source)) {
    throw new Error(`Missing package source: ${path.relative(repoRoot, source)}`);
  }

  if (options.dryRun) {
    await planTree(source, destination, plannedCopies);
    return;
  }

  await cp(source, destination, {
    recursive: true,
    force: true,
    preserveTimestamps: false,
    filter: (candidate) => {
      const excluded = shouldExclude(candidate);
      if (!excluded && candidate !== source) {
        plannedCopies.push({
          from: toPortable(path.relative(repoRoot, candidate)),
          to: toPortable(path.relative(repoRoot, path.join(destination, path.relative(source, candidate)))),
        });
      }
      return !excluded;
    },
  });
};

const copyFilePreservingMode = async (source, destination, plannedCopies, options = {}) => {
  plannedCopies.push({
    from: toPortable(path.relative(repoRoot, source)),
    to: toPortable(path.relative(repoRoot, destination)),
  });
  if (options.dryRun) {
    return;
  }
  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(source, destination);
  const sourceStat = await stat(source);
  await chmod(destination, sourceStat.mode);
};

const materializeRuntime = async (runtime, options) => {
  const spec = runtimeSpecs[runtime];
  assert(spec, `Unknown runtime spec: ${runtime}`);

  const outputRoot = path.join(options.out, spec.outputRoot);
  const plannedCopies = [];

  if (options.clean && !options.dryRun) {
    await rm(outputRoot, { recursive: true, force: true });
  }

  if (!options.dryRun) {
    await mkdir(outputRoot, { recursive: true });
  }

  await copyTree(spec.templateRoot, outputRoot, plannedCopies, options);

  for (const sharedDir of spec.sharedDirs) {
    const source = path.join(repoRoot, sharedDir);
    const targetName = path.basename(sharedDir);
    const destination = sharedDir === path.join('docs', 'public')
      ? path.join(outputRoot, 'docs', 'public')
      : path.join(outputRoot, targetName);
    await copyTree(source, destination, plannedCopies, options);
  }

  for (const sharedFile of spec.sharedFiles) {
    const source = path.join(repoRoot, sharedFile);
    const destination = path.join(outputRoot, sharedFile);
    await copyFilePreservingMode(source, destination, plannedCopies, options);
  }

  const verificationSource = path.join(repoRoot, 'schemas', 'verification.contract.yaml');
  await copyFilePreservingMode(verificationSource, path.join(outputRoot, spec.verificationTarget), plannedCopies, options);

  return { runtime, outputRoot, copied: plannedCopies };
};

const main = async () => {
  const options = parseArgs(process.argv.slice(2));
  const runtimes = options.runtime === 'all' ? ['claude', 'codex'] : [options.runtime];
  const results = [];

  for (const runtime of runtimes) {
    results.push(await materializeRuntime(runtime, options));
  }

  if (options.json) {
    console.log(JSON.stringify({
      out: options.out,
      runtimes: results.map((result) => ({
        runtime: result.runtime,
        outputRoot: toPortable(path.relative(repoRoot, result.outputRoot)),
        copiedCount: result.copied.length,
        planned: options.dryRun ? result.copied : undefined,
      })),
    }, null, 2));
  } else {
    for (const result of results) {
      console.log(`materialized ${result.runtime}: ${path.relative(repoRoot, result.outputRoot)} (${result.copied.length} entries)`);
    }
  }
};

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
