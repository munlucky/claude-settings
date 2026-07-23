import { validateSupersession } from './records.mjs';

export function applySupersessions({ currentFacts = [], supersessionProposals = [], projectId }) {
  const updatedFacts = [...currentFacts];
  const supersessionLogEntries = [];

  for (const prop of supersessionProposals) {
    validateSupersession(updatedFacts, prop.targetId, prop.supersedingId, { currentProjectId: projectId });
    const targetIdx = updatedFacts.findIndex((f) => f.id === prop.targetId);
    if (targetIdx >= 0) {
      updatedFacts[targetIdx] = {
        ...updatedFacts[targetIdx],
        status: 'superseded',
        updatedAt: new Date().toISOString(),
      };
      supersessionLogEntries.push({
        targetId: prop.targetId,
        supersedingId: prop.supersedingId,
        timestamp: new Date().toISOString(),
        reason: prop.reason || 'superseded_by_candidate',
      });
    }
  }

  return { updatedFacts, supersessionLogEntries };
}
