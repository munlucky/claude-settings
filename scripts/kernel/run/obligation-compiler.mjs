// Obligation compilation (P0-2/P0-3/P0-5).
//
// A run's obligations are fixed at start from three authorities:
//   1. the proof policy's required checks for the resolved tier,
//   2. the evidence plan of every acceptance criterion,
//   3. obligations the caller explicitly declared.
//
// Each compiled obligation records HOW it may be satisfied — its evidence
// class and the exact set of project command refs that can prove it. Without
// this binding a model can name an obligation `unit-test` and satisfy it with
// any passing command, which is the false-completion path this closes.

import { KERNEL_POLICY } from '../policy.mjs';
import { isProtectedObligation } from '../proof/protected-obligations.mjs';
import { discoverProjectCommands, commandRefsForClasses } from '../proof/command-catalog.mjs';
import { matchPathScope } from '../knowledge/path-scope.mjs';

export class ObligationBindingError extends Error {
  constructor(code, message, detail = {}) {
    super(message);
    this.name = 'ObligationBindingError';
    this.code = code;
    this.detail = detail;
  }
}

const DEFAULT_OBLIGATION_POLICY = Object.freeze({
  evidenceClass: 'hard',
  commandClasses: [
    'unit-test',
    'integration-test',
    'e2e',
    'static-analysis',
    'build',
    'runtime-reproduction',
    'runtime-observation',
    'deployment',
    'post-deployment-observation',
    'script',
  ],
});

// An evidence plan names how a criterion will be proven. Its command refs are
// therefore subject to the SAME classification check as a policy obligation —
// otherwise a plan saying `{ class: 'hard', method: 'unit-test',
// commandRefs: ['noop'] }` would bind a no-op script as hard evidence and walk
// straight around the binding that P0-2 exists to enforce.
// Matching is by family, not by exact class. Classification is name-based, so
// a project's `test:auth` script reads as `unit-test` even when it is really
// the integration test — demanding an exact class match would reject honest
// plans and push callers to mislabel their method. Families are coarse enough
// to avoid that while still refusing a plainly wrong binding (a linter standing
// in for a browser scenario) and, above all, a `script` that proves nothing.
const TEST_CLASSES = Object.freeze(['unit-test', 'integration-test', 'e2e']);
const ANALYSIS_CLASSES = Object.freeze(['static-analysis', 'build']);
const RUNTIME_CLASSES = Object.freeze([
  'runtime-reproduction',
  'runtime-observation',
  'deployment',
  'post-deployment-observation',
]);
const PROOF_COMMAND_CLASSES = Object.freeze([...TEST_CLASSES, ...ANALYSIS_CLASSES, ...RUNTIME_CLASSES]);

const METHOD_FAMILIES = Object.freeze({
  'unit-test': TEST_CLASSES,
  unit: TEST_CLASSES,
  'integration-test': TEST_CLASSES,
  integration: TEST_CLASSES,
  e2e: TEST_CLASSES,
  'browser-scenario': TEST_CLASSES,
  scenario: TEST_CLASSES,
  'static-analysis': ANALYSIS_CLASSES,
  lint: ANALYSIS_CLASSES,
  typecheck: ANALYSIS_CLASSES,
  build: ANALYSIS_CLASSES,
  'runtime-reproduction': ['runtime-reproduction'],
  'runtime-observation': ['runtime-observation', 'post-deployment-observation'],
  deployment: ['deployment'],
  'post-deployment-observation': ['post-deployment-observation'],
});

export class UnsupportedVerificationError extends Error {
  constructor(unsupported = []) {
    super('unsupported-verification');
    this.name = 'UnsupportedVerificationError';
    this.code = 'unsupported-verification';
    this.errorCode = 'unsupported-verification';
    this.nextAction = 'declare-project-verification-command';
    this.details = { unsupported };
  }
}

export const assertVerificationSupport = (obligations = [], { completionPredicate = null } = {}, { projectMode = null } = {}) => {
  const unsupported = obligations
    .filter((item) => (
      item.evidenceClass === 'hard'
      && item.satisfiable === false
      // A genuine greenfield Run must be able to create its walking skeleton
      // and manifest before proof-policy commands can exist. Only implicit
      // policy obligations are deferred; caller/AC command bindings still
      // fail before Run creation when they are missing or incompatible.
      && !(projectMode === 'greenfield' && item.sourceType === 'proof-policy')
    ))
    .map((item) => ({
      obligationId: item.obligationId,
      sourceType: item.sourceType,
      verificationMethod: item.verificationMethod,
      rejectedCommandRefs: item.rejectedCommandRefs || [],
    }));
  const requiredOutcomes = completionPredicate?.requiredOutcomes || [];
  for (const outcome of requiredOutcomes) {
    if (outcome === 'implemented') continue;
    const bound = obligations.some((item) => (
      item.metadata?.outcome === outcome
      || item.metadata?.outcomes?.includes(outcome)
    ));
    if (!bound) {
      unsupported.push({
        outcome,
        verificationMethod: 'completion-predicate',
        rejectedCommandRefs: [],
        reason: 'required-outcome-has-no-bound-evidence-plan',
      });
    }
  }
  if (unsupported.length > 0) throw new UnsupportedVerificationError(unsupported);
  return obligations;
};

// With no declared method, any command that proves something is acceptable —
// but never a plain `script`, which carries no semantic claim at all.
export const classesForEvidenceMethod = (method) => METHOD_FAMILIES[String(method || '').toLowerCase()] || PROOF_COMMAND_CLASSES;

export const obligationPolicyFor = (obligationId) => {
  const policy = KERNEL_POLICY.obligations?.[obligationId];
  if (!policy) return DEFAULT_OBLIGATION_POLICY;
  return {
    evidenceClass: policy.evidenceClass === 'judgment' ? 'judgment' : 'hard',
    commandClasses: Array.isArray(policy.commandClasses) ? policy.commandClasses : DEFAULT_OBLIGATION_POLICY.commandClasses,
  };
};

const obligationForAcceptancePlan = (item, tierObligations) => {
  const plan = item.evidencePlan;
  if (!plan) return null;
  if (plan.obligationId) return plan.obligationId;
  if (plan.class === 'judgment') return `judgment-${item.id.toLowerCase()}`;
  if (plan.commandRefs.length > 0) return `acceptance-${item.id.toLowerCase()}`;
  // A hard plan with no command of its own rides on the tier's obligations.
  return tierObligations[0] || 'default';
};

// Compiles the immutable obligation set for a run.
export const compileRunObligations = ({
  projectRoot = process.cwd(),
  requiredChecks = ['default'],
  contract,
  contractRevision = 1,
  commands = null,
  knowledgeRecords = [],
  changedPaths = [],
} = {}) => {
  const projectCommands = commands || discoverProjectCommands({ projectRoot });
  const tierObligations = [...requiredChecks];
  const compiled = new Map();

  const declare = (obligationId, { sourceType, sourceRef = null, acceptanceIds = [], commandRefs = null, evidenceClass = null, method = null, metadata = null }) => {
    const policy = obligationPolicyFor(obligationId);
    const resolvedClass = evidenceClass || policy.evidenceClass;
    const hasExplicitPlanCommands = sourceType === 'evidence-plan'
      && resolvedClass !== 'judgment'
      && Array.isArray(commandRefs)
      && commandRefs.length > 0;

    // Command refs requested by an evidence plan are filtered against the
    // catalog and the classes the plan's own method implies. A ref that the
    // project does not declare, or that carries no matching semantic class, is
    // rejected rather than trusted.
    const rejectedCommandRefs = [];
    let allowed;
    if (resolvedClass === 'judgment') {
      allowed = [];
    } else if (commandRefs && commandRefs.length > 0) {
      const permitted = new Set(classesForEvidenceMethod(method));
      allowed = [];
      for (const ref of commandRefs) {
        const command = projectCommands.find((entry) => entry.commandRef === ref);
        if (!command) {
          rejectedCommandRefs.push({ commandRef: ref, reason: 'not-declared-by-project' });
        } else if (!permitted.has(command.commandClass)) {
          rejectedCommandRefs.push({ commandRef: ref, reason: `class-${command.commandClass}-does-not-prove-${method || 'this-obligation'}` });
        } else {
          allowed.push(ref);
        }
      }
    } else {
      allowed = commandRefsForClasses({ projectRoot, classes: policy.commandClasses, commands: projectCommands });
    }

    const existing = compiled.get(obligationId);
    if (existing) {
      existing.acceptanceIds = [...new Set([...existing.acceptanceIds, ...acceptanceIds])];
      if (metadata?.outcome) {
        const outcomes = new Set([
          ...(Array.isArray(existing.metadata?.outcomes) ? existing.metadata.outcomes : []),
          ...(existing.metadata?.outcome ? [existing.metadata.outcome] : []),
          metadata.outcome,
        ]);
        existing.metadata = {
          ...(existing.metadata || {}),
          outcome: outcomes.size === 1 ? [...outcomes][0] : null,
          outcomes: [...outcomes],
        };
      }
      // A plan that explicitly reuses a policy/caller obligation must narrow
      // that obligation to the commands the plan named. Otherwise the tier's
      // broad allowlist (for example every unit-test script) lets an
      // unplanned command satisfy an AC. Multiple explicit plans may share an
      // obligation, so later plans add only their own validated refs.
      if (hasExplicitPlanCommands) {
        const bindingAlreadyNarrowed = existing.metadata?.evidencePlanCommandBinding === true;
        existing.allowedCommandRefs = bindingAlreadyNarrowed
          ? [...new Set([...existing.allowedCommandRefs, ...allowed])]
          : [...new Set(allowed)];
        const rejected = [...(existing.rejectedCommandRefs || []), ...rejectedCommandRefs];
        existing.rejectedCommandRefs = rejected.filter((entry, index, all) => all.findIndex((candidate) => candidate.commandRef === entry.commandRef && candidate.reason === entry.reason) === index);
        existing.metadata = { ...(existing.metadata || {}), evidencePlanCommandBinding: true };
        existing.sourceType = 'evidence-plan';
        existing.sourceRef = existing.sourceRef || sourceRef;
        existing.verificationMethod = method || existing.verificationMethod;
      }
      return existing;
    }
    const obligationMetadata = {
      ...(metadata || {}),
      ...(metadata?.outcome ? { outcomes: [metadata.outcome] } : {}),
      ...(hasExplicitPlanCommands ? { evidencePlanCommandBinding: true } : {}),
    };
    const obligation = {
      obligationId,
      evidenceClass: resolvedClass,
      verificationMethod: resolvedClass === 'judgment' ? (method || 'structured-judgment') : (method || 'kernel-executed-command'),
      allowedCommandRefs: [...new Set(allowed)],
      rejectedCommandRefs,
      acceptanceIds: [...new Set(acceptanceIds)],
      protected: isProtectedObligation(obligationId),
      sourceType,
      sourceRef,
      ...(Object.keys(obligationMetadata).length > 0 ? { metadata: obligationMetadata } : {}),
      contractRevision,
      satisfiable: resolvedClass === 'judgment' || allowed.length > 0,
    };
    compiled.set(obligationId, obligation);
    return obligation;
  };

  for (const check of tierObligations) {
    declare(check, { sourceType: 'proof-policy', sourceRef: 'kernel/proof-policy.yaml' });
  }
  for (const declared of contract?.requiredObligations || []) {
    declare(declared, { sourceType: 'caller', sourceRef: 'task-contract' });
  }
  for (const item of contract?.acceptance || []) {
    const obligationId = obligationForAcceptancePlan(item, tierObligations);
    if (!obligationId) {
      // Unplanned acceptance is covered by the tier obligations; coverage is
      // still enforced at completion.
      for (const check of tierObligations) {
        const existing = compiled.get(check);
        if (existing) existing.acceptanceIds = [...new Set([...existing.acceptanceIds, item.id])];
      }
      continue;
    }
    declare(obligationId, {
      sourceType: 'evidence-plan',
      sourceRef: item.id,
      acceptanceIds: [item.id],
      commandRefs: item.evidencePlan?.commandRefs?.length ? item.evidencePlan.commandRefs : null,
      evidenceClass: item.evidencePlan?.class || null,
      method: item.evidencePlan?.method || null,
      metadata: { outcome: item.evidencePlan?.outcome || null },
    });
  }

  // Project-owned required_verification records are executable only when the
  // changed scope intersects the record's declared scope. The Kernel carries
  // command refs and freshness metadata but does not interpret project domain
  // semantics or invent pass rules.
  for (const record of Array.isArray(knowledgeRecords) ? knowledgeRecords : []) {
    const type = record?.type || record?.recordType;
    if (type !== 'required_verification' || ['superseded', 'rejected', 'archived'].includes(record.status)) continue;
    const scope = Array.isArray(record.scope) ? record.scope : [];
    if (!Array.isArray(changedPaths) || changedPaths.length === 0) continue;
    if (scope.length > 0 && !changedPaths.some((changedPath) => matchPathScope(changedPath, scope))) continue;
    const verification = record.verification || record.recordJson?.verification || {};
    const commandRefs = Array.isArray(verification.commandRefs) ? verification.commandRefs : [];
    const obligationId = String(verification.obligationId || `required-verification-${record.id || record.recordId || 'record'}`);
    declare(obligationId, {
      sourceType: 'knowledge',
      sourceRef: record.id || record.recordId || null,
      commandRefs,
      evidenceClass: 'hard',
      method: verification.method || null,
      metadata: {
        scope,
        receiptContractRef: verification.receiptContractRef || record.receiptContractRef || null,
        freshnessInputs: Array.isArray(verification.freshnessInputs) ? verification.freshnessInputs : (record.freshnessInputs || []),
      },
    });
  }

  return [...compiled.values()];
};

// Verification-time binding check (P0-2). A Kernel-executed command may only
// stand as evidence for an obligation whose allowlist contains it.
export const assertCommandBinding = (obligation, commandRef) => {
  if (!obligation) return;
  if (obligation.evidenceClass === 'judgment') {
    throw new ObligationBindingError(
      'OBLIGATION_REQUIRES_JUDGMENT',
      `Obligation "${obligation.obligationId}" is a judgment obligation and cannot be satisfied by running a command`,
      { obligationId: obligation.obligationId },
    );
  }
  if (!commandRef) return;
  if (obligation.allowedCommandRefs.length === 0) {
    const rejected = (obligation.rejectedCommandRefs || []).map((entry) => `${entry.commandRef} (${entry.reason})`);
    throw new ObligationBindingError(
      'OBLIGATION_UNSATISFIABLE',
      rejected.length > 0
        ? `Obligation "${obligation.obligationId}" has no usable command: the evidence plan named ${rejected.join(', ')}. Name a project command that actually performs this kind of verification, or report an unsupported-verification blocker`
        : `Obligation "${obligation.obligationId}" has no project command that can prove it; declare one in the project manifest or report an unsupported-verification blocker`,
      { obligationId: obligation.obligationId, rejectedCommandRefs: obligation.rejectedCommandRefs || [] },
    );
  }
  if (!obligation.allowedCommandRefs.includes(commandRef)) {
    throw new ObligationBindingError(
      'COMMAND_NOT_BOUND_TO_OBLIGATION',
      `Command "${commandRef}" is not bound to obligation "${obligation.obligationId}" (allowed: ${obligation.allowedCommandRefs.join(', ') || 'none'})`,
      { obligationId: obligation.obligationId, commandRef, allowedCommandRefs: obligation.allowedCommandRefs },
    );
  }
};
