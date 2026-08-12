# ADR-0004: Drizzle ORM과 SQL migration 사용

- 상태: 승인
- 결정일: 2026-07-22

## 맥락

Next.js 애플리케이션에서 PostgreSQL을 타입 안전하게 조회하고, 업체 공개 상태·필드별 출처·검수 이력의 제약을 검토 가능한 migration으로 관리해야 한다. Python 수집기도 같은 데이터 계약을 사용하므로 특정 런타임에서만 해석할 수 있는 스키마보다 실제 SQL 변경 이력이 중요하다.

## 결정

- 웹 데이터 접근에는 Drizzle ORM을 사용한다.
- PostgreSQL 드라이버는 표준 `node-postgres`를 사용한다.
- TypeScript 스키마를 기준으로 Drizzle Kit가 SQL migration을 생성한다.
- 생성된 SQL은 검토 후 Git에 커밋하고 환경별 배포 단계에서 명시적으로 적용한다.
- 개발 편의용 `drizzle-kit push`를 운영 스키마 변경에 사용하지 않는다.
- 연결 설정은 공급자 전용 변수 대신 `DATABASE_URL`을 기본 계약으로 사용한다.
- DB 호스팅 공급자와 운영 연결 풀링 방식은 배포 환경 결정 전까지 고정하지 않는다.

## 근거

- 관계, enum, check, 부분 unique index 등 PostgreSQL 제약을 TypeScript와 SQL 양쪽에서 확인할 수 있다.
- 생성된 SQL migration은 Python 수집기와 운영자가 공유 데이터 계약을 검토하기 쉽다.
- 생성 클라이언트와 별도 스키마 언어를 추가하지 않아 초기 모듈형 모놀리스의 도구 구성이 비교적 작다.
- `node-postgres`는 자체 호스팅 및 관리형 PostgreSQL 모두에 사용할 수 있어 호스팅 결정을 미룰 수 있다.

## 대안

### Prisma ORM과 Prisma Migrate

성숙한 클라이언트와 migration 흐름이 장점이다. 다만 별도 Prisma 스키마와 생성 클라이언트를 운영해야 하며, 이 프로젝트는 PostgreSQL 고유 제약과 실제 SQL 검토 비중이 높아 Drizzle을 선택했다.

### Kysely와 별도 migration 도구

SQL에 가까운 타입 안전 query builder라는 장점이 있다. 스키마 선언과 migration을 위한 추가 조합을 직접 정해야 하므로 초기 도구 수를 줄이는 목표에는 Drizzle보다 불리하다고 판단했다.

### SQL과 `node-postgres` 직접 사용

의존성이 가장 단순하지만 쿼리 결과와 insert/update 입력 타입을 반복 작성해야 한다. 도메인 모델이 확장될 때 타입 불일치 비용이 커질 수 있다.

## 결과

장점:

- 스키마와 쿼리에 TypeScript 타입을 공유한다.
- SQL migration을 직접 리뷰하고 Python 쪽 계약과 대조할 수 있다.
- PostgreSQL 기능을 필요한 범위에서 직접 사용할 수 있다.

단점:

- Drizzle 스키마와 생성 SQL을 함께 검토해야 한다.
- 라이브러리 버전 변화에 따라 migration 생성 결과가 달라질 수 있다.
- Python 수집기용 모델은 별도로 정의해야 하며 DB 제약과 통합 테스트로 일치 여부를 확인해야 한다.

## 운영 규칙

- schema 변경과 생성 migration은 같은 커밋에 포함한다.
- 생성된 migration을 사람이 검토하지 않은 채 적용하지 않는다.
- 운영 migration은 애플리케이션 요청 처리 중 자동 실행하지 않는다.
- 파괴적 변경은 데이터 이전, 롤백 또는 복구 계획을 먼저 작성한다.
- 의존성 보안 경고에 `npm audit fix --force`를 사용하지 않고 영향과 호환성을 검토한다.

## 재검토 조건

복잡한 쿼리에서 타입 또는 성능 문제가 반복되거나, migration 생성 안정성이 운영 요구를 충족하지 못하거나, 웹과 수집기의 스키마 소유권을 별도 패키지나 서비스로 분리해야 할 때 재검토한다.
