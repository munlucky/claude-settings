#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { buildProjectKnowledgeContext } from './knowledge-context-build.mjs';

const VALID_STAGES = new Set(['intake', 'plan', 'execute', 'verify', 'finish']);
const VALID_MODES = new Set([
  'greenfield_prd',
  'brownfield_codebase',
  'hybrid_prd_plus_existing_repo',
  'meta_harness_design',
]);

const REQUIRED_ARTIFACTS_BY_MODE = {
  greenfield_prd: [
    'ARCHITECTURE_BRIEF.md',
    'REQUIREMENT_INVENTORY.md',
    'ASR_CATALOG.md',
    'QUALITY_ATTRIBUTE_SCENARIOS.md',
    'DOMAIN_MODEL.md',
    'CAPABILITY_MAP.md',
    'ARCHITECTURE_OPTIONS.md',
    'TRADEOFF_ANALYSIS.md',
    'C4/C4_CONTEXT.md',
    'C4/C4_CONTAINER.md',
    'ADR/*.md',
    'TRACEABILITY_MATRIX.md',
    'ARCHITECTURE_REVIEW.md',
  ],
  brownfield_codebase: [
    'CURRENT_ARCHITECTURE.md',
    'PRD_FIT_GAP.md',
    'IMPACT_MAP.md',
    'SPEC_DELTA.md',
    'REQUIREMENT_INVENTORY.md',
    'ASR_CATALOG.md',
    'TRADEOFF_ANALYSIS.md',
    'C4/C4_CONTEXT.md',
    'C4/C4_CONTAINER.md',
    'C4/C4_COMPONENT.md',
    'ADR/*.md',
    'TRACEABILITY_MATRIX.md',
    'ARCHITECTURE_REVIEW.md',
  ],
  hybrid_prd_plus_existing_repo: [
    'CURRENT_ARCHITECTURE.md',
    'PRD_FIT_GAP.md',
    'SPEC_DELTA.md',
    'ASR_CATALOG.md',
    'TRADEOFF_ANALYSIS.md',
    'ADR/*.md',
    'TRACEABILITY_MATRIX.md',
    'ARCHITECTURE_REVIEW.md',
  ],
  meta_harness_design: [
    'ARCHITECTURE_BRIEF.md',
    'ASR_CATALOG.md',
    'ARCHITECTURE_OPTIONS.md',
    'TRADEOFF_ANALYSIS.md',
    'ADR/*.md',
    'TRACEABILITY_MATRIX.md',
    'ARCHITECTURE_REVIEW.md',
  ],
};

const INTERNAL_STAGE_OWNERS = [
  'asr-extractor',
  'architecture-option-generator',
  'architecture-tradeoff-reviewer',
  'adr-c4-writer',
  'architecture-gate-reviewer',
  'codebase-architecture-recovery',
];

const PROMPT_UNSAFE_PATTERNS = Object.freeze([
  { name: 'openai_api_key', pattern: /sk-[A-Za-z0-9_-]{6,}/ },
  { name: 'github_token', pattern: /ghp_[A-Za-z0-9_]{6,}/ },
  { name: 'private_key', pattern: /-----BEGIN PRIVATE KEY-----[\s\S]*?-----END PRIVATE KEY-----|BEGIN PRIVATE KEY/ },
  { name: 'password_assignment', pattern: /password\s*=\s*[^,\s;]+/i },
  { name: 'api_key_assignment', pattern: /apiKey\s*=\s*[^,\s;]+/ },
  { name: 'env_secret_assignment', pattern: /\b(?:API[_-]?KEY|SECRET|TOKEN|ACCESS[_-]?TOKEN|PRIVATE[_-]?TOKEN)\s*[:=]\s*["']?[A-Za-z0-9._~+/=-]{6,}/i },
  { name: 'authorization_bearer', pattern: /\bAuthorization\s*:\s*Bearer\s+[A-Za-z0-9._~+/=-]{6,}/i },
  { name: 'raw_memorygraph_json', pattern: /"?nodes"?\s*:\s*\[[\s\S]*"?relationships"?\s*:\s*\[/i },
  { name: 'raw_graph_nodes_edges', pattern: /"?nodes"?\s*:\s*\[[\s\S]*"?edges"?\s*:\s*\[/i },
  { name: 'raw_kg_dump', pattern: /"?edges"?\s*:\s*\[[\s\S]*"?relation(ship)?s?"?\s*:/i },
  { name: 'raw_ontology_dump', pattern: /(@prefix|owl:|rdf:|rdfs:|sh:NodeShape|sh:property)/i },
  { name: 'runtime_log', pattern: /\b(stdout|stderr|runtime log|browser scrape|transcript|prompt archive)\b/i },
]);

const HELP = `Usage:
  node scripts/architecture-context-build.mjs --stage <intake|plan|execute|verify|finish> --mode <greenfield_prd|brownfield_codebase|hybrid_prd_plus_existing_repo|meta_harness_design> [--cwd <path>] [--json]

Builds a prompt-safe Moonshot Architecture context pack by wrapping scripts/knowledge-context-build.mjs.
`;

const parseArgs = (argv) => {
  const options = { cwd: process.cwd(), json: false, contextNotes: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--cwd') {
      options.cwd = argv[++index];
    } else if (arg === '--stage') {
      options.stage = argv[++index];
    } else if (arg === '--mode') {
      options.mode = argv[++index];
    } else if (arg === '--run-id') {
      options.runId = argv[++index];
    } else if (arg === '--goal-id') {
      options.goalId = argv[++index];
    } else if (arg === '--max-prompt-tokens') {
      options.maxPromptTokens = Number(argv[++index]);
    } else if (arg === '--context-note') {
      options.contextNotes.push(argv[++index] ?? '');
    } else {
      options.unknown ??= [];
      options.unknown.push(arg);
    }
  }
  return options;
};

const detectUnsafeText = (text) => PROMPT_UNSAFE_PATTERNS
  .filter(({ pattern }) => pattern.test(String(text || '')))
  .map(({ name }) => name);

const pushError = (errors, code, message, sourceRef = '') => {
  errors.push({ code, message, sourceRef });
};

const renderArchitecturePromptBlock = ({ projectKnowledgeContext, stage, mode, contextNotes }) => {
  const lines = [
    '## Moonshot Architecture Context',
    `- stage: ${stage}`,
    `- mode: ${mode}`,
    `- projectKnowledgeStatus: ${projectKnowledgeContext.status}`,
    `- strictness: ${projectKnowledgeContext.strictness}`,
    `- knowledgeRevision: ${projectKnowledgeContext.knowledgeRevision || ''}`,
    `- requiredArtifacts: ${REQUIRED_ARTIFACTS_BY_MODE[mode].join(', ')}`,
    `- internalStageOwners: ${INTERNAL_STAGE_OWNERS.join(', ')}`,
    '- promptSafety: unsafe graph dumps, ontology payloads, execution bodies, captured conversation bodies, external page bodies, and secret-like strings are omitted',
    '- sourceContext: use projectKnowledgeContext.promptBlock as the only prompt-facing project knowledge authority',
  ];

  if (contextNotes.length > 0) {
    lines.push(`- contextNotes: ${contextNotes.map((note) => String(note).replace(/\s+/g, ' ').trim()).join(' | ')}`);
  }

  return lines.join('\n');
};

export function buildArchitectureContext(options = {}) {
  const stage = options.stage || 'plan';
  const mode = options.mode || 'greenfield_prd';
  const errors = [];
  const warnings = [];

  if (!VALID_STAGES.has(stage)) {
    pushError(errors, 'invalid_stage', `Unsupported stage: ${stage}`);
  }
  if (!VALID_MODES.has(mode)) {
    pushError(errors, 'invalid_mode', `Unsupported mode: ${mode}`);
  }
  for (const note of options.contextNotes || []) {
    for (const reason of detectUnsafeText(note)) {
      pushError(errors, 'prompt_unsafe_context_note', `Context note contains prompt-unsafe content: ${reason}`, 'context-note');
    }
  }

  let projectKnowledgeContext = null;
  if (errors.length === 0) {
    projectKnowledgeContext = buildProjectKnowledgeContext({
      cwd: options.cwd || process.cwd(),
      stage,
      runId: options.runId,
      goalId: options.goalId,
      maxPromptTokens: options.maxPromptTokens,
    }).projectKnowledgeContext;
  }

  const promptBlock = projectKnowledgeContext
    ? renderArchitecturePromptBlock({
        projectKnowledgeContext,
        stage,
        mode,
        contextNotes: options.contextNotes || [],
      })
    : '';

  for (const reason of detectUnsafeText(promptBlock)) {
    pushError(errors, 'prompt_unsafe_output', `Architecture prompt block contains prompt-unsafe content: ${reason}`, 'architectureContext.promptBlock');
  }
  for (const reason of detectUnsafeText(projectKnowledgeContext?.promptBlock || '')) {
    pushError(errors, 'prompt_unsafe_project_knowledge_prompt', `Project knowledge prompt block contains prompt-unsafe content: ${reason}`, 'projectKnowledgeContext.promptBlock');
  }

  const status = errors.length > 0
    ? 'failed'
    : projectKnowledgeContext.status === 'ready'
      ? 'ready'
      : 'degraded';

  const architectureContext = {
    schemaVersion: 2,
    artifactId: 'ARCHITECTURE_CONTEXT_PACK',
    owner: 'moonshot-architecture',
    mode,
    stage,
    status,
    strictness: projectKnowledgeContext?.strictness || 'advisory',
    blocking: errors.length > 0 || projectKnowledgeContext?.metadata?.blocking === true,
    projectId: projectKnowledgeContext?.projectId || '',
    knowledgeRevision: projectKnowledgeContext?.knowledgeRevision || '',
    promptFacingAuthority: 'architectureContext.promptBlock',
    sourceContextAuthority: 'projectKnowledgeContext.promptBlock',
    promptBlock,
    requiredArtifacts: REQUIRED_ARTIFACTS_BY_MODE[mode] || [],
    internalStageOwners: INTERNAL_STAGE_OWNERS,
    schemaRefs: [
      'schemas/architecture/architecture-context-pack.schema.json',
      'schemas/context-pack.schema.json',
    ],
    validator: 'scripts/architecture-artifact-validate.mjs',
    evidence: [
      {
        path: 'scripts/knowledge-context-build.mjs',
        observation: 'wrapped for status-only project knowledge metadata and promptBlock authority',
      },
    ],
    boundaries: {
      ownedPaths: ['scripts/architecture-context-build.mjs', 'tests/moonshot-architecture-context-pack.test.mjs'],
      readOnlyPaths: ['scripts/knowledge-context-build.mjs', 'schemas/architecture/architecture-context-pack.schema.json'],
      stagedPaths: ['scripts/architecture-context-build.mjs', 'tests/moonshot-architecture-context-pack.test.mjs'],
    },
    staleWarnings: projectKnowledgeContext?.contextPack?.staleWarnings || [],
    omittedByPolicy: projectKnowledgeContext?.omittedByPolicy || [],
    errors,
    warnings,
    metadata: {
      projectKnowledgeStatus: projectKnowledgeContext?.status || 'unavailable',
      projectKnowledgeStrictness: projectKnowledgeContext?.strictness || 'advisory',
      projectKnowledgeStage: projectKnowledgeContext?.stage || stage,
      projectKnowledgeBlocking: projectKnowledgeContext?.metadata?.blocking === true,
      projectKnowledgeUnavailableCount: projectKnowledgeContext?.staleOrUnavailable?.length || 0,
      contextPackRef: projectKnowledgeContext?.contextPack?.contextPackRef || '',
    },
  };

  return {
    status,
    architectureContext,
    projectKnowledgeContext: projectKnowledgeContext
      ? {
          status: projectKnowledgeContext.status,
          strictness: projectKnowledgeContext.strictness,
          stage: projectKnowledgeContext.stage,
          blocking: projectKnowledgeContext.metadata?.blocking === true,
          unavailableCount: projectKnowledgeContext.staleOrUnavailable.length,
          knowledgeRevision: projectKnowledgeContext.knowledgeRevision || '',
          promptBlock: projectKnowledgeContext.promptBlock,
        }
      : null,
  };
}

const main = () => {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(HELP);
    return;
  }

  const errors = [];
  if (options.unknown?.length) {
    pushError(errors, 'unknown_argument', `Unknown argument(s): ${options.unknown.join(', ')}`);
  }
  if (!options.stage || !options.mode) {
    pushError(errors, 'missing_required_argument', '--stage and --mode are required. Use --help for usage.');
  }
  if (errors.length > 0) {
    const failure = { status: 'failed', errors };
    if (options.json) {
      process.stdout.write(`${JSON.stringify(failure, null, 2)}\n`);
    } else {
      process.stderr.write(`${errors.map((error) => error.message).join('\n')}\n`);
    }
    process.exitCode = 1;
    return;
  }

  const result = buildArchitectureContext(options);
  if (options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    process.stdout.write(result.architectureContext.promptBlock);
    process.stdout.write('\n');
  }
  if (result.status === 'failed') {
    process.exitCode = 1;
  }
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
