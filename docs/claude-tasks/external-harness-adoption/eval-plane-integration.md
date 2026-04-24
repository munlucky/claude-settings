# External Eval Plane Integration

Last-Reviewed: 2026-04-24

Moonshot remains the production runtime. External harnesses are connected as exportable regression/evaluation planes, not as day-to-day completion gates.

## SWE-bench Vocabulary

- Imported as concept only: fail-to-pass, pass-to-pass, `FULL / PARTIAL / NO`.
- Local implementation point: `SCORECARD.md`, `render-scorecard.py`, and the phase completion gate.
- Runtime import: none.

## Terminal-Bench / Harbor Export

Command:

```bash
node .claude/scripts/external-eval-adapter.mjs terminal-bench \
  --task-id TASK-001 \
  --source .claude/docs/tasks/TASK-001 \
  --output-root .tmp/external-eval-plane
```

Generated skeleton:

- `instruction.md`
- `setup.sh`
- `test.sh`
- `expected-artifacts.md`
- `manifest.json`

If Harbor or Terminal-Bench is not installed, the manifest records `tool_missing` when `--run` is requested.

## OpenAI Evals Export

Command:

```bash
node .claude/scripts/external-eval-adapter.mjs openai-evals \
  --task-id TASK-001 \
  --source .claude/docs/tasks/TASK-001 \
  --output-root .tmp/external-eval-plane
```

Generated skeleton:

- `eval-input.jsonl`
- `rubric.md`
- `manifest.json`

Initial rubric dimensions:

- evidence sufficiency
- resumability
- traceability
- unsupported completion claim detection

## Inspect AI Export

Command:

```bash
node .claude/scripts/external-eval-adapter.mjs inspect \
  --task-id TASK-001 \
  --source .claude/docs/tasks/TASK-001 \
  --output-root .tmp/external-eval-plane
```

Generated skeleton:

- `task.json`
- `solver.md`
- `scorer.md`
- `manifest.json`

The Inspect solver/scorer remain placeholders until there is a stable internal task corpus.
