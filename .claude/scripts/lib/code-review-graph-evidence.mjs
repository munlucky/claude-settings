import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const REQUIRED_STAGES = ['execute', 'review', 'finish'];
const STRICT_PROFILES = new Set(['strict', 'workflow_core', 'runtime_adapter']);

export function emptyDecision() {
  return {
    status: 'pass',
    blocking: false,
    profileAction: 'pass',
    retryable: false,
    warningCode: null,
    blockerCode: null,
    blockerClass: null,
    reason: 'ok',
    missingStages: [],
    invalidSkipReason: null,
    baseRefWarning: null,
    normalizedEvidence: {},
  };
}

function blocker(code, reason, extra = {}) {
  return {
    ...emptyDecision(),
    status: 'block',
    blocking: true,
    profileAction: 'block',
    retryable: false,
    blockerCode: code,
    blockerClass: code,
    reason,
    ...extra,
  };
}

function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function normalizeRoot(rootPath) {
  const resolved = path.resolve(rootPath);
  return fs.existsSync(resolved) ? fs.realpathSync(resolved) : resolved;
}

function isInsidePath(childPath, parentPath) {
  const relative = path.relative(parentPath, childPath);
  return relative === '' || (relative && !relative.startsWith('..') && !path.isAbsolute(relative));
}

function allowedEvidenceRoot({ repoRoot, evidenceCarrier, phaseExecutionDir }) {
  const repo = path.resolve(repoRoot || process.cwd());
  if (evidenceCarrier === 'phase') {
    if (!phaseExecutionDir) {
      throw new Error('phaseExecutionDir is required for phase evidence');
    }
    return path.join(repo, phaseExecutionDir, 'evidence', 'code-review-graph');
  }
  if (evidenceCarrier === 'bounded') {
    return path.join(repo, '.claude', 'logs', 'code-review-graph', 'evidence');
  }
  throw new Error(`unsupported evidenceCarrier: ${evidenceCarrier || '<empty>'}`);
}

function normalizeStages(codeReviewGraph = {}) {
  const rawStages = codeReviewGraph.stages || codeReviewGraph.stageEvidence || [];
  const entries = Array.isArray(rawStages) ? rawStages.map((stage) => [stage.stage, stage]) : Object.entries(rawStages);
  const stages = {};
  for (const [rawName, rawMeta] of entries) {
    const name = String(rawName || '').trim();
    if (!name || !rawMeta || typeof rawMeta !== 'object') {
      continue;
    }
    stages[name] = {
      operation: String(rawMeta.operation || '').trim(),
      exitCode: Number.isInteger(rawMeta.exitCode) ? rawMeta.exitCode : Number(rawMeta.exitCode),
    };
  }
  return stages;
}

export function resolveChangedFiles(input = {}) {
  const changedFiles = input.changedFiles || {};
  if (Array.isArray(changedFiles.files) && changedFiles.source) {
    return {
      files: changedFiles.files,
      source: changedFiles.source,
      baseRef: changedFiles.baseRef || null,
      baseRefSource: changedFiles.baseRefSource || null,
      baseRefWarning: changedFiles.baseRefWarning || null,
      fallbackUsed: Boolean(changedFiles.fallbackUsed),
    };
  }

  const worksetOwnedPaths = input.worksets?.ownedPaths || input.worksets?.activeOwnedPaths || [];
  if (Array.isArray(worksetOwnedPaths) && worksetOwnedPaths.length > 0) {
    return {
      files: worksetOwnedPaths,
      source: 'worksets_owned_paths',
      baseRef: changedFiles.baseRef || null,
      baseRefSource: changedFiles.baseRefSource || null,
      baseRefWarning: changedFiles.baseRefWarning || null,
      fallbackUsed: true,
    };
  }

  const manifestFiles = input.attemptManifest?.changedFiles || input.runnerChangedLedger?.files || [];
  if (Array.isArray(manifestFiles) && manifestFiles.length > 0) {
    return {
      files: manifestFiles,
      source: 'attempt_manifest',
      baseRef: changedFiles.baseRef || null,
      baseRefSource: changedFiles.baseRefSource || null,
      baseRefWarning: changedFiles.baseRefWarning || null,
      fallbackUsed: true,
    };
  }

  return {
    files: [],
    source: changedFiles.source || 'unresolved',
    baseRef: changedFiles.baseRef || null,
    baseRefSource: changedFiles.baseRefSource || null,
    baseRefWarning: changedFiles.baseRefWarning || null,
    fallbackUsed: Boolean(changedFiles.fallbackUsed),
  };
}

export function validateCodeReviewGraphEvidence(input = {}, options = {}) {
  const decision = emptyDecision();
  const evidenceCarrier = input.evidenceCarrier || 'bounded';
  const validationProfile = input.validationProfile || 'prompt_only';
  const codeReviewGraph = input.codeReviewGraph || {};
  const resolvedChangedFiles = resolveChangedFiles(input);
  const codeChanging = resolvedChangedFiles.files.length > 0;
  decision.baseRefWarning = resolvedChangedFiles.baseRefWarning;

  if (STRICT_PROFILES.has(validationProfile) && resolvedChangedFiles.source === 'unresolved' && !resolvedChangedFiles.baseRef) {
    return blocker('changed_files_unresolved', 'changedFiles/baseRef could not be resolved', {
      baseRefWarning: resolvedChangedFiles.baseRefWarning || 'unresolved',
    });
  }

  const stages = normalizeStages(codeReviewGraph);
  const missingStages = codeChanging
    ? REQUIRED_STAGES.filter((stage) => {
        const meta = stages[stage];
        return !meta || !meta.operation || !Number.isInteger(meta.exitCode);
      })
    : [];
  if (missingStages.length > 0) {
    return blocker('missing_required_stage_coverage', 'missing required CRG stage coverage', { missingStages });
  }

  if (codeReviewGraph.evidenceArtifactPath) {
    const artifactPath = path.resolve(options.repoRoot || process.cwd(), codeReviewGraph.evidenceArtifactPath);
    if (!fs.existsSync(artifactPath)) {
      return blocker('evidence_artifact_missing', 'evidenceArtifactPath does not exist');
    }

    const artifactRealPath = fs.realpathSync(artifactPath);
    const rootRealPath = normalizeRoot(
      allowedEvidenceRoot({
        repoRoot: options.repoRoot,
        evidenceCarrier,
        phaseExecutionDir: options.phaseExecutionDir,
      }),
    );
    if (!isInsidePath(artifactRealPath, rootRealPath)) {
      return blocker('evidence_artifact_outside_allowed_root', 'evidenceArtifactPath resolves outside the allowed root');
    }

    let artifact;
    try {
      artifact = JSON.parse(fs.readFileSync(artifactRealPath, 'utf8'));
    } catch {
      return blocker('evidence_artifact_invalid_json', 'evidence artifact is not valid JSON');
    }

    if (codeReviewGraph.adapterRunId && artifact.adapterRunId !== codeReviewGraph.adapterRunId) {
      return blocker('adapter_run_id_mismatch', 'adapterRunId does not match artifact content');
    }
    if (codeReviewGraph.evidenceDigest && sha256File(artifactRealPath) !== codeReviewGraph.evidenceDigest) {
      return blocker('evidence_digest_mismatch', 'evidenceDigest does not match artifact bytes');
    }
    if (!artifact.crgCliVersion && !codeReviewGraph.crgCliVersion) {
      return blocker('crg_cli_version_missing', 'crgCliVersion is required');
    }

    decision.normalizedEvidence = {
      artifactPath: path.relative(path.resolve(options.repoRoot || process.cwd()), artifactRealPath).replace(/\\/g, '/'),
      adapterRunId: artifact.adapterRunId || codeReviewGraph.adapterRunId || null,
      crgCliVersion: artifact.crgCliVersion || codeReviewGraph.crgCliVersion || null,
      changedFiles: resolvedChangedFiles,
      stages,
    };
    return decision;
  }

  if (codeChanging && !codeReviewGraph.crgCliVersion) {
    return blocker('crg_cli_version_missing', 'crgCliVersion is required');
  }

  decision.normalizedEvidence = {
    changedFiles: resolvedChangedFiles,
    stages,
    crgCliVersion: codeReviewGraph.crgCliVersion || null,
  };
  return decision;
}

