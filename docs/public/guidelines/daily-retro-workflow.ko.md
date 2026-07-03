# Daily Retro Workflow

Moonshot Relay의 retro workflow는 advisory learning loop다. 작업 closeout 요약을 기록하고, 반복 패턴을 집계한 뒤, 사람이 검토할 하네스 개선 후보를 만든다.

## Authority

- retro output은 completion evidence가 아니다.
- retro output은 verify, score, closeout, runtime DB authority, package promotion, installed profile state를 바꾸지 않는다.
- 생성되는 retro JSON과 proposal artifact는 `promotionAuthority: false`를 가져야 한다.

## Source And Runtime Boundary

canonical source는 schema, template, tool, skill, docs, test를 정의한다. runtime retro record는 generated state이며 project outbox 또는 account-root project state 아래에 둔다.

source contract:

```text
schemas/retro.*
templates/retro/
tools/retro/
skills/moonshot-retro/
docs/public/guidelines/daily-retro-workflow.ko.md
tests/retro-*.test.mjs
```

runtime state:

```text
.moonshot-relay/retro-outbox/<YYYY-MM-DD>/
${MOONSHOT_RELAY_HOME:-~/.moonshot-relay}/state/projects/<projectId>/retro/
```

## Flow

```text
task closeout evidence
  -> collect record
  -> retro import
  -> retro inbox
  -> daily retro report
  -> improvement candidates
  -> proposal or issue draft
```

## Safety Rules

- raw log, prompt, transcript, browser scrape, MemoryGraph dump, KG dump, ontology dump, secret를 복사하지 않는다.
- evidence reference와 compact summary만 저장한다.
- secret-like content는 import 전에 거부한다.
- 한 downstream project의 symptom은 contract-backed, source/template-backed, cross-project, 또는 project-neutral regression test로 설명되지 않으면 observation으로만 둔다.
- issue는 먼저 local draft로 렌더링한다. remote issue 생성은 별도 승인 경로가 생긴 뒤에만 허용한다.

## Verification

retro 구현은 schema validity, redaction, duplicate handling, daily aggregation, proposal rendering, issue draft rendering, no-promotion authority에 대한 focused test를 제공해야 한다. 최종 source gate는 계속 `npm test`다.

