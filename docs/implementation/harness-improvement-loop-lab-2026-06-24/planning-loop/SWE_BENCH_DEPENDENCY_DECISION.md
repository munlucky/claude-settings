# SWE-bench Dependency Decision

```yaml
decision:
  mode: fake_only_deferred_real
  pinnedRepoOrImage: ""
  versionOrDigest: ""
  networkPolicy: none
  diskBudget: "not allocated in this source-only run"
  sandboxBoundary: "source-local fake fixture only"
  cleanupCommand: "Remove generated .moonshot-relay/tmp/swe-adapter-smoke when no longer needed."
  rollbackCommand: "Remove source-local adapter changes before commit if adapter contract is rejected."
  realExecutionStatus: explicitly_deferred
  skipReason: "Real SWE-bench execution requires an explicit dependency/sandbox decision outside the Phases 01-03 foundation batch."
  approvedBy: "not_applicable_source_only_phase_runner"
```

Fake adapter evidence proves the source-local adapter contract only. It must not be reported as `real_swe_bench_ready`.

