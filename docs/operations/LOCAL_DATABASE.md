# 로컬 PostgreSQL 운영

## 목적

개발자가 운영 또는 개인 데이터베이스에 영향을 주지 않고 PostgreSQL migration, 기준 데이터 seed와 핵심 제약을 검증하는 방법을 정의한다.

## 기준 버전

- 개발 검증 기준: PostgreSQL 17 이상
- 최초 통합 검증 버전: PostgreSQL 17.10
- 공식 지원 중인 minor 버전의 최신 패치를 사용한다.

PostgreSQL 17은 프로젝트가 사용하는 UUID, JSONB, 부분 index, check constraint와 재귀 조회 요구를 충족한다. 운영 공급자와 정확한 운영 버전은 배포 환경 결정 시 별도로 확정한다.

## macOS 준비

```bash
brew install postgresql@17
```

백그라운드 서비스를 시작할 필요는 없다. 저장소의 통합 검증 스크립트는 임시 디렉터리에 독립 클러스터를 만들고 완료 또는 실패 시 자동으로 중지·삭제한다.

## 통합 검증

저장소 루트에서 실행한다.

```bash
./scripts/verify-local-postgres.sh
```

스크립트는 다음을 순서대로 수행한다.

1. PostgreSQL 17 이상 확인
2. 임시 클러스터와 테스트 DB 생성
3. Git에 기록된 migration 적용
4. seed를 연속 두 번 실행하여 멱등성 확인
5. 테이블, migration 이력, seed, check constraint와 전화번호 index 검증
6. 합성 신규·변경 후보로 업체 생성, 수정 후 승인, 공개 거부·롤백·동시성·감사 이력·공개 조회와 필터 검증
7. 합성 공개 이벤트로 API 입력·Origin, 중복, 보존, 속도 제한과 일별 집계 검증
8. 합성 공개 정정 요청으로 민감정보 확인, 비공개 거부, 중복·속도 제한, 운영자 확인 출처 승인과 실패 롤백 검증
9. 수집기 전용 역할을 적용하고 필요한 후보 적재 권한과 업체 수정·검수 조회/삭제·스키마 생성 거부 검증
10. 고정 JSON-LD와 mock HTTP 응답을 수집기 전용 역할로 처리해 수집 레코드, 변경 검수, 조건부 요청 메타데이터와 운영값 불변 검증
11. 임시 서버 중지 및 데이터 삭제

기본 포트 `55432`가 사용 중이면 다른 포트를 지정할 수 있다.

```bash
PG_TEST_PORT=55433 ./scripts/verify-local-postgres.sh
```

## 지속형 개발 DB

목록·상세·검수 기능처럼 데이터가 실행 사이에 유지되어야 할 때 저장소 전용 로컬 클러스터를 사용한다.

```bash
./scripts/local-postgres.sh setup
```

`setup`은 PostgreSQL 17 이상을 확인하고 다음을 멱등하게 수행한다.

1. `data/private/postgres-dev`에 trust 인증 로컬 클러스터 초기화
2. loopback `127.0.0.1:55433`에서 서버 시작
3. `detective_platform_dev` DB 생성
4. migration과 기준 데이터 seed 적용
5. `detective_platform_collector` 최소 권한 역할 적용

클러스터는 통합 검증용 임시 DB와 달리 자동 삭제하지 않으며 해당 경로는 Git에서 제외된다. 상태 확인·재시작·중지는 다음 명령을 사용한다.

```bash
./scripts/local-postgres.sh status
./scripts/local-postgres.sh start
./scripts/local-postgres.sh stop
```

기본 포트가 충돌하면 최초 `setup`에서 `PG_DEV_PORT`를 지정한다. 선택한 포트는 클러스터 경로에 저장되므로 이후 명령은 지정 없이 같은 값을 사용하며, 다른 값을 넘기면 실수를 막기 위해 거부한다.

```bash
PG_DEV_PORT=55434 ./scripts/local-postgres.sh setup
./scripts/local-postgres.sh stop
```

웹 migration·seed와 관리자 작업은 로컬 클러스터 소유자 연결을 사용한다.

```bash
export DATABASE_URL="postgresql://$(id -un)@127.0.0.1:55433/detective_platform_dev"
```

수집 실행에는 전용 역할만 사용한다.

```bash
export COLLECTOR_DATABASE_URL="postgresql://detective_platform_collector@127.0.0.1:55433/detective_platform_dev"
```

로컬 trust 인증은 loopback 개발 환경에서만 사용한다. 관리형 개발·미리보기·운영 환경은 비밀 관리가 적용된 별도 자격 증명, 전송 암호화와 네트워크 제한을 사용해야 한다. 실제 자격 증명은 `.env.local`, 로그 또는 Git에 기록하지 않는다.

## 수집기 역할 권한

[`../../infra/postgres/local-collector-role.sql`](../../infra/postgres/local-collector-role.sql)은 ADR-0003과 ADR-0007의 직접 DB 적재 경계를 로컬 DB에 적용한다.

| 대상 | 허용 | 금지 예시 |
| --- | --- | --- |
| `offices`, `office_sources` | `SELECT` | 생성·수정·삭제 |
| `collection_runs` | `SELECT`, `INSERT`, `UPDATE` | 삭제 |
| `collected_records` | `SELECT`, `INSERT` | 수정·삭제 |
| `review_items` | `INSERT` | 조회·수정·삭제 |
| `public` schema | `USAGE` | 객체 생성 |

회귀 테스트는 수집기 역할로 실제 후보 적재 흐름을 실행하고 금지 권한이 `InsufficientPrivilege`로 거부되는지 확인한다. 운영 공급자에서는 역할 생성 SQL과 연결 정책을 공급자 방식에 맞게 별도로 적용하되 권한 상한은 넓히지 않는다.

## 직접 migration

스크립트가 관리하지 않는 승인된 개발 DB를 사용할 때만 소유자 `DATABASE_URL`을 환경변수로 주입해 직접 실행한다.

```bash
cd apps/web
npm run db:migrate
npm run db:seed
```

운영 데이터베이스에는 `drizzle-kit push`를 사용하지 않는다. migration은 SQL을 검토하고 배포 단계에서 명시적으로 적용한다.
