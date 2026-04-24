# 외부 Eval Plane 연결

Last-Reviewed: 2026-04-24

Moonshot은 계속 production runtime을 소유한다. 외부 하네스는 일상 completion gate가 아니라 export 가능한 regression/evaluation plane으로 연결한다.

## SWE-bench Vocabulary

- 개념만 흡수: fail-to-pass, pass-to-pass, `FULL / PARTIAL / NO`.
- 로컬 반영 위치: `SCORECARD.md`, `render-scorecard.py`, phase completion gate.
- runtime import: 없음.

## Terminal-Bench / Harbor Export

명령:

```bash
node .claude/scripts/external-eval-adapter.mjs terminal-bench \
  --task-id TASK-001 \
  --source .claude/docs/tasks/TASK-001 \
  --output-root .tmp/external-eval-plane
```

생성물:

- `instruction.md`
- `setup.sh`
- `test.sh`
- `expected-artifacts.md`
- `manifest.json`

Harbor 또는 Terminal-Bench가 설치되지 않았고 `--run`을 요청하면 manifest에 `tool_missing`을 기록한다.

## OpenAI Evals Export

명령:

```bash
node .claude/scripts/external-eval-adapter.mjs openai-evals \
  --task-id TASK-001 \
  --source .claude/docs/tasks/TASK-001 \
  --output-root .tmp/external-eval-plane
```

생성물:

- `eval-input.jsonl`
- `rubric.md`
- `manifest.json`

초기 rubric 축:

- evidence sufficiency
- resumability
- traceability
- unsupported completion claim detection

## Inspect AI Export

명령:

```bash
node .claude/scripts/external-eval-adapter.mjs inspect \
  --task-id TASK-001 \
  --source .claude/docs/tasks/TASK-001 \
  --output-root .tmp/external-eval-plane
```

생성물:

- `task.json`
- `solver.md`
- `scorer.md`
- `manifest.json`

Inspect solver/scorer는 내부 task corpus가 안정화될 때까지 placeholder로 둔다.
