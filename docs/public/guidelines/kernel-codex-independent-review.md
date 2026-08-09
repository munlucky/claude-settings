# Kernel Codex Independent Review Host

Kernel reviews that satisfy protected judgments must be routed by the Host. A separately opened Codex task that calls `kernel next` directly is intentionally rejected because it has no route decision, read-only capsule, admission, or usage receipt.

The installed Host command closes that chain with a fresh `codex exec` session:

```powershell
kernel-host review --run-id <run-id> --project-root <project-root> --json
```

The Host command:

1. asks Kernel for a reviewer route and read-only capsule;
2. admits the explicit Codex model and read-only sandbox;
3. starts a fresh persisted Codex session with JSONL telemetry and a fixed output schema;
4. records the observed session, model, usage, capsule, and admission;
5. ingests the structured verdict and returns the Kernel-issued `reviewReceiptId`.

Optional `--image <absolute-path>` arguments attach visual evidence to the reviewer session. The command never accepts a caller-supplied reviewer identity or receipt. Same-session, missing-model, writable, stale-subject, and incomplete-lineage attempts fail closed.

