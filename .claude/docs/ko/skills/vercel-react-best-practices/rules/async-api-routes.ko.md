# API Route에서 워터폴 체인 방지

- API Route나 Server Action에서는 서로 독립적인 작업을 가능한 한 빨리 시작합니다.
- 아직 `await`하지 않더라도 먼저 Promise를 만들어 두면 auth, config, data 로드를 겹칠 수 있습니다.
- 핵심은 "늦게 await하고, 일찍 시작"입니다.

