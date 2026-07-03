# ADR-0005: Repeat-Or-Contract-Backed Candidates

## Status

Accepted.

## Context

Prior harness postmortem work established that one project-specific symptom is not enough to justify a harness patch.

## Decision

`retro propose` may create harness improvement candidates only when evidence is repeated, contract-backed, source/template-backed, cross-project, or represented by a project-neutral failing/missing regression test.

## Consequences

- Daily retro may record isolated observations without creating proposals.
- Candidate quality should improve.
- Some legitimate first occurrences remain watch items until more evidence exists.

