export const BROWSER_REPAIR_MAX_ATTEMPTS = 2;

export const REQUIRED_BROWSER_SCENARIO_FIELDS = [
  'schemaVersion',
  'scenarioId',
  'evidenceDepth',
  'expectedUrl',
  'expectedText',
  'expectedRole',
  'expectedName',
  'requiredArtifactTypes',
  'playwrightRequired',
  'taskVerificationClass',
  'failurePolicy',
];

export const REQUIRED_FORBIDDEN_REPAIR_MUTATIONS = [
  'delete_test',
  'weaken_assertion',
  'change_expected_text',
  'update_baseline',
];

const DEFAULT_ALLOWED_SCENARIO_KEYS = new Set([
  ...REQUIRED_BROWSER_SCENARIO_FIELDS,
  'description',
  'baseUrl',
  'playwrightWaiver',
  'determinismRequired',
]);

export const validateBrowserScenarioContract = (scenario = {}, { schema = null } = {}) => {
  const errors = [];
  const requiredFields = Array.isArray(schema?.required) ? schema.required : REQUIRED_BROWSER_SCENARIO_FIELDS;
  for (const field of requiredFields) {
    if (!Object.hasOwn(scenario, field)) errors.push(`missing ${field}`);
  }

  const allowedKeys = schema?.properties
    ? new Set(Object.keys(schema.properties))
    : DEFAULT_ALLOWED_SCENARIO_KEYS;
  for (const key of Object.keys(scenario || {})) {
    if (!allowedKeys.has(key)) errors.push(`additional property ${key}`);
  }

  const evidenceDepthEnum = schema?.properties?.evidenceDepth?.enum || [
    'smoke',
    'open-act',
    'open-act-mutate-persist-recover',
    'agentic-browser-confirmation',
  ];
  if (!evidenceDepthEnum.includes(scenario.evidenceDepth)) {
    errors.push(`invalid evidenceDepth ${scenario.evidenceDepth}`);
  }

  if (!Array.isArray(scenario.requiredArtifactTypes) || scenario.requiredArtifactTypes.length < 1) {
    errors.push('requiredArtifactTypes must not be empty');
  }

  if (scenario.playwrightRequired === false) {
    if (!scenario.playwrightWaiver) {
      errors.push('playwrightWaiver is required when playwrightRequired=false');
    } else {
      if (!String(scenario.playwrightWaiver.reason || '').trim()) errors.push('playwrightWaiver.reason is required');
      if (!String(scenario.playwrightWaiver.approvedBy || '').trim()) errors.push('playwrightWaiver.approvedBy is required');
    }
  }

  if (scenario.taskVerificationClass?.criticalScenario === true && scenario.playwrightRequired !== true) {
    errors.push('critical scenarios require playwrightRequired=true');
  }

  const policy = scenario.failurePolicy || {};
  if (!Object.hasOwn(policy, 'maxRepairAttempts')) {
    errors.push('failurePolicy.maxRepairAttempts is required');
  }
  const maxRepairAttempts = Number(policy.maxRepairAttempts);
  if (!Number.isInteger(maxRepairAttempts)) {
    errors.push('failurePolicy.maxRepairAttempts must be an integer');
  } else if (maxRepairAttempts < 1) {
    errors.push('failurePolicy.maxRepairAttempts must be at least 1');
  } else if (maxRepairAttempts > BROWSER_REPAIR_MAX_ATTEMPTS) {
    errors.push(`failurePolicy.maxRepairAttempts cannot exceed ${BROWSER_REPAIR_MAX_ATTEMPTS}`);
  }
  if (!Object.hasOwn(policy, 'preserveScenarioId')) {
    errors.push('failurePolicy.preserveScenarioId is required');
  }
  if (policy.preserveScenarioId !== true) {
    errors.push('failurePolicy.preserveScenarioId must be true');
  }
  if (!Object.hasOwn(policy, 'preserveFailingAssertionIds')) {
    errors.push('failurePolicy.preserveFailingAssertionIds is required');
  }
  if (policy.preserveFailingAssertionIds !== true) {
    errors.push('failurePolicy.preserveFailingAssertionIds must be true');
  }
  if (!Object.hasOwn(policy, 'fallbackAuthority')) {
    errors.push('failurePolicy.fallbackAuthority is required');
  }
  if (policy.fallbackAuthority !== 'diagnosis_only') {
    errors.push('failurePolicy.fallbackAuthority must be diagnosis_only');
  }

  const forbidden = policy.forbiddenMutations;
  if (!Array.isArray(forbidden)) {
    errors.push('failurePolicy.forbiddenMutations is required');
  } else {
    for (const mutation of REQUIRED_FORBIDDEN_REPAIR_MUTATIONS) {
      if (!forbidden.includes(mutation)) errors.push(`missing forbidden mutation ${mutation}`);
    }
  }

  return errors;
};

export const normalizeBrowserScenarioContract = (scenario = {}, options = {}) => {
  const errors = validateBrowserScenarioContract(scenario, options);
  if (errors.length > 0) {
    throw new Error(`invalid browser scenario contract: ${errors.join('; ')}`);
  }
  return {
    schemaVersion: 1,
    scenarioId: String(scenario.scenarioId),
    description: String(scenario.description || ''),
    evidenceDepth: String(scenario.evidenceDepth),
    baseUrl: String(scenario.baseUrl || ''),
    expectedUrl: String(scenario.expectedUrl || ''),
    expectedText: String(scenario.expectedText || ''),
    expectedRole: String(scenario.expectedRole || ''),
    expectedName: String(scenario.expectedName || ''),
    requiredArtifactTypes: [...new Set(scenario.requiredArtifactTypes.map(String))],
    playwrightRequired: scenario.playwrightRequired === true,
    playwrightWaiver: scenario.playwrightWaiver || null,
    determinismRequired: scenario.determinismRequired === true,
    taskVerificationClass: {
      taskType: String(scenario.taskVerificationClass?.taskType || ''),
      requiresBrowserEvidence: scenario.taskVerificationClass?.requiresBrowserEvidence === true,
      requiresIntegrationEvidence: scenario.taskVerificationClass?.requiresIntegrationEvidence === true,
      criticalScenario: scenario.taskVerificationClass?.criticalScenario === true,
      waiver: scenario.taskVerificationClass?.waiver || null,
    },
    failurePolicy: {
      maxRepairAttempts: Math.max(1, Math.min(BROWSER_REPAIR_MAX_ATTEMPTS, Number(scenario.failurePolicy.maxRepairAttempts))),
      preserveScenarioId: true,
      preserveFailingAssertionIds: true,
      fallbackAuthority: 'diagnosis_only',
      forbiddenMutations: [...new Set(scenario.failurePolicy.forbiddenMutations.map(String))],
    },
  };
};

export const browserScenarioRepairPolicy = (scenario = {}, options = {}) => (
  normalizeBrowserScenarioContract(scenario, options).failurePolicy
);
