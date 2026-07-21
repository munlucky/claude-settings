import { isHighRiskSurface } from './risk-surfaces.mjs';

export const classifyRisk = (task = {}) => {
  const surfaces = task.surfaces || [];
  if (surfaces.some((v) => isHighRiskSurface(v))) return 'T3';
  if (task.taskClass === 'long-running' || task.filesChanged > 8) return 'T2';
  if (task.behaviorChanging) return 'T1';
  return 'T0';
};

export const routeTask = (task = {}, { activeTrack = task.activeTrack } = {}) => {
  if (activeTrack !== 'kernel') return { status: 'wrong_harness', requestedTrack: 'kernel', activeTrack: activeTrack || 'unknown', route: [] };
  const riskTier = task.riskTier || classifyRisk(task);
  const taskClass = task.taskClass || 'feature';
  let route;
  if (taskClass === 'analysis') route = ['FRAME', 'CLOSE'];
  else if (riskTier === 'T0') route = ['FRAME', 'EXECUTE', 'PROVE', 'CLOSE'];
  else if (taskClass === 'long-running' || task.complex === true) route = ['FRAME', 'SHAPE', 'SLICE', 'SCHEDULE', 'EXECUTE', 'PROVE', 'CLOSE'];
  else route = ['FRAME', 'SHAPE', 'EXECUTE', 'PROVE', 'CLOSE'];
  return { status: 'ready', taskClass, riskTier, ambiguity: Boolean(task.ambiguityChangesOutcome), capabilities: task.capabilities || [], route };
};
