import fs from 'node:fs';
import path from 'node:path';

const SIDECAR_FILE_NAMES = Object.freeze({
  blockerEvidence: 'BLOCKER_EVIDENCE.jsonl',
  attemptLedger: 'ATTEMPT_LEDGER.jsonl',
  projectionManifest: 'projection-manifest.json',
});

function normalizePhaseNumber(phaseNumber) {
  const raw = String(phaseNumber ?? '').trim();
  const match = raw.match(/\d+/);
  if (!match) {
    throw new Error('phaseNumber is required to resolve a phase execution directory');
  }
  return match[0].padStart(2, '0');
}

function trimMarkdownExtension(value) {
  return String(value || '').replace(/\.md$/i, '');
}

function phaseDocSlug(phaseDoc) {
  const base = trimMarkdownExtension(path.basename(String(phaseDoc || '')));
  return base.replace(/^\d{2}-/, '');
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function phaseDirCandidates({ phaseNumber, phaseSlug, phaseDoc }) {
  const num = normalizePhaseNumber(phaseNumber);
  const explicitSlug = trimMarkdownExtension(phaseSlug);
  const docSlug = phaseDocSlug(phaseDoc);
  const slugs = unique([explicitSlug, docSlug]);
  const candidates = [];

  for (const slug of slugs) {
    candidates.push(`${num}-${slug}`);
    if (!slug.startsWith(`phase-${num}-`)) {
      candidates.push(`${num}-phase-${num}-${slug}`);
    }
  }

  if (phaseDoc) {
    candidates.push(trimMarkdownExtension(path.basename(phaseDoc)));
  }

  return unique(candidates);
}

function archiveExecutionRoots({ planDir, executionRoot, phaseDoc }) {
  const roots = [];
  if (!planDir || !executionRoot) {
    return roots;
  }

  const relativeExecutionRoot = path.relative(planDir, executionRoot);
  if (relativeExecutionRoot && !relativeExecutionRoot.startsWith('..')) {
    roots.push(path.join(planDir, 'close', relativeExecutionRoot));
  }

  roots.push(path.join(planDir, 'close', path.basename(executionRoot)));

  if (phaseDoc) {
    const closeIndex = String(phaseDoc).split(/[\\/]/).findIndex((segment) => segment === 'close');
    if (closeIndex >= 0) {
      roots.push(path.join(path.dirname(phaseDoc), 'execution', path.basename(executionRoot)));
    }
  }

  return roots;
}

function sidecarPathsFor(executionDir) {
  return {
    blockerEvidencePath: path.join(executionDir, SIDECAR_FILE_NAMES.blockerEvidence),
    attemptLedgerPath: path.join(executionDir, SIDECAR_FILE_NAMES.attemptLedger),
    projectionManifestPath: path.join(executionDir, SIDECAR_FILE_NAMES.projectionManifest),
  };
}

function existingNumberedPhaseDir(root, phaseNumber, fsImpl) {
  if (!fsImpl.existsSync(root)) {
    return null;
  }

  const prefix = `${normalizePhaseNumber(phaseNumber)}-`;
  const matches = fsImpl
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith(prefix))
    .map((entry) => path.join(root, entry.name));

  return matches.length === 1 ? matches[0] : null;
}

export function resolvePhaseExecutionDir({
  planDir,
  executionRoot,
  phaseNumber,
  phaseSlug,
  phaseDoc,
  fsImpl = fs,
} = {}) {
  if (!executionRoot) {
    throw new Error('executionRoot is required to resolve a phase execution directory');
  }

  const phaseDirs = phaseDirCandidates({ phaseNumber, phaseSlug, phaseDoc });
  if (phaseDirs.length === 0) {
    throw new Error('phaseSlug or phaseDoc is required to resolve a phase execution directory');
  }

  const roots = unique([
    executionRoot,
    ...archiveExecutionRoots({ planDir, executionRoot, phaseDoc }),
  ]);

  const candidates = roots.flatMap((root) => phaseDirs.map((dir) => path.join(root, dir)));
  const executionDir = candidates.find((candidate) => fsImpl.existsSync(candidate))
    ?? roots.map((root) => existingNumberedPhaseDir(root, phaseNumber, fsImpl)).find(Boolean)
    ?? candidates[0];

  return {
    executionDir,
    phaseDirName: path.basename(executionDir),
    sidecarPaths: sidecarPathsFor(executionDir),
    candidates,
  };
}

export { SIDECAR_FILE_NAMES };
