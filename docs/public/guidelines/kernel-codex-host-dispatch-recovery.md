# Kernel Codex Host dispatch recovery

Last-Reviewed: 2026-08-29

## Failure chain

The August 2026 dispatch incident had two primary causes and two downstream
symptoms. They must not be reported as one generic worker failure.

| Order | Classification | Observed condition | Host response |
|---|---|---|---|
| 1 | Primary: authentication | The isolated Kernel Codex provider home had no usable authentication while the unrelated user Codex home was signed in. The child reached the API and returned HTTP 401. | Fail before spawn with `codex_isolated_auth_missing`. Do not copy, link, read, hash, or log the other home's credential. |
| 2 | Primary: runtime compatibility | A user-home `models_cache.json` required Codex CLI 0.150.0 while the selected executable reported 0.145.0. | Fail before spawn with `codex_runtime_version_mismatch`, naming only executable/cache versions and paths. |
| 3 | Primary: effective permission | A later Host retry correctly passed `--sandbox workspace-write`, but its fresh child `turn_context` recorded `approval_policy=never`, `sandbox_policy=read-only`, and a managed root-read permission profile. | Run a fresh non-mutating capability probe before the real worker. Fail closed with `codex_worker_effective_permission_mismatch`; do not try to elevate a Host-managed policy. |
| 4 | Downstream: timeout | A manually constructed user-home/direct-executable worker reached the existing ten-minute worker ceiling. | Preserve the bounded ten-minute ceiling. Extending it only delays the same failure and is explicitly not a fix. A timeout is `codex_cli_timeout`, not proof that the worker failed logically. |
| 5 | Downstream: teardown | Timeout cleanup could observe a PID without complete Windows command/creation lineage and returned `launcher-lineage-incomplete`. | Capture Host spawn identity and an immediate process snapshot. Cleanup uses that retained evidence only when the timeout snapshot is missing metadata; conflicting or reused PIDs remain fail-closed. |

## Pre-spawn contract

Before the real worker starts, the Host checks all of the following:

1. The selected executable reports a parseable CLI version.
2. The effective `CODEX_HOME` has either its own `auth.json` or an explicit
   process credential such as `OPENAI_API_KEY`. Only presence is inspected,
   followed by a redacted `codex login status` capability probe.
3. If `models_cache.json` exists, its `client_version` release line matches the
   selected executable.
4. The launcher uses an absolute native executable directly. A Windows
   PowerShell shim is used only when the selected command is actually a
   PowerShell script or an unresolved command name.
5. For a mutating worker, a fresh `codex exec --json` capability turn uses the
   same sanitized environment, executable, profile, working directory, model,
   effort, and requested `workspace-write` sandbox. Its prompt prohibits tool
   calls, file inspection, and file changes. The probe has its own 15-second
   ceiling and is not allowed to inherit the ten-minute worker timeout.
6. The matching rollout must contain a `turn_context` proving
   `sandbox_policy.type=workspace-write`, without a contradictory managed
   read-only file-system profile. Missing evidence also fails closed.

Pre-spawn failures are typed as `provider/infrastructure`, include a stable
error code and remediation, and run no worker process. Diagnostics may include
paths, version strings, boolean credential availability, and whether credential
contents were inspected. They must never include credential values or file
contents.

An effective permission mismatch is reported as
`codex_worker_effective_permission_mismatch` with `failureStage=pre-spawn` and
classification `provider/infrastructure`. Its diagnostics contain only the
effective sandbox name, approval policy, and a reduced permission summary
(profile type, file-system type, and access labels). A probe timeout is
`codex_worker_permission_probe_timeout`; timeout cleanup still uses the normal
launcher lineage contract.

The safe remediation is to use a Codex Host exposing the native `spawn_agent`
bridge, or a separately authenticated standalone CLI whose probe proves
`workspace-write`. Kernel never invokes `--dangerously-bypass-approvals-and-sandbox`
and never retries the real mutating worker after an unverified or read-only
probe.

## Credential-safe recovery

Kernel provider isolation remains authoritative. A signed-in user home is not
silently adopted because doing so would also adopt its mutable config, model
cache, sessions, and rollout state. The supported recovery is to authenticate
the isolated provider home directly:

```powershell
$env:CODEX_HOME = '<kernel-runtime-home>\providers\codex'
codex login
```

This login is performed by Codex itself. Kernel does not copy an `auth.json`,
create a privileged link, or read credential contents. An operator-provided
process credential is also supported and is reported only as source
`environment`; its name/value is not persisted in the preflight result.

## Timeout and cleanup contract

The Host records the launcher PID, parent PID, command, identifying arguments,
start time, and an immediate Windows process snapshot. At terminal completion
or timeout it:

1. compares the current launcher row with the retained identity;
2. refuses a conflicting creation time or command as possible PID reuse;
3. terminates verified descendants before the launcher;
4. takes a fresh post-cleanup snapshot and reports survivor count;
5. classifies an already-exited launcher with no observed descendants instead
   of converting it to `launcher-lineage-incomplete`.

The Kernel route decision, admission, capsule, usage receipt, distinct worker
session, and worker-report boundaries are unchanged. Preflight and cleanup add
failure evidence; they do not bypass those authorities or manufacture a
successful receipt.
