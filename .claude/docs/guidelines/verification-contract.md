# Verification Contract

Use this document to define how downstream projects declare verification expectations for the harness.

## Recommended File

` .claude/verification.contract.yaml `

## Suggested Shape

```yaml
commands:
  typecheck: "npm run typecheck"
  build: "npm run build"
  test: "npm test"
  lint: "npm run lint"
runtime:
  url: "http://localhost:3000"
  e2eCommand: "npm run test:e2e"
artifacts:
  verdict: ".claude/verification-verdict-<runId>.json"
  runtimeVerdict: ".claude/runtime-verdict-<runId>.json"
strict:
  required: false
  triggers:
    - "auth"
    - "payment"
    - "deployment"
policy:
  allowIndeterminate: true
  requiredChecks:
    - typecheck
    - build
    - lint
  optionalChecks:
    - test
    - runtime
hooks:
  extraChecksCommand: ""
```

## Rules
- The harness owns verdict semantics, not project-specific framework logic.
- Projects declare commands and evidence through the contract.
- If the contract is missing:
  - standard profile may continue with warning
  - strict profile should block completion claims
- Project-specific domain checks should be opt-in hooks, not baked into shared verifier scripts.
