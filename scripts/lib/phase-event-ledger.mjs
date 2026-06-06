import { resolveRuntimeStatePath } from './runtime-state-root.mjs';

export function defaultPhaseEventLedgerPath(statusFile = resolveRuntimeStatePath('docs', 'phase-status.yaml')) {
  void statusFile;
  return resolveRuntimeStatePath('logs', 'workflow-enforcement', 'events.jsonl');
}
