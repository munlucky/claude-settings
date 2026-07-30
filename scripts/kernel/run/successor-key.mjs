import { createHash } from 'node:crypto';

const required = (value, field) => {
  if (typeof value !== 'string' || value.length === 0) {
    throw Object.assign(new Error('successor_creation_conflict'), {
      code: 'successor_creation_conflict',
      errorCode: 'successor_creation_conflict',
      nextAction: `supply-${field}`,
    });
  }
  return value;
};

export const buildSuccessorKey = ({
  projectId,
  sessionId,
  predecessorRunId,
  workspaceId,
  taskContractDigest,
} = {}) => {
  const identity = {
    projectId: required(projectId, 'project-id'),
    sessionId: required(sessionId, 'session-id'),
    predecessorRunId: required(predecessorRunId, 'predecessor-run-id'),
    workspaceId: required(workspaceId, 'workspace-id'),
    taskContractDigest: required(taskContractDigest, 'task-contract-digest'),
  };
  return `successor-${createHash('sha256').update(JSON.stringify(identity)).digest('hex')}`;
};
