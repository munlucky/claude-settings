import os from 'node:os';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';

export const RELAY_DEFAULT_HOME = path.join(os.homedir(), '.moonshot-relay');
export const KERNEL_DEFAULT_HOME = path.join(os.homedir(), '.moon-relay-kernel');

export const expandHome = (value, home = os.homedir()) => {
  if (!value) return value;
  if (value === '~') return home;
  if (value.startsWith('~/') || value.startsWith('~\\')) return path.join(home, value.slice(2));
  return path.resolve(value);
};

export const resolveKernelRuntimeHome = ({ env = process.env, home = os.homedir() } = {}) =>
  expandHome(env.MOON_RELAY_KERNEL_HOME || '~/.moon-relay-kernel', home);

export const assertIsolatedRuntimeHomes = (kernelHome, relayHome = RELAY_DEFAULT_HOME) => {
  const kernel = path.resolve(kernelHome);
  const relay = path.resolve(relayHome);
  if (kernel === relay || kernel.startsWith(`${relay}${path.sep}`) || relay.startsWith(`${kernel}${path.sep}`)) {
    throw new Error('Kernel and Relay runtime homes must be isolated');
  }
  return true;
};

export const readProjectTrack = async (startDir = process.cwd()) => {
  let curr = path.resolve(startDir);
  while (true) {
    const marker = path.join(curr, '.moon-relay', 'track.yaml');
    try {
      const text = await readFile(marker, 'utf8');
      const match = text.match(/^track:\s*(relay|kernel)\s*$/m);
      if (match) return match[1];
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    const parent = path.dirname(curr);
    if (parent === curr) break;
    curr = parent;
  }
  return null;
};

export const readProjectTrackSync = (startDir = process.cwd()) => {
  let curr = path.resolve(startDir);
  while (true) {
    const marker = path.join(curr, '.moon-relay', 'track.yaml');
    try {
      const text = readFileSync(marker, 'utf8');
      const match = text.match(/^track:\s*(relay|kernel)\s*$/m);
      if (match) return match[1];
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    const parent = path.dirname(curr);
    if (parent === curr) break;
    curr = parent;
  }
  return null;
};
