# Architecture Brief

## Source

Input: `tests/fixtures/moonshot-architecture/greenfield/input/PRD.md`

## Success Criteria

- REQ-001 is linked to ASR, QAS, ADR, task owner, and Verification Signal.
- REQ-002 is linked to ASR, QAS, ADR, task owner, and Verification Signal.
- Brownfield current architecture evidence is not required.

## Verification Signal

`node scripts/architecture-artifact-validate.mjs --mode greenfield_prd --path tests/fixtures/moonshot-architecture/greenfield/package`
