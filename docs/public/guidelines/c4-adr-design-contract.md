# C4 and ADR Design Contract

C4 and ADR artifacts make architecture decisions inspectable before implementation.

Use C4 context and container views when system boundaries, runtime ownership, or external integrations matter. Use component views when a phase plan needs concrete module or adapter ownership.

Create ADRs for significant decisions such as architecture style, data boundary, integration strategy, migration path, runtime surface exposure, and compatibility policy.

Each ADR must include context, decision, consequences, rejected alternatives, verification signal, and links to affected requirements or ASRs.

C4 and ADR outputs are design evidence. They do not replace implementation tests, package dry-runs, installer evidence, or runtime-state completion authority.

Do not use C4 diagrams or ADRs to justify speculative Brownfield structure that has not been verified from repository evidence.
