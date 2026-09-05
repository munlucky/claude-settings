# Kernel Codex Independent Review Host

Kernel reviews that satisfy protected judgments must be routed by the active Host. A separately opened Codex task that calls `kernel next` directly is intentionally rejected because it has no route decision, read-only capsule, admission, or usage receipt.

The Kernel payload does not install a standalone `kernel-host` subprocess command. Any account-root shim that points to a deleted Host module is stale; reinstall the current Kernel payload with `--sync` so the old shim is retired. The active Host must provide Kernel receipt ingestion and either the native reviewer bridge or the Host-owned independent-subagent transport described below.

The active Host bridge:

1. asks Kernel for a reviewer route and read-only capsule;
2. admits the explicit Codex model and read-only sandbox;
3. starts a fresh persisted Codex session with JSONL telemetry and a fixed output schema. If the native reviewer launcher is unavailable, it may use the Host's `spawn_independent_reviewer` transport as the last fallback;
4. records the observed session, model, usage, capsule, and admission;
5. ingests the structured verdict and returns the Kernel-issued `reviewReceiptId`.

The source Host integration boundary is `dispatchKernelTurn`. A review point
has one reviewer outcome and one Kernel receipt: the native reviewer and the
independent-subagent transport are alternatives, not sequential review
stages. A fallback is attempted only after a pre-spawn transport failure, and
an already-valid receipt for the same run, mutation, obligation, and evidence
set is reused rather than reviewed again. For a native or fallback review turn
it uses the same usage receipt created for the dispatch,
passes the Host-observed reviewer session id to Kernel, and derives the
reviewed mutation revision from the issued capsule. The reviewer output never
supplies a receipt, reviewer identity, or provenance revision. If the native
launcher, fallback launcher, reviewer outcome, or lineage is missing, the
result stays pending/blocked and no review receipt is returned.

The fallback launcher is an internal Host API, not an MCP command and not a
provider CLI workaround. It receives a read-only review capsule and must return
an explicit `reviewTransportAttestation` containing a fresh child session,
requested and observed model/effort, read-only/no-commit/no-delegation flags,
before/after workspace identity, unchanged mutation revision, capsule digest,
and clean child cleanup. A reviewer message or `PASS` string without that
attestation is rejected before the Kernel receipt path.

Optional `--image <absolute-path>` arguments attach visual evidence to the reviewer session. The command never accepts a caller-supplied reviewer identity or receipt. Same-session, missing-model, writable, stale-subject, and incomplete-lineage attempts fail closed.
