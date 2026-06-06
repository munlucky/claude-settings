import path from 'node:path';

import { resolveRuntimeStatePath } from './runtime-state-root.mjs';

export function resolveDbPath(dbPath = process.env.PHASE_RUNTIME_DB || '') {
  return dbPath ? path.resolve(dbPath) : resolveRuntimeStatePath('runtime-state.sqlite');
}
