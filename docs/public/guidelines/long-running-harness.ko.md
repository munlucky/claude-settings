# Long Running Harness KO

장시간 하네스 작업의 canonical source guideline입니다.

장시간 실행은 objective, budget, 현재 phase, 재시작 방법을 남겨야 합니다.
반복 실패는 같은 blocker가 재현되는지 확인하고, blocker와 검증 미완료를 구분합니다.
중간 산출물은 generated state에 두고, source에는 재현 가능한 contract와 fixture만 남깁니다.
종료 보고에는 완료 여부, 남은 risk, 다시 실행할 명령을 명확히 씁니다.
