import path from 'node:path';

import { resolveRuntimeStateRoot } from './runtime-state-root.mjs';

export function defaultPhaseEventLedgerPath(statusFile = '.claude/docs/phase-status.yaml') {
  const resolvedStatus = path.resolve(statusFile);
  const marker = `${path.sep}.claude${path.sep}`;
  const repoRoot = resolvedStatus.includes(marker)
    ? resolvedStatus.slice(0, resolvedStatus.indexOf(marker))
    : process.cwd();
  return path.join(resolveRuntimeStateRoot(repoRoot), 'logs', 'workflow-enforcement', 'events.jsonl');
}
