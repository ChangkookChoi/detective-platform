# 수집기 운영 절차

## 1. 목적과 현재 범위

승인된 업체 상세 페이지에서 JSON-LD의 상호, 공개 전화번호, 주소와 설명만 후보로 수집하는 절차다. 현재 어댑터는 한 상세 URL에서 한 업체 후보만 허용하며 업무 분야 자동 매핑, 목록 탐색, 브라우저 자동화, 폐업 자동 판정과 자동 공개는 하지 않는다.

## 2. 출처 등록 전 확인

운영 책임자가 다음을 확인하고 기록한 뒤에만 출처 설정을 추가한다.

- 운영 주체와 공식성, 이용약관·robots·관련 권리상 자동 접근 허용 여부
- 접근할 HTTPS host와 업체 상세 path 범위
- 사업상 공개 연락처인지와 허용할 최소 필드
- 확인자·확인일, 운영 연락처가 포함된 User-Agent
- 요청 간격, timeout, 최대 시도 횟수, redirect와 응답 byte 한도
- 정정·삭제 연락 수단과 중단 책임자

판단이 불명확하면 설정을 추가하지 않고 수동 조사로 남긴다. 실제 출처 결정이나 법적 해석이 필요하면 별도 운영자 결정을 기록한다.

## 3. 설정

[`../../services/collector/sources.example.toml`](../../services/collector/sources.example.toml)을 참고해 실제 정책 파일을 만들고 판단 근거를 [SOURCE_REGISTRY.md](SOURCE_REGISTRY.md)에 남긴다. 승인된 파일럿 정책은 [`../../services/collector/sources.toml`](../../services/collector/sources.toml)에 등록한다. 정책 파일은 공개 접근 규칙이므로 커밋할 수 있지만 DB URL, 토큰이나 세션 값은 넣지 않는다.

필수 제한:

- `start_urls`: 승인된 개별 상세 URL
- `allowed_hosts`, `allowed_path_prefixes`: redirect에도 다시 적용할 allowlist
- `allowed_fields`: `name`, `telephone`, `address`, `description` 중 필요한 항목
- `allowed_schema_types`: 출처에서 확인한 schema.org 타입
- `policy_checked_*`, `robots_checked_*`, `robots_allowed`: 사람의 검토 기록
- `request_interval_seconds`: 순차 요청 사이 최소 대기
- `timeout`, `retry`, `max_response_bytes`, `max_redirects`: 실패와 부하 제한

등록 전 형식을 검증한다.

```bash
cd services/collector
uv run python main.py validate-config --config sources.toml
```

## 4. 실행 전 점검

1. 정책·robots 확인이 여전히 유효하고 출처가 차단을 요청하지 않았는지 확인한다.
2. 최신 migration이 적용된 개발 DB에서 먼저 실행한다.
3. [`LOCAL_DATABASE.md`](LOCAL_DATABASE.md)의 수집기 전용 최소 권한 역할을 사용한다.
4. `DATABASE_URL`은 환경변수로만 주입하고 출력하거나 설정 파일에 넣지 않는다.
5. 첫 실행은 URL 수를 작게 제한하고 관리자 검수 대기열을 확인한다.

```bash
cd services/collector
DATABASE_URL="$COLLECTOR_DATABASE_URL" \
  uv run python main.py run \
    --config sources.toml \
    --source mugunghwa-detective-official-pilot
```

로컬 전용 역할과 DB를 처음 준비할 때는 저장소 루트에서 다음을 실행한다.

```bash
./scripts/local-postgres.sh setup
```

## 5. 결과 판정

- `succeeded`: 모든 등록 URL을 처리했으며 후보 검증 오류가 없다.
- `partially_failed`: 일부 레코드는 저장했지만 일부 URL·후보가 실패했다.
- `failed`: 저장하거나 변경 없음으로 확인한 대상 없이 전체가 실패했다.
- `collectedCount`: 이번 실행에 저장한 제한된 추출 레코드 수다.
- `unchangedCount`: `304 Not Modified` 또는 동일 canonical hash로 확인한 수다.
- `reviewCount`: 새로 생성한 `pending` 검수 항목 수다.

검수 항목은 상호·전화·주소 변경과 신규 업체를 `high`, 설명 변경을 `medium` 위험도로 만든다. 누락 필드는 운영값 삭제 제안으로 변환하지 않으며 동일 해시를 다시 수집해도 중복 검수 항목을 만들지 않는다.

2026-07-23 등록 파일럿 최초 개발 실행은 최소 권한 역할로 `succeeded`,
발견 1건, 수집 1건, 실패 0건, `pending/new_office/high` 검수 1건을
기록했다. 이 후보는 실제 관리자 검수에서 주소 지역명 중복 결함으로
`on_hold` 처리한 뒤 2026-08-08 로그인한 allowlist 관리자가 결함 사유로
`rejected` 처리했다. 주소 정규화를 수정한 `jsonld-v2` 첫 실행은 이전
버전의 조건부 요청 메타데이터를 재사용하지 않고 원문을 다시 수집해 교정된
`pending/new_office/high` 후보 1건을 만들었으며 아직 최종 검수 전이다.
두 실행 모두 운영 업체 행은 생성하지 않았다. 실행별 상세 사실은
[SOURCE_REGISTRY.md](SOURCE_REGISTRY.md)에 기록한다.

## 6. 중단과 장애 대응

다음 상황에서는 출처 실행을 중단하고 정책을 재검토한다.

- `403`, `429`, 반복 timeout·5xx 또는 차단 안내
- 예상보다 큰 응답, 허용되지 않은 redirect·host·IP
- 한 상세 URL에서 복수 업체 후보 검출
- JSON-LD 구조 변경, 필드 누락·변경률 급증
- 개인정보나 허용하지 않은 데이터의 우발적 수집

실패, `404` 또는 원문 삭제만으로 기존 업체를 수정·폐업·삭제하지 않는다. 수집 DB 오류도 해당 레코드 트랜잭션만 되돌리며 이미 공개된 운영값에는 전파하지 않는다. 원인 해결 후 재실행하고 비민감 오류 코드와 실행 ID로 결과를 추적한다.

## 7. 배포 전 남은 결정

- 등록 출처 외 후보의 이용 조건·robots 검토와 정책 파일
- 운영 DB의 수집기 최소 권한 자격 증명과 네트워크 경계
- 예약 실행 방식, 알림 기준과 재검증 주기
- 수집 레코드·검수 이력 보존 기간
- 운영 Psycopg의 binary 또는 시스템 `libpq` 배포 방식
