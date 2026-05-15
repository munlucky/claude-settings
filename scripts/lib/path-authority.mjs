#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

function stripQuotes(value) {
  return String(value || '').trim().replace(/^["'`]+|["'`]+$/g, '');
}

export function resolveAuthorityPath(rawPath, baseDir = process.cwd()) {
  const cleaned = stripQuotes(rawPath);
  if (!cleaned) {
    return '';
  }
  return path.isAbsolute(cleaned) ? path.normalize(cleaned) : path.resolve(baseDir, cleaned);
}

export function isPathInside(parentPath, childPath) {
  const parent = resolveAuthorityPath(parentPath);
  const child = resolveAuthorityPath(childPath);
  if (!parent || !child) {
    return false;
  }
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function addIssue(issues, code, detail, pathValue = '') {
  issues.push({ code, detail, path: pathValue });
}

function existsAsPath(filePath, kind = 'file') {
  if (!filePath || !fs.existsSync(filePath)) {
    return false;
  }
  const stats = fs.statSync(filePath);
  return kind === 'directory' ? stats.isDirectory() : stats.isFile();
}

function formatMissingDetail(label, suppliedPath) {
  return suppliedPath
    ? `${label} is missing: ${suppliedPath}`
    : `${label} path was not supplied; default fallback is disabled.`;
}

function validateArtifactPath(issues, artifact) {
  const label = artifact.label || 'Artifact path';
  const rawPath = artifact.path || '';
  const resolvedPath = resolveAuthorityPath(rawPath);
  if (!rawPath) {
    if (artifact.required === true) {
      addIssue(issues, 'artifact_path_missing', `${label} path was not supplied.`, rawPath);
    }
    return;
  }

  if (!resolvedPath) {
    addIssue(issues, 'artifact_path_missing', `${label} path could not be resolved: ${rawPath}`, rawPath);
    return;
  }

  if (artifact.parentPath && !isPathInside(artifact.parentPath, resolvedPath)) {
    addIssue(issues, 'artifact_path_missing', `${label} is outside the expected parent path: ${rawPath}`, rawPath);
  }

  if (artifact.mustExist === true && !existsAsPath(resolvedPath, artifact.kind || 'file')) {
    addIssue(issues, 'artifact_path_missing', `${label} is missing: ${rawPath}`, rawPath);
  }
}

export function evaluatePathAuthority(config = {}) {
  const issues = [];
  const planDir = resolveAuthorityPath(config.planDir || '');
  const statusFile = resolveAuthorityPath(config.statusFile || '');
  const masterPlan = resolveAuthorityPath(config.masterPlan || '');
  const executionRoot = resolveAuthorityPath(config.executionRoot || '');
  const phaseDoc = resolveAuthorityPath(config.phaseDoc || '');
  const masterPlanProvided = config.masterPlanProvided !== false && Boolean(String(config.masterPlan || '').trim());

  if (!existsAsPath(planDir, 'directory')) {
    addIssue(issues, 'plan_dir_missing', formatMissingDetail('Plan directory', config.planDir || planDir), config.planDir || planDir);
  }

  if (!existsAsPath(statusFile, 'file')) {
    addIssue(issues, 'phase_status_missing', formatMissingDetail('Phase status file', config.statusFile || statusFile), config.statusFile || statusFile);
  }

  if (!masterPlanProvided) {
    addIssue(issues, 'master_plan_missing', 'Master plan path was not supplied for this phase; default fallback is disabled.', config.masterPlan || masterPlan);
  } else if (!existsAsPath(masterPlan, 'file')) {
    addIssue(issues, 'master_plan_missing', formatMissingDetail('Master plan', config.masterPlan || masterPlan), config.masterPlan || masterPlan);
  } else if (String(config.planDir || '').trim() && !isPathInside(planDir, masterPlan)) {
    addIssue(issues, 'master_plan_missing', `Master plan is outside the plan directory: ${config.masterPlan || masterPlan}`, config.masterPlan || masterPlan);
  }

  if (String(config.phaseDoc || '').trim()) {
    validateArtifactPath(issues, {
      label: 'Active phase doc',
      path: config.phaseDoc,
      mustExist: true,
      kind: 'file',
      parentPath: planDir,
    });
  }

  if (String(config.executionRoot || '').trim() && String(config.planDir || '').trim() && !isPathInside(planDir, executionRoot)) {
    addIssue(issues, 'artifact_path_missing', `Execution root is outside the plan directory: ${config.executionRoot}`, config.executionRoot);
  }

  for (const artifact of Array.isArray(config.artifactPaths) ? config.artifactPaths : []) {
    validateArtifactPath(issues, {
      label: artifact.label || 'Artifact',
      path: artifact.path || '',
      mustExist: artifact.mustExist === true,
      kind: artifact.kind || 'file',
      parentPath: artifact.parentPath || executionRoot,
    });
  }

  const allowed = issues.length === 0;
  return {
    allowed,
    status: allowed ? 'pass' : 'fail',
    reason: allowed ? 'ok' : issues[0].code,
    code: allowed ? 'ok' : issues[0].code,
    authorityCode: allowed ? 'ok' : 'path_authority_failure',
    detail: issues.map((issue) => `${issue.code}: ${issue.detail}`).join(' | '),
    issues,
    resolvedPaths: {
      planDir,
      statusFile,
      masterPlan,
      executionRoot,
      phaseDoc,
    },
  };
}
