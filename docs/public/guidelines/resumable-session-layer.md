# Resumable Session Layer

Canonical source guideline for resumable session state and recovery boundaries.

Resumable sessions need a stable objective, current phase, last successful evidence, and next command.
Runtime state may record leases, events, attempts, and verdicts, but generated state is not canonical source.
On restart, prefer reading the latest authoritative state file over replaying chat history.
If recovery changes behavior, record whether it was a normal resume, compatibility fallback, or manual repair.
