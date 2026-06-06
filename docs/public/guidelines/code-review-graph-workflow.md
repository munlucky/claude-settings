# Code Review Graph Workflow

Canonical source guideline for code-review graph usage. Use `docs/public/guidelines/` paths for durable guideline references.

Use Code Review Graph when a task needs impact radius, import relationships, large-function discovery, or review context reduction.
Do not treat Code Review Graph as a replacement for MemoryGraph; it is code-structure evidence, not durable policy memory.
Generated analysis state belongs under `.code-review-graph/` and must stay out of package payloads and normal staging.
When a stage cites graph output, include the command or MCP query used and the affected source paths in the evidence note.
