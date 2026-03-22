# 단순 primitive 표현식은 useMemo로 감싸지 않기

- 결과가 boolean, number, string 같은 primitive이고 계산이 단순하다면 `useMemo` 비용이 더 클 수 있습니다.
- dependency 비교와 hook 호출 자체가 과잉이 될 수 있습니다.
- 간단한 파생 값은 그냥 식으로 계산합니다.

