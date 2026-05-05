#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

import { runCommand } from './process-utils.mjs';
import { classifyFailure } from './failure-classifier.mjs';

function normalizeText(value) {
  return String(value ?? '').trim();
}

function normalizeCommandName(value) {
  return normalizeText(value).toLowerCase();
}

function normalizeArgs(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeText(entry)).filter(Boolean);
  }
  return normalizeText(value) ? [normalizeText(value)] : [];
}

function buildInvocation(command, args = []) {
  return [normalizeText(command), ...normalizeArgs(args)].filter(Boolean);
}

function buildProbeArgs(args = []) {
  return [...normalizeArgs(args), '--version'];
}

function runProbe(probeCommand, invocation) {
  const result = probeCommand(invocation[0], invocation.slice(1));
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    error: result.error ?? '',
  };
}

function defaultProbe(command, args) {
  return runCommand(command, args, { encoding: 'utf8' });
}

function commandAvailable(probeCommand, invocation) {
  const result = runProbe(probeCommand, [...invocation, '--version']);
  return result.status === 0 && !result.error;
}

function toCandidate(candidate) {
  if (typeof candidate === 'string') {
    return { command: candidate, args: [], label: candidate };
  }
  return {
    command: candidate?.command || '',
    args: normalizeArgs(candidate?.args || []),
    label: candidate?.label || [candidate?.command, ...normalizeArgs(candidate?.args || [])].filter(Boolean).join(' '),
  };
}

function commandLabel(candidate) {
  return [candidate.command, ...candidate.args].filter(Boolean).join(' ').trim();
}

function makeSuccess({
  commandName,
  candidate,
  evidenceStatus,
  fallbackReason = '',
  detail = '',
}) {
  const invocation = buildInvocation(candidate.command, candidate.args);
  return {
    commandName,
    requestedCommand: commandName,
    status: evidenceStatus,
    decision: 'continue',
    resolution: evidenceStatus === 'passed' ? 'exact' : 'approved_equivalent',
    exactCommand: commandName,
    resolvedCommand: candidate.command,
    resolvedArgs: [...candidate.args],
    invocation,
    evidenceCommand: commandLabel(candidate),
    fallbackReason,
    detail: detail || (evidenceStatus === 'passed'
      ? `${commandName} resolved exactly`
      : `${commandName} resolved through approved equivalent evidence: ${commandLabel(candidate)}`),
    failureCode: '',
    blockerClass: '',
  };
}

function makeFailure(commandName, detail, failureCode = 'command_not_found', blockerClass = '') {
  const classification = classifyFailure({
    code: failureCode,
    reason: failureCode,
    message: detail,
    detail,
  });
  return {
    commandName,
    requestedCommand: commandName,
    status: 'failed',
    decision: classification.decision,
    resolution: 'blocked',
    exactCommand: commandName,
    resolvedCommand: '',
    resolvedArgs: [],
    invocation: [],
    evidenceCommand: '',
    fallbackReason: detail,
    detail,
    failureCode: classification.code,
    blockerClass: blockerClass || classification.category,
  };
}

const COMMAND_POLICIES = {
  pnpm: {
    exact: [{ command: 'pnpm', args: [] }],
    equivalents: [
      { command: 'corepack', args: ['pnpm'], label: 'corepack pnpm' },
    ],
  },
  npm: {
    exact: [{ command: 'npm', args: [] }],
    equivalents: [
      { command: 'corepack', args: ['npm'], label: 'corepack npm' },
    ],
  },
  python: {
    exact: [{ command: 'python', args: [] }],
    equivalents: [
      { command: 'python3', args: [], label: 'python3' },
      { command: 'py', args: ['-3'], label: 'py -3' },
    ],
  },
  pytest: {
    exact: [{ command: 'pytest', args: [] }],
    equivalents: [
      { command: 'python', args: ['-m', 'pytest'], label: 'python -m pytest' },
    ],
  },
  git: {
    exact: [{ command: 'git', args: [] }],
    equivalents: [],
  },
  bash: {
    exact: [{ command: 'bash', args: [] }],
    equivalents: [],
  },
  docker: {
    exact: [{ command: 'docker', args: [] }],
    equivalents: [],
  },
};

export function resolveCommandEvidence(commandName, options = {}) {
  const normalizedName = normalizeCommandName(commandName);
  const policy = COMMAND_POLICIES[normalizedName] || {
    exact: [{ command: normalizedName, args: [] }],
    equivalents: [],
  };
  const probeCommand = options.probeCommand || defaultProbe;
  const exactCandidates = (options.exactCandidates || policy.exact).map(toCandidate);
  const equivalentCandidates = (options.equivalentCandidates || policy.equivalents).map(toCandidate);

  for (const candidate of exactCandidates) {
    if (!candidate.command) {
      continue;
    }
    if (commandAvailable(probeCommand, buildInvocation(candidate.command, candidate.args))) {
      return makeSuccess({
        commandName: normalizedName,
        candidate,
        evidenceStatus: 'passed',
      });
    }
  }

  for (const candidate of equivalentCandidates) {
    if (!candidate.command) {
      continue;
    }
    if (commandAvailable(probeCommand, buildInvocation(candidate.command, candidate.args))) {
      return makeSuccess({
        commandName: normalizedName,
        candidate,
        evidenceStatus: 'passed_with_equivalent_evidence',
        fallbackReason: `exact command unavailable; approved equivalent evidence: ${commandLabel(candidate)}`,
      });
    }
  }

  const exactLabel = exactCandidates.map(commandLabel).filter(Boolean).join(', ') || normalizedName;
  const equivalentLabel = equivalentCandidates.map(commandLabel).filter(Boolean).join(', ');
  const detail = equivalentLabel
    ? `${exactLabel} unavailable; approved equivalent candidates also unavailable: ${equivalentLabel}`
    : `${exactLabel} unavailable and no approved equivalent command was configured`;
  return makeFailure(normalizedName, detail, 'command_not_found');
}

export function resolveNpmBaseArgs(options = {}) {
  const probeCommand = options.probeCommand || defaultProbe;
  const exact = resolveCommandEvidence('npm', { probeCommand });
  if (exact.status === 'passed' || exact.status === 'passed_with_equivalent_evidence') {
    return exact.resolvedCommand === 'corepack'
      ? ['corepack', 'npm']
      : ['npm'];
  }

  const nodePath = process.platform === 'win32' ? 'C:\\Program Files\\nodejs\\node.exe' : '';
  const npmCliPath = process.platform === 'win32' ? 'C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js' : '';
  if (process.platform === 'win32' && fs.existsSync(nodePath) && fs.existsSync(npmCliPath)) {
    return [nodePath, npmCliPath];
  }

  return ['npm'];
}

function selectComposeFile(workspaceRoot) {
  for (const relativePath of [
    'compose.yaml',
    'compose.yml',
    'docker-compose.yaml',
    'docker-compose.yml',
  ]) {
    const candidate = path.join(workspaceRoot, relativePath);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return '';
}

function dockerErrorDetail(result) {
  return [result.stderr, result.error, result.stdout]
    .map((item) => normalizeText(item))
    .filter(Boolean)
    .join(' | ');
}

export function resolveDockerDependencyGate(options = {}) {
  const probeCommand = options.probeCommand || defaultProbe;
  const workspaceRoot = normalizeText(options.workspaceRoot) || process.cwd();
  const dockerCommand = resolveCommandEvidence('docker', { probeCommand });
  const composeFile = selectComposeFile(workspaceRoot);

  const gate = {
    status: dockerCommand.status === 'passed' || dockerCommand.status === 'passed_with_equivalent_evidence' ? 'passed' : 'failed',
    decision: dockerCommand.status === 'failed' ? 'resume_later_handoff' : 'continue',
    fallbackReason: dockerCommand.fallbackReason || '',
    version: dockerCommand,
    staticConfig: {
      status: composeFile ? 'pending' : 'skipped',
      command: composeFile ? `docker compose -f ${composeFile} config` : '',
      detail: composeFile ? '' : 'no compose file found in workspace root',
      failureCode: '',
      decision: 'continue',
    },
    daemon: {
      status: 'skipped',
      command: 'docker info',
      detail: '',
      failureCode: '',
      decision: 'continue',
    },
  };

  if (dockerCommand.status === 'failed') {
    gate.version = {
      ...dockerCommand,
      failureCode: 'docker_daemon_unavailable',
      blockerClass: 'environment',
      decision: 'resume_later_handoff',
    };
    gate.status = 'failed';
    gate.decision = 'resume_later_handoff';
    gate.fallbackReason = dockerCommand.fallbackReason || 'docker command unavailable';
    gate.daemon = {
      status: 'failed',
      command: 'docker info',
      detail: 'docker command unavailable; daemon probe could not run',
      failureCode: 'docker_daemon_unavailable',
      decision: 'resume_later_handoff',
    };
    return gate;
  }

  if (composeFile) {
    const composeResult = runProbe(probeCommand, ['docker', 'compose', '-f', composeFile, 'config']);
    gate.staticConfig = composeResult.status === 0 && !composeResult.error
      ? {
        status: 'passed',
        command: `docker compose -f ${composeFile} config`,
        detail: composeResult.stdout.trim() || 'compose config passed',
        failureCode: '',
        decision: 'continue',
      }
      : {
        status: 'failed',
        command: `docker compose -f ${composeFile} config`,
        detail: dockerErrorDetail(composeResult) || 'docker compose config failed',
        failureCode: 'command_not_found',
        decision: 'continue',
      };
  }

  const daemonResult = runProbe(probeCommand, ['docker', 'info']);
  if (daemonResult.status === 0 && !daemonResult.error) {
    gate.daemon = {
      status: 'passed',
      command: 'docker info',
      detail: daemonResult.stdout.trim() || 'docker daemon reachable',
      failureCode: '',
      decision: 'continue',
    };
    return gate;
  }

  const daemonDetail = dockerErrorDetail(daemonResult) || 'docker daemon unavailable';
  gate.daemon = {
    status: 'failed',
    command: 'docker info',
    detail: daemonDetail,
    failureCode: 'docker_daemon_unavailable',
    decision: 'resume_later_handoff',
  };
  gate.status = 'failed';
  gate.decision = 'resume_later_handoff';
  gate.fallbackReason = daemonDetail;
  return gate;
}

export function selfTestCommandResolver() {
  const exact = resolveCommandEvidence('git', {
    probeCommand: (command, args) => ({
      status: command === 'git' && args.length === 1 && args[0] === '--version' ? 0 : 1,
      stdout: 'git version',
      stderr: '',
      error: '',
    }),
  });
  if (exact.status !== 'passed' || exact.resolvedCommand !== 'git') {
    throw new Error('exact resolution failed');
  }

  const equivalent = resolveCommandEvidence('pnpm', {
    probeCommand: (command, args) => ({
      status: command === 'corepack' && args.join(' ') === 'pnpm --version' ? 0 : 1,
      stdout: 'pnpm via corepack',
      stderr: '',
      error: '',
    }),
    exactCandidates: [{ command: 'pnpm', args: [] }],
    equivalentCandidates: [{ command: 'corepack', args: ['pnpm'], label: 'corepack pnpm' }],
  });
  if (equivalent.status !== 'passed_with_equivalent_evidence' || equivalent.resolvedCommand !== 'corepack') {
    throw new Error('equivalent resolution failed');
  }

  const pytest = resolveCommandEvidence('pytest', {
    probeCommand: (command, args) => ({
      status: command === 'python' && args.join(' ') === '-m pytest --version' ? 0 : 1,
      stdout: 'pytest 8.0.0',
      stderr: '',
      error: '',
    }),
  });
  if (pytest.status !== 'passed_with_equivalent_evidence' || pytest.resolvedCommand !== 'python') {
    throw new Error('pytest equivalent resolution failed');
  }

  const blocked = resolveDockerDependencyGate({
    probeCommand: (command, args) => {
      if (command === 'docker' && args.join(' ') === '--version') {
        return { status: 0, stdout: 'Docker version 1.0', stderr: '', error: '' };
      }
      if (command === 'docker' && args.join(' ') === 'compose -f compose.yaml config') {
        return { status: 0, stdout: 'compose ok', stderr: '', error: '' };
      }
      return { status: 1, stdout: '', stderr: 'Cannot connect to the Docker daemon', error: '' };
    },
    workspaceRoot: path.join(process.cwd(), '.'),
  });
  if (blocked.status !== 'failed' || blocked.decision !== 'resume_later_handoff') {
    throw new Error('docker dependency gate failed');
  }
}
