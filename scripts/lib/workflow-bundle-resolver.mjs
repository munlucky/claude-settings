import { readFile } from 'node:fs/promises';

const inlineList = (text = '') => {
  const match = String(text).match(/\[([^\]]*)\]/);
  return match ? match[1].split(',').map((item) => item.trim()).filter(Boolean) : [];
};

export const parseConditionalLoading = (source) => {
  const result = {};
  const lines = String(source).split(/\r?\n/);
  let inSection = false;
  let bundle = '';
  let inConditional = false;
  for (const line of lines) {
    if (/^conditionalLoading:\s*$/.test(line)) { inSection = true; continue; }
    if (!inSection) continue;
    if (/^[^\s#]/.test(line)) break;
    const bundleMatch = line.match(/^  ([\w-]+):\s*$/);
    if (bundleMatch) {
      bundle = bundleMatch[1];
      result[bundle] = { requiredNow: [], conditional: {} };
      inConditional = false;
      continue;
    }
    if (!bundle) continue;
    const requiredMatch = line.match(/^    requiredNow:\s*(.*)$/);
    if (requiredMatch) { result[bundle].requiredNow = inlineList(requiredMatch[1]); inConditional = false; continue; }
    if (/^    conditional:\s*\{\}\s*$/.test(line)) { inConditional = false; continue; }
    if (/^    conditional:\s*$/.test(line)) { inConditional = true; continue; }
    const conditionMatch = inConditional && line.match(/^      ([\w-]+):\s*(.*)$/);
    if (conditionMatch) result[bundle].conditional[conditionMatch[1]] = inlineList(conditionMatch[2]);
  }
  return result;
};

export async function resolveWorkflowBundle({ bundleId, conditions = {}, registryPath = 'rules/workflow-bundles.yaml' }) {
  const registry = parseConditionalLoading(await readFile(registryPath, 'utf8'));
  const bundle = registry[bundleId];
  if (!bundle) return { status: 'blocked', reason: 'conditional_bundle_not_found', bundleId, requiredNow: [], activated: [] };
  const activated = Object.entries(bundle.conditional)
    .filter(([condition]) => conditions[condition] === true)
    .flatMap(([, skills]) => skills);
  return {
    status: 'resolved',
    bundleId,
    requiredNow: [...bundle.requiredNow],
    activated: [...new Set(activated)],
    deferredConditions: Object.keys(bundle.conditional).filter((condition) => conditions[condition] !== true),
  };
}

export function resolveEntrypointConditionalSkills({ conditionalSkillGroups = {}, conditions = {} } = {}) {
  const activatedGroups = Object.keys(conditionalSkillGroups).filter((condition) => conditions[condition] === true);
  return {
    status: 'resolved',
    activatedGroups,
    activated: [...new Set(activatedGroups.flatMap((condition) => conditionalSkillGroups[condition] || []))],
    deferredConditions: Object.keys(conditionalSkillGroups).filter((condition) => conditions[condition] !== true),
  };
}
