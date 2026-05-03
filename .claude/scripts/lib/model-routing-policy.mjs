#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveCodexReasoningEffort, resolveEffortProfile } from './effort-profile.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_CONFIG_PATH = path.resolve(SCRIPT_DIR, '..', '..', 'config', 'model-routing.yaml');
const PROFILE_ORDER = ['economy', 'standard', 'deep', 'max'];
const IMPLEMENTATION_STAGES = new Set(['phase_implementation', 'parallel_worker']);

function stripComment(line) {
  let inQuote = false;
  let quote = '';
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if ((char === '"' || char === "'") && (index === 0 || line[index - 1] !== '\\')) {
      if (!inQuote) {
        inQuote = true;
        quote = char;
      } else if (quote === char) {
        inQuote = false;
        quote = '';
      }
    }
    if (char === '#' && !inQuote) {
      return line.slice(0, index);
    }
  }
  return line;
}

function parseScalar(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  if (trimmed === '[]') return [];
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    return trimmed.slice(1, -1).split(',').map((item) => parseScalar(item)).filter((item) => item !== '');
  }
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) return Number(trimmed);
  return trimmed;
}

export function parseSimpleYaml(text) {
  const root = {};
  const stack = [{ indent: -1, value: root }];

  for (const rawLine of String(text || '').split(/\r?\n/)) {
    const withoutComment = stripComment(rawLine).replace(/\s+$/, '');
    if (!withoutComment.trim()) continue;
    const indent = withoutComment.match(/^\s*/)?.[0].length ?? 0;
    const line = withoutComment.trim();
    const match = line.match(/^([^:]+):(.*)$/);
    if (!match) continue;
    const key = match[1].trim();
    const rest = match[2].trim();
    while (stack.length > 1 && indent <= stack.at(-1).indent) {
      stack.pop();
    }
    const parent = stack.at(-1).value;
    if (rest === '') {
      parent[key] = {};
      stack.push({ indent, value: parent[key] });
    } else {
      parent[key] = parseScalar(rest);
    }
  }

  return root;
}

export function loadModelRoutingConfig(configPath = process.env.MOONSHOT_MODEL_ROUTING_CONFIG || DEFAULT_CONFIG_PATH) {
  if (!fs.existsSync(configPath)) {
    return {};
  }
  return parseSimpleYaml(fs.readFileSync(configPath, 'utf8'));
}

function normalizeRuntime(runtime) {
  const value = String(runtime || '').trim().toLowerCase();
  if (value === 'claude-code') return 'claude';
  if (value === 'openai') return 'codex';
  return value || 'auto';
}

function providerForRuntime(config, runtime) {
  const normalized = normalizeRuntime(runtime);
  if (normalized === 'auto' || normalized === 'current') {
    return 'openai';
  }
  return config.defaultProvider?.[normalized] || normalized;
}

function normalizeSignals(signals = {}, env = process.env) {
  const result = new Set();
  if (Array.isArray(signals)) {
    for (const signal of signals) result.add(String(signal || '').trim());
  } else if (signals && typeof signals === 'object') {
    for (const [key, value] of Object.entries(signals)) {
      if (value === true) result.add(key);
    }
    if (Number(signals.repeatedFailureCount || 0) >= 2) {
      result.add('repeated_failure');
    }
  }
  for (const signal of String(env.PHASE_MODEL_SIGNALS || env.MOONSHOT_MODEL_SIGNALS || '').split(',')) {
    if (signal.trim()) result.add(signal.trim());
  }
  if (Number(env.PHASE_REPEATED_FAILURE_COUNT || env.MOONSHOT_REPEATED_FAILURE_COUNT || 0) >= 2) {
    result.add('repeated_failure');
  }
  return [...result].filter(Boolean);
}

function profileIndex(profile) {
  const index = PROFILE_ORDER.indexOf(resolveEffortProfile(profile));
  return index < 0 ? 1 : index;
}

function maxProfile(...profiles) {
  return profiles.reduce((current, next) => (
    profileIndex(next) > profileIndex(current) ? resolveEffortProfile(next) : current
  ), 'economy');
}

function stageProfile(config, stage) {
  return resolveEffortProfile(config.stages?.[stage], 'standard');
}

function signalProfile(config, signals) {
  let selected = 'economy';
  for (const signal of signals) {
    selected = maxProfile(selected, config.signals?.[signal] || 'economy');
  }
  return selected;
}

function requiredCapabilities(config, signals) {
  const capabilities = [];
  for (const signal of signals) {
    const capability = config.capabilitySignals?.[signal];
    if (capability) capabilities.push(capability);
  }
  return [...new Set(capabilities)];
}

function routeSupports(route, capabilities) {
  const supported = Array.isArray(route?.capabilities) ? route.capabilities : [];
  return capabilities.every((capability) => supported.includes(capability));
}

function firstCompatibleRoute(config, provider, profile, capabilities) {
  let index = profileIndex(profile);
  while (index < PROFILE_ORDER.length) {
    const candidateProfile = PROFILE_ORDER[index];
    const route = config.profiles?.[candidateProfile]?.[provider];
    if (route && routeSupports(route, capabilities)) {
      return { profile: candidateProfile, route };
    }
    index += 1;
  }
  const fallbackRoute = config.profiles?.max?.[provider] || {};
  return { profile: 'max', route: fallbackRoute };
}

function parseForcedModel(value) {
  const forced = String(value || '').trim();
  if (!forced) return null;
  const separator = forced.indexOf(':');
  if (separator <= 0) {
    return { provider: '', model: forced };
  }
  return {
    provider: forced.slice(0, separator).trim(),
    model: forced.slice(separator + 1).trim(),
  };
}

function routeReason({ mode, stage, profile, signals, forced, capabilities, resolvedProfile }) {
  if (mode === 'off') return 'model routing disabled; preserving runtime defaults';
  if (forced?.model) return `forced model override for ${stage || 'unknown-stage'}`;
  const parts = [`stage=${stage || 'unknown'}`, `profile=${resolvedProfile || profile}`];
  if (signals.length > 0) parts.push(`signals=${signals.join(',')}`);
  if (capabilities.length > 0) parts.push(`capabilities=${capabilities.join(',')}`);
  return parts.join('; ');
}

export function resolveModelRoute({
  runtime = 'auto',
  stage = 'phase_implementation',
  profile = '',
  signals = {},
  env = process.env,
  config = loadModelRoutingConfig(),
} = {}) {
  const mode = String(env.MOONSHOT_MODEL_ROUTING || config.defaultMode || 'auto').trim().toLowerCase();
  const normalizedRuntime = normalizeRuntime(runtime);
  const provider = providerForRuntime(config, normalizedRuntime);
  const selectedSignals = normalizeSignals(signals, env);
  const forced = parseForcedModel(env.MOONSHOT_FORCE_MODEL);
  const explicitProfile = String(profile || env.PHASE_DISPATCH_EFFORT_PROFILE || env.MOONSHOT_EFFORT_PROFILE || '').trim();
  const requestedProfile = explicitProfile
    ? resolveEffortProfile(explicitProfile)
    : maxProfile(stageProfile(config, stage), signalProfile(config, selectedSignals));

  if (mode === 'off') {
    return {
      provider,
      model: '',
      effort: provider === 'openai'
        ? resolveCodexReasoningEffort({ explicitEffort: env.MOONSHOT_CODEX_REASONING_EFFORT, profile: requestedProfile })
        : '',
      reasoningControl: provider === 'openai' ? 'model_reasoning_effort' : '',
      profile: requestedProfile,
      stage,
      selectionReason: routeReason({ mode, stage, profile: requestedProfile, signals: selectedSignals, capabilities: [] }),
      escalationReason: env.PHASE_DISPATCH_EFFORT_ESCALATION_REASON || env.MOONSHOT_EFFORT_ESCALATION_REASON || '',
    };
  }

  const capabilities = requiredCapabilities(config, selectedSignals);
  const compatible = firstCompatibleRoute(config, forced?.provider || provider, requestedProfile, capabilities);
  const resolvedProvider = forced?.provider || provider;
  const baseRoute = compatible.route || {};
  const selectedModel = forced?.model
    || (resolvedProvider === 'anthropic' && IMPLEMENTATION_STAGES.has(stage) && compatible.profile === 'deep'
      ? baseRoute.implementationModel || baseRoute.model
      : baseRoute.model)
    || '';
  const selectedEffort = resolvedProvider === 'openai'
    ? resolveCodexReasoningEffort({
      explicitEffort: env.PHASE_DISPATCH_CODEX_REASONING_EFFORT || env.MOONSHOT_CODEX_REASONING_EFFORT,
      profile: compatible.profile,
    })
    : String(baseRoute.effort || '');

  return {
    provider: resolvedProvider,
    model: selectedModel,
    effort: selectedEffort,
    reasoningControl: String(baseRoute.reasoningControl || ''),
    profile: compatible.profile,
    stage,
    selectionReason: routeReason({
      mode,
      stage,
      profile: requestedProfile,
      signals: selectedSignals,
      forced,
      capabilities,
      resolvedProfile: compatible.profile,
    }),
    escalationReason: env.PHASE_DISPATCH_EFFORT_ESCALATION_REASON || env.MOONSHOT_EFFORT_ESCALATION_REASON || '',
  };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function runSelfTest() {
  const config = loadModelRoutingConfig();
  const baseEnv = { MOONSHOT_MODEL_ROUTING: 'auto' };
  assert(resolveModelRoute({ runtime: 'codex', stage: 'docs_only', env: baseEnv, config }).profile === 'economy', 'docs-only selects economy');
  assert(resolveModelRoute({ runtime: 'codex', stage: 'phase_implementation', env: baseEnv, config }).profile === 'standard', 'implementation selects standard');
  assert(resolveModelRoute({ runtime: 'codex', stage: 'phase_implementation', signals: ['security'], env: baseEnv, config }).profile === 'deep', 'security escalates deep');
  assert(resolveModelRoute({ runtime: 'codex', stage: 'phase_implementation', signals: { repeatedFailureCount: 2 }, env: baseEnv, config }).profile === 'deep', 'repeated failure escalates');
  const capabilityRoute = resolveModelRoute({ runtime: 'codex', stage: 'docs_only', signals: ['computer_use'], env: baseEnv, config });
  assert(capabilityRoute.profile === 'standard', 'capability fallback uses next compatible profile');
  assert(capabilityRoute.model === 'gpt-5.4-mini', 'capability fallback does not choose cheapest model');
  const forcedRoute = resolveModelRoute({ runtime: 'codex', stage: 'phase_implementation', env: { ...baseEnv, MOONSHOT_FORCE_MODEL: 'openai:gpt-5.5' }, config });
  assert(forcedRoute.model === 'gpt-5.5' && forcedRoute.selectionReason.includes('forced'), 'forced model is recorded');
  const claudeRoute = resolveModelRoute({ runtime: 'claude', stage: 'phase_implementation', signals: ['security'], env: baseEnv, config });
  assert(claudeRoute.model === 'sonnet' && claudeRoute.effort === 'high', 'Claude deep implementation uses sonnet high');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === 'self-test') {
    runSelfTest();
    process.stdout.write('model-routing-policy self-test passed\n');
  } else if (process.argv[2] === 'env') {
    const route = resolveModelRoute({
      runtime: process.argv[3] || 'codex',
      stage: process.argv[4] || 'phase_implementation',
      profile: process.argv[5] || '',
    });
    for (const [key, value] of Object.entries({
      MODEL_ROUTE_PROVIDER: route.provider,
      MODEL_ROUTE_MODEL: route.model,
      MODEL_ROUTE_EFFORT: route.effort,
      MODEL_ROUTE_REASONING_CONTROL: route.reasoningControl,
      MODEL_ROUTE_PROFILE: route.profile,
    })) {
      process.stdout.write(`${key}=${String(value || '')}\n`);
    }
  } else {
    const route = resolveModelRoute({
      runtime: process.argv[2] || 'codex',
      stage: process.argv[3] || 'phase_implementation',
    });
    process.stdout.write(`${JSON.stringify(route, null, 2)}\n`);
  }
}
