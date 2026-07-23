import { loadAllProjectRecords } from './store.mjs';
import { matchPathScope } from './path-scope.mjs';

export async function evaluateOntologyConstraints({ projectId, paths = [], riskTier = 'T0', env = process.env } = {}) {
  const records = await loadAllProjectRecords(projectId, { env });
  const constraints = records.ontologyConstraints || [];

  const applicable = [];
  const violations = [];
  const approvalRequired = [];
  const verificationsRequired = [];

  for (const constraint of constraints) {
    if (constraint.status === 'superseded' || constraint.status === 'rejected') continue;
    const isApplies = !paths.length || paths.some((p) => matchPathScope(p, constraint.scope || []));
    if (isApplies) {
      applicable.push(constraint);
      if (constraint.severity === 'never') {
        violations.push(constraint);
      } else if (constraint.severity === 'ask_first') {
        approvalRequired.push(constraint);
      } else if (constraint.severity === 'always' || constraint.severity === 'invariant') {
        verificationsRequired.push(constraint);
      }
    }
  }

  const passed = violations.length === 0;

  return {
    passed,
    applicable,
    violations,
    approvalRequired,
    verificationsRequired,
  };
}
