#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gitConfigValue } from '../lib/git-safe.mjs';
import { resolveKernelRuntimeHome, assertIsolatedRuntimeHomes, RELAY_DEFAULT_HOME } from './runtime-home.mjs';

const PROJECT_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,126}[a-z0-9]$/;

export class KernelProjectIdentityError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'KernelProjectIdentityError';
    this.code = code;
    this.details = details;
  }
}

export function sanitizeId(value, fallback = 'project') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\\/g, '/')
    .replace(/\.git$/i, '')
    .replace(/[^a-z0-9._/-]+/g, '-')
    .replace(/[\/]+/g, '-')
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '')
    .replace(/[-_.]{2,}/g, '-');
  const candidate = normalized || fallback;
  if (PROJECT_ID_PATTERN.test(candidate)) return candidate;
  const safe = `${fallback}-${stableHash(candidate).slice(0, 8)}`;
  return safe.replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '');
}

export function stableHash(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

export function pathHashId(cwd) {
  return `path-${stableHash(path.resolve(cwd).toLowerCase()).slice(0, 16)}`;
}

export function findGitRoot(startDir) {
  let current = path.resolve(startDir);
  while (true) {
    if (fs.existsSync(path.join(current, '.git'))) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

export function normalizeRemoteUrl(url) {
  if (!url) return '';
  let str = String(url).trim();
  str = str.replace(/^git@([^:]+):/, 'https://$1/');
  str = str.replace(/^ssh:\/\/git@([^/]+)\//, 'https://$1/');
  str = str.replace(/^git:\/\//, 'https://');
  str = str.replace(/\/+$/, '');
  str = str.replace(/\.git$/i, '');
  return str.toLowerCase();
}

export function parseProjectIdentityYaml(text) {
  const result = {};
  for (const rawLine of String(text || '').split(/\r?\n/)) {
    const noComment = rawLine.replace(/\s+#.*$/, '').trim();
    if (!noComment) continue;
    const parts = noComment.split(':');
    if (parts.length >= 2) {
      const key = parts[0].trim();
      const val = parts.slice(1).join(':').trim();
      if (key && val) {
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          result[key] = val.slice(1, -1);
        } else {
          result[key] = val;
        }
      }
    }
  }
  return result;
}

export function resolveKernelProjectIdentity({ cwd = process.cwd(), env = process.env } = {}) {
  const kernelHome = resolveKernelRuntimeHome({ env });
  const relayHome = env.MOONSHOT_RELAY_HOME ? path.resolve(env.MOONSHOT_RELAY_HOME) : RELAY_DEFAULT_HOME;

  assertIsolatedRuntimeHomes(kernelHome, relayHome);

  const projectRoot = findGitRoot(cwd) || path.resolve(cwd);
  
  // Guard: if project root or kernel home overlaps relay home unexpectedly
  if (path.resolve(projectRoot) === path.resolve(relayHome)) {
    throw new KernelProjectIdentityError('NAMESPACE_OVERLAP', 'Kernel project root cannot be equal to Relay home directory');
  }

  let projectId = '';
  let identitySource = '';
  const aliases = [];

  // Priority 1: .moon-relay/project.identity.yaml
  const localConfigPath = path.join(projectRoot, '.moon-relay', 'project.identity.yaml');
  if (fs.existsSync(localConfigPath)) {
    try {
      const content = fs.readFileSync(localConfigPath, 'utf8');
      const parsed = parseProjectIdentityYaml(content);
      if (parsed.projectId) {
        projectId = sanitizeId(parsed.projectId);
        identitySource = 'local_identity_file';
      }
    } catch {}
  }

  // Priority 2: Account-root alias registry (~/.moon-relay-kernel/state/project-aliases.json)
  if (!projectId) {
    const aliasRegistryPath = path.join(kernelHome, 'state', 'project-aliases.json');
    if (fs.existsSync(aliasRegistryPath)) {
      try {
        const reg = JSON.parse(fs.readFileSync(aliasRegistryPath, 'utf8'));
        const normalizedRoot = path.resolve(projectRoot).toLowerCase();
        if (reg[normalizedRoot]) {
          projectId = sanitizeId(reg[normalizedRoot]);
          identitySource = 'account_alias_registry';
        }
      } catch {}
    }
  }

  // Priority 3: Canonical Git remote
  if (!projectId) {
    let remoteUrl = gitConfigValue(projectRoot, 'remote.origin.url');
    if (!remoteUrl) {
      const gitConfigPath = path.join(projectRoot, '.git', 'config');
      if (fs.existsSync(gitConfigPath)) {
        try {
          const cfgText = fs.readFileSync(gitConfigPath, 'utf8');
          const matchUrl = cfgText.match(/\[remote\s+"origin"\][\s\S]*?url\s*=\s*([^\r\n]+)/i);
          if (matchUrl) remoteUrl = matchUrl[1].trim();
        } catch {}
      }
    }
    if (remoteUrl) {
      const normalized = normalizeRemoteUrl(remoteUrl);
      const match = normalized.match(/[\/:]([^\/]+)\/([^\/]+)$/);
      if (match) {
        const repoSlug = `${match[1]}-${match[2]}`;
        projectId = sanitizeId(repoSlug);
        identitySource = 'git_remote_origin';
        aliases.push(normalized);
      }
    }
  }

  // Priority 4: package.json name
  if (!projectId) {
    const pkgPath = path.join(projectRoot, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        if (pkg.name) {
          projectId = sanitizeId(pkg.name);
          identitySource = 'package_json_name';
        }
      } catch {}
    }
  }

  // Priority 5: Git root basename
  if (!projectId) {
    const baseName = path.basename(projectRoot);
    if (baseName && baseName !== '/' && baseName !== '.') {
      projectId = sanitizeId(baseName);
      identitySource = 'git_root_basename';
    }
  }

  // Priority 6: Normalized path hash fallback
  if (!projectId) {
    projectId = pathHashId(projectRoot);
    identitySource = 'path_hash_fallback';
  }

  const identityDigest = stableHash(`${projectId}:${projectRoot}:${identitySource}`);

  const namespaces = {
    kernelStateRoot: path.join(kernelHome, 'state'),
    projectKnowledgeRoot: path.join(kernelHome, 'state', 'projects', projectId, 'knowledge'),
    planExecutionRoot: path.join(kernelHome, 'state', 'projects', projectId, 'execution'),
  };

  return {
    projectId,
    projectRoot,
    identitySource,
    aliases,
    identityDigest,
    namespaces,
  };
}
