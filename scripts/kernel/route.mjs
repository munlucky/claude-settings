import { floorForSurface } from './risk-surfaces.mjs';
import { readProjectTrackSync } from './runtime-home.mjs';
import { resolveKernelCapabilities } from './capability-resolver.mjs';

const rank = { T0: 0, T1: 1, T2: 2, T3: 3 };

export const classifyRisk = (task = {}) => {
  let tier = task.behaviorChanging ? 'T1' : 'T0';
  if (task.taskClass === 'long-running' || task.filesChanged > 8) tier = 'T2';
  for (const surface of task.surfaces || []) {
    const floor = floorForSurface(surface);
    if (floor && rank[tier] < rank[floor]) tier = floor;
  }
  return tier;
};

// SHAPE is inserted only when the task touches a contract, boundary, or
// hard-to-reverse decision — never as a default step for ordinary features.
const SHAPE_SIGNAL_FLAGS = Object.freeze([
  'publicContract',
  'securityBoundary',
  'authBoundary',
  'dataMigration',
  'migration',
  'dataStorageChange',
  'externalIntegration',
  'componentBoundaryChange',
  'irreversibleDecision',
]);

export const needsShape = (task = {}) => {
  if ((task.surfaces || []).some((surface) => floorForSurface(surface))) return true;
  if (SHAPE_SIGNAL_FLAGS.some((flag) => task[flag] === true)) return true;
  if (task.risk && typeof task.risk === 'object' && SHAPE_SIGNAL_FLAGS.some((flag) => task.risk[flag] === true)) return true;
  return false;
};

export const routeTask = (task = {}, { projectRoot = process.cwd() } = {}) => {
  const effectiveTrack = readProjectTrackSync(projectRoot);
  if (effectiveTrack !== 'kernel') return { status: 'wrong_harness', requestedTrack: 'kernel', activeTrack: effectiveTrack || 'unknown', route: [] };
  const riskTier = task.riskTier || classifyRisk(task);
  const taskClass = task.taskClass || 'feature';
  let route;
  if (taskClass === 'analysis') route = ['FRAME', 'CLOSE'];
  else if (taskClass === 'long-running' || task.complex === true) route = ['FRAME', 'SHAPE', 'SLICE', 'SCHEDULE', 'EXECUTE', 'PROVE', 'CLOSE'];
  else if (needsShape(task)) route = ['FRAME', 'SHAPE', 'EXECUTE', 'PROVE', 'CLOSE'];
  else route = ['FRAME', 'EXECUTE', 'PROVE', 'CLOSE'];
  const capabilityDecision = resolveKernelCapabilities({ ...task, taskClass, riskTier, route });
  return { status: 'ready', taskClass, riskTier, ambiguity: Boolean(task.ambiguityChangesOutcome), capabilities: capabilityDecision.selected.map((entry) => entry.id), capabilityDecision, route };
};
