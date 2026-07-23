export function normalizeChangedContract(input = {}) {
  if (!input || typeof input !== 'object') {
    return { changedPaths: [], changedFileCount: 0 };
  }

  const rawPaths = Array.isArray(input.changedPaths)
    ? input.changedPaths
    : Array.isArray(input.changedFiles)
      ? input.changedFiles
      : Array.isArray(input.filesChanged)
        ? input.filesChanged
        : [];

  const changedPaths = rawPaths
    .filter((p) => p && typeof p === 'string')
    .map((p) => p.replace(/\\/g, '/'));

  let changedFileCount = Number.isFinite(input.changedFileCount)
    ? Number(input.changedFileCount)
    : Number.isFinite(input.filesChanged)
      ? Number(input.filesChanged)
      : changedPaths.length;

  if (changedFileCount < changedPaths.length) {
    changedFileCount = changedPaths.length;
  }

  return {
    changedPaths,
    changedFileCount,
  };
}
