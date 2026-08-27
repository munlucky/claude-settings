import { execFile } from 'node:child_process';
import { access, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { resolveCommand } from '../../switcher/app-resolver/common.mjs';

const execFileAsync = promisify(execFile);
const DEFAULT_CODEX_EXECUTABLE = process.platform === 'win32' ? 'codex.ps1' : 'codex';
const CODEX_VERSION_PATTERN = /(?:^|\s)(?:codex-cli\s+)?v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)/i;

// These values belong to the Codex application host, not to a standalone
// child CLI. Inheriting them makes a CLI process look like an app child even
// though it has no native Host bridge or pipe capability.
export const CODEX_APP_HOST_ENV_KEYS = Object.freeze([
  'CODEX_MCP_NODE_PATH',
  'CODEX_THREAD_ID',
  'CODEX_SESSION_ID',
  'CODEX_INTERNAL_ORIGINATOR_OVERRIDE',
  'CODEX_PERMISSION_PROFILE',
  'CODEX_SHELL',
]);

const isKernelBindingKey = (key) => key === 'MOON_RELAY_TRACK' || key.startsWith('MOON_RELAY_KERNEL_');

const runtimeError = (code, message, details = {}) => Object.assign(new Error(message), {
  code,
  errorCode: code,
  details,
});

export const sanitizeCodexChildEnvironment = (env = process.env) => Object.fromEntries(
  Object.entries(env || {}).filter(([key]) => (
    !key.startsWith('CODEX_APP_')
    && !CODEX_APP_HOST_ENV_KEYS.includes(key)
    && !isKernelBindingKey(key)
  )),
);

export const buildCodexChildEnvironment = ({ env = process.env, executable = null, codexHome = null } = {}) => {
  const childEnv = sanitizeCodexChildEnvironment(env);
  const effectiveHome = codexHome || env?.CODEX_HOME || null;
  if (effectiveHome) childEnv.CODEX_HOME = path.resolve(effectiveHome);
  if (executable) childEnv.CODEX_EXECUTABLE = executable;
  return childEnv;
};

export const resolveKernelCodexProviderHome = (runtimeHome) => {
  if (!runtimeHome) throw new Error('kernel_codex_provider_home_requires_runtime_home');
  return path.resolve(runtimeHome, 'providers', 'codex');
};

export const buildKernelCodexHostEnvironment = ({ runtimeHome, env = process.env, executable } = {}) => {
  if (!runtimeHome) throw new Error('kernel_codex_host_environment_requires_runtime_home');
  if (!executable) throw new Error('kernel_codex_host_environment_requires_executable');
  const resolvedRuntimeHome = path.resolve(runtimeHome);
  const providerHome = resolveKernelCodexProviderHome(resolvedRuntimeHome);
  const inheritedPath = env?.PATH || env?.Path || '';
  const kernelBin = path.join(resolvedRuntimeHome, 'bin');
  const result = {
    ...env,
    MOON_RELAY_KERNEL_HOME: resolvedRuntimeHome,
    MOON_RELAY_KERNEL_SURFACE: 'codex_cli',
    PATH: [kernelBin, inheritedPath].filter(Boolean).join(path.delimiter),
    CODEX_HOME: providerHome,
    CODEX_EXECUTABLE: executable,
  };
  if (env?.Path !== undefined) result.Path = result.PATH;
  return result;
};

export const parseCodexVersion = (value) => {
  const raw = String(value || '').trim();
  const match = raw.match(CODEX_VERSION_PATTERN);
  if (!match) return null;
  const version = match[1];
  const release = version.split('-')[0].split('.').map(Number);
  return Object.freeze({ raw, version, release });
};

const versionProbeOutput = (value) => {
  if (typeof value === 'string') return value;
  return [value?.version, value?.stdout, value?.stderr].filter(Boolean).join('\n');
};

export const probeCodexExecutableVersion = async ({ executable, env = process.env, timeoutMs = 5000 } = {}) => {
  if (!executable) throw runtimeError('codex_executable_missing', 'Codex executable is required for version probing');
  const childEnv = buildCodexChildEnvironment({ env, executable });
  const windowsScript = process.platform === 'win32' && path.extname(executable).toLowerCase() === '.ps1';
  const command = windowsScript ? 'powershell.exe' : executable;
  const args = windowsScript
    ? ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', executable, '--version']
    : ['--version'];
  try {
    return versionProbeOutput(await execFileAsync(command, args, {
      env: childEnv,
      windowsHide: true,
      timeout: timeoutMs,
      maxBuffer: 64 * 1024,
    }));
  } catch (error) {
    throw runtimeError(
      'codex_cli_version_probe_failed',
      `Unable to read Codex CLI version from ${executable}: ${error?.message || String(error)}`,
      { executable },
    );
  }
};

const cachePathFor = (codexHome) => path.join(path.resolve(codexHome), 'models_cache.json');

const readModelsCacheVersion = async ({ codexHome, readFileImpl = readFile } = {}) => {
  const cachePath = cachePathFor(codexHome);
  let raw;
  try {
    raw = await readFileImpl(cachePath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return { status: 'skipped', reason: 'models-cache-missing', cachePath };
    throw runtimeError(
      'codex_models_cache_read_failed',
      `Unable to read Codex models cache ${cachePath}: ${error?.message || String(error)}`,
      { cachePath },
    );
  }
  let cache;
  try {
    cache = JSON.parse(String(raw));
  } catch (error) {
    throw runtimeError(
      'codex_models_cache_invalid',
      `Codex models cache is not valid JSON: ${cachePath}`,
      { cachePath, cause: error?.message || String(error) },
    );
  }
  const clientVersion = cache && typeof cache === 'object' && !Array.isArray(cache)
    ? cache.client_version
    : null;
  const models = cache && typeof cache === 'object' && !Array.isArray(cache) ? cache.models : null;
  if (typeof clientVersion !== 'string' || !parseCodexVersion(clientVersion) || !Array.isArray(models)) {
    throw runtimeError(
      'codex_models_cache_invalid',
      `Codex models cache has an incompatible top-level schema: ${cachePath}`,
      { cachePath, clientVersion: clientVersion ?? null, modelsArray: Array.isArray(models) },
    );
  }
  return { status: 'available', cachePath, clientVersion, cacheVersion: parseCodexVersion(clientVersion), modelCount: models.length };
};

export const preflightCodexRuntime = async ({
  executable,
  codexHome,
  env = process.env,
  versionProbe = probeCodexExecutableVersion,
  readFileImpl = readFile,
} = {}) => {
  if (!codexHome) {
    return Object.freeze({
      status: 'skipped',
      reason: 'codex-home-not-specified',
      executable: executable || null,
    });
  }
  if (!executable) throw runtimeError('codex_executable_missing', 'Codex executable is required for runtime preflight');
  const providerHome = path.resolve(codexHome);
  const cache = await readModelsCacheVersion({ codexHome: providerHome, readFileImpl });
  if (cache.status === 'skipped') {
    return Object.freeze({
      status: 'skipped',
      reason: cache.reason,
      executable,
      providerHome,
      cachePath: cache.cachePath,
    });
  }
  let executableOutput;
  try {
    executableOutput = await versionProbe({ executable, env, codexHome: providerHome });
  } catch (error) {
    if (error?.code) throw error;
    throw runtimeError(
      'codex_cli_version_probe_failed',
      `Unable to read Codex CLI version from ${executable}: ${error?.message || String(error)}`,
      { executable, providerHome },
    );
  }
  const executableVersion = parseCodexVersion(versionProbeOutput(executableOutput));
  if (!executableVersion) {
    throw runtimeError(
      'codex_cli_version_unreadable',
      `Codex CLI did not report a parseable version: ${executable}`,
      { executable, providerHome, output: versionProbeOutput(executableOutput).slice(0, 256) },
    );
  }
  const compatible = cache.cacheVersion.release.every((part, index) => part === executableVersion.release[index]);
  if (!compatible) {
    throw runtimeError(
      'codex_runtime_version_mismatch',
      `Codex CLI ${executableVersion.version} is incompatible with models cache ${cache.clientVersion} in ${providerHome}`,
      {
        executable,
        providerHome,
        cachePath: cache.cachePath,
        cacheClientVersion: cache.clientVersion,
        executableVersion: executableVersion.version,
      },
    );
  }
  return Object.freeze({
    status: 'verified',
    compatibility: 'release-line',
    executable,
    providerHome,
    cachePath: cache.cachePath,
    cacheClientVersion: cache.clientVersion,
    executableVersion: executableVersion.version,
    modelCount: cache.modelCount,
  });
};

const defaultMacOsCodexCandidates = (roots) => roots.flatMap((root) => [
  path.join(root, 'ChatGPT.app', 'Contents', 'Resources', 'codex'),
  path.join(root, 'ChatGPT.app', 'Contents', 'Resources', 'bin', 'codex'),
  path.join(root, 'Codex.app', 'Contents', 'Resources', 'codex'),
  path.join(root, 'Codex.app', 'Contents', 'Resources', 'bin', 'codex'),
]);

const defaultExists = async (candidate) => {
  try {
    await access(candidate);
    return true;
  } catch {
    return false;
  }
};

export const resolveCodexCliExecutable = async ({
  env = process.env,
  platform = process.platform,
  commandResolver = resolveCommand,
  appRoots = ['/Applications', path.join(os.homedir(), 'Applications')],
  existsImpl = defaultExists,
} = {}) => {
  const configured = env?.CODEX_EXECUTABLE || null;
  if (configured) {
    const configuredCandidate = path.isAbsolute(configured) ? configured : await commandResolver(configured);
    if (configuredCandidate && await existsImpl(configuredCandidate)) return Object.freeze({ executable: path.resolve(configuredCandidate), source: 'operator-env' });
    throw runtimeError(
      'codex_executable_not_found',
      `Configured Codex executable was not found: ${configured}`,
      { configuredExecutable: configured },
    );
  }
  if (platform === 'darwin') {
    const bundled = await defaultMacOsCodexCandidates(appRoots).reduce(async (previous, candidate) => {
      const found = await previous;
      return found || (await existsImpl(candidate) ? path.resolve(candidate) : null);
    }, Promise.resolve(null));
    if (bundled) return Object.freeze({ executable: bundled, source: 'bundled-app-cli' });
  }
  const resolved = await commandResolver(DEFAULT_CODEX_EXECUTABLE === 'codex.ps1' ? 'codex.ps1' : 'codex');
  if (resolved && await existsImpl(resolved)) return Object.freeze({ executable: path.resolve(resolved), source: 'path' });
  throw runtimeError('codex_executable_not_found', 'No usable Codex CLI executable was found', { platform });
};
