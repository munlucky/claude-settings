import { SURFACES, KERNEL_RUNTIME_ID } from '../constants.mjs';
import { pathsOverlap, resolveSurfaceRoots } from '../paths.mjs';

export function providerParityMatrix({ sourceRoot = process.cwd(), kernelHome, baseEnv = process.env, platform = process.platform } = {}) {
  const rows = SURFACES.map((surface) => {
    const roots = resolveSurfaceRoots({ surface, sourceRoot, kernelHome, baseEnv, platform });
    return {
      surface,
      runtime: KERNEL_RUNTIME_ID,
      runtimeHome: roots.runtimeHome,
      providerHome: roots.providerHome,
      appDataRoot: roots.appDataRoot || null,
      nativeProviderHome: true,
      disjoint: !pathsOverlap(roots.runtimeHome, roots.providerHome),
      persistence: surface.endsWith('_cli') ? 'process' : 'surface_scoped',
      sensitiveContentRead: false,
    };
  });
  return {
    schemaVersion: 1,
    runtime: KERNEL_RUNTIME_ID,
    status: rows.every((row) => row.disjoint && row.nativeProviderHome) ? 'passed' : 'blocked',
    rows,
    sensitiveContentRead: false,
  };
}
