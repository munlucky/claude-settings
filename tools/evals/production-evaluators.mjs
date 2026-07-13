import {
  assessArchitectureFixture,
  assessCompletionFixture,
  assessEvalFixture,
  assessRunLifecycleFixture,
  assessRuntimeCapabilityFixture,
  assessToolDispatchFixture,
} from '../../scripts/lib/control-plane-policy.mjs';
import { checkPolicy } from '../sandbox/policy.mjs';

const evaluators = new Map([
  ['completion_authority', assessCompletionFixture],
  ['tool_dispatch', assessToolDispatchFixture],
  ['sandbox', async (input = {}) => {
    const result = await checkPolicy({ operation: input.operation || 'write', path: input.target || '.' });
    return result.status === 'blocked'
      ? { releaseBlocked: true, reason: 'protected path write blocked' }
      : { releaseBlocked: false, reason: '' };
  }],
  ['run_lifecycle', assessRunLifecycleFixture],
  ['runtime_capability', assessRuntimeCapabilityFixture],
  ['eval', assessEvalFixture],
  ['architecture', assessArchitectureFixture],
]);

export const registerProductionEvaluator = (category, evaluator) => evaluators.set(category, evaluator);

export async function evaluateProductionCase(testcase = {}, options = {}) {
  const evaluator = evaluators.get(testcase.category);
  if (!evaluator) {
    return { status: 'failed', failureClass: 'evaluator_missing', reason: `No production evaluator registered for category: ${testcase.category || '<missing>'}` };
  }
  const timeoutMs = Number(options.timeoutMs || 5_000);
  let timeout;
  try {
    const actual = await Promise.race([
      Promise.resolve(evaluator(testcase.input || {})),
      new Promise((_, reject) => { timeout = setTimeout(() => reject(Object.assign(new Error(`Evaluator timed out after ${timeoutMs}ms`), { code: 'EVALUATOR_TIMEOUT' })), timeoutMs); }),
    ]);
    if (!actual || typeof actual !== 'object' || Array.isArray(actual)) {
      return { status: 'failed', failureClass: 'evaluator_actual_missing', reason: 'Production evaluator returned no object actual' };
    }
    return { status: 'executed', actual };
  } catch (error) {
    return {
      status: 'failed',
      failureClass: error?.code === 'EVALUATOR_TIMEOUT' ? 'evaluator_timeout' : 'evaluator_exception',
      reason: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}
