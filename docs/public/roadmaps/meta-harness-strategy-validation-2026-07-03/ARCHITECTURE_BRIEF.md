# Architecture Brief

## Mode Classification

- Mode: `meta_harness_design`
- Input source: user request to validate Meta-Harness strategies from arXiv:2603.28052 for `C:\dev\moonshot-relay`
- Architecture package path: `docs/public/roadmaps/meta-harness-strategy-validation-2026-07-03`
- Handoff target: `moonshot-plan-writer`, then `moonshot-phase-runner` for controlled source changes
- Implementation status: not implemented by this package

## Research Basis

Meta-Harness argues that harness optimization improves when the proposer can inspect prior candidate source, scores, and execution traces through a filesystem instead of relying on scalar scores or compressed summaries. The arXiv abstract reports gains on online classification, math retrieval, and TerminalBench-2, including source/score/trace access for all prior candidates and stronger agentic coding results on TerminalBench-2: <https://arxiv.org/abs/2603.28052>.

The paper body describes the key loop: evaluated harnesses contribute directories with source code, scores, and execution traces; the proposer inspects them with ordinary tools, then proposes a new harness. It also states that multi-objective settings should be evaluated with Pareto dominance: <https://arxiv.org/html/2603.28052v1>.

The project page gives a concrete TerminalBench-2 example where a smaller 19-task subset improved from 28.5% to 46.5% by iteration 7, with proposals grounded in raw logs and failure modes: <https://yoonholee.com/meta-harness/>.

The official reference repository contains a framework and examples for text classification and TerminalBench-2, but its README notes the release is a cleaned-up paper codebase and "has not been tested beyond verifying that it runs"; therefore it should be mined for mechanics, not imported wholesale: <https://github.com/stanford-iris-lab/meta-harness>.

## Current Moonshot Fit

Moonshot Relay already has the core evidence substrate:

- H0 authority is `external-bootstrap-lab`, and candidate outputs are evidence inputs rather than promotion authority.
- durable run evidence already exists under `.moonshot-relay/harness-lab/runs/**`, `compare/**`, and `baselines/**`.
- loop runs have `run-spec.json`, hash-chained `events.jsonl`, candidate summaries, compare reports, and closeout receipts.
- `lab:evolve` already records parent lineage, but it does not yet create a proposal artifact or history-informed hypothesis.

## Feature Verdict

| Feature | Verdict | Why |
|---|---|---|
| Harness Experience Store | scaled adoption as generated read-model | Strong paper match, but current artifacts already exist; add an index, not a second authority store. |
| `harness-history` CLI | adopt read-only | Makes the existing evidence plane queryable without weakening H0 authority. |
| `lab:evolve` proposal artifact | adopt | Converts lineage-only evolve into evidence-grounded proposal discipline. |
| Failure-rich search fixture set | adopt | Needed because current default gate is a promotion gate, not a good search surface. |
| Run environment snapshot | adopt fail-soft | Paper's TerminalBench-2 appendix supports bootstrap value when environment is non-obvious. |
| Pareto/frontier ranking | defer until history/read-model exists | Useful, but must not replace promotion policy or run before comparable candidate history is queryable. |

## Integrated Adoption Order

1. ADR/ASR/traceability gates.
2. Failure-rich search fixtures and redacted environment snapshots, because these create measurable improvement signal without changing promotion authority.
3. Read-only history CLI and generated experience read-model over existing run/baseline/compare artifacts.
4. `lab:evolve` proposal artifact as child-run evidence only.
5. Advisory frontier report after enough comparable history exists.

## Knowledge Anchor Disposition

Root `AGENTS.md` documents `knowledgeAnchors` but declares no concrete project-local anchor entries. No anchor documents were consumed.

## Context Builder Result

`node scripts/architecture-context-build.mjs --stage plan --mode meta_harness_design --cwd . --json` returned `status: degraded`, `strictness: advisory`, `blocking: false`, because account-root project knowledge has no configured records. This is non-blocking for this package.
