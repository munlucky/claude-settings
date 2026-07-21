import os from 'node:os';
import path from 'node:path';
import { readFile } from 'node:fs/promises';

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

export const readProjectTrack = async (projectRoot) => {
  const marker = path.join(projectRoot, '.moon-relay', 'track.yaml');
  try {
    const text = await readFile(marker, 'utf8');
    const match = text.match(/^track:\s*(relay|kernel)\s*$/m);
    return match ? match[1] : null;
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
};
