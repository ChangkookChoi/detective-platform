# 운영 PostgreSQL 준비

## 1. 목적과 현재 결정

관리형 PostgreSQL 리소스를 만들기 전후에 필요한 공급자 선택, 환경 분리,
TLS·풀링·최소 권한, migration과 복구 검증 절차를 정의한다.

2026-08-11 현재 [ADR-0008](../decisions/ADR-0008-managed-postgres-prelaunch.md)에
따라 Neon Free를 비용 없는 출시 리허설 후보로 제안한다. 실제 리소스는 아직
없고 저장소도 Vercel 프로젝트에 연결되지 않았다. 무료 복원 이력은 현재
14일 백업 정책을 충족하지 않으므로 공개 운영 DB로 확정하지 않는다.

## 2. 공급자 비교

| 항목 | Neon Free | Supabase Free | 현재 판단 |
| --- | --- | --- | --- |
| 비용 | $0, 카드 불필요 | $0 | 둘 다 비용 조건 충족 |
| DB 용량 | 프로젝트당 0.5GB | 프로젝트당 0.5GB | MVP 리허설에 충분 |
| 연결 풀링 | PgBouncer pooled URL | Supavisor pooler | 둘 다 가능 |
| 비활성 동작 | 5분 후 scale-to-zero, 요청 시 자동 재개 | 1주 비활성 후 프로젝트 중지 | Neon 우선 |
| 무료 복구 | 최대 6시간 복원 이력 | 자동 백업·PITR 없음 | Neon이 낫지만 정책 미달 |
| Vercel 연동 | Native Marketplace | Marketplace | 둘 다 가능 |

공식 기준:

- [Vercel Marketplace Storage](https://vercel.com/docs/marketplace-storage)
- [Neon 요금과 무료 할당량](https://neon.com/pricing)
- [Neon connection pooling](https://neon.com/docs/connect/connection-pooling)
- [Neon scale-to-zero](https://neon.com/docs/introduction/scale-to-zero)
- [Supabase 요금](https://supabase.com/pricing)
- [Supabase 백업](https://supabase.com/docs/guides/platform/backups)

무료 조건과 복구 보존 기간은 바뀔 수 있으므로 생성 직전에 다시 확인한다.

## 3. 연결과 자격 증명 계약

| 환경변수 | 저장 위치 | 연결 | 권한 |
| --- | --- | --- | --- |
| `DATABASE_URL` | Vercel Production 비밀 | pooled | 웹 런타임 최소 DML |
| `DATABASE_MIGRATION_URL` | 신뢰된 배포 터미널 또는 CI 비밀 | direct | migration·seed 소유자 |
| `DATABASE_POOL_MAX` | Vercel Production 설정 | 해당 없음 | 인스턴스별 풀 상한, 기본 5 |
| 수집기 실행 시 `DATABASE_URL` | 별도 수집기 실행 환경 비밀 | direct 또는 제한된 pool | 후보 조회·적재 전용 |

`DATABASE_MIGRATION_URL`은 Next.js 배포 환경에 넣지 않는다. Vercel 환경변수는
Function 런타임에서도 읽을 수 있으므로 소유자 자격 증명이 웹 프로세스에
노출된다. migration은 신뢰된 배포 단계에서만 실행한다.

Production과 Preview는 DB 또는 branch와 모든 역할 자격 증명을 분리한다.
Preview가 Production `DATABASE_URL`을 참조하면 안 된다. `.env.local`과
Vercel에서 내려받은 환경 파일은 Git에 커밋하지 않는다.

모든 관리형 연결 문자열은 다음 조건을 만족해야 한다.

- `postgresql://` 또는 `postgres://`
- 사용자명·비밀번호·host·database 포함
- `sslmode=require`, `verify-ca` 또는 `verify-full`
- 웹 런타임과 migration의 사용자명 분리
- 서버리스 웹은 공급자의 pooled endpoint 사용
- migration은 direct endpoint 사용

## 4. 웹 런타임 풀

웹은 `node-postgres` 풀을 인스턴스마다 최대 5개 연결로 제한한다. 연결 대기는
5초, idle 연결은 30초, 연결 최대 수명은 5분으로 제한하고 채널 바인딩을
지원하는 서버에서는 활성화한다. 값이 필요한 경우 `DATABASE_POOL_MAX`를 1~10
범위에서만 조정한다.

풀 크기는 공급자 전체 연결 한도가 아니라 **Function 인스턴스당** 값이다.
트래픽과 인스턴스 수를 측정하기 전에 10보다 크게 올리지 않는다. Vercel은
Function을 DB와 가까운 리전에 두도록 권고하고, Hobby는 단일 리전을 선택할
수 있다. Neon Singapore를 선택하면 Vercel `sin1`을 우선 검토하고 실제 왕복
지연을 배포 후 측정한다.

## 5. 리소스 생성 절차

외부 리소스를 실제로 만드는 단계이므로 사용자의 명시적 승인 후 수행한다.

1. Vercel 프로젝트를 만들고 Root Directory를 `apps/web`으로 지정한다.
2. Production·Preview 환경 범위와 예상 배포 도메인을 확인한다.
3. Vercel Marketplace에서 Neon을 Free 플랜·Singapore 리전으로 생성한다.
4. 초기 소유자 URL을 웹 프로젝트에 바로 연결하지 않는다. CLI를 사용할 경우
   `vercel integration add neon --no-connect`로 리소스만 만든다.
5. Neon에서 웹 런타임용 별도 로그인 역할을 만들고 아래 현재 테이블 권한만
   부여한다. 새 migration이 테이블을 추가하면 권한도 함께 검토한다.
6. pooled 런타임 URL만 Vercel Production의 `DATABASE_URL`에 민감값으로 저장한다.
7. direct 소유자 URL은 신뢰된 배포 환경의 `DATABASE_MIGRATION_URL`에만 저장한다.
8. `DATABASE_POOL_MAX=5`, 실제 HTTPS origin과 Clerk Production 값을 설정한다.
9. migration 전 논리 백업, migration, seed, 연결·역할 검증 순서로 진행한다.
10. 공개 배포 전에 백업 보존과 복원 조건을 별도로 통과한다.

Marketplace 연결은 환경변수를 자동 추가할 수 있다. 연결 전에 어떤 역할의
URL인지 확인하고, 소유자 URL이 웹 런타임에 남지 않게 한다. `vercel env pull`은
대상 파일을 덮어쓸 수 있으므로 현재 `.env.local`을 직접 대상으로 사용하지 않는다.

## 6. 런타임 역할 권한

웹 역할은 `public` schema의 객체 생성, role·database 생성과 superuser 권한을
갖지 않는다. 현재 코드에 필요한 권한은 다음과 같다.

- 모든 현재 애플리케이션 테이블: `SELECT`
- `analytics_events`, `collected_records`, `collection_runs`,
  `office_daily_metrics`, `office_service_categories`,
  `office_source_evidence`, `office_sources`, `offices`, `review_actions`,
  `review_items`: `INSERT`
- `office_daily_metrics`, `office_source_evidence`, `office_sources`,
  `offices`, `review_items`: `UPDATE`
- `analytics_events`: `DELETE`

`regions`, `service_categories` seed 변경과 schema DDL은 migration 역할만 수행한다.
수집기는 [로컬 최소 권한 계약](LOCAL_DATABASE.md)의 운영 버전을 별도 역할로
적용하며 웹 역할이나 migration 역할을 공유하지 않는다.

## 7. 배포 전 검증

합성 입력으로 사전검증기 자체를 확인한다.

```bash
cd apps/web
npm run db:validate-production-config:self-test
```

실제 Production 값은 파일에 저장하지 않고 신뢰된 터미널·CI에 주입한 상태에서
다음 순서로 검증한다.

```bash
cd apps/web
npm run db:validate-production-config
npm run db:migrate
npm run db:seed
npm run db:verify-production-connection
```

`drizzle.config.ts`, seed와 DB 검증 명령은 명령 실행 전에 process 환경으로
주입된 `DATABASE_MIGRATION_URL`만 우선한다. `.env.local`에서 뒤늦게 읽은
migration URL이 임시 E2E의 명시적 `DATABASE_URL`을 덮어쓰지 못한다.
애플리케이션 실행은 항상 `DATABASE_URL`만 사용한다.

사전검증은 값을 출력하지 않고 다음을 확인한다.

- Production URL의 TLS 요구
- 런타임·migration URL의 역할 분리와 DB 이름 일치
- 인스턴스별 풀 상한 1~10
- HTTPS canonical origin

공급자마다 pooled·direct host 표기 방식이 다르므로 endpoint mode 자체는
공급자 Dashboard의 연결 상세와 실제 URL을 사람이 함께 확인한다.

연결 검증은 실제 DB에서 다음을 읽기 전용으로 확인한다.

- PostgreSQL 17 이상과 TLS 세션
- migration 적용 이력
- 런타임 role의 superuser·role/database/schema 생성 권한 부재
- migration role의 schema 생성 권한
- 현재 테이블의 런타임 최소 DML 권한

## 8. 백업 출시 차단 조건

Neon Free의 6시간 복원 이력만으로는
[RPO 24시간·14일 보존 정책](DATABASE_BACKUP.md)을 충족했다고 보지 않는다.
공개 출시 전 다음 증거가 필요하다.

1. 자동 일일 백업 성공 기록
2. 최소 14일 보존과 저장 시·전송 중 암호화
3. 운영 DB와 다른 장애 경계의 저장 위치
4. 격리 DB 복원과 migration·관계·권한 검증
5. 측정된 RPO 24시간 이내·RTO 4시간 이내
6. 백업 담당자와 복구 승인자

무료 경로를 유지하려면 독립 저장소로 암호화한 `pg_dump`를 자동화해야 한다.
저장소·암호화 키·스케줄러가 결정되기 전에는 임시 구현이나 운영 자격 증명
공유를 하지 않는다.
