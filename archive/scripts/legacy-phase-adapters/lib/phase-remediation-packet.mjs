import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const REMEDIATION_PACKET_BASENAME = 'remediation-request.json';

function normalizeRelativePath(value) {
  return String(value || '').replace(/\\/g, '/').replace(/^(?:\.\/)+/, '').trim();
}

function stableJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableJson(entry)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function normalizeStringArray(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry || '').trim()).filter(Boolean);
  }
  const normalized = String(value || '').trim();
  return normalized ? [normalized] : [];
}

function normalizeFailedCases(value) {
  return Array.isArray(value) ? value.map((entry, index) => ({
    id: String(entry?.id || `failed-case-${index + 1}`),
    stage: String(entry?.stage || entry?.failedStage || ''),
    class: String(entry?.class || entry?.failureClass || ''),
    summary: String(entry?.summary || entry?.message || ''),
    command: String(entry?.command || ''),
    artifactPath: normalizeRelativePath(entry?.artifactPath || entry?.evidencePath || ''),
    observed: String(entry?.observed || ''),
    expected: String(entry?.expected || ''),
  })) : [];
}

function normalizeDirectives(value) {
  return Array.isArray(value) ? value.map((entry, index) => ({
    id: String(entry?.id || `directive-${index + 1}`),
    targetStage: String(entry?.targetStage || entry?.stage || ''),
    targetFiles: normalizeStringArray(entry?.targetFiles),
    instruction: String(entry?.instruction || entry?.summary || ''),
    evidenceRequired: String(entry?.evidenceRequired || ''),
  })) : [];
}

export function defaultRemediationSourceRefs({
  phaseDoc,
  sprintContract,
  evidenceRefs = [],
  verdictPath = '',
  verifierResultPath = '',
  finalizerResultPath = '',
} = {}) {
  return [
    phaseDoc,
    sprintContract,
    ...normalizeStringArray(evidenceRefs),
    verdictPath,
    verifierResultPath,
    finalizerResultPath,
  ].map(normalizeRelativePath).filter(Boolean);
}

export function buildSourceHashManifest(refs = [], { root = process.cwd() } = {}) {
  const seen = new Set();
  const hashed = [];
  const missing = [];

  for (const ref of refs.map(normalizeRelativePath).filter(Boolean)) {
    if (seen.has(ref)) {
      continue;
    }
    seen.add(ref);
    const absolutePath = path.resolve(root, ref);
    if (fs.existsSync(absolutePath) && fs.statSync(absolutePath).isFile()) {
      hashed.push({
        path: ref,
        sha256: sha256File(absolutePath),
        bytes: fs.statSync(absolutePath).size,
      });
    } else {
      missing.push(ref);
    }
  }

  return { hashed, missing };
}

export function computeSourceHash(manifest) {
  return sha256(stableJson({
    hashed: [...(manifest?.hashed || [])].map((entry) => ({
      path: normalizeRelativePath(entry.path),
      sha256: String(entry.sha256 || ''),
      bytes: Number(entry.bytes || 0),
    })).sort((a, b) => a.path.localeCompare(b.path)),
    missing: [...(manifest?.missing || [])].map(normalizeRelativePath).sort(),
  }));
}

export function buildRemediationPacket({
  controllerOutput = {},
  phaseNumber,
  attemptNumber,
  sourceRefs = [],
  root = process.cwd(),
  createdAt = new Date().toISOString(),
} = {}) {
  const manifest = buildSourceHashManifest(sourceRefs, { root });
  const failedCases = normalizeFailedCases(controllerOutput.failedCases);
  const improvementDirectives = normalizeDirectives(controllerOutput.improvementDirectives);
  const evidenceRefs = normalizeStringArray(controllerOutput.evidenceRefs);
  const decision = String(controllerOutput.decision || controllerOutput.controllerDecision || 'rerun_verify');
  const failedStage = String(controllerOutput.failedStage || controllerOutput.stage || 'verify');
  const sourceHash = computeSourceHash(manifest);

  return {
    schemaVersion: 1,
    decision,
    phaseNumber: Number.parseInt(String(phaseNumber ?? controllerOutput.phaseNumber ?? 0), 10) || 0,
    attemptNumber: Number.parseInt(String(attemptNumber ?? controllerOutput.attemptNumber ?? 1), 10) || 1,
    sourceDecisionId: String(controllerOutput.sourceDecisionId || `decision-phase-${phaseNumber || controllerOutput.phaseNumber || 0}-attempt-${attemptNumber || controllerOutput.attemptNumber || 1}-${sourceHash.slice(0, 12)}`),
    retryRecommended: controllerOutput.retryRecommended !== false,
    failedStage,
    failedCases,
    improvementDirectives,
    evidenceRefs,
    nextAttemptInput: {
      mustRead: normalizeStringArray(controllerOutput.nextAttemptInput?.mustRead),
      mustRerun: normalizeStringArray(controllerOutput.nextAttemptInput?.mustRerun),
      prohibitedActions: normalizeStringArray(controllerOutput.nextAttemptInput?.prohibitedActions),
      retryStrategy: String(controllerOutput.nextAttemptInput?.retryStrategy || controllerOutput.retryStrategy || 'same_direction_refine'),
    },
    createdAt,
    sourceHash,
    sourceHashManifest: manifest,
    supersededBy: controllerOutput.supersededBy ?? null,
  };
}

export function writeRemediationPacket(packetPath, packet) {
  fs.mkdirSync(path.dirname(packetPath), { recursive: true });
  if (fs.existsSync(packetPath)) {
    try {
      const previous = JSON.parse(fs.readFileSync(packetPath, 'utf8'));
      if (!previous.supersededBy) {
        const archivePath = packetPath.replace(/\.json$/i, `.${Date.now()}.superseded.json`);
        fs.writeFileSync(archivePath, `${JSON.stringify({ ...previous, supersededBy: normalizeRelativePath(packetPath) }, null, 2)}\n`, 'utf8');
      }
    } catch {
      // A malformed previous packet should not block writing the new retry input.
    }
  }
  fs.writeFileSync(packetPath, `${JSON.stringify(packet, null, 2)}\n`, 'utf8');
  return packetPath;
}

export function readFreshRemediationPacket(packetPath, { root = process.cwd() } = {}) {
  if (!packetPath || !fs.existsSync(packetPath)) {
    return null;
  }
  let packet;
  try {
    packet = JSON.parse(fs.readFileSync(packetPath, 'utf8'));
  } catch {
    return null;
  }
  if (packet?.supersededBy) {
    return null;
  }
  const refs = [
    ...(packet.sourceHashManifest?.hashed || []).map((entry) => entry.path),
    ...(packet.sourceHashManifest?.missing || []),
  ];
  const currentManifest = buildSourceHashManifest(refs, { root });
  if (computeSourceHash(currentManifest) !== packet.sourceHash) {
    return null;
  }
  return packet;
}

export function formatRemediationPacketForPrompt(packet) {
  if (!packet) {
    return '';
  }
  const failedCases = (packet.failedCases || []).map((entry) => `- ${entry.id}: [${entry.stage || packet.failedStage}] ${entry.class} - ${entry.summary || entry.observed || 'no summary'}${entry.command ? ` | rerun: ${entry.command}` : ''}`).join('\n') || '- none recorded';
  const directives = (packet.improvementDirectives || []).map((entry) => `- ${entry.id}: ${entry.instruction}${entry.evidenceRequired ? ` | evidence: ${entry.evidenceRequired}` : ''}`).join('\n') || '- none recorded';
  const nextInput = packet.nextAttemptInput || {};
  return `Fresh remediation packet:
- Packet decision: ${packet.decision}
- Source decision id: ${packet.sourceDecisionId}
- Retry strategy: ${nextInput.retryStrategy || 'same_direction_refine'}

Failed cases:
${failedCases}

Improvement directives:
${directives}

Next attempt controls:
- Must read: ${normalizeStringArray(nextInput.mustRead).join(', ') || 'none'}
- Must rerun: ${normalizeStringArray(nextInput.mustRerun).join(', ') || 'none'}
- Prohibited actions: ${normalizeStringArray(nextInput.prohibitedActions).join(', ') || 'none'}

Remediation packet rule: use this as retry input only; never cite remediation-request.json as review, verification, closeout, or completion evidence.`;
}

export function isRemediationPacketPath(value) {
  return /(?:^|[/\\])remediation-request(?:\.[^/\\]+)?\.json$/i.test(String(value || '').trim());
}

export function hasRemediationPacketReference(value) {
  return /(?:^|[/\\])remediation-request(?:\.[^/\\]+)?\.json(?:$|[\s`"',)\]}:;])/i.test(String(value || ''));
}
