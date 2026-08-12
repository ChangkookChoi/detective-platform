# ADR-0007: HTTPX와 Psycopg 기반 Python 수집기

- 상태: 승인
- 결정일: 2026-07-22

## 맥락

Python 수집기는 출처별 접근 정책을 지키면서 작은 수의 공개 페이지를 순차적으로 요청하고, 필요한 필드만 추출·정규화해 PostgreSQL의 수집 후보 테이블에 저장해야 한다. 요청 timeout, 제한된 재시도, 응답 크기와 redirect 제한, URL 안전성, 고정 샘플 테스트와 DB 트랜잭션이 필요하다.

현재 목표 데이터는 약 100개 업체이며 높은 동시성보다 출처별 요청 간격, 실패 격리와 검수 가능한 단순성이 중요하다. 수집기는 공개 운영값을 수정하지 않고 `collection_runs`, `collected_records`, `review_items`에만 결과를 남겨야 한다.

## 결정

- HTTP 클라이언트는 안정 버전 HTTPX 0.28 계열을 사용한다.
- PostgreSQL 드라이버는 Python 3.13을 지원하는 Psycopg 3.3 계열을 사용한다.
- 개발·CI의 재현 가능한 설치에는 `psycopg[binary]`를 사용하고, 운영 이미지에서는 시스템 `libpq` 보안 업데이트와 배포 방식을 검토해 binary 또는 C 설치를 다시 선택한다.
- 별도 Python ORM을 도입하지 않고 Psycopg의 파라미터화 SQL로 기존 Drizzle migration 계약을 사용한다.
- 초기 실행은 동기식·출처당 동시성 1로 제한한다.
- HTTPX의 connect/read/write/pool timeout과 connection limit을 명시한다.
- connect·timeout·일시적 네트워크 오류와 `429`, `500`, `502`, `503`, `504`만 지수형 backoff로 제한 재시도한다.
- redirect는 자동 추적하지 않고 매 단계에서 등록된 scheme, host와 path 정책을 다시 확인한다.
- 응답은 streaming으로 읽으며 출처별 최대 byte를 넘으면 중단한다.
- 출처 설정은 TOML allowlist로 관리하고 정책·robots 확인자와 확인일, 허용 host/path, 요청 간격, timeout, 재시도와 응답 크기를 필수로 둔다.
- 최초 공통 어댑터는 공식 페이지의 `application/ld+json`에서 허용된 업체 필드만 추출한다. 사이트별 DOM 파서는 출처 승인 후 별도 어댑터로 추가한다.
- ETag와 Last-Modified를 저장해 조건부 요청에 사용하고, 정규화된 필드의 canonical JSON 해시로 의미 있는 변경을 감지한다.
- 수집 레코드와 검수 후보는 같은 DB 트랜잭션에 저장하며 운영 업체 행은 갱신하지 않는다.

버전과 설치 근거는 [HTTPX 공식 문서](https://www.python-httpx.org/advanced/timeouts/), [HTTPX PyPI](https://pypi.org/project/httpx/), [Psycopg 설치 문서](https://www.psycopg.org/psycopg3/docs/basic/install.html), [Psycopg PyPI](https://pypi.org/project/psycopg/)를 따른다.

## 결과

장점:

- timeout, streaming, custom transport와 고정 샘플 HTTP 테스트를 한 라이브러리에서 처리한다.
- 웹과 수집기가 실제 PostgreSQL migration을 공통 계약으로 사용한다.
- 낮은 동시성과 출처별 설정으로 초기 운영 부하와 정책 위반 위험을 줄인다.
- 별도 ORM·작업 큐·브라우저 자동화 없이 초기 수집 흐름을 검증한다.

단점:

- Python SQL과 TypeScript Drizzle schema를 함께 변경·검증해야 한다.
- 동기식 순차 실행은 대량 수집에 적합하지 않다.
- JSON-LD가 없거나 부정확한 사이트에는 별도 승인된 어댑터가 필요하다.
- binary Psycopg 패키지는 시스템 `libpq` 업데이트를 자동으로 따르지 않으므로 운영 패치 정책이 필요하다.

## 대안

- 표준 라이브러리 `urllib`: 의존성은 줄지만 세분화 timeout, streaming 제한, mock transport와 오류 분류를 반복 구현해야 한다.
- Requests: 성숙하지만 HTTPX가 명시적 timeout·transport 테스트와 향후 async 전환 경로를 함께 제공한다.
- SQLAlchemy: ORM과 migration 기능이 강하지만 Drizzle이 이미 schema와 migration 소유권을 가지므로 중복 모델이 된다.
- 수집 전용 API: DB 권한을 더 좁힐 수 있지만 초기에는 별도 인증 API 계약과 배포 복잡도가 크다. 운영 네트워크 경계가 정해질 때 재검토한다.
- Playwright 기반 수집: 동적 페이지 대응은 가능하지만 자원·정책 위험이 커서 초기 기본 경로로 사용하지 않는다.

## 재검토 조건

출처 수나 처리량이 순차 실행으로 감당되지 않거나, 동적 렌더링 출처가 승인 데이터의 큰 비중을 차지하거나, 수집기 DB 직접 접근이 배포·보안 경계와 맞지 않거나, Python과 Drizzle 계약 불일치가 반복될 때 async 실행, 작업 큐, 수집 API, schema 공유 방식 또는 브라우저 어댑터를 별도 ADR로 비교한다.
