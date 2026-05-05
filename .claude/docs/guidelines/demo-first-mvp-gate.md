# Demo-first MVP Gate

## Purpose

Use this profile when an MVP must be validated by a clickable/mock user demo before Real Functional work starts.

This profile does not replace the existing harness flow. It adds a maturity gate inside:

```text
PRD / SPEC / UI
-> phase/slice plan
-> SPRINT_CONTRACT
-> implementation
-> QA_REPORT / SCORECARD / HANDOFF
```

## Profile

```yaml
mvpMethodology:
  profile: demo_first
  sliceId: "<stable-slice-id>"
  maturityTarget: "demo_ready_ui | mock_functional_demo | demo_evidence_capture | user_demo_approval | real_functional | real_functional_verification | production_hardening"
  demoGate:
    required: true
    mode: hard_stop
    approvalSource: "docs/implementation/USER_DEMO_APPROVAL.md"
    evidenceSource: "docs/implementation/DEMO_EVIDENCE.md"
    mockContractSource: "docs/implementation/MOCK_API_CONTRACT.md"
    blocks:
      - real_functional
      - production_backend
      - real_persistence
      - auth_integration
      - irreversible_migration
```

## Maturity Order

```text
Demo Ready UI
-> Mock Functional Demo
-> Demo Evidence Capture
-> User Demo Approval
-> Real Functional
-> Real Functional Verification
-> Production Hardening
```

Real Functional phases are not executable until `USER_DEMO_APPROVAL.md` is `approved` with a non-empty approved scope.

## Execution Pack

For demo-first MVP work, generate or refresh these documents under the plan/package root:

- `MVP_SCOPE.md`
- `MINI_ARCHITECTURE.md`
- `UI_DEMO_PLAN.md`
- `UI_FLOW_MAP.md`
- `UI_STATE_MATRIX.md`
- `MOCK_SCENARIOS.md`
- `MOCK_API_CONTRACT.md`
- `USER_DEMO_TEST.md`
- `DEMO_EVIDENCE.md`
- `USER_DEMO_APPROVAL.md`
- `POST_DEMO_IMPLEMENTATION_PLAN.md`
- `UI_CHANGE_REQUEST.md`

## Pre-approval Boundary

Allowed before user demo approval:

- mock API contract
- typed request/response interface
- fixture schema
- mock handler
- in-memory state
- localStorage-based demo persistence
- browser/user-flow demo evidence

Blocked before user demo approval:

- production DB migration
- irreversible schema decision
- real auth provider integration
- production background job
- production payment workflow
- real persistence closeout

## Approval Contract

`USER_DEMO_APPROVAL.md` is the approval truth source. It must use this minimum schema:

```yaml
approval: "pending | approved | rejected | invalidated"
approvedAt: ""
approvedBy: "user"
approvedScope:
  sliceId: ""
  maturityTarget: "mock_functional_demo"
  routes: []
  flows: []
  states: []
  mockScenarios: []
  evidenceSource: "docs/implementation/DEMO_EVIDENCE.md"
knownIssues: []
blockedChanges:
  - approved_routes_change
  - primary_cta_change
  - core_flow_order_change
requiresReapprovalIf:
  - route_structure_changes
  - primary_cta_changes
  - flow_order_changes
  - mock_response_shape_changes
  - approved_state_removed
```

If Real Functional work needs an approved UI-flow change:

1. Record the reason and impact in `UI_CHANGE_REQUEST.md`.
2. Change `USER_DEMO_APPROVAL.md` to `approval: invalidated`.
3. Refresh the mock demo and `DEMO_EVIDENCE.md`.
4. Resume Real Functional only after user reapproval.

## Completion Rules

- `Mock Functional Demo` requires mock success path evidence and mock error path evidence.
- `Demo Evidence Capture` requires a demo run command and tested route/flow evidence.
- `User Demo Approval` requires `approval: approved` plus non-empty approved scope.
- `Real Functional` cannot use mock-only evidence for `FULL`, `done`, or `clean_finish`.
- `Real Functional` requires contract parity between `MOCK_API_CONTRACT.md` and real API response evidence.
- Plan-directory completion requires every in-scope demo-first slice to pass through `real_functional_verification`.
