# C4 and ADR Design Contract

C4와 ADR은 구현 전에 architecture decision을 검토 가능한 증거로 만드는 산출물입니다.

system boundary, runtime ownership, external integration이 중요하면 C4 context/container view를 사용합니다. phase plan이 module 또는 adapter ownership을 필요로 하면 component view를 사용합니다.

Architecture style, data boundary, integration strategy, migration path, runtime surface exposure, compatibility policy 같은 중요한 결정은 ADR로 기록합니다.

각 ADR은 context, decision, consequences, rejected alternatives, verification signal, affected requirement 또는 ASR link를 포함해야 합니다.

C4와 ADR은 design evidence입니다. implementation test, package dry-run, installer evidence, runtime-state completion authority를 대체하지 않습니다.

repository evidence로 확인하지 않은 Brownfield 구조를 C4나 ADR로 정당화하지 않습니다.
