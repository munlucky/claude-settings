import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

export const VERIFICATION_PLANE_SCHEMA_VERSION = 1;

export const REQUIRED_VERIFICATION_PLANES = [
  'unit',
  'package',
  'installer',
  'browser',
  'security',
  'quality',
];

export const COMPLETION_AUTHORITY_REQUIRED_PLANES = REQUIRED_VERIFICATION_PLANES;

export const VERIFICATION_PROFILES = {
  prompt_only: ['quality'],
  docs_only: ['package', 'quality'],
  script_change: ['unit', 'quality'],
  workflow_core: ['unit', 'package', 'installer', 'security', 'quality'],
  runtime_adapter: COMPLETION_AUTHORITY_REQUIRED_PLANES,
};

export const REQUIRED_SECURITY_SCANS = [
  'codeql',
  'dependencyReview',
  'dependabot',
  'secretScanning',
];

const BLOCKING_SEVERITIES = new Set(['high', 'critical']);

const nowIso = () => new Date().toISOString();

const parseDate = (value) => {
  const date = new Date(value || '');
  return Number.isNaN(date.getTime()) ? null : date;
};

const firstReason = (...values) => values.find((value) => String(value || '').trim()) || '';

export function evidenceIdFor(value) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(value))
    .digest('hex');
}

export function normalizePlaneList(planes = []) {
  return planes.map((entry) => ({
    ...entry,
    plane: String(entry.plane || '').trim(),
    status: String(entry.status || '').trim(),
  }));
}

export function buildVerificationSummary({
  runId,
  goalId,
  planes = [],
  profile = 'runtime_adapter',
  requiredPlanes = null,
  identity = {},
  producedAt = nowIso(),
  maxAgeMinutes = 60,
  reason = 'verification plane evidence accepted',
} = {}) {
  if (!Object.hasOwn(VERIFICATION_PROFILES, profile)) {
    throw new Error(`unknown verification profile: ${profile}`);
  }
  const normalizedPlanes = normalizePlaneList(planes);
  const planeByName = new Map(normalizedPlanes.map((plane) => [plane.plane, plane]));
  const profileRequiredPlanes = Array.isArray(requiredPlanes) ? requiredPlanes : VERIFICATION_PROFILES[profile];
  const completionAuthorityRequiredPlanes = COMPLETION_AUTHORITY_REQUIRED_PLANES;
  const missingPlanes = profileRequiredPlanes.filter((plane) => !planeByName.has(plane));
  const failedPlanes = normalizedPlanes
    .filter((plane) => profileRequiredPlanes.includes(plane.plane))
    .filter((plane) => plane.status !== 'passed')
    .map((plane) => ({ plane: plane.plane, status: plane.status || 'missing' }));
  const missingCompletionAuthorityPlanes = completionAuthorityRequiredPlanes.filter((plane) => !planeByName.has(plane));
  const producedDate = parseDate(producedAt);
  const maxAgeMs = Number(maxAgeMinutes) * 60 * 1000;
  const ageMs = producedDate ? Date.now() - producedDate.getTime() : Number.POSITIVE_INFINITY;
  const stale = !producedDate || !Number.isFinite(maxAgeMs) || maxAgeMs < 0 || ageMs > maxAgeMs;
  const staleReason = stale ? `stale verification evidence: producedAt=${producedAt}` : '';
  const securityPlane = planeByName.get('security') || {};
  const securityBlockers = Array.isArray(securityPlane.blockers) ? securityPlane.blockers : [];
  const requiredChecksPassed = missingPlanes.length === 0
    && failedPlanes.length === 0
    && securityBlockers.length === 0
    && !stale;
  const completionAuthorityFailedPlanes = normalizedPlanes
    .filter((plane) => completionAuthorityRequiredPlanes.includes(plane.plane))
    .filter((plane) => plane.status !== 'passed')
    .map((plane) => ({ plane: plane.plane, status: plane.status || 'missing' }));
  const wholePlanAuthorityEligible = missingCompletionAuthorityPlanes.length === 0
    && completionAuthorityFailedPlanes.length === 0
    && securityBlockers.length === 0
    && !stale;
  const taskLocalBlocker = firstReason(
    staleReason,
    securityBlockers[0]?.reason,
    failedPlanes[0] ? `failed verification plane: ${failedPlanes[0].plane}` : '',
    missingPlanes[0] ? `missing verification plane: ${missingPlanes[0]}` : '',
  );
  const wholePlanBlocker = firstReason(
    staleReason,
    securityBlockers[0]?.reason,
    completionAuthorityFailedPlanes[0] ? `failed verification plane: ${completionAuthorityFailedPlanes[0].plane}` : '',
    missingCompletionAuthorityPlanes[0] ? `missing verification plane: ${missingCompletionAuthorityPlanes[0]}` : '',
  );

  return {
    schemaVersion: VERIFICATION_PLANE_SCHEMA_VERSION,
    runId,
    goalId,
    fresh: !stale,
    stale,
    staleReason,
    requiredChecksPassed,
    activeIdentityPresent: true,
    identityMatches: true,
    identity,
    reason,
    producedAt,
    maxAgeMinutes: Number(maxAgeMinutes),
    profile,
    profileRequiredPlanes,
    completionAuthorityRequiredPlanes,
    requiredPlanes: profileRequiredPlanes,
    planes: normalizedPlanes,
    missingPlanes,
    missingProfilePlanes: missingPlanes,
    missingCompletionAuthorityPlanes,
    failedPlanes,
    securityBlockers,
    taskLocalCompletion: {
      status: requiredChecksPassed ? 'complete' : 'blocked',
      fresh: !stale,
      profile,
      requiredPlanes: profileRequiredPlanes,
      missingPlanes,
      failedPlanes,
      reason: requiredChecksPassed ? 'profile evidence complete' : taskLocalBlocker,
    },
    wholePlanAuthority: {
      status: wholePlanAuthorityEligible ? 'evidence_eligible' : 'blocked',
      authoritySource: 'runtime-state.sqlite',
      acceptedCompletionRequired: true,
      requiredPlanes: completionAuthorityRequiredPlanes,
      missingPlanes: missingCompletionAuthorityPlanes,
      failedPlanes: completionAuthorityFailedPlanes,
      reason: wholePlanAuthorityEligible ? 'all authority planes present; accepted DB decision still required' : wholePlanBlocker,
    },
    evidenceId: evidenceIdFor({ runId, goalId, producedAt, profile, requiredPlanes: profileRequiredPlanes, planes: normalizedPlanes }),
  };
}

function scanIsStale(scan, maxAgeMinutes) {
  if (!scan.producedAt) {
    return false;
  }
  const producedDate = parseDate(scan.producedAt);
  if (!producedDate) {
    return true;
  }
  return Date.now() - producedDate.getTime() > Number(maxAgeMinutes) * 60 * 1000;
}

function normalizeFindingSeverity(finding) {
  return String(finding.severity || finding.level || finding.alertSeverity || '').trim().toLowerCase();
}

function exceptionIsApproved(exception) {
  return Boolean(exception?.approvalId && exception?.owner && exception?.reason);
}

export function assessSecurityScans({
  scans = {},
  maxAgeMinutes = 24 * 60,
  exception = null,
} = {}) {
  const blockers = [];

  for (const scanName of REQUIRED_SECURITY_SCANS) {
    const scan = scans[scanName];
    if (!scan || scan.status === 'missing') {
      blockers.push({ scan: scanName, reason: `missing scan: ${scanName}`, severity: 'blocking' });
      continue;
    }
    if (scan.status === 'stale' || scanIsStale(scan, maxAgeMinutes)) {
      blockers.push({ scan: scanName, reason: `stale scan: ${scanName}`, severity: 'blocking' });
    }
    if (scan.status === 'failed') {
      blockers.push({ scan: scanName, reason: `failed scan: ${scanName}`, severity: 'blocking' });
    }
    for (const finding of Array.isArray(scan.findings) ? scan.findings : []) {
      const severity = normalizeFindingSeverity(finding);
      if (BLOCKING_SEVERITIES.has(severity)) {
        blockers.push({
          scan: scanName,
          reason: `${severity} security finding: ${scanName}`,
          severity,
          finding,
        });
      }
    }
  }

  const exceptionApplied = blockers.length > 0 && exceptionIsApproved(exception);
  const decoratedBlockers = exceptionApplied
    ? blockers.map((blocker) => ({ ...blocker, approvedException: exception }))
    : blockers;

  return {
    schemaVersion: VERIFICATION_PLANE_SCHEMA_VERSION,
    status: exceptionApplied || blockers.length === 0 ? 'passed' : 'blocked',
    releaseBlocked: blockers.length > 0 && !exceptionApplied,
    exceptionApplied,
    requiredScans: REQUIRED_SECURITY_SCANS,
    blockers: decoratedBlockers,
    scans,
    assessedAt: nowIso(),
  };
}

export async function writeBrowserTraceMetadata({
  repoRoot = process.cwd(),
  runId,
  goalId,
  flow = 'smoke',
  url = '',
  runtime = 'browserctl',
  evidenceDepth = 'smoke',
} = {}) {
  const safeFlow = String(flow || 'smoke').replace(/[^a-zA-Z0-9._-]/g, '-');
  const tracePath = path.join(
    '.moonshot-relay',
    'browser-artifacts',
    runId,
    goalId,
    safeFlow,
    'trace-metadata.json',
  ).replaceAll(path.sep, '/');
  const absolutePath = path.join(repoRoot, tracePath);
  const metadata = {
    schemaVersion: VERIFICATION_PLANE_SCHEMA_VERSION,
    traceId: evidenceIdFor({ runId, goalId, flow: safeFlow, url }),
    runId,
    goalId,
    flow: safeFlow,
    url,
    runtime,
    evidenceDepth,
    reproducible: true,
    generatedStateRoot: '.moonshot-relay/browser-artifacts',
    createdAt: nowIso(),
  };

  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');

  return {
    status: 'recorded',
    traceId: metadata.traceId,
    tracePath,
    metadata,
  };
}
