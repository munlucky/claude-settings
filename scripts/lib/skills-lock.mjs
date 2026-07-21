import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { sha256Hex } from './candidate-identity.mjs';

const normalizePath = (value = '') => String(value).replaceAll('\\', '/');

const readSkillBody = async (repoRoot, skillPath) => readFile(path.join(repoRoot, skillPath, 'SKILL.md'), 'utf8');

export const discoverSourceSkills = async ({ repoRoot = process.cwd(), skillsRoot = 'skills' } = {}) => {
  const root = path.join(repoRoot, skillsRoot);
  const entries = await readdir(root, { withFileTypes: true });
  const skills = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const relativePath = normalizePath(path.join(skillsRoot, entry.name));
    try {
      const body = await readSkillBody(repoRoot, relativePath);
      skills.push({
        name: entry.name,
        path: relativePath,
        contentHash: sha256Hex(body),
      });
    } catch {
      skills.push({
        name: entry.name,
        path: relativePath,
        contentHash: '',
        missingSkillFile: true,
      });
    }
  }
  return skills.sort((left, right) => left.name.localeCompare(right.name));
};

export const buildSkillsLock = async ({
  repoRoot = process.cwd(),
  generatedAt = new Date().toISOString(),
  sourceCommit = '',
  defaultLicense = 'UNSPECIFIED',
  defaultStages = [],
  defaultPermissions = ['filesystem-read'],
} = {}) => ({
  schemaVersion: 1,
  generatedAt,
  sourceCommit,
  skills: (await discoverSourceSkills({ repoRoot })).map((skill) => ({
    name: skill.name,
    path: skill.path,
    source: 'canonical',
    contentHash: skill.contentHash || sha256Hex('missing'),
    license: defaultLicense,
    stages: defaultStages,
    permissions: defaultPermissions,
    permissionReview: {
      status: defaultPermissions.length > 0 ? 'required' : 'approved',
    },
  })),
});

export const auditSkillsLock = async ({
  repoRoot = process.cwd(),
  lock = null,
  runtimeSurface = null,
} = {}) => {
  const findings = [];
  if (!lock) {
    findings.push({ type: 'missing_lock', severity: 'blocking' });
    return { status: 'blocked', findings };
  }

  const sourceSkills = new Map(
    (await discoverSourceSkills({ repoRoot }))
      .filter((s) => !s.name.startsWith('kernel-') && s.name !== 'moon-relay-kernel')
      .map((skill) => [skill.name, skill])
  );
  const lockedSkills = new Map((lock.skills || []).map((skill) => [skill.name, skill]));

  for (const [name, sourceSkill] of sourceSkills.entries()) {
    const locked = lockedSkills.get(name);
    if (!locked) {
      findings.push({ type: 'missing_lock_entry', severity: 'blocking', skill: name });
      continue;
    }
    if (locked.contentHash !== sourceSkill.contentHash) {
      findings.push({ type: 'hash_drift', severity: 'blocking', skill: name });
    }
    if (!locked.license || locked.license === 'UNSPECIFIED') {
      findings.push({ type: 'license_gap', severity: 'review', skill: name });
    }
    if ((locked.permissions || []).length > 0 && locked.permissionReview?.status !== 'approved') {
      findings.push({ type: 'permission_review_required', severity: 'review', skill: name });
    }
  }

  const publicSkills = new Set(runtimeSurface?.publicRuntimeSkills || []);
  for (const skill of publicSkills) {
    if (!sourceSkills.has(skill)) {
      findings.push({ type: 'runtime_surface_missing_source_skill', severity: 'blocking', skill });
    }
  }

  return {
    status: findings.some((finding) => finding.severity === 'blocking') ? 'blocked' : findings.length ? 'review_required' : 'pass',
    findings,
  };
};

export const assertRuntimeSurfaceUnexpanded = ({ before = [], after = [] } = {}) => {
  const beforeSet = new Set(before);
  const added = after.filter((skill) => !beforeSet.has(skill));
  if (added.length > 0) {
    throw new Error(`runtime surface expansion requires explicit approval: ${added.join(', ')}`);
  }
  return true;
};
