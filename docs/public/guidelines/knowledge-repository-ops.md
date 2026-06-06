# Knowledge Repository Ops

Canonical source guideline for knowledge repository maintenance and audit operations.

Knowledge repository changes must distinguish canonical source, account-root state, and generated project-local state.
Run the active knowledge audit after structural doc or knowledge layout changes when the entrypoint is installed.
Do not package sqlite databases, logs, traces, cache directories, or verdict JSON as source knowledge.
Migration work should report source path, destination path, preservation behavior, and cleanup boundaries.
