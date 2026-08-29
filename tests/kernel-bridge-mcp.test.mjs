import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createMcpBridgeHandler } from '../scripts/kernel/bridge/mcp.mjs';
import { createKernelControlPlane } from '../scripts/kernel/control-plane.mjs';

const tempRoots = [];

const createFixtureRepo = async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'kernel-bridge-fixture-'));
  tempRoots.push(root);
  spawnSync('git', ['init', '--quiet'], { cwd: root, encoding: 'utf8' });
  spawnSync('git', ['config', 'user.name', 'Bridge Test'], { cwd: root, encoding: 'utf8' });
  spawnSync('git', ['config', 'user.email', 'bridge@example.invalid'], { cwd: root, encoding: 'utf8' });
  await writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'bridge-fixture', scripts: { test: 'node --version' } }));
  await writeFile(path.join(root, 'README.md'), '# Bridge Fixture\n');
  spawnSync('git', ['add', '.'], { cwd: root, encoding: 'utf8' });
  spawnSync('git', ['commit', '-m', 'initial', '--quiet'], { cwd: root, encoding: 'utf8' });
  return root;
};

test('mcp bridge provides initialize, ping, tools/list, and tool execution', async (t) => {
  t.after(async () => {
    await Promise.all(tempRoots.map((r) => rm(r, { recursive: true, force: true })));
  });

  const workspaceRoot = await createFixtureRepo();
  const runtimeHome = await mkdtemp(path.join(os.tmpdir(), 'kernel-runtime-'));
  tempRoots.push(runtimeHome);

  const handler = createMcpBridgeHandler({ runtimeHome });

  // 1. initialize
  const initRes = await handler({ jsonrpc: '2.0', id: 1, method: 'initialize' });
  assert.equal(initRes.result.serverInfo.name, 'moon-relay-kernel-bridge');
  assert.ok(initRes.result.capabilities.tools);

  // 2. initialized notification
  const notifyRes = await handler({ jsonrpc: '2.0', method: 'notifications/initialized' });
  assert.equal(notifyRes, null);

  // 3. ping
  const pingRes = await handler({ jsonrpc: '2.0', id: 2, method: 'ping' });
  assert.deepEqual(pingRes.result, {});

  // 4. tools/list
  const listRes = await handler({ jsonrpc: '2.0', id: 3, method: 'tools/list' });
  const toolNames = listRes.result.tools.map((tool) => tool.name);
  assert.ok(toolNames.includes('kernel_attach'));
  assert.ok(toolNames.includes('kernel_next'));
  assert.ok(toolNames.includes('kernel_report'));
  assert.ok(toolNames.includes('kernel_status'));
  assert.ok(toolNames.includes('kernel_detach'));

  // 5. tools/call kernel_next (contract-first)
  const taskContract = {
    objective: 'Implement MCP bridge test',
    nonGoals: ['no broad scope'],
    acceptance: ['bridge responds'],
    constraints: ['use git'],
  };

  const nextCall = await handler({
    jsonrpc: '2.0',
    id: 4,
    method: 'tools/call',
    params: {
      name: 'kernel_next',
      arguments: {
        workspaceRoot,
        contractJson: taskContract,
        surface: 'claude_app',
      },
    },
  });

  assert.equal(nextCall.result.isError, false);
  const nextResult = JSON.parse(nextCall.result.content[0].text);
  assert.ok(nextResult.runId || nextResult.action);

  const runId = nextResult.runId;

  // 6. tools/call kernel_status
  const statusCall = await handler({
    jsonrpc: '2.0',
    id: 5,
    method: 'tools/call',
    params: {
      name: 'kernel_status',
      arguments: {
        workspaceRoot,
        runId,
      },
    },
  });

  assert.equal(statusCall.result.isError, false);
  const statusResult = JSON.parse(statusCall.result.content[0].text);
  assert.equal(statusResult.run?.runId, runId);
  assert.ok(statusResult.completion);

  // 7. tools/call kernel_report
  const reportCall = await handler({
    jsonrpc: '2.0',
    id: 6,
    method: 'tools/call',
    params: {
      name: 'kernel_report',
      arguments: {
        workspaceRoot,
        runId,
        report: {
          stepId: nextResult.action?.stepId || 'step-1',
          changedPaths: ['README.md'],
          evidence: [],
          outcome: 'completed',
        },
      },
    },
  });

  assert.equal(reportCall.result.isError, false);

  // 8. tools/call kernel_detach
  const detachCall = await handler({
    jsonrpc: '2.0',
    id: 7,
    method: 'tools/call',
    params: {
      name: 'kernel_detach',
      arguments: {
        workspaceRoot,
        runId,
      },
    },
  });

  assert.equal(detachCall.result.isError, false);
  const detachResult = JSON.parse(detachCall.result.content[0].text);
  assert.equal(detachResult.status, 'detached');
  assert.ok(detachResult.worktreeId);
});

test('mcp bridge fails closed when workspaceRoot is missing or invalid', async (t) => {
  const runtimeHome = await mkdtemp(path.join(os.tmpdir(), 'kernel-runtime-'));
  tempRoots.push(runtimeHome);
  const handler = createMcpBridgeHandler({ runtimeHome });

  const missingRootCall = await handler({
    jsonrpc: '2.0',
    id: 10,
    method: 'tools/call',
    params: {
      name: 'kernel_next',
      arguments: {},
    },
  });

  assert.equal(missingRootCall.result.isError, true);
  const errPayload = JSON.parse(missingRootCall.result.content[0].text);
  assert.ok(errPayload.error.includes('workspaceRoot is required'));
});
