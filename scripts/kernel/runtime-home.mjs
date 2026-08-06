import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';

export const RELAY_DEFAULT_HOME = path.join(os.homedir(), '.moonshot-relay');
export const KERNEL_DEFAULT_HOME = path.join(os.homedir(), '.moon-relay-kernel');

// Resolve the physical prefix even when the final target has not been created
// yet.  A lexical path check is not an isolation boundary on macOS/Linux: a
// configured home can be reached through a symlinked parent while the target
// itself is still missing.
export const canonicalPath = (value) => {
  const resolved = path.resolve(value);
  let cursor = resolved;
  const suffix = [];
  while (true) {
    try {
      const physical = fs.realpathSync.native(cursor);
      return path.join(physical, ...suffix.reverse());
    } catch (error) {
      if (!['ENOENT', 'ENOTDIR'].includes(error?.code)) throw error;
      const parent = path.dirname(cursor);
      if (parent === cursor) return resolved;
      suffix.push(path.basename(cursor));
      cursor = parent;
    }
  }
};

export const expandHome = (value, home = os.homedir()) => {
  if (!value) return value;
  if (value === '~') return canonicalPath(home);
  if (value.startsWith('~/') || value.startsWith('~\\')) return canonicalPath(path.join(home, value.slice(2)));
  return canonicalPath(value);
};

export const resolveKernelRuntimeHome = ({ env = process.env, home = os.homedir() } = {}) =>
  expandHome(env.MOON_RELAY_KERNEL_HOME || '~/.moon-relay-kernel', home);

export const assertIsolatedRuntimeHomes = (kernelHome, relayHome = RELAY_DEFAULT_HOME) => {
  const kernel = canonicalPath(kernelHome);
  const relay = canonicalPath(relayHome);
  if (kernel === relay || kernel.startsWith(`${relay}${path.sep}`) || relay.startsWith(`${kernel}${path.sep}`)) {
    throw new Error('Kernel and Relay runtime homes must be isolated');
  }
  return true;
};

const TRACK_PATTERN = /^track:\s*(relay|kernel)\s*$/m;
const VALID_TRACKS = new Set(['relay', 'kernel']);

// The switcher establishes the active track process-scoped: when it launches a
// surface it exports MOON_RELAY_TRACK (see switcher/launch-adapter.mjs) rather
// than writing anything into the workspace. Honouring that variable is what
// lets a Kernel session run in a project that carries no marker file at all.
//
// A marker still wins when present: it is an explicit, durable declaration by
// the repository, and an ambient session variable must not override a project
// that has pinned itself to the other track.
const trackFromEnv = (env) => {
  const value = String(env?.MOON_RELAY_TRACK || '').trim();
  return VALID_TRACKS.has(value) ? value : null;
};

const markerChain = (startDir) => {
  const chain = [];
  let curr = path.resolve(startDir);
  while (true) {
    chain.push(path.join(curr, '.moon-relay', 'track.yaml'));
    const parent = path.dirname(curr);
    if (parent === curr) break;
    curr = parent;
  }
  return chain;
};

export const readProjectTrack = async (startDir = process.cwd(), { env = process.env } = {}) => {
  for (const marker of markerChain(startDir)) {
    try {
      const match = (await readFile(marker, 'utf8')).match(TRACK_PATTERN);
      if (match) return match[1];
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return trackFromEnv(env);
};

export const readProjectTrackSync = (startDir = process.cwd(), { env = process.env } = {}) => {
  for (const marker of markerChain(startDir)) {
    try {
      const match = readFileSync(marker, 'utf8').match(TRACK_PATTERN);
      if (match) return match[1];
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return trackFromEnv(env);
};
