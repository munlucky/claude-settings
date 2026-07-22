import { SURFACES } from '../constants.mjs';
import { resolveTrackRoots } from '../paths.mjs';
export function providerParityMatrix({ sourceRoot = process.cwd(), relayHome, kernelHome } = {}) {
  const rows = [];
  for (const surface of SURFACES) {
    const relay = resolveTrackRoots({ track: 'relay', surface, sourceRoot, relayHome, kernelHome });
    const kernel = resolveTrackRoots({ track: 'kernel', surface, sourceRoot, relayHome, kernelHome });
    rows.push({ surface, relayProviderHome: relay.providerHome, kernelProviderHome: kernel.providerHome, disjoint: relay.providerHome !== kernel.providerHome, persistence: surface.endsWith('_cli') ? 'process' : 'surface_scoped', sensitiveContentRead: false });
  }
  return { schemaVersion: 1, status: rows.every((row) => row.disjoint) ? 'passed' : 'blocked', rows, sensitiveContentRead: false };
}
