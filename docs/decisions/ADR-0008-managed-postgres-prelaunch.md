# ADR-0008: 출시 리허설용 관리형 PostgreSQL 후보로 Neon Free 사용

- 상태: 제안
- 제안일: 2026-08-11

## 맥락

웹과 수집기는 PostgreSQL 17, Drizzle SQL migration과 공급자 중립
`DATABASE_URL` 계약을 사용한다. 실제 배포 전에는 서버리스 웹 연결 풀링,
전송 구간 암호화, migration과 런타임 자격 증명 분리, 백업·복구 목표를
충족하는 관리형 공급자가 필요하다.

현재 사용자는 추가 비용을 발생시키지 않기를 원한다. 따라서 비용 0원으로
배포·migration·복구 리허설을 시작할 수 있는 경로와, 공개 운영 전에 반드시
해결해야 하는 백업 제한을 분리해 판단한다.

## 제안

Vercel Marketplace의 Neon Free를 **출시 리허설용 후보**로 사용한다.
이 제안은 실제 리소스 생성이나 공개 운영 DB 확정을 뜻하지 않는다.

- 기존 Drizzle과 `node-postgres`를 유지하며 Neon 전용 드라이버로 교체하지 않는다.
- 웹 런타임은 PgBouncer pooled URL과 최소 권한 역할을 사용한다.
- migration·seed·배포 검증은 direct URL과 별도 소유자 역할을 사용한다.
- 모든 연결 URL은 TLS를 요구하고 비밀 환경변수로만 주입한다.
- Vercel Function과 DB는 같은 공급자 리전을 우선하며, Neon Singapore를
  선택하면 Vercel의 단일 Function 리전도 `sin1`로 맞춘다.
- Preview, Production, 수집기 자격 증명을 서로 공유하지 않는다.

Neon Free의 6시간 복원 이력은 장애 직후 복구 리허설에는 유용하지만,
[백업·복구 정책](../operations/DATABASE_BACKUP.md)의 자동 일일 백업 14일
보존 조건을 충족하지 않는다. 따라서 다음 중 하나를 검증하기 전에는 이
제안을 공개 운영 DB 결정으로 승격하지 않는다.

1. 정책을 충족하는 유료 보존 구간을 선택한다.
2. 독립 저장소의 암호화된 일일 논리 백업을 자동화하고 14일 이상 보존하며
   실제 복원으로 RPO 24시간·RTO 4시간을 확인한다.

## 근거

- Vercel Marketplace가 Neon 리소스 생성과 프로젝트 연결을 지원한다.
- Neon Free는 0.5GB, 프로젝트별 월 100 CU-hour, pooled connection과 6시간
  복원 이력을 제공해 약 100개 업체의 리허설 규모에 충분하다.
- Neon의 pooled URL과 direct URL을 분리할 수 있어 서버리스 런타임과
  migration의 연결 수명 차이를 표현할 수 있다.
- Supabase Free도 0.5GB PostgreSQL을 제공하지만 자동 백업과 PITR가 없고
  일주일 비활성 시 프로젝트가 중지돼 현재 리허설 기본 후보로는 불리하다.

가격·할당량은 변경될 수 있으므로 리소스 생성 직전에
[Neon 요금표](https://neon.com/pricing),
[Vercel Marketplace Neon](https://vercel.com/marketplace/neon),
[Supabase 요금표](https://supabase.com/pricing)를 다시 확인한다.

## 결과

장점:

- 비용 없이 실제 관리형 PostgreSQL 연결·migration·배포 리허설을 시작할 수 있다.
- 기존 데이터 계층과 migration을 바꾸지 않는다.
- 런타임 풀링과 migration direct 연결을 명확히 분리한다.

단점:

- Free compute는 비활성 5분 뒤 scale-to-zero가 고정되어 첫 요청 지연이 생길 수 있다.
- 무료 복원 이력만으로 현재 백업 보존 정책을 충족하지 않는다.
- Neon Singapore와 한국 사용자 사이의 실제 지연을 배포 후 측정해야 한다.

## 대안

### Supabase Free

표준 PostgreSQL과 pooler를 제공한다. 다만 무료 플랜은 자동 백업·PITR가 없고
비활성 프로젝트 중지 조건이 있어 보류한다. 향후 다른 Supabase 기능이 실제로
필요해지면 다시 비교한다.

### 로컬 PostgreSQL을 외부 공개

비용은 낮을 수 있지만 가용성, 네트워크 보안, 인증서, 백업과 장애 대응을
직접 운영해야 하므로 제외한다.

### 즉시 유료 관리형 PostgreSQL 사용

백업·지원 조건은 개선되지만 현재 비용 제약과 맞지 않는다. 공개 출시 시점에
외부 논리 백업보다 운영 비용이 낮다고 판단되면 다시 선택한다.

## 승인 조건

- 사용자가 Neon Free 리소스 생성과 Vercel 프로젝트 연결 범위를 승인한다.
- 실제 리전에 대해 웹→DB 지연과 scale-to-zero 첫 요청을 측정한다.
- 최소 권한 런타임 역할과 별도 migration 자격 증명 검증을 통과한다.
- 공개 출시 전 14일 보존 백업과 실제 복원 경로를 확정한다.
