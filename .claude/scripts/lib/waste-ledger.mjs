#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

import { classifyFailure } from './failure-classifier.mjs';

const LOG_DIR = path.join('.claude', 'logs', 'agent-loop');
const LEDGER_FILE = 'waste-ledger.jsonl';
const SUMMARY_FILE = 'noise-summary.json';

const WARNING_CLASS_PATTERNS = [
  { className: 'memorygraph_transport', test: /memory\s*graph.*transport|memorygraph.*transport|transport.*memory\s*graph/i },
  { className: 'plugin_manifest', test: /plugin.*manifest|manifest.*plugin/i },
  { className: 'skill_icon', test: /skill.*icon|icon.*skill/i },
  { className: 'deprecation', test: /deprecated|deprecate|full-auto/i },
];

function ledgerPath(repoRoot = process.cwd()) {
  return path.join(repoRoot, LOG_DIR, LEDGER_FILE);
}

function summaryPath(repoRoot = process.cwd()) {
  return path.join(repoRoot, LOG_DIR, SUMMARY_FILE);
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function appendJsonLine(filePath, payload) {
  ensureDir(filePath);
  fs.appendFileSync(filePath, `${JSON.stringify(payload)}\n`, 'utf8');
}

function readJsonLines(filePath) {
  if (!fs.existsSync(filePath)) {
    return [];
  }
  const entries = [];
  for (const rawLine of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }
    try {
      entries.push(JSON.parse(line));
    } catch {
      continue;
    }
  }
  return entries;
}

function incrementCount(counts, key, amount = 1) {
  const normalized = String(key || '').trim() || 'unknown';
  counts[normalized] = (counts[normalized] || 0) + amount;
}

function classifyWarningClass(context = '', detail = '') {
  const haystack = `${context} ${detail}`.toLowerCase();
  for (const { className, test } of WARNING_CLASS_PATTERNS) {
    if (test.test(haystack)) {
      return className;
    }
  }
  return 'warning';
}

export function wasteLedgerPath(repoRoot = process.cwd()) {
  return ledgerPath(repoRoot);
}

export function noiseSummaryPath(repoRoot = process.cwd()) {
  return summaryPath(repoRoot);
}

export function summarizeWasteLedger(entries = []) {
  const retryEntries = entries.filter((entry) => String(entry.kind || 'retry') !== 'warning');
  const warningEntries = entries.filter((entry) => String(entry.kind || '') === 'warning');

  const retryClassCounts = {};
  const retryPolicyCounts = {};
  const warningClassCounts = {};
  const firstWarningClasses = [];

  for (const entry of retryEntries) {
    incrementCount(retryClassCounts, entry.class);
    incrementCount(retryPolicyCounts, entry.retryPolicy);
  }

  for (const entry of warningEntries) {
    const warningClass = String(entry.class || 'warning').trim() || 'warning';
    incrementCount(warningClassCounts, warningClass);
    if ((warningClassCounts[warningClass] || 0) === 1) {
      firstWarningClasses.push(warningClass);
    }
  }

  const healthyRetries = Number(retryPolicyCounts.retryable || 0);
  const wasteRetries = retryEntries.length - healthyRetries;

  return {
    generatedAt: new Date().toISOString(),
    ledgerPath: '',
    summaryPath: '',
    totals: {
      ledgerEntries: entries.length,
      retryEntries: retryEntries.length,
      warningEntries: warningEntries.length,
      healthyRetries,
      wasteRetries,
    },
    retryClassCounts,
    retryPolicyCounts,
    warningClassCounts,
    firstWarningClasses,
  };
}

export function writeNoiseSummary(repoRoot = process.cwd()) {
  const ledgerFile = ledgerPath(repoRoot);
  const summaryFile = summaryPath(repoRoot);
  const entries = readJsonLines(ledgerFile);
  const summary = summarizeWasteLedger(entries);
  const payload = {
    ...summary,
    ledgerPath: ledgerFile,
    summaryPath: summaryFile,
  };
  ensureDir(summaryFile);
  fs.writeFileSync(summaryFile, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return payload;
}

export function appendWasteLedgerEntry(entry = {}) {
  const repoRoot = path.resolve(entry.repoRoot || process.cwd());
  const ledgerFile = ledgerPath(repoRoot);
  const kind = String(entry.kind || 'retry').trim() || 'retry';
  const phase = String(entry.phase || entry.phaseNum || '').trim();
  const context = String(entry.context || '').trim();
  const detail = String(entry.detail || '').trim();
  const explicitClass = String(entry.class || '').trim();
  const resolvedClass = explicitClass || (kind === 'warning'
    ? classifyWarningClass(context, detail)
    : classifyFailure({
        code: entry.code || entry.failureCode || entry.reason || entry.class || '',
        reason: entry.reason || entry.code || entry.class || '',
        message: detail || entry.message || '',
        detail: detail || entry.message || '',
        stderr: entry.stderr || '',
        stdout: entry.stdout || '',
        command: entry.command || '',
      }).code);

  const payload = {
    timestamp: entry.timestamp || new Date().toISOString(),
    repoRoot,
    kind,
    phase,
    phaseTitle: String(entry.phaseTitle || '').trim(),
    class: resolvedClass || 'unknown',
    action: String(entry.action || (kind === 'warning' ? 'summarize_warning' : 'record_retry')).trim(),
    evidencePath: String(entry.evidencePath || '').trim(),
    retryPolicy: String(entry.retryPolicy || '').trim(),
    count: Number.isFinite(Number(entry.count)) ? Number(entry.count) : 1,
    context,
    detail,
    source: String(entry.source || '').trim(),
    runtime: String(entry.runtime || '').trim(),
    stage: String(entry.stage || '').trim(),
  };

  appendJsonLine(ledgerFile, payload);
  const summary = writeNoiseSummary(repoRoot);
  const warningCount = Number(summary.warningClassCounts[payload.class] || 0);

  return {
    entry: payload,
    ledgerPath: ledgerFile,
    summaryPath: summary.summaryPath,
    summary,
    firstOccurrence: kind === 'warning' ? warningCount === 1 : false,
  };
}

