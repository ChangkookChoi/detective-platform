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
6. 임시 서버 중지 및 데이터 삭제

기본 포트 `55432`가 사용 중이면 다른 포트를 지정할 수 있다.

```bash
PG_TEST_PORT=55433 ./scripts/verify-local-postgres.sh
```

## 지속형 개발 DB

목록·상세 기능 개발처럼 데이터가 실행 사이에 유지되어야 할 때만 별도 로컬 클러스터나 승인된 관리형 개발 DB를 사용한다. `.env.example`을 복사해 `.env.local`에 `DATABASE_URL`을 설정하며 실제 자격 증명은 커밋하지 않는다.

```bash
cd apps/web
npm run db:migrate
npm run db:seed
```

운영 데이터베이스에는 `drizzle-kit push`를 사용하지 않는다. migration은 SQL을 검토하고 배포 단계에서 명시적으로 적용한다.
