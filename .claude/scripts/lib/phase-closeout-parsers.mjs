import fs from 'node:fs';
import path from 'node:path';

import {
  getHeadingAliases,
  sectionText as normalizeSectionText,
} from '../artifact-normalizer.mjs';

export function normalize(value) {
  return String(value || '').replace(/\r\n/g, '\n');
}

export function stripQuotes(value) {
  return String(value || '').trim().replace(/^["'`]+|["'`]+$/g, '');
}

export function readText(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return '';
  }
  return fs.readFileSync(filePath, 'utf8');
}

export function sectionText(text, heading) {
  return normalizeSectionText(text, heading, getHeadingAliases(heading));
}

export function resolvePath(rawPath, baseDir = process.cwd()) {
  const cleaned = stripQuotes(rawPath);
  if (!cleaned) {
    return '';
  }
  return path.isAbsolute(cleaned) ? cleaned : path.resolve(baseDir, cleaned);
}

export function parsePhaseStatusDocument(text) {
  const phases = [];
  const root = {};
  const lines = normalize(text).split('\n');
  let current = null;

  for (const line of lines) {
    const start = line.match(/^\s*-\s+number:\s*(\d+)/);
    if (start) {
      if (current) {
        phases.push(current);
      }
      current = { number: Number(start[1]) };
      continue;
    }

    if (current) {
      const field = line.match(/^ {4}([A-Za-z][A-Za-z0-9]*):\s*(.*)$/);
      if (field) {
        current[field[1]] = stripQuotes(field[2]);
      }
      continue;
    }

    const rootField = line.match(/^([A-Za-z][A-Za-z0-9]*):\s*(.*)$/);
    if (rootField) {
      root[rootField[1]] = stripQuotes(rootField[2]);
    }
  }

  if (current) {
    phases.push(current);
  }

  return { root, phases };
}

export function parseMasterChecklist(text) {
  const section = sectionText(text, 'Phase Completion Checklist');
  const result = new Map();

  for (const line of section.split('\n')) {
    const match = line.match(/^-\s+\[([ xX])\].*?Phase\s+0?(\d+)\b/);
    if (match) {
      result.set(Number(match[2]), match[1].toLowerCase() === 'x');
    }
  }

  return result;
}

export function parseCriticalScenarios(text) {
  const section = sectionText(text, 'Critical Product Scenarios');
  const scenarios = [];
  const seen = new Set();
  const regex = /\b(SCN-[A-Za-z0-9_.-]+)\b/g;
  let match;

  while ((match = regex.exec(section)) !== null) {
    const id = match[1];
    if (!seen.has(id)) {
      seen.add(id);
      scenarios.push(id);
    }
  }

  return scenarios;
}

export function parseWorksetsYaml(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return { exists: false, tasks: [] };
  }
  const tasks = [];
  let current = null;
  let currentList = '';

  for (const line of readText(filePath).split(/\r?\n/)) {
    const taskStart = line.match(/^\s+-\s+id:\s*(.+?)\s*$/);
    if (taskStart) {
      if (current) {
        tasks.push(current);
      }
      current = {
        id: stripQuotes(taskStart[1]),
        status: '',
        ownedPaths: [],
        verificationCommands: [],
        evidence: [],
      };
      currentList = '';
      continue;
    }
    if (!current) {
      continue;
    }

    const scalar = line.match(/^\s{4}([A-Za-z][A-Za-z0-9]*):\s*(.*?)\s*$/);
    if (scalar) {
      const key = scalar[1];
      const rawValue = stripQuotes(scalar[2]);
      currentList = ['ownedPaths', 'verificationCommands', 'evidence'].includes(key) ? key : '';
      if (key === 'status') {
        current.status = rawValue;
      } else if (currentList && rawValue && rawValue !== '[]') {
        current[currentList].push(rawValue);
      }
      continue;
    }

    const listItem = line.match(/^\s{6}-\s+(.+?)\s*$/);
    if (listItem && currentList) {
      current[currentList].push(stripQuotes(listItem[1]));
    }
  }

  if (current) {
    tasks.push(current);
  }
  return { exists: true, tasks };
}
