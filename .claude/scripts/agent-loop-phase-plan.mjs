#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { activeWorkspaceContract } from './lib/runtime-platform.mjs';
import { loadVerificationContractContext } from './lib/verification-contract.mjs';

function parseIsoTimestamp(value) {
  if (!value) {
    return Number.NaN;
  }

  const normalized = value.trim().replace(/^"|"$/g, '').replace(/Z$/, '+00:00');
  const parsed = Date.parse(normalized);
  return Number.isNaN(parsed) ? Number.NaN : parsed;
}

function readStatusBlocks(statusFile) {
  const lines = fs.readFileSync(statusFile, 'utf8').split(/\r?\n/);
  const blocks = [];
  let current = null;
  let currentIndent = 0;
  let inAttempts = false;

  for (const rawLine of lines) {
    if (/^\s*-\s+number:\s*/.test(rawLine)) {
      if (current) {
        blocks.push(current);
      }
      current = {
        number: null,
        status: null,
        planConfirmed: null,
        lastOutcome: null,
        lastUpdatedAt: null,
      };
      currentIndent = rawLine.length - rawLine.trimStart().length;
      inAttempts = false;
      const match = rawLine.match(/number:\s*([0-9]+)/);
      if (match) {
        current.number = match[1];
      }
      continue;
    }

    if (!current) {
      continue;
    }

    const indent = rawLine.length - rawLine.trimStart().length;
    const stripped = rawLine.trim();
    if (!stripped) {
      continue;
    }

    if (inAttempts && indent <= currentIndent + 2) {
      inAttempts = false;
    }

    if (stripped.startsWith('status:')) {
      current.status = stripped.split(':', 2)[1].trim();
    } else if (stripped.startsWith('planConfirmed:')) {
      current.planConfirmed = stripped.split(':', 2)[1].trim().toLowerCase();
    } else if (stripped.startsWith('attempts:') && indent > currentIndent) {
      inAttempts = true;
    } else if (inAttempts) {
      if (stripped.startsWith('lastOutcome:')) {
        current.lastOutcome = stripped.split(':', 2)[1].trim();
      } else if (stripped.startsWith('lastUpdatedAt:')) {
        current.lastUpdatedAt = stripped.split(':', 2)[1].trim().replace(/^"|"$/g, '');
      }
    }
  }

  if (current) {
    blocks.push(current);
  }

  return blocks;
}

export function getNextPhase(statusFile) {
  if (!fs.existsSync(statusFile)) {
    return '1';
  }

  const staleSeconds = Number.parseFloat(process.env.AGENT_LOOP_STALE_PHASE_SECONDS ?? '1800');
  const now = Date.now();

  const blockedStatuses = ['verification_blocked', 'runtime_unhealthy', 'blocked'];
  const blocks = readStatusBlocks(statusFile);

  for (const block of blocks) {
    if (block.status === 'pending_reverify' && block.planConfirmed !== 'false' && block.number !== null) {
      return block.number;
    }
  }

  const continueOnBlocked = (process.env.AGENT_LOOP_CONTINUE_ON_BLOCKED ?? 'false') === 'true';
  for (const block of blocks) {
    if (block.planConfirmed === 'false') {
      continue;
    }
    if (blockedStatuses.includes(block.status)) {
      return continueOnBlocked && block.number !== null ? block.number : '';
    }
    if (
      block.status === 'in_progress' &&
      block.lastOutcome === 'running' &&
      block.lastUpdatedAt
    ) {
      const updatedAt = parseIsoTimestamp(block.lastUpdatedAt);
      if (!Number.isNaN(updatedAt) && now - updatedAt >= staleSeconds * 1000) {
        continue;
      }
    }
    if ((block.status === 'pending' || block.status === 'in_progress') && block.number !== null) {
        return block.number;
    }
  }

  return '';
}

function listPhaseDocs(planDir) {
  return fs
    .readdirSync(planDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

function getPhaseDoc(planDir, phaseNum) {
  const phasePrefix = String(phaseNum).padStart(2, '0');
  const names = listPhaseDocs(planDir);
  const match = names.find((name) => {
    if (name.includes('master') || name.includes('00-')) {
      return false;
    }
    return name.startsWith(`${phasePrefix}-`) || name.includes(`phase${phaseNum}`) || name.includes(`phase-${phaseNum}`);
  });
  return match ? path.join(planDir, match) : '';
}

function getPhaseTitle(planDir, phaseNum) {
  const phaseDoc = getPhaseDoc(planDir, phaseNum);
  if (!phaseDoc) {
    return `Phase ${phaseNum}`;
  }

  const lines = fs.readFileSync(phaseDoc, 'utf8').split(/\r?\n/).slice(0, 5);
  const heading = lines.find((line) => /^#/.test(line.trim()));
  return heading ? heading.replace(/^#+\s*/, '').replace(/\r/g, '') : `Phase ${phaseNum}`;
}

function countTotalPhases(planDir) {
  return String(
    listPhaseDocs(planDir).filter((name) => !name.includes('master') && !name.includes('00-')).length,
  );
}

function parseScalar(value) {
  const trimmed = value.trim();
  if (trimmed === 'true') {
    return true;
  }
  if (trimmed === 'false') {
    return false;
  }
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseSimpleYaml(filePath) {
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  const root = {};
  const stack = [{ indent: -1, value: root }];

  function nextMeaningful(startIndex) {
    for (let index = startIndex + 1; index < lines.length; index += 1) {
      const stripped = lines[index].trim();
      if (!stripped || stripped.startsWith('#')) {
        continue;
      }
      return {
        indent: lines[index].length - lines[index].trimStart().length,
        stripped,
      };
    }
    return null;
  }

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index];
    const stripped = rawLine.trim();
    if (!stripped || stripped.startsWith('#')) {
      continue;
    }

    const indent = rawLine.length - rawLine.trimStart().length;
    while (stack.length > 1 && indent <= stack.at(-1).indent) {
      stack.pop();
    }

    const container = stack.at(-1).value;
    if (stripped.startsWith('- ')) {
      if (Array.isArray(container)) {
        container.push(parseScalar(stripped.slice(2)));
      }
      continue;
    }

    const separatorIndex = stripped.indexOf(':');
    if (separatorIndex === -1) {
      continue;
    }

    const key = stripped.slice(0, separatorIndex).trim();
    const value = stripped.slice(separatorIndex + 1).trim();
    if (!key || typeof container !== 'object' || Array.isArray(container)) {
      continue;
    }

    if (!value) {
      const next = nextMeaningful(index);
      const nested = next && next.indent > indent && next.stripped.startsWith('- ') ? [] : {};
      container[key] = nested;
      stack.push({ indent, value: nested });
      continue;
    }

    container[key] = parseScalar(value);
  }

  return root;
}

function renderRequiredVerificationCommands(contractFile, requestedRuntime = 'auto', verificationRuntimes = 'auto', currentRuntime = '') {
  if (!fs.existsSync(contractFile)) {
    return '- Populate from the active verification contract before claiming completion.';
  }

  const context = loadVerificationContractContext(contractFile, {
    requestedRuntime,
    verificationRuntimes,
    currentRuntime,
  });

  const lines = context.requiredChecks.map((check) => {
    const command = check.command;
    return command
      ? `- ${check.name}: \`${command}\``
      : `- ${check.name}: declare the command in ${contractFile}`;
  });

  if (lines.length === 0) {
    return '- Populate from the active verification contract before claiming completion.';
  }

  return lines.join('\n');
}

function printUsage() {
  console.error([
    'Usage:',
    '  agent-loop-phase-plan.mjs <command> [args]',
    '',
    'Commands:',
    '  get-next-phase <status-file>',
    '  get-phase-doc <plan-dir> <phase-num>',
    '  get-phase-title <plan-dir> <phase-num>',
    '  count-total-phases <plan-dir>',
    '  render-required-verification-commands <verification-contract-file> [requested-runtime] [verification-runtimes] [current-runtime]',
    '  active-workspace-contract [cwd]',
  ].join('\n'));
}

function writeStdoutLine(value = '') {
  process.stdout.write(`${String(value)}\n`);
}

function main() {
  const [command, ...args] = process.argv.slice(2);

  switch (command) {
    case 'get-next-phase':
      writeStdoutLine(getNextPhase(args[0]));
      break;
    case 'get-phase-doc':
      writeStdoutLine(getPhaseDoc(args[0], args[1]));
      break;
    case 'get-phase-title':
      writeStdoutLine(getPhaseTitle(args[0], args[1]));
      break;
    case 'count-total-phases':
      writeStdoutLine(countTotalPhases(args[0]));
      break;
    case 'render-required-verification-commands':
      writeStdoutLine(renderRequiredVerificationCommands(args[0], args[1], args[2], args[3]));
      break;
    case 'active-workspace-contract':
      writeStdoutLine(activeWorkspaceContract(args[0] || process.cwd()));
      break;
    default:
      printUsage();
      process.exit(64);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main();
}
