# Verification Contract KO

검증 계약과 evidence 기준의 canonical source guideline입니다.

verification contract는 required check, optional check, scope match, 허용되는 fallback behavior를 정의합니다.
fresh evidence는 관련 변경 이후 실행된 command나 artifact에서 나와야 하며, 예외는 명시 근거가 필요합니다.
skip된 check는 이유, risk, 가장 가까운 대체 check를 closeout 전에 남깁니다.
verdict artifact에는 run id, command, status, 실행한 required check, 누락 check, evidence path를 포함합니다.
