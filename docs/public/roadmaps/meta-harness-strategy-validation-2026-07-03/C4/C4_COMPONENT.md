# C4 Component

## Proposed Components

| Component | Responsibility | Authority |
|---|---|---|
| `harness-history` CLI | Build and query generated experience index. | Non-authoritative evidence view. |
| Experience index writer | Normalize run, compare, baseline, and closeout metadata. | Generated state only. |
| `lab:evolve` proposal writer | Record child-run proposal and consulted evidence. | Non-authoritative proposal evidence. |
| Environment snapshot collector | Capture redacted runtime/tool availability. | Diagnostic evidence. |
| Search fixture scorer | Provide failure-rich search signal. | Evaluation input, not promotion authority. |
| Existing H0 lab | Compare, promote, rollback, closeout. | Promotion authority. |
