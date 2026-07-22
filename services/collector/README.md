# 업체 정보 수집기

허용된 공개 출처에서 탐정사무소 정보 후보를 수집하고 정규화·변경 감지를 수행하는 Python 애플리케이션입니다. 수집 결과는 공개 운영값을 직접 수정하지 않고 관리자 검수 후보로만 저장합니다.

현재는 Python 3.13과 `uv` 프로젝트 골격만 생성된 상태이며 실제 출처 어댑터와 데이터베이스 연동은 아직 구현되지 않았습니다. 수집 원칙은 [`../../docs/operations/DATA_COLLECTION_POLICY.md`](../../docs/operations/DATA_COLLECTION_POLICY.md)를 따릅니다.

## 실행

```bash
uv sync
uv run python main.py
```

## 기본 검증

```bash
uv run python -m compileall .
```

외부 요청을 구현할 때는 출처별 접근 정책, timeout, 제한된 재시도, 요청 빈도와 응답 크기 제한을 함께 적용해야 합니다.
