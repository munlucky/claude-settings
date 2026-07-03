# Architecture Options

## Option A: Direct Upstream Import

Import Meta-Harness framework concepts and scripts directly.

Decision: reject.

Reasons:

- upstream examples are Python/domain-specific and not aligned to current Node-based harness-lab lifecycle.
- direct import would create a new optimizer authority surface instead of extending existing H0 controls.
- upstream README says the cleaned-up release has not been tested beyond verifying that it runs.

## Option B: Evidence-Navigation Layer

Add generated experience index, history CLI, proposal artifacts, and advisory frontier reports on top of existing lab artifacts.

Decision: accept.

Reasons:

- aligns with the paper's strongest mechanism: full source/score/trace history accessed selectively.
- preserves existing source/runtime boundaries.
- provides immediate operator value even before autonomous proposer work exists.

## Option C: Full Autonomous Harness Search

Add a proposer loop that edits source, runs candidate benchmarks, and selects frontier candidates automatically.

Decision: defer.

Reasons:

- likely valuable later, but requires stronger sandboxing, write ownership, budget caps, rollback controls, and review gates.
- current request is validation, not controlled source mutation.
- must follow `moonshot-phase-runner` style lifecycle if adopted.

## Selected Architecture

Proceed with Option B as Phase 1 and Phase 2. Keep Option C as a later phase only after Option B produces useful evidence and the lab can prove rollback and source isolation.
