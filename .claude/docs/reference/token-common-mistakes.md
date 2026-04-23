# Token Common Mistakes

## Common Waste Patterns

- Loading `docs/guidelines/**` broadly instead of one active file
- Replaying raw `git diff`, parity logs, or review logs in chat
- Keeping full templates inside skill bodies when a reference file would do
- Re-reading old session logs instead of the latest `HANDOFF.md` and session index
- Passing whole file contents to sub-agents instead of file paths and line references

## What To Do Instead

- Use compact command entrypoints first
- Use the context graph to identify likely dependent files before reading
- Keep active docs short and archive the rest
- Keep handoff/session state in summary form plus artifact links
- Move verbose examples and templates into `docs/reference/**` or `templates/**`
