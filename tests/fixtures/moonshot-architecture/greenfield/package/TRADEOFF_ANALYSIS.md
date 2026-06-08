# Tradeoff Analysis

| Driver ID | Driver | Weight | Source |
|---|---|---|---|
| DRV-001 | Preserve request correctness before UI polish. | high | ASR-001 |
| DRV-002 | Keep reviewer audit notes immutable. | high | ASR-002 |

## Recommendation

Selected option: OPT-001.

Rejected alternatives: OPT-002 was rejected because direct table access makes audit behavior harder to verify and weakens the command boundary.
