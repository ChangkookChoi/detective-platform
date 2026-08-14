# 탐정사무소 정보 플랫폼

서울·경기 지역의 탐정사무소 정보를 신뢰 가능한 출처와 함께 제공하고, 개인 고객이 지역과 업무 분야에 맞는 업체를 찾아 무료로 전화 연결할 수 있도록 돕는 서비스입니다. 초기에는 약 100개 업체를 다루는 정보 디렉터리로 시작하며, 검증된 수요를 바탕으로 상담·견적·업체 참여 기능을 갖춘 플랫폼으로 확장합니다.

> 이 서비스는 업체 정보를 비교·탐색하기 위한 정보 제공 서비스입니다. 특정 업체의 서비스 품질이나 조사 결과를 보증하지 않으며, 긴급 상황이나 범죄 피해는 경찰 등 관계 기관에 문의해야 합니다.

## 현재 단계

현재 저장소는 **핵심 MVP 기능 구현·출시 준비 단계**입니다. PostgreSQL 초기
스키마·migration·seed, 공개 업체 검색·상세·정정 요청, 신규·변경·정정
후보의 관리자 승인, 개인정보 최소화 일별 분석 집계와 정책 기반 Python
수집기를 구현했습니다. 지속형 로컬 개발 DB와 수집기 최소 권한 역할을
준비하고 공식 홈페이지 파일럿을 비공개 검수 후보로 적재한 뒤, 원문을
재확인한 교정 후보 한 건을 관리자 승인으로 공개했습니다. Clerk Hobby
Development의 실제 Google 로그인·관리자 검수와 감사 처리자 기록을
확인했으며, 자동 추출이 어려운 공식 출처의 수동 후보 등록 경로도
구현했습니다. 공식 사무소 5곳과 다음 8곳에 이어 신규 공식 후보 6건을
재검수해 오앤·진짜·디테일·한국사설탐정협회·VIP 5곳을 추가 공개했습니다.
같은 공식 HTML 안에서 주소 동 표기가 충돌한 고려 후보 1건은 보류했습니다.
이어 흥신소 굿탐정 화성 본사·굿파트너·한마음·
착한탐정 4곳을 최신 공식 원문으로 확인해 등록하고, 소재지·업무 분야·공식
출처를 검수해 모두 공개했습니다. 다음 공식 출처 묶음의 탐정사무소 DSI·
에이원흥신소·넘버원 탐정사무소 3곳도 실제 관리자 경로에서 소재지·업무 분야·
공식 출처를 검수해 공개해 당시 공개 업체는 26곳이 됐습니다.
다음 공식 출처 묶음의 PIS·전국명품탐정·루미노케이 서울본부·쌍용탐정사무소
4곳도 최신 최소 사실 필드와 업무 분야를 확인하고 사용자 위임 승인으로
공개했습니다. 2026-08-13 럭스탐정사무소 서울 본사도 최신 공식 원문과 업무
분야를 확인해 같은 관리자 경로로 승인했고, 최신 암호화 백업 성공과 전체
공개 그래프 일치를 확인한 뒤 Production Neon에도 31번째 업체를 증분
승격했습니다. 이어 해담 탐정사무소의 현재 공식 원문과 최소 사실 필드를
재확인해 서울 서초·업무 분야 2개로 승인했습니다. 지속형 개발 DB는 공개 업체
32곳이 됐습니다. 이어 정암 공인탐정·민간조사 서현·베테랑·더PIA 네 곳의
현재 공식 원문과 접근 정책을 확인하고 실제 관리자 경로로 승인해 지속형 개발
DB는 공개 업체 36곳이었고, 영구 배치 사전검증·Clerk 관리자 실행 절차로 청명·
정보그룹 정탐·탐정수일·라이프온·고민해결 5곳을 추가했습니다. 이어 자동
중복 검사의 한국 전화 국가번호·주소 우편번호 정규화를 보강하고 코난·리더스·
대한특수탐정 더원 수원지점·서울 종로 광역센터 4곳을 같은 영구 배치 절차로
공개했습니다. 이어 공식 지점별 주소를 직접 확인한 디테일탐정사무소 경기지사·
대한특수탐정 더원 서울서초지점과 픽서컴퍼니를 일괄 승인해 현재 개발 DB는
48곳입니다. 공유 공식 URL·대표번호는 명시적으로 지점을 구분한 경우에만
허용하고 주소·slug 중복은 계속 차단합니다.
Production 31곳 전체의 최신 암호화 백업과 14일 보존을 확인한 뒤
해담 1곳을 같은 증분 승격 절차로 반영해 Production Neon도 32곳이며, 무변경
재실행과 실제 Production 상세 HTTP 200을 확인했습니다. 개발 DB의 후속 신규
16곳은 사용자 요청에 따라 Production에 아직 승격하지 않았습니다.
충남 소재 업체와 공식 도메인 내부 운영 주체가 충돌하는 업체는 등록하지
않았습니다. 추가 비용 없는 Vercel Hobby 프로젝트와 Neon Free Singapore
출시 리허설 DB를 만들고 migration·seed를 적용했습니다. 최소 권한 runtime과
read-only backup 역할을 분리하고 공개 30곳만 빈 운영 DB로 원자적으로
승격했으며 Vercel Production·GitHub Actions에 역할별 연결 정보를 저장했습니다.
이후 기존 공개 그래프를 변경하지 않는 증분 명령으로 럭스와 해담을 차례로
원자 반영하고 32곳 기준 무변경 재실행을 통과했습니다.
암호화 백업 recipient·identity도 GitHub variable·secret에 분리 저장했습니다.
실제 Neon 암호화 artifact를 빈 PostgreSQL 17에 복원해 공개 업체 30곳과
schema·migration·출처 무결성, RPO·RTO 목표를 확인했습니다.
Vercel Production 리허설 배포는 만들었지만 Clerk Production 도메인·live 키가
없어 아직 공개 출시 상태가 아닙니다.
도메인 확보 뒤의 설정·검증 순서는
[Production 출시 절차](docs/operations/PRODUCTION_RELEASE.md)를 따릅니다.
최신 진행 상황은
[docs/STATUS.md](docs/STATUS.md)를 기준으로 확인합니다.

## MVP

- 서울·경기 탐정사무소 약 100곳
- 지역 및 업무 분야별 탐색
- 업체 기본 정보, 출처 URL, 최종 확인일 제공
- 전화번호 노출 및 무료 전화 연결 버튼
- 업체별 상세 조회와 전화 버튼 클릭 집계
- 공개 업체 정보 오류 신고와 관리자 정정 검수
- Python 수집기의 후보 정보 수집 및 변경 감지
- 관리자의 검수·승인을 거친 정보만 공개
- 광고 및 업체용 강화 상품을 초기 수익 모델로 검증

MVP에는 사용자 회원가입, 사건 접수, 채팅, 결제, 후기, 별점, 업체 순위, 전화 연결 과금, 통화 내용·녹취 저장이 포함되지 않습니다. 상세 범위는 [MVP_SCOPE.md](docs/product/MVP_SCOPE.md)를 참고합니다.

## 저장소 구조

```text
.
├── apps/web/              # Next.js App Router 공개 웹·관리자·초기 API
├── services/collector/    # Python 3.13 + uv 기반 수집·변경 감지
├── docs/
│   ├── product/           # PRD, MVP 범위, 사용자 흐름
│   ├── architecture/      # 시스템, 데이터, API 설계
│   ├── operations/        # 수집, 검증, SEO, 보안 정책
│   └── decisions/         # Architecture Decision Record
├── infra/                 # 로컬·운영 인프라 설정(도입 시)
└── scripts/               # 개발·운영 보조 스크립트
```

## 기술 방향

- 웹·관리자·초기 API: Next.js App Router 모듈형 모놀리스
- 데이터베이스: PostgreSQL
- 수집기: Python 3.13, `uv`
- 렌더링: 공개 핵심 콘텐츠는 서버 생성 HTML에 포함
- 검색: 초기에는 PostgreSQL의 필터·인덱스로 해결
- 공개 원칙: 자동 수집 결과는 관리자 승인 전까지 비공개

세부 내용은 [ARCHITECTURE.md](docs/architecture/ARCHITECTURE.md)와 [ADR](docs/decisions/)에서 관리합니다.

## 로컬 실행

### 웹

```bash
cd apps/web
npm install
npm run dev
```

검증:

```bash
cd apps/web
npm run auth:validate-config:self-test
npm run lint
npm run build
npm run test:e2e
```

실제 Clerk 키와 관리자 사용자 ID를 로컬 비밀에 설정한 뒤에는 환경 조합을 값 노출 없이 확인합니다.

```bash
cd apps/web
npm run auth:validate-config -- --environment=development
```

PR과 `main` push에서는 [Quality checks](.github/workflows/quality-checks.yml)가
Production 비밀 없이 Node.js 24 웹 인증·DB 설정 self-test, lint와 webpack
production build를 실행합니다. 별도 Python 3.13 job은 lockfile로 수집기 의존성을
설치하고 compileall과 단위 테스트를 실행합니다. 실제 Clerk·Neon·브라우저 E2E와
Production 배포는 이 기본 CI에 포함하지 않습니다.
`main`은 PR 경유와 두 quality job 성공·대화 해결을 요구하며 force-push와 branch
삭제를 허용하지 않습니다. 1인 개발을 막지 않도록 승인 인원은 0명이고 repository
관리자는 장애 대응 시 규칙을 우회할 수 있습니다.

PostgreSQL 17 이상이 설치된 환경에서는 저장소 루트에서 임시 DB 통합 검증을 실행할 수 있습니다.

```bash
./scripts/verify-local-postgres.sh
./scripts/verify-web-e2e-postgres.sh
./scripts/verify-admin-e2e-postgres.sh
./scripts/verify-postgres-backup.sh
./scripts/verify-public-data-promotion-postgres.sh
```

Vercel 배포 보호를 해제하지 않고 Production 공개·SEO·인증 경계를 확인할 때는
[Production 출시 절차](docs/operations/PRODUCTION_RELEASE.md)의 smoke 스크립트를
사용합니다.

```bash
./scripts/verify-vercel-production-smoke.sh \
  --deployment=https://deployment.example.vercel.app \
  --auth-mode=unconfigured
```

실행 사이에 데이터를 유지하는 로컬 개발 DB는 별도 스크립트로 준비하고 제어합니다.

```bash
./scripts/local-postgres.sh setup
./scripts/local-postgres.sh status
./scripts/local-postgres.sh stop
```

연결 역할과 재시작 절차는 [로컬 PostgreSQL 운영 문서](docs/operations/LOCAL_DATABASE.md)를 따릅니다. 백업·복구 목표와 리허설은 [데이터베이스 백업·복구 문서](docs/operations/DATABASE_BACKUP.md)를 따릅니다.

### 수집기

```bash
cd services/collector
uv sync
uv run python main.py validate-config --config sources.example.toml
uv run python main.py validate-config --config sources.toml
```

실제 출처 등록과 실행은 [수집기 운영 절차](docs/operations/COLLECTOR_RUNBOOK.md)를 따릅니다. 비밀값은 커밋하지 않고 필요한 키는 `.env.example`에 이름과 설명만 추가합니다.

사전검증된 여러 공식 후보는 관리자 `/admin/reviews/batch`에서 manifest와
preflight를 한 번 제출하고 정상 건만 선택해 일괄 승인할 수 있습니다. 이
경로도 업체별 검수 항목·감사 이력·출처 근거를 남기며 승인 전에는 공개하지
않습니다. 상세 절차는 [업체 데이터 확대](docs/operations/OFFICE_DATA_EXPANSION.md)를
따릅니다.

## 문서 안내

- 제품: [PRD](docs/product/PRD.md), [MVP 범위](docs/product/MVP_SCOPE.md), [사용자 흐름](docs/product/USER_FLOWS.md)
- 설계: [아키텍처](docs/architecture/ARCHITECTURE.md), [데이터 모델](docs/architecture/DATA_MODEL.md), [API 규칙](docs/architecture/API_CONVENTIONS.md)
- 운영: [수집 정책](docs/operations/DATA_COLLECTION_POLICY.md), [출처 등록부](docs/operations/SOURCE_REGISTRY.md), [업체 데이터 확대](docs/operations/OFFICE_DATA_EXPANSION.md), [수집기 절차](docs/operations/COLLECTOR_RUNBOOK.md), [검증 정책](docs/operations/DATA_VERIFICATION_POLICY.md), [관리자 인증](docs/operations/ADMIN_AUTH.md), [최소 분석](docs/operations/ANALYTICS.md), [지역 seed](docs/operations/REGION_SEED.md), [로컬 PostgreSQL](docs/operations/LOCAL_DATABASE.md), [운영 PostgreSQL 준비](docs/operations/PRODUCTION_DATABASE.md), [데이터베이스 백업·복구](docs/operations/DATABASE_BACKUP.md), [SEO](docs/operations/SEO_POLICY.md), [보안](docs/operations/SECURITY.md)
- 결정: [ADR-0001](docs/decisions/ADR-0001-monorepo.md), [ADR-0002](docs/decisions/ADR-0002-nextjs-monolith.md), [ADR-0003](docs/decisions/ADR-0003-postgresql.md), [ADR-0004](docs/decisions/ADR-0004-drizzle-orm.md), [ADR-0005](docs/decisions/ADR-0005-clerk-admin-auth.md), [ADR-0006](docs/decisions/ADR-0006-privacy-minimal-analytics.md), [ADR-0007](docs/decisions/ADR-0007-python-collector-foundation.md), [ADR-0008](docs/decisions/ADR-0008-managed-postgres-prelaunch.md), [ADR-0009](docs/decisions/ADR-0009-encrypted-logical-backups.md)

## 작업 원칙

작업 전 루트 [AGENTS.md](AGENTS.md)를 읽고 문서에 정의된 범위와 결정 사항을 따릅니다. 구조나 핵심 기술 선택을 바꿀 때는 구현보다 ADR을 먼저 작성합니다.
