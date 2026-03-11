# effect 의존성 좁히기

- 객체 전체가 아니라 실제로 사용하는 primitive 값만 dependency 배열에 넣습니다.
- `user` 대신 `user.id`처럼 좁히면 불필요한 effect 재실행을 줄일 수 있습니다.
- 파생 boolean으로 더 좁힐 수 있으면 그쪽이 더 낫습니다.

