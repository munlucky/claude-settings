import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const PHASE_ATTEMPT_MANIFEST_SCHEMA_VERSION = 1;

const INTENT_FIELDS = [
  'attemptId',
  'phaseNumber',
  'runnerStartedAt',
  'promptHash',
  'commandHash',
  'runnerLogPath',
  'schemaVersion',
  'manifestRequired',
];

const FINALIZER_FIELDS = [
  'completionTransactionId',
  'finalizerTransactionId',
  'verificationVerdictPath',
  'completionGateVerdict',
];

function toPosixPath(value) {
  return String(value || '').replace(/\\/g, '/').replace(/\/+$/, '');
}

function assertRequiredText(name, value) {
  if (!String(value || '').trim()) {
    throw new TypeError(`${name} is required`);
  }
}

function atomicWriteJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.${crypto.randomUUID()}.tmp`;
  const body = `${JSON.stringify(payload, null, 2)}\n`;
  const fd = fs.openSync(tempPath, 'w');
  try {
    fs.writeFileSync(fd, body, 'utf8');
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tempPath, filePath);
  try {
    const dirFd = fs.openSync(path.dirname(filePath), 'r');
    try {
      fs.fsyncSync(dirFd);
    } finally {
      fs.closeSync(dirFd);
    }
  } catch {
    // Directory fsync is not consistently available on Windows filesystems.
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function manifestPathFromInput(input) {
  if (typeof input === 'string') {
    return input;
  }
  if (input?.manifestPath) {
    return input.manifestPath;
  }
  return resolvePhaseAttemptManifestPaths(input).manifestPath;
}

function assertSchema(manifest) {
  if (Number(manifest?.schemaVersion) < PHASE_ATTEMPT_MANIFEST_SCHEMA_VERSION) {
    throw new Error('attempt_manifest_schema_unsupported');
  }
  if (manifest?.manifestRequired !== true) {
    throw new Error('attempt_manifest_not_required');
  }
}

export function isAttemptManifestEnforced(config = {}) {
  return config?.manifestRequired === true
    || Number(config?.schemaVersion) >= PHASE_ATTEMPT_MANIFEST_SCHEMA_VERSION;
}

function patchOnce(input, patch, ownedFields) {
  const manifestPath = manifestPathFromInput(input);
  const manifest = readJson(manifestPath);
  assertSchema(manifest);
  for (const field of ownedFields) {
    if (Object.prototype.hasOwnProperty.call(patch, field)
      && Object.prototype.hasOwnProperty.call(manifest, field)) {
      throw new Error(`attempt_manifest_field_immutable:${field}`);
    }
  }
  const next = { ...manifest, ...patch };
  atomicWriteJson(manifestPath, next);
  return next;
}

export function resolvePhaseAttemptManifestPaths({
  executionRoot,
  phaseNumber,
  phaseSlug,
  attemptId,
}) {
  assertRequiredText('executionRoot', executionRoot);
  assertRequiredText('attemptId', attemptId);
  const resolvedPhaseSlug = toPosixPath(phaseSlug || `phase-${String(phaseNumber || '').padStart(2, '0')}`);
  assertRequiredText('phaseSlug or phaseNumber', resolvedPhaseSlug);
  const attemptDirectory = `${toPosixPath(executionRoot)}/${resolvedPhaseSlug}/attempts/${toPosixPath(attemptId)}`;
  return {
    attemptDirectory,
    manifestPath: `${attemptDirectory}/attempt-manifest.json`,
    heartbeatPath: `${attemptDirectory}/attempt-heartbeat.jsonl`,
  };
}

export function writeAttemptManifestIntent(input) {
  const paths = resolvePhaseAttemptManifestPaths(input);
  if (fs.existsSync(paths.manifestPath)) {
    throw new Error('attempt_manifest_intent_already_exists');
  }
  const manifest = {
    attemptId: String(input.attemptId),
    phaseNumber: String(input.phaseNumber),
    runnerStartedAt: String(input.runnerStartedAt),
    promptHash: String(input.promptHash),
    commandHash: String(input.commandHash),
    runnerLogPath: String(input.runnerLogPath),
    schemaVersion: PHASE_ATTEMPT_MANIFEST_SCHEMA_VERSION,
    manifestRequired: true,
  };
  for (const field of INTENT_FIELDS) {
    if (manifest[field] === '' || manifest[field] === 'undefined') {
      throw new TypeError(`${field} is required`);
    }
  }
  atomicWriteJson(paths.manifestPath, manifest);
  return { ...paths, manifest };
}

export function patchAttemptManifestChildIdentity(input) {
  return patchOnce(input, {
    childPid: input.childPid ?? null,
    childProcessStartTime: input.childProcessStartTime ?? null,
  }, ['childPid', 'childProcessStartTime']);
}

export function patchAttemptManifestExit(input) {
  return patchOnce(input, {
    runnerFinishedAt: String(input.runnerFinishedAt),
    runnerExitCode: Number(input.runnerExitCode),
  }, ['runnerFinishedAt', 'runnerExitCode']);
}

export function patchAttemptManifestFinalizerSeal(input) {
  const patch = {};
  for (const field of FINALIZER_FIELDS) {
    patch[field] = input[field] ?? null;
  }
  return patchOnce(input, patch, FINALIZER_FIELDS);
}

export function appendAttemptHeartbeatEvent(input) {
  const paths = input.heartbeatPath ? input : resolvePhaseAttemptManifestPaths(input);
  const attemptId = String(input.attemptId || '').trim();
  assertRequiredText('attemptId', attemptId);
  fs.mkdirSync(path.dirname(paths.heartbeatPath), { recursive: true });
  const event = {
    timestamp: input.timestamp || new Date().toISOString(),
    attemptId,
    eventType: String(input.eventType || 'heartbeat'),
    payload: input.payload && typeof input.payload === 'object' ? input.payload : {},
  };
  fs.appendFileSync(paths.heartbeatPath, `${JSON.stringify(event)}\n`, 'utf8');
  return event;
}

export function readAttemptManifest(input) {
  const manifestPath = manifestPathFromInput(input);
  if (!fs.existsSync(manifestPath)) {
    return { ok: false, reason: 'missing_attempt_manifest', manifest: null };
  }
  const manifest = readJson(manifestPath);
  return { ok: true, reason: 'ok', manifest };
}

export function validateAttemptManifest(input, options = {}) {
  const readResult = readAttemptManifest(input);
  if (!readResult.ok) {
    return readResult;
  }
  const manifest = readResult.manifest;
  if (!isAttemptManifestEnforced(manifest)) {
    return { ok: false, reason: 'missing_attempt_manifest', manifest };
  }
  for (const field of INTENT_FIELDS) {
    if (manifest[field] === undefined || manifest[field] === null || manifest[field] === '') {
      return { ok: false, reason: 'missing_attempt_manifest', manifest };
    }
  }
  if (manifest.childPid === undefined || manifest.childPid === null || manifest.childPid === '') {
    return { ok: false, reason: 'incomplete_attempt_manifest', manifest };
  }
  if (!manifest.childProcessStartTime) {
    return { ok: false, reason: 'worker_liveness_unknown', manifest };
  }
  if (manifest.runnerFinishedAt === undefined || manifest.runnerExitCode === undefined) {
    return { ok: false, reason: 'incomplete_attempt_manifest', manifest };
  }
  if (options.requireFinalizerSeal) {
    for (const field of FINALIZER_FIELDS) {
      if (manifest[field] === undefined || manifest[field] === null || manifest[field] === '') {
        return { ok: false, reason: 'incomplete_attempt_manifest', manifest };
      }
    }
  }
  return { ok: true, reason: 'ok', manifest };
}
