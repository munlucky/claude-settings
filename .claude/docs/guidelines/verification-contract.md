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
  browserFlows:
    - name: "dashboard-smoke"
      entry: "/dashboard"
      markers:
        - "Dashboard"
      criticalInteractions:
        - "create item"
        - "delete item"
      passIf:
        - "primary action succeeds"
        - "list refreshes"
artifacts:
  verdict: ".claude/verification-verdict-<runId>.json"
  runtimeVerdict: ".claude/runtime-verdict-<runId>.json"
  sprintContract: ".claude/execution/<slice>/SPRINT_CONTRACT.md"
  qaReport: ".claude/execution/<slice>/QA_REPORT.md"
  handoff: ".claude/execution/<slice>/HANDOFF.md"
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
qa:
  evaluatorMode: "separate"
  hardFailOn:
    - "core_user_flow_broken"
    - "runtime_error"
    - "contract_mismatch"
  criteria:
    functionality:
      threshold: "pass"
      focus:
        - "critical user flow"
        - "state change persists"
    productDepth:
      threshold: "warn"
      focus:
        - "feature is not stub-only"
    visualQuality:
      threshold: "warn"
      focus:
        - "layout is coherent"
        - "UI avoids generic defaults"
    codeQuality:
      threshold: "warn"
      focus:
        - "no obvious dead path"
        - "no route shadowing"
hooks:
  extraChecksCommand: ""
```

## Rules
- The harness owns verdict semantics, not project-specific framework logic.
- Projects declare commands and evidence through the contract.
- Completion criteria should be phrased as checks that can fail reproducibly, not vague quality claims.
- For runtime-heavy or UI-heavy work, prefer a separate evaluator path over generator self-approval.
- Browser/runtime checks should exercise real interactions, not only page-load screenshots.
- `SPRINT_CONTRACT.md` should define the round-level done criteria before implementation starts.
- `QA_REPORT.md` should become the next remediation input when verification fails.
- If the contract is missing:
  - standard profile may continue with warning
  - strict profile should block completion claims
- Project-specific domain checks should be opt-in hooks, not baked into shared verifier scripts.
