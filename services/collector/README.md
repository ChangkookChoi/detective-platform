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

## NAVER API HUB 지역 후보 발굴

지역 검색 API는 공개 업체를 직접 만들지 않고 비공개 발견 후보만 생성한다.
실제 검색 결과는 Git에서 제외된 `data/private/discovery-runs` 아래 Raw JSONL과
결정론적 필터 JSONL로 분리하며 기본 보존 기간은 7일, 최대 21일이다. Raw v2에는
후보 발견에 필요한 제목·링크·분류·주소만 저장한다. 새 검색 실행 전 만료 파일을
자동 정리하며, 만료 Raw는 재필터할 수 없다. CLI 출력은 업체명·주소·URL을
포함하지 않고 건수와 사유 코드 집계만 표시한다.

로컬 키는 `apps/web/.env.local`의 `NAVER_API_HUB_CLIENT_ID`와
`NAVER_API_HUB_CLIENT_SECRET`에 저장한다. 검색 API 결과의 이용 조건은
[전문가 검토 요청서](../../docs/operations/NAVER_API_LEGAL_REVIEW_BRIEF.md)와
[ADR-0010](../../docs/decisions/ADR-0010-naver-api-discovery-pilot.md)을 따른다.
웹문서 API는 지역 결과에서 공식 링크 없음·비공식 링크·HTTP 링크 사유가 있는
비반려 후보의 공식 홈페이지 후보 재검색에만 사용한다. 웹 Raw에는 제목·URL만
저장하고 설명문·질의문은 저장하지 않으며 AI 입력·공개 후보 전환은 하지 않는다.

```bash
uv run --env-file ../../apps/web/.env.local python main.py discover-naver-local \
  --output-dir ../../data/private/discovery-runs \
  --registry ../../docs/operations/SOURCE_REGISTRY.md \
  --region "서울 강남구" \
  --region "서울 송파구" \
  --keyword "탐정사무소" \
  --keyword "흥신소" \
  --max-requests 4 \
  --retention-days 7
```

개발 DB에 등록된 서울·경기 활성 최하위 지역 전체를 대상으로 실행할 때는 개별
`--region` 대신 `--regions-from-database`를 사용한다. 검색어 하나당 현재 72개
질의이므로 `--max-requests 100` 안에서 실행한다.

```bash
uv run --env-file ../../apps/web/.env.local python main.py discover-naver-local \
  --output-dir ../../data/private/discovery-runs \
  --registry ../../docs/operations/SOURCE_REGISTRY.md \
  --regions-from-database \
  --keyword "탐정사무소" \
  --max-requests 100 \
  --retention-days 7
```

`DATABASE_URL`이 같은 환경에 있으면 현재 공개·비공개 운영 업체의 이름·주소·
공식 출처와 대조한다. 없으면 실행 배치 내부와 출처 등록부 중복만 검사한다.
Raw 또는 filtered 파일을 AI 입력에 첨부하지 않는다.
`source_check_required`도 공식 출처 확인 전 발견 후보일 뿐이며 filtered 결과는
항상 `source_verification=required`, `promotion_allowed=false`다. 이 파일을
후보 manifest로 직접 변환하지 않고 공식 홈페이지에서 다시 확인한 값만 별도
manifest에 작성한다.

지역 Raw의 보존기한 안에서 공식 홈페이지 후보를 재검색한다. `max-candidates`는
검색할 지역 후보 수, `max-requests`는 재시도를 포함한 전체 호출 상한이다.

```bash
uv run --env-file ../../apps/web/.env.local python main.py \
  discover-naver-web-sources \
  --local-raw ../../data/private/discovery-runs/<local-run-id>.raw.jsonl \
  --output-dir ../../data/private/discovery-runs \
  --registry ../../docs/operations/SOURCE_REGISTRY.md \
  --max-candidates 10 \
  --max-requests 15 \
  --display 5 \
  --retention-days 7
```

웹 결과도 HTTPS·비공식 도메인·실행 내 중복·기존 출처·출처 등록부·후보명 일치
신호만 판정한다. `source_check_required`는 공식 홈페이지 확인 완료가 아니다.

`source_check_required` URL은 원문을 저장하지 않는 네트워크 사전검증으로 넘긴다.
공개 IP·HTTPS·동일 사이트 redirect·robots·응답 상태·크기 제한을 통과해도
`content_check_required`일 뿐이며 공식 업체 확인이나 공개 승격을 의미하지 않는다.

```bash
uv run python main.py probe-discovery-sources \
  --web-raw ../../data/private/discovery-runs/<web-run-id>.raw.jsonl \
  --web-filtered ../../data/private/discovery-runs/<web-run-id>.filtered.jsonl \
  --output ../../data/private/discovery-runs/<web-run-id>.probe.jsonl \
  --user-agent "DetectivePlatformPreflight/1.0 (+https://github.com/ChangkookChoi/detective-platform)" \
  --max-sources 10
```

웹 검색 배치 manifest는 선택한 부모 레코드 ID와 후보 정체성 해시만 보관한다.
결과가 없었던 후보를 포함해 같은 업체가 다른 지역 질의나 검색어에서 다시
나타나도 보존기한 안에는 웹 API를 다시 호출하지 않는다.

`content_check_required` 페이지는 원문을 파일로 저장하지 않고 JSON-LD와 보이는
HTML에서 상호·업무용 대표번호·주소 신호만 추출한다. 결과는 강한 일치, 부분
일치, 정보 부족, 실패로 나뉘며 어떤 상태도 자동 승격을 허용하지 않는다.

```bash
uv run python main.py extract-discovery-facts \
  --local-raw ../../data/private/discovery-runs/<local-run-id>.raw.jsonl \
  --web-raw ../../data/private/discovery-runs/<web-run-id>.raw.jsonl \
  --web-filtered ../../data/private/discovery-runs/<web-run-id>.filtered.jsonl \
  --probe ../../data/private/discovery-runs/<web-run-id>.probe.jsonl \
  --output ../../data/private/discovery-runs/<web-run-id>.facts.jsonl \
  --user-agent "DetectivePlatformPreflight/1.0 (+https://github.com/ChangkookChoi/detective-platform)" \
  --max-sources 50
```

활성 facts 파일의 강한/부분 일치를 업체 정체성 해시로 합쳐 수동 검토 큐를
만든다. 이 출력은 office batch manifest가 아니며 `review_status=pending`,
`promotion_allowed=false`를 유지한다.

```bash
uv run python main.py build-discovery-review-queue \
  --output-dir ../../data/private/discovery-runs \
  --output ../../data/private/discovery-runs/<review-run-id>.jsonl
```

필터 규칙을 개선한 뒤에는 API를 다시 호출하지 않고 같은 Raw 파일을 재사용한다.

```bash
uv run --env-file ../../apps/web/.env.local python main.py filter-naver-discovery \
  --raw ../../data/private/discovery-runs/<run-id>.raw.jsonl \
  --output ../../data/private/discovery-runs/<run-id>.filtered.jsonl \
  --registry ../../docs/operations/SOURCE_REGISTRY.md
```

보존기한 정리는 새 검색 전 자동 실행된다. 정기 검색을 도입하기 전에는 다음
명령을 하루 한 번 실행하고 실패를 감시하도록 예약한다. 삭제 건수만 출력하며
실제 후보 값은 출력하지 않는다.

```bash
uv run python main.py purge-naver-discovery \
  --output-dir ../../data/private/discovery-runs
```

## 검증

```bash
uv run python -m compileall -q collector main.py tests
uv run python -m unittest discover -s tests -p 'test_*.py'
```

임시 PostgreSQL까지 포함한 전체 통합 검증은 저장소 루트에서 실행합니다.

```bash
./scripts/verify-local-postgres.sh
```
