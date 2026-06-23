export const assessWorkspaceLeaseReturn = ({
  gitStatusShort = '',
  secretFindings = [],
  untrackedAllowed = false,
} = {}) => {
  const lines = String(gitStatusShort || '').split(/\r?\n/).filter(Boolean);
  const dirtyLines = lines.filter((line) => {
    if (untrackedAllowed && line.startsWith('??')) return false;
    return true;
  });
  const blockers = [
    ...dirtyLines.map((line) => ({ type: 'dirty_workspace', detail: line })),
    ...secretFindings.map((finding) => ({ type: 'secret_finding', detail: finding })),
  ];
  return {
    status: blockers.length > 0 ? 'blocked' : 'safe_to_return',
    destructiveCleanupAllowed: false,
    blockers,
  };
};
