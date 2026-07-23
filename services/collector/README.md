# 업체 정보 수집기

승인된 공개 출처에서 업체 정보 후보를 순차 수집하고 JSON-LD 추출, 정규화와 변경 감지를 수행하는 Python 3.13 애플리케이션입니다. 결과는 `collection_runs`, `collected_records`, `review_items`에만 기록하며 공개 운영값인 `offices`를 수정하지 않습니다.

출처 등록과 실행 절차는 [수집기 운영 절차](../../docs/operations/COLLECTOR_RUNBOOK.md), 정책 경계는 [데이터 수집 정책](../../docs/operations/DATA_COLLECTION_POLICY.md)을 따릅니다. [`sources.toml`](sources.toml)에는 2026-07-23 기준 한 개 공식 홈페이지의 단일 페이지·사실 필드 파일럿 정책만 등록되어 있으며 판단 근거는 [수집 출처 등록부](../../docs/operations/SOURCE_REGISTRY.md)에 기록합니다.

## 구성

- `collector/config.py`: TOML 출처 정책 검증
- `collector/http_client.py`: URL allowlist, 공개 IP 확인, timeout, redirect·응답 크기 제한과 제한 재시도
- `collector/adapters/jsonld.py`: 허용된 JSON-LD 타입과 최소 필드 추출
- `collector/normalize.py`: 텍스트·전화번호·주소 정규화와 canonical hash
- `collector/change_detection.py`: 신규 업체와 운영값 변경 후보 생성
- `collector/repository.py`: PostgreSQL 실행·수집 레코드·검수 후보 트랜잭션
- `collector/pipeline.py`: 출처당 동시성 1의 실행 흐름과 부분 실패 격리

## 준비와 설정 검증

```bash
uv sync
uv run python main.py validate-config --config sources.example.toml
uv run python main.py validate-config --config sources.toml
```

새 실제 출처는 예시를 복사한 뒤 이용 조건과 robots를 사람이 확인하고 모든 placeholder를 승인된 값으로 바꿉니다. 등록된 파일럿도 실행 직전에 정책과 구조를 다시 확인합니다. 설정 검증은 정책 필수 항목의 형식만 확인하며 법적·계약상 허용을 대신 판단하지 않습니다.

## 실행

적용할 migration이 반영된 개발 DB에 `DATABASE_URL`을 설정한 뒤 등록된 출처 하나를 명시합니다.

```bash
DATABASE_URL='postgresql://...' \
  uv run python main.py run \
  --config sources.toml \
  --source mugunghwa-detective-official-pilot
```

출력에는 실행 ID, 상태, 건수와 비민감 오류 코드만 포함합니다. 실제 URL, 환경변수 값이나 원문 HTML을 로그로 출력하지 않습니다.

## 검증

```bash
uv run python -m compileall -q collector main.py tests
uv run python -m unittest discover -s tests -p 'test_*.py'
```

임시 PostgreSQL까지 포함한 전체 통합 검증은 저장소 루트에서 실행합니다.

```bash
./scripts/verify-local-postgres.sh
```
