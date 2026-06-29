# Independent Reviewer A

Reviewed package root: `docs/implementation/containerized-harness-lab-loop-2026-06-24`

## Blocking Findings From Source Draft

1. The source draft was a single design file, not a runnable plan package with master plan, phase docs, dependencies, owned paths, read-only paths, write-set boundaries, and phase evidence slots.
2. Docker/npm work was named without policy-source mapping.
3. Candidate isolation was not enforceable: candidate must not mount baseline outputs, host Docker socket, or live account-root paths.
4. Baseline acquisition was ambiguous after the worktree has changed.
5. Comparator referenced aggregate fields without a concrete result schema.
6. Acceptance criteria used vague evidence labels.
7. Surface classification was missing for source, Docker, generated lab state, baseline artifacts, and installed account-root surfaces.
8. Promotion needed immutable hashes, atomic pointer update, and partial-failure behavior.

## Parent-Accepted Changes

- Created a slugged plan package root with master plan and five phase docs.
- Added policy source mapping and missing Docker publish policy blocker.
- Added surface classification table.
- Added phase metadata blocks with dependencies, paths, write-set boundaries, and evidence slots.
- Added concrete acceptance matrix with phase evidence paths.
- Added isolation, baseline artifact, comparator, promotion, rollback, and calibration contracts.

## Remaining Ambiguity

- Docker registry publish policy is still missing and remains a blocker for image publication.
- Whether Docker files become shipped package payload is undecided and remains out of scope for v1.

