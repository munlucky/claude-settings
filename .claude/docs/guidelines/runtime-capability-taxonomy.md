# Runtime Capability Taxonomy

## Failure Classes

- `product_failure`: user-facing behavior or AC/SCN evidence failed. Product gates remain strict.
- `harness_contract_failure`: the workflow contract, scorecard, verdict identity, or closeout invariant failed.
- `runtime_capability_failure`: tool, MCP, MemoryGraph, browser, forked-agent, or runtime adapter capability is missing or degraded.
- `host_environment_failure`: Windows, shell, filesystem, encoding, permission, or command availability issue.

## Policy

- Runtime and host failures must not masquerade as product failures.
- Missing capability blocks only evidence that explicitly requires that capability.
- Adapter smoke and capability preflight never satisfy product acceptance.
- MemoryGraph transport failure is degraded recall unless the user explicitly requested memory persistence.
- Browser absence blocks browser-required evidence only; non-browser work can continue with capability state recorded.
- Host shell failures should include fallback guidance such as native PowerShell, Select-String, or explicit runtime paths.

## Evidence Contract

Every capability outcome records:

- `failureClass`
- `errorCode`
- `capability`
- `requiredEvidence`
- `blocksRequiredEvidence`
- `blocksProductAcceptance`
- `blocksUnrelatedCloseout`
- `fallbackPolicy`
