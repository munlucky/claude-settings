# Plan Review Canvas

The plan review canvas is derived output. Markdown and YAML files in the source plan package remain the source of truth.

Generated canvas files should be written under excluded runtime artifact roots such as `.moonshot-relay/plan-canvas/` or phase execution evidence folders. They must not replace, rename, or directly mutate source plan files.

Feedback captured from the canvas must be recorded as structured feedback and applied through an explicit reviewed plan revision.

Canvas renderers may read plan package files and produce static HTML, but they must not write back to `docs/implementation/**` unless a separate plan revision command is explicitly approved.

Canvas feedback is evidence, not authority. It can identify a target file, heading, selector, severity, and disposition, then a reviewer or source-side revision command decides whether to apply it.

Generated HTML, feedback JSON, screenshots, and local review artifacts belong under generated-state roots that are excluded from package payloads by default.

Package or profile exposure of generated canvas artifacts requires an explicit public-surface decision and package contract update.
