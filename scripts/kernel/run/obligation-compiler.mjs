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
  commandClasses: ['unit-test', 'integration-test', 'e2e', 'static-analysis', 'build', 'script'],
});

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
} = {}) => {
  const projectCommands = commands || discoverProjectCommands({ projectRoot });
  const tierObligations = [...requiredChecks];
  const compiled = new Map();

  const declare = (obligationId, { sourceType, sourceRef = null, acceptanceIds = [], commandRefs = null, evidenceClass = null, method = null }) => {
    const policy = obligationPolicyFor(obligationId);
    const resolvedClass = evidenceClass || policy.evidenceClass;
    const allowed = resolvedClass === 'judgment'
      ? []
      : (commandRefs && commandRefs.length > 0
        ? commandRefs
        : commandRefsForClasses({ projectRoot, classes: policy.commandClasses, commands: projectCommands }));

    const existing = compiled.get(obligationId);
    if (existing) {
      existing.acceptanceIds = [...new Set([...existing.acceptanceIds, ...acceptanceIds])];
      return existing;
    }
    const obligation = {
      obligationId,
      evidenceClass: resolvedClass,
      verificationMethod: resolvedClass === 'judgment' ? (method || 'structured-judgment') : (method || 'kernel-executed-command'),
      allowedCommandRefs: [...new Set(allowed)],
      acceptanceIds: [...new Set(acceptanceIds)],
      protected: isProtectedObligation(obligationId),
      sourceType,
      sourceRef,
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
    throw new ObligationBindingError(
      'OBLIGATION_UNSATISFIABLE',
      `Obligation "${obligation.obligationId}" has no project command that can prove it; declare one in the project manifest or report an unsupported-verification blocker`,
      { obligationId: obligation.obligationId },
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
