#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assessArchitectureFixture } from './lib/control-plane-policy.mjs';

const MODES = new Set(['greenfield_prd', 'brownfield_codebase']);

const REQUIRED_BY_MODE = {
  greenfield_prd: [
    'ARCHITECTURE_BRIEF.md',
    'REQUIREMENT_INVENTORY.md',
    'ASR_CATALOG.md',
    'QUALITY_ATTRIBUTE_SCENARIOS.md',
    'DOMAIN_MODEL.md',
    'CAPABILITY_MAP.md',
    'ARCHITECTURE_OPTIONS.md',
    'TRADEOFF_ANALYSIS.md',
    'TRACEABILITY_MATRIX.md',
    'PLAN.md',
    'ARCHITECTURE_REVIEW.md',
    'C4/C4_CONTEXT.md',
    'C4/C4_CONTAINER.md',
  ],
  brownfield_codebase: [
    'CURRENT_ARCHITECTURE.md',
    'PRD_FIT_GAP.md',
    'IMPACT_MAP.md',
    'SPEC_DELTA.md',
    'REQUIREMENT_INVENTORY.md',
    'ASR_CATALOG.md',
    'TRADEOFF_ANALYSIS.md',
    'TRACEABILITY_MATRIX.md',
    'PLAN.md',
    'ARCHITECTURE_REVIEW.md',
    'C4/C4_CONTEXT.md',
    'C4/C4_CONTAINER.md',
    'C4/C4_COMPONENT.md',
  ],
};

const HELP = `Usage:
  node scripts/architecture-artifact-validate.mjs --mode <greenfield_prd|brownfield_codebase> --path <artifact-dir> [--repo-root <repo-dir>] [--json]

Validates the minimal Moonshot architecture artifact contract:
  - required mode-specific markdown files
  - REQ/ASR/QAS/ADR/traceability links
  - ADR directory with decision records
  - Brownfield evidence, path-boundary sections, and optional repo path resolution
`;

const parseArgs = (argv) => {
  const options = { json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--mode') {
      options.mode = argv[index + 1];
      index += 1;
    } else if (arg === '--path') {
      options.path = argv[index + 1];
      index += 1;
    } else if (arg === '--repo-root') {
      options.repoRoot = argv[index + 1];
      index += 1;
    } else {
      options.unknown ??= [];
      options.unknown.push(arg);
    }
  }
  return options;
};

const normalizeRelative = (relativePath) => relativePath.replaceAll('\\', '/');

const readMarkdown = async (root, relativePath, result) => {
  const absolutePath = path.join(root, ...relativePath.split('/'));
  const content = await readFile(absolutePath, 'utf8');
  result.checkedFiles.push(normalizeRelative(path.relative(root, absolutePath)));
  return content;
};

const addError = (result, code, message, file = null) => {
  result.errors.push({ code, message, file });
};

const assertPattern = (result, content, pattern, code, message, file) => {
  if (!pattern.test(content)) {
    addError(result, code, message, file);
  }
};

const extractIds = (content, pattern) => new Set(content.match(pattern) ?? []);

const parseMarkdownTables = (content) => {
  const tables = [];
  let activeSection = '';
  let pendingRows = [];

  const flush = () => {
    if (pendingRows.length >= 2) {
      const [headers, ...body] = pendingRows;
      tables.push({
        section: activeSection,
        headers,
        rows: body.map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index] || '']))),
      });
    }
    pendingRows = [];
  };

  for (const line of String(content || '').split(/\r?\n/)) {
    const trimmed = line.trim();
    const heading = trimmed.match(/^#{1,6}\s+(.+)$/);
    if (heading) {
      flush();
      activeSection = heading[1].trim();
      continue;
    }
    if (!trimmed.startsWith('|')) {
      flush();
      continue;
    }
    const cells = trimmed.replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim());
    if (cells.every((cell) => /^:?-+:?$/.test(cell))) continue;
    pendingRows.push(cells);
  }

  flush();
  return tables;
};

const parseMarkdownTable = (content) => parseMarkdownTables(content).flatMap((table) => table.rows);

const parseSectionTable = (content, sectionPattern) => (
  parseMarkdownTables(content)
    .find((table) => sectionPattern.test(table.section))
    ?.rows ?? []
);

const addUnknownReferenceErrors = (result, refs, knownIds, code, label, file) => {
  for (const ref of refs) {
    if (!knownIds.has(ref)) {
      addError(result, code, `${label} references unknown ID: ${ref}`, file);
    }
  }
};

const normalizeArtifactPath = (artifactPath) => normalizeRelative(String(artifactPath || '').trim()).replace(/\/+$/g, '');

const validateRelativePath = (result, relativePath, code, file, label) => {
  const normalized = normalizeArtifactPath(relativePath);
  if (!normalized) {
    addError(result, code, `${label} must not be empty.`, file);
    return null;
  }
  if (path.isAbsolute(normalized) || normalized.startsWith('../') || normalized.includes('/../')) {
    addError(result, code, `${label} must be a safe repository-relative path: ${relativePath}`, file);
    return null;
  }
  return normalized;
};

const validateRepoEvidencePaths = (result, rows, repoRoot, file, column = 'Evidence Path') => {
  if (!repoRoot) return;
  const absoluteRepoRoot = path.resolve(repoRoot);
  for (const row of rows) {
    const normalized = validateRelativePath(result, row[column], 'brownfield_invalid_evidence_path', file, `${column} in ${file}`);
    if (!normalized) continue;
    const absoluteEvidencePath = path.resolve(absoluteRepoRoot, ...normalized.split('/'));
    if (!absoluteEvidencePath.startsWith(`${absoluteRepoRoot}${path.sep}`) && absoluteEvidencePath !== absoluteRepoRoot) {
      addError(result, 'brownfield_evidence_path_escapes_repo', `${column} escapes repo root: ${normalized}`, file);
      continue;
    }
    if (!existsSync(absoluteEvidencePath)) {
      addError(result, 'brownfield_missing_repo_evidence_path', `${column} does not exist under repo root: ${normalized}`, file);
    }
  }
};

const collectPathSection = (result, content, sectionPattern, label) => {
  const rows = parseSectionTable(content, sectionPattern);
  const paths = new Set();
  for (const row of rows) {
    const normalized = validateRelativePath(result, row.Path, 'brownfield_invalid_path_boundary', 'CURRENT_ARCHITECTURE.md', `${label} path`);
    if (normalized) {
      paths.add(normalized);
    }
  }
  if (paths.size === 0) {
    addError(result, 'brownfield_empty_path_boundary', `${label} must declare at least one path row.`, 'CURRENT_ARCHITECTURE.md');
  }
  return paths;
};

const validateDisjointPathSets = (result, pathSets) => {
  const seen = new Map();
  for (const [label, paths] of pathSets) {
    for (const candidatePath of paths) {
      const previous = seen.get(candidatePath);
      if (previous) {
        addError(result, 'brownfield_path_boundary_overlap', `${candidatePath} appears in both ${previous} and ${label}.`, 'CURRENT_ARCHITECTURE.md');
      } else {
        seen.set(candidatePath, label);
      }
    }
  }
};

const validateAdrDirectory = async (root, result) => {
  const adrIds = new Set();
  const adrDir = path.join(root, 'ADR');
  if (!existsSync(adrDir)) {
    addError(result, 'missing_adr_directory', 'ADR directory is required.', 'ADR/');
    return adrIds;
  }

  const entries = await readdir(adrDir, { withFileTypes: true });
  const adrFiles = entries
    .filter((entry) => entry.isFile() && /^ADR-[0-9]{4,}.*\.md$/i.test(entry.name))
    .map((entry) => `ADR/${entry.name}`)
    .sort();

  if (adrFiles.length === 0) {
    addError(result, 'missing_adr', 'At least one ADR/ADR-0001.md style decision record is required.', 'ADR/');
    return adrIds;
  }

  for (const adrFile of adrFiles) {
    const content = await readMarkdown(root, adrFile, result);
    for (const adrId of extractIds(`${adrFile}\n${content}`, /ADR-[0-9]{4,}/g)) {
      adrIds.add(adrId);
    }
    assertPattern(result, content, /^## Status/m, 'adr_missing_status', 'ADR must include a Status section.', adrFile);
    assertPattern(result, content, /^## Context/m, 'adr_missing_context', 'ADR must include a Context section.', adrFile);
    assertPattern(result, content, /^## Decision/m, 'adr_missing_decision', 'ADR must include a Decision section.', adrFile);
    assertPattern(result, content, /^## Consequences/m, 'adr_missing_consequences', 'ADR must include Consequences.', adrFile);
    assertPattern(result, content, /^## Rejected Alternatives/m, 'adr_missing_rejected_alternatives', 'ADR must document rejected alternatives.', adrFile);
    assertPattern(result, content, /ADR-[0-9]{4,}/, 'adr_missing_id', 'ADR must include an ADR-0001 style ID.', adrFile);
  }

  return adrIds;
};

const validateRequiredFiles = async (root, mode, result) => {
  for (const requiredFile of REQUIRED_BY_MODE[mode]) {
    const absolutePath = path.join(root, ...requiredFile.split('/'));
    if (!existsSync(absolutePath)) {
      const decision = assessArchitectureFixture({ missing: requiredFile });
      addError(result, 'missing_required_file', decision.releaseBlocked ? decision.reason : `Required artifact is missing: ${requiredFile}`, requiredFile);
      continue;
    }
    const stats = await stat(absolutePath);
    if (!stats.isFile()) {
      addError(result, 'required_path_not_file', `Required artifact is not a file: ${requiredFile}`, requiredFile);
    }
  }
};

const validateCommonContracts = async (root, result) => {
  const requirements = await readMarkdown(root, 'REQUIREMENT_INVENTORY.md', result).catch(() => '');
  const asrs = await readMarkdown(root, 'ASR_CATALOG.md', result).catch(() => '');
  const traceability = await readMarkdown(root, 'TRACEABILITY_MATRIX.md', result).catch(() => '');

  assertPattern(result, requirements, /REQ-[0-9]{3,}/, 'missing_requirement_id', 'Requirement inventory must contain at least one REQ-001 style ID.', 'REQUIREMENT_INVENTORY.md');
  assertPattern(result, requirements, /Verification Signal/i, 'missing_requirement_verification', 'Requirement inventory must include verification signals.', 'REQUIREMENT_INVENTORY.md');
  assertPattern(result, asrs, /ASR-[0-9]{3,}/, 'missing_asr_id', 'ASR catalog must contain at least one ASR-001 style ID.', 'ASR_CATALOG.md');
  assertPattern(result, asrs, /REQ-[0-9]{3,}/, 'asr_missing_requirement_link', 'ASR catalog must link to requirement IDs.', 'ASR_CATALOG.md');
  assertPattern(result, asrs, /QAS-[0-9]{3,}/, 'asr_missing_scenario_link', 'ASR catalog must link to quality attribute scenarios.', 'ASR_CATALOG.md');
  assertPattern(result, traceability, /REQ-[0-9]{3,}/, 'traceability_missing_requirement', 'Traceability matrix must include requirement IDs.', 'TRACEABILITY_MATRIX.md');
  assertPattern(result, traceability, /ASR-[0-9]{3,}/, 'traceability_missing_asr', 'Traceability matrix must include ASR IDs.', 'TRACEABILITY_MATRIX.md');
  assertPattern(result, traceability, /ADR-[0-9]{4,}/, 'traceability_missing_adr', 'Traceability matrix must include ADR IDs.', 'TRACEABILITY_MATRIX.md');
  assertPattern(result, traceability, /Verification Signal/i, 'traceability_missing_verification', 'Traceability matrix must include verification signals.', 'TRACEABILITY_MATRIX.md');
  const traceabilityDecision = assessArchitectureFixture({ traceabilityRow: { verificationSignal: /Verification Signal/i.test(traceability) ? 'declared' : '' } });
  if (traceabilityDecision.releaseBlocked && !result.errors.some((error) => error.code === 'traceability_missing_verification')) {
    addError(result, 'traceability_missing_verification', traceabilityDecision.reason, 'TRACEABILITY_MATRIX.md');
  }

  const knownRequirementIds = extractIds(requirements, /REQ-[0-9]{3,}/g);
  const knownAsrIds = extractIds(asrs, /ASR-[0-9]{3,}/g);
  const knownAdrIds = await validateAdrDirectory(root, result);
  const asrRequirementRefs = extractIds(asrs, /REQ-[0-9]{3,}/g);
  const traceRequirementRefs = extractIds(traceability, /REQ-[0-9]{3,}/g);
  const traceAsrRefs = extractIds(traceability, /ASR-[0-9]{3,}/g);
  const traceAdrRefs = extractIds(traceability, /ADR-[0-9]{4,}/g);

  addUnknownReferenceErrors(result, asrRequirementRefs, knownRequirementIds, 'asr_unknown_requirement', 'ASR catalog', 'ASR_CATALOG.md');
  addUnknownReferenceErrors(result, traceRequirementRefs, knownRequirementIds, 'traceability_unknown_requirement', 'Traceability matrix', 'TRACEABILITY_MATRIX.md');
  addUnknownReferenceErrors(result, traceAsrRefs, knownAsrIds, 'traceability_unknown_asr', 'Traceability matrix', 'TRACEABILITY_MATRIX.md');
  addUnknownReferenceErrors(result, traceAdrRefs, knownAdrIds, 'traceability_unknown_adr', 'Traceability matrix', 'TRACEABILITY_MATRIX.md');
};

const validateC4 = async (root, mode, result) => {
  const c4Files = mode === 'brownfield_codebase'
    ? ['C4/C4_CONTEXT.md', 'C4/C4_CONTAINER.md', 'C4/C4_COMPONENT.md']
    : ['C4/C4_CONTEXT.md', 'C4/C4_CONTAINER.md'];

  for (const file of c4Files) {
    const content = await readMarkdown(root, file, result).catch(() => '');
    assertPattern(result, content, /^# C4 /m, 'c4_missing_title', 'C4 artifact must have a C4 title.', file);
    assertPattern(result, content, /Requirement|ASR|System Boundary|Container|Component/i, 'c4_missing_contract_signal', 'C4 artifact must expose boundary or requirement links.', file);
  }
};

const validateBrownfield = async (root, result, repoRoot = null) => {
  const currentArchitecture = await readMarkdown(root, 'CURRENT_ARCHITECTURE.md', result).catch(() => '');
  const prdFitGap = await readMarkdown(root, 'PRD_FIT_GAP.md', result).catch(() => '');
  const impactMap = await readMarkdown(root, 'IMPACT_MAP.md', result).catch(() => '');
  const specDelta = await readMarkdown(root, 'SPEC_DELTA.md', result).catch(() => '');
  const requirements = await readMarkdown(root, 'REQUIREMENT_INVENTORY.md', result).catch(() => '');
  const traceability = await readMarkdown(root, 'TRACEABILITY_MATRIX.md', result).catch(() => '');

  for (const [file, content] of [
    ['CURRENT_ARCHITECTURE.md', currentArchitecture],
    ['IMPACT_MAP.md', impactMap],
    ['SPEC_DELTA.md', specDelta],
  ]) {
    assertPattern(result, content, /Evidence|Observation|Current/i, 'brownfield_missing_evidence', 'Brownfield artifacts must carry evidence from the current system.', file);
  }

  assertPattern(result, currentArchitecture, /Owned Paths/i, 'brownfield_missing_owned_paths', 'Current architecture must declare owned paths.', 'CURRENT_ARCHITECTURE.md');
  assertPattern(result, currentArchitecture, /Read-only Paths/i, 'brownfield_missing_readonly_paths', 'Current architecture must declare read-only paths.', 'CURRENT_ARCHITECTURE.md');
  assertPattern(result, currentArchitecture, /Staged Paths/i, 'brownfield_missing_staged_paths', 'Current architecture must declare staged paths.', 'CURRENT_ARCHITECTURE.md');
  assertPattern(result, prdFitGap, /REQ-[0-9]{3,}/, 'brownfield_fit_gap_missing_requirement', 'PRD fit-gap must link to requirement IDs.', 'PRD_FIT_GAP.md');
  assertPattern(result, `${impactMap}\n${specDelta}`, /Compatibility|Migration|Rollback/i, 'brownfield_missing_migration_contract', 'Brownfield package must document compatibility, migration, or rollback impact.', 'IMPACT_MAP.md');

  const ownedPaths = collectPathSection(result, currentArchitecture, /^Owned Paths$/i, 'Owned Paths');
  const readOnlyPaths = collectPathSection(result, currentArchitecture, /^Read-only Paths$/i, 'Read-only Paths');
  const stagedPaths = collectPathSection(result, currentArchitecture, /^Staged Paths$/i, 'Staged Paths');
  validateDisjointPathSets(result, [
    ['Owned Paths', ownedPaths],
    ['Read-only Paths', readOnlyPaths],
    ['Staged Paths', stagedPaths],
  ]);

  const evidenceRows = parseMarkdownTable(currentArchitecture)
    .filter((row) => row['Evidence Path'] && row.Observation && /^(high|medium|low)$/i.test(row.Confidence || ''));
  if (evidenceRows.length === 0) {
    addError(result, 'brownfield_missing_evidence_rows', 'Current architecture must include evidence rows with Evidence Path, Observation, and Confidence.', 'CURRENT_ARCHITECTURE.md');
  }
  validateRepoEvidencePaths(result, evidenceRows, repoRoot, 'CURRENT_ARCHITECTURE.md');

  const knownRequirementIds = extractIds(requirements, /REQ-[0-9]{3,}/g);
  const fitGapRequirementRefs = extractIds(prdFitGap, /REQ-[0-9]{3,}/g);
  addUnknownReferenceErrors(result, fitGapRequirementRefs, knownRequirementIds, 'brownfield_fit_gap_unknown_requirement', 'PRD fit-gap', 'PRD_FIT_GAP.md');

  const specDeltaRows = parseMarkdownTable(specDelta).filter((row) => row['Delta ID']);
  const knownDeltaIds = new Set(specDeltaRows.map((row) => row['Delta ID']).filter((id) => /^DELTA-[0-9]{3,}$/.test(id || '')));
  if (knownDeltaIds.size === 0) {
    addError(result, 'brownfield_missing_spec_delta_id', 'SPEC_DELTA.md must include at least one DELTA-001 style Delta ID table row.', 'SPEC_DELTA.md');
  }
  for (const row of specDeltaRows) {
    const requirementRefs = extractIds(row['Requirement IDs'] || '', /REQ-[0-9]{3,}/g);
    addUnknownReferenceErrors(result, requirementRefs, knownRequirementIds, 'brownfield_spec_delta_unknown_requirement', 'Spec delta', 'SPEC_DELTA.md');
  }

  const traceRows = parseMarkdownTable(traceability).filter((row) => row['Requirement ID']);
  for (const row of traceRows) {
    if (!row['Spec Delta ID']) {
      addError(result, 'brownfield_traceability_missing_spec_delta', `Traceability row for ${row['Requirement ID']} must include a Spec Delta ID.`, 'TRACEABILITY_MATRIX.md');
    } else if (!knownDeltaIds.has(row['Spec Delta ID'])) {
      addError(result, 'brownfield_traceability_unknown_spec_delta', `Traceability row for ${row['Requirement ID']} references unknown Spec Delta ID: ${row['Spec Delta ID']}`, 'TRACEABILITY_MATRIX.md');
    }
  }
  const traceEvidenceRows = traceRows.filter((row) => row['Evidence Path']);
  validateRepoEvidencePaths(result, traceEvidenceRows, repoRoot, 'TRACEABILITY_MATRIX.md');
};

const validatePlanReadiness = async (root, result) => {
  const traceability = await readMarkdown(root, 'TRACEABILITY_MATRIX.md', result).catch(() => '');
  const plan = await readMarkdown(root, 'PLAN.md', result).catch(() => '');
  const review = await readMarkdown(root, 'ARCHITECTURE_REVIEW.md', result).catch(() => '');

  const traceRows = parseMarkdownTable(traceability).filter((row) => row['Requirement ID']);
  const planRows = parseMarkdownTable(plan).filter((row) => row['Task ID']);
  for (const row of traceRows) {
    const taskId = row['Task ID'] || '';
    if (!/^TASK-[0-9]{3,}$/.test(taskId)) {
      addError(result, 'traceability_missing_task', `Traceability row for ${row['Requirement ID']} must include a TASK-001 style task ID.`, 'TRACEABILITY_MATRIX.md');
      continue;
    }
    const planRow = planRows.find((candidate) => candidate['Task ID'] === taskId);
    if (!planRow) {
      addError(result, 'plan_missing_task', `PLAN.md is missing task referenced by traceability: ${taskId}`, 'PLAN.md');
      continue;
    }
    if ((planRow.Owner || '') !== (row.Owner || '')) {
      addError(result, 'plan_owner_mismatch', `PLAN.md owner for ${taskId} does not match traceability owner.`, 'PLAN.md');
    }
    if ((planRow['Verification Signal'] || '') !== (row['Verification Signal'] || '')) {
      addError(result, 'plan_verification_mismatch', `PLAN.md verification signal for ${taskId} does not match traceability.`, 'PLAN.md');
    }
  }

  assertPattern(result, review, /^## Status/m, 'architecture_review_missing_status', 'Architecture review must include a Status section.', 'ARCHITECTURE_REVIEW.md');
  assertPattern(result, review, /Ready|Passed|Accepted/i, 'architecture_review_not_ready', 'Architecture review must record readiness evidence.', 'ARCHITECTURE_REVIEW.md');
};

const validateGreenfield = async (root, result) => {
  const qualityScenarios = await readMarkdown(root, 'QUALITY_ATTRIBUTE_SCENARIOS.md', result).catch(() => '');
  const asrs = await readMarkdown(root, 'ASR_CATALOG.md', result).catch(() => '');
  const traceability = await readMarkdown(root, 'TRACEABILITY_MATRIX.md', result).catch(() => '');

  const scenarioRows = parseMarkdownTable(qualityScenarios);
  const knownScenarioIds = new Set(
    scenarioRows
      .map((row) => row['Scenario ID'])
      .filter((id) => /^QAS-[0-9]{3,}$/.test(id || '')),
  );
  const asrScenarioRefs = extractIds(asrs, /QAS-[0-9]{3,}/g);
  const traceScenarioRefs = extractIds(traceability, /QAS-[0-9]{3,}/g);

  if (knownScenarioIds.size === 0) {
    addError(result, 'missing_quality_scenario_id', 'Greenfield quality scenarios must contain at least one Scenario ID table row with a QAS-001 style ID.', 'QUALITY_ATTRIBUTE_SCENARIOS.md');
  }
  addUnknownReferenceErrors(result, asrScenarioRefs, knownScenarioIds, 'asr_unknown_scenario', 'ASR catalog', 'ASR_CATALOG.md');
  addUnknownReferenceErrors(result, traceScenarioRefs, knownScenarioIds, 'traceability_unknown_scenario', 'Traceability matrix', 'TRACEABILITY_MATRIX.md');

  await validatePlanReadiness(root, result);
};

export const validateArchitectureArtifacts = async ({ mode, artifactPath, repoRoot = null }) => {
  const root = path.resolve(artifactPath);
  const resolvedRepoRoot = repoRoot ? path.resolve(repoRoot) : null;
  const result = {
    status: 'passed',
    mode,
    path: root,
    repoRoot: resolvedRepoRoot,
    checkedFiles: [],
    errors: [],
    warnings: [],
  };

  if (!MODES.has(mode)) {
    addError(result, 'invalid_mode', `Unsupported mode: ${mode}`);
  }
  if (!existsSync(root)) {
    addError(result, 'missing_path', `Artifact path does not exist: ${root}`);
  }
  if (resolvedRepoRoot && !existsSync(resolvedRepoRoot)) {
    addError(result, 'missing_repo_root', `Repository root does not exist: ${resolvedRepoRoot}`);
  }

  if (result.errors.length === 0) {
    await validateRequiredFiles(root, mode, result);
    await validateCommonContracts(root, result);
    await validateC4(root, mode, result);
    if (mode === 'greenfield_prd') {
      await validateGreenfield(root, result);
    }
    if (mode === 'brownfield_codebase') {
      await validateBrownfield(root, result, resolvedRepoRoot);
      await validatePlanReadiness(root, result);
    }
  }

  result.checkedFiles = [...new Set(result.checkedFiles)].sort();
  result.status = result.errors.length === 0 ? 'passed' : 'failed';
  return result;
};

const main = async () => {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(HELP);
    return;
  }
  if (options.unknown?.length) {
    const message = `Unknown argument(s): ${options.unknown.join(', ')}`;
    if (options.json) {
      process.stdout.write(`${JSON.stringify({ status: 'failed', errors: [{ code: 'unknown_argument', message, file: null }] }, null, 2)}\n`);
    } else {
      process.stderr.write(`${message}\n`);
    }
    process.exitCode = 1;
    return;
  }
  if (!options.mode || !options.path) {
    const message = '--mode and --path are required. Use --help for usage.';
    if (options.json) {
      process.stdout.write(`${JSON.stringify({ status: 'failed', errors: [{ code: 'missing_required_argument', message, file: null }] }, null, 2)}\n`);
    } else {
      process.stderr.write(`${message}\n`);
    }
    process.exitCode = 1;
    return;
  }

  const result = await validateArchitectureArtifacts({
    mode: options.mode,
    artifactPath: options.path,
    repoRoot: options.repoRoot,
  });

  if (options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    process.stdout.write(`${result.status}: ${result.mode} ${result.path}\n`);
    for (const error of result.errors) {
      process.stdout.write(`- ${error.code}: ${error.file ?? '(package)'} ${error.message}\n`);
    }
  }

  if (result.status !== 'passed') {
    process.exitCode = 1;
  }
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
