import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_CURRENT_INDEX_PATH = '.claude/logs/workflow-enforcement/current-artifacts.json';
const VERDICT_FILE_PATTERN = /^verification-verdict-.*\.json$/;

function resolveFromRoot(root, candidate) {
  if (!candidate) {
    return '';
  }
  return path.isAbsolute(candidate) ? candidate : path.resolve(root, candidate);
}

function relativeFromRoot(root, candidate) {
  const resolved = resolveFromRoot(root, candidate);
  return path.relative(root, resolved).replace(/\\/g, '/');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

export function sha256RawBytes(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function normalizeArtifacts(value, root) {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeArtifactEntry(entry, root)).filter((entry) => entry.path);
  }
  if (value && typeof value === 'object') {
    return Object.entries(value)
      .map(([kind, entry]) => normalizeArtifactEntry({ kind, ...(entry && typeof entry === 'object' ? entry : { path: entry }) }, root))
      .filter((entry) => entry.path);
  }
  return [];
}

function normalizeArtifactEntry(entry, root) {
  const artifact = entry && typeof entry === 'object' ? entry : {};
  const rawPath = artifact.path || artifact.canonicalPath || artifact.filePath || '';
  const resolvedPath = resolveFromRoot(root, rawPath);
  return {
    kind: String(artifact.kind || artifact.type || '').trim(),
    path: resolvedPath,
    relativePath: resolvedPath ? relativeFromRoot(root, resolvedPath) : '',
    hash: String(artifact.hash || artifact.sha256 || artifact.artifactHash || '').trim(),
    manifestHash: String(artifact.manifestHash || '').trim(),
    commitToken: String(artifact.commitToken || '').trim(),
  };
}

function fail(reason, detail, extra = {}) {
  return {
    ok: false,
    mode: 'current',
    isCurrent: false,
    code: reason,
    reason,
    detail,
    artifacts: [],
    ...extra,
  };
}

export function validateCurrentArtifactsIndex(index, options = {}) {
  const root = path.resolve(options.root || process.cwd());
  const indexPath = resolveFromRoot(root, options.indexPath || DEFAULT_CURRENT_INDEX_PATH);
  if (!index || typeof index !== 'object' || Array.isArray(index)) {
    return fail('current_index_invalid', 'current-artifacts.json must be a JSON object', { indexPath });
  }

  const commitToken = String(index.commitToken || index.currentCommitToken || index.token || '').trim();
  if (!commitToken) {
    return fail('commit_token_missing', 'current-artifacts.json must include commitToken', { indexPath });
  }

  const manifestPath = resolveFromRoot(root, index.manifestPath || index.manifest || index.immutableManifestPath || '');
  if (!manifestPath) {
    return fail('manifest_path_missing', 'current-artifacts.json must include manifestPath', { indexPath, commitToken });
  }
  if (!fs.existsSync(manifestPath)) {
    return fail('manifest_missing', `manifest does not exist: ${relativeFromRoot(root, manifestPath)}`, { indexPath, manifestPath, commitToken });
  }

  const expectedManifestHash = String(index.manifestHash || index.sha256 || '').trim();
  const actualManifestHash = sha256RawBytes(manifestPath);
  if (expectedManifestHash && expectedManifestHash !== actualManifestHash) {
    return fail('manifest_hash_mismatch', 'manifestHash does not match raw manifest bytes', {
      indexPath,
      manifestPath,
      commitToken,
      expectedManifestHash,
      actualManifestHash,
    });
  }

  let manifest;
  try {
    manifest = readJson(manifestPath);
  } catch (error) {
    return fail('manifest_invalid_json', error.message, { indexPath, manifestPath, commitToken });
  }

  const manifestCommitToken = String(manifest.commitToken || manifest.currentCommitToken || '').trim();
  if (manifestCommitToken && manifestCommitToken !== commitToken) {
    return fail('commit_token_mismatch', 'manifest commitToken does not match current-artifacts.json', {
      indexPath,
      manifestPath,
      commitToken,
      manifestCommitToken,
    });
  }

  const artifacts = normalizeArtifacts(index.artifacts || manifest.artifacts, root);
  for (const artifact of artifacts) {
    if (!fs.existsSync(artifact.path)) {
      return fail('artifact_missing', `artifact does not exist: ${artifact.relativePath}`, {
        indexPath,
        manifestPath,
        commitToken,
        artifact,
      });
    }
    if (artifact.commitToken && artifact.commitToken !== commitToken) {
      return fail('artifact_commit_token_mismatch', `artifact commitToken does not match current token: ${artifact.relativePath}`, {
        indexPath,
        manifestPath,
        commitToken,
        artifact,
      });
    }
    if (artifact.hash) {
      const actualArtifactHash = sha256RawBytes(artifact.path);
      if (actualArtifactHash !== artifact.hash) {
        return fail('artifact_hash_mismatch', `artifact hash does not match raw bytes: ${artifact.relativePath}`, {
          indexPath,
          manifestPath,
          commitToken,
          artifact,
          actualArtifactHash,
        });
      }
    }
  }

  return {
    ok: true,
    mode: 'current',
    isCurrent: true,
    reason: 'ok',
    indexPath,
    manifestPath,
    manifestHash: actualManifestHash,
    commitToken,
    manifest,
    artifacts,
  };
}

export function readCurrentArtifacts(options = {}) {
  const mode = String(options.mode || 'current').trim().toLowerCase();
  const root = path.resolve(options.root || process.cwd());
  if (mode === 'legacy' || mode === 'history') {
    return readLegacyArtifacts({ ...options, root, mode });
  }

  const indexPath = resolveFromRoot(root, options.indexPath || DEFAULT_CURRENT_INDEX_PATH);
  if (!fs.existsSync(indexPath)) {
    return fail('current_index_missing', `missing current artifacts index: ${relativeFromRoot(root, indexPath)}`, { indexPath });
  }

  try {
    return validateCurrentArtifactsIndex(readJson(indexPath), { ...options, root, indexPath });
  } catch (error) {
    return fail('current_index_invalid_json', error.message, { indexPath });
  }
}

function readLegacyArtifacts(options = {}) {
  const root = path.resolve(options.root || process.cwd());
  const mode = String(options.mode || 'legacy').trim().toLowerCase();
  const verdictDir = resolveFromRoot(root, options.verdictDir || '.claude');
  const maxFiles = options.maxFiles || Number.MAX_SAFE_INTEGER;
  const recentWindowMs = Number.parseInt(String(options.recentWindowMs || '0'), 10) || 0;
  const now = Date.now();
  const artifacts = fs.existsSync(verdictDir)
    ? fs.readdirSync(verdictDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && VERDICT_FILE_PATTERN.test(entry.name))
      .map((entry) => {
        const filePath = path.join(verdictDir, entry.name);
        const stats = fs.statSync(filePath);
        return {
          kind: 'verification-verdict',
          path: filePath,
          relativePath: relativeFromRoot(root, filePath),
          mtimeMs: stats.mtimeMs,
          hash: sha256RawBytes(filePath),
        };
      })
      .filter((entry) => !recentWindowMs || now - entry.mtimeMs <= recentWindowMs)
      .sort((a, b) => b.mtimeMs - a.mtimeMs)
      .slice(0, maxFiles)
    : [];

  return {
    ok: true,
    mode,
    isCurrent: false,
    reason: 'legacy_scan',
    indexPath: '',
    manifestPath: '',
    commitToken: '',
    artifacts,
  };
}
