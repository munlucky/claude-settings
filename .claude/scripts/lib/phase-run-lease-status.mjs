import fs from 'node:fs';

export function readStatusBlocks(statusFile) {
  if (!statusFile || !fs.existsSync(statusFile)) {
    return [];
  }

  const lines = fs.readFileSync(statusFile, 'utf8').split(/\r?\n/);
  const blocks = [];
  let current = null;

  for (const rawLine of lines) {
    if (/^\s*-\s+number:\s*/.test(rawLine)) {
      if (current) {
        blocks.push(current);
      }
      const match = rawLine.match(/number:\s*([0-9]+)/);
      current = {
        number: match ? match[1] : null,
        status: '',
        planConfirmed: '',
      };
      continue;
    }

    if (!current) {
      continue;
    }

    const stripped = rawLine.trim();
    if (stripped.startsWith('status:')) {
      current.status = stripped.split(':', 2)[1].trim();
    } else if (stripped.startsWith('planConfirmed:')) {
      current.planConfirmed = stripped.split(':', 2)[1].trim().toLowerCase();
    }
  }

  if (current) {
    blocks.push(current);
  }

  return blocks;
}

export function countActionablePhases(statusFile) {
  return readStatusBlocks(statusFile).filter((block) => {
    if (block.planConfirmed === 'false') {
      return false;
    }
    return block.status === 'pending' || block.status === 'in_progress' || block.status === 'failed';
  }).length;
}

function quoteStatusValue(value) {
  return `"${String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r/g, '\\r').replace(/\n/g, '\\n')}"`;
}

function hasOpenDoubleQuotedScalar(line) {
  let escaped = false;
  let quoteCount = 0;
  for (const char of String(line || '')) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '"') {
      quoteCount += 1;
    }
  }
  return quoteCount % 2 === 1;
}

function upsertRootKey(lines, key, value) {
  const prefix = `${key}:`;
  const rendered = `${prefix} ${value}`;
  const index = lines.findIndex((line) => line.startsWith(prefix));
  if (index >= 0) {
    let deleteCount = 1;
    let openQuotedScalar = hasOpenDoubleQuotedScalar(lines[index]);
    while (openQuotedScalar && index + deleteCount < lines.length) {
      openQuotedScalar = !hasOpenDoubleQuotedScalar(lines[index + deleteCount]);
      deleteCount += 1;
    }
    lines.splice(index, deleteCount, rendered);
    return lines;
  }
  const insertAt = lines.findIndex((line) => line.startsWith('phases:'));
  if (insertAt >= 0) {
    lines.splice(insertAt, 0, rendered);
    return lines;
  }
  lines.push(rendered);
  return lines;
}

export function updateStatusLease(statusFile, fields) {
  if (!statusFile || !fs.existsSync(statusFile)) {
    return;
  }

  const lines = fs.readFileSync(statusFile, 'utf8').split(/\r?\n/).filter((_, index, array) => !(index === array.length - 1 && array[index] === ''));
  const nextLines = [...lines];

  const mapping = {
    activeRunLeaseId: quoteStatusValue,
    activeExecutionBoundary: quoteStatusValue,
    activeExecutionAttachedAt: quoteStatusValue,
    activeExecutionHeartbeatAt: quoteStatusValue,
    activeExecutionStatus: quoteStatusValue,
    activeActionablePhasesRemaining: (value) => String(value),
    activeCurrentStage: quoteStatusValue,
    activePhaseNumber: (value) => value === '' ? 'null' : String(value),
    activePhaseTitle: (value) => value ? quoteStatusValue(value) : 'null',
    lastRunLeaseId: (value) => value ? quoteStatusValue(value) : 'null',
    lastExecutionBoundary: (value) => value ? quoteStatusValue(value) : 'null',
    lastExecutionAttachedAt: (value) => value ? quoteStatusValue(value) : 'null',
    lastExecutionHeartbeatAt: (value) => value ? quoteStatusValue(value) : 'null',
    lastExecutionStatus: (value) => value ? quoteStatusValue(value) : 'null',
    lastReturnBoundary: (value) => value ? quoteStatusValue(value) : 'null',
    lastStopReasonCode: (value) => value ? quoteStatusValue(value) : 'null',
    lastStopReasonDetail: (value) => value ? quoteStatusValue(value) : 'null',
  };

  for (const [key, formatter] of Object.entries(mapping)) {
    if (fields[key] === undefined) {
      continue;
    }
    if (fields[key] === null) {
      const prefix = `${key}:`;
      const index = nextLines.findIndex((line) => line.startsWith(prefix));
      if (index >= 0) {
        nextLines.splice(index, 1);
      }
      continue;
    }
    upsertRootKey(nextLines, key, formatter(fields[key]));
  }

  fs.writeFileSync(statusFile, `${nextLines.join('\n')}\n`, 'utf8');
}
