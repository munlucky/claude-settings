// Network policy (§11.5): inherited | blocked | required.
//
// Honesty rule: the Kernel must never record `networkIsolation: 'blocked'`
// unless isolation was actually enforced. By default no portable enforcement
// mechanism exists, so `blocked`/`required` are only satisfiable when the
// host advertises a real sandbox via MOON_RELAY_KERNEL_NETWORK_SANDBOX. When
// isolation is requested but unenforceable, the run is blocked rather than
// falsely marked isolated.

export const VALID_NETWORK_POLICIES = ['inherited', 'blocked', 'required'];

export class NetworkPolicyUnenforceableError extends Error {
  constructor(policy, message) {
    super(message);
    this.name = 'NetworkPolicyUnenforceableError';
    this.code = 'NETWORK_POLICY_UNENFORCEABLE';
    this.policy = policy;
  }
}

// A mechanism is only trusted when the host explicitly declares one; we never
// infer isolation from the ambient environment.
export const probeNetworkEnforcement = ({ env = process.env } = {}) => {
  const mechanism = env.MOON_RELAY_KERNEL_NETWORK_SANDBOX;
  if (mechanism && String(mechanism).trim()) {
    return { enforceable: true, mechanism: String(mechanism).trim() };
  }
  return { enforceable: false, mechanism: null };
};

export const resolveNetworkExecution = ({ policy = 'inherited', env = process.env } = {}) => {
  if (!VALID_NETWORK_POLICIES.includes(policy)) {
    throw new NetworkPolicyUnenforceableError(policy, `Unknown network policy: ${policy}`);
  }
  if (policy === 'inherited') {
    return { networkPolicy: 'inherited', networkIsolation: 'none', enforced: false };
  }

  const probe = probeNetworkEnforcement({ env });
  if (!probe.enforceable) {
    throw new NetworkPolicyUnenforceableError(
      policy,
      `network policy "${policy}" cannot be enforced in this environment; refusing to record a false isolation boundary`,
    );
  }
  return { networkPolicy: policy, networkIsolation: 'blocked', enforced: true, mechanism: probe.mechanism };
};
