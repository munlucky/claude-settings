# Storage API 호출 캐시

- `localStorage`/`sessionStorage` 읽기는 생각보다 비싸므로 반복해서 부르지 않습니다.
- 한번 읽은 값은 함수/모듈 수준 변수에 저장해 재사용합니다.
- 렌더나 effect가 자주 도는 코드에서 효과가 큽니다.

