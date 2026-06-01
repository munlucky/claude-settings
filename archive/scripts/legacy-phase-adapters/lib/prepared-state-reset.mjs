import fs from 'node:fs';
import path from 'node:path';

import { resolveRuntimeStateRoot } from './runtime-state-root.mjs';

const ACTIVE_POINTER_FILES = [
  'current-run.json',
  'active-phase-run.json',
  'latest-dispatch.json',
];
const SIMPLE_RUN_STATE_FILES = [
  'STATE.md',
  'reconciliation-intent.json',
];
const RUNTIME_STATE_FILES = [
  ...ACTIVE_POINTER_FILES,
  ...SIMPLE_RUN_STATE_FILES,
];
const SIMPLE_RUN_STATE_DIRS = [
  'runs',
];

function hasDirectoryEntries(directory) {
  return fs.existsSync(directory) && fs.readdirSync(directory).length > 0;
}

function resetFileEntry({ basename, directory, archiveRoot, archiveGroup }) {
  const filePath = path.join(directory, basename);
  return {
    basename,
    kind: 'file',
    path: filePath,
    archivePath: path.join(archiveRoot, archiveGroup, basename),
    archiveGroup,
    existed: fs.existsSync(filePath),
    action: fs.existsSync(filePath) ? 'archive-and-remove' : 'none',
  };
}

function resetDirectoryEntry({ basename, directory, archiveRoot, archiveGroup }) {
  const directoryPath = path.join(directory, basename);
  return {
    basename,
    kind: 'directory',
    path: directoryPath,
    archivePath: path.join(archiveRoot, archiveGroup, basename),
    archiveGroup,
    existed: hasDirectoryEntries(directoryPath),
    action: hasDirectoryEntries(directoryPath) ? 'archive-and-remove' : 'none',
  };
}

export function collectPreparedStateResetEntries({
  archiveRoot,
  workflowDir,
  cwd = process.cwd(),
}) {
  const entries = [
    ...SIMPLE_RUN_STATE_FILES.map((basename) => resetFileEntry({
      basename,
      directory: workflowDir,
      archiveRoot,
      archiveGroup: 'workflow-enforcement',
    })),
    ...SIMPLE_RUN_STATE_DIRS.map((basename) => resetDirectoryEntry({
      basename,
      directory: workflowDir,
      archiveRoot,
      archiveGroup: 'workflow-enforcement',
    })),
  ];

  const runtimeWorkflowDir = path.join(resolveRuntimeStateRoot(cwd), 'logs', 'workflow-enforcement');
  if (path.resolve(runtimeWorkflowDir) === path.resolve(workflowDir)) {
    return entries;
  }

  entries.push(
    ...RUNTIME_STATE_FILES.map((basename) => resetFileEntry({
      basename,
      directory: runtimeWorkflowDir,
      archiveRoot,
      archiveGroup: 'workflow-runtime-state',
    })),
    ...SIMPLE_RUN_STATE_DIRS.map((basename) => resetDirectoryEntry({
      basename,
      directory: runtimeWorkflowDir,
      archiveRoot,
      archiveGroup: 'workflow-runtime-state',
    })),
  );
  return entries;
}

export function applyPreparedStateResetEntries(entries) {
  for (const entry of entries) {
    if (!entry.existed) {
      continue;
    }
    fs.mkdirSync(path.dirname(entry.archivePath), { recursive: true });
    if (entry.kind === 'directory') {
      fs.renameSync(entry.path, entry.archivePath);
    } else {
      fs.copyFileSync(entry.path, entry.archivePath);
      fs.rmSync(entry.path, { force: true });
    }
  }
}
