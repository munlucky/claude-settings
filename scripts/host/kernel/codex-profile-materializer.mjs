// Codex profile materializer (Wave 6.3). Kernel routing needs its own Codex
// configuration, but the user's global `~/.codex/config.toml` is theirs: writing
// into it would make a Kernel run change how every unrelated Codex session
// behaves. The profiles are materialized under the Kernel runtime home instead.
//
// Each profile is a separate `<profile>.config.toml` overlay rather than a
// `[profiles.*]` block, so one profile can be rolled back on its own.

import path from 'node:path';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolveKernelRuntimeHome } from '../../kernel/runtime-home.mjs';
import { CODEX_MODELS } from './codex-model-policy.mjs';

export const CODEX_PROFILE_NAMES = Object.freeze(['default', 'plan', 'review', 'batch']);

const FILE_FOR_PROFILE = Object.freeze({
  default: 'config.toml',
  plan: 'plan.config.toml',
  review: 'review.config.toml',
  batch: 'batch.config.toml',
});

export const CODEX_PROFILE_SETTINGS = Object.freeze({
  default: Object.freeze({
    model: CODEX_MODELS.terra,
    model_reasoning_effort: 'medium',
    model_verbosity: 'low',
    approval_policy: 'on-request',
    sandbox_mode: 'workspace-write',
    network_access: false,
  }),
  plan: Object.freeze({
    model: CODEX_MODELS.sol,
    model_reasoning_effort: 'high',
    model_verbosity: 'medium',
    approval_policy: 'on-request',
    sandbox_mode: 'workspace-write',
    network_access: false,
  }),
  review: Object.freeze({
    model: CODEX_MODELS.sol,
    model_reasoning_effort: 'xhigh',
    model_verbosity: 'medium',
    approval_policy: 'on-request',
    // A reviewer that can write is not an independent reviewer.
    sandbox_mode: 'read-only',
    network_access: false,
  }),
  batch: Object.freeze({
    model: CODEX_MODELS.luna,
    model_reasoning_effort: 'low',
    model_verbosity: 'low',
    approval_policy: 'on-request',
    sandbox_mode: 'workspace-write',
    network_access: false,
  }),
});

const tomlValue = (value) => (typeof value === 'string' ? JSON.stringify(value) : String(value));

export const renderCodexProfileToml = (profile) => {
  const settings = CODEX_PROFILE_SETTINGS[profile];
  if (!settings) throw new Error(`Unknown Codex profile: ${profile}`);
  const { network_access: networkAccess, ...top } = settings;
  const lines = [
    `# Moon Relay Kernel Codex profile: ${profile}`,
    '# Materialized by the Kernel Host. Do not edit; the user global config is separate.',
    '',
    ...Object.entries(top).map(([key, value]) => `${key} = ${tomlValue(value)}`),
    '',
    '[sandbox_workspace_write]',
    `network_access = ${tomlValue(networkAccess)}`,
    '',
  ];
  return lines.join('\n');
};

export const resolveCodexProfileDir = ({ runtimeHome = null, env = process.env } = {}) =>
  path.join(runtimeHome || resolveKernelRuntimeHome({ env }), 'codex');

export const resolveCodexProfilePath = (profile, options = {}) => {
  const file = FILE_FOR_PROFILE[profile];
  if (!file) throw new Error(`Unknown Codex profile: ${profile}`);
  return path.join(resolveCodexProfileDir(options), file);
};

export const materializeCodexProfiles = async ({ runtimeHome = null, env = process.env, profiles = CODEX_PROFILE_NAMES } = {}) => {
  const dir = resolveCodexProfileDir({ runtimeHome, env });
  await mkdir(dir, { recursive: true });
  const written = [];
  for (const profile of profiles) {
    const file = resolveCodexProfilePath(profile, { runtimeHome, env });
    await writeFile(file, renderCodexProfileToml(profile), 'utf8');
    written.push({ profile, path: file });
  }
  return Object.freeze({ schemaVersion: 1, runtimeHome: dir, written: Object.freeze(written) });
};

export const readCodexProfile = async (profile, options = {}) => readFile(resolveCodexProfilePath(profile, options), 'utf8');

// A materialized profile that resolves anywhere inside the user's global Codex
// home is an isolation failure, not a configuration choice.
export const assertCodexProfileIsolation = (profilePath, { userCodexHome = null, env = process.env } = {}) => {
  const globalHome = path.resolve(userCodexHome || path.join(env.USERPROFILE || env.HOME || '', '.codex'));
  const target = path.resolve(profilePath);
  if (target === globalHome || target.startsWith(`${globalHome}${path.sep}`)) {
    throw new Error(`Kernel Codex profile must not be materialized inside the user global Codex home: ${target}`);
  }
  return true;
};
