#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const LIFECYCLE_STATES = Object.freeze([
  'observe',
  'stage',
  'verify',
  'promote',
  'supersede',
  'archive',
]);

export const TARGETS = Object.freeze([
  'project-local',
  'global-candidate',
  'harness-meta-project',
]);

export const HARNESS_META_PROJECT = Object.freeze({
  projectId: 'moonshot-harness-core',
  knowledgeRoot: '%USERPROFILE%/.codex/state/projects/moonshot-harness-core/knowledge',
  improvementRoot: '%USERPROFILE%/.codex/state/projects/moonshot-harness-core/improvement',
  candidateReleaseRoot: '%USERPROFILE%/.codex/harness/releases/candidate',
  stableReleaseRoot: '%USERPROFILE%/.codex/harness/releases/stable',
  requiredArtifacts: Object.freeze([
    'improvement/proposals/<proposalId>.yaml',
    'improvement/reviews/<proposalId>-review.yaml',
    'improvement/replay/<proposalId>-replay.json',
    'improvement/rollback/<proposalId>-rollback.json',
    'improvement/releases/<proposalId>-release-manifest.json',
  ]),
});

const STATE_TRANSITIONS = new Set([
  'observe->stage',
  'stage->verify',
  'verify->promote',
  'verify->supersede',
  'supersede->archive',
  'promote->supersede',
  'promote->archive',
]);

const VALID_SOURCE_TYPES = new Set([
  'authoritative_doc',
  'repo_file',
  'schema',
  'test',
  'review',
  'replay',
  'release_manifest',
  'transcript',
  'browser',
  'tool_output',
  'external',
  'imported',
]);

const VALID_TRUST_TIERS = new Set([
  'authoritative',
  'verified',
  'derived',
  'quarantined',
  'degraded',
]);

const EVIDENCE_PASS_STATUSES = new Set(['passed', 'approved', 'present']);
const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const ROOT_FIELDS = new Set([
  'schemaVersion',
  'proposalId',
  'projectId',
  'target',
  'state',
  'previousState',
  'promotionTier',
  'createdAt',
  'updatedAt',
  'summary',
  'supersedes',
  'candidate',
  'evidence',
  'denial',
]);
const CANDIDATE_FIELDS = new Set([
  'kind',
  'sourceType',
  'trustTier',
  'statement',
  'sourceRef',
  'untrustedExternal',
  'transcriptOnly',
  'secretLike',
]);
const EVIDENCE_FIELDS = new Set([
  'verification',
  'independentReview',
  'replay',
  'targetedSelfTest',
  'rollback',
  'releaseManifest',
]);
const EVIDENCE_REF_FIELDS = new Set(['path', 'status', 'reviewer', 'hash']);
const DENIAL_FIELDS = new Set(['code', 'reason', 'durable', 'workflowBlocking']);

function hasOwn(record, field) {
  return Object.hasOwn(record, field);
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isBlank(value) {
  return typeof value !== 'string' || value.trim() === '';
}

function pushMissing(errors, record, fields, prefix = '') {
  for (const field of fields) {
    if (!hasOwn(record, field)) {
      errors.push(`missing required field: ${prefix}${field}`);
    }
  }
}

function rejectUnknownFields(errors, record, allowed, prefix = '') {
  if (!isObject(record)) return;
  for (const field of Object.keys(record)) {
    if (!allowed.has(field)) {
      errors.push(`unknown field: ${prefix}${field}`);
    }
  }
}

function validateTimestamp(value, field, errors) {
  if (isBlank(value) || !ISO_DATE_TIME.test(value)) {
    errors.push(`${field} must be an ISO-8601 UTC timestamp`);
  }
}

function validateEvidenceRef(evidence, field, errors) {
  const ref = evidence[field];
  if (ref === undefined) return;
  if (!isObject(ref)) {
    errors.push(`evidence.${field} must be an object`);
    return;
  }
  rejectUnknownFields(errors, ref, EVIDENCE_REF_FIELDS, `evidence.${field}.`);
  if (isBlank(ref.path)) errors.push(`evidence.${field}.path must be a non-empty string`);
  if (!EVIDENCE_PASS_STATUSES.has(ref.status)) {
    errors.push(`evidence.${field}.status must be one of ${[...EVIDENCE_PASS_STATUSES].join(', ')}`);
  }
}

function evidencePassed(evidence, field) {
  const ref = evidence?.[field];
  return isObject(ref) && !isBlank(ref.path) && EVIDENCE_PASS_STATUSES.has(ref.status);
}

function durableDenial(code, reason) {
  return {
    code,
    reason,
    durable: true,
    workflowBlocking: false,
  };
}

export function isTransitionAllowed(fromState, toState) {
  return STATE_TRANSITIONS.has(`${fromState}->${toState}`);
}

export function harnessMetaProjectContract(env = process.env) {
  const profile = env.USERPROFILE || os.homedir();
  return {
    ...HARNESS_META_PROJECT,
    resolvedKnowledgeRoot: path.join(profile, '.codex', 'state', 'projects', HARNESS_META_PROJECT.projectId, 'knowledge'),
    resolvedImprovementRoot: path.join(profile, '.codex', 'state', 'projects', HARNESS_META_PROJECT.projectId, 'improvement'),
    resolvedCandidateReleaseRoot: path.join(profile, '.codex', 'harness', 'releases', 'candidate'),
    resolvedStableReleaseRoot: path.join(profile, '.codex', 'harness', 'releases', 'stable'),
  };
}

export function validateImprovementProposal(proposal) {
  const errors = [];

  if (!isObject(proposal)) {
    return { ok: false, errors: ['proposal must be an object'] };
  }

  pushMissing(errors, proposal, [
    'proposalId',
    'projectId',
    'target',
    'state',
    'createdAt',
    'updatedAt',
    'summary',
    'candidate',
    'evidence',
  ]);
  rejectUnknownFields(errors, proposal, ROOT_FIELDS);

  for (const field of ['proposalId', 'projectId', 'summary']) {
    if (hasOwn(proposal, field) && isBlank(proposal[field])) {
      errors.push(`${field} must be a non-empty string`);
    }
  }

  if (hasOwn(proposal, 'target') && !TARGETS.includes(proposal.target)) {
    errors.push(`target must be one of ${TARGETS.join(', ')}`);
  }
  if (hasOwn(proposal, 'state') && !LIFECYCLE_STATES.includes(proposal.state)) {
    errors.push(`state must be one of ${LIFECYCLE_STATES.join(', ')}`);
  }
  if (proposal.previousState !== undefined && !LIFECYCLE_STATES.includes(proposal.previousState)) {
    errors.push(`previousState must be one of ${LIFECYCLE_STATES.join(', ')}`);
  }
  if (['promote', 'supersede', 'archive'].includes(proposal.state)) {
    if (isBlank(proposal.previousState)) {
      errors.push(`${proposal.state} requires previousState to prove lifecycle transition`);
    } else if (!isTransitionAllowed(proposal.previousState, proposal.state)) {
      errors.push(`invalid lifecycle transition: ${proposal.previousState} -> ${proposal.state}`);
    }
  }
  if (proposal.promotionTier !== undefined && !['project-local', 'candidate', 'stable'].includes(proposal.promotionTier)) {
    errors.push('promotionTier must be one of project-local, candidate, stable');
  }

  for (const field of ['createdAt', 'updatedAt']) {
    if (hasOwn(proposal, field)) validateTimestamp(proposal[field], field, errors);
  }

  if (proposal.supersedes !== undefined) {
    if (!Array.isArray(proposal.supersedes)) {
      errors.push('supersedes must be an array');
    } else {
      const seen = new Set();
      for (const item of proposal.supersedes) {
        if (isBlank(item)) errors.push('supersedes must contain non-empty strings');
        if (seen.has(item)) errors.push('supersedes must not contain duplicate ids');
        seen.add(item);
      }
    }
  }

  if (!isObject(proposal.candidate)) {
    errors.push('candidate must be an object');
  } else {
    rejectUnknownFields(errors, proposal.candidate, CANDIDATE_FIELDS, 'candidate.');
    pushMissing(errors, proposal.candidate, ['kind', 'sourceType', 'trustTier', 'statement'], 'candidate.');
    if (!['observation', 'semantic_fact', 'ontology_constraint', 'policy_anchor', 'harness_rule'].includes(proposal.candidate.kind)) {
      errors.push('candidate.kind must be a known knowledge candidate kind');
    }
    if (!VALID_SOURCE_TYPES.has(proposal.candidate.sourceType)) {
      errors.push('candidate.sourceType must be a known source type');
    }
    if (!VALID_TRUST_TIERS.has(proposal.candidate.trustTier)) {
      errors.push('candidate.trustTier must be a known trust tier');
    }
    if (isBlank(proposal.candidate.statement)) {
      errors.push('candidate.statement must be a non-empty string');
    }
  }

  if (!isObject(proposal.evidence)) {
    errors.push('evidence must be an object');
  } else {
    rejectUnknownFields(errors, proposal.evidence, EVIDENCE_FIELDS, 'evidence.');
    for (const field of ['verification', 'independentReview', 'replay', 'targetedSelfTest', 'rollback', 'releaseManifest']) {
      validateEvidenceRef(proposal.evidence, field, errors);
    }
  }

  if (proposal.denial !== undefined) {
    if (!isObject(proposal.denial)) {
      errors.push('denial must be an object');
    } else {
      rejectUnknownFields(errors, proposal.denial, DENIAL_FIELDS, 'denial.');
    }
  }

  if (proposal.target === 'harness-meta-project' && proposal.projectId !== HARNESS_META_PROJECT.projectId) {
    errors.push(`harness-meta-project target requires projectId ${HARNESS_META_PROJECT.projectId}`);
  }

  return { ok: errors.length === 0, errors };
}

export function evaluateImprovementProposal(proposal, options = {}) {
  const validation = validateImprovementProposal(proposal);
  if (!validation.ok) {
    return {
      ok: false,
      decision: 'invalid',
      workflowBlocking: false,
      denial: durableDenial('invalid_proposal', validation.errors.join('; ')),
      errors: validation.errors,
    };
  }

  const evidence = proposal.evidence || {};
  const candidate = proposal.candidate || {};

  if (candidate.secretLike) {
    return {
      ok: false,
      decision: 'denied',
      workflowBlocking: false,
      denial: durableDenial('secret_like_candidate', 'Secret-like candidate cannot enter the knowledge promotion lifecycle.'),
      errors: [],
    };
  }

  if (candidate.transcriptOnly || candidate.sourceType === 'transcript') {
    return {
      ok: false,
      decision: 'denied',
      workflowBlocking: false,
      denial: durableDenial('transcript_only_candidate', 'Transcript-only candidates must remain episodic or quarantined.'),
      errors: [],
    };
  }

  if (candidate.sourceType === 'imported') {
    return {
      ok: false,
      decision: 'denied',
      workflowBlocking: false,
      denial: durableDenial('imported_only_candidate', 'Imported-only candidates must remain quarantined and cannot be promoted.'),
      errors: [],
    };
  }

  if (candidate.untrustedExternal || ['browser', 'tool_output', 'external'].includes(candidate.sourceType)) {
    return {
      ok: false,
      decision: 'denied',
      workflowBlocking: false,
      denial: durableDenial('untrusted_external_candidate', 'Untrusted external candidates require trusted re-authoring before semantic use or promotion.'),
      errors: [],
    };
  }

  if (proposal.target === 'project-local' && proposal.state === 'promote') {
    return {
      ok: false,
      decision: 'denied',
      workflowBlocking: false,
      denial: durableDenial('project_local_promotion_not_allowed', 'Project-local facts are verified in place and are not promoted by default.'),
      errors: [],
    };
  }

  if (proposal.target === 'project-local' && proposal.state === 'verify') {
    if (candidate.kind === 'observation' && !evidencePassed(evidence, 'verification')) {
      return {
        ok: false,
        decision: 'denied',
        workflowBlocking: false,
        denial: durableDenial('missing_project_verification', 'Project-local observations become semantic facts only after verification.'),
        errors: [],
      };
    }
  }

  if (proposal.state === 'promote' && proposal.target !== 'project-local') {
    const missing = [];
    if (!evidencePassed(evidence, 'independentReview')) missing.push('independentReview');
    if (!evidencePassed(evidence, 'replay')) missing.push('replay');
    if (proposal.target === 'harness-meta-project' && !evidencePassed(evidence, 'targetedSelfTest')) {
      missing.push('targetedSelfTest');
    }
    if (missing.length > 0) {
      return {
        ok: false,
        decision: 'denied',
        workflowBlocking: false,
        denial: durableDenial('missing_promotion_evidence', `Promotion requires evidence: ${missing.join(', ')}.`),
        errors: [],
      };
    }
  }

  if (proposal.target === 'harness-meta-project' && proposal.state === 'promote' && proposal.promotionTier === 'stable') {
    const missing = [];
    for (const field of ['independentReview', 'replay', 'rollback', 'releaseManifest']) {
      if (!evidencePassed(evidence, field)) missing.push(field);
    }
    if (missing.length > 0) {
      return {
        ok: false,
        decision: 'denied',
        workflowBlocking: false,
        denial: durableDenial('missing_stable_harness_evidence', `Stable harness promotion requires evidence: ${missing.join(', ')}.`),
        errors: [],
      };
    }
  }

  const nextState = options.nextState || '';
  if (nextState && !isTransitionAllowed(proposal.state, nextState)) {
    return {
      ok: false,
      decision: 'denied',
      workflowBlocking: false,
      denial: durableDenial('invalid_lifecycle_transition', `Invalid lifecycle transition: ${proposal.state} -> ${nextState}.`),
      errors: [],
    };
  }

  return {
    ok: true,
    decision: proposal.state === 'promote' ? 'approved_for_promotion' : 'accepted',
    workflowBlocking: false,
    denial: null,
    errors: [],
  };
}

function valueAfter(argv, flag) {
  const index = argv.indexOf(flag);
  return index >= 0 && index + 1 < argv.length ? argv[index + 1] : '';
}

function readProposal(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(text);
}

function main() {
  const argv = process.argv.slice(2);
  const proposalPath = valueAfter(argv, '--proposal');
  const json = argv.includes('--json');
  if (argv.includes('--contract')) {
    process.stdout.write(`${JSON.stringify(harnessMetaProjectContract(), null, 2)}\n`);
    return;
  }
  if (!proposalPath) {
    process.stderr.write('usage: knowledge-improvement-lifecycle.mjs --proposal <proposal.json> [--json]\n');
    process.exitCode = 2;
    return;
  }

  const result = evaluateImprovementProposal(readProposal(proposalPath));
  if (json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else process.stdout.write(`${result.decision}\n`);
  if (result.decision === 'invalid') process.exitCode = 2;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
