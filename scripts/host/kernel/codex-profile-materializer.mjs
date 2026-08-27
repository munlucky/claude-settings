// Codex profile materializer (Wave 6.3). Kernel routing needs its own Codex
// configuration, but the user's global `~/.codex/config.toml` is theirs: writing
// into it would make a Kernel run change how every unrelated Codex session
// behaves. The profiles are materialized under the Kernel runtime home instead.
//
// Each profile is a separate `<profile>.config.toml` overlay rather than a
// `[profiles.*]` block, so one profile can be rolled back on its own.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolveKernelRuntimeHome } from '../../kernel/runtime-home.mjs';
import { CODEX_MODELS } from './codex-model-policy.mjs';
import { resolveKernelCodexProviderHome } from './codex-runtime.mjs';

export const CODEX_PROFILE_NAMES = Object.freeze(['default', 'plan', 'review', 'batch']);
export const CODEX_PROVIDER_HOME_MISMATCH = 'codex_provider_home_mismatch';

const FILE_FOR_PROFILE = Object.freeze({
  default: 'config.toml',
  plan: 'plan.config.toml',
  review: 'review.config.toml',
  batch: 'batch.config.toml',
});

// The Codex CLI reads AGENTS.md from the project's own working-directory
// tree, not from a Host runtime-home config location, so materializing it
// here alongside the four TOMLs completes this module's output (all five
// files the Kernel Codex profile names) without pretending that alone gets
// it loaded by a real Codex session. Installing it into an actual project's
// `.codex/`/root is a Kernel profile-packaging concern
// (`package/kernel/profiles/codex`, referenced by profile-install.mjs) that
// has no build step in this repository yet — a tracked follow-up, not
// something this materializer can complete on its own.
const PACKAGED_AGENTS_MD = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'package', 'profile-templates', 'codex', 'AGENTS.md');

export const CODEX_PROFILE_SETTINGS = Object.freeze({
  default: Object.freeze({
    model: CODEX_MODELS.luna,
    model_reasoning_effort: 'max',
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
    model_reasoning_effort: 'high',
    model_verbosity: 'medium',
    approval_policy: 'on-request',
    // A reviewer that can write is not an independent reviewer.
    sandbox_mode: 'read-only',
    network_access: false,
  }),
  batch: Object.freeze({
    model: CODEX_MODELS.luna,
    model_reasoning_effort: 'max',
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
  resolveKernelCodexProviderHome(runtimeHome || resolveKernelRuntimeHome({ env }));

export const resolveCodexProfilePath = (profile, options = {}) => {
  const file = FILE_FOR_PROFILE[profile];
  if (!file) throw new Error(`Unknown Codex profile: ${profile}`);
  return path.join(resolveCodexProfileDir(options), file);
};

export const materializeCodexProfiles = async ({ runtimeHome = null, env = process.env, profiles = CODEX_PROFILE_NAMES, includeAgentsMd = true } = {}) => {
  const dir = resolveCodexProfileDir({ runtimeHome, env });
  // A caller may use an isolated temporary runtimeHome while the parent
  // process still carries the real Host's CODEX_HOME. Only enforce the pair
  // when the environment explicitly belongs to this runtime; otherwise an
  // ambient parent variable would make valid fixture isolation fail closed.
  const effectiveRuntimeHome = path.resolve(runtimeHome || resolveKernelRuntimeHome({ env }));
  const ownedRuntimeHome = env?.MOON_RELAY_KERNEL_HOME
    ? path.resolve(env.MOON_RELAY_KERNEL_HOME)
    : null;
  if (ownedRuntimeHome === effectiveRuntimeHome) assertCodexProviderHome(dir, { env });
  // The isolation check exists specifically to catch a caller-supplied
  // runtimeHome that resolves inside the user's global Codex home; it must
  // run before any directory is created or file written, not just live as an
  // assertion its own unit test calls directly.
  assertCodexProfileIsolation(dir, { env });
  await mkdir(dir, { recursive: true });
  const written = [];
  for (const profile of profiles) {
    const file = resolveCodexProfilePath(profile, { runtimeHome, env });
    await writeFile(file, renderCodexProfileToml(profile), 'utf8');
    written.push({ profile, path: file });
  }
  if (includeAgentsMd) {
    const agentsMdPath = path.join(dir, 'AGENTS.md');
    await writeFile(agentsMdPath, await readFile(PACKAGED_AGENTS_MD, 'utf8'), 'utf8');
    written.push({ profile: 'agents-md', path: agentsMdPath });
  }
  return Object.freeze({ schemaVersion: 1, runtimeHome: dir, written: Object.freeze(written) });
};

export const readCodexProfile = async (profile, options = {}) => readFile(resolveCodexProfilePath(profile, options), 'utf8');

const providerHomeMismatchError = ({ profileRoot, codexHome }) => Object.assign(
  new Error(`Kernel Codex profile root does not match CODEX_HOME: profileRoot=${profileRoot}; CODEX_HOME=${codexHome}`),
  {
    code: CODEX_PROVIDER_HOME_MISMATCH,
    errorCode: CODEX_PROVIDER_HOME_MISMATCH,
    details: { profileRoot, codexHome },
  },
);

export const assertCodexProviderHome = (profilePath, { env = process.env } = {}) => {
  const explicitCodexHome = env?.CODEX_HOME;
  if (!explicitCodexHome) return true;
  const profileRoot = path.resolve(profilePath);
  const codexHome = path.resolve(explicitCodexHome);
  if (profileRoot !== codexHome) throw providerHomeMismatchError({ profileRoot, codexHome });
  return true;
};

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
