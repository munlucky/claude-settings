import process from 'node:process';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { createKernelControlPlane } from '../control-plane.mjs';
import { resolveKernelWorktreeIdentity } from '../run/worktree-binding.mjs';
import { resolveKernelRuntimeHome } from '../runtime-home.mjs';

const MCP_PROTOCOL_VERSION = '2024-11-05';
const SERVER_NAME = 'moon-relay-kernel-bridge';
const SERVER_VERSION = '0.1.0';

export const KERNEL_MCP_TOOLS = [
  {
    name: 'kernel_attach',
    description: 'Attach native harness surface to Moon Relay Kernel Run for the workspace.',
    inputSchema: {
      type: 'object',
      properties: {
        workspaceRoot: { type: 'string', description: 'Canonical workspace root directory' },
        contractJson: { type: 'object', description: 'Task contract JSON to bootstrap or match' },
        runId: { type: 'string', description: 'Explicit run id to attach to' },
        surface: { type: 'string', description: 'Surface identifier (e.g. codex_app, claude_app, qwen_code_cli)' },
      },
      required: ['workspaceRoot'],
    },
  },
  {
    name: 'kernel_next',
    description: 'Fetch the next bounded work unit, context capsule, and task contract from Moon Relay Kernel.',
    inputSchema: {
      type: 'object',
      properties: {
        workspaceRoot: { type: 'string', description: 'Canonical workspace root directory' },
        contractJson: { type: 'object', description: 'Task contract JSON for contract-first bootstrapping' },
        runId: { type: 'string', description: 'Explicit run id' },
        surface: { type: 'string', description: 'Surface identifier' },
      },
      required: ['workspaceRoot'],
    },
  },
  {
    name: 'kernel_report',
    description: 'Submit work unit completion, changed files, evidence, and observations to Moon Relay Kernel.',
    inputSchema: {
      type: 'object',
      properties: {
        workspaceRoot: { type: 'string', description: 'Canonical workspace root directory' },
        runId: { type: 'string', description: 'Explicit run id' },
        report: { type: 'object', description: 'Structured report payload' },
        surface: { type: 'string', description: 'Surface identifier' },
      },
      required: ['workspaceRoot', 'report'],
    },
  },
  {
    name: 'kernel_status',
    description: 'Inspect current Run status, worktree mutation lease, and pending obligations.',
    inputSchema: {
      type: 'object',
      properties: {
        workspaceRoot: { type: 'string', description: 'Canonical workspace root directory' },
        runId: { type: 'string', description: 'Explicit run id' },
      },
      required: ['workspaceRoot'],
    },
  },
  {
    name: 'kernel_detach',
    description: 'Detach the current surface from the Run.',
    inputSchema: {
      type: 'object',
      properties: {
        workspaceRoot: { type: 'string', description: 'Canonical workspace root directory' },
        runId: { type: 'string', description: 'Explicit run id' },
        surface: { type: 'string', description: 'Surface identifier' },
      },
      required: ['workspaceRoot'],
    },
  },
];

export const handleMcpToolCall = async ({ name, parameters = {}, runtimeHome = null, env = process.env }) => {
  const workspaceRoot = parameters.workspaceRoot;
  if (!workspaceRoot || typeof workspaceRoot !== 'string') {
    throw new Error('workspaceRoot is required and must be a string path');
  }

  const resolvedWorkspaceRoot = path.resolve(workspaceRoot);
  const worktreeIdentity = resolveKernelWorktreeIdentity({
    cwd: resolvedWorkspaceRoot,
    workspaceRoot: resolvedWorkspaceRoot,
    env,
  });

  const cp = await createKernelControlPlane({
    runtimeHome: runtimeHome || resolveKernelRuntimeHome({ env }),
    projectRoot: resolvedWorkspaceRoot,
    env: {
      ...env,
      MOON_RELAY_KERNEL_PROJECT_ID: worktreeIdentity.projectId,
      ...(parameters.surface ? { MOON_RELAY_KERNEL_SURFACE: parameters.surface } : {}),
      ...(parameters.runId ? { MOON_RELAY_KERNEL_RUN_ID: parameters.runId } : {}),
    },
    requireHostBinding: false,
  });

  try {
    if (name === 'kernel_attach' || name === 'kernel_next') {
      const taskContract = parameters.contractJson || null;
      const explicitRunId = parameters.runId || null;
      let res;
      if (taskContract) {
        const invocation = cp.resolveBoundInvocation({
          explicitRunId,
          envRunId: env.MOON_RELAY_KERNEL_RUN_ID || null,
          taskContract,
        });
        if (invocation.mode === 'successor') {
          const successor = await cp.startSuccessor({
            invocation,
            objective: taskContract.objective,
            taskContract,
          });
          res = successor.next;
        } else if (invocation.mode === 'finalization-retry') {
          throw Object.assign(new Error('finalization_incomplete'), {
            code: 'finalization_incomplete',
            errorCode: 'finalization_incomplete',
            nextAction: 'retry-finalization',
            runId: invocation.runId,
          });
        } else if (invocation.mode === 'done') {
          res = await cp.next(invocation.runId);
        } else {
          const ensured = await cp.ensureRun({
            runId: invocation.runId,
            objective: taskContract.objective,
            taskContract,
          });
          res = ensured.next;
        }
      } else {
        const runId = await cp.resolveRunId({
          explicitRunId,
          envRunId: env.MOON_RELAY_KERNEL_RUN_ID || null,
        });
        const ensured = await cp.ensureRun({ runId });
        res = ensured.next;
      }
      return res;
    }

    if (name === 'kernel_report') {
      const explicitRunId = parameters.runId || null;
      const runId = await cp.resolveRunId({
        explicitRunId,
        envRunId: env.MOON_RELAY_KERNEL_RUN_ID || null,
      });
      const res = await cp.report(runId, parameters.report || {});
      return res;
    }

    if (name === 'kernel_status') {
      const explicitRunId = parameters.runId || null;
      const runId = await cp.resolveRunId({
        explicitRunId,
        envRunId: env.MOON_RELAY_KERNEL_RUN_ID || null,
      });
      const res = await cp.status(runId);
      return res || { status: 'not_found' };
    }

    if (name === 'kernel_detach') {
      return {
        status: 'detached',
        projectId: worktreeIdentity.projectId,
        worktreeId: worktreeIdentity.worktreeId,
      };
    }

    throw new Error(`Unknown Kernel MCP tool: ${name}`);
  } finally {
    await cp.close();
  }
};

export const createMcpBridgeHandler = ({ runtimeHome = null, env = process.env } = {}) => {
  return async (request) => {
    const { id, method, params } = request || {};

    if (method === 'initialize') {
      return {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: MCP_PROTOCOL_VERSION,
          serverInfo: {
            name: SERVER_NAME,
            version: SERVER_VERSION,
          },
          capabilities: {
            tools: {},
          },
        },
      };
    }

    if (method === 'notifications/initialized' || method === 'initialized') {
      return null;
    }

    if (method === 'ping') {
      return { jsonrpc: '2.0', id, result: {} };
    }

    if (method === 'tools/list') {
      return {
        jsonrpc: '2.0',
        id,
        result: {
          tools: KERNEL_MCP_TOOLS,
        },
      };
    }

    if (method === 'tools/call') {
      const { name, arguments: toolArgs } = params || {};
      try {
        const resultData = await handleMcpToolCall({
          name,
          parameters: toolArgs || {},
          runtimeHome,
          env,
        });
        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              {
                type: 'text',
                text: typeof resultData === 'string' ? resultData : JSON.stringify(resultData, null, 2),
              },
            ],
            isError: false,
          },
        };
      } catch (error) {
        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  error: error.message,
                  code: error.code || error.errorCode || 'KERNEL_BRIDGE_ERROR',
                  details: error.details || null,
                }, null, 2),
              },
            ],
            isError: true,
          },
        };
      }
    }

    return {
      jsonrpc: '2.0',
      id,
      error: {
        code: -32601,
        message: `Method not found: ${method}`,
      },
    };
  };
};

export const startMcpBridgeServer = ({
  stdin = process.stdin,
  stdout = process.stdout,
  runtimeHome = null,
  env = process.env,
} = {}) => {
  const handler = createMcpBridgeHandler({ runtimeHome, env });
  const rl = readline.createInterface({ input: stdin, output: stdout, terminal: false });

  rl.on('line', async (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let request;
    try {
      request = JSON.parse(trimmed);
    } catch {
      stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })}\n`);
      return;
    }

    try {
      const response = await handler(request);
      if (response) {
        stdout.write(`${JSON.stringify(response)}\n`);
      }
    } catch (err) {
      stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: request.id ?? null, error: { code: -32603, message: err.message } })}\n`);
    }
  });

  return {
    close() {
      rl.close();
    },
  };
};

const isDirectExecution = () => {
  if (!process.argv[1]) return false;
  try {
    return fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
  } catch {
    return false;
  }
};

if (isDirectExecution()) {
  startMcpBridgeServer();
}
