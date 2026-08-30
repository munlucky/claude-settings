# Kernel Codex Independent Review Host

Kernel reviews that satisfy protected judgments must be routed by the active Host. A separately opened Codex task that calls `kernel next` directly is intentionally rejected because it has no route decision, read-only capsule, admission, or usage receipt.

The native-only Kernel payload does not install a standalone `kernel-host` subprocess command. Any account-root shim that points to a deleted Host module is stale; reinstall the current Kernel payload with `--sync` so the old shim is retired. The active Host must provide the native independent-review bridge and Kernel receipt ingestion.

The active Host bridge:

1. asks Kernel for a reviewer route and read-only capsule;
2. admits the explicit Codex model and read-only sandbox;
3. starts a fresh persisted Codex session with JSONL telemetry and a fixed output schema;
4. records the observed session, model, usage, capsule, and admission;
5. ingests the structured verdict and returns the Kernel-issued `reviewReceiptId`.

The source Host integration boundary is `dispatchKernelTurn`. For a native
review turn it uses the same usage receipt created for the dispatch, passes the
Host-observed reviewer session id to Kernel, and derives the reviewed mutation
revision from the issued capsule. The reviewer output never supplies a receipt,
reviewer identity, or provenance revision. If the native launcher, reviewer
outcome, or lineage is missing, the result stays pending/blocked and no review
receipt is returned.

Optional `--image <absolute-path>` arguments attach visual evidence to the reviewer session. The command never accepts a caller-supplied reviewer identity or receipt. Same-session, missing-model, writable, stale-subject, and incomplete-lineage attempts fail closed.
