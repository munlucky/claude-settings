# Control Plane

The phase runner owns plan-directory resolution, active phase discovery, status reconciliation, and parent-session evidence collection.

## Authorities

- Source plan package: `00-master-plan-v<version>.md` plus numbered phase docs.
- Runtime status projection: active `phase-status.yaml` as a phase cursor projection only.
- Completion evidence: verifier verdict, scorecard, QA report, handoff, and final repository closeout.

Do not treat child chat output or stale project memory as completion authority.
