import crypto from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const PHASE_RUNNER_PATTERN = /moonshot-phase-runner|moonshot phase runner|phase-runner/i;

const portable = (value = '') => String(value).split(path.sep).join('/');

const sha256 = (value) => crypto.createHash('sha256').update(String(value || '')).digest('hex');

const unique = (items) => [...new Set(items.filter(Boolean))];

const textFromValue = (value) => {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(textFromValue).filter(Boolean).join('\n');
  if (typeof value === 'object') {
    if (typeof value.text === 'string') return value.text;
    if (typeof value.content === 'string') return value.content;
    if (Array.isArray(value.content)) return textFromValue(value.content);
    if (typeof value.message === 'string') return value.message;
    return '';
  }
  return '';
};

const responseItemPayload = (entry) => entry.payload?.item || entry.item || entry.payload || entry;

const isUserMessage = (entry) => {
  const item = responseItemPayload(entry);
  return entry.type === 'response_item' && (item.role === 'user' || item.type === 'message' && item.role === 'user');
};

const isToolCall = (entry) => {
  const item = responseItemPayload(entry);
  return entry.type === 'response_item' && /tool|function_call/i.test(String(item.type || item.kind || ''));
};

const isEventMessage = (entry) => entry.type === 'event_msg' || Boolean(entry.event_msg);

const classifyExclusion = (text, entry) => {
  if (/MEMORY_SUMMARY|========= MEMORY_SUMMARY|memory summary/i.test(text)) return 'memory_summary';
  if (/Available skills|### Available skills|skills list|Skill roots/i.test(text)) return 'skill_metadata_injection';
  if (/subagent|forbidden-skill|do not use moonshot-phase-runner/i.test(text)) return 'subagent_prompt';
  if (isToolCall(entry) && !isUserMessage(entry)) return 'tool_only';
  return '';
};

const identityForRecord = ({ sessionId, threadId, sourceFile, firstUserInvocationLine }) => {
  if (sessionId) return `session:${sessionId}`;
  if (threadId) return `thread:${threadId}`;
  return `filehash:${sha256(`${sourceFile}:${firstUserInvocationLine || 0}`).slice(0, 16)}`;
};

const mergeDuplicateRecord = (target, duplicate) => {
  target.directInvocation = target.directInvocation || duplicate.directInvocation;
  if (!target.firstUserInvocationLine || (duplicate.firstUserInvocationLine && duplicate.firstUserInvocationLine < target.firstUserInvocationLine)) {
    target.firstUserInvocationLine = duplicate.firstUserInvocationLine;
  }
  target.evidenceTypes = unique([...target.evidenceTypes, ...duplicate.evidenceTypes]).sort();
  target.excludedReasons = unique([...target.excludedReasons, ...duplicate.excludedReasons, 'duplicate']).sort();
  target.warningCount += duplicate.warningCount;
  return target;
};

const emptyFileState = (sourceFile) => ({
  sourceFile,
  sessionId: null,
  threadId: null,
  firstUserInvocationLine: null,
  directInvocation: false,
  evidenceTypes: new Set(),
  excludedReasons: new Set(),
  warningCount: 0,
});

export const parseSessionJsonl = ({ content, sourceFile }) => {
  const state = emptyFileState(portable(sourceFile));
  const lines = String(content || '').split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      state.warningCount += 1;
      continue;
    }

    if (entry.type === 'session_meta') {
      state.sessionId ||= entry.payload?.id || entry.payload?.session_id || entry.session_id || entry.id || null;
      state.threadId ||= entry.payload?.thread_id || entry.thread_id || null;
      continue;
    }
    if (entry.type === 'turn_context') {
      state.threadId ||= entry.payload?.thread_id || entry.payload?.conversation_id || entry.thread_id || entry.conversation_id || null;
    }

    const item = responseItemPayload(entry);
    const text = textFromValue(item);
    const mentionsPhaseRunner = PHASE_RUNNER_PATTERN.test(text);
    const excludedReason = mentionsPhaseRunner ? classifyExclusion(text, entry) : '';

    if (isUserMessage(entry)) state.evidenceTypes.add('user_message');
    if (isToolCall(entry)) state.evidenceTypes.add('tool_call');
    if (isEventMessage(entry)) state.evidenceTypes.add('event_msg');

    if (excludedReason) {
      state.excludedReasons.add(excludedReason);
      continue;
    }

    if (mentionsPhaseRunner && isUserMessage(entry)) {
      state.directInvocation = true;
      state.firstUserInvocationLine ||= index + 1;
    }
  }

  return {
    schemaVersion: 1,
    sessionId: state.sessionId,
    threadId: state.threadId,
    sourceFile: state.sourceFile,
    firstUserInvocationLine: state.firstUserInvocationLine,
    directInvocation: state.directInvocation,
    evidenceTypes: [...state.evidenceTypes].sort(),
    excludedReasons: [...state.excludedReasons].sort(),
    warningCount: state.warningCount,
  };
};

export const collectJsonlFiles = async (sessionsRoot) => {
  const files = [];
  const walk = async (dir) => {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const target = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(target);
      else if (entry.isFile() && entry.name.endsWith('.jsonl')) files.push(target);
    }
  };
  const rootStat = await stat(sessionsRoot);
  if (rootStat.isDirectory()) await walk(sessionsRoot);
  else files.push(sessionsRoot);
  return files.sort();
};

export const auditSessionFiles = async ({ files }) => {
  const records = [];
  for (const file of files) {
    records.push(parseSessionJsonl({
      content: await readFile(file, 'utf8'),
      sourceFile: file,
    }));
  }

  const seen = new Map();
  const excludedCountsByReason = {};
  let duplicateCount = 0;
  let invalidJsonLineCount = 0;

  for (const record of records) {
    invalidJsonLineCount += record.warningCount;
    for (const reason of record.excludedReasons) {
      excludedCountsByReason[reason] = (excludedCountsByReason[reason] || 0) + 1;
    }
    const key = identityForRecord(record);
    if (seen.has(key)) {
      duplicateCount += 1;
      record.excludedReasons = unique([...record.excludedReasons, 'duplicate']).sort();
      excludedCountsByReason.duplicate = (excludedCountsByReason.duplicate || 0) + 1;
      mergeDuplicateRecord(seen.get(key), record);
      continue;
    }
    seen.set(key, record);
  }

  const uniqueRecords = [...seen.values()].sort((left, right) => identityForRecord(left).localeCompare(identityForRecord(right)));
  return {
    schemaVersion: 1,
    directSessionCount: uniqueRecords.filter((record) => record.directInvocation).length,
    uniqueSessionCount: uniqueRecords.length,
    duplicateCount,
    excludedCountsByReason,
    invalidJsonLineCount,
    records: uniqueRecords,
  };
};

export const auditSessionsRoot = async ({ sessionsRoot }) => auditSessionFiles({
  files: await collectJsonlFiles(sessionsRoot),
});
