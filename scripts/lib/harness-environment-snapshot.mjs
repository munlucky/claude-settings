import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const SNAPSHOT_SCHEMA_VERSION = 'moonshot-harness-environment-snapshot.v1';
const REDACTED = '[REDACTED]';
const UNSAFE_VALUE_PATTERN = /(?:sk-[A-Za-z0-9_-]{12,}|ghp_[A-Za-z0-9_]{12,}|xox[baprs]-[A-Za-z0-9-]{12,}|BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY)/;

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

function commandVersion(command, args = ['--version']) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    shell: process.platform === 'win32',
    timeout: 5000,
  });
  const exitCode = result.status ?? (result.error ? 1 : 0);
  const output = `${result.stdout || ''}${result.stderr || ''}`.trim().split(/\r?\n/)[0] || '';
  return {
    available: exitCode === 0,
    version: exitCode === 0 ? output.slice(0, 160) : '',
  };
}

function portablePath(filePath, { root = process.cwd() } = {}) {
  const absolute = path.resolve(filePath || '.');
  const base = path.resolve(root || '.');
  const relative = path.relative(base, absolute);
  if (!relative) return '.';
  if (relative.startsWith('..') || path.isAbsolute(relative)) return path.basename(absolute);
  return relative.split(path.sep).join('/');
}

function isUnsafeKey(key = '') {
  const normalized = String(key).replace(/[^a-z0-9]/gi, '').toLowerCase();
  if (!normalized) return false;
  if (normalized === 'auth' || normalized.startsWith('authpath') || normalized.startsWith('authfile')) return true;
  if (normalized.includes('token') || normalized.includes('secret') || normalized.includes('password')) return true;
  if (normalized.includes('cookie') || normalized.includes('credential')) return true;
  if (normalized.includes('profile') || normalized.includes('transcript')) return true;
  if (normalized.includes('memorygraph') || normalized.includes('memorydump')) return true;
  if (normalized.includes('kgdump') || normalized.includes('knowledgegraphdump')) return true;
  if (normalized.includes('rawlog') || normalized.includes('rawlogs')) return true;
  if (normalized === 'env' || (normalized.startsWith('env') && (
    normalized.includes('secret') || normalized.includes('token') || normalized.includes('password') || normalized.includes('vars')
  ))) return true;
  return false;
}

export function redactUnsafeObject(value, warnings = [], prefix = '') {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) {
    return value.map((entry, index) => redactUnsafeObject(entry, warnings, `${prefix}[${index}]`));
  }
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => {
      const fieldPath = prefix ? `${prefix}.${key}` : key;
      if (isUnsafeKey(key)) {
        warnings.push(`redacted unsafe field ${fieldPath}`);
        return [key, REDACTED];
      }
      return [key, redactUnsafeObject(nested, warnings, fieldPath)];
    }));
  }
  if (typeof value === 'string' && UNSAFE_VALUE_PATTERN.test(value)) {
    warnings.push(`redacted unsafe value at ${prefix || 'value'}`);
    return REDACTED;
  }
  return value;
}

export function buildRedactedEnvironmentSnapshot({
  sourceRoot = process.cwd(),
  runId = '',
  specHash = '',
  extra = {},
  now = new Date(),
} = {}) {
  const warnings = [];
  const sanitizedExtra = redactUnsafeObject(extra, warnings, 'extra');
  const snapshot = {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    createdAt: now.toISOString(),
    runId,
    specHash,
    platform: {
      platform: process.platform,
      arch: process.arch,
      release: os.release(),
    },
    cwd: {
      portablePath: portablePath(process.cwd(), { root: sourceRoot }),
    },
    sourceFingerprint: {
      sourceRoot: portablePath(sourceRoot, { root: sourceRoot }),
      referenceOnly: true,
    },
    tools: {
      node: {
        available: true,
        version: process.version,
      },
      npm: commandVersion('npm'),
      git: commandVersion('git'),
      docker: commandVersion('docker'),
    },
    toolAvailability: {},
    extra: sanitizedExtra,
    redaction: {
      status: warnings.length > 0 ? 'redacted' : 'clean',
      warnings,
    },
    promotionAuthority: false,
  };
  snapshot.toolAvailability = Object.fromEntries(Object.entries(snapshot.tools).map(([key, tool]) => [
    key,
    tool.available === true,
  ]));
  return snapshot;
}

export async function writeEnvironmentSnapshot({
  runRoot,
  sourceRoot = process.cwd(),
  runId = '',
  specHash = '',
  fileName = 'environment-snapshot.json',
  extra = {},
} = {}) {
  if (!runRoot) throw new Error('runRoot is required');
  await mkdir(runRoot, { recursive: true });
  const snapshotPath = path.join(runRoot, fileName);
  const snapshot = buildRedactedEnvironmentSnapshot({ sourceRoot, runId, specHash, extra });
  await writeFile(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`);
  return {
    path: snapshotPath,
    sha256: `sha256:${sha256(await readFile(snapshotPath))}`,
    snapshot,
  };
}

export function snapshotContainsUnsafeContent(snapshot) {
  return UNSAFE_VALUE_PATTERN.test(JSON.stringify(snapshot)) || JSON.stringify(snapshot).includes(process.env.GITHUB_TOKEN || '\u0000');
}
