---
paths:
  - ".claude/agents/**/*.md"
---

# Agent Definition Rules

- All agents must follow the canonical format defined in `.claude/CLAUDE.md`.
- Include clear role description, capabilities, and output format.
- Maintain both English (`.md`) and Korean (`.ko.md`) versions.
- Document agent-specific tools and available contexts.
- In `## References`, list only agent-specific supplemental docs.
- Do not repeat globally injected defaults (`.claude/CLAUDE.md`, `.claude/PROJECT.md`) in `## References` unless section-level anchors are required.
