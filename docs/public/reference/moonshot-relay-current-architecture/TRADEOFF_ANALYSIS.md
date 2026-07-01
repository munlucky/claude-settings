# Tradeoff Analysis

| Option | Fit | Benefits | Costs | Risks | Decision |
|---|---|---|---|---|---|
| Option A: Source-owned Brownfield package | High | Durable, validates with existing contract, preserves runtime boundary, clear handoff. | Requires follow-up implementation package for actual harness changes. | Docs can grow stale if not refreshed with code changes. | Accepted |
| Option B: Runtime task output | Medium | Keeps generated work out of source. | Less discoverable as durable baseline; excluded from package payload. | Evidence may be lost or ignored during source review. | Rejected |
| Option C: Profile-local mutation | Low | Immediate local behavior change. | Breaks source authority and design hard stops. | Drift between source, account-root, and local profile. | Rejected |

## Selected Tradeoff

The selected architecture keeps this package as tracked source documentation and treats any runtime/profile adoption as a later controlled implementation phase. This is the least risky way to establish current architecture truth without changing runtime behavior.
