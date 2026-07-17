import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';

export function validateManifest(manifest) {
  if (!manifest || typeof manifest !== 'object') {
    throw new Error('Invalid manifest');
  }
  if (manifest.schemaVersion !== 1) {
    throw new Error('Invalid schemaVersion');
  }
  if (typeof manifest.platform !== 'string') {
    throw new Error('platform must be a string');
  }
  if (typeof manifest.arch !== 'string') {
    throw new Error('arch must be a string');
  }
  if (typeof manifest.version !== 'string') {
    throw new Error('version must be a string');
  }
  if (typeof manifest.checksum !== 'string' || !/^[a-f0-9]{64}$/.test(manifest.checksum)) {
    throw new Error('checksum must be a 64-char hex string');
  }
  return true;
}

function calculateFileSha256(filePath) {
  try {
    const content = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(content).digest('hex');
  } catch {
    return null;
  }
}

export function resolveRuntimeNode(options = {}) {
  const env = options.env || process.env;
  const homeDir = options.homeDir || env.MOONSHOT_RELAY_HOME || path.join(os.homedir(), '.moonshot-relay');
  const targetPlatform = options.platform || process.platform;
  const targetArch = options.arch || process.arch;

  // 1. Check MOONSHOT_RELAY_RUNTIME_NODE env override
  if (env.MOONSHOT_RELAY_RUNTIME_NODE) {
    return {
      execPath: env.MOONSHOT_RELAY_RUNTIME_NODE,
      source: 'env_override',
      platform: targetPlatform,
      arch: targetArch,
      version: 'custom',
      checksumStatus: 'skipped'
    };
  }

  // 2. Resolve managed runtime paths
  const runtimeCurrentDir = path.join(homeDir, 'runtime', 'current');
  const winPath = path.join(runtimeCurrentDir, 'node.exe');
  const unixPath = path.join(runtimeCurrentDir, 'bin', 'node');

  let execPath = null;
  if (targetPlatform === 'win32') {
    if (fs.existsSync(winPath)) {
      execPath = winPath;
    } else if (fs.existsSync(unixPath)) {
      execPath = unixPath;
    }
  } else {
    if (fs.existsSync(unixPath)) {
      execPath = unixPath;
    } else if (fs.existsSync(winPath)) {
      execPath = winPath;
    }
  }

  if (execPath) {
    // Read manifest
    // Check current dir or parent runtime dir
    let manifestPath = path.join(runtimeCurrentDir, 'runtime-manifest.json');
    if (!fs.existsSync(manifestPath)) {
      manifestPath = path.join(homeDir, 'runtime', 'runtime-manifest.json');
    }

    let manifest = null;
    if (fs.existsSync(manifestPath)) {
      try {
        manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        validateManifest(manifest);
      } catch (err) {
        const error = new Error(`Invalid manifest file: ${err.message}`);
        error.code = 'invalid_manifest';
        throw error;
      }
    }

    if (manifest) {
      if (manifest.platform !== targetPlatform) {
        const error = new Error(`Platform mismatch: manifest expects ${manifest.platform}, target is ${targetPlatform}`);
        error.code = 'invalid_platform';
        throw error;
      }
      if (manifest.arch !== targetArch) {
        const error = new Error(`Arch mismatch: manifest expects ${manifest.arch}, target is ${targetArch}`);
        error.code = 'invalid_arch';
        throw error;
      }
      
      const fileHash = calculateFileSha256(execPath);
      if (fileHash !== manifest.checksum) {
        const error = new Error(`Checksum mismatch: file has ${fileHash}, manifest expects ${manifest.checksum}`);
        error.code = 'checksum_mismatch';
        throw error;
      }

      return {
        execPath,
        source: 'managed_runtime',
        platform: targetPlatform,
        arch: targetArch,
        version: manifest.version,
        checksumStatus: 'verified'
      };
    }

    return {
      execPath,
      source: 'managed_runtime',
      platform: targetPlatform,
      arch: targetArch,
      version: 'unknown',
      checksumStatus: 'missing_manifest'
    };
  }

  // 3. System Node Fallback
  if (env.MOONSHOT_RELAY_SYSTEM_NODE_FALLBACK === '1') {
    return {
      execPath: process.execPath,
      source: 'system_fallback',
      platform: targetPlatform,
      arch: targetArch,
      version: process.version,
      checksumStatus: 'skipped'
    };
  }

  const error = new Error('Managed runtime is missing and system fallback is disabled.');
  error.code = 'missing_runtime';
  throw error;
}
