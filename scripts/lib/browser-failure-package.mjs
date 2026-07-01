import path from 'node:path';

import {
  BROWSER_REPAIR_MAX_ATTEMPTS,
  REQUIRED_FORBIDDEN_REPAIR_MUTATIONS,
  normalizeBrowserScenarioContract,
} from './browser-scenario-contract.mjs';

const REQUIRED_PROHIBITED_REPAIR_ACTIONS = [
  'do not delete or weaken failing assertions',
  'do not change expected behavior without a tracked blocker',
  'do not update screenshot or visual baselines automatically',
  'do not skip required browser or integration tests',
];

const unique = (values = []) => [...new Set(values.filter(Boolean))];

const clampRepairAttempts = (value) => Math.max(1, Math.min(BROWSER_REPAIR_MAX_ATTEMPTS, Number(value) || BROWSER_REPAIR_MAX_ATTEMPTS));

const normalizePortablePath = (filePath = '') => String(filePath || '').replaceAll('\\', '/');

export const browserArtifactPathAllowed = (artifactPath, { baseDir = process.cwd() } = {}) => {
  const normalized = normalizePortablePath(artifactPath);
  if (!normalized) return false;
  const artifactRoot = path.resolve(baseDir, '.moonshot-relay', 'browser-artifacts');
  const absoluteArtifactPath = path.resolve(baseDir, normalized);
  const relative = path.relative(artifactRoot, absoluteArtifactPath);
  return Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative);
};

export const normalizeBrowserFailureArtifact = (artifact = {}) => {
  if (typeof artifact === 'string') {
    return { type: '', path: normalizePortablePath(artifact), sha256: '', redacted: false };
  }
  return {
    type: String(artifact.type || artifact.artifactType || ''),
    path: normalizePortablePath(artifact.path || artifact.artifactPath || ''),
    sha256: String(artifact.sha256 || artifact.artifactSha256 || ''),
    redacted: artifact.redacted === true,
  };
};

export const validateBrowserFailureArtifacts = ({
  scenario = null,
  artifacts = [],
  baseDir = process.cwd(),
  requireScenarioArtifacts = Boolean(scenario),
  enforceArtifactRoot = true,
} = {}) => {
  const errors = [];
  const normalizedArtifacts = artifacts.map(normalizeBrowserFailureArtifact);
  for (const artifact of normalizedArtifacts) {
    if (!artifact.path) errors.push('artifact path is required');
    if (enforceArtifactRoot && artifact.path && !browserArtifactPathAllowed(artifact.path, { baseDir })) {
      errors.push(`artifact path outside .moonshot-relay/browser-artifacts: ${artifact.path}`);
    }
  }

  if (scenario && requireScenarioArtifacts) {
    const normalizedScenario = normalizeBrowserScenarioContract(scenario);
    const presentTypes = new Set(normalizedArtifacts.map((artifact) => artifact.type).filter(Boolean));
    for (const requiredType of normalizedScenario.requiredArtifactTypes) {
      if (!presentTypes.has(requiredType)) {
        errors.push(`missing required artifact type ${requiredType}`);
      }
    }
  }

  return errors;
};

export const buildBrowserFailureBlockerMapping = ({
  failureClass = '',
  failedStage = '',
  setupGap = false,
  browserResult = {},
} = {}) => {
  const sourceFailureClass = failureClass || browserResult.failureClass || browserResult.browserCompletionFailureClass || '';
  const sourceFailedStage = failedStage || browserResult.failedStage || browserResult.failedStep || '';
  const status = browserResult.status || (sourceFailureClass ? 'failed' : 'unknown');
  return [{
    source: 'browser_completion_result',
    status,
    failedStage: sourceFailedStage,
    failureClass: sourceFailureClass || 'unknown',
    setupGap: setupGap === true || browserResult.setupGap === true,
    blockerCode: sourceFailureClass || (setupGap ? 'setup_gap' : 'browser_failure'),
    blocksCompletion: status !== 'clean_pass' && status !== 'passed',
    reason: browserResult.stderr || browserResult.reason || sourceFailureClass || 'browser failure requires repair or blocker evidence',
  }];
};

export const buildBrowserFailurePackage = ({
  scenario = null,
  browserResult = {},
  scenarioId = scenario?.scenarioId || browserResult.scenarioId || '',
  originalScenarioId = scenarioId,
  rerunScenarioId = scenarioId,
  failedStep = browserResult.failedStep || browserResult.failedStage || '',
  failedStage = browserResult.failedStage || failedStep || '',
  failureClass = browserResult.failureClass || browserResult.browserCompletionFailureClass || '',
  failedAssertionIds = [],
  consoleSummary = browserResult.consoleSummary || {},
  networkSummary = browserResult.networkSummary || {},
  artifacts = browserResult.artifacts || [],
  prohibitedRepairActions = [],
  rerunCommand = browserResult.rerunCommand || browserResult.producerCommand || '',
  maxRepairAttempts = scenario?.failurePolicy?.maxRepairAttempts || BROWSER_REPAIR_MAX_ATTEMPTS,
  attemptIndex = 1,
  setupGap = browserResult.setupGap === true,
  redactionManifest = browserResult.redactionManifest || {},
  blockerMapping = null,
  baseDir = process.cwd(),
  requireScenarioArtifacts = Boolean(scenario),
  enforceArtifactRoot = Boolean(scenario),
} = {}) => {
  const normalizedScenario = scenario ? normalizeBrowserScenarioContract(scenario) : null;
  const normalizedArtifacts = artifacts.map(normalizeBrowserFailureArtifact);
  const artifactErrors = validateBrowserFailureArtifacts({
    scenario: normalizedScenario,
    artifacts: normalizedArtifacts,
    baseDir,
    requireScenarioArtifacts,
    enforceArtifactRoot,
  });
  if (artifactErrors.length > 0) {
    throw new Error(`invalid browser failure artifacts: ${artifactErrors.join('; ')}`);
  }

  const repairPolicy = normalizedScenario?.failurePolicy || {
    maxRepairAttempts: BROWSER_REPAIR_MAX_ATTEMPTS,
    preserveScenarioId: true,
    preserveFailingAssertionIds: true,
    fallbackAuthority: 'diagnosis_only',
    forbiddenMutations: REQUIRED_FORBIDDEN_REPAIR_MUTATIONS,
  };
  const effectiveScenarioId = String(scenarioId || normalizedScenario?.scenarioId || 'unknown');
  const effectiveFailureClass = String(failureClass || browserResult.failureClass || browserResult.browserCompletionFailureClass || 'unknown');
  const finalProhibitedActions = unique([...REQUIRED_PROHIBITED_REPAIR_ACTIONS, ...prohibitedRepairActions.map(String)]);
  const finalBlockerMapping = Array.isArray(blockerMapping) && blockerMapping.length > 0
    ? blockerMapping
    : buildBrowserFailureBlockerMapping({
      failureClass: effectiveFailureClass,
      failedStage,
      setupGap,
      browserResult,
    });

  return {
    schemaVersion: 1,
    artifactId: 'BROWSER_FAILURE_PACKAGE',
    scenario: normalizedScenario,
    scenarioId: effectiveScenarioId,
    originalScenarioId: String(originalScenarioId || effectiveScenarioId),
    rerunScenarioId: String(rerunScenarioId || effectiveScenarioId),
    failedStep: String(failedStep || failedStage || 'unknown'),
    failedStage: String(failedStage || failedStep || 'unknown'),
    failureClass: effectiveFailureClass,
    failedAssertionIds: failedAssertionIds.map(String),
    consoleSummary: consoleSummary || {},
    networkSummary: networkSummary || {},
    artifacts: normalizedArtifacts,
    prohibitedRepairActions: finalProhibitedActions,
    rerunCommand: String(rerunCommand || ''),
    attemptIndex: Number(attemptIndex) || 1,
    maxRepairAttempts: clampRepairAttempts(maxRepairAttempts || repairPolicy.maxRepairAttempts),
    setupGap: setupGap === true,
    redactionManifest,
    blockerMapping: finalBlockerMapping,
    repairPolicy,
  };
};

export const repairPromptInputFromFailurePackage = (failurePackage = {}) => ({
  scenarioId: failurePackage.scenarioId,
  originalScenarioId: failurePackage.originalScenarioId,
  rerunScenarioId: failurePackage.rerunScenarioId,
  failedStep: failurePackage.failedStep,
  failedStage: failurePackage.failedStage,
  failureClass: failurePackage.failureClass,
  failedAssertionIds: failurePackage.failedAssertionIds || [],
  consoleSummary: failurePackage.consoleSummary || {},
  networkSummary: failurePackage.networkSummary || {},
  artifacts: failurePackage.artifacts || [],
  prohibitedRepairActions: failurePackage.prohibitedRepairActions || [],
  rerunCommand: failurePackage.rerunCommand,
  maxRepairAttempts: failurePackage.maxRepairAttempts,
  attemptIndex: failurePackage.attemptIndex,
  setupGap: failurePackage.setupGap === true,
  redactionManifest: failurePackage.redactionManifest || {},
  blockerMapping: failurePackage.blockerMapping || [],
});

export const repairReceiptInputFromFailurePackage = (failurePackage = {}) => ({
  scenarioId: failurePackage.scenarioId,
  originalScenarioId: failurePackage.originalScenarioId,
  rerunScenarioId: failurePackage.rerunScenarioId,
  failedAssertionIds: failurePackage.failedAssertionIds || [],
  preservedAssertionIds: failurePackage.failedAssertionIds || [],
  attemptIndex: failurePackage.attemptIndex,
  maxRepairAttempts: failurePackage.maxRepairAttempts,
  artifactLinks: (failurePackage.artifacts || []).map((artifact) => artifact.path).filter(Boolean),
  setupGap: failurePackage.setupGap === true,
  blockerMapping: failurePackage.blockerMapping || [],
});
