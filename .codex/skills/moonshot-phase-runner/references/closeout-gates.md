# Phase Runner Closeout Gates

- Code-changing phases require review evidence before clean finish.
- Fresh verifier verdict, scorecard, QA report, handoff, attempt manifest, and phase status must agree.
- Run `phase-closeout-finalize.mjs finalize` before advancing a phase.
- Run `verify-phase-closeout.mjs` after finalizer writes to catch stale status, missing attempts, and traceability gaps.
- Repository closeout is a final plan-directory gate. Dirty worktree or upstream drift can remain pending while actionable phases remain.
